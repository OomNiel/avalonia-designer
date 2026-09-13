/**
 * codeBehindCheck.ts — the "Code Fix…" utility.
 *
 * A form's code-behind drifts out of sync with its .axaml / .adset whenever something is edited by
 * hand (in a text editor) or when the designer adds/removes/renames controls. The compiler then
 * fails with errors that are hard to trace back to the change that caused them:
 *
 *   - BC30451 "'Image1' is not declared"        → VB has no auto-generated name fields; the
 *                                                 FindControl accessor was never written.
 *   - BC30269 "multiple definitions with identical signatures"
 *                                               → a generated block (Data-Image) got inserted twice
 *                                                 because its `' DataImage:` marker was lost.
 *   - "no accessible method matches"            → the XAML wires Click="X" but X was deleted.
 *   - leftover `Sub Button1_Click` + timer.Start()/End Sub
 *                                               → the control was deleted, the handler stayed.
 *   - "Unable to find suitable property/type"   → a bundled helper file (ChromeWindow, GrumpyPanel,
 *                                                 ExifImageLoader, AnchorHelper) is missing, or a
 *                                                 needed Imports is absent.
 *
 * This module DETECTS those problems against the live form (the designer passes its in-memory XAML)
 * and FIXES the ones that can be fixed mechanically. Anything requiring a human decision (a name
 * that isn't a valid identifier, a control renamed in the XAML but used under its old name, …) is
 * reported only.
 *
 * Findings are also published as diagnostics, so they show up in the PROBLEMS pane and as squiggles
 * in the .vb / .cs file.
 *
 * Deliberately dependency-free of the webview: the designer panel calls `analyzeCodeBehind` +
 * `applyLocalFix` (or performs the DataSet-dependent fixes itself, which need the .adset spec).
 */
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
    findCodeBehindFile,
    namedControlsInAxaml,
    unionNamedControls,
    syncVbAccessors,
    insertHandlerIntoCodeBehind,
    unbindImageFromGrid,
    removeItemsSourceBinding,
    convertCodeBehindToChrome,
    vbMatchingEnd
} from './codeBehind';
import { eventArgsFor, isKnownEventName, knownEventArgsFor } from './controlEvents';

// ---------------- model ----------------

/** Fixes this module can apply on its own (pure file edits). */
export type LocalFixKind =
    | 'rebuild-accessors'        // missing / stale VB accessor properties
    | 'remove-duplicate-method'  // BC30269
    | 'remove-orphaned-handler'  // handler of a control that no longer exists
    | 'insert-handler'           // XAML wires an event, no such method
    | 'fix-handler-signature'    // handler exists, wrong EventArgs
    | 'insert-initialize'        // InitializeComponent() missing
    | 'add-binding-call'         // Data-Image block present, ctor call missing
    | 'restamp-marker'           // Data-Image block present, `' DataImage:` marker lost
    | 'remove-orphan-call'       // BindImage_X() called, block gone and nothing to regenerate
    | 'unbind-image'             // binding refers to a control / grid that no longer exists
    | 'remove-items-source'      // ItemsSource set on a control that no longer exists
    | 'add-import'               // missing Imports / using
    | 'convert-chrome';          // ChromeWindow root, code-behind still Inherits Window

/** Fixes that need the .adset spec / bundled resources, so the designer panel performs them. */
export type PanelFixKind = 'regenerate-binding' | 'rebind-grid' | 'copy-bundled-helper'
    /** Inline `<ComboBoxItem>` children must go before an ItemsSource can be used. */
    | 'remove-inline-items'
    /** A follower binding whose grid/table/column is gone. */
    | 'drop-follower'
    /** The XAML wires a handler that was renamed in the code-behind: point the form at the new name. */
    | 'repoint-handler'
    /** The user deleted (or renamed) the handler on purpose: drop the event attribute from the form. */
    | 'unwrap-handler'
    /** "Leave my code alone": suppress this exact finding until the form is reopened. */
    | 'dismiss';

export type CodeFixKind = LocalFixKind | PanelFixKind | 'report-only';

/**
 * A SECOND way to resolve the same finding, offered as an extra button next to **Fix**. The first
 * fix is always the one that repairs the form the way it was; an alternative is the "the edit was
 * deliberate, follow it" route (e.g. a handler deleted by hand → unwire the form instead of
 * re-creating the method).
 */
export interface CodeAlternative {
    /** How the alternative would be applied — same dispatch as a primary fix kind. */
    kind: CodeFixKind;
    /** Button label, e.g. "Keep my delete — unwire it". */
    label: string;
    /** Tooltip: exactly what it will change. */
    detail: string;
    /** Payload for the alternative (merged over the finding's own `data`). */
    data?: Record<string, string>;
}

export interface CodeIssue {
    /** Stable per-run id — used by the webview to request exactly this fix. */
    id: string;
    severity: 'error' | 'warning';
    kind: CodeFixKind;
    /** One-line summary shown in the findings list. */
    title: string;
    /** Why it is a problem and what the fix will do. */
    detail: string;
    /** 1-based line in the file the issue points at. */
    line?: number;
    /** Which of the two files the line belongs to (default: the code-behind). */
    file?: 'code' | 'axaml';
    /** Control / handler / member the issue is about. */
    member?: string;
    /** Fixer payload (handler name, occurrence index, grid, column, …). */
    data?: Record<string, string>;
    /** Extra, equivalent-in-rank fixes the user may choose instead (see CodeAlternative). */
    alternatives?: CodeAlternative[];
}

/** What the designer panel knows about the form's DataSets (used by the binding checks). */
export interface DataSetGridInfo {
    datasetName: string;
    datasetClass: string;
    tableName: string;
    rowType: string;
    columns: string[];
    gridName: string;
}
export interface DataSetImageInfo {
    datasetName: string;
    datasetClass: string;
    tableName: string;
    rowType: string;
    controlName: string;
    gridName: string;
    column: string;
}
/** A read-only control that follows one text column of a grid-owned table. */
export interface DataSetFollowerInfo {
    datasetName: string;
    tableName: string;
    rowType: string;
    column: string;
    controlName: string;
    ownerGrid: string;
    adsetPath: string;
}
export interface DataSetContext {
    /** Class names of the project's generated DataSet classes (e.g. testDataForGrid). */
    datasetClasses: string[];
    grids: DataSetGridInfo[];
    images: DataSetImageInfo[];
    /** Read-only controls that follow a grid-bound table's column (live). */
    followers: DataSetFollowerInfo[];
}

export interface CheckOptions {
    /** The form's XAML as the DESIGNER sees it (unsaved edits included). Defaults to the file on disk. */
    axamlText?: string;
    /** Named controls the designer knows about (union of the saved file + the in-memory model). */
    controls?: { name: string; type: string }[];
    dataSet?: DataSetContext;
}

export interface CheckResult {
    codeFile?: string;
    language: 'cs' | 'vb';
    issues: CodeIssue[];
}

// ---------------- small text utilities ----------------

function readText(p: string): string {
    try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 1-based line number of a character offset. */
function lineAt(text: string, index: number): number {
    let line = 1;
    for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') line++;
    return line;
}

/** Index of the `}` matching the `{` at `open`, or -1. */
function matchingBrace(text: string, open: number): number {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) return i; }
    }
    return -1;
}

/**
 * Index just past the `End Sub`/`End Function` matching the method body starting at `from`.
 * Shared with the code-behind edits (see `vbMatchingEnd` in ./codeBehind): nested blocks are
 * counted, single-line `Sub(…) stmt` / `Function(x) expr` lambdas are not — that is exactly the bug
 * that used to make a generated follower / status-clock line run an enclosing method's span past its
 * own `End Sub` (or collapse it), which in turn reported a bogus `InitializeComponent()` error.
 */

// ---------------- XAML facts ----------------

/** Events the designer generates / Avalonia controls commonly wire, used to recognise
 *  `Event="Handler"` attributes (a plain `="SomeName"` value on an unrelated property is not an
 *  event). Recognised via the shared event CATALOG (`isKnownEventName`) rather than a private copy:
 *  the local list this file used to keep had drifted from the picker, so events the picker offered
 *  but the list omitted were never checked at all. */

/** EventArgs per event, where the designer KNOWS the signature it generates. Events that are not
 *  listed here are never signature-checked (a wrong guess would break valid user code). */
/** Where the EventArgs differs per control (Window.Opened = EventArgs, Menu.Opened = RoutedEventArgs),
 *  `eventArgsFor` resolves it with the control tag; this is only the no-tag fallback. */
const KNOWN_EVENT_ARGS: Record<string, string> = {
    Click: 'Avalonia.Interactivity.RoutedEventArgs',
    Loaded: 'Avalonia.Interactivity.RoutedEventArgs',
    Unloaded: 'Avalonia.Interactivity.RoutedEventArgs'
};

const VB_ACCESSOR_DECL = /^[ \t]*Private\s+ReadOnly\s+Property\s+([A-Za-z_]\w*)\s+As\s+([\w.]+)\s*$/gmi;

export interface AxamlEvent {
    control: string;
    tag: string;
    event: string;
    handler: string;
    line: number;
}

/**
 * A stable identity for a finding, independent of its line number: the dismiss feature remembers it
 * for the session, so "leave my code alone" keeps holding while the file is edited.
 */
export function issueSignature(issue: CodeIssue): string {
    const d = issue.data ?? {};
    return [issue.kind, issue.member ?? '', d.control ?? '', d.event ?? '', d.helper ?? '',
    d.namespace ?? '', d.name ?? ''].join('|');
}

/**
 * "The manual edit was deliberate" for a finding the designer could otherwise repair: it is not
 * applied to any file, it just stops this one finding from being reported again while the form is
 * open. Every fixable finding gets it, so a hand-edited code-behind never forces a repair.
 */
function dismissAlternative(): CodeAlternative {
    return {
        kind: 'dismiss',
        label: 'Leave it — keep my code',
        detail: 'Nothing is changed: this finding is hidden until you reopen the form. Use it when the ' +
            'manual edit is what you want and Code Fix should stop asking.'
    };
}

/**
 * "The manual edit was deliberate" alternative for a wired-but-missing (or renamed) handler: drop
 * the event attribute from the form so the control is not wired at all. The code-behind — whatever
 * the user made of it — is never touched.
 */
function unwireAlternative(e: { control: string; tag: string; event: string; handler: string }, label: string): CodeAlternative {
    return {
        kind: 'unwrap-handler',
        label,
        detail: `Removes ${e.event}="${e.handler}" from ${e.control || 'the control'} in the form, so the ` +
            'control is not wired for that event any more. The code-behind is left exactly as you wrote it.',
        data: { control: e.control, event: e.event, handler: e.handler, tag: e.tag }
    };
}

export interface AxamlFacts {
    text: string;
    className: string;
    rootLocal: string;
    rootPrefix: string;
    rootNs: string;
    names: { name: string; type: string }[];
    duplicateNames: string[];
    invalidNames: string[];
    events: AxamlEvent[];
    /** Named controls that hold inline item children (e.g. `<ComboBox><ComboBoxItem …>`). */
    inlineItems: Set<string>;
}

/** The span of an element's children, plus how many element children it has. */
function childSpan(text: string, openIndex: number): { count: number; start: number; end: number } {
    const tagEnd = text.indexOf('>', openIndex);
    if (tagEnd < 0) return { count: 0, start: openIndex, end: openIndex };
    if (text[tagEnd - 1] === '/') return { count: 0, start: tagEnd, end: tagEnd };
    let depth = 1;
    let count = 0;
    const tagRe = /<\/?([A-Za-z_][\w.:]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
    tagRe.lastIndex = tagEnd + 1;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(text))) {
        const raw = m[0];
        const isClose = raw.startsWith('</');
        const selfClosing = raw.endsWith('/>');
        if (isClose) {
            depth--;
            if (depth === 0) return { count, start: tagEnd + 1, end: m.index };
        } else if (selfClosing) {
            if (depth === 1) count++;
        } else {
            if (depth === 1) count++;
            depth++;
        }
    }
    return { count, start: tagEnd + 1, end: text.length };
}

/** Reads the form's XAML (from the designer's in-memory copy when given) and extracts the facts the
 *  checks need: named controls, event wiring, the class/root type and the root namespace. */
export function axamlFacts(axamlUri: vscode.Uri, axamlText?: string): AxamlFacts {
    const text = (axamlText ?? readText(axamlUri.fsPath)).replace(/\uFEFF/g, '');
    const facts: AxamlFacts = {
        text, className: '', rootLocal: '', rootPrefix: '', rootNs: '',
        names: [], duplicateNames: [], invalidNames: [], events: [], inlineItems: new Set<string>()
    };

    const classM = /x:Class\s*=\s*"([^"]+)"/i.exec(text);
    if (classM) facts.className = classM[1].split('.').pop() ?? '';

    const rootM = /<\s*(?:([A-Za-z_][\w-]*):)?([A-Za-z_][\w.]*)((?:"[^"]*"|'[^']*'|[^>"'])*)/i.exec(text);
    if (rootM) {
        facts.rootPrefix = rootM[1] ?? '';
        facts.rootLocal = rootM[2] ?? '';
        if (facts.rootPrefix) {
            const nsM = new RegExp(`xmlns:${escapeRe(facts.rootPrefix)}\\s*=\\s*"([^"]+)"`, 'i').exec(text);
            if (nsM) {
                const usingM = /^using:([^;]+)/i.exec(nsM[1]) || /^clr-namespace:([^;]+)/i.exec(nsM[1]);
                if (usingM) facts.rootNs = usingM[1].trim();
            }
        }
    }

    const tagRe = /<\s*([A-Za-z_][\w.:]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
    const seen = new Set<string>();
    const openIndexes = new Map<string, number>();
    let tag: RegExpExecArray | null;
    while ((tag = tagRe.exec(text))) {
        const tagName = tag[1];
        const type = tagName.split(':').pop() ?? tagName;
        const attrs = tag[2] ?? '';
        const attrRe = /([A-Za-z_][\w.:-]*)\s*=\s*"([^"]*)"/g;
        let attr: RegExpExecArray | null;
        let name = '';
        const localEvents: { event: string; handler: string }[] = [];
        while ((attr = attrRe.exec(attrs))) {
            const key = attr[1];
            const value = attr[2];
            if (key === 'x:Name' || key === 'Name') {
                if (!name) name = value;
                continue;
            }
            // `DragDrop.DragOver="…"` qualifies the event; a bare name must be a known event.
            const eventName = key.includes('.') ? key.split('.').pop()! : key;
            if (isKnownEventName(eventName) && /^[A-Za-z_]\w*$/.test(value)) {
                localEvents.push({ event: eventName, handler: value });
            }
        }
        // x:Name wins; `Name=` is the Avalonia synonym and registers in the name scope too.
        if (!name) {
            const nameM = /(?:x:Name|(?<![:\w])Name)\s*=\s*"([^"]+)"/.exec(attrs);
            if (nameM) name = nameM[1];
        }
        if (name) {
            if (!/^[A-Za-z_]\w*$/.test(name)) facts.invalidNames.push(name);
            else if (seen.has(name)) facts.duplicateNames.push(name);
            else { seen.add(name); facts.names.push({ name, type }); openIndexes.set(name, tag.index); }
        }
        for (const e of localEvents) {
            facts.events.push({
                control: name, tag: type, event: e.event, handler: e.handler,
                line: lineAt(text, tag.index)
            });
        }
    }
    // Inline item children per named control — Avalonia can't combine those with an ItemsSource.
    for (const [name, at] of openIndexes) {
        if (childSpan(text, at).count > 0) facts.inlineItems.add(name);
    }
    return facts;
}

// ---------------- code-behind facts ----------------

interface CodeMethod {
    name: string;
    /** Raw parameter list including the parentheses. */
    params: string;
    /** Character offset of the declaration's first character (start of its line). */
    start: number;
    /** Character offset just past the method (End Sub / closing brace + line break). */
    end: number;
    line: number;
    /** 1-based index among declarations with the same name (for duplicate removal). */
    occurrence: number;
}

interface CodeFacts {
    text: string;
    /** Text with the BOM stripped (analysis only; writes restore it). */
    body: string;
    hadBom: boolean;
    language: 'cs' | 'vb';
    className: string;
    baseType: string;
    imports: string[];
    accessors: { name: string; type: string; start: number; end: number }[];
    methods: CodeMethod[];
    /** `BindImage_X()` calls in the constructor. */
    bindingCalls: { name: string; line: number }[];
    /** `' DataImage: X <- grid.col` markers. */
    markers: { control: string; grid: string; column: string; line: number }[];
    /** `X.ItemsSource = …` statements. */
    itemsSources: { control: string; expression: string; line: number }[];
    /** `InitializeComponent()` offset (or -1). */
    initComponent: number;
    ctors: CodeMethod[];
    lines: string[];
}

function parseCode(codeFile: string, text: string): CodeFacts {
    const language: 'cs' | 'vb' = codeFile.toLowerCase().endsWith('.vb') ? 'vb' : 'cs';
    const hadBom = text.charCodeAt(0) === 0xFEFF;
    const body = text.replace(/\uFEFF/g, '');
    const f: CodeFacts = {
        text, body, hadBom, language, className: '', baseType: '', imports: [],
        accessors: [], methods: [], bindingCalls: [], markers: [], itemsSources: [],
        initComponent: -1, ctors: [], lines: body.split('\n')
    };

    if (language === 'vb') {
        const clsM = /^[ \t]*(?:Public\s+|Friend\s+|Partial\s+)*Class\s+([A-Za-z_]\w*)/mi.exec(body);
        if (clsM) f.className = clsM[1];
        const inh = /^[ \t]*Inherits\s+([\w.]+)/mi.exec(body);
        if (inh) f.baseType = inh[1];
        const impRe = /^[ \t]*Imports\s+([\w.]+)/gmi;
        let m: RegExpExecArray | null;
        while ((m = impRe.exec(body))) f.imports.push(m[1]);
    } else {
        // Line-anchored so a `// class Dummy is unrelated` comment cannot be mistaken for the form's
        // own class — the constructor lookup below relies on this name being right.
        const clsM = /^[ \t]*(?:(?:public|internal|private|protected|sealed|abstract|partial|static)\s+)*class\s+([A-Za-z_]\w*)(?:\s*:\s*([\w.]+))?/m.exec(body);
        if (clsM) {
            f.className = clsM[1];
            if (clsM[2]) f.baseType = clsM[2];
        }
        const impRe = /^[ \t]*using\s+([\w.]+)\s*;/gm;
        let m: RegExpExecArray | null;
        while ((m = impRe.exec(body))) f.imports.push(m[1]);
    }

    // VB accessor properties (generated FindControl properties) + their spans.
    VB_ACCESSOR_DECL.lastIndex = 0;
    let acc: RegExpExecArray | null;
    while ((acc = VB_ACCESSOR_DECL.exec(body))) {
        const start = body.lastIndexOf('\n', acc.index) + 1;
        const endProp = /^[ \t]*End\s+Property[ \t]*$/gmi;
        endProp.lastIndex = acc.index;
        const endM = endProp.exec(body);
        const end = endM ? endM.index + endM[0].length : acc.index + acc[0].length;
        f.accessors.push({ name: acc[1], type: acc[2], start, end });
    }

    // Method declarations with spans.
    const declRe = language === 'vb'
        ? /^[ \t]*(?:(?:Private|Public|Friend|Protected|Protected\s+Friend|Shared|Overrides|Overloads|Async|NotOverridable|MustOverride)\s+)*(Sub|Function)\s+([A-Za-z_]\w*)\s*(\([^)]*\))/gmi
        : /^[ \t]*(?:(?:public|private|protected|internal|static|async|override|virtual|new)\s+)*void\s+([A-Za-z_]\w*)\s*(\([^)]*\))/gm;
    const counts = new Map<string, number>();
    let d: RegExpExecArray | null;
    while ((d = declRe.exec(body))) {
        const name = language === 'vb' ? d[2] : d[1];
        const params = language === 'vb' ? d[3] : d[2];
        const start = body.lastIndexOf('\n', d.index) + 1;
        let end: number;
        if (language === 'vb') {
            const e = vbMatchingEnd(body, d.index + d[0].length);
            end = e < 0 ? d.index + d[0].length : e;
        } else {
            const open = body.indexOf('{', d.index);
            const close = open < 0 ? -1 : matchingBrace(body, open);
            end = close < 0 ? d.index + d[0].length : close + 1;
        }
        while (end < body.length && (body[end] === '\r' || body[end] === '\n')) end++;
        const n = (counts.get(name) ?? 0) + 1;
        counts.set(name, n);
        f.methods.push({ name, params, start, end, line: lineAt(body, d.index), occurrence: n });
        if (name === 'New' || name === f.className) f.ctors.push(f.methods[f.methods.length - 1]);
    }

    // C# constructors have no return type, so the `void`-based declaration regex above cannot see
    // them. Without this pass a C# form with a perfectly good constructor looked constructor-less:
    // a bogus "No constructor / InitializeComponent" warning, and fixes that added a SECOND
    // constructor (CS0111) instead of calling into the existing one.
    // Matching the class name plus a body brace keeps ordinary call statements out (`Foo();` ends
    // with a semicolon, which the `[^;{]*` before the brace rejects).
    if (language === 'cs' && f.className) {
        const ctorRe = new RegExp(
            '^[ \\t]*(?:(?:public|private|protected|internal|static|extern|unsafe|partial)\\s+)*' +
            escapeRe(f.className) + '\\s*(\\([^)]*\\))[^;{]*\\{', 'gm');
        let c: RegExpExecArray | null;
        while ((c = ctorRe.exec(body))) {
            const open = c.index + c[0].length - 1;
            const close = matchingBrace(body, open);
            let end = close < 0 ? c.index + c[0].length : close + 1;
            while (end < body.length && (body[end] === '\r' || body[end] === '\n')) end++;
            const n = (counts.get(f.className) ?? 0) + 1;
            counts.set(f.className, n);
            const method: CodeMethod = {
                name: f.className, params: c[1], start: body.lastIndexOf('\n', c.index) + 1,
                end, line: lineAt(body, c.index), occurrence: n
            };
            f.methods.push(method);
            f.ctors.push(method);
        }
    }

    // Data-Image markers.
    const markerRe = /^[ \t]*(?:\/\/|')\s*DataImage:\s*([A-Za-z_]\w*)\s*<-\s*([\w.]+)\.([\w.]+)/gmi;
    let mk: RegExpExecArray | null;
    while ((mk = markerRe.exec(body))) {
        f.markers.push({ control: mk[1], grid: mk[2], column: mk[3], line: lineAt(body, mk.index) });
    }

    // Constructor calls: BindImage_X()
    const callRe = language === 'vb'
        ? /^[ \t]*BindImage_([A-Za-z_]\w*)\s*\(\s*\)/gmi
        : /^[ \t]*BindImage_([A-Za-z_]\w*)\s*\(\s*\)\s*;/gm;
    let c: RegExpExecArray | null;
    while ((c = callRe.exec(body))) f.bindingCalls.push({ name: c[1], line: lineAt(body, c.index) });

    // X.ItemsSource = …
    const isRe = /^[ \t]*([A-Za-z_]\w*)\.ItemsSource\s*=\s*(.+?)[ \t]*;?[ \t]*$/gmi;
    let is: RegExpExecArray | null;
    while ((is = isRe.exec(body))) {
        f.itemsSources.push({ control: is[1], expression: is[2].trim(), line: lineAt(body, is.index) });
    }

    const ic = /^[ \t]*InitializeComponent\s*\(\s*\)/mi.exec(body);
    if (ic) f.initComponent = ic.index;

    return f;
}

// ---------------- analysis ----------------

/** DataSet row members that are NOT columns — ignored when reading a column name out of a
 *  generated Data-Image block. */
const KNOWN_ROW_MEMBERS = new Set(['IsPlaceholder', 'HasErrors', 'RowError', 'RowState', 'ItemArray', 'Table', 'IsNull']);

const DATA_IMAGE_PREFIXES = ['DataImage_', 'BindImage_'];
/** Method-name prefixes the designer generates that must never be treated as `<Control>_<Event>`
 *  leftovers (they are not tied to a control name). */
const GENERATED_PREFIXES = ['DataImage_', 'BindImage_', 'InsertImage_', 'XyTracker_', 'StatusClock_'];
function isGeneratedName(name: string): boolean {
    return GENERATED_PREFIXES.some((p) => name.startsWith(p));
}

/**
 * Analyses the form's code-behind against its XAML (+ the DataSet context the designer supplies)
 * and returns every problem it can explain. Never throws.
 */
export function analyzeCodeBehind(axamlUri: vscode.Uri, opts: CheckOptions = {}): CheckResult {
    const ax = axamlFacts(axamlUri, opts.axamlText);
    const codeFile = findCodeBehindFile(axamlUri);
    if (!codeFile) {
        return {
            language: 'vb',
            issues: [{
                id: 'no-code-behind',
                severity: 'warning',
                kind: 'report-only',
                title: 'No code-behind file found',
                detail: 'This form has no .axaml.cs / .axaml.vb sibling that declares its class, so event handlers cannot be checked or generated.'
            }]
        };
    }
    const text = readText(codeFile);
    const code = parseCode(codeFile, text);
    const language = code.language;
    const issues: CodeIssue[] = [];
    const add = (i: Omit<CodeIssue, 'id'> & { id?: string }): void => {
        // Every FIXABLE finding also offers "leave my code as it is" (a session dismissal) — the
        // counterpart of the primary repair, for when the manual edit was the intention. Findings
        // that describe a manual edit the designer can follow (a deleted handler → unwire the form)
        // bring their own, more useful alternative and simply get this added as well.
        const alternatives = [...(i.alternatives ?? [])];
        if (i.kind !== 'report-only' && alternatives.some((a) => a.kind === 'dismiss') === false) {
            alternatives.push(dismissAlternative());
        }
        issues.push({ ...i, alternatives, id: i.id ?? `${i.kind}:${i.member ?? i.title}:${i.line ?? 0}` });
    };

    const controls = unionNamedControls(opts.controls ?? [], ax.names);
    const controlNames = new Set(controls.map((c) => c.name));

    // ---- 1) VB named-control accessors (missing → BC30451, stale → dead code) ----
    if (language === 'vb') {
        const declared = new Set(code.accessors.map((a) => a.name));
        for (const c of controls) {
            if (declared.has(c.name)) continue;
            add({
                severity: 'error', kind: 'rebuild-accessors', member: c.name,
                title: `Accessor for "${c.name}" is missing`,
                detail: `VB has no auto-generated name fields, so every named control needs a ` +
                    `\`Private ReadOnly Property ${c.name}\` (FindControl). Without it every use of ` +
                    `${c.name} fails with BC30451. Fix: rebuild the accessor block from the form.`,
                data: { control: c.name, type: c.type }
            });
        }
        for (const a of code.accessors) {
            if (controlNames.has(a.name)) continue;
            const outside = code.body.slice(0, a.start) + code.body.slice(a.end);
            const uses = new RegExp(`\\b${escapeRe(a.name)}\\b`, 'g');
            const count = (outside.match(uses) ?? []).length;
            add({
                severity: 'warning', kind: count === 0 ? 'rebuild-accessors' : 'report-only',
                member: a.name, line: lineAt(code.body, a.start),
                title: count === 0
                    ? `Accessor for deleted control "${a.name}" is left over`
                    : `Accessor "${a.name}" has no matching control`,
                detail: count === 0
                    ? 'The control no longer exists in the form. Fix: drop the accessor.'
                    : `The control no longer exists in the form, but the code-behind still uses ` +
                    `"${a.name}" ${count} time(s) — update or delete those references first, then re-run the check ` +
                    '(deleting the accessor now would only move the error).',
                data: { control: a.name }
            });
        }
    }

    // ---- 2) duplicate method definitions (BC30269 / CS0111) ----
    const bySig = new Map<string, CodeMethod[]>();
    for (const m of code.methods) {
        const key = `${m.name}(${m.params.replace(/\s+/g, '').toLowerCase()})`;
        const list = bySig.get(key) ?? [];
        list.push(m);
        bySig.set(key, list);
    }
    for (const [, list] of bySig) {
        if (list.length < 2) continue;
        for (let i = 1; i < list.length; i++) {
            const dup = list[i];
            add({
                severity: 'error', kind: 'remove-duplicate-method', member: dup.name, line: dup.line,
                title: `"${dup.name}" is defined ${list.length} times`,
                detail: `Identical signatures are a compile error (` +
                    `${language === 'vb' ? 'BC30269' : 'CS0111'}). Typical cause: a generated block was ` +
                    `inserted twice. Fix: delete this (later) copy.`,
                data: { name: dup.name, params: dup.params, occurrence: String(dup.occurrence) }
            });
        }
    }

    // ---- 3) handlers the XAML wires but that don't exist ----
    const handlersInXaml = new Set(ax.events.map((e) => e.handler));
    const methodNames = new Set(code.methods.map((m) => m.name));
    for (const e of ax.events) {
        if (methodNames.has(e.handler)) continue;
        // Renamed by hand? A method whose signature already fits this event and whose name is a
        // near-miss of the wired one is offered as a RE-POINT (the code is left untouched).
        const renamed = renameCandidates(e.handler, eventArgsFor(e.event, e.tag), code.methods);
        if (renamed) {
            add({
                severity: 'error', kind: 'repoint-handler', member: e.handler, line: e.line, file: 'axaml',
                title: `${e.tag} ${e.event}="${e.handler}" — renamed to "${renamed.name}"?`,
                detail: `The form still wires "${e.handler}", but "${renamed.name}" takes the parameter ` +
                    `list a ${e.event} handler needs. Fix: point the form's ${e.event} attribute at ` +
                    `"${renamed.name}" — your code is left exactly as it is. If the rename was meant to ` +
                    'get rid of the handler, use the second button instead.',
                data: { handler: e.handler, event: e.event, tag: e.tag, control: e.control, found: renamed.name },
                alternatives: [unwireAlternative(e, 'Keep my rename — unwire it')]
            });
            continue;
        }
        add({
            severity: 'error', kind: 'insert-handler', member: e.handler, line: e.line, file: 'axaml',
            title: `${e.tag} ${e.event}="${e.handler}" has no handler`,
            detail: 'The XAML compiler fails with "no accessible method matches" while the handler is ' +
                'missing. Fix: insert an empty handler with the correct signature. If you deleted the ' +
                'handler on purpose, use the second button to drop the wiring from the form instead.',
            data: { handler: e.handler, event: e.event, tag: e.tag },
            alternatives: [unwireAlternative(e, 'Keep my delete — unwire it')]
        });
    }

    // ---- 4) handler signature doesn't match the event ----
    for (const e of ax.events) {
        // Tag-AWARE. Window.Opened, NumericUpDown.ValueChanged and DatePicker.SelectedDateChanged all
        // take a different EventArgs than the generic table says. This check used to compare against
        // that generic table while the code WRITER used the tag-aware lookup — so it demanded a type
        // other than the one just generated, and published "wrong parameter type" errors on correct,
        // freshly generated handlers (whose offered fix rewrote the signature to the same wrong text).
        // `knownEventArgsFor` returns undefined for events the catalog does not know, which keeps the
        // "never guess a signature" rule intact.
        const expected = knownEventArgsFor(e.event, e.tag) ?? KNOWN_EVENT_ARGS[e.event];
        if (!expected) continue;
        const method = code.methods.find((m) => m.name === e.handler);
        if (!method) continue;
        const want = expected.split('.').pop()!;
        if (method.params.includes(want)) continue;
        add({
            severity: 'error', kind: 'fix-handler-signature', member: e.handler, line: method.line,
            title: `${e.handler} has the wrong parameter type`,
            detail: `A ${e.event} handler must take (sender, ${want}). Fix: rewrite the signature ` +
                '(the body is left untouched). If the mismatch comes from YOUR edit and you want the ' +
                'event gone instead, use the second button.',
            data: { handler: e.handler, event: e.event, occurrence: String(method.occurrence), tag: e.tag },
            alternatives: [unwireAlternative(e, 'Keep my signature — unwire it')]
        });
    }

    // ---- 5) handler left over from a deleted control ----
    for (const m of code.methods) {
        const m2 = /^([A-Za-z_]\w*)_([A-Za-z_]\w*)$/.exec(m.name);
        if (!m2) continue;
        const [full, controlPart, eventPart] = m2;
        if (isGeneratedName(m.name)) continue;
        if (isKnownEventName(eventPart) === false) continue; // not a `<Control>_<Event>` handler
        if (controlNames.has(controlPart)) continue;
        if (handlersInXaml.has(full)) continue; // still wired by another control
        add({
            severity: 'warning', kind: 'remove-orphaned-handler', member: m.name, line: m.line,
            title: `"${m.name}" belongs to the deleted control "${controlPart}"`,
            detail: 'Nothing in the form references this handler any more. Fix: delete the whole method ' +
                '(nested anonymous Sub/Function blocks included, so no stray `End Sub` is left behind).',
            data: { name: m.name, occurrence: String(m.occurrence) }
        });
    }

    // ---- 6) InitializeComponent() missing ----
    const ctor = code.ctors[0];
    if (!ctor) {
        add({
            severity: 'warning', kind: 'insert-initialize',
            title: 'No constructor / InitializeComponent',
            detail: 'Without it the window is empty at runtime (the XAML is never loaded). Fix: insert ' +
                'a constructor that calls InitializeComponent().'
        });
    } else if (!/InitializeComponent\s*\(\s*\)/.test(code.body.slice(ctor.start, ctor.end))) {
        add({
            severity: 'error', kind: 'insert-initialize', line: ctor.line,
            title: 'InitializeComponent() is missing from the constructor',
            detail: 'The form would come up empty. Fix: insert the call as the first statement.',
            data: { instance: String(ctor.occurrence) }
        });
    }

    // ---- 7) Data-Image bindings (structure) ----
    const imageBlocks = new Map<string, { marker?: boolean; bind: boolean; show: boolean; sel: boolean; loaded: boolean; grid?: string; column?: string }>();
    const entry = (name: string) => {
        let e = imageBlocks.get(name);
        if (!e) { e = { bind: false, show: false, sel: false, loaded: false }; imageBlocks.set(name, e); }
        return e;
    };
    for (const mk of code.markers) {
        const e = entry(mk.control);
        e.marker = true;
        e.grid = mk.grid;
        e.column = mk.column;
    }
    for (const m of code.methods) {
        const bm = /^BindImage_([A-Za-z_]\w*)$/.exec(m.name);
        if (bm) { entry(bm[1]).bind = true; continue; }
        const dm = /^DataImage_([A-Za-z_]\w*)_(OnSelection|OnLoaded|Show)$/.exec(m.name);
        if (dm) {
            const e = entry(dm[1]);
            if (dm[2] === 'OnSelection') e.sel = true;
            else if (dm[2] === 'OnLoaded') e.loaded = true;
            else e.show = true;
        }
    }
    // Derive a binding reference from the block itself — needed to re-stamp a lost marker, and to
    // report that the binding's grid is gone. The grid comes from the block's own selection
    // listener, the column from the `row.<Column>` the Show method loads (never a DataSet
    // bookkeeping member such as IsPlaceholder, which is what a naive first-match would pick).
    const derivedRef = (control: string): { grid: string; column: string } | undefined => {
        const e = imageBlocks.get(control);
        if (e?.grid && e.column) return { grid: e.grid, column: e.column };
        const bind = code.methods.find((m) => m.name === `BindImage_${control}`);
        const show = code.methods.find((m) => m.name === `DataImage_${control}_Show`);
        let grid = '';
        if (bind) {
            const gm = /([A-Za-z_]\w*)\.SelectionChanged/.exec(code.body.slice(bind.start, bind.end));
            if (gm) grid = gm[1];
        }
        let column = '';
        if (show) {
            const body = code.body.slice(show.start, show.end);
            const re = /\brow\.([A-Za-z_]\w*)/g;
            let m: RegExpExecArray | null;
            while ((m = re.exec(body))) {
                if (KNOWN_ROW_MEMBERS.has(m[1])) continue;
                // Prefer the column the image is actually loaded from, else the first real one.
                const used = new RegExp(`(?:LoadImageOriented|IsNullOrEmpty)\\(row\\.${escapeRe(m[1])}`).test(body);
                if (used) { column = m[1]; break; }
                if (!column) column = m[1];
            }
        }
        if (!grid || !column) return undefined;
        return { grid, column };
    };

    for (const [control, e] of imageBlocks) {
        const ref = derivedRef(control);
        if (ref) { e.grid = ref.grid; e.column = ref.column; }
        const exists = controlNames.has(control);
        if (!exists) {
            add({
                severity: 'error', kind: 'unbind-image', member: control,
                line: code.markers.find((m) => m.control === control)?.line,
                title: `Data-Image binding for deleted "${control}"`,
                detail: 'The Image control no longer exists in the form. Fix: remove the binding block ' +
                    '(marker + handlers + constructor call).',
                data: { control }
            });
            continue;
        }
        if (!e.bind || !e.show) {
            add({
                severity: 'error',
                kind: opts.dataSet?.images.some((i) => i.controlName === control) ? 'regenerate-binding' : 'unbind-image',
                member: control,
                title: `Data-Image binding for "${control}" is incomplete`,
                detail: 'The constructor calls BindImage_' + control + '() but its methods are missing ' +
                    '(a partial/hand-edited block). Fix: regenerate the block from the binding recorded ' +
                    'on the table, or remove the leftover call.',
                data: { control, ...(ref ? { grid: ref.grid, column: ref.column } : {}) }
            });
            continue;
        }
        if (!e.marker) {
            add({
                severity: 'warning', kind: ref ? 'restamp-marker' : 'report-only', member: control,
                title: `Data-Image marker for "${control}" was lost`,
                detail: 'Without the `\' DataImage:` comment a later re-bind cannot see the existing ' +
                    'block and inserts a SECOND copy of the handlers (compile error BC30269).' +
                    (ref ? ' Fix: re-stamp the marker.' : ' Fix manually: add the marker comment above BindImage_' + control + '().'),
                data: { control, ...(ref ? { grid: ref.grid, column: ref.column } : {}) }
            });
        }
        if (e.grid && !controlNames.has(e.grid)) {
            add({
                severity: 'error', kind: 'unbind-image', member: control,
                title: `Data-Image binding drives "${control}" from the deleted grid "${e.grid}"`,
                detail: 'The DataGrid it listens to is gone. Fix: remove the binding (then bind the Image again).',
                data: { control }
            });
        }
    }
    for (const call of code.bindingCalls) {
        const e = imageBlocks.get(call.name);
        if (e?.bind) continue;
        add({
            severity: 'error',
            kind: opts.dataSet?.images.some((i) => i.controlName === call.name) ? 'regenerate-binding' : 'remove-orphan-call',
            member: call.name, line: call.line,
            title: `BindImage_${call.name}() has no method`,
            detail: `The constructor calls it, but the block is missing (BC30451/CS0103). ` +
                (opts.dataSet?.images.some((i) => i.controlName === call.name)
                    ? 'Fix: regenerate the block from the binding recorded on the table.'
                    : 'Fix: remove the call.'),
            data: { control: call.name }
        });
    }

    // ---- 8) Data-Image / DataSet member drift (needs the .adset context) ----
    const ds = opts.dataSet;
    if (ds) {
        for (const img of ds.images) {
            const e = imageBlocks.get(img.controlName);
            if (!e) continue;
            if (!controlNames.has(img.controlName)) continue; // handled above
            // `row.<Column>` inside the block must still be a column of the bound table.
            const usesRow = new RegExp(`\\b${escapeRe(img.rowType)}\\b`).test(code.body);
            const grid = ds.grids.find((g) => g.gridName === img.gridName);
            const colOk = !grid || grid.columns.length === 0 || grid.columns.includes(img.column);
            if (!colOk || !usesRow) {
                add({
                    severity: 'error', kind: 'regenerate-binding', member: img.controlName,
                    title: `Data-Image binding for "${img.controlName}" no longer matches the table`,
                    detail: !colOk
                        ? `The binding uses column "${img.column}", which no longer exists in table ` +
                        `"${img.tableName}" (renamed or deleted?). Fix: re-generate the binding from the table.`
                        : `The binding references row type "${img.rowType}", which the generated class no ` +
                        `longer defines. Fix: re-generate the binding from the table.`,
                    data: { control: img.controlName, grid: img.gridName, column: img.column }
                });
            }
        }
        // `<dataset>.Load<Table>()` / `Wire<Table>Grid(...)` calls must match the current tables.
        for (const cls of ds.datasetClasses) {
            const callRe = new RegExp(`\\b${escapeRe(cls)}\\.(Load|Wire)([A-Za-z_]\\w*)`, 'g');
            let m: RegExpExecArray | null;
            while ((m = callRe.exec(code.body))) {
                const verb = m[1];
                const tail = m[2].replace(/Grid$/, '');
                const known = ds.grids.some((g) => g.tableName === tail);
                if (known) continue;
                const grid = ds.grids.find((g) => code.body.includes(g.gridName));
                add({
                    severity: 'error', kind: grid ? 'rebind-grid' : 'report-only',
                    member: grid?.gridName ?? `${cls}.${m[1]}${m[2]}`,
                    line: lineAt(code.body, m.index),
                    title: `${cls}.${verb}${m[2]} refers to a table that no longer exists`,
                    detail: `The DataSet no longer defines "${tail}" (renamed or deleted). Fix: ` +
                        (grid ? `re-generate the binding of "${grid.gridName}" from the DataSet.` : 'rebind the control from the DataSet.'),
                    data: { control: grid?.gridName ?? '', dataset: cls }
                });
            }
        }
        // A table bound to a grid that the code-behind never feeds.
        for (const g of ds.grids) {
            if (!controlNames.has(g.gridName)) continue;
            if (code.itemsSources.some((s) => s.control === g.gridName)) continue;
            if (!code.body.includes(g.datasetClass)) continue;
            // The designer feeds a grid in one of two ways: an `ItemsSource = …` statement, or the
            // generated `Wire<Table>Grid(<grid>, rows)` call. Either one counts.
            const wired = new RegExp(`\\bWire${escapeRe(g.tableName)}Grid\\s*\\(`).test(code.body)
                || new RegExp(`\\bLoad${escapeRe(g.tableName)}\\s*\\(`).test(code.body);
            if (wired) continue;
            add({
                severity: 'warning', kind: 'rebind-grid', member: g.gridName,
                title: `${g.gridName} has no ItemsSource line`,
                detail: `Table "${g.tableName}" is bound to this grid, but the code-behind never sets ` +
                    'ItemsSource — the grid stays empty at runtime. Fix: re-generate the binding.',
                data: { control: g.gridName, dataset: g.datasetClass }
            });
        }
    }

    // ---- 9) ItemsSource on a deleted control ----
    for (const s of code.itemsSources) {
        if (controlNames.has(s.control)) continue;
        if (ds && ds.datasetClasses.includes(s.control)) continue; // a DataSet object, not a control
        add({
            severity: 'error', kind: 'remove-items-source', member: s.control, line: s.line,
            title: `ItemsSource is set on the deleted control "${s.control}"`,
            detail: 'The control no longer exists in the form (BC30451/CS0103). Fix: remove the statement.',
            data: { control: s.control }
        });
    }

    // ---- 9b) inline items AND an ItemsSource (Avalonia throws at runtime) ----
    for (const s of code.itemsSources) {
        if (!ax.inlineItems.has(s.control)) continue;
        add({
            severity: 'error', kind: 'remove-inline-items', member: s.control, line: s.line,
            title: `"${s.control}" has inline items AND an ItemsSource`,
            detail: 'Avalonia can only use one of the two — with both, the app throws '
                + '"Items collection must be empty before using ItemsSource." at startup. '
                + 'Fix: remove the inline items (the data binding stays).'
        });
    }

    // ---- 9c) follower bindings whose grid / table column is gone ----
    if (ds) {
        for (const f of ds.followers) {
            if (!controlNames.has(f.controlName)) continue; // the deleted-control rule covers this
            const grid = ds.grids.find((g) => g.gridName === f.ownerGrid);
            if (grid && grid.columns.includes(f.column)) continue;
            add({
                severity: 'error', kind: 'drop-follower', member: f.controlName,
                title: `The follower binding of "${f.controlName}" is broken`,
                detail: grid
                    ? `It lists column "${f.column}", which no longer exists in table "${f.tableName}". `
                    + 'Fix: remove the follower binding (or bind it to another column).'
                    : `The DataGrid "${f.ownerGrid}" it follows is gone (or the table is no longer bound `
                    + 'to a grid). Fix: remove the follower binding.',
                data: { control: f.controlName, adsetPath: f.adsetPath, tableName: f.tableName }
            });
        }
    }

    // ---- 10) bundled helper files the project must contain ----
    const proj = projectDirOf(axamlUri);
    const ext = language === 'vb' ? 'vb' : 'cs';
    const needsHelper = (helper: string, used: boolean): void => {
        if (!used || !proj) return;
        const file = `${helper}.${ext}`;
        const dirs = [proj, path.dirname(axamlUri.fsPath)];
        if (dirs.some((d) => fs.existsSync(path.join(d, file)))) return;
        add({
            severity: 'error', kind: 'copy-bundled-helper', member: helper,
            title: `${helper}.${ext} is missing from the project`,
            detail: `The code uses the bundled ${helper} helper, but the file is not in the project ` +
                'folder, so the build fails with a "type not defined" error. Fix: copy it in from the ' +
                "extension's bundled resources.",
            data: { helper }
        });
    };
    needsHelper('ExifImageLoader', /\bExifImageLoader\b/.test(code.body) || /\bExifImageLoader\b/.test(ax.text));
    const usesChrome = /AvaloniaChrome\.ChromeWindow|\bChromeWindow\b/.test(code.body) || /\bchrome:ChromeWindow\b/.test(ax.text);
    needsHelper('ChromeWindow', usesChrome && (ax.rootLocal === 'ChromeWindow' || /ChromeWindow/.test(code.baseType)));
    needsHelper('GrumpyPanel', /\bGrumpyPanel\b/.test(code.body) || /\bchrome:GrumpyPanel\b/.test(ax.text));
    needsHelper('PathPicker', /\bPathPicker\b/.test(code.body) || /\bchrome:PathPicker\b/.test(ax.text));
    needsHelper('AnchorHelper', /\bAnchorHelper\b/.test(code.body) || /\bchrome:AnchorHelper\b/.test(ax.text));
    needsHelper('ColumnFollower', /\bColumnFollower\b/.test(code.body));

    // ---- 11) missing Imports / using ----
    const imports = new Set(code.imports);
    const needImport = (ns: string, used: boolean): void => {
        if (!used || imports.has(ns)) return;
        add({
            severity: 'error', kind: 'add-import', member: ns,
            title: `Imports ${ns} is missing`,
            detail: `The file uses a type from ${ns} without importing it, which fails as ` +
                '(BC30002 / CS0246) "type is not defined". Fix: add the ' +
                (language === 'vb' ? 'Imports' : 'using') + ' statement.',
            data: { namespace: ns }
        });
    };
    needImport('Avalonia.Controls.Shapes',
        /\bAs\s+(?:Line|Rectangle|Ellipse|Arc|Sector|Polygon|Polyline|Path|Shape)\b/.test(code.body));
    needImport('AvaloniaChrome', /\bAs\s+(?:GrumpyPanel|ChromeWindow|PathPicker)\b/.test(code.body));
    needImport('Avalonia.Platform.Storage', /\b(?:FilePickerFileTypes|StorageProvider|FilePickerOpenOptions)\b/.test(code.body));
    needImport('System.Data', /\bAs\s+(?:DataTable|DataRow|DataSet)\b/.test(code.body));
    needImport('Avalonia.Input', /\bAs\s+(?:PointerEventArgs|KeyEventArgs|TappedEventArgs)\b/.test(code.body));

    // ---- 12) ChromeWindow root but the class still inherits Window ----
    const rootIsChrome = /ChromeWindow/.test(ax.rootLocal);
    const baseIsChrome = /ChromeWindow/.test(code.baseType);
    if (rootIsChrome && !baseIsChrome && !code.baseType.includes('.')) {
        add({
            severity: 'error', kind: 'convert-chrome',
            title: `The code-behind still inherits ${code.baseType || 'Window'}`,
            detail: 'The form root is <chrome:ChromeWindow>, so the class must inherit ' +
                'AvaloniaChrome.ChromeWindow — otherwise the XAML does not compile. Fix: change the base type.',
            data: { base: code.baseType }
        });
    } else if (!rootIsChrome && baseIsChrome) {
        add({
            severity: 'warning', kind: 'report-only',
            title: 'The code-behind inherits ChromeWindow but the form root is not a ChromeWindow',
            detail: `The XAML root is <${ax.rootPrefix ? ax.rootPrefix + ':' : ''}${ax.rootLocal}>. Change one of ` +
                'the two by hand so they match.',
            data: { base: code.baseType }
        });
    }

    // ---- 13) report-only: names / class mismatch ----
    for (const n of ax.invalidNames) {
        add({
            severity: 'error', kind: 'report-only', member: n, file: 'axaml',
            title: `"${n}" is not a valid identifier`,
            detail: 'A control name must start with a letter/underscore and contain only letters, digits ' +
                'and underscores, otherwise no accessor and no handler name can be generated. Rename the control.'
        });
    }
    for (const n of ax.duplicateNames) {
        add({
            severity: 'error', kind: 'report-only', member: n, file: 'axaml',
            title: `The name "${n}" is used more than once`,
            detail: 'FindControl returns only the first match, so the code-behind silently works on the ' +
                'wrong control. Rename one of them.'
        });
    }
    if (ax.className && code.className && ax.className !== code.className) {
        add({
            severity: 'error', kind: 'report-only',
            title: `x:Class is "${ax.className}" but the file declares "${code.className}"`,
            detail: 'The XAML and the code-behind must describe the same class. Fix one of the two by hand.'
        });
    }

    return { codeFile, language, issues };
}

/** Directory that holds the project file (the bundled helpers live next to it). */
function projectDirOf(axamlUri: vscode.Uri): string | undefined {
    let dir = path.dirname(axamlUri.fsPath);
    for (let i = 0; i < 4; i++) {
        try {
            const files = fs.readdirSync(dir);
            if (files.some((f) => /\.(cs|vb)proj$/i.test(f))) return dir;
        } catch { return undefined; }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return undefined;
}

// ---------------- fixes ----------------

/** Copies the code-behind into the extension's storage before the first fix of a run. */
export function backupCodeBehind(codeFile: string, backupRoot: string): string | undefined {
    try {
        fs.mkdirSync(backupRoot, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const dest = path.join(backupRoot, `${path.basename(codeFile)}.${stamp}.bak`);
        fs.copyFileSync(codeFile, dest);
        return dest;
    } catch { return undefined; }
}

/** Index of the newline that ends the line a position sits on (or the end of the text). */
function lineEndFrom(text: string, pos: number): number {
    const lineEnd = text.indexOf('\n', pos);
    return lineEnd < 0 ? text.length : lineEnd;
}

/**
 * Where a statement may be inserted into a C# method body: just past the line that carries the
 * body's opening `{`. Inserting after the signature line instead would put the statement in front of
 * an Allman-style brace sitting on its own line — invalid C#.
 */
function csBodyLineEnd(text: string, declIndex: number): number {
    const paren = text.indexOf(')', declIndex);
    let open = paren < 0 ? -1 : text.indexOf('{', paren);
    if (open < 0) open = text.indexOf('{', declIndex);
    if (open < 0) return -1;
    return lineEndFrom(text, open);
}

/**
 * The method a XAML-wired handler was most likely RENAMED to — the classic manual edit: the form
 * still says `Click="Button1_Click"` while the code-behind now declares `Button1_Clicked` (or the
 * other way round: the attribute was renamed and the method kept the old name). Only methods whose
 * parameter list already matches the event's delegate are considered, and only when EXACTLY ONE
 * candidate is plausible — this must never guess, or it would silently point a form at the wrong
 * method (the alternative finding, "insert the missing handler", is always safe).
 */
export function renameCandidates(
    wired: string,
    expectedArgs: string,
    methods: { name: string; params: string }[]
): { name: string } | undefined {
    const want = expectedArgs.split('.').pop()!;
    // "Plausible rename": one name is a prefix/suffix of the other (Button1_Click ↔ Button1_Clicked)
    // with enough shared characters that unrelated handlers (Button2_Click) can't match.
    const related = (a: string, b: string): boolean => {
        if (Math.min(a.length, b.length) < 6) return false;
        return a.startsWith(b) || b.startsWith(a) || a.endsWith(b) || b.endsWith(a);
    };
    const hits = methods.filter((m) => m.name !== wired && m.params.includes(want) && related(wired, m.name));
    return hits.length === 1 ? { name: hits[0].name } : undefined;
}

/** Removes one method by its analysed span (line-start .. past the terminator). */
function removeMethodAt(text: string, start: number, end: number): string {
    return text.slice(0, start) + text.slice(end);
}

/** Applies an issue whose fix only needs the code-behind / XAML files. Returns a short report. */
export async function applyLocalFix(axamlUri: vscode.Uri, issue: CodeIssue, opts: CheckOptions = {}): Promise<string> {
    const codeFile = findCodeBehindFile(axamlUri);
    if (!codeFile) return 'No code-behind file to fix.';
    const read = (): string => readText(codeFile);
    const write = (s: string): void => { fs.writeFileSync(codeFile, s, 'utf8'); };
    const language: 'cs' | 'vb' = codeFile.toLowerCase().endsWith('.vb') ? 'vb' : 'cs';
    const controls = unionNamedControls(opts.controls ?? [], axamlFacts(axamlUri, opts.axamlText).names);
    const data = issue.data ?? {};

    switch (issue.kind) {
        case 'rebuild-accessors': {
            await syncVbAccessors(axamlUri, controls);
            return 'Rebuilt the VB control accessors from the form.';
        }
        case 'remove-duplicate-method':
        case 'remove-orphaned-handler': {
            const want = Number(data.occurrence ?? '1');
            const facts = parseCode(codeFile, read());
            const method = facts.methods.filter((m) => m.name === data.name)[want - 1];
            if (!method) return `"${data.name}" was already removed.`;
            write(removeMethodAt(facts.body, method.start, method.end));
            return `Removed the duplicate/leftover "${data.name}".`;
        }
        case 'insert-handler': {
            const r = await insertHandlerIntoCodeBehind(axamlUri, data.handler, data.event, data.tag);
            return r ? `Added the missing handler "${data.handler}".` : 'Could not insert the handler.';
        }
        case 'fix-handler-signature': {
            const facts = parseCode(codeFile, read());
            const method = facts.methods.filter((m) => m.name === data.handler)[Number(data.occurrence ?? '1') - 1];
            if (!method) return `Handler "${data.handler}" is gone.`;
            const full = eventArgsFor(data.event, data.tag);
            const params = language === 'vb'
                ? `(sender As Object, e As ${full})`
                : `(object? sender, ${full} e)`;
            const at = facts.body.indexOf('(', method.start);
            const close = facts.body.indexOf(')', at);
            if (at < 0 || close < 0) return 'Could not read the handler signature.';
            const body = facts.body.slice(0, at) + params + facts.body.slice(close + 1);
            write(facts.hadBom ? '\uFEFF' + body : body);
            return `Re-signed "${data.handler}" for ${data.event}.`;
        }
        case 'insert-initialize': {
            const facts = parseCode(codeFile, read());
            let body = facts.body;
            if (facts.ctors.length === 0) {
                const clsRe = language === 'vb'
                    ? /^[ \t]*(?:Public\s+|Friend\s+|Partial\s+)*Class\s+[A-Za-z_]\w*/mi
                    : /\bclass\s+[A-Za-z_]\w*(?:\s*:\s*[\w.]+)?/;
                const m = clsRe.exec(body);
                if (!m) return 'Could not find the class declaration.';
                // Safety net: a constructor the analyser could not parse (an unusual attribute or
                // modifier layout) must never be duplicated — CS0111 would break the build. If the
                // class name is followed by a parameter list anywhere, treat THAT as the constructor
                // and only insert the missing call into it.
                const ctorLook = facts.className
                    ? new RegExp('^[ \\t]*(?:(?:public|private|protected|internal)\\s+)*' +
                        escapeRe(facts.className) + '\\s*\\([^)]*\\)', 'm').exec(body)
                    : null;
                let at: number;
                const insertAtLineEndAfter = (from: number, brace: boolean): number => {
                    let pos = from;
                    if (brace) {
                        const open = body.indexOf('{', from);
                        if (open < 0) return -1;
                        pos = open;
                    }
                    const lineEnd = body.indexOf('\n', pos);
                    return lineEnd < 0 ? body.length : lineEnd;
                };
                if (ctorLook) {
                    const guarded = insertAtLineEndAfter(ctorLook.index, false);
                    if (guarded >= 0) {
                        const indent = (body.slice(ctorLook.index).match(/^[ \t]*/)?.[0] ?? '') + '    ';
                        const call = language === 'vb'
                            ? `\n${indent}InitializeComponent()`
                            : `\n${indent}InitializeComponent();`;
                        body = body.slice(0, guarded) + call + body.slice(guarded);
                        write(facts.hadBom ? '\uFEFF' + body : body);
                        return 'Initialized the form in the existing constructor.';
                    }
                }
                // VB: insert below the `Class …` line — but after its `Inherits …` statement, which
                // VB requires to be the first declaration in the class body (BC30125/BC30246).
                // C#: the body opens with `{` — the constructor has to go INSIDE it.
                if (language === 'vb') {
                    at = insertAtLineEndAfter(m.index + m[0].length, false);
                    for (let guard = 0; guard < 3 && at >= 0; guard++) {
                        const lineStart = at + (body[at] === '\n' ? 1 : 0);
                        const line = (body.slice(lineStart).match(/^[^\r\n]*/) ?? [''])[0];
                        if (!/^[ \t]*Inherits\b/i.test(line)) break;
                        at = insertAtLineEndAfter(lineStart, false);
                    }
                } else {
                    at = insertAtLineEndAfter(m.index + m[0].length, true);
                }
                if (at < 0) return 'Could not find the class body.';
                const ctor = language === 'vb'
                    ? `\n    Public Sub New()\n        InitializeComponent()\n    End Sub\n`
                    : `\n    public ${facts.className}()\n    {\n        InitializeComponent();\n    }\n`;
                body = body.slice(0, at) + ctor + body.slice(at);
            } else {
                const ctor = facts.ctors[0];
                const at = language === 'vb' ? lineEndFrom(body, ctor.start) : csBodyLineEnd(body, ctor.start);
                if (at < 0) return 'Could not find the constructor body.';
                const indent = (body.slice(ctor.start).match(/^[ \t]*/)?.[0] ?? '') + '    ';
                const call = language === 'vb'
                    ? `\n${indent}InitializeComponent()`
                    : `\n${indent}InitializeComponent();`;
                body = body.slice(0, at) + call + body.slice(at);
            }
            write(facts.hadBom ? '\uFEFF' + body : body);
            return 'Initialized the form in the constructor.';
        }
        case 'add-binding-call': {
            const facts = parseCode(codeFile, read());
            const ctor = facts.ctors[0];
            if (!ctor) return 'No constructor to add the call to.';
            // After InitializeComponent(): the grid this binding wires up does not exist before it
            // (a Data-Image call placed above it would throw a NullReferenceException at runtime).
            const ctorBody = facts.body.slice(ctor.start, ctor.end);
            const ic = /^[ \t]*InitializeComponent\s*\(\s*\)\s*;?[ \t]*$/m.exec(ctorBody);
            const at = ic
                ? lineEndFrom(facts.body, ctor.start + ic.index)
                : (language === 'vb' ? lineEndFrom(facts.body, ctor.start) : csBodyLineEnd(facts.body, ctor.start));
            if (at < 0) return 'Could not find the constructor body.';
            const indent = (facts.body.slice(ctor.start).match(/^[ \t]*/)?.[0] ?? '') + '    ';
            const call = language === 'vb' ? `\n${indent}BindImage_${data.control}()` : `\n${indent}BindImage_${data.control}();`;
            const body = facts.body.slice(0, at) + call + facts.body.slice(at);
            write(facts.hadBom ? '\uFEFF' + body : body);
            return `Called BindImage_${data.control}() from the constructor.`;
        }
        case 'restamp-marker': {
            const facts = parseCode(codeFile, read());
            let body = facts.body;
            const bindRe = language === 'vb'
                ? new RegExp(`^[ \\t]*(?:Private\\s+)?Sub\\s+BindImage_${escapeRe(data.control)}\\b`, 'mi')
                : new RegExp(`^[ \\t]*(?:private\\s+)?void\\s+BindImage_${escapeRe(data.control)}\\b`, 'mi');
            const m = bindRe.exec(body);
            if (!m) return `BindImage_${data.control}() was not found.`;
            // The regex is anchored at the start of the line, so its match already contains the
            // indentation (measuring before `m.index` would always come back empty).
            const indent = /^[ \t]*/.exec(m[0])?.[0] ?? '';
            const start = body.lastIndexOf('\n', m.index) + 1;
            const marker = language === 'vb'
                ? `${indent}' DataImage: ${data.control} <- ${data.grid}.${data.column}\n`
                : `${indent}// DataImage: ${data.control} <- ${data.grid}.${data.column}\n`;
            body = body.slice(0, start) + marker + body.slice(start);
            write(facts.hadBom ? '\uFEFF' + body : body);
            return `Re-stamped the Data-Image marker for ${data.control}.`;
        }
        case 'remove-orphan-call': {
            const facts = parseCode(codeFile, read());
            const re = language === 'vb'
                ? new RegExp(`^[ \\t]*BindImage_${escapeRe(data.control)}\\s*\\(\\)[ \\t]*\\r?\\n`, 'mi')
                : new RegExp(`^[ \\t]*BindImage_${escapeRe(data.control)}\\s*\\(\\)\\s*;[ \\t]*\\r?\\n`, 'mi');
            const body = facts.body.replace(re, '');
            if (body === facts.body) return 'The call was already gone.';
            write(facts.hadBom ? '\uFEFF' + body : body);
            return `Removed the leftover BindImage_${data.control}() call.`;
        }
        case 'unbind-image': {
            await unbindImageFromGrid(axamlUri, data.control);
            return `Removed the Data-Image binding of ${data.control}.`;
        }
        case 'remove-items-source': {
            await removeItemsSourceBinding(axamlUri, data.control);
            return `Removed the ItemsSource statement of ${data.control}.`;
        }
        case 'add-import': {
            const facts = parseCode(codeFile, read());
            let body = facts.body;
            const ns = data.namespace;
            const line = language === 'vb' ? `Imports ${ns}` : `using ${ns};`;
            const lines = body.split('\n');
            let insertAt = 0;
            for (let i = 0; i < lines.length; i++) {
                const l = lines[i].trim();
                if (language === 'vb' ? l.startsWith('Imports ') : l.startsWith('using ')) insertAt = i + 1;
                if (language === 'vb' ? /^(Class|Module|Public Class|Friend Class)\b/i.test(l) : /^(namespace|public class|internal class|class)\b/i.test(l)) break;
            }
            lines.splice(insertAt, 0, line);
            body = lines.join('\n');
            write(facts.hadBom ? '\uFEFF' + body : body);
            return `Added ${line}.`;
        }
        case 'convert-chrome': {
            await convertCodeBehindToChrome(axamlUri);
            return 'Changed the base class to AvaloniaChrome.ChromeWindow.';
        }
        default:
            return 'This problem has to be fixed by hand.';
    }
}

// ---------------- diagnostics (PROBLEMS pane) ----------------

let collection: vscode.DiagnosticCollection | undefined;

function diagnostics(): vscode.DiagnosticCollection {
    if (!collection) collection = vscode.languages.createDiagnosticCollection('avaloniaDesigner.codeCheck');
    return collection;
}

/** Publishes the findings for one form's code-behind (+ its .axaml) into the PROBLEMS pane. */
export function publishIssues(axamlUri: vscode.Uri, result: CheckResult, issues: CodeIssue[]): void {
    const byFile = new Map<string, vscode.Diagnostic[]>();
    const target: Record<'code' | 'axaml', string | undefined> = { code: result.codeFile, axaml: axamlUri.fsPath };
    for (const issue of issues) {
        const file = target[issue.file ?? 'code'];
        if (!file) continue;
        const line = Math.max(0, (issue.line ?? 1) - 1);
        const range = new vscode.Range(line, 0, line, 1000);
        const d = new vscode.Diagnostic(
            range,
            `${issue.title}\n${issue.detail}`,
            issue.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
        );
        d.source = 'Avalonia Designer';
        d.code = issue.kind;
        const list = byFile.get(file) ?? [];
        list.push(d);
        byFile.set(file, list);
    }
    // Replace what we published for these two files (keeps other forms' findings intact).
    for (const file of Object.values(target)) {
        if (file) diagnostics().set(vscode.Uri.file(file), []);
    }
    for (const [file, list] of byFile) diagnostics().set(vscode.Uri.file(file), list);
}

/** Clears everything this utility published. */
export function clearIssues(): void {
    collection?.clear();
}

export function disposeIssues(): void {
    collection?.dispose();
    collection = undefined;
}

/** Convenience for the panel: the named controls the checker used (so its fixes stay in sync). */
export function controlsForCheck(axamlUri: vscode.Uri, axamlText?: string, extra?: { name: string; type: string }[]): { name: string; type: string }[] {
    return unionNamedControls(extra ?? [], unionNamedControls(namedControlsInAxaml(axamlUri), axamlFacts(axamlUri, axamlText).names));
}
