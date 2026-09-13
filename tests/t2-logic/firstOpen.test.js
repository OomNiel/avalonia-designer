/* T2 — what happens the FIRST time a freshly created project's folder is opened.
 *
 * `createNewProject` marks the folder (and, new, the main form) in globalState; the activation hook
 * then runs `dotnet build` once and — the user-visible part — opens MainWindow.axaml in the DESIGNER,
 * so creating a project lands you in the designer instead of an empty window (an .axaml file opens in
 * the text editor by default; the designer is opt-in).
 *
 * The vscode stub has no globalState / createTerminal / workspaceFolders, so this test patches them
 * onto the stub for the duration of the run and restores them afterwards.
 */
'use strict';
const os = require('os');
const path = require('path');
const fs = require('fs');
const vscode = require('vscode');
const { maybeRunFirstBuild } = require('../../out/projectCreator.js');

const tick = () => new Promise((r) => setImmediate(r));

module.exports = async (t) => {
    t.section('T2: first open of a new project');

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-firstopen-'));
    const form = path.join(root, 'MainWindow.axaml');
    fs.writeFileSync(form, '<Window/>');

    const terminals = [];
    const commands = [];
    const store = new Map([['pendingFirstBuilds', [root]], ['pendingDesignerForms', [form]]]);

    const saved = {
        createTerminal: vscode.window.createTerminal,
        folders: vscode.workspace.workspaceFolders,
        executeCommand: vscode.commands.executeCommand
    };
    try {
        vscode.window.createTerminal = (opts) => {
            const term = {
                opts, shown: false, text: '',
                show() { this.shown = true; },
                sendText(s) { this.text = s; }
            };
            terminals.push(term);
            return term;
        };
        vscode.workspace.workspaceFolders = [{ uri: vscode.Uri.file(root), name: path.basename(root), index: 0 }];
        vscode.commands.executeCommand = async (id, arg) => { commands.push({ id, arg }); };
        const context = {
            globalState: {
                get: (k) => store.get(k),
                update: async (k, v) => { if (v === undefined) store.delete(k); else store.set(k, v); }
            }
        };

        maybeRunFirstBuild(context);
        await tick();

        t.equal(terminals.length, 1, 'build', 'the first open runs the build');
        t.equal(terminals[0] && terminals[0].text, 'dotnet build', 'build', 'with dotnet build');
        t.equal((store.get('pendingFirstBuilds') || []).length, 0, 'build', 'and consumes the marker');

        const open = commands.find((c) => c.id === 'avaloniaDesigner.openInDesigner');
        t.ok(!!open, 'designer', 'the main form is opened in the Designer');
        t.equal(open && open.arg && open.arg.fsPath, form, 'designer', 'and it is MainWindow.axaml');
        t.equal((store.get('pendingDesignerForms') || []).length, 0, 'designer',
            'the designer marker is consumed too');

        // A later call (another workspace-folder event) must do neither again.
        maybeRunFirstBuild(context);
        await tick();
        t.equal(terminals.length, 1, 'once-only', 'a later call does not build again');
        t.equal(commands.filter((c) => c.id === 'avaloniaDesigner.openInDesigner').length, 1, 'once-only',
            'and does not reopen the designer');

        // The markers belong to a SPECIFIC project: another folder must be left alone.
        const other = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-other-'));
        store.set('pendingFirstBuilds', [other]);
        store.set('pendingDesignerForms', [path.join(other, 'MainWindow.axaml')]);
        maybeRunFirstBuild(context);
        await tick();
        t.equal(terminals.length, 1, 'unrelated', 'an unrelated workspace builds nothing');
        t.equal(commands.filter((c) => c.id === 'avaloniaDesigner.openInDesigner').length, 1, 'unrelated',
            'and opens no designer');
        t.equal(store.get('pendingFirstBuilds'), [other], 'unrelated',
            'leaving the marker for the project it belongs to');

        fs.rmSync(other, { recursive: true, force: true });
    } finally {
        vscode.window.createTerminal = saved.createTerminal;
        vscode.workspace.workspaceFolders = saved.folders;
        vscode.commands.executeCommand = saved.executeCommand;
        fs.rmSync(root, { recursive: true, force: true });
    }
};
