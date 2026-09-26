# Changelog

All notable changes to the **Avalonia Designer for VS Code** extension.

Format: based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [SemVer](https://semver.org/) — with one wrinkle, see the note below.

> **One version number per release.** The GitHub tag, the release title and `package.json` all carry the same
> `major.minor.patch` — `0.12.15` now — and that is the number the Visual Studio Marketplace shows and compares
> (it accepts nothing else: a suffix like a pre-release name is rejected outright). The number is a plain
> sequence, so it only ever goes up; `1.0.0` is still reserved for the first stable release, because a
> published version can never be reused. Releases before `0.10.0` used a separate `v1.0.0-beta.N` tag for the
> GitHub release while the listing carried `0.9.x`; the entries below keep that history exactly as it shipped.

## [0.12.15] - 2026-09-26 · *the spreadsheet works itself out, and it docks*

Asked for as *"continue with the final phases of the spreadsheet control"* and *"the control must be dockable —
add the Dock property"*, then *"add the drag handles for design time"*. Three features, one release.

### Added — formulas (phase 3, the last one the roadmap listed)

- **A cell whose text starts with `=` now works itself out.** The text is what the form keeps, what the **fx
  box** shows and what the **Cells editor** shows; the **grid draws the result**. That split is the whole
  design: the editing surface stays a spreadsheet's text, the display stays a spreadsheet's numbers.
  `GetCell(row, column)` returns the formula, and the new **`ValueOf(row, column)`** returns what it works out
  to — which is also what a literal cell returns, unchanged.
- **The dialect** is the honest subset a result grid needs: `+ - * / ^ &`, comparisons (`= <> < > <= >=`,
  drawn as TRUE / FALSE), brackets, `"text"` with `""` for a quote, `A1` references, `A1:B3` ranges, and
  **SUM, AVERAGE (AVG), MIN, MAX, COUNT, COUNTA, ABS, ROUND, INT, SQRT, MOD, IF, AND, OR, NOT, LEN, UPPER,
  LOWER, TRIM**. `$` on an address is accepted and ignored — the sheet has no copy/paste yet, so there is no
  relative/absolute distinction for it to carry.
- **IF evaluates only the branch it takes.** `=IF(A1=0,0,1/A1)` is the usual way to guard a division, and it
  only works when the branch **not** taken is never evaluated — so the two branches are scanned for their text
  and the taken one is parsed on its own. Everything else evaluates its arguments eagerly, which is what every
  other function wants.
- **A range is clipped to the sheet** (`SUM(B2:B999)` on a 50-row sheet means that column, which is what the
  author meant), while a **single** reference off the sheet is `#REF!` — there is nothing there to read.
- **Nothing fails silently or badly.** `#VALUE!`, `#NAME?`, `#REF!`, `#DIV/0!` (also `0^-1`, and an average of
  nothing) and `#CYCLE!` for a cell that reaches itself — found with a set of the cells currently being worked
  out, not by recursing until the stack runs out. A formula can never throw out of the control, nesting is
  bounded at 64, an error is handed on by whoever reads it, and results are cached until any cell's text
  changes, so a chain of formulas costs one pass per **edit** rather than one per repaint.
- The engine is in **both twins, member for member**. VB owns `Mod`, `Not`, `Name`, `IsNumeric` and `Call`, so
  the pair uses `Modulo`, `LogicalNot`, `ReadName`, `IsNumericValue` and `CallFunction`, and the T2 suite now
  fails if either twin renames one of them.

### Added — the sheet is dockable

- **`Dock`** (the attached `DockPanel.Dock`, `None` / `Fill` / `Left` / `Top` / `Right` / `Bottom`) is the
  first row of the sheet's Properties, so a sheet can be one *region* of a form — a grid docked Bottom under a
  body, or Left beside it — which is how a spreadsheet is usually used. Choosing a real dock makes the
  designer wrap the sheet in a `DockPanel` when it is not already in one and clear the free-axis size so it
  stretches to that edge. **The control itself needs no property for this**: `DockPanel.Dock` is attached and
  every `Control` carries it, which is what `GrumpyPanel`'s own header has said all along.

### Added — the Cells editor sizes a track by dragging (design time)

- **A grip on the right edge of every column letter and the bottom edge of every row number**, with the
  `col-resize` / `row-resize` cursor: the same gesture, in the same place, as the control's own header border.
  The size **reads out in the name box** while dragging (*Column C  120 px*), a **double-click** on the grip
  puts that track back on `ColumnWidth` / `RowHeight`, and a header click still selects the whole column
  because the grip stops propagation.
- The table is now a **fixed layout with a `<col>` per column**, filled from the sheet's `ColumnWidth` and
  from the sizes already dragged, and each row carries its own height. The old stylesheet pinned every cell to
  a 72×22 min/max — which would have overruled exactly what these handles set.
- The size is floored at the control's own **`MinTrackSize` (16px)**, because a design-time drag the running
  sheet then clamps would be a lie, and Save writes the sparse **`ColumnWidths` / `RowHeights`** (`3:120`) —
  an empty list **removes** the attributes, so a size can always be undone.

### Changed

- The Cells editor's hint now describes the sizing drag and says a leading `=` is evaluated in the app rather
  than stored as text; the control's toolbox description lists the function set, the error names and the Dock
  behaviour.

### Notes

- Checked by two throwaway probes rather than by eye: `/tmp/sheetformula` (C#, 69 checks) and
  `/tmp/sheetformulavb` (VB, 63) run the **same battery** and both end `RESULT PASS` — including that the
  formula `=40+2` puts **exactly the same ink on the canvas** as the literal `42` does (51 px), which is the
  assertion that proves the grid draws the value and not the formula. The probes found two real bugs before
  the release did: `COUNTA` did not count text, and `=IF(A1,1)` (a branch left out) was `#VALUE!` instead of
  blank.
- Probes have their own trap worth writing down: a probe that calls its helper **twice** per check (once to
  compare, once to print what it got) walks a row further each time, so after twenty checks it is writing
  cells past the end of a 20-row sheet and every result reads as `""` — which looks exactly like an engine
  that returns nothing. Put the formula under test in **one** cell.
- The design-time handles were verified in a real browser (the webview harness): the grips sit exactly on the
  header borders, a drag resizes, a header click still selects, a double-click clears. A probe that measured a
  grip *after* a rebuild was measuring a **detached** element — `getComputedStyle` returns nothing and the
  rect is zero, which made a working feature look broken for one round trip.
- Suite **9,148 passed / 0 failed**; the T5 VB matrix (1,904 checks) now generates a form with
  `DockPanel.Dock="Left"` on a sheet and **compiles** it. Version `0.12.15` with all 18 bundled stamps.

## [0.12.14] - 2026-09-26 · *one colour control, and it is the swatch*

*"Your new dropdown picker with the embedded swatch works well. You can now remove the original swatch and
keep the dropdown version."* — answered with three questions first, because there are **eight** colour spots
in the panel and only **one** of them ever had a dropdown.

### Changed

- **Every colour spot is now one control**: a swatch that shows the colour and opens the picker popup when
  clicked. The property rows, the splitter cell, the DataGrid row background, the chart series colour, the Dot
  Grid dialog, the Crosshair dialog and the sheet's Text / Fill wells all work the same way.
- **The separate `▾` button is gone.** In the property rows the swatch replaces both it and the
  `<input type="color">`, so a row carries one colour control again; the `▾`'s stylesheet rules went with it,
  and a test now fails if a `.color-drop` comes back.
- **The hex/name box beside it stays** and remains the authoritative field: `Teal`, `Transparent` and a pasted
  `#RRGGBB` all survive without opening anything. The swatch carries that **same** value rather than a hex
  derived from it, so a named colour reaches the popup *as the name* and is listed on top of the row's own
  presets instead of appearing as a colour the row does not offer.
- The popup keeps the picker it gained in `0.12.13` — saturation/value square, hue strip, hex/name box, and the
  row's presets — and still only commits on **Use**, Enter or a preset click, so a drag cannot close it.

### Notes

- Verified in a real browser at 240 / 300 / 380 / 600 / 900 / 1440 px: six swatches, all inside the panel,
  zero native colour inputs, no leftover `▾`, one click opens the popup (which stays inside the window), and
  the `Teal` swatch paints `rgb(0,128,128)` while carrying `dataset.color = "Teal"`.
- Suite **9,058 passed / 0 failed**.

## [0.12.13] - 2026-09-26 · *put the system swatch back — and the popup learned to pick any colour*

*"I dont like the new colour picker — it limits me to the existing collection of colours. Bring back the system
swatch and make sure it renders inside the ide borders"*, followed by the sharpest sentence of the day:
***"You have corrected this issue in earlier versions."*** They were right, and `0.12.12` had been wrong.

### Fixed — a diagnosis by elimination, corrected

- `0.12.12` removed every `<input type="color">` because a native picker near the right edge had drawn off the
  side of the panel. **The offscreen popup was the panel's own palette**, and that was fixed in **`0.11.18`**
  — see *the colour palette opened half off the screen* below: it caps its own width to the window (both
  bounds, because `min-width` outranks `max-width`) and flips to its trigger's right edge. The native swatch
  was never the culprit, and removing it also removed every colour that is not in a preset list.
- **The system swatches are back** at all eight spots; each posts on `change` — never on `input`, which fires
  while the picker is still open and would re-render the panel out from under the user's hand.
- **The lesson, written into the notes rather than the code:** search `CHANGELOG.md` for an earlier fix before
  "fixing" the same complaint again. And when a change spans eight places, **ask** — scope, merge, keep the
  text box — instead of choosing for the user.

### Added

- **The `▾` popup carries a picker of its own**: a saturation/value square, a hue strip, the hex/name box and
  the row's presets. Seeded from the current value *including a named one* (`Teal` starts it at hue 180, via
  the browser's own CSS parser), and it only commits on **Use** / Enter / a preset click — dragging updates
  the box, nothing more.

### Notes

- Measured in a real browser: every swatch's own box is inside the panel at 1440 / 900 / 600 / 380 / 300 /
  240 px, and the page never scrolls horizontally — which is the one thing that can drag a browser-placed
  popup out of the panel. A picker's *frame* is the platform's to place; the swatch is ours, and the popup is
  ours and clamps.
- Suite **9,048 passed / 0 failed**.

## [0.12.12] - 2026-09-26 · *a menu that draws itself, and the colour pickers that drew offscreen*

Two reports from using the app, both reproduced before anything was changed.

### Fixed — right-clicking the sheet opened nothing

- The Avalonia `ContextMenu` existed and its commands worked when raised by hand, but **`ContextRequested`
  never reached the control**, so the gesture itself did nothing at all — and a popup cannot be rendered
  headless either, which is how it shipped unverified.
- **The sheet now draws the menu itself**: same colours as the sheet, clamped inside the control near an edge,
  opened from the right button, closed by a press outside / the wheel / losing the keyboard, and it owns the
  keyboard while open (Escape, the arrows past the separators, Enter). Because it is the control's own drawing
  it became checkable in **pixels** — the probes now right-click for real and find the panel on the canvas.

### Added — the VB twin caught up

- `GrumpySheet.vb` gets the self-drawn menu, `MoveWithControl` / `LastUsedCell` (Ctrl+Arrow runs to the end of
  a filled block, skips a gap to the next value; Ctrl+End is the bottom-right of what is in the sheet) and the
  focus-on-load deferral (`Loaded` then one step through the dispatcher — asking inside `Loaded` itself is
  refused). VB traps hit here: `step` is a keyword, and `Byte + Byte + Byte` overflows.

### Changed — every native colour picker replaced (reverted in 0.12.13)

- All six `<input type="color">` sites became swatch buttons opening the `▾` palette, on a diagnosis by
  elimination that `0.12.13` corrected. Kept from the change: the popup learned to take a **typed** value, so
  a named colour and an exact hex were still possible once the native picker was gone.

### Notes

- Probes: `/tmp/sheetkeys` (C#, 45 checks) and `/tmp/sheetvbfix` (VB, 56) both end `RESULT PASS`, right-clicking
  for real. Suite **9,027 passed / 0 failed**.

## [0.12.11] - 2026-09-26 · *five things from running the sheet*

All five reported from the app. Two of them were the interesting kind.

### Fixed

- **Typing was invisible, and it was TWO bugs.** (a) The renderer **skipped** the cell being edited in place
  (*"the editor draws it"*) and nothing else ever drew it, so typing looked invisible until the cell lost
  focus — it is now drawn from `_editText` with the caret, left-aligned while typing, because a number should
  not jump about as it becomes numeric. (b) **`InsertIntoEdit` was written for exactly this and never
  called**, so `OnTextInput` dropped every character after the first: typing *Item* kept only *I*. A private
  method with no caller is a smoking gun — grep for callers, not only definitions.
- **A column header selected every column to its left.** `SelectionFirstRow` tested `_wholeRows` and
  `SelectionFirstColumn` tested `_wholeColumns` — the flags were **swapped**, and Clear, align, fill and the
  header highlights all inherited it. A whole-column selection spans every row; its columns come from the
  anchor. New public `SelectedFirst/LastRow`, `SelectedFirst/LastColumn` and `SelectColumn` / `SelectRow` make
  the rule checkable from outside.
- **No way to size a column or row:** dragging a header border now gives that track its own size (see
  `0.12.15` for the design-time half), with `MinTrackSize`, the sparse `ColumnWidths` / `RowHeights` text and a
  `SheetSizeChanged` event announced once per drag, on release.
- **No way to reach the columns off to the right:** slim scrollbars (draggable thumb, clickable track,
  `ShowScrollBars`) appear when there is something to scroll to, and a plain wheel falls back to the columns
  when every row already fits — before this, only Shift+wheel reached them and nothing said so.

### Added

- **A right-click menu** that lines the selection up (left, centre, right, automatically), bolds or italicises
  it, and clears its contents or its formatting. It acts on the **selection**, so a whole column lines up in
  one gesture; `AlignSelection` only touches the cells that already exist for a whole column or row, because
  creating one per empty row would write fifty elements into the form. A bounded selection *does* create them,
  which is what makes "select A1, right-click, centre, then type" do the obvious thing.
- **Ctrl+Arrow and Ctrl+End**, in both twins: the far end of the block of filled cells in that direction, a
  skip over a gap to the next value, and the bottom-right corner of what is in the sheet.
- **Focus on load** — an arrow works without clicking first. The work happens on `Loaded`, not on attach (there
  is no `TopLevel` yet), and the request is posted one step through the dispatcher because asking inside the
  `Loaded` handler itself is simply refused. Deliberately conditional: a form that puts the caret in a `TextBox`
  keeps it.

### Notes

- Suite **8,932 passed / 0 failed** (from 8,630 at `0.12.8`).

## [0.12.10] - 2026-09-26 · *the spreadsheet, phase 2: a cell can be styled*

Feature 3 of the spreadsheet: centring, fonts, highlight colours and Clear, for the selected cells — in the
control, in the twin, and in the designer's Cells editor.

### Added

- **`SheetCell` carries `Bold`, `Italic`, `FontSize` (0 = the sheet's own), `FontFamily` (`''` = the sheet's
  own), `TextColor`, `Fill` and `TextAlign`.** The enum is **`SheetAlign { Auto, Left, Center, Right }`** — and
  it is `Auto` rather than `Default` because `Default` is a **VB keyword**: as an enum member it is BC30185
  where the C# twin compiles happily, and a twin that only compiles in one language is not a twin. The T2 suite
  refuses the name outright.
- Fills draw **under** the wash and under the grid lines, so a highlighted cell still reads as selected; `Auto`
  keeps numbers right and text left, and a chosen alignment overrides it.
- **A blank cell that carries formatting is kept** rather than dropped — an empty highlighted box is a real
  thing to want, and it is written into the form as a `<spread:SheetCell>` with no `Text`.
- API: `CellAt` / `EnsureCell` / `Refresh`, the `Set…` methods per field, `ClearFormatting`,
  `ClearSelectionFormatting`, and `ToggleBoldSelection` / `ToggleItalicSelection` — Ctrl+B / Ctrl+I act on the
  selection and are **ON when any selected cell is not**, OFF when they all already are.
- **A formatting bar in the Cells editor**: bold, italics, size, font, text colour, highlight (with a `×` back
  to the sheet's own) and alignment, acting on everything selected while showing the active cell's own settings.
  A setting left on the sheet's own is not written to the form at all.
- VB trap the compiler found: **`Typeface` is a struct in Avalonia 12**, so VB cannot null-coalesce it — the
  optional parameter is nullable and the twin asks `HasValue`.

### Notes

- Suite green at **0 failed**; the `0.12.9`…`0.12.11` counts were not recorded at the time (see
  TEST_PLAN.md for the ones that were).

## [0.12.9] - 2026-09-26 · *the spreadsheet control — both twins, and its designer editor*

*"I want to create a 'Grumpy's SpreadSheet' control for the toolbox … Columns named A to Z, rows named 1 to
50"*, with five features — and seven questions answered before any code was written. This is **phase 1**:
grid, selection, data entry, autofill, formula bar.

### Added

- **A self-drawing control** (`resources/GrumpySheet.cs` and `.vb`, twins line for line): 26 columns (A…Z), 50
  rows, both settable, frozen lettered / numbered headers, its own scrolling, no NuGet package, no template, no
  assets — so it previews in the headless host exactly as it runs.
- **Selection**: click, drag a range, a whole column or row from its header, the corner for everything, Ctrl+A,
  Shift+click and Shift+arrows to extend, PageUp / PageDown, Home, Tab and Enter.
- **Data entry**: type to replace, F2 or a double click to edit what is there, Enter / Tab commits and moves, Esc
  abandons, Delete clears. **The caret, the text and the fx box are drawn** — no `TextBox`, no `TopLevel` — so
  the sheet renders identically where nothing can be focused.
- **Autofill**: drag the handle and the pattern is predicted — `1, 2` becomes `3, 4, 5 …`, `2, 4` becomes
  `6, 8 …`, a single number counts up by one, `Item1, Item2` becomes `Item3`, anything else repeats.
- **The form's API**: `SetCell` / `GetCell` (both 1-based), `ClearRange`, `ClearSelection`, `FillSelection`,
  `SelectCell` / `SelectRange` / `SelectAll`, `BeginEdit` / `CommitEditNow` / `CancelEditNow`, the statics
  `CellName` / `ColumnName` / `ParseCellName`, the `CellChanged` and `SelectionChanged` events, and
  **`AllowEditing = False`** for a read-only results grid.
- **The cells are child elements, not properties**: `[Content] AvaloniaList<SheetCell>` means a form carries
  `<spread:SheetCell Row="1" Column="1" Text="x"/>` directly — verified against the **real XAML compiler**.
- **The designer half**: the five touchpoints and the dozen lists that have to keep up — the Toolbox category,
  `controlInfo`, the host's snippet table *and* `TypeMap` (the one that fails silently), the property catalog
  (geometry, colours, three switches, and the **Cells editor** row), `xamlModel`'s `xmlns:spread`, the scaffold
  and creator plus the test builder, `bundledComponents` (a new kind, with the pinned file-name arrays
  updated), `codeBehind`'s VB import rule and `codeBehindCheck`.
- **The Cells editor** — a real HTML table in a modal, not a canvas: cells are `<td>`, the headers are sticky
  `<th>`, clicking a letter or a number selects that line, dragging across cells selects a range, and the
  selection's bottom-right handle continues a series with the **same prediction** the control applies at run
  time. Rows and Columns are set in the same dialog, because it is the thing that draws the grid those two
  numbers describe.
- Cell text is stored **verbatim**, so a formula is kept and shown; evaluating it was left as phase 3 and does
  not change the format — which is why `0.12.15` could add the engine without touching a single form.

### Notes

- Suite green at **0 failed**.

## [0.12.8] - 2026-09-26 · *the Data Selector row moves to where the data is*

### Changed

- **The chart's `Data Selector` row now sits in the Data section, not in *Appearance*.** That is where
  it always belonged: the row answers *"where does this chart's data come from"*, and the rows the section
  puts under it — the inline array, the workbook columns — are what it points at. It sat in *Appearance* for
  a dull reason worth writing down: the row was **keyed `Data`**, which is *also* the shape controls'
  path-geometry row (**Path Data**, a text box that does belong in Appearance), the section map takes the
  **first** listing, and `Data` has been listed under Appearance since `0.11.11`. Moving the shared key
  would have dragged every `Path` and `Polygon`'s geometry row along with it, so the chart's row has a key
  of its own (`DataSelector`) and is listed **first** in **Data** — left *unlisted* it would have been filed
  under *Editors*, which is where `groupPropertyRows` sends an editor button that no section claims.
  Nothing else moved: the label is still *Data Selector*, the button still reads *Select data…*, and the
  shape controls keep their `Data` row where they always had it.

### Notes

- The webview's opener follows the key, and the tests that looked the chart's row up by `Data` were updated.
  The data-selector test no longer merely asserts the row exists — it pins **`sectionId === 'data'`** for
  every chart type, which is the thing that was wrong.
- Suite **8,630 passed / 0 failed**. Version `0.12.8` with all 16 bundled stamps.

## [0.12.7] - 2026-09-26 · *print a chart in colour, or leave the plate off in mono*

### Added

- **`Print Ink`** — a fifth hardcopy row on all seven charts: **Colour** (the default: what you see is what
  prints) or **Mono**, which leaves the **plot background** off the page. That plate is the one thing on a
  chart that can turn into a solid block of ink on paper; the traces keep their own colours and a mono
  printer maps them to greys itself. Both halves of the background go — the `PlotBackOpacity` plate *and* a
  `PlotBackBrush` the form may have set — and **both are put back when the job ends**, from a `using`, so a
  failed print cannot leave the form changed. The row honours the same guarantee as `Print Legend`: what is
  on screen is never touched.
- **`ChartInkMode`** / **`ChartPrintOptions.Ink`**. The scoped-override machinery is general now
  (**`ApplyPrintTweaks`** / **`WithPrintTweaksAsync`** / **`PrintTweaksRestore`**) instead of legend-only,
  so the PNG export and both PDF paths honour the row as well.

### Changed

- **A mono print renders the page itself and prints that file**, exactly like a legend override — and for
  the same reason: a printer backend must never be handed the **live** chart in a changed state.

### Notes

- **Measured, not assumed.** The T4 harness sets a plot background of a colour the chart draws nowhere else
  (`#123456`), exports the same page in colour and in mono, and counts it: **71,033 px (89 % of the page) in
  colour, 38 in mono**. Those 38 are a sparse scatter across the whole chart — anti-aliased gridlines and
  traces that happen to mix into a similar colour — so the assertion is stated as **coverage** (> 50 % vs
  < 0.5 %) rather than equality, with the measurement written down beside it. The harness also asserts the
  brush identity and the opacity are back to what the form had.
- The drag rescue's log now names the event that completed it (*"from a mouseup"* or *"from a mousemove"*).
  Both were already handled; this says which one a given platform actually sends.
- **Artefact note.** The `0.12.7` `.vsix` is **not** the file to upload: it was packaged while a stray probe
  file (`Consumer.cs`) sat in the repository root, and it rode into the package. The file is gone and
  `0.12.8` is the clean build (121 files) — `0.12.7`'s code is all in it.

## [0.12.6] - 2026-09-26 · *the drag is finished from the mouse, because the platform never delivers it*

### Fixed — the toolbox drag on a VS Code running native Wayland

- **Nothing in the document can see the drag, so the release is read off the mouse.** The `0.12.5` probe
  answered it on the reporting machine: after *"armTool arrived (drag)"* **not one drag event reached the
  webview** — not even `dragenter` — which means Electron starts a native drag and never hands it to the
  webview's renderer. That is why the drop-free fallback (`0.12.4`, which needs a stream of `dragover`) could
  not help either. What *can* be seen is the mouse: while a native drag is in flight Chromium sends the
  webview **no mouse events at all**, which makes the **first** mouse event after the drag-arming the one
  that follows the release.
- The 500 ms watchdog — still only for a drag arm that saw *no* drag event at all — now arms a **release
  rescue** instead of giving up: the first `mousemove`/`mouseup` after it, **if it lands on the canvas**,
  places the armed control there, which is where the user let go. A movement outside the canvas places
  nothing and leaves the tool armed for a click, and only the first movement counts (later ones are ordinary
  hovers). Platforms that *do* deliver drags never take this path, so X11, macOS and Windows are unchanged.
- The status line offers both finishes — *"Release on the canvas to place a Button, or click it (Esc
  cancels)."* — and every step is logged, so **View → Output → "Avalonia Designer"** now reads as one story:
  the arm, the fact that no drag event arrived, and then either *"the release was read off the mouse (x,y) —
  placing Button there"* or *"the first mouse event after the release was outside the canvas"*.

### Notes

- Suite **8,571 passed / 0 failed**. Version `0.12.6` with all 16 bundled stamps. The user confirmed on the
  machine that could never drag before: *"The workaround works."*

## [0.12.5] - 2026-09-26 · *log every drag event, and keep the tool usable when none arrives*

### Fixed — the drag still could not be told apart from the drag that never came

- **The probe is now arm-independent.** `0.12.4`'s extra log line was gated on the arm arriving, so a report
  of *"armTool posted"* and nothing else could not say *which* half was missing: an arm that never reached
  the webview, or a drag that never reached the webview. The webview now logs **every** drag event
  **unconditionally** on the document (capture), once per kind per drag, with `dataTransfer.types` and
  whether anything is armed — `dragenter`, `dragover`, `dragleave`, `drop`. One drag now tells the whole
  story, and dragging a **file** from the file manager onto the canvas becomes a control experiment: if even
  that logs no `dragover`, then no drag reaches a webview on that machine at all, which is a platform fact
  rather than a bug here.
- **The arm announces its own arrival** (*"armTool arrived (drag) — Button; waiting for …"*), so *"the arm
  never got here"* and *"the drag never got here"* can never be confused again.
- **A 500 ms watchdog** recognises the platform case: a drag arm that sees no drag event at all. It says so
  in the log and puts the tool back on the path that **does** work — the tool stays armed and the status
  switches to *"Click the canvas to place a TextBlock"* — so a drag still leads somewhere on a machine that
  cannot deliver it: drag, then click. **Esc** cancels the arm and both timers, so a cancelled drag leaves
  nothing behind.

## [0.12.4] - 2026-09-26 · *make the toolbox drag diagnosable, and finish a drop the platform swallows*

### Added

- **`armToolInActiveDesigner(tag, 'click' | 'drag')` now says what it did.** It logs whether a designer was
  known and whether `postMessage` really delivered — it used to return **silently** when no tab was *active*
  (`lastActivePanel` is only set for an active tab), so it now falls back to **any open designer panel**
  instead of arming nothing.
- **The webview logs into the same channel** (the new `webviewLog` message) and says what it sees:
  *"dragover is arriving while a toolbox tool is armed"*, *"the drop event arrived — the native path works
  on this machine"*, or *"the drop event never arrived — placing <tag> at the last hovered point (native drop
  lost; Electron/Wayland)"*.

### Fixed — a drag that is swallowed can still be completed

- **A drag-armed tool can complete without a `drop` event.** Chromium sends `dragover` continuously while
  the drag hovers, so the **end** of the drag is detected from that stream going quiet (180 ms) and the
  control is placed at the last hovered point. Gated to **drag** arms only (a click-armed tool still waits
  for a click), cancelled by a real drop (so it can never place twice) and by leaving the canvas (so a drag
  dragged away places nothing).
- The status line tells the two apart at a glance — *"Release the drag on the canvas to place a Button"*
  (the arm arrived) versus the click wording — and it **takes the armed hint back** when nothing is armed
  instead of leaving it on screen.

### Notes

- **`tests/t2-logic/toolboxDrag.test.js` is new (16)** and pins the wiring — `handleDrag` calls
  `armDesignerTool`, `extension.ts` chains it with `'drag'`, the postMessage carries `from`, and the
  fallback keeps its gates — because nothing covered the **extension** half of this feature. T3 gained 9
  assertions for the drag wording and the drop-free completion, including that a click-armed tool is never
  placed by it.
- Suite **8,556 passed / 0 failed**. Version `0.12.4` with all 16 bundled stamps.

## [0.12.3] - 2026-09-26 · *toolbox drag works, alignment behind Show advanced, and a first-build fix*

### Fixed — the toolbox drag never had a tag to place

- **VS Code does not bridge a TreeView's drag MIME types into a webview**, so the canvas's `drop` event
  always saw an **empty** `dataTransfer` and bailed to *"Drag a control from the Toolbox view."* — the tag
  now travels on the **`armTool` message** fired at drag-start, the channel click-to-place already uses:
  `ToolboxProvider.handleDrag` calls `armDesignerTool`, `extension.ts` wires it to
  `armToolInActiveDesigner`, and the webview's `drop` handler reads the armed tag **first**, falling back to
  `dataTransfer` for other (future) drop sources. It works on Linux too, where the native bridge is
  flakiest — and it explains the old *"drag is unreliable on Linux/Xorg"* note: the tag was never bridged
  on **any** platform.

### Changed

- **`H. Align` and `V. Align` are *advanced* rows** (hidden until **Show advanced** is ticked), on every
  control — both are `COMMON_PROPS` rows — and on the multi-selection panel, which derives from the same
  `propertyDefsFor`. The rows stay in the catalog and keep their *Layout & size* section; the tests pin the
  flag and the webview's filter.

### Fixed — a brand-new C# project did not build

- **`CS0103: The name 'GrumpyPrint' does not exist in the current context`, on the first build of a newly
  created project.** `projectCreator.ts` never passed the bundled `GrumpyPrint` helper, so a new project
  received a `GrumpyCharts.cs` that calls `GrumpyPrint` and **no helper**. Both files are passed now, and a
  test asserts the creator passes **every** file in `resources/` — the scaffold treats an option as
  optional, which is why nothing else had caught it.

### Notes

- Suite **8,531 passed / 0 failed** (from 8,495). Version `0.12.3` with all 16 bundled stamps.

## [0.12.2] - 2026-09-25 · *printing on Linux, and the legend on the paper*

### Added

- **Charts print on a Linux desktop.** `Avae.Printables` publishes a real printing service only for the
  platforms it targets — Windows (WinRT), macOS, GTK-Linux, the browser, Android, iOS — plus an **API-only
  fallback** for everything else. A plain Linux desktop build restores that fallback, where
  `AppBuilder.UsePrintables()` compiles, runs and registers *nothing*: `Printable.Default` stays null, so
  **Print…** stayed disabled on the very machine the chart was drawn on. The new bundled helper
  **`GrumpyPrint`** (`resources/GrumpyPrint.cs` / `.vb`, copied into a project beside its chart) fills that
  gap and only that gap: the page is rendered to a temporary PDF — the same vector export the chart already
  writes — and handed to **CUPS** (`lp [-d printer] -t "job title" file`). Nothing is registered over a real
  service, so Windows and macOS keep the platform's own dialog.
- **`Print Legend`** — a fourth hardcopy row on all seven charts: *As drawn* (the default: what you see is
  what prints), **Off** (the graph alone, with the room the legend took given back to the plot — the usual
  hardcopy) and **On** (draw it on the page even while it is hidden on screen). It steers the **output** only:
  the chart's own `ShowLegend` is set and put back around the job, so the screen never changes.
- **`ChartLegendMode`** / **`ChartPrintOptions.Legend`** and **`GrumpyPrint.PrintFileAsync(file, title,
  printer)`** for an application that drives the exports itself.

### Changed

- **`CanPrint` no longer means "Avae.Printables has a service"** but "this machine can put a page on paper":
  the platform service *or* the CUPS helper. Its tooltip names both routes, and `PrintAsync` branches on it —
  a legend override renders the page itself and prints that **file**, because a printer backend must never be
  handed the live chart in a changed state.
- **The staleness marker moved `ExportPdfAsync` → `GrumpyPrint`**, so a project holding a `0.12.1` chart file
  is refreshed — and **`GrumpyPrint.cs` / `.vb` is copied in together with the chart**, since one without the
  other does not compile. A project that has neither and places a chart gets both.
- **`AllowUnsafeBlocks`-free, package-free:** the helper adds no dependency at all — `System.Diagnostics` for
  the process and `AvaloniaUI.PrintToPDF`, which the printing project already references.

## [0.12.1] - 2026-09-25 · *the print path, made honest*

A follow-up to `0.12.0`, written after reading the hardcopy code back. Every point was about the edges
rather than the middle: a menu entry that could silently do nothing, failures that vanished without a
trace, and two printer packages whose page geometry was never used.

### Added

- **`Print Paper`, `Print Margin` and `Print on White`** — real rows in the Properties panel of all seven
  charts. *As drawn* (the default, and the behaviour `0.12.0` had) keeps the chart's own size; **A4** and
  **US Letter** put it on paper with a margin in points, and *Print on White* paints the page before the
  chart arrives, for a dark plot background. The page is composed as a real page visual — the chart is
  painted through a `VisualBrush`, so the PDF stays **vector** — and the rows are declared *outside*
  `PRINT_SUPPORT`, so a form that sets them still loads in the headless previewer.
- **`Save as picture…`** (PNG) joins the chart's right-click menu, and **Ctrl+P** prints — or, on a build
  with no printing service, exports a PDF, because a key that can never do anything is worse than one that
  degrades to the path that always works.
- **`ExportPdfAsync(path, options)`**, **`ExportPdfAsync(stream, options)`** and **`ExportPng(path, scale)`**:
  the same output with no file picker, so an application — or a test — can drive it. A picked file with no
  local path is written through its stream instead of being skipped, and when a platform can print a *file*
  but not a *Visual* the chart renders a temporary PDF and hands that over.
- **`PrintFailed`** (an event) plus a `Trace` line, and **`IsPrinting`**: the chart still never throws into
  the caller, but an app can now see why nothing came out.
- The PDF/PNG folder is remembered separately from the spreadsheet folder — printing a chart no longer moves
  the workbook picker.
- **The designer notices a project that cannot print** (one generated before `0.12.0`) and offers to add the
  two packages and the symbol to its project file — idempotent, and byte-identical on a project the designer
  generated itself. `Program`'s `.UsePrintables()` stays the user's to add, which the disabled menu entry
  then explains; USER_MANUAL §19.14 has the same two lines for anyone doing it by hand.

### Fixed

- **`Print…` no longer offers a click that does nothing.** With no printing service registered —
  `UsePrintables()` never called, or a platform without one — the entry is **disabled**, with the reason in
  its tooltip. `CanPrint` reads `Printable.Default`, PDF and PNG never need it.
- **A page that actually renders.** The first cut laid the A4 wrapper out on the PNG path only, so the PDF
  path threw `ArgumentException: Invalid create info - no Canvas provided` — an un-laid-out visual draws
  nothing, and the backend runs no layout pass of its own. The layout now happens once, in the shared helper
  every export uses.
- A null or whitespace path, a cancelled picker, an unwritable folder and a missing service are reported
  instead of swallowed; a second menu click while one export is in flight is ignored rather than opening a
  second dialog.

### Notes

- **Verified by measurement, not by inspection.** `tests/t4-runtime/printExport.test.js` (37) builds a
  headless app with both packages and then reads its own output back: `pdfinfo` reports **595 × 842 pt** for
  A4 and the chart's own size for the default; the A4 PNG is 595 × 842 px with **20 px of clean paper** in
  the margin (so the margin and the white page are real, not assumed); the series colour is present in the
  PNG *and* in the rasterised PDF; `PrintFailed` fires exactly once for a bad path; a detached chart refuses
  quietly; and the guard is released afterwards.
- `tests/t2-logic/printSupport.test.js` (165) holds the source contract instead: the same members in both
  twins, the gating split, the VB traps (**no `Await` inside a `Catch`** — BC36943, where C# is happy — and no
  `#Disable Warning` left in the hardcopy handlers), and `addPrintSupport` proven to be a no-op on freshly
  generated projects.
- The staleness marker moved `printItem` → **`ExportPdfAsync`**, so a project holding `0.12.0`'s chart file
  refreshes on the next save (and then gets the offer above).
- One old guard was strengthened on the way: the `chartFill` test checked that the Esc branch precedes the
  cursor keys inside a 900-character window, which the new Ctrl+P branch pushed past — both markers came back
  as `-1`, so the assertion had quietly become `-1 < -1`. It now requires both to be found.
- Suite **8,346 passed / 0 failed** (from 8,121); the host, all 10 generated projects and the VB matrix build
  0 errors / 0 warnings, with and without `PRINT_SUPPORT`.

## [0.12.0] - 2026-09-25 · *hardcopy output for the charting controls*

A **minor** bump rather than the `0.11.20` the work was built under: printing is a new user-facing capability,
and **nothing between `0.11.1` and `0.11.19` reached the Marketplace** — the stable listing still carries
`0.11.0` (read back from the gallery API on 2026-09-25; the earlier entries here and in `PUBLISHING.md`
assumed `0.11.15` was live) — so this single upload spans the whole chart line plus the print work, and the
line moves up with the feature instead of carrying another number that would only ever be built.

Avalonia ships no print API, so the chart right-click menu now offers two entries — on every chart type,
including the cursor-less pie and bar — backed by the two community libraries instead:

**Print…** — the platform's native print dialog (Avae.Printables 3.0.7), and **Print to PDF…** — a Skia-backed
PDF export (AvaloniaUI.PrintToPDF 0.6.0), which needs no dialog and so works on every platform. Both are
guarded inside their methods (a chart with no `TopLevel`, or a build in which no printing service was
registered with `UsePrintables()`, does nothing) and each swallows its own exceptions, so a menu click can
never take a form down. The designer preview does not even *have* the entries: the headless `PreviewerHost`
links the same file without `PRINT_SUPPORT`, so the canvas stays printer-free.

### Added

- `Print…` and `Print to PDF…` menu items on `ChartBase.ShowChartMenu`, placed before the `!SupportsCursors`
  early return so the pie and the bar still expose them; wired to async `PrintAsync` / `PrintToPdfAsync`
  methods. The `printItem` literal is the new staleness marker, so an existing project's bundled copy of
  `GrumpyCharts.{cs,vb}` refreshes on the next save.
- The whole feature is compiled in behind `PRINT_SUPPORT` (`#if` in C#, `#If PRINT_SUPPORT Then` in the VB
  twin). The headless `PreviewerHost` — and the headless fill harness — link the *same* file with no printer
  packages, so they build untouched.
- Generated projects are wired for it: they reference `Avae.Printables 3.0.7` + `AvaloniaUI.PrintToPDF 0.6.0`,
  define `PRINT_SUPPORT`, and call `AppBuilder.UsePrintables()` from `Program` (`projectScaffold.ts`, both
  languages). Projects generated before this release opt in by hand — add the two packages plus
  `PRINT_SUPPORT` to the project file and `.UsePrintables()` to `Program`; without them the bundled
  `GrumpyCharts.{cs,vb}` compile unchanged and simply have no print entries.
- The README's at-a-glance collage (`DesignerDemo.png`): the form designer, step-by-step debugging, the
  control editors, the DataSet designer and the three chart families in one picture, right below the
  *"Formerly Avalonia Designer for VS Code"* notice. It is excluded from the `.vsix` — it is ~900 KB, four
  times the rest of the package, and vsce rewrites a relative README image link to the repository, so the
  gallery serves it from GitHub either way — and `packaging.test.js` pins both halves (excluded *and*
  linked).
- The chart help panel (`controlInfo.ts`) tells the user where the two entries appear: in the app they run,
  not on the headless design canvas.

### Fixed

- **`PRINT_SUPPORT` really is defined for VB now — it never was.** The first VB wiring set it in a
  `BeforeTargets="VbcCompile"` target, and the SDK assigns `FinalDefineConstants` *after* that target runs,
  so the value was overwritten every time: `dotnet build` stayed green while `#If PRINT_SUPPORT Then` was
  compiled out, i.e. every VB project had no Print entries and nothing said so. It is now appended to
  `DefineConstants` as a **comma** token — vbc's `/define:` switch is comma-separated (the C# semicolon form
  is rejected with `BC31030`), and the SDK builds `FinalDefineConstants` from it, so the symbol survives:
  `FinalDefineConstants = CONFIG="Debug",DEBUG=-1,TRACE=-1,PLATFORM="AnyCPU",,PRINT_SUPPORT,_MyType="Empty"`.
- The class of failure, not just the instance: `tests/t0-build/printsupport.test.js` now generates a C# and a
  VB project, drops in a probe that *references* `PrintAsync`/`PrintToPdfAsync`, and builds it. A text check
  on the project file would have passed the broken wiring; a probe cannot.

### Notes

- Verified: the headless host builds (0 errors / 0 warnings, no print packages); the t0-build matrix of all
  10 generated projects (C#/VB × 5 templates) builds with 0 errors / 0 warnings — now including the VB print
  block, which the fixed symbol finally compiles — and the full suite is **8,121 passed / 0 failed**.
- **What that verification did *not* prove, and why the bug got as far as it did:** `GrumpyCharts.{cs,vb}`
  "compiling with `PRINT_SUPPORT` defined, 0 errors" was true and worthless for VB, because a file whose
  conditional block never gets the symbol compiles perfectly. The check that means something is a build that
  *references* the gated members — `tests/t0-build/printsupport.test.js` now does exactly that, in both
  languages, so a symbol that fails to reach the compiler fails the suite instead of a user's build.
- The PDF path was measured, not assumed: a headless Skia app exported a 265,672-byte PDF (1 page, vector
  ops), and rasterising it at 150 dpi gave a 1250 × 625 page carrying **2,058 px of the series colour** — the
  chart really is in the file. Page size is the control's size, so printing is worth one real-world look.

## [0.11.19] - 2026-09-24 · *the previewer builds for one platform, not twenty-six*

A housekeeping release, asked for after a question about the extension's size: *"Would it be feasable to
extract the charting control from the designer extension and make it a plugin for the extension? The reason
is that this extension byte size is getting very large."* The answer was no — the charts are 793 KB of a
**583 MB** install — and the measurement found what really was large.

### Fixed — every installed copy carried 578 MB of build output it could never use

- `host/PreviewerHost.csproj` had **no `RuntimeIdentifier`**, so the restore brought in SkiaSharp's natives —
  and their debug symbols — for **every platform the package serves**: `host/bin/` reached **578 MB**
  (569 MB of `runtimes/**`, 304 MB of it `.pdb` — including a 80 MB `libSkiaSharp.pdb` per Windows RID).
  The previewer only ever runs on the machine that built it, and the extension builds it *there* the first
  time a form is previewed — so the waste landed in the extension's own folder: **583 MB per installed copy,
  and six copies had accumulated 3.5 GB.**
- The build now asks for **one** platform (`NETCoreSdkPortableRuntimeIdentifier` — `linux-x64`, `win-x64`,
  `osx-arm64`; the distro RID as a fallback, and nothing set when neither is known, which is the old but
  working portable build), stays framework-dependent (`SelfContained=false`, so it still runs against the
  machine's .NET 8 exactly as before), keeps its output in the folder the extension launches from
  (`AppendRuntimeIdentifierToOutputPath=false` — without it the output moves to `…/net8.0/<rid>/` and the
  launcher's spawn fails, which is how this was found), and drops the natives' debug symbols after the build.
- **Measured:** `host/bin` 578 MB → **24 MB**; a `-r win-x64` cross-build produces the same 24 MB with
  `PreviewerHost.exe`, `libSkiaSharp.dll`, `libHarfBuzzSharp.dll` and `e_sqlite3.dll` — a Windows user gets
  the Windows natives and the `.exe` the extension already looks for, and the managed code is untouched.
- **The old copies can also go.** An installed extension keeps every version that was ever installed from a
  VSIX; deleting the superseded folders on this machine took the extension's footprint from **3.5 GB to
  29 MB** without touching a single feature (verified by rendering a chart through the pruned host).

### Notes

- New pins in `tests/t2-logic/packaging.test.js` keep the four properties above and the natives' symbol trim
  in place, and pin the launch path from both sides — the extension joins `host/bin/<cfg>/<tfm>/<exe>` and
  the test helper spawns the same folder — so the "RID moved the output" failure cannot come back.
- Suite **8,100 passed / 0 failed**; the T1 render layer (402) drives the real trimmed host through Skia,
  HarfBuzz and SQLite, so the saving is proven not to have cost anything.
- `host/ModelHost` — the *optional* bundled local-AI server — still restores LLamaSharp's natives for every
  platform and is deliberately **not** trimmed here; the same change applies when that feature is next looked
  at, and it is the one place where hundreds of megabytes can still appear.
- This is the release to upload: the Marketplace listing carries `0.11.15`, and this file brings it up to date
  with everything in `0.11.16` → `0.11.19` (see `PUBLISHING.md`).

## [0.11.18] - 2026-09-24 · *the height ramp follows the height, and the surface gets its own controls*

Two field reports from one afternoon on the 3D surface, and the batch of requests that came with them.

### Fixed — the temperature ramp mixed the height with the DEPTH (reported 2026-09-24)

- *"the color gradient (temperature) should only apply to the y-axes. Currently it seems that the z-slices
  also apply the gradient starting at slice 1 to x-max"*. A flat sheet proved it: the per-band gradient was
  laid along the PROJECTED height axis, and a point of a band stands at its own depth, so the same value
  came out at a different colour depending on how far back its band was — a flat plate spanned **0.66…0.97**
  of the ramp at elevation 31 and **0.04…1.00** at elevation 60.
- A band is now **CUT into `levels` horizontal slices** (`CutToLevels`) and every level is filled with its
  own blend, so the colour is a function of the **value alone**: the same flat plate is one colour at every
  angle (**0.40…0.40** at both elevations and all three azimuths tested), and a plate whose values are 5,
  25 and 45 of a 0…50 scale lands on **0.11 / 0.50 / 0.89**. `Heat Min`/`Heat Max` still pin that scale (a
  40…50 pin puts 45 at 0.54); a `Min Y`/`Max Y` window no longer touches the colours at all.
- **A triangle exactly at the ramp's maximum was never filled**, which is what the second report was about:
  *"There is something wrong with the spreadsheet data (the tops of the corrugated sheet are open)."* The
  first level of the cut was clamped at the low end only, so a triangle at the top of the scale asked for
  band `levels` while the loop stopped at `levels - 1`: the crest of a sheet whose values reach the scale's
  ceiling was a line of background through the picture. Measured on a flat sheet at 25 of a 0…25 scale:
  **0** sheet pixels before, **9,482** after. `var top = levels - 1e-9` (VB: `levels - 0.000000001`) pins it.
- The level cut is also **cheaper** than the gradient it replaces: 94–108 ms against 167 ms for a 100 × 100
  sheet, and 47–52 ms against 105 ms for four 2,000-point slices.

### Fixed — the colour palette opened half off the screen (reported 2026-09-24)

- *"When opening a color pallette (not the drop down colour picker) to pick a color, half the the palete
  renders off-screen to the right."* Two causes: the popup was anchored at its trigger's top-left corner
  (which, for a click, is the mouse) with a clamp whose 8px floor won whenever the window was narrower than
  the list, and the stylesheet's `min-width` outranked the injected `max-width`. The palette now caps its own
  width to the window and flips to its trigger's **right** edge when it would still overflow.
- Measured: a 150px window → 8…142, 200px → 8…168, and at 320, 578 and 1200px the palette's right edge sits
  exactly on the trigger's, with nothing off-screen.

### Added — the two axes can be sized without touching their ranges (asked for 2026-09-24)

- *"please introduce a Zoom function for the X and Y axes. Zoom does not mean a range change, but an actual
  zooming of the X/Y axes size keeping the range settings unchanged."* **`ZoomX` / `ZoomY`** (Properties:
  *X Axis Zoom %* / *Y Axis Zoom %*) set how big an axis is **drawn**, in percent of the fitted size. It is
  a zoom, not a window: `Min X`/`Max X`/`Min Y`/`Max Y` and every tick label are untouched — the picture is
  magnified about the **middle** of the frame instead. 100 % is the fitted size and therefore the top of the
  scale: above it the plot box can only clip what it is asked to draw. Measured, `ZoomX="50" ZoomY="50"`
  halves both the width and the height of the sheet, and `ZoomX="150"` renders identical to the fitted chart.
- **Two more sliders in the surface's legend**, next to the X and Z window sliders: one for each axis' zoom,
  each in a colour no slice of the palette uses (`#00E5FF`, `#FF00AA` — so a series can never be mistaken
  for a slider), each carrying **one** handle (a window has two ends to drag, a size has one) and each
  naming its percent: *X zoom 100 %*.
- **The four sliders stand closer together**, as asked for as soon as the first four were on screen: a
  docked column is sized by the handle it has to clear rather than by a whole row — **26px instead of 34px**
  — and the row pitch went 20 → 16px. Measured handle centres 18.4 / 44.5 / 70.5 / 96.5 → gaps of ~26px, and
  the bar 136 → 112px of the frame.

### Added — pointing a 3D chart at a spreadsheet loads the WHOLE dataset (reported 2026-09-24)

- *"It seems that the Series editor has lost its feature to load all Z-series automatically when pointing
  the chart at a spreadsheet file. When selecting a spreadsheet file for the surface 3d plot the full
  dataset should be loaded."* A surface reads one spreadsheet **column per slice**, and a slice is one
  `<charts:XYSeries/>` child — so the children ARE the dataset. The reporting form carried 55 of the
  spreadsheet's 100 columns and drew **Z 0…300** where the page holds **Z 0…500** (rendering the two side by
  side, 16,665 of 109,200 pixels differ).
- Choosing a page in the **Data Selector** now reads that page's used range (a new host verb, `sheetShape`:
  the last row that holds a value, and the last column as a letter) and writes one bare series per data
  column after the chart's own X column. The **waterfall** gets the same treatment, because its sweeps are
  one column each as well.
- A series list the form already carries is only replaced while **every** entry is bare — the moment one
  carries a property, the list is the author's and the workbook is not even read for it.
- Loading the whole sheet also clears a stale **slice window** (`Min Z`/`Max Z`): a form left carrying
  `MaxZ="9"` drew two slices of a hundred, which looks exactly like a chart that never got the data. The
  **width** window (`MinX`/`MaxX`) is deliberately left alone — that is a range a reader can see in the
  picture, not a count of slices.

### Added — Legend on/off in the chart's own right-click menu (asked for 2026-09-24)

- *"Add Legend ON/OFF to the right-click menu."* The chart menu — the one that already carries *Choose
  spreadsheet…* and *Fill the container* — has a **Legend** entry with the tick in its own label (menu item
  ticks need Avalonia 11.1; the bundled control still builds on 11.0). Clicking it flips `ShowLegend` on the
  **running** chart and redraws; like every other toggle in that menu it never writes back to the form, and
  it is added before the no-cursors early return, so the bar and the pie have it too.

### Added — a stale project copy can no longer hide (reported 2026-09-24)

- *"the new sliders is rendering in the designer preview but not during runtime"* and *"the right click
  legend on/off not available in the right click menu in runtime"* — both from a running app whose own
  `GrumpyCharts.cs` was the copy from **before** this release. The designer preview draws the **host's** copy
  (always current) while the app compiles the **project's**, so the two can disagree; what made this one
  invisible is that the staleness check looked for a **marker token**, and this release's changes — two more
  sliders, a packed layout, an extra menu entry — are changes *inside* an existing type that add no new name
  to look for. The copy carried the previous marker happily.
- **Every bundled file now carries the release it came from** in its header
  (`// BUNDLED-COPY: 0.11.18`, `' BUNDLED-COPY: …` in the VB twins), and "older" is decided by
  **comparing the file's contents with the copy the extension ships**. That catches a drawing-only change,
  which no marker ever could, and the version stamp makes it obvious which release a project is on. A
  release that forgets to re-stamp a resource fails the suite.
- **`avaloniaDesigner.bundled.autoUpdate`** (off by default) makes the refresh automatic instead of asking
  with the *Update now* button; the message that asks now says where to find it. Only files that are
  provably the extension's own boilerplate are ever touched — a hand-written helper is never overwritten.

### Notes

- Suite **8,092 passed / 0 failed**; the host, a generated C# project and the VB matrix all build
  0 warnings / 0 errors. New tests pin the ramp's independence from the view, the missing crest, the
  whole-sheet rule (including the waterfall and the cleared slice window), the legend's four sliders —
  their colours, their handle counts and the distance between them — both ends of the zoom scale, the
  stamp every resource carries, and the content rule that replaces "look for a token".
- The **sample workbook** used for the manual checks was scaled to a 0…20 height at one point and restored
  to its original 0…50 afterwards; the file in the repository is the 0…50 one the charts are read from.
- **`0.11.16` and `0.11.17` were development numbers** — packaged, never released. `0.11.18` is the version
  the tag, the release title and the listing carry.

## [0.11.15] - 2026-09-24 · *the width window is a cut, not a squeeze*

A follow-up to `0.11.14`, from a report made while dragging the chart in a **running app**: *"the 3D surface
plot renders two 'panels' at either end (in the X plane). These panels are perpendicular to the x-plane and
stays stationary while changing the range of the x-axes."* — and, the detail that pinned it down, *"These
panels are not shown during design time"* and *"only appears when adjusting the x-range during run time"*.

### Fixed — dragging the X window grew a false panel at each end of the sheet (reported 2026-09-24)

- The width window **clamped** instead of cutting: `SurfaceWorld.UnitX` maps a value onto `0…1` and clamps, so
a sample **outside** the window was drawn *at* the window's edge. Dragging the X slider therefore piled every
off-window sample of every slice onto that edge, and the band fill between two neighbouring slices became a
flat **slab** there — two panels standing perpendicular to the sheet, one at each end, **pinned to the window
edges** and therefore apparently stationary while the window moved. It is real geometry, recomputed every
frame, so it was never a stale-pixel artefact.
- **Why the designer never showed them**: a saved form has no `MinX`/`MaxX`, so the window *is* the data's own
range and there is nothing outside it to clamp. The preview draws the saved values; the app grew the panels
the moment a slider moved them inwards. (A *saved* narrow window shows them in the designer too — which is
how it was reproduced.)
- **The samples are now CUT to the window** (`CutToWindow`): the samples inside it, plus one interpolated point
per crossing of the window's own edges, so the sheet still ends exactly ON the edge instead of losing a sample
step there. A segment that jumps clean over a narrow window contributes both edges. `UnitX`'s clamp stays only
as a safety net for the boundary sample and for a hand-set axis range.
- **Measured**: at `MinX="100" MaxX="120"` on the reporting form the panels are gone; with **no** window the
render is **pixel-identical to before the fix** (0 of 128,800 pixels differ), so nothing else about the picture
moved. The suite's new regression pins the rule directly — the same chart, the same window, over two datasets
that differ **only outside** the window, must come out **pixel-identical**, with the same pair and **no** window
as the control that proves the measurement can fail.

### Notes

- **The bundled-file marker moved again, to `CutToWindow`.** This is a *drawing* change in an existing type —
no property of any form changed — which is exactly the case an old copy cannot show, so a project still holding
the `0.11.14` chart is now offered **Update now** on open or save. (Same lesson as `BandTriangle` in
`0.11.14`: the refresh only knows what the marker tells it.)
- **The height (Y) window keeps its clamp**, deliberately: there, clamping means values above or below the
window flatten onto its ceiling or floor, which a test pins as the documented behaviour. A *width* clamp has
no such reading — it can only pile data into a wall.
- Suite **7,941 passed / 0 failed** (the surface layer 76, the source contracts 185); the host, a generated C#
project and the VB matrix all build 0 warnings / 0 errors.

## [0.11.14] - 2026-09-24 · *the surface chart 3D, and the fill that showed the plot's backcolour through it*

The chart set gains a **seventh control** — a projected **3D surface**, a corrugated sheet read from a
family of profiles — and this release carries the fix for the defect the user hit the moment a form used it
in a **running app**: *"the visible surfaces of the plot renders correctly in the Designer at design time,
however when running the app overlapping surfaces are render fully transparent showing the chart backcolour
instead of a solid surface."* The designer was right and the app was wrong, and the reason was not the draw
order they suspected: the app was compiling an **older copy of the bundled chart file**, and that copy filled
a band as one closed figure, which cannot fill a fold.

### Added — the surface chart 3D (`charts:GrumpySurfacePlot`, 2026-09-23/24)

- **One spreadsheet column per SLICE.** Every series is one slice along the sheet's length: it reads the
  **same shared X column** (the positions across the width) and its own Y column (that slice's height at each
  of them), and neighbouring slices are joined, so the picture *is* the surface rather than a family of
  traces. The **Series** editor lists the slices, each named by its Title and coloured by its own colour.
- **Where a slice stands comes from the spreadsheet**: `Z Row` names the row holding one Z value per slice
  (one row of numbers like 0, 5, 10 … along the length); where that cell is not a number the slices are
  numbered from **Z Start** in steps of **Z Step** instead. `SampleSets="1,2,3; 3,2,1"` writes a chart by
  hand, without a workbook at all — the same escape hatch the waterfall has.
- **Style** picks how the sheet is drawn: **Grid mesh** (the quads' edges only, so you see through it),
  **Grid mesh + solid** (the mesh over a filled surface — the default) or **Solid**.
- **Colour By** picks what the colour means: **Sampleset** (one colour per slice) or **Temperature**, a ramp
  by **height** from **Low Colour** at the valleys to **High Colour** on the ridges — with **Heat Min** /
  **Heat Max** pinning that range when several charts are read against one scale. **Solid Opacity** makes the
  filled sheet see-through; **Mesh Colour** / **Mesh Thickness** shape the mesh lines themselves.
- **The view is real**: **Elevation** (how far above the floor you look, default 30), **Azimuth**,
  **Z Spacing** (how far apart the slices stand), **Zoom**, and drag-to-turn with the mouse.
- **The range window is the surface's legend.** The bar carries two sliders — **X** (the width the sheet
  spans) and **Z** (which slices are drawn, counted in slices: *"Z 3…4 of 6"*) — and the view is **always
  re-fitted to the window**, so a selection *zooms* into the sheet instead of shrinking it. The sliders span
  the **data's own** range, reported by the control (`DataMinX/MaxX/Y/Z`), so a handle can never run off what
  the sheet actually holds; a window end that falls between slices snaps to the nearer slice, so a drag only
  ever adds or drops whole slices.
- **A block under the sheet, when it is asked for**: **Show Base** (off by default — it changes the picture)
  fills the space beneath the sheet down to the floor with **Base Colour**, drawn whatever the sheet's own
  style is (the mesh style has no fill of its own to stand it on).
- **No cursors and no Axis editor**: there is no cartesian frame to hang them on — the projected cube has
  three axes of its own, and the mesh is what a reader measures against.
- Toolbox entry (*Charts* group), Properties rows, plain-language help panel, the designer preview, the
  `.xlsx` reader with its page chooser and `LiveUpdate` reload, and **both twins** — the C# and the VB
  control compile with `Option Strict On`, exactly like the other six.

### Fixed — a folded band filled itself as a hole, showing the plot's backcolour (reported 2026-09-24)

- A band was filled as **one closed figure** per unbroken run of samples (the far profile forward, the near
  profile back). Where the projection **folds** that outline crosses itself, and the two loops of a
  self-crossing figure wind in **opposite** directions: under the non-zero winding rule they **sum to zero**,
  so the fill is dropped and the hole is what the chart's own backcolour shows through. At a low `Elevation` a
  corrugated sheet folds in *every* band — each slice's profile collapses into a single screen column — which
  is why the user's form (Elevation 6, Azimuth 28, a red plot backcolour) looked like a set of separate fins
  with red between them while the designer, drawing the same geometry, looked solid.
- The fill is now **one TRIANGLE PAIR per sample pair** (`BandTriangle`, split by the b–d diagonal), and every
  triangle is wound the way the band's first one was. A triangle cannot cross itself, so no fold can cancel
  it, and the triangles a fold makes overlap accumulate winding ±2 instead of subtracting. The 1px pen in the
  band's own brush still covers the seams between them.
- Measured, on the user's own form: the plot's backcolour stopped showing through 4,291px of the sheet. On a
  controlled single band at the same angles, a 24×24 box inside the fold went from **576 of 576 pixels being
  backcolour** to **0 of 576** — and the same box is still backcolour in `GridMesh`, which has no fill, so the
  measurement can fail. Both are asserted in the suite now.
- **The drawing fix alone was not enough, and that is the second half of the bug**: the app compiles the
  project's **own copy** of `GrumpyCharts`, and the staleness check is *"the bundled header is there and the
  newest marker token is not"*. The marker was still `GrumpySurfacePlot` — a token that copy already had —
  so an in-place *drawing* change in an existing type was invisible and no refresh was ever offered. The
  marker moved to **`BandTriangle`**, so opening or saving the form in a project whose chart predates this
  release now offers **Update now**.

### Fixed — one render of a large surface took a second (found while measuring the above, 2026-09-24)

- The band geometry computed a full **O(n²) 2D crossing scan** of the far and near profiles on every band and
  **never used the result** (the fill had moved on to per-figure emission). On the 6 × 2048-point sheet the
  workbook actually holds it cost **~935 ms per render** — measured 27 ms → 966 ms, per render, and the
  designer re-renders on every drag frame. The scan is gone; the same render is **42 ms**.

### Notes

- **`0.11.13` was the development number** of the surface chart and is not released; `0.11.14` is the version
  the tag, the release title and the listing carry.
- **A slice (Z) window really does cut slices** — the test that said otherwise measured *sheet pixels*, and
  the view re-fits to the window, so a two-slice selection **zooms** and draws about as many pixels as six.
  It is now measured as **which slices are drawn** (each band carries its far slice's colour under
  `ColorBy="Sampleset"`), with the legend hidden while the census runs — the legend's own slider tracks are
  amber and light blue, i.e. within tolerance of two slice colours.
- **Housekeeping**: the unused `xlsx` npm dependency (nothing imports it — the chart's workbook reader is
  C# and dependency-free) is gone, which takes the VSIX from 5.29 MB back to ~1.2 MB, and the manifest's
  `repository` URL is a plain `https://` link again (npm had rewritten it to `git+https://…`, which the
  packaging check rejects).
- Suite **7,931 passed / 0 failed**; the host, a generated C# project and the VB matrix all build
  0 warnings / 0 errors.

## [0.11.12] - 2026-09-23 · *a waterfall you can turn: one spreadsheet column per sweep*

The chart set gains a sixth control — a projected **3D waterfall**. It reads one spreadsheet **column per
sampleset** (a sweep, a run, a pass, a temperature) and stands those sets one behind the other, joined by a
mesh: the picture a spectrum waterfall is read for. Two requests drove it, both about the data side of that
picture: *"Now please add some sample data for the Waterfall plot in a new sheet. Lets have 10 series of 2048
points each. The values must range between 0 and 100."* and *"There is no Z Column row in the Series
editor"*.

### Added — the waterfall chart (`charts:GrumpyWaterfallPlot`, 2026-09-22)

- **One column per sampleset.** The **Series** editor lists the sets, one row per sweep, each with its own
  **Z Column** (the column that holds that sweep's values) and its own legend name — a 2048-row capture with
  ten columns is ten sweeps. Just as on the other plots, the columns come from the workbook's own row 1, and
  `SampleSets="1,2,3; 4,5,6"` writes a chart by hand without a workbook at all.
- **Ribbon style** decides how a set is drawn: **Ribbon** (a solid fill under its trace, so a nearer set
  hides the ones behind it — the classic waterfall), **Translucent** (the same fill see-through, so the depth
  reads as layers) or **Lines** (no fill: traces and mesh only). **Ribbon Opacity** sets how solid a
  translucent fill is.
- **Colour mode** decides what the colour means: **Sampleset** (one colour per set, the default), **Value**
  (a heat map by amplitude, so a peak's tip takes the top colour and its foot the bottom one — with
  **Heat Min** / **Heat Max** to fix the range) or **Split** (two colours either side of **Split Value**, so
  a limit is visible in the picture instead of in a legend). The gradient is laid perpendicular to the sample
  axis, so the colour bands sit level with the data however the cube is turned.
- **The mesh** joins the sets at the same sample, which is what turns a row of traces into a surface:
  **Show Connectors**, **Connector Colour**, **Connector Thickness** and **Connector Step** (one connector
  every N drawn samples; 0 spaces them so the mesh stays readable — about forty per trace).
- **The view is a property.** **Elevation** (0 = edge on, 89 = almost straight down), **Azimuth** (45 = the
  usual three-quarter view), **Z Spacing** (how deep the sets stand apart), **Zoom**, and the depth axis'
  own **Z Axis Title** — plus drag-to-turn in the running app, which never writes back to the form. The
  picture is fitted from the cube's own corners, so no angle can push it out of the frame.
- **Its floor, its grid and its three projected axes** are the chart's ordinary axis rows — axis, tick-label
  and name colours included. Line thickness, tick style and the legend work as they do on every other chart.
- **No cursors, deliberately.** There is no cartesian frame to hang them on; the legend lists the samplesets
  with a tick box each, and the mesh is what a reader measures against.
- **The corridors between the sets are left open.** An experiment that filled them (a "Fill The Roof"
  surface and "Block Walls") was built on 2026-09-22 and **removed again before this release**: the ope
  corridors are what the chart is for, a ribbon and its mesh are enough to read each set against the others,
  and the two attributes it added never shipped, so no form can be carrying them.
- **Docs ride along**: `USER_MANUAL` §19.12 (a walkthrough with the sample-data recipe), `CONTROLS.md` (the
  control table and its property list), `README` §7 (the chart set) and `TEST_PLAN.md` (what the two new
  test files measure).

## [0.11.11] - 2026-09-21 · *the chart set grows up: three chart types, a Data Selector — and the page you actually wanted*

Covers `0.11.3` … `0.11.11`, all built and installed on this machine but never published until now. Four
requests in one day: *"When you use a file or folder picker in the chart controls, always persist the
last used folder. The color changes for the axis items only shows at runtime, not designtime."*,
*"Implement your suggested new chart types (1,2,3). Also add the various Editors as you did for the
existing chart types."*, *"Add new pages to the spreadsheet for each of the 3 new graph types"* and
*"Add a 'Data Selector' editor. In this editor the user can select 'Spreadsheet' as the data source and
then a Page selector pops to select the sheet page. Also add a 'DataFiles' option in addition to the
'Spreadsheet' option which contains a file selection picker. For now that option does nothing."*

### Added — three new chart types, with the full editor treatment (2026-09-21)

- **Bar Chart** (`charts:GrumpyBarPlot`) — one bar per category, drawn from its baseline. **Bar Mode**
  picks **Grouped** (one bar per series per category), **Stacked** (each series starts where the previous
  ended, so a category reads as its total) or **Stacked100** (every category fills to 100%, turning the same
  data into a share of the total). **Bar Width** is how much of its slot one bar fills (0.8 leaves a fifth
  as gap) and **Bar Corner Radius** rounds the tops. 0 is always on the Y scale, because a bar is read as a
  length from its baseline.
- **Area Chart** (`charts:GrumpyAreaPlot`) — each series is a filled shape under its line: **Plain** (every
  series fills down to zero, so the last one drawn covers the others), **Stacked**, or **Stacked100**.
  **Area Opacity** (60 by default) is how solid the fill is; the line along the top stays fully opaque, so a
  lighter fill lets the gridlines and the series behind it show through.
- **Pie Chart** (`charts:GrumpyPiePlot`) — one wedge per labelled value, with **Doughnut Hole** (`0` = a
  solid pie), **Start Angle** (0 = 12 o'clock, slices run clockwise), **Slice Gap** and the slice outline's
  colour and thickness. A slice takes a colour from a **10-colour palette** until the form names one.
- **The categories come from the spreadsheet's X column**, so a bar or area chart labels its X axis with
  the sheet's own text ("North", "Feb" …) and falls back to numbers when those cells hold numbers. The
  line and X,Y plots are untouched: they label with numbers, so an existing form cannot change under it.
- **All five charts now share one editor set** — Series, Axis, Legend, Cursors, Background Gradient — plus
  a new **Slices** editor on the pie: one row per wedge (the names the chart draws, with the palette colour
  each one would take), where a row can be re-coloured, pushed out of the pie (**Explode**) or switched
  off. A row is an **override**: an untouched slice writes nothing to the form. The pie lists its SLICES in
  the legend, with a tick box per slice, because `PieSlice` is a `ChartSeries` and each wedge is one plot
  under the hood. A pie has no gridlines, no axes and no cursors, and hides the axis furniture instead of
  the frame it draws in.
- The chart library grew the hooks behind them in the same shape as the existing charts — `BuildPlots` and
  `DrawSeriesLayer` are overridable, `StackBands` computes a stack's base and top per point, `ZeroBaseline`
  keeps a bar chart's scale honest, and `NamedXAxis`/`XPadUnits`/`ZeroToHundred` cover categories, the half
  slot at each end and the 0–100 band. Both twins (`GrumpyCharts.cs` and `.vb`) carry all of it.

### Added — the **Data Selector** editor: the source, the workbook, and which PAGE of it (2026-09-21)

- Every chart now has a **Data Selector** button at the top of the Properties list; the plain *Spreadsheet*
  row moved into it, so the file and the page are chosen in one place.
- **Source** picks **Spreadsheet** (the default) or **Data Files**. Spreadsheet opens the **Workbook** row
  (with a `…` Browse button) and a **Page** dropdown listing the workbook's **own sheet names**, read from
  the file when you pick it. `(first page)` means "the first worksheet" — what every form did before — and a
  page that is not there is refused with the reason printed under the dropdown, never a silent fall-back.
- **`SourceSheet` names the worksheet** the chart reads, and the reader resolves it the way Excel means it:
  `xl/workbook.xml` lists the sheets in tab order, each pointing at a relationship that names the part.
  Part file names carry no meaning (Excel may keep `sheet1.xml` for any tab), so this is the only correct
  lookup — and it is why a named page survives a reorder in the spreadsheet. An empty name keeps reading the
  first part, so forms written before this property existed behave exactly as they did.
- **`SourceKind`** carries the choice and **`DataFile`** carries the data file's path — declared so a form
  can hold the Data Selector's answer and still compile. **Nothing reads `DataFile` yet**: the Data Files
  branch of the dialog names the file, shows what it is for and says so plainly. That is deliberate, and it
  is the hook the CSV reader will land on.
- The workbook's page names come from a new **host command** (`sheets`), so the designer reads the file the
  same way the chart's own reader does — an unreadable workbook answers with its reason instead of an empty
  list. The chart's workbook picker and the Data Selector's data-file picker each remember their own last
  folder, like every other picker in the extension.

### Added — every picker remembers where it was (2026-09-21)

- The chart's own workbook picker (*Choose spreadsheet…*) and the PathPicker-based pickers (File Selector,
  Folder Selector) remember the folder they used last, **per picker kind**, and open there next time. The
  memory lives in the per-user app-data folder, so it survives a restart — including in a **generated app**,
  not just in the designer. Deleting a remembered folder simply means the platform picks again.

### Fixed — the axis colours only appeared in the running app (0.11.3, 2026-09-21)

- **Tick label colour** and **Name colour** looked right at runtime but not in the designer's preview. The
  preview's property converter skipped any property whose type was `Color?` (`Nullable<Color>`): it compared
  the property's type without unwrapping the Nullable first, so the colour was quietly dropped. It now
  unwraps and compares the underlying type, which is also the rule for any future Nullable property.

### Fixed — a stale bundled chart file could not be refreshed by opening the form (0.11.4, 2026-09-21)

- A project created before a bundled helper grew a member kept its old copy until the form was **saved** — so
  opening a form that used a newer property compiled fine in the designer and failed in the build. Opening a
  form now notices a stale `GrumpyCharts`/`PathPicker` copy and offers **Update now**; the search also looks
  beside the `.axaml` file, not only in the project folder, so a helper in a sub-folder form is found.

### Fixed — the code check reported the axis TITLES as invalid control names (0.11.6, 2026-09-21)

- `<charts:Axis Name="X Values"/>` is the axis **title** — what the Axis editor's *Name* row writes — but
  the checker read a bare `Name` exactly like `x:Name`, so a healthy form showed two red errors in PROBLEMS
  (`"X Values" is not a valid identifier`) while `dotnet build` was 0 errors. A bare `Name` is a name-scope
  registration only on a Control; on the chart set's plain model objects (`Axis`, `LineSeries`, `XYSeries`,
  `PieSlice`, `ChartCursor`) it is their own property. `x:Name` is still checked everywhere, and a genuinely
  bad control name is still reported, so the check did not get blunter — it got accurate.

### Fixed — the Data Selector's dropdown showed the letters "p" and "a" (0.11.11, 2026-09-21)

- The source dropdown displayed one character per option instead of **Spreadsheet** and **Data Files**. The
  webview's option helpers take `[value, label]` **pairs** (`labelledSelect` reads `pair[0]`/`pair[1]`), and
  this one list was passed as plain strings — so each *string* was indexed and its first two characters
  became the value and the label. The list is pairs now, `labelledSelect` also accepts a plain string as its
  own label so the next caller cannot repeat it, and the dialog's fields put their label **above** their
  control so a narrow designer panel cannot squeeze a dropdown either.

### Notes

- **The staleness marker moved twice**, and it now watches the newest *attribute* rather than the newest
  type: `ChartPickerMemory` → `GrumpyBarPlot` → **`SourceSheet`**. Each move is what refreshes an existing
  project's bundled copy before a form can be written that the old copy cannot compile.
- **Sample data**: the workbook used to exercise the chart set gained a page per new chart type ("Bar
  Chart": 8 regions with two series, "Area Chart": 12 months, "Pie Chart": 6 shares), each laid out the way
  the charts read by default — names in column B, values in C — so a dropped chart only needs the file and
  the page. That workbook is test data on the development machine, not part of the extension.
- Windows and Linux both, C# and VB both: the three new controls, the Data Selector's properties and the
  picker memory are mirrored in `GrumpyCharts.vb` and compile with `Option Strict On`.

## [0.11.2] - 2026-09-21 · *the chart gets its own colours: a gradient background, three axis colours, a reading you can always read*

Four appearance requests at the end of the `0.11.1` session: *"The cursor value readout display must always
render the X,Y values in White and the readout 'box' backcolor must always be Black. The Border and Series
info adopt the current selected series color (like it is currently)."*, *"Add a color picker to be able to
select the color of the Axis tick labels and axis names as well as the axis lines."*, *"Add a Gradient
background brush setting to the chart controls. Use the Avalonia gradients system with these brush options:
LinearGradientBrush, RadialGradientBrush, ConicGradientBrush."* and *"Place the spreadsheet file browse
option in the right-click menu, not a button on the chart surface. Then remove the Browse Button row from
the Properties list."*

### Added — a **Background Gradient** for a chart, in all three Avalonia gradient kinds (2026-09-21)

- The new **Gradient** row in the chart's *Appearance* group opens a small editor for a **background brush**:
  a **Type** of **None / Linear / Radial / Conic**, **three colour stops** (start, middle, end — the middle
  one optional), and an **angle** for the linear kind. **None** removes the brush, so the chart goes back to
  its plain **Back colour** / **Back opacity**.
- The value is a real Avalonia brush on `PlotBackBrush`, written as a property element:
  `<charts:GrumpyXYPlot.PlotBackBrush><LinearGradientBrush StartPoint="0%,0%" EndPoint="100%,100%">` with a
  `GradientStop` per colour. A linear brush turns its corner-to-corner diagonal (or its compass direction at
  0°, 90°, 180°, 270°) into **StartPoint/EndPoint**; radial and conic brushes carry the stops only —
  Avalonia's own defaults place them. Re-opening the editor reads the brush back out of the XAML, so a form
  written by hand or by a previous session reopens with the right colours.
- With a brush set, the **plot area is not re-filled**: the brush is already painted across the whole plate,
  and re-filling the smaller plot rect would map a second, compressed copy of the gradient onto it.

### Added — three independent axis colours, so ticks, names and lines can differ (2026-09-21)

- The Axis editor's single **Colour** picker became **Line colour** plus **Label colour** and **Name colour**
  — the tick labels and the axis name each get their own, and leaving either **empty** means "follow the line
  colour", which is exactly how every form behaved before.
- On the `Axis` object this is `TickLabelColor` and `NameColor` (both nullable) falling back to `AxisColor`;
  the ticks and the name are drawn with the fallback applied, while the axis line, its ticks and the
  `AxisColor` pen are untouched.

### Changed — the cursor readout is legible whatever colour the series is (2026-09-21)

- The readout box is now **always black with white values**, instead of being tinted with the plot's back
  colour at 92% opacity — a light chart could leave the numbers hard to read. The **border** and the **tag
  line** (the series name and its value) stay in the **selected series' colour**, so the readout still says
  which line it belongs to.

### Changed — the workbook is chosen from the chart's right-click menu (2026-09-21)

- The little **"…"** button that sat in the chart's top-right corner is **gone from the surface**, and so is
  its **Browse Button** row in the Properties list. **Right-clicking the chart** now offers
  **"Choose spreadsheet…"** as the first menu item, next to the series and appearance items it already had,
  so every one-off action lives in one place. An empty chart's hint says so:
  *"No data — right-click to choose a spreadsheet, or add a series"*.
- `ShowBrowse` is still accepted (it is simply ignored, and documented as such) so a form saved by an earlier
  version keeps compiling and rendering.

### Fixed — the preview never showed a brush, and had never shown a `Brush`-typed attribute at all (2026-09-21)

- The gradient looked perfect in the generated app but **did not appear in the designer preview**: the host
  renders through its **programmatic builder** (the reflective and temp-file XAML loaders are both
  unavailable here), and a property element — `<charts:GrumpyXYPlot.PlotBackBrush>` — never reaches the
  attribute-driven property applier, so the brush was simply dropped. The builder now reads the element and
  builds the brush (solid, linear, radial or conic) with its stops.
- Chasing that turned up a **second, older** bug: `Brush.Parse` returns an **immutable** brush, and a
  property typed `Brush` (**not** `IBrush`) refuses it — `SetValue` threw, and the preview's per-property
  `catch` swallowed it, so **any** `Brush`-typed attribute (`PlotBackBrush="#FF0000"` among them) had
  silently kept its default in the preview while the running app honoured it. The converter now returns a
  mutable brush when the parsed one does not fit the property.

### Notes

- Suite **6,437 passed / 0 failed / 0 skipped** (from 6,306; **6,484** with `AVALONIA_COMPLIANCE_RESET=1`, a
  full control re-audit): +100 in the new `tests/t2-logic/chartAppearance.test.js` (both twins, the editor
  seams, and write/read/clear round-trips through the real writers) and +13 in
  `tests/t1-preview/chartAppearance.test.js`, plus assertions added and reworked in existing files —
  `bundledComponents` (+2, the staleness marker moved to `PlotBackBrush`) and the seven that the changes made
  **stale**, such as the browse button that is no longer drawn or offered. The pixel file proves the two claims
  that no single pixel can: a gradient makes two plate points **differ** where the plain colour makes them
  **identical**, and the corner the button used to occupy is empty for both an empty chart and one that still
  says `ShowBrowse="True"`. Pixel measurements on gradients need geometry: a radial brush gives its four
  corners the same colour by construction, and the plate margin above the plot is where a colour can be sampled
  without catching a gridline.

## [0.11.1] - 2026-09-20 · *the chart frame gets its own room, and the spinner boxes line up*

Two small requests at the end of the `0.11.0` session: *"Also add a Padding property to insert space between
the border and the chart frame"* and *"In the Series editor, reduce the Line Thickness and Marker size input
Up/Down spinner boxes to line up with the rest of the input boxes - they are too wide when including the
spinner controls."*

### Added — `Padding` on a chart: the room between its border and its frame (2026-09-20)

- **`Padding`** is a `Thickness` on both chart controls, so `Padding="10"` and `Padding="4,8,4,8"` both work.
  It is the space between the chart's **border** and everything the chart draws inside it — the title, the
  legend bar and the plot area with the axis furniture around it. The Properties panel carries it as a
  **Padding** row in *Layout & size*, next to **Border Thickness**, and leaving it empty means "do not
  disturb the chart": the renderer keeps the small gap it has always had there (that gap now sits *inside*
  your padding, so nothing moves and nothing is double-counted).
- **The border does not move.** The padding is taken out of the inside, never added around the outside, and
  the chart's own backcolour still reaches the border — so the band it opens up is chart, not form. Negative
  values are clamped to 0, so content can never be pushed over its border; the little **"…"** open-workbook
  button stayed in the chart's corner, because it was chrome rather than chart content (0.11.2 later moved it
  into the right-click menu).
- **`LegendMargin` (0.11.0) is its sibling one level in:** `Padding` sits outside the legend frame,
  `LegendMargin` inside it. A chart can have both.
- **The bundled-file staleness marker moved to `Padding`.** A new *attribute* is as invisible to an old copy of
  `GrumpyCharts.cs`/`.vb` as a new type is — compiled XAML rejects a property the old copy does not have — so
  saving a form refreshes that project's copy. The rule in `bundledComponents.ts` now names both cases.

### Fixed — the Series editor's spinner boxes overflowed their row (2026-09-20)

- **Line Thickness** and **Marker Size** — and the same number rows in the Axis and Legend editors (the two
  tick sizes, the label size, the legend's name size, its frame thickness and its margin) — were drawn
  **204 px wide, their right edge 35 px past every other field** in the list.
- The rule asked for a 64 px basis, but a number input's *automatic minimum size* is its intrinsic
  ~20-character width — **the spinner is part of that width** — and `flex-shrink: 0` let that floor win, so the
  box rendered at its content width instead of the requested one.
- They now share the text and select fields' rule (`flex: 1 1 auto; min-width: 0`), so every single-control row
  ends on the same right edge: **204 px → 169 px**, right edge **682 → 647** in the measured stylesheet. That is
  also how the Properties panel has always behaved, which is what these fields now match.
- Layout is invisible to jsdom, so the guard is an assertion on `media/designer.css` itself (the shared rule,
  and that the fixed 64 px basis never returns). The geometry was measured, and looked at, in a browser harness
  built from the real stylesheet.

### Notes

- Suite **6,306 passed / 0 failed / 0 skipped**: +56 in `tests/t2-logic/chartPadding.test.js`, +24 in
  `tests/t1-preview/chartPadding.test.js` (pixels through the real host), +2 in `t2-logic/bundledComponents`
  and +2 in the T5 property audit — which re-checked **both** charts because their property list changed,
  applying `Padding="6,6,6,6"` through the real writer and reading it back from the host, in both twins.
- **The total dips by 2 while the audit's compliance cache is warm** (`tests/compliance.json`, local and
  gitignored): the two charts were verified, recorded as compliant, and are now skipped with a note.
  `AVALONIA_COMPLIANCE_RESET=1 npm test` re-audits everything and reads **6,308**.
- Both twins compile 0 warnings / 0 errors — the host at Avalonia 12.1.1, a probe at 11.0.10 and the VB twin
  under `Option Strict On` at 12.1.1, each with `Padding="10"` and `Padding="4,8,4,8"` used in a real form.
- Documented in `USER_MANUAL` §19.7, `CONTROLS.md` and the chart's own help text in the Properties panel. The
  Series-editor fix is a stylesheet rule and needs no user-facing text.

## [0.11.0] - 2026-09-20 · *the cursors belong to their series, and the charting tool is written down*

Asked the day after the charting tool shipped in `0.10.11`: *"the cursors must inherrit the color of the series
that it is following."* One line, and it settles something the Cursor editor had been leaving open — a cursor was
drawn in the colour it had been given while the value it reported came from a series drawn in another colour, so
the number and the line it belonged to had to be matched up by eye.

### Changed — a cursor that follows a trace is drawn in that trace's colour (2026-09-20)

- **The cursor wears the series' colour.** While a cursor's **Follow trace** switch is on, its lines, the
  handle at its crossing and its whole readout panel are drawn in the traced series' own `LineColor`. The
  **Colour** row in the editor now applies to a cursor that does *not* follow — a free crosshair used as a
  threshold line. Two cursors on one trace are both that trace's colour, which is the point of the change:
  what belongs to a series now looks like that series, and a reading no longer has to be matched to its line
  by reading the name.
- **One place decides it.** `ChartBase.CursorColor(cursor, trace)` is the rule, and each cursor's clickable
  record now carries `DrawnColor` — the colour it was actually drawn in — so the readout's border and values
  and the two-cursor `ΔX`/`ΔY` row are drawn in the colour that is on screen rather than in a configured one.
- **The bundled-file marker moved to `DrawnColor`.** A change in how an existing type *draws* is as invisible
  in an old copy as a new type is: a project keeping an older `GrumpyCharts.cs` would simply have kept the old
  picture and reported this as a fix that never arrived. Saving the form refreshes the file, exactly as it does
  for a new element — and the rule in `bundledComponents.ts` now says so: when the drawing changes, move the
  marker, not only when a new element appears.
- **Both twins.** `resources/GrumpyCharts.cs` and `.vb` compile 0 errors / 0 warnings on Avalonia **12.1.1 and
  11.0.10**, the VB one under `Option Strict On`.
- **The help text says it** — the Cursors modal hint, the **Colour** and **Follow trace** field tooltips, and
  the chart entries in the in-app help and in the Cursors row's description.

### Added — the charting tool, written down (2026-09-20)

- **`USER_MANUAL.md` §19 has its cursors chapter at last** (§19.8): the editor's fields, what *Follow trace*
  does to the crossing, the readout panel and its two placements, `Decimals`, the runtime keys (`←/→` steps a
  sample, `↑/↓` picks the trace, the drag, the right-click menu) and the `ΔX`/`ΔY` row — plus why *which*
  cursors are switched on is deliberately not saved. The tips follow it as §19.9 and gained the
  workbook-open-in-Excel message.
- **`CONTROLS.md`** lists the cursors beside the other chart editors, and **`README.md` §7** is now *Bundled
  helper controls and charts*: the two self-drawing charts, the workbook they read, the four editors and the
  cursors — in the shop window, not only in the manual.
- **`NOTES.md` §141** collects what the charting session cost: VB `[Long]`/`[Short]`, `MenuItem.IsChecked`
  missing in Avalonia 11.0, pixel tests that must name the box they measure, the Excel `FileShare` refusal,
  `SelectedTrace` as the single source of truth, and the pre-tag audit of the compiled artefact (a project
  name had reached a shipped comment again).
- **A donation link.** The README now opens with a PayPal link — *"If you enjoy using this extension, please
  contribute and consider making a donation."* — and because the README is what the Marketplace renders, the
  listing carries it as well.
- Suite **6,153 → 6,197** assertions: the pixel tests now prove the colour rule on two differently coloured
  series, the marker test remembers the copy that *has* cursors and is nevertheless stale, and
  `tests/t2-logic/rebrand.test.js` (19) keeps the new name in place — manifest, the strings that must agree,
  and a scan that fails on a leftover old name in any shipped file.

### Renamed — *Grumpy's WYSIWYG Designer for VS Code* (2026-09-20)

- **The name the Marketplace shows and searches is now *Grumpy's WYSIWYG Designer for VS Code*** — formerly
  *Avalonia Designer for VS Code*. The **extension id is unchanged** (`grumpy.avalonia-designer`), which is the
  whole point of doing it this way: your settings keys, your keybindings, the icon's place in the Activity Bar
  and the **models you have already downloaded** (4.4 GB, kept in
  `globalStorage/grumpy.avalonia-designer/models`) all keep working — nothing to reinstall, nothing to migrate.
- **Renamed with it, so the product says one thing everywhere:** the Settings section title, the Activity Bar
  container, the **output channel** and every message that points at it (`View → Output → "Grumpy's WYSIWYG
  Designer"`), the **Problems-panel source** of the designer's own diagnostics — and the assistant, which finds
  its findings by that name — the code-action label, the marker written into generated files, the host's
  *"could not render this XAML"* message, the issue template and this documentation.
- **Older generated files still count as generated.** The DataSet designer writes
  `// Generated by Grumpy's WYSIWYG Designer — …` into `MyData.cs`/`.vb` and **recognises both spellings**, so a
  project created before the rename keeps its DataSet editor — and the protection that stops the designer
  rewriting hand-written code.
- **History stays as it was written.** Earlier sections of this file, `NOTES_ARCHIVE.md` and the older
  developer logs quote *Avalonia Designer* because that is what shipped then.
- The new name is pinned by `tests/t2-logic/rebrand.test.js`: the manifest, the strings that must agree, and a
  scan that fails if any *shipped* file still calls the product by its old name.

### Notes

- **`0.10.11`'s released VSIX carries the chart chapter without the cursor section**, because that documentation
  pass came after it was packaged. This version carries the whole chapter, which is one more reason it is the
  file to upload.
- The documentation rides **inside** the VSIX — `README.md`, `USER_MANUAL.md`, `CHANGELOG.md` and `CONTROLS.md`;
  `NOTES.md`, `TEST_PLAN.md`, `SESSION.md` and `PUBLISHING.md` are not shipped.
- Nothing else changed: the charting tool, the nine Toolbox controls and the AI assist are exactly as `0.10.11`
  left them.

## [0.10.11] - 2026-09-18 · *the prompt is written where you are, not at the top of the window — and the charts arrive*

Asked the morning after `0.10.10` was released: *"when writing the prompt for ai assist, place the prompt input
box next to the current cursor position and make the prompt entry box a multi-line (at least 5 lines) input
area."* Neither half was possible with the prompt widget the extension used: `showInputBox` is single-line by
design (`InputBoxOptions` has no `multiline`, no `rows`) and VS Code always draws it at the top of the window,
with no API to anchor it at the caret. The Comments API is not an alternative either — a `CommentThread` has
`canReply` and a `label`, but **no `input` and no submit event**, so a reply typed into one goes nowhere an
extension can read.

And one thing that has nothing to do with prompts: this version also carries **the charting tool** — two
self-drawing charts with four editors and draggable cursors, written up in its own section below.

### Added — nine Toolbox controls, and a rule for a crash that compiles (2026-09-19)

- **Nine more Toolbox controls.** `ProgressBar`, `Slider` and `Separator` (a new *Progress, status & misc*
  category, mirroring CONTROLS.md), plus `Masked Text Box`, `Numeric Up-Down`, `Path Icon`, `Toggle Switch`,
  `Polyline` and `Polygon`. Each has a plain-language tooltip/help text, a starter snippet and the property
  rows it needs (`Value`/`Minimum`/`Maximum`, `Points`, `Mask`, `Path Data`, …). Two details that would
  otherwise read as bugs: a dropped progress bar ships at **40%** so it is visible, and `Polyline`/`Polygon`
  carry `Stretch="Fill"` so the resize box actually scales them.
- **A check rule for the exception a build cannot see.** An unguarded directory listing — `Directory.*`, or a
  directory-only call on a `DirectoryInfo` — is now a warning. On Linux `DriveInfo.GetDrives()` returns every
  mount, and one of them (`/sys/fs/pstore`) is unreadable for a normal user, so a loop that reads like *over
  my disks* threw `UnauthorizedAccessException` as the window loaded. It compiles, which is exactly why it has
  to be a rule: neither the build nor the repair loop (which verifies by rebuilding) can see it.
- **One copy of the shared DataSet runtime helpers per project.** Two DataSets in one namespace each declared
  `RuntimeStorage`/`DatabaseAdapter`, so the second broke the build with CS0101 (BC30179 in VB). The helpers
  now live in exactly one generated file — and a single *Generate Code* repairs a project that already has
  the duplicate.

### Removed

- **The dataset-to-TreeView binding never shipped.** It was built, judged impractical and removed before this
  release: no `role` columns, no `Wire<T>Tree`, no `TreeBuilder` helper. The **TreeView control itself**
  (toolbox entry, properties, node editor, events) is untouched.

### Added

- **TreeView is in the Toolbox.** It was already a core Avalonia control and already listed in
  `CONTROLS.md`, but it had no Toolbox entry — and adding one turned out to need **five** places, four of
  which fail *silently* when forgotten: the TypeScript catalog (no sidebar entry at all), the description
  (a blank tooltip and a blank *About this control* box), the C# host's snippet table (a drop that does
  **nothing** — the XAML a drop inserts is generated by the host, not by the extension) and the host's type
  map (the preview falls back to a blank element). A dropped TreeView ships with two starter nodes, one of
  them expanded, because a node displays its **`Header`** and an empty TreeView is a blank box.
- **The Tree Items editor.** A TreeView's nodes *are* its content, and hand-writing nested
  `<TreeViewItem>` elements is where a novice gives up. Four decisions were taken before any code was
  written: the same shape as the existing **Menu Items** editor (indented rows, nest / un-nest, so there is
  one idiom to learn), a row edits the node's **Header** plus an *expanded* tick, a child the editor cannot
  represent is shown as a **read-only row**, and the buttons are add child / add sibling / delete / move up
  / move down. Nesting is the indentation — there is no level number to fill in. Deleting a node that has
  children asks first (the extension asks, not `window.confirm`, which does nothing in a webview); a leaf is
  deleted straight away, because the editor is a working copy that **Cancel** already undoes.
  **What it will not touch:** a `TreeView` can hold an `ItemTemplate`, a `Styles` block or a bound
  `ItemsSource`, and an editor that rebuilt the element would silently delete them. Save removes and
  re-appends **only** `<TreeViewItem>` children; everything else stays exactly where it is, and appears in
  the editor as a greyed read-only row labelled with the element it stands for.
- **📄 View Log** in the File toolbar group, between **🩺 Code Fix…** and **💾 Project Backup**: opens
  `logs/ai.log` in an editor tab with the caret on the last line. Every Code Fix step, every model request
  and the reason for each refusal is in that file, and "why did it do that?" is now one click from the
  designer instead of a hunt through `globalStorage`.

### Fixed

- **A missing `;` is placed where the compiler said, not at the end of the line.** `CS1002: ; expected` is
  reported at the position the parser expected the terminator, and that position *is* where the `;` goes —
  including inside a one-line block (`try { Foo() }` → `try { Foo(); }`). The rule looked only at the line
  the compiler named, refused it because it ends with `}`, and handed the error to the model; the log
  showed four such refusals in a row. The compiler's **column** is now used first, a rule that cannot act
  **falls through** to the model instead of consuming the error, and every candidate it tries is logged
  with the fixer's own words.
- **The 30B step-up hands the 7B back.** The escalation stops the built-in runtime and repoints
  `assistant.backend`/`endpoint`/`model` at the user's own unit, and nothing put them back — so the picker
  stayed on the 30B afterwards and the next Code Fix had no local model at all. The three values (and
  whether the 7B was running) are recorded before the escalation and restored however the big run ends —
  clean, cancelled, a throw, or an escalation that never started — and the runtime it unloaded is loaded
  again.
- **The log is clamped by trimming instead of being deleted.** The old cap removed the *entire* file once
  it passed 512 KB; at the time it was 504 KB holding three days of work. Past the limit the oldest lines
  now go, the newest 256 KB stay, the cut lands on a **line boundary**, a marker line records how much was
  dropped, and no single line may exceed 2,000 characters.
- **The AI was never asked to fix anything that is not an open form's code-behind.** Reported the same
  afternoon: *"No change. The Code Fix does not start the ai train, and the 30B does nothing. The ai assist is
  working if i prompt it to add features to a function, or create new functions."* That last sentence is the
  clue — the model, the server and the client were all fine, because a prompted request worked. The Code Fix
  itself never reached the model: `fixCompilerError` built a snapshot, ran the analyser and only then asked
  whether the file belonged to an *open form*, and every path after that question — the AI fallback included —
  sat behind `if (!form) return 'no-fix';`. The designer offers **Code Fix** on every C#/VB file in the project,
  so for anything but a form's own code-behind the answer was "no fix" without a single request being sent; the
  user saw the *analyser* decline and then watched the step-up start a 30B for a fix that had never been
  attempted. The rules are a bonus when there is a form to analyse, not a toll gate: a file outside a form now
  goes straight to the AI, and its text is still snapshotted so a failed fix can be reverted.
- **And the step-up looked dead while it was working.** The escalation logged nothing between *"starting it as a
  systemd unit"* and its own end, and it had no end — a cold 16 GB load that never becomes ready simply waited
  forever. Every step now goes to `logs/ai.log` **and** the status bar (this run is answered from the code
  editor, where the panel's status line and the webview's progress line are both out of sight), the five-minute
  mark reports that the 30B did not make it instead of waiting, and the run's outcome — errors left, fixes
  applied, why it stopped — is written to the log.
- **The 30B step-up did nothing at all.** Reported after `0.10.10`: *"When I return to the designer a message
  saying that the 7B model could not fix and to try the 30B, but nothing happens."* The offer was made, the
  escalation ran — the 7B was unloaded, the unit was found already answering, the settings were repointed — and
  then the repair loop **cancelled itself before its first build**, because the run is passed
  `cancelled: () => !panel.visible` and the modal gets answered from wherever the user is looking (usually the
  code they were just told to look at). Switching away is a sensible "stop" for a run nobody asked for; it is
  the wrong signal for a run the user just said yes to. The step-up run now ignores visibility, a cancel is
  written to the log, the result is also announced in the status bar when the designer is behind the file, and a
  failure anywhere in the loop can no longer be silent: it is caught, logged and shown.
- **"When the code-behind is saved" did nothing — and neither did "while typing".** Reported right after
  `0.10.10` went up: *"The 'When the code-behind is saved' option in the Settings dialog does not seem to work."*
  It never could. The designer opens as a webview **in the same tab group as the code-behind**, so while the
  user is in the `.cs`/`.vb` file — the only place those two triggers can fire — the panel is not visible, and
  the check began with `if (!panel.visible) return;`. Only *when I come back to the designer* could ever run,
  because that is the one trigger where the panel is visible by definition. The ⚠ badges were lost with it,
  since they are recomputed inside the same function. The check now runs wherever the trigger came from,
  updates **PROBLEMS** (which is what you can see from the editor) and, when the trigger is a save and the
  designer is behind the file, says so in the **status bar** — a check with no visible effect is
  indistinguishable from one that did not run. Saving and typing still need the form to be **open in the
  designer**, because that is what the code is compared against.
- **The dialog's two code-check settings are now written where the value already lives.** `codeCheck.mode` and
  `codeCheck.badges` were written straight to `Global`, so a project that pinned either one would have shadowed
  every save and made the dialog look broken — the same class of bug the AI settings had before `0.9.33`.

### Changed

- **The prompt is typed in the editor, at the caret.** `AI: Implement in Function…` now inserts a marker block
  where the caret is — `// ✎ AI: begin — write what you want below, as many lines as you like` … `// ✎ AI: end`
  (VB gets `'`), with the caret already between the two lines (`$0` in the snippet), so typing starts where the
  user is looking. One line or twenty: the editor *is* the input, so the request gets what the dialog could not —
  the caret's own position, unlimited lines, and no length to guess before typing.
- **Two lenses above the block, and two key bindings.** *▶ Send to AI assist* (`Ctrl+Alt+Enter`) and *✕ Cancel*
  (`Ctrl+Alt+Esc`); both are hidden from the command palette on purpose, because with no block there is nothing
  to send and a command that can only say "no" is worse than one that is not offered.
- **What is inserted is removed exactly.** Sent, cancelled or refused, the marker lines and everything between
  them are deleted, so the file ends up byte-identical to how it was — a prompt can never quietly become a
  comment in someone's source. `Ctrl+Z` works too: the block is an ordinary edit.
- **A refusal keeps what you wrote.** The dialog's `validateInput` ran per keystroke and closed over the text;
  the same checks (at least a few words, within the model's allowance) now run when the request is *sent*, and a
  refusal leaves the block in place with the reason in a message — so nothing typed is ever lost.
- **The instructions moved to the status bar.** What the dialog said in its own chrome — how much room the
  request has, what had to be dropped to fit, and the example wording — is shown where the typing happens, and
  cleared by itself.
- Suite **4,868 → 4,915** assertions (`tests/t2-logic/aiPrompt.test.js` is new with **47**).

### Added — the charting tool: two charts, four editors, and cursors (2026-09-20)

Two **self-drawing** controls in a new Toolbox category, **Charts**: `GrumpyLinePlot` (Y values in sample
order — the X axis is the sample number) and `GrumpyXYPlot` ((x, y) pairs, as a joined line, as markers or
both). No packages, no image files, no chart engine: the control draws itself, so it scales to whatever space
it is given and prints or screenshots like any other control. Both come from one bundled file,
`GrumpyCharts.cs` (and its `.vb` twin), copied into the project like the other helpers.

- **Data from the spreadsheet you already have.** `Spreadsheet` (an absolute path — the workbook is *not*
  copied into the project), `X Column`/`Y Column`, `Names Row`, `First Data Row`, `Live Update` (re-reads
  when the file changes on disk, including the save-to-temp-and-rename dance that Excel, LibreOffice and
  VS Code all use) and `Browse Button`, which draws a small **"…"** picker in the chart's top-right corner
  — also automatically while the chart has no data at all, since that is exactly when it is wanted. Typed-in
  values (`Values`, `Points (x,y)`) still work for a static chart, and `SetValues` / `AddPoint` / `Reload`
  are there for code.
- **The Series editor — one row per series.** Title (empty = the sheet's column header), the columns that
  series reads (`Common` axis, or `Per series` with its own pair), line colour/thickness/style,
  marker/marker size/join points, and visibility — plus add, delete and reorder. A chart with no series
  elements keeps drawing its single line from the chart-level rows; **saving series takes over those
  styling rows**, which is the intended hand-off rather than a loss: from then on each series owns them.
- **The Axis editor.** Every axis with its position (left/right for an X, top/bottom for a Y), visibility,
  colour, major and minor ticks and their size, tick labels and their size, and a name. A *Per series* axis
  starts as a copy of the common one and the axes on a side **stack outward**, so two scales side by side
  stay readable. The old chart-level axis rows disappear from the Properties list once this editor is
  saved — the Axis objects are the single source of truth from then on, and the editor says so.
- **The Legend editor, and the bar it configures.** The legend lists every series by name in that series'
  own colour with a tick box, and clicking a box *or* a name switches that trace off and on. Position
  bottom/top/left/right (wrapping onto more rows or columns to fit), entry font size, and a frame with a
  backcolour, outline colour, thickness and corner radius. It takes its space from the plot but never more
  than 60 % of it, and a chart with no series elements draws no legend — its single unnamed line has nothing
  to name.
- **Cursors — up to two, draggable, with the distance between them.** A cursor is a line a user drags across
  the plot with a readout naming the value it sits on. `Orientation` (both/vertical/horizontal) decides
  which lines are drawn — a cursor always carries **both** an X and a Y, so a horizontal one still reports
  an X — `X Values`/`Y Values` decide which numbers its row shows, `Style` and `Colour` are its own, and
  `X`/`Y` are where it starts (empty = the middle of the axis). **Follow trace** (a cross cursor's setting,
  **on by default**) puts the crossing *on the selected series* at the cursor's X, interpolated between
  samples, so the handle, the line and the numbers can never disagree; switch it off for a free crosshair
  whose Y is yours to place — a threshold line. At run time: **←/→** steps the selected cursor one sample at
  a time (the X axis' own step, so it lands on samples), **↑/↓** chooses the trace the values are read from
  (its marker is drawn on the crossing in that trace's colour), dragging the **handle** slides the point
  along the trace, and the **right-click menu** switches each cursor on and off, picks *readout: follow the
  mouse* or *readout: top right corner*, adds, removes or re-centres cursors, and copies the readout as
  text. With **two** cursors on, the readout gains a second row — `ΔX`/`ΔY`, the absolute difference between
  them, in the *other* cursor's colour under a hairline. Which cursors are switched on is runtime state and
  is deliberately not saved: a fresh start shows every cursor that exists.
- **`ReadoutPosition` and `CursorDecimals`** — where the readout lives (beside the pointer, or pinned into
  the chart's top-right corner where it never covers the data) and how many decimals it shows (**-1** = as
  many as the axis labels use).
- Suite **4,915 → 6,153** assertions, and **1,221** of them are the chart work: `tests/t1-preview/`
  `chartColors` (4), `chartSeries` (8), `chartAxes` (9), `chartLegend` (31), `chartCursors` (37);
  `tests/t2-logic/` `chartSeries` (67), `chartAxes` (71), `chartLegend` (41), `chartCursors` (126),
  `chartWorkbook` (30) and `bundledComponents` (36, extended); plus the webview drives in
  `tests/t3-webview/designer.test.js` (813). Both twins compile 0 errors / 0 warnings on Avalonia **12.1.1
  and 11.0.10**, the VB one under `Option Strict On`.
- **A bundled file is validated by the XAML compiler, so the compiler is part of the test rig.**
  `GrumpyCharts` is built here by the host, a 12.1.1 probe and an 11.0.10 probe, plus the VB twin — a new
  element or enum is only really checked when a real project compiles it. The 11.0.10 probe deliberately
  avoids `Values=`/`Points=` because that version's compiled XAML cannot convert a string to `double[]`.

### Changed — a workbook Excel has open can be read (2026-09-20)

- **The workbook no longer has to be closed.** Reported from Windows, where a sheet left open in Excel is
  the *normal* state: `ZipFile.OpenRead` asks for `FileShare.Read`, Excel refuses, and the chart drew
  nothing and showed a raw IO error. The reader now asks for `FileShare.ReadWrite | FileShare.Delete` and
  retries four times at 120 ms — which is what Excel, LibreOffice and VS Code need. When it really cannot
  read the file it says which case it is, naming the file every time: *is open in another program — close
  the workbook in Excel (or save it again) and this chart reloads by itself*, *was not found — check the
  Spreadsheet path*, or the underlying reason.

### Fixed — four things the chart work exposed (2026-09-20)

- **The spreadsheet Browse button did nothing.** Clicking **Browse…** in the Properties panel was a
  no-op — the row was drawn and the handler never reached the file dialog.
- **A named colour was parsed as `#White` and fell back to transparent.** The host's colour reader assumed
  `#RRGGBB`, so `White`, `Teal`, `DarkOrange` and friends silently resolved to **Transparent** — which is
  exactly how a chart plate, an axis or a line can vanish while the code looks right. It now accepts colour
  names as well as hex.
- **An old `GrumpyCharts` copy was no longer detected.** The staleness marker watched for the element the
  *previous* chart feature introduced, so a project whose bundled file predated the cursors was not
  refreshed on save and then failed with *Unable to resolve type ChartCursor*. The marker is now
  `ChartCursor`, and the designer refreshes the file and says when it did.
- **A cursor's crossing and its readout could disagree.** The crossing sat at the cursor's own Y while the
  readout reported the trace's value — the two halves of the feature drawn from different numbers. There is
  now one place that chooses the trace (`SelectedTrace`) and one value both are computed from, which is also
  what made *Follow trace* possible.

### Notes

- Nothing else about the flow changed: same prompts, same planning against the model, same diff review, same
  rules first.

## [0.10.10] - 2026-09-17 · *the picker tells the truth, the logs have the address in them, and the assistant
knows what the generated DataSet actually is*

Supersedes `0.10.9` (released on GitHub the same evening, never uploaded — it was rebuilt because a
`/home/<user>/…` path from a bug-hunt note had reached the package as a compiled comment), `0.10.8`, `0.10.7`
and `0.10.6` — internal builds from the same afternoon, kept out of the Marketplace on purpose — and carries
everything from `0.10.0` onwards. The package was then audited for it: the VSIX was extracted and grepped for
the user name, the host name, project folders, the server alias and `/home/`, and nothing of the kind is in it
(the only `/home/` left is in generic samples such as `/home/x/a.gguf`). Most of this section is the answer to a
single afternoon of the user testing their own app: *"Chaos! Please look at my test app … The C# server is not
starting, the llama 30B is not starting"*, and then *"AI assist failed: No server answered"*.

**Fixed**

- **Both 7B entries called themselves pinned.** They share one `.gguf`, and the marker compared only the file
  name, so *"the picker is listing both the vulcan and non-valcon is pinned"*. The marker and the selection now
  use the **configured build** (`assistant.bundledBackend`), so exactly one entry is pinned and picking
  *CPU only* no longer leaves the picker pointing at the GPU entry.
- **The 30B "would not start" because `systemctl start` is a no-op on an active unit.** The unit had been
  `active (running)` for two days with its weights swapped out (`Memory: 50.4M, peak 17.9G, swap 1.7G`), `/props`
  never answered, and every request hung — `start` reported success and changed nothing. `Start server` now
  waits 25 s and, when the unit is active but silent, **restarts** it (which is what reloads the weights), then
  says so while it does. The step-up offer asks the same question first, so a 30B that is already up is no
  longer refused for memory it has spent: *"16.3 GB would not fit"* — printed twice while the 30B sat in swap —
  is gone.
- **Requests went to `assistant.endpoint` even when they should go to the built-in runtime.** That setting
  belongs to external servers, and on this machine it pointed at a dead port from an earlier experiment
  (`37857`) while the runtime answered on `33709`: the status panel was right and every repair failed with
  *"No server answered — is the local model server running?"*. The repair guard now hands back the runtime's
  **own address**, and logs it whenever it differs from the setting.
- **A failed assist left nothing behind.** `aiLog` wrote `logs/ai.log` while the AI client called plain `log`
  (Output channel only), so the file held 766 lines of panel chatter and **not one** request or failure line —
  in the file a bug report is checked against. Every line is mirrored into it now, and a failure records the
  address it used.
- **"GPU (Vulkan)" ran on the CPU.** ModelHost's own command line said `--gpu-layers 0` while the picker and
  the status line both said GPU, because only `max` maps to a layer count. The entry now decides the offload as
  well as the build — `max` for the GPU entry, `off` for the CPU one — and the load in progress uses it, not the
  field the panel sent a moment earlier. A model you added yourself keeps your own GPU field: its size is
  unknown to us, and `max` for a 16 GB model on shared memory is the mistake that setting exists to avoid.
- **The assistant kept writing an API that no longer exists** (CS1061 *"'MyDataSet' does not contain a
  definition for 'Customers'"*). The facts it is given said *"the form's data comes from the generated DataSet
  class"* — enough to keep writing `((MyDataSet.CustomersDataTable)DataGrid1.ItemsSource)`, the nested shape an
  **earlier** generator produced. The facts now state what the class is (static helpers, a **top-level** row
  class per table), name the members that do **not** exist, and say that a grid's rows **are** what
  `ItemsSource` holds — never `.Items`, which is WPF's name. Verified on the user's own app: the Vulkan-built 7B
  then fixed the file the compiler had been complaining about.

**Changed**

- **Opening ⚙ Settings says `Loading…`**, to the left of Cancel and Save, while the AI section is still being
  fetched — the report was *"it takes several seconds to load fully"*, and it was worse than that: the state
  path asked LM Studio's `lms` helper with the **20-second** default timeout, twice per state, on every open,
  save and focus. An answer is now reused for 15 s and `lms` is given 3 s in that path; *Refresh list*, the
  load and the import flows still ask in full. A helper killed at the timeout is logged as an incomplete
  answer rather than as "no models".
- **Vulkan is the default build**, in the setting as well as in the picker (it was `cpu` in the manifest and in
  five fallbacks while the picker's first entry was the GPU one — two answers to one question). Asking is still
  a request: a machine with no usable device runs the CPU libraries, the status names what is really running,
  and a load that dies is retried once on the CPU.

- Suite **4,868** assertions, 0 failed. Packaged as `avalonia-designer-0.10.9.vsix` and prepared for the
  Marketplace upload; `0.10.6`–`0.10.8` were installed and tested on this machine but never published.

## [0.10.5] - 2026-09-17 · *two choices a novice can read, and a step up when they are not enough*

Asked after the model comparison came in: *"We know the Qwen 7B answered correctly and that it should be a
Vulkan build. There should only be 2 options in the picker… We know we may need something better if the Qwen
cant fix the current issues. When it fails the system must ask the user if it should re-try a fix with the 30B
model… The user must stay informed all the time. Please realise that the average user is not an AI tech user,
just a simple novice programmer."*

### Changed — the picker is two entries

- **One model, two ways to run it:** *Qwen2.5-Coder 7B · GPU (Vulkan)* and *Qwen2.5-Coder 7B · CPU only (no
  GPU)* — **the same 4.4 GB weights**, downloaded and verified once. The measurement decided it (NOTES §132/§134):
  the 7B was the only one of five whose generated C# compiled, in **9.7 s on the Vulkan build** against 13.0 s on
  the CPU; the 3B was faster and wrong, DeepSeek-Coder-V2-Lite wrote the `CS1061` failure 0.10.2 was about *with
  the facts block in the prompt*, and Gemma-4-Coder answered nothing through the OpenAI path.
- An entry now **is** the choice of native build: picking one writes `assistant.bundledBackend`, the same key the
  status line reads back, so "which build actually loaded" is never a guess. Vulkan is the default, and a load
  that dies is still retried on the CPU build automatically — with the reason in the panel.
- **Everything else moved under one `Advanced…` fold** — LM Studio's library, `.gguf` files found on disk, *My
  own llama-server*, *A server I run myself*, *Let the server decide*. Nothing was removed; only the reading
  order changed, so the two entries are what a novice has to consider.

### Added — the 30B step-up (`src/bigModel.ts`)

- **When a repair run ends without a clean build**, and only when the bundled 7B is what just failed, the
  extension **asks**: *"The local 7B model could not fix everything — N error(s) are left. Try once more with
  your 30B model? It unloads the 7B, starts llama-server.service and loads 19 GB: about a minute. This machine
  has X GB free right now."* → **Use the 30B** / **No**.
- On yes it **unloads the 7B first** (that is what makes room), starts the user's unit through the same path the
  *Start server* button uses (waiting for the weights, pinning the settings) and **retries the repair once**.
- **Every step is announced**, on the status bar and the panel's own progress line: unloading → unloaded, memory
  free → starting the unit → waiting for the weights with the seconds counting → *"…is answering — asking it to
  fix the rest…"*.
- It is offered **once**, never in a loop. The unit comes from `assistant.llamaServerService` → the running
  server's cgroup → the only one discovered, so no machine's unit name is baked into the code; and it **refuses
  to offer** when the model behind the unit is not a real step up (less than 1.5× the local one) or would not fit
  in the free memory (plus 3 GB), with the reason in the log — an offer that cannot be made is not a failure the
  user needs to see.
- Free memory is read as **`MemAvailable`, not `MemFree`**: a machine that has just unloaded a 7B holds that RAM
  as page cache, and `MemFree` would refuse an offer that actually fits. That is the state this machine was in
  when its own 30B stopped accepting connections earlier the same day.

### Notes

- Suite **4,829** assertions, 0 failed — `tests/t2-logic/bigModel.test.js` is new with **31** (the unit's
  `ExecStart` over nine lines, the step-up refusals, and the sequencing: unload *before* start, announce every
  step, ask once).
- The four models dropped from the table were also deleted from the disk on the machine this was written on:
  **22 GB → 4.4 GB**, one file left, and it is the one both entries use. They remain available to anyone who
  wants them through *AI: Add a Model from Hugging Face…*.

## [0.10.4] - 2026-09-17 · *the button that refused silently now says why*

Reported minutes after `0.10.3` went up: *"The Remove Model function is not removing the selected model. check
please."* Nothing was wrong with the delete — the delete never ran, and the reason it did not was invisible.

### Fixed

- **Remove Model only ever accepted a `bundled:<id>` selection.** The button acts on the **selection**, and after
  a Load that selection is a **server entry** (`llama:` / `any:`) whose weights are the file the settings pin —
  very often one this extension downloaded itself. Everything else was refused with one terse sentence, **and a
  refusal was the one path that logged nothing at all**, so neither the user nor the extension's own log could
  show what happened. Three artefacts from the report agreed: `ai.log` had no removal line for the attempt,
  `settings.json` held `backend: external` with a dynamic endpoint, and `modelPath` pointed at the downloaded 7B
  inside the extension's own storage. `resolveRemoveTarget()` now resolves **any** selection to the file behind
  it and deletes it when that file is inside the extension's model folder — and refuses, *naming the folder we
  do own*, when it is not (a Hugging Face cache, LM Studio's library, a folder you chose).
- **A refusal is logged**, the confirmation names the **full path** (one file name can live in two folders), and
  removing a model now also stops this window's own `llama-server` when that is what serves the file.
- **Models added from the Hugging Face Hub could never be removed either**: the lookup used the pinned table
  (`specById`) while the picker lists the built-in table **plus** `user-models.json`. The resolution now takes
  the same list the picker uses.

### Notes

- **The button greys itself out** when the selection cannot be deleted, with the reason as its tooltip
  (`PanelState.remove`), so "nothing happened" is no longer an outcome.
- Suite **4,810** assertions, 0 failed (`removeModel.test.js` 40 → 69, pinned against the reported scenario
  end-to-end: a server selection with an owned `.gguf` behind it, a file outside the folder, an LM Studio key,
  and the advice the panel shows the button).

## [0.10.3] - 2026-09-17 · *the server you already had becomes something you can see and control*

Asked while comparing the two local runtimes on this machine: *"I don't know who started the llama server
(could have been me!). Could you add a control in the Settings panel to start and stop the llama server?"* The
extension could already report *that* something was answering on 8080, and it could start a `llama-server` of
its own — but for one it had not started it said only *"Started outside this window — Stop and Unload leave it
alone on purpose."* True, and useless for a process holding 19 GB: the answer to "who started it?" was on the
machine all along, in the process's own cgroup.

### Added — `src/llamaService.ts`: the server as a *service*, not only as a child

- **"Who started it?" is read from the kernel and systemd, never guessed.** The cgroup of the process holding
  the configured port names its unit, and `systemctl --user show` adds since when and whether it returns at
  login — the difference between "someone started this" and "this starts itself". On this machine the answer
  was the second one: `llama-server.service`, a **systemd user unit**, enabled, up since the last login.
- **⤓ Settings → AI assist has a *My llama-server* row**: a dropdown (*start as a systemd user unit* / *start
  as this window's process*), **Start server**, **Stop server**, and the owner line — unit, scope, uptime, pid
  and whether it comes back by itself. The choice is `assistant.llamaServerStartTarget`, written the moment the
  dropdown changes, so the panel and the palette cannot disagree about how it starts.
- **Start honours the choice and falls back to the other way when that fails**, carrying the failed route's own
  words into the message: a silent fallback leaves the user believing the thing they chose is what ran.
- **Stop asks first, every time, and names what it is about to stop** (the user's decision): the unit with its
  uptime and whether it returns at login, or a plain process with its pid and command line. A user unit goes
  through `systemctl --user stop`, so systemd's own state stays true. A **system** unit is never acted on — the
  exact `sudo systemctl stop …` line is printed instead, because this extension cannot escalate. A port held by
  something `ss` did not name as a `llama-server` is reported, never signaled.
- Settings `assistant.llamaServerService` (the unit; empty = find it, from the running server's cgroup or from
  the only user unit whose `ExecStart` runs a `llama-server`) and `assistant.llamaServerStartTarget`.
- **The status & hardware check** prints the same owner line where it used to say "leave it alone".
- Both palette commands use these paths: *AI: Start My llama-server…* applies the setting with the fallback
  (and still opens the interactive picker when neither way can work), *AI: Stop My llama-server* stops whatever
  holds the port, after the dialog.

### Notes

- Suite **4,781** assertions, 0 failed.
- One bug was caught by the new tests before it ever ran: a first-match cgroup regex answers `user@1000.service`
  — systemd's *own* user manager — which would have offered to stop the wrong thing. The unit is now taken from
  the **last** `.service` in the path, and the manager's own unit is refused outright.
- Measured, not guessed: the row adds **68 px** to the Settings dialog (41 + 27, plus ~16 for the owner line
  once it has text), whose cap, internal scroll and pinned Save row are unchanged (`tools/measure-settings-panel.py`).

## [0.10.2] - 2026-09-17 · *the fixer can reach the model that wrote the code*

Two fixes for one failure, hit hours after `0.10.1` was tagged: the user asked the assistant to link a ComboBox's
selection to the matching grid row, the answer did not compile — `CS1061: 'DataGrid' does not contain a
definition for 'Items'` — the checker reported **no** findings on that file, so the build-driven loop had no rule
to apply, and the loop's model fallback then refused to ask a model at all even though a 30 B model was serving
on the machine. Neither cause was the compiler, the rules or the model.

### Fixed

- **The repair loop could only see two of the three runtimes.** `repairRuntime` accepted the built-in runtime
  when it was already running and otherwise probed `assistant.endpoint`; the **user's own `llama-server`** — the
  "My own llama-server" entry in the picker, often a service that outlives a window reload — was invisible to
  it. In the reported case the app pinned `backend: bundled` (nothing running after a reload), the endpoint
  pointed at LM Studio's 1234 where nothing listened, and the model that answered was on 8080: the guard gave
  up and the compiler error was simply listed. It now checks, in order, the built-in runtime *if it is already
  running*, a server this window started, **anything that answers as llama.cpp** (the same probe the picker
  uses) and the configured endpoint — and still never starts a runtime just to repair something.
- **The model was never told what the form's data is.** `src/dataSetFacts.ts` (new) renders the DataSet
  bindings the **rules** already use into the prompt: the row type, its columns, and — the sentence that
  matters — that a control bound to a column *holds that column's value, not a row*. Told this, the model has
  no reason to invent `DataGrid.Items`. The panel's own copy of that mapping was removed and now delegates, so
  the rules and the prompts cannot drift apart again.
- Together they close the hole the user found: the loop can ask the runtime that wrote the code, and that
  runtime is told what the code should assume. `tests/t2-logic/dataSetFacts.test.js` (34 assertions) covers the
  facts text, the prompt block and both wirings.

### Notes

- Suite **4,707** assertions, 0 failed.
- `0.10.1` was tagged and released but **never uploaded** to the Marketplace — this release supersedes it, so
  the first listing from this line carries these fixes.

## [0.10.1] - 2026-09-17 · *the build becomes the referee*

Started from a plain complaint: *"Please check the 'Code Fix...' function. It used to work but now it does not
pick up syntax (or any other) errors. My test program is OptimisedCSTest."* … *"I removed a ; form a function.
No error reported"*. It was not a regression — it was the ceiling of a rule-based checker, and the answer is not
more rules.

### Added — the project's own compiler, as the second half of the check

- **`src/buildDiagnostics.ts`: `dotnet build` is parsed.** A **🩺 Code Fix…** run now also builds the project
  (incremental, ~1 s on the test app) and merges the compiler's errors and warnings into the same list and the
  same PROBLEMS pane, marked as coming from the build. Only the project's own source is reported (generated
  `obj/` output and other projects are dropped), MSBuild's double-printed errors are de-duplicated, and errors
  with **no file at all** (`CSC : error CS2001: …`) are kept rather than silently dropped. A **`CS1002` in the
  form's own code-behind gets the same one-click fix** the rules use, because the compiler says exactly where a
  `;` is missing while a rule can only prove it at the end of a body. Everything else is report-only — no rule
  can repair a type error, and pretending otherwise would be worse than saying so.
- Setting `avaloniaDesigner.codeCheck.build` (on by default); the build only ever runs on a deliberate press or
after a fix, never on the automatic checks and never while typing.

### Added — a statement nothing terminated is a finding, not silence

- **`insert-semicolon` (new rule).** Braces balance when a `;` goes missing, so the structural rules could not
see it: everything after a method body's last `;` must be a block (`}`) or nothing, and a bare expression there
is an unfinished statement (`CS1002`). C# only — in VB a statement ends at the line. The fix adds the `;` **in
front of a trailing `//`**, on the raw line, so a trailing string literal survives. Found with the user's own
file: `RadioButton2.IsChecked = true` with no `;` on line 96, which the checker called clean while `dotnet
build` refused the file. Two bugs the new tests caught: the fix first turned `Save.Content = "pressed"` into
`Save.Content =;` (the scanner blanks literals), and the rule flagged the generator's `// TODO: Handle X` body
until the scanned copy was used to decide whether a line holds code at all. Swept over 18 real C#/VB forms: 17
clean, one true positive.

### Added — the repair loop: build, fix one, rebuild

- **`src/repairLoop.ts` + `src/writeStamp.ts`.** Asked for outright: *"the feature will never be sucessfull if we
have to cover all errors by means of rules. The system must check for errors by running a build when it is done
refactoring the code, then Code Fix must check for compile errors and fix each one, one at a time untill the
build is clean"*. The build is the oracle and the rules are the hands: every pass fixes **one** error and
rebuilds, because each edit shifts line numbers and can reveal or erase the next one. A fix that does not bring
the project closer to compiling is **undone**; an error no fixer understands is **skipped** and the loop carries
on ("keep fixing what it can and list the rest"); the loop is bounded (10 fixes) and stops when the panel closes.
The trigger policy is the user's: a **designer-made** change (a handler it inserted) stays instant — the buffer it
wrote is clean — while a **hand or AI-assisted** edit marks the form and the loop runs when they come back to the
designer tab. The model is the last fixer, and **only when it is already running** (never started from here),
capped at three attempts per run because a local answer costs seconds to minutes.
- Proven end to end on a copy of the user's project with two planted errors: the first build saw only the
`CS1002` (a syntax error hides semantic ones), the fixer added the `;`, the rebuild **revealed** a `CS0103`, no
fixer claimed it, and the loop stopped with it listed — 1 applied, 1 remaining, 2 builds, 2.2 s.

### Added — a host check, and an honest notice

- **`src/hostCheck.ts`.** The AI assist is the one feature whose usefulness depends on the machine, so the
extension now probes it once at activation (`nvidia-smi`, `lspci`, sysfs VRAM, Windows WMI, `system_profiler`)
and greys the AI section out, with the reason, when there is not enough memory for the smallest supported model
— **available memory, not total** (free RAM plus a real card's VRAM against the same 8 GB `minRamGb` the
per-model fit check uses), which is what the user chose after seeing that their literal rule ("< 32 GB RAM and an
integrated GPU") would have greyed the feature out on their own machine, the box that loads a 3B model in 602 ms
on Vulkan. Below 20 GB available it **warns** instead, and an APU's carve-out is deliberately not counted (it is
the same RAM twice). The refusal is never a lockout: **Use it anyway — I know this machine**
(`assistant.ignoreHostCheck`) is offered in the explanation, remembered and logged.
- **EXPERIMENTAL FEATURE-USE WITH CAUTION** at the top of ⚙ Settings (bold red), in `README.md` and in
`USER_MANUAL.md`, with a table of what the check blocks, warns about, never counts, and how to override it.

### Fixed

- Two probe defects, both found by **running** the code rather than by reading it: `lspci -mm` lists *every* PCI
  device, so `AMD Family 19h USB4/Thunderbolt PCIe tunnel` was picked as "the GPU" until the class field was
  checked; and Windows `AdapterRAM` saturates at 4 GB − 1 byte, which would have made every Windows card look
  like a 3 GB card and never be credited. The new tests also caught two bugs in the semicolon rule while it was
  being written (a fix that blanked a trailing string literal, and the generator's comment-only body being read
  as a statement) — neither ever shipped.

- `README.md` §4/§10, `USER_MANUAL.md` (Code Fix… and the AI-assist section), `CONTROLS.md`, `TEST_PLAN.md` and
`tests/README.md` carry the repair loop, the host check and the experimental notice; the assertion count moved
from ~4,400 to **4,670**.

## [0.10.0] - 2026-09-16 · *the local AI assist reaches the Marketplace*

The first release published since **`0.9.4`**, and the first with **one version number** (see the note above).
Everything from `0.9.5` to `0.9.46` is in it, and the short version of those forty-two releases is: **the
extension grew a local AI assistant** — plus the fixes that came out of using it every day.

### Added

- **A local AI assist — opt-in, and nothing leaves the machine** (`avaloniaDesigner.assistant.backend`).
  - **AI: Implement in Function…** writes or rewrites a method from one sentence — and *outside* a method it
    writes a **new** member at the caret. The model chooses the name, signature and body; the rules are ours:
    a name that already exists is **refused** (not quietly replaced), new members are always `private`,
    `static`/`Shared` only when the body needs no instance state or control, a `namespace`/`class` wrapper in
    the answer is stripped, and usings are added after the last existing one.
  - **✨ Fix with AI…** on the Code Fix findings that sit inside a method.
  - **Nothing is written without you** unless you ask it to be: the answer opens as a **diff** with *Apply* and
    *Discard* offered directly above the member, in the status bar and in the diff's own title bar (a choice
    that must not expire while you read), and **Build to verify** runs your project's own build. Clear *Show the
    proposed code as a diff before it is applied* and the code is written straight in — still one undoable
    edit, with **Undo** offered by name.
- **Three ways to have a model, all local.**
  - **The extension's own runtime** — a small C# server built with the .NET SDK your machine already needs
    (one VSIX for every platform, because NuGet resolves the native code on your machine), with five pinned
    code-specialised models downloaded **once**, verified against the SHA-256 the Hub publishes, and **any
    other `.gguf`** added with *AI: Add a Model from Hugging Face…*.
  - **Your own `llama-server`** — *AI: Start My llama-server…* / *AI: Stop My llama-server*: it finds the
    binary, asks which `.gguf` to serve, shows the flags it would use with the reason for each, waits for
    llama.cpp's own `/health` to say the weights are in RAM, and proves it answers. If one of yours is already
    running you are **asked** rather than given a second copy of the same weights — and a server this window
    did not start is never killed.
  - **Any server already listening** — LM Studio (still a first-class target, with its own GPU engines),
    Ollama, or anything else that speaks the OpenAI-compatible API.
- **House rules — the model writes like you do.** *AI: Learn the House Rules from My Code…* measures your own
  C#/VB files (indentation, brace style, member visibility, whether anything is `static`/`Shared`, handler
  naming, and for VB whether events are wired with `Handles` or `AddHandler`) and offers only the patterns that
  clear two gates: **5 examples, agreeing 80 %**, each shown with its evidence. A codebase split 50/50
deliberately produces **no** rule, and rules are counted per language. The list goes into every request.
- **The built-in runtime can run on the GPU** — `avaloniaDesigner.assistant.bundledBackend` (CPU by default,
  Vulkan when asked for, also *AI: Built-in Runtime Backend…*). llama.cpp falls back to the CPU libraries by
  itself when the machine has no usable Vulkan device, the status names the build that is **actually** running,
  and a driver that dies while the weights load is retried once on the CPU.
- **The Code Fix checker now reads the code the model writes** — a handler nothing calls, a name that looks
  like a control the form does not have, a duplicate member, a class *or* namespace inside a class, unbalanced
  braces — each with a mechanical Fix where one exists, running the moment the model writes.

### Changed

- **The prompt is planned against the model, not guessed**: the description dialog shows how much room your
  sentence has (*“~315 tokens (~1260 characters) left”*) and refuses to accept more, the optional context (the
  style sample, then the member list) is dropped in a stated order when the window is tight, and what was
  dropped is named in **View → Output → “Avalonia Designer”**. If the required parts cannot fit, nothing is
  sent and the message carries the numbers.
- **The ⚙ Settings panel is where the AI lives**, and it tells the truth about state: every entry says where
  it comes from and what *Load* will do with it, a loaded model is marked, *Loaded now:* answers “did my load
  take?”, the settings are written to the scope that actually owns them (a project-level pin can no longer
  shadow the panel), and the dialog now fits a 1024×700 editor area — measured in Chromium, twice.
- **The AI section says what it is waiting for** (*looking for local models…*) instead of leaving an empty
  picker unexplained, and a message no longer outlives its action.
- **Unload frees every runtime this window can hold** — the built-in runtime, the `llama-server` it started, and
  LM Studio — and a server *you* started is left alone, and said to be left alone.
- **One version number now**: the GitHub tag, the release title and `package.json` all carry `0.10.0` (the
  `v1.0.0-beta.N` tag beside a `0.9.x` listing version, used by the releases before this one, is gone).

### Notes

- **The AI assist is off until you switch it on, and downloads nothing until you press *Load Model*.** If you
  never turn it on, the designer works exactly as the published `0.9.4` did; the rest of the range is the fixes
  listed in the entries below this one.
- **Suite: 4,438 assertions, 0 failed** across five layers — the logic layer, the webview in jsdom, the real
  headless renderer over WebSocket, and a matrix that `dotnet build`s generated C# and VB projects for every
  control.

## [0.9.46] - 2026-09-16 · *the panel says what it is waiting for*

### Fixed

- **The AI section of the ⚙ Settings dialog no longer sits there silently.** Opening the dialog, ticking
  **Use a local model for Code Fix and Implement** with no model chosen, pressing **Refresh list** or coming
  back to the window all ask the extension for the machine's model list — and the first such ask of a session
  costs seconds, because LM Studio's own `lms` helper starts its service on the way (measured: the first call
  blocked **4270 ms** with the LM Studio service processes appearing 3 s into it; every call after that is
  ~220 ms). Until it answered, the picker was empty and nothing on screen said why. A line now appears before
  the round trip — `looking for local models…` — and is cleared by the state that arrives.
- **A message no longer outlives the action it belonged to.** The status check's `checking…` line is cleared
  by the report that answers it, and only that line: a failure reported by a load keeps its text, and a quiet
  background refresh never wipes something the user is reading.

### Notes

- Reported as *"it takes a while to load and start the server … show a loading message"*, and the description
  was literally right: the extension's `discover()` runs `lms ls`, `lms ps` and `lms server status`, and the
  first of those starts LM Studio's service. The line is written by the webview rather than the extension on
  purpose — the extension is the thing being waited for, so a line that only appears with the answer would
  arrive with the answer. Every state request now goes through one helper, and a test asserts there is exactly
  one place left that asks for a state, so a future caller cannot quietly skip the feedback.
- The extension also **logs how long the question took** (`LM Studio: … (asked in 4270 ms)`), so the next
  report about a slow panel is a number rather than an impression.

## [0.9.45] - 2026-09-16 · *the built-in runtime can use the GPU, when you ask it to*

### Added

- **The built-in runtime can run on the GPU** — `avaloniaDesigner.assistant.bundledBackend` (`cpu` by default,
  `vulkan` on request) and the command **AI: Built-in Runtime Backend…**. Nothing changes for a default setup:
  the CPU build is what runs, and the toggle is explicit. What it fixes is a promise the panel has been making
  since the GPU-offload field existed: for the built-in runtime, *max* could not offload anything, because the
  runtime only ever shipped llama.cpp's CPU libraries. Measured on the machine this was written on
  (2026-09-16): the same 3B Q4 model loaded in **602 ms with Vulkan (`offloaded 37/37 layers` to an AMD Radeon
  760M) against 1409 ms for the CPU build**.
- **A GPU that cannot be used says so, twice over.** llama.cpp falls back to the CPU libraries by itself when
  there is no usable Vulkan device, and the runtime reports which build it *actually* loaded — so the status
  names the build and the device it is running on, never the one that was asked for. If the driver itself dies
  while the weights load (the `device lost` crash that made this opt-in in the first place), the attempt is
  retried **once** on the CPU build, the log records the reason, the status carries a note, and the warning
  offers to make that permanent in one click.

### Changed

- **The ⚙ Settings dialog fits at 1024×700.** Re-measured in Chromium against the real stylesheet and markup,
  with the two one-line changes the 0.9.44 notes had named: the **House rules** editor is 3 rows instead of 4
  (−18 px) and this dialog's own rhythm is a little tighter (4 px between its hints, 1 px between its six
  option rows, 4 px above its tight button rows, 8 px above the House rules rule — 36 px more). Content
  736 → **689 px**: nothing is behind the scroll at 1024×700 any more (was 46 px), and at 1000×520 it is
  179 px instead of 226 px. The measurement also corrected the 0.9.44 figure: the tape measure renders the
  static markup, whose hint is one line where the webview writes two for a bundled model, so the real worst
  case was **54 px**, not 46. Only this dialog changed; the eight small ones keep the shared values.
- The GPU-offload row tells the truth about which build is running: with the CPU build it says *"max" needs the
  Vulkan build* and names the command, and with the Vulkan build it keeps the *"a layer count, not a ratio"*
  explanation it had.

### Notes

- **One binary, two native backends.** `host/ModelHost` always references `LLamaSharp.Backend.Vulkan` and picks
  its libraries at runtime from a `--backend cpu|vulkan` flag, so there is no second build that could go stale
  and no way for the binary to be wrong about how it was built. The price for anyone who enables the *built-in*
  runtime: ~40 MB more NuGet download and a `bin/` of ~227 MB — both already excluded from the VSIX and git.
- The other two engines are untouched: LM Studio's GPU engines and your own `llama-server` are their own builds
  with their own settings, and this setting does not reach them.

## [0.9.44] - 2026-09-16 · *the ⚙ Settings dialog gets its last rows back*

### Fixed

- **The ⚙ Settings dialog now uses the window it is in.** Measured in Chromium against the real stylesheet and
  the real markup (2026-09-16): at a 1024×700 editor area the box was 672 px tall for 754 px of content, so the
  last ~4 rows — the **House rules** box at the very end of the AI section — sat behind a scroll. It is now
  capped to the window minus **8 px** instead of 28, with a slightly tighter vertical rhythm inside it (10 px
  padding, 6 px between the hints, 2 px section heads): worth **~3 rows** at that size. At 1440×900 everything
  already fitted and still does. Only this dialog changed — the eight small ones keep the shared `.modal-box`
  values, and the pinned Save row, the viewport cap and the internal scrolling are all still asserted.

### Added

- **`tools/measure-settings-panel.py`** — writes a standalone page of that dialog (real CSS + real markup, no
  extension host, no app) and exposes `window.__measure()`, so the panel's size is *measured* rather than
  guessed. This is the second time this dialog's height has been the subject of a report, and both times the
  numbers came from a Chromium render that was thrown away afterwards. It is a tape measure, not a test: it is
  not part of `npm test` and it renders nothing of the user's project.

### Notes

- **If more height is still wanted**, two changes are one line each and were measured: the **House rules**
  textarea at 3 rows instead of 4 (−18 px), which together with slightly tighter option rows clears the
  remaining **46 px** hidden at 1024×700; or that box behind its own fold like the other sections (−92 px of
  content, at the cost of one click). A `min-height` **floor is deliberately not used**: the pinned Save row
  lives at the end of the flow, so a floor would leave dead space *below* the buttons rather than taller
  content (measured: box 658 px, Save row 281 px).

## [0.9.43] - 2026-09-16 · *house rules — the model writes like you do*

### Added

- **House rules** (`avaloniaDesigner.assistant.conventions`) — a short list of the idioms your code follows,
  added to **every** request to the model. They are edited in the designer's ⚙ Settings panel (one rule per
  line) or in the Settings UI, and the prompt says plainly that they are instructions to follow rather than
  context to consider.
- **AI: Learn the House Rules from My Code…** — reads the C# and VB.NET files of the open project (up to 40,
  with generated and designer files skipped) and **measures** how they are written: indentation, brace style,
  member visibility, whether anything is `static`/`Shared`, handler naming, and — for VB — whether events are
  wired with `Handles` or `AddHandler`. You are offered the patterns that cleared two gates, each with its own
  evidence (`5 of 5 C# members`), and only what you tick is saved. The same flow runs from the button in the
  ⚙ panel.

### Notes

- **No model is involved in learning, and nothing is inferred about intent.** A pattern needs at least **5
  examples agreeing 80 %** of the time before it is suggested, and a codebase split 50/50 produces *no* rule —
  a house style nobody chose is worse than none. Rules are counted per language, so a C# project with one VB
  form is never told to use `Private Sub`.
- The rules are an optional prompt part: on a tight context window they are given up **after** the existing
  member list and **before** the style sample, because they are a few dozen tokens and they say most of what
  the style sample shows.
- The prompt-dropping order is now pinned with parts of *uneven* size. The existing test could not see the
  direction at all — with two equal-sized parts, dropping forwards and backwards give the same answer.

## [0.9.42] - 2026-09-16 · *your own llama-server, started from the editor*

### Added

- **AI: Start My llama-server…** and **AI: Stop My llama-server** — the `llama-server` you built yourself is now
  an engine this extension can *run*, not just an address you have to start by hand. It finds the binary (the
  usual build folders and your `PATH`, or a path you set once), asks which `.gguf` to serve, shows the flags it
  would use with the reason for each (context size, CPU threads, GPU **layers**), starts it, waits for
  llama.cpp's own `/health` to say the weights are in RAM, and proves it answers with a one-line request before
  saying *Ready*. Nothing is downloaded and nothing is copied: llama.cpp reads the file where it is. The exact
  command line goes to the extension's log, so it can be reproduced or tuned by hand.
- **`My own llama-server` in the model list** — the panel can start it too, with the context-length and
  GPU-offload fields it already has (a **layer count** here, where LM Studio takes a ratio; no idle-unload row,
  because llama-server has no such timer). *Unload* stops it along with the built-in runtime.
- **An already-running llama-server is detected, never duplicated.** Asked after finding that a llama.cpp
  server answered faster and better than the LM Studio models: if one is already answering, *Start My
  llama-server…* offers **Use the one already running** (the default — nothing new goes into memory) or
  **Start another one with a different model**, and the panel's Load reuses a server that is serving the same
  file. It is identified by llama.cpp's own answers (`owned_by: llamacpp`, or a `/props` with a `model_path`),
  so an LM Studio or Ollama server is never mistaken for one.
- **Two settings:** `avaloniaDesigner.assistant.llamaServerPath` (the binary, empty = find it) and
  `avaloniaDesigner.assistant.llamaServerArgs` (your own extra flags, added **last** so they win — e.g.
  `--device none -nr`).

### Notes

- **A server this extension did not start is left alone, out loud.** Stopping, unloading and closing the window
  only touch the process this window spawned; a `llama-server` you run as a service is reported as *"already
  running on port 8080 … Started outside this window"*, because killing it is not this extension's business —
  but staying silent about the memory it holds would be worse.
- **llama.cpp's flag spellings, verified against its own server reference:** `--model`, `--host`, `--port`,
  `--ctx-size`, `--threads`, `--n-gpu-layers`, `--alias`. The sidecar's `--ctx`/`--gpu-layers` are *our*
  wrapper's names and would make a real llama-server exit immediately, so a test asserts they can never appear
  on that command line. If a build refuses one of the flags we add, it is started once more without the
  cosmetic `--alias` rather than reporting a version problem.
- The status report gained the third runtime: the command line of a server this window started, or the port and
  model of one that was already running.

## [0.9.41] - 2026-09-16 · *a model of your own, and no default program*

### Added

- **AI: Add a Model from Hugging Face…** — paste a model page or a file URL, pick the `.gguf` (a repo with
  several quants shows them all with their sizes), and the extension reads the size and the **SHA-256 from
  Hugging Face's own answer** and downloads it through the same verified pipeline as the built-in models
  (`.part` while partial, `.verified` once the hash matched). The added model is stored as an ordinary spec, so
  the picker, the load path, the hardware gate and **Remove Model** treat it identically — and
  **AI: Forget a Model Added from Hugging Face…** removes the list entry while leaving the weights to Remove
  Model.
- **llama.cpp is now presented as what it is: the first-class path.** Asked after finding that a llama.cpp
  server answered faster and better than the LM Studio models — *"Should we remove the LM Studio dependency from
  the extension and load everything from Hugging Face?"* There was never a dependency to remove (the extension
  runs without LM Studio, and says so), but the dropdown *opened* on LM Studio's library, making a program the
  extension merely drives look like the way to use it. The entries are now grouped in the order the extension
  can guarantee them: **its own runtime** (llama.cpp via LLamaSharp, weights from the Hub, no other program),
  then **a server you run** (your own `llama-server`, Ollama), then LM Studio's library, then loose `.gguf` files
  on disk. Nothing was removed — every entry still works.

### Note

Removing LM Studio was considered and rejected: it would delete a working path (its model library, one-command
loads) and with it the only GPU offload this machine has, since the bundled sidecar is CPU-only. A GPU backend
for the bundled runtime is planned as an opt-in, with the caveat that the earlier `device lost` abort came from
llama.cpp on exactly that iGPU.

Suite **4081** passed / 0 failed.

## [0.9.40] - 2026-09-16 · *the check looks at what the model wrote*

### Added

- **The designer's Code Fix now checks generated code, and runs the moment the model writes.** Asked with the
  new feature in hand — *"The 'Code Fix' in the designer does not pick up errors made by our new code generation
  feature. Can it be extended to cover this as well as handler functions?"* — the check runs after every write,
  in both diff modes, and its findings land in the PROBLEMS pane and the output channel like any other.
- **Rules for the mistakes a generative model actually makes** (all deterministic — no compiler, no guessing):
  - a handler **nothing calls** (the reverse of the existing *form wires an event, method missing* rule) — Fix
    writes `Click="…"` onto the control, through the same edit the AI side's wiring offer uses;
  - a **name that is not a control of the form**, reported only when a control *starts with* it — the
    `Status` / `StatusDate1` slip — worded as *"did you mean …?"* and never rewritten (the candidate is a
    guess); a framework name like `Console` cannot produce noise;
  - a **second member with the same name** (`CS0111`) — VB had this rule, C# did not — with Fix removing the
    duplicate;
  - a **class inside a class**, and a **`namespace` inside a class** — the shape a pasted answer leaves
    behind, and the `CS1513: } expected` the user actually hit. Fix keeps the members and drops the wrapper;
  - **braces that do not balance** (a truncated answer): Fix closes them at the end of the file, one per line.

### Note

The check is rule-based, not a compiler: type errors, wrong API use and a missing `using` are still only
found by building — which is what **Build to verify** is for.

Suite **4043** passed / 0 failed.

## [0.9.39] - 2026-09-16 · *the model that answered with a whole class*

### Fixed

- **A new member is never inserted with a `namespace`/`class` wrapper.** Reported from a real file: asked for
  a sorting function, the model replied with a complete `namespace … { public partial class MainWindow … { … }
  }`, and that got pasted **inside** the existing class — `CS1513: } expected`, a file that no longer built. The
  model copied the context it had been shown, exactly the failure the prompt tried to prevent. Three layers now
  stand in the way: the prompt says in so many words *"Do not wrap it in a namespace or a class"*, the answer
  is unwrapped before the diff is shown (and an answer that declared **several** members is refused, because the
  model chose those names, not you), and `insertMember` strips a wrapper as a last line of defence rather than
  writing a nested type declaration into a class.
- **A model that *is* only a member is left alone.** The unwrapper acts only on a type declared **before** the
  first member, so a local `class` written inside a method — legal C# — is not mistaken for a wrapper.

Suite **4003** passed / 0 failed.

## [0.9.38] - 2026-09-16 · *a prompt that fits the model, and a sentence that fits the prompt*

### Added

- **The description dialog now knows what the model can hold.** Asked with a clear aim — *"limit the length of
  the prompt to ensure the model's response does not take too long to process but still replies with a
  reasonably accurate result"* — the prompt is planned before the dialog opens: the window minus the answer
  budget is the room (`promptRoom`), the parts that need it are weighed (`fitPromptParts`), and what is left
  is the sentence's allowance, shown while typing (*"About ~315 tokens (~1260 characters) left for your
  sentence"*). Typing more than fits is **refused**, with the count in the message, instead of being silently
  trimmed or sent to become an empty answer.
- **Context that does not fit is dropped in a stated order, and said out loud.** The method (or the class
  context) and the file header are required — a rewrite without them is a guess. When the window is tight the
  style sample goes first, then the member list, each named in the Output channel; if even the required parts
  do not fit, nothing is sent and the message names the number and the way out (a bigger
  `loadContextLength`, a split method, or a model with a wider window).
- **LM Studio and Ollama are deliberately not limited.** Their context belongs to the server, and a limit we
  cannot measure would refuse perfectly good sentences; the dialog says so instead of showing a number it
  made up.

Suite **3985** passed / 0 failed.

## [0.9.37] - 2026-09-16 · *review it, or write it straight in — and a window that can hold both*

### Added

- **"Show the proposed code as a diff before it is applied"** — a checkbox in the ⚙ Settings panel, and the
  same switch as `avaloniaDesigner.assistant.showDiff` (on by default). Cleared, the model's code is written
  straight into the file: no diff tab and no Apply/Discard decision — but still one normal undoable edit
  (**Ctrl+Z**), still the same rules first (a name that already exists is refused, the visibility is
  corrected), and the toast then offers **Undo** by name. One implementation writes both ways, so the two
  modes cannot produce different code.

### Fixed

- **The window can now hold the prompt *and* the answer.** A bundled 12B model answered with **0
  characters**: the context the runtime is started with (4096) and the answer budget the extension asks for
  (4096 by default since 0.9.15) were chosen independently, so they could not both fit — and the sidecar's
  own clamp reserved a flat 512 tokens for the prompt, a number that was right when the request cap *was* 900
  tokens. The prompt is now measured (`estimateTokens`), the answer gets what is really left
  (`answerBudget`), the window grows to fit the budget when the user has not pinned one (`contextForBudget`),
  and a request that had to be reduced says so in the log.
- **Every request and every outcome is now in `logs/ai.log`.** The request line carries the model, endpoint,
  prompt size (~tokens), the answer budget (and whether it was reduced) and the window; the outcome line
  carries the answer length, the thinking length and the finish reason — including the boring
  `answer=0, reasoning=0` case that used to leave no trace at all. The runtime's own last output lines are
  kept and quoted when an answer is empty, because "chat template not usable" is the line that explains a
  model answering with nothing, and it used to live only in the Output channel.

Suite **3962** passed / 0 failed.

## [0.9.36] - 2026-09-16 · *"create a function named SortArray" — said to the caret*

### Added

- **A new member, written where the caret is.** *AI: Implement in Function…* refused a caret that was not
  inside a method; it now writes a **new** one there. The dialog takes a sentence — *"Create a function
  named 'SortArray' that sorts the contents of a passed array"* — and the model writes the name, the
  signature and the body. Placement is decided by the caret and snapped to a line boundary: on its own
  lines, one blank line of separation, indented like its neighbours, never above the class's opening
  brace, and refused outright when the caret is not inside a class at all. **Inside a method nothing
  changes** — the model still rewrites exactly that method.
- **`private`, and `static`/`Shared` where that is possible.** Visibility is corrected rather than hoped
  for: anything else becomes `private`; `static`/`Shared` is added when the body provably needs no
  instance state (no `this`/`Me`, no control of the form, no non-static sibling member) and removed when
  it does — which includes every `<Control>_<Event>` handler, since XAML resolves those on the instance.
  In VB a member-level `Static` becomes `Shared`, because that is the keyword that compiles.
- **The `using`/`Imports` lines the new member needs come with it.** They are inserted after the last
  existing one, where they compile, never above the file's own imports and never twice.
- **A new handler offers to wire its event.** When the new member is named after a control in the form
  (`Save_Click`), the extension offers to add `Click="Save_Click"` to that control in the `.axaml` — one
  click, a normal undoable edit, and it says which file it touched.

### Fixed

- **A name that already exists is refused, never replaced.** *"Create a function named X"* when `X`
  exists answers with what to do instead — put the caret inside it and run the same command to rewrite it
  — and writes nothing. It is checked twice: the name spelled out in the sentence (before a model call is
  spent) and the name in the answer (before any diff is shown).

Suite **3940** passed / 0 failed.

## [0.9.35] - 2026-09-15 · *the 7 GB button, a third built-in model, and a dialog that folds*

### Added

- **Remove Model — the weights can be deleted from inside the panel.** Downloading a model is a one-way
  gesture: `Load Model` fetches several gigabytes into the extension's storage and nothing in the UI could
  give the disk space back. The new button sits between **Unload** and **Status**, is styled as the
  destructive action it is (red, never the Load colour), and always asks first — a host-side modal warning
  naming the file and saying it will be re-downloaded, because a panel-side `confirm()` is easy to dismiss
  without reading. It removes the weights **and** the `.part`/`.verified` sidecars, so the entry returns to
  its "not downloaded yet" wording instead of lingering as a half-download. If the file is the one in use,
  the built-in runtime is stopped first (it holds the `.gguf` open — Windows locks files in use) and the pin
  is cleared, so the picker returns to *“— choose a model —”* instead of naming a file that is gone.
  It refuses what it cannot do (an LM Studio key, an id no longer in the table, a model that is not on disk)
  and — the part that matters — **a delete that did not take is reported as a failure**, not as success: a
  file that survives the unlink because a process still holds it would otherwise be found out only at the
  next download.
- **A third built-in model: Gemma-4-Coder 12B (Q4_K_M).** 6.9 GB, min. 16 GB RAM — a code-tuned Gemma-4 at
  12 B, between the 3B's speed and the 7B's quality. It is a **community GGUF** of `google/gemma-4-12B-it`
  (the repo's own card says so), which the picker states rather than implying a first-party release. Size and
  SHA-256 were read back from the Hub before pinning: `7,381,381,664` bytes,
  `1fe90b72…b1fe8d`. The table now offers five downloads: Qwen 3B/7B, DeepSeek-Coder-V2-Lite (IQ4_XS and
  IQ3_M) and this one.
- **The ⚙ Settings dialog folds.** *Code check settings* and *AI assist* collapse like the Properties
  groups — click the heading row (▸ folded / ▾ open), the choice is remembered per designer tab, and Code
  check starts folded since most visits are there for the AI switch. Opening the dialog now focuses
  something visible: it used to focus a radio button inside the folded section, which is a silent no-op.

### Fixed

- **No selection means the placeholder — never the first model.** `currentSelection` fell back to
  `MODEL_SPECS[0]` for a built-in backend with nothing pinned, so the panel could name a model nobody had
  chosen (the last surface still doing this after 0.9.32 taught the webview not to). It now returns the
  placeholder, which makes "nothing chosen yet" a state the UI can hold honestly — including right after
  **Remove Model**.
- **The note for an empty picker stopped sending the user in circles.** It read *"the extension sent no
  selection — press Refresh list to ask again"*, but refreshing cannot change a pin that is empty on purpose.
  It now says *"no model chosen yet — pick one, then press Load Model"*.
- **DeepSeek-Coder-V2-Lite IQ4_XS is internally consistent again.** The entry carried IQ4_XS bytes and hash
  with a Q4_K_M file name; all three fields are now the IQ4_XS ones, re-checked against the Hub
  (`8,571,593,472` bytes, `ac0a9967…c4e0706c`).

Suite **3841** passed / 0 failed.

## [0.9.34] - 2026-09-15 · *"unload everything" that only spoke to one runtime*

### Fixed

- **Unload now frees the extension's own runtime.** It only ever ran `lms unload --all` — *LM Studio's* command — so
  pressing Unload with a built-in model did nothing at all: the sidecar kept the weights and the picker kept its
  `● in use` marker (reported the moment pinning started working). Unload now stops the built-in runtime **and**
  unloads LM Studio, and says which of the two it actually did — *"Done — the built-in runtime is stopped, and LM
  Studio has nothing loaded."*
- **LM Studio being absent is no longer a failure.** There is simply nothing of its to free; and when neither
  runtime holds anything, the message says that instead of claiming a success.

Suite **3762** passed / 0 failed.

## [0.9.33] - 2026-09-15 · *the setting that was written, and then overruled*

### Fixed

- **Settings are written where the value already lives — this was the real cause of the picker reverting.**
  A project's own `.vscode/settings.json` contained

  ```json
  { "avaloniaDesigner.assistant.backend": "external" }
  ```

  a **workspace** setting — and a workspace value beats a global one. Every `backend: bundled` the panel saved to
  Global was therefore shadowed: the load really did work, the built-in runtime answered, and the panel — reading
  the **effective** value — went on saying "let the server decide" the moment it was refreshed. It also explains
  the shape of the report exactly: the two LM Studio models were fine there (external is what they need) and the two
  built-in ones could never stick.

  All AI settings now go through one `configView()`, whose `update` writes to the scope that already supplies the
  key (folder → workspace → user), which is what VS Code's own Settings UI does. A project-level pin is **updated**
  rather than overruled, and a write to a non-global scope is logged — a shadowed write looks exactly like a load
  that did nothing.

Suite **3748** passed / 0 failed.

## [0.9.32] - 2026-09-15 · *the panel that was never told*

### Fixed

- **Every open designer tab is kept in step, not only the last one that spoke.** `attachPanel` remembered a
  single panel, so a designer tab that was **not** the active one heard nothing at all: its AI section kept the
  state from whenever it was opened — a picker sitting on *"Let the server decide…"* while another tab had a model
  loaded and answering. The extension now keeps **all** open panels and broadcasts the state (and the progress
  line) to each of them, and a tab that becomes visible re-asks for the state as well. Reported as *"the picker
  reverts to 'Let the server decide…' directly after the model loaded and before Save can be pressed"* — which
  also ruled out the Save path, since nothing had been saved yet.
- **The picker never falls back to another model.** If a state carries no selection, the placeholder is shown and
  it is said out loud; before, the *first* entry (`Let the server decide…`) was selected silently — a change that
  looks exactly like the selection being thrown away.

### Added

- **The webview reports what it actually applied**: `Panel applied: wanted=… shown=… choices=…` in
  `logs/ai.log`, alongside 0.9.31's `Load finished (ok) — panel state: …`. Between the two lines, "the dropdown is
  wrong" is now a fact rather than an investigation: one says what was sent, the other what was displayed.

Suite **3738** passed / 0 failed.

## [0.9.31] - 2026-09-15 · *a queue is not a contract*

### Fixed

- **The load result now carries the panel state with it.** Reported as *"the picker reverts to 'Let the server
  decide…' instead of showing the selected model with a Loaded marker"* after loading a built-in model from the
  ⚙ panel — while the extension's log, the settings and a running runtime all said the load had worked. The state
  was sent as a **separate message after** the outcome, and `postMessage` is allowed to resolve `false` when it
  cannot deliver: the panel then shows the outcome while keeping a picker from before the load. Both `aiResult`
  messages (load and unload) now include the fresh state, and the webview applies whatever came with the outcome.
  The separate `aiState` message and the webview's own re-request stay — three ways to be told, one of which must
  arrive.

### Added

- **`logs/ai.log` now records what the panel was told and what it saved**:
  `Load finished (ok) — panel state: backend=bundled selection=bundled:qwen2.5-coder-3b-q4` and
  `Panel save: value=… kind=… enabled=…`. A Save writes whatever the dropdown shows at that moment, and saving
  *"Let the server decide"* is the only thing that produces the combination found on this machine
  (`backend: external`, `model: ''`, and a `modelPath` still pointing at the built-in model) — so the next report
  is one log read instead of a hunt.

Suite **3730** passed / 0 failed.

## [0.9.30] - 2026-09-15 · *the panel was never told when the palette changed the model*

### Fixed

- **Every path that changes the model now tells an open designer panel.** The panel was refreshed by its own
  Load/Unload buttons and by a chat request, but **not** by the command palette — and the two early-returning
  branches there (`setupBundledModel`, the custom-address path) skipped it as well. Loading a model from
  `AI: Set Up Local Model…` therefore left the panel showing its last state: the dropdown on *"Let the server
  decide — …"* and the status box naming a model that was no longer in use, while the built-in runtime answered
  happily in the background (reported 2026-09-15). All four paths now call one shared `refreshPanels()`, which
  sends both the state and the status — the same rule `wireSettings` already followed for the settings
  themselves: one implementation, so the two front doors cannot disagree.
- **A background status refresh no longer pops the status box open.** It updates the text and leaves the box as
  it was: opening it is the user's action, and a box that appears by itself reads as a fault rather than as news.

Suite **3727** passed / 0 failed.

## [0.9.29] - 2026-09-15 · *where each entry comes from, and what Load does with it*

### Changed

- **Every picker entry now says what it is and what pressing Load will do with it**, because the question
  *"why do models that are not in My Models not work in the extension?"* had no answer on screen. This is not a
  limitation of the extension but of the arrangement: for an LM Studio entry the **extension is a remote
  control** — it runs `lms load <key>` and LM Studio does the loading, so the model must be a key LM Studio
  knows. Entries now read:
  - `LM Studio · in My Models, ready to load` — and `lms ls`, which the picker is built from, *is* the library
    that My Models shows;
  - `Found on this machine · <folder> · added to LM Studio first (a symbolic link — your file stays where it
    is)` for a file the scan found outside LM Studio, which is the path that makes such a model loadable;
  - `… · served by the extension's own runtime (no LM Studio needed)` for the same file when LM Studio is not
    installed at all.

Suite **3724** passed / 0 failed.

## [0.9.28] - 2026-09-15 · *the GPU backend died, and LM Studio said "engine protocol runtime"*

### Fixed

- **The Vulkan abort now reads like a sentence.** Reported after the 17.7 GB model failed with LM Studio's own
  jargon: *"Engine protocol runtime llama-server for IIp2SC3AkLn3tLrVP+4IIbOg exited before becoming healthy.
  exitCode=null, signal=SIGABRT"*. Its log holds the reason — `radv/amdgpu: Not enough memory for command
  submission` → `ggml_vulkan: device lost on Vulkan0` → `vk::DeviceLostError` → SIGABRT — and it happened at
  **0 % offload**, because LM Studio was running its **Vulkan** build of llama.cpp (`lms runtime ls` marks it
  selected) and an integrated GPU shares system memory with the model itself: the 27B already occupies ~16.5 GB
  of the same 28 GB the Radeon 760M advertises 11.4 GiB from. The panel now says so and names the way out
  (select a CPU-only engine, or load a smaller model) instead of passing the jargon through.
- **The `lms` command line is logged when a load fails, not only when it succeeds.** This was the third report
  that needed the argv reconstructed by hand from the compiled code, because the log recorded the model key
  and nothing else.

Suite **3721** passed / 0 failed.

## [0.9.27] - 2026-09-15 · *the load that the kernel refused*

### Fixed

- **The `mlock` failure now says who owns the setting, with both ways out.** Reported after the 17.7 GB model
  aborted with *"LM Studio tried to lock the model in RAM (…)"*. Verified at the source on this machine:
  `google/gemma-4-e4b` carries **its own** load config with `llm.load.llama.keepModelInMemory: false` — which
  is exactly why it loads — while `qwen3.8-27b` has no per-model config, takes LM Studio's default, is started
  with `--mlock`, and aborts three times in four seconds (`GGML_ASSERT(addr) failed` in `llama_mlock::grow_to`).
  `lms load` has no flag for it, and `--yes` (0.9.26) cannot answer a kernel refusal. The message now says the
  setting is **LM Studio's, not this extension's**, names where to turn it off (the model's load settings,
  Advanced), and mentions the system-wide alternative — with the caveat that locking 17 GB of a 28 GB machine
  means the weights can never be swapped out.

Suite **3717** passed / 0 failed.

## [0.9.26] - 2026-09-15 · *a load that waits for an answer nobody can give*

### Fixed

- **`lms load` now passes `--yes`.** It never did, while `lms import` always had. The CLI prompts before loading
  a model that reaches LM Studio's resource guardrails — precisely the models people try when they want more
  than the small one (the 17.7 GB class on a 28 GB machine) — and the load runs **without a terminal**, so a
  prompt has nobody to answer it: the child would wait until its 30-minute timeout while the panel showed
  nothing but "loading…". Pressing **Load Model** *is* the approval, so the flag belongs in every load. It is
  asserted in the argv tests, and a confirmation prompt that somehow still reaches us is now named in the
  failure text (`LM Studio asked for confirmation before loading this model …`) instead of being silence.
- The guardrail explanation points at the way out: `lms load <model> --yes` in a terminal, or a higher limit in
  LM Studio → Settings → Hardware.

Suite **3715** passed / 0 failed.

## [0.9.25] - 2026-09-15 · *the model is freed when the session ends, and the panel stops guessing*

### Added

- **Models are unloaded when the IDE closes.** Requested as *"when closing the IDE after a coding session,
  the model in use must be unloaded to free memory"*. `deactivate` now frees both runtimes: LM Studio's
  server gets `lms unload --all`, and the extension's own sidecar process is stopped. The unload is spawned
  **detached**, because freeing several gigabytes outlives the moment VS Code allows `deactivate` — a child
  that outlives the extension host is what makes the memory actually free. Nothing is spawned when nothing
  is loaded, and the state is re-read on the next start, so the panel shows "no models loaded" again.
- **The built-in entries say whether their weights are on this machine**: *weights on disk, ready to load*,
  *a partial download is on disk — Load Model resumes it*, or *not downloaded yet — 4.4 GB to fetch on the
  first load*. The old detail (*"downloaded once when you press Load Model"*) was true of every entry and
  therefore told the user nothing — a built-in model that had never been fetched looked exactly like the one
  sitting in storage (asked 2026-09-15: *"the Qwen models does not work - Not downloaded???"*). When the
  models folder was not checked, the wording stays neutral rather than claiming either way.

### Fixed

- **An open panel is refreshed after a task, and when it regains focus.** A local server loads its model
  **just-in-time** when a request arrives, so the panel could sit there showing "not in memory yet" while the
  model was answering (reported: *"as soon as a task is assigned the model is marked as loaded"*). The
  request path refreshes the panel's state afterwards — on success and on failure, since a failing request
  can have loaded the model too — and the webview re-asks for the state whenever the window regains focus
  while the panel is open (a closed panel stays quiet).
- **`lms` loads are logged with their full command line and outcome.** For LM Studio loads the AI log had
  only *"Load requested: …"*, so "it does not work" could not be diagnosed from the extension's side even
  when the server had loaded the model perfectly. The whole `lms …` line is now recorded on success.

### Tests

- New assertions: the four built-in entry wordings (on disk, partial, never fetched, unknown), the shutdown
  unload (async `deactivate`, detached spawn, nothing spawned when nothing is loaded, an unknown state never
  treated as "nothing to do"), the refresh after a request, and the focus re-ask.

Suite **3713** passed / 0 failed.

## [0.9.24] - 2026-09-15 · *unloading a model left the panel saying it was still loaded*

### Fixed

- **Unloading did not refresh the panel.** The `● loaded` tag and the *"N model(s) in memory right now"*
  hint come from discovery, so they only clear when a fresh state arrives — and nothing asked for one after
  an unload (reported: *"the model is unloaded … but the picker is not updated"*). The unload handler now
  posts the state on both its normal and its failing path, and the webview asks for one itself once an
  unload is confirmed, exactly as it already did for a load.
- **The status report never said what was in memory, so an unloaded model still looked loaded.**
  `Model: google/gemma-4-e4b (asked for by name)` describes the *next* request, not *this moment*, and with
  only that line the report was ambiguous in the way the user noticed (*"the status check still shows that
  model as being loaded"*). A `Loaded now:` line now sits directly under it, built from the server itself:
  `Loaded now: nothing — the next request loads gemma-4-e4b first.` It is **omitted** when no source can
  answer (a foreign server, an unparsed `lms ps` table) rather than claiming nothing is loaded, because that
  claim is the one a developer acts on.
- **`/loaded/i` was still live in the load-confirmation loop.** LM Studio's *unloaded* state is the string
  `not-loaded`, which contains `loaded`, so the wait-for-the-API loop could break on its first pass while
  nothing was in memory. Same defect as 0.9.22's tag bug, in the one place it had been missed.
- Unload now shares Load's busy state and "no answer yet" note, and that note is cleared when the action
  ends instead of being able to appear after it.

### Tests

- New assertions: the `Loaded now:` wording across all its branches (nothing pinned, one loaded, several
  loaded, a pin that does not match, a qualified pin matching a short running id, the bundled backend),
  the unload handler refreshing the state on both paths, the webview re-requesting it after a confirmed
  unload, and `loadedNow()` reporting "unknown" instead of "nothing" when it cannot tell.

## [0.9.23] - 2026-09-15 · *the picker named a model that was not the one in use*

### Fixed

- **The model picker could display a different entry than the model actually in use.** Reported as
  *"the model picker still shows 'Let the server decide…', not the picked model"* after a built-in 3B load
  that had in fact succeeded (the log line, the settings and a running runtime all agreed). The values are
  opaque strings — the webview never mapped them to indices, so this was not the off-by-one it looked like.
  The real hazard is that a `<select>` handed a value it does not know **silently keeps what it had**, which
  is indistinguishable from an indexing bug on screen. The panel now checks the round trip after assigning,
  falls back to the entry's real index if it can find it, and otherwise says so in the progress line rather
  than showing another model's name as though it were the selection.
- **A confirmed load asks for the state once more.** The state posted as part of a load is the right one, but
  if that message is lost — a webview that was not ready yet, a second designer tab — the picker kept the old
  selection indefinitely. A successful `aiLoad` result now re-requests it, so the panel cannot stay stale.
- **The option hints can no longer abort the whole state application.** `applyKindToOptions` wrote into
  `.ai-hint` spans directly; a missing span threw, and everything after it in `fillAi` was skipped.

### Tests

- **The webview suite had been hiding an uncaught exception since 0.9.16.** The jsdom fixture built the
  option rows as empty divs while the real markup carries a `.ai-hint` span inside them, so every `aiState`
  message threw `TypeError: Cannot set properties of null` — jsdom logged it as uncaught and the rest of the
  state application was quietly skipped. The rows now carry their hint spans in the fixture.
- New assertions: the picker shows the selection the extension sent (index 3, not the first entry), a
  selection with no matching entry is reported instead of swapped, a confirmed load re-requests the state
  while a failed one does not, and the per-runtime hints are reworded for bundled vs LM Studio.

## [0.9.22] - 2026-09-15 · *every model said "loaded", and "never" was an invalid command*

### Fixed

- **Every LM Studio model was tagged `● loaded`.** The check was `/loaded/i.test(state)` and LM Studio's
  *unloaded* state is the string `not-loaded` — which contains `loaded`. The tag was therefore true for the
  whole list (reported 2026-09-15: *"how is it possible to have more than 1 model tagged 'Loaded'?"*).
  A single `isModelLoaded()` now compares the state exactly, and both `discover()` and the picker use it.
- **Loading a model failed with `--ttl 0`.** "never — keep it loaded" was passed to `lms load` as
  `--ttl 0`, and the CLI rejects it: *option '--ttl <seconds>' argument '0' is invalid. Number out of range,
  must be at least 1*. The load failed, so the model was never pinned and the picker never moved — which is
  the reported *"the selected model in the modelpicker does not update and the model is not pinned"*
  (the same failure, seen from the other end). `buildLoadArgs` now **omits the flag** when there is no timer,
  and `resolveLoadOptions` keeps `0` as the user's choice while `-1`/junk still fall back to the
  recommendation.
- **A load could succeed without the panel showing it.** For a bundled model the pin lives in `modelPath`,
  not in `model`, so a successful load looked like nothing had happened. The picker now says what is pinned
  in words under the dropdown — *"Pinned: … — serving requests on …"*, *"… the built-in runtime is not
  running; the next request starts it"*, or *"Not pinned, and nothing is loaded on … — a request will fail
  until something is loaded"* — and a bundled entry that is pinned but idle reads `● pinned, runtime
  stopped` instead of nothing.

### Tests

- `tests/t2-logic/aiPanel.test.js` gains a truth table for `isModelLoaded` (`'loaded'` only, not
  `'not-loaded'`/`'Not-Loaded'`/`'unloaded'`/`'loading'`), a check that an empty `loaded` list produces
  **zero** `● loaded` markers while a live one produces exactly the loaded entries, the exact argv for "no
  timer" (`--ttl` absent), and a loop over `0 / -1 / NaN / 3600 / 1` proving no resolved request can emit an
  out-of-range `--ttl`. Suite **3665 passed / 0 failed**.

## [0.9.21] - 2026-09-15 · *the selected model has to be able to answer*

### Fixed

- **A load is only "Loaded" once it has answered.** The LM Studio path reported success when `lms load`
  exited 0; the bundled path has always proven itself with a one-line round trip. That difference is how the
  panel could say *on* while the wire said `HTTP 400 No models loaded` (found while verifying the selection
  against a real app, 2026-09-15). Both paths now run the same test request, and a failure is reported with
  the reason instead of a green tick.
- **The dropdown no longer claims a model is selected when the server is free to choose.** With `model`
  empty — the state the settings most often hold — the panel showed the *first* LM Studio model as if it had
  been picked, and pressing Save then pinned a model nobody chose. There is now an explicit first entry,
  **"Let the server decide — whatever it has loaded"**, which is what the settings actually say, and Save
  keeps `model` empty for it.
- **Choosing it checks the server rather than assuming**: it asks which models the endpoint offers, reports
  how many and warns when nothing is loaded, instead of leaving "on" pointing at an empty server.

### Tests

- `tests/t2-logic/aiPanel.test.js` pins the new entry, the fallback for a model that has vanished from disk
  (it must not silently select the first one), and that an off switch still starts from a sensible value.
  Suite **3645 passed / 0 failed**.
## [0.9.20] - 2026-09-15 · *Load Model works, and Save stops flickering*

### Fixed

- **`Load Model` did nothing on every runtime, and this was the cause.** The panel's webview sent a **flat**
  request (`{contextLength, gpu, ttlSeconds, …}`) while the extension read `state.options.contextLength` —
  so the handler threw `Cannot read properties of undefined (reading 'contextLength')` *before* it could
  post a single message. That is what "downloading (first time)… nothing further happens" always was:
  0.9.19's reporting is what finally surfaced the message.
- **A load's arguments are now resolved before they become a command line.** The controls can say "you
  decide" in three ways (context `0`, GPU `auto`, timer `-1`) and passing those through produced
  `--gpu auto` and `--ttl -1`, which LM Studio rejects. `resolveLoadOptions()` turns them into real values
  from this machine, and the suite pins it — including `0` for the timer meaning "keep it loaded" rather
  than "missing".
- **Save no longer closes and reopens the panel.** The extension answers a save with the same
  `codeSettings` message it uses to fill the panel, and filling used to *open* it whenever it was closed —
  so the panel came straight back. Opening is now tied to the ⚙ Settings button (`settingsPending`), which
  is the only thing that may show it.

### Tests

- New `tests/t2-logic/panelContract.test.js` (25 assertions) compares the webview's payload with the
  extension's type **field by field**, names the exact field that threw, and pins `resolveLoadOptions`.
  The mismatch that broke Load Model for four releases could not have survived it. The T3 webview suite
  also asserts that a save echo leaves the modal closed. Suite **3643 passed / 0 failed**.
## [0.9.19] - 2026-09-15 · *a load can no longer fail in silence*

### Fixed

- **"Downloading is not starting … nothing further happens" is now impossible.** The panel's `aiLoad`
  handler awaited the load with no `try/catch`, so any thrown error inside it (a failed download, a build
  error, the 60-second start handshake timing out) vanished: the panel's own line kept promising a download
  while the extension had already given up. Every exit now reports to the panel and is logged.
- **The panel no longer claims a download is starting when the weights are already on disk.** The webview
  guessed the message; the extension now says what is happening — *"…is already on disk — starting the
  built-in runtime (its first build downloads the inference library, which can take a few minutes)…"* —
  and only mentions downloading when it is really downloading. That guess is what sent the user looking for
  a download that never began.
- **A failure is shown where the user is looking.** It lands in the panel's progress line (and stays there),
  not only in the designer's status bar at the bottom of the window.
- **Long steps show that they are alive**: the progress line repeats with the seconds spent
  (`… (45 s)`), so a slow first build cannot be mistaken for a dead one.
- **If the extension reports nothing at all, the panel says that too** (*"the extension has not reported
  back yet"* after 10 s), which separates "the extension is silent" from "the extension is working".

### Added

- **`logs/ai.log` in the extension's storage** (`~/.config/Code/User/globalStorage/grumpy.avalonia-designer/logs/ai.log`),
  written by every AI load step and failure with timestamps. The Output channel cannot be handed over when
  a bug only reproduces on someone else's machine; a file can.
- Unload and the status check are wrapped the same way, so no AI action can fail without a message.

### Tests

- `tests/t2-logic/aiPanel.test.js` grew to 88 assertions with a **never-silent** section: the handler
  catches and reports, the webview puts failures in the progress line, the elapsed ticker and the
  "already on disk" wording exist, and the log file is written. Suite **3616 passed / 0 failed**.
## [0.9.18] - 2026-09-15 · *downloads resume, and say how far they have got*

### Added

- **Downloads resume.** A 2.1 GB or 4.7 GB model that loses its connection at 90% now continues from where
  it stopped (an HTTP `Range` request onto the existing `.part` file) instead of starting again. A partial
  file *larger* than the model is discarded rather than appended to, a server that ignores `Range` (and
  answers 200 with the whole file) cannot duplicate the first half, and a `416` (our partial is past what
  the server has) restarts cleanly. A checksum mismatch still deletes the file, because everything after a
  bad byte is suspect.
- **The download reports bytes of bytes, live**: `1.2 GB of 4.7 GB · 26% · 12.4 MB/s`, ending at
  `100%` — the last line used to be whatever the throttled update happened to say, which looked like a
  stalled download while the checksum ran.
- **An `http://` model address works.** "Paste the address of one" handed every URL to `https.get`, so a
  model served over plain HTTP failed with a TLS error that said nothing about the real problem.

### Changed

- **The load options now reach the built-in runtime too.** Context length becomes `--ctx` and the GPU field
  becomes `--gpu-layers` (LM Studio takes a GPU *ratio*, llama.cpp takes a *layer count*: `max` = all
  layers, anything else = CPU, because a shared-memory GPU is slower for big models and half of an unknown
  layer count is not a number of layers). Before this, both fields were shown for bundled models and
  silently ignored.
- **Rows that cannot be honoured are hidden instead of shown and ignored**: *Unload when idle* disappears
  for the built-in runtime (it has no idle-unload concept), and *Address* only appears for "a server I run
  myself".
- The dropdown says when a download happens: "This extension's own runtime — **downloaded once when you
  press Load Model**, then local". "download once" in the label was read as "this downloads now" (the user
  asked), which is exactly the kind of ambiguity a label should not have.

### Fixed

- **`.ai-opt[hidden]` did nothing.** An author `display` beats the UA stylesheet's `[hidden] { display: none }`
  regardless of specificity, so the row-hiding above had no effect until the rule existed — caught by
  rendering the panel in Chromium. (The same trap is why `.modal[hidden]` exists.)

### Tests

- New `tests/t2-logic/modelDownload.test.js` (53 assertions) drives the **real** download function against a
  **real local HTTP server**: a truncated first attempt, the `Range` request it then sends, byte-identical
  output, a server that ignores ranges, and a 416 restart. Suite **3603 passed / 0 failed**.
## [0.9.17] - 2026-09-15 · *the Settings panel fits on screen*

### Fixed

- **The ⚙ Settings panel no longer loses its top and bottom.** Reported by the user as "the shape of the
  settings panel currently hides the top and bottom items". Measured in Chromium with the real CSS and
  markup: the box was **340 × 1553 px**, and since a modal is centred with nothing scrolling, at 1024×700
  the title sat **426 px above** the viewport and Cancel/Save **1127 px below** it.
- **Every modal is now capped to the window and scrolls inside itself**
  (`max-height: calc(100vh - 28px); overflow-y: auto`). The AI section made this panel the first one tall
  enough to notice, but a long list of code-check findings could have done the same to the old panel.
- **The panel is wider** — 560 px instead of 340 px — **scoped to this panel only** (`#settingsModal`),
  because eight other small dialogs share `.modal-narrow`.
- **Cancel/Save stay pinned** to the bottom of the panel while the rest scrolls, so the last thing the user
  has to press is never off-screen.
- **The option values are no longer truncated.** A `<select>` spends ~18 px on its arrow, so in a 120 px
  column "recommended for this machine (off)" needed 199 px and rendered as "recommended for [truncated]".
  The value column is 175 px now and the labels are shorter ("recommended (off)", "max — all on GPU").

### Tests

- `tests/t2-logic/aiPanel.test.js` grew to 74 assertions with a **layout regression guard**: jsdom has no
  layout engine (which is why this was invisible to the suite), so the declarations that make it fit are
  asserted instead — the height cap, the internal scroll, the scoped width, the pinned action row, a value
  column of at least 160 px, and the absence of the three labels that were too wide for the field. Suite
  **3547 passed / 0 failed**.
## [0.9.16] - 2026-09-15 · *the AI switch lives in the designer's Settings panel*

### Added

- **An AI assist section in the designer's ⚙ Settings panel** (the toolbar button), so setting it up no
  longer means knowing about commands, ports or model ids:
  1. **On/off switch** — off makes every AI command unavailable (a context key gates the menu entries) and
     **unloads the model**, because leaving 17 GB resident after choosing "no AI" would be a strange
     machine to hand back.
  2. **A model dropdown** listing every chat model LM Studio has on disk (with the loaded one marked),
     both downloadable models, **every `.gguf` found on this machine**, and "a server I run myself".
  3. **The load settings appear once a model is chosen** — context length, GPU offload and idle-unload -
     plus the answer budget (`maxTokens`) and the timeout.
  4. **Load Model** — frees what is in memory first, pre-flights the memory cost, loads with the values
     shown, wires `backend`/`endpoint`/`model`, and then runs the status check.
  5. **Status & hardware check** shows the *same* report the palette command shows (one implementation).
  6. **Save** stores everything and closes; the designer is ready.
- **Scan machine for models…** — a bounded walk of `~`, `~/Downloads`, `~/models`, `~/llama.cpp`,
  `~/.cache/huggingface`, `/media` and `/mnt` (depth-limited, >100 MB, 12 s budget, progress shown). It
  **filters out `mmproj-*.gguf`** — the vision projectors that sit beside the weights and cannot answer a
  chat request — and skips files already inside LM Studio's folder, which `lms ls` already lists.
- **A discovered file just works.** A `.gguf` outside LM Studio's folder is imported with
  `lms import --symbolic-link` (the documented flags omit this: with no flag at all, `lms import` **moves**
  your file), and with no LM Studio installed it is handed to the extension's own runtime instead.
- **Three new settings** (`loadContextLength`, `loadGpu`, `loadTtlSeconds`) so the panel's choices persist;
  `0`/`auto`/`-1` mean "recommend one from this machine".

### Changed

- **Switching models unloads the previous one.** Reported by the user: selecting a new model used to leave
  the old one in memory. `lms unload --all` now runs before every load (`localModelCore.load`).
- **The model layer was split in two** — `localModelCore.ts` (discovery, load, unload, status, scan,
  import; no UI) and the two front doors that ask the questions: the Command Palette flows
  (`localModelSetup.ts`) and this panel (`aiPanel.ts`). Both call the same operations, so they cannot
  drift apart, and `assistantUi.statusLines()` is now shared with the panel for the same reason.
- `AI: Choose a Local Model…` and `AI: Unload the Loaded Model` stay in the palette (the user's choice:
  "keep both").

### Tests

- New `tests/t2-logic/aiPanel.test.js` (65 assertions) — the dropdown contract, the choice-value round
  trip (a model key contains a slash, an address contains a colon), the four groups in the list, and a
  **real scan of a temporary directory tree** containing a 120 MB sparse `.gguf`, an `mmproj` projector
  and a 4-byte blob: only the weights may come back. Suite **3539 passed / 0 failed**.
## [0.9.15] - 2026-09-15 · *models that think before they answer*

### Fixed

- **A thinking model no longer looks like a broken one.** Reasoning models (Qwen3.5, DeepSeek-R1, …) put
  their chain of thought in `reasoning_content` and only then write the answer. The extension read
  `content` alone, so when the thinking used up the token budget it showed **nothing**: the raw-answer tab
  said "0 characters", which explains nothing to anyone. Measured here with `qwen/qwen3.5-9b`: **837
  reasoning tokens** (3 186 characters) were spent before a 71-character answer, and with the old
  900-token budget the answer was `finish_reason: length` with empty content.
- The thinking is now read (`reasoning_content`, or `reasoning` as llama.cpp and vLLM spell it), shown as
  *"the model is thinking… (N characters so far)"* while it works, logged, and included in the
  raw-answer tab — so an empty answer always arrives with its explanation.
- An empty answer is explained with the numbers instead of a shrug: *"it wrote 3 186 characters of
  reasoning — 837 tokens — and then ran out of budget before writing any code"*, plus the setting to
  change. `finish_reason` is reported too, which separates "budget too small" from "rambled".

### Changed

- **The default `avaloniaDesigner.assistant.maxTokens` is 4096, not 900.** 900 was less than this model's
  thinking; nothing else changed, and a model that answers directly still stops at its own end-of-turn
  marker. The inactivity watchdog (not a total budget) means the larger ceiling costs nothing.
- The request now asks for token usage (`stream_options.include_usage`), which is what makes "837 thinking
  tokens" knowable rather than guessed.
- **AI: Choose a Local Model…** measures this during its test request: if a model thinks, it raises the
  answer budget to the working value in your settings itself and says so — "It thinks before it answers,
  so the answer budget was raised to 4096 (it spent 837 tokens thinking about a one-word reply)". Choosing
  a local model should not require knowing any of this.

### Tests

- New `tests/t2-logic/assistantThinking.test.js` (48 assertions), driven by the **captured stream** from
  the real model (120-token and 1500-token runs, both replayed). Suite **3471 passed / 0 failed**.
## [0.9.14] - 2026-09-15 · *setting up a local model is now one command*

### Added

- **AI: Choose a Local Model…** — the whole local-model setup in one command. It lists the models
  **LM Studio** already has on disk (read from LM Studio's own `lms` CLI), and picking one does
  everything: start LM Studio's server if needed, **pre-flight** the load with LM Studio's own memory
  estimate (warning *before* loading when the model does not fit in what is free), load the model with
  recommended start values, fill in `backend` / `endpoint` / `model` for you, and prove it answers with
  a one-line round trip before you touch any code.
- **Recommended start values, with reasons.** Context length, GPU offload and an idle-unload timer are
  derived from free RAM and the kernel's locked-memory limit (`/proc/self/limits` → `ulimit -l`), each
  with a one-line explanation shown before anything is loaded. **Change them…** overrides all three.
- **AI: Unload the Loaded Model** — frees the memory again when you are done (`lms unload --all`).
- **Translated load failures.** When a load aborts, LM Studio's own server log is read and translated:
  the common abort is a model larger than the kernel's locked-memory limit (LM Studio's **Keep Model in
  Memory**), and the message says so with both numbers — the lock limit and the model size. **Copy
  details** puts the log on the clipboard for anything else.
- **Two escape hatches in the same list:** *This extension's own model* (the bundled runtime, for a
  machine with no LM Studio) and *A server I run myself* (any OpenAI-compatible address — Ollama, a
  hand-built `llama-server`).

### Changed

- `avaloniaDesigner.assistant.setupModel` is retitled **AI: Choose a Local Model…**, because choosing is
  now what it does. `AI: Set Up Local Model…` still works (same command).
- The picker shows **embedding models separately** and never offers them as a chat model, using the type
  LM Studio's REST API reports rather than guessing from the name.
- The port is **read from LM Studio** (`lms server status`) instead of assuming 1234.

### Fixed

- An empty **PARAMS** column (embedding models) no longer shifts the architecture into the size column.
  Found by the new suite while writing it.

### Tests

- New `tests/t2-logic/localModels.test.js` (65 assertions) — every parser is pinned against **real
  captured `lms` output** from this machine, plus the recommendations, the exact `lms load` argv, and
  the wiring. Suite **3423 passed / 0 failed**.
## [0.9.13] - 2026-09-14 · *the Apply buttons are where you are looking*

### Added
- **The decision is now a button directly above the method** (a code lens: *✓ Apply AI change* /
  *✕ Discard*), refreshed when a proposal appears or is resolved. Reported three times in one day, the
  status bar and the diff's title bar turned out not to be enough on their own — a developer reviewing a
  change looks at the code, so that is where the buttons belong now. The status bar entry is also
  **coloured** instead of being one more grey word, and an unanswered notification leaves a line in the
  output channel saying where the buttons are.
- **The status dialog names the running version** (`extension v0.9.13`). A VSIX installed while a window
  is open changes nothing in that window until it reloads, and "did my reload take effect?" was
  otherwise guesswork.

### Fixed
- **A proposal tab left over from a previous window is closed at activation.** A proposal exists only in
  memory, so a diff pane restored by a window reload can never be applied — it is a dead pane without
  buttons, which is exactly what "there is no means to apply the diff" and "the tab opens by itself, I
  had all tabs closed" both turned out to be. Anything of ours found at startup is stale by definition.

## [0.9.12] - 2026-09-14 · *the bundled model stops repeating itself*

### Fixed
- **The bundled runtime now speaks the model's own chat template.** LLamaSharp was framing the
  conversation the Llama-2 way (`[INST] … [/INST]`), so a Qwen-style model never saw where the assistant
  turn began and answered by **repeating its first block until the token budget ran out** — the same
  prompt that LM Studio (`llama-server --jinja`) answered with one clean block came back from the bundled
  runtime as *30 copies of it, 4 049 characters, in 40 s, cut off mid-fence*. The template is read from
  the GGUF (`tokenizer.chat_template`) and the runtime stops at the family's end-of-turn marker. Measured
  after the fix: **one block, 131 characters, 3.1 s**.
- **An unfenced answer is no longer accepted as code.** A model that replied with a sentence about the
  change would have had that sentence written into the method. Unfenced text is now used only when it
  really reads like code (braces, language keywords, or an indented statement body); otherwise nothing is
  applied and the reason is stated.
- **A code block that was cut off is salvaged** instead of being thrown away, with a note saying so.
- **End-of-turn markers never reach the file** (the runtime decodes special tokens on purpose, so a
  `<|im_end|>` can appear at the end of an answer).

### Added
- **The raw answer is never thrown away when extraction fails.** It is written to the *Avalonia Designer*
  output channel and can be opened from the message as a read-only tab ("Show the raw answer"), together
  with a precise reason — empty answer, prose instead of code, or a block that never closed. The real
  failure this replaces said only "returned nothing usable", with no evidence to act on.

## [0.9.11] - 2026-09-14 · *the Apply button stops disappearing*

### Fixed
- **Applying or discarding a proposal no longer depends on catching a notification.** On the first
  successful real run the toast with *Apply*/*Discard* expired while the diff was being read, and with it
  went the only obvious way to accept the change. The decision now lives where it cannot time out: a
  **status bar** action (*Apply AI change* / *Discard*, hidden again once resolved) and two buttons in the
  **diff editor's own title bar**, both driven by a context key, so they are there for as long as the
  proposal is.
- **The diff no longer asks to be saved.** Its right-hand pane was opened as an untitled document, which
  is "unsaved" by definition — so closing it or reloading the window produced a save prompt about a pane
  that is nothing but a preview. It is served by a read-only content provider now, with no dirty state at
  all.
- **Build to verify saves your files first**, silently: a build compiles what is on disk, and a dirty
  editor would have verified something other than the change on screen.

## [0.9.10] - 2026-09-14 · *the endpoint setting shows where it points*

### Changed
- **The endpoint setting is no longer blank by default.** `avaloniaDesigner.assistant.endpoint` defaulted
  to an empty string, which *means* "use `http://127.0.0.1:1234/v1`" — correct in code, but the settings UI
  showed an empty box, so the only way to see where requests would go was to run the status command. The
  default is now the address itself (an empty value still falls back to it), and a test pins the two
  places it is written — the manifest and `DEFAULT_ENDPOINT` — to each other so they cannot drift.

## [0.9.9] - 2026-09-14 · *the status check knows what an embedding model is*

### Added
- **"Pin a model…"** in *AI: Status and Hardware Check*: when the server offers more than one chat model
  and none is chosen, the dialog now writes the choice for you (`avaloniaDesigner.assistant.model`) from a
  pick list, instead of leaving you to find the setting. **Copy** puts the whole report on the clipboard.

### Changed
- **Embedding models are no longer offered as candidates.** LM Studio lists
  `text-embedding-nomic-embed-text-v1.5` next to its chat models, and the dialog's "pick one of 3"
  invitation made it look like a valid answer — it cannot answer a chat request at all. Models that look
  like embeddings (by name: `embed`, `bge`, `gte`, `e5`) are now named in the list as
  *"(embeddings — cannot answer chat)"* and excluded from the counts, and a server offering *only*
  embeddings says exactly that. The heuristic drives a hint, never a filter, so a false positive costs a
  word.

## [0.9.8] - 2026-09-14 · *the status check names the model*

### Changed
- **AI: Status and Hardware Check now says which model will actually answer**, instead of the
  placeholder "(the server decides)" — which was accurate and useless: a server with exactly one model
  loaded makes the answer knowable, and a server with several makes it worth knowing that setting
  `avaloniaDesigner.assistant.model` is what pins one down (Ollama refuses a request that does not name
  a model). The command now probes the server first: one model → it is named; several → that is stated
  with the tip; server not answering → that is stated instead of a guess; `bundled` → the `.gguf` file it
  loads. The wording is a pure function with nine assertions in the suite.

## [0.9.7] - 2026-09-14 · *a sidebar icon you can actually see*

### Changed
- **A new Activity Bar icon, drawn for contrast.** The old one was made by scaling the coloured badge
  artwork down and clearing everything that was not the glyph, which left **no fully opaque pixel at
  all** — 5 938 semi-transparent ones — so it looked washed out and faint in the 24 px sidebar. It is
  now drawn as shapes: pure `#FFFFFF`, fully opaque, with the ring and Grumpy's face (cap, sunglasses
  and moustache as negative space) reduced to what survives at 24 px. `tools/make-activitybar-icon.py`
  regenerates it, and the test suite now decodes the PNG to assert what went unnoticed for two
  releases: white only, a solid core, a transparent background, not clipped.

### Added
- The model runtime's messages (build, model load, generation) now go to the extension's own
  **View → Output → "Avalonia Designer"** channel instead of the Extension Host log, which is where
  the rest of the designer's diagnostics already are.

## [0.9.6] - 2026-09-14 · *the AI assist brings its own model*

### Added
- **The AI assist can run its own local model — no server, no account, no Copilot required.** *AI: Set
  Up Local Model…* offers code-specialised models (Qwen2.5-Coder 3B at 2.1 GB, 7B at 4.7 GB), or a
  `.gguf` file you already have, or one you point it at by address. The download shows progress, can be
  cancelled, is verified against the publisher's SHA-256 and is stored in the extension's global
  storage — once, for all projects. *AI: Status and Hardware Check* reports the runtime, the model file
  and the server; *AI: Stop the Local Model* frees the RAM.
- **The runtime ships as source and is built on your machine.** `host/ModelHost/` is a small C# HTTP
  server that speaks the OpenAI API the client already uses, so one VSIX covers every platform and
  architecture: NuGet picks the right llama.cpp binaries for the current runtime identifier during the
  build the extension already performs for its design previewer. The bundled backend therefore needs no
  more than the .NET SDK the designer requires, and a 2 GB model never has to travel inside a VSIX.

### Changed
- **The request timeout is an inactivity budget, not a total one.** The clock restarts with every token,
  so a slow CPU writing a long method is allowed to take minutes, while a server that has stopped talking
  is caught in seconds. A total budget would have cut off exactly the slow-but-busy case this feature is
  for.

## [0.9.5] - 2026-09-14 · *the local AI assist (tier 1)*

### Added
- **✨ AI assist (tier 1) — a local model for the fixes a rule cannot express.** Two flows: *AI:
  Implement in Function…* (rewrite the method the caret is in, described in a dialog) and *✨ Fix with
  AI…* (on a finding that sits inside a method). It talks to a local OpenAI-compatible server — LM
  Studio, Ollama or `llama-server` — so nothing leaves the machine, and it is **off by default**
  (`avaloniaDesigner.assistant.*`). The proposal always opens as a **diff**; applying it is a normal
  edit (`Ctrl+Z` works) and is followed by an optional **Build to verify**. The model is asked for
  exactly one method, and the answer is parsed defensively (last fenced block, or JSON), re-indented to
  the file's own style and spliced over that method and nothing else. *AI: Status and Hardware Check*
  reports the endpoint, the reachable models and a **hardware verdict** (RAM, CPU threads, AVX2) — the
  basis for disabling the feature on a machine that cannot run a model. The bundled runtime, so users
  need no server at all, is the next tier (see `NOTES.md` §90).


## [0.9.4] - 2026-09-14 · *the `1.0.0-beta.11` build*

### Changed
- **A new icon.** The extension icon (Marketplace listing, Extensions view, README) is a new badge
  with the black background outside its blue ring removed, so it no longer reads as a black tile on a
  light page. Whitespace around the ring is transparent, the file is a 128x128 PNG (the size the
  Marketplace requires), and the manifest still names it `Grumpy.png` — same field, new artwork.
- **The Activity Bar uses a white version of the same badge.** The sidebar glyph is white ink on
  transparency, so it reads against the dark Activity Bar. Its file name is unchanged too
  (`GrumpyWhite.png`), and the artwork both icons derive from is kept in the repo but left out of the
  package.

## [0.9.3] - 2026-09-13 · *the `1.0.0-beta.10` build*

### Changed
- **The docs describe the stable releases only.** Every *Install Pre-Release Version* / `--pre-release`
  instruction was removed from `README.md`, `USER_MANUAL.md`, `CHANGELOG.md` and `PUBLISHING.md`:
  `0.9.x` ships as normal releases, so there is nothing for a user to choose between.
- **The release workflow defaults to a normal release.** Its `pre_release` input was on by default
  ("keep this on while the version is a -beta"), which would have published onto the other channel
  without anyone asking for it; ticking it is now the deliberate opt-in.

## [0.9.2] - 2026-09-13 · *the `1.0.0-beta.9` build*

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
- **Code Fix reports writing into the app's own folder.** A write next to the executable
  (`File.WriteAllText(Path.Combine(AppContext.BaseDirectory, …), …)`, a `SqliteConnection` whose
  `Data Source` points there, …) works from the IDE and fails once the app is installed, so the check
  raises a **warning** (no automatic fix — it says where the file belongs instead).

### Changed
- **Generated DataSets keep their files per user instead of next to the app.** An installed app is
  read-only: the `.deb` puts it in `/usr/lib/<pkg>` and the MSI in `Program Files`, both owned by root.
  A form whose constructor had to *create* its SQLite database there died with `SQLite error 14`
  before any window existed — and started from the application menu there is no console to show it, so
  the app simply "did not start". Relative `.db` paths, the XML stores and the remembered "Browse…"
  folder now resolve through a generated `RuntimeStorage` helper into the per-user data folder
  (`~/.local/share/<App>/` on Linux, `%LOCALAPPDATA%\<App>\` on Windows). Data an earlier build left
  beside the executable is still used when it is the only copy, so nothing is orphaned.
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
- Published on the Marketplace as a normal release — the uploaded file was the plain
  `avalonia-designer-0.9.1.vsix` (verified: the gallery's `VsixSha256` matches it byte for byte).

## [0.9.0] - 2026-09-12 · *the `1.0.0-beta.7` build*

### Added
- **First Visual Studio Marketplace listing** — published at
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
