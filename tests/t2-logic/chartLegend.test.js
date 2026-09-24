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
    CHART_LEGEND_FIELDS, LEGEND_POSITIONS, chartLegendOf, writeChartLegend,
    SURFACE_RANGE_FIELDS, hasRangeLegend, chartDataRangeOf
} = require('../../out/chartSeries.js');
const { CHARTS_TAGS } = require('../../out/xamlModel.js');

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

    // --- 7. the SURFACE chart's legend RANGE (2026-09-23) ---------------------------------------
    // The surface chart's legend is also its ZOOM control: the user picks a range of X (the width of the
    // sheet) and of Y (its height), the sliders span exactly what the DATA covers, and the chart always
    // re-fits the picture to the selection. Four attributes carry it, and an EMPTY one means "the whole
    // range" — so a chart nobody has zoomed keeps the short element it had.
    const surface = (attrs) => {
        const model = new XamlModel(`<Window ${NS}><Canvas Name="Body">`
            + `<charts:GrumpySurfacePlot x:Name="S1" Width="380" Height="260" ${attrs}>`
            + '<charts:XYSeries YColumn="C"/><charts:XYSeries YColumn="D"/>'
            + '</charts:GrumpySurfacePlot></Canvas></Window>');
        return { model, el: model.findByName('S1') };
    };

    const WINDOW = [['rangeXFrom', 'MinX'], ['rangeXTo', 'MaxX'], ['rangeZFrom', 'MinZ'], ['rangeZTo', 'MaxZ']];
    t.equal(SURFACE_RANGE_FIELDS.map((f) => `${f.key}=${f.attr}`).join(' '),
        WINDOW.map(([k, a]) => `${k}=${a}`).join(' '), 'range',
        'the range window is the WIDTH and the SLICES: the height is the data, so it has no slider');
    t.equal(SURFACE_RANGE_FIELDS.filter((f) => f.def !== '').length, 0, 'range',
        'every range attribute defaults to EMPTY — "not set" means the whole range the data covers');

    // Only the surface has a range legend; an XY chart reading its own legend must not gain the keys,
    // or a save would write MinX onto a chart whose editor never asked for it.
    t.ok(hasRangeLegend('GrumpySurfacePlot'), 'range', 'the surface chart has a range legend');
    t.equal(CHARTS_TAGS.filter((tag) => hasRangeLegend(tag)).join(','), 'GrumpySurfacePlot', 'range',
        'and it is the only chart type that does');
    t.ok(!Object.prototype.hasOwnProperty.call(chartLegendOf(chart.el), 'rangeXFrom'), 'range',
        'an XY chart\'s legend values carry no range keys (its save cannot write them)');
    t.ok(Object.prototype.hasOwnProperty.call(chartLegendOf(surface('').el), 'rangeZTo'), 'range',
        'while a surface\'s do — that is what the modal reads');

    // Round trip: a zoom the user picked lands in the form, reads back, and a full-range pick removes
    // the attributes again.
    const zoomed = surface('');
    writeChartLegend(zoomed.model, zoomed.el, Object.assign({}, chartLegendOf(zoomed.el),
        { rangeXFrom: '70', rangeXTo: '110', rangeZFrom: '20' }));
    const zoomedXml = zoomed.model.serialize(true);
    t.ok(zoomedXml.includes('MinX="70"') && zoomedXml.includes('MaxX="110"'), 'range',
        'a width range is written as MinX/MaxX');
    t.ok(zoomedXml.includes('MinZ="20"'), 'range', 'and a slice range as MinZ');
    t.ok(!zoomedXml.includes('MaxZ=') && !zoomedXml.includes('MinY'), 'range',
        'an end left at the outer edge is NOT written, and the height window is not touched at all');
    const zoomedBack = chartLegendOf(zoomed.el);
    t.equal(`${zoomedBack.rangeXFrom}/${zoomedBack.rangeXTo}/${zoomedBack.rangeZFrom}`, '70/110/20', 'range',
        'and all of it reads back into the editor');
    writeChartLegend(zoomed.model, zoomed.el, Object.assign({}, zoomedBack,
        { rangeXFrom: '', rangeXTo: '', rangeZFrom: '' }));
    const clearedXml = zoomed.model.serialize(true);
    t.ok(!clearedXml.includes('MinX') && !clearedXml.includes('MaxX') && !clearedXml.includes('MinZ'), 'range',
        '"whole range" removes all four attributes, so an un-zoomed form stays short');

    // A hand-edited message must not be able to write junk: the chart cannot parse "Hello" as a bound.
    const junk = surface('');
    writeChartLegend(junk.model, junk.el, Object.assign({}, chartLegendOf(junk.el),
        { rangeXFrom: 'Hello', rangeXTo: '12abc' }));
    t.ok(!junk.model.serialize(true).includes('MinX') && !junk.model.serialize(true).includes('MaxX'), 'range',
        'a non-numeric range value is dropped rather than written into a form');

    // The DATA range the host measured, which is what the sliders span (the width and the SLICES).
    const measured = { DataMinX: '0', DataMaxX: '198', DataMinZ: '0', DataMaxZ: '495' };
    const range = chartDataRangeOf(measured);
    t.equal(range && `${range.minX}/${range.maxX}/${range.minZ}/${range.maxZ}`, '0/198/0/495', 'range',
        'the reported data range is read back as four numbers');
    t.equal(chartDataRangeOf(undefined), null, 'range',
        'a control with no reported range gives nothing (the modal says so instead of guessing)');
    t.equal(chartDataRangeOf({ DataMinX: '0', DataMaxX: '198' }), null, 'range',
        'a half-reported range is refused — sliders with no bounds are worse than none');
    t.equal(chartDataRangeOf({ DataMinX: '198', DataMaxX: '0', DataMinZ: '0', DataMaxZ: '495' }), null, 'range',
        'and an inverted one too');

    // The three sides of the seam: the host reports it, the extension forwards it, the modal draws it.
    t.ok(/msg\.legendRange = chartDataRangeOf\(this\.boundsOf\(doc, ctrlName\)\?\.values\)/.test(panel), 'range',
        'the extension forwards the range the host measured for THAT control',
        'msg.legendRange');
    t.ok(/if \(hasRangeLegend\(localName\(el\.tagName\)\)\) \{\s*\n\s*msg\.legendRange/.test(panel), 'range',
        'but only for a chart whose legend is a range control — other charts send nothing at all');
    t.ok(/openLegendEditor\(msg\.name, msg\.legendInfo \|\| \{\}, msg\.legendRange\)/.test(js), 'range',
        'the modal is opened with the range');
    t.ok(/if \(legendRange === undefined\) return;/.test(js), 'range',
        'the range rows are appended only for a range chart — undefined means "not one"');
    t.ok(js.includes("rangeSliders(v, 'rangeXFrom', 'rangeXTo'") && js.includes("rangeSliders(v, 'rangeZFrom', 'rangeZTo'"),
        'range', 'both ends of both sliders are on sliders — the width and the slices');
    t.ok(/s\.type = 'range'/.test(js), 'range', 'and those are real range inputs');
    t.ok(js.includes('Whole range'), 'range', 'with a way back to the whole sheet');
    t.ok(/values\[fromKey\] = a <= lo \+ edge \? '' : String\(a\)/.test(js), 'range',
        'an end dragged to the outer edge posts EMPTY, so the attribute is removed again');

    // The host's side: the four values have to reach the webview as parseable numbers.
    const renderer = read('host/XamlRenderer.cs');
    for (const key of ['DataMinX', 'DataMaxX', 'DataMinZ', 'DataMaxZ']) {
        t.ok(renderer.includes(`AddViaReflection("${key}"`), 'range',
            `the host reports ${key} from the chart's own read`);
    }
    t.ok(/InvariantNumber\(object\? value\)/.test(renderer) && renderer.includes('CultureInfo.InvariantCulture'),
        'range', 'and formats it invariantly (a comma decimal separator would not parse in the webview)');

    // Both twins: the properties exist and are measured WITHOUT the window, or the sliders would shrink
    // to whatever the last zoom was and a zoomed-in form could never be zoomed back out.
    for (const [name, src] of [['C#', cs], ['VB', vb]]) {
        for (const prop of ['DataMinX', 'DataMaxX', 'DataMinY', 'DataMaxY']) {
            t.ok(new RegExp(`(public double|Public ReadOnly Property) ${prop}`).test(src), 'range',
                `${name}: the chart exposes ${prop}`);
        }
        t.ok(/_dataX = AxisRange\.Over\(xs, (double|Double)\.NaN, (double|Double)\.NaN/.test(src), 'range',
            `${name}: the width range is measured from the DATA, never from the window`);
        t.ok(/_dataZ = AxisRange\.Over\(/.test(src), 'range',
            `${name}: and so is the SLICE range the Z slider spans`);
    }

    // --- 8. the legend of a SURFACE is a RANGE SELECTOR, not a list (2026-09-23) ------------------
    // Requested: "a special Legend containing only X-range and Y-range sliders". So the surface is the one
    // chart whose legend is not a list of names: ChartBase asks it for a SIZE and a DRAWING instead, and the
    // empty-list guard must not skip it. The line/bar/area/pie family — and the waterfall's samplesets — keep
    // listing their entries, which is what the InlineLegendName hook still decides.
    t.ok(/private protected virtual bool IsRangeLegend => false;/.test(cs), 'legend',
        'C#: a chart may declare a range legend, and the default is a normal list');
    t.ok(/private protected virtual Size MeasureRangeLegend\(Size frameSize\) => default;/.test(cs), 'legend',
        'C#: a range legend is measured by the chart, not by flowing entries');
    t.ok(/private protected virtual void DrawRangeLegend\(DrawingContext context\) \{ \}/.test(cs), 'legend',
        'C#: and it draws itself');
    t.ok(/if \(IsRangeLegend\) return MeasureRangeLegend\(frameSize\);/.test(cs), 'legend',
        'C#: the range legend short-circuits the entry measurement');
    t.ok(/if \(_legend\.Count == 0 && !IsRangeLegend\) return;/.test(cs), 'legend',
        'C#: and the empty-list guard lets it through (it has no entries by design)');
    t.ok(/if \(IsRangeLegend\)\s*\n\s*\{\s*\n\s*DrawRangeLegend\(context\);\s*\n\s*return;\s*\n\s*\}/.test(cs),
        'legend', 'C#: after the frame, a range legend draws its sliders and stops');
    // A slider needs the frame's LENGTH, so a bar docked at a side turns its sliders vertical instead of
    // moving somewhere else: the side the form asks for is honoured, and so is the reading direction.
    t.ok(/var side = LegendPosition;/.test(cs), 'legend',
        'C#: the bar takes the side the form asked for');
    for (const [name, src] of [['C#', cs], ['VB', vb]]) {
        const surfaceAt = src.search(/class GrumpySurfacePlot/i);
        const surface = surfaceAt < 0 ? '' : src.slice(surfaceAt);
        t.ok(/IsRangeLegend/.test(surface), 'legend', `${name}: the surface declares itself a range legend`);
        t.ok(/RangeVertical/.test(surface), 'legend',
            `${name}: the sliders turn vertical when the bar docks at a side`);
        // A band per slider. With the bar docked at a side both bands used to be the WHOLE bar, so the
        // first slider swallowed every press and the second could not be dragged at all (reported
        // 2026-09-23: "the Z slider cannot be dragged in runtime, the X slider works").
        t.ok(/RangeColumn/.test(surface), 'legend',
            `${name}: and each slider gets its own column to grab`);
        t.ok(/MeasureRangeLegend/.test(surface) && /DrawRangeLegend/.test(surface), 'legend',
            `${name}: with its own size and its own drawing`);
        t.ok(/RangeLow|RangeHitAxis/.test(surface) && /DragRangeTo|DragRange/.test(surface), 'legend',
            `${name}: and the pointers that read and drag a handle`);
        // Two sliders: the WIDTH and the SLICES. There is deliberately NO height slider — the height is
        // the data itself, not a choice.
        t.ok(/#4C9FDC/.test(surface) && /#D9A519/.test(surface), 'legend',
            `${name}: the width slider and the slice slider are drawn in their own colours`);
        t.ok(/MinZ/.test(surface) && /MaxZ/.test(surface), 'legend',
            `${name}: the second slider moves the Z window (MinZ/MaxZ), not the height`);
        t.ok(/RangeVertical/.test(surface), 'legend',
            `${name}: and the bar turns its sliders vertical when it docks at a side`);
        t.ok(/MinX|MaxX/.test(surface), 'legend',
            `${name}: a drag writes the chart's own window (MinX/MaxX too)`);
    }
};
