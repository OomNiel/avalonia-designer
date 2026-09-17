/* T2 — models the user brings from Hugging Face, and the order the picker presents them (asked 2026-09-16).
 *
 * The report that started this: *"models served by the llama.cpp server respond faster and better than the LM
 * Studio models. Should we remove the LM Studio dependency from the extension and load everything from Hugging
 * Face?"* Two things came out of it, both tested here:
 *   1. the three ways to get a model are presented in the order the extension can guarantee them — its own
 *      runtime, then a server the user runs, then LM Studio's library — instead of opening on LM Studio;
 *   2. a pasted Hub URL becomes a real spec (size and SHA-256 read from the Hub), so any GGUF can be fetched
 *      through the same verified pipeline as the five pinned ones.
 *
 * The Hub's answer shape is pinned to the one this session read by hand to verify the Gemma spec, so a change
 * in the API shows up as a failing test rather than as a broken download.
 */
'use strict';
const {
    MODEL_SPECS,
    formatBytes,
    hubFileSpec,
    hubGgufFiles,
    parseHubUrl
} = require('../../out/modelSpecs.js');
const { buildChoices, choiceValue } = require('../../out/aiPanel.js');

/** The Hub's `?blobs=true` answer for a repo with two quants and a README (real shape, trimmed). */
const HUB_ANSWER = {
    id: 'bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF',
    siblings: [
        { rfilename: 'README.md', size: 1200 },
        { rfilename: 'DeepSeek-Coder-V2-Lite-Instruct-IQ3_M.gguf', size: 7553175296, lfs: { sha256: '08db93121a9e6fa3cb4978c4b4e9c37e9407160ceec77f0894c45f43bf2d91d1' } },
        { rfilename: 'DeepSeek-Coder-V2-Lite-Instruct-IQ4_XS.gguf', size: 8571593472, lfs: { sha256: 'ac0a996714d4e8ed06b4398096bae88a32c349ceab42ffe629c2ddf4c4e0706c' } },
        // A file the Hub does not hash: offered by nobody, because the download verifies what it fetches.
        { rfilename: 'unverified.gguf', size: 100 }
    ]
};

module.exports = async (t) => {
    t.section('models from Hugging Face');

    // ---------- reading a pasted URL ----------
    {
        t.equal(parseHubUrl('https://huggingface.co/bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF')?.repo,
            'bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF', 'url', 'a model page gives the repo');
        t.equal(parseHubUrl('https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/tree/main')?.revision, 'main', 'url',
            '/tree/<rev> is read as a revision');
        t.equal(parseHubUrl('https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/blob/main/x.gguf')?.file, 'x.gguf', 'url',
            '/blob/<rev>/<file> gives the file — what the browser URL bar shows');
        t.equal(parseHubUrl('https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/x.gguf')?.file, 'x.gguf', 'url',
            'and so does /resolve, which is what the download page links to');
        t.equal(parseHubUrl('bartowski/some-repo')?.repo, 'bartowski/some-repo', 'url',
            'owner/repo without a scheme works — people paste that too');
        t.equal(parseHubUrl('https://huggingface.co/owner/repo?notion=1')?.repo, 'owner/repo', 'url',
            'a query string is not part of the path');
        t.equal(parseHubUrl('https://example.com/owner/repo'), undefined, 'url',
            'a different host is refused rather than guessed at');
        t.equal(parseHubUrl('just some words'), undefined, 'url', 'and so is prose');
    }

    // ---------- the Hub's file list ----------
    {
        const files = hubGgufFiles(HUB_ANSWER);
        t.equal(files.length, 3, 'files', 'every .gguf is listed, the README is not');
        t.equal(files[0].file.endsWith('.gguf'), true, 'files', 'with its file name');
        t.equal(files[0].bytes, 7553175296, 'files', 'and the byte count the Hub reports');
        t.ok(files[0].sha256.startsWith('08db9312'), 'files', 'and the LFS hash the Hub publishes');
        t.equal(files[0].sha256.length, 64, 'files', 'a full SHA-256, which is what verification needs');
        t.equal(files[2].sha256, undefined, 'files',
            'a file the Hub does not hash is still listed, and flagged by having no hash');
        t.equal(hubGgufFiles({ siblings: [] }).length, 0, 'files', 'an empty repo lists nothing');
        t.equal(hubGgufFiles(undefined).length, 0, 'files', 'and an unreadable answer does not throw');
    }

    // ---------- the spec built from those numbers ----------
    {
        const spec = hubFileSpec({
            repo: 'bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF',
            file: 'DeepSeek-Coder-V2-Lite-Instruct-IQ3_M.gguf',
            revision: 'main',
            bytes: 7553175296,
            sha256: '08db93121a9e6fa3cb4978c4b4e9c37e9407160ceec77f0894c45f43bf2d91d1'
        });
        t.equal(spec.url, 'https://huggingface.co/bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF/resolve/main/DeepSeek-Coder-V2-Lite-Instruct-IQ3_M.gguf',
            'spec', 'the download URL is the resolve URL, which serves the file itself');
        t.equal(spec.fileName, 'DeepSeek-Coder-V2-Lite-Instruct-IQ3_M.gguf', 'spec',
            'the file name is what the storage and the pin use');
        t.equal(spec.id.startsWith('hub/'), true, 'spec', 'the id is marked as an added model, so it is never confused with a pinned one');
        t.equal(spec.sha256.length, 64, 'spec', 'the hash travels with it — the download verifies it');
        t.ok(spec.detail.includes(formatBytes(7553175296)), 'spec', 'and the detail says the size the Hub reports');

        // The RAM gate is derived, like the pinned table's: a local model needs roughly its size again in RAM.
        t.equal(hubFileSpec({ repo: 'a/b', file: 'x.gguf', bytes: 4 * 1024 ** 3 }).minRamGb, 8, 'spec',
            'a 4 GB file asks for 8 GB of RAM (the same rule of thumb as the built-in table)');
        t.equal(hubFileSpec({ repo: 'a/b', file: 'x.gguf', bytes: 8 * 1024 ** 3 }).minRamGb, 16, 'spec',
            'a 8 GB file asks for 16 GB');
        t.equal(hubFileSpec({ repo: 'a/b', file: 'x.gguf' }).minRamGb, 16, 'spec',
            'and an unknown size is treated as the cautious case, not as a small model');

        // A spec is the same shape the pinned ones are, so nothing downstream can tell them apart — with one
        // deliberate exception: `backend` is *optional*, and only the shipped entries carry it, because they
        // are the same weights offered twice (the GPU build and the CPU build). An added model has no build of
        // its own: it runs on whatever `assistant.bundledBackend` says, exactly as before (2026-09-17).
        const keys = (s) => Object.keys(s).filter((k) => k !== 'backend').sort().join(',');
        t.equal(keys(spec), keys(MODEL_SPECS[0]), 'spec',
            'an added model is a ModelSpec exactly like a built-in one — the picker, the load path and Remove Model treat it identically');
        t.equal(spec.backend, undefined, 'spec', 'and it carries no build of its own, which a shipped entry may');
    }

    // ---------- the order the picker shows ----------
    {
        const discovery = {
            cli: '/home/x/.lmstudio/bin/lms',
            list: {
                chat: [{ provider: 'lmstudio', key: 'google/gemma-4-e4b', label: 'google/gemma-4-e4b', params: '7.5B', arch: 'gemma4', sizeGb: 6.33, kind: 'chat' }],
                embeddings: [],
                diskGb: 10
            },
            server: { running: false, port: 1234 },
            loaded: [],
            kindById: new Map([['google/gemma-4-e4b', 'chat']]),
            api: false
        };
        const choices = buildChoices(discovery, [], 'http://127.0.0.1:1234/v1', 'bundled', '', {}, MODEL_SPECS);
        const order = choices.map((c) => c.kind);
        const firstBundled = order.indexOf('bundled');
        const firstCustom = order.indexOf('custom');
        const firstLms = order.indexOf('lmstudio');
        t.ok(firstBundled >= 0 && firstCustom >= 0 && firstLms >= 0, 'order',
            'all three paths are in the list when LM Studio happens to be installed');
        t.equal(firstBundled, 0, 'order',
            'the two entries this extension ships for come first (asked 2026-09-17)');
        t.equal(choices.filter((c) => !c.group).length, MODEL_SPECS.length, 'order',
            'and they are the whole visible list — nothing else is above the fold');
        t.ok(choices.filter((c) => c.kind !== 'bundled').every((c) => c.group === 'Advanced…'), 'order',
            'so LM Studio, loose files, other servers and "let the server decide" all sit under Advanced…');
        t.ok(firstLms > firstBundled && firstCustom > firstBundled, 'order',
            'nothing outside those two entries is offered above them');
        t.equal(choices.filter((c) => c.kind === 'bundled').length, MODEL_SPECS.length, 'order',
            'every pinned model is still offered');
        t.ok(choices.some((c) => c.value === choiceValue('custom', 'http://127.0.0.1:1234/v1')), 'order',
            'and the custom-address entry is there, with the endpoint it will use');

        // Nothing was removed: with LM Studio installed its models are still pickable.
        t.ok(choices.some((c) => c.kind === 'lmstudio' && c.value === choiceValue('lms', 'google/gemma-4-e4b')), 'order',
            'LM Studio models remain offered, just no longer first');
    }

    // ---------- the commands exist and are wired ----------
    {
        const fs = require('fs');
        const path = require('path');
        const ROOT = path.join(__dirname, '..', '..');
        const extension = fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
        const manifest = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
        t.ok(/registerCommand\('avaloniaDesigner\.assistant\.addHubModel'/.test(extension), 'commands',
            'the palette entry for adding a model from the Hub is registered');
        t.ok(/registerCommand\('avaloniaDesigner\.assistant\.forgetHubModel'/.test(extension), 'commands',
            'and so is forgetting one (the weights stay until Remove Model)');
        t.ok(/"avaloniaDesigner\.assistant\.addHubModel"/.test(manifest) && /"avaloniaDesigner\.assistant\.forgetHubModel"/.test(manifest),
            'commands', 'both are contributed, so they appear in the Command Palette');
        t.ok(/if \(!answer\.ok\) \{/.test(fs.readFileSync(path.join(ROOT, 'src/modelRuntime.ts'), 'utf8')), 'commands',
            'a failed Hub lookup is reported rather than silently offering nothing');
    }
};
