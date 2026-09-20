/* T2 — bundledComponents: detecting OLD copies of the extension's own bundled ChromeWindow /
 * AnchorHelper boilerplate inside a generated project (so the designer can refresh them before the
 * XAML no longer compiles — e.g. TitleBarHeight — or stale runtime behaviour keeps docked children
 * "tracked"). */
'use strict';
const fs = require('fs');
const path = require('path');
const { isStaleBundledCopy, bundledComponentSpecs } = require('../../out/bundledComponents.js');

module.exports = async (t) => {
    t.section('bundledComponents');

    // --- ChromeWindow.vb (old vs current) ---
    const oldVbChrome = `' ChromeWindow.vb — Reusable frameless Avalonia window with a built-in
' custom titlebar ... min/max/close ...
Class ChromeWindow
    Inherits Window
    Private Const TitleBarHeight As Double = 44
End Class`;
    const curVbChrome = `' ChromeWindow.vb — Reusable frameless Avalonia window with a built-in
Public Shared ReadOnly TitleBarHeightProperty As StyledProperty(Of Double) =
    AvaloniaProperty.Register(Of ChromeWindow, Double)(NameOf(TitleBarHeight), 44.0)
Public Shared ReadOnly TitleBarBackgroundProperty As StyledProperty(Of IBrush) =
    AvaloniaProperty.Register(Of ChromeWindow, IBrush)(NameOf(TitleBarBackground), Brushes.White)
Public Property TitleBarHeight As Double
    Get
        Return GetValue(TitleBarHeightProperty)
    End Get
    Set(value As Double)
        SetValue(TitleBarHeightProperty, value)
    End Set
End Property`;
    t.equal(isStaleBundledCopy(oldVbChrome, true, 'ChromeWindow'), true, 'detect', 'old bundled ChromeWindow.vb is stale');
    t.equal(isStaleBundledCopy(curVbChrome, true, 'ChromeWindow'), false, 'detect', 'current ChromeWindow.vb is current');

    // --- ChromeWindow.cs ---
    const oldCsChrome = `// ChromeWindow.cs — Reusable frameless Avalonia window with a built-in
public class ChromeWindow : Window { private const double TitleBarHeight = 44; }`;
    const curCsChrome = `// ChromeWindow.cs — Reusable frameless Avalonia window with a built-in
public static readonly StyledProperty<double> TitleBarHeightProperty =
    AvaloniaProperty.Register<ChromeWindow, double>(nameof(TitleBarHeight), 44.0);
public static readonly StyledProperty<IBrush> TitleBarBackgroundProperty =
    AvaloniaProperty.Register<ChromeWindow, IBrush>(nameof(TitleBarBackground), Brushes.White);`;
    t.equal(isStaleBundledCopy(oldCsChrome, false, 'ChromeWindow'), true, 'detect', 'old bundled ChromeWindow.cs is stale');
    t.equal(isStaleBundledCopy(curCsChrome, false, 'ChromeWindow'), false, 'detect', 'current ChromeWindow.cs is current');

    // --- AnchorHelper.vb (old Canvas-only vs current with DockPanel edge-dock) ---
    const oldVbAnchor = `' WinForms-style anchoring for controls placed on a free-placement Canvas.
Class AnchorTracker
    Private _parent As Canvas
End Class`;
    const curVbAnchor = `' WinForms-style anchoring for controls placed on a free-placement Canvas.
Class AnchorTracker
    Private Shared Function AnchorDockEdge(anchor As String) As Dock
        Return Dock.Left
    End Function
End Class`;
    t.equal(isStaleBundledCopy(oldVbAnchor, true, 'AnchorHelper'), true, 'detect', 'old bundled AnchorHelper.vb is stale');
    t.equal(isStaleBundledCopy(curVbAnchor, true, 'AnchorHelper'), false, 'detect', 'current AnchorHelper.vb is current');

    // --- AnchorHelper.cs ---
    const oldCsAnchor = `// WinForms-style anchoring for controls placed on a free-placement Canvas.
private Canvas? _parent;`;
    const curCsAnchor = `// WinForms-style anchoring for controls placed on a free-placement Canvas.
private static Dock AnchorDockEdge(string anchor) { return Dock.Left; }`;
    t.equal(isStaleBundledCopy(oldCsAnchor, false, 'AnchorHelper'), true, 'detect', 'old bundled AnchorHelper.cs is stale');
    t.equal(isStaleBundledCopy(curCsAnchor, false, 'AnchorHelper'), false, 'detect', 'current AnchorHelper.cs is current');

    // --- PathPicker.vb / .cs (the file/folder selector) ---
    // beta.6 added the left-edge file/folder icon (+ the ShowIcon switch). Older copies are a bare
    // path row, so a File Selector and a Folder Selector look identical on the form.
    const oldVbPicker = `' PathPicker.vb — BUNDLED RESOURCE (the C# twin is resources/PathPicker.cs). Copied into every
' generated project, next to GrumpyPanel.vb / ExifImageLoader.vb.
Namespace Global.AvaloniaChrome
    Public Class PathPicker
        Inherits UserControl
        Public Shared ReadOnly PathTypeProperty As StyledProperty(Of PathPickerKind) = Nothing
    End Class
End Namespace`;
    const curVbPicker = `' PathPicker.vb — BUNDLED RESOURCE (the C# twin is resources/PathPicker.cs). Copied into every
' generated project, next to GrumpyPanel.vb / ExifImageLoader.vb.
Namespace Global.AvaloniaChrome
    Public Class PathPicker
        Inherits UserControl
        Public Shared ReadOnly ShowIconProperty As StyledProperty(Of Boolean) = Nothing
        Private ReadOnly _icon As New Avalonia.Controls.Shapes.Path()
    End Class
End Namespace`;
    t.equal(isStaleBundledCopy(oldVbPicker, true, 'PathPicker'), true, 'detect', 'old bundled PathPicker.vb is stale (no icon)');
    t.equal(isStaleBundledCopy(curVbPicker, true, 'PathPicker'), false, 'detect', 'current PathPicker.vb is current');
    const oldCsPicker = `// PathPicker.cs — BUNDLED RESOURCE (the VB twin is resources/PathPicker.vb).
public class PathPicker : UserControl { public string? SelectedPath { get; set; } }`;
    const curCsPicker = `// PathPicker.cs — BUNDLED RESOURCE (the VB twin is resources/PathPicker.vb).
public class PathPicker : UserControl { public bool ShowIcon { get; set; } }`;
    t.equal(isStaleBundledCopy(oldCsPicker, false, 'PathPicker'), true, 'detect', 'old bundled PathPicker.cs is stale (no ShowIcon)');
    t.equal(isStaleBundledCopy(curCsPicker, false, 'PathPicker'), false, 'detect', 'current PathPicker.cs is current');
    t.equal(isStaleBundledCopy(`${oldVbPicker}\n' customised by hand — do not touch`, true, 'PathPicker'), true,
        'detect', 'a stale picker with extra hand-edits still refreshes (the header is the bundled one)');

    // --- GrumpyCharts.vb / .cs (the chart set) ---
    // 2026-09-20: the charts gained SERIES and AXIS objects. A project created before that keeps its
    // old chart file, and saving a form with two series into it does not compile:
    //   "AVLN2000: Unable to resolve type XYSeries from namespace using:AvaloniaCharts" (ChartTestCS).
    // The marker must therefore be one of the NEW types — the old `PlotBackOpacityProperty` exists in
    // every copy ever shipped, so it detected nothing and the project was left broken.
    const chartSpec = bundledComponentSpecs(false).find((s) => s.kind === 'GrumpyCharts');
    t.equal(chartSpec.marker, 'XYSeries', 'spec',
        'the GrumpyCharts marker is a type the pre-series copy cannot have');
    const oldCsCharts = `// GrumpyCharts.cs — BUNDLED RESOURCE (the VB twin is resources/GrumpyCharts.vb).
public sealed class ChartSeries { public double[] Xs = Array.Empty<double>(); }
public abstract class ChartBase : Control { public string? SourceFile { get; set; } }`;
    const curCsCharts = `// GrumpyCharts.cs — BUNDLED RESOURCE (the VB twin is resources/GrumpyCharts.vb).
public class LineSeries : ChartSeries { }
public class XYSeries : ChartSeries { public Axis? XAxis { get; set; } }
public sealed class Axis { public AxisPosition Position { get; set; } }`;
    t.equal(isStaleBundledCopy(oldCsCharts, false, 'GrumpyCharts'), true, 'detect',
        'a chart file from before the series classes is stale (this broke ChartTestCS)');
    t.equal(isStaleBundledCopy(curCsCharts, false, 'GrumpyCharts'), false, 'detect',
        'the current chart file is current');
    t.equal(isStaleBundledCopy(`${oldCsCharts}\n// hand-tweaked below`, false, 'GrumpyCharts'), true, 'detect',
        'an old chart file with extra edits still refreshes (the bundled header is intact)');
    const oldVbCharts = `' GrumpyCharts.vb — BUNDLED RESOURCE (the C# twin is resources/GrumpyCharts.cs).
Public NotInheritable Class ChartSeries
End Class`;
    const curVbCharts = `' GrumpyCharts.vb — BUNDLED RESOURCE (the C# twin is resources/GrumpyCharts.cs).
Public Class XYSeries
    Inherits ChartSeries
End Class`;
    t.equal(isStaleBundledCopy(oldVbCharts, true, 'GrumpyCharts'), true, 'detect',
        'a VB chart file from before the series classes is stale');
    t.equal(isStaleBundledCopy(curVbCharts, true, 'GrumpyCharts'), false, 'detect',
        'the current VB chart file is current');

    // The SHIPPED resource files must never look stale: a marker that drifts out of the resources is
    // worse than none, because then every project's chart file is rewritten on every save.
    const ROOT = path.join(__dirname, '..', '..');
    for (const name of ['GrumpyCharts.cs', 'GrumpyCharts.vb', 'ChromeWindow.cs', 'ChromeWindow.vb',
        'AnchorHelper.cs', 'AnchorHelper.vb', 'PathPicker.cs', 'PathPicker.vb']) {
        const forVb = name.endsWith('.vb');
        const kind = name.replace(/\.(cs|vb)$/, '');
        const text = fs.readFileSync(path.join(ROOT, 'resources', name), 'utf8');
        t.equal(isStaleBundledCopy(text, forVb, kind), false, 'resources',
            `resources/${name} ships the current marker (so it is never called stale)`);
    }

    // The refresh is TRIGGERED where the XAML that needs it is written: the two chart editors, and the
    // document save — so a project whose chart file is old heals as soon as the form is saved, which is
    // exactly the step that broke ChartTestCS.
    const panel = fs.readFileSync(path.join(ROOT, 'src', 'designerPanel.ts'), 'utf8');
    /** The text of one `case 'x': { … }` block, up to the next case label. */
    const caseBlock = (label) => {
        const start = panel.indexOf(`case '${label}':`);
        if (start < 0) return '';
        const rest = panel.slice(start + 1);
        const next = rest.search(/\n\s*case '/);
        return next < 0 ? rest : rest.slice(0, next);
    };
    /** The text of one method, up to the next member declaration. */
    const methodBlock = (header) => {
        const start = panel.indexOf(header);
        if (start < 0) return '';
        const rest = panel.slice(start + header.length);
        const next = rest.search(/\n    (async|private|public|protected) /);
        return next < 0 ? rest : rest.slice(0, next);
    };
    t.ok(caseBlock('saveChartSeries').includes('ensureGrumpyChartsHelper(doc)'), 'trigger',
        'saving series refreshes the project chart file');
    t.ok(caseBlock('saveChartAxes').includes('ensureGrumpyChartsHelper(doc)'), 'trigger',
        'saving axes refreshes the project chart file');
    const saveDoc = methodBlock('async saveCustomDocument(');
    t.ok(saveDoc.includes("text.includes('charts:Grumpy')")
        && saveDoc.includes('ensureGrumpyChartsHelper(document)'), 'trigger',
        'saving a form that uses a chart refreshes the project chart file');

    // --- A customised copy (bundled header removed) is NEVER touched ---
    t.equal(isStaleBundledCopy('public class ChromeWindow : Window { }  // heavily customised, no header', false, 'ChromeWindow'), false,
        'detect', 'customised ChromeWindow (no bundled header) is left alone');
    t.equal(isStaleBundledCopy("' A project's own rewritten helper — header gone", true, 'AnchorHelper'), false,
        'detect', 'customised AnchorHelper (no bundled header) is left alone');
    t.equal(isStaleBundledCopy('unrelated file contents', true, 'AnchorHelper'), false, 'detect', 'unrelated text is not stale');

    // --- The language picks the right file names ---
    const vb = bundledComponentSpecs(true).map((s) => s.file).sort();
    const cs = bundledComponentSpecs(false).map((s) => s.file).sort();
    t.equal(JSON.stringify(vb), '["AnchorHelper.vb","ChromeWindow.vb","GrumpyCharts.vb","PathPicker.vb"]', 'spec', 'VB spec file names');
    t.equal(JSON.stringify(cs), '["AnchorHelper.cs","ChromeWindow.cs","GrumpyCharts.cs","PathPicker.cs"]', 'spec', 'C# spec file names');
};
