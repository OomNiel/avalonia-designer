/* T1 — the BAR, AREA and PIE chart types as PIXELS: the three shapes the chart set gained on
 * 2026-09-21.
 *
 * Why this exists: every claim here is about DRAWING, and the property/round-trip tests cannot see it.
 * A bar chart, an area chart and a pie all "compile" and all "render" while drawing nothing useful —
 * and two real bugs shipped that way during development and were caught exactly by measuring:
 *   1. the bar slot was measured through a ZERO-length mapping, so every bar fell back to the plot's
 *      full width and the bars merged into one stepped area (a chart that still looks like a chart);
 *   2. the 100%-stacked scale was fitted to the RAW totals while the drawing worked in percentages,
 *      so every shape was drawn far above the plot and clipped away (an empty chart).
 * So this file measures structure, not just "is there ink": the bars must be SEPARATE (with gaps), their
 * heights must be proportional to the data, stacked columns must carry both colours in the same column
 * while grouped ones must not, a 100% stack must fill the category, and a doughnut must have a hole.
 */
'use strict';
const net = require('net');
const fs = require('fs');
const path = require('path');
const { startHost, renderPng, HOST_BIN } = require('../helpers/host');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" '
    + 'xmlns:charts="using:AvaloniaCharts"';
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'chartdata.xlsx');
const W = 360;
const H = 240;

const BLUE = [45, 125, 210];    // #2D7DD2 — the first series
const ORANGE = [228, 87, 46];   // #E4572E — the second series
const GREEN = [140, 179, 105];  // #8CB369 — the exploded slice's own colour

function freePort() {
    return new Promise((res) => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    });
}

const form = (body, w = W, h = H) => `<Window ${NS} Title="newcharts" Width="${w}" Height="${h}">
  <Canvas Name="Holder" Width="${w}" Height="${h}">
${body}
  </Canvas>
</Window>`;

const twoSeries = `
      <charts:LineSeries Title="North" YColumn="C" LineColor="#2D7DD2" MarkerStyle="None"/>
      <charts:LineSeries Title="South" YColumn="D" LineColor="#E4572E" MarkerStyle="None"/>`;

const rgb = (img, x, y) => {
    const i = (y * img.width + x) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
};
const near = (a, b, slack = 24) => a.every((v, i) => Math.abs(v - b[i]) <= slack);

/** Per-column counts of each series colour, over the whole picture. */
function columns(img) {
    const out = [];
    for (let x = 0; x < img.width; x++) {
        let blue = 0;
        let orange = 0;
        let green = 0;
        let firstBlue = -1;
        let lastBlue = -1;
        for (let y = 0; y < img.height; y++) {
            const p = rgb(img, x, y);
            if (near(p, BLUE)) { blue++; if (firstBlue < 0) firstBlue = y; lastBlue = y; }
            if (near(p, ORANGE)) orange++;
            if (near(p, GREEN)) green++;
        }
        out.push({ x, blue, orange, green, firstBlue, lastBlue });
    }
    return out;
}

/** Runs of consecutive columns that carry a colour — one run per bar. */
function runsOf(cols, pick) {
    const runs = [];
    for (const c of cols) {
        if (pick(c) <= 2) continue;
        const last = runs[runs.length - 1];
        if (last && c.x === last.xEnd + 1) { last.xEnd = c.x; last.count++; }
        else runs.push({ xStart: c.x, xEnd: c.x, count: 1 });
    }
    return runs;
}

module.exports = async (t) => {
    t.section('newChartsRender');

    if (!fs.existsSync(HOST_BIN)) {
        t.note('host binary missing — skipping (build the host first)');
        return;
    }
    if (!fs.existsSync(FIXTURE)) {
        t.fail('newcharts', 'fixture', `missing workbook fixture: ${FIXTURE}`);
        return;
    }

    const host = await startHost(await freePort());
    try {
        const shot = (body, w = W, h = H) => renderPng(host, form(body, w, h), w, h);

        // ---------------------------------------------------------------- BARS from typed values
        // One bar per value, so the heights must be proportional to 8, 14, 10, 16, 12 and there must
        // be a GAP between them (the bug above drew one solid block).
        const typed = await shot(`    <charts:GrumpyBarPlot x:Name="Bar1" Width="${W}" Height="${H}"
      Values="8,14,10,16,12" ShowTitle="False" ShowLegend="False" BarWidth="0.6"/>`);
        const typedCols = columns(typed.img);
        const bars = runsOf(typedCols, (c) => c.blue);
        t.equal(bars.length, 5, 'bars', `five bars are drawn, one per value (${bars.length})`);
        const heights = bars.map((b) => {
            let top = -1;
            let bottom = -1;
            for (const c of typedCols) {
                if (c.x < b.xStart || c.x > b.xEnd || c.blue <= 2) continue;
                if (top < 0 || c.firstBlue < top) top = c.firstBlue;
                if (c.lastBlue > bottom) bottom = c.lastBlue;
            }
            return bottom - top + 1;
        });
        const ratios = heights.map((h) => h / heights[0]);
        const expected = [8, 14, 10, 16, 12].map((v) => v / 8);
        t.ok(ratios.every((r, i) => Math.abs(r - expected[i]) < 0.06), 'bars',
            'every bar is as tall as its value (8,14,10,16,12)', `ratios ${ratios.map((r) => r.toFixed(2))}`);
        const gaps = [];
        for (let i = 1; i < bars.length; i++) gaps.push(bars[i].xStart - bars[i - 1].xEnd - 1);
        t.ok(gaps.every((g) => g > 4), 'bars',
            'and the bars are SEPARATE — the gap Bar Width leaves is really empty', `gaps ${gaps.join(',')}`);

        // ---------------------------------------------------------------- grouped vs stacked
        const grouped = await shot(`    <charts:GrumpyBarPlot x:Name="Bar2" Width="${W}" Height="${H}"
      SourceFile="${FIXTURE}" XColumn="A" YColumn="C" ShowTitle="False" ShowLegend="False" BarMode="Grouped">
${twoSeries}
    </charts:GrumpyBarPlot>`);
        const groupedCols = columns(grouped.img);
        const groupedBoth = groupedCols.filter((c) => c.blue > 2 && c.orange > 2).length;
        t.equal(groupedBoth, 0, 'modes',
            'grouped bars never share a column: each series has its own bar side by side');
        t.ok(runsOf(groupedCols, (c) => c.blue).length >= 5, 'modes',
            'and every category has both bars (measured on the first colour)');

        const stacked = await shot(`    <charts:GrumpyBarPlot x:Name="Bar3" Width="${W}" Height="${H}"
      SourceFile="${FIXTURE}" XColumn="A" YColumn="C" ShowTitle="False" ShowLegend="False" BarMode="Stacked">
${twoSeries}
    </charts:GrumpyBarPlot>`);
        const stackedCols = columns(stacked.img);
        const stackedBoth = stackedCols.filter((c) => c.blue > 2 && c.orange > 2).length;
        t.ok(stackedBoth > 20, 'modes',
            'stacked bars DO share their columns — the second series sits on top of the first', `${stackedBoth}px`);

        // ---------------------------------------------------------------- 100% stacks fill their slot
        const hundred = await shot(`    <charts:GrumpyBarPlot x:Name="Bar4" Width="${W}" Height="${H}"
      SourceFile="${FIXTURE}" XColumn="A" YColumn="C" ShowTitle="False" ShowLegend="False" BarMode="Stacked100">
${twoSeries}
    </charts:GrumpyBarPlot>`);
        const hundredCols = columns(hundred.img);
        const hundredBars = runsOf(hundredCols, (c) => c.blue + c.orange);
        t.ok(hundredBars.length > 0, 'modes', 'a 100% stack draws something (the scale bug drew NOTHING here)');
        const tall = hundredBars.map((b) => {
            let top = hundred.img.height;
            let bottom = 0;
            for (const c of hundredCols) {
                if (c.x < b.xStart || c.x > b.xEnd || c.blue + c.orange <= 2) continue;
                for (let y = 0; y < hundred.img.height; y++) {
                    const p = rgb(hundred.img, c.x, y);
                    if (near(p, BLUE) || near(p, ORANGE)) { if (y < top) top = y; if (y > bottom) bottom = y; }
                }
            }
            return bottom - top + 1;
        });
        // Every 100% bar reaches 100% of the scale, so all of them are the same height.
        t.ok(tall.every((h) => Math.abs(h - tall[0]) <= 2), 'modes',
            'every 100% stack is the same height (they all total 100%)', tall.join(','));

        // ---------------------------------------------------------------- AREAS
        const area = await shot(`    <charts:GrumpyAreaPlot x:Name="Area1" Width="${W}" Height="${H}"
      Values="6,11,8,14,9,15" ShowTitle="False" ShowLegend="False" AreaOpacity="100">
    </charts:GrumpyAreaPlot>`);
        const areaCols = columns(area.img);
        // A filled area: nearly every plot column carries the colour (a line would only touch a few).
        const filled = areaCols.filter((c) => c.blue > 4).length;
        t.ok(filled > 100, 'areas', 'the area under the line is filled, not just stroked', `${filled}px`);

        const areaStack = await shot(`    <charts:GrumpyAreaPlot x:Name="Area2" Width="${W}" Height="${H}"
      SourceFile="${FIXTURE}" XColumn="A" YColumn="C" ShowTitle="False" ShowLegend="False"
      AreaMode="Stacked" AreaOpacity="100">
${twoSeries}
    </charts:GrumpyAreaPlot>`);
        const areaStackBoth = columns(areaStack.img).filter((c) => c.blue > 2 && c.orange > 2).length;
        t.ok(areaStackBoth > 5, 'areas',
            'a stacked area puts the second series on top of the first in the same columns', `${areaStackBoth}px`);

        // ---------------------------------------------------------------- PIES
        const pie = await shot(`    <charts:GrumpyPiePlot x:Name="Pie1" Width="220" Height="220"
      Labels="North,South,East,West" Values="32,24,18,26" ShowTitle="False" ShowLegend="False"/>`, 240, 240);
        const pieCentre = rgb(pie.img, 120, 120);
        t.ok(!near(pieCentre, [255, 255, 255], 8), 'pies', 'a solid pie has no hole: its centre is a wedge');
        // Four wedges in four different colours, so the centre column must cross at least two colours.
        const half = pie.img.width / 2;
        let seen = new Set();
        for (let y = 6; y < pie.img.height - 6; y++) {
            const p = rgb(pie.img, half, y);
            if (near(p, [255, 255, 255], 6)) continue;
            seen.add(p.join(','));
        }
        t.ok(seen.size >= 2, 'pies', 'a pie is cut into wedges, not painted one colour', `${seen.size} shades`);

        const doughnut = await shot(`    <charts:GrumpyPiePlot x:Name="Pie2" Width="220" Height="220"
      Labels="North,South,East,West" Values="32,24,18,26" DoughnutPercent="45" SliceBorderThickness="0"
      ShowTitle="False" ShowLegend="False">
      <charts:GrumpyPiePlot.Slices>
        <charts:PieSlice Title="South" LineColor="#8CB369" Explode="12"/>
      </charts:GrumpyPiePlot.Slices>
    </charts:GrumpyPiePlot>`, 240, 240);
        t.ok(near(rgb(doughnut.img, 120, 120), [255, 255, 255], 10), 'pies',
            'the doughnut hole is empty right through the middle', rgb(doughnut.img, 120, 120).join(','));
        const greenCols = columns(doughnut.img).filter((c) => c.green > 2).length;
        t.ok(greenCols > 20, 'pies',
            'and the slice the form named really is drawn in ITS colour (the override works)', `${greenCols}px`);

        // A workbook pie reads its SLICE NAMES from the sheet's label column (which holds text).
        const sheetPie = await shot(`    <charts:GrumpyPiePlot x:Name="Pie3" Width="220" Height="220"
      SourceFile="${FIXTURE}" XColumn="A" YColumn="C" ShowTitle="False" ShowLegend="True"/>`, 240, 240);
        const colourful = new Set();
        for (let y = 0; y < sheetPie.img.height; y++) {
            for (let x = 0; x < sheetPie.img.width; x++) {
                const p = rgb(sheetPie.img, x, y);
                if (!near(p, [255, 255, 255], 12)) colourful.add(p.join(','));
            }
        }
        t.ok(colourful.size > 20, 'pies',
            'a spreadsheet-bound pie draws wedges from its label + value columns', `${colourful.size} shades`);
    } finally {
        host.close();
    }
};
