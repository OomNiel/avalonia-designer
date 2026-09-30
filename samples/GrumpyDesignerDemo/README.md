# GrumpyDesignerDemo — the designer's own demo app

A **real, buildable Avalonia 12 application** whose entire form was built with **Grumpy's WYSIWYG Designer for
VS Code**. It exists to show what the designer produces, and to be something you can open *in* the designer and
take apart: every control here was dropped on a canvas, arranged by dragging and configured in the properties
panel.

```bash
dotnet run
```

or open this folder in VS Code and press **F5** — the `.vscode/` folder carries the same generic
`launch.json` / `tasks.json` the designer writes into a new project.

Target framework `net10.0`, Avalonia **12.1.1** (the same version the designer previews with, so what you see on
the canvas is what runs). Nothing else is needed — no extension, no data file, no database.

## What to look at

| In the window | What it demonstrates |
|---|---|
| **Menu bar** | a docked `Menu` with a `PathPicker` inside *File ▸ Open…*, an **About** item and an **Exit** item |
| **About…** | a dialog that reports the extension version this form was written with, shows the extension's icon and links to its GitHub repository and that version's release (`AboutDialog.axaml` + `.axaml.cs`) |
| **Exit** | application shutdown through the desktop lifetime (`Exit_Click` in `MainWindow.axaml.cs`) |
| **Command bar** | the bundled `chrome:GrumpyCommandBar` — a band whose items are **ordinary controls** (`GrumpyCommandBar1Open`, `GrumpyCommandBar1Save`, a path box), with the two dialog handlers in the code-behind |
| **Tab 1 — Buttons etc.** | the everyday input controls: buttons, a checkbox, radio buttons, a toggle switch, a combo box |
| **Tab 2 — SplitPanel/Image/DataGrid** | a three-pane `SplitPanel` with draggable splitters, an `Image` fed by the grid's selection, and a **`DataGrid` bound to a DataSet** (`DemoDataSet.adset` → `DemoDataSet.cs`), including the “+ Add row…” placeholder row the binding pattern adds |
| **Tab 3 — SpreadSheet** | the bundled `chrome:GrumpySheet` with typed cells, formulas and its own toolbar |
| **Tab 4 — Charting** | the bundled `x:GrumpySurfacePlot` (an inline `SampleSets` surface) and a chart built from `XYSeries` children |
| **Status strip** | the bundled `GrumpyPanel`-based status bar with a label and a **live clock** (`GrumpyStatus1Date_Loaded`) |
| **Window chrome** | the bundled `ChromeWindow`: dark titlebar, drag/min/max/close, rounded corners, and its own title icon |
| **Components** | `Timer.cs` is copied in and the form holds a `Timer1` — a non-visual component that appears in the designer's **Component Tray** rather than on the canvas |

## The bundled helper files are copies — leave them to the designer

`ChromeWindow.cs`, `GrumpyPanel.cs`, `GrumpyCommandBar.cs`, `GrumpyCharts.cs`, `GrumpySheet.cs`,
`GrumpyPrint.cs`, `AnchorHelper.cs`, `ColumnFollower.cs`, `ExifImageLoader.cs`, `PathPicker.cs` and `Timer.cs`
are **the designer's own helper files, copied into the project** the first time a control needed them — exactly
what it does for your projects. Each one opens with a `BUNDLED-COPY: <version>` stamp naming the extension
version that put it there (a snapshot keeps the stamps it was made with). Two consequences:

- **Hand-editing them is not the way to customise a form.** The designer compares them with the shipped copies
  and offers **Update now** when they differ from a newer extension, which would overwrite local edits — the
  same contract as any generated file.
- They are the reason this project runs on its own: no reference to this repository, no package beyond the ones
  in the `.csproj`.

## Two deliberate details

- **The workbook.** `GrumpyCharts.xlsx` ships as an example data source (the *Surface* sheet the surface plot
  can draw). The chart in this snapshot uses its inline `SampleSets` instead, so the app runs with no external
  file: a chart's `SourceFile` is an **absolute** path — the designer's *Choose spreadsheet…* writes the file
  you pick — and an absolute path from someone else's machine is exactly what a sample must not carry. Point it
  at your own copy on your machine if you want to see the workbook path at work.
- **The database.** The DataSet's `DemoDataSet.adset` names `DemoDataSet.db` **relative**, so the file is
  created next to the executable the first time a row is saved. A fresh clone therefore starts with an empty
  grid and its “+ Add row…” row — add one and it appears.
