# Changelog

All notable changes to the **Avalonia Designer for VS Code** extension.

Format: based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [SemVer](https://semver.org/).

## [1.0.0-beta.1] - 2026-09-02

First public **Beta**.

### Added
- **New Project / New Form** — generate a complete Avalonia project or a single form in
  **C# or VB.NET** (net10.0 + Avalonia 12.1.1), rooted on a `Window`/`UserControl` with a
  custom `ChromeWindow` title bar available.
- **WYSIWYG `.axaml` designer** — open any form in a designer tab (Source/Design toggle):
  toolbox drag‑and‑drop (click‑tool‑then‑click‑canvas on Linux/Xorg), move/resize,
  multi‑select + alignment, shape controls (Line/Rectangle/Ellipse/Arc), Grid rows/columns
  + drag‑to‑re‑cell, docking, images‑in‑grid, dot‑grid/snap, undo/redo.
- **Properties panel** — common properties with live re‑render; colour palette, font, margin,
  file/asset pickers; theme (System/Custom) colour backup.
- **DataSet designer** — design ADO.NET `DataSet` tables/columns visually (`*.adset`) and
  generate a runtime C#/VB class + `.xsd`.
- **Previewer Host** — a bundled C#/Avalonia headless renderer (auto‑built on first use)
  shows a faithful live preview and reports control bounds.
- **F5‑ready projects** — new projects ship a Linux‑safe `.vscode/launch.json` (`coreclr` +
  the built assembly, no Windows `.exe`) and a default `build` task; NuGet is restored before
  the project opens so the language server loads cleanly first time.

### Fixed
- Selecting the **form** (click empty design space or pick **"Form - <Title>"** in the control
  drop‑down) lets you resize the whole surface via its Window Width/Height.
- The **root layout panel** and the Body design surface are locked in place (no stray resize
  handles / accidental dragging).
- Hit‑testing is **hierarchy‑ and ZIndex‑aware** — shapes render behind by default but stay
  clickable where visible and never steal clicks from controls over them.
- Colour dropdown lists the full palette (~5 rows visible, scrollable; opens upward when near
  the bottom); no more duplicate VB `Imports` or stray BOM characters.
- Generated VB projects no longer bake in a machine‑specific language‑server path.

### Notes for testers
- The preview host renders with **Avalonia 11** while generated apps target **Avalonia 12** —
  preview fidelity can differ slightly; some controls/custom types render as approximations.
- Toolbox drag‑and‑drop is unreliable on Linux/Xorg — use **click the tool, then click the canvas**.

[1.0.0-beta.1]: https://github.com/OomNiel/avalonia-designer/releases/tag/v1.0.0-beta.1
