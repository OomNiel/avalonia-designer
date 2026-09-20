/* T2 — the chart 'Series' model: the catalog button, the webview modal, the child elements written
 * into the XAML and the C# properties the host maps them onto must all agree.
 *
 * Why this exists: a chart's series are CHILD ELEMENTS, not attributes, so nothing in the ordinary
 * property round-trip covers them — the webview renders a button from the catalog, the extension
 * decides what that button means and what a save writes back, and the host maps each series
 * attribute onto a C# property BY NAME. A rename on any one side fails silently (the attribute is
 * simply ignored, the line loses its colour), which is exactly the class of bug the Charts
 * `SourceFile` row had. The checks below therefore drive the REAL model functions (round-tripping
 * through XamlModel, the same class the designer uses) and pin the three halves to each other:
 *
 *   1. both charts list a 'Series' editor button and no longer list the chart-level styling rows;
 *   2. the webview's modal is wired to that key and the extension handles its save message;
 *   3. every field the modal sends is a field the writer knows;
 *   4. every attribute the writer sets is a real C# ChartSeries property;
 *   5. the modal's Line Style / Marker pickers list exactly the C# enum members;
 *   6. reordering keeps each series' own element (and any axis it carries), an added or removed
 *      series appears/disappears with the list, and the column pairing mirrors the C# renderer.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');
const { propertyDefsFor } = require('../../out/propertyCatalog.js');
const { XamlModel } = require('../../out/xamlModel.js');
const {
    CHART_SERIES_FIELDS, CHART_LEGACY_SERIES_ATTRS, chartSeriesOf, writeChartSeries,
    defaultSeriesColumns, columnAfter
} = require('../../out/chartSeries.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"'
    + ' xmlns:charts="using:AvaloniaCharts"';
const CHARTS = ['GrumpyLinePlot', 'GrumpyXYPlot'];
/** The chart-level styling rows the 'Series' editor took over. */
const LEGACY_ROWS = ['LineColor', 'LineThickness', 'LineStyle', 'MarkerStyle', 'MarkerSize', 'Connected'];

function elFrom(xml) {
    const doc = new DOMParser().parseFromString(`<root ${NS}>${xml}</root>`, 'text/xml');
    for (let i = 0; i < doc.documentElement.childNodes.length; i++) {
        const c = doc.documentElement.childNodes.item(i);
        if (c.nodeType === 1) return c;
    }
    return undefined;
}
const keyOf = (props, k) => props.find((p) => p.key === k);

/** A model holding one chart named C1 with the given children, plus its element. */
function chartModel(chartTag, attrs, children) {
    const model = new XamlModel(`<Window ${NS}><Canvas Name="Body">`
        + `<charts:${chartTag} x:Name="C1" Width="320" Height="200" ${attrs}>${children}</charts:${chartTag}>`
        + `</Canvas></Window>`);
    return { model, el: model.findByName('C1') };
}
const seriesTags = (model) => [...model.serialize(true).matchAll(/<charts:(LineSeries|XYSeries)[\s/>]/g)]
    .map((m) => m[1]);

/** The `const NAME = […];` string list of a plain JS array in the webview source. */
function jsList(source, name) {
    const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(source);
    return m ? m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean) : [];
}

/** The members of a C# enum. */
function enumMembers(source, name) {
    const start = source.indexOf(`public enum ${name}`);
    if (start < 0) return [];
    const body = source.slice(start, source.indexOf('}', start));
    return body.split('\n')
        .map((l) => l.trim().replace(/,$/, ''))
        .filter((l) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(l));
}

module.exports = async (t) => {
    t.section('chartSeries');

    const panel = read('src/designerPanel.ts');
    const js = read('media/designer.js');
    const cs = read('resources/GrumpyCharts.cs');
    const fields = CHART_SERIES_FIELDS;

    // --- 1. the catalog: both charts offer the editor, none offers the legacy styling rows ---
    t.ok(fields.length > 0, 'catalog', 'CHART_SERIES_FIELDS is exported by chartSeries.ts',
        fields.map((f) => f.key).join(','));
    for (const tag of CHARTS) {
        const props = propertyDefsFor(elFrom(`<charts:${tag} x:Name="c1"/>`));
        const row = keyOf(props, 'Series');
        t.ok(row && row.kind === 'button', 'catalog', `${tag} lists a 'Series' editor button`,
            row ? row.value : 'row missing');
        const leftovers = LEGACY_ROWS.filter((k) => keyOf(props, k));
        t.equal(leftovers.join(','), '', 'catalog', `${tag} no longer lists the chart-level series styling rows`);
        // The data rows the editor still needs must stay: X/Y Column + the spreadsheet fields.
        t.ok(keyOf(props, 'SourceFile') && keyOf(props, 'YColumn'), 'catalog',
            `${tag} still lists the spreadsheet + Y Column rows`);
    }

    // --- 2. the webview opens it, the extension saves it ---
    t.ok(/p\.key === 'Series'\) openSeriesEditor\(/.test(js), 'webview',
        "the Properties 'Series' button opens the editor");
    t.ok(js.includes("seriesModal: $('seriesModal')"), 'webview',
        'the Series modal shell is registered in the element map');
    t.ok(js.includes("type: 'saveChartSeries'"), 'webview', "the editor posts 'saveChartSeries'");
    t.ok(panel.includes("case 'saveChartSeries'"), 'panel', "the extension handles 'saveChartSeries'");
    t.ok(/msg\.chartSeries = chartSeriesOf\(el\)/.test(panel), 'panel',
        'a chart sends its series to the editor (msg.chartSeries)');

    // --- 3. every field the modal posts is a field the writer knows ---
    const saveAt = js.indexOf("type: 'saveChartSeries'");
    const saveBlock = saveAt < 0 ? '' : js.slice(saveAt, js.indexOf('}))', saveAt));
    const postedKeys = [...saveBlock.matchAll(/([a-zA-Z]+): r\.\1/g)].map((m) => m[1]);
    t.ok(postedKeys.length > 0, 'seam', 'the save message lists the series fields', postedKeys.join(','));
    // `src` (which child element the entry came from, -1 for new) and `type` (Line / XY) are
    // structural — the writer uses them to keep or create the right element — not styled fields.
    t.ok(postedKeys.includes('src') && postedKeys.includes('type'), 'seam',
        "the save message carries each series' source index and type");
    const known = new Set(fields.map((f) => f.key));
    const unknown = postedKeys.filter((k) => !known.has(k) && k !== 'src' && k !== 'type');
    t.equal(unknown.join(','), '', 'seam', 'every posted field is written by CHART_SERIES_FIELDS');

    // --- 4. every attribute the writer sets is a real C# ChartSeries property ---
    const cls = cs.slice(cs.indexOf('public abstract class ChartSeries'), cs.indexOf('public class LineSeries'));
    t.ok(cls.length > 0, 'model', 'the C# ChartSeries class is where the test expects it');
    for (const f of fields) {
        t.ok(new RegExp(`\\b${f.attr}\\s*\\{`).test(cls), 'model',
            `ChartSeries declares ${f.attr} (the host maps the attribute by name)`);
    }
    t.equal(LEGACY_ROWS.filter((k) => !CHART_LEGACY_SERIES_ATTRS.includes(k)).join(','), '', 'model',
        'CHART_LEGACY_SERIES_ATTRS covers exactly the retired chart-level rows');
    const module = read('src/chartSeries.ts');
    t.ok(/for \(const f of CHART_SERIES_FIELDS\) writeAttr\(model, node, f\.attr/.test(module), 'model',
        'the writer sets exactly the declared attributes');

    // --- 5. the pickers list the real enum members ---
    t.equal(jsList(js, 'SERIES_LINE_STYLES').join(','), enumMembers(cs, 'ChartLineStyle').join(','),
        'ui', 'the Line Style picker matches the C# ChartLineStyle enum');
    t.equal(jsList(js, 'SERIES_MARKERS').join(','), enumMembers(cs, 'ChartMarkerStyle').join(','),
        'ui', 'the Marker picker matches the C# ChartMarkerStyle enum');
    t.ok(/if \(row\.type !== 'Line'\) \{[\s\S]*?Marker/.test(js), 'ui',
        'the marker fields are only offered for an X,Y series');

    // --- 6a. reading: the children in order, with the column each one falls back to ---
    const two = chartModel('GrumpyXYPlot', '', `
      <charts:XYSeries Title="One" YColumn="C" LineColor="#FF0000"/>
      <charts:XYSeries Title="Two" AxisMode="PerSeries" MarkerStyle="Square"/>`);
    const twoSeries = chartSeriesOf(two.el);
    t.equal(twoSeries.length, 2, 'read', 'both series elements are listed');
    t.equal(twoSeries.map((s) => s.src).join(','), '0,1', 'read', 'each entry remembers its child index');
    t.equal(twoSeries.map((s) => s.title).join(','), 'One,Two', 'read', 'titles are read back');
    t.equal(twoSeries[0].lineColor, '#FF0000', 'read', 'a set attribute is used as-is');
    t.equal(twoSeries[1].lineColor, '#2D7DD2', 'read', 'an unset attribute falls back to the renderer default');
    // The columns a series reads when its own boxes are empty: common shares the chart's X column.
    t.equal(twoSeries[0].defX, 'B', 'read', 'a common-axis series falls back to the chart X column');
    t.equal(twoSeries[1].defX, 'D', 'read', 'a Per-series X,Y series falls back to its pair (B, D, F …)');
    t.equal(twoSeries.map((s) => s.defY).join(','), 'C,E', 'read', 'the Y pairing runs C, E, G …');

    // A chart with no series elements: ONE entry seeded from the chart's own styling.
    const implicit = chartModel('GrumpyLinePlot', 'Values="1,2,3" LineColor="#00AA00" MarkerSize="12"', '');
    const seeded = chartSeriesOf(implicit.el);
    t.equal(seeded.length, 1, 'read', 'a chart with no series elements offers the implicit line');
    t.equal(seeded[0].type, 'Line', 'read', 'the chart tag decides the implicit series type');
    t.equal(seeded[0].lineColor, '#00AA00', 'read', 'the implicit entry is seeded from the chart styling');
    t.equal(seeded[0].markerSize, '12', 'read', 'every legacy styling row is seeded');

    // --- 6b. writing: order, additions, removals, and the legacy rows ---
    const add = chartModel('GrumpyXYPlot', 'LineColor="#00AA00"', '<charts:XYSeries Title="One" YColumn="C"/>');
    writeChartSeries(add.model, add.el,
        [{ src: '0', type: 'XY', title: 'One', yColumn: 'C', lineColor: '#FF0000', lineThickness: '3' },
        { src: '-1', type: 'XY', title: 'Two', yColumn: 'E', lineColor: '#0000FF' }]);
    const added = add.model.serialize(true);
    t.equal(seriesTags(add.model).length, 2, 'write', 'a new entry becomes a second element');
    t.ok(added.includes('Title="Two"') && added.includes('YColumn="E"'), 'write',
        'the new series carries what the editor sent');
    t.ok(/<charts:XYSeries Title="One"[\s\S]*?LineThickness="3"/.test(added), 'write',
        'the edited series keeps its element and takes the new thickness');
    t.ok(!added.includes('LineColor="#00AA00"'), 'write',
        'the chart-level styling is cleared once real series exist (one source of truth)');
    // Defaults are left out, so an untouched series stays short and readable.
    t.ok(!added.includes('MarkerStyle="Dot"') && !added.includes('Connected="True"')
        && !added.includes('AxisMode="Common"'), 'write',
        'values equal to the renderer defaults are not written out');

    // Reordering must move the WHOLE series — including an axis nested inside it.
    const reorder = chartModel('GrumpyXYPlot', '', `
      <charts:XYSeries Title="One" YColumn="C">
        <charts:XYSeries.YAxis><charts:Axis Position="Right" AxisColor="#00AA00"/></charts:XYSeries.YAxis>
      </charts:XYSeries>
      <charts:XYSeries Title="Two" YColumn="E"/>`);
    const entries = chartSeriesOf(reorder.el);
    writeChartSeries(reorder.model, reorder.el, [entries[1], entries[0]]);
    const swapped = reorder.model.serialize(true);
    t.ok(/Title="Two"[\s\S]*<charts:XYSeries Title="One"/.test(swapped), 'write',
        'the list order is what lands in the file');
    t.ok(/<charts:XYSeries Title="One"[\s\S]*AxisColor="#00AA00"/.test(swapped), 'write',
        'a reordered series keeps its OWN nested axis (it travels with the series, not the index)');

    // Removing a series removes its element (and nothing else). The editor re-reads the chart after
    // every save, so the indices are always fresh — a stale index would clear the wrong series.
    const afterSwap = chartSeriesOf(reorder.el);
    writeChartSeries(reorder.model, reorder.el, [afterSwap[0]]);
    t.equal(seriesTags(reorder.model).join(','), 'XYSeries', 'write', 'a dropped series loses its element');
    t.ok(!reorder.model.serialize(true).includes('AxisColor="#00AA00"'), 'write',
        'the dropped series takes its axis with it');

    // A line chart's entries are LineSeries — the chart tag decides the type, never the entry.
    const line = chartModel('GrumpyLinePlot', 'Values="1,2,3"', '');
    writeChartSeries(line.model, line.el, chartSeriesOf(line.el));
    t.equal(seriesTags(line.model).join(','), 'LineSeries', 'write',
        'saving a line chart materialises LineSeries children');

    // --- 6c. the column pairing mirrors the C# renderer (B/C, D/E, F/G …) ---
    const xRule = /DefaultXColumn\(int index\) => SpreadsheetReader\.ColumnAfter\("([A-Z]+)", index \* (\d+)\)/.exec(cs);
    const yRule = /DefaultYColumn\(int index\) => SpreadsheetReader\.ColumnAfter\("([A-Z]+)", index \* (\d+)\)/.exec(cs);
    t.ok(xRule && yRule, 'pairing', 'the C# DefaultXColumn/DefaultYColumn rule is where the test expects it',
        `x=${!!xRule} y=${!!yRule}`);
    if (xRule && yRule) {
        for (const i of [0, 1, 2, 3, 7]) {
            const ours = defaultSeriesColumns(i);
            const theirs = {
                x: columnAfter(xRule[1], i * Number(xRule[2])),
                y: columnAfter(yRule[1], i * Number(yRule[2]))
            };
            t.equal(`${ours.x}/${ours.y}`, `${theirs.x}/${theirs.y}`, 'pairing',
                `series ${i + 1} reads the columns the C# renderer would`);
        }
    }
    t.equal(defaultSeriesColumns(3).x + defaultSeriesColumns(3).y, 'HI', 'pairing',
        'the fourth series reads H/I');
    t.equal(defaultSeriesColumns(9).x + defaultSeriesColumns(9).y, 'TU', 'pairing',
        'the tenth series reads T/U (the pairing keeps counting past Z)');
};
