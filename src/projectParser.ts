import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export type ProjectLanguage = 'cs' | 'vb';

export interface ProjectInfo {
    language: ProjectLanguage;
    projectUri: vscode.Uri;
    projectName: string;
    rootNamespace: string;
}

/**
 * Walks up from the given file to find the nearest .csproj / .vbproj so the
 * designer can detect C# vs VB.NET for existing .axaml files.
 */
export function findProject(fromFile: vscode.Uri): ProjectInfo | undefined {
    let dir = path.dirname(fromFile.fsPath);
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
    try {
        const text = fs.readFileSync(projectPath, 'utf8');
        const m = /<RootNamespace>([^<]+)<\/RootNamespace>/.exec(text);
        if (m) rootNamespace = m[1].trim();
    } catch {
        /* ignore */
    }
    return {
        language,
        projectUri: vscode.Uri.file(projectPath),
        projectName: name,
        rootNamespace
    };
}

/** Detects the project language for an existing .axaml file, if any. */
export function languageForFile(uri: vscode.Uri): ProjectLanguage | undefined {
    return findProject(uri)?.language;
}
