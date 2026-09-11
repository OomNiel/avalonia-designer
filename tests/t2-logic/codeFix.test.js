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
const { analyzeCodeBehind, applyLocalFix } = require('../../out/codeBehindCheck.js');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"';
const AXAML = `<Window ${NS} x:Class="Proj.TestForm" Width="800" Height="450">
  <Canvas Name="Body">
    <Button x:Name="Button1" Content="A" Click="Button1_Click"/>
    <ComboBox x:Name="ComboBox2"/>
  </Canvas>
</Window>`;

function makeProject(codeFile, code) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-codefix-'));
    const axamlPath = path.join(dir, 'TestForm.axaml');
    fs.writeFileSync(axamlPath, AXAML);
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
};
