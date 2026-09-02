# Avalonia Designer for VS Code — Developer Notes (lean)

> Quick-reference for continuing development. **Full per-feature history is in `NOTES_ARCHIVE.md`**
> (all 51 original sections, verbatim — do not edit). User docs: `README.md`, `USER_MANUAL.md`,
> `CONTROLS.md`. The Copilot **repo memory** (`/memories/repo/avalonia-designer-extension.md`)
> auto-loads each session and holds the authoritative cross-session gotchas.

---

## 1. Build & run

```bash
npm install                       # ws, @xmldom/xmldom, typescript
npm run compile                   # tsc → out/
dotnet build host/PreviewerHost.csproj -c Debug   # → host/bin/Debug/net8.0/PreviewerHost
```

- Press **F5** (`.vscode/launch.json` → preLaunchTask `build: all` = host + npm compile) to launch an Extension Development Host.
- The extension **auto-builds the host on first designer open** if the binary is missing **or any `host/*.cs` is newer than it** (`PreviewerHostManager.findOrBuildHost`) — so host fixes reach installed copies automatically.
- The host is a persistent child process on a free port (`PreviewerHost --port <n>`); killed on `deactivate()`.

### Packaging / installing
```bash
rm -f avalonia-designer-1.0.0.vsix && echo y | vsce package --out avalonia-designer-1.0.0.vsix \
  && code --install-extension avalonia-designer-1.0.0.vsix --force
```
- `vsce` needs an explicit `activationEvents` array when `main` is present.
- The `.vsix` does **NOT** bundle the compiled host binary (only `host/*.cs` + `.csproj`) — the installed copy auto-builds.
- `.vscodeignore` (NOT `.gitignore`) controls packaging: `tests/**`, `TEST_PLAN.md`, `NOTES.md`, `NOTES_ARCHIVE.md`, `SESSION.md` are excluded so the vsix stays small (~415KB); `README.md`/`USER_MANUAL.md`/`CONTROLS.md` are included.
- **Every extension change needs a VS Code window reload** to take effect.

### Automated test suite (repo root)
```bash
npm test                  # full suite (all layers incl. slow T0 10-project build matrix)
npm run test:fast         # T2 logic only    npm run test:webview   # T3 jsdom
npm run test:build        # T0 build layer   npm run test:preview   # T1 host
npm run test:runtime      # T4 headless      node tests/runner.js --file <name>  # single file
```
- Discovered `tests/**/*.test.js`; writes `tests/out/log.jsonl` + `report.md`; exit ≠ 0 on any FAIL.
- The vscode stub lives in `tests/stubs/vscode` (NOT `node_modules` — `npm install` prunes it).
- See §6 for the layer map + the key gotchas.

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
│   └── logger.ts
├── host/                     C# Previewer Host (net8.0, Avalonia 11.0.10)
│   ├── Program.cs            HttpListener WebSocket server (sync serve on main thread)
│   ├── XamlRenderer.cs       XAML → PNG + control bounds (+ gridCells) — 3 load strategies
│   └── ControlFactory.cs     default XAML snippets + control type map
├── resources/                ChromeWindow.cs/.vb + AnchorHelper.cs/.vb (bundled into new projects)
├── media/                    designer.{css,js}, dataSet.{css,js}, toolbox.svg, project.svg
├── tests/                    automated suite (runner.js, helpers/, t0–t5 layers) — see §6
└── package.json · tsconfig.json · .vscode/ · README.md · USER_MANUAL.md · CONTROLS.md · TEST_PLAN.md · NOTES_ARCHIVE.md
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
`snippet {tag}`→`snippetResult {tag,name,xaml}`, `render {xaml,width,height,projectPath}`→
`frame {png,width,height,controls[],gridCells,error?}`.

**Webview ↔ extension:** ext→webview `frame/properties/status/selectControl/armTool/clipboard`;
webview→ext `ready/select/deselect/setProperty/drop/move/resize/delete/openEvent/cut/copy/paste/
moveToContainer/saveItems/saveGridDefs/moveToCell/browseFile/pickItemsSource/undo/redo` (full list
lives in `designerPanel.ts` + `media/designer.js`).

**Behaviour notes:**
- Designer is **opt-in**: `.axaml` opens in the text editor; right-click → **Avalonia: Open in Designer**.
- **Auto-wire on placement:** dropping an interactive control immediately inserts its default
  event handler + code-behind stub (`hasDefaultEvent()` in codeBehind.ts; containers skipped).
- **Arm-tool:** clicking a toolbox item arms it (crosshair); the next canvas click drops at that point; Esc cancels.
- **Maiden-form hint:** the template's "Drop controls here…" TextBlock is auto-removed on first drop.
- **Grid:** dropping onto a Grid auto-places the child in the next free cell; dragging a Grid child
  re-cells it (see §6).

---

## 4. Key technical decisions & gotchas (IMPORTANT)

1. **No public string XAML loader in Avalonia 11.0.10.** `XamlRenderer` tries 3 strategies in order:
   (1) internal `IRuntimeXamlLoader` via reflection; (2) temp-file + `AvaloniaXamlLoader.Load(uri,uri)`;
   (3) programmatic builder from the XML. **The runtime loader fails broadly in this host** — grids,
   `<ListBox.Styles>` etc. fall to programmatic, so the programmatic builder must handle them faithfully
   (grid definitions, Grid.Row/Column, ListBoxItem compact sizing, images, chrome title bar).
   Pattern ported from the VB host `/home/niel/Projekte/Avalonia/DevHelper/DesignerHost/`.
2. **Namespaces:** `UseHeadless` + `AvaloniaHeadlessPlatformOptions` are in `Avalonia.Headless`; `UseSkia()` from `Avalonia.Skia`.
3. **Do NOT use `CaptureRenderedFrame`** — render with `new RenderTargetBitmap(new PixelSize(w,h), new Vector(96,96))` + `rtb.Render(window)` (no dispatcher pump).
4. **Headless window is stuck at 1024×768** — force the design size via reflection on the internal `TopLevel.ClientSize` setter.
5. **Control identity is by NAME, not index** (the logical-tree DFS includes internal nodes). `XamlModel.ensureNames()` auto-names every non-root control `_TagN` before render; `serialize(forSave=true)` strips them. `name:null` = root.
6. **`serialize(forSave)` is the render-vs-save switch:** `serialize(false)` (render) STRIPS event attributes (`EVENT_ATTRS`) — the host can't resolve handlers; `serialize(true)` (save/undo) keeps them. Mixing them up makes attributes look "dropped".
7. **`DataGrid` type is in namespace `Avalonia.Controls`** (assembly `Avalonia.Controls.DataGrid`). The snippet uses a `dg:` prefix and the root must declare `xmlns:dg="using:Avalonia.Controls"` (auto via `addControl`).
8. **tsconfig:** `@xmldom/xmldom` types need `"DOM"` in `lib`; `@types/vscode` requires `saveCustomDocumentAs()`; use `module`/`moduleResolution: "node16"`.
9. **Move/resize:** on a `Canvas` parent, move sets `Canvas.Left`/`Top`; elsewhere `Margin`; resize always sets `Width`/`Height`. All 8 resize corners share one formula with the webview drag outline.
10. **Avalonia 11 has NO `Visibility` — use `IsVisible` (bool).**
11. **Code-behind discovery** must match BOTH conventions (`<Name>.axaml.cs|vb` and `<Name>.cs|vb`) and prefer the sibling file that already declares the form's class (e.g. DevHelper/`create-avalonia-vb` declares `MainWindow` inside `Program.vb`). VB code-behind must `Imports Avalonia.Controls` and define `InitializeComponent()` via `AvaloniaXamlLoader.Load(Me)`; XAML `x:Class` must be fully qualified (VB root namespace).
12. **Property catalog is verified against the real assemblies** (reflection dump). Font props exist ONLY on text-capable types (panels/Border/Image have none); `CornerRadius`/`Padding`/`BorderBrush` are TemplatedControl-only. Window-derived roots (incl. `chrome:ChromeWindow`) resolve to the Window prop set + `TitleBarTitle`/`TitleBarIcon`.
13. **VB gotcha (ChromeWindow):** a global-namespace VB class must NOT `Imports AvaloniaChrome`; `Inherits AvaloniaChrome.ChromeWindow` fully-qualified (BC40056/BC30002).
14. **Host frame JSON is CAMELCASE** (`name/type/x/y/width/height/parent/values`, `gridCells`) — tests/consumers must not use PascalCase.
15. **`Grid.ShowGridLines` + cell layout need real RowDefinitions/ColumnDefinitions** — the programmatic builder parses them (§6).

---

## 5. Adding a new toolbox control — MUST-DO checklist

1. `src/controlInfo.ts` → `ControlInfo {label, desc, use}` (plain language — help panel + tooltip).
2. `src/propertyCatalog.ts` → `CONTROL_PROPS[tag]` + `KEY_DEFAULTS` (kind/unit/desc) + `ADVANCED_KEYS`/`advanced`.
3. `src/codeBehind.ts` → `DEFAULT_EVENT` entry if it has a natural event (powers auto-wire).
4. `src/newForm.ts` → extend/add a quick-start template if it fits a common form.
5. `host/ControlFactory.cs` → snippet + type-map entry (if the programmatic builder must render it).
6. Rebuild → package → reinstall → window reload.
- **StatusBar does NOT exist in Avalonia** (verified 11.0.10/11.2.1/12.1.1) — the tool inserts `<Border><TextBlock/></Border>` docked bottom; a generated-name special case (`isStatusBar`) shows "Status Bar" props.
- **Every new toolbox control must also be covered by the test suite** (T5 matrix auto-discovers from the catalog).

---

## 6. Current feature state — Grid & test suite (2026-08-31)

### Grid (rows/columns + re-cell + grid lines)
- **Rows & Columns editor:** selecting a Grid shows a `Rows & Columns` button → modal (add/remove rows & columns, size each `Auto`/`*`/`n*`/pixels). Writes `<Grid.RowDefinitions>`/`<Grid.ColumnDefinitions>` via `XamlModel.setGridDefinitions`. `propertyDefsFor` offers `Grid.Row`/`Grid.Column` dropdowns to children of a Grid.
- **Auto free-cell placement:** `addControl`/`moveTo` into a Grid assign `Grid.Row`/`Grid.Column` to the next free cell (`XamlModel.nextFreeCell`, row-major, honors spans). **GOTCHA:** compute the cell BEFORE `appendChild`, or pass the element as `ignore` — otherwise the new element (no Grid.Row/Column → 0,0) marks cell 0,0 occupied.
- **Grid lines render in the preview** because the programmatic builder now parses the definitions (native `ShowGridLines` only draws when the Grid has real definitions). `Grid.Row/Column/RowSpan/ColumnSpan` are applied in `ApplyProperty`.
- **Drag-to-re-cell:** host reports `control.parent` + each named Grid's `gridCells` (col/row boundaries, window coords, via reflection on internal `DefinitionBase.FinalOffset`). Webview: selecting a direct Grid child enables a re-cell drag — live target-cell highlight (`.cell-highlight`), on drop posts `moveToCell {name,row,col}` → extension sets `Grid.Row/Column`. Non-Grid children drag normally.
  - **GOTCHA (FinalOffset):** `FinalOffset[i]` (i≥1) is the boundary AFTER definition i-1; `FinalOffset[0]` is degenerate. Boundaries = `[0, FinalOffset[1..n-1], size]`.
  - **GOTCHA (host reply):** `Program.cs` `render` returns an anonymous object — new `FrameResult` fields must be added there explicitly.

### Image-in-Grid auto-sizing (§52)
- **Placement sizes the Image to its cell:** dropping an Image into a Grid cell, or moving one into a Grid via **Move to container…**, now sets its `Width`/`Height` to the target cell's pixel size (instead of keeping the 100×100 snippet default).
- **Mechanism:** `XamlModel.sizeElementToGridCell` (Image + direct Grid parent → read `Grid.Row/Column` → cell px from `gridCellPixelSize(v,h,row,col)` helper) is called in the designerPanel `drop` and `moveToContainer` cases via `gridCellsFor(doc, el)` which reads `this.frames` → `frame.gridCells[gridName]` (pre-placement boundaries; correct for star/Auto cells). `FrameResult.gridCells`/`HostControlInfo.parent` added to the TS types.
- **Host fix (Image in a real Grid cell renders 0×0):** injecting the Image `Source` AFTER layout (via `ApplyImageSources`) left Grid-cell Images arranged at 0×0 in the headless preview (Canvas/StackPanel/single-cell were fine; any Grid with real definitions was broken). **Fix: resolve the `Source` at creation time** in `CreateControlFromElement` (static `CurrentProjectPath` → `ResolveAssetPath`) so the Grid measures/arranges with the bitmap present. A sourceless Image still has no size (matches runtime).

### Dynamic Image-in-Grid sizing + Dock-in-Grid (§53)
- **An Image in a Grid cell dynamically follows its cell size.** `XamlModel.syncImagesToGridCells(cells, skipNames?)` (called in `designerPanel.render()` after every frame, with one guarded follow-up render when anything changed) updates every direct-Grid-child Image's `Width`/`Height` to its cell's CURRENT pixel size from the frame's `gridCells` — so when the grid is resized, rows/columns change, or the form resizes, the Image keeps filling its cell. Converges (second pass finds sizes already correct).
- **Opt-out: `Auto-size to Cell` property.** An Image in a Grid shows an **`Auto-size to Cell`** dropdown (True/False, default True). Set to **False** → the Image keeps the manual size the user sets; the sync skips it (name in the skip set), and drop/move-to-container also leave it alone. The choice is NOT a XAML attribute (Avalonia would reject it) — it's stored in the extension's `globalState` (`autoSizeOff`, keys `docUri::controlName`), so it survives reloads but isn't part of the file.
- **Dock is hidden for Grid children** (user-approved): `propertyDefsFor` filters `DockPanel.Dock` + `Canvas.Left`/`Canvas.Top` for direct Grid children (`inGrid` filter) — a Grid child's size/position is managed by its cell, so Dock has no meaning there and would conflict with cell auto-sizing.
- **Defensive guards:** `ensureDockPanelParent` only wraps/docks controls in a **free-positioning context** (Canvas or window root) — a control inside a Grid/StackPanel/… stays where its container put it. The `setProperty` Dock branch keeps a Grid child in its cell (only 'None' strips a stale attribute).
- **Grid.Row/Grid.Column for nested Grids:** a Grid placed inside a Grid gets `Grid.Row`/`Grid.Column` dropdowns + the `Rows & Columns` button (catalog test locks it in).

### Test suite (t0–t5)
| Layer | Checks |
|---|---|
| `t0-build` | tsc, media `node --check`, host build, **10-project C#/VB×template matrix** (slow) |
| `t1-preview` | host render probes: bounds, Body auto-fill, chrome title bar, ListBox compact/empty, avares images, **grid cells + lines** |
| `t2-logic` | xamlModel, codeBehind, propertyCatalog, assetCatalog, dataSet — pure Node |
| `t3-webview` | designer.js in **jsdom** (selection, drag outline, context menu, Items/grid editors, **drag-to-re-cell**) |
| `t4-runtime` | Avalonia.Headless net10 driver (real MainWindow: body-fill, resize, WindowState) |
| `t5-vbmatrix` | VB blank project: every toolbox control placed + every property exercised (render + compile) |
- Key test gotchas: host JSON is camelCase; `{NAMESPACE}` template replace must be global; jsdom `tagName` read-only (create the right element type); the webview DOM must mirror real nesting (`#canvasWrap > #canvas > …`) for event bubbling; a canvas click right after a drag is suppressed once — select via the control-list dropdown in tests; new modal ids MUST be added to the T3 `IDS` + `tagFor`.

### Image Rotate (§54)
- The Image control has a **`Rotate`** property (number, deg). It isn't a plain attribute — setting it writes `<Image.RenderTransform><RotateTransform Angle="…"/></Image.RenderTransform>` so the saved XAML compiles and the runtime rotates.
- `XamlModel.setImageAngle` writes/updates/removes the transform (0/empty removes it); `imageAngle` reads it. **`XamlModel.setProperty` routes `key === 'Angle'` → `setImageAngle`** so every caller (Properties panel, T5 matrix) writes the correct form. `propertyDefsFor` shows the value via `rotateAngleFor(el)`.
- Host programmatic builder applies the rotation (`vis.RenderTransform = new RotateTransform(angle)`) for `<X.RenderTransform><RotateTransform …/>` property elements — otherwise the preview wouldn't show it. **Avalonia rotates around the element CENTRE** (verified via pixel probe: a 90° turn of a 60×30 image reaches above its original top edge).
- **Rotated outline follows the image (§54 fix).** `RenderTransform` rotates the DRAWN visual but leaves the layout `Bounds` — so the selection box didn't match a rotated image. `CollectControls` now reports the **rotated axis-aligned bounding box** (transform the local rect's 4 corners via `c.TransformToVisual(window)`, take the AABB) instead of `Bounds`, so the selection outline surrounds the rotated image. **GOTCHA:** `c.Bounds` is in the PARENT's space while `TransformToVisual` expects LOCAL coords (origin 0) — use `new Rect(0,0,Bounds.Width,Bounds.Height)` corners or the position double-counts. `LayoutTransform` is NOT available on general controls in Avalonia 11.0.10 (not the fix). Verified: 100×80 at (100,100) → 90° reports 80×100 at (110,90), 45° reports 127×127 at (86,76), unrotated unchanged.

### Dot grid overlay + snap-to-grid (§56)
- **Always-on-top dotted grid** on the design surface with **Grid / Snap / Grid…** toolbar buttons. User decisions: toolbar toggles (Grid = show dots, Snap = snap-to-grid), config in **both** VS Code settings (`avaloniaDesigner.dotGrid.*`) AND an in-designer popup, **global** scope (all forms).
- **Settings** (package.json `configuration`): `avaloniaDesigner.dotGrid.{enabled, snapToGrid, spacingX, spacingY, color, dotSize}`.
- **Overlay** = a `#dotGrid` div inside `#canvas` (z-index 25, `pointer-events:none`, always on top): `background-image: radial-gradient(circle, <color> <size/2>px, transparent <size/2>px)` + `background-size: <spacingX>px <spacingY>px` — dots repeat on the grid, scales with the canvas zoom.
- **Flow:** `designerPanel.render()` sends `dotGrid` with the frame; toolbar toggles post `toggleDotGrid`/`toggleSnapToGrid`; the popup posts `setDotGrid` — each updates the GLOBAL config via `cfg.update(..., ConfigurationTarget.Global)` and replies with a `dotGrid` message.
- **Snap-to-grid** happens in the webview drag (`snapDrag`): the delta is adjusted so the target position/size lands on the grid, and the SAME snapped delta is used for the live outline and the posted move/resize — the outline and the applied result stay consistent. Re-cell drags are excluded (they snap to cells, not dots).
- **GOTCHA:** new webview elements (toolbar buttons, `#dotGrid`, `dotGridModal` + inputs) MUST be added to the T3 jsdom `IDS` + `tagFor` (inputs → `'input'`) or `els.*` throws at load and the whole T3 layer breaks.

### Alignment tools + multi-select (§57)
- **Multi-select** on the design surface, in service of alignment: **Ctrl+Click (Cmd on macOS)** toggles a control in the selection; **drag-box (marquee)** on the empty Body selects every control intersecting the drawn box. `state.selected` stays the **anchor** (the first-selected control); `state.multi` is a `Set` of all selected names. The anchor keeps the full selection box + resize handles; the others get lighter dashed `.multi-sel` outlines (`#multiSel` layer, z-index 19).
- **Marquee gotcha:** the locked `Body` Canvas always fills the form, so `hitTest` never returns null on empty space — the marquee starts when the pointer hits **the locked Body** (`!hit0 || hit0.locked`), not just `!hit0`. Locked controls are excluded from the marquee pick; the anchor is the control whose top-left corner is nearest the box's top-left.
- **Anchor semantics** (user: "align to the one selected first"): Ctrl+Click → the first control clicked is the anchor (removing it promotes the next); marquee → the control nearest the box's top-left. A plain click collapses the multi-selection to a single selection.
- **Edge alignment** — toolbar `⇤ ↔ ⇥ ⇡ ↕ ⇣` (Left/Centre/Right/Top/Middle/Bottom), enabled only with ≥ 2 selected. Webview posts `align {align, anchor, names}`; the extension computes each target's delta from `this.frames` bounds and calls `doc.model.move(el, dx, dy, bounds)` (Canvas.Left/Top for Canvas parents, Margin otherwise) — one `notifyEdit` + one render. **Excluded:** the anchor, locked controls (Body), and **direct Grid children** (user: "all controls except those placed into a Grid" — a Grid child is positioned by `Grid.Row/Column`). `centre`/`middle` align horizontal/vertical centres.
- **Align Text** — toolbar `Aa`, enabled when ≥ 1 selected control is a single-line text control. Posts `alignText {anchor, names}`; the extension sets `TextAlignment="Center"` on **TextBlock/TextBox** and `HorizontalContentAlignment="Center"` on **Button/CheckBox/RadioButton/ComboBox** (matches `TEXT_ALIGN_TAGS` in designer.js and the propertyCatalog control set). One `notifyEdit` + one render.
- **Buttons** (`btnAlignLeft/Centre/Right/Top/Middle/Bottom/Text`) enable/disable via `updateAlignButtons()` (called from `renderSelection`, which runs on every frame/selection change). Edge-align needs ≥ 2; Align Text needs ≥ 1 text control.
- **GOTCHA:** new toolbar buttons + `#multiSel` + `#marquee` MUST be added to the T3 jsdom `IDS` + `tagFor` and mounted inside `#canvas` (multiSel/marquee) or `els.*` throws at load.
- **GOTCHA:** after a drag (move/resize/marquee) the real browser fires a click that is suppressed once — T3 tests that dispatch pointer events must consume it with a no-op canvas click before testing click selection, or the next click is silently swallowed.

### Shape controls (§58)
- **New 'Shapes' toolbox category** with **Line, Rectangle, Ellipse, Arc** (`Avalonia.Controls.Shapes`). User decisions: line resizes like any control (8 handles, endpoints scaled); just the stroked Arc (no Sector); default look = **transparent fill + black 1px outline**.
- **Avalonia 11.0.10 gotcha — `Line` has NO `X1/Y1/X2/Y2`:** it uses `StartPoint`/`EndPoint` (`"x,y"`) and has **no Width/Height** — its size IS its geometry. So `Width`/`Height` are **hidden from the Properties panel for Line** (setting them would clip the line, not stretch it) and the resize path scales the points instead.
- **Line resize:** `XamlModel.resize` routes `Line` → `resizeLine`: computes the new box exactly like `resize` (Canvas.Left/Top or Margin on w/n, min 5px) then scales `StartPoint`/`EndPoint` **proportionally within the box** (`new = p * newW/oldW` — no origin-shift term, so an endpoint on the box edge stays pinned to that edge; a west drag moves the west edge while the east stays put). No Width/Height attributes are written.
- **Host:** `ControlFactory.cs` TypeMap + snippets (Line `StartPoint="0,0" EndPoint="120,80"`, Rectangle 120×80, Ellipse 100×100, Arc 100×100 `StartAngle="0" SweepAngle="270"`); `XamlRenderer.ConvertValue` gained **`Avalonia.Point` parsing** ("x,y") or the builder would drop Start/EndPoint and lines wouldn't draw. All four render with correct bounds (verified via pixel probes: black outlines + transparent centres).
- **Properties panel:** Line = Line Colour / Line Thickness / Line Ends (Flat/Round/Square) / Start Point / End Point; Rectangle = **Backcolor (Fill label)** / Line Colour / Thickness / Corner Radius X/Y; Ellipse = Backcolor / Line Colour / Thickness; Arc = Line Colour / Thickness / Start Angle / Sweep Angle. All shapes get the common layout props (Alignment, Margin, Opacity, …).
- **VB code-behind gotcha (REAL bug found by T5):** the VB accessor generator (`applyAccessors`) emits `Private ReadOnly Property Line2 As Line` — but `Line` lives in `Avalonia.Controls.Shapes`, so the VB project failed with **BC30002 "Type 'Line' is not defined"**. Fix: `applyAccessors` now adds `Imports Avalonia.Controls.Shapes` when any named control is a shape type (VB_SHAPES_NS). **C# needs NO import** — verified: a real C# 11.0.10 project with all 4 shapes + `Line1.StrokeThickness = 4` builds 0/0 with only `using Avalonia.Controls` (the XAML compiler emits fully-resolved field types).
- **Tests:** T1 +8 (all four shapes render: bounds + black outline pixel probes); T2 propertyCatalog +32 (per-shape props, Line has NO Width/Height/Fill, Fill labelled 'Backcolor'); T2 xamlModel +11 (Line resize scales points for SE/NW, non-zero StartPoint, zero-bounds guard); T2 codeBehind +5 (Shapes import added only when a shape is present); T5 matrix 19→23 controls (per-shape VB compile + the combined build gate). Full suite **1270 passed** (was 1084). tsc clean, host 0/0, PROBLEMS clean, packaged+installed (361KB). Docs: NOTES §58.

### Make same Width / Height (§59)
- Two new alignment-toolbar buttons **`⇔` (Make same Width)** and **`⇕` (Make same Height)** next to the Align Text button. Each resizes every selected control (except the **anchor** — the first-selected) so its **Width**/**Height** equals the anchor's.
- **Selection/scope** (user answers): **skip direct Grid children** (consistent with edge-align — the Grid positions/sizes its children) and **skip Lines** (a Line's size is its Start/End geometry; it has no Width/Height, so it can't take a size — the user chose to leave Lines unchanged rather than scale their points). The anchor is never modified.
- **Flow:** webview `postAlign('sameWidth' | 'sameHeight')` reuses the **`align`** message (`{type:'align', align, anchor, names}`); the extension's `case 'align'` gained a `isSizeAlign` branch: for each target (skipping anchor/locked/Grid-child/Line) it writes `Width`/`Height` from the anchor's frame bounds (clamped to min 5, only when the attribute actually changes), one `notifyEdit` + one render. Edge-align (`left`/`right`/…) is unchanged.
- **Webview enable/disable:** the size buttons need ≥ 2 selected AND at least one NON-anchor control that can take a size (type !== 'Line') — selecting only Lines disables them (edge-align stays enabled). `updateAlignButtons` computes `hasSizableTarget`.
- **GOTCHA:** new toolbar buttons MUST be added to the T3 jsdom `IDS` + `tagFor`.
- **Verified** end-to-end via a probe driving the real `AvaloniaDesignerProvider.handleMessage` with `align` sameWidth/sameHeight: `Other`(Button)/`Box2`(Rectangle) got the anchor's Width/Height (other dimension untouched); the `Line` and the Grid-child `InGrid` were skipped; the anchor unchanged. Tests: T3 +9 (buttons disabled with <2 / with only Lines; enabled with two Buttons; click posts `align` sameWidth/sameHeight with anchor+names). Full suite **1279 passed** (was 1270). tsc clean, node --check clean, PROBLEMS clean, packaged+installed (363KB). Docs: NOTES §59.

### Shape drag-point editing (§60)
- **User:** "The Line and Arc shapes are difficult to control. For Line, the ends of the line should be the drag (resize and anchor) points. An Arc has three drag points — the ends for resizing/anchoring and the centre for the radius."
- **Answers (askQuestions):** Arc end drag = **rotate around the centre at the current radius, the OTHER end stays anchored** (the sweep adjusts to keep it in place); Arc centre drag = **radius follows the pointer distance** from the centre (drag outward = bigger, inward = smaller; the centre stays fixed and the box scales around it).
- **Selection UI:** a Line or Arc now shows **draggable point handles** instead of the 8-handle resize box — Line: its two **ends**; Arc: **centre + two ends** (`.shape-handle` round dots in `#selection`). The Line selection has no box (just the two end dots); the Arc keeps a faint dashed box so its bounding box is visible. `#selection.sel.shape` removes the fill/border.
- **How the webview gets the handle positions:** the extension computes them in `render()` — `shapeHandlesFor(doc, c)` reads the shape's geometry from the model + the frame bounds and attaches `c.handles` (design coords) to each Line/Arc control in the frame. The webview does NO geometry math.
- **Line geometry (verified in the host):** a Line is drawn RAW at `Canvas.Left/Top + StartPoint/EndPoint` (no geometry translation — a negative StartPoint draws outside the reported bounds). Its reported bounds = `EndPoint` (the max corner). So handle `pos = bounds.xy + point`.
  - **Drag one end** → `setLineEnd {name, end, dx, dy}`: the dragged end's relative point += delta; **`normalizeLine`** then re-bases if the AABB min went negative (shifts Canvas.Left/Top by the min and subtracts it from BOTH points) — this keeps BOTH drawn ends at their absolute positions, so the anchored end stays put while the box stays well-defined (non-negative points, bounds = max).
- **Arc geometry (verified in the host):** centre = box centre; **0° = right, positive angles sweep CLOCKWISE (y-down)**; endpoint = `(cx + rx·cosθ, cy + ry·sinθ)`. Confirmed with 4 pixel probes (0→90 = bottom-right quadrant, etc.).
  - **Drag an end** → `setArcEnd {name, end, x, y}`: pointer angle around the centre = that end's new angle; the sweep is adjusted so the OTHER end's absolute angle is preserved (anchored). Start-drag: `StartAngle = angle`, `SweepAngle = (endAngle - angle + 360) % 360`; end-drag: `SweepAngle = (angle - start + 360) % 360`.
  - **Drag the centre** → `setArcRadius {name, x, y}`: radius = pointer distance from the centre; the box scales around the FIXED centre keeping the aspect ratio (Width/Height + Canvas.Left/Top updated), so a circular arc stays circular.
- **Webview drag:** `onPointerDown` on a `.shape-handle` starts a `shape` drag (Line end / Arc end / Arc centre); `onPointerMove` moves the handle dot to the pointer (+ a faint `#radiusGuide` line from the centre for Arc-centre drags); `onPointerUp` posts the message (Line: delta; Arc: pointer position). The arc redraws on the re-render after drop (no live arc preview during the drag — only the handle follows).
- **GOTCHAS:** (1) new webview elements MUST be in the T3 `IDS` + mounted in `#canvas` (`radiusGuide`); (2) the xmldom `element.attributes` is not iterable in probes (read known attrs via `getAttribute`); (3) T3 shape-drag tests dispatch pointerdown ON the handle element (bubbles to the canvas listener) and must consume `suppressClick` before later click-selects.
- **Verified** via a probe driving the real `handleMessage`: setLineEnd (+30,+20) → EndPoint 150,100 / StartPoint anchored 0,0 / position unchanged; setArcEnd start→59° → sweep 31 keeps the end at 90°; setArcRadius 100px out → box 200×200 centred on the fixed centre (angles preserved); shapeHandlesFor returns the correct Line ends + Arc centre/endpoints. Tests: T2 xamlModel +11 (lineEndpoints/setLineEnd/normalizeLine, arcGeometry/setArcEnd/setArcRadius incl. the 0°/90° convention + anchored-end sweep); T3 +16 (Line shows 2 handles / no 8-box; Arc shows 3; dragging an end posts setLineEnd/setArcEnd with the right payload; centre drag shows the radius guide + posts setArcRadius). Full suite **1315 passed** (was 1279). tsc clean, node --check clean, PROBLEMS clean, packaged+installed (368KB). Docs: NOTES §60 + CONTROLS.md Shapes note.

### Shapes render behind by default (§61)
- **User:** "All Shape items must render behind other controls (Send to Back) by default."
- **Mechanism:** the shape snippets (Line/Rectangle/Ellipse/Arc in `ControlFactory.cs`) now carry **`ZIndex="-1"`**, plus a defensive guard in the `drop` handler (a placed shape with no `ZIndex` attr gets `-1`). Avalonia honours `ZIndex` in the paint order — verified in the host: a red rectangle with `ZIndex="-1"` renders behind a later blue rectangle (and a later blue with `ZIndex="-1"` loses to an earlier red without one, i.e. -1 always loses to 0). So shapes sit behind every control (which defaults to `ZIndex=0`) both in the preview and at runtime.
- **Escape hatch:** the **Z-Index** property is already in the Properties panel (COMMON_PROPS) — set a shape to `0` or higher to bring it forward.
- **GOTCHA (probe):** sample the OVERLAP region correctly — earlier probes sampled a point inside only one shape and misread the result; also a Fluent Button's translucent background muddied a shape-vs-button test, so the z-order test uses two opaque rectangles.
- **Tests:** T1 +7 (the 4 shape snippets carry `ZIndex="-1"`; two overlap probes proving -1 renders behind). Full suite **1322 passed** (was 1315). tsc clean, host 0/0, PROBLEMS clean, packaged+installed (368KB). Docs: NOTES §61 + CONTROLS.md Shapes note.
- **BUG FIX (same day, user report):** "Place a TextBox first, then a Rectangle over it — left-click selects the Rectangle, not the TextBox." Root cause: `ZIndex="-1"` made the shape RENDER behind, but the webview's `hitTest` ignored ZIndex and picked the LAST control containing the point (the later-placed Rectangle won). FIX: (1) `render()` now enriches every frame control with its paint-order **`zIndex`** (parsed from the model's ZIndex attribute, 0 when unset — `HostControlInfo.zIndex` added); (2) `hitTest` now picks the control with the HIGHEST zIndex, ties → the later one (`(c.zIndex||0) >= (hit.zIndex||0)` while scanning in order = max zIndex, last on tie — matches Avalonia's child sort: ZIndex then collection order). A `ZIndex="-1"` shape never steals a click from a control over it; a shape brought forward (`ZIndex=1`) wins over a `0` control. VERIFIED end-to-end via a probe driving the REAL `render()` through the host: frame controls carried `{Root:0, Body:0, txtA:0, rectB:-1}` → the overlap hit-test picks txtA. Tests: T3 +4 (TextBox z=0 beats a Rectangle z=-1 over it; equal z → later wins; a shape brought forward to z=1 wins). Full suite **1326 passed** (was 1322). tsc clean, PROBLEMS clean, packaged+installed (369KB).
- **BUG FIX #2 (same day, user report):** "This is not ideal. Setting the Z-order to -1 makes the control un-selectable with a mouse click. Perhaps we could define shapes as being 'Containers'?" Root cause: the z-aware hitTest compared ZIndex across ALL controls — the locked **Body** canvas (z=0) fills the entire form, so a shape (`ZIndex="-1"`) **always lost to Body**, even where fully exposed → un-clickable. The "containers" idea isn't quite the mechanism (a container like Body is only clickable at empty points, and shapes ARE in a container); the real fix is to make hit-testing **hierarchy-aware** like Avalonia's own input hit-testing: a control is never beaten by its OWN ancestors (Body / Root / a containing panel) — an ancestor only wins when nothing inside it is hit. Siblings/unrelated controls still compare by ZIndex (higher wins, tie → later). FIX: `hitTest` builds a parent map from the frame's `parent` field (host already reports it) and walks it (`isAncestor`): if the candidate is an ancestor of the current hit → skip; if the candidate is a descendant → it wins; else compare zIndex. Now: a shape's EXPOSED area is clickable (it beats Body, its ancestor), the OVERLAP with a TextBox still goes to the TextBox (sibling z), empty space → Body, and a shape brought forward (z=1) wins. VERIFIED end-to-end via the real `render()` through the host: frame carried `{Root: parent=null z=0, Body: parent=Root z=0, txtA: parent=Body z=0, rectB: parent=Body z=-1}` → the hierarchy walk selects rectB at its exposed point and txtA at the overlap. Tests: T3 +2 (exposed shape clickable, empty space → Body — the block now sets `parent` on frame controls). Full suite **1328 passed** (was 1326). tsc clean, node --check clean, PROBLEMS clean, packaged+installed (369KB).

### User-reported bug-fix batch (§62 — 4 issues, 2026-09-02)
> "1) The colour dropdown lists only the current colour — the full range should be listed (5 max, then scroll). 2) Rectangle Properties should list only Corner Radius (not X and Y — they're always identical). 3) Opacity set in the designer (e.g. 50%) renders in the designer but the runtime shows 100%. 4) The extension keeps inserting `Imports Avalonia.Controls.Shapes` even when it exists, and adds an invisible U+FEFF character before an Imports line."

#### Issue 1 — colour dropdown only showed the current colour (fixed)
- **Root cause:** colour properties rendered as a text field + `<datalist>` (`ensureDatalist('designerColorList')`). The browser **filters datalist options by the typed value**, so when the field held the current colour, the dropdown showed just that one colour (or nothing).
- **Fix (`media/designer.js` + `.css`):** colour rows now render `[swatch][text][▾ palette button]`. The text field's `list` attribute was removed; a new **`openColorPalette(trigger, controlName, key, options, current)`** popup lists **every** preset colour (`options`) — plus the current value on top if it isn't a preset — as swatch-dot rows, **~5 rows visible then scrolls** (`max-height` ≈ 5×22+10px, `overflow-y:auto`). The popup `#colorPalette` is a single lazy-created, `position:fixed` element appended to `body` (fixed = never clipped by the Properties panel's own scroll). Picking a row posts `setProperty` and closes. It closes on outside click, **Escape**, or any scroll (`document.addEventListener('scroll', close, true)`). No load-time element → no T3 `IDS` change needed.
- **Tests:** T3 +10 (`palette` feature): ▾ opens the popup listing ALL options (not just current), a non-current colour is listed, picking posts `setProperty` + closes, a custom non-preset current colour is added on top, Escape closes. Webview: **145 passed** (was 135).

#### Issue 2 — one 'Corner Radius' for Rectangle (fixed)
- A Rectangle's `RadiusX`/`RadiusY` are **always identical**, so two separate rows were pointless. Now the Properties panel shows a **single `Corner Radius`** number field (designer-only key `'Radius'`).
- **`propertyCatalog.ts`:** Rectangle `CONTROL_PROPS` now has `{ key:'Radius', label:'Corner Radius', kind:'number' }` (no RadiusX/RadiusY rows); `KEY_DEFAULTS`/`DEFAULTS` updated (`Radius:''`); the value ternary in `propertyDefsFor` surfaces `RadiusX` (`getAttribute('RadiusX') || DEFAULTS['RadiusX'] || '0'`) so existing XAML with RadiusX/Y reads back correctly.
- **`xamlModel.ts`:** `setProperty` gained a `key==='Radius'` special case (mirrors `Angle`) — non-empty writes **both** `RadiusX` and `RadiusY`, empty/`''` removes both. This keeps the T5 VB matrix and the runtime from ever seeing a stray invalid `Radius` attribute.
- **Tests:** T2 propertyCatalog (Rectangle has ONE Corner Radius reading RadiusX, no RadiusX/Y rows; absent → defaults to `0`; Ellipse has none) + xamlModel (`setProperty('Radius','8')` writes RadiusX=8 & RadiusY=8, update to 16 keeps both in sync, `''` clears both, no stray `Radius` attr in serialized XAML). T5 drops 1 (Rectangle now one row) — expected.

#### Issue 3 — designer Opacity not honoured at runtime (VERIFIED — NOT a code bug)
- Full end-to-end probes (all in `/tmp`): (a) `Opacity="0.5"` survives BOTH `serialize(false)` (render) and `serialize(true)` (save); (b) the real `handleMessage` path (setProperty `Fill` then `Opacity`) saves `<Rectangle … Fill="#E02020" Opacity="0.5"/>` — correct; (c) the **designer host** (Avalonia 11.0.10) renders 50%-red-over-white as `#f09090` — correct; (d) a real headless **Avalonia 12.1.1** runtime app renders the same rect at 50% — correct (`Opacity` IS honoured by the runtime). The code pipeline is correct; no change warranted.
- **Likely real causes for the user:** a **stale app build** (didn't rebuild before running), the `.axaml` **not saved** before running, a second (text) editor open on the same `.axaml` overwriting the designer's unsaved edits, or an **old installed extension**. If it still reproduces after a window reload + rebuild, ask the user for the saved `.axaml`.

#### Issue 4 — duplicate `Imports Avalonia.Controls.Shapes` + stray U+FEFF (fixed)
- **Root cause (`codeBehind.ts` `applyAccessors`):** a VB file with a leading **U+FEFF** (external editor/tool wrote it) broke the `^Imports Avalonia.Controls…$` guards (the BOM'd first import line doesn't match `^Imports`), so every sync **prepended another import BEFORE the BOM** → duplicate imports + a stray invisible U+FEFF sitting right before an Imports line.
- **Fix:** `applyAccessors` now (1) detects a leading BOM (`charCodeAt(0)===0xFEFF`), strips **every** `\uFEFF`, (2) manages imports only when the accessor block is non-empty — it drops ALL existing exact `Imports Avalonia.Controls` / `Imports Avalonia.Controls.Shapes` lines (full-line anchored `/gm` regexes with `$`) then prepends exactly ONE of each needed (Shapes only when a shape control is present), (3) restores a single `\uFEFF` at the very front **iff** the file originally had one. This also **cleans up already-corrupted files**.
- **Tests:** T2 +10 (`vb-bom`): BOM'd fresh input → BOM preserved only at char 0, exactly one Controls + one Shapes import, accessor still added, no mid-file BOMs; an already-corrupted file (stray mid-file BOM + duplicated imports) → duplicates collapsed, BOM removed, imports ordered. Full suite **1362 passed** (was 1328). tsc clean, node --check clean, PROBLEMS clean, packaged+installed (370KB). Docs: NOTES §62.

### Properties sidebar pinned header / scrolling list (§63, 2026-09-02)
- **User:** "Restructure the Properties sidebar to always keep everything up to and including the 'Show advanced' checkbox visible, while allowing to scroll the property items list when required."
- **Before:** the whole `#props` panel was one scroll region (`overflow-y:auto`) — with many properties (or "Show advanced" on) you scrolled the header/selector/help away too.
- **Change (`media/designer.css`, pure CSS — no JS/HTML change):** `#props` is now `overflow:hidden`; the pinned stack (header `#propsHeader`, control selector `#controlListRow`, About-help `#helpPanel`, **Show advanced** `#propsToggleRow`, plus the empty-state `#propsEmpty`) all use `flex:0 0 auto` (helpBody keeps its own internal `max-height:130px` scroll), and **`#propsBody` is the ONLY scrolling region** (`flex:1 1 auto; min-height:0; overflow-y:auto`). Tab/List-item sections appended to `#propsBody` scroll with the list, as intended.
- **Tests:** T3 +3 CSS-regex guards (`#props` not a scroll container, `#propsBody` scrolls, `#propsToggleRow` pinned). Full suite **1365 passed** (was 1362). PROBLEMS clean, packaged+installed (371KB). Docs: NOTES §63.

### Colour palette fixes (§63b, 2026-09-02 — user report)
- **User:** "When trying to scroll the colour dropdown list, the list closes down prohibiting scrolling and picking a colour. Also the dropdown box should open upwards when its property is currently placed below the vertical middle of the main form."
- **Bug 1 (scroll-to-pick):** the popup's close-on-scroll listener (`document.addEventListener('scroll', close, true)`) also fired when scrolling INSIDE the popup's own list (`#colorPalette` has `overflow-y:auto`) — so any attempt to scroll to colour #31 closed the list. **Fix (`media/designer.js`):** the listener now ignores a scroll whose `e.target` is inside `#colorPalette` (`p.contains(e.target) → return`); scrolling anywhere else (the properties list / canvas) still closes it.
- **Bug 2 (open direction):** the popup always opened below the trigger (`top = r.bottom+4`), so a property low on the form dropped the list off the bottom of the screen. **Fix:** it opens **upwards** when the property row sits in the lower half of the window (`r.top > vh/2`) — or whenever there isn't enough room below (`r.bottom+4+ph > vh-8`) — clamped so it never goes above the top (`max(8, r.top-ph-4)`). Placement measures `pal.offsetHeight` (capped by the 5-row max-height) for the flip decision.
- **Tests:** T3 +5 (`palette`): scrolling the popup list does NOT close it; scrolling the properties list DOES close it; a trigger stubbed below the vertical middle opens the popup ABOVE the property. Full suite **1370 passed** (was 1365). node --check clean, PROBLEMS clean, packaged+installed (371KB). Docs: NOTES §63b.

### Ellipse hit-test "bug" — false alarm + regression coverage (§63c, 2026-09-02)
- **User:** "The Ellipse has the same issue the Rectangle had — if the ellipse covers another control, that control can't be clicked." Then: **"Correction, I was wrong about that observation."**
- **Finding:** the webview `hitTest` is TYPE-AGNOSTIC (bounds + hierarchy + zIndex), so an Ellipse shares the exact Rectangle fix from §61 — no code bug. Added permanent T3 regression coverage (`z-hit-ellipse`, +4): a Button (z=0) under a covering Ellipse (ZIndex=-1) still wins the overlap; the ellipse's exposed area is clickable (not stolen by the Body ancestor); two overlapping shapes at equal z → later wins, earlier selectable on its exposed area. No production change. Full suite **1374 passed** (was 1370).

### Lock the root layout panel (§64, 2026-09-02)
- **User:** "It is still possible to relocate/resize the root dockpanel. The root panel must not be resizable or movable. Lock its size and position to the current size of the form, or hide/remove its sizing handles."
- **Cause:** only the **Body** Canvas was locked (`isLockedBody`). The form's root content — `<DockPanel Name="Root">` wrapping the Body in blank forms (`rootContainer`) — had `locked:false`, so selecting it (from the control list) showed the 8 resize handles and allowed drag/resize.
- **Fix (`src/designerPanel.ts`):** new `isLockedStructure(model, name)` = `isLockedBody(...)` **OR** the element equals `rootContainer(model)` (the window's top-level content panel). Used for the frame's `locked` flag (so the webview hides handles + blocks drag + 🔒 badge) and in every move/resize/delete/cut/rename/move-to-container/align/alignText/setLineEnd/setArcEnd/setArcRadius guard (replacing `isLockedBody`). New `lockedLabel()` gives accurate toasts ("The Root DockPanel is locked — it can't be deleted."). Webview lock badge text generalized to "(Body / root panel)".
- **Note:** the root panel stays SELECTABLE (Properties still editable) but is fixed in place like the Body. `rootContainer` = first real content child of the window root, so it covers every template (DockPanel/StackPanel/Grid root). Verified blank-form structure via probe (Window → DockPanel `Root` → Canvas `Body`). Full suite **1374 passed** (unchanged; guards only). tsc clean, node --check clean, PROBLEMS clean, packaged+installed (371KB). Docs: NOTES §64.

### Select the FORM to resize it (§65, 2026-09-02)
- **User:** "How do I resize the form in the designer? … Yes add both please. Name it after its Title: e.g. 'Form - Title'." (i.e. add the form to the control drop-down AND make empty-space clicks select it.)
- **Context/finding:** the design surface size = the **Window's** `Width`/`Height` (`designSize`). The host reports the Window root with `name = null`; the drop-down and hit-testing both skip unnamed controls, so the form was NOT selectable in the designer — resizing required hand-editing the `.axaml`.
- **Fix:** the extension's `render()` now sends the form's **`formTitle`** (Window `Title`, falling back to ChromeWindow `TitleBarTitle`) with each frame. The webview:
  1. prepends a **"Form - <Title>"** entry (`value:''`) as the first control-list option (`populateControlList`, keyed on names + title so it re-labels after a Title edit); picking it → `selectForm()` → posts `select` with `name:null` → Window properties (Width/Height/Title/CanResize) show.
  2. **clicking empty design space** (the locked Body, or a gap on forms without one — `!hit || hit.locked`) now selects the form (`selectForm()`), not the Body (Ctrl+click on empty does nothing; the Body is still reachable from the drop-down).
  - Selecting the form shows **no selection outline** (it fills the canvas; you resize it via properties — there are no handles to drag/move the whole window).
- **Tests:** T3 +8 net (base drop-down now 5 options = 4 controls + Form; `form-select` block: first option value '' labelled "Form - My App", empty click posts `select` name null, form entry + real control both selectable via drop-down; z-hit empty-space expectation now = the form). Full suite **1382 passed** (was 1374). tsc clean, node --check clean, PROBLEMS clean, packaged+installed (372KB). Docs: NOTES §65.

### New projects are F5-ready (Linux-safe launch + build task) (§66, 2026-09-02)
- **User:** F5 on a VB project failed: `'TestVBApp.exe' does not exist`. Root cause: the debug `launch.json` came from the **vbnet-companion "VB.NET: Launch" snippet** — a WINDOWS template: `program = bin/Debug/net8.0/<name>.exe` (no `.exe` exists on Linux, and the project targets **net10.0**, so the folder is `net10.0`). Fix for that project was `type: coreclr` + `program: …/bin/Debug/net10.0/<name>.dll` + a default `build` task.
- **User:** "Yes please. Automate into the new project scaffold."
- **Change (`src/projectScaffold.ts`, both C# and VB):** every generated project now also writes
  - `.vscode/launch.json` — **`type: coreclr`** (standard .NET debugger from the C# extension; works on Linux/macOS/Windows) with `preLaunchTask: build` and `program: ${workspaceFolder}/bin/Debug/net10.0/${workspaceFolderBasename}.dll` (the BUILT assembly — never a `.exe`), plus an Attach config. The TFM folder comes from the `TARGET_FRAMEWORK` const so it can't drift.
  - `.vscode/tasks.json` — a default `build` task (`dotnet build`, group `build`/isDefault, `$msCompile`) so F5/Ctrl+Shift+B compile first (and, with the global `task.saveBeforeRun`, save all open files before building).
  - VB still also writes `.vscode/settings.json` (vbnetcompanion bridge) — unchanged.
- **Tests:** new T2 `projectScaffold.test.js` (+15) asserts, for cs and vb: launch.json + tasks.json exist, `type: coreclr`, program is the `net10.0` dll with no `.exe` suffix, `preLaunchTask: build`, default build task present (and vb settings.json still written). Full suite **1397 passed** (was 1382). tsc clean, PROBLEMS clean, packaged+installed (373KB). Docs: NOTES §66.
- **Portability fix (§66 fix 1 — machine-specific path):** the VB scaffold previously hardcoded `~/.vscode/extensions/roies.vbnet-companion-0.1.47/…` into every generated VB project's `.vscode/settings.json` (broken for other users / after an extension update). NOW: `ScaffoldOptions.vbBridgeDll?` carries the path, and `projectCreator.vbBridgeDllPath()` resolves it AT GENERATION TIME via `vscode.extensions.getExtension('roies.vbnet-companion').extensionPath` + the known `server/VBNetCompanion.LanguageServer/publish/VBNetCompanion.LanguageServer.dll` sub-path (verified exists; falls back to `undefined` when the extension isn't installed). The scaffold writes `.vscode/settings.json` ONLY when a DLL was found — otherwise nothing is written, so a generated project never carries another machine's path. Tests: T2 scaffold +4 (vb settings NOT written without a detected DLL; when one is passed it's used verbatim and no `/home/…` path appears). Full suite **1401 passed** (was 1397). tsc clean, PROBLEMS clean, packaged+installed (373KB). Docs: NOTES §66 fix 1.
- **First-open stale language server (§66 fix 2 — new VB project shows "Avalonia … not defined" until a window reload):** the vbnet-companion / Roslyn language server indexes a freshly-created project BEFORE the first `dotnet build` restores NuGet, so it reports Avalonia types missing until a full reload (the known stale-workspace issue). FIX (`src/projectCreator.ts`): `createNewProject` now runs **`dotnet restore` before opening the folder** (`restoreBeforeOpen` — an awaited child-process `dotnet restore` under a Notification progress "Restoring NuGet packages…", 180 s timeout; best-effort: on failure it still opens — the existing first-open build retries). With packages on disk first, the LS resolves Avalonia on first load — no reload needed. Applies to C# and VB alike. Full suite **1401 passed** (unchanged; the creator isn't unit-tested — verified by compile + user). tsc clean, PROBLEMS clean, packaged+installed (374KB). Docs: NOTES §66 fix 2.

## 7. Feature history (one line per section — details in NOTES_ARCHIVE.md)

| § | Feature | Date | Key lesson |
|---|---|---|---|
| 10 | create-avalonia-vb refactor | 2026-08-24 | shared bash lib; **superseded** by §12 |
| 11 | TabControl + TabItem | 2026-08-24 | single-content wrap; visible tab body |
| 12 | Merged project creation into the extension | 2026-08-24 | generator now lives in-extension |
| 13 | Property defaults | 2026-08-25 | KEY_DEFAULTS map; friendly editors |
| 14 | TabItem content placement | 2026-08-25 | resolve visible tab on drop |
| 15 | Right-click delete on dropdown | 2026-08-25 | context menu on control list |
| 16 | ListBox "List Items" editor | 2026-08-25 | batch item editor modal |
| 17 | Effective property values | 2026-08-25 | host reports theme-resolved values |
| 18 | Robust double-click | 2026-08-25 | single-click never opens code-behind |
| 19 | Code-review round | 2026-08-25 | several fixes + reverts |
| 20 | Tab body controls appeared twice | 2026-08-26 | dedupe named controls in host |
| 21 | Dock→Fill reverted to None | 2026-08-26 | Fill = no attr + last child |
| 22 | Single-click nav regression | 2026-08-26 | click vs drag disambiguation |
| 23 | Middle-button → open code-behind | 2026-08-26 | replaced double-click |
| 24 | Removed auto-wire on drop | 2026-08-26 | (re-added later in §45) |
| 25 | Rename refactors code-behind | 2026-08-26 | name + handler sync |
| 26 | Move-to-container → visible tab | 2026-08-26 | descend into active tab body |
| 27 | Middle-click code-behind verified | 2026-08-26 | robust handler insert |
| 28 | Move-to-container no overlap | 2026-08-27 | free-position placement |
| 29 | StatusDate toolbox control | 2026-08-27 | TextBlock + DispatcherTimer Loaded |
| 30 | WinForms-style Anchor | 2026-08-27 | chrome:AnchorHelper attached prop |
| 31 | New Project view top of sidebar | 2026-08-28 | projectCreator flow |
| 32 | DataSet designer | 2026-08-28 | runtime-construction DataSet + .xsd |
| 33 | ItemsControl + UniformGrid | 2026-08-28 | items semantics |
| 34 | DataGrid live row editing | 2026-08-29 | add/edit/delete + persistence |
| 35 | Undo/Redo (form + DataSet), 5 levels | 2026-08-29 | snapshot serialize(true) |
| 36 | 'Custom Title Bar' tool | 2026-08-30 | Window→chrome:ChromeWindow convert |
| 37 | File-browser for path props | 2026-08-30 | bundle into Assets + avares:// |
| 38 | ChromeWindow titlebar preview | 2026-08-30 | buttons + icon in host |
| 39 | Body Image preview | 2026-08-30 | ApplyImageSources by name |
| 40 | ItemsSource asset picker | 2026-08-30 | assetCatalog + code-behind binding |
| 41 | ListBox empty + compact | 2026-08-30 | no auto items; MinHeight 0 style |
| 42 | Delete bound control cleanup | 2026-08-30 | remove code-behind binding |
| 43 | Smooth drag (outline, apply on drop) | 2026-08-30 | ONE message on pointer-up |
| 44 | Lock the Body surface | 2026-08-30 | selectable but not editable |
| 45 | Fix left-click select + auto-wire | 2026-08-30 | #selection pointer-events:none |
| 46 | Automated test suite | 2026-08-30 | t0–t4 layers, runner, vscode stub |
| 47 | T5 VB control/property matrix | 2026-08-31 | every toolbox control + property |
| 48 | Grid Rows & Columns editor | 2026-08-31 | grid defs + Grid.Row/Column pickers |
| 49 | Grid lines not rendering (fix) | 2026-08-31 | programmatic builder must build Grids |
| 50 | Grid children stacking 0,0 (fix) | 2026-08-31 | nextFreeCell auto-placement |
| 51 | Drag-to-re-cell | 2026-08-31 | host gridCells + moveToCell |
| 52 | Image-in-Grid auto-size | 2026-08-31 | size Width/Height to cell on drop/move; host: resolve Image Source at creation |
| 53 | Image tracks cell size dynamically + opt-out | 2026-08-31 | syncImagesToGridCells on every render; Dock hidden for Grid children; 'Auto-size to Cell' opt-out stored in globalState; ensureDockPanelParent only wraps free-positioned controls |
| 54 | Image Rotate (Angle) | 2026-08-31 | setProperty routes Angle→setImageAngle (RenderTransform); host applies RotateTransform; rotates around centre |
| 55 | Rotated outline follows image | 2026-09-01 | host reports rotated AABB (TransformToVisual corners) so the selection box matches the rotated control |
| 56 | Dot grid overlay + snap-to-grid | 2026-09-01 | toolbar Grid/Snap toggles + popup; global dotGrid.* settings; radial-gradient overlay; webview snapDrag on move/resize |
| 57 | Alignment tools + multi-select | 2026-09-01 | Ctrl+Click + marquee multi-select; state.selected = anchor, state.multi = Set; edge-align (L/C/R/T/M/B) + Align Text (TextAlignment / HorizontalContentAlignment = Center); excludes Grid children + locked Body |
| 58 | Shape controls (Line/Rectangle/Ellipse/Arc) | 2026-09-01 | new Shapes toolbox category; transparent fill + black 1px outline; Line uses StartPoint/EndPoint (no Width/Height) + resize scales the points; VB accessors need Imports Avalonia.Controls.Shapes |
| 59 | Make same Width / Height (alignment toolbar) | 2026-09-01 | ⇔/⇕ resize selected controls to the anchor's size; reuses the `align` message with sameWidth/sameHeight; skips Grid children + Lines + anchor |
| 60 | Shape drag-point editing (Line ends / Arc centre+ends) | 2026-09-01 | Line/Arc selection shows draggable POINTS instead of the 8-handle box; Line end drag keeps the other end anchored; Arc end rotates around the centre (other end anchored), centre sets the radius |
| 61 | Shapes render behind by default (Send to Back) | 2026-09-01 | shape snippets carry ZIndex="-1" + drop-handler guard; Avalonia honours ZIndex in paint order (verified in the host) so shapes sit behind other controls in the preview and at runtime; set Z-Index ≥ 0 to bring one forward. **Fix 1:** hitTest respects ZIndex (frame controls carry zIndex) so a behind-shape never steals a click. **Fix 2:** hitTest is hierarchy-aware (uses frame `parent`) so a shape is never beaten by its OWN ancestors (Body/Root) — it stays clickable where exposed |
| 62 | Bug-fix batch (4 user issues) | 2026-09-02 | (1) Colour dropdown listed only the current colour — datalist filters by typed text, so replaced with a real `#colorPalette` popup listing ALL preset colours (~5 rows then scroll, custom current value on top, closes on outside-click/Esc/scroll). (2) Rectangle has ONE `Corner Radius` (key `'Radius'` designer-only): `setProperty` writes RadiusX+RadiusY, propertyCatalog surfaces RadiusX, defaults 0. (3) Runtime Opacity — VERIFIED end-to-end NOT a code bug (designer writes it, host renders it, real Avalonia 12 runtime honours it); likely stale build/unsaved file/dual-editor/old extension. (4) VB imports: `applyAccessors` now BOM-normalises + dedupes `Imports Avalonia.Controls(.Shapes)` so no duplicate imports / stray U+FEFF |
| 63 | Properties sidebar: pinned header / scrolling list | 2026-09-02 | `#props` no longer scrolls as a whole (`overflow:hidden`); the header, control selector, About-help and **Show advanced** row are pinned (`flex:0 0 auto`) and **`#propsBody` is the only scroller** (`flex:1 1 auto; min-height:0; overflow-y:auto`). Pure CSS + 3 T3 CSS-regex guards |
| 63b | Colour palette: scroll-to-pick + open direction | 2026-09-02 | close-on-scroll listener now ignores scrolls whose target is INSIDE `#colorPalette` (so you can scroll the colour list); popup opens UPWARDS when the property is below the window's vertical middle (or not enough room below), clamped to the top. +5 T3 palette tests |
| 64 | Lock the root layout panel | 2026-09-02 | `isLockedStructure` = Body OR `rootContainer` (window's top-level content panel, e.g. `DockPanel Name="Root"`) → frame `locked:true` hides handles/blocks drag like the Body; used in every move/resize/delete/cut/rename/move-to-container/align guard; `lockedLabel` toasts name the locked panel |
| 65 | Select the FORM to resize it | 2026-09-02 | form (Window root, name null) was unselectable → resize needed hand-editing `.axaml`. Now: frame carries `formTitle`; control drop-down's FIRST entry is **"Form - <Title>"** (value ''); clicking EMPTY design space (locked Body / gap) selects the form (`select` name null → Window props incl. Width/Height). Form selection shows no outline (no handles on the whole window). |
| 66 | New projects are F5-ready (Linux-safe) | 2026-09-02 | scaffold now writes `.vscode/launch.json` (`type: coreclr`, program → `bin/Debug/net10.0/<name>.dll` — no Windows `.exe`; `preLaunchTask: build`) + `.vscode/tasks.json` (default `dotnet build`) for C# AND VB. vbnet-companion's "VB.NET: Launch" snippet is Windows-biased (.exe/net8.0) — don't use it; coreclr + the built dll is the cross-platform way. |

---

## 8. Known limitations (current)

- Moving is absolute only inside a `Canvas`; elsewhere it uses `Margin` (best-effort).
- Custom/third-party controls the host can't load render as approximations or an error card.
- Unnamed controls get temporary in-memory names; stripped on save, but the file is re-formatted on save (comments kept).
- Toolbox **drag** is unreliable on Linux/Xorg — the reliable path is **click the tool, then click the canvas**.
- The preview's runtime XAML loader is unreliable (falls back to the programmatic builder) — new controls may need explicit programmatic-builder support.
- The T0 10-project build matrix is slow — run it on demand (`npm run test:build`).

---

## 9. Ideas / next steps

- Duplicate control; copy/paste between forms (cross-file).
- Grid row/column sizing via drag (column/row headers); snapping / alignment guides.
- "Zoom to fit" persistence per document; ruler/guides.
- Optional: load user assemblies into the host for real custom-control preview.
- Optional: host-side hit-testing for precise selection when bounds overlap.

---

## 10. Reference / prior art

- VB host with the same rendering approach (Avalonia 12 / net10):
  `/home/niel/Projekte/Avalonia/DevHelper/DesignerHost/` (`Program.vb`, `XamlRenderer.vb`, `ControlFactory.vb`).
- Reusable `ChromeWindow` component (master): `/home/niel/Projekte/Avalonia/ChromeWindow/`.
- Spec: `/home/niel/Projekte/Avalonia/DesignerCS_Ext/DesignerCS/Designer Extension.md`.
