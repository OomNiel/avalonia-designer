/**
 * projectBackup.ts — the designer's "Project Backup" toolbar button.
 *
 * Copies the whole project folder into its PARENT folder, named `<Project>_<YYYY-MM-DD>_<HH-MM-SS>`
 * (Windows-safe: a ':' is not allowed in a path there). Build output and caches are never copied —
 * a backup should be the project's own files, not gigabytes of derived state (and never somebody's
 * whole git history).
 *
 * Pure `fs` (no `vscode`) so the naming, the skip list and the copy are unit-testable.
 */
import * as fs from 'fs';
import * as path from 'path';

/** Folder names that are never part of a backup: build output, IDE state, caches, VCS metadata.
 *  Skipped at ANY depth, so a solution-style project doesn't drag a nested project's `bin/` in. */
export const BACKUP_SKIP_DIRS = ['bin', 'obj', '.vs', 'node_modules', '.git'];

/** `2026-09-11_14-32-05` — the date/time suffix of a backup folder name. */
export function backupStamp(now: Date = new Date()): string {
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
        + `_${p(now.getHours())}-${p(now.getMinutes())}-${p(now.getSeconds())}`;
}

/** The backup folder's name for a project folder: the project's own name + the timestamp. */
export function backupFolderName(projectFolder: string, now: Date = new Date()): string {
    const base = path.basename(path.resolve(projectFolder)) || 'project';
    return `${base}_${backupStamp(now)}`;
}

/** `parentDir/name`, or `parentDir/name-2`, `-3`, … when that name is already taken (two clicks
 *  inside the same second must not collide). */
export function freeBackupPath(parentDir: string, name: string): string {
    let candidate = path.join(parentDir, name);
    for (let n = 2; fs.existsSync(candidate); n++) candidate = path.join(parentDir, `${name}-${n}`);
    return candidate;
}

export interface BackupResult {
    /** The folder that was created. */
    path: string;
    /** Number of FILES copied (folders aren't counted). */
    files: number;
    /** The skipped folder names that actually existed, e.g. ['bin', 'obj', 'node_modules']. */
    skipped: string[];
}

/** Recursively copies `from` into `target`, skipping BACKUP_SKIP_DIRS. Returns the file count. */
function copyTree(from: string, target: string): { files: number; skipped: Set<string> } {
    const skip = new Set(BACKUP_SKIP_DIRS);
    const skipped = new Set<string>();
    let files = 0;
    const walk = (srcDir: string, destDir: string): void => {
        fs.mkdirSync(destDir, { recursive: true });
        for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
            const src = path.join(srcDir, entry.name);
            const dest = path.join(destDir, entry.name);
            // statSync (not the dirent) so a symlinked folder is followed like a real one.
            const isDir = entry.isSymbolicLink() ? safeIsDir(src) : entry.isDirectory();
            if (isDir) {
                if (skip.has(entry.name)) { skipped.add(entry.name); continue; }
                walk(src, dest);
            } else {
                fs.copyFileSync(src, dest);
                files++;
            }
        }
    };
    walk(from, target);
    return { files, skipped };
}

function safeIsDir(p: string): boolean {
    try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

/**
 * Backs `projectFolder` up into `parentDir` (its own parent by default) under the timestamped name
 * and reports what happened. Throws when the project folder can't be read or a copy fails.
 */
export function backupProject(projectFolder: string, parentDir?: string, now: Date = new Date()): BackupResult {
    const from = path.resolve(projectFolder);
    if (!safeIsDir(from)) throw new Error(`Project folder not found: ${from}`);
    const parent = path.resolve(parentDir ?? path.dirname(from));
    const target = freeBackupPath(parent, backupFolderName(from, now));
    const { files, skipped } = copyTree(from, target);
    return {
        path: target,
        files,
        skipped: [...skipped].sort((a, b) => BACKUP_SKIP_DIRS.indexOf(a) - BACKUP_SKIP_DIRS.indexOf(b))
    };
}
