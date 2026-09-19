/* T2 — the project's own compiler as the second half of the code check (asked 2026-09-17).
 *
 * The user removed a `;` from a handler in their own app (OptimisedCSTest). The Code Fix… checker
 * called the file clean — its syntax rules are structural, and a missing `;` leaves the braces
 * perfectly balanced — while `dotnet build` refused the file with `CS1002: ; expected`. Their words:
 * *"It used to work but now it does not pick up syntax (or any other) errors."*
 *
 * What is proven here:
 *   1. `dotnet build` output is parsed: errors, warnings, VB codes, paths with spaces, parentheses
 *      inside the compiler's own message, and MSBuild printing every error twice;
 *   2. only the project's own source is reported — generated `obj/` partials and other projects are not;
 *   3. errors with no file at all (`CSC : error CS2001: …`) are kept, not silently dropped;
 *   4. they arrive as Code Fix entries: a `CS1002` in the form gets the rule's one-click fix, everything
 *      else is report-only, and a line the rules already reported is not listed twice;
 *   5. the findings go into their own PROBLEMS collection, which a second build replaces;
 *   6. the build runs in exactly one place — the deliberate Code Fix… press — never on the automatic
 *      re-checks, and is switchable off.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const bd = require('../../out/buildDiagnostics.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const FORM = '/home/niel/app/MainWindow.axaml.cs';

/** The shape `dotnet build OptimisedCSTest.csproj -nologo -v:quiet` really prints (measured 2026-09-17). */
const REAL_BUILD = [
    `${FORM}(96,38): error CS1002: ; expected [/home/niel/app/App.csproj]`,
    '',
    'Build FAILED.',
    '',
    `${FORM}(96,38): error CS1002: ; expected [/home/niel/app/App.csproj]`,
    '    0 Warning(s)',
    '    1 Error(s)'
].join('\n');

module.exports = async (t) => {
    t.section('the project build as the second half of the code check');

    // ---------- 1) parsing what the compiler prints ----------
    {
        const text = [
            REAL_BUILD,
            '/home/niel/app/MyDataSet.cs(12,9): warning CS0168: The variable is declared but never used [p]',
            "/home/niel/app/My Form.cs(3,1): error CS1501: No overload for method 'Foo' takes 2 arguments (expected 1) [p]",
            '/home/niel/app/X.vb(7,9): warning BC42104: Variable is used before assigned [p]',
            'nonsense'
        ].join('\n');
        const parsed = bd.parseCompilerOutput(text, '/home/niel/app');
        t.equal(parsed.length, 4, 'parse', 'the duplicate MSBuild prints of one error count once');
        t.equal(parsed[0].file, FORM, 'parse', 'with the absolute file the compiler named');
        t.equal(parsed[0].line, 96, 'parse', 'the line');
        t.equal(parsed[0].column, 38, 'parse', 'and the column, so the caret can land on it');
        t.equal(parsed[0].code, 'CS1002', 'parse', 'the code');
        t.equal(parsed[0].message, '; expected', 'parse', "and the message without MSBuild's [project] suffix");
        t.equal(parsed[1].severity, 'warning', 'parse', 'a warning stays a warning');
        t.equal(parsed[2].file, '/home/niel/app/My Form.cs', 'parse', 'a path with a space is not cut in half');
        t.ok(/\(expected 1\)$/.test(parsed[2].message), 'parse',
            "parentheses inside the compiler's own message survive");
        t.equal(parsed[3].code, 'BC42104', 'parse', 'VB codes are read the same way (the check runs both languages)');
        t.equal(bd.parseCompilerOutput('X.cs(1,1): error CS1002: ; expected').length, 1, 'parse',
            'and a relative path is still read');
        t.equal(bd.parseCompilerOutput('X.cs(1,1): error CS1002: ; expected')[0].file,
            path.resolve('X.cs'), 'parse', 'resolved so it can be compared with a real file name');
    }

    // ---------- 2) only the project's own source ----------
    {
        t.equal(bd.isProjectSource('/p/MyDataSet.cs', '/p'), true, 'filter', "the project's own source is kept");
        t.equal(bd.isProjectSource('/p/Views/Main.cs', '/p'), true, 'filter', 'in any folder under it');
        t.equal(bd.isProjectSource('/p/obj/Debug/net10.0/X.g.cs', '/p'), false, 'filter',
            'generated XAML partials are dropped — nobody can fix those');
        t.equal(bd.isProjectSource('/p/bin/Debug/net10.0/Y.cs', '/p'), false, 'filter', 'and anything in bin');
        t.equal(bd.isProjectSource('/other/Y.cs', '/p'), false, 'filter',
            "a file of another project is not this project's business");
    }

    // ---------- 3) errors with no file are kept ----------
    {
        const errors = bd.parseProjectErrors([
            'CSC : error CS2001: Source file not found [/p/A.csproj]',
            'error MSB3021: Unable to copy file "x" to "y" [/p/A.csproj]',
            'CSC : error CS2001: Source file not found [/p/A.csproj]',
            `${FORM}(96,38): error CS1002: ; expected [/p/A.csproj]`
        ].join('\n'));
        t.equal(errors.length, 2, 'project-errors',
            'a build that fails before any file can be blamed is reported, not dropped');
        t.equal(errors[0].code, 'CS2001', 'project-errors', 'with its code');
        t.equal(errors[1].code, 'MSB3021', 'project-errors', "including MSBuild's own failures");
        t.equal(errors.filter((e) => e.code === 'CS2001').length, 1, 'project-errors',
            'and no duplicate of the same code');
        t.equal(/CS1002/.test(errors.map((e) => e.code).join(',')), false, 'project-errors',
            'while an error that HAS a file is not counted twice (it is a located diagnostic)');
    }

    // ---------- 4) they arrive as Code Fix entries ----------
    {
        const diagnostics = [
            { file: FORM, line: 96, column: 38, severity: 'error', code: 'CS1002', message: '; expected' },
            { file: '/home/niel/app/MyDataSet.cs', line: 12, column: 9, severity: 'error', code: 'CS0103', message: 'The name nope does not exist' },
            { file: FORM, line: 20, column: 5, severity: 'warning', code: 'CS0168', message: 'declared but never used' }
        ];
        const entries = bd.compilerIssues(diagnostics, [], FORM, new Set());
        t.equal(entries.length, 3, 'entries', 'every diagnostic becomes one entry');
        t.equal(entries[0].kind, 'insert-semicolon', 'entries',
            "a CS1002 in the form gets the rule's one-click fix — the compiler says where, the fix writes it");
        t.equal(entries[0].line, 96, 'entries', 'on the line the compiler named, wherever it is in the body');
        t.equal(entries[0].severity, 'error', 'entries', 'as an error');
        t.ok(/CS1002/.test(entries[0].title), 'entries', 'titled with the code the compiler printed');
        t.ok(/; expected/.test(entries[0].title), 'entries', "and the compiler's own words");
        t.equal(entries[1].kind, 'report-only', 'entries',
            'while a type error in another file is report-only: no rule can repair it');
        t.equal(entries[1].data.path, '/home/niel/app/MyDataSet.cs', 'entries',
            'and it carries its own file, so "Go to line" opens the right one');
        t.equal(entries[1].file, 'code', 'entries', 'without pretending an XAML-side finding it is not');
        t.equal(entries[2].severity, 'warning', 'entries', 'a warning stays a warning');

        const deduped = bd.compilerIssues(diagnostics, [], FORM, new Set([`${FORM}:96`]));
        t.equal(deduped.length, 2, 'entries', 'a line the rules already reported is not listed a second time');
        t.equal(deduped.some((i) => i.line === 96), false, 'entries', 'that line is gone from the list');
        t.equal(deduped.some((i) => i.line === 12), true, 'entries', 'while the others are untouched');

        const noFile = bd.compilerIssues([], [{ code: 'CS2001', message: 'Source file not found' }], FORM, new Set());
        t.equal(noFile.length, 1, 'entries', 'a project-level error is listed too');
        t.equal(noFile[0].kind, 'report-only', 'entries', 'with no fix to offer');
        t.equal(noFile[0].line, undefined, 'entries', 'and no line to jump to, which the dialog handles');
    }

    // ---------- 4b) a removed control arrives as a one-click comment-out (2026-09-19) ----------
    {
        const diag = (message, code = 'CS0103', file = FORM) => ({ file, line: 40, column: 9, severity: 'error', code, message });
        const removed = bd.compilerIssues([diag("The name 'Slider1' does not exist in the current context")], [], FORM, new Set());
        t.equal(removed[0].kind, 'comment-out-control-code', 'removed-control',
            'a missing control name is fixable: the fix comments the statement out, marked TODO');
        t.equal(removed[0].data.control, 'Slider1', 'removed-control', 'and it knows WHICH name to comment out');
        t.ok(/removed \(or renamed\) in the designer/.test(removed[0].detail), 'removed-control',
            'the detail says why the name is missing');

        const vb = bd.compilerIssues(
            [diag("'NumericUpDown1' is not declared. It may be inaccessible due to its protection level.", 'BC30451')],
            [], FORM, new Set());
        t.equal(vb[0].kind, 'comment-out-control-code', 'removed-control',
            'the VB spelling (BC30451) gets the same offer');

        // A missing TYPE is not a removed control — guessing there would comment out code that is fine.
        const typeError = bd.compilerIssues([diag("The type or namespace name 'Widget' could not be found")], [], FORM, new Set());
        t.equal(typeError[0].kind, 'report-only', 'removed-control', 'a missing type stays report-only');

        // And the same name in a file that is not the form's own code-behind.
        const elsewhere = bd.compilerIssues(
            [diag("The name 'Slider1' does not exist in the current context", 'CS0103', '/home/niel/app/Other.cs')],
            [], FORM, new Set());
        t.equal(elsewhere[0].kind, 'report-only', 'removed-control',
            "the offer is only made for the form's own code-behind");
    }

    // ---------- 5) the PROBLEMS pane ----------
    {
        const diagnostics = [
            { file: FORM, line: 96, column: 38, severity: 'error', code: 'CS1002', message: '; expected' },
            { file: FORM, line: 20, column: 5, severity: 'warning', code: 'CS0168', message: 'declared but never used' },
            { file: '/home/niel/app/MyDataSet.cs', line: 12, column: 9, severity: 'error', code: 'CS0103', message: 'The name nope does not exist' }
        ];
        vscode.__diagnosticCollections.length = 0;
        bd.publishBuildDiagnostics(diagnostics);
        const col = vscode.__diagnosticCollections[vscode.__diagnosticCollections.length - 1];
        t.equal(col.name, 'avaloniaDesigner.build', 'problems',
            "its own collection, so a rule re-check cannot clear the compiler's findings");
        t.equal(col.all().size, 2, 'problems', 'grouped by the files the compiler named');
        const form = col.get(vscode.Uri.file(FORM));
        t.equal(form.length, 2, 'problems', 'both findings in the form are published');
        t.equal(form[0].source, 'Avalonia Designer (build)', 'problems', 'marked as coming from the build');
        t.equal(form[0].code, 'CS1002', 'problems', 'with the code, so the PROBLEMS list can be filtered by it');
        t.equal(form[0].message, '; expected', 'problems', "and the compiler's message");
        bd.publishBuildDiagnostics([]);
        t.equal(col.all().size, 0, 'problems', 'a new build replaces the last — a stale build error is worse than none');
    }

    // ---------- 6) where and when the build runs ----------
    {
        const panel = read('src/designerPanel.ts');
        t.equal((panel.match(/buildProject\(/g) || []).length, 1, 'wiring',
            'the build runs in exactly one place — the press the user makes, never a background check');
        t.ok(/private codeCheckBuild\(\): boolean[\s\S]{0,140}?get<boolean>\('codeCheck\.build', true\)/.test(panel),
            'wiring', 'gated by avaloniaDesigner.codeCheck.build, on by default');
        t.equal((panel.match(/this\.codeCheckBuild\(\)/g) || []).length, 2, 'wiring',
            'read in the two entry points: the Code Fix… press, and coming back to the designer');
        const silent = panel.slice(panel.indexOf('private async runSilentCheck'), panel.indexOf('private visibleIssues'));
        t.ok(silent.length > 500, 'wiring', 'the silent re-check was found in the panel source');
        t.equal(/buildProject/.test(silent), false, 'wiring',
            'the automatic re-check never pays seconds for a build');
        t.ok(/const file = msg\.path \|\| \(msg\.file === 'axaml'/.test(panel), 'wiring',
            'Go to line opens the file the compiler named, not just the form\'s code-behind');
        t.ok(/publishBuildDiagnostics\(report\.remaining\.concat\(report\.warnings\)\)/.test(panel), 'wiring',
            "the compiler's findings are published where the user looks — what is LEFT after the loop, plus the warnings it never touches");

        const web = read('media/designer.js');
        t.ok(/if \(msg\.build\)/.test(web), 'wiring', 'the Code Fix… dialog says what the build said');
        t.ok(/The project does not build: /.test(web), 'wiring', 'spelling out how many errors it reported');

        const ext = read('src/extension.ts');
        t.ok(/try \{ disposeBuildDiagnostics\(\); \}/.test(ext), 'wiring',
            'the build collection is disposed on shutdown like the other one');

        t.ok(/"avaloniaDesigner\.codeCheck\.build":\s*\{\s*"type": "boolean",\s*"default": true/.test(read('package.json')),
            'wiring', 'and the setting is declared, so it shows up in Settings');
        t.ok(/never runs on the automatic re-checks/.test(read('package.json')), 'wiring',
            'its description says when it runs, which is the part that costs seconds');
    }
};
