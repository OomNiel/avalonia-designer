/* T2 — the SURFACE CHART 3D (2026-09-23): a corrugated sheet drawn as a real surface — the seventh chart
 * type, and the first whose geometry is a GRID rather than a family of traces.
 *
 * The request: "create a new graph style named 'Surface Chart 3D' … The data set consists of several series,
 * one for each Y value. Each set of Y data represents a collection of X/Y data pairs … For each X value, a Y
 * value specify the 'height' of the corrugation … The Z values increase from 0 (the near edge) to a max
 * value (the far end) … options to show the surface as a Gridmesh, Gridmesh plus Solid, and Solid. The
 * colouring … selectable including temperature settings with high and low colors."
 *
 * The four decisions that fix its shape, all pinned here:
 *   - ONE SHARED X COLUMN (the width positions) and one Y column per series (a slice along the length), so
 *     the quads are real sheet quads and the Series editor works unchanged — it is a SERIES chart but NOT a
 *     cartesian one (three projected axes, no Axis editor, no cursors);
 *   - THE Z OF A SLICE COMES FROM THE SPREADSHEET (the series' own column, in Z Row), with Z Start / Z Step
 *     numbering it only when that cell is not a number, and the DEPTH of a slice follows its Z VALUE;
 *   - three styles (GridMesh / GridMeshSolid / Solid) and two colourings (one per slice, or a temperature
 *     ramp by height from Low Color to High Color, with Heat Min/Heat Max pinning that range);
 *   - the RANGE WINDOW is the legend of a surface: MinX/MaxX (width) and MinY/MaxY (height) cut the picture
 *     and the view is ALWAYS re-fitted to the window, so a selection zooms instead of shrinking the sheet.
 *
 * Why the source contracts matter: the picture itself is measured in tests/t1-preview/surfaceRender.test.js;
 * what this file pins is that the wiring cannot silently drift — the tags, the rows, the defaults, both
 * twins, the toolbox, the VB namespace list, the host's type map and the staleness marker.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');

const ROOT = path.join(__dirname, '..', '..');
const charts = require('../../out/chartSeries.js');
const { CHARTS_TAGS } = require('../../out/xamlModel.js');
const { propertyDefsFor, defaultFor } = require('../../out/propertyCatalog.js');
const { controlInfoFor } = require('../../out/controlInfo.js');
const { controlsForGroup, TOOLBOX_CATEGORIES } = require('../../out/toolboxProvider.js');
const { bundledComponentSpecs } = require('../../out/bundledComponents.js');

const cs = fs.readFileSync(path.join(ROOT, 'resources', 'GrumpyCharts.cs'), 'utf8');
const vb = fs.readFileSync(path.join(ROOT, 'resources', 'GrumpyCharts.vb'), 'utf8');
const factory = fs.readFileSync(path.join(ROOT, 'host', 'ControlFactory.cs'), 'utf8');
const TWINS = [['cs', cs], ['vb', vb]];
const TAG = 'GrumpySurfacePlot';

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"'
    + ' xmlns:charts="using:AvaloniaCharts"';
/** The Properties rows are computed from the ELEMENT, so the tag has to be parsed like the designer does. */
function elFrom(xml) {
    const doc = new DOMParser().parseFromString(`<root ${NS}>${xml}</root>`, 'text/xml');
    for (let i = 0; i < doc.documentElement.childNodes.length; i++) {
        const c = doc.documentElement.childNodes.item(i);
        if (c.nodeType === 1) return c;
    }
    return undefined;
}
const count = (text, needle) => text.split(needle).length - 1;
/** The class body, from its declaration to the end of the file (the C# spells it `class`, VB `Class`). */
const bodyOf = (text) => {
    const at = text.search(new RegExp(`class ${TAG}\\b`, 'i'));
    return at < 0 ? '' : text.slice(at);
};

module.exports = (t) => {
    t.section('T2: the surface chart 3D — a sheet drawn as a grid, not as traces');

    // ---------------------------------------------------------------- the control exists in both twins
    for (const [lang, text] of TWINS) {
        t.ok(new RegExp(`class ${TAG}\\b`, 'i').test(text), lang, `${lang}: the ${TAG} type is there`);
    }

    // ---------------------------------------------------------------- its own properties, in both twins
    // Every one of them is what makes the chart usable: the data (Values/SampleSets/MaxPoints), what it is
    // made of (Style, the two colourings and their ramp ends, the mesh), where the slices stand (ZRow,
    // ZStart, ZStep), how it is seen (Elevation, Azimuth, ZSpacing, Zoom) and how big its axes are drawn
    // (ZoomX/ZoomY, the axis zoom) — the depth axis's title (ZAxisTitle) aside.
    const OWN = ['Values', 'SampleSets', 'Style', 'ColorBy', 'LowColor', 'HighColor', 'HeatMin', 'HeatMax',
        'SolidOpacity', 'MeshColor', 'MeshThickness', 'ZRow', 'ZStart', 'ZStep', 'MaxPoints', 'Elevation',
        'Azimuth', 'ZSpacing', 'Zoom', 'ZoomX', 'ZoomY', 'ZAxisTitle'];
    for (const [lang, text] of TWINS) {
        const body = bodyOf(text);
        for (const name of OWN) {
            const property = lang === 'cs' ? `${name}Property` : `${name}Property As`;
            t.ok(body.includes(property), lang, `${lang}: ${TAG}.${name} is registered`);
        }
        t.ok(body.includes('SurfaceStyle'), lang, `${lang}: the style enum is the chart\'s own`);
        t.ok(body.includes('SurfaceColorMode'), lang, `${lang}: so is the colour-by enum`);
    }
    // Parity: the two twins must carry the SAME property names, or a form that compiles in one language
    // does not compile in the other.
    const names = (text, lang) => OWN.filter((n) =>
        bodyOf(text).includes(lang === 'cs' ? `${n}Property` : `${n}Property As`));
    t.equal(names(cs, 'cs').join(','), names(vb, 'vb').join(','), 'parity',
        'both twins register exactly the same properties');

    // ---------------------------------------------------------------- the two enumerations
    const styles = ['GridMesh', 'GridMeshSolid', 'Solid'];
    for (const [lang, text] of TWINS) {
        for (const value of styles) {
            t.ok(text.includes(value), lang, `${lang}: the style enum has ${value}`);
        }
        t.ok(/SurfaceColorMode[\s\S]{0,900}?Sampleset[\s\S]{0,600}?Temperature/.test(text), lang,
            `${lang}: the colour-by enum is Sampleset or Temperature (the ramp)`);
    }
    t.equal(defaultFor('Style'), 'GridMeshSolid', 'defaults',
        'a dropped chart starts as the classic surface: mesh over a solid');
    t.equal(defaultFor('ColorBy'), 'Temperature', 'defaults',
        'and is coloured by height, because that is what a surface is read for');
    t.equal(defaultFor('LowColor'), '#1B2A6B', 'defaults', 'the ramp starts at the family\'s dark blue');
    t.equal(defaultFor('HighColor'), '#E53935', 'defaults', 'and ends at its hot red');
    t.equal(defaultFor('SolidOpacity'), '100', 'defaults', 'the sheet is opaque metal by default');
    t.ok(defaultFor('ZRow') === '' && defaultFor('ZStep') === '1', 'defaults',
        'Z is numbered 0, 1, 2 … unless the sheet says otherwise (Z Row empty means the Names Row)',
        `ZRow=${String(defaultFor('ZRow'))} ZStep=${String(defaultFor('ZStep'))}`);

    // ---------------------------------------------------------------- the drawing
    for (const [lang, text] of TWINS) {
        const body = bodyOf(text);
        // One shared X column for the whole chart: every slice is read with the SAME X column, which is what
        // makes the slices line up into a grid.
        t.ok(/ReadSlice|Sampleset/.test(body), lang, `${lang}: one slice per series is read`);
        // The bands: one between each pair of neighbouring slices, painted from the far end to the near one.
        t.ok(body.includes('BandGeometry'), lang, `${lang}: a band's geometry is built per pair of slices`);
        t.ok(/OrderBy\([\s\S]{0,120}?Depth\(0\.5, 0\.5, slices/.test(body) || /OrderBy\([\s\S]{0,140}?Depth\(0\.5, 0\.5, slices/.test(body),
            lang, `${lang}: the bands are sorted far-to-near, so a nearer fold hides the sheet behind it`);
        // The mesh is its own colour and thickness (the floor's gridlines stay GridColor).
        t.ok(/MakePen\(MeshColor, MeshThickness/.test(body), lang,
            `${lang}: the mesh lines take Mesh Colour and Mesh Thickness, not the floor's grid rows`);
        // The three modes really gate the two halves of the drawing.
        t.ok(/Style (is not|<>)\s*SurfaceStyle\.GridMesh/.test(body) || /Style (is not|<>)\s*SurfaceStyle\.GridMesh/.test(body),
            lang, `${lang}: GridMesh mode draws the mesh and NO solid`);
        t.ok(/Style (is not|<>)\s*SurfaceStyle\.Solid/.test(body), lang,
            `${lang}: and Solid mode draws the solid and NO mesh`);
        // The temperature ramp is a function of the HEIGHT VALUE and of nothing else: each drawn triangle is
        // CUT on the ramp's own levels and every piece is filled with its level's colour. A brush cannot do
        // that — it only knows where a pixel is, and on a tipped cube the screen position mixes a point's
        // height with how far back it stands (moving along the eye ray changes the height without moving the
        // pixel). One gradient per band therefore coloured one height differently from slice to slice, by
        // tan(Elevation) of the ramp: reported 2026-09-24 from the running app, where a three-slice window
        // shaded its own plateau two different greys while the designer (built from this file) looked right.
        t.ok(/RampSteps\(world, slices\.Count - 1, rampLow, rampHigh\)/.test(body), lang,
            `${lang}: the ramp is drawn in levels sized from the sheet's own screen height`);
        t.ok(/CutToLevels\(/.test(body), lang,
            `${lang}: the band's triangles are cut on those levels, so the colour follows the VALUE`);
        t.ok(/Blend\(LowColor, HighColor, \(level \+ 0\.5\) \/ levels\)/.test(text), lang,
            `${lang}: each level takes the ramp's colour at its middle, between LowColor and HighColor`);
        t.ok(/ClipHalf\(/.test(body), lang,
            `${lang}: and the cut is a real polygon clip, which is what puts the level line exactly on the value`);
        // The ramp's own MAXIMUM is the LAST level, not one past it: without that clamp a triangle sitting
        // exactly at the top produced first = levels against last = levels - 1 and was never filled, which is
        // how a crest plateau at the data's maximum came out with its tops open (2026-09-24).
        t.ok(lang === 'cs' ? /var top = levels - 1e-9;/.test(body) : /Dim top = levels - 0\.000000001/.test(body), lang,
            `${lang}: a height at or above the ramp's top is clamped into the last level`);
        t.ok(lang === 'cs'
            ? /Math\.Clamp\(\(y0 - low\) \/ span \* levels, 0d, top\)/.test(body)
            : /Math\.Clamp\(\(y0 - low\) \/ span \* levels, 0\.0, top\)/.test(body), lang,
            `${lang}: and the clamp is applied to the height field itself, so no triangle can fall outside`);
        t.ok(/Math\.Clamp\(levels, 8, /.test(body), lang,
            `${lang}: the level count is bounded, so a sheet of many slices cannot flood the fill list`);
        const def = lang === 'cs' ? 'private void DrawTemperatureFill' : 'Private Sub DrawTemperatureFill';
        const fill = body.slice(body.indexOf(def), body.indexOf(def) + 3000);
        t.ok(fill.length > 500, lang, `${lang}: the fill has a body of its own to check`);
        t.ok(/Project\(/.test(fill) === false, lang,
            `${lang}: the fill never asks where a point is on the SCREEN — that is what made it depth-dependent`);
        t.ok(/TemperatureBrush/.test(text) === false, lang,
            `${lang}: no per-band gradient is left anywhere (that was the shape that mixed in the depth)`);
        // The window: the axis scales come from the chart's own fixed-scale rows, so a window is an
        // auto-zoom, and the drawing is clipped to the plot box so it is a cut, not an overflow.
        t.ok(/AxisRange\.Over\([\s\S]{0,60}?MinX, MaxX/.test(text), lang,
            `${lang}: the WIDTH window comes from MinX/MaxX (the range window of a surface)`);
        t.ok(/AxisRange\.Over\([\s\S]{0,60}?MinY, MaxY/.test(text), lang,
            `${lang}: and the HEIGHT window from MinY/MaxY`);
        t.ok(/PushClip\(plot\)/.test(body), lang,
            `${lang}: the surface is clipped to the plot box, so a window is a real cut`);
        // The fit uses the cube's corners, which is why narrowing the window zooms rather than shrinks.
        t.ok(/foreach \(var x in new\[\] \{ 0d, 1d \}\)|For Each x In \{0\.0, 1\.0\}/.test(body), lang,
            `${lang}: the view is fitted from the unit cube's own corners`);
        // Drag to turn.
        t.ok(/OnPointerMoved[\s\S]{0,400}?Azimuth = /.test(body) || /OnPointerMoved[\s\S]{0,400}?Azimuth =/.test(body),
            lang, `${lang}: dragging turns the sheet (azimuth sideways, elevation up and down)`);
        // The Z of a slice comes from the spreadsheet.
        t.ok(/RowNumbers/.test(body), lang, `${lang}: the Z row of the sheet is read for the slice positions`);
        t.ok(/ZStart \+ i \* ZStep/.test(body), lang,
            `${lang}: and slices are numbered from Z Start / Z Step when the sheet does not say`);
        t.ok(/UnitZOf/.test(body), lang,
            `${lang}: a slice's DEPTH follows its Z value, so unevenly spaced slices stand apart properly`);
        // One stride for every slice, so the quads join like to like.
        t.ok(/MaxPoints/.test(body), lang, `${lang}: Max Points thins every slice on ONE stride`);
    }
    t.ok(count(cs, 'RowNumbers') === count(vb, 'RowNumbers'), 'parity',
        'both twins read the Z row the same number of times');
    t.ok(/Friend Shared Function RowNumbers/.test(vb) && /internal static Dictionary<string, double> RowNumbers/.test(cs),
        'reader', 'and both readers have it, so the runtime chart (not just the designer) can read Z');

    // ---------------------------------------------------------------- the wiring: tags, toolbox, help
    t.ok(charts.isChartTag(TAG), 'tags', 'the toolbox knows it as a chart');
    t.ok(!charts.isCartesianChartTag(TAG), 'tags',
        'but NOT as a cartesian one: its three axes are drawn in projection (no Axis editor, no cursors)');
    t.ok(charts.isSeriesChartTag(TAG), 'tags',
        'while still a SERIES chart — one series is one slice, so the Series editor drives it');
    t.ok(CHARTS_TAGS.includes(TAG), 'tags', 'the XAML model knows the tag');
    t.ok(charts.seriesTagFor(TAG) === 'XYSeries', 'tags',
        'its series elements are X/Y PAIRS (XYSeries), never a bare value list: one slice is one set of pairs');
    const toolbox = controlsForGroup(TOOLBOX_CATEGORIES.charts ?? 'Charts');
    t.ok(toolbox.some((c) => c.tag === TAG), 'toolbox', 'the Charts group offers it');
    const info = controlInfoFor(TAG);
    t.ok(info && info.label === 'Surface Chart 3D', 'help', 'the help panel names it Surface Chart 3D');
    t.ok(info && info.use.length > 600, 'help', 'and explains the whole workflow',
        `${info?.use?.length} characters`);

    // Every property the chart has must be reachable in the Properties panel, or it cannot be set.
    const rows = propertyDefsFor(elFrom(`<charts:${TAG} x:Name="c1"/>`));
    t.ok(rows.length > 40, 'rows', 'the panel has its rows', `${rows.length} rows`);
    for (const key of ['Style', 'ColorBy', 'LowColor', 'HighColor', 'HeatMin', 'HeatMax', 'SolidOpacity',
        'MeshColor', 'MeshThickness', 'ZRow', 'ZStart', 'ZStep', 'MinX', 'MaxX', 'MinY', 'MaxY',
        'XColumn', 'YColumn', 'Elevation', 'Azimuth', 'ZSpacing', 'Zoom', 'ZoomX', 'ZoomY']) {
        t.ok(rows.some((r) => r.key === key), 'rows', `the panel can set ${key}`);
    }
    const colorBy = rows.find((r) => r.key === 'ColorBy');
    t.equal((colorBy?.options ?? []).join(','), 'Sampleset,Temperature', 'rows',
        'Colour By offers exactly the two colourings the control supports');
    const style = rows.find((r) => r.key === 'Style');
    t.equal((style?.options ?? []).join(','), 'GridMesh,GridMeshSolid,Solid', 'rows',
        'Style offers exactly the three surface modes');

    // ---------------------------------------------------------------- the band FILL cannot cancel itself
    // Reported 2026-09-23: "as soon as two solid shaded areas overlap, they negate each other to show a black
    // area where they overlap" — and again from the RUNNING APP on 2026-09-24, where a sheet whose bands
    // overlap showed the chart's own backcolour THROUGH them while the designer looked right. Four rules keep
    // the sheet solid, and all four must hold in both twins. The first two are about a band's own fill (the
    // Sampleset colouring fills a whole band at once; the Temperature colouring cuts its triangles into ramp
    // levels, see above, and each level's pieces follow the same winding rule):
    //   - NON-ZERO winding, so the overlapping triangles a fold makes ADD instead of cancelling (the default
    //     even-odd rule fills a doubly-covered region as a hole);
    //   - ONE TRIANGLE PAIR per adjacent sample pair — never a quad, never a ribbon: a figure whose outline
    //     crosses itself has two loops wound OPPOSITE ways, so NonZero sums them to zero and drops the fill,
    //     and that hole is the plot's backcolour showing through. A triangle cannot cross itself;
    //   - WINDING NORMALISATION (`BandTriangle`, and `AddPolygon` for a level's cut pieces): every piece
    //     takes its band's (or its level's) first winding sign, so the pieces a fold overlaps accumulate
    //     winding ±2 rather than cancelling each other;
    //   - and the fill is drawn WITH a hairline outline of its own brush, so neighbouring bands — separate
    //     draw calls — cannot show the background through their shared edge.
    // A 2D crossing scan used to be computed here and never used; it cost O(samples²) per band (measured
    // 2026-09-24: 27 ms → 966 ms for one 6 × 2048-point sheet, per render) and is gone.
    for (const [lang, text] of TWINS) {
        t.ok(/SetFillRule\(FillRule\.NonZero\)/.test(text), lang,
            `${lang}: the band fill uses the non-zero winding rule`);
        t.ok(/FlushRun|void Flush\(\)/.test(text), lang,
            `${lang}: and emits the fill per unbroken run of samples`);
        // The band's own geometry builder (the mesh AND the Sampleset fill) — taken from its DEFINITION, so
        // the window of text below is about it and not about the temperature fill that now sits above it.
        const band = text.slice(text.lastIndexOf('BandGeometry'), text.lastIndexOf('BandGeometry') + 5000);
        t.ok(/BandTriangle\(/.test(band), lang,
            `${lang}: each sample pair becomes TWO TRIANGLES — a shape that cannot cross itself, so no fold can cancel it`);
        t.ok(/crossings/.test(band) === false, lang,
            `${lang}: and the unused O(n²) crossing scan is gone (it was computed and never used)`);
        t.ok(/new Pen\(brush, 1\)|New Pen\(brush, 1\)/.test(text), lang,
            `${lang}: the fill is outlined in its own brush, so neighbouring bands share no seam`);
    }
    // The triangle helper is what an older copy of the bundled file lacks, so it is the marker too.
    t.ok(/BandTriangle\(g, a, b, d, want\)/.test(cs) && /BandTriangle\(g, b, c, d, want\)/.test(cs), 'cs',
        'C#: the pair is split by the b–d diagonal, both corners wound the way the band started');
    t.ok(/want = BandTriangle\(g, a, b, d, want\)/.test(vb) && /want = BandTriangle\(g, b, c, d, want\)/.test(vb), 'vb',
        'VB: the same two corners, in the same order');

    t.ok(factory.includes('["GrumpySurfacePlot"]'), 'host',
        'the host has a type-map entry — without it the XAML loader silently drops the element'); t.ok(/\["GrumpySurfacePlot"\] = n =>/.test(factory), 'host',
            'and a snippet, so a dropped chart shows something without a workbook');

    // ---------------------------------------------------------------- the slice slider counts slices
    // Requested (2026-09-25): "the second slider must be for the Z value (the number of series)", then
    // "Number of series: 'slices 1–9 of 55' — dragging it wider always adds whole slices". So the slider is
    // stepped: it walks the SLICE POSITIONS, snaps a window onto the nearest of them (so the picture, the
    // depth scale and the numbers always agree, and a typed window can never leave a slice half shown), and
    // its label COUNTS the slices instead of naming a span of Z values, because "Z 0 … 9" of a sheet sliced
    // every 5 is two slices out of fifty-five and reads as a mystery.
    for (const [lang, text] of TWINS) {
        const surface = bodyOf(text);
        t.ok(/RangeSteps\(/.test(text), lang,
            `${lang}: the base offers a hook for an axis made of DISCRETE positions (whole slices)`);
        t.ok(/RangeSteps\(axis\)/.test(surface) && /_sliceSteps/.test(surface), lang,
            `${lang}: the surface answers it with its own slice positions`);
        t.ok(/_sliceSteps\.AddRange\(/.test(surface) && /Distinct\(\)/.test(surface), lang,
            `${lang}: those positions are cached in order and without repeats when the slices are read`);
        t.ok(/SnapToSlice\(/.test(surface), lang,
            `${lang}: a window end is snapped to a slice, so the sheet is always cut between slices`);
        t.ok(/of \{steps\.Count\}/.test(text), lang,
            `${lang}: the label counts the slices ("Z 3…9 of 55"), which is what the slider chooses`);
        t.ok(/\(steps\.Count - 1\)\)/.test(text), lang,
            `${lang}: and a drag lands on a slice INDEX, so it can only add or drop whole slices`);
    }

    // ---------------------------------------------------------------- the solid block under the sheet
    // Asked for (2026-09-23): "put a solid non-transparent block at the bottom of the mesh reaching to the
    // floor. Add a setting to enable/disable the block and set its colour." So the sheet can stand on a
    // BLOCK: the space under it filled down to the floor, off by default (it changes the picture), with its
    // own flat opaque colour, and drawn whatever the sheet's own style is — the MESH style has no fill of
    // its own, which is exactly the picture the block is meant to stand under.
    for (const [lang, text] of TWINS) {
        const surface = bodyOf(text);
        t.ok(/ShowBaseProperty/.test(surface), lang, `${lang}: the block has an on/off property`);
        t.ok(/ShowBase[\s\S]{0,120}?,\s*(false|False)\)/.test(surface), lang,
            `${lang}: and it defaults OFF — the block changes the picture, so it is asked for`);
        t.ok(/BaseColorProperty/.test(surface) && /Color\.Parse\("#3C3C3C"\)/.test(surface), lang,
            `${lang}: and a colour of its own, with a neutral default`);
        t.ok(/ShowBaseProperty, BaseColorProperty\)/.test(text), lang,
            `${lang}: both are wired into AffectsRender, so changing either repaints`);
        t.ok(/BaseEndGeometry/.test(surface) && /BaseSideGeometry/.test(surface), lang,
            `${lang}: the block is the two END faces of the sheet and the two SIDES of every band`);
        // The end face is built from simple quads: a ribbon whose outline folds would cancel into a hole
        // straight through the block (the same trap the sheet's own bands are built to avoid).
        const end = surface.slice(surface.indexOf('BaseEndGeometry'));
        t.ok(!/Flush\(|EndFigure\(false\)/.test(end.slice(0, 2200)), lang,
            `${lang}: the end faces are simple quads, never a foldable ribbon`);
        t.ok(/If ShowBase Then|if \(ShowBase\)/.test(surface), lang,
            `${lang}: and the block is drawn OUTSIDE the sheet's style guard (the mesh style has no fill)`);
    }
    // The Properties panel offers both as settings.
    const surfaceEl = elFrom(`<charts:${TAG}/>`);
    const keys = propertyDefsFor(surfaceEl).map((r) => r.key);
    t.ok(keys.includes('ShowBase') && keys.includes('BaseColor'), 'catalog',
        'the Properties panel lists the block and its colour');
    t.equal(defaultFor('ShowBase'), 'False', 'catalog', 'the block row starts off');
    t.equal(defaultFor('BaseColor'), '#3C3C3C', 'catalog', 'and the colour row has the control\'s own default');

    // ---------------------------------------------------------------- the width window is a CUT, not a squeeze
    // Reported from the running app on 2026-09-24: dragging the X slider grew "two panels at either end …
    // stationary while changing the range of the x-axes", which the designer never showed. The cause was the
    // clamp in SurfaceWorld.UnitX — a sample outside the window is drawn AT the window's edge, so each slice's
    // off-window samples collapsed into a vertical line there and the band fill between two slices became a
    // flat slab, i.e. a false panel pinned to the edge. The samples are now CUT to the window first, with the
    // window's own edges interpolated so the sheet still ends exactly on the edge.
    for (const [lang, text] of TWINS) {
        const surface = bodyOf(text);
        t.ok(/CutToWindow\(/.test(surface), lang, `${lang}: a slice's samples are CUT to the width window`);
        t.ok(/CutToWindow\(p\.Data\.Xs, p\.Data\.Ys, world\.Xs\.Min, world\.Xs\.Max\)/.test(surface), lang,
            `${lang}: and the slice is built from that cut, so nothing outside the window reaches the picture`);
        t.ok(/AddCrossing\(/.test(surface), lang, `${lang}: the window's own edges are interpolated into the cut`);
        t.ok(/must not reach the picture/.test(surface), lang, `${lang}: with the reason written down`);
    }

    // ---------------------------------------------------------------- the AXIS ZOOM resizes the axes, it does
    // not re-range them
    // "please introduce a Zoom function for the X and Y axes. Zoom does not mean a range change, but an actual
    // zooming of the X/Y axes size keeping the range settings unchanged." That promise is made in one place:
    // an axis VALUE maps to its 0…1 unit position FIRST and is magnified only after that, so MinX/MaxX — and
    // with them every tick label and slider — never see the zoom at all. Magnifying about the MIDDLE is what
    // keeps the picture centred on what it was looking at instead of pushing it out of one corner.
    for (const [lang, text] of TWINS) {
        const surface = bodyOf(text);
        const maps = lang === 'cs'
            ? /UnitX\(double x\) => About\(Clamp01\(/
            : /Function UnitX\(x As Double\)[\s\S]{0,200}?About\(Clamp01\(/;
        t.ok(maps.test(surface), lang,
            `${lang}: the axis range maps to 0…1 first and is magnified only after that, so a zoom cannot
             move a range`);
        t.ok(/0\.5 \+ \(unit - 0\.5\) \* factor/.test(surface), lang,
            `${lang}: an axis is magnified about the MIDDLE of its fitted size, not about one end`);
        t.ok(/Math\.Clamp\(ZoomX, MinZoomPercent, MaxZoomPercent\) \/ 100/.test(surface), lang,
            `${lang}: X Axis Zoom % is a percentage of the FITTED size, 1…100 (a bigger picture would only be\n             clipped by the plot box, so 100 is the top of the scale)`);
        t.ok(/Math\.Clamp\(ZoomY, MinZoomPercent, MaxZoomPercent\) \/ 100/.test(surface), lang,
            `${lang}: and so is Y Axis Zoom %`);
    }

    // ---------------------------------------------------------------- the legend carries FOUR sliders
    // "Add sliders (next to the X/Y Range sliders) in the surface plot Legend for the X and Y zoom levels
    // ranging from 1 to 100 %" — and, straight after: "place the sliders closer together - too much space
    // in between sliders". So the bar holds the two WINDOWS it already had plus a ZOOM level for each axis,
    // each in its own colour, each zoom carrying ONE handle (a window has two ends to drag, a size has one),
    // and the columns stand only as far apart as a handle needs.
    for (const [lang, text] of TWINS) {
        const surface = bodyOf(text);
        t.ok(/RangeAxisCount(?: As Integer)? = 4/.test(surface), lang,
            `${lang}: the legend lays out four sliders`);
        t.ok(/ZoomAxisFirst/.test(surface) && /IsZoomAxis/.test(surface), lang,
            `${lang}: and knows which of them size an axis instead of cutting a window`);
        t.ok(/RangeColour/.test(surface), lang,
            `${lang}: each slider gets its own colour, so four can be told apart`);
        t.ok(/IsZoomAxis\(axis\)[\s\S]{0,200}?RangeHigh\(axis\)/.test(surface), lang,
            `${lang}: a zoom slider is given ONE handle and a window both of its ends`);
        t.ok(/RangeLabelText[\s\S]{0,200}?%/.test(surface), lang,
            `${lang}: and says its percent ("X zoom 100 %")`);
        t.ok(/RangeColumn(?: As Double)? = RangeLabelRoom \+ RangeHandle \* 2 \+ 2/.test(surface), lang,
            `${lang}: a docked column is only as wide as the numbers plus the handle that has to clear its\n             track — sizing it off the row height is what left the air between the sliders`);
        t.ok(/DragRangeTo[\s\S]{0,400}?IsZoomAxis\(axis\)/.test(surface), lang,
            `${lang}: dragging a zoom slider sets that axis' percent (and nothing else)`);
    }

    // ---------------------------------------------------------------- the staleness marker
    const spec = bundledComponentSpecs(false).find((s) => s.kind === 'GrumpyCharts');
    const vbSpec = bundledComponentSpecs(true).find((s) => s.kind === 'GrumpyCharts');
    t.equal(spec.marker, 'legendItem', 'marker',
        'the marker is the height-LEVEL ramp CUT — the newest thing the shipped file has that an old copy cannot show, because a DRAWING change in an existing type is invisible to it');
    t.equal(vbSpec.marker, spec.marker, 'marker', 'both languages use the same marker');
    for (const [lang, text] of TWINS) {
        t.ok(text.includes(spec.marker), lang, `${lang}: the shipped file never looks stale`);
    }
};
