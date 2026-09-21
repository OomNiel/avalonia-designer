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
    // 2026-09-21 moved the marker to `PickerFolderMemory`: the Browse button now remembers the folder it
    // used last in the per-user app-data folder, instead of forgetting it at the next restart.
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
    Friend NotInheritable Class PickerFolderMemory
    End Class
End Namespace`;
    t.equal(isStaleBundledCopy(oldVbPicker, true, 'PathPicker'), true, 'detect', 'old bundled PathPicker.vb is stale (no icon)');
    t.equal(isStaleBundledCopy(curVbPicker, true, 'PathPicker'), false, 'detect', 'current PathPicker.vb is current');
    const oldCsPicker = `// PathPicker.cs — BUNDLED RESOURCE (the VB twin is resources/PathPicker.vb).
public class PathPicker : UserControl { public string? SelectedPath { get; set; } }`;
    // The icon era: it has ShowIcon, but no folder memory — which is what the marker watches now.
    const iconEraCsPicker = `// PathPicker.cs — BUNDLED RESOURCE (the VB twin is resources/PathPicker.vb).
public class PathPicker : UserControl { public bool ShowIcon { get; set; } }`;
    t.equal(isStaleBundledCopy(iconEraCsPicker, false, 'PathPicker'), true, 'detect',
        'a picker with the icon but no folder memory is stale (it forgets the folder at every restart)');
    const curCsPicker = `${iconEraCsPicker}
internal static class PickerFolderMemory { internal static string? LastFolder { get; set; } }`;
    t.equal(isStaleBundledCopy(oldCsPicker, false, 'PathPicker'), true, 'detect', 'old bundled PathPicker.cs is stale (no ShowIcon)');
    t.equal(isStaleBundledCopy(curCsPicker, false, 'PathPicker'), false, 'detect', 'current PathPicker.cs is current');
    t.equal(isStaleBundledCopy(`${oldVbPicker}\n' customised by hand — do not touch`, true, 'PathPicker'), true,
        'detect', 'a stale picker with extra hand-edits still refreshes (the header is the bundled one)');

    // --- GrumpyCharts.vb / .cs (the chart set) ---
    // 2026-09-20: the charts gained SERIES and AXIS objects. A project created before that keeps its
    // old chart file, and saving a form with two series into it does not compile:
    //   "AVLN2000: Unable to resolve type XYSeries from namespace using:AvaloniaCharts" (ChartTestCS).
    // The same day they gained CURSORS (`ChartCursor` inside the `.Cursors` property element), a following
    // cursor began to be DRAWN in the colour of the series it follows, the legend gained a MARGIN, and the
    // chart gained PADDING (the room between its border and its frame).
    // 2026-09-21 added the background GRADIENT (`PlotBackBrush`, an axis' two extra colours) — and a
    // gradient is the first of these the editor writes as a PROPERTY ELEMENT, which no older copy can
    // resolve at all.
    // None of those is a new type in the filesystem sense, and all of them are invisible to a copy that
    // lacks them — a XAML attribute the old copy has no property for does not even compile. So the marker is
    // the newest token the current file has: not the pre-series `PlotBackOpacityProperty` (every copy ever
    // shipped has it, so it detected nothing), not `XYSeries` (the multi-series copies have it), and no
    // longer `ChartCursor`, `DrawnColor`, `LegendMargin` or `Padding` either.
    const chartSpec = bundledComponentSpecs(false).find((s) => s.kind === 'GrumpyCharts');
    t.equal(chartSpec.marker, 'SourceSheet', 'spec',
        'the GrumpyCharts marker is the newest token in the current bundled file');
    const oldCsCharts = `// GrumpyCharts.cs — BUNDLED RESOURCE (the VB twin is resources/GrumpyCharts.vb).
public sealed class ChartSeries { public double[] Xs = Array.Empty<double>(); }
public abstract class ChartBase : Control { public string? SourceFile { get; set; } }`;
    // The copy that is "only" a release behind: series and axes, but no cursors.
    const seriesEraCsCharts = `// GrumpyCharts.cs — BUNDLED RESOURCE (the VB twin is resources/GrumpyCharts.vb).
public class LineSeries : ChartSeries { }
public class XYSeries : ChartSeries { public Axis? XAxis { get; set; } }
public sealed class Axis { public AxisPosition Position { get; set; } }`;
    // A copy WITH cursors but from before they inherited the traced series' colour.
    const cursorEraCsCharts = `${seriesEraCsCharts}
public sealed class ChartCursor { public CursorOrientation Orientation { get; set; } }`;
    const curCsCharts = `${cursorEraCsCharts}
public sealed class CursorHit { internal Color DrawnColor = Colors.Transparent; }
public sealed class ChartBase { public static readonly StyledProperty<double> LegendMarginProperty = null!; }
public sealed class ChartShell { public static readonly StyledProperty<Thickness> PaddingProperty = null!; }
public sealed class BrushHost { public static readonly StyledProperty<Brush?> PlotBackBrushProperty = null!; }
internal static class ChartPickerMemory { internal static string? LastFolder { get; set; } }
public class GrumpyBarPlot : ChartBase { }
public class GrumpyAreaPlot : ChartBase { }
public class GrumpyPiePlot : ChartBase { }
public class PieSlice : ChartSeries { }
public sealed class ChartData
{
    public static readonly StyledProperty<string?> SourceSheetProperty = null!;
}`;
    t.equal(isStaleBundledCopy(oldCsCharts, false, 'GrumpyCharts'), true, 'detect',
        'a chart file from before the series classes is stale (this broke ChartTestCS)');
    t.equal(isStaleBundledCopy(seriesEraCsCharts, false, 'GrumpyCharts'), true, 'detect',
        'a chart file with series and axes but no cursors is stale too (the cursor XAML would not compile)');
    t.equal(isStaleBundledCopy(cursorEraCsCharts, false, 'GrumpyCharts'), true, 'detect',
        'and so is one with cursors from before they took the followed series\' colour');
    // New enough for the cursor colour rule, still without the legend margin: stale as well, because the
    // editor writes LegendMargin="…" into forms now and an old copy has no such property to compile it.
    const colourEraCsCharts = `${cursorEraCsCharts}
public sealed class CursorHit { internal Color DrawnColor = Colors.Transparent; }`;
    t.equal(isStaleBundledCopy(colourEraCsCharts, false, 'GrumpyCharts'), true, 'detect',
        'and one with the cursor colour rule but no legend margin');
    // New enough for the legend margin, still without the Padding the Properties panel writes now.
    const marginEraCsCharts = `${colourEraCsCharts}
public sealed class ChartBase { public static readonly StyledProperty<double> LegendMarginProperty = null!; }`;
    t.equal(isStaleBundledCopy(marginEraCsCharts, false, 'GrumpyCharts'), true, 'detect',
        'and one with the legend margin but no chart Padding');
    // New enough for the padding, still without the gradient brush: the editor writes
    // <charts:GrumpyXYPlot.PlotBackBrush><LinearGradientBrush …> into forms now, which a copy without
    // the property cannot even resolve. This is the newest gap, so it is what the marker watches.
    const paddingEraCsCharts = `${marginEraCsCharts}
public sealed class ChartShell { public static readonly StyledProperty<Thickness> PaddingProperty = null!; }`;
    t.equal(isStaleBundledCopy(paddingEraCsCharts, false, 'GrumpyCharts'), true, 'detect',
        'and one with the padding but no gradient brush');
    // The copy that is current in every earlier respect but has no BAR/AREA/PIE types: the toolbox now
    // writes <charts:GrumpyBarPlot BarMode="Stacked">, which such a copy cannot resolve at all — this
    // is the newest gap, so it is what the marker watches.
    const brushEraCsCharts = `${paddingEraCsCharts}
public sealed class BrushHost { public static readonly StyledProperty<Brush?> PlotBackBrushProperty = null!; }
internal static class ChartPickerMemory { internal static string? LastFolder { get; set; } }`;
    t.equal(isStaleBundledCopy(brushEraCsCharts, false, 'GrumpyCharts'), true, 'detect',
        'and one with the gradient and the picker memory but neither the bar, area nor pie types');
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
End Class
Public NotInheritable Class ChartCursor
End Class
Friend DrawnColor As Color = Colors.Transparent
Friend LegendMargin As Double
Friend Padding As Thickness
Friend PlotBackBrush As Brush
Friend NotInheritable Class ChartPickerMemory
End Class
Public Class GrumpyBarPlot
End Class
Public Class GrumpyAreaPlot
End Class
Public Class GrumpyPiePlot
End Class
Public Class PieSlice
End Class
Public Shared ReadOnly SourceSheetProperty As StyledProperty(Of String) = Nothing`;
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

    // …and OPENING one OFFERS it, which is the gap that made a new bundled feature look broken: a form
    // that is only opened (and an app built from it) keeps the project's older control, because saving
    // is the trigger — and there is nothing to save. Reported 2026-09-21 after the chart's picker
    // learned to remember its folder: it worked in the designer and not in the app, because the app
    // compiles the PROJECT's copy.
    const openDoc = methodBlock('async openCustomDocument(');
    t.ok(openDoc.includes('noticeStaleBundledHelpers(doc)'), 'open-notice',
        'opening a form checks this project\'s bundled files');
    const notice = methodBlock('private noticeStaleBundledHelpers(');
    t.ok(notice.includes('this.staleHelperOffered.has(key)') && notice.includes('this.staleHelperOffered.add(key)'),
        'open-notice', 'the notice is shown once per form, not on every open');
    t.ok(notice.includes('staleBundledFiles(doc)'), 'open-notice',
        'it asks which files are actually stale');
    t.ok(notice.includes("'Update now'") && notice.includes('ensureBundledComponentsCurrent(doc)'),
        'open-notice', 'and updates them only when the user asks');
    const scan = methodBlock('private staleBundledFiles(');
    t.ok(scan.includes('isStaleBundledCopy('), 'open-notice',
        'only provable bundled boilerplate is ever reported (a customised copy is not)');
    const candidates = methodBlock('private bundledFileCandidates(');
    t.ok(candidates.includes('projectUri.fsPath') && candidates.includes('doc.uri.fsPath'), 'open-notice',
        'both places a helper can live are searched (project folder, and next to the .axaml)');
    // The refresh shares that search — it used to `break` on a missing file, so a form in a sub-folder
    // (helper next to the .axaml) was never refreshed at all.
    const ensure = methodBlock('private ensureBundledComponentsCurrent(');
    t.ok(ensure.includes('bundledFileCandidates(doc, proj, spec.file)'), 'open-notice',
        'and the refresh uses the same two-place search');
    t.ok(!/\n\s*const dirs = \[path\.dirname\(proj\.projectUri/.test(ensure), 'open-notice',
        'the old one-place search is gone');

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
