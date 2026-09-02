# Avalonia Designer for VS Code

A WYSIWYG form designer for the **Avalonia** framework with a drag-and-drop toolbox.

> **📗 Full user guide: `USER_MANUAL.md`** — documents every feature (New Project, toolbox,
> properties, docking, templates, code-behind, keyboard shortcuts, known issues) in plain
> language for beginners.

- Opens any existing `.axaml` file in a Designer editor tab (with a Source/Design toggle).
- `Avalonia: New Form` command creates a new form (C# **or** VB.NET, `Window` or `UserControl`) and opens it in the designer.
- Live preview is rendered by a headless **Avalonia Previewer Host** (C# / .NET) that speaks WebSocket to the extension.
- Drag controls from the sidebar Toolbox onto the canvas; then **move** and **resize** them (where the layout allows).
- Properties panel edits common properties with instant re-render.
- **DataSet designer** — design ADO.NET `DataSet` tables + columns visually (`*.adset`), then
  generate a runtime class (C#/VB) + `.xsd`.

## Architecture

```
┌────────────────────────── VSCode Extension (TypeScript) ──────────────────────────┐
│  Toolbox (TreeView)   Canvas + Properties (Webview custom editor for *.axaml)      │
│         ▲ drag/drop / postMessage                                                  │
└─────────┼──────────────────────────────────────────────────────────────────────────┘
          │  WebSocket (JSON over ws://127.0.0.1:<port>)
┌─────────┴──────────────────────────────────────────────────────────────────────────┐
│  Previewer Host (C# / .NET 8, host/)                                               │
│    - Avalonia 11.0.10 headless (UseHeadless + UseSkia)                             │
│    - Loads XAML, renders it to a PNG (RenderTargetBitmap)                          │
│    - Returns the PNG plus the bounds of every named control                        │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

Messages handled by the host: `hello`, `ping`, `snippet` (default XAML for a toolbox
tag with a unique generated name), `render` (XAML → PNG + control bounds + each control's
parent + Grid cell boundaries for drag-to-re-cell).

## Getting started

Prerequisites: **Node.js** and the **.NET SDK**. A .NET 8+ SDK is enough to build and run the
bundled preview host; **creating/running generated projects needs a .NET SDK that supports
`net10.0`** (e.g. .NET 10 SDK). Works on Linux, macOS and Windows.

```bash
npm install          # ws, @xmldom/xmldom, typescript
dotnet build host/PreviewerHost.csproj   # builds the C# renderer host
npm run compile      # compiles src/ -> out/
```

> **Version matrix & preview fidelity.** Generated projects target **`net10.0` + Avalonia 12.1.1**.
> The bundled Previewer Host renders with **`net8.0` + Avalonia 11.0.10** (it auto-builds on first
> use). The preview is therefore a close but not pixel-perfect match for Avalonia 12 apps — some
> controls or custom types render as approximations. The designer is **opt-in**: `.axaml` files open
> in the normal text editor by default; use **Avalonia: Open in Designer** (or the editor's tab
> dropdown) to open them in the designer.

Then press **F5** in this folder (`.vscode/launch.json` is pre-configured) to launch an
Extension Development Host. The first time a designer opens, the extension spawns
`host/bin/Debug/net8.0/PreviewerHost` automatically (and builds it if it is missing).

### Using the designer

1. **Open an `.axaml` in the designer** — right-click the file in the Explorer →
   **Avalonia: Open in Designer** (the designer is opt-in; `.axaml` files open in the normal
   text editor by default). Use the tab's dropdown to switch to the Text Editor.
2. **Toolbox** (activity-bar icon, then the Toolbox view) — drag a control onto the
   canvas, or double-click a control to add it at the centre of the form.
3. **Select** a control by clicking it (dashed selection box + handles appear).
4. **Move** by dragging inside the selection box; **resize** via the handles.
   - On a `Canvas` parent, controls move via `Canvas.Left` / `Canvas.Top`.
   - Elsewhere, movement uses `Margin`; resize always sets `Width` / `Height`.
5. **Properties** panel on the right edits Name, size, margin, alignment, visibility,
   Content/Text, Background, FontSize — updates render live.
6. **Ctrl+S** saves the edited XAML back to disk (tidy formatting; comments preserved,
   auto-generated internal names are stripped).

### New form

`Avalonia: New Form` → pick language (C# / VB.NET) → base type (Window / UserControl)
→ name. It creates `Name.axaml` + `Name.axaml.cs` / `Name.axaml.vb` next to the
detected `.csproj` / `.vbproj` and opens the form in the designer. Existing `.axaml`
files are auto-detected as C# or VB from the containing project.

## Project structure

```
avalonia-designer-extension/
├── src/
│   ├── extension.ts         # activation, commands, host lifecycle, project creation
│   ├── designerPanel.ts     # custom editor provider + document model + webview + undo/redo
│   ├── xamlModel.ts         # .axaml DOM model: parse, edit, serialize, grid definitions
│   ├── propertyCatalog.ts   # per-control property lists + friendly editors
│   ├── codeBehind.ts        # event wiring, handler insert, ItemsSource/DataSet binding
│   ├── assetCatalog.ts      # scans .cs/.vb/.adset for bindable collections
│   ├── dataSet*.ts          # DataSet designer (editor/model/generator)
│   ├── controlInfo.ts       # plain-language descriptions for the help panel
│   ├── toolboxProvider.ts   # toolbox tree view (drag + click-to-arm)
│   ├── projectParser.ts     # detects C# / VB.NET project for a file
│   ├── newForm.ts / formTemplates.ts / projectScaffold.ts / projectCreator.ts
│   ├── hostClient.ts        # WebSocket client + PreviewerHost process manager
│   └── logger.ts
├── host/
│   ├── PreviewerHost.csproj # net8.0, Avalonia 11.0.10, headless + Skia
│   ├── Program.cs           # WebSocket server (System.Net.WebSockets)
│   ├── XamlRenderer.cs      # XAML -> PNG + bounds/parent/gridCells (3 load strategies)
│   └── ControlFactory.cs    # default snippets + control type map
├── resources/               # ChromeWindow + AnchorHelper (bundled into new projects)
├── media/                   # designer.{css,js}, dataSet.{css,js}, icons
├── tests/                   # automated suite (runner, helpers, t0–t5 layers) — see NOTES.md §6
├── package.json
├── tsconfig.json
└── .vscode/                 # launch.json + tasks.json (F5 build + run)
```

## How it works under the hood

- The webview never talks to the host directly — it posts messages to the extension,
  which forwards `render` / `snippet` over WebSocket and sends the resulting PNG +
  control bounds back to the webview.
- Every control element in the DOM is given an in-memory generated `x:Name` before
  rendering so the host can report per-control bounds reliably. Auto-generated names
  are removed again when the file is saved, so your files stay clean.
- XAML is loaded into the host with three strategies: the internal
  `IRuntimeXamlLoader` (via reflection, full fidelity), a temp-file
  `AvaloniaXamlLoader.Load(uri)`, and finally a programmatic fallback builder.
- Unresolved custom controls (e.g. `chrome:ChromeWindow` from another assembly) can't
  be loaded by the host; the programmatic fallback renders what it can, and genuinely
  broken XAML renders as a labelled error card.

## Known limitations

- Moving a control only works absolutely inside a `Canvas`; elsewhere it shifts via
  `Margin` (best-effort "when applicable").
- Custom / third-party controls that the host can't load render as approximations or
  error cards (full support would require compiling the user's assemblies into the host).
- Unnamed controls get temporary names in-memory; they are stripped on save but the
  saved file is re-formatted (comments are kept, whitespace is normalised).
- The toolbox drag relies on VS Code's tree drag data reaching the webview — on some
  Linux/Xorg setups use **click the tool, then click the canvas** to place a control.
- A Grid's rows/columns are edited via the **Rows & Columns** editor (there is no
  drag-resize of columns/rows yet); new controls auto-fill the next free cell and can
  be dragged to another cell.

## License

MIT
