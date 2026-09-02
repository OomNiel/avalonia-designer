import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DOMParser } from '@xmldom/xmldom';
import { localName } from './xamlModel';
import { bindControlToDataSet, unbindControlFromDataSet, hasDataSetBinding, DataSetBindingRef } from './codeBehind';
import {
    DataSetSpec, DataTableSpec, parseDataSet, serializeDataSet, defaultDataSetSpec,
    isValidIdentifier, findTable, newTableSpec, newColumnSpec, COLUMN_TYPES
} from './dataSetModel';
import { generateCs, generateVb, generateXsd } from './dataSetGenerator';
import { findProject } from './projectParser';

/** Control types that can display a DataSet table (they take an ItemsSource). */
const BINDABLE_TAGS = new Set(['DataGrid', 'ListBox', 'ComboBox', 'ItemsControl']);

/** Recursively lists files under `dir` (skipping build/ignore folders). */
function walkProject(dir: string, out: string[]): void {
    let entries: string[] = [];
    try { entries = fs.readdirSync(dir); } catch { return; }
    for (const e of entries) {
        if (e === 'bin' || e === 'obj' || e === 'node_modules' || e === '.git' || e === '.vscode' || e.startsWith('.')) continue;
        const p = path.join(dir, e);
        let st;
        try { st = fs.statSync(p); } catch { continue; }
        if (st.isDirectory()) walkProject(p, out);
        else if (/\.axaml$/i.test(e)) out.push(p);
    }
}

interface ScannedControl { name: string; type: string; axamlPath: string; }

/**
 * Avalonia's DataGrid defaults AutoGenerateColumns to FALSE, so a bound DataGrid would show no
 * columns/headers/rows. When binding to a DataGrid, make sure the XAML element carries
 * AutoGenerateColumns="True" (idempotent; respects an explicit False). Edits the .axaml in place.
 */
export function ensureDataGridAutoGenerateColumns(axamlPath: string, controlName: string): boolean {
    let text = '';
    try { text = fs.readFileSync(axamlPath, 'utf8'); } catch { return false; }
    const esc = controlName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`<((?:dg:)?DataGrid)\\b(?=[^>]*x:Name\\s*=\\s*["']${esc}["'])(?![^>]*\\bAutoGenerateColumns\\b)([^>]*?)(/?)>`, 'i');
    const updated = text.replace(re, (_m, tag: string, attrs: string, selfClose: string) =>
        `<${tag} AutoGenerateColumns="True"${attrs}${selfClose ? '/' : ''}>`);
    if (updated === text) return false;
    fs.writeFileSync(axamlPath, updated, 'utf8');
    return true;
}

/** Finds every named bindable control in the project's .axaml files. */
function scanBindableControls(projectFolder: string): ScannedControl[] {
    const files: string[] = [];
    walkProject(projectFolder, files);
    const out: ScannedControl[] = [];
    const parser = new DOMParser();
    for (const f of files) {
        let text = '';
        try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
        let doc: any;
        try { doc = parser.parseFromString(text, 'text/xml'); } catch { continue; }
        if (!doc || !doc.documentElement) continue;
        const walk = (el: Element): void => {
            const ln = localName(el.tagName);
            if (ln.includes('.')) { for (const c of Array.from(el.childNodes)) if (c.nodeType === 1) walk(c as Element); return; }
            if (BINDABLE_TAGS.has(ln)) {
                const n = el.getAttribute('x:Name') || el.getAttribute('Name');
                if (n) out.push({ name: n, type: ln, axamlPath: f });
            }
            for (const c of Array.from(el.childNodes)) if (c.nodeType === 1) walk(c as Element);
        };
        walk(doc.documentElement);
    }
    return out;
}

/**
 * Collects every control name already bound to a dataset — this spec plus all other
 * .adset files in the project — so the dropdown can mark them with '*'.
 */
function scanBoundMarkers(projectFolder: string, current: DataSetSpec): Set<string> {
    const markers = new Set<string>();
    for (const t of current.tables) if (t.boundTo) markers.add(t.boundTo);
    const files: string[] = [];
    walkProject(projectFolder, files);
    for (const f of files) {
        if (!/\.adset$/i.test(f)) continue;
        let text = '';
        try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
        try {
            for (const t of parseDataSet(text).tables) if (t.boundTo) markers.add(t.boundTo);
        } catch { /* ignore */ }
    }
    return markers;
}

/**
 * In-memory .adset document. The DataSetSpec (JSON) is the source of truth; the
 * webview only renders it.
 */
export class DataSetDocument implements vscode.CustomDocument {
    spec: DataSetSpec;
    readonly uri: vscode.Uri;
    private savedJson: string;

    private constructor(uri: vscode.Uri, spec: DataSetSpec) {
        this.uri = uri;
        this.spec = spec;
        this.savedJson = serializeDataSet(spec);
    }

    static async create(uri: vscode.Uri): Promise<DataSetDocument> {
        const data = await vscode.workspace.fs.readFile(uri);
        return new DataSetDocument(uri, parseDataSet(Buffer.from(data).toString('utf8')));
    }

    get dirty(): boolean { return serializeDataSet(this.spec) !== this.savedJson; }
    markSaved(): void { this.savedJson = serializeDataSet(this.spec); }
    dispose(): void { /* nothing to clean up */ }
}

/**
 * Custom editor for `*.adset` files — a visual DataSet schema designer
 * (runtime-construction DataSets, not strongly-typed codegen).
 */
export class DataSetEditorProvider implements vscode.CustomEditorProvider<DataSetDocument> {
    static readonly viewType = 'avaloniaDesigner.dataSetDesigner';

    private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<DataSetDocument>>();
    readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

    private readonly panels = new Map<string, vscode.WebviewPanel>();
    private readonly docs = new Map<string, DataSetDocument>();
    /** Undo/redo history: 5 levels deep = up to 6 serialized-spec snapshots (current + 5 prior). */
    private readonly history = new Map<string, { states: string[]; index: number }>();

    constructor(private readonly context: vscode.ExtensionContext) { }

    async openCustomDocument(uri: vscode.Uri): Promise<DataSetDocument> {
        const doc = await DataSetDocument.create(uri);
        this.docs.set(uri.toString(), doc);
        return doc;
    }

    async resolveCustomEditor(document: DataSetDocument, webviewPanel: vscode.WebviewPanel): Promise<void> {
        const key = document.uri.toString();
        this.panels.set(key, webviewPanel);

        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };
        webviewPanel.webview.html = this.webviewHtml(webviewPanel.webview);

        webviewPanel.onDidDispose(() => {
            this.panels.delete(key);
            this.docs.delete(key);
            this.history.delete(key);
        });
        webviewPanel.webview.onDidReceiveMessage((msg) => void this.handleMessage(document, webviewPanel, msg));
    }

    // ---------------------------------------------------------------- messages
    private async handleMessage(doc: DataSetDocument, panel: vscode.WebviewPanel, msg: any): Promise<void> {
        const before = serializeDataSet(doc.spec);
        try {
            switch (msg.type) {
                case 'ready':
                    if (!this.history.has(doc.uri.toString())) {
                        this.history.set(doc.uri.toString(), { states: [serializeDataSet(doc.spec)], index: 0 });
                    }
                    await this.postState(doc, panel);
                    return;

                case 'undo':
                case 'redo':
                    await this.undoRedo(doc, panel, msg.type === 'redo');
                    return;

                case 'setName': {
                    const v = typeof msg.name === 'string' ? msg.name.trim() : '';
                    if (v && v !== doc.spec.name) {
                        if (isValidIdentifier(v)) { doc.spec.name = v; this.notifyEdit(doc, panel, before); }
                        else await this.postStatus(panel, 'The DataSet name must be a single word (letters/numbers/underscore).');
                    }
                    await this.postState(doc, panel);
                    return;
                }

                case 'setTableName': {
                    const t = findTable(doc.spec, String(msg.oldName ?? ''));
                    const v = typeof msg.name === 'string' ? msg.name.trim() : '';
                    if (t && v && v !== t.name) {
                        if (!isValidIdentifier(v)) {
                            await this.postStatus(panel, 'The table name must be a single word (letters/numbers/underscore).');
                        } else if (findTable(doc.spec, v)) {
                            await this.postStatus(panel, `A table named "${v}" already exists.`);
                        } else {
                            t.name = v;
                            this.notifyEdit(doc, panel, before);
                        }
                    }
                    await this.postState(doc, panel);
                    return;
                }

                case 'setColumnProp': {
                    const t = findTable(doc.spec, String(msg.table ?? ''));
                    const c = t?.columns.find((x) => x.name === String(msg.column ?? ''));
                    if (t && c) {
                        const prop = String(msg.prop ?? '');
                        if (prop === 'name') {
                            const v = typeof msg.value === 'string' ? msg.value.trim() : '';
                            if (v && v !== c.name) {
                                if (!isValidIdentifier(v)) {
                                    await this.postStatus(panel, 'The column name must be a single word (letters/numbers/underscore).');
                                } else if (t.columns.some((x) => x.name === v)) {
                                    await this.postStatus(panel, `A column named "${v}" already exists in ${t.name}.`);
                                } else {
                                    c.name = v;
                                    this.notifyEdit(doc, panel, before);
                                }
                            }
                        } else if (prop === 'caption') {
                            c.caption = String(msg.value ?? '');
                            this.notifyEdit(doc, panel, before);
                        } else if (prop === 'type') {
                            const v = String(msg.value ?? '');
                            if ((COLUMN_TYPES as string[]).includes(v)) {
                                c.type = v as DataSetSpec['tables'][number]['columns'][number]['type'];
                                this.notifyEdit(doc, panel, before);
                            }
                        } else if (prop === 'allowNull') {
                            c.allowNull = msg.value !== false;
                            this.notifyEdit(doc, panel, before);
                        } else if (prop === 'sampleValue') {
                            const v = String(msg.value ?? '');
                            c.sampleValue = v ? v : null;
                            this.notifyEdit(doc, panel, before);
                        }
                    }
                    await this.postState(doc, panel);
                    return;
                }

                case 'addTable': {
                    const t = newTableSpec(doc.spec);
                    t.x = typeof msg.x === 'number' ? Math.max(0, Math.round(msg.x)) : 40;
                    t.y = typeof msg.y === 'number' ? Math.max(0, Math.round(msg.y)) : 40;
                    doc.spec.tables.push(t);
                    this.notifyEdit(doc, panel, before);
                    await this.postState(doc, panel);
                    return;
                }

                case 'addColumn': {
                    const t = findTable(doc.spec, String(msg.table ?? ''));
                    if (t) {
                        t.columns.push(newColumnSpec(t));
                        this.notifyEdit(doc, panel, before);
                    }
                    await this.postState(doc, panel);
                    return;
                }

                case 'removeTable': {
                    const idx = doc.spec.tables.findIndex((x) => x.name === String(msg.name ?? ''));
                    if (idx >= 0) {
                        doc.spec.tables.splice(idx, 1);
                        this.notifyEdit(doc, panel, before);
                    }
                    await this.postState(doc, panel);
                    return;
                }

                case 'removeColumn': {
                    const t = findTable(doc.spec, String(msg.table ?? ''));
                    if (t) {
                        if (t.columns.length <= 1) {
                            await this.postStatus(panel, 'A table needs at least one column.');
                        } else {
                            const idx = t.columns.findIndex((x) => x.name === String(msg.column ?? ''));
                            if (idx >= 0) { t.columns.splice(idx, 1); this.notifyEdit(doc, panel, before); }
                        }
                    }
                    await this.postState(doc, panel);
                    return;
                }

                case 'moveTable': {
                    const t = findTable(doc.spec, String(msg.name ?? ''));
                    if (t) {
                        t.x = typeof msg.x === 'number' ? Math.max(0, Math.round(msg.x)) : t.x;
                        t.y = typeof msg.y === 'number' ? Math.max(0, Math.round(msg.y)) : t.y;
                        this.notifyEdit(doc, panel, before);
                    }
                    await this.postState(doc, panel);
                    return;
                }

                case 'bind': {
                    const t = findTable(doc.spec, String(msg.table ?? ''));
                    const control = String(msg.control ?? '');
                    if (t && control) {
                        const proj = findProject(doc.uri);
                        const scanned = proj ? scanBindableControls(path.dirname(proj.projectUri.fsPath)) : [];
                        const ctrl = scanned.find((c) => c.name === control);
                        const axaml = ctrl?.axamlPath;
                        if (!axaml) {
                            await this.postStatus(panel, `Couldn't find control "${control}" in the project.`);
                        } else if (t.boundTo === control) {
                            // The .adset marker is set, but the code-behind binding line may be
                            // missing (e.g. the project was recreated after binding). Re-write it
                            // so the binding actually takes effect instead of just saying "already bound".
                            const b = { datasetName: doc.spec.name, tableName: t.name, controlName: control, controlType: ctrl.type as DataSetBindingRef['controlType'] };
                            if (!hasDataSetBinding(vscode.Uri.file(axaml), b)) {
                                await bindControlToDataSet(vscode.Uri.file(axaml), b);
                                if (ctrl.type === 'DataGrid') ensureDataGridAutoGenerateColumns(axaml, control);
                                await this.postStatus(panel, `Re-wrote the binding to ${control} (the code-behind line was missing).`);
                            } else {
                                await this.postStatus(panel, `Already bound to ${control}.`);
                            }
                        } else {
                            // A control already claimed by another table/dataset can't be re-bound.
                            const claimedElsewhere = proj
                                ? scanBoundMarkers(path.dirname(proj.projectUri.fsPath), doc.spec).has(control)
                                : false;
                            if (claimedElsewhere) {
                                await this.postStatus(panel, `"${control}" is already bound to another table — un-bind it there first.`);
                            } else {
                                const filePath = await bindControlToDataSet(vscode.Uri.file(axaml), {
                                    datasetName: doc.spec.name, tableName: t.name, controlName: control, controlType: ctrl.type as DataSetBindingRef['controlType']
                                });
                                if (filePath) {
                                    t.boundTo = control;
                                    t.boundToType = ctrl.type as DataTableSpec['boundToType'];
                                    // DataGrid: AutoGenerateColumns defaults to False in Avalonia, so make
                                    // sure the XAML carries it, or the bound grid shows no columns/rows.
                                    if (ctrl.type === 'DataGrid') ensureDataGridAutoGenerateColumns(axaml, control);
                                    // Regenerate the DataSet class so the newly bound table gets its sample row.
                                    const gen = await this.writeGeneratedFiles(doc);
                                    this.notifyEdit(doc, panel, before);
                                    await this.postStatus(panel, `Bound ${t.name} to ${control} (${path.basename(filePath)})${gen ? `; regenerated ${gen}.` : ''}`);
                                } else {
                                    await this.postStatus(panel, `Couldn't write the code-behind for ${control}.`);
                                }
                            }
                        }
                    }
                    await this.postState(doc, panel);
                    return;
                }

                case 'unbind': {
                    const t = findTable(doc.spec, String(msg.table ?? ''));
                    if (t && t.boundTo) {
                        const control = t.boundTo;
                        const proj = findProject(doc.uri);
                        const scanned = proj ? scanBindableControls(path.dirname(proj.projectUri.fsPath)) : [];
                        const ctrl = scanned.find((c) => c.name === control);
                        const axaml = ctrl?.axamlPath;
                        if (axaml) {
                            await unbindControlFromDataSet(vscode.Uri.file(axaml), {
                                datasetName: doc.spec.name, tableName: t.name, controlName: control, controlType: ctrl.type as DataSetBindingRef['controlType']
                            });
                        }
                        t.boundTo = null;
                        t.boundToType = null;
                        // Regenerate the DataSet class so the un-bound table loses its sample row.
                        const gen = await this.writeGeneratedFiles(doc);
                        this.notifyEdit(doc, panel, before);
                        await this.postStatus(panel, `Un-bound ${t.name}.${gen ? ` Regenerated ${gen}.` : ''}`);
                    }
                    await this.postState(doc, panel);
                    return;
                }

                case 'generate': {
                    await this.generateCode(doc, panel);
                    return;
                }
            }
        } catch (err) {
            void vscode.window.showErrorMessage('DataSet designer error: ' + (err instanceof Error ? err.message : String(err)));
        }
    }

    private notifyEdit(doc: DataSetDocument, panel: vscode.WebviewPanel, before: string): void {
        const after = serializeDataSet(doc.spec);
        if (before === after) return;
        this.pushHistory(doc, after);
        this._onDidChangeCustomDocument.fire({
            document: doc,
            label: 'DataSet designer edit',
            undo: () => { doc.spec = parseDataSet(before); void this.postState(doc, panel); },
            redo: () => { doc.spec = parseDataSet(after); void this.postState(doc, panel); }
        });
    }

    /** Records a new post-edit spec state (drops the redo branch, caps at 6 states = 5 undos). */
    private pushHistory(doc: DataSetDocument, specText: string): void {
        const key = doc.uri.toString();
        const h = this.history.get(key) ?? { states: [], index: -1 };
        h.states.length = h.index + 1; // drop redo branch
        h.states.push(specText);
        if (h.states.length > 6) h.states.shift();
        h.index = h.states.length - 1;
        this.history.set(key, h);
    }

    /** Undo / redo: restore a serialized-spec snapshot and repaint the designer. */
    private async undoRedo(doc: DataSetDocument, panel: vscode.WebviewPanel, isRedo: boolean): Promise<void> {
        const h = this.history.get(doc.uri.toString());
        if (!h || h.states.length === 0) return;
        const target = isRedo ? h.index + 1 : h.index - 1;
        if (target < 0 || target >= h.states.length) return;
        h.index = target;
        doc.spec = parseDataSet(h.states[target]);
        await this.postState(doc, panel);
    }

    /** The project's bindable controls, each flagged `bound` if any dataset claims it. */
    private controlsList(doc: DataSetDocument): { name: string; type: string; bound: boolean }[] {
        const proj = findProject(doc.uri);
        if (!proj) return [];
        const folder = path.dirname(proj.projectUri.fsPath);
        const controls = scanBindableControls(folder);
        const markers = scanBoundMarkers(folder, doc.spec);
        return controls.map((c) => ({ name: c.name, type: c.type, bound: markers.has(c.name) }));
    }

    private async postState(doc: DataSetDocument, panel: vscode.WebviewPanel): Promise<void> {
        await panel.webview.postMessage({ type: 'state', spec: doc.spec, controls: this.controlsList(doc) });
    }

    private async postStatus(panel: vscode.WebviewPanel, message: string): Promise<void> {
        await panel.webview.postMessage({ type: 'status', message });
    }

    // ---------------------------------------------------------------- generate
    /** Writes the runtime-construction class (C#/VB, auto-detected) + .xsd next to the .adset. */
    /** Writes the generated DataSet class (.cs/.vb) + .xsd next to the .adset. Returns the file names, or null on failure. */
    private async writeGeneratedFiles(doc: DataSetDocument): Promise<string | null> {
        const proj = findProject(doc.uri);
        const language = proj?.language ?? 'cs';
        const rootNamespace = proj?.rootNamespace || doc.spec.name;
        const folder = path.dirname(doc.uri.fsPath);
        const base = doc.spec.name;
        const codeUri = vscode.Uri.file(path.join(folder, language === 'vb' ? `${base}.vb` : `${base}.cs`));
        const xsdUri = vscode.Uri.file(path.join(folder, `${base}.xsd`));
        const code = language === 'vb' ? generateVb(doc.spec, rootNamespace) : generateCs(doc.spec, rootNamespace);
        const xsd = generateXsd(doc.spec);
        try {
            await vscode.workspace.fs.writeFile(codeUri, Buffer.from(code, 'utf8'));
            await vscode.workspace.fs.writeFile(xsdUri, Buffer.from(xsd, 'utf8'));
            return [path.basename(codeUri.fsPath), path.basename(xsdUri.fsPath)].join(' + ');
        } catch {
            return null;
        }
    }

    private async generateCode(doc: DataSetDocument, panel: vscode.WebviewPanel): Promise<void> {
        const proj = findProject(doc.uri);
        const language = proj?.language ?? 'cs';
        const names = await this.writeGeneratedFiles(doc);
        if (!names) {
            void vscode.window.showErrorMessage('Could not write the generated files.');
            return;
        }
        await this.postStatus(panel, `Generated ${names}.`);
        const lang = language === 'vb' ? 'VB.NET' : 'C#';
        void vscode.window.showInformationMessage(
            proj
                ? `Generated ${names} (${lang}) next to ${path.basename(doc.uri.fsPath)}.`
                : `Generated ${names} as ${lang} — no .csproj/.vbproj found nearby, so it isn't part of a build yet.`
        );
    }

    // ---------------------------------------------------------------- save etc.
    async saveCustomDocument(document: DataSetDocument): Promise<void> {
        await vscode.workspace.fs.writeFile(document.uri, Buffer.from(serializeDataSet(document.spec), 'utf8'));
        document.markSaved();
    }

    async saveCustomDocumentAs(document: DataSetDocument, destination: vscode.Uri): Promise<void> {
        await vscode.workspace.fs.writeFile(destination, Buffer.from(serializeDataSet(document.spec), 'utf8'));
        document.markSaved();
    }

    async revertCustomDocument(document: DataSetDocument): Promise<void> {
        const data = await vscode.workspace.fs.readFile(document.uri);
        document.spec = parseDataSet(Buffer.from(data).toString('utf8'));
        const panel = this.panels.get(document.uri.toString());
        if (panel) await this.postState(document, panel);
    }

    async backupCustomDocument(document: DataSetDocument, context: vscode.CustomDocumentBackupContext): Promise<vscode.CustomDocumentBackup> {
        const data = Buffer.from(serializeDataSet(document.spec), 'utf8');
        await vscode.workspace.fs.writeFile(context.destination, data);
        return {
            id: context.destination.toString(),
            delete: () => vscode.workspace.fs.delete(context.destination)
        };
    }

    // ---------------------------------------------------------------- webview
    private webviewHtml(wv: vscode.Webview): string {
        const cssUri = wv.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'dataSet.css'));
        const jsUri = wv.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'dataSet.js'));
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
<title>DataSet Designer</title>
</head>
<body>
  <div class="toolbar">
    <span class="brand">DataSet</span>
    <label for="ds-name-input">Name</label>
    <input id="ds-name-input" type="text" spellcheck="false" title="DataSet / generated class name"/>
    <button id="btnAddTable" title="Add a table">+ Table</button>
    <button id="btnGenerate" title="Generate the runtime DataSet class (.cs/.vb) + .xsd">Generate Code</button>
    <span id="status" class="status"></span>
  </div>
  <div class="main">
    <div id="canvas">
      <div class="empty-hint">Right-click the canvas to add a table.</div>
    </div>
    <div id="props"></div>
  </div>
  <div id="ctxmenu"></div>
  <script src="${jsUri}"></script>
</body>
</html>`;
    }
}

/** "Avalonia: New DataSet…" — creates a .adset (with a starter table) and opens it in the designer. */
export async function newDataSet(context: vscode.ExtensionContext): Promise<void> {
    const name = await vscode.window.showInputBox({
        prompt: 'Name of the new DataSet (e.g. MyData) — also the generated class name.',
        value: 'MyData',
        validateInput: (s) => (isValidIdentifier(s.trim()) ? undefined : 'Use letters, numbers and underscore only (no spaces).')
    });
    if (!name) return;
    const clean = name.trim();

    let folder: vscode.Uri | undefined;
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        folder = vscode.workspace.workspaceFolders[0].uri;
    } else {
        const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, openLabel: 'Create DataSet here' });
        folder = picked && picked[0];
    }
    if (!folder) return;

    const uri = vscode.Uri.joinPath(folder, `${clean}.adset`);
    let exists = false;
    try { await vscode.workspace.fs.stat(uri); exists = true; } catch { /* not found */ }

    if (!exists) {
        const spec = defaultDataSetSpec(clean);
        await vscode.workspace.fs.writeFile(uri, Buffer.from(serializeDataSet(spec), 'utf8'));
    }
    void vscode.commands.executeCommand('vscode.openWith', uri, DataSetEditorProvider.viewType, { preview: false });
}

/** Opens an existing .adset in the DataSet designer. */
export async function openDataSet(uri?: vscode.Uri): Promise<void> {
    const target = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!target) return;
    void vscode.commands.executeCommand('vscode.openWith', target, DataSetEditorProvider.viewType);
}
