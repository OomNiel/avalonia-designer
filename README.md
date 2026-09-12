# Avalonia Designer for VS Code

A **WYSIWYG form designer for the [Avalonia](https://avaloniaui.net) UI framework** that lives inside
VS Code: drop controls on a design surface, set their properties in a friendly panel, and let the
extension write the **XAML** ***and*** the C#/VB.NET code-behind for you.

As a long time user of Windows based IDE's, I got used to have access to interactive WYSIWYG style
form designer features. On Linux though I could not find such a tool that suited me for using with the
VS Code app. This extension is an attempt to solve that problem.

*This extension is a developing project. As such expect to find some bugs and unexplained weirdness.*

I need the help of the community to test, find errors, bring missing features to light and help with
the debugging. This project lives in a
[GitHub repository](https://github.com/OomNiel/avalonia-designer). **Bug reports, questions and
remarks are welcome in the [issue tracker](https://github.com/OomNiel/avalonia-designer/issues).**

Listed below is the list of the features of this extension. Feel free to enjoy and contribute.

## Install

**From the Visual Studio Marketplace** — search for *Avalonia Designer* in the Extensions view
(`Ctrl+Shift+X`), or:

```bash
code --install-extension grumpy.avalonia-designer --pre-release
```

Every published version so far is a **pre-release**, so VS Code has to be told to accept one: tick
**“Show pre-release versions”** in the Extensions view (or add `--pre-release` to the command), then
pick the **Pre-Release** channel on the extension's detail page.

**Or from GitHub** — take the `.vsix` from the
[latest release](https://github.com/OomNiel/avalonia-designer/releases/latest):

```bash
code --install-extension avalonia-designer-0.9.0-prerelease.vsix --force
```

Either way, **reload the window** afterwards (`Ctrl+Shift+P` → *Developer: Reload Window*). The
previewer host is compiled with the **.NET SDK** the first time you open a form — see
[USER_MANUAL.md §3](https://github.com/OomNiel/avalonia-designer/blob/main/USER_MANUAL.md#3-installation--first-run)
for the prerequisites.

> **GitHub and the Marketplace number releases differently.** The Marketplace only accepts plain
> numbers, so the tag `v1.0.0-beta.7` is published there as **`0.9.0`** — `1.0.0` is reserved for the
> first stable release and `0.9.x` is the current pre-release line. The packages are identical.

## 1. The preview is real

The design surface is rendered by an **actual headless Avalonia application** (`host/`, C#/net8.0 on
**Avalonia 12.1.1**) that loads your XAML over a Web-socket and returns a PNG — **plus every
control's bounds, parent and Grid cell**. That is what makes click-to-select, drag, resize and cell
drop work against a genuine render rather than an approximation.

Three loader strategies keep it working when a form uses types the host cannot resolve:

- `IRuntimeXamlLoader` (via reflection, full fidelity)
- a temp-file `AvaloniaXamlLoader.Load(uri)`
- a programmatic fallback builder that renders what it can and shows a labeled error card for what it
  cannot.

## 2. C# and VB.NET code-behind generation — VB as a first-class citizen

Generated VB gets control **accessor properties**, so you can write `TextBox2.Text = "Hello"`
directly; correct `Imports`; a manual `InitializeComponent()`; a fully-qualified `x:Class`; and exact
`EventArgs` per event (VB is strict — a mismatch fails the build with `AVLN:0004`).

The awkward parts are handled rather than hand-waved: VB **one-line lambdas**
(`Function(r) r.Name`, `Sub(s, e) DoIt()`) used to unbalance method spans and produce false errors.

The analyzer now distinguishes them from real blocks. Visual designers in Linux distros almost never
support VB.NET at all. Eventually I will make all .NET languages work with this extension.

## 3. An event catalog generated from the real assemblies that drives a picker

Placing a control opens a chooser listing the events **that control actually exposes** (its default
event first). Tick **several** at once, press **Skip** to place it un-wired, or tick
*Remember my choice* to stop being asked. **Right-click → Add event…** wires more later (already-wired
events are marked and cannot be picked twice), and **middle-click** lists the wired handlers so you
choose which one to jump to in the code-behind files.

## 4. 🩺 Code Fix… — the designer notices when you edit by hand

Hand-editing XAML or the code-behind normally leaves the two out of step, and the compiler error you
get then rarely points at the change that caused it. **Code Fix…** checks the code-behind against the
form *and* the project's DataSets, then repairs what it finds. It fixes missing VB accessors,
left-over accessors, duplicate methods, orphaned event handlers, wrong handler signatures, a
never-called `InitializeComponent()`, broken Data-Image / `ItemsSource` bindings, DataSet drift after
a rename, missing `Imports`, and bundled helper files that were never copied into the project.

It can run **by itself** (when you return to the designer tab by default — also on save, while typing,
or only on demand, via **⚙ Settings**), publishes findings to **PROBLEMS**, and marks a control whose
handler is missing with a **⚠ badge** right on the canvas.

The striking part: it is never destructive. Every finding offers a **“keep my edit”** alternative
*Leave it — keep my code*, or *Keep my delete — un-wire it*, which removes the event from the form so
the XAML and the code agree again. A handler you **renamed** by hand is offered as a one-click
**re-point** instead of an empty new stub, so the body you wrote is never lost.

## 5. It creates complete run-ready projects

Not just forms. **Avalonia: New Form** covers Window/UserControl with five templates (Blank, Login,
Data entry, About, Main window with menu + status bar), and project scaffolding produces a complete
Avalonia project with the bundled Titlebar, helper files, `.vscode` build/launch tasks and DataSet
support (C# or VB.NET) that `dotnet build`s clean and runs. The test suite proves that for the whole
control matrix in both languages.

## 6. A DataSet designer with live data binding

Design ADO.NET DataSet tables and columns visually (`*.adset`), generate the runtime class (C#/VB)
**and** the `.xsd`, then bind controls to it. Bindings stay in sync when a table or column is renamed —
the designer knows what a binding is made of rather than treating the code as text.

It also supports **“follow a column of a bound grid”**: a ComboBox or ListBox can mirror one text
column of a table a DataGrid owns and update **live** as you add, edit or delete rows in the grid —
without taking the table away from the grid's own editing, undo and save-back.

## 7. Bundled helper controls, copied in and kept in sync

File and Folder **path pickers** (platform dialog via `TopLevel.StorageProvider`, no extra package),
a cross-platform **dark titlebar** (`ChromeWindow`), `GrumpyPanel`, `AnchorHelper`, `ColumnFollower`
and `ExifImageLoader`. Each is copied into your project the first time it is needed — and re-copied by
**Code Fix…** for projects that predate it.

## 8. A property grid that behaves like a real one

Every control gets the *familiar* editor for each property kind: the full color palette,
**font pickers populated from your machine's actual font list** (enumerated in the host),
`ItemsSource` and Browse pickers, Data-Image binding, plus dedicated editors for Tab items, List
items, ComboBox items, menu items, a status bar and **DataGrid Rows & Columns** (row background, row
height, column width, frozen columns, header font/color/alignment).

Rows are grouped into collapsible sections in the same order for every control, and every control has
a plain-language **“About this control”** help panel — the extension is aimed at beginners, so nothing
assumes you already know Avalonia's vocabulary.

## 9. Designer ergonomics tools to make form control layout easier

Multi-select with six alignments, same-width/same-height and equal spacing (vertical and horizontal).
Dock, Grid-cell and anchor handling with a cell highlight and drag-to-re-cell; dot grid with
snap-to-grid; cross-hair guides; rulers; zoom/fit.

Split panels are designed visually, controls can be moved between containers without breaking their
code-behind, and **undo/redo (5 levels) also reverts code-behind changes**.

One toolbar click makes a dated **backup of the whole project** before risky work.

## 10. Engineering discipline

- **~2,650 automated assertions across 5 layers**, including a layer that drives the real headless
  renderer over WebSocket and asserts pixels/bounds, a layer that runs the webview in **jsdom**, and a
  matrix that `dotnet build`s generated C# **and** VB projects for every control.
- **CI on every push** (compile, fast layers, and a real `vsce package`), plus a dry-run-first release
  workflow.
- **~10,000 lines of documentation**: a 1,000-line beginner `USER_MANUAL.md`, a per-control
  `CONTROLS.md`, the generated `Events per Control.md`, a real `CHANGELOG.md`, a maintainer
  `PUBLISHING.md` and a developer `NOTES.md` with the gotchas written down.
- A **generated** catalog rather than hand-maintained lists, so the code, the signatures and the
  reference document cannot drift apart.

## Status and prerequisites

- **Beta**, published on the
  [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=grumpy.avalonia-designer)
  as a pre-release — incomplete and still changing, but every release ships with a green suite.
- **Two version numbers per release, on purpose**: the GitHub tag is `v1.0.0-beta.N` while the
  Marketplace (plain numbers only) shows the same build as `0.9.x`. `1.0.0` is reserved for the first
  stable release.
- VS Code **1.85+**; the **.NET SDK** (the preview host is built with it — the designer names the
  missing SDK with a download link rather than failing silently). Generated projects target `net10.0`.
- Both the preview host and generated projects use **Avalonia 12.1.1** — one version, so what you
  design is what you run.
- **MIT** licensed.

## Read more

- [USER_MANUAL.md](https://github.com/OomNiel/avalonia-designer/blob/main/USER_MANUAL.md) — the full
  guide, written for beginners
- [Events per Control.md](https://github.com/OomNiel/avalonia-designer/blob/main/Events%20per%20Control.md)
  — every event of every control, with the `EventArgs` a handler must take
- [CONTROLS.md](https://github.com/OomNiel/avalonia-designer/blob/main/CONTROLS.md) — per-control
  properties and default events
- [CHANGELOG.md](https://github.com/OomNiel/avalonia-designer/blob/main/CHANGELOG.md) — what changed in
  each release
- [PUBLISHING.md](https://github.com/OomNiel/avalonia-designer/blob/main/PUBLISHING.md) — packaging and
  Marketplace release steps (for maintainers)
- [Visual Studio Marketplace listing](https://marketplace.visualstudio.com/items?itemName=grumpy.avalonia-designer)
  — the extension itself, on the pre-release channel
- [All releases and VSIX downloads](https://github.com/OomNiel/avalonia-designer/releases)
- [Issue tracker](https://github.com/OomNiel/avalonia-designer/issues) — bug reports, questions and
  remarks go here
