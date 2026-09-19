/* T2 — Code Fix engine (codeBehindCheck): C# constructors + VB single-line lambdas.
 *
 * Regressions covered here:
 *  1. A C# form with a perfectly good `public TestForm() { InitializeComponent(); }` was reported
 *     as having NO constructor — a false "No constructor / InitializeComponent" WARNING in the
 *     PROBLEMS pane on MainWindow.axaml.cs (the `void`-based declaration regex cannot see
 *     constructors, which have no return type). The fix then inserted a SECOND constructor (CS0111).
 *  2. A VB form whose constructor contains a single-line lambda (`Function(r) r.Name`,
 *     `Sub(s, e) DoIt()`) was reported as MISSING InitializeComponent(): the lambda was counted as a
 *     block, so the method's own `End Sub` closed the phantom level and the ctor span collapsed to
 *     its signature line.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Uri } = require('vscode');
const { analyzeCodeBehind, applyLocalFix, issueSignature } = require('../../out/codeBehindCheck.js');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"';
const AXAML = `<Window ${NS} x:Class="Proj.TestForm" Width="800" Height="450">
  <Canvas Name="Body">
    <Button x:Name="Button1" Content="A" Click="Button1_Click"/>
    <ComboBox x:Name="ComboBox2"/>
  </Canvas>
</Window>`;

function makeProject(codeFile, code, axaml) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-codefix-'));
    const axamlPath = path.join(dir, 'TestForm.axaml');
    fs.writeFileSync(axamlPath, axaml || AXAML);
    const codePath = path.join(dir, codeFile);
    fs.writeFileSync(codePath, code);
    const uri = Uri.file(axamlPath);
    return {
        dir,
        uri,
        codePath,
        analysis: () => analyzeCodeBehind(uri, { axamlText: fs.readFileSync(axamlPath, 'utf8') }),
        read: () => fs.readFileSync(codePath, 'utf8')
    };
}

/** Kind of every finding, for compact assertions. */
const kinds = (r) => r.issues.map((i) => i.kind);
const count = (text, needle) => text.split(needle).length - 1;

module.exports = async (t) => {
    t.section('codeFix');

    // ---------- 1) C# constructors are seen ----------
    {
        const p = makeProject('TestForm.axaml.cs', `using Avalonia.Controls;
namespace Proj;
public partial class TestForm : Window
{
    public TestForm()
    {
        InitializeComponent();
    }

    private void Button1_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
    }
}
`);
        const r = p.analysis();
        t.ok(!kinds(r).includes('insert-initialize'), 'cs-ctor',
            'a C# constructor that calls InitializeComponent() is not reported (the regression: it was)');
        t.equal(r.issues.length, 0, 'cs-ctor', 'and a healthy C# form reports nothing at all');
    }

    // ---------- 1b) constructor initialisers / attributes ----------
    {
        const p = makeProject('TestForm.axaml.cs', `using Avalonia.Controls;
namespace Proj;
public partial class TestForm : Window
{
    [System.Obsolete]
    public TestForm() : base()
    {
        InitializeComponent();
    }

    private void Button1_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
    }
}
`);
        const r = p.analysis();
        t.ok(!kinds(r).includes('insert-initialize'), 'cs-ctor',
            'an attributes/`: base()` constructor is recognised too');
    }

    // ---------- 2) the call really missing -> error, and the fix edits the existing ctor ----------
    {
        const p = makeProject('TestForm.axaml.cs', `using Avalonia.Controls;
namespace Proj;
public partial class TestForm : Window
{
    public TestForm()
    {
        BindImage_Image1();
    }

    private void Button1_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
    }

    private void BindImage_Image1()
    {
        Button1.Click += (s, e) => { };
    }
}
`);
        const r = p.analysis();
        const issue = r.issues.find((i) => i.kind === 'insert-initialize');
        t.ok(!!issue && issue.severity === 'error', 'cs-ctor', 'a ctor without InitializeComponent() is an error');
        t.equal(issue && issue.line, 5, 'cs-ctor', 'and it points at the constructor');

        const report = await applyLocalFix(p.uri, issue, {});
        const fixed = p.read();
        t.equal(count(fixed, 'public TestForm('), 1, 'cs-ctor',
            'the fix calls into the EXISTING constructor instead of adding a second one (CS0111)');
        t.ok(/public TestForm\(\)\s*\{\s*InitializeComponent\(\);/.test(fixed), 'cs-ctor',
            'the call is inserted as the first statement');
        t.ok(!kinds(p.analysis()).includes('insert-initialize'), 'cs-ctor', 'and the form is clean afterwards');
        t.ok(typeof report === 'string' && report.length > 0, 'cs-ctor', 'the fix reports what it did');
    }

    // ---------- 3) no constructor at all -> the new one goes INSIDE the class body ----------
    {
        const p = makeProject('TestForm.axaml.cs', `using Avalonia.Controls;
namespace Proj;
public partial class TestForm : Window
{
    private void Button1_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
    }
}
`);
        const r = p.analysis();
        const issue = r.issues.find((i) => i.kind === 'insert-initialize');
        t.ok(!!issue && issue.severity === 'warning', 'cs-ctor', 'a C# form without a ctor is warned about');
        await applyLocalFix(p.uri, issue, {});
        const fixed = p.read();
        t.equal(count(fixed, 'public TestForm('), 1, 'cs-ctor', 'exactly one constructor is inserted');
        t.ok(/\{\s*\n\s*public TestForm\(\)\s*\n\s*\{\s*\n\s*InitializeComponent\(\);/.test(fixed), 'cs-ctor',
            'it is inserted inside the class body (after the opening brace), not before it');
        t.ok(!kinds(p.analysis()).includes('insert-initialize'), 'cs-ctor', 're-analysis is clean');
    }

    // ---------- 3b) a commented-out class name cannot hijack the lookup ----------
    {
        const p = makeProject('TestForm.axaml.cs', `using Avalonia.Controls;
namespace Proj;
// class Dummy belongs to an unrelated sample
public partial class TestForm : Window
{
    public TestForm()
    {
        InitializeComponent();
    }

    private void Button1_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
    }
}
`);
        t.ok(!kinds(p.analysis()).includes('insert-initialize'), 'cs-ctor',
            'a `// class X` comment does not make the real constructor invisible');
    }

    // ---------- 4) C# Data-Image: the missing ctor call can be added (was "No constructor") ----------
    {
        const p = makeProject('TestForm.axaml.cs', `using Avalonia.Controls;
namespace Proj;
public partial class TestForm : Window
{
    public TestForm()
    {
        InitializeComponent();
    }

    private void Button1_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
    }
}
`);
        // The panel raises this one itself (it knows the binding), so hand the fixer the issue.
        const issue = { id: 'x', severity: 'error', kind: 'add-binding-call', title: '', detail: '', data: { control: 'Image1' } };
        const report = await applyLocalFix(p.uri, issue, {});
        t.ok(!/No constructor to add the call to/.test(report), 'cs-ctor',
            'the fix finds the C# constructor (the regression: it bailed out with "No constructor…")');
        const fixed = p.read();
        const decl = fixed.indexOf('public TestForm()');
        const open = fixed.indexOf('{', decl);
        const call = fixed.indexOf('BindImage_Image1();');
        t.ok(decl >= 0 && open > decl && call > open && call < fixed.indexOf('}', call), 'cs-ctor',
            'the call lands INSIDE the constructor body, after the opening brace');
        t.ok(call > fixed.indexOf('InitializeComponent();'), 'cs-ctor', 'after the existing statements');
        t.equal(count(fixed, 'public TestForm('), 1, 'cs-ctor', 'and no extra constructor is created');
    }

    // ---------- 5) VB: single-line lambdas must not unbalance the constructor span ----------
    {
        const p = makeProject('TestForm.axaml.vb', `Imports Avalonia.Controls

Class TestForm
    Inherits Window

    Public Sub New()
        InitializeComponent()
        AddHandler Button1.Click, Sub(s, e) Button1.Content = "clicked '" & DateTime.Now.ToString("s")
        ComboBox2.ItemsSource = New String() {"a", "b"}
    End Sub

    Private Sub Button1_Click(sender As Object, e As Avalonia.Interactivity.RoutedEventArgs)
        ' keep me
    End Sub
End Class
`);
        const r = p.analysis();
        t.ok(!kinds(r).includes('insert-initialize'), 'vb-lambda',
            'a single-line Sub(…) lambda in the constructor does not hide InitializeComponent()');
        t.ok(!kinds(r).includes('remove-orphaned-handler'), 'vb-lambda',
            'and the apostrophe inside the lambda string does not swallow Button1_Click');
    }

    // ---------- 5b) VB: a single-line Function(x) lambda behaves the same ----------
    {
        const p = makeProject('TestForm.axaml.vb', `Imports Avalonia.Controls

Class TestForm
    Inherits Window

    Public Sub New()
        InitializeComponent()
        Dim names = New String() {"a"}
        ComboBox2.ItemsSource = names.Select(Function(x) x.ToUpper()).ToList()
        Button1.Content = If(names.Any(Function(x) x = "a"), "yes", "no")
    End Sub

    Private Sub Button1_Click(sender As Object, e As Avalonia.Interactivity.RoutedEventArgs)
        ' keep me
    End Sub
End Class
`);
        const r = p.analysis();
        t.ok(!kinds(r).includes('insert-initialize'), 'vb-lambda',
            'a single-line Function(x) lambda does not unbalance the constructor either');
    }

    // ---------- 6) VB: a MULTI-line lambda block is still counted (no early truncation) ----------
    {
        const p = makeProject('TestForm.axaml.vb', `Imports Avalonia.Controls

Class TestForm
    Inherits Window

    Public Sub New()
        InitializeComponent()
        AddHandler Button1.Click, Sub()
                                      Button1.Content = "tick"
                                  End Sub
        Button1.Content = "ready"
    End Sub

    Private Sub Button1_Click(sender As Object, e As Avalonia.Interactivity.RoutedEventArgs)
        ' keep me
    End Sub
End Class
`);
        const r = p.analysis();
        t.ok(!kinds(r).includes('insert-initialize'), 'vb-lambda',
            'a block lambda inside the constructor keeps the ctor span open to its own End Sub');
    }

    // ---------- 6b) and deleting an orphaned handler with a block lambda removes exactly it ----------
    {
        const p = makeProject('TestForm.axaml.vb', `Imports Avalonia.Controls

Class TestForm
    Inherits Window

    Public Sub New()
        InitializeComponent()
    End Sub

    Private Sub Button9_Click(sender As Object, e As Avalonia.Interactivity.RoutedEventArgs)
        Dim timer As New Avalonia.Threading.DispatcherTimer
        AddHandler timer.Tick, Sub(s2, e2)
                                   Button1.Content = "tick"
                               End Sub
        timer.Start()
    End Sub

    Private Sub Button1_Click(sender As Object, e As Avalonia.Interactivity.RoutedEventArgs)
        ' keep me
    End Sub
End Class
`);
        const r = p.analysis();
        const issue = r.issues.find((i) => i.kind === 'remove-orphaned-handler' && i.member === 'Button9_Click');
        t.ok(!!issue, 'vb-lambda', 'the handler of the deleted Button9 is reported');
        await applyLocalFix(p.uri, issue, {});
        const fixed = p.read();
        t.ok(!/Button9_Click/.test(fixed), 'vb-lambda', 'the leftover handler is gone');
        t.ok(!/timer\.Start/.test(fixed), 'vb-lambda', 'including the statements after the nested block');
        t.ok(/Button1_Click/.test(fixed), 'vb-lambda', 'and the next method survives untouched');
        t.equal(count(fixed, 'End Sub'), 2, 'vb-lambda', 'no stray End Sub is left behind');
    }

    // ---------- 6c) …and a method with a single-line lambda is removed in FULL ----------
    {
        const p = makeProject('TestForm.axaml.vb', `Imports Avalonia.Controls

Class TestForm
    Inherits Window

    Public Sub New()
        InitializeComponent()
    End Sub

    Private Sub Button9_Click(sender As Object, e As Avalonia.Interactivity.RoutedEventArgs)
        AddHandler Button1.Click, Sub(s2, e2) Button1.Content = "tick"
        Button1.Content = "done"
    End Sub

    Private Sub Button1_Click(sender As Object, e As Avalonia.Interactivity.RoutedEventArgs)
        ' keep me
    End Sub
End Class
`);
        const r = p.analysis();
        const issue = r.issues.find((i) => i.kind === 'remove-orphaned-handler' && i.member === 'Button9_Click');
        t.ok(!!issue, 'vb-lambda', 'the leftover handler holding a single-line lambda is reported');
        await applyLocalFix(p.uri, issue, {});
        const fixed = p.read();
        t.ok(!/Button9_Click/.test(fixed) && !/"done"/.test(fixed), 'vb-lambda',
            'the whole method is removed — body included, not just its signature line');
        t.ok(/Button1_Click/.test(fixed) && /Public Sub New/.test(fixed), 'vb-lambda', 'the neighbours survive');
        t.equal(count(fixed, 'End Sub'), 2, 'vb-lambda', 'the file stays balanced');
    }

    // ---------- 7) VB: no constructor at all is still fixed ----------
    {
        const p = makeProject('TestForm.axaml.vb', `Imports Avalonia.Controls

Class TestForm
    Inherits Window

    Private Sub Button1_Click(sender As Object, e As Avalonia.Interactivity.RoutedEventArgs)
        ' keep me
    End Sub
End Class
`);
        const r = p.analysis();
        const issue = r.issues.find((i) => i.kind === 'insert-initialize');
        t.ok(!!issue, 'vb-lambda', 'a VB form without a ctor is warned about');
        await applyLocalFix(p.uri, issue, {});
        const fixed = p.read();
        t.equal(count(fixed, 'Public Sub New()'), 1, 'vb-lambda', 'a VB constructor is inserted');
        t.ok(/Public Sub New\(\)\s*\n\s*InitializeComponent\(\)/.test(fixed), 'vb-lambda', 'calling InitializeComponent()');
        t.ok(fixed.indexOf('Inherits Window') < fixed.indexOf('Public Sub New()'), 'vb-lambda',
            'and it lands AFTER the Inherits statement (VB requires Inherits first in the class body)');
        t.ok(!kinds(p.analysis()).includes('insert-initialize'), 'vb-lambda', 're-analysis is clean');
    }

    // ---------- 8) a handler renamed by hand → re-point the XAML (never guess) ----------
    {
        const vb = (body) => `Imports Avalonia.Controls

Class TestForm
    Inherits Window

    Public Sub New()
        InitializeComponent()
    End Sub

${body}
End Class
`;
        const handler = (name, args) =>
            `    Private Sub ${name}(sender As Object, e As ${args})\n        ' body\n    End Sub`;

        // The form wires Button1_Click; the code declares Button1_Clicked with the SAME signature.
        const renamed = makeProject('TestForm.axaml.vb', vb(handler('Button1_Clicked', 'Avalonia.Interactivity.RoutedEventArgs')));
        const repoint = renamed.analysis().issues.find((i) => i.kind === 'repoint-handler');
        t.ok(!!repoint, 'repoint', 'a renamed handler is reported as re-pointable');
        t.equal(repoint && repoint.data.found, 'Button1_Clicked', 'repoint', 'the new name is carried for the fix');
        t.equal(repoint && repoint.data.handler, 'Button1_Click', 'repoint', 'the name the form still wires');
        t.equal(repoint && repoint.data.event, 'Click', 'repoint', 'with the event to re-point');
        t.equal(repoint && repoint.file, 'axaml', 'repoint', 'the finding points at the form, not the code');
        t.ok(!kinds(renamed.analysis()).includes('insert-handler'), 'repoint',
            'and the plain "insert an empty handler" finding is NOT offered (that would lose the body)');

        // Same name but the WRONG parameter list — not a rename, just a missing handler.
        const wrongArgs = makeProject('TestForm.axaml.vb', vb(handler('Button1_Clicked', 'Avalonia.Controls.SelectionChangedEventArgs')));
        t.ok(!kinds(wrongArgs.analysis()).includes('repoint-handler'), 'repoint',
            'a candidate whose signature does not fit the event is ignored');
        t.ok(kinds(wrongArgs.analysis()).includes('insert-handler'), 'repoint', 'and the safe finding is used instead');

        // Two equally plausible renames → never guess.
        const ambiguous = makeProject('TestForm.axaml.vb', vb(
            handler('Button1_Clicked', 'Avalonia.Interactivity.RoutedEventArgs') + '\n' +
            handler('Button1_ClickEx', 'Avalonia.Interactivity.RoutedEventArgs')));
        t.ok(!kinds(ambiguous.analysis()).includes('repoint-handler'), 'repoint',
            'two plausible candidates → no guess (ambiguous)');

        // An unrelated handler (another control's) is never suggested.
        const unrelated = makeProject('TestForm.axaml.vb', vb(handler('ComboBox2_SelectionChanged', 'Avalonia.Controls.SelectionChangedEventArgs')));
        t.ok(!kinds(unrelated.analysis()).includes('repoint-handler'), 'repoint',
            'a different control\'s handler is not offered as a rename');

        // The method is there → nothing reported at all.
        const healthy = makeProject('TestForm.axaml.vb', vb(handler('Button1_Click', 'Avalonia.Interactivity.RoutedEventArgs')));
        t.ok(kinds(healthy.analysis()).indexOf('repoint-handler') === -1 && kinds(healthy.analysis()).indexOf('insert-handler') === -1,
            'repoint', 'a handler that exists is not reported');
    }

    // ---------- 9) the ⚙ Settings surface exists (source level: the T3 fixture has no markup) ----------
    {
        const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'designerPanel.ts'), 'utf8');
        t.ok(/id="btnCodeSettings"/.test(src), 'settings-ui', 'the toolbar has a ⚙ Settings button');
        t.ok(src.indexOf('id="btnCodeSettings"') > src.indexOf('id="status"'), 'settings-ui',
            'and it sits at the right-hand end of the toolbar, after the status text');
        t.ok(/id="settingsModes"/.test(src) && /id="settingsBadges"/.test(src), 'settings-ui',
            'its modal has the trigger list and the badge switch');
        t.ok(/never rewrites your code/.test(src), 'settings-ui', 'and says the check is read-only');
        t.ok(/case 'openCodeSettings'/.test(src) && /case 'saveCodeSettings'/.test(src), 'settings-ui',
            'both settings messages are handled');
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
        const props = pkg.contributes.configuration.properties;
        const mode = props['avaloniaDesigner.codeCheck.mode'];
        t.ok(!!mode, 'settings-schema', 'avaloniaDesigner.codeCheck.mode is contributed');
        t.equal((mode.enum || []).join(','), 'onReturn,onSave,onType,manual', 'settings-schema',
            'with the four triggers');
        t.equal(mode.default, 'onReturn', 'settings-schema', 'returning to the designer is the default');
        t.equal(props['avaloniaDesigner.codeCheck.badges'].default, true, 'settings-schema', 'badges default to on');
    }

    // ---------- the four triggers actually fire (2026-09-18) ----------
    {
        // Reported: *"The 'When the code-behind is saved' option in the Settings dialog does not seem to work."*
        // It never could. The designer opens as a webview **in the same tab group as the code-behind**, so while
        // the user is in the `.cs`/`.vb` file — the only place `onSave` and `onType` can fire — the panel is not
        // visible, and `runSilentCheck` began with `if (!panel.visible) return;`. Only *when I come back to the
        // designer* could fire, because that is the one moment the panel is visible by definition. The badges
        // were lost with it: they are recomputed inside the same function.
        const panel = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'designerPanel.ts'), 'utf8');
        const silent = panel.slice(
            panel.indexOf('private async runSilentCheck'),
            panel.indexOf('/** Drops the findings the user dismissed')
        );
        t.ok(silent.length > 400, 'triggers', 'runSilentCheck was found');
        t.equal(/if \(!panel\.visible\) return;/.test(silent), false, 'triggers',
            'the visibility guard is gone from the check itself — it made two of the four modes unreachable');
        t.ok(/analyzeCodeBehind\(doc\.uri, this\.checkOptions\(doc\)\)/.test(silent), 'triggers',
            'the analysis runs wherever the trigger came from');
        t.ok(/publishIssues\(/.test(silent), 'triggers',
            'and PROBLEMS is updated, which is what the user can see from the editor');
        t.ok(/if \(opts\.announce && !panel\.visible\) vscode\.window\.setStatusBarMessage\(/.test(silent), 'triggers',
            'while saving announces the result in the status bar when the designer is not on screen — a check ' +
            'with no visible effect is indistinguishable from one that did not run');

        t.ok(/if \(mode !== 'onSave' && mode !== 'onType'\) return;[\s\S]{0,600}?this\.scheduleCodeBehindCheck\(e\.uri, 0, true\);/.test(panel),
            'triggers', 'onSave re-checks on the next tick and announces');
        t.ok(/this\.scheduleCodeBehindCheck\(e\.document\.uri, 900\);/.test(panel), 'triggers',
            'onType re-checks after a pause in typing, without announcing (that would be a line per pause)');
        t.ok(/if \(webviewPanel\.visible && this\.codeCheckMode\(\) === 'onReturn'\)/.test(panel), 'triggers',
            'onReturn is the one trigger that is visible by definition, and it is unchanged');
        t.ok(/private scheduleCodeBehindCheck\(uri: vscode\.Uri, delay: number, announce = false\)/.test(panel), 'triggers',
            'the two scheduler arguments are explicit in the signature');

        // The other half of "it does not work": a project that pins the setting would shadow a Global write.
        // Both keys now go through `updateSetting`, which writes where the value already lives (the 0.9.33 rule).
        t.ok(/await updateSetting\(cfg, 'codeCheck\.mode', mode\);/.test(panel) && /await updateSetting\(cfg, 'codeCheck\.badges', msg\.badges !== false\);/.test(panel),
            'triggers', 'the dialog writes codeCheck.mode and codeCheck.badges where the value already lives');
        t.equal(/cfg\.update\('codeCheck\./.test(panel), false, 'triggers',
            'and no codeCheck setting is written straight to Global any more');
    }

    // ---------- 10) every toolbar button has the SAME height (emoji labels used to be taller) ----------
    {
        const css = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'designer.css'), 'utf8');
        const block = /#toolbar button \{([^}]*)\}/.exec(css);
        t.ok(!!block, 'toolbar-css', 'the toolbar button rule exists');
        const body = block ? block[1] : '';
        t.ok(/height:\s*24px/.test(body), 'toolbar-css', 'every toolbar button is a fixed 24 px tall');
        t.ok(/box-sizing:\s*border-box/.test(body), 'toolbar-css', 'border-box so the border is inside it');
        t.ok(/align-items:\s*center/.test(body) && /display:\s*inline-flex/.test(body), 'toolbar-css',
            'its label is centred (no font-metrics stretch from emoji/glyph labels)');
        t.ok(/line-height:\s*1\b/.test(body), 'toolbar-css', 'and the line box cannot grow the button');
        t.ok(/#btnCodeSettings \{[^}]*margin-left/.test(css), 'toolbar-css',
            'the ⚙ Settings button is pushed to the far right');
        // Congestion: the toolbar wraps onto a second row instead of squeezing the buttons.
        const bar = /#toolbar \{([^}]*)\}/.exec(css);
        t.ok(!!bar && /flex-wrap:\s*wrap/.test(bar[1]), 'toolbar-css',
            'the toolbar wraps onto a second row when the buttons do not fit');
        t.ok(!!bar && /gap:\s*4px 4px/.test(bar[1]), 'toolbar-css', 'with the same gap between the rows');
        t.ok(/\n\.sep\[hidden\]\s*\{\s*display:\s*none/.test(css), 'toolbar-css',
            'a separator hidden at a row break is really removed (flex items keep `display`)');
        t.ok(/flex:\s*0 0 auto/.test(body), 'toolbar-css',
            'and a button is never squeezed — it moves to the next row instead');

        // High-contrast toolbar text + legible glyph icons (they used to be hairline arrows that
        // all but vanished on the dark button background).
        t.ok(/--fg-hi:\s*#ffffff/.test(css), 'toolbar-css', 'a pure-white toolbar colour is defined');
        t.ok(/color:\s*var\(--fg-hi\)/.test(bar[1]), 'toolbar-css', 'the toolbar itself uses it');
        t.ok(/color:\s*var\(--fg-hi\)/.test(body), 'toolbar-css', 'and so does every button');
        // Whitespace tolerant: a CSS formatter may drop the spaces around `>`.
        const glyph = /#btnUndo\s*>\s*svg,([\s\S]*?)\{([^}]*)\}/.exec(css);
        t.ok(!!glyph, 'toolbar-css', 'the icon buttons have their own rule');
        t.ok(!!glyph && /width:\s*15px/.test(glyph[2]) && /height:\s*15px/.test(glyph[2]), 'toolbar-css',
            'the icons are 15px squares');
        t.ok(!!glyph && /display:\s*block/.test(glyph[2]), 'toolbar-css', 'laid out as blocks in the button');
        t.ok(/font-family|font-weight|-webkit-text-stroke/.test(glyph[0] + glyph[2]) === false, 'toolbar-css',
            'and drawn WITHOUT a font — nothing to be missing on a font-poor machine');
        t.ok(/-webkit-text-stroke/.test(css) === false, 'toolbar-css',
            'the text-stroke workaround is gone entirely');
        for (const id of ['btnUndo', 'btnRedo', 'btnAlignLeft', 'btnAlignCentre', 'btnAlignRight', 'btnAlignTop', 'btnAlignMiddle', 'btnAlignBottom', 'btnAlignText', 'btnSameWidth', 'btnSameHeight', 'btnEqualV', 'btnEqualH']) {
            t.ok(!!glyph && new RegExp('#' + id + '\\s*>\\s*svg').test(glyph[0] + glyph[1]), 'toolbar-css',
                `${id} is covered by the icon rule`);
        }
        const disabled = /#toolbar button:disabled \{([^}]*)\}/.exec(css);
        t.ok(!!disabled, 'toolbar-css', 'disabled toolbar buttons have a rule');
        t.ok(!!disabled && /opacity:\s*0?\.45/.test(disabled[1]) === false, 'toolbar-css',
            'they are no longer washed out with 45% opacity');
        t.ok(!!disabled && /color:\s*#[0-9a-f]{6}/.test(disabled[1]), 'toolbar-css',
            'but drawn in a readable grey instead');

        // The icons themselves are INLINE SVG: identical on every machine, coloured by the button.
        const panel = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'designerPanel.ts'), 'utf8');
        const ICON_IDS = ['btnUndo', 'btnRedo', 'btnAlignLeft', 'btnAlignCentre', 'btnAlignRight',
            'btnAlignTop', 'btnAlignMiddle', 'btnAlignBottom', 'btnAlignText', 'btnSameWidth',
            'btnSameHeight', 'btnEqualV', 'btnEqualH'];
        const drawings = new Map();
        for (const id of ICON_IDS) {
            const m = new RegExp(`<button id="${id}"[^>]*>(<svg[\\s\\S]*?</svg>)</button>`).exec(panel);
            t.ok(!!m, 'toolbar-icons', `${id} draws an inline SVG icon`);
            if (!m) continue;
            t.ok(/stroke="currentColor"/.test(m[1]), 'toolbar-icons', `${id} takes the button's colour`);
            t.ok(/fill="none"/.test(m[1]), 'toolbar-icons', `${id} is drawn as strokes (no filled shape needed)`);
            drawings.set(id, m[1]);
        }
        t.equal(drawings.size, 13, 'toolbar-icons', 'all 13 icon buttons were found');
        t.equal(new Set(drawings.values()).size, 13, 'toolbar-icons', 'every button has its own drawing');
        // No stray text glyph left in those buttons (that is what made them font-dependent).
        t.ok(/<button id="btnUndo"[^>]*><svg/.test(panel), 'toolbar-icons',
            'the button holds the icon and nothing else');
        t.ok(/<button id="btnRefresh"[^>]*>Refresh</.test(panel), 'toolbar-icons',
            'Refresh is text-only (its ⟳ glyph is gone as well)');
    }

    // ---------- 11) the wrap leaves no dangling separator (webview layout pass) ----------
    {
        const js = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'designer.js'), 'utf8');
        t.ok(/function layoutToolbar\(\)/.test(js), 'toolbar-wrap', 'the webview lays the toolbar out itself');
        t.ok(/querySelectorAll\('\.sep'\)/.test(js), 'toolbar-wrap', 'looking at every separator');
        t.ok(/\.offsetTop !== sep\.offsetTop/.test(js), 'toolbar-wrap',
            'and hides the ones without a neighbour on their own row');
        t.ok(/window\.addEventListener\('resize', \(\) => layoutToolbar\(\)\)/.test(js), 'toolbar-wrap',
            're-running on every resize');
        t.ok(/applyToolbarFolds\(\);\s*\/\/ apply that state/.test(js), 'toolbar-wrap',
            'and once at startup (that pass also hides dangling separators)');
        t.ok(/layoutToolbar\(\);\s*$/m.test(js), 'toolbar-wrap', 'the status line also re-runs it (it shares the last row)');
    }

    // ---------- 12) alternative fixes: "keep my manual edit" for EVERY finding ----------
    {
        const vb = (body) => `Imports Avalonia.Controls

Class TestForm
    Inherits Window

    Public Sub New()
        InitializeComponent()
    End Sub

${body}
End Class
`;
        // (a) a handler deleted by hand → the form can follow: unwire the event.
        const deleted = makeProject('TestForm.axaml.vb', vb(''));
        const insert = deleted.analysis().issues.find((i) => i.kind === 'insert-handler');
        t.ok(!!insert, 'alternatives', 'the missing handler is reported');
        const alts = (insert && insert.alternatives) || [];
        t.equal(alts.length, 2, 'alternatives', 'with two alternatives (follow the edit + leave it)');
        t.equal(alts[0].kind, 'unwrap-handler', 'alternatives', 'the first keeps the delete: unwire the form');
        t.equal(alts[0].label, 'Keep my delete — unwire it', 'alternatives', 'and says so on the button');
        t.ok(/Removes Click="Button1_Click" from Button1/.test(alts[0].detail), 'alternatives',
            'the tooltip names exactly what it removes');
        t.equal(alts[0].data.control, 'Button1', 'alternatives', 'carrying the control to unwire');
        t.equal(alts[0].data.event, 'Click', 'alternatives', 'the event');
        t.equal(alts[0].data.handler, 'Button1_Click', 'alternatives', 'and the handler it was wired to');
        t.equal(alts[1].kind, 'dismiss', 'alternatives', 'the second leaves the code alone entirely');
        t.equal(alts[1].label, 'Leave it — keep my code', 'alternatives', 'labelled for that');
        t.ok(!kinds(deleted.analysis()).includes('unwrap-handler'), 'alternatives',
            'the alternative is not reported as its own finding');

        // (b) a handler renamed by hand → unwire instead of re-pointing.
        const renamed = makeProject('TestForm.axaml.vb', vb(
            '    Private Sub Button1_Clicked(sender As Object, e As Avalonia.Interactivity.RoutedEventArgs)\n    End Sub'));
        const repoint = renamed.analysis().issues.find((i) => i.kind === 'repoint-handler');
        t.equal(repoint && repoint.alternatives[0].kind, 'unwrap-handler', 'alternatives',
            'the rename case also offers to unwire');
        t.equal(repoint && repoint.alternatives[0].label, 'Keep my rename — unwire it', 'alternatives',
            'labelled for a rename');

        // (c) a hand-edited signature → keep it and unwire, instead of rewriting the signature.
        const wrongSig = makeProject('TestForm.axaml.vb', vb(
            '    Private Sub Button1_Click(sender As Object, e As Avalonia.Controls.SelectionChangedEventArgs)\n    End Sub'));
        const sig = wrongSig.analysis().issues.find((i) => i.kind === 'fix-handler-signature');
        t.ok(!!sig, 'alternatives', 'the wrong signature is reported');
        t.equal(sig && sig.alternatives[0].kind, 'unwrap-handler', 'alternatives',
            'and can be answered by unwiring instead of rewriting my signature');
        t.equal(sig && sig.alternatives[0].label, 'Keep my signature — unwire it', 'alternatives', 'labelled for that');

        // (d) EVERY fixable finding offers "leave it", and none of them is offered twice.
        const source = `Imports Avalonia.Controls

Imports System.Data

Class TestForm
    Inherits Window
End Class
`;
        const many = makeProject('TestForm.axaml.vb', source);
        const fixable = many.analysis().issues.filter((i) => i.kind !== 'report-only');
        const missingDismiss = fixable.filter((i) => (i.alternatives ?? []).some((a) => a.kind === 'dismiss') === false);
        t.equal(fixable.length > 0, true, 'alternatives', 'the damaged fixture reports something fixable');
        t.equal(missingDismiss.length, 0, 'alternatives',
            'every fixable finding offers "Leave it — keep my code"', missingDismiss.map((i) => i.kind).join(', '));
        const twice = fixable.filter((i) => {
            const kindsOf = (i.alternatives ?? []).map((a) => a.kind);
            return new Set(kindsOf).size !== kindsOf.length;
        });
        t.equal(twice.length, 0, 'alternatives', 'and no alternative is duplicated', twice.map((i) => i.kind).join(', '));

        // (e) report-only findings change nothing, so they get no alternatives at all.
        const dupNames = `<Window ${NS} x:Class="Proj.TestForm" Width="800" Height="450">
  <Canvas Name="Body">
    <Button x:Name="Button1" Content="A"/>
    <Button x:Name="Button1" Content="B"/>
  </Canvas>
</Window>`;
        const dupes = makeProject('TestForm.axaml.vb', source, dupNames).analysis().issues
            .filter((i) => i.kind === 'report-only');
        t.ok(dupes.length > 0, 'alternatives', 'a duplicated control name is reported');
        t.equal(dupes.every((i) => (i.alternatives ?? []).length === 0), true, 'alternatives',
            'report-only findings carry no buttons (there is nothing to apply)');

        // (f) the dismissal key is stable: the same problem keeps its signature when lines shift,
        //     and two different handlers never share one.
        const sigA = issueSignature({ id: 'x', severity: 'error', kind: 'insert-handler', title: '', detail: '', member: 'Button1_Click', line: 5 });
        const sigB = issueSignature({ id: 'y', severity: 'error', kind: 'insert-handler', title: '', detail: '', member: 'Button1_Click', line: 99 });
        const sigC = issueSignature({ id: 'z', severity: 'error', kind: 'insert-handler', title: '', detail: '', member: 'Button2_Click', line: 5 });
        t.equal(sigA, sigB, 'alternatives', 'the same finding keeps its signature when its line moves');
        t.ok(sigA !== sigC, 'alternatives', 'a different handler gets a different signature');

        // (g) the panel wires both new fix kinds up.
        const panel = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'designerPanel.ts'), 'utf8');
        t.ok(/case 'unwrap-handler': \{/.test(panel), 'alternatives', 'the panel removes the event attribute');
        t.ok(/case 'dismiss': \{/.test(panel), 'alternatives', 'and remembers dismissals');
        t.ok(/private visibleIssues\(/.test(panel), 'alternatives',
            'dismissed findings are filtered out of every later check');
        t.ok(/msg\.alt/.test(panel) && /issueSignature/.test(panel), 'alternatives',
            'the fix request can pick an alternative and keys the dismissal on the original finding');
    }

    // ---------- 15) writes into the app's own folder ----------
    // A published app is installed into a folder only root may write (`/usr/lib/<pkg>` from the .deb,
    // "Program Files" from the MSI), so a write beside the executable works from the IDE and fails on
    // the user's machine — silently, because the application-menu launch has no console. Real case:
    // an installed app whose form constructor created its SQLite database next to the binary.
    {
        const head = `using Avalonia.Controls;
using System;
using System.IO;
namespace Proj;
public partial class TestForm : Window
{
    public TestForm()
    {
        InitializeComponent();
`;
        const tail = `    }

    private void Button1_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
    }
}
`;
        const found = (r) => r.issues.filter((i) => /own folder|next to the executable/.test(i.title));

        const single = found(makeProject('TestForm.axaml.cs',
            head + '        File.WriteAllText(Path.Combine(AppContext.BaseDirectory, "log.txt"), "started");\n' + tail
        ).analysis());
        t.equal(single.length, 1, 'app-folder', 'a write beside the executable is reported');
        t.equal(single[0].line, 10, 'app-folder', 'and points at the writing line');
        t.equal(single[0].severity, 'warning', 'app-folder', 'as a warning (the code still compiles)');
        t.equal(single[0].kind, 'report-only', 'app-folder', 'with no automatic fix');
        t.ok(/LocalApplicationData/.test(single[0].detail) && /usr\/lib/.test(single[0].detail), 'app-folder',
            'the detail says where the file should live instead');

        // Multi-line call: the statement is inspected, not just the line.
        const multiline = found(makeProject('TestForm.axaml.cs',
            head + '        File.WriteAllText(\n            Path.Combine(AppContext.BaseDirectory, "log.txt"),\n            "started");\n' + tail
        ).analysis());
        t.equal(multiline.length, 1, 'app-folder', 'a multi-line write is caught too');

        // Reads are fine: a packaged app can read its own folder.
        const reads = found(makeProject('TestForm.axaml.cs',
            head + '        var s = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "settings.json"));\n' + tail
        ).analysis());
        t.equal(reads.length, 0, 'app-folder', 'reading from the app folder is not reported');

        // One finding per line, however many writes share it.
        const sameLine = found(makeProject('TestForm.axaml.cs',
            head + '        File.WriteAllText(Path.Combine(AppContext.BaseDirectory, "a.txt"), "1"); File.Delete(Path.Combine(AppContext.BaseDirectory, "b.txt"));\n' + tail
        ).analysis());
        t.equal(sameLine.length, 1, 'app-folder', 'two writes on one line are one finding');

        // Creating the database beside the executable gets its own wording.
        const db = found(makeProject('TestForm.axaml.cs',
            head + '        using var con = new Microsoft.Data.Sqlite.SqliteConnection("Data Source=" + Path.Combine(AppContext.BaseDirectory, "x.db"));\n' + tail
        ).analysis());
        t.equal(db.length, 1, 'app-folder', 'creating a database beside the executable is reported');
        t.equal(db[0].title, 'Creates a database next to the executable', 'app-folder', 'with database wording');

        // VB spells the same thing with IO.* / no semicolons (statements end at the line).
        const vb = found(makeProject('TestForm.axaml.vb', `Imports Avalonia.Controls
Namespace Proj
    Public Class TestForm
        Inherits Window
        Public Sub New()
            InitializeComponent()
            IO.File.WriteAllText(IO.Path.Combine(AppContext.BaseDirectory, "log.txt"), "started")
        End Sub
        Private Sub Button1_Click(sender As Object, e As Avalonia.Interactivity.RoutedEventArgs)
        End Sub
    End Class
End Namespace
`).analysis());
        t.equal(vb.length, 1, 'app-folder', 'the VB form of the write is reported as well');
        t.equal(vb[0].line, 7, 'app-folder', 'pointing at the VB line');
    }

    // ---- a directory listing with no guard (2026-09-19) ----
    // From a runtime exception in the user's own app: DriveInfo.GetDrives() lists every mount on Linux,
    // /sys/fs/pstore is unreadable, and the unguarded GetDirectories threw as the window loaded. It compiles.
    {
        const found = (r) => r.issues.filter((i) => /may not be readable/.test(i.title));
        const cs = (body) => makeProject('TestForm.axaml.cs', `using Avalonia.Controls;
using System.IO;
using System.Linq;

namespace Proj
{
    public partial class TestForm : Window
    {
        public TestForm()
        {
            InitializeComponent();
${body}
        }

        private void Button1_Click(object sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
        }
    }
}
`).analysis();

        const plain = found(cs('            var drives = DriveInfo.GetDrives().Where(d => d.IsReady).ToList();\n            foreach (var d in drives) { var dirs = Directory.GetDirectories(d.RootDirectory.FullName); }'));
        t.equal(plain.length, 1, 'dir-list', 'an unguarded directory listing is reported');
        t.equal(plain[0].severity, 'warning', 'dir-list', 'as a warning — it compiles and throws later');
        t.equal(plain[0].kind, 'report-only', 'dir-list', 'with no automatic fix');
        t.equal(plain[0].line, 13, 'dir-list', 'pointing at the listing line');
        t.ok(plain[0].detail.includes('UnauthorizedAccessException'), 'dir-list',
            'the detail names the exception the user will see');

        const guarded = found(cs('            try { var dirs = Directory.GetDirectories("/sys/fs/pstore"); } catch { }'));
        t.equal(guarded.length, 0, 'dir-list', 'a listing inside try/catch is left alone');

        const after = found(cs('            try { var a = 1; } catch { }\n            var dirs = Directory.GetDirectories("/");'));
        t.equal(after.length, 1, 'dir-list', 'a listing after a CLOSED try block is reported again');

        const vb = found(makeProject('TestForm.axaml.vb', `Imports Avalonia.Controls
Namespace Proj
    Public Class TestForm
        Inherits Window
        Public Sub New()
            InitializeComponent()
            Dim dirs = IO.Directory.GetDirectories("/")
        End Sub
    End Class
End Namespace
`).analysis());
        t.equal(vb.length, 1, 'dir-list', 'the VB form of the listing is reported too');
        t.equal(vb[0].line, 7, 'dir-list', 'pointing at the VB line');

        const vbGuarded = found(makeProject('TestForm.axaml.vb', `Imports Avalonia.Controls
Namespace Proj
    Public Class TestForm
        Inherits Window
        Public Sub New()
            InitializeComponent()
            Try
                Dim dirs = IO.Directory.GetDirectories("/")
            Catch
            End Try
        End Sub
    End Class
End Namespace
`).analysis());
        t.equal(vbGuarded.length, 0, 'dir-list', 'and a VB Try block counts as guarded');
    }
};
