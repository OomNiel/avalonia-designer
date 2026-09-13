# Changelog

All notable changes to the **Avalonia Designer for VS Code** extension.

Format: based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [SemVer](https://semver.org/) — with one wrinkle, see the note below.

> **Two version numbers per release, on purpose.** GitHub tags and releases carry the descriptive
> name (`v1.0.0-beta.7`), but the Visual Studio Marketplace rejects semver pre-release tags: it accepts
> only one to four plain numbers. `package.json` therefore holds the Marketplace number — `0.9.0` for
> `v1.0.0-beta.7` — and each entry below names both. `1.0.0` is reserved for the first stable release,
> because a published version number can never be reused.

## [Unreleased]

### Added
- **📦 Publish — build your app as a Debian installer.** The project the form belongs to is built in
  Release and packaged as `publish/<name>_<version>_<arch>.deb`, ready to copy to another machine. The
  package installs the app into `/usr/lib/<name>` with a launcher in `/usr/bin/<name>` and an
  application-menu entry (using the form's **Window → Icon** when it has one). The **.NET runtime is
  declared as a dependency, not bundled** (`dotnet-runtime-8.0`), so apt fetches it instead of the
  `.deb` carrying a second copy. The build runs in a terminal pane so the output is visible.
- **🚀 Install — install that package on this machine**, so the app runs on its own (application menu or
  by name in a terminal) instead of only inside the designer. It runs `sudo dpkg -i` in a terminal and
  asks for the password **there**; nothing else is ever typed into that terminal while sudo waits.
- **Windows: the same buttons produce an MSI installer** (WiX), per-machine into `Program Files` with a
  Start-menu entry, an *Apps & features* entry and a shortcut icon from the form. Installing a newer
  version **replaces** the previous one (a stable `UpgradeCode` per app makes it an upgrade, not a
  second app). The .NET runtime is **checked, not bundled**, via a launch condition that says where to
  download it. Needs the WiX toolset: `dotnet tool install --global wix`.
- **`avaloniaDesigner.publish.*` settings** — package name, version, maintainer, description and extra
  `Depends`. All optional: empty values fall back to the project file's name and `<Version>`.

### Changed
- **Install is disabled unless the package is *current*.** There are three states and the button follows
  them: *no package yet* → disabled, *package older than the form* → disabled (installing it would put
  the previous build on the machine while the designer shows the current one), *up to date* → enabled.
  The tooltip says which case you are in, editing the form greys it out again immediately, and the
  button re-enables itself when a build started in the terminal produces the package. "Install anyway"
  is gone — publish first. Note that *older than the sources* counts only files that end up inside the
  app (`.axaml`, `.cs`/`.vb`, project files, images, fonts), so editing a README in the project folder
  does not invalidate a package.

### Notes
- Both buttons are **platform-specific by nature** — a `.deb` on Linux, an MSI on Windows — so the
  extension emits them on those two platforms and refuses the actions elsewhere (macOS has no package
  format wired up yet).
- The Windows MSI path is **generated and unit-tested but not yet built on a real Windows machine** (the
  development machine is Linux): the WiX source, the version/upgrade identity and the PowerShell build
  script are asserted, and the `wix build` step itself still needs a Windows run to be confirmed.

## [0.9.1] - 2026-09-13 · *the `1.0.0-beta.8` build*

A measured performance pass over the whole extension — every hot path was timed before and after —
plus the defects the new tests exposed and three things you reported while testing.

### Added
- **A new project opens in the Designer by itself.** *Avalonia: New Project* now runs the first build
  in the background and opens the main form's designer tab, so the next thing you see is your form
  instead of an empty folder.
- **A benchmark harness** — `npm run bench` times the extension's hot functions (XAML serialise and
  lookup, property catalog, the code-behind checker, the per-edit commit signal) on a synthetic
  200-control form, so a performance regression shows up as a number rather than a feeling.
- **~120 new automated assertions** (the suite now runs **2,786**, all green) covering the code-behind
  checker's event signatures and recognition, orphaned-handler cleanup, `.adset` parsing and caching,
  the first open of a new project, the System-qualified clock code, and the webview's pointer state,
  nudge coalescing, properties scroll position and context-menu placement.

### Changed
- **Typing into a property applies when you leave the field or press `Enter`** — not while you type.
  Each commit re-renders the preview, returns a PNG and rebuilds the Properties panel; doing that
  behind a 400 ms debounce still ran the whole round trip mid-word and rebuilt the panel under your
  cursor, which made typing feel laggy. Discrete controls (a checkbox, a drop-down, a confirmed
  colour, a palette pick, a toolbar button) still apply immediately.
- **Everything below was measured, not guessed** — `analyzeCodeBehind` 14.3 → **11.9 ms** (two O(n²)
  string patterns replaced by a line index and a single pass) · a 200-lookup name pass 2.02 →
  **0.028 ms** (one DOM index per render instead of a full walk per lookup) · the per-edit commit
  signal 3.3–5.0 → **1.5–1.6 ms** (the control-set signature is read off the live model instead of
  re-parsing the XAML twice) · reading every `.adset` 1.03 → **0.21 ms** per lookup (~7 ms less per
  render) · the code-behind lookup 0.143 → **0.065 ms** with no file bodies read at all · the canvas
  overlays 3.7 → **1.8 ms** per frame at 200 controls (patched in place instead of rebuilt).
- **The webview no longer forces layout on every pointer move.** The drag anchor is resolved before
  the canvas rect is read, and arrow-key nudges are coalesced to one message per animation frame
  (they used to post ~20–30 per second, each one a full preview re-render and PNG decode).

### Fixed
- **The right-click menu always fits on screen** — it is measured after being shown and flipped or
  clamped against the window edge, instead of running off the bottom on a control near the bottom.
- **The Properties panel stays where you left it.** Setting a property no longer scrolls the panel so
  that the edited row sits at the bottom edge.
- **Generated clock/status handlers compile in C#** — the clock and tracker no longer use bare
  `TimeSpan`/`DateTime` (`CS0103`); they are fully qualified as `System.TimeSpan`/`System.DateTime`,
  which is valid in VB too.
- **No more phantom "wrong parameter type" findings** for the events whose `EventArgs` differ per
  control (`Window.Opened`, `NumericUpDown.ValueChanged`, `DatePicker.SelectedDateChanged`): the
  checker now resolves the argument type the same tag-aware way the code writer does.
- **83 events are checked again.** The checker kept its own hand-written event list, which had drifted
  from the generated catalog — `RightTapped` on 45 types, the DataGrid edit events, `Expander.*` and
  others were offered by the picker but never verified. The list is now derived from the catalog.
- **Deleting a control removes *all* of its orphaned handlers.** The cleanup scan stopped at the track
  of the first handler it decided to keep, leaving the rest behind as dead code.
- **A corrupt `.adset` can no longer be silently replaced.** It is parsed strictly, the error is shown,
  and neither the designer nor the DataSet editor will write over it.
- **The previewer host no longer leaks per frame** — the render target bitmap is disposed (~1.4 MB per
  frame before), the headless window is closed even when collection throws, every image is parsed and
  decoded once per frame instead of twice, and the emitted DataGrid row type plus the reflected type
  lookups are cached instead of a non-collectable assembly per grid per render.
- **A previewer request can no longer hang forever**, and a child process that fails to connect is
  killed instead of being left behind.
- **A webview escape or a control name containing a quote** could throw inside a pointer handler
  (an unescaped attribute selector) or swallow your next click (a stale `suppressClick` flag); both
  are fixed.

### Notes
- The Marketplace number is **`0.9.1`**; the same build is tagged **`v1.0.0-beta.8`** on GitHub. A
  published version number can never be reused, so `1.0.0` stays reserved for the first stable
  release (`PUBLISHING.md` part E).
- Published on the Marketplace as a **normal (stable) release** — the uploaded file was the plain
  `avalonia-designer-0.9.1.vsix` (verified: the gallery's `VsixSha256` matches it byte for byte).
  Whether a version lands on the pre-release channel is a property of the VSIX, not a switch: it is
  set by packaging with `--pre-release` and cannot be changed afterwards. As a result `0.9.0` is now
  the only pre-release on the listing, so *Install Pre-Release Version* would install that older
  build.

## [0.9.0] - 2026-09-12 · *the `1.0.0-beta.7` build*

### Added
- **First Visual Studio Marketplace listing** — published as a pre-release at
  <https://marketplace.visualstudio.com/items?itemName=grumpy.avalonia-designer>. The VSIX on the
  Marketplace is byte-for-byte the `1.0.0-beta.7` package uploaded to GitHub.

### Changed
- **`repository.url` no longer ends in `.git`** — the Marketplace copies that field into the listing's
  Repository / Get Started / Source links, where the suffix is redundant.

### Notes
- The version number is the *only* difference from `1.0.0-beta.7`. `PUBLISHING.md` part E records the
  exact rejection message and why `1.0.0` was left unclaimed.
- Everything under `1.0.0-beta.7` below applies to this release as well.

## [1.0.0-beta.7] - 2026-09-12

### Added
- **Event wiring you can see and choose.** Placing a control no longer silently picks an event for
you: a chooser lists the events that make sense for that control (curated per control type, the
default event first), you can **pick several at once**, and the handler stubs are created in one go.
**Skip** places the control unwired, and **Remember my choice** makes that control type stop asking
(settings: `avaloniaDesigner.askEventOnPlace`, `avaloniaDesigner.autoWireDefaultEvent`).
- **`Events per Control.md`** — a generated reference listing every event each control actually
exposes in Avalonia 12.1.1, with the `EventArgs` a handler must take, the declaring class, the
events offered in the picker, and the default event per control. Copy-paste accurate for
hand-written handlers.
- **Right-click → “Add event…”** wires another event on a control that is already placed, from the
same chooser. Events that are already wired are marked and cannot be selected twice.
- **Middle-click chooses which handler to open.** When a control has several events wired, the
middle-click now lists them so you can jump straight to the one you want (a single handler still
opens directly).
- **The code-behind check can run by itself.** The Code Fix… analysis can now run when you return to
the designer tab (default), on save, while typing, or only when you press the button
(`avaloniaDesigner.codeCheck.mode`). Findings are published to **PROBLEMS**, shown as a **⚠ badge**
on the control in the canvas, and summarised in the toolbar (`avaloniaDesigner.codeCheck.badges`).
The new **⚙ Settings** button opens these options in the designer.
- **“Keep my manual edit” for every finding.** When a check reports something you removed on
purpose, every fixable finding now offers an alternative that accepts your edit instead of undoing
it: delete the handler from the form as if it had never been wired (`unwrap-handler`), or record the
decision and stay quiet (`dismiss`).
- **Re-pointing after a rename.** A handler you renamed by hand (`Button1_Click` →
`Button1_Clicked`) is offered as a one-click **re-point** instead of an empty new stub, so the body
you wrote is never lost. A rename is only proposed when exactly one candidate fits the signature.
- **Foldable toolbar categories.** The designer toolbar is grouped into **Edit**, **File**,
**Zoom**, **Guides**, **Alignment** and **Spacing**; clicking a category heading folds its buttons
away and clicking it again brings them back. Categories start unfolded and the folded set is
remembered per designer tab.
- **CI and release workflows** (`.github/workflows/`). Every push compiles, runs the test layers
that need no .NET SDK and proves the extension still packages; a second workflow runs the full suite
and publishes to the Marketplace on demand.

### Changed
- **Toolbar tidy-up.** Every button is exactly 24 px tall, the toolbar wraps onto a second row
instead of squeezing buttons (a separator left dangling at a row break is hidden), **⚙ Settings**
sits at the far right, and all toolbar text is high-contrast.
- **Toolbar icons are inline SVG** (13 buttons: undo/redo, the six alignments, text-centre, size and
spacing) instead of font glyphs — identical on every machine, coloured by the button and readable
while disabled. **Refresh** is text-only.
- **Smaller package.** The VSIX no longer ships source maps, build metadata, unused artwork or local
tool state: **90 files / 588 KB** (was 114 files / 700 KB).
- **Activation is on demand.** The extension no longer activates at every VS Code start; the
designer, toolbox, commands and views activate it when they are used.
- **The event data is a generated catalog.** Default events, the picker lists and every handler
signature now come from `src/controlEvents.ts`, generated from the real Avalonia assemblies, so the
XAML stub, the C#/VB signature and the reference document cannot disagree any more.

### Fixed
- **A missing .NET SDK now says so.** Instead of the raw `spawn dotnet ENOENT`, the designer explains
that its preview host is built with the .NET SDK and links to the download page.
- The **Align horizontal/vertical centres** toolbar icons read as a star at 16 px; they now show two
arrows converging on the centre line.
- **Deeper high-contrast pass** on the alignment/spacing icons: they are drawn as paths (white,
1.7 px strokes) rather than by a font.

## [1.0.0-beta.6] - 2026-09-11

### Added
- **File Selector / Folder Selector tools (file & folder dialog controls)** — two new entries in the
  **Input & text editors** toolbox group. Each drops a path row (a box showing the chosen path + a
  **“…”** button) onto the form; the button opens the **platform's own** dialog (Windows / macOS /
  Linux, no extra package). Both insert the same `<chrome:PathPicker>` control and differ only in the
  shipped `Path Type`: `File` for the file selector, `Folder` for the folder selector — and `SaveFile`
  is one dropdown change away for a save-as dialog. The properties are **Path Type**, **Selected
  Path** (two-way: pre-fill it or bind/read it), **Dialog Title**, **File Filter**
  (`Images|*.png;*.jpg|All files|*.*`), **Initial Folder**, **Read Only Path** and **Browse Text**.
  The bundled **`PathPicker.cs`/`.vb`** helper is copied into the project the first time a selector is
  placed (and reported/re-copied by 🩺 **Code Fix…** for projects that predate it), exactly like
  `ChromeWindow` / `GrumpyPanel`.
- **A menu item can now be a File Selector or a Folder Selector.** The **Menu Items** editor offers the
  two new kinds next to **Item**, **CheckBox**, **Radio**, **ComboBox**, **Separator** and **Space**.
  A selector row is a **leaf** (no children) with its own **px width** and **dialog title** fields, and
  saving writes a real `<chrome:PathPicker PathType="File|Folder" …>` inside the `<MenuItem>` — so a
  menu can offer “Open file…” / “Choose folder…” without a line of code. Existing picker rows are read
  back into the editor when it reopens, and an unknown or garbled kind is normalised rather than
  corrupting the tree.
- **The path rows show which kind they are.** `<chrome:PathPicker>` draws a small **page** or **folder**
  glyph at its left edge (page for `File`/`SaveFile`, folder for `Folder`, tinted with the control's
  `Foreground` so it follows the theme), and the new **Show Icon** property (default `True`) turns it
  off — useful when a form has several pickers, or pickers inside a menu.
- **💾 Project Backup (designer toolbar)** — one click makes a dated copy of the whole project: it
  first **saves everything that is unsaved** (the open form, every open DataSet document and any other
  dirty editor) and then copies the project folder into its **parent** folder as
  **`<Project>_<YYYY-MM-DD>_<HH-MM-SS>`** (`MyApp_2026-09-11_14-32-05`, which sorts by date); if that
  name is taken, `-2`, `-3`, … is appended. `bin`, `obj`, `.vs`, `node_modules` and `.git` are skipped
  **at any depth** — a backup is the project's own files, never build output or a git history — and if
  a save fails, **nothing** is copied (the status line names the file that could not be saved).

### Changed
- **The Properties sidebar is now grouped into sections — with the same order for every toolbox
  control.** Instead of one long list whose order depended on the control, rows are filed under
  **Editors**, **Layout & size**, **Appearance**, **Text & font**, **Data** and **Behavior**, so
  related settings sit together (all colour/brush rows in Appearance; size, position, dock, anchor
  and alignment in Layout & size; content and font in Text & font; item sources and edit
  permissions in Data) and a given row is always in the same place whichever control you select.
  Inside a section the order is canonical too (Width → Height → Left/Top → Margin → Padding →
  Dock → Anchor → Alignments), and the designer's popup editors (Rows/Columns, Split Layout, Items,
  Menu Items, Status Items) are collected in a leading **Editors** group. Section headings are
  **collapsible** — the folded state is remembered **per control type** (in the panel's own state, so
  it survives reopening), and **Show advanced** still reveals the advanced rows inside their sections.

### Fixed
- **🩺 Code Fix… no longer reports a C# form as having no constructor.** The checker recognised C#
  methods by their `void` return type — and a constructor has **none** — so a perfectly good
  `public MainWindow() { InitializeComponent(); … }` was flagged with the **warning** *“No
  constructor / InitializeComponent”*. That warning is published into the **PROBLEMS** pane, so it
  looked like a compiler warning while `dotnet build` reported 0 warnings / 0 errors — and the fix it
  offered would have inserted a **second** constructor (`CS0111`) instead of using the existing one.
  Constructors are now parsed (any access modifier, attributes, `: base()`/`: this()` initialisers),
  the fix calls into the **existing** constructor, and a safety net makes a duplicate constructor
  impossible even for a layout the parser cannot read.
- **…and VB code-behind with a one-line lambda is read correctly.** A single-line
  `Function(r) r.Name` or `AddHandler x, Sub(s, e) DoIt()` has no `End Sub`/`End Function` in VB, but
  the checker counted it as a block — so the method's own `End Sub` closed the phantom level and the
  span collapsed or ran long. That produced a false *“InitializeComponent() is missing from the
  constructor”* **error** on any form with a follower or a status clock, and it could make the *remove
  leftover handler* fix delete the wrong lines. Single-line lambdas are skipped, multi-line ones are
  still counted, so a fix now cuts exactly the method it names.
- **🩺 Code Fix… inserts its statements inside the body.** Adding `InitializeComponent()` /
  `BindImage_X()` to a constructor put the line after the **signature** — in front of an Allman-style
  `{` on the next line, which is invalid C# — and a missing VB constructor was inserted **above**
  `Inherits`, which VB requires to come first in the class body. The call now lands after the opening
  `{` (C#) or after the `Inherits …` line (VB), and a Data-Image call goes **after**
  `InitializeComponent()` — before it, the grid the binding wires up does not exist yet.

## [1.0.0-beta.5] - 2026-09-11

### Fixed
- **A follower binding no longer makes a C# project warn (`CS8603`).** The generated line was
  `ComboBox2.ItemsSource = new ColumnFollower<CustomersRow, string>(…)`, but the DataSet generator
  writes the row property as `public string? Name` — and the project template sets
  `<Nullable>enable</Nullable>` — so the selector lambda `r => r.Name` returned a maybe-null value
  into a non-nullable `TValue` (*warning CS8603: Possible null reference return*) in **every**
  generated C# project. The follower's value type now matches the generated row property exactly:
  `string?` / `byte[]?` for the reference-type columns, plain `int`, `long`, `double`, `decimal`,
  `bool`, `System.DateTime`, `System.Guid` for the value-type ones. VB.NET has no nullable reference
  types, so its `String` spelling is unchanged. Re-binding a follower rewrites the line, so a project
  that already carries the old spelling is corrected by the next bind.

## [1.0.0-beta.4] - 2026-09-10

### Added
- **Every generated `.axaml` starts with a “do not edit by hand” notice** —
  `<!-- Do NOT edit this file manually - Use the Designer to make changes -->` is the first line of
  a new project's `App.axaml` and `MainWindow.axaml`, of every form the **New Form** tool creates,
  and it is (re-)stamped on **every designer save**, so a file that was hand-written, hand-edited or
  created by an older version gains it too. Exactly one copy is kept (`<?xml …?>`/BOM stay first),
  and the designer's **⟳ Refresh** change check ignores the notice — reloading a form whose body is
  unchanged is not mistaken for an outside edit.
- **🩺 Code Fix… (code-behind checker)** — a new **designer-toolbar** button that checks a form's
  code-behind against its `.axaml` **and** the project's `.adset` files, then lists what is wrong
  with a **Fix** button per finding, **Fix all**, **Re-check** and **Go to line**:
  - **VB accessors** — a named control whose `FindControl` accessor is missing (the cause of
    `BC30451 'Image1' is not declared'`), and accessors left over from a deleted control (dropped
    only when nothing else references them).
  - **Duplicate definitions** (`BC30269` / `CS0111`) — e.g. a generated Data-Image block that got
    inserted twice.
  - **Event wiring** — `Click=`/`Loaded=`/`SelectionChanged=` handlers that don't exist yet (a stub
    with the correct signature is inserted) and handlers whose `EventArgs` type is wrong.
  - **Leftovers** — `<Control>_<Event>` handlers of deleted controls, removed **nesting-aware** so a
    generated clock handler's inner `Sub … End Sub` can't be left behind.
  - **Data-Image bindings** — incomplete blocks, a lost `' DataImage:` marker (re-stamped), bindings
    whose Image or DataGrid no longer exists (un-bound), and renamed column/table
    (re-generated from the `.adset`).
  - **DataSet drift** — `row.<Column>`, `<dataset>.Load<Table>()` and `Wire<Table>Grid(…)` calls
    that reference a renamed/deleted table, and `ItemsSource` statements aimed at a deleted control.
  - **Build prerequisites** — a bundled helper (`ChromeWindow`, `GrumpyPanel`, `AnchorHelper`,
    `ExifImageLoader`) missing from the project (copied in), and missing `Imports`/`using`
    statements (`Avalonia.Controls.Shapes`, `AvaloniaChrome`, `Avalonia.Platform.Storage`,
    `System.Data`, `Avalonia.Input`).
  - **Structure** — `InitializeComponent()` never called, and a `chrome:ChromeWindow` root whose
    class still inherits `Window` (converted).
  Findings are **also published to the PROBLEMS pane** as diagnostics on the `.vb`/`.cs` (or the
  `.axaml`), and the code-behind is **backed up once per run** into the extension's storage before
  the first fix. Anything a human has to decide (a control name that isn't a valid identifier, the
  same `x:Name` twice, `x:Class` ≠ the declared class, a stale name still used by hand-written
  code) is listed **without** a fix button rather than guessed at.
- **⟳ Refresh button in the designer toolbar** — re-reads the `.axaml` from disk and re-renders, so
  edits made in another editor and **rows added by a running app** (the design-time SQLite preview)
  show up without closing and reopening the form. Unsaved designer edits are never clobbered.
- **Follow-a-column bindings (a read-only control follows a bound DataGrid)** — a control that only
  DISPLAYS data (**ComboBox / ListBox / ItemsControl**) can now list one **text column** of a table a
  DataGrid owns, **live**, without owning the table itself. The Items Source picker lists those
  columns as `DataSet.Table.Column` entries (“follows DataGrid3 — lists the Name column, live”);
  picking one writes
  `ComboBox2.ItemsSource = New ColumnFollower(Of CustomersRow, String)(_customers, Function(r) r.Name, Function(r) r.IsPlaceholder)`
  (C#: `new ColumnFollower<CustomersRow, string>(_customers, r => r.Name, r => r.IsPlaceholder)`),
  copies the bundled **`ColumnFollower.cs|.vb`** helper into the project when it is missing, and
  records the binding on the table's `.adset` (`followers`), so the DataSet designer and Code Fix
  see it. Followers keep the grid's row order, **skip the “+ Add row…” placeholder** row, update on
  add/remove/**cell edit** (in place, so the control keeps its selected item) and can be un-bound
  from the same picker. A control that owns a table (a bound DataGrid) is not offered followers.
- **ColumnFollower helper** — bundled like `AnchorHelper`/`ExifImageLoader` and shipped with every
  new project (older projects get it copied in on first use).

### Changed
- **ChromeWindow title-bar colours** — the bundled `ChromeWindow` gained **Title Bar Color** and  **Title Bar Text Color** properties (with the predefined palette), so the dark-navy bar can be
  restyled per form. A project that predates the properties gets the current bundled file first.
- **The previewer host shuts down by itself** when its WebSocket client disconnects, plus a 90 s
  watchdog when the extension never manages to connect, and it is killed explicitly on window
  reload / deactivation. Leaked hosts used to be reparented to `systemd` and stay resident
  (~25 MB each; ~20 had accumulated).
- **Previewer-host errors are logged to the “Avalonia Designer” output channel** instead of
  appearing as raw unhandled-rejection stacks in the Extension Host output pane.

### Fixed
- **Data-Image bindings can no longer be inserted twice** — the `BindImage_<control>` method now
  proves a binding exists even when its `' DataImage:` marker was lost, and a marker-less block gets
  its marker re-stamped instead of a duplicate copy of its handlers (the cause of
  `BC30269 … has multiple definitions with identical signatures`). Un-binding recognises a
  marker-less binding too.
- **VB accessor sync can no longer drop accessors** — it now unions the **saved `.axaml`** with the
  **in-memory model** (a control that was just dropped/bound can be missing from either side) and
  also picks up `Name=` (not only `x:Name`). This was the other half of the
  `'Image1' is not declared` bug.
- Removing a VB handler whose body holds a nested anonymous `Sub`/`Function` (the generated
  XY-Tracker / StatusDate clock) no longer stops at the inner `End Sub`, so deleting an XY-Tracker
  control leaves no `timer.Start()` / stray `End Sub` behind.
- Dragging a divider in a **multi-pane SplitPanel** (3+ panes) no longer moves the *other*
  dividers: the axis is rewritten all-star, Avalonia-style — the dragged pane takes the pixels and
  its immediate neighbour absorbs the difference (matching GridSplitter at runtime).
- The **title-bar colour properties** now offer the predefined colour palette in the Properties
  panel (they had been added without `options`, so the dropdown came up empty); the whole toolbox
  was audited — every colour property has the palette.
- The Add/Edit row dialog shows each column's **label** again above its input box, and the integer
  **key column is pre-filled with the next free id and shown read-only** when adding a row.
- Binding a control that still has **inline items** is now caught: Avalonia refuses an `ItemsSource`
  while `<ComboBoxItem>`-style children exist (“Items collection must be empty before using
  ItemsSource.”) and the app would throw at startup. The picker asks to clear them as part of the
  bind, and 🩺 Code Fix reports it (one-click fix). Code Fix also drops a **follower binding whose
  grid/column is gone** and re-copies a missing `ColumnFollower` helper.
- **Test suite:** the webview fixture now covers every element `media/designer.js` looks up (a
  missing `btnRefresh` made the script throw on load and silently reduced the T3 layer to 5 of ~360
  checks — there is now an assertion that fails loudly instead), the bundled-component fixtures
  mirror the current marker, and the T4 harness re-asserts its `ProjectReference` before building.

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
- **File browser in the add/edit row dialog** — every **text (String) column** in the DataGrid's
  "+ Add row…" / edit row dialog now has a **Browse…** button that opens the native OS file picker
  (images first, with an *All files* option) and writes the chosen file's **full absolute path** into
  that box. The dialog remembers the folder you last picked from (best-effort, kept next to the app)
  and starts there next time. Generated for **both C# and VB**.
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
- **XY-Tracker tool (Dev Helpers)** — a `TextBlock` that shows the live size of its context as
  **W x H px**, updated every 200 ms by a generated `Loaded` `DispatcherTimer` (C# and VB
  code-behind created for you). Dropped on a container it reports that container's size; dropped on
  a Status Bar (or added via the Status Items editor as the **'form WxH'** kind) it reports the
  **form's** client size and hugs the right edge. Standard Background / Foreground / Font properties
  and Anchor behaviour apply. (Form mode reaches the window via `TopLevel.GetTopLevel`, which is
  how Avalonia 12 exposes it — there is no `Control.TopLevel` instance property anymore.)
- **StatusDate Date/Time formats (System/Custom)** — selecting a StatusDate clock now shows
  beginner-friendly **Date Format** and **Time Format** pickers (each: **None (hidden)**, **System**
  = the OS format, or pick a shown example like *Mon, 9 Sep 2026* / *14:32*) plus a live **Preview**.
  You can hide either the date or the time, and the picked formats are written into the generated
  code-behind clock handler so the runtime clock matches.
- **SplitPanel design-time splitter dragging** — grab a divider between two panes in the designer
  and drag it to resize the panes: a guide line follows the mouse, and on release the split is
  applied as fixed pixels (the pane's Width/Height shows the new divider position; a neighbouring
  pane flexes). Drags respect each pane's minimum and undo as a single step (Ctrl+Z). Works across
  Zones / Columns / Rows layouts.
- **Grumpy Panel tool (Layout panels)** — a bundled **docking-region** control (a framed
  `<chrome:GrumpyPanel>`, `GrumpyPanel.cs`/`.vb` shipped with every project like ChromeWindow).
  Drop it on any canvas/panel: children you drop inside land **freely** (no auto-placement), and a
  **dock-able** control (Menu, Status Bar, Image, grids, …) can be **Docked** to the panel's edges
  — it pins to that edge while the free body shrinks (Dock = **None** returns it to the free body).
  The panel itself has a **Dock** plus a dedicated **8-position Anchor** (Left / Right / Top /
  Bottom / Top-Left / Top-Right / Bottom-Left / Bottom-Right) that pins it to its container, and a
  Border-style frame (Background / Border Brush / Border Thickness / Corner Radius) with a
  **System / Custom** Theme switch. Older projects get the helper copied in automatically when you
  place one.
- **GrumpyStatus tool (Bars)** — a ready-made **status strip built on the GrumpyPanel base**:
  dropping it docks a dark-grey (default) strip to the **bottom** edge, with a **status label on
  the left** and a **live clock (StatusDate) on the right** — its per-second timer code-behind is
  wired for you automatically. Afterwards it behaves like any GrumpyPanel: add more items freely
  or **Dock** them (Left/Right/Top/Bottom) to pin them to a strip edge; edit the label text, the
  clock, the dark-grey background and the strip height from Properties.
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
- **Deleting a VB control left code-behind fragments (e.g. `timer.Start() / End Sub`)** — deleting an
  XY-Tracker (or any control whose generated VB handler embeds an anonymous timer `Sub`) only removed
  the code up to the *inner* `End Sub`. Handler removal now finds the **matching** `End Sub` (nesting
  aware, skipping comments/strings), so the whole method is removed cleanly.
- **SplitPanel: dragging a divider in a multi-pane split moved the OTHER splitters too (design-time and
  runtime)** — the design-time drag pinned the dragged pane to a fixed pixel width, and a fixed + star
  column mix makes Avalonia's real `GridSplitter` resize only the fixed neighbour while the star
  absorbs (so neighbouring splitters shift). A divider drag now keeps the whole axis **all-star**
  (each pane's star value = its pixel width, Avalonia's own runtime model): the dragged pane takes the
  new pixels and its immediate neighbour absorbs the difference, so **only the dragged divider moves**
  in the designer and at runtime. Typing a pane's pixel Width/Height uses the same model.
- **XY-Tracker on the new GrumpyStatus bar reported the bar's size instead of the form's** — form-mode
  detection only recognised the legacy Status Bar strip, not the GrumpyStatus (a bottom-docked
  GrumpyPanel). A tracker dropped onto a GrumpyStatus now reports the **form's** client size and is
  pinned to the strip's **right** edge inside its dock band, exactly like a legacy Status Bar item
  (works whether you drop it on the strip's empty middle or straight onto its label/clock).
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
