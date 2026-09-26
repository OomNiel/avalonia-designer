// BUNDLED-COPY: 0.12.8
using System;
using System.Runtime.CompilerServices;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.VisualTree;

namespace AvaloniaChrome;

/// <summary>
/// WinForms-style anchoring for controls placed on a free-placement Canvas.
///
/// Usage (set via the <b>Anchor</b> property in Grumpy's WYSIWYG Designer, or by hand):
///   <![CDATA[<Button Canvas.Left="40" Canvas.Top="20" chrome:AnchorHelper.Anchor="Left,Bottom"/>]]>
///
/// The control keeps a fixed distance from the anchored edges of its container as the
/// container resizes:
///   - anchored to one edge: the control moves with that edge;
///   - anchored to two OPPOSITE edges (Left+Right or Top+Bottom): the control stretches
///     between them (so it grows/shrinks with the container).
/// "None" (or an empty value) disables anchoring.
/// On a Canvas the control is free-placed (Canvas.Left/Top). Inside a DockPanel — a Status Bar
/// strip, a Menu bar, etc. — an edge Anchor DOCKs the control to that edge (a StatusDate /
/// TextBlock has no Dock property of its own, so Anchor is how one is pinned, e.g. Right to hug
/// the right edge as the window resizes). Grid/StackPanel children are laid out by their panel
/// and are not anchored.
/// </summary>
public class AnchorHelper
{
    // Non-static class (private ctor) so it can be the TOwner of the attached property —
    // the C# compiler rejects static classes as generic type arguments (CS0718), and the
    // 2-generic RegisterAttached overload is not present in Avalonia 11.0.10.
    private AnchorHelper() { }

    /// <summary>Attached property value: comma-separated edges, e.g. "Left,Bottom".</summary>
    public static readonly AttachedProperty<string> AnchorProperty =
        AvaloniaProperty.RegisterAttached<AnchorHelper, Control, string>("Anchor", "None");

    public static string GetAnchor(Control c) => c.GetValue(AnchorProperty);
    public static void SetAnchor(Control c, string value) => c.SetValue(AnchorProperty, value);

    static AnchorHelper()
    {
        AnchorProperty.Changed.AddClassHandler<Control>((c, _) =>
        {
            var anchor = GetAnchor(c);
            if (anchor is { Length: > 0 } && !string.Equals(anchor, "None", StringComparison.OrdinalIgnoreCase))
                AnchorTracker.Get(c).Attach(c);
            else
                AnchorTracker.Get(c).Detach();
        });
    }
}

internal sealed class AnchorTracker
{
    private static readonly ConditionalWeakTable<Control, AnchorTracker> Trackers = new();

    private Control? _c;
    private Canvas? _parent;
    private bool _left, _right, _top, _bottom;
    private double _mL, _mT, _mR, _mB;

    public static AnchorTracker Get(Control c) => Trackers.GetValue(c, static _ => new AnchorTracker());

    public void Attach(Control c)
    {
        Detach();
        _c = c;
        if (c.IsLoaded) OnLoaded(c, new RoutedEventArgs());
        else c.Loaded += OnLoaded;
    }

    public void Detach()
    {
        if (_c is not null) { _c.Loaded -= OnLoaded; _c = null; }
        if (_parent is not null) { _parent.SizeChanged -= OnParentSizeChanged; _parent = null; }
    }

    private void OnLoaded(object? sender, RoutedEventArgs e)
    {
        if (_c is not Control c) return;
        c.Loaded -= OnLoaded;
        // Free placement on a Canvas: classic Canvas.Left/Top anchoring (keeps a fixed distance,
        // opposite-edge pairs stretch). Inside a DockPanel (a Status Bar strip, …) children are
        // edge-docked by the panel — a StatusDate/TextBlock has no Dock property, so an edge
        // Anchor docks the control to that edge and the DockPanel keeps it pinned as the window
        // resizes.
        if (c.GetVisualParent() is Canvas parent)
        {
            _parent = parent;
            Parse(AnchorHelper.GetAnchor(c));
            Capture(c, parent.Bounds.Width, parent.Bounds.Height);
            Apply(c, parent.Bounds.Width, parent.Bounds.Height);
            parent.SizeChanged += OnParentSizeChanged;
        }
        else if (c.GetVisualParent() is DockPanel dock)
        {
            DockTo(dock, AnchorHelper.GetAnchor(c));
        }
    }

    /** Maps an Anchor edge set to the single Dock edge for a DockPanel child (Right wins over
     *  Left, Bottom over Top) — inside a DockPanel an edge Anchor docks the control to that edge. */
    private static Dock AnchorDockEdge(string anchor)
    {
        if (anchor.Contains("Right", StringComparison.OrdinalIgnoreCase)) return Dock.Right;
        if (anchor.Contains("Left", StringComparison.OrdinalIgnoreCase)) return Dock.Left;
        if (anchor.Contains("Bottom", StringComparison.OrdinalIgnoreCase)) return Dock.Bottom;
        if (anchor.Contains("Top", StringComparison.OrdinalIgnoreCase)) return Dock.Top;
        return Dock.Left;
    }

    private void DockTo(DockPanel dock, string anchor)
    {
        if (_c is not Control c) return;
        if (string.IsNullOrEmpty(anchor) || string.Equals(anchor, "None", StringComparison.OrdinalIgnoreCase)) return;
        var edge = AnchorDockEdge(anchor);
        if (DockPanel.GetDock(c) == edge) return; // the designer usually mirrors it already
        DockPanel.SetDock(c, edge);
    }

    private void Parse(string anchor)
    {
        _left = anchor.Contains("Left", StringComparison.OrdinalIgnoreCase);
        _right = anchor.Contains("Right", StringComparison.OrdinalIgnoreCase);
        _top = anchor.Contains("Top", StringComparison.OrdinalIgnoreCase);
        _bottom = anchor.Contains("Bottom", StringComparison.OrdinalIgnoreCase);
    }

    private void Capture(Control c, double w, double h)
    {
        _mL = Canvas.GetLeft(c);
        _mT = Canvas.GetTop(c);
        _mR = w - (Canvas.GetLeft(c) + c.Bounds.Width);
        _mB = h - (Canvas.GetTop(c) + c.Bounds.Height);
    }

    private void OnParentSizeChanged(object? sender, SizeChangedEventArgs e) => Apply(_c!, e.NewSize.Width, e.NewSize.Height);

    private void Apply(Control c, double w, double h)
    {
        var x = Canvas.GetLeft(c);
        var y = Canvas.GetTop(c);
        var cw = c.Bounds.Width;
        var ch = c.Bounds.Height;
        if (_left) x = _mL;
        if (_right)
        {
            var right = w - _mR;
            if (_left) { x = _mL; cw = Math.Max(0, right - _mL); }
            else x = right - cw;
        }
        if (_top) y = _mT;
        if (_bottom)
        {
            var bottom = h - _mB;
            if (_top) { y = _mT; ch = Math.Max(0, bottom - _mT); }
            else y = bottom - ch;
        }
        Canvas.SetLeft(c, x);
        Canvas.SetTop(c, y);
        if (_left && _right) c.Width = cw;
        if (_top && _bottom) c.Height = ch;
    }
}
