/* T2 — the AI section of the designer's ⚙ Settings panel, and the model core behind it.
 *
 * Two layers are asserted here, and the difference matters:
 *   - what can be *called* is called (the dropdown builder, the choice-value round trip, the scan filters
 *     and a real scan of a temporary directory tree), so a behaviour change fails a test rather than an
 *     opinion;
 *   - what needs VS Code is asserted against the source text (the message handlers, the switch writing
 *     `backend: off` *and* unloading, the manifest's `when` clause), because a stub cannot prove them.
 *
 * The scan test is the interesting one: it builds a directory tree containing the exact shapes this
 * machine really has — including `mmproj-gemma-4-E4B-it-BF16.gguf`, the vision projector that sits beside
 * the weights and must never be offered as a chat model.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildChoices, choiceValue, currentSelection, parseChoiceValue } = require('../../out/aiPanel.js');
const { scanForModelFiles } = require('../../out/localModelCore.js');
const { canImportFile, scanRoots } = require('../../out/localModels.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** A discovery fixture shaped exactly like the real `lms ls` + REST API answers (2026-09-15). */
const discovery = (over = {}) => ({
    cli: '/home/niel/.lmstudio/bin/lms',
    list: {
        chat: [
            { provider: 'lmstudio', key: 'google/gemma-4-e4b', label: 'google/gemma-4-e4b', params: '7.5B', arch: 'gemma4', sizeGb: 6.33, kind: 'chat' },
            { provider: 'lmstudio', key: 'qwen/qwen3.5-9b', label: 'qwen/qwen3.5-9b', params: '9B', arch: 'qwen35', sizeGb: 6.55, kind: 'chat' },
            { provider: 'lmstudio', key: 'qwen3.8-27b', label: 'qwen3.8-27b', params: '27B', arch: 'qwen35', sizeGb: 17.74, kind: 'chat' }
        ],
        embeddings: [
            { provider: 'lmstudio', key: 'text-embedding-nomic-embed-text-v1.5', label: 'text-embedding-nomic-embed-text-v1.5', params: '', arch: 'Nomic BERT', sizeGb: 0.084, kind: 'embeddings' }
        ],
        diskGb: 30.7
    },
    server: { running: true, port: 1234 },
    loaded: ['qwen/qwen3.5-9b'],
    kindById: new Map([
        ['google/gemma-4-e4b', 'chat'],
        ['qwen/qwen3.5-9b', 'chat'],
        ['qwen3.8-27b', 'chat'],
        ['text-embedding-nomic-embed-text-v1.5', 'embeddings']
    ]),
    api: true,
    ...over
});

module.exports = async (t) => {
    t.section('AI settings panel');

    // ---------- 1) the dropdown value protocol ----------
    {
        t.equal(choiceValue('lms', 'qwen/qwen3.5-9b'), 'lms:qwen/qwen3.5-9b', 'choice',
            'a model key survives the round trip (it contains a slash, so a naive split would break it)');
        t.equal(parseChoiceValue('lms:qwen/qwen3.5-9b').key, 'qwen/qwen3.5-9b', 'choice', 'and comes back whole');
        t.equal(parseChoiceValue('file:/home/x/my model.gguf').key, '/home/x/my model.gguf', 'choice',
            'a path with a space and a colon-free name is fine too');
        t.equal(parseChoiceValue('custom:http://127.0.0.1:8080/v1').key, 'http://127.0.0.1:8080/v1', 'choice',
            'an address keeps its own colon — only the first one separates the kind');
        t.equal(parseChoiceValue('').kind, '', 'choice', 'junk yields an empty kind rather than throwing');
        t.equal(parseChoiceValue('nocolon').kind, '', 'choice', 'and so does a value with no separator');
    }

    // ---------- 2) the list a novice sees ----------
    {
        const files = [{
            file: '/home/x/Downloads/Llama-3-8B-Q4_K_M.gguf',
            name: 'Llama-3-8B-Q4_K_M.gguf',
            sizeGb: 4.9,
            folder: '~/Downloads',
            inLmStudio: false
        }];
        const choices = buildChoices(discovery(), files, 'http://127.0.0.1:1234/v1');

        const lms = choices.filter((c) => c.kind === 'lmstudio');
        t.equal(lms.length, 3, 'list', 'every chat model LM Studio has is offered');
        t.equal(lms.map((c) => c.value).includes('lms:text-embedding-nomic-embed-text-v1.5'), false, 'list',
            'the embedding model is not — it cannot answer a chat request');
        t.ok(/● loaded/.test(lms[1].label), 'list', 'the loaded model is marked, so the list shows what is in memory');
        t.ok(/on disk, ready to load/.test(lms[0].detail), 'list', 'and the others say they are ready');

        t.equal(choices.filter((c) => c.kind === 'bundled').length, 2, 'list',
            'both downloadable models are offered');
        t.ok(/download once/.test(choices.find((c) => c.kind === 'bundled').label), 'list',
            'labelled as a one-time download, because that is what it costs');

        const found = choices.find((c) => c.kind === 'file');
        t.ok(found && /~\/Downloads/.test(found.detail), 'list',
            'a file found on disk is offered with the folder it came from');
        t.ok(/Llama-3-8B/.test(found.label) && /4\.9 GB/.test(found.label), 'list', 'and its size');

        t.equal(choices[choices.length - 1].kind, 'custom', 'list',
            '"a server I run myself" is last: it is the least common answer, and it needs the address field');
        t.equal(choices.length, 3 + 2 + 1 + 1, 'list', 'and the list is exactly those four groups');
    }

    // ---------- 3) which entry the settings point at ----------
    {
        const choices = buildChoices(discovery(), [], 'http://127.0.0.1:1234/v1');
        t.equal(currentSelection(choices, 'qwen/qwen3.5-9b', 'external', ''), 'lms:qwen/qwen3.5-9b', 'selection',
            'a pinned LM Studio model selects its own entry');
        t.equal(currentSelection(choices, 'gone/model', 'external', ''), '', 'selection',
            'a model that is no longer on disk selects nothing (the panel then starts on the first entry)');
        t.equal(currentSelection(choices, '', 'bundled', '/home/niel/.config/Code/User/globalStorage/x/models/qwen2.5-coder-3b-instruct-q4_k_m.gguf'),
            'bundled:qwen2.5-coder-3b-q4', 'selection',
            'the bundled backend selects the spec it was set up for, from the file path alone');
        t.equal(currentSelection(choices, '', 'off', ''), '', 'selection', 'and an off switch selects nothing');
    }

    // ---------- 4) what files are even candidates ----------
    {
        t.equal(canImportFile('Qwen3.8-27B-Q4_K_M.gguf'), true, 'files', 'a real model file is a candidate');
        t.equal(canImportFile('model.GGUF'), true, 'files', 'case does not decide it');
        t.equal(canImportFile('mmproj-gemma-4-E4B-it-BF16.gguf'), false, 'files',
            'a vision projector is NOT — it sits in the same folder as the weights and cannot answer chat');
        t.equal(canImportFile('mmproj_Qwen3.5-9B-BF16.gguf'), false, 'files', 'under its other spelling too');
        t.equal(canImportFile('Qwen3.5-9B.gguf.tmp'), false, 'files', 'a partial download is not');
        t.equal(canImportFile('config.json'), false, 'files', 'and neither is any other file');

        const roots = scanRoots('/home/niel');
        t.equal(roots[0], '/home/niel/.lmstudio/models', 'files', 'LM Studio\'s folder is looked at first');
        t.ok(roots.includes('/media') && roots.includes('/mnt'), 'files',
            'and the mount points are listed: the walker descends into them, so an external drive is found');
        t.ok(roots.includes('/home/niel/Downloads'), 'files', 'along with where a download actually lands');
    }

    // ---------- 5) a real scan of a real directory tree ----------
    {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gguf-scan-'));
        const big = path.join(tmp, 'good');
        const nested = path.join(tmp, 'nested', 'deeper');
        fs.mkdirSync(big, { recursive: true });
        fs.mkdirSync(nested, { recursive: true });
        // 120 MB sparse files: over the size floor, and instant to create.
        const sparse = (file) => fs.writeFileSync(file, 'GGUF');
        sparse(path.join(big, 'Qwen3.5-9B-Q4_K_M.gguf'));
        fs.truncateSync(path.join(big, 'Qwen3.5-9B-Q4_K_M.gguf'), 120 * 1024 * 1024);
        sparse(path.join(big, 'mmproj-Qwen3.5-9B-BF16.gguf'));
        fs.truncateSync(path.join(big, 'mmproj-Qwen3.5-9B-BF16.gguf'), 120 * 1024 * 1024);
        sparse(path.join(nested, 'tiny.gguf')); // 4 bytes — a test blob, not a model
        sparse(path.join(tmp, 'notes.txt'));

        const seen = [];
        const found = await scanForModelFiles({ roots: [tmp], onProgress: (m) => seen.push(m) });
        t.equal(found.length, 1, 'scan', 'exactly one real model file is offered');
        t.equal(found[0].name, 'Qwen3.5-9B-Q4_K_M.gguf', 'scan', 'the weights');
        t.ok(found[0].sizeGb > 0.11, 'scan', 'reported with its size, so the panel can decide about memory');
        t.equal(found[0].inLmStudio, false, 'scan', 'and marked as outside LM Studio, so an import is expected');
        t.equal(found.filter((f) => /mmproj/.test(f.name)).length, 0, 'scan', 'the projector was filtered out');
        t.equal(found.filter((f) => /tiny/.test(f.name)).length, 0, 'scan', 'as was the 4-byte file');
        t.ok(seen.length > 0, 'scan', 'the scan reports progress — a silent 6-second freeze reads as a hang');

        // A scan that finds nothing must not throw, and must not invent anything.
        const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'gguf-empty-'));
        t.equal((await scanForModelFiles({ roots: [empty] })).length, 0, 'scan',
            'an empty folder yields an empty list, not an error');
        t.equal((await scanForModelFiles({ roots: [path.join(empty, 'does-not-exist')] })).length, 0, 'scan',
            'and so does a missing one');
        fs.rmSync(tmp, { recursive: true, force: true });
        fs.rmSync(empty, { recursive: true, force: true });
    }

    // ---------- 6) the manifest and the wiring a stub cannot prove ----------
    {
        const pkg = JSON.parse(read('package.json'));
        const props = pkg.contributes.configuration.properties;
        t.equal(props['avaloniaDesigner.assistant.loadContextLength'].default, 0, 'manifest',
            'the context override defaults to 0 = "recommend one"');
        t.equal(props['avaloniaDesigner.assistant.loadGpu'].default, 'auto', 'manifest',
            'so does the offload ratio');
        t.equal(props['avaloniaDesigner.assistant.loadTtlSeconds'].default, -1, 'manifest',
            'and the unload timer');

        const implement = pkg.contributes.menus['editor/context'].filter((m) => m.command === 'avaloniaDesigner.assistant.implement')[0];
        t.ok(/avaloniaDesigner\.aiEnabled/.test(implement.when), 'gating',
            'writing code with AI is unavailable while the switch is off');
        t.ok(/^\(.*\)\s*&&/.test(implement.when), 'gating',
            'with the language test grouped — `a || b && c` binds as `a || (b && c)` and would leak the gate');

        const ext = read('src/extension.ts');
        t.ok(/setContext', 'avaloniaDesigner\.aiEnabled'/.test(ext), 'gating', 'activation publishes that context key');
        t.ok(/onDidChangeConfiguration/.test(ext) && /affectsConfiguration\('avaloniaDesigner\.assistant\.backend'\)/.test(ext),
            'gating', 'and keeps it true when the switch itself is flipped');

        const panel = read('src/aiPanel.ts');
        t.ok(/kind === 'bundled' \|\| kind === 'file'/.test(panel), 'gating',
            'the switch-off logic knows which backends a file-backed model needs');
        t.ok(/await cfg\.update\('backend', 'off'/.test(panel), 'gating', 'switching off turns the feature off');
        t.ok(/const unloaded = await unloadAll\(\)/.test(panel), 'gating',
            'and unloads the model — leaving 17 GB resident after "no AI" would be a strange machine');
        t.ok(/'--symbolic-link', '--yes'/.test(read('src/localModelCore.ts')), 'gating',
            'an import symlinks: without a flag lms import MOVES the developer\'s file out of its folder');

        const core = read('src/localModelCore.ts');
        t.ok(/freeing whatever is loaded/.test(core), 'wiring', 'a load frees memory first (the user asked for this)');
        t.ok(/startBundled|ensureBundledEndpoint/.test(panel), 'wiring',
            'a file can also be served by the extension\'s own runtime when LM Studio is absent');

        // The panel's own three surfaces must agree, or the section renders empty.
        const html = read('src/designerPanel.ts');
        for (const id of ['aiEnabled', 'aiModel', 'aiLoad', 'aiUnload', 'aiScan', 'aiStatusText', 'aiOptions']) {
            t.ok(new RegExp(`id="${id}"`).test(html), 'panel', `the panel markup has #${id}`);
        }
        const js = read('media/designer.js');
        t.ok(/function fillAi\(/.test(js), 'panel', 'the webview fills the section from the extension state');
        t.ok(/els\.aiOptions\.hidden = !chosen/.test(js), 'panel',
            'the change-them options appear only once a model is chosen (the flow the user asked for)');
        t.ok(/post\(\{ type: 'aiLoad'/.test(js) && /post\(\{ type: 'aiUnload'/.test(js), 'panel',
            'Load and Unload are the extension\'s operations, not the panel\'s own logic');
        t.ok(/post\(\{ type: 'aiStatus'/.test(js), 'panel', 'so is the status check');
        t.ok(/ai: aiPayload\(\)/.test(js), 'panel', 'and Save carries the AI choices with the code-check ones');
        const css = read('media/designer.css');
        t.ok(/\.ai-opt \{/.test(css) && /\.ai-badge/.test(css) && /\.ai-progress/.test(css), 'panel',
            'with styles for the options, the on/off badge and the progress line');

        // One status implementation for both surfaces: the command and the panel must not disagree.
        const ui = read('src/assistantUi.ts');
        t.ok(/export async function statusLines\(/.test(ui), 'panel',
            'the status report is shared, so the panel and the command show the same text');
        t.ok(/statusLines/.test(read('src/designerPanel.ts')), 'panel', 'and the panel asks for exactly that');
    }
};
