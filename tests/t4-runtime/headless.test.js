/* T4 — Avalonia.Headless runtime driver.
 *
 * Generates a real project (C# blank), injects a test Button, then builds a small harness
 * (net10 + Avalonia.Headless 12.1.1) that ProjectReferences the generated project, drives its
 * real MainWindow on the headless platform and asserts:
 *   - the window is created,
 *   - the locked Body Canvas auto-fills the client area,
 *   - Body follows a window resize,
 *   - WindowState minimised/maximised/normal transitions,
 *   - a placed control keeps its design position + size.
 *
 * This layer is the SLOWEST (a net10 build + restore) — run it on demand via `npm run test:runtime`.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { generateProject, OUT_DIR } = require('../helpers/build');

const HEADLESS_DIR = path.join(__dirname, '..', 'out', 'headless');
const HARNESS_DIR = path.join(HEADLESS_DIR, 'Harness');
const PROJ_DIR = path.join(OUT_DIR, 'HeadlessApp');

const CSPROJ = `<?xml version="1.0" encoding="utf-8"?>
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <AssemblyName>HeadlessHarness</AssemblyName>
    <RootNamespace>HeadlessHarness</RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Avalonia.Headless" Version="12.1.1" />
    <PackageReference Include="Avalonia.Skia" Version="12.1.1" />
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="..\\..\\projects\\HeadlessApp\\HeadlessApp.csproj" />
  </ItemGroup>
</Project>
`;

module.exports = async (t) => {
    t.section('T4: Avalonia.Headless runtime driver');
    t.note('generates + builds a net10 harness referencing the generated blank project');

    // 1) generate the C# blank project
    t.note('generating HeadlessApp (C# blank)…');
    const dir = generateProject({ language: 'cs', tplId: 'blank', name: 'HeadlessApp' });

    // 2) inject a named test control into the Body canvas
    const axamlPath = path.join(dir, 'MainWindow.axaml');
    let axaml = fs.readFileSync(axamlPath, 'utf8');
    if (!axaml.includes('x:Name="btnTest"')) {
        axaml = axaml.replace('<Canvas Name="Body">',
            '<Canvas Name="Body">\n            <Button x:Name="btnTest" Content="OK" Canvas.Left="100" Canvas.Top="50" Width="120" Height="36"/>');
        fs.writeFileSync(axamlPath, axaml, 'utf8');
    }

    // 3) write the harness
    fs.rmSync(HARNESS_DIR, { recursive: true, force: true });
    fs.mkdirSync(HARNESS_DIR, { recursive: true });
    fs.writeFileSync(path.join(HARNESS_DIR, 'Harness.csproj'), CSPROJ, 'utf8');
    const tpl = fs.readFileSync(path.join(__dirname, '..', 'headless', 'Program.cs.tpl'), 'utf8');
    fs.writeFileSync(path.join(HARNESS_DIR, 'Program.cs'), tpl.replace(/\{NAMESPACE\}/g, 'HeadlessApp'), 'utf8');

    // 4) run the driver (dotnet run builds + executes the harness)
    t.note('dotnet run HeadlessHarness (first build restores packages — can take a minute)…');
    const r = t.run('dotnet run --project "Harness.csproj" -c Debug', { cwd: HARNESS_DIR });

    const out = r.output || '';
    t.ok(r.ok, 'runtime', 'driver exits 0', r.ok ? '' : out.slice(-800));
    t.ok(out.includes('RESULT PASS'), 'runtime', 'final RESULT PASS', 'RESULT line: ' + (out.match(/RESULT \w+/) || ['missing'])[0]);
    const fails = (out.match(/^FAIL /gm) || []).length;
    t.equal(fails, 0, 'runtime', 'no FAIL lines', `FAIL count=${fails}`);

    // each expected check must have run
    for (const name of ['window-created', 'body-found', 'body-fills-width', 'body-fills-height',
        'body-resize-width', 'maximized', 'minimized', 'normal', 'control-x', 'control-y', 'control-width']) {
        t.ok(out.includes('PASS ' + name), 'runtime', name, out.includes('FAIL ' + name) ? 'reported FAIL' : '');
    }

    t.note(`artefacts in ${HEADLESS_DIR}`);
};
