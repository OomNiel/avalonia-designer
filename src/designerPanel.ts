import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { XamlModel, localName, SINGLE_CONTENT_TAGS, isEventAttribute } from './xamlModel';
import { PreviewerHostManager, FrameResult, HostControlInfo, ShapeHandle, DOTNET_SDK_MISSING_MESSAGE } from './hostClient';
import { createNewForm } from './newForm';
import { propertyDefsFor, opacityToXaml, defaultFor, THEME_COLOR_KEYS, multiCommonProps, isStatusClock, statusClockSample } from './propertyCatalog';
import { defaultEventFor, hasDefaultEvent, handlerChoice, insertHandlerIntoCodeBehind, findHandlerInCodeBehind, insertStatusDateClock, insertXyTrackerClock, XyTrackerMode, getStatusDateSettings, setStatusDateSettings, removeHandlersFromCodeBehind, removeOrphanedHandlersForControls, renameControlInCodeBehind, syncVbAccessors, namedControlsInAxaml, unionNamedControls, findCodeBehindFile, convertCodeBehindToChrome, findItemsSourceBinding, bindControlToAsset, bindControlToDataSet, unbindControlFromDataSet, removeItemsSourceBinding, bindFollowerToColumn, bindImageToGrid, unbindImageFromGrid, hasDataImageBinding, DataSetBindingRef, DataImageRef } from './codeBehind';
import {
    analyzeCodeBehind, applyLocalFix, backupCodeBehind, publishIssues, controlsForCheck, issueSignature,
    CodeIssue, CheckOptions, DataSetContext, DataSetFollowerInfo, DataSetGridInfo, DataSetImageInfo
} from './codeBehindCheck';
import { withDesignerHeader } from './xamlHeader';
import { controlInfoFor } from './controlInfo';
import { asksForEventOnPlace, eventsFor, eventArgsFor, isKnownEvent } from './controlEvents';
import { findProject, ProjectInfo } from './projectParser';
import { listAssets, Asset } from './assetCatalog';
import { ensureDataGridAutoGenerateColumns, ensureSqlitePackages, defaultDbFile, reloadDataSetPanel, saveOpenDataSetDocuments } from './dataSetEditor';
import { backupProject } from './projectBackup';
import { parseDataSet, serializeDataSet, DataSetSpec, DataTableSpec, sqliteTableName } from './dataSetModel';
import { generateCs, generateVb, generateXsd } from './dataSetGenerator';
import { bundledComponentSpecs, isStaleBundledCopy } from './bundledComponents';

const DEFAULT_SIZE = { width: 800, height: 450 };

// Undo/redo history: 5 levels deep = up to 6 snapshots (current + 5 prior). Each step stores the
// serialized XAML AND the code-behind text, so renames/deletes that touch code-behind are reversible.
const UNDO_LEVELS = 5;
const UNDO_STATES = UNDO_LEVELS + 1;
interface HistoryStep {
    xaml: string;
    codeBehindPath: string | null;
    codeBehind: string | null;
}
interface DesignerHistory {
    states: HistoryStep[];
    index: number;
}

/**
 * If the named control is bound to a table in a project .adset file, returns the
 * display value + a hint for the Properties panel's ItemsSource field. The binding
 * lives in code-behind (Control.ItemsSource = Dataset.GetTable()), not a XAML
 * attribute, so the designer shows it read-only instead of leaving the field blank.
 */
/** Finds the .adset (spec + table) that binds a control to a table in a project folder, if any. */
function findBoundTable(projectFolder: string, controlName: string | null | undefined): { adsetPath: string; spec: DataSetSpec; table: DataTableSpec } | undefined {
    if (!projectFolder || !controlName) return undefined;
    const files: string[] = [];
    const stack = [projectFolder];
    while (stack.length) {
        const dir = stack.pop()!;
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const e of entries) {
            if (e.name === 'bin' || e.name === 'obj' || e.name === '.git' || e.name === 'node_modules') continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) stack.push(p);
            else if (e.name.toLowerCase().endsWith('.adset')) files.push(p);
        }
    }
    for (const f of files) {
        try {
            const spec = parseDataSet(fs.readFileSync(f, 'utf8'));
            const t = spec.tables.find((tt) => tt.boundTo === controlName);
            if (t) return { adsetPath: f, spec, table: t };
        } catch { /* skip unreadable/corrupt .adset */ }
    }
    return undefined;
}

function dataSetBindingFor(projectFolder: string, controlName: string | null | undefined): { value: string; readOnly: boolean; desc: string; undoRedoDepth: number; adsetPath: string; tableName: string; datasetName: string } | undefined {
    const b = findBoundTable(projectFolder, controlName);
    if (!b) return undefined;
    return {
        value: `${b.spec.name}.${b.table.name}`,
        readOnly: true,
        desc: `Bound to ${b.spec.name}.${b.table.name} in code-behind (${controlName}.ItemsSource = ...). Click … to change it or clear the binding.`,
        undoRedoDepth: b.table.undoRedoDepth ?? 5,
        adsetPath: b.adsetPath,
        tableName: b.table.name,
        datasetName: b.spec.name
    };
}

/** A Data-Image binding: an Image control follows the selection of a DataGrid bound to a DataSet
 *  table, showing the image file whose absolute path is in `column` (a String column of that table).
 *  Stored on the table in its .adset (`boundImages`) so it survives reloads and Remove DataSet. */
interface DataImageBindingInfo {
    datasetName: string;
    tableName: string;
    gridName: string;
    column: string;
    adsetPath: string;
}

/** Every .adset in a project folder, as {path, spec} (skipping unreadable ones). */
function readDataSetFiles(projectFolder: string): { adsetPath: string; spec: DataSetSpec }[] {
    const out: { adsetPath: string; spec: DataSetSpec }[] = [];
    const stack = [projectFolder];
    while (stack.length) {
        const dir = stack.pop()!;
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const e of entries) {
            if (e.name === 'bin' || e.name === 'obj' || e.name === '.git' || e.name === 'node_modules') continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) stack.push(p);
            else if (e.name.toLowerCase().endsWith('.adset')) {
                try { out.push({ adsetPath: p, spec: parseDataSet(fs.readFileSync(p, 'utf8')) }); } catch { /* skip */ }
            }
        }
    }
    return out;
}

/** The table (with its .adset) that a DataGrid is bound to, if any. */
function tableForGrid(projectFolder: string, gridName: string): { adsetPath: string; spec: DataSetSpec; table: DataTableSpec } | undefined {
    for (const f of readDataSetFiles(projectFolder)) {
        const t = f.spec.tables.find((x) => x.boundTo === gridName && x.boundToType === 'DataGrid');
        if (t) return { adsetPath: f.adsetPath, spec: f.spec, table: t };
    }
    return undefined;
}

/** The Data-Image binding (if any) whose Image control is `controlName`. */
function findImageBinding(projectFolder: string, controlName: string | null | undefined): { info: DataImageBindingInfo; spec: DataSetSpec; table: DataTableSpec } | undefined {
    if (!projectFolder || !controlName) return undefined;
    for (const f of readDataSetFiles(projectFolder)) {
        for (const t of f.spec.tables) {
            const img = (t.boundImages || []).find((b) => b.control === controlName);
            if (img && t.boundTo) {
                return {
                    info: { datasetName: f.spec.name, tableName: t.name, gridName: t.boundTo, column: img.column, adsetPath: f.adsetPath },
                    spec: f.spec,
                    table: t
                };
            }
        }
    }
    return undefined;
}

/** The "follower" binding of a control: a read-only control listing one text column of a table a
 *  DataGrid owns. Mirrors `findImageBinding`. */
function findFollowerRecord(projectFolder: string, controlName: string | null | undefined): { info: { datasetName: string; tableName: string; column: string; owner: string; adsetPath: string }; spec: DataSetSpec; table: DataTableSpec } | undefined {
    if (!projectFolder || !controlName) return undefined;
    for (const f of readDataSetFiles(projectFolder)) {
        for (const t of f.spec.tables) {
            const fol = (t.followers || []).find((x) => x.control === controlName);
            if (fol && t.boundTo) {
                return {
                    info: {
                        datasetName: f.spec.name, tableName: t.name, column: fol.column,
                        owner: t.boundTo, adsetPath: f.adsetPath
                    },
                    spec: f.spec,
                    table: t
                };
            }
        }
    }
    return undefined;
}

/** Bind targets for the Data-Image picker: every DataGrid-bound table's String columns. */function dataImageTargets(projectFolder: string): { label: string; detail: string; datasetName: string; tableName: string; gridName: string; column: string }[] {
    const out: { label: string; detail: string; datasetName: string; tableName: string; gridName: string; column: string }[] = [];
    for (const f of readDataSetFiles(projectFolder)) {
        for (const t of f.spec.tables) {
            if (!t.boundTo || t.boundToType !== 'DataGrid') continue;
            for (const c of t.columns) {
                if (c.type !== 'String') continue;
                out.push({
                    label: `${t.boundTo}.${c.name}`,
                    detail: `${f.spec.name}.${t.name} — shows this row's ${c.name} file in an Image`,
                    datasetName: f.spec.name, tableName: t.name, gridName: t.boundTo, column: c.name
                });
            }
        }
    }
    return out;
}

/** True if the control is the form's structural body Canvas (the design surface): a Canvas
 *  named "Body" that sits directly under the form root, or under the root's "Root" DockPanel.
 *  It must stay in place (not moved/resized/deleted/renamed) so it always fills the form. */
function isLockedBody(model: XamlModel, name: string | null | undefined): boolean {
    if (!name) return false;
    const el = model.findByName(name);
    if (!el || localName(el.tagName) !== 'Canvas') return false;
    if ((el.getAttribute('x:Name') || el.getAttribute('Name')) !== 'Body') return false;
    const root = model.root;
    const p = el.parentNode as Element | null;
    if (p === root) return true;
    if (p && p !== root && p.parentNode === root) {
        return (p.getAttribute('x:Name') || p.getAttribute('Name')) === 'Root';
    }
    return false;
}

/** True if the control is structural form scaffolding that must stay fixed in place: the Body
 *  design surface OR the form's top-level layout container (e.g. the root DockPanel). Both fill
 *  the whole form, so neither may be moved, resized, deleted, cut or renamed — the webview hides
 *  their handles and blocks dragging via the `locked` flag. */
function isLockedStructure(model: XamlModel, name: string | null | undefined): boolean {
    if (isLockedBody(model, name)) return true;
    if (!name) return false;
    const el = model.findByName(name);
    if (!el) return false;
    // A GrumpyPanel-based bar's structural inner parts ({name}Dock band + {name}Body free surface)
    // must stay fixed in place — they always fill/drive the panel, so they can't be moved, resized,
    // deleted or renamed (they still RECEIVE drops: the body is the free drop surface).
    if (grumpyPartOf(el)) return true;
    const rc = rootContainer(model);
    return !!rc && rc === el;
}

/** Short label for a locked structural element, for user-facing messages. */
function lockedLabel(model: XamlModel, name: string | null | undefined): string {
    if (isLockedBody(model, name)) return 'Body canvas';
    const el = name ? model.findByName(name) : undefined;
    if (el) {
        const n = el.getAttribute('x:Name') || el.getAttribute('Name');
        return n ? `${n} ${localName(el.tagName)}` : localName(el.tagName);
    }
    return 'form layout';
}

/** If the control has a generic `ControlName.ItemsSource = <expr>` line in its code-behind
 *  (written by the asset picker), show it read-only in the Items Source field. */
function codeBindingFor(axamlUri: vscode.Uri, controlName: string | null | undefined): { value: string; readOnly: boolean; desc: string } | undefined {
    if (!controlName) return undefined;
    const expr = findItemsSourceBinding(axamlUri, controlName);
    if (!expr) return undefined;
    return { value: expr, readOnly: true, desc: `Items bound in code-behind (${controlName}.ItemsSource = ${expr}). Click … to change or clear it.` };
}

/** Layout containers that accept children (used to pick the drop target). */
const CONTAINER_TAGS = new Set([
    'Panel', 'Grid', 'StackPanel', 'DockPanel', 'WrapPanel', 'Canvas', 'UniformGrid',
    'TabControl', 'ItemsControl', 'ListBox', 'Carousel',
    'Border', 'ScrollViewer', 'UserControl', 'Window', 'TabItem', 'ContentControl',
    'GroupBox'
]);

/** The drawing shapes — they render BEHIND other controls by default (Send to Back). */
const SHAPE_TAGS = new Set(['Line', 'Rectangle', 'Ellipse', 'Arc']);

/** Cross-panel clipboard for Cut/Copy/Paste (stores a serialized XAML fragment + its name). */
let clipboard: { name: string; xaml: string } | null = null;

/** Multi-child containers that make sensible "Move to container" targets. */
const MOVE_TARGETS = new Set([
    'Panel', 'Grid', 'StackPanel', 'DockPanel', 'WrapPanel', 'Canvas', 'UniformGrid',
    'TabControl', 'ItemsControl', 'ListBox', 'Carousel'
]);

/**
 * Toolbox control types that make sense as ListBox items (aligned with the Toolbox list).
 * The "+ Add Item" button lets the user pick one of these; each is wrapped in a ListBoxItem.
 */
const LIST_ITEM_TYPES: { tag: string; label: string; detail: string; xaml: (n: number) => string }[] = [
    { tag: 'ListBoxItem', label: 'Text item', detail: 'A plain text item', xaml: (n) => `<ListBoxItem Content="Item ${n}"/>` },
    { tag: 'TextBlock', label: 'Text (TextBlock)', detail: 'A static text label', xaml: (n) => `<ListBoxItem><TextBlock Text="Item ${n}"/></ListBoxItem>` },
    { tag: 'Button', label: 'Button', detail: 'A clickable button', xaml: (n) => `<ListBoxItem><Button Content="Item ${n}"/></ListBoxItem>` },
    { tag: 'CheckBox', label: 'Check Box', detail: 'A tick box', xaml: (n) => `<ListBoxItem><CheckBox Content="Item ${n}"/></ListBoxItem>` },
    { tag: 'RadioButton', label: 'Radio Button', detail: 'A single-choice option', xaml: (n) => `<ListBoxItem><RadioButton Content="Item ${n}"/></ListBoxItem>` },
    { tag: 'Image', label: 'Image', detail: 'A picture', xaml: () => `<ListBoxItem><Image Stretch="Uniform" Width="48" Height="48"/></ListBoxItem>` },
    { tag: 'TextBox', label: 'Text Box', detail: 'An editable text field', xaml: (n) => `<ListBoxItem><TextBox Text="Item ${n}" Width="120"/></ListBoxItem>` },
    { tag: 'ComboBox', label: 'Combo Box', detail: 'A drop-down list', xaml: () => `<ListBoxItem><ComboBox Width="120"/></ListBoxItem>` },
    { tag: 'StackPanel', label: 'Stack Panel', detail: 'A rich item (icon + text, …)', xaml: (n) => `<ListBoxItem><StackPanel Orientation="Horizontal" Spacing="8"><TextBlock Text="Item ${n}"/></StackPanel></ListBoxItem>` },
    { tag: 'Grid', label: 'Grid', detail: 'A rich item laid out in rows/columns', xaml: () => `<ListBoxItem><Grid Width="120" Height="40"/></ListBoxItem>` }
];

/** True if `el` is anywhere inside `container` (container is an ancestor of el). */
function isInside(container: Element, el: Element): boolean {
    let cur: Node | null = el.parentNode;
    while (cur && cur.nodeType === 1) {
        if (cur === container) return true;
        cur = cur.parentNode;
    }
    return false;
}

function escRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Documents already warned about a missing AnchorHelper (so we don't nag on every edit).
 */
const anchorWarnedDocs = new Set<string>();

/**
 * The ChromeWindow custom title-bar properties (Title Bar Text/Icon/Height). They live on the
 * extension's bundled ChromeWindow.cs/.vb — writing one of these into the XAML of a project whose
 * copy predates them (e.g. an older ChromeWindow without the settable TitleBarHeight) fails to
 * compile, so the designer refreshes the stale bundled copy first (see ensureBundledComponentsCurrent).
 */
const CHROME_ROOT_PROPS = new Set(['TitleBarTitle', 'TitleBarIcon', 'TitleBarHeight', 'TitleBarBackground', 'TitleBarForeground']);

/**
 * Documents already warned that the project lacks the Avalonia.Controls.DataGrid package.
 */
const dataGridWarnedDocs = new Set<string>();

/**
 * Returns the AnchorHelper file name the project needs if it's missing, else null.
 * The Anchor property is provided by AnchorHelper.cs/.vb, which New Project / New Form
 * bundle automatically — but older projects may not have it, and the saved XAML won't
 * compile until it's copied in.
 */
function anchorHelperMissing(axamlUri: vscode.Uri): string | null {
    const proj = findProject(axamlUri);
    if (!proj) return null;
    const fileName = proj.language === 'vb' ? 'AnchorHelper.vb' : 'AnchorHelper.cs';
    const dirs = new Set([
        path.dirname(proj.projectUri.fsPath),
        path.dirname(axamlUri.fsPath)
    ]);
    for (const d of dirs) {
        if (fs.existsSync(path.join(d, fileName))) return null;
    }
    return fileName;
}

/** Maps an Anchor edge set to the single DockPanel.Dock edge for a DockPanel child (a Status Bar
 *  item): Right wins over Left, Bottom over Top. Returns '' for no edge (Canvas free placement). */
function dockEdgeForAnchor(value: string): string {
    if (/right/i.test(value)) return 'Right';
    if (/left/i.test(value)) return 'Left';
    if (/bottom/i.test(value)) return 'Bottom';
    if (/top/i.test(value)) return 'Top';
    return '';
}

/** When an edge Anchor is set on a direct DockPanel child (e.g. a Status Bar item / StatusDate),
 *  mirror it as DockPanel.Dock so the design preview and the runtime layout agree (the AnchorHelper
 *  does the same dock at runtime). No-op on a Canvas (free placement uses Canvas.Left/Top), on a
 *  DockPanel that is the form's top-level layout (the template docks the Menu bar / Status Bar /
 *  Body there), and when the Anchor value has no edge (cleared). */
function mirrorAnchorDock(el: Element, value: string): void {
    const parent = el.parentNode as Element | null;
    if (!parent || parent.nodeType !== 1 || localName(parent.tagName) !== 'DockPanel') return;
    const top = parent.parentNode as Element | null;
    if (top && top.nodeType === 1 && /window|usercontrol|chrome/i.test(localName(top.tagName))) return;
    const dock = dockEdgeForAnchor(value);
    if (dock) el.setAttribute('DockPanel.Dock', dock);
}

/**
 * True if the project containing `axamlUri` references the Avalonia.Controls.DataGrid package
 * (DataGrid lives in its own package — without it, the placed DataGrid won't compile).
 * Returns true (no warning) when no project can be found to inspect.
 */
function projectHasDataGridPackage(axamlUri: vscode.Uri): boolean {
    const proj = findProject(axamlUri);
    if (!proj) return true;
    try {
        const text = fs.readFileSync(proj.projectUri.fsPath, 'utf8');
        return /Avalonia\.Controls\.DataGrid/.test(text);
    } catch {
        return true;
    }
}

/**
 * Ensures the control lives inside a DockPanel so the Dock property actually
 * takes effect. If it doesn't (e.g. it sits on the Body Canvas), the control is
 * docked into the form's ROOT DockPanel — before the Body Canvas / fill child —
 * so it stays pinned to the form edge and follows the window when resized.
 * On older Canvas-rooted forms it wraps the control in a nested DockPanel.
 * A control inside a structured container (Grid, StackPanel, WrapPanel, …) is
 * being laid out by that container — moving it out to dock would destroy the
 * layout — so it is left in place (Dock simply has no effect there).
 */
/** Converts a SplitPanel pane's free-placement Canvas body into a DockPanel (same name + plain
 *  attributes, existing children moved across) so DockPanel.Dock has somewhere to act INSIDE that
 *  pane. Returns the pane's content element (the DockPanel, or the original when not convertible). */
function paneBodyAsDockPanel(model: XamlModel, paneBody: Element): Element {
    if (localName(paneBody.tagName) === 'DockPanel') return paneBody;
    if (localName(paneBody.tagName) !== 'Canvas') return paneBody;
    const nm = paneBody.getAttribute('x:Name') || paneBody.getAttribute('Name') || '';
    const dock = model.createElement('<DockPanel/>');
    if (nm) dock.setAttribute('x:Name', nm);
    for (let a = 0; a < paneBody.attributes.length; a++) {
        const at = paneBody.attributes.item(a);
        if (!at) continue;
        if (at.name === 'x:Name' || at.name === 'Name') continue;
        if (/^Canvas\./.test(at.name)) continue; // free-placement coords are meaningless in a DockPanel
        dock.setAttribute(at.name, at.value);
    }
    while (paneBody.firstChild) dock.appendChild(paneBody.firstChild);
    if (paneBody.parentNode) paneBody.parentNode.replaceChild(dock, paneBody);
    return dock;
}

function ensureDockPanelParent(model: XamlModel, el: Element): Element {
    const parent = el.parentNode as Element | null;
    if (parent && localName(parent.tagName) === 'DockPanel') return parent;

    // A control dropped inside a SplitPanel pane docks WITHIN that pane (a pane is a region of the
    // split, not the form) — convert the pane's free-placement Canvas body into a DockPanel so the
    // Dock takes effect there and the control never leaves the split panel.
    if (parent && parent.nodeType === 1) {
        const pnm = localName(parent.tagName);
        if (pnm === 'Canvas' && isSplitPaneName(parent.getAttribute('x:Name') || parent.getAttribute('Name') || '')) {
            return paneBodyAsDockPanel(model, parent);
        }
        // A control dropped inside a GrumpyPanel-based bar docks WITHIN that bar (its inner
        // DockPanel), never the form's root — the bar is its own dock region.
        if (pnm === 'Canvas') {
            const dock = dockIntoGrumpy(model, el, parent);
            if (dock) return dock;
        }
    }

    // Only free-positioning contexts (a Canvas or the window root itself) get wrapped/
    // docked. A control inside a Grid/StackPanel/… must stay where its container put it.
    if (parent && parent.nodeType === 1) {
        const pn = localName(parent.tagName);
        const windowLike = pn === 'Window' || /window$/i.test(pn);
        if (!windowLike && pn !== 'Canvas') return parent;
    }

    // Full-switch forms: root content is a DockPanel with a filling Body Canvas.
    const rootContent = rootContainer(model);
    if (rootContent && localName(rootContent.tagName) === 'DockPanel') {
        const kids = elementChildren(rootContent);
        const fillChild = kids.length > 0 ? kids[kids.length - 1] : undefined;
        model.moveTo(el, rootContent);
        if (fillChild && fillChild !== el) rootContent.insertBefore(el, fillChild);
        return rootContent;
    }

    // Older Canvas-rooted forms: wrap the control in a nested DockPanel that fills
    // the parent Canvas so docking still has somewhere to act.
    const name = model.uniqueName('DockPanel');
    let attrs = `x:Name="${name}"`;
    if (parent && localName(parent.tagName) === 'Canvas') {
        const pw = parent.getAttribute('Width');
        const ph = parent.getAttribute('Height');
        if (pw) attrs += ` Width="${pw}"`;
        if (ph) attrs += ` Height="${ph}"`;
    }
    const dockPanel = model.createElement(`<DockPanel ${attrs}/>`);
    if (el.parentNode) el.parentNode.replaceChild(dockPanel, el);
    model.moveTo(el, dockPanel);
    return dockPanel;
}

/** Converts an auto-converted SplitPanel pane body back from a DockPanel to its original Canvas
 *  base (same name + plain attributes, children moved across). Used to restore a pane's free
 *  placement surface once the docked content that required the DockPanel is gone. Returns the
 *  pane's content element (the Canvas, or the original when not convertible). */
function paneBodyAsCanvas(model: XamlModel, paneBody: Element): Element {
    if (localName(paneBody.tagName) === 'Canvas') return paneBody;
    if (localName(paneBody.tagName) !== 'DockPanel') return paneBody;
    const nm = paneBody.getAttribute('x:Name') || paneBody.getAttribute('Name') || '';
    const canvas = model.createElement('<Canvas/>');
    if (nm) canvas.setAttribute('x:Name', nm);
    for (let a = 0; a < paneBody.attributes.length; a++) {
        const at = paneBody.attributes.item(a);
        if (!at) continue;
        if (at.name === 'x:Name' || at.name === 'Name') continue;
        if (at.name === 'LastChildFill') continue; // DockPanel-only — meaningless on a Canvas
        if (/^DockPanel\./.test(at.name)) continue; // a pane body is never itself docked
        canvas.setAttribute(at.name, at.value);
    }
    while (paneBody.firstChild) canvas.appendChild(paneBody.firstChild);
    if (paneBody.parentNode) paneBody.parentNode.replaceChild(canvas, paneBody);
    return canvas;
}

/** Restores the Canvas base of any SplitPanel pane body that is still a DockPanel but now has NO
 *  children. A pane body is only ever converted to a DockPanel to host a docked/filled control
 *  (see ensureDockPanelParent) — once that content is removed the pane should look like it started
 *  (a free-placement Canvas), not stay a DockPanel forever. Returns true when any pane was reverted. */
function revertEmptyPaneBodies(model: XamlModel): boolean {
    let changed = false;
    for (const el of model.controlElements()) {
        const nm = el.getAttribute('x:Name') || el.getAttribute('Name') || '';
        if (!isSplitPaneName(nm) || localName(el.tagName) !== 'DockPanel') continue;
        let hasChild = false;
        for (let c = el.firstChild; c; c = c.nextSibling) {
            if (c.nodeType === 1) { hasChild = true; break; }
        }
        if (!hasChild) {
            paneBodyAsCanvas(model, el);
            changed = true;
        }
    }
    return changed;
}

/** The first real content child of the window root (e.g. the root DockPanel). */
function rootContainer(model: XamlModel): Element | undefined {
    const root = model.root;
    if (!root) return undefined;
    return elementChildren(root).find((k) => !localName(k.tagName).includes('.'));
}

/** Replaces the name attribute (x:Name / Name) in a serialized XAML fragment. */
function replaceFragmentName(xaml: string, oldName: string, newName: string): string {
    return xaml.replace(new RegExp(`(?:x:Name|Name)\\s*=\\s*"${escRe(oldName)}"`), `x:Name="${newName}"`);
}

/** Renames the root name AND every sibling-family name in a XAML fragment that starts with
 *  `oldName` (e.g. a GrumpyPanel's `{n}Dock`/`{n}Body`, a GrumpyStatus's `{n}Label`/`{n}Date`)
 *  to the matching `newName…` form, keeping each suffix. The root itself (no suffix) becomes
 *  exactly `newName`. */
function replaceFragmentFamilyName(xaml: string, oldName: string, newName: string): string {
    return xaml.replace(
        new RegExp(`((?:x:Name|Name)\\s*=\\s*"${escRe(oldName)})([A-Za-z0-9_]*)"`, 'g'),
        (_m, pre: string, suffix: string) => `${pre}${newName}${suffix}"`
    );
}

function elementChildren(el: Element): Element[] {
    const out: Element[] = [];
    for (let i = 0; i < el.childNodes.length; i++) {
        const c = el.childNodes.item(i);
        if (c && c.nodeType === 1) out.push(c as Element);
    }
    return out;
}

/** Finds the container a dropped control should be inserted into. */
function resolveDropTarget(model: XamlModel, start?: Element): Element {
    let cur: Element | null = start ?? model.root;
    while (cur) {
        // Safety: never inspect non-element parents. Custom window roots (e.g.
        // chrome:ChromeWindow) are NOT in CONTAINER_TAGS, so the loop would otherwise
        // walk up past the root to the XML Document node, whose tagName is undefined
        // -> "Cannot read properties of undefined (reading 'indexOf')" on every drop.
        if (cur.nodeType !== 1) break;
        const ln = localName(cur.tagName);
        // Custom Window-derived roots (e.g. chrome:ChromeWindow, ...) behave like Window.
        const windowLike = ln === 'Window' || /window$/i.test(ln);
        // A TabControl drop means "inside the visible tab", not "as a sibling tab":
        // clicking the tab's body area should fill the displayed TabItem's content.
        if (ln === 'TabControl') {
            const firstTab: Element | undefined = elementChildren(cur).find((k) => localName(k.tagName) === 'TabItem');
            if (firstTab) {
                cur = firstTab;
                continue; // re-run the loop on the TabItem (single-content handling)
            }
        }
        if (CONTAINER_TAGS.has(ln) || windowLike) {
            const isSingleContent = SINGLE_CONTENT_TAGS.has(ln) || windowLike;
            if (isSingleContent) {
                // Descend into the real content child, skipping property elements such
                // as Window.Resources / ChromeWindow.Resources.
                const kids: Element[] = elementChildren(cur).filter((k) => !localName(k.tagName).includes('.'));
                if (kids.length > 0) {
                    // Only descend if the first child is a MULTI-CHILD container (Canvas,
                    // Grid, …). If it is a non-container (Button, TextBlock, …) or another
                    // single-content type, returning this container avoids an infinite
                    // loop AND lets addControl wrap the existing content + new element
                    // in a Canvas automatically.
                    const firstTag = localName(kids[0].tagName);
                    const firstIsMultiChild = CONTAINER_TAGS.has(firstTag) &&
                        !SINGLE_CONTENT_TAGS.has(firstTag) && !/^window$/i.test(firstTag);
                    if (firstIsMultiChild) {
                        cur = kids[0];
                        continue;
                    }
                }
                return cur;
            }
            return cur; // multi-child container (Canvas, Grid, …)
        }
        cur = cur.parentNode as Element | null;
    }
    return model.root;
}

/**
 * Picks the control the drop coordinates should be relative to. The webview sends
 * click coordinates in design-surface space; when the resolved target is (or is
 * wrapped into) a Canvas, Canvas.Left/Top must be relative to that Canvas.
 * - target is a Canvas -> the Canvas itself.
 * - target is a TabItem (a TabControl drop resolves into its first tab) -> the
 *   TabControl, because the wrapper Canvas addControl creates fills the tab's
 *   content area inside the TabControl.
 * - the clicked parent is a single-content container and the target IS that parent
 *   (e.g. Border / ScrollViewer) -> that parent.
 */
function coordRefFor(parent: Element | null | undefined, target: Element): Element | null {
    if (target.tagName === 'Canvas') return target;
    if (localName(target.tagName) === 'TabItem') {
        const p = target.parentNode as Element | null;
        return p && p.nodeType === 1 ? p : null;
    }
    if (parent && SINGLE_CONTENT_TAGS.has(localName(parent.tagName)) && target === parent) return parent;
    return null;
}

/**
 * XAML for a new TabItem that ships with a visible, fillable body (a DockPanel with a
 * Canvas inside, mirroring the TabControl snippet + blank template). Every tab needs this
 * body so its content area is visible/clickable in the preview and fills the tab control
 * minus the tab strip.
 */
function tabItemXaml(tabControlName: string, page: number): string {
    const body = `${tabControlName}Body${page}`;
    return `<TabItem Header="Page ${page}">` +
        `<DockPanel x:Name="${body}">` +
        `<Canvas x:Name="${body}Canvas"/>` +
        `</DockPanel>` +
        `</TabItem>`;
}

// ---------------------------------------------------------------- menu items
// Design-time model of a <Menu>'s item tree. Kinds map onto real Avalonia semantics:
//   Item      → <MenuItem Header="…"> (children = its submenu)
//   CheckBox  → <MenuItem Header="…" ToggleType="CheckBox">
//   Radio     → <MenuItem Header="…" ToggleType="Radio">
//   ComboBox  → a <MenuItem> whose submenu holds its option items
//   FileSelector   → the bundled <chrome:PathPicker PathType="File" …/>   — a path row ON the menu:
//   FolderSelector → the same with PathType="Folder"                       pick a file / a folder
//   Separator → <Separator/>
//   Space     → an invisible gap on the TOP bar: saved as an inert, fixed-width <MenuItem
//               IsEnabled="False" Focusable="False" Width="…"/> (no header/submenu)
// The same shape travels to/from the webview (the tree editor + the bar dummies). Nesting is
// capped at MENU_MAX_DEPTH item levels below the Menu bar (top-level item = level 1).
type MenuNodeKind = 'Item' | 'CheckBox' | 'Radio' | 'ComboBox' | 'Separator' | 'Space' | 'FileSelector' | 'FolderSelector';
interface MenuTreeNode {
    kind: MenuNodeKind;
    header?: string;
    width?: number;
    /** FileSelector/FolderSelector only: the picker's PathType. Carried so a hand-written
     *  `PathType="SaveFile"` picker inside a menu is not downgraded when the tree is re-saved. */
    pathType?: 'File' | 'Folder' | 'SaveFile';
    children?: MenuTreeNode[];
}
const MENU_MAX_DEPTH = 5;

/** Direct child <MenuItem>/<Separator>/<chrome:PathPicker> elements of a Menu or of a MenuItem's
 *  submenu. A PathPicker counts as an item row here, so the Menu Items editor round-trips it
 *  (and replacing the tree doesn't silently drop it). */
function menuItemEls(el: Element): Element[] {
    return elementChildren(el).filter((k) => {
        const t = localName(k.tagName);
        return t === 'MenuItem' || t === 'Separator' || t === 'PathPicker';
    });
}

/** Converts one <MenuItem>/<Separator> DOM element into its design-time node. */
function menuNodeOf(el: Element): MenuTreeNode | null {
    const t = localName(el.tagName);
    if (t === 'Separator') return { kind: 'Separator' };
    // A file/folder selector row (the bundled <chrome:PathPicker>): Width is the row's size and
    // Title is the dialog caption, which the editor shows in its text field.
    if (t === 'PathPicker') {
        const raw = (el.getAttribute('PathType') || 'File').trim();
        const lower = raw.toLowerCase();
        const pathType: MenuTreeNode['pathType'] = lower === 'folder' ? 'Folder' : lower === 'savefile' ? 'SaveFile' : 'File';
        const node: MenuTreeNode = { kind: pathType === 'Folder' ? 'FolderSelector' : 'FileSelector', pathType };
        const title = (el.getAttribute('Title') || '').trim();
        if (title !== '') node.header = title;
        const w = parseFloat(el.getAttribute('Width') || '0');
        if (Number.isFinite(w) && w > 0) node.width = Math.round(w);
        return node;
    }
    if (t !== 'MenuItem') return null;
    // A Space gap is saved as an inert, empty, fixed-width MenuItem (IsEnabled=False, Focusable=
    // False, no Header, no children) — recognise it again on re-read so the editor round-trips.
    if ((el.getAttribute('IsEnabled') || '').toLowerCase() === 'false'
        && !((el.getAttribute('Header') || '').trim())
        && elementChildren(el).length === 0) {
        const w = parseFloat(el.getAttribute('Width') || '0');
        if (Number.isFinite(w) && w > 0) return { kind: 'Space', width: Math.round(w) };
    }
    const tt = (el.getAttribute('ToggleType') || '').toLowerCase();
    const kind: MenuNodeKind = tt === 'checkbox' ? 'CheckBox' : tt === 'radio' ? 'Radio' : 'Item';
    const header = (el.getAttribute('Header') || '').trim();
    const node: MenuTreeNode = { kind };
    if (header !== '') node.header = header;
    const kids = menuItemEls(el).map(menuNodeOf).filter((x): x is MenuTreeNode => x !== null);
    if (kids.length > 0) node.children = kids;
    return node;
}

/* ---------------------------------------------------------------------------------------------
 * Menu Items conversion — exported so the round-trip (XAML → design-time tree → XAML, incl. the
 * File/Folder Selector kinds) is unit-tested without driving the whole editor panel.
 * ------------------------------------------------------------------------------------------- */

/** The design-time tree (top-level items) of a Menu element. */
export function menuTreeOf(el: Element): MenuTreeNode[] {
    return menuItemEls(el).map(menuNodeOf).filter((x): x is MenuTreeNode => x !== null);
}

/** Builds a <MenuItem>/<Separator>/<chrome:PathPicker> DOM element from a design-time node
 *  (`depth` guards nesting). */
export function menuElementFor(model: XamlModel, node: MenuTreeNode, depth: number): Element {
    if (node.kind === 'Separator') {
        // A top-level (bar) Separator carries the `MenuBarDivider` class so the Menu's vertical-
        // divider Style targets ONLY it. Avalonia applies a control's Styles into sub-menu popups
        // too (logical-tree inheritance), so without the class every Separator — including the
        // sub-menu ones, which must stay horizontal — would be mis-styled.
        return depth === 1
            ? model.createElement('<Separator Classes="MenuBarDivider"/>')
            : model.createElement('<Separator/>');
    }
    // An invisible top-bar gap: an inert MenuItem (no header/submenu) whose Width is the gap.
    if (node.kind === 'Space') {
        const w = Math.max(1, Math.min(500, Math.round(node.width && node.width > 0 ? node.width : 12)));
        return model.createElement(`<MenuItem IsEnabled="False" Focusable="False" Width="${w}"/>`);
    }
    // A file/folder selector row on the menu: the bundled AvaloniaChrome.PathPicker. Width is the
    // row's size, Title is the dialog caption (the row's text field) — never a submenu.
    if (node.kind === 'FileSelector' || node.kind === 'FolderSelector') {
        const pathType = node.pathType ?? (node.kind === 'FolderSelector' ? 'Folder' : 'File');
        const w = Math.max(40, Math.min(600, Math.round(node.width && node.width > 0 ? node.width : 160)));
        const title = (node.header || '').trim()
            || (pathType === 'Folder' ? 'Select a folder' : pathType === 'SaveFile' ? 'Save file' : 'Select a file');
        // Set the attributes through the DOM (a Title with quotes/& stays escaped in the XAML).
        const picker = model.createElement('<chrome:PathPicker Width="160" Height="24"/>');
        picker.setAttribute('PathType', pathType);
        picker.setAttribute('Width', String(w));
        picker.setAttribute('Title', title);
        // The element uses the `chrome` prefix, so the document root must declare it.
        model.ensureChromeNamespace();
        return picker;
    }
    const el = model.createElement('<MenuItem/>');
    const header = (node.header || '').trim();
    if (header !== '') el.setAttribute('Header', header);
    if (node.kind === 'CheckBox') el.setAttribute('ToggleType', 'CheckBox');
    else if (node.kind === 'Radio') el.setAttribute('ToggleType', 'Radio');
    if (depth < MENU_MAX_DEPTH) {
        for (const c of node.children || []) el.appendChild(menuElementFor(model, c, depth + 1));
    }
    return el;
}

/** Validates a tree that came from the webview (structure only; never trusts its input). */
export function sanitizeMenuNodes(raw: unknown): MenuTreeNode[] {
    if (!Array.isArray(raw)) return [];
    const clean = (n: unknown, depth: number): MenuTreeNode | null => {
        if (depth > MENU_MAX_DEPTH || !n || typeof n !== 'object') return null;
        const o = n as Record<string, unknown>;
        let kind: MenuNodeKind = 'Item';
        const k = String(o.kind ?? 'Item');
        if (k === 'CheckBox' || k === 'Radio' || k === 'ComboBox' || k === 'Separator' || k === 'Space'
            || k === 'FileSelector' || k === 'FolderSelector') kind = k;
        const node: MenuTreeNode = { kind };
        // A file/folder selector row: caption in `header`, size in `width`, PathType kept when the
        // payload names one (a hand-written SaveFile picker). It never has children.
        if (kind === 'FileSelector' || kind === 'FolderSelector') {
            const pt = String(o.pathType ?? '');
            if (pt === 'File' || pt === 'Folder' || pt === 'SaveFile') node.pathType = pt;
            const h = String(o.header ?? '').trim();
            if (h !== '') node.header = h;
            const w = parseInt(String(o.width ?? ''), 10);
            if (Number.isFinite(w) && w > 0) node.width = Math.min(600, w);
            return node;
        }
        if (kind === 'Space') {
            // A Space is an invisible TOP-BAR gap (width in px) — never inside a submenu, and it
            // has neither a header nor children.
            if (depth !== 1) return null;
            const w = parseInt(String(o.width ?? ''), 10);
            node.width = Number.isFinite(w) && w > 0 ? Math.min(500, w) : 12;
            return node;
        }
        if (kind !== 'Separator') {
            const h = String(o.header ?? '').trim();
            if (h !== '') node.header = h;
        }
        const cleaned = (Array.isArray(o.children) ? o.children : [])
            .map((c) => clean(c, depth + 1)).filter((x): x is MenuTreeNode => x !== null);
        if (cleaned.length > 0) node.children = cleaned;
        return node;
    };
    return raw.map((r) => clean(r, 1)).filter((x): x is MenuTreeNode => x !== null);
}

/** Avalonia's `Separator` draws a HORIZONTAL flyout line (its Fluent theme sets a short Height and
 *  a full-width template), so a Separator placed on the top-level bar (a horizontal Menu stack)
 *  reads as a horizontal dash instead of a vertical divider. The Menu therefore gets a scoped
 *  Style (only while it actually HAS a top-level Separator) that swaps the Separator template for
 *  a thin vertical line. It targets ONLY top-level separators — those carry the class
 *  `MenuBarDivider` (see menuElementFor): Avalonia applies a control's Styles into sub-menu popups
 *  too (logical-tree inheritance), so an un-scoped rule would turn every sub-menu Separator into
 *  the same vertical stub. Sub-menu Separators (no class) keep the normal horizontal flyout look. */
function syncMenuSeparatorStyle(model: XamlModel, menuEl: Element, hasTopSeparator: boolean): void {
    const findStyles = () => elementChildren(menuEl).find((c) => localName(c.tagName) === 'Menu.Styles');
    // Ours = a Style that (re)shapes Separators — matches the class-scoped rule we write today and
    // the older un-scoped 'Separator' rule an earlier version may have saved.
    const findOurs = (styles?: Element) => styles && elementChildren(styles).find((s) =>
        localName(s.tagName) === 'Style' && /^Separator(\.MenuBarDivider)?$/.test(s.getAttribute('Selector') || ''));
    const styles = findStyles();
    const ours = findOurs(styles);
    if (!hasTopSeparator) {
        // No top-level Separator any more — drop the verticalising rule (and the empty Styles
        // element) so the saved XAML stays tidy.
        if (styles && ours) {
            styles.removeChild(ours);
            if (elementChildren(styles).length === 0) menuEl.removeChild(styles);
        }
        return;
    }
    if (ours) return; // already in place
    const style = model.createElement(
        '<Style Selector="Separator.MenuBarDivider">' +
        '<Setter Property="Width" Value="1"/>' +
        '<Setter Property="Height" Value="16"/>' +
        '<Setter Property="Margin" Value="6,3"/>' +
        '<Setter Property="HorizontalAlignment" Value="Center"/>' +
        '<Setter Property="VerticalAlignment" Value="Center"/>' +
        '<Setter Property="Template">' +
        '<ControlTemplate TargetType="Separator">' +
        '<Border Width="1" VerticalAlignment="Stretch" HorizontalAlignment="Center" ' +
        'Background="{DynamicResource SystemControlForegroundBaseMediumLowBrush}"/>' +
        '</ControlTemplate>' +
        '</Setter>' +
        '</Style>'
    );
    let st = styles;
    if (!st) {
        st = model.createElement('<Menu.Styles/>');
        menuEl.appendChild(st);
    }
    st.appendChild(style);
}

// ---------------------------------------------------------------- status bar items
// The Status Bar tool is a DOCKPANEL strip (docked Bottom). Its 'Status Items' editor manages the
// child controls of the bar; each child is pinned LEFT or RIGHT (DockPanel.Dock) and stretches to
// the bar's height. Kinds map onto real Avalonia elements:
//   TextBlock (label) / TextBox / Button / ProgressBar / Separator (a gap) / StatusDate (live
//   clock) / XYTracker (live WxH of the form — Classes="XYTracker" marks it)
type StatusKind = 'TextBlock' | 'TextBox' | 'Button' | 'ProgressBar' | 'Separator' | 'StatusDate' | 'XYTracker';
interface StatusItem { kind: StatusKind; text: string; position: 'Left' | 'Right'; }
const STATUS_KINDS = new Set<string>(['TextBlock', 'TextBox', 'Button', 'ProgressBar', 'Separator', 'StatusDate', 'XYTracker']);

/** Maps an existing bar child element to its Status-kind (or null if it isn't one we manage). */
function statusKindOf(el: Element): StatusKind | null {
    const t = localName(el.tagName);
    if (t === 'TextBlock') {
        // An XYTracker is a TextBlock carrying Classes="XYTracker" (it also has a Loaded handler,
        // so it must be checked BEFORE the StatusDate heuristic, which keys on `Loaded` alone).
        const cls = (el.getAttribute('Classes') || '').split(/\s+/);
        if (cls.indexOf('XYTracker') >= 0) return 'XYTracker';
        return el.hasAttribute('Loaded') ? 'StatusDate' : 'TextBlock';
    }
    if (t === 'TextBox') return 'TextBox';
    if (t === 'Button') return 'Button';
    if (t === 'ProgressBar') return 'ProgressBar';
    if (t === 'Border' && elementChildren(el).length === 0 && !el.hasAttribute('Content')) return 'Separator';
    return null;
}
/** True when `el` sits inside a Status Bar strip — the designer then treats a tracker placed there as
 *  showing the FORM's size rather than its parent. A strip is either the legacy Status Bar (a
 *  DockPanel named StatusBarN) or the new GrumpyStatus bar (a chrome:GrumpyPanel DOCKED BOTTOM —
 *  GrumpyStatus's snippet pins it to the bottom edge, and any later bottom-docked GrumpyPanel band is
 *  a status strip too). */
function isWithinStatusBar(el: Element | null): boolean {
    for (let d = 0, cur = el; cur && d < 4; d++, cur = cur.parentNode as Element | null) {
        if (!cur || cur.nodeType !== 1) return false;
        const n = cur.getAttribute('x:Name') || cur.getAttribute('Name') || '';
        if (/^StatusBar\d+$/.test(n)) return true;
        if (isGrumpyRoot(cur) && (cur.getAttribute('DockPanel.Dock') || '').trim().toLowerCase() === 'bottom') return true;
    }
    return false;
}
function statusTextOf(el: Element, kind: StatusKind): string {
    if (kind === 'Button') return (el.getAttribute('Content') || '').trim();
    if (kind === 'TextBlock' || kind === 'TextBox') return (el.getAttribute('Text') || '').trim();
    return '';
}
function statusPositionOf(el: Element): 'Left' | 'Right' {
    return (el.getAttribute('DockPanel.Dock') || '').trim().toLowerCase() === 'right' ? 'Right' : 'Left';
}
/** The current status items of a bar, in VISUAL order (left group left→right, then the right
 *  group right-to-left is unwound to left→right). The editor shows this order and apply() writes
 *  it back (reversing the right group), so the saved file reads back to the same list. */
function statusItemsOf(el: Element): StatusItem[] {
    const raw: StatusItem[] = [];
    for (const c of elementChildren(el)) {
        const kind = statusKindOf(c);
        if (!kind) continue;
        raw.push({ kind, text: statusTextOf(c, kind), position: statusPositionOf(c) });
    }
    const lefts = raw.filter((i) => i.position !== 'Right');
    const rights = raw.filter((i) => i.position === 'Right').reverse();
    return [...lefts, ...rights];
}
/** Validates the item list coming back from the webview editor. */
function sanitizeStatusItems(raw: unknown): StatusItem[] {
    if (!Array.isArray(raw)) return [];
    const out: StatusItem[] = [];
    for (const r of raw) {
        if (!r || typeof r !== 'object') continue;
        const o = r as Record<string, unknown>;
        const k = String(o.kind ?? 'TextBlock');
        if (!STATUS_KINDS.has(k)) continue;
        const kind = k as StatusKind;
        const text = String(o.text ?? '').trim();
        const position = String(o.position ?? 'Left').toLowerCase() === 'right' ? 'Right' : 'Left';
        out.push({ kind, text, position });
    }
    return out;
}

// ---------------------------------------------------------------- split panels
// The 'SplitPanel' tool is either a Border wrapper — the default 3-zone T-layout: the Border is the
// panel's own clickable frame around an inner Grid — or, for older documents, the Grid itself.
// Its panes are Borders (each with a settable border + an empty named Canvas body) separated by
// runtime-draggable GridSplitters (Auto rows/columns are the splitter gutters). Star sizes make the
// whole panel auto-resize with the form; a pane's Width/Height IS its divider position (0 hides it).
function splitDefSizes(el: Element, kind: 'cols' | 'rows'): string[] {
    const prop = kind === 'cols' ? 'Grid.ColumnDefinitions' : 'Grid.RowDefinitions';
    const defs = elementChildren(el).find((k) => localName(k.tagName) === prop);
    if (!defs) return [];
    const attr = kind === 'cols' ? 'Width' : 'Height';
    return elementChildren(defs).map((d) => d.getAttribute(attr) || '*');
}
/** The RowDefinition/ColumnDefinition element at `index` in a SplitPanel's grid, if any. */
function splitDefAt(grid: Element, kind: 'cols' | 'rows', index: number): Element | null {
    const prop = kind === 'cols' ? 'Grid.ColumnDefinitions' : 'Grid.RowDefinitions';
    const defs = elementChildren(grid).find((k) => localName(k.tagName) === prop);
    if (!defs) return null;
    return elementChildren(defs)[index] || null;
}
/** Parses a plain pixel number ('45'); returns 0 for empty / '*' / '2*' / non-numeric. */
function pxOf(s: string | null | undefined): number {
    const t = String(s ?? '').trim();
    if (!/^\d+(\.\d+)?$/.test(t)) return 0;
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : 0;
}
/** The top/right/bottom/left margins of a control (thickness shorthand supported). */
function marginExtents(el: Element): { top: number; right: number; bottom: number; left: number } {
    const parts = (el.getAttribute('Margin') || '').trim().split(/\s*,\s*/).map((p) => parseFloat(p));
    if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
    if (parts.length === 2 && parts.every((n) => !Number.isNaN(n))) return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
    const single = parts.length === 1 && !Number.isNaN(parts[0]) ? parts[0] : 0;
    return { top: single, right: single, bottom: single, left: single };
}
/** The smallest extent (px) a SplitPanel's grid needs along an axis before it starts clipping:
 *  fixed rows/cols + Auto gutters (the GridSplitter thickness) + star rows/cols clamped by their
 *  MinHeight/MinWidth (0 when no minimum is set, i.e. fully flexible). */
function splitGridMin(grid: Element, kind: 'cols' | 'rows'): number {
    const prop = kind === 'cols' ? 'Grid.ColumnDefinitions' : 'Grid.RowDefinitions';
    const defs = elementChildren(grid).find((k) => localName(k.tagName) === prop);
    if (!defs) return 0;
    const sizeAttr = kind === 'cols' ? 'Width' : 'Height';
    const minAttr = kind === 'cols' ? 'MinWidth' : 'MinHeight';
    const indexAttr = kind === 'cols' ? 'Grid.Column' : 'Grid.Row';
    const barAttr = kind === 'cols' ? 'Width' : 'Height';
    const autoSize = new Map<number, number>();
    for (const c of elementChildren(grid)) {
        if (localName(c.tagName) !== 'GridSplitter') continue;
        const idx = parseInt(c.getAttribute(indexAttr) || '-1', 10);
        if (idx >= 0) autoSize.set(idx, pxOf(c.getAttribute(barAttr)));
    }
    let total = 0;
    elementChildren(defs).forEach((d, i) => {
        const size = (d.getAttribute(sizeAttr) || '*').trim();
        if (/^\d+(\.\d+)?$/.test(size)) { total += parseFloat(size); return; }
        if (/auto/i.test(size)) { total += autoSize.get(i) ?? 0; return; }
        total += pxOf(d.getAttribute(minAttr));
    });
    return total;
}
/** The layout "floor" of a Window-rooted form: the smallest client size at which its fixed bars and
 *  minimum-constrained panes stop clipping (flexible star pieces may shrink to their minimums; free
 *  Canvas content is not counted). Returns 0 on an axis nothing constrains. This is what the form's
 *  own MinWidth/MinHeight must be kept at, because only the Window minimum stops the OS/window
 *  manager from letting the user shrink below the content (RowDefinition mins alone would clip). */
function formFloorOf(root: Element): { minWidth: number; minHeight: number } {
    let minWidth = 0;
    let minHeight = 0;
    if (localName(root.tagName) === 'ChromeWindow') minHeight += pxOf(root.getAttribute('TitleBarHeight')) || 44;
    const content = elementChildren(root).find((c) => c.nodeType === 1);
    if (!content) return { minWidth, minHeight };
    const contentMin = (el: Element): { w: number; h: number } => {
        const grid = splitGridOf(el);
        if (grid) return { w: splitGridMin(grid, 'cols'), h: splitGridMin(grid, 'rows') };
        return { w: pxOf(el.getAttribute('MinWidth')), h: pxOf(el.getAttribute('MinHeight')) };
    };
    if (localName(content.tagName) === 'DockPanel') {
        const kids = elementChildren(content).filter((c) => c.nodeType === 1);
        let fillMin = { w: 0, h: 0 };
        kids.forEach((c, i) => {
            const isLast = i === kids.length - 1;
            const dock = (c.getAttribute('DockPanel.Dock') || (isLast ? '' : 'Left')).trim().toLowerCase();
            const m = marginExtents(c);
            if (isLast || dock === '' || dock === 'fill') {
                const cm = contentMin(c);
                fillMin = { w: Math.max(fillMin.w, cm.w + m.left + m.right), h: Math.max(fillMin.h, cm.h + m.top + m.bottom) };
                return;
            }
            if (dock === 'top' || dock === 'bottom') {
                const base = pxOf(c.getAttribute('Height')) || pxOf(c.getAttribute('MinHeight'));
                minHeight += base + m.top + m.bottom;
            } else {
                const base = pxOf(c.getAttribute('Width')) || pxOf(c.getAttribute('MinWidth'));
                minWidth += base + m.left + m.right;
            }
        });
        minWidth += fillMin.w;
        minHeight += fillMin.h;
    } else {
        const cm = contentMin(content);
        minWidth += cm.w;
        minHeight += cm.h;
    }
    return { minWidth, minHeight };
}
/** A SplitPanel container name (SplitPanel1, ...) — its element is a Border (new) or a Grid (old). */
function isSplitName(name: string | null | undefined): boolean {
    return /^SplitPanel\d+$/.test(name || '');
}
/** A SplitPanel pane-body name (SplitPanel1Pane0, ...). */
function isSplitPaneName(name: string | null | undefined): boolean {
    return /^SplitPanel\d+Pane\d+$/.test(name || '');
}
// ---------------- GrumpyPanel / Grumpy* bars (Border-based docking region) ----------------
/** The x:Name/Name of an element. */
function elName(el: Element): string {
    return el.getAttribute('x:Name') || el.getAttribute('Name') || '';
}
/** True if `el` is a GrumpyPanel-based root (the <chrome:GrumpyPanel> element) — GrumpyPanel1,
 *  GrumpyStatus1, ... whatever the name. */
function isGrumpyRoot(el: Element): boolean {
    return el.nodeType === 1 && localName(el.tagName) === 'GrumpyPanel' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(elName(el));
}
/**
 * If `el` is the structural inner DockPanel or the body Canvas of a GrumpyPanel-based root,
 * returns { root, part: 'dock' | 'body' }; else null. The parts are recognised STRUCTURALLY
 * (a DockPanel directly under the root named `<root>Dock`, or that DockPanel's `<root>Body` Canvas
 * child), so any GrumpyPanel-based bar — GrumpyPanel, GrumpyStatus, ... — is covered whatever its
 * name prefix.
 */
function grumpyPartOf(el: Element): { root: Element; part: 'dock' | 'body' } | null {
    const nm = elName(el);
    if (!nm || !el.parentNode) return null;
    if (localName(el.tagName) === 'DockPanel' && nm.endsWith('Dock')) {
        const root = el.parentNode as Element | null;
        if (root && isGrumpyRoot(root) && elName(root) === nm.slice(0, -4)) {
            return { root, part: 'dock' };
        }
    }
    if (localName(el.tagName) === 'Canvas' && nm.endsWith('Body')) {
        const dock = el.parentNode as Element | null;
        const root = dock && dock.parentNode ? (dock.parentNode as Element | null) : null;
        if (dock && localName(dock.tagName) === 'DockPanel' && root && isGrumpyRoot(root)
            && elName(dock) === elName(root) + 'Dock' && nm === elName(root) + 'Body') {
            return { root, part: 'body' };
        }
    }
    return null;
}
/**
 * Docks `el` INSIDE a GrumpyPanel-based bar (whose free body canvas is `bodyEl`): the control is
 * moved from the free body into the bar's inner DockPanel, BEFORE the body canvas, so the body
 * stays the DockPanel's fill child and the docked control pins to the bar's edge (real dock band).
 * Returns the inner DockPanel, or null when `bodyEl` isn't a GrumpyPanel-based bar's body. */
function dockIntoGrumpy(model: XamlModel, el: Element, bodyEl: Element): Element | null {
    const gp = grumpyPartOf(bodyEl);
    if (!gp || gp.part !== 'body') return null;
    const dock = bodyEl.parentNode as Element | null;
    if (!dock || dock.nodeType !== 1 || localName(dock.tagName) !== 'DockPanel') return null;
    model.moveTo(el, dock);
    dock.insertBefore(el, bodyEl); // keep the body canvas LAST = the DockPanel's fill child
    return dock;
}
/** The inner Grid that owns a SplitPanel's row/column definitions + panes: the element itself when
 *  it's a Grid, else the direct Grid child of a Border wrapper. */
function splitGridOf(el: Element): Element | null {
    const tag = localName(el.tagName);
    if (tag === 'Grid') return el;
    if (tag === 'Border') {
        for (const c of elementChildren(el)) {
            if (localName(c.tagName) === 'Grid') return c;
        }
    }
    return null;
}
/** Indices of the CONTENT (non-Auto) row/column definitions of a Grid — the Auto ones are the
 *  splitter gutters, so panes live in the content rows/columns. */
function contentDefs(el: Element, kind: 'cols' | 'rows'): number[] {
    const sizes = splitDefSizes(el, kind);
    const out: number[] = [];
    for (let i = 0; i < sizes.length; i++) {
        if (!/auto/i.test(sizes[i])) out.push(i);
    }
    return out;
}
type SplitShape = 'zones' | 'columns' | 'rows';
/** The current layout shape of a SplitPanel grid. 'zones' is the T layout: `top` panes side-by-side
 *  in the top band over a full-width bottom pane (count = top + 1); 'columns'/'rows' are a plain
 *  run of N panes. */
function splitShapeOf(el: Element): { shape: SplitShape; count: number; top: number } {
    const cols = contentDefs(el, 'cols');
    const rows = contentDefs(el, 'rows');
    if (cols.length >= 2 && rows.length >= 2) {
        return { shape: 'zones', top: cols.length, count: cols.length + 1 };
    }
    if (rows.length >= 2) return { shape: 'rows', count: rows.length, top: 0 };
    return { shape: 'columns', count: Math.max(cols.length, 2), top: 0 };
}
/** Walks up from a pane body to its SplitPanel container (Border or Grid), if named SplitPanelN. */
function splitRootOf(el: Element): Element | null {
    let cur: Element | null = el;
    for (let d = 0; cur && d < 6; d++, cur = cur.parentNode as Element | null) {
        if (!cur || cur.nodeType !== 1) return null;
        const nm = cur.getAttribute('x:Name') || cur.getAttribute('Name') || '';
        if (isSplitName(nm)) return cur;
    }
    return null;
}
/** The pane Border wrapper of `paneBody` inside its grid + which row/column it occupies and whether
 *  each axis really is a split (2+ content definitions) that the pane's size can drive. */
function paneGeometry(grid: Element, paneBody: Element): {
    border: Element; row: number; col: number; rowSpan: number; colSpan: number;
    rowSplit: boolean; colSplit: boolean;
} | null {
    const border = paneBody.parentNode as Element | null;
    if (!border || border.nodeType !== 1 || localName(border.tagName) !== 'Border') return null;
    return {
        border,
        row: parseInt(border.getAttribute('Grid.Row') || '0', 10),
        col: parseInt(border.getAttribute('Grid.Column') || '0', 10),
        rowSpan: parseInt(border.getAttribute('Grid.RowSpan') || '1', 10),
        colSpan: parseInt(border.getAttribute('Grid.ColumnSpan') || '1', 10),
        rowSplit: contentDefs(grid, 'rows').length >= 2,
        colSplit: contentDefs(grid, 'cols').length >= 2
    };
}
/** A pane body's grid-definition size as a plain pixel number when fixed, else the measured pixels. */
function paneSizeDisplay(grid: Element, kind: 'cols' | 'rows', index: number, measured: number): string {
    const sizes = splitDefSizes(grid, kind);
    const s = sizes[index] ?? '';
    if (/^\d+(\.\d+)?$/.test(s)) return s;
    return String(Math.max(0, Math.round(measured)));
}
/** A pane's (row,col) placement in a target split shape, with spans (null when the pane doesn't
 *  exist in that shape). Zones: panes 0..top-1 fill the top band (even columns), pane `top` spans
 *  the whole bottom row. Columns/rows use even indexes so odd indexes are the Auto splitter gutters. */
function panePlacement(shape: SplitShape, i: number, top = 2): { row: number; col: number; rowSpan?: number; colSpan?: number } | null {
    if (shape === 'zones') {
        const t = Math.max(2, Math.min(8, Math.round(top) || 2));
        if (i < t) return { row: 0, col: i * 2 };
        if (i === t) return { row: 2, col: 0, colSpan: t * 2 - 1 };
        return null;
    }
    if (shape === 'columns') return { row: 0, col: i * 2 };
    return { row: i * 2, col: 0 };
}
/** Row/column definition sizes for a target split shape (`top` = how many panes fill the top band
 *  of a Zones layout). */
function splitDefsFor(shape: SplitShape, count: number, top = 2): { cols: string[]; rows: string[] } {
    if (shape === 'zones') {
        const t = Math.max(2, Math.min(8, Math.round(top) || 2));
        const cols = ['*'];
        for (let j = 1; j < t; j++) cols.push('Auto', '*');
        return { cols, rows: ['3*', 'Auto', '2*'] };
    }
    if (shape === 'columns') {
        const cols = ['*'];
        for (let j = 1; j < count; j++) { cols.push('Auto', '*'); }
        return { cols, rows: ['*'] };
    }
    const rows = ['*'];
    for (let j = 1; j < count; j++) { rows.push('Auto', '*'); }
    return { cols: ['*'], rows };
}
/** One runtime GridSplitter of a SplitPanel's grid, in visual order, with its editable styling. */
interface SplitterRow {
    el: Element;
    /** 'vertical' = a column divider (its Width is the bar thickness); 'horizontal' = a row divider
     *  (its Height is the bar thickness). */
    direction: 'vertical' | 'horizontal';
    thickness: string;
    color: string;
    visible: boolean;
}
/** Every runtime GridSplitter of a SplitPanel's grid (in order), with its current styling. */
function splitterRowsOf(grid: Element): SplitterRow[] {
    const rows: SplitterRow[] = [];
    for (const c of elementChildren(grid)) {
        if (localName(c.tagName) !== 'GridSplitter') continue;
        const direction: 'vertical' | 'horizontal' =
            /^rows$/i.test(c.getAttribute('ResizeDirection') || '') ? 'horizontal' : 'vertical';
        const barAttr = direction === 'vertical' ? 'Width' : 'Height';
        rows.push({
            el: c,
            direction,
            thickness: c.getAttribute(barAttr) || '5',
            color: c.getAttribute('Background') || '#B0B0B0',
            visible: !/^false$/i.test(c.getAttribute('IsVisible') || '')
        });
    }
    return rows;
}
/** Normalizes a colour string to '#rrggbb', or null when it isn't a plain hex colour. */
function normalizeHexColor(color: string): string | null {
    let c = String(color).trim();
    if (/^#?[0-9a-fA-F]{6}$/.test(c)) {
        if (!c.startsWith('#')) c = '#' + c;
        return c.toLowerCase();
    }
    return null;
}

// ---------------- Design-time splitter drag: divider geometry ----------------
/** One draggable divider between two SplitPanel panes, in WINDOW/design coordinates. `pane` is the
 *  pane whose size the divider drives (the LEFT pane for a vertical divider, the TOP one for a
 *  horizontal divider — its stored Width/Height IS the divider position); `other` is the pane on
 *  the far side (used to clamp the drag so it can't shrink that pane below its minimum). */
interface SplitBar {
    pane: string;
    other: string;
    axis: 'v' | 'h';
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * Derives every draggable divider of every SplitPanel from the measured pane-body rects in a frame.
 * Pure geometry: two pane bodies of the SAME SplitPanel that are edge-adjacent across a small gutter
 * (the splitter bar) form a bar — vertical when they sit side-by-side, horizontal when stacked. The
 * measured body rects already include the Auto splitter gutter, so the bar is the gap between them.
 */
function splitBarsOf(controls: { name: string | null; x: number; y: number; width: number; height: number }[]): SplitBar[] {
    const pane = new Map<string, { prefix: string; x: number; y: number; w: number; h: number }>();
    const order: string[] = [];
    for (const c of controls) {
        const m = /^(SplitPanel\d+)Pane(\d+)$/.exec(c.name || '');
        if (!m) continue;
        const nm = c.name || ''; // m matched → non-empty
        if (!pane.has(nm)) {
            pane.set(nm, { prefix: m[1], x: c.x, y: c.y, w: c.width, h: c.height });
            order.push(nm);
        }
    }
    const bars: SplitBar[] = [];
    const MAX_GAP = 60; // anything wider isn't a splitter gutter (a hidden/collapsed pane)
    for (let i = 0; i < order.length; i++) {
        const nameA = order[i];
        const a = pane.get(nameA)!;
        for (let j = i + 1; j < order.length; j++) {
            const nameB = order[j];
            const b = pane.get(nameB)!;
            if (a.prefix !== b.prefix) continue; // panes of the same SplitPanel only
            const gapX = b.x - (a.x + a.w);
            const gapY = b.y - (a.y + a.h);
            // Vertical divider: B is to the RIGHT of A (a small x gap) and they overlap vertically.
            if (gapX >= 0 && gapX <= MAX_GAP && a.y < b.y + b.h - 2 && b.y < a.y + a.h - 2) {
                const x = a.x + a.w;
                bars.push({
                    pane: nameA, other: nameB, axis: 'v', x, y: Math.max(a.y, b.y),
                    w: Math.max(1, b.x - x), h: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
                });
            }
            // Horizontal divider: B is BELOW A (a small y gap) and they overlap horizontally.
            else if (gapY >= 0 && gapY <= MAX_GAP && a.x < b.x + b.w - 2 && b.x < a.x + a.w - 2) {
                const y = a.y + a.h;
                bars.push({
                    pane: nameA, other: nameB, axis: 'h', x: Math.max(a.x, b.x), y,
                    w: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h: Math.max(1, b.y - y)
                });
            }
        }
    }
    return bars;
}

// ---------------------------------------------------------------- DataGrid decoration
// The DataGrid's 'Rows'/'Columns' popup editors group the row/column decoration properties that
// Avalonia's DataGrid exposes directly (attributes written on the control). Alternating row
// colours are intentionally NOT offered — Avalonia 12.1.1 DataGrid has no alternation support.
function dgAttr(el: Element, key: string, def: string): string {
    const v = el.getAttribute(key);
    return v == null || v === '' ? def : v;
}
/** Current row-decoration values of a DataGrid (for the 'Rows' editor pre-fill). */
function dgRowsOf(el: Element): Record<string, string> {
    return {
        rowBackground: dgAttr(el, 'RowBackground', ''),
        foreground: dgAttr(el, 'Foreground', ''),
        rowHeight: dgAttr(el, 'RowHeight', ''),
        rowHeaderWidth: dgAttr(el, 'RowHeaderWidth', '0'),
        gridLines: dgAttr(el, 'GridLinesVisibility', 'None'),
        hLine: dgAttr(el, 'HorizontalGridLinesBrush', ''),
        vLine: dgAttr(el, 'VerticalGridLinesBrush', ''),
        headers: dgAttr(el, 'HeadersVisibility', 'All')
    };
}
/** Current column/header-decoration values of a DataGrid (for the 'Columns' editor pre-fill),
 *  including the header text style (read from its DataGridColumnHeader Style). */
function dgColsOf(el: Element): Record<string, string> {
    return {
        columnWidth: dgAttr(el, 'ColumnWidth', 'Auto'),
        minColumnWidth: dgAttr(el, 'MinColumnWidth', '20'),
        maxColumnWidth: dgAttr(el, 'MaxColumnWidth', ''),
        frozenCount: dgAttr(el, 'FrozenColumnCount', '0'),
        headerHeight: dgAttr(el, 'ColumnHeaderHeight', ''),
        ...dgHeaderOf(el)
    };
}
/** Row-decoration fields (key = message/UI name, attr = XAML attribute, def = omitted default). */
const DG_ROW_FIELDS: { key: string; attr: string; def: string }[] = [
    { key: 'rowBackground', attr: 'RowBackground', def: '' },
    { key: 'foreground', attr: 'Foreground', def: '' },
    { key: 'rowHeight', attr: 'RowHeight', def: '' },
    { key: 'rowHeaderWidth', attr: 'RowHeaderWidth', def: '0' },
    { key: 'gridLines', attr: 'GridLinesVisibility', def: 'None' },
    { key: 'hLine', attr: 'HorizontalGridLinesBrush', def: '' },
    { key: 'vLine', attr: 'VerticalGridLinesBrush', def: '' },
    { key: 'headers', attr: 'HeadersVisibility', def: 'All' }
];
/** Column/header-decoration fields (plain attributes on the DataGrid). */
const DG_COL_FIELDS: { key: string; attr: string; def: string }[] = [
    { key: 'columnWidth', attr: 'ColumnWidth', def: 'Auto' },
    { key: 'minColumnWidth', attr: 'MinColumnWidth', def: '20' },
    { key: 'maxColumnWidth', attr: 'MaxColumnWidth', def: '' },
    { key: 'frozenCount', attr: 'FrozenColumnCount', def: '0' },
    { key: 'headerHeight', attr: 'ColumnHeaderHeight', def: '' }
];
// Header TEXT styling has no direct DataGrid attribute — Avalonia styles the column headers via a
// Style on `dg:DataGridColumnHeader` (inside <dg:DataGrid.Styles>). Each field maps to a Setter.
const DG_HEADER_FIELDS: { key: string; setter: string; def: string }[] = [
    { key: 'headerAlign', setter: 'HorizontalContentAlignment', def: 'Left' },
    { key: 'headerColor', setter: 'Foreground', def: '' },
    { key: 'headerFont', setter: 'FontFamily', def: '' },
    { key: 'headerFontSize', setter: 'FontSize', def: '' },
    { key: 'headerBg', setter: 'Background', def: '' }
];
/** The `<dg:DataGrid.Styles>` property element of a DataGrid, if present. */
function dgStylesBlock(el: Element): Element | null {
    return elementChildren(el).find((c) => localName(c.tagName) === 'DataGrid.Styles') || null;
}
/** The header Style (`dg|DataGridColumnHeader`) inside a DataGrid's Styles, if present. */
function dgHeaderStyle(el: Element): Element | null {
    const block = dgStylesBlock(el);
    if (!block) return null;
    return elementChildren(block).find((s) => localName(s.tagName) === 'Style'
        && /DataGridColumnHeader/.test(s.getAttribute('Selector') || '')) || null;
}
/** Reads the DataGrid's current header-style values (defaults when no Style / no Setter). */
function dgHeaderOf(el: Element): Record<string, string> {
    const out: Record<string, string> = {};
    const style = dgHeaderStyle(el);
    for (const f of DG_HEADER_FIELDS) {
        let val = f.def;
        if (style) {
            const setter = elementChildren(style).find((s) => localName(s.tagName) === 'Setter'
                && s.getAttribute('Property') === f.setter);
            if (setter) val = setter.getAttribute('Value') ?? f.def;
        }
        out[f.key] = val;
    }
    return out;
}

/** The Border wrapper of the pane whose body Canvas is named <containerName>Pane<index>, if any.
 *  `containerName` is the SplitPanel's own name (its panes are named after the container, which for
 *  Border-wrapped splits is the Border — the inner Grid itself is unnamed). */
function splitPaneAt(grid: Element, containerName: string, index: number): Element | null {
    for (const c of elementChildren(grid)) {
        if (localName(c.tagName) !== 'Border') continue;
        for (const inner of elementChildren(c)) {
            const iname = inner.getAttribute('x:Name') || inner.getAttribute('Name') || '';
            if (localName(inner.tagName) === 'Canvas' && iname === `${containerName}Pane${index}`) return c;
        }
    }
    return null;
}
/** Every pane Border wrapper of a SplitPanel (for applying a shared border width). `containerName`
 *  is the SplitPanel's own name (the panes are named after it). */
function splitPanes(grid: Element, containerName: string): Element[] {
    const prefix = `${containerName}Pane`;
    const out: Element[] = [];
    for (const c of elementChildren(grid)) {
        if (localName(c.tagName) !== 'Border') continue;
        for (const inner of elementChildren(c)) {
            const iname = inner.getAttribute('x:Name') || inner.getAttribute('Name') || '';
            if (localName(inner.tagName) === 'Canvas' && iname.startsWith(prefix) && /Pane\d+$/.test(iname)) {
                out.push(c);
                break;
            }
        }
    }
    return out;
}

/** In-memory document backed by an XamlModel. */
export class DesignerDocument implements vscode.CustomDocument {
    model: XamlModel;
    readonly uri: vscode.Uri;
    private savedContent = '';

    private constructor(uri: vscode.Uri, model: XamlModel) {
        this.uri = uri;
        this.model = model;
        this.savedContent = model.serialize(true);
    }

    static async create(uri: vscode.Uri): Promise<DesignerDocument> {
        const data = await vscode.workspace.fs.readFile(uri);
        const text = Buffer.from(data).toString('utf8');
        return new DesignerDocument(uri, new XamlModel(text));
    }

    get dirty(): boolean {
        return this.model.serialize(true) !== this.savedContent;
    }

    markSaved(): void {
        this.savedContent = this.model.serialize(true);
    }

    dispose(): void {
        /* nothing to clean up */
    }
}

export class AvaloniaDesignerProvider implements vscode.CustomEditorProvider<DesignerDocument> {
    static readonly viewType = 'avaloniaDesigner.axamlDesigner';

    private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<DesignerDocument>>();
    readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

    private readonly panels = new Map<string, vscode.WebviewPanel>();
    private readonly docs = new Map<string, DesignerDocument>();
    private readonly frames = new Map<string, FrameResult>();
    private readonly history = new Map<string, DesignerHistory>();
    private lastActivePanel?: vscode.WebviewPanel;
    /** Per-document: the last tab the user selected, so the preview renders it active. */
    private readonly activeTabs = new Map<string, { control: string; index: number }>();
    /**
     * Persisted backup of each control's custom colours (document URI -> control name ->
     * { colourKey: value }), so switching Theme Custom -> System -> Custom restores them.
     */
    private themeBackups: Record<string, Record<string, Record<string, string>>> = {};
    private themeBackupsLoaded = false;
    /**
     * Images that opted OUT of dynamic Grid-cell auto-sizing (keys `docUri::controlName`),
     * persisted in globalState so the choice survives reloads. An opted-out Image keeps the
     * size the user set; the cell no longer resizes it.
     */
    private autoSizeOff = new Set<string>();
    private autoSizeOffLoaded = false;
    /** Pending debounce timers for the automatic code-behind re-check, keyed by .axaml URI. */
    private codeCheckTimers = new Map<string, NodeJS.Timeout>();
    /**
     * Findings the user waved away with "Leave it — keep my code", keyed by .axaml URI and holding
     * issue signatures (see `issueSignature`). They stay hidden until the form is reopened — the
     * point is that a deliberate manual edit must not be reported over and over.
     */
    private dismissed = new Map<string, Set<string>>();
    /** System font family names (from the Avalonia host), fetched once and shared with the webviews'
     *  font pickers. Empty until the first fetch (webviews fall back to a compact default list). */
    private systemFonts: string[] = [];

    constructor(private readonly context: vscode.ExtensionContext, private readonly host: PreviewerHostManager) {
        // Reload the designer when the .axaml changes on disk (e.g. edited in the
        // text editor), unless we have unsaved designer edits pending.
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument((e) => {
                const key = e.document.uri.toString();
                if (key.endsWith('.axaml')) {
                    const panel = this.panels.get(key);
                    const doc = this.docs.get(key);
                    if (!panel || !doc || doc.dirty) return;
                    try {
                        doc.model = new XamlModel(e.document.getText());
                        void this.render(doc, panel);
                    } catch {
                        /* keep old model if the file is temporarily invalid */
                    }
                    return;
                }
                // The code-behind of an open form changed in the text editor: with the
                // 'onType' mode the check re-runs a moment after typing stops (read-only).
                if (this.codeCheckMode() !== 'onType') return;
                this.scheduleCodeBehindCheck(e.document.uri, 900);
            })
        );
        // Saving the code-behind re-checks it ('onSave' and 'onType' modes — the default mode,
        // 'onReturn', re-checks when the designer tab is focused again).
        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument((e) => {
                const mode = this.codeCheckMode();
                if (mode !== 'onSave' && mode !== 'onType') return;
                this.scheduleCodeBehindCheck(e.uri, 0);
            })
        );
    }

    /** When the designer re-checks the code-behind by itself (`avaloniaDesigner.codeCheck.mode`). */
    private codeCheckMode(): 'onReturn' | 'onSave' | 'onType' | 'manual' {
        const v = vscode.workspace.getConfiguration('avaloniaDesigner').get<string>('codeCheck.mode', 'onReturn');
        return v === 'onSave' || v === 'onType' || v === 'manual' ? v : 'onReturn';
    }

    /** Draw ⚠ badges for controls whose wired handler is missing (`avaloniaDesigner.codeCheck.badges`). */
    private codeCheckBadges(): boolean {
        return vscode.workspace.getConfiguration('avaloniaDesigner').get<boolean>('codeCheck.badges', true);
    }

    /**
     * Finds the open designer whose code-behind is `uri` and schedules a silent re-check.
     * `delay` debounces the typing case; 0 runs on the next tick (so the save has settled).
     */
    private scheduleCodeBehindCheck(uri: vscode.Uri, delay: number): void {
        const target = uri.toString();
        for (const [key, panel] of this.panels) {
            const doc = this.docs.get(key);
            if (!doc) continue;
            if (findCodeBehindFile(doc.uri)?.toString() !== target) continue;
            const pending = this.codeCheckTimers.get(key);
            if (pending) clearTimeout(pending);
            const timer = setTimeout(() => {
                this.codeCheckTimers.delete(key);
                void this.runSilentCheck(doc, panel);
            }, delay);
            this.codeCheckTimers.set(key, timer);
        }
    }

    /**
     * Re-checks the code-behind WITHOUT showing the Code Fix list and without ever writing: it
     * refreshes the PROBLEMS entries, the ⚠ badges on the canvas and the status hint. Used by the
     * automatic triggers (returning to the designer, saving/typing in the code-behind).
     */
    private async runSilentCheck(doc: DesignerDocument, panel: vscode.WebviewPanel): Promise<void> {
        if (!panel.visible) return; // nothing to show it on — the panel re-checks when it comes back
        let result;
        try { result = analyzeCodeBehind(doc.uri, this.checkOptions(doc)); }
        catch { return; }
        const issues = this.visibleIssues(doc, result.issues);
        publishIssues(doc.uri, { ...result, issues }, issues);
        // One badge per CONTROL with a problem (the same control can have several findings).
        const markers: { name: string; severity: string; title: string }[] = [];
        const seen = new Set<string>();
        for (const issue of issues) {
            const control = issue.data?.control ?? (issue.file === 'axaml' ? issue.member : undefined);
            if (!control || seen.has(control)) continue;
            if (!doc.model.findByName(control)) continue; // nothing to draw on
            seen.add(control);
            markers.push({ name: control, severity: issue.severity, title: issue.title });
        }
        await this.postCodeMarkers(panel, markers);
        const errors = issues.filter((i) => i.severity === 'error').length;
        const warnings = issues.length - errors;
        await this.postStatus(panel, issues.length === 0
            ? 'Code-behind check: no problems'
            : `⚠ ${errors} error(s), ${warnings} warning(s) in the code-behind — 🩺 Code Fix…`);
    }

    /** Drops the findings the user dismissed with "Leave it — keep my code" (session-scoped). */
    private visibleIssues(doc: DesignerDocument, issues: CodeIssue[]): CodeIssue[] {
        const gone = this.dismissed.get(doc.uri.toString());
        return gone && gone.size > 0 ? issues.filter((i) => gone.has(issueSignature(i)) === false) : issues;
    }

    /** Pushes the badges to the webview (and clears them when there are none). */
    private async postCodeMarkers(panel: vscode.WebviewPanel, markers: { name: string; severity: string; title: string }[]): Promise<void> {
        await panel.webview.postMessage({ type: 'codeMarkers', markers: this.codeCheckBadges() ? markers : [] });
    }

    async openCustomDocument(uri: vscode.Uri): Promise<DesignerDocument> {
        const doc = await DesignerDocument.create(uri);
        this.docs.set(uri.toString(), doc);
        return doc;
    }

    async resolveCustomEditor(document: DesignerDocument, webviewPanel: vscode.WebviewPanel): Promise<void> {
        const key = document.uri.toString();
        this.panels.set(key, webviewPanel);
        if (webviewPanel.active) this.lastActivePanel = webviewPanel;

        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };
        webviewPanel.webview.html = this.webviewHtml(webviewPanel.webview);

        // Reveal the Toolbox sidebar whenever a designer opens, so it's not missed
        // (the toolbox is a contributed view container, not part of this webview).
        void vscode.commands.executeCommand('workbench.view.extension.avaloniaDesigner');

        webviewPanel.onDidChangeViewState(() => {
            if (webviewPanel.active) this.lastActivePanel = webviewPanel;
            // Coming back to the designer (default mode 'onReturn'): re-check the code-behind, which
            // may have been edited in the text editor meanwhile. Read-only — the badges, PROBLEMS
            // and the status hint update; nothing is rewritten.
            if (webviewPanel.visible && this.codeCheckMode() === 'onReturn') {
                void this.runSilentCheck(document, webviewPanel);
            }
        });
        webviewPanel.onDidDispose(() => {
            this.panels.delete(key);
            this.docs.delete(key);
            this.frames.delete(key);
            this.history.delete(key);
            // `activeTabs` is pure per-panel view state ("which TabItem was open") and used to be left
            // behind for every form ever opened in the session.
            //
            // `dismissed` and `codeBackups` are deliberately NOT cleared here: a dismissal is a user
            // DECISION ("leave it — keep my code") and forgetting it when the tab closes would make the
            // same finding pop back up, and `codeBackups` points at a file on disk that an undo may
            // still refer to. Both are small (one entry per form); if they ever need bounding, that is
            // a session-level decision rather than a per-panel one.
            this.activeTabs.delete(key);
            const pending = this.codeCheckTimers.get(key);
            if (pending) { clearTimeout(pending); this.codeCheckTimers.delete(key); }
            if (this.lastActivePanel === webviewPanel) this.lastActivePanel = undefined;
        });
        webviewPanel.webview.onDidReceiveMessage((msg) => void this.handleMessage(document, webviewPanel, msg));
    }

    private async handleMessage(doc: DesignerDocument, panel: vscode.WebviewPanel, msg: any): Promise<void> {
        try {
            switch (msg.type) {
                case 'ready': {
                    this.ensureHistory(doc);
                    this.sendHistoryState(doc, panel);
                    await this.postStatus(panel, 'Starting previewer host...');
                    try {
                        await this.host.getClient();
                        await this.render(doc, panel);
                        await this.syncAccessors(doc);
                        void this.pushFonts(panel);
                        // First code-behind check of this form (read-only): shows the ⚠ badges and
                        // the status hint right away when the hand-edited code-behind drifted.
                        if (this.codeCheckMode() !== 'manual') void this.runSilentCheck(doc, panel);
                    } catch (e) {
                        await this.postStatus(panel, `Previewer host error: ${e instanceof Error ? e.message : String(e)}`);
                        // Missing .NET SDK is actionable and would otherwise only be a one-line
                        // status note the user can easily miss — offer the fix in a dialog too.
                        if (e instanceof Error && e.message === DOTNET_SDK_MISSING_MESSAGE) {
                            void vscode.window.showErrorMessage(e.message);
                        }
                    }
                    return;
                }
                case 'projectBackup': {
                    await this.projectBackup(doc, panel);
                    return;
                }
                case 'refresh': {
                    // The toolbar's ⟳ Refresh: re-read the .axaml (so edits made in a text editor tab
                    // or outside VS Code are picked up) and re-render. Re-rendering also re-queries
                    // the design-time SQLite preview (designGridData), so rows added by a RUNNING app
                    // appear without reopening the form. Unsaved designer edits are never clobbered —
                    // the file is only re-read while the designer is clean.
                    if (!doc.dirty) {
                        const text = await this.sourceTextOf(doc);
                        // Compare header-normalised: the file on disk carries the "do not edit" notice
                        // (the model drops comments on serialize), so a plain string compare would report
                        // a change on every refresh and needlessly rebuild the model.
                        if (text != null && withDesignerHeader(text) !== withDesignerHeader(doc.model.serialize(true))) {
                            try {
                                doc.model = new XamlModel(text);
                                doc.markSaved();
                            } catch {
                                /* keep the current model if the file is mid-edit / temporarily invalid */
                            }
                        }
                    }
                    await this.render(doc, panel);
                    await this.postStatus(panel, 'Refreshed');
                    return;
                }
                case 'codeCheck': {
                    await this.runCodeCheck(doc, panel);
                    return;
                }
                case 'openCodeSettings': {
                    // The toolbar's ⚙ Settings button: reply with the current code-check settings.
                    await panel.webview.postMessage({
                        type: 'codeSettings',
                        mode: this.codeCheckMode(),
                        badges: this.codeCheckBadges()
                    });
                    return;
                }
                case 'saveCodeSettings': {
                    const mode = msg.mode === 'onSave' || msg.mode === 'onType' || msg.mode === 'manual'
                        ? msg.mode : 'onReturn';
                    const cfg = vscode.workspace.getConfiguration('avaloniaDesigner');
                    try {
                        await cfg.update('codeCheck.mode', mode, vscode.ConfigurationTarget.Global);
                        await cfg.update('codeCheck.badges', msg.badges !== false, vscode.ConfigurationTarget.Global);
                    } catch { /* read-only in some hosts — the choice then lasts for this session only */ }
                    await panel.webview.postMessage({ type: 'codeSettings', mode: this.codeCheckMode(), badges: this.codeCheckBadges() });
                    // Apply the new behaviour immediately: re-check now (it also refreshes the badges).
                    await this.runSilentCheck(doc, panel);
                    await this.postStatus(panel, mode === 'manual'
                        ? 'Code check: manual — press 🩺 Code Fix… when you want it'
                        : `Code check: ${mode === 'onReturn' ? 'when returning to the designer' : mode === 'onSave' ? 'when the code-behind is saved' : 'while typing'}`);
                    return;
                }
                case 'codeFix': {
                    // Re-analyse so the fix works on the CURRENT file (the user may have edited it in
                    // between) and so its line/occurrence payload is accurate.
                    const projFix = findProject(doc.uri);
                    const run = analyzeCodeBehind(doc.uri, this.checkOptions(doc));
                    const issue = run.issues.find((i) => i.id === msg.id);
                    if (!issue) { await this.runCodeCheck(doc, panel); return; }
                    // `alt` picks an ALTERNATIVE fix of the same finding (e.g. "the delete was
                    // deliberate — unwire the form") instead of the primary repair.
                    const alt = typeof msg.alt === 'number' ? (issue.alternatives ?? [])[msg.alt] : undefined;
                    const action: CodeIssue = alt
                        ? {
                            ...issue,
                            kind: alt.kind,
                            // A dismissal must remember the ORIGINAL finding (kind/member/payload), not
                            // the "dismiss" action it arrives as.
                            data: {
                                ...(issue.data ?? {}),
                                ...(alt.data ?? {}),
                                ...(alt.kind === 'dismiss' ? { signature: issueSignature(issue) } : {})
                            }
                        }
                        : issue;
                    // Only a fix that touches the code-behind needs the safety copy.
                    if (action.kind !== 'unwrap-handler') this.backupCodeOnce(doc, run.codeFile);
                    let what: string;
                    try {
                        what = await this.applyCodeIssue(doc, projFix, panel, action);
                    } catch (e) {
                        what = `Fix failed: ${e instanceof Error ? e.message : String(e)}`;
                    }
                    await this.runCodeCheck(doc, panel, false);
                    await this.postStatus(panel, what);
                    return;
                }
                case 'codeFixAll': {
                    const projAll = findProject(doc.uri);
                    const done = new Set<string>();
                    let applied = 0;
                    // Re-analyse after every fix: one fix can expose/erase the next problem. The pass
                    // cap is a guard against a finding whose fix cannot change its own detection.
                    for (let pass = 0; pass < 25; pass++) {
                        const run = analyzeCodeBehind(doc.uri, this.checkOptions(doc));
                        // Dismissed findings are skipped here too — "leave my code alone" must not be
                        // undone by a later "Fix all".
                        const next = this.visibleIssues(doc, run.issues)
                            .find((i) => i.kind !== 'report-only' && !done.has(i.id));
                        if (!next) break;
                        done.add(next.id);
                        this.backupCodeOnce(doc, run.codeFile);
                        await this.applyCodeIssue(doc, projAll, panel, next);
                        applied++;
                    }
                    await this.runCodeCheck(doc, panel, false);
                    await this.postStatus(panel, applied === 0
                        ? 'Code Fix: nothing fixable'
                        : `Code Fix: applied ${applied} fix(es)`);
                    return;
                }
                case 'codeOpen': {
                    const run = analyzeCodeBehind(doc.uri, this.checkOptions(doc));
                    const file = msg.file === 'axaml' ? doc.uri.fsPath : run.codeFile;
                    if (!file || !fs.existsSync(file)) return;
                    const td = await vscode.window.showTextDocument(vscode.Uri.file(file), { preview: false });
                    const pos = new vscode.Position(Math.max(0, (Number(msg.line) || 1) - 1), 0);
                    td.selection = new vscode.Selection(pos, pos);
                    td.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
                    return;
                }
                case 'select': {
                    // Selecting a TabItem makes that tab the ACTIVE tab: re-render with it
                    // selected so its body Canvas is laid out (real bounds) and the user can
                    // click into it to place controls.
                    const sel = msg.name ? doc.model.findByName(msg.name) : undefined;
                    if (sel && localName(sel.tagName) === 'TabItem') {
                        this.setActiveTab(doc, sel);
                        await this.render(doc, panel);
                    }
                    // Multi-select (Ctrl+Click): show the properties common to every selected
                    // control; otherwise the single control's properties as before.
                    const multiSel: string[] = Array.isArray(msg.multi) ? msg.multi.map(String) : [];
                    if (multiSel.length >= 2) {
                        await this.sendMultiProperties(doc, panel, multiSel);
                    } else {
                        await this.sendProperties(doc, panel, msg.name);
                    }
                    return;
                }
                case 'requestFonts': {
                    // The webview asked for the system font list (its picker opened before the
                    // host was ready) — fetch (once) and push it.
                    await this.pushFonts(panel);
                    return;
                }
                case 'deselect': {
                    await panel.webview.postMessage({ type: 'properties', properties: null });
                    return;
                }
                case 'setProperty': {
                    // Bulk multi-select edit: the webview sends `names` (>= 2). Every change to the
                    // common properties applies to ALL selected controls as ONE undo step.
                    if (Array.isArray(msg.names) && msg.names.length >= 2) {
                        await this.multiSetProperty(doc, panel, msg.names.map(String), String(msg.key ?? ''), msg.value);
                        return;
                    }
                    const el = msg.name ? doc.model.findByName(msg.name) : doc.model.root;
                    if (!el || msg.key === '__type__') return;
                    // The structural Body canvas / root layout panel must keep its name (the lock
                    // and the layout logic both rely on it).
                    if (msg.key === '__name__' && isLockedStructure(doc.model, el.getAttribute('x:Name') || el.getAttribute('Name') || '')) {
                        void vscode.window.showInformationMessage(`The ${lockedLabel(doc.model, el.getAttribute('x:Name') || el.getAttribute('Name') || '')} is locked — it can\'t be renamed.`);
                        await this.sendProperties(doc, panel, msg.name ?? null);
                        return;
                    }
                    // A SplitPanel pane's Width/Height ARE its divider positions (the pane fills its
                    // grid cell, so it never carries its own size) — a number moves the divider to
                    // that many pixels (0 collapses/hides the pane); the neighbouring pane stretches.
                    const splitPaneName = el.getAttribute('x:Name') || el.getAttribute('Name') || '';
                    if (isSplitPaneName(splitPaneName) && (msg.key === 'Width' || msg.key === 'Height')) {
                        await this.setSplitPaneSize(doc, panel, el, msg.key === 'Width' ? 'cols' : 'rows', String(msg.value ?? ''));
                        return;
                    }
                    // ...and its Min/Max go on the Row/Column definition too (a MinHeight attribute on
                    // the pane body is ignored by the Grid's star sizing, so the pane would shrink
                    // below its minimum when the form is resized).
                    if (isSplitPaneName(splitPaneName)
                        && (msg.key === 'MinWidth' || msg.key === 'MinHeight' || msg.key === 'MaxWidth' || msg.key === 'MaxHeight')) {
                        await this.setSplitPaneMinMax(doc, panel, el, msg.key, String(msg.value ?? ''));
                        return;
                    }
                    const before = doc.model.serialize(true);
                    if (msg.key === '__name__') {
                        if (typeof msg.value === 'string' && msg.value) {
                            // A user-given name must be unique — if another control already uses
                            // it, warn and keep the previous name.
                            const newName = msg.value;
                            const collides = doc.model.controlElements().some(
                                (e) => e !== el && (e.getAttribute('x:Name') || e.getAttribute('Name')) === newName
                            );
                            if (collides) {
                                void vscode.window.showWarningMessage(`The name "${newName}" is already used by another control — the previous name was kept.`);
                                await this.sendProperties(doc, panel, el.getAttribute('x:Name') || el.getAttribute('Name') || null);
                                return;
                            }
                            const oldName = el.getAttribute('x:Name') || el.getAttribute('Name') || '';
                            // Code-behind is about to be refactored for the rename — snapshot the
                            // current (possibly hand-edited) code first so Undo restores it fully.
                            this.refreshHistoryCode(doc);
                            el.removeAttribute('Name');
                            el.setAttribute('x:Name', newName);
                            // Keep name-derived Content/Text in sync (e.g. Button1 -> Button2).
                            doc.model.syncContentToName(el, oldName, newName);
                            // Refactor any generated event handlers: rename the XAML event
                            // attributes AND the code-behind methods (Button1_Click ->
                            // SubmitButton_Click) so the code-behind matches the new name.
                            doc.model.renameEventHandlers(oldName, newName);
                            if (oldName) {
                                try { await renameControlInCodeBehind(doc.uri, oldName, newName); }
                                catch { /* code-behind refactor is best-effort */ }
                            }
                        }
                    } else if (msg.key === 'UndoRedoDepth') {
                        // 'Undo-Redo' isn't a XAML attribute — it lives on the bound table in the .adset.
                        const ctrl = el.getAttribute('x:Name') || el.getAttribute('Name') || '';
                        await this.setUndoRedoDepth(doc, ctrl, String(msg.value ?? ''));
                        await this.sendProperties(doc, panel, ctrl || null);
                        return;
                    } else if (msg.key === 'StatusDate.Date' || msg.key === 'StatusDate.Time') {
                        // The StatusDate clock's Date/Time formats aren't XAML attributes — they are
                        // written into its generated `_Loaded` handler (rewriting the tick line).
                        const clockName = el.getAttribute('x:Name') || el.getAttribute('Name') || '';
                        const cur = clockName ? await getStatusDateSettings(doc.uri, clockName) : { date: 'System date', time: 'System time' };
                        const next = { date: cur.date, time: cur.time };
                        if (msg.key === 'StatusDate.Date') next.date = String(msg.value ?? cur.date);
                        else next.time = String(msg.value ?? cur.time);
                        if (clockName) await setStatusDateSettings(doc.uri, clockName, next.date, next.time);
                        await this.render(doc, panel);
                        await this.sendProperties(doc, panel, clockName || null);
                        return;
                    } else if (msg.key === '__theme__') {
                        // 'System' backs up + clears every explicitly-set colour so the control
                        // follows the OS theme; 'Custom' restores the last backed-up colours.
                        const tName = el.getAttribute('x:Name') || el.getAttribute('Name') || '';
                        if (msg.value === 'System') {
                            const colors: Record<string, string> = {};
                            for (const k of THEME_COLOR_KEYS) {
                                const v = el.getAttribute(k);
                                if (v) colors[k] = v;
                            }
                            await this.saveThemeBackup(doc, tName, colors);
                            for (const k of THEME_COLOR_KEYS) el.removeAttribute(k);
                        } else if (msg.value === 'Custom') {
                            const hasAny = THEME_COLOR_KEYS.some((k) => el.getAttribute(k));
                            if (!hasAny) {
                                const colors = await this.restoreThemeBackup(doc, tName);
                                if (colors) {
                                    for (const k of Object.keys(colors)) el.setAttribute(k, colors[k]);
                                }
                            }
                        }
                    } else if (msg.key === 'AutoSizeToCell') {
                        // 'Auto-size to Cell' isn't a XAML attribute — it's the dynamic Grid-cell
                        // sizing opt-out, stored in the extension (not the file). False = the Image
                        // keeps the size the user set; the cell no longer resizes it.
                        const ctrl = el.getAttribute('x:Name') || el.getAttribute('Name') || '';
                        await this.setAutoSizeOff(doc, ctrl, String(msg.value ?? 'True') !== 'True');
                        await this.render(doc, panel);
                        await this.sendProperties(doc, panel, ctrl || null);
                        return;
                    } else if (msg.key === 'SplitPanelPaneBorder') {
                        // 'Pane Border' on a SplitPanel isn't an attribute on the grid itself — it
                        // is written onto every pane (Border child) so it shows at design/runtime.
                        this.setSplitPaneBorder(el, String(msg.value ?? '').trim());
                    } else {
                        // 'None' removes DockPanel.Dock (no docking); 'Fill' is the friendly
                        // "fill remaining space" state that also removes the attribute
                        // (Avalonia has no literal None/Fill Dock values).
                        // Note: 'Angle' (rotate) flows through the generic path below —
                        // XamlModel.setProperty routes it to setImageAngle, which writes
                        // <X.RenderTransform><RotateTransform Angle="…"/></X.RenderTransform>.
                        let value = String(msg.value ?? '');
                        if (msg.key === 'DockPanel.Dock') {
                            // A Grid already positions/sizes each child in its cell — DockPanel.Dock
                            // has no effect there, so any dock choice simply means "fill the cell":
                            // clear the explicit Width/Height so the Grid's default Stretch alignment
                            // fills the cell. The control STAYS in its cell (never moved out of the
                            // grid) and no DockPanel.Dock attribute is stored (no literal 'Fill' dock).
                            const dockParent = el.parentNode as Element | null;
                            const parentIsGrid = !!dockParent && dockParent.nodeType === 1
                                && localName(dockParent.tagName) === 'Grid';
                            if (parentIsGrid) {
                                if (value !== 'None') {
                                    el.removeAttribute('Width');
                                    el.removeAttribute('Height');
                                }
                                value = '';
                            } else if (value === 'None') {
                                // 'None' = no docking: remove DockPanel.Dock and leave the
                                // control drawn in its last placed position. If it is the
                                // DockPanel's last child, drop LastChildFill so it does not
                                // auto-fill the remaining space (that is what 'Fill' is for).
                                value = '';
                                const parent = el.parentNode as Element | null;
                                // Inside a GrumpyPanel-based bar: Dock=None means "back to the free
                                // body" — move the control out of the bar's dock band into its body.
                                const gpPart = parent && parent.nodeType === 1 ? grumpyPartOf(parent) : null;
                                if (gpPart && gpPart.part === 'dock') {
                                    const body = doc.model.findByName(elName(gpPart.root) + 'Body');
                                    if (body) doc.model.moveTo(el, body, { x: 8, y: 8 }); // strips DockPanel.* (Canvas target)
                                } else if (parent && localName(parent.tagName) === 'DockPanel') {
                                    let isLastChild = true;
                                    for (let sib = el.nextSibling; sib; sib = sib.nextSibling) {
                                        if (sib.nodeType === 1) { isLastChild = false; break; }
                                    }
                                    if (isLastChild) parent.setAttribute('LastChildFill', 'False');
                                }
                            } else {
                                // A real dock (Left/Top/Right/Bottom/Fill). Docking only has an
                                // effect inside a DockPanel — if the control isn't in one (e.g.
                                // it sits directly on a Canvas), wrap it in a DockPanel first so
                                // docking "just works" instead of silently doing nothing.
                                ensureDockPanelParent(doc.model, el);
                                const parent = el.parentNode as Element | null;
                                const inDockPanel = !!parent && localName(parent.tagName) === 'DockPanel';
                                if (inDockPanel) {
                                    // Make docking actually work: clear leftover free-positioning
                                    // (Margin, Canvas.*) and the explicit size on the FREE axis so
                                    // the control stretches to fill, per the spec:
                                    //   Left/Right -> fills the vertical space (keep Width = thickness)
                                    //   Top/Bottom  -> fills the horizontal space (keep Height = thickness)
                                    //   Fill        -> fills everything (clear both)
                                    el.removeAttribute('Margin');
                                    el.removeAttribute('Canvas.Left');
                                    el.removeAttribute('Canvas.Top');
                                    // Clear the FREE-axis size (the control stretches to fill it) but
                                    // keep/ensure the THICKNESS-axis size, so a docked strip stays
                                    // visible when switching docks (e.g. Left -> Bottom must not vanish).
                                    if (value === 'Left' || value === 'Right' || value === 'Fill') el.removeAttribute('Height');
                                    if (value === 'Top' || value === 'Bottom' || value === 'Fill') el.removeAttribute('Width');
                                    if (value === 'Left' || value === 'Right') {
                                        if (!el.getAttribute('Width')) el.setAttribute('Width', '200');
                                    } else if (value === 'Top' || value === 'Bottom') {
                                        if (!el.getAttribute('Height')) el.setAttribute('Height', '24');
                                    }
                                    // A DockPanel's LAST child always fills (LastChildFill=true) and its
                                    // Dock would be ignored — which is exactly why "nothing happens"
                                    // when docking the only control in a DockPanel. Toggle LastChildFill
                                    // so the user's choice actually applies:
                                    //   side dock on the last child -> LastChildFill=False (it docks)
                                    //   Fill                        -> move to last + LastChildFill=True
                                    let isLastChild = true;
                                    for (let sib = el.nextSibling; sib; sib = sib.nextSibling) {
                                        if (sib.nodeType === 1) { isLastChild = false; break; }
                                    }
                                    if (value === 'Fill') {
                                        value = '';
                                        parent.appendChild(el); // ensure it is the last child
                                        parent.setAttribute('LastChildFill', 'True');
                                    } else if (isLastChild) {
                                        parent.setAttribute('LastChildFill', 'False');
                                    }
                                }
                            }
                        }
                        // Opacity is edited as a percentage (0-100) -> store 0-1 in the XAML.
                        if (msg.key === 'Opacity') value = opacityToXaml(value);
                        // If the user sets a property back to its Avalonia default, strip the
                        // attribute (value → '') so the saved XAML stays clean — the previewer
                        // applies the same framework defaults. (Defaults are in XAML form here;
                        // Opacity default '1' matches the post-conversion value.)
                        const def = defaultFor(msg.key);
                        if (def !== undefined && value === def) value = '';
                        // The Anchor property lives on the bundled AnchorHelper (namespace
                        // AvaloniaChrome); make sure the root declares the `chrome` prefix so
                        // the saved XAML compiles. (Setting 'None' strips the attribute, so no
                        // namespace is needed then.)
                        if (msg.key === 'chrome:AnchorHelper.Anchor' && value) {
                            doc.model.ensureChromeNamespace();
                            // A Status Bar item (or any DockPanel child) has no Dock property of its
                            // own — an edge Anchor docks it to that edge; mirror it into the XAML so
                            // the design preview matches runtime.
                            mirrorAnchorDock(el, value);
                            // An older bundled AnchorHelper (Canvas-only) won't dock the strip item at
                            // runtime — refresh a stale copy so the Anchor actually works.
                            this.ensureBundledComponentsCurrent(doc);
                            // Older (pre-Anchor) projects don't have the helper yet — warn the
                            // user once per document so they know the XAML won't compile until
                            // AnchorHelper.cs/.vb is copied in.
                            const docKey = doc.uri.toString();
                            if (!anchorWarnedDocs.has(docKey)) {
                                const missing = anchorHelperMissing(doc.uri);
                                if (missing) {
                                    anchorWarnedDocs.add(docKey);
                                    void vscode.window.showWarningMessage(
                                        `This project doesn't include ${missing} yet, so the Anchor property won't compile. ` +
                                        `Copy ${missing} into the project folder (next to ChromeWindow.cs/.vb), or use ` +
                                        `"Avalonia: New Form" / New Project to get it automatically.`
                                    );
                                }
                            }
                        }
                        // The ChromeWindow title-bar properties (Title Bar Text/Icon/Height) live on
                        // the bundled ChromeWindow component. A project created before that component
                        // gained the settable Title Bar Height still carries the old copy — writing
                        // e.g. TitleBarHeight="…" into it would not compile ("Unable to resolve …"),
                        // so refresh the stale bundled copy before saving.
                        if (value && CHROME_ROOT_PROPS.has(msg.key) && localName(el.tagName) === 'ChromeWindow') {
                            this.ensureBundledComponentsCurrent(doc);
                        }
                        doc.model.setProperty(el, msg.key, value);
                    }
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    await this.sendProperties(doc, panel, el.getAttribute('x:Name') || el.getAttribute('Name') || null);
                    return;
                }
                case 'drop': {
                    // The DataSet 'tool' isn't a form control — ignore accidental drops onto a form.
                    if (msg.tag === 'DataSet') {
                        void vscode.window.showInformationMessage("DataSet isn't a form control — use the Toolbox's DataSet item to open the DataSet designer.");
                        return;
                    }
                    // 'Custom Title Bar' isn't a control — it converts the window's title bar.
                    if (msg.tag === 'CustomTitleBar') {
                        await this.applyCustomTitleBar(doc, panel);
                        return;
                    }
                    const before = doc.model.serialize(true);
                    const host = await this.host.getClient();
                    const snip = await host.snippet(msg.tag);
                    // The host generates names from its own per-process counter, which can
                    // collide with controls already in this document — pick a collision-free name.
                    let xaml = snip.xaml;
                    let name = snip.name;
                    const unique = doc.model.nextName(snip.name);
                    if (unique !== snip.name) {
                        // GrumpyPanel-based snippets ship a structural family — the root plus inner
                        // names that share its prefix ({n}Dock/{n}Body; GrumpyStatus also adds
                        // {n}Label/{n}Date). Rename the WHOLE family so the inner names stay unique
                        // too (and never leave stale `OldName…` parts behind).
                        xaml = (msg.tag === 'GrumpyPanel' || msg.tag === 'GrumpyStatus')
                            ? replaceFragmentFamilyName(xaml, snip.name, unique)
                            : replaceFragmentName(snip.xaml, snip.name, unique);
                        name = unique;
                    }
                    const parent = msg.parentName ? doc.model.findByName(msg.parentName) : doc.model.root;
                    const target = parent ? resolveDropTarget(doc.model, parent) : doc.model.root;
                    // Click coordinates are in design-surface space. When dropping into a
                    // Canvas (existing or about to be created as a wrapper by addControl),
                    // adjust coordinates relative to the container's own position so
                    // Canvas.Left/Canvas.Top are correct.
                    let pos = { x: msg.x ?? 0, y: msg.y ?? 0 };
                    const coordTarget = coordRefFor(parent, target);
                    if (coordTarget) {
                        const cn = coordTarget.getAttribute('x:Name') || coordTarget.getAttribute('Name') || null;
                        const cb = cn ? this.boundsOf(doc, cn) : undefined;
                        if (cb) { pos.x -= cb.x; pos.y -= cb.y; }
                    }
                    const placedEl = doc.model.addControl(target, xaml, pos);
                    doc.model.removeDropHint();
                    // Bar controls (Menu / Status Bar) carry DockPanel.Dock in their snippet and are
                    // meant to pin to a form edge — NOT to float on the free Body canvas. If one was
                    // dropped on free space (a Canvas or the window root), move it into the form's
                    // root DockPanel (before the fill child) so its Dock actually takes effect. A
                    // control dropped inside a Grid/StackPanel stays where its container put it.
                    if (placedEl && placedEl.hasAttribute('DockPanel.Dock')) {
                        try { ensureDockPanelParent(doc.model, placedEl); }
                        catch { /* leave it where it was dropped */ }
                    }
                    // A freshly placed control with NO explicit Dock must not silently become
                    // DockPanel 'Fill' just because it lands as the DockPanel's last child (a plain
                    // DockPanel defaults LastChildFill to True). Normalise it to 'None' the same way
                    // choosing Dock = None does — drop LastChildFill so the control keeps its placed
                    // size instead of auto-filling, and the Properties panel shows None, not Fill.
                    if (placedEl && !placedEl.hasAttribute('DockPanel.Dock')) {
                        const dockParent = placedEl.parentNode as Element | null;
                        if (dockParent && dockParent.nodeType === 1
                            && localName(dockParent.tagName) === 'DockPanel'
                            && dockParent.getAttribute('LastChildFill') !== 'False') {
                            let isLast = true;
                            for (let sib = placedEl.nextSibling; sib; sib = sib.nextSibling) {
                                if (sib.nodeType === 1) { isLast = false; break; }
                            }
                            if (isLast) dockParent.setAttribute('LastChildFill', 'False');
                        }
                    }
                    // Shapes render BEHIND other controls by default (Send to Back): a negative
                    // ZIndex puts them at the back of the paint order, in the preview and at
                    // runtime. The toolbox snippets already carry ZIndex="-1"; this guards any
                    // placement path that bypasses the snippet (the Z-Index property in the panel
                    // can still bring a shape forward by setting it to 0 or higher).
                    if (placedEl && SHAPE_TAGS.has(localName(placedEl.tagName)) && !placedEl.hasAttribute('ZIndex')) {
                        placedEl.setAttribute('ZIndex', '-1');
                    }
                    // An Image placed directly into a Grid cell is sized to that cell (matching
                    // the "move into container" behaviour instead of staying at its 100×100
                    // snippet default regardless of cell size). If the user opted this Image out
                    // of auto-sizing, keep the snippet size instead.
                    await this.ensureAutoSizeOff();
                    if (placedEl && !this.isAutoSizeOff(doc, name)) {
                        doc.model.sizeElementToGridCell(placedEl, this.gridCellsFor(doc, placedEl));
                    }
                    // DataGrid lives in its own package — warn once per document if the project
                    // doesn't reference it yet (new projects include it automatically).
                    if (msg.tag === 'DataGrid') {
                        const docKey = doc.uri.toString();
                        if (!dataGridWarnedDocs.has(docKey) && !projectHasDataGridPackage(doc.uri)) {
                            dataGridWarnedDocs.add(docKey);
                            void vscode.window.showWarningMessage(
                                "This project doesn't reference the Avalonia.Controls.DataGrid package yet, so the DataGrid won't compile. " +
                                'Add <PackageReference Include="Avalonia.Controls.DataGrid" Version="…" /> to its .csproj/.vbproj ' +
                                '(new projects include it automatically).'
                            );
                        }
                    }
                    // If the name had to be made unique, keep name-derived Content/Text in sync
                    // (e.g. a Button renamed Button1 -> Button2 should not still say "Button1").
                    if (name !== snip.name) {
                        const added = doc.model.findByName(name);
                        if (added) doc.model.syncContentToName(added, snip.name, name);
                    }
                    // StatusDate: the toolbox inserts a TextBlock that becomes a live date/time
                    // display. Wire its code-behind Loaded handler (starts a per-second timer).
                    if (msg.tag === 'StatusDate' && name) {
                        try { await insertStatusDateClock(doc.uri, name); }
                        catch { /* best-effort */ }
                    }
                    // XY-Tracker: a TextBlock that live-reports Width × Height. Inside a Status Bar
                    // (a DockPanel strip) it shows the FORM's size and hugs the right edge like the
                    // other bar items; anywhere else it tracks its immediate container. Wire the
                    // code-behind Loaded handler that keeps the text current.
                    if (msg.tag === 'XYTracker' && name && placedEl) {
                        const mode: XyTrackerMode = isWithinStatusBar(placedEl) ? 'form' : 'container';
                        if (mode === 'form') {
                            // A GrumpyStatus bar (a chrome:GrumpyPanel) is the new Status Bar: dropping
                            // the tracker onto its body — or straight onto a label/date — must end up
                            // as a real right-pinned band item, like the legacy StatusBar (whose items
                            // lived directly in its DockPanel). Whatever strip part the tracker landed
                            // on, relocate it into the strip's inner dock band, BEFORE the body (which
                            // stays the DockPanel's fill child) so Dock=Right can actually act.
                            const partParent = placedEl.parentNode as Element | null;
                            if (partParent && partParent.nodeType === 1) {
                                const gp = grumpyPartOf(partParent); // the strip's body canvas OR inner dock
                                if (gp) {
                                    const rootName = elName(gp.root);
                                    const dock = rootName ? doc.model.findByName(`${rootName}Dock`) : undefined;
                                    const body = rootName ? doc.model.findByName(`${rootName}Body`) : undefined;
                                    if (dock && body) {
                                        if (placedEl.parentNode !== dock) doc.model.moveTo(placedEl, dock);
                                        dock.insertBefore(placedEl, body);
                                        dock.setAttribute('LastChildFill', 'True');
                                    }
                                }
                            }
                            placedEl.setAttribute('DockPanel.Dock', 'Right');
                            placedEl.setAttribute('HorizontalAlignment', 'Right');
                        }
                        placedEl.setAttribute('VerticalAlignment', 'Center');
                        try { await insertXyTrackerClock(doc.uri, name, mode); }
                        catch { /* best-effort */ }
                    }
                    // GrumpyPanel / GrumpyStatus: an existing project may predate the bundled
                    // GrumpyPanel.cs/.vb helper — copy it in (next to ChromeWindow) so the saved
                    // <chrome:GrumpyPanel> actually compiles and renders. GrumpyStatus also embeds
                    // a live StatusDate ({name}Date) whose Loaded handler + per-second timer the
                    // designer wires for you, exactly like the StatusDate tool.
                    if (msg.tag === 'GrumpyPanel' || msg.tag === 'GrumpyStatus') {
                        this.ensureGrumpyPanelHelpers(doc);
                    }
                    // File / Folder Selector: same story — a project created before the PathPicker
                    // helper existed needs PathPicker.cs/.vb next to ChromeWindow, or the saved
                    // <chrome:PathPicker> will not compile.
                    if (msg.tag === 'PathPicker' || msg.tag === 'PathPickerFolder') {
                        this.ensurePathPickerHelper(doc);
                    }
                    if (msg.tag === 'GrumpyStatus' && name) {
                        try { await insertStatusDateClock(doc.uri, `${name}Date`); }
                        catch { /* best-effort — the status clock must not fail the placement */ }
                    }
                    // Generate the code-behind: wire an event handler right after placement (creating
                    // the code-behind file if needed) instead of waiting for a middle-click.
                    // With `askEventOnPlace` on, the control is placed first and the event PICKER opens
                    // so the user chooses which event(s) to wire (Skip places it with none); with it off,
                    // the default event is wired silently as before (`autoWireDefaultEvent`).
                    // Middle-click still just navigates to the handler.
                    const placedTag = placedEl ? localName(placedEl.tagName) : '';
                    const askEvents = !!placedEl && asksForEventOnPlace(placedTag) && this.askEventOnPlace();
                    if (placedEl && askEvents === false && hasDefaultEvent(placedTag) && this.autoWireDefaultEvent()) {
                        try { await this.wireDefaultHandler(doc, panel, placedEl, name, false); }
                        catch { /* best-effort — code-behind wiring must not fail the placement */ }
                    }
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    await panel.webview.postMessage({ type: 'selectControl', name });
                    if (placedEl && askEvents) {
                        await this.openEventPicker(doc, panel, name, placedTag, 'place');
                    }
                    return;
                }
                case 'addEvent': {
                    // Right-click a control -> "Add event...": offer the events of that control and
                    // wire the ones already attached are marked (never re-wired).
                    const el = msg.name ? doc.model.findByName(msg.name) : undefined;
                    if (!el || el === doc.model.root) return;
                    await this.openEventPicker(doc, panel, msg.name, localName(el.tagName), 'add');
                    return;
                }
                case 'wireEvents': {
                    await this.wireEventSelection(doc, panel, msg.name, msg.events ?? [], !!msg.remember);
                    return;
                }
                case 'skipEventPicker': {
                    if (msg.remember) await this.rememberEventChoice(false);
                    return;
                }
                case 'openHandler': {
                    // "Go to handler" — from the picker's ✓ wired rows and from the middle-click menu.
                    const el = msg.name ? doc.model.findByName(msg.name) : undefined;
                    if (el && msg.handler) {
                        await this.openOrCreateHandler(doc, panel, el, msg.event, msg.handler);
                    }
                    return;
                }
                case 'move': {
                    const el = doc.model.findByName(msg.name);
                    if (!el || isLockedStructure(doc.model, msg.name) || isSplitPaneName(msg.name)) return;
                    const before = doc.model.serialize(true);
                    const bounds = this.boundsOf(doc, msg.name) ?? { x: 0, y: 0, width: 0, height: 0 };
                    doc.model.move(el, msg.dx ?? 0, msg.dy ?? 0, bounds);
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    return;
                }
                case 'nudge': {
                    // Arrow-key move: shifts the WHOLE selection (anchor + every Ctrl+clicked
                    // control) by the same delta in ONE undo step + ONE render. Only free-placed
                    // controls (direct Canvas children) nudge — a Grid/DockPanel lays its children
                    // out, so arrow keys don't fight the layout.
                    const names = Array.isArray(msg.names) ? msg.names : (msg.name ? [msg.name] : []);
                    const dx = Math.round(Number(msg.dx) || 0);
                    const dy = Math.round(Number(msg.dy) || 0);
                    if (names.length === 0 || (dx === 0 && dy === 0)) return;
                    const before = doc.model.serialize(true);
                    let moved = false;
                    for (const nm of names) {
                        if (!nm) continue;
                        const el = doc.model.findByName(nm);
                        if (!el || el === doc.model.root || isLockedStructure(doc.model, nm) || isSplitPaneName(nm)) continue;
                        const parent = el.parentNode as Element | null;
                        if (!parent || parent.nodeType !== 1 || localName(parent.tagName) !== 'Canvas') continue;
                        const bounds = this.boundsOf(doc, nm) ?? { x: 0, y: 0, width: 0, height: 0 };
                        doc.model.move(el, dx, dy, bounds);
                        moved = true;
                    }
                    if (!moved) return;
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    return;
                }
                case 'resize': {
                    const el = doc.model.findByName(msg.name);
                    if (!el || isLockedStructure(doc.model, msg.name) || isSplitPaneName(msg.name)) return;
                    const before = doc.model.serialize(true);
                    const bounds = this.boundsOf(doc, msg.name) ?? { x: 0, y: 0, width: 0, height: 0 };
                    doc.model.resize(el, msg.dx ?? 0, msg.dy ?? 0, bounds, msg.corner ?? 'se');
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    return;
                }
                case 'setSplitter': {
                    // A design-time SplitPanel divider was dragged to `pos` (design coords along the
                    // bar's axis). Convert pos to a pixel size for the dragged pane and reuse
                    // setSplitDividerPixels: that keeps the whole axis ALL-STAR (Avalonia's model) so
                    // ONLY the dragged divider moves here AND at runtime, and the neighbour absorbs
                    // the difference (form minimum + one undo step + re-render all handled there).
                    const paneEl = msg.pane ? doc.model.findByName(msg.pane) : undefined;
                    const otherEl = msg.other ? doc.model.findByName(msg.other) : undefined;
                    if (!paneEl || !isSplitPaneName(msg.pane) || !otherEl || !isSplitPaneName(msg.other)) return;
                    const kind: 'cols' | 'rows' = msg.axis === 'h' ? 'rows' : 'cols';
                    const pos = Number(msg.pos);
                    const frame = this.frames.get(doc.uri.toString());
                    const c = frame?.controls ? frame.controls.find((x) => x.name === msg.pane) : undefined;
                    const oc = frame?.controls ? frame.controls.find((x) => x.name === msg.other) : undefined;
                    if (!frame || !c || !oc || !Number.isFinite(pos)) return;
                    // The pane BODY sits inside its pane Border, so its cell starts ~borderThickness
                    // px before the body's reported left/top (and its body width excludes the borders).
                    const borderEl = paneEl.parentNode as Element | null;
                    let bt = 1;
                    if (borderEl && borderEl.nodeType === 1) {
                        const f = parseFloat(String(borderEl.getAttribute('BorderThickness') || '').split(',')[0]);
                        if (Number.isFinite(f)) bt = Math.max(0, f);
                    }
                    const cellStart = kind === 'cols' ? c.x - bt : c.y - bt;
                    const root = splitRootOf(paneEl);
                    const grid = root ? splitGridOf(root) : null;
                    const defMinOf = (modelName: string): number => {
                        if (!grid || !modelName) return 1;
                        const me = doc.model.findByName(modelName);
                        if (!me) return 1;
                        const geo = paneGeometry(grid, me);
                        if (!geo) return 1;
                        const idx = kind === 'cols' ? geo.col : geo.row;
                        const d = splitDefAt(grid, kind, idx);
                        const mn = d ? (kind === 'cols' ? d.getAttribute('MinWidth') : d.getAttribute('MinHeight')) : null;
                        const n = mn ? pxOf(mn) : 0;
                        return n > 0 ? n : 1;
                    };
                    const minAllowed = Math.max(1, defMinOf(msg.pane));
                    const farEnd = kind === 'cols'
                        ? (oc.x - bt) + oc.width + 2 * bt
                        : (oc.y - bt) + oc.height + 2 * bt;
                    const maxAllowed = Math.max(minAllowed, farEnd - cellStart - Math.max(1, defMinOf(msg.other)));
                    const px = Math.round(Math.min(maxAllowed, Math.max(minAllowed, pos - cellStart)));
                    if (px <= 0) return;
                    await this.setSplitDividerPixels(doc, panel, paneEl, otherEl, kind, px);
                    return;
                }
                case 'delete': {
                    const el = msg.name ? doc.model.findByName(msg.name) : doc.model.root;
                    if (!el || el === doc.model.root) return;
                    if (isLockedStructure(doc.model, el.getAttribute('x:Name') || el.getAttribute('Name') || '')) {
                        void vscode.window.showInformationMessage(`The ${lockedLabel(doc.model, el.getAttribute('x:Name') || el.getAttribute('Name') || '')} is locked — it can\'t be deleted.`);
                        return;
                    }
                    const before = doc.model.serialize(true);
                    // Capture the code-behind AS IT IS NOW (incl. any manual edits) before the
                    // delete rewrites it, so Undo can restore the control AND its code.
                    this.refreshHistoryCode(doc);
                    // Collect event-handler attrs from the element AND all its descendants,
                    // so deleting a container also cleans up child controls' handlers.
                    const handlers = doc.model.eventHandlersOfSubtree(el);
                    // The names of the removed control + everything inside it — orphaned handler
                    // methods named after them are swept from code-behind too (their XAML attribute
                    // may have pointed at a different handler, e.g. a second StatusDate reusing the
                    // first clock's Loaded, so the normal stale check never collects them).
                    const removedNames = doc.model.namesInSubtree(el);
                    const ctrlName = el.getAttribute('x:Name') || el.getAttribute('Name') || '';
                    doc.model.remove(el);
                    // Drop the deleted control's colour backup too.
                    await this.deleteThemeBackup(doc, ctrlName);
                    // Remove any code-behind binding (DataSet table or asset) for the deleted control.
                    await this.cleanupControlBindings(doc, el, ctrlName);
                    // Remove code-behind stubs that no control references any more.
                    const stale = [...new Set(handlers.filter((h) => !doc.model.hasHandler(h)))];
                    if (stale.length > 0) await removeHandlersFromCodeBehind(doc.uri, stale);
                    // Sweep orphaned `<removedName>_<Event>` methods that no remaining event
                    // attribute references (e.g. StatusDate2_Loaded after StatusDate2 is deleted).
                    if (removedNames.length > 0) {
                        const referenced = new Set<string>();
                        for (const ce of doc.model.controlElements()) {
                            for (const h of doc.model.eventHandlersOf(ce)) referenced.add(h);
                        }
                        await removeOrphanedHandlersForControls(doc.uri, removedNames, referenced);
                    }
                    // A pane body that was auto-converted to a DockPanel to host a docked/filled
                    // control reverts to its Canvas base once deleting leaves it empty — so a pane
                    // doesn't stay a DockPanel after its control is removed (rides the same undo).
                    revertEmptyPaneBodies(doc.model);
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    await panel.webview.postMessage({ type: 'properties', properties: null });
                    return;
                }
                case 'cut': {
                    const el = msg.name ? doc.model.findByName(msg.name) : undefined;
                    if (!el || el === doc.model.root) return;
                    if (isLockedStructure(doc.model, el.getAttribute('x:Name') || el.getAttribute('Name') || '')) {
                        void vscode.window.showInformationMessage(`The ${lockedLabel(doc.model, el.getAttribute('x:Name') || el.getAttribute('Name') || '')} is locked — it can\'t be cut.`);
                        return;
                    }
                    const before = doc.model.serialize(true);
                    this.refreshHistoryCode(doc);
                    clipboard = {
                        name: el.getAttribute('x:Name') || el.getAttribute('Name') || '',
                        xaml: doc.model.elementXaml(el)
                    };
                    doc.model.remove(el);
                    // Same pane-body tidy-up as delete: an emptied (auto-converted) pane body goes
                    // back to its Canvas base instead of lingering as a DockPanel.
                    revertEmptyPaneBodies(doc.model);
                    await panel.webview.postMessage({ type: 'clipboard', has: true });
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    await panel.webview.postMessage({ type: 'properties', properties: null });
                    return;
                }
                case 'copy': {
                    const el = msg.name ? doc.model.findByName(msg.name) : undefined;
                    if (!el || el === doc.model.root) return;
                    clipboard = {
                        name: el.getAttribute('x:Name') || el.getAttribute('Name') || '',
                        xaml: doc.model.elementXaml(el)
                    };
                    await panel.webview.postMessage({ type: 'clipboard', has: true });
                    await this.postStatus(panel, `Copied "${clipboard.name}" — right-click to paste.`);
                    return;
                }
                case 'paste': {
                    if (!clipboard) {
                        await this.postStatus(panel, 'Nothing to paste — Cut or Copy a control first.');
                        return;
                    }
                    const parent = msg.parentName ? doc.model.findByName(msg.parentName) : doc.model.root;
                    const target = parent ? resolveDropTarget(doc.model, parent) : doc.model.root;
                    // Adjust coordinates relative to the container (see drop handler).
                    let pos = { x: msg.x ?? 0, y: msg.y ?? 0 };
                    const coordTarget = coordRefFor(parent, target);
                    if (coordTarget) {
                        const cn = coordTarget.getAttribute('x:Name') || coordTarget.getAttribute('Name') || null;
                        const cb = cn ? this.boundsOf(doc, cn) : undefined;
                        if (cb) { pos.x -= cb.x; pos.y -= cb.y; }
                    }
                    const before = doc.model.serialize(true);
                    this.refreshHistoryCode(doc);
                    // If the original control still exists (Copy, not Cut), the pasted
                    // copy needs a fresh unique name so findByName stays unambiguous.
                    let xaml = clipboard.xaml;
                    if (clipboard.name) {
                        const unique = doc.model.uniqueName(clipboard.name);
                        if (unique !== clipboard.name) xaml = replaceFragmentName(xaml, clipboard.name, unique);
                    }
                    const added = doc.model.addControl(target, xaml, pos);
                    doc.model.removeDropHint();
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    const pastedName = added.getAttribute('x:Name') || added.getAttribute('Name') || null;
                    await panel.webview.postMessage({ type: 'selectControl', name: pastedName });
                    await this.sendProperties(doc, panel, pastedName);
                    await this.postStatus(panel, `Pasted into the ${localName(target.tagName)}.`);
                    return;
                }
                case 'moveToContainer': {
                    const el = msg.name ? doc.model.findByName(msg.name) : undefined;
                    if (!el || el === doc.model.root) return;
                    if (isLockedStructure(doc.model, msg.name)) {
                        void vscode.window.showInformationMessage(`The ${lockedLabel(doc.model, msg.name)} is locked — it can\'t be moved into a container.`);
                        return;
                    }
                    // Offer multi-child containers, excluding the control itself and any
                    // container that lives inside it (moving into your own child is a cycle).
                    const containers = doc.model.controlElements().filter((c) => {
                        if (c === el || isInside(el, c)) return false;
                        return MOVE_TARGETS.has(localName(c.tagName));
                    });
                    // "New Canvas…" is always offered so a control can be moved to a fresh
                    // Canvas for free (X/Y) placement — many generator forms (e.g.
                    // ChromeWindow > StackPanel) contain no Canvas at all.
                    const options: Array<{ label: string; description: string; target: Element | null }> = [
                        { label: '➕ New Canvas…', description: 'Create a new Canvas and move the control into it', target: null }
                    ];
                    for (const c of containers) {
                        options.push({
                            label: c.getAttribute('x:Name') || c.getAttribute('Name') || localName(c.tagName),
                            description: localName(c.tagName),
                            target: c
                        });
                    }
                    const picked = await vscode.window.showQuickPick(options, {
                        placeHolder: `Move "${msg.name}" into which container?`
                    });
                    if (!picked) return;
                    const before = doc.model.serialize(true);
                    if (picked.target === null) {
                        // Create a Canvas next to the control and move the control into it
                        // (moveTo gives it Canvas.Left/Top so it stays visible). A default size
                        // makes the new free-placement area visible instead of an empty strip.
                        const parent = el.parentNode as Element | null;
                        if (!parent) return;
                        const name = doc.model.uniqueName('Canvas');
                        const canvas = doc.model.createElement(`<Canvas x:Name="${name}" Width="240" Height="140"/>`);
                        parent.insertBefore(canvas, el.nextSibling);
                        doc.model.moveTo(el, canvas);
                    } else {
                        // Item containers (TabControl etc.) get their real content target: for a
                        // TabControl this descends into the VISIBLE tab's body so the moved
                        // control lands inside the tab content instead of as a raw tab item.
                        const target = this.moveTargetFor(doc, picked.target);
                        // In a free-positioning Canvas, place the moved control so it does NOT
                        // render over controls already in the container (find a free spot).
                        if (localName(target.tagName) === 'Canvas') {
                            doc.model.moveTo(el, target, this.freePositionIn(doc, target, el));
                        } else {
                            doc.model.moveTo(el, target);
                        }
                    }
                    // An Image moved into a Grid cell is sized to that cell (same as a direct
                    // drop — it shouldn't keep its old Width/Height after moving containers),
                    // unless the user opted it out of auto-sizing.
                    await this.ensureAutoSizeOff();
                    if (!this.isAutoSizeOff(doc, msg.name)) {
                        doc.model.sizeElementToGridCell(el, this.gridCellsFor(doc, el));
                    }
                    // Moving the last control out of a pane also restores an emptied pane body.
                    revertEmptyPaneBodies(doc.model);
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    await this.sendProperties(doc, panel, msg.name);
                    return;
                }
                case 'openEvent': {
                    const el = msg.name ? doc.model.findByName(msg.name) : undefined;
                    if (el) await this.openEventHandler(doc, panel, msg.name);
                    return;
                }
                case 'openNewForm': {
                    await createNewForm(this.context);
                    return;
                }
                case 'toggleDotGrid': {
                    // The designer toolbar toggles the (global) dot-grid visibility.
                    const cfg = vscode.workspace.getConfiguration('avaloniaDesigner.dotGrid');
                    const next = !cfg.get<boolean>('enabled', true);
                    await this.updateDotGridSetting('enabled', next);
                    await panel.webview.postMessage({ type: 'dotGrid', dotGrid: this.dotGridConfig() });
                    return;
                }
                case 'toggleSnapToGrid': {
                    // The designer toolbar toggles (global) snap-to-grid.
                    const cfg = vscode.workspace.getConfiguration('avaloniaDesigner.dotGrid');
                    const next = !cfg.get<boolean>('snapToGrid', false);
                    await this.updateDotGridSetting('snapToGrid', next);
                    await panel.webview.postMessage({ type: 'dotGrid', dotGrid: this.dotGridConfig() });
                    return;
                }
                case 'setDotGrid': {
                    // The in-designer settings popup writes spacing/color/dot-size to the global config.
                    const s = (msg.settings ?? {}) as Record<string, unknown>;
                    if (typeof s.spacingX === 'number') await this.updateDotGridSetting('spacingX', s.spacingX);
                    if (typeof s.spacingY === 'number') await this.updateDotGridSetting('spacingY', s.spacingY);
                    if (typeof s.color === 'string') await this.updateDotGridSetting('color', s.color);
                    if (typeof s.dotSize === 'number') await this.updateDotGridSetting('dotSize', s.dotSize);
                    await panel.webview.postMessage({ type: 'dotGrid', dotGrid: this.dotGridConfig() });
                    return;
                }
                case 'setCrosshair': {
                    // The Crosshair settings popup writes thickness/colour/opacity/length/mode to the
                    // global config (all settings apply to every form).
                    const s = (msg.settings ?? {}) as Record<string, unknown>;
                    const ccfg = vscode.workspace.getConfiguration('avaloniaDesigner.crosshair');
                    const write = async (key: string, value: unknown) => { await ccfg.update(key, value, vscode.ConfigurationTarget.Global); };
                    if (s.mode === 'short' || s.mode === 'long') await write('mode', s.mode);
                    if (typeof s.shortLength === 'number') await write('shortLength', Math.max(6, Math.round(s.shortLength)));
                    if (typeof s.thickness === 'number') await write('thickness', Math.min(12, Math.max(1, Math.round(s.thickness))));
                    if (typeof s.opacity === 'number') await write('opacity', Math.min(100, Math.max(0, Math.round(s.opacity))));
                    if (typeof s.color === 'string' && /^#[0-9a-f]{6}$/i.test(s.color)) await write('color', s.color);
                    await panel.webview.postMessage({ type: 'crosshair', crosshair: this.crosshairConfig() });
                    return;
                }
                case 'addTabItem': {
                    const el = msg.name ? doc.model.findByName(msg.name) : undefined;
                    if (!el || localName(el.tagName) !== 'TabControl') return;
                    const before = doc.model.serialize(true);
                    const count = doc.model.tabItemsOf(el).length;
                    const base = el.getAttribute('x:Name') || el.getAttribute('Name') || localName(el.tagName);
                    const ti = doc.model.createElement(tabItemXaml(base, count + 1));
                    el.appendChild(ti);
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    await this.sendProperties(doc, panel, msg.name);
                    return;
                }
                case 'removeTabItem': {
                    const tc = msg.name ? doc.model.findByName(msg.name) : undefined;
                    const ti = msg.itemName ? doc.model.findByName(msg.itemName) : undefined;
                    if (!tc || !ti || localName(tc.tagName) !== 'TabControl' || localName(ti.tagName) !== 'TabItem') return;
                    const before = doc.model.serialize(true);
                    this.refreshHistoryCode(doc);
                    // Collect this TabItem's handlers and clean up the code-behind if orphaned.
                    const handlers = doc.model.eventHandlersOfSubtree(ti);
                    ti.parentNode?.removeChild(ti);
                    const stale = [...new Set(handlers.filter((h) => !doc.model.hasHandler(h)))];
                    if (stale.length > 0) await removeHandlersFromCodeBehind(doc.uri, stale);
                    // Enforce a minimum of one TabItem (matching the snippet default) — with
                    // a visible body so the tab stays clickable.
                    if (doc.model.tabItemsOf(tc).length === 0) {
                        const base = tc.getAttribute('x:Name') || tc.getAttribute('Name') || localName(tc.tagName);
                        const first = doc.model.createElement(tabItemXaml(base, 1));
                        tc.appendChild(first);
                    }
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    await this.sendProperties(doc, panel, msg.name);
                    return;
                }
                case 'setTabItemProperty': {
                    const ti = msg.itemName ? doc.model.findByName(msg.itemName) : undefined;
                    if (!ti || localName(ti.tagName) !== 'TabItem') return;
                    const before = doc.model.serialize(true);
                    doc.model.setProperty(ti, msg.key, msg.value);
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    await this.sendProperties(doc, panel, msg.name);
                    return;
                }
                case 'addListItem': {
                    const el = msg.name ? doc.model.findByName(msg.name) : undefined;
                    if (!el || localName(el.tagName) !== 'ListBox') return;
                    // Ask which kind of item to add (toolbox controls eligible as list items).
                    const picks = LIST_ITEM_TYPES.map((t) => ({ label: t.label, description: t.detail, tag: t.tag }));
                    const pick = await vscode.window.showQuickPick(picks, {
                        placeHolder: 'Choose what to add to the ListBox'
                    });
                    if (!pick) return;
                    const before = doc.model.serialize(true);
                    const count = doc.model.listItemsOf(el).length;
                    const opt = LIST_ITEM_TYPES.find((t) => t.tag === pick.tag) ?? LIST_ITEM_TYPES[0];
                    const li = doc.model.createElement(opt.xaml(count + 1));
                    el.appendChild(li);
                    // Auto-grow the ListBox so the new item stays visible.
                    const h = parseFloat(el.getAttribute('Height') || '');
                    if (Number.isFinite(h) && h > 0) {
                        el.setAttribute('Height', String(Math.round(h + this.itemHeightFor(doc, el))));
                    }
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    await this.sendProperties(doc, panel, msg.name);
                    return;
                }
                case 'removeListItem': {
                    const lb = msg.name ? doc.model.findByName(msg.name) : undefined;
                    const li = msg.itemName ? doc.model.findByName(msg.itemName) : undefined;
                    if (!lb || !li || localName(lb.tagName) !== 'ListBox' || localName(li.tagName) !== 'ListBoxItem') return;
                    const before = doc.model.serialize(true);
                    this.refreshHistoryCode(doc);
                    // Collect this item's handlers and clean up the code-behind if orphaned.
                    const handlers = doc.model.eventHandlersOfSubtree(li);
                    li.parentNode?.removeChild(li);
                    // Auto-shrink the ListBox back to fit the remaining items.
                    const h = parseFloat(lb.getAttribute('Height') || '');
                    if (Number.isFinite(h) && h > 0) {
                        lb.setAttribute('Height', String(Math.max(24, Math.round(h - this.itemHeightFor(doc, lb)))));
                    }
                    const stale = [...new Set(handlers.filter((h2) => !doc.model.hasHandler(h2)))];
                    if (stale.length > 0) await removeHandlersFromCodeBehind(doc.uri, stale);
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    await this.sendProperties(doc, panel, msg.name);
                    return;
                }
                case 'setListItemProperty': {
                    const li = msg.itemName ? doc.model.findByName(msg.itemName) : undefined;
                    if (!li || localName(li.tagName) !== 'ListBoxItem') return;
                    const before = doc.model.serialize(true);
                    if (msg.key === 'Content') doc.model.setListItemContent(li, String(msg.value ?? ''));
                    else doc.model.setProperty(li, msg.key, msg.value);
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    await this.sendProperties(doc, panel, msg.name);
                    return;
                }
                case 'saveItems': {
                    // Batch 'Items' editor (ComboBox / ListBox / ItemsControl): replace the item
                    // children with one plain text item per line typed in the popup.
                    const el = msg.name ? doc.model.findByName(msg.name) : undefined;
                    if (!el || !['ComboBox', 'ListBox', 'ItemsControl'].includes(localName(el.tagName))) return;
                    const lines = (Array.isArray(msg.items) ? msg.items : [])
                        .map((s: unknown) => String(s ?? '').trim()).filter((s: string) => s.length > 0);
                    const existing = doc.model.itemsOf(el);
                    if (existing.some((i) => !doc.model.isPlainTextItem(i))) {
                        const ok = await vscode.window.showWarningMessage(
                            'This control already has items with names, events or custom content. ' +
                            'Saving the Items editor replaces them all with plain text items. Continue?',
                            { modal: true }, 'Replace', 'Cancel');
                        if (ok !== 'Replace') return;
                    }
                    const before = doc.model.serialize(true);
                    for (const i of existing) i.parentNode?.removeChild(i);
                    for (const line of lines) el.appendChild(doc.model.newItemFor(el, line));
                    // Auto-grow/shrink stacking controls (ListBox / ItemsControl) so items stay visible.
                    if (localName(el.tagName) === 'ListBox' || localName(el.tagName) === 'ItemsControl') {
                        const h = parseFloat(el.getAttribute('Height') || '');
                        if (Number.isFinite(h) && h > 0) {
                            const delta = lines.length - existing.length;
                            el.setAttribute('Height', String(Math.max(24, Math.round(h + delta * this.itemHeightFor(doc, el)))));
                        }
                    }
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    await this.sendProperties(doc, panel, msg.name);
                    return;
                }
                case 'saveMenuItems': {
                    // 'Menu Items' tree editor on a <Menu>: replace its whole item tree with the
                    // structure the user built (kinds map onto MenuItem/ToggleType/Separator and an
                    // inert fixed-width MenuItem for a top-level Space gap).
                    const el = msg.name ? doc.model.findByName(msg.name) : undefined;
                    if (!el || localName(el.tagName) !== 'Menu') return;
                    const nodes = sanitizeMenuNodes(msg.items);
                    const before = doc.model.serialize(true);
                    for (const kid of menuItemEls(el)) el.removeChild(kid);
                    for (const n of nodes) el.appendChild(menuElementFor(doc.model, n, 1));
                    // A top-level Separator must read as a vertical divider on the bar, not the
                    // horizontal flyout line Avalonia's Separator draws by default.
                    syncMenuSeparatorStyle(doc.model, el, nodes.some((n) => n.kind === 'Separator'));
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    await this.sendProperties(doc, panel, msg.name);
                    return;
                }
                case 'saveStatusItems': {
                    // 'Status Items' editor on a Status Bar (a DockPanel strip named StatusBarN).
                    const el = msg.name ? doc.model.findByName(msg.name) : undefined;
                    if (!el || localName(el.tagName) !== 'DockPanel') return;
                    if (!/^StatusBar\d*$/.test(el.getAttribute('x:Name') || el.getAttribute('Name') || '')) return;
                    await this.applyStatusItems(doc, panel, el, msg.items);
                    return;
                }
                case 'saveSplitLayout': {
                    // 'Split Layout' editor on a SplitPanel (a Border frame or, for older docs, the
                    // Grid itself): apply a new shape (Zones default T / Columns / Rows) and pane
                    // count, keeping each pane's contents.
                    const el = msg.name ? doc.model.findByName(msg.name) : undefined;
                    if (!el) return;
                    if (!isSplitName(el.getAttribute('x:Name') || el.getAttribute('Name') || '')) return;
                    const grid = splitGridOf(el);
                    if (!grid) return;
                    await this.applySplitShape(doc, panel, el, grid, {
                        shape: msg.shape === 'zones' ? 'zones' : (msg.shape === 'rows' || msg.columns === false ? 'rows' : 'columns'),
                        count: Number(msg.count),
                        top: Number(msg.top)
                    });
                    return;
                }
                case 'saveSplitters': {
                    // 'Splitters' editor on a SplitPanel: restyle each runtime divider bar (its
                    // thickness, colour and visibility), matched to the grid's GridSplitters in order.
                    const el = msg.name ? doc.model.findByName(msg.name) : undefined;
                    if (!el) return;
                    if (!isSplitName(el.getAttribute('x:Name') || el.getAttribute('Name') || '')) return;
                    const grid = splitGridOf(el);
                    if (!grid) return;
                    await this.applySplitterSettings(doc, panel, grid, el.getAttribute('x:Name') || el.getAttribute('Name') || '', msg.items);
                    return;
                }
                case 'saveDataGridRows': {
                    // 'Rows' editor on a DataGrid: write its row-decoration attributes (row
                    // background, text colour, row height, row-header width, grid lines, headers).
                    const el = msg.name ? doc.model.findByName(msg.name) : undefined;
                    if (!el || localName(el.tagName) !== 'DataGrid') return;
                    await this.applyDataGridDecorations(doc, panel, el, DG_ROW_FIELDS, msg.values);
                    return;
                }
                case 'saveDataGridCols': {
                    // 'Columns' editor on a DataGrid: write its column/header-decoration attributes
                    // (default/min/max column width, frozen columns, header height) plus the column
                    // header text style (alignment, colour, font, background) as a header Style.
                    const el = msg.name ? doc.model.findByName(msg.name) : undefined;
                    if (!el || localName(el.tagName) !== 'DataGrid') return;
                    await this.applyDataGridCols(doc, panel, el, msg.values);
                    return;
                }
                case 'saveGridDefs': {
                    // 'Rows & Columns' editor for a Grid: replace the RowDefinitions /
                    // ColumnDefinitions with the sizes typed in the popup.
                    const el = msg.name ? doc.model.findByName(msg.name) : undefined;
                    if (!el || localName(el.tagName) !== 'Grid') return;
                    const clean = (s: unknown) => {
                        const v = String(s ?? '').trim();
                        return /^(Auto|\d+(\.\d+)?\*?|\*)$/i.test(v) ? v : '*';
                    };
                    const rows = (Array.isArray(msg.rows) ? msg.rows : []).map(clean).filter(Boolean);
                    const cols = (Array.isArray(msg.cols) ? msg.cols : []).map(clean).filter(Boolean);
                    const before = doc.model.serialize(true);
                    doc.model.setGridDefinitions(el, 'rows', rows);
                    doc.model.setGridDefinitions(el, 'cols', cols);
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    await this.sendProperties(doc, panel, msg.name);
                    return;
                }
                case 'moveToCell': {
                    // Drag-to-re-cell: the webview computed a target Grid.Row/Grid.Column for a
                    // control that is a direct child of a Grid.
                    const el = msg.name ? doc.model.findByName(msg.name) : undefined;
                    const parent = el ? (el.parentNode as Element | null) : null;
                    if (!el || !parent || parent.nodeType !== 1 || localName(parent.tagName) !== 'Grid') return;
                    const rows = doc.model.gridSizes(parent, 'rows').length || 1;
                    const cols = doc.model.gridSizes(parent, 'cols').length || 1;
                    const row = Math.max(0, Math.min(rows - 1, parseInt(String(msg.row ?? '0'), 10) || 0));
                    const col = Math.max(0, Math.min(cols - 1, parseInt(String(msg.col ?? '0'), 10) || 0));
                    const before = doc.model.serialize(true);
                    doc.model.setProperty(el, 'Grid.Row', String(row));
                    doc.model.setProperty(el, 'Grid.Column', String(col));
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    await this.sendProperties(doc, panel, msg.name);
                    return;
                }
                case 'align': {
                    // Edge/centre alignment: move every selected control (except the anchor, the
                    // "first selected") so its edge/centre lines up with the anchor's. 'sameWidth' /
                    // 'sameHeight' instead RESIZE each selected control to the anchor's size. Only
                    // free-positioned controls are affected — controls that are DIRECT children of
                    // a Grid are excluded (they're placed by Grid.Row/Grid.Column, not coordinates)
                    // and a Line is excluded from SIZING (its size is its Start/End geometry, so it
                    // has no Width/Height — the user chose to skip Lines rather than scale them).
                    const anchor = String(msg.anchor ?? '');
                    const names: string[] = Array.isArray(msg.names) ? msg.names.map(String) : [];
                    if (!anchor || names.length < 2) return;
                    const ab = this.boundsOf(doc, anchor);
                    if (!ab) return;
                    const align = String(msg.align ?? '');
                    const isSizeAlign = align === 'sameWidth' || align === 'sameHeight';
                    const before = doc.model.serialize(true);
                    let changed = false;
                    if (align === 'equalV' || align === 'equalH') {
                        // Equal spacing: spread the selected controls with EQUAL edge-to-edge gaps
                        // along the tool's axis, keeping the two OUTERMOST controls fixed. Sort by
                        // position (vertical = top Y, horizontal = left X); every control keeps its
                        // other-axis position and its size. Grid children + locked controls can't be
                        // freely moved, so they're skipped — needs >= 3 movable controls.
                        const vert = align === 'equalV';
                        const items = names.map((n) => ({
                            n, el: doc.model.findByName(n), b: this.boundsOf(doc, n)
                        })).filter((x) => {
                            const el = x.el!;
                            const par = el && el.parentNode && el.parentNode.nodeType === 1 ? (el.parentNode as Element) : null;
                            return !!el && !!x.b && !isLockedStructure(doc.model, x.n) && !isSplitPaneName(x.n) && !(par && localName(par.tagName) === 'Grid');
                        });
                        if (items.length < 3) return;
                        items.sort((a, c) => vert ? a.b!.y - c.b!.y : a.b!.x - c.b!.x);
                        const start = vert ? items[0].b!.y : items[0].b!.x;
                        const end = vert
                            ? items[items.length - 1].b!.y + items[items.length - 1].b!.height
                            : items[items.length - 1].b!.x + items[items.length - 1].b!.width;
                        const sumLen = items.reduce((s, x) => s + (vert ? x.b!.height : x.b!.width), 0);
                        const gap = (end - start - sumLen) / (items.length - 1);
                        let cursor = start;
                        for (const it of items) {
                            const cur = vert ? it.b!.y : it.b!.x;
                            if (Math.abs(cur - cursor) > 0.01) {
                                const dx = vert ? 0 : Math.round(cursor - cur);
                                const dy = vert ? Math.round(cursor - cur) : 0;
                                doc.model.move(it.el!, dx, dy, it.b!);
                                changed = true;
                            }
                            cursor += (vert ? it.b!.height : it.b!.width) + gap;
                        }
                        if (changed) { this.notifyEdit(doc, panel, before); await this.render(doc, panel); }
                        return;
                    }
                    for (const n of names) {
                        if (n === anchor) continue;
                        const el = doc.model.findByName(n);
                        if (!el) continue;
                        if (isLockedStructure(doc.model, n) || isSplitPaneName(n)) continue;
                        const parent = el.parentNode as Element | null;
                        if (parent && parent.nodeType === 1 && localName(parent.tagName) === 'Grid') continue;
                        const b = this.boundsOf(doc, n);
                        if (!b) continue;
                        if (isSizeAlign) {
                            // A Line's size is its Start/End points (no Width/Height attribute).
                            if (localName(el.tagName) === 'Line') continue;
                            const w = Math.max(5, Math.round(ab.width));
                            const h = Math.max(5, Math.round(ab.height));
                            if (align === 'sameWidth') {
                                if (el.getAttribute('Width') !== String(w)) {
                                    doc.model.setProperty(el, 'Width', String(w));
                                    changed = true;
                                }
                            } else {
                                if (el.getAttribute('Height') !== String(h)) {
                                    doc.model.setProperty(el, 'Height', String(h));
                                    changed = true;
                                }
                            }
                            continue;
                        }
                        let dx = 0, dy = 0;
                        switch (align) {
                            case 'left': dx = ab.x - b.x; break;
                            case 'right': dx = (ab.x + ab.width) - (b.x + b.width); break;
                            case 'top': dy = ab.y - b.y; break;
                            case 'bottom': dy = (ab.y + ab.height) - (b.y + b.height); break;
                            case 'centre': dx = (ab.x + ab.width / 2) - (b.x + b.width / 2); break;
                            case 'middle': dy = (ab.y + ab.height / 2) - (b.y + b.height / 2); break;
                            default: continue;
                        }
                        if (!dx && !dy) continue;
                        doc.model.move(el, dx, dy, b);
                        changed = true;
                    }
                    if (!changed) return;
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    return;
                }
                case 'alignText': {
                    // Centre the text/content horizontally inside each selected single-line text
                    // control: TextAlignment on TextBlock/TextBox, HorizontalContentAlignment on
                    // Button/CheckBox/RadioButton/ComboBox.
                    const names: string[] = Array.isArray(msg.names) ? msg.names.map(String) : [];
                    if (!names.length) return;
                    const before = doc.model.serialize(true);
                    let changed = false;
                    for (const n of names) {
                        const el = doc.model.findByName(n);
                        if (!el) continue;
                        if (isLockedStructure(doc.model, n)) continue;
                        const tag = localName(el.tagName);
                        if (tag === 'TextBlock' || tag === 'TextBox') {
                            if (el.getAttribute('TextAlignment') !== 'Center') {
                                doc.model.setProperty(el, 'TextAlignment', 'Center');
                                changed = true;
                            }
                        } else if (tag === 'Button' || tag === 'CheckBox' || tag === 'RadioButton' || tag === 'ComboBox') {
                            if (el.getAttribute('HorizontalContentAlignment') !== 'Center') {
                                doc.model.setProperty(el, 'HorizontalContentAlignment', 'Center');
                                changed = true;
                            }
                        }
                    }
                    if (!changed) return;
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    await this.sendProperties(doc, panel, String(msg.anchor ?? null));
                    return;
                }
                case 'setLineEnd': {
                    // Drag-point editing: one end of a Line moved by a delta — the OTHER end stays
                    // anchored. The model re-normalises the box (see XamlModel.setLineEnd).
                    const el = msg.name ? doc.model.findByName(msg.name) : undefined;
                    if (!el || localName(el.tagName) !== 'Line') return;
                    if (isLockedStructure(doc.model, msg.name)) return;
                    const before = doc.model.serialize(true);
                    doc.model.setLineEnd(el, msg.end === 'start' ? 'start' : 'end', Number(msg.dx) || 0, Number(msg.dy) || 0);
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    return;
                }
                case 'setArcEnd': {
                    // Drag-point editing: one end of an Arc moved to a design point — its angle
                    // around the centre changes, the OTHER end stays anchored (see setArcEnd).
                    const el = msg.name ? doc.model.findByName(msg.name) : undefined;
                    if (!el || localName(el.tagName) !== 'Arc') return;
                    if (isLockedStructure(doc.model, msg.name)) return;
                    const b = this.boundsOf(doc, msg.name);
                    if (!b) return;
                    const before = doc.model.serialize(true);
                    doc.model.setArcEnd(el, msg.end === 'start' ? 'start' : 'end', Number(msg.x) || 0, Number(msg.y) || 0, b);
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    return;
                }
                case 'setArcRadius': {
                    // Drag-point editing: the Arc's CENTRE point sets the radius (distance from the
                    // centre to the pointer); the box scales around the fixed centre (see setArcRadius).
                    const el = msg.name ? doc.model.findByName(msg.name) : undefined;
                    if (!el || localName(el.tagName) !== 'Arc') return;
                    if (isLockedStructure(doc.model, msg.name)) return;
                    const b = this.boundsOf(doc, msg.name);
                    if (!b) return;
                    const before = doc.model.serialize(true);
                    doc.model.setArcRadius(el, Number(msg.x) || 0, Number(msg.y) || 0, b);
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    return;
                }
                case 'browseFile': {
                    // File-path property (Image Source, Window Icon, Title Bar Icon): open the
                    // system file picker, bundle the file into the project's Assets\ folder and
                    // set the property to its avares:// URI (portable at runtime).
                    const el = msg.name ? doc.model.findByName(msg.name) : doc.model.root;
                    if (!el) return;
                    const key = String(msg.key ?? '');
                    if (key !== 'Source' && key !== 'Icon' && key !== 'TitleBarIcon') return;
                    const filters: { [name: string]: string[] } = key === 'Source'
                        ? { Images: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }
                        : { Icons: ['ico', 'png'] };
                    const picked = await vscode.window.showOpenDialog({ canSelectMany: false, filters, title: 'Select a file' });
                    if (!picked || picked.length === 0) return;
                    const proj = findProject(doc.uri);
                    if (!proj) {
                        void vscode.window.showWarningMessage('No .csproj/.vbproj found near this form, so the file can\'t be bundled. Type a path or avares:// URI manually instead.');
                        return;
                    }
                    const before = doc.model.serialize(true);
                    const avares = this.bundleProjectFile(proj, picked[0].fsPath);
                    if (!avares) {
                        void vscode.window.showErrorMessage('Could not copy the file into the project\'s Assets folder.');
                        return;
                    }
                    doc.model.setProperty(el, key, avares);
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    await this.sendProperties(doc, panel, msg.name ?? null);
                    void vscode.window.showInformationMessage(`Bundled "${path.basename(picked[0].fsPath)}" into Assets and set ${key} to ${avares}.`);
                    return;
                }
                case 'pickItemsSource': {
                    // Items Source asset picker: manages EVERY way a control's items can be bound —
                    // a DataSet table (the same binding the DataSet designer's "Bind to control"
                    // dropdown creates) or a code collection. From here you can bind, switch, or
                    // clear, and each action stays in sync with the owning .adset (and repaints any
                    // DataSet designer panel that has that file open), so the two entry points to
                    // the feature can't drift apart.
                    const el = msg.name ? doc.model.findByName(msg.name) : doc.model.root;
                    if (!el) return;
                    const proj = findProject(doc.uri);
                    if (!proj) {
                        void vscode.window.showWarningMessage('No .csproj/.vbproj found near this form — cannot scan for bindable assets.');
                        return;
                    }
                    const projectFolder = path.dirname(proj.projectUri.fsPath);
                    const ctrlName = el.getAttribute('x:Name') || el.getAttribute('Name') || '';
                    if (!ctrlName) {
                        void vscode.window.showWarningMessage('Give the control a name first (Properties → Name) so it can be bound.');
                        return;
                    }
                    const controlType = localName(el.tagName);
                    const formClass = (doc.model.root.getAttribute('x:Class') || '').split('.').pop() || '';
                    // The control's CURRENT binding, whichever side created it (DataSet table or code asset).
                    const dsBinding = dataSetBindingFor(projectFolder, ctrlName);
                    const codeBinding = dsBinding ? undefined : findItemsSourceBinding(doc.uri, ctrlName);
                    // "Follower": a control that only DISPLAYS data (ComboBox / ListBox / ItemsControl)
                    // can list one TEXT column of a table a DataGrid owns — live, without owning the
                    // table itself (which is what the "bound to another control" rule refuses).
                    const followRecord = findFollowerRecord(projectFolder, ctrlName);
                    const canFollow = controlType === 'ComboBox' || controlType === 'ListBox' || controlType === 'ItemsControl';
                    const assets = listAssets(projectFolder, formClass);
                    type PickEntry = vscode.QuickPickItem & { clear?: 'dataset' | 'code' | 'follower'; asset?: number };
                    const items: PickEntry[] = [];
                    if (dsBinding) {
                        items.push({
                            label: '$(close) Un-bind DataSet table', alwaysShow: true, clear: 'dataset',
                            description: `stop showing ${dsBinding.value} on ${ctrlName} — the table keeps its schema/data`
                        });
                    } else if (followRecord) {
                        items.push({
                            label: '$(close) Un-bind follower', alwaysShow: true, clear: 'follower',
                            description: `stop listing ${followRecord.info.tableName}.${followRecord.info.column} (${followRecord.info.owner}) on ${ctrlName}`
                        });
                    } else if (codeBinding) {
                        items.push({
                            label: '$(close) Clear Items Source binding', alwaysShow: true, clear: 'code',
                            description: `currently ${ctrlName}.ItemsSource = ${codeBinding}`
                        });
                    }
                    if (followRecord) {
                        items.push({
                            label: `$(link) follows ${followRecord.info.owner} → ${followRecord.info.tableName}.${followRecord.info.column}`,
                            description: 'current binding (unchanged)', alwaysShow: true, picked: true
                        });
                    } else if (dsBinding) {
                        items.push({ label: dsBinding.value, description: 'current binding (unchanged)', alwaysShow: true, picked: true });
                    }
                    assets.forEach((a, i) => {
                        // Followers only make sense for a control that merely displays data — never for
                        // the DataGrid that OWNS the table.
                        if (a.kind === 'follower' && !canFollow) return;
                        // The table already bound to this control is shown above as the current entry.
                        if (dsBinding && a.kind === 'dataset' && a.datasetName === dsBinding.datasetName && a.tableName === dsBinding.tableName) return;
                        // The column it already follows is shown above too.
                        if (a.kind === 'follower' && followRecord
                            && followRecord.info.tableName === a.tableName && followRecord.info.column === a.column) return;
                        items.push({
                            label: a.label,
                            description: a.detail,
                            detail: a.kind === 'code'
                                ? `writes ${ctrlName}.ItemsSource = ${a.value}`
                                : a.kind === 'follower'
                                    ? `writes ${ctrlName}.ItemsSource = a live ColumnFollower of ${a.tableName}.${a.column} (read-only)`
                                    : (this.isDatasetTableClaimed(a, ctrlName)
                                        ? 'bound to another control — un-bind it there first (or follow it from its column entries instead)'
                                        : `binds ${ctrlName}.ItemsSource to this table (SQLite)`),
                            asset: i
                        });
                    });
                    const picked = await vscode.window.showQuickPick(items, {
                        title: `Items Source for ${ctrlName}`,
                        placeHolder: 'Pick a collection or DataSet table to bind (escape to cancel)'
                    });
                    if (!picked) return;
                    if (picked.clear === 'dataset' && dsBinding) {
                        const label = await this.unbindCurrentDataSetBinding(doc, proj, ctrlName, controlType);
                        void vscode.window.showInformationMessage(`Un-bound ${ctrlName} from ${label ?? dsBinding.value}.`);
                        await this.sendProperties(doc, panel, msg.name ?? null);
                        return;
                    }
                    if (picked.clear === 'code') {
                        await removeItemsSourceBinding(doc.uri, ctrlName);
                        void vscode.window.showInformationMessage(`Cleared the Items Source binding on ${ctrlName}.`);
                        await this.sendProperties(doc, panel, msg.name ?? null);
                        return;
                    }
                    if (picked.clear === 'follower' && followRecord) {
                        await removeItemsSourceBinding(doc.uri, ctrlName);
                        this.dropFollowerRecord(followRecord.info.adsetPath, followRecord.info.tableName, ctrlName);
                        void vscode.window.showInformationMessage(
                            `Cleared the follower binding on ${ctrlName} (${followRecord.info.tableName}.${followRecord.info.column}).`);
                        await this.render(doc, panel);
                        await this.sendProperties(doc, panel, msg.name ?? null);
                        return;
                    }
                    const asset = (typeof picked.asset === 'number') ? assets[picked.asset] : undefined;
                    if (!asset) {
                        // Selected the "current binding" entry — nothing to do.
                        await this.sendProperties(doc, panel, msg.name ?? null);
                        return;
                    }
                    if (asset.kind === 'follower') {
                        await this.bindFollowerColumn(doc, proj, panel, el, ctrlName, asset);
                        await this.sendProperties(doc, panel, msg.name ?? null);
                        return;
                    }
                    if (asset.kind === 'dataset') {
                        // Never steal a table another control owns — check BEFORE dropping the current binding.
                        if (this.isDatasetTableClaimed(asset, ctrlName)) {
                            void vscode.window.showWarningMessage(`"${asset.tableName}" is already bound to another control — un-bind it there first.`);
                            return;
                        }
                        // Switching away from a current DataSet binding (to a different table) or a leftover
                        // code binding: drop it first so only ONE ItemsSource binding survives.
                        if (dsBinding && !(dsBinding.datasetName === asset.datasetName && dsBinding.tableName === asset.tableName)) {
                            await this.unbindCurrentDataSetBinding(doc, proj, ctrlName, controlType);
                        } else if (!dsBinding && codeBinding) {
                            await removeItemsSourceBinding(doc.uri, ctrlName);
                        }
                        await this.bindDataSetAsset(doc, proj, ctrlName, controlType, asset);
                    } else {
                        if (dsBinding) {
                            await this.unbindCurrentDataSetBinding(doc, proj, ctrlName, controlType);
                        } else if (codeBinding && codeBinding !== asset.value) {
                            await removeItemsSourceBinding(doc.uri, ctrlName);
                        }
                        const filePath = await bindControlToAsset(doc.uri, ctrlName, asset.value);
                        if (filePath) {
                            void vscode.window.showInformationMessage(`Bound ${ctrlName}.ItemsSource = ${asset.value} (${path.basename(filePath)}).`);
                        } else {
                            void vscode.window.showErrorMessage(`Could not write the code-behind for ${ctrlName}.`);
                        }
                    }
                    await this.sendProperties(doc, panel, msg.name ?? null);
                    return;
                }
                case 'pickImageData': {
                    // Image.Source can also show the image file (absolute path) stored in a DataGrid's
                    // selected row (a String column of the grid's bound DataSet table) instead of a
                    // fixed bundled file. Bind/clear here; the runtime selection handler lives in the
                    // form's code-behind, the metadata on the owning table's .adset (boundImages).
                    const el = msg.name ? doc.model.findByName(msg.name) : doc.model.root;
                    if (!el || localName(el.tagName) !== 'Image') return;
                    const projImg = findProject(doc.uri);
                    if (!projImg) {
                        void vscode.window.showWarningMessage('No .csproj/.vbproj found near this form — cannot scan DataSet grids.');
                        return;
                    }
                    const imgFolder = path.dirname(projImg.projectUri.fsPath);
                    const ctrlName = el.getAttribute('x:Name') || el.getAttribute('Name') || '';
                    if (!ctrlName) {
                        void vscode.window.showWarningMessage('Give the Image a name first (Properties → Name) so it can be bound.');
                        return;
                    }
                    const currentImg = findImageBinding(imgFolder, ctrlName);
                    type ImgPick = vscode.QuickPickItem & { clear?: boolean; target?: { datasetName: string; tableName: string; gridName: string; column: string } };
                    const items: ImgPick[] = [];
                    if (currentImg) {
                        items.push({
                            label: '$(close) Clear Data Image binding', alwaysShow: true, clear: true,
                            description: `Image shows the ${currentImg.info.gridName}.${currentImg.info.column} file of the selected row`
                        });
                        items.push({ label: `${currentImg.info.gridName}.${currentImg.info.column}`, description: 'current binding (unchanged)', alwaysShow: true });
                    }
                    for (const tgt of dataImageTargets(imgFolder)) {
                        items.push({ label: tgt.label, description: tgt.detail, target: tgt });
                    }
                    const picked = await vscode.window.showQuickPick(items, {
                        title: `Data image for ${ctrlName}`,
                        placeHolder: 'Pick a grid column whose image file this Image shows (escape to cancel)'
                    });
                    if (!picked) return;
                    if (currentImg && picked.clear) {
                        await this.unbindDataImage(doc, projImg, panel, ctrlName, currentImg.info.adsetPath, currentImg.info.tableName);
                        await this.sendProperties(doc, panel, msg.name ?? null);
                        return;
                    }
                    const tgt = picked.target;
                    if (!tgt) { await this.sendProperties(doc, panel, msg.name ?? null); return; }
                    // Switching: drop the current binding first (only one image binding per Image).
                    if (currentImg && !(currentImg.info.gridName === tgt.gridName && currentImg.info.column === tgt.column)) {
                        await this.unbindDataImage(doc, projImg, panel, ctrlName, currentImg.info.adsetPath, currentImg.info.tableName);
                    }
                    await this.bindDataImage(doc, projImg, panel, ctrlName, tgt);
                    await this.sendProperties(doc, panel, msg.name ?? null);
                    return;
                }
                case 'undo':
                case 'redo': {
                    await this.undoRedo(doc, panel, msg.type === 'redo', msg.name);
                    this.sendHistoryState(doc, panel);
                    return;
                }
                default:
                    return;
            }
        } catch (e) {
            await this.postStatus(panel, `Error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** Records which tab is active so the preview renders it (its body becomes editable). */
    private setActiveTab(doc: DesignerDocument, tabItem: Element): void {
        const parent = tabItem.parentNode as Element | null;
        if (!parent || localName(parent.tagName) !== 'TabControl') return;
        const tabs = doc.model.tabItemsOf(parent);
        const idx = tabs.indexOf(tabItem);
        if (idx < 0) return;
        this.activeTabs.set(doc.uri.toString(), {
            control: parent.getAttribute('x:Name') || parent.getAttribute('Name') || '',
            index: idx
        });
    }

    // ---------------- theme (System/Custom) colour backups ----------------

    /** Loads the persisted colour backups from globalState (once). */
    private async ensureThemeBackups(): Promise<void> {
        if (this.themeBackupsLoaded) return;
        this.themeBackups = this.context.globalState.get<Record<string, Record<string, Record<string, string>>>>('themeBackups') ?? {};
        this.themeBackupsLoaded = true;
    }

    /** Loads the persisted dynamic-auto-size opt-outs from globalState (once). */
    private async ensureAutoSizeOff(): Promise<void> {
        if (this.autoSizeOffLoaded) return;
        this.autoSizeOff = new Set(this.context.globalState.get<string[]>('autoSizeOff') ?? []);
        this.autoSizeOffLoaded = true;
    }

    private async persistAutoSizeOff(): Promise<void> {
        await this.context.globalState.update('autoSizeOff', [...this.autoSizeOff]);
    }

    /** Opts an Image in/out of dynamic Grid-cell auto-sizing (persisted, not XAML). */
    private async setAutoSizeOff(doc: DesignerDocument, name: string, off: boolean): Promise<void> {
        if (!name) return;
        await this.ensureAutoSizeOff();
        const key = `${doc.uri.toString()}::${name}`;
        if (off) this.autoSizeOff.add(key);
        else this.autoSizeOff.delete(key);
        await this.persistAutoSizeOff();
    }

    /** True when this Image opted out of dynamic Grid-cell auto-sizing. */
    private isAutoSizeOff(doc: DesignerDocument, name: string | null): boolean {
        if (!name) return false;
        return this.autoSizeOff.has(`${doc.uri.toString()}::${name}`);
    }

    /** Saves a control's custom colours so Theme=Custom can restore them later. */
    private async saveThemeBackup(doc: DesignerDocument, name: string, colors: Record<string, string>): Promise<void> {
        if (!name) return;
        await this.ensureThemeBackups();
        const uri = doc.uri.toString();
        const entry = this.themeBackups[uri] ?? {};
        if (Object.keys(colors).length > 0) entry[name] = colors;
        else delete entry[name];
        if (Object.keys(entry).length === 0) delete this.themeBackups[uri];
        else this.themeBackups[uri] = entry;
        await this.context.globalState.update('themeBackups', this.themeBackups);
    }

    /** Returns a control's last backed-up custom colours, or undefined. */
    private async restoreThemeBackup(doc: DesignerDocument, name: string): Promise<Record<string, string> | undefined> {
        if (!name) return undefined;
        await this.ensureThemeBackups();
        return this.themeBackups[doc.uri.toString()]?.[name];
    }

    /** Removes a single control's colour backup (used when the control is deleted). */
    private async deleteThemeBackup(doc: DesignerDocument, name: string): Promise<void> {
        if (!name) return;
        await this.ensureThemeBackups();
        const uri = doc.uri.toString();
        const entry = this.themeBackups[uri];
        if (entry && entry[name]) {
            delete entry[name];
            if (Object.keys(entry).length === 0) delete this.themeBackups[uri];
            else this.themeBackups[uri] = entry;
            await this.context.globalState.update('themeBackups', this.themeBackups);
        }
    }

    /** Removes every colour backup for a document (used when the canvas is cleared). */
    private async clearDocThemeBackups(doc: DesignerDocument): Promise<void> {
        await this.ensureThemeBackups();
        if (this.themeBackups[doc.uri.toString()]) {
            delete this.themeBackups[doc.uri.toString()];
            await this.context.globalState.update('themeBackups', this.themeBackups);
        }
    }

    /**
     * Design-time preview for Data-Image bound Images: a Data-Image Image has no XAML Source (the
     * runtime shows the selected row's file), so the designer would render it blank. This resolves
     * the FIRST row's image file from the owning table's .db and injects it as a render-only Source
     * (never saved) so the designer shows roughly what the Image will display.
     */
    private async applyDataImagePreview(xaml: string, projectFolder: string | undefined): Promise<string> {
        if (!projectFolder || !xaml.includes('<Image')) return xaml;
        try {
            for (const f of readDataSetFiles(projectFolder)) {
                for (const t of f.spec.tables) {
                    if (!t.boundTo || t.boundToType !== 'DataGrid' || !t.sqlite || !t.sqlite.file) continue;
                    const imgs = t.boundImages || [];
                    if (!imgs.length) continue;
                    // Resolve the table's .db like the DataSet designer's preview does.
                    const file = t.sqlite.file;
                    const candidates = [file];
                    if (!path.isAbsolute(file)) {
                        candidates.unshift(path.join(projectFolder, file));
                        for (const cfg of ['Debug', 'Release']) {
                            for (const tfm of ['net8.0', 'net9.0', 'net10.0']) candidates.push(path.join(projectFolder, 'bin', cfg, tfm, file));
                        }
                    }
                    const dbPath = candidates.find((p) => fs.existsSync(p));
                    if (!dbPath) continue;
                    let firstPath: string | null = null;
                    try {
                        const client = await this.host.getClient();
                        const res = await client.sqliteQuery(dbPath, `SELECT "${imgs[0].column}" FROM "${sqliteTableName(t)}" ORDER BY rowid LIMIT 1`, 1);
                        const v = res.rows && res.rows[0] && res.rows[0][0];
                        if (typeof v === 'string' && v && fs.existsSync(v)) firstPath = v;
                    } catch { /* no preview — keep blank */ }
                    if (!firstPath) continue;
                    const escPath = firstPath.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
                    for (const bi of imgs) {
                        const tagRe = new RegExp(`(<Image\\b[^>]*?x:Name="${bi.control}"[^>]*?)(/?)>`, 'i');
                        const m = tagRe.exec(xaml);
                        if (m) {
                            const clean = m[1].replace(/\s+Source="[^"]*"/gi, '');
                            const replacement = clean + ` Source="${escPath}"` + (m[2] ? '/>' : '>');
                            xaml = xaml.slice(0, m.index) + replacement + xaml.slice(m.index + m[0].length);
                        }
                    }
                }
            }
        } catch { /* preview is best-effort */ }
        return xaml;
    }

    /** Absolute path to a table's .db if it exists (design-time resolution, mirrors the runtime
     *  "next to the app" rule by also probing bin/...). */
    private resolvePreviewDb(projectFolder: string, file: string): string | undefined {
        const candidates = [file];
        if (!path.isAbsolute(file)) {
            candidates.unshift(path.join(projectFolder, file));
            for (const cfg of ['Debug', 'Release']) {
                for (const tfm of ['net8.0', 'net9.0', 'net10.0']) candidates.push(path.join(projectFolder, 'bin', cfg, tfm, file));
            }
        }
        return candidates.find((p) => fs.existsSync(p));
    }

    /** Rows for every DataGrid-bound DataSet table in the project, for the design-time canvas preview. */
    private async designGridData(
        projectFolder: string,
        client: { sqliteQuery(file: string, sql: string, limit?: number): Promise<{ columns: string[]; rows: unknown[][] }> }
    ): Promise<{ control: string; columns: string[]; rows: (string | number | boolean | null)[][] }[]> {
        const out: { control: string; columns: string[]; rows: (string | number | boolean | null)[][] }[] = [];
        try {
            for (const f of readDataSetFiles(projectFolder)) {
                for (const t of f.spec.tables) {
                    if (!t.boundTo || t.boundToType !== 'DataGrid' || !t.sqlite || !t.sqlite.file) continue;
                    const dbPath = this.resolvePreviewDb(projectFolder, t.sqlite.file);
                    if (!dbPath) continue;
                    const res = await client.sqliteQuery(dbPath, `SELECT * FROM "${sqliteTableName(t)}" ORDER BY rowid LIMIT 8`, 8);
                    if (res && res.columns && res.columns.length) {
                        out.push({ control: t.boundTo, columns: res.columns, rows: res.rows as (string | number | boolean | null)[][] });
                    }
                }
            }
        } catch { /* design-time data is best-effort */ }
        return out;
    }

    /** The .axaml's current text: the open editor buffer (unsaved text edits included) when the file
     *  is open as text, else the file on disk. undefined when neither can be read. */
    private async sourceTextOf(doc: DesignerDocument): Promise<string | undefined> {
        const key = doc.uri.toString();
        const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === key);
        if (open) return open.getText();
        try {
            const data = await vscode.workspace.fs.readFile(doc.uri);
            return Buffer.from(data).toString('utf8');
        } catch {
            return undefined;
        }
    }

    private async render(doc: DesignerDocument, panel: vscode.WebviewPanel, followUp = false): Promise<void> {
        const host = await this.host.getClient();
        // Render the tab the user last selected as the ACTIVE tab (so its body Canvas is laid
        // out and clickable). SelectedIndex is injected ONLY into the render copy — it is never
        // saved to the file.
        let tabControl: Element | null = null;
        const tab = this.activeTabs.get(doc.uri.toString());
        if (tab && tab.control) {
            const tc = doc.model.findByName(tab.control);
            if (tc && localName(tc.tagName) === 'TabControl') {
                const tabs = doc.model.tabItemsOf(tc);
                if (tab.index >= 0 && tab.index < tabs.length) {
                    tabControl = tc;
                    tabControl.setAttribute('SelectedIndex', String(tab.index));
                }
            }
        }
        let xaml: string;
        try {
            xaml = doc.model.serialize(false);
        } finally {
            if (tabControl) tabControl.removeAttribute('SelectedIndex');
        }
        // Design-time preview of Data-Image bound Images: inject the first row's image file into the
        // render-only XAML (never saved) so the Image isn't blank in the designer.
        const previewProj = findProject(doc.uri);
        let grids: { control: string; columns: string[]; rows: (string | number | boolean | null)[][] }[] = [];
        if (previewProj) {
            const folder = path.dirname(previewProj.projectUri.fsPath);
            xaml = await this.applyDataImagePreview(xaml, folder);
            // Design-time data: feed each DataGrid-bound DataSet table's rows to the host so the grid
            // shows its data on the canvas (read-only) even though code-behind never runs.
            grids = await this.designGridData(folder, host);
        }
        const size = this.designSize(doc.model.root);
        const proj = findProject(doc.uri);
        const previewTheme = this.previewTheme(doc.model.root);
        const frame = await host.render(
            xaml, size.width, size.height,
            proj ? path.dirname(proj.projectUri.fsPath) : undefined,
            previewTheme,
            grids
        );
        this.frames.set(doc.uri.toString(), frame);
        // Dynamic Image-in-Grid tracking: an Image placed in a Grid cell follows its cell's CURRENT
        // size — whenever the cell resizes (grid resized, rows/columns edited, form resized), its
        // Width/Height are updated to keep filling the cell. The frame's gridCells hold the new cell
        // sizes; if any image changed, one follow-up render shows it at the new size (converges —
        // the next pass finds the sizes already correct and stops). Images opted out ('Auto-size to
        // Cell' = False) keep their manual size and are skipped.
        await this.ensureAutoSizeOff();
        const autoSizeSkip = new Set<string>();
        const docKey = doc.uri.toString();
        for (const key of this.autoSizeOff) {
            if (key.startsWith(`${docKey}::`)) autoSizeSkip.add(key.slice(docKey.length + 2));
        }
        const imageSyncChanged = doc.model.syncImagesToGridCells(frame.gridCells || {}, autoSizeSkip);
        // Flag the locked structural controls (the Body design surface + the root layout panel)
        // so the webview can hide their resize handles, block dragging, and mark them in the
        // control list. Line/Arc controls additionally get their drag-point handles (ends / centre)
        // in design coords for the webview. Every control carries its paint-order ZIndex so the
        // webview's hit-testing picks the TOPMOST control at a point (a shape with ZIndex="-1" must
        // not steal a click from a control over it).
        const controls = (frame.controls || []).map((c) => {
            const el = c.name ? doc.model.findByName(c.name) : undefined;
            return {
                ...c,
                // The host (Avalonia 11) renders Avalonia-12-only controls through stand-in types
                // (GroupBox→Border, CommandBar→Border, HyperlinkButton→Button, …). Report the REAL
                // design tag from the model so the control list / type reads e.g. "GroupBox", not
                // the stand-in type. For everything else the model tag equals the host type.
                type: el ? localName(el.tagName) : c.type,
                locked: isLockedStructure(doc.model, c.name),
                // A SplitPanel pane body must always FILL its pane — it can be selected (to edit
                // its properties) but never resized/moved with the mouse (the webview shows no
                // resize handles and blocks dragging it). A GrumpyPanel-based bar's structural
                // inner parts ({name}Dock + {name}Body) are treated the same way.
                paneBody: isSplitPaneName(c.name) || (el ? !!grumpyPartOf(el) : false),
                handles: this.shapeHandlesFor(doc, c),
                zIndex: el ? (parseInt(el.getAttribute('ZIndex') || '0', 10) || 0) : 0
            };
        });
        // The form's own title (Window Title / ChromeWindow TitleBarTitle) — the webview labels
        // the form entry in its control drop-down "Form - <Title>" so the user can select the
        // form itself and edit its size/title in the Properties panel.
        const rootEl = doc.model.root;
        const formTitle = (rootEl.getAttribute('Title') || rootEl.getAttribute('TitleBarTitle') || '').trim();
        // The design-time item tree of every named <Menu> (top-level items + nested submenus).
        // Avalonia only realizes MenuItem containers when a menu is opened, so the preview can't
        // draw them — the webview lays out placeholder labels on the (empty) menu bar from this.
        const menus: Record<string, MenuTreeNode[]> = {};
        for (const el of doc.model.controlElements()) {
            if (localName(el.tagName) !== 'Menu') continue;
            const nm = el.getAttribute('x:Name') || el.getAttribute('Name');
            if (nm) menus[nm] = menuTreeOf(el);
        }
        await panel.webview.postMessage({
            type: 'frame', ...frame, controls, menus, previewTheme, formTitle,
            // Every SplitPanel divider (as a draggable bar in design coords) so the webview can hit
            // it and drag it to resize the panes at design time.
            splitBars: splitBarsOf(controls),
            dotGrid: this.dotGridConfig(), crosshair: this.crosshairConfig()
        });
        await panel.webview.postMessage({ type: 'clipboard', has: !!clipboard });
        if (imageSyncChanged && !followUp) {
            await this.render(doc, panel, true);
        }
    }

    /** The dot-grid settings (enabled, snap, spacing, color, dot size) from the global VS Code config. */
    private dotGridConfig(): Record<string, unknown> {
        const cfg = vscode.workspace.getConfiguration('avaloniaDesigner.dotGrid');
        return {
            enabled: cfg.get<boolean>('enabled', true),
            snap: cfg.get<boolean>('snapToGrid', false),
            spacingX: cfg.get<number>('spacingX', 16),
            spacingY: cfg.get<number>('spacingY', 16),
            color: cfg.get<string>('color', '#9db4d0'),
            dotSize: cfg.get<number>('dotSize', 1.5)
        };
    }

    /** The full crosshair settings (mode, length, thickness, opacity, colour) from the global
     *  VS Code config — sent to the webview on every frame so the saved style is applied. */
    private crosshairConfig(): Record<string, unknown> {
        const cfg = vscode.workspace.getConfiguration('avaloniaDesigner.crosshair');
        return {
            mode: cfg.get<string>('mode', 'short'),
            shortLength: cfg.get<number>('shortLength', 50),
            thickness: cfg.get<number>('thickness', 1),
            opacity: cfg.get<number>('opacity', 100),
            color: cfg.get<string>('color', '#ff4d4d')
        };
    }

    /** Updates one dot-grid setting in the global config (the grid is a global, cross-form feature). */
    private async updateDotGridSetting(key: string, value: unknown): Promise<void> {
        const cfg = vscode.workspace.getConfiguration('avaloniaDesigner.dotGrid');
        await cfg.update(key, value, vscode.ConfigurationTarget.Global);
    }

    /** Plain-language info tag for the selected element. The Status Bar tool inserts a
     *  Border, so match its generated name (StatusBar1, ...) to show the Status Bar
     *  explanation instead of the generic Border one. */
    private infoTagFor(el: Element): string {
        const name = el.getAttribute('x:Name') || el.getAttribute('Name') || '';
        if (/^StatusBar\d*$/.test(name)) return 'StatusBar';
        // Split Panels are a Border (new 3-zone frame) or a Grid (older docs) named SplitPanelN.
        if (/^SplitPanel\d*$/.test(name)) return 'SplitPanel';
        // GrumpyStatus is a GrumpyPanel (chrome:GrumpyPanel tag) — show its own help, not the
        // generic GrumpyPanel one.
        if (/^GrumpyStatus\d*$/.test(name)) return 'GrumpyStatus';
        return localName(el.tagName);
    }

    /** Copies a picked file into the project's Assets\ folder (unique name), registers
     *  `Assets\**` as AvaloniaResource in the .csproj/.vbproj, and returns its avares:// URI. */
    private bundleProjectFile(proj: ProjectInfo, srcPath: string): string | null {
        try {
            const projectRoot = path.dirname(proj.projectUri.fsPath);
            const assetsDir = path.join(projectRoot, 'Assets');
            fs.mkdirSync(assetsDir, { recursive: true });
            const ext = path.extname(srcPath);
            const stem = path.basename(srcPath, ext);
            let dest = path.join(assetsDir, `${stem}${ext}`);
            let i = 1;
            while (fs.existsSync(dest)) { dest = path.join(assetsDir, `${stem}-${i}${ext}`); i++; }
            fs.copyFileSync(srcPath, dest);
            this.ensureAvaloniaResources(proj);
            return `avares://${proj.projectName}/Assets/${path.basename(dest)}`;
        } catch {
            return null;
        }
    }

    /** Adds `<AvaloniaResource Include="Assets\**" />` to the .csproj/.vbproj if missing (idempotent). */
    private ensureAvaloniaResources(proj: ProjectInfo): void {
        try {
            const p = proj.projectUri.fsPath;
            let text = fs.readFileSync(p, 'utf8');
            if (/AvaloniaResource/.test(text)) return;
            const group = `\n  <ItemGroup>\n    <AvaloniaResource Include="Assets\\**" />\n  </ItemGroup>\n`;
            text = text.replace(/<\/Project>/, group + '</Project>');
            fs.writeFileSync(p, text, 'utf8');
        } catch { /* best-effort */ }
    }

    /** Binds a DataSet table asset picked in the form designer. Records the EXACT same state the
     *  DataSet designer's "Bind to control" dropdown records (boundTo/boundToType + the shared
     *  per-DataSet SQLite default for a no-storage table), writes the code-behind ItemsSource,
     *  regenerates the DataSet class + .xsd, ensures the SQLite packages, and repaints any open
     *  DataSet designer panel for the .adset — so binding here is indistinguishable from binding
     *  in the DataSet designer (and vice versa). */
    private async bindDataSetAsset(
        doc: DesignerDocument,
        proj: ProjectInfo,
        ctrlName: string,
        controlType: string,
        asset: Extract<Asset, { kind: 'dataset' }>
    ): Promise<void> {
        try {
            const spec = parseDataSet(fs.readFileSync(asset.adsetPath, 'utf8'));
            const t = spec.tables.find((tt) => tt.name === asset.tableName);
            if (!t) {
                void vscode.window.showErrorMessage(`Table "${asset.tableName}" not found in ${path.basename(asset.adsetPath)}.`);
                return;
            }
            if (t.boundTo && t.boundTo !== ctrlName) {
                void vscode.window.showWarningMessage(`"${asset.tableName}" is already bound to "${t.boundTo}" — un-bind it there first.`);
                return;
            }
            const wasBound = t.boundTo === ctrlName;
            // Record the canonical binding state BEFORE generating, exactly like the DataSet side:
            // every bound table is SQLite-backed, defaulting to the shared per-DataSet .db.
            t.boundTo = ctrlName;
            t.boundToType = controlType as DataTableSpec['boundToType'];
            if (!t.sqlite) t.sqlite = { file: defaultDbFile(spec) };
            const b: DataSetBindingRef = {
                datasetName: asset.datasetName, tableName: asset.tableName, controlName: ctrlName,
                controlType: controlType as DataSetBindingRef['controlType']
            };
            const filePath = await bindControlToDataSet(doc.uri, b);
            if (!filePath) { void vscode.window.showErrorMessage(`Could not write the code-behind for ${ctrlName}.`); return; }
            if (controlType === 'DataGrid') ensureDataGridAutoGenerateColumns(doc.uri.fsPath, ctrlName);
            // VB: named controls are not auto-generated fields — ensure the FindControl accessor
            // exists (defensive; the form designer normally syncs these when a control is placed).
            if (proj.language === 'vb') await syncVbAccessors(doc.uri, unionNamedControls(namedControlsInAxaml(doc.uri), doc.model.namedControls()));
            try { fs.writeFileSync(asset.adsetPath, serializeDataSet(spec), 'utf8'); } catch { /* handled below */ }
            // Regenerate the DataSet class + .xsd, make sure the SQLite packages are present (as
            // the DataSet designer's Generate Code does), then repaint any open .adset panel so
            // the DataSet screen shows the binding immediately — "both ways" stays in sync.
            const gen = this.writeGeneratedFilesFor(proj, asset.adsetPath, spec);
            ensureSqlitePackages(proj, spec);
            await reloadDataSetPanel(vscode.Uri.file(asset.adsetPath));
            void vscode.window.showInformationMessage(
                (wasBound
                    ? `Re-wrote the binding of ${asset.tableName} to ${ctrlName}`
                    : `Bound ${asset.tableName} to ${ctrlName} (${path.basename(filePath)})`)
                + (gen ? `; regenerated ${gen}.` : '.')
            );
        } catch (e) {
            void vscode.window.showErrorMessage(`Could not bind ${asset.tableName}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** Un-binds a control from the DataSet table that currently claims it: strips the code-behind
     *  ItemsSource/property/Wire wiring, clears the .adset boundTo marker, regenerates the DataSet
     *  class + .xsd, and repaints any open DataSet designer panel for the .adset (so the DataSet
     *  screen shows the table un-bound immediately). The table keeps its schema + SQLite file —
     *  exactly like the DataSet designer's Un-bind action. Returns the `<DataSet>.<Table>` label
     *  that was unbound, or undefined when the control wasn't DataSet-bound. */
    private async unbindCurrentDataSetBinding(
        doc: DesignerDocument,
        proj: ProjectInfo,
        ctrlName: string,
        fallbackType?: string
    ): Promise<string | undefined> {
        const projectFolder = path.dirname(proj.projectUri.fsPath);
        const b = findBoundTable(projectFolder, ctrlName);
        if (!b) return undefined;
        const label = `${b.spec.name}.${b.table.name}`;
        try {
            await unbindControlFromDataSet(doc.uri, {
                datasetName: b.spec.name, tableName: b.table.name, controlName: ctrlName,
                controlType: (b.table.boundToType as DataSetBindingRef['controlType']) || (fallbackType as DataSetBindingRef['controlType'] | undefined)
            });
        } catch { /* keep going — still clear the marker */ }
        try {
            const spec = parseDataSet(fs.readFileSync(b.adsetPath, 'utf8'));
            const t = spec.tables.find((tt) => tt.name === b.table.name);
            if (t) {
                t.boundTo = null;
                t.boundToType = null;
                fs.writeFileSync(b.adsetPath, serializeDataSet(spec), 'utf8');
                this.writeGeneratedFilesFor(proj, b.adsetPath, spec);
            }
        } catch { /* best-effort */ }
        await reloadDataSetPanel(vscode.Uri.file(b.adsetPath));
        return label;
    }

    /** True when a .adset table (dataset asset) is already bound to a DIFFERENT control. */
    private isDatasetTableClaimed(asset: Extract<Asset, { kind: 'dataset' }>, ctrlName: string): boolean {
        try {
            const spec = parseDataSet(fs.readFileSync(asset.adsetPath, 'utf8'));
            const t = spec.tables.find((tt) => tt.name === asset.tableName);
            return !!t && !!t.boundTo && t.boundTo !== ctrlName;
        } catch { return false; }
    }

    /** Binds an Image to follow a DataGrid's selected-row image column. Exclusive with a static
     *  Image.Source: any Source attribute is cleared (the data path wins). Writes the code-behind
     *  selection handlers + records the binding on the owning table's .adset (boundImages). */
    private async bindDataImage(
        doc: DesignerDocument,
        proj: ProjectInfo,
        panel: vscode.WebviewPanel,
        controlName: string,
        tgt: { datasetName: string; tableName: string; gridName: string; column: string }
    ): Promise<void> {
        try {
            const projectFolder = path.dirname(proj.projectUri.fsPath);
            // Exclusive: clear any static Source (an undoable form edit).
            const before = doc.model.serialize(true);
            const el = doc.model.findByName(controlName);
            if (el && el.hasAttribute('Source')) {
                el.removeAttribute('Source');
                this.notifyEdit(doc, panel, before);
            }
            const ref: DataImageRef = {
                datasetName: tgt.datasetName, tableName: tgt.tableName,
                controlName, gridName: tgt.gridName, column: tgt.column
            };
            const filePath = await bindImageToGrid(doc.uri, ref);
            if (!filePath) { void vscode.window.showErrorMessage(`Could not write the code-behind for ${controlName}.`); return; }
            // The generated code-behind calls ExifImageLoader.LoadImageOriented — copy the bundled
            // helper in when this project predates it (new projects already ship it).
            this.ensureExifImageLoader(proj);
            const owner = tableForGrid(projectFolder, tgt.gridName);
            if (owner) {
                if (!owner.table.boundImages) owner.table.boundImages = [];
                if (!owner.table.boundImages.some((b) => b.control === controlName)) {
                    owner.table.boundImages.push({ control: controlName, column: tgt.column });
                }
                fs.writeFileSync(owner.adsetPath, serializeDataSet(owner.spec), 'utf8');
            }
            // VB: named controls are not auto fields — ensure Image/DataGrid accessors exist.
            if (proj.language === 'vb') await syncVbAccessors(doc.uri, unionNamedControls(namedControlsInAxaml(doc.uri), doc.model.namedControls()));
            void vscode.window.showInformationMessage(
                `Image ${controlName} now shows ${tgt.gridName}.${tgt.column} for the selected row (${path.basename(filePath)}).`
            );
        } catch (e) {
            void vscode.window.showErrorMessage('Data Image bind failed: ' + (e instanceof Error ? e.message : String(e)));
        }
    }

    /** Stops a read-only control following a table column: code-behind line + the `.adset` record. */
    private dropFollowerRecord(adsetPath: string, tableName: string, controlName: string): void {
        try {
            const spec = parseDataSet(fs.readFileSync(adsetPath, 'utf8'));
            const t = spec.tables.find((x) => x.name === tableName);
            if (t && t.followers) {
                t.followers = t.followers.filter((f) => f.control !== controlName);
                fs.writeFileSync(adsetPath, serializeDataSet(spec), 'utf8');
                void reloadDataSetPanel(vscode.Uri.file(adsetPath));
            }
        } catch { /* best-effort: the code-behind line is what actually breaks the build */ }
    }

    /** Number of inline item children (e.g. `<ComboBoxItem>`) — Avalonia refuses an ItemsSource
     *  while these exist (“Items collection must be empty before using ItemsSource.”), so a bind
     *  over them throws at RUNTIME. */
    private inlineItemCount(el: Element): number {
        let n = 0;
        for (const child of Array.from(el.childNodes ?? [])) if ((child as Element).nodeType === 1) n++;
        return n;
    }

    /** Copies the bundled ColumnFollower helper next to the project when it is missing (a project
     *  created before the follower feature). Mirrors ensureExifImageLoader. */
    private ensureColumnFollowerHelper(proj: ProjectInfo): boolean {
        try {
            const file = proj.language === 'vb' ? 'ColumnFollower.vb' : 'ColumnFollower.cs';
            const p = path.join(path.dirname(proj.projectUri.fsPath), file);
            if (fs.existsSync(p)) return false;
            const src = path.join(this.context.extensionUri.fsPath, 'resources', file);
            if (!fs.existsSync(src)) return false;
            fs.copyFileSync(src, p);
            void vscode.window.showInformationMessage(
                `Added ${file} — the helper that keeps a read-only control's list in step with the grid.`);
            return true;
        } catch { return false; }
    }

    /** Binds a read-only control (ComboBox / ListBox / ItemsControl) to ONE text column of a table a
     *  DataGrid owns. The grid keeps the editable row collection (and the “+ Add row…” placeholder);
     *  this control lists the column's values live and skips that placeholder. */
    private async bindFollowerColumn(
        doc: DesignerDocument,
        proj: ProjectInfo,
        panel: vscode.WebviewPanel,
        el: Element,
        ctrlName: string,
        target: Extract<Asset, { kind: 'follower' }>
    ): Promise<void> {
        const projectFolder = path.dirname(proj.projectUri.fsPath);
        const controlType = localName(el.tagName);
        // 1) Inline items would make Avalonia throw as soon as ItemsSource is set — clear them first.
        if (this.inlineItemCount(el) > 0) {
            const choice = await vscode.window.showWarningMessage(
                `${ctrlName} still contains inline items. Avalonia cannot use both an Items list and an ` +
                'ItemsSource (it throws “Items collection must be empty before using ItemsSource.”), ' +
                'so the inline items have to be removed to bind it.',
                { modal: true }, 'Clear them and bind');
            if (choice !== 'Clear them and bind') return;
            const before = doc.model.serialize(true);
            for (const child of Array.from(el.childNodes ?? [])) if ((child as Element).nodeType === 1) el.removeChild(child as Element);
            this.notifyEdit(doc, panel, before);
        }
        // 2) One binding per control: drop whatever it has now (a table it owns, a code asset, an
        //    older follower column).
        const currentTable = dataSetBindingFor(projectFolder, ctrlName);
        if (currentTable) await this.unbindCurrentDataSetBinding(doc, proj, ctrlName, controlType);
        const oldFollow = findFollowerRecord(projectFolder, ctrlName);
        if (oldFollow && !(oldFollow.info.tableName === target.tableName && oldFollow.info.column === target.column)) {
            this.dropFollowerRecord(oldFollow.info.adsetPath, oldFollow.info.tableName, ctrlName);
        }
        await removeItemsSourceBinding(doc.uri, ctrlName);
        // 3) The helper must exist in the project, then the binding line goes in (after the grid's
        //    Wire line, so the row collection is there when the follower is built).
        this.ensureColumnFollowerHelper(proj);
        const filePath = await bindFollowerToColumn(doc.uri, {
            datasetName: target.datasetName,
            tableName: target.tableName,
            controlName: ctrlName,
            column: target.column,
            ownerGrid: target.owner
        });
        if (!filePath) {
            void vscode.window.showErrorMessage(`Could not write the code-behind for ${ctrlName}.`);
            return;
        }
        // 4) Record it on the table (.adset), like boundImages — so the DataSet designer, the picker
        //    and 🩺 Code Fix all know this control follows it.
        try {
            const spec = parseDataSet(fs.readFileSync(target.adsetPath, 'utf8'));
            const t = spec.tables.find((x) => x.name === target.tableName);
            if (t) {
                if (!t.followers) t.followers = [];
                const existing = t.followers.find((f) => f.control === ctrlName);
                if (existing) { existing.column = target.column; existing.type = controlType; }
                else t.followers.push({ control: ctrlName, type: controlType, column: target.column });
                fs.writeFileSync(target.adsetPath, serializeDataSet(spec), 'utf8');
                void reloadDataSetPanel(vscode.Uri.file(target.adsetPath));
            }
        } catch { /* the code-behind binding is the important part */ }
        await this.render(doc, panel);
        void vscode.window.showInformationMessage(
            `${ctrlName} now lists ${target.tableName}.${target.column} — live, following ${target.owner} ` +
            '(the “+ Add row…” row is skipped).');
    }

    /** The bundled ColumnFollower helper, in case a fix or the checker needs it too. */
    private ensureColumnFollowerForDoc(doc: DesignerDocument): void {
        const proj = findProject(doc.uri);
        if (proj) this.ensureColumnFollowerHelper(proj);
    }

    /** The Data-Image code-behind now loads via ExifImageLoader (EXIF-aware), which is bundled with
     *  every NEW project. A project created before this helper existed needs the file next to the
     *  project (or its code-behind won't compile) — copy it in from the extension's resources when
     *  it's missing. Returns true when it was added. */
    private ensureExifImageLoader(proj: ProjectInfo): boolean {
        try {
            const file = proj.language === 'vb' ? 'ExifImageLoader.vb' : 'ExifImageLoader.cs';
            const p = path.join(path.dirname(proj.projectUri.fsPath), file);
            if (fs.existsSync(p)) return false;
            const src = path.join(this.context.extensionUri.fsPath, 'resources', file);
            if (!fs.existsSync(src)) return false;
            fs.copyFileSync(src, p);
            void vscode.window.showInformationMessage(
                `Added ${file} so the bound Image loads JPEGs with their EXIF orientation (portrait photos stay upright).`
            );
            return true;
        } catch { return false; }
    }

    /** GrumpyPanel is a bundled AvaloniaChrome.GrumpyPanel (a Border-based docking region) that
     *  ships with every NEW project (like ChromeWindow). A project created before this helper
     *  existed needs the file next to ChromeWindow — otherwise the saved <chrome:GrumpyPanel>
     *  won't compile. Copy it in from the extension's resources when it's missing. */
    private ensureGrumpyPanelHelpers(doc: DesignerDocument): boolean {
        try {
            const proj = findProject(doc.uri);
            if (!proj) return false;
            const file = proj.language === 'vb' ? 'GrumpyPanel.vb' : 'GrumpyPanel.cs';
            const p = path.join(path.dirname(proj.projectUri.fsPath), file);
            if (fs.existsSync(p)) return false;
            const src = path.join(this.context.extensionUri.fsPath, 'resources', file);
            if (!fs.existsSync(src)) return false;
            fs.copyFileSync(src, p);
            void vscode.window.showInformationMessage(
                `Added ${file} (GrumpyPanel is bundled with new projects — copied it in so this one compiles).`
            );
            return true;
        } catch { return false; }
    }

    /** PathPicker (the bundled AvaloniaChrome.PathPicker behind the File / Folder Selector tools)
     *  ships with every NEW project, like GrumpyPanel. A project created before it existed needs
     *  the file next to ChromeWindow — otherwise the saved <chrome:PathPicker> won't compile.
     *  Copy it in from the extension's resources when it's missing. */
    private ensurePathPickerHelper(doc: DesignerDocument): boolean {
        try {
            const proj = findProject(doc.uri);
            if (!proj) return false;
            const vb = proj.language === 'vb';
            const file = vb ? 'PathPicker.vb' : 'PathPicker.cs';
            const p = path.join(path.dirname(proj.projectUri.fsPath), file);
            const src = path.join(this.context.extensionUri.fsPath, 'resources', file);
            if (!fs.existsSync(src)) return false;
            if (fs.existsSync(p)) {
                // An outdated bundled copy (one that predates the file/folder icon, so the two
                // selector kinds look identical) is refreshed. A copy the user has customised is
                // left alone — isStaleBundledCopy only refreshes provable bundled boilerplate.
                try {
                    if (isStaleBundledCopy(fs.readFileSync(p, 'utf8'), vb, 'PathPicker')) {
                        fs.copyFileSync(src, p);
                        void vscode.window.showInformationMessage(
                            `Updated ${file} to the current bundled version (the pickers now show a file/folder icon).`
                        );
                        return true;
                    }
                } catch { /* unreadable — leave the file alone */ }
                return false;
            }
            fs.copyFileSync(src, p);
            void vscode.window.showInformationMessage(
                `Added ${file} (PathPicker is bundled with new projects — copied it in so this one compiles).`
            );
            return true;
        } catch { return false; }
    }

    /** Removes an Image's Data-Image binding: code-behind handlers + the .adset boundImages entry. */
    private async unbindDataImage(
        doc: DesignerDocument,
        proj: ProjectInfo,
        panel: vscode.WebviewPanel,
        controlName: string,
        adsetPath: string,
        tableName: string
    ): Promise<void> {
        try {
            await unbindImageFromGrid(doc.uri, controlName);
            try {
                const spec = parseDataSet(fs.readFileSync(adsetPath, 'utf8'));
                const t = spec.tables.find((x) => x.name === tableName);
                if (t && t.boundImages) {
                    t.boundImages = t.boundImages.filter((b) => b.control !== controlName);
                    fs.writeFileSync(adsetPath, serializeDataSet(spec), 'utf8');
                }
            } catch { /* best-effort */ }
            void vscode.window.showInformationMessage(`Cleared the Data Image binding on ${controlName}.`);
        } catch (e) {
            void vscode.window.showErrorMessage('Data Image unbind failed: ' + (e instanceof Error ? e.message : String(e)));
        }
    }

    /** When a control is deleted, remove its code-behind binding so no dangling
     *  `Control.ItemsSource = …` / property / Wire line (and .adset boundTo marker) remains:
     *  a DataSet table binding is fully un-bound (code-behind + marker + regenerate MyData),
     *  a generic asset binding is stripped. Must run BEFORE notifyEdit so the undo history
     *  snapshot captures the cleaned-up code-behind. */
    private async cleanupControlBindings(doc: DesignerDocument, el: Element, ctrlName: string): Promise<void> {
        if (!ctrlName) return;
        const proj = findProject(doc.uri);
        if (!proj) return;
        const dsLabel = await this.unbindCurrentDataSetBinding(doc, proj, ctrlName, localName(el.tagName));
        if (!dsLabel && findItemsSourceBinding(doc.uri, ctrlName)) {
            await removeItemsSourceBinding(doc.uri, ctrlName);
        }
        // An Image that follows a DataGrid's selected row: strip its wiring + .adset entry.
        if (localName(el.tagName) === 'Image') {
            const bind = findImageBinding(path.dirname(proj.projectUri.fsPath), ctrlName);
            if (bind) {
                await unbindImageFromGrid(doc.uri, ctrlName);
                try {
                    const spec = parseDataSet(fs.readFileSync(bind.info.adsetPath, 'utf8'));
                    const t = spec.tables.find((x) => x.name === bind.info.tableName);
                    if (t && t.boundImages) {
                        t.boundImages = t.boundImages.filter((b) => b.control !== ctrlName);
                        fs.writeFileSync(bind.info.adsetPath, serializeDataSet(spec), 'utf8');
                    }
                } catch { /* best-effort */ }
            }
        }
    }

    /** Regenerates the DataSet class + .xsd after a table gets bound (so Get<T>() exists). */
    private writeGeneratedFilesFor(proj: ProjectInfo, adsetPath: string, spec: DataSetSpec): string | null {
        try {
            const language = proj.language;
            const rootNamespace = proj.rootNamespace || spec.name;
            const folder = path.dirname(adsetPath);
            const base = spec.name;
            const code = language === 'vb' ? generateVb(spec, rootNamespace) : generateCs(spec, rootNamespace);
            const xsd = generateXsd(spec);
            fs.writeFileSync(path.join(folder, `${base}.${language === 'vb' ? 'vb' : 'cs'}`), code, 'utf8');
            fs.writeFileSync(path.join(folder, `${base}.xsd`), xsd, 'utf8');
            return `${base}.${language === 'vb' ? 'vb' : 'cs'} + ${base}.xsd`;
        } catch { return null; }
    }

    /** 'Custom Title Bar' tool: convert the root Window to a chrome:ChromeWindow custom title bar. */
    private async applyCustomTitleBar(doc: DesignerDocument, panel: vscode.WebviewPanel): Promise<void> {
        const root = doc.model.root;
        const tag = localName(root.tagName);
        if (tag === 'ChromeWindow') {
            void vscode.window.showInformationMessage('This form already uses a custom title bar.');
            return;
        }
        if (tag !== 'Window') {
            void vscode.window.showInformationMessage('A custom title bar can only be applied to a Window-rooted form (not a UserControl).');
            return;
        }
        const before = doc.model.serialize(true);
        const title = root.getAttribute('Title') || 'My Window';
        if (!doc.model.convertRootToChromeWindow(title)) return;
        // The ChromeWindow root + code-behind need the bundled ChromeWindow component — a project
        // that predates it (or the settable TitleBarHeight) is healed here so the app still compiles.
        this.ensureBundledComponentsCurrent(doc);
        // Switch the code-behind base class (C# `: Window` / VB `Inherits Window` → ChromeWindow),
        // awaited so the undo snapshot captures the converted code-behind.
        try { await convertCodeBehindToChrome(doc.uri); } catch { /* best-effort */ }
        this.notifyEdit(doc, panel, before);
        await this.render(doc, panel);
        await this.sendProperties(doc, panel, null); // show the (new) root's Properties (Title Bar Text/Icon)
        void vscode.window.showInformationMessage(
            'Custom title bar applied. Edit the title text via Properties → Title Bar Text; press Ctrl+Z to revert to the default bar.'
        );
    }

    /**
     * Keeps an existing project's BUNDLED component files (ChromeWindow.cs/.vb + AnchorHelper.cs/.vb)
     * current before chrome properties are written. A project created by an older extension keeps its
     * OLD copy, so writing `TitleBarHeight="…"` (or converting a root) no longer compiles — the XAML
     * compiler can't find a property the old ChromeWindow never had. Only provably-old bundled copies
     * (bundled header present, current member missing) are refreshed, and a missing ChromeWindow is
     * copied in; a genuinely customised copy is left alone. Returns the names of the files touched.
     */
    private ensureBundledComponentsCurrent(doc: DesignerDocument): string[] {
        const proj = findProject(doc.uri);
        if (!proj) return [];
        const vb = proj.language === 'vb';
        const resourceRoot = path.join(this.context.extensionUri.fsPath, 'resources');
        const updated: string[] = [];
        for (const spec of bundledComponentSpecs(vb)) {
            // The component lives next to the project file (where New Project writes it); older
            // layouts sometimes put it next to the .axaml — check both.
            const dirs = [path.dirname(proj.projectUri.fsPath), path.dirname(doc.uri.fsPath)];
            for (const dir of dirs) {
                const p = path.join(dir, spec.file);
                if (!fs.existsSync(p)) {
                    // A ChromeWindow-rooted form can't compile without its ChromeWindow component.
                    if (spec.kind === 'ChromeWindow') {
                        try {
                            fs.copyFileSync(path.join(resourceRoot, spec.file), p);
                            updated.push(spec.file);
                        } catch { /* leave it; the code-behind change is best-effort too */ }
                    }
                    break;
                }
                try {
                    const text = fs.readFileSync(p, 'utf8');
                    if (spec.bundled.test(text) && !text.includes(spec.marker)) {
                        fs.writeFileSync(p, fs.readFileSync(path.join(resourceRoot, spec.file), 'utf8'), 'utf8');
                        updated.push(spec.file);
                    }
                } catch { /* never fail an edit over a stale helper */ }
                break; // only the first directory that contains the file
            }
        }
        if (updated.length > 0) {
            void vscode.window.showInformationMessage(
                `Updated ${updated.join(' + ')} to the current bundled version ` +
                `(this project was created before that component gained the settable Title Bar Height / ` +
                `Canvas-only anchoring).`
            );
        }
        return updated;
    }

    /** Writes the 'Undo-Redo' depth to the bound table's .adset and regenerates the DataSet class. */
    private async setUndoRedoDepth(doc: DesignerDocument, controlName: string, valueText: string): Promise<void> {
        const proj = findProject(doc.uri);
        if (!proj || !controlName) return;
        const b = findBoundTable(path.dirname(proj.projectUri.fsPath), controlName);
        if (!b) return;
        const n = parseInt(valueText, 10);
        const depth = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 5;
        b.table.undoRedoDepth = depth;
        try {
            fs.writeFileSync(b.adsetPath, serializeDataSet(b.spec));
        } catch {
            return;
        }
        try {
            const folder = path.dirname(b.adsetPath);
            const base = b.spec.name;
            const codeUri = path.join(folder, proj.language === 'vb' ? `${base}.vb` : `${base}.cs`);
            const code = proj.language === 'vb' ? generateVb(b.spec, proj.rootNamespace) : generateCs(b.spec, proj.rootNamespace);
            fs.writeFileSync(codeUri, code);
            fs.writeFileSync(path.join(folder, `${base}.xsd`), generateXsd(b.spec));
            void vscode.window.showInformationMessage(`Undo-Redo set to ${depth} for ${b.spec.name}.${b.table.name} — ${path.basename(codeUri)} regenerated.`);
        } catch {
            void vscode.window.showInformationMessage(`Undo-Redo set to ${depth} for ${b.spec.name}.${b.table.name} — run "Generate Code" in the DataSet designer to apply it.`);
        }
    }

    /** Builds + sends the multi-select Properties rows: only keys EVERY selected control supports,
     *  with a value shown only when all selected controls agree (an empty box means they differ). */
    private async sendMultiProperties(doc: DesignerDocument, panel: vscode.WebviewPanel, names: string[]): Promise<void> {
        const els = names.map((n) => doc.model.findByName(n)).filter((e) => !!e) as any[];
        if (els.length < 2) {
            await this.sendProperties(doc, panel, els.length === 1 ? (els[0].getAttribute('x:Name') || els[0].getAttribute('Name') || null) : (names[0] ?? null));
            return;
        }
        const rows = multiCommonProps(els);
        await panel.webview.postMessage({
            type: 'properties',
            multi: true,
            names,
            properties: rows,
            info: {
                label: `${els.length} controls selected`,
                desc: 'The properties shown are common to every selected control. A value appears only when all selected controls have the same value; an empty box means their values differ (leave it empty to keep each control\'s own value).',
                use: 'Type or pick a value to set that property on ALL selected controls at once — one Ctrl+Z undoes the whole batch.'
            }
        });
    }

    /** Applies one property value to every selected control as a single undo step (multi-select edit). */
    private async multiSetProperty(doc: DesignerDocument, panel: vscode.WebviewPanel, names: string[], key: string, value: unknown): Promise<void> {
        if (key === '__name__' || key === '__type__' || key === 'UndoRedoDepth' || key === 'ItemsSource') return;
        // Resolve the target elements; skip locked structural elements and SplitPanel pane bodies
        // (a pane's Width/Height are divider positions, not a size).
        const els: any[] = [];
        for (const n of names) {
            const el = doc.model.findByName(n);
            if (!el) continue;
            const nm = el.getAttribute('x:Name') || el.getAttribute('Name') || '';
            if (isLockedStructure(doc.model, nm)) continue;
            if (isSplitPaneName(nm) && (key === 'Width' || key === 'Height')) continue;
            els.push(el);
        }
        if (els.length === 0) return;
        const before = doc.model.serialize(true);
        if (key === '__theme__') {
            // 'System' backs up + clears every set colour on EACH control; 'Custom' restores.
            for (const el of els) {
                const tName = el.getAttribute('x:Name') || el.getAttribute('Name') || '';
                if (String(value ?? '') === 'System') {
                    const colors: Record<string, string> = {};
                    for (const k of THEME_COLOR_KEYS) { const v = el.getAttribute(k); if (v) colors[k] = v; }
                    await this.saveThemeBackup(doc, tName, colors);
                    for (const k of THEME_COLOR_KEYS) el.removeAttribute(k);
                } else {
                    const hasAny = THEME_COLOR_KEYS.some((k) => el.getAttribute(k));
                    if (!hasAny) {
                        const colors = await this.restoreThemeBackup(doc, tName);
                        if (colors) for (const k of Object.keys(colors)) el.setAttribute(k, colors[k]);
                    }
                }
            }
        } else {
            for (const el of els) {
                let v = String(value ?? '');
                if (key === 'Opacity') v = opacityToXaml(v);
                const def = defaultFor(key);
                if (def !== undefined && v === def) v = '';
                if (key === 'chrome:AnchorHelper.Anchor' && v) {
                    doc.model.ensureChromeNamespace();
                    mirrorAnchorDock(el, String(v));
                }
                doc.model.setProperty(el, key, v);
            }
        }
        this.notifyEdit(doc, panel, before);
        await this.render(doc, panel);
        await this.sendMultiProperties(doc, panel, names);
    }

    private async sendProperties(doc: DesignerDocument, panel: vscode.WebviewPanel, name: string | null | undefined): Promise<void> {
        const el = name ? doc.model.findByName(name) : doc.model.root;
        if (!el) {
            await panel.webview.postMessage({ type: 'properties', properties: null });
            return;
        }
        // When a DataGrid/ListBox/etc. is bound to a DataSet table (code-behind), surface the
        // binding in the ItemsSource field so it isn't blank.
        const ctrlName = el.getAttribute('x:Name') || el.getAttribute('Name') || null;
        const proj = findProject(doc.uri);
        // A DataSet table binding takes priority (it also drives the Undo-Redo field);
        // otherwise a generic `Control.ItemsSource = <expr>` binding written by the asset
        // picker is surfaced read-only so the field isn't blank.
        const dsBinding = proj ? dataSetBindingFor(path.dirname(proj.projectUri.fsPath), ctrlName) : undefined;
        const itemSourceOverride = dsBinding ?? (proj ? codeBindingFor(doc.uri, ctrlName) : undefined);
        // A DataGrid bound to a DataSet table gets an editable 'Undo-Redo' field (stored in the .adset).
        const undoRedoOverride = (localName(el.tagName) === 'DataGrid' && dsBinding)
            ? { value: String(dsBinding.undoRedoDepth ?? 5) }
            : undefined;
        await this.ensureAutoSizeOff();
        // A StatusDate clock's Date/Time formats live in its generated code-behind handler — read
        // them (plus a live preview of how the clock looks right now) so the Properties pickers +
        // preview row show the current settings.
        let statusClockOverride: { date?: string; time?: string; preview?: string } | undefined;
        if (ctrlName && isStatusClock(el)) {
            const sc = await getStatusDateSettings(doc.uri, ctrlName);
            statusClockOverride = { date: sc.date, time: sc.time, preview: statusClockSample(sc.date, sc.time) };
        }
        const props = propertyDefsFor(el, this.effectiveFor(doc, name), itemSourceOverride, undoRedoOverride, this.isAutoSizeOff(doc, ctrlName), statusClockOverride);
        // A SplitPanel pane body's Width/Height are its divider positions (the pane fills its grid
        // cell) — re-present them as the grid size and drop the axis that isn't a real divider.
        this.adjustSplitPaneProps(doc, el, ctrlName, props);
        // An Image whose Source is a Data-Image binding (follows a DataGrid's selected row): show it
        // read-only and let the picker change/clear it instead of the file browser.
        if (localName(el.tagName) === 'Image' && ctrlName && proj) {
            const src = props.find((p) => p.key === 'Source');
            if (src) {
                src.dataImage = true; // the webview adds a 'Data…' button on the Source row
                const bind = findImageBinding(path.dirname(proj.projectUri.fsPath), ctrlName);
                if (bind) {
                    src.value = `Data: ${bind.info.gridName}.${bind.info.column}`;
                    src.readOnly = true;
                    src.desc = `Shows the ${bind.info.gridName}.${bind.info.column} image of the selected row. Click … to change it or clear the binding.`;
                }
            }
        }
        const msg: any = {
            type: 'properties',
            name: ctrlName,
            properties: props,
            info: controlInfoFor(this.infoTagFor(el))
        };
        // When a TabControl is selected, also send its TabItem children so the
        // Properties panel can show a dedicated "Tab Items" section.
        if (localName(el.tagName) === 'TabControl') {
            msg.tabItems = doc.model.tabItemsOf(el).map((t) => ({
                name: t.getAttribute('x:Name') || t.getAttribute('Name') || '',
                header: t.getAttribute('Header') || '',
                content: t.getAttribute('Content') || ''
            }));
        }
        // When a ListBox is selected, also send its ListBoxItem children so the
        // Properties panel can show a dedicated "List Items" section.
        if (localName(el.tagName) === 'ListBox') {
            msg.listItems = doc.model.listItemsOf(el).map((t) => ({
                name: t.getAttribute('x:Name') || t.getAttribute('Name') || '',
                content: doc.model.listItemContent(t)
            }));
        }
        // ComboBox / ListBox / ItemsControl also send their item texts so the 'Items'
        // batch-editor popup can pre-fill.
        const itemTag = localName(el.tagName);
        if (itemTag === 'ComboBox' || itemTag === 'ListBox' || itemTag === 'ItemsControl') {
            msg.items = doc.model.itemsOf(el).map((i) => doc.model.itemText(i));
        }
        // A Grid sends its row/column definitions so the 'Rows & Columns' editor can pre-fill.
        if (localName(el.tagName) === 'Grid') {
            msg.gridDefs = {
                rows: doc.model.gridSizes(el, 'rows'),
                cols: doc.model.gridSizes(el, 'cols')
            };
        }
        // A Status Bar (a DockPanel named StatusBarN) sends its child items so the 'Status Items'
        // editor can show them (kind / text / LEFT or RIGHT position).
        if (/^StatusBar\d*$/.test(ctrlName || '') && localName(el.tagName) === 'DockPanel') {
            msg.statusItems = statusItemsOf(el).map((i) => ({ kind: i.kind, text: i.text, position: i.position }));
        }
        // A SplitPanel (a Border frame or, for older docs, the Grid) sends its current shape so the
        // 'Split Layout' editor can pre-fill (Zones default T / Columns / Rows + pane count) and its
        // runtime GridSplitters so the 'Splitters' editor can style each divider bar.
        if (isSplitName(ctrlName)) {
            const grid = splitGridOf(el);
            if (grid) {
                const sh = splitShapeOf(grid);
                msg.splitInfo = { shape: sh.shape, count: sh.count, top: sh.top };
                msg.splitters = splitterRowsOf(grid).map((r) => ({
                    direction: r.direction,
                    thickness: r.thickness,
                    color: r.color,
                    visible: r.visible
                }));
            }
        }
        // A DataGrid sends its current row/column decoration values so the 'Rows'/'Columns' editors
        // can pre-fill (every value is a direct DataGrid attribute).
        if (localName(el.tagName) === 'DataGrid') {
            msg.dgRows = dgRowsOf(el);
            msg.dgCols = dgColsOf(el);
        }
        await panel.webview.postMessage(msg);
    }

    /** Fetches the system font list from the host once and pushes it to a webview panel, so its
     *  font pickers can offer every installed family. Never throws (best effort — the webview has
     *  a compact default list to fall back on). */
    private async pushFonts(panel: vscode.WebviewPanel): Promise<void> {
        try {
            if (this.systemFonts.length === 0) {
                const host = await this.host.getClient();
                this.systemFonts = await host.fonts();
            }
        } catch (e) {
            // Keep whatever we already have (empty list = webview falls back to defaults).
        }
        void panel.webview.postMessage({ type: 'fonts', fonts: this.systemFonts });
    }

    /** A SplitPanel pane body fills its grid cell, so its Width/Height/Min/Max are NOT attributes on
     *  the pane — they belong on the matching Row/Column definition (that is what really sizes the
     *  cell AND what clamps a star row/column when the window is resized; a MinHeight on the pane
     *  body itself is ignored by the Grid layout). Show the size from the grid definitions (the
     *  host-measured pixels when star-sized) and hide the whole dimension family on the axis the
     *  pane does not drive (e.g. Width/Min-Width/Max-Width on the full-width bottom pane). */
    private adjustSplitPaneProps(doc: DesignerDocument, el: Element, ctrlName: string | null, props: any[]): void {
        const root = splitRootOf(el);
        if (!root) return;
        const grid = splitGridOf(root);
        if (!grid) return;
        const geo = paneGeometry(grid, el);
        if (!geo) return;
        const b = this.boundsOf(doc, ctrlName);
        const families: Record<'cols' | 'rows', { size: string; min: string; max: string }> = {
            cols: { size: 'Width', min: 'MinWidth', max: 'MaxWidth' },
            rows: { size: 'Height', min: 'MinHeight', max: 'MaxHeight' }
        };
        const applyAxis = (kind: 'cols' | 'rows', driven: boolean, index: number, measured: number | undefined): void => {
            const fam = families[kind];
            const drop = (key: string): void => {
                const p = props.find((x) => x && x.key === key);
                if (p) {
                    const i = props.indexOf(p);
                    if (i >= 0) props.splice(i, 1);
                }
            };
            if (!driven) { drop(fam.size); drop(fam.min); drop(fam.max); return; }
            const def = splitDefAt(grid, kind, index);
            const size = props.find((x) => x && x.key === fam.size);
            if (size) {
                size.value = paneSizeDisplay(grid, kind, index, measured ?? 0);
                size.desc = kind === 'cols'
                    ? 'Width of this pane (its neighbour stretches to fill the rest). 0 hides the pane; the splitter can be dragged at runtime.'
                    : 'Height of this pane (the rest of the split stretches to fill). 0 hides the pane; the splitter can be dragged at runtime.';
            }
            for (const key of [fam.min, fam.max]) {
                const p = props.find((x) => x && x.key === key);
                if (!p) continue;
                const defVal = def ? (def.getAttribute(key) ?? '') : '';
                // A value typed before this fix landed on the pane body (meaningless there) — still
                // show it so it isn't silently lost; the next edit moves it onto the definition.
                const legacy = el.getAttribute(key) ?? '';
                p.value = defVal || legacy || (key === fam.max ? '' : '0');
                p.desc = kind === 'cols'
                    ? (key === fam.min
                        ? 'This pane\'s column can never be narrower than this when the form resizes.'
                        : 'This pane\'s column can never be wider than this when the form resizes.')
                    : (key === fam.min
                        ? 'This pane\'s row can never be shorter than this when the form resizes.'
                        : 'This pane\'s row can never be taller than this when the form resizes.');
            }
        };
        applyAxis('cols', geo.colSplit && geo.colSpan === 1, geo.col, b ? b.width : undefined);
        applyAxis('rows', geo.rowSplit && geo.rowSpan === 1, geo.row, b ? b.height : undefined);
    }

    private boundsOf(doc: DesignerDocument, name: string | null): HostControlInfo | undefined {
        if (!name) return undefined;
        const frame = this.frames.get(doc.uri.toString());
        return frame?.controls.find((c) => c.name === name);
    }

    /**
     * Drag-point handles for a Line (its two ends) or an Arc (centre + two ends), in design coords,
     * so the webview can render + drag them without any geometry knowledge. Line ends are the
     * box-origin-relative Start/End points mapped onto the reported bounds; Arc ends come from the
     * Start/Sweep angles around the box centre (0° = right, positive clockwise — matches the host).
     */
    private shapeHandlesFor(doc: DesignerDocument, c: HostControlInfo): ShapeHandle[] | undefined {
        if (!c.name) return undefined;
        const el = doc.model.findByName(c.name);
        if (!el) return undefined;
        const tag = localName(el.tagName);
        if (tag === 'Line') {
            const p = doc.model.lineEndpoints(el);
            return [
                { kind: 'start', x: c.x + p.start.x, y: c.y + p.start.y },
                { kind: 'end', x: c.x + p.end.x, y: c.y + p.end.y }
            ];
        }
        if (tag === 'Arc') {
            const g = doc.model.arcGeometry(el, { x: c.x, y: c.y, width: c.width, height: c.height });
            return [
                { kind: 'centre', x: g.cx, y: g.cy },
                { kind: 'start', x: g.startPoint.x, y: g.startPoint.y },
                { kind: 'end', x: g.endPoint.x, y: g.endPoint.y }
            ];
        }
        return undefined;
    }

    /** The preview frame's gridCells for the Grid that directly contains `el` (if any). Used to
     *  size an Image to its cell on placement. The frame reflects the document BEFORE this
     *  placement, which is correct for star/auto cells and a close-enough approximation when a
     *  new row/column shifts the layout slightly. */
    private gridCellsFor(doc: DesignerDocument, el: Element): { v: number[]; h: number[] } | undefined {
        const parent = el.parentNode as Element | null;
        if (!parent || parent.nodeType !== 1) return undefined;
        if (localName(parent.tagName) !== 'Grid') return undefined;
        const name = parent.getAttribute('x:Name') || parent.getAttribute('Name') || null;
        if (!name) return undefined;
        return this.frames.get(doc.uri.toString())?.gridCells?.[name];
    }

    /** Estimated height of one ListBoxItem (measured from the last preview frame, else a default). */
    private itemHeightFor(doc: DesignerDocument, listBox: Element): number {
        const first = doc.model.listItemsOf(listBox)[0];
        if (first) {
            const n = first.getAttribute('x:Name') || first.getAttribute('Name') || '';
            const b = this.boundsOf(doc, n);
            if (b && b.height > 0) return Math.round(b.height);
        }
        return 28;
    }

    /** The selected control's effective (theme-resolved) values from the last preview frame.
     *  The root (unnamed) control is matched by name === null. */
    private effectiveFor(doc: DesignerDocument, name: string | null | undefined): Record<string, string> | undefined {
        const frame = this.frames.get(doc.uri.toString());
        if (!frame) return undefined;
        const c = name
            ? frame.controls.find((c) => c.name === name)
            : frame.controls.find((c) => c.name === null);
        return c?.values;
    }

    /** Resolves the real target for a "Move to container" pick. For a TabControl, descends into
     *  the VISIBLE (active) tab's body — down to its free-placement Canvas when present — so the
     *  moved control lands inside the tab content instead of appearing as a raw item on the tab
     *  strip. Other item containers (ListBox / ItemsControl / Carousel) keep their item semantics.
     */
    private moveTargetFor(doc: DesignerDocument, container: Element): Element {
        if (localName(container.tagName) !== 'TabControl') return container;
        const tabs = doc.model.tabItemsOf(container);
        if (tabs.length === 0) return container;
        // Prefer the ACTIVE (visible) tab — the one the preview renders — else the first tab.
        let tab = tabs[0];
        const active = this.activeTabs.get(doc.uri.toString());
        const tcName = container.getAttribute('x:Name') || container.getAttribute('Name') || '';
        if (active && tcName === active.control && active.index >= 0 && active.index < tabs.length) {
            tab = tabs[active.index];
        }
        // Descend through single-content children to the deepest content container, preferring
        // the tab body's free-placement Canvas (designer-generated tabs ship DockPanel + Canvas).
        let target: Element = tab;
        const seen = new Set<Element>();
        for (; ;) {
            if (seen.has(target)) break;
            seen.add(target);
            const kids = elementChildren(target).filter((k) => !localName(k.tagName).includes('.'));
            const next = kids.find((k) => {
                const kl = localName(k.tagName);
                return kl !== 'TabControl' && CONTAINER_TAGS.has(kl) && !SINGLE_CONTENT_TAGS.has(kl);
            });
            if (!next || next === target) break;
            target = next;
        }
        return target;
    }

    /** The rendered (effective) size of a control from the last frame, falling back to its
     *  Width/Height attributes, then to a sensible default. */
    private renderedSize(doc: DesignerDocument, el: Element): { w: number; h: number } {
        const n = el.getAttribute('x:Name') || el.getAttribute('Name') || '';
        const b = n ? this.boundsOf(doc, n) : undefined;
        const wAttr = parseFloat(el.getAttribute('Width') || '');
        const hAttr = parseFloat(el.getAttribute('Height') || '');
        return {
            w: b && b.width > 0 ? b.width : (Number.isFinite(wAttr) && wAttr > 0 ? wAttr : 100),
            h: b && b.height > 0 ? b.height : (Number.isFinite(hAttr) && hAttr > 0 ? hAttr : 28)
        };
    }

    /** Finds a free position in a Canvas for a moved control so it does not render over the
     *  controls already in the canvas. Tries the origin, then to the right of / below each
     *  existing control; falls back to the origin. Returns canvas-relative {x, y}. */
    private freePositionIn(doc: DesignerDocument, canvas: Element, el: Element): { x: number; y: number } {
        const gap = 8;
        const size = this.renderedSize(doc, el);
        const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
        for (const k of elementChildren(canvas)) {
            if (k === el) continue;
            const s = this.renderedSize(doc, k);
            rects.push({
                x: parseFloat(k.getAttribute('Canvas.Left') || '0'),
                y: parseFloat(k.getAttribute('Canvas.Top') || '0'),
                w: s.w,
                h: s.h
            });
        }
        const overlaps = (x: number, y: number): boolean => {
            for (const r of rects) {
                if (x < r.x + r.w && x + size.w > r.x && y < r.y + r.h && y + size.h > r.y) return true;
            }
            return false;
        };
        const candidates: Array<[number, number]> = [[0, 0]];
        for (const r of rects) {
            candidates.push([r.x + r.w + gap, r.y]);
            candidates.push([r.x, r.y + r.h + gap]);
        }
        for (const [cx, cy] of candidates) {
            if (!overlaps(cx, cy)) return { x: Math.max(0, Math.round(cx)), y: Math.max(0, Math.round(cy)) };
        }
        return { x: 0, y: 0 };
    }

    private designSize(root: Element): { width: number; height: number } {
        const w = parseFloat(root.getAttribute('Width') || '');
        const h = parseFloat(root.getAttribute('Height') || '');
        return {
            width: Number.isFinite(w) && w > 0 ? w : DEFAULT_SIZE.width,
            height: Number.isFinite(h) && h > 0 ? h : DEFAULT_SIZE.height
        };
    }

    /** The FluentTheme variant to render the preview in ('light'|'dark'). The headless host can't
     *  detect the OS colour scheme, so: an explicit RequestedThemeVariant on the form wins; then the
     *  `avaloniaDesigner.previewTheme` setting; else the VS Code colour theme (a dark VS Code ≈ a
     *  dark OS — so a "System" themed form is previewed the way the user's machine would show it). */
    private previewTheme(root: Element): string {
        const v = root.getAttribute('RequestedThemeVariant');
        if (v === 'Dark' || v === 'Light') return v.toLowerCase();
        const cfg = vscode.workspace.getConfiguration('avaloniaDesigner').get<string>('previewTheme', 'auto');
        if (cfg === 'light' || cfg === 'dark') return cfg;
        const kind = vscode.window.activeColorTheme?.kind;
        return (kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast) ? 'dark' : 'light';
    }

    /** Keeps VB code-behind named-control accessors in sync with the XAML. */
    private async syncAccessors(doc: DesignerDocument): Promise<void> {
        await syncVbAccessors(doc.uri, unionNamedControls(namedControlsInAxaml(doc.uri), doc.model.namedControls()));
    }

    // ---------------- Code Fix… (code-behind checker) ----------------

    /** Code-behind file the checker worked on, so a fix can be applied to the same file. */
    private codeBackups = new Map<string, string>();

    /** What `analyzeCodeBehind` needs: the DESIGNER's live XAML plus the project's DataSet facts
     *  (the checker verifies Data-Image / ItemsSource bindings against the .adset specs). */
    private checkOptions(doc: DesignerDocument): CheckOptions {
        const axamlText = doc.model.serialize(true);
        const proj = findProject(doc.uri);
        return {
            axamlText,
            controls: controlsForCheck(doc.uri, axamlText, doc.model.namedControls()),
            dataSet: proj ? this.codeCheckDataSetContext(path.dirname(proj.projectUri.fsPath)) : undefined
        };
    }

    /** Every table that is bound to a control of this project — with the row type and columns the
     *  code-behind has to match, plus the image bindings recorded on those tables. */
    private codeCheckDataSetContext(projectFolder: string): DataSetContext {
        const grids: DataSetGridInfo[] = [];
        const images: DataSetImageInfo[] = [];
        const followers: DataSetFollowerInfo[] = [];
        const datasetClasses: string[] = [];
        for (const f of readDataSetFiles(projectFolder)) {
            datasetClasses.push(f.spec.name);
            for (const t of f.spec.tables) {
                const rowType = `${t.name}Row`;
                if (t.boundTo && t.boundToType === 'DataGrid') {
                    grids.push({
                        datasetName: f.spec.name, datasetClass: f.spec.name, tableName: t.name,
                        rowType, columns: t.columns.map((c) => c.name), gridName: t.boundTo
                    });
                }
                if (!t.boundTo) continue;
                for (const b of t.boundImages ?? []) {
                    images.push({
                        datasetName: f.spec.name, datasetClass: f.spec.name, tableName: t.name,
                        rowType, controlName: b.control, gridName: t.boundTo, column: b.column
                    });
                }
                for (const fl of t.followers ?? []) {
                    followers.push({
                        datasetName: f.spec.name, tableName: t.name, rowType, column: fl.column,
                        controlName: fl.control, ownerGrid: t.boundTo, adsetPath: f.adsetPath
                    });
                }
            }
        }
        return { datasetClasses, grids, images, followers };
    }

    /** Takes ONE backup of the code-behind per "Code Fix…" run (kept in the extension's storage, so
     *  the project folder stays clean). */
    private backupCodeOnce(doc: DesignerDocument, codeFile: string | undefined): void {
        const key = doc.uri.toString();
        if (!codeFile || this.codeBackups.has(key)) return;
        const dest = backupCodeBehind(codeFile, path.join(this.context.globalStorageUri.fsPath, 'code-backups'));
        if (dest) this.codeBackups.set(key, dest);
    }

    /** Runs the checker, publishes the findings to the PROBLEMS pane and lists them in the panel.
     *  `fresh` = a new run from the toolbar button (starts a new backup). */
    private async runCodeCheck(doc: DesignerDocument, panel: vscode.WebviewPanel, fresh = true): Promise<void> {
        if (fresh) this.codeBackups.delete(doc.uri.toString());
        const result = analyzeCodeBehind(doc.uri, this.checkOptions(doc));
        const issues = this.visibleIssues(doc, result.issues);
        publishIssues(doc.uri, result, issues);
        const errors = issues.filter((i) => i.severity === 'error').length;
        const warnings = issues.length - errors;
        await panel.webview.postMessage({
            type: 'codeIssues',
            file: result.codeFile ? path.basename(result.codeFile) : '',
            errors,
            warnings,
            backup: this.codeBackups.get(doc.uri.toString()) ?? '',
            issues: issues.map((i) => ({
                id: i.id,
                severity: i.severity,
                title: i.title,
                detail: i.detail,
                line: i.line ?? 0,
                file: i.file ?? 'code',
                fixable: i.kind !== 'report-only',
                // Extra buttons for the same finding (e.g. keep a deliberate delete and unwire the form).
                alternatives: (i.alternatives ?? []).map((a) => ({ label: a.label, detail: a.detail }))
            }))
        });
        await this.postStatus(panel, issues.length === 0
            ? 'Code Fix: no problems found'
            : `Code Fix: ${errors} error(s), ${warnings} warning(s)`);
    }

    /** Applies one finding. DataSet-dependent fixes (re-generate a binding) are done here because
     *  they need the .adset spec; everything else is a plain file edit in the checker module. */
    private async applyCodeIssue(doc: DesignerDocument, proj: ProjectInfo | undefined, panel: vscode.WebviewPanel, issue: CodeIssue): Promise<string> {
        const projectFolder = proj ? path.dirname(proj.projectUri.fsPath) : '';
        const control = issue.data?.control ?? issue.member ?? '';
        switch (issue.kind) {
            case 'regenerate-binding': {
                // The binding is recorded on the table; re-generating it from there fixes both a
                // missing/partial block and a column that was renamed since the code was written.
                const found = findImageBinding(projectFolder, control);
                if (!found || !proj) return `No Data-Image binding is recorded for "${control}" — bind the Image again from the Properties pane.`;
                await this.bindDataImage(doc, proj, panel, control, {
                    datasetName: found.info.datasetName, tableName: found.info.tableName,
                    gridName: found.info.gridName, column: found.info.column
                });
                return `Re-generated the Data-Image binding of ${control} from ${found.info.tableName}.${found.info.column}.`;
            }
            case 'rebind-grid': {
                if (!proj) return 'No project found for this form.';
                const binding = dataSetBindingFor(projectFolder, control);
                if (!binding) return `No DataSet binding is recorded for "${control}".`;
                const el = doc.model.findByName(control);
                const formClass = (doc.model.root.getAttribute('x:Class') || '').split('.').pop() || '';
                const asset = listAssets(projectFolder, formClass).find((a) => a.kind === 'dataset'
                    && a.datasetName === binding.datasetName && a.tableName === binding.tableName);
                if (!asset || asset.kind !== 'dataset') return `Table "${binding.datasetName}.${binding.tableName}" no longer exists — bind ${control} again.`;
                await this.bindDataSetAsset(doc, proj, control, localName(el?.tagName ?? 'DataGrid'), asset);
                return `Re-generated the binding of ${control} from ${binding.datasetName}.${binding.tableName}.`;
            }
            case 'copy-bundled-helper': {
                const helper = issue.data?.helper ?? '';
                if (!proj) return 'No project found for this form.';
                if (helper === 'ExifImageLoader') this.ensureExifImageLoader(proj);
                else if (helper === 'GrumpyPanel') this.ensureGrumpyPanelHelpers(doc);
                else if (helper === 'ColumnFollower') this.ensureColumnFollowerHelper(proj);
                else if (helper === 'PathPicker') this.ensurePathPickerHelper(doc);
                else this.ensureBundledComponentsCurrent(doc);
                return `${helper} copied into the project.`;
            }
            case 'remove-inline-items': {
                // Edit the MODEL (not the file) — the designer owns the XAML and would otherwise save
                // its stale copy over a direct file edit.
                const el = doc.model.findByName(issue.data?.control ?? issue.member ?? '');
                if (!el) return `"${issue.member}" is gone — re-run the check.`;
                const before = doc.model.serialize(true);
                let removed = 0;
                for (const child of Array.from(el.childNodes ?? [])) {
                    if ((child as Element).nodeType === 1) { el.removeChild(child as Element); removed++; }
                }
                if (removed === 0) return 'The inline items were already removed.';
                this.notifyEdit(doc, panel, before);
                await this.render(doc, panel);
                return `Removed ${removed} inline item(s) from ${issue.member}.`;
            }
            case 'drop-follower': {
                const control = issue.data?.control ?? issue.member ?? '';
                await removeItemsSourceBinding(doc.uri, control);
                const adsetPath = issue.data?.adsetPath ?? '';
                const tableName = issue.data?.tableName ?? '';
                if (adsetPath && tableName) this.dropFollowerRecord(adsetPath, tableName, control);
                return `Removed the stale follower binding of ${control}.`;
            }
            case 'repoint-handler': {
                // The handler was renamed in the code-behind: point the form's attribute at the new
                // name. The code is NOT touched — this only edits the XAML (via the model, so the
                // designer owns the save and the change is undoable).
                const wired = issue.data?.handler ?? issue.member ?? '';
                const found = issue.data?.found ?? '';
                const event = issue.data?.event ?? '';
                const el = issue.data?.control ? doc.model.findByName(issue.data.control) : undefined;
                if (!el || !event || !found) return `Could not find the control that wires "${wired}" — re-run the check.`;
                const before = doc.model.serialize(true);
                el.setAttribute(event, found);
                this.notifyEdit(doc, panel, before);
                await this.render(doc, panel);
                return `Pointed ${event} at "${found}" (was "${wired}").`;
            }
            case 'dismiss': {
                // "Leave it — keep my code": nothing is applied; this exact finding stops being
                // reported while the form stays open (a deliberate manual edit must not nag).
                // The signature is the one of the ORIGINAL finding (see the 'codeFix' case).
                const key = doc.uri.toString();
                const set = this.dismissed.get(key) ?? new Set<string>();
                set.add(issue.data?.signature ?? issueSignature(issue));
                this.dismissed.set(key, set);
                return `Left "${issue.title}" alone — it stays hidden until you reopen the form.`;
            }
            case 'unwrap-handler': {
                // The manual edit was deliberate (a deleted or renamed handler): take the wiring out of
                // the form instead of putting the method back. The code-behind is never touched.
                const event = issue.data?.event ?? '';
                const wired = issue.data?.handler ?? issue.member ?? '';
                const el = issue.data?.control ? doc.model.findByName(issue.data.control) : undefined;
                if (!el || !event) return `Could not find the control that wires "${wired}" — re-run the check.`;
                const current = el.getAttribute(event);
                if (current === null) return `${event} is already unwired on ${issue.data?.control}.`;
                if (wired && current !== wired) {
                    return `The form now wires ${event}="${current}" — re-run the check before unwiring.`;
                }
                const before = doc.model.serialize(true);
                el.removeAttribute(event);
                this.notifyEdit(doc, panel, before);
                await this.render(doc, panel);
                return `Unwired ${event} from ${issue.data?.control} — the form now matches your code.`;
            }
            default:
                return applyLocalFix(doc.uri, issue, this.checkOptions(doc));
        }
    }

    /** Signature of the named controls in a serialized XAML string (for change detection). */
    private controlsSignature(xaml: string): string {
        try {
            const m = new XamlModel(xaml);
            return m.namedControls().map((c) => `${c.name}:${c.type}`).sort().join('|');
        } catch {
            return '';
        }
    }

    private notifyEdit(doc: DesignerDocument, panel: vscode.WebviewPanel, before: string): void {
        const after = doc.model.serialize(true);
        if (before === after) return;
        // If the set of named controls changed (a control was added/removed/renamed), keep the
        // VB code-behind's named-control accessor properties in sync.
        if (this.controlsSignature(before) !== this.controlsSignature(after)) {
            void this.syncAccessors(doc).catch(() => { /* ignore */ });
        }
        this.pushHistory(doc, after);
        this.sendHistoryState(doc, panel);
        this._onDidChangeCustomDocument.fire({
            document: doc,
            label: 'Avalonia Designer edit',
            undo: () => {
                doc.model = new XamlModel(before);
                void this.render(doc, panel);
            },
            redo: () => {
                doc.model = new XamlModel(after);
                void this.render(doc, panel);
            }
        });
    }

    // ------------------------------------------------------------- undo / redo
    private readText(p: string): string | null {
        try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
    }

    /** A snapshot of the current document state (XAML + code-behind text). */
    private snapshotNow(doc: DesignerDocument): HistoryStep {
        const cb = findCodeBehindFile(doc.uri);
        return {
            xaml: doc.model.serialize(true),
            codeBehindPath: cb ?? null,
            codeBehind: cb ? this.readText(cb) : null
        };
    }

    /** Seeds the history with the initial (pre-edit) state the first time the panel loads. */
    private ensureHistory(doc: DesignerDocument): void {
        const key = doc.uri.toString();
        if (!this.history.has(key)) this.history.set(key, { states: [this.snapshotNow(doc)], index: 0 });
    }

    /** The code-behind may have been edited MANUALLY (or gained handlers) since the last designer
     *  snapshot, so before a designer action that will REWRITE the code-behind (delete / cut /
     *  rename / clear canvas / remove a tab or list item), the CURRENT history step is refreshed
     *  from disk. Undo then restores exactly what was on disk before the action — including code
     *  the user typed by hand — instead of an older, stale snapshot (which otherwise restores the
     *  control but not its code-behind contents). */
    private refreshHistoryCode(doc: DesignerDocument): void {
        const h = this.history.get(doc.uri.toString());
        if (!h) return;
        const step = h.states[h.index];
        if (!step) return;
        const cb = findCodeBehindFile(doc.uri);
        if (!cb) return;
        step.codeBehindPath = cb;
        step.codeBehind = this.readText(cb);
    }

    /** Applies the 'Status Items' list to a status-bar DockPanel. Child identity is preserved
     *  (a matching kind reuses the element, so its name — and a StatusDate live clock — survive
     *  text or position edits). Removed children's event handlers are cleaned from code-behind. */
    private async applyStatusItems(doc: DesignerDocument, panel: vscode.WebviewPanel, bar: Element, rawItems: unknown): Promise<void> {
        const items = sanitizeStatusItems(rawItems);
        // Editor order = visual left→right on the bar. A DockPanel lays later Right children to the
        // LEFT of earlier ones, so the right group is emitted REVERSED to match the editor order.
        const lefts = items.filter((i) => i.position !== 'Right');
        const rights = items.filter((i) => i.position === 'Right').reverse();
        const order = [...lefts, ...rights];
        this.refreshHistoryCode(doc);
        const before = doc.model.serialize(true);
        const existing = elementChildren(bar);
        const used = new Set<Element>();
        const kept: Element[] = [];
        const newClocks: string[] = [];
        const newTrackers: string[] = [];
        const make = (item: StatusItem): Element => {
            const kind = item.kind;
            // '<Kind>Item' (never the bare type name, which could collide in code-behind).
            const name = doc.model.uniqueName(`${kind}Item`);
            let el: Element;
            if (kind === 'Separator') {
                el = doc.model.createElement('<Border/>');
                el.setAttribute('Width', '8');
            } else if (kind === 'ProgressBar') {
                el = doc.model.createElement('<ProgressBar Minimum="0" Maximum="100" Value="0"/>');
                el.setAttribute('Width', '120');
            } else if (kind === 'Button') {
                el = doc.model.createElement('<Button/>');
            } else if (kind === 'TextBox') {
                el = doc.model.createElement('<TextBox/>');
            } else if (kind === 'StatusDate') {
                el = doc.model.createElement('<TextBlock/>');
                el.setAttribute('Text', new Date().toLocaleString());
                el.setAttribute('Loaded', `${name}_Loaded`);
                newClocks.push(name);
            } else if (kind === 'XYTracker') {
                // A TextBlock that live-reports the FORM's size (Status Bar items always show the
                // form's dimensions). Classes="XYTracker" distinguishes it from a StatusDate.
                el = doc.model.createElement('<TextBlock/>');
                el.setAttribute('Text', '0 x 0 px');
                el.setAttribute('Classes', 'XYTracker');
                el.setAttribute('Loaded', `${name}_Loaded`);
                newTrackers.push(name);
            } else {
                el = doc.model.createElement('<TextBlock/>');
            }
            if (kind !== 'Separator') el.setAttribute('x:Name', name);
            return el;
        };
        const tune = (el: Element, item: StatusItem): void => {
            if (item.position === 'Right') el.setAttribute('DockPanel.Dock', 'Right');
            else el.removeAttribute('DockPanel.Dock');
            if (item.kind === 'Separator') {
                el.removeAttribute('HorizontalAlignment');
                el.removeAttribute('VerticalAlignment');
                return;
            }
            el.setAttribute('HorizontalAlignment', item.position === 'Right' ? 'Right' : 'Left');
            if (item.kind === 'TextBlock' || item.kind === 'StatusDate' || item.kind === 'XYTracker') el.setAttribute('VerticalAlignment', 'Center');
            else el.removeAttribute('VerticalAlignment');
            if (item.kind === 'Button') {
                if (item.text) el.setAttribute('Content', item.text); else el.removeAttribute('Content');
            } else if (item.kind === 'TextBlock' || item.kind === 'TextBox') {
                if (item.text) el.setAttribute('Text', item.text); else el.removeAttribute('Text');
            }
        };
        for (const item of order) {
            let reuse: Element | undefined;
            for (const c of existing) {
                if (!used.has(c) && statusKindOf(c) === item.kind) { reuse = c; break; }
            }
            let el: Element;
            if (reuse) {
                used.add(reuse);
                el = reuse;
                if (item.kind !== 'Separator' && !el.hasAttribute('x:Name')) {
                    el.setAttribute('x:Name', doc.model.uniqueName(`${item.kind}Item`));
                }
            } else {
                el = make(item);
                used.add(el);
            }
            tune(el, item);
            kept.push(el);
        }
        const removed = existing.filter((c) => !used.has(c));
        for (const c of elementChildren(bar)) bar.removeChild(c);
        for (const el of kept) bar.appendChild(el);
        bar.setAttribute('LastChildFill', 'False');
        const stale = new Set<string>();
        for (const r of removed) {
            for (const h of doc.model.eventHandlersOfSubtree(r)) {
                if (!doc.model.hasHandler(h)) stale.add(h);
            }
        }
        if (stale.size > 0) {
            try { await removeHandlersFromCodeBehind(doc.uri, [...stale]); } catch { /* best-effort */ }
        }
        for (const nm of newClocks) {
            try { await insertStatusDateClock(doc.uri, nm); } catch { /* best-effort */ }
        }
        for (const nm of newTrackers) {
            try { await insertXyTrackerClock(doc.uri, nm, 'form'); } catch { /* best-effort */ }
        }
        const barName = bar.getAttribute('x:Name') || bar.getAttribute('Name') || null;
        this.notifyEdit(doc, panel, before);
        await this.render(doc, panel);
        await this.sendProperties(doc, panel, barName);
    }

    /** Writes the shared 'Pane Border' width onto every pane Border of a SplitPanel (through its
     *  inner Grid when the split is Border-wrapped). */
    private setSplitPaneBorder(el: Element, value: string): void {
        const grid = splitGridOf(el);
        if (!grid) return;
        const nm = el.getAttribute('x:Name') || el.getAttribute('Name') || '';
        const w = String(value).trim();
        for (const b of splitPanes(grid, nm)) {
            if (w === '' || w === '0') b.removeAttribute('BorderThickness');
            else b.setAttribute('BorderThickness', w);
        }
    }

    /** A SplitPanel pane's Width/Height set the DIVIDER, not a size on the pane itself (the pane
     *  fills its grid cell). A number pins that divider so the pane is that many pixels wide; 0
     *  collapses/hides the pane; '*' or empty makes it flex again. A pixel value is applied the
     *  same way a design-time divider drag is (setSplitDividerPixels): the pane's cell takes the
     *  pixels, the neighbour on the divider's far side absorbs the difference, and the WHOLE axis
     *  stays all-star (value = pixel width) so the real GridSplitters keep their correct
     *  star 'Split' resize behaviour at runtime. */
    private async setSplitPaneSize(doc: DesignerDocument, panel: vscode.WebviewPanel, paneBody: Element, kind: 'cols' | 'rows', rawValue: string): Promise<void> {
        const root = splitRootOf(paneBody);
        const grid = root ? splitGridOf(root) : null;
        if (!root || !grid) return;
        const geo = paneGeometry(grid, paneBody);
        if (!geo) return;
        const split = kind === 'cols' ? geo.colSplit : geo.rowSplit;
        const span = kind === 'cols' ? geo.colSpan : geo.rowSpan;
        const index = kind === 'cols' ? geo.col : geo.row;
        const name = paneBody.getAttribute('x:Name') || paneBody.getAttribute('Name') || null;
        if (!split || span !== 1) {
            const other = kind === 'cols' ? 'Height' : 'Width';
            void vscode.window.showInformationMessage(
                `This pane fills the whole ${kind === 'cols' ? 'width' : 'height'} of the split — its ${kind === 'cols' ? 'width' : 'height'} isn't a divider. Resize it with ${other} instead.`
            );
            await this.sendProperties(doc, panel, name);
            return;
        }
        let newSize = String(rawValue).trim();
        if (newSize === '') newSize = '*';
        if (!/^(\d+(\.\d+)?|\d+(\.\d+)?\*|\*)$/.test(newSize)) {
            void vscode.window.showInformationMessage('Enter a pixel size (e.g. 200), 0 to hide this pane, or * to let it flex with the window.');
            await this.sendProperties(doc, panel, name);
            return;
        }
        // A positive pixel size moves THIS pane's divider (its right/bottom edge). Apply it the same
        // way a divider drag is applied — the pane on the divider's far side absorbs the difference
        // and the axis stays all-star — so only THIS divider moves (and runtime GridSplitters keep
        // working). Falls back to the plain value only when there is no far-side pane to absorb
        // (rightmost/bottom-most pane) or no measured geometry.
        if (!/[*]/.test(newSize) && parseFloat(newSize) > 0) {
            const content = contentDefs(grid, kind);
            const farIdx = content.find((i) => i > index);
            if (farIdx !== undefined) {
                const farBody = this.splitBodyInCell(grid, kind, farIdx);
                const curL = this.splitCellPx(doc, paneBody, kind);
                const curR = farBody ? this.splitCellPx(doc, farBody, kind) : 0;
                if (farBody && curL > 0 && curR > 0) {
                    await this.setSplitDividerPixels(doc, panel, paneBody, farBody, kind, parseFloat(newSize));
                    return;
                }
            }
        }
        const sizes = splitDefSizes(grid, kind);
        if (index < 0 || index >= sizes.length) return;
        this.refreshHistoryCode(doc);
        const before = doc.model.serialize(true);
        sizes[index] = newSize;
        // Keep a star on this axis so the split still auto-resizes with the form — but never take
        // it from the pane the user just sized (they asked for a fixed/zero size).
        const content = contentDefs(grid, kind);
        if (content.length >= 2 && !sizes.some((s) => /[*]/.test(s))) {
            const sibling = content.find((i) => i !== index);
            if (sibling !== undefined) sizes[sibling] = '*';
        }
        doc.model.setGridDefinitions(grid, kind, sizes);
        // Keep the FORM's minimum in sync with this new divider size.
        this.applyFormMinimum(doc);
        this.notifyEdit(doc, panel, before);
        await this.render(doc, panel);
        await this.sendProperties(doc, panel, name);
    }

    /** The measured pixel size of a pane body's grid CELL (its body rect plus both pane-border
     *  thicknesses) from the last preview frame — matches what the grid definition actually holds. */
    private splitCellPx(doc: DesignerDocument, bodyEl: Element, kind: 'cols' | 'rows'): number {
        const nm = elName(bodyEl);
        if (!nm) return 0;
        const frame = this.frames.get(doc.uri.toString());
        const fc = frame?.controls ? frame.controls.find((x) => x.name === nm) : undefined;
        if (!fc) return 0;
        let bt = 0;
        const borderEl = bodyEl.parentNode as Element | null;
        if (borderEl && borderEl.nodeType === 1) {
            const f = parseFloat(String(borderEl.getAttribute('BorderThickness') || '').split(',')[0]);
            if (Number.isFinite(f)) bt = Math.max(0, f);
        }
        return Math.max(0, Math.round((kind === 'cols' ? fc.width : fc.height) + 2 * bt));
    }

    /** The pane body that occupies a given content row/column of a SplitPanel's grid (or undefined
     *  when no single-cell pane is there — e.g. the full-width Zones bottom pane on the cols axis). */
    private splitBodyInCell(grid: Element, kind: 'cols' | 'rows', idx: number): Element | undefined {
        for (const b of elementChildren(grid)) {
            if (b.nodeType !== 1 || localName(b.tagName) !== 'Border') continue;
            const body = elementChildren(b).find((k) => k.nodeType === 1);
            if (!body || body.nodeType !== 1 || !isSplitPaneName(elName(body))) continue;
            const geo = paneGeometry(grid, body);
            if (!geo) continue;
            if (kind === 'cols' && geo.col === idx && geo.colSpan === 1) return body;
            if (kind === 'rows' && geo.row === idx && geo.rowSpan === 1) return body;
        }
        return undefined;
    }

    /**
     * Applies a design-time divider drag the way Avalonia's GridSplitter does, so ONLY the dragged
     * divider moves — in the designer, AND (because the saved XAML stays ALL-STAR) at runtime too:
     *
     *   - the dragged pane's cell takes the new pixel size,
     *   - its immediate neighbour absorbs the difference (the pair's total is conserved, so every
     *     divider beyond the neighbour stays put),
     *   - EVERY content cell on the axis is stored as a STAR whose value equals its current pixel
     *     size (Avalonia's own model after a runtime drag). This heals any older fixed-pixel
     *     columns, and keeps the real GridSplitters working: a fixed + star mix makes Avalonia's
     *     GridSplitter resize only the FIXED neighbour while the star absorbs (so the dragged
     *     divider doesn't move / the far divider does), whereas two star neighbours are resized
     *     together with a conserved sum — exactly the "only the dragged splitter shifts" behaviour.
     */
    private async setSplitDividerPixels(
        doc: DesignerDocument, panel: vscode.WebviewPanel,
        draggedBody: Element, otherBody: Element,
        kind: 'cols' | 'rows', newPx: number
    ): Promise<void> {
        const root = splitRootOf(draggedBody);
        const grid = root ? splitGridOf(root) : null;
        if (!root || !grid) return;
        const dg = paneGeometry(grid, draggedBody);
        const og = paneGeometry(grid, otherBody);
        if (!dg || !og) return;
        const name = elName(draggedBody);
        const sizes = splitDefSizes(grid, kind);
        const content = contentDefs(grid, kind);
        const draggedIdx = kind === 'cols' ? dg.col : dg.row;
        const otherIdx = kind === 'cols' ? og.col : og.row;
        if (draggedIdx < 0 || draggedIdx >= sizes.length || otherIdx < 0 || otherIdx >= sizes.length) return;
        if (!content.includes(draggedIdx) || !content.includes(otherIdx)) return;
        // Current pixel size of every content cell (measured — star cells have no intrinsic px).
        const measured = new Map<number, number>();
        for (const i of content) {
            const body = i === draggedIdx ? draggedBody : (i === otherIdx ? otherBody : this.splitBodyInCell(grid, kind, i));
            const px = body ? this.splitCellPx(doc, body, kind) : 0;
            if (px > 0) measured.set(i, px);
        }
        const curL = measured.get(draggedIdx);
        const curR = measured.get(otherIdx);
        if (curL === undefined || curR === undefined) return; // no measured geometry → leave it alone
        const newL = Math.max(1, Math.round(newPx));
        const newR = Math.max(1, Math.round(curL + curR - newL));
        const out = sizes.slice();
        for (let i = 0; i < out.length; i++) {
            if (!content.includes(i)) continue; // Auto splitter gutters stay Auto
            const px = i === draggedIdx ? newL : (i === otherIdx ? newR : (measured.get(i) ?? 1));
            out[i] = `${Math.max(1, px)}*`;
        }
        this.refreshHistoryCode(doc);
        const before = doc.model.serialize(true);
        doc.model.setGridDefinitions(grid, kind, out);
        this.applyFormMinimum(doc);
        this.notifyEdit(doc, panel, before);
        await this.render(doc, panel);
        await this.sendProperties(doc, panel, name);
    }

    /** A SplitPanel pane's Min/Max Height/Width live on its Row/Column definition — that is what
     *  actually clamps a star row/column when the window is resized (a MinHeight attribute on the
     *  pane body is ignored by the Grid layout, so the pane would shrink below its minimum). Maps
     *  exactly like the Width/Height divider: only the axis the pane drives applies (the full-width
     *  bottom pane drives its ROW height; a side-by-side pane drives its COLUMN width). Also clears
     *  a legacy Min/Max attribute that an older build wrote onto the pane body. */
    private async setSplitPaneMinMax(doc: DesignerDocument, panel: vscode.WebviewPanel, paneBody: Element, key: string, rawValue: string): Promise<void> {
        const kind: 'cols' | 'rows' = (key === 'MinWidth' || key === 'MaxWidth') ? 'cols' : 'rows';
        const root = splitRootOf(paneBody);
        const grid = root ? splitGridOf(root) : null;
        if (!root || !grid) return;
        const geo = paneGeometry(grid, paneBody);
        if (!geo) return;
        const name = paneBody.getAttribute('x:Name') || paneBody.getAttribute('Name') || null;
        const driven = kind === 'cols' ? (geo.colSplit && geo.colSpan === 1) : (geo.rowSplit && geo.rowSpan === 1);
        if (!driven) {
            const friendly = key === 'MinWidth' || key === 'MaxWidth' ? 'Min/Max Width' : 'Min/Max Height';
            void vscode.window.showInformationMessage(
                `This pane fills the whole ${kind === 'cols' ? 'width' : 'height'} of the split — its ${friendly} isn't a divider. Use Min/Max ${kind === 'cols' ? 'Height' : 'Width'} instead.`
            );
            await this.sendProperties(doc, panel, name);
            return;
        }
        const def = splitDefAt(grid, kind, kind === 'cols' ? geo.col : geo.row);
        if (!def) return;
        let v = String(rawValue).trim();
        const isMax = key === 'MaxWidth' || key === 'MaxHeight';
        if (!(v === '' || (!isMax && v === '0') || /^\d+(\.\d+)?$/.test(v))) {
            void vscode.window.showInformationMessage('Enter a size in pixels (e.g. 40), or empty for automatic.');
            await this.sendProperties(doc, panel, name);
            return;
        }
        // Snapshot BEFORE mutating so Undo restores the whole change (definition + form minimum).
        this.refreshHistoryCode(doc);
        const before = doc.model.serialize(true);
        if (v === '' || (!isMax && v === '0')) {
            def.removeAttribute(key);
        } else {
            def.setAttribute(key, v);
        }
        // Clear a legacy Min/Max attribute an older build may have put on the pane body itself.
        paneBody.removeAttribute(key);
        // With a pane now pinned at this minimum, the window itself must not shrink below the
        // layout floor (a RowDefinition min alone can't stop the OS letting the user clip it).
        this.applyFormMinimum(doc);
        this.notifyEdit(doc, panel, before);
        await this.render(doc, panel);
        await this.sendProperties(doc, panel, name);
    }

    /** Keeps the form's own MinWidth/MinHeight at (at least) the computed layout floor so the OS
     *  won't let the window be resized below the point where a min-constrained pane or a fixed bar
     *  starts clipping. Only raises the minimum — a larger value the user typed is kept. Pure model
     *  mutation; callers snapshot the document first so the change is part of the same undo step. */
    private applyFormMinimum(doc: DesignerDocument): void {
        const root = doc.model.root;
        const floor = formFloorOf(root);
        const set = (key: 'MinWidth' | 'MinHeight', val: number): void => {
            if (val <= 0) return; // nothing constrains this axis — leave whatever is there
            const want = Math.max(val, pxOf(root.getAttribute(key)));
            if (pxOf(root.getAttribute(key)) !== want) root.setAttribute(key, String(Math.round(want)));
        };
        set('MinWidth', floor.minWidth);
        set('MinHeight', floor.minHeight);
    }

    /** Applies a new Split Layout (shape + pane count) to a SplitPanel, keeping each pane's
     *  contents by index. `shape` is 'zones' (default T: two panes over a full-width one),
     *  'columns' (N side-by-side) or 'rows' (N stacked). Older documents root the split on the Grid
     *  itself — converting those to 'zones' wraps the Grid in the clickable Border frame. */
    private async applySplitShape(doc: DesignerDocument, panel: vscode.WebviewPanel, root: Element, grid: Element, raw: unknown): Promise<void> {
        const r = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
        const shapeRaw = String(r.shape ?? (r.columns === false ? 'rows' : 'columns'));
        const shape: SplitShape = shapeRaw === 'zones' ? 'zones' : (shapeRaw === 'rows' ? 'rows' : 'columns');
        let count = Math.round(Number(r.count));
        if (!Number.isFinite(count)) count = 0;
        let top = Math.round(Number(r.top));
        if (!Number.isFinite(top)) {
            // Older editors sent only shape+count; for Zones their count WAS the total panes
            // (top band + bottom), so map count-1 -> top for compatibility.
            top = shape === 'zones' && count > 0 ? count - 1 : 2;
        }
        top = Math.max(2, Math.min(8, top));
        count = shape === 'zones' ? top + 1 : Math.max(2, Math.min(8, count || 2));
        const cur = splitShapeOf(grid);
        const wantsWrap = shape === 'zones' && root === grid;
        const already = shape === 'zones' ? cur.top === top : cur.count === count;
        if (cur.shape === shape && already && !wantsWrap) {
            await this.sendProperties(doc, panel, root.getAttribute('x:Name') || root.getAttribute('Name') || null);
            return; // already that layout — nothing to do
        }
        let gridEl = grid;
        if (wantsWrap) {
            const inner = this.wrapSplitGrid(doc, grid);
            if (!inner) return;
            gridEl = inner;
        }
        const nm = root.getAttribute('x:Name') || root.getAttribute('Name') || localName(root.tagName);
        await this.rebuildSplitGrid(doc, panel, gridEl, nm, shape, count, shape === 'zones' ? top : 2);
    }

    /** Wraps a Grid-rooted SplitPanel in the new Border frame: the Grid's children + its placement
     *  attributes (size, Dock, Canvas position, margins…) move into an unnamed inner Grid inside a
     *  Border named like the old Grid. Returns the new inner Grid, or null if it can't wrap. */
    private wrapSplitGrid(doc: DesignerDocument, grid: Element): Element | null {
        const parent = grid.parentNode as Element | null;
        if (!parent || parent.nodeType !== 1) return null;
        const nm = grid.getAttribute('x:Name') || grid.getAttribute('Name') || '';
        const inner = doc.model.createElement('<Grid/>');
        while (grid.firstChild) inner.appendChild(grid.firstChild);
        const border = doc.model.createElement('<Border BorderBrush="#909090" BorderThickness="2" Padding="1" Background="#E6E6E6"/>');
        for (let a = 0; a < grid.attributes.length; a++) {
            const attr = grid.attributes.item(a);
            if (!attr) continue;
            if (attr.name === 'x:Name' || attr.name === 'Name') continue;
            border.setAttribute(attr.name, attr.value);
        }
        if (nm) border.setAttribute('x:Name', nm);
        border.appendChild(inner);
        parent.replaceChild(border, grid);
        return inner;
    }

    /** Rebuilds a SplitPanel's grid into the target shape, moving each existing pane's contents
     *  across by pane index. Panes that don't exist in the new shape are removed (their event
     *  handlers are cleaned up from the code-behind). For Zones, `count` = top + 1 (top panes over
     *  the full-width bottom pane) and `top` = how many panes fill the top band. */
    private async rebuildSplitGrid(doc: DesignerDocument, panel: vscode.WebviewPanel, grid: Element, nm: string, shape: SplitShape, count: number, top = 2): Promise<void> {
        this.refreshHistoryCode(doc);
        const before = doc.model.serialize(true);
        // Collect the existing pane bodies (the named Canvas inside each pane Border) by index.
        const oldBodies = new Map<number, Element>();
        for (let idx = 0; ; idx++) {
            const b = splitPaneAt(grid, nm, idx);
            if (!b) break;
            const canvas = elementChildren(b).find((c) => {
                const cn = c.getAttribute('x:Name') || c.getAttribute('Name') || '';
                return localName(c.tagName) === 'Canvas' && cn === `${nm}Pane${idx}`;
            });
            if (canvas) oldBodies.set(idx, canvas);
        }
        const firstOld = oldBodies.get(0);
        const paneBorder = (firstOld && firstOld.parentNode && (firstOld.parentNode as Element).getAttribute('BorderThickness')) || '1';
        const paneCount = shape === 'zones' ? top + 1 : count;
        // Existing panes whose index won't exist in the new shape are dropped (their contents too).
        const stale = new Set<string>();
        for (const [idx, body] of oldBodies) {
            if (idx >= paneCount) {
                const b = body.parentNode as Element | null;
                if (b && b.nodeType === 1) {
                    for (const h of doc.model.eventHandlersOfSubtree(b)) {
                        if (!doc.model.hasHandler(h)) stale.add(h);
                    }
                }
            }
        }
        // Wipe the grid's children (definitions + panes + splitters) and rebuild.
        while (grid.firstChild) grid.removeChild(grid.firstChild);
        for (let p = 0; p < paneCount; p++) {
            const placement = panePlacement(shape, p, top);
            if (!placement) continue;
            const bodyName = `${nm}Pane${p}`;
            const body = oldBodies.get(p) ?? doc.model.createElement(`<Canvas x:Name="${bodyName}"/>`);
            if (!body.getAttribute('x:Name') && !body.getAttribute('Name')) body.setAttribute('x:Name', bodyName);
            const b = doc.model.createElement('<Border/>');
            b.setAttribute('BorderThickness', paneBorder);
            b.setAttribute('BorderBrush', '#808080');
            b.setAttribute('Background', 'White'); // panes are always white content areas
            if (placement.row) b.setAttribute('Grid.Row', String(placement.row));
            if (placement.col) b.setAttribute('Grid.Column', String(placement.col));
            if (placement.rowSpan) b.setAttribute('Grid.RowSpan', String(placement.rowSpan));
            if (placement.colSpan) b.setAttribute('Grid.ColumnSpan', String(placement.colSpan));
            b.appendChild(body);
            grid.appendChild(b);
            // A splitter follows each pane that has a neighbour on that axis. In a Zones layout a
            // vertical bar follows every top-band pane except the last; the horizontal bar (under
            // the top band, spanning all its columns) follows the LAST top pane.
            if (shape === 'zones') {
                if (p < top - 1) grid.appendChild(this.splitterEl(doc.model, { row: 0, col: p * 2 + 1, dir: 'Columns' }));
                else if (p === top - 1) grid.appendChild(this.splitterEl(doc.model, { row: 1, col: 0, colSpan: top * 2 - 1, dir: 'Rows' }));
            } else if (p < paneCount - 1) {
                const horizontal = shape === 'rows';
                grid.appendChild(this.splitterEl(doc.model, horizontal
                    ? { row: p * 2 + 1, col: 0, dir: 'Rows' }
                    : { row: 0, col: p * 2 + 1, dir: 'Columns' }));
            }
        }
        const defs = splitDefsFor(shape, paneCount, top);
        doc.model.setGridDefinitions(grid, 'cols', defs.cols);
        doc.model.setGridDefinitions(grid, 'rows', defs.rows);
        if (stale.size > 0) {
            try { await removeHandlersFromCodeBehind(doc.uri, [...stale]); } catch { /* best-effort */ }
        }
        this.notifyEdit(doc, panel, before);
        await this.render(doc, panel);
        await this.sendProperties(doc, panel, nm);
    }

    /** Builds a GridSplitter element for a splitter gutter (dir is the ResizeDirection: Columns for
     *  a vertical bar between side-by-side panes, Rows for a horizontal bar). */
    private splitterEl(model: XamlModel, g: { row: number; col: number; rowSpan?: number; colSpan?: number; dir: 'Columns' | 'Rows' }): Element {
        const sp = model.createElement('<GridSplitter/>');
        sp.setAttribute('ResizeDirection', g.dir);
        sp.setAttribute('Background', '#B0B0B0');
        // The splitter bar must never shrink below 1px (min 1, not 0) so a thin divider stays
        // grabbable/draggable and can't vanish when the surrounding layout is resized.
        sp.setAttribute('MinWidth', '1');
        sp.setAttribute('MinHeight', '1');
        if (g.dir === 'Columns') sp.setAttribute('Width', '5'); else sp.setAttribute('Height', '5');
        if (g.row) sp.setAttribute('Grid.Row', String(g.row));
        if (g.col) sp.setAttribute('Grid.Column', String(g.col));
        if (g.rowSpan) sp.setAttribute('Grid.RowSpan', String(g.rowSpan));
        if (g.colSpan) sp.setAttribute('Grid.ColumnSpan', String(g.colSpan));
        return sp;
    }

    /** Styles each runtime GridSplitter of a SplitPanel from the 'Splitters' editor. `items` match
     *  the grid's GridSplitters in order (direction is structural and can't change). Only writes
     *  attributes that actually changed, so an unchanged Save leaves the XAML tidy. */
    private async applySplitterSettings(doc: DesignerDocument, panel: vscode.WebviewPanel, grid: Element, nm: string, rawItems: unknown): Promise<void> {
        const rows = splitterRowsOf(grid);
        const items = Array.isArray(rawItems) ? rawItems : [];
        if (rows.length === 0 || items.length === 0) return;
        this.refreshHistoryCode(doc);
        const before = doc.model.serialize(true);
        rows.forEach((r, i) => {
            const it = items[i] as Record<string, unknown> | undefined;
            if (!it || typeof it !== 'object') return;
            const barAttr = r.direction === 'vertical' ? 'Width' : 'Height';
            // Thickness: a number > 0 sets the bar size on its axis; blank/invalid restores the default.
            const rawT = String(it.thickness ?? '').trim();
            const t = parseFloat(rawT);
            const curT = r.el.getAttribute(barAttr) || '';
            if (Number.isFinite(t) && t > 0) {
                const ts = String(Math.round(t));
                if (ts !== curT) r.el.setAttribute(barAttr, ts);
            } else if (rawT === '' && curT) {
                r.el.removeAttribute(barAttr);
            }
            // Colour: an explicit #rrggbb writes Background (changed colours only); blank restores the default.
            const hex = normalizeHexColor(String(it.color ?? ''));
            const curC = r.el.getAttribute('Background') || '';
            if (hex && hex !== curC) r.el.setAttribute('Background', hex);
            else if (!hex && curC) r.el.removeAttribute('Background');
            // Visibility: hidden bars disappear at runtime.
            const vis = it.visible !== false;
            const curV = r.el.getAttribute('IsVisible') || '';
            if (vis && /^false$/i.test(curV)) r.el.removeAttribute('IsVisible');
            else if (!vis && !/^false$/i.test(curV)) r.el.setAttribute('IsVisible', 'False');
        });
        this.notifyEdit(doc, panel, before);
        await this.render(doc, panel);
        await this.sendProperties(doc, panel, nm);
    }

    /** Writes a DataGrid decoration editor's values as attributes on the DataGrid. Only writes
     *  values that differ from the current attribute / the framework default (default → attribute
     *  removed), so an unchanged Save leaves the XAML tidy. */
    private async applyDataGridDecorations(doc: DesignerDocument, panel: vscode.WebviewPanel, el: Element, fields: { key: string; attr: string; def: string }[], raw: unknown): Promise<void> {
        const r = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
        this.refreshHistoryCode(doc);
        const before = doc.model.serialize(true);
        for (const f of fields) {
            const val = String(r[f.key] ?? '').trim();
            if (val === '' || val === f.def) el.removeAttribute(f.attr);
            else el.setAttribute(f.attr, val);
        }
        this.notifyEdit(doc, panel, before);
        await this.render(doc, panel);
        await this.sendProperties(doc, panel, el.getAttribute('x:Name') || el.getAttribute('Name') || null);
    }

    /** 'Columns' editor save: writes the scalar column/header attributes AND rebuilds the column
     *  header text Style (alignment / colour / font / background) inside `<dg:DataGrid.Styles>`. */
    private async applyDataGridCols(doc: DesignerDocument, panel: vscode.WebviewPanel, el: Element, raw: unknown): Promise<void> {
        const r = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
        this.refreshHistoryCode(doc);
        const before = doc.model.serialize(true);
        for (const f of DG_COL_FIELDS) {
            const val = String(r[f.key] ?? '').trim();
            if (val === '' || val === f.def) el.removeAttribute(f.attr);
            else el.setAttribute(f.attr, val);
        }
        this.writeDgHeaderStyle(doc, el, r);
        this.notifyEdit(doc, panel, before);
        await this.render(doc, panel);
        await this.sendProperties(doc, panel, el.getAttribute('x:Name') || el.getAttribute('Name') || null);
    }

    /** Rebuilds the DataGrid's column-header Style from the Columns editor's header fields. Only
     *  non-default fields become Setters; when nothing is set the header Style (and an empty
     *  Styles block) is removed, keeping the XAML tidy. */
    private writeDgHeaderStyle(doc: DesignerDocument, el: Element, r: Record<string, unknown>): void {
        // DataGrid lives in its own assembly, so the header Style's Selector (dg|DataGridColumnHeader)
        // needs the `dg` prefix declared at the ROOT. Avalonia rejects attributes on property
        // elements, so we never redeclare xmlns:dg on <dg:DataGrid.Styles> — it must come from root.
        doc.model.ensureXmlns('dg', 'using:Avalonia.Controls');
        const block = dgStylesBlock(el);
        const old = dgHeaderStyle(el);
        if (old && block) block.removeChild(old);
        // Collect the non-default header setters.
        const setters: string[] = [];
        for (const f of DG_HEADER_FIELDS) {
            const val = String(r[f.key] ?? '').trim();
            if (val === '' || val === f.def) continue;
            setters.push(`<Setter Property="${f.setter}" Value="${String(val).replace(/"/g, '&quot;')}"/>`);
        }
        if (setters.length === 0) {
            if (block && elementChildren(block).length === 0) el.removeChild(block);
            return;
        }
        // Parse with a temporary local dg binding (so the XML parser accepts the prefix), then
        // drop it — serialisation relies on the root's xmlns:dg instead.
        const style = doc.model.createElement(
            `<Style xmlns:dg="using:Avalonia.Controls" Selector="dg|DataGridColumnHeader">${setters.join('')}</Style>`
        );
        style.removeAttribute('xmlns:dg');
        if (block) {
            block.appendChild(style);
        } else {
            const nb = doc.model.createElement('<dg:DataGrid.Styles xmlns:dg="using:Avalonia.Controls"/>');
            nb.removeAttribute('xmlns:dg');
            nb.appendChild(style);
            el.appendChild(nb);
        }
    }

    /** Records a new post-edit state (drops the redo branch, caps at UNDO_STATES). */
    private pushHistory(doc: DesignerDocument, xaml: string): void {
        const key = doc.uri.toString();
        const h = this.history.get(key) ?? { states: [], index: -1 };
        const cb = findCodeBehindFile(doc.uri);
        const step: HistoryStep = { xaml, codeBehindPath: cb ?? null, codeBehind: cb ? this.readText(cb) : null };
        h.states.length = h.index + 1;              // drop redo branch
        h.states.push(step);
        if (h.states.length > UNDO_STATES) h.states.shift();
        h.index = h.states.length - 1;
        this.history.set(key, h);
    }

    /** Undo / redo: restore the XAML + code-behind snapshot, re-render and refresh the panel. */
    private async undoRedo(doc: DesignerDocument, panel: vscode.WebviewPanel, isRedo: boolean, selName: string | null | undefined): Promise<void> {
        const h = this.history.get(doc.uri.toString());
        if (!h || h.states.length === 0) return;
        const target = isRedo ? h.index + 1 : h.index - 1;
        if (target < 0 || target >= h.states.length) return;
        h.index = target;
        const step = h.states[target];
        doc.model = new XamlModel(step.xaml);
        if (step.codeBehindPath && step.codeBehind != null) {
            try { fs.writeFileSync(step.codeBehindPath, step.codeBehind, 'utf8'); } catch { /* ignore */ }
        }
        // Re-sync the code-behind's named-control accessors to the restored XAML.
        void this.syncAccessors(doc).catch(() => { /* ignore */ });
        await this.render(doc, panel);
        const name = selName && doc.model.findByName(selName) ? selName : null;
        await this.sendProperties(doc, panel, name);
    }

    /** Tells the webview whether Undo/Redo are currently possible (drives the toolbar buttons). */
    private sendHistoryState(doc: DesignerDocument, panel: vscode.WebviewPanel): void {
        const h = this.history.get(doc.uri.toString());
        const canUndo = !!h && h.index > 0;
        const canRedo = !!h && h.index < h.states.length - 1;
        void panel.webview.postMessage({ type: 'historyState', canUndo, canRedo });
    }

    /**
     * Toolbar **Project Backup**: write everything that is unsaved, then copy the project folder
     * into its PARENT folder as `<Project>_<date>_<time>` (naming + skip list: projectBackup.ts).
     * Saving comes first — a backup of a half-saved tree is worthless — and it covers the three
     * kinds of dirty state: this designer's document, the DataSet designer's documents (custom
     * editors, invisible to `saveAll`) and every ordinary unsaved text editor.
     */
    private async projectBackup(doc: DesignerDocument, panel: vscode.WebviewPanel): Promise<void> {
        const proj = findProject(doc.uri);
        if (!proj) {
            void vscode.window.showWarningMessage(
                'Project Backup: this form is not inside a project folder yet — nothing to back up.'
            );
            return;
        }
        const folder = path.dirname(proj.projectUri.fsPath);
        const describe = (e: unknown): string => (e instanceof Error ? e.message : String(e));
        try {
            if (doc.dirty) await this.saveCustomDocument(doc);
            const savedDataSets = await saveOpenDataSetDocuments();
            await vscode.workspace.saveAll(false);
            await this.postStatus(panel, savedDataSets.length > 0
                ? `Saved ${savedDataSets.join(', ')} — backing up…`
                : 'Backing up the project…');
        } catch (e) {
            void vscode.window.showErrorMessage(
                `Project Backup: could not save everything first (${describe(e)}). Nothing was copied.`
            );
            return;
        }
        try {
            const res = backupProject(folder);
            await this.postStatus(panel, `Backed up to ${path.basename(res.path)}`);
            void vscode.window.showInformationMessage(
                `Project Backup: ${res.files} file${res.files === 1 ? '' : 's'} copied to ${res.path}`
                + (res.skipped.length > 0 ? ` (skipped ${res.skipped.join(', ')})` : '') + '.'
            );
        } catch (e) {
            await this.postStatus(panel, 'Backup failed');
            void vscode.window.showErrorMessage(`Project Backup failed: ${describe(e)}`);
        }
    }

    async saveCustomDocument(document: DesignerDocument): Promise<void> {
        const text = withDesignerHeader(document.model.serialize(true));
        await vscode.workspace.fs.writeFile(document.uri, Buffer.from(text, 'utf8'));
        document.markSaved();
    }

    async saveCustomDocumentAs(document: DesignerDocument, destination: vscode.Uri): Promise<void> {
        const text = withDesignerHeader(document.model.serialize(true));
        await vscode.workspace.fs.writeFile(destination, Buffer.from(text, 'utf8'));
        document.markSaved();
    }

    async revertCustomDocument(document: DesignerDocument): Promise<void> {
        const data = await vscode.workspace.fs.readFile(document.uri);
        document.model = new XamlModel(Buffer.from(data).toString('utf8'));
        const panel = this.panels.get(document.uri.toString());
        if (panel) await this.render(document, panel);
    }

    async backupCustomDocument(document: DesignerDocument, context: vscode.CustomDocumentBackupContext): Promise<vscode.CustomDocumentBackup> {
        const data = Buffer.from(withDesignerHeader(document.model.serialize(true)), 'utf8');
        await vscode.workspace.fs.writeFile(context.destination, data);
        return {
            id: context.destination.toString(),
            delete: () => vscode.workspace.fs.delete(context.destination)
        };
    }

    /** Arms a toolbox tool in the most recently focused designer (click tool, then click the canvas to place). */
    async armToolInActiveDesigner(tag: string): Promise<void> {
        if (!this.lastActivePanel) {
            void vscode.window.showInformationMessage('Open an .axaml file in the Avalonia Designer first.');
            return;
        }
        await this.lastActivePanel.webview.postMessage({ type: 'armTool', tag });
    }

    /** The most recently focused designer tab and its document, if any. */
    private activeDocAndPanel(): { doc: DesignerDocument; panel: vscode.WebviewPanel } | undefined {
        if (!this.lastActivePanel) return undefined;
        for (const [key, panel] of this.panels) {
            if (panel === this.lastActivePanel) {
                const doc = this.docs.get(key);
                if (doc) return { doc, panel };
                break;
            }
        }
        return undefined;
    }

    /** Clears every control from the active designer's canvas (and its code-behind handlers). */
    async clearActiveCanvas(): Promise<void> {
        const active = this.activeDocAndPanel();
        if (!active) {
            void vscode.window.showInformationMessage('Open an .axaml file in the Avalonia Designer first.');
            return;
        }
        const { doc, panel } = active;
        const before = doc.model.serialize(true);
        // Snapshot the live (possibly hand-edited) code-behind before clearing removes handlers.
        this.refreshHistoryCode(doc);
        const removed = doc.model.clearControls();
        if (removed.length === 0) {
            await this.postStatus(panel, 'The canvas is already empty.');
            return;
        }
        // Drop the event-handler methods owned by the removed controls from the
        // code-behind (deduplicated, and only if nothing else references them).
        const staleSet = new Set<string>();
        for (const el of removed) {
            for (const h of doc.model.eventHandlersOf(el)) {
                if (!doc.model.hasHandler(h)) staleSet.add(h);
            }
        }
        if (staleSet.size > 0) await removeHandlersFromCodeBehind(doc.uri, [...staleSet]);
        // Drop the cleared controls' colour backups too.
        await this.clearDocThemeBackups(doc);
        this.notifyEdit(doc, panel, before);
        await this.render(doc, panel);
        await panel.webview.postMessage({ type: 'properties', properties: null });
        await this.postStatus(panel, `Cleared ${removed.length} control${removed.length === 1 ? '' : 's'}.`);
    }

    /** Is the event picker shown when a control is placed? (`avaloniaDesigner.askEventOnPlace`) */
    private askEventOnPlace(): boolean {
        return vscode.workspace.getConfiguration('avaloniaDesigner').get<boolean>('askEventOnPlace', true);
    }

    /** With the picker off: wire the default event silently? (`avaloniaDesigner.autoWireDefaultEvent`) */
    private autoWireDefaultEvent(): boolean {
        return vscode.workspace.getConfiguration('avaloniaDesigner').get<boolean>('autoWireDefaultEvent', true);
    }

    /**
     * The picker's "don't ask again" checkbox. `wired` = the choice it remembers: after **Wire** the
     * default event is wired silently on later drops, after **Skip** nothing is wired at all — so the
     * checkbox always stores the behaviour the user just chose, in the user's global settings.
     */
    private async rememberEventChoice(wired: boolean): Promise<void> {
        const cfg = vscode.workspace.getConfiguration('avaloniaDesigner');
        try {
            await cfg.update('askEventOnPlace', false, vscode.ConfigurationTarget.Global);
            await cfg.update('autoWireDefaultEvent', wired, vscode.ConfigurationTarget.Global);
            void vscode.window.showInformationMessage(wired
                ? 'Avalonia Designer: new controls will wire their default event without asking (Settings → Avalonia Designer → Ask Event On Place).'
                : 'Avalonia Designer: new controls will be placed without an event handler (Settings → Avalonia Designer → Ask Event On Place).');
        } catch { /* settings are read-only in some hosts — the dialog simply asks again */ }
    }

    /** The events already wired on an element, as `{ event, handler }` (used to mark picker rows). */
    private wiredEventsOf(el: Element, tag: string): { event: string; handler: string }[] {
        const out: { event: string; handler: string }[] = [];
        for (let i = 0; i < el.attributes.length; i++) {
            const a = el.attributes.item(i);
            if (!a || !a.value) continue;
            // A handler attribute: a known event name whose value names a METHOD
            // (`<Button Click="Button1_Click"/>`). `isKnownEvent` covers the events the picker
            // offers beyond the designer's base list (e.g. `DropDownOpened`, `Opened`).
            if (!isEventAttribute(a.name) && !isKnownEvent(tag, a.name)) continue;
            // `Click="{Binding DoIt}"` is a binding, not a handler — it must not be listed (and must
            // never be turned into a code-behind stub by "open"/"add event").
            if (/^[A-Za-z_]\w*$/.test(a.value) === false) continue;
            out.push({ event: a.name, handler: a.value });
        }
        return out;
    }

    /**
     * Opens the webview's event picker for one control.
     *  - `mode: 'place'` — just dropped: the default event is preselected and **Skip** places the
     *    control without any handler (the "don't ask again" checkbox is offered);
     *  - `mode: 'add'` — right-click → **Add event…**: nothing is preselected, already-wired events
     *    are marked and cannot be selected again, and each of them offers **Go to handler**.
     */
    private async openEventPicker(
        doc: DesignerDocument,
        panel: vscode.WebviewPanel,
        name: string,
        tag: string,
        mode: 'place' | 'add'
    ): Promise<void> {
        const el = doc.model.findByName(name);
        if (!el) return;
        const wired = this.wiredEventsOf(el, tag).map((w) => ({
            ...w,
            // The XAML wires it, but the method is gone (deleted by hand) → the UI shows ⚠ missing
            // and clicking it recreates the stub instead of jumping into a void.
            missing: findHandlerInCodeBehind(doc.uri, w.handler) === undefined
        }));
        await panel.webview.postMessage({
            type: 'openEventPicker',
            mode,
            name,
            tag,
            events: eventsFor(tag),
            wired,
            defaultEvent: defaultEventFor(tag),
            known: hasDefaultEvent(tag),
            label: controlInfoFor(tag).label
        });
    }

    /**
     * Wires the events the picker returned: each becomes `<Control>_<Event>` in the XAML plus an
     * empty handler in the code-behind (the code-behind is written first, so the form never carries
     * an event attribute without a method). Already-wired events are left alone.
     */
    private async wireEventSelection(
        doc: DesignerDocument,
        panel: vscode.WebviewPanel,
        name: string,
        events: string[],
        remember: boolean
    ): Promise<void> {
        const el = doc.model.findByName(name);
        if (!el) return;
        const tag = localName(el.tagName);
        const before = doc.model.serialize(true);
        let elName = el.getAttribute('x:Name') || el.getAttribute('Name') || '';
        if (!elName) { if (remember) await this.rememberEventChoice(true); return; }
        if (!doc.model.hasExplicitName(el)) {
            elName = elName.replace(/^_+/, '') || elName;
            doc.model.setExplicitName(el, elName);
        }
        const done: string[] = [];
        for (const event of events) {
            if (typeof event !== 'string' || event.length === 0) continue;
            if (el.getAttribute(event)) continue; // already wired — never overwrite a handler
            const handler = `${elName}_${event}`;
            const result = await insertHandlerIntoCodeBehind(doc.uri, handler, event, tag);
            if (!result) continue;
            el.setAttribute(event, handler);
            done.push(event);
        }
        if (done.length > 0) {
            await vscode.workspace.fs.writeFile(doc.uri, Buffer.from(withDesignerHeader(doc.model.serialize(true)), 'utf8'));
            doc.markSaved();
            this.notifyEdit(doc, panel, before);
            await this.render(doc, panel);
            await this.postStatus(panel, `${elName}: wired ${done.join(', ')}.`);
        } else if (events.length > 0) {
            await this.postStatus(panel, 'Those events were already wired.');
        }
        if (remember) await this.rememberEventChoice(done.length > 0);
    }

    /**
     * Wires the control's default event into the XAML (e.g. `Click="Button1_Click"`) and inserts
     * the handler stub into the code-behind. Placement calls this (openEditor=false) to create the
     * stub at drop time. Middle-click calls it with openEditor=true — that path is NAVIGATE-FIRST:
     * if the handler method already exists it just opens the code-behind at it and writes nothing
     * (placement owns creation now); it only creates the stub as a fallback when the method is
     * genuinely missing (legacy forms / hand-written XAML).
     */
    private async wireDefaultHandler(
        doc: DesignerDocument,
        panel: vscode.WebviewPanel,
        el: Element,
        name: string,
        openEditor: boolean
    ): Promise<void> {
        // Auto-generated names are fine: promote `_TagN` to a clean, persisted name.
        let elName = el.getAttribute('x:Name') || el.getAttribute('Name') || '';
        if (!elName) {
            if (openEditor) {
                void vscode.window.showWarningMessage(
                    'Set the control\'s Name property first — middle-click uses it to attach the event handler.'
                );
            }
            return;
        }
        let promoted = false;
        if (!doc.model.hasExplicitName(el)) {
            elName = elName.replace(/^_+/, '') || elName;
            doc.model.setExplicitName(el, elName);
            promoted = true;
        }

        const eventName = defaultEventFor(localName(el.tagName));
        const handler = `${elName}_${eventName}`;

        // MIDDLE-CLICK = navigate first. If the handler stub is already in the code-behind
        // (placement wrote it), just jump there — do NOT re-insert, do NOT touch the XAML.
        if (openEditor) {
            const existing = findHandlerInCodeBehind(doc.uri, handler);
            if (existing) {
                await this.openCodeBehindAt(existing);
                return;
            }
        }
        // Placement re-entry: already wired and the stub is present -> nothing to do.
        if (!openEditor && el.getAttribute(eventName) === handler) {
            return;
        }
        // Fallback / first placement: create the code-behind stub FIRST so we never persist a
        // XAML event that has no method, then wire the attribute if it isn't already.
        const result = await insertHandlerIntoCodeBehind(doc.uri, handler, eventName);
        if (!result) {
            if (openEditor) {
                void vscode.window.showInformationMessage(
                    `No code-behind file found for ${path.basename(doc.uri.fsPath)} and none could be created.`
                );
            }
            return;
        }
        if (el.getAttribute(eventName) !== handler) {
            el.setAttribute(eventName, handler);
            await vscode.workspace.fs.writeFile(doc.uri, Buffer.from(withDesignerHeader(doc.model.serialize(true)), 'utf8'));
            doc.markSaved();
            if (promoted) await this.render(doc, panel);
        }
        if (openEditor) {
            await this.openCodeBehindAt(result);
        }
    }

    private async openCodeBehindAt(result: { filePath: string; cursorOffset: number }): Promise<void> {
        const editor = await vscode.window.showTextDocument(vscode.Uri.file(result.filePath));
        const pos = editor.document.positionAt(result.cursorOffset);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    }

    /** Middle-click a control: jump to the wired handler, or pick one when several are wired. */
    private async openEventHandler(doc: DesignerDocument, panel: vscode.WebviewPanel, name: string): Promise<void> {
        const el = doc.model.findByName(name);
        if (!el || el === doc.model.root) return;
        const tag = localName(el.tagName);
        const wired = this.wiredEventsOf(el, tag).map((w) => ({
            ...w,
            missing: findHandlerInCodeBehind(doc.uri, w.handler) === undefined
        }));
        const choice = handlerChoice(wired);
        if (choice.mode === 'none') {
            // Nothing is wired yet — the old behaviour: wire the default event and open that.
            await this.wireDefaultHandler(doc, panel, el, name, true);
            return;
        }
        if (choice.mode === 'one') {
            await this.openOrCreateHandler(doc, panel, el, choice.event, choice.handler);
            return;
        }
        // Several handlers: let the user choose in the webview (it answers with 'openHandler').
        await panel.webview.postMessage({
            type: 'openHandlerMenu',
            name,
            tag,
            label: controlInfoFor(tag).label,
            wired: choice.wired
        });
    }

    /**
     * Opens the code-behind at a handler the form has wired, creating the stub first when the
     * method is missing (hand-written XAML, or a method deleted by hand) — with the exact
     * EventArgs type for that event, so the build stays clean.
     */
    private async openOrCreateHandler(
        doc: DesignerDocument,
        panel: vscode.WebviewPanel,
        el: Element,
        event: string | undefined,
        handler: string
    ): Promise<void> {
        const existing = findHandlerInCodeBehind(doc.uri, handler);
        if (existing) {
            await this.openCodeBehindAt(existing);
            return;
        }
        if (!event) {
            void vscode.window.showInformationMessage(
                `No code-behind method "${handler}" yet — the form wires it, but the stub is missing.`);
            return;
        }
        const created = await insertHandlerIntoCodeBehind(doc.uri, handler, event, localName(el.tagName));
        if (!created) {
            void vscode.window.showInformationMessage(`Could not create the handler "${handler}".`);
            return;
        }
        await this.openCodeBehindAt(created);
        await this.postStatus(panel, `Created the missing handler "${handler}".`);
    }

    /** Re-renders every open designer (toolbox refresh button). */
    async refreshAll(): Promise<void> {
        for (const [key, panel] of this.panels) {
            const doc = this.docs.get(key);
            if (doc) await this.render(doc, panel);
        }
    }

    private async postStatus(panel: vscode.WebviewPanel, message: string): Promise<void> {
        await panel.webview.postMessage({ type: 'status', message });
    }

    private webviewHtml(wv: vscode.Webview): string {
        const cssUri = wv.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'designer.css'));
        const jsUri = wv.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'designer.js'));
        const csp = [
            "default-src 'none'",
            `img-src ${wv.cspSource} data:`,
            `style-src ${wv.cspSource} 'unsafe-inline'`,
            `script-src ${wv.cspSource}`,
            `font-src ${wv.cspSource}`
        ].join('; ');
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta http-equiv="Content-Security-Policy" content="${csp}"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<link rel="stylesheet" href="${cssUri}"/>
<title>Avalonia Form Designer</title>
</head>
<body>
  <div id="app">
    <div id="toolbar">
      <!-- Foldable categories: a heading chip folds the buttons that FOLLOW it away (up to the next
           heading, or the data-stop marker below) — see .tbg-head in designer.css and
           applyToolbarFolds() in designer.js. Groups start UNFOLDED. -->
      <button class="tbg-head" data-grp="edit" data-tip="Edit: undo and redo (Ctrl+Z / Ctrl+Shift+Z)" aria-expanded="true">Edit</button>
      <button id="btnUndo" title="Undo the last change (Ctrl+Z)" disabled><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.8 2.2 L6.2 4.8 L8.8 7.4"/><path d="M6.2 4.8 H9.6 A3.4 3.4 0 0 1 9.6 11.6 H7.0"/></svg></button>
      <button id="btnRedo" title="Redo the last undone change (Ctrl+Shift+Z / Ctrl+Y)" disabled><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.2 2.2 L9.8 4.8 L7.2 7.4"/><path d="M9.8 4.8 H6.4 A3.4 3.4 0 0 0 6.4 11.6 H9.0"/></svg></button>
      <span class="sep"></span>
      <button class="tbg-head" data-grp="file" data-tip="File: new form, reload from disk, code-behind check, project backup" aria-expanded="true">File</button>
      <button id="btnNewForm" title="Create a new Avalonia form">+ New Form</button>
      <button id="btnRefresh" title="Reload the form from disk and re-read the database preview (e.g. rows added while the app was running)">Refresh</button>
      <button id="btnCodeFix" title="Check the code-behind against the form and the DataSet: missing VB accessors, duplicate methods, leftover handlers of deleted controls, broken Data-Image / ItemsSource bindings, missing Imports or bundled helper files — with a one-click fix per problem">🩺 Code Fix…</button>
      <button id="btnBackup" title="Save everything that is unsaved, then copy this whole project into the parent folder as &lt;Project&gt;_&lt;date&gt;_&lt;time&gt; (no bin/obj, caches or .git)">💾 Project Backup</button>
      <span class="sep"></span>
      <button class="tbg-head" data-grp="zoom" data-tip="Zoom: zoom out / in and fit the form to the window" aria-expanded="true">Zoom</button>
      <button id="btnZoomOut" title="Zoom out">−</button>
      <input id="zoomValue" readonly value="100%"/>
      <button id="btnZoomIn" title="Zoom in">+</button>
      <button id="btnFit" title="Fit to window">Fit</button>
      <span class="sep"></span>
      <button class="tbg-head" data-grp="guides" data-tip="Guides: dot grid, snap-to-grid, grid settings, crosshair" aria-expanded="true">Guides</button>
      <button id="btnDotGrid" title="Toggle the dot grid on the design surface">Grid</button>
      <button id="btnSnapGrid" title="Toggle snap-to-grid when moving/resizing">Snap</button>
      <button id="btnGridSettings" title="Dot grid settings (spacing, color, dot size)">Grid…</button>
      <span class="sep"></span>
      <button id="btnCrosshair" title="Crosshair settings (thickness, colour, opacity, length)">Crosshair</button>
      <span class="sep"></span>
      <button class="tbg-head" data-grp="align" data-tip="Alignment Tools: align and size the selected controls against the first-selected one" aria-expanded="true">Alignment</button>
      <button id="btnAlignLeft" title="Align left edges to the first-selected control" disabled><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3 V13"/><path d="M13.5 8 H6.5"/><path d="M9.5 5 L6.5 8 L9.5 11"/></svg></button>
      <button id="btnAlignCentre" title="Align horizontal centres to the first-selected control" disabled><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5 V11"/><path d="M1.5 8 H5.5"/><path d="M3.5 6.4 L5.5 8 L3.5 9.6"/><path d="M14.5 8 H10.5"/><path d="M12.5 6.4 L10.5 8 L12.5 9.6"/></svg></button>
      <button id="btnAlignRight" title="Align right edges to the first-selected control" disabled><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 3 V13"/><path d="M2.5 8 H9.5"/><path d="M6.5 5 L9.5 8 L6.5 11"/></svg></button>
      <button id="btnAlignTop" title="Align top edges to the first-selected control" disabled><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3 H13"/><path d="M8 13.5 V6.5"/><path d="M5 9.5 L8 6.5 L11 9.5"/></svg></button>
      <button id="btnAlignMiddle" title="Align vertical centres to the first-selected control" disabled><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8 H11"/><path d="M8 1.5 V5.5"/><path d="M6.4 3.5 L8 5.5 L9.6 3.5"/><path d="M8 14.5 V10.5"/><path d="M6.4 12.5 L8 10.5 L9.6 12.5"/></svg></button>
      <button id="btnAlignBottom" title="Align bottom edges to the first-selected control" disabled><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 13 H13"/><path d="M8 2.5 V9.5"/><path d="M5 6.5 L8 9.5 L11 6.5"/></svg></button>
      <button id="btnAlignText" title="Centre the text horizontally in the selected text controls" disabled><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 2 V14"/><path d="M13.5 2 V14"/><path d="M5.5 6 H10.5"/><path d="M4.5 8 H11.5"/><path d="M5.5 10 H10.5"/></svg></button>
      <button id="btnSameWidth" title="Make every selected control the same WIDTH as the first-selected control" disabled><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 3 V13"/><path d="M13.5 3 V13"/><path d="M5.5 8 H10.5"/><path d="M7.3 6.2 L5.5 8 L7.3 9.8"/><path d="M8.7 6.2 L10.5 8 L8.7 9.8"/></svg></button>
      <button id="btnSameHeight" title="Make every selected control the same HEIGHT as the first-selected control" disabled><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 2.5 H13"/><path d="M3 13.5 H13"/><path d="M8 5.5 V10.5"/><path d="M6.2 7.3 L8 5.5 L9.8 7.3"/><path d="M6.2 8.7 L8 10.5 L9.8 8.7"/></svg></button>
      <span class="sep"></span>
      <button class="tbg-head" data-grp="space" data-tip="Spacing: equal gaps between three or more selected controls" aria-expanded="true">Spacing</button>
      <button id="btnEqualV" title="Equal vertical spacing: 3+ controls spread with equal gaps between them (topmost &amp; bottommost stay put)" disabled><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3.5 H13"/><path d="M6.5 8 H13"/><path d="M6.5 12.5 H13"/><path d="M3 4.8 V11.2"/><path d="M1.6 6.3 L3 4.8 L4.4 6.3"/><path d="M1.6 9.7 L3 11.2 L4.4 9.7"/></svg></button>
      <button id="btnEqualH" title="Equal horizontal spacing: 3+ controls spread with equal gaps between them (leftmost &amp; rightmost stay put)" disabled><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 6.5 V13"/><path d="M8 6.5 V13"/><path d="M12.5 6.5 V13"/><path d="M4.8 3 H11.2"/><path d="M6.3 1.6 L4.8 3 L6.3 4.4"/><path d="M9.7 1.6 L11.2 3 L9.7 4.4"/></svg></button>
      <span id="status" data-stop="1">Ready</span>
      <button id="btnCodeSettings" title="Settings: when the designer re-checks the code-behind against the form (when you return to the designer / on save / while typing / only manually) and whether controls with a missing handler get a ⚠ badge">⚙ Settings</button>
    </div>
    <div id="main">
      <div id="canvasWrap">
        <div id="rulerTop">
          <div id="rulerCorner"></div>
          <div id="rulerH"></div>
        </div>
        <div id="rulerSide">
          <div id="rulerV"></div>
          <div id="canvas">
          <img id="preview" alt="Design surface"/>
          <div id="dotGrid" class="dot-grid" hidden></div>
          <div id="overlayLayer"></div>
          <div id="menuDummies"></div>
          <div id="multiSel"></div>
          <div id="marquee" hidden></div>
          <div id="radiusGuide" hidden></div>
          <div id="splitGuide" hidden></div>
          <div id="selection" class="sel" hidden></div>
          <div id="cellHighlight" class="cell-highlight" hidden></div>
          <div id="crosshair" hidden><i id="chH"></i><i id="chV"></i></div>
          </div>
        </div>
      </div>
      <div id="props">
        <div id="propsHeader">
          <span>Properties</span>
          <button id="btnClearSel" title="Clear selection">✕</button>
        </div>
        <div id="controlListRow">
          <select id="controlList" title="Select a control to focus it on the canvas"></select>
        </div>
        <div id="helpPanel" hidden>
          <div id="helpHeader">
            <span id="helpTitle">About</span>
            <button id="btnToggleHelp" title="Collapse / expand">▾</button>
          </div>
          <div id="helpBody" hidden></div>
        </div>
        <div id="propsToggleRow" hidden>
          <label><input type="checkbox" id="chkAdvanced"/> Show advanced</label>
        </div>
        <div id="propsEmpty">Select a control on the canvas to edit its properties.</div>
        <div id="propsBody" hidden></div>
      </div>
    </div>
    <div id="contextMenu" hidden>
      <button id="ctxCut">Cut</button>
      <button id="ctxCopy">Copy</button>
      <button id="ctxPaste" disabled>Paste</button>
      <button id="ctxMoveToContainer">Move to container…</button>
      <button id="ctxAddEvent">Add event…</button>
      <button id="ctxDelete">Delete</button>
    </div>
    <div id="eventModal" class="modal" hidden>
      <div class="modal-box modal-narrow">
        <h3 id="eventTitle">Wire an event</h3>
        <p class="modal-hint" id="eventHint"></p>
        <div id="eventList" class="event-list"></div>
        <label class="modal-check" id="eventRememberWrap"><input type="checkbox" id="eventRemember"/> Don't ask again — remember this choice</label>
        <div class="modal-buttons">
          <button id="eventSkip" type="button" class="modal-btn">Skip</button>
          <button id="eventWire" type="button" class="modal-btn primary">Wire event</button>
        </div>
      </div>
    </div>
    <div id="handlerModal" class="modal" hidden>
      <div class="modal-box modal-narrow">
        <h3 id="handlerTitle">Wired events</h3>
        <p class="modal-hint" id="handlerHint"></p>
        <div id="handlerList" class="event-list"></div>
        <div class="modal-buttons">
          <button id="handlerAdd" type="button" class="modal-btn">Add event…</button>
          <button id="handlerClose" type="button" class="modal-btn primary">Close</button>
        </div>
      </div>
    </div>
    <div id="settingsModal" class="modal" hidden>
      <div class="modal-box modal-narrow">
        <h3>Code check settings</h3>
        <p class="modal-hint" id="settingsHint">When should the designer check the code-behind against the form? The check is read-only: it reports (PROBLEMS pane, ⚠ badges on the canvas) and never rewrites your code.</p>
        <div id="settingsModes" class="settings-modes"></div>
        <label class="modal-check"><input type="checkbox" id="settingsBadges"/> Mark controls whose wired handler is missing with a ⚠ badge</label>
        <div class="modal-buttons">
          <button id="settingsCancel" type="button" class="modal-btn">Cancel</button>
          <button id="settingsSave" type="button" class="modal-btn primary">Save</button>
        </div>
      </div>
    </div>
    <div id="itemsModal" class="modal" hidden>
      <div class="modal-box">
        <h3>Items</h3>
        <p class="modal-hint">One item per line.</p>
        <textarea id="itemsText" rows="12" spellcheck="false" placeholder="Item one&#10;Item two&#10;Item three"></textarea>
        <div class="modal-buttons">
          <button id="itemsCancel" class="modal-btn">Cancel</button>
          <button id="itemsSave" class="modal-btn primary">Save</button>
        </div>
      </div>
    </div>
    <div id="menuModal" class="modal" hidden>
      <div class="modal-box modal-wide">
        <h3 id="menuTitle">Menu Items</h3>
        <p class="modal-hint">Build the menu: the top row is the menu bar. Each item can hold a submenu up to 5 levels deep. Kinds: <b>Item</b> (submenu if it has children), <b>CheckBox</b>/<b>Radio</b> (checkable/radio items), <b>ComboBox</b> (its children are its options), <b>Separator</b>, <b>Space</b> (an invisible gap between top-level items — set its width in px), and <b>File Selector</b>/<b>Folder Selector</b> (the item IS a path row: set its dialog title and width).</p>
        <div id="menuBody" class="menu-tree"></div>
        <div class="modal-buttons menu-toolbar">
          <button id="menuAddTop" type="button" class="modal-btn">+ Add menu item</button>
        </div>
        <div class="modal-buttons">
          <button id="menuCancel" type="button" class="modal-btn">Cancel</button>
          <button id="menuSave" type="button" class="modal-btn primary">Save</button>
        </div>
      </div>
    </div>
    <div id="statusModal" class="modal" hidden>
      <div class="modal-box modal-wide">
        <h3 id="statusTitle">Status Items</h3>
        <p class="modal-hint">Items shown on the status bar, listed left → right. Each is pinned to the <b>Left</b> or <b>Right</b> of the bar and stretches to its height.</p>
        <div id="statusBody" class="menu-tree"></div>
        <div class="modal-buttons">
          <button id="statusAdd" type="button" class="modal-btn">+ Add item</button>
        </div>
        <div class="modal-buttons">
          <button id="statusCancel" type="button" class="modal-btn">Cancel</button>
          <button id="statusSave" type="button" class="modal-btn primary">Save</button>
        </div>
      </div>
    </div>
    <div id="codeModal" class="modal" hidden>
      <div class="modal-box modal-wide">
        <h3>Code Fix</h3>
        <p class="modal-hint" id="codeHint">Checks the code-behind against the form and the DataSet.</p>
        <div id="codeBody" class="code-list"></div>
        <div class="modal-buttons">
          <button id="codeRecheck" type="button" class="modal-btn">Re-check</button>
          <button id="codeFixAll" type="button" class="modal-btn">Fix all</button>
          <button id="codeClose" type="button" class="modal-btn primary">Close</button>
        </div>
      </div>
    </div>
    <div id="splitModal" class="modal" hidden>
      <div class="modal-box modal-narrow">
        <h3 id="splitTitle">Split Layout</h3>
        <p class="modal-hint">Panes are separated by bars you can drag at runtime to resize them; the panes resize with the window. Each pane keeps whatever is inside it.</p>
        <div class="grid-settings">
          <label>Layout
            <span class="ch-seg">
              <button id="splitZones" type="button" class="ch-seg-btn">Zones</button>
              <button id="splitCols" type="button" class="ch-seg-btn">Columns</button>
              <button id="splitRows" type="button" class="ch-seg-btn">Rows</button>
            </span>
          </label>
          <label id="splitPanesRow"><span id="splitPanesLabel">Panes</span>
            <span class="split-count-row">
              <button id="splitMinus" type="button" class="modal-btn">−</button>
              <input id="splitCount" readonly value="3"/>
              <button id="splitPlus" type="button" class="modal-btn">+</button>
            </span>
          </label>
        </div>
        <div class="modal-buttons">
          <button id="splitCancel" type="button" class="modal-btn">Cancel</button>
          <button id="splitSave" type="button" class="modal-btn primary">Save</button>
        </div>
      </div>
    </div>
    <div id="splitterModal" class="modal" hidden>
      <div class="modal-box modal-narrow">
        <h3 id="splitterTitle">Splitters</h3>
        <p class="modal-hint">The draggable divider bars between the panes. <b>Thickness</b> is the bar's width (a vertical divider) or height (a horizontal one); a <b>hidden</b> bar can't be dragged at runtime.</p>
        <div id="splitterBody" class="splitter-list"></div>
        <div class="modal-buttons">
          <button id="splitterCancel" type="button" class="modal-btn">Cancel</button>
          <button id="splitterSave" type="button" class="modal-btn primary">Save</button>
        </div>
      </div>
    </div>
    <div id="dgModal" class="modal" hidden>
      <div class="modal-box modal-narrow">
        <h3 id="dgTitle">Rows</h3>
        <p class="modal-hint" id="dgHint"></p>
        <div id="dgBody" class="splitter-list"></div>
        <div class="modal-buttons">
          <button id="dgCancel" type="button" class="modal-btn">Cancel</button>
          <button id="dgSave" type="button" class="modal-btn primary">Save</button>
        </div>
      </div>
    </div>
    <div id="gridModal" class="modal" hidden>
      <div class="modal-box modal-wide">
        <h3>Rows &amp; Columns</h3>
        <p class="modal-hint">Rows run across, columns run down. Size each one: <b>Auto</b> fits its content, <b>*</b> fills the leftover space, or type a number (e.g. 100) for exact pixels.</p>
        <div class="grid-defs">
          <div class="grid-defs-col">
            <h4>Rows</h4>
            <div id="gridRows" class="grid-def-list"></div>
            <button id="gridAddRow" type="button" class="modal-btn">+ Add row</button>
          </div>
          <div class="grid-defs-col">
            <h4>Columns</h4>
            <div id="gridCols" class="grid-def-list"></div>
            <button id="gridAddCol" type="button" class="modal-btn">+ Add column</button>
          </div>
        </div>
        <div class="modal-buttons">
          <button id="gridCancel" type="button" class="modal-btn">Cancel</button>
          <button id="gridSave" type="button" class="modal-btn primary">Save</button>
        </div>
      </div>
    </div>
    <div id="dotGridModal" class="modal" hidden>
      <div class="modal-box modal-narrow">
        <h3>Dot Grid</h3>
        <p class="modal-hint">The dotted grid is drawn on top of the design surface. Its spacing, color and dot size apply to every form (global settings).</p>
        <div class="grid-settings">
          <label>Spacing X (px) <input id="dotGridSpacingX" type="number" min="4" step="1"/></label>
          <label>Spacing Y (px) <input id="dotGridSpacingY" type="number" min="4" step="1"/></label>
          <label>Color <input id="dotGridColor" type="color"/></label>
          <label>Dot size (px) <input id="dotGridDotSize" type="number" min="0.5" step="0.5"/></label>
        </div>
        <div class="modal-buttons">
          <button id="dotGridCancel" type="button" class="modal-btn">Cancel</button>
          <button id="dotGridSave" type="button" class="modal-btn primary">Save</button>
        </div>
      </div>
    </div>
    <div id="crosshairModal" class="modal" hidden>
      <div class="modal-box modal-narrow">
        <h3>Crosshair</h3>
        <p class="modal-hint">Shown while the pointer is over the form — it crosses on the control's top-left corner while moving and on the drag handle while resizing. Settings apply to every form (global).</p>
        <div class="grid-settings">
          <label>Length
            <span class="ch-seg">
              <button id="chModeShort" type="button" class="ch-seg-btn active">Short</button>
              <button id="chModeLong" type="button" class="ch-seg-btn">Long</button>
            </span>
          </label>
          <label>Short length (px) <input id="chShortLength" type="number" min="6" step="1"/></label>
          <label>Thickness (px) <input id="chThickness" type="number" min="1" max="12" step="1"/></label>
          <label>Opacity (%) <input id="chOpacity" type="number" min="0" max="100" step="1"/></label>
          <label>Colour <input id="chColor" type="color"/></label>
        </div>
        <div class="modal-buttons">
          <button id="crosshairCancel" type="button" class="modal-btn">Cancel</button>
          <button id="crosshairSave" type="button" class="modal-btn primary">Save</button>
        </div>
      </div>
    </div>
  </div>
  <script src="${jsUri}"></script>
</body>
</html>`;
    }
}
