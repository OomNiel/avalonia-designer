import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { findProject } from './projectParser';

/** Default event per control type; falls back to DoubleTapped (valid on all input controls). */
const DEFAULT_EVENT: Record<string, string> = {
    Button: 'Click',
    CheckBox: 'IsCheckedChanged',
    RadioButton: 'IsCheckedChanged',
    ComboBox: 'SelectionChanged',
    ListBox: 'SelectionChanged',
    TabControl: 'SelectionChanged',
    DataGrid: 'SelectionChanged',
    TextBox: 'TextChanged'
};

/** The event handler VS Code will attach when you middle-click a control of this type. */
export function defaultEventFor(tag: string): string {
    return DEFAULT_EVENT[tag] ?? 'DoubleTapped';
}

/** True if the control type has a specific default event (interactive controls) worth auto-wiring on placement. */
export function hasDefaultEvent(tag: string): boolean {
    return tag in DEFAULT_EVENT;
}

export interface InsertResult {
    filePath: string;
    /** Character offset in the (written) file where the cursor should land. */
    cursorOffset: number;
}

/**
 * Finds (or creates) the code-behind for an .axaml file and inserts the event
 * handler method, then returns the file path and the cursor position.
 */
export async function insertHandlerIntoCodeBehind(
    axamlUri: vscode.Uri,
    handler: string,
    eventName: string
): Promise<InsertResult | undefined> {
    const base = path.basename(axamlUri.fsPath, '.axaml');
    let filePath = findCodeBehindFile(axamlUri);

    // No existing file declares the class -> create a minimal code-behind.
    if (!filePath) {
        const created = await createCodeBehind(axamlUri);
        if (!created) return undefined;
        filePath = findCodeBehindFile(axamlUri);
        if (!filePath) return undefined;
    }

    const language: 'cs' | 'vb' = filePath.toLowerCase().endsWith('.vb') ? 'vb' : 'cs';

    const original = fs.readFileSync(filePath, 'utf8');
    const result = language === 'cs'
        ? insertCsMethod(original, handler, base)
        : insertVbMethod(original, handler, base, eventName);
    if (!result) return undefined;

    if (result.text !== original) {
        fs.writeFileSync(filePath, result.text, 'utf8');
    }
    return { filePath, cursorOffset: result.cursorOffset };
}

/**
 * Finds an existing code-behind file that declares the form's class. Checks the
 * conventional names (`<Name>.axaml.cs|vb`, `<Name>.cs|vb`) and then any sibling
 * .cs/.vb file (the "Avalonia VB Projects" generator declares MainWindow in Program.vb).
 */
export function findCodeBehindFile(axamlUri: vscode.Uri): string | undefined {
    const dir = path.dirname(axamlUri.fsPath);
    const base = path.basename(axamlUri.fsPath, '.axaml');

    const candidates = [
        path.join(dir, `${base}.axaml.cs`),
        path.join(dir, `${base}.axaml.vb`),
        path.join(dir, `${base}.cs`),
        path.join(dir, `${base}.vb`)
    ];
    const existing = candidates.filter((p) => fs.existsSync(p));

    const classRe = new RegExp(`\\bclass\\s+${escapeRe(base)}\\b`, 'i');
    const declaresClass = (p: string): boolean => {
        try { return classRe.test(fs.readFileSync(p, 'utf8')); } catch { return false; }
    };

    // 1) Convention-named file that declares the class (avoids a duplicate class).
    const conventionalDeclaring = existing.find(declaresClass);
    if (conventionalDeclaring) return conventionalDeclaring;

    // 2) Any sibling .cs/.vb file that declares the class (e.g. MainWindow in Program.vb).
    let siblings: string[] = [];
    try { siblings = fs.readdirSync(dir); } catch { /* ignore */ }
    return siblings
        .filter((f) => /\.(cs|vb)$/i.test(f))
        .map((f) => path.join(dir, f))
        .find(declaresClass)
        ?? existing[0];
}

/**
 * Changes a Window-rooted form's code-behind base class to `AvaloniaChrome.ChromeWindow`
 * (used by the "Custom Title Bar" toolbox tool). Fully-qualifies the base in BOTH languages —
 * a VB global-namespace class must NOT `Imports AvaloniaChrome` (BC40056/BC30002 gotcha); it
 * has to write `Inherits AvaloniaChrome.ChromeWindow` fully qualified.
 */
export async function convertCodeBehindToChrome(axamlUri: vscode.Uri): Promise<void> {
    const filePath = findCodeBehindFile(axamlUri);
    if (!filePath) return;
    let text: string;
    try { text = fs.readFileSync(filePath, 'utf8'); } catch { return; }
    const isVb = filePath.toLowerCase().endsWith('.vb');
    // C#: `public partial class MainWindow : Window` -> `: AvaloniaChrome.ChromeWindow`
    // VB: `Inherits Window` -> `Inherits AvaloniaChrome.ChromeWindow`
    const from = isVb ? /(Inherits\s+)Window\b/ : /(public\s+partial\s+class\s+\w+\s*:\s*)Window\b/;
    const to = '$1AvaloniaChrome.ChromeWindow';
    if (!from.test(text)) return; // not a Window base (already converted, or a UserControl form)
    const updated = text.replace(from, to);
    if (updated !== text) fs.writeFileSync(filePath, updated, 'utf8');
}

/**
 * Removes the given event-handler methods from the form's code-behind. Called when
 * the owning control is deleted or the canvas is cleared — only with handlers that
 * are confirmed no longer referenced by the XAML.
 */
export async function removeHandlersFromCodeBehind(axamlUri: vscode.Uri, handlers: string[]): Promise<void> {
    const filePath = findCodeBehindFile(axamlUri);
    if (!filePath || handlers.length === 0) return;
    const language: 'cs' | 'vb' = filePath.toLowerCase().endsWith('.vb') ? 'vb' : 'cs';
    let text = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    for (const h of handlers) {
        const next = language === 'cs' ? removeCsMethod(text, h) : removeVbMethod(text, h);
        if (next !== text) { text = next; changed = true; }
    }
    if (changed) fs.writeFileSync(filePath, text, 'utf8');
}

/**
 * Renames every reference to a control in the code-behind when it is renamed, so the
 * code-behind stays in sync with the new control name. Works for both C# and VB.NET:
 *   - generated handler methods + any references, e.g. `Button1_Click` -> `SubmitButton_Click`
 *   - every bare reference to the control, e.g. `Button1.Text = ...` -> `SubmitButton.Text = ...`
 *     (including the VB accessor's FindControl string — the accessor block itself is rebuilt
 *     separately by syncVbAccessors)
 * \b guards against matching a longer name (renaming `Button1` must not touch `Button10` or
 * `Button10_Click`).
 */
export async function renameControlInCodeBehind(axamlUri: vscode.Uri, oldName: string, newName: string): Promise<void> {
    if (!oldName || oldName === newName) return;
    const filePath = findCodeBehindFile(axamlUri);
    if (!filePath) return;
    const text = fs.readFileSync(filePath, 'utf8');
    const updated = text
        // <oldName>_<Event> identifiers (handler method declarations + references)
        .replace(new RegExp(`\\b${escapeRe(oldName)}_(\\w+)`, 'g'), `${newName}_$1`)
        // bare <oldName> references (user code, comments, FindControl strings)
        .replace(new RegExp(`\\b${escapeRe(oldName)}\\b`, 'g'), newName);
    if (updated !== text) fs.writeFileSync(filePath, updated, 'utf8');
}

/** Removes a single `private void Handler(...) { ... }` method (brace-aware). */
function removeCsMethod(text: string, handler: string): string {
    const sigRe = new RegExp(`\\b(?:public|private|protected|internal)\\s+void\\s+${escapeRe(handler)}\\b`, 'i');
    const m = sigRe.exec(text);
    if (!m) return text;
    const open = text.indexOf('{', m.index);
    if (open < 0) return text;
    const close = matchingBrace(text, open);
    if (close < 0) return text;
    let start = m.index;
    while (start > 0 && text[start - 1] !== '\n') start--;
    let end = close + 1;
    if (text[end] === '\r') end++;
    if (text[end] === '\n') end++;
    return text.slice(0, start) + text.slice(end);
}

/** Removes a single `Private Sub Handler(...) ... End Sub` method. */
function removeVbMethod(text: string, handler: string): string {
    const sigRe = new RegExp(`\\bPrivate\\s+Sub\\s+${escapeRe(handler)}\\b`, 'i');
    const m = sigRe.exec(text);
    if (!m) return text;
    const em = /End\s+Sub\b/i.exec(text.slice(m.index));
    if (!em) return text;
    let start = m.index;
    while (start > 0 && text[start - 1] !== '\n') start--;
    let end = m.index + em.index + em[0].length;
    if (text[end] === '\r') end++;
    if (text[end] === '\n') end++;
    return text.slice(0, start) + text.slice(end);
}
// ---------------- VB named-control accessors ----------------

/** Matches one generated accessor property block. */
const VB_ACCESSOR_RE = /^\s*Private\s+ReadOnly\s+Property\s+\w+\s+As\s+[\w.]+\s*\r?\n\s*Get\s*\r?\n\s*Return\s+Me\.FindControl\(\s*Of\s+[\w.]+\s*\)\("[^"]+"\)\s*\r?\n\s*End\s+Get\s*\r?\n\s*End\s+Property\s*\r?\n/gm;

function accessorBlock(name: string, type: string): string {
    return `\n    Private ReadOnly Property ${name} As ${type}\n        Get\n            Return Me.FindControl(Of ${type})("${name}")\n        End Get\n    End Property\n`;
}

/** Shape types live in Avalonia.Controls.Shapes (not Avalonia.Controls), so a VB code-behind
 *  that declares an accessor for one (or a user writes `Line1.Stroke = ...`) needs the Shapes
 *  namespace imported too — otherwise BC30002 "Type 'Line' is not defined". */
const VB_SHAPES_NS = new Set(['Line', 'Rectangle', 'Ellipse', 'Arc', 'Sector', 'Polygon', 'Polyline', 'Path', 'Shape']);

/** Rebuilds the accessor block: strips old accessors, adds one per named control before `End Class`. */
export function applyAccessors(text: string, controls: { name: string; type: string }[]): string {
    // U+FEFF is only valid as the VERY FIRST character. Earlier versions prepended imports BEFORE
    // a leading BOM (or repeated themselves), leaving stray BOMs mid-file — before an Imports
    // line — which both broke the import dedup regexes and produced "BC30037" style errors /
    // a doubled `Imports Avalonia.Controls.Shapes`. Normalise: drop every BOM, remember whether
    // the file had one, and restore a single BOM at the very front of the result.
    const hadBom = text.charCodeAt(0) === 0xFEFF;
    text = text.replace(/\uFEFF/g, '');

    const stripped = text.replace(VB_ACCESSOR_RE, '');
    const block = controls
        .filter((c) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(c.name) && /^[A-Za-z_][A-Za-z0-9_.]*$/.test(c.type))
        .map((c) => accessorBlock(c.name, c.type))
        .join('');
    let out: string;
    if (!block) {
        out = stripped;
    } else {
        const ec = /^\s*End\s+Class\s*\r?$/m.exec(stripped);
        out = ec ? stripped.slice(0, ec.index) + block + stripped.slice(ec.index) : stripped;
        // The accessors need Avalonia.Controls (FindControl + the control types); shape controls
        // (Line/Rectangle/Ellipse/Arc/…) additionally need Avalonia.Controls.Shapes. Ensure each
        // needed import exists EXACTLY once: drop every copy (repeated runs / earlier BOM
        // corruption may have accumulated duplicates) then prepend exactly what is needed.
        out = out
            .replace(/^Imports\s+Avalonia\.Controls\.Shapes\s*$/gm, '')
            .replace(/^Imports\s+Avalonia\.Controls\s*$/gm, '');
        let prefix = 'Imports Avalonia.Controls\n';
        if (controls.some((c) => VB_SHAPES_NS.has(c.type))) prefix += 'Imports Avalonia.Controls.Shapes\n';
        out = prefix + out;
    }
    return (hadBom ? '\uFEFF' : '') + out;
}

/**
 * For VB code-behind files only: named controls are NOT auto-generated fields (unlike C#,
 * where a partial class gets a field per x:Name), so this ensures a read-only accessor
 * property exists for every named control and removes accessors for controls that no longer
 * exist. This lets users write `TextBox2.Text = ...` directly. No-op for C# projects.
 */
export async function syncVbAccessors(axamlUri: vscode.Uri, controls: { name: string; type: string }[]): Promise<void> {
    const filePath = findCodeBehindFile(axamlUri);
    if (!filePath || !filePath.toLowerCase().endsWith('.vb')) return;
    const text = fs.readFileSync(filePath, 'utf8');
    const updated = applyAccessors(text, controls);
    if (updated !== text) fs.writeFileSync(filePath, updated, 'utf8');
}
// ---------------- C# ----------------

function insertCsMethod(text: string, handler: string, className?: string): { text: string; cursorOffset: number } | undefined {
    const sigRe = new RegExp(`private\\s+void\\s+${escapeRe(handler)}\\s*\\(`);
    if (sigRe.test(text)) {
        const idx = text.indexOf(handler + '(');
        return { text, cursorOffset: idx >= 0 ? idx : 0 };
    }

    // Insert into the class matching the form name (e.g. MainWindow), otherwise the
    // first partial class — a file like Program.cs may contain several classes.
    const clsRe = className
        ? new RegExp(`\\b(?:partial\\s+)?class\\s+${escapeRe(className)}\\b`, 'i')
        : /\bpartial\s+class\s+(\w+)/;
    const m = clsRe.exec(text);
    if (!m) return undefined;
    const brace = text.indexOf('{', m.index);
    if (brace < 0) return undefined;
    const close = matchingBrace(text, brace);
    if (close < 0) return undefined;

    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    const indent = text.slice(lineStart, m.index).match(/^\s*/)?.[0] ?? '';
    const bodyIndent = indent + '    ';

    const method = `\n${bodyIndent}private void ${handler}(object sender, Avalonia.Interactivity.RoutedEventArgs e)\n${bodyIndent}{\n${bodyIndent}    // TODO: Handle ${handler}\n${bodyIndent}}\n`;
    const newText = text.slice(0, close) + method + text.slice(close);
    const cursorOffset = newText.indexOf('// TODO: Handle ' + handler);
    return { text: newText, cursorOffset };
}

// ---------------- VB.NET ----------------

/**
 * The VB event-args type required by the Avalonia XAML compiler for an event.
 * VB is strict here (unlike C#): the handler signature must match the event's
 * delegate exactly, otherwise the build fails with AVLN:0004.
 */
function vbEventArgsFor(eventName: string): string {
    switch (eventName) {
        case 'Tapped':
        case 'DoubleTapped':
        case 'RightTapped':
        case 'Holding':
            return 'Avalonia.Input.TappedEventArgs';
        case 'SelectionChanged':
            return 'Avalonia.Controls.SelectionChangedEventArgs';
        case 'TextChanged':
            return 'Avalonia.Controls.TextChangedEventArgs';
        default:
            return 'Avalonia.Interactivity.RoutedEventArgs';
    }
}

function insertVbMethod(text: string, handler: string, className: string | undefined, eventName: string): { text: string; cursorOffset: number } | undefined {
    const sigRe = new RegExp(`Sub\\s+${escapeRe(handler)}\\s*\\(`, 'i');
    if (sigRe.test(text)) {
        const idx = text.toLowerCase().indexOf(handler.toLowerCase() + '(');
        return { text, cursorOffset: idx >= 0 ? idx : 0 };
    }

    // Insert into the class matching the form name (e.g. MainWindow), otherwise the
    // first Class — Program.vb contains App, MainWindow and a Module.
    const clsRe = className
        ? new RegExp(`\\bClass\\s+${escapeRe(className)}\\b`, 'i')
        : /\bClass\s+(\w+)/i;
    const m = clsRe.exec(text);
    if (!m) return undefined;
    const endRe = /End\s+Class/i;
    const after = text.slice(m.index);
    const em = endRe.exec(after);
    if (!em) return undefined;
    const endIndex = m.index + em.index;

    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    const indent = text.slice(lineStart, m.index).match(/^\s*/)?.[0] ?? '';
    const bodyIndent = indent + '    ';

    const method = `\n${bodyIndent}Private Sub ${handler}(sender As Object, e As ${vbEventArgsFor(eventName)})\n${bodyIndent}    ' TODO: Handle ${handler}\n${bodyIndent}End Sub\n`;
    const newText = text.slice(0, endIndex) + method + text.slice(endIndex);
    const cursorOffset = newText.indexOf("' TODO: Handle " + handler);
    return { text: newText, cursorOffset };
}

// ---------------- StatusDate (live date/time TextBlock) ----------------

/** Inserts the C# "live date/time" Loaded handler (a per-second DispatcherTimer). */
function insertCsStatusDate(text: string, handler: string, name: string): string | undefined {
    const clsRe = /\b(?:partial\s+)?class\s+(\w+)/;
    const m = clsRe.exec(text);
    if (!m) return undefined;
    const brace = text.indexOf('{', m.index);
    if (brace < 0) return undefined;
    const close = matchingBrace(text, brace);
    if (close < 0) return undefined;
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    const indent = text.slice(lineStart, m.index).match(/^\s*/)?.[0] ?? '';
    const bi = indent + '    ';
    const method = `\n${bi}private void ${handler}(object sender, Avalonia.Interactivity.RoutedEventArgs e)\n${bi}{\n` +
        `${bi}    var timer = new Avalonia.Threading.DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };\n` +
        `${bi}    timer.Tick += (_, _) => ${name}.Text = DateTime.Now.ToString();\n` +
        `${bi}    timer.Start();\n${bi}}\n`;
    return text.slice(0, close) + method + text.slice(close);
}

/** Inserts the VB.NET "live date/time" Loaded handler (a per-second DispatcherTimer). */
function insertVbStatusDate(text: string, handler: string, name: string): string | undefined {
    const clsRe = /\bClass\s+(\w+)/i;
    const m = clsRe.exec(text);
    if (!m) return undefined;
    const after = text.slice(m.index);
    const em = /End\s+Class/i.exec(after);
    if (!em) return undefined;
    const endIndex = m.index + em.index;
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    const indent = text.slice(lineStart, m.index).match(/^\s*/)?.[0] ?? '';
    const bi = indent + '    ';
    const method = `\n${bi}Private Sub ${handler}(sender As Object, e As Avalonia.Interactivity.RoutedEventArgs)\n${bi}` +
        `    Dim timer As New Avalonia.Threading.DispatcherTimer With {.Interval = TimeSpan.FromSeconds(1)}\n` +
        `${bi}    AddHandler timer.Tick, Sub(s2, e2) ${name}.Text = DateTime.Now.ToString()\n` +
        `${bi}    timer.Start()\n${bi}End Sub\n`;
    return text.slice(0, endIndex) + method + text.slice(endIndex);
}

/**
 * Turns a StatusDate TextBlock into a live date/time display by inserting a `Loaded` handler
 * that starts a per-second DispatcherTimer updating the control's Text (OS current-culture
 * format, includes seconds). The timer is a LOCAL variable — the dispatcher keeps it alive while
 * running — so deleting the control leaves nothing behind. Creates the code-behind if none exists.
 */
export async function insertStatusDateClock(axamlUri: vscode.Uri, name: string): Promise<void> {
    const handler = `${name}_Loaded`;
    let filePath = findCodeBehindFile(axamlUri);
    if (!filePath) {
        if (!(await createCodeBehind(axamlUri))) return;
        filePath = findCodeBehindFile(axamlUri);
        if (!filePath) return;
    }
    const language: 'cs' | 'vb' = filePath.toLowerCase().endsWith('.vb') ? 'vb' : 'cs';
    const original = fs.readFileSync(filePath, 'utf8');
    if (new RegExp(`\\b(?:void|Sub)\\s+${escapeRe(handler)}\\b`, 'i').test(original)) return; // already present
    const updated = language === 'cs'
        ? insertCsStatusDate(original, handler, name)
        : insertVbStatusDate(original, handler, name);
    if (!updated || updated === original) return;
    fs.writeFileSync(filePath, updated, 'utf8');
}

// ---------------- DataSet binding ----------------

/** A table → control binding reference used when generating/removing the binding code. */
export interface DataSetBindingRef {
    datasetName: string;
    tableName: string;
    controlName: string;
    /** Kind of the bound control ('DataGrid' emits the persistent live-editable grid pattern). */
    controlType?: 'DataGrid' | 'ListBox' | 'ComboBox' | 'ItemsControl';
}

/** Lower-camel field name for the grid's row collection (Customers -> _customers). */
function lcFirst(s: string): string {
    return s.length ? s[0].toLowerCase() + s.slice(1) : s;
}

/**
 * Writes the runtime binding into the control's form code-behind (creating the
 * code-behind first if the form has none):
 *   - a public DataView property named after the table (`Customers`),
 *   - a constructor one-liner `Control.ItemsSource = <Table>;`,
 *   - `using System.Data;` / `Imports System.Data` if missing.
 * Idempotent — binding again adds nothing. Returns the code-behind file path.
 */
export async function bindControlToDataSet(axamlUri: vscode.Uri, b: DataSetBindingRef): Promise<string | undefined> {
    let filePath = findCodeBehindFile(axamlUri);
    if (!filePath) {
        if (!(await createCodeBehind(axamlUri))) return undefined;
        filePath = findCodeBehindFile(axamlUri);
        if (!filePath) return undefined;
    }
    const language: 'cs' | 'vb' = filePath.toLowerCase().endsWith('.vb') ? 'vb' : 'cs';
    const base = path.basename(axamlUri.fsPath, '.axaml');
    const original = fs.readFileSync(filePath, 'utf8');
    const updated = language === 'cs'
        ? insertCsDataSetBinding(original, b, base)
        : insertVbDataSetBinding(original, b, base);
    if (!updated || updated === original) return filePath;
    fs.writeFileSync(filePath, updated, 'utf8');
    return filePath;
}

/**
 * True if the code-behind for the control's form already contains the generated
 * DataSet binding (the `Control.ItemsSource = <Table>` line). Used to detect a stale
 * ".adset says bound but the code-behind line is missing" state (e.g. after the
 * project was recreated) so the designer can re-write it instead of saying "already bound".
 */
export function hasDataSetBinding(axamlUri: vscode.Uri, b: DataSetBindingRef): boolean {
    const filePath = findCodeBehindFile(axamlUri);
    if (!filePath) return false;
    try {
        const t = fs.readFileSync(filePath, 'utf8');
        // DataGrid binding marker is the Wire<T>Grid line; list controls use the ItemsSource line.
        return t.includes(`${b.datasetName}.Wire${b.tableName}Grid(`)
            || t.includes(`${b.controlName}.ItemsSource = ${b.tableName}`);
    } catch { return false; }
}

/** Removes the generated DataSet binding (the ItemsSource line + the DataView property). */
export async function unbindControlFromDataSet(axamlUri: vscode.Uri, b: DataSetBindingRef): Promise<void> {
    const filePath = findCodeBehindFile(axamlUri);
    if (!filePath) return;
    const language: 'cs' | 'vb' = filePath.toLowerCase().endsWith('.vb') ? 'vb' : 'cs';
    const original = fs.readFileSync(filePath, 'utf8');
    const updated = removeDataSetBinding(original, language, b);
    if (updated !== original) fs.writeFileSync(filePath, updated, 'utf8');
}

function insertCsDataSetBinding(text: string, b: DataSetBindingRef, className?: string): string | undefined {
    let t = text;
    // Ensure `using System.Data;` (and for a DataGrid, System.Collections.ObjectModel) — do these
    // FIRST so the class anchors computed below are not shifted by the inserted using lines.
    const ensureUsing = (u: string): void => {
        if (new RegExp(`^\\s*using\\s+${u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*;`, 'm').test(t)) return;
        const usingRe = /^using\s+[^;]+;\s*$/gm;
        let mm: RegExpExecArray | null, last: RegExpExecArray | null = null;
        while ((mm = usingRe.exec(t))) last = mm;
        if (last) t = t.slice(0, last.index + last[0].length) + `\nusing ${u};` + t.slice(last.index + last[0].length);
        else t = `using ${u};\n` + t;
    };
    ensureUsing('System.Data');
    if (b.controlType === 'DataGrid') ensureUsing('System.Collections.ObjectModel');

    const clsRe = className
        ? new RegExp(`\\b(?:partial\\s+)?class\\s+${escapeRe(className)}\\b`, 'i')
        : /\bpartial\s+class\s+(\w+)/;
    const m = clsRe.exec(t);
    if (!m) return undefined;
    const brace = t.indexOf('{', m.index);
    if (brace < 0) return undefined;
    const close = matchingBrace(t, brace);
    if (close < 0) return undefined;
    const lineStart = t.lastIndexOf('\n', m.index) + 1;
    const indent = t.slice(lineStart, m.index).match(/^\s*/)?.[0] ?? '';
    const bodyIndent = indent + '    ';

    if (b.controlType === 'DataGrid') {
        // Live editable grid: a persistent row collection + Load/Wire wiring.
        const field = `${bodyIndent}private System.Collections.ObjectModel.ObservableCollection<${b.tableName}Row> _${lcFirst(b.tableName)};`;
        if (!t.includes(field)) {
            t = t.slice(0, brace + 1) + '\n' + field + t.slice(brace + 1);
        }
        // Constructor wiring right after InitializeComponent();
        const ic = /InitializeComponent\s*\(\)\s*;/.exec(t);
        if (ic) {
            const lineEnd = t.indexOf('\n', ic.index);
            const icLineStart = t.lastIndexOf('\n', ic.index) + 1;
            const icIndent = t.slice(icLineStart, ic.index).match(/^\s*/)?.[0] ?? bodyIndent;
            const block = `${icIndent}_${lcFirst(b.tableName)} = ${b.datasetName}.Load${b.tableName}();\n` +
                `${icIndent}${b.datasetName}.Wire${b.tableName}Grid(${b.controlName}, _${lcFirst(b.tableName)});`;
            if (!t.includes(block.split('\n')[0])) {
                const at = lineEnd < 0 ? t.length : lineEnd;
                t = t.slice(0, at) + '\n' + block + t.slice(at);
            }
        }
        return t;
    }

    // List controls: typed row-collection property (single line; idempotent). A DataGrid can't show
    // a DataView's rows/columns in Avalonia (DataRowView exposes no properties), so the binding uses List<Row>.
    const property = `${bodyIndent}public System.Collections.Generic.List<${b.tableName}Row> ${b.tableName} => ${b.datasetName}.Get${b.tableName}();`;
    if (!t.includes(property)) {
        t = t.slice(0, brace + 1) + '\n' + property + t.slice(brace + 1);
    }

    // Constructor one-liner right after InitializeComponent();
    const stmt = `${b.controlName}.ItemsSource = ${b.tableName};`;
    const ic = /InitializeComponent\s*\(\)\s*;/.exec(t);
    if (ic) {
        const lineEnd = t.indexOf('\n', ic.index);
        const icLineStart = t.lastIndexOf('\n', ic.index) + 1;
        const icIndent = t.slice(icLineStart, ic.index).match(/^\s*/)?.[0] ?? bodyIndent;
        const line = `${icIndent}${stmt}`;
        if (!t.includes(line)) {
            const at = lineEnd < 0 ? t.length : lineEnd;
            t = t.slice(0, at) + '\n' + line + t.slice(at);
        }
    }
    return t;
}

function insertVbDataSetBinding(text: string, b: DataSetBindingRef, className?: string): string | undefined {
    let t = text;
    // Ensure `Imports System.Data` (and for a DataGrid, System.Collections.ObjectModel) — do these
    // FIRST so the class anchors computed below are not shifted by the inserted Imports lines.
    const ensureImport = (u: string): void => {
        if (new RegExp(`^\\s*Imports\\s+${u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'mi').test(t)) return;
        const usingRe = /^Imports\s+[\w.]+\s*$/gim;
        let mm: RegExpExecArray | null, last: RegExpExecArray | null = null;
        while ((mm = usingRe.exec(t))) last = mm;
        if (last) t = t.slice(0, last.index + last[0].length) + `\nImports ${u}` + t.slice(last.index + last[0].length);
        else t = `Imports ${u}\n` + t;
    };
    ensureImport('System.Data');
    if (b.controlType === 'DataGrid') ensureImport('System.Collections.ObjectModel');

    const clsRe = className
        ? new RegExp(`\\bClass\\s+${escapeRe(className)}\\b`, 'i')
        : /\bClass\s+(\w+)/i;
    const m = clsRe.exec(t);
    if (!m) return undefined;
    const after = t.slice(m.index);
    const em = /End\s+Class/i.exec(after);
    if (!em) return undefined;
    const endIndex = m.index + em.index;
    const lineStart = t.lastIndexOf('\n', m.index) + 1;
    const indent = t.slice(lineStart, m.index).match(/^\s*/)?.[0] ?? '';
    const bodyIndent = indent + '    ';

    if (b.controlType === 'DataGrid') {
        // Live editable grid: a persistent row collection + Load/Wire wiring.
        const field = `${bodyIndent}Private _${lcFirst(b.tableName)} As System.Collections.ObjectModel.ObservableCollection(Of ${b.tableName}Row)`;
        if (!t.includes(field)) {
            t = t.slice(0, endIndex) + field + '\n' + t.slice(endIndex);
        }
        // Constructor wiring right after InitializeComponent()
        const ic = /InitializeComponent\s*\(\)/i.exec(t);
        if (ic) {
            const lineEnd = t.indexOf('\n', ic.index);
            const icLineStart = t.lastIndexOf('\n', ic.index) + 1;
            const icIndent = t.slice(icLineStart, ic.index).match(/^\s*/)?.[0] ?? bodyIndent;
            const loadLine = `${icIndent}_${lcFirst(b.tableName)} = ${b.datasetName}.Load${b.tableName}()`;
            if (!t.includes(loadLine)) {
                const wireLine = `${icIndent}${b.datasetName}.Wire${b.tableName}Grid(${b.controlName}, _${lcFirst(b.tableName)})`;
                const at = lineEnd < 0 ? t.length : lineEnd;
                t = t.slice(0, at) + '\n' + loadLine + '\n' + wireLine + t.slice(at);
            }
        }
        return t;
    }

    // List controls: typed row-collection property block (idempotent). A DataGrid can't show a
    // DataView's rows/columns in Avalonia, so the binding uses List(Of Row) instead.
    const property = `${bodyIndent}Public ReadOnly Property ${b.tableName} As System.Collections.Generic.List(Of ${b.tableName}Row)\n` +
        `${bodyIndent}    Get\n` +
        `${bodyIndent}        Return ${b.datasetName}.Get${b.tableName}()\n` +
        `${bodyIndent}    End Get\n` +
        `${bodyIndent}End Property`;
    if (!t.includes(property)) {
        t = t.slice(0, endIndex) + property + '\n' + t.slice(endIndex);
    }

    // Constructor one-liner right after InitializeComponent()
    const stmt = `${b.controlName}.ItemsSource = ${b.tableName}`;
    const ic = /InitializeComponent\s*\(\)/i.exec(t);
    if (ic) {
        const lineEnd = t.indexOf('\n', ic.index);
        const icLineStart = t.lastIndexOf('\n', ic.index) + 1;
        const icIndent = t.slice(icLineStart, ic.index).match(/^\s*/)?.[0] ?? bodyIndent;
        const line = `${icIndent}${stmt}`;
        if (!t.includes(line)) {
            const at = lineEnd < 0 ? t.length : lineEnd;
            t = t.slice(0, at) + '\n' + line + t.slice(at);
        }
    }
    return t;
}

function removeDataSetBinding(text: string, language: 'cs' | 'vb', b: DataSetBindingRef): string {
    let t = text;
    // Constructor one-liner line
    const stmtRe = new RegExp(`^[ \\t]*${escapeRe(b.controlName)}\\.ItemsSource\\s*=\\s*${escapeRe(b.tableName)};?[ \\t]*\\r?\\n`, 'gm');
    t = t.replace(stmtRe, '');
    // DataView property: C# single line / VB block
    if (language === 'cs') {
        const propRe = new RegExp(`^[ \\t]*public\\s+[\\w.]+(?:<[\\w.]+>)?\\s+${escapeRe(b.tableName)}\\s*=>.*\\r?\\n`, 'gm');
        t = t.replace(propRe, '');

    } else {
        const blockRe = new RegExp(
            `^[ \\t]*Public\\s+ReadOnly\\s+Property\\s+${escapeRe(b.tableName)}\\s+As\\s+[^\\r\\n]+\\r?\\n` +
            `(?:(?!^[ \\t]*End\\s+Property)[\\s\\S])*?` +
            `^[ \\t]*End\\s+Property\\s*\\r?\\n`,
            'gm'
        );
        t = t.replace(blockRe, '');
    }
    // DataGrid live-grid shape: the Load/Wire wiring lines + the row-collection field.
    const lc = lcFirst(b.tableName);
    const loadRe = new RegExp(`^[ \\t]*_${escapeRe(lc)}\\s*=\\s*${escapeRe(b.datasetName)}\\.Load${escapeRe(b.tableName)}\\(\\)[ \\t]*;?[ \\t]*\\r?\\n`, 'gm');
    t = t.replace(loadRe, '');
    const wireRe = new RegExp(`^[ \\t]*${escapeRe(b.datasetName)}\\.Wire${escapeRe(b.tableName)}Grid\\([^\\r\\n]*\\r?\\n`, 'gm');
    t = t.replace(wireRe, '');
    if (language === 'cs') {
        const fieldRe = new RegExp(`^[ \\t]*private\\s+System\\.Collections\\.ObjectModel\\.ObservableCollection<${escapeRe(b.tableName)}Row>\\s+_${escapeRe(lc)}\\s*;\\r?\\n`, 'gm');
        t = t.replace(fieldRe, '');
    } else {
        const fieldRe = new RegExp(`^[ \\t]*Private\\s+_${escapeRe(lc)}\\s+As\\s+System\\.Collections\\.ObjectModel\\.ObservableCollection\\(Of\\s+${escapeRe(b.tableName)}Row\\)\\s*\\r?\\n`, 'gm');
        t = t.replace(fieldRe, '');
    }
    return t;
}

// ---------------- generic Items Source binding (code assets) ----------------

/**
 * Returns the expression of an existing `ControlName.ItemsSource = <expr>` line in the
 * form's code-behind (the binding the asset picker wrote), or undefined if none. Used to
 * show the Items Source field read-only and to offer an "un-bind" entry.
 */
export function findItemsSourceBinding(axamlUri: vscode.Uri, controlName: string): string | undefined {
    const filePath = findCodeBehindFile(axamlUri);
    if (!filePath) return undefined;
    try {
        const t = fs.readFileSync(filePath, 'utf8');
        const re = new RegExp(`\\b${escapeRe(controlName)}\\.ItemsSource\\s*=\\s*([^;\\r\\n]+)\\s*;?`, 'i');
        const m = re.exec(t);
        return m ? m[1].trim() : undefined;
    } catch { return undefined; }
}

/**
 * Adds/updates `ControlName.ItemsSource = <expression>;` in the form constructor (right
 * after InitializeComponent), replacing any existing ItemsSource line for the control.
 * Creates the code-behind first if the form has none. Returns the code-behind file path.
 */
export async function bindControlToAsset(axamlUri: vscode.Uri, controlName: string, expression: string): Promise<string | undefined> {
    let filePath = findCodeBehindFile(axamlUri);
    if (!filePath) {
        if (!(await createCodeBehind(axamlUri))) return undefined;
        filePath = findCodeBehindFile(axamlUri);
        if (!filePath) return undefined;
    }
    const language: 'cs' | 'vb' = filePath.toLowerCase().endsWith('.vb') ? 'vb' : 'cs';
    const base = path.basename(axamlUri.fsPath, '.axaml');
    const original = fs.readFileSync(filePath, 'utf8');
    const updated = upsertItemsSourceLine(original, language, controlName, expression, base);
    if (!updated || updated === original) return filePath;
    fs.writeFileSync(filePath, updated, 'utf8');
    // VB: named controls are not auto-generated fields, so a FindControl accessor is needed
    // for `ControlName.ItemsSource = ...` to compile. Sync ALL named controls (non-destructive).
    if (language === 'vb') {
        const controls = namedControlsInAxaml(axamlUri);
        await syncVbAccessors(axamlUri, controls);
    }
    return filePath;
}

/** Collects `{ name, type }` for every x:Name'd element in the form's .axaml (for VB accessors). */
export function namedControlsInAxaml(axamlUri: vscode.Uri): { name: string; type: string }[] {
    const out: { name: string; type: string }[] = [];
    try {
        const text = fs.readFileSync(axamlUri.fsPath, 'utf8');
        const tagRe = /<\s*([A-Za-z_][\w.:]*)\b([^>]*)>/g;
        let m: RegExpExecArray | null;
        while ((m = tagRe.exec(text))) {
            const type = m[1].split(':').pop() ?? '';
            const nameM = /x:Name\s*=\s*"([^"]+)"/.exec(m[2]);
            if (nameM && nameM[1]) out.push({ name: nameM[1], type });
        }
    } catch { /* ignore */ }
    return out;
}

/** Removes any `ControlName.ItemsSource = X` line for the control. */
export async function removeItemsSourceBinding(axamlUri: vscode.Uri, controlName: string): Promise<void> {
    const filePath = findCodeBehindFile(axamlUri);
    if (!filePath) return;
    const language: 'cs' | 'vb' = filePath.toLowerCase().endsWith('.vb') ? 'vb' : 'cs';
    const original = fs.readFileSync(filePath, 'utf8');
    const re = new RegExp(`^[ \\t]*${escapeRe(controlName)}\\.ItemsSource\\s*=\\s*[^;\\r\\n]*;?[ \\t]*\\r?\\n`, 'gm');
    const updated = original.replace(re, '');
    if (updated !== original) fs.writeFileSync(filePath, updated, 'utf8');
}

/** Replaces an existing ItemsSource line for the control (if any) and adds the new one
 *  after `InitializeComponent()` (or into the class body when there's no constructor). */
function upsertItemsSourceLine(text: string, language: 'cs' | 'vb', controlName: string, expression: string, className?: string): string | undefined {
    const stmt = language === 'cs' ? `${controlName}.ItemsSource = ${expression};` : `${controlName}.ItemsSource = ${expression}`;
    const existing = new RegExp(`^[ \\t]*${escapeRe(controlName)}\\.ItemsSource\\s*=\\s*[^;\\r\\n]*;?[ \\t]*\\r?\\n`, 'gm');
    let t = text.replace(existing, '');

    const icRe = language === 'cs' ? /InitializeComponent\s*\(\)\s*;/ : /InitializeComponent\s*\(\)/;
    const ic = icRe.exec(t);
    if (ic) {
        const lineEnd = t.indexOf('\n', ic.index);
        const icLineStart = t.lastIndexOf('\n', ic.index) + 1;
        const icIndent = t.slice(icLineStart, ic.index).match(/^\s*/)?.[0] ?? '        ';
        const line = `${icIndent}${stmt}`;
        if (!t.includes(line)) {
            const at = lineEnd < 0 ? t.length : lineEnd;
            t = t.slice(0, at) + '\n' + line + t.slice(at);
        }
        return t;
    }

    if (language === 'cs') {
        const clsRe = className
            ? new RegExp(`\\b(?:partial\\s+)?class\\s+${escapeRe(className)}\\b`, 'i')
            : /\bpartial\s+class\s+(\w+)/;
        const m = clsRe.exec(t);
        if (!m) return undefined;
        const brace = t.indexOf('{', m.index);
        if (brace < 0) return undefined;
        const lineStart = t.lastIndexOf('\n', m.index) + 1;
        const indent = t.slice(lineStart, m.index).match(/^\s*/)?.[0] ?? '';
        t = t.slice(0, brace + 1) + `\n${indent}    ${stmt}\n` + t.slice(brace + 1);
        return t;
    }

    const clsRe = className
        ? new RegExp(`\\bClass\\s+${escapeRe(className)}\\b`, 'i')
        : /\bClass\s+(\w+)/i;
    const m = clsRe.exec(t);
    if (!m) return undefined;
    const em = /End\s+Class/i.exec(t);
    const at = em ? em.index : t.length;
    const lineStart = t.lastIndexOf('\n', m.index) + 1;
    const indent = t.slice(lineStart, m.index).match(/^\s*/)?.[0] ?? '';
    t = t.slice(0, at) + `${indent}    ${stmt}\n` + t.slice(at);
    return t;
}

// ---------------- helpers ----------------

function matchingBrace(text: string, openIndex: number): number {
    let depth = 0;
    for (let i = openIndex; i < text.length; i++) {
        const c = text[i];
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Creates a minimal code-behind (partial class + InitializeComponent) when none exists. */
async function createCodeBehind(axamlUri: vscode.Uri): Promise<boolean> {
    const proj = findProject(axamlUri);
    if (!proj) return false;

    let axamlText = '';
    try {
        axamlText = fs.readFileSync(axamlUri.fsPath, 'utf8');
    } catch {
        return false;
    }

    // Root element: capture an optional namespace prefix + local name, e.g.
    //   <chrome:ChromeWindow ...>  -> prefix "chrome", local "ChromeWindow"
    //   <Window ...>               -> no prefix,  local "Window"
    const rootMatch = /<(?:([A-Za-z_][\w-]*):)?([A-Za-z_][\w.]*)[\s/>]/i.exec(axamlText);
    const rootPrefix = rootMatch ? rootMatch[1] : '';
    const rootLocal = rootMatch ? rootMatch[2] : 'Window';
    const classMatch = /x:Class\s*=\s*"([^"]+)"/i.exec(axamlText);
    const base = path.basename(axamlUri.fsPath, '.axaml');
    const className = classMatch ? classMatch[1].split('.').pop()! : base;
    const ns = classMatch ? classMatch[1].replace(/\.\w+$/, '') : proj.rootNamespace || base;

    // Resolve a prefixed root's namespace from its xmlns, e.g.
    // xmlns:chrome="using:AvaloniaChrome"  ->  "AvaloniaChrome".
    let rootNs = '';
    if (rootPrefix) {
        const nsRe = new RegExp(`xmlns:${escapeRe(rootPrefix)}\\s*=\\s*"([^"]+)"`, 'i');
        const nsM = nsRe.exec(axamlText);
        if (nsM) {
            const usingM = /^using:([^;]+)/i.exec(nsM[1]) || /^clr-namespace:([^;]+)/i.exec(nsM[1]);
            if (usingM) rootNs = usingM[1].trim();
        }
    }

    // Base type for the class. Standard Window/UserControl use those names; a custom
    // root (e.g. chrome:ChromeWindow) is fully-qualified via its namespace so the
    // generated code-behind matches the XAML root (VB: `Inherits AvaloniaChrome.ChromeWindow`).
    const kind = rootLocal === 'UserControl' ? 'UserControl'
        : rootLocal === 'Window' ? 'Window'
            : rootNs ? `${rootNs}.${rootLocal}`
                : rootLocal;

    const filePath = proj.language === 'cs'
        ? path.join(path.dirname(axamlUri.fsPath), `${base}.axaml.cs`)
        : path.join(path.dirname(axamlUri.fsPath), `${base}.axaml.vb`);

    const content = proj.language === 'cs'
        ? `using Avalonia.Controls;\n\nnamespace ${ns};\n\npublic partial class ${className} : ${kind}\n{\n    public ${className}()\n    {\n        InitializeComponent();\n    }\n}\n`
        : `Imports Avalonia\nImports Avalonia.Controls\nImports Avalonia.Markup.Xaml\n\nClass ${className}\n    Inherits ${kind}\n\n    Public Sub New()\n        InitializeComponent()\n    End Sub\n\n    Private Sub InitializeComponent()\n        AvaloniaXamlLoader.Load(Me)\n    End Sub\nEnd Class\n`;

    fs.writeFileSync(filePath, content, 'utf8');
    return true;
}
