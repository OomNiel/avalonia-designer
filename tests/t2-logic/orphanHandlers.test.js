/* T2 — orphaned-handler cleanup after a control is deleted.
 *
 * The suspected defect did NOT reproduce. A static reading suggested that the declaration regex being
 * non-global (`'i'`, no `'g'`) meant only the first handler of a deleted control was ever removed —
 * but each removal shortens the text, so the next `exec()` from index 0 finds the NEXT handler and the
 * scan does walk them all. The tests below pin that behaviour in both languages (two handlers per
 * control) so the real behaviour is documented rather than assumed.
 *
 * What the tests DID find is a narrower, genuine bug (fixed in refactor Phase 1): the loop broke out of
 * the scan as soon as a candidate was KEPT. Because the regex is not global, `exec()` returned the same
 * match again, `seen.has(handler)` was already true, and the loop broke — so a handler still referenced
 * by a remaining control hid every orphan handler declared after it. The fix collects all `<name>_*`
 * candidates first and only then removes the unreferenced ones.
 *
 * Covered: both languages, the `referenced` guard, and the "unrelated control" / "nothing to do" cases.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Uri } = require('vscode');
const { removeOrphanedHandlersForControls } = require('../../out/codeBehind.js');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"';
const AXAML = `<Window ${NS} x:Class="Proj.TestForm" Width="800" Height="450">
  <Canvas Name="Body"/>
</Window>`;

let seq = 0;
function makeProject(codeFile, code) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `adb-orphan-${seq++}-`));
    const axamlPath = path.join(dir, 'TestForm.axaml');
    fs.writeFileSync(axamlPath, AXAML);
    const codePath = path.join(dir, codeFile);
    fs.writeFileSync(codePath, code);
    return { uri: Uri.file(axamlPath), codePath, read: () => fs.readFileSync(codePath, 'utf8') };
}

const CS = `using Avalonia.Controls;
namespace Proj;
public partial class TestForm : Window
{
    public TestForm()
    {
        InitializeComponent();
    }

    private void Button1_Click(object sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
    }

    private void Button1_Loaded(object sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
    }

    private void Button2_Click(object sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
    }
}
`;

const VB = `Imports Avalonia.Controls
Partial Public Class TestForm
    Inherits Window

    Public Sub New()
        InitializeComponent()
    End Sub

    Private Sub Button1_Click(sender As Object, e As RoutedEventArgs)
    End Sub

    Private Sub Button1_Loaded(sender As Object, e As RoutedEventArgs)
    End Sub

    Private Sub Button2_Click(sender As Object, e As RoutedEventArgs)
    End Sub
End Class
`;

const has = (text, needle) => text.includes(needle);

module.exports = async (t) => {
    t.section('T2: orphaned handler cleanup');

    // ---------- C#: BOTH handlers of the deleted control go ----------
    {
        const p = makeProject('TestForm.axaml.cs', CS);
        await removeOrphanedHandlersForControls(p.uri, ['Button1'], new Set());
        const after = p.read();
        t.ok(!has(after, 'Button1_Click'), 'cs', 'the Click handler of the deleted control is removed');
        t.ok(!has(after, 'Button1_Loaded'), 'cs', 'AND its Loaded handler (the second one) is removed');
        t.ok(has(after, 'Button2_Click'), 'cs', 'a different control\'s handler is left alone');
        t.ok(has(after, 'InitializeComponent'), 'cs', 'the constructor is untouched');
    }

    // ---------- VB: same, through the vbMatchingEnd / End Sub path ----------
    {
        const p = makeProject('TestForm.axaml.vb', VB);
        await removeOrphanedHandlersForControls(p.uri, ['Button1'], new Set());
        const after = p.read();
        t.ok(!has(after, 'Button1_Click'), 'vb', 'the Click handler of the deleted control is removed');
        t.ok(!has(after, 'Button1_Loaded'), 'vb', 'AND its Loaded handler (the second one) is removed');
        t.ok(has(after, 'Button2_Click'), 'vb', 'a different control\'s handler is left alone');
        t.equal((after.match(/End Sub/g) || []).length, 2, 'vb',
            'no stray End Sub is left behind (ctor + Button2 only)');
    }

    // ---------- a handler still referenced by another control must survive ----------
    {
        const p = makeProject('TestForm.axaml.cs', CS);
        await removeOrphanedHandlersForControls(p.uri, ['Button1'], new Set(['Button1_Click']));
        const after = p.read();
        t.ok(has(after, 'Button1_Click'), 'referenced', 'a handler still wired elsewhere is kept');
        t.ok(!has(after, 'Button1_Loaded'), 'referenced', 'while the unreferenced one is still removed');
    }

    // ---------- nothing to do ----------
    {
        const p = makeProject('TestForm.axaml.cs', CS);
        await removeOrphanedHandlersForControls(p.uri, [], new Set());
        t.equal(p.read(), CS, 'noop', 'an empty name list leaves the file byte-identical');
    }
};
