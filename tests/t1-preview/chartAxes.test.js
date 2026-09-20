/* T1 — the AXIS path end to end: an axis is now a real object, so its POSITION must move the whole
 * gizmo (line, ticks, labels and name) to another side of the plot, and several per-series axes on
 * the same side must stack instead of drawing over each other.
 *
 * Why this exists: the common axis used to be a fixed left+bottom pair built from chart-level
 * scalars, and every per-series axis was drawn AT the plot edge — two of them on one side simply
 * overprinted. Both are silent failures (the chart still renders, just wrong), so this drives the
 * real host and counts pixels per band: a right-hand common axis must put its ink on the right and
 * leave the left empty, a top-hand one must move the numbers above the plot, and two stacked right
 * axes must sit at different distances from the plot edge.
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
const W = 300;   // the chart's own size, at 0,0 inside the form
const H = 180;

function freePort() {
    return new Promise((res) => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    });
}

/** A form with one chart at 0,0 holding the given children (series and/or axis property elements). */
const form = (tag, attrs, children) => `<Window ${NS} Title="axes" Width="340" Height="220">
  <Canvas Name="Holder" Width="340" Height="220">
    <charts:${tag} x:Name="Chart1" Width="${W}" Height="${H}" SourceFile="${FIXTURE}"
      ShowTitle="False" ${attrs}>
      ${children}
    </charts:${tag}>
  </Canvas>
</Window>`;

/** Counts green (#00AA00), magenta (#AA00AA) and blue (#0000FF) pixels, plus where they sit. */
function ink(img, x0, x1, y0, y1, match) {
    const out = { n: 0, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const i = (y * img.width + x) * 4;
            if (!match(img.data[i], img.data[i + 1], img.data[i + 2])) continue;
            out.n++;
            out.minX = Math.min(out.minX, x);
            out.maxX = Math.max(out.maxX, x);
            out.minY = Math.min(out.minY, y);
            out.maxY = Math.max(out.maxY, y);
        }
    }
    return out;
}
const GREEN = (r, g, b) => g > 110 && r < 90 && b < 90;
const MAGENTA = (r, g, b) => r > 110 && b > 110 && g < 90;
// Blue has to be matched by DOMINANCE, not by an absolute value: a 1px horizontal line lands
// between two pixel rows, so its pixels are partly blended with the white plate behind it.
const BLUE = (r, g, b) => b > r + 50 && b > g + 50;

module.exports = async (t) => {
    t.section('chart axes');

    if (!fs.existsSync(HOST_BIN)) {
        t.note('host binary missing — skipping (build the host first)');
        return;
    }
    if (!fs.existsSync(FIXTURE)) {
        t.fail('chart-axes', 'fixture', `missing workbook fixture: ${FIXTURE}`);
        return;
    }

    const host = await startHost(await freePort());
    try {
        // --- the COMMON Y axis moved to the RIGHT: its green ink must be on the right, none left ---
        const right = await renderPng(host, form('GrumpyXYPlot', 'Points="0,2 1,5 2,3" GridStyle="Dot"', `
      <charts:GrumpyXYPlot.YAxis>
        <charts:Axis Position="Right" AxisColor="#00AA00"/>
      </charts:GrumpyXYPlot.YAxis>`), 340, 220);
        t.ok(!right.frame.error, 'chart-axes', 'a chart with a right-hand common Y axis renders', right.frame.error || '');
        // The Y axis always had a name from the sheet's header in the old layout; with an Axis object
        // but no Name the sheet header still supplies it, so the strip is wider than the ticks alone.
        const rightBand = ink(right.img, Math.round(W * 0.6), W, 0, H, GREEN);
        const leftBand = ink(right.img, 0, Math.round(W * 0.25), 0, H, GREEN);
        t.ok(rightBand.n > 30, 'chart-axes', 'the common Y axis draws on the right in its own colour',
            `right=${rightBand.n} left=${leftBand.n}`);
        t.equal(leftBand.n, 0, 'chart-axes', 'and nothing of it is left on the left edge');
        t.ok(rightBand.minX > W * 0.7, 'chart-axes', 'the right-hand axis starts well inside the right band',
            `minX=${rightBand.minX}`);

        // --- the COMMON X axis moved to the TOP: its blue ink must be above the plot ---
        const top = await renderPng(host, form('GrumpyXYPlot', 'Points="0,2 1,5 2,3" GridStyle="Dot"', `
      <charts:GrumpyXYPlot.XAxis>
        <charts:Axis Position="Top" AxisColor="#0000FF"/>
      </charts:GrumpyXYPlot.XAxis>`), 340, 220);
        const topBand = ink(top.img, 0, W, 0, Math.round(H * 0.3), BLUE);
        const bottomBand = ink(top.img, 0, W, Math.round(H * 0.8), H, BLUE);
        t.ok(topBand.n > 25, 'chart-axes', 'the common X axis draws above the plot in its own colour',
            `top=${topBand.n} bottom=${bottomBand.n}`);
        // Not exactly 0: a couple of bluish anti-aliased pixels can come from the frame, so the
        // check is that the bottom edge is left essentially bare.
        t.ok(bottomBand.n * 4 < topBand.n, 'chart-axes', 'and nothing of it stays at the bottom edge',
            `top=${topBand.n} bottom=${bottomBand.n}`);

        // --- TWO per-series axes on the RIGHT must stack, not overlap (magenta further out than green) ---
        const stacked = await renderPng(host, form('GrumpyXYPlot', 'GridStyle="Dot"', `
      <charts:XYSeries XColumn="B" YColumn="C" AxisMode="PerSeries" LineColor="#FF0000" Thickness="3">
        <charts:XYSeries.YAxis>
          <charts:Axis Position="Right" AxisColor="#00AA00" ShowAxisName="False"/>
        </charts:XYSeries.YAxis>
      </charts:XYSeries>
      <charts:XYSeries XColumn="D" YColumn="E" AxisMode="PerSeries" LineColor="#FF0000" MarkerStyle="None">
        <charts:XYSeries.YAxis>
          <charts:Axis Position="Right" AxisColor="#AA00AA" ShowAxisName="False"/>
        </charts:XYSeries.YAxis>
      </charts:XYSeries>`), 340, 220);
        t.ok(!stacked.frame.error, 'chart-axes', 'a chart with two per-series axes renders', stacked.frame.error || '');
        const green = ink(stacked.img, 0, W, 0, H, GREEN);
        const magenta = ink(stacked.img, 0, W, 0, H, MAGENTA);
        t.ok(green.n > 20 && magenta.n > 20, 'chart-axes',
            'each per-series axis draws in its own colour', `green=${green.n} magenta=${magenta.n}`);
        t.ok(magenta.maxX > green.maxX, 'chart-axes',
            'the second axis on the same side sits further outside the first',
            `green maxX=${green.maxX} magenta maxX=${magenta.maxX}`);
    } finally {
        host.close();
    }
};
