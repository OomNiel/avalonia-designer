import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import WebSocket from 'ws';
import { logError } from './logger';

/** A draggable shape-editing point (Line ends / Arc centre + ends), in DESIGN coords. */
export interface ShapeHandle {
    kind: 'start' | 'end' | 'centre';
    x: number;
    y: number;
}

export interface HostControlInfo {
    name: string | null;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    /** Direct parent control name (unnamed parents report null so nested children aren't treated as grid children). */
    parent?: string | null;
    /** Effective (theme-resolved) property values reported by the host for the Properties panel. */
    values?: Record<string, string>;
    /** Drag-point handles for a Line (2 ends) or Arc (centre + 2 ends); absent for other controls. */
    handles?: ShapeHandle[];
    /** Paint-order index (ZIndex attribute; 0 when unset) — used by the webview's hit-testing so
     *  the topmost control at a point is selected (a ZIndex="-1" shape never steals a click). */
    zIndex?: number;
}

export interface GridCells {
    /** Column x-boundaries in design coords, length columns+1. */
    v: number[];
    /** Row y-boundaries in design coords, length rows+1. */
    h: number[];
}

export interface FrameResult {
    png: string;
    width: number;
    height: number;
    controls: HostControlInfo[];
    /** Per named Grid: pixel boundaries of its rows/columns (used to size dropped Images to their cell). */
    gridCells?: Record<string, GridCells>;
    error?: string;
}

export interface SnippetResult {
    tag: string;
    name: string;
    xaml: string;
}

/** A column of a user SQLite table (design-time schema inspection). */
export interface SqliteColumnInfo {
    name: string;
    type: string;
    notNull: boolean;
    isPk: boolean;
}

/** A user SQLite table (design-time schema inspection). */
export interface SqliteTableInfo {
    name: string;
    columns: SqliteColumnInfo[];
}

/** Results of a design-time SELECT preview against the user's SQLite file. */
export interface SqliteResult {
    columns: string[];
    rows: (string | number | boolean | null)[][];
}

interface Pending {
    resolve: (v: Record<string, unknown>) => void;
    reject: (e: Error) => void;
}

/** WebSocket client for the C# PreviewerHost (renders XAML -> PNG + control bounds). */
export class HostClient {
    private ws?: WebSocket;
    private nextId = 1;
    private pending = new Map<number, Pending>();
    connected = false;

    constructor(private readonly port: number) { }

    async connect(): Promise<void> {
        let lastErr: Error | undefined;
        for (let attempt = 0; attempt < 40; attempt++) {
            try {
                await this.tryConnectOnce();
                return;
            } catch (e) {
                lastErr = e as Error;
                await new Promise((r) => setTimeout(r, 250));
            }
        }
        throw lastErr ?? new Error('Could not connect to the previewer host.');
    }

    private tryConnectOnce(): Promise<void> {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://127.0.0.1:${this.port}`);
            const t = setTimeout(() => { ws.terminate(); reject(new Error('connect timeout')); }, 2500);
            ws.on('open', () => {
                clearTimeout(t);
                this.ws = ws;
                this.connected = true;
                this.wire(ws);
                resolve();
            });
            ws.on('error', (e) => {
                clearTimeout(t);
                reject(e instanceof Error ? e : new Error(String(e)));
            });
        });
    }

    private wire(ws: WebSocket): void {
        ws.on('message', (data) => {
            let msg: { id?: number; error?: string } & Record<string, unknown>;
            try {
                msg = JSON.parse(data.toString());
            } catch {
                return;
            }
            if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
                const p = this.pending.get(msg.id)!;
                this.pending.delete(msg.id);
                if (msg.error) {
                    // Log it in OUR channel (View → Output → "Grumpy's WYSIWYG Designer") first: an
                    // unhandled rejection would otherwise dump a raw [Extension Host] stack into
                    // the shared output pane instead of a readable one-line error.
                    logError(`PreviewerHost: ${String(msg.error)}`);
                    p.reject(new Error(msg.error));
                }
                else p.resolve(msg);
            }
        });
        ws.on('close', () => {
            this.connected = false;
            this.rejectAll();
        });
        ws.on('error', () => {
            this.connected = false;
        });
    }

    private rejectAll(): void {
        for (const [, p] of this.pending) p.reject(new Error('Previewer host connection closed.'));
        this.pending.clear();
    }

    /** How long a request may sit unanswered before it is failed. A render takes a few ms, so 30 s
     *  means something is genuinely wrong (host wedged, killed, or the socket closed mid-send). */
    private static readonly REQUEST_TIMEOUT_MS = 30000;

    request(type: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
        return new Promise((resolve, reject) => {
            if (!this.ws || !this.connected) {
                reject(new Error('Previewer host is not connected.'));
                return;
            }
            const id = this.nextId++;
            // Without this the promise could stay pending FOREVER: if the socket closed between the
            // `connected` check and the send, `rejectAll` had already run (it only fires on the
            // socket's `close`), so nothing ever settled it. The designer then sat on "Starting
            // previewer host…" with no error, leaking one `pending` entry per attempt.
            const timer = setTimeout(() => {
                if (this.pending.delete(id)) {
                    reject(new Error(`Previewer host did not answer "${type}" within ${HostClient.REQUEST_TIMEOUT_MS / 1000} s.`));
                }
            }, HostClient.REQUEST_TIMEOUT_MS);
            this.pending.set(id, {
                resolve: (v) => { clearTimeout(timer); resolve(v); },
                reject: (e) => { clearTimeout(timer); reject(e); }
            });
            try {
                this.ws.send(JSON.stringify({ id, type, ...payload }));
            } catch (e) {
                clearTimeout(timer);
                this.pending.delete(id);
                reject(e instanceof Error ? e : new Error(String(e)));
            }
        });
    }

    async render(xaml: string, width: number, height: number, projectPath?: string, theme?: string, grids?: { control: string; columns: string[]; rows: (string | number | boolean | null)[][] }[]): Promise<FrameResult> {
        const payload: Record<string, unknown> = { xaml, width, height, projectPath, theme };
        if (grids && grids.length) payload.grids = grids;
        return (await this.request('render', payload)) as unknown as FrameResult;
    }

    async snippet(tag: string): Promise<SnippetResult> {
        return (await this.request('snippet', { tag })) as unknown as SnippetResult;
    }

    /** System font family names seen by Avalonia in the host (for the font pickers). */
    async fonts(): Promise<string[]> {
        const r = await this.request('fonts');
        const f = r.fonts;
        return Array.isArray(f) ? f.map((x) => String(x)).sort((a, b) => a.localeCompare(b)) : [];
    }

    /** Design-time SQLite schema inspection (tables + their columns) for "Import from SQLite…". */
    async sqliteTables(file: string): Promise<SqliteTableInfo[]> {
        const r = await this.request('sqlite', { file, op: 'tables' });
        return Array.isArray(r.tables) ? (r.tables as unknown as SqliteTableInfo[]) : [];
    }

    /**
     * The PAGE names of an .xlsx workbook, for the Data Selector's page dropdown. `error` is set when
     * the file could not be read, so the editor can say why instead of offering an empty list.
     */
    async sheets(file: string): Promise<{ sheets: string[]; error: string | null }> {
        const r = await this.request('sheets', { file });
        return {
            sheets: Array.isArray(r.sheets) ? r.sheets.map(String) : [],
            error: r.error ? String(r.error) : null
        };
    }

    /**
     * The USED RANGE of one PAGE of an .xlsx workbook — its last row and its last column as a letter
     * (`"CX"`). A 3-D chart reads one spreadsheet column per slice, so this is what says how many slices
     * a page holds; `error` is set when the file or the page could not be read.
     */
    async sheetShape(file: string, sheet: string): Promise<{ rows: number; columns: string; error: string | null }> {
        const r = await this.request('sheetShape', { file, sheet });
        // An old host answers an unknown verb with a plain error, and the cure is a REBUILD (the extension
        // ships the host's source; the binary that answers is the one built on this machine), so say that
        // rather than "the page could not be measured".
        const error = r.error
            ? String(r.error)
            : r.type !== 'sheetShapeResult'
                ? 'The previewer host is too old to measure a page — rebuild it (dotnet build host/PreviewerHost.csproj).'
                : null;
        return {
            rows: Number(r.rows ?? 0) || 0,
            columns: r.columns ? String(r.columns) : '',
            error
        };
    }

    /** Runs a read-only SELECT against the user's SQLite file for the design-time data preview. */
    async sqliteQuery(file: string, sql: string, limit = 200): Promise<SqliteResult> {
        const r = await this.request('sqlite', { file, op: 'query', sql, limit });
        return {
            columns: Array.isArray(r.columns) ? r.columns.map(String) : [],
            rows: Array.isArray(r.rows) ? (r.rows as unknown as (string | number | boolean | null)[][]) : []
        };
    }

    dispose(): void {
        this.ws?.close();
        this.connected = false;
    }
}

/** Shown when the machine has no `dotnet` on PATH: the preview host is built with the .NET SDK, so
 *  without it the designer cannot render anything. Written for a user who has just installed the
 *  extension from a marketplace and has no idea a renderer host is involved. */
export const DOTNET_SDK_MISSING_MESSAGE =
    'The .NET SDK was not found on this machine, so the Avalonia designer cannot build its preview host. '
    + 'Install the .NET SDK (https://dotnet.microsoft.com/download) and reload the window.';

/** True for the error Node throws when the executable itself does not exist (ENOENT on spawn). */
export function isMissingExecutable(e: unknown): boolean {
    return (e as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

/** Manages the PreviewerHost process lifecycle (spawn on demand, auto-reconnect). */
export class PreviewerHostManager implements vscode.Disposable {
    private client?: HostClient;
    private proc?: cp.ChildProcess;
    private connecting?: Promise<HostClient>;

    constructor(private readonly context: vscode.ExtensionContext) { }

    async getClient(): Promise<HostClient> {
        if (this.client?.connected) return this.client;
        if (this.connecting) return this.connecting;
        this.connecting = this.start().finally(() => {
            this.connecting = undefined;
        });
        return this.connecting;
    }

    private async start(): Promise<HostClient> {
        const bin = await this.findOrBuildHost();
        if (!bin) throw new Error('Previewer Host binary not found and could not be built. See PROBLEMS for build output.');
        const port = await freePort();
        const child = cp.spawn(bin, ['--port', String(port)], { cwd: path.dirname(bin) });
        this.proc = child;
        child.stdout?.on('data', (d: Buffer) => console.log('[PreviewerHost]', d.toString().trim()));
        child.stderr?.on('data', (d: Buffer) => console.error('[PreviewerHost]', d.toString().trim()));
        child.on('exit', () => {
            this.proc = undefined;
            this.client = undefined;
        });
        const client = new HostClient(port);
        try {
            await client.connect();
        } catch (e) {
            // `connect()` retries for ~10 s and then throws. The spawned child used to be left behind
            // as an orphan holding its port (this repo has already been bitten by exactly that leak).
            try { child.kill(); } catch { /* already gone */ }
            this.proc = undefined;
            throw e;
        }
        this.client = client;
        return client;
    }

    private async findOrBuildHost(): Promise<string | undefined> {
        const cfg = 'Debug';
        const tfm = 'net8.0';
        const exe = process.platform === 'win32' ? 'PreviewerHost.exe' : 'PreviewerHost';
        const binDir = path.join(this.context.extensionUri.fsPath, 'host', 'bin', cfg, tfm);
        const bin = path.join(binDir, exe);
        const project = path.join(this.context.extensionUri.fsPath, 'host', 'PreviewerHost.csproj');
        // Rebuild if the binary is missing OR any host source file is newer than it,
        // so host fixes always reach the installed copy (not just the dev workspace).
        if (!fs.existsSync(bin) || this.hostSourceIsNewer(bin, path.dirname(project))) {
            try {
                await runCmd('dotnet', ['build', project, '-c', cfg]);
            } catch (e) {
                // No `dotnet` on PATH is by far the most common first-run failure, and the raw error
                // ('spawn dotnet ENOENT') tells a user nothing. Name the missing piece instead.
                if (isMissingExecutable(e)) throw new Error(DOTNET_SDK_MISSING_MESSAGE);
                throw e;
            }
        }
        return fs.existsSync(bin) ? bin : undefined;
    }

    /** True if any .cs/.csproj under hostDir is newer than the built binary. */
    private hostSourceIsNewer(bin: string, hostDir: string): boolean {
        let binTime = 0;
        try { binTime = fs.statSync(bin).mtimeMs; } catch { return true; }
        try {
            for (const f of fs.readdirSync(hostDir)) {
                if (!/\.(cs|csproj)$/i.test(f)) continue;
                if (fs.statSync(path.join(hostDir, f)).mtimeMs > binTime) return true;
            }
            // The host COMPILES shared helpers from resources/ via <Compile Link> entries
            // (outside hostDir) — watch them too, or a helper fix would never trigger the
            // auto-rebuild.
            for (const linked of ['ExifImageLoader.cs', 'GrumpyPanel.cs', 'PathPicker.cs', 'GrumpyCharts.cs', 'GrumpySheet.cs']) {
                const p = path.join(hostDir, '..', 'resources', linked);
                if (fs.existsSync(p) && fs.statSync(p).mtimeMs > binTime) return true;
            }
        } catch { return true; }
        return false;
    }

    dispose(): void {
        // Kill the child BEFORE dropping the socket: the host exits on disconnect anyway, but
        // an explicit SIGTERM is immediate — and without it every window reload leaked one
        // PreviewerHost process (~25 MB each) that was reparented to systemd and never reaped.
        const proc = this.proc;
        this.proc = undefined;
        this.client?.dispose();
        if (proc && !proc.killed) {
            try { proc.kill(); } catch { /* already gone */ }
        }
    }
}

export function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.once('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const addr = srv.address();
            const port = typeof addr === 'object' && addr ? addr.port : 0;
            srv.close(() => resolve(port));
        });
    });
}

export function runCmd(cmd: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = cp.spawn(cmd, args, { stdio: 'inherit' });
        child.on('error', reject);
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`))));
    });
}
