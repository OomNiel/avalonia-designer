/* T2 — what "Unload" actually frees.
 *
 * Reported on 2026-09-15, the moment pinning started working: *"the Unload for the non-LM Studio models does not
 * work"*. The cause was plain in the code — `unloadEverything` only ever ran `lms unload --all`, which is LM
 * Studio's command, so for a built-in model it did nothing at all: the sidecar kept the weights and the picker
 * kept its `● in use` marker.
 *
 * The three branches are driven here with the module functions replaced, because the real ones spawn processes.
 * Every patch is restored afterwards: the runner shares a process, and a leaked `bundledRuntimeRunning` would make
 * the picker's own tests see a running runtime.
 */
'use strict';
const core = require('../../out/localModelCore.js');
const runtime = require('../../out/modelRuntime.js');
const { unloadEverything } = require('../../out/aiPanel.js');

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

module.exports = async (t) => {
    t.section('T2: Unload frees both runtimes');

    {
        let stopped = 0;
        let unloaded = 0;
        const outcome = await withPatches([
            [runtime, 'bundledRuntimeRunning', () => ({ running: true, endpoint: 'http://127.0.0.1:1/v1' })],
            [runtime, 'stopModelServer', () => { stopped += 1; }],
            [core, 'findLmsCli', () => undefined],
            [core, 'unloadAll', async () => { unloaded += 1; return { ok: true }; }]
        ], () => unloadEverything());

        t.equal(stopped, 1, 'unload', 'a running built-in runtime is stopped');
        t.equal(unloaded, 0, 'unload', 'and LM Studio is left alone when it is not installed');
        t.equal(outcome.ok, true, 'unload', 'the outcome is a success, not "LM Studio is not installed"');
        t.ok(/built-in runtime is stopped/.test(outcome.message), 'unload',
            'the message says what was actually freed');
    }

    {
        let stopped = 0;
        let unloaded = 0;
        const outcome = await withPatches([
            [runtime, 'bundledRuntimeRunning', () => ({ running: false })],
            [runtime, 'stopModelServer', () => { stopped += 1; }],
            [core, 'findLmsCli', () => '/usr/bin/lms'],
            [core, 'unloadAll', async () => { unloaded += 1; return { ok: true }; }]
        ], () => unloadEverything());

        t.equal(unloaded, 1, 'unload', 'LM Studio is unloaded when it is installed');
        t.equal(stopped, 0, 'unload', 'and a runtime that is not running is not "stopped" again');
        t.equal(outcome.ok, true, 'unload', 'success');
        t.ok(/LM Studio has nothing loaded/.test(outcome.message), 'unload', 'with its own line in the message');
    }

    {
        const outcome = await withPatches([
            [runtime, 'bundledRuntimeRunning', () => ({ running: false })],
            [runtime, 'stopModelServer', () => { }],
            [core, 'findLmsCli', () => undefined],
            [core, 'unloadAll', async () => { throw new Error('must not be called'); }]
        ], () => unloadEverything());

        t.equal(outcome.ok, true, 'unload', 'nothing loaded anywhere is not a failure');
        t.ok(/Nothing was loaded/.test(outcome.message), 'unload', 'and it says so instead of claiming success');
    }

    {
        const outcome = await withPatches([
            [runtime, 'bundledRuntimeRunning', () => ({ running: true })],
            [runtime, 'stopModelServer', () => { }],
            [core, 'findLmsCli', () => '/usr/bin/lms'],
            [core, 'unloadAll', async () => ({ ok: false, message: 'lms unload exited 1' })]
        ], () => unloadEverything());

        t.equal(outcome.ok, false, 'unload', 'a failing CLI is reported as a failure');
        t.equal(outcome.message, 'lms unload exited 1', 'unload', 'with the CLI\'s own words');
    }

    {
        // The rule itself, in the source: the bug was a single call to `lms` standing in for "unload everything".
        const fs = require('fs');
        const pathFile = require('path').join(__dirname, '..', '..', 'src', 'aiPanel.ts');
        const panel = fs.readFileSync(pathFile, 'utf8');
        t.ok(/export async function unloadEverything[\s\S]*?stopModelServer\(\)/.test(panel), 'unload',
            'unloadEverything stops the extension\'s own runtime');
        t.ok(/export async function unloadEverything[\s\S]*?foundLms\(\)/.test(panel), 'unload',
            'and only reaches for LM Studio when it is installed');
    }
};
