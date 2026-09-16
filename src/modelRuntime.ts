/* Local AI assist — the bundled runtime: build it, start it, feed it a model.
 *
 * The developer this feature is for has no Copilot, no LM Studio and no Ollama, so the extension has to
 * bring its own runtime. Two facts shape everything here (NOTES.md §92):
 *
 *  1. The runtime is *source*, not a binary. The extension ships `host/ModelHost/` and builds it with
 *     the .NET SDK on the user's machine — exactly what it already does for the designer's PreviewerHost
 *     — so NuGet resolves the right llama.cpp backend for the current platform and ONE VSIX serves Linux,
 *     Windows and macOS on x64 and arm64. A prebuilt native runtime would instead mean one VSIX per
 *     platform *and* a rebuild every time VS Code's Node ABI moves.
 *  2. The weights are *not* shipped. A Q4 3B model is 2 GB and the 7B is 4.4 GB — no VSIX could carry
 *     that. They are downloaded once, with progress, into the extension's global storage, and verified
 *     against the SHA-256 Hugging Face publishes for the exact file.
 *
 * Everything VS Code-specific lives here (processes, files, downloads, prompts); the arithmetic — which
 * model, which arguments, what a health payload means — lives in `modelSpecs.ts` where the tests can
 * reach it without a running server.
 */

import * as cp from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { assessHardware, readHardwareFacts, type AssistantConfig } from './assistant';
import { freePort, isMissingExecutable, runCmd } from './hostClient';
import { log, logError } from './logger';
import {
    MODEL_FOLDER,
    MODEL_SPECS,
    READY_PREFIX,
    canRunSpec,
    defaultThreads,
    formatBytes,
    isGgufPath,
    parseHealth,
    shortHash,
    sidecarArgs,
    sidecarBaseUrl,
    sidecarHealthUrl,
    specByFileName,
    type ModelSpec
} from './modelSpecs';
import { downloadProgressText, resumeFromBytes } from './localModels';
import { configView } from './settingWrite';

const SETTINGS = 'avaloniaDesigner.assistant';

/** Shown when the runtime must be built but this machine has no `dotnet` on PATH. */
export const RUNTIME_NEEDS_DOTNET =
    'The bundled model runtime is a small C# program that is built with the .NET SDK the first time it is '
    + 'used. Install the .NET SDK (https://dotnet.microsoft.com/download) and reload the window.';

/** How long a cold build + model load may take before the feature gives up with a message. */
const LOAD_TIMEOUT_MS = 10 * 60 * 1000;

// ---------------- building and running the sidecar ----------------

function sidecarPaths(context: vscode.ExtensionContext): { bin: string; project: string; dir: string } {
    const dir = path.join(context.extensionUri.fsPath, 'host', 'ModelHost');
    return {
        dir,
        project: path.join(dir, 'ModelHost.csproj'),
        bin: path.join(dir, 'bin', 'Debug', 'net8.0', process.platform === 'win32' ? 'ModelHost.exe' : 'ModelHost')
    };
}

/** True if any sidecar source is newer than the built binary (same rule as the previewer host). */
function sourcesNewer(bin: string, dir: string): boolean {
    let binTime = 0;
    try {
        binTime = fs.statSync(bin).mtimeMs;
    } catch {
        return true;
    }
    try {
        for (const f of fs.readdirSync(dir)) {
            if (!/\.(cs|csproj)$/i.test(f)) continue;
            if (fs.statSync(path.join(dir, f)).mtimeMs > binTime) return true;
        }
    } catch {
        return true;
    }
    return false;
}

/**
 * Builds the sidecar with the .NET SDK when it is missing or out of date. The first build also restores
 * LLamaSharp from nuget.org (~100 MB into the user's NuGet cache), which is why a failure here is
 * reported as a network/story problem rather than an exit code.
 */
export async function buildSidecar(context: vscode.ExtensionContext, options: { force?: boolean } = {}): Promise<string> {
    const { bin, project, dir } = sidecarPaths(context);
    if (!options.force && fs.existsSync(bin) && !sourcesNewer(bin, dir)) return bin;
    try {
        await runCmd('dotnet', ['build', project, '-c', 'Debug']);
    } catch (e) {
        if (isMissingExecutable(e)) throw new Error(RUNTIME_NEEDS_DOTNET);
        throw new Error(
            `${e instanceof Error ? e.message : String(e)} — the model runtime could not be built. The first `
            + 'build downloads LLamaSharp from nuget.org, so check the connection and the output in the '
            + 'terminal, then try again.'
        );
    }
    if (!fs.existsSync(bin)) throw new Error('The model runtime was built but its program was not found.');
    return bin;
}

interface RunningServer {
    endpoint: string;
    port: number;
}

/** One server per window: it holds gigabytes of weights, so it must not be started twice. */
class ModelServer {
    private proc?: cp.ChildProcess;
    private endpoint?: string;
    private starting?: Promise<string>;

    constructor(private readonly context: vscode.ExtensionContext) { }

    current(): RunningServer | undefined {
        if (!this.endpoint || !this.proc || this.proc.exitCode !== null) return undefined;
        return { endpoint: this.endpoint, port: Number(new URL(this.endpoint).port) };
    }

    async ensureStarted(
        cfg: AssistantConfig,
        progress?: vscode.Progress<{ message?: string }>
    ): Promise<string> {
        const running = this.current();
        if (running) return running.endpoint;
        if (!this.starting) {
            this.starting = this.start(cfg, progress).finally(() => {
                this.starting = undefined;
            });
        }
        return this.starting;
    }

    private async start(cfg: AssistantConfig, progress?: vscode.Progress<{ message?: string }>): Promise<string> {
        const modelPath = resolveModelPath(this.context, cfg);
        if (!modelPath) {
            throw new Error('No local model yet — run "AI: Set Up Local Model…" first.');
        }
        if (!fs.existsSync(modelPath)) {
            throw new Error(`The model file is missing: ${modelPath}`);
        }

        progress?.report({ message: 'building the model runtime (first time only)…' });
        const bin = await buildSidecar(this.context);
        const port = await freePort();
        const threads = cfg.threads > 0 ? cfg.threads : defaultThreads(os.cpus().length);
        const child = cp.spawn(bin, sidecarArgs({
            modelPath,
            port,
            threads,
            contextSize: cfg.contextSize,
            gpuLayers: cfg.gpuLayers
        }), { cwd: path.dirname(bin) });
        this.proc = child;

        let stdout = '';
        child.stdout?.on('data', (d: Buffer) => {
            stdout += d.toString();
            rememberSidecar(d);
            // Straight into View → Output → "Avalonia Designer": the first thing to look at when the
            // runtime will not start, and the only place the model's own load messages appear.
            log(`ModelHost: ${d.toString().trim()}`);
        });
        child.stderr?.on('data', (d: Buffer) => {
            rememberSidecar(d);
            logError(`ModelHost: ${d.toString().trim()}`);
        });

        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('The model runtime did not start within 60 s.')), 60000);
            child.on('error', (e) => {
                clearTimeout(timer);
                reject(new Error(isMissingExecutable(e) ? RUNTIME_NEEDS_DOTNET : e.message));
            });
            child.on('exit', (code, signal) => {
                clearTimeout(timer);
                reject(new Error(`The model runtime stopped (${signal ?? `exit ${code}`}) before it was ready.`));
            });
            child.stdout?.on('data', () => {
                if (!stdout.includes(READY_PREFIX)) return;
                clearTimeout(timer);
                resolve();
            });
        });

        this.endpoint = sidecarBaseUrl(port);
        await this.waitForLoad(port, child, progress);
        return this.endpoint;
    }

    /** `/health` answers immediately; `loaded` only once the weights are in RAM. */
    private async waitForLoad(
        port: number,
        child: cp.ChildProcess,
        progress?: vscode.Progress<{ message?: string }>
    ): Promise<void> {
        const deadline = Date.now() + LOAD_TIMEOUT_MS;
        for (; ;) {
            if (child.exitCode !== null) {
                throw new Error('The model runtime stopped while loading — see the "Avalonia Designer" output for the reason.');
            }
            const health = await readHealth(port).catch(() => undefined);
            if (health) {
                if (health.ok) return;
                if (health.error) throw new Error(`The model could not be loaded: ${health.error}`);
                progress?.report({ message: health.loading ? 'loading the weights into RAM…' : 'starting the runtime…' });
            }
            if (Date.now() > deadline) throw new Error('The model did not finish loading in 10 minutes.');
            await delay(400);
        }
    }

    stop(): void {
        const proc = this.proc;
        const wasRunning = !!this.endpoint;
        this.proc = undefined;
        this.endpoint = undefined;
        if (proc && proc.exitCode === null && !proc.killed) {
            try {
                proc.kill();
            } catch {
                /* already gone */
            }
        }
        if (wasRunning) log('ModelHost: stopped');
    }

    dispose(): void {
        this.stop();
    }
}

let activeContext: vscode.ExtensionContext | undefined;
let server: ModelServer | undefined;

/** Called once from `activate`, so the commands and the client share one server per window. */
export function initModelRuntime(context: vscode.ExtensionContext): void {
    activeContext = context;
    server = new ModelServer(context);
    context.subscriptions.push(server);
}

function requireServer(): ModelServer {
    if (!server) throw new Error('The model runtime is not initialised — reload the window.');
    return server;
}

/** Entry point used by the AI commands when `backend` is `bundled`. */
export async function ensureBundledEndpoint(cfg: AssistantConfig): Promise<string> {
    requireServer();
    const running = server?.current();
    if (running) return running.endpoint;
    return vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Starting the local model…', cancellable: false },
        (progress) => requireServer().ensureStarted(cfg, progress)
    );
}

export function stopModelServer(): void {
    server?.stop();
}

/**
 * Whether the extension's own runtime is up, and on which address.
 *
 * The panel needs this to mark the bundled entry as the one actually serving requests: bundled models pin
 * through `modelPath` rather than `model`, so without it the picker showed no sign that a load had worked
 * (reported 2026-09-15).
 */
/**
 * The runtime's own last words, kept so a *failed request* can quote them.
 *
 * They already go to View → Output → "Avalonia Designer", which is the right place to read them and the
 * wrong place to find them when a report arrives: the 2026-09-16 "0 characters" report could not say
 * whether the chat template had been rejected, because that line lived only in the output channel.
 * Bounded (the last 40 lines), because a load can be chatty and this is a breadcrumb, not a log file.
 */
const sidecarLines: string[] = [];

function rememberSidecar(chunk: Buffer): void {
    for (const raw of chunk.toString().split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        sidecarLines.push(line);
        if (sidecarLines.length > 40) sidecarLines.shift();
    }
}

/** The runtime's last output lines, oldest first — empty when it has said nothing. */
export function sidecarTail(): string[] {
    return sidecarLines.slice();
}

export function bundledRuntimeRunning(): { running: boolean; endpoint?: string } {
    const running = server?.current();
    return running ? { running: true, endpoint: running.endpoint } : { running: false };
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readHealth(port: number): Promise<ReturnType<typeof parseHealth>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
        const res = await fetch(sidecarHealthUrl(port), { signal: controller.signal });
        return parseHealth(await res.json());
    } finally {
        clearTimeout(timer);
    }
}

// ---------------- the model file ----------------

export function modelFolder(context: vscode.ExtensionContext): string {
    return path.join(context.globalStorageUri.fsPath, MODEL_FOLDER);
}

export function modelFileFor(context: vscode.ExtensionContext, spec: ModelSpec): string {
    return path.join(modelFolder(context), spec.fileName);
}

/**
 * Whether the built-in runtime's weights are already on this machine, per spec.
 *
 * The panel showed only "downloaded once when you press Load Model" for these entries, which reads the same
 * whether the 2 GB file is sitting in storage or has never been fetched — so a 4.4 GB entry looked exactly
 * like a ready one (asked 2026-09-15: *"the Qwen models does not work - Not downloaded?"*). A partial
 * download is reported as a partial: `downloadToFile` writes to `.part`, so the final name means complete,
 * and the `.verified` marker means the hash was checked.
 */
export function bundledFilesOnDisk(): Record<string, { onDisk: boolean; bytes: number }> {
    const out: Record<string, { onDisk: boolean; bytes: number }> = {};
    if (!activeContext) return out;
    for (const spec of MODEL_SPECS) {
        const file = modelFileFor(activeContext, spec);
        let bytes = 0;
        let partial = 0;
        try { bytes = fs.statSync(file).size; } catch { bytes = 0; }
        try { partial = fs.statSync(`${file}.part`).size; } catch { partial = 0; }
        out[spec.id] = {
            onDisk: bytes > 0 && fs.existsSync(`${file}.verified`),
            bytes: bytes > 0 ? bytes : partial
        };
    }
    return out;
}

/** The model this configuration will use: the setting, else a known file already in storage. */
export function resolveModelPath(context: vscode.ExtensionContext, cfg: AssistantConfig): string | undefined {
    if (cfg.modelPath && fs.existsSync(cfg.modelPath)) return cfg.modelPath;
    const folder = modelFolder(context);
    try {
        const names = fs.readdirSync(folder).filter((f) => /\.gguf$/i.test(f));
        const known = names.filter((n) => !!specByFileName(n));
        if (known.length === 1) return path.join(folder, known[0]);
        if (names.length === 1) return path.join(folder, names[0]);
    } catch {
        /* no folder yet */
    }
    return cfg.modelPath || undefined;
}

export function fileSha256(file: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(file);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

function sizeOf(file: string): number | undefined {
    try {
        return fs.statSync(file).size;
    } catch {
        return undefined;
    }
}

/**
 * Makes sure the weights for `spec` are on disk and intact, downloading them if not. The hash is what
 * makes an interrupted download safe to retry: a partial file never matches, and a `.verified` marker
 * keeps the (5-20 s) hashing to one time per file.
 */
export async function ensureModelFile(
    context: vscode.ExtensionContext,
    spec: ModelSpec,
    progress?: vscode.Progress<{ message?: string }>,
    token?: vscode.CancellationToken
): Promise<string> {
    const dest = modelFileFor(context, spec);
    const marker = `${dest}.verified`;
    if (sizeOf(dest) === spec.bytes) {
        if (fs.existsSync(marker)) return dest;
        progress?.report({ message: 'checking the file already on disk…' });
        if ((await fileSha256(dest)) === spec.sha256) {
            fs.writeFileSync(marker, spec.sha256);
            return dest;
        }
    }
    fs.rmSync(dest, { force: true });
    fs.rmSync(marker, { force: true });
    await downloadModel(context, spec, dest, progress, token);
    return dest;
}

/** Downloads (and verifies) one model into storage. Throws a message meant for the developer. */
async function downloadModel(
    context: vscode.ExtensionContext,
    spec: ModelSpec,
    dest: string,
    progress?: vscode.Progress<{ message?: string }>,
    token?: vscode.CancellationToken
): Promise<void> {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const part = `${dest}.part`;
    // Keep a partial file: a 4.7 GB download that dropped at 90% should cost the remaining 10%, not the
    // whole thing. `resumeFromBytes` decides whether it is trustworthy (a file *larger* than the model is a
    // stale or different quantisation, and appending to it would corrupt the result).
    const existing = sizeOf(part) ?? 0;
    const resume = resumeFromBytes(existing, spec.bytes);
    if (resume > 0) log(`Resuming the download of ${spec.fileName} at ${formatBytes(resume)}`);
    else fs.rmSync(part, { force: true });
    let corrupt = false;
    try {
        await downloadToFile(spec.url, part, spec.bytes, progress, token, resume);
        progress?.report({ message: 'verifying the checksum…' });
        const hash = await fileSha256(part);
        if (hash !== spec.sha256) {
            corrupt = true; // a bad tail cannot be resumed onto — start over next time
            throw new Error(
                `The downloaded file does not match the expected checksum (${shortHash(hash)} instead of `
                + `${shortHash(spec.sha256)}) — please try again.`
            );
        }
        fs.renameSync(part, dest);
        fs.writeFileSync(`${dest}.verified`, hash);
    } catch (e) {
        // Network failures and cancellation keep the partial file (so the next attempt resumes); a checksum
        // mismatch deletes it, because everything after the first bad byte is suspect.
        if (corrupt) fs.rmSync(part, { force: true });
        throw e;
    }
}

/**
 * `https` with redirect following (Hugging Face hands the file over to a CDN), progress, cancel, resume.
 *
 * Exported for the suite: this is the only part of the extension that talks to the network while writing a
 * file, and the resume behaviour (a Range request, a 200 that ignores it, a 416 that means our partial is
 * past the end) is exactly the kind of thing that must be proven against a real server rather than
 * described. Nothing outside this module calls it.
 */
export function downloadToFile(
    url: string,
    dest: string,
    expectedBytes: number,
    progress?: vscode.Progress<{ message?: string }>,
    token?: vscode.CancellationToken,
    resumeFrom = 0,
    redirectsLeft = 5
): Promise<void> {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const headers: Record<string, string> = { 'User-Agent': 'avalonia-designer-vscode' };
        if (resumeFrom > 0) headers.Range = `bytes=${resumeFrom}-`;
        // The scheme decides the transport. "Paste the address of one" accepts any URL, and an `http://`
        // address (a model served by something local) used to be handed to `https.get`, which fails with a
        // TLS error that says nothing about the real problem.
        const transport = new URL(url).protocol === 'http:' ? http : https;
        const req = transport.get(url, { headers }, (res) => {
            const status = res.statusCode ?? 0;
            if (status >= 300 && status < 400 && res.headers.location) {
                res.resume();
                if (redirectsLeft <= 0) {
                    reject(new Error('The download redirected too many times.'));
                    return;
                }
                const next = new URL(res.headers.location, url).toString();
                // A redirect must not lose the resume offset: the CDN hop is where the bytes come from.
                resolve(downloadToFile(next, dest, expectedBytes, progress, token, resumeFrom, redirectsLeft - 1));
                return;
            }
            // 416 means our partial file is past the end of what the server has: drop it and start clean.
            if (status === 416 && resumeFrom > 0) {
                res.resume();
                fs.rmSync(dest, { force: true });
                resolve(downloadToFile(url, dest, expectedBytes, progress, token, 0, redirectsLeft));
                return;
            }
            // 206 is the server honouring the Range request; 200 means it ignored it, so the body is the
            // whole file and appending would duplicate the first `resumeFrom` bytes.
            const partial = status === 206 && resumeFrom > 0;
            if (status !== 200 && !partial) {
                res.resume();
                reject(new Error(`The download failed with HTTP ${status}.`));
                return;
            }
            const keep = partial ? resumeFrom : 0;
            if (!partial && resumeFrom > 0) {
                log('The server ignored the resume request — downloading from the start.');
                fs.rmSync(dest, { force: true });
            }
            const total = totalFromHeaders(res, expectedBytes, keep);
            const out = fs.createWriteStream(dest, { flags: keep > 0 ? 'a' : 'w' });
            let got = keep;
            let lastReport = 0;
            progress?.report({ message: `${downloadProgressText(got, total)}  ·  starting…` });
            res.on('data', (chunk: Buffer) => {
                got += chunk.length;
                const now = Date.now();
                // Time-throttled (not tick-throttled): the webview progress line must not be flooded by
                // hundreds of messages a second, and it must update on slow connections too.
                if (now - lastReport < 500) return;
                lastReport = now;
                const seconds = Math.max(0.5, (now - started) / 1000);
                const rate = (got - keep) / 1e6 / seconds;
                progress?.report({ message: downloadProgressText(got, total, rate) });
            });
            res.setTimeout(60000, () => {
                req.destroy(new Error('The download stalled (60 s without data).'));
            });
            res.on('error', reject);
            res.pipe(out);
            out.on('error', reject);
            out.on('finish', () => out.close(() => {
                // A final line at 100%. Updates are throttled to two a second, so the last message before
                // this can read "62%" on a fast connection — and it would then sit there while the tail
                // arrives and the checksum runs, looking like a stalled download.
                progress?.report({ message: downloadProgressText(got, total) });
                resolve();
            }));
        });
        req.on('error', (e) => reject(new Error(`Could not download the model: ${e.message}`)));
        token?.onCancellationRequested(() => {
            req.destroy(new Error('Cancelled.'));
        });
    });
}

/** The size to report progress against: `Content-Length`, or the total from a `Content-Range` reply. */
function totalFromHeaders(res: { headers: Record<string, unknown> }, expectedBytes: number, alreadyHave: number): number {
    const contentRange = String(res.headers['content-range'] ?? '');
    const totalInRange = /\/(\d+)\s*$/.exec(contentRange);
    if (totalInRange) return Number(totalInRange[1]);
    const length = Number(res.headers['content-length']) || 0;
    // A 206 answer's Content-Length is only the remaining bytes, so add what we already had.
    if (alreadyHave > 0 && length > 0) return alreadyHave + length;
    return length || expectedBytes;
}

// ---------------- the setup command ----------------

/** "AI: Set Up Local Model…" — pick a model, download it once, point the setting at it. */
export async function setupBundledModel(context: vscode.ExtensionContext): Promise<void> {
    const facts = readHardwareFacts();
    const verdict = assessHardware(facts);
    if (verdict.level === 'none') {
        void vscode.window.showWarningMessage(
            `A local model cannot run on this machine, so the AI assist stays off. ${verdict.reasons.join(' ')}`
        );
        return;
    }

    const offered = MODEL_SPECS.filter((s) => canRunSpec(s, { level: verdict.level, totalRamGb: facts.totalRamGb }).ok);
    const refused = MODEL_SPECS.filter((s) => !offered.includes(s));
    const items: (vscode.QuickPickItem & { spec?: ModelSpec; action?: 'file' | 'url' })[] = [
        ...offered.map((spec) => ({
            label: `$(cloud-download) ${spec.label}`,
            description: spec.detail,
            detail: fs.existsSync(modelFileFor(context, spec)) ? 'already downloaded' : `${formatBytes(spec.bytes)} download`,
            spec
        })),
        ...refused.map((spec) => ({
            label: `$(circle-slash) ${spec.label}`,
            description: `not offered here — ${canRunSpec(spec, { level: verdict.level, totalRamGb: facts.totalRamGb }).reason}`
        })),
        { label: '$(file) Use a .gguf file already on this machine…', action: 'file' },
        { label: '$(link) Paste the address of a .gguf file…', action: 'url' }
    ];

    const pick = await vscode.window.showQuickPick(items, {
        title: 'Local model for the AI assist',
        placeHolder: `Downloaded once into the extension's storage · ${facts.totalRamGb.toFixed(0)} GB RAM, ${facts.cpuCount} threads`,
        ignoreFocusOut: true
    });
    if (!pick) return;

    if (pick.action === 'file') {
        const chosen = await vscode.window.showOpenDialog({
            title: 'Pick a .gguf model file',
            canSelectMany: false,
            openLabel: 'Use this model',
            filters: { 'GGUF model': ['gguf'] }
        });
        const file = chosen?.[0]?.fsPath;
        if (!file) return;
        if (!isGgufPath(file)) {
            void vscode.window.showWarningMessage('That is not a .gguf file.');
            return;
        }
        await activateWith(context, file);
        return;
    }

    if (pick.action === 'url') {
        const url = await vscode.window.showInputBox({
            title: 'Address of a .gguf file',
            prompt: 'It is downloaded into the extension\'s storage. A checksum cannot be verified for an unknown file.',
            placeHolder: 'https://…/model.gguf',
            ignoreFocusOut: true,
            validateInput: (v) => (/^https:\/\/\S+\.gguf$/i.test(v.trim()) ? undefined : 'An https:// address ending in .gguf')
        });
        if (!url) return;
        const name = decodeURIComponent(url.trim().split('/').pop() ?? 'model.gguf').replace(/[^\w.-]/g, '_');
        const dest = path.join(modelFolder(context), name.endsWith('.gguf') ? name : `${name}.gguf`);
        try {
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: `Downloading ${name}`, cancellable: true },
                async (progress, token) => {
                    await downloadToFile(url.trim(), dest, 0, progress, token);
                }
            );
        } catch (e) {
            void vscode.window.showErrorMessage(`Download failed: ${e instanceof Error ? e.message : String(e)}`);
            return;
        }
        await activateWith(context, dest);
        return;
    }

    const spec = pick.spec;
    if (!spec) return;
    try {
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Getting ${spec.label}`, cancellable: true },
            async (progress, token) => {
                await ensureModelFile(context, spec, progress, token);
            }
        );
    } catch (e) {
        void vscode.window.showErrorMessage(`Download failed: ${e instanceof Error ? e.message : String(e)}`);
        return;
    }
    await activateWith(context, modelFileFor(context, spec));
}

/** Points the assistant at a model file and switches the backend on. */
async function activateWith(context: vscode.ExtensionContext, file: string): Promise<void> {
    const cfg = configView(SETTINGS);
    await cfg.update('modelPath', file, vscode.ConfigurationTarget.Global);
    await cfg.update('backend', 'bundled', vscode.ConfigurationTarget.Global);
    const pick = await vscode.window.showInformationMessage(
        'The local model is ready. "AI: Implement in Function…" and "✨ Fix with AI…" will use it — nothing '
        + 'leaves this machine.',
        'Show status',
        'Dismiss'
    );
    if (pick === 'Show status') await vscode.commands.executeCommand('avaloniaDesigner.assistant.status');
}

// ---------------- status ----------------

/** The bundled-runtime lines of the status dialog. */
export function bundledStatusLines(cfg: AssistantConfig): string[] {
    if (!activeContext) return ['Model runtime: not initialised yet'];
    const context = activeContext;
    const { bin } = sidecarPaths(context);
    const lines = [`Model runtime: ${fs.existsSync(bin) ? 'built' : 'not built yet (built on first use)'}`];
    const file = resolveModelPath(context, cfg);
    if (file) {
        const size = sizeOf(file);
        lines.push(`Model file: ${path.basename(file)}${size === undefined ? ' — MISSING' : ` (${formatBytes(size)})`}`);
    } else {
        lines.push('Model file: none yet — run "AI: Set Up Local Model…"');
    }
    const running = server?.current();
    lines.push(running ? `Server: running on port ${running.port}` : 'Server: stopped (starts with the next request)');
    const threads = cfg.threads > 0 ? cfg.threads : defaultThreads(os.cpus().length);
    lines.push(`Generation: ${threads} thread(s), ${cfg.maxTokens} tokens max, ${cfg.timeoutSeconds} s budget`);
    return lines;
}
