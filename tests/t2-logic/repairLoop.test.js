/* T2 — the build-driven repair loop (`src/repairLoop.ts`), asked for 2026-09-17.
 *
 * *"The system must check for errors by running a build when it is done refactoring the code, then Code Fix
 * must check for compile errors and fix each one, one at a time untill the build is clean"* … *"Keep fixing
 * what it can and list the rest."* … and, on un-fixable errors, *"keep fixing what it can and list the rest"*.
 *
 * The loop is free of `vscode` and of the filesystem, so the whole strategy is proven here with a fake
 * project: a list of errors that a fake compiler returns, and a fake fixer whose edits change that list.
 * What matters is the *policy*, not `dotnet`:
 *   1. one error at a time, with a rebuild after every single fix;
 *   2. an error no fixer understands is skipped, and the loop carries on with the next one;
 *   3. a fix that does not help is undone — and one that helps is kept;
 *   4. it stops: when clean, when nothing is fixable, when the budget runs out, when the user cancels, and
 *      when the build itself cannot run;
 *   5. a fixer that throws never takes the loop down with it.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { repairUntilClean, errorKey, describeError } = require('../../out/repairLoop.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const err = (code, line, file = '/p/MainWindow.axaml.cs') => ({
    file, line, column: 1, severity: 'error', code, message: `${code} at ${line}`
});

/**
 * A fake project: `script` is a list of error sets, one per build — the first build returns `script[0]`, and
 * every later build returns the set the fixers have produced. Fixers are declared per error code, and an
 * error without one is "no-fix" (what a real project's type errors are).
 */
function fakeProject(start, { fixers = {}, onFix } = {}) {
    let errors = start;
    const state = {
        builds: 0,
        progress: [],
        fixed: [],
        reverts: 0,
        applied: [],
        cancelled: false,
        failNext: undefined,
        /** Which fixes have run, in order — the "one at a time" evidence. */
        order: []
    };
    const ctx = {
        build: async () => {
            state.builds += 1;
            if (state.failNext) {
                const failure = state.failNext;
                state.failNext = undefined;
                return { errors: [], failure };
            }
            return { errors };
        },
        fix: async (e) => {
            const fixer = fixers[e.code];
            if (!fixer) return 'no-fix';
            state.order.push(errorKey(e));
            if (fixer === 'throw') throw new Error('fixer exploded');
            if (fixer === 'failed') return 'failed';
            state.pending = errors;
            errors = fixer(e, errors);
            if (onFix) onFix(e, errors);
            state.applied.push(e);
            return 'fixed';
        },
        revert: async () => {
            state.reverts += 1;
            errors = state.pending;
        },
        progress: (text) => state.progress.push(text),
        cancelled: () => state.cancelled
    };
    return { ctx, state, errors: () => errors };
}

const codes = (list) => list.map((e) => e.code).join(',');

module.exports = async (t) => {
    t.section('the build-driven repair loop');

    // ---------- 1) one at a time, rebuild after every fix ----------
    {
        const p = fakeProject([err('CS1002', 96), err('CS1002', 120)], {
            fixers: {
                CS1002: (e, errors) => errors.filter((x) => x.line !== e.line)
            }
        });
        const report = await repairUntilClean(p.ctx);
        t.equal(report.stoppedBecause, 'clean', 'one-at-a-time', 'two unfixable-by-hand errors end clean');
        t.equal(report.started, 2, 'one-at-a-time', 'the first build reported both');
        t.equal(report.applied, 2, 'one-at-a-time', 'both fixes were kept');
        t.equal(p.state.builds, 3, 'one-at-a-time', 'a rebuild after EVERY fix, not one at the end');
        t.equal(p.state.order.length, 2, 'one-at-a-time', 'and the fixers ran once each');
        t.equal(codes(report.fixed), 'CS1002,CS1002', 'one-at-a-time', 'both errors are listed as fixed');
        t.equal(report.remaining.length, 0, 'one-at-a-time', 'with nothing left');
        t.ok(/Fixing CS1002 in MainWindow\.axaml\.cs:96 — 2 error\(s\) left…/.test(p.state.progress[0]), 'one-at-a-time',
            'and the user is told which error is being fixed, where, with how much left');
    }

    // ---------- 2) an error no fixer understands is skipped, the rest still gets fixed ----------
    {
        const p = fakeProject([err('CS0246', 3), err('CS1002', 96), err('CS0201', 40)], {
            fixers: {
                // CS1002 is understood; CS0246 (a type that does not exist) and CS0201 (bad expression) are not.
                CS1002: (e, errors) => errors.filter((x) => x.line !== e.line)
            }
        });
        const report = await repairUntilClean(p.ctx);
        t.equal(report.stoppedBecause, 'no-progress', 'skip', 'the loop stops when only unfixable errors remain');
        t.equal(report.applied, 1, 'skip', 'the one fixable error was fixed anyway');
        t.equal(report.remaining.length, 2, 'skip', 'and the two it could not fix are listed');
        t.equal(codes(report.remaining), 'CS0246,CS0201', 'skip', 'in the compiler\'s own order');
        t.ok(report.remaining.every((e) => e.severity === 'error'), 'skip',
            'as errors the user still has to do something about');
    }

    // ---------- 3) a fix that does not help is undone ----------
    {
        const p = fakeProject([err('CS1002', 96)], { fixers: { CS1002: () => [err('CS1002', 96)] } });
        const report = await repairUntilClean(p.ctx);
        t.equal(report.applied, 0, 'revert', 'a fix that changed nothing is not counted as applied');
        t.equal(report.reverted, 1, 'revert', 'it is undone instead');
        t.equal(p.state.reverts, 1, 'revert', 'so the user\'s file is left as they wrote it');
        t.equal(report.remaining.length, 1, 'revert', 'and the error is still there, in the list');
        t.equal(report.stoppedBecause, 'no-progress', 'revert', 'the loop ends rather than spinning on it');
        t.equal(p.state.builds, 2, 'revert', 'with exactly one rebuild to find that out');
    }

    // ---------- 3b) a fix that trades one error for another is KEPT (that is progress) ----------
    {
        const p = fakeProject([err('CS1002', 96)], {
            fixers: { CS1002: () => [err('CS0103', 97)] }      // the missing `;` reveals a bad name
        });
        const report = await repairUntilClean(p.ctx);
        t.equal(report.applied, 1, 'reveal', 'the count is unchanged but an error changed — the fix is kept');
        t.equal(report.reverted, 0, 'reveal', 'nothing is undone for that');
        t.equal(codes(report.fixed), 'CS1002', 'reveal', 'the error it removed is reported as fixed');
        t.equal(codes(report.remaining), 'CS0103', 'reveal', 'and the new one takes its place, un-fixable');
    }

    // ---------- 4) the ways it stops ----------
    {
        const clean = fakeProject([], {});
        const r0 = await repairUntilClean(clean.ctx);
        t.equal(r0.stoppedBecause, 'clean', 'stops', 'a project that already builds stops before any fixing');
        t.equal(clean.state.builds, 1, 'stops', 'after exactly one build');
        t.equal(r0.applied, 0, 'stops', 'with nothing done');

        const noneFixable = fakeProject([err('CS0246', 3)], {});
        const r1 = await repairUntilClean(noneFixable.ctx);
        t.equal(r1.stoppedBecause, 'nothing-fixable', 'stops',
            'when no fixer understands anything, it says so instead of claiming progress');
        t.equal(noneFixable.state.builds, 1, 'stops', 'and does not rebuild for nothing');

        const many = fakeProject(Array.from({ length: 12 }, (_, i) => err('CS1002', 10 + i)), {
            fixers: { CS1002: (e, errors) => errors.filter((x) => x.line !== e.line) }
        });
        const r2 = await repairUntilClean(many.ctx, 3);
        t.equal(r2.stoppedBecause, 'max-passes', 'stops', 'the fix budget bounds the work');
        t.equal(r2.applied, 3, 'stops', 'three fixes were applied');
        t.equal(r2.remaining.length, 9, 'stops', 'and the other nine are reported, not dropped');
        t.equal(many.state.builds, 4, 'stops', 'one build per fix plus the first');

        const cancel = fakeProject([err('CS1002', 1), err('CS1002', 2)], {
            fixers: { CS1002: (e, errors) => errors.filter((x) => x.line !== e.line) },
            onFix: () => { cancel.state.cancelled = true; }
        });
        const r3 = await repairUntilClean(cancel.ctx);
        t.equal(r3.stoppedBecause, 'cancelled', 'stops', 'the user can stop it');
        t.equal(r3.applied, 1, 'stops', 'what was already fixed stays fixed');
        t.equal(r3.remaining.length, 1, 'stops', 'and the rest is listed');

        const broken = fakeProject([err('CS1002', 1)], {});
        broken.state.failNext = 'Could not run `dotnet build` (spawn dotnet ENOENT).';
        const r4 = await repairUntilClean(broken.ctx);
        t.equal(r4.stoppedBecause, 'build-failed', 'stops', 'a build that cannot run is reported as such');
        t.ok(/dotnet build/.test(r4.failure), 'stops', 'with the reason the context gave');
        t.equal(r4.applied, 0, 'stops', 'and no fix is attempted on a project whose state is unknown');
    }

    // ---------- 5) a fixer that throws does not take the loop down ----------
    {
        const p = fakeProject([err('CS1002', 1), err('CS1002', 2)], {
            fixers: {
                CS1002: (e, errors) => {
                    if (e.line === 1) throw new Error('fixer exploded');
                    return errors.filter((x) => x.line !== e.line);
                }
            }
        });
        const report = await repairUntilClean(p.ctx);
        t.equal(report.applied, 1, 'throw', 'the second error is still fixed after the first fixer threw');
        t.equal(report.remaining.length, 1, 'throw', 'and the one that threw is listed for the user');
        t.equal(report.remaining[0].line, 1, 'throw', 'the right one');
    }

    // ---------- 6) the helpers the panel reports with ----------
    {
        t.equal(describeError(err('CS1002', 96)), 'CS1002 in MainWindow.axaml.cs:96', 'helpers',
            'a status line names the code, the file and the line');
        t.equal(describeError(err('CS1002', 96, '/p/Sub/Dir/My Form.vb')), 'CS1002 in My Form.vb:96', 'helpers',
            'taking just the file name, so the message stays one line');
        t.equal(errorKey(err('CS1002', 96)), errorKey(err('CS1002', 96)), 'helpers',
            'the same mistake has one identity (a fix is not retried for ever)');
        t.equal(errorKey(err('CS1002', 96)) === errorKey(err('CS1002', 97)), false, 'helpers',
            'and a different line is a different mistake');
    }

    // ---------- 7) what the loop carries that it never fixes ----------
    {
        const p = fakeProject([err('CS1002', 96)], { fixers: { CS1002: (e, errors) => errors.filter((x) => x.line !== e.line) } });
        const ctx = p.ctx;
        const build = ctx.build;
        ctx.build = async () => ({ ...(await build()), warnings: [{ ...err('CS0168', 12), severity: 'warning' }] });
        const report = await repairUntilClean(ctx);
        t.equal(report.warnings.length, 1, 'warnings', 'a compiler warning is carried through');
        t.equal(report.warnings[0].code, 'CS0168', 'warnings', 'with its code, so the panel can list it');
        t.equal(report.stoppedBecause, 'clean', 'warnings', 'and it does not stop the loop from reporting clean');
        t.equal(report.applied, 1, 'warnings', 'the error is still repaired');
    }

    // ---------- 8) the trigger: hand/AI edits build, designer edits stay instant ----------
    {
        const stamp = require('../../out/writeStamp.js');
        stamp.resetCodeEdited();
        t.equal(stamp.codeEditedSinceBuild('/p/A.axaml'), false, 'trigger', 'a form starts not needing a build');
        stamp.markCodeEdited('/p/A.axaml', 'edited in the editor');
        t.equal(stamp.codeEditedSinceBuild('/p/A.axaml'), true, 'trigger', 'a hand edit marks it');
        t.equal(stamp.codeEditedReason('/p/A.axaml'), 'edited in the editor', 'trigger',
            'with the reason, for the status line');
        t.equal(stamp.codeEditedSinceBuild('/p/B.axaml'), false, 'trigger', 'and only that form');
        stamp.clearCodeEdited('/p/A.axaml');
        t.equal(stamp.codeEditedSinceBuild('/p/A.axaml'), false, 'trigger',
            'once it has been checked with a build, the mark is gone');
        stamp.markCodeEdited('/p/A.axaml', 'first');
        stamp.markCodeEdited('/p/A.axaml', 'second');
        t.equal(stamp.codeEditedReason('/p/A.axaml'), 'first', 'trigger',
            'the first reason is kept — it says what started it');
        stamp.resetCodeEdited();

        const panel = read('src/designerPanel.ts');
        t.ok(/private async checkOnReturn\(/.test(panel), 'trigger',
            'coming back to the designer is its own step (the moment the user described)');
        t.ok(/await this\.runSilentCheck\(doc, panel\);\s*\n\s*const key = doc\.uri\.toString\(\);\s*\n\s*if \(!this\.codeCheckBuild\(\)\) return;\s*\n\s*if \(!codeEditedSinceBuild\(key\)\) return;/
            .test(panel), 'trigger',
            'it always runs the instant rules, and builds only when the code was edited since the last build');
        t.ok(/if \(webviewPanel\.visible && this\.codeCheckMode\(\) === 'onReturn'\) \{\s*\n\s*void this\.checkOnReturn\(document, webviewPanel\);/.test(panel),
            'trigger', 'hooked to the tab becoming visible in the default mode');
        t.ok(/if \(e\.document\.isDirty\) this\.noteHandEdit\(e\.document\.uri\)/.test(panel), 'trigger',
            'a DIRTY buffer is what marks a hand edit — a designer write lands on disk and reloads clean');
        t.ok(/this\.panels\.keys\(\)/.test(panel.slice(panel.indexOf('private noteHandEdit'), panel.indexOf('private checkOnReturn'))),
            'trigger', 'an edit in another project file marks every open form, because the build is the project\'s');
        t.equal((panel.match(/repairUntilClean\(/g) || []).length, 1, 'trigger',
            'the loop has exactly one entry point');
        t.ok(/revert: \(\) => this\.revertLoopFix\(\)/.test(panel), 'trigger',
            'a fix that did not help is undone through the undo it snapshotted');
        t.ok(/cancelled: \(\) => !panel\.visible/.test(panel), 'trigger',
            'and closing the panel stops the loop');
        t.ok(/attempted === 0 \? 'nothing-fixable' : 'no-progress'/.test(read('src/repairLoop.ts')), 'trigger',
            'the report says whether nothing was fixable or nothing helped — different things to the user');
        t.ok(/kind: 'insert-semicolon'/.test(panel.slice(panel.indexOf('private async fixCompilerError'), panel.indexOf('private formUriOfFile'))),
            'trigger', 'a CS1002 the compiler located is handed to the semicolon fixer at THAT line');
        t.ok(/issues\.find\(\(i\) => i\.kind !== 'report-only'/.test(panel), 'trigger',
            'while a rule finding on the same line is preferred, so one mistake is never repaired twice');

        const ui = read('src/assistantUi.ts');
        t.ok(/markCodeEdited\(form\.uri\.toString\(\), 'written by the assistant'\)/.test(ui), 'trigger',
            'an assistant write marks the form too — a model write is worth a build whatever the buffer says');

        // ---------- the model as the last fixer (the user's answer "b": rules, then the AI when it is
        // already running — and never started from here) ----------
        const ai = ui.slice(ui.indexOf('export async function repairWithAI'), ui.indexOf('export async function addHubModel'));
        t.ok(ai.length > 500, 'ai-repair', 'repairWithAI was found in the assistant module');
        t.ok(/if \(!assistantEnabled\(cfg\)\) return false;/.test(ai), 'ai-repair',
            'it does nothing at all unless the AI assist is enabled');
        t.ok(/cfg\.backend === 'bundled'[\s\S]{0,220}?if \(!bundledRuntimeRunning\(\)\)[\s\S]{0,160}?return false;/.test(ai),
            'ai-repair',
            'a bundled runtime that is NOT running ends the attempt — the loop never starts a model');
        t.ok(/\{ applyWithoutDiff: true, quiet: true \}/.test(ai), 'ai-repair',
            'the answer is applied without a diff and without a dialog, because the rebuild is the review');
        t.ok(/not inside a method/.test(ai), 'ai-repair',
            'a finding outside a method is refused — the prompt asks for a method replacement');
        t.ok(/await probeServer\(cfg\)/.test(ai), 'ai-repair',
            'an external server is only asked if it answers a probe');
        t.ok(/opts\.quiet[\s\S]{0,300}?return `\$\{target\.kind === 'replace' \? 'Rewrote' : 'Added'\} \$\{name\}\(\)`/.test(ui),
            'ai-repair', 'and the quiet branch reports success without the "Build to verify" prompt');
        t.equal(/showWarningMessage\(\\`\$\{written\.message\}/.test(ui.slice(ui.indexOf('if (opts.quiet)'), ui.indexOf('if (opts.quiet)') + 400)), false,
            'ai-repair', 'with nothing shown to the user for a repair they did not ask for');

        t.ok(/if \(!this\.codeCheckAiRepair\(\)\) return 'no-fix';/.test(panel), 'ai-repair',
            'the panel only offers the model when the setting says so');
        t.ok(/const ai = await repairWithAI\(vscode\.Uri\.file\(d\.file\), d\.line, `\$\{d\.code\}: \$\{d\.message\}`\);\s*\n\s*if \(ai\) return 'fixed';/.test(panel),
            'ai-repair', 'and an applied answer counts as a fix, which the loop then verifies by rebuilding');
        t.ok(/"avaloniaDesigner\.codeCheck\.aiRepair":\s*\{\s*"type": "boolean",\s*"default": true/.test(read('package.json')),
            'ai-repair', 'declared as a setting, on by default, so it can be switched off');
        t.ok(/LOOP_AI_TRIES_MAX = 3/.test(panel) && /this\.loopAiTries >= AvaloniaDesignerProvider\.LOOP_AI_TRIES_MAX/.test(panel),
            'ai-repair',
            'and the model is asked at most three times per run — a local answer costs seconds to a minute, so '
            + 'ten un-fixable errors must not become ten model calls');
        t.ok(/this\.loopAiTries = 0;/.test(panel) && /this\.loopAiTries \+= 1;/.test(panel),
            'ai-repair', 'the budget is per run, and spent only on an attempt');
    }
};
