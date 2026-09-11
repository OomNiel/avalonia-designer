/* T2 — projectBackup: the designer's "Project Backup" button. Copies the project folder into its
 * PARENT folder as `<Project>_<date>_<time>`, skipping build output / caches / VCS metadata, and
 * never colliding when clicked twice inside the same second. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { backupProject, backupStamp, backupFolderName, freeBackupPath, BACKUP_SKIP_DIRS } = require('../../out/projectBackup.js');

const AT = new Date(2026, 8, 11, 14, 32, 5); // 2026-09-11 14:32:05 (local)

/** A little project tree: source, assets, IDE + build folders, caches and a .git. */
function makeProject() {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-backup-'));
    const proj = path.join(parent, 'TestGrumpyPanCS');
    const write = (rel, text) => {
        const p = path.join(proj, rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, text, 'utf8');
    };
    write('TestGrumpyPanCS.csproj', '<Project/>');
    write('MainWindow.axaml', '<Window/>');
    write('MainWindow.axaml.cs', 'class M {}');
    write('testDataForGrid.adset', '{"version":1}');
    write('src/nested/deep/file.cs', 'deep');
    write('.vscode/settings.json', '{}');
    write('.gitignore', 'bin/\nobj/\n');
    write('Assets/my pic.png', 'not really a png');
    write('bin/Debug/net10.0/App.dll', 'build output');
    write('obj/project.assets.json', '{}');
    write('.git/config', '[core]');
    write('node_modules/pkg/index.js', 'module.exports = 1;');
    write('.vs/state.bin', 'ide state');
    write('sub/bin/tool.exe', 'nested build output');
    return { parent, proj };
}

module.exports = async (t) => {
    t.section('project-backup');

    // ---------- naming ----------
    t.equal(backupStamp(AT), '2026-09-11_14-32-05', 'name', 'the stamp is <date>_<time>');
    t.ok(!backupStamp(AT).includes(':'), 'name', 'Windows-safe: no colon in the name');
    t.equal(backupFolderName('/home/x/Projekte/TestGrumpyPanCS', AT), 'TestGrumpyPanCS_2026-09-11_14-32-05',
        'name', 'the project name keeps its own name and gets the stamp appended');
    t.equal(backupFolderName('/home/x/Projekte/Trailing/', AT), 'Trailing_2026-09-11_14-32-05',
        'name', 'a trailing slash does not break the name');

    // ---------- a real copy ----------
    const { parent, proj } = makeProject();
    const res = backupProject(proj, undefined, AT);
    t.equal(path.dirname(res.path), parent, 'copy', 'the backup lands in the PARENT folder');
    t.equal(path.basename(res.path), 'TestGrumpyPanCS_2026-09-11_14-32-05', 'copy', 'named as agreed');
    t.ok(fs.existsSync(res.path), 'copy', 'the backup folder exists');
    const rel = (r) => fs.existsSync(path.join(res.path, r));
    t.ok(rel('MainWindow.axaml') && rel('MainWindow.axaml.cs') && rel('TestGrumpyPanCS.csproj'),
        'copy', 'the project files are there');
    t.ok(rel(path.join('src', 'nested', 'deep', 'file.cs')), 'copy', 'nested folders are copied');
    t.ok(rel(path.join('.vscode', 'settings.json')), 'copy', '.vscode comes along');
    t.ok(rel('.gitignore'), 'copy', 'a dotFILE at the root is copied');
    t.ok(rel(path.join('Assets', 'my pic.png')), 'copy', 'a file name with a space survives');
    t.equal(fs.readFileSync(path.join(res.path, 'MainWindow.axaml.cs'), 'utf8'), 'class M {}',
        'copy', 'contents match');

    // ---------- what is skipped ----------
    for (const dir of BACKUP_SKIP_DIRS) {
        t.ok(!rel(dir), 'skip', `${dir}/ is not copied`);
    }
    t.ok(!rel(path.join('sub', 'bin', 'tool.exe')), 'skip', 'a NESTED bin/ is skipped too');
    t.equal(res.skipped.join(','), BACKUP_SKIP_DIRS.join(','), 'skip',
        'the report lists every skipped folder, in the documented order');
    t.ok(res.skipped.includes('bin') && res.skipped.includes('node_modules') && res.skipped.includes('.git'),
        'skip', 'including bin, node_modules and .git');
    t.ok(res.files >= 6, 'copy', 'the file count is reported', `${res.files} files`);

    // ---------- two clicks in the same second ----------
    const again = backupProject(proj, undefined, AT);
    t.equal(path.basename(again.path), 'TestGrumpyPanCS_2026-09-11_14-32-05-2', 'collision',
        'a name clash gets a -2 suffix instead of overwriting the first backup');
    t.ok(fs.existsSync(res.path) && fs.existsSync(again.path), 'collision', 'both backups exist');
    const explicit = freeBackupPath(parent, 'Taken');
    fs.mkdirSync(explicit, { recursive: true });
    t.equal(path.basename(freeBackupPath(parent, 'Taken')), 'Taken-2', 'collision', 'freeBackupPath finds the next free name');

    // ---------- toolbar wiring (asserted at SOURCE level: the jsdom fixture has no button labels) ----------
    {
        const root = path.join(__dirname, '..', '..');
        const panelSrc = fs.readFileSync(path.join(root, 'src', 'designerPanel.ts'), 'utf8');
        const webSrc = fs.readFileSync(path.join(root, 'media', 'designer.js'), 'utf8');
        t.ok(/<button id="btnBackup"[\s\S]{0,400}?>\s*💾 Project Backup<\/button>/.test(panelSrc), 'toolbar',
            'the toolbar button is labelled "💾 Project Backup"');
        t.ok(panelSrc.includes("case 'projectBackup':"), 'toolbar', 'the extension handles the message');
        t.ok(panelSrc.includes('saveOpenDataSetDocuments()'), 'toolbar',
            'the backup saves the DataSet designer documents first (custom editors miss saveAll)');
        t.ok(panelSrc.includes('vscode.workspace.saveAll(false)'), 'toolbar', 'and every other unsaved editor');
        t.ok(/post\(\{ type: 'projectBackup' \}\)/.test(webSrc), 'toolbar', 'the webview posts projectBackup when clicked');
    }

    // ---------- failure is reported, not silent ----------
    t.throws(() => backupProject(path.join(parent, 'nope'), undefined, AT), 'errors', 'a missing project folder throws');

    // ---------- the backup of a real project folder looks like a project ----------
    const files = fs.readdirSync(res.path).sort();
    t.ok(files.includes('MainWindow.axaml'), 'copy', 'a top-level listing shows the project files');
    t.ok(!files.includes('bin') && !files.includes('obj'), 'copy', 'and no build output');
    fs.rmSync(parent, { recursive: true, force: true });
};
