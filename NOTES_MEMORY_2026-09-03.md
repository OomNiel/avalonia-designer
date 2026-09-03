# Avalonia Designer for VS Code — workspace notes

## Property population (effective values) — done 2026-08-25
- Properties panel now shows current/theme-resolved values for every valid property. Host reports
  effective values per control; catalog falls back to them.
- Host: `XamlRenderer.cs` — `ControlInfo.Values` (Dictionary<string,string>); `EffectiveValues(Control)`
  reads Width/Height (Bounds), Margin, FontFamily/FontSize/Background/Foreground/CaretBrush/
  SelectionBrush (reflection + BrushToHex → ISolidColorBrush.Color.ToString()), Padding/
  BorderThickness/CornerRadius/BorderBrush (reflection). Skips empty; null when empty.
- **Avalonia 11 gotcha:** base `Control` has NO FontFamily/FontSize/Background/Foreground
  (they live on TemplatedControl/TextElement) → MUST read those via reflection or CS1061.
- Host `Program.cs`: added `audit` message + `AuditKeys()` (reflection existence check of property
  keys per control type; attached props with '.' assumed valid). Kept for re-verification.
- `propertyCatalog.ts`: `propertyDefsFor(el, effective?)` value chain
  `getAttribute → defaultValue → effective[key] → DEFAULTS[key]` (Opacity % special case first).
  DEFAULTS now: Margin='0', ZIndex='0', MaxLength='0', LineHeight='0', LetterSpacing='0',
  MaxLines='0', MaxDropDownHeight='200'.
- `designerPanel.ts`: `sendProperties` passes `effectiveFor(doc,name)` (from frame
  `controls.find(c=>c.name===name)`, root matched by `c.name===null`).
- Audit result: ALL catalog props valid for real types. DataGrid not loaded in host (separate
  assembly) — valid from knowledge. StatusBar = Border-backed pseudo-type (name StatusBarN).
  ChromeWindow = plain Window + mirrored titlebar.
- Honest blanks stay blank: MaxWidth/MaxHeight (no limit), Canvas.Left/Top (advanced), transparent
  Background, no-border BorderBrush, unset content (Text/Watermark/Command).
- Verify approach: `/tmp/valprobe.js` (host render → dump values), `/tmp/catalogaudit.js`
  (reflection validity), `/tmp/finalcheck.js` (end-to-end population). Host port via `--port`,
  WS protocol `{id,type:'render',xaml,width,height}` → `{type:'frame',png,controls:[{name,type,
  x,y,width,height,values}]}`.

## Double-click robustness — done 2026-08-25
- Bug: occasional single click on a control jumped focus to the code-behind editor.
- Root cause: native `dblclick` on canvas + `.ov` overlays are `pointer-events:none` → ANY two
  clicks within the OS double-click window (even on DIFFERENT controls) targeted the canvas and
  fired `dblclick` → `openEvent` → `showTextDocument`.
- Fix (media/designer.js only): removed native `dblclick`; `click` handler now detects a real
  double-click = two clicks <500ms apart, <10px apart, AND same hit-test name. Place-mode
  (`state.pendingTag`) handled first. Single-click selection path (`{type:'select'}`) never
  opens editors.
- Webview script is a static asset — not compiled by tsc; validate with `node --check`.

## Code review round — REVERTED 2026-08-26
- All 5 candidate fixes from the 2026-08-25 review round were REVERTED (they introduced issues).
  Code is back to the pre-review state: `elementXaml` uses `new Map()` strip map again;
  designer.js has no `firstFrame` (zoom re-fits each frame); hostClient start/request unchanged;
  createNewProject takes no prefs; projectView passes no language.
- The observations are still valid notes for future one-at-a-time work (see NOTES.md section 19).

## TabControl body duplicates in control drop-down — FIXED 2026-08-26
- Symptom: placing a TabControl showed TabControl2Body1 (DockPanel) + TabControl2Body1Canvas
  (Canvas) TWICE in the control drop-down.
- Cause: in a realized TabControl the selected tab's content is reachable via TWO logical parents
  (TabItem.Content AND the TabControl's content presenter) → host `CollectControls` visited the
  same DockPanel/Canvas twice. Runtime app unaffected; previewer-only artifact.
- Fix (host/XamlRenderer.cs `CollectControls`): dedupe named controls with a `seen` HashSet —
  names are unique, so a repeated name is a duplicate. Unnamed template internals still all
  reported. Verified with /tmp/tabdup.js (15 → 13 controls).

## Dock → Fill showed "None" in Properties panel — FIXED 2026-08-26
- Avalonia has no literal `Fill` Dock value: the designer stores Fill as NO `DockPanel.Dock`
  attribute + control as LAST child of a DockPanel with LastChildFill="True". The panel then fell
  through to DEFAULTS['DockPanel.Dock']='None' → Fill reverted to None on refresh.
- Fix (propertyCatalog.ts): `dockValueFor(el)` for the DockPanel.Dock key — attribute if set, else
  'Fill' when last child of a DockPanel whose LastChildFill !== 'False', else 'None'. Other docks
  (Left/Top/Right/Bottom) unchanged. Verified with /tmp/dockcheck.js (6 scenarios).

## Single-click still opened code-behind — tightened double-click 2026-08-26
- Re-report: click-to-select navigation jumps to the .axaml.vb editor. Installed copy DID have the
  section-18 detection (not a stale install). Trigger = two clicks on the SAME control within the
  window (second click lands on the instantly-shown selection rectangle, pointer-events auto).
- Fix (designer.js): double-click window 500ms → 300ms, distance 10px → 6px (same-control kept).
  Deliberate double-clicks (~150-300ms) still work; slower "click, pause, click again" no longer
  counts. If it still triggers, only lever left is timing/behavior change (can't distinguish a
  fast accidental double-click from a deliberate one).

## Double-click replaced by MIDDLE-BUTTON click — 2026-08-26
- User request: the "create code-behind stub" action is now a **middle mouse button click** on a
  control, NOT double-click.
- designer.js: removed all double-click detection (`lastClick`, timing); added `auxclick` handler
  (e.button===1 → hitTest → select + post openEvent) + `mousedown` preventDefault for button 1
  (stops autoscroll/paste). Double-click now just selects twice.
- Updated texts: designerPanel.ts (comments + Name warning), controlInfo.ts (Button help),
  codeBehind.ts comment, USER_MANUAL.md (Section 12 etc). Toolbox tree double-click-to-add is a
  separate feature and unchanged. `openEvent` extension handler unchanged.

## Removed auto-wire on drop — 2026-08-26
- Bug: placing a control immediately created a code-behind default-event stub. Cause: the `drop`
  handler called `wireDefaultHandler(openEditor=false)` for every control with a default event
  (Button→Click etc.), inserting the stub + event attr on placement.
- Fix (designerPanel.ts): removed the auto-wire block from `drop` + removed unused `hasDefaultEvent`
  import. Stub + event attr now ONLY created on middle-click (`openEvent` → openEditor=true).
  Toolbox snippets already have no event attrs. Manual tip reworded (Auto-wired→Generated).

## Renaming a control refactors the code-behind (Name focus-loss) — 2026-08-26
- xamlModel.ts: `renameEventHandlers(old,new)` — renames doc-wide event attrs `<old>_` → `<new>_`.
- codeBehind.ts: `renameHandlersInCodeBehind(uri, old, new)` — renames `<old>_<Event>` identifiers
  in the .cs/.vb file using `\b<old>_(\w+)` (name-boundary guard: Button1 rename never touches
  Button10_Click).
- designerPanel.ts `__name__` handler: after renaming x:Name + syncContentToName, calls
  renameEventHandlers + await renameHandlersInCodeBehind (best-effort). VB accessors stay in sync
  via existing notifyEdit→syncAccessors path.
- designer.js: Name field commits on `change` (blur) or Enter, NOT debounced typing — so the
  rename + refactor happen on Name focus loss.
- Verified with /tmp/renamecheck.js (vscode stub): all 10 checks pass.
- FOLLOW-UP (same day): rename now updates ALL references, not just the VB getter stub/handlers.
  `renameHandlersInCodeBehind` → `renameControlInCodeBehind`; also renames bare `<old>` refs
  (`Button1.Text = ...`, comments, FindControl string) via `\b<old>\b` guard (Button10 untouched).
  Re-verified: 16 checks pass.

## Move-to-container into TabControl descends to visible tab — 2026-08-26
- `moveToContainer` used to append the control directly to a picked TabControl (raw tab item).
- Fix (designerPanel.ts): private `moveTargetFor(doc, container)` — for TabControl descends into
  the ACTIVE tab (activeTabs, fallback first) → down to the tab body Canvas (designer tabs ship
  DockPanel+Canvas), so the control lands in the tab content with Canvas.Left/Top. Stops at nested
  TabControl. ListBox/ItemsControl/Carousel keep item-append semantics.
- Verified with /tmp/movecheck.js (vscode stub, real provider method): all checks pass.
- FOLLOW-UP (same day): moved control could land OUTSIDE the target canvas visible area.
  `xamlModel.moveTo` only set Canvas.Left/Top=0 when absent, so a control from another Canvas kept
  old (out-of-range) coords. Fix: moveTo resets Canvas.Left/Top to origin whenever the control
  ACTUALLY changes parents into a Canvas (moved=true); same-parent move keeps position (no jump).
  Verified with /tmp/moveposcheck.js (5 checks) — all pass.

## Middle-click code-behind — VERIFIED + mousedown robustness 2026-08-26
- User: middle-click / placing no longer generates code-behind. Investigated:
  - Webview harness (/tmp/midtest.html + real designer.js + mock acquireVsCodeApi) → middle-click
    DOES post openEvent. Chromium test → preventDefault on mousedown does NOT suppress auxclick.
  - Full-path probe (/tmp/fullprobe.js, vscode stub) → openEventHandler generates VB stub, sets
    Click attr on model, opens editor. Code WORKS.
  - Likely cause: stale window (no reload) + placing no longer auto-wires (removed per user's own
    request, section 24).
- Change (defensive): designer.js handles middle-click on mousedown (button 1) instead of auxclick
  (preventDefault in the same handler stops autoscroll/paste). Re-verified via harness.

## Move-to-container places without overlap — 2026-08-27
- User: moving a control into a container should not render over existing controls.
- xamlModel.moveTo(el, target, pos?) now accepts an optional position (Canvas.Left/Top = pos).
- designerPanel: `renderedSize(doc, el)` + `freePositionIn(doc, canvas, el)` — finds the first
  non-overlapping spot (origin, then right-of/below each sibling, 8px gap; fallback origin).
  moveToContainer uses it when the target (incl. tab body Canvas from moveTargetFor) is a Canvas.
  StackPanel/Grid/DockPanel unchanged (panels auto-arrange). Verified /tmp/freeposcheck.js.

## StatusDate toolbox control (live date/time) — 2026-08-27
- User answers: built-in composition (TextBlock + timer), OS culture with seconds, C# + VB, live
  placeholder in preview.
- ControlFactory.cs: `StatusDate` snippet = TextBlock with Text={DateTime.Now:G} + Loaded="<n>_Loaded".
- codeBehind.ts: `insertStatusDateClock(uri, name)` inserts a Loaded handler with a per-second
  Avalonia.Threading.DispatcherTimer setting <name>.Text = DateTime.Now.ToString(). LOCAL timer
  (no orphaned field on delete); existing rename/delete flows handle <name>_Loaded + <name> refs.
- designerPanel.ts: drop handler calls insertStatusDateClock when msg.tag === 'StatusDate'.
- Verified /tmp/statusdatecheck.js (snippet + C#/VB code-behind).
- FOLLOW-UP (2026-08-27): VB build error BC36641 — inline `Sub(s, e)` lambda shadowed the enclosing
  handler's `e` param. FIX: lambda params renamed to `Sub(s2, e2)` in insertVbStatusDate (C# uses
  `(_, _)` discards, fine). Existing placed StatusDate still has old line — user must fix manually
  or delete + re-place.

## Anchor property (WinForms-style) — 2026-08-27
- User answers: multi-edge (combine; opposite pairs stretch), bundled helper in generated projects,
  all controls.
- `resources/AnchorHelper.cs` — `AvaloniaChrome.AnchorHelper` + `AnchorTracker` (ConditionalWeakTable).
  Attached `Anchor` ("Left,Bottom"), on control Loaded finds visual-parent Panel, captures fixed
  offsets, subscribes SizeChanged: single edge moves, opposite pair stretches (sets Width/Height).
- **C# gotchas:** static class can't be a generic type arg (`RegisterAttached<AnchorHelper,...>` →
  CS0718) AND the 2-generic `RegisterAttached<Control,string>` overload doesn't exist in Avalonia
  11.0.10 → use a NON-static class with private ctor + `RegisterAttached<AnchorHelper, Control, string>`.
- `resources/AnchorHelper.vb` — VB port. **VB gotchas:** (1) method named `Get` is a VB keyword →
  rename to `GetTracker`; (2) with `<RootNamespace>` set, VB prepends it to `Namespace AvaloniaChrome`
  → type is `<Root>.AvaloniaChrome.AnchorHelper` and the XAML compiler CANNOT resolve it as an
  **attached-property owner** from `using:AvaloniaChrome` (elements like chrome:ChromeWindow resolve
  via a root-ns-aware lookup; attached-property owners do NOT). FIX: `Namespace Global.AvaloniaChrome`.
- Generator: `projectScaffold.ts` ScaffoldOptions + anchorCs/anchorVb, writes AnchorHelper.cs/.vb next
  to ChromeWindow; `projectCreator.ts` reads both resources.
- Catalog: ANCHOR_PROPS key `chrome:AnchorHelper.Anchor`, label Anchor, dropdown [None,Left,Right,Top,
  Bottom,Left,Right,Top,Bottom,Left,Bottom,Right,Bottom,Left,Top,Right,Top]; added for NON-ROOT
  controls in propertyDefsFor; DEFAULTS = 'None' (setting None strips attr).
- xamlModel.ensureChromeNamespace() + designerPanel ensures xmlns:chrome when Anchor set (non-None).
- Host: NO change — `AnchorHelper.Anchor` is skipped by ApplyProperty (unknown prop) → draws at design
  position. chrome: documents already fall to the programmatic renderer.
- xmldom handles the colon-prefixed attribute fine (get/set/serialize; missing → '').
- Verified: /tmp/AnchorTestCs + /tmp/AnchorTestVb (net10 + Avalonia 12.1.1, chrome root, Anchor=
  "Left,Bottom") build 0/0. Packaged + installed. **Existing (non-generated) projects lack the helper
  → Anchor won't compile until AnchorHelper.cs/.vb is copied in; regenerated projects get it free.**
- FOLLOW-UP (2026-08-27): **missing-helper warning.** `designerPanel.ts` now warns once per document
  (anchorWarnedDocs Set) when Anchor is set to non-None on a project lacking the helper.
  `anchorHelperMissing(doc.uri)` uses `findProject` (projectParser) + checks project dir & .axaml dir
  for `AnchorHelper.vb`/`.cs` per language; fires right after ensureChromeNamespace() in setProperty.
  Imports added: `fs`, `findProject`. User hit AVLN2000 in existing TestVBApp (no helper) → fixed by
  copying AnchorHelper.vb in. tsc 0 errors; packaged + installed.

## Refactor (2026-08-28, user-authored) — re-read state
- `package.json`: `contributes.views` order swapped → **`avaloniaDesigner.projects` (New Project) is
  now FIRST** (renders at top of sidebar), Toolbox below. View IDs unchanged. `activationEvents` is now
  just `["onStartupFinished"]`.
- `src/projectView.ts`: webview view fills container dynamically — body = flex column (height:100%),
  `.hint` pinned bottom via `margin-top:auto` (VS Code can't shrink-wrap WebviewView height).
- `src/toolboxProvider.ts`: toolbox tree now grouped into **collapsible categories** (`CategoryItem`)
  mirroring CONTROLS.md `##` sections; `controlsForGroup()` filters CONTROL_CATALOG by `group`.
- `CONTROLS.md` (new): full Avalonia 11.0.10 + 12.1.1 control reference, per-control designer support
  legend (✅ Toolbox / ✓ Previewed / —), categories, docking/anchor/auto-wire docs.
- NOTES.md has new §31 documenting the view-move + dynamic-resize refactor.
- `npm run compile` 0 errors; PROBLEMS clean.
- DOC STALE SPOTS (fixed 2026-08-28): USER_MANUAL.md header revision bumped to 2026-08-28; §6
  auto-wire claim corrected — placing a control does NOT create code (removed 2026-08-26, NOTES §24);
  §6 now says interactive controls have a default event wired via **middle-click** and links to §12.

## DataSet designer (runtime-construction) — 2026-08-28
- User answers: .adset custom editor (JSON persists), generate runtime code + .xsd, auto-detect
  C#/VB, schema-only v1 (no relations).
- New files: `src/dataSetModel.ts`, `src/dataSetGenerator.ts`, `src/dataSetEditor.ts`,
  `media/dataSet.css`, `media/dataSet.js`. Custom editor viewType `avaloniaDesigner.dataSetDesigner`
  for `*.adset`. Command `avaloniaDesigner.newDataSet` (palette) + `openDataSet` (explorer/context).
- Toolbox: **DataSet** item under **Data & Grid** — NOT a form control: ControlItem gives it its own
  command/tooltip, excluded from drag; `addFromToolbox` + form `drop` guard tag 'DataSet'.
- **GOTCHAS:** (1) opening a custom editor must use `vscode.openWith` (showTextDocument has no
  viewType option). (2) C# codegen CS8602 under Nullable enable → use `Columns.Add` return value,
  not the null-annotated `Columns["name"]` indexer. (3) VB root-namespace DOUBLING: emitting
  `Namespace <Root>` in generated .vb gets RootNamespace prepended again → class invisible
  (BC30451) → emit VB class with NO Namespace block (global ns; RootNamespace applied once).
- Verified: /tmp/dsprobe.js + /tmp/DsTestCs + /tmp/DsTestVb — generated code builds 0 warnings and
  RUNS in both C# and VB (tables/columns/types/captions/AllowDBNull all correct). tsc 0 errors;
  PROBLEMS clean; node --check OK; packaged + installed.
- FEATURE (2026-08-28): **bind table → control** in DataSet designer. DATASET panel gets a
  "Bind to control" dropdown (project's named DataGrid/ListBox/ComboBox/ItemsControl), enabled only
  when a table is selected on canvas; `*` marks controls already bound (disabled unless it's the
  current binding); Un-bind button. Model: `DataTableSpec.boundTo` (omitted when null). codeBehind:
  `bindControlToDataSet`/`unbindControlFromDataSet` (DataView property + ctor `Ctrl.ItemsSource =
  Table;` + using/Imports; idempotent; creates code-behind if missing). dataSetEditor: xmldom scan
  of project .axaml for bindable controls + all .adset bound markers; state carries `controls`.
  VERIFIED compiles 0/0 in real Avalonia 12.1.1 projects (C# ListBox + VB ListBox w/ accessor).
- **AVALONIA 12 GOTCHA (FIXED 2026-08-28):** DataGrid lives in the `Avalonia.Controls.DataGrid`
  package. Root cause of "no field / CS0103 / AXN0004" was the package NOT being referenced by
  generated projects — with it present Avalonia 12 DOES generate the field for `dg:DataGrid`.
  FIXES: (1) projectScaffold csproj+vbproj now include Avalonia.Controls.DataGrid; (2) ControlFactory
  DataGrid snippet → `<dg:DataGrid .../>`; (3) xamlModel `ensureXmlns` + addControl adds
  `xmlns:dg="using:Avalonia.Controls"` when placing a DataGrid. A C# FindControl accessor was tried
  but REVERTED (CS0102 collision with the generated field). C# binds DataGrid via generated field;
  VB via FindControl accessors. Verified 0/0 in both (C# + VB, Avalonia 12.1.1 + DataGrid pkg).
  Existing projects must add the package manually.

## Toolbox: ItemsControl + UniformGrid added (2026-08-28)
- `toolboxProvider.ts`: ItemsControl under Items controls & lists, UniformGrid under Layout panels.
- `controlInfo.ts` entries; `propertyCatalog.ts` CONTROL_PROPS + KEY_DEFAULTS/DEFAULTS (Columns/Rows/
  FirstColumn/FirstRow = '0' strips when 0). No default event.
- `host/ControlFactory.cs`: snippets (ItemsControl ships 3 starter TextBlocks) + TypeMap.
  GOTCHA: UniformGrid is in **Avalonia.Controls.Primitives** in Avalonia 11 (CS0246 → added using).
- Verified: `<UniformGrid>` + `<ItemsControl>` resolve from default XAML ns in Avalonia 12 (compile
  test 0/0); host 0/0; tsc clean; packaged + installed. "List Items" editor stays ListBox-only.
- FOLLOW-UP (2026-08-29): placing a DataGrid into an EXISTING project (TestVBApp) → VB accessor
  `DataGrid1 As DataGrid` → BC30002 because the project lacked the Avalonia.Controls.DataGrid
  package. FIX: added the package to TestVBApp.vbproj (builds 0/0) + added a designer warning
  (`dataGridWarnedDocs` + `projectHasDataGridPackage`) in the drop handler: one-time per-document
  warning when a DataGrid is placed into a project not referencing the package. tsc clean;
  packaged + installed.
- FEATURE (2026-08-29): **sample row for bound tables.** Bound tables get a `Rows.Add(...)` in the
  generated MyData.cs/.vb (control shows data at runtime). User answers: auto-regenerate on
  bind/unbind; only bound tables, one row each; sample values TYPED per column in the designer.
  - `DataColumnSpec.sampleValue` (string|null; omitted when null). `csSampleValue`/`vbSampleValue`
    convert typed values to type-correct literals (blank → auto default). `writeGeneratedFiles`
    extracted; Generate button AND bind/unbind call it. Column panel has a "Sample value" field.
  - Verified: generator output correct (bound→row, unbound→none); compiled + RAN in C#/VB console
    apps → `Rows: 1 / 1 | John Doe | Sample | 2024/01/15`. tsc clean; packaged + installed.
- BUG FIX (2026-08-28): DataSet canvas table-drag broken. In `media/dataSet.js` the pointerdown
  handler called setSelection (→ renderCanvas rebuilds ALL .tbl DOM) BEFORE startDrag, so the node
  being dragged was detached (invisible; offsetLeft=0 → jumped to wrong pos on release). FIX:
  capture clientX/Y, setSelection, then re-query fresh node by data-name (CSS.escape) and drag
  that; drag origin = node's style.left/top; cleanup on pointercancel. node --check OK; repackaged
  + reinstalled.
- FIX (2026-08-29): **"DataGrid doesn't render" → bind to a typed `List(Of <Table>Row)`, NOT a
  DataView.** DataGrid auto-generates columns from public properties of bound items; a DataView has
  none and Avalonia ignores ITypedList (confirmed via `strings` on Avalonia.Controls.DataGrid.dll) →
  grid was empty at runtime though it compiled. Fix in `dataSetGenerator.ts`: bound tables now also
  emit `Get<T>()` (List<Row> from DataTable) + a `<Table>Row` class (typed prop per column,
  null-safe reads `== System.DBNull.Value ? null/default : (T)r["X"]` / `If(r("X") Is DBNull.Value,
  Nothing, ...)`, ToString = first string column). `codeBehind.ts` binds to
  `List<TableRow>`/`List(Of TableRow)` property; `removeDataSetBinding` regexes match BOTH old
  DataView + new List shapes (Un-bind cleans up stale DataView props too).
  - **VB GOTCHA (BC30035):** object-initializer members are comma-separated, NO trailing comma.
    `vbGetMethod` must append `,` to every `.X = ...` line except the last (C# allows trailing
    commas — csGetMethod fine).
  - VERIFIED: TestVBApp MyData.vb regenerated → 0/0; C# + VB console runs → GetCustomers() returns
    the 1 sample row (12345 | Koos | koos@koos.com | ...); C# confirms CustomersRow props
    Id(Int32)/Name(String)/Email(String)/CreatedAt(DateTime) = what DataGrid needs. Bind/unbind
    probe: inserts new List property, unbind removes new + old DataView property. tsc clean;
    packaged + installed.
  - Existing `.adset` projects: open designer → **Generate Code** (or re-bind) to get new shape.
    ListBox/ComboBox now show ToString() (= first string column).
- **ROOT CAUSE "DataGrid doesn't render" (2026-08-29): DataGrid CONTROL THEME not registered.**
  `FluentTheme` does NOT include the DataGrid theme (DataGrid is a separate assembly). Without it a
  DataGrid = TemplatedControl with NULL template → paints NOTHING (invisible in app AND designer;
  Background/Border no effect; click still selects via bounds). Not z-order. VERIFIED headless
  (Avalonia 11.0.10 + 12.1.1): `DataGrid.Template` null with plain `<FluentTheme/>`; adding
  `<StyleInclude Source="avares://Avalonia.Controls.DataGrid/Themes/Fluent.xaml"/>` gives a template
  and Background/BorderBrush/BorderThickness all render. FIX applied in 3 places:
  1. `projectScaffold.ts appAxaml()` → generated App.axaml now emits the StyleInclude (C# + VB).
  2. `host/Program.cs App.Initialize()` → adds the StyleInclude (designer preview renders DataGrids).
  3. Existing projects: add it to App.axaml by hand (TestVBApp done).
  Empty unbound DataGrid is still blank (nothing to draw) — set Background or bind it. Bound grid
  shows columns+rows at runtime (AutoGenerateColumns works; headless harness can't drive the load
  lifecycle so `Columns`=0 there). Verified: host 0 err, tsc clean, TestVBApp 0/0, packaged+installed.
- **FOLLOW-UP (2026-08-29): "grid visible but no rows" = STALE binding, not AutoGenerateColumns.**
  AutoGenerateColumns CONFIRMED to work with typed `List(Of <Row>)`: DataGrid source
  `GenerateColumnsFromProperties()` reflects over item public props → DataGridTextColumn per prop
  (bool→CheckBox); `AutoGenerateColumnsPrivate()` gated on `_measured` (real layout pass) — why
  headless showed Columns=0. User's "no rows": `.adset` boundTo marker set + MyData.vb regenerated
  but code-behind line MISSING (project recreated after binding). Re-bind fixed; TestVBApp 0/0.
  - NEW: Properties panel shows DataSet-bound control's **Items Source** as read-only
    `Dataset.Table` (`MyData.Customers`) instead of blank — binding is code-behind, not XAML attr.
    Via `propertyDefsFor(el, effective?, itemSourceOverride?)` + `PropDef.readOnly` +
    designer.js `if (p.readOnly) control.disabled = true;` + `designerPanel.dataSetBindingFor()`
    (scans project .adset via parseDataSet).
  - NEW: Bind on an already-marked-bound table now REPAIRS a stale code-behind —
    `codeBehind.hasDataSetBinding()` checks for `Control.ItemsSource = <Table>` line; if missing,
    re-writes it ("Re-wrote the binding…") instead of "Already bound".
  - Verified: tsc clean, probes pass, PROBLEMS clean, packaged + installed.
- **ROOT CAUSE "still no columns/headers/rows" (2026-08-29): DataGrid AutoGenerateColumns
  defaults to FALSE in Avalonia** (`Register<DataGrid,bool>` has no default → false). The placed
  DataGrid never wrote the attribute → no columns ever generated even with theme + binding. This
  was the FINAL piece. VERIFIED headless (Avalonia 12.1.1): fresh DataGrid = AutoGenerateColumns
  False; with True → Columns=4 (Id/Name/Email/CreatedAt DataGridTextColumn) + row renders
  (pixel-probed). FIX:
  1. `host/ControlFactory.cs` DataGrid snippet emits `AutoGenerateColumns="True"`.
  2. `dataSetEditor.ensureDataGridAutoGenerateColumns(axamlPath, control)` — inserts
     AutoGenerateColumns="True" into the DataGrid opening tag when binding (new-bind + repair
     paths), idempotent regex, respects explicit False.
  3. User's DataGrid1 got AutoGenerateColumns="True" by hand.
  Verified: host 0 err, tsc clean, TestVBApp 0/0, packaged + installed.
- **FEATURE (2026-08-29): DataGrid live row editing (add/edit/delete + persistence).** WinForms-style:
  blank "+ Add row…" row at the grid bottom → popup with type-matched inputs per column + Save;
  right-click a row → Edit/Delete (delete confirms); in-place cell editing also persists; changes
  saved to an XML file (`MyData.<Table>.xml` in AppContext.BaseDirectory) via DataSet.WriteXml.
  - Model: `DataTableSpec.boundToType` ('DataGrid'|'ListBox'|…) set on bind; generator emits the
    grid support only for `boundToType==='DataGrid'`.
  - Generator (`dataSetGenerator.ts`): `Load<T>()` (ObservableCollection from XML, seeds sample row
    if no file, appends placeholder row w/ `IsPlaceholder` + "+ Add row…" in first string col),
    `Save<T>()` (rebuild DataTable after `t.Clear()` to drop CreateDataSet's seed rows), `Wire<T>Grid`
    (ItemsSource; `RowEditEnded`→save; `LoadingRow` per-row: placeholder left-click→Add, real rows
    get ContextMenu Edit/Delete), Add/Edit/Delete async + OwnerOf via
    `LogicalExtensions.FindLogicalAncestorOfType<Window>`. `<T>Row` now INotifyPropertyChanged +
    IsPlaceholder (DataGrid-bound only). `<T>EditDialog` (code-built Window, type-matched inputs;
    Byte[] skipped) + shared ConfirmDialog.
  - codeBehind: `DataSetBindingRef.controlType`; DataGrid bind emits ObservableCollection import +
    `_customers` field + `_customers = MyData.LoadCustomers()` + `MyData.Wire<T>Grid(DataGrid1, _customers)`;
    list controls keep old property+ItemsSource. `removeDataSetBinding` strips new shape (field +
    Load/Wire lines; import left harmless); `hasDataSetBinding` matches `Wire<T>Grid(` too.
  - **Avalonia 12 gotchas (verified):** (1) `Window.DialogResult` REMOVED → `Close(obj)` +
    `await dlg.ShowDialog<T>(owner)`; `Window.Owner` has no public setter → pass owner to ShowDialog.
    (2) `IVisual`/`Visual.VisualParent`/`InputHitTest` GONE → use DataGrid `LoadingRow` (per-row
    handlers), no hit-testing. (3) `DataSet.ReadXml` (data-only) infers string types → C# reads with
    `Convert.ToInt32/ToDateTime` (not `(int)`); VB `CInt/CDate` already convert. (4) VB `Imports`
    must be added BEFORE computing class anchors (else stale index inserts mid-method).
  - Verified: /tmp/DgEditVb + /tmp/DgEditCs (Avalonia 12.1.1) build 0/0 + run (load/save round-trip
    `Sample, Pieter(id=7), + Add row…[PH]`; dialogs construct); TestVBApp regenerated + re-wired →
    0/0; tsc clean; packaged + installed.
  - Existing .adset: re-bind (or Generate) to get boundToType + new code-behind wiring.
  - FOLLOW-UP: hide the `IsPlaceholder` column — AutoGenerateColumns makes a column for every
    public property. Fix: mark it `[Display(AutoGenerateField = false)]` (C#) /
    `<Display(AutoGenerateField:=False)>` (VB); Avalonia DataGrid honors
    DisplayAttribute.GetAutoGenerateField(). Verified headless: 4 columns (Id/Name/Email/CreatedAt),
    IsPlaceholder hidden. TestVBApp 0/0, packaged + installed.
  - FOLLOW-UP (2026-08-29): TWO runtime bug fixes.
    (A) Edit popup didn't apply/save: Edit<T>Row opened the dialog pre-filled but never read inputs
    back into `row` — only `Save<T>(rows)`. Fix: dialogs got `ApplyTo(<T>Row)` (the NewRow read-lines)
    and `NewRow()` calls it; Edit now `{ dlg.ApplyTo(row); Save<T>(rows); }` after ShowDialog ok.
    (B) "+ Add row…" click only selected the cell: placeholder row's `PointerPressed +=` (handledEventsToo
    =false) never fired because the DataGrid CELL handles PointerPressed (selection) first. Fix:
    `AddHandler(PointerPressedEvent, handler, RoutingStrategies.Bubble, true)` — C# inline lambda;
    VB needs a typed handler local (`Dim ph As EventHandler(Of PointerPressedEventArgs) = Sub...`)
    then `row.AddHandler(..., ph, ..., True)` — `row.AddHandler(...)` is a METHOD call (allowed after
    the dot); the `AddHandler evt, handler` STATEMENT can't set handledEventsToo.
    VERIFIED C# headless: ApplyTo updated existing row (Changed/99) + persisted on reload; simulated
    MouseDown/Up on placeholder row → plain `+=` fired False, handledEventsToo handler fired True.
    Both refs + TestVBApp 0/0; tsc clean; packaged + installed. USER_MANUAL §18 already described the
    now-working behaviour (no manual edit needed).
  - FOLLOW-UP (2026-08-29): IN-CELL editing is the method for existing rows + DatePicker for date
    cells. User decisions: auto-save on commit; remove right-click "Edit row…" popup (keep Delete).
    - Wire<T>Grid now: `grid.AutoGenerateColumns = false` + `Build<T>Columns(grid)` (typed columns
      in code) + `ItemsSource`. XAML KEEPS AutoGenerateColumns="True" ONLY for the designer preview
      (host renders XAML without code-behind); runtime override wins (verified: exactly typed
      columns). Build<T>Columns: DataGridTextColumn (text/number/Guid), DataGridCheckBoxColumn
      (bool), DataGridTemplateColumn for DateTime → CellTemplate = formatted TextBlock ("yyyy-MM-dd
      HH:mm"), CellEditingTemplate = DatePicker bound TwoWay with converter. Column type comes from
      the .adset (DateTime), no XAML declaration needed.
    - Avalonia 12 facts (headless-verified): DatePicker.SelectedDate is `DateTimeOffset?` → need a
      DateTime<->DateTimeOffset converter to bind a DateTime property. FuncDataTemplate<T> build
      delegate is `Func<T?, INameScope, Control>` → lambdas MUST take 2 params `(r, _) =>` (1-param
      lambda = CS1662). `DataGridEditAction.Commit` exists in Avalonia.Controls.
    - Save on commit only: RowEditEnded was `(_,_)=>Save(rows)` (fired on Cancel too); now guards
      `if (e.EditAction == Avalonia.Controls.DataGridEditAction.Commit)` (VB single-line If).
    - Shared DateTimeToOffsetConverter: C# plain IValueConverter; VB needs EXPLICIT
      `Implements Avalonia.Data.Converters.IValueConverter.Convert/ConvertBack` (VB implicit
      matching rejects fully-qualified CultureInfo param → BC30149; explicit works, verified in
      minimal repro). Convert: DateTime(non-MinValue)->DateTimeOffset(Local); ConvertBack: ->.LocalDateTime.
    - VERIFIED C# headless on real generated MyData.cs: WireCustomersGrid → exactly 4 typed columns
      (Id/Customer/Email/DataGridTemplateColumn(Created)), date cell shows "2026-08-29 14:44",
      in-cell DatePicker.SelectedDate updates row.CreatedAt (2027-01-15) via TwoWay converter.
      Refs + TestVBApp 0/0; tsc clean; packaged + installed. Docs updated (NOTES §34, USER_MANUAL
      §18, CONTROLS.md).
  - FOLLOW-UP (2026-08-29): runtime UNDO/REDO for bound grids. Default depth 5, settable via a new
    **'Undo-Redo'** property on the DataGrid in the FORM DESIGNER (user chose control property, not
    DataSet table property); shortcuts **Ctrl+U** (undo) / **Ctrl+R** (redo). Covers in-cell edits
    (text/checkbox/date picker) + add + delete.
    - Data model: `DataTableSpec.undoRedoDepth?: number` (default 5, 0 = off). Serialized to .adset
      only when ≠ 5; parsed with default 5. Stored per-table (generator needs it at codegen).
    - Form designer: `propertyDefsFor(..., undoRedo?)` injects an editable 'Undo-Redo' number field
      (key `UndoRedoDepth`) only for a DataGrid bound to a DataSet table. `designerPanel.setProperty`
      special-cases `UndoRedoDepth` (NOT a XAML attr — no setProperty/render): `findBoundTable()`
      locates .adset+table, writes depth, saves .adset, regenerates MyData (.cs/.vb+.xsd via
      generateCs/Vb/Xsd + findProject). designer.js commits on `change` (not per keystroke).
    - Generated runtime (per grid-bound table, C#+VB): snapshot history. `Snap<T>(rows)` deep-copies
      non-placeholder rows into `<T>Snapshot` (list of Row copies + `Key` = loop-built join of
      `"{col}|{col}..."` — NO LINQ, both langs lack System.Linq import). `_<T>Undo`/`_<T>Redo` =
      `List<Snapshot>` (index0 oldest); Push (Add+Trim+clear redo), Trim (RemoveAt(0) over depth),
      Restore (remove non-placeholder, reinsert before placeholder, Save), Undo/Redo (swap stacks).
      Push at Add/Delete before mutating; in-cell edits: `BeginningEdit` snapshots PRE-edit into
      `_<T>PendingEdit`, `RowEditEnded`(Commit) keeps it ONLY if Key changed else discards, Cancel
      discards.
    - Keyboard: local `HandleUndoKey` (C# local fn / VB typed `EventHandler(Of KeyEventArgs)`) with
      `if (e.Handled) return` guard, Ctrl+U/R; attached to BOTH grid.KeyDown and the window
      (`FindLogicalAncestorOfType<Window>(grid,true)` = OwnerOf). Window handler only attaches when
      ancestor reachable at Wire time (app: yes, constructor after InitializeComponent; headless
      test: must Wire AFTER Show or grid handler needs a focused cell).
    - Headless key sim: use `HeadlessWindowExtensions.KeyPress(win, Key.U, RawInputModifiers.Control,
      (PhysicalKey)(int)k, "u")` — `KeyDown` is the EVENT (CS0079/CS0117), not an extension method.
    - VERIFIED C# headless: edit→undo/redo round-trips (Sample↔Edited), delete→Ctrl+U restores, depth
      cap (6 pushes → 5), Ctrl+U KeyPress fired window handler. Refs+TestVBApp 0/0; tsc clean;
      PROBLEMS clean; packaged+installed. Docs: NOTES §34, USER_MANUAL §18, CONTROLS.md.
  - FOLLOW-UP (2026-08-29): interactive 'ITEMS' editor for ComboBox / ListBox / ItemsControl. New
    'Items' property (a `kind:'button'` PropDef) opens a modal popup in the designer webview; type
    one item per line; Save turns each non-blank line into a XAML child item. User decisions:
    store as XAML children (not code-behind), disable when DataSet-bound/ItemsSource, warn before
    replacing complex items, include ItemsControl.
    - xamlModel.ts helpers: `itemsOf(el)` (ComboBox→ComboBoxItem, ListBox→ListBoxItem,
      ItemsControl→all children), `itemText` (Content / TextBlock.Text / single child),
      `setItemText`, `isPlainTextItem` (false on USER name via `hasExplicitName` — auto `_TagN`
      in-memory names DON'T count, verified; false on child controls, EVENT_ATTRS attrs, attached
      props), `newItemFor` + private `makeItem`.
    - propertyCatalog.ts: added 'button' to PropDef/PropTemplate kind unions; injects Items prop
      (value 'Edit items…') for the 3 types, readOnly when itemSourceOverride (DataSet-bound) or
      an ItemsSource attr exists.
    - designerPanel.ts: sendProperties sends `msg.items` (item texts) alongside existing
      `msg.listItems` (ListBox per-item section). New `saveItems` message: trim/blank-filter
      lines, modal warn if any existing item not plain, remove old children, append newItemFor per
      line, auto-grow/shrink Height (ListBox/ItemsControl) by delta×itemHeightFor, then
      notifyEdit/render/sendProperties. NOTE: `msg` is `any` → annotate map+filter params
      (`.map((s: unknown)=>...).filter((s: string)=>...)`) else TS7006.
    - designer.js: renders kind:'button' as `.prop-button` opening the items modal (pre-fill from
      `msg.items`); modal overlay `.modal`/`.modal-box` + textarea + Save/Cancel; Escape +
      outside-click close; Save posts `{type:'saveItems',name,items:[lines]}`. designer.css added
      .prop-button/.modal/.modal-box/.modal-btn.
    - VERIFIED (node probes): itemsOf/itemText/newItemFor per type; isPlainTextItem true for plain
      + auto-named, false for user-named/event/child; propertyDefsFor emits Items for the 3 types,
      MISSING on Button, readOnly when bound; replace produces tidy ListBoxItem children (auto
      names stripped on save). tsc clean; PROBLEMS clean; packaged+installed. Docs: NOTES §34,
      USER_MANUAL §8 + ToC, CONTROLS.md.
    - BUG FIX: modal appeared unprovoked + couldn't be cancelled. Root cause: `.modal { display:
      flex }` (author CSS) OVERRIDES the HTML `hidden` attribute (UA `[hidden]{display:none}`), so
      the modal was always visible and setting `hidden=true` (Cancel/Escape) had no visual effect.
      Fix: add `.modal[hidden] { display: none; }` (specificity 0,2,0 beats 0,1,0). GOTCHA: any
      element toggled via the `hidden` attribute must NOT have an author `display` rule without a
      matching `[hidden]` override — check this whenever a webview modal/overlay "always shows".
  - FEATURE (2026-08-29): UNDO/REDO in the designers (form + DataSet), 5 levels. Ctrl+Z undo,
    Ctrl+Shift+Z AND Ctrl+Y redo (user chose both). The VS Code native onDidChangeCustomDocument
    undo existed but was UNREACHABLE (webviews consume the keys) — so shortcuts are handled in the
    webview and posted to the panel. Form designer does FULL reversibility (user chose): snapshots
    XAML **and** the code-behind file, so renames/deletes that touch code-behind undo cleanly.
    - Design = bounded STATE-LIST pointer history: `{states[], index}`; push post-edit state on
      every notifyEdit; `states.length = index+1` drops redo; cap 6 states (UNDO_STATES =
      LEVELS+1 = current+5 prior → exactly 5 undo + 5 redo); new edit clears redo. Probed:
      5/5/cap/redo-clear ✓.
    - Form (designerPanel): HistoryStep = {xaml, codeBehindPath, codeBehind}; findCodeBehindFile
      (EXPORTED from codeBehind.ts — was module-private) resolves the .axaml.cs/.vb sibling;
      ensureHistory seeds on 'ready'; pushHistory in notifyEdit reads code-behind at that moment
      (renames/delete-with-handlers are AWAITED before notifyEdit, so snapshot = post-edit, prev
      state = pre-edit → reversible); undoRedo restores model + writes code-behind + re-runs
      syncAccessors (covers async accessor race) + render + sendProperties (keeps selection if it
      still exists). History per-doc Map, cleared on dispose. Webview sends selected name.
    - DataSet (dataSetEditor): same state-list, states = serializeDataSet(doc.spec) strings;
      undoRedo = parseDataSet + postState.
    - Webviews: designer.js keydown (inside existing ctrl/meta block after typing guard) +
      dataSet.js keydown; `z`→undo (shiftKey→redo), `y`→redo; preventDefault; typing guard keeps
      text-field editing/undo intact.
    - VERIFIED: tsc clean, PROBLEMS clean, both JS node --check, algorithm probe, findCodeBehindFile
      export probe. Packaged + installed. Docs: NOTES §35, USER_MANUAL §14 shortcuts. Native
      onDidChangeCustomDocument undo/redo kept as-is (XAML-only fallback).
  - DIAG (2026-08-29): "There is no data provider registered that can provide view data." persists
    in the New Project webview view even after reload, though the provider IS registered + the
    extension activates. Verified: installed manifest/main/out correct + current; compiled
    extension.js has createTreeView + registerWebviewViewProvider; fresh diagnostic window
    activated the extension at startup via onStartupFinished (no error). USER MAIN WINDOW logs show
    it activates on `onView:avaloniaDesigner.projects` EVERY host start (host restarts are normal
    window reloads, exit 0). CONCLUSION: the Avalonia Designer container is restored OPEN at window
    startup → the webview view is created BEFORE the extension activates → VS Code commits it to the
    tree-style "no data provider" placeholder and does NOT convert it when the webview view provider
    registers a moment later (known webview-view-shown-before-activation quirk). FIX ATTEMPTED:
    registered the two views FIRST in activate (before maybeRunFirstBuild/PreviewerHostManager),
    added `console.log('[avalonia-designer] ...')` to activate + resolveWebviewView + try/catch in
    resolveWebviewView, reverted redundant explicit activationEvents (VS Code 1.135 auto-generates
    from contributes — linter flags them). WORKAROUND for the user: reload, then toggle the
    Avalonia Designer container (click the activity-bar icon twice) to force the view to re-create
    after the provider is registered; close the container before closing VS Code to avoid a
    restored-open container. Next step if it persists: check Output → Extension Host for the
    `[avalonia-designer]` lines (activate start / views registered / resolving New Project view).
    - Follow-up (2026-08-29): user pasted exthost.log confirming the extension DOES activate at
      startup (onStartupFinished 16:32:00) and in the current host (onCustomEditor for the DataSet
      designer) — so activation isn't the problem. FOUND: extension `console.log` does NOT appear
      in the exthost.log file in VS Code 1.135 (only in the Extension Host output panel) — the
      earlier console.log diagnostics were invisible in the file. FIX: added `src/logger.ts` — a
      shared `vscode.window.createOutputChannel('Avalonia Designer')` + `log()/logError()`; used
      in extension.ts (activate wrapped in try/catch: "activate start" / "views registered" /
      "activate complete" / "activate FAILED") and projectView.ts resolveWebviewView ("resolving
      New Project view" / "resolved" / "FAILED"). Reliable diagnostics: View → Output →
      "Avalonia Designer".
    - ROOT CAUSE FOUND (2026-08-29): the "New Project" view contribution in package.json was
      MISSING `"type": "webview"`. VS Code's default view type is `"tree"` — without
      `"type":"webview"`, the contributed view is treated as a TREE view, and since the extension
      registers a WebviewViewProvider (not a TreeDataProvider) for it, VS Code shows
      "There is no data provider registered that can provide view data". The toolbox (a real tree
      view, default type, has a TreeDataProvider) worked; the New Project webview view didn't.
      FIX: added `"type": "webview"` to the `avaloniaDesigner.projects` view contribution
      (verified in the installed manifest). GOTCHA: for ANY webview view
      (registerWebviewViewProvider), the view contribution MUST include `"type": "webview"` —
      otherwise VS Code treats it as a tree view and the placeholder appears, regardless of
      activation. This was NOT an activation/timing bug at all — activation was fine all along.
  - FEATURE (2026-08-30): 'CUSTOM TITLE BAR' toolbox tool. New projects now use the DEFAULT Avalonia
    title bar (plain <Window> root + Window code-behind); the ChromeWindow bar becomes a Toolbox
    item that converts the window on drop. User decisions: copy-always (ChromeWindow.cs/.vb +
    AnchorHelper still bundled in every new project — conversion needs no copy); category BARS;
    one-way (revert = form designer Ctrl+Z undo, restores XAML + code-behind); title auto-copied
    from window Title.
    - projectScaffold: MainWindow.axaml via buildAxaml(tpl,formName,'Window',ns, displayName?) —
      buildAxaml gained optional displayName (title/body show project name, x:Class stays form
      name); code-behind derives Window. ChromeWindow/AnchorHelper STILL written (copy-always).
      New projects build 0/0 (C#+VB). newForm already used buildAxaml (default bar).
    - toolbox: {label:'Custom Title Bar', tag:'CustomTitleBar', group:BARS} — not a real control,
      a designer action (drop handler special-cases before host.snippet). controlInfo entry added.
    - xamlModel.convertRootToChromeWindow(title): re-tags root Window→chrome:ChromeWindow (copy
      attrs+children, doc.replaceChild), ensureChromeNamespace (xmlns:chrome=using:AvaloniaChrome),
      TitleBarTitle=title, bump Height (+d:DesignHeight if xmlns:d declared) by CHROME_TITLEBAR_HEIGHT
      (44, imported from formTemplates). false if already Chrome or root not Window.
    - codeBehind.convertCodeBehindToChrome(uri): C# `: Window`→`: AvaloniaChrome.ChromeWindow`;
      VB `Inherits Window`→`Inherits AvaloniaChrome.ChromeWindow` (fully-qualified — VB Imports
      gotcha). Idempotent. NOTE: findCodeBehindFile returns the .cs FIRST if BOTH .cs+.vb exist
      (test artifact only — real projects have one).
    - designerPanel: drop special-case CustomTitleBar → applyCustomTitleBar (guards already-Chrome /
      non-Window; convert model + code-behind BEFORE notifyEdit so undo snapshots capture converted
      code-behind; render; sendProperties(null) shows root → Title Bar Text/Icon; info msg).
    - Host preview already mirrors chrome:ChromeWindow roots (XamlRenderer BuildChromeTitleBar) →
      designer shows the custom bar after conversion.
    - VERIFIED: model probe (Window→ChromeWindow +44 height/DesignHeight, xmlns:chrome, TitleBarTitle,
      false on already-converted + UserControl); codeBehind probe (C# + VB); generated default-bar
      projects build 0/0; CONVERTED projects build 0/0 in C# AND VB. tsc clean; PROBLEMS clean;
      packaged+installed. Docs: NOTES §36, CONTROLS.md Bars + section, USER_MANUAL §2 + §16 + ToC.
  - FIX (2026-08-30): sidebar "Create C#/VB.NET Project…" buttons asked for the LANGUAGE first even
    though the button implies it. `createNewProject(context, forcedLanguage?: 'cs'|'vb')` now skips
    `pickLanguage()` when forced; projectView sends 'cs'/'vb' from the createCs/createVb messages.
    The generic `avaloniaDesigner.newProject` command (no forced language) still asks language first
    (correct). Verified arity 2; tsc clean; PROBLEMS clean; packaged+installed. USER_MANUAL §2 note.
  - FEATURE (2026-08-30): FILE BROWSER for file-path properties. The only file props are **Image →
    Source**, **Window → Icon**, **ChromeWindow → Title Bar Icon** (Background/BorderBrush/etc are
    COLOURS → colour picker; FontFamily is a font name; ItemsSource is a binding). User chose
    **copy-into-project + pack URI** (portable, not absolute paths).
    - propertyCatalog: added 'file' to PropDef/PropTemplate kind unions; Source/Icon/TitleBarIcon are
      kind:'file'. designer.js renders .prop-input-group (text input posts setProperty — typing a
      path/avares URI still works) + .prop-browse "…" button → post {type:'browseFile',name,key}.
      designer.css .prop-browse.
    - designerPanel 'browseFile': showOpenDialog (Images png/jpg/jpeg/gif/bmp/webp for Source; Icons
      ico/png for Icon/TitleBarIcon; root window via msg.name ?? doc.model.root) →
      bundleProjectFile(proj,path): copy to `<root>/Assets/` unique name (stem-N dedupe) →
      ensureAvaloniaResources(proj) (idempotent `<AvaloniaResource Include="Assets\**"/>` ItemGroup
      before `</Project>`) → returns `avares://<projectName>/Assets/<file>` → setProperty+notifyEdit+
      render+sendProperties+info. No-project fallback warns (type manually).
    - VERIFIED: propertyDefsFor emits kind:'file'; end-to-end /tmp/FileProbe (Assets PNG +
      AvaloniaResource + avares Image) dotnet build 0/0. GOTCHA: designer PREVIEW can't render
      avares://Project/... (host lacks user project's assets) — placeholder in designer, correct at
      runtime. tsc clean; PROBLEMS clean; packaged+installed. Docs: NOTES §37, CONTROLS.md,
      USER_MANUAL §8.
  - FIX (2026-08-30): ChromeWindow title bar now renders the caption buttons (min/max/close) AND
    the TitleBarIcon in the DESIGNER PREVIEW (was title-text-only; runtime was fine). Two parts:
    (1) `XamlRenderer.BuildChromeTitleBar` gained a static `CaptionButton()` helper (42x44,
    transparent, white glyph — `\u2013`/`\u25A1`/`\u2715`) right-aligned + a 26x26 `Image` (left,
    margin 12/0/10/0) when the icon resolves. (2) The host render request now carries an optional
    `projectPath` so the host can resolve the icon spec: `hostClient.render(xaml,w,h,projectPath?)`,
    `designerPanel.render()` sends `findProject(doc.uri)` root dir, `Program.cs` reads it,
    `Render/LoadWindow/BuildWindowFromXaml/BuildChromeTitleBar` thread it; `TryLoadTitleBarIcon`/
    `ResolveAssetPath` map `avares://Name/Assets/f` → `<root>/Assets/f`, `/Assets/f` → `<root>/Assets/f`,
    absolute path → as-is, relative → `<root>/spec`; unresolvable → null (icon hidden, no crash).
    GOTCHA: designer emits TitleBarTitle/TitleBarIcon as PLAIN attributes (setAttribute), NOT
    `chrome:ChromeWindow.TitleBarTitle` (whose XML LocalName is `ChromeWindow.TitleBarTitle`) —
    lookups must match LocalName == "TitleBarTitle"/"TitleBarIcon". PROBE-VERIFIED via real host
    render + PNG pixel decode: navy bar 14,33,56, centred title AA pixels, `□`+`✕`+dash glyphs, and
    a 26x26 icon block at x12-38/y8-33 (exactly the runtime position) resolved from
    avares://FileProbe/Assets/test.png. Decoder gotcha: PNG Sub/Average/Paeth filters must use the
    RECONSTRUCTED left neighbor (out[...]) not the raw byte — using raw gives all-black images.
    Still limited: plain body `<Image Source="avares://…">` remains a placeholder (runtime loader
    has no project assets; programmatic ApplyProperty doesn't string→IImage). dotnet --no-incremental
    0/0, tsc clean, packaged+installed. Docs: NOTES §38, CONTROLS.md, USER_MANUAL §16.
  - FEATURE (2026-08-30): BODY `<Image>` preview rendering (user asked to finish the §38 limit).
    Empirically: the runtime loader resolves NO Source string to a bitmap in the host (avares://,
    absolute path, file://, relative ALL yield null Source with no exception — the string is lost
    after conversion), so a rewrite/XAML-converter approach can't work. Fix: `XamlRenderer`
    `ApplyImageSources(window, xaml, projectPath)` — parse XAML via XDocument, `ScanImageSources`
    builds `name → Bitmap` for `<Image>` elements with a Source attribute (resolved via
    `ResolveAssetPath` + `new Bitmap(path)`, missing files skipped), then walk
    `window.GetVisualDescendants()` and set `img.Source` for matching `Name`. CRITICAL TIMING: run
    AFTER `window.ApplyTemplate()` but BEFORE `window.Measure()` — an Image with null Source
    measures to **0x0** (injecting after Arrange collapses the image). Covers BOTH paths (runtime
    loader + programmatic) because x:Name → control.Name in both (the `x:`-prefix check in
    ApplyProperty is dead code — `attr.Name.LocalName` already strips the prefix, so `x:Name`
    reaches the control's `Name` property). Only NAMED images are injected (designer auto-names all
    placed controls; unnamed/template images stay placeholders). VERIFIED via host probes sampled at
    reported control bounds: plain Img1 w40h40 px=255,128,128 (50%-alpha red over white = renders),
    missing source → 0x0 blank, chrome body BodyImg renders, titlebar icon regression OK (134,16,28).
    PROBE GOTCHAS: images CENTER in a StackPanel (x≈390) so sample at frame control bounds, and
    semi-transparent test.png over white reads pink not bright red. dotnet --no-incremental 0/0,
    tsc clean, packaged+installed. Docs: NOTES §39, CONTROLS.md, USER_MANUAL §8.
  - FEATURE (2026-08-30): 'ITEMS SOURCE' ASSET PICKER. User: clicking Items Source should list all
    available assets — arrays in .vb/.cs + database tables etc. Decisions (all recommended): list
    ACCESSIBLE arrays+collections only (form's own instance members + Public Shared/static; T[],
    List<T>, ObservableCollection<T>, IEnumerable<T>, DataView, DataTable); APPLY via code-behind
    `Control.ItemsSource = <asset>;` in the constructor (same as DataSet binder — no DataContext
    needed); UX = text box + "…" button (file-browser pattern); list DataSet tables but keep
    DataSet-bound controls read-only (managed by the DataSet designer; picking a table for an
    UNBOUND control binds via the existing DataSet path).
    - NEW `src/assetCatalog.ts` `listAssets(projectFolder, formClass)`: walks .cs/.vb/.adset (skips
      bin/obj/.git/node_modules). C# scans class scopes by brace depth; VB by `Class`/`Module ... End`.
      Form's own collection members → bare name; Public Shared/Friend elsewhere → `ClassName.Member`;
      .adset tables → `DataSet.Table`. GOTCHAS: VB Module members are implicitly Shared → qualify
      even without `Shared` (`Public Shared` in a Module is invalid VB, BC30593); VB arrays come in
      two forms `X() As T` (name marker) and `X As T()` (type marker) — catch both; find/replace
      regexes must be GREEDY (`[^;\r\n]+`) — a lazy `+?` captures only the first char.
    - `codeBehind.ts`: `findItemsSourceBinding(uri, ctrl)` (reads `Ctrl.ItemsSource = X` line),
      `bindControlToAsset(uri, ctrl, expr)` (upsert after InitializeComponent, replaces existing
      line, creates code-behind if missing; VB syncs FindControl accessors via
      `syncVbAccessors(uri, namedControlsInAxaml(uri))` — CRITICAL for VB, else BC30451 'X not
      declared'), `removeItemsSourceBinding(uri, ctrl)`. Exported `namedControlsInAxaml`.
    - `designerPanel.ts`: `case 'pickItemsSource'` → native quick-pick (with a "Clear Items Source
      binding" entry when code-bound); code asset → `bindControlToAsset`; DataSet table →
      `bindDataSetAsset` (guard table bound elsewhere; reuse `bindControlToDataSet` +
      `ensureDataGridAutoGenerateColumns` for DataGrid + mark .adset boundTo/boundToType +
      `writeGeneratedFilesFor` to regenerate MyData; defensive VB accessor sync). `sendProperties`
      falls back `dataSetBindingFor` → `codeBindingFor` so code-bound shows read-only. `designer.js`
      renders ItemsSource with a "…" button (disabled when readOnly). dataSetEditor exported
      `ensureDataGridAutoGenerateColumns`.
    - VERIFIED (node probes): scanner lists C# string[]/List/ObservableCollection/IEnumerable (form
      + shared) and VB Planets() As String (form) + module Fruit, plus .adset tables with bound
      marker; excludes methods/strings/private. Code bind → generated `MainWindow.axaml.cs/.vb`
      gets the line after InitializeComponent; find returns expr; remove clears. Real generated
      projects build 0/0 C# AND VB for BOTH paths (code asset + DataSet table). GOTCHA:
      `findCodeBehindFile` prefers the convention file (`MainWindow.axaml.cs/.vb`) — the binding
      lands there, NOT in a hand-written `MainWindow.cs`. tsc clean; PROBLEMS clean (stale C#
      analyzer only); packaged+installed. Docs: NOTES §40, CONTROLS.md, USER_MANUAL §8.
    - FIX (2026-08-30, reported on TestVBApp): `Public dim nameslist() as string = {...}` not
      detected. ROOT CAUSE: VB regexes were CASE-SENSITIVE (VB keywords are case-insensitive) — add
      `i` flag to VB_DECL/VB_COLLECTION/Class-Module/Shared/Public|Friend checks. Two MORE VB bugs
      fixed while there: (1) generic `List(Of T)`/`ObservableCollection(Of T)`/`IEnumerable(Of T)`
      types were NEVER detected — the plain-identifier alternative came FIRST in the type alternation
      and the trailing `[({]` boundary consumed the `(` (truncated to `List`), so reorder generics
      BEFORE the plain identifier; (2) bare class-level `Dim x() As T` (valid VB, private default)
      wasn't caught — allow `Dim` as access token AND add VB method/accessor body tracking
      (Sub/Function/Get/Set open, End Sub/Function/Get/Set close, `inMethod` flag) so method-LOCAL
      `Dim` arrays are NOT listed (won't compile as `Ctrl.ItemsSource = local`). VERIFIED: TestVBApp
      scan → `nameslist | As string — on MainWindow`; edge probe (class-level Dim + lowercase
      generics) works, method locals excluded; full C#+VB bind probes still build 0/0. tsc clean;
      packaged+installed.
  - FEATURE (2026-08-30): LISTBOX placed EMPTY + compact auto-size-to-font items. User: remove the
    auto ListBox items (empty when placed); "way too much space between items" → ≤5px; follow-up:
    "item height too generous — auto-size to font". PROBED (not guessed): default Fluent ListBoxItem
    = **41px tall** (text in an 8-10px band, ~11px above/22px below) = the perceived "space" (real
    row gap is 0px). **`ItemSpacing` does NOT exist on ListBox/ItemsControl in Avalonia 12.1.1** (only
    on `WrapPanel`) → `ItemSpacing="5"` would NOT compile; Fluent theme is compiled into the dll.
    **The preview host's programmatic fallback DROPS `<Style>` elements entirely** (verified: window-
    level red-bg style no effect; direct per-item `MinHeight=0 Padding=0` DID shrink to 20px) — the
    runtime app (real 12 XAML compile) honors the Style. FIX: (1) ControlFactory ListBox snippet now
    EMPTY + `<ListBox.Styles><Style Selector="ListBoxItem">` MinHeight=0 + Padding=4,1,4,1 (compiles
    0/0 in a generated 12 project); (2) host XamlRenderer CreateControlFromElement sets ListBoxItem
    MinHeight=0 + Padding BEFORE ApplyProperty so the PREVIEW mirrors compact rows (measured 41→22px;
    item `FontSize=24` → 35px = auto-size works). itemHeightFor already reads measured preview
    height → Items-editor auto-grow stays consistent. KNOWN preview limit: ListBox-inherited FontSize
    doesn't propagate in the programmatic preview (runtime does real inheritance). PROBLEMS clean now
    (the stale C# analyzer flag cleared on window reload — confirms it was never real). Docs:
    NOTES §41, USER_MANUAL "List Items (ListBox)".
  - FIX (2026-08-30): deleting a bound control left the binding in code-behind (dangling
    `Control.ItemsSource = …`). The delete case only cleaned handlers/theme/VB accessors — NOT the
    ItemsSource binding. NEW `designerPanel.cleanupControlBindings(doc, el, ctrlName)` called in
    `case 'delete'` BEFORE `notifyEdit` (so the undo snapshot captures the cleaned code-behind):
    DataSet-bound (via findBoundTable) → `unbindControlFromDataSet` (strips Ctrl.ItemsSource line +
    typed Table property + DataGrid Wire/field) + clear .adset boundTo/boundToType + regenerate
    MyData (writeGeneratedFilesFor) — mirrors the DataSet designer's unbind; generic asset-bound →
    `removeItemsSourceBinding`. `notifyEdit` already re-syncs VB accessors on named-control change.
    UNDO EDGE: form history restores XAML + form code-behind but NOT the .adset marker (cleared on
    delete) — re-bind if you undo a DataSet-bound delete. VERIFIED: code-asset removed (C#+VB),
    DataSet removed (line+property+marker gone), both C#+VB build 0/0 after cleanup. Docs: NOTES §42.
  - FIX (2026-08-30): DRAG LAG. Root cause: `designer.js` posted a `move`/`resize` on EVERY
    pointermove → extension ran `notifyEdit` + a FULL host render round-trip per mousemove. Fix =
    OUTLINE-ON-DRAG: on pointerdown capture the control's current bounds as `drag.start` + pointer
    start; on pointermove ONLY move/resize the `#selection` box locally (`.dragging` CSS class, no
    messages/renders); on pointerup post ONE message with the TOTAL delta → one model update + one
    render per drag. Also extended `xamlModel.resize()` from se/e/s to ALL 8 corners (n/w handles
    were DEAD) — same formula as the webview `dragOutline()` so the drop lands EXACTLY where shown
    (w/n shrink size AND move top-left via Canvas.Left/Top or Margin; min 5px; `corner` widened to
    string). VERIFIED: math probe ALL MATCH for all 8 corners + move (Canvas + Margin); node --check
    + tsc clean + PROBLEMS clean; packaged+installed. Docs: NOTES §43.
  - FEATURE (2026-08-30): LOCK the Body design surface (root's `Canvas x:Name="Body"`). User wants
    no manual resize/reposition/delete; decisions: Body ONLY (not Root DockPanel), keep SELECTABLE
    (edit Background etc.) but locked, SHOW in dropdown marked locked, and Body must keep AUTO-FILLING
    the form when resized (design+runtime — inherent via DockPanel last-child fill; the lock
    PRESERVES it by blocking explicit Width/Height from resize handles; verified Body bounds == form
    at 800x450 AND 1200x700). Structure: Window → DockPanel "Root" → Canvas "Body".
    - `designerPanel.isLockedBody(model,name)`: Canvas named "Body" whose parent is root, or whose
      parent is a DockPanel named "Root" that is root's child; nested user "Body" → NOT locked
      (verified all cases). `render()` maps `locked` onto each frame control for the webview.
    - Extension guards (return + info msg): delete, cut, move, resize, moveToContainer, rename
      (__name__ — the lock relies on the name). Copy allowed. Webview: renderSelection shows NO
      handles + 🔒 lock-badge + `.locked` class; onPointerDown returns; deleteSelected guards;
      context menu disables Cut/Move-to-container/Delete; dropdown shows `Body 🔒`; CSS `.locked`
      default cursor. Docs: NOTES §44.
  - FIX (2026-08-30): LEFT-CLICK SELECTION BROKEN + CODE-BEHIND ON PLACEMENT. (a) Selection: user
    couldn't select controls by left-click (dropdown worked). ROOT CAUSE: `#selection` box had
    `pointer-events:auto` and covered the selected control — once the locked Body (fills the form)
    or any full-form control was selected, the box covered the WHOLE canvas, intercepted every click,
    and the click handler REJECTED `e.target===els.selection`; pointerdown on the box also started a
    drag + preventDefault which suppressed the click. FIX: `#selection.sel` → `pointer-events:none`
    (handles keep `auto`); move-drag now grabbed by HIT-TESTING the pointer against the selected
    control in `onPointerDown` (clicking a different control → no drag → click selects it).
    (b) Code-behind on placement (was middle-click only): `designerPanel` drop now calls
    `wireDefaultHandler(doc,panel,placed,name,false)` (openEditor=false — no editor open) for every
    placed control with `hasDefaultEvent(tag)` (containers Grid/StackPanel/Image skipped — eventName
    would otherwise be 'DoubleTapped'). Inserts the `ControlName_Event` stub + sets the XAML event
    attr + serialize(true) save; idempotent, so middle-click still opens the handler (quick-jump).
    GOTCHA: `serialize(forSave=false)` = RENDER mode STRIPS event attrs (host can't resolve handlers);
    saves use `serialize(true)` — a probe using the wrong mode made the Click attr look dropped.
    VERIFIED: hasDefaultEvent(Button/TextBox)=true,(Grid)=false; handler in MainWindow.axaml.cs; XAML
    Click attr; re-wire idempotent; C# build 0/0. node --check + tsc + PROBLEMS clean; packaged+installed.
    Docs: NOTES §45, USER_MANUAL §intro + §12.
  - TEST SUITE (2026-08-30): user approved full **Avalonia.Headless** for runtime (Option (a)), asked to
    PREPARE the scripts (run later) and keep them extensible. Plan: TEST_PLAN.md (root). Delivered
    `tests/`: runner.js (discovers `*.test.js`, ctx t.ok/t.equal/pass/fail/skip/note/section/throws/run;
    NODE_PATH = tests/stubs + tests/node_modules; writes tests/out/log.jsonl + report.md, exit!=0 on FAIL;
    `--layer`, `--file`, `--list` filters). Layers: t0-build (tsc, node --check media, host build, 10-project
    C#/VB×5template matrix — SLOW, deferred), t1-preview (spawns PreviewerHost on free port, renders,
    decodes PNG via tests/helpers/png.js — incl. solidPng encoder; asserts placement bounds, Body auto-fill
    800x450+1200x700, ChromeWindow navy band + caption glyphs + Body.y≈44, ListBox empty + compact rows ≤30,
    avares image via projectPath), t2-logic (xamlModel move/resize 8-corner formula, serialize strip/keep,
    auto-names, single-content wrap, ChromeWindow conversion; codeBehind asset/DataSet bind+unbind, VB
    accessors, handlers, Chrome convert; propertyCatalog file/button/ItemsSource/root-no-anchor — Anchor key
    is `chrome:AnchorHelper.Anchor`; assetCatalog C#+VB incl. lowercase dim + generics-before-plain +
    module-implicit-shared + method-local exclusion; dataSet parse/serialize/generateCs/Vb/Xsd — generated
    classes are `public class X` NOT partial), t3-webview (jsdom; vscode stub in tests/stubs/vscode NOT
    node_modules — npm prunes it; real DOM nesting canvasWrap>canvas>preview+overlayLayer+selection so handle
    events bubble; hitTest = LAST matching control wins; drag posts ONE resize on drop; locked-Body menu
    disables cut/move/delete; designer only sets preview img.src when png non-empty), t4-runtime
    (tests/headless/Program.cs.tpl → net10 harness ProjectReference's a generated blank C# project + injects
    btnTest; AppBuilder.Configure<App>().UseHeadless(new AvaloniaHeadlessPlatformOptions()).UseSkia()
    .SetupWithoutStarting(); drives real MainWindow: body-fill, resize-follow, WindowState transitions,
    control position/size).
    KEY GOTCHAS hit while smoke-testing: (1) host frame JSON is CAMELCASE (name/type/x/y/width/height) —
    tests must not use PascalCase; (2) `{NAMESPACE}` template replace must be GLOBAL (/g) or only the
    comment is replaced; (3) jsdom tagName is read-only — create the right element type directly;
    (4) `npm install` in tests/ prunes hand-made tests/node_modules/vscode → keep stubs in tests/stubs/.
    Smoke status: T0-compile 6✅, T1 24✅, T2 121✅, T3 38✅, T4 14✅; T0 project matrix not yet run.
    FULL RUN 2026-08-31: `npm test` = **223 passed, 0 failed, 0 skipped (26.3s)** — all layers green,
    including the T0 10-project build matrix (C#/VB × 5 templates, 0 errors / 0 warnings) and the
    T4 Avalonia.Headless runtime driver.
    Commands: `npm test` (all), `npm run test:fast|build|preview|webview|runtime`, `--file <name>` single file.
  - T5 VB MATRIX (2026-08-31): `tests/t5-vbmatrix/vb-all-controls.test.js`. User asked to create a VB.NET
    blank project, place EVERY toolbox control, test EVERY available property for functionality, report
    pass/fail. Derives the 19 placeable controls from `TOOLBOX_CATEGORIES`+`controlsForGroup` (excludes
    DataSet/CustomTitleBar tools). Places each via the PRODUCTION snippet (host `snippet` msg — same as
    designerPanel) + renders through PreviewerHost; per-control property matrix from `propertyDefsFor`,
    each prop gets a safe value (curated `VALUES` map + kind defaults); two gates: (1) RUNTIME render
    reflect of values (colors, Margin, Padding, BorderThickness, Width, Height, FontSize, FontFamily;
    CornerRadius is LENIENT — host reflects theme default so compile is its proof), (2) COMPILE: all
    controls+props written into the VB MainWindow.axaml + `dotnet build` 0 errors (per-control isolation
    on failure). StatusDate Loaded handler via `insertStatusDateClock`; ListBox/ComboBox/ItemsControl
    ItemsSource via `bindControlToAsset` to a code-behind `MatrixNames` collection. Added `snippet()` to
    tests/helpers/host.js; vscode stub needed TreeItem/TreeItemCollapsibleState/DataTransferItem/DataTransfer
    (toolboxProvider extends TreeItem). FULL RUN: `npm test` = 918 passed, 0 failed (T5 alone 695).
    FINDING: `TextBox.Watermark` obsolete in Avalonia 12.1.1 (AVLN5001 → PlaceholderText) but still in
    CONTROL_PROPS['TextBox'] → VB build warns 1. Surfaced in report; removal needs user go-ahead.
    RESOLVED 2026-08-31 (user approved): removed `Watermark`, added `PlaceholderText` to TextBox in
    src/propertyCatalog.ts (CONTROL_PROPS + KEY_DEFAULTS desc + DEFAULTS entry; ComboBox already had it).
    VB build now 0 errors / 0 warnings; full suite still 918 passed. Packaged+installed.
    ALSO: vsix ballooned to 2410MB because tests/** wasn't excluded from packaging — added `tests/**`
    + TEST_PLAN.md to .vscodeignore (NOT .gitignore — vsce uses .vscodeignore) → vsix back to 408KB.
    Commands: `npm test` (all), `npm run test:fast|build|preview|webview|runtime`, `--file <name>` single file.
  - GRID ROWS & COLUMNS (2026-08-31): user: "Add the missing properties to the grid control. It is useless
    without it. Keep in mind this extension is for novice Avalonia users!" — a Grid without defs is 1 cell.
    Added: XamlModel.gridSizes()/setGridDefinitions() (rebuild Grid.RowDefinitions/ColumnDefinitions);
    propertyCatalog Grid.Defs 'button' prop (Rows & Columns) + Grid.Row/Grid.Column dropdowns on children
    (indices from parent's defs, local childElements/gridDefinitionCount helper — propertyCatalog only
    imports localName); designerPanel sends gridDefs + case 'saveGridDefs' (validate Auto|*|n*|number else
    '*') + #gridModal HTML; designer.js gridModal editor (rows/cols size inputs, add/remove, Save posts
    saveGridDefs); designer.css .modal-wide/.grid-def-* styles. GOTCHA: new modal ids MUST be added to T3
    jsdom IDS + tagFor button handling — els.gridAddRow.addEventListener at load throws if element missing,
    breaking the whole T3 layer. Full suite 945 passed (was 918). Packaged+installed (411KB). Docs: NOTES
    §48, CONTROLS.md Layout note.
  - GRID LINES NOT RENDERING FIX (2026-08-31): user: "grid lines are not rendering in the designer - I have
    the 'Show Grid Lines' set to True." ROOT CAUSE: runtime XAML loader fails broadly in the host → Grids
    fall to programmatic builder which DROPPED Grid.RowDefinitions/ColumnDefinitions (property elements not
    in type map) + ignored Grid.Row/Grid.Column → every Grid a trivial 1×1 cell (children stacked in cell
    0,0) AND Avalonia's native ShowGridLines GridLinesRenderer is only created in ArrangeOverride when
    definitions exist (_extData != null) → no lines. FIX in host/XamlRenderer.cs: programmatic builder now
    parses RowDefinitions/ColumnDefinitions into grid.RowDefinitions/ColumnDefinitions via ParseGridLength
    (Auto|*|n*|pixels, also wired into ConvertValue GridLength) + handles Grid.Row/Column/RowSpan/ColumnSpan
    in ApplyProperty. VERIFIED: Grid.Row=1/Grid.Column=1 child now at 200,150 150×100; internal lines
    render (blue/yellow dashes). Host 0/0. Installed ext auto-rebuilds host (findOrBuildHost rebuilds when
    host source newer than binary). T1 +6 grid test. Full suite 951 passed (was 945). Packaged+installed
    (413KB). Docs: NOTES §49.
  - GRID CHILDREN STILL STACKING IN CELL 0,0 FIX (2026-08-31): user: "The control is still stacking all added
    children in cell 0,0." — after the §49 host fix the PREVIEW respected Grid.Row/Grid.Column, but the
    DESIGNER never assigned them → every control added to a Grid defaulted to cell 0,0. FIX in
    src/xamlModel.ts: new nextFreeCell(gridEl, ignore?) (first free cell row-major from defs, honors
    RowSpan/ColumnSpan, 1x1 when no defs, (0,0) fallback when full); addControl assigns Grid.Row/Grid.Column
    for Grid parents (compute BEFORE append — else the new el counts as occupying (0,0)); moveTo assigns a
    free cell too (nextFreeCell(target, el) with el as ignore since it's already attached). GOTCHA: compute
    the cell BEFORE appendChild or pass the element as `ignore`. T2 xamlModel +7 grid-cell tests (0,0→0,1→
    1,0→1,1→fallback 0,0; serialized attrs; moveTo next free). Full suite 958 passed (was 951).
    Packaged+installed (415KB). Docs: NOTES §50.
  - DRAG-TO-RE-CELL (2026-08-31): user: "I want to be able to drag/drop when re-celling a child."
    Host (XamlRenderer.cs + Program.cs): ControlInfo.Parent (direct parent name; unnamed→null so nested
    children not treated as Grid children); FrameResult.GridCells (gridCells JSON) = per named Grid the
    col/row boundaries (v/h, length n+1) in window coords via reflection on internal
    DefinitionBase.FinalOffset. GOTCHAS: (1) FinalOffset[i] (i≥1) is the boundary AFTER def i-1
    (FinalOffset[0] degenerate) → boundaries = 0, FinalOffset[1..n-1], size (first attempt [i-1] gave
    [50,350,350] not [50,200,350]); (2) Program.cs render response is an ANONYMOUS object that only
    sent png/width/height/controls/error — had to add gridCells or the field was never serialized.
    Extension: #cellHighlight div; case 'moveToCell' (clamps row/col to grid counts, sets
    Grid.Row/Column). Webview: state.recell set on select when control.parent is a named Grid with
    gridCells; move-drag marked drag.recell; onPointerMove highlights target cell (.cell-highlight);
    onPointerUp posts ONE moveToCell {name,row,col}; non-Grid children drag normally. CSS
    .cell-highlight (pointer-events:none). Tests: T1 +5 (parent+gridCells); T3 +10 (drag grid child →
    highlight cell (1,1) + moveToCell; non-grid → move). T3 GOTCHA: canvas click after the earlier
    drag test is suppressClick'ed once — select the Grid child via the control-list dropdown, not a
    canvas click. Full suite 973 passed (was 958). Packaged+installed (417KB). Docs: NOTES §51.
  - DOCS TRIMMED (2026-08-31, user request "they are getting large"): NOTES.md 2468→239 lines
    (lean quick-reference: build/run, current structure, arch, key gotchas §4, add-a-control
    checklist, Grid+test current state, one-line feature-history table §10–51, limitations, ideas,
    prior art); NOTES_ARCHIVE.md = full verbatim history (2477 lines, do-not-edit); SESSION.md
    117→24 lines (now a "where to look / how to continue" pointer — original transcript deleted);
    README.md refreshed (host messages note, current project structure, up-to-date limitations).
    .vscodeignore now excludes NOTES.md/NOTES_ARCHIVE.md/SESSION.md → vsix 417→346KB (README/
    USER_MANUAL/CONTROLS stay packaged). PROBLEMS clean; test:fast 144 pass. Lean NOTES points to
    the archive + repo memory for continuing dev.

  - IMAGE-IN-GRID AUTO-SIZE (2026-08-31): user: "The Image control is not behaving correctly when
    placed directly into a grid cell… the image 'Height' and 'Width' properties should be automatically
    set to the size of the cell it is dropped into." + follow-up: "Not only the drop unto, but also the
    initial placement" → sizing applies on BOTH direct drop into a Grid AND "Move to container…" into a
    Grid.
    - Extension: `XamlModel.sizeElementToGridCell(el, cells)` — only for an Image whose DIRECT parent is
      a Grid; reads assigned Grid.Row/Grid.Column, computes px from module helper `gridCellPixelSize
      (cells,row,col)` (v[col+1]-v[col] × h[row+1]-h[row]; undefined when out of range/zero → no change).
      Called in designerPanel drop case (after addControl, `gridCellsFor(doc,placedEl)`) AND moveToContainer
      case (after moveTo). `gridCellsFor` reads `this.frames.get(uri).gridCells[gridName]` (pre-placement
      boundaries — correct for star/Auto). Added `parent` to HostControlInfo + `GridCells`/`gridCells` to
      FrameResult in src/hostClient.ts. GOTCHA: had declared `const placed` twice in the drop case
      (addControl + findByName) → renamed the captured one to `placedEl`.
    - **HOST FIX (Image in a real Grid cell rendered 0×0):** injecting the Image Source AFTER layout
      (ApplyImageSources) left Grid-cell Images arranged at 0×0 (DesiredSize correct 100×80, but Bounds
      0×0, nothing drawn) in the headless preview. Canvas/StackPanel/DockPanel/single-cell grids were
      fine — ANY Grid with real RowDefinitions/ColumnDefinitions was broken. Massive rabbit hole
      (decompiled Avalonia 11 Grid/Image/Layoutable — ArrangeCore applies Width/Height + centering; the
      grid arranges cell children via DefinitionsU/V FinalOffset + SizeCache; a source injected after
      first layout leaves the cell Image arranged 0×0). FIX: resolve the Image's Source AT CREATION TIME
      in `CreateControlFromElement` (static `CurrentProjectPath` set in Render; `ResolveAssetPath`
      + `new Bitmap(full)`; try/catch). Now an Image in a Grid cell renders at its cell size.
      Sourceless Images still have no size (matches runtime — set Source via the Properties file picker).
    - Tests: T2 xamlModel +9 (gridCellPixelSize unit matrix; sizeElementToGridCell Image→150×100 /
      Button untouched / Image on Canvas keeps its size); T1 +5 grid-img (gridCells boundaries 100×80;
      Image with matching-aspect source renders 100×80 at cell (1,1)). GOTCHA: T1 grid-img test #8 needs
      a source with the SAME aspect as the cell (50×40 in 100×80) or Stretch=Uniform letterboxes to
      100×75 and the size assertion fails. Full suite 991 passed (was 973). Host 0/0, tsc clean, PROBLEMS
      clean. Packaged+installed (346KB). Docs: NOTES §52 + §6 bullet.
  - DOCK-IN-GRID + DYNAMIC IMAGE SIZING (§53, 2026-08-31): user: "if I set the image to Dock ->
    Fill, the image moves completely outside the grid." ROOT CAUSE: setting Dock on a Grid child
    called `ensureDockPanelParent`, which MOVED the control into the root DockPanel. USER
    CLARIFIED: "It is ok not to have the Dock property for controls placed in a grid… The way to
    fix is to make the size of an image (width, height) follow the size of the grid cell where it
    is currently placed dynamically."
    FINAL BEHAVIOUR: (1) `propertyDefsFor` hides `DockPanel.Dock` + `Canvas.Left`/`Canvas.Top`
    for direct Grid children (`inGrid` filter) — user-approved; a Grid child's size is managed by
    its cell. (2) `ensureDockPanelParent` only wraps/docks controls in a FREE-positioning context
    (Canvas or window root); a control in a Grid/StackPanel/… stays put. setProperty Dock branch
    keeps a Grid child in its cell. (3) **DYNAMIC TRACKING:** `XamlModel.syncImagesToGridCells
    (cells)` — iterates every direct-Grid-child Image, sets Width/Height from the frame's
    gridCells (gridCellPixelSize), returns whether changed. Called in designerPanel.render() after
    each frame; if changed, ONE follow-up render (`render(doc,panel,followUp=true)`) shows the new
    size (converges — second pass no change). So an Image fills its cell and FOLLOWS it when the
    grid is resized / rows-columns edited / form resized. VERIFIED end-to-end via host render:
    200x160 grid → cell 100x80 (image matches); resize grid to 400x240 → cell 200x120 → image
    updates to 200x120.
    NOTE: dropped Images are sized on placement (sizeElementToGridCell) AND re-synced on every
    render, so a manual Width/Height edit on a Grid-cell Image is overridden by the cell size
    (requested behaviour). GOTCHA: briefly reverted the inGrid filter + added a dockValueFor Grid
    'Fill' branch when the user said "Dock missing" — but that was because the user hadn't reloaded;
    after clarification, reverted those and kept Dock hidden for Grid children.
    TESTS: T2 propertyCatalog (Grid child + nested Grid have NO Dock/Canvas.Left/Top but HAVE
    Grid.Row/Grid.Column; nested Grid Grid.Row=1/Column=1 + Grid.Defs); T2 xamlModel
    syncImagesToGridCells (+10: follows cell, converges no-op, follows resized cell, Button not
    resized). Full suite 1011 passed (was 1000). tsc clean, PROBLEMS clean, packaged+installed
    (348KB). Docs: NOTES §53 (Dynamic Image-in-Grid sizing + Dock-in-Grid).
  - OPT-OUT ADDED (§53 follow-up, user: "It is working now. Please add an opt-out for the dynamic
    autosize."): an Image in a Grid now shows an **'Auto-size to Cell'** dropdown (True/False, default
    True) in the Properties panel. False → the Image keeps the manual size; the sync skips it.
    - Storage is NOT XAML (Avalonia would reject an unknown attribute): it lives in the extension's
      `globalState` as `autoSizeOff` (array of `docUri::controlName`), mirroring the themeBackups
      pattern (`ensureAutoSizeOff`/`persistAutoSizeOff`/`setAutoSizeOff`/`isAutoSizeOff`).
    - `propertyDefsFor(el,...,autoSizeOff?)` 5th param; `syncImagesToGridCells(cells, skipNames?)`
      skips opted-out names; render() builds the skip set from globalState (loaded once);
      drop/moveToContainer also skip sizing when opted out.
    - Tests: T2 propertyCatalog +5 (Image in Grid has Auto-size default True / off shows False;
      Button in Grid has NO Auto-size); T2 xamlModel +3 (opted-out imB keeps its size while imA
      follows). Full suite 1021 passed (was 1011). tsc clean, PROBLEMS clean, packaged+installed
      (349KB). Docs: NOTES §53 bullet + history row.

  - IMAGE ROTATE (§54, 2026-08-31): user: "Is there a 'Rotate' property for the Image control?" →
    No (Avalonia has no plain Rotate attr; rotation is a RenderTransform). User: "Yes, add this please."
    Added a **`Rotate`** property (number, deg) to the Image.
    - Writes `<Image.RenderTransform><RotateTransform Angle="…"/></Image.RenderTransform>` — the
      Avalonia-valid form. `XamlModel.setImageAngle` (write/update/remove; 0/empty removes the
      transform) + `imageAngle` (read). **KEY: `XamlModel.setProperty` routes `key==='Angle'` →
      `setImageAngle`** so EVERY caller (Properties panel AND the T5 VB matrix, which writes each
      catalog prop as an attribute) writes the correct transform — without the routing, the T5 test
      wrote `Angle="10"` as a plain attribute → VB build failed (errors=-1).
    - `propertyDefsFor` shows the value via `rotateAngleFor(el)` (reads the RenderTransform);
      special-cased in the value computation like Dock.
    - Host programmatic builder: parses `<X.RenderTransform><RotateTransform Angle="…"/>` and sets
      `vis.RenderTransform = new RotateTransform(angle)` (otherwise the preview wouldn't show it).
    - GOTCHA: **Avalonia rotates around the element CENTRE** (verified via pixel probe: a 90° turn of
      a 60×30 image at (100,100) reaches y=85, above the original top edge y=100; a 180° turn keeps
      the same bounding box). T1 rotate test asserts red pixels in the rotated-only region
      (110,145)x(85,100) > 200 while area is preserved (whole=1800).
    - Tests: T2 xamlModel +6 (write/read/update/remove/re-apply, serialized RenderTransform);
      T2 propertyCatalog +3 (Angle kind number, empty default, reads 45 from transform);
      T1 +5 rotate render probe. Full suite 1037 passed (was 1021). tsc clean, host 0/0, PROBLEMS
      clean, packaged+installed (351KB). Docs: NOTES §54.

  - ROTATED OUTLINE FOLLOWS IMAGE (§55, 2026-09-01): user attached a screenshot: "The picture did
    rotate correctly but it's container outline did not." — the selection box stayed at the layout
    bounds while RenderTransform rotated the drawn visual (classic RenderTransform behaviour).
    FIX: host `CollectControls` now reports the **rotated axis-aligned bounding box** instead of
    `Bounds`: transform the local rect's 4 corners via `c.TransformToVisual(window)`, take the AABB
    (min/max of transformed corners) → x/y/width/height. Verified: 100×80 at (100,100) → 90° reports
    80×100 at (110,90), 45° reports 127×127 at (86,76) (both centred on (150,140)), unrotated
    unchanged (100,100,100,80). Non-rotated controls are unaffected (AABB == layout box).
    GOTCHAS: (1) **`c.Bounds` is in the PARENT's space; `TransformToVisual` expects LOCAL coords
    (origin 0)** — must transform `new Rect(0,0,Bounds.Width,Bounds.Height)` corners or the position
    double-counts (first attempt gave (200,200) for a control at (100,100)). (2) **`LayoutTransform`
    is NOT available on general controls in Avalonia 11.0.10** (Layoutable has no such property;
    `OnLayoutTransformChanged` string exists in Controls but not on Image/Layoutable) — so the fix
    had to keep RenderTransform + report the rotated AABB.
    T1 rotate test updated: asserts the host reports the ROTATED box (30×60 at (115,85) for a 60×30
    image rotated 90°) + still draws the pixels. Full suite 1038 passed (was 1037). host 0/0, tsc
    clean, PROBLEMS clean, packaged+installed (351KB). Docs: NOTES §55 + §54 bullet.

  - DOT GRID OVERLAY + SNAP-TO-GRID (§56, 2026-09-01): user: "add a feature that draws an 'always
    on top' dotted grid on the designer surface; spacing/color/dot size configurable." (asked "Any
    queries?" → answered via askQuestions: toolbar toggle for the grid, a second toolbar toggle for
    snap-to-grid, config in BOTH VS Code settings AND an in-designer popup, GLOBAL scope.)
    - Settings: package.json `configuration` → `avaloniaDesigner.dotGrid.{enabled, snapToGrid,
      spacingX, spacingY, color, dotSize}` (defaults: true, false, 16, 16, '#9db4d0', 1.5).
    - Overlay: a `#dotGrid` div inside `#canvas` (z-index 25, pointer-events:none, always on top)
      drawn with `background-image: radial-gradient(circle, <color> <dotSize/2>px, transparent
      <dotSize/2>px)` + `background-size: <spacingX>px <spacingY>px` — dots repeat on the grid and
      scale with the canvas zoom. VERIFIED visually (standalone HTML screenshot: 16×16 default dots,
      32×24 red larger dots, 8×8 tiny dark dots all render correctly).
    - Flow: designerPanel.render() sends `dotGrid` with the frame; toolbar toggles post
      `toggleDotGrid`/`toggleSnapToGrid`; popup posts `setDotGrid` — each updates the GLOBAL config
      (`cfg.update(key, val, ConfigurationTarget.Global)`) and replies with a `dotGrid` message
      (`dotGridConfig()` reads via `getConfiguration('avaloniaDesigner.dotGrid')`).
    - SNAP: happens in the webview drag — `snapDrag(drag, dx, dy)` rounds the TARGET position/size to
      the grid (spacingX/spacingY) and returns an adjusted delta; the SAME snapped delta drives the
      live outline AND the posted move/resize, so outline and applied result stay consistent.
      Re-cell drags are excluded (they snap to cells, not dots). Snap only when `enabled && snap`.
    - GOTCHA: any new webview element (toolbar buttons, `#dotGrid`, `dotGridModal` + its inputs) MUST
      be added to the T3 jsdom `IDS` + `tagFor` (inputs → `'input'`, buttons → `'button'`) or `els.*`
      addEventListener throws at load and the ENTIRE T3 layer breaks. Also add `#dotGrid` inside the
      jsdom `#canvas` to mirror real nesting.
    - Tests: T3 +15 (Grid/Snap buttons post toggles; dotGrid message shows/hides overlay + toolbar
      active states + radial-gradient/background-size; settings popup opens/saves setDotGrid with
      clamped values; snap-on drag posts delta that lands on the grid (10,10 +5,+3 → dx=6,dy=6) and
      raw delta when snap off). Full suite 1057 passed (was 1038). tsc clean, node --check clean,
      PROBLEMS clean, packaged+installed (354KB). Docs: NOTES §56 + history row.

  - ALIGNMENT TOOLS + MULTI-SELECT (§57, 2026-09-01): user: "add alignment tools: Align Top/Bottom/
    Left/Right/Centre; align the edges of the selected controls to the one selected first (needs
    multi-select); Align Text = centre the text in single-line text controls. Any queries?" →
    askQuestions answers: multi-select via BOTH Ctrl+Click AND drag-box (marquee); alignment scope =
    ALL placed controls EXCEPT direct Grid children; Align Text = option 1 (set
    TextAlignment/HorizontalContentAlignment = Center, each control's text centred within itself);
    text set = TextBlock/TextBox/Button/CheckBox/RadioButton/ComboBox.
    - **Selection model:** `state.selected = {name}` stays the ANCHOR (first-selected; what edge-align
      aligns everything to); new `state.multi = new Set()` holds ALL selected names. Helpers:
      `selectionNames()` (multi if non-empty else anchor), `setSelection(anchor, names)` (posts
      `select` + sets recell for the anchor), `select(hit, additive)` (Ctrl+Click toggles; first added
      becomes anchor; removing the anchor promotes the next). Plain click collapses to single
      (setSelection with one name). `deselect()` clears multi too. All `state.selected = null` sites
      (deleteSelected, ctxCut, Ctrl+X) must also clear `state.multi` or stale outlines linger.
    - **Marquee GOTCHA (important):** the locked `Body` Canvas always fills the form, so `hitTest`
      NEVER returns null on "empty" space — the marquee condition must be `(!hit0 || hit0.locked)`,
      NOT just `!hit0`. Guarded by `!state.pendingTag && !grabbingHandle` (tool click places, handle
      drag resizes). `marqueeSelect(x0,y0,x1,y1)` picks named non-locked controls intersecting the
      box; ANCHOR = control whose top-left corner is nearest the box's top-left. Draw `#marquee`
      (dashed blue) during the drag; on up hide + select. suppressClick set after marquee → consume
      with a no-op canvas click in tests before the next click-select (real browser fires a click
      after pointerup that is suppressed once).
    - **renderSelection** draws the anchor in `#selection` (full box + handles) AND the others as
      lighter dashed `.multi-sel` outlines in a new `#multiSel` layer (z-index 19, pointer-events
      none). `updateAlignButtons()` (called from renderSelection → runs every frame/selection change):
      edge-align buttons disabled unless `selectionNames().length >= 2`; `btnAlignText` enabled when
      ≥1 selected control's type is in `TEXT_ALIGN_TAGS` (TextBlock/TextBox/Button/CheckBox/
      RadioButton/ComboBox — matches propertyCatalog).
    - **Edge align:** toolbar `⇤ ↔ ⇥ ⇡ ↕ ⇣` = btnAlignLeft/Centre/Right/Top/Middle/Bottom → post
      `align {align, anchor, names}`. Extension `case 'align'`: skip anchor + locked + DIRECT Grid
      children (`localName(parent.tagName) === 'Grid'`); for each target compute delta from
      `this.frames` bounds vs anchor (`left` tx=ab.x-b.x; `right` (ab.x+ab.w)-(b.x+b.w); `centre`
      cx diff; `top`/`bottom`/`middle` analogous), `doc.model.move(el,dx,dy,b)` (Canvas.Left/Top for
      Canvas parent else Margin); ONE notifyEdit + ONE render. All deltas computed from the same
      pre-alignment frame → correct batch.
    - **Align Text:** `Aa` → post `alignText {anchor, names}`. Extension `case 'alignText'`: sets
      `TextAlignment="Center"` on TextBlock/TextBox and `HorizontalContentAlignment="Center"` on
      Button/CheckBox/RadioButton/ComboBox (via `doc.model.setProperty`, which only special-cases
      Angle); ONE notifyEdit + render + sendProperties.
    - GOTCHAS: (1) new toolbar buttons + `#multiSel` + `#marquee` MUST be added to T3 `IDS` +
      `tagFor`; multiSel + marquee mounted INSIDE the jsdom `#canvas` to mirror real nesting (else
      els.* addEventListener throws at load and the whole T3 layer breaks). (2) after any drag
      (move/resize/marquee) the real browser fires a click that is suppressed once — tests that
      dispatch pointer events then click-select must first dispatch a no-op canvas click to consume
      the suppress flag. (3) host already reports `locked` per control (extension maps it in render
      via isLockedBody) so the webview marquee/outlines can exclude locked controls.
    - Tests: T3 +16 (no-sel disables all align buttons; Ctrl+Click anchor + toggle + remove-anchor
      promotes next; align buttons enable at ≥2; AlignLeft posts align {align:'left',anchor:'btn1',
      names:['btn1','btn2']}; AlignText posts alignText; marquee draws #marquee, selects intersecting
      non-locked controls, anchor = nearest to box top-left (txt1), plain click collapses multi).
      Full suite 1084 passed (was 1057). tsc clean, node --check clean, PROBLEMS clean,
      packaged+installed (358KB). Docs: NOTES §57 + history row.

  - SHAPE CONTROLS (§58, 2026-09-01): user: "add Shape controls — lines, rectangular boxes, circles
    and arcs; configurable line thickness, colour, Backcolor (boxes/circles); circle/box size set by
    dragging an edge. Any queries?" → askQuestions answers: Line resizes like any control (8 handles,
    endpoints scaled); just the stroked Arc (no Sector); default look = transparent fill + black 1px
    outline.
    - Toolbox: new `Shapes` category (TOOLBOX_CATEGORY_SHAPES) with Line / Rectangle / Ellipse /
      Arc; controlInfo entries; ControlFactory snippets (Line StartPoint="0,0" EndPoint="120,80"
      Stroke=Black Thickness=1; Rectangle 120x80 Fill=Transparent; Ellipse 100x100; Arc 100x100
      StartAngle=0 SweepAngle=270) + TypeMap (using Avalonia.Controls.Shapes).
    - **Avalonia 11.0.10 GOTCHA: `Line` has NO X1/Y1/X2/Y2 and NO Width/Height.** It uses
      StartPoint/EndPoint ("x,y"); its size IS its geometry. So (1) Width/Height are FILTERED OUT of
      the Properties panel for Line (setting them would clip, not stretch); (2) `XamlModel.resize`
      routes Line → `resizeLine`: same box math as resize (Canvas.Left/Top or Margin on w/n, min 5)
      then scales StartPoint/EndPoint proportionally within the box (`new = p * newW/oldW` — NO
      origin-shift term; an endpoint on the box edge stays pinned to that edge). No Width/Height
      written. parsePoint helper added.
    - Host: `XamlRenderer.ConvertValue` gained `Avalonia.Point` parsing ("x,y") — without it the
      programmatic builder drops StartPoint/EndPoint (Point can't take a raw string) and lines
      wouldn't draw. All four shapes render with correct bounds (verified via pixel probes: black
      outlines + transparent centres; Line spans its box corner-to-corner).
    - Properties (propertyCatalog): Line = Stroke/StrokeThickness/StrokeLineCap(Flat,Round,Square)/
      StartPoint/EndPoint; Rectangle = Fill (labelled **Backcolor**)/Stroke/StrokeThickness/
      RadiusX/RadiusY; Ellipse = Fill(Backcolor)/Stroke/StrokeThickness; Arc = Stroke/StrokeThickness/
      StartAngle/SweepAngle. KEY_DEFAULTS + DEFAULTS for all shape keys.
    - **VB GOTCHA (REAL bug found by T5):** the VB accessor generator `applyAccessors` emits
      `Private ReadOnly Property Line2 As Line` — but Line lives in Avalonia.Controls.Shapes, so the
      VB project failed BC30002 "Type 'Line' is not defined" (the combined-build gate surfaced it;
      per-control isolation builds passed because they rewrote only the .axaml, but the stale .vb
      accessors failed the combined build). FIX: `applyAccessors` now adds
      `Imports Avalonia.Controls.Shapes` when any named control type is in VB_SHAPES_NS
      (Line/Rectangle/Ellipse/Arc/Sector/Polygon/Polyline/Path/Shape). **C# needs NO import** —
      verified: real C# 11.0.10 project with all 4 shapes + `Line1.StrokeThickness = 4` builds 0/0
      with only `using Avalonia.Controls` (XAML codegen emits fully-resolved field types).
    - Tests: T1 +8 (all 4 shapes: bounds + black-outline pixel probes — watch coordinate math: the
      Line midpoint is at Canvas pos + half the box, and Ellipse/Arc strokes curve away from the box
      corners, so sample the top-centre / left-middle / arc-left-edge, not the corners); T2
      propertyCatalog +32; T2 xamlModel +11 (Line resize SE/NW scales points, non-zero StartPoint,
      zero-bounds guard); T2 codeBehind +5 (Shapes import added only when a shape present); T5
      matrix 19→23 controls. Full suite 1270 passed (was 1084). tsc clean, host 0/0, PROBLEMS clean,
      packaged+installed (361KB). Docs: NOTES §58 + CONTROLS.md Shapes section.

  - MAKE SAME WIDTH/HEIGHT (§59, 2026-09-01): user: "add two new tools to the alignment buttons —
    'Make same Height' and 'Make same Width'; selection similar to the other alignment tools;
    adjust width/height of selected controls to match the anchor. Any queries?" → askQuestions
    answers: skip direct Grid children (consistent with edge-align); skip Lines (they have no
    Width/Height — don't scale their points).
    - Two new toolbar buttons `⇔` (btnSameWidth) and `⇕` (btnSameHeight) next to btnAlignText.
      Reuses the existing `align` message: webview `postAlign('sameWidth'|'sameHeight')` →
      `{type:'align', align, anchor, names}`. The extension `case 'align'` gained an `isSizeAlign`
      branch: for each target (skip anchor / isLockedBody / direct Grid child / **Line**) write
      `Width` or `Height` from the anchor's frame bounds (clamp min 5, only when the attr actually
      changes → changed flag), then ONE notifyEdit + render. Edge-align (left/right/top/bottom/
      centre/middle) unchanged.
    - Webview `updateAlignButtons`: size buttons enabled when `selectionNames().length >= 2` AND at
      least one NON-anchor selected control is sizeable (`type !== 'Line'` → hasSizableTarget) —
      selecting only Lines disables them (edge-align stays enabled).
    - VERIFIED end-to-end via a probe that instantiates the REAL compiled AvaloniaDesignerProvider
      (NODE_PATH=tests/stubs; stub `vscode.workspace.onDidChangeTextDocument` before constructing —
      the constructor subscribes to it; stub provider.notifyEdit/render/sendProperties; set
      provider.frames; drive `(provider as any).handleMessage(doc, panel, msg)`): sameWidth set
      Other(Button)/Box2(Rectangle) Width=120 (Height untouched), sameHeight set Height=40, Line L1
      and Grid-child InGrid unchanged, anchor untouched. This is the reusable pattern for probing
      designerPanel message handlers.
    - Tests: T3 +9 (size buttons disabled with <2 sel / with only Lines selected; enabled with two
      Buttons; click posts align sameWidth/sameHeight with anchor+names). Full suite 1279 passed
      (was 1270). tsc clean, node --check clean, PROBLEMS clean, packaged+installed (363KB). Docs:
      NOTES §59 + history row.

  - SHAPE DRAG-POINT EDITING (§60, 2026-09-01): user: "The Line and Arc shapes are difficult to
    control. For Line, the ends of the line should be the drag (resize and anchor) points. An Arc
    has three drag points — the ends for resizing/anchoring and the centre for the radius.
    Questions?" → askQuestions: Arc end drag = rotate around the centre at current radius, OTHER
    end stays anchored (sweep adjusts); Arc centre = radius follows pointer distance (drag outward
    bigger, centre fixed, box scales around it).
    - **Selection UI:** a selected Line shows its two END dots, an Arc its CENTRE + two END dots
      (`.shape-handle`), REPLACING the 8-handle box. Line selection = no box (just the dots); Arc =
      faint dashed box (`#selection.sel.shape` clears fill/border, `.shape-arc` adds dashed border).
    - **How the webview gets handle positions:** the EXTENSION computes them (`shapeHandlesFor` in
      render() reads the shape geometry from the model + frame bounds, attaches `c.handles` in
      design coords to each Line/Arc frame control). The webview does NO geometry math. HostControlInfo
      gained `handles?: ShapeHandle[]` (kind start/end/centre, x/y).
    - **Line geometry (host-verified):** a Line draws RAW at `Canvas.Left/Top + StartPoint/EndPoint`
      (NO geometry translation — negative StartPoint draws outside the reported bounds; L2 probe:
      StartPoint -30,10 → drawn x:70..169 while bounds = 70×70 at the Canvas pos). Reported bounds =
      EndPoint (max corner). So handle pos = `bounds.xy + point`.
      - **Drag one end** → `setLineEnd {name, end, dx, dy}` (delta). The dragged end's relative point
        += delta; `normalizeLine` re-bases if the AABB min went negative (shifts Canvas.Left/Top by
        the min, subtracts it from BOTH points) → both drawn ends keep their absolute positions, so
        the anchored end stays put and the box stays non-negative.
    - **Arc geometry (host-verified):** centre = box centre; **0° = right, positive angles sweep
      CLOCKWISE (y-down)**; endpoint = `(cx + rx·cosθ, cy + ry·sinθ)`. Confirmed via 4 pixel probes
      (0→90 = bottom-right quadrant; 90→180 = bottom-left; etc.).
      - **Drag an end** → `setArcEnd {name, end, x, y}`: pointer angle around the centre = that end's
        angle; sweep adjusted so the OTHER end's absolute angle is preserved. start-drag:
        `StartAngle=angle; SweepAngle=(endAngle-angle+360)%360`; end-drag: `SweepAngle=(angle-start+360)%360`.
      - **Drag the centre** → `setArcRadius {name, x, y}`: radius = dist(centre→pointer); box scales
        around the FIXED centre keeping aspect (Width/Height + Canvas.Left/Top), circular stays circular.
    - **Webview drag:** `onPointerDown` on `.shape-handle` → shape drag (kind start/end/centre +
      shapeType Line/Arc); `onPointerMove` moves the handle dot to the pointer (relative to the
      selection box: `(p - c) * scale`) + a faint `#radiusGuide` line for Arc-centre drags;
      `onPointerUp` posts setLineEnd (delta) / setArcEnd / setArcRadius (pointer pos). Arc redraws on
      re-render after drop (no live arc preview during drag — only the handle follows).
    - GOTCHAS: (1) new webview elements MUST be in the T3 `IDS` + mounted in `#canvas` (`radiusGuide`);
      (2) xmldom `element.attributes` is NOT iterable in probes — read known attrs via `getAttribute`;
      (3) T3 shape-drag tests dispatch pointerdown ON the handle element (bubbles to the canvas
      listener) and must consume `suppressClick` before later click-selects; (4) after setLineEnd/
      setArcEnd/setArcRadius the model changes but the probe's stale frame bounds no longer match —
      in the real flow render() refreshes the frame each time.
    - VERIFIED via probe driving the real handleMessage: setLineEnd (+30,+20) → EndPoint 150,100,
      StartPoint anchored 0,0, Canvas.Left/Top unchanged; setArcEnd start→59° → Sweep 31 keeps the
      anchored end at 90°; setArcRadius 100px out → box 200×200 centred on the fixed centre (angles
      preserved); shapeHandlesFor returns correct Line ends + Arc centre/endpoints. Tests: T2
      xamlModel +11; T3 +16. Full suite 1315 passed (was 1279). tsc clean, node --check clean,
      PROBLEMS clean, packaged+installed (368KB). Docs: NOTES §60 + CONTROLS.md Shapes note.

  - SHAPES RENDER BEHIND BY DEFAULT (§61, 2026-09-01): user: "All Shape items must render behind
    other controls (Send to Back) by default."
    - Mechanism: the 4 shape snippets (ControlFactory.cs) now carry `ZIndex="-1"` + a defensive guard
      in the `drop` handler (a placed shape with no ZIndex attr gets '-1' — SHAPE_TAGS set added).
      Avalonia honours ZIndex in the paint order — VERIFIED in the host: red rect `ZIndex="-1"`
      renders behind a later blue rect, and a later blue `ZIndex="-1"` loses to an earlier red with
      no z (i.e. -1 always loses to the 0 default). Works in the preview AND at runtime.
    - Escape hatch: the Properties panel already exposes **Z-Index** (COMMON_PROPS) — set a shape to
      0+ to bring it forward.
    - GOTCHA (probe): sample the OVERLAP region correctly — earlier probes sampled a point inside
      only ONE shape and misread the result; a Fluent Button's translucent background also muddied a
      shape-vs-button pixel test, so the T1 z-order test uses two OPAQUE rectangles.
    - Tests: T1 +7 (the 4 snippets carry ZIndex="-1"; two overlap probes proving -1 renders behind).
      Full suite 1322 passed (was 1315). tsc clean, host 0/0, PROBLEMS clean, packaged+installed
      (368KB). Docs: NOTES §61 + CONTROLS.md Shapes note.
    - **BUG FIX (same day, user report):** "Place a TextBox first, then a Rectangle over it — left-
      click selects the Rectangle, not the TextBox." ROOT CAUSE: `ZIndex="-1"` made the shape RENDER
      behind, but the webview's `hitTest` ignored ZIndex — it picked the LAST control containing the
      point (collection order only), so the later-placed Rectangle won. FIX: (1) `render()` enriches
      every frame control with its paint-order **`zIndex`** (parsed from the model's ZIndex attr, 0
      when unset; `HostControlInfo.zIndex` added); (2) `hitTest` picks the HIGHEST zIndex, ties →
      later (`(c.zIndex||0) >= (hit.zIndex||0)` scanning in order = max z, last on tie = Avalonia's
      child sort: ZIndex then collection order). A `ZIndex="-1"` shape never steals a click from a
      control over it; a shape brought forward (z=1) wins over a 0 control. VERIFIED end-to-end via a
      probe driving the REAL `render()` through a live host client (stub ensureAutoSizeOff +
      dotGridConfig): frame controls carried `{Root:0, Body:0, txtA:0, rectB:-1}`. Tests: T3 +4.
      Full suite 1326 passed (was 1322). tsc clean, PROBLEMS clean, packaged+installed (369KB).
    - **BUG FIX #2 (same day, user report):** "This is not ideal. Setting the Z-order to -1 makes
      the control un-selectable with a mouse click. Perhaps we could define shapes as being
      'Containers'?" ROOT CAUSE: the z-aware hitTest compared ZIndex across ALL controls — the
      locked **Body** canvas (z=0) fills the entire form, so a shape (`ZIndex="-1"`) ALWAYS lost to
      Body, even where fully exposed → un-clickable. The "containers" idea isn't the mechanism (a
      container like Body is only clickable at empty points; shapes are already in a container); the
      real fix is HIERARCHY-AWARE hit-testing like Avalonia's own input hit-test: a control is never
      beaten by its OWN ancestors (Body / Root / a containing panel) — an ancestor only wins when
      nothing inside it is hit. Siblings/unrelated controls still compare by ZIndex (higher wins,
      tie → later). FIX: `hitTest` builds a parent map from the frame's `parent` field (the host
      already reports it, HostControlInfo.parent) and walks it (`isAncestor(anc, node)` up the parent
      chain): if the candidate is an ancestor of the current hit → skip; if the candidate is a
      descendant → it wins; else compare zIndex. Result: a shape's EXPOSED area is clickable (beats
      Body), the OVERLAP with a TextBox goes to the TextBox (sibling z), empty space → Body, a shape
      brought forward (z=1) wins. VERIFIED via the real render() through the host: frame carried
      `{Root: parent=null z=0, Body: parent=Root z=0, txtA: parent=Body z=0, rectB: parent=Body
      z=-1}`. Tests: T3 +2 (exposed shape clickable; empty space → Body — the T3 z-hit block now
      sets `parent` on frame controls). Full suite 1328 passed (was 1326). tsc clean, node --check
      clean, PROBLEMS clean, packaged+installed (369KB).
  - BUG-FIX BATCH (§62, 2026-09-02): 4 user issues:
    - (1) COLOUR DROPDOWN SHOWED ONLY THE CURRENT COLOUR. ROOT CAUSE: colour props rendered a text
      field + `<datalist>` (ensureDatalist('designerColorList')); the BROWSER FILTERS datalist options
      by the typed value → dropdown showed just the current colour. FIX: colour row is now
      `[swatch][text][▾]`; text field's `list` attr removed; new `openColorPalette(trigger, controlName,
      key, options, current)` opens a lazy `position:fixed` `#colorPalette` (fixed = not clipped by the
      Properties panel scroll) listing EVERY preset colour (~5 rows visible → scrolls, max-height
      5*22+10) + the custom current value on top if not a preset. Closes on outside click / Escape /
      any scroll (document 'scroll' listener, capture). No load-time element → no T3 IDS change.
      Tests: T3 +10 (palette feature). Webview 145 passed (was 135).
    - (2) RECTANGLE: ONE 'Corner Radius' (RadiusX/RRadiusY always identical). propertyCatalog.ts:
      Rectangle CONTROL_PROPS now `{key:'Radius',label:'Corner Radius',kind:'number'}` (no X/Y rows);
      KEY_DEFAULTS/DEFAULTS updated (Radius:''); propertyDefsFor value branch reads RadiusX
      (`getAttribute('RadiusX')||DEFAULTS['RadiusX']||'0'`). xamlModel.ts setProperty gained a
      `key==='Radius'` special case (like Angle): non-empty writes BOTH RadiusX+RadiusY, '' removes
      both → never a stray invalid `Radius` attr on Rectangle (this is what makes the T5 VB matrix
      compile). Tests: T2 propertyCatalog + xamlModel. T5 drops 1 (Rectangle one row) — expected.
    - (3) RUNTIME OPACITY — VERIFIED NOT A CODE BUG. End-to-end probes (/tmp): serialize keeps
      Opacity in render+save; real handleMessage setProperty Fill→Opacity saves `Fill="#E02020"
      Opacity="0.5"`; designer host (Av 11.0.10) renders 50%-red-over-white #f09090; a real headless
      Avalonia 12.1.1 runtime app honours it (50% red over white). NO code change — likely causes:
      stale app build / unsaved .axaml / dual text-editor overwriting the designer's unsaved edits /
      old installed extension. If still reproduces, ask user for the saved .axaml.
    - (4) VB: DUPLICATE `Imports Avalonia.Controls.Shapes` + STRAY U+FEFF. ROOT CAUSE (codeBehind.ts
      applyAccessors): a VB file with a leading U+FEFF (external editor/tool wrote it) broke the
      `^Imports Avalonia.Controls# Avalonia Designer for VS Code — workspace notes

## Property population (effective values) — done 2026-08-25
- Properties panel now shows current/theme-resolved values for every valid property. Host reports
  effective values per control; catalog falls back to them.
- Host: `XamlRenderer.cs` — `ControlInfo.Values` (Dictionary<string,string>); `EffectiveValues(Control)`
  reads Width/Height (Bounds), Margin, FontFamily/FontSize/Background/Foreground/CaretBrush/
  SelectionBrush (reflection + BrushToHex → ISolidColorBrush.Color.ToString()), Padding/
  BorderThickness/CornerRadius/BorderBrush (reflection). Skips empty; null when empty.
- **Avalonia 11 gotcha:** base `Control` has NO FontFamily/FontSize/Background/Foreground
  (they live on TemplatedControl/TextElement) → MUST read those via reflection or CS1061.
- Host `Program.cs`: added `audit` message + `AuditKeys()` (reflection existence check of property
  keys per control type; attached props with '.' assumed valid). Kept for re-verification.
- `propertyCatalog.ts`: `propertyDefsFor(el, effective?)` value chain
  `getAttribute → defaultValue → effective[key] → DEFAULTS[key]` (Opacity % special case first).
  DEFAULTS now: Margin='0', ZIndex='0', MaxLength='0', LineHeight='0', LetterSpacing='0',
  MaxLines='0', MaxDropDownHeight='200'.
- `designerPanel.ts`: `sendProperties` passes `effectiveFor(doc,name)` (from frame
  `controls.find(c=>c.name===name)`, root matched by `c.name===null`).
- Audit result: ALL catalog props valid for real types. DataGrid not loaded in host (separate
  assembly) — valid from knowledge. StatusBar = Border-backed pseudo-type (name StatusBarN).
  ChromeWindow = plain Window + mirrored titlebar.
- Honest blanks stay blank: MaxWidth/MaxHeight (no limit), Canvas.Left/Top (advanced), transparent
  Background, no-border BorderBrush, unset content (Text/Watermark/Command).
- Verify approach: `/tmp/valprobe.js` (host render → dump values), `/tmp/catalogaudit.js`
  (reflection validity), `/tmp/finalcheck.js` (end-to-end population). Host port via `--port`,
  WS protocol `{id,type:'render',xaml,width,height}` → `{type:'frame',png,controls:[{name,type,
  x,y,width,height,values}]}`.

## Double-click robustness — done 2026-08-25
- Bug: occasional single click on a control jumped focus to the code-behind editor.
- Root cause: native `dblclick` on canvas + `.ov` overlays are `pointer-events:none` → ANY two
  clicks within the OS double-click window (even on DIFFERENT controls) targeted the canvas and
  fired `dblclick` → `openEvent` → `showTextDocument`.
- Fix (media/designer.js only): removed native `dblclick`; `click` handler now detects a real
  double-click = two clicks <500ms apart, <10px apart, AND same hit-test name. Place-mode
  (`state.pendingTag`) handled first. Single-click selection path (`{type:'select'}`) never
  opens editors.
- Webview script is a static asset — not compiled by tsc; validate with `node --check`.

## Code review round — REVERTED 2026-08-26
- All 5 candidate fixes from the 2026-08-25 review round were REVERTED (they introduced issues).
  Code is back to the pre-review state: `elementXaml` uses `new Map()` strip map again;
  designer.js has no `firstFrame` (zoom re-fits each frame); hostClient start/request unchanged;
  createNewProject takes no prefs; projectView passes no language.
- The observations are still valid notes for future one-at-a-time work (see NOTES.md section 19).

## TabControl body duplicates in control drop-down — FIXED 2026-08-26
- Symptom: placing a TabControl showed TabControl2Body1 (DockPanel) + TabControl2Body1Canvas
  (Canvas) TWICE in the control drop-down.
- Cause: in a realized TabControl the selected tab's content is reachable via TWO logical parents
  (TabItem.Content AND the TabControl's content presenter) → host `CollectControls` visited the
  same DockPanel/Canvas twice. Runtime app unaffected; previewer-only artifact.
- Fix (host/XamlRenderer.cs `CollectControls`): dedupe named controls with a `seen` HashSet —
  names are unique, so a repeated name is a duplicate. Unnamed template internals still all
  reported. Verified with /tmp/tabdup.js (15 → 13 controls).

## Dock → Fill showed "None" in Properties panel — FIXED 2026-08-26
- Avalonia has no literal `Fill` Dock value: the designer stores Fill as NO `DockPanel.Dock`
  attribute + control as LAST child of a DockPanel with LastChildFill="True". The panel then fell
  through to DEFAULTS['DockPanel.Dock']='None' → Fill reverted to None on refresh.
- Fix (propertyCatalog.ts): `dockValueFor(el)` for the DockPanel.Dock key — attribute if set, else
  'Fill' when last child of a DockPanel whose LastChildFill !== 'False', else 'None'. Other docks
  (Left/Top/Right/Bottom) unchanged. Verified with /tmp/dockcheck.js (6 scenarios).

## Single-click still opened code-behind — tightened double-click 2026-08-26
- Re-report: click-to-select navigation jumps to the .axaml.vb editor. Installed copy DID have the
  section-18 detection (not a stale install). Trigger = two clicks on the SAME control within the
  window (second click lands on the instantly-shown selection rectangle, pointer-events auto).
- Fix (designer.js): double-click window 500ms → 300ms, distance 10px → 6px (same-control kept).
  Deliberate double-clicks (~150-300ms) still work; slower "click, pause, click again" no longer
  counts. If it still triggers, only lever left is timing/behavior change (can't distinguish a
  fast accidental double-click from a deliberate one).

## Double-click replaced by MIDDLE-BUTTON click — 2026-08-26
- User request: the "create code-behind stub" action is now a **middle mouse button click** on a
  control, NOT double-click.
- designer.js: removed all double-click detection (`lastClick`, timing); added `auxclick` handler
  (e.button===1 → hitTest → select + post openEvent) + `mousedown` preventDefault for button 1
  (stops autoscroll/paste). Double-click now just selects twice.
- Updated texts: designerPanel.ts (comments + Name warning), controlInfo.ts (Button help),
  codeBehind.ts comment, USER_MANUAL.md (Section 12 etc). Toolbox tree double-click-to-add is a
  separate feature and unchanged. `openEvent` extension handler unchanged.

## Removed auto-wire on drop — 2026-08-26
- Bug: placing a control immediately created a code-behind default-event stub. Cause: the `drop`
  handler called `wireDefaultHandler(openEditor=false)` for every control with a default event
  (Button→Click etc.), inserting the stub + event attr on placement.
- Fix (designerPanel.ts): removed the auto-wire block from `drop` + removed unused `hasDefaultEvent`
  import. Stub + event attr now ONLY created on middle-click (`openEvent` → openEditor=true).
  Toolbox snippets already have no event attrs. Manual tip reworded (Auto-wired→Generated).

## Renaming a control refactors the code-behind (Name focus-loss) — 2026-08-26
- xamlModel.ts: `renameEventHandlers(old,new)` — renames doc-wide event attrs `<old>_` → `<new>_`.
- codeBehind.ts: `renameHandlersInCodeBehind(uri, old, new)` — renames `<old>_<Event>` identifiers
  in the .cs/.vb file using `\b<old>_(\w+)` (name-boundary guard: Button1 rename never touches
  Button10_Click).
- designerPanel.ts `__name__` handler: after renaming x:Name + syncContentToName, calls
  renameEventHandlers + await renameHandlersInCodeBehind (best-effort). VB accessors stay in sync
  via existing notifyEdit→syncAccessors path.
- designer.js: Name field commits on `change` (blur) or Enter, NOT debounced typing — so the
  rename + refactor happen on Name focus loss.
- Verified with /tmp/renamecheck.js (vscode stub): all 10 checks pass.
- FOLLOW-UP (same day): rename now updates ALL references, not just the VB getter stub/handlers.
  `renameHandlersInCodeBehind` → `renameControlInCodeBehind`; also renames bare `<old>` refs
  (`Button1.Text = ...`, comments, FindControl string) via `\b<old>\b` guard (Button10 untouched).
  Re-verified: 16 checks pass.

## Move-to-container into TabControl descends to visible tab — 2026-08-26
- `moveToContainer` used to append the control directly to a picked TabControl (raw tab item).
- Fix (designerPanel.ts): private `moveTargetFor(doc, container)` — for TabControl descends into
  the ACTIVE tab (activeTabs, fallback first) → down to the tab body Canvas (designer tabs ship
  DockPanel+Canvas), so the control lands in the tab content with Canvas.Left/Top. Stops at nested
  TabControl. ListBox/ItemsControl/Carousel keep item-append semantics.
- Verified with /tmp/movecheck.js (vscode stub, real provider method): all checks pass.
- FOLLOW-UP (same day): moved control could land OUTSIDE the target canvas visible area.
  `xamlModel.moveTo` only set Canvas.Left/Top=0 when absent, so a control from another Canvas kept
  old (out-of-range) coords. Fix: moveTo resets Canvas.Left/Top to origin whenever the control
  ACTUALLY changes parents into a Canvas (moved=true); same-parent move keeps position (no jump).
  Verified with /tmp/moveposcheck.js (5 checks) — all pass.

## Middle-click code-behind — VERIFIED + mousedown robustness 2026-08-26
- User: middle-click / placing no longer generates code-behind. Investigated:
  - Webview harness (/tmp/midtest.html + real designer.js + mock acquireVsCodeApi) → middle-click
    DOES post openEvent. Chromium test → preventDefault on mousedown does NOT suppress auxclick.
  - Full-path probe (/tmp/fullprobe.js, vscode stub) → openEventHandler generates VB stub, sets
    Click attr on model, opens editor. Code WORKS.
  - Likely cause: stale window (no reload) + placing no longer auto-wires (removed per user's own
    request, section 24).
- Change (defensive): designer.js handles middle-click on mousedown (button 1) instead of auxclick
  (preventDefault in the same handler stops autoscroll/paste). Re-verified via harness.

## Move-to-container places without overlap — 2026-08-27
- User: moving a control into a container should not render over existing controls.
- xamlModel.moveTo(el, target, pos?) now accepts an optional position (Canvas.Left/Top = pos).
- designerPanel: `renderedSize(doc, el)` + `freePositionIn(doc, canvas, el)` — finds the first
  non-overlapping spot (origin, then right-of/below each sibling, 8px gap; fallback origin).
  moveToContainer uses it when the target (incl. tab body Canvas from moveTargetFor) is a Canvas.
  StackPanel/Grid/DockPanel unchanged (panels auto-arrange). Verified /tmp/freeposcheck.js.

## StatusDate toolbox control (live date/time) — 2026-08-27
- User answers: built-in composition (TextBlock + timer), OS culture with seconds, C# + VB, live
  placeholder in preview.
- ControlFactory.cs: `StatusDate` snippet = TextBlock with Text={DateTime.Now:G} + Loaded="<n>_Loaded".
- codeBehind.ts: `insertStatusDateClock(uri, name)` inserts a Loaded handler with a per-second
  Avalonia.Threading.DispatcherTimer setting <name>.Text = DateTime.Now.ToString(). LOCAL timer
  (no orphaned field on delete); existing rename/delete flows handle <name>_Loaded + <name> refs.
- designerPanel.ts: drop handler calls insertStatusDateClock when msg.tag === 'StatusDate'.
- Verified /tmp/statusdatecheck.js (snippet + C#/VB code-behind).
- FOLLOW-UP (2026-08-27): VB build error BC36641 — inline `Sub(s, e)` lambda shadowed the enclosing
  handler's `e` param. FIX: lambda params renamed to `Sub(s2, e2)` in insertVbStatusDate (C# uses
  `(_, _)` discards, fine). Existing placed StatusDate still has old line — user must fix manually
  or delete + re-place.

## Anchor property (WinForms-style) — 2026-08-27
- User answers: multi-edge (combine; opposite pairs stretch), bundled helper in generated projects,
  all controls.
- `resources/AnchorHelper.cs` — `AvaloniaChrome.AnchorHelper` + `AnchorTracker` (ConditionalWeakTable).
  Attached `Anchor` ("Left,Bottom"), on control Loaded finds visual-parent Panel, captures fixed
  offsets, subscribes SizeChanged: single edge moves, opposite pair stretches (sets Width/Height).
- **C# gotchas:** static class can't be a generic type arg (`RegisterAttached<AnchorHelper,...>` →
  CS0718) AND the 2-generic `RegisterAttached<Control,string>` overload doesn't exist in Avalonia
  11.0.10 → use a NON-static class with private ctor + `RegisterAttached<AnchorHelper, Control, string>`.
- `resources/AnchorHelper.vb` — VB port. **VB gotchas:** (1) method named `Get` is a VB keyword →
  rename to `GetTracker`; (2) with `<RootNamespace>` set, VB prepends it to `Namespace AvaloniaChrome`
  → type is `<Root>.AvaloniaChrome.AnchorHelper` and the XAML compiler CANNOT resolve it as an
  **attached-property owner** from `using:AvaloniaChrome` (elements like chrome:ChromeWindow resolve
  via a root-ns-aware lookup; attached-property owners do NOT). FIX: `Namespace Global.AvaloniaChrome`.
- Generator: `projectScaffold.ts` ScaffoldOptions + anchorCs/anchorVb, writes AnchorHelper.cs/.vb next
  to ChromeWindow; `projectCreator.ts` reads both resources.
- Catalog: ANCHOR_PROPS key `chrome:AnchorHelper.Anchor`, label Anchor, dropdown [None,Left,Right,Top,
  Bottom,Left,Right,Top,Bottom,Left,Bottom,Right,Bottom,Left,Top,Right,Top]; added for NON-ROOT
  controls in propertyDefsFor; DEFAULTS = 'None' (setting None strips attr).
- xamlModel.ensureChromeNamespace() + designerPanel ensures xmlns:chrome when Anchor set (non-None).
- Host: NO change — `AnchorHelper.Anchor` is skipped by ApplyProperty (unknown prop) → draws at design
  position. chrome: documents already fall to the programmatic renderer.
- xmldom handles the colon-prefixed attribute fine (get/set/serialize; missing → '').
- Verified: /tmp/AnchorTestCs + /tmp/AnchorTestVb (net10 + Avalonia 12.1.1, chrome root, Anchor=
  "Left,Bottom") build 0/0. Packaged + installed. **Existing (non-generated) projects lack the helper
  → Anchor won't compile until AnchorHelper.cs/.vb is copied in; regenerated projects get it free.**
- FOLLOW-UP (2026-08-27): **missing-helper warning.** `designerPanel.ts` now warns once per document
  (anchorWarnedDocs Set) when Anchor is set to non-None on a project lacking the helper.
  `anchorHelperMissing(doc.uri)` uses `findProject` (projectParser) + checks project dir & .axaml dir
  for `AnchorHelper.vb`/`.cs` per language; fires right after ensureChromeNamespace() in setProperty.
  Imports added: `fs`, `findProject`. User hit AVLN2000 in existing TestVBApp (no helper) → fixed by
  copying AnchorHelper.vb in. tsc 0 errors; packaged + installed.

## Refactor (2026-08-28, user-authored) — re-read state
- `package.json`: `contributes.views` order swapped → **`avaloniaDesigner.projects` (New Project) is
  now FIRST** (renders at top of sidebar), Toolbox below. View IDs unchanged. `activationEvents` is now
  just `["onStartupFinished"]`.
- `src/projectView.ts`: webview view fills container dynamically — body = flex column (height:100%),
  `.hint` pinned bottom via `margin-top:auto` (VS Code can't shrink-wrap WebviewView height).
- `src/toolboxProvider.ts`: toolbox tree now grouped into **collapsible categories** (`CategoryItem`)
  mirroring CONTROLS.md `##` sections; `controlsForGroup()` filters CONTROL_CATALOG by `group`.
- `CONTROLS.md` (new): full Avalonia 11.0.10 + 12.1.1 control reference, per-control designer support
  legend (✅ Toolbox / ✓ Previewed / —), categories, docking/anchor/auto-wire docs.
- NOTES.md has new §31 documenting the view-move + dynamic-resize refactor.
- `npm run compile` 0 errors; PROBLEMS clean.
- DOC STALE SPOTS (fixed 2026-08-28): USER_MANUAL.md header revision bumped to 2026-08-28; §6
  auto-wire claim corrected — placing a control does NOT create code (removed 2026-08-26, NOTES §24);
  §6 now says interactive controls have a default event wired via **middle-click** and links to §12.

## DataSet designer (runtime-construction) — 2026-08-28
- User answers: .adset custom editor (JSON persists), generate runtime code + .xsd, auto-detect
  C#/VB, schema-only v1 (no relations).
- New files: `src/dataSetModel.ts`, `src/dataSetGenerator.ts`, `src/dataSetEditor.ts`,
  `media/dataSet.css`, `media/dataSet.js`. Custom editor viewType `avaloniaDesigner.dataSetDesigner`
  for `*.adset`. Command `avaloniaDesigner.newDataSet` (palette) + `openDataSet` (explorer/context).
- Toolbox: **DataSet** item under **Data & Grid** — NOT a form control: ControlItem gives it its own
  command/tooltip, excluded from drag; `addFromToolbox` + form `drop` guard tag 'DataSet'.
- **GOTCHAS:** (1) opening a custom editor must use `vscode.openWith` (showTextDocument has no
  viewType option). (2) C# codegen CS8602 under Nullable enable → use `Columns.Add` return value,
  not the null-annotated `Columns["name"]` indexer. (3) VB root-namespace DOUBLING: emitting
  `Namespace <Root>` in generated .vb gets RootNamespace prepended again → class invisible
  (BC30451) → emit VB class with NO Namespace block (global ns; RootNamespace applied once).
- Verified: /tmp/dsprobe.js + /tmp/DsTestCs + /tmp/DsTestVb — generated code builds 0 warnings and
  RUNS in both C# and VB (tables/columns/types/captions/AllowDBNull all correct). tsc 0 errors;
  PROBLEMS clean; node --check OK; packaged + installed.
- FEATURE (2026-08-28): **bind table → control** in DataSet designer. DATASET panel gets a
  "Bind to control" dropdown (project's named DataGrid/ListBox/ComboBox/ItemsControl), enabled only
  when a table is selected on canvas; `*` marks controls already bound (disabled unless it's the
  current binding); Un-bind button. Model: `DataTableSpec.boundTo` (omitted when null). codeBehind:
  `bindControlToDataSet`/`unbindControlFromDataSet` (DataView property + ctor `Ctrl.ItemsSource =
  Table;` + using/Imports; idempotent; creates code-behind if missing). dataSetEditor: xmldom scan
  of project .axaml for bindable controls + all .adset bound markers; state carries `controls`.
  VERIFIED compiles 0/0 in real Avalonia 12.1.1 projects (C# ListBox + VB ListBox w/ accessor).
- **AVALONIA 12 GOTCHA (FIXED 2026-08-28):** DataGrid lives in the `Avalonia.Controls.DataGrid`
  package. Root cause of "no field / CS0103 / AXN0004" was the package NOT being referenced by
  generated projects — with it present Avalonia 12 DOES generate the field for `dg:DataGrid`.
  FIXES: (1) projectScaffold csproj+vbproj now include Avalonia.Controls.DataGrid; (2) ControlFactory
  DataGrid snippet → `<dg:DataGrid .../>`; (3) xamlModel `ensureXmlns` + addControl adds
  `xmlns:dg="using:Avalonia.Controls"` when placing a DataGrid. A C# FindControl accessor was tried
  but REVERTED (CS0102 collision with the generated field). C# binds DataGrid via generated field;
  VB via FindControl accessors. Verified 0/0 in both (C# + VB, Avalonia 12.1.1 + DataGrid pkg).
  Existing projects must add the package manually.

## Toolbox: ItemsControl + UniformGrid added (2026-08-28)
- `toolboxProvider.ts`: ItemsControl under Items controls & lists, UniformGrid under Layout panels.
- `controlInfo.ts` entries; `propertyCatalog.ts` CONTROL_PROPS + KEY_DEFAULTS/DEFAULTS (Columns/Rows/
  FirstColumn/FirstRow = '0' strips when 0). No default event.
- `host/ControlFactory.cs`: snippets (ItemsControl ships 3 starter TextBlocks) + TypeMap.
  GOTCHA: UniformGrid is in **Avalonia.Controls.Primitives** in Avalonia 11 (CS0246 → added using).
- Verified: `<UniformGrid>` + `<ItemsControl>` resolve from default XAML ns in Avalonia 12 (compile
  test 0/0); host 0/0; tsc clean; packaged + installed. "List Items" editor stays ListBox-only.
- FOLLOW-UP (2026-08-29): placing a DataGrid into an EXISTING project (TestVBApp) → VB accessor
  `DataGrid1 As DataGrid` → BC30002 because the project lacked the Avalonia.Controls.DataGrid
  package. FIX: added the package to TestVBApp.vbproj (builds 0/0) + added a designer warning
  (`dataGridWarnedDocs` + `projectHasDataGridPackage`) in the drop handler: one-time per-document
  warning when a DataGrid is placed into a project not referencing the package. tsc clean;
  packaged + installed.
- FEATURE (2026-08-29): **sample row for bound tables.** Bound tables get a `Rows.Add(...)` in the
  generated MyData.cs/.vb (control shows data at runtime). User answers: auto-regenerate on
  bind/unbind; only bound tables, one row each; sample values TYPED per column in the designer.
  - `DataColumnSpec.sampleValue` (string|null; omitted when null). `csSampleValue`/`vbSampleValue`
    convert typed values to type-correct literals (blank → auto default). `writeGeneratedFiles`
    extracted; Generate button AND bind/unbind call it. Column panel has a "Sample value" field.
  - Verified: generator output correct (bound→row, unbound→none); compiled + RAN in C#/VB console
    apps → `Rows: 1 / 1 | John Doe | Sample | 2024/01/15`. tsc clean; packaged + installed.
- BUG FIX (2026-08-28): DataSet canvas table-drag broken. In `media/dataSet.js` the pointerdown
  handler called setSelection (→ renderCanvas rebuilds ALL .tbl DOM) BEFORE startDrag, so the node
  being dragged was detached (invisible; offsetLeft=0 → jumped to wrong pos on release). FIX:
  capture clientX/Y, setSelection, then re-query fresh node by data-name (CSS.escape) and drag
  that; drag origin = node's style.left/top; cleanup on pointercancel. node --check OK; repackaged
  + reinstalled.
- FIX (2026-08-29): **"DataGrid doesn't render" → bind to a typed `List(Of <Table>Row)`, NOT a
  DataView.** DataGrid auto-generates columns from public properties of bound items; a DataView has
  none and Avalonia ignores ITypedList (confirmed via `strings` on Avalonia.Controls.DataGrid.dll) →
  grid was empty at runtime though it compiled. Fix in `dataSetGenerator.ts`: bound tables now also
  emit `Get<T>()` (List<Row> from DataTable) + a `<Table>Row` class (typed prop per column,
  null-safe reads `== System.DBNull.Value ? null/default : (T)r["X"]` / `If(r("X") Is DBNull.Value,
  Nothing, ...)`, ToString = first string column). `codeBehind.ts` binds to
  `List<TableRow>`/`List(Of TableRow)` property; `removeDataSetBinding` regexes match BOTH old
  DataView + new List shapes (Un-bind cleans up stale DataView props too).
  - **VB GOTCHA (BC30035):** object-initializer members are comma-separated, NO trailing comma.
    `vbGetMethod` must append `,` to every `.X = ...` line except the last (C# allows trailing
    commas — csGetMethod fine).
  - VERIFIED: TestVBApp MyData.vb regenerated → 0/0; C# + VB console runs → GetCustomers() returns
    the 1 sample row (12345 | Koos | koos@koos.com | ...); C# confirms CustomersRow props
    Id(Int32)/Name(String)/Email(String)/CreatedAt(DateTime) = what DataGrid needs. Bind/unbind
    probe: inserts new List property, unbind removes new + old DataView property. tsc clean;
    packaged + installed.
  - Existing `.adset` projects: open designer → **Generate Code** (or re-bind) to get new shape.
    ListBox/ComboBox now show ToString() (= first string column).
- **ROOT CAUSE "DataGrid doesn't render" (2026-08-29): DataGrid CONTROL THEME not registered.**
  `FluentTheme` does NOT include the DataGrid theme (DataGrid is a separate assembly). Without it a
  DataGrid = TemplatedControl with NULL template → paints NOTHING (invisible in app AND designer;
  Background/Border no effect; click still selects via bounds). Not z-order. VERIFIED headless
  (Avalonia 11.0.10 + 12.1.1): `DataGrid.Template` null with plain `<FluentTheme/>`; adding
  `<StyleInclude Source="avares://Avalonia.Controls.DataGrid/Themes/Fluent.xaml"/>` gives a template
  and Background/BorderBrush/BorderThickness all render. FIX applied in 3 places:
  1. `projectScaffold.ts appAxaml()` → generated App.axaml now emits the StyleInclude (C# + VB).
  2. `host/Program.cs App.Initialize()` → adds the StyleInclude (designer preview renders DataGrids).
  3. Existing projects: add it to App.axaml by hand (TestVBApp done).
  Empty unbound DataGrid is still blank (nothing to draw) — set Background or bind it. Bound grid
  shows columns+rows at runtime (AutoGenerateColumns works; headless harness can't drive the load
  lifecycle so `Columns`=0 there). Verified: host 0 err, tsc clean, TestVBApp 0/0, packaged+installed.
- **FOLLOW-UP (2026-08-29): "grid visible but no rows" = STALE binding, not AutoGenerateColumns.**
  AutoGenerateColumns CONFIRMED to work with typed `List(Of <Row>)`: DataGrid source
  `GenerateColumnsFromProperties()` reflects over item public props → DataGridTextColumn per prop
  (bool→CheckBox); `AutoGenerateColumnsPrivate()` gated on `_measured` (real layout pass) — why
  headless showed Columns=0. User's "no rows": `.adset` boundTo marker set + MyData.vb regenerated
  but code-behind line MISSING (project recreated after binding). Re-bind fixed; TestVBApp 0/0.
  - NEW: Properties panel shows DataSet-bound control's **Items Source** as read-only
    `Dataset.Table` (`MyData.Customers`) instead of blank — binding is code-behind, not XAML attr.
    Via `propertyDefsFor(el, effective?, itemSourceOverride?)` + `PropDef.readOnly` +
    designer.js `if (p.readOnly) control.disabled = true;` + `designerPanel.dataSetBindingFor()`
    (scans project .adset via parseDataSet).
  - NEW: Bind on an already-marked-bound table now REPAIRS a stale code-behind —
    `codeBehind.hasDataSetBinding()` checks for `Control.ItemsSource = <Table>` line; if missing,
    re-writes it ("Re-wrote the binding…") instead of "Already bound".
  - Verified: tsc clean, probes pass, PROBLEMS clean, packaged + installed.
- **ROOT CAUSE "still no columns/headers/rows" (2026-08-29): DataGrid AutoGenerateColumns
  defaults to FALSE in Avalonia** (`Register<DataGrid,bool>` has no default → false). The placed
  DataGrid never wrote the attribute → no columns ever generated even with theme + binding. This
  was the FINAL piece. VERIFIED headless (Avalonia 12.1.1): fresh DataGrid = AutoGenerateColumns
  False; with True → Columns=4 (Id/Name/Email/CreatedAt DataGridTextColumn) + row renders
  (pixel-probed). FIX:
  1. `host/ControlFactory.cs` DataGrid snippet emits `AutoGenerateColumns="True"`.
  2. `dataSetEditor.ensureDataGridAutoGenerateColumns(axamlPath, control)` — inserts
     AutoGenerateColumns="True" into the DataGrid opening tag when binding (new-bind + repair
     paths), idempotent regex, respects explicit False.
  3. User's DataGrid1 got AutoGenerateColumns="True" by hand.
  Verified: host 0 err, tsc clean, TestVBApp 0/0, packaged + installed.
- **FEATURE (2026-08-29): DataGrid live row editing (add/edit/delete + persistence).** WinForms-style:
  blank "+ Add row…" row at the grid bottom → popup with type-matched inputs per column + Save;
  right-click a row → Edit/Delete (delete confirms); in-place cell editing also persists; changes
  saved to an XML file (`MyData.<Table>.xml` in AppContext.BaseDirectory) via DataSet.WriteXml.
  - Model: `DataTableSpec.boundToType` ('DataGrid'|'ListBox'|…) set on bind; generator emits the
    grid support only for `boundToType==='DataGrid'`.
  - Generator (`dataSetGenerator.ts`): `Load<T>()` (ObservableCollection from XML, seeds sample row
    if no file, appends placeholder row w/ `IsPlaceholder` + "+ Add row…" in first string col),
    `Save<T>()` (rebuild DataTable after `t.Clear()` to drop CreateDataSet's seed rows), `Wire<T>Grid`
    (ItemsSource; `RowEditEnded`→save; `LoadingRow` per-row: placeholder left-click→Add, real rows
    get ContextMenu Edit/Delete), Add/Edit/Delete async + OwnerOf via
    `LogicalExtensions.FindLogicalAncestorOfType<Window>`. `<T>Row` now INotifyPropertyChanged +
    IsPlaceholder (DataGrid-bound only). `<T>EditDialog` (code-built Window, type-matched inputs;
    Byte[] skipped) + shared ConfirmDialog.
  - codeBehind: `DataSetBindingRef.controlType`; DataGrid bind emits ObservableCollection import +
    `_customers` field + `_customers = MyData.LoadCustomers()` + `MyData.Wire<T>Grid(DataGrid1, _customers)`;
    list controls keep old property+ItemsSource. `removeDataSetBinding` strips new shape (field +
    Load/Wire lines; import left harmless); `hasDataSetBinding` matches `Wire<T>Grid(` too.
  - **Avalonia 12 gotchas (verified):** (1) `Window.DialogResult` REMOVED → `Close(obj)` +
    `await dlg.ShowDialog<T>(owner)`; `Window.Owner` has no public setter → pass owner to ShowDialog.
    (2) `IVisual`/`Visual.VisualParent`/`InputHitTest` GONE → use DataGrid `LoadingRow` (per-row
    handlers), no hit-testing. (3) `DataSet.ReadXml` (data-only) infers string types → C# reads with
    `Convert.ToInt32/ToDateTime` (not `(int)`); VB `CInt/CDate` already convert. (4) VB `Imports`
    must be added BEFORE computing class anchors (else stale index inserts mid-method).
  - Verified: /tmp/DgEditVb + /tmp/DgEditCs (Avalonia 12.1.1) build 0/0 + run (load/save round-trip
    `Sample, Pieter(id=7), + Add row…[PH]`; dialogs construct); TestVBApp regenerated + re-wired →
    0/0; tsc clean; packaged + installed.
  - Existing .adset: re-bind (or Generate) to get boundToType + new code-behind wiring.
  - FOLLOW-UP: hide the `IsPlaceholder` column — AutoGenerateColumns makes a column for every
    public property. Fix: mark it `[Display(AutoGenerateField = false)]` (C#) /
    `<Display(AutoGenerateField:=False)>` (VB); Avalonia DataGrid honors
    DisplayAttribute.GetAutoGenerateField(). Verified headless: 4 columns (Id/Name/Email/CreatedAt),
    IsPlaceholder hidden. TestVBApp 0/0, packaged + installed.
  - FOLLOW-UP (2026-08-29): TWO runtime bug fixes.
    (A) Edit popup didn't apply/save: Edit<T>Row opened the dialog pre-filled but never read inputs
    back into `row` — only `Save<T>(rows)`. Fix: dialogs got `ApplyTo(<T>Row)` (the NewRow read-lines)
    and `NewRow()` calls it; Edit now `{ dlg.ApplyTo(row); Save<T>(rows); }` after ShowDialog ok.
    (B) "+ Add row…" click only selected the cell: placeholder row's `PointerPressed +=` (handledEventsToo
    =false) never fired because the DataGrid CELL handles PointerPressed (selection) first. Fix:
    `AddHandler(PointerPressedEvent, handler, RoutingStrategies.Bubble, true)` — C# inline lambda;
    VB needs a typed handler local (`Dim ph As EventHandler(Of PointerPressedEventArgs) = Sub...`)
    then `row.AddHandler(..., ph, ..., True)` — `row.AddHandler(...)` is a METHOD call (allowed after
    the dot); the `AddHandler evt, handler` STATEMENT can't set handledEventsToo.
    VERIFIED C# headless: ApplyTo updated existing row (Changed/99) + persisted on reload; simulated
    MouseDown/Up on placeholder row → plain `+=` fired False, handledEventsToo handler fired True.
    Both refs + TestVBApp 0/0; tsc clean; packaged + installed. USER_MANUAL §18 already described the
    now-working behaviour (no manual edit needed).
  - FOLLOW-UP (2026-08-29): IN-CELL editing is the method for existing rows + DatePicker for date
    cells. User decisions: auto-save on commit; remove right-click "Edit row…" popup (keep Delete).
    - Wire<T>Grid now: `grid.AutoGenerateColumns = false` + `Build<T>Columns(grid)` (typed columns
      in code) + `ItemsSource`. XAML KEEPS AutoGenerateColumns="True" ONLY for the designer preview
      (host renders XAML without code-behind); runtime override wins (verified: exactly typed
      columns). Build<T>Columns: DataGridTextColumn (text/number/Guid), DataGridCheckBoxColumn
      (bool), DataGridTemplateColumn for DateTime → CellTemplate = formatted TextBlock ("yyyy-MM-dd
      HH:mm"), CellEditingTemplate = DatePicker bound TwoWay with converter. Column type comes from
      the .adset (DateTime), no XAML declaration needed.
    - Avalonia 12 facts (headless-verified): DatePicker.SelectedDate is `DateTimeOffset?` → need a
      DateTime<->DateTimeOffset converter to bind a DateTime property. FuncDataTemplate<T> build
      delegate is `Func<T?, INameScope, Control>` → lambdas MUST take 2 params `(r, _) =>` (1-param
      lambda = CS1662). `DataGridEditAction.Commit` exists in Avalonia.Controls.
    - Save on commit only: RowEditEnded was `(_,_)=>Save(rows)` (fired on Cancel too); now guards
      `if (e.EditAction == Avalonia.Controls.DataGridEditAction.Commit)` (VB single-line If).
    - Shared DateTimeToOffsetConverter: C# plain IValueConverter; VB needs EXPLICIT
      `Implements Avalonia.Data.Converters.IValueConverter.Convert/ConvertBack` (VB implicit
      matching rejects fully-qualified CultureInfo param → BC30149; explicit works, verified in
      minimal repro). Convert: DateTime(non-MinValue)->DateTimeOffset(Local); ConvertBack: ->.LocalDateTime.
    - VERIFIED C# headless on real generated MyData.cs: WireCustomersGrid → exactly 4 typed columns
      (Id/Customer/Email/DataGridTemplateColumn(Created)), date cell shows "2026-08-29 14:44",
      in-cell DatePicker.SelectedDate updates row.CreatedAt (2027-01-15) via TwoWay converter.
      Refs + TestVBApp 0/0; tsc clean; packaged + installed. Docs updated (NOTES §34, USER_MANUAL
      §18, CONTROLS.md).
  - FOLLOW-UP (2026-08-29): runtime UNDO/REDO for bound grids. Default depth 5, settable via a new
    **'Undo-Redo'** property on the DataGrid in the FORM DESIGNER (user chose control property, not
    DataSet table property); shortcuts **Ctrl+U** (undo) / **Ctrl+R** (redo). Covers in-cell edits
    (text/checkbox/date picker) + add + delete.
    - Data model: `DataTableSpec.undoRedoDepth?: number` (default 5, 0 = off). Serialized to .adset
      only when ≠ 5; parsed with default 5. Stored per-table (generator needs it at codegen).
    - Form designer: `propertyDefsFor(..., undoRedo?)` injects an editable 'Undo-Redo' number field
      (key `UndoRedoDepth`) only for a DataGrid bound to a DataSet table. `designerPanel.setProperty`
      special-cases `UndoRedoDepth` (NOT a XAML attr — no setProperty/render): `findBoundTable()`
      locates .adset+table, writes depth, saves .adset, regenerates MyData (.cs/.vb+.xsd via
      generateCs/Vb/Xsd + findProject). designer.js commits on `change` (not per keystroke).
    - Generated runtime (per grid-bound table, C#+VB): snapshot history. `Snap<T>(rows)` deep-copies
      non-placeholder rows into `<T>Snapshot` (list of Row copies + `Key` = loop-built join of
      `"{col}|{col}..."` — NO LINQ, both langs lack System.Linq import). `_<T>Undo`/`_<T>Redo` =
      `List<Snapshot>` (index0 oldest); Push (Add+Trim+clear redo), Trim (RemoveAt(0) over depth),
      Restore (remove non-placeholder, reinsert before placeholder, Save), Undo/Redo (swap stacks).
      Push at Add/Delete before mutating; in-cell edits: `BeginningEdit` snapshots PRE-edit into
      `_<T>PendingEdit`, `RowEditEnded`(Commit) keeps it ONLY if Key changed else discards, Cancel
      discards.
    - Keyboard: local `HandleUndoKey` (C# local fn / VB typed `EventHandler(Of KeyEventArgs)`) with
      `if (e.Handled) return` guard, Ctrl+U/R; attached to BOTH grid.KeyDown and the window
      (`FindLogicalAncestorOfType<Window>(grid,true)` = OwnerOf). Window handler only attaches when
      ancestor reachable at Wire time (app: yes, constructor after InitializeComponent; headless
      test: must Wire AFTER Show or grid handler needs a focused cell).
    - Headless key sim: use `HeadlessWindowExtensions.KeyPress(win, Key.U, RawInputModifiers.Control,
      (PhysicalKey)(int)k, "u")` — `KeyDown` is the EVENT (CS0079/CS0117), not an extension method.
    - VERIFIED C# headless: edit→undo/redo round-trips (Sample↔Edited), delete→Ctrl+U restores, depth
      cap (6 pushes → 5), Ctrl+U KeyPress fired window handler. Refs+TestVBApp 0/0; tsc clean;
      PROBLEMS clean; packaged+installed. Docs: NOTES §34, USER_MANUAL §18, CONTROLS.md.
  - FOLLOW-UP (2026-08-29): interactive 'ITEMS' editor for ComboBox / ListBox / ItemsControl. New
    'Items' property (a `kind:'button'` PropDef) opens a modal popup in the designer webview; type
    one item per line; Save turns each non-blank line into a XAML child item. User decisions:
    store as XAML children (not code-behind), disable when DataSet-bound/ItemsSource, warn before
    replacing complex items, include ItemsControl.
    - xamlModel.ts helpers: `itemsOf(el)` (ComboBox→ComboBoxItem, ListBox→ListBoxItem,
      ItemsControl→all children), `itemText` (Content / TextBlock.Text / single child),
      `setItemText`, `isPlainTextItem` (false on USER name via `hasExplicitName` — auto `_TagN`
      in-memory names DON'T count, verified; false on child controls, EVENT_ATTRS attrs, attached
      props), `newItemFor` + private `makeItem`.
    - propertyCatalog.ts: added 'button' to PropDef/PropTemplate kind unions; injects Items prop
      (value 'Edit items…') for the 3 types, readOnly when itemSourceOverride (DataSet-bound) or
      an ItemsSource attr exists.
    - designerPanel.ts: sendProperties sends `msg.items` (item texts) alongside existing
      `msg.listItems` (ListBox per-item section). New `saveItems` message: trim/blank-filter
      lines, modal warn if any existing item not plain, remove old children, append newItemFor per
      line, auto-grow/shrink Height (ListBox/ItemsControl) by delta×itemHeightFor, then
      notifyEdit/render/sendProperties. NOTE: `msg` is `any` → annotate map+filter params
      (`.map((s: unknown)=>...).filter((s: string)=>...)`) else TS7006.
    - designer.js: renders kind:'button' as `.prop-button` opening the items modal (pre-fill from
      `msg.items`); modal overlay `.modal`/`.modal-box` + textarea + Save/Cancel; Escape +
      outside-click close; Save posts `{type:'saveItems',name,items:[lines]}`. designer.css added
      .prop-button/.modal/.modal-box/.modal-btn.
    - VERIFIED (node probes): itemsOf/itemText/newItemFor per type; isPlainTextItem true for plain
      + auto-named, false for user-named/event/child; propertyDefsFor emits Items for the 3 types,
      MISSING on Button, readOnly when bound; replace produces tidy ListBoxItem children (auto
      names stripped on save). tsc clean; PROBLEMS clean; packaged+installed. Docs: NOTES §34,
      USER_MANUAL §8 + ToC, CONTROLS.md.
    - BUG FIX: modal appeared unprovoked + couldn't be cancelled. Root cause: `.modal { display:
      flex }` (author CSS) OVERRIDES the HTML `hidden` attribute (UA `[hidden]{display:none}`), so
      the modal was always visible and setting `hidden=true` (Cancel/Escape) had no visual effect.
      Fix: add `.modal[hidden] { display: none; }` (specificity 0,2,0 beats 0,1,0). GOTCHA: any
      element toggled via the `hidden` attribute must NOT have an author `display` rule without a
      matching `[hidden]` override — check this whenever a webview modal/overlay "always shows".
  - FEATURE (2026-08-29): UNDO/REDO in the designers (form + DataSet), 5 levels. Ctrl+Z undo,
    Ctrl+Shift+Z AND Ctrl+Y redo (user chose both). The VS Code native onDidChangeCustomDocument
    undo existed but was UNREACHABLE (webviews consume the keys) — so shortcuts are handled in the
    webview and posted to the panel. Form designer does FULL reversibility (user chose): snapshots
    XAML **and** the code-behind file, so renames/deletes that touch code-behind undo cleanly.
    - Design = bounded STATE-LIST pointer history: `{states[], index}`; push post-edit state on
      every notifyEdit; `states.length = index+1` drops redo; cap 6 states (UNDO_STATES =
      LEVELS+1 = current+5 prior → exactly 5 undo + 5 redo); new edit clears redo. Probed:
      5/5/cap/redo-clear ✓.
    - Form (designerPanel): HistoryStep = {xaml, codeBehindPath, codeBehind}; findCodeBehindFile
      (EXPORTED from codeBehind.ts — was module-private) resolves the .axaml.cs/.vb sibling;
      ensureHistory seeds on 'ready'; pushHistory in notifyEdit reads code-behind at that moment
      (renames/delete-with-handlers are AWAITED before notifyEdit, so snapshot = post-edit, prev
      state = pre-edit → reversible); undoRedo restores model + writes code-behind + re-runs
      syncAccessors (covers async accessor race) + render + sendProperties (keeps selection if it
      still exists). History per-doc Map, cleared on dispose. Webview sends selected name.
    - DataSet (dataSetEditor): same state-list, states = serializeDataSet(doc.spec) strings;
      undoRedo = parseDataSet + postState.
    - Webviews: designer.js keydown (inside existing ctrl/meta block after typing guard) +
      dataSet.js keydown; `z`→undo (shiftKey→redo), `y`→redo; preventDefault; typing guard keeps
      text-field editing/undo intact.
    - VERIFIED: tsc clean, PROBLEMS clean, both JS node --check, algorithm probe, findCodeBehindFile
      export probe. Packaged + installed. Docs: NOTES §35, USER_MANUAL §14 shortcuts. Native
      onDidChangeCustomDocument undo/redo kept as-is (XAML-only fallback).
  - DIAG (2026-08-29): "There is no data provider registered that can provide view data." persists
    in the New Project webview view even after reload, though the provider IS registered + the
    extension activates. Verified: installed manifest/main/out correct + current; compiled
    extension.js has createTreeView + registerWebviewViewProvider; fresh diagnostic window
    activated the extension at startup via onStartupFinished (no error). USER MAIN WINDOW logs show
    it activates on `onView:avaloniaDesigner.projects` EVERY host start (host restarts are normal
    window reloads, exit 0). CONCLUSION: the Avalonia Designer container is restored OPEN at window
    startup → the webview view is created BEFORE the extension activates → VS Code commits it to the
    tree-style "no data provider" placeholder and does NOT convert it when the webview view provider
    registers a moment later (known webview-view-shown-before-activation quirk). FIX ATTEMPTED:
    registered the two views FIRST in activate (before maybeRunFirstBuild/PreviewerHostManager),
    added `console.log('[avalonia-designer] ...')` to activate + resolveWebviewView + try/catch in
    resolveWebviewView, reverted redundant explicit activationEvents (VS Code 1.135 auto-generates
    from contributes — linter flags them). WORKAROUND for the user: reload, then toggle the
    Avalonia Designer container (click the activity-bar icon twice) to force the view to re-create
    after the provider is registered; close the container before closing VS Code to avoid a
    restored-open container. Next step if it persists: check Output → Extension Host for the
    `[avalonia-designer]` lines (activate start / views registered / resolving New Project view).
    - Follow-up (2026-08-29): user pasted exthost.log confirming the extension DOES activate at
      startup (onStartupFinished 16:32:00) and in the current host (onCustomEditor for the DataSet
      designer) — so activation isn't the problem. FOUND: extension `console.log` does NOT appear
      in the exthost.log file in VS Code 1.135 (only in the Extension Host output panel) — the
      earlier console.log diagnostics were invisible in the file. FIX: added `src/logger.ts` — a
      shared `vscode.window.createOutputChannel('Avalonia Designer')` + `log()/logError()`; used
      in extension.ts (activate wrapped in try/catch: "activate start" / "views registered" /
      "activate complete" / "activate FAILED") and projectView.ts resolveWebviewView ("resolving
      New Project view" / "resolved" / "FAILED"). Reliable diagnostics: View → Output →
      "Avalonia Designer".
    - ROOT CAUSE FOUND (2026-08-29): the "New Project" view contribution in package.json was
      MISSING `"type": "webview"`. VS Code's default view type is `"tree"` — without
      `"type":"webview"`, the contributed view is treated as a TREE view, and since the extension
      registers a WebviewViewProvider (not a TreeDataProvider) for it, VS Code shows
      "There is no data provider registered that can provide view data". The toolbox (a real tree
      view, default type, has a TreeDataProvider) worked; the New Project webview view didn't.
      FIX: added `"type": "webview"` to the `avaloniaDesigner.projects` view contribution
      (verified in the installed manifest). GOTCHA: for ANY webview view
      (registerWebviewViewProvider), the view contribution MUST include `"type": "webview"` —
      otherwise VS Code treats it as a tree view and the placeholder appears, regardless of
      activation. This was NOT an activation/timing bug at all — activation was fine all along.
  - FEATURE (2026-08-30): 'CUSTOM TITLE BAR' toolbox tool. New projects now use the DEFAULT Avalonia
    title bar (plain <Window> root + Window code-behind); the ChromeWindow bar becomes a Toolbox
    item that converts the window on drop. User decisions: copy-always (ChromeWindow.cs/.vb +
    AnchorHelper still bundled in every new project — conversion needs no copy); category BARS;
    one-way (revert = form designer Ctrl+Z undo, restores XAML + code-behind); title auto-copied
    from window Title.
    - projectScaffold: MainWindow.axaml via buildAxaml(tpl,formName,'Window',ns, displayName?) —
      buildAxaml gained optional displayName (title/body show project name, x:Class stays form
      name); code-behind derives Window. ChromeWindow/AnchorHelper STILL written (copy-always).
      New projects build 0/0 (C#+VB). newForm already used buildAxaml (default bar).
    - toolbox: {label:'Custom Title Bar', tag:'CustomTitleBar', group:BARS} — not a real control,
      a designer action (drop handler special-cases before host.snippet). controlInfo entry added.
    - xamlModel.convertRootToChromeWindow(title): re-tags root Window→chrome:ChromeWindow (copy
      attrs+children, doc.replaceChild), ensureChromeNamespace (xmlns:chrome=using:AvaloniaChrome),
      TitleBarTitle=title, bump Height (+d:DesignHeight if xmlns:d declared) by CHROME_TITLEBAR_HEIGHT
      (44, imported from formTemplates). false if already Chrome or root not Window.
    - codeBehind.convertCodeBehindToChrome(uri): C# `: Window`→`: AvaloniaChrome.ChromeWindow`;
      VB `Inherits Window`→`Inherits AvaloniaChrome.ChromeWindow` (fully-qualified — VB Imports
      gotcha). Idempotent. NOTE: findCodeBehindFile returns the .cs FIRST if BOTH .cs+.vb exist
      (test artifact only — real projects have one).
    - designerPanel: drop special-case CustomTitleBar → applyCustomTitleBar (guards already-Chrome /
      non-Window; convert model + code-behind BEFORE notifyEdit so undo snapshots capture converted
      code-behind; render; sendProperties(null) shows root → Title Bar Text/Icon; info msg).
    - Host preview already mirrors chrome:ChromeWindow roots (XamlRenderer BuildChromeTitleBar) →
      designer shows the custom bar after conversion.
    - VERIFIED: model probe (Window→ChromeWindow +44 height/DesignHeight, xmlns:chrome, TitleBarTitle,
      false on already-converted + UserControl); codeBehind probe (C# + VB); generated default-bar
      projects build 0/0; CONVERTED projects build 0/0 in C# AND VB. tsc clean; PROBLEMS clean;
      packaged+installed. Docs: NOTES §36, CONTROLS.md Bars + section, USER_MANUAL §2 + §16 + ToC.
  - FIX (2026-08-30): sidebar "Create C#/VB.NET Project…" buttons asked for the LANGUAGE first even
    though the button implies it. `createNewProject(context, forcedLanguage?: 'cs'|'vb')` now skips
    `pickLanguage()` when forced; projectView sends 'cs'/'vb' from the createCs/createVb messages.
    The generic `avaloniaDesigner.newProject` command (no forced language) still asks language first
    (correct). Verified arity 2; tsc clean; PROBLEMS clean; packaged+installed. USER_MANUAL §2 note.
  - FEATURE (2026-08-30): FILE BROWSER for file-path properties. The only file props are **Image →
    Source**, **Window → Icon**, **ChromeWindow → Title Bar Icon** (Background/BorderBrush/etc are
    COLOURS → colour picker; FontFamily is a font name; ItemsSource is a binding). User chose
    **copy-into-project + pack URI** (portable, not absolute paths).
    - propertyCatalog: added 'file' to PropDef/PropTemplate kind unions; Source/Icon/TitleBarIcon are
      kind:'file'. designer.js renders .prop-input-group (text input posts setProperty — typing a
      path/avares URI still works) + .prop-browse "…" button → post {type:'browseFile',name,key}.
      designer.css .prop-browse.
    - designerPanel 'browseFile': showOpenDialog (Images png/jpg/jpeg/gif/bmp/webp for Source; Icons
      ico/png for Icon/TitleBarIcon; root window via msg.name ?? doc.model.root) →
      bundleProjectFile(proj,path): copy to `<root>/Assets/` unique name (stem-N dedupe) →
      ensureAvaloniaResources(proj) (idempotent `<AvaloniaResource Include="Assets\**"/>` ItemGroup
      before `</Project>`) → returns `avares://<projectName>/Assets/<file>` → setProperty+notifyEdit+
      render+sendProperties+info. No-project fallback warns (type manually).
    - VERIFIED: propertyDefsFor emits kind:'file'; end-to-end /tmp/FileProbe (Assets PNG +
      AvaloniaResource + avares Image) dotnet build 0/0. GOTCHA: designer PREVIEW can't render
      avares://Project/... (host lacks user project's assets) — placeholder in designer, correct at
      runtime. tsc clean; PROBLEMS clean; packaged+installed. Docs: NOTES §37, CONTROLS.md,
      USER_MANUAL §8.
  - FIX (2026-08-30): ChromeWindow title bar now renders the caption buttons (min/max/close) AND
    the TitleBarIcon in the DESIGNER PREVIEW (was title-text-only; runtime was fine). Two parts:
    (1) `XamlRenderer.BuildChromeTitleBar` gained a static `CaptionButton()` helper (42x44,
    transparent, white glyph — `\u2013`/`\u25A1`/`\u2715`) right-aligned + a 26x26 `Image` (left,
    margin 12/0/10/0) when the icon resolves. (2) The host render request now carries an optional
    `projectPath` so the host can resolve the icon spec: `hostClient.render(xaml,w,h,projectPath?)`,
    `designerPanel.render()` sends `findProject(doc.uri)` root dir, `Program.cs` reads it,
    `Render/LoadWindow/BuildWindowFromXaml/BuildChromeTitleBar` thread it; `TryLoadTitleBarIcon`/
    `ResolveAssetPath` map `avares://Name/Assets/f` → `<root>/Assets/f`, `/Assets/f` → `<root>/Assets/f`,
    absolute path → as-is, relative → `<root>/spec`; unresolvable → null (icon hidden, no crash).
    GOTCHA: designer emits TitleBarTitle/TitleBarIcon as PLAIN attributes (setAttribute), NOT
    `chrome:ChromeWindow.TitleBarTitle` (whose XML LocalName is `ChromeWindow.TitleBarTitle`) —
    lookups must match LocalName == "TitleBarTitle"/"TitleBarIcon". PROBE-VERIFIED via real host
    render + PNG pixel decode: navy bar 14,33,56, centred title AA pixels, `□`+`✕`+dash glyphs, and
    a 26x26 icon block at x12-38/y8-33 (exactly the runtime position) resolved from
    avares://FileProbe/Assets/test.png. Decoder gotcha: PNG Sub/Average/Paeth filters must use the
    RECONSTRUCTED left neighbor (out[...]) not the raw byte — using raw gives all-black images.
    Still limited: plain body `<Image Source="avares://…">` remains a placeholder (runtime loader
    has no project assets; programmatic ApplyProperty doesn't string→IImage). dotnet --no-incremental
    0/0, tsc clean, packaged+installed. Docs: NOTES §38, CONTROLS.md, USER_MANUAL §16.
  - FEATURE (2026-08-30): BODY `<Image>` preview rendering (user asked to finish the §38 limit).
    Empirically: the runtime loader resolves NO Source string to a bitmap in the host (avares://,
    absolute path, file://, relative ALL yield null Source with no exception — the string is lost
    after conversion), so a rewrite/XAML-converter approach can't work. Fix: `XamlRenderer`
    `ApplyImageSources(window, xaml, projectPath)` — parse XAML via XDocument, `ScanImageSources`
    builds `name → Bitmap` for `<Image>` elements with a Source attribute (resolved via
    `ResolveAssetPath` + `new Bitmap(path)`, missing files skipped), then walk
    `window.GetVisualDescendants()` and set `img.Source` for matching `Name`. CRITICAL TIMING: run
    AFTER `window.ApplyTemplate()` but BEFORE `window.Measure()` — an Image with null Source
    measures to **0x0** (injecting after Arrange collapses the image). Covers BOTH paths (runtime
    loader + programmatic) because x:Name → control.Name in both (the `x:`-prefix check in
    ApplyProperty is dead code — `attr.Name.LocalName` already strips the prefix, so `x:Name`
    reaches the control's `Name` property). Only NAMED images are injected (designer auto-names all
    placed controls; unnamed/template images stay placeholders). VERIFIED via host probes sampled at
    reported control bounds: plain Img1 w40h40 px=255,128,128 (50%-alpha red over white = renders),
    missing source → 0x0 blank, chrome body BodyImg renders, titlebar icon regression OK (134,16,28).
    PROBE GOTCHAS: images CENTER in a StackPanel (x≈390) so sample at frame control bounds, and
    semi-transparent test.png over white reads pink not bright red. dotnet --no-incremental 0/0,
    tsc clean, packaged+installed. Docs: NOTES §39, CONTROLS.md, USER_MANUAL §8.
  - FEATURE (2026-08-30): 'ITEMS SOURCE' ASSET PICKER. User: clicking Items Source should list all
    available assets — arrays in .vb/.cs + database tables etc. Decisions (all recommended): list
    ACCESSIBLE arrays+collections only (form's own instance members + Public Shared/static; T[],
    List<T>, ObservableCollection<T>, IEnumerable<T>, DataView, DataTable); APPLY via code-behind
    `Control.ItemsSource = <asset>;` in the constructor (same as DataSet binder — no DataContext
    needed); UX = text box + "…" button (file-browser pattern); list DataSet tables but keep
    DataSet-bound controls read-only (managed by the DataSet designer; picking a table for an
    UNBOUND control binds via the existing DataSet path).
    - NEW `src/assetCatalog.ts` `listAssets(projectFolder, formClass)`: walks .cs/.vb/.adset (skips
      bin/obj/.git/node_modules). C# scans class scopes by brace depth; VB by `Class`/`Module ... End`.
      Form's own collection members → bare name; Public Shared/Friend elsewhere → `ClassName.Member`;
      .adset tables → `DataSet.Table`. GOTCHAS: VB Module members are implicitly Shared → qualify
      even without `Shared` (`Public Shared` in a Module is invalid VB, BC30593); VB arrays come in
      two forms `X() As T` (name marker) and `X As T()` (type marker) — catch both; find/replace
      regexes must be GREEDY (`[^;\r\n]+`) — a lazy `+?` captures only the first char.
    - `codeBehind.ts`: `findItemsSourceBinding(uri, ctrl)` (reads `Ctrl.ItemsSource = X` line),
      `bindControlToAsset(uri, ctrl, expr)` (upsert after InitializeComponent, replaces existing
      line, creates code-behind if missing; VB syncs FindControl accessors via
      `syncVbAccessors(uri, namedControlsInAxaml(uri))` — CRITICAL for VB, else BC30451 'X not
      declared'), `removeItemsSourceBinding(uri, ctrl)`. Exported `namedControlsInAxaml`.
    - `designerPanel.ts`: `case 'pickItemsSource'` → native quick-pick (with a "Clear Items Source
      binding" entry when code-bound); code asset → `bindControlToAsset`; DataSet table →
      `bindDataSetAsset` (guard table bound elsewhere; reuse `bindControlToDataSet` +
      `ensureDataGridAutoGenerateColumns` for DataGrid + mark .adset boundTo/boundToType +
      `writeGeneratedFilesFor` to regenerate MyData; defensive VB accessor sync). `sendProperties`
      falls back `dataSetBindingFor` → `codeBindingFor` so code-bound shows read-only. `designer.js`
      renders ItemsSource with a "…" button (disabled when readOnly). dataSetEditor exported
      `ensureDataGridAutoGenerateColumns`.
    - VERIFIED (node probes): scanner lists C# string[]/List/ObservableCollection/IEnumerable (form
      + shared) and VB Planets() As String (form) + module Fruit, plus .adset tables with bound
      marker; excludes methods/strings/private. Code bind → generated `MainWindow.axaml.cs/.vb`
      gets the line after InitializeComponent; find returns expr; remove clears. Real generated
      projects build 0/0 C# AND VB for BOTH paths (code asset + DataSet table). GOTCHA:
      `findCodeBehindFile` prefers the convention file (`MainWindow.axaml.cs/.vb`) — the binding
      lands there, NOT in a hand-written `MainWindow.cs`. tsc clean; PROBLEMS clean (stale C#
      analyzer only); packaged+installed. Docs: NOTES §40, CONTROLS.md, USER_MANUAL §8.
    - FIX (2026-08-30, reported on TestVBApp): `Public dim nameslist() as string = {...}` not
      detected. ROOT CAUSE: VB regexes were CASE-SENSITIVE (VB keywords are case-insensitive) — add
      `i` flag to VB_DECL/VB_COLLECTION/Class-Module/Shared/Public|Friend checks. Two MORE VB bugs
      fixed while there: (1) generic `List(Of T)`/`ObservableCollection(Of T)`/`IEnumerable(Of T)`
      types were NEVER detected — the plain-identifier alternative came FIRST in the type alternation
      and the trailing `[({]` boundary consumed the `(` (truncated to `List`), so reorder generics
      BEFORE the plain identifier; (2) bare class-level `Dim x() As T` (valid VB, private default)
      wasn't caught — allow `Dim` as access token AND add VB method/accessor body tracking
      (Sub/Function/Get/Set open, End Sub/Function/Get/Set close, `inMethod` flag) so method-LOCAL
      `Dim` arrays are NOT listed (won't compile as `Ctrl.ItemsSource = local`). VERIFIED: TestVBApp
      scan → `nameslist | As string — on MainWindow`; edge probe (class-level Dim + lowercase
      generics) works, method locals excluded; full C#+VB bind probes still build 0/0. tsc clean;
      packaged+installed.
  - FEATURE (2026-08-30): LISTBOX placed EMPTY + compact auto-size-to-font items. User: remove the
    auto ListBox items (empty when placed); "way too much space between items" → ≤5px; follow-up:
    "item height too generous — auto-size to font". PROBED (not guessed): default Fluent ListBoxItem
    = **41px tall** (text in an 8-10px band, ~11px above/22px below) = the perceived "space" (real
    row gap is 0px). **`ItemSpacing` does NOT exist on ListBox/ItemsControl in Avalonia 12.1.1** (only
    on `WrapPanel`) → `ItemSpacing="5"` would NOT compile; Fluent theme is compiled into the dll.
    **The preview host's programmatic fallback DROPS `<Style>` elements entirely** (verified: window-
    level red-bg style no effect; direct per-item `MinHeight=0 Padding=0` DID shrink to 20px) — the
    runtime app (real 12 XAML compile) honors the Style. FIX: (1) ControlFactory ListBox snippet now
    EMPTY + `<ListBox.Styles><Style Selector="ListBoxItem">` MinHeight=0 + Padding=4,1,4,1 (compiles
    0/0 in a generated 12 project); (2) host XamlRenderer CreateControlFromElement sets ListBoxItem
    MinHeight=0 + Padding BEFORE ApplyProperty so the PREVIEW mirrors compact rows (measured 41→22px;
    item `FontSize=24` → 35px = auto-size works). itemHeightFor already reads measured preview
    height → Items-editor auto-grow stays consistent. KNOWN preview limit: ListBox-inherited FontSize
    doesn't propagate in the programmatic preview (runtime does real inheritance). PROBLEMS clean now
    (the stale C# analyzer flag cleared on window reload — confirms it was never real). Docs:
    NOTES §41, USER_MANUAL "List Items (ListBox)".
  - FIX (2026-08-30): deleting a bound control left the binding in code-behind (dangling
    `Control.ItemsSource = …`). The delete case only cleaned handlers/theme/VB accessors — NOT the
    ItemsSource binding. NEW `designerPanel.cleanupControlBindings(doc, el, ctrlName)` called in
    `case 'delete'` BEFORE `notifyEdit` (so the undo snapshot captures the cleaned code-behind):
    DataSet-bound (via findBoundTable) → `unbindControlFromDataSet` (strips Ctrl.ItemsSource line +
    typed Table property + DataGrid Wire/field) + clear .adset boundTo/boundToType + regenerate
    MyData (writeGeneratedFilesFor) — mirrors the DataSet designer's unbind; generic asset-bound →
    `removeItemsSourceBinding`. `notifyEdit` already re-syncs VB accessors on named-control change.
    UNDO EDGE: form history restores XAML + form code-behind but NOT the .adset marker (cleared on
    delete) — re-bind if you undo a DataSet-bound delete. VERIFIED: code-asset removed (C#+VB),
    DataSet removed (line+property+marker gone), both C#+VB build 0/0 after cleanup. Docs: NOTES §42.
  - FIX (2026-08-30): DRAG LAG. Root cause: `designer.js` posted a `move`/`resize` on EVERY
    pointermove → extension ran `notifyEdit` + a FULL host render round-trip per mousemove. Fix =
    OUTLINE-ON-DRAG: on pointerdown capture the control's current bounds as `drag.start` + pointer
    start; on pointermove ONLY move/resize the `#selection` box locally (`.dragging` CSS class, no
    messages/renders); on pointerup post ONE message with the TOTAL delta → one model update + one
    render per drag. Also extended `xamlModel.resize()` from se/e/s to ALL 8 corners (n/w handles
    were DEAD) — same formula as the webview `dragOutline()` so the drop lands EXACTLY where shown
    (w/n shrink size AND move top-left via Canvas.Left/Top or Margin; min 5px; `corner` widened to
    string). VERIFIED: math probe ALL MATCH for all 8 corners + move (Canvas + Margin); node --check
    + tsc clean + PROBLEMS clean; packaged+installed. Docs: NOTES §43.
  - FEATURE (2026-08-30): LOCK the Body design surface (root's `Canvas x:Name="Body"`). User wants
    no manual resize/reposition/delete; decisions: Body ONLY (not Root DockPanel), keep SELECTABLE
    (edit Background etc.) but locked, SHOW in dropdown marked locked, and Body must keep AUTO-FILLING
    the form when resized (design+runtime — inherent via DockPanel last-child fill; the lock
    PRESERVES it by blocking explicit Width/Height from resize handles; verified Body bounds == form
    at 800x450 AND 1200x700). Structure: Window → DockPanel "Root" → Canvas "Body".
    - `designerPanel.isLockedBody(model,name)`: Canvas named "Body" whose parent is root, or whose
      parent is a DockPanel named "Root" that is root's child; nested user "Body" → NOT locked
      (verified all cases). `render()` maps `locked` onto each frame control for the webview.
    - Extension guards (return + info msg): delete, cut, move, resize, moveToContainer, rename
      (__name__ — the lock relies on the name). Copy allowed. Webview: renderSelection shows NO
      handles + 🔒 lock-badge + `.locked` class; onPointerDown returns; deleteSelected guards;
      context menu disables Cut/Move-to-container/Delete; dropdown shows `Body 🔒`; CSS `.locked`
      default cursor. Docs: NOTES §44.
  - FIX (2026-08-30): LEFT-CLICK SELECTION BROKEN + CODE-BEHIND ON PLACEMENT. (a) Selection: user
    couldn't select controls by left-click (dropdown worked). ROOT CAUSE: `#selection` box had
    `pointer-events:auto` and covered the selected control — once the locked Body (fills the form)
    or any full-form control was selected, the box covered the WHOLE canvas, intercepted every click,
    and the click handler REJECTED `e.target===els.selection`; pointerdown on the box also started a
    drag + preventDefault which suppressed the click. FIX: `#selection.sel` → `pointer-events:none`
    (handles keep `auto`); move-drag now grabbed by HIT-TESTING the pointer against the selected
    control in `onPointerDown` (clicking a different control → no drag → click selects it).
    (b) Code-behind on placement (was middle-click only): `designerPanel` drop now calls
    `wireDefaultHandler(doc,panel,placed,name,false)` (openEditor=false — no editor open) for every
    placed control with `hasDefaultEvent(tag)` (containers Grid/StackPanel/Image skipped — eventName
    would otherwise be 'DoubleTapped'). Inserts the `ControlName_Event` stub + sets the XAML event
    attr + serialize(true) save; idempotent, so middle-click still opens the handler (quick-jump).
    GOTCHA: `serialize(forSave=false)` = RENDER mode STRIPS event attrs (host can't resolve handlers);
    saves use `serialize(true)` — a probe using the wrong mode made the Click attr look dropped.
    VERIFIED: hasDefaultEvent(Button/TextBox)=true,(Grid)=false; handler in MainWindow.axaml.cs; XAML
    Click attr; re-wire idempotent; C# build 0/0. node --check + tsc + PROBLEMS clean; packaged+installed.
    Docs: NOTES §45, USER_MANUAL §intro + §12.
  - TEST SUITE (2026-08-30): user approved full **Avalonia.Headless** for runtime (Option (a)), asked to
    PREPARE the scripts (run later) and keep them extensible. Plan: TEST_PLAN.md (root). Delivered
    `tests/`: runner.js (discovers `*.test.js`, ctx t.ok/t.equal/pass/fail/skip/note/section/throws/run;
    NODE_PATH = tests/stubs + tests/node_modules; writes tests/out/log.jsonl + report.md, exit!=0 on FAIL;
    `--layer`, `--file`, `--list` filters). Layers: t0-build (tsc, node --check media, host build, 10-project
    C#/VB×5template matrix — SLOW, deferred), t1-preview (spawns PreviewerHost on free port, renders,
    decodes PNG via tests/helpers/png.js — incl. solidPng encoder; asserts placement bounds, Body auto-fill
    800x450+1200x700, ChromeWindow navy band + caption glyphs + Body.y≈44, ListBox empty + compact rows ≤30,
    avares image via projectPath), t2-logic (xamlModel move/resize 8-corner formula, serialize strip/keep,
    auto-names, single-content wrap, ChromeWindow conversion; codeBehind asset/DataSet bind+unbind, VB
    accessors, handlers, Chrome convert; propertyCatalog file/button/ItemsSource/root-no-anchor — Anchor key
    is `chrome:AnchorHelper.Anchor`; assetCatalog C#+VB incl. lowercase dim + generics-before-plain +
    module-implicit-shared + method-local exclusion; dataSet parse/serialize/generateCs/Vb/Xsd — generated
    classes are `public class X` NOT partial), t3-webview (jsdom; vscode stub in tests/stubs/vscode NOT
    node_modules — npm prunes it; real DOM nesting canvasWrap>canvas>preview+overlayLayer+selection so handle
    events bubble; hitTest = LAST matching control wins; drag posts ONE resize on drop; locked-Body menu
    disables cut/move/delete; designer only sets preview img.src when png non-empty), t4-runtime
    (tests/headless/Program.cs.tpl → net10 harness ProjectReference's a generated blank C# project + injects
    btnTest; AppBuilder.Configure<App>().UseHeadless(new AvaloniaHeadlessPlatformOptions()).UseSkia()
    .SetupWithoutStarting(); drives real MainWindow: body-fill, resize-follow, WindowState transitions,
    control position/size).
    KEY GOTCHAS hit while smoke-testing: (1) host frame JSON is CAMELCASE (name/type/x/y/width/height) —
    tests must not use PascalCase; (2) `{NAMESPACE}` template replace must be GLOBAL (/g) or only the
    comment is replaced; (3) jsdom tagName is read-only — create the right element type directly;
    (4) `npm install` in tests/ prunes hand-made tests/node_modules/vscode → keep stubs in tests/stubs/.
    Smoke status: T0-compile 6✅, T1 24✅, T2 121✅, T3 38✅, T4 14✅; T0 project matrix not yet run.
    FULL RUN 2026-08-31: `npm test` = **223 passed, 0 failed, 0 skipped (26.3s)** — all layers green,
    including the T0 10-project build matrix (C#/VB × 5 templates, 0 errors / 0 warnings) and the
    T4 Avalonia.Headless runtime driver.
    Commands: `npm test` (all), `npm run test:fast|build|preview|webview|runtime`, `--file <name>` single file.
  - T5 VB MATRIX (2026-08-31): `tests/t5-vbmatrix/vb-all-controls.test.js`. User asked to create a VB.NET
    blank project, place EVERY toolbox control, test EVERY available property for functionality, report
    pass/fail. Derives the 19 placeable controls from `TOOLBOX_CATEGORIES`+`controlsForGroup` (excludes
    DataSet/CustomTitleBar tools). Places each via the PRODUCTION snippet (host `snippet` msg — same as
    designerPanel) + renders through PreviewerHost; per-control property matrix from `propertyDefsFor`,
    each prop gets a safe value (curated `VALUES` map + kind defaults); two gates: (1) RUNTIME render
    reflect of values (colors, Margin, Padding, BorderThickness, Width, Height, FontSize, FontFamily;
    CornerRadius is LENIENT — host reflects theme default so compile is its proof), (2) COMPILE: all
    controls+props written into the VB MainWindow.axaml + `dotnet build` 0 errors (per-control isolation
    on failure). StatusDate Loaded handler via `insertStatusDateClock`; ListBox/ComboBox/ItemsControl
    ItemsSource via `bindControlToAsset` to a code-behind `MatrixNames` collection. Added `snippet()` to
    tests/helpers/host.js; vscode stub needed TreeItem/TreeItemCollapsibleState/DataTransferItem/DataTransfer
    (toolboxProvider extends TreeItem). FULL RUN: `npm test` = 918 passed, 0 failed (T5 alone 695).
    FINDING: `TextBox.Watermark` obsolete in Avalonia 12.1.1 (AVLN5001 → PlaceholderText) but still in
    CONTROL_PROPS['TextBox'] → VB build warns 1. Surfaced in report; removal needs user go-ahead.
    RESOLVED 2026-08-31 (user approved): removed `Watermark`, added `PlaceholderText` to TextBox in
    src/propertyCatalog.ts (CONTROL_PROPS + KEY_DEFAULTS desc + DEFAULTS entry; ComboBox already had it).
    VB build now 0 errors / 0 warnings; full suite still 918 passed. Packaged+installed.
    ALSO: vsix ballooned to 2410MB because tests/** wasn't excluded from packaging — added `tests/**`
    + TEST_PLAN.md to .vscodeignore (NOT .gitignore — vsce uses .vscodeignore) → vsix back to 408KB.
    Commands: `npm test` (all), `npm run test:fast|build|preview|webview|runtime`, `--file <name>` single file.
  - GRID ROWS & COLUMNS (2026-08-31): user: "Add the missing properties to the grid control. It is useless
    without it. Keep in mind this extension is for novice Avalonia users!" — a Grid without defs is 1 cell.
    Added: XamlModel.gridSizes()/setGridDefinitions() (rebuild Grid.RowDefinitions/ColumnDefinitions);
    propertyCatalog Grid.Defs 'button' prop (Rows & Columns) + Grid.Row/Grid.Column dropdowns on children
    (indices from parent's defs, local childElements/gridDefinitionCount helper — propertyCatalog only
    imports localName); designerPanel sends gridDefs + case 'saveGridDefs' (validate Auto|*|n*|number else
    '*') + #gridModal HTML; designer.js gridModal editor (rows/cols size inputs, add/remove, Save posts
    saveGridDefs); designer.css .modal-wide/.grid-def-* styles. GOTCHA: new modal ids MUST be added to T3
    jsdom IDS + tagFor button handling — els.gridAddRow.addEventListener at load throws if element missing,
    breaking the whole T3 layer. Full suite 945 passed (was 918). Packaged+installed (411KB). Docs: NOTES
    §48, CONTROLS.md Layout note.
  - GRID LINES NOT RENDERING FIX (2026-08-31): user: "grid lines are not rendering in the designer - I have
    the 'Show Grid Lines' set to True." ROOT CAUSE: runtime XAML loader fails broadly in the host → Grids
    fall to programmatic builder which DROPPED Grid.RowDefinitions/ColumnDefinitions (property elements not
    in type map) + ignored Grid.Row/Grid.Column → every Grid a trivial 1×1 cell (children stacked in cell
    0,0) AND Avalonia's native ShowGridLines GridLinesRenderer is only created in ArrangeOverride when
    definitions exist (_extData != null) → no lines. FIX in host/XamlRenderer.cs: programmatic builder now
    parses RowDefinitions/ColumnDefinitions into grid.RowDefinitions/ColumnDefinitions via ParseGridLength
    (Auto|*|n*|pixels, also wired into ConvertValue GridLength) + handles Grid.Row/Column/RowSpan/ColumnSpan
    in ApplyProperty. VERIFIED: Grid.Row=1/Grid.Column=1 child now at 200,150 150×100; internal lines
    render (blue/yellow dashes). Host 0/0. Installed ext auto-rebuilds host (findOrBuildHost rebuilds when
    host source newer than binary). T1 +6 grid test. Full suite 951 passed (was 945). Packaged+installed
    (413KB). Docs: NOTES §49.
  - GRID CHILDREN STILL STACKING IN CELL 0,0 FIX (2026-08-31): user: "The control is still stacking all added
    children in cell 0,0." — after the §49 host fix the PREVIEW respected Grid.Row/Grid.Column, but the
    DESIGNER never assigned them → every control added to a Grid defaulted to cell 0,0. FIX in
    src/xamlModel.ts: new nextFreeCell(gridEl, ignore?) (first free cell row-major from defs, honors
    RowSpan/ColumnSpan, 1x1 when no defs, (0,0) fallback when full); addControl assigns Grid.Row/Grid.Column
    for Grid parents (compute BEFORE append — else the new el counts as occupying (0,0)); moveTo assigns a
    free cell too (nextFreeCell(target, el) with el as ignore since it's already attached). GOTCHA: compute
    the cell BEFORE appendChild or pass the element as `ignore`. T2 xamlModel +7 grid-cell tests (0,0→0,1→
    1,0→1,1→fallback 0,0; serialized attrs; moveTo next free). Full suite 958 passed (was 951).
    Packaged+installed (415KB). Docs: NOTES §50.
  - DRAG-TO-RE-CELL (2026-08-31): user: "I want to be able to drag/drop when re-celling a child."
    Host (XamlRenderer.cs + Program.cs): ControlInfo.Parent (direct parent name; unnamed→null so nested
    children not treated as Grid children); FrameResult.GridCells (gridCells JSON) = per named Grid the
    col/row boundaries (v/h, length n+1) in window coords via reflection on internal
    DefinitionBase.FinalOffset. GOTCHAS: (1) FinalOffset[i] (i≥1) is the boundary AFTER def i-1
    (FinalOffset[0] degenerate) → boundaries = 0, FinalOffset[1..n-1], size (first attempt [i-1] gave
    [50,350,350] not [50,200,350]); (2) Program.cs render response is an ANONYMOUS object that only
    sent png/width/height/controls/error — had to add gridCells or the field was never serialized.
    Extension: #cellHighlight div; case 'moveToCell' (clamps row/col to grid counts, sets
    Grid.Row/Column). Webview: state.recell set on select when control.parent is a named Grid with
    gridCells; move-drag marked drag.recell; onPointerMove highlights target cell (.cell-highlight);
    onPointerUp posts ONE moveToCell {name,row,col}; non-Grid children drag normally. CSS
    .cell-highlight (pointer-events:none). Tests: T1 +5 (parent+gridCells); T3 +10 (drag grid child →
    highlight cell (1,1) + moveToCell; non-grid → move). T3 GOTCHA: canvas click after the earlier
    drag test is suppressClick'ed once — select the Grid child via the control-list dropdown, not a
    canvas click. Full suite 973 passed (was 958). Packaged+installed (417KB). Docs: NOTES §51.
  - DOCS TRIMMED (2026-08-31, user request "they are getting large"): NOTES.md 2468→239 lines
    (lean quick-reference: build/run, current structure, arch, key gotchas §4, add-a-control
    checklist, Grid+test current state, one-line feature-history table §10–51, limitations, ideas,
    prior art); NOTES_ARCHIVE.md = full verbatim history (2477 lines, do-not-edit); SESSION.md
    117→24 lines (now a "where to look / how to continue" pointer — original transcript deleted);
    README.md refreshed (host messages note, current project structure, up-to-date limitations).
    .vscodeignore now excludes NOTES.md/NOTES_ARCHIVE.md/SESSION.md → vsix 417→346KB (README/
    USER_MANUAL/CONTROLS stay packaged). PROBLEMS clean; test:fast 144 pass. Lean NOTES points to
    the archive + repo memory for continuing dev.

  - IMAGE-IN-GRID AUTO-SIZE (2026-08-31): user: "The Image control is not behaving correctly when
    placed directly into a grid cell… the image 'Height' and 'Width' properties should be automatically
    set to the size of the cell it is dropped into." + follow-up: "Not only the drop unto, but also the
    initial placement" → sizing applies on BOTH direct drop into a Grid AND "Move to container…" into a
    Grid.
    - Extension: `XamlModel.sizeElementToGridCell(el, cells)` — only for an Image whose DIRECT parent is
      a Grid; reads assigned Grid.Row/Grid.Column, computes px from module helper `gridCellPixelSize
      (cells,row,col)` (v[col+1]-v[col] × h[row+1]-h[row]; undefined when out of range/zero → no change).
      Called in designerPanel drop case (after addControl, `gridCellsFor(doc,placedEl)`) AND moveToContainer
      case (after moveTo). `gridCellsFor` reads `this.frames.get(uri).gridCells[gridName]` (pre-placement
      boundaries — correct for star/Auto). Added `parent` to HostControlInfo + `GridCells`/`gridCells` to
      FrameResult in src/hostClient.ts. GOTCHA: had declared `const placed` twice in the drop case
      (addControl + findByName) → renamed the captured one to `placedEl`.
    - **HOST FIX (Image in a real Grid cell rendered 0×0):** injecting the Image Source AFTER layout
      (ApplyImageSources) left Grid-cell Images arranged at 0×0 (DesiredSize correct 100×80, but Bounds
      0×0, nothing drawn) in the headless preview. Canvas/StackPanel/DockPanel/single-cell grids were
      fine — ANY Grid with real RowDefinitions/ColumnDefinitions was broken. Massive rabbit hole
      (decompiled Avalonia 11 Grid/Image/Layoutable — ArrangeCore applies Width/Height + centering; the
      grid arranges cell children via DefinitionsU/V FinalOffset + SizeCache; a source injected after
      first layout leaves the cell Image arranged 0×0). FIX: resolve the Image's Source AT CREATION TIME
      in `CreateControlFromElement` (static `CurrentProjectPath` set in Render; `ResolveAssetPath`
      + `new Bitmap(full)`; try/catch). Now an Image in a Grid cell renders at its cell size.
      Sourceless Images still have no size (matches runtime — set Source via the Properties file picker).
    - Tests: T2 xamlModel +9 (gridCellPixelSize unit matrix; sizeElementToGridCell Image→150×100 /
      Button untouched / Image on Canvas keeps its size); T1 +5 grid-img (gridCells boundaries 100×80;
      Image with matching-aspect source renders 100×80 at cell (1,1)). GOTCHA: T1 grid-img test #8 needs
      a source with the SAME aspect as the cell (50×40 in 100×80) or Stretch=Uniform letterboxes to
      100×75 and the size assertion fails. Full suite 991 passed (was 973). Host 0/0, tsc clean, PROBLEMS
      clean. Packaged+installed (346KB). Docs: NOTES §52 + §6 bullet.
  - DOCK-IN-GRID + DYNAMIC IMAGE SIZING (§53, 2026-08-31): user: "if I set the image to Dock ->
    Fill, the image moves completely outside the grid." ROOT CAUSE: setting Dock on a Grid child
    called `ensureDockPanelParent`, which MOVED the control into the root DockPanel. USER
    CLARIFIED: "It is ok not to have the Dock property for controls placed in a grid… The way to
    fix is to make the size of an image (width, height) follow the size of the grid cell where it
    is currently placed dynamically."
    FINAL BEHAVIOUR: (1) `propertyDefsFor` hides `DockPanel.Dock` + `Canvas.Left`/`Canvas.Top`
    for direct Grid children (`inGrid` filter) — user-approved; a Grid child's size is managed by
    its cell. (2) `ensureDockPanelParent` only wraps/docks controls in a FREE-positioning context
    (Canvas or window root); a control in a Grid/StackPanel/… stays put. setProperty Dock branch
    keeps a Grid child in its cell. (3) **DYNAMIC TRACKING:** `XamlModel.syncImagesToGridCells
    (cells)` — iterates every direct-Grid-child Image, sets Width/Height from the frame's
    gridCells (gridCellPixelSize), returns whether changed. Called in designerPanel.render() after
    each frame; if changed, ONE follow-up render (`render(doc,panel,followUp=true)`) shows the new
    size (converges — second pass no change). So an Image fills its cell and FOLLOWS it when the
    grid is resized / rows-columns edited / form resized. VERIFIED end-to-end via host render:
    200x160 grid → cell 100x80 (image matches); resize grid to 400x240 → cell 200x120 → image
    updates to 200x120.
    NOTE: dropped Images are sized on placement (sizeElementToGridCell) AND re-synced on every
    render, so a manual Width/Height edit on a Grid-cell Image is overridden by the cell size
    (requested behaviour). GOTCHA: briefly reverted the inGrid filter + added a dockValueFor Grid
    'Fill' branch when the user said "Dock missing" — but that was because the user hadn't reloaded;
    after clarification, reverted those and kept Dock hidden for Grid children.
    TESTS: T2 propertyCatalog (Grid child + nested Grid have NO Dock/Canvas.Left/Top but HAVE
    Grid.Row/Grid.Column; nested Grid Grid.Row=1/Column=1 + Grid.Defs); T2 xamlModel
    syncImagesToGridCells (+10: follows cell, converges no-op, follows resized cell, Button not
    resized). Full suite 1011 passed (was 1000). tsc clean, PROBLEMS clean, packaged+installed
    (348KB). Docs: NOTES §53 (Dynamic Image-in-Grid sizing + Dock-in-Grid).
  - OPT-OUT ADDED (§53 follow-up, user: "It is working now. Please add an opt-out for the dynamic
    autosize."): an Image in a Grid now shows an **'Auto-size to Cell'** dropdown (True/False, default
    True) in the Properties panel. False → the Image keeps the manual size; the sync skips it.
    - Storage is NOT XAML (Avalonia would reject an unknown attribute): it lives in the extension's
      `globalState` as `autoSizeOff` (array of `docUri::controlName`), mirroring the themeBackups
      pattern (`ensureAutoSizeOff`/`persistAutoSizeOff`/`setAutoSizeOff`/`isAutoSizeOff`).
    - `propertyDefsFor(el,...,autoSizeOff?)` 5th param; `syncImagesToGridCells(cells, skipNames?)`
      skips opted-out names; render() builds the skip set from globalState (loaded once);
      drop/moveToContainer also skip sizing when opted out.
    - Tests: T2 propertyCatalog +5 (Image in Grid has Auto-size default True / off shows False;
      Button in Grid has NO Auto-size); T2 xamlModel +3 (opted-out imB keeps its size while imA
      follows). Full suite 1021 passed (was 1011). tsc clean, PROBLEMS clean, packaged+installed
      (349KB). Docs: NOTES §53 bullet + history row.

  - IMAGE ROTATE (§54, 2026-08-31): user: "Is there a 'Rotate' property for the Image control?" →
    No (Avalonia has no plain Rotate attr; rotation is a RenderTransform). User: "Yes, add this please."
    Added a **`Rotate`** property (number, deg) to the Image.
    - Writes `<Image.RenderTransform><RotateTransform Angle="…"/></Image.RenderTransform>` — the
      Avalonia-valid form. `XamlModel.setImageAngle` (write/update/remove; 0/empty removes the
      transform) + `imageAngle` (read). **KEY: `XamlModel.setProperty` routes `key==='Angle'` →
      `setImageAngle`** so EVERY caller (Properties panel AND the T5 VB matrix, which writes each
      catalog prop as an attribute) writes the correct transform — without the routing, the T5 test
      wrote `Angle="10"` as a plain attribute → VB build failed (errors=-1).
    - `propertyDefsFor` shows the value via `rotateAngleFor(el)` (reads the RenderTransform);
      special-cased in the value computation like Dock.
    - Host programmatic builder: parses `<X.RenderTransform><RotateTransform Angle="…"/>` and sets
      `vis.RenderTransform = new RotateTransform(angle)` (otherwise the preview wouldn't show it).
    - GOTCHA: **Avalonia rotates around the element CENTRE** (verified via pixel probe: a 90° turn of
      a 60×30 image at (100,100) reaches y=85, above the original top edge y=100; a 180° turn keeps
      the same bounding box). T1 rotate test asserts red pixels in the rotated-only region
      (110,145)x(85,100) > 200 while area is preserved (whole=1800).
    - Tests: T2 xamlModel +6 (write/read/update/remove/re-apply, serialized RenderTransform);
      T2 propertyCatalog +3 (Angle kind number, empty default, reads 45 from transform);
      T1 +5 rotate render probe. Full suite 1037 passed (was 1021). tsc clean, host 0/0, PROBLEMS
      clean, packaged+installed (351KB). Docs: NOTES §54.

  - ROTATED OUTLINE FOLLOWS IMAGE (§55, 2026-09-01): user attached a screenshot: "The picture did
    rotate correctly but it's container outline did not." — the selection box stayed at the layout
    bounds while RenderTransform rotated the drawn visual (classic RenderTransform behaviour).
    FIX: host `CollectControls` now reports the **rotated axis-aligned bounding box** instead of
    `Bounds`: transform the local rect's 4 corners via `c.TransformToVisual(window)`, take the AABB
    (min/max of transformed corners) → x/y/width/height. Verified: 100×80 at (100,100) → 90° reports
    80×100 at (110,90), 45° reports 127×127 at (86,76) (both centred on (150,140)), unrotated
    unchanged (100,100,100,80). Non-rotated controls are unaffected (AABB == layout box).
    GOTCHAS: (1) **`c.Bounds` is in the PARENT's space; `TransformToVisual` expects LOCAL coords
    (origin 0)** — must transform `new Rect(0,0,Bounds.Width,Bounds.Height)` corners or the position
    double-counts (first attempt gave (200,200) for a control at (100,100)). (2) **`LayoutTransform`
    is NOT available on general controls in Avalonia 11.0.10** (Layoutable has no such property;
    `OnLayoutTransformChanged` string exists in Controls but not on Image/Layoutable) — so the fix
    had to keep RenderTransform + report the rotated AABB.
    T1 rotate test updated: asserts the host reports the ROTATED box (30×60 at (115,85) for a 60×30
    image rotated 90°) + still draws the pixels. Full suite 1038 passed (was 1037). host 0/0, tsc
    clean, PROBLEMS clean, packaged+installed (351KB). Docs: NOTES §55 + §54 bullet.

  - DOT GRID OVERLAY + SNAP-TO-GRID (§56, 2026-09-01): user: "add a feature that draws an 'always
    on top' dotted grid on the designer surface; spacing/color/dot size configurable." (asked "Any
    queries?" → answered via askQuestions: toolbar toggle for the grid, a second toolbar toggle for
    snap-to-grid, config in BOTH VS Code settings AND an in-designer popup, GLOBAL scope.)
    - Settings: package.json `configuration` → `avaloniaDesigner.dotGrid.{enabled, snapToGrid,
      spacingX, spacingY, color, dotSize}` (defaults: true, false, 16, 16, '#9db4d0', 1.5).
    - Overlay: a `#dotGrid` div inside `#canvas` (z-index 25, pointer-events:none, always on top)
      drawn with `background-image: radial-gradient(circle, <color> <dotSize/2>px, transparent
      <dotSize/2>px)` + `background-size: <spacingX>px <spacingY>px` — dots repeat on the grid and
      scale with the canvas zoom. VERIFIED visually (standalone HTML screenshot: 16×16 default dots,
      32×24 red larger dots, 8×8 tiny dark dots all render correctly).
    - Flow: designerPanel.render() sends `dotGrid` with the frame; toolbar toggles post
      `toggleDotGrid`/`toggleSnapToGrid`; popup posts `setDotGrid` — each updates the GLOBAL config
      (`cfg.update(key, val, ConfigurationTarget.Global)`) and replies with a `dotGrid` message
      (`dotGridConfig()` reads via `getConfiguration('avaloniaDesigner.dotGrid')`).
    - SNAP: happens in the webview drag — `snapDrag(drag, dx, dy)` rounds the TARGET position/size to
      the grid (spacingX/spacingY) and returns an adjusted delta; the SAME snapped delta drives the
      live outline AND the posted move/resize, so outline and applied result stay consistent.
      Re-cell drags are excluded (they snap to cells, not dots). Snap only when `enabled && snap`.
    - GOTCHA: any new webview element (toolbar buttons, `#dotGrid`, `dotGridModal` + its inputs) MUST
      be added to the T3 jsdom `IDS` + `tagFor` (inputs → `'input'`, buttons → `'button'`) or `els.*`
      addEventListener throws at load and the ENTIRE T3 layer breaks. Also add `#dotGrid` inside the
      jsdom `#canvas` to mirror real nesting.
    - Tests: T3 +15 (Grid/Snap buttons post toggles; dotGrid message shows/hides overlay + toolbar
      active states + radial-gradient/background-size; settings popup opens/saves setDotGrid with
      clamped values; snap-on drag posts delta that lands on the grid (10,10 +5,+3 → dx=6,dy=6) and
      raw delta when snap off). Full suite 1057 passed (was 1038). tsc clean, node --check clean,
      PROBLEMS clean, packaged+installed (354KB). Docs: NOTES §56 + history row.

  - ALIGNMENT TOOLS + MULTI-SELECT (§57, 2026-09-01): user: "add alignment tools: Align Top/Bottom/
    Left/Right/Centre; align the edges of the selected controls to the one selected first (needs
    multi-select); Align Text = centre the text in single-line text controls. Any queries?" →
    askQuestions answers: multi-select via BOTH Ctrl+Click AND drag-box (marquee); alignment scope =
    ALL placed controls EXCEPT direct Grid children; Align Text = option 1 (set
    TextAlignment/HorizontalContentAlignment = Center, each control's text centred within itself);
    text set = TextBlock/TextBox/Button/CheckBox/RadioButton/ComboBox.
    - **Selection model:** `state.selected = {name}` stays the ANCHOR (first-selected; what edge-align
      aligns everything to); new `state.multi = new Set()` holds ALL selected names. Helpers:
      `selectionNames()` (multi if non-empty else anchor), `setSelection(anchor, names)` (posts
      `select` + sets recell for the anchor), `select(hit, additive)` (Ctrl+Click toggles; first added
      becomes anchor; removing the anchor promotes the next). Plain click collapses to single
      (setSelection with one name). `deselect()` clears multi too. All `state.selected = null` sites
      (deleteSelected, ctxCut, Ctrl+X) must also clear `state.multi` or stale outlines linger.
    - **Marquee GOTCHA (important):** the locked `Body` Canvas always fills the form, so `hitTest`
      NEVER returns null on "empty" space — the marquee condition must be `(!hit0 || hit0.locked)`,
      NOT just `!hit0`. Guarded by `!state.pendingTag && !grabbingHandle` (tool click places, handle
      drag resizes). `marqueeSelect(x0,y0,x1,y1)` picks named non-locked controls intersecting the
      box; ANCHOR = control whose top-left corner is nearest the box's top-left. Draw `#marquee`
      (dashed blue) during the drag; on up hide + select. suppressClick set after marquee → consume
      with a no-op canvas click in tests before the next click-select (real browser fires a click
      after pointerup that is suppressed once).
    - **renderSelection** draws the anchor in `#selection` (full box + handles) AND the others as
      lighter dashed `.multi-sel` outlines in a new `#multiSel` layer (z-index 19, pointer-events
      none). `updateAlignButtons()` (called from renderSelection → runs every frame/selection change):
      edge-align buttons disabled unless `selectionNames().length >= 2`; `btnAlignText` enabled when
      ≥1 selected control's type is in `TEXT_ALIGN_TAGS` (TextBlock/TextBox/Button/CheckBox/
      RadioButton/ComboBox — matches propertyCatalog).
    - **Edge align:** toolbar `⇤ ↔ ⇥ ⇡ ↕ ⇣` = btnAlignLeft/Centre/Right/Top/Middle/Bottom → post
      `align {align, anchor, names}`. Extension `case 'align'`: skip anchor + locked + DIRECT Grid
      children (`localName(parent.tagName) === 'Grid'`); for each target compute delta from
      `this.frames` bounds vs anchor (`left` tx=ab.x-b.x; `right` (ab.x+ab.w)-(b.x+b.w); `centre`
      cx diff; `top`/`bottom`/`middle` analogous), `doc.model.move(el,dx,dy,b)` (Canvas.Left/Top for
      Canvas parent else Margin); ONE notifyEdit + ONE render. All deltas computed from the same
      pre-alignment frame → correct batch.
    - **Align Text:** `Aa` → post `alignText {anchor, names}`. Extension `case 'alignText'`: sets
      `TextAlignment="Center"` on TextBlock/TextBox and `HorizontalContentAlignment="Center"` on
      Button/CheckBox/RadioButton/ComboBox (via `doc.model.setProperty`, which only special-cases
      Angle); ONE notifyEdit + render + sendProperties.
    - GOTCHAS: (1) new toolbar buttons + `#multiSel` + `#marquee` MUST be added to T3 `IDS` +
      `tagFor`; multiSel + marquee mounted INSIDE the jsdom `#canvas` to mirror real nesting (else
      els.* addEventListener throws at load and the whole T3 layer breaks). (2) after any drag
      (move/resize/marquee) the real browser fires a click that is suppressed once — tests that
      dispatch pointer events then click-select must first dispatch a no-op canvas click to consume
      the suppress flag. (3) host already reports `locked` per control (extension maps it in render
      via isLockedBody) so the webview marquee/outlines can exclude locked controls.
    - Tests: T3 +16 (no-sel disables all align buttons; Ctrl+Click anchor + toggle + remove-anchor
      promotes next; align buttons enable at ≥2; AlignLeft posts align {align:'left',anchor:'btn1',
      names:['btn1','btn2']}; AlignText posts alignText; marquee draws #marquee, selects intersecting
      non-locked controls, anchor = nearest to box top-left (txt1), plain click collapses multi).
      Full suite 1084 passed (was 1057). tsc clean, node --check clean, PROBLEMS clean,
      packaged+installed (358KB). Docs: NOTES §57 + history row.

  - SHAPE CONTROLS (§58, 2026-09-01): user: "add Shape controls — lines, rectangular boxes, circles
    and arcs; configurable line thickness, colour, Backcolor (boxes/circles); circle/box size set by
    dragging an edge. Any queries?" → askQuestions answers: Line resizes like any control (8 handles,
    endpoints scaled); just the stroked Arc (no Sector); default look = transparent fill + black 1px
    outline.
    - Toolbox: new `Shapes` category (TOOLBOX_CATEGORY_SHAPES) with Line / Rectangle / Ellipse /
      Arc; controlInfo entries; ControlFactory snippets (Line StartPoint="0,0" EndPoint="120,80"
      Stroke=Black Thickness=1; Rectangle 120x80 Fill=Transparent; Ellipse 100x100; Arc 100x100
      StartAngle=0 SweepAngle=270) + TypeMap (using Avalonia.Controls.Shapes).
    - **Avalonia 11.0.10 GOTCHA: `Line` has NO X1/Y1/X2/Y2 and NO Width/Height.** It uses
      StartPoint/EndPoint ("x,y"); its size IS its geometry. So (1) Width/Height are FILTERED OUT of
      the Properties panel for Line (setting them would clip, not stretch); (2) `XamlModel.resize`
      routes Line → `resizeLine`: same box math as resize (Canvas.Left/Top or Margin on w/n, min 5)
      then scales StartPoint/EndPoint proportionally within the box (`new = p * newW/oldW` — NO
      origin-shift term; an endpoint on the box edge stays pinned to that edge). No Width/Height
      written. parsePoint helper added.
    - Host: `XamlRenderer.ConvertValue` gained `Avalonia.Point` parsing ("x,y") — without it the
      programmatic builder drops StartPoint/EndPoint (Point can't take a raw string) and lines
      wouldn't draw. All four shapes render with correct bounds (verified via pixel probes: black
      outlines + transparent centres; Line spans its box corner-to-corner).
    - Properties (propertyCatalog): Line = Stroke/StrokeThickness/StrokeLineCap(Flat,Round,Square)/
      StartPoint/EndPoint; Rectangle = Fill (labelled **Backcolor**)/Stroke/StrokeThickness/
      RadiusX/RadiusY; Ellipse = Fill(Backcolor)/Stroke/StrokeThickness; Arc = Stroke/StrokeThickness/
      StartAngle/SweepAngle. KEY_DEFAULTS + DEFAULTS for all shape keys.
    - **VB GOTCHA (REAL bug found by T5):** the VB accessor generator `applyAccessors` emits
      `Private ReadOnly Property Line2 As Line` — but Line lives in Avalonia.Controls.Shapes, so the
      VB project failed BC30002 "Type 'Line' is not defined" (the combined-build gate surfaced it;
      per-control isolation builds passed because they rewrote only the .axaml, but the stale .vb
      accessors failed the combined build). FIX: `applyAccessors` now adds
      `Imports Avalonia.Controls.Shapes` when any named control type is in VB_SHAPES_NS
      (Line/Rectangle/Ellipse/Arc/Sector/Polygon/Polyline/Path/Shape). **C# needs NO import** —
      verified: real C# 11.0.10 project with all 4 shapes + `Line1.StrokeThickness = 4` builds 0/0
      with only `using Avalonia.Controls` (XAML codegen emits fully-resolved field types).
    - Tests: T1 +8 (all 4 shapes: bounds + black-outline pixel probes — watch coordinate math: the
      Line midpoint is at Canvas pos + half the box, and Ellipse/Arc strokes curve away from the box
      corners, so sample the top-centre / left-middle / arc-left-edge, not the corners); T2
      propertyCatalog +32; T2 xamlModel +11 (Line resize SE/NW scales points, non-zero StartPoint,
      zero-bounds guard); T2 codeBehind +5 (Shapes import added only when a shape present); T5
      matrix 19→23 controls. Full suite 1270 passed (was 1084). tsc clean, host 0/0, PROBLEMS clean,
      packaged+installed (361KB). Docs: NOTES §58 + CONTROLS.md Shapes section.

  - MAKE SAME WIDTH/HEIGHT (§59, 2026-09-01): user: "add two new tools to the alignment buttons —
    'Make same Height' and 'Make same Width'; selection similar to the other alignment tools;
    adjust width/height of selected controls to match the anchor. Any queries?" → askQuestions
    answers: skip direct Grid children (consistent with edge-align); skip Lines (they have no
    Width/Height — don't scale their points).
    - Two new toolbar buttons `⇔` (btnSameWidth) and `⇕` (btnSameHeight) next to btnAlignText.
      Reuses the existing `align` message: webview `postAlign('sameWidth'|'sameHeight')` →
      `{type:'align', align, anchor, names}`. The extension `case 'align'` gained an `isSizeAlign`
      branch: for each target (skip anchor / isLockedBody / direct Grid child / **Line**) write
      `Width` or `Height` from the anchor's frame bounds (clamp min 5, only when the attr actually
      changes → changed flag), then ONE notifyEdit + render. Edge-align (left/right/top/bottom/
      centre/middle) unchanged.
    - Webview `updateAlignButtons`: size buttons enabled when `selectionNames().length >= 2` AND at
      least one NON-anchor selected control is sizeable (`type !== 'Line'` → hasSizableTarget) —
      selecting only Lines disables them (edge-align stays enabled).
    - VERIFIED end-to-end via a probe that instantiates the REAL compiled AvaloniaDesignerProvider
      (NODE_PATH=tests/stubs; stub `vscode.workspace.onDidChangeTextDocument` before constructing —
      the constructor subscribes to it; stub provider.notifyEdit/render/sendProperties; set
      provider.frames; drive `(provider as any).handleMessage(doc, panel, msg)`): sameWidth set
      Other(Button)/Box2(Rectangle) Width=120 (Height untouched), sameHeight set Height=40, Line L1
      and Grid-child InGrid unchanged, anchor untouched. This is the reusable pattern for probing
      designerPanel message handlers.
    - Tests: T3 +9 (size buttons disabled with <2 sel / with only Lines selected; enabled with two
      Buttons; click posts align sameWidth/sameHeight with anchor+names). Full suite 1279 passed
      (was 1270). tsc clean, node --check clean, PROBLEMS clean, packaged+installed (363KB). Docs:
      NOTES §59 + history row.

  - SHAPE DRAG-POINT EDITING (§60, 2026-09-01): user: "The Line and Arc shapes are difficult to
    control. For Line, the ends of the line should be the drag (resize and anchor) points. An Arc
    has three drag points — the ends for resizing/anchoring and the centre for the radius.
    Questions?" → askQuestions: Arc end drag = rotate around the centre at current radius, OTHER
    end stays anchored (sweep adjusts); Arc centre = radius follows pointer distance (drag outward
    bigger, centre fixed, box scales around it).
    - **Selection UI:** a selected Line shows its two END dots, an Arc its CENTRE + two END dots
      (`.shape-handle`), REPLACING the 8-handle box. Line selection = no box (just the dots); Arc =
      faint dashed box (`#selection.sel.shape` clears fill/border, `.shape-arc` adds dashed border).
    - **How the webview gets handle positions:** the EXTENSION computes them (`shapeHandlesFor` in
      render() reads the shape geometry from the model + frame bounds, attaches `c.handles` in
      design coords to each Line/Arc frame control). The webview does NO geometry math. HostControlInfo
      gained `handles?: ShapeHandle[]` (kind start/end/centre, x/y).
    - **Line geometry (host-verified):** a Line draws RAW at `Canvas.Left/Top + StartPoint/EndPoint`
      (NO geometry translation — negative StartPoint draws outside the reported bounds; L2 probe:
      StartPoint -30,10 → drawn x:70..169 while bounds = 70×70 at the Canvas pos). Reported bounds =
      EndPoint (max corner). So handle pos = `bounds.xy + point`.
      - **Drag one end** → `setLineEnd {name, end, dx, dy}` (delta). The dragged end's relative point
        += delta; `normalizeLine` re-bases if the AABB min went negative (shifts Canvas.Left/Top by
        the min, subtracts it from BOTH points) → both drawn ends keep their absolute positions, so
        the anchored end stays put and the box stays non-negative.
    - **Arc geometry (host-verified):** centre = box centre; **0° = right, positive angles sweep
      CLOCKWISE (y-down)**; endpoint = `(cx + rx·cosθ, cy + ry·sinθ)`. Confirmed via 4 pixel probes
      (0→90 = bottom-right quadrant; 90→180 = bottom-left; etc.).
      - **Drag an end** → `setArcEnd {name, end, x, y}`: pointer angle around the centre = that end's
        angle; sweep adjusted so the OTHER end's absolute angle is preserved. start-drag:
        `StartAngle=angle; SweepAngle=(endAngle-angle+360)%360`; end-drag: `SweepAngle=(angle-start+360)%360`.
      - **Drag the centre** → `setArcRadius {name, x, y}`: radius = dist(centre→pointer); box scales
        around the FIXED centre keeping aspect (Width/Height + Canvas.Left/Top), circular stays circular.
    - **Webview drag:** `onPointerDown` on `.shape-handle` → shape drag (kind start/end/centre +
      shapeType Line/Arc); `onPointerMove` moves the handle dot to the pointer (relative to the
      selection box: `(p - c) * scale`) + a faint `#radiusGuide` line for Arc-centre drags;
      `onPointerUp` posts setLineEnd (delta) / setArcEnd / setArcRadius (pointer pos). Arc redraws on
      re-render after drop (no live arc preview during drag — only the handle follows).
    - GOTCHAS: (1) new webview elements MUST be in the T3 `IDS` + mounted in `#canvas` (`radiusGuide`);
      (2) xmldom `element.attributes` is NOT iterable in probes — read known attrs via `getAttribute`;
      (3) T3 shape-drag tests dispatch pointerdown ON the handle element (bubbles to the canvas
      listener) and must consume `suppressClick` before later click-selects; (4) after setLineEnd/
      setArcEnd/setArcRadius the model changes but the probe's stale frame bounds no longer match —
      in the real flow render() refreshes the frame each time.
    - VERIFIED via probe driving the real handleMessage: setLineEnd (+30,+20) → EndPoint 150,100,
      StartPoint anchored 0,0, Canvas.Left/Top unchanged; setArcEnd start→59° → Sweep 31 keeps the
      anchored end at 90°; setArcRadius 100px out → box 200×200 centred on the fixed centre (angles
      preserved); shapeHandlesFor returns correct Line ends + Arc centre/endpoints. Tests: T2
      xamlModel +11; T3 +16. Full suite 1315 passed (was 1279). tsc clean, node --check clean,
      PROBLEMS clean, packaged+installed (368KB). Docs: NOTES §60 + CONTROLS.md Shapes note.

  - SHAPES RENDER BEHIND BY DEFAULT (§61, 2026-09-01): user: "All Shape items must render behind
    other controls (Send to Back) by default."
    - Mechanism: the 4 shape snippets (ControlFactory.cs) now carry `ZIndex="-1"` + a defensive guard
      in the `drop` handler (a placed shape with no ZIndex attr gets '-1' — SHAPE_TAGS set added).
      Avalonia honours ZIndex in the paint order — VERIFIED in the host: red rect `ZIndex="-1"`
      renders behind a later blue rect, and a later blue `ZIndex="-1"` loses to an earlier red with
      no z (i.e. -1 always loses to the 0 default). Works in the preview AND at runtime.
    - Escape hatch: the Properties panel already exposes **Z-Index** (COMMON_PROPS) — set a shape to
      0+ to bring it forward.
    - GOTCHA (probe): sample the OVERLAP region correctly — earlier probes sampled a point inside
      only ONE shape and misread the result; a Fluent Button's translucent background also muddied a
      shape-vs-button pixel test, so the T1 z-order test uses two OPAQUE rectangles.
    - Tests: T1 +7 (the 4 snippets carry ZIndex="-1"; two overlap probes proving -1 renders behind).
      Full suite 1322 passed (was 1315). tsc clean, host 0/0, PROBLEMS clean, packaged+installed
      (368KB). Docs: NOTES §61 + CONTROLS.md Shapes note.
    - **BUG FIX (same day, user report):** "Place a TextBox first, then a Rectangle over it — left-
      click selects the Rectangle, not the TextBox." ROOT CAUSE: `ZIndex="-1"` made the shape RENDER
      behind, but the webview's `hitTest` ignored ZIndex — it picked the LAST control containing the
      point (collection order only), so the later-placed Rectangle won. FIX: (1) `render()` enriches
      every frame control with its paint-order **`zIndex`** (parsed from the model's ZIndex attr, 0
      when unset; `HostControlInfo.zIndex` added); (2) `hitTest` picks the HIGHEST zIndex, ties →
      later (`(c.zIndex||0) >= (hit.zIndex||0)` scanning in order = max z, last on tie = Avalonia's
      child sort: ZIndex then collection order). A `ZIndex="-1"` shape never steals a click from a
      control over it; a shape brought forward (z=1) wins over a 0 control. VERIFIED end-to-end via a
      probe driving the REAL `render()` through a live host client (stub ensureAutoSizeOff +
      dotGridConfig): frame controls carried `{Root:0, Body:0, txtA:0, rectB:-1}`. Tests: T3 +4.
      Full suite 1326 passed (was 1322). tsc clean, PROBLEMS clean, packaged+installed (369KB).
    - **BUG FIX #2 (same day, user report):** "This is not ideal. Setting the Z-order to -1 makes
      the control un-selectable with a mouse click. Perhaps we could define shapes as being
      'Containers'?" ROOT CAUSE: the z-aware hitTest compared ZIndex across ALL controls — the
      locked **Body** canvas (z=0) fills the entire form, so a shape (`ZIndex="-1"`) ALWAYS lost to
      Body, even where fully exposed → un-clickable. The "containers" idea isn't the mechanism (a
      container like Body is only clickable at empty points; shapes are already in a container); the
      real fix is HIERARCHY-AWARE hit-testing like Avalonia's own input hit-test: a control is never
      beaten by its OWN ancestors (Body / Root / a containing panel) — an ancestor only wins when
      nothing inside it is hit. Siblings/unrelated controls still compare by ZIndex (higher wins,
      tie → later). FIX: `hitTest` builds a parent map from the frame's `parent` field (the host
      already reports it, HostControlInfo.parent) and walks it (`isAncestor(anc, node)` up the parent
      chain): if the candidate is an ancestor of the current hit → skip; if the candidate is a
      descendant → it wins; else compare zIndex. Result: a shape's EXPOSED area is clickable (beats
      Body), the OVERLAP with a TextBox goes to the TextBox (sibling z), empty space → Body, a shape
      brought forward (z=1) wins. VERIFIED via the real render() through the host: frame carried
      `{Root: parent=null z=0, Body: parent=Root z=0, txtA: parent=Body z=0, rectB: parent=Body
 guards → every sync PREPENDED another import BEFORE the BOM →
      duplicates + invisible mid-file U+FEFF right before an Imports line. FIX: applyAccessors (1)
      detects a leading BOM, strips ALL \uFEFF; (2) manages imports only when the accessor block is
      non-empty — drops every exact `Imports Avalonia.Controls` / `Avalonia.Controls.Shapes` line
      (full-line anchored /gm regexes with $) then prepends exactly ONE of each needed (Shapes only
      when a shape control present); (3) restores a single \uFEFF at the very front iff the file had
      one. Also cleans already-corrupted files. Tests: T2 +10 (vb-bom) — BOM preserved only at char 0,
      one Controls + one Shapes; corrupted file deduped + stray BOM removed.
    - §62 docs: NOTES §62 + feature-history row. Full suite 1362 passed (was 1328). tsc clean,
      node --check clean, PROBLEMS clean, packaged+installed (370KB).
  - PROPERTIES SIDEBAR PINNED HEADER / SCROLLING LIST (§63, 2026-09-02): user: "Restructure the
    Properties sidebar to always keep everything up to and including the 'Show advanced' checkbox
    visible, while allowing to scroll the property items list when required." FIX is PURE CSS
    (media/designer.css — no JS/HTML change): `#props` was one whole-panel scroll region
    (overflow-y:auto); now it's `overflow:hidden` and the pinned stack (header #propsHeader,
    control selector #controlListRow, About-help #helpPanel, Show advanced #propsToggleRow,
    empty-state #propsEmpty) all stay `flex:0 0 auto`; **#propsBody is the ONLY scroller**
    (`flex:1 1 auto; min-height:0; overflow-y:auto`). helpBody keeps its own internal
    max-height:130px scroll. Tab/List-item sections appended to propsBody scroll with the list.
    Tests: T3 +3 CSS-regex guards (#props not a scroll container, #propsBody scrolls,
    #propsToggleRow pinned). Full suite 1365 passed (was 1362). PROBLEMS clean, packaged+installed
    (371KB). Docs: NOTES §63.
  - COLOUR PALETTE FIXES (§63b, 2026-09-02): user: "When trying to scroll the colour dropdown list,
    the list closes down prohibiting scrolling and picking a colour. Also the dropdown box should
    open upwards when its property is currently placed below the vertical middle of the main form."
    - Bug 1: close-on-scroll listener fired for scrolls INSIDE the popup's own list (#colorPalette,
      overflow-y:auto) → scrolling to colour #31 closed it. FIX: listener ignores a scroll whose
      e.target is inside #colorPalette (p.contains(e.target) → return); scrolls elsewhere still close.
    - Bug 2: always opened below (top=r.bottom+4); low property ran the list off the bottom. FIX:
      open UP when r.top > vh/2 (below the vertical middle) OR not enough room below
      (r.bottom+4+ph > vh-8), clamped max(8, r.top-ph-4). ph = min(pal.offsetHeight, maxPalH).
    - Tests: T3 +5 palette (scroll inside OK, scroll outside closes, stubbed low trigger opens above).
      Full suite 1370 passed (was 1365). node --check clean, PROBLEMS clean, packaged+installed
      (371KB). Docs: NOTES §63b.
  - ELLIPSE HIT-TEST REPORT = FALSE ALARM (§63c, 2026-09-02): user claimed the Ellipse had the
    pre-§61 Rectangle bug (covering a control made it unclickable), then CORRECTED: "I was wrong
    about that observation." Confirmed: webview hitTest is TYPE-AGNOSTIC (bounds + hierarchy +
    zIndex), so Ellipse ≡ Rectangle for z/hit behaviour. Added permanent T3 regression tests
    (z-hit-ellipse, +4): Button z0 under covering Ellipse z-1 → Button wins overlap; exposed
    ellipse clickable (not stolen by Body ancestor); two overlapping shapes equal-z → later wins,
    earlier selectable on exposed area. NO production change. Full suite 1374 passed (was 1370).
    Docs: NOTES §63c.
  - LOCK THE ROOT LAYOUT PANEL (§64, 2026-09-02): user: "It is still possible to relocate/resize the
    root dockpanel. The root panel must not be resizable or movable. Lock its size and position to
    the current size of the form, or hide/remove its sizing handles." CAUSE: only the Body Canvas was
    locked (isLockedBody); the form's root content `<DockPanel Name="Root">` (blank-form scaffold
    wrapping Body) = rootContainer(model) had locked:false → selecting it showed 8 resize handles +
    allowed drag/resize. FIX (src/designerPanel.ts): new `isLockedStructure(model,name)` = isLockedBody
    OR element === rootContainer(model) (first real content child of the window root). Used for the
    frame `locked` flag (webview hides handles, blocks drag, 🔒 badge) AND in every move/resize/delete/
    cut/rename/moveToContainer/align/alignText/setLineEnd/setArcEnd/setArcRadius guard (replaced
    isLockedBody). New `lockedLabel()` → accurate toasts ("The Root DockPanel is locked — it can't be
    deleted."). Webview lock-badge title generalized to "(Body / root panel)". Root stays SELECTABLE
    (Properties editable) but fixed in place like Body. Verified blank-form structure via probe
    (Window → DockPanel Root → Canvas Body). Full suite 1374 passed (unchanged). tsc clean,
    node --check clean, PROBLEMS clean, packaged+installed (371KB). Docs: NOTES §64.
  - SELECT THE FORM TO RESIZE IT (§65, 2026-09-02): user: "How do I resize the form in the
    designer? … Yes add both please. Name it after its Title: e.g. 'Form - Title'." CONTEXT: the
    design-surface size = the WINDOW's Width/Height (designSize reads the model root). The host
    reports the Window root with name=null (verified via live frame dump) and both the drop-down
    and hitTest skip unnamed controls → the form was NOT selectable → resizing needed hand-editing
    .axaml. FIX: extension render() now sends `formTitle` (Window Title, fallback ChromeWindow
    TitleBarTitle) with the frame. Webview (media/designer.js): (1) control-list gets a leading
    **"Form - <Title>"** option (value '') → selectForm() posts select name null → Window props
    (Width/Height/Title/CanResize) show; list re-keyed on names+title so the label updates after a
    Title edit. (2) clicking EMPTY design space (!hit || hit.locked — the locked Body, or a gap on
    forms without one) now selects the FORM instead of the Body (Ctrl+click on empty does nothing;
    Body still reachable via the drop-down). Form selection shows NO outline (it fills the canvas —
    resize via properties, no handles on the whole window). Tests: T3 +8 net (drop-down now 5 =
    4 controls + Form; form-select block; z-hit empty-space → form). Full suite 1382 passed (was
    1374). tsc clean, node --check clean, PROBLEMS clean, packaged+installed (372KB). Docs: NOTES
    §65 + USER_MANUAL §7.
  - NEW PROJECTS ARE F5-READY / LINUX-SAFE LAUNCH (§66, 2026-09-02): user reported F5 on a VB
    project failed "'TestVBApp.exe' does not exist". ROOT CAUSE: the debug launch.json came from the
    vbnet-companion "VB.NET: Launch" snippet — a WINDOWS template: program = bin/Debug/net8.0/<name>
    .exe (no .exe on Linux; project targets net10.0 → folder is net10.0). The vbnet-companion
    snippet is Windows-biased; the real .NET debugger on Linux is coreclr (ms-dotnettools.csharp,
    installed). FIX + AUTOMATE (src/projectScaffold.ts, C# AND VB): every generated project now
    writes .vscode/launch.json (`type: coreclr`, `preLaunchTask: build`, program =
    ${workspaceFolder}/bin/Debug/net10.0/${workspaceFolderBasename}.dll — the BUILT dll, never .exe;
    TFM folder from the TARGET_FRAMEWORK const; plus Attach) and .vscode/tasks.json (default build
    task `dotnet build`, group build isDefault, $msCompile) → F5/Ctrl+Shift+B build first and, with
    global task.saveBeforeRun, save open files. VB keeps writing settings.json (vbnetcompanion).
    Tests: new T2 projectScaffold.test.js (+15). Full suite 1397 passed (was 1382). tsc clean,
    PROBLEMS clean, packaged+installed (373KB). Docs: NOTES §66. LESSON: never use the vbnet-
    companion launch snippet (.exe/net8.0); coreclr + built dll is the cross-platform config.
  - §66 FIX 1 — PORTABLE VB BRIDGE PATH (2026-09-02): the VB scaffold hardcoded
    ~/.vscode/extensions/roies.vbnet-companion-0.1.47/.../VBNetCompanion.LanguageServer.dll into
    every generated VB project's .vscode/settings.json (broken for others / after an update).
    FIX: ScaffoldOptions.vbBridgeDll? + projectCreator.vbBridgeDllPath() resolves at generation
    time via vscode.extensions.getExtension('roies.vbnet-companion').extensionPath +
    server/VBNetCompanion.LanguageServer/publish/VBNetCompanion.LanguageServer.dll (existsSync
    guard; undefined when the ext isn't installed). Scaffold writes settings.json ONLY when a DLL
    was found. Tests: T2 scaffold +4. Full suite 1401 passed (was 1397). Packaged+installed
    (373KB). Docs: NOTES §66 fix 1.
  - §66 FIX 2 — FIRST-OPEN STALE LANGUAGE SERVER (2026-09-02): user reported a new VB.NET project
    shows "Avalonia namespace not found" until a window reload. CAUSE: the vbnet-companion/Roslyn
    LS indexes a freshly-created project BEFORE the first `dotnet build` restores NuGet → stale
    workspace (the known stale-LS-after-restore issue; see vbnet-ls-notes). FIX (src/projectCreator
    .ts): `createNewProject` runs `dotnet restore` BEFORE openFolderInWindow via `restoreBeforeOpen`
    (awaited child-process `dotnet restore` under a Notification progress "Restoring NuGet
    packages…", 180 s timeout, best-effort — still opens on failure; the existing first-open build
    retries). Packages are on disk before the LS first loads → resolves Avalonia first time, no
    reload. Applies to C# + VB. Full suite 1401 unchanged. Packaged+installed (374KB). Docs: NOTES
    §66 fix 2.
  - PUBLIC GITHUB BETA — RELEASE HYGIENE (§67, 2026-09-02): repo github.com/OomNiel/avalonia-designer
    (public). git init main + hardened .gitignore (out/, host/bin, host/obj, .poolside/) → initial
    commit 42f4f09; release-hygiene commit 3c19d74 (pushed). package.json: repository/homepage/bugs,
    keywords(10), categories ["Other","Visualization"], version 1.0.0-beta.1 (semver prerelease —
    flatten to 1.0.0 when stable). CHANGELOG.md (Keep a Changelog, bundled). README prereq +
    version-matrix note (generated net10/Avalonia 12 vs host net8/Avalonia 11; designer opt-in).
    Extension ICON deferred (only SVGs exist; marketplace wants PNG ≥128px). Repackaged
    avalonia-designer-1.0.0-beta.1.vsix (93 files, 376KB) installed. Docs: NOTES §67. User steps
    remaining: tag v1.0.0-beta.1 pre-release on GitHub; Marketplace publish via vsce publish
    --pre-release (publisher "grumpy", needs PAT/Azure DevOps).

