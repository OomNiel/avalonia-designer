/**
 * Discovers the project's "available assets" a list control can bind to, shown when
 * the user clicks the Items Source property:
 *   - collection fields/properties in the project's .cs/.vb files (arrays, List<T>,
 *     ObservableCollection<T>, IEnumerable<T>, DataView) that are ACCESSIBLE from the
 *     form's code-behind (the form's own instance members + Public Shared/static members),
 *   - DataSet tables from the project's .adset files (bound via the existing DataSet path).
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseDataSet } from './dataSetModel';

export type Asset =
    | { kind: 'code'; label: string; detail: string; value: string }
    | { kind: 'dataset'; label: string; detail: string; datasetName: string; tableName: string; adsetPath: string };

const IGNORE_DIRS = new Set(['bin', 'obj', '.git', 'node_modules', '.vs']);

/** Walk a project folder collecting .cs/.vb/.adset files (skipping build artifacts). */
function projectFiles(folder: string, ext: string[]): string[] {
    const out: string[] = [];
    const stack = [folder];
    while (stack.length) {
        const dir = stack.pop()!;
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const e of entries) {
            if (e.name === 'bin' || e.name === 'obj' || e.name === '.git' || e.name === 'node_modules' || e.name === '.vs') continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) stack.push(p);
            else if (ext.some((x) => p.toLowerCase().endsWith(x))) out.push(p);
        }
    }
    return out;
}

// ---- collection type detection ---------------------------------------------------------------

const CS_COLLECTION = /(?:\[\s*\]|(?:List|ObservableCollection|ICollection|IList|IEnumerable|IReadOnlyList|IReadOnlyCollection|Collection|ReadOnlyCollection|BindingList|HashSet)<|\b(?:DataView|DataTable|IEnumerable|IList|ICollection)\b)/;
const VB_COLLECTION = /(?:\(\s*\)|List\s*\(\s*Of\s+[\w.]+\)|ObservableCollection\s*\(\s*Of\s+[\w.]+\)|IEnumerable\s*\(\s*Of\s+[\w.]+\)|\b(?:DataView|DataTable)\b)/i;

/** A C# field/property line: access modifiers + (static/readonly) + collection type + name. */
const CS_DECL = /^\s*(?:public|private|protected|internal|file)\s+(?:(?:static|readonly|sealed|virtual|new|async|required)\s+)*([A-Za-z_][\w<>.,\[\]\s]*?)\s+([A-Za-z_]\w*)\s*(?==|;|\{)/;
/**
 * A VB field/property line: access + (Shared/ReadOnly) + name + optional () array marker
 * + As + an explicitly enumerated collection type (initializer-tolerant boundary).
 * group1 = name, group2 = () array marker, group3 = type.
 * NOTE: the generic `List(Of T)`/`ObservableCollection(Of T)` alternatives MUST come before the
 * plain identifier — otherwise `List(Of String)` is truncated to `List` (the trailing boundary
 * consumes the `(`) and the generic type is never detected.
 */
const VB_DECL = /^\s*(?:Public|Private|Protected|Friend|Dim)\s+(?:(?:Shared|ReadOnly|Shadows|Overloads)\s+)*(?:(?:Property|Dim)\s+)?([A-Za-z_]\w*)\s*(\(\s*\))?\s+As\s+(List\s*\(\s*Of\s+[\w.]+\)|ObservableCollection\s*\(\s*Of\s+[\w.]+\)|IEnumerable\s*\(\s*Of\s+[\w.]+\)|DataView|DataTable|[A-Za-z_][\w.]*(?:\(\s*\))?)\s*(?:$|=|;|,?\s*[({])/i;

/** True if a C# type fragment is a collection type. */
function isCsCollection(type: string): boolean {
    return CS_COLLECTION.test(type);
}
/** True if a VB type fragment is a collection type. */
function isVbCollection(type: string): boolean {
    return VB_COLLECTION.test(type);
}

// ---- C# scanner -------------------------------------------------------------------------------

interface CsClass { name: string; depth: number; }

/** C#: track class scopes by brace depth; collect collection fields/properties. */
function scanCs(text: string, formClass: string): { value: string; label: string; detail: string }[] {
    const out: { value: string; label: string; detail: string }[] = [];
    const lines = text.split('\n');
    // Remove /* */ block comments so braces inside them don't confuse depth tracking.
    const stripped = lines.map((l) => l.replace(/\/\*[\s\S]*?\*\//g, ''));
    let depth = 0;
    const stack: CsClass[] = [];
    let classRe: RegExp;
    const braceStack: number[] = [];

    const classPattern = /^\s*(?:public|private|protected|internal|file)\s+(?:abstract|sealed|static|partial|readonly)\s*class\s+([A-Za-z_]\w*)/;
    for (const line of stripped) {
        const cls = classPattern.exec(line);
        if (cls) {
            stack.push({ name: cls[1], depth });
            braceStack.push(depth);
        }
        const cur = stack.length ? stack[stack.length - 1] : undefined;

        const decl = CS_DECL.exec(line);
        if (decl) {
            const type = decl[1].trim();
            const name = decl[2];
            if (isCsCollection(type) && cur) {
                const isStatic = /\bstatic\b/.test(line);
                const inForm = cur.name === formClass;
                if (inForm) {
                    out.push({ value: name, label: name, detail: `${type} — on ${cur.name}` });
                } else if (isStatic && /^\s*(?:public|internal)\s+/.test(line)) {
                    out.push({ value: `${cur.name}.${name}`, label: `${cur.name}.${name}`, detail: `${type} — shared` });
                }
            }
        }
        // Track braces AFTER the declaration check (the decl line may open the class body).
        for (const ch of line) {
            if (ch === '{') depth++;
            else if (ch === '}') {
                depth--;
                while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
            }
        }
    }
    return out;
}

// ---- VB scanner -------------------------------------------------------------------------------

/** VB: track Class/Module scopes; collect collection fields/properties. */
function scanVb(text: string, formClass: string): { value: string; label: string; detail: string }[] {
    const out: { value: string; label: string; detail: string }[] = [];
    const lines = text.split('\n');
    const stack: { name: string; type: 'class' | 'module' }[] = [];
    const clsPattern = /^\s*(?:Public|Private|Friend|Protected)?\s*(?:Partial\s+)?(Class|Module)\s+([A-Za-z_]\w*)/i;
    const endPattern = /^\s*End\s+(Class|Module)\b/i;
    // Method/accessor bodies (Sub/Function/Get/Set) — a bare `Dim` there is a LOCAL, not a field.
    const methodOpen = /^\s*(?:(?:Public|Private|Protected|Friend|Shared|ReadOnly|Overrides|Shadows|Default|Async|Iterator|Function)\s+)*(Sub|Function)\s+/i;
    const accessorOpen = /^\s*(?:(?:Public|Private|Protected|Friend)?\s*)(Get|Set)\s*(\(|$)/i;
    const methodEnd = /^\s*End\s+(Sub|Function|Get|Set)\b/i;
    let inMethod = false;

    for (const raw of lines) {
        const line = raw.split("'")[0]; // strip VB comments
        const cls = clsPattern.exec(line);
        if (cls) stack.push({ name: cls[2], type: cls[1].toLowerCase() === 'class' ? 'class' : 'module' });
        if (endPattern.test(line) && stack.length) stack.pop();
        if (methodEnd.test(line)) inMethod = false;

        const cur = stack[stack.length - 1];
        const decl = !inMethod && cur ? VB_DECL.exec(line) : null;
        if (decl && cur) {
            const name = decl[1];
            const isArray = !!decl[2]; // name written as Planets() — an array regardless of the bare type
            const type = decl[3].trim();
            if (isArray || isVbCollection(type)) {
                // Module members are implicitly Shared, so they're reachable as Module.Member
                // even without the Shared keyword; class members need explicit Shared.
                const effectivelyShared = cur.type === 'module' || /\bShared\b/i.test(line);
                const inForm = cur.name === formClass;
                if (inForm) {
                    out.push({ value: name, label: name, detail: `As ${type} — on ${cur.name}` });
                } else if (effectivelyShared && /^\s*(?:Public|Friend)\s+/i.test(line)) {
                    out.push({ value: `${cur.name}.${name}`, label: `${cur.name}.${name}`, detail: `As ${type} — ${cur.type === 'module' ? 'module' : 'shared'}` });
                }
            }
        }
        if (methodOpen.test(line) || accessorOpen.test(line)) inMethod = true;
    }
    return out;
}

// ---- DataSet tables ---------------------------------------------------------------------------

/** Collect every table in every .adset in the project as a dataset asset. */
function scanDataSets(folder: string): Asset[] {
    const out: Asset[] = [];
    for (const f of projectFiles(folder, ['.adset'])) {
        try {
            const spec = parseDataSet(fs.readFileSync(f, 'utf8'));
            for (const t of spec.tables) {
                const boundTo = t.boundTo ? ` (bound to ${t.boundTo})` : '';
                out.push({
                    kind: 'dataset',
                    label: `${spec.name}.${t.name}`,
                    detail: `DataSet table${boundTo}`,
                    datasetName: spec.name,
                    tableName: t.name,
                    adsetPath: f
                });
            }
        } catch { /* skip unreadable .adset */ }
    }
    return out;
}

/**
 * Lists every bindable asset in the project: accessible code collections plus DataSet
 * tables. `formClass` is the current form's code-behind class name (x:Class last segment),
 * used to decide whether a member is reachable as a bare name (instance/shared on the form)
 * or must be qualified (ClassName.Member for shared members elsewhere).
 */
export function listAssets(projectFolder: string, formClass: string): Asset[] {
    const assets: Asset[] = [];
    const seen = new Set<string>();

    const pushCode = (a: { value: string; label: string; detail: string }): void => {
        if (seen.has(a.value)) return;
        seen.add(a.value);
        assets.push({ kind: 'code', ...a });
    };

    for (const f of projectFiles(projectFolder, ['.cs', '.vb'])) {
        let text = '';
        try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
        const isVb = f.toLowerCase().endsWith('.vb');
        const found = isVb ? scanVb(text, formClass) : scanCs(text, formClass);
        for (const a of found) pushCode(a);
    }

    assets.push(...scanDataSets(projectFolder));
    return assets;
}
