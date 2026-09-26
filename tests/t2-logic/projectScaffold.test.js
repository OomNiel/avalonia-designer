/* T2 — projectScaffold: every new project ships a Linux-safe `.vscode/launch.json` (the standard
 * `coreclr` debugger launching the BUILT net10.0 assembly — no Windows ".exe" path) and a default
 * `build` task so F5 / Ctrl+Shift+B compile (and, with task.saveBeforeRun, save) first. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { generateProjectScaffold } = require('../../out/projectScaffold.js');
const { TEMPLATES } = require('../../out/formTemplates.js');

function makeProject(language, vbBridgeDll) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-scaffold-'));
    generateProjectScaffold({
        language,
        tpl: TEMPLATES[0], // 'blank'
        name: language === 'cs' ? 'ProjCs' : 'ProjVb',
        projectPath: dir,
        chromeCs: '// chrome cs',
        chromeVb: "' chrome vb",
        anchorCs: '// anchor cs',
        anchorVb: "' anchor vb",
        exifCs: '// ExifImageLoader.cs (test stub)',
        exifVb: "' ExifImageLoader.vb (test stub)",
        vbBridgeDll
    });
    return dir;
}

module.exports = async (t) => {
    t.section('T2: scaffold .vscode (Linux-safe launch + default build task)');

    // ---------------------------------------------------------------- the CREATOR keeps up with resources/
    // A bundled file the extension's project creator does not pass is a project that cannot build. 0.12.2
    // shipped a `GrumpyCharts.cs` that calls `GrumpyPrint.Available` and left the helper out of
    // `projectCreator.ts`, so a brand-new C# project failed its FIRST build with
    // `CS0103: The name 'GrumpyPrint' does not exist in the current context`. The scaffold options are
    // optional and a missing file is therefore tolerated silently — but "resources/ holds a file the creator
    // never sends" IS the bug, and it is checkable here, with no VS Code host.
    const creator = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'projectCreator.ts'), 'utf8');
    const bundled = fs.readdirSync(path.join(__dirname, '..', '..', 'resources'))
        .filter((f) => /\.(cs|vb)$/.test(f))
        .sort();
    t.ok(bundled.length >= 16, 'creator',
        `resources/ holds the bundled file set (found ${bundled.length})`);
    for (const file of bundled) {
        t.ok(creator.includes(`'resources/${file}'`), 'creator',
            `the project creator passes resources/${file} — a bundled file it forgets is a project that does not build`);
    }

    for (const language of ['cs', 'vb']) {
        const dir = makeProject(language);
        // Every new project ships the bundled EXIF-aware image loader (used by Data-Image binds).
        const exifFile = language === 'cs' ? 'ExifImageLoader.cs' : 'ExifImageLoader.vb';
        t.ok(fs.existsSync(path.join(dir, exifFile)), 'scaffold-exif', `${language}: ExifImageLoader bundled`);
        t.ok(fs.readFileSync(path.join(dir, exifFile), 'utf8').includes('ExifImageLoader'), 'scaffold-exif', `${language}: ExifImageLoader has content`);
        const lj = path.join(dir, '.vscode', 'launch.json');
        const tj = path.join(dir, '.vscode', 'tasks.json');
        const sj = path.join(dir, '.vscode', 'settings.json');
        t.ok(fs.existsSync(lj), 'scaffold-vscode', `${language}: launch.json written`);
        t.ok(fs.existsSync(tj), 'scaffold-vscode', `${language}: tasks.json written`);
        const launch = fs.readFileSync(lj, 'utf8');
        const tasks = fs.readFileSync(tj, 'utf8');
        t.ok(/"type": "coreclr"/.test(launch), 'scaffold-launch', `${language}: uses the coreclr debugger`);
        // program must be the BUILT assembly (net10.0, folder-relative) — never a Windows ".exe".
        t.ok(launch.includes('/bin/Debug/net10.0/${workspaceFolderBasename}.dll'), 'scaffold-launch', `${language}: program → built net10.0 dll`);
        t.ok(!/"program"\s*:\s*"[^"]*\.exe"/.test(launch), 'scaffold-launch', `${language}: program has NO Windows ".exe" suffix`);
        t.ok(/"preLaunchTask": "build"/.test(launch), 'scaffold-launch', `${language}: F5 builds first`);
        t.ok(/"label": "build"/.test(tasks) && /"command": "dotnet build"/.test(tasks), 'scaffold-tasks', `${language}: default build task`);
        // Portability (§66 fix 1): generated projects must NOT carry a per-project vbnetcompanion
        // settings.json when no bridge DLL was detected on this machine (neither C# nor VB).
        t.ok(!fs.existsSync(sj), 'scaffold-vbnet', `${language}: no vbnet settings when no bridge DLL is found`);
    }

    // When the generator DOES locate the VB.NET Companion LanguageServer.dll on this machine, VB
    // projects write a settings.json that points at THAT machine's path — never a hardcoded one.
    const vbDir = makeProject('vb', '/custom/place/VBNetCompanion.LanguageServer.dll');
    const sj = path.join(vbDir, '.vscode', 'settings.json');
    t.ok(fs.existsSync(sj), 'scaffold-vbnet', 'vb settings.json written when a bridge DLL is found');
    const settings = fs.readFileSync(sj, 'utf8');
    t.ok(settings.includes('/custom/place/VBNetCompanion.LanguageServer.dll'), 'scaffold-vbnet', 'settings use the machine-found DLL path');
    t.ok(!/\/home\/niel/.test(settings), 'scaffold-vbnet', 'no machine-specific hardcoded path in generated settings');
};
