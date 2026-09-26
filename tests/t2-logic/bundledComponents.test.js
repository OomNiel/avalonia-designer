/* T2 — bundledComponents: detecting OLD copies of the extension's own bundled ChromeWindow /
 * AnchorHelper boilerplate inside a generated project (so the designer can refresh them before the
 * XAML no longer compiles — e.g. TitleBarHeight — or stale runtime behaviour keeps docked children
 * "tracked"). */
'use strict';
const fs = require('fs');
const path = require('path');
const { isStaleBundledCopy, bundledComponentSpecs, bundledStampOf } = require('../../out/bundledComponents.js');

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
    // 2026-09-22, later: the `GrumpyWaterfallPlot` type. And then the FILL / RESTORE feature: every chart's
    // right-click menu gained "Fill the container" / "Restore the original position (Esc)". That adds no
    // XAML attribute, so the trap is different — the copy in ChartTestCS already carried the waterfall
    // marker, so a marker still on `GrumpyWaterfallPlot` called that copy CURRENT and the user got neither
    // the new menu nor a refresh prompt. A behaviour change in an existing type moves the marker too.
    // 2026-09-22, later still: the chart grew the FILLED SURFACE between the sets (`SurfaceFill`,
    // `SurfaceColor`, `SurfaceOpacity`), the band under each one (`SurfaceToFloor`), the solid block and
    // the tiled roof — but all of that was since REMOVED, so the marker went back to `IsFilled`
    // (fill/restore), and then to `GrumpySurfacePlot`, the surface chart 3D.
    // 2026-09-24: the surface's BAND FILL was rewritten (`BandTriangle`) — one figure per band could not
    // fill a fold (its outline crosses itself, the two loops wind opposite ways, `NonZero` sums them to
    // zero and drops the fill), so a form whose plot backcolour was red showed that red THROUGH the sheet
    // in the running app while the designer — built from this file — looked right. The project's own copy
    // already carried `GrumpySurfacePlot`, so it was never reported stale: a DRAWING change in an existing
    // type is a marker move like any other, and the new member is what an old copy lacks.
    // 2026-09-25, last of the day: PRINTING gained a second backend. Avae.Printables ships a real service
    // for Windows, macOS and GTK, but the API-only asset for a plain Linux desktop — so `Printable.Default`
    // stayed null there and the disabled Print… entry stayed disabled on the very machine the chart was
    // drawn on. The chart now asks the bundled `GrumpyPrint` helper (CUPS, `lp`) as well, so `CanPrint` and
    // the Print… handler changed shape: a copy without that call keeps a dead entry, which only a refresh
    // can fix. The marker is `GrumpyPrint` — the newest token in the current file.
    const chartSpec = bundledComponentSpecs(false).find((s) => s.kind === 'GrumpyCharts');
    t.equal(chartSpec.marker, 'GrumpyPrint', 'spec',
        'the GrumpyCharts marker is the newest token in the current bundled file (the CUPS print path: CanPrint now accepts GrumpyPrint.Available and PrintAsync renders the page for lp)');
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
    const sheetEraCsCharts = `${cursorEraCsCharts}
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
    // The copy that is current up to the Data Selector, but from before the bar and the pie reported
    // what is under the pointer: it has no HoverExplode, and it would keep offering "Add cursor" on a
    // bar. 2026-09-22, the newest gap.
    // The copy that is current up to the bar/pie hover readout, but from before the WATERFALL type: the
    // toolbox now writes <charts:GrumpyWaterfallPlot …>, which such a copy cannot resolve at all.
    // 2026-09-22, the newest gap.
    const hoverEraCsCharts = `${sheetEraCsCharts}
public sealed class PieHover
{
    public static readonly StyledProperty<double> HoverExplodeProperty = null!;
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
    t.equal(isStaleBundledCopy(sheetEraCsCharts, false, 'GrumpyCharts'), true, 'detect',
        'and one with the Data Selector but before the bar and pie hover readout (HoverExplode)');
    t.equal(isStaleBundledCopy(hoverEraCsCharts, false, 'GrumpyCharts'), true, 'detect',
        'and one with the hover readout but before the waterfall type (the toolbox writes it now)');
    // Exactly the copy ChartTestCS was left holding: the waterfall type is there but the fill/restore
    // feature is not, so the marker has moved past it and it is stale.
    const waterfallEraCsCharts = `${hoverEraCsCharts}
public class GrumpyWaterfallPlot : ChartBase { }`;
    t.equal(isStaleBundledCopy(waterfallEraCsCharts, false, 'GrumpyCharts'), true, 'detect',
        'and one with the waterfall but before fill/restore was current');
    // Fill/restore is the newest feature now (the filled surface between the sets was removed again),
    // so this is the copy in every refreshed project — it carries `IsFilled`, the marker.
    const fillEraCsCharts = `${waterfallEraCsCharts}
public abstract class ChartBase
{
    public bool IsFilled => false;
    public bool FillContainer() => false;
}`;
    t.equal(isStaleBundledCopy(fillEraCsCharts, false, 'GrumpyCharts'), true, 'detect',
        'and one with fill/restore but before the surface chart 3D (the toolbox writes that now)');
    // bands kept showing the plot's backcolour through the sheet.
    const surfaceEraCsCharts = `${fillEraCsCharts}
public class GrumpySurfacePlot : ChartBase { }`;
    t.equal(isStaleBundledCopy(surfaceEraCsCharts, false, 'GrumpyCharts'), true, 'detect',
        'and one with the surface chart 3D but before its triangle band fill (the app still drew holes)');
    // The copy every project was refreshed to on 2026-09-24: the surface type, the triangle band fill and
    // the width window that CUTS. The temperature ramp changed after that — a per-band gradient mixed the
    // height with how far back a point stood — which is the newest gap, and a drawing change like the rest.
    const triangleEraCsCharts = `${surfaceEraCsCharts}
public static class BandFill { internal static double BandTriangle() => 0; }
public static class WidthWindow { internal static double CutToWindow() => 0; }`;
    t.equal(isStaleBundledCopy(triangleEraCsCharts, false, 'GrumpyCharts'), true, 'detect',
        'and one with the triangle band fill but before the ramp was cut on the height levels');
    // The current copy: everything above plus the ramp cut on the height's own levels.
    const levelEraCsCharts = `${triangleEraCsCharts}
public static class HeightLevels { internal static double CutToLevels() => 0; }`;
    t.equal(isStaleBundledCopy(levelEraCsCharts, false, 'GrumpyCharts'), true, 'detect',
        'and one with the level-cut ramp but before the legend grew its two zoom sliders (the copy a running\n         app had while the designer preview already showed four)');
    // The current copy: everything above plus today's legend toggle and the hardcopy menu entries.
    const legendEraCsCharts = `${levelEraCsCharts}
private static readonly object legendItem = null;`;
    t.equal(isStaleBundledCopy(legendEraCsCharts, false, 'GrumpyCharts'), true, 'detect',
        'a copy with the four-slider legend but no hardcopy menu is stale (the marker moved on)');
    // A copy that has the hardcopy menu but not this release's overhaul of it.
    const hardcopyEraCsCharts = `${legendEraCsCharts}
private static readonly object printItem = null;`;
    t.equal(isStaleBundledCopy(hardcopyEraCsCharts, false, 'GrumpyCharts'), true, 'detect',
        'and one with the Print…/Print to PDF… entries but before the print path was gated, reportable and exportable');
    // The current copy: everything above plus the overhaul itself, and the CUPS backend on top.
    const curCsCharts = `${hardcopyEraCsCharts}
public static bool CanPrint => true;
public event EventHandler<Exception>? PrintFailed;
public Task<bool> ExportPdfAsync(string path) => Task.FromResult(true);
public static bool CanPrintCups => GrumpyPrint.Available;`;
    t.equal(isStaleBundledCopy(curCsCharts, false, 'GrumpyCharts'), false, 'detect',
        'the current chart file is current (printing through CUPS on Linux is the newest thing it ships)');
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
Public Shared ReadOnly SourceSheetProperty As StyledProperty(Of String) = Nothing
Public Shared ReadOnly HoverExplodeProperty As StyledProperty(Of Double) = Nothing
Public Class GrumpyWaterfallPlot
End Class
Public Class GrumpySurfacePlot
End Class
Public ReadOnly Property IsFilled As Boolean`;
    t.equal(isStaleBundledCopy(oldVbCharts, true, 'GrumpyCharts'), true, 'detect',
        'a VB chart file from before the series classes is stale');
    // The VB twin of the surface-era copy: the type is there, the triangle band fill is not.
    t.equal(isStaleBundledCopy(curVbCharts, true, 'GrumpyCharts'), true, 'detect',
        'the same copy in VB (surface type, no triangle band fill) is stale too — a drawing fix is a marker move');
    const triangleEraVbCharts = `${curVbCharts}
Friend Function BandTriangle() As Double
End Function
Friend Function CutToWindow() As Double
End Function`;
    t.equal(isStaleBundledCopy(triangleEraVbCharts, true, 'GrumpyCharts'), true, 'detect',
        'and the VB copy that has the triangle fill but not the level-cut ramp');
    const levelEraVbCharts = `${triangleEraVbCharts}
Friend Function CutToLevels() As Double
End Function`;
    t.equal(isStaleBundledCopy(levelEraVbCharts, true, 'GrumpyCharts'), true, 'detect',
        'and the VB copy that has the level-cut ramp but not the four-slider legend');
    t.equal(isStaleBundledCopy(`${levelEraVbCharts}
Private Shared ReadOnly legendItem As Object = Nothing
Private Shared ReadOnly printItem As Object = Nothing`, true, 'GrumpyCharts'), true,
        'detect', 'the VB copy with the first hardcopy menu but not this release\'s overhaul is stale');
    t.equal(isStaleBundledCopy(`${levelEraVbCharts}
Private Shared ReadOnly legendItem As Object = Nothing
Private Shared ReadOnly printItem As Object = Nothing
Public Shared ReadOnly Property CanPrint As Boolean
Public Event PrintFailed As EventHandler(Of Exception)
Public Function ExportPdfAsync(path As String) As Task(Of Boolean)
Public Shared ReadOnly Property CanPrintCups As Boolean
    Get
        Return GrumpyPrint.Available
    End Get
End Property`, true, 'GrumpyCharts'), false,
        'detect', 'the current VB chart file is current (with the CUPS backend it now drives on Linux)');

    // The SHIPPED resource files must never look stale: a marker that drifts out of the resources is
    // worse than none, because then every project's chart file is rewritten on every save.
    const ROOT = path.join(__dirname, '..', '..');
    for (const name of ['GrumpyCharts.cs', 'GrumpyCharts.vb', 'GrumpyPrint.cs', 'GrumpyPrint.vb',
        'GrumpySheet.cs', 'GrumpySheet.vb',
        'ChromeWindow.cs', 'ChromeWindow.vb',
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
    t.equal(JSON.stringify(vb), '["AnchorHelper.vb","ChromeWindow.vb","GrumpyCharts.vb","GrumpyPrint.vb","GrumpySheet.vb","PathPicker.vb"]', 'spec', 'VB spec file names');
    t.equal(JSON.stringify(cs), '["AnchorHelper.cs","ChromeWindow.cs","GrumpyCharts.cs","GrumpyPrint.cs","GrumpySheet.cs","PathPicker.cs"]', 'spec', 'C# spec file names');

    // ---------------------------------------------------------------- the version STAMP every copy carries
    // A release is where a project's copy and the extension's part company, so the version is stamped into
    // each bundled header (`BUNDLED-COPY: 0.11.18`) and a copy that names another release can never pass as
    // current. A release that forgets to re-stamp fails here, which is the whole point of doing it this way.
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const stampFiles = fs.readdirSync(path.join(ROOT, 'resources')).filter((n) => /\.(cs|vb)$/.test(n)).sort();
    t.ok(stampFiles.length >= 14, 'stamp', 'the bundled resources are all there', stampFiles.join(', '));
    for (const name of stampFiles) {
        const text = fs.readFileSync(path.join(ROOT, 'resources', name), 'utf8');
        t.equal(bundledStampOf(text), pkg.version, 'stamp',
            `resources/${name} names the release it was copied from`, `stamp: ${bundledStampOf(text)}`);
    }
    t.equal(bundledStampOf('// a file with no stamp at all\nclass X { }'), null, 'stamp',
        'a copy from before the stamp existed reads as unstamped (not as current)');

    // ---------------------------------------------------------------- "older" is a CONTENT question
    // Reported from a running app on 2026-09-24: "the new sliders is rendering in the designer preview but
    // not during runtime", and "the right click legend on/off not available in the right click menu in
    // runtime". The preview draws the HOST's copy of the chart file while the app compiles the PROJECT's,
    // and the reporter's copy carried every marker token of the day before — a drawing change (a slider, a
    // colour, a menu entry) adds no token to look for, so nothing was detected and no refresh was offered.
    // Comparing the CONTENT is what makes that class of change visible; the marker stays as the answer for a
    // caller that does not have the shipped file at hand.
    const shippedCs = fs.readFileSync(path.join(ROOT, 'resources', 'GrumpyCharts.cs'), 'utf8');
    t.equal(isStaleBundledCopy(shippedCs, false, 'GrumpyCharts', shippedCs), false, 'content',
        'a project copy that IS the shipped copy is current');
    t.equal(isStaleBundledCopy(shippedCs.replace('RangeAxisCount', 'SomethingElse'), false, 'GrumpyCharts', shippedCs),
        true, 'content',
        'but one line different is stale — whatever that line is, and though every marker token is still there');
    t.equal(isStaleBundledCopy(shippedCs.replace(/\n/g, '\r\n'), false, 'GrumpyCharts', shippedCs), false, 'content',
        'line endings alone are not a difference (a project re-saved on Windows is not stale)');
    t.equal(isStaleBundledCopy(`${shippedCs}\n// local tweak\n`, false, 'GrumpyCharts', shippedCs), true, 'content',
        'and a copy with local edits is refreshable, exactly as the bundled-header rule always said');
    t.equal(isStaleBundledCopy('// my own chart file\nclass X { }', false, 'GrumpyCharts', shippedCs), false, 'content',
        'a file that is not our boilerplate at all is still never touched');
    t.equal(isStaleBundledCopy(shippedCs, false, 'GrumpyCharts'), false, 'content',
        'and without the shipped file at hand the answer is still the marker test (the older contract)');

    // ---------------------------------------------------------------- the refresh can be automatic
    const panelSource = fs.readFileSync(path.join(ROOT, 'src', 'designerPanel.ts'), 'utf8');
    const auto = pkg.contributes.configuration.properties['avaloniaDesigner.bundled.autoUpdate'];
    t.equal(auto?.default, false, 'auto',
        'the auto-update setting exists and is OFF by default (writing into a project is the user\'s call)');
    t.ok(/bundled\.autoUpdate/.test(panelSource) && /ensureBundledComponentsCurrent\(doc\)/.test(panelSource),
        'auto', 'the panel reads that setting and refreshes without asking when it is on');
    t.ok(/bundled\.autoUpdate makes this automatic/.test(panelSource), 'auto',
        'and the asking message says where to make it automatic');
};
