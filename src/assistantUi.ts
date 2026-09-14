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
import {
    assistantEnabled,
    assessHardware,
    buildFixPrompt,
    buildImplementPrompt,
    chat,
    describeModel,
    extractCode,
    looksLikeEmbeddingModel,
    methodTooLong,
    normalizeAssistantConfig,
    probeServer,
    readHardwareFacts,
    spliceMethod,
    type AssistantConfig,
    type ChatMessage
} from './assistant';
import { methodsIn, type MethodSpan } from './codeBehindCheck';
import { bundledStatusLines, ensureBundledEndpoint } from './modelRuntime';

const SETTINGS = 'avaloniaDesigner.assistant';

/** Reads the settings. Kept in one place so the commands and the Code Action agree. */
export function assistantConfig(): AssistantConfig {
    const cfg = vscode.workspace.getConfiguration(SETTINGS);
    return normalizeAssistantConfig({
        backend: cfg.get<string>('backend', 'off'),
        endpoint: cfg.get<string>('endpoint', ''),
        model: cfg.get<string>('model', ''),
        modelPath: cfg.get<string>('modelPath', ''),
        threads: cfg.get<number>('threads', 0),
        timeoutSeconds: cfg.get<number>('timeoutSeconds', 60),
        maxTokens: cfg.get<number>('maxTokens', 900),
        temperature: cfg.get<number>('temperature', 0.2)
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

/**
 * Asks the model for a replacement method, shows it as a diff, and applies it only when the developer
 * says so. Returns a short summary, or undefined when the attempt was cancelled or failed.
 */
async function proposeMethod(
    document: vscode.TextDocument,
    span: MethodSpan,
    messages: ChatMessage[],
    what: string,
    cfg: AssistantConfig
): Promise<string | undefined> {
    let chunks = 0;
    let answer = '';
    try {
        answer = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: what, cancellable: true },
            async (progress, token) => {
                const controller = new AbortController();
                token.onCancellationRequested(() => controller.abort());
                return chat(cfg, messages, {
                    signal: controller.signal,
                    onToken: () => {
                        chunks += 1;
                        if (chunks % 12 === 0) progress.report({ message: `${chunks} chunks received…` });
                    }
                });
            }
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const pick = await vscode.window.showErrorMessage(`AI assist failed: ${message}`, 'Show status', 'Settings');
        if (pick === 'Show status') await vscode.commands.executeCommand('avaloniaDesigner.assistant.status');
        if (pick === 'Settings') await vscode.commands.executeCommand('workbench.action.openSettings', SETTINGS);
        return undefined;
    }

    const { code, note } = extractCode(answer);
    if (!code.trim()) {
        void vscode.window.showWarningMessage('The model returned nothing usable — nothing was changed.');
        return undefined;
    }

    const original = document.getText();
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    const proposed = spliceMethod(original, span, code, eol);

    // The diff is the contract: the developer reads it before anything is written.
    const proposal = await vscode.workspace.openTextDocument({ content: proposed, language: document.languageId });
    await vscode.commands.executeCommand(
        'vscode.diff',
        document.uri,
        proposal.uri,
        `${document.fileName.split(/[\\/]/).pop()} — AI proposal for ${span.name}()`
    );

    const pick = await vscode.window.showInformationMessage(
        `AI proposal for ${span.name}(): ${summarise(code)}. Review the diff, then apply.${note ? ` (${note})` : ''}`,
        'Apply',
        'Discard'
    );
    if (pick !== 'Apply') {
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        return undefined;
    }

    const edit = new vscode.WorkspaceEdit();
    const whole = new vscode.Range(document.positionAt(0), document.positionAt(original.length));
    edit.replace(document.uri, whole, proposed);
    if (!(await vscode.workspace.applyEdit(edit))) {
        void vscode.window.showErrorMessage('Could not apply the proposal — the file may be read-only.');
        return undefined;
    }
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await document.save();

    const next = await vscode.window.showInformationMessage(
        `${span.name}() replaced — Ctrl+Z undoes it.`,
        'Build to verify',
        'Dismiss'
    );
    if (next === 'Build to verify') await runBuildTask();
    return summarise(code);
}

/** Runs the project's own `build` task (the scaffold creates one) and reports the exit code. */
export async function runBuildTask(): Promise<void> {
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

/** "Implement in function…" — the developer describes the behaviour, the model writes the body. */
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
        void vscode.window.showWarningMessage(
            'Put the caret inside the method you want written — the model replaces exactly that method.'
        );
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

    const description = await vscode.window.showInputBox({
        title: `What should ${span.name}() do?`,
        prompt: 'Describe it in a sentence or two. The model writes the body; the signature stays as it is.',
        placeHolder: 'e.g. read the row the user picked and fill the TextBoxes',
        ignoreFocusOut: true,
        validateInput: (v) => (v.trim().length < 8 ? 'Say a little more — at least a few words.' : undefined)
    });
    if (!description) return;

    const all = methodsIn(editor.document.fileName, editor.document.getText());
    const messages = buildImplementPrompt({
        language,
        description: description.trim(),
        method,
        header: headerOf(editor.document, language),
        sibling: siblingOf(editor.document, span, all)
    });
    // The dialog comes first: starting the bundled server takes a few seconds (a cold build can take
    // much longer), so nothing is started until there is a request to send.
    const resolved = await effectiveConfig(cfg);
    if (!resolved) return;
    await proposeMethod(editor.document, span, messages, `Asking ${cfg.model || 'the local model'}…`, resolved);
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
    await proposeMethod(document, span, messages, `Asking ${cfg.model || 'the local model'} to fix the finding…`, resolved);
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

/** Reports what the feature would use right now — including the hardware verdict. */
export async function showStatus(): Promise<void> {
    const cfg = assistantConfig();
    const hw = assessHardware(readHardwareFacts());
    // Ask the server first when there is one: "which model will answer" is the question the developer
    // actually has, and the settings alone cannot answer it. (`bundled` needs no probe — the model file
    // is the model.)
    const probe = cfg.backend === 'external' && assistantEnabled(cfg) ? await probeServer(cfg) : undefined;
    // Embedding models are listed by every local server next to the chat ones and cannot answer a chat
    // request, so they are named but not counted as candidates.
    const chatModels = (probe?.models ?? []).filter((m) => !looksLikeEmbeddingModel(m.id));
    const lines = [
        `AI assist: ${cfg.backend === 'external' ? 'on (local model server)' : cfg.backend === 'bundled' ? 'on (bundled local model)' : 'off'}`,
        cfg.backend === 'bundled' ? 'Endpoint: the bundled runtime supplies one' : `Endpoint: ${cfg.endpoint}`,
        describeModel(cfg, probe && { ok: probe.ok, models: chatModels }),
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
        await vscode.workspace.getConfiguration(SETTINGS).update('model', chosen, vscode.ConfigurationTarget.Global);
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
