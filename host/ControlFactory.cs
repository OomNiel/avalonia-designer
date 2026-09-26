using System;
using System.Collections.Generic;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Controls.Shapes;
using AvaloniaChrome;

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
            // TreeView ships with two starter nodes so the drop is immediately visible and clickable —
            // an empty one is a blank box. `Header` (not `Content`) is what a TreeViewItem displays, and
            // a node's children are its literal child items. ItemsSource and literal children are
            // mutually exclusive, exactly like the ComboBox/ListBox rule the Properties panel enforces.
            ["TreeView"] = n => $"<TreeView x:Name=\"{n}\" Width=\"180\" Height=\"140\">\n    <TreeViewItem Header=\"Item 1\" IsExpanded=\"True\">\n        <TreeViewItem Header=\"Item 1.1\"/>\n    </TreeViewItem>\n    <TreeViewItem Header=\"Item 2\"/>\n</TreeView>",
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
            // SplitPanel: a resizable multi-pane container. Default = the 3-zone layout: a Border
            // (the SplitPanel's own frame/border — clicking it selects the whole panel) wrapping a
            // Grid whose panes are Borders (each with a settable border + an empty Canvas body to
            // drop controls into). Row 0 holds Pane0 | Pane1 side-by-side (split by a vertical
            // GridSplitter in Auto column 1); row 2 is Pane2 spanning all columns below (split by
            // a horizontal GridSplitter in Auto row 1). The 3*/2* rows default to a 60/40 top/bottom
            // split; star panes flex so the whole panel auto-resizes with its container. GridSplitters
            // are runtime-draggable; at design time a pane's Width/Height sets the divider position
            // (0 collapses/hides the pane). The generic 'Split Layout' editor can convert this to a
            // pure Columns/Rows arrangement.
            ["SplitPanel"] = n => $"<Border x:Name=\"{n}\" Width=\"480\" Height=\"300\" BorderBrush=\"#909090\" BorderThickness=\"2\" Padding=\"1\" Background=\"#E6E6E6\">\n    <Grid>\n        <Grid.ColumnDefinitions>\n            <ColumnDefinition Width=\"*\"/>\n            <ColumnDefinition Width=\"Auto\"/>\n            <ColumnDefinition Width=\"*\"/>\n        </Grid.ColumnDefinitions>\n        <Grid.RowDefinitions>\n            <RowDefinition Height=\"3*\"/>\n            <RowDefinition Height=\"Auto\"/>\n            <RowDefinition Height=\"2*\"/>\n        </Grid.RowDefinitions>\n        <Border Grid.Row=\"0\" Grid.Column=\"0\" Background=\"White\" BorderBrush=\"#808080\" BorderThickness=\"1\">\n            <Canvas x:Name=\"{n}Pane0\"/>\n        </Border>\n        <GridSplitter Grid.Row=\"0\" Grid.Column=\"1\" Width=\"5\" MinWidth=\"1\" MinHeight=\"1\" ResizeDirection=\"Columns\" Background=\"#C0C0C0\"/>\n        <Border Grid.Row=\"0\" Grid.Column=\"2\" Background=\"White\" BorderBrush=\"#808080\" BorderThickness=\"1\">\n            <Canvas x:Name=\"{n}Pane1\"/>\n        </Border>\n        <GridSplitter Grid.Row=\"1\" Grid.Column=\"0\" Grid.ColumnSpan=\"3\" Height=\"5\" MinWidth=\"1\" MinHeight=\"1\" ResizeDirection=\"Rows\" Background=\"#C0C0C0\"/>\n        <Border Grid.Row=\"2\" Grid.Column=\"0\" Grid.ColumnSpan=\"3\" Background=\"White\" BorderBrush=\"#808080\" BorderThickness=\"1\">\n            <Canvas x:Name=\"{n}Pane2\"/>\n        </Border>\n    </Grid>\n</Border>",
            // StatusDate: a TextBlock turned into a live date/time display. The snippet embeds the
            // current time (so the preview shows a placeholder) and a Loaded event whose code-behind
            // handler starts a per-second timer that keeps the text current at runtime.
            ["StatusDate"] = n => $"<TextBlock x:Name=\"{n}\" Text=\"{DateTime.Now:G}\" FontSize=\"14\" Loaded=\"{n}_Loaded\"/>",
            // XYTracker (Dev Helpers): a TextBlock that reports the live WxH (pixels) of its
            // container — or, when placed in a Status Bar, of the whole form. The Classes="XYTracker"
            // marks it so the Status Items editor / status-kind detection can tell it apart from a
            // StatusDate (which is also a TextBlock with a Loaded handler). The code-behind handler
            // (insertXyTrackerClock) keeps the text current on a short timer.
            ["XYTracker"] = n => $"<TextBlock x:Name=\"{n}\" Classes=\"XYTracker\" Text=\"800 x 494 px\" FontSize=\"13\" Loaded=\"{n}_Loaded\"/>",
            // PathPicker (Input & text editors): the bundled AvaloniaChrome.PathPicker — a path row
            // (a TextBox showing the chosen path plus a "…" Browse button) that opens the platform's
            // OWN file/folder dialog and stores the result in SelectedPath (two-way bindable) — the
            // WinForms OpenFileDialog / FolderBrowserDialog pair as a droppable CONTROL.
            // Two toolbox tools share this element and differ only in PathType: "File Selector"
            // (File) and "Folder Selector" (Folder); PathType also accepts SaveFile, so a save-as
            // dialog is one dropdown change away. The `chrome:` prefix
            // (xmlns:chrome="using:AvaloniaChrome") is declared by the extension when placing it
            // (PathPicker.cs/.vb are bundled into every generated project, like GrumpyPanel).
            ["PathPicker"] = n => $"<chrome:PathPicker x:Name=\"{n}\" Width=\"230\" Height=\"24\" PathType=\"File\" Title=\"Select a file\" Filter=\"All files|*.*\"/>",
            ["PathPickerFolder"] = n => $"<chrome:PathPicker x:Name=\"{n}\" Width=\"230\" Height=\"24\" PathType=\"Folder\" Title=\"Select a folder\"/>",
            // GrumpyPanel (Layout panels): a Border-based docking REGION — a Border frame (its own
            // clickable chrome: BorderBrush/Background/BorderThickness/CornerRadius) whose single
            // Child is a DockPanel whose LAST child is the named free-placement body Canvas
            // ({n}Body). Controls dropped inside land freely in that body canvas (exact
            // Canvas.Left/Top); dock-able controls (Menu / StatusBar / …) are instead inserted into
            // the inner DockPanel (before the body) with DockPanel.Dock set, so they pin to the
            // panel's edges and the free body shrinks — real docking, but NO automatic placement of
            // undocked children. The `chrome:` prefix (xmlns:chrome="using:AvaloniaChrome") is
            // declared by the extension when placing it (GrumpyPanel.cs/.vb are bundled into every
            // generated project, like ChromeWindow).
            ["GrumpyPanel"] = n => $"<chrome:GrumpyPanel x:Name=\"{n}\" Width=\"360\" Height=\"220\" Background=\"#F7F7F7\" BorderBrush=\"#909090\" BorderThickness=\"1\" CornerRadius=\"4\">\n    <DockPanel x:Name=\"{n}Dock\" LastChildFill=\"True\">\n        <Canvas x:Name=\"{n}Body\"/>\n    </DockPanel>\n</chrome:GrumpyPanel>",
            // GrumpyStatus (Bars): a status strip built on the GrumpyPanel base. It is a
            // GrumpyPanel Border docked BOTTOM with a dark-grey background (no border), whose
            // single child is the DockPanel that every GrumpyPanel ships: a left status label
            // ({n}Label), a RIGHT-docked live StatusDate clock ({n}Date, Loaded-wired by the
            // designer's insertStatusDateClock), and the free body Canvas ({n}Body) filling the
            // middle. Dock-able controls can be added later exactly like any GrumpyPanel.
            ["GrumpyStatus"] = n => $"<chrome:GrumpyPanel x:Name=\"{n}\" DockPanel.Dock=\"Bottom\" Height=\"26\" Background=\"#333333\" BorderBrush=\"#333333\" BorderThickness=\"0\" CornerRadius=\"0\">\n    <DockPanel x:Name=\"{n}Dock\" LastChildFill=\"True\">\n        <TextBlock x:Name=\"{n}Label\" Text=\"Ready\" DockPanel.Dock=\"Left\" VerticalAlignment=\"Center\" Margin=\"8,0,0,0\" Foreground=\"#E6E6E6\" FontSize=\"13\"/>\n        <TextBlock x:Name=\"{n}Date\" Text=\"{DateTime.Now:G}\" DockPanel.Dock=\"Right\" VerticalAlignment=\"Center\" Margin=\"0,0,8,0\" Foreground=\"#E6E6E6\" FontSize=\"13\" Loaded=\"{n}Date_Loaded\"/>\n        <Canvas x:Name=\"{n}Body\"/>\n    </DockPanel>\n</chrome:GrumpyPanel>",
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
            ["Arc"] = n => $"<Arc x:Name=\"{n}\" Width=\"100\" Height=\"100\" StartAngle=\"0\" SweepAngle=\"270\" Stroke=\"Black\" StrokeThickness=\"1\" ZIndex=\"-1\"/>",
            // --- Avalonia 12 controls (GroupBox / HyperlinkButton / CommandBar family) ---
            // The host is now on Avalonia 12.1.1 (same as generated apps), so the snippets below use
            // the REAL tags and the TypeMap instantiates the REAL types. Since the headless string
            // XAML loader is unavailable, these render through the programmatic builder; the Fluent
            // theme in the form's own XAML styles them like they look at runtime.
            // GroupBox: a HeaderedContentControl (Header + Content). Grey border keeps the box
            // visible; the header text + rounded look come from the Fluent theme.
            ["GroupBox"] = n => $"<GroupBox x:Name=\"{n}\" Header=\"{n}\" Width=\"220\" Height=\"150\" BorderBrush=\"#808080\" BorderThickness=\"1\" CornerRadius=\"4\" Padding=\"12\"/>",
            // HyperlinkButton: a Button whose 12 theme draws it as an underlined link. No NavigateUri
            // by default (an empty attribute wouldn't parse as a Uri) — add one in Properties.
            ["HyperlinkButton"] = n => $"<HyperlinkButton x:Name=\"{n}\" Content=\"{n}\" Width=\"160\" Height=\"28\"/>",
            // CommandBar: commands belong under CommandBar.PrimaryCommands (added via XAML until a
            // designer 'Commands' editor exists), so the snippet is an empty bar sized like a strip.
            ["CommandBar"] = n => $"<CommandBar x:Name=\"{n}\" Width=\"480\" Height=\"44\"/>",
            // CommandBar command items (real Button/ToggleButton subclasses in 12).
            ["CommandBarButton"] = n => $"<CommandBarButton x:Name=\"{n}\" Content=\"{n}\" Width=\"120\" Height=\"32\"/>",
            ["CommandBarToggleButton"] = n => $"<CommandBarToggleButton x:Name=\"{n}\" Content=\"{n}\" Width=\"120\" Height=\"32\"/>",
            ["CommandBarSeparator"] = n => $"<CommandBarSeparator x:Name=\"{n}\" Width=\"8\" Height=\"24\" Margin=\"4,0\"/>",
            // --- Progress, status & misc + the remaining input/button/shape gaps (2026-09-19) ---
            // A placed progress bar shows 40% out of the box so it is visible in the preview (an empty one
            // is a blank strip); Slider mirrors that with a movable thumb.
            ["ProgressBar"] = n => $"<ProgressBar x:Name=\"{n}\" Width=\"220\" Height=\"12\" Minimum=\"0\" Maximum=\"100\" Value=\"40\"/>",
            ["Slider"] = n => $"<Slider x:Name=\"{n}\" Width=\"220\" Height=\"24\" Minimum=\"0\" Maximum=\"100\" Value=\"40\" TickFrequency=\"10\"/>",
            // Margin="0": the Fluent theme's own Separator margin shifts it a few pixels right/down, so a
            // dropped separator would not sit exactly where it was dropped (the T5 placement check, ±8px).
            ["Separator"] = n => $"<Separator x:Name=\"{n}\" Width=\"200\" Height=\"1\" Margin=\"0\" Background=\"#808080\"/>",
            // ToggleSwitch: Content is the label; OnContent/OffContent are what the switch shows in each
            // state (both set, so a drop looks like a switch rather than an empty track).
            ["ToggleSwitch"] = n => $"<ToggleSwitch x:Name=\"{n}\" Content=\"Toggle Switch\" OnContent=\"On\" OffContent=\"Off\"/>",
            // MaskedTextBox: the mask is a starter, not a law — 0000-0000 reads as a phone/ID shape and is
            // edited in the Properties panel.
            ["MaskedTextBox"] = n => $"<MaskedTextBox x:Name=\"{n}\" Width=\"140\" Height=\"24\" Mask=\"0000-0000\"/>",
            ["NumericUpDown"] = n => $"<NumericUpDown x:Name=\"{n}\" Width=\"120\" Height=\"24\" Minimum=\"0\" Maximum=\"100\" Value=\"10\"/>",
            // Polyline/Polygon are point-defined: their Points list IS the shape. Stretch="Fill" makes the
            // designer's resize box actually scale them (a Shape has Width/Height, and Fill maps the
            // geometry into it) — without it a resize would change nothing on screen.
            ["Polyline"] = n => $"<Polyline x:Name=\"{n}\" Width=\"120\" Height=\"80\" Stretch=\"Fill\" Points=\"0,80 30,10 60,60 90,0\" Stroke=\"Black\" StrokeThickness=\"1\" ZIndex=\"-1\"/>",
            ["Polygon"] = n => $"<Polygon x:Name=\"{n}\" Width=\"120\" Height=\"80\" Stretch=\"Fill\" Points=\"0,80 20,0 60,0 80,80\" Fill=\"Transparent\" Stroke=\"Black\" StrokeThickness=\"1\" ZIndex=\"-1\"/>",
            // PathIcon draws an icon from path data - no image file, no Assets entry.
            ["PathIcon"] = n => $"<PathIcon x:Name=\"{n}\" Width=\"24\" Height=\"24\" Data=\"M0,8 L8,16 L16,0\"/>",
            // --- GrumpyCharts (the bundled AvaloniaCharts control set, 2026-09-19) ---
            // Two self-drawing charts: no package, no template, no assets. Each ships sample data in
            // the snippet so a freshly dropped chart immediately looks like a chart instead of an
            // empty box (Values/Points are the inline data route; SourceFile points at an .xlsx).
            // The `charts:` prefix (xmlns:charts="using:AvaloniaCharts") is declared by the extension
            // when placing it (GrumpyCharts.cs/.vb are bundled into every generated project).
            ["GrumpyLinePlot"] = n => $"<charts:GrumpyLinePlot x:Name=\"{n}\" Width=\"300\" Height=\"180\" Values=\"4,9,6,12,8,15,11,16\" Title=\"Line plot\" ShowTitle=\"True\"/>",
            ["GrumpyXYPlot"] = n => $"<charts:GrumpyXYPlot x:Name=\"{n}\" Width=\"300\" Height=\"180\" Points=\"0,2 1,5 2,3 3,8 4,6 5,11\" Title=\"X,Y plot\" ShowTitle=\"True\" MarkerStyle=\"Cross\"/>",
            // The three charts added 2026-09-21 all ship sample data too: a bar chart with a couple of
            // series (so Grouped/Stacked mean something), an area chart reading the same kind of values,
            // and a pie whose slices come from typed Labels + Values (no workbook needed to look right).
            ["GrumpyBarPlot"] = n => $"<charts:GrumpyBarPlot x:Name=\"{n}\" Width=\"320\" Height=\"200\" Values=\"8,14,10,16,12\" Title=\"Bar chart\" ShowTitle=\"True\"/>",
            ["GrumpyAreaPlot"] = n => $"<charts:GrumpyAreaPlot x:Name=\"{n}\" Width=\"320\" Height=\"200\" Values=\"6,11,8,14,9,15\" Title=\"Area chart\" ShowTitle=\"True\"/>",
            ["GrumpyPiePlot"] = n => $"<charts:GrumpyPiePlot x:Name=\"{n}\" Width=\"240\" Height=\"240\" Labels=\"North,South,East,West\" Values=\"32,24,18,26\" Title=\"Pie chart\" ShowTitle=\"True\" ShowLegend=\"False\"/>",
            // The waterfall (2026-09-22) ships three samplesets inline (SampleSets: one set per ";"), so a
            // freshly dropped chart shows the mesh and the depth immediately — a real capture names one
            // spreadsheet column per sampleset instead (one series each).
            ["GrumpyWaterfallPlot"] = n => $"<charts:GrumpyWaterfallPlot x:Name=\"{n}\" Width=\"360\" Height=\"240\" SampleSets=\"6,11,8,14,9,15,10,13; 9,7,14,11,16,12,9,15; 4,12,9,8,13,10,15,8\" Title=\"Waterfall\" ShowTitle=\"True\" ShowLegend=\"False\"/>",
            // The surface (2026-09-23) ships four slices inline, so a dropped chart is a corrugation you
            // can turn straight away — a real sheet names one spreadsheet column per slice (one series
            // each) and carries its Z values in the sheet's own row.
            ["GrumpySurfacePlot"] = n => $"<charts:GrumpySurfacePlot x:Name=\"{n}\" Width=\"320\" Height=\"220\" SampleSets=\"0,20,40,50,40,20,0,20,40,50,40,20,0; 0,18,36,45,36,18,0,18,36,45,36,18,0; 0,16,32,40,32,16,0,16,32,40,32,16,0; 0,14,28,35,28,14,0,14,28,35,28,14,0\" Title=\"Surface\" ShowTitle=\"True\" ShowLegend=\"False\"/>",
            // --- GrumpySheet (the bundled AvaloniaSpreadsheet control, 2026-09-26) ---
            // A spreadsheet that draws itself: a header row and one row of data ship in the snippet, so a
            // freshly dropped sheet looks like a sheet rather than an empty box. Its cells are CHILD
            // ELEMENTS (the content property), and the `spread:` prefix (xmlns:spread=
            // "using:AvaloniaSpreadsheet") is declared by the extension when it places the control.
            ["GrumpySheet"] = n => $"<spread:GrumpySheet x:Name=\"{n}\" Width=\"560\" Height=\"320\">\n    <spread:SheetCell Row=\"1\" Column=\"1\" Text=\"Item\"/>\n    <spread:SheetCell Row=\"1\" Column=\"2\" Text=\"Qty\"/>\n    <spread:SheetCell Row=\"2\" Column=\"1\" Text=\"Widget\"/>\n    <spread:SheetCell Row=\"2\" Column=\"2\" Text=\"3\"/>\n</spread:GrumpySheet>"
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
        ["TreeView"] = typeof(TreeView),
        ["TreeViewItem"] = typeof(TreeViewItem),
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
        // The bundled GrumpyPanel (a Border subclass in AvaloniaChrome) — linked into the host
        // from resources/GrumpyPanel.cs so the programmatic builder can realise it for real.
        ["GrumpyPanel"] = typeof(GrumpyPanel),
        // The bundled PathPicker (a UserControl in AvaloniaChrome: path TextBox + Browse button) —
        // also linked in from resources/PathPicker.cs so the builder realises the real control.
        ["PathPicker"] = typeof(PathPicker),
        ["Line"] = typeof(Line),
        ["Rectangle"] = typeof(Rectangle),
        ["Ellipse"] = typeof(Ellipse),
        ["Arc"] = typeof(Arc),
        // Avalonia 12-only controls — the host is now ON Avalonia 12.1.1 (same as generated apps),
        // so these map to their REAL types and render genuinely in the programmatic builder.
        ["GroupBox"] = typeof(GroupBox),
        ["HyperlinkButton"] = typeof(HyperlinkButton),
        ["CommandBar"] = typeof(CommandBar),
        ["CommandBarButton"] = typeof(CommandBarButton),
        ["CommandBarToggleButton"] = typeof(CommandBarToggleButton),
        ["CommandBarSeparator"] = typeof(CommandBarSeparator),
        ["ProgressBar"] = typeof(ProgressBar),
        ["Slider"] = typeof(Slider),
        ["Separator"] = typeof(Separator),
        ["ToggleSwitch"] = typeof(ToggleSwitch),
        ["MaskedTextBox"] = typeof(MaskedTextBox),
        ["NumericUpDown"] = typeof(NumericUpDown),
        ["PathIcon"] = typeof(PathIcon),
        ["Polyline"] = typeof(Polyline),
        ["Polygon"] = typeof(Polygon),
        // The bundled GrumpyCharts controls (AvaloniaCharts.GrumpyLinePlot / .GrumpyXYPlot) — linked
        // into the host from resources/GrumpyCharts.cs so the builder draws the real chart.
        ["GrumpyLinePlot"] = typeof(AvaloniaCharts.GrumpyLinePlot),
        // GrumpySheet, the bundled AvaloniaSpreadsheet control. Without this entry the preview falls
        // back to a blank stand-in: nothing throws, the sheet is simply empty on the canvas.
        ["GrumpySheet"] = typeof(AvaloniaSpreadsheet.GrumpySheet),
        ["GrumpyXYPlot"] = typeof(AvaloniaCharts.GrumpyXYPlot),
        ["GrumpyBarPlot"] = typeof(AvaloniaCharts.GrumpyBarPlot),
        ["GrumpyAreaPlot"] = typeof(AvaloniaCharts.GrumpyAreaPlot),
        ["GrumpyPiePlot"] = typeof(AvaloniaCharts.GrumpyPiePlot),
        ["GrumpyWaterfallPlot"] = typeof(AvaloniaCharts.GrumpyWaterfallPlot),
        ["GrumpySurfacePlot"] = typeof(AvaloniaCharts.GrumpySurfacePlot)
    };

    public static Type? GetTypeForName(string name)
    {
        TypeMap.TryGetValue(name, out var t);
        return t;
    }
}
