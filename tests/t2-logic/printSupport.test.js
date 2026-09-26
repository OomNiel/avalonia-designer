/* T2 — the chart hardcopy surface, in BOTH twins.
 *
 * The chart prints through two third-party packages, so the source contract is what keeps the two
 * files honest: every member is declared in C# and in VB, the page/PNG half is OUTSIDE the
 * `PRINT_SUPPORT` symbol (the headless previewer links the same file without the printer packages,
 * so a symbol-gated page property would fail to load a form that sets it), and the print half is
 * INSIDE it (a build without the packages must still compile).
 *
 * The failures this pins were all real at some point in one language only:
 *   - `Await` inside a `Catch` is BC36943 in VB (legal in C#) — the fallback had to be restructured
 *     in both twins, and it is asserted here so a future edit cannot re-introduce it in one file;
 *   - a silent `catch { }` meant a click could do nothing with no way to find out why;
 *   - `Printable.Default` being null (no `UsePrintables()`, or a platform without one) turned the
 *     Print… entry into a dead menu item instead of a disabled one that explains itself.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CS = fs.readFileSync(path.join(ROOT, 'resources', 'GrumpyCharts.cs'), 'utf8');
const VB = fs.readFileSync(path.join(ROOT, 'resources', 'GrumpyCharts.vb'), 'utf8');
const TWINS = [['cs', CS], ['vb', VB]];

/** Everything that must be in both files, where it lives, and why. */
const UNCONDITIONAL = [
    ['ChartPaper', 'the paper enum'],
    ['AsDrawn', 'the default (the chart\'s own size)'],
    ['A4', 'the A4 preset'],
    ['Letter', 'the Letter preset'],
    ['ChartPrintOptions', 'the options object'],
    ['HasPage', 'the "real paper was asked for" test'],
    ['LightBackground', 'the white-page option'],
    ['Clone', 'a copy of the options'],
    ['ChartPrintPage', 'the page wrapper that keeps the chart vector'],
    ['VisualBrush', 'so the chart is painted, not rasterised'],
    ['PrintPaperProperty', 'the PrintPaper row'],
    ['PrintMarginProperty', 'the PrintMargin row'],
    ['PrintLightBackgroundProperty', 'the Print on White row'],
    ['PrintFailed', 'the event a failure is reported through'],
    ['IsPrinting', 'the re-entrancy state'],
    ['Trace.WriteLine', 'the failure is logged, not swallowed'],
    ['ExportPng', 'the PNG export'],
    ['PngBitmapEncoderOptions', 'the non-obsolete Save overload'],
    ['SaveAsPictureAsync', 'the PNG picker'],
    ['LastExportFolder', 'the export folder memory'],
    ['ChartLegendMode', 'the legend-on-the-page choice (As drawn / Off / On)'],
    ['PrintLegendProperty', 'the Print Legend row'],
    ['ApplyPrintTweaks', 'the overrides are scoped to one job'],
    ['WithPrintTweaksAsync', 'and applied on the render paths'],
    ['PrintTweaksRestore', 'which puts the chart\'s own settings back (even when the job failed)'],
    ['ChartInkMode', 'the colour / mono choice'],
    ['PrintInkProperty', 'the Print Ink row'],
    ['PlotBackOpacity', 'what mono hides for the job (the colour plate)'],
    ['PlotBackBrush', 'and a background brush the form may have set']
];

const GATED = [
    ['CanPrint', 'the availability test the menu uses'],
    ['Printable.Default', 'the printing service itself'],
    ['PrintAsync', 'the native dialog'],
    ['PrintToPdfAsync', 'the PDF picker'],
    ['ExportPdfAsync', 'the picker-free export'],
    ['ToStreamAsync', 'the export into a stream (no local path)'],
    ['OpenWriteAsync', 'writing through a picked file that has no path'],
    ['SuggestedStartLocation', 'the remembered export folder'],
    ['grumpychart-', 'the temporary PDF of the file-based print fallback'],
    ['Key.P', 'the Ctrl+P shortcut']
];

module.exports = async (t) => {
    t.section('T2: chart hardcopy (print / PDF / PNG) in both twins');

    for (const [lang, text] of TWINS) {
        for (const [token, why] of UNCONDITIONAL) {
            t.ok(text.includes(token), `hardcopy-${lang}`, `${lang}: carries ${token} — ${why}`);
        }
        for (const [token, why] of GATED) {
            t.ok(text.includes(token), `hardcopy-${lang}`, `${lang}: carries ${token} — ${why}`);
        }
    }

    // ---- the split between what the previewer compiles and what needs the printer packages --------
    // The boundary is the gated block itself, not the first `#if PRINT_SUPPORT` — that one is up at the
    // usings, where it guards the two package namespaces.
    const GATE = {
        cs: CS.indexOf('public static bool CanPrint'),
        vb: VB.indexOf('Public Shared ReadOnly Property CanPrint')
    };
    for (const [lang, text] of TWINS) {
        const gate = GATE[lang];
        t.ok(gate > 0, `hardcopy-${lang}`, `${lang}: the availability test is where the gated block starts`);
        t.ok(text.indexOf('PrintPaperProperty') < gate, `hardcopy-${lang}`,
            `${lang}: the page rows are declared BEFORE it — the headless previewer parses a form that sets them`);
        t.ok(text.indexOf('ExportPng') < gate, `hardcopy-${lang}`,
            `${lang}: and so is the PNG export, which needs no printer package`);
        t.ok(text.indexOf('ExportPdfAsync') > gate, `hardcopy-${lang}`,
            `${lang}: while the PDF export needs AvaloniaUI.PrintToPDF and stays inside`);
    }
    t.ok(CS.includes('#if PRINT_SUPPORT') && VB.includes('#If PRINT_SUPPORT Then'), 'hardcopy-twins',
        'both twins gate the print half behind the symbol (the usings are gated with it)');

    // ---- VB traps that the C# twin cannot see ----------------------------------------------------
    t.ok(VB.includes('Async Sub(sender As Object, e As RoutedEventArgs)'), 'hardcopy-vb',
        'vb: the menu handlers AWAIT their call, so no #Disable Warning BC42358 is needed');
    const menuStart = VB.indexOf('Dim printItem As New MenuItem');
    const menuEnd = VB.indexOf('#End If', menuStart);
    t.ok(menuStart > 0 && menuEnd > menuStart, 'menu-vb', 'vb: the hardcopy menu block is where expected');
    t.ok(!VB.slice(menuStart, menuEnd).includes('#Disable Warning'), 'menu-vb',
        'vb: the hardcopy handlers suppress nothing — they await (BrowseForFile keeps its own, older pragma)');
    // Await inside Catch/Finally is BC36943: the fallback must capture the failure and act outside.
    for (const [lang, text] of TWINS) {
        const catchBlocks = [...text.matchAll(/catch\b[^\n{]*\{([\s\S]{0,400}?)\}/g)].map((m) => m[1]);
        t.ok(catchBlocks.every((body) => !/\bawait\b/.test(body)), `hardcopy-${lang}`,
            `${lang}: no Await inside a catch block (BC36943 in VB — the twins share this shape)`);
    }
    t.ok(VB.includes('visualFailure = ex'), 'hardcopy-vb',
        'vb: the print failure is held and handled after the catch, which is how the fallback stays legal');

    // ---- feedback, availability and the guard ----------------------------------------------------
    for (const [lang, text] of TWINS) {
        t.ok(!text.includes('A failed save must never take the form down.'), `hardcopy-${lang}`,
            `${lang}: the silent save failure is gone`);
        t.ok(!text.includes('leave a menu click without feedback'), `hardcopy-${lang}`,
            `${lang}: and so is the print one`);
        t.ok(/RaisePrintFailed/.test(text), `hardcopy-${lang}`, `${lang}: failures go through RaisePrintFailed`);
        t.ok(/RaiseEvent PrintFailed|PrintFailed\?\.Invoke/.test(text), `hardcopy-${lang}`,
            `${lang}: and reach the event`);
        t.ok((text.match(/_printBusy = True|_printBusy = true/g) || []).length >= 4, `hardcopy-${lang}`,
            `${lang}: every export/print entry point takes the busy flag (no second dialog)`);
        t.ok(text.includes('IsEnabled = CanPrint'), `hardcopy-${lang}`,
            `${lang}: the Print… entry is disabled rather than silently dead when no service is registered`);
        t.ok(text.includes('UsePrintables() in Program'), `hardcopy-${lang}`,
            `${lang}: and its tooltip says how to fix that`);
    }

    // ---- the menu offers all three, before the cursor gate ---------------------------------------
    for (const [lang, text] of TWINS) {
        for (const header of ['"Print…"', '"Print to PDF…"', '"Save as picture…"']) {
            t.ok(text.includes(header), `menu-${lang}`, `${lang}: the chart menu offers ${header}`);
        }
        const cursorGate = lang === 'cs' ? 'if (!SupportsCursors)' : 'If Not SupportsCursors Then';
        t.ok(text.indexOf('"Save as picture…"') < text.indexOf(cursorGate), `menu-${lang}`,
            `${lang}: all three sit before the cursor gate, so the pie and the bar expose them too`);
    }

    // ---- twin equivalence: the same members by name ----------------------------------------------
    const vbOf = (csName) => csName;   // the names are deliberately identical in both twins
    for (const [token] of UNCONDITIONAL.concat(GATED).filter(([s]) => /^[A-Za-z_][A-Za-z0-9_.]*$/.test(s))) {
        t.ok(VB.includes(vbOf(token)), 'twin-parity', `vb: ${token} exists under the same name as in C#`);
    }

    // ---- the designer exposes the page rows on every chart ---------------------------------------
    const { propertyDefsFor, PROP_SECTIONS } = require(path.join(ROOT, 'out', 'propertyCatalog.js'));
    const { DOMParser } = require('@xmldom/xmldom');
    const NS = 'xmlns="https://github.com/avaloniaui"'
        + ' xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" xmlns:charts="using:AvaloniaCharts"';
    const elFrom = (xml) => {
        const doc = new DOMParser().parseFromString(`<root ${NS}>${xml}</root>`, 'text/xml');
        for (let i = 0; i < doc.documentElement.childNodes.length; i++) {
            const c = doc.documentElement.childNodes.item(i);
            if (c.nodeType === 1) return c;
        }
        return null;
    };
    const charts = ['GrumpyLinePlot', 'GrumpyXYPlot', 'GrumpyBarPlot', 'GrumpyAreaPlot',
        'GrumpyPiePlot', 'GrumpyWaterfallPlot', 'GrumpySurfacePlot'];
    for (const tag of charts) {
        const keys = propertyDefsFor(elFrom(`<charts:${tag} x:Name="c1"/>`)).map((p) => p.key);
        for (const key of ['PrintPaper', 'PrintMargin', 'PrintLightBackground']) {
            t.ok(keys.includes(key), 'catalog', `${tag}: the Properties panel offers ${key}`);
        }
    }
    const paperRow = propertyDefsFor(elFrom('<charts:GrumpyLinePlot x:Name="c1"/>'))
        .find((p) => p.key === 'PrintPaper');
    t.equal(paperRow && paperRow.options && paperRow.options.join(','), 'AsDrawn,A4,Letter', 'catalog',
        'the Print Paper row offers the three choices, the unchanged default first');
    const section = PROP_SECTIONS.find((s) => s.keys.includes('PrintPaper'));
    t.ok(!!section, 'catalog', 'the print rows are filed in a section (the panel groups by this list)');
    t.ok(['PrintMargin', 'PrintLightBackground'].every((k) => section.keys.includes(k)), 'catalog',
        'and all three sit in that one section, so they read as one group');

    // ---- the project-file half of the upgrade (an older project has no Print entries at all) -------
    const { printSupportState, addPrintSupport, PRINT_PACKAGES } =
        require(path.join(ROOT, 'out', 'printSupport.js'));
    const bareProject = `<?xml version="1.0" encoding="utf-8"?>
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Avalonia" Version="12.1.1" />
  </ItemGroup>
</Project>
`;
    const before = printSupportState(bareProject, 'static class Program { }');
    t.equal([before.packages, before.symbol, before.usePrintables, before.complete].join(','),
        'false,false,false,false', 'project-fix',
        'a project from before 0.12.0 is recognised as missing all three things the hardcopy needs');

    const fixedCs = addPrintSupport(bareProject, 'cs');
    const afterCs = printSupportState(fixedCs, '.UsePrintables()');
    t.equal([afterCs.packages, afterCs.symbol, afterCs.usePrintables, afterCs.complete].join(','),
        'true,true,true,true', 'project-fix',
        'the project-file fix plus the Program line add up to a complete project');
    t.ok(fixedCs.includes('<DefineConstants>$(DefineConstants);PRINT_SUPPORT</DefineConstants>'), 'project-fix',
        'C# gets the semicolon form');
    t.equal(addPrintSupport(fixedCs, 'cs'), fixedCs, 'project-fix',
        'and the fix is idempotent — offering it twice cannot double anything');
    for (const pkg of PRINT_PACKAGES) {
        t.ok(fixedCs.includes(`<PackageReference Include="${pkg.id}" Version="${pkg.version}" />`), 'project-fix',
            `${pkg.id} is added at the version the scaffold uses`);
    }
    t.ok(fixedCs.includes('Include="Avalonia"'), 'project-fix', 'the references the project already had are untouched');
    t.ok(fixedCs.indexOf('PackageReference Include="Avae.Printables"') > fixedCs.indexOf('Include="Avalonia"'), 'project-fix',
        'the new references join the project\'s own ItemGroup');

    const fixedVb = addPrintSupport(bareProject, 'vb');
    t.ok(fixedVb.includes('<DefineConstants>$(DefineConstants),PRINT_SUPPORT</DefineConstants>'), 'project-fix',
        'VB gets the COMMA form — the C# semicolon idiom is BC31030 for vbc');
    t.ok(!fixedVb.includes('$(DefineConstants);PRINT_SUPPORT'), 'project-fix', 'and never the semicolon one');
    t.ok(!fixedVb.includes('FinalDefineConstants'), 'project-fix',
        'and never a FinalDefineConstants target — the SDK overwrites it after the target runs, which is how the symbol went missing in the first place');

    // The no-op that makes it safe to offer: on every project the designer generates today, the fix
    // changes nothing at all.
    const scaffold = require(path.join(ROOT, 'out', 'projectScaffold.js'));
    const { TEMPLATES } = require(path.join(ROOT, 'out', 'formTemplates.js'));
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'printsupport-'));
    try {
        for (const language of ['cs', 'vb']) {
            const name = language === 'cs' ? 'PrintCheckCs' : 'PrintCheckVb';
            const dir = path.join(tmp, language);
            scaffold.generateProjectScaffold({
                language, tpl: TEMPLATES[0], name, projectPath: dir,
                chromeCs: '', chromeVb: '', anchorCs: '', anchorVb: ''
            });
            const text = fs.readFileSync(path.join(dir, `${name}.${language === 'cs' ? 'csproj' : 'vbproj'}`), 'utf8');
            const program = fs.readFileSync(path.join(dir, language === 'cs' ? 'Program.cs' : 'Program.vb'), 'utf8');
            t.equal(printSupportState(text, program).complete, true, 'project-fix',
                `a freshly generated ${language} project is complete — the designer has nothing to offer`);
            t.equal(addPrintSupport(text, language), text, 'project-fix',
                `and the fix leaves that ${language} project file byte-identical`);
        }
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }

    // ---------------------------------------------------------------- the CUPS helper (GrumpyPrint)
    // Why it exists: Avae.Printables is a community library and publishes a REAL service only for the
    // platforms it targets (Windows/WinRT, macOS, GTK-Linux, the browser, Android, iOS). A plain Linux
    // desktop build restores the API-only `net8.0` asset, where `UsePrintables()` compiles, runs and
    // registers NOTHING — `Printable.Default` stays null and the chart's Print… entry stayed disabled on
    // the very machine the chart was drawn on. The bundled helper renders the page to a temporary PDF
    // (the same vector export the chart already writes) and hands it to CUPS (`lp`).
    const printCs = fs.readFileSync(path.join(ROOT, 'resources', 'GrumpyPrint.cs'), 'utf8');
    const printVb = fs.readFileSync(path.join(ROOT, 'resources', 'GrumpyPrint.vb'), 'utf8');
    const PRINT_TWINS = [['cs', printCs], ['vb', printVb]];
    const { bundledComponentSpecs } = require(path.join(ROOT, 'out', 'bundledComponents.js'));

    for (const [lang, text] of PRINT_TWINS) {
        const where = `cups-${lang}`;
        // The split: the type exists in both builds, the CUPS half only with the symbol — the headless
        // PreviewerHost links this file and has no printer packages at all, and that build must compile.
        t.ok(lang === 'cs' ? text.includes('#if PRINT_SUPPORT') : text.includes('#If PRINT_SUPPORT Then'),
            where, `${lang}: the CUPS half is behind PRINT_SUPPORT (the host builds without it)`);
        t.ok(lang === 'cs' ? text.includes('#else') : text.includes('#Else'), where,
            `${lang}: and an empty half carries the build that cannot print at all`);
        for (const [token, why] of [
            ['BUNDLED-COPY:', 'the stamp that marks it bundled, so an old copy can be refreshed'],
            ['Available', 'what the chart asks before it offers its Print… entry'],
            ['IsLinux', 'CUPS is the Linux answer — Windows and macOS keep the platform dialog'],
            ['OnPath', 'a printer only exists if a CUPS client is on the PATH'],
            ['lp', 'the CUPS client itself'],
            ['ArgumentList', 'arguments as a list — no shell, so no quoting bugs and no injection'],
            ['ToFileAsync', 'the page is rendered to a temporary PDF first (the vector, not a screenshot)'],
            ['GetTempPath', 'written where the OS cleans up after a crash'],
            ['File.Delete', 'and removed again once lp has it (the spooler reads it before returning)'],
            ['-t', 'the job title, so the print queue says what is being printed'],
            ['Trace.WriteLine', 'a failure is logged, not swallowed — otherwise the failure is undiagnosable'],
        ]) {
            t.ok(text.includes(token), where, `${lang}: carries ${token} — ${why}`);
        }
        // Avae's own interface is deliberately NOT implemented: `IPrintingService.GetVisual()` is Friend
        // (inaccessible) in 3.0.7, so VB cannot implement the interface at all and C# only explicitly —
        // and a service that only one of the two twins can register is not a twin. The chart asks the
        // helper directly instead, and no fake platform service is registered over a real one.
        t.ok(!text.includes('IPrintingService'), where,
            `${lang}: does not implement Avae's IPrintingService (GetVisual is Friend, so VB could not)`);
        t.ok(!text.includes('SetDefault'), where,
            `${lang}: and never registers itself as the platform service — the chart asks it directly`);
    }
    t.ok(/Available[\s\S]{0,400}?IsLinux[\s\S]{0,200}?OnPath\("lp"\)/.test(printCs), 'cups-cs',
        'the answer is Linux AND a CUPS client — measured, in that order');
    t.ok(!/_available = true/.test(printCs), 'cups-cs', 'and it starts false: nothing is assumed');

    // The chart HAS to use it, in both twins, inside the availability test the menu reads.
    for (const [lang, text] of TWINS) {
        t.ok(text.includes('GrumpyPrint.Available'), `cups-${lang}`,
            `${lang}: the chart asks GrumpyPrint.Available`);
        t.ok(text.includes('GrumpyPrint.PrintAsync'), `cups-${lang}`,
            `${lang}: and prints through it when Avae has no service of its own`);
        t.ok(text.indexOf('GrumpyPrint.Available') > text.indexOf('CanPrint'), `cups-${lang}`,
            `${lang}: the ask happens inside CanPrint, so the menu reflects it (enabled, not dead)`);
    }
    t.ok(/Printable\.Default is not null[\s\S]{0,200}?GrumpyPrint\.Available/.test(CS), 'cups-cs',
        'CanPrint accepts EITHER backend: the platform service if there is one, CUPS otherwise');
    t.ok(/Printable\.Default IsNot Nothing[\s\S]{0,300}?GrumpyPrint\.Available/.test(VB), 'cups-vb',
        'and the same in VB');

    // The bundled spec: existing projects are told to refresh, and the helper travels with the chart.
    const grumpyPrintSpec = bundledComponentSpecs(false).find((s) => s.kind === 'GrumpyPrint');
    t.ok(grumpyPrintSpec, 'cups-spec', 'there is a bundled-component spec for GrumpyPrint');
    t.equal(grumpyPrintSpec.file, 'GrumpyPrint.cs', 'cups-spec', 'the C# file name');
    t.equal(bundledComponentSpecs(true).find((s) => s.kind === 'GrumpyPrint').file, 'GrumpyPrint.vb',
        'cups-spec', 'and the VB one');
    t.equal(grumpyPrintSpec.marker, 'SendFileAsync', 'cups-spec',
        'the marker is the newest member (the lp invocation), so an older helper is refreshed');
    for (const [lang, text] of PRINT_TWINS) {
        t.ok(text.includes(grumpyPrintSpec.marker), `cups-spec-${lang}`,
            `${lang}: the shipped copy carries its own marker, so it never looks stale`);
    }

    // The host links it: that build has no PRINT_SUPPORT, so the empty half is compiled on every build.
    const hostProj = fs.readFileSync(path.join(ROOT, 'host', 'PreviewerHost.csproj'), 'utf8');
    t.ok(hostProj.includes('../resources/GrumpyPrint.cs'), 'cups-host',
        'the previewer host links the helper — the no-symbol half is compiled there, every build');

    // The scaffold writes BOTH files: a project whose chart calls GrumpyPrint does not compile without it.
    const cupsTmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'grumpyprint-'));
    try {
        for (const language of ['cs', 'vb']) {
            const dir = path.join(cupsTmp, language);
            scaffold.generateProjectScaffold({
                language, tpl: TEMPLATES[0], name: language === 'cs' ? 'CupsCheckCs' : 'CupsCheckVb',
                projectPath: dir,
                chromeCs: '', chromeVb: '', anchorCs: '', anchorVb: '',
                chartsCs: CS, chartsVb: VB, grumpyPrintCs: printCs, grumpyPrintVb: printVb
            });
            const file = language === 'cs' ? 'GrumpyPrint.cs' : 'GrumpyPrint.vb';
            const written = path.join(dir, file);
            t.ok(fs.existsSync(written), 'cups-scaffold', `${language}: the scaffold writes ${file}`);
            t.equal(fs.existsSync(written) ? fs.readFileSync(written, 'utf8') : '',
                language === 'cs' ? printCs : printVb, 'cups-scaffold',
                `${language}: byte-identical to the bundled resource (stamp and all)`);
        }
    } finally {
        fs.rmSync(cupsTmp, { recursive: true, force: true });
    }
    // …and omitting the options keeps the old file set, the discipline every bundled file follows.
    const noneTmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'grumpyprint-none-'));
    try {
        const dir = path.join(noneTmp, 'plain');
        scaffold.generateProjectScaffold({
            language: 'cs', tpl: TEMPLATES[0], name: 'PlainCs', projectPath: dir,
            chromeCs: '', chromeVb: '', anchorCs: '', anchorVb: ''
        });
        t.ok(!fs.existsSync(path.join(dir, 'GrumpyPrint.cs')), 'cups-scaffold',
            'and nothing is written when the option is omitted (old fixtures stay byte-identical)');
    } finally {
        fs.rmSync(noneTmp, { recursive: true, force: true });
    }

    // The designer copies the helper wherever it refreshes the chart: one without the other cannot compile.
    const panel = fs.readFileSync(path.join(ROOT, 'src', 'designerPanel.ts'), 'utf8');
    t.ok(panel.includes("'GrumpyPrint'"), 'cups-panel',
        'the designer asks for the helper wherever it refreshes a chart');
    t.ok(/ensureBundledFileIn\(folder, vb, 'GrumpyCharts'[\s\S]{0,500}?ensureBundledFileIn\(folder, vb, 'GrumpyPrint'/.test(panel),
        'cups-panel', 'both files, the chart first');
    // The test-project generator must pass it too, or every generated fixture with a chart fails to build.
    const generator = fs.readFileSync(path.join(ROOT, 'tests', 'helpers', 'build.js'), 'utf8');
    t.ok(generator.includes("readResource('GrumpyPrint.cs')") && generator.includes('grumpyPrintVb'),
        'cups-harness', 'the test project generator reads and passes both files');

    // ---------------------------------------------------------------- Print Legend (the row, not the toggle)
    // The legend belongs to the LIVE chart, so an override cannot be handed to a printer backend as a
    // visual: for that one case the chart renders the page itself (the same vector PDF the export writes)
    // and prints that FILE — and its own ShowLegend is put back when the job is done, so a print never
    // changes what is on screen. The three choices are the same in both twins, and the XAML value stays
    // "On" in VB even though the member has to be bracketed there (On is a VB keyword).
    for (const [lang, text] of TWINS) {
        const where = `legend-${lang}`;
        t.ok(text.includes('ChartLegendMode'), where, `${lang}: the legend-on-the-page choice exists`);
        t.ok(text.includes('PrintLegendProperty'), where, `${lang}: the Print Legend row is a real property`);
        for (const member of ['AsDrawn', 'Off']) {
            t.ok(new RegExp(`\\b${member}\\b`).test(text), where, `${lang}: the ${member} choice is there`);
        }
        t.ok(lang === 'vb' ? text.includes('[On]') : /\bOn\b/.test(text), where,
            `${lang}: the On choice — ${lang === 'vb'
                ? 'bracketed, because On is a VB keyword (the member and the XAML value stay "On")'
                : 'plain, as in the other twin'}`);
        t.ok(text.includes('ShowLegend'), where, `${lang}: the override acts on the chart's own ShowLegend`);
        t.ok(text.includes('PrintTweaksRestore'), where, `${lang}: and keeps the old setting, to put it back`);
        t.ok(text.includes('options.Ink = PrintInk'), where, `${lang}: and the Print Ink row feeds CurrentPrintOptions`);
        t.ok(/PlotBackBrush = (null|Nothing)/.test(text), where,
            `${lang}: mono takes BOTH halves of the plot background off the page (a brush the form set would otherwise stay on the paper)`);
        t.ok(text.includes('PlotBackOpacity = 0'), where, `${lang}: and the colour plate with it`);
        t.ok(/_chart\.PlotBackBrush = _savedBrush|_chart\.PlotBackOpacity = _savedOpacity/.test(text), where,
            `${lang}: both are restored when the job ends`);
        t.ok(text.includes('PrintFileAsync'), where,
            `${lang}: a legend override prints a rendered FILE (the live chart must not be handed over changed)`);
        t.ok(text.includes('options.Legend = PrintLegend'), where, `${lang}: the row feeds CurrentPrintOptions`);
        t.ok(text.includes('Legend != ChartLegendMode.AsDrawn') || text.includes('Legend <> ChartLegendMode.AsDrawn'),
            where, `${lang}: and the printer path branches on it (an override needs its own page)`);
        t.ok(text.includes('Ink == ChartInkMode.Mono') || text.includes('Ink = ChartInkMode.Mono'), where,
            `${lang}: as does mono — the live chart must not be handed to a printer backend changed`);
    }

    // Every chart offers the row, with As drawn first — the default the catalog hands the panel.
    const { CONTROL_PROPS } = require(path.join(ROOT, 'out', 'propertyCatalog.js'));
    for (const tag of ['GrumpyLinePlot', 'GrumpyXYPlot', 'GrumpyBarPlot', 'GrumpyAreaPlot',
        'GrumpyPiePlot', 'GrumpyWaterfallPlot', 'GrumpySurfacePlot']) {
        const row = (CONTROL_PROPS[tag] || []).find((r) => r.key === 'PrintLegend');
        t.ok(row, 'legend-catalog', `${tag} offers the Print Legend row`);
        t.equal(row ? row.options.join(',') : '', 'AsDrawn,Off,On', 'legend-catalog',
            `${tag}: the three choices, with As drawn first (the default)`);
        const ink = (CONTROL_PROPS[tag] || []).find((r) => r.key === 'PrintInk');
        t.ok(ink, 'legend-catalog', `${tag} offers the Print Ink row`);
        t.equal(ink ? ink.options.join(',') : '', 'Colour,Mono', 'legend-catalog',
            `${tag}: Colour first (the default), Mono second`);
    }
    // The section the panel files it under has to know the key, or the row would be dropped silently.
    const catalogSource = fs.readFileSync(path.join(ROOT, 'src', 'propertyCatalog.ts'), 'utf8');
    t.ok(catalogSource.includes("'PrintLegend'"), 'legend-catalog',
        'and the behavior section lists the key (an unmapped key has no section to live in)');
    t.ok(catalogSource.includes("'PrintInk'"), 'legend-catalog', 'and the Print Ink key with it');
};
