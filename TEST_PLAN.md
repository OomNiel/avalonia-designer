# Test Script Plan — Avalonia Designer Extension

Date: 2026-09-20 · Status: **full suite green on this machine — 6,178 passed / 0 failed / 0 skipped (46–75 s; the run length depends on what else the machine is doing)**

> 2026-09-20: **the charting tool** added 1,221 assertions (suite 4,915 → 6,153) across ten new or
> extended files. It is the first bundled feature that is *drawn*, so the tests had to learn to measure
> pixels, and the first that is both a property element and a list of little objects. The T5 matrix (45
> controls) and the two Avalonia probes (12.1.1 and 11.0.10) are unchanged.

> 2026-09-19: the T5 matrix now places, renders, bounds-checks, property-tests and VB-compiles **45**
> placeable controls (the nine added that day included), which is where most of the growth from 5,059 to
> 5,364 assertions comes from. Two defects it caught on the way: `Separator` sat 12 px off the drop point
> (the Fluent theme's own margin — the snippet now pins `Margin="0"`), and a generic text sample was not a
> valid `Points` list or `Geometry`, so `Polyline`/`Polygon`/`PathIcon` failed to compile until the harness
> learned real samples for `Points` and `Data`.

> Update 2026-08-30: user approved **Option (a) — full Avalonia.Headless driver** for T4, and
> instructed to *prepare the script only* (run at a later stage) and keep it easily extensible.
> The suite is built (`tests/`, `npm test`); a smoke run of T0-compile, T1, T2, T3 and T4 all
> passed. The slow T0 10-project build matrix is deferred to the first full `npm test` run.

## 1. Goal

A repeatable, automated test suite that verifies every feature of the extension:

1. **Project creation** — every project type (C# + VB × every template).
2. **Control placement & removal** — every toolbox control.
3. **Property functionality** — every property kind.
4. **Runtime functionality** of created forms & controls (resizing, moving, minimisation,
   form-placement persistence, DataGrid editing, bindings, custom title bar, …).
5. **Test log** — every action recorded as PASS/FAIL with detail, plus a summary + exit code.

## 2. Test architecture (layered)

A single runner drives 5 layers. Lower layers are fast and fully automatable; layer 4 is the
one that touches the standing **"no automated UI runs"** rule (see §7 — decision needed).

| Layer | Name | Technique | Covers |
|---|---|---|---|
| **T0** | Static / build | `tsc`, `node --check` on webview JS, `dotnet build host`, `dotnet build` of every generated project (C#+VB) | Compiles everywhere, 0 warnings/errors |
| **T1** | Host preview probes | Drive `PreviewerHost` over WebSocket (render XAML → PNG + control bounds), decode + assert pixels/bounds | Placement, sizing, preview fidelity, title bar, images, item compaction, Body lock, themes |
| **T2** | Extension logic probes | `node` + vscode stub → `XamlModel`, `codeBehind`, `codeBehindCheck`, `controlEvents`, `propertyCatalog`, `assetCatalog`, `dataSetModel/Generator`, `projectScaffold`, `projectCreator`, undo/redo history, `bundledComponents` | Model ops, code-behind generation/cleanup + fix & alternative rules, the generated event catalog, property defs, asset scanning, .adset round-trips, generated code correctness, marketplace packaging rules |
| **T3** | Webview DOM tests | `jsdom` + stubbed `acquireVsCodeApi` → `designer.js`/`dataSet.js` interaction | Click-select, drag outline + drop, context menu, dropdown, modals, ItemsSource picker, shortcuts, event chooser, handler menu, ⚠ badges, ⚙ Settings, code-issue alternatives, toolbar categories folding the **real** markup. The fixture must mirror **every** `$('…')` id in `media/designer.js` — an assertion fails loudly if one is missing (a stale fixture used to make the script throw on load and run 5 of ~360 checks) |
| **T4** | Generated-app runtime | See §7 (needs approval): Avalonia.Headless driver or manual checklist | Runtime window/control behavior |

The runner (node) sequences tests, collects `[PASS]/[FAIL]`, writes the log (§6), and exits non-zero on any failure.

## 3. Area 1 — Project creation (all project types)

Fixture: run the same project-creation entry points the UI uses (`createNewProject` with/without
forced language; the two sidebar buttons; `create-avalonia` / `create-avalonia-vb` generators).

Matrix (10 combos): **language {C#, VB} × template {Blank, Login, Data entry, About, Main window}**.
Additional scenarios:
- Default title bar for new projects; ChromeWindow.cs/.vb + AnchorHelper.cs/.vb bundled.
- "Custom Title Bar" toolbox conversion: `Window` → `chrome:ChromeWindow`, code-behind base class
  change (C# `: AvaloniaChrome.ChromeWindow`, VB `Inherits`), +44px Height, title auto-copied,
  Ctrl+Z revert.
- DataSet designer project: `.adset` created; generated `MyData.cs/.vb` + `.xsd`; Grid theme
  `StyleInclude` present; DataGrid package referenced.

Assertions (T0 build 0/0 + T2 file-content checks):
- Correct files exist (`.csproj/.vbproj`, `App.axaml`, `MainWindow.axaml`, code-behind, `Program.*`).
- Correct `x:Class` / namespace / RootNamespace; C# vs VB code shapes.
- Form opens in the designer and renders (T1).

## 4. Area 2 — Control placement & removal (all controls)

Toolbox matrix (21 entries): Button, TextBox, Label(TextBlock), ComboBox, ListBox, ItemsControl,
CheckBox, RadioButton, Image, Panel, Grid, StackPanel, DockPanel, WrapPanel, TabControl, DataGrid,
**DataSet (tool)**, Menu, StatusBar, StatusDate, **Custom Title Bar (tool)**.

Per control:
- **Place** (drag-and-drop and click-tool) → T2: element added with unique `x:Name` + correct tag +
  default snippet; auto-wired default event (Button→Click, TextBox→TextChanged, …) written to
  code-behind + XAML attr (new behavior); containers placed with no event. T1: renders at the drop
  point with expected bounds.
- **Select** (left-click + dropdown) → T3 DOM: selection outline appears; locked Body never blocks.
- **Move / resize** → T1+T2: outline-drag then single drop; final bounds match outline (all 8
  corners); Canvas.Left/Top vs Margin paths.
- **Remove** → T2: element gone from XAML; code-behind cleaned (event handlers, ItemsSource
  binding — asset or DataSet, VB accessors, .adset `boundTo` marker when a bound control is
  deleted); theme backup dropped.
- **Cut / Copy / Paste**, **Move to container** (incl. New Canvas), **undo/redo** (5 levels, full
  code-behind reversibility).
- Special: DataGrid (AutoGenerateColumns="True", package + theme warnings); StatusDate (Loaded
  clock handler); TabControl Tab items; Custom Title Bar conversion + revert; **Body lock** (no
  move/resize/delete/rename, auto-fills).

## 5. Area 3 — Property functionality (every property kind)

For each property kind, round-trip a value through the Properties panel into the XAML and verify
the preview (T1) reflects it:

- **text** (Name, Text/Content, Watermark/PlaceholderText, tooltips) + rename refactors handlers.
- **number** (Width/Height, FontSize, Opacity%, ZIndex, MaxLength, Spacing, Undo-Redo depth …).
- **dropdown** (HorizontalAlignment, VerticalAlignment, Dock, Theme System/Custom, …).
- **color** (Background, Foreground, BorderBrush, CaretBrush, SelectionBrush, RowBackground …).
- **margin** (Margin picker), **font** (FontFamily/FontSize/FontWeight).
- **file** (Image Source, Window Icon, ChromeWindow Title Bar Icon) → system file browser →
  copy into `Assets\` (unique name) + `<AvaloniaResource Include="Assets\**"/>` + `avares://` URI;
  preview shows the image (named) / placeholder otherwise.
- **button** (Items editor for ComboBox/ListBox/ItemsControl) — one item per line → XAML children,
  auto-grow/shrink height, disabled when bound/ItemsSource.
- **ItemsSource asset picker** — lists code arrays/collections (C#+VB, incl. module/`Dim`,
  lowercase-keyword cases) + DataSet tables; picking binds code-behind (asset → `Ctrl.ItemsSource =
  X`; table → DataSet path + .adset + regenerate MyData); read-only display + clear.
- **Undo-Redo** depth (DataGrid) → writes .adset + regenerates MyData.
- Effective-value display (theme-resolved defaults shown when unset).

## 6. Area 4 — Runtime functionality (created forms & controls)

This is the part that needs the §7 decision. Content:

- **Window/form**: resize → Body auto-fills; move; minimise/maximise/close; **persistence of
  window size & screen placement across runs** (save/restore on disk — needs to be verified how the
  app persists, or added).
- **Controls at runtime**:
  - ListBox/ComboBox with static items, ItemsSource-asset binding, DataSet-bound tables (rows show).
  - DataGrid live editing: in-cell text/checkbox/date (DatePicker), +Add row popup, right-click
    Delete, auto-save to `MyData.<Table>.xml`, undo/redo (Ctrl+U / Ctrl+R), depth setting.
  - Custom Title Bar: drag to move, double-click maximize, min/max/close buttons, icon.
  - StatusDate clock ticking; bindings compiling and data flowing.
- **Persistence**: form size/position saved and restored on relaunch.

## 7. Decision needed — T4 runtime-UI approach

**RESOLVED 2026-08-30 — user approved Option (a): full Avalonia.Headless driver.**
The T4 harness (`tests/headless/Program.cs.tpl` + `tests/t4-runtime/headless.test.js`) generates
a real project, ProjectReferences it from a net10 harness and drives its real `MainWindow`
headlessly (window creation, Body auto-fill + resize-follow, WindowState transitions, placed
control position/size).

(Original options, kept for reference:)

Your standing rule in memory: **"NO AUTOMATED TESTING — never auto-test the app (no automated UI
runs, no xdotool/browser/offscreen smoke automation of the app itself)."** This request's Area 4
(runtime functionality) directly touches that rule, so I want explicit sign-off on how to handle it:

- **(a) Avalonia.Headless driver (automated, offscreen):** build the generated app, instantiate its
  `MainWindow` on the headless platform, `Show()`, drive resize/minimise/window-state and control
  interactions programmatically, assert bounds/state + persistence on disk. Fully automated, but IS
  automation of the generated app.
- **(b) Manual runtime checklist (no app automation):** the suite generates + builds every scenario
  (T0), and you run the app and tick off the runtime items; the runner logs your results.
- **(c) Hybrid (recommended):** automated T0–T3 + a headless **build & render** smoke of the runtime
  (compile 0/0, host render shows the populated form) + an opt-in (a) driver for the interactions
  you care about most (window persistence, DataGrid edit/undo), keeping the rest as (b).

I'll build everything except T4 first; T4 starts only after you pick (a), (b), or (c).

**Chosen: (a).** The standing rule is lifted for the test suite's headless runtime driver only.
Everything else still follows the no-auto-UI convention (T3 uses jsdom, not a real app UI).

## 8. Area 5 — Test log

- `tests/out/log.jsonl` — one JSON object per action:
  `{ ts, layer, feature, action, expected, actual, result: "PASS"|"FAIL"|"SKIP" }`.
- `tests/out/report.md` + console summary — grouped by feature, with a final
  `N passed, M failed, K skipped` and a non-zero exit code on any failure.
- On failure, the runner also saves the failing generated project + the rendered PNG (T1) and the
  exact diff (expected vs actual) for repro.

## 9. Deliverables

```
tests/
  runner.js            # orchestrates T0–T4, collects results, writes the log
  helpers/             # host client, png decode, vscode stub, jsdom harness, project builder
  t0-build/            # compile + generated-project build checks
  t1-preview/          # host render probes (placement, bounds, pixels)
  t2-logic/            # model / codeBehind / catalog / assets / generator probes
  t3-webview/          # jsdom interaction tests
  t4-runtime/          # (after §7 decision) runtime driver or manual checklist
  fixtures/            # sample .adset, sample projects, sample images
  out/                 # log.jsonl, report.md, failure artifacts
  TEST_PLAN.md         # this document
package.json           # npm test (T0–T3), npm run test:runtime (T4)
```

## 10. Suggested build order (after approval)

Status 2026-08-30: all built. Smoke-verified green: T0-compile, T1 (24), T2 (121), T3 (38),
T4 (14). Remaining before first full run:

- [x] 1. Runner + log/report plumbing (Area 5) → green.
- [x] 2. T2 model/code-behind/catalog/asset probes → green.
- [x] 3. T1 preview probes (placement, bounds, Body lock, item compaction, title bar, images) → green.
- [x] 4. T3 webview DOM tests (selection, drag outline, modals, pickers) → green.
- [x] 5. T0-compile (tsc, media syntax, host build) → green.
- [x] 6. T4 Avalonia.Headless runtime driver → green.
- [ ] 7. T0 project build matrix (10 combos — slow) → run at the first full `npm test`.

### 0.10.1 (2026-09-17) — the build-driven code check

Three new t2 files, and the loop's *policy* is asserted with fakes rather than with a compiler:

- `tests/t2-logic/buildDiagnostics.test.js` (57) — the `dotnet build` parser: MSBuild's double-printed errors
  de-duplicated, VB codes, paths with spaces, parentheses inside the compiler's own message, `obj/`/`bin/` and
  other projects dropped, errors **with no file** kept as project-level findings. Plus the Code Fix entries a
  compiler error becomes (`CS1002` in the form → the rule's `insert-semicolon`; anything else report-only) and
  the PROBLEMS publishing, asserted against an inspectable stub collection.
- `tests/t2-logic/repairLoop.test.js` (77) — the pass logic, driven by a fake project that returns error sets:
  a rebuild after **every** fix, an error no fixer understands skipped while the loop carries on, a fix that
  does not help **reverted**, one that trades an error for another **kept** (it revealed the next), and every
  stop reason (clean / nothing-fixable / no-progress / budget / cancel / build-failed), including a fixer that
  throws. The wiring is asserted from source: where the build runs, that the silent re-check never builds, the
  dirty-buffer signal, and the three-attempt cap on model repairs.
- `tests/t2-logic/hostCheck.test.js` (57) — the GPU probe's parsers (`lspci` display class only, `nvidia-smi`,
  Windows `AdapterRAM` saturation, `system_profiler`), the classifier's conservative direction (an unknown name
  is never credited VRAM), and every verdict: the user's own machine allowed with the tight-memory warning, a
  5 GB laptop blocked with an actionable reason, a 3 GB card "no help" but not a blocker, a real card's VRAM
  added, an override that is remembered.
- `tests/t3-webview/designer.test.js` grew the host verdict: a refused machine disables the AI controls, shows
  the reason and offers the escape; an allowed-but-tight machine only warns.

### 0.10.2 (2026-09-17) — the fixer, the runtime and the data

- `tests/t2-logic/dataSetFacts.test.js` (34) — the text the AI prompts now carry: the DataSet class, the grid's
  row type and columns, **that a control bound to a column holds a value rather than a row** (the mistake that
  produced `DataGrid.Items`), and the Data-Image description. Plus the prompt rendering itself (the block is
  present, says it is authoritative, sits before the task, and is absent when there is nothing to say), and both
  wirings: the panel delegates the one DataSet mapping, and all three AI request paths pass the facts.
- `tests/t2-logic/repairLoop.test.js` — two assertions re-pointed at the rebuilt runtime guard (the loop uses
  `repairRuntime`, which knows all three runtimes and never starts one; `effectiveConfig` must not appear on that
  path).

Each step ends with the log green before the next begins.

### 0.10.3 (2026-09-17) — the server you can see and control

- `tests/t2-logic/llamaService.test.js` (new, **72** assertions) — the module that answers "who started the
  user's llama-server?" and drives the Start / Stop controls. The parsers are pinned against output captured
  from this machine: real `ss -ltnp` (a service on 8080, our own sidecar on 45725, an established connection
  that must not count as a listener, a socket whose owner is not visible), the **real cgroup** of the
  llama-server process, the **real unit file** (whose `ExecStart` is written over nine lines with trailing
  backslashes, so a first-line parser would see `-m` and no binary), and the real `systemctl show` output.
  What cannot be proved without touching a service is asserted against the source: every stop is confirmed in a
  modal dialog, a *system* unit is never acted on (its `sudo` line is printed), a plain process is signaled
  only when `ss` named it a `llama-server`, and the four panel ids plus the three webview intents exist.
- `tests/t2-logic/llamaServer.test.js` — one assertion re-pointed at the new shape of the status dialog call
  (the probe result now also carries the owner line). The two-argument call keeps its old sentence, which the
  existing "leave it alone" assertion still pins.
- `tests/t3-webview/designer.test.js` — the `IDS` fixture and `tagFor` learned the four new control ids
  (`aiLlamaTarget`, `aiLlamaStart`, `aiLlamaStop`, `aiLlamaOwner`), so the webview script runs against a DOM
  that has them (a missing id would make `setAiBusy` throw).

Each step ends with the log green before the next begins.

### 0.10.4 (2026-09-17) — the button that refused silently

- `tests/t2-logic/removeModel.test.js` 40 → **69** assertions. The new ones are the report, end to end: a server
  selection (`any:`) with an owned `.gguf` behind it is removed and its pin cleared; a file **outside** the
  extension's folder is refused, untouched, with the message naming the folder that *is* ours; an LM Studio key
  is refused by naming whose library it is; `resolveRemoveTarget` is exercised directly for `bundled:` (built-in
  and Hub-added), `file:` (inside and outside), `llama:`/`any:`/`custom:`, and `removeAdvice` for the button's
  enabled/hint verdict. Source pins cover the refusal being **logged** and the dialog naming the full path.

Each step ends with the log green before the next begins.

### 0.10.5 (2026-09-17) — two entries, and the step up

- `tests/t2-logic/bigModel.test.js` (new, **31** assertions) — the offer and its refusals. `parseExecStartModel`
  is pinned against this machine's real unit, whose `ExecStart` is written over nine lines with trailing
  backslashes; `bigModelOffer` against real file sizes (sparse temp files, so the test costs no disk): a 19 GB
  model behind the unit is a step up from the local 4.4 GB one, the same size is not, 19 GB that would not fit in
  the free memory is refused *with the memory named*, a unit that is already answering needs no memory at all,
  and every "no" has its own reason (no unit, no unit text, no `.gguf`, file gone). The sequence is asserted
  against the source: unload **before** start, announce every step to the status bar *and* the panel, ask once
  with the cost in the question, read `MemAvailable` rather than `MemFree`, and resolve the unit from the
  setting/discovery rather than a hardcoded name.
- The picker tests were re-pointed at the new table: `modelSpecs.test.js` asserts **two** entries that share one
  file (`new Set(fileNames).size === 1`) with `backend` `vulkan` then `cpu`; `aiPanel.test.js` asserts the two
  bundled entries come first and `"let the server decide"` leads the rest; `hubModels.test.js` asserts the fold
  (every non-bundled choice carries `group: 'Advanced…'`, and the optional `backend` field is the one shape
  difference an added model does not have).

Each step ends with the log green before the next begins.

### 0.10.11 (2026-09-18) — the prompt typed in the editor, at the caret

- `tests/t2-logic/repairLoop.test.js` — the second round of the same afternoon's report (*"No change. The Code
  Fix does not start the ai train…"*). The AI fallback is asserted to be **ungated**: `if (!form) return
  'no-fix';` must be gone from `fixCompilerError`, the analyser must be reached only when a form was found, and
  a file outside a form must still be snapshotted before the request. The escalation is asserted to leave a
  trace where the user is looking (a log line **and** a status-bar line per step), to run under a five-minute
  deadline, and to log the second run's outcome. One existing assertion had pinned the *old*
  `return await once(…)` shape — the same "the test caught the change it was written for" pattern as above.

- `tests/t2-logic/aiPrompt.test.js` (new, **47** assertions) — the marker block. The snippet places the caret
between the two markers (`$0`), C# and VB get their own comment prefix, a block is found whether or not its
prompt lines carry that prefix (pasted code survives verbatim), the two "no" answers stay distinct (no block at
all vs. a block whose closing marker was deleted), an untouched block is reported as *empty* rather than missing,
and **what was inserted comes out exactly**: the file is compared byte for byte with its state *before* the
block existed, with VS Code's own re-indentation emulated in the fixture.
- The wiring is asserted against the source: `showInputBox` is gone from the prompt path, the block is inserted
as a snippet, sending **validates before removing** (so a refused request stays readable in the file),
cancelling resolves with nothing, the lens is only offered in the document the block is in, and the manifest
carries both commands, the `Ctrl+Alt+Enter` binding and the palette hiding.
- `tests/t2-logic/codeFix.test.js` — **the four check triggers**, added after the user reported that *"when the
  code-behind is saved"* did not work: the visibility guard is asserted to be **gone** from `runSilentCheck`,
  the analysis and `publishIssues` are asserted to come before any visibility question, the save trigger carries
  `announce` (and the typing one does not), and both code-check settings are asserted to be written through
  `updateSetting` rather than straight to `Global`. The behaviour had never been pinned — only the enum was,
  which is exactly how a check that could not fire survived three releases.
- `tests/t2-logic/repairLoop.test.js` — the cancel rule is now **two** rules, and the test says why: switching
  away stops a run nobody asked for, and must not stop the step-up run the user just approved in a modal. The
  assertion that pinned the old single shape is what caught the change, which is what it was for. It also pins the
  wrapper that makes a throw impossible to ignore (logged **and** shown) and the status-bar line that carries the
  result when the designer is behind the file.

- `tests/t2-logic/aiPanel.test.js` — the pin marker with two entries over one file (exactly one is marked, and
the one for the configured build; the selection follows it in both directions), the ⚙ dialog's `Loading…` marker
(shown by `beginAiStateWait`, hidden by the state that arrives **and** by closing the dialog, styled with
`margin-right: auto` so a right-aligned button row keeps its buttons still), and the discovery cache the marker
was really about: `discover({ maxAgeMs, cliTimeoutMs })`, `panelState`'s `{ 15000, 3000 }` against *Refresh
list*'s `{ 0, 20000 }`, and `CliResult.timedOut` so a killed helper is logged as an incomplete answer rather
than as "no models".
- `tests/t2-logic/llamaService.test.js` — a unit that is `is-active` but silent is **restarted** (the state that
made *"the llama 30B is not starting"* true while systemd said `active`), with `unitIsActive` asked in one place.
- `tests/t2-logic/bigModel.test.js` — the step-up offer receives the unit's own activity (`running`), so an
already-running 30B is not refused for memory it has spent, and the question says so instead of promising a
minute of loading.
- `tests/t2-logic/repairLoop.test.js` / `tests/t2-logic/dataSetFacts.test.js` — the repair guard returns the
runtime's **own** endpoint rather than `assistant.endpoint` (the dead port that produced *"No server answered"*
while the runtime was fine), a failure is logged with the address it used, and the DataSet facts name the class
as it is generated (static helpers, top-level row classes, the members that do not exist, `ItemsSource` rather
than `.Items`).
- `tests/t2-logic/vulkanBackend.test.js` — the entry decides the offload as well as the build (`max` / `off`),
written to the setting *and* used by the load in progress; Vulkan is the default in the manifest, in every
fallback and in the normaliser.
- `tests/t3-webview/designer.test.js` — `settingsBusy` joins the DOM ids the harness builds, so the marker cannot
be renamed out from under the webview.

Each step ends with the log green before the next begins.

### 0.10.11 (2026-09-20) — the charting tool: ten files, and tests that measure pixels

- `tests/t1-preview/chartColors.test.js` (new, **4**) — **why it exists**: `XamlRenderer.ConvertValue`
  prefixed `#` onto any `Color` value, so `TitleColor="White"` became `#White`, `Color.Parse` threw and the
  catch returned `Colors.Transparent` — the title was drawn **invisibly in the designer** while the running
  app (which uses the real XAML loader) showed it perfectly. The file pins named colours as they arrive
  through the host.
- `tests/t1-preview/chartSeries.test.js` (**8**) — the series path end to end: `<charts:LineSeries>` /
  `<charts:XYSeries>` children (and a per-series nested `<charts:Axis>`) reach the renderer through the
  **real host**. A chart's series are child elements *holding objects*, so the ordinary recursion (panel
  children, `ContentControl` content, item containers) never touches them — the host needed its own
  `ApplyChartSeries`, and that is what this file holds in place.
- `tests/t1-preview/chartAxes.test.js` (**9**) — an axis is a real object now, so its **position** must move
  the whole gizmo (line, ticks, labels and name) to another side of the plot, and several per-series axes on
  the same side must **stack** instead of drawing over each other (they used to all be drawn at the plot
  edge).
- `tests/t1-preview/chartLegend.test.js` (**31**) — the bar appears only for a chart that **has** series (a
  single implicit line has no name to show), it takes its height **off** the plot rather than overdrawing it,
  a switched-off trace vanishes without the others moving, and each name is drawn in its series' own colour.
- `tests/t1-preview/chartCursors.test.js` (**37**) — the cursors as drawn: a cursor lands on the pixel column
  its X maps to, its dash style is long/short/dotted as chosen, a chart with **three** cursor elements still
  draws **two**, and the readout reports the **interpolated** trace value — with the Orientation rule that a
  horizontal cursor still reports an X.
- `tests/t2-logic/chartSeries.test.js` (**67**), `chartAxes.test.js` (**71**), `chartLegend.test.js` (**41**),
  `chartCursors.test.js` (**126**) — the four editors, each asserted across the four places that can drift
  apart: the catalog button, the modal markup, the fields the modal posts, and the property element the save
  writes (plus the C# member the host maps it onto). The cursor file is the largest because a cursor is both a
  property element *and* a list of objects, seven fields each plus two chart-level readout settings, and the
  editor disables the Y box while *Follow trace* is on.
- `tests/t2-logic/chartWorkbook.test.js` (**30**) — how the workbook reader **opens** the file and what it
  says when it cannot: `FileShare.ReadWrite | FileShare.Delete`, four attempts 120 ms apart, the `IOException`
  HResult classification (32/33), and the three messages — because a chart bound to a sheet that was open in
  Excel drew nothing on Windows, and Linux never behaves that way, so the bug could not appear on this
  machine.
- `tests/t2-logic/bundledComponents.test.js` (**36**, extended) — the staleness marker is asserted to be
  `ChartCursor`, so a project whose bundled file predates the cursors is refreshed on save instead of failing
  to compile with *Unable to resolve type ChartCursor*.
- `tests/t3-webview/designer.test.js` (**813**, extended) — the modal drives for all four editors (open, add,
  edit, reorder, delete, save, Cancel, Escape, and the empty state that offers *Add cursor*), with the fields
  the harness has to build asserted against the ids the webview asks for.
- **The lesson this batch added to the plan:** a bundled file is validated by the **XAML compiler**, so the
  compiler is part of the test rig. `GrumpyCharts` is built by the host, by a 12.1.1 probe and by an 11.0.10
  probe, plus the VB twin under `Option Strict On` — a new element or enum is only really checked when a real
  project compiles it. The 11.0.10 probe deliberately avoids `Values=`/`Points=`, because that version's
  compiled XAML cannot convert a string to `double[]`.

### 0.11.0 (2026-09-20) — the cursor wears the colour of the series it follows

- `tests/t1-preview/chartCursors.test.js` (**45**, +8) — the pixel proof of the rule, measured on two
differently coloured series: the *same* orange cursor on a green series and on a blue one is drawn in the
series' colour, a following cursor leaves no ink of its own **in the plot**, two following cursors both ride
the trace, and a cursor with FollowTrace off keeps the colour it was given. The file's own cursors now state
FollowTrace explicitly, because that switch is what decides the colour — following is the default, so "the
cursor is orange" only holds while it is off.
  - **Trap that cost two false failures:** "no ink in its own colour" cannot be measured over the whole
    image. Text is drawn with subpixel fringing, so a readout's letters produce warm pixels whatever colour
    they are in — verified on a render whose panel is green: the panel and its text are green, and the
    fringes around the letters still matched the orange matcher. Measure the plot's interior (`LINES`),
    where no text is drawn.
- `tests/t2-logic/chartCursors.test.js` (**142**, +16) — the rule as a seam in **both twins**: one place
derives the colour (`CursorColor(cursor, trace)`), the lines and the handle at the crossing use it, each
cursor's clickable record carries `DrawnColor`, and the readout's border and values plus the two-cursor
`ΔX`/`ΔY` row use the colour that was actually drawn (`(first.Index == index ? second : first).DrawnColor` in
C#, `If(first.Index = index, second.DrawnColor, first.DrawnColor)` in VB). Two existing delta assertions were
updated to that seam.
- `tests/t2-logic/bundledComponents.test.js` (**37**, +1) — the staleness marker is `DrawnColor` now, and the
fixtures remember the copy that **has** cursors and is nevertheless stale: a change in how an existing type
*draws* has to refresh a project's bundled file exactly as a new element does.
- The help text is pinned too: the Cursors modal has to say the cursor takes the series' colour, and the
Colour row's tooltip has to say when its own colour applies.

### Status 2026-09-11 — full suite green (2176 passed / 0 failed / 0 skipped, 35 s)

- **T2** gained `bundledComponents.test.js`, `chromeProps.test.js`, `multiProps.test.js`,
  `xamlHeader.test.js`, `menuItems.test.js`, `projectBackup.test.js` and `codeFix.test.js` plus the
  Data-Image / Browse-picker / palette additions to `codeBehind.test.js` and `dataSet.test.js`.
- **T3** now runs **401** checks (was silently 5 while the fixture was stale) and guards its own
  fixture against `media/designer.js` — keep that assertion when adding a toolbar button or modal.
- **T4** re-asserts the harness `ProjectReference` right before `dotnet run` (and builds the
  referenced project first), so the layer is deterministic; it passes 15/15.
- **Code Fix…** (`src/codeBehindCheck.ts`) is unit-tested by `t2-logic/codeFix.test.js` (**36**
  checks) with the damaged-fixture pattern — inject damage → `analyzeCodeBehind` → `applyLocalFix` →
  re-analyse → expect 0: C# constructors (plain, attributes + `: base()`, call missing, absent,
  a `// class X` comment beside the real class), the constructor a fix must call into rather than
  duplicate, `add-binding-call` landing after `InitializeComponent()`, and VB single-line vs.
  multi-line lambdas (constructor span, orphan-handler removal cutting the whole method).
- **Project Backup** is covered by `t2-logic/projectBackup.test.js` (**33** checks): the timestamp
  and `<Project>_<stamp>` naming, the `-2`/`-3` collision suffix, the skip list (at any depth), file
  counting/skipping and a real copy against a temp project, plus source-level assertions on the
  toolbar button (the T3 fixture's buttons carry no labels, so the label is checked at source level).
- **Menu items** are covered by `t2-logic/menuItems.test.js` (**34** checks): reading a tree back,
  the new `FileSelector`/`FolderSelector` kinds (leaf rows with px width + dialog title, written as
  `<chrome:PathPicker>`), `Space` only at the top level, and the sanitiser's behaviour on unknown
  kinds, bogus `PathType`s, children on a picker and an absurd width.
- **T0/T1** also cover the `<!-- Do NOT edit this file manually -->` header that every generated
  `.axaml` now starts with: the scaffolded projects still `dotnet build` 0/0 and the host still
  renders them, so the notice is harmless to the compiler and the previewer.
- **Follower bindings** are covered by `t2-logic/follower.test.js` (**40** checks): the `.adset` record,
  the generated VB/C# `ColumnFollower` line, its position after the grid wiring, idempotency and
  re-bind/un-bind, the picker's asset entries, and the two Code Fix rules (inline items + a stale
  follower whose column/grid is gone). The runtime mirroring itself was verified against a compiled
  `ColumnFollower` in a scratch project (initial load, insert, remove, in-place cell edit, Reset).
  The **C# value type** section generates the DataSet class with `generateCs` and asserts its
  nullable row properties against the follower's type argument — the `CS8603` guard added in beta.5
  (`String`/`Byte[]` columns must come out as `string?`/`byte[]?`, value types plain).
- **XAML header** is covered by `t2-logic/xamlHeader.test.js` (33 checks): the notice text, adding
  it once / idempotency / de-duplication, `<?xml?>`+BOM ordering, every generator (`buildAxaml`,
  `buildChromeAxaml`, scaffold `App.axaml`+`MainWindow.axaml` for C# and VB, New Form) and every
  designer save site, plus a parse/save round-trip that proves the notice is dropped by the model
  and re-stamped on save.

### Status 2026-09-13 — full suite green (3018 passed / 0 failed / 0 skipped, 37 s)

- **T2** gained three files:
  - `controlEvents.test.js` (**76** checks) — the generated catalog's shape, the default event and the
    curated picker list per control, the five names whose `EventArgs` differ per control, and the
    guarantee that the shipped **`Events per Control.md`** still matches the catalog (plus the
    preview's handler-attribute stripping going through the same data, so an event the picker offers
    can never be stripped off the render copy by mistake).
  - `toolbarGroups.test.js` (**48** checks) — the six toolbar categories, exactly which buttons each
    one owns (a button inserted in the wrong place silently joins the wrong group, so membership is
    pinned per heading), the fold/unfold wiring, and the CSS that makes the chip's caret and a folded
    group's separator behave.
  - `packaging.test.js` (**78** checks) — the marketplace manifest requirements (publisher, licence,
    repository, bugs, homepage, categories, keywords, engine range, semver, entry point), the icon
    really being a ≥128×128 PNG, the MIT licence text, the `.vscodeignore` rules **including the vsce
    negation trap**, both GitHub workflows, the missing-.NET-SDK message, and — after
    `GrumpyWhite.png` (the Activity Bar icon) was excluded as "artwork nothing loads" and the sidebar
    icon silently vanished — that **every file asset the manifest references** exists and is not
    matched by any ignore rule.
- **T3** grew the event chooser, the handler menu, the ⚠ badges, the ⚙ Settings dialog, the code-issue
  list with its alternatives, and a section that folds/unfolds the **real** toolbar markup.
- **T5** wires 8 catalog events through the VB matrix and still has to `dotnet build` 0/0.
- **CI** (`.github/workflows/ci.yml`) runs `tsc`, `node --check`, T2 + T3 and a real `vsce package` on
  every push; the full T0–T5 suite is a manual job because it needs the .NET SDK.
- **`packaging.test.js` gained the version-format guard** (**81** checks): valid semver is *not* what
  the Marketplace validates, so the manifest version is now asserted to be **plain numbers**
  (`^\d+(\.\d+){0,3}$`, at least one non-zero) instead of merely "valid semver" — that omission is
  what let `1.0.0-beta.7` reach the first upload before being rejected. `PUBLISHING.md` is asserted to
  document the rule too.
- **First Marketplace publish verified (2026-09-12)** — `grumpy.avalonia-designer` version `0.9.0`,
  and the stored `VsixSha256` equals the local VSIX byte for byte. Recorded in `PUBLISHING.md` part E,
  including the `flags` bit that reveals the not-yet-validated state.
- **Release `0.9.1` (2026-09-13)** — the performance and correctness pass, suite grown to **2786**
  assertions, published on the Marketplace the same day (hash-verified against the gallery, and the
  repo docs corrected to describe the listing rather than the intention). New sections: the `.adset`
  reader (its cache must never answer from a stale
  read), the
  first open of a new project, the System-qualified clock code, orphaned-handler cleanup, corrupt
  `.adset` handling, and webview sections for the pointer state, nudge coalescing, the properties
  scroll position and the context-menu placement. `npm run bench` (`tests/bench/hotpaths.js`) is a
  benchmark, not a test — the runner ignores it — and it exists so the hot paths have numbers to
  compare against after a change.
- **Release `0.9.2` (2026-09-13)** — the Publish/Install feature (`.deb` on Linux, MSI on Windows) plus
  the storage fix it exposed, suite grown to **3018** assertions. New coverage: `debBuilder.test.js`
  (118 checks) and `msiBuilder.test.js` (62) for the two packagers (control file, launcher, tree and
  modes, `--root-owner-group`, MSI version clamping and the stable `UpgradeCode`, the WiX source),
  the `packageState`/`watchForPackage` state machine behind the Install button, webview sections for
  the publish/install buttons and their tooltips, generator assertions that the per-user
  `RuntimeStorage` helper is emitted (and omitted when nothing persists), and eight `codeFix`
  assertions for the new "writes into the app's own folder" finding (single-line, multi-line,
  read-only, two writes on one line, `SqliteConnection`, VB). The generated C# *and* VB were also
  compiled in scaffolded projects for a DataSet with a SQLite grid table plus an XML table — 0 errors /
  0 warnings — which is what proves the helper is emitted wherever something references it. Live on the
  Marketplace the same day: `0.9.2` on the listing, with the gallery's `VsixSha256` equal to the local
  VSIX byte for byte.
- **Release `0.9.46` (2026-09-16)** — the ⚙ panel now says what it is waiting for (*"it takes a while …
  show a loading message"*). No new file: the T3 webview section grew the wait line at dialog open and at every
  state request, the state clearing it, a failure surviving the state *and* the status posted after it, and the
  `checking…` line being cleared by the report that answers it — while T2 pins the parts jsdom cannot see: that
  **exactly one** call site in `media/designer.js` still asks for a state (the helper), that opening the dialog
  starts the wait, that a result zeroes the wait so its text cannot be wiped, that the line lives inside the AI
  body, and that the extension logs how long the model-list call took (`asked in … ms`). The measurement the
  whole change rests on is recorded in `NOTES.md` §129 — including the two explanations that were tested and
  dropped before the right one (the `lms` CLI's first call starts LM Studio's service; probe 18:18:37, service
  processes 18:18:40).
- **Release `0.9.45` (2026-09-16)** — **Vulkan as an optional backend for the built-in runtime**
  (`assistant.bundledBackend`, *AI: Built-in Runtime Backend…*), CPU by default, plus the second round of ⚙ dialog
  height work. `tests/t2-logic/vulkanBackend.test.js` (103 assertions) covers what can be decided without a GPU:
  what the setting means (only the word `vulkan` — `gpu`, `vulkans` and a wrong type are all the CPU build), the
  argv (the build is *always* stated, like `--gpu-layers 0`), the two-attempt plan and the fact that the
  fallback message is not awaited, what `/health` is allowed to claim (including "Vulkan was asked for but
  llama.cpp used the CPU build"), the **C#** source where the C# is the decision (CUDA `false`, Vulkan `false`
  by default, `WithAutoFallback(true)`, the two facts recorded as the log lines arrive rather than read back from
  a buffer, and the no-double-hyphen rule an XML comment needs — that one failed the build), and the two hint
  sentences by *length* with the Chromium measurement in the message. The layout guards in `aiPanel.test.js`
  gained the four declarations the second measurement paid for and a guard against a `min-height` floor (the
  trap §127 named: the Save row is sticky and last in flow, so a floor leaves dead space *below* the buttons).
  Two guards were updated with their reason, not relaxed: the exact sidecar argv and the webview's GPU hint.
- **Release `0.9.44` (2026-09-16)** — the ⚙ Settings dialog capped to the window (`calc(100vh - 8px)`, tighter
  rhythm inside it only) and **`tools/measure-settings-panel.py`**, a tape measure that renders the dialog's real
  markup and stylesheet in Chromium and exposes `window.__measure()`. No new assertions beyond the layout guards
  in `aiPanel.test.js` (the viewport cap, `overflow-y: auto`, the pinned Save row, the panel's own width) — and
  deliberately so: jsdom has no layout engine, so a *test* could not have answered the question that was asked.
- **Release `0.9.43` (2026-09-16)** — **house rules**: the idioms the developer's own code follows, kept in
  `assistant.conventions` and added to every request, learned with **AI: Learn the House Rules from My Code…**
  (or the button in the ⚙ panel). `tests/t2-logic/conventions.test.js` (90 assertions) is mostly about
  *restraint*: the two gates (`MIN_SAMPLES = 5`, `MIN_SHARE = 0.8`) as behaviour (a 3-member file gets nothing;
  a 50/50 codebase gets no brace rule at all), the evidence that travels with each suggestion, language
  isolation (a csharp-only project produces no VB rules), the prompt position in all three prompts, and the
  wiring of the panel, the palette command and the manifest. The fixtures are real Avalonia code-behind in the
  shapes this extension generates.
- **Release `0.9.42` (2026-09-16)** — the user's own **`llama-server`** became an engine the extension can
  start: `AI: Start My llama-server…` / `AI: Stop My llama-server`, a `My own llama-server` entry in the panel
  (with the context/GPU fields mapped to `--ctx-size`/`--n-gpu-layers`), and two settings (`llamaServerPath`,
  `llamaServerArgs`). `tests/t2-logic/llamaServer.test.js` (102 assertions) pins the pure decisions — where the
  binary is found (a path the user set, then PATH, then the usual build folders), the exact argv in llama.cpp's
  own spellings (and that the sidecar's `--ctx`/`--gpu-layers` can never appear in it), which early exit is
  worth retrying, the four `/health` verdicts, and the identity check for a server that is **already running**.
  The fixtures are real answers captured from this machine on 2026-09-16: the developer's own llama-server runs
  as a systemd user service on port 8080, so `--version` (`version: 10365 (9afff1b74)`), `/health`, `/v1/models`
  (`owned_by: "llamacpp"`, `meta.n_ctx`) and `/props` (`model_path`, `build_info`) are quoted verbatim — with
  LM Studio's answers (`owned_by: "organization_owner"`; a **200** `/props` carrying an error body) as the
  negative pair that proves nothing is detected just for answering. Three existing guards were updated with
  their reason rather than relaxed: `aiPanel.test.js`'s choice count and the webview's
  `aiOptTtl.hidden = bundled` assertion (the row is now hidden for the whole `layerCount` group), and
  `unloadRuntime.test.js`, where the new *"a llama-server you started is still running"* branch made a machine-
  dependent test possible — that probe is now patched like the process-spawning functions. Suite **4202**.
- **Docs (2026-09-16)** — README, USER_MANUAL and CHANGELOG brought up to 0.9.41: the
  Code Fix rules aimed at generated code, the model-list order and the Hub row, the `Hugging Face` kind.
- **Release `0.9.41` (2026-09-16)** — **AI: Add a Model from Hugging Face…** (paste a page or file URL, pick the
  `.gguf`, size + SHA-256 read from the Hub's own `?blobs=true` answer, then the existing verified download) and
  **AI: Forget a Model Added from Hugging Face…**; added models live in `user-models.json` next to the weights as
  ordinary `ModelSpec`s, so picker/load/gate/Remove Model treat them identically. The picker is also regrouped —
  bundled llama.cpp, then a server you run, then LM Studio, then loose files — after the user found a llama.cpp
  server answered faster and better than the LM Studio models. `tests/t2-logic/hubModels.test.js` (36
  assertions) pins the URL shapes, the Hub answer shape (the one read by hand earlier the same day), the derived
  RAM gate, the fact that an added spec has exactly a built-in spec's keys, and the new order. Two existing
  guards were updated rather than deleted: the old "custom is last" assertion, and the URL guard now requires
  the Hub URLs to live in `modelSpecs` (`hubApiUrl`/`hubResolveUrl`). Suite **4081**.
- **Release `0.9.40` (2026-09-16)** — the Code Fix checker was extended to the code the model writes, and now
  runs right after every write (both diff modes). New deterministic rules: a handler nothing calls (with a Fix
  that wires it, sharing the AI side's attribute edit), a name that is not a control of the form but starts like
  one (`Status` / `StatusDate1`, report-only), a duplicate member in C# (`CS0111`, reusing the VB rule's
  `remove-duplicate-method` fix), a class *or* namespace declared inside a class (`CS1513` shape, Fix unwraps and
  keeps the members) and unbalanced braces (Fix closes them at the end). `tests/t2-logic/codeCheckGenerated.test.js`
  (40 assertions) drives real files in a temporary project, including the verbatim pasted-wrapper damage from the
  user's app, and asserts the report is empty again after each repair. Suite **4043**.
- **Release `0.9.39` (2026-09-16)** — a model answered a "create a function" request with a whole
  `namespace`/`class`, and it was inserted inside the existing class (`CS1513` in the user's app). Three layers
  now prevent it: the prompt forbids the wrapper in words, `unwrapMemberBlock()` removes one before the diff
  (refusing an answer that declared several members, since the model chose those names), and `insertMember`
  strips as a backstop. T2 pins the **verbatim** broken answer from the user's file, the two-member refusal, the
  VB `Namespace`/`Class` case, a clean answer left untouched, and a local class inside a method *not* being
  mistaken for a wrapper. Suite **4003**.
- **Release `0.9.38` (2026-09-16)** — the description dialog is planned against the model's window: the room
  is the window minus the answer budget (`promptRoom`), the parts are weighed and the optional ones dropped in
  a stated order with the drops named in the log (`fitPromptParts`), and the sentence's allowance
  (`descriptionAllowance`, capped at 400 tokens) is shown while typing and **refused** when exceeded. Required
  parts that cannot fit refuse the whole request with the numbers. External servers are exempt on purpose. T2
  covers the arithmetic (a roomy window keeps everything, 251 tokens drops the style sample only, 151 drops
  both, 100 overflows the required parts, the allowance never goes negative and is capped, tokens *and*
  characters are shown) and guards that both dialogs share the one box and that dropped parts really leave the
  prompt. Suite **3985**.
- **Release `0.9.37` (2026-09-16)** — the ⚙ panel gained **"show the proposed code as a diff"** (off = the
  code is written straight in, one undoable edit, the same rules first), and the token budget was fixed: the
  bundled window (4096) and the answer budget (4096) could not both hold a prompt, which is how a 12B model
  answered with *0 characters*. The prompt is measured and the answer gets the remainder; every request and
  outcome is logged with its sizes, and the runtime's own last lines are quoted when an answer is empty. T3
  covers the switch (default on for a state that forgot the field, the hint that explains "no diff", and the
  Save payload); T2 covers `estimateTokens`/`answerBudget`/`contextForBudget`, the empty-answer wording with
  the prompt and window in it, and the guards that keep the diff and non-diff paths on one implementation.
  Suite **3962**.
- **Release `0.9.36` (2026-09-16)** — *AI: Implement in Function…* branches on the caret: inside a method
  the model rewrites it (unchanged), outside every method it writes a **new** member at the caret —
  `private`, `static`/`Shared` only where the body provably needs no instance state or form control,
  optional `using`/`Imports` added after the last one, and a **refusal** (never a replacement) when the
  name already exists, checked both on the sentence and on the answer. A new `<Control>_<Event>` member
  offers to wire the event into the form. `tests/t2-logic/implementMember.test.js` (99 assertions) drives
  the whole pure core — prompt, answer parser, member/type scanning, the exact inserted text (blank lines,
  indentation, CRLF, BOM, nested classes), the C#/VB visibility rules, the usings anchor and the XAML
  attribute edit — and guards the command's refusals against the source. Suite **3940**.
- **Release `0.9.35` (2026-09-15)** — three features in one change set: **Remove Model** (deletes the selected
  built-in model's weights plus its `.part`/`.verified` markers, after a host-side modal that names the file;
  stops the runtime first if that model is in use and clears the pin), a **fifth download**
  (`gemma-4-coder-12b-q4`, 6.9 GB, community GGUF of `google/gemma-4-12B-it` — size and SHA-256 re-read from
  the Hub before pinning), and a **foldable ⚙ Settings dialog** (Code check folded, AI assist expanded, state
  remembered per tab through the webview state). `removeModel.test.js` drives the first one against a
  temporary `globalStorage` with the modal and configuration stubbed — including the case that matters most:
  a delete that does **not** take (a directory cannot be unlinked, the same failure a runtime holding the file
  open produces) must be reported as a failure and must keep the pin. The T3 layer gained the fold behaviour,
  building the two `.settings-section` wrappers as `designerPanel.ts` emits them, since the jsdom fixture is
  flat. `currentSelection` no longer falls back to `MODEL_SPECS[0]`, and the empty-picker note stopped telling
  the user to press *Refresh list*. Suite **3841**.
- **Release `0.9.34` (2026-09-15)** — *Unload* only ever ran `lms unload --all`, LM Studio's command, so for a
  built-in model it was a no-op that reported success: the sidecar kept the weights and the picker kept its
  `● in use` marker (reported minutes after 0.9.33 fixed pinning). It now stops the extension's own runtime as
  well, says which of the two it freed, and treats "LM Studio is not installed" as *nothing of its to free*
  rather than a failure. Tests drive all four branches with the module functions replaced — and **restored in a
  `finally`**, because the runner shares one process. Suite **3762**.
- **Release `0.9.33` (2026-09-15)** — **the cause of the whole "the picker reverts" saga**:
  `OptimisedCSTest/.vscode/settings.json` contained `"avaloniaDesigner.assistant.backend": "external"`, a
  *workspace* setting, and workspace values beat global ones — so every `backend: bundled` the panel saved was
  shadowed. The extension read the **effective** value and honestly displayed "let the server decide", while the
  load, the runtime and the log were all correct; it also explains why the two LM Studio models worked in that
  project and the two built-in ones never could. All AI settings now go through one `configView()` whose `update`
  writes to the scope that already supplies the key (folder → workspace → user), as VS Code's own Settings UI
  does. `writeTargetFor()` is pure and asserted for all four scope shapes. Suite **3748**.
- **Release `0.9.32` (2026-09-15)** — every open designer panel is kept in step, not only the last one that spoke
  (`attachPanel` remembered a single panel), and a tab that becomes visible re-asks for the state. The picker also
  stopped falling back to the first entry when a state carries no selection, and the webview reports what it
  applied (`Panel applied: wanted=… shown=…`) next to the extension's `Load finished … selection=…`. Suite
  **3738**.
- **Release `0.9.31` (2026-09-15)** — the load/unload result now **carries the panel state with it**, because
  `postMessage` may resolve `false` (a queue is not a contract) and the panel would then show the outcome while
  keeping a picker from before the load. `logs/ai.log` also records what the panel was told and what it saved.
  Suite **3730**.
- **Release `0.9.30` (2026-09-15)** — all four paths that change the model tell an open panel (the palette's
  built-in and custom-address branches return early, which is how they were missed); the status refresh is
  `quiet`, so it updates the box without popping it open. Suite **3727**.
- **Release `0.9.29` (2026-09-15)** — every picker entry says where it comes from and what Load will do with it:
  `LM Studio · in My Models, ready to load`, `… added to LM Studio first (a symbolic link — your file stays where
  it is)`, `… served by the extension's own runtime (no LM Studio needed)`. Answers *"why do models that are not
  in My Models not work?"* on screen. Suite **3724**.
- **Release `0.9.28` (2026-09-15)** — LM Studio's own jargon (*"Engine protocol runtime llama-server …
  signal=SIGABRT"*) now reads as a sentence: its log held `radv/amdgpu: Not enough memory for command submission`
  → `ggml_vulkan: device lost on Vulkan0` → `vk::DeviceLostError`, at **0 % offload**, because the **Vulkan** build
  of llama.cpp was selected and an iGPU shares system RAM with the model (11.4 GiB of "VRAM" for a 16.5 GB
  working set). Also: the `lms` command line is now logged when a load *fails*, not only when it succeeds — that
  gap cost three manual reconstructions. Suite **3721**.
- **Release `0.9.27` (2026-09-15)** — the 17.7 GB model aborted because LM Studio passes `--mlock` (its "Keep
  Model in Memory" option) and this machine allows only 3.78 GB locked. Verified at the source: `google/gemma-4-e4b`
  carries its own load config with `llm.load.llama.keepModelInMemory: false` — which is why it loads — while
  `qwen3.8-27b` has no per-model config, takes LM Studio's default, and aborts three times in four seconds.
  `lms load` has no flag for it, so the failure text now names the owner of the setting (LM Studio, not the
  extension), where to turn it off, and the system-wide alternative with its caveat. `--yes` (0.9.26) is what made
  this fail *fast and explained* instead of hanging on a prompt nobody could answer. Suite **3717**.
- **Release `0.9.26` (2026-09-15)** — every `lms load` passes `--yes`: a load that reaches LM Studio's resource
  guardrails gets a confirmation prompt, and the CLI runs without a terminal, so the child waited for an answer
  nobody could give (up to its 30-minute timeout) while the panel showed only "loading…". `lms import` always had
  the flag; `load` never did. Suite **3715**.
- **Release `0.9.25` (2026-09-15)** — reported after a real session: closing the IDE left the model resident
  (nothing owned its lifetime), and "the Qwen models does not work - Not downloaded???". Three logs proved
  the Qwen load *did* work — LM Studio loaded it and answered our own request in 11.6 s — so the failure was
  in the telling: every built-in entry was described as "downloaded once when you press Load Model", which
  is equally true of a 4.4 GB file that has never been fetched. The entries now state whether the weights are
  on disk (or partially, or not at all); `deactivate` frees every runtime (LM Studio via a detached
  `lms unload --all`, the sidecar via `stopModelServer`, and since 0.9.42 the user's own `llama-server` via
  `stopOwnLlamaServer`); the panel is refreshed after every request and when
  it regains focus (a server loads a model just-in-time, so a snapshot goes stale); and the whole `lms …`
  command line is logged. Suite **3713**.
- **Release `0.9.24` (2026-09-15)** — unloading left the panel and the status naming the model as loaded.
  Two bugs with one cause: the `aiUnload` handler never posted a fresh `aiState` (so the `● loaded` tag,
  which comes from discovery, survived the unload), and the status had **no line for what is in memory
  right now** — `Model: … (asked for by name)` describes the next request, and was still true and
  therefore useless after an unload. A `Loaded now:` line now sits under it, omitted when no source can
  answer (never "nothing is loaded" as a guess). `/loaded/i` was also still in the load-confirmation loop.
  Suite **3696**.
- **Release `0.9.23` (2026-09-15)** — the picker could display a different entry than the model in use
  (reported after a bundled 3B load that had in fact succeeded). Choice values are opaque strings and the
  picker does no index arithmetic, so it was not the off-by-one it looked like — but a `<select>` given a
  value it does not know silently keeps *another* entry selected, which is indistinguishable on screen. The
  panel now verifies the round trip, falls back to the entry's real index, or says so in the progress line,
  and a confirmed load re-requests `aiState` so a lost refresh cannot leave a stale selection. The fixture
  also stopped hiding an uncaught `TypeError` from `applyKindToOptions` (empty option rows vs the real
  `.ai-hint` spans): 8 exceptions, 0 failed tests, for nine releases. Suite **3679**.
- **Release `0.9.22` (2026-09-15)** — two bugs from real clicks: `/loaded/i` matched LM Studio's
  `not-loaded` state, so **every** model carried the `● loaded` tag (the user asked how more than one model
  could be loaded — it could not; the tag was wrong), and "never — keep loaded" sent `--ttl 0`, which `lms`
  rejects ("must be at least 1"), so the load failed and the model was never pinned. The panel now also
  states what is pinned in words, under the dropdown, including bundled models whose pin lives in
  `modelPath`. Suite **3665**.
- **Release `0.9.21` (2026-09-15)** — found by verifying the selection against the user's own app: a load is
  only "Loaded" once a test request has answered (the LM Studio path never proved itself), and the dropdown
  stopped showing the first model as selected when the settings really say "let the server decide". Suite
  **3665**.
- **Release `0.9.20` (2026-09-15)** — `Load Model` fixed (the webview's flat payload against the extension's
  `state.options.*`: a TypeError before any message, which is what "nothing happens" was), load arguments
  resolved before they reach `lms load` (`auto`/`-1` would be rejected), and Save no longer reopens the
  panel it just closed. New `tests/t2-logic/panelContract.test.js` (25 assertions) compares the two sides
  field by field. Suite **3643**.
- **Release `0.9.19` (2026-09-15)** — a load can no longer fail in silence: the panel reports every
  outcome, says whether a download is really happening, shows the seconds spent on long steps, admits when
  the extension itself has gone quiet, and writes `logs/ai.log` for failures that only happen on the user's
  machine. Suite **3616**.
- **Release `0.9.18` (2026-09-15)** — resumable model downloads with byte-level progress, an `http://`
  model address that works, the load options reaching the built-in runtime (`--ctx`/`--gpu-layers`), rows
  hidden where they cannot be honoured, and the `[hidden]`-loses-to-`display` fix. New
  `tests/t2-logic/modelDownload.test.js` (53 assertions) drives the real download against a real local
  HTTP server. Suite **3603**.
- **Release `0.9.17` (2026-09-15)** — the ⚙ Settings panel fits on screen: every modal is capped to the
  window and scrolls inside itself, this panel is 560px wide (scoped), its Save row is pinned, and the
  option values are no longer truncated. Found by measuring the real CSS + markup in Chromium, because
  jsdom has no layout engine — the three declarations that make it true are now asserted instead. Suite
  **3547**.
- **Release `0.9.16` (2026-09-15)** — the AI switch, model dropdown, load settings, Load/Unload buttons and
  the status report move into the designer's ⚙ Settings panel; switching models unloads the previous one;
  a bounded machine scan finds `.gguf` files (excluding `mmproj` projectors) and imports them by symbolic
  link. New `tests/t2-logic/aiPanel.test.js` (65 assertions, including a real scan of a temp tree).
  Suite **3539**.
- **Release `0.9.15` (2026-09-15)** — models that think before they answer: `reasoning_content` is read,
  
  shown as progress, logged and attached to the raw-answer tab, an empty answer is explained with its
  token counts, the default `maxTokens` rises to 4096, and the model wizard raises it itself when it
  measures thinking. New `tests/t2-logic/assistantThinking.test.js` (48 assertions) replays the **real
  captured stream** from `qwen/qwen3.5-9b`. Suite **3471**.
- **Release `0.9.14` (2026-09-15)** — setting up a local model becomes one command (`AI: Choose a Local
  Model…`: list LM Studio's models, pre-flight the load, load with recommended values, wire the settings,
  prove it answers). New `tests/t2-logic/localModels.test.js` (65 assertions) pins every parser against
  **real captured `lms` output**, plus the recommendations, the exact `lms load` argv and the wiring.
  Suite **3423**.
- **Release `0.9.13` (2026-09-14)** — the review decision becomes a code lens above the method, the
  status bar entry is coloured, the status dialog names the running version and leftover proposal tabs are
  closed at activation. New `tests/t2-logic/assistantReview.test.js` (35 assertions). Suite **3358**.
- **Release `0.9.12` (2026-09-14)** — the bundled runtime uses the model's own chat template (fixing
  the repetition that made answers unusable), prose is never accepted as code, a cut-off block is
  salvaged, and the raw answer is logged and openable. Suite **3323**.
- **Release `0.9.11` (2026-09-14)** — the review of a proposal survives scrolling: status-bar and
  diff-title buttons gated by a context key, a read-only content provider behind the diff (no save prompt)
  and an implicit save before *Build to verify*. Sixteen assertions, suite **3304**.
- **Release `0.9.10` (2026-09-14)** — the endpoint setting shows its default instead of an empty box;
  two assertions pin the manifest default and `DEFAULT_ENDPOINT` to each other. Suite **3288**.
- **Release `0.9.9` (2026-09-14)** — the status dialog got an embedding-model heuristic, a "Pin a
  model…" action and a "Copy" action, suite grown to **3286** assertions.
- **Release `0.9.8` (2026-09-14)** — the status check names the model that will answer, suite grown to
  **3278** assertions (nine of them for the wording of the `Model:` line: one model offered, several
  offered, server unreachable, none probed, a named model, and the two `bundled` cases).
- **Release `0.9.7` (2026-09-14)** — a readable Activity Bar icon, suite grown to **3269** assertions.
  Six of them are new and exist because the old glyph was invisible-faint while passing every check the
  suite had: `packaging.test.js` now decodes the PNG (a ~50-line reader over `zlib.inflateSync` with the
  five scanline filters, no dependency added) and asserts, for every PNG the manifest names as a view
  icon, that ink exists, that every ink pixel is pure white, that there is a **solid core** (≥ 30% of the
  ink fully opaque — the old file had 0%), that the background is still transparent, and that the glyph
  is neither clipped by its canvas nor off-centre. Verified by pointing the suite at the previous icon:
  it fails on exactly the two opacity assertions.
- **Release `0.9.6` (2026-09-14)** — the bundled local model runtime (`host/ModelHost`, NOTES.md §92),
  suite grown to **3261** assertions. The new `tests/t2-logic/modelSpecs.test.js` covers the model
  registry (unique ids, https URLs that really name the file, pinned 64-hex SHA-256s), the size and
  thread arithmetic, the exact sidecar argv, the health payload, the hardware gate per model, the
  settings for `backend: bundled` / `modelPath` / `threads`, and the wiring. Three assertions exist
  because they guard traps that only appear when a second project lives inside `host/`: the previewer
  host must exclude `ModelHost/**` from its compile items (otherwise two entry points), `.vscodeignore`
  must exclude **nested** `host/**/bin|obj/**` (the sidecar's own output holds llama.cpp for every
  platform, ~99 MB), and no `.csproj` may be ignored (the runtime is built from source on the user's
  machine). Two more drive the client against a real server to prove the new **inactivity** timeout: a
  token every 300 ms past the budget must succeed, a server that goes silent must fail.
- **Release `0.9.5` (2026-09-14)** — the local AI assist (tier 1), suite grown to **3136** assertions:
  `tests/t2-logic/assistant.test.js` drives the client against a throwaway `http` server (streaming SSE,
  a server that ignores `stream: true`, HTTP 500 with a body, a dead port, the model list) and covers the
  pure parts — settings normalisation and clamping, the hardware gate, the prompt builders, `extractCode`,
  the method-span maths for C# and VB, `methodTooLong` and the manifest wiring.
- **Unreleased — the local AI assist (tier 1)**, suite grown to **3136** assertions: the new
  `tests/t2-logic/assistant.test.js` drives the client against a throwaway `http` server (streaming SSE,
  a server that ignores `stream: true`, HTTP 500 with a body, a dead port, the model list) and covers the
  pure parts — settings normalisation and clamping, the hardware gate (no AVX2, low RAM, low free RAM,
  too few cores, unsupported arch), the prompt builders, `extractCode` (fenced block, prose-wrapped
  block, JSON, nothing usable), the method-span maths for C# and VB (including that a splice preserves
  line count, indentation, line endings and a BOM), `methodTooLong`, and the manifest wiring. One
  assertion is architectural: `src/assistant.ts` must not import `vscode`.
- **Release `0.9.4` (2026-09-14)** — a new extension icon (the badge with the black field outside its
  blue ring removed, now 128x128 transparent PNG) plus a white Activity Bar glyph derived from the same
  artwork, suite grown to **3025** assertions. New guards in `packaging.test.js`: the Marketplace icon
  must be **square** as well as at least 128x128, and every PNG the manifest names — the extension icon
  *and* the Activity Bar icon — is checked for the PNG signature, the minimum size and squareness. The
  sidebar icon used to be covered only by "the file exists and is not excluded by `.vscodeignore`",
  which would happily ship a 24x24 or squashed file.
- **Release `0.9.3` (2026-09-13)** — documentation only: the install instructions describe the stable
  releases, and the release workflow's `pre_release` input defaults to off. No code change, so the suite
  stays at **3018** assertions; the package's `README.md`, `USER_MANUAL.md` and `CHANGELOG.md` were
  diffed against the working tree after building, which is what proves a package carries the current
  docs.
