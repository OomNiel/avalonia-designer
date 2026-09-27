import * as fs from 'fs';
import * as path from 'path';
import { DataSetSpec, DataTableSpec, parseDataSetChecked } from './dataSetModel';
import { runtimeDataFolder } from './dataSetGenerator';

/** One parsed `.adset`: its path and the validated spec. */
export interface DataSetFile {
    adsetPath: string;
    spec: DataSetSpec;
}

interface CacheEntry {
    /** The `.adset` files found by the last walk, in walk order. */
    paths: string[];
    /** Their sizes, used together with the newest mtime to detect an edit. */
    sizes: number[];
    /** Newest modification time across those files (0 when there are none). */
    newest: number;
    files: DataSetFile[];
}

/** Parsed `.adset` files per project folder. */
const cache = new Map<string, CacheEntry>();

/** Directories that never hold a project `.adset` worth reading. */
const SKIP_DIRS = new Set(['bin', 'obj', '.git', 'node_modules']);

/**
 * Every place a bound table's database file can be, in the order the RUNNING app itself would pick one:
 *
 *  1. the **per-user data folder** (`~/.local/share/<AssemblyName>/` …) — what the generated
 *     `RuntimeStorage` helper resolves a relative `sqlite.file` to, and therefore where the app's rows
 *     actually are once it has run. Missing this was why the design-time DataGrid preview went blank:
 *     the data moved per user (0.12.x, for installed apps) and the preview kept looking only beside the
 *     form and beside the executable;
 *  2. **beside the executable** of a Debug/Release build — the legacy location an earlier build wrote,
 *     which `RuntimeStorage` still adopts when it is the only copy;
 *  3. **beside the form** — a database kept in the project folder by hand or by a sample.
 *
 * An ABSOLUTE `sqlite.file` is used as it is: that is how a project points at a database it keeps
 * outside the app folder (the older test apps do exactly that).
 */
export function previewDbCandidates(projectFolder: string, file: string, assemblyName: string): string[] {
    const name = (file || '').trim();
    if (!name) return [];
    if (path.isAbsolute(name)) return [name];
    const out: string[] = [];
    const perUser = runtimeDataFolder(assemblyName);
    if (perUser) out.push(path.join(perUser, name));
    for (const cfg of ['Debug', 'Release']) {
        for (const tfm of ['net8.0', 'net9.0', 'net10.0']) {
            out.push(path.join(projectFolder, 'bin', cfg, tfm, name));
        }
    }
    out.push(path.join(projectFolder, name));
    return out;
}

/** The database file a table's design-time preview should read, or undefined when no candidate exists. */
export function resolvePreviewDb(projectFolder: string, file: string, assemblyName: string): string | undefined {
    return previewDbCandidates(projectFolder, file, assemblyName).find((p) => fs.existsSync(p));
}

/** The columns the RUNNING grid shows for a table, in order. The generated `Build<Table>Columns` skips a
 *  `Byte[]` column (an image column has no text cell of its own), so the design-time preview skips it
 *  too — otherwise the canvas would show a column the app never has. */
export function gridPreviewColumns(t: DataTableSpec): string[] {
    return t.columns.filter((c) => c.type !== 'Byte[]').map((c) => c.name);
}

/** The HEADER text for each of `names`: the column's Caption, else its name — exactly the string the
 *  generated columns write (`Header = caption || name`), so a table whose column is captioned "ID"
 *  reads "ID" on the canvas and in the app. A name with no matching column (a database the user picked
 *  that holds other columns) keeps its own spelling. */
export function gridPreviewHeaders(t: DataTableSpec, names: string[]): string[] {
    return names.map((n) => t.columns.find((c) => c.name === n)?.caption || n);
}

/** Depth-first list of `.adset` paths under `root` (readdir only — no file contents). */
export function walkAdsets(root: string): string[] {
    const out: string[] = [];
    const stack = [root];
    while (stack.length) {
        const dir = stack.pop()!;
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const e of entries) {
            if (SKIP_DIRS.has(e.name)) continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) stack.push(p);
            else if (e.name.toLowerCase().endsWith('.adset')) out.push(p);
        }
    }
    return out;
}

/**
 * Every `.adset` under `projectFolder`, parsed (unreadable/corrupt ones are skipped).
 *
 * Cached per folder because this feeds SIX lookups — the Items Source binding, the Data-Image
 * binding, the column follower, the grid-cell sync, the code-behind check and the asset list — and
 * a single `render()` reaches several of them. Each call used to walk the tree AND read + parse
 * every schema, synchronously, on the extension host's thread, so a property edit could parse the
 * same `.adset` a dozen times.
 *
 * The cache is validated on every call by re-walking (readdir only) and comparing the file list,
 * their sizes and the newest mtime. That keeps it correct after ANY edit — including one made by
 * the designer itself, by the DataSet designer in another panel, or by an external tool — without
 * a file watcher or an invalidation hook that a future writer could forget to call. Only the
 * expensive part (readFileSync + JSON.parse + validation) is skipped.
 *
 * Callers must treat the result as read-only: the parsed specs are shared between calls.
 */
export function readDataSetFiles(projectFolder: string): DataSetFile[] {
    const paths = walkAdsets(projectFolder);
    let newest = 0;
    const sizes: number[] = [];
    for (const p of paths) {
        try {
            const st = fs.statSync(p);
            if (st.mtimeMs > newest) newest = st.mtimeMs;
            sizes.push(st.size);
        } catch {
            sizes.push(-1);   // vanished between the walk and the stat — never matches a cache entry
        }
    }

    const hit = cache.get(projectFolder);
    if (hit && hit.newest === newest
        && hit.paths.length === paths.length
        && hit.paths.every((p, i) => p === paths[i])
        && hit.sizes.every((s, i) => s === sizes[i])) {
        return hit.files;
    }

    const files: DataSetFile[] = [];
    for (const p of paths) {
        try {
            // Checked parse: a corrupt .adset is skipped rather than handed to the lookups as an
            // empty spec (which no caller could tell apart from "this table has no binding").
            const { spec, error } = parseDataSetChecked(fs.readFileSync(p, 'utf8'));
            if (!error) files.push({ adsetPath: p, spec });
        } catch { /* unreadable .adset */ }
    }
    cache.set(projectFolder, { paths, sizes, newest, files });
    return files;
}

/** Drops the cache: everything, or one folder. Only needed by tests — normal reads self-validate. */
export function invalidateDataSetFiles(projectFolder?: string): void {
    if (projectFolder) cache.delete(projectFolder);
    else cache.clear();
}
