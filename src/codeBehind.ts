import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { findProject } from './projectParser';
import { statusClockFormat, STATUS_CLOCK_DEFAULT } from './propertyCatalog';

/** Default event per control type; falls back to DoubleTapped (valid on all input controls). */
const DEFAULT_EVENT: Record<string, string> = {
    Button: 'Click',
    CheckBox: 'IsCheckedChanged',
    RadioButton: 'IsCheckedChanged',
    ComboBox: 'SelectionChanged',
    ListBox: 'SelectionChanged',
    TabControl: 'SelectionChanged',
    DataGrid: 'SelectionChanged',
    TextBox: 'TextChanged',
    HyperlinkButton: 'Click',
    CommandBarButton: 'Click',
    CommandBarToggleButton: 'IsCheckedChanged'
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
 * Locates an ALREADY-INSERTED event-handler method in the form's code-behind WITHOUT writing or
 * creating anything. Returns the file + a cursor offset at the method name when found, else
 * undefined. Middle-click uses this so navigation never modifies the code-behind: placement owns
 * handler creation; middle-click only falls back to creating when the method is truly missing.
 */
export function findHandlerInCodeBehind(axamlUri: vscode.Uri, handler: string): InsertResult | undefined {
    const filePath = findCodeBehindFile(axamlUri);
    if (!filePath) return undefined;
    let text: string;
    try { text = fs.readFileSync(filePath, 'utf8'); } catch { return undefined; }
    const language: 'cs' | 'vb' = filePath.toLowerCase().endsWith('.vb') ? 'vb' : 'cs';
    const idx = language === 'cs' ? findCsMethodDecl(text, handler) : findVbMethodDecl(text, handler);
    if (idx < 0) return undefined;
    return { filePath, cursorOffset: idx };
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

/**
 * The index just past the `End Sub`/`End Function` that MATCHES a VB method whose body begins at
 * `from`. VB anonymous `Sub`/`Function` blocks nested inside a body (e.g. the
 * `AddHandler timer.Tick, Sub(s2, e2) … End Sub` inside a generated XY-Tracker / StatusDate clock
 * handler) are counted, so their inner `End Sub` no longer truncates the outer method early. VB
 * `'` comments and `"…"` strings are skipped so a stray keyword in one can't unbalance the count.
 * Returns -1 when the body never closes (no matching terminator found).
 */
function vbMatchingEnd(text: string, from: number): number {
    let depth = 1; // the method's own Sub/Function
    // Order matters: a `"` string is matched before a `'` comment so an apostrophe inside a string
    // isn't misread as a comment; both are skipped. Then `End Sub`/`End Function` close a level,
    // a lone `Sub`/`Function` opens one.
    const re = /("(?:[^"]|"")*")|('[^\r\n]*)|(\bEnd\s+(?:Sub|Function)\b)|(\b(?:Sub|Function)\b)/gi;
    re.lastIndex = from;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
        if (m[1] || m[2]) continue; // string or comment — not code
        if (m[3]) {
            depth--;
            if (depth <= 0) return m.index + m[3].length;
        } else {
            depth++;
        }
    }
    return -1;
}

/** Removes a single `Private Sub Handler(...) ... End Sub` method (nested Sub/Function aware). */
function removeVbMethod(text: string, handler: string): string {
    const sigRe = new RegExp(`\\bPrivate\\s+Sub\\s+${escapeRe(handler)}\\b`, 'i');
    const m = sigRe.exec(text);
    if (!m) return text;
    let endIdx = vbMatchingEnd(text, m.index + m[0].length);
    if (endIdx < 0) return text;
    let start = m.index;
    while (start > 0 && text[start - 1] !== '\n') start--;
    if (text[endIdx] === '\r') endIdx++;
    if (text[endIdx] === '\n') endIdx++;
    return text.slice(0, start) + text.slice(endIdx);
}

/**
 * Removes handler methods that a DELETED control left behind but whose XAML event attribute
 * pointed at a DIFFERENT handler — e.g. a second StatusDate whose `Loaded` reuses the first
 * clock's handler name, so its own `StatusDate2_Loaded` method is never collected by the normal
 * delete path and becomes an orphan. For each removed control name, any code-behind method named
 * `<name>_<Event>` that is NOT in `referenced` (the handler names still used by event attributes
 * in the current model) is removed. A method still referenced — e.g. shared between two controls
 * (`Click="Button1_Click"` on two buttons) — is kept. Best effort; never throws.
 */
export async function removeOrphanedHandlersForControls(
    axamlUri: vscode.Uri,
    names: string[],
    referenced: ReadonlySet<string>
): Promise<void> {
    const clean = names.filter((n) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n));
    if (clean.length === 0) return;
    const filePath = findCodeBehindFile(axamlUri);
    if (!filePath) return;
    const language: 'cs' | 'vb' = filePath.toLowerCase().endsWith('.vb') ? 'vb' : 'cs';
    let text: string;
    try { text = fs.readFileSync(filePath, 'utf8'); } catch { return; }
    let changed = false;
    for (const name of clean) {
        const declRe = language === 'vb'
            ? new RegExp(`\\b(?:Private|Public|Friend|Protected\\s+Friend|Protected)?\\s*Sub\\s+(${escapeRe(name)}_\\w+)\\b`, 'i')
            : new RegExp(`\\b(?:public|private|protected|internal)\\s+void\\s+(${escapeRe(name)}_\\w+)\\b`, 'i');
        const seen = new Set<string>();
        let m: RegExpExecArray | null;
        while ((m = declRe.exec(text))) {
            const handler = m[1];
            if (seen.has(handler)) break;
            seen.add(handler);
            if (referenced.has(handler)) continue; // still used by a remaining control
            const next = language === 'vb' ? removeVbMethod(text, handler) : removeCsMethod(text, handler);
            if (next !== text) { text = next; changed = true; }
        }
    }
    if (changed) {
        try { fs.writeFileSync(filePath, text, 'utf8'); } catch { /* best effort */ }
    }
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

/** Bundled AvaloniaChrome types that can appear as a NAMED control (so a VB accessor like
 *  `… As GrumpyPanel` needs `Imports AvaloniaChrome` to compile — same reason shape types need
 *  the Shapes import). */
const VB_CHROME_NS_TYPES = new Set(['GrumpyPanel', 'ChromeWindow']);

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
        // (Line/Rectangle/Ellipse/Arc/…) additionally need Avalonia.Controls.Shapes; bundled
        // AvaloniaChrome types (GrumpyPanel) need AvaloniaChrome. Ensure each needed import
        // exists EXACTLY once: drop every copy then prepend exactly what is needed.
        out = out
            .replace(/^Imports\s+Avalonia\.Controls\.Shapes\s*$/gm, '')
            .replace(/^Imports\s+Avalonia\.Controls\s*$/gm, '')
            .replace(/^Imports\s+AvaloniaChrome\s*$/gm, '');
        let prefix = 'Imports Avalonia.Controls\n';
        if (controls.some((c) => VB_SHAPES_NS.has(c.type))) prefix += 'Imports Avalonia.Controls.Shapes\n';
        if (controls.some((c) => VB_CHROME_NS_TYPES.has(c.type))) prefix += 'Imports AvaloniaChrome\n';
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

/**
 * Finds the <handler> method declaration in C# code — index of the method name, or -1. Accepts
 * ANY accessibility modifier and `async` (not just the generated `private void`), so a hand-edited
 * or differently-declared handler is recognised and NEVER duplicated. A declaration is `void
 * Name(`; a call site (`x.Name(`) has no `void` before it, so it can't be mistaken for one.
 */
function findCsMethodDecl(text: string, handler: string): number {
    const re = new RegExp(`(?:(?:public|private|protected|internal)\\s+)?(?:async\\s+)?void\\s+${escapeRe(handler)}\\s*\\(`);
    const m = re.exec(text);
    if (!m) return -1;
    const idx = text.indexOf(handler + '(', m.index);
    return idx >= 0 ? idx : m.index;
}

function insertCsMethod(text: string, handler: string, className?: string): { text: string; cursorOffset: number } | undefined {
    const existing = findCsMethodDecl(text, handler);
    if (existing >= 0) {
        return { text, cursorOffset: existing };
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

/**
 * Finds the <handler> Sub declaration in VB code — index of the method name, or -1. The generated
 * form is `Private Sub Name(`, but any accessibility (`Public`/`Friend`/`Protected`/`Shared`…) is
 * matched too, so a hand-edited handler is recognised and NEVER duplicated.
 */
function findVbMethodDecl(text: string, handler: string): number {
    const re = new RegExp(`\\bSub\\s+${escapeRe(handler)}\\s*\\(`, 'i');
    const m = re.exec(text);
    if (!m) return -1;
    const idx = text.toLowerCase().indexOf(handler.toLowerCase() + '(', m.index);
    return idx >= 0 ? idx : m.index;
}

function insertVbMethod(text: string, handler: string, className: string | undefined, eventName: string): { text: string; cursorOffset: number } | undefined {
    const existing = findVbMethodDecl(text, handler);
    if (existing >= 0) {
        return { text, cursorOffset: existing };
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

// ---------------- StatusDate clock — Date/Time format (System / Custom) ----------------

/** One part of the clock's tick: `DateTime.Now.ToString(...)` with the OS standard ('d'/'T', current
 *  culture) for System, or an explicit pattern rendered InvariantCulture so the picked example is
 *  exact. Returns '' when that part is hidden. */
function statusPartExpr(part: 'date' | 'time', choice: string): string {
    const fmt = statusClockFormat(part, choice);
    if (fmt === '') return '';
    const system = fmt === 'd' || fmt === 'T'; // OS standard — render with the current culture
    const quoted = fmt.replace(/"/g, '\\"');
    const args = system ? `"${quoted}"` : `"${quoted}", System.Globalization.CultureInfo.InvariantCulture`;
    return `DateTime.Now.ToString(${args})`;
}

/** The full `Name.Text = …` right-hand expression for the given Date/Time choices (both parts are
 *  OS-ish by default; a space joins them when both are shown). */
function statusTextExpr(choice: { date: string; time: string }, vb: boolean): string {
    const d = statusPartExpr('date', choice.date);
    const t = statusPartExpr('time', choice.time);
    if (d && t) return vb ? `${d} & " " & ${t}` : `${d} + " " + ${t}`;
    if (d || t) return d || t;
    return vb ? '""' : '""';
}

/** The designer settings marker embedded as a comment on the clock's tick line, so the Properties
 *  panel can read the current Date/Time choices back without re-parsing code. */
function statusMarker(name: string, date: string, time: string): string {
    return `statusclock:${name}: ${date}|${time}`;
}
const statusMarkerRe = (name: string) => new RegExp(`(?:\\/\\/|')\\s*statusclock:${name}:\\s*([^|\\r\\n]*)\\|([^|\\r\\n]*)`);

/**
 * The current Date/Time format choices of a StatusDate clock (friendly ids from STATUS_CLOCK_CHOICES),
 * read from the marker comment in its generated `_Loaded` handler. A clock created before this
 * feature (no marker) defaults to OS date + OS time, i.e. today's behaviour.
 */
export async function getStatusDateSettings(axamlUri: vscode.Uri, name: string): Promise<{ date: string; time: string }> {
    const filePath = findCodeBehindFile(axamlUri);
    if (!filePath) return { ...STATUS_CLOCK_DEFAULT };
    const text = fs.readFileSync(filePath, 'utf8');
    const m = statusMarkerRe(name).exec(text);
    if (!m) return { ...STATUS_CLOCK_DEFAULT };
    const date = (m[1] || '').trim();
    const time = (m[2] || '').trim();
    return {
        date: date || STATUS_CLOCK_DEFAULT.date,
        time: time || STATUS_CLOCK_DEFAULT.time
    };
}

/** Writes the Date/Time format choices into a StatusDate clock's generated `_Loaded` handler by
 *  rewriting its per-second tick line (and stamping a settings marker comment on it). Creates the
 *  default handler first if the clock has none. No-op when the code-behind can't be resolved. */
export async function setStatusDateSettings(axamlUri: vscode.Uri, name: string, date: string, time: string): Promise<void> {
    let filePath = findCodeBehindFile(axamlUri);
    if (!filePath) {
        if (!(await createCodeBehind(axamlUri))) return;
        filePath = findCodeBehindFile(axamlUri);
        if (!filePath) return;
    }
    let language: 'cs' | 'vb' = filePath.toLowerCase().endsWith('.vb') ? 'vb' : 'cs';
    let text = fs.readFileSync(filePath, 'utf8');
    const marker = statusMarker(name, date, time);
    const expr = statusTextExpr({ date, time }, language === 'vb');
    const rewrite = (src: string): { ok: boolean; out: string } => {
        if (language === 'cs') {
            const re = new RegExp(`(timer\\.Tick \\+= \\(_, _\\) => ${escapeRe(name)}\\.Text = )[^;]*;`);
            if (!re.test(src)) return { ok: false, out: src };
            return { ok: true, out: src.replace(re, `$1${expr}; // ${marker}`) };
        }
        const re = new RegExp(`(AddHandler timer\\.Tick, Sub\\(s2, e2\\) ${escapeRe(name)}\\.Text = )[^\\r\\n]*`);
        if (!re.test(src)) return { ok: false, out: src };
        return { ok: true, out: src.replace(re, `$1${expr} ' ${marker}`) };
    };
    let r = rewrite(text);
    if (!r.ok) {
        // No clock handler yet — create the default (OS) one, then rewrite its tick line.
        await insertStatusDateClock(axamlUri, name);
        text = fs.readFileSync(filePath, 'utf8');
        language = filePath.toLowerCase().endsWith('.vb') ? 'vb' : 'cs';
        r = rewrite(text);
        if (!r.ok) return;
    }
    if (r.out !== text) fs.writeFileSync(filePath, r.out, 'utf8');
}

// ---------------- XYTracker (live WxH dimension TextBlock) ----------------

/** What an XY-Tracker reports: 'form' = the window/root client size (used in a Status Bar);
 *  'container' = the size of the control it was dropped into (its immediate parent). */
export type XyTrackerMode = 'form' | 'container';

/** Inserts the C# "live dimensions" Loaded handler (a short DispatcherTimer re-reading the size). */
function insertCsXyTracker(text: string, handler: string, name: string, mode: XyTrackerMode): string | undefined {
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
    const target = mode === 'form'
        // Avalonia 12 has NO Control.TopLevel instance property — use the static attached getter.
        ? `if (sender is Avalonia.Controls.Control c && Avalonia.Controls.TopLevel.GetTopLevel(c) is Avalonia.Controls.TopLevel top)\n${bi}            ${name}.Text = string.Format(System.Globalization.CultureInfo.InvariantCulture, "{0:0} x {1:0} px", top.ClientSize.Width, top.ClientSize.Height);`
        : `if (sender is Avalonia.Controls.Control c && c.Parent is Avalonia.Visual p)\n${bi}            ${name}.Text = string.Format(System.Globalization.CultureInfo.InvariantCulture, "{0:0} x {1:0} px", p.Bounds.Width, p.Bounds.Height);`;
    const method = `\n${bi}private void ${handler}(object sender, Avalonia.Interactivity.RoutedEventArgs e)\n${bi}{\n` +
        `${bi}    var timer = new Avalonia.Threading.DispatcherTimer { Interval = TimeSpan.FromMilliseconds(200) };\n` +
        `${bi}    timer.Tick += (_, _) =>\n${bi}    {\n${bi}        ${target}\n${bi}    };\n` +
        `${bi}    timer.Start();\n${bi}}\n`;
    return text.slice(0, close) + method + text.slice(close);
}

/** Inserts the VB.NET "live dimensions" Loaded handler (a short DispatcherTimer re-reading the size). */
function insertVbXyTracker(text: string, handler: string, name: string, mode: XyTrackerMode): string | undefined {
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
    const target = mode === 'form'
        // Avalonia 12 has NO Control.TopLevel instance property ('TopLevel' is not a member of
        // Control) — use the static attached getter TopLevel.GetTopLevel(visual) to reach the window.
        ? `        Dim top = Avalonia.Controls.TopLevel.GetTopLevel(c)\n${bi}        If top IsNot Nothing Then\n${bi}            ${name}.Text = String.Format(System.Globalization.CultureInfo.InvariantCulture, "{0:0} x {1:0} px", top.ClientSize.Width, top.ClientSize.Height)\n${bi}        End If`
        // Avalonia 12 types Control.Parent as StyledElement (no Bounds) — cast to Visual to read its size.
        : `        Dim p = TryCast(c.Parent, Avalonia.Visual)\n${bi}        If p IsNot Nothing Then\n${bi}            ${name}.Text = String.Format(System.Globalization.CultureInfo.InvariantCulture, "{0:0} x {1:0} px", p.Bounds.Width, p.Bounds.Height)\n${bi}        End If`;
    const method = `\n${bi}Private Sub ${handler}(sender As Object, e As Avalonia.Interactivity.RoutedEventArgs)\n${bi}` +
        `    Dim timer As New Avalonia.Threading.DispatcherTimer With {.Interval = TimeSpan.FromMilliseconds(200)}\n` +
        `${bi}    AddHandler timer.Tick, Sub(s2, e2)\n` +
        `${bi}        Dim c = TryCast(sender, Avalonia.Controls.Control)\n${bi}        ${target}\n` +
        `${bi}    End Sub\n` +
        `${bi}    timer.Start()\n${bi}End Sub\n`;
    return text.slice(0, endIndex) + method + text.slice(endIndex);
}

/**
 * Turns an XYTracker TextBlock into a live WxH display by inserting a `Loaded` handler that runs a
 * short DispatcherTimer updating the control's Text. `mode` selects the source: 'form' shows the
 * top-level (window) client size (for a tracker in a Status Bar); 'container' shows the size of the
 * control it was dropped into (its immediate parent). Creates the code-behind if none exists.
 */
export async function insertXyTrackerClock(axamlUri: vscode.Uri, name: string, mode: XyTrackerMode): Promise<void> {
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
        ? insertCsXyTracker(original, handler, name, mode)
        : insertVbXyTracker(original, handler, name, mode);
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

/**
 * Union of two named-control lists (first wins, order preserved). The VB accessor sync must never
 * drop a control that exists in EITHER the saved XAML on disk or the in-memory model: a control
 * that was just dropped/bound can still be missing from the file, while a control reverted on disk
 * can still be missing from the model. Using only one source silently deletes accessors the
 * code-behind still references (e.g. `Image1` → BC30451).
 */
export function unionNamedControls(
    a: { name: string; type: string }[],
    b: { name: string; type: string }[]
): { name: string; type: string }[] {
    const out: { name: string; type: string }[] = [];
    const seen = new Set<string>();
    for (const c of [...a, ...b]) {
        if (!c.name || seen.has(c.name)) continue;
        seen.add(c.name);
        out.push(c);
    }
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

// ---------------- follower bindings (a read-only control follows one column of a bound grid) ----------------

/** A read-only control (ComboBox / ListBox / ItemsControl) that FOLLOWS one text column of a
 *  DataGrid-bound table. The grid keeps owning the table (its row collection, the "+ Add row…"
 *  placeholder, the live editing); the follower binds its ItemsSource to a `ColumnFollower` built
 *  from exactly that collection, so it lists the column's values live. */
export interface FollowerBindingRef {
    datasetName: string;  // generated DataSet class (e.g. testDataForGrid)
    tableName: string;    // table — its generated row type is <tableName>Row
    controlName: string;  // the follower control's x:Name
    column: string;       // the String column whose values it lists
    ownerGrid: string;    // the DataGrid that owns the row collection
    columnType?: string;  // .adset column type (only String is offered today)
}

/** The bundled helper's type argument for an .adset column type. */
function followerValueType(language: 'cs' | 'vb', columnType?: string): string {
    const cs: Record<string, string> = { String: 'string', Int32: 'int', Int64: 'long', Double: 'double', Boolean: 'bool', DateTime: 'System.DateTime' };
    const vb: Record<string, string> = { String: 'String', Int32: 'Integer', Int64: 'Long', Double: 'Double', Boolean: 'Boolean', DateTime: 'Date' };
    const map = language === 'cs' ? cs : vb;
    return map[columnType ?? 'String'] ?? map.String;
}

/** The variable the generated DataGrid binding keeps its row collection in (e.g. `_customers`).
 *  Read from the code-behind when it is there (the name may have been edited), else the generator's
 *  own naming rule — `_` + camelCase(table). */
function ownerRowsField(text: string, r: FollowerBindingRef): string {
    const re = new RegExp(`^[ \\t]*([A-Za-z_]\\w*)\\s*=\\s*${escapeRe(r.datasetName)}\\.Load${escapeRe(r.tableName)}\\s*\\(`, 'm');
    const m = re.exec(text);
    if (m) return m[1];
    return `_${r.tableName.charAt(0).toLowerCase()}${r.tableName.slice(1)}`;
}

/** The binding statement, e.g.
 *  VB: `ComboBox2.ItemsSource = New ColumnFollower(Of CustomersRow, String)(_customers, Function(r) r.Name, Function(r) r.IsPlaceholder)`
 *  C#: `ComboBox2.ItemsSource = new ColumnFollower<CustomersRow, string>(_customers, r => r.Name, r => r.IsPlaceholder);` */
function followerStatement(language: 'cs' | 'vb', r: FollowerBindingRef, field: string): string {
    const rowType = `${r.tableName}Row`;
    const value = followerValueType(language, r.columnType);
    const expression = language === 'cs'
        ? `new ColumnFollower<${rowType}, ${value}>(${field}, r => r.${r.column}, r => r.IsPlaceholder)`
        : `New ColumnFollower(Of ${rowType}, ${value})(${field}, Function(r) r.${r.column}, Function(r) r.IsPlaceholder)`;
    return language === 'cs'
        ? `${r.controlName}.ItemsSource = ${expression};`
        : `${r.controlName}.ItemsSource = ${expression}`;
}

/** Writes (or re-writes) the follower binding. The line goes directly AFTER the grid's
 *  `Wire<Table>Grid(...)` line, so the row collection exists by the time the follower is built —
 *  inserting it after `InitializeComponent()` would build the follower from a null collection. */
function upsertFollowerLine(text: string, language: 'cs' | 'vb', r: FollowerBindingRef): string | undefined {
    const stmt = followerStatement(language, r, ownerRowsField(text, r));
    const existing = new RegExp(`^([ \\t]*)${escapeRe(r.controlName)}\\.ItemsSource\\s*=\\s*[^\\r\\n]*$`, 'm');
    const m = existing.exec(text);
    if (m) return text.replace(existing, `${m[1]}${stmt}`); // re-binding: stay where it already is

    const insertAfter = (match: RegExpExecArray): string => {
        const lineEnd = text.indexOf('\n', match.index);
        const at = lineEnd < 0 ? text.length : lineEnd;
        const indent = /^[ \t]*/.exec(match[0])?.[0] ?? '        ';
        return text.slice(0, at) + '\n' + indent + stmt + text.slice(at);
    };

    const wire = new RegExp(`^[ \\t]*${escapeRe(r.datasetName)}\\.Wire${escapeRe(r.tableName)}Grid\\([^\\r\\n]*$`, 'm');
    const w = wire.exec(text);
    if (w) return insertAfter(w);
    const ic = /^[ \t]*InitializeComponent\s*\(\s*\)/m.exec(text);
    if (ic) return insertAfter(ic);
    return undefined;
}

/** Writes (or re-writes) the follower binding of a control. Idempotent. */
export async function bindFollowerToColumn(axamlUri: vscode.Uri, r: FollowerBindingRef): Promise<string | undefined> {
    let filePath = findCodeBehindFile(axamlUri);
    if (!filePath) {
        if (!(await createCodeBehind(axamlUri))) return undefined;
        filePath = findCodeBehindFile(axamlUri);
        if (!filePath) return undefined;
    }
    const language: 'cs' | 'vb' = filePath.toLowerCase().endsWith('.vb') ? 'vb' : 'cs';
    const original = fs.readFileSync(filePath, 'utf8');
    const updated = upsertFollowerLine(original, language, r);
    if (!updated) return undefined;
    if (updated !== original) fs.writeFileSync(filePath, updated, 'utf8');
    return filePath;
}

/** What a follower binding line says about itself (for the picker's "current binding" entry). */
export interface FollowerBindingInfo {
    rowType: string;
    valueType: string;
    field: string;
    column: string;
}

/** Reads the follower binding of a control out of the code-behind, or undefined when it has none. */
export function findFollowerBinding(axamlUri: vscode.Uri, controlName: string): FollowerBindingInfo | undefined {
    const filePath = findCodeBehindFile(axamlUri);
    if (!filePath) return undefined;
    let text = '';
    try { text = fs.readFileSync(filePath, 'utf8'); } catch { return undefined; }
    const lineRe = new RegExp(`^[ \\t]*${escapeRe(controlName)}\\.ItemsSource[^\\r\\n]*ColumnFollower[^\\r\\n]*$`, 'm');
    const line = lineRe.exec(text)?.[0];
    if (!line) return undefined;
    const types = /ColumnFollower\s*(?:<([^>]+)>|\(Of\s+([^)]+)\))/.exec(line);
    // Drop the type arguments first: VB writes `ColumnFollower(Of A, B)(args)`, C# `ColumnFollower<A, B>(args)` —
    // splitting the raw line would treat "Of A" as the first argument.
    const call = line.replace(/\(Of\s+[^)]+\)/, '').replace(/<[^>]+>/, '');
    const args = /ColumnFollower\s*\(\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/.exec(call);
    if (!args) return undefined;
    const [rowType, valueType] = (types?.[1] ?? types?.[2] ?? '').split(',').map((s) => s.trim());
    return {
        rowType: rowType ?? `${args[1].trim()}Row`,
        valueType: valueType ?? 'String',
        field: args[1].trim(),
        column: /\.[A-Za-z_]\w*/.exec(args[2])?.[0].slice(1) ?? ''
    };
}

/** True if the control's code-behind carries a follower binding. */
export function hasFollowerBinding(axamlUri: vscode.Uri, controlName: string): boolean {
    return findFollowerBinding(axamlUri, controlName) !== undefined;
}

/** Removes the follower binding of a control (it is an `ItemsSource` line like any other). */
export async function unbindFollower(axamlUri: vscode.Uri, controlName: string): Promise<void> {
    await removeItemsSourceBinding(axamlUri, controlName);
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

// ---------------- Image follows the bound DataGrid's selection (Data Image) ----------------

/** An Image control that shows the image file (absolute path) held in one String column of the
 *  row currently selected in a DataGrid bound to a DataSet table. The Image.Source is driven from
 *  code-behind on grid selection (blank when nothing is selected / the path is empty / the file is
 *  missing). Auto-selects the first row on load so an image shows immediately. */
export interface DataImageRef {
    datasetName: string; // e.g. SmokeData (only used to locate the row type's namespace = project ns)
    tableName: string;   // e.g. Customers  -> typed row class CustomersRow
    controlName: string; // Image control x:Name
    gridName: string;    // DataGrid x:Name whose selection drives the Image
    column: string;      // String column of the row that holds the absolute image-file path
}

function imgMarker(language: 'cs' | 'vb', control: string, grid: string, column: string): string {
    const body = `DataImage: ${control} <- ${grid}.${column}`;
    return language === 'cs' ? `// ${body}` : `' ${body}`;
}

/** Marker line text used to detect/remove the binding (both languages). */
function imgMarkerRe(control: string): RegExp {
    return new RegExp(`^\\s*(?://|')\\s*DataImage:\\s*${escapeRe(control)}\\s*<-\\s*[\\w.]+\\.[\\w.]+`, 'm');
}

/** Matches the generated `BindImage_<control>` method — so the binding is still recognised when the
 *  marker comment is missing (a hand-edited file, or one written by an older extension build). */
function imgBindMethodRe(control: string): RegExp {
    return new RegExp(`\\b(?:private\\s+void|Private\\s+Sub)\\s+BindImage_${escapeRe(control)}\\b`, 'i');
}

/** Inserts just the marker comment above an existing `BindImage_<control>` method — heals a
 *  marker-less file so a later unbind can find the whole block. Returns `t` when the method is
 *  absent. */
function addImgMarker(t: string, language: 'cs' | 'vb', r: DataImageRef): string {
    const m = imgBindMethodRe(r.controlName).exec(t);
    if (!m) return t;
    const lineStart = t.lastIndexOf('\n', m.index) + 1;
    const indent = t.slice(lineStart, m.index).match(/^\s*/)?.[0] ?? '';
    return t.slice(0, lineStart) + indent + imgMarker(language, r.controlName, r.gridName, r.column) + '\n' + t.slice(lineStart);
}

function csDataImageBlock(indent: string, r: DataImageRef): string {
    const row = `${r.tableName}Row`;
    return [
        `${indent}${imgMarker('cs', r.controlName, r.gridName, r.column)}`,
        `${indent}private void BindImage_${r.controlName}()`,
        `${indent}{`,
        `${indent}    ${r.gridName}.SelectionChanged += DataImage_${r.controlName}_OnSelection;`,
        `${indent}    ${r.gridName}.Loaded += DataImage_${r.controlName}_OnLoaded;`,
        `${indent}}`,
        ``,
        `${indent}private void DataImage_${r.controlName}_OnSelection(object? sender, Avalonia.Controls.SelectionChangedEventArgs e)`,
        `${indent}{`,
        `${indent}    DataImage_${r.controlName}_Show(${r.gridName}.SelectedItem as ${row});`,
        `${indent}}`,
        ``,
        `${indent}private void DataImage_${r.controlName}_OnLoaded(object? sender, Avalonia.Interactivity.RoutedEventArgs e)`,
        `${indent}{`,
        `${indent}    if (${r.gridName}.ItemsSource is System.Collections.ObjectModel.ObservableCollection<${row}> src && src.Count > 0 && ${r.gridName}.SelectedItem == null) ${r.gridName}.SelectedIndex = 0;`,
        `${indent}}`,
        ``,
        `${indent}private void DataImage_${r.controlName}_Show(${row}? row)`,
        `${indent}{`,
        `${indent}    ${r.controlName}.Source = null;`,
        `${indent}    if (row != null && !row.IsPlaceholder && !string.IsNullOrEmpty(row.${r.column}))`,
        `${indent}    {`,
        `${indent}        // EXIF-aware load (bundled ExifImageLoader.cs): Avalonia's Bitmap ignores the JPEG`,
        `${indent}        // Orientation tag, so route through the helper to bake the rotation/flip in upright.`,
        `${indent}        try { ${r.controlName}.Source = ExifImageLoader.LoadImageOriented(row.${r.column}); }`,
        `${indent}        catch { /* file missing or unreadable — leave the image blank */ }`,
        `${indent}    }`,
        `${indent}}`,
        ``
    ].join('\n');
}

function vbDataImageBlock(indent: string, r: DataImageRef): string {
    const row = `${r.tableName}Row`;
    return [
        `${indent}${imgMarker('vb', r.controlName, r.gridName, r.column)}`,
        `${indent}Private Sub BindImage_${r.controlName}()`,
        `${indent}    AddHandler ${r.gridName}.SelectionChanged, AddressOf DataImage_${r.controlName}_OnSelection`,
        `${indent}    AddHandler ${r.gridName}.Loaded, AddressOf DataImage_${r.controlName}_OnLoaded`,
        `${indent}End Sub`,
        ``,
        `${indent}Private Sub DataImage_${r.controlName}_OnSelection(sender As Object, e As Avalonia.Controls.SelectionChangedEventArgs)`,
        `${indent}    DataImage_${r.controlName}_Show(TryCast(${r.gridName}.SelectedItem, ${row}))`,
        `${indent}End Sub`,
        ``,
        `${indent}Private Sub DataImage_${r.controlName}_OnLoaded(sender As Object, e As Avalonia.Interactivity.RoutedEventArgs)`,
        `${indent}    Dim src As System.Collections.ObjectModel.ObservableCollection(Of ${row}) = TryCast(${r.gridName}.ItemsSource, System.Collections.ObjectModel.ObservableCollection(Of ${row}))`,
        `${indent}    If src IsNot Nothing AndAlso src.Count > 0 AndAlso ${r.gridName}.SelectedItem Is Nothing Then ${r.gridName}.SelectedIndex = 0`,
        `${indent}End Sub`,
        ``,
        `${indent}Private Sub DataImage_${r.controlName}_Show(row As ${row})`,
        `${indent}    ${r.controlName}.Source = Nothing`,
        `${indent}    If row IsNot Nothing AndAlso Not row.IsPlaceholder AndAlso Not String.IsNullOrEmpty(row.${r.column}) Then`,
        `${indent}        Try`,
        `${indent}            ' EXIF-aware load (bundled ExifImageLoader.vb): Avalonia's Bitmap ignores the`,
        `${indent}            ' JPEG Orientation tag, so route through the helper to bake it upright.`,
        `${indent}            ${r.controlName}.Source = ExifImageLoader.LoadImageOriented(row.${r.column})`,
        `${indent}        Catch`,
        `${indent}        End Try`,
        `${indent}    End If`,
        `${indent}End Sub`,
        ``
    ].join('\n');
}

/**
 * Writes the Data-Image binding into the form's code-behind (creating it first if needed):
 * a marker comment + the selection handlers + a constructor call. Idempotent — returns the
 * code-behind path (or undefined on failure). `rowType` must exist in the project namespace.
 */
export async function bindImageToGrid(axamlUri: vscode.Uri, r: DataImageRef): Promise<string | undefined> {
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
        ? csInsertDataImage(original, r, base)
        : vbInsertDataImage(original, r, base);
    if (!updated || updated === original) return filePath;
    fs.writeFileSync(filePath, updated, 'utf8');
    return filePath;
}

function csInsertDataImage(text: string, r: DataImageRef, className?: string): string | undefined {
    let t = text;
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

    // Idempotent: skip when this control's marker is already present; if only the METHODS are there
    // (marker lost by a hand-edit / older build) re-add the marker instead of duplicating them.
    if (imgMarkerRe(r.controlName).test(t)) return t;
    if (imgBindMethodRe(r.controlName).test(t)) return addImgMarker(t, 'cs', r);

    const block = csDataImageBlock(bodyIndent, r);
    // Insert the method block just before the class's closing brace.
    t = t.slice(0, close) + '\n' + block + t.slice(close);

    // Constructor call right after InitializeComponent();
    const ic = /InitializeComponent\s*\(\)\s*;/.exec(t);
    if (ic) {
        const lineEnd = t.indexOf('\n', ic.index);
        const icLineStart = t.lastIndexOf('\n', ic.index) + 1;
        const icIndent = t.slice(icLineStart, ic.index).match(/^\s*/)?.[0] ?? bodyIndent;
        const call = `${icIndent}BindImage_${r.controlName}();`;
        if (!t.includes(call)) {
            const at = lineEnd < 0 ? t.length : lineEnd;
            t = t.slice(0, at) + '\n' + call + t.slice(at);
        }
    }
    return t;
}

function vbInsertDataImage(text: string, r: DataImageRef, className?: string): string | undefined {
    let t = text;
    const clsRe = className
        ? new RegExp(`\\bClass\\s+${escapeRe(className)}\\b`, 'i')
        : /\bClass\s+(\w+)/i;
    const m = clsRe.exec(t);
    if (!m) return undefined;
    // End Class is at an ABSOLUTE index in `t` — do NOT add m.index to it again.
    const em = /End\s+Class/i.exec(t);
    if (!em) return undefined;
    const endIndex = em.index;
    const lineStart = t.lastIndexOf('\n', m.index) + 1;
    const indent = t.slice(lineStart, m.index).match(/^\s*/)?.[0] ?? '';
    const bodyIndent = indent + '    ';

    // Idempotent: skip when the marker is present; if only the METHODS are there (marker lost by a
    // hand-edit / older build) re-add the marker instead of duplicating them.
    if (imgMarkerRe(r.controlName).test(t)) return t;
    if (imgBindMethodRe(r.controlName).test(t)) return addImgMarker(t, 'vb', r);

    const block = vbDataImageBlock(bodyIndent, r);
    // Insert the methods just before End Class.
    t = t.slice(0, endIndex) + '\n' + block + t.slice(endIndex);

    // Constructor call right after InitializeComponent()
    const ic = /InitializeComponent\s*\(\)/i.exec(t);
    if (ic) {
        const lineEnd = t.indexOf('\n', ic.index);
        const icLineStart = t.lastIndexOf('\n', ic.index) + 1;
        const icIndent = t.slice(icLineStart, ic.index).match(/^\s*/)?.[0] ?? bodyIndent;
        const call = `${icIndent}BindImage_${r.controlName}()`;
        if (!t.includes(call)) {
            const at = lineEnd < 0 ? t.length : lineEnd;
            t = t.slice(0, at) + '\n' + call + t.slice(at);
        }
    }
    return t;
}

/** True if the form's code-behind already carries a Data-Image binding for the control. */
export function hasDataImageBinding(axamlUri: vscode.Uri, controlName: string): boolean {
    const filePath = findCodeBehindFile(axamlUri);
    if (!filePath) return false;
    try {
        const text = fs.readFileSync(filePath, 'utf8');
        // The marker is the fast path; the generated BindImage_ method also proves the binding
        // exists (a marker-less file is still bound).
        return imgMarkerRe(controlName).test(text) || imgBindMethodRe(controlName).test(text);
    } catch { return false; }
}

/** Removes the Data-Image binding (marker + handlers + constructor call) for the control. */
export async function unbindImageFromGrid(axamlUri: vscode.Uri, controlName: string): Promise<void> {
    const filePath = findCodeBehindFile(axamlUri);
    if (!filePath) return;
    const language: 'cs' | 'vb' = filePath.toLowerCase().endsWith('.vb') ? 'vb' : 'cs';
    let t = fs.readFileSync(filePath, 'utf8');

    // Remove the whole contiguous block: from the marker line (or, when the marker was lost, the
    // BindImage_ method) to the end of the Show method.
    const markerM = imgMarkerRe(controlName).exec(t);
    const bindM = imgBindMethodRe(controlName).exec(t);
    let changed = false;
    if (markerM || bindM) {
        const blockStart = t.lastIndexOf('\n', (markerM ?? bindM)!.index) + 1;
        const showSig = language === 'cs'
            ? new RegExp(`private void DataImage_${escapeRe(controlName)}_Show\\s*\\(`)
            : new RegExp(`Private Sub DataImage_${escapeRe(controlName)}_Show\\s*\\(`);
        const sig = showSig.exec(t.slice(blockStart));
        if (sig) {
            const sigIndex = blockStart + sig.index;
            let end = -1;
            if (language === 'cs') {
                const ob = t.indexOf('{', sigIndex);
                if (ob >= 0) { const cb = matchingBrace(t, ob); if (cb >= 0) end = cb + 1; }
            } else {
                // VB: first End Sub line after the Show signature closes it (Show has no nesting).
                const es = /^\s*End Sub[ \t]*$/gm.exec(t.slice(sigIndex));
                if (es) end = sigIndex + es.index + es[0].length;
            }
            if (end >= 0) {
                t = t.slice(0, blockStart) + t.slice(end);
                changed = true;
            }
        }
    }

    // Remove the constructor call line.
    const callRe = language === 'cs'
        ? new RegExp(`^[ \\t]*BindImage_${escapeRe(controlName)}\\(\\);?[ \\t]*\\r?\\n`, 'gm')
        : new RegExp(`^[ \\t]*BindImage_${escapeRe(controlName)}\\(\\)[ \\t]*\\r?\\n`, 'gm');
    const t2 = t.replace(callRe, '');
    if (t2 !== t) changed = true;

    if (changed) fs.writeFileSync(filePath, t2, 'utf8');
}
