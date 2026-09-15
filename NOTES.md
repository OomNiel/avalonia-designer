# Avalonia Designer for VS Code — Developer Notes (lean)

> Lean quick-reference for continuing development.
> **Archives (read-only reference):**
> - `NOTES_ARCHIVE.md` — the original 51 NOTES sections, verbatim.
> - `NOTES_2026-09-03.md` — the 2026-08-31 → 2026-09-03 dev log (§52–§69 write-ups + the full
>   one-line feature-history table).
> - `NOTES_MEMORY_2026-09-03.md` — the 2026-08-25 → 2026-09-03 Copilot repo-memory log (2,530 lines).
>
> New feature write-ups grow here and get archived again when this file fattens. User docs:
> `README.md`, `USER_MANUAL.md`, `CONTROLS.md`. The Copilot **repo memory**
> (`/memories/repo/avalonia-designer-extension.md`) auto-loads each session with the curated gotchas.

---

## 1. Build & run

```bash
npm install                       # ws, @xmldom/xmldom, typescript
npm run compile                   # tsc → out/
dotnet build host/PreviewerHost.csproj -c Debug   # → host/bin/Debug/net8.0/PreviewerHost
```

- Press **F5** (`.vscode/launch.json` → preLaunchTask `build: all` = host + npm compile).
- The host **auto-builds on first designer open** when the binary is missing or any `host/*.cs` is newer.
- The host is a persistent child process on a free port (`PreviewerHost --port <n>`); killed on `deactivate()`.

### Packaging / installing
```bash
npm run package                                              # vsce package (pinned @vscode/vsce@2.15.0)
code --install-extension avalonia-designer-0.9.4.vsix --force
npm run publish:stable                                       # Marketplace publish (needs VSCE_PAT)
```
- `activationEvents` is **`[]`** (empty): contributed commands/views/custom editors activate the
  extension on demand. Listing `onStartupFinished` made it load for every user at every window start.
- The `.vsix` does **NOT** bundle the compiled host (only `host/*.cs`, `resources/*.cs` + the
  `.csproj`) — the installed copy auto-builds it.
- `.vscodeignore` (NOT `.gitignore`) controls packaging; dev docs (`NOTES*.md`/`SESSION.md`),
  `tests/**`, `.poolside/**`, `tsconfig.json`, unused artwork and the source maps are excluded
  (**89 files / 606 KB**).
- **vsce is NOT gitignore** (verified in its `collectFiles()`): a negated pattern (`!x`) wins over
  EVERY ignore pattern wherever it sits, and folder patterns are auto-expanded (`foo` → `foo/**`).
  The old `!out/**` therefore re-included all 24 source maps no matter how they were excluded —
  negate narrowly (`!out/**/*.js`) and check with `npx vsce ls | grep -c '\.map$'` (must be 0).
- CI: `.github/workflows/ci.yml` (tsc + T2 + T3 + `vsce package` on every push; the T0–T5 suite is a
  manual job because it needs the .NET SDK and native libs) and `.github/workflows/release.yml`
  (manual, full suite → package → publish, dry-run by default, `VSCE_PAT` from the repo secrets).
- A **missing .NET SDK** is reported by name (with the download link) instead of `spawn dotnet ENOENT`
  — see `DOTNET_SDK_MISSING_MESSAGE` in `src/hostClient.ts`.
- **Every extension change needs a VS Code window reload.** After a version change make sure no stale
  higher-semver copy lingers in `~/.vscode/extensions/` — it shadows the newly installed one.

### Automated test suite (repo root)
```bash
npm test                  # full suite (all layers incl. slow T0 10-project build matrix)
npm run test:fast         # T2 logic only    npm run test:webview   # T3 jsdom
npm run test:build        # T0 build layer   npm run test:preview   # T1 host
npm run test:runtime      # T4 headless      node tests/runner.js --file <name>  # single file
```
- Discovers `tests/**/*.test.js`; writes `tests/out/log.jsonl` + `report.md`; exit ≠ 0 on any FAIL.
- The vscode stub lives in `tests/stubs/vscode` (NOT `node_modules` — `npm install` prunes it).
- **Current: 3748 passed, 0 failed / 0 skipped** (2026-09-15, ~38 s). Layer map: `TEST_PLAN.md` §2;
  per-release coverage notes: `TEST_PLAN.md` §10.

### Temporary headless UI smoke test (NOT in `npm test`)
- **`node tests/smoke/smoke.js`** — an explicit user-approved exception to the "no automated app runs"
  rule (granted 2026-09-06). It scaffolds a real C# blank app (SmokeApp) with a bound DataGrid +
  SQLite DataSet, then drives the REAL MainWindow on **Avalonia.Headless**: opens the app's "+ Add row"
  modal dialog, types dummy values, confirms, kills the process, and a FRESH process verifies the grid
  is populated from the .db (persistence across restart). Then it removes the dataset + its db, adds a
  NEW dataset bound to the same grid, and re-runs both stages. Stages: `seed1/verify1` (SmokeData.
  Customers→smoke.db) and `seed2/verify2` (Books.Items→books.db).
- Harness driver = `tests/smoke/Program.cs.tpl` (tokens {NS}/{DS}/{ADD}/{ROW}/{TEXT}/{TEXT_COLS});
  orchestrator `tests/smoke/smoke.js`. Artifacts in **`tests/out/smoke`** — TEMPORARY, delete when done
  (re-run to recreate). Gotchas: the harness output dir (where the relative `.db` lives next to the
  exe) must NOT be wiped between seed→verify, or the persisted data vanishes (that's exactly why the
  folder is only mkdir'd, never rm-rf'd). The generated dataset code needs the SQLite NuGet packages
  added to the app csproj (SmokeApp uses SmokeData.cs with DatabaseAdapter/EnsureColumns).
- `npm test` must STAY green after smoke (smoke isn't auto-discovered — folder is `tests/smoke`, not a
  `t?-*` layer; keep it that way).

---

## 2. Project structure (current)

```
├── src/
│   ├── extension.ts          activation, commands, host lifecycle, new-project tools
│   ├── designerPanel.ts      CustomEditorProvider<DesignerDocument> + webview host + undo/redo
│   ├── xamlModel.ts          .axaml DOM model: parse/edit/serialize, add/move/resize, grid defs
│   ├── propertyCatalog.ts    per-control property defs + KEY_DEFAULTS (verified vs real assemblies)
│   ├── codeBehind.ts         event wiring, handler insert, asset/DataSet ItemsSource binding, VB accessors
│   ├── assetCatalog.ts       scans .cs/.vb/.adset for bindable collections (ItemsSource picker)
│   ├── dataSetEditor.ts / dataSetModel.ts / dataSetGenerator.ts   .adset designer + C#/VB/XSD codegen
│   ├── dataSetReader.ts      one validated `.adset` read (walk + strict parse), cached per project folder
│   ├── controlInfo.ts        plain-language {label, desc, use} per control (help panel + tooltips)
│   ├── toolboxProvider.ts    sidebar Toolbox TreeView (drag + click-to-arm)
│   ├── formTemplates.ts / newForm.ts / projectScaffold.ts / projectCreator.ts / projectView.ts
│   ├── projectParser.ts      detects C# vs VB.NET from nearest .csproj/.vbproj
│   ├── hostClient.ts         WebSocket client + PreviewerHostManager
│   └── logger.ts             Output channel "Avalonia Designer" (reliable diagnostics)
├── host/                     C# Previewer Host (net8.0, Avalonia 12.1.1)
│   ├── Program.cs            HttpListener WebSocket server (sync serve on main thread)
│   ├── XamlRenderer.cs       XAML → PNG + control bounds (+ gridCells) — 3 load strategies
│   └── ControlFactory.cs     default XAML snippets + control type map
├── resources/                ChromeWindow.cs/.vb + AnchorHelper.cs/.vb (bundled into new projects)
├── media/                    designer.{css,js}, dataSet.{css,js}, *.svg
├── tests/                    automated suite (runner.js, helpers/, t0–t5 layers)
└── package.json · tsconfig.json · .vscode/ · README.md · USER_MANUAL.md · CONTROLS.md · TEST_PLAN.md
    · NOTES_ARCHIVE.md · NOTES_2026-09-03.md · NOTES_MEMORY_2026-09-03.md
```

---

## 3. Architecture & data flow

```
Toolbox (TreeView) ──click-to-arm / click-canvas-to-place──▶ Webview canvas (custom editor for *.axaml)
        (drag-drop also supported; on Linux/Xorg the click-to-place path is the reliable one)
        webview ──postMessage──▶ extension host (TS) ──WebSocket JSON──▶ PreviewerHost (C#, headless)
        host replies: PNG base64 + controls[{name,type,x,y,width,height,parent,values}] + gridCells
```

**Host WS messages (JSON, camelCase replies, `id` echoed):** `hello`→`helloAck`, `ping`→`pong`,
`snippet {tag}`→`snippetResult`, `render {xaml,width,height,projectPath}`→`frame {png,controls[],gridCells}`,
`fonts`→`fontsResult {fonts[]}` (system families via `FontManager.Current.SystemFonts`).

**Webview ↔ extension:** ext→webview `frame/properties/status/selectControl/armTool/clipboard/dotGrid/crosshair/fonts`;
webview→ext `ready/select/deselect/setProperty/drop/move/resize/delete/openEvent/cut/copy/paste/
moveToContainer/saveItems/saveGridDefs/moveToCell/browseFile/pickItemsSource/setDotGrid/setCrosshair/undo/redo/requestFonts`.

**Behaviour notes:**
- Designer is **opt-in**: `.axaml` opens in the text editor; right-click → **Avalonia: Open in Designer**.
- **Auto-wire on placement:** dropping an interactive control inserts its default event handler + code-behind stub.
- **Middle-click** a control → opens its code-behind handler (quick-jump). Arm-tool: click toolbox item, click canvas, Esc cancels.
- **Grid:** dropping onto a Grid auto-places the child in the next free cell; dragging a Grid child re-cells it.
- The form (Window root, unnamed) is selectable via the drop-down's first entry **"Form - <Title>"** or clicking empty space.

---

## 4. Key technical decisions & gotchas (IMPORTANT)

1. **No public string XAML loader in the headless host** (true on both Avalonia 11.0.10 and the
   current 12.1.1 — no XamlIl runtime loader is registered). `XamlRenderer` tries 3 strategies
   (reflection `IRuntimeXamlLoader`; temp-file loader; programmatic builder). The runtime loader
   fails broadly, so the programmatic builder must handle grids, `<ListBox.Styles>`, images and the
   chrome title bar faithfully.
2. **Namespaces:** `UseHeadless` + options are in `Avalonia.Headless`; `UseSkia()` from `Avalonia.Skia`.
3. **Do NOT use `CaptureRenderedFrame`** — render with `RenderTargetBitmap` + `rtb.Render(window)`.
4. **Headless window is stuck at 1024×768** — force the design size via reflection on `TopLevel.ClientSize`.
5. **Control identity is by NAME** (`XamlModel.ensureNames()` auto-names `_TagN` before render; save strips them).
6. **`serialize(forSave)`:** `false` (render) STRIPS event attrs; `true` (save/undo) keeps them.
7. **`DataGrid` type** is in `Avalonia.Controls` (separate `Avalonia.Controls.DataGrid` assembly); snippet uses
   `dg:` prefix + root `xmlns:dg`. Generated projects + host include its Fluent StyleInclude; grids need
   `AutoGenerateColumns="True"`.
8. **tsconfig:** `@xmldom/xmldom` needs `"DOM"` in `lib`; use `module`/`moduleResolution: "node16"`.
9. **Move/resize:** Canvas parent → `Canvas.Left/Top`; elsewhere `Margin`. All 8 resize corners share ONE
   formula with the webview drag outline. **Host bounds are window-ABSOLUTE but the attrs are PARENT-relative**
   (ChromeWindow Body sits at y=44) — move/resize edges by `attr + delta`, never `bounds + delta`.
10. **Avalonia 11 has NO `Visibility` — use `IsVisible` (bool).**
11. **Code-behind discovery** matches both `<Name>.axaml.cs|vb` and `<Name>.cs|vb`. VB code-behind needs
    `Imports Avalonia.Controls` + `InitializeComponent()` via `AvaloniaXamlLoader.Load(Me)`; XAML `x:Class`
    fully qualified (VB root namespace).
12. **Property catalog is verified against the real assemblies.** Font props exist only on text-capable types;
    `CornerRadius`/`Padding`/`BorderBrush` are TemplatedControl-only. Window-derived roots (incl.
    `chrome:ChromeWindow`) resolve to the Window prop set + `TitleBarTitle`/`TitleBarIcon`.
13. **VB gotcha (ChromeWindow):** do NOT `Imports AvaloniaChrome`; `Inherits AvaloniaChrome.ChromeWindow`
    fully qualified (BC40056/BC30002).
14. **Host frame JSON is CAMELCASE** (`name/type/x/y/width/height/parent/values`, `gridCells`).
15. **`Grid.ShowGridLines` + cell layout need real Row/ColumnDefinitions** — the programmatic builder parses them.
16. **DataGrid column-header styling has NO direct attributes** — the Columns editor writes a
    `<Style Selector="dg|DataGridColumnHeader">` with Setters inside a `<dg:DataGrid.Styles>`
    property element. **Avalonia rejects ANY attribute on a property element** (AVLN2000), so never
    redeclare `xmlns:dg` locally — call `model.ensureXmlns('dg', ...)` on the ROOT and build the
    fragment with a throwaway local binding that is removed before attach.
17. **System-font enumeration lives in the C# host** (`fonts` command → `FontManager.Current.SystemFonts`,
    deduped case-insensitively; ~2000+ families on a font-rich Linux). Host serves ONE WebSocket
    client at a time, so probes must not open a second socket — reuse `HostClient.fonts()`. The
    extension caches the list and pushes it to webviews in a `fonts` message (`requestFonts`
    re-requests); the webview falls back to `FONT_FALLBACK` until it arrives. Same families the
    generated projects resolve (both go through the OS font stack).
18. **T4 runtime suite can flake under a full `npm test`** — `dotnet run` on the regenerated
    HeadlessApp harness intermittently fails (CS0246 HeadlessApp not found) when the MSBuild server
    still holds stale obj locks from the previous run. Passes on re-run / `npm run test:runtime`
    alone; not a product defect.
19. **Native `<select>` popups follow CSS `color-scheme`.** The webview is a fixed-dark UI, but until
    it declared `color-scheme: dark` on `:root`, Chromium drew every OPEN dropdown list (header-font
    picker, alignment, Properties selects) as an OS-light white box with the light-grey text on it
    (unreadable). Any dark webview with `<select>`s must pin `color-scheme: dark` and ideally give
    `option { background/color }` explicit contrast. Also fixed while in there: `.dg-input`/splitter
    fields referenced `--panel-1`, which was never defined in `:root`.
20. **vsce `.vscodeignore` is not gitignore** — a negated pattern always wins (see §1). Adding
    `out/**/*.map` *after* `!out/**` looks like a fix and silently ships every map: negate narrowly
    (`!out/**/*.js`) and verify with `npx vsce ls`.
21. **Folded toolbar categories must stay transparent to the wrap pass.** `layoutToolbar()` sets every
    `.sep` back to visible and compares `offsetTop` to spot a separator left dangling by a wrap; a
    folded group hides its buttons imperatively, so `foldedToolbarItems()` has to be consulted or the
    folded group's separator reappears (and a hidden button then counts as an invisible "neighbour"
    and hides the *next* group's separator).
22. **T3's jsdom fixture also keeps a plain copy of every toolbar button under `<body>`**, so injecting
    the real toolbar markup creates DUPLICATE ids and `getElementById` resolves to the stale copy.
    Query inside the toolbar (`bar.querySelector('#id')`) in that layer.
23. **CSS is occasionally re-formatted (spaces around `>` dropped: `#btnUndo>svg`)** — that broke
    exact-text assertions in the suite. Write CSS assertions whitespace-tolerant (`\s*`). Related:
    `#toolbar button{display:inline-flex}` beats the UA `[hidden]` rule, so folded groups need an
    explicit `#toolbar [hidden]{display:none}`.

---

## 5. Adding a new toolbox control — MUST-DO checklist

1. `src/controlInfo.ts` → `ControlInfo {label, desc, use}` (help panel + tooltip).
2. `src/propertyCatalog.ts` → `CONTROL_PROPS[tag]` + `KEY_DEFAULTS` + `ADVANCED_KEYS`.
3. `src/codeBehind.ts` → `DEFAULT_EVENT` entry if it has a natural event (powers auto-wire).
4. `src/newForm.ts` → add a quick-start template if it fits a common form.
5. `host/ControlFactory.cs` → snippet + type-map entry (if the programmatic builder must render it).
6. Rebuild → package → reinstall → **window reload**.
- **StatusBar does NOT exist in Avalonia** — the tool inserts a Border+TextBlock docked bottom (generated-name special case).
- **Every new control must be covered by the test suite** (T5 matrix auto-discovers from the catalog).
- Webview media `designer.js`/`dataSet.js` are NOT compiled by tsc — validate with `node --check`; T3 jsdom:
  new element IDs must be added to `IDS` + `tagFor` + mounted inside `#canvas`.

---

## 6. Current feature state (2026-09-13)

- **The performance pass, four reported fixes, release 0.9.1 (2026-09-13, suite 2786/0, release
  1.0.0-beta.8).** Everything on the hot paths was timed before and after (`npm run bench`): the
  code-behind checker's two O(n²) string patterns (14.3 → 11.9 ms), the per-lookup DOM walk behind
  `findByName` (2.02 → 0.028 ms for 200 lookups), the per-edit `serialize`+parse signal (3.3–5.0 →
  1.5–1.6 ms), the `.adset` reads (1.03 → 0.21 ms/lookup), the canvas overlays (3.7 → 1.8 ms/frame
  at 200 controls) and the code-behind lookup (0.143 → 0.065 ms, no file bodies read). Fixes: the
  right-click menu flipping back on screen, the Properties panel keeping its scroll position, the
  `System.`-qualified clock code that fixes `CS0103`, and — the one that prompted the pass — a typed
  property committing on `Enter`/blur instead of mid-word. Full write-up: §83.
- **Events, code-behind sync, toolbar categories, packaging (2026-09-12, suite 2646/0, release
  1.0.0-beta.7).** Five threads:
  1. **Event catalog (generated, not hand-written).** A throwaway console app (`/tmp/eventdump`, its own
     `EventDump.csproj` + `Program.cs`) reflects every public event per control out of the real
     Avalonia 12.1.1 assemblies into `events.tsv`; `gen-data.js` curates the picker lists and validates
     them against that dump (it caught invented events — `ComboBoxItem/ListBoxItem/TreeViewItem.
     SelectionChanged` do not exist — and resolved conflicts), `gen-ts.js` writes
     **`src/controlEvents.ts`** (DEFAULT_EVENT, EVENT_PICKER_TAGS, EVENTS_BY_CONTROL, GENERIC_EVENTS,
     EVENT_ARGS, EVENT_ARGS_BY_CONTROL for the 5 names whose EventArgs differ per control) and
     `gen-md.js` writes **`Events per Control.md`** from the *shipped* `out/controlEvents.js`, so the
     reference cannot drift from the code. Regenerate all three after any Avalonia upgrade.
  2. **Wiring UI.** Chooser on placement (curated list, default first, multi-select, **Skip**, "remember
     my choice"), right-click **Add event…**, middle-click handler menu (wired events + ⚠ recreate +
     Add event…). Settings: `askEventOnPlace`, `autoWireDefaultEvent`.
  3. **Code-behind sync.** `codeCheck.mode` (onReturn default / onSave / onType / manual) +
     `codeCheck.badges`, the ⚙ Settings modal, canvas ⚠ badges, PROBLEMS publishing, `repoint-handler`
     for a hand-rename (only when exactly one candidate fits), and a `dismiss` /
     `unwrap-handler` alternative on every fixable finding (dismissals are session-scoped per document,
     `issueSignature()` is line-independent).
  4. **Toolbar.** Foldable categories (`.tbg-head` chips + a `data-stop` marker; the folded set lives in
     the webview state), uniform 24 px buttons, wrapping rows that hide a dangling separator, 13
     inline-SVG icons (no font involved), text-only Refresh.
  5. **Packaging/release.** Slimmer `.vscodeignore`, `activationEvents: []`, the .NET-SDK preflight
     message, CI + release workflows, `npm run package|publish:pre|publish:stable`, and
     `tests/t2-logic/packaging.test.js` locking the manifest/ignore/workflow rules.
- **File browser in the generated add/edit row dialog (2026-09-09, suite 1842/0).** User spec: in the
  "Add row…" pop-up dialog add a file browser tool that selects a file from the system drive and
  fills the currently selected column box. Answers: every **String** column; a **Browse… button next
  to each eligible field**; store the **full absolute path**; filter **images first, then all files**;
  **both C# and VB**, both Add and Edit (the same `<Table>EditDialog` serves both); and **remember the
  last folder**. Implementation (src/dataSetGenerator.ts): for a String column the dialog now builds a
  `Grid(*,Auto)` row = TextBox + `Browse…` Button (C# `Grid.SetColumn`/inline `async` lambda; VB Grid +
  per-column `Private Async Sub BrowseFile<Col>` — VB is CASE-INSENSITIVE so the handler name must
  differ from the `browse<Col>` button variable, else BC30577). A shared `BrowseAsync(box)` uses
  Avalonia `StorageProvider.OpenFilePickerAsync(FilePickerOpenOptions{ FileTypeFilter = ImageAll,
  All, SuggestedStartLocation = remembered folder })`, then `files[0].TryGetLocalPath()` → box.Text and
  remembers `Path.GetDirectoryName`. New generated `FilePickerMemory` (C# static class / VB Module) keeps
  the last folder in memory + best-effort `<DataSet>.lastfolder` in the app's per-user data folder
  (`RuntimeStorage`, §86 — it used to sit next to the app, which a .deb/MSI install cannot write).
  Added `using/Imports Avalonia.Platform.Storage` (grid forms only) for FilePickerFileTypes + the
  TryGetLocalPath extension. VERIFIED by generating a DataGrid+SQLite dataset and dotnet-building
  standalone C# and VB projects: **both 0 warnings / 0 errors** (this is the real gate — the API names
  are correct). t2 dataSet.test.js grew content assertions. USER: regenerate the DataSet code → the row
  dialog has a Browse… button per text column; it lands in the last-used folder.

- **Deleting a VB control whose handler contains a nested Sub leaves no code-behind fragments
  (2026-09-09, suite 1829/0).** Bug: deleting an XY-Tracker (or any control whose handler embeds an
  anonymous `Sub`) left `timer.Start() / End Sub` behind in the .vb. ROOT CAUSE: `removeVbMethod`
  removed up to the FIRST `End Sub` after the signature — the generated XY-Tracker / StatusDate VB
  handler wraps its per-second timer in `AddHandler timer.Tick, Sub(s2, e2) … End Sub`, so the inner
  `End Sub` truncated the method early. FIX (codeBehind): new `vbMatchingEnd(text, from)` counts VB
  `Sub`/`Function` nesting (skipping `'` comments and `"…"` strings so a stray keyword can't
  unbalance it) and returns the MATCHING `End Sub`/`End Function`; `removeVbMethod` now removes the
  whole method. Applies to both the delete path and `removeOrphanedHandlersForControls`. C# was already
  brace-aware (matchingBrace) so unaffected. t2 regression: remove a nested-Sub XYTracker handler →
  whole method gone, sibling survives. Full suite 1829/0. USER: reload → delete an XY-Tracker → no
  leftover code-behind.

- **SplitPanel divider drag in multi-pane splits only moves the DRAGGED divider (2026-09-09).** Bug:
  in a 3-vertical-pane (or any >2 pane) split, dragging one divider ALSO moved the other divider — at
  design-time AND runtime. Two linked causes: (1) design-time `setSplitPaneSize` pinned the dragged
  pane to FIXED px and left the other stars to share the remainder, so the far divider shifted (and
  repeated drags mangled columns, e.g. 285/24). (2) Runtime: Avalonia GridSplitter has special
  behaviour for a fixed+star pair — it resizes ONLY the fixed neighbour while the star absorbs, so the
  dragged divider doesn't move cleanly / the far one does; only TWO STAR neighbours use `Split`
  (both resized, sum conserved → only the dragged divider moves). FIX (designerPanel): new
  `setSplitDividerPixels` applies a drag the way Avalonia ends up after a runtime drag — the whole
  axis is stored ALL-STAR with each content def's star value = its measured pixel width (heals old
  fixed columns), the dragged pane's cell = the new px and its immediate neighbour absorbs the
  difference (pair sum conserved → every divider beyond the neighbour stays put). `case 'setSplitter'`
  and the typed pane-Width path (`setSplitPaneSize`, pixel values) both route through it (a plain `*`
  / `0` keeps the old path). Host `ParseGridLength` already parses `N*` star widths. Verified with
  real-code drag harnesses on a fresh 3-col split + the user's mangled file: dragging divider1 moved
  P0 (259→295) with P2 (259) UNCHANGED (divider2 stayed), columns became `297*/226*/261*`; typed
  P0 Width=300 → P0≈300, P1 absorbed, P2 unchanged. Full suite 1826/0. USER: reload → drag a
  SplitPanel divider in a 3-pane split → only the dragged divider moves (and runtime matches).

- **XY-Tracker on the new GrumpyStatus bar reports the FORM's size (2026-09-09).** Bug: dropping an
  XY-Tracker onto the GrumpyStatus (the new status strip, a chrome:GrumpyPanel docked BOTTOM) showed
  the STRIP's size instead of the form's — the form-mode detection `isWithinStatusBar` only matched
  the legacy `StatusBarN` (a DockPanel), not the GrumpyStatus. Fix (designerPanel): `isWithinStatusBar`
  now also returns true when an ancestor (≤4) is a **bottom-docked** `chrome:GrumpyPanel` (any
  GrumpyPanel docked to the bottom edge counts as a status strip). And on a form-mode XYTracker drop
  that lands inside a Grumpy strip, relocate the tracker into the strip's inner `{n}Dock` band BEFORE
  the `{n}Body` (restoring LastChildFill=True) so Dock=Right/HAlign=Right actually pin it to the edge
  (parity with the legacy StatusBar, whose items lived straight in the DockPanel) — works whether the
  drop hit the strip's empty body or its label/clock. Full suite 1826/0. (Form "- GrumpyPanel" dropdown
  label is just the window Title being "GrumpyPanel" — not a type.) USER: reload → drop an XY-Tracker
  onto the GrumpyStatus strip → shows the form's W x H and hugs the right edge.

- **SplitPanel — design-time splitter dragging (2026-09-09), suite 1826/0.** User spec: drag the
  runtime GridSplitters to resize panes AT DESIGN TIME. Answers (all recommended): fixed pixels on
  release (matches pane Width/Height semantics — a sibling stays star); guide line + apply on
  release (smooth, ONE re-render); all layouts (Zones/Columns/Rows); respect pane minimums + one
  undo step. **Geometry:** GridSplitters are UNNAMED (host frame reports only named controls) and
  Border-wrapped split grids are unnamed (no gridCells) → derive divider bars PURELY from the
  measured pane-body rects in the frame: `splitBarsOf(controls)` (module fn in designerPanel)
  finds edge-adjacent pane bodies (SplitPanelNPaneM) of the SAME SplitPanel prefix with a small gap
  (≤60px) and overlap → a `SplitBar {pane(left/top), other, axis:'v'|'h', x,y,w,h}` (the gutter
  gap). Posted on every frame as `splitBars`. **Webview (media/designer.js, hand-written IIFE):**
  `barAt(x,y)` hit-tests bars (5px grab tolerance); `onPointerDown` starts `drag.mode='split'`
  (before marquee) when pressing a bar (not a handle/tool); `onPointerMove` draws a `#splitGuide`
  line (new element + CSS) at the pointer's axis coord; `onPointerUp` posts ONE
  `{type:'setSplitter', pane, other, axis, pos}`. **Extension handler `case 'setSplitter'`** uses
  the last stored frame + pane Border border-thickness (bt) to convert pos → pixel size
  (`cellStart = body.x/y - bt`), clamps: `minAllowed` = this pane's def Min (≥1), `maxAllowed` =
  far pane's cell end − its def Min (so dragging can't shrink a pane below its minimum), then calls
  `setSplitPaneSize` (writes the def px, keeps a star sibling, applyFormMinimum, one undo step,
  re-render). template + designer.css gained `#splitGuide`; t3 IDS + a new pointer test
  (splitter-drag: press divider at x243 → move x300 → guide shows → release posts ONE setSplitter
  with pane/other/axis/pos=300). Full suite 1826/0; `node --check designer.js` OK. USER: reload →
  drag a SplitPanel divider in the canvas (guide follows, panes resize on release; Ctrl+Z undoes;
  drags respect pane minima).
- **StatusDate clock — Date/Time formats, System/Custom presets (2026-09-09), suite 1818/0.**
  User spec: beginner-friendly; System = OS format; Custom = pick from example formats (no raw
  .NET format strings); must be able to HIDE date or time. Answers: separate Date + Time formats;
  example pickers; live preview. **Shared catalogue** (`src/propertyCatalog.ts`):
  `STATUS_CLOCK_CHOICES.date/time` (friendly ids: 'None (hidden)', 'System date'/'System time' +
  examples like 'Mon, 9 Sep 2026', '14:32'); `statusClockFormat(part,choice)` → .NET format (''=
  hidden, 'd'/'T'=OS current-culture standard, else explicit pattern rendered InvariantCulture);
  `isStatusClock(el)` = TextBlock with a Loaded handler that is NOT Classes=XYTracker (covers
  toolbox StatusDate, Status Items clocks, GrumpyStatus date — NOT plain labels / XYTracker);
  `statusClockSample(...)` TS mini-formatter for the live Preview row (covers the preset tokens +
  JS approx of OS date/time). propertyDefsFor gains a `statusClock` override param and, for a clock,
  pushes rows: StatusDate.Date / StatusDate.Time (dropdowns of the friendly choices) +
  StatusDate.Preview (read-only). **Persistence = code-behind, not XAML:** `src/codeBehind.ts`
  `getStatusDateSettings` reads a marker comment on the clock's tick line
  (`// statusclock:<name>: <date>|<time>` C# / `' …` VB) with legacy fallback System date/time;
  `setStatusDateSettings` rewrites the tick line to the composed expression
  (date-part [+" "+ time-part]) with invariant patterns for examples and current-culture for System,
  creating the default handler first if none. designerPanel: setProperty routes StatusDate.Date/
  StatusDate.Time → setStatusDateSettings (+render+sendProperties); sendProperties reads settings +
  preview override for a selected clock. Tests: vb matrix StatusDate rows are designer-managed —
  added to NON_XAML_KEYS (vb-all-controls) + MANAGED_KEYS (property-audit); property-audit
  auto-re-recorded StatusDate (its prop list grew). Full suite 1818/0; VB probe built 0/0 (invariant
  pattern line + marker). USER: reload → select a StatusDate clock → set Date/Time Format (None/
  System/examples) + watch Preview; runs live at runtime.
- **New toolbox control: GrumpyStatus (Bars) — a status strip built on the GrumpyPanel base
  (2026-09-09), suite 1815/0.** User spec: bottom-docked, dark-grey background, StatusDate docked
  RIGHT + a left label, based on GrumpyPanel. Answers: new Bars toolbox item (existing Status Bar
  stays); left element = **TextBlock label** (not a TextBox); StatusDate = **live clock** (wire the
  per-second timer); later editing = normal GrumpyPanel behaviours (no Status Items editor).
  Snippet (host/ControlFactory) =
  `<chrome:GrumpyPanel DockPanel.Dock="Bottom" Height="26" Background="#333333" BorderBrush="#333333" BorderThickness="0" CornerRadius="0"><DockPanel {n}Dock LastChildFill=True><TextBlock {n}Label "Ready" Dock=Left …Foreground #E6E6E6/><TextBlock {n}Date now Dock=Right … Loaded="{n}Date_Loaded"/><Canvas {n}Body/></DockPanel></chrome:GrumpyPanel>`.
  **Designer generalisation:** Grumpy structural detection is now STRUCTURAL not name-prefix regex —
  `grumpyPartOf(el)` recognises the inner DockPanel/{n}Body of ANY `chrome:GrumpyPanel` root
  (GrumpyPanel1, GrumpyStatus1, …) by walking Dock→root (root tag GrumpyPanel + `{root}Dock`/
  `{root}Body` names). `isGrumpy{Dock,Body,Part,Panel}Name` regex predicates replaced. Drop special
  case: GrumpyStatus wired the embedded date clock via `insertStatusDateClock(uri, '{name}Date')`
  (same as StatusDate) + `ensureGrumpyPanelHelpers` (GrumpyPanel & GrumpyStatus). Drop dedup now
  renames the WHOLE name family via `replaceFragmentFamilyName` (root + {n}Dock/{n}Body/{n}Label/
  {n}Date) — this also FIXED a latent bug where the old dedup overwrote the inner-renamed xaml with
  the root-only-renamed snip.xaml. infoTagFor returns 'GrumpyStatus' by name. No TypeMap change
  (root tag is GrumpyPanel). Tests: vb matrix 32→33 (950 in vb-all-controls; property-audit
  auto-recorded GrumpyStatus; full suite 1815/0). USER: reload + drop Grumpy Status from Bars →
  docks bottom, dark grey, "Ready" label left + live clock right; add more items / Dock them like
  any GrumpyPanel; edit label text, clock text colour, strip height from Properties.
- **New toolbox control: GrumpyPanel — a bundled docking-region Border control (2026-09-09), suite 1783/0.**
  User spec: dockable panel with free placement of children (no auto placement), dock-able children,
  8-way corner Anchor, Border/Background chrome + System/Custom Theme. Answers: Layout-panels group;
  **bundled custom control** (like ChromeWindow); child dock = REAL dock band (docked child's Anchor
  ignored, Dock None returns it to the free body); dedicated 8-way panel Anchor; Theme = frame preset
  (System neutral / Custom = the 4 chrome attrs). **Architecture:** `resources/GrumpyPanel.cs/.vb`
  = `AvaloniaChrome.GrumpyPanel : Border` (a thin subclass — layout is the STOCK nested composition,
  so preview==runtime with zero custom layout): snippet =
  `<chrome:GrumpyPanel Width=360 Height=220 Background=#F7F7F7 BorderBrush=#909090 BorderThickness=1 CornerRadius=4><DockPanel x:Name="{n}Dock" LastChildFill=True><Canvas x:Name="{n}Body"/></DockPanel></chrome:GrumpyPanel>`.
  Free drops land in `{n}Body` (a real Canvas); docked bars are moved into `{n}Dock` before the body.
  Touchpoints: ControlFactory snippet + TypeMap (host links GrumpyPanel.cs); PreviewerHost.csproj
  `<Compile Include ../resources/GrumpyPanel.cs>`; hostClient.hostSourceIsNewer now watches
  GrumpyPanel.cs too; toolboxProvider (Layout panels, 'Grumpy Panel'); controlInfo; xamlModel
  addControl ensureChromeNamespace on GrumpyPanel tag (mirrors DataGrid dg); propertyCatalog
  CONTROL_PROPS['GrumpyPanel'] (Dock + frame + Padding) + dedicated GRUMPY_ANCHOR (8 values,
  hyphen corners reusing AnchorHelper substring matching — no helper change); codeBehind
  applyAccessors now adds `Imports AvaloniaChrome` when a named control's type is GrumpyPanel
  (else BC30002 in VB accessors); designerPanel: `isGrumpy{Dock,Body}Name` structural predicates
  (locked + paneBody flags), `dockIntoGrumpy` (ensureDockPanelParent docks WITHIN the panel, never
  root), Dock=None moves a band child back to the body, drop dedup renames the `{n}Dock/{n}Body`
  family, `ensureGrumpyPanelHelpers` copies the helper into OLD projects on drop; scaffold
  grumpyCs/grumpyVb bundled into new projects (projectScaffold/projectCreator/tests build.js).
  Tests: vb matrix 31→32 controls, GrumpyPanel props compile in the combined 12.1.1 VB build
  (919 in vb-all-controls; full suite 1783/0). host dotnet build 0/0. USER: reload + drop Grumpy
  Panel → free-drop children, Dock a Menu/StatusBar/Image to an edge, Dock=None returns to body,
  set the panel's own Dock on a form edge + 8-way Anchor, style frame + System/Custom Theme.
  C# IDE shows a stale "AvaloniaChrome not found" on ControlFactory.cs — false positive (the C#
  LS doesn't follow the csproj `<Compile Include ../resources/…>` link); `dotnet build` 0/0 is truth.
- **XY-Tracker form-mode compile FIX — Avalonia 12 has NO Control.TopLevel (2026-09-09), suite 1752/0:**
  dropping an XY-Tracker onto a Status Bar (form mode) generated VB using `c.TopLevel` →
  BC30456 "'TopLevel' is not a member of 'Control'" (6 errors across the two trackers in
  TestAV12BlankVB). AV12 removed the instance `TopLevel` property; the reach-the-window accessor is
  the static attached getter **`Avalonia.Controls.TopLevel.GetTopLevel(Visual)`** (verified in the
  12.1.1 ref XML: `M:Avalonia.Controls.TopLevel.GetTopLevel(Avalonia.Visual)`). Fixed BOTH generators
  in `src/codeBehind.ts` — VB form: `Dim top = Avalonia.Controls.TopLevel.GetTopLevel(c)` then
  `top.ClientSize.W/H`; C# form: `Avalonia.Controls.TopLevel.GetTopLevel(c) is Avalonia.Controls.TopLevel top`
  (the C# `c.TopLevel` would have failed the same way — it was never compile-gated until now).
  **Test coverage gap closed:** the t5 combined build only exercised CONTAINER mode, so form mode
  shipped broken. vb-all-controls Phase D now adds a SECOND renamed XYTracker (`XYTracker2`,
  snippet name `XYTracker1`→`XYTracker2`) and inserts its clock in FORM mode, so the authoritative
  combined 12.1.1 build compile-gates BOTH handlers. TestAV12BlankVB code-behind patched to
  GetTopLevel → builds 0/0.
- **New toolbox control: XY-Tracker — live WxH dimension TextBlock (2026-09-08), suite 1752/0:**
  toolbox group **Dev Helpers** → **XY-Tracker**. Snippet (`host/ControlFactory.cs`) = a `TextBlock`
  carrying `Classes="XYTracker"` + `Loaded="<name>_Loaded"`. Drop behaviour
  (`designerPanel.ts`): onto a plain container → **container** mode (reports the size of the control
  it lands in = its immediate parent); onto a Status Bar strip (`isWithinStatusBar`) → **form** mode:
  `DockPanel.Dock=Right` + `HorizontalAlignment=Right` + `VerticalAlignment=Center` so it hugs the
  right edge, and reports the **form**'s client size (the window). It can also be added as a Status
  Items kind (`STATUS_KIND_OPTIONS` label 'form WxH', `statusKindOf` checks `Classes="XYTracker"`
  BEFORE the Loaded heuristic). Generated code-behind (`src/codeBehind.ts` insertXyTrackerClock):
  a `Loaded` handler starts a 200 ms `DispatcherTimer` updating the Text to `"W x H px"`
  (InvariantCulture). C#: `sender is Control c && c.TopLevel is TopLevel top`
  (form) / `c.Parent is Avalonia.Visual p` (container). VB: `TryCast(sender, Control)` then
  `c.TopLevel.ClientSize` (form) / `TryCast(c.Parent, Avalonia.Visual)` (container).
  **Avalonia 12 gotcha:** VB `c.Parent.Bounds` FAILS to compile — AV12 types `Control.Parent` as
  `StyledElement` (no `Bounds`) → BC30456. Cast to `Avalonia.Visual` first. Also added XYTracker to
  `toolboxProvider.ts` (Dev Helpers), `controlInfo.ts`, the StatusItems webview, and the t5 vb matrix
  (`vb-all-controls` combined compile now 31 controls). **Test-infra fix:** the t5 fallback treated
  `dotnetBuild`'s `errors=-1` (command-threw) sentinel as PASS (`rc.errors > 0` → `!== 0`), which had
  MASKED the real VB compile error; now surfaced.
- **SplitPanel pane bodies always autosize to their pane — stray geometry FIXED + guarded (2026-09-07):**
  each SplitPanel pane body (the Canvas/DockPanel inside a pane Border) must always FILL its pane area.
  The bottom full-width pane's canvas had picked up explicit `Width`/`Height` + a negative `Margin`
  (resizing/moving a pane body like a normal control writes those, since its parent is a Border not a
  Canvas) — so it stopped stretching with its pane. Its row had also been pinned to a fixed `35px`
  divider, so it never grew when the form resized (the SplitPanel template's own rows are star:
  `3*/Auto/2*`). Fixes: (1) designerPanel `move`/`resize`/align/distribute paths now SKIP SplitPanel
  pane bodies (`isSplitPaneName`) so they can never be given stray size/margin again; (2) user's
  TestAV12BlankVB `SplitPanel1Pane3` canvas cleared of Width/Height/Margin and its row set to
  `3*/Auto/2*` (flex). Pane dividers are still changed via the pane's own Width/Height property
  (setSplitPaneSize writes the row/col definition, never the body). suite 1664/0.
- **SplitPanel pane bodies selectable but NOT mouse-resizable/movable (2026-09-07):** a pane body is
  NOT locked (so it appears in the Properties list and stays click-selectable), but it must always FILL
  its pane. The frame now flags each control with `paneBody: isSplitPaneName(c.name)`; the webview
  (`designer.js`) renders a pane body with a selection outline but NO resize handles, blocks any drag
  (`onPointerDown` early-return `c.locked || c.paneBody`) and excludes it from multi-select align
  "movable" counts; CSS `.pane { cursor: default; }`. A plain click still selects it so its properties
  are editable in the PROPERTIES panel. suite 1664/0.
- **JPEGs render upright — EXIF orientation honoured (2026-09-08):** Avalonia's `Bitmap` ignores the
  EXIF `Orientation` tag, so a JPEG with a camera orientation tag (phone photos) shows sideways in an
  `Image` while PNGs (no tag) stay upright. Fix (user fixed TestAV12BlankVB, then mirrored in the ext):
  (1) new bundled helpers `resources/ExifImageLoader.cs` + `.vb` — read EXIF Orientation 0x0112
  (bare-metal JPEG APP1/TIFF parser, little+big-endian) and bake the rotation/flip (tags 2-8) into a
  fresh `RenderTargetBitmap` via `DrawingContext.PushTransform`; PNGs/plain JPEGs take a fast path
  (no re-render). (2) Generated **Data-Image** code-behind (C#+VB, `src/codeBehind.ts`) now sets
  `Image.Source = ExifImageLoader.LoadImageOriented(row.Col)` instead of `new Bitmap(path)` — the
  only image-loading code the extension generates. (3) Scaffold bundles ExifImageLoader.cs/.vb into
  every new C#/VB project (`projectScaffold` + `projectCreator`; optional fields so test-only callers
  are unchanged). (4) `designerPanel.bindDataImage` copies the helper in when an EXISTING project
  (created pre-fix) binds an Image, so the generated code compiles. (5) The DESIGN preview mirrors it:
  `host/PreviewerHost.csproj` `<Compile Link>`s the SAME resources/ExifImageLoader.cs (one source of
  truth) and `XamlRenderer` decodes via `ExifImageLoader.LoadImageOriented` at every site
  (title-bar icon, `ScanImageSources`, inline `<Image>` creation) — so a Data-Image/plain-Source JPEG
  shows upright in the designer too. `hostClient.hostSourceIsNewer` also watches the linked
  resources file so an ExifImageLoader fix triggers the host auto-rebuild. Tests: codeBehind
  DataImage asserts LoadImageOriented (cs+vb) + unbind; scaffold asserts the helper is bundled;
  helpers/build.js bundles it so T0 compile-checks it in generated cs+vb apps. suite 1677/0.
  CAVEAT: a plain authored `<Image Source="x.jpg">` (no Data-Image) is still decoded by Avalonia at
  RUNTIME (EXIF ignored) — the extension can only fix the paths it generates/renders; use the
  Data-Image binding (or the loader) for DB-held JPEGs.
- **SplitPanel pane body reverts to Canvas when emptied (2026-09-08):** WHY a pane's base surface
  flips Canvas→DockPanel: pane bodies are Canvas; Canvas can't Dock/Fill a child, so when a control
  in a pane is given a real Dock/Fill (the natural way to make an Image/DataGrid fill the pane or a
  CommandBar/Menu pin to an edge) `ensureDockPanelParent` sees the parent is a SplitPanel pane-body
  Canvas and CONVERTS it into a DockPanel (`paneBodyAsDockPanel`, same name + plain attrs, Canvas.*
  dropped) so Dock has somewhere to act INSIDE that pane — it never leaves the split. A plain free
  drop (no Dock) does NOT convert. Deleting never reverted it → the DockPanel stayed. FIX: new
  `paneBodyAsCanvas` + `revertEmptyPaneBodies(model)` — after delete / cut / move-out,
  any SplitPanel pane body that is a DockPanel with ZERO element children is converted back to its
  Canvas base (keeps name + shared attrs like Background; drops DockPanel-only LastChildFill), as
  part of the same undo step. suite 1677/0. (Revert only fires when the pane body is EMPTY, so a
  pane holding multiple docked items stays a DockPanel while it has content.)
- **Arrow keys nudge the selection (whole multi-select moves together) (2026-09-08):** the four
  arrow keys now relocate the selected control(s) in the designer — a single press = 1 px, Shift =
  10 px. The WHOLE selection moves in ONE undo step + ONE render: the webview keydown handler sends
  `{type:'nudge', names:[anchor + all ctrl+clicked], dx, dy}` (a new `designerPanel` case); the
  server moves each name that is a free-placed control (direct Canvas child) by the same delta via
  `model.move` (Canvas.Left/Top) — Grid/DockPanel children are laid out by their container and are
  not arrow-moved. Guarded: not while typing in a field, a toolbox tool is armed, or a drag is in
  progress. Tests (t3 webview): ArrowRight nudges the anchor 1 px; Shift+ArrowUp = −10 px; after
  ctrl+click a second control ArrowDown moves BOTH; arrow inside an `<input>` does not nudge. suite
  1689/0. (GOTCHA: the selection helper is `selectionNames()`, not `selectedNames()` — the first
  pass used the wrong name and the keydown silently no-op'd.)
- **Menu 'Space' item — invisible top-bar gap with a px width (2026-09-08):** the Menu Items editor
  gains a **Space** kind (TOP-LEVEL only — a submenu uses Separators). A Space = an invisible gap
  of N px between top-level menu items. Realised at runtime as an INERT `<MenuItem IsEnabled=
  "False" Focusable="False" Width="N"/>` (no Header/submenu — disabled, so it shows nothing and
  can't be hovered/opened; its Width IS the gap). Round-trips: `menuNodeOf` re-reads that shape as
  `{kind:'Space',width}`; `menuElementFor` emits it; `sanitizeMenuNodes` accepts Space only at
  depth 1 (nested Space dropped) + clamps width 1..500 (default 12). Webview editor: 'Space' is
  offered only on depth-1 kind selects (menuKindOptions); switching to Space clears header/children
  + shows a `.mn-width` number field ("N px gap"); bar dummies reserve the gap (no chip, cursor +=
  width). t3 webview tests: gap not a chip, top-level offers Space / nested doesn't, width round-
  trips and is carried on Save. suite 1701/0.
- **Top-level Menu Separator renders VERTICAL — class-scoped, sub-menus stay HORIZONTAL (2026-09-09,
  v2 of this fix):** WHY a plain `<Separator/>` looks wrong on the bar: Avalonia's `Separator` Fluent
  theme ALWAYS draws a HORIZONTAL flyout line (short Height `MenuFlyoutSeparatorThemeHeight` +
  full-width template) and a top-level `Menu` lays items in a horizontal StackPanel but accepts a
  bare `<Separator/>` (MenuBase.NeedsContainerOverride allows MenuItem or Separator) → it shows as a
  horizontal dash. FIX: `saveMenuItems` calls `syncMenuSeparatorStyle(model, menuEl, hasTopSeparator)`
  — while a menu has a TOP-LEVEL Separator it adds `<Menu.Styles>` with a class-scoped
  `<Style Selector="Separator.MenuBarDivider">` (Width=1, Height=16, Margin 6,3, centered; template
  = `<Border Width=1 VerticalAlignment=Stretch ...SystemControlForegroundBaseMediumLowBrush>`), and
  `menuElementFor` emits top-level Separators as `<Separator Classes="MenuBarDivider"/>` (sub-menu
  ones stay plain `<Separator/>`). GOTCHA that produced a regression (v1 of this fix): an UN-scoped
  `Selector="Separator"` under `Menu.Styles` leaks into sub-menu popups (Avalonia applies a control's
  Styles through the logical tree into popups) AND the short theme Height collapses the 1px Border to
  ~1px → user saw TINY DOTS on top-level AND sub-menu separators. Class-scoping fixes both: sub-menu
  separators lack the class so they stay HORIZONTAL, and explicit Width/Height/Margin give a real
  ~16px centered vertical divider on the bar. Removal logic (`findOurs`) also strips a legacy
  `Selector="Separator"` rule an old build may have saved (heals on re-save). Round-trip unchanged
  (still `<Separator>` elements; the Style + Classes are ignored by menuNodeOf/menuItemEls).
  Compile-probed in a real C# Avalonia 12 app (0/0). suite 1701/0. AFTER INSTALL: user must re-save
  the menu once so the old leaking rule is replaced by the class-scoped one.
- **Avalonia 12 removed runtime XAML loading + middle-click is NAVIGATE-FIRST (2026-09-09):** the
  TestAV12BlankVB runtime crash `No precompiled XAML found for TestAV12BlankVB.App` turned out to be
  an Avalonia 12 breaking change, not a project bug: in 12.1.1 `AvaloniaXamlLoader.Load(obj)` — the
  classic `App.Initialize()` / `InitializeComponent()` pattern in BOTH C# and VB — is a STUB that
  ALWAYS throws (checked the 12.1.1 source: `Load(object)`/`Load(IServiceProvider,object)` bodies
  throw unconditionally). Precompiled XAML is mandatory; the Avalonia XAML compiler must run and
  rewrite those Load calls (`CompiledAvaloniaXaml.!XamlLoader.TryLoad` ends up in the assembly). The
  earlier build that "succeeded" had skipped/not emitted that loader → runtime stub throw. Once the
  compiler runs it also VALIDATES handlers: every XAML `Click=`/`Loaded=` must exist in code-behind
  or you get **AVLN3000** ("Unable to find suitable setter or adder for property Click…") — a HARD
  BUILD error where Avalonia 11's runtime loader silently no-oped. Repro chain in TestAV12BlankVB:
  a designer middle-click mess + manual cleanup left `Button1_Click`/`Button4_Click` missing while
  the XAML still had `Click="Button1_Click"`/`Button4_Click"` → AVLN3000 → stubs re-added → builds
  0/0 + runs. FIX in the extension: middle-click = **navigate-first**. New `codeBehind.
  findHandlerInCodeBehind(uri, handler)` locates an existing handler WITHOUT writing/creating
  (returns file + cursor offset at the method, else undefined); `designerPanel.wireDefaultHandler`
  with openEditor now: (1) find the existing handler → open it, touch nothing; (2) only if genuinely
  missing → `insertHandlerIntoCodeBehind` fallback + wire the XAML attr (if absent) + save + open.
  Placement (openEditor=false) unchanged. Handler detection hardened so a hand-edited handler can
  NEVER be duplicated (this duplicate was the real "middle-click still inserts code-behind" bug):
  `findCsMethodDecl` matches ANY accessibility + optional `async` (was only `private void` —
  `public async void X_Click` used to slip past the check and a second method was inserted);
  `findVbMethodDecl` matches any accessibility (Public/Friend/Protected/Shared). CONTROLS.md
  "Default events & auto-wiring" section corrected (place = auto-wire; middle-click = jump to it,
  create only as fallback). Tests: +12 find-handler asserts (find existing w/o write cs+vb, absent →
  undefined, no duplicate for `public async void`/`Public Shared` handlers). suite 1713/0.
  TestAV12BlankVB rebuilt 0/0 + runs. NOTE for generated VB: the `AvaloniaXamlLoader.Load(Me)`
  scaffold pattern is only correct on 12 BECAUSE the compiler rewrites it — the compiler must be
  active (default globbing of *.axaml as AvaloniaResource) or VB apps hit the stub.
- **Middle-click release pasted a stray `>` into the code-behind (Linux/X11) FIXED (2026-09-09):**
  middle-clicking a control opened the code-behind editor on mousedown — while the middle button was
  still held. On release, the OS's middle-click paste (X11 PRIMARY selection) then landed in the
  newly focused editor, inserting whatever text was last selected (a `>`, breaking the build). Fix
  in `media/designer.js`: the middle-button mousedown now only records the press + selects the
  control; the `openEvent` (open code-behind at handler) is deferred until the button is RELEASED
  (a `mouseup` on button 1 with <5px pointer movement = a click, not a drag), and `preventDefault`
  runs on BOTH press and release so no primary-selection paste can ever fire. User-tested: no more
  stray characters. suite 1713/0 (unchanged); designer.js `node --check` OK.
- **SplitPanel pane Min/Max Height/Width now go on the Row/Column definition (2026-09-09):** "the
  Min Height setting doesn't work" — a generic `MinHeight="39"` was being written onto the PANE BODY
  (Canvas), which the Grid's star sizing ignores, so shrinking the window let the bottom pane fall
  below 39. Real fix: the designer routes a pane's Min/Max to its matching `RowDefinition`/
  `ColumnDefinition` (`MinHeight`/`MaxHeight`/`MinWidth`/`MaxWidth`) — mirroring how `Height`/`Width`
  already map to the def size — since that is what clamps a star row/column at runtime. Read side
  (`adjustSplitPaneProps`) now hides the whole Width OR Height family on the axis the pane does not
  drive (full-width bottom pane shows only Height/Min/Max-Height) and shows Min/Max from the def
  (legacy body attrs still surfaced until re-saved). Write side (`setSplitPaneMinMax`): px value →
  def attribute, empty or min 0 → clears, and a legacy Min/Max attribute is stripped off the pane
  body. TestAV12BlankVB Pane3 now `<RowDefinition Height="2*" MinHeight="39"/>` (moved by hand once)
  → builds 0/0; runtime keeps the bottom pane ≥39 when the form is shrunk. suite 1713/0 (unchanged).
- **AUTO FORM MINIMUM = layout floor (2026-09-09):** user spec — when a pane Min is set (not 0) it
  must be kept; other panes shrink first; when nothing can shrink the FORM must refuse. Verified the
  Avalonia mechanism from source: `Window.MinWidth/MinHeight` are pushed to the platform
  (`SetMinMaxSize` → Win32 WM_GETMINMAXINFO min-track / X11 hints / macOS clamp / Wayland
  `set_min_size`), so ONLY a minimum on the Window makes the OS stop the resize — RowDefinition mins
  alone clip at the bottom. The designer now keeps the form's own MinWidth/MinHeight in sync:
  module helpers `pxOf/marginExtents/splitGridMin/formFloorOf` compute the layout floor (chrome
  TitleBarHeight + docked top/bottom bar heights+margins + docked left/right widths + the fill
  child's min — for a SplitPanel that's fixed rows/cols + splitter Auto gutters + star MinValues);
  `applyFormMinimum(doc)` writes max(floor, user value) onto the window root. Hooked after
  `setSplitPaneSize` and `setSplitPaneMinMax` (single undo step; Min/Max edits now also snapshot
  BEFORE mutating so Undo is correct). Reproduces the validated TestAV12BlankVB numbers exactly:
  MinHeight 483 (chrome 30 + menu 24 + status 28 + split 360+2+39), MinWidth 394. NOT auto-run on
  open (avoids surprise edits) — the floor refreshes whenever a pane size/min is changed. suite 1713/0.
- **Runtime crash editing a bound grid cell — "Value must be set." (Microsoft.Data.Sqlite) FIXED
  (2026-09-07):** editing/entering a String cell of a DataGrid-bound SQLite table crashed on save.
  Cause: the generated `Save…` passed a NULL/Nothing value to `AddWithValue` — Microsoft.Data.Sqlite
  cannot infer a parameter type from a null and throws `InvalidOperationException: Value must be set.`
  at `SqliteParameter.Bind`. Sandbox proof: `AddWithValue(null)` throws; a `SqliteParameter` with an
  explicit type + `null` Value STILL throws; only `DBNull.Value` (with or without an explicit type)
  binds SQL NULL. Fix in `src/dataSetGenerator.ts`: `csDbStoreExpr`/`vbDbStoreExpr` never yield null —
  null String/Byte[] become `(object?)r.X ?? System.DBNull.Value` / `If(r.X Is Nothing,
  CObj(System.DBNull.Value), CObj(r.X))`, and empty DateTime/Guid (`MinValue`/`Empty`) become
  `System.DBNull.Value` instead of `null`/`Nothing`. User's `dsFamily.vb` regenerated from
  dsFamily.adset → builds 0/0. Existing apps must click **Generate Code** again to pick up the fixed
  generated save code. suite 1664/0.
- **Design-time DataGrid rows now ACTUALLY render — was blank on 11 AND 12 (2026-09-07):** user asked
  if dataset-bound grid preview "died in the Avalonia 12 port". It didn't — but probing revealed a
  real latent bug: the design-time row fill ran with NO error and set columns+items on the grid, yet
  the DataGrid drew NOTHING (blank surface) in the one-shot headless snapshot — verified IDENTICAL on
  the pre-port host (Avalonia 11.0.10, built from git HEAD) and 12.1.1. Root cause: the DataGrid
  realises its rows/column presenters lazily (virtualising ScrollViewer in its template), so a single
  Measure/Arrange after ApplyGridRows leaves it blank. Fix in host/XamlRenderer.cs: when `grids` were
  supplied, `Dispatcher.UIThread.RunJobs()` + one more Measure/Arrange + RunJobs before the PNG
  render (gated on grids.Count>0 → no-grid renders unchanged). Probe now shows headers + rows on
  12.1.1 (PNG 3320→13140 B); full suite 1664/0. GOTCHAS: tests/helpers/host.js `render()` DROPS the
  grids arg (old /tmp/gridprobe.js never actually sent rows — its "no error" check was shallow); use
  a direct WebSocket render with `grids` to test rows (see the probe pattern in this session).
- **Anchor restored for Status Bar (DockPanel) items — and now really pins; delete also sweeps
  orphaned handlers (2026-09-07):** hiding Anchor for Status Bar items was wrong — a StatusDate /
  TextBlock in the strip has NO Dock property, so Anchor was the only way to pin one, and "it used to
  work" meant it was simply present. Now: (1) propertyCatalog offers Anchor for a direct child of a
  Canvas OR a DockPanel (excluding the form's top-level layout DockPanel — the template's own Menu /
  StatusBar / Body / SplitPanel bars don't get it); (2) setting an edge Anchor on a DockPanel child
  MIRRORS it as `DockPanel.Dock` (`mirrorAnchorDock`: Right→Dock Right, else Left, else Bottom, else
  Top) so the design preview and runtime agree — e.g. Anchor=Right docks a status date to the right
  edge where it hugs as the window resizes; (3) AnchorHelper.cs/.vb gained a DockPanel mode
  (`AnchorDockEdge`/`DockTo` — Canvas children keep the Canvas.Left/Top free-anchoring, DockPanel
  children get docked to the anchored edge at runtime if the XAML lacks it). bundledComponents stale
  marker for AnchorHelper is now `AnchorDockEdge` so old Canvas-only copies in existing projects are
  refreshed (auto-heal also runs on Anchor set). (4) Delete now also removes ORPHANED handler
  methods named after the deleted control/subtree that no remaining XAML event attribute references
  (`removeOrphanedHandlersForControls`; new `XamlModel.namesInSubtree`) — fixes a second StatusDate
  whose XAML Loaded pointed at the first clock's handler leaving its own `StatusDate2_Loaded` method
  behind. t2 propertyCatalog/bundledComponents reworked (+2); suite 1664/0. C#+VB helper check
  builds 0/0. User's TestAV12BlankVB AnchorHelper.vb refreshed → builds 0/0.
- **Existing projects self-heal stale bundled components — fixes "Unable to resolve …
  TitleBarHeight" (2026-09-07):** a project created by an OLDER extension keeps its OLD
  ChromeWindow.cs/.vb; once the bundled component gained the settable `TitleBarHeight`, writing
  `TitleBarHeight="…"` into such a project's XAML fails to compile ("Unable to resolve suitable
  regular or attached property TitleBarHeight on type … MainWindow Line 1, position 2") — at default
  44 the designer strips the attribute so it only broke on a non-default height. The designer now
  refreshes provably-old BUNDLED copies automatically (new pure module `src/bundledComponents.ts`:
  `bundledComponentSpecs(vb)` + `isStaleBundledCopy(text,vb,kind)`; a copy is stale = bundled header
  `Reusable frameless Avalonia window`/`WinForms-style anchoring` present AND current marker
  `TitleBarHeightProperty`/`_parent As Canvas`/`Canvas? _parent` MISSING — customised copies without
  the header are left alone). `designerPanel.ensureBundledComponentsCurrent(doc)` also COPIES IN a
  missing ChromeWindow on conversion; it's called from `applyCustomTitleBar` (convert) AND before
  writing any chrome prop (`TitleBarTitle`/`Icon`/`Height`) on a ChromeWindow root; an info message
  lists what was refreshed. Also refreshes a stale (Panel-wide) AnchorHelper so existing projects get
  the Canvas-only fix. t2 bundledComponents.test.js (+13); suite 1662/0. Immediate unblock for the
  user's TestAV12BlankVB: copy master ChromeWindow.vb + AnchorHelper.vb over the project's stale ones
  → 0/0. (Scaffold copies resources/ live from the INSTALLED extension — a project made before a
  resource update keeps its old copy.)
- **Anchor is now FREE-PLACEMENT ONLY (direct Canvas children) — fixes the Status Bar item
  "broken" Anchor (2026-09-07):** the Properties panel offered an Anchor row on EVERY non-root
  element, including Status Bar items and other DockPanel/Grid/StackPanel children — but the
  runtime AnchorHelper only truly works on Canvas children (it writes Canvas.Left/Top + Width/
  Height, which is wrong/inert in a Dock), so it LOOKED broken. Now: propertyCatalog only adds
  ANCHOR_PROPS when the element's DIRECT parent is a Canvas (`!isRoot && onCanvas`); and both
  resources/AnchorHelper.cs AND .vb harden the runtime to attach ONLY when
  `GetVisualParent() is Canvas` (was `is not Panel` — DockPanel is a Panel so it wrongly tracked
  dock/flow children). Status Bar items keep their Dock LEFT/RIGHT pinning and no longer show
  Anchor. Tests: t2 propertyCatalog.test.js reworked (Button under a Canvas → Anchor present;
  Button inside a DockPanel / parentless root → NO Anchor); suite 1649/0. Matches CONTROLS.md doc
  ("Anchor ... placed directly on a Canvas") which already said Canvas-only.
- **ChromeWindow custom-title-bar props reachable + settable Title Bar Height (2026-09-07):**
  TitleBarTitle/Icon were at the BOTTOM of the Form's property list; now the ChromeWindow rows
  (Title Bar Text, Title Bar Icon, **Title Bar Height**) are pinned ABOVE the Window props. The
  bundled ChromeWindow.cs/.vb expose a settable `TitleBarHeight` (StyledProperty, default 44) and
  REBUILD the chrome on a height change (bar + caption buttons sized to it, body below). The host
  preview's chrome bar (`BuildChromeTitleBar`) reads the root's `TitleBarHeight` attr (default 44)
  so the designer mirrors a taller/shorter bar (probe /tmp/chromeh.js: TopBtn y=44 vs y=60).
  propertyCatalog: CHROME_WINDOW_PROPS + TitleBarHeight (number, default 44) + ordering chrome-first
  + KEY_DEFAULTS/DEFAULTS entries. Both components compile 0/0 (C# + VB check projects under /tmp/
  cwcs, cwvb). t2 chromeProps.test.js (9 asserts); suite 1647/0. NOTE: default stays 44, so existing
  forms are unchanged; the convert-to-chrome growth uses the default 44.
- **Multi-select bulk property editing (2026-09-07):** with several controls selected (Ctrl+Click,
  anchor = first), the Properties panel shows the INTERSECTION of the selected controls' editable
  XAML properties — a value appears only when every selected control has the same (effective) value;
  differing values show an empty box (`mixed` flag → "(multiple)" placeholder). Setting a value
  applies it to ALL selected controls as ONE undo step. Chosen behaviour: hide per-type editor
  buttons + read-only/bound rows (Name/Type, Items, Rows/Columns, Tab Items, Split Layout,
  Data…/read-only ItemsSource), include size & position (Width/Height/Margin/align/Canvas.Left-Top),
  exclude Dock + Grid.Row/Column + UndoRedoDepth/ItemsSource (bulk would move/stack/hit .adset).
  Theme (System/Custom) IS included (per-control colour backup/clear/restore). Plumbing: webview
  `postSelection()` sends `{select, name: anchor, multi:[names]}`; extension `sendMultiProperties`
  (uses new `propertyCatalog.multiCommonProps` — pure + unit-tested) posts `{properties, multi,
  names}`; webview keeps its own multi selection (doesn't collapse), routes every edit through
  `postSet` (adds `names`); extension `multiSetProperty` (single `notifyEdit` → one undo) applies
  via shared normalization (Opacity %, default-strip, chrome ns). Palette/Data…/Browse buttons are
  hidden in multi (typing/swatch applies to all). t2 multiProps.test.js (17 asserts); suite 1638/0.
- **Avalonia 12 controls in the toolbox (2026-09-06):** added `GroupBox` (Layout), `HyperlinkButton`
  + the `CommandBar` family — `CommandBar`, `CommandBarButton`, `CommandBarToggleButton`,
  `CommandBarSeparator` (Buttons & command controls). These exist ONLY in Avalonia 12, which is why
  they originally needed the host off 11.0.10; after the 2026-09-07 host switch to 12.1.1 (see next
  bullet) `ControlFactory.TypeMap` instantiates their REAL types and they preview with their real
  Fluent look. Snippets ship the REAL 12 tag (saved verbatim, compile in 12 apps). designerPanel.frame
  overrides each control's reported `type` with the model's real tag (localName). GroupBox added to
  SINGLE_CONTENT_TAGS + CONTAINER_TAGS (drop children in = Content). Props catalogued (Header,
  NavigateUri, Label, LabelPosition Bottom/Right/Collapsed, OverflowButtonVisibility
  Auto/Visible/Collapsed, IsOpen/IsSticky/IsDynamicOverflowEnabled…; enums verified by reflection on
  12.1.1). DEFAULT_EVENT: HyperlinkButton/CommandBarButton→Click, CommandBarToggleButton→
  IsCheckedChanged. No Icon property on command items (object-typed — a string attr wouldn't compile).
  CommandBar commands live under CommandBar.PrimaryCommands (XAML) until a commands editor. T5:
  AV12_PREVIEW skip-list skips host render phases but the controls are compile-gated in Phase D
  (real 12.1.1 VB project). Suite 1621/0 (on the 11 host).
- **Previewer Host moved to Avalonia 12.1.1 — SINGLE Avalonia version (2026-09-07):** the host
  (`host/PreviewerHost.csproj`) was pinned to 11.0.10 while generated projects were already 12.1.1.
  Probe-first: bump → build (only 2 obsolete `Bitmap.Save` warnings) → probes (grid rows, absolute-
  path images, new-controls) green → full suite 1638/0 on the 12.1.1 host. Finalised: csproj →
  12.1.1 (kept net8.0); `XamlRenderer` Save calls → `new PngBitmapEncoderOptions()` (kills CS0618);
  `CollectControls` now reports an unnamed control ONLY for the window itself — Avalonia 12 realises
  an extra unnamed `TopLevelHost` root that would otherwise show up as a second "Form"-like entry;
  `ControlFactory.TypeMap` Avalonia-12 controls → REAL types so they render for real. The headless
  host STILL has no string-XAML loader on 12.1.1 (no XamlIl runtime loader) → the programmatic
  builder remains the effective path (TypeMap instantiates the real types). Probed:
  /tmp/av12probe.js shows real GroupBox/HyperlinkButton/CommandBar at real bounds. Suite 1638/0;
  host build 0 warnings / 0 errors. User must reload + visually re-check the designer.
- **SQLite database storage (final semantics: SQLite is the ONLY bound-data store)** — a DataSet table
  bound to a control (DataGrid / ComboBox / ListBox / ItemsControl) is ALWAYS persisted in a SQLite
  file; the old sample/XML data store is retired for bound tables (XML migration machinery removed).
  `.adset` stores `keyColumn` and `sqlite { file, tableName? }`. Codegen (C# **and** VB) emits a shared
  **`DatabaseAdapter`** (`SQLitePCL.Batteries_V2.Init` once, `DbPath` resolves relative paths
  next-to-app, idempotent `CREATE TABLE`) and DB `Load`/`Save`; **`Get<T>` (list-bound tables) also
  reads the DB** (`SELECT … ORDER BY rowid`). Save = transactional DELETE + INSERT (AUTOINCREMENT
  survives → integer keys stable; new rows read `last_insert_rowid` back; auto GUID keys use
  `Guid.NewGuid`). **Existing .db files are used IN PLACE via an absolute path (Browse stores the
  absolute path, no copy to bin — no `<Content CopyToOutputDirectory>` injected);** a relative default
  `<DataSetName>.db` is auto-registered when a no-storage table gets BOUND (binding any table with no
  `sqlite` file sets `file: <DataSetName>.db`) and is created in the app's per-user data folder on
  first run (§86; it used to be created next to the app, which fails once the app is installed). Generate
  injects the SQLite PackageReferences (Microsoft.Data.Sqlite 9.0.1 + SQLitePCLRaw.bundle **2.1.13** —
  direct override because 9.0.1's transitive 2.1.10/2.1.11 trip **NU1903**). Design-time: host `sqlite`
  command (`tables` inspect + read-only `query`); DataSet designer shows **Preview SQLite data…**
  (modal query — preview always runs against the **pointed** sqlite file, absolute or project-relative)
  and **Import SQLite…** (reverse-map a .db into .adset tables, affinity→type, stores `file` +
  `tableName`).
- **DataGrid Rows & Columns editors** — a selected DataGrid gets **Rows** and **Columns** buttons
  (Properties). Rows: row background / text colour / row height / row-header width / grid lines
  (All/Horizontal/Vertical/None) + line colours / header visibility (All/Column/Row/None). Columns:
  default/min/max column width, frozen columns, header height AND **column-header styling** (text
  alignment Left/Center/Right, text colour, font, size, background). Header styling has no direct
  DataGrid attribute — emits `<dg:DataGrid.Styles><Style Selector="dg|DataGridColumnHeader">`
  (root `xmlns:dg` only; AVLN2000 if declared on the property element).
- **Header-text-font picker lists every installed system font** — new host `fonts` command
  (`FontManager.Current.SystemFonts`, case-insensitive dedupe; ~2000+ families on this Linux),
  cached + pushed to webviews (`requestFonts` on demand; `FONT_FALLBACK` until it arrives).
- **Native `<select>` popups readable again** — pinned `color-scheme: dark` on `:root` (a dark
  webview otherwise draws OS-light white dropdown lists under light text) + explicit `option`
  contrast; also defined the previously missing `--panel-1` variable.
- **VB row-type hardcode (2026-09-06):** generated VB `Save<T>` used `For Each r As CustomersRow`
  (only compiled when the bound table was literally named Customers). Fixed to `${R}` — surfaces as
  “Type 'XRow' is not defined” for any other table name (e.g. imported Customers2). Applies to the
  SQLite `Save`/snapshot loops too.
- **SQLite migration + db auto-copy REMOVED (2026-09-06, final):** the one-time XML→SQLite migration
  and the `<Content Include=… CopyToOutputDirectory>` db copy are GONE. Rationale: bound data is
  SQLite-only (decision 3) and an existing `.db` is consumed IN PLACE by absolute path (decision 1),
  so there is nothing to migrate and nothing to copy. A pre-existing file pointed to via Browse is
  trusted as-is; a brand-new default `<DataSetName>.db` (created in the per-user data folder, §86) is
  just created empty
  via `CREATE TABLE IF NOT EXISTS`. (Legacy `MyData.<T>.xml` files from beta-era projects are no longer
  read at all — see USER_MANUAL/CHANGELOG for the manual re-import route via Import SQLite.)
- **SQLite schema drift fix — EnsureColumns (2026-09-06):** adding a column in the designer (or
  changing the schema) then Generate Code used to crash at runtime with `SQLite Error 1: no such
  column` — CREATE TABLE IF NOT EXISTS is a no-op on an existing .db, so the regenerated SELECT/INSERT
  referenced a column the table didn't have. The generated `DatabaseAdapter` (C# AND VB) now has
  `EnsureColumns(con, table, cols)` which reads `PRAGMA table_info` and `ALTER TABLE ADD COLUMN`s any
  missing columns (nullable, so existing rows survive). Every generated DB reader/writer (`Get<T>`,
  `Load<T>`, `Save<T>`) calls it right after `DatabaseAdapter.Open(...)` with the table's full
  `name AFFINITY` column list (`csSyncColDefs`/`vbSyncColDefs`). Columns that are NOT NULL in the
  designer are still added nullable to an existing table (SQLite forbids adding a NOT NULL column to a
  non-empty table without a default) — new rows always supply a value via Save anyway.
- **DataSet Generate Code now SAVES the .adset (2026-09-06):** the generated class is derived from the
  in-memory spec, but the .adset JSON was only written on the editor's Ctrl+S — so "add column →
  Generate" could produce code referencing a column the on-disk schema (and hence an existing .db)
  lacked, and a later save/close could even drop the column again. `generateCode` now writes
  `serializeDataSet(spec)` to the .adset + `markSaved()` right after regenerating, so disk always
  matches the generated code.
- **Remove DataSet button (2026-09-06):** the DataSet designer toolbar now has a red **Remove
  DataSet…** button (`btnRemoveDataSet` → `removeDataSet` handler). After a modal warning listing
  exactly what happens, it: (1) strips every code-behind binding the dataset's tables created
  (`unbindControlFromDataSet` on the owning .axaml), (2) deletes the `.adset` + generated
  `MyData.cs/.vb` + `.xsd`, (3) deletes ONLY the DataSet's OWN auto-created default `.db`
  (`<DataSet>.db` in the project folder + `bin/{Debug,Release}/{net8.0,net9.0,net10.0}` copies —
  the app creates that file next to the exe on first run). User-browsed/per-table/external `.db`
  files are NEVER auto-deleted — they're listed in the warning ("delete them yourself") because they
  may be shared. Then it disposes the designer panel (closes the tab). Policy per user: "Option 4 +
  delete bin copies" — never delete a user's real DB; only the auto default (project + bin).
- **DataSet-name ⇄ existing .db collision warning (2026-09-06):** creating a new DataSet
  (`newDataSet`) or renaming one (`setName`) whose default `<Name>.db` already exists in the project
  folder now warns first (bound tables would silently read/write the EXISTING file); you can cancel.
  Guard = `defaultDbExists(folder, name)`.
- **VB generator hardcoded dataset name FIX (2026-09-06):** generated VB add/edit-row dialog code
  used `MyData.CreateDataSet()` — a leftover hardcode that only compiled when the DataSet class was
  literally named `MyData` (BC30451 'MyData' is not declared for any other name, e.g. DataSet1). The
  VB add/edit row functions are members of the DataSet class, so they now call `CreateDataSet()`
  unqualified exactly like the C# generator already does. (C# was already correct.)
- **EnsureColumns quote-parsing FIX (2026-09-06):** the schema-sync column defs were emitted quoted
  (`"Id" INTEGER`) and `EnsureColumns` compared `Split(' ')[0]` (→ `"Id"` WITH quotes) against
  `PRAGMA table_info` names (→ `Id` WITHOUT quotes) — so it never saw existing columns and re-added
  them → runtime `duplicate column name: Id`. Fix: `csSyncColDefs`/`vbSyncColDefs` now emit UNQUOTED
  defs (`Id INTEGER`); `EnsureColumns` (CS_ENSURECOLUMNS/VB_ENSURECOLUMNS) quotes the name ONLY in the
  ALTER (`ADD COLUMN \"{name}\" {affinity}`). Test: t2-logic dataSet.test.js asserts unquoted defs +
  quotes-in-ALTER for C#/VB + no hardcoded MyData refs (1605 total).
- **DataSet name is READ-ONLY (2026-09-06):** renaming the DataSet via the name box broke the build —
  Generate writes `<newName>.vb` but the old `<oldName>.vb` (and its code-behind references under the
  old class name) stayed, duplicating the shared helper types (DatabaseAdapter/CustomersRow/dialog
  classes/converters → BC30179/BC30583) and stranding the old generated file. A correct rename needs
  file rename + old-file cleanup + code-behind reference rewrites, so per the user's fallback the DataSet
  name is now FIXED at creation: the toolbar + DATASET-panel Name inputs are `readonly` and the `setName`
  message is rejected with guidance. Supported rename path: **Remove DataSet…** then create a new one.
- **Image "Data…" binding — Image shows a DataGrid's selected-row image file (2026-09-06):** an
  Image.Source row now ALSO offers a **Data…** button (`pickImageData`) that binds the Image to a
  DataGrid bound to a DataSet table: at runtime the Image shows the image file whose **absolute path**
  is in a chosen **String column** of the SELECTED row (auto-selects row 0 on load; blank when nothing
  selected / empty path / missing file). Exclusive — binding clears the XAML Source attribute (data
  wins; picking Browse returns to a file). Design decisions (user): follow the grid's selected row,
  absolute paths, blank on unavailable, designer preview = FIRST row's image. Storage: metadata on the
  owning table's `.adset` (`boundImages: [{control, column}]` — same place `boundTo` lives) +
  code-behind marker `DataImage: <img> <- <grid>.<col>` with generated selection handlers
  (`BindImage_<c>`/`DataImage_<c>_Show`, C# AND VB — VB insert must place before `End Class` using the
  ABSOLUTE `End Class` index, not `m.index + em.index`). Designer shows Source read-only
  `Data: grid.col`. Cleanup on control delete + **Remove DataSet** (`unbindImageFromGrid`). Design-time
  preview: `applyDataImagePreview` reads the first row's path from the table's .db (host sqlite) and
  injects it as a render-only `Source` (host renders absolute file paths) — never saved. codeBehind
  probe (/tmp/imgprobe*) validates C#+VB insert/unbind (marker inside class, removed cleanly).
- **Design-time DATA preview on the canvas (2026-09-06):** the designer renders XAML only (no
  code-behind), so a bound DataGrid/Data-Image looked empty in the designer even though runtime
  worked. Fix: `designerPanel.render` reads each DataGrid-bound table's rows/columns from its `.db`
  (host sqlite, cap 8) and sends them as a new `grids` option on the render message; the host
  (`XamlRenderer.ApplyGridRows`) fills each named DataGrid read-only (Reflection.Emit row type with a
  public object property per column + DataGridTextColumns, AutoGenerateColumns=False) before measure.
  Data-Image preview shows the first row's image (only when rows exist). Runtime untouched. Extension
  plumbing: `hostClient.render(..., grids?)` + `Program.cs` render case parses `grids` (`JsonCell`).
  Verified: host probe renders a DataGrid with rows 800×450 no error; suite 1605/0.
- **Design-time Image preview FIXED (2026-09-06):** grid rows rendered but the Data-Image still showed
  nothing — isolated to a HOST bug, not the extension: an absolute file path in `Image.Source` (e.g.
  `/home/.../x.png`) rendered **0×0**. Root cause: `XamlRenderer.ResolveAssetPath` checked
  `spec.StartsWith("/")` (treating it as project-rooted → `projectPath + "/home/..."` → file "missing")
  BEFORE `Path.IsPathRooted`. On Linux EVERY absolute path starts with `/`, so all absolute paths were
  mis-resolved and the image silently never loaded. Fix: `IsPathRooted` check comes first (existing file
  → used as-is), with a fallback to `projectPath` only when the rooted form doesn't exist but
  `<project>/<path>` does (keeps the `/Assets/x.png` designer convention working). Second
  ApplyImageSources-after-arrange pass kept (harmless; realizes images only present post-measure).
  Verified: /tmp/simpleimg.js 240×300, /tmp/im2probe.js Image2 w=122 h=152 + DataGrid1 516×291; suite
  1605/0. Released as part of v1.0.0-beta.3 (host/*.cs auto-recompiles on next designer open).
- **+Add row dialog fired on data rows after a header sort (FIXED 2026-09-06, post-beta.3):** sorting
  / scrolling recycle DataGrid row containers. The generated grid code attached the "+ Add row…"
  PointerPressed handler to a container in `LoadingRow` and never removed it, so a container later
  re-bound to an ordinary data row still carried the stale handler → clicking that (reordered) row
  opened the Add dialog even though data + image were correct. Fix in `dataSetGenerator` C#+VB Wire:
  ONE shared handler attached only while a container shows the placeholder, removed in
  `UnloadingRow`, and it re-checks the row's **current** DataContext (`!d.IsPlaceholder` /
  `Not addData.IsPlaceholder`) at press time → recycled data rows never pop the dialog. t2 asserts
  added (4); suite 1609/0; regenerated C#+VB probe projects build 0/0. Users must **regenerate the
  DataSet** to get the fixed generated code (commit 1b84a1e, not yet in a GitHub release).
- **RELEASED: `v1.0.0-beta.3` on GitHub (2026-09-06)** — tag `v1.0.0-beta.3`, commit c45b27e
  (release prep: CHANGELOG restructured — beta.2 restored to its true released content, all post-beta.2
  work under a fresh beta.3 section; package.json → 1.0.0-beta.3; vsix attached). NOTE: the published
  beta.1/beta.2 GitHub releases predate §73+ — this whole SQLite/DataSet/designer batch first shipped
  in beta.3. Release flow: compile → npm test (1605/0) → vsce package → code --install-extension →
  git add (tests/smoke/ + tests/compliance.json stay .gitignore'd/local-only) → commit → tag → push
  → gh release create --prerelease --notes-file. USER_MANUAL revision date auto-tick landed as a
  follow-up commit db8937b.
- **RELEASED: `v1.0.0-beta.1` + `v1.0.0-beta.2` on GitHub**
- **SQLite import auto-links + real table name (2026-09-06):** Import SQLite now stores the source
  `file` on each imported table AND `sqlite.tableName` = the DB's real table name. Without this an
  import renamed to avoid a clash (DB Customers → .adset Customers2) would generate SQL against a
  non-existent Customers2 table and a non-sqlite import just seeded the Sample row when bound.
  All SQLite SQL (CREATE/SELECT/INSERT/DELETE/COUNT) uses `sqliteTableName(t)`.
- **Placed-control Dock normalisation (2026-09-06):** a non-docked control dropped as a DockPanel's
  last child inherited `LastChildFill="True"` → designer showed Dock **Fill** though no DockPanel.Dock
  existed (user expects None). Drop handler now sets the parent's LastChildFill to False for a placed
  last child without a Dock attribute (same as picking Dock=None), so the panel reads None. Dock=Fill
  is an explicit choice that re-enables LastChildFill.
- **DataGrid runtime **Reorder/Resize defaults corrected to FALSE** (the framework's real default) —
  setting True now writes `CanUserReorderColumns="True"`/`CanUserResizeColumns="True"` so dragging
  columns/edges works at runtime.
- **Bind-dropdown empty bug (2026-09-06):** DataSet designer's `walkProject` used `/^\.axaml$/i`
  (only matches a file literally named `.axaml`!) → no `.axaml` ever scanned → "Bind to control"
  always empty. Fixed to `/\.axaml$/i`; also added a `getControls` refresh when a table is selected.
- **ItemsSource picker ⇄ DataSet designer stay in sync — 'both ways' (2026-09-06):** binding a
  DataSet table from the form's Items Source "…" (`pickItemsSource` → `bindDataSetAsset`) now records
  the EXACT state the DataSet designer's Bind dropdown records: `boundTo`/`boundToType` + the shared
  per-DataSet SQLite default (`defaultDbFile` → `<DataSet>.db`, exported) for a no-storage table, then
  regenerates the DataSet class/.xsd AND calls the exported `ensureSqlitePackages`. The DataSet
  designer's Generate/bind path already did both — now both sides agree (no more "bound via grid →
  DataSet screen shows Sample/XML / project lacks SQLite packages"). The ItemsSource "…" button is no
  longer disabled for a read-only (bound) field, so you can SWITCH or UN-BIND from the grid too:
  `pickItemsSource` offers Un-bind + the current binding + other sources; switching drops the old
  binding first (only ONE ItemsSource survives — previously a stale code-asset line could linger) and
  `unbindCurrentDataSetBinding`/`isDatasetTableClaimed` mirror the DataSet Un-bind (keep schema+sqlite).
  Cross-panel live sync: `dataSetEditor.ts` exports `reloadDataSetPanel(uri)` — open DataSet designer
  panels register a reloader (`liveReloaders`) that re-reads the .adset, swaps the in-memory spec,
  resets undo history and repaints — called after every form-side bind/unbind, so a panel open on the
  same .adset shows the change instantly instead of a stale unbound schema.
- **Properties top-actions (2026-09-06):** the "editor" buttons users reach for are now pinned to the
  TOP of the Properties list, above Name/Type/Theme: DataGrid **Rows + Columns**, SplitPanel **Split
  Layout + Splitters** (`propertyDefsFor` builds a `topActions` PropDef[] that is `concat`-prepended —
  tests are key/sig-based so order is safe; t5 audit sorts keys). TabControl's **Tab Items** editor
  section is `propsBody.prepend`-ed in `designer.js` so it sits above the property rows too.
- **RELEASED: `v1.0.0-beta.1` + `v1.0.0-beta.2` on GitHub** (tags pushed, .vsix attached,
  README/CHANGELOG updated). URLs: .../releases/tag/v1.0.0-beta.1 and .../releases/tag/v1.0.0-beta.2
  Marketplace publish NOT done (publisher `grumpy` has no vsce login/PAT; **global Azure DevOps PATs
  retire 2026-12-01** — durable route is `vsce package` + browser upload on marketplace.visualstudio.com/manage,
  no PAT needed). Next planned feature:
  **database access + data binding**.
- WYSIWYG Avalonia form designer for VS Code: Toolbox → designer canvas (click-to-place/drag), Properties
  panel, alignment + multi-select, dot grid + snap-to-grid, shape controls (Line/Rectangle/Ellipse/Arc),
  DataSet designer, C#/VB project + form scaffolding (net10 + Avalonia 12, F5-ready), ChromeWindow custom
  title-bar tool, custom **crosshair** (§69: one toolbar button → settings popup; anchors on the pointer /
  control top-left while moving / the active handle while resizing).
- Suite green: **1597 passed**; PROBLEMS clean after every change.
- SplitPanel tool: a **Border frame** (named SplitPanelN — clicking its border selects the whole panel)
  wrapping a **Grid**; panes are Borders with a named Canvas body to drop into, separated by
  runtime-draggable **GridSplitters** (bars carry `MinWidth="1"`/`MinHeight="1"` so they never
  shrink below 1 px, and star rows/cols flex with the form). Default **Zones** layout = the T
  (Pane0 | Pane1 side-by-side over a full-width Pane2); older Grid-rooted splits still load and
  convert. Grid/row definitions are always written as EXPLICIT `<Grid.ColumnDefinitions>` property
  elements — the host loader ignores the attribute shorthand (so panes confine to their cells and
  stay individually clickable, §78). GridSplitter is in the host TypeMap.
- Split Panel Properties: **Split Layout** (editor: Zones / Columns / Rows; the stepper picks the
  TOP-band pane count for Zones — 2-up over 1 by default, e.g. 3-up over 1 — and the total pane
  count for Columns/Rows; keeps each pane's contents, rebuilds the splitters; converting an old
  Grid-rooted split to Zones wraps it in the Border frame), **Splitters** (each divider bar's
  thickness, colour and runtime visibility — only changed attributes are written, keeping the XAML
  tidy) and **Pane Border** (writes BorderThickness on every pane).
- Pane Width/Height ARE the divider positions (a pane fills its grid cell): a selected side-by-side
  pane's **Width** — and the full-width bottom pane's **Height** — pin that row/column to pixels;
  **0 hides** the pane; `*`/blank lets it flex again. The axis that isn't a real divider (e.g. Width
  on the full-width bottom pane) is dropped from the Properties list, and typing it shows a hint.
- Docked strips (Menu/StatusBar) dropped onto free space now AUTO-DOCK into the form's root
  DockPanel (before the fill child) instead of floating on the Body canvas (their snippets carry
  DockPanel.Dock, which a Canvas ignores). Fixed via ensureDockPanelParent in the drop handler;
  existing misplaced bars re-dock by re-picking Dock (or delete + re-drop).
- Status Bar is now a real **DockPanel** strip (docked Bottom, LastChildFill=False) with a default
  "Ready" label on the left. A **Status Items** property opens a flat item editor (like the menu
  one): kinds TextBlock/TextBox/Button/ProgressBar/Separator(gap)/StatusDate(live clock); each item
  is anchored LEFT or RIGHT and stretches to the bar's height (DockPanel semantics). Editor order =
  visual left→right (right group is emitted reversed & read back unwound). Children are named
  `<Kind>ItemN` (reused on edits so names/clocks survive); StatusDate items get their clock
  code-behind; removed children's handlers cleaned.
- Undo restores deleted-control CODE-BEHIND: the history's per-step code snapshot could be older
  than the live file (handlers added via wiring, or code the user typed by hand between designer
  edits), so Undo restored the control but not its code. Fix: `refreshHistoryCode(doc)` re-reads
  the code-behind from disk into the CURRENT history step just before any code-rewriting action
  (delete / cut / rename / clear canvas / remove tab or list item / paste), so Undo restores the
  exact pre-edit code including manual edits.
- Menu Items editor (Menu bars): the headless host renders an EMPTY Menu bar (Avalonia only
  realizes MenuItems when the menu opens — probed 2026-09-04). Now: `Menu Items` property on a
  Menu opens a tree editor (Item / CheckBox `ToggleType=CheckBox` / Radio `ToggleType=Radio` /
  ComboBox = submenu-of-options / Separator; depth ≤ 5; rename/add-child/add-sibling/reorder/
  delete). Top-level items are drawn as PLAIN placeholder labels over the bar (never real
  controls → no selection/Properties); clicking a dummy opens the editor; Save writes real
  `<MenuItem>` XAML (undoable). ComboBox kind is editor-only (reloads as an Item submenu).
- Undo/Redo toolbar buttons (↶/↷, far left): extension owns the 5-level history and pushes
  `historyState {canUndo,canRedo}` (on ready / after every notifyEdit / after undo-redo) so the
  buttons enable/disable to match; clicking posts the same `undo`/`redo` message the Ctrl+Z /
  Ctrl+Shift+Z / Ctrl+Y shortcuts send.
- Equal spacing (§69e): two new alignment tools — Equal Vertical Spacing (⋮) and Equal Horizontal
  Spacing (⋯) — spread 3+ selected controls with EQUAL edge-to-edge gaps, keeping the two OUTERMOST
  controls fixed (topmost/bottommost or leftmost/rightmost); sorted by position; only changes the
  tool's axis; skips locked + direct-Grid children; buttons enable with 3+ movable controls.
- Preview theme (§69d): the headless host can't see the OS colour scheme, so it always rendered
  Light (white design) even for a "System" form on a dark OS. The designer now tells the host the
  FluentTheme variant per render: an explicit `RequestedThemeVariant` on the form wins, then the new
  `avaloniaDesigner.previewTheme` setting (auto/light/dark, default auto), else the **VS Code colour
  theme** (dark VS Code ≈ dark OS). Host applies it via `Window.RequestedThemeVariant`.
- Rulers (§69c): white-on-black strips hug the canvas top/left and scroll+zoom with it; scale in
  design px. Major grad every 5× grid spacing, minor = 10 divisions per major (= grid/2); numeric
  labels on majors; rulers re-render on frame/zoom/grid-spacing changes.
- §69b: "Align vertical/horizontal centres" buttons were swapped — `btnAlignMiddle` (↕, vertical
  centres) now posts `centre` (centre-X → a vertical line of centres); `btnAlignCentre` (↔,
  horizontal centres) posts `middle` (centre-Y → a horizontal line). Geometry was already correct.
- §70 **Code Fix… (code-behind checker)** — new `src/codeBehindCheck.ts` (pure analysis + fixers,
  no webview deps) driven by a designer-toolbar button: `analyzeCodeBehind(axamlUri, {axamlText,
  controls, dataSet})` returns `CodeIssue[]` (severity/kind/title/detail/line/data), the panel turns
  them into webview findings **and** `Diagnostic`s, and `applyLocalFix(issue)` applies the pure ones
  (accessors, duplicates, handlers, signatures, `InitializeComponent`, Data-Image marker/call,
  `Imports`, chrome base). DataSet-dependent fixes (`regenerate-binding`, `rebind-grid`,
  `copy-bundled-helper`) are dispatched by the panel because they need the `.adset` spec / resources.
  Findings are re-derived by re-analysing after every fix (the webview only sends an issue **id**).
- §70a Inputs are the **designer's in-memory XAML** (`doc.model.serialize(true)`) plus
  `controlsForCheck(...)` = union of the saved file and the model — the same rule the accessor sync
  uses, so the check can't disagree with the fix about which controls exist.
- §70b Detection deliberately **excludes** generated names (`DataImage_*`, `BindImage_*`, …) from
  the `<Control>_<Event>` orphan rule, requires the event part to be a real event name, and treats
  a binding whose grid is fed by `Wire<Table>Grid(...)`/`Load<Table>()` as wired (a naive
  "no ItemsSource line" check false-positives on every generated DataGrid).
- §70c The Data-Image grid/column for a **marker-less** block is derived from the block itself:
  grid from the `BindImage_<c>` selection listener, column from `row.<X>` inside
  `DataImage_<c>_Show`, skipping DataSet bookkeeping members (`IsPlaceholder`, `HasErrors`, …).
- §71 **Data-Image / accessor hardening** — `imgMarkerRe` (marker) **or** `imgBindMethodRe`
  (`BindImage_<c>` method) now proves a binding exists, so a lost `' DataImage:` marker makes the
  block *heal* (marker re-stamped) instead of being inserted a second time (BC30269);
  `syncVbAccessors` unions disk + model (accessors were being dropped when the two disagreed) and
  `namedControlsInAxaml` also reads `Name=` (the `Root`/`Body` DockPanel/Canvas were invisible to it).
- §72 **Previewer-host lifecycle** — the C# host used to wait for another client after its socket
  closed, so every window reload leaked a process (22 found reparented to `systemd`, ~600 MB). The
  host now exits on client disconnect (+90 s watchdog when no client ever connects), `dispose()`
  kills the child before dropping the socket and `deactivate()` disposes the shared manager.
- §73 **Host errors stay in our channel** — `hostClient` logs `msg.error` to the "Avalonia Designer"
  channel before rejecting, so a host failure no longer shows up as an unhandled-rejection stack in
  the Extension Host output.
- §74 **Test-suite findings (2026-09-10)** — the T3 jsdom fixture missed `btnRefresh`, so
  `designer.js` threw at load and the layer silently ran 5 of ~360 checks (total dropped to 1473);
  the T3 test now asserts the fixture covers every `$('…')` id in `media/designer.js`. The bundled-
  component fixtures needed the current `TitleBarBackgroundProperty` marker, and the T4 harness can
  lose its `ProjectReference` between write and build (it now re-asserts it): **1843 passed / 0
  failed**.
- §75 **Follow-a-column bindings (2026-09-10)** — a read-only control
  (ComboBox/ListBox/ItemsControl) can list one TEXT column of a table a DataGrid owns, live.
  `Asset` gained `kind: 'follower'` (`scanDataSets` emits one entry per String column of a
  grid-bound table: label `DataSet.Table.Column`, detail “follows <grid>”); the picker still rejects
  a DataGrid-owned **table** but offers its columns; the binding is one `ItemsSource` line written by
  `bindFollowerToColumn` and recorded on the table's `.adset` (`followers`, mirroring `boundImages`).
- §75a **Ordering matters** — the generated line goes directly AFTER the grid's `Wire<Table>Grid(...)`
  line, never after `InitializeComponent()`: the follower is built from the row collection that the
  wire line receives (inserting it earlier would build it from `Nothing`). That is why
  `upsertItemsSourceLine` could not be reused here.
- §75b **Bundled `ColumnFollower(Of TRow, TValue)`** (`resources/`, shipped with new projects, copied
  on demand) mirrors the row collection into an `ObservableCollection(Of TValue)`: Add/Remove keep the
  control's selection (insert/remove at the mapped index), a cell edit REPLACES that entry in place,
  the `IsPlaceholder` row is skipped, Replace/Move/Reset rebuild. Two VB traps, one build each:
  `select` is a reserved keyword (the parameter is `selector`) and a doc-comment `cref` may not
  contain `(Of …)` (BC30201).
- §75c **Inline items vs ItemsSource** — Avalonia throws “Items collection must be empty before using
  ItemsSource.” (string confirmed inside Avalonia.Controls.dll 12.1.1) when a control has both
  `Items` children and an `ItemsSource`. The picker offers to clear them as part of the bind (a MODEL
  edit — a direct file edit would be overwritten by the designer's next save) and Code Fix reports
  the combination (`remove-inline-items`); it also drops a follower whose grid/column vanished
  (`drop-follower`) and re-copies a missing `ColumnFollower`.
- **XAML header (§76):** every `.axaml` starts with `<!-- Do NOT edit this file manually - Use the
  Designer to make changes -->` (see §76 below).
- §76 **XAML header — “Do NOT edit this file manually” (2026-09-10)** — new `src/xamlHeader.ts`
  (`DESIGNER_HEADER` + idempotent `withDesignerHeader`) stamps the notice as the first line of every
  form the extension produces: `buildAxaml`/`buildChromeAxaml` (`formTemplates.ts`), `appAxaml`
  (`projectScaffold.ts`, so `App.axaml` too) and the designer's write sites
  (`saveCustomDocument`, `saveCustomDocumentAs`, the event-handler attribute save, the hot-exit
  backup). `withDesignerHeader` removes every existing copy first, so re-saving can never duplicate
  it, keeps a leading `<?xml …?>`/BOM first, and drops the blank line a removal leaves.
- §76a **Why the save sites need it and the generator alone would not** — `XamlModel.serialize()` is
  tree-based and therefore drops **all** comments (verified: an inline `<!-- note -->` does not
  survive a save; a hand-written comment is silently lost). Stamping at save time is what makes the
  notice survive editing, and it also retro-fits files created by older versions or by hand.
- §76b **Refresh compares header-normalised text** — the on-disk file carries the notice while
  `doc.model.serialize(true)` does not, so the plain `text !== serialize()` check would report a
  change on EVERY refresh and rebuild the model unnecessarily. Both sides now run through
  `withDesignerHeader` before comparing. `t2-logic/xamlHeader.test.js` (33 checks) golden-guards the
  text, idempotency/de-duplication, `<?xml?>`+BOM order, all four producers, every designer write
  site and the parse/save round-trip.
- §75d **The C# follower value type must mirror the generated row property (beta.5)** —
  `csRowClass`/`csGridRowClass` annotate **reference-type** columns (`String`, `Byte[]`) as nullable
  (`public string? Name`) *regardless of `allowNull`*, while the scaffold always sets
  `<Nullable>enable</Nullable>`. The follower generator used to write `ColumnFollower<CustomersRow,
  string>`, so its selector `r => r.Name` returned `string?` into a non-nullable `TValue` →
  **warning CS8603** in every generated C# project (invisible in VB, which has no NRT).
  `followerValueType` now maps `String → string?`, `Byte[] → byte[]?` and the value types unchanged
  (`int`/`long`/`double`/`decimal`/`bool`/`System.DateTime`/`System.Guid`); re-binding rewrites the
  line, so existing projects get fixed on the next bind. Proven by building a real ported project:
  with the old spelling `dotnet build` reports CS8603, with the generated one 0 warnings / 0 errors.
- §77 **File / Folder Selector tools (2026-09-11)** — new bundled helper `resources/PathPicker.cs|.vb`
  (an `AvaloniaChrome` UserControl: fill TextBox bound to `SelectedPath` + right-docked “…” Button)
  exposed as TWO toolbox tools that share the element and differ only by the `PathType` in the
  snippet: tag `PathPicker` (File) and `PathPickerFolder` (Folder) — the same trick as
  GrumpyStatus→`chrome:GrumpyPanel`. Wiring: `controlInfo` (both tags), `propertyCatalog`
  (`CONTROL_PROPS.PathPicker` + `PATH_TYPE`), `ControlFactory` snippet + `TypeMapType` entry,
  `PreviewerHost.csproj` `<Compile Link>` (+ the `hostSourceIsNewer` watch list so a helper edit
  rebuilds the host), `xamlModel` 'needs xmlns:chrome' check, `codeBehind` `VB_CHROME_NS_TYPES`,
  `codeBehindCheck` bundled-helper + Imports rules, `ensurePathPickerHelper` (on drop and via Code
  Fix) and the scaffold/creator so new projects ship the file.
- §77a **VB trap (BC30002, cost one build):** a bundled VB helper must declare
  `Namespace Global.AvaloniaChrome`, NOT `Namespace AvaloniaChrome`. With `<RootNamespace>` set, the
  latter becomes `<Project>.AvaloniaChrome`, which `Imports AvaloniaChrome` does not reach as a bare
  type name — the generated `Private ReadOnly Property PathPicker1 As PathPicker` then fails with
  "Type 'PathPicker' is not defined" while `AvaloniaChrome.PathPicker` (fully qualified) compiles.
  GrumpyPanel.vb/AnchorHelper.vb use `Global.` for exactly this reason; ChromeWindow.vb does not and
  is the source of the older "VB companion" gotcha.
- §77b **The T5 matrix finds new toolbox tools by itself** — it enumerates `TOOLBOX_CATEGORIES` +
  `controlsForGroup` and asserts the placeable-control **count** (33 → 35 with these tools) and
  builds a VB project containing every one of them, so a new tool is compile-verified automatically;
  `tests/helpers/build.js` had to pass `pathPickerCs/pathPickerVb` for the helper to land in the
  generated project.
- §78 **Properties sidebar sections (2026-09-11)** — `src/propertyCatalog.ts` gained
  `PROP_SECTIONS` (ordered `{ id, label, keys }`: editors → layout → appearance → text → data →
  behavior) and `groupPropertyRows()`, which stamps `section`/`sectionId` on every `PropDef` and
  sorts the list: pinned identity rows (`__name__`/`__type__`) first, then sections in that order,
  then the canonical key order inside a section (unknown/dynamic rows keep their relative order at
  the end of their section, so a Grid-cell or SplitPanel row never disappears). Both
  `propertyDefsFor` and `multiCommonProps` end with it. Editor buttons (`kind: 'button'`) are forced
  into Editors even when a future control adds an unlisted one, and **T2 asserts every catalog key
  is listed somewhere**, so a new property can't silently land in the wrong group.
- §78a **Webview side** — `renderProperties` inserts a `.prop-section` heading whenever `p.section`
  changes, skips the rows of a folded section (`state.collapsed[controlType][sectionId]`), and the
  fold is persisted with `vscode.setState({collapsed})` (loaded once at startup by `loadCollapsed()`).
  The scope key comes from the payload's own `__type__` row, so no protocol change was needed; the
  T3 harness stub had to grow `getState`/`setState` (it only had `postMessage`).
- §78b **Two ordering decisions worth keeping** — the Text section lists `TitleBarTitle` before
  `Title` (a ChromeWindow form shows its bar caption first — the old chromeProps assertion demanded
  the chrome rows lead) and Layout lists Dock/Anchor **before** the alignments, matching the order
  agreed with the user.
- §78c **T4 was flaky, not broken** — the headless harness intermittently failed with
  `CS0246 … 'HeadlessApp' could not be found` while the referenced project itself compiled: a
  build-order race inside `dotnet run`. The layer now builds the referenced `HeadlessApp.csproj`
  first (it asserts that build), which made it deterministic.
- §79 **Project Backup toolbar button (2026-09-11)** — new `src/projectBackup.ts`, a pure-`fs`
  module (no `vscode`), so the naming/skip/copy logic is unit-testable: `backupStamp()` →
  `2026-09-11_14-32-05` (Windows-safe, a `:` is not allowed in a path), `backupFolderName()` →
  `<Project>_<stamp>`, `freeBackupPath()` appends `-2`/`-3` on a clash, `backupProject()` walks the
  tree with `statSync` (follows symlinks) and skips `BACKUP_SKIP_DIRS = ['bin','obj','.vs',
  'node_modules','.git']` **at any depth**; it returns `{ path, files, skipped }`. The designer's
  `projectBackup()` case saves FIRST — the open form (`saveCustomDocument`), every open DataSet
  document (via the new `saveOpenDataSetDocuments()` in `dataSetEditor.ts`, a `Map<string, () =>
  Promise<boolean>>` of per-panel “save if dirty” closures registered next to `liveReloaders`, plus
  `vscode.workspace.saveAll(false)`) — and aborts **without copying** if a save fails. T2
  `projectBackup.test.js` (**33**) asserts the naming, the collision suffix, the skip list, a real
  copy against a temp project, and (source-level, because the T3 fixture's buttons carry no labels)
  the `💾 Project Backup` toolbar button.
- §80 **Menu items as file/folder pickers (2026-09-11)** — `MenuNodeKind` grew `FileSelector` /
  `FolderSelector`. Two traps: ① `menuItemEls()` must map `<chrome:PathPicker>` children back to the
  tree, otherwise a save silently DROPS them — the picker is the first menu child that is not a
  `<MenuItem>`; ② `menuElementFor()` sets attributes with `element.setAttribute('PathType', …)`
  rather than string-concatenating XAML (escaping), and calls `model.ensureChromeNamespace()`. The
  row is a **leaf** (`canHaveKids` false) with a px-width field (clamped ≤600) and a “Dialog title”
  field; `sanitizeMenuNodes()` normalises unknown kinds to `Item`. T2 `menuItems.test.js` (**34**)
  covers read-back, the new kinds, `Space` only at depth 1, and every sanitiser rejection.
- §80a **PathPicker kind icon** — the helper draws a 14×14 `Avalonia.Controls.Shapes.Path` docked left
  (`Geometry.Parse`, page for `File`/`SaveFile`, folder for `Folder`), `Fill` bound to `Foreground`
  with `TargetNullValue=Brushes.Gray`, and `UpdateIcon()` re-runs from `OnPropertyChanged` when
  `PathType`/`ShowIcon` change. `ShowIcon` (default `True`) is a new property in
  `CONTROL_PROPS.PathPicker` **and** in the Appearance key list — the T2 property-coverage test fails
  if a catalog key is listed nowhere, which is what caught it.
- §81 **Code Fix false positives — the warning was ours (2026-09-11)** — a user-visible **warning** on
  `MainWindow.axaml.cs` came from `codeBehindCheck.ts`, not the compiler (`dotnet build` 0/0, the
  language server silent): `parseCode` found C# methods with `(?:…)*void\s+name(...)`, and a
  **constructor has no return type**, so `ctors` was empty → rule 6 emitted *“No constructor /
  InitializeComponent”* as a `DiagnosticSeverity.Warning` (published by `publishIssues` → PROBLEMS),
  and `insert-initialize` would have inserted a SECOND ctor (CS0111). A second, VB-side false
  *error* came from `vbMatchingEnd` counting **single-line** lambdas as blocks — VB gives them no
  `End`, so the method's own `End Sub` closed the phantom level and the span collapsed (or ran long →
  wrong-line deletion). Fixes: a C# ctor pass (`<ClassName>(…) … {`, `: base()`/`: this()`, any
  modifier) + a duplicate-ctor safety net; `vbOpensBlock()` (a lambda opens a block only when its
  body starts on a later line) with **one shared** `vbMatchingEnd` exported from `codeBehind.ts`;
  line-anchored C# class-name detection (`// class Dummy` can't hijack it); insertion points inside
  the body (`{` line for C#, after `Inherits …` for VB — VB requires it first) and Data-Image calls
  after `InitializeComponent()`. Lesson: when a user reports a “warning in my file”, run the pure
  analyser first — `node -e "require('./out/codeBehindCheck.js').analyzeCodeBehind({fsPath:…},{})"` —
  a finding published as a diagnostic is indistinguishable from a compiler warning in the pane.
- §82 **First Marketplace publish — the version string was the whole fight (2026-09-12)** — the
  publisher portal rejected the upload with *“The version string '1.0.0-beta.7' doesn't conform to the
  requirements for a version. It must be one to four numbers in the range 0 to 2147483647, with each
  number separated by a period. It must contain at least one non-zero number.”* The Marketplace has no
  semver concept at all: **no tag suffix, ever** — the number must be plain. Resolution: `package.json`
  moved to
  **`0.9.0`** (SemVer's “unstable, pre-1.0” band, and it keeps `1.0.0` free for the first stable
  release — a published number can never be reused and the latest version cannot be deleted), while
  GitHub tags stay `v1.0.0-beta.N`. The payload is unchanged: the published VSIX is byte-identical to
  the local `1.0.0-beta.7` build (the gallery's `VsixSha256` == `sha256sum` of the file). Traps found
  on the way: (a) **“Verifying \<version\>”** in *Manage* only means *not yet validated* — detect it
  with `extensionquery` `flags` bit 32 (`ExcludeNonValidated`): `flags: 914` returns the extension,
  `flags: 950` returns 0 while validating; (b) in `extensionquery` only `filterType 7` (name) and
  `10` (search text) work — `4` and `9` give HTTP 400 and `8` silently returns 0, and a bogus filter
  looks exactly like a real negative, so **probe the probe** before concluding anything;
  (c) the dev machine was installed at `1.0.0-beta.7`, which sorts **above** `0.9.0`, so VS Code will
  never auto-update it from the Marketplace — a version change needs a *force* reinstall (or clearing
  the stale copy out of `~/.vscode/extensions/`) or the old build silently shadows the published one;
  (d) `repository.url` must not end in `.git` — vsce copies it verbatim into the listing's
  `Links.GitHub` / `GetStarted` / `Source`. Guarded from now on by `packaging.test.js`: the manifest
  version is asserted to be plain numbers, not just “valid semver”.
- §82a **Not-yet-validated is invisible: `flags: 950` is the signal (2026-09-12)** — the inherited claim
  in `PUBLISHING.md` (and copied into `README`/`USER_MANUAL`) that a build is hidden from the website
  until a visitor opts into seeing it was **wrong**: the website's own search listed
  `grumpy.avalonia-designer` as an ordinary result card (“by publisher Grumpy … install count 0”), and
  there is no such global control in VS Code either. What actually gates visibility is **validation**:
  VS Code's gallery client always sends `ExcludeNonValidated`, so the same `extensionquery` returns the
  extension with `flags: 914` and **0** hits with `flags: 950` until validation finishes — and that flip
  (under an hour here) is the objective signal that VS Code will start seeing the new version. Lesson:
  the same one as §82(b) — a plausible sentence in a doc is a hypothesis, not a fact; check it before
  repeating it.
- §83 **The measured performance pass, and why a cache must validate itself (2026-09-13, suite
  2786/0, release `1.0.0-beta.8` → Marketplace `0.9.1`).** The pass started from a user report
  ("typing into a property is laggy") and ended up reworking every hot path. Method first, because it
  is what made the rest possible: `tests/bench/hotpaths.js` (`npm run bench`) times the pure
  functions on a synthetic 200-control form, so each change could be *shown* rather than claimed —
  and the numbers went into the changelog instead of adjectives. What it found:
  - **The report was a debounce problem, not a keystroke problem.** A typed property was posted 400 ms
    after the last keystroke, and each post is a full round trip: model edit → previewer re-render →
    new PNG → properties refresh → **panel rebuilt wholesale**. A pause mid-word triggered it, so the
    field was rebuilt under the cursor. Now: commit on `Enter`/blur, with the pending value flushed
    **before** any rebuild — the safety the debounce used to provide, because the extension refreshes
    the panel on its own and a refresh mid-typing must not drop the value. Discrete controls
    (dropdown, confirmed colour, checkbox, palette) still apply immediately: one action, not typing.
  - **The two O(n²) patterns in the checker** were `lineAt` (a full-text rescan per declaration → a
    line-start index + binary search) and a per-accessor `slice+slice` copy of the whole file (→ a
    single-pass count). 14.3 → 11.9 ms; the remainder is analyser CPU, not I/O — measured by feeding
    the same analysis from memory (11.9) vs disk (12.4), which is why a file cache was *skipped* there.
  - **`findByName` was O(N) per call and called per control per render** (2.02 ms per 200-lookup
    pass). Fixed by building ONE `name → Element` index per render pass (`elementIndex()`), not by
    caching inside `XamlModel` — the panel mutates the model's DOM directly, so a cache there would
    need invalidating from every mutation site (drag, resize, property edit, webview message) and one
    missed invalidation silently breaks lookups. 2.02 → 0.028 ms.
  - **The self-validating cache, used twice.** `readDataSetFiles` (nine call sites, each walking the
    tree and parsing every `.adset`) and `findCodeBehindFile` (~35 call sites, each reading the BODY
    of every sibling `.cs`/`.vb` to see which declares the form's class) both cache per key and
    re-validate **on every call** with a cheap signature — the file list plus size and mtime of each
    file. Rationale: a file watcher or an invalidation hook is a promise that every future writer
    must remember to keep; a signature cannot be forgotten. Only `readFileSync`+`JSON.parse` (and the
    class-declaration regex) are skipped. The trap this protects against is a **content** change
    inside an unchanged file NAME — the listing is identical, only the bytes differ — which is exactly
    the case a name-only cache would get wrong, so both test files assert it explicitly.
  - **Re-parsing a document to compare it with itself.** `notifyEdit` (every drag/resize/property
    commit) serialised the document and parsed the text back TWICE — once for the post-edit state it
    had just serialised. The signature of the control set is now read off the live model
    (`namedControlSignature()`), and the model-based value is asserted equal to the parse-based one in
    T2. 3.3–5.0 → 1.5–1.6 ms.
  - **Webview nodes are patched, not rebuilt.** `renderOverlays` cleared the layer and created a div
    per named control every frame, and `renderMenuDummies` did the same to the menu bar (re-creating
    two listeners per chip each time). Nodes are now keyed and reused, the two chip listeners are
    delegated onto the host, and `hitTest` uses a per-frame `state.byName` instead of rebuilding a Map
    per pointer move (17 `.controls.find(x => x.name === …)` scans became `ctrlByName()`).
  - **Host leaks, found by reading rather than timing**: a `RenderTargetBitmap` per frame (~1.4 MB,
    never disposed), a headless window left alive when collection threw, images parsed and decoded
    twice per frame, and a non-collectable dynamic assembly per grid **per render**. Caching only
    successful type lookups matters — a failed lookup cached as "missing" breaks the error card.
  - **Two places deliberately NOT cached**, both for the same reason: `DesignerDocument.dirty` still
    re-serialises (a flag would need bumping at every direct DOM mutation, and one miss loses the
    user's edits) and `serialize()` is not memoised. Both carry an in-code comment so a later
    "optimisation" does not reintroduce the bug class.
  - **Verification habit for this kind of work:** every step kept the full suite green (2667 → 2786
    assertions, never a weakened assertion), and the numbers in the changelog are the harness's, not
    estimates. Benchmarks that cannot be compared between runs are worthless — `npm run bench --
    --json` exists for that.
- §84 **What you upload is what the listing shows (2026-09-13).** `0.9.1` went up from the *plain* VSIX,
  so it is a normal release — even though the docs then still described earlier uploads differently and
  told users to pass `--pre-release`. Four things worth keeping:
  (a) the flag a package carries is fixed at package time and cannot be changed after upload — see
  `PUBLISHING.md` part E for the check that shows what a VSIX carries;
  (b) packaging a second variant needs an explicit `--out`, because `vsce` otherwise overwrites
  `avalonia-designer-<version>.vsix` (again: `PUBLISHING.md`);
  (c) the docs describe the *listing*, not the intention, so they have to be corrected against what is
  actually live — which is why, once `0.9.2` shipped, the install instructions were rewritten for the
  stable `0.9.x` line and the `--pre-release` advice was deleted everywhere it was repeated;
  (d) the gallery's `VsixSha256` is what proves **which** local file is live — `sha256sum` both
  candidates and compare (`0.9.1` matched `avalonia-designer-0.9.1.vsix`, `0.9.2` matched
  `avalonia-designer-0.9.2.vsix`). The Release workflow used to fail on a missing `VSCE_PAT`, which produced a
  failure email for a known setup gap; it now warns, stays green and says **“⚠ NOT PUBLISHED”** in the
  job summary (a failed *publish* still fails the run, so the guard against silently skipping a
  release is kept — the summary and the warning are what distinguish “not attempted” from “published”).
- §85 **Publishing a designed project as a .deb (2026-09-13).** The toolbar's **📦 Publish** builds the
  project the form belongs to and packages it; **🚀 Install** installs the result here. Decisions worth
  keeping, because they are the difference between "works on my machine" and a package someone can
  install:
  - **Framework-dependent on purpose.** `dotnet publish … --self-contained false` plus
    `Depends: dotnet-runtime-<major>.<minor>` (derived from the project's TFM). This is the standing
    project rule — *never bundle the runtime in a .deb* — and it is now asserted by a test, because it
    is the kind of thing that quietly regresses into a 70 MB package.
  - **Layout**: `/usr/lib/<pkg>` + a shell launcher in `/usr/bin/<pkg>` (a wrapper, not a symlink, so
    it can fall back to `dotnet <app>.dll` when there is no apphost) + `/usr/share/applications` entry
    + icon from the form's `Window → Icon`. `dpkg-deb --root-owner-group` avoids `fakeroot`.
  - **The staging tree lives under `<project>/obj/avalonia-publish/`**, so git ignores it and the
    designer's own *Project Backup* (which skips `bin`/`obj`) never copies it.
  - **Generated, not typed.** The build is a written `publish.sh` (paths quoted, `set -euo pipefail`,
    re-runnable by hand) rather than a command line sent into a terminal: long lines with spaces in
    paths are exactly where "works until someone's folder has a space" bugs live.
  - **sudo and the terminal: exactly one command is sent.** A second line queued behind `sudo dpkg -i`
    would be eaten as the password ("Sorry, try again") — so verification happens later, from the
    extension (`dpkg -s`), not by typing into a terminal that may be waiting for input.
  - **Windows is the same idea in the other format**: an MSI built by **WiX** (`dotnet tool install
    --global wix`), per-machine into `Program Files`, harvested by WiX itself (`<Files Include="…\**">`,
    so the file list does not have to be known before `dotnet publish` runs), with a **stable
    `UpgradeCode` derived from the package name** — that is what turns "install a newer build" into an
    upgrade instead of a second entry in *Apps & features*. ProductCode stays auto-generated per build.
    The runtime is a **launch condition** (`HKLM\SOFTWARE\dotnet\Setup\InstalledVersions\x64\sharedhost`)
    rather than a bundle, so no runtime is bundled here either; a Burn bundle that would *download* it is
    the natural next step, and is deliberately not guessed at until it can be tested on Windows.
  - **MSI version numbers are their own kind of strict**: three numbers, major/minor ≤ 255, build ≤ 65535,
    nothing after the third number — MSI truncates silently, and a truncated version breaks upgrades, so
    `msiVersion()` clamps and the TFM supplies the expected runtime major.
  - **Found while testing this (Linux can still test Windows logic):** a project whose `AssemblyName`
    contains an entity (`Norfolk &amp; Sons`) was read straight out of the .csproj as `Norfolk &amp; Sons`
    and would have leaked that text into the package metadata — `assemblyNameOf` now decodes XML entities
    before the value is escaped again on the way into a .desktop file or a WiX product name.
  - **Untested on Windows, and said so**: the generated .wxs, the version/upgrade identity and the
    PowerShell build script are unit-tested, but `wix build` itself has not been run — the changelog and
    the manual state that rather than implying it was verified.
  - **Install is state-driven, not dialog-driven (2026-09-13).** A greyed-out button that explains itself
    beats an enabled button that asks a question, so the three states are computed from the files on disk
    (`packageState`): *none* (no artifact), *stale* (artifact older than the newest source), *ready*.
    Only `ready` enables Install, and `installApp` refuses the other two as well — the UI guard and the
    action guard agree, instead of one trusting the other. Two details that mattered:
    (a) the staleness scan counts **only files that end up inside the app** — a `.md` note or a `.vscode`
    tweak must not invalidate a package, or the button greys out for nothing and the user rebuilds for no
    reason; (b) the build runs in a terminal the extension does not control, so `watchForPackage` polls
    the artifact and reports the change — otherwise the button would stay grey after a *successful* build.
    The state is only posted when it actually changes (it is recomputed on every edit, and answering it
    stats the project's sources).
  - **`disabled` is not a guard.** jsdom (and any synthetic dispatch) delivers a click to a disabled
    button's listeners, while a browser does not fire one at all — so the webview repeats the check in
    the handler. The test asserts that a click in the disabled state posts nothing, which is only
    meaningful because of that guard. (Also: `findProject` walks UP the tree, so "a form with no project"
    has to be tested somewhere with no project above it — /tmp turned out to have a stray `.csproj` in it,
    which the walk found correctly and the test had wrongly assumed away.)
- §86 **"The installed app does not start" was a read-only folder (2026-09-13, OptimisedCSTest).** The
  first real user report against the new **Publish/Install** flow: `dotnet run` in the IDE worked, the
  `.deb` installed cleanly (`/var/log/dpkg.log` shows `status installed`), and starting the app from the
  application menu did nothing at all. The package was innocent — every file in it was correct
  (apphost executable, launcher, `.desktop` entry, the Skia/HarfBuzz/e_sqlite natives). The cause was
  one level deeper, and it is a rule about packaging rather than a bug in the packaging:
  - **The app wrote next to its own binary.** The generated `MyDataSet.cs` resolved both its SQLite file
    and its remembered-folder store with `Path.Combine(AppContext.BaseDirectory, …)`. That is
    `bin/Debug/net10.0` from the IDE (writable) and `/usr/lib/<pkg>` once installed — `drwxrwxr-x
    root/root`, so the user cannot create anything there. The database did not exist yet, so opening it
    had to *create* it → `SQLite error 14` thrown from `MainWindow`'s constructor → **no window, and no
    console to show it** (the `.desktop` entry has `Terminal=false`). "The app does not run" was a
    silently swallowed exception, not a crash on screen.
  - **The general rule:** a package installs into a folder the application must treat as **read-only**.
    Anything created at runtime belongs in a per-user directory —
    `Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)` is `~/.local/share` on
    Linux and `%LOCALAPPDATA%` on Windows, so one line of code is right on both. This stayed invisible
    for the whole life of the project because the IDE always ran the app from a writable `bin/` folder;
    packaging is what exposed it.
  - **Fixed in the generator, not in the test app.** `dataSetGenerator.ts` now emits a `RuntimeStorage`
    helper (`Folder` + `PathFor`, C# and VB) that the `.db`, the legacy XML stores and the
    `<DataSet>.lastfolder` file resolve through; `DatabaseAdapter.DbPath` keeps absolute paths verbatim
    and sends relative ones to `PathFor`. `PathFor` prefers an existing per-user file, then a file an
    earlier build left beside the executable (so a developer's data is not orphaned), then the per-user
    location it is about to create. A new **Code Fix** check (section 14) warns about hand-written
    writes to `AppContext.BaseDirectory` — that finding is `report-only`: it can explain, but rewriting
    someone's storage layout is not something to do to their file automatically.
  - **Verified without running the app** (standing rule: the user runs the app, never an automated UI
    run): generated C# and VB for a DataSet with a SQLite grid table + an XML table were compiled inside
    scaffolded projects (`dotnet build` → 0 errors / 0 warnings, which is also what proves the helper is
    emitted whenever something references it); the `PathFor` logic was probed as a standalone .NET
    file-based app (`LocalApplicationData` → `/home/niel/.local/share`, per-user copy wins, legacy file
    adopted, new data per-user); and the check's precision was probed over six shapes (single-line,
    multi-line, read-only, two writes on one line, `SqliteConnection`, VB).
- §87 **`0.9.3` — a release whose only content is corrected documentation (2026-09-13).** Bumped the
  day `0.9.2` went live, because a package's docs are frozen at upload time and this project had just
  rewritten them: the listing's overview tab is the `README.md` **inside** the VSIX, and a published
  version can never be replaced, so the cleaned install instructions needed a new version number to
  reach the Marketplace at all. Two lessons worth keeping: (a) a doc fix inside a shipped package is a
  *release*, not a commit — check whether a change lands in the VSIX (README, CHANGELOG, `out/**`,
  `media/**`, `resources/**`) before deciding it needs no bump; (b) prove it after building by
  comparing the packaged files with the working tree (`unzip -q <file> -d /tmp/x && diff -rq /tmp/x .`),
  which is how the stale `0.9.2` package was caught in the first place (5 of 92 files differed, all of
  them docs).
- §88 **New icons, and the two things that make an extension icon look wrong (2026-09-14).** A new badge
  arrived (`Grumpy_128x128.png`: the character inside a blue ring on a black field, with a `</>` and the
  Avalonia mark). Two problems, neither visible without looking at pixels:
  (a) it was **100% opaque** — every corner pure black — so on the Marketplace's white page the icon
  read as a black *tile* with a circle inside instead of a floating badge. Fix: mask everything outside
  the ring to transparent. PIL has no "cut out a circle", so the recipe is: find the badge's bounding box
  from its non-background pixels (`max(r,g,b) > 40`), take its centre and radius, render an
  **anti-aliased** circular mask by supersampling 4x and downscaling with `Image.LANCZOS`, then
  `putalpha(Image.composite(alpha, empty, mask))`. A ~1.5 px feather keeps the ring from looking cut;
  (b) an **Activity Bar icon must be monochrome on transparency**, and the badge is colour on black. Fix:
  inside the same mask, colour forced to white with `alpha = max(r,g,b) ** 0.6` (the gamma thickens the
  thin lines), then scaled to 80 % and centred so it carries the same visual weight as the other sidebar
  glyphs. White reads on a dark Activity Bar and washes out in a light theme — exactly what the old glyph
  did, so no regression, and VS Code can't fix it because view-container icons are not recoloured.
  - Both files keep their names (`Grumpy.png`, `GrumpyWhite.png`), so **the manifest is unchanged** — a
    new version number was the only route to the listing, because artwork travels inside the VSIX (the
    same lesson as §87). The source artwork stays in the repo and is `.vscodeignore`d.
  - **`vsce` rewrites relative README images**: the packaged `README.md` carries
    `https://github.com/OomNiel/avalonia-designer/raw/HEAD/Grumpy.png` where the repo has `Grumpy.png`,
    which is how the listing can render a badge that lives in the package. So a packaged README that
    differs from the repo's is not evidence of a stale package — check the diff before chasing it.
  - New guards: `packaging.test.js` asserts the icon is **square**, and runs the PNG/size/square check
    over *every* PNG the manifest names, not just `package.json#icon`.
- §89 **"Latest release" is a second flag, not the absence of the first (2026-09-14).** The GitHub
  release for `0.9.4` was created with `--prerelease` (the house style up to then, matching the `-beta`
  tags). Clearing it with `gh release edit <tag> --prerelease=false` removes the *Pre-release* badge but
  does **not** make GitHub call it *Latest*: `prerelease` and `make_latest` are separate fields, and the
  repository keeps no "latest" at all until `--latest` is set — the API's `releases/latest` returned
  nothing and `/releases/latest` 302'd to the releases *list*. After `--latest` the API returns the tag,
  `gh release list` shows **Latest**, and `/releases/latest` redirects to the tag page — although the
  *plain* URL kept serving the old cached 302 to the list for a while; a `?cachebust=1` request resolved
  correctly, which is how the cache was cleared of suspicion. Both flags are part of the release routine
  in `PUBLISHING.md` part F now, and the README/USER_MANUAL links went back to `/releases/latest`
  (they had been pointing at the releases list precisely because every release was a pre-release).
- §90 **A local AI assist, tier 1: a server, not a model (2026-09-14).** The ask was a small coding
  model **bundled** into the extension that (a) fixes code a developer has edited by hand and (b) writes
  short blocks into a function from a description typed into a dialog — for users who have no AI of any
  kind — with Phi-3-mini as the guess, ~5 GB allowed, Linux first, open source (so *not* through
  Copilot), a ~10 s budget **in RAM, no VRAM**, an optional hardware gate, a **diff** before anything is
  written, C# first with VB.NET best effort. Tier 1 is the part that needs no model in the VSIX: the
  developer points the feature at a local OpenAI-compatible server (LM Studio / Ollama / `llama-server`)
  and gets the whole product experience — prompts, diff, apply, build check — with the model runtime as
  the only thing still to be bundled. What shipped:
  - **`src/assistant.ts`** — the model-agnostic core, containing no `vscode` import at all (a test pins
    that, and it is what makes the file testable and the tier-2 runtime swappable): endpoint
    normalisation, `assessHardware`/`readHardwareFacts` (RAM, CPU threads, AVX2 from `/proc/cpuinfo`,
    arch — `MIN_RAM_GB = 8`, `GOOD_RAM_GB = 16`), `probeServer` (`GET {endpoint}/models`), a streaming
    `chat` with `AbortController` (SSE `data:` deltas via `TextDecoder`, plus a fallback to
    `parseChatCompletion` for servers that ignore `stream: true` — llama.cpp with a small model
    completes and closes before the first delta), the two prompt builders, `extractCode`/`tidyCode` and
    `detectEol`/`reindent`/`spliceMethod`.
  - **`src/assistantUi.ts`** — everything that touches VS Code: the caret's method (`enclosingMethod`),
    a header (usings + the class line) and one short sibling method as a style sample, a cancellable
    progress notification, the diff, and `runBuildTask` (finds the project's `build` task, waits for the
    exit code, 5-minute cap).
  - **Settings** `avaloniaDesigner.assistant.{backend,endpoint,model,timeoutSeconds,maxTokens,temperature}`
    — `backend` defaults to **`off`**, so nothing changes for anyone until they ask. Two commands (*AI:
    Implement in Function…*, *AI: Status and Hardware Check*) plus a `CodeActionProvider` that offers
    *✨ Fix with AI…* only on diagnostics whose `source === 'Avalonia Designer'` **and** whose line is
    inside a method — every structural finding keeps its exact rule-based fix.
- §91 **Why tier 2 is a .NET sidecar, and what the small models can actually do (2026-09-14).** The
  feasibility dig behind §90, recorded because it decides the next step:
  - **Phi-3-mini is the wrong model here, and Microsoft says so.** Its model card carries *"Limited
    Scope for Code — majority of Phi-3 training data is based in Python and uses common packages such as
    'typing, math, random, collections, datetime, itertools' … scripts in other languages … manually
    verify"*. C#/VB.NET to-do → structural conversion to another language, which is exactly what its
    card warns about. The right class is a code-specialised small model: Qwen2.5-Coder 3B (1.93 GB) or
    7B (~4.4 GB at Q4_K_M) both fit the ~5 GB ceiling; the 7B is the quality answer, the 3B the
    latency one.
  - **The RAM-only physics sets the UX, not the model choice.** On this machine (Ryzen 5 7640HS, 12
    threads) a 3B Q4 returns a short method in ~5–15 s and a 7B in ~20–30 s — so the 10 s target holds
    only for *short* answers, which is why the design streams tokens into a progress notification
    (something moves within a second) and caps the request (`MAX_METHOD_LINES = 120`) instead of
    pretending. A GPU (Vulkan/CUDA/Metal) is the real fix and arrives with the runtime.
  - **Bundling options, and the decision.** `node-llama-cpp` is the natural TypeScript choice (MIT,
    prebuilt binaries, all three backends, grammar-constrained JSON output) but it drags a native `.node`
    binary into the VSIX — one build **per platform and architecture**, to be redone whenever VS Code's
    Node ABI moves. The alternative reuses something this extension already proves: it **compiles a
    small C# host on the user's machine** for the previewer. A `LLamaSharp`/ONNX sidecar inherits that —
    NuGet picks the right native backend per RID inside the build — so **one VSIX serves every platform
    and architecture**, and a 5 GB runtime that dies cannot take the extension host with it. That is the
    plan; `assistant.ts` stays transport-agnostic so the fallback remains a change of one module.
  - **Not Copilot's models** (the user's call, and the right one): `vscode.lm` + Copilot would tie a
    "free and open source" feature to a subscription and to VS Code itself. For the record, VS Code also
    lets an extension *provide* models — `registerLanguageModelChatProvider` plus the
    `languageModelChatProviders` contribution point, the mechanism Copilot's BYOK providers use — so a
    bundled local model could later be offered to VS Code Chat, and to other extensions, as well.
  - **The guardrails are the feature.** A small model told to "fix the file" rewrites the file, so the
    prompt asks for **one** method and states the contract ("answer with the complete replacement … in
    one fenced block, no commentary"); `extractCode` takes the **last** fenced block (models echo the
    prompt's code first), accepts JSON, and never throws; the answer is re-indented to the file's own
    indentation and spliced over that method, preserving the blank line after it; the developer reviews a
    **diff**; the write is an ordinary `WorkspaceEdit`, so **Ctrl+Z** works; *Build to verify* is one
    click. Two real bugs the new tests caught, both worth remembering: `extractCode` originally used
    `.trim()`, which stripped the first line's indentation and — since `reindent` re-bases on the
    smallest indent — pushed the whole body one level deeper; and the checker's `CodeMethod.end` includes
    the **blank line after** a method, so a span counted from `end - 1` reported the line *below* the
    closing brace and the splice swallowed the separator between two methods.
  - **Tests are model-free:** 111 new assertions drive the client against a throwaway `http` server
    (streaming SSE, a `stream`-ignoring server, HTTP 500 with a body, a dead port, the model list) and
    cover the pure parts — config clamping, the hardware gate, prompts, extraction, span maths, and the
    manifest wiring.
- §92 **Tier 2: the AI assist brings its own model (2026-09-14).** §90 left the one gap a developer with
  no AI at all still had — a model server. Closing it turned out to be the same trick the designer already
  uses for its previewer: **ship source, build it on the user's machine.** `host/ModelHost/` is a small
  C# HTTP server (LLamaSharp 0.27 + `LLamaSharp.Backend.Cpu`) that speaks the OpenAI API
  `src/assistant.ts` already talks, so the client needed no knowledge of it — `backend: 'bundled'` only
  changes where `endpoint` comes from. The extension builds it on first use with the .NET SDK, and NuGet
  resolves the right llama.cpp binaries for the current runtime identifier *during that build*, which is
  what lets one VSIX cover Linux/Windows/macOS on x64 and arm64: no `RuntimeIdentifier`, no per-platform
  package, no rebuild when VS Code's Node ABI moves. The weights are the other half — a Q4 3B model is
  2.1 GB — so they are downloaded once into `globalStorage`, with progress, cancellation, and a
  **SHA-256 check against the publisher's own hash** (`/api/models/<repo>?blobs=true` gives it, and the
  file is only renamed out of `.part` once it matches). Verified facts baked into the registry:
  `qwen2.5-coder-3b-instruct-q4_k_m.gguf` = 2 104 932 800 B / `724fb256…30b7`, `…-7b-…-q4_k_m.gguf` =
  4 683 073 536 B / `509287f7…4d3c`.
  - **The LLamaSharp API is not what I remembered, and the package says so itself.** Reading
    `~/.nuget/packages/llamasharp/0.27.0/lib/net8.0/LLamaSharp.xml` (the compiler-verified member list)
    before trusting memory caught four wrong guesses: the session type is **`LLama.ChatSession`** (not
    `LLamaChatSession`) and takes an executor plus `AddSystemMessage`/`AddUserMessage`; **`InferenceParams`
    has no `Temperature`** (sampling moved to `SamplingPipeline` — `DefaultSamplingPipeline.Temperature`);
    `HttpListenerContext` has no `RequestAborted`; and the executor is constructed from an `LLamaContext`
    created by `weights.CreateContext(parameters)`. `dotnet build` is the arbiter, and the lesson is the
    same one as in §88: for a C# API, read the package's XML docs or compile it, never recite it.
  - **Three traps, all invisible until a second project lives in `host/`.** (1)
    `PreviewerHost.csproj` globs `**/*.cs` from its own folder, so it swallowed `ModelHost/Program.cs` *and*
    the sidecar's generated `obj/` files — two entry points and duplicate assembly attributes. Fixed with
    `<Compile Remove="ModelHost/**" />` (+ `None Remove`). (2) `.vscodeignore` had `host/obj/**` and
    `host/bin/**`, which match one level deep only: the sidecar's own `bin/` (99 MB of llama.cpp for every
    platform, regenerated on the user's machine anyway) would have travelled in the VSIX. Fixed with
    `host/**/obj/**` and `host/**/bin/**`, and pinned by tests — including "no `.csproj` may be ignored",
    because the runtime being *source* is the whole design. (3) The same one-level-deep assumption in
    **`.gitignore`**: `host/bin/` and `host/obj/` do not match `host/ModelHost/bin/`, so `git add -A`
    committed 132 files of build output (18 MiB packed, mostly llama.cpp's natives) into the repository.
    Untracked, ignored with `host/**/bin/` + `host/**/obj/`, and pinned by two more tests — the lesson
    generalises: every pattern that describes "the build output" has to be written for a *nested* project
    as soon as one exists.
  - **A total timeout would have broken the feature it was written for.** `chat()` originally aborted after
    `timeoutSeconds` in total. A 3B model on a CPU produces ~10 tokens/s, so a 900-token method takes
    60–110 s and would have been killed *while working perfectly*. The timeout is now an **inactivity**
    watchdog re-armed on every chunk: slow-but-alive is fine, silent is caught in seconds. Two tests drive
    a real server to prove both halves (a token every 300 ms past a 1 s budget must succeed; headers then
    silence must fail).
  - **What is deliberately NOT verified here:** that a 3B model actually writes good C#/VB.NET on this
    machine, how many tokens/s it really produces, and whether `/health` behaves on Windows. Running the
    sidecar or downloading 2 GB would be automated app testing, which is off the table — the user runs it,
    the extension's own *AI: Status and Hardware Check* is the diagnostic, and the runtime reports a load
    failure in the health payload (503 with the message) instead of dying silently.
- §93 **A sidebar glyph you can actually see — and the test that finally looks at pixels (2026-09-14).**
  The Activity Bar icon looked "very faint". The cause was measurable, and the surprise was that nothing in
  the repo could have caught it: `GrumpyWhite.png` had been produced by scaling the coloured badge down
  and deleting what was not the glyph, which left **0 fully opaque pixels out of 5 938 ink pixels** — every
  one of them a remainder of antialiasing plus the badge's own translucency — in a 128×128 file that was,
  by every check the suite made (PNG signature, ≥ 128×128, square, not excluded by `.vscodeignore`),
  perfectly correct. In the 24 px sidebar it reads as washed out. It was reported by the user, not by a
  test, which is the interesting part.
  - **Fix: draw shapes, don't scale a picture.** `tools/make-activitybar-icon.py` (new, excluded from the
    VSIX via `tools/**`) draws the glyph from primitives at 1024 with an 8× supersample down to 128, so
    the interior is *exactly* `#FFFFFF` at alpha 255 and only the edges are antialiased: 6 038 of 8 848
    ink pixels fully opaque, one single colour in the file.
  - **What survives at 24 px is decided by looking, not by taste.** Two designs were rendered at real
    size and judged before choosing: a single wide cap visor read as a **headset boom**, and a `</>`
    inside the ring collapsed into a **\"%\" sign**. What ships is the ring plus Grumpy's head with two
    sunglass lenses cut out as negative space (the only facial detail that survives) — an avatar in a
    ring, which is the badge's identity minus the parts 24 px cannot hold.
  - **The new guard decodes the PNG in-process** (`readPng` in `packaging.test.js`, ~50 lines over
    `zlib.inflateSync` with the five scanline filters — no dependency worth adding for 16 K pixels) and
    asserts what actually matters: ink exists, every ink pixel is pure white, a solid core
    (≥ 30% fully opaque), a transparent background, and an unclipped, centred bbox. On the old file that
    suite would have failed on two of them. Lesson: for an icon, "the file exists and is 128×128" is not
    a test of anything a user can see.
- §94 **"(the server decides)" was accurate and useless (2026-09-14).** The status dialog reported
  `Model: (the server decides)` whenever `avaloniaDesigner.assistant.model` was empty — which it is by
  default, and which is right: the request then carries no `model` field and a single-model server answers
  with the model it has loaded. But the user asks that dialog *to find out what is going on*, and the
  answer given was the one thing they already knew. The command now probes first and reports what it
  found: one model → its id; several → the count plus the tip that setting `model` is what pins one down
  (Ollama, notably, rejects a request without a name); server silent → that, rather than a guess;
  `bundled` → the `.gguf` it loads, no probe needed. The wording lives in `describeModel()` in
  `assistant.ts`, so all nine cases are asserted in the suite instead of being discovered in a dialog —
  the same rule the rest of the assistant follows: anything the developer reads is a pure function.
- §95 **A screenshot is a test case: the dialog was offering an embedding model (2026-09-14).** The
  first real status dialog (user's machine, LM Studio on 1234) listed three models — `qwen/qwen3.5-9b`,
  `google/gemma-4-e4b` and **`text-embedding-nomic-embed-text-v1.5`** — and said "set *model* to pin it
  down". Two problems fell out of one screenshot: the third entry **cannot answer a chat request at
  all** (it is an embedding model, listed by every local server next to the chat ones), and pinning meant
  finding a setting by hand. Now: `looksLikeEmbeddingModel()` (`embed|bge|gte|e5` as a word, pure and
  asserted) marks such entries *"(embeddings — cannot answer chat)"* and keeps them **out of the
  counts** the dialog quotes, an embeddings-only server says so instead of inviting a bad choice, and the
  dialog grew **"Pin a model…"** (writes the setting from a pick list) and **"Copy"**. The heuristic
  only drives a hint, never a filter — a false positive costs a word in a dialog, a false negative costs
  the developer a wasted request — which is why it is a naming rule and not a capability probe.
  - **A cost of the workflow worth remembering:** two of the edits made in the same turn were silently
    reverted — the test file's import list and one regex — because it is open in the editor and a save
    from a stale buffer won the race. The suite caught it (`describeModel is not defined`), which is the
    reason the counts in this file are verified against a real run rather than assumed.
- §96 **An empty field whose real value is a URL (2026-09-14).** `assistant.endpoint` defaulted to `""`,
  and `normalizeEndpoint('')` turns that into LM Studio's `http://127.0.0.1:1234/v1` — correct, and proven
  the same afternoon: the status dialog printed `Endpoint: http://127.0.0.1:1234/v1` while the setting was
  untouched. But the settings UI showed an empty box, so "leave endpoint empty" looked like a missing
  value rather than a chosen default; the user asked about it. The default is now the address itself
  (empty still falls back), and because that address is written in **two** places — `package.json` and
  `DEFAULT_ENDPOINT` in `assistant.ts` — the suite asserts they are equal, so a future edit to one of them
  fails instead of silently pointing the feature at the wrong port. General lesson: a default that is
  invisible in the UI is a default users will ask about.
- §97 **The first successful run, and the two things it exposed (2026-09-14).** The user's first working
  request ("A Button1 click must set RadioButton1", 17 s, diff shown) produced two defects that no test here
  could have found, because both are about *time* and *document state*:
  - **A decision offered in a notification expires.** The toast carried Apply/Discard; reading the diff is
    exactly the task that outlives it, so the buttons were gone by the time the developer knew what to
    press. The fix is not a longer timeout but a different surface: a **status bar** item pair and two
    **`editor/title`** buttons on the diff itself, both gated by the context key
    `avaloniaDesigner.proposalPending`, both hidden when the proposal is resolved. The toast stays as a
    shortcut; it is no longer the only door.
  - **An untitled document is dirty by definition.** The right pane of the diff was
    `openTextDocument({ content })`, so closing it — or reloading the window — asked to save a preview.
    The pane is now served by a `TextDocumentContentProvider` on the `avalonia-ai-proposal` scheme: no
    dirty state, no prompt, and `Apply` re-reads the real file and re-splices the answer, so a file that
    changed during the review is handled (with a confirmation) instead of overwritten.
  - Also fixed the friction the user named: *Build to verify* now calls `workspace.saveAll(false)` first —
    a build compiles the disk, so an unsaved editor would verify the wrong thing.
  - **How this turn was nearly lost:** the edits were made into a file whose editor buffer was stale, and
    two of them (an import and a renamed property) were reverted by a save from that buffer while the rest
    landed — leaving a file that compiled with three errors and an editor that refused to save. The
    compile errors are what surfaced it; the lesson is to run `tsc` *before* believing any multi-edit turn,
    and to tell the user to revert the buffer (File → Revert File) rather than save it.
- §98 **"Nothing usable" was a template bug — and it was measured, not guessed (2026-09-14).** The
  bundled model returned *nothing usable* for the very prompt that had worked 17 s earlier. The user's
  reading was "same setup, so what changed?"; the answer is that the two runs did **not** use the same
  backend — their own status dialog proves the successful one ran against LM Studio (`Endpoint:
  http://127.0.0.1:1234/v1`, `Model: google/gemma-4-e4b`), while the failing one ran against the bundled
  runtime, which their settings had switched to (`backend: bundled`, `modelPath: …qwen2.5-coder-3b…`).
  That distinction is only visible because §94/§95 taught the status dialog to name the endpoint and the
  model, which is why it could be diagnosed at all.
  - **The bug:** LLamaSharp's `ChatSession` frames a conversation with the classic Llama-2 transform
    (`[INST] … [/INST]`) unless told otherwise. A Qwen/coder model never sees the start of the assistant
    turn, so it does not know it is supposed to answer *once* — it repeats its first block until the token
    budget dies. Measured through the real client (streaming, same prompt, same model): **30 copies, 4 049
    characters, 39.7 s, cut off mid-fence**, and the cut is what made extraction return nothing usable.
  - **The fix:** `session.WithHistoryTransform(new PromptTemplateTransformer(weights))` uses the template
    the GGUF carries (`tokenizer.chat_template`), plus explicit `AntiPrompts` for the families' turn
    markers (`<|im_end|>`, `<|eot_id|>`, `<|end_of_text|>`, `<end_of_turn>`, …) with
    `DecodeSpecialTokens = true` so the marker can actually match. Same experiment after the fix: **one
    block, 131 characters, 3.1 s** — 13× faster, and the note the user had been shown ("repeated 30
    times") is gone because it does not repeat any more.
  - **Two more defects fell out of the same investigation**, both in reading the answer: an unfenced
    **prose** answer was accepted as code (the model's sentence would have replaced the method — worse
    than doing nothing), and a block that was never closed was discarded instead of salvaged. Both are
    fixed, and the failure is now self-diagnosing: a precise reason, the raw answer in the output channel,
    and a **Show the raw answer** button. "Returned nothing usable" with no evidence is exactly the kind
    of message that wastes a day.
  - **Method note:** this was found by deliberately running the sidecar headlessly with the extension's own
    prompt and *its own compiled client* (`out/assistant.js`) — a 45 s experiment that turned a vague
    report into numbers, a root cause and a before/after. When a model misbehaves, reproduce its exact
    request before touching a prompt.
- **New features:** add a short note here; put the full write-up in `NOTES_2026-09-03.md` when this file fattens.
- §99 **Three reports, one affordance, and the setting that ate my edits (2026-09-14).** The Apply/Discard
  decision was moved out of a notification in §97 and still came back twice: *"there is no button or means
  to apply the diff"*, then *"the tab opens by itself, I had all tabs closed"*. Reading them together is
  what solved it:
  - **A decision offered in a toast expires** (§97) → moved to the status bar and the diff's title bar. The
    user then *found* the title-bar button — so that part worked, and the report that "there is no button"
    was really the next item.
  - **A proposal lives in memory**, so a proposal tab restored by a **window reload** is a dead pane with no
    context key, no buttons and no lens — indistinguishable from "the buttons disappeared". The user
    reloads often (every build in this session) and had a proposal pending each time. `closeStaleProposalTabs()`
    now runs at activation and closes anything of ours, saying so in the output channel.
  - **The buttons now live where the developer is looking**: a **code lens** above the method (*✓ Apply AI
    change* / *✕ Discard*), plus a coloured status bar entry and the title-bar pair. Three surfaces, because
    two were not enough.
  - The status dialog now prints **the running version** (`extension v0.9.13`). "Did my reload take effect?"
    cost real time in this session and should never be guesswork again — a VSIX installed into an open window
    changes nothing until that window reloads, and nothing in the UI used to say which build was live.
  - **And the reason my edits kept vanishing:** `~/.config/Code/User/settings.json` has
    `files.autoSave = "onFocusChange"` with `editor.formatOnSave = true` (and `task.saveBeforeRun = true`).
    Every time focus leaves an editor — which any terminal command does — VS Code saves *all* dirty buffers,
    including ones loaded before my edit, and reformats them. That is how an import, a property name and a
    test assertion were reverted while the rest of a batch landed. Workaround used here: put new assertions in
    a **test file that is not open** in the editor (`assistantReview.test.js`). General rule for this repo:
    after a multi-file edit, verify on disk (grep) and run `tsc`/the suite *before* believing it, and ask the
    user to close the affected tabs or reload the window.
## 7. Feature history

- Original §1–§51: **`NOTES_ARCHIVE.md`** (verbatim).
- §52–§69 (2026-08-31 → 2026-09-03): **`NOTES_2026-09-03.md`** (full write-ups + one-line table).
- Copilot repo-memory log (2026-08-25 → 2026-09-03): **`NOTES_MEMORY_2026-09-03.md`**.

## 8. Known limitations (current)

- Moving is absolute only inside a `Canvas`; elsewhere it uses `Margin` (best-effort).
- Custom/third-party controls the host can't load render as approximations or an error card.
- **Unnamed controls** get temporary in-memory names; stripped on save. The file is **re-formatted on
  save** and the model is tree-based, so **every comment in the file is dropped** (verified: an
  inline `<!-- note -->` does not survive a save). That is why each generated/saved `.axaml` carries
  the fixed notice from `src/xamlHeader.ts` — it is re-stamped on every save instead of being
  preserved.
- Toolbox **drag** is unreliable on Linux/Xorg — the reliable path is **click the tool, then click the canvas**.
- The preview's runtime XAML loader is unreliable (falls back to the programmatic builder).
- The T0 10-project build matrix is slow — run on demand (`npm run test:build`).

## 9. Ideas / next steps

- Duplicate control; copy/paste between forms (cross-file).
- Grid row/column sizing via drag; snapping / alignment guides.
- "Zoom to fit" persistence per document; ruler/guides.
- Optional: load user assemblies into the host for real custom-control preview.
- Optional: host-side hit-testing for precise selection when bounds overlap.

## 10. Reference / prior art

- VB host with the same rendering approach (Avalonia 12 / net10):
  `/home/niel/Projekte/Avalonia/DevHelper/DesignerHost/`.
- Reusable `ChromeWindow` component (master): `/home/niel/Projekte/Avalonia/ChromeWindow/`.
- Spec: `/home/niel/Projekte/Avalonia/DesignerCS_Ext/DesignerCS/Designer Extension.md`.

## 11. §100 — one-command local model setup (2026-09-15, release 0.9.14)

**The requirement was a dropdown in the settings dialog.** That is not possible: a `contributes.configuration`
`enum` is static text in `package.json` — it cannot be filled at runtime from LM Studio. The correct shape is a
**command + quick pick** (`AI: Choose a Local Model…`), which is what shipped. Keep this in mind if a "model
dropdown" is ever requested again.

**What the `lms` CLI actually does (verified on this machine, 2026-09-15 — these are the fixtures in
`tests/t2-logic/localModels.test.js`):**

| Command | Real output | Used for |
|---|---|---|
| `lms ls` | `You have 4 models, taking up 30.70 GB of disk space.` + `LLM` and `EMBEDDING` tables (`google/gemma-4-e4b (1 variant)  7.5B  gemma4  6.33 GB  Local`) | the model list |
| `lms ps` | `No models are currently loaded.` | only the empty case is parsed — the loaded-table format has never been observed, so loaded state comes from the **REST API** instead |
| `lms server status` | `The server is running on port 1234.` | the port, instead of assuming 1234 |
| `lms load <key> --gpu off -c 8192 --estimate-only` | `Estimated Total Memory: 16.52 GiB` / `Confidence: LOW` | the pre-flight warning |
| `GET :1234/api/v0/models` | `{id, type:"vlm"|"embeddings", arch, quantization, state, max_context_length}` | the `type` and `state` fields — the reliable source for "is this a chat model / is it loaded" |
| `/proc/self/limits` (line `Max locked memory`) | `3783143424 … bytes` → 3.78 GB | the mlock warning (`ulimit -l` says 3694476 kB — same number, different unit) |

**Design rules that made it testable:** all parsing and all decisions live in `src/localModels.ts`, which must
**not import `vscode`** (asserted) — so the suite pins every parser against the real text above without LM Studio
installed. `src/localModelSetup.ts` is the thin VS Code half (quick picks, progress, settings writes).

**Two traps to remember:**

- **A `**/*` glob inside a `/* … */` comment closes the comment** (`**/*.log` contains `*/`). This produced
  `TS1109`/`TS1443` cascades 300 lines away from the real cause — the error line is not where the comment broke.
- The embedding row's **PARAMS column is empty**, so a fixed column index reads the size as the architecture.
  Derive it positionally (drop the last two columns, then find the params cell by shape). The suite caught this;
  the first version shipped the bug into the test run.

**Safety properties worth not regressing:** pre-flight before load; never guess the port; report *why* a load
failed (translated) rather than showing a log; prove the model answers before declaring success; leave the
`backend`/`endpoint`/`model` settings written to the user's global settings so the next session just works.

## 12. §101 — thinking models, and the "0 characters" bug (2026-09-15, release 0.9.15)

**Symptom:** the first run with `qwen/qwen3.5-9b` produced a raw-answer tab reading
`# The model's answer, exactly as it arrived  …  0 characters`.

**Cause, measured rather than guessed:** that model is a *reasoning* model. It puts its chain of thought in
`delta.reasoning_content` and only then streams `delta.content`; the extension read `content` alone.

| `max_tokens` | `finish_reason` | reasoning tokens | content | reasoning |
|---|---|---|---|---|
| 120 | `length` | 120 | **""** | 385 chars |
| 200 | `length` | 200 | **""** | 811 chars |
| 1500 | `stop` | 837 | 71 chars | 3 186 chars |

It *does* answer — after ~840 tokens of thinking — so the old default budget (**900**) was smaller than the
model's thinking, which is why nothing ever arrived. Reproduce any of it without LM Studio's UI:
`curl :1234/v1/chat/completions` with `"stream":false` and read `usage.completion_tokens_details`.

**Two switches that do NOT work for this model** (both tried, both ignored by LM Studio):
`chat_template_kwargs: {enable_thinking: false}`, and the Qwen3 `/no_think` convention in the user message.
Do not reach for either as a fix — raise the budget instead.

**What changed:** `parseSseChunk` (+ `parseSseDelta` kept as the narrow view) and `chatDetailed` return
`{text, reasoning, finishReason, completionTokens, reasoningTokens}`; both `reasoning_content` and
`reasoning` (llama.cpp/vLLM) are accepted; `stream_options: {include_usage: true}` (LM Studio honours it —
verified) makes the reasoning token count knowable; the default `maxTokens` is 4096 (manifest + code);
`describeEmptyAnswer(answer, diag)` names the thinking and the setting to change; the progress notification
reports thinking; the raw-answer tab appends the thinking. The wizard's `proveItWorks()` **measures** thinking
and raises `maxTokens` itself, because that is the setting a novice would never know about.

**Lesson for this repo:** when an answer is empty, capture *and measure* the evidence — token counts, finish
reason, and the reasoning text. A UI that says "0 characters" while discarding the rest is not a diagnostic.

## 13. §102 — the AI switch moves into the designer's Settings panel (2026-09-15, release 0.9.16)

**The user's flow, verbatim:** ⚙ Settings → AI on/off switch → model dropdown → load options → *Load Model*
(unloading first) → status check → Save → ready. Their complaints behind it: "the current loaded model does
not unload automatically" when switching, and the palette-only setup being "way too complicated for a novice".

**Structure it produced — copy this if a third front door ever appears:**

| Layer | File | Rule |
|---|---|---|
| pure decisions | `localModels.ts` | parsers, argv, recommendations, scan filters. **Never imports `vscode`** |
| the mechanics | `localModelCore.ts` | discovery, load (unload-first), unload, status, scan, import — **no dialogs**, progress via callback |
| palette front door | `localModelSetup.ts` | quick picks + notifications, calls the core |
| panel front door | `aiPanel.ts` | builds the panel state, answers its messages, calls the core |
| the panel's own UI | `designerPanel.ts` (HTML) + `media/designer.js` + `.css` | the ⚙ Settings modal |

**Decisions the user made explicitly (do not "improve" them silently):** *unload everything* on switching
(`lms unload --all`, not just our own model); **keep** the palette commands as well as the panel; the panel
**stays open with an inline progress line** during a multi-minute load (buttons disabled); and the panel
also exposes `maxTokens` and the timeout, not just the three load arguments.

**Three traps this work found:**

- **`lms import` moves the file by default.** `-c/--copy`, `-L/--hard-link`, `-l/--symbolic-link` are the
  only ways not to. We always pass `--symbolic-link`, or a scan-and-load would take a model out of the folder
  the developer keeps it in.
- **`mmproj-*.gguf` are not models.** They are vision projectors, they live beside the weights (two of the
  six `.gguf` files on this machine are `mmproj`), and loading one fails in a way that says nothing about the
  real problem. `canImportFile()` excludes them and the suite pins the real file names.
- **`when` clauses bind `&&` tighter than `||`.** Gating `editorLangId == csharp || editorLangId == vb`
  naively yields `csharp || (vb && aiEnabled)` — the gate leaks on C#. The language test must be parenthesised.

**A bounded scan is a promise, not an optimisation:** depth ≤ 5, size > 100 MB, 12 s budget, `proc/sys/dev/
run/snap/node_modules` skipped, progress on every third find. The real scan of this machine takes ~6 s; an
unbounded walk that hits a network mount is exactly how an editor gets a reputation for hanging. Files inside
`~/.lmstudio/models` are counted and then **skipped** — LM Studio's model *key* and its file path have no
reliable mapping (the folder says `lmstudio-community`, the key says `google`).

**In the panel, `Save` is not the only door that changes settings.** *Load Model* writes
`backend`/`endpoint`/`model` itself (through `wireSettings` in `localModelSetup.ts`, shared with the palette),
because a load that did not wire the extension would be a load that did nothing. Save is what commits the
switch and the numbers.

### §102b — the panel did not fit, and jsdom cannot see that (2026-09-15)

**The user's report:** "the shape of the settings panel currently hides the top and bottom items". **Cause,
measured:** `.modal-box` had no `max-height` and no overflow, and `.modal-narrow` is only **340px** wide.
The AI section made the box **1553px tall**, and since `.modal` centres it, at 1024×700 the title sat
**426px above** the viewport and Cancel/Save **1127px below** it — with no way to scroll to either.

**How it was measured — reusable, and worth copying.** jsdom (the T3 layer) has **no layout engine**: it
cannot see clipping, so a test there would have passed while the panel was unusable. Instead: a page is
generated from the *real* `media/designer.css` plus the *real* modal markup extracted out of
`designerPanel.ts`, filled by a script with worst-case content (4 code-check rows, 8 model entries, the
full ~15-line status report), served over `python3 -m http.server`, and measured in the integrated Chromium
via `page.evaluate`:

```js
box.scrollHeight > box.clientHeight          // does it need to scroll at all?
title.getBoundingClientRect().top >= 0       // is the top cut off?
save.getBoundingClientRect().bottom <= innerHeight   // is the bottom cut off?
```

Note the integrated browser refuses `file://` outside a trusted folder (403 "File does not reside within a
trusted folder") — serve it over HTTP. Note also that the option labels were checked by measuring
text against `clientWidth - 18` (a `<select>` spends ~18px on its arrow): "recommended for this machine
(off)" needed 199px in a 158px field and rendered as "recommended for [truncated]".

**The fix:** `.modal-box { max-height: calc(100vh - 28px); overflow-y: auto; }` (every modal benefits — an
unbounded modal was one long findings list away from the same failure), `#settingsModal .modal-box
{ width: min(94vw, 560px); }` **scoped by id** because eight other dialogs share `.modal-narrow` at 340px,
a sticky direct-child action row so Save is never off-screen, and the value column widened 120px → 175px
with the labels shortened to fit it.

**Lesson for this repo:** a webview layout bug is invisible to the whole test suite. When a panel is
reported as clipped, measure it in a real engine and record the numbers in the code comment — those numbers
are the only thing that will tell the next reader why the magic `560px` and `calc(100vh - 28px)` are there.

### §102c — the hidden-attribute trap, and what the user asked for (2026-09-15)

**The user's three asks, verbatim:** reword the ambiguous \"download once\" label, wire the load options to the
built-in runtime, add resume to downloads, and *\"in the 'loading — this can take a few minutes…' add the
progress (bytes/total size count)\"*. All four shipped in 0.9.18.

**THE TRAP — an author `display` beats `[hidden]`.** `.ai-opt { display: grid }` in our own stylesheet
overrode the UA stylesheet's `[hidden] { display: none }` (author rules win over UA rules *whatever* the
specificity), so `els.aiOptTtl.hidden = true` did nothing at all and the row stayed on screen. The suite
could not see it: the jsdom test asserted that the code sets `.hidden`, which it does. **Found by rendering
the panel in Chromium and noticing the row that was supposed to be gone.** The fix is one rule
(`.ai-opt[hidden] { display: none }`) and the same trap already produced `.modal[hidden]` in this codebase —
so the rule is: **anything you toggle with the `hidden` attribute in this webview needs a matching
`[hidden] { display: none }` rule if you also set `display` on it.**

**Resume, and the three cases that decide it:**

| Server answer | Meaning | What we do |
|---|---|---|
| `206 Partial Content` | it honoured our `Range` | append to the `.part` file, count progress from the partial size |
| `200` to a ranged request | it ignored `Range`; the body is the whole file | delete the partial first, else the first half lands in the file twice |
| `416` | our partial is past the end of what it has | delete it and restart from zero |

A partial *larger* than the model is never resumed onto (`resumeFromBytes`), and a checksum mismatch still
deletes the file — resuming onto a bad tail would preserve the badness. Progress is throttled to two
updates a second and **a final line is reported at completion**, because the last throttled update could
read "62%" and then sit there while the file finished and the hash ran, which looks like a stall.

**Two smaller findings from the same work:** `downloadToFile` used `https.get` for every URL, so "paste the
address of one" with an `http://` address failed with an unrelated TLS error (the transport now follows the
scheme); and `assistantConfig()` still carried a `maxTokens` default of 900 after the default moved to 4096
(visible when a setting is missing rather than unset).

**The test that makes resume provable** (`modelDownload.test.js`) starts a real `http.createServer` that
honours/ignores ranges on demand and records the `Range` header it was asked with — a truncated first
attempt, then the second attempt's `bytes=262144-`, then a byte-for-byte comparison with the original. It
drives the **real** `downloadToFile`, which is exported for exactly that reason. A re-implementation of the
download in the test would have proved nothing about the extension.

### §104 — "Downloading is not starting" — the bug was the silence (2026-09-15, release 0.9.19)

**The report:** "Downloading is not starting: downloading (first time) and starting the built-in runtime —
this can take a few minutes… Nothing further happens." **The panel's line came from the webview**, which
guessed. Everything the extension needed was already in place, verified here one piece at a time:

| Step | Evidence | Verdict |
|---|---|---|
| the published URLs | `curl -r 0-4095` on both → `206`, `application/octet-stream` | fine |
| the 3B weights | 2 104 932 800 B + `.verified` in globalStorage since 2026-09-14 | already downloaded |
| the first-time build | `dotnet build` in the *installed* extension folder → 0 warnings, 2.4 s (NuGet cached) | fine |
| the sidecar itself | the built binary with the extension's own argv → `MODEL_HOST_READY port=48999` immediately | fine |

So the *work* was fine and the *reporting* was broken: `designerPanel`'s `aiLoad` case awaited
`loadChoice` with **no `try/catch`**, so any throw (a failed download, a build error, the 60 s start
handshake timing out) ended the handler with nothing posted — the panel kept showing the webview's own
optimistic line forever. **Lesson: a UI that promises work it cannot observe is worse than no message.**
The webview must not guess what the extension is doing, and the extension must answer every request.

**What now exists (all asserted in `aiPanel.test.js`, section "silent"):**
`loadChoice` wraps every step and returns a sentence for each outcome; the `aiLoad`/`aiUnload`/`aiStatus`
handlers catch and always post an `aiResult`/`aiStatus`; the webview shows failures **in the progress line**
(it used to clear it and rely on the designer's status bar at the bottom of the window); the extension says
whether the weights are on disk or really downloading; progress re-posts with `(N s)` every 2 s so a slow
first build is visibly alive; the webview itself adds "the extension has not reported back yet" after 10 s;
and every AI step lands in `globalStorage/logs/ai.log` — the Output channel is not something a user can
hand over, a file is.

**Diagnosing the next one:** ask for `~/.config/Code/User/globalStorage/grumpy.avalonia-designer/logs/ai.log`
before theorising. That is the artifact that was missing when this report arrived.

### §105 — the contract between the webview and the extension (2026-09-15, release 0.9.20)

**The user's message after 0.9.19:** `✗ Cannot read properties of undefined (reading 'contextLength')`. That is
the bug that had been invisible since 0.9.16 — the reporting added in 0.9.19 is what finally named it.

**Cause.** `media/designer.js`'s `aiPayload()` returns a **flat** object
(`{enabled, value, contextLength, gpu, ttlSeconds, maxTokens, timeoutSeconds, endpoint}`) and both `aiLoad`
and `saveCodeSettings` send it as `state`/`ai`. `aiPanel.startLoad` read `state.options.contextLength` —
i.e. it expected the shape `panelState()` *builds for the panel*, not the shape the panel *sends back*.
`undefined.contextLength` threw before the first `postMessage`, so the panel's own optimistic line stayed on
screen forever. Two silent failures stacked: a wrong shape and no `catch`.

**Fix.** One payload type, used in both directions: `PanelAiRequest extends RequestedLoad`. The webview's
flat payload *is* that type, so there is nothing to drift. `tests/t2-logic/panelContract.test.js` reads the
field lists out of **both files** and compares them — a source-level contract test, because the two halves
run in different processes and any test of one alone would have passed while the feature was dead.

**Second bug it exposed:** the controls can say "you decide" three ways — context `0`, GPU `auto`, timer
`-1` — and those went straight into the argv, i.e. `--gpu auto` and `--ttl -1`, which LM Studio rejects.
`resolveLoadOptions(model, requested, facts)` (pure, tested) now resolves them against this machine, with
`ttlSeconds: 0` kept as a real choice ("keep it loaded") rather than treated as missing.

**Third bug, reported in the same breath:** "when clicking Save the panel briefly closes then opens again".
The extension answers a save with the same `codeSettings` message it uses to fill the panel, and
`fillSettings` opened the modal whenever it was closed — so the echo undid the user's close. Opening is now
gated on `settingsPending`, set only by the ⚙ Settings button. The T3 webview suite asserts it directly: a
save echo leaves the modal hidden.

**Rule for this webview:** every message that crosses the boundary needs its shape checked by the suite
(`panelContract.test.js`), and a handler that *closes* something must never be undone by a handler that
*fills* something.

### §106 — verifying the selection against the user's own app (2026-09-15, release 0.9.21)

The user asked for a verification run: *"run my testapp 'OptimisedCSTest' to verify the selection of a model"*.
That app lives at `~/Projekte/TestExtApps/OptimisedCSTest` and its `Button1_Click` already holds the handler
from the earlier session (`RadioButton1.IsChecked = true;`). It builds 0/0.

**How to verify this without the designer's webview** (there is no way to drive a VS Code webview with the
browser tools; the useful question is what the *model* does): drive the extension's own compiled modules from
Node with the user's real settings — `normalizeAssistantConfig(settings)` → `buildImplementPrompt(...)` with
the real method text out of their `.axaml.cs` → `chatDetailed(...)` → `extractCode(...)`. A reusable version is
`/tmp/verify-selection.js` (takes project dir, prompt, method name). It is the same path
"AI: Implement in Function…" takes, so its verdict is about the product, not about the harness.

**First result: the selection did not work.** `probe` listed 4 models but the request failed with
`HTTP 400 {"error":{"message":"No models loaded. Please load a model in the developer page or use the 'lms
load' command."}}` — because the settings said `backend: external`, `model: ''`, and LM Studio had nothing in
memory. The `ai.log` shows why it got there: the **bundled** load succeeded twice at 14:39/14:40
("Bundled runtime answering on http://127.0.0.1:33861/v1"), and a later Save moved the selection to an
external server with nothing loaded.

**Second result, after `lms load google/gemma-4-e4b --gpu max -c 8192 --ttl 900` (8.3 s, 5.89 GiB):**
18.6 s, `finish=stop`, 318 tokens, and the model wrote exactly

```csharp
public void Button1_Click(object sender, RoutedEventArgs e)
{
    RadioButton1.IsChecked = true;
}
```

**Two defects that verification exposed, both fixed in 0.9.21:**

1. **A load was announced as done before anything asked it a question.** The bundled path proves itself with a
   one-line round trip; the LM Studio path reported `lms load` exiting 0. That is why the panel could show
   *on* while the wire answered `HTTP 400`. `loadLmStudio` now runs the same proof (`proveItWorks`) and
   reports the failure reason instead of a tick.
2. **The dropdown lied about `model: ''`.** `currentSelection()` returned `''` and `fillAi` fell back to
   `choices[0]` — so the panel displayed the *first* LM Studio model as selected, and Save pinned a model the
   user never chose. There is now an explicit `any:` entry ("Let the server decide — whatever it has loaded")
   at the top of the list, `currentSelection` falls back to it instead of to the first model, and
   `saveAiSettings` keeps `model` empty for it. Choosing it also *checks* the endpoint (probe + one-line
   round trip) and says how many models it offers, or that nothing is loaded.

**Lesson:** the difference between "the CLI exited 0" and "a request answers" is exactly where a green tick
becomes a lie. Prove every load the same way, and never let a dropdown imply a choice the settings do not hold.

### §107 — `not-loaded` contains `loaded`, and `--ttl 0` is an invalid command (2026-09-15, release 0.9.22)

Two defects reported together, and they turned out to be **one symptom seen from both ends**: a model
loaded from the panel neither got pinned nor moved the picker.

**1. Every model wore `● loaded`.** The tag came from a substring test:

```js
const loaded = found.some((m) => /loaded/i.test(String(m.state)));   // LM Studio says "not-loaded"
```

LM Studio's REST state is `"not-loaded"`, which *contains* `loaded` — so the test was true for the entire
list, and the panel honestly showed what it was told. `'not-loaded'.find('loaded') = 4`.

Fix: one exact comparison, in `localModels.ts` (pure, unit-tested), used by both `discover()` and the picker:

```js
export function isModelLoaded(state: unknown): boolean {
    return String(state ?? '').trim().toLowerCase() === 'loaded';
}
```

**2. `--ttl 0` is rejected by `lms load`.** "never — keep it loaded" was translated to `--ttl 0`, and the CLI
answers *`option '--ttl <seconds>' argument '0' is invalid. Number out of range, must be at least 1`*. The
load failed **before** the model key was written to `model`, so nothing was pinned and the picker kept its
old value — the user's *"the selected model does not update and the model is not pinned"*. There is no
"never" value: the flag must be **omitted** to leave the model resident.

```js
if (opts.ttlSeconds >= 1) args.push('--ttl', String(opts.ttlSeconds));   // no flag = no timer
```

`resolveLoadOptions` keeps `0` as the user's explicit choice (not "missing") while `-1`/`NaN`/`''` fall back
to the recommendation — and every resolved request is now asserted to be a legal argv:

```js
for (const ttl of [0, -1, NaN, 3600, 1]) { … t.ok(at < 0 || Number(args[at + 1]) >= 1, …) }
```

**3. A successful load now shows itself.** For a bundled model the pin lives in `modelPath`, not `model`, so
*"did my load take?"* was unanswerable from the panel. `describePin()` writes it in words under the dropdown
(*Pinned: … — the built-in runtime is not running; the next request starts it*), and a bundled entry that is
pinned but idle reads `● pinned, runtime stopped` / `● in use` rather than nothing.

**Lesson:** a substring test against an API's state vocabulary is a guess about that vocabulary — `not-X`
matches `/X/`. And when a CLI needs "unset", unset it: passing a sentinel `0` turns "no timer" into a
rejected command line. Both bugs were invisible from the code and obvious from one `curl` of the API plus
one `lms load` in a terminal.

**Suite:** 3665 passed / 0 failed (was 3645; `aiPanel.test.js` grew from 88 to 110 assertions).

### §108 — the picker named a model that was not the one in use (2026-09-15, release 0.9.23)

Reported right after the 0.9.22 fixes, about the **bundled** path this time: the built-in Qwen2.5-Coder 3B
was loaded — and the log, the settings and a running `ModelHost` all agreed it was — yet the dropdown still
read *"Let the server decide — whatever it has loaded…"*. The user's own diagnosis was *"I think there may
be an indexing problem with the items in the picker?"*, which is worth taking seriously: it is exactly what
an off-by-one looks like on screen.

**The guess was wrong, and the reason is worth writing down.** Choice values are opaque strings
(`bundled:<id>`, `lms:<key>`, `any:`, `custom:<url>`); the webview never converts them to indices (`fillAi`
assigns by value, `aiPayload` reads by value back), and there is no `selectedIndex` arithmetic anywhere in
the picker. Re-run headlessly with the user's own settings, `currentSelection()` returned
`bundled:qwen2.5-coder-3b-q4` and that value *was* among the options. The extension side was right, so the
fault had to be downstream — a state message that never arrived, or one that arrived stale.

**But the instinct pointed at a real hole, in the control itself.** `<select>` has a defect that is
indistinguishable from an indexing bug: assigning a value with no matching option neither throws nor
clears the box — it leaves *another entry* selected, and the display and the truth part company silently.
The panel no longer trusts the assignment:

```js
if (state.selected && els.aiModel.value !== state.selected) {
    const at = (state.choices || []).findIndex((c) => c.value === state.selected);
    if (at >= 0) els.aiModel.selectedIndex = at + 1;   // +1: the placeholder owns index 0
    if (els.aiModel.value !== state.selected) setAiProgress(`the picker cannot show "${…}" — …`);
}
```

Empirically the browser *does* refuse an unknown value (jsdom sets `selectedIndex = -1`), so the guard's
first branch is the one that can fire — which is why the fallback picks the entry by **value**, never by a
remembered position. A picker that cannot show the truth now says so instead of showing another model's
name.

**2. A lost refresh can no longer leave a stale selection.** `aiResult {ok:true, action:'load'}` asks for
`aiState` once more. The state posted as part of the load is the right one; the extra request covers the
case that motivated the report — a webview that was not ready (or a second designer tab) swallowing a
message nobody would ever notice was missing.

**3. The suite had been hiding a throw since 0.9.16.** While adding the guard, the run printed a stack
trace: `applyKindToOptions` wrote into the `.ai-hint` spans inside the option rows, and the jsdom fixture
built those rows as **empty divs**. Every single `aiState` message threw
`TypeError: Cannot set properties of null`, jsdom reported it as *uncaught*, and the rest of the state
application was skipped — 8 exceptions, 0 failed tests, for nine releases. The rows now carry their hint
spans like the real markup, the writes go through a `say(row, text)` guard (a markup change must not be
able to kill the whole panel fill), and the per-runtime wording is asserted for both kinds.

**Lesson:** read the output, not just the total. A suite counts assertions, and an exception that no
assertion stands on is invisible in a green run — `0 failed` alongside a stack trace is still a defect.

**Suite:** 3679 passed / 0 failed (was 3665; `designer.test.js` +14 assertions, including six that would
have failed if the option rows had stayed the way the fixture built them).

### §109 — "unloaded" and "the status still says it is loaded" (2026-09-15, release 0.9.24)

Reported in two parts, and they are two different bugs that happen to share one cause — **the panel never
asked what was in memory**:

1. *"If I then unload that model, the model is unloaded (according to System Resources) but the picker is
   not updated."* The `● loaded` tag and the *"N model(s) in memory right now"* hint on the `any:` entry are
   built from `discovery.loaded`, so they clear on a **fresh state** and on nothing else. The `aiUnload`
   handler posted `aiResult` and `aiStatus` — and no `aiState`. The webview's rule was `msg.action === 'load'`
   too, so neither side refreshed. Both now cover unload, and the webview's own re-request means a lost
   message cannot leave the tag on a model that is gone.
2. *"the status check still shows that model as being loaded."* This one was **true and honest**:
   `Model: google/gemma-4-e4b (asked for by name)` describes what the *next* request will ask for, and with
   an unloaded model that line is still correct. The report simply had no line for *this moment*. It does
   now, from the only source that can answer it:

```
Model: google/gemma-4-e4b (asked for by name)
Loaded now: nothing — the next request loads gemma-4-e4b first.
```

`loadedNow()` in `localModelCore.ts` asks LM Studio's REST API (authoritative: `state`), falls back to `lms
ps` (which reports the "none" case explicitly), and returns `{ known, ids }`. `known: false` — a foreign
server, an unparsed table — **omits the line** rather than printing "nothing is loaded", because that is
the claim a developer acts on. `describeLoadedNow()` is the pure wording, asserted for all six branches.

**A leftover of the same defect 0.9.22 fixed:** `/loaded/i` was still in the load-confirmation loop
(`if (api?.ids.some(… /loaded/i.test(m.state))) break`), so the "wait for the API to say it is loaded"
loop could break on its first pass while nothing was in memory. Now `isModelLoaded(m.state)`.

**Lesson:** "whatever is loaded" is a *time-dependent* fact and a settings-based report is not a substitute
for it. Two surfaces read the same state, and both needed the refresh — the picker and the status. Verified
against the real machine with the user's own settings, which is how the wording was chosen: the report now
names the model the next request will load rather than leaving the reader to reconcile two lines.

**Suite:** 3696 passed / 0 failed (was 3679; +11 status branches, +6 unload/rerequest assertions).

### §110 — who loads the model, who frees it, and who is allowed to say "not downloaded" (2026-09-15, release 0.9.25)

Two reports, one theme: **the panel was a snapshot and the model's life was not owned by anything.**

**1. The model outlived the session.** "When closing the IDE after a coding session, the model in use must be
unloaded to free memory." Nothing did that: LM Studio keeps a model resident until told otherwise, so the
6.3 GB was still there after the IDE was gone. `deactivate()` is now async and frees both runtimes —
`lms unload --all` for LM Studio, `stopModelServer()` for the extension's own sidecar (the same belt-and-braces
reasoning as the C# host in the same function: a window reload or a crashed host skips disposables).

The unload is **spawned detached and not waited for in full**: VS Code allows `deactivate` only a moment,
while freeing 6 GB takes longer than that. A child process that outlives the extension host is what makes
"the memory is free" true rather than hopeful — the same reasoning as `host/Program.cs` exiting by itself
when its WebSocket client disconnects.

**2. "The Qwen models does not work - Not downloaded???"** — and the answer was in three logs, which is the
lesson. In order:

- `logs/ai.log` (UTC): `16:35:43 Load requested: kind=lms key=qwen/qwen3.5-9b`, then nothing until
  `16:36:29 kind=bundled key=qwen2.5-coder-3b-q4` — i.e. the user gave up and picked another model.
- LM Studio's own `server-logs/2026-09/2026-09-15.1.log` (**local** time, UTC+2 — the mismatch cost a
  detour): `18:35:44 Endpoint=loadModel Loading model: qwen/qwen3.5-9b` → `model loaded` → and our proof
  request arriving at `18:35:51`, answered with `Finished streaming response` at `18:36:02` (11.6 s,
  123 tokens, 11.2 tok/s). **The load and the request both worked.**
- The argv, rebuilt from our own compiled code, was byte-identical to what the CLI accepted:
  `lms load qwen/qwen3.5-9b --gpu max --context-length 16384 --identifier qwen/qwen3.5-9b`, and the dry run
  (`--estimate-only`) passed for it exactly as for the model that "works".

So the failure was **in the telling, not in the doing** — and the most probable telling is the built-in
entries' own text. The picker described every built-in model as *"This extension's own runtime — downloaded
once when you press Load Model, then local"*, which is true of the 2 GB file sitting in storage **and** of the
4.4 GB one that has never been fetched. Selecting a built-in Qwen and reading that line is exactly a
"Not downloaded???" question. The entries now answer it: *weights on disk, ready to load* / *a partial
download is on disk — Load Model resumes it* / *not downloaded yet — 4.4 GB to fetch on the first load*, and
the wording stays neutral when the folder was not checked.

**3. Two more staleness holes closed.** The log line for an LM Studio load was the last thing anyone could
learn: `load()` logged the key but never the command line or the outcome, so a load that the server performed
perfectly looked like a failure from the extension's side. It now logs the whole `lms …` line on success.
And because a local server loads a model **just-in-time** when a request arrives, the panel's state can be
overtaken entirely: `refreshAiState()` is called after every request (success or failure — a failed request
can have loaded the model too) and the webview re-asks on window focus while the panel is open.

**Lesson:** when a user says "X does not work", read the *other* side's log before touching the code — this
one proved the doing was correct before any change was made.

**Suite:** 3713 passed / 0 failed (was 3696; +17: the four built-in wordings, the shutdown unload, the
refresh after a request, the focus re-ask, and the duplicate-block cleanup that made one of them real).

### §111 — three failures that were not ours, and the logging that proved it (2026-09-15, releases 0.9.26–0.9.28)

Three reports in a row, all of the shape *"this model does not work"*, and **not one of them was a defect in the
extension's own work** — which is exactly why the work went into the *telling*, and into logging enough to be
able to tell.

**1. `--yes` (0.9.26).** `lms load` prompts before loading a model that reaches LM Studio's resource guardrails,
and we run it without a terminal — so the prompt had nobody to answer it and the child waited out its 30-minute
timeout while the panel showed only *"loading…"*. `lms import` had always passed `--yes`; `load` never did.
Verified against the CLI before and after, and every load now carries it.

**2. Who owns \"Keep Model in Memory\" (0.9.27).** The 17.7 GB model aborted with a translated message that named
the toggle but not its owner, so it read as an extension bug. Verified at the source: LM Studio keeps per-model
load configs in `~/.lmstudio/.internal/user-concrete-model-default-config/`; this machine had **one** file,
`google/gemma-4-e4b.json`, containing `llm.load.llama.keepModelInMemory: false` — which is precisely why gemma
loads — while `qwen3.8-27b` had none and took LM Studio's default of locking. `lms load` has no flag for it and
the CLI has no settings command at all (`chat get load unload ls ps import server log link runtime clone push dev
login logout whoami`), so the message now says the setting is LM Studio's, names the Advanced section, and gives
the `LimitMEMLOCK` alternative with its caveat.

**3. The Vulkan build dying on the iGPU (0.9.28).** After the user turned the lock off — visible in a new
per-model config with `keepModelInMemory: false` ✓ — the failure changed to LM Studio's own jargon
(*\"Engine protocol runtime llama-server … signal=SIGABRT\"*). Its log had the reason:
`radv/amdgpu: Not enough memory for command submission` → `ggml_vulkan: device lost on Vulkan0` →
`vk::DeviceLostError`. **Our argv was `--gpu off --context-length 8192 --yes`** — 0 % offload — so this was not
a setting the user got wrong: `lms runtime ls` shows `llama.cpp-linux-x86_64-vulkan-avx2@2.38.0` **selected**, and
a Vulkan build brings the iGPU up regardless; the Radeon 760M advertises 11.4 GiB of *shared* VRAM while the model
already holds ~16.5 GB of the same 28 GB. The way out is the CPU-only engine that is already installed next to it
(`llama.cpp-linux-x86_64-avx2@2.25.2`).

**What this cost, and the fix for the cost:** reconstructing our own command line by hand from the compiled code —
three times. The success path logged the argv from 0.9.25; the **failure** path logged only the model key, which is
the one that matters. It now logs the whole `lms …` line either way.

**Lesson:** read the other side's log *first*, and log your own inputs on failure, not just on success. \"It does
not work\" is a claim about a system, and the extension is one half of it.

**Suite:** 3721 passed / 0 failed (was 3696; +25 across the three releases: the argv, the prompt, the ownership
sentence and the whole Vulkan branch).

### §112 — "if the model is not in My Models, it does not work in the extension" (2026-09-15, release 0.9.29)

Asked after the 27B was removed from LM Studio. The answer is an architectural fact that was nowhere on screen,
and the user's rule is right: **for an LM Studio entry, the extension is a remote control, not the runtime.** It
runs `lms load <key>` and LM Studio does the loading, so the model has to be a key LM Studio knows — and `lms ls`,
which the picker is built from, *is* the library that My Models shows. A `.gguf` sitting in some folder has no key.

Two ways a model acquires one:

- download it in LM Studio (or `lms get`), or
- use the picker's **Scan machine for models…** — on Load, the extension runs `lms import --symbolic-link --yes`
  (`localModelCore.importModelFile`), which **adds it to My Models** as a link. Without `--symbolic-link` `lms
  import` *moves* the developer's file, which is why that flag is asserted in the suite.

The other entries do not involve LM Studio at all, and now say so: `bundled:` runs in the extension's own runtime,
`custom:` is a server the user runs, `any:` loads nothing (so it only works when something is already in memory
or the server loads just-in-time), and a scanned file is served by the built-in runtime when LM Studio is absent.

**The fix was wording, not mechanism:** `LM Studio · in My Models, ready to load`, `… added to LM Studio first (a
symbolic link — your file stays where it is)`. Both are asserted, including the LM-Studio-absent variant.

**Also noted:** by then `lms ls` listed three models and `~/.lmstudio/models` held only gemma and Qwen3.5-9B — the
27B had been removed, which is consistent with it failing inside LM Studio itself (Vulkan engine, 16.5 GiB of a
28 GiB machine, and §111 above).

**Suite:** 3724 passed / 0 failed (was 3721).

### §113 — the built-in runtime was answering while the panel said "no model loaded" (2026-09-15, release 0.9.30)

Reported as *"when I select either of them, the notice says the server is starting and loading into ram, and then
 the picker reverts again to 'Let the server decide…' and the status shows no model is loaded"* — about the two
built-in Qwen2.5-Coder models, both of which were downloaded by then.

**The extension's own log said the loads worked** — `Bundled runtime answering on http://127.0.0.1:45767/v1`, and
`pgrep` showed the ModelHost alive with the 3B. **The settings were right too** (`backend: bundled`, `modelPath`
→ the 3B), and replaying `panelState()` with them returned `selected: "bundled:qwen2.5-coder-3b-q4"`. So the
doing was correct and the *telling* was not, once more.

The mechanism: for the picker to show `any:` — "Let the server decide" — the state must have been built while
`backend` was still `external`, and for the status to say nothing is loaded it must have been the LM Studio
report. That means the panel was **never told about the load** — and the paths that change the model are four:
the panel's own buttons (which do tell it), `setupBundledModel` from the palette (returns early), the
custom-address path from the palette (returns early), and the LM Studio path. Only the panel's own buttons and a
chat request (`refreshAiState`, added in 0.9.25) refreshed anything.

**Fix:** one shared `refreshPanels()` (state + status) called from all four command paths, with the status marked
`quiet` so a background refresh updates the box without opening it — opening it is the user's action, and a box
that appears by itself reads as a fault.

**Lesson:** "the two front doors cannot disagree" was already the rule for the *settings* (`wireSettings`); it has
to hold for the *display* too. A second entry point that writes state without announcing it is a staleness bug
waiting for a user to find it.

**Suite:** 3727 passed / 0 failed (was 3724).

### §114 — "the picker reverts" and the writer that was hiding in plain sight (2026-09-15, release 0.9.31)

The user corrected my previous diagnosis in one line — they load from the ⚙ panel, not the palette — so §113's fix was
not the answer, and the symptom was still there. What the evidence said this time:

- `logs/ai.log`: `Bundled runtime answering on http://127.0.0.1:39605/v1` — the load worked.
- `pgrep`: the ModelHost alive on 0.9.30.
- `panelState()` run with a **real** context (so `bundledFilesOnDisk()` takes its real path) and the user's
  settings: `selected: \"bundled:qwen2.5-coder-3b-q4\"` — the state we build is right.
- `settings.json`: `backend: external`, `model: ''`, and `modelPath` **still pointing at the 3B**.

That last line is the clue: exactly one writer produces that combination — `saveAiSettings` with kind `any` (a Save
while the dropdown showed *\"Let the server decide\"*). A Save of a bundled selection would have written
`backend: bundled`. So the panel was still holding a state from before the load when the user pressed Save, and the
Save cemented it: `external` + `model: ''` + the old `modelPath`, which is precisely the hybrid found on disk.

**Why the panel could still be stale:** the state was posted as its **own message after** the outcome, and
`postMessage` resolves `false` when it cannot deliver — a queue is not a contract. Fixed by carrying the state **in
the `aiResult`** (so the outcome and the state cannot be separated) while keeping the separate `aiState` and the
webview's own re-request: three ways to be told, and one of them has to land.

**And the diagnostics that would have ended this in one read:** `ai.log` now records
`Load finished (ok) — panel state: backend=… selection=…` and `Panel save: value=… kind=… enabled=…`. Each of the
three user reports in this area was solved by reading the other side's log; the extension's own log was the gap.

**Suite:** 3730 passed / 0 failed (was 3727).

### §115 — one panel is not all panels (2026-09-15, release 0.9.32)

The user corrected §114 in one line: *"No, the picker reverts … directly after the model loaded and before Save can
be pressed"* — so the Save path was not the cause, and the two provable halves stayed provable: `panelState()` with
their settings returns `bundled:qwen2.5-coder-3b-q4`, and the webview applies exactly that (both asserted).

What was left was **which panel hears it**. `attachPanel` kept a single `currentPanel`, assigned on *every message
from any panel* — so with two designer tabs open, all the broadcasts (progress, `refreshAiState`, the command paths)
reached only the one that spoke last, and the other kept the state from when it was opened: `Let the server decide…`,
which is what the user saw. The panel that performed the load was told correctly (that post targets the message's own
panel), which is exactly why the load worked and the picker still looked wrong.

**Fix:** keep every open panel in a `Set` (pruned on dispose), broadcast the state and the progress line to all of
them, and refresh when a tab becomes visible (`onDidChangeViewState` → `visible`) — so switching tabs cannot show a
stale panel either.

**Plus two things that make the next report cheap:** the picker now shows the placeholder instead of silently
falling back to the first entry when a state carries no selection, and the webview reports what it applied
(`Panel applied: wanted=… shown=… choices=…`) next to the extension's `Load finished … selection=…`.

**Lesson:** with N surfaces, "send it to the panel" is a bug waiting to happen; the question is *which* panel, and
the answer has to be "all of them" unless there is a reason.

**Suite:** 3738 passed / 0 failed (was 3730).

### §116 — the write that was overruled: workspace settings beat global ones (2026-09-15, release 0.9.33)

Six exchanges on one symptom — *"the picker reverts to 'Let the server decide…' directly after the model loaded"* —
with two halves that both checked out: `panelState()` with the user's settings returns
`bundled:qwen2.5-coder-3b-q4`, and the webview applies exactly that (both asserted in the suite). Each round I
fixed something real (§113 the palette paths, §114 the state riding with the result, §115 keeping all panels in
step) and the symptom survived — because the cause was not in the extension's logic at all:

```json
// /home/niel/Projekte/TestExtApps/OptimisedCSTest/.vscode/settings.json
{ "avaloniaDesigner.assistant.backend": "external" }
```

A **workspace** setting. Workspace values override global ones, so every `cfg.update('backend', 'bundled',
ConfigurationTarget.Global)` succeeded and changed nothing anyone could see: the extension read the *effective*
value (`external`) and honestly reported "let the server decide" — and the load, the runtime and the log were all
correct. It also explains the shape of the report precisely: **the two LM Studio models worked in that project and
the two built-in ones never could**, because `external` is exactly what LM Studio needs.

The final clue was the shape of the persisted state: `backend: external` together with a `modelPath` still pointing
at the built-in model — a combination only a *save of "let the server decide"* produces… unless the value being
read is not the value being written. That asymmetry is what sent me to `inspect()` and then to the project folder.

**Fix:** one `configView()` for the AI settings, whose `update` writes to the scope that already supplies the key
(folder → workspace → user) — what VS Code's own Settings UI does. A project-level pin is updated rather than
overruled, and a non-global write is logged, because a shadowed write is indistinguishable from a load that did
nothing.

**Lesson:** read the **effective** value, not the one you wrote. `getConfiguration(section).get(key)` and
`.inspect(key)` answer different questions — the first says what is in force, the second says who said so — and
when a write "doesn't stick", the answer is usually a scope above yours.

**Suite:** 3748 passed / 0 failed (was 3738).
