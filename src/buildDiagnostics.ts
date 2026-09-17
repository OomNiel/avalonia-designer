/**
 * The project's own compiler, as the second half of the code check.
 *
 * The rules in `codeBehindCheck` are fast, need no build, and can be fixed automatically — but they
 * can only see shapes they were taught, and only the structural half of syntax (a missing `{` breaks
 * the brace count; a missing `;` does not). Only the compiler can say `CS1002: ; expected`, in any file
 * of the project, and it is the only thing that can ever report the type errors, wrong API use and
 * missing usings a rule-based checker will never claim.
 *
 * Asked for on 2026-09-17, after a `;` was removed from a handler in the user's own app and the check
 * called the file clean while `dotnet build` refused it: *"It used to work but now it does not pick up
 * syntax (or any other) errors."*
 *
 * The build runs **on demand only** — it takes seconds, so it never runs while typing, and never on the
 * automatic triggers (`onReturn`/`onSave`/`onType`). `dotnet build` is used rather than a build task so
 * the output can be parsed; the task path in `assistantUi.runBuildTask` stays as it is.
 */
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { CodeIssue } from './codeBehindCheck';

export interface CompilerDiagnostic {
    /** Absolute path of the file the compiler pointed at. */
    file: string;
    line: number;
    column: number;
    severity: 'error' | 'warning';
    /** `CS1002`, `BC30451`, … */
    code: string;
    message: string;
}

export interface BuildResult {
    /** True when the build exited 0. */
    ok: boolean;
    /** Diagnostics in the project's own source files (generated `obj/` output is dropped). */
    diagnostics: CompilerDiagnostic[];
    /** Errors the compiler reported with no file or line (`CSC : error CS2001: …`, `error MSB3021: …`). */
    projectErrors: ProjectError[];
    errors: number;
    warnings: number;
    /** Diagnostics that pointed into `obj/`/`bin/` or outside the project. */
    skipped: number;
    /** Why no build could be run at all (`dotnet` missing, a timeout, …). */
    failure?: string;
}

/** An error about the project itself rather than a place in the code. */
export interface ProjectError {
    code: string;
    message: string;
}

/**
 * `…/MainWindow.axaml.cs(96,38): error CS1002: ; expected [/…/App.csproj]` — the shape both the C# and
 * the VB compiler emit. The path is matched greedily, so a directory with a `(1,2)` in its name still
 * lands in group 1, and MSBuild's trailing `[project]` is cut off the message.
 */
const DIAGNOSTIC = /^(.*)\((\d+),(\d+)\):\s+(error|warning)\s+([A-Za-z]+\d+):\s+(.+?)(?:\s+\[[^\]]*\])?\s*$/;

/** Diagnostics whose file is not the project's own source (generated XAML partials, NuGet, …). */
export function isProjectSource(file: string, projectDir: string): boolean {
    const abs = path.resolve(file);
    const rel = path.relative(projectDir, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
    const parts = rel.split(path.sep);
    return !parts.some((p) => p.toLowerCase() === 'obj' || p.toLowerCase() === 'bin');
}

/**
 * Every diagnostic in `text`, de-duplicated. MSBuild prints the same error twice (once where it was
 * raised, once in the summary), and a duplicate would double the count the user is shown.
 */
export function parseCompilerOutput(text: string, cwd?: string): CompilerDiagnostic[] {
    const seen = new Set<string>();
    const out: CompilerDiagnostic[] = [];
    for (const line of text.split(/\r?\n/)) {
        const m = DIAGNOSTIC.exec(line.trim());
        if (!m) continue;
        const file = path.isAbsolute(m[1]) ? m[1] : path.resolve(cwd ?? process.cwd(), m[1]);
        const key = `${file}|${m[2]}|${m[3]}|${m[5]}|${m[6]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
            file,
            line: Number(m[2]),
            column: Number(m[3]),
            severity: m[4] === 'warning' ? 'warning' : 'error',
            code: m[5],
            message: m[6]
        });
    }
    return out;
}

/**
 * Errors with no file and no line: `CSC : error CS2001: Source file not found [app.csproj]`,
 * `error MSB3021: Unable to copy file …`. They say the project itself is wrong (a file that is not
 * there, a failing MSBuild step), and dropping them because they have no line would hide exactly the
 * kind of failure the user asked to see.
 */
export function parseProjectErrors(text: string): ProjectError[] {
    const seen = new Set<string>();
    const out: ProjectError[] = [];
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (DIAGNOSTIC.test(trimmed)) continue;            // a location was already parsed from this line
        const m = /^(?:([^:]+):\s+)?error\s+([A-Za-z]+\d+):\s+(.+?)(?:\s+\[[^\]]*\])?\s*$/.exec(trimmed);
        if (!m) continue;
        if (seen.has(m[2] + m[3])) continue;
        seen.add(m[2] + m[3]);
        out.push({ code: m[2], message: m[3] });
    }
    return out;
}

/** Runs `dotnet build` for one project and parses what it says. Never throws. */
export function buildProject(projectFile: string, timeoutMs = 300000): Promise<BuildResult> {
    return new Promise((resolve) => {
        const cwd = path.dirname(projectFile);
        const args = ['build', projectFile, '-nologo', '-v:quiet'];
        cp.execFile('dotnet', args, { cwd, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
            const text = `${String(stdout ?? '')}\n${String(stderr ?? '')}`;
            const all = parseCompilerOutput(text, cwd);
            const kept = all.filter((d) => isProjectSource(d.file, cwd));
            const projectErrors = parseProjectErrors(text);
            const errors = kept.filter((d) => d.severity === 'error').length + projectErrors.length;
            const warnings = kept.length - kept.filter((d) => d.severity === 'error').length;
            const code = err && typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : undefined;
            let failure: string | undefined;
            if (!fs.existsSync(projectFile)) failure = `No project file at ${projectFile}.`;
            else if (code === undefined && err) failure = `Could not run \`dotnet build\` (${err.message}).`;
            else if (err && (err as { killed?: boolean }).killed) failure = 'The build did not finish in time.';
            resolve({
                ok: !err,
                diagnostics: kept,
                projectErrors,
                errors,
                warnings,
                skipped: all.length - kept.length,
                failure
            });
        });
    });
}

/**
 * The compiler's findings as Code Fix entries. A `CS1002` in the form's own code-behind becomes the
 * `insert-semicolon` finding the rules use, so it gets the same one-click fix — the compiler says where
 * the `;` is missing (anywhere in the file), the rule can only prove it at the end of a body, and the
 * fix refuses a line that already ends with a terminator. Everything else is report-only: no rule can
 * repair a type error, and pretending otherwise would be worse than saying so.
 *
 * `covered` holds `file:line` of what the rules already reported, so one missing `;` is not listed twice.
 */
export function compilerIssues(
    diagnostics: CompilerDiagnostic[],
    projectErrors: ProjectError[],
    codeFile: string | undefined,
    covered: Set<string>
): CodeIssue[] {
    const out: CodeIssue[] = [];
    for (const d of diagnostics) {
        const key = `${path.resolve(d.file)}:${d.line}`;
        if (covered.has(key)) continue;
        const inForm = codeFile !== undefined && path.resolve(d.file) === path.resolve(codeFile);
        const fixable = inForm && d.code === 'CS1002';
        out.push({
            id: `build:${key}:${d.code}`,
            severity: d.severity,
            kind: fixable ? 'insert-semicolon' : 'report-only',
            member: d.code,
            line: d.line,
            file: 'code',
            title: `${d.code}: ${d.message}`,
            detail: fixable
                ? 'The project\'s own build stops here: the statement before this position is not terminated. '
                + 'Fix: add the missing `;` at the end of that line.'
                : `Reported by the project's own build (\`dotnet build\`), not by a rule — which is why it comes `
                + `with no automatic fix. Open the file, read the compiler's message above and change the code.`,
            data: { path: d.file, line: String(d.line), column: String(d.column) }
        });
    }
    for (const e of projectErrors) {
        out.push({
            id: `build:project:${e.code}`,
            severity: 'error',
            kind: 'report-only',
            member: e.code,
            file: 'code',
            title: `${e.code}: ${e.message}`,
            detail: 'The build itself failed before any file could be blamed — there is no line to jump ' +
                'to. The compiler names the code above; a missing source file or a broken project file is ' +
                'what usually produces this.',
            data: { line: '0' }
        });
    }
    return out;
}

let collection: vscode.DiagnosticCollection | undefined;

function diagnostics(): vscode.DiagnosticCollection {
    if (!collection) collection = vscode.languages.createDiagnosticCollection('avaloniaDesigner.build');
    return collection;
}

/** Publishes the compiler's own findings for the whole project into the PROBLEMS pane, replacing the
 *  previous run's — a stale build error is worse than none. */
export function publishBuildDiagnostics(diagnosticsList: CompilerDiagnostic[]): void {
    collection?.clear();
    const byFile = new Map<string, vscode.Diagnostic[]>();
    for (const d of diagnosticsList) {
        const line = Math.max(0, d.line - 1);
        const range = new vscode.Range(line, Math.max(0, d.column - 1), line, 1000);
        const item = new vscode.Diagnostic(
            range,
            d.message,
            d.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
        );
        item.source = 'Avalonia Designer (build)';
        item.code = d.code;
        const list = byFile.get(d.file) ?? [];
        list.push(item);
        byFile.set(d.file, list);
    }
    for (const [file, list] of byFile) diagnostics().set(vscode.Uri.file(file), list);
}

export function clearBuildDiagnostics(): void {
    collection?.clear();
}

export function disposeBuildDiagnostics(): void {
    collection?.dispose();
    collection = undefined;
}
