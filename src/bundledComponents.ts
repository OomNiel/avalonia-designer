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
            marker: 'ShowIcon'
        },
        {
            kind: 'GrumpyCharts',
            file: vb ? 'GrumpyCharts.vb' : 'GrumpyCharts.cs',
            bundled: /BUNDLED RESOURCE/,
            // The chart set holds SERIES and AXIS objects now (`XYSeries`/`LineSeries` child elements,
            // `Axis`). A copy from before that cannot compile the XAML this designer writes — saving a
            // form with two series failed with "AVLN2000: Unable to resolve type XYSeries from
            // namespace using:AvaloniaCharts" (ChartTestCS, 2026-09-20) — so the marker has to be one
            // of the NEW types, not the older `PlotBackOpacityProperty` (which every copy since the
            // first release has, and which therefore detected nothing).
            marker: 'XYSeries'
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
