/* T2 — the chart 'Series' editor: the catalog button, the extension's read/write of
 * <charts:LineSeries> / <charts:XYSeries> children and the webview modal must agree.
 *
 * Why this exists: a chart's series are CHILD ELEMENTS, not attributes, so nothing in the property
 * round-trip machinery covers them — the webview renders a button from the catalog, the extension
 * decides what that button means and what a save writes back, and the host maps each series
 * attribute onto a C# property BY NAME. A rename on any one side fails silently (the attribute is
 * simply ignored, the series loses its colour), which is exactly the class of bug the Charts
 * `SourceFile` row had. These checks pin the three halves to each other:
 *
 *   1. both charts list a 'Series' editor button (and no longer list the chart-level styling rows
 *      the editor took over);
 *   2. the webview's modal is wired to that key and the extension handles its save message;
 *   3. every field the modal sends is a field the writer knows;
 *   4. every attribute the writer sets is a real C# ChartSeries property;
 *   5. the modal's Line Style / Marker pickers list exactly the C# enum members.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');
const { propertyDefsFor } = require('../../out/propertyCatalog.js');

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

/** The `const NAME = […];` string list of a plain JS array in the webview source. */
function jsList(source, name) {
    const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(source);
    return m ? m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean) : [];
}

/** `CHART_SERIES_FIELDS` from the extension source: [{ key, attr, def }]. */
function seriesFields(source) {
    const start = source.indexOf('const CHART_SERIES_FIELDS');
    const body = source.slice(start, source.indexOf('];', start));
    const out = [];
    const re = /\{\s*key:\s*'([^']+)',\s*attr:\s*'([^']+)',\s*def:\s*'([^']*)'\s*\}/g;
    let m;
    while ((m = re.exec(body))) out.push({ key: m[1], attr: m[2], def: m[3] });
    return out;
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

    const catalog = read('src/propertyCatalog.ts');
    const panel = read('src/designerPanel.ts');
    const js = read('media/designer.js');
    const cs = read('resources/GrumpyCharts.cs');
    const fields = seriesFields(panel);

    // --- 1. the catalog: both charts offer the editor, none offers the legacy styling rows ---
    t.ok(fields.length > 0, 'catalog', 'CHART_SERIES_FIELDS is declared in designerPanel.ts',
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
    t.ok(/if \(isChartTag\(localName\(el\.tagName\)\)\) msg\.chartSeries = chartSeriesOf\(el\)/.test(panel),
        'panel', 'a chart sends its series to the editor (msg.chartSeries)');
    for (const tag of CHARTS) {
        t.ok(panel.includes(`tag === '${tag}'`), 'panel', `isChartTag covers ${tag}`);
    }

    // --- 3. every field the modal posts is a field the writer knows ---
    const saveAt = js.indexOf("type: 'saveChartSeries'");
    const saveBlock = saveAt < 0 ? '' : js.slice(saveAt, js.indexOf('}))', saveAt));
    const postedKeys = [...saveBlock.matchAll(/([a-zA-Z]+): r\.\1/g)].map((m) => m[1]);
    t.ok(postedKeys.length > 0, 'seam', 'the save message lists the series fields', postedKeys.join(','));
    // `src` (which child element the entry came from, -1 for new) and `type` (Line / XY) are
    // structural — the writer uses them to keep or create the right element — not styled fields.
    t.ok(postedKeys.includes('src') && postedKeys.includes('type'), 'seam',
        'the save message carries each series\' source index and type');
    const known = new Set(fields.map((f) => f.key));
    const unknown = postedKeys.filter((k) => !known.has(k) && k !== 'src' && k !== 'type');
    t.equal(unknown.join(','), '', 'seam', 'every posted field is written by CHART_SERIES_FIELDS');

    // --- 4. every attribute the writer sets is a real ChartSeries property ---
    const cls = cs.slice(cs.indexOf('public abstract class ChartSeries'), cs.indexOf('public class LineSeries'));
    t.ok(cls.length > 0, 'model', 'the C# ChartSeries class is where the test expects it');
    for (const f of fields) {
        t.ok(new RegExp(`\\b${f.attr}\\s*\\{`).test(cls), 'model',
            `ChartSeries declares ${f.attr} (the host maps the attribute by name)`);
    }
    // And the writer must clear the chart-level styling once real series exist (one source of truth).
    t.ok(/CHART_LEGACY_SERIES_ATTRS\s*=\s*\[[\s\S]*?\]/.test(panel) && panel.includes('CHART_LEGACY_SERIES_ATTRS) model.setProperty(el, attr, \'\')'),
        'model', 'saving series clears the chart-level legacy styling attributes');
    const legacySet = new Set((/const CHART_LEGACY_SERIES_ATTRS = \[([\s\S]*?)\]/.exec(panel) || ['', ''])[1]
        .match(/'[^']+'/g)?.map((s) => s.replace(/'/g, '')) || []);
    t.equal(LEGACY_ROWS.filter((k) => !legacySet.has(k)).join(','), '', 'model',
        'CHART_LEGACY_SERIES_ATTRS covers exactly the retired chart-level rows');

    // --- 5. the pickers list the real enum members ---
    t.equal(jsList(js, 'SERIES_LINE_STYLES').join(','), enumMembers(cs, 'ChartLineStyle').join(','),
        'ui', 'the Line Style picker matches the C# ChartLineStyle enum');
    t.equal(jsList(js, 'SERIES_MARKERS').join(','), enumMembers(cs, 'ChartMarkerStyle').join(','),
        'ui', 'the Marker picker matches the C# ChartMarkerStyle enum');

    // A line series has no markers/X column in the UI: the modal keys the marker rows off the type.
    t.ok(/if \(row\.type !== 'Line'\) \{[\s\S]*?Marker/.test(js), 'ui',
        'the marker fields are only offered for an X,Y series');
};
