/* T2 — the contract between the panel's webview and the extension.
 *
 * Why this file exists: `media/designer.js` sends the load request, the extension reads it, and nothing
 * checked that the two agreed. They did not — the webview sent a **flat** object
 * (`{contextLength, gpu, ttlSeconds, …}`) while the extension read `state.options.contextLength`, so every
 * click on Load Model threw a TypeError before a single message could be posted. The user saw
 * *"downloading (first time)… nothing further happens"* and there was no error anywhere to find, because the
 * handler had no `catch` either (fixed in 0.9.19, which is how the actual message finally surfaced on
 * 2026-09-15: `Cannot read properties of undefined (reading 'contextLength')`).
 *
 * The shape is now read out of both files and compared field by field. This is deliberately a *source*
 * comparison rather than a runtime one: the two halves run in different processes (the extension host and a
 * sandboxed webview), so a test that only exercised one of them would have passed while the feature was
 * dead.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { resolveLoadOptions } = require('../../out/localModels.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** The keys of the object literal returned by `aiPayload()` in the webview. */
function webviewPayloadKeys() {
    const js = read('media/designer.js');
    const body = /function aiPayload\(\) \{[\s\S]*?return \{([\s\S]*?)\n        \};/.exec(js);
    if (!body) return [];
    return [...body[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
}

/** The fields `PanelAiRequest` declares in the extension (the merged load+save payload). */
function extensionRequestKeys() {
    const ts = read('src/aiPanel.ts');
    const body = /export interface PanelAiRequest extends RequestedLoad \{([\s\S]*?)\n\}/.exec(ts);
    if (!body) return [];
    return [...body[1].matchAll(/^\s*(\w+)\s*[:?]/gm)].map((m) => m[1]);
}

/** The fields `RequestedLoad` declares — the parent interface of `LoadRequest`. */
function requestedLoadKeys() {
    const ts = read('src/localModels.ts');
    const body = /export interface RequestedLoad \{([\s\S]*?)\n\}/.exec(ts);
    if (!body) return [];
    return [...body[1].matchAll(/^\s*(\w+)\s*[:?]/gm)].map((m) => m[1]);
}

module.exports = async (t) => {
    t.section('panel/webview contract');

    // ---------- 1) the load request, field for field ----------
    {
        const sent = webviewPayloadKeys();
        const expected = [...extensionRequestKeys(), ...requestedLoadKeys()];
        t.ok(sent.length >= 8, 'contract', `the webview sends a full payload (found ${sent.length} fields)`);
        t.ok(expected.length >= 8, 'contract',
            `the extension declares what it needs (found ${expected.length} over ${extensionRequestKeys().length} + ${requestedLoadKeys().length})`);

        const missing = sent.filter((k) => !expected.includes(k));
        const unread = expected.filter((k) => !sent.includes(k));
        t.equal(missing, [], 'contract',
            'every field the webview sends is declared in the extension — an undeclared field is silently ignored');
        t.equal(unread, [], 'contract',
            'and every field the extension reads is actually sent — this is the exact mismatch that made '
            + 'Load Model do nothing at all');

        // The specific field that threw: the load path must read it off the request, never off a nested
        // `options` object the webview has never sent. (`panelState()` legitimately *builds* such an object
        // for the webview to draw itself from — that is the direction the test does not cover.)
        const panel = read('src/aiPanel.ts');
        const loadPath = panel.slice(panel.indexOf('export async function loadChoice'), panel.indexOf('async function loadLmStudio'));
        t.ok(/request\.contextLength/.test(loadPath), 'contract', 'the context length is read from the request');
        t.ok(/resolveLoadOptions\(model, request, facts\)/.test(loadPath), 'contract',
            'and the GPU ratio and idle timer reach the command line through the resolver, which is the only '
            + 'thing that turns "auto" into a real argument (asserted above)');
        t.ok(/options\.contextLength/.test(loadPath) === false, 'contract',
            'while nothing in that path depends on a nested `options` the webview has never sent');
        t.ok(/PanelAiRequest/.test(read('src/designerPanel.ts')), 'contract',
            'the message handler casts to the same type the webview sends');
    }

    // ---------- 2) "you decide" reaches the command line as a decision ----------
    {
        // The webview can send three ways of saying "auto": context 0, gpu 'auto'/'' and ttl -1. LM Studio
        // rejects `--gpu auto` and `--ttl -1`, so they have to be resolved before they become argv.
        const model = { provider: 'lmstudio', key: 'qwen3.8-27b', label: 'qwen3.8-27b', params: '27B', arch: 'qwen35', sizeGb: 17.74, kind: 'chat' };
        const facts = { totalRamGb: 28, freeRamGb: 18, cpuCount: 12, lockLimitGb: 3.78 };

        const auto = resolveLoadOptions(model, { contextLength: 0, gpu: 'auto', ttlSeconds: -1 }, facts);
        t.equal(auto.contextLength, 8192, 'args', 'context "auto" becomes a real number for this machine');
        t.equal(auto.gpu, 'off', 'args', 'and so does the offload ratio (a 17.7 GB model is not offloaded)');
        t.equal(auto.ttlSeconds, 900, 'args', 'and the idle timer');
        t.equal(auto.identifier, 'qwen3.8-27b', 'args', 'while the identifier stays the model key');
        t.ok(auto.reasons.length > 0, 'args', 'with the reasons kept, so the panel can still explain itself');

        const explicit = resolveLoadOptions(model, { contextLength: 16384, gpu: 'max', ttlSeconds: 0 }, facts);
        t.equal(explicit.contextLength, 16384, 'args', 'a real choice is never overridden');
        t.equal(explicit.gpu, 'max', 'args', 'including the GPU ratio');
        t.equal(explicit.ttlSeconds, 0, 'args',
            'and 0 means "keep it loaded", which is a choice rather than a missing value');

        // Junk that can arrive from a hand-edited DOM must not reach the argv either.
        const junk = resolveLoadOptions(model, { contextLength: NaN, gpu: '', ttlSeconds: NaN }, facts);
        t.equal(junk.contextLength, 8192, 'args', 'NaN falls back to the recommendation');
        t.equal(junk.gpu, 'off', 'args', 'an empty GPU value too');
        t.equal(junk.ttlSeconds, 900, 'args', 'and a missing timer');
        t.ok(Number.isFinite(junk.contextLength) && Number.isFinite(junk.ttlSeconds), 'args',
            'so the argv can never contain `-c NaN` or `--ttl NaN`');
    }

    // ---------- 3) the panel does not reopen itself after Save ----------
    {
        const js = read('media/designer.js');
        t.ok(/let settingsPending = false/.test(js), 'modal',
            'opening the panel is tied to a user action, not to the next message that arrives');
        t.ok(/if \(settingsPending\) \{/.test(js), 'modal',
            'the fill routine only opens the modal when that action set the flag');
        t.ok(/els\.btnCodeSettings\.addEventListener\('click', \(\) => \{\s*settingsPending = true;/.test(js), 'modal',
            'which the ⚙ Settings button does');
        t.ok(/function closeSettings\(\) \{[^}]*settingsPending = false/.test(js), 'modal',
            'and closing clears it, so a later refresh cannot reopen the panel');
        t.ok(/if \(settingsOpen === false\) \{/.test(js) === false, 'modal',
            'the old "open whenever we are not open" rule is gone — that is what flickered after Save');
    }
};
