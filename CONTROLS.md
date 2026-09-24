# Avalonia Controls Reference

A complete, alphabetised-by-category reference of the controls available in the **Avalonia UI
framework** that can be placed on a form. The list was extracted from the actual Avalonia
assemblies in the project's NuGet installation (see the version note below) — it is **not** limited
to the designer's Toolbox.

> The plain-language "what it does / when to use it" text for the Toolbox controls is the same text
> shown in the toolbox **tooltips** and the Properties panel's **"About this control"** help box
> (see `src/controlInfo.ts`).

---

## Version & scope

| Component | Avalonia version |
|-----------|------------------|
| Designer Previewer Host (`host/PreviewerHost.csproj`) | **12.1.1** |
| New projects scaffolded by this extension (`src/projectScaffold.ts`) | **12.1.1** |

> **Single Avalonia version** since 2026-09-07: the designer host and the projects it generates both
> run **12.1.1**, so the designer preview now shows exactly what your app will look like.

The tables below list the controls in the **Avalonia 12.1.1** assemblies (the version the designer
host renders — the same as generated projects). Controls that are new in 12.x (vs the earlier 11.x)
are flagged and grouped in [Appendix: controls new in Avalonia 12](#appendix-controls-new-in-avalonia-12).
Summaries come from the framework XML documentation (`/Avalonia.Controls.xml`); a handful of
internal/template parts have no published summary and are described by role instead.

### Designer support legend

| Marker | Meaning |
|--------|---------|
| ✅ **Toolbox** | Placeable directly from the sidebar Toolbox (drag or click-to-place). Has a friendly name, tooltip, property catalog and (where applicable) a default event. |
| ✓ **Previewed** | Not in the Toolbox, but the designer host can render it and it has property-catalog entries, so you can place it in XAML and edit it visually. |
| — | Framework control; usable in XAML but not specifically wired in the designer (place it in the XAML/text editor or a template). |

---

## Window roots

| Control | XAML tag | What it does | Designer |
|---------|----------|--------------|----------|
| Window | `Window` | A top-level window (the form) with its own title bar and frame. | — |
| WindowBase | `WindowBase` | Base class for top-level windows. | — |
| TopLevel | `TopLevel` | Base class for top-level widgets. | — |
| UserControl | `UserControl` | A reusable piece of UI that can be placed inside other forms. | — (New Form can target it as a base type) |

---

## Buttons & command controls

| Control | XAML tag | What it does | Designer |
|---------|----------|--------------|----------|
| Button | `Button` | <span style="white-space:nowrap">A standard button control.</span> | ✅ Toolbox |
| CheckBox | `CheckBox` | A tick box for a Yes/No (or three-state) option. | ✅ Toolbox |
| ComboBox | `ComboBox` | A drop-down list control. | ✅ Toolbox |
| ComboBoxItem | `ComboBoxItem` | A selectable item inside a `ComboBox`. | ✓ |
| DatePicker | `DatePicker` | A control that lets the user select a date via an inline calendar. | ✓ |
| CalendarDatePicker | `CalendarDatePicker` | A date-selection control; the user picks a date from a drop-down calendar. | ✓ |
| Calendar | `Calendar` | A control that enables a user to select a date using a visual calendar display. | ✓ |
| DropDownButton | `DropDownButton` | A button with a drop-down chevron indicating a flyout of additional actions. | ✓ |
| HyperlinkButton | `HyperlinkButton` | A button styled as a clickable link that opens a web page *(Avalonia 12)*. | ✅ Toolbox |
| Menu | `Menu` | A top-level menu control (the menu bar). | ✅ Toolbox |
| MenuItem | `MenuItem` | A menu item control. Add `Header` children to a `Menu`. | ✓ |
| MenuBase | `MenuBase` | Base class for menu controls. | — |
| NativeMenuBar | `NativeMenuBar` | A menu bar hosted by the native platform. | — |
| RepeatButton | `RepeatButton` | A button that raises its command repeatedly while pressed. | ✓ |
| SplitButton | `SplitButton` | A button with a primary part and a secondary part that opens a flyout. | ✓ |
| ToggleButton | `ToggleButton` | A control the user can check/uncheck (base for `CheckBox`/`RadioButton`). | — (base class) |
| ToggleSplitButton | `ToggleSplitButton` | A split button whose primary part is toggleable; the secondary part opens a flyout. | ✓ |
| ToggleSwitch | `ToggleSwitch` | A Toggle Switch control. | ✅ Toolbox |
| ButtonSpinner | `ButtonSpinner` | A spinner control that includes two Buttons (used by date/time pickers). | — (template part) |

---

## Input & text editors

| Control | XAML tag | What it does | Designer |
|---------|----------|--------------|----------|
| TextBox | `TextBox` | Represents a control to display or edit unformatted text. | ✅ Toolbox |
| MaskedTextBox | `MaskedTextBox` | A `TextBox` that constrains input using a mask (e.g. phone numbers). | ✅ Toolbox |
| NumericUpDown | `NumericUpDown` | A TextBox with spinners that increment/decrement numeric values. | ✅ Toolbox |
| AutoCompleteBox | `AutoCompleteBox` | Provides a text box for input plus a drop-down of possible matches. | ✓ |
| TimePicker | `TimePicker` | A control that lets the user select a time. | ✓ |
| SelectableTextBlock | `SelectableTextBlock` | A text block whose text can be selected by the user. | ✓ |
| TextBlock | `TextBlock` | Displays a block of (static) text. | ✅ Toolbox *(as "Label")* |
| Label | `Label` | A label that moves focus to a target on click / access-key. | ✓ |
| AccessText | `AccessText` | A text block that underlines a character (prefixed with `_`) as a keyboard access key. | ✓ |
| Image | `Image` | Displays a picture (`Source` = file path or `avares://` URI). | ✅ Toolbox |
| PathPicker | `chrome:PathPicker` | A path row (box + “…” button) that opens the platform's file / folder dialog and stores the result in `SelectedPath`. The **File Selector** / **Folder Selector** tools. | ✅ Toolbox |
| PathIcon | `PathIcon` | An icon drawn from a `Geometry`/path data. | ✅ Toolbox |
| IconElement | `IconElement` | Base class for icon elements drawn in XAML. | — (base class) |

> **File-path properties have a "Browse…" button.** The three properties that take a file — **Image →
> `Source`**, **Window → `Icon`**, and **ChromeWindow → `Title Bar Icon`** — show a **"…"** button next
> to the text box that opens the **system file picker**. Picking a file **copies it into the project's
> `Assets\` folder**, registers `Assets\**` as `AvaloniaResource` in the `.csproj/.vbproj` (if not
> already there), and sets the property to its portable `avares://ProjectName/Assets/…` URI. You can
> still type a path / `avares://` URI directly in the text box. (Background/BorderBrush/etc. are
> **colours**, not files, so they keep the colour picker.)
>
> The **designer preview shows the actual image**: for `<Image>` controls and the ChromeWindow title
> bar icon, the `avares://ProjectName/Assets/…` source is resolved against the project's `Assets\`
> folder on disk, so the picture appears in the designer exactly as it will at runtime (images
> without a name, or in templates/styles, still show a placeholder).

---

## Items controls & lists

| Control | XAML tag | What it does | Designer |
|---------|----------|--------------|----------|
| ItemsControl | `ItemsControl` | Displays a collection of items. | ✅ Toolbox |
| ListBox | `ListBox` | An items control where individual items can be selected. | ✅ Toolbox |
| ListBoxItem | `ListBoxItem` | A selectable item inside a `ListBox`. | ✓ |
| TreeView | `TreeView` | Displays a hierarchical tree of data. | ✅ Toolbox |
| TreeViewItem | `TreeViewItem` | An item in a `TreeView`. | ✓ |
| SelectingItemsControl | `SelectingItemsControl` | Base `ItemsControl` that maintains a selection (base for `ListBox`). | — (base class) |
| UniformGrid | `UniformGrid` | A panel with uniform column and row sizes. | ✅ Toolbox |
| VirtualizingPanel | `VirtualizingPanel` | Base class for panels that virtualize their items. | — (base class) |
| VirtualizingStackPanel | `VirtualizingStackPanel` | A `StackPanel` that virtualizes off-screen content. | ✓ |
| VirtualizingCarouselPanel | `VirtualizingCarouselPanel` | A panel used by controls that display one current item at a time. | — (template part) |
| TabControl | `TabControl` | A tab control with a tab strip and the selected tab's content. | ✅ Toolbox |
| TabItem | `TabItem` | A page inside a `TabControl`. | ✓ (managed via Properties → Tab Items) |
| TabStrip | `TabStrip` | A tab strip (primitive used in templates). | — |
| TabStripItem | `TabStripItem` | An item in a `TabStrip`. | — |
| Carousel | `Carousel` | An items control that shows its items as pages that fill the control. | ✓ |
| RefreshContainer | `RefreshContainer` | A container that provides pull-to-refresh functionality for scrollable content. | ✓ |
| RefreshVisualizer | `RefreshVisualizer` | Visualizes the refresh (pull-to-refresh) state. | — |

> **'Items' batch editor (ComboBox / ListBox / ItemsControl):** the Properties panel shows an
> **Items** property — click **"Edit items…"** to open a popup and type **one item per line**.
> Save turns each line into a `ComboBoxItem` / `ListBoxItem` / `TextBlock` child in the form's
> XAML (persisted with the form, visible in the designer preview and at runtime). It's **disabled**
> when the control is bound to a DataSet table or has an `ItemsSource`. ListBox also keeps the
> per-item "List Items" section for adding non-text items (Button, CheckBox, Image, …).

> **'Items Source' asset picker (ComboBox / ListBox / ItemsControl / DataGrid):** the **Items
> Source** property has a **"…"** button that lists every **bindable asset** in the project — the
> form's own array/collection fields and properties, **Public Shared / module** collections
> anywhere in the `.cs`/`.vb` files (arrays, `List<T>`, `ObservableCollection<T>`,
> `IEnumerable<T>`, `DataView`, `DataTable`), and every **DataSet table**. Picking one writes
> `Control.ItemsSource = <asset>;` into the form's constructor (so it works at runtime with no
> DataContext); picking a DataSet table binds it through the normal DataSet path. The field then
> shows the binding **read-only** (change or clear it with the "…" button again). You can still
> type a XAML binding into the box manually.

---

## Charts (bundled)

| Control | XAML tag | What it does | Designer |
|---------|----------|--------------|----------|
| Line Plot | `charts:GrumpyLinePlot` | A self-drawing line chart: Y values in sample order (X = the sample number 0, 1, 2 …) with axes, gridlines, a title and a legend. Data from a typed list or an `.xlsx` workbook. | ✅ Toolbox *(Charts)* |
| X, Y Plot | `charts:GrumpyXYPlot` | A self-drawing X,Y chart: `(x, y)` pairs as a joined line, as markers, or both — same axes, gridlines, title and legend as the line plot. | ✅ Toolbox *(Charts)* |
| Bar Chart | `charts:GrumpyBarPlot` | One bar per category, from a baseline that is always on the scale: **Grouped**, **Stacked** or **Stacked100** (share of the whole). The categories are the sheet's X-column **names**. Bar Width and Bar Corner Radius shape the bars. Minimum 0 included; legend, cursors, axes and the gradient all work as on the line plot. | ✅ Toolbox *(Charts)* |
| Area Chart | `charts:GrumpyAreaPlot` | Each series as a filled shape under its line: **Plain**, **Stacked** or **Stacked100**, with Area Opacity for the fill (the line on top stays opaque). Categories come from the X column's names, as on the bar chart. | ✅ Toolbox *(Charts)* |
| Pie Chart | `charts:GrumpyPiePlot` | One wedge per labelled value from the workbook's **label + value** columns (or typed `Labels`/`Values`), coloured from a 10-colour palette. **Doughnut Hole**, **Start Angle**, **Slice Gap** and the slice outline are properties; the **Slices** editor names the wedges that should differ (colour, Explode, off). The legend lists the slices with a tick box each; there are no gridlines, axes or cursors. | ✅ Toolbox *(Charts)* |
| Waterfall | `charts:GrumpyWaterfallPlot` | A projected 3D surface: one **sampleset per spreadsheet column** (a sweep, a run, a pass), stood behind the next and joined by a mesh, with the cube turnable by dragging. **Ribbon Style** (`Ribbon` / `Translucent` / `Lines`), **Ribbon Opacity**, **Colour Mode** (`Sampleset` / `Value` heat map / `Split` at a limit) with **Heat Min** / **Heat Max** / **Split Value** / **Below** & **Above Colour**, the mesh rows (**Show Connectors**, **Connector Colour / Thickness / Step**), **Max Points**, and the view (**Elevation**, **Azimuth**, **Z Spacing**, **Zoom**, **Z Axis Title**). Series rows carry a **Z Column**; no cursors (there is no cartesian frame). | ✅ Toolbox *(Charts)* |

| Surface Chart 3D | `charts:GrumpySurfacePlot` | A corrugated sheet drawn as a real surface: one **slice per spreadsheet column** along the sheet's length (a shared X column for the positions across the width, each slice's own Y column for its height), neighbouring slices joined so the picture *is* the surface. **Style** (`GridMesh` / `GridMeshSolid` / `Solid`), **Colour By** (`Sampleset` / `Temperature` ramp from **Low Colour** at the valleys to **High Colour** on the ridges, with **Heat Min** / **Heat Max**), **Solid Opacity**, **Mesh Colour / Thickness**, and the view (**Elevation**, **Azimuth**, **Z Spacing**, **Zoom**, turnable by dragging). **Where a slice stands** comes from **Z Row** (one row of Z values, one per slice) or from **Z Start** / **Z Step**. Its legend is a **range window**: one slider for the **width** (`MinX`/`MaxX`) and one for the **slices on show** (`MinZ`/`MaxZ`, counted in slices — *"Z 3…4 of 6"*), and the view re-fits to it. **Show Base** / **Base Colour** fill the space under the sheet. `SampleSets` writes whole slices inline; no cursors and no Axis editor (the cube's three axes are projected). | ✅ Toolbox *(Charts)* |

All of them come from the bundled **`GrumpyCharts.cs` / `.vb`** file (namespace `using:AvaloniaCharts`), copied
into every new project next to the other helpers — no package, no image file, nothing to install. See
**USER_MANUAL §19, "The charting tools"** for the full walkthrough.

- **Data**: `Values` (line plot / bar / area / pie) or `Points` (X,Y plot) for typed-in data, `SampleSets` for a
  waterfall written by hand (`"1,2,3; 4,5,6"` = two sets of three samples), or `SourceFile`
  → an `.xlsx` workbook (row 1 names the columns, data from row 2; columns `B/C`, `D/E`, `F/G` … per series).
  `LiveUpdate` re-reads the file on save. The **Data Selector** button (`Data — Select data…`) picks the
  **source** (`Spreadsheet` or, not read yet, `Data Files`), the **workbook** and — new in 0.11.7 — **which
  PAGE** of it to read, by the workbook's own sheet names (`SourceKind`, `SourceFile`, `SourceSheet`,
  `DataFile`). `ShowBrowse` and its surface button were retired in 0.11.2 and the property is now a no-op
  kept only so older forms still compile.
- **Series** (`Series — Edit series…`): one line per series, each with its own columns, colour, thickness,
  line style, markers, `AxisMode` (Common / Per series) and `Visible` switch. Order in the list = draw
  order. **On a waterfall each row is one SAMPLESET** — its own **Z Column** and its own legend name — and
  the Z numbers run along the depth axis.
- **A waterfall's own rows**: `RibbonStyle` (`Ribbon` / `Translucent` / `Lines`), `RibbonOpacity`,
  `ColorMode` (`Sampleset` / `Value` / `Split`) with `HeatMin`, `HeatMax`, `SplitValue`, `BelowColor` and
  `AboveColor`, the mesh (`ShowConnectors`, `ConnectorColor`, `ConnectorThickness`, `ConnectorStep`),
  `MaxPoints`, and the view — `Elevation`, `Azimuth`, `ZSpacing`, `Zoom` and the depth axis' own
  `ZAxisTitle`. Its floor gridlines and its three projected axes use the ordinary axis rows above. The
  corridors between the sets are **left open**: an earlier "Fill The Roof" / "Block Walls" surface was
  removed before release, so those four attributes do not exist on the control.
- **Axis** (`Axis — Edit axes…`): the chart's two **common** axes plus an optional X and/or Y axis per
  *Per series* series — side (Left/Right, Top/Bottom), major/minor ticks and their sizes, tick labels and
  their font size, the axis name, and **three independent colours**: `AxisColor` (the line and its ticks),
  `TickLabelColor` (the numbers) and `NameColor` (the name). Either of the last two left empty follows the
  line colour, which is how every axis behaved before 0.11.2.
- **Slices** (`Slices — Edit slices…`), pie only: one row per wedge (the names the chart draws, each with the palette colour it would take anyway). A row is an override — colour, **Explode**, on/off — and an untouched row writes **no** `<charts:PieSlice>` element at all.
- **Legend** (`Legend — Edit legend…`): on/off, side (Bottom/Top/Left/Right — it wraps to fit), name font
  size, and a frame with its own backcolour, outline and rounded corners. Clicking an entry switches that
  trace on and off at runtime; the trace keeps its place on the axis.
- **Cursors** (`Cursors — Edit cursors…`): up to **two** draggable cursors with a value readout. Each has
  `Orientation` (Both / Vertical / Horizontal — it only decides which lines are drawn, because a cursor
  always carries both an X and a Y), `Style`, `Colour`, `XValues`/`YValues` (which numbers its readout row
  shows), `FollowTrace` (on by default: the crossing sits **on the selected series** at the cursor's X,
  interpolated between samples) and a starting `X`/`Y` (empty = the middle of the axis). The chart-level
  `ReadoutPosition` (FollowMouse / TopRight) and `CursorDecimals` (**-1** = the axis labels' own precision)
  live in the same editor. At runtime **←/→** step one sample, **↑/↓** choose the trace read from (its
  marker is drawn on the crossing), dragging the handle slides the point along the trace, and the
  right-click menu switches each cursor on and off, picks the readout placement, adds/removes/re-centres
  cursors and copies the readout as text. With **two** cursors on, the readout gains a `ΔX`/`ΔY` row — the
  absolute difference between them. **A cursor that follows a trace is drawn in that traced series' own
  colour** (its `Colour` then applies to a cursor that does not follow — a threshold line), so its line,
  its crossing, the readout's **border and tag line** all belong visibly to the trace they read. The
  readout's **values are always white on black** (since 0.11.2), so a pale chart cannot make them
  unreadable. Which cursors are *enabled* is runtime state and is not saved.
- **Styling in Properties**: plot backcolour + opacity, a **`PlotBackBrush`** gradient (a **Background
  Gradient** row: type None/Linear/Radial/Conic, three colour stops, an angle for linear — written as real
  `LinearGradientBrush`/`RadialGradientBrush`/`ConicGradientBrush` XAML, taking the backcolour's place while
  it is set), border (colour/thickness/corner radius) and `Padding` — the room between that border and the
  chart frame, which pushes the title, the legend bar and the plot area (with its axis furniture) inward;
  one value or four (`4,8,4,8`), and leaving it empty keeps the chart's own small gap. Then gridlines
  (colour/thickness/style), the title (text/show/position/colour/size), the fixed scale overrides
  (`MinX`/`MaxX`/`MinY`/`MaxY`) and `DockPanel.Dock`.

> **An old copy of the bundled chart file cannot compile the newer series/axis/legend/cursor/brush XAML**
> (`AVLN2000: Unable to resolve type XYSeries…`, `… type ChartCursor …`, or a `PlotBackBrush` property). The
> designer refreshes it for you: save the form once after using a chart editor, and the project's
> `GrumpyCharts.cs`/`.vb` is updated — it tells you when.

---

## Layout panels

| Control | XAML tag | What it does | Designer |
|---------|----------|--------------|----------|
| Canvas | `Canvas` | Positions children by exact `Canvas.Left` / `Canvas.Top` (free placement). | — (created by templates / "New Canvas…") |
| DockPanel | `DockPanel` | Arranges children at top/bottom/left/right (last child fills). | ✅ Toolbox |
| Grid | `Grid` | Defines a layout of columns and rows. | ✅ Toolbox |
| GridSplitter | `GridSplitter` | A thumb that redistributes space between grid rows/columns. | ✓ |
| Panel | `Panel` | Base class for controls that can contain multiple children. | ✅ Toolbox |
| RelativePanel | `RelativePanel` | Positions and aligns children relative to each other or the parent. | ✓ |
| StackPanel | `StackPanel` | Stacks children in a line (vertical or horizontal). | ✅ Toolbox |
| WrapPanel | `WrapPanel` | Positions children sequentially, wrapping to the next line at the edge. | ✅ Toolbox |
| ReversibleStackPanel | `ReversibleStackPanel` | A `StackPanel` whose flow direction can be reversed. | — |
| Decorator | `Decorator` | Base class for controls that decorate a single child. | — (base class) |
| Border | `Border` | Decorates a child with a border, background, padding and rounded corners. | ✓ |
| ExperimentalAcrylicBorder | `ExperimentalAcrylicBorder` | A `Border` with an acrylic (blur) background. | — |
| ContentControl | `ContentControl` | Displays a single piece of content according to a template. | ✓ |
| HeaderedContentControl | `HeaderedContentControl` | A `ContentControl` that also has a header. | — (base class) |
| HeaderedItemsControl | `HeaderedItemsControl` | An `ItemsControl` that also has a header. | ✓ |
| HeaderedSelectingItemsControl | `HeaderedSelectingItemsControl` | A `SelectingItemsControl` with a header (base for `TabControl`). | — (base class) |
| TransitioningContentControl | `TransitioningContentControl` | Displays content with a transition animation between old/new content. | ✓ |
| LayoutTransformControl | `LayoutTransformControl` | A `ContentControl` that supports a layout-time transform. | — |
| Expander | `Expander` | A control with a header that has a collapsible content section. | ✓ |
| SplitView | `SplitView` | Two panes: a collapsible pane and a content area. | ✓ |
| Viewbox | `Viewbox` | Scales a single child to fit the available space. | ✓ |
| ThemeVariantScope | `ThemeVariantScope` | A decorator that isolates a subtree with a locally-defined theme. | — |

> **Grid — Rows & Columns:** a Grid without row/column definitions is just one cell, so the
> designer offers a **Rows & Columns** button in the Properties panel (when a Grid is selected).
> It opens an editor where you add/remove rows and columns and set each one's size:
> **Auto** (fits its content), **\*** (fills the leftover space), or a number like `100` (exact
> pixels; `2*` = twice the share of a `*`). The settings are written back as
> `Grid.RowDefinitions` / `Grid.ColumnDefinitions`. Once a Grid has rows/columns, a control
> placed **inside** it gets **Grid Row** and **Grid Column** dropdowns in its Properties, so you
> can put it in any cell.

> **SplitPanel:** a **designer pattern** (like Status Bar) — Avalonia has no `SplitPanel` control.
> The toolbox **SplitPanel** tool inserts a **`Border` frame** (its own clickable border — clicking
> it selects the whole panel) around a **`Grid`** whose panes are `Border`s (each with a named
> `Canvas` body to drop controls into) separated by runtime-draggable **`GridSplitter`** bars
> (`MinWidth`/`MinHeight=1` so they never shrink below 1 px). Its default **Zones** layout is a T:
> two side-by-side panes over a full-width one. The Split Panel's Properties offer **Split Layout**
> (switch Zones / Columns / Rows — the stepper picks the **top-band pane count** for Zones, e.g.
> 3-up over 1, and the total count for Columns/Rows), **Splitters** (each divider bar's thickness,
> colour and runtime visibility) and **Pane Border** (width of the border around each pane). A
> pane's own **Width** (side-by-side panes) or **Height** (the full-width bottom pane) is its
> divider position — **0** hides the pane, `*` lets it flex.
>
> **Panes keep their minimums on resize.** A pane's **Min Height / Max Height** (full-width panes)
> and **Min Width / Max Width** (side-by-side panes) are written onto the Row/Column definition,
> which is what actually clamps a star row/column at runtime — so when you shrink the window the
> flexible panes give way first, and a pane never shrinks below its minimum. When a pane minimum or
> divider is set, the designer also keeps the **form's own Min Height/Width** at the layout floor
> (title bar + docked bars + the split's fixed/minimum rows/columns), so the OS stops the window
> being resized below the point where nothing can shrink any further.

> **Drag the dividers at design time.** Grab a divider bar (the strip between two panes) and drag
> it to resize the panes: a guide line follows the mouse and the split is applied when you release.
> **Only the divider you drag moves** — in multi-pane splits too (e.g. three side-by-side columns):
> the dragged pane takes the new pixels and its immediate neighbour absorbs the difference, so every
> divider beyond it stays put. The pane's Width/Height shows the new divider position. The axis is
> kept **all-star** (each pane's star value = its pixel width, the same model Avalonia's own
> GridSplitter ends with after a runtime drag), which is what makes the real splitters behave: a
> **fixed + star mix** makes a runtime `GridSplitter` resize only the fixed neighbour while the star
> absorbs — so *both* splitters appear to move — whereas two star neighbours are resized together
> with a conserved sum (only the dragged divider shifts). The drag respects each pane's minimum and
> is one undo step (Ctrl+Z). Works in every SplitPanel layout (Zones / Columns / Rows) along each
> divider's valid direction; typing a pane's pixel **Width/Height** uses the same all-star model.

> **GrumpyPanel:** a designer convenience backed by a **bundled control** (like ChromeWindow). The
> toolbox **Grumpy Panel** inserts a real `<chrome:GrumpyPanel>` (bundled `GrumpyPanel.cs`/`.vb`,
> namespace `AvaloniaChrome`) — a **Border frame** whose single child is a `DockPanel` with a named
> **Body** canvas that fills it. Drop it on any canvas/panel:
> - Controls you drop inside land **freely** in the body (exact `Canvas.Left/Top`) — no automatic
>   placement.
> - A **dock-able** control (Menu, Status Bar, Image, ListBox, grids, TabControl, …) can instead be
>   **Docked** (Left/Top/Right/Bottom): the designer moves it into the panel's inner `DockPanel`
>   with `DockPanel.Dock`, so it pins to that edge of the panel and the free body shrinks to fill
>   the remainder. A docked child's **Anchor is ignored**; setting Dock back to **None** returns it
>   to the free body.
> - The panel itself has a **Dock** (so it can pin to a form edge like any bar) and its own
>   **8-position Anchor** — Left / Right / Top / Bottom / Top-Left / Top-Right / Bottom-Left /
>   Bottom-Right — that pins the whole panel to its container.
> - Style the frame with **Background**, **Border Brush**, **Border Thickness**, **Corner Radius**
>   and **Padding**; the **Theme** row is the master switch: **System** = neutral (no forced
>   chrome), **Custom** = your colours above.
>
> New projects bundle `GrumpyPanel.cs`/`.vb` automatically; when you place one in an older project
> the designer copies the matching helper in next to `ChromeWindow`.

---

## Shapes

Drawing shapes that render as vector graphics on the design surface.

| Control | XAML tag | What it does | Designer |
|---------|----------|--------------|----------|
| Line | `Line` | A straight line drawn between a **Start Point** and an **End Point** (`"x,y"`). Has no width/height — its size is the geometry. | ✅ Toolbox |
| Rectangle | `Rectangle` | A rectangular box: **Backcolor** (fill) + **Line Colour** outline. Round the corners with **Corner Radius X / Y**. | ✅ Toolbox |
| Ellipse | `Ellipse` | An oval (equal width/height = a perfect circle). **Backcolor** fill + **Line Colour** outline. | ✅ Toolbox |
| Arc | `Arc` | A stroked curve swept from a **Start Angle** to a **Sweep Angle** (degrees) inside its box. Stroked only — no fill. | ✅ Toolbox |
| Sector | `Sector` | A filled pie slice (Start/Sweep angles + fill). | ✓ (rendered) |
| Path / Polyline / Polygon | `Path`, `Polyline`, `Polygon` | Free-form / multi-point shapes. | ✅ Toolbox (Polyline, Polygon) · ✓ Path |

> **Placed shapes** default to a **transparent fill + black 1px outline**, and render **behind
> other controls by default** (Send to Back — they carry `ZIndex="-1"`). Bring one to the front by
> setting its **Z-Index** property in the Properties panel to `0` or higher. They share the common
> layout properties (alignment, margin, opacity, …), plus:
> - **Line** — Line Colour, Line Thickness, Line Ends (Flat/Round/Square), Start Point, End Point.
> - **Rectangle / Ellipse** — Backcolor, Line Colour, Line Thickness (+ Corner Radius X/Y on Rectangle).
> - **Arc** — Line Colour, Line Thickness, Start Angle, Sweep Angle.
>
> **Resizing & editing:**
> - **Boxes and circles** (Rectangle/Ellipse) resize by dragging an edge/corner like any control.
> - **Line** and **Arc** are edited with **drag-point handles** (instead of the 8-handle box):
>   - A **Line** shows its two **ends** — drag one to move that end (the other stays anchored).
>     The line can still be dragged by its body to move it whole. The panel shows **no**
>     Width/Height for a Line (its size is defined by its points).
>   - An **Arc** shows three points — its two **ends** (drag to rotate that end around the centre;
>     the other end stays anchored, changing the sweep) and its **centre** (drag outward/inward to
>     set the **radius**; a faint guide line shows the radius as you drag).
>
> In **VB** projects the code-behind automatically imports `Avalonia.Controls.Shapes` when a shape
> is placed (the generated accessors need it); **C#** needs no extra import.

---

## Scrolling

| Control | XAML tag | What it does | Designer |
|---------|----------|--------------|----------|
| ScrollViewer | `ScrollViewer` | Scrolls its content when it is bigger than the available space. | — |
| ScrollBar | `ScrollBar` | A scrollbar control (used by `ScrollViewer`). | — (template part) |
| ScrollContentPresenter | `ScrollContentPresenter` | Presents a scrolling view of content inside a `ScrollViewer`. | — (template part) |
| ScrollViewer | *(see above)* | | |

---

## Data & grid

| Control | XAML tag | What it does | Designer |
|---------|----------|--------------|----------|
| DataGrid | `DataGrid` | Displays data in a customizable grid (rows × columns). | ✅ Toolbox |
| DataGridRow | `DataGridRow` | A row in a `DataGrid`. | — (auto-generated) |
| DataGridBoundColumn | `DataGridBoundColumn` | Base class for a `DataGrid` column that binds to a property. | — (base class) |
| DataGridTextColumn | `DataGridTextColumn` | A `DataGrid` column that hosts text in its cells. | ✓ |
| DataGridCheckBoxColumn | `DataGridCheckBoxColumn` | A `DataGrid` column that hosts check boxes in its cells. | ✓ |
| DataGridComboBoxColumn | `DataGridComboBoxColumn` | A `DataGrid` column that hosts combo boxes in its cells. | ✓ |
| DataGridHyperlinkColumn | `DataGridHyperlinkColumn` | A `DataGrid` column that hosts hyperlink buttons in its cells. | ✓ |
| DataGridTemplateColumn | `DataGridTemplateColumn` | A `DataGrid` column with a custom cell template. | ✓ |
| DataGridCell | `DataGridCell` | An individual cell in a `DataGrid`. | — (template part) |
| DataGridColumnHeader | `DataGridColumnHeader` | An individual column header in a `DataGrid`. | — |

> **StatusBar:** Avalonia has **no built-in `StatusBar` control.** The designer's toolbox **StatusBar**
> tool inserts the standard idiom — a `Border` with a `TextBlock` — so a "Status Bar" row appears in
> the reference table below as a **designer pattern**, not a framework control.
>
> **DataGrid needs its theme registered.** `FluentTheme` does **not** include the DataGrid control
> theme (it ships in the `Avalonia.Controls.DataGrid` package). Without it a DataGrid has no template
> and renders blank (no background/border/columns) in the app AND the designer. Add to `App.axaml`:
>
> ```xml
> <Application.Styles>
>     <FluentTheme />
>     <StyleInclude Source="avares://Avalonia.Controls.DataGrid/Themes/Fluent.xaml"/>
> </Application.Styles>
> ```
>
> **New projects include this automatically** (the generator writes it into `App.axaml`). Existing
> projects need to add it by hand. An empty unbound DataGrid is still visually blank (nothing to
> draw) — set a `Background` or bind it to data.
>
> **Columns: `AutoGenerateColumns="True"` in XAML is only for the designer preview.** At runtime,
> `MyData.Wire<T>Grid(...)` sets `grid.AutoGenerateColumns = false` and builds **typed columns in
> code** (`Build<T>Columns`) — text/number columns as `DataGridTextColumn`, Yes/No as
> `DataGridCheckBoxColumn`, and **date columns as `DataGridTemplateColumn` with a `DatePicker`
> editor** (the column type must be `DateTime` in the `.adset` — e.g. `CreatedAt`). In-cell editing
> of an existing row **auto-saves on commit** (Enter / Tab / click-away; Escape cancels); the
> right-click menu is **Delete row** only. The blank "+ Add row…" row still opens the add popup.
>
> **File browser in the add/edit row dialog:** every **text (String) column** in the row dialog has a
> **Browse…** button next to its box. Click it to pick a file from anywhere on the system drive in the
> native OS picker (images first — `.png/.jpg/.jpeg/.bmp/.gif/.webp` — with an **All files** option);
> the chosen file's **full absolute path** is written into that box (so an image/photo column stores a
> path the app can load). The dialog remembers the folder you last picked from and starts there next
> time (best-effort: kept in memory and in a small `<DataSet>.lastfolder` file next to the app).
>
> **Undo/Redo:** bound grids support **Ctrl+U** (undo) and **Ctrl+R** (redo) for add / edit /
> delete, up to a configurable depth. The depth is set with the **'Undo-Redo'** property on the
> DataGrid in the form designer (default 5; 0 disables undo) — it's stored in the bound table's
> `.adset` and regenerates the DataSet class.
>
> **Rows & Columns editors (designer):** selecting a DataGrid shows **Rows** and **Columns**
> property buttons. **Rows** covers row background / text colour / row height / row-header width /
> grid lines + their colours / header visibility. **Columns** covers default/min/max column width,
> frozen columns, header height, and **column-header styling** (text alignment / colour / font /
> size / background). Avalonia has **no direct header-styling attribute**, so the Columns editor
> emits a `<dg:DataGrid.Styles><Style Selector="dg|DataGridColumnHeader">` block (root `xmlns:dg`
> only — Avalonia rejects attributes on property elements). The **Header text font** picker lists
> every installed system font (enumerated by the preview host).

> **DataSet (toolbox):** not a framework control — it's a **designer tool**. Clicking it opens the
> DataSet schema designer (`*.adset`) to design ADO.NET tables + columns and generate a runtime
> DataSet class (C#/VB) + `.xsd`. See *Special behaviors → DataSet* below.

---

## Progress, status & misc

| Control | XAML tag | What it does | Designer |
|---------|----------|--------------|----------|
| ProgressBar | `ProgressBar` | Indicates the progress of an operation. | ✅ Toolbox |
| TickBar | `TickBar` | Used to draw a control's tick marks (used by `Slider`). | — |
| Slider | `Slider` | Lets the user select a value from a range by dragging a Thumb. | ✅ Toolbox |
| RangeBase | `RangeBase` | Base class for controls that display a value within a range (`Slider`/`ProgressBar`). | — (base class) |
| Track | `Track` | A track along which a `Thumb` slides (used by `Slider`/`ProgressBar`). | — (template part) |
| Thumb | `Thumb` | A draggable element used in sliders and resize handles. | — (template part) |
| Separator | `Separator` | A separator line between groups of items. | ✅ Toolbox |
| ToolTip | `ToolTip` | Pops up a hint when a control is hovered. | ✓ |
| ContextMenu | `ContextMenu` | A contextual (right-click) menu. | — |
| NativeControlHost | `NativeControlHost` | Hosts a native platform control inside Avalonia. | — |
| DataValidationErrors | `DataValidationErrors` | Displays a validation-error notifier when a `DataValidationError` occurs. | — |
| Popup | `Popup` *(Primitives)* | Displays a popup window (host for `ToolTip`/`ContextMenu`). | — |
| PopupRoot | `PopupRoot` | The root window of a popup. | — (template part) |
| AdornerLayer | `AdornerLayer` | A surface on which adorners are drawn on top of an element. | — |
| FlyoutPresenter | `FlyoutPresenter` | Presents the content of a flyout. | — |
| OverlayLayer / OverlayPopupHost / VisualLayerManager *(Primitives)* | — | Infrastructure that manages adorners, popups and light-dismiss behaviour. | — |
| ThemeVariantScope *(see Layout)* | — | Isolates a subtree under a locally-defined theme variant. | — |

---

## Bars (sidebar views) — designer-only conveniences

| Control | XAML tag | What it does | Designer |
|---------|----------|--------------|----------|
| **Menu** (toolbox) | `Menu` | A horizontal menu bar. | ✅ Toolbox |
| **StatusBar** (toolbox) | `Border` + `TextBlock` | Bottom status strip (not a real framework control). | ✅ Toolbox *(pattern)* |
| **Status Date / Time** (toolbox) | `TextBlock` + timer | A live clock updating every second (not a framework control). | ✅ Toolbox *(composition)* |
| **GrumpyStatus** (toolbox) | `chrome:GrumpyPanel` strip | A dark status strip built on the **GrumpyPanel** base: docked to the bottom with a status label on the left and a live clock on the right. | ✅ Toolbox *(composition)* |
| **Custom Title Bar** (toolbox) | `chrome:ChromeWindow` root | Replaces the window's default OS title bar with the bundled ChromeWindow bar (drag/min/max/close). Not a control — a **window-root action**. | ✅ Toolbox *(action)* |

---

## Dev Helpers (toolbox) — designer-only conveniences

| Control | XAML tag | What it does | Designer |
|---------|----------|--------------|----------|
| **XY-Tracker** (toolbox) | `TextBlock` + timer | A live **W x H px** display. Dropped on a container it reports that container's size; dropped on a Status Bar (or added as a Status item) it reports the **form's** client size and hugs the right edge. | ✅ Toolbox *(composition)* |

---

## Special behaviors

### Properties panel sections (all controls)

The Properties sidebar groups every control's rows into six sections, in a fixed order and with a
canonical order inside each one (`PROP_SECTIONS` in `src/propertyCatalog.ts`):

**Editors** (the designer's popup editors) → **Layout & size** (W/H, Min/Max, Left/Top, Margin,
Padding, Dock, Anchor, Alignments, Grid cell, window sizing) → **Appearance** (all colours/brushes,
borders, corners, opacity, Theme, shape geometry, images/icons) → **Text & font** (content/captions
+ font, alignment, wrapping, edit options) → **Data** (item sources, selected item, edit permissions,
Undo-Redo, the File/Folder picker's dialog settings) → **Behavior** (visibility, focus, check state,
click/selection modes, scroll bars, window flags).

**Name** and **Type** stay pinned above the sections. Section headings are **collapsible** and the
folded set is remembered per control TYPE (webview state); rows whose `advanced` flag is set appear
only with **Show advanced** ticked, inside their section. A key that is not listed in a section falls
into Behavior — a T2 test asserts the catalog has no such rows, so new properties must be added to
`PROP_SECTIONS`.

### Custom Title Bar (ChromeWindow)
New projects and new forms use the **default Avalonia title bar** (a plain `<Window>` root). The
toolbox's **Custom Title Bar** converts a Window-rooted form to the bundled **ChromeWindow** custom
title bar (dark-navy bar with drag / min / max / close):

- Drop it anywhere on the form (or click the tool, then click the canvas). The root becomes
  `<chrome:ChromeWindow>`, the code-behind base class changes to `AvaloniaChrome.ChromeWindow`,
  and the window grows by the default 44px title bar so the body stays the same size.
- Edit the custom title bar via **Properties** on the Form (these three rows are pinned above the
  window properties): **Title Bar Text**, **Title Bar Icon** (optional) and **Title Bar Height**
  (the bar height in pixels, default **44** — the form body sits below it and the caption buttons
  fill the bar).
- The **designer preview mirrors the whole title bar**: dark-navy bar, centred title, the min /
  max / close caption buttons on the right, and the **Title Bar Icon** on the left (the icon is
  resolved from the project's `Assets\` when set via the file browser, so it shows in the designer
  as well as at runtime). A changed **Title Bar Height** is reflected in the preview and at runtime.
- It's a normal edit, so **Ctrl+Z** reverts to the default title bar (undo also restores the
  code-behind).
- Only works on **Window**-rooted forms (not UserControl). The ChromeWindow.cs/.vb + AnchorHelper
  files are bundled with every new project (unused until you convert).

### Label → `TextBlock`

## Special behaviors

### Label → `TextBlock`
The toolbox item labelled **"Label"** inserts a `TextBlock` (Avalonia's text element). There is no
separate `Label` control in Avalonia (the framework `Label` here is a focus-proxy element, distinct
from the toolbox "Label" shorthand).

### StatusBar → Border pattern
Avalonia has **no built-in `StatusBar` control**. The toolbox **StatusBar** tool inserts the idiomatic
pattern — a `<Border>` with a `<TextBlock>` inside — and (for generated projects) an optional
`StatusDate` clock. To dock it at the bottom of a `DockPanel`, set the **Dock** property to `Bottom`
(the default Dock values are already set on the Menu and Status Bar tools).

### Status Date / Time
The **Status Date / Time** tool places a `TextBlock` with a `Loaded` handler that starts a
`DispatcherTimer` updating the text to the current system date/time (OS format, updated every
second). The generated C#/VB code-behind is created for you. See *Code-behind* in the USER_MANUAL.

**Date & Time formats.** Selecting a StatusDate clock shows two beginner-friendly pickers in the
Properties panel — **Date Format** and **Time Format** — plus a live **Preview** of how the clock
reads right now:

- **None (hidden)** — that part is not shown (so you can show only the time, or only the date).
- **System date / System time** — the OS current-culture format (the default, i.e. today's
  behaviour).
- **An example** (e.g. *Mon, 9 Sep 2026*, *09/09/2026*, *14:32*, *2:32 PM*, …) — a fixed layout.
  No format-string knowledge needed; the example you pick is exactly what is shown (a space joins
  the date and time when both are shown).

The chosen formats are written into the generated code-behind handler (the clock's per-second tick
line), so the designer keeps working and the change is reflected live at runtime.

### File / Folder Selector (the bundled `PathPicker`)

The **File Selector** and **Folder Selector** tools insert the same element,
`<chrome:PathPicker>` — the bundled **`PathPicker.cs|.vb`** helper (an `AvaloniaChrome` UserControl,
like `ChromeWindow` / `GrumpyPanel`) — and differ only in the `PathType` they ship with:

```xml
<chrome:PathPicker x:Name="PathPicker1" Width="230" Height="24"
                   PathType="File" Title="Select a file"
                   Filter="Images|*.png;*.jpg|All files|*.*"
                   InitialFolder="" IsPathReadOnly="True" BrowseText="…"
                   SelectedPath="{Binding PhotoPath, Mode=TwoWay}"/>
```

| Property | Type | Notes |
|---|---|---|
| `PathType` | `File` \| `Folder` \| `SaveFile` | Which `IStorageProvider` dialog the button opens (OpenFile / OpenFolder / SaveFile) |
| `SelectedPath` | `string?` | The result. **Two-way bindable** — set it to pre-fill, bind it to read |
| `Title` | `string?` | Dialog caption |
| `Filter` | `string?` | WinForms-style filter (`"Images|*.png;*.jpg|All files|*.*"`); files only. `*.*` is normalised to `*` |
| `InitialFolder` | `string?` | Used when `SelectedPath` is empty; the last folder picked is also remembered per session |
| `IsPathReadOnly` | `bool` (default `True`) | `False` makes the path box editable |
| `BrowseText` | `string?` (default `…`) | The button's caption |
| `ShowIcon` | `bool` (default `True`) | A 14×14 kind glyph docked at the left edge — a **page** for `File`/`SaveFile`, a **folder** for `Folder` — filled with the control's `Foreground` (so it follows the theme); `ShowIcon="False"` hides it |

It renders as a fill `TextBox` + a right-docked `Button`, plus the **kind icon** above (drawn from
`Geometry.Parse` path data and refreshed when `PathType`/`ShowIcon` change), so
`Width`/`Height`/`Margin` behave like any other control. The dialog is the **platform's own** (no extra package) via `TopLevel.StorageProvider`,
and with no `TopLevel` around (design preview) the click is simply a no-op. **Designer:** the tool
auto-copies the helper into the project on first placement; **Code Fix…** reports it as a missing
bundled helper if the project predates it.

### XY-Tracker (Dev Helpers)
The **XY-Tracker** tool places a `TextBlock` (marked with `Classes="XYTracker"`) that shows the live
size of its context as **W x H px** (updated every 200 ms by a `Loaded` handler + `DispatcherTimer`
in the generated code-behind). What it measures depends on where you drop it:

- **On a container** — it reports the size of the control it lands in (its immediate parent), e.g.
  a panel it was dropped onto.
- **On a Status Bar** (or added via the Status Bar's **Status Items** editor as the **'form WxH'**
  kind) — it reports the **form's** client size and pins itself to the **right** edge of the strip.
- **On a GrumpyStatus** (or any GrumpyPanel docked to the bottom edge) — that strip is treated like a
  Status Bar: the tracker is moved into the strip's dock band, pinned to the **right** edge, and
  reports the **form's** client size (drop it on the strip's empty middle or straight onto its label/
  clock).

Background, Foreground and Font properties work like any TextBlock, and its **Anchor** behaves like
other status items (a right edge anchor keeps it hugging the right edge as the window resizes).

### Menu
The **Menu** tool inserts a `Menu` docked to the top with one starter `MenuItem` ("File"). Add more
`MenuItem`s as children, each with a `Header`. There is no separate `MenuBar` control in Avalonia —
`Menu` is itself, the bar.

Avalonia only draws the items of a menu when it is **opened at runtime**, so the designer draws plain
placeholder labels over the bar; selecting the Menu and using the **Menu Items** property (Editors
group) opens the **tree editor** that writes the real XAML. Kinds (`src/designerPanel.ts`,
`MenuNodeKind`):

| Kind | Writes | Notes |
|---|---|---|
| `Item` | `<MenuItem Header="…"/>` | An ordinary command item (children become its submenu) |
| `CheckBox` | `<MenuItem Header="…" ToggleType="CheckBox"/>` | A checkable item |
| `Radio` | `<MenuItem Header="…" ToggleType="Radio"/>` | A radio item |
| `ComboBox` | `<MenuItem>` whose children are its options | A drop-down row: the options are real submenu items |
| `Separator` | `<Separator/>` | A line; on the **bar** it gets `Classes="MenuBarDivider"` so the top divider stays horizontal |
| `Space` | `<MenuItem IsEnabled="False" Focusable="False" Width="…"/>` | An invisible gap on the **bar** — inert, no header/submenu; width defaults to 12 px (1–500). Offered at depth 1 only |
| `FileSelector` / `FolderSelector` | `<chrome:PathPicker Width="…" Height="24" PathType="File|Folder" Title="…"/>` inside the `<MenuItem>` | A **leaf** row that IS the bundled picker: width defaults to 160 px (40–600) and the row's text field is the dialog **Title** (defaulted to *Select a file* / *Select a folder* / *Save file*). A hand-written `PathType="SaveFile"` is carried through, not downgraded |

The tree editor nests up to **5** item levels below the bar (`MENU_MAX_DEPTH`). Reading the tree back
(`menuTreeOf`) recognises those picker children — otherwise replacing the tree would silently drop a
picker — and `sanitizeMenuNodes` normalises an unknown kind to `Item`, drops a bogus `PathType` / the
children of a leaf, and clamps the widths, so a hand-edited or older file can't corrupt the tree.

### DataSet (toolbox) — schema designer
The **DataSet** item (under **Data & Grid**) is **not a form control** — clicking it opens the
**DataSet designer** for a new `*.adset` file (right-click an existing `.adset` → *Open in DataSet
Designer*). It's a runtime-construction DataSet designer (like VS's Dataset designer, minus the
strongly-typed codegen):

- Design **tables** (draggable boxes) and **columns** (field name, header/Caption, .NET data type,
  allow-null) visually.
- **Generate Code** writes `MyData.cs`/`MyData.vb` (language auto-detected; class in the project
  root namespace) with `MyData.CreateDataSet()` building the DataTables/DataColumns, plus
  `MyData.xsd`.
- **Bind a table to a control** — the DATASET panel's **Bind to control** drop-down lists the
  project's bindable controls (ListBox/ComboBox/ItemsControl/DataGrid); picking one writes the
  DataView property + `ItemsSource` line into the form's code-behind (`*` marks controls already
  bound; Un-bind removes it).
- **Follow a column instead (read-only controls)** — a table belongs to ONE control, so a second
  control can't bind to it. A control that only displays data (ComboBox / ListBox / ItemsControl)
  can **follow** a grid-bound table's **text column** instead: the form designer's **Items Source**
  picker lists those columns as `DataSet.Table.Column` entries and writes
  `Control.ItemsSource = New ColumnFollower(Of <Table>Row, String)(<rows>, Function(r) r.<Column>, Function(r) r.IsPlaceholder)`
  (C#: `new ColumnFollower<<Table>Row, string?>(<rows>, r => r.<Column>, r => r.IsPlaceholder)` — a
  text column's value type is nullable-annotated to match the generated row property)
  using the bundled `ColumnFollower.cs|.vb` helper. The list is **live** (add/edit/delete in the grid
  updates it, values replaced in place), keeps the grid's row order and skips the “+ Add row…”
  placeholder. The binding is recorded on the table's `.adset` (`followers`). A control that still has
  inline **items** must be cleared first — Avalonia refuses an `ItemsSource` while they exist.
- v1 is **schema-only** — no `DataRelation`s yet.

### Code Fix… (designer toolbar)
Not a control — the designer toolbar's **🩺 Code Fix…** button checks the form's **code-behind**
against the current `.axaml` **and** the project's `.adset` files and repairs what drifted apart.
It is the safety net for the cases that otherwise fail as an unhelpful compile error:

- **VB named-control accessors** — missing (→ `BC30451`, the reason a control can be "not declared"
  even though it exists in the form) or left over from a deleted control.
- **Duplicate method definitions** (`BC30269`/`CS0111`) — typically a generated Data-Image block
  inserted twice because its `' DataImage:` marker was lost.
- **Event wiring** — a XAML `Click=`/`Loaded=`/`SelectionChanged=` attribute whose method is gone
  (a stub is inserted) or whose `EventArgs` type is wrong (signature rewritten, body untouched).
- **Handlers of deleted controls** — removed as a whole method, nesting-aware (a generated clock's
  inner `Sub … End Sub` is counted, so nothing is left dangling).
- **Data-Image / ItemsSource bindings** — incomplete blocks, lost markers, renamed columns/tables,
  deleted Image/DataGrid/control targets.
- **Build prerequisites** — bundled helper files (`ChromeWindow`, `GrumpyPanel`, `AnchorHelper`,
  `ExifImageLoader`) that the project is missing, and missing `Imports`/`using` statements
  (`Avalonia.Controls.Shapes`, `AvaloniaChrome`, `Avalonia.Platform.Storage`, `System.Data`,
  `Avalonia.Input`).
- **Structure** — `InitializeComponent()` never called, `chrome:ChromeWindow` root with a `Window`
  base class.
- **Compile errors, from the compiler itself** (since `0.10.1`) — a **🩺 Code Fix…** run also builds the project
  (`avaloniaDesigner.codeCheck.build`) and lists `dotnet build`'s own errors next to the rules' findings: only the
  project's source, de-duplicated, with `CS1002` in the form's code-behind repaired by the same one-click fix the
  semicolon rule uses. This is also the loop: each fix is followed by a rebuild, a fix that does not help is
  undone, and what no rule can repair is listed for the user (the model is offered it only while one is already
  running — the built-in runtime, or a `llama-server` you started yourself). The request carries the form's
  `.adset` facts, so the model knows the row type and its columns, and that a control bound to a column holds
  that column's value rather than a row — the mistake that invented `DataGrid.Items`. A statement nothing
  terminated — a missing `;` — is its own finding (`insert-semicolon`), because the
  braces still balance and no structural rule can see it.

Rules aimed at code the **AI writes** (added 0.9.40, after the user asked whether the checker could cover the
generation feature too). The check runs the moment a model changes the code-behind, in both diff modes and also
in *manual* mode:

- **A handler nothing calls** — a `<Control>_<Event>` method that exists while no element in the form asks for
  it (the model writes one happily). Fix writes the attribute onto the control, through the same edit the AI's
  wiring offer uses.
- **A name that is not a control of this form** — `Status.Text` where the form has `StatusDate1` (a `CS0103` at
  build time). Reported only when a control *starts with* the name used, and never rewritten: the report asks
  *"did you mean StatusDate1?"*, so `Console.WriteLine` and locals cannot produce noise.
- **A class or `namespace` inside a class** — the shape a pasted answer leaves behind, and the
  `CS1513: } expected` a real report produced. Fix keeps the members and drops the wrapper.
- **Braces that do not balance** — a truncated answer left a method or the class open. Fix closes them at the
  end of the file, one per line.
Findings appear in the designer's list **and** in the **PROBLEMS** pane (diagnostics on the
`.vb`/`.cs`, or on the `.axaml` for XAML-side findings such as a wired handler that doesn't exist).
Each finding has **Go to line** and, when the repair is mechanical, **Fix**; **Fix all** applies
every mechanical repair. A finding that needs a human decision (invalid/duplicate `x:Name`,
`x:Class` mismatch, a stale name still used in hand-written code) is listed without a Fix button.
Before the first fix of a run the code-behind is copied into the extension's storage; the checker
itself is read-only.

**Parsing limits it used to have (fixed in beta.6, pinned by `tests/t2-logic/codeFix.test.js`):** a
C# **constructor** has no return type, so a `void`-based method scan did not see it (a bogus *“No
constructor / InitializeComponent”* warning, and a fix that added a **second** constructor); VB
**one-line lambdas** (`Function(r) r.Name`, `Sub(s, e) DoIt()`) were counted as blocks and unbalanced
the enclosing method's span; and an inserted call landed after the signature (before an Allman `{`)
or above `Inherits`. Constructors are now parsed, one-line lambdas are skipped, statements go inside
the body, and a Data-Image call goes after `InitializeComponent()`.

---

## Default events & auto-wiring

Interactive controls carry a **default event** that is wired **automatically when you place the
control** (the handler attribute, e.g. `Click="Button1_Click"`, is written into the XAML **and** the
code-behind stub is generated on the spot) — unless the event chooser is enabled, in which case
placing the control asks which event(s) to wire (`avaloniaDesigner.askEventOnPlace`). The default
events live in the generated catalog `src/controlEvents.ts` (the older hand-written mapping in
`src/codeBehind.ts` now just delegates to it):

| Control | Default event |
|---------|----------------|
| Button | `Click` |
| CheckBox / RadioButton | `IsCheckedChanged` |
| ComboBox / ListBox / TabControl / DataGrid | `SelectionChanged` |
| TextBox | `TextChanged` |
| any other control | `DoubleTapped` (fallback) |

> **Every event per control — with its handler signature — is in `Events per Control.md`** (generated
> from the real Avalonia 12.1.1 assemblies), together with the curated list the event picker offers
> and the `EventArgs` each handler must take (VB.NET is strict about it: `AVLN:0004`).

> **Middle-click = the handler menu.** Since placement already inserts the handler, middle-
> clicking (the scroll wheel) a control lists the events wired on it and opens the one you pick — it
> does not write anything when the handler already exists; a ⚠ marks an event whose handler was
> deleted (recreate it from there), and **Add event…** wires another one. It only creates the stub as a fallback if the
> method is somehow missing (e.g. a control placed before this behaviour, or hand-written XAML).
> Layout containers and non-interactive types (`Image`, `Panel`, `Grid`, `StackPanel`, `DockPanel`,
> `WrapPanel`, `Menu`, `StatusBar`, `StatusDate`) have **no** default event
> (`hasDefaultEvent()` returns `false`) and are placed as-is, with no handler auto-wired.
>
> If the wiring and the code-behind drift apart (hand-edited XAML, a deleted control, a renamed
> handler), run **🩺 Code Fix…** in the designer toolbar: it lists every missing/left-over handler
> and the signature mismatches, and fixes them (see *Special behaviors → Code Fix…*).

---

## Docking (the Dock property)

Available on: `ListBox`, `Image`, `Panel`, `Grid`, `StackPanel`, `WrapPanel`, `TabControl`,
`DataGrid`, `Menu`, `StatusBar` (the Border the Status Bar inserts).

A drop-down in the Properties panel with values **None / Left / Top / Right / Bottom / Fill**:

- **None** — removes the `DockPanel.Dock` attribute (control stays where placed).
- **Left / Right** — stretches vertically, pinned to that side.
- **Top / Bottom** — stretches horizontally, pinned to that edge.
- **Fill** — fills the remaining space; the designer moves the control to be the **last child** of the
  `DockPanel` and turns `LastChildFill` on (a DockPanel's last child is what "fills").

> **Dock only takes effect when the control's **parent is a `DockPanel`. If it isn't (e.g. the
> control sits on the Body Canvas), the designer **auto-docks it into the form's root `DockPanel`**.
> Inside a **GrumpyPanel** (which is its own dock region) a dock-able control docks to that
> panel's edge instead, never leaving the panel.

---

## Anchoring (the Anchor property)

Every non-root control whose **direct parent is a Canvas** (free placement) or a **DockPanel**
gets an **Anchor** drop-down: `None / Left / Right / Top / Bottom / Left,Right / Top,Bottom /
Left,Bottom / Right,Bottom / Left,Top / Right,Top`.

- **On a Canvas** — WinForms-style free anchoring: the control keeps a fixed distance from its
  anchored edges as the canvas resizes. Anchored to one edge → it moves with that edge; anchored to
  two OPPOSITE edges (`Left,Right` / `Top,Bottom`) → it **stretches** between them.
- **Inside a DockPanel** — e.g. a **Status Bar** strip — an edge Anchor **docks** the control to
  that edge (the designer mirrors it as `DockPanel.Dock`, so the preview and runtime agree). This is
  how a **StatusDate** or **TextBlock** — which have no Dock property of their own — is pinned, e.g.
  **Anchor = Right** keeps a status date hugging the right edge as the window resizes.
- The **top-level bars** the template docks into the form's layout DockPanel (the Menu bar, the
  Status Bar strip itself, the Body canvas, a SplitPanel) are structural and do **not** offer Anchor.

A **GrumpyPanel** is the one control with a **dedicated 8-position Anchor** — Left / Right / Top /
Bottom / Top-Left / Top-Right / Bottom-Left / Bottom-Right — offered wherever the panel sits
(non-root). On a Canvas the corner anchors pin that corner of the panel (keeping a gap) as the
canvas resizes; inside a DockPanel an edge anchor docks it to that edge.

Anchoring requires the bundled `AnchorHelper.cs`/`.vb` (generated projects include it automatically;
the designer refreshes an older copy when you use a chrome/anchor property, or you can copy it next to
`ChromeWindow`).

---

## Controls that appear in templates (not in the toolbox)

These framework controls are **used by the form templates** but are not directly placeable from the
Toolbox — they are created for you by the template engine (`src/formTemplates.ts` /
`src/projectScaffold.ts`):

| Control | Where it appears |
|--------|------------------|
| `Canvas` | Body Canvas of the Blank template; each `TabControl` tab's body; **Move to container… → ➕ New Canvas…** |
| `Border` | Status Bar pattern; About dialog styling |
| `ScrollViewer` | Scroll-aware layout support (property catalog) |
| `TabItem` | Children of a `TabControl` (added/removed from the Properties panel) |
| `MenuItem` | Children of a `Menu` |
| `Window` / `ChromeWindow` | The form root (custom title-bar window for new projects) |
| `UserControl` | Alternative root base type when creating a new form |
| `DatePickerPresenter` / `TimePickerPresenter` / `PickerPresenterBase` | Internal presenters for the date/time pickers |
| `CalendarButton` / `CalendarDayButton` / `CalendarItem` | Internal parts of the `Calendar` |

---

## Appendix: controls new in Avalonia 12

The controls below are new in Avalonia 12.x (they don't exist in the earlier 11.x line). The Previewer
Host now also runs **12.1.1**, and the toolbox items that use them are realised by their **real types**
and render in the designer exactly as at runtime (through the programmatic builder — the headless host
has no string-XAML loader, so every form is built from its XML). Controls in this appendix that are
not wired into the toolbox can still be hand-written into XAML; the host simply drops any type it
isn't told how to realise (no preview for those, but they still compile & run in your app):

> **Toolbox (Avalonia 12 controls):** `GroupBox` (Layout panels), `HyperlinkButton` and the
> `CommandBar` family — `CommandBar`, `CommandBarButton`, `CommandBarToggleButton`,
> `CommandBarSeparator` (Buttons & command controls). Saved as the real Avalonia 12 tag and rendered
> with their real Fluent look by the 12.1.1 host. Drop controls inside a GroupBox to make its content.
> CommandBar commands belong under `CommandBar.PrimaryCommands` (added in the XAML until a designer
> editor exists). The Properties panel lists the real properties (Header, Navigate Uri, Label, …).

| Control | What it does |
|---------|--------------|
| `CommandBar` / `CommandBarButton` / `CommandBarSeparator` / `CommandBarToggleButton` | A command bar with buttons, separators and toggle buttons. |
| `Page` / `NavigationPage` / `ContentPage` / `TabbedPage` / `CarouselPage` / `MultiPage` / `SelectingMultiPage` / `PageNavigationHost` / `DrawerPage` | XAML-style page/navigation controls (single-page / multi-page navigation hosts). |
| `GroupBox` | A group box with a header around its content. |
| `HyperlinkButton` | A button that navigates to a URI. |
| `PipsPager` | A pager that shows a row of "pips" (dots) for paging between items. |
| `TableView` / `TableViewCell` / `TableViewColumnHeader` / `TableViewRow` | A table-style view (columnar, non-editable rows). |
| `TableViewCellsPresenter` / `TableViewColumnHeadersPresenter` | Presenters used by the `TableView` template. |
| `TextSelectionHandle` / `TextSelectorLayer` | Infrastructure for text selection handles/cursors in editable text. |

---

*Control set and summaries derived from the installed Avalonia assemblies —
`~/.nuget/packages/avalonia/12.1.1` (`Avalonia.Controls.xml` + reflection over
`Avalonia.Controls.dll` / `Avalonia.Controls.DataGrid.dll`). See `USER_MANUAL.md` for the full
user guide and `NOTES.md` for the designer support matrix.*
