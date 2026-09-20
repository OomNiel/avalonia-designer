/* T2 — the chart 'Legend' editor: the catalog button, the modal, the flag/position/frame attributes
 * and the C# properties they land on must agree.
 *
 * Why this exists: the legend is the one chart editor whose settings are plain ATTRIBUTES (the series
 * and axes are child elements), so it rides on the ordinary property machinery — but the modal, the
 * field list the modal posts and the C# names are still three separate places that can drift apart,
 * and a drifted name fails silently (the attribute is ignored and the legend keeps its default look).
 * These checks drive the real reader/writer and pin the three sides to each other:
 *
 *   1. both charts offer a 'Legend' editor button and no longer list the loose legend rows;
 *   2. the webview's modal is wired to that key and the extension handles its save message;
 *   3. every field the modal edits is a field the writer knows, and the position picker lists the
 *      same four sides as the C# LegendPosition enum;
 *   4. every attribute the writer sets is a real ChartBase property;
 *   5. defaults are left out of the XAML and everything round-trips.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');
const { propertyDefsFor } = require('../../out/propertyCatalog.js');
const { XamlModel } = require('../../out/xamlModel.js');
const {
    CHART_LEGEND_FIELDS, LEGEND_POSITIONS, chartLegendOf, writeChartLegend
} = require('../../out/chartSeries.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"'
    + ' xmlns:charts="using:AvaloniaCharts"';
const CHARTS = ['GrumpyLinePlot', 'GrumpyXYPlot'];
/** The loose chart rows the editor took over. */
const LEGACY_ROWS = ['ShowLegend', 'LegendFontSize'];

function elFrom(xml) {
    const doc = new DOMParser().parseFromString(`<root ${NS}>${xml}</root>`, 'text/xml');
    for (let i = 0; i < doc.documentElement.childNodes.length; i++) {
        const c = doc.documentElement.childNodes.item(i);
        if (c.nodeType === 1) return c;
    }
    return undefined;
}
const keyOf = (props, k) => props.find((p) => p.key === k);

function chartModel(attrs) {
    const model = new XamlModel(`<Window ${NS}><Canvas Name="Body">`
        + `<charts:GrumpyXYPlot x:Name="C1" Width="320" Height="200" ${attrs}`
        + `><charts:XYSeries Title="One" YColumn="C"/></charts:GrumpyXYPlot></Canvas></Window>`);
    return { model, el: model.findByName('C1') };
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
    t.section('chartLegendModel');

    const panel = read('src/designerPanel.ts');
    const js = read('media/designer.js');
    const cs = read('resources/GrumpyCharts.cs');

    // --- 1. the catalog ---
    for (const tag of CHARTS) {
        const props = propertyDefsFor(elFrom(`<charts:${tag} x:Name="c1"/>`));
        const row = keyOf(props, 'Legend');
        t.ok(row && row.kind === 'button', 'catalog', `${tag} lists a 'Legend' editor button`,
            row ? row.value : 'row missing');
        t.equal(LEGACY_ROWS.filter((k) => keyOf(props, k)).join(','), '', 'catalog',
            `${tag} no longer lists the loose legend rows`);
    }

    // --- 2. the webview opens it, the extension saves it ---
    t.ok(/p\.key === 'Legend'\) openLegendEditor\(/.test(js), 'webview',
        "the Properties 'Legend' button opens the editor");
    t.ok(js.includes("legendModal: $('legendModal')"), 'webview',
        'the Legend modal shell is registered in the element map');
    t.ok(js.includes("type: 'saveChartLegend'"), 'webview', "the editor posts 'saveChartLegend'");
    t.ok(panel.includes("case 'saveChartLegend'"), 'panel', "the extension handles 'saveChartLegend'");
    t.ok(/msg\.legendInfo = chartLegendOf\(el\)/.test(panel), 'panel',
        'a chart sends its legend settings to the editor (msg.legendInfo)');

    // --- 3. the modal edits exactly the fields the writer knows ---
    // The modal reads/writes each field either by name (`'key'`) or as a property on the working copy.
    const known = new Set(CHART_LEGEND_FIELDS.map((f) => f.key));
    for (const key of known) {
        t.ok(js.includes(`'${key}'`) || js.includes(`.${key} =`), 'seam', `the modal edits ${key}`);
    }
    const postBlock = js.slice(js.indexOf("type: 'saveChartLegend'"), js.indexOf('});', js.indexOf("type: 'saveChartLegend'")));
    t.ok(/values: legendEdit\.values/.test(postBlock), 'seam',
        'the save message carries the edited values');
    t.equal(LEGEND_POSITIONS.join(','), enumMembers(cs, 'LegendPosition').join(','), 'model',
        'the position picker lists the same sides as the C# LegendPosition enum');

    // --- 4. every attribute the writer sets is a real ChartBase property ---
    const chartBase = cs.slice(cs.indexOf('public abstract class ChartBase'), cs.indexOf('protected abstract ChartData InlineData'));
    t.ok(chartBase.length > 0, 'model', 'the C# ChartBase class is where the test expects it');
    for (const f of CHART_LEGEND_FIELDS) {
        t.ok(new RegExp(`nameof\\(${f.attr}\\)`).test(chartBase), 'model',
            `ChartBase registers ${f.attr} (the host maps the attribute by name)`);
    }

    // --- 5. reading and writing ---
    const chart = chartModel('');
    const defaults = chartLegendOf(chart.el);
    t.equal(defaults.showLegend, 'True', 'read', 'a form with no legend attributes reads as on');
    t.equal(defaults.position, 'Bottom', 'read', 'and on the bottom (the renderer default)');
    t.equal(defaults.backColor, 'Transparent', 'read', 'with a transparent frame backcolour');

    // A pre-existing attribute wins over the default (a hand-written form).
    const handWritten = chartModel('LegendPosition="Right" LegendShowFrame="False"');
    t.equal(chartLegendOf(handWritten.el).position, 'Right', 'read', 'an attribute is used as-is');
    t.equal(chartLegendOf(handWritten.el).showFrame, 'False', 'read', 'including the frame switch');

    // Save: the changed values land, the untouched ones stay out of the file.
    writeChartLegend(chart.model, chart.el, Object.assign({}, defaults, {
        position: 'Left', backColor: '#FFFF00', cornerRadius: '8'
    }));
    const written = chart.model.serialize(true);
    t.ok(written.includes('LegendPosition="Left"'), 'write', 'the chosen side is written');
    t.ok(written.includes('LegendBackColor="#FFFF00"'), 'write', 'so is the frame backcolour');
    t.ok(written.includes('LegendCornerRadius="8"'), 'write', 'and the rounded-corner radius');
    t.ok(!written.includes('ShowLegend') && !written.includes('LegendFontSize') && !written.includes('LegendShowFrame'),
        'write', 'values equal to the renderer defaults are not written out');
    const back = chartLegendOf(chart.el);
    t.equal(back.position, 'Left', 'read', 'the saved side reads back');
    t.equal(back.cornerRadius, '8', 'read', 'and so does the radius');

    // Switching the legend off is stored (and only then).
    writeChartLegend(chart.model, chart.el, Object.assign({}, defaults, { showLegend: 'False' }));
    t.ok(chart.model.serialize(true).includes('ShowLegend="False"'), 'write',
        'switching the legend off is written out');
    writeChartLegend(chart.model, chart.el, Object.assign({}, defaults, { showLegend: 'True' }));
    t.ok(!chart.model.serialize(true).includes('ShowLegend'), 'write',
        'and switching it back on removes the attribute again');

    // --- 6. LegendMargin: space between the frame and the entries inside it -------------------
    // Asked for 2026-09-20: a framed legend looked cramped. The margin is ADDED to the bar's own
    // small padding on all four sides, so 0 leaves every existing form exactly as it was — and the
    // setting has to reach the renderer of both languages, or it works in one of them only.
    const margin = CHART_LEGEND_FIELDS.find((f) => f.attr === 'LegendMargin');
    t.ok(margin, 'margin', 'the legend editor knows a LegendMargin field');
    t.equal(margin ? margin.key : '', 'margin', 'margin', 'posted under the name the modal uses');
    t.equal(margin ? margin.def : '', '0', 'margin',
        'and defaults to 0, so a chart that never set it keeps its old look');
    const spaced = chartModel('');
    writeChartLegend(spaced.model, spaced.el,
        Object.assign({}, chartLegendOf(spaced.el), { margin: '10' }));
    t.ok(spaced.model.serialize(true).includes('LegendMargin="10"'), 'margin',
        'a margin the user sets is written into the form');
    t.equal(chartLegendOf(spaced.el).margin, '10', 'margin', 'and reads back');
    const flat = chartModel('');
    writeChartLegend(flat.model, flat.el, Object.assign({}, chartLegendOf(flat.el), { margin: '0' }));
    t.ok(!flat.model.serialize(true).includes('LegendMargin'), 'margin',
        'while the default 0 is left out, like every other legend value at its default');
    const vb = read('resources/GrumpyCharts.vb');
    for (const [name, src] of [['C#', cs], ['VB', vb]]) {
        t.ok(/LegendMarginProperty/.test(src), 'margin', `${name}: the chart declares LegendMargin`);
        t.ok(/(nameof|NameOf)\(LegendMargin\)/.test(src), 'margin',
            `${name}: registered under the attribute name the writer uses`);
        t.ok(/pad[^=]*=[^;]*Math\.Max\(0, LegendMargin\)/.test(src), 'margin',
            `${name}: the legend layout adds it to the bar's own padding`);
        t.ok(/LegendMarginProperty/.test(src.slice(src.indexOf('AffectsRender'))), 'margin',
            `${name}: and it repaints the chart when it changes`);
    }
};
