/* T2 — the .deb builder (src/debBuilder.ts) and the publish/install planner (src/projectPublisher.ts).
 *
 * The .deb is the one artifact a user hands to somebody else, so its metadata and its install-time
 * contract are asserted rather than eyeballed: a bad `Package:` name makes dpkg refuse the file, a
 * wrong `Depends:` leaves the other machine without a runtime, and a launcher that hardcodes
 * /usr/bin/dotnet breaks even when the apphost IS there.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vscode = require('vscode');
const {
    debPackageName, debVersion, debArchitecture, runtimeDependency, targetFrameworkOf, appVersionOf,
    assemblyNameOf, controlFile, launcherScript, desktopEntry, debTree, dpkgDebArgs, debFileName,
    AVALONIA_LINUX_LIBS
} = require('../../out/debBuilder.js');
const {
    planPublish, publishScript, publishApp, installApp, ridFor
} = require('../../out/projectPublisher.js');

const TINY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    'base64');

const CSPROJ = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <AssemblyName>MyForm</AssemblyName>
    <Version>2.4.1</Version>
  </PropertyGroup>
</Project>
`;

module.exports = async (t) => {
    t.section('T2: .deb builder');

    // --- package name: dpkg-deb refuses anything but lowercase [a-z0-9+.-] starting with an alnum ---
    t.equal(debPackageName('MyApp'), 'myapp', 'name', 'lowercased');
    t.equal(debPackageName('My App 2'), 'my-app-2', 'name', 'spaces become dashes');
    t.equal(debPackageName('Avalonia.Form_Designer'), 'avalonia.form-designer', 'name',
        'dots survive (legal), underscores do NOT — they are replaced, upper case is lowered');
    t.equal(debPackageName('--Weird--Name--'), 'weird-name', 'name',
        'leading/trailing junk stripped and runs collapsed');
    t.equal(debPackageName(''), 'avalonia-app', 'name', 'empty falls back instead of producing an invalid name');
    t.ok(/^[a-z0-9][a-z0-9+.-]*$/.test(debPackageName('9Lives!')), 'name',
        'the result always satisfies dpkg-deb\'s rule (starts alphanumeric)');

    // --- version: must start with a digit; a `-` would split upstream/revision ---
    t.equal(debVersion('v1.2.3'), '1.2.3', 'version', 'a leading v is dropped');
    t.equal(debVersion('1.0.0-beta'), '1.0.0.beta', 'version',
        'a dash becomes a dot so the whole thing stays the upstream version');
    t.equal(debVersion('2.0'), '2.0', 'version', 'kept as-is');
    t.equal(debVersion('beta'), '1.0.0', 'version', 'a version not starting with a digit falls back');
    t.equal(debVersion(''), '1.0.0', 'version', 'and so does an empty one');

    // --- architecture + the runtime dependency derived from the TFM ---
    t.equal(debArchitecture('x64'), 'amd64', 'arch', 'x64');
    t.equal(debArchitecture('arm64'), 'arm64', 'arch', 'arm64');
    t.equal(debArchitecture('ia32'), 'i386', 'arch', 'ia32');
    t.equal(debArchitecture('arm'), 'armhf', 'arch', 'arm');
    t.equal(runtimeDependency('net8.0'), 'dotnet-runtime-8.0', 'depends', 'net8.0 → dotnet-runtime-8.0');
    t.equal(runtimeDependency('net10.0'), 'dotnet-runtime-10.0', 'depends', 'net10.0 → dotnet-runtime-10.0');
    t.equal(runtimeDependency('net8.0-windows'), 'dotnet-runtime-8.0', 'depends',
        'a platform-suffixed TFM keeps the bare major.minor the Debian feed uses');
    t.equal(runtimeDependency('nonsense'), undefined, 'depends', 'an unknown TFM declares nothing');

    // --- reading the project file ---
    t.equal(targetFrameworkOf(CSPROJ), 'net8.0', 'csproj', 'TargetFramework');
    t.equal(targetFrameworkOf('<TargetFrameworks>net9.0;net8.0</TargetFrameworks>'), 'net9.0', 'csproj',
        'TargetFrameworks: the first entry wins');
    t.equal(targetFrameworkOf('<Project/>'), 'net8.0', 'csproj', 'missing → net8.0 (what the scaffold emits)');
    t.equal(appVersionOf(CSPROJ), '2.4.1', 'csproj', 'Version');
    t.equal(appVersionOf('<VersionPrefix>3.0.0</VersionPrefix>'), '3.0.0', 'csproj', 'VersionPrefix');
    t.equal(appVersionOf(CSPROJ, '9.9.9'), '2.4.1', 'csproj', 'a declared version beats the fallback');
    t.equal(appVersionOf('<Project/>', '9.9.9'), '9.9.9', 'csproj', 'and the fallback is used when absent');
    t.equal(assemblyNameOf(CSPROJ, 'ProjName'), 'MyForm', 'csproj', 'AssemblyName');
    t.equal(assemblyNameOf('<Project/>', 'ProjName'), 'ProjName', 'csproj', 'else the project file name');

    // --- control file ---
    const control = controlFile({
        package: 'myform',
        version: '2.4.1',
        architecture: 'amd64',
        maintainer: 'Grumpy <grumpy@example.com>',
        depends: [runtimeDependency('net8.0'), ...AVALONIA_LINUX_LIBS, 'some-extra'],
        installedSizeKiB: 0,
        description: 'A form',
        longDescription: ['A form', '', 'Second paragraph.']
    });
    t.ok(/^Package: myform$/m.test(control), 'control', 'Package');
    t.ok(/^Version: 2\.4\.1$/m.test(control), 'control', 'Version');
    t.ok(/^Architecture: amd64$/m.test(control), 'control', 'Architecture');
    t.ok(/^Maintainer: Grumpy <grumpy@example\.com>$/m.test(control), 'control', 'Maintainer');
    t.ok(/^Depends: dotnet-runtime-8\.0, libx11-6/m.test(control), 'control',
        'Depends names the runtime FIRST, so `apt show` leads with the prerequisite');
    t.ok(/^Depends: .*some-extra$/m.test(control), 'control', 'and extra Depends are appended');
    t.equal(/^Installed-Size: /m.test(control), false, 'control',
        'Installed-Size is omitted (optional per policy; dpkg measures the real size)');
    t.ok(/^ \.$/m.test(control), 'control',
        'a blank line inside the long description becomes " ." — otherwise apt mangles the entry');
    t.ok(/^ Second paragraph\.$/m.test(control), 'control', 'long-description lines are indented');
    const noDeps = controlFile({
        package: 'x', version: '1', architecture: 'amd64', maintainer: 'm', depends: [],
        installedSizeKiB: 10, description: 'd'
    });
    t.equal(/Depends:/.test(noDeps), false, 'control', 'no Depends line at all when nothing is declared');
    t.ok(/^Installed-Size: 10$/m.test(noDeps), 'control', 'Installed-Size is written when known');

    // --- launcher: apphost first, runtime as the fallback ---
    const launcher = launcherScript('MyForm', 'myform');
    t.ok(launcher.startsWith('#!/bin/sh\n'), 'launcher', 'a shell script');
    t.ok(launcher.includes('APP_DIR="/usr/lib/myform"'), 'launcher', 'runs from /usr/lib/<package>');
    t.ok(launcher.includes('if [ -x "$APP_DIR/MyForm" ]'), 'launcher',
        'prefers the apphost dotnet publish produced for this RID');
    t.ok(launcher.includes('exec /usr/bin/dotnet "$APP_DIR/MyForm.dll" "$@"'), 'launcher',
        'and falls back to the runtime when there is no apphost');
    t.ok(launcher.includes('"$@"'), 'launcher', 'arguments are always forwarded');

    // --- desktop entry ---
    const desktop = desktopEntry({ package: 'myform', name: 'My Form', comment: 'A demo' });
    t.ok(desktop.startsWith('[Desktop Entry]\n'), 'desktop', 'header');
    for (const line of ['Type=Application', 'Name=My Form', 'Comment=A demo', 'Exec=myform %U',
        'Icon=myform', 'Terminal=false']) {
        t.ok(desktop.includes(line + '\n'), 'desktop', line);
    }

    // --- the tree dpkg-deb packages ---
    const tree = debTree({
        package: 'myform', appName: 'My Form', assemblyName: 'MyForm', version: '2.4.1',
        architecture: 'amd64', maintainer: 'm', depends: [runtimeDependency('net8.0')],
        installedSizeKiB: 0, description: 'd', iconSource: '/tmp/whatever/icon.png'
    });
    const rels = tree.map((f) => f.rel);
    t.ok(rels.includes('DEBIAN/control'), 'tree', 'control file');
    t.ok(rels.includes('DEBIAN/postinst'), 'tree', 'postinst refreshes the menu/icon caches');
    t.ok(rels.includes('usr/bin/myform'), 'tree', 'launcher on PATH');
    t.ok(rels.includes('usr/share/applications/myform.desktop'), 'tree', 'menu entry');
    t.ok(rels.includes('usr/share/icons/hicolor/256x256/apps/myform.png'), 'tree',
        'icon named after the package, so the desktop entry can reference it');
    t.equal(tree.find((f) => f.rel === 'usr/bin/myform').mode, 0o755, 'tree', 'launcher is executable');
    t.equal(tree.find((f) => f.rel === 'DEBIAN/control').mode, 0o644, 'tree', 'control is not');
    t.equal(tree.find((f) => f.rel === 'DEBIAN/postinst').mode, 0o755, 'tree', 'postinst is executable');
    t.ok(!!tree.find((f) => f.rel.endsWith('.png')).copyFrom, 'tree',
        'the icon is COPIED from the project rather than generated as text');
    t.equal(debTree({
        package: 'p', appName: 'P', assemblyName: 'P', version: '1', architecture: 'amd64',
        maintainer: 'm', depends: [], installedSizeKiB: 0, description: 'd'
    }).some((f) => f.rel.includes('icons')), false, 'tree', 'no icon entry when the form has none');

    // --- the runtime must never sneak into the package ---
    t.equal(tree.some((f) => /dotnet|runtime/i.test(f.rel)), false, 'no-runtime',
        'the package tree never ships a .NET runtime — the dependency installs it');
    t.equal(dpkgDebArgs('/s', '/o.deb').join(' '), '--root-owner-group --build /s /o.deb', 'dpkg-deb',
        '--root-owner-group makes the archive root-owned without fakeroot');
    t.equal(debFileName('myform', '2.4.1', 'amd64'), 'myform_2.4.1_amd64.deb', 'file-name',
        'the Debian convention, so a folder can be browsed by version');

    // --- the planner, the build script and the two terminal actions ---
    t.section('T2: publish & install');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-deb-'));
    const realCreateTerminal = vscode.window.createTerminal;
    const realWarning = vscode.window.showWarningMessage;
    const terminals = [];
    const warnings = [];
    vscode.window.createTerminal = (opts) => {
        const term = { name: opts && opts.name, cwd: opts && opts.cwd, sent: [], show() { }, dispose() { }, sendText(s) { this.sent.push(s); } };
        terminals.push(term);
        return term;
    };
    vscode.window.showWarningMessage = (msg) => { warnings.push(msg); return Promise.resolve(undefined); };
    try {
        fs.mkdirSync(path.join(dir, 'Assets'));
        fs.writeFileSync(path.join(dir, 'Assets', 'icon.png'), TINY_PNG);
        fs.writeFileSync(path.join(dir, 'MyForm.csproj'), CSPROJ);
        const form = path.join(dir, 'MainWindow.axaml');
        fs.writeFileSync(form, '<Window xmlns="https://github.com/avaloniaui" ' +
            'Icon="avares://MyForm/Assets/icon.png" Title="Demo"/>\n');
        const uri = vscode.Uri.file(form);

        const plan = planPublish(uri);
        t.ok(!!plan, 'plan', 'a form inside a project plans');
        t.equal(plan.packageName, 'myform', 'plan', 'package name');
        t.equal(plan.appName, 'MyForm', 'plan', 'app name');
        t.equal(plan.version, '2.4.1', 'plan', 'version from the project file');
        t.equal(plan.targetFramework, 'net8.0', 'plan', 'target framework');
        t.equal(plan.architecture, debArchitecture(process.arch), 'plan', 'host architecture');
        t.equal(plan.depends[0], 'dotnet-runtime-8.0', 'plan', 'the runtime is a declared dependency');
        t.equal(path.basename(plan.outFile), debFileName('myform', '2.4.1', plan.architecture), 'plan',
            '.deb file name follows the convention');
        t.ok(plan.outFile.includes(path.join(dir, 'publish')), 'plan', 'it lands in <project>/publish/');
        t.ok(plan.stageDir.includes(path.join('obj', 'avalonia-publish')), 'plan',
            'the staging tree lives under obj/, which git ignores and Project Backup skips');
        t.equal(plan.iconSource, path.join(dir, 'Assets', 'icon.png'), 'plan',
            'the icon the form references is picked up from Assets/');
        t.equal(ridFor('amd64'), 'linux-x64', 'plan', 'amd64 maps to the linux-x64 RID');
        t.equal(ridFor('arm64'), 'linux-arm64', 'plan', 'arm64 to linux-arm64');

        const script = publishScript(plan);
        t.ok(script.startsWith('#!/usr/bin/env bash\n'), 'script', 'a bash script');
        t.ok(script.includes('set -euo pipefail'), 'script', 'it stops at the first error');
        t.ok(script.includes('dotnet publish'), 'script', 'it publishes');
        t.ok(script.includes('--self-contained false'), 'script',
            'framework-dependent: the runtime comes from the dependency, not the package (standing rule)');
        t.ok(script.includes(`-r ${ridFor(plan.architecture)}`), 'script', 'for the host RID');
        t.ok(script.includes('dpkg-deb --root-owner-group --build'), 'script', 'then packages it');
        t.ok(script.includes(`'${plan.projectFile}'`), 'script', 'the project path is quoted against spaces');
        t.ok(/rm -rf '[^']*\/usr\/lib\/myform'/.test(script.replace(/\\\n\s*/g, '')), 'script',
            'the publish output is cleared first, so a stale file cannot survive into the package');

        // Publish: the stage + script are written here, the build runs in a terminal.
        await publishApp(uri);
        t.equal(terminals.length, 1, 'publish', 'one terminal');
        t.equal(terminals[0].name, 'Publish MyForm', 'publish', 'named after the app');
        t.equal(terminals[0].cwd, dir, 'publish', 'started in the project folder');
        t.ok(terminals[0].sent[0].startsWith('bash '), 'publish', 'which runs the generated script');
        t.ok(fs.existsSync(plan.scriptPath), 'publish', 'the script exists on disk (re-runnable by hand)');
        t.ok((fs.statSync(plan.scriptPath).mode & 0o111) !== 0, 'publish', 'and is executable');
        const stageControl = fs.readFileSync(path.join(plan.stageDir, 'DEBIAN', 'control'), 'utf8');
        t.ok(/^Package: myform$/m.test(stageControl), 'publish', 'the stage carries the control file');
        t.ok(/^Depends: dotnet-runtime-8\.0/m.test(stageControl), 'publish', 'with the runtime dependency');
        t.ok(fs.existsSync(path.join(plan.stageDir, 'usr', 'bin', 'myform')), 'publish', 'and the launcher');
        t.ok(fs.existsSync(path.join(plan.stageDir, 'usr', 'share', 'applications', 'myform.desktop')),
            'publish', 'and the menu entry');
        const stagedIcon = path.join(plan.stageDir, 'usr', 'share', 'icons', 'hicolor', '256x256', 'apps', 'myform.png');
        t.ok(fs.existsSync(stagedIcon), 'publish', 'and the icon');
        t.ok(fs.readFileSync(stagedIcon).equals(TINY_PNG), 'publish', 'copied byte for byte');
        t.equal(fs.existsSync(plan.outFile), false, 'publish',
            'the .deb itself is NOT claimed to exist yet — the terminal builds it');

        // Install with nothing built: explain, and offer to publish instead of running sudo.
        terminals.length = 0;
        warnings.length = 0;
        await installApp(uri);
        t.equal(terminals.length, 0, 'install', 'no terminal when there is nothing to install');
        t.ok(/Publish the project first/.test(warnings.join(' ')), 'install',
            'the user is told to publish first');

        // Install with a package present: exactly one command, and it is the install.
        fs.mkdirSync(path.dirname(plan.outFile), { recursive: true });   // the build script makes it
        fs.writeFileSync(plan.outFile, Buffer.from('!<arch>\n'));
        terminals.length = 0;
        warnings.length = 0;
        await installApp(uri);
        t.equal(terminals.length, 1, 'install', 'one terminal');
        t.equal(terminals[0].name, 'Install MyForm', 'install', 'named for what it does');
        t.equal(terminals[0].sent.length, 1, 'install',
            'exactly ONE command is sent — anything queued behind it would be eaten as the sudo password');
        t.equal(terminals[0].sent[0], `sudo dpkg -i '${plan.outFile}'`, 'install',
            'sudo dpkg -i on the built package');
        t.ok(!/apt-get/.test(terminals[0].sent.join(' ')), 'install',
            "and no apt-get is run behind the user's back");
    } finally {
        vscode.window.createTerminal = realCreateTerminal;
        vscode.window.showWarningMessage = realWarning;
        fs.rmSync(dir, { recursive: true, force: true });
    }
};
