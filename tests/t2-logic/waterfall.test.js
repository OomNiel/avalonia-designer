/* T2 — the WATERFALL chart type (2026-09-22): a 3D WATERFALL/spectral chart drawn in a 2D renderer.
 *
 * The request: "I need to produce a 3d surface plot with samplepoints (eg 1 to 2048 points) on the x-axis,
 * sample values on the y-axis and each successive sampleset on the z-axis. I need connectors and colour
 * split." Four answers fixed the shape of it, and every one of them is pinned here:
 *   - ONE SERIES IS ONE SAMPLESET (its own spreadsheet column), so the Series editor, the legend and the
 *     per-series colours work unchanged — the tag therefore counts as a SERIES chart (`isSeriesChartTag`)
 *     while still NOT being a cartesian one (its three axes are drawn in projection, so there is no Axis
 *     editor and no 2D scale rows);
 *   - all four colour treatments are SELECTABLE in the editor: one colour per set, a value heat map, a
 *     two-colour split at a threshold, and transparency;
 *   - all three ribbon styles are selectable too: solid (occluding), translucent, and lines-only;
 *   - auto-thinning with overridable MaxPoints + ConnectorStep, and the view as angle properties plus
 *     drag-to-rotate.
 *
 * Why the source contracts matter: nothing here can be seen by a unit test — the DRAWING is measured in
 * tests/t1-preview/waterfallRender.test.js, and what this file adds is that the wiring (tags, rows,
 * defaults, editor buttons, both twins, the toolbox, the VB namespace list and the staleness marker)
 * cannot silently drift away from it. Two of the contracts are bugs this file exists to prevent from
 * coming back:
 *   - the PAINTER'S ORDER: the sign of the view depth says which set is the far one, and getting it
 *     backwards lets the ribbons at the back paint over the ones in front (measured: the far set showed
 *     27% more of itself than the near one);
 *   - the HEAT MAP's ends default to the DATA's own least/greatest value, not the scale's — the scale's
 *     round numbers would otherwise squeeze the map into its middle stops and a peak would never reach the
 *     top colour.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const charts = require('../../out/chartSeries.js');
const { XamlModel, CHARTS_TAGS } = require('../../out/xamlModel.js');
const { propertyDefsFor, defaultFor, PROP_SECTIONS } = require('../../out/propertyCatalog.js');
const { controlInfoFor } = require('../../out/controlInfo.js');
const { controlsForGroup, TOOLBOX_CATEGORIES } = require('../../out/toolboxProvider.js');
const { bundledComponentSpecs } = require('../../out/bundledComponents.js');

const cs = fs.readFileSync(path.join(ROOT, 'resources', 'GrumpyCharts.cs'), 'utf8');
const vb = fs.readFileSync(path.join(ROOT, 'resources', 'GrumpyCharts.vb'), 'utf8');
const xamlModelSource = fs.readFileSync(path.join(ROOT, 'src', 'xamlModel.ts'), 'utf8');
const codeBehindSource = fs.readFileSync(path.join(ROOT, 'src', 'codeBehind.ts'), 'utf8');
const TWINS = [['cs', cs], ['vb', vb]];
const TAG = 'GrumpyWaterfallPlot';
const count = (text, needle) => text.split(needle).length - 1;

/** A model with one waterfall, so the property rows have a real element to work on. */
function model(extra = '') {
    const doc = new XamlModel(`<Window xmlns="https://github.com/avaloniaui"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        xmlns:charts="using:AvaloniaCharts">
        <Canvas Name="Holder"><charts:${TAG} x:Name="w1" ${extra}/></Canvas>
    </Window>`);
    return doc.findByName('w1');
}

module.exports = async (t) => {
    t.section('T2: the waterfall chart type');

    // ---------------------------------------------------------------- the tag's place among the others
    t.equal(charts.isChartTag(TAG), true, 'tags', 'the waterfall is one of the chart tags');
    t.equal(charts.isCartesianChartTag(TAG), false, 'tags',
        'but NOT a cartesian one: its three axes are drawn in projection, so there is no 2D axis furniture');
    t.equal(charts.isSeriesChartTag(TAG), true, 'tags',
        'it IS a series chart — one series is one sampleset, which is what the Series editor edits');
    for (const tag of ['GrumpyLinePlot', 'GrumpyXYPlot', 'GrumpyBarPlot', 'GrumpyAreaPlot']) {
        t.equal(charts.isSeriesChartTag(tag), true, 'tags', `${tag} is a series chart too`);
    }
    t.equal(charts.isSeriesChartTag('GrumpyPiePlot'), false, 'tags',
        'the pie is not: its wedges live in its own .Slices property element');
    t.equal(charts.seriesTagFor(TAG), 'LineSeries', 'tags',
        'a sampleset is a plain line series (X is the sample index, so only the Y column is read)');
    t.equal(charts.supportsCursors(TAG), false, 'tags', 'and it has no cursors: a crosshair in 3D reads nothing');
    t.equal(CHARTS_TAGS.includes(TAG), true, 'tags', 'the xmlns:charts declaration knows the tag');
    t.ok(xamlModelSource.includes(`'${TAG}'`), 'tags', 'and the list in xamlModel.ts carries it');
    t.ok(/VB_CHARTS_NS_TYPES = new Set\(\[[^\]]*'GrumpyWaterfallPlot'/.test(codeBehindSource), 'tags',
        'a VB accessor `… As GrumpyWaterfallPlot` needs Imports AvaloniaCharts, so the list has it');

    // ---------------------------------------------------------------- the property rows
    const rows = propertyDefsFor(model()) || [];
    const keys = rows.map((r) => r.key);
    const editors = rows.filter((r) => r.kind === 'button').map((r) => r.key);
    for (const key of ['SampleSets', 'Values', 'YColumn', 'HeaderRow', 'FirstDataRow', 'LiveUpdate',
        'Gradient', 'RibbonStyle', 'RibbonOpacity', 'ColorMode', 'HeatMin', 'HeatMax', 'SplitValue',
        'BelowColor', 'AboveColor', 'ShowConnectors', 'ConnectorColor', 'ConnectorThickness',
        'ConnectorStep', 'MaxPoints',
        'Elevation', 'Azimuth', 'ZSpacing', 'Zoom', 'ZAxisTitle',
        'Title', 'ShowTitle', 'PlotBackColor', 'ShowBorder', 'Padding', 'CornerRadius',
        'ShowGrid', 'GridColor', 'GridStyle', 'ShowAxes', 'AxisColor', 'ShowTickLabels',
        'TickLabelFontSize', 'ShowAxisTitles', 'XAxisTitle', 'YAxisTitle', 'ShowLegend']) {
        t.ok(keys.includes(key), 'rows', `the waterfall has a ${key} row`);
    }
    for (const gone of ['MinX', 'MaxX', 'MinY', 'MaxY', 'BarMode', 'DoughnutPercent']) {
        t.ok(!keys.includes(gone), 'rows', `and no ${gone} row (it does not belong to this chart)`);
    }
    for (const key of ['Series', 'Legend', 'Data']) {
        t.ok(editors.includes(key), 'rows', `the waterfall offers the ${key} editor`);
    }
    t.ok(!editors.includes('Axis'), 'rows', 'but no Axis editor: the three projected axes are styled by rows');
    t.ok(!editors.includes('Cursors'), 'rows', 'and no Cursors editor');
    t.ok(!editors.includes('Slices'), 'rows', 'and no Slices editor');

    // The two dropdowns are the C# enums, in the same order — a mismatch would write a name the control
    // cannot parse, which fails at runtime in the user's app and nowhere else.
    t.equal(rows.find((r) => r.key === 'RibbonStyle').options.join(','), 'Ribbon,Translucent,Lines', 'rows',
        'Style offers the three WaterfallStyle values in order');
    t.equal(rows.find((r) => r.key === 'ColorMode').options.join(','), 'Sampleset,Value,Split', 'rows',
        'Colour By offers the three WaterfallColorMode values in order');
    for (const [lang, text] of TWINS) {
        for (const value of ['Ribbon', 'Translucent', 'Lines']) {
            t.ok(new RegExp(`^\\s*${value},?\\s*$`, 'm').test(text), lang,
                `${lang}: WaterfallStyle has ${value}`);
        }
        for (const value of ['Sampleset', 'Value', 'Split']) {
            t.ok(new RegExp(`^\\s*${value},?\\s*$`, 'm').test(text), lang,
                `${lang}: WaterfallColorMode has ${value}`);
        }
    }

    const defaults = {
        RibbonStyle: 'Ribbon', RibbonOpacity: '80', ColorMode: 'Sampleset', SplitValue: '0',
        BelowColor: '#2D7DD2', AboveColor: '#E4572E', ShowConnectors: 'True', ConnectorColor: '#6B7A8F',
        ConnectorThickness: '1', ConnectorStep: '0', MaxPoints: '512', Elevation: '30', Azimuth: '45',
        ZSpacing: '1', Zoom: '1', ZAxisTitle: '', SampleSets: '',
        // Empty means "the data decides", which is what the control's NaN default is for.
        HeatMin: '', HeatMax: ''
    };
    for (const [key, value] of Object.entries(defaults)) {
        t.equal(defaultFor(key), value, 'defaults', `${key} defaults to "${value}"`);
    }

    // ---------------------------------------------------------------- the sections they sit in
    const sectionOf = (key) => (PROP_SECTIONS.find((s) => s.keys.includes(key)) || {}).id;
    for (const key of ['RibbonStyle', 'ColorMode', 'Elevation', 'Azimuth', 'Zoom', 'ShowConnectors',
        'MaxPoints', 'SplitValue', 'BelowColor']) {
        t.equal(sectionOf(key), 'appearance', 'sections', `${key} is an Appearance row`);
    }
    t.equal(sectionOf('SampleSets'), 'data', 'sections', 'Sample Sets is a Data row');
    t.equal(sectionOf('ZAxisTitle'), 'text', 'sections', 'and the depth axis name is a Text row');

    // ---------------------------------------------------------------- the toolbox and the help
    const chartGroup = TOOLBOX_CATEGORIES.find((cat) => (cat.group || '').toLowerCase().includes('chart'));
    const entry = controlsForGroup(chartGroup.group).find((c) => c.tag === TAG);
    t.ok(!!entry, 'toolbox', 'the waterfall can be dragged from the Charts category');
    t.equal(entry.label, 'Waterfall', 'toolbox', 'and is labelled "Waterfall"');
    const help = controlInfoFor(TAG);
    t.ok(help && help.label === 'Waterfall' && help.use.length > 400, 'help',
        'it has help text, and it is a real explanation', `${help ? help.use.length : 0} chars`);
    for (const phrase of ['Sample Sets', 'Ribbon', 'Heat', 'Split', 'Connectors', 'Max Points', 'Elevation',
        'Azimuth', 'DRAGGED']) {
        t.ok(help.use.includes(phrase) || help.desc.includes(phrase), 'help', `the help explains ${phrase}`);
    }

    // ---------------------------------------------------------------- the C# chart itself
    t.ok(cs.includes(`public class ${TAG} : ChartBase`), 'cs', 'the chart type exists');
    for (const contract of [
        ['protected override bool ImplicitXFromIndex => true;', 'the X axis is the sample number'],
        ['protected override bool ZeroBaseline => true;', 'zero is always on the amplitude scale'],
        ['protected override bool HasCartesianAxes => false;', 'it draws its own three axes in projection'],
        ['protected override bool SupportsCursors => false;', 'no cursors'],
        ['private protected override bool SupportsHoverReadout => true;', 'the pointer reports the sample'],
        ['AvaloniaProperty.Register<GrumpyWaterfallPlot, double[][]?>(nameof(SampleSets))', 'inline samplesets'],
        ['AvaloniaProperty.Register<GrumpyWaterfallPlot, double>(nameof(Elevation), 30d)', 'the default elevation'],
        ['AvaloniaProperty.Register<GrumpyWaterfallPlot, int>(nameof(MaxPoints), 512)', 'the thinning cap'],
        ['[TypeConverter(typeof(DoubleSetConverter))]', 'SampleSets parses one set per ";" group']
    ]) {
        t.ok(cs.includes(contract[0]), 'cs', `cs: ${contract[1]}`);
    }
    t.ok(/public sealed class DoubleSetConverter : TypeConverter/.test(cs), 'cs',
        'the sampleset converter exists as a top-level type (XAML needs to find it)');
    t.ok(/s.Split\(new\[\] \{ ';', '\\n', '\\r' \}/.test(cs), 'cs',
        'cs: the converter splits SETS on semicolons (points inside a set stay comma-separated)');

    // ONE series is one sampleset, from the chart's own YColumn and then the next column along.
    t.ok(/SpreadsheetReader\.ColumnAfter\(YColumn \?\? "C", index\)/.test(cs), 'cs',
        'cs: sampleset 1 reads column C, set 2 reads D, set 3 reads E …');
    t.ok(vb.includes('SpreadsheetReader.ColumnAfter(If(YColumn, "C"), index)'), 'vb',
        'vb: the same columns on the twin');
    for (const [lang, text] of TWINS) {
        t.ok(/\+ 1/.test(text), lang, `${lang}: the samples are numbered from 1, the way an analyser numbers them`);
    }
    t.ok(/Xs = data\.Xs\.Select\(x => x \+ 1\)\.ToArray\(\)/.test(cs), 'cs',
        'cs: the reader counts rows from 0, so the waterfall shifts them to 1…N');

    // The projection, and the painter's order that depends on it.
    t.ok(cs.includes('internal Point Project(double x, double y, double z)'), 'cs',
        'cs: the orthographic projection is one small method (turn, tip, drop the depth)');
    t.ok(/internal double Depth\(double x, double y, double z\)\s*\{\s*var depth = -x \* SinAzimuth \+ z \* CosAzimuth;\s*return y \* SinElevation - depth \* CosElevation;/.test(cs),
        'cs', 'cs: the view depth, whose SIGN decides which set is the far one');
    t.ok(/OrderBy\(i => world\.View\.Depth\(0\.5, 0\.5, world\.UnitZ\(i\)\)\)/.test(cs), 'cs',
        'cs: the traces are painted in that order — farthest first, so a near ribbon hides the rest');
    t.ok(/internal double UnitZ\(int set\) => Sets <= 1 \? Depth \/ 2 : set \/ \(double\)\(Sets - 1\) \* Depth;/.test(cs),
        'cs', 'cs: the first sampleset stands at the FRONT of the depth and the last at the back');
    t.ok(/view\.Scale = Math\.Min\(plot\.Width \/ wide, plot\.Height \/ tall\) \* Math\.Clamp\(Zoom, 0\.2, 5\)/.test(cs),
        'cs', 'cs: the picture is FITTED to the frame from the cube\'s own corners, then zoomed');

    // The mesh, the thinning and the colour modes.
    t.ok(/if \(ShowConnectors && front is not null\)/.test(cs), 'cs',
        'cs: the connectors are drawn with the set in front, so a nearer ribbon can cover them');
    t.ok(/Math\.Ceiling\(count \/ \(double\)MaxPoints\)/.test(cs), 'cs',
        'cs: MaxPoints thins by a stride');
    t.ok(/ONE stride for every set/.test(cs), 'cs',
        'cs: …and it is the SAME stride for every set, or the mesh would lean between different samples');
    t.ok(/var low = double\.IsNaN\(HeatMin\) \? \(samples\.Count > 0 \? samples\.Min\(\) : 0d\) : HeatMin;/.test(cs),
        'cs', 'cs: the heat map\'s ends default to the DATA\'s range, not the scale\'s round numbers');
    t.ok(/var up = new Point\(alongX\.Y, -alongX\.X\);/.test(cs), 'cs',
        'cs: the heat gradient is laid perpendicular to the sample axis, so its bands follow the VALUE');
    t.ok(/private static double CrossX\(double x0, double v0, double x1, double v1, double limit\)/.test(cs),
        'cs', 'cs: the Split mode cuts the trace where it crosses the threshold (linear interpolation)');
    t.ok(/DrawSplitRibbon\(context, world, set, xs, ys, opacity\)/.test(cs), 'cs',
        'cs: …and the ribbon is split into a below band and the runs above it');
    t.ok(/Math\.Clamp\(RibbonOpacity, 0, 100\) \/ 100d/.test(cs), 'cs',
        'cs: the translucent style applies the opacity to the fill');

    // ---------------------------------------------------------------- the pointer: readout and turn
    t.ok(/protected override void OnPointerPressed\(PointerPressedEventArgs e\)/.test(cs), 'cs',
        'cs: a press starts the drag');
    t.ok(/Elevation = Math\.Clamp\(_rotateElevation \+ \(position\.Y - _rotateFrom\.Y\) \* 0\.5, 2, 89\);/.test(cs),
        'cs', 'cs: dragging up/down changes the elevation, clamped to a drawable range');
    t.ok(/Azimuth = _rotateAzimuth \+ \(position\.X - _rotateFrom\.X\) \* 0\.5;/.test(cs), 'cs',
        'cs: dragging sideways turns the azimuth');
    t.ok(/Body = "X " \+ FormatReading\(best\.Sample\) \+ "   Y " \+ FormatReading\(best\.Value\)/.test(cs), 'cs',
        'cs: the readout reports the sample number and its value');
    t.ok(/var nearest = 16d;/.test(cs), 'cs',
        'cs: the pointer has to be within 16px of a sample to report it (a 2048-point trace is dense)');

    // ---------------------------------------------------------------- the twins stay twins
    for (const [token, label] of [
        ['WaterfallStyle', 'the style enum'], ['WaterfallColorMode', 'the colour-mode enum'],
        ['RibbonStyle', 'the style property'], ['ColorMode', 'the colour property'],
        ['SampleSets', 'the inline sets'], ['ConnectorStep', 'the connector spacing'],
        ['MaxPoints', 'the thinning cap'], ['Elevation', 'the elevation'], ['Zoom', 'the zoom'],
        ['WaterfallView', 'the projection'], ['WaterfallWorld', 'the data-to-picture mapping'],
        ['SupportsHoverReadout', 'the hover flag']]) {
        t.equal(count(cs, token) > 0, count(vb, token) > 0, 'parity',
            `both twins carry ${label} (${token})`);
    }
    t.equal(count(cs, 'private protected override void DrawSeriesLayer'),
        count(vb, 'Friend Overrides Sub DrawSeriesLayer'), 'parity',
        'and they override the drawing the same number of times (a mention in a comment does not count)');
    t.ok(/Private NotInheritable Class WaterfallView/.test(vb), 'vb',
        'vb: the nested projection class exists (its methods are Friend, so the chart can call them)');

    // ---------------------------------------------------------------- the staleness marker
    // The surface fill was removed from the chart, so the marker went back to `IsFilled` — the fill /
    // restore behaviour every chart gained — then to the surface chart 3D (`GrumpySurfacePlot`), and on
    // 2026-09-24 to `BandTriangle`, the surface's triangle band fill: a DRAWING change in an existing type
    // is invisible to an old copy (it kept showing the plot's backcolour through the sheet), so it moves
    // the marker like a new type or attribute does.
    const spec = bundledComponentSpecs(false).find((s) => s.kind === 'GrumpyCharts');
    const vbSpec = bundledComponentSpecs(true).find((s) => s.kind === 'GrumpyCharts');
    t.equal(spec.marker, 'CutToWindow', 'marker',
        'the marker is the newest thing an existing project needs a refresh for');
    t.equal(vbSpec.marker, spec.marker, 'marker', 'both languages use the same marker');
};
