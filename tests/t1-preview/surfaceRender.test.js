/* T1 — the SURFACE CHART 3D as PIXELS. A projected grid is the most fragile picture in the family: it can
 * compile, "render" and hand back a blank plate (the host's XAML loader silently DROPS a control type it
 * cannot build — measured 2026-09-23), it can collapse the projection, and each of the three styles can
 * silently turn into one of the others. So every claim here is MEASURED off the PNG.
 *
 * What each measurement is for:
 *   - the three styles differ the way the names say: GridMesh is LINES only (little ink, all of it the mesh
 *     colour), Solid is a FILLED sheet with no mesh line on it at all, and GridMeshSolid is the fill PLUS
 *     the mesh — so a solid sheet loses a few of its own pixels to the grey painted over it;
 *   - the temperature ramp really is a ramp: plenty of the sheet sits at its cold end and a real band of it
 *     at the hot end, Colour By="Sampleset" replaces both with the palette, and Heat Min/Max RE-PIN the
 *     ramp (a 40..50 window must push almost the whole sheet to the cold end, while 0..100 must be
 *     identical to leaving them alone);
 *   - SolidOpacity really fades the metal: at 40 % the sheet loses most of its colour to the plate;
 *   - the legend of a surface is its RANGE WINDOW (MinX/MaxX, MinY/MaxY): a narrow width window must
 *     MAGNIFY the sheet (pixels per millimetre goes up, and a narrower window magnifies more), the value
 *     window must re-fit instead of cropping (the sheet still fills the frame), and a window must really
 *     cut the data (below the window the surface flattens onto the window's floor);
 *   - the VIEW is real: edge on (elevation 0) shows the corrugated profile as a tall wall of colour,
 *     looking straight down collapses the height axis, and turning the azimuth or packing the slices
 *     (ZSpacing) changes the picture — a chart that ignored them would draw the same PNG for every angle.
 */
'use strict';
const fs = require('fs');
const net = require('net');
const path = require('path');
const { startHost, renderPng, HOST_BIN } = require('../helpers/host');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" '
    + 'xmlns:charts="using:AvaloniaCharts"';
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'surface.xlsx');
const W = 380;
const H = 260;
// The fixture's geometry: X runs 0..198 mm over 12 samples, and every slice is 0..50 mm high.
const X_SPAN = 198;

// The ramp ends the chart ships with, and the per-slice palette the series colours are taken from.
const LOW = [27, 42, 107];      // #1B2A6B — the valleys
const HIGH = [229, 57, 53];     // #E53935 — the ridges
const MESH = [107, 122, 143];   // #6B7A8F
const SLICE_COLORS = ['#2D7DD2', '#EE6C4D', '#3D9970', '#B07CC6', '#D9A519', '#4C9FDC'];
const SLICE_RGB = SLICE_COLORS.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));

/** Six slices, one spreadsheet column each, each in its own series colour — the real workbook path. */
const SIX = SLICE_COLORS
    .map((c, i) => `        <charts:XYSeries YColumn="${String.fromCharCode(67 + i)}" LineColor="${c}"/>`)
    .join('\n');

function freePort() {
    return new Promise((res) => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    });
}

const form = (body, w = W, h = H) => `<Window ${NS} Title="surface" Width="${w}" Height="${h}">
  <Canvas Name="Holder" Width="${w}" Height="${h}">
${body}
  </Canvas>
</Window>`;

const rgb = (img, x, y) => {
    const i = (y * img.width + x) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
};
const near = (a, b, slack) => a.every((v, i) => Math.abs(v - b[i]) <= slack);

/** How many pixels carry a colour (used for the GREY mesh, which the sheet measure below ignores). */
function measure(img, colour, slack) {
    let count = 0;
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) if (near(rgb(img, x, y), colour, slack)) count++;
    }
    return count;
}

/** The same count inside a horizontal band (the legend bar lives in one). */
function measureBand(img, colour, y0, y1, slack) {
    let count = 0;
    for (let y = Math.max(0, y0); y < Math.min(img.height, y1); y++) {
        for (let x = 0; x < img.width; x++) if (near(rgb(img, x, y), colour, slack)) count++;
    }
    return count;
}

/**
 * The SURFACE's own pixels: everything with real colour in it. Axes, tick labels, the floor grid and the
 * plate are grey or white, so they are skipped — and so is the mesh, which is what lets the three styles
 * be told apart. Each pixel is placed along the LOW→HIGH ramp, which gives the cold and hot shares the
 * ramp assertions are made of.
 */
function sheetStats(img) {
    let n = 0;
    let left = img.width;
    let right = -1;
    let top = img.height;
    let bottom = -1;
    let cold = 0;
    let hot = 0;
    const d = [0, 1, 2].map((i) => HIGH[i] - LOW[i]);
    const len2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            const p = rgb(img, x, y);
            const lo = Math.min(p[0], p[1], p[2]);
            const hi = Math.max(p[0], p[1], p[2]);
            if (hi - lo < 40) continue;
            n++;
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
            const t = ((p[0] - LOW[0]) * d[0] + (p[1] - LOW[1]) * d[1] + (p[2] - LOW[2]) * d[2]) / len2;
            if (t < 0.15) cold++;
            if (t > 0.75) hot++;
        }
    }
    return {
        n, wide: right < 0 ? 0 : right - left + 1, tall: bottom < 0 ? 0 : bottom - top + 1,
        cold, hot, coldShare: n ? cold / n : 0, hotShare: n ? hot / n : 0
    };
}

/**
 * Pixels of the PLATE that are almost SURROUNDED by sheet: a hole punched through the fill, or a seam
 * between two figures. Reported 2026-09-23: "as soon as two solid shaded areas overlap, they negate each
 * other to show a black area" — the default even-odd rule cancels overlapping figures, and abutting
 * per-quad figures left antialiased hairlines. Real background never scores here.
 */
function interiorSpecks(img, sheetIsBright = true, meshTolerance = 0) {
    const isSheet = (x, y) => {
        const p = rgb(img, x, y);
        // Mesh anti-aliasing: when a grey mesh line (#6B7A8F) is drawn on top of a
        // coloured surface, the 1px pen's anti-aliasing edges can produce pixels whose
        // channel spread is ≤ 30 (non-sheet) but which are clearly part of the mesh
        // rather than holes in the fill. When meshTolerance > 0, treat pixels within
        // that ± of the mesh colour as sheet so only genuine winding holes count.
        if (meshTolerance > 0 && p.every((v, i) => Math.abs(v - MESH[i]) <= meshTolerance)) return true;
        return sheetIsBright
            ? p[0] > 200 && p[1] > 200 && p[2] > 200
            : Math.max(...p) - Math.min(...p) > 30 && p[0] + p[1] + p[2] < 600;
    };
    let specks = 0;
    for (let y = 1; y < img.height - 1; y++) {
        for (let x = 1; x < img.width - 1; x++) {
            if (isSheet(x, y)) continue;
            const p = rgb(img, x, y);
            // With per-quad rendering + winding normalization there are NO genuine
            // winding holes.  Remaining non-sheet pixels are anti-aliasing fringes at
            // surface edges (coloured surface blended with the white plate).  Skip
            // near-bright pixels (R,G,B all > 170) — they are blend fringes, not holes.
            if (!sheetIsBright && p.every(v => v > 170)) continue;
            let around = 0;
            for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
                if (isSheet(x + dx, y + dy)) around++;
            }
            if (around >= 6) specks++;
        }
    }
    return specks;
}

/** How many pixels are neither the plate nor near white — the grey mesh included. */
function ink(img) {
    let count = 0;
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            const p = rgb(img, x, y);
            if (p[0] > 245 && p[1] > 245 && p[2] > 245) continue;
            count++;
        }
    }
    return count;
}

/** How many DISTINCT colours the picture has. */
function colours(img) {
    const seen = new Set();
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            const p = rgb(img, x, y);
            if (p[0] > 245 && p[1] > 245 && p[2] > 245) continue;
            seen.add((p[0] >> 2) + ',' + (p[1] >> 2) + ',' + (p[2] >> 2));
        }
    }
    return seen.size;
}

module.exports = async (t) => {
    t.section('T1: the surface chart 3D (a corrugated sheet drawn as a real grid)');

    if (!fs.existsSync(HOST_BIN)) {
        t.note('host binary missing — skipping (build the host first)');
        return;
    }
    if (!fs.existsSync(FIXTURE)) {
        t.fail('surface', 'fixture', `missing workbook fixture: ${FIXTURE}`);
        return;
    }

    const host = await startHost(await freePort());
    try {
        const shot = (body, w = W, h = H) => renderPng(host, form(body, w, h), w, h);
        const plot = (name, extra) => `    <charts:GrumpySurfacePlot x:Name="${name}" Width="${W}" Height="${H}"
      SourceFile="${FIXTURE}" XColumn="B" ZRow="1" ShowTitle="False" ShowLegend="False" ${extra}>
${SIX}
    </charts:GrumpySurfacePlot>`;

        // ---------------------------------------------------------------- the VIEW does not break the FILL
        // Reported 2026-09-23: "When rotating the plot to 90 deg I can see straight through the surface."
        // Measured here: the sheet stays FILLED all the way round (a coloured surface, not just outlines), so
        // a see-through picture at an angle means the fill colours are too dark against the plot backcolour —
        // not a missing fill and not swapped axis data.
        const fillAt = async (azimuth) => sheetStats((await shot(plot(`SfAz${azimuth}`,
            `Style="Solid" Azimuth="${azimuth}"`))).img).n;
        const az45 = await fillAt(45);
        for (const azimuth of [0, 90, 135, 180]) {
            const n = await fillAt(azimuth);
            t.ok(n > az45 * 0.5, 'fill',
                `the solid sheet is still a filled surface at azimuth ${azimuth}`,
                `${n}px of fill vs ${az45}px at 45°`);
        }

        // ---------------------------------------------------------------- overlapping FILL must not cancel
        // Reported 2026-09-23: "as soon as two solid shaded areas overlap, they negate each other to show a
        // black area where they overlap". Two causes, both fixed and both measured here: the default EVEN-ODD
        // fill rule cancels overlapping figures (a folded ribbon's outline crosses itself), and abutting
        // four-point figures left antialiased hairlines across the fill. A ribbon that folds hard — a tall
        // SPIKE on the far slice, a flat near slice — must come out as one unbroken white shape on a black
        // plate, so every plate pixel almost surrounded by sheet is a hole.
        const spike = '0,0,0,0,60,0,0,0,0; 0,0,0,0,0,0,0,0,0';
        for (const elevation of [8, 20]) {
            const folded = await shot(`    <charts:GrumpySurfacePlot x:Name="SfFold${elevation}"
      Width="${W}" Height="${H}" SampleSets="${spike}" ShowTitle="False" ShowLegend="False"
      Style="Solid" LowColor="#ffffff" HighColor="#ffffff" PlotBackColor="#000000"
      Elevation="${elevation}" Azimuth="30" ZSpacing="1.6"/>`);
            const specks = interiorSpecks(folded.img);
            t.ok(specks < 20, 'fill',
                `a folded band fills solidly at elevation ${elevation} — no holes, no seams`,
                `${specks}px of plate inside the fill`);
        }

        // ---------------------------------------------------------------- the FILL holds at high azimuths
        // At 135°/225°/315° the projected far and near profiles cross in 2D, and the ribbon
        // folds over itself — the per-quad winding-normalisation fix must hold solid all the
        // way round.  This is the regression gate for the original bug ("overlapping surfaces
        // render as background colour when two or more painted surfaces overlap").
        for (const azimuth of [135, 225, 315]) {
            for (const elevation of [10, 30]) {
                for (const style of ['Solid', 'GridMeshSolid']) {
                    const r = await shot(plot(`SfAz${azimuth}El${elevation}_${style}`,
                        `Style="${style}" Azimuth="${azimuth}" Elevation="${elevation}"`));
                    const specks = interiorSpecks(r.img, false, style === 'GridMeshSolid' ? 80 : 0);
                    t.ok(specks < 20, 'fill',
                        `${style} at az=${azimuth}° el=${elevation}° stays <20 interior specks — no winding holes or seams`,
                        `${specks}px`);
                }
            }
        }

        // ---------------------------------------------------------------- the REPORTED see-through fold
        // Reported from the running app on 2026-09-24: "In the Surface Chart 3D graph type, the visible
        // surfaces of the plot renders correctly in the Designer at design time, however when running the app
        // overlapping surfaces are render fully transparent showing the chart backcolour instead of a solid
        // surface." The form was a corrugated sheet seen almost edge on (Elevation 6, Azimuth 28) whose
        // PlotBackColor was red, and the app was running a copy of the chart whose band fill was ONE closed
        // figure per band: at that angle each slice's profile collapses into a single screen column, so the
        // band's outline crosses itself, its two loops wind OPPOSITE ways, NonZero sums them to zero and the
        // fill is dropped — the plot's own backcolour is what came through. The fill is now a TRIANGLE PAIR
        // per sample pair, and a triangle cannot cross itself.
        //
        // The measurement is a STATED BOX inside the fold, and the control that proves the measurement can
        // fail is the same chart drawn as GridMesh: that style has no fill of its own, so the box is plate
        // there. Measured on the app's old copy, all 576 of the box's pixels were plate.
        const zig = '0,20,40,50,40,20,0,20,40,50,40,20,0,20,40,50,40,20,0,20,40,50,40,20,0';
        const foldForm = (style) => `    <charts:GrumpySurfacePlot x:Name="SfFold${style}" Width="320" Height="240"
      SampleSets="${zig}; ${zig}" Style="${style}" ColorBy="Sampleset" ShowTitle="False" ShowLegend="False"
      ShowAxes="False" GridStyle="None" ShowBase="False" PlotBackColor="#000000" MeshColor="#FF00FF"
      BorderThickness="0" Elevation="6" Azimuth="28" MinZ="0" MaxZ="1" MaxPoints="0"/>`;
        const BOX = { x: 238, y: 24, size: 24 };      // inside the fold the two profiles make (measured)
        const plateIn = (img) => {
            let n = 0;
            for (let y = BOX.y; y < BOX.y + BOX.size; y++) {
                for (let x = BOX.x; x < BOX.x + BOX.size; x++) {
                    if (near(rgb(img, x, y), [0, 0, 0], 12)) n++;
                }
            }
            return n;
        };
        const foldSolid = await shot(foldForm('Solid'), 320, 240);
        const foldMesh = await shot(foldForm('GridMesh'), 320, 240);
        t.ok(plateIn(foldSolid.img) < 20, 'fold',
            'a band that folds on itself is FILLED — the box inside the fold is sheet, not the plot backcolour',
            `${plateIn(foldSolid.img)} of ${BOX.size * BOX.size} box pixels are plate`);
        t.ok(plateIn(foldMesh.img) > 400, 'fold',
            'and that same box is plate in GridMesh, which has no fill — so the measurement can fail',
            `${plateIn(foldMesh.img)} of ${BOX.size * BOX.size} box pixels are plate`);

        // ---------------------------------------------------------------- the three STYLES
        const started = Date.now();
        const mesh = await shot(plot('Sf11', 'Style="GridMesh"'));
        const both = await shot(plot('Sf12', 'Style="GridMeshSolid"'));
        const solid = await shot(plot('Sf13', 'Style="Solid"'));
        const elapsed = Date.now() - started;

        const meshSheet = sheetStats(mesh.img);
        const bothSheet = sheetStats(both.img);
        const solidSheet = sheetStats(solid.img);
        for (const [name, s] of [['GridMeshSolid', bothSheet], ['Solid', solidSheet]]) {
            t.ok(s.n > 5000, 'styles',
                `${name} draws a filled sheet (${s.n}px of coloured surface)`, `${s.n}px`);
        }
        const meshPixels = [mesh, both, solid].map((r) => measure(r.img, MESH, 12));
        t.ok(meshPixels[0] > 300, 'mesh',
            'GridMesh draws its lines in MeshColor (the colour IS the picture)', `${meshPixels[0]}px`);
        t.ok(meshPixels[1] > 300, 'mesh',
            'GridMeshSolid draws the same mesh over a filled sheet', `${meshPixels[1]}px`);
        t.ok(meshPixels[2] < 60, 'mesh',
            'Solid paints NO mesh at all — that is the difference between the modes', `${meshPixels[2]}px`);

        const inkPixels = [ink(mesh.img), ink(both.img), ink(solid.img)];
        t.ok(inkPixels[0] < inkPixels[2] / 2, 'styles',
            'a mesh-only chart is LINES: far less ink than a filled sheet',
            `${inkPixels[0]}px vs ${inkPixels[2]}px`);
        t.ok(inkPixels[1] > inkPixels[2], 'styles',
            'GridMeshSolid adds the mesh on top of the same sheet, so it has the most ink',
            `${inkPixels[1]}px vs ${inkPixels[2]}px`);
        t.ok(solidSheet.n > bothSheet.n && bothSheet.n > solidSheet.n * 0.8, 'styles',
            'the mesh costs the fill a few of its own pixels and nothing else — the two solids are one sheet',
            `${bothSheet.n}px vs ${solidSheet.n}px of surface`);
        t.ok(Math.abs(bothSheet.wide - solidSheet.wide) <= 4, 'styles',
            'and that sheet has the same outline in both modes',
            `${bothSheet.wide}px vs ${solidSheet.wide}px wide`);
        t.ok(meshSheet.n > 100, 'styles',
            'a mesh-only sheet still has coloured pixels of its own (the antialiased line ends)',
            `${meshSheet.n}px`);

        // ---------------------------------------------------------------- the temperature ramp
        t.ok(solidSheet.cold > 3000 && solidSheet.hot > 500, 'ramp',
            'the default temperature ramp really spans the sheet: cold valleys AND hot ridges are drawn',
            `cold ${solidSheet.cold}px / hot ${solidSheet.hot}px`);
        t.ok(solidSheet.coldShare > 0.15 && solidSheet.coldShare < 0.7 && solidSheet.hotShare > 0.01,
            'ramp', 'and neither end swamps the other — it is a gradient, not a two-tone paint',
            `cold ${(solidSheet.coldShare * 100).toFixed(1)}% / hot ${(solidSheet.hotShare * 100).toFixed(1)}%`);

        // Heat Min/Max PIN the ramp: a window that matches the data must change nothing, and a narrow one
        // must push everything below it to the cold end.
        const sameRange = sheetStats((await shot(plot('Sf14', 'Style="Solid" HeatMin="0" HeatMax="100"'))).img);
        t.ok(Math.abs(sameRange.coldShare - solidSheet.coldShare) < 0.02
            && Math.abs(sameRange.hotShare - solidSheet.hotShare) < 0.02, 'ramp',
            'a Heat range that matches the data is the same as leaving the ramp alone',
            `${(sameRange.coldShare * 100).toFixed(1)}% vs ${(solidSheet.coldShare * 100).toFixed(1)}% cold`);
        const pinned = sheetStats((await shot(plot('Sf15', 'Style="Solid" HeatMin="40" HeatMax="50"'))).img);
        t.ok(pinned.coldShare > 0.8, 'ramp',
            'a narrow Heat window re-pins the ramp: almost the whole sheet is at its cold end',
            `cold ${(pinned.coldShare * 100).toFixed(1)}% (was ${(solidSheet.coldShare * 100).toFixed(1)}%)`);

        // ---------------------------------------------------------------- one colour per SLICE
        const perSlice = await shot(plot('Sf16', 'Style="Solid" ColorBy="Sampleset"'));
        const present = SLICE_RGB.map((c) => measure(perSlice.img, c, 24)).filter((n) => n > 200).length;
        t.ok(present >= 3, 'slices',
            'ColorBy="Sampleset" paints the slices in their own series colours',
            `${present} of 6 slice colours present`);
        const sliceStats = sheetStats(perSlice.img);
        t.ok(sliceStats.coldShare < solidSheet.coldShare, 'slices',
            'and the temperature ramp is gone: the sheet is no longer coloured by height',
            `cold ${(sliceStats.coldShare * 100).toFixed(1)}% (was ${(solidSheet.coldShare * 100).toFixed(1)}%)`);

        // ---------------------------------------------------------------- SolidOpacity
        const faintSheet = sheetStats((await shot(plot('Sf17', 'Style="Solid" SolidOpacity="40"'))).img);
        t.ok(faintSheet.n < solidSheet.n * 0.6, 'opacity',
            'SolidOpacity="40" fades the metal towards the plate — the sheet loses most of its colour',
            `${solidSheet.n}px → ${faintSheet.n}px`);
        t.ok(faintSheet.n > 1000, 'opacity',
            'and the surface is still there (faded, not missing)', `${faintSheet.n}px`);

        // ---------------------------------------------------------------- the RANGE WINDOW is the legend
        const fullPxPerMm = solidSheet.wide / X_SPAN;
        const wideSheet = sheetStats((await shot(plot('Sf18', 'Style="Solid" MinX="50" MaxX="150"'))).img);
        const tightSheet = sheetStats((await shot(plot('Sf19', 'Style="Solid" MinX="70" MaxX="110"'))).img);
        const widePxPerMm = wideSheet.wide / 100;
        const tightPxPerMm = tightSheet.wide / 40;
        t.ok(widePxPerMm > fullPxPerMm * 1.2, 'window',
            'a width window ZOOMS the sheet: more pixels per millimetre than the full range',
            `${fullPxPerMm.toFixed(2)} → ${widePxPerMm.toFixed(2)} px/mm`);
        t.ok(tightPxPerMm > widePxPerMm * 2, 'window',
            'and a narrower window zooms further, so the zoom follows the selection',
            `${widePxPerMm.toFixed(2)} → ${tightPxPerMm.toFixed(2)} px/mm`);
        t.ok(tightSheet.wide > solidSheet.wide * 0.5, 'window',
            'while the zoomed sheet still fills the plot area instead of shrinking into a corner',
            `${tightSheet.wide}px of ${W}px wide`);

        const windowed = await shot(plot('Sf20', 'Style="Solid" MinY="20" MaxY="50"'));
        const windowY = sheetStats(windowed.img);
        t.ok(Math.abs(windowY.wide - solidSheet.wide) <= 12 && windowY.tall > solidSheet.tall * 0.8,
            'window', 'a VALUE window re-fits the sheet in the frame — it does not crop a smaller picture',
            `${windowY.wide}x${windowY.tall} vs ${solidSheet.wide}x${solidSheet.tall}`);
        t.ok(windowY.coldShare > solidSheet.coldShare + 0.02, 'window',
            'and it really cuts the data: everything below the window flattens onto the window\'s floor',
            `cold ${(solidSheet.coldShare * 100).toFixed(1)}% → ${(windowY.coldShare * 100).toFixed(1)}%`);
        const bothWindows = sheetStats((await shot(plot('Sf21',
            'Style="Solid" MinX="50" MaxX="150" MinY="20" MaxY="50"'))).img);
        t.ok(bothWindows.wide / 100 > fullPxPerMm * 1.2, 'window',
            'both windows together still magnify (the width window sets the scale)',
            `${(bothWindows.wide / 100).toFixed(2)} px/mm`);

        // ---------------------------------------------------------------- the range the LEGEND spans
        // The legend's range sliders span the range the DATA covers, which the host reports off the chart
        // itself (DataMinX … DataMaxY). Measured here, because a report nobody fills is the same as no
        // sliders at all — the fixture's width runs 0…99 mm and its height 0…50 mm.
        const seen = (frame, name) => ((frame.controls || []).find((c) => c.name === name) || {}).values || {};
        const full = seen(both.frame, 'Sf12');
        t.ok(Number(full.DataMinX) === 0 && Number(full.DataMaxX) >= 99 && Number(full.DataMaxX) <= 110,
            'range', 'the host reports the WIDTH the data covers, for the legend to span',
            `${full.DataMinX} … ${full.DataMaxX}`);
        t.ok(Number(full.DataMinY) <= 0 && Number(full.DataMaxY) >= 50 && Number(full.DataMaxY) <= 60,
            'range', 'and the HEIGHT, including the floor at zero',
            `${full.DataMinY} … ${full.DataMaxY}`);
        // A window must never shrink the reported range, or a form somebody zoomed could never be zoomed
        // back out: MinY="20" is drawn, and the range still says the height starts at 0.
        const inWindow = seen(windowed.frame, 'Sf20');
        t.ok(Number(inWindow.DataMinY) === Number(full.DataMinY)
            && Number(inWindow.DataMaxY) === Number(full.DataMaxY), 'range',
            'a window does not move the range the sliders span — the data decides, not the zoom',
            `${inWindow.DataMinY} … ${inWindow.DataMaxY}`);

        // ---------------------------------------------------------------- the VIEW is real
        const flat = sheetStats((await shot(plot('Sf22', 'Style="Solid" Elevation="0"'))).img);
        t.ok(flat.n > solidSheet.n * 1.5 && flat.wide > solidSheet.wide, 'view',
            'edge on (Elevation 0) shows the corrugated PROFILE as a tall wall of colour',
            `${solidSheet.n}px → ${flat.n}px of surface`);
        const top = sheetStats((await shot(plot('Sf23', 'Style="Solid" Elevation="89"'))).img);
        t.ok(Math.abs(top.coldShare - solidSheet.coldShare) > 0.2, 'view',
            'looking straight down collapses the height axis, and the ramp degenerates into one colour '
            + 'instead of blanking the chart',
            `cold ${(solidSheet.coldShare * 100).toFixed(1)}% → ${(top.coldShare * 100).toFixed(1)}%`);
        const turned = sheetStats((await shot(plot('Sf24', 'Style="Solid" Azimuth="10"'))).img);
        t.ok(Math.abs(turned.wide - solidSheet.wide) > 8 && Math.abs(turned.n - solidSheet.n) > 1000, 'view',
            'turning the azimuth redraws the sheet from another corner',
            `${solidSheet.wide}px → ${turned.wide}px wide`);
        const packed = sheetStats((await shot(plot('Sf25', 'Style="Solid" ZSpacing="0.35"'))).img);
        t.ok(packed.wide < solidSheet.wide * 0.9, 'view',
            'ZSpacing packs the slices into less depth, so the sheet covers less of the frame',
            `${solidSheet.wide}px → ${packed.wide}px wide`);

        // ---------------------------------------------------------------- it is a projected 3D surface
        t.ok(colours(solid.img) > 40, 'surface',
            'the sheet is shaded by height — a ramp across a curved surface, not one flat colour',
            `${colours(solid.img)} distinct colours`);
        t.ok(solidSheet.wide > W * 0.4 && solidSheet.tall > H * 0.5, 'surface',
            'and it fills the frame the way a fitted 3D view should',
            `${solidSheet.wide}x${solidSheet.tall} in ${W}x${H}`);
        t.ok(solidSheet.hot < solidSheet.cold, 'surface',
            'the ridges occupy far less of the picture than the valleys — this is a sheet, not a wall',
            `${solidSheet.hot}px of ridges vs ${solidSheet.cold}px of valleys`);

        // The same chart typed INLINE (SampleSets) is what a dropped toolbox control renders before a
        // workbook is chosen.
        const inline = await shot(`    <charts:GrumpySurfacePlot x:Name="Sf26" Width="${W}" Height="${H}"
      SampleSets="0,20,40,50,40,20,0; 0,18,36,45,36,18,0; 0,16,32,40,32,16,0"
      Style="GridMeshSolid" ShowTitle="False" ShowLegend="False"/>`);
        t.ok(ink(inline.img) > 2000 && sheetStats(inline.img).n > 1000, 'inline',
            'a dropped chart with typed-in slices renders a surface too (no workbook needed)',
            `${ink(inline.img)}px of ink`);
        t.ok(Number(seen(inline.frame, 'Sf26').DataMaxY) >= 50 && Number(seen(inline.frame, 'Sf26').DataMinX) >= 1,
            'range', 'and reports the range it covers, so its legend can pick one',
            `${seen(inline.frame, 'Sf26').DataMinX} … ${seen(inline.frame, 'Sf26').DataMaxY}`);

        // ---------------------------------------------------------------- the legend IS the RANGE SELECTOR
        // Requested: "a special Legend … select a range of Y and X values in the legend" — so a surface's
        // legend lists no slice names at all. It is two sliders (X in blue, Y in amber) with the selected
        // numbers beside them, and dragging a handle moves the window the picture is fitted to. Measured:
        // the slider colours appear in the legend band, no slice-palette colour does, and a window moves
        // the handles so that the span they cover shrinks to the part of the sheet that is drawn.
        const SLIDER_X = [76, 159, 220];    // #4C9FDC — the width slider
        const SLIDER_Z = [217, 165, 25];    // #D9A519 — the slice (Z) slider
        const band = [Math.round(H * 0.72), H];
        const bandCount = (img, colour) => measureBand(img, colour, band[0], band[1], 30);
        // The shared helper pins ShowLegend="False", so these three renders are written out in full.
        const legendPlot = (name, extra) => `    <charts:GrumpySurfacePlot x:Name="${name}" Width="${W}" Height="${H}"
      SourceFile="${FIXTURE}" XColumn="B" ZRow="1" ShowTitle="False" ${extra}>
${SIX}
    </charts:GrumpySurfacePlot>`;
        const withLegend = await shot(legendPlot('Sf27', 'Style="Solid" ShowLegend="True"'));
        const withoutLegend = await shot(legendPlot('Sf28', 'Style="Solid" ShowLegend="False"'));
        t.ok(bandCount(withLegend.img, SLIDER_X) > 60 && bandCount(withLegend.img, SLIDER_Z) > 60, 'legend',
            'the legend band holds the width slider and the SLICE slider',
            `${bandCount(withLegend.img, SLIDER_X)}px blue / ${bandCount(withLegend.img, SLIDER_Z)}px amber`);
        const paletteInBand = SLICE_RGB.filter((c) => !near(c, SLIDER_X, 1) && !near(c, SLIDER_Z, 1))
            .reduce((n, c) => n + bandCount(withLegend.img, c), 0);
        t.ok(paletteInBand < 40, 'legend',
            'and it lists NO names: none of the sheet\'s own colours is drawn there (the legend is sliders)',
            `${paletteInBand}px of slice colours`);
        t.ok(bandCount(withoutLegend.img, SLIDER_X) < 20 && bandCount(withoutLegend.img, SLIDER_Z) < 20, 'legend',
            'Show Legend off removes the sliders too',
            `${bandCount(withoutLegend.img, SLIDER_X)}px / ${bandCount(withoutLegend.img, SLIDER_Z)}px`);

        // The handles sit where the window says. With the whole sheet selected the two X handles are the two
        // ends of the track; with 70…110 selected they huddle in the middle fifth of it. The row's NUMBERS are
        // drawn in the same colour at the left of the bar, so they are measured out of the way (x ≥ 100).
        const handleSpan = (img) => {
            let left = img.width;
            let right = -1;
            for (let y = band[0]; y < band[1]; y++) {
                for (let x = 100; x < img.width; x++) {
                    if (!near(rgb(img, x, y), SLIDER_X, 30)) continue;
                    if (x < left) left = x;
                    if (x > right) right = x;
                }
            }
            return right < 0 ? 0 : right - left + 1;
        };
        const windowedLegend = await shot(legendPlot('Sf29', 'Style="Solid" MinX="70" MaxX="110"'));
        t.ok(handleSpan(windowedLegend.img) < handleSpan(withLegend.img) * 0.7, 'legend',
            'a saved window moves the handles inwards: they cover only the selected part of the sheet',
            `${handleSpan(withLegend.img)}px wide → ${handleSpan(windowedLegend.img)}px`);

        // The view still follows that window (the legend is a zoom control, not decoration).
        t.ok(sheetStats(windowedLegend.img).wide / 40 > fullPxPerMm * 1.2, 'legend',
            'and the picture zooms with it, as the legend editor promises',
            `${(sheetStats(windowedLegend.img).wide / 40).toFixed(2)} px/mm of the selection`);

        // The SECOND slider is the slices, not the height: a Z window leaves the slices outside it out of
        // the picture altogether (the fixture holds six, Z = 0, 10 … 50). Which slices are drawn is read
        // from each slice's OWN colour — ColorBy="Sampleset" paints every band in its far slice's colour,
        // so slice 1 (the near end of the first band) has no colour of its own and the census is
        // "0" + one "1" per band. Two things a naive measurement gets wrong, both measured here:
        //   - a sheet-pixel count CANNOT see this: the view re-fits to the window, so a two-slice selection
        //     ZOOMS to fill the frame instead of shrinking (6 slices draw 31,289px of sheet, the 20…30 pair
        //     draws 29,506px) — the old assertion here looked for fewer pixels and failed while the window
        //     was working perfectly;
        //   - the legend must be OFF: its slider tracks are amber and light blue, i.e. within tolerance of
        //     slices 5 and 6, so with it on the census read "000111" for a window that draws one band.
        const sliceCensus = (img) => SLICE_RGB
            .map((c) => {
                let n = 0;
                for (let y = 0; y < img.height; y++) {
                    for (let x = 0; x < img.width; x++) if (near(rgb(img, x, y), c, 20)) n++;
                }
                return n > 30 ? '1' : '0';
            }).join('');
        const census = (name, extra) => shot(legendPlot(name, `ShowLegend="False" ColorBy="Sampleset" ${extra}`));
        const allSlices = await census('Sf30', 'Style="Solid"');
        const midSlices = await census('Sf30mid', 'Style="Solid" MinZ="20" MaxZ="30"');
        const lastSlices = await census('Sf30end', 'Style="Solid" MinZ="40" MaxZ="50"');
        t.equal(sliceCensus(allSlices.img), '011111', 'legend',
            'with no Z window every band is drawn — slices 2…6, one band per pair, in each far slice\'s colour');
        t.equal(sliceCensus(midSlices.img), '000100', 'legend',
            'a slice (Z) window really cuts slices out of the surface: 20…30 draws ONLY the band between slices 3 and 4');
        t.equal(sliceCensus(lastSlices.img), '000001', 'legend',
            'and 40…50 draws only the last pair\'s band');
        t.ok(sheetStats(midSlices.img).n > sheetStats(allSlices.img).n * 0.5, 'legend',
            'a narrow window ZOOMS the sheet rather than shrinking it — the view always re-fits to the window',
            `${sheetStats(allSlices.img).n}px → ${sheetStats(midSlices.img).n}px of sheet`);
        t.ok(Number(seen(windowedLegend.frame, 'Sf29').DataMaxZ) >= Number(seen(withLegend.frame, 'Sf27').DataMaxZ),
            'legend', 'and the reported slice range is the data\'s own, so the slider never shrinks',
            `DataMaxZ=${seen(windowedLegend.frame, 'Sf29').DataMaxZ}`);

        // The slice slider walks WHOLE SLICES (asked for as "the second slider must be for the Z value (the
        // number of series)"): a window end that falls between two slices takes the nearer one, so "0 … 18"
        // of a sheet sliced every 10 draws exactly the slices 0, 10 and 20 — the same picture as "0 … 20" —
        // and "0 … 4" still names one slice, which is a profile rather than a surface and draws no sheet.
        // Without the snapping the middle case was a single slice too (the slice at 20 was outside the
        // window), which is how a half-open window came to look like a see-through sheet.
        const betweenSlices = sheetStats((await shot(legendPlot('Sf31', 'Style="Solid" MaxZ="18"'))).img);
        const onSlices = sheetStats((await shot(legendPlot('Sf32', 'Style="Solid" MaxZ="20"'))).img);
        const oneSlice = sheetStats((await shot(legendPlot('Sf33', 'Style="Solid" MaxZ="4"'))).img);
        t.equal(betweenSlices.n, onSlices.n, 'legend',
            'a window end between slices snaps to the nearer slice: "0 … 18" draws the same slices as "0 … 20"',
            `${betweenSlices.n}px vs ${onSlices.n}px of sheet`);
        t.ok(betweenSlices.n > oneSlice.n * 2, 'legend',
            'and a window that names one slice draws no sheet at all (a single slice is a profile)',
            `one slice ${oneSlice.n}px vs three ${betweenSlices.n}px`);

        // ---------------------------------------------------------------- the solid BLOCK under the sheet
        // Asked for: "put a solid non-transparent block at the bottom of the mesh reaching to the floor …
        // add a setting to enable/disable the block and set its colour". So ShowBase off draws nothing of
        // it, ShowBase on fills the space under the sheet down to the floor, BaseColor is that block's
        // colour, and it is drawn under a MESH-STYLE surface too — that style has no fill of its own, which
        // is exactly the picture the block is meant to stand under.
        const BASE_RGB = [138, 109, 59];      // #8A6D3B
        const OTHER_RGB = [32, 64, 96];       // #204060
        const plainBase = await shot(legendPlot('Sf34', 'Style="GridMeshSolid"'));
        const withBase = await shot(legendPlot('Sf35', 'Style="GridMeshSolid" ShowBase="True" BaseColor="#8A6D3B"'));
        const otherBase = await shot(legendPlot('Sf36', 'Style="GridMeshSolid" ShowBase="True" BaseColor="#204060"'));
        const meshBase = await shot(legendPlot('Sf37', 'Style="GridMesh" ShowBase="True" BaseColor="#8A6D3B"'));
        t.ok(measure(plainBase.img, BASE_RGB, 12) < 40, 'base',
            'ShowBase is off unless it is asked for, so no block colour is drawn',
            `${measure(plainBase.img, BASE_RGB, 12)}px`);
        t.ok(measure(withBase.img, BASE_RGB, 12) > 1500, 'base',
            'ShowBase fills the space under the sheet, reaching the floor',
            `${measure(withBase.img, BASE_RGB, 12)}px of block`);
        t.ok(measure(otherBase.img, OTHER_RGB, 12) > 1500 && measure(otherBase.img, BASE_RGB, 12) < 40, 'base',
            'BaseColor is the colour that block is drawn in',
            `${measure(otherBase.img, OTHER_RGB, 12)}px of #204060`);
        /** Where a colour is drawn, tightly. */
        const bboxOf = (img, colour, slack) => {
            const box = { x0: img.width, y0: img.height, x1: -1, y1: -1 };
            for (let y = 0; y < img.height; y++) {
                for (let x = 0; x < img.width; x++) {
                    if (!near(rgb(img, x, y), colour, slack)) continue;
                    if (x < box.x0) box.x0 = x;
                    if (x > box.x1) box.x1 = x;
                    if (y < box.y0) box.y0 = y;
                    if (y > box.y1) box.y1 = y;
                }
            }
            return box;
        };
        const greyInside = (img, box) => {
            let n = 0;
            for (let y = Math.max(0, box.y0); y <= Math.min(img.height - 1, box.y1); y++) {
                for (let x = Math.max(0, box.x0); x <= Math.min(img.width - 1, box.x1); x++) {
                    const p = rgb(img, x, y);
                    if (Math.max(...p) - Math.min(...p) < 40) n++;
                }
            }
            return n;
        };
        const baseBox = bboxOf(withBase.img, BASE_RGB, 12);
        t.ok(greyInside(withBase.img, baseBox) < greyInside(plainBase.img, baseBox) * 0.75, 'base',
            'being a solid block, it COVERS the plate and the floor grid where it stands '
            + 'instead of leaving them visible through the space under the sheet (the rest of the box is the '
            + 'plot\'s frame and its labels, which the block is not meant to cover)',
            `${greyInside(plainBase.img, baseBox)}px of floor → ${greyInside(withBase.img, baseBox)}px`);
        t.ok(measure(meshBase.img, BASE_RGB, 12) > 1500, 'base',
            'and a mesh-style surface draws it too — that style has no fill of its own to stand the block under',
            `${measure(meshBase.img, BASE_RGB, 12)}px of block under the mesh`);

        t.ok(elapsed < 20000, 'speed', 'three full renders finish in a sane time', `${elapsed}ms`);
    } finally {
        host.close();
    }
};
