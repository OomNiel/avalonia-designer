import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
    TEMPLATES,
    FormTemplate,
    FormHandler,
    buildAxaml,
    buildChromeAxaml,
    buildCsCodeBehind,
    buildVbCodeBehind,
    sanitize
} from './formTemplates';
import { findProject, ProjectLanguage } from './projectParser';

// Re-export the shared form-template engine so existing callers keep working
// and other modules can use the exact same builders as "New Form".
export {
    TEMPLATES,
    FormTemplate,
    FormHandler,
    buildAxaml,
    buildChromeAxaml,
    buildCsCodeBehind,
    buildVbCodeBehind,
    sanitize
};

const DESIGNER_VIEW_TYPE = 'avaloniaDesigner.axamlDesigner';

/**
 * "Avalonia: New Form" - asks the user for the language (C# / VB.NET), base type
 * (Window / UserControl) and form name, then creates the .axaml plus code-behind
 * and opens the new form in the designer.
 */
export async function createNewForm(_context: vscode.ExtensionContext): Promise<void> {
    const langPick = await vscode.window.showQuickPick(
        [
            { label: 'C#', description: '.axaml.cs code-behind' },
            { label: 'VB.NET', description: '.axaml.vb code-behind' }
        ],
        { placeHolder: 'Select the project language for the new form' }
    );
    if (!langPick) return;
    const language: ProjectLanguage = langPick.label === 'VB.NET' ? 'vb' : 'cs';

    const tplPick = await vscode.window.showQuickPick(
        TEMPLATES.map((t) => ({
            label: t.label,
            description: t.description,
            detail: t.fixedKind ? `Base type: ${t.fixedKind}` : 'Base type: choose next'
        })),
        { placeHolder: 'Select a starting template for the new form' }
    );
    if (!tplPick) return;
    const tpl = TEMPLATES.find((t) => t.label === tplPick!.label);
    if (!tpl) return;

    let kind: 'Window' | 'UserControl' = tpl.fixedKind ?? 'Window';
    if (!tpl.fixedKind) {
        const kindPick = await vscode.window.showQuickPick(['Window', 'UserControl'], {
            placeHolder: 'Select the base type for the new form'
        });
        if (!kindPick) return;
        kind = kindPick as 'Window' | 'UserControl';
    }

    const name = await vscode.window.showInputBox({
        prompt: 'Enter the form name (e.g. MyForm)',
        validateInput: (v) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(v) ? undefined : 'Must be a valid identifier')
    });
    if (!name) return;

    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    if (!wsFolder) {
        void vscode.window.showErrorMessage('Open a workspace before creating a new form.');
        return;
    }

    // Auto-detect the containing project (C# or VB) for existing files; for new
    // forms the user picked the language explicitly.
    let project = findProject(vscode.Uri.file(path.join(wsFolder.uri.fsPath, '__probe__.axaml')));
    let targetDir = project ? path.dirname(project.projectUri.fsPath) : wsFolder.uri.fsPath;

    if (!project) {
        const folder = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            openLabel: 'Select the project folder for the new form'
        });
        if (!folder || folder.length === 0) return;
        targetDir = folder[0].fsPath;
        project = findProject(vscode.Uri.file(path.join(targetDir, '__probe__.axaml')));
    }

    const rootNamespace = project?.rootNamespace || sanitize(path.basename(targetDir));
    const axamlPath = path.join(targetDir, `${name}.axaml`);
    if (fs.existsSync(axamlPath)) {
        void vscode.window.showErrorMessage(`${name}.axaml already exists in ${targetDir}.`);
        return;
    }

    const axaml = buildAxaml(tpl, name, kind, rootNamespace);
    const codeBehind = language === 'cs'
        ? buildCsCodeBehind(name, kind, rootNamespace, tpl.handlers)
        : buildVbCodeBehind(name, kind, tpl.handlers);
    const codePath = path.join(targetDir, language === 'cs' ? `${name}.axaml.cs` : `${name}.axaml.vb`);

    const axamlUri = vscode.Uri.file(axamlPath);
    await vscode.workspace.fs.writeFile(axamlUri, Buffer.from(axaml, 'utf8'));
    await vscode.workspace.fs.writeFile(vscode.Uri.file(codePath), Buffer.from(codeBehind, 'utf8'));

    // Open the new form in the designer editor tab.
    await vscode.commands.executeCommand('vscode.openWith', axamlUri, DESIGNER_VIEW_TYPE);
}
