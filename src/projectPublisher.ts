/**
 * "Publish" / "Install" for the project a form belongs to.
 *
 * Publish turns the designed project into an installable Debian package:
 *
 *   obj/avalonia-publish/stage/…   the tree dpkg-deb packages (DEBIAN/control, usr/bin launcher,
 *                                  .desktop entry, icon) — generated here, under obj/ so it is
 *                                  ignored by git and by the designer's own "Project Backup"
 *   publish/<pkg>_<ver>_<arch>.deb the result
 *
 * The heavy steps (`dotnet publish`, `dpkg-deb`) run in a **visible terminal** — the same pattern the
 * first-open build uses — so the build output is where a user expects it and, for Install, so `sudo`
 * can ask for the password in that terminal instead of anywhere near the extension.
 *
 * The .deb flow is Linux-only by nature (it *is* the Debian package format): on other platforms the
 * buttons are hidden and these functions refuse with a message rather than doing something surprising.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { findProject } from './projectParser';
import {
    appVersionOf, assemblyNameOf, debArchitecture, debFileName, debPackageName, debTree,
    runtimeDependency, targetFrameworkOf, AVALONIA_LINUX_LIBS, DEB_APP_DIR
} from './debBuilder';

/** Everything decided up front, so the same plan drives Publish and Install. */
export interface PublishPlan {
    projectDir: string;
    projectFile: string;
    packageName: string;
    appName: string;
    assemblyName: string;
    version: string;
    architecture: string;
    targetFramework: string;
    description: string;
    maintainer: string;
    depends: (string | undefined)[];
    /** PNG/SVG the form's Icon points at, when it points at one inside the project. */
    iconSource?: string;
    stageDir: string;
    /** Where `dotnet publish` puts the app (inside the staging tree). */
    publishOutDir: string;
    outFile: string;
    scriptPath: string;
}

const LINUX_ONLY =
    'Publishing and installing a .deb is Linux-only. This machine is not Linux, so the .deb flow is unavailable.';

/** Non-empty setting, else the fallback. */
function setting(key: string, fallback: string): string {
    const v = vscode.workspace.getConfiguration('avaloniaDesigner').get<string>(key);
    return v && v.trim() ? v.trim() : fallback;
}

/**
 * The icon the form itself uses, if it is one the project owns: `Icon="avares://App/Assets/x.png"` →
 * `<project>/Assets/x.png`. An icon pointing somewhere else is left alone (the package then simply
 * ships no icon rather than a broken one).
 */
function iconFor(formUri: vscode.Uri, projectDir: string): string | undefined {
    let text = '';
    try {
        text = fs.readFileSync(formUri.fsPath, 'utf8');
    } catch {
        return undefined;
    }
    const m = /\bIcon\s*=\s*"([^"]+)"/i.exec(text);
    const value = (m ? m[1] : '').replace(/^avares:\/\//i, '').replace(/^avares:/i, '');
    if (!value) return undefined;
    // `avares://<Assembly>/Assets/<file>` — drop the assembly part and resolve inside the project.
    const rel = value.replace(/^[^/]+\//, '');
    const candidate = path.join(projectDir, ...rel.split('/'));
    // Never leave the project: an Icon is user-editable text, so `..` must not escape it.
    if (!candidate.startsWith(projectDir + path.sep)) return undefined;
    return fs.existsSync(candidate) ? candidate : undefined;
}

/**
 * Resolves what Publish and Install would do for a form, without touching anything. `undefined` when
 * there is no project to publish (a loose .axaml with no .csproj/.vbproj next to it).
 */
export function planPublish(formUri: vscode.Uri): PublishPlan | undefined {
    const project = findProject(formUri);
    if (!project) return undefined;

    const projectFile = project.projectUri.fsPath;
    const projectDir = path.dirname(projectFile);
    let text = '';
    try {
        text = fs.readFileSync(projectFile, 'utf8');
    } catch {
        /* an unreadable project file: fall back to the names derived from the file name */
    }
    const assemblyName = assemblyNameOf(text, project.projectName);
    const packageName = debPackageName(setting('publish.packageName', '') || assemblyName);
    const version = appVersionOf(setting('publish.version', '') || text);
    const targetFramework = targetFrameworkOf(text);
    const maintainer = setting('publish.maintainer', 'Unknown <unknown@localhost>');
    const description = setting('publish.description', `Standalone application built with Avalonia`);
    const extra = vscode.workspace.getConfiguration('avaloniaDesigner').get<string[]>('publish.extraDepends') ?? [];
    const work = path.join(projectDir, 'obj', 'avalonia-publish');
    const stageDir = path.join(work, 'stage');
    const arch = debArchitecture(process.arch);

    return {
        projectDir,
        projectFile,
        packageName,
        appName: assemblyName,
        assemblyName,
        version,
        architecture: arch,
        targetFramework,
        description,
        maintainer,
        // Order matters for readability in `dpkg -I`: the runtime first, then the native libraries.
        depends: [runtimeDependency(targetFramework), ...AVALONIA_LINUX_LIBS, ...extra],
        iconSource: iconFor(formUri, projectDir),
        stageDir,
        publishOutDir: path.join(stageDir, DEB_APP_DIR.replace(/^\//, ''), packageName),
        outFile: path.join(projectDir, 'publish', debFileName(packageName, version, arch)),
        scriptPath: path.join(work, 'publish.sh')
    };
}

/** The .NET runtime identifier for a Debian architecture (used for `dotnet publish -r`). */
export function ridFor(debArch: string): string {
    switch (debArch) {
        case 'amd64': return 'linux-x64';
        case 'arm64': return 'linux-arm64';
        case 'i386': return 'linux-x86';
        case 'armhf': return 'linux-arm';
        default: return `linux-${debArch}`;
    }
}

/** `dpkg-deb` is the one external tool the packaging needs. */
function hasDpkgDeb(): boolean {
    const candidates = ['/usr/bin/dpkg-deb', '/bin/dpkg-deb', '/usr/local/bin/dpkg-deb'];
    return candidates.some((p) => fs.existsSync(p));
}

/** Writes the generated tree (and copies the icon) so `dpkg-deb` has something to package. */
function writeStage(plan: PublishPlan): void {
    fs.mkdirSync(plan.publishOutDir, { recursive: true });   // dotnet publish needs its -o to exist
    for (const file of debTree({
        package: plan.packageName,
        appName: plan.appName,
        assemblyName: plan.assemblyName,
        version: plan.version,
        architecture: plan.architecture,
        maintainer: plan.maintainer,
        depends: plan.depends,
        installedSizeKiB: 0,          // optional field; dpkg measures the real size at install time
        description: plan.description,
        longDescription: [
            plan.description,
            `Built from ${path.basename(plan.projectFile)} with the Avalonia Designer for VS Code.`,
            `Requires the ${plan.targetFramework} runtime (installed by apt as a dependency).`
        ],
        iconSource: plan.iconSource
    })) {
        const target = path.join(plan.stageDir, ...file.rel.split('/'));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        if (file.copyFrom) fs.copyFileSync(file.copyFrom, target);
        else fs.writeFileSync(target, file.text ?? '', 'utf8');
        fs.chmodSync(target, file.mode);
    }
}

/**
 * The build script the terminal runs. It is written to disk rather than typed into the terminal so a
 * long command line survives, quoting is explicit, and the user can re-run it by hand.
 */
export function publishScript(plan: PublishPlan): string {
    const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
    return `#!/usr/bin/env bash
# Generated by the Avalonia Designer — Publish. Re-runnable by hand.
set -euo pipefail
cd ${q(plan.projectDir)}
echo "▶ Publishing ${plan.appName} ${plan.version} (${plan.targetFramework}, ${plan.architecture})…"
rm -rf ${q(plan.publishOutDir)}
mkdir -p ${q(plan.publishOutDir)}
# Framework-dependent on purpose: the .deb depends on ${runtimeDependency(plan.targetFramework) ?? 'the .NET runtime'} instead of
# carrying a second copy of it (see the packaging section in NOTES.md).
dotnet publish ${q(plan.projectFile)} \\
    -c Release -r ${ridFor(plan.architecture)} \\
    --self-contained false \\
    -o ${q(plan.publishOutDir)}
echo "▶ Packaging into ${path.basename(plan.outFile)}…"
mkdir -p ${q(path.dirname(plan.outFile))}
dpkg-deb --root-owner-group --build ${q(plan.stageDir)} ${q(plan.outFile)}
echo ""
echo "✓ Built ${plan.outFile}"
echo "  Install it with the designer's Install button, or:  sudo dpkg -i ${q(plan.outFile)}"
`;
}

/** Publish: build the project and package it. Runs the build in a visible terminal. */
export async function publishApp(formUri: vscode.Uri): Promise<void> {
    if (process.platform !== 'linux') {
        void vscode.window.showWarningMessage(LINUX_ONLY);
        return;
    }
    const plan = planPublish(formUri);
    if (!plan) {
        void vscode.window.showWarningMessage(
            'No .csproj / .vbproj was found for this form, so there is nothing to publish. ' +
            'Open a form that belongs to a project (or create one with "Avalonia: New Project").');
        return;
    }
    if (!hasDpkgDeb()) {
        const pick = await vscode.window.showErrorMessage(
            'dpkg-deb is missing, so the .deb cannot be built. Install the packaging tools and try again.',
            'Install dpkg tools…');
        if (pick === 'Install dpkg tools…') {
            const t = vscode.window.createTerminal({ name: 'install dpkg', cwd: plan.projectDir });
            t.show();
            t.sendText('sudo apt-get install -y dpkg dpkg-dev');
        }
        return;
    }

    writeStage(plan);
    fs.writeFileSync(plan.scriptPath, publishScript(plan), 'utf8');
    fs.chmodSync(plan.scriptPath, 0o755);

    const terminal = vscode.window.createTerminal({ name: `Publish ${plan.appName}`, cwd: plan.projectDir });
    terminal.show();
    terminal.sendText(`bash '${plan.scriptPath.replace(/'/g, `'\\''`)}'`);
    void vscode.window.showInformationMessage(
        `Publishing ${plan.appName} ${plan.version} — the build output is in the terminal. ` +
        `The package will land in ${path.relative(plan.projectDir, plan.outFile)}.`);
}

/** The .deb Publish would produce, if it exists on disk. */
export function builtDeb(formUri: vscode.Uri): string | undefined {
    const plan = planPublish(formUri);
    return plan && fs.existsSync(plan.outFile) ? plan.outFile : undefined;
}

/** How long ago a file was written, for the "the package is older than the sources" hint. */
function isStale(plan: PublishPlan): boolean {
    let built = 0;
    try { built = fs.statSync(plan.outFile).mtimeMs; } catch { return false; }
    const newest = (dir: string, depth = 0): number => {
        if (depth > 3) return 0;
        let newestMs = 0;
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
        for (const e of entries) {
            if (e.name === 'bin' || e.name === 'obj' || e.name === 'publish' || e.name === '.git') continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) newestMs = Math.max(newestMs, newest(p, depth + 1));
            else {
                try { newestMs = Math.max(newestMs, fs.statSync(p).mtimeMs); } catch { /* ignore */ }
            }
        }
        return newestMs;
    };
    return newest(plan.projectDir) > built;
}

/**
 * Install: `sudo dpkg -i` in a visible terminal, so the password prompt stays in the terminal and is
 * never routed through the extension. Refuses (with an offer to publish) when there is nothing built.
 */
export async function installApp(formUri: vscode.Uri): Promise<void> {
    if (process.platform !== 'linux') {
        void vscode.window.showWarningMessage(LINUX_ONLY);
        return;
    }
    const plan = planPublish(formUri);
    if (!plan) {
        void vscode.window.showWarningMessage(
            'No .csproj / .vbproj was found for this form, so there is nothing to install.');
        return;
    }
    if (!fs.existsSync(plan.outFile)) {
        const pick = await vscode.window.showWarningMessage(
            `Nothing to install yet — ${path.relative(plan.projectDir, plan.outFile)} does not exist yet. ` +
            'Publish the project first.', 'Publish now');
        if (pick === 'Publish now') await publishApp(formUri);
        return;
    }
    if (isStale(plan)) {
        const pick = await vscode.window.showWarningMessage(
            `The package is older than the project's sources. Install it anyway?`,
            'Install anyway', 'Publish first');
        if (pick === 'Publish first') { await publishApp(formUri); return; }
        if (pick !== 'Install anyway') return;
    }

    const deb = plan.outFile;
    const terminal = vscode.window.createTerminal({ name: `Install ${plan.appName}`, cwd: plan.projectDir });
    terminal.show();
    // The password prompt belongs to this terminal: the extension never sees the password. Nothing
    // else is queued behind it — a second command typed while sudo waits would be eaten as the
    // password ("Sorry, try again"), so verification is left to the next state query instead.
    terminal.sendText(`sudo dpkg -i '${deb.replace(/'/g, `'\\''`)}'`);
    void vscode.window.showInformationMessage(
        `Installing ${plan.packageName} ${plan.version}. Enter your password in the terminal if it asks; ` +
        `when it finishes, ${plan.packageName} can be started from the application menu. ` +
        `A missing-dependency error is fixed with: sudo apt-get -f install`);
}

/** `dpkg -s` the package to tell the webview whether the app is currently installed. */
export function isInstalled(packageName: string): Promise<boolean> {
    return new Promise((resolve) => {
        if (process.platform !== 'linux') { resolve(false); return; }
        execFile('dpkg', ['-s', packageName], (err) => resolve(!err));
    });
}
