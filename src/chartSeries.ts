/* The chart child-element model: a chart's SERIES and their AXES are child elements, not attributes,
 * so the ordinary property round-trip never touches them. Everything that reads or writes them lives
 * here — the designer panel turns it into messages, the tests drive it directly.
 *
 * Why a module of its own: a series attribute the writer names differently from the C# property, or a
 * property element the host does not understand, fails SILENTLY (the chart draws, just wrong — the
 * line loses its colour, an axis stays put). Keeping the model in one testable place is what makes
 * the T2 tests pin the seams (attribute names against the C#, pickers against the enums) possible.
 *
 * Wire formats (designer ↔ webview):
 *   properties message:  chartSeries = chartSeriesOf(el), chartAxes = chartAxesOf(el)
 *   save series:         { type:'saveChartSeries', name, items:[{ src, type, …CHART_SERIES_FIELDS }] }
 *   save axes:           { type:'saveChartAxes', name, commonX, commonY, series:[{ x, y }] }
 * `src` is the series child index an entry came from (-1 for a new one), so reordering keeps every
 * series' element — and any per-series axis it carries — attached to the right line.
 */
import { XamlModel, localName } from './xamlModel';

/** Series fields (key = message/UI name, attr = XAML attribute, def = the value the renderer uses
 *  when the attribute is absent). Writing a value equal to the default REMOVES the attribute, so a
 *  series the user never restyled stays a short, readable element. */
export const CHART_SERIES_FIELDS: { key: string; attr: string; def: string }[] = [
    { key: 'title', attr: 'Title', def: '' },
    { key: 'xColumn', attr: 'XColumn', def: '' },
    { key: 'yColumn', attr: 'YColumn', def: '' },
    { key: 'axisMode', attr: 'AxisMode', def: 'Common' },
    { key: 'lineColor', attr: 'LineColor', def: '#2D7DD2' },
    { key: 'lineThickness', attr: 'LineThickness', def: '2' },
    { key: 'lineStyle', attr: 'LineStyle', def: 'Solid' },
    { key: 'markerStyle', attr: 'MarkerStyle', def: 'Dot' },
    { key: 'markerSize', attr: 'MarkerSize', def: '8' },
    { key: 'connected', attr: 'Connected', def: 'True' }
];

/** The chart-level styling properties the Series editor owns. They drew the implicit series (and
 *  still do for a chart the editor has never touched), so saving real series clears them. */
export const CHART_LEGACY_SERIES_ATTRS = [
    'LineColor', 'LineThickness', 'LineStyle', 'MarkerStyle', 'MarkerSize', 'Connected'
];

/** Axis fields, mirroring the C# `Axis` class. `Position` is validated per kind (see
 *  {@link axisPositionDefault}); every other field is a plain attribute with a renderer default. */
export const CHART_AXIS_FIELDS: { key: string; attr: string; def: string }[] = [
    { key: 'position', attr: 'Position', def: '' },
    { key: 'showAxis', attr: 'ShowAxis', def: 'True' },
    { key: 'axisColor', attr: 'AxisColor', def: '#666666' },
    { key: 'showMajorTicks', attr: 'ShowMajorTicks', def: 'True' },
    { key: 'majorTickLength', attr: 'MajorTickLength', def: '6' },
    { key: 'showMinorTicks', attr: 'ShowMinorTicks', def: 'True' },
    { key: 'minorTickLength', attr: 'MinorTickLength', def: '3' },
    { key: 'showTickLabels', attr: 'ShowTickLabels', def: 'True' },
    { key: 'tickLabelFontSize', attr: 'TickLabelFontSize', def: '11' },
    { key: 'showAxisName', attr: 'ShowAxisName', def: 'True' },
    { key: 'name', attr: 'Name', def: '' }
];

/** The chart-level (legacy) axis properties a saved common Axis object replaces: the Axis carries
 *  every one of them, so leaving the scalars behind would mean two sources of truth. `MinX/MaxX/
 *  MinY/MaxY` are NOT here — they scale the plot, they do not style an axis. */
export const CHART_AXIS_LEGACY_ATTRS = [
    'ShowAxes', 'AxisColor', 'ShowMajorTicks', 'MajorTickLength', 'ShowMinorTicks', 'MinorTickLength',
    'ShowTickLabels', 'TickLabelFontSize', 'ShowAxisTitles', 'XAxisTitle', 'YAxisTitle'
];

/** The two bundled chart tags. */
export function isChartTag(tag: string): boolean {
    return tag === 'GrumpyLinePlot' || tag === 'GrumpyXYPlot';
}

/** The series element tag a chart holds — the chart tag decides the series type. */
export function seriesTagFor(chartTag: string): string {
    return chartTag === 'GrumpyLinePlot' ? 'LineSeries' : 'XYSeries';
}

/** 'y' for a Y axis, 'x' for an X axis. */
export type AxisKind = 'x' | 'y';

/** The position a Y axis defaults to (Left) and an X axis defaults to (Bottom). */
export function axisPositionDefault(kind: AxisKind): string {
    return kind === 'y' ? 'Left' : 'Bottom';
}

/** The positions an axis of this kind may take. */
export function axisPositions(kind: AxisKind): string[] {
    return kind === 'y' ? ['Left', 'Right'] : ['Top', 'Bottom'];
}

// ---------------------------------------------------------------- spreadsheet pairing
/** A column letter to a zero-based index ("A" = 0, "B" = 1, "AA" = 26) — mirrors the C#'s
 *  `SpreadsheetReader.ColumnIndex`, because the two must agree on what a column name means. */
export function columnIndex(column: string): number {
    let index = 0;
    for (const ch of column.trim().toUpperCase()) {
        const code = ch.charCodeAt(0);
        if (code < 65 || code > 90) continue;
        index = index * 26 + (code - 64);
    }
    return index - 1;
}

/** The column letters a few steps along ("B"+2 = "D", "Z"+2 = "AB") — mirrors the C#. */
export function columnAfter(column: string, step: number): string {
    let index = columnIndex(column) + step;
    if (index < 0) index = 0;
    let text = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
        text = String.fromCharCode(65 + ((n - 1) % 26)) + text;
    }
    return text;
}

/** The default X/Y column pair of the nth series: 1 → B/C, 2 → D/E, 3 → F/G … (the rule the
 *  renderer applies when a series names no columns of its own). */
export function defaultSeriesColumns(index: number): { x: string; y: string } {
    return { x: columnAfter('B', index * 2), y: columnAfter('C', index * 2) };
}

// ---------------------------------------------------------------- reading
/** An attribute, or the renderer's default when it is absent or empty. */
function readAttr(el: Element, key: string, def: string): string {
    const v = el.getAttribute(key);
    return v == null || v === '' ? def : v;
}

/** The chart's series elements, in document order. */
export function chartSeriesChildren(el: Element): Element[] {
    const out: Element[] = [];
    for (let i = 0; i < el.childNodes.length; i++) {
        const kid = el.childNodes[i] as Element;
        if (kid.nodeType !== 1) continue;
        const tag = localName(kid.tagName);
        if (tag === 'LineSeries' || tag === 'XYSeries') out.push(kid);
    }
    return out;
}

/** One series element's field values (attribute, else the renderer's default). */
export function chartSeriesFields(node: Element): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of CHART_SERIES_FIELDS) out[f.key] = readAttr(node, f.attr, f.def);
    return out;
}

/** Every series of a chart, ready for the Series editor: the explicit children in order, or — for a
 *  chart that still draws the implicit single line — one entry seeded from its own styling rows.
 *  `defX`/`defY` carry the column the series falls back to, for the editor's placeholders. */
export function chartSeriesOf(el: Element): Record<string, string>[] {
    const kids = chartSeriesChildren(el);
    const type = localName(el.tagName) === 'GrumpyLinePlot' ? 'Line' : 'XY';
    if (kids.length === 0) {
        const seeded: Record<string, string> = {
            src: '-1',
            type,
            defX: readAttr(el, 'XColumn', 'B'),
            defY: readAttr(el, 'YColumn', 'C')
        };
        for (const f of CHART_SERIES_FIELDS) {
            // The implicit line is styled by the CHART's properties, so pre-fill from them. The
            // columns stay empty on purpose: empty means "the chart's own columns" at render time.
            const legacy = CHART_LEGACY_SERIES_ATTRS.includes(f.attr);
            seeded[f.key] = legacy ? readAttr(el, f.attr, f.def) : f.def;
        }
        return [seeded];
    }
    return kids.map((kid, i) => {
        const fields = chartSeriesFields(kid);
        const pair = defaultSeriesColumns(i);
        return {
            src: String(i),
            type: localName(kid.tagName) === 'LineSeries' ? 'Line' : 'XY',
            // Empty = the chart's own X column (common) or this series' place in the B/C, D/E pairing.
            defX: fields.axisMode === 'PerSeries' && fields.type !== 'Line' ? pair.x : readAttr(el, 'XColumn', 'B'),
            defY: pair.y,
            ...fields
        };
    });
}

/** One axis element's field values (attribute, else the renderer's default). */
export function chartAxisFields(node: Element, kind: AxisKind): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of CHART_AXIS_FIELDS) {
        out[f.key] = readAttr(node, f.attr, f.attr === 'Position' ? axisPositionDefault(kind) : f.def);
    }
    return out;
}

/** The `<charts:Something.XAxis>` / `.YAxis` property element of an element, if it has one. */
function axisProperty(el: Element, kind: AxisKind): Element | undefined {
    const want = kind === 'x' ? '.XAxis' : '.YAxis';
    for (let i = 0; i < el.childNodes.length; i++) {
        const kid = el.childNodes[i] as Element;
        if (kid.nodeType !== 1) continue;
        if (kid.tagName.endsWith(want)) return kid;
    }
    return undefined;
}

/** The `<charts:Axis …/>` inside a series' (or the chart's) axis property element, if it has one. */
export function chartAxisOf(el: Element, kind: AxisKind): Record<string, string> | null {
    const prop = axisProperty(el, kind);
    if (!prop) return null;
    for (let i = 0; i < prop.childNodes.length; i++) {
        const kid = prop.childNodes[i] as Element;
        if (kid.nodeType === 1 && localName(kid.tagName) === 'Axis') return chartAxisFields(kid, kind);
    }
    return null;
}

/** One series' axes, for the Axis editor. */
export interface SeriesAxes {
    title: string;
    type: string;
    axisMode: string;
    x: Record<string, string> | null;
    y: Record<string, string> | null;
}

/** Everything the Axis editor needs: the chart's two COMMON axes (null while the chart-level scalars
 *  still describe them), what those scalars currently say, and one entry per series. */
export interface ChartAxesInfo {
    commonX: Record<string, string> | null;
    commonY: Record<string, string> | null;
    legacy: Record<string, string>;
    series: SeriesAxes[];
}

export function chartAxesOf(el: Element): ChartAxesInfo {
    const legacy: Record<string, string> = {};
    // What the chart-level scalars say, so the editor can pre-fill the common axes from a form that
    // has never been through this editor (the Axis object replaces them once it is saved).
    legacy.showAxis = readAttr(el, 'ShowAxes', 'True');
    legacy.axisColor = readAttr(el, 'AxisColor', '#666666');
    legacy.showMajorTicks = readAttr(el, 'ShowMajorTicks', 'True');
    legacy.majorTickLength = readAttr(el, 'MajorTickLength', '6');
    legacy.showMinorTicks = readAttr(el, 'ShowMinorTicks', 'True');
    legacy.minorTickLength = readAttr(el, 'MinorTickLength', '3');
    legacy.showTickLabels = readAttr(el, 'ShowTickLabels', 'True');
    legacy.tickLabelFontSize = readAttr(el, 'TickLabelFontSize', '11');
    legacy.showAxisName = readAttr(el, 'ShowAxisTitles', 'True');
    legacy.xName = readAttr(el, 'XAxisTitle', '');
    legacy.yName = readAttr(el, 'YAxisTitle', '');

    return {
        commonX: chartAxisOf(el, 'x'),
        commonY: chartAxisOf(el, 'y'),
        legacy,
        series: chartSeriesChildren(el).map((kid) => {
            const fields = chartSeriesFields(kid);
            return {
                title: fields.title,
                type: localName(kid.tagName) === 'LineSeries' ? 'Line' : 'XY',
                axisMode: fields.axisMode,
                x: chartAxisOf(kid, 'x'),
                y: chartAxisOf(kid, 'y')
            };
        })
    };
}

// ---------------------------------------------------------------- writing
/** Sets an attribute, removing it when the value equals the renderer's default. */
function writeAttr(model: XamlModel, el: Element, attr: string, value: string, def: string): void {
    const text = value.trim();
    model.setProperty(el, attr, text === def ? '' : text);
}

/** Writes one field set onto an `<charts:Axis>` element. */
function writeAxisFields(model: XamlModel, node: Element, kind: AxisKind, values: Record<string, unknown>): void {
    for (const f of CHART_AXIS_FIELDS) {
        const def = f.attr === 'Position' ? axisPositionDefault(kind) : f.def;
        writeAttr(model, node, f.attr, String(values[f.key] ?? def), def);
    }
}

/** Creates (or updates) the `<charts:TAG.XAxis>` property element holding one `<charts:Axis/>`. */
function writeAxis(model: XamlModel, owner: Element, kind: AxisKind, values: Record<string, unknown> | null): void {
    const existing = axisProperty(owner, kind);
    if (values == null) {
        // Deleting a per-series axis is simply not having the property element any more.
        if (existing) owner.removeChild(existing);
        return;
    }
    const prop = existing ?? model.createElement(`<${owner.tagName}.${kind === 'x' ? 'XAxis' : 'YAxis'}/>`);
    let axis: Element | undefined;
    for (let i = 0; i < prop.childNodes.length; i++) {
        const kid = prop.childNodes[i] as Element;
        if (kid.nodeType === 1 && localName(kid.tagName) === 'Axis') axis = kid;
    }
    if (!axis) {
        axis = model.createElement('<charts:Axis/>');
        prop.appendChild(axis);
    }
    writeAxisFields(model, axis, kind, values);
    if (!existing) owner.appendChild(prop);
}

/** Rewrites a chart's series from the editor's list: an entry keeps its element (so a series' nested
 *  X/Y axis children survive) and is re-appended in the new order, new entries are created and
 *  dropped ones removed. A series can never change TYPE — the chart tag decides it. */
export function writeChartSeries(model: XamlModel, el: Element, items: unknown[]): void {
    const childTag = seriesTagFor(localName(el.tagName));
    const before = chartSeriesChildren(el);
    const keep: Element[] = [];
    for (const raw of items) {
        const it = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
        const src = parseInt(String(it.src ?? '-1'), 10);
        let node = Number.isInteger(src) && src >= 0 && src < before.length ? before[src] : undefined;
        if (node && localName(node.tagName) !== childTag) node = undefined;
        if (!node) node = model.createElement(`<charts:${childTag}/>`);
        for (const f of CHART_SERIES_FIELDS) writeAttr(model, node, f.attr, String(it[f.key] ?? ''), f.def);
        keep.push(node);
    }
    // appendChild MOVES an existing child to the end, so appending in list order reorders them.
    for (const node of keep) el.appendChild(node);
    for (const node of before) if (!keep.includes(node)) el.removeChild(node);
    // The chart's own styling rows are gone from the panel, so clear them once series exist.
    if (keep.length > 0) for (const attr of CHART_LEGACY_SERIES_ATTRS) model.setProperty(el, attr, '');
}

/** Rewrites a chart's axes: the two COMMON axes as the chart's own property elements plus one
 *  optional X/Y axis per series (index-matched to the series elements, in order). Saving the common
 *  axes retires the chart-level scalars they replace, so there is exactly one source of truth. */
export function writeChartAxes(
    model: XamlModel,
    el: Element,
    commonX: Record<string, unknown> | null,
    commonY: Record<string, unknown> | null,
    series: { x: Record<string, unknown> | null; y: Record<string, unknown> | null }[]
): void {
    writeAxis(model, el, 'x', commonX);
    writeAxis(model, el, 'y', commonY);
    if (commonX != null && commonY != null) {
        for (const attr of CHART_AXIS_LEGACY_ATTRS) model.setProperty(el, attr, '');
    }
    chartSeriesChildren(el).forEach((kid, i) => {
        const entry = series[i];
        if (!entry) return;
        writeAxis(model, kid, 'x', entry.x ?? null);
        writeAxis(model, kid, 'y', entry.y ?? null);
    });
}
