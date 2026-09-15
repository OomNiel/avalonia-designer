/* The AI section of the designer's ⚙ Settings panel — the extension half.
 *
 * Why it lives here and not in `assistantUi.ts`: this is the *designer webview's* conversation. The panel
 * renders the panel's own markup (`designerPanel.ts` holds the HTML, `media/designer.js` the behaviour),
 * and this module answers its messages: what models exist, load one, unload, run the status check, and
 * store the choices.
 *
 * The operations themselves are `localModelCore.ts` — the very same ones the Command Palette uses, so
 * "Load Model" here and "AI: Choose a Local Model…" there cannot behave differently. What is specific to
 * this file is only the *shaping* of the state the panel shows, and the fact that progress is posted to a
 * webview instead of reported in a notification.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { normalizeAssistantConfig, looksLikeEmbeddingModel, probeServer } from './assistant';
import { log, logError } from './logger';
import {
    chatModels,
    discover,
    findLmsCli,
    importModelFile,
    lmStudioModelsRoot,
    load,
    scanForModelFiles,
    setupFacts,
    unloadAll,
    type Discovery,
    type FoundModelFile
} from './localModelCore';
import { MODEL_SPECS, DEFAULT_CONTEXT_SIZE, specById, specByFileName, type ModelSpec } from './modelSpecs';
import {
    modelLabel,
    recommendedLoadOptions,
    resolveLoadOptions,
    sidecarContextSize,
    sidecarGpuLayers,
    type LoadOptions,
    type LocalModel,
    type RequestedLoad
} from './localModels';
import { bundledFilesOnDisk, bundledRuntimeRunning, ensureBundledEndpoint, ensureModelFile, modelFileFor } from './modelRuntime';
import { proveItWorks } from './localModelSetup';

export const SETTINGS = 'avaloniaDesigner.assistant';

/** One entry in the panel's model dropdown. `value` is what the panel sends back. */
export interface ModelChoice {
    value: string;
    label: string;
    detail: string;
    /** What kind of thing it is, so the panel can explain why a load will take a while. */
    kind: 'lmstudio' | 'file' | 'bundled' | 'custom' | 'any';
    /** True for the entry that is serving requests right now — what "● loaded" means. */
    live?: boolean;
}

export interface PanelState {
    enabled: boolean;
    endpoint: string;
    /** The value of the entry that matches the settings right now, or '' when nothing matches. */
    selected: string;
    choices: ModelChoice[];
    options: {
        contextLength: number;
        gpu: string;
        ttlSeconds: number;
        maxTokens: number;
        timeoutSeconds: number;
        /** The values this machine would get, so "recommended" is never a mystery. */
        recommended: { contextLength: number; gpu: string; ttlSeconds: number };
    };
    /** A line under the dropdown: what is loaded, what was found by a scan, or why the list is empty. */
    hint: string;
    /** What requests will actually use, in words — the panel's answer to "did my load take?". */
    pinned: string;
}

/** Anything a scan found this session, kept so the dropdown does not lose it on the next refresh. */
let scanned: FoundModelFile[] = [];

/** `lms:<key>` · `file:<path>` · `bundled:<specId>` · `custom:<url>` */
export function choiceValue(kind: string, key: string): string {
    return `${kind}:${key}`;
}

export function parseChoiceValue(value: string): { kind: string; key: string } {
    const at = String(value ?? '').indexOf(':');
    if (at < 0) return { kind: '', key: '' };
    return { kind: value.slice(0, at), key: value.slice(at + 1) };
}

/** Builds the dropdown: everything that could be loaded, in the order a developer would look. */
export function buildChoices(found: Discovery, files: FoundModelFile[], endpoint: string, backend = 'off', modelPath = '', bundled: Record<string, { onDisk: boolean; bytes: number }> = {}): ModelChoice[] {
    const choices: ModelChoice[] = [];
    // "Whatever is loaded" is a real answer, and it is the one the settings most often hold (`model` empty).
    // Without an entry for it the dropdown showed the *first* LM Studio model as if it had been chosen — and
    // pressing Save then pinned a model nobody picked (found while verifying the selection, 2026-09-15).
    choices.push({
        value: choiceValue('any', ''),
        label: 'Let the server decide — whatever it has loaded',
        detail: found.loaded.length
            ? `${found.loaded.length} model(s) in memory right now`
            : 'nothing is in memory right now — a request would fail until something is loaded',
        kind: 'any'
    });
    for (const model of chatModels(found)) {
        const loaded = found.loaded.some((id) => id === model.key || id.endsWith(model.key));
        choices.push({
            value: choiceValue('lms', model.key),
            label: `${modelLabel(model)}${loaded ? '   ● loaded' : ''}`,
            // These *are* LM Studio's library entries (`lms ls` is what My Models shows), and saying so is the
            // answer to "why does a model have to be in My Models?": the extension is only a remote control
            // here — LM Studio is the runtime, and it can only load what it has an entry for (2026-09-15).
            detail: `LM Studio · ${loaded ? 'in memory now' : 'in My Models, ready to load'}`,
            kind: 'lmstudio',
            live: loaded
        });
    }
    for (const spec of MODEL_SPECS) {
        // A bundled model pins through `modelPath`, and the runtime shows it is up — so this is the marker
        // that tells the user their load took. Without it, loading the extension's own model looked like
        // nothing had happened (reported 2026-09-15).
        const running = bundledRuntimeRunning();
        const isPinned = backend === 'bundled' && !!modelPath && modelPath.endsWith(spec.fileName);
        // Whether these weights are already on this machine, said outright. "Downloaded once when you press
        // Load Model" was true of every entry and therefore told the user nothing — a 4.4 GB entry that had
        // never been fetched looked exactly like the ready one (asked 2026-09-15: "the Qwen models does not
        // work - Not downloaded???").
        const disk = bundled[spec.id];
        const sizeGb = Math.round(spec.bytes / (1024 * 1024 * 1024) * 10) / 10;
        const state = disk?.onDisk
            ? 'weights on disk, ready to load'
            : disk && disk.bytes > 0
                ? 'a partial download is on disk — Load Model resumes it'
                : disk
                    ? `not downloaded yet — ${sizeGb} GB to fetch on the first load`
                    : `downloads once when you press Load Model (${sizeGb} GB)`;
        choices.push({
            value: choiceValue('bundled', spec.id),
            label: `${spec.label}  ·  ${Math.round(spec.bytes / (1024 * 1024 * 1024) * 10) / 10} GB`
                + `${isPinned && running.running ? '   ● in use' : isPinned ? '   ● pinned, runtime stopped' : ''}`,
            detail: `This extension's own runtime · ${state}`,
            kind: 'bundled',
            live: isPinned && running.running
        });
    }
    for (const file of files) {
        choices.push({
            value: choiceValue('file', file.file),
            label: `${file.name}  ·  ${file.sizeGb.toFixed(1)} GB`,
            // What pressing Load will actually do with a file that is *not* in LM Studio yet — the step that
            // was invisible, and the reason a model outside My Models looked unusable (2026-09-15).
            detail: found.cli
                ? `Found on this machine · ${file.folder} · added to LM Studio first (a symbolic link — your file stays where it is)`
                : `Found on this machine · ${file.folder} · served by the extension's own runtime (no LM Studio needed)`,
            kind: 'file'
        });
    }
    choices.push({
        value: choiceValue('custom', endpoint),
        label: 'A server I run myself  ·  any OpenAI-compatible address',
        detail: 'Ollama, llama.cpp or anything else already running — set the address below',
        kind: 'custom'
    });
    return choices;
}

/** The model the settings point at right now, as a dropdown value. */
export function currentSelection(choices: ModelChoice[], model: string, backend: string, modelPath: string): string {
    if (backend === 'bundled') {
        const byName = modelPath ? specByFileName(modelPath) : undefined;
        return choiceValue('bundled', (byName ?? MODEL_SPECS[0]).id);
    }
    const match = choices.find((c) => c.kind === 'lmstudio' && c.value === choiceValue('lms', model));
    return match ? match.value : choiceValue('any', '');
}

/** Everything the panel needs to draw itself, in one message. */
export async function panelState(fresh = false): Promise<PanelState> {
    const cfg = vscode.workspace.getConfiguration(SETTINGS);
    const backend = cfg.get<string>('backend', 'off');
    const endpoint = cfg.get<string>('endpoint', '') || 'http://127.0.0.1:1234/v1';
    if (fresh) scanned = [];
    const found = await discover();
    const choices = buildChoices(found, scanned, endpoint, backend, cfg.get<string>('modelPath', ''), bundledFilesOnDisk());
    if (choices.length === 0 && !found.cli) {
        choices.push({
            value: choiceValue('custom', endpoint),
            label: 'A server I run myself  ·  any OpenAI-compatible address',
            detail: 'LM Studio is not installed on this machine',
            kind: 'custom'
        });
    }

    // The recommendation needs a model to be sized against; without a selection the largest chat model is
    // the honest worst case, and model-free facts (RAM, lock limit) are what actually drive the numbers.
    const facts = setupFacts();
    const sample: LocalModel = chatModels(found)[0]
        ?? { provider: 'bundled', key: 'sample', label: 'sample', params: '', arch: '', sizeGb: 2, kind: 'chat' };
    const recommended = recommendedLoadOptions(sample, facts);

    return {
        enabled: backend !== 'off',
        endpoint,
        selected: currentSelection(choices, cfg.get<string>('model', ''), backend, cfg.get<string>('modelPath', '')),
        choices,
        options: {
            contextLength: cfg.get<number>('loadContextLength', 0) || recommended.contextLength,
            gpu: cfg.get<string>('loadGpu', '') || recommended.gpu,
            ttlSeconds: cfg.get<number>('loadTtlSeconds', -1) >= 0 ? cfg.get<number>('loadTtlSeconds', -1) : recommended.ttlSeconds,
            maxTokens: cfg.get<number>('maxTokens', 4096),
            timeoutSeconds: cfg.get<number>('timeoutSeconds', 60),
            recommended: {
                contextLength: recommended.contextLength,
                gpu: recommended.gpu,
                ttlSeconds: recommended.ttlSeconds
            }
        },
        hint: found.cli
            ? `${chatModels(found).length} LM Studio model(s) on disk · ${found.loaded.length} loaded`
            + (scanned.length ? ` · ${scanned.length} file(s) found by the scan` : ' · nothing scanned yet')
            : `LM Studio is not installed — ${MODEL_SPECS.length} downloadable model(s) and files found on disk still work`,
        pinned: describePin(backend, cfg.get<string>('model', ''), cfg.get<string>('modelPath', ''), endpoint, found)
    };
}

/**
 * What requests will actually use, said in words.
 *
 * The panel used to leave this to be inferred from the dropdown, and for a **bundled** model that inference
 * was impossible: the pin lives in `modelPath`, not `model`, and no bundled entry ever showed a loaded
 * marker — so a successful load looked like nothing had happened (reported 2026-09-15).
 */
function describePin(
    backend: string,
    model: string,
    modelPath: string,
    endpoint: string,
    found: Discovery
): string {
    if (backend === 'off') return 'AI assist is off — nothing is pinned.';
    const runtime = bundledRuntimeRunning();
    if (backend === 'bundled') {
        const spec = modelPath ? specByFileName(modelPath) : undefined;
        const name = spec?.label ?? (modelPath ? path.basename(modelPath) : 'the built-in model');
        return runtime.running
            ? `Pinned: ${name} — serving requests on ${runtime.endpoint}`
            : `Pinned: ${name} — the built-in runtime is not running; the next request starts it`;
    }
    if (model) {
        const inMemory = found.loaded.some((id) => id === model || id.endsWith(model));
        return `Pinned: ${model} on ${endpoint}${inMemory ? ' (in memory)' : ' — not in memory yet; the next request loads it'}`;
    }
    const loaded = found.loaded.filter((id) => !looksLikeEmbeddingModel(id));
    return loaded.length
        ? `Not pinned — ${endpoint} serves whatever is loaded (${loaded.join(', ')})`
        : `Not pinned, and nothing is loaded on ${endpoint} — a request will fail until something is loaded.`;
}

export interface LoadOutcome {
    ok: boolean;
    /** Where it ended up, for the panel to show. */
    endpoint?: string;
    message?: string;
    /** What the load cost, when the CLI estimated it. */
    estimate?: string;
}

/** True when the weights are already in the extension's storage. */
function fileOnDisk(context: vscode.ExtensionContext, spec: ModelSpec): boolean {
    try {
        return fs.statSync(modelFileFor(context, spec)).size === spec.bytes;
    } catch {
        return false;
    }
}

/** True when the sidecar has never been built, so the next start also restores NuGet packages. */
function firstBuildNote(context: vscode.ExtensionContext): boolean {
    return !fs.existsSync(path.join(context.extensionUri.fsPath, 'host', 'ModelHost', 'bin', 'Debug', 'net8.0'));
}

/**
 * What the panel sends, for a **load** and for a **save** alike. Deliberately **flat**, matching
 * `aiPayload()` in `media/designer.js` field for field — the two used to disagree (the webview sent this,
 * the extension read `state.options.contextLength`), which threw a TypeError before a single message could
 * be posted. That mismatch *was* "nothing further happens". One type for both directions means there is
 * nothing to drift, and `tests/t2-logic/panelContract.test.js` compares the two files field by field.
 */
export interface PanelAiRequest extends RequestedLoad {
    /** The AI switch. A load implies "on", so the load path does not read it; Save does. */
    enabled: boolean;
    /** The dropdown value (`lms:<key>`, `file:<path>`, `bundled:<id>`, `custom:<url>`). */
    value: string;
    /** Answer budget and timeout — request settings, applied by Save rather than by a load. */
    maxTokens: number;
    timeoutSeconds: number;
    endpoint: string;
}

export async function loadChoice(context: vscode.ExtensionContext, request: PanelAiRequest, value?: string): Promise<LoadOutcome> {
    const cfg = vscode.workspace.getConfiguration(SETTINGS);
    const { kind, key } = parseChoiceValue(value ?? request.value ?? '');
    resetProgressClock();
    aiLog(context, `Load requested: kind=${kind} key=${key}`);
    // Nothing below may throw: a load that dies without a word is what "nothing further happens" was, and
    // the user has no way to tell a slow step from a dead one. Every exit is a LoadOutcome with a sentence.
    try {
        return await startLoad(context, cfg, request, kind, key);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        aiLog(context, `Load FAILED: ${message}`);
        logError(`AI load failed: ${message}`);
        return { ok: false, message: `${message} (details in ${aiLogFile(context)})` };
    }
}

async function startLoad(
    context: vscode.ExtensionContext,
    cfg: vscode.WorkspaceConfiguration,
    request: PanelAiRequest,
    kind: string,
    key: string
): Promise<LoadOutcome> {
    const facts = setupFacts();
    const report = (message: string) => progress(message);

    if (kind === 'custom') {
        if (!/^https?:\/\/\S+$/i.test(key)) return { ok: false, message: 'That address does not look like an http:// URL.' };
        await cfg.update('backend', 'external', vscode.ConfigurationTarget.Global);
        await cfg.update('endpoint', key, vscode.ConfigurationTarget.Global);
        await cfg.update('model', '', vscode.ConfigurationTarget.Global);
        return { ok: true, endpoint: key };
    }

    if (kind === 'any') {
        // Nothing to load: the point is to check that the server this points at has something to serve.
        // Today's failure mode was exactly that — "on" in the panel, `HTTP 400 No models loaded` on the wire.
        progress('asking the server what it has loaded…');
        const live = normalizeAssistantConfig({
            backend: 'external',
            endpoint: request.endpoint || cfg.get<string>('endpoint', ''),
            model: '',
            timeoutSeconds: request.timeoutSeconds
        });
        await cfg.update('backend', 'external', vscode.ConfigurationTarget.Global);
        await cfg.update('model', '', vscode.ConfigurationTarget.Global);
        const answer = await proveItWorks();
        const probe = await probeServer(live);
        const chat = (probe.models ?? []).filter((m) => !looksLikeEmbeddingModel(m.id));
        aiLog(context, `Any-model load: ${chat.length} chat model(s) offered, test request ${answer.ok ? 'answered' : 'failed'}`);
        if (!answer.ok) {
            return {
                ok: false,
                endpoint: live.endpoint,
                message: `Nothing is answering on ${live.endpoint}. ${answer.why ?? ''} Load a model there, or pick one from the list.`
            };
        }
        return {
            ok: true,
            endpoint: live.endpoint,
            message: `Ready — ${live.endpoint} answers, and requests will use whichever model it has loaded`
                + `${chat.length > 1 ? ` (it offers ${chat.length} — pick one above to make answers reproducible)` : ''}.`
        };
    }

    if (kind === 'bundled') {
        const spec = specById(key);
        if (!spec) return { ok: false, message: `Unknown bundled model "${key}".` };
        // Say which of the two things is about to happen. The webview cannot know — it used to guess
        // "downloading (first time)" even when the weights were already on disk (the user's report,
        // 2026-09-15), which sent them looking for a download that never started.
        const already = fileOnDisk(context, spec);
        progress(already
            ? `${spec.label} is already on disk — starting the built-in runtime${firstBuildNote(context) ? ' (its first build downloads the inference library, which can take a few minutes)' : ''}…`
            : `downloading ${spec.label} — this can take a few minutes…`);
        aiLog(context, `Bundled load: file=${already ? 'on disk' : 'to download'} path=${modelFileFor(context, spec)}`);
        const file = await ensureModelFile(context, spec, {
            report: ({ message }) => progress(message ?? '')
        } as vscode.Progress<{ message?: string }>);
        aiLog(context, `Weights ready: ${file}`);
        await cfg.update('backend', 'bundled', vscode.ConfigurationTarget.Global);
        await cfg.update('modelPath', file, vscode.ConfigurationTarget.Global);
        await cfg.update('model', '', vscode.ConfigurationTarget.Global);
        progress('starting the built-in runtime…');
        const endpoint = await startBundled(request, file, cfg.get<number>('threads', 0));
        aiLog(context, `Bundled runtime answering on ${endpoint}`);
        return { ok: true, endpoint, message: `${spec.label} is answering from the extension's own runtime.` };
    }

    if (kind === 'file') {
        if (!foundLms()) {
            // No LM Studio: our own runtime takes any .gguf, which is exactly why the scan is worth it.
            progress('starting the extension\'s own runtime for this file…');
            await cfg.update('backend', 'bundled', vscode.ConfigurationTarget.Global);
            await cfg.update('modelPath', key, vscode.ConfigurationTarget.Global);
            const endpoint = await startBundled(request, key, cfg.get<number>('threads', 0));
            aiLog(context, `File served by the built-in runtime: ${key} → ${endpoint}`);
            return { ok: true, endpoint, message: `${key} is answering from the extension's own runtime.` };
        }
        progress('importing it into LM Studio (a symbolic link, your file stays where it is)…');
        const imported = await importModelFile(key, { onProgress: report });
        if (!imported.ok || !imported.key) {
            return { ok: false, message: imported.message ?? 'The import did not add a model — see the Avalonia Designer output.' };
        }
        const refreshed = await discover();
        const model = chatModels(refreshed).find((m) => m.key === imported.key);
        if (!model) return { ok: false, message: `Imported, but "${imported.key}" is not in the model list.` };
        return await loadLmStudio(model, resolveLoadOptions(model, request, facts), facts, refreshed, report);
    }

    const found = await discover();
    const model = chatModels(found).find((m) => m.key === key);
    if (!model) return { ok: false, message: `"${key}" is not in the LM Studio list any more — press Refresh list.` };
    return await loadLmStudio(model, resolveLoadOptions(model, request, facts), facts, found, report);
}

/** Starts (and if needed builds) the extension's own runtime and returns its endpoint. */
async function startBundled(request: RequestedLoad, modelPath: string | undefined, threads: number): Promise<string> {
    // The panel's choices reach the built-in runtime too (2026-09-18): context length is `--ctx`, and the
    // GPU field, which is a *ratio* for LM Studio, becomes a layer count for llama.cpp. Before this, the
    // built-in runtime always started with its own defaults and the two fields were silently ignored.
    const cfg = normalizeAssistantConfig({
        backend: 'bundled',
        modelPath,
        threads,
        contextSize: sidecarContextSize(request.contextLength, DEFAULT_CONTEXT_SIZE),
        gpuLayers: sidecarGpuLayers(request.gpu),
        endpoint: '',
        model: ''
    });
    return ensureBundledEndpoint(cfg);
}

/** A `lms` on this machine, asked through the core so both front doors see the same answer. */
function foundLms(): boolean {
    return !!findLmsCli();
}

async function loadLmStudio(
    model: LocalModel,
    options: LoadOptions,
    facts: ReturnType<typeof setupFacts>,
    found: Discovery,
    onProgress: (message: string) => void
): Promise<LoadOutcome> {
    const withId: LoadOptions = { ...options, identifier: model.key };
    const result = await load({ model, options: withId, facts, server: found.server, onProgress });
    if (result.cancelled) return { ok: false, message: 'Cancelled.' };
    if (!result.ok || !result.endpoint) return { ok: false, message: result.message ?? 'The load failed.' };
    const cfg = vscode.workspace.getConfiguration(SETTINGS);
    await cfg.update('backend', 'external', vscode.ConfigurationTarget.Global);
    await cfg.update('endpoint', result.endpoint, vscode.ConfigurationTarget.Global);
    await cfg.update('model', model.key, vscode.ConfigurationTarget.Global);
    // "lms load exited 0" is not "a request works". The bundled path proves itself with a one-line round trip
    // and this one did not — which is how the panel could say "on" while the wire said
    // `HTTP 400 No models loaded` (2026-09-15). Same proof, both paths.
    onProgress('checking that it answers…');
    const proof = await proveItWorks();
    log(`Panel load: ${model.key} → ${result.endpoint} (test request ${proof.ok ? 'answered' : 'FAILED'})`);
    if (!proof.ok) {
        return {
            ok: false,
            endpoint: result.endpoint,
            message: `${model.key} is loaded on ${result.endpoint}, but a test request failed: ${proof.why ?? 'no answer'}`
        };
    }
    return {
        ok: true,
        endpoint: result.endpoint,
        message: result.unloaded.length
            ? `Loaded ${model.key} (unloaded ${result.unloaded.join(', ')} first) and it answered a test request.`
            : `Loaded ${model.key} and it answered a test request.`,
        estimate: result.estimate
            ? `Estimated ${result.estimate.totalGiB.toFixed(1)} GB of memory at ${result.estimate.contextLength} tokens `
            + `(confidence ${result.estimate.confidence}).`
            : undefined
    };
}

/** "Unload" — the user chose `lms unload --all`, so this frees everything LM Studio holds. */
export async function unloadEverything(): Promise<LoadOutcome> {
    const result = await unloadAll();
    return result.ok
        ? { ok: true, message: 'Every model is unloaded — the memory is free.' }
        : { ok: false, message: result.message };
}

/** What the panel's Save sends. The same shape a load carries, read through the same type. */
export type AiSettingsInput = PanelAiRequest;

/**
 * Saves the AI choices. **Switching off unloads the model**, which is the point of a switch that says
 * "no AI": leaving 17 GB of weights resident after the user turned the feature off would be a strange
 * thing to do to their machine.
 *
 * The load options are stored as settings even though they only matter at load time, so the panel can say
 * "reload to apply" instead of silently ignoring a change.
 */
export async function saveAiSettings(input: PanelAiRequest): Promise<void> {
    const cfg = vscode.workspace.getConfiguration(SETTINGS);
    const target = vscode.ConfigurationTarget.Global;
    await cfg.update('maxTokens', Math.min(16384, Math.max(64, Math.round(input.maxTokens) || 4096)), target);
    await cfg.update('timeoutSeconds', Math.min(600, Math.max(5, Math.round(input.timeoutSeconds) || 60)), target);
    await cfg.update('loadContextLength', Math.max(0, Math.round(input.contextLength) || 0), target);
    await cfg.update('loadGpu', /^(auto|off|max|0\.\d+)$/.test(input.gpu) ? input.gpu : 'auto', target);
    await cfg.update('loadTtlSeconds', Math.max(0, Math.round(input.ttlSeconds) || 0), target);
    if (input.enabled) {
        const { kind } = parseChoiceValue(input.value);
        // The kind decides which setting owns the answer: `model` for a server, `modelPath` for a file.
        if (kind === 'bundled' || kind === 'file') {
            await cfg.update('backend', 'bundled', target);
        } else if (kind === 'any') {
            // "Let the server decide" must stay that way — writing a model key here is what pinned a model the
            // user never chose.
            await cfg.update('backend', 'external', target);
            await cfg.update('model', '', target);
        } else {
            await cfg.update('backend', 'external', target);
            await cfg.update('model', kind === 'lmstudio' ? parseChoiceValue(input.value).key : '', target);
            if (kind === 'custom' && /^https?:\/\/\S+$/i.test(input.endpoint)) {
                await cfg.update('endpoint', input.endpoint.trim(), target);
            }
        }
        await vscode.commands.executeCommand('setContext', 'avaloniaDesigner.aiEnabled', true);
        log(`AI assist enabled (${input.value || 'no model chosen yet'})`);
        return;
    }
    await cfg.update('backend', 'off', target);
    await vscode.commands.executeCommand('setContext', 'avaloniaDesigner.aiEnabled', false);
    const unloaded = await unloadAll();
    log(`AI assist disabled — model unloaded${unloaded.ok ? '' : ` (${unloaded.message})`}`);
}

/** "Scan machine for models…" — bounded, and it never throws at the panel. */
export async function scan(webview: vscode.Webview, onDone: (state: PanelState) => Promise<void>): Promise<void> {
    scanned = await scanForModelFiles({
        onProgress: (message) => progress(message, webview),
        roots: undefined
    });
    // Files already inside LM Studio's folder are counted and skipped by the core: `lms ls` lists them.
    progress(
        scanned.length
            ? `found ${scanned.length} model file(s) outside ${lmStudioModelsRoot().replace(process.env.HOME ?? '', '~')}`
            : 'no model files found outside LM Studio\'s own folder',
        webview
    );
    await onDone(await panelState());
}

/**
 * Where progress goes, and which panels to keep in step.
 *
 * Every open panel is kept, not just the last one that spoke: a designer tab that is not active hears nothing,
 * so its AI section keeps the state from whenever it was opened — the picker showing "Let the server decide"
 * while another tab had loaded a model, and the same panel showing a dropdown that never followed the load the
 * user had just performed (reported 2026-09-15).
 */
let progressTarget: vscode.Webview | undefined;
let currentPanel: vscode.WebviewPanel | undefined;
const openPanels = new Set<vscode.WebviewPanel>();

/** The last line posted, so the elapsed-time ticker can keep showing it with a growing counter. */
let lastProgress = '';
let progressTimer: ReturnType<typeof setInterval> | undefined;

/**
 * Reports progress **and keeps reporting it**: a step that takes minutes (a download, the first NuGet
 * build, a model load) used to sit on one stale line, which the user read as "nothing further happens"
 * even while work was in flight. The ticker re-posts the same message with the seconds spent, and any new
 * message replaces it.
 */
export function progress(message: string, webview?: vscode.Webview): void {
    lastProgress = message;
    if (webview) {
        void webview.postMessage({ type: 'aiProgress', message });
    } else if (openPanels.size) {
        // No explicit target: every open panel shows the same line, so a load started in one tab is visible in
        // the others too instead of leaving them with a line that never changes.
        for (const panel of openPanels) void panel.webview.postMessage({ type: 'aiProgress', message });
    } else if (progressTarget) {
        void progressTarget.postMessage({ type: 'aiProgress', message });
    }
    if (progressTimer) return;
    progressTimer = setInterval(() => {
        const still = progressTarget;
        if (!still || !lastProgress) return;
        const seconds = Math.round((Date.now() - progressStarted) / 1000);
        const line = `${lastProgress}  (${seconds} s)`;
        for (const panel of openPanels) void panel.webview.postMessage({ type: 'aiProgress', message: line });
    }, 2000);
}

let progressStarted = Date.now();

export function stopProgress(): void {
    if (progressTimer) clearInterval(progressTimer);
    progressTimer = undefined;
    lastProgress = '';
}

/** Restarts the elapsed-time clock (called when a new load begins). */
export function resetProgressClock(): void {
    progressStarted = Date.now();
}

/**
 * A line in the extension's own log file, for the failures that cannot be reproduced from here.
 *
 * "Downloading is not starting … nothing further happens" is exactly the kind of report that needs the
 * other end's log, and the Output channel is not something a user can hand over. Best-effort: a broken log
 * must never break a load.
 */
function aiLogFile(context: vscode.ExtensionContext): string {
    const dir = path.join(context.globalStorageUri.fsPath, 'logs');
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'ai.log');
}

export function aiLog(context: vscode.ExtensionContext, line: string): void {
    const text = `[${new Date().toISOString()}] ${line}`;
    log(text);
    try {
        const file = aiLogFile(context);
        if (fs.existsSync(file) && fs.statSync(file).size > 512 * 1024) fs.rmSync(file, { force: true });
        fs.appendFileSync(file, text + '\n');
    } catch {
        /* logging must never be the reason a load fails */
    }
}

export function attachPanel(panel: vscode.WebviewPanel | undefined): void {
    currentPanel = panel;
    progressTarget = panel?.webview;
    if (!panel) return;
    if (!openPanels.has(panel)) {
        openPanels.add(panel);
        // Pruned on dispose so a closed designer tab cannot be posted to for the rest of the session.
        try { panel.onDidDispose(() => openPanels.delete(panel)); } catch { /* already gone */ }
    }
}

/** Every designer tab that is open, so a broadcast can reach all of them. */
export function panelsFor(): vscode.WebviewPanel[] {
    return [...openPanels];
}

export function panelFor(): vscode.WebviewPanel | undefined {
    return currentPanel;
}

/**
 * Re-sends the panel its state, if a panel is open.
 *
 * The state it draws is not only the settings: an LM Studio model can enter memory *outside* the panel — a
 * request loads it just-in-time — and the panel has no way to hear about that. Refreshing after a request,
 * and when the panel regains focus, is what keeps `● loaded` and the "in memory" hint true instead of a
 * snapshot from whenever the panel was opened (reported 2026-09-15: "as soon as a task is assigned the model
 * is marked as loaded" while the panel still said it was not).
 *
 * Never throws: it is called from paths where a failed refresh must not become a failed action. It reaches
 * **every** open panel, including designer tabs that are not the active one.
 */
export async function refreshAiState(): Promise<void> {
    if (!openPanels.size) return;
    try {
        const state = await panelState();
        for (const panel of openPanels) void panel.webview.postMessage({ type: 'aiState', state });
    } catch {
        /* the panel may be mid-dispose — a refresh is never worth an error */
    }
}
