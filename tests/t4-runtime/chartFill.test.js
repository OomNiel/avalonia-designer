/* T4 — the chart's FILL / RESTORE ("dock" and "undock") as GEOMETRY, on a real headless app.
 *
 * Why a runtime layer for this: every claim is about LAYOUT, and layout is the one thing source
 * contracts cannot see. "The fill takes the container's rectangle" is exactly the kind of statement that
 * compiles, renders, and does nothing (a Stretch that a Canvas ignores, a Width that a Grid cell
 * overrides, a restored NaN that snaps the chart to 0,0). So this builds a real Avalonia 12.1.1 window
 * around the extension's own GrumpyCharts.cs and MEASURES the boundings:
 *   - a Canvas child fills the canvas and returns to its exact spot,
 *   - a Grid child spans every row and column, and gives the cell back,
 *   - the Z is raised on fill and restored,
 *   - a filled chart keeps matching its container when the window is resized,
 *   - Esc restores (through the real key route), and is NOT swallowed while the chart is collapsed,
 *   - all six chart types fill and restore.
 *
 * Slow (a net10 build + restore), like the other T4 driver — run it on demand:
 *     node tests/runner.js --file chartFillRuntime
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const HARNESS_DIR = path.join(__dirname, '..', 'out', 'fill', 'Harness');

// The chart file is compiled STRAIGHT from the extension's resources, so this measures the shipped code
// rather than a copy of it.
const CSPROJ = `<?xml version="1.0" encoding="utf-8"?>
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <AssemblyName>FillHarness</AssemblyName>
    <RootNamespace>FillHarness</RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Avalonia.Headless" Version="12.1.1" />
    <PackageReference Include="Avalonia.Skia" Version="12.1.1" />
  </ItemGroup>
  <ItemGroup>
    <Compile Include="../../../../resources/GrumpyCharts.cs" Link="GrumpyCharts.cs" />
  </ItemGroup>
</Project>
`;

const CHECKS = ['start-position', 'start-size', 'start-not-filled',
    'fill-returns-true', 'fill-flag', 'fill-width', 'fill-height', 'fill-at-corner', 'fill-on-top',
    'fill-twice-false', 'fill-grew', 'fill-follows-resize', 'fill-follows-resize-height',
    'restore-returns-true', 'restore-flag', 'restore-position', 'restore-size', 'restore-canvas-attached',
    'restore-z', 'restore-twice-false',
    'esc-ignored-when-collapsed', 'fill-again', 'esc-restores', 'esc-restores-exactly',
    'esc-handled-while-filled',
    'grid-fill-returns-true', 'grid-fill-spans-width', 'grid-fill-spans-height', 'grid-fill-spans-cells',
    'grid-restore-returns-true', 'grid-restore-cell', 'grid-restore-size',
    'every-chart-type-fills-and-restores'];

module.exports = async (t) => {
    t.section('T4: filling a chart’s container (measured geometry)');
    t.note('builds a net10 harness that compiles resources/GrumpyCharts.cs and drives it headlessly');

    fs.rmSync(HARNESS_DIR, { recursive: true, force: true });
    fs.mkdirSync(HARNESS_DIR, { recursive: true });
    fs.writeFileSync(path.join(HARNESS_DIR, 'FillHarness.csproj'), CSPROJ, 'utf8');
    const tpl = fs.readFileSync(path.join(__dirname, 'fillProgram.cs.tpl'), 'utf8');
    fs.writeFileSync(path.join(HARNESS_DIR, 'Program.cs'), tpl, 'utf8');

    // The relative Compile path only works from the prepared directory; assert it so a moved harness
    // fails with a clear message instead of "the type GrumpyLinePlot could not be found".
    const chartPath = path.resolve(HARNESS_DIR, '../../../../resources/GrumpyCharts.cs');
    t.ok(fs.existsSync(chartPath), 'runtime', 'the harness resolves resources/GrumpyCharts.cs', chartPath);

    t.note('dotnet run FillHarness (first build restores Avalonia — can take a minute)…');
    const r = t.run('dotnet run --project "FillHarness.csproj" -c Debug', { cwd: HARNESS_DIR });
    const out = r.output || '';
    t.ok(r.ok, 'runtime', 'driver exits 0', r.ok ? '' : out.slice(-800));
    const fails = (out.match(/^FAIL /gm) || []).length;
    t.equal(fails, 0, 'runtime', 'no FAIL lines', `FAIL count=${fails}`);
    t.ok(out.includes('RESULT PASS'), 'runtime', 'final RESULT PASS',
        'RESULT line: ' + (out.match(/RESULT \w+/) || ['missing'])[0]);
    for (const name of CHECKS) {
        t.ok(out.includes('PASS ' + name), 'runtime', name,
            out.includes('FAIL ' + name) ? (out.match(new RegExp('FAIL ' + name + '.*')) || [''])[0] : '');
    }

    t.note(`artefacts in ${HARNESS_DIR}`);
};
