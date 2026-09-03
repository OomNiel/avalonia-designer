import { DOMParser } from '@xmldom/xmldom';
import { CHROME_TITLEBAR_HEIGHT } from './formTemplates';

/** Local (namespace-stripped) name of a tag, e.g. "chrome:ChromeWindow" -> "ChromeWindow". */
export function localName(tagName: string): string {
    const i = tagName.indexOf(':');
    return i >= 0 ? tagName.slice(i + 1) : tagName;
}

/**
 * The pixel size of a Grid cell, computed from the preview host's gridCells boundaries
 * (v = column x-boundaries, h = row y-boundaries, each with length n+1 for n cells).
 * Returns undefined when the cell is out of range or has no measurable size.
 */
export function gridCellPixelSize(
    cells: { v: number[]; h: number[] } | undefined,
    row: number,
    col: number
): { w: number; h: number } | undefined {
    if (!cells || !cells.v || !cells.h) return undefined;
    if (col < 0 || col >= cells.v.length - 1 || row < 0 || row >= cells.h.length - 1) return undefined;
    const w = Math.round(cells.v[col + 1] - cells.v[col]);
    const h = Math.round(cells.h[row + 1] - cells.h[row]);
    if (w <= 0 || h <= 0) return undefined;
    return { w, h };
}

/**
 * XAML elements that are NOT instantiable designer controls and whose sub-trees
 * should not be visited/named (styles, templates, resources, etc.).
 */
const NON_CONTROL = new Set([
    'Style', 'Styles', 'DataTemplate', 'ControlTemplate', 'ItemsPanelTemplate',
    'Setter', 'SetterProperty', 'Triggers', 'Transitions', 'Transition',
    'Animation', 'Animations', 'KeyFrame', 'Resources', 'ResourceDictionary',
    'Binding', 'TemplateBinding', 'MultiBinding', 'ColumnDefinition', 'RowDefinition',
    'ColumnDefinitions', 'RowDefinitions', 'GridLength', 'SolidColorBrush', 'GradientStop'
]);

/**
 * Event-handler attributes (e.g. `Click`, `TextChanged`). The headless preview
 * host cannot resolve code-behind handlers, so these are stripped from the XAML
 * used for the preview render but KEPT in the saved file.
 */
const EVENT_ATTRS = new Set([
    'Click', 'DoubleTapped', 'Tapped', 'RightTapped', 'Holding',
    'PointerPressed', 'PointerReleased', 'PointerMoved', 'PointerEntered', 'PointerExited',
    'PointerCaptureLost', 'PointerWheelChanged', 'PointerTouchPadTiltChanged',
    'KeyDown', 'KeyUp', 'TextInput', 'TextCompositionStart', 'TextCompositionEnd', 'TextCompositionUpdate',
    'TextChanged', 'SelectionChanged', 'IsCheckedChanged',
    'Loaded', 'Unloaded', 'SizeChanged', 'AttachedToVisualTree', 'DetachedFromVisualTree',
    'GotFocus', 'LostFocus', 'ScrollChanged', 'PropertyChanged', 'Opened', 'Closed',
    'DragOver', 'Drop', 'DragEnter', 'DragLeave', 'DragStart', 'DragEnd'
]);

/**
 * Tags that are single-content containers (ContentControl / HeaderedContentControl
 * subclasses). In XAML they accept at most ONE child element (their Content). When the
 * designer needs to place a second child, it wraps both in a Canvas so the XAML stays valid.
 */
export const SINGLE_CONTENT_TAGS = new Set([
    'UserControl', 'ContentControl', 'TabItem', 'Border', 'ScrollViewer', 'Expander'
]);

function elementChildren(el: Element): Element[] {
    const out: Element[] = [];
    for (let i = 0; i < el.childNodes.length; i++) {
        const c = el.childNodes.item(i);
        if (c && c.nodeType === 1) out.push(c as Element);
    }
    return out;
}

function escapeAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeText(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function prettyNode(node: Node, indent: number, sb: string[], strip: ReadonlyMap<Element, string>, stripEvents: boolean): void {
    if (node.nodeType === 1) {
        const el = node as Element;
        sb.push('  '.repeat(indent) + '<' + el.tagName);
        const stripName = strip.get(el);
        for (let i = 0; i < el.attributes.length; i++) {
            const a = el.attributes.item(i);
            if (!a) continue;
            if (stripName && (a.name === 'x:Name' || a.name === 'Name') && a.value === stripName) continue;
            if (stripEvents && EVENT_ATTRS.has(a.name)) continue;
            sb.push(` ${a.name}="${escapeAttr(a.value)}"`);
        }
        const kids = Array.from(el.childNodes);
        const childEls = kids.filter((c) => c.nodeType === 1);
        const hasText = kids.some((c) => c.nodeType === 3 && (c.nodeValue || '').trim().length > 0);
        if (childEls.length === 0 && !hasText) {
            sb.push('/>');
            return;
        }
        sb.push('>');
        if (hasText) {
            const text = kids
                .map((c) => (c.nodeType === 3 ? c.nodeValue || '' : c.nodeType === 4 ? `<![CDATA[${c.nodeValue || ''}]]>` : ''))
                .join('')
                .trim();
            if (text) sb.push(escapeText(text));
        }
        if (childEls.length > 0) sb.push('\n');
        for (const c of childEls) {
            prettyNode(c, indent + 1, sb, strip, stripEvents);
            sb.push('\n');
        }
        sb.push('  '.repeat(indent) + '</' + el.tagName + '>');
    } else if (node.nodeType === 8) {
        sb.push('  '.repeat(indent) + '<!--' + (node.nodeValue || '') + '-->');
    } else if (node.nodeType === 4) {
        sb.push('  '.repeat(indent) + '<![CDATA[' + (node.nodeValue || '') + ']]>');
    }
}

export interface Bounds { x: number; y: number; width: number; height: number; }

/**
 * In-memory model of an .axaml file backed by an XML DOM. All editing operations
 * (add / move / resize / set-property) mutate the DOM; the model can serialize
 * back to tidy XAML. Control identity is by x:Name; unnamed controls get
 * auto-generated names that are stripped again when saving.
 */
export class XamlModel {
    doc: Document;
    private autoNames = new Map<Element, string>();

    constructor(xml: string) {
        const parser = new DOMParser({
            errorHandler: {
                warning: () => { /* ignore */ },
                error: () => { /* ignore */ },
                fatalError: (m) => { throw new Error('Invalid XAML: ' + m); }
            }
        });
        const parsed = parser.parseFromString(xml, 'text/xml');
        if (!parsed.documentElement) throw new Error('XAML has no root element.');
        this.doc = parsed;
    }

    get root(): Element {
        return this.doc.documentElement;
    }

    ensureXNamespace(): void {
        const r = this.root;
        if (!r.getAttribute('xmlns:x')) {
            r.setAttribute('xmlns:x', 'http://schemas.microsoft.com/winfx/2006/xaml');
        }
    }

    /** Ensures the `chrome` prefix maps to the bundled AvaloniaChrome namespace (AnchorHelper). */
    ensureChromeNamespace(): void {
        const r = this.root;
        if (!r.getAttribute('xmlns:chrome')) {
            r.setAttribute('xmlns:chrome', 'using:AvaloniaChrome');
        }
    }

    /** Ensures an arbitrary xmlns prefix is declared on the root (e.g. `dg` for DataGrid). */
    ensureXmlns(prefix: string, uri: string): void {
        const r = this.root;
        if (!r.getAttribute(`xmlns:${prefix}`)) {
            r.setAttribute(`xmlns:${prefix}`, uri);
        }
    }

    /**
     * Converts the root `<Window>` into `<chrome:ChromeWindow>` (the bundled custom title bar).
     * Copies attributes + children, declares the chrome namespace, sets `TitleBarTitle` from the
     * window's Title, and grows the height by the title bar so the body area is unchanged.
     * Returns true if a conversion happened.
     */
    convertRootToChromeWindow(title: string): boolean {
        const r = this.root;
        const tag = localName(r.tagName);
        if (tag === 'ChromeWindow') return false;               // already custom
        if (tag !== 'Window') return false;                     // only Window roots can convert
        const newRoot = this.doc.createElement('chrome:ChromeWindow');
        for (let i = 0; i < r.attributes.length; i++) {
            const a = r.attributes[i];
            newRoot.setAttribute(a.name, a.value);
        }
        while (r.firstChild) newRoot.appendChild(r.firstChild);
        this.doc.replaceChild(newRoot, r);
        this.ensureChromeNamespace();
        newRoot.setAttribute('TitleBarTitle', title);
        const h = parseFloat(newRoot.getAttribute('Height') || '');
        if (Number.isFinite(h) && h > 0) newRoot.setAttribute('Height', String(Math.round(h + CHROME_TITLEBAR_HEIGHT)));
        if (newRoot.getAttribute('xmlns:d')) {
            const dh = parseFloat(newRoot.getAttribute('d:DesignHeight') || '');
            if (Number.isFinite(dh) && dh > 0) newRoot.setAttribute('d:DesignHeight', String(Math.round(dh + CHROME_TITLEBAR_HEIGHT)));
        }
        return true;
    }

    /** All designable control elements in declaration order (skips templates/styles/resources and property elements). */
    controlElements(): Element[] {
        const out: Element[] = [];
        const walk = (el: Element): void => {
            const ln = localName(el.tagName);
            if (NON_CONTROL.has(ln)) return;
            if (ln.includes('.')) {
                for (const c of elementChildren(el)) walk(c);
                return;
            }
            out.push(el);
            for (const c of elementChildren(el)) walk(c);
        };
        walk(this.root);
        return out;
    }

    /**
     * Ensures every non-root control has a unique x:Name so the previewer host can
     * report bounds keyed by name. Generated names are tracked so they can be
     * stripped again when saving (keeps the user's file free of auto names).
     */
    ensureNames(): void {
        this.ensureXNamespace();
        const used = new Set<string>();
        for (const el of this.controlElements()) {
            const n = el.getAttribute('x:Name') || el.getAttribute('Name');
            if (n) { used.add(n); continue; }
            if (el === this.root) continue;
            let name = '';
            let i = 1;
            do { name = `_${localName(el.tagName)}${i++}`; } while (used.has(name));
            used.add(name);
            el.setAttribute('x:Name', name);
            this.autoNames.set(el, name);
        }
    }

    serialize(forSave = false): string {
        this.ensureNames();
        const sb: string[] = [];
        // The render pass strips event-handler attributes (the host has no code-behind);
        // the save pass keeps them.
        prettyNode(this.doc.documentElement, 0, sb, forSave ? this.autoNames : new Map(), !forSave);
        return sb.join('') + '\n';
    }

    findByName(name: string): Element | undefined {
        return this.controlElements().find(
            (e) => e.getAttribute('x:Name') === name || e.getAttribute('Name') === name
        );
    }

    /**
     * True if the control has a user-assigned name (from the Name property).
     * Auto-generated in-memory names (`_TagN`) do NOT count as real names.
     */
    hasExplicitName(el: Element): boolean {
        const n = el.getAttribute('x:Name') || el.getAttribute('Name');
        return !!n && !this.autoNames.has(el);
    }

    /** Assigns a user-visible name and forgets any auto-generated name for the element. */
    setExplicitName(el: Element, name: string): void {
        el.removeAttribute('Name');
        el.setAttribute('x:Name', name);
        this.autoNames.delete(el);
    }

    /**
     * Named, user-visible controls in the document (name + local type). Excludes the root
     * element and in-memory auto-names. Used to generate VB accessor properties.
     */
    namedControls(): { name: string; type: string }[] {
        const out: { name: string; type: string }[] = [];
        for (const el of this.controlElements()) {
            if (el === this.root) continue;
            if (this.autoNames.has(el)) continue; // in-memory name only, not in the saved XAML
            const name = el.getAttribute('x:Name') || el.getAttribute('Name') || '';
            if (!name) continue;
            out.push({ name, type: localName(el.tagName) });
        }
        return out;
    }

    /**
     * The first free cell (row-major) in a Grid, honouring existing children and their
     * row/column spans. A Grid with no definitions is treated as 1×1. `ignore` (used by
     * moveTo, where the element is already attached) is excluded from the occupancy scan.
     */
    nextFreeCell(el: Element, ignore?: Element): { row: number; col: number } {
        const rows = Math.max(1, this.gridSizes(el, 'rows').length);
        const cols = Math.max(1, this.gridSizes(el, 'cols').length);
        const used: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
        for (const child of elementChildren(el)) {
            if (child === ignore) continue;
            if (localName(child.tagName).includes('.')) continue; // property elements
            const r = Math.max(0, parseInt(child.getAttribute('Grid.Row') || '0', 10));
            const c = Math.max(0, parseInt(child.getAttribute('Grid.Column') || '0', 10));
            const rs = Math.max(1, parseInt(child.getAttribute('Grid.RowSpan') || '1', 10));
            const cs = Math.max(1, parseInt(child.getAttribute('Grid.ColumnSpan') || '1', 10));
            for (let rr = r; rr < Math.min(rows, r + rs); rr++)
                for (let cc = c; cc < Math.min(cols, c + cs); cc++)
                    used[rr][cc] = true;
        }
        for (let r = 0; r < rows; r++)
            for (let c = 0; c < cols; c++)
                if (!used[r][c]) return { row: r, col: c };
        return { row: 0, col: 0 }; // grid full — stack in the first cell
    }

    addControl(parent: Element, snippet: string, pos?: { x: number; y: number }): Element {
        this.ensureXNamespace();
        const tmp = new DOMParser({
            errorHandler: { warning: () => { /* ignore */ }, error: () => { /* ignore */ }, fatalError: () => { /* ignore */ } }
        }).parseFromString(`<xaml xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">${snippet}</xaml>`, 'text/xml');
        const el = tmp.documentElement.firstChild as Element | null;
        if (!el) throw new Error('Empty control snippet.');

        // DataGrid lives in its own assembly — a bare <DataGrid> doesn't compile in Avalonia 12,
        // so its snippet uses the `dg` prefix and the root must declare xmlns:dg for it to build.
        if (localName(el.tagName) === 'DataGrid') {
            this.ensureXmlns('dg', 'using:Avalonia.Controls');
        }

        const parentTag = localName(parent.tagName);
        const windowLike = parentTag === 'Window' || /window$/i.test(parentTag);
        const isSingleContent = SINGLE_CONTENT_TAGS.has(parentTag) || windowLike;

        if (isSingleContent) {
            const existingKids = elementChildren(parent).filter((k) => !localName(k.tagName).includes('.'));
            if (existingKids.length > 0) {
                // If the existing sole child is already a Canvas, just drop into it.
                if (existingKids.length === 1 && localName(existingKids[0].tagName) === 'Canvas') {
                    const canvas = existingKids[0];
                    canvas.appendChild(el);
                    if (pos) {
                        el.setAttribute('Canvas.Left', String(Math.round(pos.x)));
                        el.setAttribute('Canvas.Top', String(Math.round(pos.y)));
                    }
                    return el;
                }
                // Otherwise wrap the existing content + new element in a Canvas so the
                // single-content container (TabItem/Border/etc.) stays valid XAML.
                const canvas = this.createElement('<Canvas/>');
                for (const kid of existingKids) {
                    parent.removeChild(kid);
                    canvas.appendChild(kid);
                }
                parent.appendChild(canvas);
                canvas.appendChild(el);
                if (pos) {
                    el.setAttribute('Canvas.Left', String(Math.round(pos.x)));
                    el.setAttribute('Canvas.Top', String(Math.round(pos.y)));
                }
                return el;
            }
        }

        if (parentTag === 'Grid') {
            // A control added to a Grid goes into the first free cell — each new child lands in
            // its own cell instead of stacking in cell 0,0 (what novices expect).
            const cell = this.nextFreeCell(parent);
            el.setAttribute('Grid.Row', String(cell.row));
            el.setAttribute('Grid.Column', String(cell.col));
            parent.appendChild(el);
        } else {
            parent.appendChild(el);
            if (pos && parentTag === 'Canvas') {
                el.setAttribute('Canvas.Left', String(Math.round(pos.x)));
                el.setAttribute('Canvas.Top', String(Math.round(pos.y)));
            }
        }
        return el;
    }

    /** Parses a single-element XAML fragment and returns the element (not yet attached). */
    createElement(xml: string): Element {
        const tmp = new DOMParser({
            errorHandler: { warning: () => { /* ignore */ }, error: () => { /* ignore */ }, fatalError: () => { /* ignore */ } }
        }).parseFromString(`<xaml xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">${xml}</xaml>`, 'text/xml');
        const el = tmp.documentElement.firstChild as Element | null;
        if (!el) throw new Error('Empty element.');
        return el;
    }

    setProperty(el: Element, key: string, value: string): void {
        // Rotation isn't a plain attribute — it's written as a RenderTransform property element.
        if (key === 'Angle') { this.setImageAngle(el, value); return; }
        // A Rectangle's single 'Corner Radius' (designer-only key) is stored as RadiusX AND
        // RadiusY — they are always identical, so one field writes/clears both.
        if (key === 'Radius') {
            if (value === '') {
                if (el.hasAttribute('RadiusX')) el.removeAttribute('RadiusX');
                if (el.hasAttribute('RadiusY')) el.removeAttribute('RadiusY');
            } else {
                el.setAttribute('RadiusX', value);
                el.setAttribute('RadiusY', value);
            }
            return;
        }
        if (value === '') {
            if (el.hasAttribute(key)) el.removeAttribute(key);
            return;
        }
        el.setAttribute(key, value);
    }

    /** A Grid's row sizes (RowDefinition Height) or column sizes (ColumnDefinition Width), in order. */
    gridSizes(el: Element, kind: 'rows' | 'cols'): string[] {
        const propName = kind === 'rows' ? 'Grid.RowDefinitions' : 'Grid.ColumnDefinitions';
        const sizeAttr = kind === 'rows' ? 'Height' : 'Width';
        const defs = elementChildren(el).find((k) => localName(k.tagName) === propName);
        if (!defs) return [];
        return elementChildren(defs).map((d) => d.getAttribute(sizeAttr) || '*');
    }

    /**
     * Replaces a Grid's RowDefinitions/ColumnDefinitions with the given sizes
     * ('Auto', '*', '2*', '100'…). An empty array removes the definitions entirely
     * (back to the implicit single cell).
     */
    setGridDefinitions(el: Element, kind: 'rows' | 'cols', sizes: string[]): void {
        const propName = kind === 'rows' ? 'Grid.RowDefinitions' : 'Grid.ColumnDefinitions';
        const childTag = kind === 'rows' ? 'RowDefinition' : 'ColumnDefinition';
        const sizeAttr = kind === 'rows' ? 'Height' : 'Width';
        for (const k of elementChildren(el)) {
            if (localName(k.tagName) === propName) el.removeChild(k);
        }
        if (!sizes || sizes.length === 0) return;
        const defs = this.createElement(`<${propName}/>`);
        for (const s of sizes) {
            defs.appendChild(this.createElement(`<${childTag} ${sizeAttr}="${escapeAttr(s)}"/>`));
        }
        el.appendChild(defs);
    }

    /**
     * When an Image is placed into a Grid cell, size it to that cell (from the preview's
     * gridCells boundaries). Only Images in a Grid are affected — every other control keeps
     * its own natural/snippet size. Uses the assigned Grid.Row/Grid.Column attributes.
     */
    sizeElementToGridCell(el: Element, cells: { v: number[]; h: number[] } | undefined): void {
        if (localName(el.tagName) !== 'Image') return;
        const parent = el.parentNode as Element | null;
        if (!parent || parent.nodeType !== 1 || localName(parent.tagName) !== 'Grid') return;
        const row = Math.max(0, parseInt(el.getAttribute('Grid.Row') || '0', 10));
        const col = Math.max(0, parseInt(el.getAttribute('Grid.Column') || '0', 10));
        const size = gridCellPixelSize(cells, row, col);
        if (!size) return;
        this.setProperty(el, 'Width', String(size.w));
        this.setProperty(el, 'Height', String(size.h));
    }

    /**
     * Dynamically tracks every Image that lives in a Grid cell to its cell's CURRENT pixel size
     * (from the preview frame's gridCells), so its Width/Height follow the cell — when the grid
     * is resized, rows/columns change, or the form resizes, the Images update to keep filling
     * their cells. Images whose name is in `skipNames` are left at their manual size (opt-out).
     * Returns true if any Width/Height changed (the caller may re-render once).
     */
    syncImagesToGridCells(cells: Record<string, { v: number[]; h: number[] }>, skipNames?: Set<string>): boolean {
        if (!cells) return false;
        let changed = false;
        for (const el of this.controlElements()) {
            if (localName(el.tagName) !== 'Image') continue;
            if (skipNames?.has(el.getAttribute('x:Name') || el.getAttribute('Name') || '')) continue;
            const parent = el.parentNode as Element | null;
            if (!parent || parent.nodeType !== 1 || localName(parent.tagName) !== 'Grid') continue;
            const gname = parent.getAttribute('x:Name') || parent.getAttribute('Name') || null;
            if (!gname || !cells[gname]) continue;
            const before = `${el.getAttribute('Width')}|${el.getAttribute('Height')}`;
            this.sizeElementToGridCell(el, cells[gname]);
            const after = `${el.getAttribute('Width')}|${el.getAttribute('Height')}`;
            if (before !== after) changed = true;
        }
        return changed;
    }

    /** An element's rotation in degrees from its `<X.RenderTransform><RotateTransform Angle="…"/></X.RenderTransform>` ('' when none). */
    imageAngle(el: Element): string {
        for (const prop of elementChildren(el)) {
            if (localName(prop.tagName).endsWith('.RenderTransform')) {
                for (const t of elementChildren(prop)) {
                    if (localName(t.tagName) === 'RotateTransform') {
                        const a = t.getAttribute('Angle');
                        if (a) return a;
                    }
                }
            }
        }
        return '';
    }

    /**
     * Sets an element's rotation (degrees) by writing (or updating) its
     * `<X.RenderTransform><RotateTransform Angle="…"/></X.RenderTransform>`. An empty or 0 angle
     * removes the transform so the XAML stays clean.
     */
    setImageAngle(el: Element, angle: string): void {
        const a = angle.trim();
        let propEl: Element | null = null;
        for (const c of elementChildren(el)) {
            if (localName(c.tagName).endsWith('.RenderTransform')) { propEl = c; break; }
        }
        if (!a || a === '0' || a === '0.0' || a === '0,0') {
            if (propEl) el.removeChild(propEl);
            return;
        }
        if (!propEl) {
            propEl = this.createElement(`<${localName(el.tagName)}.RenderTransform/>`);
            el.appendChild(propEl);
        }
        let rot: Element | null = null;
        for (const t of elementChildren(propEl)) {
            if (localName(t.tagName) === 'RotateTransform') { rot = t; break; }
        }
        if (!rot) {
            rot = this.createElement('<RotateTransform/>');
            propEl.appendChild(rot);
        }
        rot.setAttribute('Angle', a);
    }

    move(el: Element, dx: number, dy: number, bounds: Bounds): void {
        const parent = el.parentNode as Element | null;
        if (parent && localName(parent.tagName) === 'Canvas') {
            const cx = parseNumAttr(el, 'Canvas.Left', bounds.x);
            const cy = parseNumAttr(el, 'Canvas.Top', bounds.y);
            el.setAttribute('Canvas.Left', String(Math.round(cx + dx)));
            el.setAttribute('Canvas.Top', String(Math.round(cy + dy)));
            return;
        }
        const m = parseMargin(el.getAttribute('Margin'));
        el.setAttribute('Margin', `${round1(m.l + dx)},${round1(m.t + dy)},${round1(m.r)},${round1(m.b)}`);
    }

    resize(el: Element, dx: number, dy: number, bounds: Bounds, corner: string): void {
        // A Line has no Width/Height — its size IS its geometry (Start/End points), so resizing
        // must scale the points instead of setting Width/Height.
        if (localName(el.tagName) === 'Line') { this.resizeLine(el, dx, dy, bounds, corner); return; }
        // Supports all 8 handles (nw/n/ne/e/se/s/sw/w). East/south grow the size; west/north move
        // the top-left (Canvas.Left/Top or Margin) while shrinking, so the opposite edge stays put.
        // The drag outline in designer.js uses the SAME formula so the drop matches what was shown.
        const MIN = 5;
        let w = bounds.width;
        let h = bounds.height;
        if (corner.includes('e')) w += dx;
        if (corner.includes('s')) h += dy;
        if (corner.includes('w')) w -= dx;
        if (corner.includes('n')) h -= dy;
        w = Math.max(MIN, w);
        h = Math.max(MIN, h);
        const parent = el.parentNode as Element | null;
        const inCanvas = !!parent && localName(parent.tagName) === 'Canvas';
        if (inCanvas) {
            // Canvas.Left/Top are PARENT-relative, while bounds.x/y are the host's window-absolute
            // coords (a body canvas below a ChromeWindow title bar sits offset in y). Move the edge
            // by the DELTA from the control's CURRENT attribute (like move()) so the dragged edge
            // lands exactly where it was dropped — never off by the parent's window offset.
            if (corner.includes('w')) el.setAttribute('Canvas.Left', String(Math.round(parseNumAttr(el, 'Canvas.Left', bounds.x) + dx)));
            if (corner.includes('n')) el.setAttribute('Canvas.Top', String(Math.round(parseNumAttr(el, 'Canvas.Top', bounds.y) + dy)));
        } else if (corner.includes('w') || corner.includes('n')) {
            const m = parseMargin(el.getAttribute('Margin'));
            const ml = corner.includes('w') ? Math.round(m.l + dx) : m.l;
            const mt = corner.includes('n') ? Math.round(m.t + dy) : m.t;
            el.setAttribute('Margin', `${ml},${mt},${m.r},${m.b}`);
        }
        el.setAttribute('Width', String(Math.round(w)));
        el.setAttribute('Height', String(Math.round(h)));
    }

    /**
     * Resizes a Line (which has no Width/Height) by scaling its StartPoint/EndPoint proportionally
     * to the new selection box, so the drawn line stretches to fill it — the same 8-handle
     * behaviour as any other control. The position shifts exactly like resize() (Canvas.Left/Top
     * or Margin for w/n handles). The new points are relative to the (possibly shifted) origin,
     * so an endpoint at the box edge stays pinned to that edge as the box changes size.
     */
    resizeLine(el: Element, dx: number, dy: number, bounds: Bounds, corner: string): void {
        const MIN = 5;
        let w = bounds.width;
        let h = bounds.height;
        if (corner.includes('e')) w += dx;
        if (corner.includes('s')) h += dy;
        if (corner.includes('w')) w -= dx;
        if (corner.includes('n')) h -= dy;
        w = Math.max(MIN, w);
        h = Math.max(MIN, h);
        const parent = el.parentNode as Element | null;
        const inCanvas = !!parent && localName(parent.tagName) === 'Canvas';
        if (inCanvas) {
            // Canvas.Left/Top are PARENT-relative, while bounds.x/y are window-absolute (a body
            // canvas below a ChromeWindow title bar is offset in y). Shift by the DELTA from the
            // current attribute, exactly like resize(), so the dragged edge stays where dropped.
            if (corner.includes('w')) el.setAttribute('Canvas.Left', String(Math.round(parseNumAttr(el, 'Canvas.Left', bounds.x) + dx)));
            if (corner.includes('n')) el.setAttribute('Canvas.Top', String(Math.round(parseNumAttr(el, 'Canvas.Top', bounds.y) + dy)));
        } else if (corner.includes('w') || corner.includes('n')) {
            const m = parseMargin(el.getAttribute('Margin'));
            const ml = corner.includes('w') ? Math.round(m.l + dx) : m.l;
            const mt = corner.includes('n') ? Math.round(m.t + dy) : m.t;
            el.setAttribute('Margin', `${ml},${mt},${m.r},${m.b}`);
        }
        // Scale both points by the box's size change (fractional position within the box is kept).
        const sx = bounds.width > 0 ? w / bounds.width : 1;
        const sy = bounds.height > 0 ? h / bounds.height : 1;
        const sp = parsePoint(el.getAttribute('StartPoint'), 0, 0);
        const ep = parsePoint(el.getAttribute('EndPoint'), bounds.width, bounds.height);
        el.setAttribute('StartPoint', `${round1(sp.x * sx)},${round1(sp.y * sy)}`);
        el.setAttribute('EndPoint', `${round1(ep.x * sx)},${round1(ep.y * sy)}`);
    }

    // ---------------- shape drag-point editing (Line / Arc) ----------------
    // These back the designer's "point handles": a Line's two ends and an Arc's centre + two
    // ends are dragged directly instead of resizing with the 8-handle box. Geometry lives here so
    // it is unit-testable and shared by the frame's handle positions + the drag application.

    /** A Line's StartPoint / EndPoint (relative to its box origin, i.e. Canvas.Left/Top). */
    lineEndpoints(el: Element): { start: { x: number; y: number }; end: { x: number; y: number } } {
        return {
            start: parsePoint(el.getAttribute('StartPoint'), 0, 0),
            end: parsePoint(el.getAttribute('EndPoint'), 0, 0)
        };
    }

    /**
     * Moves one end of a Line by (dx, dy) — the OTHER end stays put (the drag anchor). The box is
     * then normalised: if the moved end went negative (left/up of the origin), Canvas.Left/Top is
     * shifted and BOTH points are re-based so StartPoint/EndPoint stay non-negative and the drawn
     * ends keep their absolute positions (the anchored end does not move).
     */
    setLineEnd(el: Element, which: 'start' | 'end', dx: number, dy: number): void {
        const p = this.lineEndpoints(el);
        const target = which === 'start' ? p.start : p.end;
        const nx = target.x + dx;
        const ny = target.y + dy;
        el.setAttribute('StartPoint', `${round1(which === 'start' ? nx : p.start.x)},${round1(which === 'start' ? ny : p.start.y)}`);
        el.setAttribute('EndPoint', `${round1(which === 'end' ? nx : p.end.x)},${round1(which === 'end' ? ny : p.end.y)}`);
        this.normalizeLine(el);
    }

    /**
     * Re-anchors a Line so its Start/End points are non-negative (AABB min at the origin): shifts
     * Canvas.Left/Top by the AABB min and subtracts it from both points. Both DRAWN ends keep their
     * absolute positions (Canvas.Left/Top + relative point is invariant), so the anchored end stays
     * put while the dragged end stays where the user dropped it.
     */
    normalizeLine(el: Element): void {
        const p = this.lineEndpoints(el);
        const minX = Math.min(p.start.x, p.end.x);
        const minY = Math.min(p.start.y, p.end.y);
        if (minX === 0 && minY === 0) return;
        const parent = el.parentNode as Element | null;
        if (parent && localName(parent.tagName) === 'Canvas') {
            const cl = parseNumAttr(el, 'Canvas.Left', 0);
            const ct = parseNumAttr(el, 'Canvas.Top', 0);
            el.setAttribute('Canvas.Left', String(round1(cl + minX)));
            el.setAttribute('Canvas.Top', String(round1(ct + minY)));
        }
        el.setAttribute('StartPoint', `${round1(p.start.x - minX)},${round1(p.start.y - minY)}`);
        el.setAttribute('EndPoint', `${round1(p.end.x - minX)},${round1(p.end.y - minY)}`);
    }

    /**
     * An Arc's geometry in design coords: centre + radii from the reported box, Start/Sweep angles
     * (degrees) from the element, and the two arc ENDPOINTS (0° = right, positive angles sweep
     * clockwise in y-down screen coords — verified against the host's rendering).
     */
    arcGeometry(el: Element, bounds: Bounds): {
        cx: number; cy: number; rx: number; ry: number;
        start: number; sweep: number;
        startPoint: { x: number; y: number }; endPoint: { x: number; y: number };
    } {
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const rx = bounds.width / 2;
        const ry = bounds.height / 2;
        const start = parseFloat(el.getAttribute('StartAngle') || '0') || 0;
        const sweep = parseFloat(el.getAttribute('SweepAngle') || '0') || 0;
        return {
            cx, cy, rx, ry, start, sweep,
            startPoint: arcPoint(cx, cy, rx, ry, start),
            endPoint: arcPoint(cx, cy, rx, ry, start + sweep)
        };
    }

    /**
     * Moves one end of an Arc to the given design point: the pointer's angle around the centre
     * becomes that end's angle (radius unchanged). The OTHER end stays anchored — the sweep is
     * adjusted so the anchored end's absolute angle is preserved.
     */
    setArcEnd(el: Element, which: 'start' | 'end', x: number, y: number, bounds: Bounds): void {
        const g = this.arcGeometry(el, bounds);
        const angle = angleOf(g.cx, g.cy, x, y);
        if (which === 'start') {
            const endAngle = (g.start + g.sweep) % 360;          // anchored end's absolute angle
            const sweep = ((endAngle - angle) % 360 + 360) % 360 || 360;
            el.setAttribute('StartAngle', String(Math.round(angle * 10) / 10));
            el.setAttribute('SweepAngle', String(Math.round(sweep * 10) / 10));
        } else {
            const sweep = ((angle - g.start) % 360 + 360) % 360 || 360; // anchored end = the start
            el.setAttribute('SweepAngle', String(Math.round(sweep * 10) / 10));
        }
    }

    /**
     * Sets an Arc's radius from the given design point: radius = pointer distance from the centre
     * (the "centre" drag point). The box is scaled around the FIXED centre (keeping the aspect
     * ratio, so a circular arc stays circular); Width/Height + Canvas.Left/Top are updated.
     */
    setArcRadius(el: Element, x: number, y: number, bounds: Bounds): void {
        const g = this.arcGeometry(el, bounds);
        const MIN = 10;
        const dist = Math.max(MIN, Math.hypot(x - g.cx, y - g.cy));
        const factor = g.rx > 0 ? dist / g.rx : 1;
        const w = Math.max(MIN, Math.round(g.rx * 2 * factor));
        const h = Math.max(MIN, Math.round(g.ry * 2 * factor));
        const parent = el.parentNode as Element | null;
        if (parent && localName(parent.tagName) === 'Canvas') {
            el.setAttribute('Canvas.Left', String(round1(g.cx - w / 2)));
            el.setAttribute('Canvas.Top', String(round1(g.cy - h / 2)));
        }
        el.setAttribute('Width', String(w));
        el.setAttribute('Height', String(h));
    }

    remove(el: Element): void {
        el.parentNode?.removeChild(el);
    }

    /** Serializes a single element (and its subtree) as a standalone XAML fragment. */
    elementXaml(el: Element): string {
        const sb: string[] = [];
        prettyNode(el, 0, sb, new Map(), false);
        return sb.join('');
    }

    /** True if a control in the document already uses this name. */
    nameInUse(name: string): boolean {
        return this.controlElements().some(
            (e) => (e.getAttribute('x:Name') || e.getAttribute('Name')) === name
        );
    }

    /** Returns `base` if free, otherwise base_2, base_3, ... */
    uniqueName(base: string): string {
        let name = base;
        let i = 1;
        while (this.nameInUse(name)) { name = `${base}_${++i}`; }
        return name;
    }

    /**
     * Returns a name not already used. If `base` ends in a number it is incremented
     * (Button1 -> Button2 -> …), otherwise an underscore suffix is appended (Button -> Button_2).
     * Used for auto-assigned names so they never collide with existing controls.
     */
    nextName(base: string): string {
        if (!this.nameInUse(base)) return base;
        const m = /^(.*?)(\d+)$/.exec(base);
        if (m) {
            const prefix = m[1];
            let n = parseInt(m[2], 10);
            let c = `${prefix}${n + 1}`;
            while (this.nameInUse(c)) { n++; c = `${prefix}${n + 1}`; }
            return c;
        }
        return this.uniqueName(base);
    }

    /**
     * Keeps name-derived Content/Text in sync after a rename: if the control's Content (or
     * Text, for a TextBlock) still equals the old name, it is updated to the new name. A
     * user-typed label that differs from the name is left untouched.
     */
    syncContentToName(el: Element, oldName: string, newName: string): void {
        if (!oldName || oldName === newName) return;
        if (el.getAttribute('Content') === oldName) el.setAttribute('Content', newName);
        if (el.getAttribute('Text') === oldName) el.setAttribute('Text', newName);
    }

    /**
     * Renames event-handler references document-wide after a control rename, e.g.
     * `Click="Button1_Click"` -> `Click="SubmitButton_Click"`, so the XAML event
     * attributes and the renamed code-behind methods stay in sync.
     */
    renameEventHandlers(oldName: string, newName: string): void {
        if (!oldName || oldName === newName) return;
        const prefix = oldName + '_';
        const newPrefix = newName + '_';
        for (const el of this.controlElements()) {
            for (let i = 0; i < el.attributes.length; i++) {
                const a = el.attributes.item(i);
                if (a && EVENT_ATTRS.has(a.name) && a.value.startsWith(prefix)) {
                    el.setAttribute(a.name, newPrefix + a.value.slice(prefix.length));
                }
            }
        }
    }

    /**
     * Moves an element to a new parent, tidying container-specific attached
     * properties (Canvas.Left/Top, DockPanel.Dock, Grid.Row/Column) so the saved
     * XAML stays clean when moving between different container types.
     */
    moveTo(el: Element, target: Element, pos?: { x: number; y: number }): void {
        const moved = el.parentNode !== target;
        if (el.parentNode && moved) {
            el.parentNode.removeChild(el);
        }
        if (moved) {
            target.appendChild(el);
        }
        const tl = localName(target.tagName);
        const rules: Array<[string, boolean]> = [
            ['Canvas.', tl === 'Canvas'],
            ['DockPanel.', tl === 'DockPanel'],
            ['Grid.', tl === 'Grid']
        ];
        const attrNames: string[] = [];
        for (let i = 0; i < el.attributes.length; i++) {
            const a = el.attributes.item(i);
            if (a) attrNames.push(a.name);
        }
        for (const a of attrNames) {
            for (const [prefix, keep] of rules) {
                if (a.startsWith(prefix) && !keep) el.removeAttribute(a);
            }
        }
        if (tl === 'Canvas' && moved) {
            // The control moved into a (possibly different) Canvas: its previous Canvas.Left/Top
            // are meaningless here and can be far outside this canvas's visible area (e.g. moving
            // from the form's body Canvas into a small tab body). Place it at the supplied free
            // position (or the canvas origin) so it lands in the container's current area without
            // rendering over controls already in the canvas.
            el.setAttribute('Canvas.Left', String(pos ? Math.round(pos.x) : 0));
            el.setAttribute('Canvas.Top', String(pos ? Math.round(pos.y) : 0));
        }
        if (tl === 'Grid' && moved) {
            // The control moved into a Grid lands in the first free cell (the element is already
            // attached, so ignore it in the occupancy scan).
            const cell = this.nextFreeCell(target, el);
            el.setAttribute('Grid.Row', String(cell.row));
            el.setAttribute('Grid.Column', String(cell.col));
        }
    }

    /** Values of event-handler attributes on the element (e.g. "Button1_Click"). */
    eventHandlersOf(el: Element): string[] {
        const out: string[] = [];
        for (let i = 0; i < el.attributes.length; i++) {
            const a = el.attributes.item(i);
            if (a && EVENT_ATTRS.has(a.name)) out.push(a.value);
        }
        return out;
    }

    /**
     * All event-handler attribute values referenced by the element and every
     * descendant (recursive). Needed when deleting a container so the
     * code-behind methods of child controls are also cleaned up.
     */
    eventHandlersOfSubtree(el: Element): string[] {
        const out: string[] = [];
        const walk = (e: Element): void => {
            out.push(...this.eventHandlersOf(e));
            for (const c of elementChildren(e)) walk(c);
        };
        walk(el);
        return out;
    }

    /** Returns the TabItem child elements of a TabControl (in order). */
    tabItemsOf(el: Element): Element[] {
        return elementChildren(el).filter((c) => localName(c.tagName) === 'TabItem');
    }

    /** Returns the ListBoxItem child elements of a ListBox (in order). */
    listItemsOf(el: Element): Element[] {
        return elementChildren(el).filter((c) => localName(c.tagName) === 'ListBoxItem');
    }

    /** The single content child of an element (ignoring property elements), if any. */
    private singleChild(el: Element): Element | undefined {
        const kids = elementChildren(el).filter((k) => !localName(k.tagName).includes('.'));
        return kids.length === 1 ? kids[0] : undefined;
    }

    /**
     * The editable text content of a ListBoxItem: its Content attribute, else its single child
     * control's Content/Text (for control-based items like `<ListBoxItem><Button …/></ListBoxItem>`).
     */
    listItemContent(item: Element): string {
        if (item.hasAttribute('Content')) return item.getAttribute('Content') || '';
        const inner = this.singleChild(item);
        if (inner) return inner.getAttribute('Content') || inner.getAttribute('Text') || '';
        return '';
    }

    /** Sets a ListBoxItem's text content: its Content attribute, or its single child's Content/Text. */
    setListItemContent(item: Element, value: string): void {
        if (item.hasAttribute('Content')) { item.setAttribute('Content', value); return; }
        const inner = this.singleChild(item);
        if (inner) {
            if (inner.hasAttribute('Content')) { inner.setAttribute('Content', value); return; }
            if (inner.hasAttribute('Text')) { inner.setAttribute('Text', value); return; }
        }
        item.setAttribute('Content', value);
    }

    /** The item children of a combo/list/items control, in order:
     *  ComboBox → `ComboBoxItem`, ListBox → `ListBoxItem`, ItemsControl → all children. */
    itemsOf(el: Element): Element[] {
        const tag = localName(el.tagName);
        if (tag === 'ComboBox') return elementChildren(el).filter((c) => localName(c.tagName) === 'ComboBoxItem');
        if (tag === 'ListBox') return elementChildren(el).filter((c) => localName(c.tagName) === 'ListBoxItem');
        if (tag === 'ItemsControl') return elementChildren(el);
        return [];
    }

    /** The editable text of one item element (Content for ComboBoxItem/ListBoxItem, Text for TextBlock). */
    itemText(item: Element): string {
        const tag = localName(item.tagName);
        if (tag === 'TextBlock') return item.getAttribute('Text') || '';
        if (item.hasAttribute('Content')) return item.getAttribute('Content') || '';
        const inner = this.singleChild(item);
        if (inner) return inner.getAttribute('Content') || inner.getAttribute('Text') || '';
        return '';
    }

    /** Sets an item element's text (Content for ComboBoxItem/ListBoxItem, Text for TextBlock). */
    setItemText(item: Element, value: string): void {
        const tag = localName(item.tagName);
        if (tag === 'TextBlock') { item.setAttribute('Text', value); return; }
        this.setListItemContent(item, value);
    }

    /** True if the item is a plain text item (no name, events, attached props or child controls) —
     *  the batch 'Items' editor may replace it without losing anything. */
    isPlainTextItem(item: Element): boolean {
        // A user-assigned name makes the item a real (possibly code-referenced) control;
        // auto-generated in-memory names (`_TagN`, stripped on save) don't.
        if (this.hasExplicitName(item)) return false;
        if (elementChildren(item).length > 0) return false;
        for (let i = 0; i < item.attributes.length; i++) {
            const n = item.attributes[i].name;
            if (EVENT_ATTRS.has(n) || n.includes('.')) return false; // event handlers or attached properties
        }
        return true;
    }

    /** Creates a fresh item element for the given parent control carrying `text`. */
    newItemFor(parent: Element, text: string): Element {
        const tag = localName(parent.tagName);
        if (tag === 'ComboBox') return this.makeItem('ComboBoxItem', 'Content', text);
        if (tag === 'ListBox') return this.makeItem('ListBoxItem', 'Content', text);
        return this.makeItem('TextBlock', 'Text', text); // ItemsControl
    }

    private makeItem(tag: string, attr: string, text: string): Element {
        const el = this.createElement(`<${tag}/>`);
        el.setAttribute(attr, text);
        return el;
    }

    /** True if any control still references the given event-handler name. */
    hasHandler(handler: string): boolean {
        return this.controlElements().some((e) => this.eventHandlersOf(e).includes(handler));
    }

    /** Removes every control except the root element; returns the removed elements. */
    clearControls(): Element[] {
        const removed: Element[] = [];
        for (const el of this.controlElements()) {
            if (el === this.root) continue;
            this.remove(el);
            removed.push(el);
        }
        return removed;
    }

    /** Removes the maiden-form "Drop controls here" hint TextBlock once real content is added. */
    removeDropHint(): void {
        for (const el of this.controlElements()) {
            if (/drop\s+controls?\s+here/i.test(el.getAttribute('Text') || '')) {
                this.remove(el);
                return;
            }
        }
    }
}

function parseNumAttr(el: Element, name: string, fallback: number): number {
    const v = el.getAttribute(name);
    if (v === null || v === '') return fallback;
    const n = parseFloat(v);
    return Number.isNaN(n) ? fallback : n;
}

function parseMargin(v: string | null): { l: number; t: number; r: number; b: number } {
    if (!v) return { l: 0, t: 0, r: 0, b: 0 };
    const parts = v.split(',').map((s) => parseFloat(s.trim())).filter((n) => !Number.isNaN(n));
    if (parts.length === 1) return { l: parts[0], t: parts[0], r: parts[0], b: parts[0] };
    if (parts.length === 2) return { l: parts[0], t: parts[1], r: parts[0], b: parts[1] };
    if (parts.length === 4) return { l: parts[0], t: parts[1], r: parts[2], b: parts[3] };
    return { l: 0, t: 0, r: 0, b: 0 };
}

function round1(n: number): number {
    return Math.round(n * 10) / 10;
}

/** Parses a XAML point ("x,y") into {x,y}, falling back to the given defaults. */
function parsePoint(v: string | null, dx: number, dy: number): { x: number; y: number } {
    if (!v) return { x: dx, y: dy };
    const parts = v.split(',').map((s) => parseFloat(s.trim()));
    if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return { x: dx, y: dy };
    return { x: parts[0], y: parts[1] };
}

/** A point on a circle/ellipse at `angleDeg` (0° = right, positive = clockwise in y-down coords). */
function arcPoint(cx: number, cy: number, rx: number, ry: number, angleDeg: number): { x: number; y: number } {
    const a = angleDeg * Math.PI / 180;
    return { x: round1(cx + rx * Math.cos(a)), y: round1(cy + ry * Math.sin(a)) };
}

/** The angle (degrees, 0° = right, positive clockwise / y-down) of a point around (cx, cy). */
function angleOf(cx: number, cy: number, x: number, y: number): number {
    return (Math.atan2(y - cy, x - cx) * 180 / Math.PI + 360) % 360;
}
