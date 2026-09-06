# Changelog

All notable changes to the **Avalonia Designer for VS Code** extension.

Format: based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [SemVer](https://semver.org/).

## [1.0.0-beta.3] - 2026-09-06

Third public **Beta**. ⚠️ Incomplete & buggy — development is on-going.

### Changed — SQLite is now the ONLY data store for bound tables (final semantics)

- **Bound tables are always SQLite.** A table bound to a DataGrid / ComboBox / ListBox / ItemsControl
  is persisted in a SQLite file; the old sample/XML data store is retired for bound tables and the
  one-time XML→SQLite migration is removed. Legacy `MyData.<Table>.xml` files are no longer read.
- **Existing `.db` files are used in place.** Browse stores the **absolute path** and the app edits
  that file directly — nothing is copied to `bin`. The generator no longer injects a
  `<Content … CopyToOutputDirectory>` entry for SQLite files.
- **Default database per DataSet.** A table that has no SQLite file of its own when it is **bound**
  is auto-registered against `<DataSetName>.db` (e.g. `MyData.db`), which is created next to the app
  on first run.
- **List-bound controls read the database too.** The generated `Get<T>` for ComboBox/ListBox/
  ItemsControl now loads rows from SQLite (`SELECT … ORDER BY rowid`) instead of sample/XML.
- **Preview always queries the pointed file.** The DataSet designer's "Preview SQLite data…" runs
  against the `.db` the table points at (absolute or project-relative), and Import SQLite links the
  file + real SQL table name so renamed tables keep working.
- If you have a beta-era project that stored data in `MyData.<Table>.xml`, re-import that data into a
  SQLite file via the DataSet designer's **Import SQLite…** and bind the table to it.

### Added
- **SQLite-backed bound tables** — a DataSet table bound to a DataGrid / ComboBox / ListBox /
  ItemsControl is persisted in a SQLite `.db`. The DataSet designer has a per-table **Data source**
  picker + a **Primary key** flag; bound tables generate a shared **`DatabaseAdapter`** with
  DB-backed `Load`/`Save` (C# **and** VB) so the DataGrid's live add/edit/delete and undo/redo write
  through to the `.db` (integer keys stay stable — AUTOINCREMENT survives the DELETE+INSERT save;
  new rows read `last_insert_rowid` back). Generating adds the SQLite NuGet packages automatically;
  a **Preview SQLite data…** panel runs read-only queries against the `.db` and **Import SQLite…**
  reverse-engineers an existing `.db` into `.adset` tables. See "Changed" above for the final
  data-store semantics.
- **Menu Items editor** — a `Menu` bar has a **Menu Items** property that opens a tree editor
  (Item / CheckBox / Radio / ComboBox-of-options / Separator, up to 5 levels); top-level items
  are drawn as plain placeholder labels in the designer; Save writes real `<MenuItem>` XAML.
- **Status Bar redesign** — the Status Bar tool now inserts a real **DockPanel** strip (docked
  Bottom) with a **Status Items** editor: each item is pinned LEFT or RIGHT and stretches to the
  bar's height (TextBlock / TextBox / Button / ProgressBar / Separator / live-clock StatusDate).
- **SplitPanel tool** — a resizable multi-pane container. Default **Zones** layout: two panes
  side-by-side over a full-width bottom pane, split by runtime-draggable bars; panes flex with the
  window. Click the panel's border to select/move the whole Split Panel; click a pane to select it
  and drop controls into it. A pane's **Width** (side-by-side) / **Height** (full-width bottom)
  sets the divider position, **0 hides** it, `*` lets it flex.
- **Split Layout editor** — switch a SplitPanel between **Zones** (a configurable number of panes
  in the top band over a full-width bottom pane, e.g. 2‑up or 3‑up over 1), **Columns** and **Rows**
  (with the pane count); each pane keeps its contents, and older Grid-rooted splits convert to the
  Border-framed form automatically.
- **Splitters editor** — style each divider bar of a SplitPanel: its **thickness**, **colour** and
  whether it is **visible** at runtime (hidden bars can't be dragged).
- **DataGrid Rows & Columns editors** — a DataGrid's Properties now offer **Rows** and **Columns**
  popups: row background, text colour, row height, row-header width, grid lines + their colours,
  header visibility, default/min/max column width, frozen columns and header height (all direct
  Avalonia DataGrid attributes). The Columns editor also styles the **column headers**: text
  alignment (left/centre/right), text colour, font family, font size and header background —
  written as a generated `<dg|DataGridColumnHeader>` style (Avalonia has no direct DataGrid
  header attributes).
- **Header font picker lists the system fonts** — the Columns editor's *Header text font* is now a
  dropdown of every font family the machine actually has (enumerated by the C# preview host via
  Avalonia's `FontManager.SystemFonts`, offered through the new host `fonts` command), with a
  compact built-in fallback list until the host responds.
- **Remove DataSet button** — the DataSet designer toolbar has a red **Remove DataSet** that warns
  first, then strips every grid/list/items/image binding + code-behind reference of the DataSet's
  tables, deletes the `.adset`, the generated `.cs`/`.vb` and `.xsd`, and deletes the **auto default
  `<DataSet>.db`** (project + bin copies) — user-browsed/per-table/external `.db` files are listed
  but kept (they may be shared). The panel then closes.
- **Image "Data…" binding** — an `Image`'s Source now has a **Data…** action: bind the image to a
  String column of a DataGrid-bound DataSet table. At runtime it shows the **selected row's**
  absolute image file (auto-selects row 0 on load; blank when the value is empty/missing). It is
  exclusive with a literal Source. Works in C# **and** VB; metadata lives on the owning table's
  `.adset` (`boundImages`) + a code-behind marker.
- **Design-time DATA preview on the canvas** — the designer renders XAML only (no code-behind), so
  bound data used to look empty while editing. Now each DataGrid-bound table's rows/columns are read
  from its `.db` (via the preview host, cap 8 rows) and the grid is filled read-only on the canvas;
  a Data-bound Image shows the **first row's** image. Runtime is untouched.
- **Properties panel top-actions** — the most-used editors are pinned to the **top** of the
  Properties panel: **Rows**/**Columns** for a DataGrid, **Split Layout**/**Splitters** for a
  SplitPanel, and **Tab Items** for a TabControl.

### Fixed
- **App showed old XML rows instead of the seeded SQLite rows** — the runtime reads the .db next to
  its exe, and the one-time XML→SQLite migration ran on the first launch (fresh, empty runtime db) and
  imported the leftover `MyData.<T>.xml`. The migration now runs **only when the database file is brand
  new** (didn't exist before that run), so a pre-existing/seeded .db is trusted as-is. Generating also
  adds any project-relative SQLite file as a **Content copy-to-output** item, so the build drops the
  same seeded .db next to the exe and runtime matches the designer preview.
- **Imported SQLite tables showed the sample row, not the DB rows** — importing a `.db` created
  tables schema-only (no link back to the file), so binding one and running loaded the sample/XML
  demo row. Imported tables are now **SQLite-backed** with the source file, and the spec remembers
  the real SQL table name (`sqlite.tableName`) — so an import that had to be renamed (e.g. DB
  `Customers` → `.adset` `Customers2`) still reads/writes the original `Customers` table.
- **VB Save<T>Grid used a hard-coded "CustomersRow"** — the generated VB `Save<T>` iterated
  `For Each r As CustomersRow`, which only compiled while the bound table was literally named
  Customers (any other name, e.g. an imported Customers2, produced “Type 'XRow' is not defined”).
  It now uses the table's own row type.
- **VB `'MyData' is not declared` (BC30451)** — the VB add/edit-row dialog code hard-coded
  `MyData.CreateDataSet()`, which only compiled when the DataSet was literally named MyData. It now
  uses the DataSet class's own unqualified `CreateDataSet()`.
- **Adding a column then running crashed with `SQLite Error 1: no such column`** — CREATE TABLE IF
  NOT EXISTS is a no-op on an existing `.db`, so columns added in the designer were missing at
  runtime. The generated `DatabaseAdapter` now runs **EnsureColumns** (PRAGMA table_info → ALTER
  TABLE ADD COLUMN for every missing column) after each open (C# **and** VB).
- **`duplicate column name: Id` crash** — EnsureColumns compared quoted defs against unquoted PRAGMA
  names, so it never recognised existing columns and re-created them. Defs are now emitted unquoted;
  only the ALTER statements quote column names.
- **Renaming a DataSet broke the build** — renaming left the old generated file + code-behind
  references behind (duplicate shared helpers → BC30179). The DataSet name is now **read-only**
  after creation in both the toolbar and the panel; to rename, Remove DataSet… and re-create it.
- **ItemsSource picker ⇄ DataSet designer stayed out of sync** — binding from the form's Items
  Source "…" now records exactly what the DataSet designer's Bind records (incl. the shared default
  `.db` and SQLite packages) and an open DataSet panel **live-refreshes** after a form-side
  bind/unbind, so the two entry points can't drift apart.
- **Data-bound Image rendered 0×0 at design time** — the preview host resolved an absolute `Source`
  as a *project-relative* path on Linux (every absolute path starts with `/`), the file was
  "missing", and the image was silently skipped. Rooted paths that exist are now used as-is while
  `/Assets/…` project paths still resolve. DataGrid rows **and** the bound image now both render on
  the canvas.
- **Newly placed controls showed Dock = "Fill" instead of "None"** — a control dropped into a
  DockPanel as its last child inherited the panel's default `LastChildFill="True"`, so the
  designer's Fill-detection labelled it Fill even though it had no `DockPanel.Dock`. Placement now
  normalises the same way choosing Dock = None does (drops `LastChildFill`), so a placed DataGrid
  keeps its own size and its Properties panel reads **None** until you explicitly pick Dock = Fill.
- **"Bind to control" dropdown was empty** — the DataSet designer's project scan used
  `/^\.axaml$/i`, which matches only a file literally named `.axaml`, so no real `*.axaml` ever
  contributed controls. The regex is now `/\.axaml$/i` (any `.axaml` file), so placed
  DataGrids/ListBoxes/ComboBoxes/ItemsControls appear again. The list also **refreshes** when a
  table is selected, so a control placed/saved after the designer opened shows up without a reload.
- **Dropdown popups (font picker, alignment, Properties selects) were unreadable** — the webview
  is a dark UI but didn't declare a dark `color-scheme`, so Chromium drew each native `<select>`
  list as an OS-light white box with the light-grey text on top. The designer now pins
  `color-scheme: dark` (dark list + light text, matching the panel) and the pickers' `<option>`
  rows get an explicit dark background / light text. (Also defines the previously missing
  `--panel-1` used by the modal fields.)
- DataGrid **Reorder Columns** / **Resize Columns** now actually work at runtime: the designer's
  defaults wrongly treated them as True, so setting True stripped the attribute and the real
  framework default (False) kept them off. Defaults now mirror the control (reorder/resize = False,
  sort = True), so setting True writes `CanUserReorderColumns="True"` / `CanUserResizeColumns="True"`.
- Docking a control that was placed **inside a SplitPanel pane** now docks it **within that pane**
  (the pane's body becomes a DockPanel; **Fill** fills the pane) instead of yanking it out to the
  form's root DockPanel.
- Generated **GridSplitter** bars now carry `MinWidth="1"`/`MinHeight="1"` (not 0) so a thin
  divider never shrinks away or becomes un-draggable.
- SplitPanel panes are individually selectable again — the split writes explicit
  `<Grid.ColumnDefinitions>` property elements (the host loader ignored the attribute shorthand).

## [1.0.0-beta.2] - 2026-09-03

Second public **Beta**. ⚠️ Incomplete & buggy — development is on-going.

### Added
- **Undo / Redo toolbar buttons (↶ / ↷)** — step the 5-level undo history back/forward straight
  from the toolbar (the Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y shortcuts still work). The buttons
  enable/disable to match what can actually be undone or redone.

[1.0.0-beta.2]: https://github.com/OomNiel/avalonia-designer/releases/tag/v1.0.0-beta.2

## [1.0.0-beta.1] - 2026-09-03

First public **Beta**. ⚠️ Incomplete & buggy — development is on-going.

### Added
- **New Project / New Form** — generate a complete Avalonia project or a single form in
  **C# or VB.NET** (net10.0 + Avalonia 12.1.1), rooted on a `Window`/`UserControl` with a
  custom `ChromeWindow` title bar available.
- **WYSIWYG `.axaml` designer** — open any form in a designer tab (Source/Design toggle):
  toolbox drag‑and‑drop (click‑tool‑then‑click‑canvas on Linux/Xorg), move/resize,
  multi‑select + alignment, shape controls (Line/Rectangle/Ellipse/Arc), Grid rows/columns
  + drag‑to‑re‑cell, docking, images‑in‑grid, dot‑grid/snap, undo/redo.
- **Properties panel** — common properties with live re‑render; colour palette, font, margin,
  file/asset pickers; theme (System/Custom) colour backup.
- **Alignment tools** — align/middle (centres), same width/height, and **equal vertical (⋮) /
  horizontal (⋯) spacing** that spreads 3+ selected controls with equal gaps (outermost stay put).
- **Crosshair** — pointer crosshair with move/resize anchors and a style setting (§68/§69).
- **Design rulers** — white-on-black top + left rulers scaled to the design surface (§69c).
- **Preview theme echo** — the live preview follows the file's theme, the `avaloniaDesigner.previewTheme`
  setting, or the VS Code light/dark theme (§69d).
- **DataSet designer** — design ADO.NET `DataSet` tables/columns visually (`*.adset`) and
  generate a runtime C#/VB class + `.xsd`.
- **Previewer Host** — a bundled C#/Avalonia headless renderer (auto‑built on first use)
  shows a faithful live preview and reports control bounds.
- **F5‑ready projects** — new projects ship a Linux‑safe `.vscode/launch.json` (`coreclr` +
  the built assembly, no Windows `.exe`) and a default `build` task; NuGet is restored before
  the project opens so the language server loads cleanly first time.

### Fixed
- Selecting the **form** (click empty design space or pick **"Form - <Title>"** in the control
  drop‑down) lets you resize the whole surface via its Window Width/Height.
- The **root layout panel** and the Body design surface are locked in place (no stray resize
  handles / accidental dragging).
- Hit‑testing is **hierarchy‑ and ZIndex‑aware** — shapes render behind by default but stay
  clickable where visible and never steal clicks from controls over them.
- Resizing a control by its **top edge** no longer drops it 44px low on ChromeWindow forms
  (parent-relative vs window-absolute coords) (§68b).
- The **Align vertical/horizontal centres** toolbar buttons now match their labels (↕/↔) (§69b).
- Colour dropdown lists the full palette (~5 rows visible, scrollable; opens upward when near
  the bottom); no more duplicate VB `Imports` or stray BOM characters.
- Generated VB projects no longer bake in a machine‑specific language‑server path.

### Notes for testers
- The preview host renders with **Avalonia 11** while generated apps target **Avalonia 12** —
  preview fidelity can differ slightly; some controls/custom types render as approximations.
- Toolbox drag‑and‑drop is unreliable on Linux/Xorg — use **click the tool, then click the canvas**.

[1.0.0-beta.1]: https://github.com/OomNiel/avalonia-designer/releases/tag/v1.0.0-beta.1
