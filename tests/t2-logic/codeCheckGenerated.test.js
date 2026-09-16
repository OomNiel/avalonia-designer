/* T2 — the code check looking at *generated* code (asked 2026-09-16).
 *
 * The AI writes into a code-behind now, and the designer's checker had rules for the XAML side of the
 * contract but none for the mistakes a generative model actually makes. The user asked for the reverse
 * directions and for structural repair: *"Can it be extended to cover this as well as handler functions?"*
 * … *"Fix everything within reason, report the rest. It must also fix syntax errors, like missing braces."*
 *
 * What is proven here, with real files in a temporary project:
 *   1. a handler nothing calls is reported, and Fix wires it (the reverse of the existing `insert-handler`);
 *   2. a name that is not a control of the form is reported **only** when a control starts with it — the
 *      `Status` / `StatusDate1` slip — so `Console.WriteLine` cannot produce noise;
 *   3. a second member with the same name is reported as CS0111 and Fix removes it (VB had a rule, C# did not);
 *   4. a class inside a class — the verbatim `CS1513` damage from the user's app — is reported and the wrapper
 *      is stripped, keeping the member;
 *   5. braces the answer never closed are reported and closed at the end of the file;
 *   6. the check runs the moment the model writes, in both diff modes.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Uri } = require('vscode');
const { analyzeCodeBehind, applyLocalFix } = require('../../out/codeBehindCheck.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"';

function makeProject(codeFile, code, axaml) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-gencheck-'));
    const axamlPath = path.join(dir, 'TestForm.axaml');
    fs.writeFileSync(axamlPath, axaml);
    const codePath = path.join(dir, codeFile);
    fs.writeFileSync(codePath, code);
    const uri = Uri.file(axamlPath);
    return {
        dir,
        uri,
        analysis: () => analyzeCodeBehind(uri, { axamlText: fs.readFileSync(axamlPath, 'utf8') }),
        read: () => fs.readFileSync(codePath, 'utf8'),
        readAxaml: () => fs.readFileSync(axamlPath, 'utf8')
    };
}

const kinds = (r) => r.issues.map((i) => i.kind);
const find = (r, kind) => r.issues.find((i) => i.kind === kind);

module.exports = async (t) => {
    t.section('the code check sees generated code');

    // ---------- 1) a handler nothing calls ----------
    {
        const AXAML = `<Window ${NS} x:Class="Proj.TestForm" Width="800" Height="450">
  <Canvas Name="Body">
    <Button x:Name="Save" Content="Save"/>
  </Canvas>
</Window>`;
        const p = makeProject('TestForm.axaml.cs', `using Avalonia.Controls;
namespace Proj;
public partial class TestForm : Window
{
    public TestForm()
    {
        InitializeComponent();
    }

    private void Save_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        Save.Content = "saved";
    }
}
`, AXAML);
        const r = p.analysis();
        const issue = find(r, 'wire-unwired-handler');
        t.ok(issue, 'unwired', 'a handler the form never asks for is reported');
        t.equal(issue && issue.member, 'Save_Click', 'unwired', 'naming the method');
        t.equal(issue && issue.data.control, 'Save', 'unwired', 'and the control whose event it looks like');
        t.ok(/not wired to anything/.test(issue.title), 'unwired', 'with a plain sentence, not a rule number');
        t.ok(/Click="Save_Click"/.test(issue.detail), 'unwired', 'and the detail says exactly what the fix writes');

        const report = await applyLocalFix(p.uri, issue);
        t.ok(/Wired Click="Save_Click" onto Save/.test(report), 'unwired-fix', 'Fix wires the event');
        t.ok(/<Button x:Name="Save" Click="Save_Click" Content="Save"\/>/.test(p.readAxaml()), 'unwired-fix',
            'and the attribute lands in the form, leaving the rest of the tag alone');
        t.equal(kinds(p.analysis()).includes('wire-unwired-handler'), false, 'unwired-fix',
            're-running the check is clean — the fix really resolved it');

        // A wired handler must not be reported: this is the fixture the rest of the suite uses.
        const wired = makeProject('TestForm.axaml.cs', `using Avalonia.Controls;
namespace Proj;
public partial class TestForm : Window
{
    public TestForm()
    {
        InitializeComponent();
    }

    private void Save_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
    }
}
`, AXAML.replace('Content="Save"/>', 'Content="Save" Click="Save_Click"/>'));
        t.equal(kinds(wired.analysis()).includes('wire-unwired-handler'), false, 'wired',
            'a handler the form does wire is left alone');

        // A plain helper is not a handler at all.
        const helper = makeProject('TestForm.axaml.cs', `using Avalonia.Controls;
namespace Proj;
public partial class TestForm : Window
{
    public TestForm()
    {
        InitializeComponent();
    }

    private static void SortArray(int[] values)
    {
        System.Array.Sort(values);
    }
}
`, AXAML);
        t.equal(kinds(helper.analysis()).includes('wire-unwired-handler'), false, 'helper',
            'a function that is not named like a handler is never reported as unwired');
    }

    // ---------- 2) a name that is not a control of this form ----------
    {
        const AXAML = `<Window ${NS} x:Class="Proj.TestForm" Width="800" Height="450">
  <Canvas Name="Body">
    <TextBlock x:Name="StatusDate1" Text="x"/>
  </Canvas>
</Window>`;
        const code = (bodyLine) => `using Avalonia.Controls;
namespace Proj;
public partial class TestForm : Window
{
    public TestForm()
    {
        InitializeComponent();
    }

    private void Refresh()
    {
${bodyLine}
    }
}
`;
        const typo = makeProject('TestForm.axaml.cs', code('        Status.Text = "x";'), AXAML).analysis();
        const issue = find(typo, 'report-only');
        t.ok(issue, 'near-name', 'a name the form does not have is reported when a control starts with it');
        t.ok(/did you mean "StatusDate1"/.test(issue.title), 'near-name', 'naming the control it probably meant');
        t.equal(issue.severity, 'warning', 'near-name', 'as a warning — the candidate is a guess, not a verdict');
        t.equal(issue.kind, 'report-only', 'near-name', 'and it never rewrites the code on its own');

        // The noise guard: a framework name with no candidate control must stay silent.
        const bcl = makeProject('TestForm.axaml.cs', code('        Console.WriteLine("hi");'), AXAML).analysis();
        t.equal(find(bcl, 'report-only'), undefined, 'near-name-silent',
            'a name with no control starting like it (Console, Math, a local) is not reported');
        t.equal(bcl.issues.length, 0, 'near-name-silent', 'so a healthy file still reports nothing at all');
    }

    // ---------- 3) two members with the same name (CS0111) ----------
    {
        const AXAML = `<Window ${NS} x:Class="Proj.TestForm" Width="800" Height="450">
  <Canvas Name="Body"/>
</Window>`;
        const p = makeProject('TestForm.axaml.cs', `using Avalonia.Controls;
namespace Proj;
public partial class TestForm : Window
{
    public TestForm()
    {
        InitializeComponent();
    }

    private static void SortArray(int[] values)
    {
        System.Array.Sort(values);
    }

    private static void SortArray(int[] values)
    {
        System.Array.Sort(values, (a, b) => a.CompareTo(b));
    }
}
`, AXAML);
        const issue = find(p.analysis(), 'remove-duplicate-method');
        t.ok(issue, 'dup', 'a second member with the same name is reported (VB had this rule, C# did not)');
        t.equal(issue.severity, 'error', 'dup', 'as an error — the build stops with CS0111');
        t.equal(issue.data.occurrence, '2', 'dup', 'pointing at the second copy, not the first');
        t.ok(/CS0111/.test(issue.detail), 'dup', 'and the detail names the compiler error to expect');

        const report = await applyLocalFix(p.uri, issue);
        t.ok(/Removed the duplicate/.test(report), 'dup-fix', 'Fix removes it');
        t.equal(p.read().split('private static void SortArray').length - 1, 1, 'dup-fix',
            'leaving exactly one declaration behind');
    }

    // ---------- 4) a class inside a class (the verbatim CS1513 damage) ----------
    {
        const AXAML = `<Window ${NS} x:Class="Proj.TestForm" Width="800" Height="450">
  <Canvas Name="Body"/>
</Window>`;
        const p = makeProject('TestForm.axaml.cs', `using Avalonia.Controls;
namespace Proj;
public partial class TestForm : Window
{
    public TestForm()
    {
        InitializeComponent();
    }

    namespace Proj
    {
        public partial class TestForm : Window
        {
            private static void SortStringArray(string[] array)
            {
                if (array == null)
                    throw new System.ArgumentNullException(nameof(array));

                System.Array.Sort(array);
            }
        }
    }

}
`, AXAML);
        const r = p.analysis();
        const issue = find(r, 'repair-structure');
        t.ok(issue, 'nested', 'a second class declaration inside the form is reported');
        t.ok(/declared inside TestForm/.test(issue.title), 'nested', 'saying which class is inside which');
        t.ok(/CS1513/.test(issue.detail), 'nested', 'and naming the error the user actually saw');

        const report = await applyLocalFix(p.uri, issue);
        t.ok(/Removed the namespace the answer was wrapped in/.test(report), 'nested-fix',
            'Fix unwraps the namespace the answer was pasted with — the repair their file needed');
        const fixed = p.read();
        t.ok(/private static void SortStringArray/.test(fixed), 'nested-fix', 'keeping the member');
        t.equal(fixed.split('namespace Proj').length - 1, 1, 'nested-fix',
            'with the file-scoped namespace at the top and no second one');
        t.equal(fixed.split('class TestForm').length - 1, 1, 'nested-fix', 'and one class declaration');
        t.equal(kinds(p.analysis()).length, 0, 'nested-fix',
            'after the fix the report is empty: the member is there and the structure is sound');
    }

    // ---------- 5) braces the answer never closed ----------
    {
        const AXAML = `<Window ${NS} x:Class="Proj.TestForm" Width="800" Height="450">
  <Canvas Name="Body"/>
</Window>`;
        const p = makeProject('TestForm.axaml.cs', `using Avalonia.Controls;
namespace Proj;
public partial class TestForm : Window
{
    public TestForm()
    {
        InitializeComponent();
    }

    private static void SortArray(int[] values)
    {
        System.Array.Sort(values);
`, AXAML);
        const issue = find(p.analysis(), 'repair-structure');
        t.ok(issue, 'braces', 'braces that do not balance are reported');
        t.ok(/closing brace/.test(issue.title), 'braces', 'saying how many are missing');
        t.equal(issue.data.braces, '2', 'braces', 'both the method and the class are left open (2 braces)');

        const report = await applyLocalFix(p.uri, issue);
        t.ok(/Added 2 closing braces/.test(report), 'braces-fix', 'Fix closes them');
        t.equal((p.read().match(/^\}/gm) || []).length, 2, 'braces-fix',
            'at the end of the file, at column zero, where the missing text was');
        t.equal(kinds(p.analysis()).includes('repair-structure'), false, 'braces-fix', 'and the file balances');
    }

    // ---------- 6) the check runs when the model writes ----------
    {
        const ui = read('src/assistantUi.ts');
        t.equal((ui.match(/await checkGeneratedCode\(document\);/g) || []).length, 2, 'wiring',
            'both write paths check what the model produced — diff mode and direct write');
        t.ok(/const result = analyzeCodeBehind\(form\.uri, \{\}\);/.test(ui), 'wiring',
            'through the designer\'s own checker, not a private copy of the rules');
        t.ok(/publishIssues\(form\.uri, result, result\.issues\)/.test(ui), 'wiring',
            'and the findings go where the user already looks for them: the PROBLEMS pane');
        t.ok(/async function checkGeneratedCode[\s\S]{0,2600}?Code check after the model's change errored/.test(ui),
            'wiring', 'a check that throws is logged, never allowed to make a good write look failed');
    }
};
