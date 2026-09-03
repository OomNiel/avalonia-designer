import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { XamlModel, localName, SINGLE_CONTENT_TAGS } from './xamlModel';
import { PreviewerHostManager, FrameResult, HostControlInfo, ShapeHandle } from './hostClient';
import { createNewForm } from './newForm';
import { propertyDefsFor, opacityToXaml, defaultFor, THEME_COLOR_KEYS } from './propertyCatalog';
import { defaultEventFor, hasDefaultEvent, insertHandlerIntoCodeBehind, insertStatusDateClock, removeHandlersFromCodeBehind, renameControlInCodeBehind, syncVbAccessors, namedControlsInAxaml, findCodeBehindFile, convertCodeBehindToChrome, findItemsSourceBinding, bindControlToAsset, bindControlToDataSet, unbindControlFromDataSet, removeItemsSourceBinding, DataSetBindingRef } from './codeBehind';
import { controlInfoFor } from './controlInfo';
import { findProject, ProjectInfo } from './projectParser';
import { listAssets, Asset } from './assetCatalog';
import { ensureDataGridAutoGenerateColumns } from './dataSetEditor';
import { parseDataSet, serializeDataSet, DataSetSpec, DataTableSpec } from './dataSetModel';
import { generateCs, generateVb, generateXsd } from './dataSetGenerator';

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

function dataSetBindingFor(projectFolder: string, controlName: string | null | undefined): { value: string; readOnly: boolean; desc: string; undoRedoDepth: number; adsetPath: string; tableName: string } | undefined {
    const b = findBoundTable(projectFolder, controlName);
    if (!b) return undefined;
    return {
        value: `${b.spec.name}.${b.table.name}`,
        readOnly: true,
        desc: `Bound to ${b.spec.name}.${b.table.name} in code-behind (${controlName}.ItemsSource = ...). Use the DataSet designer to un-bind or change it.`,
        undoRedoDepth: b.table.undoRedoDepth ?? 5,
        adsetPath: b.adsetPath,
        tableName: b.table.name
    };
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
    'Border', 'ScrollViewer', 'UserControl', 'Window', 'TabItem', 'ContentControl'
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
function ensureDockPanelParent(model: XamlModel, el: Element): Element {
    const parent = el.parentNode as Element | null;
    if (parent && localName(parent.tagName) === 'DockPanel') return parent;

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

    constructor(private readonly context: vscode.ExtensionContext, private readonly host: PreviewerHostManager) {
        // Reload the designer when the .axaml changes on disk (e.g. edited in the
        // text editor), unless we have unsaved designer edits pending.
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument((e) => {
                const key = e.document.uri.toString();
                if (!key.endsWith('.axaml')) return;
                const panel = this.panels.get(key);
                const doc = this.docs.get(key);
                if (!panel || !doc || doc.dirty) return;
                try {
                    doc.model = new XamlModel(e.document.getText());
                    void this.render(doc, panel);
                } catch {
                    /* keep old model if the file is temporarily invalid */
                }
            })
        );
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
        });
        webviewPanel.onDidDispose(() => {
            this.panels.delete(key);
            this.docs.delete(key);
            this.frames.delete(key);
            this.history.delete(key);
            if (this.lastActivePanel === webviewPanel) this.lastActivePanel = undefined;
        });
        webviewPanel.webview.onDidReceiveMessage((msg) => void this.handleMessage(document, webviewPanel, msg));
    }

    private async handleMessage(doc: DesignerDocument, panel: vscode.WebviewPanel, msg: any): Promise<void> {
        try {
            switch (msg.type) {
                case 'ready': {
                    this.ensureHistory(doc);
                    await this.postStatus(panel, 'Starting previewer host...');
                    try {
                        await this.host.getClient();
                        await this.render(doc, panel);
                        await this.syncAccessors(doc);
                    } catch (e) {
                        await this.postStatus(panel, `Previewer host error: ${e instanceof Error ? e.message : String(e)}`);
                    }
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
                    await this.sendProperties(doc, panel, msg.name);
                    return;
                }
                case 'deselect': {
                    await panel.webview.postMessage({ type: 'properties', properties: null });
                    return;
                }
                case 'setProperty': {
                    const el = msg.name ? doc.model.findByName(msg.name) : doc.model.root;
                    if (!el || msg.key === '__type__') return;
                    // The structural Body canvas / root layout panel must keep its name (the lock
                    // and the layout logic both rely on it).
                    if (msg.key === '__name__' && isLockedStructure(doc.model, el.getAttribute('x:Name') || el.getAttribute('Name') || '')) {
                        void vscode.window.showInformationMessage(`The ${lockedLabel(doc.model, el.getAttribute('x:Name') || el.getAttribute('Name') || '')} is locked — it can\'t be renamed.`);
                        await this.sendProperties(doc, panel, msg.name ?? null);
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
                                if (parent && localName(parent.tagName) === 'DockPanel') {
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
                        xaml = replaceFragmentName(snip.xaml, snip.name, unique);
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
                    // Generate the code-behind immediately: wire the control's default event
                    // handler (creating the code-behind file if needed) right after placement,
                    // instead of waiting for a middle-click. Middle-click now just opens it.
                    if (placedEl && hasDefaultEvent(localName(placedEl.tagName))) {
                        try { await this.wireDefaultHandler(doc, panel, placedEl, name, false); }
                        catch { /* best-effort — code-behind wiring must not fail the placement */ }
                    }
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    await panel.webview.postMessage({ type: 'selectControl', name });
                    return;
                }
                case 'move': {
                    const el = doc.model.findByName(msg.name);
                    if (!el || isLockedStructure(doc.model, msg.name)) return;
                    const before = doc.model.serialize(true);
                    const bounds = this.boundsOf(doc, msg.name) ?? { x: 0, y: 0, width: 0, height: 0 };
                    doc.model.move(el, msg.dx ?? 0, msg.dy ?? 0, bounds);
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
                    return;
                }
                case 'resize': {
                    const el = doc.model.findByName(msg.name);
                    if (!el || isLockedStructure(doc.model, msg.name)) return;
                    const before = doc.model.serialize(true);
                    const bounds = this.boundsOf(doc, msg.name) ?? { x: 0, y: 0, width: 0, height: 0 };
                    doc.model.resize(el, msg.dx ?? 0, msg.dy ?? 0, bounds, msg.corner ?? 'se');
                    this.notifyEdit(doc, panel, before);
                    await this.render(doc, panel);
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
                    // Collect event-handler attrs from the element AND all its descendants,
                    // so deleting a container also cleans up child controls' handlers.
                    const handlers = doc.model.eventHandlersOfSubtree(el);
                    const ctrlName = el.getAttribute('x:Name') || el.getAttribute('Name') || '';
                    doc.model.remove(el);
                    // Drop the deleted control's colour backup too.
                    await this.deleteThemeBackup(doc, ctrlName);
                    // Remove any code-behind binding (DataSet table or asset) for the deleted control.
                    await this.cleanupControlBindings(doc, el, ctrlName);
                    // Remove code-behind stubs that no control references any more.
                    const stale = [...new Set(handlers.filter((h) => !doc.model.hasHandler(h)))];
                    if (stale.length > 0) await removeHandlersFromCodeBehind(doc.uri, stale);
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
                    clipboard = {
                        name: el.getAttribute('x:Name') || el.getAttribute('Name') || '',
                        xaml: doc.model.elementXaml(el)
                    };
                    doc.model.remove(el);
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
                    for (const n of names) {
                        if (n === anchor) continue;
                        const el = doc.model.findByName(n);
                        if (!el) continue;
                        if (isLockedStructure(doc.model, n)) continue;
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
                    // Items Source asset picker: list the project's bindable assets (arrays /
                    // collections in code + DataSet tables), then write the binding into code-behind
                    // (or route to the DataSet bind path for a table).
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
                    const formClass = (doc.model.root.getAttribute('x:Class') || '').split('.').pop() || '';
                    const assets = listAssets(projectFolder, formClass);
                    const current = findItemsSourceBinding(doc.uri, ctrlName);
                    const items: vscode.QuickPickItem[] = [];
                    if (current) {
                        items.push({
                            label: '$(close) Clear Items Source binding',
                            description: `currently ${ctrlName}.ItemsSource = ${current}`,
                            alwaysShow: true
                        });
                    }
                    for (const a of assets) {
                        items.push({
                            label: a.label,
                            description: a.detail,
                            detail: a.kind === 'code' ? `writes ${ctrlName}.ItemsSource = ${a.value}` : `binds ${ctrlName}.ItemsSource to this table`
                        });
                    }
                    const picked = await vscode.window.showQuickPick(items, {
                        title: `Items Source for ${ctrlName}`,
                        placeHolder: 'Pick a collection or DataSet table to bind (escape to cancel)'
                    });
                    if (!picked) return;
                    const idx = items.indexOf(picked);
                    if (idx === 0 && current) {
                        await removeItemsSourceBinding(doc.uri, ctrlName);
                        void vscode.window.showInformationMessage(`Cleared the Items Source binding on ${ctrlName}.`);
                        await this.sendProperties(doc, panel, msg.name ?? null);
                        return;
                    }
                    const asset = assets[idx - (current ? 1 : 0)];
                    if (!asset) return;
                    if (asset.kind === 'code') {
                        const filePath = await bindControlToAsset(doc.uri, ctrlName, asset.value);
                        if (filePath) {
                            void vscode.window.showInformationMessage(`Bound ${ctrlName}.ItemsSource = ${asset.value} (${path.basename(filePath)}).`);
                        } else {
                            void vscode.window.showErrorMessage(`Could not write the code-behind for ${ctrlName}.`);
                        }
                    } else {
                        await this.bindDataSetAsset(doc, proj, ctrlName, localName(el.tagName), asset);
                    }
                    await this.sendProperties(doc, panel, msg.name ?? null);
                    return;
                }
                case 'undo':
                case 'redo': {
                    await this.undoRedo(doc, panel, msg.type === 'redo', msg.name);
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
        const size = this.designSize(doc.model.root);
        const proj = findProject(doc.uri);
        const frame = await host.render(
            xaml, size.width, size.height,
            proj ? path.dirname(proj.projectUri.fsPath) : undefined
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
                locked: isLockedStructure(doc.model, c.name),
                handles: this.shapeHandlesFor(doc, c),
                zIndex: el ? (parseInt(el.getAttribute('ZIndex') || '0', 10) || 0) : 0
            };
        });
        // The form's own title (Window Title / ChromeWindow TitleBarTitle) — the webview labels
        // the form entry in its control drop-down "Form - <Title>" so the user can select the
        // form itself and edit its size/title in the Properties panel.
        const rootEl = doc.model.root;
        const formTitle = (rootEl.getAttribute('Title') || rootEl.getAttribute('TitleBarTitle') || '').trim();
        await panel.webview.postMessage({
            type: 'frame', ...frame, controls, formTitle,
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

    /** Binds a DataSet table asset picked in the form designer (reuses the DataSet bind path:
     *  code-behind ItemsSource + .adset boundTo marker + regenerate the generated class). */
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
            const b: DataSetBindingRef = {
                datasetName: asset.datasetName, tableName: asset.tableName, controlName: ctrlName,
                controlType: controlType as DataSetBindingRef['controlType']
            };
            const filePath = await bindControlToDataSet(doc.uri, b);
            if (!filePath) { void vscode.window.showErrorMessage(`Could not write the code-behind for ${ctrlName}.`); return; }
            if (controlType === 'DataGrid') ensureDataGridAutoGenerateColumns(doc.uri.fsPath, ctrlName);
            // VB: named controls are not auto-generated fields — ensure the FindControl accessor
            // exists (defensive; the form designer normally syncs these when a control is placed).
            if (proj.language === 'vb') await syncVbAccessors(doc.uri, namedControlsInAxaml(doc.uri));
            if (t.boundTo !== ctrlName) {
                t.boundTo = ctrlName;
                t.boundToType = controlType as DataTableSpec['boundToType'];
                fs.writeFileSync(asset.adsetPath, serializeDataSet(spec), 'utf8');
                const gen = this.writeGeneratedFilesFor(proj, asset.adsetPath, spec);
                void vscode.window.showInformationMessage(`Bound ${asset.tableName} to ${ctrlName} (${path.basename(filePath)})${gen ? `; regenerated ${gen}.` : ''}.`);
            } else {
                void vscode.window.showInformationMessage(`Re-wrote the binding of ${asset.tableName} to ${ctrlName}.`);
            }
        } catch (e) {
            void vscode.window.showErrorMessage(`Could not bind ${asset.tableName}: ${e instanceof Error ? e.message : String(e)}`);
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
        const projectFolder = path.dirname(proj.projectUri.fsPath);
        const b = findBoundTable(projectFolder, ctrlName);
        if (b) {
            // DataSet-bound control: strip the code-behind binding + typed property (and the
            // DataGrid's Wire/field), clear the .adset boundTo marker, and regenerate MyData
            // so the now-unbound table loses its sample-row / binding support.
            await unbindControlFromDataSet(doc.uri, {
                datasetName: b.spec.name, tableName: b.table.name, controlName: ctrlName,
                controlType: localName(el.tagName) as DataSetBindingRef['controlType']
            });
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
            return;
        }
        if (findItemsSourceBinding(doc.uri, ctrlName)) {
            await removeItemsSourceBinding(doc.uri, ctrlName);
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
        const msg: any = {
            type: 'properties',
            name: ctrlName,
            properties: propertyDefsFor(el, this.effectiveFor(doc, name), itemSourceOverride, undoRedoOverride, this.isAutoSizeOff(doc, ctrlName)),
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
        await panel.webview.postMessage(msg);
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

    /** Keeps VB code-behind named-control accessors in sync with the XAML. */
    private async syncAccessors(doc: DesignerDocument): Promise<void> {
        await syncVbAccessors(doc.uri, doc.model.namedControls());
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

    async saveCustomDocument(document: DesignerDocument): Promise<void> {
        const text = document.model.serialize(true);
        await vscode.workspace.fs.writeFile(document.uri, Buffer.from(text, 'utf8'));
        document.markSaved();
    }

    async saveCustomDocumentAs(document: DesignerDocument, destination: vscode.Uri): Promise<void> {
        const text = document.model.serialize(true);
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
        const data = Buffer.from(document.model.serialize(true), 'utf8');
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

    /**
     * Wires the control's default event into the XAML (e.g. `Click="Button1_Click"`) and
     * inserts the handler stub into the code-behind. When `openEditor` is true (middle-click)
     * it also opens the code-behind with the cursor placed in the handler body.
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

        // Insert the code-behind stub FIRST so we never persist a XAML event that has no method.
        if (el.getAttribute(eventName) === handler) {
            if (openEditor) {
                const result = await insertHandlerIntoCodeBehind(doc.uri, handler, eventName);
                if (result) await this.openCodeBehindAt(result);
            }
            return;
        }
        const result = await insertHandlerIntoCodeBehind(doc.uri, handler, eventName);
        if (!result) {
            if (openEditor) {
                void vscode.window.showInformationMessage(
                    `No code-behind file found for ${path.basename(doc.uri.fsPath)} and none could be created.`
                );
            }
            return;
        }

        el.setAttribute(eventName, handler);
        await vscode.workspace.fs.writeFile(doc.uri, Buffer.from(doc.model.serialize(true), 'utf8'));
        doc.markSaved();
        if (promoted) await this.render(doc, panel);

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

    /** Middle-click a control: wire the default event and open the code-behind at the handler. */
    private async openEventHandler(doc: DesignerDocument, panel: vscode.WebviewPanel, name: string): Promise<void> {
        const el = doc.model.findByName(name);
        if (!el || el === doc.model.root) return;
        await this.wireDefaultHandler(doc, panel, el, name, true);
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
      <button id="btnNewForm" title="Create a new Avalonia form">+ New Form</button>
      <span class="sep"></span>
      <button id="btnZoomOut" title="Zoom out">−</button>
      <input id="zoomValue" readonly value="100%"/>
      <button id="btnZoomIn" title="Zoom in">+</button>
      <button id="btnFit" title="Fit to window">Fit</button>
      <span class="sep"></span>
      <button id="btnDotGrid" title="Toggle the dot grid on the design surface">Grid</button>
      <button id="btnSnapGrid" title="Toggle snap-to-grid when moving/resizing">Snap</button>
      <button id="btnGridSettings" title="Dot grid settings (spacing, color, dot size)">Grid…</button>
      <span class="sep"></span>
      <button id="btnCrosshair" title="Crosshair settings (thickness, colour, opacity, length)">Crosshair</button>
      <span class="sep"></span>
      <button id="btnAlignLeft" title="Align left edges to the first-selected control" disabled>⇤</button>
      <button id="btnAlignCentre" title="Align horizontal centres to the first-selected control" disabled>↔</button>
      <button id="btnAlignRight" title="Align right edges to the first-selected control" disabled>⇥</button>
      <button id="btnAlignTop" title="Align top edges to the first-selected control" disabled>⇡</button>
      <button id="btnAlignMiddle" title="Align vertical centres to the first-selected control" disabled>↕</button>
      <button id="btnAlignBottom" title="Align bottom edges to the first-selected control" disabled>⇣</button>
      <button id="btnAlignText" title="Centre the text horizontally in the selected text controls" disabled>Aa</button>
      <button id="btnSameWidth" title="Make every selected control the same WIDTH as the first-selected control" disabled>⇔</button>
      <button id="btnSameHeight" title="Make every selected control the same HEIGHT as the first-selected control" disabled>⇕</button>
      <span id="status">Ready</span>
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
          <div id="multiSel"></div>
          <div id="marquee" hidden></div>
          <div id="radiusGuide" hidden></div>
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
      <button id="ctxDelete">Delete</button>
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
