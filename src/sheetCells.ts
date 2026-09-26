/* The spreadsheet child-element model: a sheet's CELLS are child elements, not attributes, so the
 * ordinary property round-trip never touches them. Everything that reads or writes them lives here —
 * the designer panel turns it into messages, the tests drive it directly.
 *
 * Why a module of its own, rather than a few lines in the panel: the failure this file exists to
 * prevent is SILENT. An attribute the writer names differently from the C# property (`Row` vs `row`),
 * a cell written past the sheet's own Rows/Columns, or a blank cell saved as an element the control
 * ignores — every one of those produces a form that still compiles and still draws, with cells missing.
 * The names are pinned against resources/GrumpySheet.{cs,vb} in the T2 test.
 *
 * Wire formats (designer ↔ webview):
 *   properties message:  sheetInfo = { rows, columns, cells: sheetCellsOf(el) }
 *   save cells:          { type:'saveSheetCells', name, cells:[{ row, column, text }] }
 *
 * Addresses use the same two bounds as the C# and VB twins — at most three letters and seven digits —
 * because an unbounded `letters * 26` loop is the one place the twins could disagree: VB checks integer
 * overflow and throws, C# wraps silently, so both now refuse a name that long instead of computing one.
 */
import { XamlModel, localName } from './xamlModel';

/** The bundled AvaloniaSpreadsheet control set — one control so far. */
export const SHEET_TAGS = ['GrumpySheet'];

/** The prefix and CLR namespace a form needs to use a sheet (the twin is `AvaloniaCharts`' shape). */
export const SHEET_PREFIX = 'spread';
export const SHEET_XMLNS = 'using:AvaloniaSpreadsheet';

export function isSheetTag(tag: string): boolean {
    return SHEET_TAGS.includes(tag);
}

/** The geometry the control itself defaults to, so the editor can draw a sheet that sets nothing. */
export const SHEET_DEFAULT_ROWS = 50;
export const SHEET_DEFAULT_COLUMNS = 26;
export const SHEET_DEFAULT_COLUMN_WIDTH = 72;
export const SHEET_DEFAULT_ROW_HEIGHT = 22;
export const SHEET_DEFAULT_HEADER_WIDTH = 44;
export const SHEET_DEFAULT_HEADER_HEIGHT = 24;

/** The attributes a `<spread:SheetCell>` carries. Row and Column are 1-BASED, so Row=1 Column=1 is A1.
 *  `Text` may hold a formula (`=SUM(B2:B6)`), which the control stores verbatim. */
export const SHEET_CELL_ROW_ATTR = 'Row';
export const SHEET_CELL_COLUMN_ATTR = 'Column';
export const SHEET_CELL_TEXT_ATTR = 'Text';

/** One cell, as the model and the editor exchange it. */
export interface SheetCell {
    row: number;
    column: number;
    text: string;
}

/** The longest letter run and digit run an address may have (see the file header). */
export const SHEET_MAX_LETTERS = 3;
export const SHEET_MAX_DIGITS = 7;

/** "A" for column 1, "Z" for 26, "AA" for 27 — the letters the control draws in its header. */
export function columnName(column: number): string {
    let value = Math.floor(Number(column));
    if (!Number.isFinite(value) || value < 1) value = 1;
    let letters = '';
    while (value > 0) {
        const remainder = (value - 1) % 26;
        letters = String.fromCharCode(65 + remainder) + letters;
        value = Math.floor((value - 1) / 26);
    }
    return letters;
}

/** "A1" for row 1 column 1; "AB7" for row 7 column 28 — the address the name box shows. */
export function cellName(row: number, column: number): string {
    const r = Math.floor(Number(row));
    return columnName(column) + String(!Number.isFinite(r) || r < 1 ? 1 : r);
}

/** Reads "A1" or "ab7" back into a row and a column, both 1-based. Null when it is not an address. */
export function parseCellName(name: string): { row: number; column: number } | null {
    const text = String(name ?? '').trim().toUpperCase();
    let index = 0;
    let letters = 0;
    let letterCount = 0;
    while (index < text.length && text[index] >= 'A' && text[index] <= 'Z') {
        letterCount++;
        if (letterCount > SHEET_MAX_LETTERS) return null;
        letters = letters * 26 + (text.charCodeAt(index) - 64);
        index++;
    }
    if (letters === 0 || index >= text.length) return null;
    let digits = 0;
    let digitCount = 0;
    const start = index;
    while (index < text.length && text[index] >= '0' && text[index] <= '9') {
        digitCount++;
        if (digitCount > SHEET_MAX_DIGITS) return null;
        digits = digits * 10 + (text.charCodeAt(index) - 48);
        index++;
    }
    if (index === start || index !== text.length || digits < 1) return null;
    return { row: digits, column: letters };
}

/** One attribute's value, or the fallback when it is absent. */
function readAttr(el: Element, attr: string, def: string): string {
    const value = el.getAttribute(attr);
    return value === null ? def : value;
}

/** A positive whole number out of an attribute, or the fallback (what the control would use). */
function readCount(el: Element, attr: string, def: number): number {
    const n = parseInt(readAttr(el, attr, ''), 10);
    return Number.isFinite(n) && n > 0 ? n : def;
}

/** The row and column an element claims, or null when it does not say (or says nonsense). */
function addressOf(node: Element): { row: number; column: number } | null {
    const row = parseInt(readAttr(node, SHEET_CELL_ROW_ATTR, ''), 10);
    const column = parseInt(readAttr(node, SHEET_CELL_COLUMN_ATTR, ''), 10);
    if (!Number.isFinite(row) || !Number.isFinite(column)) return null;
    if (row < 1 || column < 1) return null;
    return { row, column };
}

/** The `<spread:SheetCell/>` children of a sheet, in document order. */
function sheetCellChildren(el: Element): Element[] {
    const out: Element[] = [];
    for (let i = 0; i < el.childNodes.length; i++) {
        const kid = el.childNodes[i] as Element;
        if (kid.nodeType !== 1) continue;
        if (localName(kid.tagName) === 'SheetCell') out.push(kid);
    }
    return out;
}

/** The sheet's geometry, with the control's own defaults filled in. */
export function sheetSizeOf(el: Element): { rows: number; columns: number } {
    return {
        rows: readCount(el, 'Rows', SHEET_DEFAULT_ROWS),
        columns: readCount(el, 'Columns', SHEET_DEFAULT_COLUMNS)
    };
}

/**
 * Every cell with something in it, sorted by row then column — the order the editor shows and the
 * order the writer lays them down in, so saving an untouched sheet does not shuffle its elements.
 *
 * A cell is skipped when it is blank, when it lies outside the sheet (the control ignores it, and
 * showing it would mean the editor offering a row that cannot exist), or when it does not name an
 * address at all.
 */
export function sheetCellsOf(el: Element): SheetCell[] {
    const size = sheetSizeOf(el);
    const cells: SheetCell[] = [];
    for (const node of sheetCellChildren(el)) {
        const address = addressOf(node);
        if (!address) continue;
        if (address.row > size.rows || address.column > size.columns) continue;
        const text = readAttr(node, SHEET_CELL_TEXT_ATTR, '');
        if (text.length === 0) continue;
        cells.push({ row: address.row, column: address.column, text });
    }
    return cells.sort((a, b) => (a.row - b.row) || (a.column - b.column));
}

/**
 * Rewrites a sheet's cells from the editor's list. Blanks are dropped rather than written (the
 * control treats them as blank anyway, and an element per empty cell would grow the file for nothing),
 * a cell outside Rows/Columns is dropped too, and the first cell for an address wins — the same rule
 * the control applies when it reads the list.
 *
 * An address that already has an element KEEPS it: the element is moved and re-labelled rather than
 * replaced, so anything a future version adds to a cell survives an edit made by this one.
 */
export function writeSheetCells(model: XamlModel, el: Element, cells: unknown[]): void {
    const size = sheetSizeOf(el);
    const before = sheetCellChildren(el);
    const existing = new Map<string, Element>();
    for (const node of before) {
        const address = addressOf(node);
        if (address) existing.set(`${address.row}:${address.column}`, node);
    }

    const keep: Element[] = [];
    const seen = new Set<string>();
    for (const raw of cells) {
        const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
        const row = Math.floor(Number(item.row));
        const column = Math.floor(Number(item.column));
        const text = String(item.text ?? '');
        if (!Number.isFinite(row) || !Number.isFinite(column)) continue;
        if (row < 1 || column < 1 || row > size.rows || column > size.columns) continue;
        if (text.length === 0) continue;
        const key = `${row}:${column}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const node = existing.get(key) ?? model.createElement(`<${SHEET_PREFIX}:SheetCell/>`);
        model.setProperty(node, SHEET_CELL_ROW_ATTR, String(row));
        model.setProperty(node, SHEET_CELL_COLUMN_ATTR, String(column));
        model.setProperty(node, SHEET_CELL_TEXT_ATTR, text);
        keep.push(node);
    }

    // appendChild MOVES an existing child to the end, so appending in list order is the whole sort.
    for (const node of keep) el.appendChild(node);
    for (const node of before) if (!keep.includes(node)) el.removeChild(node);
}

/** The whole payload the Cells editor needs: what to draw the grid from, and what is in it. */
export function sheetInfoOf(el: Element): { rows: number; columns: number; cells: SheetCell[] } {
    const size = sheetSizeOf(el);
    return { rows: size.rows, columns: size.columns, cells: sheetCellsOf(el) };
}
