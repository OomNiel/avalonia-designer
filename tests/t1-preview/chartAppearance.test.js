/* T1 — the chart's new APPEARANCE rules, as pixels: a gradient background brush and the browse button
 * that is no longer drawn.
 *
 * Why this exists: both claims are invisible to the ordinary property tests. A gradient cannot be
 * checked by looking at one pixel (a plain colour would pass that) — it needs TWO: with a gradient the
 * two corners of the plate must differ, and without one they must be identical. And a REMOVAL is only
 * proved by looking where the button used to be, including on a form that still asks for it (the
 * compatibility promise: `ShowBrowse="True"` must keep compiling and draw nothing).
 */
'use strict';
const net = require('net');
const fs = require('fs');
const path = require('path');
const { startHost, renderPng, HOST_BIN } = require('../helpers/host');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" '
    + 'xmlns:charts="using:AvaloniaCharts"';
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'chartdata.xlsx');
const W = 300;
const H = 220;

function freePort() {
    return new Promise((res) => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    });
}

/** The brush element is a CHILD of the chart, so the series and the brush both live inside it. */
const form = (brush, attrs = '', children = true) => `<Window ${NS} Title="appearance" Width="${W}" Height="${H}">
  <Canvas Name="Holder" Width="${W}" Height="${H}">
    <charts:GrumpyXYPlot x:Name="Chart1" Width="${W}" Height="${H}" ${children ? `SourceFile="${FIXTURE}"` : ''}
      ShowTitle="False" ShowLegend="False" GridStyle="Dot" ${attrs}>
      ${children ? '<charts:XYSeries Title="Inside" XColumn="B" YColumn="C" LineColor="#2D7DD2" MarkerStyle="None"/>' : ''}
      ${brush}
    </charts:GrumpyXYPlot>
  </Canvas>
</Window>`;

const linear = (a, b, c) => `<charts:GrumpyXYPlot.PlotBackBrush>
        <LinearGradientBrush StartPoint="0%,0%" EndPoint="100%,100%">
          <GradientStop Color="${a}" Offset="0"/>
          <GradientStop Color="${b}" Offset="0.5"/>
          <GradientStop Color="${c}" Offset="1"/>
        </LinearGradientBrush>
      </charts:GrumpyXYPlot.PlotBackBrush>`;
const radial = (a, b) => `<charts:GrumpyXYPlot.PlotBackBrush>
        <RadialGradientBrush>
          <GradientStop Color="${a}" Offset="0"/>
          <GradientStop Color="${b}" Offset="1"/>
        </RadialGradientBrush>
      </charts:GrumpyXYPlot.PlotBackBrush>`;
const conic = (a, b) => `<charts:GrumpyXYPlot.PlotBackBrush>
        <ConicGradientBrush>
          <GradientStop Color="${a}" Offset="0"/>
          <GradientStop Color="${b}" Offset="1"/>
        </ConicGradientBrush>
      </charts:GrumpyXYPlot.PlotBackBrush>`;

/** Counts matching pixels in a box (the helpers' `ink` in the chart tests, kept local here). */
function ink(img, match, box) {
    let n = 0;
    for (let y = box.y0; y < box.y1; y++) {
        for (let x = box.x0; x < box.x1; x++) {
            const i = (y * img.width + x) * 4;
            if (match(img.data[i], img.data[i + 1], img.data[i + 2])) n++;
        }
    }
    return n;
}
const pixel = (img, x, y) => {
    const i = (y * img.width + x) * 4;
    return `${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`;
};
/** The RGB triple at a point, for colour comparisons that allow for antialiasing. */
const rgb = (img, x, y) => {
    const i = (y * img.width + x) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
};
const near = (a, b, slack = 14) => a.every((v, i) => Math.abs(v - b[i]) <= slack);
/** The button the chart used to draw: a #F0F0F0 box with a #C0C0C0 outline, 18x18, in the corner. */
const BUTTON_GREY = (r, g, b) => Math.abs(r - 192) < 14 && Math.abs(g - 192) < 14 && Math.abs(b - 192) < 14;
const CORNER = { x0: W - 40, x1: W - 4, y0: 4, y1: 40 };

module.exports = async (t) => {
    t.section('chartAppearance');

    if (!fs.existsSync(HOST_BIN)) {
        t.note('host binary missing — skipping (build the host first)');
        return;
    }
    if (!fs.existsSync(FIXTURE)) {
        t.fail('chart-appearance', 'fixture', `missing workbook fixture: ${FIXTURE}`);
        return;
    }

    const host = await startHost(await freePort());
    try {
        const shot = (brush, attrs, children = true) => renderPng(host, form(brush, attrs, children), W, H);

        // --- the gradient is a real one: the plate's two corners must DIFFER while a plain colour's
        //     must not (which is why one pixel can never prove a gradient) ---
        const plain = await shot('', 'PlotBackColor="#FFFFFF"');
        const topLeftPlain = pixel(plain.img, 8, 8);
        const bottomRightPlain = pixel(plain.img, W - 8, H - 8);
        t.equal(topLeftPlain, bottomRightPlain, 'gradient',
            'a chart with just a backcolour paints both corners the same');
        t.ok(ink(plain.img, BUTTON_GREY, CORNER) === 0, 'browse',
            'and an empty corner means no "…" button is drawn on the surface any more');

        const gradient = await shot(linear('#FFFFFF', '#DCEBFF', '#C6DBF5'), 'PlotBackColor="#FFFFFF"');
        const topLeft = pixel(gradient.img, 8, 8);
        const bottomRight = pixel(gradient.img, W - 8, H - 8);
        t.ok(topLeft !== bottomRight, 'gradient',
            'a LinearGradientBrush makes the plate run from one colour to the other',
            `${topLeft} -> ${bottomRight}`);
        t.ok(near(rgb(gradient.img, 8, 8), [255, 255, 255], 16), 'gradient',
            'the gradient starts at its first stop (white)', topLeft);
        t.ok(near(rgb(gradient.img, W - 8, H - 8), [0xC6, 0xDB, 0xF5], 16), 'gradient',
            'and reaches its last stop (#C6DBF5) in the far corner', bottomRight);

        // A solid brush written the terse way is a brush too: the host had been dropping every
        // `Brush`-typed attribute silently (Brush.Parse returns an IMMUTABLE brush, which a
        // Brush-typed property refuses) and a property element was not read at all.
        const solid = await shot('', 'PlotBackBrush="#FF0000"');
        t.ok(near(rgb(solid.img, 8, 8), [255, 0, 0], 4), 'gradient',
            'a plain colour brush paints the whole plate', pixel(solid.img, 8, 8));

        // --- the two other gradient kinds render, and each spreads its colour over the plate ---
        // A radial brush gives its four corners the SAME colour by construction (they are equidistant
        // from the centre) and a conic one varies by angle, so comparing corners proves nothing for
        // either: count the distinct colours across a strip of plate instead. A plain colour has one.
        // The strip runs along y=4 — inside the plate but ABOVE the plot, which starts 8px in (a strip
        // lower down would cross gridlines and the series and report ~29 shades even for one colour).
        const shades = (img) => {
            const seen = new Set();
            for (let x = 12; x < W - 12; x++) seen.add(pixel(img, x, 4));
            return seen.size;
        };
        t.equal(shades(plain.img), 1, 'gradient',
            'a plain backcolour really is one flat colour across the plate');

        const radialShot = await shot(radial('#FFFFFF', '#FF8000'));
        t.ok(shades(radialShot.img) >= 8, 'gradient',
            'a RadialGradientBrush spreads outwards across the plate', `shades=${shades(radialShot.img)}`);
        const conicShot = await shot(conic('#FFFFFF', '#008000'));
        t.ok(shades(conicShot.img) >= 8, 'gradient',
            'and so does a ConicGradientBrush', `shades=${shades(conicShot.img)}`);

        // --- None (no property element) is exactly the plain chart again ---
        const none = await shot('', 'PlotBackColor="#FFFFFF"');
        t.equal(pixel(none.img, 8, 8) + pixel(none.img, W - 8, H - 8), topLeftPlain + bottomRightPlain,
            'gradient', 'removing the brush gives the chart its plain backcolour back');

        // --- the compatibility promise, in pixels: a form that still asks for the button draws none ---
        const wantsButton = await shot('', 'ShowBrowse="True"', false);
        t.ok(ink(wantsButton.img, BUTTON_GREY, CORNER) === 0, 'browse',
            'ShowBrowse="True" draws nothing either, but the form still compiles and renders');
        const noData = await shot('', '', false);
        t.equal(ink(noData.img, BUTTON_GREY, CORNER), 0, 'browse',
            'and an empty chart offers no button in the corner (the right-click menu carries the picker)');
        // The empty chart still SAYS something: the message names the new route.
        const MESSAGE_GREY = (r, g, b) => Math.abs(r - 144) < 22 && Math.abs(g - 144) < 22 && Math.abs(b - 144) < 22;
        const CENTRE = { x0: 40, x1: W - 40, y0: 80, y1: 140 };
        t.ok(ink(noData.img, MESSAGE_GREY, CENTRE) > 40, 'browse',
            'while the "no data" advice is still drawn in the middle of the plot',
            `grey=${ink(noData.img, MESSAGE_GREY, CENTRE)}`);

        // --- the axis has THREE colours and all three reach the picture -------------------------
        // Only the line used to: `AxisColor` is a plain `Color` while `TickLabelColor`/`NameColor` are
        // `Color?`, and a nullable value type reports `Nullable<Color>` at runtime — so the host's
        // converter skipped its colour branch and both properties kept their defaults, in the preview
        // only (the running app uses Avalonia's own XAML loader, which has no such problem).
        //
        // Measuring it needs care. Skia renders text with SUBPIXEL antialiasing, so a black glyph has
        // coloured fringes: in this very render the most "red" pixel of a fully black axis is
        // r-g = 111 and the most "green" is g-r = 112. Counting "reddish" pixels therefore proves
        // nothing, and requiring pure (255,0,0) cores is far too strict — antialiased text has almost
        // none. So the labels and the name are proved by how STRONG the strongest signal gets (a real
        // colour reaches 216/255 against those 111/112 fringes), and the line — long and axis-aligned,
        // so it keeps pure pixels — by counting them.
        const axisForm = (attrs) => `<Window ${NS} Title="axis" Width="${W}" Height="${H}">
  <Canvas Name="Holder" Width="${W}" Height="${H}">
    <charts:GrumpyXYPlot x:Name="Chart1" Width="${W}" Height="${H}" SourceFile="${FIXTURE}"
      ShowTitle="False" ShowLegend="False" GridStyle="Dot">
      <charts:GrumpyXYPlot.YAxis><charts:Axis ${attrs}/></charts:GrumpyXYPlot.YAxis>
      <charts:GrumpyXYPlot.XAxis><charts:Axis ${attrs}/></charts:GrumpyXYPlot.XAxis>
      <charts:XYSeries Title="Inside" XColumn="B" YColumn="C" LineColor="#2D7DD2" MarkerStyle="None"/>
    </charts:GrumpyXYPlot>
  </Canvas>
</Window>`;
        /** The strongest colour signal anywhere in the image — `f(r,g,b)` returning a difference. */
        const strongest = (img, f) => {
            let best = -999;
            for (let i = 0; i < img.data.length; i += 4) {
                const v = f(img.data[i], img.data[i + 1], img.data[i + 2]);
                if (v > best) best = v;
            }
            return best;
        };
        const pureBlue = (img) => ink(img, (r, g, b) => b > 230 && r < 60 && g < 60, { x0: 0, x1: img.width, y0: 0, y1: img.height });

        const plainAxis = await renderPng(host, axisForm('AxisColor="#000000"'), W, H);
        const plainRed = strongest(plainAxis.img, (r, g) => r - g);
        const plainGreen = strongest(plainAxis.img, (r, g) => g - r);
        t.ok(plainRed < 150, 'axis-colour',
            'the control case: a black axis has no red in it (its antialiasing fringes reach 111)', `max r-g=${plainRed}`);
        t.ok(plainGreen < 150, 'axis-colour',
            'and none green either (fringes reach 112)', `max g-r=${plainGreen}`);
        t.equal(pureBlue(plainAxis.img), 0, 'axis-colour',
            'and no pure blue pixels at all');

        const colouredAxis = await renderPng(host,
            axisForm('AxisColor="#0000FF" TickLabelColor="#FF0000" NameColor="#00FF00" '
                + 'ShowName="True" AxisName="Volts"'), W, H);
        const reds = strongest(colouredAxis.img, (r, g) => r - g);
        const greens = strongest(colouredAxis.img, (r, g) => g - r);
        const blues = pureBlue(colouredAxis.img);
        t.ok(reds > 150, 'axis-colour', 'the tick labels really are drawn in the LABEL colour', `max r-g=${reds}`);
        t.ok(greens > 150, 'axis-colour', 'the axis NAME in its own colour', `max g-r=${greens}`);
        t.ok(blues > 100, 'axis-colour',
            'and the line and its ticks keep the LINE colour', `pure blue=${blues}`);
    } finally {
        host.close();
    }
};
