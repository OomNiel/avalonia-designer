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
| Designer Previewer Host (`host/PreviewerHost.csproj`) | **11.0.10** |
| New projects scaffolded by this extension (`src/projectScaffold.ts`) | **12.1.1** |

The main tables below list the controls in **Avalonia 11.0.10** (the version the designer host
renders). Controls added in **12.1.x** are listed separately in [Appendix: controls new in Avalonia
12](#appendix-controls-new-in-avalonia-12). Summaries come from the framework XML documentation
(`/Avalonia.Controls.xml`); a handful of internal/template parts have no published summary and are
described by role instead.

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
| HyperlinkButton | `HyperlinkButton` | *(Avalonia 12)* A button that navigates to a URI. | — |
| Menu | `Menu` | A top-level menu control (the menu bar). | ✅ Toolbox |
| MenuItem | `MenuItem` | A menu item control. Add `Header` children to a `Menu`. | ✓ |
| MenuBase | `MenuBase` | Base class for menu controls. | — |
| NativeMenuBar | `NativeMenuBar` | A menu bar hosted by the native platform. | — |
| RepeatButton | `RepeatButton` | A button that raises its command repeatedly while pressed. | ✓ |
| SplitButton | `SplitButton` | A button with a primary part and a secondary part that opens a flyout. | ✓ |
| ToggleButton | `ToggleButton` | A control the user can check/uncheck (base for `CheckBox`/`RadioButton`). | — (base class) |
| ToggleSplitButton | `ToggleSplitButton` | A split button whose primary part is toggleable; the secondary part opens a flyout. | ✓ |
| ToggleSwitch | `ToggleSwitch` | A Toggle Switch control. | ✓ |
| ButtonSpinner | `ButtonSpinner` | A spinner control that includes two Buttons (used by date/time pickers). | — (template part) |

---

## Input & text editors

| Control | XAML tag | What it does | Designer |
|---------|----------|--------------|----------|
| TextBox | `TextBox` | Represents a control to display or edit unformatted text. | ✅ Toolbox |
| MaskedTextBox | `MaskedTextBox` | A `TextBox` that constrains input using a mask (e.g. phone numbers). | ✓ |
| NumericUpDown | `NumericUpDown` | A TextBox with spinners that increment/decrement numeric values. | ✓ |
| AutoCompleteBox | `AutoCompleteBox` | Provides a text box for input plus a drop-down of possible matches. | ✓ |
| TimePicker | `TimePicker` | A control that lets the user select a time. | ✓ |
| SelectableTextBlock | `SelectableTextBlock` | A text block whose text can be selected by the user. | ✓ |
| TextBlock | `TextBlock` | Displays a block of (static) text. | ✅ Toolbox *(as "Label")* |
| Label | `Label` | A label that moves focus to a target on click / access-key. | ✓ |
| AccessText | `AccessText` | A text block that underlines a character (prefixed with `_`) as a keyboard access key. | ✓ |
| Image | `Image` | Displays a picture (`Source` = file path or `avares://` URI). | ✅ Toolbox |
| PathIcon | `PathIcon` | An icon drawn from a `Geometry`/path data. | ✓ |
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
| TreeView | `TreeView` | Displays a hierarchical tree of data. | ✓ |
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
| Path / Polyline / Polygon | `Path`, `Polyline`, `Polygon` | Free-form / multi-point shapes. | ✓ (rendered) |

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
> **Undo/Redo:** bound grids support **Ctrl+U** (undo) and **Ctrl+R** (redo) for add / edit /
> delete, up to a configurable depth. The depth is set with the **'Undo-Redo'** property on the
> DataGrid in the form designer (default 5; 0 disables undo) — it's stored in the bound table's
> `.adset` and regenerates the DataSet class.

> **DataSet (toolbox):** not a framework control — it's a **designer tool**. Clicking it opens the
> DataSet schema designer (`*.adset`) to design ADO.NET tables + columns and generate a runtime
> DataSet class (C#/VB) + `.xsd`. See *Special behaviors → DataSet* below.

---

## Progress, status & misc

| Control | XAML tag | What it does | Designer |
|---------|----------|--------------|----------|
| ProgressBar | `ProgressBar` | Indicates the progress of an operation. | ✓ |
| TickBar | `TickBar` | Used to draw a control's tick marks (used by `Slider`). | — |
| Slider | `Slider` | Lets the user select a value from a range by dragging a Thumb. | ✓ |
| RangeBase | `RangeBase` | Base class for controls that display a value within a range (`Slider`/`ProgressBar`). | — (base class) |
| Track | `Track` | A track along which a `Thumb` slides (used by `Slider`/`ProgressBar`). | — (template part) |
| Thumb | `Thumb` | A draggable element used in sliders and resize handles. | — (template part) |
| Separator | `Separator` | A separator line between groups of items. | ✓ |
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
| **Custom Title Bar** (toolbox) | `chrome:ChromeWindow` root | Replaces the window's default OS title bar with the bundled ChromeWindow bar (drag/min/max/close). Not a control — a **window-root action**. | ✅ Toolbox *(action)* |

---

## Special behaviors

### Custom Title Bar (ChromeWindow)
New projects and new forms use the **default Avalonia title bar** (a plain `<Window>` root). The
toolbox's **Custom Title Bar** converts a Window-rooted form to the bundled **ChromeWindow** custom
title bar (dark-navy bar with drag / min / max / close):

- Drop it anywhere on the form (or click the tool, then click the canvas). The root becomes
  `<chrome:ChromeWindow>`, the code-behind base class changes to `AvaloniaChrome.ChromeWindow`,
  and the window grows by the 44px title bar so the body stays the same size.
- Edit the title text via **Properties → Title Bar Text** (and the optional Title Bar Icon).
- The **designer preview mirrors the whole title bar**: dark-navy bar, centred title, the min /
  max / close caption buttons on the right, and the **Title Bar Icon** on the left (the icon is
  resolved from the project's `Assets\` when set via the file browser, so it shows in the designer
  as well as at runtime).
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

### Menu
The **Menu** tool inserts a `Menu` docked to the top with one starter `MenuItem` ("File"). Add more
`MenuItem`s as children, each with a `Header`. There is no separate `MenuBar` control in Avalonia —
`Menu` is itself, the bar.

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
- v1 is **schema-only** — no `DataRelation`s yet.

---

## Default events & auto-wiring

A subset of interactive controls carry a **default event** the designer can middle-click to wire (the
handler is written into the XAML **and** the code-behind stub is generated). Mapping in
`src/codeBehind.ts`:

| Control | Default event |
|---------|----------------|
| Button | `Click` |
| CheckBox / RadioButton | `IsCheckedChanged` |
| ComboBox / ListBox / TabControl / DataGrid | `SelectionChanged` |
| TextBox | `TextChanged` |
| any other control | `DoubleTapped` (fallback) |

> **Recent change:** placing a control **no longer** auto-wires its event — middle-click the control
> to generate the handler. Layout containers and non-interactive types (`Image`, `Panel`, `Grid`,
> `StackPanel`, `DockPanel`, `WrapPanel`, `Menu`, `StatusBar`, `StatusDate`) have **no** default
> event (`hasDefaultEvent()` returns `false`), so middle-click does not wire them.

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

> Dock only takes effect when the control's **parent is a `DockPanel`**. If it isn't (e.g. the
> control sits on the Body Canvas), the designer **auto-docks it into the form's root `DockPanel`**.

---

## Anchoring (the Anchor property)

Every non-root control placed on a **Canvas** gets an **Anchor** drop-down:
`None / Left / Right / Top / Bottom / Left,Right / Top,Bottom / Left,Bottom / Right,Bottom /
Left,Top / Right,Top`. Opposite-edge pairs (`Left,Right` / `Top,Bottom`) make the control
**stretch** with the container. Anchoring requires the bundled `AnchorHelper.cs`/`.vb` (generated
projects include it automatically; existing projects can copy it next to `ChromeWindow`).

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

The following controls exist in Avalonia 12.x (used by projects the extension scaffolds) but are
**absent from the 11.0.10 previewer host**. They are real framework controls usable in generated
projects, but the designer host (11.0.10) renders them only via its programmatic fallback:

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
`~/.nuget/packages/avalonia/11.0.10` and `12.1.1` (`Avalonia.Controls.xml` + reflection over
`Avalonia.Controls.dll` / `Avalonia.Controls.DataGrid.dll`). See `USER_MANUAL.md` for the full
user guide and `NOTES.md` for the designer support matrix.*
