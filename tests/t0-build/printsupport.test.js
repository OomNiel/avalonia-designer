/* T0 — `PRINT_SUPPORT` must really reach the compiler in a GENERATED project, in both languages.
 *
 * Why a build test and not a text check: the first VB wiring set the symbol inside a
 * `BeforeTargets="VbcCompile"` target, which the SDK overwrites again before vbc runs. Every VB
 * project then built green while `#If PRINT_SUPPORT Then` was compiled OUT — the chart's
 * "Print…"/"Print to PDF…" entries and both methods simply did not exist, and nothing said so. A
 * test that greps the project file would have passed happily. So this layer drops a probe class
 * into the generated project that REFERENCES the gated members: it compiles only when the symbol
 * is genuinely defined.
 *
 * 2 dotnet builds on top of the T0 matrix — same order of cost as the other project builds, which
 * is why it lives in T0 rather than in a fast layer. */
'use strict';
const fs = require('fs');
const path = require('path');
const { generateProject, dotnetBuild } = require('../helpers/build');

const PROBE_CS = `using AvaloniaCharts;

namespace PrintSupportProbe;

// The test: this class compiles only when PRINT_SUPPORT reaches the compiler, because both
// members live inside the bundled GrumpyCharts.cs "#if PRINT_SUPPORT" block.
internal static class PrintProbe
{
    public static void Use(ChartBase chart)
    {
        _ = chart.PrintAsync();
        _ = chart.PrintToPdfAsync();
    }
}
`;

const PROBE_VB = `Imports AvaloniaCharts

' The test: this module compiles only when PRINT_SUPPORT reaches vbc, because both members live
' inside the bundled GrumpyCharts.vb "#If PRINT_SUPPORT Then" block.
Module PrintProbe
    Public Sub Use(chart As ChartBase)
        Dim printing = chart.PrintAsync()
        Dim exporting = chart.PrintToPdfAsync()
    End Sub
End Module
`;

/** The parts of the scaffold that only exist for hardcopy output. */
function assertScaffoldText(t, language, dir) {
    const ext = language === 'cs' ? 'csproj' : 'vbproj';
    const raw = fs.readFileSync(path.join(dir, `${path.basename(dir)}.${ext}`), 'utf8');
    // Comments are stripped first: the template documents the two broken forms on purpose, and
    // a naive /FinalDefineConstants/ test would trip over its own explanation.
    const project = raw.replace(/<!--[\s\S]*?-->/g, '');
    const program = fs.readFileSync(path.join(dir, language === 'cs' ? 'Program.cs' : 'Program.vb'), 'utf8');

    if (language === 'cs') {
        t.ok(project.includes('<DefineConstants>$(DefineConstants);PRINT_SUPPORT</DefineConstants>'),
            'print-symbol', 'cs: csproj defines PRINT_SUPPORT (the C# semicolon form is correct here)');
    } else {
        t.ok(project.includes('<DefineConstants>$(DefineConstants),PRINT_SUPPORT</DefineConstants>'),
            'print-symbol', 'vb: vbproj defines PRINT_SUPPORT as a COMMA token (vbc\'s /define: is comma-separated)');
        t.ok(!/FinalDefineConstants/.test(project),
            'print-symbol', 'vb: no FinalDefineConstants target — the SDK overwrites it before VbcCompile, which silently drops the symbol');
        t.ok(!/<Target\b/.test(project),
            'print-symbol', 'vb: nothing pokes the compiler from a target (the overwritten-write trap)');
    }

    for (const pkg of ['Avae.Printables', 'AvaloniaUI.PrintToPDF']) {
        t.ok(new RegExp(`<PackageReference Include="${pkg.replace('.', '\\.')}" Version="[0-9]`).test(project),
            'print-symbol', `${language}: ${pkg} is referenced by the generated project`);
    }
    t.ok(/(using Avae\.Printables;|Imports Avae\.Printables)/.test(program),
        'print-symbol', `${language}: Program imports Avae.Printables`);
    t.ok(program.includes('.UsePrintables()'),
        'print-symbol', `${language}: AppBuilder calls UsePrintables()`);
}

/** Keeps the build probe honest: it only proves the symbol if the members really are gated. */
function assertMembersAreGated(t) {
    const charts = path.join(__dirname, '..', '..', 'resources');
    for (const [file, guard] of [
        ['GrumpyCharts.cs', '#if PRINT_SUPPORT'],
        ['GrumpyCharts.vb', '#If PRINT_SUPPORT Then'],
    ]) {
        const text = fs.readFileSync(path.join(charts, file), 'utf8');
        const guardAt = text.indexOf(guard);
        const printAt = text.indexOf('PrintAsync', guardAt);
        const pdfAt = text.indexOf('PrintToPdfAsync', guardAt);
        t.ok(guardAt >= 0 && printAt > guardAt && pdfAt > printAt,
            'print-symbol', `${file}: PrintAsync/PrintToPdfAsync still live inside "${guard}" (so the probe can only pass when the symbol is defined)`);
    }
}

module.exports = async (t) => {
    t.section('T0: PRINT_SUPPORT is really defined (build a probe that references the gated members)');

    assertMembersAreGated(t);

    for (const language of ['cs', 'vb']) {
        const name = `PrintSupport_${language}`;
        t.note(`generating ${language} project + probe → ${name}`);
        const dir = generateProject({ language, tplId: 'about', name });
        fs.writeFileSync(path.join(dir, language === 'cs' ? 'PrintProbe.cs' : 'PrintProbe.vb'),
            language === 'cs' ? PROBE_CS : PROBE_VB, 'utf8');

        assertScaffoldText(t, language, dir);

        const r = dotnetBuild(dir);
        // A missing symbol shows up here as "BC30456/'PrintAsync' is not a member" (VB) or
        // "CS1061 … does not contain a definition for 'PrintAsync'" (C#).
        t.equal(r.errors, 0, 'print-symbol', `${language}: probe referencing PrintAsync/PrintToPdfAsync builds`,
            `errors=${r.errors} warnings=${r.warnings}`);
        t.equal(r.warnings, 0, 'print-symbol', `${language}: probe build is warning-free`,
            `warnings=${r.warnings}`);
        if (r.errors > 0 && !/PrintAsync|PrintToPdfAsync|BC30456|CS1061/.test(r.output)) {
            t.note(`unexpected build failure:\n${r.output.split('\n').slice(0, 12).join('\n')}`);
        }
    }
};
