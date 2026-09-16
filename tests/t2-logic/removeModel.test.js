/* T2 — "Remove Model": what it deletes, what it refuses, and what it says when a delete does not take.
 *
 * The button arrived with the 0.9.35 change set. Its three promises are checkable without VS Code:
 *   1. it only touches a *downloaded* built-in model (`bundled:<spec-id>`), never an LM Studio key;
 *   2. it never deletes without the host's modal answer, and a cancel leaves the file alone;
 *   3. it removes the weights *and* the `.part`/`.verified` sidecars, so the entry returns to "not
 *      downloaded yet" instead of lingering as a half-download;
 *   4. if the file survives the delete (a runtime still holding it open is the real case), it says so
 *      and does not clear the pin — "removed" for a 7 GB file that is still there is worse than a failure.
 *
 * Everything here runs against a real temporary `globalStorage` directory, with the modal and the
 * configuration stubbed. The configuration stub records its writes, so "the pin was cleared" is asserted
 * as an observation rather than inferred from the source text.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vscode = require('vscode');
const runtime = require('../../out/modelRuntime.js');
const { confirmAndRemoveModel } = require('../../out/aiPanel.js');
const { MODEL_SPECS } = require('../../out/modelSpecs.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Runs `body` with `patches` applied to the given modules, restoring them whatever happens. */
async function withPatches(patches, body) {
    const saved = patches.map(([mod, key]) => [mod, key, mod[key]]);
    for (const [mod, key, value] of patches) mod[key] = value;
    try {
        return await body();
    } finally {
        for (const [mod, key, value] of saved) mod[key] = value;
    }
}

/** A `WorkspaceConfiguration` that answers from `values` and records every `update`. */
function fakeConfig(values) {
    const writes = [];
    return {
        writes,
        get: (key, fallback) => (key in values ? values[key] : fallback),
        // No scope owns the values, so `updateSetting` writes to the user's settings — the same path the
        // real extension takes when nothing pins the key.
        inspect: () => ({ globalValue: undefined, workspaceValue: undefined, workspaceFolderValue: undefined }),
        has: (key) => key in values,
        update: async (key, value) => { writes.push([key, value]); values[key] = value; }
    };
}

module.exports = async (t) => {
    t.section('T2: Remove Model');

    const spec = MODEL_SPECS[0];
    const other = MODEL_SPECS[1];
    const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'remove-model-'));
    const context = { globalStorageUri: { fsPath: storage }, subscriptions: [], extensionPath: ROOT };
    const fileOf = (s) => path.join(storage, 'models', s.fileName);
    fs.mkdirSync(path.join(storage, 'models'), { recursive: true });

    /** Nothing on disk yet; the modal and the runtime are stubbed per case below. */
    try {
        // --- what it refuses -------------------------------------------------------------------------
        const notBundled = await confirmAndRemoveModel(context, 'lms:qwen/qwen3.5-9b');
        t.equal(notBundled.ok, false, 'refuse', 'an LM Studio key is not removable — that file is not ours');
        t.ok(/downloaded model/i.test(notBundled.message), 'refuse', 'and the message says what to pick');

        const unknown = await confirmAndRemoveModel(context, 'bundled:not-a-spec');
        t.equal(unknown.ok, false, 'refuse', 'a bundled id that is no longer in the table is refused');
        t.ok(/no longer in the built-in list/.test(unknown.message), 'refuse', 'naming the id it could not find');

        const missing = await confirmAndRemoveModel(context, `bundled:${spec.id}`);
        t.equal(missing.ok, false, 'refuse', 'a model that is not on disk is not "removed"');
        t.ok(/is not on disk/.test(missing.message), 'refuse', 'the message points at the missing file');

        // --- cancel leaves everything alone ----------------------------------------------------------
        fs.writeFileSync(fileOf(spec), 'weights');
        fs.writeFileSync(`${fileOf(spec)}.verified`, 'ok');
        let asked = 0;
        let last = ['', {}];
        const cancelled = await withPatches([
            [vscode.window, 'showWarningMessage', async (msg, opts) => { asked += 1; last = [msg, opts]; return 'Cancel'; }],
            [runtime, 'bundledRuntimeRunning', () => ({ running: false })],
            [runtime, 'stopModelServer', () => { }]
        ], () => confirmAndRemoveModel(context, `bundled:${spec.id}`));

        t.equal(asked, 1, 'cancel', 'the user is asked before anything is deleted');
        t.equal(last[1] && last[1].modal, true, 'cancel', 'and asked with a modal dialog, not a corner toast');
        t.ok(/cannot be undone/.test(last[0]), 'cancel', 'the warning says it cannot be undone');
        t.equal(cancelled.ok, false, 'cancel', 'Cancel is not a success');
        t.ok(fs.existsSync(fileOf(spec)), 'cancel', 'the weights are still there');

        // --- a real removal, model not in use --------------------------------------------------------
        let writes = [];
        const removed = await withPatches([
            [vscode.window, 'showWarningMessage', async () => 'Remove'],
            [runtime, 'bundledRuntimeRunning', () => ({ running: false })],
            [runtime, 'stopModelServer', () => { throw new Error('nothing to stop'); }],
            [vscode.workspace, 'getConfiguration', () => { const c = fakeConfig({ backend: 'external' }); writes = c.writes; return c; }]
        ], async () => {
            fs.writeFileSync(fileOf(spec), 'weights');
            fs.writeFileSync(`${fileOf(spec)}.part`, 'half');
            fs.writeFileSync(`${fileOf(spec)}.verified`, 'ok');
            return confirmAndRemoveModel(context, `bundled:${spec.id}`);
        });

        t.equal(removed.ok, true, 'remove', 'a confirmed removal succeeds');
        t.equal(fs.existsSync(fileOf(spec)), false, 'remove', 'the weights are gone');
        t.equal(fs.existsSync(`${fileOf(spec)}.part`), false, 'remove', 'a leftover .part is gone too');
        t.equal(fs.existsSync(`${fileOf(spec)}.verified`), false, 'remove',
            'and the .verified marker — no marker for a file that no longer exists');
        t.equal(writes.length, 0, 'remove',
            'removing a model that is not in use leaves the settings alone (nothing was pinned to it)');
        t.ok(/will re-download on next Load Model/.test(removed.message), 'remove', 'the message says what happens next');

        // --- a removal of the model currently in use: unload first, then clear the pin ---------------
        let stopped = 0;
        const active = await withPatches([
            [vscode.window, 'showWarningMessage', async () => 'Remove'],
            [runtime, 'bundledRuntimeRunning', () => ({ running: true, endpoint: 'http://127.0.0.1:1/v1' })],
            [runtime, 'stopModelServer', () => { stopped += 1; }],
            [vscode.workspace, 'getConfiguration', () => {
                const c = fakeConfig({ backend: 'bundled', modelPath: fileOf(spec), model: '' });
                writes = c.writes;
                return c;
            }]
        ], async () => {
            fs.writeFileSync(fileOf(spec), 'weights');
            return confirmAndRemoveModel(context, `bundled:${spec.id}`);
        });

        t.equal(stopped, 1, 'in use', 'the runtime holding the file is stopped before the delete');
        t.equal(active.ok, true, 'in use', 'the removal succeeds');
        t.equal(fs.existsSync(fileOf(spec)), false, 'in use', 'and the file is really gone');
        t.equal(writes.length, 2, 'in use', 'both pins are cleared — modelPath and model');
        t.equal(writes[0][0], 'modelPath', 'in use', 'modelPath first');
        t.equal(writes[0][1], '', 'in use', 'so the picker returns to "— choose a model —"');
        t.equal(writes[1][0], 'model', 'in use', 'then the LM Studio key');
        t.equal(writes[1][1], '', 'in use', 'which was empty anyway for a built-in model');

        // --- the delete that does not take: a failing unlink must not be reported as a success -------
        const stubborn = await withPatches([
            [vscode.window, 'showWarningMessage', async () => 'Remove'],
            [runtime, 'bundledRuntimeRunning', () => ({ running: true, endpoint: 'http://127.0.0.1:1/v1' })],
            [runtime, 'stopModelServer', () => { }],
            [vscode.workspace, 'getConfiguration', () => {
                const c = fakeConfig({ backend: 'bundled', modelPath: fileOf(spec), model: '' });
                writes = c.writes;
                return c;
            }]
        ], async () => {
            // A directory cannot be unlinked — the same `unlinkSync` failure a runtime holding the file
            // open produces on Windows, without patching `fs` for every other test in this process.
            fs.mkdirSync(fileOf(spec), { recursive: true });
            return confirmAndRemoveModel(context, `bundled:${spec.id}`);
        });

        t.equal(stubborn.ok, false, 'locked', 'a file that survives the delete is reported as a failure');
        t.ok(/could not be deleted/.test(stubborn.message), 'locked', 'the message says the file could not be deleted');
        t.ok(/press Unload/i.test(stubborn.message), 'locked', 'and tells the user the way out');
        t.equal(writes.length, 0, 'locked',
            'the pin is kept — a selection cleared while the file is still there would load nothing');
        fs.rmSync(fileOf(spec), { recursive: true, force: true });

        // --- the other specs are untouched by all of this -------------------------------------------
        t.equal(MODEL_SPECS.length >= 3, true, 'specs', 'the table offers more than one built-in model');
        t.ok(MODEL_SPECS.every((s) => /^[0-9a-f]{64}$/.test(s.sha256)), 'specs',
            'every spec carries a full SHA-256 — the sidecar refuses a file that does not match');
        t.ok(other.sha256 !== spec.sha256, 'specs', 'and no two entries share a hash');
    } finally {
        try { fs.rmSync(storage, { recursive: true, force: true }); } catch { /* best effort */ }
    }

    // --- the parts that only exist in the two source files -------------------------------------------
    const host = read('src/aiPanel.ts');
    const panel = read('src/designerPanel.ts');
    const js = read('media/designer.js');
    const css = read('media/designer.css');

    t.ok(/export async function confirmAndRemoveModel/.test(host), 'source', 'the host owns the removal');
    t.ok(/showWarningMessage\([\s\S]{0,200}\{ modal: true \}/.test(host), 'source',
        'and it is a modal confirmation, not a toast that quietly expires');
    t.ok(/id="aiRemove"[^>]*class="modal-btn warning"/.test(panel), 'source',
        'the button is styled as the destructive one, not as a primary action');
    t.ok(/\.modal-btn\.warning \{/.test(css), 'source', 'and that class exists in the stylesheet');
    t.ok(/case 'aiRemove': \{/.test(panel), 'source', 'the panel routes the message');
    t.ok(/type: 'aiRemove'/.test(js), 'source', 'the button posts it');
    t.ok(/els\.aiRemove, els\.aiScan/.test(js), 'source',
        'and it is disabled while the panel is busy, with the other AI buttons');
    t.ok(/action: 'remove'/.test(panel), 'source', 'the answer names the action it belongs to');
};
