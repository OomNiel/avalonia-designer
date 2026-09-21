/* T2 — the DATA SELECTOR editor (2026-09-21): where a chart's data comes from, and which PAGE of it.
 *
 * The feature: every chart gets a 'Data Selector' button instead of the bare 'Spreadsheet' file row.
 * The editor picks the SOURCE (Spreadsheet, or DataFiles for the CSV-style files that come later), the
 * workbook, and — new here — the PAGE, chosen from the workbook's own sheet names (read in the host,
 * which has the zip reader). `SourceSheet` is what makes the last part real: before it, the chart
 * reader always took the workbook's FIRST worksheet part, so a later page was unreachable however the
 * tabs were arranged.
 *
 * These tests pin the seams that fail SILENTLY: an attribute name that does not match the C# property
 * (the form then won't compile), a default that is written into every chart when it should be omitted,
 * a page that is written but never read, and the two properties that are deliberately declared but
 * unused — DataFiles' DataFile must exist in the charts or a form carrying it cannot compile.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { XamlModel } = require('../../out/xamlModel.js');
const charts = require('../../out/chartSeries.js');
const { propertyDefsFor } = require('../../out/propertyCatalog.js');
const { bundledComponentSpecs } = require('../../out/bundledComponents.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const cs = read('resources/GrumpyCharts.cs');
const vb = read('resources/GrumpyCharts.vb');
const host = read('host/Program.cs');
const web = read('media/designer.js');
const panel = read('src/designerPanel.ts');
const hostClient = read('src/hostClient.ts');

const CHARTS = ['GrumpyLinePlot', 'GrumpyXYPlot', 'GrumpyBarPlot', 'GrumpyAreaPlot', 'GrumpyPiePlot'];

function model(attrs = '') {
    const m = new XamlModel(`<Window xmlns="https://github.com/avaloniaui"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        xmlns:charts="using:AvaloniaCharts">
        <Canvas Name="Holder"><charts:GrumpyBarPlot x:Name="c1" ${attrs}/></Canvas>
    </Window>`);
    return m;
}

module.exports = async (t) => {
    t.section('T2: Data Selector editor');

    // ---------------------------------------------------------------- the attribute names match the C#
    for (const f of charts.CHART_DATA_SOURCE_FIELDS) {
        for (const [name, text] of [['C#', cs], ['VB', vb]]) {
            t.ok(text.includes(`nameof(${f.attr})`) || text.includes(`NameOf(${f.attr})`), 'attributes',
                `${name} declares the ${f.attr} property the editor writes`);
        }
    }
    t.equal(charts.CHART_DATA_SOURCE_FIELDS.map((f) => f.attr).join(','), 'SourceKind,SourceFile,SourceSheet,DataFile',
        'attributes', 'the four attributes, in the order the editor owns them');
    t.equal(charts.DATA_SOURCE_KINDS.join(','), 'Spreadsheet,DataFiles', 'sources',
        'the two source kinds, Spreadsheet first (the renderer\'s default)');

    // ---------------------------------------------------------------- reading / writing
    const empty = charts.chartDataSourceOf(model().findByName('c1'));
    t.equal(empty.kind, 'Spreadsheet', 'defaults', 'an untouched chart reads as Spreadsheet');
    for (const key of ['file', 'sheet', 'dataFile']) {
        t.equal(empty[key], '', 'defaults', `and an empty ${key}`);
    }

    const m = model('SourceSheet="Bar Chart" SourceFile="/tmp/Book.xlsx"');
    const read1 = charts.chartDataSourceOf(m.findByName('c1'));
    t.equal(read1.sheet, 'Bar Chart', 'reading', 'the page is read back');
    t.equal(read1.file, '/tmp/Book.xlsx', 'reading', 'and so is the workbook');
    t.equal(read1.kind, 'Spreadsheet', 'reading', 'with the default source kind');

    charts.writeChartDataSource(m, m.findByName('c1'), { kind: 'Spreadsheet', file: '/tmp/Book.xlsx', sheet: 'Area Chart', dataFile: '' });
    const xml = m.serialize();
    t.ok(xml.includes('SourceSheet="Area Chart"'), 'writing', 'the chosen page is written');
    t.ok(!xml.includes('SourceKind='), 'writing',
        'but the DEFAULT source kind writes nothing (the XAML stays short)');
    t.ok(!xml.includes('DataFile='), 'writing', 'and an empty data file writes nothing');

    charts.writeChartDataSource(m, m.findByName('c1'), { kind: 'DataFiles', file: '/tmp/Book.xlsx', sheet: 'Area Chart', dataFile: '/tmp/data.csv' });
    const xml2 = m.serialize();
    t.ok(xml2.includes('SourceKind="DataFiles"'), 'writing', 'choosing DataFiles is written (so the choice is visible)');
    t.ok(xml2.includes('DataFile="/tmp/data.csv"'), 'writing', 'with the data file it names');

    charts.writeChartDataSource(m, m.findByName('c1'), { kind: 'Spreadsheet', file: '', sheet: '', dataFile: '' });
    t.ok(!/Source(Sheet|Kind|File)=/.test(m.serialize()), 'writing',
        'clearing everything removes all of it again (no empty attributes left behind)');

    // ---------------------------------------------------------------- the panel offers it on every chart
    for (const tag of CHARTS) {
        const el = new XamlModel(`<Window xmlns="https://github.com/avaloniaui"
            xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
            xmlns:charts="using:AvaloniaCharts"><Canvas Name="H"><charts:${tag} x:Name="c1"/></Canvas></Window>`)
            .findByName('c1');
        const rows = propertyDefsFor(el) || [];
        const editors = rows.filter((r) => r.kind === 'button').map((r) => r.key);
        t.ok(editors.includes('Data'), 'panel', `${tag} offers the Data Selector`);
        t.ok(!rows.some((r) => r.key === 'SourceFile'), 'panel',
            `${tag} no longer has a Spreadsheet row (the editor owns the file now)`);
    }

    // ---------------------------------------------------------------- the page list comes from the host
    t.ok(/case "sheets"/.test(host), 'host', 'the host answers a sheets request');
    t.ok(/WorkbookSheets/.test(host) && /xl\/workbook\.xml/.test(host), 'host',
        'by reading the workbook part (sheet names in tab order)');
    t.ok(/async sheets\(file: string\)/.test(hostClient), 'host', 'the client exposes it as sheets(file)');
    t.ok(/case 'requestSheets'/.test(panel) && /host\.sheets\(/.test(panel), 'panel',
        'the panel answers the editor\'s page-list request through the host');
    t.ok(/case 'saveChartDataSource'/.test(panel) && /writeChartDataSource/.test(panel), 'panel',
        'and saves the editor\'s choice');

    // ---------------------------------------------------------------- the pickers keep their own memory
    t.ok(/kind: PickerKind = which === 'data' \? 'data' : 'workbook'/.test(panel), 'pickers',
        'the workbook and data-file pickers remember separate folders');
    t.ok(/lastPickerFolder\(kind\)/.test(panel) && /rememberPickerFile\(kind, /.test(panel), 'pickers',
        'and both open where the last pick left off');
    t.ok(/\| 'data'/.test(read('src/pickerFolders.ts')), 'pickers', 'the data-file memory kind exists');

    // ---------------------------------------------------------------- the webview wires it up
    for (const id of ['dataModal', 'dataKind', 'dataFields', 'dataSave', 'dataCancel']) {
        t.ok(web.includes(`$('${id}')`), 'webview', `designer.js uses the ${id} element`);
        t.ok(panel.includes(`id="${id}"`), 'webview', `and the webview HTML defines ${id}`);
    }
    t.ok(/function openDataEditor/.test(web) && /p\.key === 'Data'/.test(web), 'webview',
        'the Data row opens the editor');
    t.ok(/case 'sheetsResult'/.test(web) && /case 'chartSourcePicked'/.test(web), 'webview',
        'and it handles the two replies the editor waits for');
    t.ok(/type: 'pickChartSource'/.test(web) && /case 'pickChartSource'/.test(panel), 'webview',
        'the Browse buttons round-trip through the extension');

    // The dialog must survive a NARROW designer panel: a `.series-field` gives its label 96px, so in a
    // two-column dialog the dropdown was left ~50px and showed one letter (reported twice, 2026-09-21).
    // The fix is structural — one stacked column, label above control — so pin both halves of it.
    t.ok(/class="data-rows"/.test(panel), 'layout', 'the Data Selector lays its rows out in one column');
    t.ok(/class="series-fields data-fields" id="dataFields"|id="dataFields" class="series-fields data-fields"/.test(panel),
        'layout', 'and its field lists carry the data-fields class');
    const css = read('media/designer.css');
    t.ok(/\.data-fields \.series-field\s*\{[^}]*flex-direction:\s*column/.test(css), 'layout',
        'the stylesheet stacks each label above its control');
    t.ok(/\.data-fields \.series-field\s*>\s*span\s*\{[^}]*flex:\s*0 0 auto/.test(css), 'layout',
        'so the label stops taking a fixed 96px from the control');
    t.ok(!/data-source-col/.test(panel) && !/\.data-source-col/.test(css), 'layout',
        'and the two-column version is gone (no stale rules left behind)');

    // ---------------------------------------------------------------- the charts really read the page
    for (const [name, text, optional] of [['C#', cs, 'string? sheet = null'], ['VB', vb, 'Optional sheet As String = Nothing']]) {
        t.ok(text.includes(optional), 'reader', `${name} readers take an optional page name`);
        t.ok(/FindSheet\(zip, sheet\)/.test(text) || /FindSheet\(zip, sheet\)/.test(text), 'reader',
            `${name} looks the page up by name`);
        t.ok(/workbook\.xml\.rels/.test(text), 'reader',
            `${name} resolves the name through the workbook's rels (part names carry no meaning)`);
        t.ok(/has no page called/.test(text), 'reader',
            `${name} reports an unknown page instead of silently reading page one`);
        t.ok(/DataSourceKind/.test(text), 'reader', `${name} declares the source kinds`);
    }
    t.ok(/SourceSheet/.test(cs) && /SourceSheet/.test(vb), 'reader', 'both twins know the page attribute');

    // ---------------------------------------------------------------- the staleness marker moved again
    const spec = bundledComponentSpecs(false).find((s) => s.kind === 'GrumpyCharts');
    t.equal(spec.marker, 'SourceSheet', 'marker',
        'the marker is the newest attribute the designer writes (an older copy cannot compile it)');
    t.equal(bundledComponentSpecs(true).find((s) => s.kind === 'GrumpyCharts').marker, spec.marker, 'marker',
        'the same in both languages');
    t.ok(cs.includes(spec.marker) && vb.includes(spec.marker), 'marker',
        'so a shipped copy never looks stale');
};
