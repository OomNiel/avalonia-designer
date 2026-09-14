# Avalonia Designer for VS Code — User Manual

> The Avalonia Designer lets you **build Avalonia forms visually** — drag controls from a
> toolbox onto a design surface, set their properties in a friendly panel, and let the extension
> generate the XAML **and** the code-behind for you.
>
> It is aimed at **beginners**, especially people new to Avalonia and Linux. Everything is
> guided: every control has a plain-language explanation, properties have a helpful editor and
> a hover description.
>
> **This document is kept up to date as the extension grows.** (Latest revision: 2026-09-13)

---

## Table of contents

1. [What the extension does](#1-what-the-extension-does)
2. [Creating a new project](#2-creating-a-new-project)
3. [Installation & first run](#3-installation--first-run)
4. [Opening a form in the designer](#4-opening-a-form-in-the-designer)
   - [The designer toolbar](#the-designer-toolbar)
5. [The Toolbox](#5-the-toolbox)
6. [Adding a control to the canvas](#6-adding-a-control-to-the-canvas)
   - [Choosing events when you place a control](#choosing-events-when-you-place-a-control)
7. [Selecting, moving, resizing, deleting](#7-selecting-moving-resizing-deleting)
8. [The Properties panel](#8-the-properties-panel)
   - [Tab Items (TabControl)](#tab-items-tabcontrol)
   - [List Items (ListBox)](#list-items-listbox)
   - [Items (ComboBox / ListBox / ItemsControl)](#items-combobox--listbox--itemscontrol)
   - [Menu Items (Menu)](#menu-items-menu)
9. [The "About this control" help panel](#9-the-about-this-control-help-panel)
10. [The right-click menu (Cut / Copy / Paste / Move / Delete)](#10-the-right-click-menu)
11. [Creating a new form (templates)](#11-creating-a-new-form-templates)
12. [Code-behind: events made easy](#12-code-behind-events-made-easy)
    - [Code Fix… — check and repair the code-behind](#code-fix--check-and-repair-the-code-behind)
    - [When the check runs by itself](#when-the-check-runs-by-itself)
    - [Keeping your manual edit instead of a fix](#keeping-your-manual-edit-instead-of-a-fix)
    - [Wiring more events later](#wiring-more-events-later)
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
- **Project Backup** — one toolbar click saves everything that is unsaved and copies the whole
  project into its parent folder as `<Project>_<date>_<time>` (no build output, caches or `.git`).

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

**From the Visual Studio Marketplace (recommended)** — open the Extensions view (`Ctrl+Shift+X`),
search for *Avalonia Designer*, and install it. Or from a terminal:

```bash
code --install-extension grumpy.avalonia-designer
```

The latest published version is **`0.9.4`**, so the command above installs it; add `--force` to
reinstall or to update a copy that is already on the machine.

**Or from GitHub** — take the `.vsix` from the
[latest release](https://github.com/OomNiel/avalonia-designer/releases/latest) and install it with:

```bash
code --install-extension avalonia-designer-<version>.vsix --force
```

> The two places number releases differently. GitHub tags are `v1.0.0-beta.N`; the Marketplace accepts
> plain numbers only, so the same release appears there as `0.9.x` (`0.9.4` = `v1.0.0-beta.11`).
> Nothing else differs — the packages are the same.

After installing (or after any update), **reload the window** so the changes take effect:
`Ctrl+Shift+P` → **Developer: Reload Window**.

The first time you open a form in the designer, the extension **auto-builds the C# previewer
host** (this takes a few seconds — you'll see status messages). It also rebuilds the host
automatically whenever the host source code changes.

> **You need the .NET SDK.** The previewer host is a small C# program that the extension builds with
> `dotnet build` the first time a designer opens, so the .NET SDK must be installed and on your
> `PATH`. If it is missing, the designer tells you so — *“The .NET SDK was not found on this
> machine…”* — with a link to the download page, instead of failing silently.
> (Generated projects additionally need a .NET SDK that supports `net10.0`, e.g. the .NET 10 SDK.)

---

## 4. Opening a form in the designer

`.axaml` files open in the **normal text editor** by default — the designer is opt-in.

- **Right-click** the `.axaml` file in the Explorer → **Avalonia: Open in Designer**.
- Or open the Command Palette → **Avalonia: Open in Designer**.

The designer opens in a custom tab with:

- A **canvas** (the form's design surface) in the middle.
- A **toolbar** at the top, grouped into **foldable categories** (**Edit**, **File**, **Zoom**,
  **Guides**, **Alignment**, **Spacing**). **Refresh** re-reads the form from disk and re-renders
  it; **🩺 Code Fix…** and **⚙ Settings** are described in §12; **💾 Project Backup** below. The full
  list is in [The designer toolbar](#the-designer-toolbar).
- The **Properties panel** on the right.
- The **Toolbox** in the sidebar (revealed automatically).

> **Every form this extension creates carries a notice as its first line:**
> `<!-- Do NOT edit this file manually - Use the Designer to make changes -->`.
> It is written into new projects (`App.axaml`, `MainWindow.axaml`), into every form the **New Form**
> tool makes, and it is re-applied on every designer save — so files you wrote by hand, or made with
> an older version, get it too. It is an ordinary XML comment: the compiler, the previewer and the
> app ignore it.
>
> The reason is that the designer **re-formats** the form when it saves (attribute order,
> indentation, and hand-made structural edits are the usual cause of a code-behind that no longer
> matches — see §12, **Code Fix…**). If you *must* edit the `.axaml` by hand, do it while the
> designer tab is closed, then press **Refresh**; the designer will not clobber unsaved work.

### The designer toolbar

The toolbar buttons are grouped into **categories** you can fold away: click a category heading
(e.g. **Alignment**) to hide its buttons, click it again to bring them back. Every category starts
**unfolded**, and the folded set is remembered for that designer tab.

| Category | Buttons |
|---|---|
| **Edit** | Undo, Redo |
| **File** | **+ New Form**, **Refresh**, **🩺 Code Fix…**, **💾 Project Backup** |
| **Zoom** | **−**, zoom read-out (**100 %**), **+**, **Fit** |
| **Guides** | **Grid** (dot grid on/off), **Snap** (snap-to-grid), **Grid…** (spacing, colour, dot size), **Crosshair** |
| **Alignment** | **Align left / centre / right / top / middle / bottom**, **Align text**, **Same width**, **Same height** |
| **Spacing** | **Equal V**, **Equal H** (equal gaps between 3 or more controls) |

The alignment and spacing buttons take the **first-selected control** as the reference and become
enabled once two or more controls are selected. **⚙ Settings** sits at the far right of the toolbar,
next to the status text.

> The toolbar **wraps onto a second row** when the panel is narrow — buttons are never squeezed, so
a long form list or a small window may show two rows. The icons are drawn by the extension itself
(inline SVG, no font needed), so they look the same on every machine and stay readable while a
button is disabled.

### 💾 Project Backup — a dated copy of the whole project

Click **💾 Project Backup** in the designer toolbar and the extension

1. **saves everything that is unsaved** — the form you are designing, every open DataSet document
   and any other editor with unsaved changes — and then
2. copies the **whole project folder** into that folder's **parent** as
   **`<Project>_<YYYY-MM-DD>_<HH-MM-SS>`** (e.g. `MyApp_2026-09-11_14-32-05`, which sorts by date).
   If a folder with that name is already there, `-2`, `-3`, … is appended, so two clicks in the same
   second can't overwrite each other.

`bin`, `obj`, `.vs`, `node_modules` and `.git` are **never copied** (at any depth), so a backup is
only the project's own files — a few hundred KB instead of gigabytes of build output, and nobody's
git history. The status line and a notification tell you the folder and how many files were copied.

> It backs up the **project the form belongs to** (the folder holding the `.csproj`/`.vbproj`), so
> have the form open in the designer when you click. If a save fails, **nothing** is copied — the
> message names the file that could not be saved, so you can fix it and click again.

### 📦 Publish — build a Debian installer for your app

When the form is finished, **📦 Publish…** turns the **project** into a Debian package you can install
on any Debian/Ubuntu machine — the app then runs on its own, outside VS Code.

1. It builds the project in **Release** and packages it. Both steps run in a **terminal pane** (named
   *Publish \<App\>*), so you can watch the build and see any error.
2. The package lands in your project folder as **`publish/<name>_<version>_<arch>.deb`**
   (e.g. `publish/myapp_1.0.0_amd64.deb`) on Linux, or **`publish/<name>_<version>_x64.msi`** on
   Windows.

On Linux, copy that `.deb` to another machine and install it there with `sudo dpkg -i <file>.deb`; on
Windows, copy the `.msi` and double-click it. Either way you can also install it right here with
**🚀 Install**.

What the package contains — so you know what you are handing over:

| Where (Linux) | What |
|---|---|
| `/usr/lib/<name>/` | the built app |
| `/usr/bin/<name>` | a launcher, so the app can also be started by typing its name in a terminal |
| `/usr/share/applications/<name>.desktop` | the **application-menu entry** (with an icon, if the form has one) |

On **Windows** the MSI installs into **`C:\Program Files\<App>`** (so it needs the usual permission
prompt), adds a **Start-menu entry** and an entry in **Apps & features**, and installing a newer build
**replaces** the previous one instead of stacking up.

**The .NET runtime is *not* included** on either platform. Linux declares it as a dependency
(`dotnet-runtime-8.0` for a `net8.0` project), so `apt`/`dpkg` fetches it if the machine does not have
it yet; the Windows installer **checks** for it and tells you where to get it if it is missing. That
keeps the package small instead of shipping a second copy of .NET.

The Windows installer needs the **WiX toolset** — install it once with
`dotnet tool install --global wix` (the designer offers this for you and says so if it is missing).

The icon comes from the form: set **Window → Icon** (the field's **"…"** button copies the image into
the project's `Assets/` folder) and that image becomes the menu icon.

> **📦 Publish and 🚀 Install appear on Linux and Windows** — they produce the package format of the
> platform you are on: a **`.deb`** on Linux, an **`.msi`** on Windows. On macOS they are not shown, and
> the actions refuse with an explanation instead of pretending they worked.

Settings — `avaloniaDesigner.publish.*`: the **package name**, **version**, **maintainer**, one-line
**description** and any **extra `Depends`** your app needs. Leaving them empty uses the project file's
name and `<Version>`, so a first publish needs no configuration at all.

### 🚀 Install — run your app outside VS Code

**🚀 Install** installs the package that Publish built **on this machine**, so the app appears in your
application menu (Linux) or in the Start menu (Windows) and runs like any other program.

**It is greyed out unless there is a *current* package to install**, and the tooltip says which case
you are in:

| The button | Means |
|---|---|
| greyed out — *“no package has been built”* | nothing has been published yet → press **📦 Publish…** |
| greyed out — *“the package is older than the project’s sources”* | you changed the form after the last publish (or the package was deleted) → publish again. Installing an out-of-date package would put the **previous** build on your machine while the designer shows the current one |
| enabled — *“Install <App> <version>”* | the package is up to date |

After a Publish it stays greyed out for as long as the build runs, then **enables itself** the moment
the package appears — and goes grey again as soon as you edit the form.

- It runs `sudo dpkg -i <the .deb>` on Linux (or `msiexec /i <the .msi>` on Windows, which raises
  Windows' own permission prompt) in a terminal and **asks for your password there** — the extension
  never sees it, and nothing else is typed into that terminal while it waits.
- Installing an **out-of-date package is not offered at all** — there is no “install anyway”: publish
  first, so what you install is what you were looking at.
- Nothing published yet? It offers to publish first. Package older than your sources? It says so and
  lets you publish again.
- If the install reports a **missing dependency**, run `sudo apt-get -f install` (the notification
  reminds you) and then click **🚀 Install** again.

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
| File Selector | A path row with a “…” button that opens the system's file dialog |
| Folder Selector | The same row, set up to pick a folder |
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

### File / Folder Selector — the “…” dialog row

The **File Selector** and **Folder Selector** tools drop a **path row** on the form: a box showing the
chosen path plus a **“…”** button that opens the **platform's own dialog** (Windows / macOS / Linux —
no extra package and no code from you). Both tools insert the same control, `chrome:PathPicker`; they
differ only in its **Path Type**:

| Path Type | What the “…” button opens |
|---|---|
| `File` | The open-file dialog (the default for the **File Selector** tool) |
| `Folder` | The folder picker (the default for the **Folder Selector** tool) |
| `SaveFile` | A save-as dialog — the file need not exist yet |

Properties (all in the Properties panel):

| Property | Meaning |
|---|---|
| Path Type | Which dialog opens: `File`, `Folder` or `SaveFile` |
| Selected Path | The chosen path — **two-way**: pre-fill it, or read it from your code |
| Dialog Title | Caption of the dialog window |
| File Filter | Which files are offered, WinForms style: `Images|*.png;*.jpg|All files|*.*` |
| Initial Folder | Where the dialog opens when nothing is picked yet |
| Read Only Path | `True` (default) = pick-only; `False` = the user may also type/paste a path |
| Browse Text | Caption of the button (“…” by default) |
| Show Icon | `True` (default) draws a small **page** (File/Save File) or **folder** (Folder) glyph at the left edge so you can tell pickers apart at a glance; `False` hides it |

The chosen value lands in **Selected Path**, which your code reads:

```vb
Dim photo As String = PathPicker1.SelectedPath
```
```csharp
string? photo = PathPicker1.SelectedPath;
```

The row is a bundled helper (**`PathPicker.cs|.vb`**, copied into the project the first time you place
the tool — next to `ChromeWindow`), and **🩺 Code Fix…** reports/copies it if the project is missing
it. `Selected Path` can also be written to before the dialog is ever opened (handy for a default
folder or file), and with `Read Only Path = False` the box itself becomes an editable field.

The **kind icon** at the left edge is tinted with the control's **Foreground**, so it follows the
form's font colour (and disappears with **Show Icon = False**).

> **⚠️ Menu items shown in the designer are DUMMY PLACEHOLDERS — they don't look like the real
> thing.** Avalonia only draws the items of a menu when the menu is actually **opened at runtime**,
> so a static design-time preview cannot show them. The designer therefore draws simple plain
> labels over the bar as a guide so you can see where items will be and edit them (click a label,
> or select the Menu and use **Menu Items** in the Properties panel). These labels are **not** what
> the menu will look like. At runtime your real `<MenuItem>`s render exactly as you defined them.

The Toolbox toolbar has three buttons: **New Form**, **Refresh Designer**, and **Clear Canvas**.

---

## 6. Adding a control to the canvas

1. **Click** a tool in the toolbox (e.g. Button).
2. The status bar says *"Click the canvas to place a Button (Esc to cancel)"*.
3. **Click** the canvas where you want it.

The control is placed inside the container under your click. If the form's root is a **Canvas**,
it gets `Canvas.Left`/`Canvas.Top` (free position). If it's a **StackPanel** or **Grid**, it's
placed into that layout.

### Choosing events when you place a control

Interactive controls (Button, CheckBox, RadioButton, TextBox, ComboBox, ListBox, TabControl,
DataGrid, …) expose a long list of events, so the designer asks which of them your form should
handle. Placing such a control opens a chooser — the default event first (`Click` for a Button,
`TextChanged` for a TextBox, `SelectionChanged` for a ComboBox / ListBox / TabControl / DataGrid):

- **Tick one or more events** and press **Wire** — every ticked event is written into the form
  (e.g. `Click="Button1_Click"`) and each handler method is created in your code-behind, so you only
  fill in the bodies.
- **Skip** places the control without wiring anything. You can add an event later from the
  right-click menu (**Add event…**, §10).
- **Remember my choice** stops the chooser from asking again for that control type — from then on the
  control is wired silently with the event you picked.

Containers and non-interactive types (Grid, StackPanel, Image, …) have no events to offer and are
placed as-is.

**Middle-click** a control any time to jump to a handler: the extension lists the events wired on
that control (a ⚠ marks one whose handler has been deleted — recreate it from there) and offers
**Add event…**. Pick one and the code-behind opens with the cursor inside the method. See
[Section 12](#12-code-behind-events-made-easy).

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
(useful when controls overlap or are hard to click); just below it the control's **Name** and
**Type** are pinned.

The rest of the rows are grouped into **sections**, always in this order and with a given row in the
same place whatever control you select:

| Section | What is in it |
|---|---|
| **Editors** | The designer's popup editors for the control (DataGrid **Rows**/**Columns**, Grid **Rows & Columns**, ComboBox/ListBox **Items**, Menu **Menu Items**, Status Bar **Status Items**, SplitPanel **Split Layout**/**Splitters**) |
| **Layout & size** | Width/Height, Min/Max, Left/Top, Margin, Padding, **Dock**, **Anchor**, H./V. Align and H./V. Content Align, the Grid cell, Orientation, window sizing (state, startup location, size-to-content, resize) |
| **Appearance** | Every colour/brush — Background, Text Color (Foreground), Border Brush/Thickness, Corner Radius, Opacity, Theme, the ChromeWindow title-bar colours — plus shape Fill/Stroke/geometry, images and icons |
| **Text & font** | What the control shows (Content, Text, Header, Label, Placeholder Text, …) and how the text is rendered or entered (Font Family/Size/Weight/Style, alignment, wrapping, letter spacing, line height, edit options) |
| **Data** | Item/row sources and the selected item, the grid's user-edit permissions (Read Only, sort/reorder/resize columns), Undo-Redo, and the File/Folder selector's dialog settings |
| **Behavior** | State and interaction: Visible, Enabled, Hit-Test, Tab Stop/Focusable/Tab Index, Z-Index, IsChecked, Click/Selection mode, Command, scroll-bar visibility, window flags (Topmost, Taskbar, decorations) |

**Click a section heading** to fold that group away (the arrow turns ▸); click it again to open it.
The designer **remembers what you folded per control type** — fold **Data** on a DataGrid and every
DataGrid you open afterwards starts with Data folded too (it is stored with the panel's own state, so
it survives reopening the designer). **Show advanced** still reveals the hidden rows, inside their
section.

Every property has:

- A **friendly editor**: text box, number, drop-down, a picker, or (for file properties) a text
  box with a **"…" Browse** button.
- A **hover description** explaining what it means.

**Typing into a text box applies when you press `Enter` or click away from the field.** The value is
not pushed to the form on every keystroke: the designer would have to re-render the preview and
rebuild this panel while you are still typing, and that is what makes typing feel slow. So type
freely, then press `Enter` — or just click somewhere else. Everything else (a checkbox, a drop-down,
a colour, a toolbar button) applies the moment you click it.

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

### Menu Items (Menu)

Select a **Menu** and click **Menu Items** (in the **Editors** group) to edit the menu as a **tree**
— or simply click one of the placeholder labels the designer draws over the bar. Each row has:

- A **kind** dropdown: **Item** (an ordinary command), **CheckBox**, **Radio**, **ComboBox**
  (its children are the options), **Separator** (a line) and — at the top level only — **Space** (an
  invisible gap on the bar). Two more kinds turn the item into a **picker**:
  - **File Selector** — the item holds a path row whose “…” button opens the **open-file** dialog,
  - **Folder Selector** — the same row, set up to pick a **folder**.

  A selector row is a **leaf** (it cannot have sub-items) and gains two extra fields: the **px width**
  of the row and the **dialog title** shown by the dialog.
- A **Header** — the text shown in the menu (`_` marks the access key: `_Open` underlines the **O**).
- Buttons to add a **sub-item**, add a **sibling**, move the row up/down and delete it.

**Save** writes real `<MenuItem>` XAML; a selector item becomes a `PathPicker` inside its
`<MenuItem>`:

```xml
<MenuItem Header="File">
  <MenuItem>
    <chrome:PathPicker PathType="File" Width="230" Title="Open a file"/>
  </MenuItem>
</MenuItem>
```

**Cancel** (or **Esc**) discards your edits, and reopening the editor shows what is really in the
form — including a tree you hand-wrote or saved in an earlier version.

> A picker item shows the **whole path row** (the box plus the “…” button) inside the menu, exactly
> like the toolbox File/Folder Selector does on a form; Avalonia sizes the menu item to its content.

### DataGrid — Rows & Columns editors

When you select a **DataGrid**, its properties include two **…** buttons, **Rows** and **Columns**,
each opening a small editor:

- **Rows** — how the data rows and the grid around them look: **row background**, **text colour**,
  **row height**, **row-header width**, **grid lines** (All / Horizontal / Vertical / None) and
  their colours, and **header visibility** (All / Column / Row / None).
- **Columns** — the column layout: default **column width** (`Auto`, `*` to fill the space, or a
  size like `150`), **min/max column width**, **frozen columns** (pinned to the left when you
  scroll) and **header height**. The same popup also styles the **column headers**: **text
  alignment** (Left / Centre / Right), **text colour**, **header background**, and **text font** —
  a drop-down listing **every font installed on the machine** (the font picker falls back to a
  short built-in list only for the instant before the list arrives).

Only the values you change are written into the XAML — leaving a field at its default keeps the
form tidy. The header text styling (alignment / colour / font / size / background) has **no direct
Avalonia `DataGrid` attribute**, so the designer stores it as a small column-header style
(`<Style Selector="dg|DataGridColumnHeader">`) behind the scenes; the headers look exactly as you
styled them at runtime.

Two DataGrid behaviour notes:

- **Reorder / resize columns are OFF by default** in Avalonia. The designer's defaults match that,
  and the **Can User Reorder Columns** / **Can User Resize Columns** properties switch them on —
  set them to **True** and users can drag columns / drag column edges at runtime.
- **Dock = Fill** (or any Dock) on a DataGrid placed inside a SplitPanel pane docks it **within
  that pane**, never yanking it out of the split.

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
- **Add event…** — wire another event on this control (chosen from the same list as when you place a
  control, and tick as many as you like). Events that are already wired are marked and cannot be
  picked a second time, so this is also the way back for a control you placed with **Skip** (§12).
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

When you place an interactive control the chooser wires the events you ticked (§6) and creates the
handler methods for you. To open one, **middle-click** (press the scroll wheel) the control — the
extension opens the code-behind file with the cursor inside the handler body (the handler is created
if it was somehow missing). When the control has **several** events wired, the middle-click first
lists them, so you choose which handler to jump to.

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

### Code Fix… — check and repair the code-behind

Editing the form (or the XAML/code) by hand can leave the code-behind out of step with the form —
and the compiler error you get then rarely points at the change that caused it. The
**🩺 Code Fix…** button in the designer toolbar checks the code-behind against the form **and** the
project's DataSets and lists every problem it finds, each with a **Fix** button (plus **Fix all**,
**Re-check** and **Go to line**).

The findings also appear in the **PROBLEMS** pane (with the code-behind line); they're cleared and
re-computed on every check. Before the first fix of a run, a copy of the code-behind is saved into
the **extension's storage** (the path is shown at the top of the list), so your project folder stays
clean and you can always go back one step.

What it checks and can fix:

| Problem | Example | Fix |
|---|---|---|
| **Missing accessor** (VB) | `BC30451 'Image1' is not declared'` | writes the missing `FindControl` accessor properties |
| **Left-over accessor** | the control was deleted, the accessor stayed | removes it (only when nothing else uses it) |
| **Defined twice** | `BC30269 … multiple definitions with identical signatures` | deletes the later copy |
| **Handler missing** | the XAML says `Click="Button2_Click"` but there is no such method | inserts an empty handler with the right signature |
| **Wrong event signature** | a `SelectionChanged` handler declared with `RoutedEventArgs` | rewrites the signature (body untouched) |
| **Handler left over** | `Sub RadioButton3_Click` after the control was deleted | deletes the whole method |
| **`InitializeComponent()`** | never called → empty window at runtime | inserts the call / the constructor |
| **Data-Image binding** | block half-deleted, or its `' DataImage:` marker lost, or the Image/grid was deleted | regenerates it from the DataSet, re-stamps the marker, or un-binds it |
| **DataSet drift** | a column/table was renamed (`row.Image`, `LoadCustomers()`) | re-generates that binding from the DataSet |
| **`ItemsSource` on a deleted control** | the ComboBox was removed | deletes the statement |
| **Bundled helper missing** | `ExifImageLoader` / `ChromeWindow` / `AnchorHelper` / `GrumpyPanel` / `PathPicker` not in the project | copies the file in |
| **Missing `Imports`** | `BC30002 'Line' is not defined'` | adds the `Imports`/`using` |
| **ChromeWindow mismatch** | root is `<chrome:ChromeWindow>` but the class still `Inherits Window` | changes the base class |
| **Writing beside the app** | `File.WriteAllText(Path.Combine(AppContext.BaseDirectory, "log.txt"), …)` | reported only — an installed app's folder is read-only |

A few findings come without a Fix button on purpose, because they need your decision — e.g. a
control name that isn't a valid identifier (`x:Name="Button-1"`), the same name used twice, a
`x:Class` that doesn't match the class in the file, or a control name that is **still used** by
hand-written code (deleting its accessor would only move the error). A file **written next to the
executable** (`AppContext.BaseDirectory`) is reported without a fix for a different reason: it works
while you run the project from the IDE, but a published app lives in a folder only root may write
(`/usr/lib/<pkg>` from the .deb, `Program Files` from the MSI), so the write fails — and launched from
the application menu there is no console to show it. The finding says where such a file belongs
instead (the per-user data folder).

Two things worth knowing when you read a finding:

- Findings are (also) published into the **PROBLEMS** pane, so one can look like a compiler warning
  or error even though it comes from this checker. Fixing the cause — or pressing the button again
  after the code changed — clears it; `dotnet build` stays the ground truth for the compiler.
- The checker knows a **C# constructor** (which has no return type) and VB **one-line lambdas**
  (`Function(r) r.Name`), and everything it inserts goes **inside** the body: after the opening `{`
  for C#, after the `Inherits …` line for VB, and a Data-Image call **after**
  `InitializeComponent()` — before it, the grid the binding wires up does not exist yet.

### When the check runs by itself

The check never repairs anything behind your back — every fix is a button you press. It *can* look on
its own, though, so you hear about broken wiring without having to think of it. The **⚙ Settings**
button at the far right of the designer toolbar decides when:

| Mode (`avaloniaDesigner.codeCheck.mode`) | When the check runs |
|---|---|
| **onReturn** (default) | when you come back to the designer tab from the code-behind |
| **onSave** | when the form or the code-behind is saved |
| **onType** | while you edit the code-behind (shortly after you stop typing) |
| **manual** | only when you press **🩺 Code Fix…** |

The same dialog carries the **badges** switch (`avaloniaDesigner.codeCheck.badges`): with it on, a
control with a missing or broken handler gets a **⚠ badge** on the canvas and the toolbar shows a
hint — so the problem is visible where you are working, not only inside the Code Fix list. Findings
are published to the **PROBLEMS** pane either way, and running a check never changes your form or
your code.

### Keeping your manual edit instead of a fix

You know your code better than the checker does, so a finding that is really *your* decision does not
have to be fixed:

- **Leave it — keep my code** dismisses that finding for this session; the list stays short while you
  work.
- Where the designer can follow your lead it does more than stay quiet: if you deleted a handler on
  purpose, **Keep my delete — unwire it** also removes the event from the form — as if the handler had
  never been wired. The same choice appears for a rename you made by hand (**Keep my rename — unwire
  it**) and for a signature you changed (**Keep my signature — unwire it**).
- Anything else can simply be ignored: checks are read-only until you press a button.

### AI assist — a local model for the fixes a rule cannot express

The checker's fixes are exact because each one is a rule. That leaves a gap: a handler that is simply
**empty**, or a change no rule can describe ("read the row the user picked and fill the TextBoxes"). For
those the extension can ask a **local language model** — one running on your own machine. Nothing is
sent anywhere: the request goes to `127.0.0.1`, and the feature ships **off**.

**Turning it on.** You need a local model server; the extension speaks the OpenAI-compatible API that
LM Studio, Ollama and `llama-server` all expose. Install one, load a small code model, then set:

| Setting | Value |
|---|---|
| `avaloniaDesigner.assistant.backend` | `external` — enables the feature |
| `avaloniaDesigner.assistant.endpoint` | the address of your server: `http://127.0.0.1:1234/v1` (**the default**, LM Studio) · `http://127.0.0.1:11434/v1` (Ollama) · `http://127.0.0.1:8080/v1` (llama.cpp). An empty value falls back to the LM Studio address |
| `avaloniaDesigner.assistant.model` | the model id, e.g. `qwen2.5-coder-7b`. Empty lets the server decide — Ollama needs a name here |
| `avaloniaDesigner.assistant.timeoutSeconds` | how long to wait (default 60). Inference in RAM is slow: 10 s is optimistic, 30 s is normal on an older CPU |

**AI: Status and Hardware Check** (Command Palette) shows what the feature sees right now: the endpoint,
whether the server answers, which models it offers — and a **hardware verdict**. RAM, CPU threads and
AVX2 decide whether a local model can run at all; on a machine that cannot, the feature stays disabled
and says why instead of pretending.

**Two ways to use it:**

- **AI: Implement in Function…** — put the caret inside the method, run the command, and describe the
  behaviour in the dialog. The model returns the **complete method**; the name, signature and
  indentation stay as they were.
- **✨ Fix with AI (local model)…** — offered on a finding in the **PROBLEMS** pane (and in its
  light-bulb menu) when the line sits inside a method. Structural findings — a missing accessor, a lost
  Data-Image block — keep their exact rule-based fix and do not offer the model at all.

**Nothing is written without you.** The proposal opens as a **diff** beside your file: **Apply** writes
it as a normal edit (so **Ctrl+Z** undoes it), **Discard** throws it away. The extension then offers
**Build to verify**, which runs your project's `build` task and reports the exit code — the check that
actually matters for generated code.

Expect it to be **slow and imperfect**. On a CPU-only machine a 3B model answers a short method in
5–15 s, a 7B takes two to three times longer, and both are noticeably better at **C#** than at VB.NET.
Read the diff: this is for the boilerplate you would otherwise type yourself, not for logic you have not
decided on yet.

#### No model server? Let the extension bring its own

Having no AI at all is the case this feature exists for, so it does not require LM Studio or Ollama:

1. Run **AI: Set Up Local Model…** from the Command Palette.
2. Pick a model. Two code-specialised ones are offered, and the size is shown before anything is
downloaded:

   | Model | Size | Trade-off |
   |---|---|---|
   | Qwen2.5-Coder 3B Instruct (Q4_K_M) | 2.1 GB | answers in 5–15 s on a CPU — the practical choice |
   | Qwen2.5-Coder 7B Instruct (Q4_K_M) | 4.7 GB | noticeably better code, two to three times slower |

   You can also point it at a `.gguf` file you already have, or paste the address of one.
3. Wait for the download — it is shown as a percentage and can be cancelled and resumed by running the
   command again. The file is checked against the **SHA-256** the publisher lists for it, then stored in
   the extension's own storage. It is downloaded once, for all your projects.
4. That is it: `backend` is switched to `bundled` for you and the feature is ready.

**How is there an AI in my editor with no server?** The extension builds a small C# program (the same
way it already builds its design previewer) with the .NET SDK on your machine, and *that* program loads
the model. Building it the first time also downloads the inference library from nuget.org — about
100 MB, once. From then on everything is local: no account, no key, no subscription, and nothing that
leaves the machine.

**Where the model lives:** in this extension's global storage — on Linux
`~/.config/Code/User/globalStorage/grumpy.avalonia-designer/models/`. Delete the file to reclaim the
disk space; set-up will offer it again.

**When it does not fit.** The set-up refuses a model that this machine cannot run well (the 7B on 8 GB
of RAM, or a CPU without AVX2) and tells you why instead of letting you discover it. *AI: Status and
Hardware Check* shows the same verdict at any time, together with whether the model server is running,
which threads it uses (`avaloniaDesigner.assistant.threads`, 0 = automatic) and how long an answer may
take. **AI: Stop the Local Model** frees the RAM immediately; it starts again with the next request.

The timeout setting is worth knowing about: it is an **inactivity** budget, not a total one — the clock
restarts with every token, so a slow CPU writing a long method is allowed to take minutes, while a
server that has stopped talking is caught in seconds.

### Wiring more events later

Right-click the control → **Add event…** to wire another event, using the same chooser as when you
place a control (events that are already wired are marked and cannot be picked twice). This is also
the way back for a control you placed with **Skip**, and the way to add a second handler to a control
that already has one — e.g. a `KeyDown` next to a Button's `Click`.

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

**ListBox, Image, Panel, Grid, StackPanel, WrapPanel, TabControl, DataGrid, Menu, Status Bar and
Split Panel** all have a **Dock** property in the Properties panel (a drop-down):

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

### Split panels (the SplitPanel tool)

The Toolbox **SplitPanel** tool drops a resizable, multi-pane container. Its default **Zones**
layout is a **T**: two panes side-by-side (`Pane0` | `Pane1`) over a full-width bottom pane
(`Pane2`). Draggable divider bars separate the panes, and the panes all stretch when the form
resizes.

- **Selecting:** click the panel's outer **border** to select the whole Split Panel (so you can
  move or **Dock** it); click inside a pane to select that pane. Drop controls into any pane.
- **Resizing at design time:** with a side-by-side pane selected, its **Width** is that divider's
  position — type a number to pin it, **0 hides** the pane, `*` (or clearing the field) lets it
  flex again. The full-width bottom pane uses **Height** the same way. (Its other dimension isn't a
  real divider, so it's hidden from the list.)
- **Docking inside a pane:** if you give a control that sits inside a pane a **Dock** value, it
  docks **within that pane** (the pane's body becomes a DockPanel) rather than to the form —
  e.g. **Dock = Fill** makes a DataGrid fill the whole pane. It never leaves the split panel.
- **At runtime:** drag the divider bars to resize the panes; they also resize with the window.
- **On the Split Panel's Properties:**
  - **Split Layout** — switch between **Zones** (a top band of panes over a full-width one),
    **Columns** (side-by-side) and **Rows** (stacked). The stepper sets how many panes are in the
    **top band** for Zones — 2 over 1 by default; bump it to 3 for **three panes over one** — or
    the **total pane count** for Columns/Rows. Panes keep whatever is inside them; older Grid-based
    splits are converted automatically.
  - **Splitters** — style each divider bar: its **thickness**, **colour**, and whether it is
    **visible** (a hidden bar can't be dragged at runtime). Bars can't shrink below 1 px.
  - **Pane Border** — the border width drawn around each pane.

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
- Edit the title text via **Properties → Title Bar Text** (and optionally **Title Bar Icon**), and
  restyle the bar itself with **Title Bar Color** and **Title Bar Text Color** — both offer the
  predefined colour palette (pick *Transparent* for a floating-looking bar).
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
- **The designer does not reload itself when the file changes on disk** (e.g. you edited the XAML
  in a text tab) — press **Refresh** in the designer toolbar to pull the file in again.
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
  re-formatted on save and **hand-written comments are dropped** — only the fixed
  “do not edit by hand” notice (§4) is re-written. Edit the form in the designer, not in the file.
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

### Following a column of a bound grid (ComboBox / ListBox / ItemsControl)

A control that only **displays** data can't own a table — but it can **follow** one that a DataGrid
owns. Select the ComboBox (or ListBox / ItemsControl), open the **Items Source** picker and you'll
find, next to the tables, one entry per **text column** of every grid-bound table:

```
MyData.Customers.Name        follows DataGrid3 — lists the Name column, live
MyData.Customers.Email       follows DataGrid3 — lists the Email column, live
```

Picking one binds the control to that column:

- **Live** — add, edit or delete a row in the grid and the list follows (an edited value updates in
  place, so the control keeps its selected item).
- The grid's **“+ Add row…”** placeholder row is **skipped**, and the grid's row order is kept.
- The binding is recorded on the table (`.adset`), so the picker shows it as the current binding and
  you can **Un-bind follower** from the same place.
- The generated line lives in the code-behind, right after the grid wiring, e.g.
  `ComboBox2.ItemsSource = New ColumnFollower(Of CustomersRow, String)(_customers, Function(r) r.Name, Function(r) r.IsPlaceholder)`
  (C#: `new ColumnFollower<CustomersRow, string?>(_customers, r => r.Name, r => r.IsPlaceholder)` —
  the `?` matches the generated row property, so a `<Nullable>enable</Nullable>` project stays
  warning-free);
  the bundled **`ColumnFollower.vb`/`.cs`** helper does the mirroring (it's added to the project the
  first time you use this).

Only **text** columns are offered, and only for controls that don't own a table themselves — a bound
DataGrid can't be a follower (it would fight over the editing, the placeholder row and the undo
stack). Two controls *editing* the same table is not supported.

> **Inline items vs a data source:** a control may not have both. If the ComboBox still contains
> items you added with the **Items** property, Avalonia throws
> *“Items collection must be empty before using ItemsSource.”* — the picker offers to clear them as
> part of the bind, and 🩺 **Code Fix…** reports the combination with a one-click fix.

### Live editing in a bound DataGrid

A DataGrid bound to a table becomes a small data-entry grid, WinForms-style:

- There is a **blank row at the bottom** with **"+ Add row…"** in it. **Click it** to open a popup
  with one field per column (date picker for dates, a check box for Yes/No, a number box for
  numbers, text boxes otherwise). Each field is **labelled with its column name**; for a **String
  column** there is a **Browse…** button that opens the OS file picker (images first, then all files)
  and writes the chosen file's **full path** into the box. When the table has an integer **key
  column**, that field is already filled with the **next free id** and is read-only, so you can't
  create a duplicate key by accident. Fill it in and click **Save** — the row is added to the table.
- **Edit existing rows in place** — click a cell and type. **Date columns** pop up a **date
  picker** when you start editing them (the column must be typed `DateTime` in the `.adset`, e.g.
  `CreatedAt`); Yes/No columns show a check box; number columns a number box.
- An in-place edit is **saved automatically when you finish the cell** (Enter / Tab / click
  another row); press **Esc** to cancel without saving.
- **Right-click a row** → **Delete row** (asks for confirmation first).
- **Undo / Redo:** press **Ctrl+U** to undo the last add / edit / delete and **Ctrl+R** to redo it.
  Up to **5** steps are remembered by default — change the number with the **'Undo-Redo'** property
  on the DataGrid in the form designer's Properties panel (0 turns undo off).
- The rows live in the bound table's **SQLite database** file (chosen in the DataSet designer — by
  default `<DataSetName>.db`), so your add/edit/delete changes survive closing and re-running the app.
  The file is looked up in the app's **per-user data folder** (`~/.local/share/<App>/` on Linux,
  `%LOCALAPPDATA%\<App>\` on Windows — the generated `RuntimeStorage` helper does this), **not** next
  to the executable: a published app is installed into a folder only root may write (`/usr/lib/<pkg>`
  from the .deb, `Program Files` from the MSI) and could not create the database there.

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
