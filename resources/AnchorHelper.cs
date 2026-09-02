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
/// Usage (set via the Avalonia Designer's <b>Anchor</b> property, or by hand):
///   <![CDATA[<Button Canvas.Left="40" Canvas.Top="20" chrome:AnchorHelper.Anchor="Left,Bottom"/>]]>
///
/// The control keeps a fixed distance from the anchored edges of its container as the
/// container resizes:
///   - anchored to one edge: the control moves with that edge;
///   - anchored to two OPPOSITE edges (Left+Right or Top+Bottom): the control stretches
///     between them (so it grows/shrinks with the container).
/// "None" (or an empty value) disables anchoring. Only direct children of a Panel (a Canvas)
/// are tracked; inside flow panels (StackPanel/Grid/DockPanel) the property is inert.
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
    private Panel? _parent;
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
        if (c.GetVisualParent() is not Panel parent) return;
        _parent = parent;
        Parse(AnchorHelper.GetAnchor(c));
        Capture(c, parent.Bounds.Width, parent.Bounds.Height);
        Apply(c, parent.Bounds.Width, parent.Bounds.Height);
        parent.SizeChanged += OnParentSizeChanged;
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
