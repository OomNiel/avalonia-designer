import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { TEMPLATES, FormTemplate } from './formTemplates';
import { generateProjectScaffold } from './projectScaffold';

// ---------------------------------------------------------------------------
// "Avalonia: New Project…" — creates a complete, ready-to-run Avalonia project
// (C# or VB.NET) entirely inside the extension (no bash scripts).
//
// Reuses the SAME form-template engine as the "New Form" tool (newForm.ts):
// the main form is generated with buildChromeAxaml() + the C#/VB code-behind
// builders, so the two features stay in lockstep.
//
// The project folder (named after the project) is created automatically inside
// the current workspace folder; only when no workspace is open does the
// extension ask for a parent folder.
//
// Stack (per user decision 2026-08-24): net10.0 + Avalonia 12.1.1, rooted on
// the shared <chrome:ChromeWindow> titlebar (bundled as extension resources).
// ---------------------------------------------------------------------------

const VALID_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

/** globalState key: project paths whose first open should auto-run `dotnet build`. */
const PENDING_BUILDS_KEY = 'pendingFirstBuilds';

/** Most recently created project path (also persisted in globalState). */
export let lastProjectPath: string | undefined;

type Listener = () => void;
const listeners: Listener[] = [];
export function onLastProjectChanged(fn: Listener): void {
    listeners.push(fn);
}
function emitLastProjectChanged(): void {
    listeners.forEach((fn) => fn());
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/**
 * "Avalonia: New Project…" — asks language (unless the caller already knows it, e.g. a
 * sidebar "Create C#/VB.NET Project…" button), then template, name and folder, and scaffolds.
 */
export async function createNewProject(context: vscode.ExtensionContext, forcedLanguage?: 'cs' | 'vb'): Promise<void> {
    lastProjectPath = context.globalState.get<string>('lastProjectPath');

    let language = forcedLanguage;
    if (!language) language = await pickLanguage();
    if (!language) return;

    const tpl = await pickTemplate();
    if (!tpl) return;

    const name = await inputName();
    if (!name) return;

    const targetDir = await resolveParentDir();
    if (!targetDir) return;

    const projectPath = path.join(targetDir, name);
    if (fs.existsSync(projectPath)) {
        void vscode.window.showErrorMessage(
            `A folder named "${name}" already exists in ${targetDir}.`
        );
        return;
    }

    try {
        generateProject({ context, language, tpl, name, targetDir, projectPath });
    } catch (err) {
        void vscode.window.showErrorMessage(
            `Failed to create the project: ${err instanceof Error ? err.message : String(err)}`
        );
        return;
    }

    lastProjectPath = projectPath;
    await context.globalState.update('lastProjectPath', projectPath);
    emitLastProjectChanged();

    // Mark this project so the FIRST time it is opened as a workspace, the
    // extension auto-opens a terminal and runs `dotnet build` for the user.
    const pending = context.globalState.get<string[]>(PENDING_BUILDS_KEY) ?? [];
    await context.globalState.update(PENDING_BUILDS_KEY, [...pending, projectPath]);

    const open = await vscode.window.showInformationMessage(
        `Project "${name}" created in ${projectPath}.`,
        'Open Project'
    );
    if (open === 'Open Project') {
        // Restore the NuGet packages BEFORE the new window opens. The vbnet-companion / Roslyn
        // language server otherwise indexes the project before the first build's restore finishes
        // and reports "Avalonia … is not defined" until a full window reload (known stale-workspace
        // issue). With the packages already on disk, the server loads the project correctly first
        // time. Best-effort: if restore fails we still open the folder (the first-open build below
        // will retry it).
        await restoreBeforeOpen(projectPath);
        await openFolderInWindow(projectPath);
    }
}

/** Runs `dotnet restore` (fast when packages are cached) and waits for it to finish. */
async function restoreBeforeOpen(projectPath: string): Promise<void> {
    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Restoring NuGet packages…' },
        () => new Promise<void>((resolve) => {
            execFile('dotnet', ['restore', projectPath], { cwd: projectPath, timeout: 180000 }, () => resolve());
        })
    );
}

/** "Avalonia: Open Created Project" — opens the most recent project in a new window. */
export async function openLastProject(context: vscode.ExtensionContext): Promise<void> {
    lastProjectPath = context.globalState.get<string>('lastProjectPath');
    if (!lastProjectPath) {
        void vscode.window.showWarningMessage(
            'No project has been created yet. Click "Create Project…" first.'
        );
        return;
    }
    if (!fs.existsSync(lastProjectPath)) {
        void vscode.window.showWarningMessage(
            `The last project folder no longer exists: ${lastProjectPath}`
        );
        return;
    }
    await openFolderInWindow(lastProjectPath);
}

/**
 * If the currently-open workspace is a freshly-created project (marked by
 * createNewProject), open the terminal pane and run `dotnet build` — done once,
 * the first time the project folder is opened. The marker is cleared afterwards.
 */
export function maybeRunFirstBuild(context: vscode.ExtensionContext): void {
    const pending = context.globalState.get<string[]>(PENDING_BUILDS_KEY) ?? [];
    if (pending.length === 0) return;

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return;

    const rest = pending.filter((p) => p !== root);
    if (rest.length === pending.length) return; // this workspace is not a pending project

    // Matched — consume the marker, then build.
    void context.globalState.update(PENDING_BUILDS_KEY, rest.length ? rest : undefined);

    const terminal = vscode.window.createTerminal({ name: 'dotnet build', cwd: root });
    terminal.show();
    terminal.sendText('dotnet build');
}

// ---------------------------------------------------------------------------
// Scaffolding
// ---------------------------------------------------------------------------

interface GenerateOptions {
    context: vscode.ExtensionContext;
    language: 'cs' | 'vb';
    tpl: FormTemplate;
    name: string;
    targetDir: string;
    projectPath: string;
}

function generateProject(opts: GenerateOptions): void {
    const { context, language, tpl, name, projectPath } = opts;
    fs.mkdirSync(projectPath, { recursive: true });
    generateProjectScaffold({
        language,
        tpl,
        name,
        projectPath,
        chromeCs: readResource(context, 'resources/ChromeWindow.cs'),
        chromeVb: readResource(context, 'resources/ChromeWindow.vb'),
        anchorCs: readResource(context, 'resources/AnchorHelper.cs'),
        anchorVb: readResource(context, 'resources/AnchorHelper.vb'),
        vbBridgeDll: vbBridgeDllPath()
    });
}

/** Absolute path to the VB.NET Companion LanguageServer.dll on THIS machine, if the extension is
 *  installed and the file exists. Found dynamically (extension install path + known sub-path) so
 *  the scaffold never hardcodes a machine-specific path — on a machine without the extension, this
 *  returns undefined and VB projects simply skip the per-project bridge settings. */
function vbBridgeDllPath(): string | undefined {
    try {
        const ext = vscode.extensions.getExtension('roies.vbnet-companion');
        if (!ext) return undefined;
        const candidate = path.join(ext.extensionPath, 'server', 'VBNetCompanion.LanguageServer', 'publish', 'VBNetCompanion.LanguageServer.dll');
        return fs.existsSync(candidate) ? candidate : undefined;
    } catch {
        return undefined;
    }
}

function readResource(context: vscode.ExtensionContext, relPath: string): string {
    return fs.readFileSync(context.asAbsolutePath(relPath), 'utf8');
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

async function pickLanguage(): Promise<'cs' | 'vb' | undefined> {
    const pick = await vscode.window.showQuickPick(
        [
            { label: 'C#', description: 'Avalonia C# project (.csproj)' },
            { label: 'VB.NET', description: 'Avalonia VB.NET project (.vbproj)' }
        ],
        { placeHolder: 'Select the project language', ignoreFocusOut: true }
    );
    return pick ? (pick.label === 'VB.NET' ? 'vb' : 'cs') : undefined;
}

async function pickTemplate(): Promise<FormTemplate | undefined> {
    const pick = await vscode.window.showQuickPick(
        TEMPLATES.map((t) => ({ label: t.label, description: t.description })),
        { placeHolder: 'Select the starting template for the main form', ignoreFocusOut: true }
    );
    return pick ? TEMPLATES.find((t) => t.label === pick!.label) : undefined;
}

async function inputName(): Promise<string | undefined> {
    const name = await vscode.window.showInputBox({
        title: 'New Avalonia project',
        prompt: 'Project name — this becomes the folder name and the code namespace',
        placeHolder: 'e.g. MyApp',
        ignoreFocusOut: true,
        validateInput: (value) =>
            VALID_NAME.test(value)
                ? undefined
                : 'Use letters, digits, "_", "-" or "." — must start with a letter or "_" (e.g. MyApp or My-App).'
    });
    return name && name.trim().length > 0 ? name.trim() : undefined;
}

/**
 * Parent folder for the new project. When a workspace is open we use its root
 * automatically (no prompt); otherwise the user is asked for a parent once.
 */
async function resolveParentDir(): Promise<string | undefined> {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (ws) return ws;

    const chosen = await vscode.window.showOpenDialog({
        title: 'Select a folder for the new project',
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        defaultUri: vscode.Uri.file(os_homedir())
    });
    return chosen && chosen.length > 0 ? chosen[0].fsPath : undefined;
}

function os_homedir(): string {
    return require('os').homedir() as string;
}

async function openFolderInWindow(folderPath: string): Promise<void> {
    const forceNewWindow = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folderPath), forceNewWindow);
}

