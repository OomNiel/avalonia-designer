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

import * as vscode from 'vscode';
import { normalizeAssistantConfig } from './assistant';
import { log } from './logger';
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
import { MODEL_SPECS, specById, specByFileName } from './modelSpecs';
import { modelLabel, recommendedLoadOptions, type LoadOptions, type LocalModel } from './localModels';
import { ensureBundledEndpoint, ensureModelFile } from './modelRuntime';

export const SETTINGS = 'avaloniaDesigner.assistant';

/** One entry in the panel's model dropdown. `value` is what the panel sends back. */
export interface ModelChoice {
    value: string;
    label: string;
    detail: string;
    /** What kind of thing it is, so the panel can explain why a load will take a while. */
    kind: 'lmstudio' | 'file' | 'bundled' | 'custom';
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
export function buildChoices(found: Discovery, files: FoundModelFile[], endpoint: string): ModelChoice[] {
    const choices: ModelChoice[] = [];
    for (const model of chatModels(found)) {
        const loaded = found.loaded.some((id) => id === model.key || id.endsWith(model.key));
        choices.push({
            value: choiceValue('lms', model.key),
            label: `${modelLabel(model)}${loaded ? '   ● loaded' : ''}`,
            detail: `LM Studio · ${loaded ? 'already in memory' : 'on disk, ready to load'}`,
            kind: 'lmstudio'
        });
    }
    for (const spec of MODEL_SPECS) {
        choices.push({
            value: choiceValue('bundled', spec.id),
            label: `${spec.label}  ·  ${Math.round(spec.bytes / (1024 * 1024 * 1024) * 10) / 10} GB  ·  download once`,
            detail: 'This extension\'s own runtime — needs nothing but the .NET SDK',
            kind: 'bundled'
        });
    }
    for (const file of files) {
        choices.push({
            value: choiceValue('file', file.file),
            label: `${file.name}  ·  ${file.sizeGb.toFixed(1)} GB`,
            detail: `Found on this machine · ${file.folder}`,
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
    return match ? match.value : '';
}

/** Everything the panel needs to draw itself, in one message. */
export async function panelState(fresh = false): Promise<PanelState> {
    const cfg = vscode.workspace.getConfiguration(SETTINGS);
    const backend = cfg.get<string>('backend', 'off');
    const endpoint = cfg.get<string>('endpoint', '') || 'http://127.0.0.1:1234/v1';
    if (fresh) scanned = [];
    const found = await discover();
    const choices = buildChoices(found, scanned, endpoint);
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
            : `LM Studio is not installed — ${MODEL_SPECS.length} downloadable model(s) and files found on disk still work`
    };
}

export interface LoadOutcome {
    ok: boolean;
    /** Where it ended up, for the panel to show. */
    endpoint?: string;
    message?: string;
    /** What the load cost, when the CLI estimated it. */
    estimate?: string;
}

/**
 * Loads whatever the dropdown points at. Every kind ends the same way — the extension wired to something
 * that answers — but the road differs: LM Studio models are unloaded-then-loaded, a stray `.gguf` is
 * imported into LM Studio first (or handed to our own runtime when LM Studio is absent), the bundled ones
 * are downloaded and started, and "a server I run myself" is just an address.
 */
export async function loadChoice(context: vscode.ExtensionContext, state: PanelState, value: string): Promise<LoadOutcome> {
    const cfg = vscode.workspace.getConfiguration(SETTINGS);
    const { kind, key } = parseChoiceValue(value);
    const options: LoadOptions = {
        contextLength: state.options.contextLength,
        gpu: state.options.gpu,
        ttlSeconds: state.options.ttlSeconds,
        identifier: '',
        reasons: []
    };
    const facts = setupFacts();
    const report = (message: string) => progress(message);

    if (kind === 'custom') {
        if (!/^https?:\/\/\S+$/i.test(key)) return { ok: false, message: 'That address does not look like an http:// URL.' };
        await cfg.update('backend', 'external', vscode.ConfigurationTarget.Global);
        await cfg.update('endpoint', key, vscode.ConfigurationTarget.Global);
        await cfg.update('model', '', vscode.ConfigurationTarget.Global);
        return { ok: true, endpoint: key };
    }

    if (kind === 'bundled') {
        const spec = specById(key);
        if (!spec) return { ok: false, message: `Unknown bundled model "${key}".` };
        progress('preparing the extension\'s own runtime…');
        const file = await ensureModelFile(context, spec, {
            report: ({ message }) => progress(message ?? '')
        } as vscode.Progress<{ message?: string }>);
        await cfg.update('backend', 'bundled', vscode.ConfigurationTarget.Global);
        await cfg.update('modelPath', file, vscode.ConfigurationTarget.Global);
        await cfg.update('model', '', vscode.ConfigurationTarget.Global);
        const endpoint = await startBundled(file, cfg.get<number>('threads', 0));
        return { ok: true, endpoint, message: `${spec.label} is answering from the extension's own runtime.` };
    }

    if (kind === 'file') {
        if (!foundLms()) {
            // No LM Studio: our own runtime takes any .gguf, which is exactly why the scan is worth it.
            progress('starting the extension\'s own runtime for this file…');
            await cfg.update('backend', 'bundled', vscode.ConfigurationTarget.Global);
            await cfg.update('modelPath', key, vscode.ConfigurationTarget.Global);
            const endpoint = await startBundled(key, cfg.get<number>('threads', 0));
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
        return await loadLmStudio(model, options, facts, refreshed, report);
    }

    const found = await discover();
    const model = chatModels(found).find((m) => m.key === key);
    if (!model) return { ok: false, message: `"${key}" is not in the LM Studio list any more — press Refresh list.` };
    return await loadLmStudio(model, options, facts, found, report);
}

/** Starts (and if needed builds) the extension's own runtime and returns its endpoint. */
async function startBundled(modelPath: string | undefined, threads: number): Promise<string> {
    const cfg = normalizeAssistantConfig({
        backend: 'bundled',
        modelPath,
        threads,
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
    log(`Panel load: ${model.key} → ${result.endpoint}`);
    return {
        ok: true,
        endpoint: result.endpoint,
        message: result.unloaded.length
            ? `Loaded ${model.key} (unloaded ${result.unloaded.join(', ')} first).`
            : `Loaded ${model.key}.`,
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

/** What the panel's Save sends. Everything here is a setting the user just looked at. */
export interface AiSettingsInput {
    enabled: boolean;
    value: string;
    contextLength: number;
    gpu: string;
    ttlSeconds: number;
    maxTokens: number;
    timeoutSeconds: number;
    endpoint: string;
}

/**
 * Saves the AI choices. **Switching off unloads the model**, which is the point of a switch that says
 * "no AI": leaving 17 GB of weights resident after the user turned the feature off would be a strange
 * thing to do to their machine.
 *
 * The load options are stored as settings even though they only matter at load time, so the panel can say
 * "reload to apply" instead of silently ignoring a change.
 */
export async function saveAiSettings(input: AiSettingsInput): Promise<void> {
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
 * Where progress goes. The panel is the only surface: its own line of text, so a multi-minute load shows
 * what it is doing without a notification stealing focus.
 */
let progressTarget: vscode.Webview | undefined;
let currentPanel: vscode.WebviewPanel | undefined;

export function attachPanel(panel: vscode.WebviewPanel | undefined): void {
    currentPanel = panel;
    progressTarget = panel?.webview;
}

export function progress(message: string, webview?: vscode.Webview): void {
    const target = webview ?? progressTarget;
    if (!target) return;
    void target.postMessage({ type: 'aiProgress', message });
}

export function panelFor(): vscode.WebviewPanel | undefined {
    return currentPanel;
}
