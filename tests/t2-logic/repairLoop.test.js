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
        // The cancel rule is *two* rules (2026-09-18), and the difference is the whole point:
        //  - a run the user did not ask for (the automatic check) stops when they switch away, which is what
        //    `cancelled` was written for;
        //  - the step-up run was asked for in a modal — answered from wherever the user is looking, usually the
        //    code they were just told to look at — so visibility must not cancel it. That is what made the offer
        //    do *nothing at all*: the escalation ran, and the loop's first check threw the run away.
        t.ok(/cancelled: \(\) => \(opts\.ignoreVisibility \? false : !panel\.visible\)/.test(panel), 'trigger',
            'switching away stops the loop by default, and only by default');
        t.ok(/const once = \(opts: \{ ignoreVisibility\?: boolean \} = \{\}\): Promise<RepairReport>/.test(panel), 'trigger',
            'the flag is part of the one entry point');
        t.ok(/const done = await once\(\{ ignoreVisibility: true \}\);/.test(panel), 'trigger',
            'and the step-up run passes it, because the user just said yes to it in a modal');
        t.ok(/Code Fix · 30B run finished — \$\{done\.remaining\.length\} error\(s\) left/.test(panel), 'trigger',
            'the run\'s outcome is logged, so "did the 30B do anything?" is answerable from the file');
        t.ok(/aiLog\(this\.context, `Code Fix · 30B: \$\{message\}`\);/.test(panel)
            && /setStatusBarMessage\(`Avalonia: 30B — \$\{message\}`/.test(panel), 'trigger',
            'every step of the escalation reaches the log AND the status bar — the panel and the webview are both '
            + 'behind the code editor this run is answered from, which is what "the 30B does nothing" looked like');
        t.ok(/const up = await Promise\.race\(\[[\s\S]{0,400}?ESCALATION_DEADLINE_MS/.test(panel)
            && /const ESCALATION_DEADLINE_MS = 5 \* 60 \* 1000;/.test(panel), 'trigger',
            'and a deadline, so waiting can never look like doing nothing');
        // The AI never got asked, for weeks, and it was this: only a file that IS an open form's code-behind
        // produced a `form`, and everything after that early return did. The designer's Code Fix is offered on
        // every C#/VB file in the project, so the gate has to be gone. (2026-09-18)
        t.equal(/if \(!form\) return 'no-fix';/.test(panel), false, 'trigger',
            'a file that is not an open form\'s code-behind still reaches the AI — the analyser rules are a '
            + 'bonus, not a toll gate');
        t.ok(/const run = form && options \? analyzeCodeBehind\(form, options\) : undefined;/.test(panel), 'trigger',
            'the rules only run when there is a form to analyse');
        t.ok(/this\.loopSnapshot = fs\.existsSync\(d\.file\)/.test(panel)
            && /\? \[\{ file: d\.file, text: fs\.readFileSync\(d\.file, 'utf8'\) \}\]/.test(panel), 'trigger',
            'and the snapshot still exists for a form-less file, so a failed fix can be reverted');
        // "Why did a rule not fix a missing `;`?" (asked 2026-09-18, with exactly that build error): the CS1002
        // branch looked at the line the COMPILER named — which for a missing terminator is where the parser
        // expected it, often the next token's line — got `That line already ends with a ";"` back from the
        // fixer, and answered 'no-fix' **without logging and without falling through**. So the model was never
        // asked, the offer blamed the 7B for a fix nobody attempted, and the 30B run repeated it in 0.87 s.
        const uiSrc = read('src/assistantUi.ts');
        t.ok(/attempts\.push\(\{ line: d\.line, column: d\.column \}\)/.test(panel), 'trigger',
            'the `;` rule asks the position the COMPILER named first — the column is where the `;` goes, which '
            + 'is inside a one-line block and unreachable for any line-end test');
        t.ok(/if \(found\?\.line\) attempts\.push\(\{ line: found\.line \}\)/.test(panel)
            && /for \(const line of \[d\.line, d\.line - 1, d\.line - 2, d\.line - 3\]\) attempts\.push\(\{ line \}\)/.test(panel),
            'trigger',
            'then the analyser\'s own finding, then the reported line and the three above it — every '
            + 'candidate logged, so a miss can be read instead of guessed at');
        t.equal(/return \/Added the missing\/\.test\(what\) \? 'fixed' : 'no-fix';/.test(panel), false, 'trigger',
            'and a miss no longer ends the function: the error is not consumed, so the next fixer still gets it '
            + '(§136–§138 again — a guard must not gate the work)');
        t.ok(/aiLog\(this\.context, `Repair loop: CS1002 at \$\{d\.line\},\$\{d\.column\} — `/.test(panel)
            && /column \$\{attempt\.column\} of line \$\{attempt\.line\}/.test(panel), 'trigger',
            'every candidate that did not apply is logged with the position it tried and the fixer\'s own words');
        t.ok(/handing this one to the model/.test(panel), 'trigger',
            'and the fall-through says which fixer was tried and which one is next');
        t.ok(/loopNoModel/.test(panel) && /the 7B was not asked: /.test(panel), 'trigger',
            'the step-up offer quotes the real reason instead of claiming the 7B tried and could not');
        t.ok(/the AI repair setting \(codeCheck\.aiRepair\) is off/.test(panel)
            && /Repair loop: the fixer for \$\{d\.code\} at line \$\{d\.line\} threw/.test(panel), 'trigger',
            'the two refusals that used to be silent (the setting, and a fixer that throws) now reach the log');
        t.ok(/Repair loop: the AI assist is off \(assistant\.backend\)/.test(uiSrc), 'trigger',
            '`repairWithAI` says why it did not ask (assist off, file not openable, language unknown)');
        t.ok(/an answer for \$\{message\} was not applied/.test(uiSrc), 'trigger',
            'and it says so when the model answered but no edit was applied — "asked, nothing came back" is not '
            + 'the same as "never asked"');
        t.ok(/if \(first\.stoppedBecause === 'cancelled'\) \{[\s\S]{0,200}?Repair loop: cancelled before the first fix/.test(panel),
            'trigger', 'a cancel is written to the log — this run left no trace at all, which is why it read as "nothing happens"');
        t.ok(/await this\.runRepairLoopInner\(doc, panel, why\);/.test(panel) && /private async runRepairLoopInner\(doc: DesignerDocument, panel: vscode\.WebviewPanel, why\?: string\)/.test(panel),
            'trigger', 'the loop is wrapped: the original body is now `runRepairLoopInner`');
        t.ok(/catch \(err\) \{[\s\S]{0,300}?aiLog\(this\.context, `Code Fix failed: \$\{message\}`\);[\s\S]{0,200}?showErrorMessage\(`Code Fix failed: \$\{message\}`\)/.test(panel),
            'trigger', 'and a throw can no longer be silent: logged AND shown, which is what "nothing happens" was');
        t.ok(/if \(!panel\.visible\) vscode\.window\.setStatusBarMessage\(`Avalonia: \$\{this\.loopStatus\(report, rules\)\}`/.test(panel),
            'trigger', 'the result also reaches the status bar when the designer is behind the file the user is reading');
        t.ok(/attempted === 0 \? 'nothing-fixable' : 'no-progress'/.test(read('src/repairLoop.ts')), 'trigger',
            'the report says whether nothing was fixable or nothing helped — different things to the user');
        t.ok(/kind: 'insert-semicolon'/.test(panel.slice(panel.indexOf('private async fixCompilerError'), panel.indexOf('private formUriOfFile'))),
            'trigger', 'a CS1002 the compiler located is handed to the semicolon fixer — on the reported line, '
            + 'the analyser\'s own line, or one just above (2026-09-18: the reported line is often the next '
        + 'token\'s, and the miss used to end the attempt silently)');
        t.ok(/issues\.find\(\(i\) => i\.kind !== 'report-only'/.test(panel), 'trigger',
            'while a rule finding on the same line is preferred, so one mistake is never repaired twice');

        const ui = read('src/assistantUi.ts');
        t.ok(/markCodeEdited\(form\.uri\.toString\(\), 'written by the assistant'\)/.test(ui), 'trigger',
            'an assistant write marks the form too — a model write is worth a build whatever the buffer says');

        // ---------- the model as the last fixer (the user's answer "b": rules, then the AI when it is
        // already running — and never started from here) ----------
        const ai = ui.slice(ui.indexOf('export async function repairWithAI'), ui.indexOf('export async function addHubModel'));
        t.ok(ai.length > 500, 'ai-repair', 'repairWithAI was found in the assistant module');
        t.ok(/if \(!assistantEnabled\(cfg\)\) \{[\s\S]{0,220}?return false;/.test(ai), 'ai-repair',
            'it does nothing at all unless the AI assist is enabled — and says so in the log (2026-09-18: this '
            + 'refusal was silent, which is how "the model was never asked" stayed invisible)');
        // The guard moved into `repairRuntime` on 2026-09-17 (it must know all three runtimes), so these
        // assertions name the invariants rather than one code shape: a runtime that is already up is used,
        // and nothing is ever STARTED for a repair — `effectiveConfig` (which does start the built-in runtime)
        // must not appear in this path at all.
        // 2026-09-17, later the same day: returning `cfg` unchanged was a bug, not a shortcut. `cfg.endpoint`
        // is the *external* setting — on this machine a dead port (37857) while the built-in runtime answered on
        // 33709, so every repair request failed with "No server answered … is the local model server running?"
        // while the status panel said the runtime was fine. The address the request uses is part of the guard.
        const guard = ui.slice(ui.indexOf('async function repairRuntime'), ui.indexOf('export async function repairWithAI'));
        t.ok(/const bundled = bundledRuntimeRunning\(\);[\s\S]{0,400}?return \{ \.\.\.cfg, endpoint: bundled\.endpoint \};/.test(guard),
            'ai-repair', 'the built-in runtime answers with its OWN address — never the endpoint setting');
        t.equal(/return cfg;/.test(guard), false, 'ai-repair',
            'and the shape that handed the config back unchanged (so the request went to a dead port) is gone');
        t.ok(/nothing of ours is up, but a llama-server is answering on/.test(guard), 'ai-repair',
            'a server found by probing is named in the log, and a mismatch with the setting is reported before the request');
        t.ok(/if \(cfg\.backend === 'bundled'\) return undefined;/.test(ui), 'ai-repair',
            'and is never started just to repair something');
        t.equal(/effectiveConfig\(cfg\)/.test(ai), false, 'ai-repair',
            'the loop does not use the config path that STARTS a runtime');
        t.ok(/return \(await probeServer\(cfg\)\)\.ok \? cfg : undefined;/.test(ui), 'ai-repair',
            'an external server is only asked if it answers a probe');
        t.ok(/\{ applyWithoutDiff: true, quiet: true \}/.test(ai), 'ai-repair',
            'the answer is applied without a diff and without a dialog, because the rebuild is the review');
        t.ok(/not inside a method/.test(ai), 'ai-repair',
            'a finding outside a method is refused — the prompt asks for a method replacement');
        t.ok(/probeServer\(cfg\)/.test(ui), 'ai-repair',
            'and an external server is probed before it is used at all');
        t.ok(/opts\.quiet[\s\S]{0,300}?return `\$\{target\.kind === 'replace' \? 'Rewrote' : 'Added'\} \$\{name\}\(\)`/.test(ui),
            'ai-repair', 'and the quiet branch reports success without the "Build to verify" prompt');
        // A failed assist used to be the one path with nothing in the log file: "No server answered" was shown
        // and never recorded, so the address it had tried could only be guessed (2026-09-17).
        t.ok(/AI assist failed: \$\{message\} — the request went to \$\{request\.endpoint\} \(backend \$\{request\.backend\}\)/.test(ui),
            'ai-repair', 'a failed request is logged with the address it actually used');
        t.equal(/showWarningMessage\(\\`\$\{written\.message\}/.test(ui.slice(ui.indexOf('if (opts.quiet)'), ui.indexOf('if (opts.quiet)') + 400)), false,
            'ai-repair', 'with nothing shown to the user for a repair they did not ask for');

        t.ok(/if \(!this\.codeCheckAiRepair\(\)\) \{[\s\S]{0,600}?return 'no-fix';/.test(panel), 'ai-repair',
            'the panel only offers the model when the setting says so — and records the reason, so the step-up '
            + 'offer can say "the 7B was not asked" instead of blaming it for a fix nobody attempted');
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
