/* The one-command setup: pick a model by name, the extension does the rest.
 *
 * WHAT THIS REPLACES (2026-09-15). Doing it by hand meant knowing five things a developer should not have
 * to know: which port LM Studio serves on, the exact model id to pin, a context length, an offload ratio,
 * and that `Keep Model in Memory` has to be off because the kernel's lock limit is smaller than the model.
 * The user called that "way too complicated for a novice" and asked for a dropdown — this is that dropdown,
 * as a command (VS Code settings cannot enumerate models: `enum` is baked into the manifest at build time).
 *
 * HOW IT WORKS, all of it verified against a real LM Studio on this machine (NOTES.md §100):
 *   `lms ls`                        → what is on disk (with params/arch/size, LLM vs EMBEDDING)
 *   `lms ps`                        → what is loaded (only its *empty* answer is parsed; the REST API's
 *                                     `state` field is the verified source for the loaded case)
 *   `lms server status`             → the port, or that the server is stopped
 *   `GET /api/v0/models`            → ids, `type` (embeddings excluded properly), quantization, state
 *   `lms load … --estimate-only`    → what the load would cost, WITHOUT loading it
 *   `lms load <key> --gpu … -c … `  → the load itself, with the values derived from the machine
 * and on failure the newest log under `~/.lmstudio/server-logs` is read and translated, because the two
 * failures that actually happen (mlock abort, out of memory) are invisible in the LM Studio UI.
 */

import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { chat, normalizeAssistantConfig, readHardwareFacts } from './assistant';
import { log } from './logger';
import { setupBundledModel } from './modelRuntime';
import {
    buildLoadArgs,
    explainLoadFailure,
    lmsCandidates,
    modelLabel,
    parseLmsList,
    parseLmsPs,
    parseLmsServerStatus,
    parseLoadEstimate,
    parseLockLimitGb,
    recommendedLoadOptions,
    type LoadOptions,
    type LocalModel,
    type LocalModelList,
    type SetupFacts
} from './localModels';

const SETTINGS = 'avaloniaDesigner.assistant';
const LMSTUDIO_API = 'http://127.0.0.1:1234/api/v0/models';

interface LmStudioState {
    cli: string;
    list: LocalModelList;
    server: { running: boolean; port?: number };
    /** ids the server reports as loaded, when the API answered */
    loaded: string[];
    /** `type` per id, from the API (better than guessing from the name) */
    kindById: Map<string, 'chat' | 'embeddings' | 'unknown'>;
}

async function run(cmd: string, args: string[], timeoutMs = 20000): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
        cp.execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
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
function lockLimitGb(): number {
    try {
        return parseLockLimitGb(fs.readFileSync('/proc/self/limits', 'utf8')) ?? 8;
    } catch {
        return 8; // Windows/macOS have no such file; assume a sane default rather than warning wrongly
    }
}

function setupFacts(): SetupFacts {
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

async function readLmStudio(cli: string): Promise<LmStudioState> {
    const [ls, ps, status, api] = await Promise.all([
        run(cli, ['ls']),
        run(cli, ['ps']),
        run(cli, ['server', 'status']),
        readApi()
    ]);
    const list = parseLmsList(ls.stdout || ls.stderr);
    const kindById = new Map<string, 'chat' | 'embeddings' | 'unknown'>();
    for (const m of api?.ids ?? []) kindById.set(m.id, m.kind);
    const loaded = api ? api.ids.filter((m) => /loaded/i.test(m.state)).map((m) => m.id) : parseLmsPs(ps.stdout) ?? [];
    log(`LM Studio: ${list.chat.length} chat + ${list.embeddings.length} embedding model(s) on disk, ${loaded.length} loaded`);
    return { cli, list, server: parseLmsServerStatus(status.stdout || status.stderr), loaded, kindById };
}

/** Reads the newest LM Studio server log — the only place the crash reasons actually appear. */
function newestServerLogTail(lines = 60): string {
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

/** "AI: Choose a Local Model…" — the whole setup, with two confirmations and no jargon. */
export async function chooseLocalModel(context: vscode.ExtensionContext): Promise<void> {
    const facts = setupFacts();
    const cli = findLmsCli();
    const items: (vscode.QuickPickItem & { model?: LocalModel; action?: 'bundled' | 'custom' })[] = [];

    let lm: LmStudioState | undefined;
    if (cli) {
        lm = await readLmStudio(cli);
        for (const model of lm.list.chat) {
            const kind = lm.kindById.get(model.key);
            if (kind === 'embeddings') continue;
            const loaded = lm.loaded.some((id) => id === model.key || id.endsWith(model.key));
            items.push({
                label: `${loaded ? '$(circle-filled) ' : '$(circle-outline) '}${modelLabel(model)}`,
                description: loaded ? 'loaded' : '',
                detail: `LM Studio · ${model.arch}${loaded ? ' · already in memory' : ''}`,
                model: { ...model, kind: kind ?? model.kind }
            });
        }
    }

    items.push({
        label: '$(package) This extension\'s own model',
        description: 'no LM Studio needed',
        detail: 'Downloads a code-specialised 3B/7B model once and runs it locally',
        action: 'bundled'
    });
    items.push({
        label: '$(globe) A server I run myself',
        description: 'any OpenAI-compatible address',
        detail: 'Ollama, llama.cpp or anything else already running on this machine',
        action: 'custom'
    });

    const pick = await vscode.window.showQuickPick(items, {
        title: 'Which local model should write the code?',
        placeHolder: cli
            ? `LM Studio found · ${lm?.list.chat.length ?? 0} chat model(s) on disk · ${facts.freeRamGb.toFixed(0)} GB RAM free`
            : 'LM Studio is not installed — its own model needs nothing but the .NET SDK',
        ignoreFocusOut: true,
        matchOnDetail: true
    });
    if (!pick) return;

    if (pick.action === 'bundled') {
        await setupBundledModel(context);
        return;
    }
    if (pick.action === 'custom') {
        await askForEndpoint();
        return;
    }

    const model = pick.model;
    if (!model || !cli) return;
    await setUpLmStudioModel(model, facts, lm?.server ?? { running: false });
}

/** Recommended values, one confirmation, with everything visible that a novice is trusting us with. */
async function askLoadOptions(model: LocalModel, facts: SetupFacts): Promise<LoadOptions | undefined> {
    const recommended = recommendedLoadOptions(model, facts);
    const detail = recommended.reasons.join('\n');
    const pick = await vscode.window.showQuickPick(
        [
            { label: '$(check) Use the recommended settings', detail, use: true },
            { label: '$(settings-gear) Change them…', detail: 'Context length, GPU offload, when to unload', use: false }
        ],
        { title: `${model.label} — how should it run?`, ignoreFocusOut: true }
    );
    if (!pick) return undefined;
    if (pick.use) return recommended;

    const context = await vscode.window.showInputBox({
        title: 'Context length (tokens)',
        value: String(recommended.contextLength),
        prompt: 'How much text the model can hold at once. Bigger costs memory.',
        validateInput: (v) => (/^\d{3,7}$/.test(v.trim()) ? undefined : 'A number, e.g. 8192')
    });
    if (!context) return undefined;
    const gpu = await vscode.window.showQuickPick(
        [
            { label: 'off', detail: 'CPU only — safest, and usually faster on a shared-memory GPU' },
            { label: 'max', detail: 'Push everything to the GPU' },
            { label: '0.5', detail: 'Half of the layers on the GPU' }
        ],
        { title: 'GPU offload', ignoreFocusOut: true }
    );
    if (!gpu) return undefined;
    const ttl = await vscode.window.showQuickPick(
        [
            { label: '15 minutes', detail: 'Frees the memory when you stop working', seconds: 900 },
            { label: '1 hour', detail: '', seconds: 3600 },
            { label: 'keep loaded', detail: 'Never unload automatically', seconds: 0 }
        ],
        { title: 'Unload the model when idle for…', ignoreFocusOut: true }
    );
    if (!ttl) return undefined;
    return { ...recommended, contextLength: Number(context), gpu: gpu.label, ttlSeconds: ttl.seconds };
}

async function setUpLmStudioModel(
    model: LocalModel,
    facts: SetupFacts,
    server: { running: boolean; port?: number }
): Promise<void> {
    const options = await askLoadOptions(model, facts);
    if (!options) return;

    const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Loading ${model.label}…`, cancellable: false },
        async (progress) => loadModel(model, options, facts, server, progress)
    );
    if (!result) return;

    // Wire the extension to what we just started.
    const cfg = vscode.workspace.getConfiguration(SETTINGS);
    await cfg.update('backend', 'external', vscode.ConfigurationTarget.Global);
    await cfg.update('endpoint', result.endpoint, vscode.ConfigurationTarget.Global);
    await cfg.update('model', options.identifier, vscode.ConfigurationTarget.Global);
    log(`AI assist wired to ${result.endpoint} with model "${options.identifier}"`);

    // Prove it before the user touches code.
    const ok = await proveItWorks();
    const pick = await vscode.window.showInformationMessage(
        ok
            ? `Ready — ${model.label} is answering on ${result.endpoint}. Try "AI: Implement in Function…" in a code-behind file.`
            : `The model is loaded on ${result.endpoint}, but the test request did not come back. Try "AI: Status and Hardware Check".`,
        'Show status',
        'OK'
    );
    if (pick === 'Show status') await vscode.commands.executeCommand('avaloniaDesigner.assistant.status');
}

/** Pre-flight, start the server if needed, load, then verify — reporting each step. */
async function loadModel(
    model: LocalModel,
    options: LoadOptions,
    facts: SetupFacts,
    server: { running: boolean; port?: number },
    progress: vscode.Progress<{ message?: string }>
): Promise<{ endpoint: string } | undefined> {
    const cli = findLmsCli();
    if (!cli) return undefined;

    progress.report({ message: 'checking what it will cost…' });
    const estimate = await run(cli, [...buildLoadArgs(model, options), '--estimate-only'], 120000);
    const parsed = parseLoadEstimate(estimate.stdout || estimate.stderr);
    if (parsed && parsed.totalGiB > facts.freeRamGb + 0.5) {
        const pick = await vscode.window.showWarningMessage(
            `${model.label} needs about ${parsed.totalGiB.toFixed(1)} GB and only ${facts.freeRamGb.toFixed(1)} GB is free. `
            + 'Loading it may push the machine into swap.',
            { modal: true },
            'Load anyway',
            'Cancel'
        );
        if (pick !== 'Load anyway') return undefined;
    }
    if (parsed) {
        log(`Estimate for ${model.label}: ${parsed.totalGiB.toFixed(2)} GiB at ${parsed.contextLength} tokens (confidence ${parsed.confidence})`);
    }

    let endpoint = `http://127.0.0.1:${server.port ?? 1234}/v1`;
    if (!server.running) {
        progress.report({ message: 'starting the LM Studio server…' });
        const started = await run(cli, ['server', 'start'], 60000);
        const status = parseLmsServerStatus(started.stdout || started.stderr);
        if (!status.running) {
            void vscode.window.showErrorMessage(
                `Could not start the LM Studio server: ${(started.stderr || started.stdout).trim().slice(0, 300)}`
            );
            return undefined;
        }
        if (status.port) endpoint = `http://127.0.0.1:${status.port}/v1`;
    }

    progress.report({ message: `loading ${model.label} (this can take a few minutes)…` });
    const started = Date.now();
    const ticker = setInterval(() => progress.report({ message: `loading ${model.label}… ${Math.round((Date.now() - started) / 1000)} s` }), 2000);
    const load = await run(cli, buildLoadArgs(model, options), 30 * 60 * 1000);
    clearInterval(ticker);

    if (load.code !== 0) {
        const why = explainLoadFailure(`${load.stdout}\n${load.stderr}\n${newestServerLogTail()}`, facts, model.sizeGb);
        const detail = (load.stderr || load.stdout).trim().split(/\r?\n/).slice(-3).join(' ');
        log(`Loading ${model.label} failed (${load.code}): ${detail}`);
        const pick = await vscode.window.showErrorMessage(
            `Loading ${model.label} failed. ${why ?? detail.slice(0, 300)}`,
            'Copy details',
            'Show status'
        );
        if (pick === 'Copy details') {
            await vscode.env.clipboard.writeText(`lms load failed (${load.code})\n${detail}\n\n${newestServerLogTail(120)}`);
        }
        if (pick === 'Show status') await vscode.commands.executeCommand('avaloniaDesigner.assistant.status');
        return undefined;
    }

    progress.report({ message: 'waiting for it to answer…' });
    for (let i = 0; i < 60; i++) {
        const api = await readApi();
        if (api?.ids.some((m) => m.id === options.identifier && /loaded/i.test(m.state))) break;
        await new Promise((r) => setTimeout(r, 1000));
    }
    return { endpoint };
}

/** A one-line round trip, so "ready" means ready rather than "the CLI exited 0". */
async function proveItWorks(): Promise<boolean> {
    const cfg = vscode.workspace.getConfiguration(SETTINGS);
    const live = normalizeAssistantConfig({
        backend: 'external',
        endpoint: cfg.get<string>('endpoint', ''),
        model: cfg.get<string>('model', ''),
        timeoutSeconds: 180
    });
    try {
        const answer = await chat(live, [{ role: 'user', content: 'Reply with the single word: ready' }], {});
        log(`Test request answered: ${answer.trim().slice(0, 60)}`);
        return answer.trim().length > 0;
    } catch (err) {
        log(`Test request failed: ${err instanceof Error ? err.message : String(err)}`);
        return false;
    }
}

/** "A server I run myself" — for Ollama, a hand-built llama-server, or anything else. */
async function askForEndpoint(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration(SETTINGS);
    const endpoint = await vscode.window.showInputBox({
        title: 'Address of your local server',
        value: cfg.get<string>('endpoint', 'http://127.0.0.1:1234/v1'),
        placeHolder: 'http://127.0.0.1:11434/v1',
        prompt: 'The OpenAI-compatible base URL, ending in /v1',
        ignoreFocusOut: true,
        validateInput: (v) => (/^https?:\/\/\S+$/i.test(v.trim()) ? undefined : 'An http:// or https:// address')
    });
    if (!endpoint) return;
    await cfg.update('backend', 'external', vscode.ConfigurationTarget.Global);
    await cfg.update('endpoint', endpoint.trim(), vscode.ConfigurationTarget.Global);
    void vscode.window.showInformationMessage(
        'Endpoint saved. Run "AI: Status and Hardware Check" to see the models it offers, and to pin one.'
    );
}

/** "AI: Unload the Loaded Model" — frees the memory without hunting for the GUI. */
export async function unloadLoadedModel(): Promise<void> {
    const cli = findLmsCli();
    if (!cli) {
        void vscode.window.showWarningMessage('LM Studio is not installed on this machine.');
        return;
    }
    const result = await run(cli, ['unload', '--all'], 60000);
    if (result.code !== 0) {
        void vscode.window.showErrorMessage(`Could not unload: ${(result.stderr || result.stdout).trim().slice(0, 300)}`);
        return;
    }
    log('LM Studio models unloaded');
    void vscode.window.showInformationMessage('The loaded model has been unloaded — its memory is free again.');
}
