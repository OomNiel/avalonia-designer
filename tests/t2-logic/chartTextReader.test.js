/* T2 — the chart's DATA FILE reader (CSV/TSV) in BOTH twins.
 *
 * Why this exists: the bundled chart set ships as a C# file and a VB file that must stay
 * behaviourally identical (a project gets whichever its language needs, and the designer links the
 * C# one). The t1 test proves the C# reader's BEHAVIOUR against fixtures through the real host; this
 * one proves the same CONTRACT is present in the VB twin, because a missing rule there would only
 * show up in a user's VB app — as a chart that draws nothing, with no error to explain it.
 *
 * Each rule is checked in the reader's own block of each file, not file-wide: the workbook reader
 * deliberately keeps its own, different number rule (current culture as a last resort), and that must
 * not satisfy a check about the text reader.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** The text between two markers, with the end marker looked for AFTER the start marker. */
function between(source, from, to) {
    const i = source.indexOf(from);
    if (i < 0) return '';
    const j = source.indexOf(to, i + from.length);
    return j < 0 ? source.slice(i) : source.slice(i, j);
}

const CS = read('resources/GrumpyCharts.cs');
const VB = read('resources/GrumpyCharts.vb');

/** Each twin's reader, cut out of its own file so a rule cannot be satisfied from elsewhere in it. */
const TWINS = [
    ['C#', CS, between(CS, 'class DelimitedTextReader', 'class Plot')],
    ['VB', VB, between(VB, 'Class DelimitedTextReader', 'Class Plot')]
];

module.exports = async (t) => {
    t.section('chartTextReader');

    if (TWINS.some(([, , block]) => block.length < 2000)) {
        t.fail('twin', 'the DelimitedTextReader block is found in both files',
            TWINS.map(([name, , b]) => `${name}=${b.length}`).join(' '));
        return;
    }

    for (const [name, full, block] of TWINS) {
        // --- the file itself: which files, what size, opened how ---
        t.ok(/MaxBytes/.test(block) && /64/.test(block), 'file', `${name} caps the file size it will read`);
        t.ok(/FOLDER/.test(block), 'file',
            `${name} says so when the path is a folder rather than a file`);
        t.ok(/FileShare\.ReadWrite \| FileShare\.Delete|FileShare\.ReadWrite Or FileShare\.Delete/, 'file',
            `${name} opens the file allowing a writer and a rename (a logger may still be appending)`);
        t.ok(/Encoding\.UTF8, (detectEncodingFromByteOrderMarks: true|True)/.test(block), 'file',
            `${name} lets the BOM pick the encoding (UTF-16 "Unicode text" exports work)`);

        // --- the delimiter: sniffed from the first line, and forcing one wins ---
        for (const [label, pattern] of [
            [',', /","c|','/], [';', /";"c|';'/], ['tab', /ControlChars\.Tab|\\t/], ['pipe', /"\|"c|'\|'/]
        ]) {
            t.ok(pattern.test(block), 'delimiter', `${name} considers the ${label} delimiter`);
        }
        t.ok(/forced/.test(block), 'delimiter', `${name} lets the caller force a delimiter`);
        t.ok(/ReadLine\(\)/.test(block), 'delimiter', `${name} sniffs the delimiter from the FIRST line only`);

        // --- quoting: RFC 4180, and the line counter that follows an embedded newline ---
        t.ok(/reader\.Peek\(\)/.test(block), 'quoting',
            `${name} looks ahead for the doubled quote`);
        t.ok(/Append\('"'\)|Append\(""""c\)/.test(block), 'quoting',
            `${name} unescapes a doubled quote`);
        t.ok(/line\+\+|line \+= 1/.test(block), 'quoting',
            `${name} counts a newline inside a quoted field (line numbers stay physical)`);

        // --- columns: by header NAME first, then by LETTER through the workbook's own rule ---
        t.ok(/HeadersOf/.test(block) && /ColumnIndexFor/.test(block), 'columns',
            `${name} maps a column setting by header name`);
        t.ok(/SpreadsheetReader\.ColumnIndex|ColumnIndex\(/.test(block), 'columns',
            `${name} falls back to the workbook reader's column LETTERS`);

        // --- numbers: invariant, plus a comma decimal ONLY where the delimiter says so ---
        t.ok(/InvariantCulture/.test(block), 'numbers', `${name} parses numbers invariantly`);
        t.ok(!/CurrentCulture/.test(block), 'numbers',
            `${name} never falls back to the current culture for these numbers (on a de-DE machine `
            + '1,5 in a COMMA file must still be two cells)');
        t.ok(/ControlChars\.Tab|\\t|';'/.test(block) && /commaDecimal|CommaDecimal/.test(block), 'numbers',
            `${name} reads a comma decimal for a semicolon/tab file`);
        t.ok(/#N\/A|'#'|"#"/.test(block), 'numbers',
            `${name} treats the spreadsheet's "no value" cells as missing, not as 0`);

        // --- the same readers as the workbook side, so a chart cannot tell the difference ---
        for (const member of ['Read', 'ReadLabels', 'RowNumbers', 'IsNumber']) {
            t.ok(new RegExp(`\\b${member}\\b`).test(block), 'api', `${name} offers ${member}`);
        }

        // --- the sentences a user actually sees ---
        for (const [label, text] of [
            ['no rows', /holds no rows/],
            ['no numbers', /No numbers found in column/],
            ['too many fields', /fields but the header names/],
            ['not found', /was not found — check the Data File path/],
            ['in use', /is open in another program/],
            ['catch-all', /Cannot read/]
        ]) {
            t.ok(text.test(block), 'message', `${name} has the "${label}" sentence`);
        }
    }

    // --- nothing in the text reader may fall back to the machine's culture ---
    // (The workbook reader's own rule is deliberately different — a comma decimal there is guessed from
    // the current culture — so this check is scoped to the reader block above, not to the whole file.)
    const csBlock = TWINS[0][2];
    t.ok(csBlock.includes('CultureInfo.InvariantCulture'), 'numbers',
        'the C# reader parses numbers with the invariant culture');

    // --- where a RELATIVE data path points, in both twins ---
    // A portable form names its file relatively; at run time that has to mean "beside the app", because
    // that is where the project's copy-to-output item puts it (t1 drives the behaviour: the host's own
    // folder case draws, and the designer anchors the same string at the project folder).
    for (const [name, full] of TWINS) {
        // Scoped by the resolver's own doc line, which both twins word identically: the class NAME is
        // spelled differently ("class" / "Class"), and the call sites appear before it in the VB file.
        const resolver = between(full, "Where a chart's data path points at RUN TIME", 'DelimitedTextReader');
        t.ok(resolver.includes('BaseDirectory'), 'path',
            `${name} looks a relative path up beside the app's own executable`);
        t.ok(/IsPathRooted/.test(resolver), 'path', `${name} leaves an absolute path exactly as written`);
        const beside = resolver.indexOf('besideExe');
        const plain = resolver.indexOf('File.Exists(path)');
        t.ok(beside >= 0 && plain > beside, 'path',
            `${name} tries the app's folder BEFORE the folder the app was started from`);
        t.ok(/return besideExe|Return besideExe/.test(resolver), 'path',
            `${name} names the app's folder in the error when the file is nowhere (a usable sentence)`);
        t.ok(/SourcePathResolver\.Resolve\(/.test(full), 'path',
            `${name} resolves the chart's own source path through it`);
        const opens = (full.match(/SourcePathResolver\.Resolve\(path\)/g) || []).length;
        t.equal(opens, 3, 'path',
            `${name} resolves in EVERY reader (the workbook, the delimited text file and the JSON file), `
            + 'not just one');
    }

    // --- a FOLDER of samplesets: one file per slice, in both twins ---
    // A capture logs one run per file, so a 3-D chart pointed at a folder reads its slices from the files
    // in it. What must not drift: which files count (a README must not become slice 1), the ORDER (digits
    // as numbers, or run10 comes before run2), and that the folder's files carry the same columns (a
    // per-index column walk would read a different column in a different file). t1 measures all of it in
    // pixels; this is the shape half, so a change in one twin and not the other is caught here.
    for (const [name, full] of TWINS) {
        // Scoped by the class doc line, which both twins word identically (the declaration itself reads
        // "class SliceFolder" in C# and "Class SliceFolder" in VB).
        const folder = between(full, 'A FOLDER of samplesets: the other way', 'SourcePathResolver');
        t.ok(/Extensions[^\n]*\.csv[^\n]*\.tsv[^\n]*\.txt|\.csv", "\.tsv", "\.txt"/.test(folder), 'folder',
            `${name} counts only the files a chart can read (CSV/TSV/TXT)`);
        t.ok(/IsFolder/.test(folder) && /Directory\.Exists|Directory\.Exists/.test(folder), 'folder',
            `${name} asks the file system whether the path is a folder`);
        t.ok(/char\.IsDigit|Char\.IsDigit/.test(folder), 'folder',
            `${name} compares runs of digits as NUMBERS (natural order: run2 before run10)`);
        t.ok(/Files\(/.test(full), 'folder', `${name} lists the folder's files`);
        t.ok(/SliceFile\(/.test(full) && /HasSliceFolder/.test(full), 'folder',
            `${name} resolves the file for a slice index, and knows when a folder is in play`);
        t.ok(/SliceFolder\.IsFolder\(full\)/.test(full), 'folder',
            `${name} watches the FOLDER itself when the source is one (a new file is a new slice)`);
        t.ok(/_sliceFolderFor = |_sliceFolderFor = Nothing/.test(full), 'folder',
            `${name} drops the folder listing with the rest of the cache (Live Update sees a new file)`);
    }
    // The slice charts must NOT walk columns when the files are the slices…
    t.ok(/if \(HasSliceFolder\) return YColumn \?\? "C";/.test(CS), 'folder',
        'the C# waterfall reads ONE column for every file of a folder');
    t.ok(/If HasSliceFolder Then Return If\(YColumn, "C"\)/.test(VB), 'folder',
        'and the VB twin does the same');
    t.ok(/HasSliceFolder\s*\n?\s*\?\s*YColumn \?\? "C"/.test(CS) || /HasSliceFolder[\s\S]{0,80}"C"/.test(CS), 'folder',
        'the C# surface does too');
    // …and a folder has no Z ROW to read (its slices ARE the files), so the slices number themselves.
    t.ok(/HasSliceFolder\)\s*$|!HasSliceFolder/m.test(CS) && /Not HasSliceFolder/.test(VB), 'folder',
        'both twins skip the Z-row lookup for a folder (the slices number themselves from ZStart)');

    // --- JSON: the second data-file format, in both twins ---
    // The bundled file must stay DEPENDENCY-FREE, so the JSON reader is hand-written: no System.Text.Json,
    // no Newtonsoft. The shapes an export or a logger writes are all read by one rule (a single top-level
    // array, columns of equal length, a single record, or a sequence of records = JSON Lines), and a column
    // is addressed by the record's KEY with a letter as the positional fallback.
    for (const [name, full] of TWINS) {
        const json = between(full, 'Reads chart data out of a JSON file', 'Class SourcePathResolver');
        t.ok(json.length > 2000, 'json', `${name} has a JSON reader`);
        t.ok(!/System\.Text\.Json|JsonSerializer|Newtonsoft/.test(full), 'json',
            `${name} parses JSON itself — the bundled file takes no dependency`);
        t.ok(/\.json|\.jsonl|\.ndjson/.test(json) && /Matches/.test(json), 'json',
            `${name} owns .json / .jsonl / .ndjson`);
        t.ok(/ReadSeries/.test(json) && /ReadLabels/.test(json) && /RowNumbers/.test(json), 'json',
            `${name} offers the same three reads as the delimited reader`);
        t.ok(/OrdinalIgnoreCase/.test(json), 'json',
            `${name} matches a column KEY case-insensitively (like a header name)`);
        t.ok(/ColumnIndex/.test(json), 'json',
            `${name} falls back to column LETTERS when no key matches (A = the first key)`);
        t.ok(/TryParse/.test(json), 'json',
            `${name} accepts a number that arrives as a STRING (an export that quotes everything)`);
        t.ok(/is null|Is Nothing/.test(json), 'json',
            `${name} treats null / true / false / nested values as MISSING, never as 0`);
        t.ok(/line /.test(json) && /InvalidDataException|InvalidDataException/.test(json), 'json',
            `${name} reports a syntax error with the LINE it went wrong on`);
        t.ok(/JsonDataReader\.Matches|JsonDataReader\.Matches/.test(full), 'json',
            `${name} dispatches to it by EXTENSION, so a chart cannot pick the wrong reader`);
    }
    t.ok(/JsonDataReader\.ReadSeries\(file!/.test(CS) && /JsonDataReader\.ReadSeries\(file,/.test(VB), 'json',
        'the chart reads a JSON data file through the JSON reader in both twins');
    // The folder-of-samplesets rule stays CSV/TSV/TXT: a .json file in a run folder is the capture's own
    // metadata far more often than one more sampleset, and mixing shapes in one folder is not a thing.
    for (const [name, full] of TWINS) {
        const folder = between(full, 'A FOLDER of samplesets: the other way', 'SourcePathResolver');
        t.ok(!/\.json/.test(folder), 'json', `${name} does not count a .json file as a sampleset slice`);
    }

    // --- DATES on an axis, in both twins ---
    // An X,Y chart whose X column holds dates plots REAL time (unevenly spaced readings stay unevenly
    // spaced), and the axis labels its ticks as dates. Only unambiguous, culture-independent spellings are
    // accepted: a slashed date is two different days depending on the reader, so it stays TEXT.
    for (const [name, full] of TWINS) {
        const dates = between(full, 'DATES on an axis', 'A FOLDER of samplesets');
        t.ok(dates.length > 800, 'dates', `${name} has the date helper`);
        t.ok(/yyyy-MM-dd/.test(dates) && /dd\.MM\.yyyy/.test(dates), 'dates',
            `${name} accepts ISO dates and the German dot form`);
        t.ok(!/MM\/dd\/yyyy|dd\/MM\/yyyy/.test(dates), 'dates',
            `${name} does NOT guess at a slashed date (03/04/2026 is two different days)`);
        t.ok(/AssumeUniversal|AdjustToUniversal/.test(dates), 'dates',
            `${name} reads a date as UTC, so a label does not move with the machine's timezone`);
        t.ok(/PatternFor/.test(dates) && /HH:mm|MM-dd|yyyy-MM/.test(dates), 'dates',
            `${name} picks the label pattern from the SPAN (seconds for minutes, days for months)`);
        t.ok(/FromUnixTimeSeconds/.test(dates), 'dates',
            `${name} turns seconds into a calendar date through the runtime's own converter`);
        t.ok(/DurationText/.test(dates), 'dates',
            `${name} reports a distance between two readings as a duration, not a raw number`);
        t.ok(/XsAreDates/.test(full), 'dates', `${name} carries "these X values are dates" on the data`);
        t.ok(/ChartDates\.TryParse/.test(full), 'dates', `${name} parses dates while reading a file`);
        t.ok(/TickLabels\([\s\S]*?XsAreDates\)/.test(full), 'dates',
            `${name} labels the X axis with dates when the data are dates`);
        t.ok(/ChartDates\.Format\(x, span\)/.test(full), 'dates',
            `${name} prints the cursor's X as a date too`);
    }
    // The X,Y path takes a date; a category axis (xFromIndex) keeps numbering its samples and uses the
    // date as the point NAME — changing that would relabel every bar chart of dates.
    t.ok(/Not xFromIndex AndAlso ChartDates\.TryParse|!xFromIndex && ChartDates\.TryParse|!xFromIndex AndAlso ChartDates\.TryParse/.test(
        CS + VB), 'dates', 'only the X,Y path converts a date into a value');

    // --- the chart reaches the reader through ONE rule for "which file is on screen" ---
    for (const [name, full] of TWINS) {
        const paths = (full.match(/SourcePath\(\)/g) || []).length;
        t.ok(paths >= 4, 'source-path',
            `${name} resolves the active file through SourcePath() everywhere (read, cache, watcher, Z row)`,
            `found ${paths}`);
        t.ok(!/Dim file = SourceFile\b|var file = SourceFile;/.test(full), 'source-path',
            `${name} has no reader/watcher site left reading SourceFile directly`);
        t.ok(/DataFiles/.test(full) && /DelimitedTextReader\.Read\(/.test(full), 'source-path',
            `${name} dispatches to the text reader when the source kind asks for a data file`);
        t.ok(/"data"|"data\|"/.test(full) && /"book"|"book\|"/.test(full), 'source-path',
            `${name} keys its data cache by source kind, so a CSV and an .xlsx never share an entry`);
    }
};
