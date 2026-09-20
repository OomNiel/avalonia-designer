/* T1 — the chart LEGEND bar: one entry per series, its name in the series' own colour, a tick box
 * that switches that trace on and off, and a bar that grows vertically to fit whatever it lists.
 *
 * Why this exists: every part of that sentence is invisible to the ordinary property tests. The bar
 * must only appear for a chart that HAS series (a single implicit line has no name to show), it must
 * take its height OFF the plot rather than overdraw it, a hidden series must vanish from the plot
 * while staying visible in the legend (otherwise there is no way to switch it back on), and a long
 * list must WRAP instead of running off the chart. These are pixel facts, so this renders through the
 * real host and counts ink per band:
 *
 *   plot band   = above the legend   (the traces themselves)
 *   legend band = the bar's own rows (names + ticks)
 *
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
const H = 260;    // tall enough that one legend row (21px) or three (63px) stay clear of the plot
const PLOT_Y = 180;   // ink above this is the plot, below it is the legend bar
const LEGEND_Y = 185;

function freePort() {
    return new Promise((res) => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    });
}

const form = (attrs, children) => `<Window ${NS} Title="legend" Width="${W}" Height="${H}">
  <Canvas Name="Holder" Width="${W}" Height="${H}">
    <charts:GrumpyXYPlot x:Name="Chart1" Width="${W}" Height="${H}" SourceFile="${FIXTURE}"
      ShowTitle="False" ${attrs}>
      ${children}
    </charts:GrumpyXYPlot>
  </Canvas>
</Window>`;

const TWO = `<charts:XYSeries Title="Inside" XColumn="B" YColumn="C" LineColor="#FF0000"/>
      <charts:XYSeries Title="Outside" XColumn="D" YColumn="E" LineColor="#0000FF"/>`;

/** Counts matching pixels in a band, and how far down (maxY) / up (minY) / sideways they reach.
 *  The x bounds matter when the legend's own names carry a series colour: the plot must be measured
 *  apart from them. */
function ink(img, y0, y1, match, x0 = 0, x1 = W) {
    const out = { n: 0, minY: Infinity, maxY: -Infinity, minX: Infinity, maxX: -Infinity };
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
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
const BLUE = (r, g, b) => b > 190 && r < 70 && g < 70;
const MAGENTA = (r, g, b) => r > 150 && b > 150 && g < 80;
const TEAL = (r, g, b) => g > 120 && b > 120 && r < 80;
const plot = (img, m) => ink(img, 0, PLOT_Y, m);
const legend = (img, m) => ink(img, LEGEND_Y, H, m);

module.exports = async (t) => {
    t.section('chartLegend');

    if (!fs.existsSync(HOST_BIN)) {
        t.note('host binary missing — skipping (build the host first)');
        return;
    }
    if (!fs.existsSync(FIXTURE)) {
        t.fail('chart-legend', 'fixture', `missing workbook fixture: ${FIXTURE}`);
        return;
    }

    const host = await startHost(await freePort());
    try {
        // --- with the legend on, both series are listed in their own colours ---
        const on = await renderPng(host, form('GridStyle="Dot"', TWO), W, H);
        t.ok(!on.frame.error, 'chart-legend', 'a chart with a legend renders', on.frame.error || '');
        const onPlotRed = plot(on.img, RED);
        const onLegendRed = legend(on.img, RED);
        const onLegendBlue = legend(on.img, BLUE);
        t.ok(onPlotRed.n > 100 && plot(on.img, BLUE).n > 100, 'chart-legend',
            'both traces are drawn above the bar', `red=${onPlotRed.n}`);
        t.ok(onLegendRed.n > 20, 'chart-legend', "the first series' name is written in its series colour",
            `red=${onLegendRed.n}`);
        t.ok(onLegendBlue.n > 20, 'chart-legend', "and so is the second one", `blue=${onLegendBlue.n}`);

        // --- turning the legend off gives the space back to the plot ---
        const off = await renderPng(host, form('GridStyle="Dot" ShowLegend="False"', TWO), W, H);
        t.equal(legend(off.img, RED).n + legend(off.img, BLUE).n, 0, 'chart-legend',
            'ShowLegend=False draws no legend ink at all');
        t.ok(plot(off.img, RED).maxY > onPlotRed.maxY + 5, 'chart-legend',
            'without the bar the plot is taller (the legend takes its height off the plot)',
            `on maxY=${onPlotRed.maxY} off maxY=${plot(off.img, RED).maxY}`);

        // --- a series switched off disappears from the plot but STAYS in the legend ---
        const hidden = await renderPng(host, form('GridStyle="Dot"', `
      <charts:XYSeries Title="Inside" XColumn="B" YColumn="C" LineColor="#FF0000" Visible="False"/>
      <charts:XYSeries Title="Outside" XColumn="D" YColumn="E" LineColor="#0000FF"/>`), W, H);
        t.equal(plot(hidden.img, RED).n, 0, 'chart-legend', 'a hidden trace is not drawn');
        t.ok(plot(hidden.img, BLUE).n > 100, 'chart-legend', 'while the other one still is');
        t.ok(legend(hidden.img, RED).n > 10, 'chart-legend',
            'and it is still listed (its box is just empty) — otherwise it could never be switched back on',
            `red=${legend(hidden.img, RED).n}`);

        // --- a long list WRAPS: six entries need more rows, so the bar reaches further up and the
        //     plot gives up more room ---
        const colours = ['#FF0000', '#0000FF', '#008000', '#FFA500', '#800080', '#00AAAA'];
        const many = await renderPng(host, form('GridStyle="Dot"', colours.map((c, i) =>
            `<charts:XYSeries Title="Series number ${i + 1}" XColumn="${i === 1 ? 'D' : 'B'}" `
            + `YColumn="${i % 2 === 0 ? 'C' : 'E'}" LineColor="${c}"/>`).join('\n      ')), W, H);
        t.ok(!many.frame.error, 'chart-legend', 'a six-series chart renders', many.frame.error || '');
        const teal = legend(many.img, TEAL);
        t.ok(teal.n > 20, 'chart-legend', 'the last entry is listed too', `teal=${teal.n}`);
        t.ok(teal.minY < H - 25, 'chart-legend',
            'the entries wrapped onto more than one row (the last one sits well above the bar bottom)',
            `teal y=${teal.minY}..${teal.maxY}`);
        // The bar took its room from the plot: nothing of the traces reaches into the bar's rows.
        const manyBarTop = Math.min(legend(many.img, RED).minY, teal.minY);
        t.ok(plot(many.img, BLUE).maxY < manyBarTop + 1, 'chart-legend',
            'the plot still ends above the wrapped bar',
            `plot maxY=${plot(many.img, BLUE).maxY} bar top=${manyBarTop}`);

        // --- a chart with no series elements has one unnamed line: nothing to list, so no bar ---
        const implicit = await renderPng(host, form('GridStyle="Dot" Points="0,2 1,5 2,3" '
            + 'LineColor="#FF00FF"', ''), W, H);
        t.ok(plot(implicit.img, MAGENTA).n > 60, 'chart-legend', 'the single implicit line is drawn',
            `magenta=${plot(implicit.img, MAGENTA).n}`);
        t.equal(legend(implicit.img, MAGENTA).n, 0, 'chart-legend',
            'but an unnamed single line shows no legend');

        // --- the legend editor: side, frame and backcolour -------------------------------------
        // A yellow frame makes the bar's own rectangle visible, so each side can be measured.
        const YELLOW = (r, g, b) => r > 200 && g > 200 && b < 80;
        const frameBox = (img) => ink(img, 0, H, YELLOW);
        const sides = {};
        for (const side of ['Bottom', 'Top', 'Left', 'Right']) {
            const shot = await renderPng(host, form(`GridStyle="Dot" LegendPosition="${side}" `
                + 'LegendBackColor="#FFFF00"', TWO), W, H);
            t.ok(!shot.frame.error, 'chart-legend', `a legend on the ${side.toLowerCase()} renders`,
                shot.frame.error || '');
            sides[side] = frameBox(shot.img);
            t.ok(sides[side].n > 500, 'chart-legend',
                `the ${side.toLowerCase()} frame is painted in its own backcolour`, `n=${sides[side].n}`);
        }
        t.ok(sides.Bottom.minY > H * 0.6 && sides.Bottom.maxY > H - 10, 'chart-legend',
            'Bottom puts the bar along the bottom edge', `y=${sides.Bottom.minY}..${sides.Bottom.maxY}`);
        t.ok(sides.Top.minY < 10 && sides.Top.maxY < H * 0.4, 'chart-legend',
            'Top puts it along the top edge', `y=${sides.Top.minY}..${sides.Top.maxY}`);
        t.ok(sides.Left.minX < 100 && sides.Left.maxX < W * 0.5, 'chart-legend',
            'Left puts it down the left-hand side', `x=${sides.Left.minX}..${sides.Left.maxX}`);
        t.ok(sides.Right.minX > W * 0.5 && sides.Right.maxX > W - 10, 'chart-legend',
            'Right puts it down the right-hand side', `x=${sides.Right.minX}..${sides.Right.maxX}`);
        // The bar takes its room from the plot, on whichever side it sits.
        const leftShot = await renderPng(host, form('GridStyle="Dot" LegendPosition="Left"', TWO), W, H);
        const leftPlotRed = ink(leftShot.img, 0, H, RED, sides.Left.maxX + 2, W);
        t.ok(leftPlotRed.n > 100, 'chart-legend', 'the traces are still drawn with a side legend',
            `red right of the bar=${leftPlotRed.n}`);

        // --- the frame can be switched off, and its corners rounded away ---
        const noFrame = await renderPng(host, form('GridStyle="Dot" LegendBackColor="#FFFF00" '
            + 'LegendShowFrame="False"', TWO), W, H);
        t.equal(frameBox(noFrame.img).n, 0, 'chart-legend', 'LegendShowFrame=False draws no frame/backcolour');
        // With square corners the frame's own pixel at the bar's corner is painted; a big radius
        // pulls the outline away from it, so an inset pixel stays the plate's colour.
        const square = await renderPng(host, form('GridStyle="Dot" LegendPosition="Top" '
            + 'LegendBackColor="#FFFF00" LegendCornerRadius="0" LegendBorderThickness="0"', TWO), W, H);
        const rounded = await renderPng(host, form('GridStyle="Dot" LegendPosition="Top" '
            + 'LegendBackColor="#FFFF00" LegendCornerRadius="16" LegendBorderThickness="0"', TWO), W, H);
        const at = (img, x, y) => { const i = (y * img.width + x) * 4; return YELLOW(img.data[i], img.data[i + 1], img.data[i + 2]); };
        t.equal(at(square.img, 3, 3), true, 'chart-legend', 'a square frame fills its corner');
        t.equal(at(rounded.img, 3, 3), false, 'chart-legend',
            'a rounded frame leaves the corner to the plate behind it');

        // --- LegendMargin: breathing room between the frame and the entries ----------------------
        // The frame is measured in its own backcolour (yellow), which exists nowhere else in these
        // renders, so "the bar grew by twice the margin" and "the entries moved inwards" are plain
        // pixel facts. A RIGHT legend is measured sideways: the bar is anchored to the right edge and
        // the plot is chopped short of it, so ink inside the bar's own x-range is the bar's alone.
        const barShot = (side, attrs) => renderPng(host, form('GridStyle="Dot" '
            + `LegendPosition="${side}" LegendBackColor="#FFFF00" ${attrs}`, TWO), W, H);
        const width = (b) => b.maxX - b.minX;
        const height = (b) => b.maxY - b.minY;
        const rightTight = await barShot('Right', 'LegendMargin="0"');
        const rightRoomy = await barShot('Right', 'LegendMargin="10"');
        const tightF = frameBox(rightTight.img);
        const roomyF = frameBox(rightRoomy.img);
        t.ok(width(roomyF) > width(tightF) + 15, 'chart-legend',
            'LegendMargin widens the frame by about twice the margin',
            `${width(tightF)} -> ${width(roomyF)} px`);
        t.ok(Math.abs(tightF.maxX - roomyF.maxX) <= 2, 'chart-legend',
            'while the edge it is anchored to stays where it was');
        const entriesIn = (img, frame) => ink(img, 0, H, RED, Math.max(0, Math.round(frame.minX) + 2), W);
        const gapX = (frame, text) => text.minX - frame.minX;
        const tightGap = gapX(tightF, entriesIn(rightTight.img, tightF));
        const roomyGap = gapX(roomyF, entriesIn(rightRoomy.img, roomyF));
        t.ok(roomyGap > tightGap + 5, 'chart-legend',
            'and the entries sit further from the frame — which is what the setting is for',
            `gap ${tightGap} -> ${roomyGap} px`);
        t.ok(roomyGap - tightGap <= 14, 'chart-legend',
            'by about the margin, not by more', `${roomyGap - tightGap} px`);
        // The same on the Bottom side, where the bar is anchored to the bottom and grows upwards.
        const bottomTight = await barShot('Bottom', 'LegendMargin="0"');
        const bottomRoomy = await barShot('Bottom', 'LegendMargin="10"');
        const tightB = frameBox(bottomTight.img);
        const roomyB = frameBox(bottomRoomy.img);
        t.ok(height(roomyB) > height(tightB) + 15, 'chart-legend',
            'and it grows a Bottom bar too', `${height(tightB)} -> ${height(roomyB)} px`);
        t.ok(Math.abs(tightB.maxY - roomyB.maxY) <= 2, 'chart-legend',
            'which still sits on the frame\'s bottom edge');
        // The room comes off the plot, not out of thin air: the traces end higher up.
        const plotBottom = (img, frame) => ink(img, 0, Math.max(1, Math.round(frame.minY) - 3), BLUE).maxY;
        t.ok(plotBottom(bottomRoomy.img, roomyB) < plotBottom(bottomTight.img, tightB), 'chart-legend',
            'and the plot gives up that room',
            `plot bottom ${plotBottom(bottomTight.img, tightB)} -> ${plotBottom(bottomRoomy.img, roomyB)}`);
    } finally {
        host.close();
    }
};
