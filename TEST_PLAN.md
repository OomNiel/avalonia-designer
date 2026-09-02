# Test Script Plan — Avalonia Designer Extension

Date: 2026-08-30 · Status: **PREPARED — not yet run end-to-end** (fast layers smoke-tested green)

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
| **T2** | Extension logic probes | `node` + vscode stub → `XamlModel`, `codeBehind`, `propertyCatalog`, `assetCatalog`, `dataSetModel/Generator`, `projectScaffold`, `projectCreator`, undo/redo history | Model ops, code-behind generation/cleanup, property defs, asset scanning, .adset round-trips, generated code correctness |
| **T3** | Webview DOM tests | `jsdom` + stubbed `acquireVsCodeApi` → `designer.js`/`dataSet.js` interaction | Click-select, drag outline + drop, context menu, dropdown, modals, ItemsSource picker, shortcuts |
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

Each step ends with the log green before the next begins.
