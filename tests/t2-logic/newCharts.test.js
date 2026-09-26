/* T2 — the bar, area and pie chart types (2026-09-21). Everything the extension has to know about
 * them: which tags are charts, which are cartesian, which series element each kind holds, the Slices
 * model (read/write round-trips), the property rows and their editor buttons, the defaults the panel
 * needs to show a real value, the toolbox entries, the help text, the bundled-file marker (an
 * existing project must be refreshed before <charts:GrumpyBarPlot> can compile) and the fact that the
 * C# and VB twins both ship every new type. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const charts = require('../../out/chartSeries.js');
const { XamlModel } = require('../../out/xamlModel.js');
const { propertyDefsFor, defaultFor } = require('../../out/propertyCatalog.js');
const { controlInfoFor } = require('../../out/controlInfo.js');
const { controlsForGroup, TOOLBOX_CATEGORIES } = require('../../out/toolboxProvider.js');
const { bundledComponentSpecs } = require('../../out/bundledComponents.js');

const csPath = path.join(ROOT, 'resources', 'GrumpyCharts.cs');
const vbPath = path.join(ROOT, 'resources', 'GrumpyCharts.vb');
const cs = fs.readFileSync(csPath, 'utf8');
const vb = fs.readFileSync(vbPath, 'utf8');

/** A model with a pie, so the Slices readers have something real to work on. */
function pieModel(xaml) {
    const model = new XamlModel(`<Window xmlns="https://github.com/avaloniaui"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        xmlns:charts="using:AvaloniaCharts">
        ${xaml}
    </Window>`);
    return model;
}

module.exports = async (t) => {
    t.section('new chart types');

    // ---------------------------------------------------------------- the tags
    for (const tag of ['GrumpyLinePlot', 'GrumpyXYPlot', 'GrumpyBarPlot', 'GrumpyAreaPlot', 'GrumpyPiePlot']) {
        t.equal(charts.isChartTag(tag), true, 'tags', `${tag} is a chart`);
    }
    t.equal(charts.isChartTag('GrumpyPanel'), false, 'tags', 'a non-chart is not a chart');
    for (const tag of ['GrumpyLinePlot', 'GrumpyXYPlot', 'GrumpyBarPlot', 'GrumpyAreaPlot']) {
        t.equal(charts.isCartesianChartTag(tag), true, 'tags', `${tag} is cartesian`);
    }
    t.equal(charts.isCartesianChartTag('GrumpyPiePlot'), false, 'tags', 'the pie has no cartesian frame');
    t.equal(charts.seriesTagFor('GrumpyBarPlot'), 'LineSeries', 'tags', 'a bar chart holds LineSeries (the SHAPE is the chart\'s business)');
    t.equal(charts.seriesTagFor('GrumpyAreaPlot'), 'LineSeries', 'tags', 'an area chart holds LineSeries');
    t.equal(charts.seriesTagFor('GrumpyPiePlot'), 'PieSlice', 'tags', 'a pie holds PieSlice elements');
    t.equal(charts.seriesTagFor('GrumpyXYPlot'), 'XYSeries', 'tags', 'the X,Y plot keeps XYSeries');

    // ---------------------------------------------------------------- the palette matches the renderer
    const palette = /private static readonly Color\[\] SlicePalette\s*=\s*\{([^}]*)\}/.exec(cs);
    t.ok(palette, 'palette', 'the C# slice palette is where the extension expects it');
    const csColours = palette[1].match(/#[0-9A-Fa-f]{6}/g) || [];
    t.equal(csColours.length, charts.CHART_SLICE_PALETTE.length, 'palette',
        `the reported palette has one entry per C# colour (${csColours.length})`);
    t.equal(csColours.join(',').toUpperCase(), charts.CHART_SLICE_PALETTE.join(',').toUpperCase(), 'palette',
        'the palette the Slices editor shows IS the palette the renderer uses, in the same order');

    // ---------------------------------------------------------------- the Slices model
    const namedPie = pieModel(`<Canvas Name="Holder">
        <charts:GrumpyPiePlot x:Name="Pie1" Labels="North,South,East,West" Values="32,24,18,26">
            <charts:GrumpyPiePlot.Slices>
                <charts:PieSlice Title="South" LineColor="#8CB369" Explode="12"/>
            </charts:GrumpyPiePlot.Slices>
        </charts:GrumpyPiePlot>
    </Canvas>`);
    const pieEl = namedPie.findByName('Pie1');
    const info = charts.chartSlicesOf(pieEl);
    t.equal(info.slices.length, 4, 'slices', 'one row per wedge the chart draws (the four Labels)');
    t.equal(info.slices.map((s) => s.title).join(','), 'North,South,East,West', 'slices',
        'the rows are in data order, so the palette follows the wedges');
    t.equal(info.fromWorkbook, false, 'slices', 'an inline pie is not workbook-bound');
    t.equal(info.slices[0].palette, charts.CHART_SLICE_PALETTE[0], 'slices', 'an untouched slice is offered the palette colour');
    t.equal(info.slices[0].lineColor, '', 'slices', 'an untouched slice has no colour of its own');
    t.equal(info.slices[1].lineColor, '#8CB369', 'slices', 'the named override is read back');
    t.equal(info.slices[1].explode, '12', 'slices', 'its Explode is read back');
    t.equal(info.slices[1].src, '0', 'slices', 'the row remembers which element it came from');
    t.equal(info.slices[2].src, '-1', 'slices', 'a slice the form does not name has no element yet');

    // A workbook pie cannot know its slice names here, so it lists the overrides it has.
    const sheetPie = pieModel(`<Canvas Name="Holder">
        <charts:GrumpyPiePlot x:Name="Pie2" SourceFile="/tmp/data.xlsx" XColumn="A" YColumn="C"/>
    </Canvas>`);
    const sheetInfo = charts.chartSlicesOf(sheetPie.findByName('Pie2'));
    t.equal(sheetInfo.slices.length, 0, 'slices', 'a workbook pie with no overrides starts with no rows');
    t.equal(sheetInfo.fromWorkbook, true, 'slices', 'and says so, so the editor can explain the palette');

    // Writing: an untouched palette row is not written, an override is, and the element survives an edit.
    const rows = info.slices.map((s) => ({ ...s }));
    rows[2].lineColor = '#123456';
    rows[2].explode = '6';
    rows[3].visible = 'False';
    charts.writeChartSlices(namedPie, pieEl, rows);
    const xml = namedPie.serialize();
    t.ok(xml.includes('<charts:PieSlice Title="South" LineColor="#8CB369" Explode="12"'), 'slices',
        'the slice that was already named keeps its element and its attributes');
    t.ok(xml.includes('<charts:PieSlice Title="East" LineColor="#123456" Explode="6"'), 'slices',
        'a re-coloured slice is written with its colour and Explode');
    t.ok(xml.includes('<charts:PieSlice Title="West" Visible="False"'), 'slices',
        'a hidden slice is written with Visible only');
    t.ok(!/Title="North" LineColor/.test(xml), 'slices', 'the untouched slice is written with its name and NOTHING else (it keeps the palette colour)');
    t.equal((xml.match(/PieSlice Title=/g) || []).length, 4, 'slices', 'every row the editor sends is written');
    t.ok(xml.includes('<charts:GrumpyPiePlot.Slices>'), 'slices', 'inside the chart\'s own .Slices property element');
    // The ROWS themselves are filtered in the editor before they are sent (a palette-only row would
    // otherwise pin the palette colour into the form, which is what the palette exists to avoid).
    const web = fs.readFileSync(path.join(ROOT, 'media', 'designer.js'), 'utf8');
    t.ok(/sliceEdit\.rows\.filter\(/.test(web) && /return !!r\.lineColor/.test(web), 'slices',
        'the Slices editor sends only the rows that actually override something');

    // An empty list removes the property element again.
    charts.writeChartSlices(namedPie, pieEl, []);
    t.ok(!namedPie.serialize().includes('.Slices'), 'slices', 'no slices = no property element at all');

    // Round-trip: write what we read and read it back unchanged.
    const again = pieModel(`<Canvas Name="Holder"><charts:GrumpyPiePlot x:Name="Pie3" Labels="A,B"/></Canvas>`);
    const el3 = again.findByName('Pie3');
    const read3 = charts.chartSlicesOf(el3);
    const edited = read3.slices.map((s) => ({ ...s }));
    edited[1].lineColor = '#ABCDEF';
    charts.writeChartSlices(again, el3, edited);
    const read4 = charts.chartSlicesOf(el3);
    t.equal(read4.slices[1].lineColor, '#ABCDEF', 'slices', 'a written colour reads back');
    t.equal(read4.slices[0].lineColor, '', 'slices', 'and the untouched one stays untouched');

    // ---------------------------------------------------------------- property rows + editors
    const propRows = (tag) => propertyDefsFor(pieModel(`<Canvas Name="Holder"><charts:${tag} x:Name="c1"/></Canvas>`).findByName('c1')) || [];
    const barRows = propRows('GrumpyBarPlot');
    const barKeys = barRows.map((r) => r.key);
    for (const key of ['BarMode', 'BarWidth', 'BarCornerRadius', 'XColumn', 'YColumn', 'DataSelector', 'Gradient']) {
        t.ok(barKeys.includes(key), 'properties', `the bar chart has a ${key} row`);
    }
    const barMode = barRows.find((r) => r.key === 'BarMode');
    t.equal(barMode.options.join(','), 'Grouped,Stacked,Stacked100', 'properties', 'Bar Mode offers the three C# BarMode values');
    const barEditors = barRows.filter((r) => r.kind === 'button').map((r) => r.key);
    for (const key of ['Series', 'Axis', 'Legend', 'Gradient']) {
        t.ok(barEditors.includes(key), 'properties', `the bar chart offers the ${key} editor`);
    }
    // 2026-09-22: the BAR lost its cursors — a crosshair reads a value BETWEEN two samples, and a bar is
    // one reading per category — so its Properties list has no Cursors row and its right-click menu has
    // no cursor entries. It reports the bar under the pointer in the readout panel instead.
    t.ok(!barEditors.includes('Cursors'), 'properties', 'but no Cursors editor (a bar has no crosshair)');

    const areaRows = propRows('GrumpyAreaPlot');
    const areaKeys = areaRows.map((r) => r.key);
    t.ok(areaKeys.includes('AreaMode'), 'properties', 'the area chart has an Area Mode row');
    t.ok(areaKeys.includes('AreaOpacity'), 'properties', 'the area chart has an Area Opacity row');
    t.equal(areaRows.find((r) => r.key === 'AreaMode').options.join(','), 'Plain,Stacked,Stacked100',
        'properties', 'Area Mode offers the three C# AreaMode values');
    const areaEditors = areaRows.filter((r) => r.kind === 'button').map((r) => r.key);
    for (const key of ['Series', 'Axis', 'Legend', 'Cursors']) {
        t.ok(areaEditors.includes(key), 'properties', `the area chart offers the ${key} editor`);
    }

    const pieRows = propRows('GrumpyPiePlot');
    const pieKeys = pieRows.map((r) => r.key);
    for (const key of ['Labels', 'Values', 'DoughnutPercent', 'StartAngle', 'SliceGap', 'SliceBorderColor',
        'SliceBorderThickness', 'HoverExplode', 'DataSelector', 'Gradient']) {
        t.ok(pieKeys.includes(key), 'properties', `the pie has a ${key} row`);
    }
    const pieEditors = pieRows.filter((r) => r.kind === 'button').map((r) => r.key);
    t.ok(pieEditors.includes('Slices'), 'properties', 'the pie offers the Slices editor');
    t.ok(pieEditors.includes('Legend'), 'properties', 'and the Legend editor (its legend lists the SLICES)');
    t.ok(!pieEditors.includes('Axis'), 'properties', 'but no Axis editor: a pie has no cartesian frame');
    t.ok(!pieEditors.includes('Cursors'), 'properties', 'and no Cursor editor either');
    t.ok(!pieKeys.includes('ShowGrid'), 'properties', 'and no gridline rows');
    t.ok(!pieKeys.includes('MinY'), 'properties', 'and no scale rows');

    // ---------------------------------------------------------------- defaults
    for (const [key, value] of [['BarMode', 'Grouped'], ['BarWidth', '0.8'], ['BarCornerRadius', '0'],
    ['AreaMode', 'Plain'], ['AreaOpacity', '60'], ['DoughnutPercent', '0'], ['SliceGap', '0'],
    ['SliceBorderThickness', '1'], ['HoverExplode', '10']]) {
        t.equal(defaultFor(key), value, 'defaults', `${key} defaults to ${value}`);
    }
    t.ok(defaultFor('SliceBorderColor'), 'defaults', 'the slice border has a default colour');

    // ---------------------------------------------------------------- toolbox + help + markers
    const chartGroup = TOOLBOX_CATEGORIES.find((cat) => (cat.group || '').toLowerCase().includes('chart'));
    t.ok(chartGroup, 'toolbox', 'the toolbox has a Charts category');
    const toolboxTags = controlsForGroup(chartGroup.group).map((c) => c.tag);
    for (const tag of ['GrumpyLinePlot', 'GrumpyXYPlot', 'GrumpyBarPlot', 'GrumpyAreaPlot', 'GrumpyPiePlot']) {
        t.ok(toolboxTags.includes(tag), 'toolbox', `${tag} can be dragged from the toolbox`);
    }
    for (const tag of ['GrumpyBarPlot', 'GrumpyAreaPlot', 'GrumpyPiePlot']) {
        const help = controlInfoFor(tag);
        t.ok(help && help.use && help.use.length > 80, 'help', `${tag} has help text`);
    }

    const chartSpec = bundledComponentSpecs(false).find((s) => s.kind === 'GrumpyCharts');
    t.equal(chartSpec.marker, 'GrumpyPrint', 'marker',
        'the staleness marker is the newest thing an existing project needs (types, attributes, behaviour)');
    const vbSpec = bundledComponentSpecs(true).find((s) => s.kind === 'GrumpyCharts');
    t.equal(vbSpec.marker, chartSpec.marker, 'marker', 'both languages use the same marker');

    // ---------------------------------------------------------------- both twins ship all of it
    for (const [name, text] of [['C#', cs], ['VB', vb]]) {
        for (const token of ['GrumpyBarPlot', 'GrumpyAreaPlot', 'GrumpyPiePlot', 'PieSlice', 'BarMode',
            'AreaMode', 'Stacked100', 'DoughnutPercent', 'SliceBorderThickness', 'StackBands',
            'NamedXAxis', 'ZeroToHundred', 'XPadUnits', 'Labels', 'HoverExplode', 'SupportsHoverReadout',
            'ReadoutPanel', 'UpdateHover']) {
            t.ok(text.includes(token), 'twins', `${name} ships ${token}`);
        }
    }
    // The drawing methods exist in both, and each one draws its own shape: the base line layer, the bar,
    // the area, the pie, the waterfall (2026-09-22) and the surface (2026-09-23).
    for (const [name, text, draw] of [
        ['C#', cs, /private protected override void DrawSeriesLayer/],
        ['VB', vb, /Friend Overrides Sub DrawSeriesLayer/]]) {
        const count = (text.match(new RegExp(draw.source, 'g')) || []).length;
        t.equal(count, 5, 'twins', `${name} has the base layer plus the five chart-type layers (${count})`);
    }
    // The label+value reader a pie needs, and the X-column text it keeps as a point's name.
    for (const [name, text] of [['C#', cs], ['VB', vb]]) {
        t.ok(/ReadLabels/.test(text), 'twins', `${name} reads label + value pairs for the pie`);
        t.ok(/data\.Labels = labels\.ToArray\(\)/.test(text), 'twins', `${name} records each point's name from the X column`);
    }
    // A pie has no frame: the axes are hidden AND the gridlines are skipped.
    t.ok(/HasCartesianAxes => false/.test(cs), 'twins', 'the C# pie declares itself frame-less');
    t.ok(/ReadOnly Property HasCartesianAxes As Boolean/.test(vb), 'twins', 'so does the VB pie');
};
