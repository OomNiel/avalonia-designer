/* T1 — the chart SERIES path end to end: <charts:LineSeries> / <charts:XYSeries> children (and a
 * per-series nested <charts:Axis>) must reach the renderer through the REAL host.
 *
 * Why this exists: a chart's series are child ELEMENTS holding plain C# objects, so the designer's
 * normal element recursion (Panel children / ContentControl content / item containers) never touches
 * them — the host needed its own `ApplyChartSeries`. A series attribute that the host cannot map (a
 * typo, a renamed property, a nested axis it ignores) fails SILENTLY: the chart just draws one line
 * in the default colour. So this renders a workbook-backed chart with two series in two colours and
 * counts the pixels of each, then does the same for a per-series axis and looks for its ink in the
 * RIGHT gutter (the only place a per-series Y axis can be).
 *
 * The workbook is `tests/fixtures/chartdata.xlsx` (B/C = "Time"/"Inside", D/E = "Time2"/"Outside",
 * names in row 1, numbers in rows 2–7) and is referenced by ABSOLUTE path — exactly what the
 * designer writes when Browse picks a file.
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

/** A form with one chart at 0,0 holding the given series children. */
const form = (tag, attrs, children) => `<Window ${NS} Title="series" Width="340" Height="220">
  <Canvas Name="Holder" Width="340" Height="220">
    <charts:${tag} x:Name="Chart1" Width="${W}" Height="${H}" SourceFile="${FIXTURE}"
      ShowTitle="False" ${attrs}>
      ${children}
    </charts:${tag}>
  </Canvas>
</Window>`;

/** Counts pixels in a region that are clearly red / blue / green / neutral grey. */
function paint(img, x0, x1, y0, y1) {
    const out = { red: 0, blue: 0, green: 0, grey: 0, total: 0 };
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const i = (y * img.width + x) * 4;
            const r = img.data[i];
            const g = img.data[i + 1];
            const b = img.data[i + 2];
            out.total++;
            if (r > 190 && g < 70 && b < 70) out.red++;
            else if (b > 190 && r < 70 && g < 70) out.blue++;
            else if (g > 110 && r < 90 && b < 90) out.green++;
            else if (Math.abs(r - g) < 45 && Math.abs(g - b) < 45 && r > 90 && r < 200) out.grey++;
        }
    }
    return out;
}
const region = (img, x0, x1, y0, y1) => paint(img, x0, x1, y0, y1);

module.exports = async (t) => {
    t.section('chart series');

    if (!fs.existsSync(HOST_BIN)) {
        t.note('host binary missing — skipping (build the host first)');
        return;
    }
    if (!fs.existsSync(FIXTURE)) {
        t.fail('chart-series', 'fixture', `missing workbook fixture: ${FIXTURE}`);
        return;
    }

    const host = await startHost(await freePort());
    try {
        // --- two LINE series, two columns (C and E), two colours ---
        const lines = await renderPng(host, form('GrumpyLinePlot', 'XColumn="B"', `
      <charts:LineSeries YColumn="C" LineColor="#FF0000" LineThickness="3"/>
      <charts:LineSeries YColumn="E" LineColor="#0000FF" LineThickness="3"/>`), 340, 220);
        t.ok(!lines.frame.error, 'chart-series', 'a two-series line chart renders', lines.frame.error || '');
        const lc = region(lines.img, 0, W, 0, H);
        t.ok(lc.red > 60, 'chart-series', 'series 1 is drawn in its own colour (red)', `red=${lc.red}`);
        t.ok(lc.blue > 60, 'chart-series', 'series 2 is drawn in its own colour (blue)', `blue=${lc.blue}`);

        // The chart's own (legacy) styling must NOT colour the lines once explicit series exist.
        const legacy = await renderPng(host, form('GrumpyLinePlot', 'XColumn="B" LineColor="#00AA00"', `
      <charts:LineSeries YColumn="C" LineColor="#FF0000" LineThickness="3"/>
      <charts:LineSeries YColumn="E" LineColor="#0000FF" LineThickness="3"/>`), 340, 220);
        const lg = region(legacy.img, 0, W, 0, H);
        t.ok(lg.red > 60 && lg.blue > 60 && lg.green === 0, 'chart-series',
            'the chart-level LineColor no longer colours an explicit series',
            `red=${lg.red} blue=${lg.blue} green=${lg.green}`);

        // --- an X,Y chart: one COMMON series + one PER-SERIES series with its own right-hand axis ---
        const mixed = await renderPng(host, form('GrumpyXYPlot',
            'XColumn="B" YColumn="C" AxisColor="#888888" ShowMajorTicks="True" ShowTickLabels="True"', `
      <charts:XYSeries YColumn="C" LineColor="#FF0000" LineThickness="3" MarkerStyle="None"/>
      <charts:XYSeries AxisMode="PerSeries" XColumn="D" YColumn="E" LineColor="#0000FF" LineThickness="3" MarkerStyle="None">
        <charts:XYSeries.YAxis>
          <charts:Axis Position="Right" AxisColor="#00AA00" ShowMajorTicks="True" ShowTickLabels="True"/>
        </charts:XYSeries.YAxis>
      </charts:XYSeries>`), 340, 220);
        t.ok(!mixed.frame.error, 'chart-series', 'a common + per-series X,Y chart renders', mixed.frame.error || '');
        const mc = region(mixed.img, 0, W, 0, H);
        t.ok(mc.red > 60 && mc.blue > 60, 'chart-series',
            'both the common and the per-series line are drawn', `red=${mc.red} blue=${mc.blue}`);
        // A per-series Y axis lives in the RIGHT gutter; the common one stays on the left.
        const right = region(mixed.img, Math.round(W * 0.72), W, 0, H);
        const left = region(mixed.img, 0, Math.round(W * 0.24), 0, H);
        t.ok(right.green > 30, 'chart-series',
            'the nested per-series axis is drawn in the right gutter, in its own colour',
            `green=${right.green} blue=${right.blue}`);
        t.ok(left.grey > 30, 'chart-series',
            'the common axis is still drawn on the left', `grey=${left.grey}`);
    } finally {
        host.close();
    }
};
