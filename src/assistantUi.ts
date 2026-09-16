/* Local AI assist — the VS Code side.
 *
 * Everything the developer sees lives here: the dialog that asks what the method should do, the diff
 * that shows the proposal, the apply step (a normal, undoable edit), the optional build that verifies
 * it, and the Code Action that offers the same thing for a finding the checker already published.
 *
 * The split from `assistant.ts` is deliberate: that module is pure logic the test suite drives without
 * VS Code (prompts, parsers, span maths, client), this one is the thin part that needs an editor. The
 * rule that keeps the feature honest lives in `proposeMethod`: the model's text is never written behind
 * the developer's back — they see a diff first — and the deterministic checker keeps owning the
 * structural fixes, so the model is only asked about problems a rule cannot express.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
    addMemberToFile,
    addXamlEventAttribute,
    allowanceText,
    answerBudget,
    assistantEnabled,
    assessHardware,
    buildFixPrompt,
    buildGeneratePrompt,
    buildImplementPrompt,
    chat,
    chatDetailed,
    contextForBudget,
    descriptionAllowance,
    describeEmptyAnswer,
    describeModel,
    describeLoadedNow,
    enclosingTypeSpan,
    estimateTokens,
    extractCode,
    fitPromptParts,
    handlerFromMemberName,
    knownControlNames,
    looksLikeEmbeddingModel,
    memberNameOf,
    memberSignatures,
    methodTooLong,
    normaliseMemberVisibility,
    normalizeAssistantConfig,
    parseNewMemberAnswer,
    probeServer,
    promptRoom,
    readHardwareFacts,
    sniffMemberName,
    spliceMethod,
    unwrapMemberBlock,
    type AssistantConfig,
    type ChatMessage,
    type MemberInfo,
    type PromptFit,
    type PromptPart,
    type ServerModelInfo,
    type TypeSpan
} from './assistant';
import { analyzeCodeBehind, methodsIn, publishIssues, type MethodSpan } from './codeBehindCheck';
import { log } from './logger';
import { DEFAULT_CONTEXT_SIZE } from './modelSpecs';
import { sidecarContextSize, sidecarGpuLayers } from './localModels';
import { loadedNow } from './localModelCore';
import { refreshAiState } from './aiPanel';
import { configView, updateSetting } from './settingWrite';
import { panelFor } from './aiPanel';
import { findRunningLlamaServer, llamaServerBinary, llamaServerStatusLines } from './llamaServer';
import { bundledStatusLines, ensureBundledEndpoint, sidecarTail } from './modelRuntime';
import {
    addCustomModelSpec,
    customModelSpecs,
    ensureModelFile,
    extensionContext,
    fetchHubFiles,
    removeCustomModelSpec
} from './modelRuntime';
import { canRunSpec, formatBytes, hubFileSpec, parseHubUrl, shortHash } from './modelSpecs';

const SETTINGS = 'avaloniaDesigner.assistant';

/** Reads the settings. Kept in one place so the commands and the Code Action agree. */
export function assistantConfig(): AssistantConfig {
    const cfg = configView(SETTINGS);
    return normalizeAssistantConfig({
        backend: cfg.get<string>('backend', 'off'),
        endpoint: cfg.get<string>('endpoint', ''),
        model: cfg.get<string>('model', ''),
        modelPath: cfg.get<string>('modelPath', ''),
        threads: cfg.get<number>('threads', 0),
        // The built-in runtime reads these when it starts. They are the panel's load options, because a
        // model started later by a request has to start with the same values the panel showed.
        contextSize: sidecarContextSize(
            // The window grows to hold the answer budget *and* the prompt — the two used to be chosen
            // independently and could not both fit in 4096 (fixed 2026-09-16, see `contextForBudget`).
            cfg.get<number>('loadContextLength', 0),
            contextForBudget(cfg.get<number>('loadContextLength', 0), cfg.get<number>('maxTokens', 4096))
        ),
        gpuLayers: sidecarGpuLayers(cfg.get<string>('loadGpu', 'auto')),
        timeoutSeconds: cfg.get<number>('timeoutSeconds', 60),
        maxTokens: cfg.get<number>('maxTokens', 4096),
        temperature: cfg.get<number>('temperature', 0.2),
        // Review the proposal as a diff, or write it straight in. Read here rather than at the apply
        // step so the command, the palette entry and the Code Action all obey the same switch.
        showDiff: cfg.get<boolean>('showDiff', true)
    });
}

/** The method whose span contains `line` (1-based) — one parse for the whole file. */
function methodAt(document: vscode.TextDocument, line: number): MethodSpan | undefined {
    return methodsIn(document.fileName, document.getText()).find((m) => m.line <= line && line <= m.endLine);
}

function languageOf(document: vscode.TextDocument): 'cs' | 'vb' | undefined {
    const file = document.fileName.toLowerCase();
    if (file.endsWith('.vb')) return 'vb';
    if (file.endsWith('.cs')) return 'cs';
    return undefined;
}

/** `using …`/`Imports …` (and the class line) — context the model may read but must not change. */
function headerOf(document: vscode.TextDocument, language: 'cs' | 'vb'): string {
    const kept: string[] = [];
    for (const raw of document.getText().replace(/\uFEFF/g, '').split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        if (language === 'vb') {
            if (/^(Imports|Option)\b/i.test(line)) {
                kept.push(line);
                continue;
            }
            if (/^(Public|Friend|Partial)?\s*Class\b/i.test(line)) {
                kept.push(line);
                return kept.join('\n');
            }
        } else {
            if (/^using\b/.test(line) || /^namespace\b/.test(line)) {
                kept.push(line);
                continue;
            }
            if (/\bclass\b/.test(line)) {
                kept.push(line);
                return kept.join('\n');
            }
        }
    }
    kept.push(language === 'vb' ? 'End Class' : '}');
    return kept.join('\n');
}

/**
 * One other method from the same file, as a style reference. This is what lifts a small model from
 * "plausible C#" to "compiles here" — it copies the project's own idioms instead of inventing APIs.
 * Short methods only: the prompt has to stay small enough for RAM-only inference.
 */
function siblingOf(document: vscode.TextDocument, exclude: MethodSpan, all: MethodSpan[]): string | undefined {
    const text = document.getText();
    for (const m of all) {
        if (m.start === exclude.start) continue;
        const body = text.slice(m.start, m.end).replace(/\uFEFF/g, '');
        if (body.split('\n').length > 24) continue;
        if (/\b(InitializeComponent|Dispose|BrowseAsync)\b/.test(body)) continue;
        return body;
    }
    return undefined;
}

/** Short, human summary of the answer, for the notification. */
function summarise(code: string): string {
    const lines = code.split(/\r?\n/).length;
    return `${lines} line${lines === 1 ? '' : 's'}`;
}

/**
 * The configuration to actually send with. For `bundled` that means starting the extension's own model
 * server first — it speaks the same OpenAI-compatible API, so nothing downstream knows the difference.
 * Returns undefined when the runtime cannot start; the reason has already been shown by then.
 */
async function effectiveConfig(cfg: AssistantConfig): Promise<AssistantConfig | undefined> {
    if (cfg.backend !== 'bundled') return cfg;
    try {
        return { ...cfg, endpoint: await ensureBundledEndpoint(cfg) };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const pick = await vscode.window.showErrorMessage(
            `The local model could not start: ${message}`,
            'Set up model',
            'Show status'
        );
        if (pick === 'Set up model') await vscode.commands.executeCommand('avaloniaDesigner.assistant.setupModel');
        if (pick === 'Show status') await vscode.commands.executeCommand('avaloniaDesigner.assistant.status');
        return undefined;
    }
}

/* ---------------- the proposal, and how it is reviewed ----------------
 *
 * Reviewing a diff takes as long as it takes, and a notification does not wait: the toast with
 * Apply/Discard expires after a few seconds, and then the only sensible action is gone (reported by the
 * user on the first successful run, 2026-09-14). So the decision is published in two places that do not
 * time out — the status bar and the diff editor's own title bar — both driven by a context key, both
 * gone the moment the proposal is resolved.
 *
 * The right-hand side of the diff is a READ-ONLY virtual document. It used to be an untitled document,
 * which made closing the tab ask "do you want to save?" about a pane that is nothing but a preview.
 */

export const PROPOSAL_SCHEME = 'avalonia-ai-proposal';

/** Supplies the read-only content behind the diff. Cheap, and the only way to avoid the save prompt. */
class ProposalContentProvider implements vscode.TextDocumentContentProvider {
    private readonly documents = new Map<string, string>();
    private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this.emitter.event;

    put(uri: vscode.Uri, content: string): void {
        this.documents.set(uri.toString(), content);
        this.emitter.fire(uri);
    }

    forget(uri: vscode.Uri): void {
        this.documents.delete(uri.toString());
    }

    provideTextDocumentContent(uri: vscode.Uri): string {
        return this.documents.get(uri.toString()) ?? '';
    }

    dispose(): void {
        this.documents.clear();
        this.emitter.dispose();
    }
}

/** Registered once in `activate`. */
export const proposalContent = new ProposalContentProvider();

/**
 * The part of a proposal that decides **where** the text goes — all `buildProposalText` needs.
 *
 * Kept apart from `PendingProposal` because it is also built *before* a proposal exists: with the diff
 * switched off there is no proposal at all, and the two paths must still place the code identically.
 */
interface ProposalAnchor {
    kind: 'replace' | 'insert';
    /** the member this change is about */
    name: string;
    documentUri: vscode.Uri;
    startLine: number;
    endLine: number;
    /** `insert` only: where it goes, and the `using`/`Imports` lines it asked for. */
    insert?: { caretLine: number; type: TypeSpan; language: 'cs' | 'vb'; usings: string[] };
}

interface PendingProposal extends ProposalAnchor {
    /** the model's own answer, re-spliced at apply time so edits made while reviewing are respected */
    code: string;
    /** the file as it was when the proposal was computed */
    original: string;
    proposalUri: vscode.Uri;
    summary: string;
    /** `insert` only: the form event to offer to wire once the member exists. */
    wiring?: { axamlUri: vscode.Uri; control: string; event: string; handler: string };
}

let pending: PendingProposal | undefined;
let applyItem: vscode.StatusBarItem | undefined;
let discardItem: vscode.StatusBarItem | undefined;
let proposalSeq = 0;

function fileBaseName(document: vscode.TextDocument): string {
    return document.fileName.split(/[\\/]/).pop() ?? 'proposal.cs';
}

/** Publishes the waiting decision somewhere that outlives a notification. */
function publishPending(p: PendingProposal): void {
    pending = p;
    applyItem ??= vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    discardItem ??= vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    applyItem.text = '$(check) Apply AI change';
    applyItem.tooltip = `${p.name}() — ${p.summary}. Applies the diff that is on screen.`;
    applyItem.command = 'avaloniaDesigner.assistant.applyProposal';
    // A colour, so it is not one more grey word among the branch and the encoding: this is a decision
    // that is waiting for the developer.
    applyItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    discardItem.text = '$(close) Discard';
    discardItem.tooltip = p.kind === 'insert' ? `Do not add ${p.name}().` : `Leave ${p.name}() as it is.`;
    discardItem.command = 'avaloniaDesigner.assistant.discardProposal';
    applyItem.show();
    discardItem.show();
    proposalLenses.refresh();
    void vscode.commands.executeCommand('setContext', 'avaloniaDesigner.proposalPending', true);
}

function clearPending(): void {
    pending = undefined;
    applyItem?.hide();
    discardItem?.hide();
    proposalLenses.refresh();
    void vscode.commands.executeCommand('setContext', 'avaloniaDesigner.proposalPending', false);
}

/**
 * The affordance that cannot be missed: a code lens directly above the method that is waiting.
 *
 * The status bar and the editor title are there as well, but a developer reviewing a change is looking at
 * the *code* — and the first version of this flow put the only buttons in a notification, which expired
 * while the diff was being read (reported twice, 2026-09-14). A lens is where the decision belongs, it
 * survives scrolling, switching tabs and reloading the window, and it names the method.
 */
class ProposalLensProvider implements vscode.CodeLensProvider {
    private readonly emitter = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this.emitter.event;

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const p = pending;
        if (!p || p.documentUri.toString() !== document.uri.toString()) return [];
        const line = Math.max(0, p.startLine - 1);
        const range = new vscode.Range(line, 0, line, 0);
        return [
            new vscode.CodeLens(range, {
                title: '$(check) Apply AI change',
                tooltip: `${p.summary}. ${p.kind === 'insert' ? `Adds ${p.name}();` : `Replaces ${p.name}();`} Ctrl+Z undoes it.`,
                command: 'avaloniaDesigner.assistant.applyProposal'
            }),
            new vscode.CodeLens(range, {
                title: '$(close) Discard',
                tooltip: p.kind === 'insert' ? `Do not add ${p.name}().` : `Leave ${p.name}() as it is.`,
                command: 'avaloniaDesigner.assistant.discardProposal'
            })
        ];
    }

    refresh(): void {
        this.emitter.fire();
    }

    dispose(): void {
        this.emitter.dispose();
    }
}

/** Registered once in `activate`, for C# and VB. */
export const proposalLenses = new ProposalLensProvider();

/** Closes the diff tab *by reference*: never "whatever happens to be the active editor". */
async function closeProposalTab(p: PendingProposal): Promise<void> {
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            const input = tab.input;
            const modified = input instanceof vscode.TabInputTextDiff ? input.modified : undefined;
            if (modified?.toString() === p.proposalUri.toString()) {
                await vscode.window.tabGroups.close(tab);
                return;
            }
        }
    }
}

/** Every URI of ours a tab is showing (a diff's right-hand side, or a plain virtual document). */
function proposalUrisIn(tab: vscode.Tab): vscode.Uri[] {
    const input = tab.input;
    const candidates: (vscode.Uri | undefined)[] = [
        input instanceof vscode.TabInputTextDiff ? input.modified : undefined,
        input instanceof vscode.TabInputText ? input.uri : undefined
    ];
    return candidates.filter((u): u is vscode.Uri => !!u && u.scheme === PROPOSAL_SCHEME);
}

/**
 * Closes proposal tabs left behind by a previous window.
 *
 * A proposal lives in memory, so a tab of ours that comes back after a **window reload** can never be
 * applied: it is a dead pane with no buttons, and it looks exactly like "the buttons disappeared" — the
 * user reported both symptoms (2026-09-14) after reloading to pick up a new build while a proposal was
 * pending. Anything of ours found at activation is therefore stale by definition, and saying so in the
 * output channel keeps it from looking like a bug in the diff itself.
 */
export async function closeStaleProposalTabs(): Promise<void> {
    const stale: vscode.Tab[] = [];
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            if (proposalUrisIn(tab).length > 0) stale.push(tab);
        }
    }
    for (const tab of stale) {
        proposalContent.forget(proposalUrisIn(tab)[0]);
        await vscode.window.tabGroups.close(tab);
    }
    if (stale.length > 0) {
        log(`Closed ${stale.length} AI proposal tab(s) left over from a previous window — a proposal only lives in memory, so they could no longer be applied.`);
    }
}

/** "AI: Apply the Proposed Change" — also the status-bar button and the diff editor's title action. */
export async function applyProposal(): Promise<void> {
    const p = pending;
    if (!p) {
        void vscode.window.showInformationMessage('No AI proposal is waiting.');
        return;
    }
    let document: vscode.TextDocument;
    try {
        document = await vscode.workspace.openTextDocument(p.documentUri);
    } catch {
        clearPending();
        void vscode.window.showErrorMessage('The file is no longer available — the proposal was dropped.');
        return;
    }

    const current = document.getText();
    // One implementation for both modes: the diff is a *review*, never a different edit.
    if (current !== p.original) {
        const built = buildProposalText(current, p, p.code);
        if (!built.ok) {
            clearPending();
            void vscode.window.showWarningMessage(built.message);
            return;
        }
        const pick = await vscode.window.showWarningMessage(
            p.kind === 'insert'
                ? `The file changed while you were reviewing the proposal. Applying adds ${p.name}() to it as it is now.`
                : `The file changed while you were reviewing the proposal. Applying replaces ${p.name}() as it is now.`,
            { modal: true },
            'Apply',
            'Discard'
        );
        if (pick === 'Discard') {
            await discardProposal();
            return;
        }
        if (pick !== 'Apply') return;
    }
    const written = await writeProposal(document, p, p.code);
    if (!written.ok) {
        void vscode.window.showErrorMessage(written.message);
        return; // keep it pending: the file can be made writable and the same button pressed again
    }
    const addedUsings = written.addedUsings;

    // The moment the code lands, the designer's own check looks at it — in both diff modes, because a finding
    // is cheapest to act on right here (asked 2026-09-16).
    await checkGeneratedCode(document);

    const summary = p.summary;
    const name = p.name;
    await closeProposalTab(p);
    proposalContent.forget(p.proposalUri);
    clearPending();
    const next = await vscode.window.showInformationMessage(
        p.kind === 'insert'
            ? `${name}() added${addedUsings.length ? ` (with ${addedUsings.join(', ')})` : ''} — Ctrl+Z undoes it.`
            : `${name}() replaced — Ctrl+Z undoes it.`,
        'Build to verify',
        'Dismiss'
    );
    if (next === 'Build to verify') await runBuildTask();
    if (p.kind === 'insert') await offerWiring(p);
    void summary;
}

/**
 * The second half of "create a handler": the event attribute in the form.
 *
 * Offered, never assumed — it edits a *different* file than the one the developer was looking at, so it
 * asks first and reports what it changed. A normal undoable edit (`WorkspaceEdit`), not a write behind
 * the designer's back: the designer owns the file whenever its own tab is open.
 */
async function offerWiring(p: { wiring?: PendingProposal['wiring'] }): Promise<void> {
    const w = p.wiring;
    if (!w) return;
    const pick = await vscode.window.showInformationMessage(
        `Wire ${w.event}="${w.handler}" onto ${w.control} in ${path.basename(w.axamlUri.fsPath)}?`,
        'Wire it',
        'Not now'
    );
    if (pick !== 'Wire it') return;
    try {
        const doc = await vscode.workspace.openTextDocument(w.axamlUri);
        const text = doc.getText();
        const updated = addXamlEventAttribute(text, w.control, w.event, w.handler);
        if (!updated) {
            void vscode.window.showInformationMessage(
                `Nothing to wire — ${w.control} either already has ${w.event} or is not in ${path.basename(w.axamlUri.fsPath)}.`
            );
            return;
        }
        const edit = new vscode.WorkspaceEdit();
        edit.replace(w.axamlUri, new vscode.Range(doc.positionAt(0), doc.positionAt(text.length)), updated);
        if (!(await vscode.workspace.applyEdit(edit))) {
            void vscode.window.showErrorMessage(`Could not edit ${path.basename(w.axamlUri.fsPath)} — it may be read-only.`);
            return;
        }
        await doc.save();
        log(`Wired ${w.event}="${w.handler}" onto ${w.control} in ${w.axamlUri.fsPath}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`Could not wire ${w.event} onto ${w.control}: ${message}`);
        void vscode.window.showWarningMessage(`Could not wire the event: ${message}`);
    }
}

/** "AI: Discard the Proposed Change" — closes the diff, changes nothing. */
export async function discardProposal(): Promise<void> {
    const p = pending;
    if (!p) {
        void vscode.window.showInformationMessage('No AI proposal is waiting.');
        return;
    }
    await closeProposalTab(p);
    proposalContent.forget(p.proposalUri);
    clearPending();
    void vscode.window.showInformationMessage(`${p.name}() was left as it is.`);
}

/** Opens what the model actually said, in a read-only tab — the evidence, not a summary of it. */
async function showRawAnswer(
    answer: string,
    label: string,
    cfg: AssistantConfig,
    thinking = ''
): Promise<void> {
    const uri = vscode.Uri.from({ scheme: PROPOSAL_SCHEME, path: `/${++proposalSeq}/raw-answer.txt` });
    // The thinking is included whenever there is any: with a reasoning model it is often the *only*
    // thing that arrived, and "0 characters" with nothing else on screen is not evidence of anything.
    const header = [
        `# The model's answer, exactly as it arrived`,
        `# target: ${label}   model: ${cfg.model || '(the bundled model)'}   ${answer.length} characters`
        + (thinking ? `   + ${thinking.length} characters of thinking (below, never used as code)` : ''),
        ''
    ].join('\n');
    const body = thinking
        ? `${answer}\n\n# ---- the model's thinking, in full (it is not part of the answer) ----\n\n${thinking}`
        : answer;
    proposalContent.put(uri, header + body);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, { preview: false });
}

/**
 * What a proposal is about: a method being rewritten, or a member that does not exist yet.
 *
 * One request path, one diff, one Apply button for both — the developer should not have to learn two
 * flows because one writes over a method and the other writes next to it (2026-09-16).
 */
type ProposalTarget =
    | { kind: 'replace'; span: MethodSpan }
    | {
        kind: 'insert';
        caretLine: number;
        type: TypeSpan;
        language: 'cs' | 'vb';
        members: MemberInfo[];
        controls: string[];
        form?: { uri: vscode.Uri };
    };

/** The event to offer to wire, when the new member looks like a handler of a control in the form. */
function wiringFor(
    name: string,
    target: { controls: string[]; form?: { uri: vscode.Uri } }
): PendingProposal['wiring'] {
    const hit = handlerFromMemberName(name, target.controls);
    if (!hit || !target.form) return undefined;
    return { axamlUri: target.form.uri, control: hit.control, event: hit.event, handler: name };
}

/**
 * The whole-file text a target produces, from the file's **current** text.
 *
 * One implementation for the review path and the immediate path, so "show the diff" is a decision about
 * *when the developer looks*, never about *what the code does*. Both callers therefore re-derive the
 * anchor here instead of trusting line numbers from before the model was asked: the answer takes seconds,
 * and a file may be edited meanwhile.
 */
function buildProposalText(
    currentText: string,
    target: ProposalAnchor,
    code: string
): { ok: true; text: string; addedUsings: string[] } | { ok: false; message: string } {
    if (target.kind === 'insert') {
        const plan = target.insert;
        const type = plan ? enclosingTypeSpan(currentText, plan.type.declLine, plan.language) : undefined;
        if (!plan || !type) {
            return {
                ok: false,
                message: `${target.name}() was not added — the class it was meant for is no longer in the file.`
            };
        }
        const merged = addMemberToFile({
            text: currentText,
            caretLine: plan.caretLine,
            member: code,
            usings: plan.usings,
            type,
            language: plan.language
        });
        return { ok: true, text: merged.text, addedUsings: merged.added };
    }

    const spans = methodsIn(target.documentUri.fsPath, currentText);
    // The method may have moved since it was found, so match on the name first and fall back to "the
    // method that now occupies the span we proposed".
    const span =
        spans.find((m) => m.name === target.name) ??
        spans.find((m) => target.startLine <= m.endLine && m.line <= target.endLine);
    if (!span) {
        return { ok: false, message: `"${target.name}" is no longer in the file — nothing was applied.` };
    }
    return { ok: true, text: spliceMethod(currentText, span, code, currentText.includes('\r\n') ? '\r\n' : '\n'), addedUsings: [] };
}

/**
 * Writes an approved (or deliberately unreviewed) change into the file.
 *
 * A normal `WorkspaceEdit` and a save, in both modes: the edit is undoable, and saving is what makes
 * "Build to verify" verify the change rather than the file as it was before.
 */
async function writeProposal(
    document: vscode.TextDocument,
    target: ProposalAnchor,
    code: string
): Promise<{ ok: true; addedUsings: string[] } | { ok: false; message: string }> {
    const built = buildProposalText(document.getText(), target, code);
    if (!built.ok) return built;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)),
        built.text
    );
    if (!(await vscode.workspace.applyEdit(edit))) {
        return { ok: false, message: 'Could not write the change — the file may be read-only.' };
    }
    await document.save();
    return { ok: true, addedUsings: built.addedUsings };
}

/**
 * Runs the designer's own check over the file the model just changed (asked 2026-09-16).
 *
 * The check has rules for exactly the mistakes generated code makes — a handler nothing wires, a name that is
 * not a control of this form, a second member with the same name, a class inside a class, braces the answer
 * never closed — and nothing ran them at the moment they mattered: the user had to wait for the next save or
 * focus, or for the ⚙ mode they had chosen. It runs here instead, in *both* modes, because a diff that has
 * just been applied is when a finding is cheapest to act on.
 *
 * The findings go to the PROBLEMS pane and the output channel. An open designer panel picks them up in its own
 * list the next time it checks (its mode decides when); nothing here reaches into another extension surface.
 */
async function checkGeneratedCode(document: vscode.TextDocument): Promise<void> {
    const form = siblingFormOf(document);
    if (!form) return;
    try {
        const result = analyzeCodeBehind(form.uri, {});
        publishIssues(form.uri, result, result.issues);
        if (!result.issues.length) {
            log('Code check after the model\'s change: nothing to report.');
            return;
        }
        const errors = result.issues.filter((i) => i.severity === 'error').length;
        log(`Code check after the model's change: ${result.issues.length} finding(s), ${errors} error(s) — `
            + result.issues.map((i) => `${i.severity}: ${i.title}`).join(' | '));
        const first = result.issues[0];
        await vscode.window.showWarningMessage(
            `The designer's check found ${result.issues.length} problem`
            + `${result.issues.length === 1 ? '' : 's'} in the new code — ${first.title}. `
            + 'See the PROBLEMS pane, or Fix in the designer’s Code Fix list.',
            'Dismiss'
        );
    } catch (err) {
        // A check that throws must never make a successful write look failed.
        log(`Code check after the model's change errored: ${err instanceof Error ? err.message : String(err)}`);
    }
}

/**
 * Asks the model for a replacement method, shows it as a diff, and applies it only when the developer
 * says so. Returns a short summary, or undefined when the attempt was cancelled or failed.
 */
async function proposeMethod(
    document: vscode.TextDocument,
    target: ProposalTarget,
    messages: ChatMessage[],
    what: string,
    cfg: AssistantConfig
): Promise<string | undefined> {
    let chunks = 0;
    let answer = '';
    let thinking = '';
    let finishReason: string | undefined;
    let reasoningTokens: number | undefined;
    // The request in one line, *before* it is sent: a prompt that does not fit the window is invisible in
    // every later message, and the 2026-09-16 "0 characters" report had nothing to go on at all.
    const promptChars = messages.reduce((n, m) => n + String(m.content ?? '').length, 0);
    const promptTokens = estimateTokens(messages.map((m) => m.content ?? '').join('\n'));
    const budget = cfg.backend === 'bundled'
        ? answerBudget(cfg.maxTokens, cfg.contextSize, promptTokens)
        : { maxTokens: cfg.maxTokens, reduced: false, room: 0 };
    const request: AssistantConfig = budget.reduced ? { ...cfg, maxTokens: budget.maxTokens } : cfg;
    log(`AI request: ${cfg.backend} · model=${cfg.model || '(server default)'} · ${cfg.endpoint} · prompt ` +
        `${promptChars} characters (~${promptTokens} tokens) · answer ≤ ${request.maxTokens} tokens` +
        (budget.reduced ? ` (reduced from ${cfg.maxTokens}: the ${cfg.contextSize}-token window has room for ${budget.room})` : '') +
        ` · context ${cfg.contextSize}`);
    try {
        const outcome = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: what, cancellable: true },
            async (progress, token) => {
                const controller = new AbortController();
                token.onCancellationRequested(() => controller.abort());
                return chatDetailed(request, messages, {
                    signal: controller.signal,
                    onToken: () => {
                        chunks += 1;
                        if (chunks % 12 === 0) progress.report({ message: `${chunks} chunks received…` });
                    },
                    // A thinking model can be silent for a long time in `content` terms. Saying so is the
                    // difference between "it is working" and "it is stuck" (2026-09-15).
                    onReasoning: (chars) =>
                        progress.report({ message: `the model is thinking… (${chars} characters so far)` })
                });
            }
        );
        answer = outcome.text;
        thinking = outcome.reasoning;
        finishReason = outcome.finishReason;
        reasoningTokens = outcome.reasoningTokens;
        // Every outcome, not only the interesting one: "answer=0, reasoning=0, finish=length" and
        // "answer=0, reasoning=0, finish=stop" are completely different problems (one is a budget, the
        // other is a model that said nothing), and until 2026-09-16 only the reasoning case was logged.
        log(`AI answer: ${answer.length} characters, ${thinking.length} of thinking, finish reason ` +
            `"${finishReason ?? 'unknown'}"${finishReason === 'length' ? ' — the budget ran out' : ''}` +
            `${sidecarTail().length ? `; runtime last said: ${sidecarTail().slice(-1)[0]}` : ''}`);
        if (thinking) {
            log(`The model wrote ${thinking.length} characters of reasoning before its answer`
                + `${reasoningTokens ? ` (${reasoningTokens} thinking tokens)` : ''}`
                + `, finish reason "${finishReason ?? 'unknown'}".`);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const pick = await vscode.window.showErrorMessage(`AI assist failed: ${message}`, 'Show status', 'Settings');
        if (pick === 'Show status') await vscode.commands.executeCommand('avaloniaDesigner.assistant.status');
        if (pick === 'Settings') await vscode.commands.executeCommand('workbench.action.openSettings', SETTINGS);
        return undefined;
    } finally {
        // A request can make the server load the model just-in-time, which changes what is in memory — and
        // a failing request can have loaded it too, so both paths refresh. Fire-and-forget: showing the
        // diff must not wait on a round trip to the server.
        void refreshAiState();
    }

    const label = target.kind === 'replace' ? target.span.name : target.type.name;
    let code = '';
    let usings: string[] = [];
    let note = '';
    if (target.kind === 'replace') {
        const parsed = extractCode(answer);
        code = parsed.code;
        note = parsed.note;
    } else {
        // A new member: the answer is a declaration plus a body, optionally preceded by the usings it
        // needs. Everything the user asked for is enforced here rather than hoped for in the prompt —
        // a name that already exists is refused outright, and the visibility is corrected (2026-09-16).
        const parsed = parseNewMemberAnswer(answer);
        // A model that answers with a whole `namespace`/`class` — which happens even though the prompt
        // forbids it, reported on 2026-09-16 with `CS1513` in a user's file — would otherwise be inserted
        // *inside* the existing class and break it. The wrapper comes off here, and an answer that declared
        // several members is refused rather than guessed at (the model, not the user, chose the name here).
        const unwrapped = parsed.member.trim()
            ? unwrapMemberBlock(parsed.member, target.language)
            : { member: '', unwrapped: false, count: 0, names: [] as string[] };
        if (unwrapped.unwrapped) {
            log(`The answer wrapped the member in a class; removed it (${unwrapped.names.join(', ')}).`);
        }
        if (unwrapped.count > 1) {
            void vscode.window.showWarningMessage(
                `The model answered with ${unwrapped.count} members (${unwrapped.names.join(', ')}) instead of one — ` +
                'nothing was added. Say what you want in a single sentence ("a function named X that …") and try again.'
            );
            return undefined;
        }
        code = unwrapped.member;
        usings = parsed.usings;
        note = parsed.note;
        const name = code.trim() ? memberNameOf(code, target.language) : undefined;
        if (code.trim() && !name) {
            log(`The answer for ${target.type.name} has no member declaration in it:\n${answer}`);
            const choice = await vscode.window.showWarningMessage(
                'The answer does not contain a member declaration — nothing was added.',
                'Show the raw answer'
            );
            if (choice === 'Show the raw answer') await showRawAnswer(answer, target.type.name, cfg, thinking);
            return undefined;
        }
        if (name && target.members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
            void vscode.window.showWarningMessage(
                `${target.type.name} already has a member called ${name}(). Nothing was added — put the caret ` +
                'inside it and run "AI: Implement in Function…" again to rewrite it instead.'
            );
            return undefined;
        }
        if (name) {
            const fixed = normaliseMemberVisibility(code, target.language, target.controls, target.members, name);
            if (fixed.changed.length) log(`New member ${name}(): ${fixed.changed.join('; ')}`);
            code = fixed.member;
        }
    }
    if (!code.trim()) {
        // Never swallow the evidence again: the raw answer goes to the output channel and can be opened
        // as a read-only tab. The first real failure (2026-09-14) was unactionable for exactly this
        // reason — the message said "nothing usable" and the answer itself was already gone.
        const why = describeEmptyAnswer(answer, {
            reasoningChars: thinking.length,
            reasoningTokens,
            finishReason,
            promptTokens,
            contextSize: cfg.contextSize
        });
        log(`The AI answer could not be used. ${why}\n--- raw answer (${answer.length} characters) ---\n${answer}\n`
            + (thinking ? `--- thinking (${thinking.length} characters, not used as code) ---\n${thinking}\n` : '')
            + (sidecarTail().length ? `--- the runtime's own last lines ---\n${sidecarTail().join('\n')}\n` : '')
            + `--- end ---`);
        const choice = await vscode.window.showWarningMessage(
            `The model returned nothing usable — nothing was changed. ${why}`,
            'Show the raw answer',
            'Show status'
        );
        if (choice === 'Show the raw answer') await showRawAnswer(answer, label, cfg, thinking);
        if (choice === 'Show status') await vscode.commands.executeCommand('avaloniaDesigner.assistant.status');
        return undefined;
    }

    const original = document.getText();
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    const name = target.kind === 'replace' ? target.span.name : memberNameOf(code, target.language) ?? target.type.name;
    const anchor: ProposalAnchor = {
        kind: target.kind,
        name,
        documentUri: document.uri,
        startLine: target.kind === 'replace' ? target.span.line : target.caretLine,
        endLine: target.kind === 'replace' ? target.span.endLine : target.caretLine,
        insert: target.kind === 'insert'
            ? { caretLine: target.caretLine, type: target.type, language: target.language, usings }
            : undefined
    };

    // No diff wanted (⚙ Settings → "Show the proposal as a diff", `assistant.showDiff`): write it now.
    // Every rule that protects the file still ran above — a name that already exists was refused, the
    // visibility was corrected — and the write is the same `WorkspaceEdit` the Apply button uses, so
    // Ctrl+Z undoes it. What is skipped is the *review*, and that is the user's own choice (2026-09-16).
    if (!cfg.showDiff) {
        const written = await writeProposal(document, anchor, code);
        if (!written.ok) {
            void vscode.window.showWarningMessage(`${written.message} Nothing was changed.`);
            return undefined;
        }
        log(`Applied ${name}() without showing a diff (assistant.showDiff is off).`);
        await checkGeneratedCode(document);
        const next = await vscode.window.showInformationMessage(
            target.kind === 'insert'
                ? `${name}() added${written.addedUsings.length ? ` (with ${written.addedUsings.join(', ')})` : ''} — Ctrl+Z undoes it.`
                : `${name}() rewritten — Ctrl+Z undoes it.`,
            'Build to verify',
            'Undo',
            'Dismiss'
        );
        if (next === 'Build to verify') await runBuildTask();
        // "Undo" is offered by name because in this mode the change is already in the file: it is the one
        // decision the missing diff would otherwise have been the place for.
        if (next === 'Undo') await vscode.commands.executeCommand('undo');
        if (target.kind === 'insert') await offerWiring({ wiring: wiringFor(name, target) });
        return summarise(code);
    }

    const proposed = target.kind === 'replace'
        ? spliceMethod(original, target.span, code, eol)
        : addMemberToFile({
            text: original,
            caretLine: target.caretLine,
            member: code,
            usings,
            type: target.type,
            language: target.language
        }).text;

    // A new proposal replaces an older one: its diff is stale, so its tab and content go.
    const previous = pending;
    if (previous) {
        await closeProposalTab(previous);
        proposalContent.forget(previous.proposalUri);
        clearPending();
    }

    // Read-only virtual document (never an untitled one — see the note above the provider).
    const proposalUri = vscode.Uri.from({
        scheme: PROPOSAL_SCHEME,
        path: `/${++proposalSeq}/${fileBaseName(document)}`
    });
    proposalContent.put(proposalUri, proposed);
    await vscode.commands.executeCommand(
        'vscode.diff',
        document.uri,
        proposalUri,
        target.kind === 'replace'
            ? `${fileBaseName(document)} — AI proposal for ${name}()`
            : `${fileBaseName(document)} — AI proposal: new member ${name}()`
    );
    publishPending({
        documentUri: document.uri,
        kind: target.kind,
        name,
        startLine: target.kind === 'replace' ? target.span.line : target.caretLine,
        endLine: target.kind === 'replace' ? target.span.endLine : target.caretLine,
        code,
        original,
        proposalUri,
        summary: summarise(code),
        insert: target.kind === 'insert'
            ? { caretLine: target.caretLine, type: target.type, language: target.language, usings }
            : undefined,
        wiring: target.kind === 'insert' ? wiringFor(name, target) : undefined
    });

    const pick = await vscode.window.showInformationMessage(
        target.kind === 'replace'
            ? `AI proposal for ${name}(): ${summarise(code)}. Review the diff, then apply.${note ? ` (${note})` : ''}`
            : `AI proposal: a new member ${name}() in ${target.type.name}, ${summarise(code)}. Review the diff, ` +
            `then apply.${note ? ` (${note})` : ''}`,
        'Apply',
        'Discard'
    );
    if (pick === 'Discard') {
        await discardProposal();
        return undefined;
    }
    if (pick === 'Apply') {
        await applyProposal();
        return summarise(code);
    }
    // The toast expired or was dismissed — the lens on the member, the status bar and the diff's title
    // bar still offer the decision, so nothing is lost and nothing is applied without a word. Say so in
    // the output channel as well, so a developer who cannot find the buttons has a breadcrumb.
    if (pending) {
        log(
            `Proposal for ${name}() is waiting — apply it with the buttons above the method, in the `
            + 'status bar (bottom right), or in the diff editor\'s title bar.'
        );
    }
    return undefined;
}

/** Runs the project's own `build` task (the scaffold creates one) and reports the exit code. */
export async function runBuildTask(): Promise<void> {
    // Save everything first, without a prompt: the build compiles what is on disk, and a dirty editor
    // would verify something other than the change on screen. (`saveAll(false)` skips untitled buffers,
    // which is what we want — there are none in this flow any more.)
    await vscode.workspace.saveAll(false);
    const tasks = await vscode.tasks.fetchTasks();
    const build =
        tasks.find((t) => t.name === 'build') ??
        tasks.find((t) => t.name.toLowerCase().includes('build') && t.source === 'Workspace');
    if (!build) {
        void vscode.window.showWarningMessage(
            'No "build" task in this workspace — run your own build command to verify the change.'
        );
        return;
    }
    const finished = new Promise<number | undefined>((resolve) => {
        const sub = vscode.tasks.onDidEndTaskProcess((e) => {
            if (e.execution.task.name !== build.name) return;
            sub.dispose();
            resolve(e.exitCode);
        });
        setTimeout(() => {
            sub.dispose();
            resolve(undefined);
        }, 300000);
    });
    await vscode.tasks.executeTask(build);
    const code = await finished;
    if (code === 0) void vscode.window.showInformationMessage('Build succeeded — the change compiles.');
    else if (typeof code === 'number') void vscode.window.showErrorMessage(`Build failed (exit ${code}) — undo with Ctrl+Z.`);
    else void vscode.window.showWarningMessage('The build did not finish in 5 minutes — check the terminal.');
}

/** The least a description can be and still be worth sending (about 160 characters). */
const MIN_DESCRIPTION_TOKENS = 40;

/**
 * How much room this request's prompt has, and what had to be left out to respect it.
 *
 * **Only the bundled runtime is planned.** An external server owns its own context — LM Studio loads the
 * model with the window *it* was told to use — so capping a request there would refuse perfectly good
 * sentences for a limit we cannot even measure (decided 2026-09-16). For `external` the room is unlimited,
 * which is exactly what the dialog then shows.
 */
function planPrompt(cfg: AssistantConfig, parts: PromptPart[]): { fit: PromptFit; limited: boolean } {
    const limited = cfg.backend === 'bundled';
    const room = limited ? promptRoom(cfg.contextSize, cfg.maxTokens) : Number.MAX_SAFE_INTEGER;
    const fit = fitPromptParts(parts, room);
    if (fit.dropped.length) {
        log(`Prompt is full (${fit.usedTokens} of ${fit.room} tokens): left out ${fit.dropped.join(', ')}.`);
    }
    return { fit, limited };
}

/**
 * The one description dialog, shared by both paths: same wording, same allowance, same refusal.
 *
 * With a limit the prompt line carries what is left **and** `validateInput` refuses to accept more, so the
 * user finds out while typing instead of from a request that never fitted (asked 2026-09-16). The estimate
 * is the same characters/4 rule the request itself is planned with, so the two cannot disagree.
 */
async function askDescription(input: {
    title: string;
    prompt: string;
    placeHolder: string;
    allowance: number;
    limited: boolean;
    dropped: string[];
}): Promise<string | undefined> {
    const note = input.limited
        ? `About ${allowanceText(input.allowance)} left for your sentence`
        + (input.dropped.length ? ` — the prompt is full, so ${input.dropped.join(' and ')} was left out` : '')
        + '.'
        : 'This server decides its own context, so there is no length limit here.';
    const description = await vscode.window.showInputBox({
        title: input.title,
        prompt: `${input.prompt} ${note}`,
        placeHolder: input.placeHolder,
        ignoreFocusOut: true,
        validateInput: (v) => {
            const text = v.trim();
            if (text.length < 8) return 'Say a little more — at least a few words.';
            if (input.limited && estimateTokens(text) > input.allowance) {
                return `That is about ${estimateTokens(text)} tokens, and ${allowanceText(input.allowance)} is left `
                    + "for your sentence. Shorten it, or raise the model's window "
                    + '(avaloniaDesigner.assistant.loadContextLength) in the ⚙ Settings panel.';
            }
            return undefined;
        }
    });
    return description === undefined ? undefined : description.trim();
}

/**
 * "Implement in Function…" — the caret decides which of the two things happens.
 *
 * Inside a method: the model rewrites *that* method (unchanged since 0.9.x). Outside every method, the
 * caret is a place to put a **new** member — asked on 2026-09-16 with exactly that sentence in mind:
 * *"Create a function named 'SortArray' that sorts the contents of a passed array"*. One command, because
 * a developer who is thinking "write me this function" should not have to know which of two entries to
 * pick; the caret already says it.
 */
export async function implementInFunction(): Promise<void> {
    const cfg = assistantConfig();
    if (!assistantEnabled(cfg)) {
        await offerSetup();
        return;
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        void vscode.window.showWarningMessage('Open a C# (.cs) or VB.NET (.vb) file first.');
        return;
    }
    const language = languageOf(editor.document);
    if (!language) {
        void vscode.window.showWarningMessage('This works on C# (.cs) and VB.NET (.vb) files.');
        return;
    }
    const span = methodAt(editor.document, editor.selection.active.line + 1);
    if (!span) {
        await createMemberInClass(editor, language, cfg);
        return;
    }
    const method = editor.document.getText().slice(span.start, span.end).replace(/\uFEFF/g, '');
    if (methodTooLong(method)) {
        void vscode.window.showWarningMessage(
            `That method is ${method.split('\n').length} lines — too long for a local model to rewrite well. ` +
            'Split it first, or write it by hand.'
        );
        return;
    }

    // What this prompt needs, and what this model's window can hold. The method and the file header are
    // required — a rewrite without them is a guess — and the style sample is the first thing to go when the
    // prompt is full: it is the largest optional part and the least load-bearing (2026-09-16).
    const header = headerOf(editor.document, language);
    const all = methodsIn(editor.document.fileName, editor.document.getText());
    const sibling = siblingOf(editor.document, span, all);
    const { fit, limited } = planPrompt(cfg, [
        { name: 'header', text: header, required: true },
        { name: 'method', text: method, required: true },
        { name: 'style', text: sibling ?? '', required: false }
    ]);
    if (fit.overflowTokens > 0) {
        void vscode.window.showWarningMessage(
            `${span.name}() needs about ${estimateTokens(method)} tokens and this model's window has room for ` +
            `${fit.room} — nothing was sent. Raise "avaloniaDesigner.assistant.loadContextLength", split the ` +
            'method, or choose a model with a bigger window.'
        );
        return;
    }
    const allowance = descriptionAllowance(fit.room, fit.usedTokens);
    if (limited && allowance < MIN_DESCRIPTION_TOKENS) {
        void vscode.window.showWarningMessage(
            `There is no room left for a description: ${span.name}() and its context already take about ` +
            `${fit.usedTokens} of this model's ${fit.room} prompt tokens. Raise ` +
            '"avaloniaDesigner.assistant.loadContextLength" or split the method.'
        );
        return;
    }
    const fitAllowance = { allowance, limited, dropped: fit.dropped };

    const description = await askDescription({
        title: `What should ${span.name}() do?`,
        prompt: 'Describe it in a sentence or two. The model writes the body; the signature stays as it is.',
        placeHolder: 'e.g. read the row the user picked and fill the TextBoxes',
        allowance: fitAllowance.allowance,
        limited: fitAllowance.limited,
        dropped: fitAllowance.dropped
    });
    if (!description) return;

    const messages = buildImplementPrompt({
        language,
        description,
        method,
        header,
        sibling: fit.kept.some((p) => p.name === 'style') ? sibling : undefined
    });    // The dialog comes first: starting the bundled server takes a few seconds (a cold build can take
    // much longer), so nothing is started until there is a request to send.
    const resolved = await effectiveConfig(cfg);
    if (!resolved) return;
    await proposeMethod(
        editor.document,
        { kind: 'replace', span },
        messages,
        `Asking ${cfg.model || 'the local model'}…`,
        resolved
    );
}

/**
 * The caret is not inside a method: write a new member where it is.
 *
 * Three things are decided before the model is asked anything, and all three are refusals rather than
 * guesses: the caret has to be inside a class (a member cannot be written into a `using` block), a name
 * the developer spells out must not already exist, and the message says what to do instead — rewriting an
 * existing member is the *other* half of this command, so the answer is one keystroke away.
 */
async function createMemberInClass(
    editor: vscode.TextEditor,
    language: 'cs' | 'vb',
    cfg: AssistantConfig
): Promise<void> {
    const document = editor.document;
    const caretLine = editor.selection.active.line + 1;
    const text = document.getText();
    const type = enclosingTypeSpan(text, caretLine, language);
    if (!type) {
        void vscode.window.showWarningMessage(
            'That line is not inside a class, so there is nowhere to put a new member — put the caret ' +
            'between two members (or inside the method you want rewritten).'
        );
        return;
    }
    const members = memberSignatures(text, language);

    // The same planning as the rewrite path, with the member list where the method was: the header is
    // required, the member list is worth more than the style sample (it is cheap and it is what stops the
    // model inventing calls), so the style goes first when the window is tight (2026-09-16).
    const header = headerOf(document, language);
    const memberList = members.map((m) => m.declaration).join('\n');
    const styleRef = styleReferenceOf(document);
    const { fit, limited } = planPrompt(cfg, [
        { name: 'header', text: header, required: true },
        { name: 'members', text: memberList, required: false },
        { name: 'style', text: styleRef ?? '', required: false }
    ]);
    if (fit.overflowTokens > 0) {
        void vscode.window.showWarningMessage(
            `The context of ${type.name} needs about ${estimateTokens(header)} tokens and this model's window ` +
            `has room for ${fit.room} — nothing was sent. Raise "avaloniaDesigner.assistant.loadContextLength" ` +
            'or choose a model with a bigger window.'
        );
        return;
    }
    const allowance = descriptionAllowance(fit.room, fit.usedTokens);
    if (limited && allowance < MIN_DESCRIPTION_TOKENS) {
        void vscode.window.showWarningMessage(
            `There is no room left for a description: the context of ${type.name} already takes about ` +
            `${fit.usedTokens} of this model's ${fit.room} prompt tokens. Raise ` +
            '"avaloniaDesigner.assistant.loadContextLength", or pick a model with a bigger window.'
        );
        return;
    }
    const fitAllowance = { allowance, limited, dropped: fit.dropped };

    const description = await askDescription({
        title: `What should the new function do?   (it is added to ${type.name}, below line ${caretLine})`,
        prompt: 'The model writes the name, the signature and the body. You see the diff before anything is applied.',
        placeHolder: "e.g. Create a function named 'SortArray' that sorts the contents of a passed array",
        allowance: fitAllowance.allowance,
        limited: fitAllowance.limited,
        dropped: fitAllowance.dropped
    });
    if (!description) return;

    const named = sniffMemberName(description);
    if (named && members.some((m) => m.name.toLowerCase() === named.toLowerCase())) {
        void vscode.window.showWarningMessage(
            `${type.name} already has a member called ${named}(). Nothing was added — put the caret inside it ` +
            'and run "AI: Implement in Function…" again to rewrite it instead.'
        );
        return;
    }

    const form = siblingFormOf(document);
    const messages = buildGeneratePrompt({
        language,
        description,
        header,
        members: fit.kept.some((p) => p.name === 'members') ? memberList : '',
        style: fit.kept.some((p) => p.name === 'style') ? styleRef : undefined
    });
    const resolved = await effectiveConfig(cfg);
    if (!resolved) return;
    await proposeMethod(
        document,
        {
            kind: 'insert',
            caretLine,
            type,
            language,
            members,
            controls: form?.controls ?? [],
            form: form ? { uri: form.uri } : undefined
        },
        messages,
        `Asking ${cfg.model || 'the local model'} for a new function…`,
        resolved
    );
}

/** One short member, as a style reference for a new one — the same rule `siblingOf` uses. */
function styleReferenceOf(document: vscode.TextDocument): string | undefined {
    const text = document.getText();
    for (const m of methodsIn(document.fileName, text)) {
        const body = text.slice(m.start, m.end).replace(/\uFEFF/g, '');
        if (body.split('\n').length > 24) continue;
        if (/\b(InitializeComponent|Dispose|BrowseAsync)\b/.test(body)) continue;
        return body;
    }
    return undefined;
}

/**
 * The form a code-behind belongs to (`MainWindow.axaml.cs` → `MainWindow.axaml`), with the control names
 * in it.
 *
 * Two uses: the names are context for the model (a handler that touches `Status` must not be made static),
 * and they decide whether a new member that *looks* like a handler can be wired. Best effort — a file
 * without a form, or one that is not readable, simply has no controls to offer.
 */
function siblingFormOf(document: vscode.TextDocument): { uri: vscode.Uri; controls: string[] } | undefined {
    const file = document.fileName;
    if (!/\.(cs|vb)$/i.test(file)) return undefined;
    const axaml = file.replace(/\.(cs|vb)$/i, '');
    if (!/\.axaml$/i.test(axaml)) return undefined;
    try {
        return { uri: vscode.Uri.file(axaml), controls: knownControlNames(fs.readFileSync(axaml, 'utf8')) };
    } catch {
        return undefined;
    }
}

/** "Fix with AI…" — offered from the PROBLEMS pane on a finding the checker published. */
export async function fixFindingWithAI(uri: vscode.Uri, line: number, message: string): Promise<void> {
    const cfg = assistantConfig();
    if (!assistantEnabled(cfg)) {
        await offerSetup();
        return;
    }
    const document = await vscode.workspace.openTextDocument(uri);
    const language = languageOf(document);
    if (!language) return;
    const all = methodsIn(document.fileName, document.getText());
    const span = all.find((m) => m.line <= line && line <= m.endLine);
    if (!span) {
        void vscode.window.showWarningMessage(
            'That finding is not inside a method — its rule-based fix is the better route.'
        );
        return;
    }
    await vscode.window.showTextDocument(document, { preview: false });
    const method = document.getText().slice(span.start, span.end).replace(/\uFEFF/g, '');
    const messages = buildFixPrompt({
        language,
        finding: message,
        method,
        header: headerOf(document, language),
        sibling: siblingOf(document, span, all)
    });
    const resolved = await effectiveConfig(cfg);
    if (!resolved) return;
    await proposeMethod(
        document,
        { kind: 'replace', span },
        messages,
        `Asking ${cfg.model || 'the local model'} to fix the finding…`,
        resolved
    );
}

/**
 * "AI: Add a Model from Hugging Face…" (asked 2026-09-16).
 *
 * *"Should we remove the LM Studio dependency from the extension and load everything from Hugging Face?"* The
 * bundled runtime always did load from the Hub — but only the five files pinned in `MODEL_SPECS`. This is the
 * missing half: paste a repo or file URL, choose the `.gguf` if the repo has several, and the extension reads
 * the size and the hash **from the Hub's own answer** and downloads it through the same verified pipeline as
 * the built-in models (`.part` while partial, `.verified` once the hash matched).
 *
 * The added model is stored like a built-in one, so the picker, the load path, the hardware gate and Remove
 * Model treat it identically — that is the point: the user's own choice is not a second-class citizen.
 */
export async function addHubModel(): Promise<void> {
    const context = extensionContext();
    if (!context) {
        void vscode.window.showWarningMessage('The extension is not active yet — try again in a moment.');
        return;
    }
    const pasted = await vscode.window.showInputBox({
        title: 'Add a model from Hugging Face',
        prompt: 'Paste the model page or the file URL. The size and the SHA-256 are read from Hugging Face.',
        placeHolder: 'https://huggingface.co/bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF',
        ignoreFocusOut: true,
        validateInput: (v) => (parseHubUrl(v) ? undefined : 'That does not look like a huggingface.co address (or owner/repo).')
    });
    if (!pasted) return;
    const ref = parseHubUrl(pasted);
    if (!ref) return;

    let files: Awaited<ReturnType<typeof fetchHubFiles>>;
    try {
        files = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Reading ${ref.repo} from Hugging Face…` },
            () => fetchHubFiles(ref.repo, ref.revision)
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`Add from Hub failed for ${ref.repo}: ${message}`);
        void vscode.window.showErrorMessage(`Could not read ${ref.repo}: ${message}`);
        return;
    }

    // A URL that names a file wins (that is the user being specific); otherwise the repo's own list, which is
    // sorted readably so a 20-file quant zoo is navigable by name.
    let chosen = ref.file ? files.find((f) => f.file === ref.file) : undefined;
    if (ref.file && !chosen) {
        void vscode.window.showWarningMessage(`${ref.file} is not a .gguf in ${ref.repo} (or has no published hash) — pick one from the list instead.`);
    }
    if (!chosen) {
        if (files.length === 1) {
            chosen = files[0];
        } else {
            const sorted = [...files].sort((a, b) => a.file.localeCompare(b.file));
            const pick = await vscode.window.showQuickPick(
                sorted.map((f) => ({ label: f.file, description: formatBytes(f.bytes), file: f })),
                { title: `${ref.repo} — choose the file (${files.length} of them)`, ignoreFocusOut: true, matchOnDescription: true }
            );
            if (!pick) return;
            chosen = pick.file;
        }
    }

    const spec = hubFileSpec({
        repo: ref.repo,
        file: chosen.file,
        revision: ref.revision,
        bytes: chosen.bytes,
        sha256: chosen.sha256
    });
    addCustomModelSpec(spec);
    log(`Added a model from the Hub: ${spec.id} (${formatBytes(spec.bytes)}, sha ${shortHash(spec.sha256 ?? '')}).`);

    // The same gate the setup flow applies to the pinned models: a model this machine cannot run well is still
    // offered, but the user is told before a 7 GB download rather than after a failed load.
    const facts = readHardwareFacts();
    const verdict = canRunSpec(spec, { level: assessHardware(facts).level, totalRamGb: facts.totalRamGb });
    if (!verdict.ok) {
        void vscode.window.showWarningMessage(
            `${chosen.file} is on the list, but this machine may not run it well: ${verdict.reason}. ` +
            'It will still download and load if you ask it to.'
        );
    }

    const go = await vscode.window.showInformationMessage(
        `${chosen.file} — ${formatBytes(chosen.bytes)}. Download it now? (the same verification the built-in models get)`,
        'Download',
        'Later'
    );
    if (go !== 'Download') {
        void vscode.window.showInformationMessage('Added — pick it in the ⚙ Settings panel and press Load Model when you want it.');
        return;
    }
    try {
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Downloading ${chosen.file}…`, cancellable: true },
            async (progress, token) => {
                await ensureModelFile(context, spec, progress, token);
            }
        );
        void vscode.window.showInformationMessage(`${chosen.file} is ready — pick it in the ⚙ Settings panel and press Load Model.`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`Download of ${spec.id} failed: ${message}`);
        void vscode.window.showErrorMessage(`Download failed: ${message}`);
    }
}

/** "Forget an added model" — the list entry only; deleting the weights stays with Remove Model. */
export async function removeHubModel(): Promise<void> {
    const added = customModelSpecs();
    if (!added.length) {
        void vscode.window.showInformationMessage('No models have been added from Hugging Face yet.');
        return;
    }
    const pick = await vscode.window.showQuickPick(
        added.map((s) => ({ label: s.label, description: formatBytes(s.bytes), id: s.id })),
        { title: 'Forget which added model?', ignoreFocusOut: true }
    );
    if (!pick) return;
    if (removeCustomModelSpec(pick.id)) {
        log(`Forgot the added model ${pick.id}.`);
        void vscode.window.showInformationMessage('Forgotten. Its weights stay on disk — Remove Model deletes those.');
    }
}

/** Backend off: explain what to switch on rather than failing silently. */
async function offerSetup(): Promise<void> {
    const pick = await vscode.window.showInformationMessage(
        'AI assist is off. Either point it at a local model server you already run (LM Studio, Ollama, '
        + 'llama.cpp), or let the extension set up its own local model — nothing leaves your machine either way.',
        'Set up a local model',
        'Open settings',
        'Show status'
    );
    if (pick === 'Set up a local model') await vscode.commands.executeCommand('avaloniaDesigner.assistant.setupModel');
    if (pick === 'Open settings') await vscode.commands.executeCommand('workbench.action.openSettings', SETTINGS);
    if (pick === 'Show status') await vscode.commands.executeCommand('avaloniaDesigner.assistant.status');
}

/** The running extension's version — the status dialog reports it, because "did my reload take effect?"
 *  is otherwise guesswork (a VSIX installed while a window is open does not change that window). */
function extensionVersion(): string {
    try {
        return String(vscode.extensions.getExtension('grumpy.avalonia-designer')?.packageJSON?.version ?? '?');
    } catch {
        return '?';
    }
}

/**
 * The status report as text.
 *
 * One implementation for two surfaces: the dialog below and the designer's ⚙ Settings panel, which
 * renders these exact lines. A panel that showed its own summary would eventually disagree with the
 * command, and "which is right?" is not a question a user should ever have about status output.
 */
export async function statusLines(): Promise<string[]> {
    return (await statusFacts()).lines;
}

/**
 * Re-sends an open designer panel its AI state *and* its status.
 *
 * The model can be changed from two places — the ⚙ panel and the palette commands — and the panel was only told
 * about the first. Loading a model from `AI: Set Up Local Model…` therefore left an open panel showing whatever
 * it had been told last: the dropdown on `Let the server decide…` (the state from when the settings still
 * pointed at LM Studio) and the status box naming a model that was no longer in use (reported 2026-09-15).
 * Same rule as `wireSettings`: one implementation, so the two front doors cannot disagree.
 */
export async function refreshPanels(): Promise<void> {
    const panel = panelFor();
    if (!panel) return;
    await refreshAiState();
    try {
        // `quiet`: update the box, do not open it — opening it is the user's action (see the webview).
        await panel.webview.postMessage({ type: 'aiStatus', lines: await statusLines(), quiet: true });
    } catch {
        /* the panel may be mid-dispose — a refresh is never worth an error */
    }
}

interface StatusFacts {
    cfg: AssistantConfig;
    lines: string[];
    probe?: Awaited<ReturnType<typeof probeServer>>;
    chatModels: ServerModelInfo[];
}

/** The status, as data: the text plus what the dialog needs to offer to pin a model. */
async function statusFacts(): Promise<StatusFacts> {
    const cfg = assistantConfig();
    const hw = assessHardware(readHardwareFacts());
    // Ask the server first when there is one: "which model will answer" is the question the developer
    // actually has, and the settings alone cannot answer it. (`bundled` needs no probe — the model file
    // is the model.)
    const probe = cfg.backend === 'external' && assistantEnabled(cfg) ? await probeServer(cfg) : undefined;
    // Embedding models are listed by every local server next to the chat ones and cannot answer a chat
    // request, so they are named but not counted as candidates.
    const chatModels = (probe?.models ?? []).filter((m) => !looksLikeEmbeddingModel(m.id));
    // "In memory right now" can only come from the server, so it is asked separately — and reported only
    // when a source could actually answer, because "nothing is loaded" is a claim the developer acts on.
    const live = cfg.backend === 'external' ? await loadedNow() : undefined;
    const loadedLine = live?.known ? describeLoadedNow(cfg, live.ids) : undefined;
    const lines = [
        `AI assist: ${cfg.backend === 'external' ? 'on (local model server)' : cfg.backend === 'bundled' ? 'on (bundled local model)' : 'off'}  ·  extension v${extensionVersion()}`,
        cfg.backend === 'bundled' ? 'Endpoint: the bundled runtime supplies one' : `Endpoint: ${cfg.endpoint}`,
        describeModel(cfg, probe && { ok: probe.ok, models: chatModels }),
        ...(loadedLine ? [loadedLine] : []),
        `Budget: ${cfg.timeoutSeconds} s, up to ${cfg.maxTokens} tokens, temperature ${cfg.temperature}`,
        '',
        `Hardware: ${hw.level === 'good' ? 'comfortable' : hw.level === 'minimal' ? 'minimum only' : 'not usable'}`,
        ...hw.reasons.map((r) => `• ${r}`)
    ];
    if (cfg.backend === 'bundled') {
        lines.push('', ...bundledStatusLines(cfg));
    } else if (probe) {
        lines.push('', probe.ok ? `Server: reachable — ${probe.models.length} model(s) offered` : `Server: ${probe.error}`);
        if (probe.ok) {
            for (const m of probe.models.slice(0, 8)) {
                lines.push(`• ${m.id}${looksLikeEmbeddingModel(m.id) ? '   (embeddings — cannot answer chat)' : ''}`);
            }
            if (chatModels.length > 1 && !cfg.model) {
                lines.push('', 'Tip: pin one to make requests reproducible — or use "Pin a model…" below.');
            }
        }
    }
    // The third runtime, reported only when it is relevant (a server of ours is running, one the user started
    // themselves is answering, a binary was found, or a path was set): a "not installed" line for a feature
    // the user never asked about is noise.
    const ownLlama = llamaServerStatusLines(llamaServerBinary(), await findRunningLlamaServer(cfg.endpoint));
    if (ownLlama.length) lines.push('', ...ownLlama);
    return { cfg, lines, probe, chatModels };
}

/** Reports what the feature would use right now — including the hardware verdict. */
export async function showStatus(): Promise<void> {
    const { cfg, lines, probe, chatModels } = await statusFacts();

    const needsPin = !!probe?.ok && chatModels.length > 1 && !cfg.model;
    const actions = needsPin ? ['Pin a model…', 'Open settings', 'Copy'] : ['OK', 'Copy'];
    const pick = await vscode.window.showInformationMessage(lines.join('\n'), { modal: true }, ...actions);

    if (pick === 'Copy') {
        await vscode.env.clipboard.writeText(lines.join('\n'));
        void vscode.window.showInformationMessage('Status copied to the clipboard.');
        return;
    }
    if (pick === 'Open settings') {
        await vscode.commands.executeCommand('workbench.action.openSettings', SETTINGS);
        return;
    }
    if (pick === 'Pin a model…') {
        const chosen = await vscode.window.showQuickPick(
            chatModels.map((m) => m.id),
            { title: 'Which model should the AI assist use?', ignoreFocusOut: true }
        );
        if (!chosen) return;
        await updateSetting(vscode.workspace.getConfiguration(SETTINGS), 'model', chosen);
        void vscode.window.showInformationMessage(
            `The AI assist is pinned to "${chosen}". Requests now name it explicitly.`
        );
    }
}

/**
 * Offers "✨ Fix with AI…" on the findings the checker published — and only when the line sits inside a
 * method, because everything outside one (a missing accessor, a lost Data-Image block) already has a
 * deterministic fix that is faster and predictable.
 */
export class AssistantCodeActionProvider implements vscode.CodeActionProvider {
    provideCodeActions(
        document: vscode.TextDocument,
        _range: vscode.Range,
        context: vscode.CodeActionContext
    ): vscode.CodeAction[] {
        if (!languageOf(document) || !assistantEnabled(assistantConfig())) return [];
        const all = methodsIn(document.fileName, document.getText());
        const seen = new Set<number>();
        const actions: vscode.CodeAction[] = [];
        for (const d of context.diagnostics) {
            if (d.source !== 'Avalonia Designer') continue;
            const line = d.range.start.line + 1;
            const span = all.find((m) => m.line <= line && line <= m.endLine);
            if (!span || seen.has(span.start)) continue;
            seen.add(span.start);
            const action = new vscode.CodeAction('✨ Fix with AI (local model)…', vscode.CodeActionKind.QuickFix);
            action.diagnostics = [d];
            action.command = {
                command: 'avaloniaDesigner.assistant.fixFinding',
                title: 'Fix with AI',
                arguments: [document.uri, line, d.message]
            };
            actions.push(action);
        }
        return actions;
    }
}
