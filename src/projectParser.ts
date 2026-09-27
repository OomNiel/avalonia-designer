import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { assemblyNameOf } from './debBuilder';

export type ProjectLanguage = 'cs' | 'vb';

export interface ProjectInfo {
    language: ProjectLanguage;
    projectUri: vscode.Uri;
    projectName: string;
    /** The ASSEMBLY name: `<AssemblyName>` when the project sets one, else the project file's own
     *  name (the same rule the .deb/MSI publish uses). A generated `RuntimeStorage` helper names the
     *  app's per-user data folder after it (`~/.local/share/<AssemblyName>/`), so this is also the
     *  name the design-time DataGrid preview has to look under. */
    assemblyName: string;
    rootNamespace: string;
}

/**
 * Walks up from the given file to find the nearest .csproj / .vbproj so the
 * designer can detect C# vs VB.NET for existing .axaml files.
 */
export function findProject(fromFile: vscode.Uri): ProjectInfo | undefined {
    return findProjectFromDir(path.dirname(fromFile.fsPath));
}

/** The project that owns a FOLDER (it, then its parents). Used where only a directory is known — the
 *  DataSet designer creating a new `.adset`, which has no file to walk up from yet. */
export function findProjectForFolder(folder: string): ProjectInfo | undefined {
    return findProjectFromDir(folder);
}

function findProjectFromDir(start: string): ProjectInfo | undefined {
    let dir = start;
    for (let i = 0; i < 30; i++) {
        let entries: string[] = [];
        try {
            entries = fs.readdirSync(dir);
        } catch {
            break;
        }
        const csproj = entries.find((e) => e.toLowerCase().endsWith('.csproj'));
        const vbproj = entries.find((e) => e.toLowerCase().endsWith('.vbproj'));
        if (csproj) return makeInfo(path.join(dir, csproj), 'cs');
        if (vbproj) return makeInfo(path.join(dir, vbproj), 'vb');
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return undefined;
}

function makeInfo(projectPath: string, language: ProjectLanguage): ProjectInfo {
    const name = path.basename(projectPath).replace(/\.(csproj|vbproj)$/i, '');
    let rootNamespace = name;
    let assemblyName = name;
    try {
        const text = fs.readFileSync(projectPath, 'utf8');
        const m = /<RootNamespace>([^<]+)<\/RootNamespace>/.exec(text);
        if (m) rootNamespace = m[1].trim();
        assemblyName = assemblyNameOf(text, name);
    } catch {
        /* ignore */
    }
    return {
        language,
        projectUri: vscode.Uri.file(projectPath),
        projectName: name,
        assemblyName,
        rootNamespace
    };
}

/** Detects the project language for an existing .axaml file, if any. */
export function languageForFile(uri: vscode.Uri): ProjectLanguage | undefined {
    return findProject(uri)?.language;
}
