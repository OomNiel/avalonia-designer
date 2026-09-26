/* T4 — the chart's HARDCOPY output, on a real headless app with the real printer packages.
 *
 * Why a runtime layer for this: "the page can be A4" and "the PDF really contains the chart" are claims
 * about LAYOUT AND OUTPUT, and both compile happily while producing nothing — a page wrapper that never
 * gets laid out renders empty, and a VisualBrush whose visual is not in a tree paints nothing at all.
 * So this builds an Avalonia 12.1.1 headless app around the extension's own GrumpyCharts.cs (with
 * PRINT_SUPPORT defined and Avae.Printables + AvaloniaUI.PrintToPDF referenced, exactly as a generated
 * project has them), writes PDF and PNG files, and then MEASURES them here:
 *   - the PDF's page size, read back with `pdfinfo` — the chart's own size for the default, 595 x 842
 *     for ChartPrintOptions.A4 (that is the page wrapper doing its job, not an assumption),
 *   - the PNG's pixel size and the series colour inside it (decoded with the suite's own PNG reader),
 *   - the white A4 page: nothing is drawn in the margin, and the chart is inside it,
 *   - and, when `pdftoppm` is installed, that the PDF rasterises with the series colour in it — the
 *     difference between "a PDF file exists" and "the chart is in the PDF".
 *
 * Slow (a net10 build + restore), like the other T4 driver — run it on demand:
 *     node tests/runner.js --file printExport
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { decodePng, countIn } = require('../helpers/png');

const ROOT = path.join(__dirname, '..', '..');
const HARNESS_DIR = path.join(__dirname, '..', 'out', 'print', 'Harness');
const OUT_DIR = path.join(__dirname, '..', 'out', 'print', 'artefacts');

// 595 x 842 pt = A4 at 72 dpi; the chart in the harness is 400 x 200.
const A4 = { w: 595, h: 842 };
const CHART = { w: 400, h: 200 };

const CSPROJ = `<?xml version="1.0" encoding="utf-8"?>
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <AssemblyName>PrintHarness</AssemblyName>
    <RootNamespace>PrintHarness</RootNamespace>
    <DefineConstants>$(DefineConstants);PRINT_SUPPORT</DefineConstants>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Avalonia.Headless" Version="12.1.1" />
    <PackageReference Include="Avalonia.Skia" Version="12.1.1" />
    <PackageReference Include="Avae.Printables" Version="3.0.7" />
    <PackageReference Include="AvaloniaUI.PrintToPDF" Version="0.6.0" />
  </ItemGroup>
  <ItemGroup>
    <Compile Include="../../../../resources/GrumpyCharts.cs" Link="GrumpyCharts.cs" />
    <Compile Include="../../../../resources/GrumpyPrint.cs" Link="GrumpyPrint.cs" />
  </ItemGroup>
</Project>
`;

/** The checks the harness prints in mode `cups` — a stub `lp` is on the PATH, so this machine CAN print. */
const CHECKS_CUPS = [
    'no-avae-service', 'cups-available-with-lp-on-path', 'canprint-true-with-cups',
    'exportpng-legend-drawn-true', 'exportpng-legend-off-true', 'exportpng-legend-forced-true',
    'legend-off-leaves-the-screen-alone', 'legend-on-leaves-the-screen-alone',
    'exportpng-ink-colour-true', 'exportpng-ink-mono-true',
    'ink-mono-leaves-the-brush-alone', 'ink-mono-leaves-the-opacity-alone',
    'exportpdf-asdrawn-true', 'exportpdf-a4-true', 'pdf-files-exist', 'pdf-not-empty', 'pdf-header',
    'exportpng-asdrawn-true',
    'properties-roundtrip-paper', 'properties-roundtrip-margin', 'properties-roundtrip-light',
    'exportpng-a4-true',
    'failed-export-returns-false', 'printfailed-raised-once',
    'print-with-cups-true', 'cups-print-is-not-a-failure', 'not-printing-after-the-run'
];

/** …and in mode `nocups`, where nothing on the PATH can print: the entry has to refuse and say so. */
const CHECKS_NOCUPS = [
    'no-avae-service', 'cups-unavailable-without-lp', 'canprint-false-without-service',
    'print-without-service-false', 'printfailed-raised-for-missing-service',
    'print-without-window-false', 'no-window-is-not-a-failure-report',
    'not-printing-after-the-run'
];

/** The series colour the harness draws with — the pixel we look for in the output files. */
const SERIES = [0x1E, 0x88, 0xE5];
const near = (tolerance) => (r, g, b) =>
    Math.abs(r - SERIES[0]) <= tolerance && Math.abs(g - SERIES[1]) <= tolerance && Math.abs(b - SERIES[2]) <= tolerance;

/** Page size of a PDF in points, from `pdfinfo`; null when it is not installed. */
function pdfPageSize(t, file) {
    const r = t.run(`pdfinfo "${file}"`);
    if (!r.ok) return null;
    const m = /Page size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/.exec(r.output);
    if (!m) return null;
    return { w: Math.round(parseFloat(m[1])), h: Math.round(parseFloat(m[2])) };
}

/** How many pixels two decoded PNGs of the same size disagree on (8 levels of tolerance) — the measure of
 *  "the legend is there / is not there" without having to know what the legend looks like. */
function countDiff(a, b) {
    if (a.width !== b.width || a.height !== b.height) return -1;
    let n = 0;
    for (let i = 0; i < a.data.length; i += 4) {
        if (Math.abs(a.data[i] - b.data[i]) > 8
            || Math.abs(a.data[i + 1] - b.data[i + 1]) > 8
            || Math.abs(a.data[i + 2] - b.data[i + 2]) > 8) n++;
    }
    return n;
}

module.exports = async (t) => {
    t.section('T4: chart hardcopy — PDF page size, PNG pixels and the failure path');
    t.note('builds a net10 harness that compiles resources/GrumpyCharts.cs WITH PRINT_SUPPORT + both packages');

    fs.rmSync(HARNESS_DIR, { recursive: true, force: true });
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
    fs.mkdirSync(HARNESS_DIR, { recursive: true });
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(HARNESS_DIR, 'PrintHarness.csproj'), CSPROJ, 'utf8');
    fs.writeFileSync(path.join(HARNESS_DIR, 'Program.cs'),
        fs.readFileSync(path.join(__dirname, 'printProgram.cs.tpl'), 'utf8'), 'utf8');

    const chartPath = path.resolve(HARNESS_DIR, '../../../../resources/GrumpyCharts.cs');
    t.ok(fs.existsSync(chartPath), 'runtime', 'the harness resolves resources/GrumpyCharts.cs', chartPath);

    // The stub `lp`: a CUPS client that records the command line it was given and keeps the file it was
    // handed — so the argv, the job title, the rendered page AND the cleanup can all be asserted. The
    // harness installs the folder in front of its own PATH before it asks whether CUPS is available.
    const STUB_DIR = path.join(path.dirname(HARNESS_DIR), 'stub');
    const BARE_DIR = path.join(path.dirname(HARNESS_DIR), 'bare');
    fs.rmSync(STUB_DIR, { recursive: true, force: true });
    fs.rmSync(BARE_DIR, { recursive: true, force: true });
    fs.mkdirSync(STUB_DIR, { recursive: true });
    fs.mkdirSync(BARE_DIR, { recursive: true });   // deliberately empty: no `lp` on it at all
    const stub = path.join(STUB_DIR, 'lp');
    fs.writeFileSync(stub, [
        '#!/bin/sh',
        '# The CUPS client, stubbed by tests/t4-runtime/printExport.test.js: record the argv, keep the file.',
        'printf "%s\\n" "$@" > "$GRUMPY_STUB_DIR/argv.txt"',
        'last=""',
        'for a in "$@"; do last="$a"; done',
        'cp "$last" "$GRUMPY_STUB_DIR/received.pdf"',
        'exit 0',
        ''
    ].join('\n'), 'utf8');
    fs.chmodSync(stub, 0o755);

    t.note('dotnet run PrintHarness twice (the first build restores Avalonia + the printer packages)…');
    for (const [mode, pathDir, names] of [['cups', STUB_DIR, CHECKS_CUPS], ['nocups', BARE_DIR, CHECKS_NOCUPS]]) {
        const r = t.run(`dotnet run --project "PrintHarness.csproj" -c Debug -- "${OUT_DIR}" ${mode} "${pathDir}"`,
            { cwd: HARNESS_DIR });
        const out = r.output || '';
        t.ok(r.ok, 'runtime', `${mode}: driver exits 0`, r.ok ? '' : out.slice(-800));
        const fails = (out.match(/^FAIL /gm) || []).length;
        t.equal(fails, 0, 'runtime', `${mode}: no FAIL lines`, `FAIL count=${fails}`);
        t.ok(out.includes('RESULT PASS'), 'runtime', `${mode}: final RESULT PASS`,
            'RESULT line: ' + (out.match(/RESULT \w+/) || ['missing'])[0]);
        for (const name of names) {
            t.ok(out.includes('PASS ' + name), 'runtime', `${mode}: ${name}`,
                out.includes('FAIL ' + name) ? (out.match(new RegExp('FAIL ' + name + '.*')) || [''])[0] : '');
        }
    }

    // ---------- what the printer was actually asked to do ----------
    const argvFile = path.join(STUB_DIR, 'argv.txt');
    const received = path.join(STUB_DIR, 'received.pdf');
    t.ok(fs.existsSync(argvFile), 'cups', 'the stub `lp` was called at all');
    if (fs.existsSync(argvFile)) {
        const argv = fs.readFileSync(argvFile, 'utf8').split('\n').filter((l) => l.length > 0);
        t.equal(argv.length, 3, 'cups', 'three arguments: -t, the job title, the file — no printer named');
        t.equal(argv[0], '-t', 'cups', 'the job TITLE goes with -t (it is what the print queue shows)');
        t.equal(argv[1], 'Harness chart', 'cups', 'and it is the chart\'s own Name');
        t.ok(/\.pdf$/.test(argv[2] || ''), 'cups', 'the last argument is the rendered page', argv[2] || '');
        t.ok(argv[2] && !fs.existsSync(argv[2]), 'cups',
            'the temporary PDF is deleted again once lp returns (the spooler has it by then)');
    }
    t.ok(fs.existsSync(received), 'cups', 'the stub kept the file it was handed');
    if (fs.existsSync(received)) {
        const head = fs.readFileSync(received).slice(0, 5).toString('ascii');
        t.equal(head, '%PDF-', 'cups', 'and it is a real PDF — the page is rendered before lp is called');
        const printed = pdfPageSize(t, received);
        if (printed) {
            t.equal(`${printed.w}x${printed.h}`, `${CHART.w}x${CHART.h}`, 'cups',
                'it is the chart\'s own page (AsDrawn) — the paper option steers the printer and the export alike');
        }
        const probe = t.run('command -v pdftoppm');
        if (probe.ok) {
            const prefix = path.join(OUT_DIR, 'printraster');
            t.run(`pdftoppm -png -r 72 "${received}" "${prefix}"`);
            const raster = fs.existsSync(prefix + '-1.png') ? prefix + '-1.png' : prefix + '.png';
            if (fs.existsSync(raster)) {
                const img = decodePng(fs.readFileSync(raster));
                t.ok(countIn(img, 0, img.width, 0, img.height, near(40)) > 0, 'cups',
                    'and the chart really is on the printed page (its series colour rasterises out of it)');
            } else {
                t.ok(false, 'cups', 'the printed page rasterises to a PNG');
            }
        }
    }

    // ---------- the PNGs: size, and the chart really drawn ----------
    const pngDrawn = path.join(OUT_DIR, 'asdrawn.png');
    const pngA4 = path.join(OUT_DIR, 'a4.png');
    for (const [label, file] of [['asdrawn', pngDrawn], ['a4', pngA4]]) {
        t.ok(fs.existsSync(file), 'png', `${label}: the PNG export wrote a file`);
    }
    if (fs.existsSync(pngDrawn) && fs.existsSync(pngA4)) {
        const drawn = decodePng(fs.readFileSync(pngDrawn));
        const page = decodePng(fs.readFileSync(pngA4));
        t.equal(`${drawn.width}x${drawn.height}`, `${CHART.w}x${CHART.h}`, 'png',
            'the default export is the chart\'s own size, one pixel per point at scale 1');
        t.equal(`${page.width}x${page.height}`, `${A4.w}x${A4.h}`, 'png',
            'the A4 export is a real A4 page (595 x 842 pt) — the page wrapper was laid out, not skipped');
        t.ok(countIn(drawn, 0, drawn.width, 0, drawn.height, near(30)) > 0, 'png',
            'the chart\'s series colour is in the default PNG');
        t.ok(countIn(page, 0, page.width, 0, page.height, near(30)) > 0, 'png',
            'and in the A4 page too — the chart is painted onto the paper');

        // The margin, measured: the outer 20 px of the page carry no ink at all (the harness asked for
        // a 24 pt margin and a white page, so nothing may be drawn in it).
        const inkInMargin = countIn(page, 0, page.width, 0, 20, (rr, gg, bb) =>
            !(rr > 245 && gg > 245 && bb > 245));
        t.equal(inkInMargin, 0, 'png',
            'the A4 page starts with 20 px of clean paper (LightBackground + PrintMargin, measured)');
        const white = countIn(page, 0, page.width, 0, page.height, (rr, gg, bb) =>
            rr > 245 && gg > 245 && bb > 245);
        t.ok(white > page.width * page.height * 0.05, 'png',
            'and the page is mostly paper rather than a dark block', `white=${white}`);
    }

    // ---------- the Print Legend row, measured ----------
    const legendDrawn = path.join(OUT_DIR, 'legend-drawn.png');
    const legendOff = path.join(OUT_DIR, 'legend-off.png');
    const legendForced = path.join(OUT_DIR, 'legend-forced.png');
    for (const [label, file] of [['as drawn', legendDrawn], ['off', legendOff], ['forced on', legendForced]]) {
        t.ok(fs.existsSync(file), 'legend', `${label}: the export wrote a file`);
    }
    if ([legendDrawn, legendOff, legendForced].every((f) => fs.existsSync(f))) {
        const drawn = decodePng(fs.readFileSync(legendDrawn));
        const off = decodePng(fs.readFileSync(legendOff));
        const forced = decodePng(fs.readFileSync(legendForced));
        t.equal(`${off.width}x${off.height}`, `${drawn.width}x${drawn.height}`, 'legend',
            'the three pictures are the same page: only the legend differs');
        t.ok(countIn(off, 0, off.width, 0, off.height, near(40)) > 0, 'legend',
            'the legend-less page still carries the chart (its series colour) — the GRAPH is what an Off page keeps');
        const offDiff = countDiff(drawn, off);
        t.ok(offDiff > 500, 'legend',
            'Print Legend = Off really changes the page (the legend it would have drawn is gone)',
            `differing pixels=${offDiff}`);
        const forcedDiff = countDiff(off, forced);
        t.ok(forcedDiff > 500, 'legend',
            'and On draws it even while the chart itself is hiding it (the harness switched ShowLegend off)',
            `differing pixels=${forcedDiff}`);
    }

    // ---------- the Print Ink row: mono takes the plot background off the page ----------
    const inkColour = path.join(OUT_DIR, 'ink-colour.png');
    const inkMono = path.join(OUT_DIR, 'ink-mono.png');
    for (const [label, file] of [['colour', inkColour], ['mono', inkMono]]) {
        t.ok(fs.existsSync(file), 'ink', `${label}: the export wrote a file`);
    }
    if (fs.existsSync(inkColour) && fs.existsSync(inkMono)) {
        // #123456 is the plate the harness set, and the chart draws it nowhere else.
        const plate = (r, g, b) => Math.abs(r - 0x12) <= 12 && Math.abs(g - 0x34) <= 12 && Math.abs(b - 0x56) <= 12;
        const colourImg = decodePng(fs.readFileSync(inkColour));
        const monoImg = decodePng(fs.readFileSync(inkMono));
        const colourPlate = countIn(colourImg, 0, colourImg.width, 0, colourImg.height, plate);
        const monoPlate = countIn(monoImg, 0, monoImg.width, 0, monoImg.height, plate);
        t.ok(colourPlate > colourImg.width * colourImg.height * 0.5, 'ink',
            'the colour page is covered by the plot background the form set',
            `plate pixels=${colourPlate} of ${colourImg.width * colourImg.height}`);
        // A stray pixel can match the plate by accident — an anti-aliased gridline or trace over a dark chart
        // mixes into roughly the same colour — so the claim is COVERAGE, not equality: the plate filled the
        // plot area on the colour page and is gone from the mono one. (Measured: 71,033 px vs 38 px, and the
        // 38 are a sparse scatter across the chart, which is exactly what an accident looks like.)
        t.ok(monoPlate < colourImg.width * colourImg.height * 0.005, 'ink',
            'and the MONO page has none of it — the plate is off the paper',
            `plate pixels=${monoPlate} of ${colourImg.width * colourImg.height}`);
        t.ok(countIn(monoImg, 0, monoImg.width, 0, monoImg.height, near(40)) > 0, 'ink',
            'while the graph itself is still there (its series colour rasterises out of the mono page)');
        t.equal(`${monoImg.width}x${monoImg.height}`, `${colourImg.width}x${colourImg.height}`, 'ink',
            'and the page is otherwise unchanged');
    }

    // ---------- the PDFs: header, then the page geometry ----------
    const pdfDrawn = path.join(OUT_DIR, 'asdrawn.pdf');
    const pdfA4 = path.join(OUT_DIR, 'a4.pdf');
    for (const [label, file] of [['asdrawn', pdfDrawn], ['a4', pdfA4]]) {
        if (!fs.existsSync(file)) { t.ok(false, 'pdf', `${label}: the PDF export wrote a file`); continue; }
        const head = fs.readFileSync(file).slice(0, 5).toString('ascii');
        t.equal(head, '%PDF-', 'pdf', `${label}: the file really is a PDF`);
        t.ok(fs.statSync(file).size > 2000, 'pdf', `${label}: it is not an empty page`,
            `${fs.statSync(file).size} bytes`);
    }
    if (fs.existsSync(pdfDrawn) && fs.existsSync(pdfA4)) {
        const drawn = pdfPageSize(t, pdfDrawn);
        const a4 = pdfPageSize(t, pdfA4);
        if (!drawn || !a4) {
            t.note('pdfinfo is not installed — the page-size assertions were skipped (the PNG measurements above stand)');
        } else {
            t.equal(`${drawn.w}x${drawn.h}`, `${CHART.w}x${CHART.h}`, 'pdf',
                'the default PDF page is the chart size (the behaviour the manual documents)');
            t.equal(`${a4.w}x${a4.h}`, `${A4.w}x${A4.h}`, 'pdf',
                'ChartPrintOptions.A4 produces a real A4 page — not the chart\'s size with a margin painted on');
        }
    }

    // ---------- and the chart is IN the PDF, not just a page of paper ----------
    if (fs.existsSync(pdfA4)) {
        const probe = t.run('command -v pdftoppm');
        if (!probe.ok) {
            t.note('pdftoppm is not installed — the "the chart is inside the PDF" raster check was skipped');
        } else {
            const prefix = path.join(OUT_DIR, 'a4raster');
            t.run(`pdftoppm -png -r 72 "${pdfA4}" "${prefix}"`);
            const raster = fs.existsSync(prefix + '-1.png') ? prefix + '-1.png' : prefix + '.png';
            if (!fs.existsSync(raster)) {
                t.ok(false, 'pdf', 'the PDF rasterises to a PNG (pdftoppm produced no file)');
            } else {
                const img = decodePng(fs.readFileSync(raster));
                const inked = countIn(img, 0, img.width, 0, img.height, near(40));
                t.ok(inked > 0, 'pdf',
                    'the A4 PDF rasterises with the chart\'s series colour in it — the VisualBrush page really drew the chart',
                    `series pixels=${inked}`);
            }
        }
    }

    t.note(`artefacts in ${OUT_DIR}`);
};
