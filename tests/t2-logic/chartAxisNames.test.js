/* T2 — the code check must not read a CHART MODEL object's `Name` as a CONTROL name.
 *
 * Red-first for a false ERROR seen in the Problems pane on 2026-09-21: the user's ChartTestCS form set
 * both axis titles with the Axis editor's Name row, which writes them the only way XAML can:
 *
 *     <charts:GrumpyXYPlot.XAxis>
 *       <charts:Axis AxisColor="#00ff11" Name="X Values"/>
 *     </charts:GrumpyXYPlot.XAxis>
 *
 * `axamlFacts` read an unprefixed `Name` exactly like `x:Name`, so those two AXIS TITLES became control
 * names — and since "X Values" and "Y-Values" are not identifiers, the checker published
 *
 *     "X Values" is not a valid identifier   (error)
 *     "Y-Values" is not a valid identifier   (error)
 *
 * on a form that compiles with 0 errors / 0 warnings. A bare `Name` is only a name-scope registration
 * on a Control (StyledElement); on the chart set's plain model classes (`Axis`, `LineSeries`,
 * `XYSeries`, `PieSlice`, `ChartCursor`) it is their own property. The bug is not cosmetic: two red
 * errors in PROBLEMS on a healthy form is exactly how a user learns to ignore the check.
 *
 * The tests therefore run BOTH directions: an axis title must NOT be reported, while a genuinely bad
 * control name still must be — plus `x:Name` (a real name anywhere) stays reported, so the fix cannot
 * be mistaken for "names are no longer checked".
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Uri } = require('vscode');
const { analyzeCodeBehind, axamlFacts } = require('../../out/codeBehindCheck.js');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" '
    + 'xmlns:charts="using:AvaloniaCharts"';

let seq = 0;
/** Writes a throwaway form + code-behind so `analyzeCodeBehind` has a real project to look at. */
function makeProject(body, codeFile = 'TestForm.axaml.cs', code = '') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `adb-axnames-${seq++}-`));
    const xaml = `<Window ${NS} x:Class="Proj.TestForm" Title="t">
  <Canvas Name="Holder">
${body}
  </Canvas>
</Window>
`;
    const axamlPath = path.join(dir, 'TestForm.axaml');
    fs.writeFileSync(axamlPath, xaml);
    fs.writeFileSync(path.join(dir, codeFile), code || `using Avalonia.Controls;
namespace Proj;
public partial class TestForm : Window
{
    public TestForm()
    {
        InitializeComponent();
    }
}
`);
    return { dir, uri: Uri.file(axamlPath) };
}

const titles = (r) => r.issues.map((i) => i.title);

module.exports = async (t) => {
    t.section('T2: chart axis names are not control names');

    // ---------- an AXIS TITLE is not a name (the reported bug) ----------
    const axisForm = makeProject(`      <charts:GrumpyXYPlot x:Name="GrumpyXYPlot1" Width="300" Height="200">
        <charts:GrumpyXYPlot.XAxis>
          <charts:Axis AxisColor="#00ff11" Name="X Values"/>
        </charts:GrumpyXYPlot.XAxis>
        <charts:GrumpyXYPlot.YAxis>
          <charts:Axis AxisColor="#04ff00" Name="Y-Values" TickLabelFontSize="14"/>
        </charts:GrumpyXYPlot.YAxis>
      </charts:GrumpyXYPlot>`);
    const facts = axamlFacts(axisForm.uri);
    t.equal(facts.invalidNames.join(','), '', 'axis-name',
        'an axis title with spaces is NOT reported as an invalid identifier',
        JSON.stringify(facts.invalidNames));
    t.equal(facts.names.map((n) => n.name).join(','), 'Holder,GrumpyXYPlot1', 'axis-name',
        'and the axis does not appear among the named controls',
        JSON.stringify(facts.names));
    const axisResult = analyzeCodeBehind(axisForm.uri, {});
    t.equal(axisResult.issues.length, 0, 'axis-name',
        'so the whole check is silent on a healthy chart form (this was 2 ERRORS)',
        titles(axisResult).join(' | '));

    // A single-quoted value goes through the fallback regex — same rule.
    const quoted = makeProject(`      <charts:GrumpyPiePlot x:Name="Pie1" Width="220" Height="220">
        <charts:GrumpyPiePlot.Slices>
          <charts:PieSlice Title="North" Visible="True"/>
        </charts:GrumpyPiePlot.Slices>
        <charts:GrumpyXYPlot.XAxis>
          <charts:Axis Name='Y-Values'/>
        </charts:GrumpyXYPlot.XAxis>
      </charts:GrumpyPiePlot>`);
    t.equal(axamlFacts(quoted.uri).invalidNames.join(','), '', 'axis-name',
        "a single-quoted axis Name='…' is treated the same way");

    // Every chart model class, so a future one cannot reintroduce it silently.
    for (const type of ['Axis', 'LineSeries', 'XYSeries', 'PieSlice', 'ChartCursor']) {
        const one = makeProject(`      <charts:${type} Name="Not An Identifier" Title="x"/>`);
        t.equal(axamlFacts(one.uri).invalidNames.join(','), '', 'axis-name',
            `<charts:${type} Name="…"> is its own property, not a control name`);
    }

    // ---------- …but a real control's name is still checked ----------
    const badControl = makeProject('      <Button Name="My Button" Content="Ok"/>');
    t.equal(axamlFacts(badControl.uri).invalidNames.join(','), 'My Button', 'control-name',
        'a bad CONTROL name is still reported (the fix must not blunt the check)');
    t.ok(titles(analyzeCodeBehind(badControl.uri, {})).some((s) => s.includes('My Button')),
        'control-name', 'and it still reaches PROBLEMS as an error');

    const goodControl = makeProject('      <Button Name="Ok1" Content="Ok"/>');
    t.equal(axamlFacts(goodControl.uri).names.map((n) => n.name).join(','), 'Holder,Ok1', 'control-name',
        'a good control name is still collected (accessor + handler names come from it)');

    // ---------- x:Name really does name an object, even here ----------
    const xn = makeProject('      <charts:Axis x:Name="X Values"/>');
    t.equal(axamlFacts(xn.uri).invalidNames.join(','), 'X Values', 'x:name',
        'x:Name is a name-scope directive on ANY type, so a bad one is still reported');

    // ---------- duplicates keep working ----------
    const dup = makeProject(`      <Button Name="Ok1" Content="a"/>
      <Button Name="Ok1" Content="b"/>`);
    t.equal(axamlFacts(dup.uri).duplicateNames.join(','), 'Ok1', 'duplicates',
        'a name used twice is still a duplicate');
};
