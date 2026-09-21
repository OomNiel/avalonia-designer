/* T2 — the chart APPEARANCE rules added for 0.11.2: a fixed readout palette, three independent axis
 * colours, a real gradient background brush, and the workbook picker moving off the chart surface into
 * the right-click menu.
 *
 * Why this exists: each of these is a rule that lives in TWO places at once — the bundled C#/VB twin
 * (what is drawn) and the editor (what is written). A rule that reaches only one of them fails
 * silently: an axis colour nothing reads, a property element the writer cannot produce, or a removal
 * that leaves forms written earlier unable to compile.
 *
 *   1. the readout values are always white on an always-black panel; the border and the series line
 *      keep the cursor's colour;
 *   2. an axis has THREE colours — line, tick labels, name — the last two falling back to the line;
 *   3. a chart can carry a real Avalonia gradient (Linear / Radial / Conic, three stops) as its own
 *      `.PlotBackBrush` property element, and `None` removes it again;
 *   4. the "…" button is gone from the surface (the menu carries "Choose spreadsheet…"), its Properties
 *      row is gone, and the ShowBrowse property SURVIVES so older forms still compile.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');
const { propertyDefsFor, DEFAULTS } = require('../../out/propertyCatalog.js');
const { XamlModel } = require('../../out/xamlModel.js');
const {
    chartAxesOf, writeChartAxes, chartBrushOf, writeChartBrush, CHART_BRUSH_TYPES, CHART_AXIS_FIELDS
} = require('../../out/chartSeries.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"'
    + ' xmlns:charts="using:AvaloniaCharts"';
const CHARTS = ['GrumpyLinePlot', 'GrumpyXYPlot'];

function elFrom(xml) {
    const doc = new DOMParser().parseFromString(`<root ${NS}>${xml}</root>`, 'text/xml');
    for (let i = 0; i < doc.documentElement.childNodes.length; i++) {
        const c = doc.documentElement.childNodes.item(i);
        if (c.nodeType === 1) return c;
    }
    return undefined;
}
const keyOf = (props, k) => props.find((p) => p.key === k);
const count = (source, needle) => source.split(needle).length - 1;

/** The axis value record the Axis editor posts, with the renderer's defaults filled in. */
const axisValues = (over) => Object.assign({
    position: 'Bottom', showAxis: 'True', axisColor: '#666666', tickLabelColor: '', nameColor: '',
    showMajorTicks: 'True', majorTickLength: '6', showMinorTicks: 'True', minorTickLength: '3',
    showTickLabels: 'True', tickLabelFontSize: '11', showAxisName: 'True', name: ''
}, over);

function chartModel(attrs = '', children = '') {
    const model = new XamlModel(`<Window ${NS}><Canvas Name="Body">`
        + `<charts:GrumpyXYPlot x:Name="C1" Width="320" Height="200" ${attrs}>${children}</charts:GrumpyXYPlot>`
        + `</Canvas></Window>`);
    return { model, el: model.findByName('C1') };
}

module.exports = async (t) => {
    t.section('chartAppearance');

    const TWINS = [['cs', read('resources/GrumpyCharts.cs')], ['vb', read('resources/GrumpyCharts.vb')]];
    const js = read('media/designer.js');
    const panel = read('src/designerPanel.ts');

    /** Asserts one rule in BOTH twins: `patterns` gives the C# and VB spellings of the same thing. */
    const both = (message, patterns, expect = true) => {
        for (const [lang, source] of TWINS) {
            t.equal(patterns[lang].test(source), expect, lang, `${lang} ${message}`);
        }
    };

    // ---------------------------------------------------------------- 4. the browse button is gone
    // First, because it is a REMOVAL: everything after it assumes the button is gone.
    for (const tag of CHARTS) {
        const props = propertyDefsFor(elFrom(`<charts:${tag} x:Name="c1"/>`));
        t.equal(keyOf(props, 'ShowBrowse'), undefined, 'browse',
            `${tag} no longer lists a Browse Button row`);
        t.ok(!!keyOf(props, 'Gradient'), 'browse', `${tag} lists the Background Gradient row instead`);
        t.ok(!!keyOf(props, 'SourceFile'), 'browse', `${tag} still lists the Spreadsheet row`);
    }
    t.equal(Object.prototype.hasOwnProperty.call(DEFAULTS, 'ShowBrowse'), false, 'browse',
        'the panel carries no default for it any more');
    both('draws no button on the chart surface', { cs: /DrawBrowseButton/, vb: /DrawBrowseButton/ }, false);
    both('has no button-visibility rule left', { cs: /BrowseVisible/, vb: /BrowseVisible/ }, false);
    both('KEEPS the ShowBrowse property so a form written earlier still compiles', {
        cs: /ShowBrowse \{ get => GetValue\(ShowBrowseProperty\)/,
        vb: /Property ShowBrowse As Boolean/
    });
    both('says in so many words that it now changes nothing', {
        cs: /Kept so forms written when the chart drew its own/,
        vb: /Kept so forms written when the chart drew its own/
    });
    both('does not re-render for a property that draws nothing', {
        cs: /ShowBrowseProperty, ShowLegendProperty/, vb: /ShowBrowseProperty, ShowLegendProperty/
    }, false);
    both('offers the picker in the right-click menu', {
        cs: /Choose spreadsheet…/, vb: /Choose spreadsheet…/
    });
    both('calls the same BrowseForFile the button used to', {
        cs: /browseItem\.Click \+= \(_, _\) => _ = BrowseForFile\(\)/, vb: /BrowseForFile\(\)/
    });
    both('tells an empty chart to right-click instead of pointing at a button', {
        cs: /No data — right-click to choose a spreadsheet, or add a series/,
        vb: /No data — right-click to choose a spreadsheet, or add a series/
    });

    // ---------------------------------------------------------------- 1. the readout palette
    for (const [lang, source] of TWINS) {
        t.ok(count(source, 'Colors.White') >= 2, lang,
            `${lang} whitens both value rows (X/Y and the pair difference)`);
        t.ok(/SolidColorBrush\(Colors\.Black\)/.test(source), lang,
            `${lang} paints the readout panel Black, whatever the chart's own background is`);
        t.equal(/SolidColorBrush\(PlotBackColor, 0\.92\)/.test(source), false, lang,
            `${lang} has dropped the plate-tinted panel background`);
    }
    both("keeps the series line in the traced series' colour", {
        cs: /MakeText\(tag \+ "  " \+ name, 11, trace\.LineColor\)/,
        vb: /MakeText\(tag & "  " & name, 11, trace\.LineColor\)/
    });
    both("keeps the panel border in the cursor's colour", {
        cs: /new Pen\(new SolidColorBrush\(color\), 1\)/,
        vb: /New Pen\(New SolidColorBrush\(color\), 1\)/
    });

    // ---------------------------------------------------------------- 2. three axis colours
    for (const key of ['tickLabelColor', 'nameColor']) {
        const field = CHART_AXIS_FIELDS.find((f) => f.key === key);
        t.ok(!!field, 'axes', `the Axis editor carries ${key}`);
        t.equal(field.def, '', 'axes',
            `${key} is UNSET by default: empty means "follow the axis colour", not "pick grey"`);
    }
    both('declares the tick-label colour as a NULLABLE colour (unset follows the axis)', {
        cs: /public Color\? TickLabelColor \{/, vb: /Property TickLabelColor As Color\?/
    });
    both('declares the axis-name colour the same way', {
        cs: /public Color\? NameColor \{/, vb: /Property NameColor As Color\?/
    });
    both('resolves an unset label colour to the axis colour, in one place', {
        cs: /LabelColor => TickLabelColor \?\? AxisColor/,
        vb: /Return If\(TickLabelColor\.HasValue, TickLabelColor\.Value, AxisColor\)/
    });
    both('and the same for the axis name', {
        cs: /AxisNameColor => NameColor \?\? AxisColor/,
        vb: /Return If\(NameColor\.HasValue, NameColor\.Value, AxisColor\)/
    });
    both('draws the tick labels in the resolved label colour', {
        cs: /MakeText\(text, axis\.TickLabelFontSize, axis\.LabelColor\)/,
        vb: /MakeText\(text, axis\.TickLabelFontSize, axis\.LabelColor\)/
    });
    both('draws the axis name in its own colour', { cs: /axis\.AxisNameColor/, vb: /axis\.AxisNameColor/ });
    both('still draws the axis line and its ticks in AxisColor', {
        cs: /MakePen\(axis\.AxisColor, 1, ChartLineStyle\.Solid\)/,
        vb: /MakePen\(axis\.AxisColor, 1, ChartLineStyle\.Solid\)/
    });
    // The round-trip through the real editor writer: written, read back, cleared back to "follow".
    const axes = chartModel('', '<charts:XYSeries YColumn="C"/>');
    writeChartAxes(axes.model, axes.el,
        axisValues({ position: 'Bottom' }),
        axisValues({ position: 'Left', tickLabelColor: '#1050A0', nameColor: '#A02050', name: 'Inside' }),
        [{ x: null, y: null }]);
    const writtenAxes = axes.model.serialize(true);
    t.ok(writtenAxes.includes('TickLabelColor="#1050A0"') && writtenAxes.includes('NameColor="#A02050"'), 'axes',
        'the Axis editor writes both text colours as attributes');
    t.equal(chartAxesOf(axes.el).commonY.tickLabelColor, '#1050A0', 'axes', 'and reads them back');
    t.equal(chartAxesOf(axes.el).commonY.nameColor, '#A02050', 'axes', 'both of them');
    writeChartAxes(axes.model, axes.el,
        axisValues({ position: 'Bottom' }),
        axisValues({ position: 'Left', tickLabelColor: '', nameColor: '', name: 'Inside' }),
        [{ x: null, y: null }]);
    t.equal(axes.model.serialize(true).includes('TickLabelColor'), false, 'axes',
        'clearing the row REMOVES the attribute, so the axis colour takes over again');
    t.equal(chartAxesOf(axes.el).commonY.tickLabelColor, '', 'axes', 'and the editor reads it as unset');

    // ---------------------------------------------------------------- 3. the gradient background
    t.equal(CHART_BRUSH_TYPES.join(','), 'None,Linear,Radial,Conic', 'gradient',
        'the editor offers the three Avalonia gradient types plus None');
    const chart = chartModel('');
    t.equal(chartBrushOf(chart.el).type, 'None', 'gradient', 'a chart with no brush reads as None');
    writeChartBrush(chart.model, chart.el,
        { type: 'Linear', start: '#FFFFFF', middle: '#DCEBFF', end: '#C6DBF5', angle: '45' });
    const linear = chart.model.serialize(true);
    t.ok(/<charts:GrumpyXYPlot\.PlotBackBrush>/.test(linear), 'gradient',
        "the brush is written as the chart's own property element (Avalonia has no brush literal)");
    t.ok(/<LinearGradientBrush StartPoint="0%,0%" EndPoint="100%,100%">/.test(linear), 'gradient',
        'as a real LinearGradientBrush whose points span the box corner to corner at 45°');
    t.equal(count(linear, '<GradientStop '), 3, 'gradient', 'with three colour stops');
    t.ok(/<GradientStop Color="#DCEBFF" Offset="0.5"\/>/.test(linear), 'gradient',
        'the middle stop sitting half way');
    const readLinear = chartBrushOf(chart.el);
    t.equal(`${readLinear.type}|${readLinear.start}|${readLinear.middle}|${readLinear.end}|${readLinear.angle}`,
        'Linear|#FFFFFF|#DCEBFF|#C6DBF5|45', 'gradient', 'and every value reads back intact');
    // Two stops, and the two radial kinds.
    writeChartBrush(chart.model, chart.el,
        { type: 'Linear', start: '#000000', middle: '', end: '#FFFFFF', angle: '0' });
    const twoStops = chart.model.serialize(true);
    t.equal(count(twoStops, '<GradientStop '), 2, 'gradient',
        'an empty middle colour writes a two-stop gradient');
    t.ok(/StartPoint="0%,50%" EndPoint="100%,50%"/.test(twoStops), 'gradient', 'and angle 0 runs left to right');
    t.equal(chartBrushOf(chart.el).angle, '0', 'gradient', 'reading back as 0°');
    for (const [kind, element] of [['Radial', 'RadialGradientBrush'], ['Conic', 'ConicGradientBrush']]) {
        writeChartBrush(chart.model, chart.el,
            { type: kind, start: '#FFFFFF', middle: '', end: '#FFC080', angle: '90' });
        const xaml = chart.model.serialize(true);
        t.ok(xaml.includes(`<${element}>`), 'gradient', `${kind} writes a ${element}`);
        t.equal(/StartPoint/.test(xaml), false, 'gradient',
            `${kind} carries no angle points (it spreads from the middle)`);
        t.equal(chartBrushOf(chart.el).type, kind, 'gradient', `and reads back as ${kind}`);
        t.equal(chartBrushOf(chart.el).angle, '', 'gradient', 'with no angle, because only Linear has one');
    }
    writeChartBrush(chart.model, chart.el,
        { type: 'Linear', start: '#111111', middle: '', end: '#222222', angle: '90' });
    t.equal(count(chart.model.serialize(true), 'PlotBackBrush'), 2, 'gradient',
        're-writing replaces the brush rather than stacking a second property element');
    writeChartBrush(chart.model, chart.el,
        { type: 'None', start: '#111111', middle: '', end: '#222222', angle: '90' });
    t.equal(chart.model.serialize(true).includes('PlotBackBrush'), false, 'gradient',
        'None removes the property element, so the chart falls back to Plot Backcolour');
    t.equal(chartBrushOf(chart.el).type, 'None', 'gradient', 'and the editor reads it as None again');
    writeChartBrush(chart.model, chart.el, { type: 'Linear', start: '#111111', middle: '', end: '', angle: '45' });
    t.equal(chart.model.serialize(true).includes('PlotBackBrush'), false, 'gradient',
        'a brush without both end colours is refused rather than written half-formed');
    // A hand-written brush this editor did not produce is never claimed as understood.
    const handMade = chartModel('', '<charts:GrumpyXYPlot.PlotBackBrush><SolidColorBrush Color="#FF0000"/>'
        + '</charts:GrumpyXYPlot.PlotBackBrush>');
    t.equal(chartBrushOf(handMade.el).type, 'None', 'gradient',
        'a brush that is not one of the three gradients reads as None (never claimed as understood)');

    both('declares the PlotBackBrush property', { cs: /PlotBackBrushProperty/, vb: /PlotBackBrushProperty/ });
    both('types it as a Brush', {
        cs: /StyledProperty<Brush\?> PlotBackBrushProperty/,
        vb: /PlotBackBrushProperty As StyledProperty\(Of Brush\)/
    });
    both('re-renders when the brush changes (AffectsRender)', {
        cs: /PlotBackColorProperty, PlotBackOpacityProperty, PlotBackBrushProperty,/,
        vb: /PlotBackColorProperty, PlotBackOpacityProperty, PlotBackBrushProperty,/
    });
    both('paints the brush when there is one and the plain colour otherwise', {
        cs: /var plate = PlotBackBrush \?\? new SolidColorBrush\(PlotBackColor, opacity\);/,
        vb: /Dim plate As Brush = If\(PlotBackBrush, CType\(New SolidColorBrush\(PlotBackColor, opacity\), Brush\)\)/
    });
    both('does not re-paint the plot rect with the brush (that would re-map the gradient)', {
        cs: /if \(PlotBackBrush is null\) context\.DrawRectangle\(plate, null, plot\);/,
        vb: /If PlotBackBrush Is Nothing Then context\.DrawRectangle\(plate, Nothing, plotRect\)/
    });
    // The editor seam: the properties message carries the brush in, and the save message writes it out.
    t.ok(/msg\.brushInfo = chartBrushOf\(el\)/.test(panel), 'gradient',
        "the panel sends the chart's current brush with its properties");
    t.ok(/case 'saveChartGradient'/.test(panel), 'gradient', "and handles the editor's save message");
    t.ok(/writeChartBrush\(doc\.model, el,/.test(panel), 'gradient', 'which writes the brush');
    t.ok(/p\.key === 'Gradient'\) openGradientEditor\(/.test(js), 'gradient',
        "the 'Background Gradient' row opens the editor");
    t.ok(/type: 'saveChartGradient'/.test(js), 'gradient', 'and the editor posts its values for saving');
    t.ok(/gradientModal: \$\('gradientModal'\)/.test(js), 'gradient', 'and its modal is in the element map');
    for (const key of ['type', 'start', 'middle', 'end', 'angle']) {
        t.ok(js.includes(`'${key}'`) || js.includes(`.${key} =`), 'gradient',
            `the gradient editor edits ${key}`);
    }
};
