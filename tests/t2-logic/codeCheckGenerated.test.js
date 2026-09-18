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
*   6. the check runs the moment the model writes, in both diff modes;
*   7. a statement nothing terminated is reported and gets its `;` back — the `CS1002` half of "fix
*      syntax errors", which the brace rule cannot see because the braces still balance (2026-09-17:
*      the user removed a `;` in their own app and the checker called the file clean).
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

    // ---------- 7) a statement the answer never terminated (CS1002) ----------
    {
        const AXAML = `<Window ${NS} x:Class="Proj.TestForm" Width="800" Height="450">
  <Canvas Name="Body">
    <Button x:Name="Save" Content="Save"/>
  </Canvas>
</Window>`;
        // The shape the user hit in OptimisedCSTest: a handler that stops mid-statement. The braces
        // balance, so the build fails with CS1002 and the structure rule above stays silent.
        const p = makeProject('TestForm.axaml.cs', `using Avalonia.Controls;
namespace Proj;
public partial class TestForm : Window
{
    public TestForm()
    {
        InitializeComponent();
    }

    private void PushButton()
    {
        Save.Content = "pressed"
    }
}
`, AXAML);
        const r = p.analysis();
        const issue = find(r, 'insert-semicolon');
        t.ok(issue, 'semicolon', 'a statement nothing terminated is reported');
        t.equal(issue && issue.member, 'PushButton', 'semicolon', 'naming the method it sits in');
        t.equal(issue && String(issue.line), '12', 'semicolon', 'on the line the build stops at');
        t.ok(/no ";"/.test(issue.title), 'semicolon', 'with the missing token in the title');
        t.ok(/CS1002/.test(issue.detail), 'semicolon', 'and the error the user actually sees');
        t.ok(/Save\.Content = "pressed"/.test(issue.detail), 'semicolon', 'quoting the statement it found');
        t.equal(kinds(r).includes('repair-structure'), false, 'semicolon',
            'the braces do balance — which is why no other rule here can see it');

        const report = await applyLocalFix(p.uri, issue);
        t.ok(/Added the missing ";"/.test(report), 'semicolon-fix', 'Fix adds the terminator');
        t.ok(/Save\.Content = "pressed";/.test(p.read()), 'semicolon-fix', 'ending the statement that lacked it');
        t.equal(kinds(p.analysis()).length, 0, 'semicolon-fix', 'and nothing is left to report');
    }

    // ---------- 7b) where the `;` goes: in front of a trailing comment, after a string ----------
    {
        const AXAML = `<Window ${NS} x:Class="Proj.TestForm" Width="800" Height="450">
  <Canvas Name="Body"/>
</Window>`;
        const commented = makeProject('TestForm.axaml.cs', `using Avalonia.Controls;
namespace Proj;
public partial class TestForm : Window
{
    public TestForm()
    {
        InitializeComponent();
    }

    private void Load()
    {
        var url = "http://example.test/a"
        Save.Content = "loaded" // statusclock:Save: 17 September 2026|System time
    }
}
`, AXAML);
        // Only the LAST statement of a body is provable without a compiler (see 7c), and that is the one a
        // truncated answer stops on — so the line reported is the commented one, not the one above it.
        const issue = find(commented.analysis(), 'insert-semicolon');
        t.equal(issue && String(issue.line), '13', 'semicolon-comment', 'the unterminated last statement is reported');
        t.ok(/Save\.Content = "loaded"/.test(issue.detail), 'semicolon-comment',
            'quoted with its string intact — the scan blanks literals, so the text is taken from the file');
        await applyLocalFix(commented.uri, issue);
        const fixed = commented.read();
        t.ok(/Save\.Content = "loaded"; \/\/ statusclock:Save:/.test(fixed), 'semicolon-comment',
            'the `;` goes in front of the trailing comment, which still reads as a comment');
        t.equal((fixed.match(/; \/\/ statusclock/g) || []).length, 1, 'semicolon-comment',
            'and only that line is touched');
    }

    // ---------- 7b2) the `;` the compiler placed INSIDE a one-line block (2026-09-18) ----------
    {
        const AXAML = `<Window ${NS} x:Class="Proj.TestForm" Width="800" Height="450">
  <Canvas Name="Body"/>
</Window>`;
        // The user's own file, in the shape that beat the rule: a one-line `try { … }`, so the statement that
        // lost its `;` shares its line with the `}` that closes the block. Every line-end test refuses such a
        // line (`/[;{}]$/`) — including the blank line and the two comments above it — so the log showed four
        // refusals and the model was asked for a fix the rules could already write.
        const p = makeProject('TestForm.axaml.cs', `using Avalonia.Controls;
namespace Proj;
public partial class TestForm : Window
{
    public TestForm()
    {
        InitializeComponent();
    }

    private void DataImage_Image1_Show()
    {
        // EXIF-aware load (bundled ExifImageLoader.cs)

        try { Image1.Source = ExifImageLoader.LoadImageOriented(row.Image) }
        catch
        { /* blank */ }
    }
}
`, AXAML);
        const lines = p.read().split('\n');
        const at = lines.findIndex((l) => /try \{ Image1/.test(l));
        const blankAt = lines.findIndex((l, i) => i < at && l.trim() === '');
        const commentAt = lines.findIndex((l, i) => i < at && /^\s*\/\//.test(l));
        const line = lines[at];
        // `CS1002: ; expected` is reported at the position the parser expected the terminator — right after
        // `row.Image)`, 1-based, the way MSBuild prints it (`file.cs(56,79): error CS1002`).
        const column = line.indexOf(') }') + 2;
        const report = await applyLocalFix(p.uri, {
            id: 'build:CS1002:1:1',
            severity: 'error',
            kind: 'insert-semicolon',
            member: 'CS1002',
            line: at + 1,
            title: 'CS1002: ; expected',
            detail: '',
            data: { line: String(at + 1), method: 'CS1002', column: String(column) }
        });
        t.ok(/Added the missing ";"/.test(report), 'semicolon-column', 'a `;` at the compiler\'s own position is a fix');
        t.ok(/LoadImageOriented\(row\.Image\); \}/.test(p.read()), 'semicolon-column',
            'it lands in front of the `}` that closes the block, not at the end of the line');
        t.equal(p.read().split('\n')[at], line.replace(') }', '); }'), 'semicolon-column',
            'and only that one character is added to that one line');

        // The same call on a line with nothing to terminate says which kind of nothing it is — the old message
        // claimed "already ends with a ;" about blank lines and comments too, which is how four refusals in a
        // row read as "that statement is fine" (2026-09-18).
        const blank = await applyLocalFix(p.uri, {
            id: 'x', severity: 'error', kind: 'insert-semicolon', member: 'CS1002',
            line: blankAt + 1, title: 't', detail: '', data: { line: String(blankAt + 1) }
        });
        t.ok(blankAt > 0 && /is blank/.test(blank), 'semicolon-column', 'a blank line is reported as blank');
        const comment = await applyLocalFix(p.uri, {
            id: 'y', severity: 'error', kind: 'insert-semicolon', member: 'CS1002',
            line: commentAt + 1, title: 't', detail: '', data: { line: String(commentAt + 1) }
        });
        t.ok(commentAt > 0 && /is a comment/.test(comment), 'semicolon-column', 'and a comment line as a comment');
    }

    // ---------- 7c) a `//` inside a string literal is not a comment ----------
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

    private void Load()
    {
        var url = "http://example.test/a"
    }
}
`, AXAML);
        const issue = find(p.analysis(), 'insert-semicolon');
        t.ok(issue, 'semicolon-string', 'a statement that stops after a URL is reported');
        t.ok(/http:\/\/example\.test\/a/.test(issue.detail), 'semicolon-string',
            'with the whole statement quoted: the `//` in the string is not a comment starting mid-line');
        await applyLocalFix(p.uri, issue);
        t.ok(/var url = "http:\/\/example\.test\/a";/.test(p.read()), 'semicolon-string',
            'and the `;` lands after the string, not inside it');
        t.equal(kinds(p.analysis()).length, 0, 'semicolon-string', 'leaving nothing to report');
    }

    // ---------- 7d) shapes that must stay quiet, and the limit of the rule ----------
    {
        const AXAML = `<Window ${NS} x:Class="Proj.TestForm" Width="800" Height="450">
  <Canvas Name="Body"/>
</Window>`;
        // A body that ends with a block, one the generator left as a comment only, and one whose last
        // statement is terminated: none of these is a missing `;` (a nested block needs no terminator).
        const quiet = makeProject('TestForm.axaml.cs', `using Avalonia.Controls;
namespace Proj;
public partial class TestForm : Window
{
    public TestForm()
    {
        InitializeComponent();
    }

    private void PushButton()
    {
        // TODO: Handle PushButton
    }

    private void Toggle()
    {
        if (Save.IsVisible)
        {
            Save.IsVisible = false;
        }
        else
        {
            Save.IsVisible = true;
        }
    }

    private void Run()
    {
        Save.IsVisible = true;
    }
}
`, AXAML);
        t.equal(kinds(quiet.analysis()).includes('insert-semicolon'), false, 'semicolon-quiet',
            'a comment-only body, a body ending in a block and a terminated statement are all clean');

        // The limit of a rule that is not a compiler: only the last statement of a body is provable, because
        // a `;` dropped mid-body cannot be told from a continuation line without parsing C#. That one is the
        // build's job, and the check says so rather than guessing.
        const midBody = makeProject('TestForm.axaml.cs', `using Avalonia.Controls;
namespace Proj;
public partial class TestForm : Window
{
    public TestForm()
    {
        InitializeComponent();
    }

    private void Run()
    {
        var url = "http://example.test/a"
        Save.Content = "done";
    }
}
`, AXAML);
        t.equal(kinds(midBody.analysis()).includes('insert-semicolon'), false, 'semicolon-midbody',
            'a `;` dropped mid-body is left to the build, not guessed at');

        // VB has no `;`: the same shape is the line ending a statement, so the rule must not exist there.
        const vb = makeProject('TestForm.axaml.vb', `Imports Avalonia.Controls
Public Class TestForm
    Inherits Window

    Public Sub New()
        InitializeComponent()
    End Sub

    Private Sub PushButton()
        Save.Content = "pressed"
    End Sub
End Class
`, AXAML);
        t.equal(kinds(vb.analysis()).includes('insert-semicolon'), false, 'semicolon-vb',
            'VB statements end at the line, so nothing is reported for the same shape');
    }
};
