/* T2 — the chart's workbook reader: how it OPENS the file, and what it says when it cannot.
 *
 * Why this exists: a chart bound to an .xlsx that is open in Excel drew nothing on Windows —
 * `ZipFile.OpenRead` asks for FileShare.Read, and Excel holds its workbook with a share mode that
 * refuses it, so the open failed with "the process cannot access the file because it is being used by
 * another process". Linux never behaves that way, so the bug was invisible on the machine this was
 * developed on: nothing in the test suite could have caught it by rendering.
 *
 * These checks are therefore about the SHAPE of the reader in both twins (the renderer is verified
 * elsewhere): the share mode that tolerates a writer, the bounded retry for the moment Excel replaces
 * the file while saving, and the three distinct sentences a user can actually act on — in use, not
 * found, and anything else.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** The text between two markers, with the end marker looked for AFTER the start marker (a plain
 *  `slice` of two `indexOf` results is empty when the end appears earlier in the file). */
function between(source, from, to) {
    const i = source.indexOf(from);
    if (i < 0) return '';
    const j = source.indexOf(to, i + from.length);
    return j < 0 ? source.slice(i) : source.slice(i, j);
}

module.exports = async (t) => {
    t.section('chartWorkbookRead');

    const cs = read('resources/GrumpyCharts.cs');
    const vb = read('resources/GrumpyCharts.vb');

    // --- 1. the share mode: the whole point of the fix ---
    t.ok(/FileShare\.ReadWrite \| FileShare\.Delete/.test(cs), 'share',
        'the C# reader opens the workbook allowing a writer to hold it (Excel) and the path to be replaced');
    t.ok(/FileShare\.ReadWrite Or FileShare\.Delete/.test(vb), 'share',
        'the VB twin opens it the same way');
    for (const [name, source] of [['C#', cs], ['VB', vb]]) {
        // `ZipFile.OpenRead(` as a CALL — the doc comments name it on purpose, to say why it is not used.
        t.ok(!/ZipFile\.OpenRead\s*\(/.test(source), 'share',
            `${name} no longer opens the workbook with ZipFile.OpenRead anywhere`);
    }

    // --- 2. the bounded retry: Excel writes a temp file and renames it over the original ---
    for (const [name, source, sleep] of [['C#', cs, /Thread\.Sleep\(\d+\)/], ['VB', vb, /Threading\.Thread\.Sleep\(\d+\)/]]) {
        const open = between(source, 'OpenWorkbook', 'IsFileInUse');
        t.ok(/Const attempts As Integer = \d|const int attempts = \d/.test(open), 'retry',
            `${name} retries the open a fixed number of times`);
        t.ok(sleep.test(open), 'retry', `${name} waits between attempts`);
        t.ok(/catch \(IOException\) when|Catch ex As IOException When/.test(open), 'retry',
            `${name} retries only while the file is BUSY — not for a missing or corrupt file`);
    }

    // --- 3. the sentence the user sees, per failure kind ---
    for (const [name, source] of [['C#', cs], ['VB', vb]]) {
        const failure = between(source, 'ReadFailure', "first worksheet part");
        t.ok(/Excel/.test(failure), 'message',
            `${name} names Excel when another program holds the workbook`);
        t.ok(/reloads by itself/i.test(failure), 'message',
            `${name} tells the user the chart comes back on its own (Live Update re-reads)`);
        t.ok(/was not found/.test(failure), 'message',
            `${name} has its own sentence for a workbook that is not there`);
        t.ok(/Cannot read/.test(failure), 'message',
            `${name} keeps a catch-all sentence for anything else`);
        t.ok(/IsFileInUse/.test(failure), 'message',
            `${name} picks the sentence from the failure, not from a guess`);
    }
    // Windows reports a sharing or lock violation in the low word of the HResult.
    t.ok(/32 or 33/.test(cs), 'message', 'the C# in-use test looks for ERROR_SHARING_VIOLATION / _LOCK_VIOLATION');
    t.ok(/code = 32 OrElse code = 33/.test(vb), 'message', 'and the VB twin looks for the same two codes');

    // --- 4. the retry actually runs: the reader opens through it, both twins ---
    t.ok(/using var zip = OpenWorkbook\(path\)/.test(cs), 'wiring',
        'the C# reader opens the workbook through the tolerant helper');
    t.ok(/Using zip = OpenWorkbook\(path\)/.test(vb), 'wiring',
        'and so does the VB twin');
    t.ok(/data\.Error = ReadFailure\(path, ex\)/.test(cs), 'wiring',
        'the C# catch reports through the classifier');
    t.ok(/data\.Error = ReadFailure\(path, ex\)/.test(vb), 'wiring',
        'and the VB catch too');

    // --- 5. nothing else opens the workbook, so no path can bypass the fix ---
    // (Case-insensitive: VB spells it `New FileStream(`, C# `new FileStream(`.)
    const opens = (source) => (source.match(/FileStream\(/gi) || []).length;
    t.equal(opens(cs), 1, 'wiring', 'the C# reader opens the file in exactly one place');
    t.equal(opens(vb), 1, 'wiring', 'the VB reader too');

    // --- 6. the file-picker filter still offers .xlsx in both twins (the other way in) ---
    t.ok(/Patterns = new\[\] \{ "\*\.xlsx" \}/.test(cs), 'picker',
        'the C# "…" picker still offers .xlsx');
    t.ok(/\.Patterns = New String\(\) \{"\*\.xlsx"\}/.test(vb), 'picker',
        'and so does the VB one');
};
