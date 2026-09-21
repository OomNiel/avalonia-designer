/* T2 — "where was I last time?": every file/folder picker in the extension remembers the folder it
 * used last, one memory per kind, in the extension's global state.
 *
 * Why this exists: the memory is *invisible* when it fails. A picker that forgot its folder still
 * opens, still returns a file, and still works — it just starts somewhere else every time, which is
 * exactly the kind of tax nobody reports as a bug. So this file pins the parts that can go wrong
 * silently:
 *
 *   1. the module itself — one memory per kind, a folder for folder pickers, the file's folder for
 *      file pickers, a remembered folder that has since been deleted ignored, and a write that fails
 *      (a read-only mount, a full disk) never taking the flow down with it;
 *   2. the INVARIANT, checked over the real sources: every `showOpenDialog` in `src/` opens where its
 *      own memory says and records what the user picked. A new picker added without the memory is
 *      what this catches.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MODULE = path.join(ROOT, 'out', 'pickerFolders.js');

/** A stand-in for `vscode.Memento` — the module only ever calls `get`/`update`. */
function fakeMemento(seed) {
    const store = { ...(seed ?? {}) };
    return {
        get: (key, fallback) => (key in store ? store[key] : fallback),
        update: async (key, value) => { store[key] = value; },
        /** The raw backing store, so a test can look at what was written. */
        raw: store
    };
}

module.exports = async (t) => {
    t.section('pickerFolders');

    // A real (temporary) tree: the module checks that a remembered folder still exists, so the test
    // has to work with folders that really are there.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pickerfolders-'));
    const sheets = path.join(tmp, 'sheets');
    const models = path.join(tmp, 'models');
    const projects = path.join(tmp, 'projects');
    for (const dir of [sheets, models, projects]) fs.mkdirSync(dir, { recursive: true });

    try {
        const fresh = () => {
            // A fresh module instance per scenario: the registered memory is module state, and some
            // assertions below are about what happens BEFORE anything is registered.
            delete require.cache[require.resolve(MODULE)];
            return require(MODULE);
        };

        // --- nothing registered: every helper is a no-op rather than a crash -------------------
        {
            const p = fresh();
            t.equal(p.lastPickerFolder('workbook'), undefined, 'guard',
                'with no memory registered the module offers no folder (it cannot throw)');
            t.equal(p.pickerStartFolder('workbook', sheets), sheets, 'guard',
                'and the call site keeps its own default');
            await p.rememberPickerFile('workbook', path.join(sheets, 'a.xlsx'));
            t.equal(p.lastPickerFolder('workbook'), undefined, 'guard',
                'and a remembered pick is dropped instead of throwing');
        }

        // --- one memory per KIND -------------------------------------------------------------
        {
            const p = fresh();
            const memento = fakeMemento();
            p.initPickerFolders(memento);
            await p.rememberPickerFile('workbook', path.join(sheets, 'book.xlsx'));
            await p.rememberPickerFile('model', path.join(models, 'qwen.gguf'));
            t.equal(p.lastPickerFolder('workbook'), sheets, 'kinds',
                'a file picker remembers the folder that holds the file');
            t.equal(p.lastPickerFolder('model'), models, 'kinds',
                'and a different kind remembers its own folder');
            t.equal(p.lastPickerFolder('icon'), undefined, 'kinds',
                'a kind that has never been used offers nothing');
            t.equal(Object.keys(memento.raw.pickerLastFolder).sort().join(','), 'model,workbook', 'kinds',
                'both live in the one global-state key, as a record');
        }

        // --- a folder picker remembers the folder itself --------------------------------------
        {
            const p = fresh();
            const memento = fakeMemento();
            p.initPickerFolders(memento);
            await p.rememberPickerFolder('folder', projects);
            t.equal(p.lastPickerFolder('folder'), projects, 'folders',
                'a folder picker remembers the folder it returned');
            t.equal(p.pickerStartFolder('folder', tmp), projects, 'folders',
                'and that wins over the call site\'s weaker default');
        }

        // --- a remembered folder that is gone is not offered ----------------------------------
        {
            const p = fresh();
            p.initPickerFolders(fakeMemento());
            const vanished = path.join(tmp, 'gone');
            await p.rememberPickerFolder('folder', vanished);
            t.equal(p.lastPickerFolder('folder'), undefined, 'stale',
                'a remembered folder that no longer exists is not offered (the dialog would open inside a path that is not there)');
            t.equal(p.pickerStartFolder('folder', tmp), tmp, 'stale',
                'and the fallback takes over again');
            // A path that exists but is a FILE is not a folder either.
            const file = path.join(tmp, 'note.txt');
            fs.writeFileSync(file, 'x');
            await p.rememberPickerFolder('folder', file);
            t.equal(p.lastPickerFolder('folder'), undefined, 'stale',
                'and neither is a remembered path that turns out to be a file');
        }

        // --- what the user picks is what the NEXT session opens -------------------------------
        {
            const p = fresh();
            const first = fakeMemento();
            p.initPickerFolders(first);
            await p.rememberPickerFile('image', path.join(sheets, 'logo.png'));
            // A "restart": a new module instance reading the same global state.
            const after = fresh();
            after.initPickerFolders(first);
            t.equal(after.lastPickerFolder('image'), sheets, 'restart',
                'the memory survives a reload of the extension (it is in global state, not a field)');
        }

        // --- a write that fails must not break the flow that used the picker ------------------
        {
            const p = fresh();
            p.initPickerFolders({
                get: () => undefined,
                update: () => { throw new Error('read-only'); }
            });
            let threw = false;
            try { await p.rememberPickerFile('workbook', path.join(sheets, 'a.xlsx')); } catch { threw = true; }
            t.equal(threw, false, 'robust',
                'a throwing memory swallows the failure (the picker flow continues)');
            const p2 = fresh();
            p2.initPickerFolders({ get: () => undefined, update: async () => { throw new Error('disk full'); } });
            let rejected = false;
            try { await p2.rememberPickerFile('workbook', path.join(sheets, 'a.xlsx')); } catch { rejected = true; }
            t.equal(rejected, false, 'robust',
                'and so does a rejecting one');
        }

        // --- a bare file name is not a folder -------------------------------------------------
        {
            const p = fresh();
            const memento = fakeMemento();
            p.initPickerFolders(memento);
            await p.rememberPickerFile('workbook', 'book.xlsx');
            t.equal(memento.raw.pickerLastFolder?.workbook, undefined, 'robust',
                'a path with no folder in it remembers nothing (getDirectoryName is ".", the process\'s own cwd)');
        }

        // --- THE INVARIANT: every picker in the extension uses its memory ---------------------
        const files = fs.readdirSync(path.join(ROOT, 'src')).filter((f) => f.endsWith('.ts'));
        let pickers = 0;
        let withMemory = 0;
        let withRemember = 0;
        for (const file of files) {
            const source = fs.readFileSync(path.join(ROOT, 'src', file), 'utf8');
            const lines = source.split('\n');
            lines.forEach((line, i) => {
                if (!/\bshow(Open|Save)Dialog\s*\(/.test(line)) return;
                pickers++;
                // The call site and what it remembers are within a few lines of each other either
                // way: the folder is read just before the dialog and written just after it returns.
                const around = lines.slice(Math.max(0, i - 12), i + 16).join('\n');
                if (/defaultUri:\s*(startFolder|pickerStartFolder|folder)\b|pickerStartFolder\(/.test(around)) {
                    withMemory++;
                } else {
                    t.fail('every-picker', 'start', `${file}:${i + 1} opens a dialog without a remembered start folder`);
                }
                if (/rememberPicker(File|Folder)\(/.test(around)) {
                    withRemember++;
                } else {
                    t.fail('every-picker', 'remember', `${file}:${i + 1} does not remember what was picked`);
                }
            });
        }
        t.ok(pickers >= 9, 'every-picker', 'the scan found the extension\'s dialogs', `pickers=${pickers}`);
        t.equal(withMemory, pickers, 'every-picker',
            'every dialog opens where its own memory says', `withMemory=${withMemory}/${pickers}`);
        t.equal(withRemember, pickers, 'every-picker',
            'and every one records the folder the user chose', `withRemember=${withRemember}/${pickers}`);
        t.ok(files.includes('pickerFolders.ts'), 'every-picker',
            'the memory lives in one module rather than in each picker');
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
};
