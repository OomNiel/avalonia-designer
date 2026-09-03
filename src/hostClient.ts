import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import WebSocket from 'ws';

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
                if (msg.error) p.reject(new Error(msg.error));
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

    request(type: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
        return new Promise((resolve, reject) => {
            if (!this.ws || !this.connected) {
                reject(new Error('Previewer host is not connected.'));
                return;
            }
            const id = this.nextId++;
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, type, ...payload }));
        });
    }

    async render(xaml: string, width: number, height: number, projectPath?: string, theme?: string): Promise<FrameResult> {
        return (await this.request('render', { xaml, width, height, projectPath, theme })) as unknown as FrameResult;
    }

    async snippet(tag: string): Promise<SnippetResult> {
        return (await this.request('snippet', { tag })) as unknown as SnippetResult;
    }

    dispose(): void {
        this.ws?.close();
        this.connected = false;
    }
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
        await client.connect();
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
            await runCmd('dotnet', ['build', project, '-c', cfg]);
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
        } catch { return true; }
        return false;
    }

    dispose(): void {
        this.proc?.kill();
        this.client?.dispose();
    }
}

function freePort(): Promise<number> {
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

function runCmd(cmd: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = cp.spawn(cmd, args, { stdio: 'inherit' });
        child.on('error', reject);
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`))));
    });
}
