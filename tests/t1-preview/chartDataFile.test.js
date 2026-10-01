/* T1 — the DATA FILE readers (CSV/TSV) end to end, through the host's `table` probe, which calls the
 * SAME DelimitedTextReader the generated app compiles in (resources/GrumpyCharts.cs is linked into the
 * host). The workbook reader had t1 coverage; the text reader is the new half of "Read from data files",
 * and three of its rules cannot be seen by looking at a rendered chart at all:
 *
 *   1. the DELIMITER is sniffed (a ';' file with comma decimals must not be read as one column),
 *   2. a quoted field may hold the delimiter and a NEWLINE (a naive split on lines/delimiters shifts
 *      every later row and silently drops points — the classic hand-edited-CSV failure),
 *   3. a UTF-8 BOM must not become part of the first header NAME (which would break column-by-name).
 *
 * The fixtures live in tests/fixtures/csv/. Assertions are on the parsed points and on the exact error
 * sentences, so a change to the wording or the parsing shows up here rather than in a user's chart.
 */
'use strict';
const fs = require('fs');
const net = require('net');
const path = require('path');
const { startHost, renderPng, HOST_BIN } = require('../helpers/host');

const DIR = path.join(__dirname, '..', 'fixtures', 'csv');
const f = (name) => path.join(DIR, name);
const ROOT = path.join(__dirname, '..', '..');
const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" '
    + 'xmlns:charts="using:AvaloniaCharts"';

function freePort() {
    return new Promise((res) => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    });
}

const sortedPairs = (pairs) => [...pairs].sort((x, y) => String(x.column).localeCompare(String(y.column)));

/** Counts clearly-red pixels: one way to ask "did the chart actually draw its line?". */
function redPixels(img) {
    let red = 0;
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            const i = (y * img.width + x) * 4;
            if (img.data[i] > 190 && img.data[i + 1] < 70 && img.data[i + 2] < 70) red++;
        }
    }
    return red;
}

/**
 * Where the two traces of the waterfall fixture are drawn: how much ink each colour has and its top
 * row. Measured against what the chart draws (a projected ribbon is not a pure #FF0000 line: the
 * thresholds are the loose "clearly redder/bluer than the rest" ones this chart's own test uses).
 */
function traces(img) {
    const out = { red: 0, blue: 0, redTop: -1, blueTop: -1 };
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            const i = (y * img.width + x) * 4;
            const r = img.data[i];
            const g = img.data[i + 1];
            const b = img.data[i + 2];
            if (r > g + 40 && r > b + 40) { out.red++; if (out.redTop < 0) out.redTop = y; }
            if (b > r + 40 && b > g + 40) { out.blue++; if (out.blueTop < 0) out.blueTop = y; }
        }
    }
    return out;
}

/** A one-line chart of a data file: nothing else draws, so red pixels mean the file was read. */
const chartOf = (dataFile) => `<Window ${NS} Title="datafile" Width="300" Height="200">
  <Canvas Name="Holder" Width="300" Height="200">
    <charts:GrumpyLinePlot x:Name="Chart1" Width="300" Height="200" SourceKind="DataFiles"
      DataFile="${dataFile}" XColumn="A" YColumn="B" LineColor="#FF0000" LineThickness="3"
      ShowTitle="False" ShowLegend="False" ShowAxes="False" ShowGrid="False" ShowBorder="False"/>
  </Canvas>
</Window>`;

/**
 * A WATERFALL of a folder of runs: two samplesets, one red at the back and one blue in front, both
 * reading column B of their own file. The fixture folder holds `run2.csv` (a flat 9 — tall) and
 * `run10.csv` (a flat 1 — low) plus a README that must be ignored:
 *   • the tall trace is RED only if run2 comes first, which is what natural ordering does (lexicographic
 *     would put run10 first and make the tall trace BLUE);
 *   • it is tall at all only if each slice read its OWN file (reading one file for both would make both
 *     traces the same height).
 */
const waterfallOf = (dataFile) => `<Window ${NS} Title="slices" Width="320" Height="220">
  <Canvas Name="Holder" Width="320" Height="220">
    <charts:GrumpyWaterfallPlot x:Name="Chart1" Width="320" Height="220" SourceKind="DataFiles"
      DataFile="${dataFile}" XColumn="A" YColumn="B" Elevation="30" Azimuth="40"
      ShowTitle="False" ShowLegend="False" ShowGrid="False" ShowBorder="False" ShowAxes="False">
      <charts:LineSeries Title="first" YColumn="B" LineColor="#FF0000"/>
      <charts:LineSeries Title="second" YColumn="B" LineColor="#0000FF"/>
    </charts:GrumpyWaterfallPlot>
  </Canvas>
</Window>`;

module.exports = async (t) => {
    const host = await startHost(await freePort());
    const F = 'chart-data-file';
    try {
        // ---------------- the cells view: sniffing, header names, per-cell number flags ----------------
        const plain = await host.table(f('plain.csv'));
        t.ok(!plain.error, F, 'a plain comma file reads', plain.error || '');
        t.equal(plain.delimiter, ',', F, 'a comma file sniffs as a comma');
        t.equal(plain.header, ['x', 'y'], F, 'the header line names the columns');
        t.equal(plain.width, 2, F, 'the header sets the table width');
        t.equal(plain.rows.length, 3, F, 'every data row is offered (header excluded)');
        t.equal(plain.rows[0].line, 2, F, 'a row carries its physical line number');
        t.equal(plain.rows[0].cells, [{ text: '0', number: true }, { text: '1.5', number: true }], F,
            'a cell carries its text and whether it is a number');

        const semi = await host.table(f('semicolon-decimal.csv'));
        t.equal(semi.delimiter, ';', F, 'a semicolon file sniffs as semicolon (not one column)');
        t.equal(semi.width, 3, F, 'a semicolon file splits into its three columns');
        const commaCell = semi.rows[0].cells[1];
        t.equal(commaCell.number, true, F,
            'a comma decimal in a semicolon file counts as a number (18,5 is European, not text)');

        const tab = await host.table(f('tab-delimited.tsv'));
        t.equal(tab.delimiter, '\t', F, 'a tab file sniffs as a tab');
        t.equal(tab.header, ['Zeit', 'Wert'], F, 'a tab file names its columns');

        // Forcing a delimiter overrides the sniff — the escape hatch when a file's first line lies.
        const forced = await host.table(f('plain.csv'), { delimiter: ';' });
        t.equal(forced.delimiter, ';', F, 'a forced delimiter is used as given');
        t.equal(forced.width, 1, F, 'a forced delimiter that does not occur leaves one column');

        // ---------------- quoting: RFC 4180, including a delimiter and a newline inside quotes ----------
        const quoted = await host.table(f('quoted.csv'));
        t.equal(quoted.rows.length, 2, F,
            'an embedded newline inside quotes does not split a row (2 records, not 3)');
        t.equal(quoted.rows[0].cells[0].text, 'Smith, John', F,
            'a quoted delimiter stays inside one field');
        t.equal(quoted.rows[0].cells[1].text, 'line one\nline two', F,
            'a quoted field may span lines');
        t.equal(quoted.rows[1].cells[0].text, 'Quote "inside" it', F,
            'a doubled quote unescapes to one quote');
        t.equal(quoted.rows[1].line, 4, F,
            'the line counter still tracks the physical lines an editor shows');

        // ---------------- BOM + CRLF + a "no value" cell ------------------------------------------------
        const bom = await host.table(f('bom-crlf.csv'));
        t.equal(bom.header, ['x', 'y'], F,
            'a UTF-8 BOM does not leak into the first header name (column-by-name keeps working)');
        t.equal(bom.rows.length, 3, F, 'CRLF line endings yield the file\'s three data rows');
        t.equal(bom.rows[1].cells[1].number, false, F,
            '#N/A is not a number, so a gap is visible in the preview');

        // ---------------- the chart's own read: numbers, fallback and labels ----------------------------
        const series = await host.table(f('series.csv'), { mode: 'series', xColumn: 'Time', yColumn: 'Temp' });
        t.ok(!series.error, F, 'a chart read by header NAME finds its columns', series.error || '');
        t.equal(series.xs, [0, 1, 2], F, 'the X column is read by name');
        t.equal(series.ys, [18.5, 19.1, 20.2], F, 'the Y column is read by name');
        t.equal(series.xTitle, 'Time', F, 'the axis name comes from the header of the X column');
        t.equal(series.yTitle, 'Temp', F, 'the axis name comes from the header of the Y column');

        // The same file by LETTER ("A"/"B") — the other half of the column-setting rule.
        const byLetter = await host.table(f('series.csv'), { mode: 'series', xColumn: 'A', yColumn: 'B' });
        t.equal(byLetter.ys, series.ys, F, 'letter columns and header names address the same data');

        // A European file must plot as numbers through the CHART's read too, not just in the preview.
        const european = await host.table(f('semicolon-decimal.csv'),
            { mode: 'series', xColumn: 'Zeit', yColumn: 'Temperatur' });
        t.equal(european.ys, [18.5, 19.1, 20.2], F,
            'the chart reads comma decimals of a semicolon file as numbers');

        // A one-column file: the Y column is absent, so the values fall back to X (xFromIndex).
        const single = await host.table(f('one-column.csv'),
            { mode: 'series', xColumn: 'A', yColumn: 'B', xFromIndex: true });
        t.ok(!single.error, F, 'a one-column file still draws a line chart', single.error || '');
        t.equal(single.ys, [1, 2, 3], F, 'the fallback reads the one column as the values');
        t.equal(single.xs, [0, 1, 2], F, 'the samples are numbered');

        const singleNoFallback = await host.table(f('one-column.csv'),
            { mode: 'series', xColumn: 'A', yColumn: 'B', xFromIndex: false });
        t.ok(/No numbers found in column A\/B/.test(singleNoFallback.error || ''), F,
            'without the fallback the missing Y column is reported, in the workbook reader\'s words',
            singleNoFallback.error || '');

        // A TEXT X column becomes the point's NAME — what a bar/area category axis needs (the
        // categorical read, xFromIndex, exactly as a line/bar chart makes it).
        const categories = await host.table(f('categories.csv'),
            { mode: 'series', xColumn: 'A', yColumn: 'B', xFromIndex: true });
        t.ok(!categories.error, F, 'a text X column is accepted for a category chart',
            categories.error || '');
        t.equal(categories.labels, ['Jan', 'Feb', 'Mar'], F, 'the text X column names each point');
        t.equal(categories.ys, [10, 14, 11], F, 'the numeric column beside the names is the series');

        // An X,Y (scatter) read has no place for a text X, and says so in the workbook reader's words.
        const textXy = await host.table(f('categories.csv'), { mode: 'series', xColumn: 'A', yColumn: 'B' });
        t.ok(/No numbers found in column A\/B/.test(textXy.error || ''), F,
            'an X,Y read of a text X column reports it instead of plotting nothing', textXy.error || '');

        // ---------------- pie/category read + the 3-D surface's Z row ------------------------------------
        const pie = await host.table(f('categories.csv'),
            { mode: 'labels', xColumn: 'A', yColumn: 'B' });
        t.equal(pie.labels, ['Jan', 'Feb', 'Mar'], F, 'the pie read names its slices from the label column');
        t.equal(pie.ys, [10, 14, 11], F, 'the pie read takes the value column');

        const zrow = await host.table(f('categories.csv'), { mode: 'zrow', zRow: 2 });
        t.equal(sortedPairs(zrow.row), [{ column: 'B', value: 10 }, { column: 'C', value: 12 }], F,
            'the Z row is keyed by column letter and skips the textual cell');

        // ---------------- failures are answers, with the reader's own sentences ---------------------------
        const ragged = await host.table(f('ragged.csv'), { mode: 'series', xColumn: 'A', yColumn: 'B' });
        t.ok(/Row 3/.test(ragged.error || ''), F,
            'a row with more fields than the header is reported with its line number', ragged.error || '');
        t.ok(/has 3 fields but the header names 2/.test(ragged.error || ''), F,
            '...and with what it found against what the header promised', ragged.error || '');
        t.equal(ragged.xs, [], F, 'a ragged file draws nothing rather than drawing it wrong');

        const missing = await host.table(f('no-such-file.csv'), { mode: 'series' });
        t.ok(!!missing.error, F, 'a missing file is an error string, not a crash', missing.error || '');

        const folder = await host.table(DIR, { mode: 'series' });
        t.ok(/FOLDER/.test(folder.error || ''), F,
            'pointing DataFile at a folder says so (the common copy/paste mistake)', folder.error || '');

        // ---------------- a RELATIVE data path, and where it is read from ---------------------------
        // A portable form names its data file relatively ("data/log.csv"), because the built app finds it
        // beside its own executable (the project's copy-to-output item puts it there). While DESIGNING,
        // the same string has to mean the project folder — otherwise the preview would read the host's
        // own folder and show an error the running app never shows. This is the one half of that rule a
        // test can drive: the app-side half (beside-the-exe resolution) is GrumpyCharts'
        // SourcePathResolver, checked by shape in t2.
        const relative = path.relative(ROOT, f('series.csv'));
        const drawn = await renderPng(host, chartOf(relative), 300, 200, ROOT);
        t.ok(redPixels(drawn.img) > 30, F,
            'a relative data file is read from the PROJECT folder while designing',
            `red=${redPixels(drawn.img)} path=${relative}`);
        const lost = await renderPng(host, chartOf(relative), 300, 200);
        t.equal(redPixels(lost.img), 0, F,
            'and without a project folder there is nothing to anchor it to (no line is drawn)');
        // An absolute path is still taken exactly as written, project folder or not.
        const absolute = await renderPng(host, chartOf(f('series.csv')), 300, 200);
        t.ok(redPixels(absolute.img) > 30, F, 'an absolute data path draws with or without a project');

        // The OTHER half of the rule, and the one the built app lives by: a relative path is found
        // BESIDE THE EXECUTABLE (that is where a project's copy-to-output item puts it). The host runs
        // from its own output folder, so dropping the file there is exactly the situation a shipped app
        // is in — no projectPath, nothing else pointing at it.
        const besideExe = path.join(path.dirname(HOST_BIN), 'relcheck.csv');
        try {
            fs.copyFileSync(f('series.csv'), besideExe);
            const shipped = await renderPng(host, chartOf('relcheck.csv'), 300, 200);
            t.ok(redPixels(shipped.img) > 30, F,
                'a relative data file is found beside the app\'s executable (the copy-to-output case)',
                `red=${redPixels(shipped.img)}`);
        } finally {
            try { fs.unlinkSync(besideExe); } catch { /* the build folder is disposable */ }
        }

        // A file with a header but no data: the reason names the columns and the row it started at.
        const empty = await host.table(f('header-only.csv'), { mode: 'series', xColumn: 'A', yColumn: 'B' });
        t.ok(/No numbers found in column A\/B of "header-only.csv" from row 2\./.test(empty.error || ''), F,
            'a header-only file reports which columns were empty and from which row', empty.error || '');

        // ---------------- a FOLDER of samplesets: one file per slice --------------------------------
        // A capture logs one run per file, so a 3-D chart pointed at a folder reads its slices from the
        // files in it. The fixture folder holds run2.csv (flat 9 — tall), run10.csv (flat 1 — low) and a
        // README.md that MUST NOT count as a slice (a README in front would shift every slice by one,
        // which is the kind of failure that only shows up as a slightly wrong picture).
        const sliceDir = path.join(DIR, 'slices');
        const sliced = traces((await renderPng(host, waterfallOf(sliceDir), 320, 220)).img);
        t.ok(sliced.red > 500 && sliced.blue > 200, F,
            'a folder is read as one file per sampleset (both traces are drawn, so the README.md in '
            + 'the folder did not become slice 1)', `red=${sliced.red} blue=${sliced.blue}`);
        // run2 before run10 — digits compare as NUMBERS (a lexicographic sort would put run10 first and
        // make the tall trace the BLUE one), so the first file's (red) trace is the one that reaches up.
        t.ok(sliced.redTop >= 0 && sliced.blueTop > sliced.redTop + 20, F,
            'and the files are ordered naturally: the tall run2 comes first (red above blue)',
            `redTop=${sliced.redTop} blueTop=${sliced.blueTop}`);
        // …and each slice really read its OWN file: with one file for both, the second slice would carry
        // the tall values too, and its trace would be huge and high instead of low and small.
        const sameFile = traces((await renderPng(host, waterfallOf(path.join(sliceDir, 'run2.csv')), 320, 220)).img);
        t.ok(sameFile.blue > sliced.blue * 2, F,
            'the second slice moved with its own file (a single file gives it the tall values twice)',
            `folder blue=${sliced.blue} one-file blue=${sameFile.blue}`);

        // A relative FOLDER path is anchored at the project folder exactly like a single file.
        const relFolder = path.relative(ROOT, sliceDir);
        const relDrawn = traces((await renderPng(host, waterfallOf(relFolder), 320, 220, ROOT)).img);
        t.ok(relDrawn.red > 500, F,
            'a relative folder path is read from the project folder too', `path=${relFolder}`);

        // The dialog's own view of a folder comes from the CHART's rule (SliceFolder), so what it lists
        // is what the chart reads — same extensions, same order.
        const listing = await host.table(sliceDir, { mode: 'folder' });
        t.equal(listing.files, ['run2.csv', 'run10.csv'], F,
            'the folder listing holds the readable files, in natural order (the README is not a slice)',
            JSON.stringify(listing.files));
        const nothing = await host.table(path.join(DIR, 'noruns'), { mode: 'folder' });
        t.equal(nothing.files, [], F,
            'a folder with no readable file lists nothing (the chart says so instead of drawing)');

        // ---------------- JSON: the second data-file format --------------------------------
        // Four shapes an export or a logger actually writes, all read by the same rule: a column is named by
        // the record's KEY (with a letter as the positional fallback), a quoted number is still a number,
        // and a null / nested value is missing rather than a zero.
        const json = (name) => path.join(DIR, '..', 'json', name);
        for (const shape of ['records.json', 'columns.json', 'lines.jsonl']) {
            const read = await host.table(json(shape), { mode: 'series', xColumn: 'time', yColumn: 'temp' });
            t.equal(read.xs, [0, 1, 2], F, `${shape}: the X column is read by key`, read.error || '');
            t.equal(read.ys, [18.5, 19.1, 20.2], F, `${shape}: and the Y column beside it`);
            t.equal(read.xTitle + '/' + read.yTitle, 'time/temp', F,
                `${shape}: the keys become the axis names`);
        }
        const jsonByLetter = await host.table(json('records.json'), { mode: 'series', xColumn: 'A', yColumn: 'B' });
        t.equal(jsonByLetter.ys, [18.5, 19.1, 20.2], F,
            'a letter address works too (A = the first key), so the chart defaults still fit');
        const jsonQuoted = await host.table(json('quoted.json'), { mode: 'series', xColumn: 'A', yColumn: 'B' });
        t.equal(jsonQuoted.ys, [1.5, 2.5, 3.5], F,
            'a NUMBER AS A STRING counts (an export that quotes everything still plots)');
        const gaps = await host.table(json('missing.json'), { mode: 'series', xColumn: 'A', yColumn: 'B' });
        t.equal(gaps.xs.join(',') + '|' + gaps.ys.join(','), '0,3|1,4', F,
            'null and nested values are MISSING, not zero: those records are skipped and the others stay '
            + '(exactly what the delimited reader does with an empty cell)',
            `${gaps.error || ''} xs=${gaps.xs} ys=${gaps.ys}`);
        const jsonSingle = await host.table(json('single.json'), { mode: 'series', xColumn: 'time', yColumn: 'temp' });
        t.equal(jsonSingle.ys, [18.5], F, 'a single record is one point');
        const jsonPie = await host.table(json('categories.json'), { mode: 'labels', xColumn: 'month', yColumn: 'north' });
        t.equal(jsonPie.labels.join('/') + '|' + jsonPie.ys.join(','), 'Jan/Feb/Mar|10,14,11', F,
            'the label+value read works on keys too (a pie of a JSON file)');
        const broken = await host.table(json('bad.json'), { mode: 'series', xColumn: 'time', yColumn: 'temp' });
        t.ok(/not valid JSON/.test(broken.error || ''), F,
            'a syntax error says the file is not valid JSON', broken.error || '');
        t.ok(/line 9/.test(broken.error || ''), F,
            'and where it went wrong — the line of the FILE (which is why the number follows its layout)',
            broken.error || '');

        // The dialog's preview reads a JSON file as columnstoo — no delimiter to report.
        const preview = await host.table(json('records.json'));
        t.equal(preview.json, true, F, 'the preview knows a JSON file when it sees one');
        t.equal(preview.header.join(','), 'time,temp', F, 'and names its columns from the record keys');
        t.equal(preview.rows[0].cells.map((c) => `${c.text}:${c.number}`).join(' '), '0:true 18.5:true', F,
            'with a row per record and its numbers marked');

        // …and the CHART itself draws a JSON file (the whole path, not just the probe).
        const drawnJson = await renderPng(host, chartOf(json('records.json')), 300, 200);
        t.ok(redPixels(drawnJson.img) > 30, F, 'a chart whose DataFile is JSON draws its line',
            `red=${redPixels(drawnJson.img)}`);

        // ---------------- DATES in the X column: a real time axis --------------------------
        // An X,Y chart has to keep the spacing the timestamps have (2026-10-01, -02, -05 are not evenly
        // spaced), so a date X cell becomes SECONDS SINCE 1970 rather than text, and the axis then labels
        // its ticks as dates. Only the X,Y path takes it: a category axis (line/bar/area) keeps labelling
        // its samples with the X text, where the date IS the label.
        const isoDay = await host.table(f('dates.csv'),
            { mode: 'series', xColumn: 'time', yColumn: 'temp' });
        t.ok(isoDay.dates, F, 'a date X column is read as dates', isoDay.error || '');
        t.equal(isoDay.ys, [18.5, 19.1, 20.2], F, 'the values beside it are read as numbers');
        t.equal(isoDay.xs.length, 3, F, 'and every point gets a time value');
        const daySeconds = isoDay.xs.map((v) => Math.round(v - isoDay.xs[0]));
        t.equal(daySeconds.join(','), '0,86400,345600', F,
            'the spacing is real: 0 s, 1 day and 4 days after the first reading',
            JSON.stringify(isoDay.xs));
        const isoLabels = await host.table(f('dates.csv'), { mode: 'dates', xColumn: 'time', yColumn: 'temp' });
        t.equal(isoLabels.pattern, 'MM-dd', F, 'a few days of data label their ticks as month-day');
        t.equal(isoLabels.labels.join(' '), '10-01 10-03 10-05', F,
            'with the real dates on the axis (not ten-digit numbers)', isoLabels.labels.join(' '));

        const german = await host.table(f('dates-de.csv'), { mode: 'series', xColumn: 'time', yColumn: 'temp' });
        t.ok(german.dates, F, 'the German dot form (01.10.2026) is a date too', german.error || '');
        const minutes = await host.table(f('times.csv'), { mode: 'dates', xColumn: 'time', yColumn: 'temp' });
        t.equal(minutes.pattern, 'HH:mm', F, 'a morning of readings labels its ticks as clock times');
        t.equal(minutes.labels.join(' '), '12:00 12:37 13:15', F, 'with the real times');
        const jsonDates = await host.table(json('dates.json'), { mode: 'series', xColumn: 'time', yColumn: 'temp' });
        t.ok(jsonDates.dates, F, 'a JSON timestamp is a date as well', jsonDates.error || '');
        t.equal(Math.round(jsonDates.xs[2] - jsonDates.xs[0]), 345600, F, 'with the same real spacing');

        // A category axis must NOT take the date path: the samples stay 0,1,2 and the date is the LABEL,
        // which is what a bar or line chart's axis is for.
        const categorical = await host.table(f('dates.csv'),
            { mode: 'series', xColumn: 'time', yColumn: 'temp', xFromIndex: true });
        t.equal(categorical.xs.join(','), '0,1,2', F,
            'a line/bar chart still numbers its samples and keeps the dates as labels');
        t.equal(categorical.dates, false, F, 'so its axis is not turned into a time axis');
        t.equal(categorical.labels.join(','), '2026-10-01,2026-10-02,2026-10-05', F,
            'the date text is still the point name (what a category axis prints)');

        // And the chart draws a date-axed X,Y chart end to end.
        const dateChart = `<Window ${NS} Title="dates" Width="320" Height="200">
  <Canvas Name="Holder" Width="320" Height="200">
    <charts:GrumpyXYPlot x:Name="Chart1" Width="320" Height="200" SourceKind="DataFiles"
      DataFile="${f('dates.csv')}" XColumn="time" YColumn="temp" LineColor="#FF0000" LineThickness="3"
      ShowTitle="False" ShowLegend="False" ShowGrid="False" ShowBorder="False"/>
  </Canvas>
</Window>`;
        const dateDrawn = await renderPng(host, dateChart, 320, 200);
        t.ok(redPixels(dateDrawn.img) > 30, F, 'an X,Y chart of a date column draws its line',
            `red=${redPixels(dateDrawn.img)}`);
    } finally {
        host.close();
    }
};
