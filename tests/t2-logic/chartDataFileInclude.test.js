/* T2 — INCLUDING a data file in the project (`src/chartDataFile.ts`), the other half of a portable form.
 *
 * The chart reads a relative `DataFile` from beside the app's own executable, so the project must copy
 * the file to its output folder. That is one MSBuild item — and the file has to BE in the project for a
 * relative path to find it, which is why a file from elsewhere is copied into `data/` first.
 *
 * The failures these checks exist for are all silent at design time: an item written with a Windows
 * backslash (MSBuild does not resolve it), an item added twice (the project grows a duplicate on every
 * click), a form pointed at a relative path the project never copies (works here, empty chart in the
 * built app), and — the one that destroys work — a copy that OVERWRITES a different data file that
 * happens to share the name.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { includeDataFile, DATA_FOLDER } = require('../../out/chartDataFile.js');

function scratch(files = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-include-'));
    const proj = path.join(dir, 'Proj.csproj');
    fs.writeFileSync(proj, '<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup>\n'
        + '    <TargetFramework>net10.0</TargetFramework>\n  </PropertyGroup>\n</Project>\n');
    for (const [rel, text] of Object.entries(files)) {
        const p = path.join(dir, rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, text);
    }
    return { dir, proj, read: () => fs.readFileSync(proj, 'utf8') };
}

module.exports = async (t) => {
    t.section('chartDataFileInclude');

    // ---------------- a file that is already in the project: item only, no copy ----------------
    {
        const s = scratch({ 'data/log.csv': 'x,y\n0,1\n' });
        const r = includeDataFile(s.proj, path.join(s.dir, 'data', 'log.csv'));
        t.equal(r.error, undefined, 'inside', 'a file inside the project needs no copying');
        t.equal(r.copied, false, 'inside', 'and nothing is copied');
        t.equal(r.relative, 'data/log.csv', 'inside',
            'the form is pointed at it relative to the project folder');
        t.ok(r.added, 'inside', 'the copy-to-output item is added');
        t.ok(s.read().includes('<None Include="data/log.csv" CopyToOutputDirectory="PreserveNewest" />'),
            'inside', 'with the path and the copy mode MSBuild wants');
        t.ok(/<\/ItemGroup>[\s\S]*<\/Project>/.test(s.read()), 'inside',
            'inserted inside the project, not after it');
    }

    // ---------------- a file from elsewhere: copied into data/ ----------------
    {
        const s = scratch();
        const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-outside-'));
        const outside = path.join(outDir, 'log.csv');
        fs.writeFileSync(outside, 'x,y\n0,2\n');
        try {
            const r = includeDataFile(s.proj, outside);
            t.equal(r.error, undefined, 'outside', 'a file from elsewhere is accepted');
            t.equal(r.copied, true, 'outside', 'by copying it into the project');
            t.equal(r.relative, `${DATA_FOLDER}/log.csv`, 'outside',
                'and pointing the form at the copy, not at the machine it came from');
            t.ok(fs.existsSync(path.join(s.dir, DATA_FOLDER, 'log.csv')), 'outside',
                'so the copy is really there');
            t.equal(fs.readFileSync(path.join(s.dir, DATA_FOLDER, 'log.csv'), 'utf8'), 'x,y\n0,2\n', 'outside',
                'with the file\'s own bytes');
            t.ok(s.read().includes(`<None Include="${DATA_FOLDER}/log.csv"`), 'outside',
                'and the project copies it (relative, ' / ' separated — MSBuild does not resolve a backslash)');
        } finally {
            try { fs.rmSync(outDir, { recursive: true, force: true }); } catch { /* gone already */ }
        }
    }

    // ---------------- the same content twice: reuse, never duplicate the item ----------------
    {
        const s = scratch({ 'data/log.csv': 'x,y\n0,1\n' });
        const first = includeDataFile(s.proj, path.join(s.dir, 'data', 'log.csv'));
        const text = s.read();
        const second = includeDataFile(s.proj, path.join(s.dir, 'data', 'log.csv'));
        t.ok(first.added, 'idempotent', 'the first call adds the item');
        t.equal(second.added, false, 'idempotent', 'the second adds nothing');
        t.equal(s.read(), text, 'idempotent', 'so the project file is untouched the second time (no duplicates)');
        t.equal((s.read().match(/CopyToOutputDirectory/g) || []).length, 1, 'idempotent',
            'exactly one copy item in the file');
    }

    // ---------------- a wildcard already covers it ----------------
    // Both spellings: a project copied between Windows and Linux carries either a backslash or a slash,
    // and MSBuild accepts both in an item's Update.
    for (const [label, wildcard] of [['a backslash', 'data\\**'], ['a slash', 'data/**']]) {
        const s = scratch({ 'data/log.csv': 'x,y\n0,1\n' });
        fs.writeFileSync(s.proj, s.read().replace('</Project>',
            `  <ItemGroup>\n    <None Update="${wildcard}" CopyToOutputDirectory="PreserveNewest" />\n`
            + '  </ItemGroup>\n</Project>\n'));
        const r = includeDataFile(s.proj, path.join(s.dir, 'data', 'log.csv'));
        t.equal(r.added, false, 'wildcard', `a <None Update="${wildcard}"/> item already covers the file (${label})`);
        t.equal((s.read().match(/CopyToOutputDirectory/g) || []).length, 1, 'wildcard',
            'so no second item is added');
    }

    // ---------------- the dangerous cases: never overwrite, never guess ----------------
    {
        const s = scratch({ 'data/log.csv': 'OTHER DATA\n' });
        const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-clash-'));
        const outside = path.join(outDir, 'log.csv');
        fs.writeFileSync(outside, 'DIFFERENT DATA\n');
        try {
            const r = includeDataFile(s.proj, outside);
            t.ok(!!r.error, 'clash', 'a different file of the same name is refused');
            t.ok(/already holds a different/.test(r.error || ''), 'clash',
                'with a sentence that names the clash, not a stack trace', r.error || '');
            t.equal(fs.readFileSync(path.join(s.dir, DATA_FOLDER, 'log.csv'), 'utf8'), 'OTHER DATA\n', 'clash',
                'and the project\'s own file is left exactly as it was');
            t.ok(!/Include="data\/log\.csv"/.test(s.read()), 'clash',
                'nothing is written to the project either');
        } finally {
            try { fs.rmSync(outDir, { recursive: true, force: true }); } catch { /* gone already */ }
        }
    }
    {
        const s = scratch();
        const r = includeDataFile(s.proj, path.join(s.dir, 'missing.csv'));
        t.ok(/not there/.test(r.error || ''), 'missing', 'a data file that is not there says so', r.error || '');
        t.ok(!s.read().includes('CopyToOutputDirectory'), 'missing', 'and the project is untouched');
        const folder = includeDataFile(s.proj, s.dir);
        t.ok(/folder, not a data file/.test(folder.error || ''), 'missing',
            'pointing it at a folder says that too (the copy/paste mistake)', folder.error || '');
    }

    // ---------------- VB projects take the same item ----------------
    {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-includevb-'));
        const proj = path.join(dir, 'Proj.vbproj');
        fs.writeFileSync(proj, '<Project Sdk="Microsoft.NET.Sdk">\n  <ItemGroup>\n'
            + '    <PackageReference Include="Avalonia" Version="12.1.1" />\n  </ItemGroup>\n</Project>\n');
        fs.writeFileSync(path.join(dir, 'log.csv'), 'x,y\n0,1\n');
        const r = includeDataFile(proj, path.join(dir, 'log.csv'));
        t.equal(r.relative, 'log.csv', 'vb', 'a file in the project folder is named as it is');
        t.ok(fs.readFileSync(proj, 'utf8').includes('<None Include="log.csv" CopyToOutputDirectory="PreserveNewest" />'),
            'vb', 'and the item is written the same way for a VB project');
    }
};
