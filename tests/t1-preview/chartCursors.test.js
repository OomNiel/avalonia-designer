/* T1 — the chart CURSORS as drawn: the crosshair, its dash styles and colours, the two-cursor cap,
 * the readout panel with the interpolated trace value, and the Orientation rule.
 *
 * Why this exists: every claim the Cursor editor makes is invisible to the property tests. A cursor
 * has to land on the pixel column its X maps to, its lines have to be long or short or dotted as
 * chosen, a chart with three cursor elements must still draw two, the readout must report the
 * trace's value BETWEEN samples (the cursors move freely — the number is interpolated), Orientation
 * must hide a LINE while keeping the position (a Horizontal cursor still reports a value for its X),
 * and a cursor that FOLLOWS its trace must be drawn in that series' own colour rather than in the
 * colour it was given. All of that is a pixel fact, so this renders through the real host.
 *
 * Measuring: three traps, each of which made an earlier version of this file report that a cursor line
 * was missing or somewhere else entirely. (1) The readout panel is drawn in the cursor's colour too.
 * (2) A one-pixel line anti-aliases, so its pixels are blends of the cursor colour and the plate —
 * matching the exact colour finds nothing. (3) Anti-aliased TEXT has warm fringes that any
 * "orange-ish" matcher will happily count. The matchers below work by HUE, and the geometry box is
 * the plot's interior only: no axis text, no readout panel.
 *
 * The workbook is `tests/fixtures/chartdata.xlsx` (B/C = "Time"/"Inside": (0,4) (1,9) (2,6) (3,12)
 * (4,8) (5,15)), which makes the expected readout numbers easy to reason about.
 */
'use strict';
const net = require('net');
const path = require('path');
const { startHost, renderPng } = require('../helpers/host');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" '
    + 'xmlns:charts="using:AvaloniaCharts"';
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'chartdata.xlsx');
const W = 320, H = 260;
// The plot's interior: right of the Y-axis labels, above the X-axis labels (both draw TEXT, whose
// anti-aliasing is warm enough to fool an orange matcher) and below the readout panel's corner.
const LINES = { x0: 56, x1: W, y0: 75, y1: 215 };
// The readout panel's corner, where only it and the cursor's own handle can put ink.
const PANEL = { x0: 236, x1: W, y0: 0, y1: 75 };
const ALL = { x0: 0, x1: W, y0: 0, y1: H };

function freePort() {
    return new Promise((res) => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    });
}

const form = (attrs, cursors, lineColor) => `<Window ${NS} Title="cursors" Width="${W}" Height="${H}">
  <Canvas Name="Holder" Width="${W}" Height="${H}">
    <charts:GrumpyXYPlot x:Name="Chart1" Width="${W}" Height="${H}" SourceFile="${FIXTURE}"
      ShowTitle="False" ShowLegend="False" ${attrs}>
      <charts:XYSeries Title="Inside" XColumn="B" YColumn="C" LineColor="${lineColor || '#2D7DD2'}" MarkerStyle="None"/>
      ${cursors ? `<charts:GrumpyXYPlot.Cursors>${cursors}</charts:GrumpyXYPlot.Cursors>` : ''}
    </charts:GrumpyXYPlot>
  </Canvas>
</Window>`;

// FollowTrace defaults to ON in the control, and a cursor that follows draws in the colour of the
// SERIES it follows (the last section of this file is about exactly that). Everything above it is
// about the cursor's own drawing — its own colour, dash pattern and geometry — so the helper turns
// following OFF unless a test says FollowTrace itself.
const cursor = (attrs) =>
    `<charts:ChartCursor ${/FollowTrace=/.test(attrs) ? attrs : attrs + ' FollowTrace="False"'}/>`;

// Hue-based matchers: a 1 px cursor line is anti-aliased (its pixels are blends with the plate), so
// matching the exact colour finds nothing while the line is plainly there. The trace's blue is
// excluded by every one of them, which is what makes "no green ink at all" a meaningful check.
const ORANGE = (r, g, b) => r > 170 && r - b > 55 && g > b;            // #FF8C00
const PURPLE = (r, g, b) => b > 170 && b - g > 90 && r < 210;          // #8000FF
const GREEN = (r, g, b) => g > 100 && g - r > 35 && g - b > 35;        // #008000
const TEAL = (r, g, b) => g > 90 && b > 90 && g - r > 25 && b - r > 25 && Math.abs(g - b) < 60;
const BLUE_TRACE = (r, g, b) => b > 170 && b - r > 80 && g < 170;

const box = (b) => b || ALL;

/** Counts matching pixels inside a box, and how far they reach. */
function ink(img, match, b) {
    const { x0, x1, y0, y1 } = box(b);
    const out = { n: 0, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const i = (y * img.width + x) * 4;
            if (!match(img.data[i], img.data[i + 1], img.data[i + 2])) continue;
            out.n++;
            out.minX = Math.min(out.minX, x); out.maxX = Math.max(out.maxX, x);
            out.minY = Math.min(out.minY, y); out.maxY = Math.max(out.maxY, y);
        }
    }
    return out;
}

/** Per-column counts inside a box, so a vertical line can be told from a wide panel. */
function colProfile(img, match, b) {
    const { x0, x1, y0, y1 } = box(b);
    const counts = new Array(img.width).fill(0);
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const i = (y * img.width + x) * 4;
            if (match(img.data[i], img.data[i + 1], img.data[i + 2])) counts[x]++;
        }
    }
    return counts;
}

/** Per-row counts inside a box, so a horizontal line can be told from a tall panel. */
function rowProfile(img, match, b) {
    const { x0, x1, y0, y1 } = box(b);
    const counts = [];
    for (let y = y0; y < y1; y++) {
        let n = 0;
        for (let x = x0; x < x1; x++) {
            const i = (y * img.width + x) * 4;
            if (match(img.data[i], img.data[i + 1], img.data[i + 2])) n++;
        }
        counts.push(n);
    }
    return counts;
}

/** The tallest column / widest row of a count series: { at, n }. `base` is the box's first index. */
function peak(counts, base) {
    let best = { at: -1, n: 0 };
    counts.forEach((n, i) => { if (n > best.n) best = { at: i + (base || 0), n }; });
    return best;
}
/** How many entries of a count series reach at least `n` — one or two means "a single line". */
function thick(counts, n) { return counts.filter((c) => c >= n).length; }
/** The columns that carry ink at all (within the box), so a line's width can be measured. */
function usedColumns(counts, min) { return counts.filter((c) => c >= min).length; }

module.exports = async (t) => {
    t.section('chartCursorsPreview');
    const host = await startHost(await freePort());
    try {
        // --- a chart with no cursor element draws no cursor ink at all ---
        const none = await renderPng(host, form('', ''), W, H);
        t.ok(!none.frame.error, 'chart-cursors', 'a chart with no cursors renders', none.frame.error || '');
        t.equal(ink(none.img, ORANGE, LINES).n, 0, 'chart-cursors', 'and draws no cursor ink');
        t.ok(ink(none.img, BLUE_TRACE).n > 100, 'chart-cursors', 'while its trace is drawn as always');

        // --- a vertical cursor is one column, at the pixel its X maps to ---
        const vertical = await renderPng(host, form('ReadoutPosition="TopRight"',
            cursor('Orientation="Vertical" X="2" Color="#FF8C00"')), W, H);
        t.ok(!vertical.frame.error, 'chart-cursors', 'a chart with a cursor renders', vertical.frame.error || '');
        const vCols = colProfile(vertical.img, ORANGE, LINES);
        const vPeak = peak(vCols);
        const vUsed = usedColumns(vCols, 20);
        t.ok(vPeak.n > 60, 'chart-cursors',
            'the cursor line is drawn down the middle of the plot',
            `tallest column ${vPeak.at} has ${vPeak.n} px`);
        t.ok(vUsed <= 4, 'chart-cursors',
            'and it is VERTICAL: only the line (plus its 6 px handle) covers whole columns',
            `${vUsed} columns carry ink`);

        // Moving the cursor's X moves the line: X=4 is a fifth of a 0…5 axis to the right of X=2.
        const vertical4 = await renderPng(host, form('ReadoutPosition="TopRight"',
            cursor('Orientation="Vertical" X="4" Color="#FF8C00"')), W, H);
        const v4 = peak(colProfile(vertical4.img, ORANGE, LINES));
        const dx = v4.at - vPeak.at;
        t.ok(dx > 80 && dx < 130, 'chart-cursors',
            'a cursor at X=4 sits two fifths of the axis right of one at X=2 (~51 px per unit)',
            `dx=${dx}`);

        // --- a horizontal cursor is one row ---
        const horizontal = await renderPng(host, form('ReadoutPosition="TopRight"',
            cursor('Orientation="Horizontal" Y="6" Color="#FF8C00"')), W, H);
        const hRows = rowProfile(horizontal.img, ORANGE, LINES);
        const hPeak = peak(hRows);
        t.ok(hPeak.n > 100, 'chart-cursors', 'a horizontal cursor is drawn across the plot',
            `widest row ${hPeak.at} has ${hPeak.n} px`);
        t.ok(usedColumns(hRows, 40) <= 4, 'chart-cursors',
            'and it is HORIZONTAL: only the line (plus its handle) reaches across',
            `${usedColumns(hRows, 40)} rows are wide`);
        // Orientation hides a LINE and nothing else: the same Y, drawn as Both, adds the vertical.
        const both = await renderPng(host, form('ReadoutPosition="TopRight"',
            cursor('Orientation="Both" X="2" Y="6" Color="#FF8C00"')), W, H);
        const bothCols = colProfile(both.img, ORANGE, LINES);
        t.ok(ink(both.img, ORANGE, LINES).n > ink(horizontal.img, ORANGE, LINES).n, 'chart-cursors',
            'Both draws the crosshair: more ink than the horizontal line alone',
            `both=${ink(both.img, ORANGE, LINES).n} horizontal=${ink(horizontal.img, ORANGE, LINES).n}`);
        t.ok(peak(bothCols).n > 60, 'chart-cursors', 'because it adds the vertical line',
            `${peak(bothCols).n} px in column ${peak(bothCols).at}`);

        // --- the two-cursor cap: three elements in the XAML, two lines on the chart ---
        const three = await renderPng(host, form('ReadoutPosition="TopRight"',
            cursor('Orientation="Vertical" X="1" Color="#FF8C00"')
            + cursor('Orientation="Vertical" X="2" Color="#8000FF"')
            + cursor('Orientation="Vertical" X="4" Color="#008000"')), W, H);
        t.ok(ink(three.img, ORANGE, LINES).n > 40, 'chart-cursors', 'the first of three cursors is drawn');
        t.ok(ink(three.img, PURPLE, LINES).n > 40, 'chart-cursors', 'so is the second',
            `purple=${ink(three.img, PURPLE, LINES).n}`);
        t.equal(ink(three.img, GREEN).n, 0, 'chart-cursors',
            'but the third is not drawn anywhere (a chart draws at most two cursors)');

        // --- dash styles really differ ---
        const styleOf = async (style) => (await renderPng(host, form('ReadoutPosition="TopRight"',
            cursor(`Orientation="Vertical" X="2.5" Style="${style}" Color="#FF8C00"`)), W, H)).img;
        const solid = await styleOf('Solid');
        const long = await styleOf('Long');
        const dot = await styleOf('Dot');
        const lineInk = (img) => ink(img, ORANGE, LINES).n;
        t.ok(lineInk(solid) > lineInk(long) + 20, 'chart-cursors',
            'a Solid cursor leaves more ink than a Long-dash one',
            `solid=${lineInk(solid)} long=${lineInk(long)}`);
        t.ok(lineInk(long) > lineInk(dot) + 20, 'chart-cursors',
            'and a Long-dash one more than a dotted one',
            `long=${lineInk(long)} dot=${lineInk(dot)}`);

        // --- a NAMED colour survives the host's colour conversion ---
        const named = await renderPng(host, form('ReadoutPosition="TopRight"',
            cursor('Orientation="Vertical" X="2" Color="Teal"')), W, H);
        t.ok(ink(named.img, TEAL, LINES).n > 40, 'chart-cursors',
            'a named colour cursor (Teal) is drawn in that colour', `teal=${ink(named.img, TEAL, LINES).n}`);

        // --- the readout panel: where it is, and what it holds ---
        const plain = await renderPng(host, form('ReadoutPosition="TopRight"',
            cursor('Orientation="Both" X="2.5" Y="9" Color="#FF8C00"')), W, H);
        const panelBox = ink(plain.img, ORANGE, PANEL);
        t.ok(panelBox.n > 40, 'chart-cursors', 'the readout panel is drawn in the cursor\'s colour',
            `orange in the corner=${panelBox.n}`);
        t.ok(panelBox.minX > 236 && panelBox.minY < 20, 'chart-cursors',
            'and it sits in the top right corner of the drawing area',
            `x from ${panelBox.minX}, y from ${panelBox.minY}`);
        // The trace value at X=2.5 is interpolated between (2,6) and (3,12) → 9. Two decimals make
        // the same numbers wider, which is only true if the panel really carries the values.
        const fixed = await renderPng(host, form('ReadoutPosition="TopRight" CursorDecimals="2"',
            cursor('Orientation="Both" X="2.5" Y="9" Color="#FF8C00"')), W, H);
        const panelWidth = (img) => peak(rowProfile(img, ORANGE, PANEL)).n;
        t.ok(panelWidth(fixed.img) > panelWidth(plain.img), 'chart-cursors',
            'CursorDecimals=2 widens the panel (X 2.50 / Y 9.00 instead of 2.5 / 9)',
            `${panelWidth(fixed.img)} > ${panelWidth(plain.img)}`);
        // The marker at the crossing point is drawn in the TRACE's colour: that is how a reading is
        // tied to the line it came from.
        t.ok(ink(plain.img, BLUE_TRACE).n > 100, 'chart-cursors',
            'the selected trace is still drawn', `trace=${ink(plain.img, BLUE_TRACE).n}`);

        // --- X Values / Y Values: switching a column off shortens the readout ---
        const xOnly = await renderPng(host, form('ReadoutPosition="TopRight"',
            cursor('Orientation="Both" X="2.5" Y="9" Color="#FF8C00" YValues="False"')), W, H);
        const neither = await renderPng(host, form('ReadoutPosition="TopRight"',
            cursor('Orientation="Both" X="2.5" Y="9" Color="#FF8C00" XValues="False" YValues="False"')), W, H);
        // The values are drawn IN the panel, so dropping a column shortens the text rather than the
        // panel (whose width is set by the wider trace-name line) — count the panel's ink, not its box.
        const panelInk = (img) => ink(img, ORANGE, PANEL).n;
        t.ok(panelInk(xOnly.img) < panelInk(plain.img), 'chart-cursors',
            'YValues=False drops the value column from the readout',
            `${panelInk(xOnly.img)} < ${panelInk(plain.img)}`);
        t.ok(panelInk(neither.img) < panelInk(xOnly.img), 'chart-cursors',
            'and with both switches off only the trace name is left',
            `${panelInk(neither.img)} < ${panelInk(xOnly.img)}`);

        // --- the readout follows the mouse; in the designer there is none, so it takes the corner ---
        const follow = await renderPng(host, form('',
            cursor('Orientation="Both" X="2.5" Y="9" Color="#FF8C00"')), W, H);
        t.ok(panelWidth(follow.img) > 40, 'chart-cursors',
            'a mouse-following readout is still drawn in the designer (there is no pointer to follow)',
            `widest panel row has ${panelWidth(follow.img)} px`);
        const followed = ink(follow.img, ORANGE, PANEL);
        t.ok(Math.abs(followed.maxX - panelBox.maxX) < 12 && Math.abs(followed.minY - panelBox.minY) < 12,
            'chart-cursors', 'and it is drawn in the same corner as the pinned one',
            `pinned ${panelBox.minX}..${panelBox.maxX}@${panelBox.minY} vs `
            + `followed ${followed.minX}..${followed.maxX}@${followed.minY}`);

        // --- Follow trace: the crossing's Y comes from the trace, not from the cursor ----------
        // The trace is (0,4) (1,9) (2,6) (3,12) (4,8) (5,15), so at X=2.5 its value is 9 and the
        // crossing sits near the TOP of the plot (row ~87 in this render; the plot's bottom edge
        // measures at row ~205). Y="0" is deliberately WRONG: a cursor that honoured its own Y would
        // draw its horizontal line along the plot's bottom edge instead.
        const LINE_BAND = { x0: 56, x1: 236, y0: 60, y1: 250 };
        // A FOLLOWING cursor is drawn in the traced series' colour (see the last section), so its
        // line is measured here in the TRACE's colour — and a horizontal cursor line is recognised by
        // its WIDTH: a row of it spans the plot, while the trace's own polyline crosses any row with
        // only a couple of pixels.
        const followsDefault = await renderPng(host, form('ReadoutPosition="TopRight"',
            cursor('Orientation="Horizontal" X="2.5" Y="0" Color="#FF8C00" FollowTrace="True"')), W, H);
        const ownY = await renderPng(host, form('ReadoutPosition="TopRight"',
            cursor('Orientation="Horizontal" X="2.5" Y="0" Color="#FF8C00" FollowTrace="False"')), W, H);
        const band = (img) => peak(rowProfile(img, ORANGE, LINE_BAND), LINE_BAND.y0);
        const traceBand = (img) => peak(rowProfile(img, BLUE_TRACE, LINE_BAND), LINE_BAND.y0);
        t.ok(traceBand(followsDefault.img).n > 100 && traceBand(followsDefault.img).at < 150, 'chart-cursors',
            'by default the crossing follows the selected trace (the trace value at X=2.5, high up)',
            `row=${traceBand(followsDefault.img).at} (${traceBand(followsDefault.img).n} px wide)`);
        t.ok(band(ownY.img).at > 190, 'chart-cursors',
            'FollowTrace=False puts it back at the cursor\'s own Y (Y=0 = the plot\'s bottom edge)',
            `row=${band(ownY.img).at}`);
        t.ok(band(ownY.img).at - traceBand(followsDefault.img).at > 60, 'chart-cursors',
            'the two are far apart, so the switch really changes the drawing',
            `${traceBand(followsDefault.img).at} vs ${band(ownY.img).at}`);
        // While following, the cursor's own Y is IGNORED — so a wrong Y and a matching one draw the
        // same picture. That is also what makes the readout agree with the crossing.
        const followsWithRightY = await renderPng(host, form('ReadoutPosition="TopRight"',
            cursor('Orientation="Horizontal" X="2.5" Y="9" Color="#FF8C00" FollowTrace="True"')), W, H);
        t.equal(ink(followsWithRightY.img, BLUE_TRACE, PANEL).n, ink(followsDefault.img, BLUE_TRACE, PANEL).n,
            'chart-cursors', 'while following, the cursor\'s own Y does not change the readout');
        t.equal(traceBand(followsWithRightY.img).at, traceBand(followsDefault.img).at, 'chart-cursors',
            'nor where the crossing is drawn');

        // --- the cursor wears the colour of the series it follows -------------------------------
        // The rule: a following cursor is drawn in the traced series' colour, so its line, its
        // crossing and its readout visibly belong to that trace. Two renders with the SAME orange
        // cursor on two DIFFERENTLY coloured series show the colour comes from the series.
        const greenLine = await renderPng(host, form('ReadoutPosition="TopRight"',
            cursor('Orientation="Horizontal" X="2.5" Y="0" Color="#FF8C00" FollowTrace="True"'), '#008000'), W, H);
        const greenTraceOnly = await renderPng(host, form('ReadoutPosition="TopRight"', '', '#008000'), W, H);
        // "No ink in its own colour" is measured in the PLOT box, not over the whole image: text is
        // rendered with subpixel fringing, so the readout's own letters contribute warm pixels whatever
        // colour they are drawn in (checked on a render with a green panel: the panel and its text are
        // green, and the fringes around the letters still tripped the orange matcher).
        t.equal(ink(greenLine.img, ORANGE, LINES).n, 0, 'chart-cursors',
            'a following cursor leaves no ink in its own colour in the plot');
        t.ok(peak(rowProfile(greenLine.img, GREEN, LINE_BAND)).n > 100, 'chart-cursors',
            'it is drawn in the traced series\' colour instead',
            `widest green row ${peak(rowProfile(greenLine.img, GREEN, LINE_BAND)).n} px`);
        t.ok(ink(greenLine.img, GREEN, PANEL).n > ink(greenTraceOnly.img, GREEN, PANEL).n + 20, 'chart-cursors',
            'and the readout panel is drawn in that colour too',
            `panel green ${ink(greenTraceOnly.img, GREEN, PANEL).n} -> ${ink(greenLine.img, GREEN, PANEL).n}`);
        // The very same cursor on a BLUE series is blue, so it is the series' colour and not a fixed
        // one: this is the difference between "inherits" and "is drawn in some other colour".
        const blueLine = await renderPng(host, form('ReadoutPosition="TopRight"',
            cursor('Orientation="Horizontal" X="2.5" Y="0" Color="#FF8C00" FollowTrace="True"'), '#2D7DD2'), W, H);
        t.ok(peak(rowProfile(blueLine.img, BLUE_TRACE, LINE_BAND)).n > 100, 'chart-cursors',
            'the same cursor on a blue series is drawn in blue',
            `widest blue row ${peak(rowProfile(blueLine.img, BLUE_TRACE, LINE_BAND)).n} px`);
        t.equal(ink(blueLine.img, ORANGE, LINES).n, 0, 'chart-cursors',
            'still without a pixel of the colour it was given (in the plot)');
        // Two cursors on one trace are both that trace's colour, wherever they were placed.
        const twoFollowing = await renderPng(host, form('ReadoutPosition="TopRight"',
            cursor('Orientation="Horizontal" X="0.5" Y="0" Color="#FF8C00" FollowTrace="True"')
            + cursor('Orientation="Horizontal" X="5" Y="0" Color="#8000FF" FollowTrace="True"'), '#008000'), W, H);
        t.equal(ink(twoFollowing.img, ORANGE, LINES).n + ink(twoFollowing.img, PURPLE, LINES).n, 0,
            'chart-cursors', 'two following cursors drop their own colours as well');
        t.ok(thick(rowProfile(twoFollowing.img, GREEN, LINE_BAND), 100) >= 2, 'chart-cursors',
            'and both their lines ride the trace, each in the trace\'s colour',
            `${thick(rowProfile(twoFollowing.img, GREEN, LINE_BAND), 100)} wide green rows`);
        // The other half of the rule: a cursor that does NOT follow keeps the colour it was given.
        const freeAgain = await renderPng(host, form('ReadoutPosition="TopRight"',
            cursor('Orientation="Horizontal" X="2.5" Y="0" Color="#FF8C00" FollowTrace="False"'), '#008000'), W, H);
        t.ok(ink(freeAgain.img, ORANGE, LINE_BAND).n > 40, 'chart-cursors',
            'a cursor that does not follow keeps its own colour (a threshold line)',
            `orange=${ink(freeAgain.img, ORANGE, LINE_BAND).n}`);

        // --- the two-cursor delta row ---------------------------------------------------------
        // With TWO cursors switched on, the panel adds |X1 − X2| and |Y1 − Y2|, drawn in the OTHER
        // cursor's colour. Here the cursors are at X=1 and X=4 (ΔX 3) and the fixture's trace reads 9
        // and 8 there (ΔY 1) — the exact figures were checked by eye on the render; the pixel facts
        // that a test can hold onto are that the row exists, is in the other colour, and only appears
        // while BOTH cursors are active.
        // The text column of the panel: right of its left border, left of the second cursor's line at
        // X=4 (x≈258), so only the panel's own text can put ink here.
        const TEXT_COL = { x0: 242, x1: 256, y0: 0, y1: 130 };
        const PANEL_ALL = { x0: 236, x1: W, y0: 0, y1: 130 };
        const oneCursor = await renderPng(host, form('ReadoutPosition="TopRight"',
            cursor('Orientation="Vertical" X="1" Color="#FF8C00"')), W, H);
        const twoCursors = await renderPng(host, form('ReadoutPosition="TopRight"',
            cursor('Orientation="Vertical" X="1" Color="#FF8C00"')
            + cursor('Orientation="Vertical" X="4" Color="#8000FF"')), W, H);
        const secondOff = await renderPng(host, form('ReadoutPosition="TopRight"',
            cursor('Orientation="Vertical" X="1" Color="#FF8C00"')
            + cursor('Orientation="Vertical" X="4" Color="#8000FF" Enabled="False"')), W, H);
        // The readout's palette is FIXED: a black panel, white X/Y values, the cursor's colour on the
        // border and the series' colour on the tag line. A palette RULE is best measured RELATIVELY:
        // the panel is found by its own black box, and re-rendering the same cursor in another colour
        // must change the border while leaving the numbers byte-identically coloured.
        const greenCursor = await renderPng(host, form('ReadoutPosition="TopRight"',
            cursor('Orientation="Vertical" X="1" Color="#00FF00"')), W, H);
        const BLACK = (r, g, b) => r < 40 && g < 40 && b < 40;
        // The values are white, but white text on a black box is mostly ANTI-ALIASED: almost no pixel
        // reaches pure white, so "bright and neutral" is the honest probe (the orange border, the
        // series' blue and the delta's purple are all strongly chromatic and fall out of it).
        const BRIGHT = (r, g, b) => r > 150 && g > 150 && b > 150
            && Math.abs(r - g) < 40 && Math.abs(g - b) < 40;
        // The pair's hairline is the delta colour at 50 % OVER BLACK ((64,0,128) for #8000FF). The tag
        // line's own blends ((45,125,210) darkened) also land in this family, so only the *growth* of
        // this ink is evidence — the hairline is one long row.
        const DIM_PURPLE = (r, g, b) => b > 90 && b - g > 70 && r < 120;
        const readoutBox = (img) => {
            const b = ink(img, BLACK, PANEL_ALL);
            return { x0: b.minX + 1, x1: b.maxX, y0: b.minY + 1, y1: b.maxY };
        };
        // Strictly INSIDE the panel: the border itself is painted in the cursor's colour.
        const readoutInner = (img) => {
            const b = readoutBox(img);
            return { x0: b.x0 + 4, x1: b.x1 - 4, y0: b.y0 + 4, y1: b.y1 - 4 };
        };
        const readoutText = (img) => ink(img, BRIGHT, readoutInner(img)).n;
        const readoutBorder = (img, match) => ink(img, match, readoutBox(img)).n;

        t.ok(ink(oneCursor.img, BLACK, PANEL_ALL).n > 800, 'chart-cursors',
            'the readout panel is drawn on a black box, whatever the chart behind it is',
            `black=${ink(oneCursor.img, BLACK, PANEL_ALL).n}`);
        // The rule, measured as a WHOLE PANEL: two renders that differ only in the cursor's colour
        // must produce a panel whose contents are pixel-identical, with the cursor's colour appearing
        // only on the border. (Antialiasing makes per-glyph colour probes brittle; a diff does not
        // care which pixel is which.)
        const REDDISH = (r, g, b) => r > g + 40 && r > b + 40;
        const GREENISH = (r, g, b) => g > r + 40 && g > b + 40;
        {
            const b = readoutBox(oneCursor.img);
            // Grown by 3 px so the border RING is included: the black box alone is the interior, and
            // that part is identical by construction (which is the point of the rule).
            const box = { x0: b.x0 - 3, x1: b.x1 + 3, y0: b.y0 - 3, y1: b.y1 + 3 };
            let same = 0, diff = 0, orangeOnly = 0, greenOnly = 0;
            for (let y = box.y0; y < box.y1; y++) {
                for (let x = box.x0; x < box.x1; x++) {
                    const i = (y * oneCursor.img.width + x) * 4;
                    const o = [oneCursor.img.data[i], oneCursor.img.data[i + 1], oneCursor.img.data[i + 2]];
                    const g = [greenCursor.img.data[i], greenCursor.img.data[i + 1], greenCursor.img.data[i + 2]];
                    if (o[0] === g[0] && o[1] === g[1] && o[2] === g[2]) { same++; continue; }
                    diff++;
                    if (REDDISH(...o) && GREENISH(...g)) orangeOnly++;
                    else if (GREENISH(...g)) greenOnly++;
                }
            }
            t.ok(same > 300, 'chart-cursors',
                'the panels of two differently coloured cursors share their contents exactly',
                `same=${same} diff=${diff}`);
            t.ok(diff > 10, 'chart-cursors', 'and differ only where the cursor colour shows',
                `diff=${diff}`);
            t.ok(orangeOnly + greenOnly >= diff * 0.6, 'chart-cursors',
                'every one of those pixels is the cursor-coloured border',
                `border=${orangeOnly + greenOnly} of ${diff}`);
        }
        t.ok(readoutText(oneCursor.img) > 10, 'chart-cursors',
            'and its X/Y values are drawn in white', `bright=${readoutText(oneCursor.img)}`);
        t.ok(Math.abs(readoutText(greenCursor.img) - readoutText(oneCursor.img)) <= 8, 'chart-cursors',
            'the numbers keep their colour when the cursor is drawn in another one',
            `bright orange=${readoutText(oneCursor.img)} green=${readoutText(greenCursor.img)}`);
        t.ok(ink(oneCursor.img, BLUE_TRACE, readoutInner(oneCursor.img)).n > 15, 'chart-cursors',
            'and the series line keeps that series\' colour',
            `series ink=${ink(oneCursor.img, BLUE_TRACE, readoutInner(oneCursor.img)).n}`);
        const purpleOne = ink(oneCursor.img, DIM_PURPLE, readoutInner(oneCursor.img)).n;
        const purpleTwo = ink(twoCursors.img, DIM_PURPLE, readoutInner(twoCursors.img)).n;
        t.ok(readoutText(twoCursors.img) > readoutText(oneCursor.img) + 10, 'chart-cursors',
            'with TWO cursors the panel gains a white difference row',
            `text ${readoutText(oneCursor.img)} -> ${readoutText(twoCursors.img)}`);
        t.ok(purpleTwo > purpleOne + 40, 'chart-cursors',
            'and that row is marked with a hairline in the OTHER cursor\'s colour',
            `dim purple ${purpleOne} -> ${purpleTwo}`);
        t.ok(ink(twoCursors.img, ORANGE, PANEL_ALL).maxY > ink(oneCursor.img, ORANGE, PANEL_ALL).maxY + 5,
            'chart-cursors', 'and the panel grew a line taller to hold it',
            `${ink(oneCursor.img, ORANGE, PANEL_ALL).maxY} -> ${ink(twoCursors.img, ORANGE, PANEL_ALL).maxY}`);
        // "When 2 cursors are ACTIVE" is the condition: a declared-but-switched-off second cursor
        // changes nothing — no line, no difference row.
        t.ok(ink(secondOff.img, DIM_PURPLE, readoutInner(secondOff.img)).n <= purpleOne + 5, 'chart-cursors',
            'a second cursor that is switched off draws nothing and adds no difference row',
            `${ink(secondOff.img, DIM_PURPLE, readoutInner(secondOff.img)).n} vs ${purpleOne}`);
        t.equal(ink(secondOff.img, PURPLE, { x0: 0, x1: 240, y0: 0, y1: 130 }).n, 0,
            'chart-cursors', 'and its own colour appears nowhere left of the panel either');
        t.equal(ink(secondOff.img, ORANGE, PANEL_ALL).maxY, ink(oneCursor.img, ORANGE, PANEL_ALL).maxY,
            'chart-cursors', 'so the panel is exactly as tall as with a single cursor');

        // --- two cursors at once, each on its own lines and in its own colour ---
        const two = await renderPng(host, form('ReadoutPosition="TopRight"',
            cursor('Orientation="Both" X="1" Y="9" Color="#FF8C00"')
            + cursor('Orientation="Horizontal" Y="6" Color="#8000FF"')), W, H);
        const orangeCols = colProfile(two.img, ORANGE, LINES);
        const purpleRows = rowProfile(two.img, PURPLE, LINES);
        t.ok(peak(orangeCols).n > 60 && usedColumns(orangeCols, 40) <= 3, 'chart-cursors',
            'the first cursor draws one vertical line (selected, so it is drawn thicker)',
            `${usedColumns(orangeCols, 40)} columns, tallest ${peak(orangeCols).n} px`);
        t.ok(peak(purpleRows).n > 100 && usedColumns(purpleRows, 40) <= 4, 'chart-cursors',
            'and the second one its own horizontal line, in its own colour',
            `widest purple row ${peak(purpleRows).n} px, ${usedColumns(purpleRows, 40)} rows`);
    } finally { host.close(); }
};
