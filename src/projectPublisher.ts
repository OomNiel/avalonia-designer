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
import {
    dotnetRuntimeFor, msiArchitecture, msiFileName, msiVersion, stableGuid, winRid, wixBuildArgs,
    wixSource, WIX_MISSING_MESSAGE
} from './msiBuilder';

/** Everything decided up front, so the same plan drives Publish and Install. */
export interface PublishPlan {
    /** Which package format this plan produces — `.deb` on Linux, `.msi` on Windows. */
    kind: 'deb' | 'msi';
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
    /** Windows only: the WiX source and the executable the shortcut points at. */
    wxsPath?: string;
    exeName?: string;
    runtimeMajor?: number;
    runtimeUrl?: string;
}

const LINUX_ONLY =
    'Publishing and installing a .deb is Linux-only. This machine is not Linux, so the .deb flow is unavailable.';
const WINDOWS_ONLY =
    'Building an MSI installer is Windows-only (it is the WiX toolset). The Publish/Install buttons are hidden on this platform.';
const MAC_ONLY =
    'Publishing is not implemented for macOS yet — the designer builds a .deb on Linux and an MSI on Windows. On macOS you can still run `dotnet publish` and the project\'s own scripts by hand.';

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
export function planPublish(formUri: vscode.Uri, platform: string = process.platform): PublishPlan | undefined {
    // Only the two formats this extension can actually produce; anything else gets no plan at all, so
    // callers cannot accidentally act on a plan for a platform they refuse to run on.
    if (platform !== 'linux' && platform !== 'win32') return undefined;
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
    const iconSource = iconFor(formUri, projectDir);
    const common = {
        projectDir, projectFile, packageName, appName: assemblyName, assemblyName,
        description, maintainer, targetFramework, iconSource, stageDir, scriptPath: ''
    };

    if (platform === 'win32') {
        // Harvesting happens from the publish output directly (WiX's <Files>), and the version has to be
        // MSI-shaped: three numbers, nothing after them — MSI truncates anything else and a truncated
        // version silently breaks upgrades.
        const arch = msiArchitecture(process.arch);
        const msiVer = msiVersion(version);
        return {
            ...common,
            kind: 'msi',
            version: msiVer,
            architecture: arch,
            depends: [],
            publishOutDir: path.join(work, 'payload'),
            outFile: path.join(projectDir, 'publish', msiFileName(packageName, msiVer, arch)),
            scriptPath: path.join(work, 'publish.ps1'),
            wxsPath: path.join(work, 'package.wxs'),
            exeName: `${assemblyName}.exe`,
            ...(() => {
                const rt = dotnetRuntimeFor(targetFramework);
                return rt ? { runtimeMajor: rt.major, runtimeUrl: rt.url } : {};
            })()
        };
    }

    const arch = debArchitecture(process.arch);
    return {
        ...common,
        kind: 'deb',
        version,
        architecture: arch,
        // Order matters for readability in `dpkg -I`: the runtime first, then the native libraries.
        depends: [runtimeDependency(targetFramework), ...AVALONIA_LINUX_LIBS, ...extra],
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
 * The Windows build script. PowerShell rather than a .cmd so quoting is predictable, and it is invoked as
 * `powershell -File <script>` so the user's terminal profile cannot change what runs.
 */
export function windowsPublishScript(plan: PublishPlan): string {
    const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
    const rid = winRid(plan.architecture);
    return `# Generated by the Avalonia Designer — Publish (Windows). Re-runnable by hand.
$ErrorActionPreference = 'Stop'
Set-Location ${q(plan.projectDir)}
Write-Host "▶ Publishing ${plan.appName} ${plan.version} (${plan.targetFramework}, ${rid})..."
Remove-Item -Recurse -Force ${q(plan.publishOutDir)} -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force ${q(plan.publishOutDir)} | Out-Null
# Framework-dependent on purpose: the MSI requires the .NET runtime instead of bundling it
# (see the packaging notes), exactly like the .deb declares it as a dependency.
dotnet publish ${q(plan.projectFile)} -c Release -r ${rid} --self-contained false -o ${q(plan.publishOutDir)}
Write-Host "▶ Building ${path.basename(plan.outFile)}..."
New-Item -ItemType Directory -Force ${q(path.dirname(plan.outFile))} | Out-Null
wix build -arch ${plan.architecture} -o ${q(plan.outFile)} ${q(plan.wxsPath ?? '')}
Write-Host ""
Write-Host "✓ Built ${plan.outFile}"
Write-Host "  Install it with the designer's Install button, or:  msiexec /i \"${plan.outFile}\""
`;
}

/** The WiX source for a plan (Windows only — the file list is harvested by WiX at build time). */
export function msiSource(plan: PublishPlan): string {
    return wixSource({
        appName: plan.appName,
        exeName: plan.exeName ?? `${plan.assemblyName}.exe`,
        version: plan.version,
        manufacturer: plan.maintainer,
        description: plan.description,
        upgradeCode: stableGuid('upgrade:' + plan.packageName),
        payloadDir: plan.publishOutDir,
        ...(plan.iconSource ? { iconPath: plan.iconSource } : {}),
        ...(plan.runtimeMajor ? { runtimeMajor: plan.runtimeMajor } : {}),
        ...(plan.runtimeUrl ? { runtimeUrl: plan.runtimeUrl } : {})
    });
}

/** `wix` is the one external tool the Windows packaging needs. */
function hasWix(): Promise<boolean> {
    return new Promise((resolve) => {
        execFile('wix', ['--version'], { timeout: 20000 }, (err) => resolve(!err));
    });
}

/**
 * The Debian build script the terminal runs. It is written to disk rather than typed into the terminal so
 * a long command line survives, quoting is explicit, and the user can re-run it by hand.
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
    const platform = process.platform;
    if (platform !== 'linux' && platform !== 'win32') {
        void vscode.window.showWarningMessage(platform === 'darwin' ? MAC_ONLY : LINUX_ONLY);
        return;
    }
    const plan = planPublish(formUri, platform);
    if (!plan) {
        void vscode.window.showWarningMessage(
            'No .csproj / .vbproj was found for this form, so there is nothing to publish. ' +
            'Open a form that belongs to a project (or create one with "Avalonia: New Project").');
        return;
    }
    if (plan.kind === 'msi') {
        await publishMsi(plan);
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

/** The package Publish would produce, if it exists on disk. */
export function builtPackage(formUri: vscode.Uri): string | undefined {
    const plan = planPublish(formUri);
    return plan && fs.existsSync(plan.outFile) ? plan.outFile : undefined;
}

/**
 * Windows publish: generate the WiX source + PowerShell build script, then run it in a terminal. `wix`
 * itself is checked first, because "not recognised as a command" in a terminal is a poor way to learn
 * that a one-line install is missing.
 */
async function publishMsi(plan: PublishPlan): Promise<void> {
    if (!(await hasWix())) {
        const pick = await vscode.window.showErrorMessage(WIX_MISSING_MESSAGE, 'Install WiX toolset…');
        if (pick === 'Install WiX toolset…') {
            const t = vscode.window.createTerminal({ name: 'install wix', cwd: plan.projectDir });
            t.show();
            t.sendText('dotnet tool install --global wix');
        }
        return;
    }
    fs.mkdirSync(path.dirname(plan.scriptPath), { recursive: true });
    fs.writeFileSync(plan.wxsPath ?? path.join(plan.stageDir, 'package.wxs'), msiSource(plan), 'utf8');
    fs.writeFileSync(plan.scriptPath, windowsPublishScript(plan), 'utf8');

    const terminal = vscode.window.createTerminal({ name: `Publish ${plan.appName}`, cwd: plan.projectDir });
    terminal.show();
    // Explicitly through powershell, so the user's default terminal profile cannot change what runs.
    terminal.sendText(`powershell -NoProfile -ExecutionPolicy Bypass -File "${plan.scriptPath}"`);
    void vscode.window.showInformationMessage(
        `Publishing ${plan.appName} ${plan.version} — the build output is in the terminal. ` +
        `The installer will land in ${path.relative(plan.projectDir, plan.outFile)}.`);
}

/** How long ago a file was written, for the "the package is older than the sources" hint. */
/**
 * Install: `sudo dpkg -i` in a visible terminal, so the password prompt stays in the terminal and is
 * never routed through the extension. Refuses (with an offer to publish) unless the package is current.
 */
export async function installApp(formUri: vscode.Uri): Promise<void> {
    const platform = process.platform;
    if (platform !== 'linux' && platform !== 'win32') {
        void vscode.window.showWarningMessage(platform === 'darwin' ? MAC_ONLY : LINUX_ONLY);
        return;
    }
    const plan = planPublish(formUri, platform);
    if (!plan) {
        void vscode.window.showWarningMessage(
            'No .csproj / .vbproj was found for this form, so there is nothing to install.');
        return;
    }
    const state = packageState(formUri, platform);
    if (state !== 'ready') {
        // The Install button is disabled in this state; this is the guard for any other caller (a command
        // palette entry later, or a stale webview that was rendered before the package disappeared).
        const pick = await vscode.window.showWarningMessage(
            state === 'none'
                ? `Nothing to install yet — ${path.relative(plan.projectDir, plan.outFile)} does not exist ` +
                  'yet. Publish the project first.'
                : `The package is older than the project's sources, so installing it would put the PREVIOUS ` +
                  'build on your machine while the designer shows the current one. Publish again first.',
            'Publish now');
        if (pick === 'Publish now') await publishApp(formUri);
        return;
    }

    const pkg = plan.outFile;
    const terminal = vscode.window.createTerminal({ name: `Install ${plan.appName}`, cwd: plan.projectDir });
    terminal.show();
    if (plan.kind === 'msi') {
        // msiexec raises the normal UAC / installer UI, so nothing is queued behind it — the same rule as
        // sudo on Linux: a second command would land in whatever prompt is waiting.
        terminal.sendText(`msiexec /i "${pkg}"`);
        void vscode.window.showInformationMessage(
            `Installing ${plan.packageName} ${plan.version}. Windows will ask for permission; when it ` +
            `finishes, ${plan.appName} is in the Start menu and in "Apps & features".`);
        return;
    }
    // The password prompt belongs to this terminal: the extension never sees the password. Nothing else is
    // queued behind it — a second command typed while sudo waits would be eaten as the password ("Sorry,
    // try again"), so verification is left to the next state query instead.
    terminal.sendText(`sudo dpkg -i '${pkg.replace(/'/g, `'\\''`)}'`);
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

/**
 * How usable the built package is, which is what decides whether the Install button is offered:
 *
 *  - `none`  nothing has been published (or the package was deleted) → Install is disabled
 *  - `stale` the package is OLDER than the project's sources → Install is disabled until it is rebuilt,
 *            because installing it would put the previous build on the machine while the designer shows
 *            the current one
 *  - `ready` the package exists and is newer than every source → Install is enabled
 */
export type PackageState = 'none' | 'stale' | 'ready';

/** Files that end up inside the app — `.md` notes or a `.vscode` tweak must not invalidate a package. */
const SOURCE_EXTENSIONS = new Set([
    '.axaml', '.xaml', '.cs', '.vb', '.csproj', '.vbproj', '.sln', '.resx', '.config',
    '.png', '.jpg', '.jpeg', '.svg', '.ico', '.gif', '.bmp', '.webp', '.ttf', '.otf'
]);
const SOURCE_SKIP_DIRS = new Set(['bin', 'obj', 'publish', '.git', '.vscode', 'node_modules']);

/** Newest modification time among the project's source files (0 when there are none). */
export function newestSourceMtime(dir: string, depth = 0): number {
    if (depth > 4) return 0;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
    let newest = 0;
    for (const e of entries) {
        if (e.isDirectory()) {
            if (SOURCE_SKIP_DIRS.has(e.name)) continue;
            newest = Math.max(newest, newestSourceMtime(path.join(dir, e.name), depth + 1));
            continue;
        }
        if (!SOURCE_EXTENSIONS.has(path.extname(e.name).toLowerCase())) continue;
        try { newest = Math.max(newest, fs.statSync(path.join(dir, e.name)).mtimeMs); } catch { /* ignore */ }
    }
    return newest;
}

/**
 * The state of the package for this form's project, or `undefined` when the platform has no package
 * format here (see `planPublish`).
 */
export function packageState(formUri: vscode.Uri, platform: string = process.platform): PackageState | undefined {
    const plan = planPublish(formUri, platform);
    if (!plan) return undefined;
    let built = 0;
    try { built = fs.statSync(plan.outFile).mtimeMs; } catch { return 'none'; }
    return newestSourceMtime(plan.projectDir) > built ? 'stale' : 'ready';
}

/** Timers that wait for a build started in a terminal to produce the package. */
const buildWatchers = new Map<string, NodeJS.Timeout>();

/**
 * A publish runs in a terminal, so the extension does not know when it finishes. Poll the artifact until
 * it appears (or the build is given up on) and report every state change, so the Install button follows
 * reality instead of staying greyed out after a successful build.
 */
export function watchForPackage(
    formUri: vscode.Uri,
    onState: (state: PackageState) => void,
    intervalMs = 1500,
    maxMinutes = 20
): vscode.Disposable {
    const key = formUri.fsPath;
    const previous = buildWatchers.get(key);
    if (previous) clearInterval(previous);
    let last: PackageState | undefined;
    let ticks = 0;
    const timer = setInterval(() => {
        ticks++;
        const state = packageState(formUri);
        if (state !== undefined && state !== last) {
            last = state;
            onState(state);
        }
        // Done when the package is there; give up after the deadline so a failed build cannot leave a
        // timer running for the rest of the session.
        if (state === 'ready' || ticks * intervalMs > maxMinutes * 60000) stop();
    }, intervalMs);
    const stop = () => {
        clearInterval(timer);
        if (buildWatchers.get(key) === timer) buildWatchers.delete(key);
    };
    buildWatchers.set(key, timer);
    return { dispose: stop };
}

/** Stops any build watcher for a document (used when the panel goes away). */
export function stopWatchingPackage(formUri: vscode.Uri): void {
    const timer = buildWatchers.get(formUri.fsPath);
    if (timer) {
        clearInterval(timer);
        buildWatchers.delete(formUri.fsPath);
    }
}
