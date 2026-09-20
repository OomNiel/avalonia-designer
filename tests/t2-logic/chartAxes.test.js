/* T2 — the chart 'Axis' model: an axis is a real object now, so its fields must survive a write/
 * read round-trip, the COMMON axes must be written as the chart's own property elements, a
 * per-series axis must be deletable, and the retired chart-level scalars must not linger beside them.
 *
 * Why this exists: an axis used to be eleven chart-level attributes. Moving it into an Axis object
 * moves the truth into property elements, and a property element the writer spells differently from
 * the C# type, or an attribute the C# property does not have, fails SILENTLY — the axis simply keeps
 * its default look. These checks drive the real model functions plus the webview's own wiring:
 *
 *   1. both charts offer an 'Axis' editor button and no longer list the eleven axis rows;
 *   2. the webview's modal is wired to that key and the extension handles its save message;
 *   3. every attribute the writer sets is a real C# Axis property, and the pickers list the real
 *      AxisPosition members;
 *   4. the common axes round-trip as <charts:TAG.XAxis> / .YAxis property elements;
 *   5. a series axis round-trips as <charts:XYSeries.YAxis>, and deleting it removes the element;
 *   6. saving the common axes clears the legacy scalars (one source of truth), and default values
 *      are left out of the XAML.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');
const { propertyDefsFor } = require('../../out/propertyCatalog.js');
const { XamlModel } = require('../../out/xamlModel.js');
const {
    CHART_AXIS_FIELDS, CHART_AXIS_LEGACY_ATTRS, axisPositions, chartAxesOf, writeChartAxes
} = require('../../out/chartSeries.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"'
    + ' xmlns:charts="using:AvaloniaCharts"';
const CHARTS = ['GrumpyLinePlot', 'GrumpyXYPlot'];
/** The chart-level rows the 'Axis' editor took over. */
const LEGACY_ROWS = ['ShowAxes', 'AxisColor', 'ShowMajorTicks', 'MajorTickLength', 'ShowMinorTicks',
    'MinorTickLength', 'ShowTickLabels', 'TickLabelFontSize', 'ShowAxisTitles', 'XAxisTitle', 'YAxisTitle'];

function elFrom(xml) {
    const doc = new DOMParser().parseFromString(`<root ${NS}>${xml}</root>`, 'text/xml');
    for (let i = 0; i < doc.documentElement.childNodes.length; i++) {
        const c = doc.documentElement.childNodes.item(i);
        if (c.nodeType === 1) return c;
    }
    return undefined;
}
const keyOf = (props, k) => props.find((p) => p.key === k);

function chartModel(attrs, children) {
    const model = new XamlModel(`<Window ${NS}><Canvas Name="Body">`
        + `<charts:GrumpyXYPlot x:Name="C1" Width="320" Height="200" ${attrs}>${children}</charts:GrumpyXYPlot>`
        + `</Canvas></Window>`);
    return { model, el: model.findByName('C1') };
}

/** A complete field set for one axis (what the editor sends). */
const axisValues = (over = {}) => Object.assign({
    position: 'Right', showAxis: 'False', axisColor: '#00AA00', showMajorTicks: 'True',
    majorTickLength: '9', showMinorTicks: 'False', minorTickLength: '3', showTickLabels: 'True',
    tickLabelFontSize: '13', showAxisName: 'False', name: 'Outside'
}, over);

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
    t.section('chartAxes');

    const panel = read('src/designerPanel.ts');
    const module = read('src/chartSeries.ts');
    const js = read('media/designer.js');
    const cs = read('resources/GrumpyCharts.cs');

    // --- 1. the catalog ---
    for (const tag of CHARTS) {
        const props = propertyDefsFor(elFrom(`<charts:${tag} x:Name="c1"/>`));
        const row = keyOf(props, 'Axis');
        t.ok(row && row.kind === 'button', 'catalog', `${tag} lists an 'Axis' editor button`,
            row ? row.value : 'row missing');
        const leftovers = LEGACY_ROWS.filter((k) => keyOf(props, k));
        t.equal(leftovers.join(','), '', 'catalog', `${tag} no longer lists the chart-level axis rows`);
        // The plot SCALE stays a chart property: it is not axis furniture.
        t.ok(keyOf(props, 'MinX') && keyOf(props, 'MaxY'), 'catalog',
            `${tag} still lists the Min/Max scale overrides`);
    }

    // --- 2. the webview and the message ---
    t.ok(/p\.key === 'Axis'\) openAxisEditor\(/.test(js), 'webview',
        "the Properties 'Axis' button opens the editor");
    t.ok(js.includes("axisModal: $('axisModal')"), 'webview',
        'the Axis modal shell is registered in the element map');
    t.ok(js.includes("type: 'saveChartAxes'"), 'webview', "the editor posts 'saveChartAxes'");
    t.ok(panel.includes("case 'saveChartAxes'"), 'panel', "the extension handles 'saveChartAxes'");
    t.ok(/msg\.chartAxes = chartAxesOf\(el\)/.test(panel), 'panel',
        'a chart sends its axes to the editor (msg.chartAxes)');

    // The fields the modal edits must be the fields the writer knows.
    const postedFields = [...js.matchAll(/bool\('([^']+)', '(\w+)'/g)].map((m) => m[2]);
    const known = new Set(CHART_AXIS_FIELDS.map((f) => f.key));
    t.ok(postedFields.length >= 5, 'seam', 'the modal renders the on/off axis fields', postedFields.join(','));
    t.equal(postedFields.filter((k) => !known.has(k)).join(','), '', 'seam',
        'every on/off field the modal shows is a field the writer knows');
    for (const key of CHART_AXIS_FIELDS.map((f) => f.key)) {
        t.ok(js.includes(`'${key}'`) || js.includes(`.${key} =`), 'seam', `the modal edits ${key}`);
    }
    t.ok(module.includes('for (const f of CHART_AXIS_FIELDS)'), 'model',
        'the writer sets exactly the declared axis attributes');

    // --- 3. the C# side of the contract ---
    const axisClass = cs.slice(cs.indexOf('public sealed class Axis'), cs.indexOf('public sealed class ChartData'));
    t.ok(axisClass.length > 0, 'model', 'the C# Axis class is where the test expects it');
    for (const f of CHART_AXIS_FIELDS) {
        t.ok(new RegExp(`\\b${f.attr}\\s*\\{`).test(axisClass), 'model',
            `Axis declares ${f.attr} (the host maps the attribute by name)`);
    }
    t.ok(/public Axis\? XAxis \{ get; set; \}/.test(cs) && /public Axis\? YAxis \{ get; set; \}/.test(cs),
        'model', 'ChartBase exposes the two common axes as Axis objects');
    const positions = enumMembers(cs, 'AxisPosition');
    t.equal(positions.join(','), 'Left,Right,Top,Bottom', 'model', 'the C# AxisPosition enum is the expected set');
    for (const kind of ['x', 'y']) {
        const ours = axisPositions(kind).join(',');
        t.ok(ours.split(',').every((p) => positions.includes(p)), 'model',
            `the editor's ${kind.toUpperCase()}-axis positions are C# AxisPosition members`, ours);
    }
    t.equal(axisPositions('y').join(','), 'Left,Right', 'model', 'a Y axis offers Left/Right');
    t.equal(axisPositions('x').join(','), 'Top,Bottom', 'model', 'an X axis offers Top/Bottom');
    t.equal(LEGACY_ROWS.filter((k) => !CHART_AXIS_LEGACY_ATTRS.includes(k)).join(','), '', 'model',
        'CHART_AXIS_LEGACY_ATTRS covers exactly the retired chart-level axis rows');

    // --- 4. the common axes round-trip ---
    const chart = chartModel('AxisColor="#123456" YAxisTitle="Old"', '<charts:XYSeries YColumn="C"/>');
    const before = chartAxesOf(chart.el);
    t.equal(before.commonX, null, 'read', 'a form written before the editor has no common Axis objects');
    t.equal(before.commonY, null, 'read', 'and none for Y either');
    t.equal(before.legacy.axisColor, '#123456', 'read', 'the legacy scalars are reported for pre-filling');
    t.equal(before.legacy.yName, 'Old', 'read', 'including the axis names');
    t.equal(before.series.length, 1, 'read', 'one entry per series element');

    writeChartAxes(chart.model, chart.el, axisValues({ position: 'Top', name: 'Time' }), axisValues(),
        [{ x: null, y: null }]);
    const written = chart.model.serialize(true);
    t.ok(/<charts:GrumpyXYPlot\.XAxis>\s*<charts:Axis Position="Top"/.test(written), 'write',
        'the common X axis is written as the chart\'s own property element');
    t.ok(/<charts:GrumpyXYPlot\.YAxis>\s*<charts:Axis Position="Right"/.test(written), 'write',
        'the common Y axis likewise');
    t.ok(!written.includes('AxisColor="#123456"') && !written.includes('YAxisTitle="Old"'), 'write',
        'the chart-level axis scalars are cleared once real Axis objects exist');
    const after = chartAxesOf(chart.el);
    t.equal(after.commonY.axisColor, '#00AA00', 'read', 'the written axis reads back with its colour');
    t.equal(after.commonY.majorTickLength, '9', 'read', 'and its tick sizes');
    t.equal(after.commonY.tickLabelFontSize, '13', 'read', 'and its label font size');
    t.equal(after.commonY.name, 'Outside', 'read', 'and its name');
    t.equal(after.commonY.showAxis, 'False', 'read', 'and its visibility');
    t.equal(after.commonX.position, 'Top', 'read', 'the X axis keeps its own side');
    t.equal(after.commonY.position, 'Right', 'read', 'so does the Y axis');

    // Defaults stay out of the file: re-reading and re-writing the same values changes nothing.
    const once = chart.model.serialize(true);
    writeChartAxes(chart.model, chart.el, axisValues({ position: 'Top', name: 'Time' }), axisValues(),
        [{ x: null, y: null }]);
    t.equal(chart.model.serialize(true) === once, true, 'write', 'writing the same axes twice is a no-op');

    const plain = chartModel('', '<charts:XYSeries YColumn="C"/>');
    writeChartAxes(plain.model, plain.el,
        axisValues({ position: 'Bottom', showAxis: 'True', axisColor: '#666666', majorTickLength: '6',
            showMinorTicks: 'True', showTickLabels: 'True', tickLabelFontSize: '11', showAxisName: 'True',
            name: '' }),
        axisValues({ position: 'Left', showAxis: 'True', axisColor: '#666666', majorTickLength: '6',
            showMinorTicks: 'True', showTickLabels: 'True', tickLabelFontSize: '11', showAxisName: 'True',
            name: '' }),
        [{ x: null, y: null }]);
    const tidy = plain.model.serialize(true);
    t.ok(/<charts:GrumpyXYPlot\.XAxis>\s*<charts:Axis\/>/.test(tidy), 'write',
        'an all-default axis is written as an empty element, not as eleven attributes');

    // --- 5. per-series axes: written, kept, and deletable ---
    const per = chartModel('', '<charts:XYSeries Title="A" YColumn="C"/>'
        + '<charts:XYSeries Title="B" YColumn="E"/>');
    const yAxis = axisValues({ position: 'Right', axisColor: '#AA00AA' });
    writeChartAxes(per.model, per.el, axisValues({ position: 'Bottom' }), axisValues({ position: 'Left' }),
        [{ x: { position: 'Top', axisColor: '#0000FF' }, y: yAxis }, { x: null, y: null }]);
    const perXaml = per.model.serialize(true);
    // The axis must sit INSIDE the series it belongs to, not somewhere later in the file.
    t.ok(perXaml.indexOf('<charts:XYSeries.YAxis>') > perXaml.indexOf('<charts:XYSeries Title="A"')
        && perXaml.indexOf('<charts:XYSeries.YAxis>') < perXaml.indexOf('<charts:XYSeries Title="B"'),
        'write', 'a per-series Y axis is nested inside that series');
    t.ok(perXaml.includes('Position="Right"') && perXaml.includes('AxisColor="#AA00AA"'), 'write',
        'and carries the values the editor sent');
    t.ok(/<charts:XYSeries\.XAxis>\s*<charts:Axis Position="Top"/.test(perXaml), 'write',
        'and a per-series X axis likewise');
    const perAfter = chartAxesOf(per.el);
    t.equal(perAfter.series[0].x.axisColor, '#0000FF', 'read', 'the X axis reads back on series 1');
    t.equal(perAfter.series[0].y.axisColor, '#AA00AA', 'read', 'the Y axis reads back on series 1');
    t.equal(perAfter.series[1].x, null, 'read', 'series 2 has no axes of its own');

    // Deleting one: the extension sends null, and the property element goes away — the other stays.
    writeChartAxes(per.model, per.el, axisValues({ position: 'Bottom' }), axisValues({ position: 'Left' }),
        [{ x: null, y: null }, { x: null, y: null }]);
    const deleted = per.model.serialize(true);
    t.ok(!deleted.includes('<charts:XYSeries.XAxis>') && !deleted.includes('<charts:XYSeries.YAxis>'), 'write',
        'deleting a per-series axis removes its property element');
    t.ok(deleted.includes('<charts:XYSeries Title="A"'), 'write',
        'and leaves the series itself untouched');
    t.ok(deleted.includes('<charts:GrumpyXYPlot.YAxis>'), 'write',
        'the chart\'s own common axes are not touched by a per-series delete');

    // The common axes survive a per-series-only edit.
    const kept = chartAxesOf(per.el);
    t.ok(kept.commonX !== null && kept.commonY !== null, 'read',
        'the common axes are still there after a per-series delete');
};
