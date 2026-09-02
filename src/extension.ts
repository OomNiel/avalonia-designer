import * as vscode from 'vscode';
import { ToolboxProvider, ControlDefinition } from './toolboxProvider';
import { AvaloniaDesignerProvider } from './designerPanel';
import { PreviewerHostManager } from './hostClient';
import { createNewForm } from './newForm';
import { createNewProject, openLastProject, maybeRunFirstBuild } from './projectCreator';
import { ProjectViewProvider, setActiveContext } from './projectView';
import { DataSetEditorProvider, newDataSet, openDataSet } from './dataSetEditor';
import * as logger from './logger';

export function activate(context: vscode.ExtensionContext): void {
    const log = (m: string) => logger.log(m);
    try {
        log(`activate start (vscode ${vscode.version})`);
        setActiveContext(context);

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

        // Auto-build a freshly-created project the first time its folder is opened:
        // check now (in case the folder is already loaded) and again if the workspace
        // folders load slightly after activation.
        maybeRunFirstBuild(context);
        context.subscriptions.push(
            vscode.workspace.onDidChangeWorkspaceFolders(() => maybeRunFirstBuild(context))
        );

        // Previewer Host lifecycle (spawns the C# headless renderer on demand).
        const host = new PreviewerHostManager(context);
        context.subscriptions.push(host);

        // Custom editor provider: opens .axaml files in the designer tab.
        const provider = new AvaloniaDesignerProvider(context, host);
        context.subscriptions.push(
            vscode.window.registerCustomEditorProvider(AvaloniaDesignerProvider.viewType, provider, {
                webviewOptions: { retainContextWhenHidden: true },
                supportsMultipleEditorsPerDocument: true
            })
        );

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
        log('activate complete');
    } catch (err) {
        logger.logError(err);
        logger.log('activate FAILED — views/editors may not be registered');
        throw err;
    }
}

export function deactivate(): void {
    // The PreviewerHostManager disposes the host process via its disposable.
}
