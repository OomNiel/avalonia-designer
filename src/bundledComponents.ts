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

export type BundledKind = 'ChromeWindow' | 'AnchorHelper' | 'PathPicker' | 'GrumpyCharts' | 'GrumpyPrint' | 'GrumpySheet';

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
            kind: 'GrumpySheet',
            file: vb ? 'GrumpySheet.vb' : 'GrumpySheet.cs',
            bundled: /BUNDLED RESOURCE/,
            // New in 0.12.9, so no older copy exists to refresh — the marker names the type itself,
            // which is the token whose absence means "this file is not the sheet at all".
            marker: 'GrumpySheet'
        },
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
            // longer exists; the marker fell back to `IsFilled` — the fill / restore behaviour added to
            // every chart above.
            // 2026-09-23: the SURFACE CHART 3D arrived (`GrumpySurfacePlot`) — a seventh type the toolbox
            // writes, so a copy without it cannot compile a form that carries one. The marker is the newest
            // TYPE again.
            // 2026-09-24: the surface's BAND FILL was rewritten — one quad (and before that, one ribbon) per
            // band could not fill a fold, because a figure whose outline crosses itself has two loops wound
            // opposite ways and `NonZero` sums them to zero: the hole showed the chart's own backcolour
            // through the sheet. It is now one TRIANGLE PAIR per sample pair, wound the same way all band
            // long (`BandTriangle`). That is a DRAWING change in an EXISTING type — exactly the case the
            // paragraph above warns about — and the user met it: the designer (built from this file) looked
            // right while the app kept drawing see-through bands, because the project's own copy already
            // carried `GrumpySurfacePlot` and so was never reported stale. The marker is the new member.
            // 2026-09-24, later: the width WINDOW changed from a CLAMP to a CUT (`CutToWindow`). Clamping the
            // samples onto the window's edges is what made every off-window sample pile up there: dragging the
            // X slider in a running app grew a false vertical PANEL at each end of the sheet, pinned to the
            // window edges (and a saved window showed them in the designer too). Again a drawing change in an
            // existing type — no property of the form changed at all — so the marker follows the new member.
            // 2026-09-24, later still: the TEMPERATURE ramp stopped being a gradient laid across the SCREEN.
            // A brush can only know where a pixel is, and on a tipped cube the screen position mixes a point's
            // height with how far back it stands, so one gradient per band coloured the same height
            // differently from slice to slice by tan(Elevation) of the ramp — a narrow Z window showed it
            // plainly (three slices, the plateau one shade at the front and another at the back). It is now a
            // CUT of each drawn triangle on the ramp's own levels (`CutToLevels`), so the colour is the
            // height's and nothing else. Another drawing change in an existing type: the marker moves again.
            // 2026-09-24, last of the day: the surface's legend grew from two sliders to FOUR — the X and Z
            // windows plus an axis ZOOM level for X and Y — the four of them packed one handle apart, and the
            // chart's own right-click menu gained the Legend on/off toggle (`legendItem`). Reported from a
            // running app as *"the new sliders are rendering in the designer preview but not during runtime"*
            // and *"the right click legend on/off is not available in the runtime menu"*: the preview draws
            // the host's copy of this file while the app compiles the PROJECT's own, and a stale copy carried
            // `CutToLevels` already — so, exactly as with `BandTriangle` and `CutToWindow`, a change of this
            // kind is invisible until the marker names something only the new copy has. `legendItem` was that
            // token: no copy that lacks today's menu entry could draw today's legend either.
            // 2026-09-25: the chart menu gained HARDCOPY — "Print…" (native dialog, Avae.Printables) and
            // "Print to PDF…" (Skia-backed PDF, AvaloniaUI.PrintToPDF). The code lives behind a PRINT_SUPPORT
            // compile symbol (the headless PreviewerHost links this file with no printer packages, so the
            // entries are compiled out there and cost nothing). A stale project copy has neither the symbol's
            // usings nor the `printItem` token, and would not offer the menu; the marker moved to `printItem`
            // so such copies are refreshed — and, once refreshed, the project's csproj must ALSO gain the two
            // packages + PRINT_SUPPORT + AppBuilder.UsePrintables() for the entries to compile and work.
            // 2026-09-25, later: that hardcopy path was overhauled — the print entry is DISABLED instead of
            // silently doing nothing when no printing service is registered (`CanPrint` against
            // `Printable.Default`), failures are reported through a `PrintFailed` event instead of being
            // swallowed, the page can be real paper (`ChartPrintOptions` / `ChartPaper`: A4, Letter, margin,
            // light background) via a `ChartPrintPage` wrapper that keeps the chart vector, PDF export works
            // without a picker (`ExportPdfAsync`) and through a stream when a file has no local path, PNG
            // export (`ExportPng` / `SaveAsPictureAsync`) and Ctrl+P arrived, plus a `PrintFailed`-carrying
            // re-entrancy guard. `ExportPdfAsync` is the token only this copy has.
            // 2026-09-25, last of the day: `CanPrint` no longer means "Avae.Printables has a service" but
            // "this machine can put a page on paper" — it also accepts the bundled `GrumpyPrint` helper, which
            // drives CUPS (`lp`) on Linux desktops, where that library installs an API-only asset and registers
            // nothing, so the entry used to stay greyed out on the very machine the chart was drawn on. The
            // chart calls `GrumpyPrint.Available`, so a copy without that call keeps a disabled entry and would
            // not compile against today's helper-less XAML-free API — `GrumpyPrint` is the token only this copy
            // has. The same release added the `PrintLegend` row — the legend on the PAPER (As drawn / Off / On),
            // scoped to the job so the chart on screen never changes — which ships in the same copy, so the one
            // marker covers both.
            marker: 'GrumpyPrint'
        },
        {
            kind: 'GrumpyPrint',
            file: vb ? 'GrumpyPrint.vb' : 'GrumpyPrint.cs',
            // A bundled file of its own (added 2026-09-25): the chart's Print… entry, its PDF/PNG exports
            // and Ctrl+P work on Windows and macOS through Avae.Printables' native service, but that
            // community library ships an API-only asset for a plain Linux desktop — `UsePrintables()`
            // registers nothing there and `Printable.Default` stays null. This helper renders the page to a
            // temporary PDF and hands it to CUPS, so the chart prints on Linux too, with no extra package in
            // the extension. It is copied in (and refreshed) together with the chart, which calls it.
            bundled: /BUNDLED RESOURCE/,
            // The newest member: the `lp` invocation itself. A copy that predates the CUPS path has no
            // such method (and the content comparison above would catch it too).
            marker: 'SendFileAsync'
        }
    ];
}

/**
 * The line every bundled file carries at the top of its header, naming the release it was copied from:
 * `// BUNDLED-COPY: 0.11.18` (the VB files use a `'` comment). It is what a reader — and the update
 * notice — can quote, and what proves a project's copy came from a release rather than from a hand edit.
 */
export const BUNDLED_COPY_STAMP = 'BUNDLED-COPY: ';

/** The version a bundled file's header stamp names, or null when it carries none (a copy older than the
 *  stamp itself, i.e. from before 0.11.18). */
export function bundledStampOf(text: string): string | null {
    const line = text.split('\n', 4).find((l) => l.includes(BUNDLED_COPY_STAMP));
    return line ? line.slice(line.indexOf(BUNDLED_COPY_STAMP) + BUNDLED_COPY_STAMP.length).trim() : null;
}

/** Two copies of the same bundled file, ignoring line endings and trailing whitespace (a project written
 *  on another machine, or re-saved by an editor, must not read as "different"). */
function sameBundledCopy(a: string, b: string): boolean {
    const tidy = (s: string) => s.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '');
    return tidy(a) === tidy(b);
}

/**
 * True when `text` (the on-disk contents of a bundled component file) is an OLD copy of the extension's
 * own boilerplate, and may therefore be replaced by the current one.
 *
 * Two rules, because one alone is not enough:
 *
 *  1. **It must be provably ours** — the bundled header is there. A file the user wrote or rewrote is
 *     never touched.
 *  2. **Its CONTENT must differ from the copy we ship** (`current`). This is the rule that catches a
 *     *drawing* change — a new slider, a colour, an extra menu entry — which adds no property and no new
 *     token to look for. Reported from a running app on 2026-09-24: *"the new sliders are rendering in
 *     the designer preview but not during runtime"*. The preview draws the host's copy (always current)
 *     while the app compiles the project's, and the old marker test could not see a change of that kind —
 *     the copy carried the previous marker token, so nothing was detected and the app kept two sliders
 *     where the preview showed four. The version STAMP says which release a copy came from; the CONTENT
 *     decides whether it is the same copy.
 *
 * `current` is optional so the question can still be asked without the extension's own copy at hand; the
 * answer is then the older marker test (what the pure callers and their fixtures rely on).
 */
export function isStaleBundledCopy(text: string, vb: boolean, kind: BundledKind, current?: string): boolean {
    const spec = bundledComponentSpecs(vb).find((s) => s.kind === kind);
    if (!spec || !spec.bundled.test(text)) return false;
    if (current != null && current !== '') return !sameBundledCopy(text, current);
    return !text.includes(spec.marker);
}
