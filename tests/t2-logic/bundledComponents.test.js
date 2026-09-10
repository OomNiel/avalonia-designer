/* T2 — bundledComponents: detecting OLD copies of the extension's own bundled ChromeWindow /
 * AnchorHelper boilerplate inside a generated project (so the designer can refresh them before the
 * XAML no longer compiles — e.g. TitleBarHeight — or stale runtime behaviour keeps docked children
 * "tracked"). */
'use strict';
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

    // --- A customised copy (bundled header removed) is NEVER touched ---
    t.equal(isStaleBundledCopy('public class ChromeWindow : Window { }  // heavily customised, no header', false, 'ChromeWindow'), false,
        'detect', 'customised ChromeWindow (no bundled header) is left alone');
    t.equal(isStaleBundledCopy("' A project's own rewritten helper — header gone", true, 'AnchorHelper'), false,
        'detect', 'customised AnchorHelper (no bundled header) is left alone');
    t.equal(isStaleBundledCopy('unrelated file contents', true, 'AnchorHelper'), false, 'detect', 'unrelated text is not stale');

    // --- The language picks the right file names ---
    const vb = bundledComponentSpecs(true).map((s) => s.file).sort();
    const cs = bundledComponentSpecs(false).map((s) => s.file).sort();
    t.equal(JSON.stringify(vb), '["AnchorHelper.vb","ChromeWindow.vb"]', 'spec', 'VB spec file names');
    t.equal(JSON.stringify(cs), '["AnchorHelper.cs","ChromeWindow.cs"]', 'spec', 'C# spec file names');
};
