import * as fs from 'fs';
import * as path from 'path';
import { DataSetSpec, parseDataSetChecked } from './dataSetModel';

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
