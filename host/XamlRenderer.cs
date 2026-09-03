using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Xml.Linq;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Layout;
using Avalonia.LogicalTree;
using Avalonia.Markup.Xaml;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Avalonia.Styling;
using Avalonia.VisualTree;

namespace PreviewerHost;

public class ControlInfo
{
    public int Index { get; set; }
    public string? Name { get; set; }
    public string Type { get; set; } = "";
    public double X { get; set; }
    public double Y { get; set; }
    public double Width { get; set; }
    public double Height { get; set; }
    /// <summary>Name of the direct parent control (null for the window root or unnamed parents).</summary>
    public string? Parent { get; set; }
    /// <summary>Effective (theme-resolved) design property values for the Properties panel.</summary>
    public Dictionary<string, string>? Values { get; set; }
}

/// <summary>Cell boundary positions (window/design coords) of a Grid, used for drag-to-re-cell.</summary>
public class GridCellInfo
{
    /// <summary>x positions of the column boundaries (length = columns + 1).</summary>
    public List<double> V { get; set; } = new();
    /// <summary>y positions of the row boundaries (length = rows + 1).</summary>
    public List<double> H { get; set; } = new();
}

public class FrameResult
{
    public string PngBase64 { get; set; } = "";
    public double Width { get; set; }
    public double Height { get; set; }
    public List<ControlInfo> Controls { get; set; } = new();
    /// <summary>Per named Grid: its column/row boundary positions (window coords).</summary>
    public Dictionary<string, GridCellInfo> GridCells { get; set; } = new();
    public string? Error { get; set; }
}

/// <summary>
/// Loads XAML into a headless Window and renders it to a PNG bitmap plus control bounds.
/// Loading strategy (proven in the VB DesignerHost):
///   1. Internal IRuntimeXamlLoader via reflection (full-fidelity XAML compilation).
///   2. Temp-file + AvaloniaXamlLoader.Load(Uri, Uri).
///   3. Programmatic construction from the XML (common designer format only).
/// </summary>
public class XamlRenderer
{
    /// <summary>User project root (for resolving avares://… image Sources) during the programmatic build.</summary>
    private static string? CurrentProjectPath;

    public FrameResult Render(string xaml, double designW, double designH, string? projectPath = null, string? theme = null)
    {
        try
        {
            CurrentProjectPath = projectPath;
            var window = LoadWindow(xaml, (int)designW, (int)designH, projectPath)
                ?? throw new InvalidOperationException("Failed to load XAML into a Window.");

            // The headless platform can't detect the OS colour scheme, so the extension tells us
            // which FluentTheme variant to render (so a "System" form that the user's OS would
            // show dark is previewed dark, not always white/light). Applied before Show/Measure.
            if (theme == "dark") window.RequestedThemeVariant = ThemeVariant.Dark;
            else if (theme == "light") window.RequestedThemeVariant = ThemeVariant.Light;

            window.Width = designW;
            window.Height = designH;
            window.Show();
            SetClientSize(window, designW, designH);
            window.ApplyTemplate();

            var finalSize = new Size(designW, designH);

            // Body <Image Source="avares://Project/Assets/..."> can't resolve through Avalonia's
            // asset loader (the host has none of the user's assets). Re-inject resolved bitmaps by
            // name into the realized visual instances BEFORE measure, so images keep their real
            // size (a null source measures to 0x0).
            ApplyImageSources(window, xaml, projectPath);

            window.Measure(finalSize);
            window.Arrange(new Rect(new Point(0, 0), finalSize));

            var rtb = new RenderTargetBitmap(new PixelSize((int)designW, (int)designH), new Vector(96, 96));
            rtb.Render(window);

            using var ms = new MemoryStream();
            rtb.Save(ms);
            var png = Convert.ToBase64String(ms.ToArray());

            var frame = new FrameResult { PngBase64 = png, Width = designW, Height = designH };
            CollectControls(window, frame);
            window.Close();

            return frame;
        }
        catch (Exception ex)
        {
            return RenderError(ex, designW, designH);
        }
        finally
        {
            CurrentProjectPath = null;
        }
    }

    /// <summary>
    /// The headless platform fixes a window at its default screen size; the public
    /// ClientSize setter is inaccessible, so we set it through reflection so the
    /// design surface matches the requested size exactly.
    /// </summary>
    private static readonly PropertyInfo? ClientSizeProp =
        typeof(TopLevel).GetProperty("ClientSize", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);

    private static void SetClientSize(Window window, double w, double h)
    {
        try { ClientSizeProp?.SetValue(window, new Size(w, h)); }
        catch { /* fall through; Width/Height still applied */ }
    }

    private static Window? LoadWindow(string xaml, int width, int height, string? projectPath = null)
    {
        try
        {
            var w = TryLoadViaRuntimeXamlLoader(xaml);
            if (w is not null) return w;
        }
        catch { /* try next strategy */ }

        try
        {
            var w = TryLoadFromTempFile(xaml);
            if (w is not null) return w;
        }
        catch { /* try next strategy */ }

        return BuildWindowFromXaml(xaml, width, height, projectPath);
    }

    private static Window? TryLoadViaRuntimeXamlLoader(string xaml)
    {
        var baseAsm = Assembly.Load("Avalonia.Base");
        var locatorType = baseAsm.GetType("AvaloniaLocator");
        var currentProp = locatorType?.GetProperty("Current");
        var resolver = currentProp?.GetValue(null);
        if (resolver is null) return null;

        var getService = resolver.GetType().GetMethod("GetService");
        var xamlAsm = typeof(AvaloniaXamlLoader).Assembly;
        var loaderType = xamlAsm.GetType("AvaloniaXamlLoader+IRuntimeXamlLoader");
        if (getService is null || loaderType is null) return null;

        var loader = getService.Invoke(resolver, new object[] { loaderType });
        if (loader is null) return null;

        var docType = xamlAsm.GetType("RuntimeXamlLoaderDocument");
        var configType = xamlAsm.GetType("RuntimeXamlLoaderConfiguration");
        if (docType is null || configType is null) return null;

        var doc = Activator.CreateInstance(docType, xaml);
        var config = Activator.CreateInstance(configType);
        var load = loaderType.GetMethod("Load");
        var obj = load?.Invoke(loader, new object?[] { doc, config });
        return AsWindowOrWrap(obj);
    }

    private static Window? TryLoadFromTempFile(string xaml)
    {
        var tempPath = Path.Combine(Path.GetTempPath(), "PreviewerHost_" + Guid.NewGuid().ToString("N") + ".axaml");
        File.WriteAllText(tempPath, xaml);
        try
        {
            var uri = new Uri(tempPath);
            var obj = AvaloniaXamlLoader.Load(uri, uri);
            return AsWindowOrWrap(obj);
        }
        finally
        {
            try { if (File.Exists(tempPath)) File.Delete(tempPath); }
            catch { /* ignore */ }
        }
    }

    private static Window? AsWindowOrWrap(object? obj)
    {
        if (obj is Window w) return w;
        if (obj is Control c) return new Window { Content = c };
        return null;
    }

    // ---- Programmatic fallback (handles the common designer format) ----

    private static Window? BuildWindowFromXaml(string xaml, int width, int height, string? projectPath = null)
    {
        var doc = XDocument.Parse(xaml);
        var root = doc.Root;
        if (root is null) throw new InvalidOperationException("Empty XAML document.");

        var window = new Window { Width = width, Height = height };

        foreach (var attr in root.Attributes())
        {
            if (attr.Name.LocalName.StartsWith("xmlns")) continue;
            ApplyProperty(window, attr.Name.LocalName, attr.Value);
        }

        // A chrome:ChromeWindow root owns a custom title bar (44px). Render it in the
        // preview too, so the design surface matches the running app — otherwise the
        // body is drawn taller than the visible area and bottom-docked controls (e.g.
        // a Status Bar in a full-height DockPanel) are clipped off-screen.
        var isChromeWindow = root.Name.LocalName.EndsWith("ChromeWindow", StringComparison.OrdinalIgnoreCase)
            || root.Attributes().Any(a => a.Name.LocalName == "TitleBarTitle");

        foreach (var childElem in root.Elements())
        {
            if (childElem.Name.LocalName.StartsWith("xmlns")) continue;
            var panel = TryCreatePanel(childElem);
            if (panel is not null)
            {
                window.Content = isChromeWindow ? BuildChromeTitleBar(panel, root, projectPath) : panel;
                break;
            }
            // The form body need not be a Panel (e.g. a ListBox as the direct root child) —
            // create it directly so it still renders in the preview.
            var ctrl = CreateControlFromElement(childElem);
            if (ctrl is not null)
            {
                window.Content = isChromeWindow ? BuildChromeTitleBar(ctrl, root, projectPath) : ctrl;
                break;
            }
        }

        return window;
    }

    /// <summary>Mirrors the ChromeWindow title bar (dark bar, centred title, optional icon and
    /// min/max/close caption buttons) so the preview matches the running app for
    /// chrome:ChromeWindow forms.</summary>
    private static Control BuildChromeTitleBar(Control body, XElement root, string? projectPath)
    {
        var title = root.Attributes().FirstOrDefault(a => a.Name.LocalName == "TitleBarTitle")?.Value ?? "";
        var titleText = new TextBlock
        {
            Text = title,
            Foreground = Brushes.White,
            FontSize = 15,
            FontWeight = FontWeight.SemiBold,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
        };

        // Title-bar icon (left) — only shown when a TitleBarIcon is set and resolvable.
        Image? icon = null;
        var iconImage = TryLoadTitleBarIcon(root, projectPath);
        if (iconImage is not null)
        {
            icon = new Image
            {
                Source = iconImage,
                Width = 26,
                Height = 26,
                Margin = new Thickness(12, 0, 10, 0),
                HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Center,
            };
        }

        // Caption buttons (min / max / close) on the right — static stand-ins; the real
        // window behaviour (minimize/maximize/close) is provided by the runtime ChromeWindow.
        var buttons = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Top,
            Children = { CaptionButton("\u2013"), CaptionButton("\u25A1"), CaptionButton("\u2715") },
        };

        var titleBarInner = new Grid { Children = { titleText, buttons } };
        if (icon is not null) titleBarInner.Children.Add(icon);

        var titleBar = new Border
        {
            Height = 44,
            Background = new SolidColorBrush(Color.Parse("#0E2138")),
            BorderBrush = new SolidColorBrush(Color.Parse("#081527")),
            BorderThickness = new Thickness(0, 0, 0, 1),
            Child = titleBarInner,
        };
        var grid = new Grid
        {
            RowDefinitions =
            {
                new RowDefinition(GridLength.Auto),
                new RowDefinition(GridLength.Star),
            },
            Children = { titleBar, body },
        };
        Grid.SetRow(titleBar, 0);
        Grid.SetRow(body, 1);
        return grid;
    }

    /// <summary>Static look-alike of the runtime ChromeWindow caption button (42x44, transparent
    /// background, white glyph) — purely decorative in the preview.</summary>
    private static Button CaptionButton(string content)
    {
        return new Button
        {
            Content = content,
            Background = Brushes.Transparent,
            Foreground = Brushes.White,
            BorderThickness = new Thickness(0),
            CornerRadius = new CornerRadius(0),
            Width = 42,
            Height = 44,
            VerticalAlignment = VerticalAlignment.Center,
            FontSize = 13,
        };
    }

    /// <summary>Resolves the TitleBarIcon attribute to a loadable image, or null. Supports an
    /// absolute/relative file path, a rooted path like /Assets/x.png, or an avares://Project/…
    /// URI resolved against the user project's root (passed in with the render request).</summary>
    private static IImage? TryLoadTitleBarIcon(XElement root, string? projectPath)
    {
        var spec = root.Attributes().FirstOrDefault(a => a.Name.LocalName == "TitleBarIcon")?.Value?.Trim();
        if (string.IsNullOrEmpty(spec)) return null;
        var full = ResolveAssetPath(spec, projectPath);
        if (full is null || !File.Exists(full)) return null;
        try { return new Bitmap(full); }
        catch { return null; }
    }

    private static string? ResolveAssetPath(string spec, string? projectPath)
    {
        if (spec.StartsWith("avares://", StringComparison.OrdinalIgnoreCase))
        {
            if (string.IsNullOrEmpty(projectPath)) return null;
            var rest = spec.Substring("avares://".Length);
            var slash = rest.IndexOf('/');
            if (slash < 0) return null;
            var rel = rest.Substring(slash + 1).Replace('/', Path.DirectorySeparatorChar);
            return Path.Combine(projectPath, rel);
        }
        if (spec.StartsWith("/"))
        {
            if (string.IsNullOrEmpty(projectPath)) return null;
            return Path.Combine(projectPath, spec.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
        }
        if (Path.IsPathRooted(spec)) return spec;
        if (string.IsNullOrEmpty(projectPath)) return null;
        return Path.Combine(projectPath, spec);
    }

    /// <summary>Re-injects resolved bitmaps into body &lt;Image&gt; controls whose Source is an
    /// avares://Project/… URI (or path) that the host's asset loader can't resolve. Works for both
    /// the full-fidelity runtime loader and the programmatic fallback, because x:Name becomes the
    /// control's Name in either path.</summary>
    private static void ApplyImageSources(Window window, string xaml, string? projectPath)
    {
        if (string.IsNullOrEmpty(projectPath)) return;
        Dictionary<string, Bitmap>? map = null;
        try
        {
            var doc = XDocument.Parse(xaml);
            map = ScanImageSources(doc, projectPath);
        }
        catch { return; }
        if (map is null || map.Count == 0) return;

        foreach (var desc in window.GetVisualDescendants())
        {
            if (desc is not Image img || string.IsNullOrEmpty(img.Name)) continue;
            if (map.TryGetValue(img.Name!, out var bmp)) img.Source = bmp;
        }
    }

    private static Dictionary<string, Bitmap> ScanImageSources(XDocument doc, string projectPath)
    {
        var map = new Dictionary<string, Bitmap>(StringComparer.Ordinal);
        foreach (var el in doc.Descendants())
        {
            if (!string.Equals(el.Name.LocalName, "Image", StringComparison.OrdinalIgnoreCase)) continue;
            var name = el.Attributes().FirstOrDefault(a => a.Name.LocalName == "Name")?.Value?.Trim();
            var src = el.Attributes().FirstOrDefault(a => a.Name.LocalName == "Source")?.Value?.Trim();
            if (string.IsNullOrEmpty(name) || string.IsNullOrEmpty(src)) continue;
            var full = ResolveAssetPath(src, projectPath);
            if (full is null || !File.Exists(full)) continue;
            try { map[name!] = new Bitmap(full); }
            catch { /* skip this image */ }
        }
        return map;
    }

    private static Panel? TryCreatePanel(XElement elem)
    {
        var t = ControlFactory.GetTypeForName(elem.Name.LocalName);
        if (t is null || !typeof(Panel).IsAssignableFrom(t)) return null;

        var panel = (Panel)Activator.CreateInstance(t)!;
        foreach (var attr in elem.Attributes())
        {
            if (attr.Name.LocalName.StartsWith("xmlns")) continue;
            ApplyProperty(panel, attr.Name.LocalName, attr.Value);
        }

        foreach (var child in elem.Elements())
        {
            if (child.Name.LocalName.StartsWith("xmlns")) continue;
            var ctrl = CreateControlFromElement(child);
            if (ctrl is not null) panel.Children.Add(ctrl);
        }

        return panel;
    }

    private static Control? CreateControlFromElement(XElement elem)
    {
        var t = ControlFactory.GetTypeForName(elem.Name.LocalName);
        if (t is null) return null;

        var ctrl = (Control)Activator.CreateInstance(t)!;

        // Resolve an Image's Source at creation time (not only after layout). Setting the source
        // during the build means the Grid measures/arranges the Image with its bitmap present from
        // the start; a source injected after the first layout can leave a Grid-cell Image arranged
        // at 0×0 in the headless preview.
        if (ctrl is Image image)
        {
            var srcAttr = elem.Attributes().FirstOrDefault(a => a.Name.LocalName == "Source")?.Value?.Trim();
            if (!string.IsNullOrEmpty(srcAttr))
            {
                var full = ResolveAssetPath(srcAttr, CurrentProjectPath);
                if (full is not null && File.Exists(full))
                {
                    try { image.Source = new Bitmap(full); }
                    catch { /* keep the (null) source */ }
                }
            }
        }

        // Preview mirror of the designer's compact ListBox snippet: the Fluent ListBoxItem
        // template forces a ~41px row regardless of font, so shrink the default so rows
        // auto-size to the content. Explicit XAML attributes (MinHeight/Padding/FontSize)
        // applied below win over these defaults.
        if (ctrl is ListBoxItem listBoxItem)
        {
            listBoxItem.MinHeight = 0;
            listBoxItem.Padding = new Thickness(4, 1, 4, 1);
        }

        // A <X.RenderTransform><RotateTransform Angle="…"/></X.RenderTransform> PROPERTY element
        // would otherwise be dropped by the programmatic builder (not in the type map), so the
        // preview wouldn't show the designer's "Rotate" property. Apply the rotation here.
        // RenderTransform rotates the DRAWN visual only (layout Bounds stay put) — CollectControls
        // reports the rotated bounding box so the selection outline matches the rotated control.
        foreach (var prop in elem.Elements())
        {
            if (!prop.Name.LocalName.EndsWith(".RenderTransform", StringComparison.Ordinal)) continue;
            foreach (var tf in prop.Elements())
            {
                if (tf.Name.LocalName != "RotateTransform") continue;
                var ang = tf.Attributes().FirstOrDefault(a => a.Name.LocalName == "Angle")?.Value;
                if (double.TryParse(ang, NumberStyles.Float, CultureInfo.InvariantCulture, out var angle)
                    && ctrl is Visual vis)
                {
                    vis.RenderTransform = new RotateTransform(angle);
                }
            }
        }

        // A Grid's <Grid.RowDefinitions>/<Grid.ColumnDefinitions> are PROPERTY elements, which
        // the programmatic builder otherwise drops — leaving a trivial 1x1 grid where children
        // stack in cell 0,0 and native ShowGridLines has no definitions to draw. Parse them so
        // the preview matches the real layout (and grid lines render).
        if (ctrl is Grid grid)
        {
            foreach (var defs in elem.Elements())
            {
                var defsName = defs.Name.LocalName;
                if (defsName == "Grid.RowDefinitions")
                {
                    foreach (var rd in defs.Elements())
                    {
                        var h = rd.Attributes().FirstOrDefault(a => a.Name.LocalName == "Height")?.Value;
                        grid.RowDefinitions.Add(new RowDefinition { Height = ParseGridLength(h) });
                    }
                }
                else if (defsName == "Grid.ColumnDefinitions")
                {
                    foreach (var cd in defs.Elements())
                    {
                        var w = cd.Attributes().FirstOrDefault(a => a.Name.LocalName == "Width")?.Value;
                        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = ParseGridLength(w) });
                    }
                }
            }
        }

        foreach (var attr in elem.Attributes())
        {
            if (attr.Name.LocalName.StartsWith("xmlns")) continue;
            ApplyProperty(ctrl, attr.Name.LocalName, attr.Value);
        }

        // Recurse into child elements so controls nested inside panels (e.g. a
        // Canvas inside a StackPanel) are created too — otherwise they vanish from
        // the preview. Property elements (Foo.Bar) are skipped by the type map.
        if (ctrl is Panel panel)
        {
            foreach (var child in elem.Elements())
            {
                if (child.Name.LocalName.StartsWith("xmlns")) continue;
                var c = CreateControlFromElement(child);
                if (c is not null) panel.Children.Add(c);
            }
        }
        // Also recurse into single-content containers (Border / ContentControl), so
        // e.g. a TextBlock inside a StatusBar Border shows up in the preview.
        else if (ctrl is ContentControl contentControl)
        {
            foreach (var child in elem.Elements())
            {
                if (child.Name.LocalName.StartsWith("xmlns")) continue;
                var c = CreateControlFromElement(child);
                if (c is not null) { contentControl.Content = c; break; }
            }
        }
        // Recurse into item-control children (e.g. TabItem inside TabControl),
        // so the tabs appear in the preview instead of the control being empty.
        else if (ctrl is ItemsControl itemsControl)
        {
            foreach (var child in elem.Elements())
            {
                if (child.Name.LocalName.StartsWith("xmlns")) continue;
                var c = CreateControlFromElement(child);
                if (c is not null) itemsControl.Items.Add(c);
            }
        }
        else if (ctrl is Decorator decorator)
        {
            foreach (var child in elem.Elements())
            {
                if (child.Name.LocalName.StartsWith("xmlns")) continue;
                var c = CreateControlFromElement(child);
                if (c is not null) { decorator.Child = c; break; }
            }
        }

        // Selection must be applied AFTER items are added: setting SelectedIndex on an empty
        // Selector (TabControl / ListBox / ComboBox) is ignored/reset when its items are
        // populated, so the selected tab's content would not render otherwise.
        var selAttr = elem.Attributes().FirstOrDefault(a => a.Name.LocalName == "SelectedIndex");
        if (selAttr is not null && ctrl is SelectingItemsControl)
        {
            ApplyProperty(ctrl, "SelectedIndex", selAttr.Value);
        }
        return ctrl;
    }

    private static void ApplyProperty(object target, string propName, string value)
    {
        if (target is null || string.IsNullOrEmpty(value)) return;

        if (target is Control ctrl)
        {
            if (propName is "Canvas.Left" or "Canvas.Right")
            {
                if (double.TryParse(value, out var d)) Canvas.SetLeft(ctrl, d);
                return;
            }
            if (propName is "Canvas.Top" or "Canvas.Bottom")
            {
                if (double.TryParse(value, out var d)) Canvas.SetTop(ctrl, d);
                return;
            }
            if (propName is "DockPanel.Dock" && Enum.TryParse<Dock>(value, true, out var dock))
            {
                DockPanel.SetDock(ctrl, dock);
                return;
            }
            // Grid cell placement (attached properties). The runtime loader handles these, but the
            // programmatic fallback must too, or every Grid child lands in cell 0,0.
            if (propName is "Grid.Row" or "Grid.Column" or "Grid.RowSpan" or "Grid.ColumnSpan")
            {
                if (int.TryParse(value, out var n))
                {
                    if (propName == "Grid.Row") Grid.SetRow(ctrl, n);
                    else if (propName == "Grid.Column") Grid.SetColumn(ctrl, n);
                    else if (propName == "Grid.RowSpan") Grid.SetRowSpan(ctrl, n);
                    else Grid.SetColumnSpan(ctrl, n);
                }
                return;
            }
        }

        if (propName.StartsWith("xmlns")) return;
        if (propName.StartsWith("x:"))
        {
            var local = propName.Substring(2);
            if (local is "Class" or "Uid" or "Name" or "FieldModifier" or "Key") return;
            propName = local;
        }

        var prop = target.GetType().GetProperty(propName, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
        if (prop is null || !prop.CanWrite) return;

        var converted = ConvertValue(value, prop.PropertyType);
        try { prop.SetValue(target, converted); }
        catch { /* ignore individual property failures */ }
    }

    private static object? ConvertValue(string value, Type targetType)
    {
        if (targetType == typeof(string)) return value;
        if (targetType == typeof(double) || targetType == typeof(double?))
            return double.TryParse(value, out var d) ? d : 0.0;
        if (targetType == typeof(int) || targetType == typeof(int?))
            return int.TryParse(value, out var i) ? i : 0;
        if (targetType == typeof(bool) || targetType == typeof(bool?))
            return bool.TryParse(value, out var b) && b;
        if (targetType.IsEnum)
        {
            try { return Enum.Parse(targetType, value, true); }
            catch { return Enum.ToObject(targetType, 0); }
        }

        var tn = targetType.FullName;
        if (tn == "Avalonia.GridLength")
        {
            return ParseGridLength(value);
        }
        if (tn == "Avalonia.Thickness")
        {
            try { return Thickness.Parse(value); } catch { return new Thickness(0); }
        }
        if (tn == "Avalonia.Point")
        {
            // Line StartPoint/EndPoint ("x,y") — the programmatic builder would otherwise drop
            // them (a Point property can't take a raw string), so the preview wouldn't draw lines.
            try { return Avalonia.Point.Parse(value); } catch { return new Point(0, 0); }
        }
        if (tn is "Avalonia.Media.IBrush" or "Avalonia.Media.Brush" or "Avalonia.Media.ISolidColorBrush")
        {
            try { return Brush.Parse(value); } catch { return Brushes.White; }
        }
        if (tn == "Avalonia.Media.FontFamily")
        {
            try { return FontFamily.Parse(value); } catch { return null; }
        }
        return value;
    }

    /// <summary>Parses a XAML GridLength ('Auto', '*', '2*', '100', ...) for a row/column definition.</summary>
    private static GridLength ParseGridLength(string? s)
    {
        s = s?.Trim() ?? "";
        if (s.Equals("Auto", StringComparison.OrdinalIgnoreCase)) return GridLength.Auto;
        if (s.EndsWith("*", StringComparison.OrdinalIgnoreCase))
        {
            var num = s.Substring(0, s.Length - 1).Trim();
            if (double.TryParse(num, NumberStyles.Float, CultureInfo.InvariantCulture, out var v))
                return new GridLength(v, GridUnitType.Star);
            return new GridLength(1, GridUnitType.Star);
        }
        if (double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var px))
            return new GridLength(px, GridUnitType.Pixel);
        return GridLength.Star;
    }

    /// <summary>Walks the logical tree in declaration order so the extension can map indices to its DOM.</summary>
    private static void CollectControls(Window window, FrameResult result)
    {
        var list = result.Controls;
        // A realized TabControl surfaces its selected tab's content twice in the logical tree
        // (once as the TabItem's Content, once through the content presenter), so the same
        // DockPanel/Canvas can be visited twice. Design names are unique, so report each named
        // control exactly once — otherwise the Properties control drop-down shows duplicates.
        var seen = new HashSet<string>(StringComparer.Ordinal);
        int index = 0;

        void Walk(ILogical node, string? parentName)
        {
            if (node is Control c)
            {
                var name = c.Name;
                if (string.IsNullOrEmpty(name) || seen.Add(name))
                {
                    // The control's extent in window space. RenderTransform rotates the DRAWN visual
                    // but not the layout Bounds, so for a rotated control report the axis-aligned
                    // bounding box of its transformed corners — that is what the selection outline
                    // should surround (it matches the rotated image instead of the un-rotated box).
                    var x = 0.0;
                    var y = 0.0;
                    var w = c.Bounds.Width;
                    var h = c.Bounds.Height;
                    var m = c.TransformToVisual(window);
                    if (m is { } mat && !mat.IsIdentity)
                    {
                        // c.Bounds is in the PARENT's space; TransformToVisual expects LOCAL coords
                        // (origin 0), so transform the local rect's corners (0,0,Width,Height).
                        var r = new Rect(0, 0, c.Bounds.Width, c.Bounds.Height);
                        var corners = new[] { r.TopLeft, r.TopRight, r.BottomLeft, r.BottomRight }
                            .Select(p => mat.Transform(p)).ToArray();
                        var minX = corners.Min(p => p.X);
                        var maxX = corners.Max(p => p.X);
                        var minY = corners.Min(p => p.Y);
                        var maxY = corners.Max(p => p.Y);
                        x = minX; y = minY; w = maxX - minX; h = maxY - minY;
                    }
                    else
                    {
                        var pt = c.TranslatePoint(new Point(0, 0), window);
                        x = pt?.X ?? 0; y = pt?.Y ?? 0;
                    }
                    list.Add(new ControlInfo
                    {
                        Index = index,
                        Name = name,
                        Type = c.GetType().Name,
                        X = x,
                        Y = y,
                        Width = w,
                        Height = h,
                        Values = EffectiveValues(c),
                        Parent = parentName
                    });
                    // Report a named Grid's cell boundaries so the webview can drag children
                    // between cells (drag-to-re-cell).
                    if (c is Grid grid && !string.IsNullOrEmpty(name))
                        result.GridCells[name!] = GridCellsOf(grid, window);
                }
                index++;
            }
            // A control's children have it as their direct parent. An UNNAMED parent reports null
            // so its children are NOT treated as direct Grid children (drag-to-re-cell only applies
            // to controls whose direct parent is the Grid).
            var childParent = (node as Control)?.Name;
            if (string.IsNullOrEmpty(childParent)) childParent = null;
            foreach (var child in node.LogicalChildren)
                Walk(child, childParent);
        }

        Walk(window, null);
    }

    /// <summary>A Grid's column/row boundary positions (window coords): length = columns/rows + 1,
    /// covering the whole grid even when it has no definitions (a single cell).
    /// NOTE: Avalonia's DefinitionBase.FinalOffset[i] (i ≥ 1) is the boundary AFTER definition
    /// i-1 (FinalOffset[0] is a degenerate value), so the boundaries are 0, FinalOffset[1..n-1], size.</summary>
    private static GridCellInfo GridCellsOf(Grid grid, Window window)
    {
        var info = new GridCellInfo();
        int cols = Math.Max(1, grid.ColumnDefinitions.Count);
        int rows = Math.Max(1, grid.RowDefinitions.Count);
        for (int i = 0; i <= cols; i++)
        {
            double off = i == 0 ? 0 : i == cols ? grid.Bounds.Width : DefinitionOffset(grid.ColumnDefinitions[i]);
            var pt = grid.TranslatePoint(new Point(off, 0), window);
            info.V.Add(pt?.X ?? grid.Bounds.X + off);
        }
        for (int i = 0; i <= rows; i++)
        {
            double off = i == 0 ? 0 : i == rows ? grid.Bounds.Height : DefinitionOffset(grid.RowDefinitions[i]);
            var pt = grid.TranslatePoint(new Point(0, off), window);
            info.H.Add(pt?.Y ?? grid.Bounds.Y + off);
        }
        return info;
    }

    /// <summary>Reads the (internal) DefinitionBase.FinalOffset — the laid-out left/top edge of a
    /// row/column — via reflection, since it isn't public in Avalonia 11.0.10.</summary>
    private static readonly PropertyInfo? FinalOffsetProp =
        typeof(DefinitionBase).GetProperty("FinalOffset", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);

    private static double DefinitionOffset(DefinitionBase def)
    {
        try { return FinalOffsetProp?.GetValue(def) is double d ? d : 0; }
        catch { return 0; }
    }

    /// <summary>Reads a control's effective (theme-resolved) design property values so the
    /// Properties panel can show the current value even when the XAML attribute is unset.</summary>
    private static Dictionary<string, string>? EffectiveValues(Control c)
    {
        var d = new Dictionary<string, string>();
        void Add(string key, string? value)
        {
            if (!string.IsNullOrEmpty(value)) d[key] = value;
        }

        Add("Width", Math.Round(c.Bounds.Width).ToString(CultureInfo.InvariantCulture));
        Add("Height", Math.Round(c.Bounds.Height).ToString(CultureInfo.InvariantCulture));
        Add("Margin", c.Margin.ToString());

        // FontFamily / FontSize / Background / Foreground are not on every Control (they live
        // on TemplatedControl / TextElement), so read them via reflection when present; likewise
        // Padding / BorderThickness / CornerRadius / BorderBrush.
        AddViaReflection("FontFamily", v => (v as FontFamily)?.Name);
        AddViaReflection("FontSize", v => ((double?)v)?.ToString(CultureInfo.InvariantCulture));
        AddViaReflection("Background", BrushToHex);
        AddViaReflection("Foreground", BrushToHex);
        AddViaReflection("CaretBrush", BrushToHex);
        AddViaReflection("SelectionBrush", BrushToHex);
        AddViaReflection("Padding");
        AddViaReflection("BorderThickness");
        AddViaReflection("CornerRadius");
        AddViaReflection("BorderBrush");

        return d.Count > 0 ? d : null;

        void AddViaReflection(string name, Func<object?, string?>? convert = null)
        {
            var p = c.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance);
            if (p is not null && p.GetIndexParameters().Length == 0)
            {
                try
                {
                    var v = p.GetValue(c);
                    Add(name, convert != null ? convert(v) : v?.ToString());
                }
                catch { /* ignore */ }
            }
        }
    }

    private static string? BrushToHex(object? brush)
    {
        return brush is ISolidColorBrush s ? s.Color.ToString() : null;
    }

    /// <summary>Renders a friendly error card instead of crashing (e.g. unresolved custom types).</summary>
    private FrameResult RenderError(Exception ex, double w, double h)
    {
        try
        {
            var window = new Window { Width = w, Height = h, Title = "Designer error" };
            var tb = new TextBlock
            {
                Text = "Avalonia Designer could not render this XAML.\n\n" + ex.Message,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(16),
                Foreground = Brushes.Maroon
            };
            window.Content = new Border { Background = Brushes.White, Child = tb };
            window.ApplyTemplate();

            var finalSize = new Size(w, h);
            window.Measure(finalSize);
            window.Arrange(new Rect(new Point(0, 0), finalSize));

            var rtb = new RenderTargetBitmap(new PixelSize((int)w, (int)h), new Vector(96, 96));
            rtb.Render(window);

            using var ms = new MemoryStream();
            rtb.Save(ms);
            window.Close();
            return new FrameResult { PngBase64 = Convert.ToBase64String(ms.ToArray()), Width = w, Height = h, Error = ex.Message };
        }
        catch
        {
            return new FrameResult { Width = w, Height = h, Error = ex.Message };
        }
    }
}
