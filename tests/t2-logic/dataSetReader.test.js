/* T2 — the shared `.adset` reader (src/dataSetReader.ts).
 *
 * It caches the parsed schemas because six lookups read them and a single render reaches several of
 * them (each call used to walk the tree and read + parse every schema, synchronously). The cache is
 * validated on every call — file list, sizes and newest mtime — so an edit made here, by the DataSet
 * designer in another panel, or by an external tool is picked up with NO invalidation hook that a
 * future writer could forget to call. These tests pin exactly that.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readDataSetFiles, walkAdsets, invalidateDataSetFiles } = require('../../out/dataSetReader.js');

const spec = (name) => JSON.stringify({ version: 1, name, tables: [] });

module.exports = async (t) => {
    t.section('T2: .adset reader');

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-reader-'));
    try {
        fs.mkdirSync(path.join(root, 'sub'));
        fs.mkdirSync(path.join(root, 'bin'));
        fs.writeFileSync(path.join(root, 'bin', 'build-output.adset'), spec('Nope'));
        const alpha = path.join(root, 'Data.adset');
        fs.writeFileSync(alpha, spec('Alpha'));
        fs.writeFileSync(path.join(root, 'sub', 'More.adset'), spec('Beta'));

        const first = readDataSetFiles(root);
        t.equal(first.length, 2, 'walk', 'both .adset files are found');
        t.equal(walkAdsets(root).length, 2, 'walk', 'bin/ is skipped');
        t.equal(first.map((f) => f.spec.name).sort(), ['Alpha', 'Beta'], 'parse', 'and both parsed');

        t.ok(readDataSetFiles(root) === first, 'cache', 'an unchanged folder reuses the parsed result');

        // An edit with NO invalidation must be visible (this is what makes the cache safe to use).
        fs.writeFileSync(alpha, spec('AlphaEdited'));
        const second = readDataSetFiles(root);
        t.ok(second !== first, 'fresh', 'an edit invalidates the entry by itself');
        t.equal(second.find((f) => f.adsetPath === alpha).spec.name, 'AlphaEdited', 'fresh',
            'and the edited content is read');
        t.ok(readDataSetFiles(root) === second, 'cache', 'the re-read result is cached again');

        fs.writeFileSync(path.join(root, 'Third.adset'), spec('Gamma'));
        t.equal(readDataSetFiles(root).length, 3, 'added', 'a new .adset is picked up');

        fs.rmSync(path.join(root, 'Third.adset'));
        t.equal(readDataSetFiles(root).length, 2, 'removed', 'a deleted .adset disappears');

        fs.writeFileSync(path.join(root, 'Broken.adset'), '{ not json');
        const withBroken = readDataSetFiles(root);
        t.equal(withBroken.length, 2, 'corrupt', 'a corrupt .adset is skipped');
        t.ok(withBroken.every((f) => f.spec && Array.isArray(f.spec.tables)), 'corrupt',
            'while the others still parse');

        invalidateDataSetFiles(root);
        t.ok(readDataSetFiles(root) !== withBroken, 'invalidate', 'invalidate drops the entry');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }

    // --- where the design-time DataGrid preview looks for a table's database (2026-09-27) ---
    // Reported from a running app: "why don't I have a live preview of the bound dataset table in the
    // DataGrid at design time, as I did have before. Runtime is working correctly." The rows the preview
    // reads had MOVED: a generated `RuntimeStorage` keeps a relative `sqlite.file` in the per-user data
    // folder (`~/.local/share/<App>/`), and the preview only ever looked beside the form and beside the
    // executable — so the grid went blank the moment the app followed the new rule. These pins hold the
    // preview to the RUNNING app's own order of preference.
    {
        const { previewDbCandidates, resolvePreviewDb } = require('../../out/dataSetReader.js');
        const { runtimeDataFolder } = require('../../out/dataSetGenerator.js');

        // The rule itself, both platforms (the generated helper names the folder after the assembly).
        t.equal(runtimeDataFolder('MyApp', { HOME: '/home/u' }, 'linux'), '/home/u/.local/share/MyApp',
            'db', 'linux: the per-user data folder');
        t.equal(runtimeDataFolder('MyApp', { HOME: '/home/u', XDG_DATA_HOME: '/data' }, 'linux'),
            '/data/MyApp', 'db', 'linux: $XDG_DATA_HOME wins when the user sets it');
        t.equal(runtimeDataFolder('MyApp', { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }, 'win32'),
            'C:\\Users\\u\\AppData\\Local\\MyApp', 'db', 'windows: under LOCALAPPDATA');
        t.equal(runtimeDataFolder('', { HOME: '/home/u' }, 'linux'), '', 'db',
            'no app name means no candidate rather than a path to the wrong place');
        const readerSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'dataSetReader.ts'), 'utf8');
        t.ok(readerSrc.includes("import { runtimeDataFolder } from './dataSetGenerator'"), 'db',
            'and the folder comes FROM the generator module that emits the helper — one rule, so the ' +
            'preview cannot drift away from where the app actually writes');

        const candidates = previewDbCandidates('/proj', 'Store.db', 'MyApp');
        t.equal(candidates[0], path.join(runtimeDataFolder('MyApp'), 'Store.db'), 'db',
            'the per-user copy is looked at FIRST — that is where a run app writes');
        t.ok(candidates.includes('/proj/bin/Debug/net10.0/Store.db'), 'db',
            'then the legacy copy beside the executable');
        t.equal(candidates[candidates.length - 1], '/proj/Store.db', 'db', 'and last the copy beside the form');
        t.equal(JSON.stringify(previewDbCandidates('/proj', '/abs/Store.db', 'MyApp')), '["/abs/Store.db"]',
            'db', 'an absolute sqlite.file is used as it stands (the older test apps point into the project)');
        t.equal(previewDbCandidates('/proj', '   ', 'MyApp').length, 0, 'db', 'no file name, no candidates');

        // The regression itself: a database that exists ONLY in the per-user folder must be found.
        const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-preview-'));
        const savedHome = process.env.HOME;
        const savedXdg = process.env.XDG_DATA_HOME;
        try {
            delete process.env.XDG_DATA_HOME;
            process.env.HOME = temp;
            const viaHome = path.join(temp, '.local', 'share', 'MyApp', 'Store.db');
            fs.mkdirSync(path.dirname(viaHome), { recursive: true });
            fs.writeFileSync(viaHome, 'the per-user copy');
            t.equal(resolvePreviewDb(temp, 'Store.db', 'MyApp'), viaHome, 'db',
                'a database only in the per-user folder IS found — this is what had gone blank');

            // And when both exist, the preview shows what the app itself would use (per-user wins).
            const besideForm = path.join(temp, 'Store.db');
            fs.writeFileSync(besideForm, 'the older copy');
            t.equal(resolvePreviewDb(temp, 'Store.db', 'MyApp'), viaHome, 'db',
                'with a per-user copy AND one beside the form, the per-user row wins — exactly the app');
            fs.rmSync(viaHome);
            t.equal(resolvePreviewDb(temp, 'Store.db', 'MyApp'), besideForm, 'db',
                'once there is no per-user copy, the preview falls back to the one beside the form');
            fs.rmSync(besideForm);
            t.equal(resolvePreviewDb(temp, 'Store.db', 'MyApp'), undefined, 'db',
                'and with neither, it asks for nothing rather than guessing a path');
        } finally {
            if (savedXdg === undefined) delete process.env.XDG_DATA_HOME;
            else process.env.XDG_DATA_HOME = savedXdg;
            if (savedHome === undefined) delete process.env.HOME;
            else process.env.HOME = savedHome;
            fs.rmSync(temp, { recursive: true, force: true });
        }
    }

    // --- what the canvas grid SHOWS for a bound table (2026-09-27) ---
    // The design-time preview must draw the grid the app draws. The runtime builds its columns with
    // `Header = caption || name`, skipping a Byte[] column entirely — so the preview takes its column
    // names and header texts from the same rule, and a grid with NO database yet (the app creates it on
    // its first run) still gets its schema columns instead of being a blank box.
    {
        const { gridPreviewColumns, gridPreviewHeaders } = require('../../out/dataSetReader.js');
        const table = {
            name: 'Images', keyColumn: 'Id',
            columns: [
                { name: 'Id', type: 'Int32', caption: 'ID', allowNull: false },
                { name: 'Image', type: 'String', caption: 'Image', allowNull: false },
                { name: 'Photo', type: 'Byte[]', caption: 'Photo', allowNull: true },
                { name: 'File', type: 'String', allowNull: true }
            ]
        };
        t.equal(JSON.stringify(gridPreviewColumns(table)), '["Id","Image","File"]', 'grid-headers',
            'an image (Byte[]) column is skipped, exactly as the generated column builder skips it');
        t.equal(JSON.stringify(gridPreviewHeaders(table, gridPreviewColumns(table))), '["ID","Image","File"]',
            'grid-headers', 'a header is the column CAPTION, else its name — the string the app writes');
        t.equal(JSON.stringify(gridPreviewHeaders(table, ['Photo', 'Other'])), '["Photo","Other"]',
            'grid-headers', 'a name with no matching column keeps its own spelling (a database the user picked)');

        const panelSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'designerPanel.ts'), 'utf8');
        t.ok(/if \(!columns\.length\) columns = gridPreviewColumns\(t\)/.test(panelSrc), 'grid-headers',
            'a missing or unreadable database still gives the grid its schema columns');
        t.ok(/headers: gridPreviewHeaders\(t, columns\)/.test(panelSrc), 'grid-headers',
            'and every pushed grid carries the header texts the app would show');
    }
};
