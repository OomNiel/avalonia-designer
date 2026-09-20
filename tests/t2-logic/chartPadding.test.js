/* T2 — the chart Padding property: the Properties row, both twins, and the promise that 0 (the
 * default) leaves the chart exactly as it was.
 *
 * Why this exists: the chart draws its content (the title, the legend bar and the plot area with its
 * axis furniture) inside a border, with a hard-coded 8 px gap between them. Padding is the user's own
 * space there — a plain ChartBase property, written by the Properties panel as XAML. Three things can
 * silently drift apart: the catalog row (the panel), the C#/VB property names (the render), and the
 * render's use of them (a registered property that nothing reads looks applied but changes nothing).
 * These checks pin all three, in both languages:
 *
 *   1. both charts list Padding, it is a Thickness (text kind, so "8" or "8,4,8,4"), and the chart's
 *      default is UNSET (the panel shows blank and writes nothing — the renderer's own gap stands);
 *   2. both twins declare it, register it AffectsRender, clamp negatives and expose the CLR property;
 *   3. both twins USE it: the padding band is cut out of the frame into `content`, and the legend, the
 *      title and the plot are all taken off `content` — while the plate and the border stay on the
 *      frame, so padding never shrinks the chart's own background;
 *   4. XAML round-trips it untouched (one, two or four values).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');
const { propertyDefsFor, PROP_SECTIONS, DEFAULTS } = require('../../out/propertyCatalog.js');
const { XamlModel } = require('../../out/xamlModel.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"'
    + ' xmlns:charts="using:AvaloniaCharts"';
const CHARTS = ['GrumpyLinePlot', 'GrumpyXYPlot'];
/** How many times each twin draws the frame/title (the empty-chart path and the normal one). */
const DRAW_SITES = 3;

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

function chartModel(attrs) {
    const model = new XamlModel(`<Window ${NS}><Canvas Name="Body">`
        + `<charts:GrumpyXYPlot x:Name="C1" Width="320" Height="200" ${attrs}/>`
        + `</Canvas></Window>`);
    return { model, el: model.findByName('C1') };
}

module.exports = async (t) => {
    t.section('chartPaddingModel');

    const cs = read('resources/GrumpyCharts.cs');
    const vb = read('resources/GrumpyCharts.vb');
    const host = read('host/XamlRenderer.cs');
    const chartBase = cs.slice(cs.indexOf('public abstract class ChartBase'), cs.indexOf('protected abstract ChartData InlineData'));
    t.ok(chartBase.length > 0, 'model', 'the C# ChartBase class is where the test expects it');

    // --- 1. the Properties panel row ---
    for (const tag of CHARTS) {
        const props = propertyDefsFor(elFrom(`<charts:${tag} x:Name="c1"/>`));
        const row = keyOf(props, 'Padding');
        t.ok(!!row, 'catalog', `${tag} lists a Padding row`,
            row ? `value=${JSON.stringify(row.value)}` : 'row missing');
        t.equal(row && row.kind, 'text', 'catalog',
            `${tag} Padding is a text row, so a Thickness ("8" or "8,4,8,4") can be typed`);
        t.equal(row && row.value, '', 'catalog',
            `${tag} shows an unset Padding as blank (the chart keeps its own gap)`);
        t.equal(keyOf(props, 'Padding') !== keyOf(props, 'BorderThickness'), true, 'catalog',
            `${tag} keeps Padding separate from Border Thickness`);
        // A chart that HAS a Padding reads it back as written.
        t.equal(keyOf(propertyDefsFor(elFrom(`<charts:${tag} x:Name="c1" Padding="12"/>`)), 'Padding').value,
            '12', 'read', `${tag} reads the attribute straight back`);
    }
    t.equal(DEFAULTS.Padding, '', 'default', 'Padding is unset by default (no attribute is written)');
    const sections = PROP_SECTIONS.filter((s) => s.keys.includes('Padding'));
    t.equal(sections.length, 1, 'section', 'Padding belongs to exactly one Properties group');
    t.equal(sections[0] && sections[0].id, 'layout', 'section',
        'and it is the Layout & size group, next to Margin and Border Thickness');

    // --- 2. both twins declare it ---
    t.ok(/StyledProperty<Thickness> PaddingProperty/.test(chartBase), 'cs',
        'C# declares Padding as a Thickness StyledProperty');
    t.ok(/Register<ChartBase, Thickness>\(nameof\(Padding\), default\)/.test(chartBase), 'cs',
        'C# registers it with a zero (all-sides) default');
    t.ok(/public Thickness Padding \{/.test(chartBase), 'cs', 'C# exposes the CLR property');
    t.ok(/PaddingProperty As StyledProperty\(Of Thickness\)/.test(vb), 'vb',
        'VB declares Padding as a Thickness StyledProperty');
    t.ok(/Register\(Of ChartBase, Thickness\)\(NameOf\(Padding\), New Thickness\(0\)\)/.test(vb), 'vb',
        'VB registers it with a zero default too');
    t.ok(/Public Property Padding As Thickness/.test(vb), 'vb', 'VB exposes the CLR property');

    for (const [lang, source, token] of [['cs', cs, 'PaddingProperty, CornerRadiusProperty'],
        ['vb', vb, 'PaddingProperty, CornerRadiusProperty']]) {
        t.equal(count(source, token), 1, lang, `${lang} re-renders the chart when Padding changes (AffectsRender)`);
    }
    // The negative guard: a negative padding would otherwise push the content over the border.
    t.ok(/Math\.Max\(0, Padding\.Left\), Math\.Max\(0, Padding\.Top\),/.test(cs), 'cs',
        'C# clamps the padding at 0 before using it');
    t.ok(/Math\.Max\(0, Padding\.Left\), Math\.Max\(0, Padding\.Top\),/.test(vb), 'vb',
        'VB clamps the padding at 0 too');

    // --- 3. both twins USE it ---
    t.equal(count(cs, 'var content = frame.Deflate(pad);'), 1, 'cs',
        'C# cuts the padding band out of the frame into `content`');
    t.equal(count(vb, 'Dim content = frame.Deflate(pad)'), 1, 'vb',
        'VB cuts the same band out of the frame');
    for (const [lang, source] of [['cs', cs], ['vb', vb]]) {
        t.equal(count(source, 'MeasureLegend(content.Size'), 1, lang,
            `${lang} measures the legend against the padded width`);
        t.equal(count(source, 'content.Deflate(8)'), 1, lang,
            `${lang} takes the plot off the padded rect (the chart's own 8 px gap stays inside it)`);
        t.equal(count(source, 'DrawTitle(context, titleText, plot'), DRAW_SITES, lang,
            `${lang} places the title against the padded rect at every draw site`);
        t.equal(count(source, ', content)'), DRAW_SITES, lang,
            `${lang} passes `+ '`content`' + ' as the title strip rect (not the frame)');
        // The legend bar hugs the same inset, on whichever side it sits: all four anchor edges are
        // read off `content` now, and no legend rect is built from the frame any more.
        t.equal(count(source, 'content.X, content.Y, content.Width, legendSize.Height'), 1, lang,
            `${lang} anchors a Top legend to the padded rect`);
        t.equal(count(source, 'content.Bottom - legendSize.Height, content.Width, legendSize.Height'), 1, lang,
            `${lang} anchors a Bottom legend to the padded rect`);
        t.equal(count(source, 'content.X, content.Y, legendSize.Width, content.Height'), 1, lang,
            `${lang} anchors a Left legend to the padded rect`);
        t.equal(count(source, 'content.Right - legendSize.Width'), 1, lang,
            `${lang} anchors a Right legend to the padded rect`);
        t.equal(count(source, '_legendRect = new Rect(frame.') + count(source, '_legendRect = New Rect(frame.'), 0, lang,
            `${lang} leaves no legend rectangle on the frame (the bar moves in with the padding)`);
        // The '…' browse button is chrome, not chart content: it stays in the corner of the frame.
        t.equal(count(source, 'frame.Right - boxSize - 4, frame.Y + 4, boxSize, boxSize'), 1, lang,
            `${lang} keeps the browse button in the frame's corner (it is chrome, not chart content)`);
        // ...but the chart's own background and its border still reach the frame: the plate fill and
        // the frame outline are the two uses of RoundedRect(frame, radius).
        t.equal(count(source, 'RoundedRect(frame, radius)'), 2, lang,
            `${lang} still paints the plate over the whole frame (padding is not a hole)`);
        t.equal(count(source, 'DrawFrame(context, frame, radius, frameWidth)'), DRAW_SITES, lang,
            `${lang} still draws the border on the frame`);
    }

    // --- 4. why the panel can show the value at all ---
    t.ok(/AddViaReflection\("Padding"\)/.test(host), 'host',
        'the host reads Padding off the control by reflection, so the panel sees the effective value');

    // --- 5. XAML round-trip ---
    const one = chartModel('');
    one.model.setProperty(one.el, 'Padding', '12');
    t.equal(one.el.getAttribute('Padding'), '12', 'write', 'a one-value padding is written as typed');
    const four = chartModel('Padding="8,4,8,4"');
    t.equal(four.model.serialize(false).includes('Padding="8,4,8,4"'), true, 'round-trip',
        'a four-value padding survives a save untouched');
    const readBack = chartModel('Padding="0,20"');
    t.equal(readBack.el.getAttribute('Padding'), '0,20', 'read',
        'an asymmetric padding (horizontal, vertical) is kept as written');
    t.equal(keyOf(propertyDefsFor(readBack.el), 'Padding').value, '0,20', 'read',
        'and the panel shows it as written');
    const cleared = chartModel('Padding="12"');
    cleared.model.setProperty(cleared.el, 'Padding', '');
    t.equal(cleared.el.hasAttribute('Padding'), false, 'write',
        'clearing the row removes the attribute again (back to the chart\'s own gap)');
};
