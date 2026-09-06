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
rm -f avalonia-designer-1.0.0-beta.1.vsix && echo y | vsce package --out avalonia-designer-1.0.0-beta.1.vsix \
  && code --install-extension avalonia-designer-1.0.0-beta.1.vsix --force
```
- `vsce` needs an explicit `activationEvents` array when `main` is present.
- The `.vsix` does **NOT** bundle the compiled host (only `host/*.cs` + `.csproj`) — the installed copy auto-builds.
- `.vscodeignore` (NOT `.gitignore`) controls packaging; the `NOTES*.md`/`SESSION.md` dev docs are excluded (~425KB vsix).
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
- **Current: 1605 passed, 0 failed** (2026-09-06). Layer map + gotchas: NOTES_2026-09-03.md §6.

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
│   ├── controlInfo.ts        plain-language {label, desc, use} per control (help panel + tooltips)
│   ├── toolboxProvider.ts    sidebar Toolbox TreeView (drag + click-to-arm)
│   ├── formTemplates.ts / newForm.ts / projectScaffold.ts / projectCreator.ts / projectView.ts
│   ├── projectParser.ts      detects C# vs VB.NET from nearest .csproj/.vbproj
│   ├── hostClient.ts         WebSocket client + PreviewerHostManager
│   └── logger.ts             Output channel "Avalonia Designer" (reliable diagnostics)
├── host/                     C# Previewer Host (net8.0, Avalonia 11.0.10)
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

1. **No public string XAML loader in Avalonia 11.0.10.** `XamlRenderer` tries 3 strategies (reflection
   `IRuntimeXamlLoader`; temp-file loader; programmatic builder). The runtime loader fails broadly, so the
   programmatic builder must handle grids, `<ListBox.Styles>`, images and the chrome title bar faithfully.
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

## 6. Current feature state (2026-09-05)

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
  `sqlite` file sets `file: <DataSetName>.db`) and is created next to the app on first run. Generate
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
  trusted as-is; a brand-new default `<DataSetName>.db` (created next to the app) is just created empty
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
- **RELEASED: `v1.0.0-beta.3` GitHub PRE-RELEASE (2026-09-06)** — tag `v1.0.0-beta.3`, commit c45b27e
  (release prep: CHANGELOG restructured — beta.2 restored to its true released content, all post-beta.2
  work under a fresh beta.3 section; package.json → 1.0.0-beta.3; vsix attached). NOTE: the published
  beta.1/beta.2 GitHub releases predate §73+ — this whole SQLite/DataSet/designer batch first shipped
  in beta.3. Release flow: compile → npm test (1605/0) → vsce package → code --install-extension →
  git add (tests/smoke/ + tests/compliance.json stay .gitignore'd/local-only) → commit → tag → push
  → gh release create --prerelease --notes-file. USER_MANUAL revision date auto-tick landed as a
  follow-up commit db8937b.
- **RELEASED: `v1.0.0-beta.1` + `v1.0.0-beta.2` GitHub PRE-RELEASES**
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
- **RELEASED: `v1.0.0-beta.1` + `v1.0.0-beta.2` GitHub PRE-RELEASES** (tags pushed, .vsix attached,
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
- **New features:** add a short note here; put the full write-up in `NOTES_2026-09-03.md` when this file fattens.

## 7. Feature history

- Original §1–§51: **`NOTES_ARCHIVE.md`** (verbatim).
- §52–§69 (2026-08-31 → 2026-09-03): **`NOTES_2026-09-03.md`** (full write-ups + one-line table).
- Copilot repo-memory log (2026-08-25 → 2026-09-03): **`NOTES_MEMORY_2026-09-03.md`**.

## 8. Known limitations (current)

- Moving is absolute only inside a `Canvas`; elsewhere it uses `Margin` (best-effort).
- Custom/third-party controls the host can't load render as approximations or an error card.
- Unnamed controls get temporary in-memory names; stripped on save, but the file is re-formatted on save (comments kept).
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
