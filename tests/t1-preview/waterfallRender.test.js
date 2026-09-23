/* T1 — the WATERFALL chart as PIXELS: a 3D projection is exactly the kind of thing that compiles, renders
 * and draws nothing usable, so every claim here is MEASURED off the PNG rather than eyeballed.
 *
 * What can go wrong silently in a projected chart (and what each measurement is for):
 *   - the projection collapses (a bad angle, a scale of 0, a fit that divides by a zero span) → the three
 *     sets would sit on top of each other, so the test measures that each successive set is drawn HIGHER
 *     on screen — that is the depth axis, and the one thing a waterfall must show;
 *   - the painter's order is backwards, so the FAR ribbon covers the near ones (the picture still "looks
 *     like a chart") — the same measurement catches it, because the near set must be drawn lowest;
 *   - the Value mode's gradient silently becomes one flat colour (an edge-on value axis, or a gradient
 *     brush that Avalonia refuses) — so the test counts how many of the heat map's five stops are
 *     actually present;
 *   - the Split mode's threshold never cuts anything, or cuts at the wrong place — so both colours must
 *     be present AND the above-threshold one must lie above the below-threshold one;
 *   - the connectors are drawn with the wrong colour or not at all (the mesh is the whole point);
 *   - 2048 samples × several sets is the stated workload, so it must render, thinned, in a sane time.
 */
'use strict';
const net = require('net');
const path = require('path');
const { startHost, renderPng } = require('../helpers/host');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" '
    + 'xmlns:charts="using:AvaloniaCharts"';
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'chartdata.xlsx');
const W = 360;
const H = 240;

// The palette a chart written INLINE colours its samplesets with (GrumpyWaterfallPlot.SetPalette).
const SET1 = [45, 125, 210];    // #2D7DD2
const SET2 = [228, 87, 46];     // #E4572E
const SET3 = [63, 163, 77];     // #3FA34D
const CONNECTOR = [107, 122, 143];  // #6B7A8F
// The Value mode's heat map, from the least value to the greatest.
const HEAT = [[27, 42, 107], [30, 136, 229], [67, 160, 71], [253, 216, 53], [229, 57, 53]];

const THREE = '5,10,15,10,5; 5,10,15,10,5; 5,10,15,10,5';
const DIFFERENT = '6,11,8,14,9,15,10,13; 9,7,14,11,16,12,9,15; 4,12,9,8,13,10,15,8';

function freePort() {
    return new Promise((res) => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    });
}

const form = (body, w = W, h = H) => `<Window ${NS} Title="waterfall" Width="${w}" Height="${h}">
  <Canvas Name="Holder" Width="${w}" Height="${h}">
${body}
  </Canvas>
</Window>`;

const rgb = (img, x, y) => {
    const i = (y * img.width + x) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
};
const near = (a, b, slack = 20) => a.every((v, i) => Math.abs(v - b[i]) <= slack);

/** How many pixels carry a colour, where its rows are (top and bottom) and its mean row. */
function measure(img, colour) {
    let count = 0;
    let top = -1;
    let bottom = -1;
    let sum = 0;
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            if (!near(rgb(img, x, y), colour)) continue;
            count++;
            sum += y;
            if (top < 0 || y < top) top = y;
            if (y > bottom) bottom = y;
        }
    }
    return { count, top, bottom, mean: count ? sum / count : -1 };
}

/** Every pixel that is not the chart's white plate — the picture's own ink, with its bounding box. */
function ink(img) {
    let count = 0;
    let top = img.height;
    let bottom = -1;
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            const p = rgb(img, x, y);
            if (p[0] > 245 && p[1] > 245 && p[2] > 245) continue;
            count++;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
        }
    }
    return { count, top, bottom, height: bottom < 0 ? 0 : bottom - top + 1 };
}

/** How many of the heat map's stops show up (each with a little slack, so a blend counts for neither). */
function heatStops(img) {
    let found = 0;
    for (const stop of HEAT) {
        let hits = 0;
        for (let y = 0; y < img.height && hits < 12; y++) {
            for (let x = 0; x < img.width; x++) {
                if (near(rgb(img, x, y), stop, 6)) { hits++; break; }
            }
        }
        if (hits >= 12) found++;
    }
    return found;
}

module.exports = async (t) => {
    t.section('T1: the waterfall chart (a projected 3D waterfall)');

    const host = await startHost(await freePort());
    try {
        const shot = (body, w = W, h = H) => renderPng(host, form(body, w, h), w, h);

        // ---------------------------------------------------------------- three sets, three colours
        const three = await shot(`    <charts:GrumpyWaterfallPlot x:Name="Wf1" Width="${W}" Height="${H}"
      SampleSets="${THREE}" ShowTitle="False" ShowLegend="False"/>`);
        const set1 = measure(three.img, SET1);
        const set2 = measure(three.img, SET2);
        const set3 = measure(three.img, SET3);
        for (const [name, m, colour] of [['set 1', set1, SET1], ['set 2', set2, SET2], ['set 3', set3, SET3]]) {
            t.ok(m.count > 400, 'sets', `${name} is drawn (${m.count}px of rgb(${colour}))`, `${m.count}px`);
        }

        // The depth axis: with the default 45° / 30° view every successive sampleset stands further back,
        // which puts it HIGHER on screen. Identical values in all three sets make that the only difference.
        t.ok(set3.mean < set2.mean && set2.mean < set1.mean, 'depth',
            'each successive sampleset is drawn higher on screen — the depth axis is real',
            `means ${set1.mean.toFixed(1)} / ${set2.mean.toFixed(1)} / ${set3.mean.toFixed(1)}`);
        t.ok(set1.mean - set3.mean > 8, 'depth',
            'and the sets are far enough apart to read as depth, not as one thick line',
            `${(set1.mean - set3.mean).toFixed(1)}px`);

        // The painter's algorithm: a nearer ribbon must cover what is behind it, so the NEAREST set's own
        // colour has to survive the most, and the far one the least (its lower half is hidden).
        t.ok(set1.count > set3.count * 1.15, 'order',
            'the nearest sampleset shows more of itself than the far one — nearer ribbons hide the rest',
            `${set1.count}px vs ${set3.count}px`);

        // ---------------------------------------------------------------- connectors
        // A colour of its own for the mesh, so "no connectors" cannot be confused with the floor grid.
        const MESH = '#123456';
        const meshRgb = [18, 52, 86];
        const mesh = await shot(`    <charts:GrumpyWaterfallPlot x:Name="Wf2" Width="${W}" Height="${H}"
      SampleSets="${THREE}" ShowTitle="False" ShowLegend="False" ShowConnectors="True" ConnectorColor="${MESH}"/>`);
        const noMesh = await shot(`    <charts:GrumpyWaterfallPlot x:Name="Wf3" Width="${W}" Height="${H}"
      SampleSets="${THREE}" ShowTitle="False" ShowLegend="False" ShowConnectors="False" ConnectorColor="${MESH}"/>`);
        const meshPixels = measure(mesh.img, meshRgb).count;
        const noMeshPixels = measure(noMesh.img, meshRgb).count;
        t.ok(meshPixels > 100, 'connectors', 'the mesh between the sets is drawn in the connector colour',
            `${meshPixels}px`);
        t.equal(noMeshPixels, 0, 'connectors', 'and switching it off leaves none of it', `${noMeshPixels}px`);
        t.ok(ink(mesh.img).count > ink(noMesh.img).count, 'connectors',
            'so the picture with the mesh really has more ink in it');

        // ---------------------------------------------------------------- ribbon styles
        const lines = await shot(`    <charts:GrumpyWaterfallPlot x:Name="Wf4" Width="${W}" Height="${H}"
      SampleSets="${THREE}" ShowTitle="False" ShowLegend="False" RibbonStyle="Lines"/>`);
        t.ok(ink(lines.img).count < ink(three.img).count * 0.6, 'style',
            'Lines fills nothing, so the mesh-only picture carries far less ink',
            `${ink(lines.img).count}px vs ${ink(three.img).count}px`);
        const translucent = await shot(`    <charts:GrumpyWaterfallPlot x:Name="Wf5" Width="${W}" Height="${H}"
      SampleSets="${THREE}" ShowTitle="False" ShowLegend="False" RibbonStyle="Translucent" RibbonOpacity="40"/>`);
        // See-through ribbons let the plates through, so the exact palette colour is thinned out — what must
        // hold is that the picture is still there and now differs from the solid one.
        t.ok(translucent.img.data.length === three.img.data.length, 'style',
            'a translucent ribbon renders at the same size (the style is handled, not ignored)');
        let differing = 0;
        for (let i = 0; i < translucent.img.data.length; i += 4) {
            if (translucent.img.data[i] !== three.img.data[i]) differing++;
        }
        t.ok(differing > 2000, 'style',
            'and it really differs from the solid one — opacity is applied to the fill', `${differing}px`);

        // ---------------------------------------------------------------- the Value heat map
        // Flat feet and a wide peak, so the map's two ends are each a real REGION of the picture (the
        // colour follows the value continuously, so only samples at the data's own extremes reach the
        // pure end colours): the peak must come out in the hot end of the map and the feet in the cold.
        const PEAKS = '2,2,2,18,18,18,2,2; 2,2,2,18,18,18,2,2';
        const heat = await shot(`    <charts:GrumpyWaterfallPlot x:Name="Wf6" Width="${W}" Height="${H}"
      SampleSets="${PEAKS}" ShowTitle="False" ShowLegend="False" ColorMode="Value"/>`);
        const stops = heatStops(heat.img);
        t.ok(stops >= 4, 'heat', `the Value mode really paints a heat map (${stops} of 5 stops present)`,
            `stops ${stops}`);
        const heatHot = measure(heat.img, HEAT[4]);
        const heatCold = measure(heat.img, HEAT[0]);
        t.ok(heatHot.count > 30 && heatCold.count > 100, 'heat',
            'both ends of the map are painted (the peaks and the troughs)',
            `${heatHot.count}px hot / ${heatCold.count}px cold`);
        t.ok(heatHot.mean < heatCold.mean, 'heat',
            'and the hot end sits HIGHER on the peaks than the cold end does at the foot — the colour '
            + 'follows the value, not the row',
            `hot at y≈${heatHot.mean.toFixed(0)}, cold at y≈${heatCold.mean.toFixed(0)}`);

        // ---------------------------------------------------------------- the Split threshold
        const split = await shot(`    <charts:GrumpyWaterfallPlot x:Name="Wf7" Width="${W}" Height="${H}"
      SampleSets="${DIFFERENT}" ShowTitle="False" ShowLegend="False" ColorMode="Split" SplitValue="10"/>`);
        const below = measure(split.img, SET1);   // BelowColor defaults to #2D7DD2
        const above = measure(split.img, SET2);   // AboveColor defaults to #E4572E
        t.ok(below.count > 200 && above.count > 200, 'split',
            'both sides of the threshold are painted', `${below.count}px below / ${above.count}px above`);
        t.ok(above.mean < below.mean, 'split',
            'and the above-threshold colour sits HIGHER: the cut follows the value, not the row',
            `means ${below.mean.toFixed(1)} below / ${above.mean.toFixed(1)} above`);

        // ---------------------------------------------------------------- the angles are the view
        // No border: the frame is ink too, and it would hide the picture's own extent behind a full-height
        // rectangle (measured: every view came out 240px tall until the border was switched off).
        const flat = await shot(`    <charts:GrumpyWaterfallPlot x:Name="Wf8" Width="${W}" Height="${H}"
      SampleSets="${THREE}" ShowTitle="False" ShowLegend="False" ShowBorder="False" Elevation="8"/>`);
        const steep = await shot(`    <charts:GrumpyWaterfallPlot x:Name="Wf9" Width="${W}" Height="${H}"
      SampleSets="${THREE}" ShowTitle="False" ShowLegend="False" ShowBorder="False" Elevation="70"/>`);
        t.ok(ink(flat.img).height !== ink(steep.img).height, 'angles',
            'Elevation changes the picture (a flat view is not the same height as a steep one)',
            `${ink(flat.img).height}px vs ${ink(steep.img).height}px`);
        const turned = await shot(`    <charts:GrumpyWaterfallPlot x:Name="Wf10" Width="${W}" Height="${H}"
      SampleSets="${THREE}" ShowTitle="False" ShowLegend="False" ShowBorder="False" Azimuth="90"/>`);
        const turnedSet2 = measure(turned.img, SET2);
        const straightSet2 = measure(three.img, SET2);
        t.ok(Math.abs(turnedSet2.mean - straightSet2.mean) > 2, 'angles',
            'and so does Azimuth (the sets no longer stand one behind the other in the same way)',
            `${straightSet2.mean.toFixed(1)} vs ${turnedSet2.mean.toFixed(1)}`);

        // ---------------------------------------------------------------- Zoom, and one set
        const zoomed = await shot(`    <charts:GrumpyWaterfallPlot x:Name="Wf11" Width="${W}" Height="${H}"
      SampleSets="${THREE}" ShowTitle="False" ShowLegend="False" ShowBorder="False" Zoom="1.5"/>`);
        const plain = await shot(`    <charts:GrumpyWaterfallPlot x:Name="Wf14" Width="${W}" Height="${H}"
      SampleSets="${THREE}" ShowTitle="False" ShowLegend="False" ShowBorder="False"/>`);
        t.ok(ink(zoomed.img).height > ink(plain.img).height, 'zoom',
            'Zoom enlarges the fitted picture', `${ink(plain.img).height}px vs ${ink(zoomed.img).height}px`);
        const single = await shot(`    <charts:GrumpyWaterfallPlot x:Name="Wf12" Width="${W}" Height="${H}"
      Values="4,9,14,7,11" ShowTitle="False" ShowLegend="False"/>`);
        t.ok(ink(single.img).count > 500, 'data',
            'a chart with ONE sampleset (Values) still draws it', `${ink(single.img).count}px`);

        // ---------------------------------------------------------------- 2048 samples, thinned
        const many = Array.from({ length: 2048 }, (_, i) => Math.round(50 + 40 * Math.sin(i / 40)));
        const started = Date.now();
        const big = await shot(`    <charts:GrumpyWaterfallPlot x:Name="Wf13" Width="${W}" Height="${H}"
      SampleSets="${[many, many.map((v) => v - 8), many.map((v) => v - 16)].map((s) => s.join(',')).join('; ')}"
      ShowTitle="False" ShowLegend="False"/>`, 480, 320);
        const elapsed = Date.now() - started;
        t.ok(ink(big.img).count > 2000, 'big', '2048 samples × 3 sets renders', `${ink(big.img).count}px`);
        t.ok(elapsed < 15000, 'big', 'and it renders in a sane time', `${elapsed}ms`);

        // ---------------------------------------------------------------- one spreadsheet COLUMN per set
        // The real workload: a capture is one column per sweep, which is the SERIES path (one series per
        // sampleset), not the inline one. Each set must come out in its own series colour.
        const sheet = await shot(`    <charts:GrumpyWaterfallPlot x:Name="Wf15" Width="${W}" Height="${H}"
      SourceFile="${FIXTURE}" YColumn="C" ShowTitle="False" ShowLegend="False">
        <charts:LineSeries Title="Set 1" YColumn="C" LineColor="#2D7DD2"/>
        <charts:LineSeries Title="Set 2" YColumn="D" LineColor="#E4572E"/>
      </charts:GrumpyWaterfallPlot>`);
        const sheetFirst = measure(sheet.img, SET1);
        const sheetSecond = measure(sheet.img, SET2);
        t.ok(sheetFirst.count > 300 && sheetSecond.count > 300, 'series',
            'two workbook columns are drawn as two samplesets, each in its series colour',
            `${sheetFirst.count}px / ${sheetSecond.count}px`);
        t.ok(sheetSecond.mean < sheetFirst.mean, 'series',
            'and the SECOND set is drawn further back (higher on screen) than the first',
            `means ${sheetFirst.mean.toFixed(1)} / ${sheetSecond.mean.toFixed(1)}`);
    } finally {
        host.close();
    }
};
