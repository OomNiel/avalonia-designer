/* INCLUDING a data file in the project — what makes a form with a relative `DataFile` portable.
 *
 * The chart reads a RELATIVE data path from beside the app's own executable (GrumpyCharts'
 * SourcePathResolver), so for that path to exist when the app runs, the project has to copy the file
 * to its output folder. That is one item in the project file:
 *
 *     <None Update="data/log.csv" CopyToOutputDirectory="PreserveNewest" />
 *
 * Two cases, and the difference is the whole point of this module:
 *   • the file already lives in the project folder — just add the item and point the form at it
 *     relatively, so the project keeps referring to the copy it owns;
 *   • the file lives somewhere else (a Downloads folder, a logger's output directory) — then it is
 *     COPIED INTO the project (into `data/`) first, because a relative path can only find a file the
 *     project carries. Without this second case every "portable" form would still be reading one
 *     machine's absolute path.
 *
 * Copying never overwrites: a different file of the same name is reported instead, because silently
 * replacing someone's data file is not a decision a designer may make on its own.
 */
import * as fs from 'fs';
import * as path from 'path';

/** The folder a data file from elsewhere is copied into (beside the form, inside the project). */
export const DATA_FOLDER = 'data';

export interface IncludeResult {
    /** The path the FORM should carry: relative to the project folder, '/'-separated (MSBuild style). */
    relative: string;
    /** Where the file ended up (absolute). */
    target: string;
    /** True when the file was copied into the project because it lived outside it. */
    copied: boolean;
    /** True when a project item was added; false when an identical one was already there. */
    added: boolean;
    /** Set when nothing was changed, with the reason the user needs to fix it. */
    error?: string;
}

/** Slashes as MSBuild writes them (a Windows path in an item must not contain backslashes). */
function toItemPath(value: string): string {
    return value.split(path.sep).join('/');
}

/** True when the path names an existing FOLDER — a chart then reads one file per slice from it. Cheap and
 *  safe: anything unreadable is simply "not a folder". */
export function isFolderPath(value: string): boolean {
    if (!value) return false;
    try { return fs.statSync(value).isDirectory(); } catch { return false; }
}

/** True when a data file is JSON (or JSON Lines): its columns are its record keys, so the dialog words the
 *  source differently — there is no delimiter to report. Must agree with the chart's JsonDataReader. */
export function isJsonPath(value: string): boolean {
    return /\.(json|jsonl|ndjson)$/i.test(value || '');
}

/** True when `child` is `parent` itself or inside it (case-insensitive on Windows). */
function isInside(parent: string, child: string): boolean {
    const p = path.resolve(parent);
    const c = path.resolve(child);
    if (c === p) return true;
    const withSep = p.endsWith(path.sep) ? p : p + path.sep;
    return process.platform === 'win32'
        ? c.toLowerCase().startsWith(withSep.toLowerCase())
        : c.startsWith(withSep);
}

/** Adds the copy-to-output item to the project file, or reports that it is already there.
 *
 * `Include`, not `Update`: an `Update` item only *changes* an item the project already has, and the SDK
 * puts files in the `None` list by GLOBBING them — a project with `<EnableDefaultItems>false</...>` has no
 * such item, so an `Update` line would sit in the project looking right and copying nothing (measured:
 * t0 `datacopy` is exactly that project). A designer must not write a line that can silently do nothing.
 * The idempotence check accepts either spelling, because a project may already carry the `Update` form. */
function addItem(projectFile: string, relative: string): { added: boolean; error?: string } {
    const item = `<None Include="${relative}" CopyToOutputDirectory="PreserveNewest" />`;
    let text: string;
    try { text = fs.readFileSync(projectFile, 'utf8'); } catch (e) {
        return { added: false, error: `Could not read the project file: ${String((e as Error).message ?? e)}` };
    }
    // Already covered? Either an item naming this file (either spelling), or a wildcard that includes it
    // (a project copied from another project often has `<None Update="data\**" …/>`).
    const quoted = relative.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(Update|Include)\\s*=\\s*"${quoted}"`, 'i').test(text)
        || new RegExp(`(Update|Include)\\s*=\\s*"${DATA_FOLDER}[/\\\\]\\*\\*"`, 'i').test(text)) {
        return { added: false };
    }
    const insert = '    ' + item + '\n';
    const group = text.lastIndexOf('</ItemGroup>');
    const next = group >= 0
        ? text.slice(0, group) + insert + text.slice(group)
        : text.replace(/<\/Project>/, `  <ItemGroup>\n${insert}  </ItemGroup>\n</Project>`);
    if (next === text) return { added: false, error: 'That project file has no </Project> element to add the item to.' };
    try { fs.writeFileSync(projectFile, next, 'utf8'); }
    catch (e) { return { added: false, error: `Could not write the project file: ${String((e as Error).message ?? e)}` }; }
    return { added: true };
}

/**
 * Makes `dataFile` part of the project that owns `projectFile`, and answers with the path the form
 * should carry. Nothing is overwritten: an existing file of the same name is reported instead.
 */
export function includeDataFile(projectFile: string, dataFile: string): IncludeResult {
    const none = { relative: '', target: '', copied: false, added: false };
    const folder = path.dirname(projectFile);
    const source = path.resolve(dataFile);
    let stat: fs.Stats;
    try { stat = fs.statSync(source); } catch {
        return { ...none, error: `The data file is not there: ${source}` };
    }
    if (!stat.isFile()) return { ...none, error: `That path is a folder, not a data file: ${source}` };

    let target = source;
    let relative = toItemPath(path.relative(folder, source));
    let copied = false;
    if (!isInside(folder, source)) {
        const dir = path.join(folder, DATA_FOLDER);
        try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {
            return { ...none, error: `Could not create ${DATA_FOLDER}/ in the project: ${String((e as Error).message ?? e)}` };
        }
        target = path.join(dir, path.basename(source));
        if (fs.existsSync(target)) {
            // Same content is the copy this project already made — reuse it. A DIFFERENT file of the
            // same name stops here: overwriting data is never a silent decision.
            let same = false;
            try { same = fs.readFileSync(target).equals(fs.readFileSync(source)); } catch { /* compare failed */ }
            if (!same) {
                return {
                    ...none, target,
                    error: `The project already holds a different ${DATA_FOLDER}/${path.basename(source)} — `
                        + 'rename one of them (or pick that file instead).'
                };
            }
        } else {
            try { fs.copyFileSync(source, target); } catch (e) {
                return { ...none, error: `Could not copy the file into the project: ${String((e as Error).message ?? e)}` };
            }
        }
        copied = true;
        relative = `${DATA_FOLDER}/${path.basename(source)}`;
    }

    const item = addItem(projectFile, relative);
    if (item.error) return { relative, target, copied, added: false, error: item.error };
    return { relative, target, copied, added: item.added };
}
