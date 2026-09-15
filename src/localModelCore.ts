/* The model layer with no UI attached: discovery, loading, unloading, status, scanning, importing.
 *
 * Why this exists: the same operations are now reachable from two front doors — the Command Palette
 * flows (quick picks and notifications) and the designer's ⚙ Settings panel (an inline block). Putting
 * the behaviour in one place is what keeps them from drifting; each front door only decides how to ask
 * and how to report. Nothing here shows a dialog, so `onProgress` is the only channel it has, and the
 * panel renders those messages inline while the palette shows them in a notification.
 *
 * The pure decisions (parsers, argv, recommendations, scan filters) live in `localModels.ts`, which must
 * not import `vscode` — that is what lets the suite pin them without LM Studio installed.
 */

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readHardwareFacts } from './assistant';
import { log } from './logger';
import {
    buildLoadArgs,
    canImportFile,
    explainLoadFailure,
    isModelLoaded,
    lmsCandidates,
    parseLmsList,
    parseLmsPs,
    parseLmsServerStatus,
    parseLoadEstimate,
    parseLockLimitGb,
    scanRoots,
    type LoadEstimate,
    type LoadOptions,
    type LocalModel,
    type LocalModelList,
    type SetupFacts
} from './localModels';

export const LMSTUDIO_API = 'http://127.0.0.1:1234/api/v0/models';
/** Where LM Studio keeps imported models. Files already here are listed by `lms ls` — no import needed. */
export const lmStudioModelsRoot = (home = os.homedir()) => path.join(home, '.lmstudio', 'models');

/** One line of progress, in the user's words. The caller decides where it appears. */
export type Progress = (message: string) => void;

export interface CliResult {
    code: number;
    stdout: string;
    stderr: string;
}

export function run(cmd: string, args: string[], timeoutMs = 20000): Promise<CliResult> {
    return new Promise((resolve) => {
        child_process.execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
            const code = err && typeof (err as { code?: unknown }).code === 'number' ? Number((err as { code: number }).code) : err ? 1 : 0;
            resolve({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
        });
    });
}

/** The `lms` binary, or undefined when LM Studio is not on this machine. */
export function findLmsCli(): string | undefined {
    for (const candidate of lmsCandidates(os.homedir())) {
        try {
            if (candidate === 'lms' || fs.existsSync(candidate)) return candidate;
        } catch {
            /* ignore */
        }
    }
    return undefined;
}

/** `/proc/self/limits` — the locked-memory ceiling that decides whether mlock can work. */
export function lockLimitGb(): number {
    try {
        return parseLockLimitGb(fs.readFileSync('/proc/self/limits', 'utf8')) ?? 8;
    } catch {
        return 8; // Windows/macOS have no such file; assume a sane value rather than warning wrongly
    }
}

export function setupFacts(): SetupFacts {
    const hw = readHardwareFacts();
    return { totalRamGb: hw.totalRamGb, freeRamGb: hw.freeRamGb, cpuCount: hw.cpuCount, lockLimitGb: lockLimitGb() };
}

/** Asks LM Studio's REST API rather than parsing a table whose loaded format has never been observed. */
async function readApi(): Promise<{ ids: { id: string; kind: 'chat' | 'embeddings' | 'unknown'; state: string }[] } | undefined> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
        const res = await fetch(LMSTUDIO_API, { signal: controller.signal });
        if (!res.ok) return undefined;
        const body = (await res.json()) as { data?: { id?: unknown; type?: unknown; state?: unknown }[] };
        return {
            ids: (body.data ?? [])
                .filter((m) => typeof m.id === 'string')
                .map((m) => ({
                    id: String(m.id),
                    kind: m.type === 'embeddings' ? 'embeddings' : m.type === 'llm' || m.type === 'vlm' ? 'chat' : 'unknown',
                    state: String(m.state ?? '')
                }))
        };
    } catch {
        return undefined;
    } finally {
        clearTimeout(timer);
    }
}

export interface Discovery {
    /** The CLI, when LM Studio is installed. */
    cli?: string;
    list: LocalModelList;
    server: { running: boolean; port?: number };
    /** Ids currently in memory, from the API's `state` (the reliable source). */
    loaded: string[];
    /** `type` per id, from the API — better than guessing from a model's name. */
    kindById: Map<string, 'chat' | 'embeddings' | 'unknown'>;
    /** Whether the REST API answered at all. */
    api: boolean;
}

export const EMPTY_DISCOVERY: Discovery = {
    list: { chat: [], embeddings: [], diskGb: 0 },
    server: { running: false },
    loaded: [],
    kindById: new Map(),
    api: false
};

/** Everything the pickers and the panel need, in one round of calls. */
export async function discover(): Promise<Discovery> {
    const cli = findLmsCli();
    if (!cli) {
        const api = await readApi();
        return {
            list: { chat: [], embeddings: [], diskGb: 0 },
            server: { running: !!api },
            loaded: (api?.ids ?? []).filter((m) => /loaded/i.test(m.state)).map((m) => m.id),
            kindById: new Map((api?.ids ?? []).map((m) => [m.id, m.kind] as const)),
            api: !!api
        };
    }
    const [ls, ps, status, api] = await Promise.all([
        run(cli, ['ls']),
        run(cli, ['ps']),
        run(cli, ['server', 'status']),
        readApi()
    ]);
    const list = parseLmsList(ls.stdout || ls.stderr);
    const kindById = new Map<string, 'chat' | 'embeddings' | 'unknown'>();
    for (const m of api?.ids ?? []) kindById.set(m.id, m.kind);
    const loaded = api ? api.ids.filter((m) => isModelLoaded(m.state)).map((m) => m.id) : parseLmsPs(ps.stdout) ?? [];
    log(`LM Studio: ${list.chat.length} chat + ${list.embeddings.length} embedding model(s) on disk, `
        + `${loaded.length} loaded, server ${parseLmsServerStatus(status.stdout || status.stderr).running ? 'running' : 'stopped'}`);
    return { cli, list, server: parseLmsServerStatus(status.stdout || status.stderr), loaded, kindById, api: !!api };
}

/**
 * The models a developer could actually pick: chat models, with the kind the API reported folded in.
 * Embedding models are deliberately left out — every local server lists them next to the chat ones and
 * they cannot answer a chat request.
 */
export function chatModels(d: Discovery): LocalModel[] {
    return d.list.chat
        .filter((m) => d.kindById.get(m.key) !== 'embeddings')
        .map((m) => ({ ...m, kind: d.kindById.get(m.key) ?? m.kind ?? 'chat' }));
}

/** Ids in memory that are *not* this model — what has to go before switching. */
export function loadedOthers(d: Discovery, key: string): string[] {
    return d.loaded.filter((id) => id !== key && !id.endsWith(key));
}

/** `lms unload --all`. The user chose this on purpose: switching or switching AI off frees everything. */
export async function unloadAll(cli?: string): Promise<{ ok: boolean; message?: string }> {
    const binary = cli ?? findLmsCli();
    if (!binary) return { ok: false, message: 'LM Studio is not installed on this machine.' };
    const result = await run(binary, ['unload', '--all'], 120000);
    if (result.code !== 0) {
        return { ok: false, message: (result.stderr || result.stdout).trim().slice(0, 300) || `lms unload exited ${result.code}` };
    }
    log('LM Studio: unloaded all models');
    return { ok: true };
}

export interface LoadReport {
    ok: boolean;
    /** The base URL to write into `endpoint`. */
    endpoint?: string;
    /** What was in memory before, and therefore unloaded. */
    unloaded: string[];
    /** The pre-flight estimate, when the CLI produced one. */
    estimate?: LoadEstimate;
    /** A translated reason when it failed — never a raw log. */
    message?: string;
    /** The server log tail, for "Copy details". */
    logTail?: string;
    /** True when the user said no to a memory warning. */
    cancelled?: boolean;
}

/** The newest LM Studio server log — the only place the crash reasons actually appear. */
export function serverLogTail(lines = 60): string {
    try {
        const root = path.join(os.homedir(), '.lmstudio', 'server-logs');
        const files: string[] = [];
        for (const dir of fs.readdirSync(root)) {
            const full = path.join(root, dir);
            if (!fs.statSync(full).isDirectory()) continue;
            for (const f of fs.readdirSync(full)) files.push(path.join(full, f));
        }
        if (files.length === 0) return '';
        const newest = files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
        return fs.readFileSync(newest, 'utf8').split(/\r?\n/).slice(-lines).join('\n');
    } catch {
        return '';
    }
}

export interface LoadRequest {
    model: LocalModel;
    options: LoadOptions;
    facts: SetupFacts;
    onProgress?: Progress;
    /**
     * Asked before loading when the estimate exceeds the free memory. Returning false cancels. The panel
     * answers this inline; the palette flow shows a modal warning.
     */
    confirmOverBudget?: (estimate: LoadEstimate) => Promise<boolean>;
    /** The server state from {@link discover}; re-read when omitted. */
    server?: { running: boolean; port?: number };
}

/**
 * Unload everything, start the server if needed, load, then wait until the model reports itself loaded.
 * Returns a report rather than throwing, because every step has a different explanation and the caller
 * decides how to show it.
 */
export async function load(req: LoadRequest): Promise<LoadReport> {
    const { model, options, facts } = req;
    const saying = req.onProgress ?? (() => undefined);
    const cli = findLmsCli();
    if (!cli) return { ok: false, unloaded: [], message: 'LM Studio is not installed on this machine.' };

    // Pre-flight: what it will cost, before it costs it.
    saying('checking what it will cost…');
    const estimateRun = await run(cli, [...buildLoadArgs(model, options), '--estimate-only'], 120000);
    const estimate = parseLoadEstimate(estimateRun.stdout || estimateRun.stderr);
    if (estimate) {
        log(`Estimate for ${model.label}: ${estimate.totalGiB.toFixed(2)} GiB at ${estimate.contextLength} tokens `
            + `(confidence ${estimate.confidence})`);
        if (estimate.totalGiB > facts.freeRamGb + 0.5 && req.confirmOverBudget) {
            const go = await req.confirmOverBudget(estimate);
            if (!go) return { ok: false, unloaded: [], estimate, cancelled: true };
        }
    }

    // Switching models must not leave the previous one in memory: 17 GB of weights next to the new model
    // is how a machine starts swapping. The user asked for this explicitly.
    const before = req.server ?? (await discover()).server;
    saying('freeing whatever is loaded…');
    const unloaded = (await discoveryLoadedIds(cli)).filter((id) => id !== options.identifier);
    const unload = await unloadAll(cli);
    if (!unload.ok && unloaded.length > 0) {
        log(`Could not unload ${unloaded.join(', ')} first: ${unload.message}`);
    }

    let endpoint = `http://127.0.0.1:${before.port ?? 1234}/v1`;
    if (!before.running) {
        saying('starting the LM Studio server…');
        const started = await run(cli, ['server', 'start'], 60000);
        const status = parseLmsServerStatus(started.stdout || started.stderr);
        if (!status.running) {
            return {
                ok: false,
                unloaded,
                estimate,
                message: `Could not start the LM Studio server: ${(started.stderr || started.stdout).trim().slice(0, 300)}`
            };
        }
        if (status.port) endpoint = `http://127.0.0.1:${status.port}/v1`;
    }

    const loadRun = await run(cli, buildLoadArgs(model, options), 30 * 60 * 1000);
    if (loadRun.code !== 0) {
        const logTail = serverLogTail();
        const why = explainLoadFailure(`${loadRun.stdout}\n${loadRun.stderr}\n${logTail}`, facts, model.sizeGb);
        const detail = (loadRun.stderr || loadRun.stdout).trim().split(/\r?\n/).slice(-3).join(' ');
        log(`Loading ${model.label} failed (${loadRun.code}): ${detail}`);
        return { ok: false, unloaded, estimate, message: why ?? detail.slice(0, 300), logTail };
    }

    // "The CLI exited 0" is not the same as "the model answers": wait for the API to say it is loaded.
    for (let i = 0; i < 60; i++) {
        const api = await readApi();
        if (api?.ids.some((m) => m.id === options.identifier && /loaded/i.test(m.state))) break;
        await new Promise((r) => setTimeout(r, 1000));
    }
    return { ok: true, endpoint, unloaded, estimate };
}

/** Ids currently in memory, by asking the API (falling back to nothing rather than guessing). */
async function discoveryLoadedIds(cli: string): Promise<string[]> {
    const api = await readApi();
    if (api) return api.ids.filter((m) => isModelLoaded(m.state)).map((m) => m.id);
    const ps = await run(cli, ['ps']);
    return parseLmsPs(ps.stdout) ?? [];
}

// ---------------- files on this machine ----------------

export interface FoundModelFile {
    /** Absolute path. */
    file: string;
    /** File name, for the label. */
    name: string;
    sizeGb: number;
    /** The folder it sits in, shortened with `~` for display. */
    folder: string;
    /** True when it lives in LM Studio's own folder and is therefore already in the `lms ls` list. */
    inLmStudio: boolean;
}

/**
 * Walks the candidate roots for `.gguf` files a chat model could be loaded from.
 *
 * Bounded on purpose: a fixed depth, a size floor, a time budget and a progress callback, because
 * `find /` on a machine with network mounts is exactly the thing that makes an editor look hung. The
 * filter decisions are pure and live in `localModels.ts` so they are tested without a filesystem.
 */
export async function scanForModelFiles(opts: {
    onProgress?: Progress;
    /** Stop early (the panel's Cancel). */
    isCancelled?: () => boolean;
    /** Milliseconds before it gives up and reports what it has. */
    budgetMs?: number;
    roots?: string[];
} = {}): Promise<FoundModelFile[]> {
    const saying = opts.onProgress ?? (() => undefined);
    const budget = opts.budgetMs ?? 12000;
    const started = Date.now();
    const roots = opts.roots ?? scanRoots(os.homedir());
    const modelsRoot = lmStudioModelsRoot();
    const found: FoundModelFile[] = [];
    const seen = new Set<string>();
    let visited = 0;

    const walk = async (dir: string, depth: number): Promise<void> => {
        if (depth > 5 || opts.isCancelled?.() || Date.now() - started > budget) return;
        let entries: fs.Dirent[];
        try {
            entries = await fs.promises.readdir(dir, { withFileTypes: true });
        } catch {
            return; // unreadable (permissions, a broken mount) — skipping it is the only sane answer
        }
        for (const entry of entries) {
            if (opts.isCancelled?.() || Date.now() - started > budget) return;
            if (entry.name.startsWith('.')) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (/^(proc|sys|dev|run|snap|node_modules)$/.test(entry.name)) continue;
                await walk(full, depth + 1);
                continue;
            }
            if (!entry.isFile()) continue;
            visited += 1;
            if (!canImportFile(entry.name)) continue;
            let stat: fs.Stats;
            try {
                stat = await fs.promises.stat(full);
            } catch {
                continue;
            }
            const sizeGb = stat.size / (1024 * 1024 * 1024);
            if (sizeGb < 0.1) continue; // a tokenizer or a stray test blob is not a model
            if (seen.has(full)) continue;
            seen.add(full);
            found.push({
                file: full,
                name: entry.name,
                sizeGb,
                folder: full.slice(0, full.length - entry.name.length - 1).replace(os.homedir(), '~'),
                inLmStudio: full.startsWith(modelsRoot + path.sep)
            });
            if (found.length % 3 === 0) saying(`scanning… ${found.length} file(s) found`);
        }
    };

    for (const root of roots) {
        try {
            if (!fs.existsSync(root)) continue;
        } catch {
            continue;
        }
        saying(`scanning ${root.replace(os.homedir(), '~')}…`);
        await walk(root, 0);
    }
    const usable = found.filter((f) => !f.inLmStudio).sort((a, b) => b.sizeGb - a.sizeGb);
    log(`Model scan: ${usable.length} loadable file(s) outside LM Studio, ${found.length - usable.length} already inside it, `
        + `${visited} file(s) visited in ${Math.round((Date.now() - started) / 1000)} s`);
    return usable;
}

/**
 * Imports a model file into LM Studio, so it becomes a normal model key that the LM Studio runtime can
 * load (context, GPU offload, TTL and the REST API all included).
 *
 * `--symbolic-link` is not optional in practice: with no flag at all `lms import` **moves** the file into
 * LM Studio's folder, which would take a model out of the folder the developer keeps it in. A symlink
 * leaves the original alone and costs no disk space.
 */
export async function importModelFile(file: string, opts: { onProgress?: Progress } = {}): Promise<{ ok: boolean; key?: string; message?: string }> {
    const cli = findLmsCli();
    if (!cli) return { ok: false, message: 'LM Studio is not installed on this machine.' };
    const saying = opts.onProgress ?? (() => undefined);
    if (file.startsWith(lmStudioModelsRoot() + path.sep)) {
        return { ok: false, message: 'That file is already inside LM Studio\'s model folder — pick it from the LM Studio list.' };
    }
    const before = new Set(parseLmsList((await run(cli, ['ls'])).stdout).chat.map((m) => m.key));
    saying(`importing ${path.basename(file)} into LM Studio…`);
    const result = await run(cli, ['import', '--symbolic-link', '--yes', file], 10 * 60 * 1000);
    if (result.code !== 0) {
        return { ok: false, message: (result.stderr || result.stdout).trim().slice(0, 300) || `lms import exited ${result.code}` };
    }
    // The import output format is not documented, so the new key is found by difference — that is robust
    // to any wording change.
    const after = parseLmsList((await run(cli, ['ls'])).stdout).chat.map((m) => m.key);
    const added = after.filter((k) => !before.has(k));
    log(`Imported ${path.basename(file)} → ${added.length === 1 ? added[0] : `${added.length} new model key(s)`}`);
    return { ok: true, key: added.length === 1 ? added[0] : undefined };
}
