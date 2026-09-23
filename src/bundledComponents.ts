/**
 * bundledComponents.ts — detecting OLD copies of the extension's OWN bundled component files
 * (ChromeWindow.cs/.vb + AnchorHelper.cs/.vb) inside a generated project.
 *
 * Background: New Project / New Form bundle these files into the project from `resources/`.
 * A project created with an OLDER extension keeps its OLD copy when the bundled component later
 * grows a member. Two concrete skews bit users:
 *   - ChromeWindow gained a settable `TitleBarHeight` property. Writing `TitleBarHeight="…"` into
 *     the XAML of a project whose ChromeWindow predates the property fails to compile:
 *     "Unable to resolve suitable regular or attached property TitleBarHeight on type …".
 *   - AnchorHelper was tightened to track ONLY direct Canvas children. An old copy (is a Panel)
 *     still "tracks" dock/flow children, so docked Status Bar items etc. keep distorting at runtime.
 *
 * The designer calls this (via `ensureBundledComponentsCurrent`) right when it is about to write a
 * chrome property / convert a root to ChromeWindow, so an outdated project heals itself.
 *
 * These helpers are PURE (no vscode / fs), so they're unit-testable. A file is refreshed ONLY when
 * it is provably an old bundled copy: it carries the known bundled header AND lacks the member the
 * current version ships. A genuinely customised file (header changed/removed) is left alone.
 */

export type BundledKind = 'ChromeWindow' | 'AnchorHelper' | 'PathPicker' | 'GrumpyCharts';

export interface BundledSpec {
    kind: BundledKind;
    /** The file name in the project (language-specific). */
    file: string;
    /** Matches the known header comment of the bundled boilerplate (both old and current copies). */
    bundled: RegExp;
    /** A snippet the CURRENT bundled version contains and the OLD one does not. */
    marker: string;
}

/** The bundled component files for a project's language (vb vs cs). */
export function bundledComponentSpecs(vb: boolean): BundledSpec[] {
    return [
        {
            kind: 'ChromeWindow',
            file: vb ? 'ChromeWindow.vb' : 'ChromeWindow.cs',
            // Present in both the old and the current bundled header (ChromeWindow.vb uses a '
            // comment prefix; the .cs uses //) — so this identifies the boilerplate either way.
            bundled: /Reusable frameless Avalonia window/,
            // The current copy can set the title-bar background/text colours; older copies lack it
            // (writing TitleBarBackground="…" into those would not compile).
            marker: 'TitleBarBackgroundProperty'
        },
        {
            kind: 'AnchorHelper',
            file: vb ? 'AnchorHelper.vb' : 'AnchorHelper.cs',
            bundled: /WinForms-style anchoring/,
            // The current helper also DOCKs an edge-anchored control inside a DockPanel (a Status
            // Bar strip); older copies only ever tracked Canvas children via Canvas.Left/Top.
            marker: 'AnchorDockEdge'
        },
        {
            kind: 'PathPicker',
            file: vb ? 'PathPicker.vb' : 'PathPicker.cs',
            bundled: /BUNDLED RESOURCE/,
            // The current picker draws a FILE / FOLDER icon at its left edge (and grew the
            // ShowIcon switch); older copies are a bare path row, so a File Selector and a Folder
            // Selector look identical on the form.
            // 2026-09-21 moved the marker to `PickerFolderMemory`: Browse now remembers the folder it
            // used last in the per-user app-data folder instead of forgetting it at every restart, and
            // an old copy has no such class — which is how an existing project receives that.
            marker: 'PickerFolderMemory'
        },
        {
            kind: 'GrumpyCharts',
            file: vb ? 'GrumpyCharts.vb' : 'GrumpyCharts.cs',
            bundled: /BUNDLED RESOURCE/,
            // The chart set holds SERIES, AXIS and CURSOR objects now (`XYSeries`/`LineSeries` child
            // elements, `Axis`, and `ChartCursor` inside the `.Cursors` property element). A copy from
            // before any of those cannot compile the XAML this designer writes — saving a form with two
            // series failed with "AVLN2000: Unable to resolve type XYSeries from namespace
            // using:AvaloniaCharts" (seen 2026-09-20 on a project created before the series classes) —
            // so the marker has to be the NEWEST token, not the older `PlotBackOpacityProperty` (which
            // every copy since the first release has, and which therefore detected nothing) nor
            // `XYSeries` (which the multi-series copies have).
            //
            // The marker is not only about new TYPES: a change in how an existing type DRAWS is just as
            // invisible in an old copy, and so is a NEW ATTRIBUTE the editor writes into a form — XAML
            // that names a property the old copy does not have fails to compile. So the marker moves
            // with either. History: `PlotBackOpacityProperty` (the first release, detected nothing),
            // `XYSeries` (multi-series), `ChartCursor` (cursors), `DrawnColor` (a following cursor takes
            // the followed series' colour, 2026-09-20), `LegendMargin` (the legend's inner margin),
            // `Padding` (the room between the chart's border and its frame, 2026-09-20) and
            // `PlotBackBrush` (the background gradient, 2026-09-21) — the newest thing the Properties
            // panel writes, as a property element and as a terse `PlotBackBrush="#RRGGBB"`.
            // 2026-09-21, later: the chart's own picker remembers the folder it used last
            // (`ChartPickerMemory`), which an existing project only gets if its bundled copy is
            // refreshed — so the marker moved to that class name.
            // 2026-09-21, later still: the BAR, AREA and PIE chart types arrived (`GrumpyBarPlot`,
            // `GrumpyAreaPlot`, `GrumpyPiePlot`, `PieSlice`, `BarMode`, `AreaMode`), so the toolbox can
            // now write `<charts:GrumpyBarPlot BarMode="Stacked">` — XAML a copy that predates those
            // types cannot compile ("Unable to resolve type GrumpyBarPlot from namespace
            // using:AvaloniaCharts"). The marker is the newest TYPE the designer can write.
            // 2026-09-21, the Data Selector editor: the panel now also writes SourceKind, SourceSheet
            // and DataFile — three properties an older copy does not have, so a form saved with a page
            // choice would not compile against it. The marker moved to the newest ATTRIBUTE.
            // 2026-09-22: the BAR and the PIE lost their cursors and gained a hover readout, and the pie
            // gained `HoverExplode` — an attribute the Slices/Properties panel writes, and a drawing the
            // old copy does not have (it would keep offering "Add cursor" on a bar, and never pop a
            // slice out). The marker moved to the newest member the panel writes.
            // 2026-09-22, later: the WATERFALL arrived (`GrumpyWaterfallPlot`, `WaterfallStyle`,
            // `WaterfallColorMode`, `SampleSets`, `Elevation`, `Azimuth`, …), so the toolbox can now write
            // `<charts:GrumpyWaterfallPlot SampleSets="1,2; 3,4"/>` — XAML a copy that predates the type
            // cannot compile at all. The marker is the newest TYPE the designer can write.
            // 2026-09-22, later still: every chart gained FILL / RESTORE — right-click docks the chart over
            // its container (`FillContainer`) and puts it back (`RestorePlacement`), Esc undocks. No XAML
            // changes, which is exactly why this one is easy to miss: the running app compiles the
            // project's OWN copy, so an un-refreshed project kept a chart menu WITHOUT the entry — the
            // user saw "no new build and no refresh prompt", because the copy in the project already
            // carried the previous marker (`GrumpyWaterfallPlot`), so it looked up to date.
            // A behaviour/menu change in an EXISTING type is therefore a marker move like any other.
            // 2026-09-22, later still: the chart grew the FILLED SURFACE between the sets
            // (`SurfaceFill` = "Fill The Roof", `SurfaceColor`, `SurfaceOpacity`) and the band under each
            // one (`SurfaceToFloor` = "Block Walls"), then the solid block, the tiled roof and the quilt —
            // but all of that was since REMOVED from the chart (the open corridors between the sets are the
            // default, unroofed picture again: a ribbon and its mesh are enough to read each set against the
            // others). The new attributes are gone with it, so the XAML-trap that pushed the marker up no
            // longer exists; the newest token the current file ships is back to `IsFilled` — the fill /
            // restore behaviour added to every chart above.
            marker: 'IsFilled'
        }
    ];
}

/**
 * True when `text` (the on-disk contents of a bundled component file) is an OLD copy of the
 * extension's own boilerplate: it has the bundled header but lacks the current version's marker.
 */
export function isStaleBundledCopy(text: string, vb: boolean, kind: BundledKind): boolean {
    const spec = bundledComponentSpecs(vb).find((s) => s.kind === kind);
    if (!spec) return false;
    return spec.bundled.test(text) && !text.includes(spec.marker);
}
