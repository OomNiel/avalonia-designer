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
- **Current: 1446 passed, 0 failed** (2026-09-03). Layer map + gotchas: NOTES_2026-09-03.md §6.

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
`snippet {tag}`→`snippetResult`, `render {xaml,width,height,projectPath}`→`frame {png,controls[],gridCells}`.

**Webview ↔ extension:** ext→webview `frame/properties/status/selectControl/armTool/clipboard/dotGrid/crosshair`;
webview→ext `ready/select/deselect/setProperty/drop/move/resize/delete/openEvent/cut/copy/paste/
moveToContainer/saveItems/saveGridDefs/moveToCell/browseFile/pickItemsSource/setDotGrid/setCrosshair/undo/redo`.

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

## 6. Current feature state (2026-09-03)

- WYSIWYG Avalonia form designer for VS Code: Toolbox → designer canvas (click-to-place/drag), Properties
  panel, alignment + multi-select, dot grid + snap-to-grid, shape controls (Line/Rectangle/Ellipse/Arc),
  DataSet designer, C#/VB project + form scaffolding (net10 + Avalonia 12, F5-ready), ChromeWindow custom
  title-bar tool, custom **crosshair** (§69: one toolbar button → settings popup; anchors on the pointer /
  control top-left while moving / the active handle while resizing).
- Suite green: **1446 passed**; PROBLEMS clean after every change.
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
