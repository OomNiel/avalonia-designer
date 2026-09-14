/* T2 — reviewing an AI proposal: the buttons that must not disappear.
 *
 * This file exists because of a user report that took three attempts to fix: "the Apply notice disappears
 * after a few seconds" and later "there is no button or means to apply the diff". The decision used to be
 * offered only in a notification, which expires while a diff is being read — the one task that genuinely
 * outlives a toast. It is now published in three places that do not time out (a code lens on the method,
 * the status bar, and the diff editor's title bar), and this file pins all three so a future refactor
 * cannot quietly reduce them to the toast again.
 *
 * Kept as its own file (rather than inside `assistant.test.js`) because that file is open in the editor
 * while this is written, and `files.autoSave = onFocusChange` + `editor.formatOnSave` will happily save a
 * stale buffer over an edit — which is exactly how two earlier changes to that file were lost.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

module.exports = async (t) => {
    t.section('assistant (reviewing a proposal)');

    const pkg = JSON.parse(read('package.json'));
    const ui = read('src/assistantUi.ts');
    const ext = read('src/extension.ts');
    const commands = (pkg.contributes.commands || []).map((c) => c.command);

    // ---------- 1) the two commands exist and are registered ----------
    for (const name of ['applyProposal', 'discardProposal']) {
        const id = `avaloniaDesigner.assistant.${name}`;
        t.ok(commands.includes(id), 'review', `${name} is a contributed command`);
        t.ok(new RegExp(`registerCommand\\('${id.replace(/\./g, '\\.')}'`).test(ext), 'review',
            `${name} is registered in activate()`);
        t.ok(new RegExp(`vscode\\.commands\\.registerCommand\\('${id.replace(/\./g, '\\.')}'`).test(ext), 'review',
            'with the commands namespace (not something else that happens to share the name)');
    }

    // ---------- 2) the title-bar buttons ----------
    const title = pkg.contributes.menus['editor/title'] || [];
    for (const name of ['applyProposal', 'discardProposal']) {
        const entry = title.find((m) => m.command === `avaloniaDesigner.assistant.${name}`);
        t.ok(!!entry, 'review', `${name} has a button in the editor title bar`);
        t.ok(/avaloniaDesigner\.proposalPending/.test(entry.when || ''), 'review',
            'shown only while a proposal is actually waiting');
        t.ok(/isInDiffEditor/.test(entry.when || ''), 'review',
            'and on the diff — confirmed working on a real machine, 2026-09-14');
        t.ok(/navigation/.test(entry.group || ''), 'review', 'placed in the title bar, not buried in a menu');
    }

    // ---------- 3) the status bar ----------
    t.ok(/createStatusBarItem/.test(ui), 'review', 'the decision is published in the status bar');
    t.ok(/statusBarItem\.warningBackground/.test(ui), 'review',
        'coloured, so it is not one more grey word among branch and encoding');
    t.ok(/\$\(check\) Apply AI change/.test(ui), 'review', 'with a check icon on Apply');
    t.ok(/applyItem\.command = 'avaloniaDesigner\.assistant\.applyProposal'/.test(ui), 'review',
        'and the button drives the same command as the palette entry');
    t.ok(/applyItem\?\.hide\(\)/.test(ui) && /discardItem\?\.hide\(\)/.test(ui), 'review',
        'both are hidden again once the decision is made');

    // ---------- 4) the code lens on the method ----------
    t.ok(/class ProposalLensProvider implements vscode\.CodeLensProvider/.test(ui), 'review',
        'a code lens provider renders the decision where the change is');
    t.ok(/registerCodeLensProvider\(\[\{ language: 'csharp' \}, \{ language: 'vb' \}\]/.test(ext), 'review',
        'registered for C# and VB');
    t.ok(/proposalLenses,/.test(ext), 'review', 'and disposed with the window');
    t.ok(/p\.documentUri\.toString\(\) !== document\.uri\.toString\(\)/.test(ui), 'review',
        'it stays silent in every other file');
    t.ok(/p\.startLine - 1/.test(ui), 'review', 'and sits directly above the method it would replace');
    t.ok(/onDidChangeCodeLenses = this\.emitter\.event/.test(ui), 'review',
        'lenses appear and disappear when the proposal does');
    t.ok(/proposalLenses\.refresh\(\)/.test(ui), 'review', 'which is fired on publish and on clear');

    // ---------- 5) falling back to a breadcrumb, and naming the running build ----------
    t.ok(/is waiting — apply it with the buttons/.test(ui), 'review',
        'an unanswered toast leaves a breadcrumb in the output channel');
    t.ok(/function extensionVersion/.test(ui) && /packageJSON\?\.version/.test(ui), 'review',
        'the status dialog can name the running version');
    t.ok(/extension v\$\{extensionVersion\(\)\}/.test(ui), 'review',
        'because "did my reload take effect?" is otherwise guesswork — a VSIX installed into an open '
        + 'window changes nothing until the window reloads');

    // ---------- 6) a proposal cannot come back from the dead ----------
    // A proposal lives in memory. A tab of ours that survives a window reload therefore has no buttons
    // and cannot be applied — which is what "there is no means to apply the diff" and "the tab opens by
    // itself, I had all tabs closed" both were (2026-09-14).
    t.ok(/export async function closeStaleProposalTabs/.test(ui), 'review',
        'activation closes proposal tabs left over from a previous window');
    t.ok(/closeStaleProposalTabs\(\)/.test(ext), 'review', 'and it is actually called');
    t.ok(/u\.scheme === PROPOSAL_SCHEME/.test(ui), 'review',
        'identified by our own scheme, so no real file is ever closed');
    t.ok(/TabInputTextDiff \? input\.modified : undefined/.test(ui)
        && /TabInputText \? input\.uri : undefined/.test(ui), 'review',
        'both a diff pane and a plain virtual document are recognised');
    t.ok(/proposalContent\.forget\(proposalUrisIn\(tab\)\[0\]\)/.test(ui), 'review',
        'and its content is dropped with it, not kept for a tab that is gone');
    t.ok(/left over from a previous window/.test(ui), 'review',
        'the output channel says what happened, so a vanished tab does not look like a broken diff');
};
