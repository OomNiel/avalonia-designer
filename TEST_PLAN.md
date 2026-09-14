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

Each step ends with the log green before the next begins.

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
