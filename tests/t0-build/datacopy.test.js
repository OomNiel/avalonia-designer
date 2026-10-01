/* T0 — the data-file COPY ITEM really puts the file beside the app.
 *
 * `includeDataFile` writes one MSBuild item:
 *
 *     <None Update="data/log.csv" CopyToOutputDirectory="PreserveNewest" />
 *
 * The whole portability story rests on it: the chart reads a RELATIVE path from beside the executable
 * (GrumpyCharts' SourcePathResolver), so if that item did nothing — a spelling MSBuild ignores, a path
 * with a backslash on Linux, the item in the wrong ItemGroup — the form would draw in the designer and
 * come up EMPTY once built. Nothing else in the suite can see that, because every other test looks at
 * the project file rather than at a real build's output folder.
 *
 * One dotnet build of a throwaway project with no packages (so it is a few seconds, and it works
 * offline). The Avalonia app template is not needed: this is about the item, not about the app.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { includeDataFile, DATA_FOLDER } = require('../../out/chartDataFile.js');

const DOTNET = process.env.DOTNET_CLI || 'dotnet';

function scratchProject(defaults = false) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-datacopy-'));
    const proj = path.join(dir, 'Proj.csproj');
    // Two shapes, and the difference is not academic: with default items OFF there is no `None` item to
    // update, so an `<None Update=…>` line would copy nothing at all. This test project is the harsher
    // one on purpose.
    fs.writeFileSync(proj, `<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>Library</OutputType>
    <TargetFramework>net10.0</TargetFramework>
${defaults ? '' : '    <EnableDefaultItems>false</EnableDefaultItems>\n'}  </PropertyGroup>

  <ItemGroup>
${defaults ? '' : '    <Compile Include="Empty.cs" />\n'}  </ItemGroup>

</Project>
`);
    fs.writeFileSync(path.join(dir, 'Empty.cs'), 'public static class Empty { }\n');
    return { dir, proj };
}

module.exports = async (t) => {
    t.section('T0: data file copied beside the app');

    for (const [label, defaults] of [['default items off', false], ['the SDK globbing them (a generated project)', true]]) {
        const s = scratchProject(defaults);
        try {
            // A file the project does not have yet: it is copied IN first, then the item ships it out.
            const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-datacopy-src-'));
            const source = path.join(outDir, 'log.csv');
            fs.writeFileSync(source, 'x,y\n0,1\n2,3\n');
            const result = includeDataFile(s.proj, source);
            t.equal(result.error, undefined, 'include', `the data file is accepted into the project (${label})`);
            t.equal(result.relative, `${DATA_FOLDER}/log.csv`, 'include',
                `and the form is pointed at the project-relative copy (${label})`);
            t.ok(result.added, 'include', `with a copy item written into the project (${label})`);

            const build = t.run(`${DOTNET} build "${s.proj}" -v:q --nologo`);
            t.ok(build.ok, 'build', `the project still builds with the item in it (${label})`,
                build.output.split('\n').filter((l) => /error|warning/i.test(l)).slice(0, 3).join(' | '));

            const shipped = path.join(s.dir, 'bin', 'Debug', 'net10.0', DATA_FOLDER, 'log.csv');
            t.ok(fs.existsSync(shipped), 'output',
                `and the data file is copied beside the built assembly (${label})`, shipped);
            if (fs.existsSync(shipped)) {
                t.equal(fs.readFileSync(shipped, 'utf8'), 'x,y\n0,1\n2,3\n', 'output',
                    `byte for byte, so the app reads the same data the designer showed (${label})`);
            }
            // Idempotent: a second build after a second click must not evolve a duplicate item.
            const again = includeDataFile(s.proj, path.join(s.dir, DATA_FOLDER, 'log.csv'));
            t.equal(again.added, false, 'idempotent', `including the same file twice changes nothing (${label})`);
            try { fs.rmSync(outDir, { recursive: true, force: true }); } catch { /* gone already */ }
        } finally {
            try { fs.rmSync(s.dir, { recursive: true, force: true }); } catch { /* gone already */ }
        }
    }
};
