/* T2 — the BAR and the PIE have no cursors; they report what is under the pointer instead (2026-09-22).
 *
 * The request, in the user's words: "Remove the Cursor options from the Pie/Bar chart right click menu.
 * When the mouse hovers over a slice the slice must explode (10 px) and show the slice data in the data
 * readout panel." Four answers pinned it down: a bar shows the readout on hover too (category + value),
 * the pop-out is a PROPERTY (`HoverExplode`, default 10) that adds to a slice's own `Explode`, the panel
 * shows the slice's name, its value and its share of the total, and the bar loses its cursors
 * COMPLETELY (menu entry and Properties row), not just the menu entries.
 *
 * Why cursors go: a crosshair reads a value BETWEEN two samples, which is what a line chart has; a bar is
 * one reading per category and a pie has no frame at all. The menu already had the flag that says so —
 * `SupportsCursors`, false on the pie since it was written — but `ShowChartMenu` never looked at it, so a
 * pie offered "Add cursor", "Reset cursors to the middle" and a readout position it could not draw.
 *
 * The trap these tests guard, and the reason the readout is ONE shared method: this library has already
 * shipped a "the panel is drawn twice and the two copies disagree" bug once (the cursor readout's panel
 * border and its delta hairline). `DrawCursorReadout` and the new hover readout therefore both build a
 * `ReadoutPanel` value and hand it to `DrawReadoutPanel` — so if these tests pass for the twins' bar and
 * pie, a hovered bar and a dragged cursor are described by the same drawing code by construction.
 *
 * What is NOT testable here: the hover itself needs a mouse, so no render test can produce it (the
 * designer's own preview is a still picture). That is why the geometry rules are pinned as source
 * contracts — the un-exploded centre in the hit record, the `Atan2` angle in the drawing's own degrees,
 * the `Math.Max(0, …)` clamp and the `i == _hoverSlice` pop-out — and why the numbers the panel shows
 * are pinned through the two formatters they are built from.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const charts = require('../../out/chartSeries.js');
const { XamlModel } = require('../../out/xamlModel.js');
const { propertyDefsFor, defaultFor, PROP_SECTIONS } = require('../../out/propertyCatalog.js');

const cs = fs.readFileSync(path.join(ROOT, 'resources', 'GrumpyCharts.cs'), 'utf8');
const vb = fs.readFileSync(path.join(ROOT, 'resources', 'GrumpyCharts.vb'), 'utf8');
const panel = fs.readFileSync(path.join(ROOT, 'src', 'designerPanel.ts'), 'utf8');
const TWINS = [['cs', cs], ['vb', vb]];

const count = (text, needle) => text.split(needle).length - 1;

/** A model with one chart in a Canvas, so `propertyDefsFor` has a real element to work on. */
function chartModel(tag) {
    const model = new XamlModel(`<Window xmlns="https://github.com/avaloniaui"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        xmlns:charts="using:AvaloniaCharts">
        <Canvas Name="Holder"><charts:${tag} x:Name="c1"/></Canvas>
    </Window>`);
    return model.findByName('c1');
}

const rowsFor = (tag) => propertyDefsFor(chartModel(tag)) || [];
const editorsOf = (tag) => rowsFor(tag).filter((r) => r.kind === 'button').map((r) => r.key);

module.exports = async (t) => {
    t.section('T2: the pie/bar hover readout (and the cursors they no longer have)');

    // ---------------------------------------------------------------- who has cursors, who does not
    // The TS mirror of the C# `SupportsCursors`: it drives the Properties row, the `cursorInfo` the
    // panel pushes to the webview and (indirectly, through the C#) the runtime menu.
    for (const [tag, expected] of [['GrumpyLinePlot', true], ['GrumpyXYPlot', true], ['GrumpyAreaPlot', true],
    ['GrumpyBarPlot', false], ['GrumpyPiePlot', false], ['Border', false]]) {
        t.equal(charts.supportsCursors(tag), expected, 'supports-cursors',
            `${tag} ${expected ? 'has' : 'has no'} cursors`);
    }
    t.equal(charts.isCartesianChartTag('GrumpyBarPlot'), true, 'supports-cursors',
        'the bar is still a CARTESIAN chart (it has axes, a legend and series)');
    t.equal(charts.isCartesianChartTag('GrumpyBarPlot') && !charts.supportsCursors('GrumpyBarPlot'), true,
        'supports-cursors', 'so the two questions are genuinely different ones');

    // The C# side of the same map, in both twins.
    for (const [lang, text] of TWINS) {
        const start = text.indexOf(lang === 'cs' ? 'public class GrumpyBarPlot : ChartBase'
            : 'Public Class GrumpyBarPlot');
        const rest = text.slice(start);
        // Up to the next sibling class, so the slice covers the WHOLE bar chart whatever its size.
        const end = rest.indexOf('\n    ' + (lang === 'cs' ? 'public class GrumpyAreaPlot' : 'Public Class GrumpyAreaPlot'));
        const barBody = rest.slice(0, end < 0 ? rest.length : end);
        t.ok(lang === 'cs'
            ? /protected override bool SupportsCursors => false;/.test(barBody)
            : /Protected Overrides ReadOnly Property SupportsCursors As Boolean\s*\r?\n\s*Get\s*\r?\n\s*Return False/.test(barBody),
            lang, `${lang}: the bar chart declares that it has no cursors`);
        t.ok(barBody.includes('SupportsHoverReadout'), lang,
            `${lang}: and that it reports what is under the pointer`);
        t.ok(barBody.includes('UpdateHover'), lang, `${lang}: by hit-testing the bars it drew`);
    }

    // ---------------------------------------------------------------- the Properties rows
    for (const tag of ['GrumpyLinePlot', 'GrumpyXYPlot', 'GrumpyAreaPlot']) {
        t.ok(editorsOf(tag).includes('Cursors'), 'rows', `${tag} still offers the Cursors editor`);
    }
    t.ok(!editorsOf('GrumpyBarPlot').includes('Cursors'), 'rows',
        'the bar chart no longer offers the Cursors editor (cursors gone completely)');
    t.ok(!editorsOf('GrumpyPiePlot').includes('Cursors'), 'rows', 'nor does the pie');
    for (const key of ['Series', 'Axis', 'Legend']) {
        t.ok(editorsOf('GrumpyBarPlot').includes(key), 'rows', `the bar keeps its ${key} editor`);
    }

    const pieHover = rowsFor('GrumpyPiePlot').find((r) => r.key === 'HoverExplode');
    t.ok(!!pieHover, 'rows', 'the pie has a Hover Explode row');
    t.equal(pieHover.kind, 'number', 'rows', 'and it is a number, not a dropdown');
    t.equal(pieHover.label, 'Hover Explode', 'rows', 'labelled "Hover Explode"');
    t.equal(pieHover.unit, 'px', 'rows', 'measured in px');
    t.ok(/pointer/i.test(pieHover.desc || ''), 'rows', 'and its help says it is the slice under the pointer',
        pieHover.desc);
    t.equal(defaultFor('HoverExplode'), '10', 'rows', 'Hover Explode defaults to 10 px');
    t.ok(!rowsFor('GrumpyBarPlot').some((r) => r.key === 'HoverExplode'), 'rows',
        'the BAR has no Hover Explode row: a bar does not move off its baseline');
    t.ok(!rowsFor('GrumpyLinePlot').some((r) => r.key === 'HoverExplode'), 'rows', 'nor does a line chart');

    const appearance = PROP_SECTIONS.find((s) => s.id === 'appearance');
    t.ok(appearance.keys.includes('HoverExplode'), 'rows',
        'Hover Explode is an Appearance row (it is about how the chart looks, not what it reads)');

    // The panel only sends cursor info for the charts that have cursors — nothing reads it otherwise,
    // and a stray message is how the old "Cursors" row would come back.
    t.ok(/if \(supportsCursors\(localName\(el\.tagName\)\)\) msg\.cursorInfo/.test(panel), 'rows',
        'the panel pushes cursor info only for a chart that has cursors');

    // ---------------------------------------------------------------- the runtime menu
    for (const [lang, text] of TWINS) {
        const menu = text.slice(text.indexOf(lang === 'cs' ? 'private void ShowChartMenu()'
            : 'Private Sub ShowChartMenu()'));
        const body = menu.slice(0, 4000);
        const gate = body.indexOf(lang === 'cs' ? 'if (!SupportsCursors)' : 'If Not SupportsCursors Then');
        t.ok(gate >= 0, lang, `${lang}: the chart menu asks whether this chart type has cursors`);
        const separator = body.indexOf(lang === 'cs' ? 'items.Add(new Separator());'
            : 'items.Add(New Separator())');
        t.ok(gate >= 0 && separator > gate, lang,
            `${lang}: and answers it BEFORE adding the first cursor separator`);
        const open = body.indexOf('OpenChartMenu(items)');
        t.ok(open > gate, lang, `${lang}: a chart without cursors opens the menu with just the picker`);
        t.ok(count(text, 'OpenChartMenu') === (lang === 'cs' ? 3 : 3), lang,
            `${lang}: both paths go through the one OpenChartMenu helper`);
    }

    // ---------------------------------------------------------------- the shared readout panel
    for (const [lang, text] of TWINS) {
        t.ok(count(text, 'ReadoutPanel') >= 6, lang,
            `${lang}: the panel is a value both readouts build (and one method draws)`);
        t.ok(lang === 'cs'
            ? /private void DrawReadoutPanel\(DrawingContext context, Rect plot, ReadoutPanel panel\)/.test(text)
            : /Private Sub DrawReadoutPanel\(context As DrawingContext, plot As Rect, panel As ReadoutPanel\)/.test(text),
            lang, `${lang}: DrawReadoutPanel draws it once, for both paths`);
        t.ok(lang === 'cs'
            ? /private void DrawHoverReadout\(DrawingContext context, Rect plot\)/.test(text)
            : /Private Sub DrawHoverReadout\(context As DrawingContext, plot As Rect\)/.test(text),
            lang, `${lang}: and DrawHoverReadout is the hover path into it`);
        t.equal(lang === 'cs' ? count(text, 'private protected virtual bool SupportsHoverReadout')
            + count(text, 'private protected override bool SupportsHoverReadout')
            : count(text, 'Friend Overridable ReadOnly Property SupportsHoverReadout')
            + count(text, 'Friend Overrides ReadOnly Property SupportsHoverReadout'), 4, lang,
            `${lang}: the flag is DECLARED once and overridden by the bar, the pie and the waterfall `
            + '(doc references aside)');
        t.ok(count(text, 'UpdateHover') >= 4, lang,
            `${lang}: UpdateHover is declared, called on mouse move and overridden twice`);
        t.ok(lang === 'cs'
            ? /if \(SupportsHoverReadout\) DrawHoverReadout\(context, plot\);/.test(text)
            : /If SupportsHoverReadout Then DrawHoverReadout\(context, plotRect\)/.test(text),
            lang, `${lang}: Render draws the hover readout last (it is a tooltip)`);
        t.ok(lang === 'cs'
            ? /protected override void OnPointerExited\(PointerEventArgs e\)/.test(text)
            : /Protected Overrides Sub OnPointerExited\(e As PointerEventArgs\)/.test(text),
            lang, `${lang}: leaving the chart is handled at all (nothing used to clear a hover)`);
    }
    // A readout must not outlive what it describes.
    for (const [lang, text] of TWINS) {
        const noData = text.slice(text.indexOf(lang === 'cs' ? '_lastPlotCount == 0' : '_lastPlotCount = 0'));
        t.ok(noData.slice(0, 400).includes('ClearHover()'), lang,
            `${lang}: a chart that draws nothing clears a readout left over from before`);
    }

    // ---------------------------------------------------------------- the pie's hover geometry
    for (const [lang, text] of TWINS) {
        t.ok(/AvaloniaProperty\.Register<GrumpyPiePlot, double>\(nameof\(HoverExplode\), 10d\)/.test(text)
            || /AvaloniaProperty\.Register\(Of GrumpyPiePlot, Double\)\(NameOf\(HoverExplode\), 10\.0R\)/.test(text),
            lang, `${lang}: HoverExplode is a real styled property defaulting to 10`);
        t.ok(lang === 'cs' ? /i == _hoverSlice/.test(text) : /i = _hoverSlice/.test(text), lang,
            `${lang}: the slice under the pointer is the one that pops out`);
        t.ok(/Math\.Max\(0, HoverExplode\)/.test(text), lang,
            `${lang}: a negative HoverExplode cannot pull a slice IN (clamped at 0)`);
        t.ok(/Centre = centre/.test(text) || /\.Centre = centre,/.test(text), lang,
            `${lang}: the hit record keeps the PIE's centre, not the exploded one — so a slice that has`);
        t.ok(/Math\.Atan2\(dy, dx\)/.test(text), lang,
            `${lang}: just popped out stays under the pointer (the angle is tested the same way)`);
        t.ok(/relative <= hit\.To - hit\.From/.test(text) || /relative <= hit\.\[To\] - hit\.From/.test(text),
            lang, `${lang}: the wedge test is "inside this wedge's own two edges" (the gap belongs to none)`);
        t.ok(/distance < hit\.Inner/.test(text), lang,
            `${lang}: and a doughnut's hole is not part of any slice`);
    }
    // The pop-out ADDS to the slice's own Explode (the user's choice): a slice already pushed out by the
    // Slices editor goes further while the pointer is over it, instead of being pulled back to 10.
    t.ok(/\?\? 0d;\s*\r?\n\s*if \(i == _hoverSlice\) explode \+= Math\.Max\(0, HoverExplode\)/.test(cs)
        || /explode \+= Math\.Max\(0, HoverExplode\)/.test(cs), 'cs',
        'cs: the hover pop-out is added to the slice\'s own Explode');
    t.ok(/push \+= Math\.Max\(0, HoverExplode\)/.test(vb), 'vb',
        'vb: the same addition, on the twin\'s own local');

    // ---------------------------------------------------------------- what the panel says
    // The numbers are built from two formatters, so the format is testable without a mouse:
    // `FormatReading` trims trailing zeros, `FormatShare` is one decimal plus the percent sign.
    for (const [lang, text] of TWINS) {
        t.ok(/value\.ToString\("0\.####", CultureInfo\.CurrentCulture\)/.test(text), lang,
            `${lang}: a reading trims its trailing zeros`);
        t.ok(/FormatNumber\(share, 0\.1\) & " %"/.test(text) || /FormatNumber\(share, 0\.1\) \+ " %"/.test(text),
            lang, `${lang}: a share is one decimal and a percent sign`);
        t.ok(/FormatNumber\(share, 0\.1\)/.test(text), lang,
            `${lang}: shares do not go through CursorDecimals (a pie has no cursor to set it)`);
    }
    t.ok(/Body = FormatReading\(hit\.Value\) \+ "   " \+ FormatShare\(hit\.Share\)/.test(cs), 'cs',
        'cs: a hovered slice reads "value   share %"');
    t.ok(/\.Body = FormatReading\(hit\.Value\) & "   " & FormatShare\(hit\.Share\)/.test(vb), 'vb',
        'vb: the same, on the twin');
    t.ok(/Head = hit\.Title,/.test(cs) && /\.Head = hit\.Title,/.test(vb), 'both',
        'the head line is the slice\'s own name, in the slice\'s own colour');
    t.ok(/HeadColor = hit\.Fill,/.test(cs) && /\.HeadColor = hit\.Fill,/.test(vb), 'both',
        'so a hovered slice and its panel are unmistakably the same thing');
    t.ok(/FollowPointer = true/.test(cs) && /\.FollowPointer = True/.test(vb), 'both',
        'and the panel follows the pointer, because that is where the element is');

    // The bar: the CATEGORY is the head line, the value the body, and the series only when the chart
    // draws more than one (with one series a name would be noise).
    t.ok(/Head = hit\.Category,/.test(cs) && /\.Head = hit\.Category,/.test(vb), 'both',
        'a hovered bar reads its category');
    t.ok(/seriesDrawn > 1 \? LegendName\(p, s\) : string\.Empty/.test(cs)
        && /If\(seriesDrawn > 1, LegendName\(p, s\), String\.Empty\)/.test(vb), 'both',
        'and names the series only when there is more than one to tell apart');
    t.ok(/Value = p\.Data\.Ys\[i\],/.test(cs) && /\.Value = p\.Data\.Ys\(i\),/.test(vb), 'both',
        'the value is the series\' own, not the height a stacked bar reaches');
    t.ok(/hit\.Rect\.Contains\(point\)/.test(cs) && /hit\.Rect\.Contains\(point\)/.test(vb), 'both',
        'the bar test is the rectangle the last render drew');
    t.ok(/for \(var i = _barHits\.Count - 1; i >= 0; i--\)/.test(cs)
        && /For i = _barHits\.Count - 1 To 0 Step -1/.test(vb), 'both',
        'tested back to front, so the topmost of two that overlap wins');
    t.ok(/i < p\.Data\.Labels\.Length && !string\.IsNullOrWhiteSpace\(p\.Data\.Labels\[i\]\)/.test(cs), 'cs',
        'a category falls back to its X number when the column has no text');

    // ---------------------------------------------------------------- the twins stay twins
    t.equal(count(cs, 'SupportsHoverReadout'), count(vb, 'SupportsHoverReadout'), 'parity',
        'both twins mention the hover flag the same number of times');
    t.equal(count(cs, 'HoverExplode'), count(vb, 'HoverExplode'), 'parity',
        'and the same for HoverExplode (property, default and drawing)');
    const csHits = count(cs, '_sliceHits') + count(cs, '_barHits');
    const vbHits = count(vb, '_sliceHits') + count(vb, '_barHits');
    t.equal(csHits, vbHits, 'parity', 'and their hit lists are used the same number of times');
};
