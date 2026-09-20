/* T1 — the chart's own Padding: the space the user inserts between the border and the chart frame.
 *
 * Why this exists: the chart draws its content inside a border with a hard-coded 8 px gap, and
 * Padding widens that gap. Three claims have to hold, and all three are pixel facts:
 *
 *   1. the BORDER does not move — the padding is taken out of the inside, it is not an outer margin;
 *   2. the CONTENT does move in: the plot area (with the traces and the gridlines that span it), the
 *      title and the legend bar all step in by exactly the padding, while the chart's own backcolour
 *      still reaches the border, so the band that appears is chart, not form;
 *   3. an unset Padding and Padding="0" are the SAME PICTURE — the promise that every existing form
 *      renders exactly as it did before this property existed.
 *
 * The RULER is the grid: a gridline is drawn from the plot rect's edge to its opposite edge, so the
 * grid's ink bounds ARE the plot rect. (A trace is no good for that — its lowest data point sits
 * wherever the axis range puts it, so it does not move by the padding at all.) Every band has a
 * colour of its own: the border magenta, the grid green, the title cyan, the legend bar painted in
 * its yellow backcolour, and the chart sits on a navy form so "the band is still chart" is checkable.
 * The workbook is `tests/fixtures/chartdata.xlsx` (B/C = "Time"/"Inside", D/E = "Time2"/"Outside").
 */
'use strict';
const net = require('net');
const fs = require('fs');
const path = require('path');
const { startHost, renderPng, HOST_BIN } = require('../helpers/host');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" '
    + 'xmlns:charts="using:AvaloniaCharts"';
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'chartdata.xlsx');
const W = 300;    // the chart's own size, at 0,0 inside the form
const H = 260;
const FW = W + 40;   // the form is bigger than the chart, so its own colour shows around it
const FH = H + 40;
const BORDER = '#FF00FF';   // magenta: the frame, and nothing else
const GRID = '#00B000';     // green: the gridlines, and nothing else
const TITLE = '#00FFFF';    // cyan: the title, and nothing else

function freePort() {
    return new Promise((res) => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    });
}

const form = (attrs, opts = {}) => `<Window ${NS} Title="padding" Width="${FW}" Height="${FH}">
  <Canvas Name="Holder" Width="${FW}" Height="${FH}" Background="Navy">
    <charts:GrumpyXYPlot x:Name="Chart1" Width="${W}" Height="${H}" SourceFile="${FIXTURE}"
      GridColor="${GRID}" GridStyle="Solid" GridThickness="2" ShowLegend="${opts.legend ? 'True' : 'False'}"
      ShowTitle="${opts.title ? 'True' : 'False'}" TitleColor="${TITLE}"
      BorderBrush="${BORDER}" BorderThickness="2" ${attrs}>
      ${opts.children || TWO}
    </charts:GrumpyXYPlot>
  </Canvas>
</Window>`;

const TWO = `<charts:XYSeries Title="Inside" XColumn="B" YColumn="C" LineColor="#FF0000"/>
      <charts:XYSeries Title="Outside" XColumn="D" YColumn="E" LineColor="#0000FF"/>`;

/** Counts matching pixels anywhere in the image and reports how far they reach. */
function ink(img, match) {
    const out = { n: 0, minY: Infinity, maxY: -Infinity, minX: Infinity, maxX: -Infinity };
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            const i = (y * img.width + x) * 4;
            if (!match(img.data[i], img.data[i + 1], img.data[i + 2])) continue;
            out.n++;
            out.minY = Math.min(out.minY, y);
            out.maxY = Math.max(out.maxY, y);
            out.minX = Math.min(out.minX, x);
            out.maxX = Math.max(out.maxX, x);
        }
    }
    return out;
}
const RED = (r, g, b) => r > 190 && g < 70 && b < 70;
const MAGENTA = (r, g, b) => r > 190 && g < 70 && b > 190;
const CYAN = (r, g, b) => g > 190 && b > 190 && r < 70;
// Green by DOMINANCE: a 2 px gridline antialiases at its edges, and those blended pixels are still
// green — and only the gridlines are green in these renders (traces red/blue, title cyan, border
// magenta, plate white, legend yellow).
const GREEN = (r, g, b) => g > r + 40 && g > b + 40 && g > 90;
const YELLOW = (r, g, b) => r > 200 && g > 200 && b < 80;
const edge = (b) => `${b.minX},${b.minY},${b.maxX},${b.maxY}`;
const pixel = (img, x, y) => {
    const i = (y * img.width + x) * 4;
    return `${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`;
};
/** "within a couple of pixels of": the renderer rounds by the border's half-width. */
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;

module.exports = async (t) => {
    t.section('chartPadding');

    if (!fs.existsSync(HOST_BIN)) {
        t.note('host binary missing — skipping (build the host first)');
        return;
    }
    if (!fs.existsSync(FIXTURE)) {
        t.fail('chart-padding', 'fixture', `missing workbook fixture: ${FIXTURE}`);
        return;
    }

    const host = await startHost(await freePort());
    try {
        const shot = (attrs, opts) => renderPng(host, form(attrs, opts), FW, FH);
        const plotRect = async (attrs) => ink((await shot(attrs)).img, GREEN);

        // --- 3. the promise: unset == explicit 0 -----------------------------------------------
        const plain = await shot('');
        const zero = await shot('Padding="0"');
        const plainPlot = ink(plain.img, GREEN);
        const plainBorder = ink(plain.img, MAGENTA);
        t.ok(plainPlot.n > 200 && plainBorder.n > 100, 'chart-padding',
            'the chart under test has a plot rect and a border to measure',
            `grid=${plainPlot.n} border=${plainBorder.n}`);
        t.ok(ink(plain.img, RED).n > 100, 'chart-padding', 'and a trace to draw inside them',
            `red=${ink(plain.img, RED).n}`);
        t.equal(edge(ink(zero.img, MAGENTA)), edge(plainBorder), 'chart-padding',
            'an unset Padding puts the border exactly where Padding="0" does');
        t.equal(edge(ink(zero.img, GREEN)), edge(plainPlot), 'chart-padding',
            'and leaves the plot rect exactly where it was (every existing form is untouched)');
        t.equal(edge(ink(zero.img, RED)), edge(ink(plain.img, RED)), 'chart-padding',
            'traces included');

        // --- 1. the border stays put, the plot area steps in ------------------------------------
        const zeroPlot = ink(zero.img, GREEN);
        const zeroBorder = ink(zero.img, MAGENTA);
        const pad = await shot('Padding="25"');
        const padPlot = ink(pad.img, GREEN);
        t.equal(edge(ink(pad.img, MAGENTA)), edge(zeroBorder), 'chart-padding',
            'Padding does not move the border (it comes out of the inside, not around the outside)');
        t.ok(near(padPlot.minX, zeroPlot.minX + 25), 'chart-padding',
            'the chart frame starts 25 px further in on the left', `${zeroPlot.minX} -> ${padPlot.minX}`);
        t.ok(near(padPlot.minY, zeroPlot.minY + 25), 'chart-padding',
            'and 25 px further down from the top', `${zeroPlot.minY} -> ${padPlot.minY}`);
        t.ok(near(padPlot.maxX, zeroPlot.maxX - 25), 'chart-padding',
            'and ends 25 px short of the right edge', `${zeroPlot.maxX} -> ${padPlot.maxX}`);
        t.ok(near(padPlot.maxY, zeroPlot.maxY - 25), 'chart-padding',
            'and 25 px short of the bottom edge', `${zeroPlot.maxY} -> ${padPlot.maxY}`);
        // The traces live inside that frame, so they move with it.
        const padRed = ink(pad.img, RED);
        t.ok(padRed.minX > ink(zero.img, RED).minX + 15 && padRed.maxX < ink(zero.img, RED).maxX - 15,
            'chart-padding', 'and the drawn traces move in with it',
            `x=${padRed.minX}..${padRed.maxX}`);

        // --- a Thickness, so the sides can differ -----------------------------------------------
        const asymPlot = ink((await shot('Padding="0,30"')).img, GREEN);
        t.ok(near(asymPlot.minX, zeroPlot.minX) && near(asymPlot.maxX, zeroPlot.maxX), 'chart-padding',
            'Padding="0,30" leaves the horizontal room alone',
            `x=${asymPlot.minX}..${asymPlot.maxX} (unpadded ${zeroPlot.minX}..${zeroPlot.maxX})`);
        t.ok(near(asymPlot.minY, zeroPlot.minY + 30) && near(asymPlot.maxY, zeroPlot.maxY - 30),
            'chart-padding', 'and takes 30 px off the top and the bottom',
            `y=${asymPlot.minY}..${asymPlot.maxY} (unpadded ${zeroPlot.minY}..${zeroPlot.maxY})`);

        // --- the band that appears is CHART, not form -------------------------------------------
        // A point in the new band (between the border and the moved-in content) is still the chart's
        // own plate — exactly the colour that pixel had before any padding.
        const bandX = W - 8, bandY = Math.round(H / 2);
        const formPixel = pixel(pad.img, W + 20, 20);    // the navy of the form around the chart
        t.equal(pixel(pad.img, bandX, bandY), pixel(zero.img, bandX, bandY), 'chart-padding',
            'the padding band is painted with the chart backcolour, exactly as that pixel was before');
        t.ok(pixel(pad.img, bandX, bandY) !== formPixel, 'chart-padding',
            'so the padding is NOT a hole that lets the form through',
            `band=${pixel(pad.img, bandX, bandY)} form=${formPixel}`);

        // --- the title is content too -----------------------------------------------------------
        // Centred over the plot, so a narrower plot leaves its centre alone.
        const titleOpts = { title: true, children: '<charts:XYSeries Title="Inside" XColumn="B" YColumn="C"/>' };
        const titleAttrs = 'Title="Padded"';
        const titleTight = ink((await shot('Padding="0" ' + titleAttrs, titleOpts)).img, CYAN);
        const titlePadded = ink((await shot('Padding="25" ' + titleAttrs, titleOpts)).img, CYAN);
        t.ok(titleTight.n > 20 && titlePadded.n > 20, 'chart-padding', 'a chart with a title draws it',
            `cyan=${titleTight.n}/${titlePadded.n}`);
        t.ok(near(titlePadded.minY, titleTight.minY + 25, 3), 'chart-padding',
            'the title comes in from the border with the padding',
            `${titleTight.minY} -> ${titlePadded.minY}`);
        const mid = (b) => (b.minX + b.maxX) / 2;
        t.ok(near(mid(titlePadded), mid(titleTight), 2), 'chart-padding',
            'while staying centred over the (narrower) plot',
            `centre ${mid(titleTight)} -> ${mid(titlePadded)}`);

        // --- the legend bar is anchored to the padded rect --------------------------------------
        const barOpts = { legend: true };
        const barTight = ink((await shot('Padding="0" LegendBackColor="#FFFF00"', barOpts)).img, YELLOW);
        const barPadded = ink((await shot('Padding="25" LegendBackColor="#FFFF00"', barOpts)).img, YELLOW);
        t.ok(barTight.n > 500 && barPadded.n > 500, 'chart-padding',
            'the legend bar is painted in its own backcolour', `yellow=${barTight.n}/${barPadded.n}`);
        t.ok(near(barPadded.minX, barTight.minX + 25), 'chart-padding',
            'a bottom bar starts 25 px further in', `${barTight.minX} -> ${barPadded.minX}`);
        t.ok(near(barPadded.maxY, barTight.maxY - 25), 'chart-padding',
            'and sits 25 px above the border instead of on it', `${barTight.maxY} -> ${barPadded.maxY}`);
        t.ok(near(barPadded.maxX, barTight.maxX - 25), 'chart-padding',
            'it spans the padded width, so it ends 25 px short of the right edge as well',
            `${barTight.maxX} -> ${barPadded.maxX}`);
        t.ok(near((barPadded.maxY - barPadded.minY) - (barTight.maxY - barTight.minY), 0, 2), 'chart-padding',
            'and it is no taller than before (the padding does not stretch the bar)',
            `height ${barTight.maxY - barTight.minY} -> ${barPadded.maxY - barPadded.minY}`);
        // A padded chart still draws the legend entries themselves, in their series colours: the
        // content moved, it did not disappear.
        t.ok(ink((await shot('Padding="25" LegendBackColor="#FFFF00"', barOpts)).img, RED).n > 100,
            'chart-padding', 'and the entries inside the bar are still drawn');
    } finally {
        host.close();
    }
};
