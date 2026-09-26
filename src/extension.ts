import * as vscode from 'vscode';
import { ToolboxProvider, ControlDefinition } from './toolboxProvider';
import { AvaloniaDesignerProvider } from './designerPanel';
import { PreviewerHostManager } from './hostClient';
import { createNewForm } from './newForm';
import { createNewProject, openLastProject, maybeRunFirstBuild } from './projectCreator';
import { ProjectViewProvider, setActiveContext } from './projectView';
import { DataSetEditorProvider, newDataSet, openDataSet } from './dataSetEditor';
import { disposeIssues } from './codeBehindCheck';
import { disposeBuildDiagnostics } from './buildDiagnostics';
import { hostGate } from './hostCheck';
import { AssistantCodeActionProvider, PROPOSAL_SCHEME, addHubModel, applyProposal, cancelAiPrompt, chooseBundledBackend, closeStaleProposalTabs, discardProposal, fixFindingWithAI, implementInFunction, proposalContent, proposalLenses, refreshPanels, removeHubModel, sendAiPrompt, showStatus } from './assistantUi';
import { initModelRuntime, stopModelServer } from './modelRuntime';
import { initLlamaServer, startMyLlamaServerFlow, stopOwnLlamaServer } from './llamaServer';
import { initPickerFolders } from './pickerFolders'; import { startLlamaServerByChoice, startTarget, stopLlamaServerConfirmed } from './llamaService';
import { learnConventions } from './conventionsUi';
import { unloadOnExit } from './localModelCore';
import { chooseLocalModel, unloadLoadedModel } from './localModelSetup';
import * as logger from './logger';

/** The shared PreviewerHost manager, kept module-level so `deactivate` can kill the C# host
 *  process explicitly (a reloaded/killed extension host does not always get to run disposables,
 *  which used to leave orphaned PreviewerHost processes behind). */
let sharedHost: PreviewerHostManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
    const log = (m: string) => logger.log(m);
    // The host check, once per session and before anything AI-related can be offered: it is what greys the
    // assistant out on a machine that cannot hold a local model, and what warns when there is little memory
    // left for one. Started rather than awaited — the panel and the AI commands await the same cached verdict
    // (src/hostCheck.ts), so nothing waits for three probes to answer here.
    void hostGate().then((gate) => {
        log(`Host check: ${gate.aiAllowed ? 'AI assist allowed' : 'AI assist disabled'}`
            + ` · ${gate.availableGb.toFixed(1)} GB available to a model`
            + ` · GPU ${gate.gpu.kind}${gate.gpu.name ? ` (${gate.gpu.name})` : ''}`
            + `${gate.overridden ? ' · overridden by assistant.ignoreHostCheck' : ''}`);
        for (const reason of gate.reasons) log(`  · ${reason}`);
        if (gate.warning) log(`  · warning: ${gate.warning}`);
    }).catch((err) => logger.logError(err));
    try {
        log(`activate start (vscode ${vscode.version})`);
        setActiveContext(context);

        // The AI switch lives in the designer's ⚙ Settings panel, and its value gates every AI command
        // (see the `when` clauses in package.json): "when off, all AI features become unavailable" is a
        // promise the command palette has to keep too, not just the panel.
        const syncAiContext = () => {
            const backend = vscode.workspace.getConfiguration('avaloniaDesigner.assistant').get<string>('backend', 'off');
            void vscode.commands.executeCommand('setContext', 'avaloniaDesigner.aiEnabled', backend !== 'off');
        };
        syncAiContext();
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('avaloniaDesigner.assistant.backend')) syncAiContext();
            })
        );

        // Register the Activity bar views FIRST — before any heavier work — so they never
        // sit without a data provider (a webview view shown before its provider is registered
        // can stay stuck on "There is no data provider registered that can provide view data.").
        const toolbox = new ToolboxProvider();
        context.subscriptions.push(
            vscode.window.createTreeView('avaloniaDesigner.toolbox', {
                treeDataProvider: toolbox,
                dragAndDropController: toolbox,
                showCollapseAll: true
            })
        );
        const projectView = new ProjectViewProvider(context.extensionUri);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(ProjectViewProvider.viewType, projectView, {
                webviewOptions: { retainContextWhenHidden: true }
            })
        );
        log(`views registered (${ProjectViewProvider.viewType})`);

        // Auto-build a freshly-created project the first time its folder is opened, and open its main
        // form in the Designer. Checked again when the workspace folders arrive slightly after
        // activation.
        context.subscriptions.push(
            vscode.workspace.onDidChangeWorkspaceFolders(() => maybeRunFirstBuild(context))
        );

        // Previewer Host lifecycle (spawns the C# headless renderer on demand).
        const host = new PreviewerHostManager(context);
        sharedHost = host;
        context.subscriptions.push(host);

        // Custom editor provider: opens .axaml files in the designer tab.
        const provider = new AvaloniaDesignerProvider(context, host);
        context.subscriptions.push(
            vscode.window.registerCustomEditorProvider(AvaloniaDesignerProvider.viewType, provider, {
                webviewOptions: { retainContextWhenHidden: true },
                supportsMultipleEditorsPerDocument: true
            })
        );
        // Let the Toolbox drag arm a tool in the active designer: VS Code does not bridge a
        // TreeView's drag MIME types into a webview, so the tag must travel on the webview
        // message channel (the same one click-to-place uses) for a drop to place anything.
        toolbox.armDesignerTool = (tag: string) => provider.armToolInActiveDesigner(tag, 'drag');

        // Custom editor provider: opens .adset files in the DataSet schema designer.
        const dsProvider = new DataSetEditorProvider(context);
        context.subscriptions.push(
            vscode.window.registerCustomEditorProvider(DataSetEditorProvider.viewType, dsProvider, {
                webviewOptions: { retainContextWhenHidden: true },
                supportsMultipleEditorsPerDocument: true
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('avaloniaDesigner.newForm', () => createNewForm(context))
        );
        context.subscriptions.push(
            vscode.commands.registerCommand('avaloniaDesigner.newProject', () => createNewProject(context))
        );
        context.subscriptions.push(
            vscode.commands.registerCommand('avaloniaDesigner.openLastProject', () => openLastProject(context))
        );
        context.subscriptions.push(
            vscode.commands.registerCommand('avaloniaDesigner.addFromToolbox', (def: ControlDefinition) => {
                // The DataSet 'tool' isn't a form control — it opens the schema designer.
                if (def.tag === 'DataSet') {
                    void vscode.commands.executeCommand('avaloniaDesigner.newDataSet');
                    return;
                }
                provider.armToolInActiveDesigner(def.tag);
            })
        );
        context.subscriptions.push(
            vscode.commands.registerCommand('avaloniaDesigner.refresh', () => provider.refreshAll())
        );
        context.subscriptions.push(
            vscode.commands.registerCommand('avaloniaDesigner.clearCanvas', () => provider.clearActiveCanvas())
        );
        // Right-click an .axaml in the Explorer -> open it in the designer editor
        // (opening an .axaml normally stays in the text editor — the designer is opt-in).
        context.subscriptions.push(
            vscode.commands.registerCommand('avaloniaDesigner.openInDesigner', (uri?: vscode.Uri) => {
                const target = uri ?? vscode.window.activeTextEditor?.document.uri;
                if (!target) return;
                void vscode.commands.executeCommand('vscode.openWith', target, AvaloniaDesignerProvider.viewType);
            })
        );

        // DataSet schema designer commands.
        context.subscriptions.push(
            vscode.commands.registerCommand('avaloniaDesigner.newDataSet', () => newDataSet(context))
        );
        context.subscriptions.push(
            vscode.commands.registerCommand('avaloniaDesigner.openDataSet', (uri?: vscode.Uri) => openDataSet(uri))
        );

        // The bundled model runtime is created once per window and disposed with it: it can hold
        // gigabytes of weights, so it must never be started twice. The user's own `llama-server` gets the
        // same treatment for the same reason — one child per window, whichever engine is in use.
        initModelRuntime(context);
        initLlamaServer(context);
        // Every file/folder picker in the extension remembers the folder it used last (per kind, in
        // global state) so the next one opens where the user left off — see src/pickerFolders.ts.
        initPickerFolders(context.globalState);

        // A proposal only lives in memory, so a proposal tab restored from a previous window is a dead
        // pane with no buttons (reported twice, 2026-09-14). Close whatever the last session left behind.
        void closeStaleProposalTabs();

        // Local AI assist — opt-in, one explicit command per flow, no background traffic.
        context.subscriptions.push(
            vscode.commands.registerCommand('avaloniaDesigner.assistant.implement', () => implementInFunction()),
            // The prompt the user types in the editor is sent (or thrown away) by the two lenses above the
            // ✎ block — and by Ctrl+Alt+Enter. Nothing here is in the palette: there is nothing to send until
            // a block exists, and a command that can only say "no" is worse than one that is not offered.
            vscode.commands.registerCommand('avaloniaDesigner.assistant.sendPrompt', () => sendAiPrompt()),
            vscode.commands.registerCommand('avaloniaDesigner.assistant.cancelPrompt', () => cancelAiPrompt()),
            // Models the user brings themselves: the Hub's own numbers (size, SHA-256) through the same
            // verified download the pinned models use (asked 2026-09-16).
            vscode.commands.registerCommand('avaloniaDesigner.assistant.addHubModel', () => addHubModel()),
            vscode.commands.registerCommand('avaloniaDesigner.assistant.forgetHubModel', () => removeHubModel()),
            // The house rules (asked 2026-09-16): measured from the user's own files, and only the patterns
            // that hold almost everywhere — see `conventions.ts` for the two gates.
            vscode.commands.registerCommand('avaloniaDesigner.assistant.learnConventions', async () => {
                if (await learnConventions()) void refreshPanels();
            }),
            vscode.commands.registerCommand('avaloniaDesigner.assistant.status', () => showStatus()),
            // The bundled runtime: source that is built on this machine, so one VSIX fits every
            // platform (see NOTES.md §92). Its process is stopped when the window closes.
            vscode.commands.registerCommand('avaloniaDesigner.assistant.setupModel', () => chooseLocalModel(context)),
            vscode.commands.registerCommand('avaloniaDesigner.assistant.unloadModel', () => unloadLoadedModel()),
            // Which llama.cpp build the bundled runtime runs: the CPU one by default, the Vulkan one when asked
            // for. A setting and a command rather than a panel row, because it is a one-time choice about which
            // program runs — and because it is the only place the caveat fits (asked 2026-09-16).
            vscode.commands.registerCommand('avaloniaDesigner.assistant.chooseBackend', () => chooseBundledBackend()),
            // The user's own llama.cpp server (asked 2026-09-16). It is the one runtime whose binary the
            // extension does not ship, so the flow starts by finding it and says so plainly when it is absent.
            vscode.commands.registerCommand('avaloniaDesigner.assistant.startLlamaServer', async () => {
                // The panel's dropdown decides here too (one setting, one behaviour): start it the chosen way
                // and fall back to the other when that fails. The interactive picker is only reached when
                // neither way can work — the case where no model file has been chosen yet (2026-09-17).
                const outcome = await vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: 'Starting your llama-server…', cancellable: false },
                    () => startLlamaServerByChoice(startTarget())
                );
                if (outcome.ok) {
                    const message = outcome.fellBack && outcome.why
                        ? `${outcome.message} (the way chosen in the settings did not work: ${outcome.why})`
                        : outcome.message;
                    void vscode.window.showInformationMessage(message);
                    void refreshPanels();
                    return;
                }
                // An open panel has to hear about the result: it is the panel, not the notification, that
                // the user looks at next (2026-09-15).
                if (await startMyLlamaServerFlow(context)) {
                    void refreshPanels();
                } else {
                    void vscode.window.showWarningMessage(outcome.message);
                }
            }),
            vscode.commands.registerCommand('avaloniaDesigner.assistant.stopLlamaServer', async () => {
                // Whatever is serving the configured address, after a dialog that names it — the unit and its
                // uptime, or the pid and command line of a plain process (asked 2026-09-17).
                const outcome = await stopLlamaServerConfirmed();
                if (outcome.ok) void vscode.window.showInformationMessage(outcome.message);
                else if (!outcome.cancelled) void vscode.window.showWarningMessage(outcome.message);
                void refreshPanels();
            }),
            vscode.commands.registerCommand('avaloniaDesigner.assistant.stopModel', () => {
                // Both engines this window can own, because the command says "the local model" without saying
                // which one is in use — and leaving a 7 GB process behind is not a "stopped" anyone asked for.
                const stoppedOwn = stopOwnLlamaServer();
                stopModelServer();
                void vscode.window.showInformationMessage(stoppedOwn
                    ? 'Your llama-server and the built-in runtime have both been stopped.'
                    : 'The built-in model server has been stopped.');
            }),
            // Reviewing a proposal can take minutes, so the decision lives where it cannot expire: the
            // status bar and the diff editor's title bar, both driven by `avaloniaDesigner.proposalPending`.
            vscode.commands.registerCommand('avaloniaDesigner.assistant.applyProposal', () => applyProposal()),
            vscode.commands.registerCommand('avaloniaDesigner.assistant.discardProposal', () => discardProposal()),
            // The buttons above the method: the place a developer reviewing a change is actually looking.
            vscode.languages.registerCodeLensProvider([{ language: 'csharp' }, { language: 'vb' }], proposalLenses),
            proposalLenses,
            // The right pane of the diff is a read-only virtual document — otherwise closing it asks
            // "do you want to save?" about a pane that is nothing but a preview.
            vscode.workspace.registerTextDocumentContentProvider(PROPOSAL_SCHEME, proposalContent),
            proposalContent,
            vscode.commands.registerCommand(
                'avaloniaDesigner.assistant.fixFinding',
                (uri: vscode.Uri, line: number, message: string) => fixFindingWithAI(uri, line, message)
            ),
            // "✨ Fix with AI…" appears only on OUR diagnostics, and only for a line inside a method.
            vscode.languages.registerCodeActionsProvider(
                [{ language: 'csharp' }, { language: 'vb' }],
                new AssistantCodeActionProvider(),
                { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
            )
        );
        log('activate complete');
        // AFTER the commands are registered: the first-open hook opens the new project's form in the
        // Designer by executing `avaloniaDesigner.openInDesigner`, which must exist by then.
        maybeRunFirstBuild(context);
    } catch (err) {
        logger.logError(err);
        logger.log('activate FAILED — views/editors may not be registered');
        throw err;
    }
}

export async function deactivate(): Promise<void> {
    // Free the models first — the memory belongs to the user, and once the IDE is gone nothing is using it
    // (asked for 2026-09-15). Both runtimes are covered: LM Studio's server via `lms`, and the extension's
    // own sidecar process. Both steps are bounded, so a slow unload cannot hold the shutdown open.
    try {
        logger.log(`Shutting down: ${await unloadOnExit()}`);
    } catch {
        /* never fail a shutdown over this */
    }
    try { stopModelServer(); } catch { /* already gone */ }
    // …and the user's own llama-server, which is a child of this process: nothing else will stop it.
    try { stopOwnLlamaServer(); } catch { /* already gone */ }
    // VS Code disposes `context.subscriptions`, but a window reload / crashed extension host can
    // skip that — so kill the C# host here too. The host ALSO exits by itself as soon as its
    // WebSocket client disconnects (host/Program.cs), which covers even a SIGKILLed host.
    try { sharedHost?.dispose(); } catch { /* already gone */ }
    sharedHost = undefined;
    // The Code Fix diagnostics collection (PROBLEMS pane) is created lazily on first use.
    try { disposeIssues(); } catch { /* never fail a shutdown over this */ }
    // …and the collection the project's own build publishes into.
    try { disposeBuildDiagnostics(); } catch { /* never fail a shutdown over this */ }
}
