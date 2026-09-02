# Avalonia Designer for VS Code — User Manual

> The Avalonia Designer lets you **build Avalonia forms visually** — drag controls from a
> toolbox onto a design surface, set their properties in a friendly panel, and let the extension
> generate the XAML **and** the code-behind for you.
>
> It is aimed at **beginners**, especially people new to Avalonia and Linux. Everything is
> guided: every control has a plain-language explanation, every property has a helpful editor and
> a hover description, and the code-behind is created for you.
>
> **This document is kept up to date as the extension grows.** (Latest revision: 2026-08-28)

---

## Table of contents

1. [What the extension does](#1-what-the-extension-does)
2. [Creating a new project](#2-creating-a-new-project)
3. [Installation & first run](#3-installation--first-run)
4. [Opening a form in the designer](#4-opening-a-form-in-the-designer)
5. [The Toolbox](#5-the-toolbox)
6. [Adding a control to the canvas](#6-adding-a-control-to-the-canvas)
7. [Selecting, moving, resizing, deleting](#7-selecting-moving-resizing-deleting)
8. [The Properties panel](#8-the-properties-panel)
   - [Tab Items (TabControl)](#tab-items-tabcontrol)
   - [List Items (ListBox)](#list-items-listbox)
   - [Items (ComboBox / ListBox / ItemsControl)](#items-combobox--listbox--itemscontrol)
9. [The "About this control" help panel](#9-the-about-this-control-help-panel)
10. [The right-click menu (Cut / Copy / Paste / Move / Delete)](#10-the-right-click-menu)
11. [Creating a new form (templates)](#11-creating-a-new-form-templates)
12. [Code-behind: events made easy](#12-code-behind-events-made-easy)
13. [Clearing the canvas](#13-clearing-the-canvas)
14. [Keyboard shortcuts](#14-keyboard-shortcuts)
15. [Layout basics: containers](#15-layout-basics-containers)
35:16. [Custom title bar (ChromeWindow)](#16-custom-title-bar-chromewindow)
17. [Known issues & tips](#17-known-issues--tips)
18. [The DataSet designer](#18-the-dataset-designer)

---

## 1. What the extension does

- **WYSIWYG designer** — open any `.axaml` file in a visual designer tab.
- **Toolbox** — a sidebar full of Avalonia controls; click a tool, then click the canvas to place it.
- **Properties panel** — change a control's size, position, colours, fonts, margins and more,
  with pickers and plain-language descriptions instead of raw XAML.
- **Code-behind generation** — placing an interactive control automatically wires its default
  event handler (the method is created in your C# or VB.NET code-behind on the spot); middle-click
  (press the scroll wheel) a control to jump straight to its handler.
- **New Form templates** — ready-to-build starting points (Blank, Login, Data entry, About,
  Main window) in C# or VB.NET.
- **New Project** — create a complete C# or VB.NET Avalonia project (net10.0, Avalonia 12) with
  a custom title bar and a pre-designed main form, then design it visually.
- **Docking** — pin controls (Menu, Status Bar, panels, …) to the edges of a DockPanel using the
  **Dock** property.
- **DataSet designer** — design ADO.NET `DataSet` tables and columns visually, then generate a
  runtime class (C#/VB) that builds the DataSet, plus an `.xsd` schema.
- **Clean-up helpers** — Delete and Clear Canvas remove the control *and* its code references.

---

## 2. Creating a new project

You can create a **complete, ready-to-run Avalonia project** — C# or VB.NET — straight from
this extension. No CLI templates and no extra tools: just answer a few questions and the
whole project is generated for you (including a main form with the **default title bar** — you can
switch to the extension's custom title bar from the Toolbox at any time).

1. Click the **Avalonia Designer** icon in the Activity Bar (the toolbox icon). The sidebar
   shows two views — **New Project** at the top, then **Toolbox** below — so open the **New Project**
   view and click **Create C# Project…** or **Create VB.NET Project…**.
   (Or run **Avalonia: New Project…** from the Command Palette.)
   The sidebar buttons already know the language, so the **first question is the template**.
   The generic **Avalonia: New Project…** command asks the language first, then the template.
2. Choose a **starting template** for the main form — see [section 11](#11-creating-a-new-form-templates)
   for the list: Blank, Login, Data entry, About, or Main window.
3. Enter a **project name** — this becomes the folder name and the .NET namespace.
4. The project **folder is created for you automatically** (named after the project) — inside the
   current workspace folder if one is open, otherwise you'll be asked to pick a parent folder once.

The extension writes a full project for you:

- `<name>.csproj` / `<name>.vbproj` — **net10.0** with **Avalonia 12.1.1** (Fluent theme, Inter font)
- `App.axaml` + `Program.cs` / `Program.vb` — the application entry point
- `MainWindow.axaml` + code-behind — your main form, built from the chosen template (the *same*
  template engine as the **New Form** tool)
- `ChromeWindow.cs` / `ChromeWindow.vb` — the bundled custom title bar, ready for the Toolbox's
  **Custom Title Bar** tool (see [section 16](#16-custom-title-bar-chromewindow))
- `.vscode/settings.json` (VB projects only) — configures the VB.NET Companion language server

When creation finishes, choose **Open Project** to open it in a new window. The **first time** a
new project's folder is opened, the terminal opens automatically and runs `dotnet build` for
you — so you immediately see whether it compiles. Then use the **Avalonia Designer** toolbox to
edit `MainWindow.axaml` visually. The **Open Created Project** button (or **Avalonia: Open
Created Project**) reopens your most recent project any time.

> New projects are **already wired up**: the main form is set as the app's main window, so
> `dotnet build` then `dotnet run` just works.

---

## 3. Installation & first run

The extension is installed as a `.vsix` file:

```bash
code --install-extension avalonia-designer-1.0.0.vsix --force
```

After installing (or after any update), **reload the window** so the changes take effect:
`Ctrl+Shift+P` → **Developer: Reload Window**.

The first time you open a form in the designer, the extension **auto-builds the C# previewer
host** (this takes a few seconds — you'll see status messages). It also rebuilds the host
automatically whenever the host source code changes.

> You need the **.NET SDK** installed for the previewer host to build.

---

## 4. Opening a form in the designer

`.axaml` files open in the **normal text editor** by default — the designer is opt-in.

- **Right-click** the `.axaml` file in the Explorer → **Avalonia: Open in Designer**.
- Or open the Command Palette → **Avalonia: Open in Designer**.

The designer opens in a custom tab with:

- A **canvas** (the form's design surface) in the middle.
- A **toolbar** at the top (New Form, zoom in/out, fit, clear selection).
- The **Properties panel** on the right.
- The **Toolbox** in the sidebar (revealed automatically).

---

## 5. The Toolbox

The Toolbox is the sidebar view **"Avalonia Designer → Toolbox"**. It lists the controls you can
place:

| Control | What it is |
|---|---|
| Button | A clickable button that performs an action |
| TextBox | A box where the user types text |
| Label (TextBlock) | Static text (a label or heading) |
| ComboBox | A drop-down list |
| ListBox | A list of items |
| ItemsControl | A list of items (no selection) |
| CheckBox | A tick box |
| RadioButton | A round option (one per group) |
| Image | Displays a picture |
| Panel | A simple layered container |
| Grid | Rows and columns layout |
| UniformGrid | Equal-sized grid tiles (rows/columns) |
| StackPanel | Stacks children in a line |
| DockPanel | Pins children to the edges |
| WrapPanel | Flows children like wrapped text |
| TabControl | Tabs |
| DataGrid | A spreadsheet-like table |
| Menu | A menu bar (File, Edit, …) |
| Status Bar | A bottom status strip |
| Status Date / Time | A live clock (current date + time, OS format) |
| DataSet | Design tables & columns visually, then generate a runtime DataSet class + .xsd — **opens the DataSet designer**, not a form control |

**Hover** over any tool to see a plain-language description and when to use it.

> **Note about Status Bar:** Avalonia has **no built-in StatusBar control**, so the Status Bar
> tool inserts the standard Avalonia pattern — a `Border` with a `TextBlock`. Dock it at the
> bottom with `DockPanel.Dock="Bottom"`.

> **Status Date / Time** places a live clock — a `TextBlock` that shows the current system date
> and time (in your OS's date/time format) and updates itself every second. The designer writes
> the small timer code-behind for you, so no code is needed; put one in a Status Bar's `Border`
> for a classic status-bar clock.

The Toolbox toolbar has three buttons: **New Form**, **Refresh Designer**, and **Clear Canvas**.

---

## 6. Adding a control to the canvas

1. **Click** a tool in the toolbox (e.g. Button).
2. The status bar says *"Click the canvas to place a Button (Esc to cancel)"*.
3. **Click** the canvas where you want it.

The control is placed inside the container under your click. If the form's root is a **Canvas**,
it gets `Canvas.Left`/`Canvas.Top` (free position). If it's a **StackPanel** or **Grid**, it's
placed into that layout.

Interactive controls (Button, CheckBox, RadioButton, TextBox, ComboBox, ListBox, TabControl,
DataGrid) have a **default event** (e.g. `Click` for a Button). When you **place** such a control,
the extension **immediately wires it up**: it adds the event to the XAML (e.g. `Click="Button1_Click"`)
and creates the handler method in your code-behind — you just fill in the body. Containers
(Grid, StackPanel, Image, …) have no default event and are placed as-is. Middle-click a control
any time to jump straight to its handler. See [Section 12](#12-code-behind-events-made-easy).

> Drag-and-drop from the toolbox also works, but on Linux/Xorg it can be unreliable — the
> **click-then-click** method always works.

---

## 7. Selecting, moving, resizing, deleting

- **Select** — click a control on the canvas. Its outline appears, and its properties load.
- **Move** — click and drag the control.
  - Inside a **Canvas**: it moves by `Canvas.Left` / `Canvas.Top`.
  - Inside a **StackPanel / Grid / etc.**: it moves by `Margin` (order/layout is still governed by
    the container).
- **Resize** — drag the small handles on the selection outline.
- **Delete** — press `Delete`/`Backspace`, or right-click → **Delete**.
  - Deleting also removes the control's event-handler methods from the code-behind (only the ones
    no other control uses).

**Selecting the form itself** — click **empty space** on the design surface (or pick the top entry,
**Form - <window title>**, in the control drop-down). This selects the **Window**, so its
**Width / Height / Title / CanResize** appear in the Properties panel — changing **Width/Height
resizes the whole design surface** to the new form size. (The structural Body canvas and Root panel
are locked in place and cannot be moved/resized directly.)

---

## 8. The Properties panel

Selecting a control shows its properties on the right. At the very top there is a
**control drop-down list** showing every control on the form — pick one to **focus/select it**
(useful when controls overlap or are hard to click).

Every property has:

- A **friendly editor**: text box, number, drop-down, a picker, or (for file properties) a text
  box with a **"…" Browse** button.
- A **hover description** explaining what it means.

**File properties** — the three that take a file (**Image → Source**, **Window → Icon**,
**ChromeWindow → Title Bar Icon**) — have a **"…"** button that opens the **system file picker**.
Picking a file copies it into the project's `Assets\` folder, registers `Assets\**` as an
`AvaloniaResource` in the `.csproj/.vbproj`, and sets the property to the portable
`avares://ProjectName/Assets/…` URI (so the project runs on any machine). You can still type a
path or `avares://` URI directly in the box.

The designer **shows the actual image**: `<Image>` controls and the ChromeWindow title-bar icon
resolve their `avares://ProjectName/Assets/…` source against the project's `Assets\` folder, so the
picture appears in the preview exactly as it will at runtime (only unnamed images, or images inside
templates/styles, show a placeholder).

**Items Source asset picker** — for ComboBox / ListBox / ItemsControl / DataGrid, the **Items
Source** property has a **"…"** button that opens a picker listing every **bindable asset** in the
project: the form's own array/collection fields and properties, **Public Shared / module**
collections in any `.cs`/`.vb` file (arrays, `List<T>`, `ObservableCollection<T>`, `IEnumerable<T>`,
`DataView`, `DataTable`), and every **DataSet table**. Picking one writes
`Control.ItemsSource = <asset>;` into the form's constructor (works at runtime with no DataContext);
picking a DataSet table binds it through the normal DataSet path. The field then shows the binding
**read-only** — use the "…" button again to change or clear it. You can still type a XAML binding
into the box manually.

Every listed property shows its **current value**. Even properties you haven't set are filled in
with the value the control is actually using **right now** — sizes, margins, fonts, padding,
borders and colours are read from the live preview (for example the theme's font size and button
padding), so you can see exactly what the control looks like and tweak it. Properties that
genuinely have nothing to show yet (like an empty **Text** field) stay blank until you type into
them, and the list only contains properties that are **valid** for the selected control.

Every control has a **Theme** row (right after **Name** and **Type**):

- **Theme = System** *(default)* — the control **follows the OS theme** (light/dark). It has no
  fixed colours, so it looks right in both light and dark mode automatically.
- **Theme = Custom** — the control uses the **colours you set** (Background, Text Color, etc.)
  and keeps them fixed. Setting any colour switches the control to Custom automatically.
- Your custom colours are **remembered** — switching to System then back to Custom restores your
  latest colours (the backup survives saving and reopening the form).
- Pick **System** to clear a control's colours and go back to following the theme.

Helpful editors include:

- **Color** — a colour swatch picker + text box with named-colour suggestions (e.g. `Red`,
  `#RRGGBB`). The picker **stays open while you choose** — the colour is applied when you
  confirm it (press Enter / OK).
- **Text Color (Foreground)** — the colour of the text.
- **Opacity** — entered as a **percentage**: `0` = fully transparent, `100` = fully opaque.
- **Font** — a font-family drop-down.
- **Margin** — a text box with preset suggestions (`0, 4, 8, 12, 16, 24, 32, 48`).
- **Sizes** — numbers with a `px` unit shown.

### Beginner mode

The most useful properties are shown by default. Tick **"Show advanced"** at the top of the panel
to reveal the rest (sizing constraints, focus/input, commands, grid internals, window-chrome
extras, and so on). Novices can ignore them.

The first rows are **Name**, **Type** and **Theme** — the control's name (used for code-behind),
its Avalonia type, and whether it follows the OS theme or uses fixed colours.

Names must be **unique** — if you type a name that's already in use, the designer warns you and
keeps the previous name. Auto-assigned names (from the toolbox) always pick a free number (e.g.
`Button1` → `Button2`). When a control's name changes, its default text (Button/TextBlock)
follows the name automatically — but a label you typed yourself is kept as-is.

### Tab Items (TabControl)

When you select a **TabControl**, a **"Tab Items"** section appears at the bottom of the
Properties panel. From here you can manage each tab page:

- **Header** — the text shown on the tab label (editable text box).
- **Content** — the tab's content (editable text box).
- **✕ Remove** — deletes that tab page. The control's code-behind handlers (if any) are
  cleaned up automatically.
- **+ Add Tab** — adds a new tab page.

A TabControl always has at least one tab. If you remove the last one, a new "Page N" tab is
added automatically. You can also middle-click a TabControl to add the default event
(`SelectionChanged`) — see [Section 12](#12-codebehind-events-made-easy).

> **Adding controls to a tab:** every tab ships with a **visible body** — a DockPanel with a
> Canvas inside that fills the tab (everything except the tab strip). Click a tab's **header** to
> make it the active tab, then arm a tool in the Toolbox and **click inside that tab's body** on
> the canvas — the control is placed there at the click position (free placement). Placing a
> control never creates a new tab — use **+ Add Tab** to add tab pages.

### List Items (ListBox)

When you select a **ListBox**, a **"List Items"** section appears at the bottom of the
Properties panel. From here you can manage the items the list shows:

- **Text box** — the item's text (edit it to rename the item). For control-based items this
  edits the control's label (e.g. a Button's text).
- **✕ Remove** — deletes that item.
- **+ Add Item** — asks which kind of item to add (Text item, TextBlock, Button, Check Box,
  Radio Button, Image, Text Box, Combo Box, Stack Panel, Grid), then adds it to the list.

A ListBox can be empty (the list just shows nothing until you add items). The code-behind stays
in sync — editing item text or removing items keeps your form clean. The ListBox **grows**
automatically as you add items (and **shrinks** when you remove them), so all items stay visible.

A newly placed ListBox is **empty**, and its items **auto-size to the font** (compact rows, no
large default padding) so lists look tight and follow the form's font size.

### Items (ComboBox / ListBox / ItemsControl)

When you select a **ComboBox**, **ListBox** or **ItemsControl**, the Properties panel shows an
**"Items"** property. Click **"Edit items…"** to open the item editor — a small popup with a text
area where you type **one item per line**:

- Each line becomes an item (`ComboBoxItem`, `ListBoxItem`, or a `TextBlock` for an ItemsControl).
- Blank lines are ignored.
- Click **Save** to write the items into the form (they show in the designer and at runtime, and
  persist with the form). Click **Cancel** (or press **Esc**) to discard your edits.
- If the control already has items with names, events or custom content, the designer asks for
  confirmation before replacing them with the typed text items.

The **Items** property is disabled when the control's items come from a bound **DataSet table** or
an **ItemsSource** — use the DataSet designer to manage those instead.

---

## 9. The "About this control" help panel

At the top of the Properties panel there's a collapsible **"About this control"** box. When you
select a control it explains, in plain language:

- **What it does**
- **When to use it** (with a 💡 tip)

This is the same information as the toolbox tooltips. It's your quick reference while learning.

---

## 10. The right-click menu

Right-click a control on the canvas for:

- **Cut** — remove the control and put it on the clipboard (`Ctrl+X`).
- **Copy** — copy the control (`Ctrl+C`).
- **Paste** — insert the clipboard control into the container under the cursor (`Ctrl+V`).
  - Pasting a Copy gives the new control a unique name (e.g. `Button1` → `Button1_2`).
  - The clipboard is shared across all designer tabs (cut from one form, paste into another).
  - The status bar tells you which container the paste landed in.
- **Move to container…** — relocate the control into another container (quick-pick list).
  - **➕ New Canvas…** (always first) — creates a fresh `Canvas` (240×140) and moves the control
    into it, giving it free X/Y placement.
  - Moving between containers **preserves the code-behind** (event handlers stay attached).
  - Moving into a **TabControl** places the control inside the **visible tab's body** (its
    free-placement Canvas), not as a raw item on the tab strip.
  - The XAML is kept tidy: moving out of a `Canvas` removes `Canvas.Left/Top`, out of a `Grid`
    removes `Grid.Row/Column`, etc.; moving *into* a `Canvas` sets `Left="0" Top="0"`.
- **Delete** — remove the control (and its now-unused code-behind methods).

Right-clicking **empty canvas space** shows only **Paste** (and paste works there).

---

## 11. Creating a new form (templates)

Use **Avalonia: New Form** (Command Palette or the **New Form** button in the Toolbox toolbar).

1. **Language** — C# or VB.NET.
2. **Template**:
   - **Blank form** — an empty form on a **DockPanel** root with a free-form **Body Canvas**
     that fills the window (free placement; resizes with the window). Asks Window or UserControl.
   - **Login form** — username/password + Sign In (handler pre-wired).
   - **Data entry form** — a labelled grid of fields + Save (handler pre-wired).
   - **About dialog** — a small centred dialog; OK even closes the window.
   - **Main window (Menu + Status bar)** — a File menu, a status bar, and a content area.
3. **Name** — a valid identifier (e.g. `MyForm`, `frmMain`).

The extension creates the `.axaml` **and** the code-behind, and opens the new form in the
designer. Every template **builds and runs out of the box** in both C# and VB.NET.

> **Tip:** for "draw anywhere" free placement, use the **Blank form** — its root is a `DockPanel`
> containing a **Body Canvas** that fills the window (so it resizes with the window). The other
> templates use `StackPanel`/`Grid`/`DockPanel` layouts, where controls stack/align rather than float.

---

## 12. Code-behind: events made easy

When you place an interactive control its default event is wired automatically (see above). To open
the handler, **middle-click** (press the scroll wheel) the control — the extension opens the
code-behind file with the cursor inside the handler body (the handler is created if it was somehow
missing).

Defaults per control:

| Control | Default event |
|---|---|
| Button | `Click` |
| CheckBox / RadioButton | `IsCheckedChanged` |
| ComboBox / ListBox / TabControl / DataGrid | `SelectionChanged` |
| TextBox | `TextChanged` |
| other controls | `DoubleTapped` |

### VB.NET conventions (handled for you)

- The code-behind includes `Imports Avalonia`, `Imports Avalonia.Controls`,
  `Imports Avalonia.Markup.Xaml` and a manual `InitializeComponent()` via
  `AvaloniaXamlLoader.Load(Me)`.
- `x:Class` is fully qualified (e.g. `TestVBApp.MainWindow`).
- **Every named control gets an accessor property** — so you can write `TextBox2.Text = "Hello"`
  directly in VB. The designer keeps these in sync automatically: add, rename or delete a
  control and the accessors follow (deleting a control also removes its accessor).

If a form has **no code-behind file**, the extension finds the class wherever it is — even inside
`Program.vb` (the "Avalonia VB Projects" generator declares `MainWindow` there) — and inserts the
handler into the right class without creating a duplicate.

---

## 13. Clearing the canvas

The **Clear Canvas** button (Toolbox toolbar, broom icon) removes **every** control from the
current form **and** removes all their event-handler methods from the code-behind (only the ones
no longer referenced). Use it to start a form over.

---

## 14. Keyboard shortcuts

| Keys | Action |
|---|---|
| `Ctrl+Z` | Undo the last edit (5 levels) |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Ctrl+X` | Cut selected control |
| `Ctrl+C` | Copy selected control |
| `Ctrl+V` | Paste clipboard (into the container at the design centre) |
| `Delete` / `Backspace` | Delete selected control |
| `Esc` | Cancel an armed toolbox tool / close the context menu |

**Undo / Redo** works in both the **form designer** and the **DataSet designer** (tables, columns,
properties, bind/un-bind), up to **5 steps** back. In the form designer it's fully reversible —
renaming a control or deleting one with event handlers also restores the **code-behind** methods,
so the form still compiles.

Shortcuts are ignored while you're typing in a text field (so normal text editing still works).

---

## 15. Layout basics: containers

In Avalonia, **every control lives inside a container** (a parent in the layout tree). What a
container does decides where its children go:

| Container | Behaviour |
|---|---|
| **Canvas** | No layout — children are positioned by `Canvas.Left` / `Canvas.Top` (free placement) |
| **StackPanel** | Stacks children in a line (vertical or horizontal) |
| **Grid** | Rows and columns |
| **DockPanel** | Pins children to top/bottom/left/right |
| **WrapPanel** | Flows children like wrapped text |
| **Panel** | Layers children on top of each other |

Key points:

- `Canvas.Left`/`Canvas.Top` only work when the direct parent is a **Canvas** — inside a
  StackPanel/Grid they are ignored (order/margin/alignment govern instead).
- **Resizing with the window:** the **Blank** template roots the form on a **DockPanel** with a
  **Body Canvas** inside it that fills the remaining space. Because the root DockPanel stretches,
  the whole form resizes with the window — a Status Bar (or anything) docked to an edge **stays
  pinned to that edge** when you resize, and the Body Canvas grows/shrinks to fill the rest.
- To make a control free-positionable, put it in a **Canvas** (use **Move to container… → New
  Canvas**, or build the form from the **Blank** template — the Body Canvas is the free-form area).
- To restructure a form, right-click a control → **Move to container…** and pick a new container;
  the code-behind is preserved.

### Docking (the Dock property)

**ListBox, Image, Panel, Grid, StackPanel, WrapPanel, TabControl, DataGrid, Menu and Status Bar**
all have a **Dock** property in the Properties panel (a drop-down):

- **None** *(default)* — **no docking** is applied: the control is simply drawn in its last placed
  position (not pinned to an edge, not filling).
- **Fill** — the control resizes to fill the available space **without drawing over any existing
  controls**.
- **Left / Right** — the control resizes to fill the **full free vertical space** and its side
  lines up with the **left / right** side of the container.
- **Top / Bottom** — the control resizes to fill the **full free horizontal space** and its edge
  lines up with the **top / bottom** side of the container.

Dock only has an effect when the control's parent is a **DockPanel** (a container that pins
children to its edges). If a side is already occupied, the next docked control sits **adjacent**
to the existing one (they stack toward the middle).

> **Good news:** you don't need to remember to add a DockPanel first! If you pick a Dock value
> on a control that isn't in a DockPanel (e.g. it's sitting in the Body Canvas), the designer
> **automatically docks it into the form's root DockPanel** — so it stays pinned to the form's
> edge and follows the window when you resize. (You can still add a DockPanel yourself via the
> Toolbox and arrange several docked controls deliberately.)

A typical layout:

```xml
<DockPanel>
    <Menu DockPanel.Dock="Top">…</Menu>
    <StatusBar DockPanel.Dock="Bottom">…</StatusBar>
    <Button Content="Fill" …/>   <!-- fills what's left -->
</DockPanel>
```

> **Notes:**
> - "None" and "Fill" aren't literal Avalonia values — Avalonia has no `None`/`Fill` dock.
>   Choosing **None** removes the `DockPanel.Dock` attribute and leaves the control where it is
>   (if it's the DockPanel's last child, `LastChildFill` is turned off so it doesn't auto-fill).
>   Choosing **Fill** removes the attribute **and** moves the control to be the **last child** of
>   the DockPanel, because a DockPanel's last child is the one that fills the remaining space.
> - Only one control can truly "fill" (the last one). If you set two controls to Fill, the most
>   recently set one wins.
> - **Why "nothing happens"?** A DockPanel's **last child always fills** (`LastChildFill="True"` by
>   default), so docking the *only* control in a DockPanel would silently fill instead of docking.
>   The designer now handles this automatically: side-docking the last child sets
>   `LastChildFill="False"` so it docks to its edge, and Fill restores `LastChildFill="True"`.
>   The designer also clears leftover `Margin` / `Canvas.Left/Top` and the explicit size on the
>   free axis when you dock, so the control really stretches and lines up with the container edge.
>   When you switch docks (e.g. Left → Bottom), the designer keeps a sensible **thickness** (Width
>   for Left/Right, Height for Top/Bottom) so the control never collapses out of view.
> - The **Menu** tool defaults to `Dock=Top` and the **Status Bar** tool to `Dock=Bottom`, ready
>   for a DockPanel layout.

### Anchoring (the Anchor property)

Every control that sits **inside a Canvas** also has an **Anchor** property (a drop-down near the
bottom of the list). It works like the classic WinForms **Anchor**: the control keeps a fixed
distance from the edge(s) of its container as the container resizes.

- **None** *(default)* — no anchoring; the control stays exactly where you placed it.
- **Left** — the control keeps its distance from the **left** edge (moves horizontally with it).
- **Top** — keeps its distance from the **top** edge (moves vertically with it).
- **Right** — keeps its distance from the **right** edge.
- **Bottom** — keeps its distance from the **bottom** edge.
- **Left,Right** — the control is pinned on both sides, so it **stretches** (grows/shrinks) with
  the container instead of moving.
- **Top,Bottom** — same, but vertically.
- Combinations like **Left,Bottom** pin the control to a corner: it stays that distance from the
  left **and** bottom edges as the window resizes.

> **Notes:**
> - Anchor only takes effect on a control whose **direct parent is a Canvas**. Inside a
>   StackPanel/Grid/DockPanel it is inert (their layout rules govern instead).
> - The Anchor property is provided by a small helper (`AnchorHelper`) that **New Project**
>   bundles automatically (in both C# and VB.NET projects), so you don't need to add anything.
> - **Existing projects:** a form you already have that isn't a generated project may not contain
>   the helper yet — if it doesn't, the project won't compile until you copy `AnchorHelper.cs`
>   (or `AnchorHelper.vb`) in, next to your `ChromeWindow.cs`/`.vb`. New projects get it for free.
> - The preview shows the control at its **designed** size/position; anchoring only takes effect
>   when the running app's window resizes.

---

## 16. Custom title bar (ChromeWindow)

New projects and new forms use the **default Avalonia title bar** — a plain `<Window>` root with the
OS window chrome. If you want the extension's dark-navy **custom title bar** (its own drag /
minimise / maximise / close buttons), use the Toolbox's **Custom Title Bar** tool:

- Drag it onto the form (or click the tool, then click the canvas). The root becomes
  `<chrome:ChromeWindow>` and the code-behind base class switches to
  `AvaloniaChrome.ChromeWindow`.
- The window grows by the **44 px** title bar so the body area stays the same size.
- Edit the title text via **Properties → Title Bar Text** (and optionally **Title Bar Icon**).
- It's a normal designer edit, so **Ctrl+Z** reverts to the default title bar (undo also restores
  the code-behind base class).
- Only **Window**-rooted forms can convert (a UserControl has no title bar). `ChromeWindow.cs/.vb`
  and `AnchorHelper` are bundled with every new project, so converting needs no extra files.

Window properties (Title, size, `CanResize`, …) appear for the form as usual, and the designer
preview mirrors the **whole** custom title bar so it matches the running app — the dark-navy bar,
the centred title, the minimise / maximise / close buttons on the right, and the **Title Bar Icon**
on the left (the icon is resolved from the project's `Assets\`, so it shows in the designer as well
as at runtime). Code-behind is discovered correctly even when the class lives inside `Program.vb`.

---

## 17. Known issues & tips

- **Changes need a reload** — after installing/updating the extension, reload the window.
- **Previewer host builds on first open** — the first designer open builds the C# host; give it a
  few seconds.
- **`StatusBar` doesn't exist in Avalonia** — the Status Bar tool inserts the standard
  `Border`+`TextBlock` pattern instead.
- **VB event handlers use the right signature automatically.** Generated `DoubleTapped`,
  `SelectionChanged` and `TextChanged` handlers (created by middle-clicking a control) get the
  exact event-args type the Avalonia XAML compiler needs, so VB projects build. (Handlers created
  before this fix with `RoutedEventArgs` may need their `e` type corrected manually.)
- **Third-party/custom controls** the previewer can't load render as an approximation or an error
  card (full support would require compiling your assemblies into the host).
- **Unnamed controls** get temporary in-memory names; they're stripped on save, but the file is
  re-formatted on save (comments kept, whitespace normalised).
- **Saving** — use the normal save (`Ctrl+S`); the designer writes tidy XAML and keeps your
  event handlers.
- **Theme preview** — the designer preview renders in the **light** theme, so a control set to
  **Theme = System** looks light in the designer but follows your actual OS theme (light or
  dark) when you run the app.

---

## 18. The DataSet designer

The **DataSet** item in the Toolbox (under **Data & Grid**) opens a visual **DataSet schema
designer** — a separate designer for designing ADO.NET `DataSet` **tables and columns**, not a
control you place on a form. Like the classic VS Dataset designer, but it generates a
**runtime-construction** class instead of strongly-typed code.

1. Click **DataSet** in the Toolbox → it asks for a name and creates a `MyData.adset` file,
   opening it in the designer. (Or use the Command Palette → **Avalonia: New DataSet…**.)
2. The canvas starts with one starter table (**Customers**) with a few columns. Drag the table
   header to move it.
3. **Right-click** the canvas → **Add table here**. Right-click a table → **Add column**,
   **Rename table**, or **Delete table**. Right-click a column → rename or delete it.
4. Click a table or a column to edit its fields in the Properties panel:
   - **Table** — its name (e.g. `Customers`).
   - **Column** — its **field name** (e.g. `Id`), **header text / Caption** (the heading shown
     in a grid, e.g. `ID`), **data type** (Text, Integer, Long, Double, Decimal, Boolean,
     Date & time, Guid, Byte[]), and **Allow null**.
5. Click **Generate Code** (top toolbar). The designer writes, next to your `.adset`:
   - `MyData.cs` or `MyData.vb` (language auto-detected from the project) — a class with
     `MyData.CreateDataSet()` that builds the tables/columns at runtime.
   - `MyData.xsd` — the schema, for interop/documentation.

### Binding a table to a control

You can **bind a table to a control** on one of your forms so the control shows its data — no
hand-written code needed:

1. Make sure the form with the control (e.g. a `ListBox` or `ComboBox`) is in the same project,
   and the control has a name (the Toolbox names it automatically, e.g. `ListBox1`).
2. In the DataSet designer, **click the table** on the canvas you want to display (the table
   header).
3. In the **DATASET** panel (top of the Properties side panel), pick that control from the
   **Bind to control** drop-down. The drop-down is disabled until a table is selected.
   - A `*` after a control's name means it is **already bound** to a dataset — those are disabled
     here (un-bind it from its other table first).
4. The designer writes the binding into the form's code-behind:
   - For a **DataGrid**, a persistent live grid: the constructor loads the table's rows from a data
     file and wires up the editing behaviour (see *Live editing in a bound DataGrid* below).
   - For a **ListBox / ComboBox / ItemsControl**, a public typed collection property named after the
     table (e.g. `Customers`) and a line `ListBox1.ItemsSource = Customers` in the constructor.
   (In VB the named control is accessed via the designer's FindControl accessor; in C# the
   generated field is used.)
   Binding also **adds a sample row** to the table in the generated `MyData.cs`/`.vb`, so the
   control shows a dummy record when you run the app (a DataGrid only seeds it when no saved data
   file exists yet).
5. Each column has a **Sample value** field (column properties): type the value you want in the
   sample row (e.g. `John Doe`, `1`, `true`, `2024-01-15`). Leave it blank for an automatic value.
6. Use the **Un-bind** button to remove the binding again (it deletes the generated wiring from the
   code-behind, drops the sample row, and clears the marker).

### Live editing in a bound DataGrid

A DataGrid bound to a table becomes a small data-entry grid, WinForms-style:

- There is a **blank row at the bottom** with **"+ Add row…"** in it. **Click it** to open a popup
  with one field per column (date picker for dates, a check box for Yes/No, a number box for
  numbers, text boxes otherwise). Fill it in and click **Save** — the row is added to the table.
- **Edit existing rows in place** — click a cell and type. **Date columns** pop up a **date
  picker** when you start editing them (the column must be typed `DateTime` in the `.adset`, e.g.
  `CreatedAt`); Yes/No columns show a check box; number columns a number box.
- An in-place edit is **saved automatically when you finish the cell** (Enter / Tab / click
  another row); press **Esc** to cancel without saving.
- **Right-click a row** → **Delete row** (asks for confirmation first).
- **Undo / Redo:** press **Ctrl+U** to undo the last add / edit / delete and **Ctrl+R** to redo it.
  Up to **5** steps are remembered by default — change the number with the **'Undo-Redo'** property
  on the DataGrid in the form designer's Properties panel (0 turns undo off).
- The rows are **saved to a data file** (`MyData.<Table>.xml` next to the app) so your
  add/edit/delete changes survive closing and re-running the app.

> **Notes about binding:**
> - The binding is written to the **code-behind**, not as a XAML attribute. For a DataGrid it loads
>   and wires a live grid (`_customers = MyData.LoadCustomers()` + `MyData.WireCustomersGrid(...)`);
>   for a list control it sets `Control.ItemsSource = <Table>`. So in the form designer's
>   Properties panel the **Items Source** field shows the binding as a read-only `MyData.Customers`
>   (it's managed by the DataSet designer, not by typing in that field).
> - If a table is marked as bound but the grid still shows no data at runtime, the code-behind wiring
>   may be missing (e.g. the project was recreated after binding) — click **Bind** again and the
>   designer re-writes it.
> - **DataGrid must have AutoGenerateColumns="True" in XAML** — but only so the **designer
>   preview** shows columns (Avalonia defaults it to False, so a bound grid would otherwise look
>   empty). At **runtime** `MyData.Wire<T>Grid(...)` switches it off and builds **typed columns in
>   code**: text/number → text columns, Yes/No → check-box columns, and `DateTime` columns → a
>   template column with a **DatePicker editor**. Placed DataGrids get the attribute automatically,
>   and binding to a DataGrid adds it if missing.

> **Notes:**
> - The generated class goes into your project's root namespace automatically (C# and VB).
> - DataSet is **not** a form control — you can't drag it onto a form canvas; clicking the
>   Toolbox item opens the DataSet designer instead.
> - v1 is schema-only (tables + columns). Relationships between tables aren't designed yet.
> - **DataGrid note:** Avalonia's `DataGrid` lives in a **separate package** (needs its own XML
>   namespace **and its own theme**). **New projects include both automatically** — the designer
>   emits the right `xmlns:dg` namespace when you place a DataGrid, and the generated `App.axaml`
>   registers the DataGrid theme via
>   `<StyleInclude Source="avares://Avalonia.Controls.DataGrid/Themes/Fluent.xaml"/>`.
>   Existing (older) projects must add BOTH the package
>   (`<PackageReference Include="Avalonia.Controls.DataGrid" Version="…" />`) and the
>   `<StyleInclude>` to their `App.axaml`. **Without the theme a DataGrid is invisible** (no
>   template — no background, border, or columns) and property changes appear to do nothing. An
>   empty unbound DataGrid is also visually blank; set a `Background` or bind it to a table to see it.
> - **Why a typed collection (not a DataView):** Avalonia's `DataGrid` auto-generates columns from
>   the **public properties** of the items it's bound to. A `DataView` has no such properties (and
>   Avalonia ignores `ITypedList`), so a DataGrid bound to a `DataView` renders **empty**. The
>   designer therefore binds to a typed `List(Of <Table>Row)` / `List<<Table>Row>` — the generated
>   `<Table>Row` class has a typed property per column, so the DataGrid shows real column headers
>   and the sample row. ListBox/ComboBox/ItemsControl show `ToString()` of the row class, which
>   returns the first text column.
> - **Existing `.adset` projects:** open the DataSet designer and click **Generate Code** (or
>   re-bind) to regenerate `MyData.cs`/`.vb` with the typed-collection shape. The **Un-bind**
>   button also cleans up an old DataView property if one is still present.

---

*Happy form building! If something behaves unexpectedly, check this manual first — it's updated
as the extension grows.*
