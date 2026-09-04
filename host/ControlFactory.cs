using System;
using System.Collections.Generic;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Controls.Shapes;

namespace PreviewerHost;

public class ControlSnippet
{
    public string Name { get; set; } = "";
    public string Xaml { get; set; } = "";
}

/// <summary>Generates default XAML snippets for toolbox controls with unique generated names.</summary>
public class ControlFactory
{
    private readonly Dictionary<string, Func<string, string>> _templates;
    private readonly Dictionary<string, int> _counters = new(StringComparer.OrdinalIgnoreCase);

    public ControlFactory()
    {
        _templates = new Dictionary<string, Func<string, string>>(StringComparer.OrdinalIgnoreCase)
        {
            ["Button"] = n => $"<Button x:Name=\"{n}\" Content=\"{n}\" Width=\"120\" Height=\"32\"/>",
            ["TextBox"] = n => $"<TextBox x:Name=\"{n}\" Text=\"Text\" Width=\"120\" Height=\"24\"/>",
            ["TextBlock"] = n => $"<TextBlock x:Name=\"{n}\" Text=\"{n}\" Margin=\"4\"/>",
            ["ComboBox"] = n => $"<ComboBox x:Name=\"{n}\" Width=\"120\" Height=\"24\"/>",
            // Placed EMPTY (no auto items). A compact ListBoxItem style makes the rows
            // auto-size to the font (the Fluent default item is ~41px tall); the preview host
            // mirrors this sizing for ListBoxItems in the programmatic path.
            ["ListBox"] = n => $"<ListBox x:Name=\"{n}\" Width=\"140\" Height=\"120\">\n    <ListBox.Styles>\n        <Style Selector=\"ListBoxItem\">\n            <Setter Property=\"MinHeight\" Value=\"0\"/>\n            <Setter Property=\"Padding\" Value=\"4,1,4,1\"/>\n        </Style>\n    </ListBox.Styles>\n</ListBox>",
            // ItemsControl: direct children are items (no selection, unlike ListBox). Starter
            // items keep it visible in the preview; the host adds children via Items.Add.
            ["ItemsControl"] = n => $"<ItemsControl x:Name=\"{n}\" Width=\"140\" Height=\"120\">\n    <TextBlock Text=\"Item 1\"/>\n    <TextBlock Text=\"Item 2\"/>\n    <TextBlock Text=\"Item 3\"/>\n</ItemsControl>",
            ["UniformGrid"] = n => $"<UniformGrid x:Name=\"{n}\" Width=\"160\" Height=\"120\"/>",
            ["CheckBox"] = n => $"<CheckBox x:Name=\"{n}\" Content=\"CheckBox\"/>",
            ["RadioButton"] = n => $"<RadioButton x:Name=\"{n}\" Content=\"RadioButton\"/>",
            ["Image"] = n => $"<Image x:Name=\"{n}\" Width=\"100\" Height=\"100\" Stretch=\"Uniform\"/>",
            ["Panel"] = n => $"<Panel x:Name=\"{n}\" Width=\"120\" Height=\"80\"/>",
            ["Grid"] = n => $"<Grid x:Name=\"{n}\" Width=\"160\" Height=\"120\"/>",
            ["StackPanel"] = n => $"<StackPanel x:Name=\"{n}\" Width=\"160\" Height=\"120\"/>",
            ["DockPanel"] = n => $"<DockPanel x:Name=\"{n}\" Width=\"160\" Height=\"120\"/>",
            ["WrapPanel"] = n => $"<WrapPanel x:Name=\"{n}\" Width=\"160\" Height=\"120\"/>",
            // Ship every TabControl with a visible, fillable body (DockPanel + Canvas) inside
            // its first TabItem, mirroring the blank template. Without it the tab's content
            // area is empty/invisible in the preview, so the user can't click it to place
            // controls. (New tabs added via the Properties panel get the same body.)
            ["TabControl"] = n => $"<TabControl x:Name=\"{n}\" Width=\"240\" Height=\"160\">\n    <TabItem Header=\"Page 1\">\n        <DockPanel x:Name=\"{n}Body1\">\n            <Canvas x:Name=\"{n}Body1Canvas\"/>\n        </DockPanel>\n    </TabItem>\n</TabControl>",
            // DataGrid lives in its own assembly (Avalonia.Controls.DataGrid): a bare <DataGrid>
            // doesn't resolve in Avalonia 12 XAML, so the snippet uses the `dg` prefix. The
            // extension adds xmlns:dg="using:Avalonia.Controls" to the root when placing it.
            // AutoGenerateColumns defaults to FALSE in Avalonia, so set it explicitly or a bound
            // DataGrid shows no columns/headers/rows. (The host's programmatic builder maps by
            // LocalName, so it still renders.)
            ["DataGrid"] = n => $"<dg:DataGrid x:Name=\"{n}\" AutoGenerateColumns=\"True\" Width=\"240\" Height=\"160\"/>",
            ["Menu"] = n => $"<Menu x:Name=\"{n}\" DockPanel.Dock=\"Top\" Height=\"24\">\n    <MenuItem Header=\"File\"/>\n</Menu>",
            // A real status bar pattern: a DOCKPANEL strip (docked Bottom) that holds status
            // items (labels / buttons / a clock). Items are pinned LEFT or RIGHT via
            // DockPanel.Dock and stretch to the bar's height automatically. Children are added/
            // managed with the designer's 'Status Items' editor. LastChildFill=False so docked
            // items keep their edge and the middle stays empty.
            ["StatusBar"] = n => $"<DockPanel x:Name=\"{n}\" DockPanel.Dock=\"Bottom\" Height=\"24\" LastChildFill=\"False\">\n    <TextBlock Text=\"Ready\" VerticalAlignment=\"Center\" HorizontalAlignment=\"Left\"/>\n</DockPanel>",
            // SplitPanel: a resizable multi-pane container — an Avalonia Grid whose panes are
            // Borders (each with a settable border + an empty Canvas body to drop controls into)
            // separated by runtime-draggable GridSplitters (Auto columns). Star panes resize with
            // the form. Default: 2 panes side-by-side.
            ["SplitPanel"] = n => $"<Grid x:Name=\"{n}\" Width=\"360\" Height=\"240\" ColumnDefinitions=\"*,5,*\">\n    <Border Grid.Column=\"0\" BorderBrush=\"#808080\" BorderThickness=\"1\">\n        <Canvas x:Name=\"{n}Pane0\"/>\n    </Border>\n    <GridSplitter Grid.Column=\"1\" Width=\"5\" ResizeDirection=\"Columns\" Background=\"#B0B0B0\"/>\n    <Border Grid.Column=\"2\" BorderBrush=\"#808080\" BorderThickness=\"1\">\n        <Canvas x:Name=\"{n}Pane1\"/>\n    </Border>\n</Grid>",
            // StatusDate: a TextBlock turned into a live date/time display. The snippet embeds the
            // current time (so the preview shows a placeholder) and a Loaded event whose code-behind
            // handler starts a per-second timer that keeps the text current at runtime.
            ["StatusDate"] = n => $"<TextBlock x:Name=\"{n}\" Text=\"{DateTime.Now:G}\" FontSize=\"14\" Loaded=\"{n}_Loaded\"/>",
            // --- Shapes (transparent fill + black 1px outline by default) ---
            // A Line is defined by its START/END points in its own coordinate space; it has NO
            // Width/Height — its size IS the geometry (0,0 → EndPoint), so the selection box
            // matches the drawn line. The designer stretches it by scaling the points (see
            // XamlModel.resizeLine); the panel exposes the points as editable Start/End.
            // ZIndex="-1" makes shapes render BEHIND other controls by default (Send to Back) —
            // both in the preview and at runtime; set Z-Index to 0 or higher to bring one forward.
            ["Line"] = n => $"<Line x:Name=\"{n}\" StartPoint=\"0,0\" EndPoint=\"120,80\" Stroke=\"Black\" StrokeThickness=\"1\" ZIndex=\"-1\"/>",
            ["Rectangle"] = n => $"<Rectangle x:Name=\"{n}\" Width=\"120\" Height=\"80\" Fill=\"Transparent\" Stroke=\"Black\" StrokeThickness=\"1\" ZIndex=\"-1\"/>",
            ["Ellipse"] = n => $"<Ellipse x:Name=\"{n}\" Width=\"100\" Height=\"100\" Fill=\"Transparent\" Stroke=\"Black\" StrokeThickness=\"1\" ZIndex=\"-1\"/>",
            // Arc is stroked only (no fill); StartAngle/SweepAngle (degrees) sweep inside its box.
            ["Arc"] = n => $"<Arc x:Name=\"{n}\" Width=\"100\" Height=\"100\" StartAngle=\"0\" SweepAngle=\"270\" Stroke=\"Black\" StrokeThickness=\"1\" ZIndex=\"-1\"/>"
        };
    }

    public ControlSnippet Create(string tag)
    {
        tag = tag.Trim();
        var name = $"{tag}{NextCounter(tag)}";
        if (_templates.TryGetValue(tag, out var tpl))
            return new ControlSnippet { Name = name, Xaml = tpl(name) };
        return new ControlSnippet { Name = name, Xaml = $"<{tag} x:Name=\"{name}\"/>" };
    }

    private int NextCounter(string tag)
    {
        _counters.TryGetValue(tag, out var c);
        _counters[tag] = c + 1;
        return c + 1;
    }

    /// <summary>Type map used by the programmatic XAML fallback builder.</summary>
    private static readonly Dictionary<string, Type> TypeMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Button"] = typeof(Button),
        ["TextBox"] = typeof(TextBox),
        ["TextBlock"] = typeof(TextBlock),
        ["ComboBox"] = typeof(ComboBox),
        ["ListBox"] = typeof(ListBox),
        ["ListBoxItem"] = typeof(ListBoxItem),
        ["ItemsControl"] = typeof(ItemsControl),
        ["CheckBox"] = typeof(CheckBox),
        ["RadioButton"] = typeof(RadioButton),
        ["Image"] = typeof(Image),
        ["Panel"] = typeof(Panel),
        ["Grid"] = typeof(Grid),
        ["GridSplitter"] = typeof(GridSplitter),
        ["UniformGrid"] = typeof(UniformGrid),
        ["StackPanel"] = typeof(StackPanel),
        ["DockPanel"] = typeof(DockPanel),
        ["WrapPanel"] = typeof(WrapPanel),
        ["TabControl"] = typeof(TabControl),
        ["TabItem"] = typeof(TabItem),
        ["DataGrid"] = typeof(DataGrid),
        ["Menu"] = typeof(Menu),
        ["Border"] = typeof(Border),
        ["ScrollViewer"] = typeof(ScrollViewer),
        ["Canvas"] = typeof(Canvas),
        ["UserControl"] = typeof(UserControl),
        ["Window"] = typeof(Window),
        ["Line"] = typeof(Line),
        ["Rectangle"] = typeof(Rectangle),
        ["Ellipse"] = typeof(Ellipse),
        ["Arc"] = typeof(Arc)
    };

    public static Type? GetTypeForName(string name)
    {
        TypeMap.TryGetValue(name, out var t);
        return t;
    }
}
