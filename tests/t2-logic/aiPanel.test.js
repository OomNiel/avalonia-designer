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
const { MODEL_SPECS } = require('../../out/modelSpecs.js');
const {
    buildLoadArgs,
    canImportFile,
    isModelLoaded,
    resolveLoadOptions,
    scanRoots
} = require('../../out/localModels.js');

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
        t.equal(choices[0].kind, 'any', 'list',
            'first of all: "let the server decide" — the state the settings most often hold, which the panel '
            + 'used to misrepresent by showing the first model as if it had been chosen');
        t.equal(lms.map((c) => c.value).includes('lms:text-embedding-nomic-embed-text-v1.5'), false, 'list',
            'the embedding model is not — it cannot answer a chat request');
        t.ok(/● loaded/.test(lms[1].label), 'list', 'the loaded model is marked, so the list shows what is in memory');
        t.ok(/in My Models, ready to load/.test(lms[0].detail), 'list',
            'an LM Studio entry says it is a My Models entry: LM Studio is the runtime, so it can only load a key it has');
        // A file found on disk is *not* in LM Studio's library, and the step that fixes that was invisible in
        // the panel — which is why a model outside My Models looked simply unusable (asked 2026-09-15).
        const foundEntry = choices.find((c) => c.kind === 'file');
        t.ok(/added to LM Studio first \(a symbolic link/.test(foundEntry.detail), 'list',
            'a scanned file says it will be added to LM Studio first, by a link');
        t.ok(/your file stays where it is/.test(foundEntry.detail), 'list',
            'and that the original file is not moved (lms import without a flag MOVES it)');

        t.equal(choices.filter((c) => c.kind === 'bundled').length, MODEL_SPECS.length, 'list',
            'every built-in (downloadable) model is offered');
        const bundled = choices.find((c) => c.kind === 'bundled');
        // "download once" in the label was read as "this downloads now" (asked 2026-09-15), so the label is
        // the size and the detail says when the download happens.
        t.ok(/2\.1 GB|GB/.test(bundled.label), 'list', 'a downloadable model is labelled with its size');
        t.ok(/downloads once when you press Load Model/.test(bundled.detail), 'list',
            'and its detail states exactly when the download happens, instead of a bare "download once"');
        // …but "downloads once when you press Load Model" was true of *every* built-in entry, so it told the
        // user nothing about the one thing they need to know: whether these weights are already here. A
        // 4.4 GB entry that had never been fetched looked exactly like the ready one (asked 2026-09-15:
        // "the Qwen models does not work - Not downloaded???"), and with no on-disk information the wording
        // must stay neutral rather than claim either way.
        const disk = (over) => buildChoices(discovery(), [], 'http://127.0.0.1:1234/v1', 'bundled',
            '/m/qwen2.5-coder-3b-instruct-q4_k_m.gguf', over);
        const detailOf = (all, value) => (all.find((c) => c.value === value) || {}).detail || '';
        t.ok(/weights on disk, ready to load/.test(detailOf(disk({
            'qwen2.5-coder-3b-q4': { onDisk: true, bytes: 2104932800 },
            'qwen2.5-coder-7b-q4': { onDisk: false, bytes: 0 }
        }), 'bundled:qwen2.5-coder-3b-q4')), 'list', 'a built-in model already downloaded says so');
        t.ok(/not downloaded yet — 4\.4 GB to fetch/.test(detailOf(disk({
            'qwen2.5-coder-7b-q4': { onDisk: false, bytes: 0 }
        }), 'bundled:qwen2.5-coder-7b-q4')), 'list',
            'one that was never fetched says that, with the size of the download');
        t.ok(/partial download is on disk/.test(detailOf(disk({
            'qwen2.5-coder-7b-q4': { onDisk: false, bytes: 1200000000 }
        }), 'bundled:qwen2.5-coder-7b-q4')), 'list',
            'an interrupted download is reported as a partial (which Load Model resumes), not as missing');

        const found = choices.find((c) => c.kind === 'file');
        t.ok(found && /~\/Downloads/.test(found.detail), 'list',
            'a file found on disk is offered with the folder it came from');
        // Without LM Studio the same entry is served by the extension's own runtime instead — the detail says
        // which of the two will happen, because that is the difference between a model that works and one that
        // looks broken.
        const noLms = buildChoices({ ...discovery(), cli: undefined, api: false }, files, 'http://127.0.0.1:1234/v1')
            .find((c) => c.kind === 'file');
        t.ok(/served by the extension's own runtime \(no LM Studio needed\)/.test(noLms.detail), 'list',
            'with LM Studio absent the file is served by the built-in runtime, and the detail says so');
        t.ok(/Llama-3-8B/.test(found.label) && /4\.9 GB/.test(found.label), 'list', 'and its size');

        // The order is the three paths a model can come from, in the order the extension can guarantee them
        // (asked 2026-09-16: a llama.cpp server answered faster and better than the LM Studio models, and the
        // dropdown opened on LM Studio's library as if it were the default). "A server I run myself" therefore
        // comes *before* LM Studio's entries now — it is the path that needs no other program to be guessed at.
        const kindsInOrder = choices.map((c) => c.kind);
        t.ok(kindsInOrder.lastIndexOf('custom') < kindsInOrder.indexOf('lmstudio') || kindsInOrder.indexOf('lmstudio') < 0,
            'list', '"a server I run myself" is offered before LM Studio\'s library');
        t.ok(kindsInOrder.indexOf('bundled') < kindsInOrder.indexOf('lmstudio') || kindsInOrder.indexOf('lmstudio') < 0,
            'list', 'and so is the extension\'s own runtime');
        t.ok(kindsInOrder.indexOf('file') > kindsInOrder.indexOf('lmstudio') || kindsInOrder.indexOf('lmstudio') < 0,
            'list', 'loose .gguf files on disk stay last — they are the afterthought');
        // The user's own `llama-server` (asked 2026-09-16). It is an engine this window starts and stops, like
        // the bundled runtime, so it is grouped with it and ahead of a bare address — that entry is the only one
        // that assumes the user has already started something.
        const llama = choices.find((c) => c.kind === 'llama');
        t.ok(llama, 'list', 'the user\'s own llama-server is offered as an entry of its own');
        t.ok(/My own llama-server/.test(llama.label), 'list', 'labelled as theirs, not as the extension\'s runtime');
        t.ok(/install llama\.cpp|llamaServerPath/.test(llama.detail), 'list',
            'with no binary on the machine the detail says what to do about it');
        t.ok(kindsInOrder.indexOf('llama') > kindsInOrder.indexOf('bundled'), 'list',
            'the two engines this window can start are offered together, the extension\'s own first');
        t.ok(kindsInOrder.indexOf('llama') < kindsInOrder.indexOf('custom'), 'list',
            'and both before "a server I run myself", which assumes something is already running');
        // With a binary found and a model file chosen, the entry says exactly what pressing Load will run — the
        // difference between an entry that looks broken and one the user can act on.
        const withBin = buildChoices(discovery(), [], 'http://127.0.0.1:1234/v1', 'external',
            '/home/niel/models/Llama-3-8B-Q4_K_M.gguf', {}, MODEL_SPECS, '/usr/local/bin/llama-server');
        const ready = withBin.find((c) => c.kind === 'llama');
        t.ok(/Llama-3-8B-Q4_K_M\.gguf/.test(ready.detail) && /llama-server/.test(ready.detail), 'list',
            'a found binary plus a chosen file name both the file and the binary in the detail');
        t.equal(choices.length, 3 + MODEL_SPECS.length + 1 + 1 + 2, 'list',
            '"decide" + LM Studio + downloads + found + address + the user\'s own llama-server');
    }

    // ---------- 3) which entry the settings point at ----------
    {
        const choices = buildChoices(discovery(), [], 'http://127.0.0.1:1234/v1');
        t.equal(currentSelection(choices, 'qwen/qwen3.5-9b', 'external', ''), 'lms:qwen/qwen3.5-9b', 'selection',
            'a pinned LM Studio model selects its own entry');
        t.equal(currentSelection(choices, 'gone/model', 'external', ''), 'any:', 'selection',
            'a model that is no longer on disk falls back to "let the server decide" — it does *not* silently '
            + 'select the first model in the list, which is how Save used to pin one nobody chose');
        t.equal(currentSelection(choices, '', 'external', ''), 'any:', 'selection',
            'and so does an empty model setting, which is the same thing');
        t.equal(currentSelection(choices, '', 'bundled', '/home/niel/.config/Code/User/globalStorage/x/models/qwen2.5-coder-3b-instruct-q4_k_m.gguf'),
            'bundled:qwen2.5-coder-3b-q4', 'selection',
            'the bundled backend selects the spec it was set up for, from the file path alone');
        t.equal(currentSelection(choices, '', 'off', ''), 'any:', 'selection',
            'an off switch still shows a sensible starting point for when it is switched on');
        // A running `llama-server` of ours is the one pin the picker cannot recognise from the settings: the
        // model id is whatever alias the process reports and the address is a port that changes every start, so
        // the *process* is the authority (2026-09-16).
        t.equal(currentSelection(choices, 'whatever-it-reports', 'external', '', true), 'llama:', 'selection',
            'a running llama-server of ours selects its own entry');
        t.equal(currentSelection(choices, 'whatever-it-reports', 'external', '', false), 'any:', 'selection',
            'and with nothing of ours running the selection is exactly what it was');
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

    // ---------- 6) the manifest, the panel and the webview must agree ----------
    // The three halves are edited separately, so a disagreement here renders an empty section or a switch
    // that does nothing. Every assertion below is a wire, not a feature.
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
        // Both front doors can change the model: the ⚙ panel, and the palette commands. The panel only heard
        // about the first, so a model loaded from the palette left an open panel showing `Let the server
        // decide…` and a status naming a model that was no longer in use (reported 2026-09-15).
        const setup = read('src/localModelSetup.ts');
        t.equal((setup.match(/refreshPanels\(\)/g) || []).length, 4, 'panel',
            'all four command paths tell an open panel (built-in, custom address, LM Studio load, unload) — '
            + 'the first two return early, which is how they were missed');
        const uiRef = read('src/assistantUi.ts');
        t.ok(/export async function refreshPanels[\s\S]*?refreshAiState\(\)[\s\S]*?type: 'aiStatus'[\s\S]*?quiet: true/.test(uiRef),
            'panel', 'the refresh sends the state *and* the status, and the status is quiet');
        t.ok(/if \(!msg\.quiet\) els\.aiStatusText\.hidden = false/.test(read('media/designer.js')), 'panel',
            'a refresh updates the status box without popping it open — opening it is the user\'s action');
        const html = read('src/designerPanel.ts');
        for (const id of ['aiEnabled', 'aiShowDiff', 'aiModel', 'aiLoad', 'aiUnload', 'aiRemove', 'aiScan', 'aiStatusText', 'aiOptions']) {
            t.ok(new RegExp(`id="${id}"`).test(html), 'panel', `the panel markup has #${id}`);
        }
        const js = read('media/designer.js');
        t.ok(/function fillAi\(/.test(js), 'panel', 'the webview fills the section from the extension state');
        t.ok(/showDiff: els\.aiShowDiff\.checked/.test(js), 'panel',
            'the "show the proposed code as a diff" switch travels with the AI settings on Save');
        t.ok(/els\.aiShowDiff\.checked = state\.showDiff !== false/.test(js), 'panel',
            'and a state that forgot the field still means "show the diff" — the safe default');
        const panelSrc = read('src/aiPanel.ts');
        t.ok(/showDiff: cfg\.get<boolean>\('showDiff', true\)/.test(panelSrc), 'panel',
            'the panel state reports the setting, so the ⚙ switch shows what is really in force');
        t.ok(/await cfg\.update\('showDiff', input\.showDiff !== false, target\)/.test(panelSrc), 'panel',
            'and saving it writes it — before the AI switch is looked at, so it sticks while AI is off');
        t.ok(/els\.aiOptions\.hidden = !chosen/.test(js), 'panel',
            'the change-them options appear only once a model is chosen (the flow the user asked for)');
        t.ok(/post\(\{ type: 'aiLoad'/.test(js) && /post\(\{ type: 'aiUnload'/.test(js), 'panel',
            'Load and Unload are the extension\'s operations, not the panel\'s own logic');
        t.ok(/post\(\{ type: 'aiRemove'/.test(js), 'panel', 'so is removing a model from disk');
        t.ok(/post\(\{ type: 'aiStatus'/.test(js), 'panel', 'so is the status check');
        t.ok(/ai: aiPayload\(\)/.test(js), 'panel', 'and Save carries the AI choices with the code-check ones');
        const css = read('media/designer.css');
        t.ok(/\.ai-opt \{/.test(css) && /\.ai-badge/.test(css) && /\.ai-progress/.test(css), 'panel',
            'with styles for the options, the on/off badge and the progress line');

        // ---------- the panel has to FIT on screen ----------
        // jsdom (T3) has no layout engine, so this cannot be measured here. It was measured in Chromium
        // against the real CSS + the real markup on 2026-09-15, at 1000x600, 1024x700 and 1440x900:
        //   before — box 340x1553, no scrolling, title 426px ABOVE the viewport at 1024x700, Cancel/Save
        //            1127px below it (the user's report: "hides the top and bottom items")
        //   after  — box 560 wide, capped to the viewport, scrolls inside, title visible, Save pinned
        // These three declarations are what makes that true, so they are asserted as a regression guard.
        const boxRule = /\.modal-box \{[^}]*\}/.exec(css);
        t.ok(boxRule && /max-height:\s*calc\(100vh/.test(boxRule[0]), 'layout',
            'a modal box is capped to the viewport height — an uncapped one loses its top and its bottom');
        t.ok(boxRule && /overflow-y:\s*auto/.test(boxRule[0]), 'layout',
            'and scrolls inside itself, which is the only way the first and last items stay reachable');
        const settingsWidth = /#settingsModal \.modal-box \{[^}]*width:\s*min\(([^)]*)\)/.exec(css);
        t.ok(settingsWidth && /9[0-9]vw/.test(settingsWidth[1]) && /5\d\dpx/.test(settingsWidth[1]), 'layout',
            'this panel gets its own width (the values + hints need it) without widening the other 8 small dialogs');
        t.ok(/#settingsModal \.modal-box\s*>\s*\.modal-buttons \{[^}]*position:\s*sticky/.test(css), 'layout',
            'and its Save row is pinned, so the last thing the user must press is never off-screen');

        // A <select> spends ~18px on its arrow, so a long label silently truncates. Measured: with a 120px
        // column, "recommended for this machine (off)" lost 100px of text and read as a broken control.
        const grid = /\.ai-opt \{[^}]*grid-template-columns:\s*\d+px\s+(\d+)px/.exec(css);
        t.ok(grid && Number(grid[1]) >= 160, 'layout',
            `the option values get a column wide enough for a recommendation (found ${grid ? grid[1] : '?'}px, need >=160)`);
        const dePanel = read('src/designerPanel.ts');
        for (const label of ['recommended for this machine', 'push everything to the GPU', 'never — keep it loaded']) {
            t.equal(dePanel.includes(label), false, 'layout',
                `no clipped-era label text survives ("${label}" was too wide for the field)`);
        }

        // One status implementation for both surfaces: the command and the panel must not disagree.
        const ui = read('src/assistantUi.ts');
        t.ok(/export async function statusLines\(/.test(ui), 'panel',
            'the status report is shared, so the panel and the command show the same text');
        t.ok(/statusLines/.test(read('src/designerPanel.ts')), 'panel', 'and the panel asks for exactly that');
    }

    // ---------- 7) a load may never fail silently ----------
    // "Downloading is not starting … nothing further happens" (2026-09-15) was not a missing feature: work
    // was happening, or an error was thrown, and either way the panel's line never changed. These assertions
    // hold the three things that make that impossible: the extension always answers, the webview shows a
    // failure where the user is looking, and long steps show that they are still alive.
    {
        const dePanel = read('src/designerPanel.ts');
        const loadCase = /case 'aiLoad': \{[\s\S]*?\n                \}/.exec(dePanel)[0];
        t.ok(/try \{/.test(loadCase) && /catch \(err\)/.test(loadCase), 'silent',
            'the aiLoad handler catches its own failures');
        t.ok(/type: 'aiResult'/.test(loadCase.split('catch')[1] || ''), 'silent',
            'and reports them to the panel as a result — never only to the log');
        t.ok(/logError\(/.test(loadCase), 'silent', 'while also logging them');
        t.ok(/stopProgress\(\)/.test(loadCase), 'silent', 'the elapsed-time ticker is stopped when it ends');
        t.ok(/case 'aiUnload'[\s\S]*?try \{/.test(dePanel), 'silent', 'unload is wrapped the same way');
        // Unloading changes what is in memory, so the panel has to be told the new state and not only the
        // result: until 0.9.24 the picker kept its ● loaded tag on a model the user had just unloaded and
        // the status still named it (reported 2026-09-15).
        const unloadCase = /case 'aiUnload': \{[\s\S]*?\n                \}/.exec(dePanel)[0];
        t.equal((unloadCase.match(/type: 'aiState'/g) || []).length, 2, 'silent',
            'the unload handler refreshes the panel state on both the normal and the failing path');
        t.ok(/action === 'load' \|\| msg.action === 'unload'/.test(read('media/designer.js')), 'silent',
            'and the webview asks for a state itself after either action is confirmed');
        const removeCase = /case 'aiRemove': \{[\s\S]*?\n                \}/.exec(dePanel)[0];
        t.ok(/try \{/.test(removeCase) && /catch \(err\)/.test(removeCase), 'silent',
            'the Remove Model handler catches its own failures');
        t.ok(/type: 'aiResult'[\s\S]*?action: 'remove'/.test(removeCase), 'silent',
            'and reports removal as an outcome the panel recognises');
        t.ok(/stopProgress\(\)/.test(removeCase), 'silent',
            'and stops the elapsed-time ticker when it ends');
        // The state also travels *with* the result. A queue is not a contract: the separate `aiState` message can
        // be missed or dropped (`postMessage` even resolves `false` when it could not deliver), and then the panel
        // keeps showing the model it was told about before — the picker reverting to "Let the server decide…"
        // while the built-in runtime answered (reported 2026-09-15).
        const resultPost = /type: 'aiResult',[\s\S]*?\}\)/.exec(loadCase);
        t.ok(/const state = await panelState\(\)/.test(loadCase) && resultPost && /state/.test(resultPost[0]),
            'silent', 'the load result carries the fresh state as well as posting it separately');
        t.ok(/msg\.state\) fillAi\(msg\.state\)/.test(read('media/designer.js')), 'silent',
            'and the webview applies the state that came with the outcome');
        t.ok(/Panel save: value=\$\{ai\.value/.test(dePanel), 'silent',
            'a Save logs what it wrote — it is the only writer that can turn a bundled pin back into "the server decides"');
        // "What is in memory right now" is a claim the developer acts on, so it is only made when something
        // could answer it, and the load state is compared exactly (`not-loaded` contains `loaded`).
        const core = read('src/localModelCore.ts');
        t.ok(/export async function loadedNow[\s\S]*?isModelLoaded\(m\.state\)/.test(core), 'silent',
            'the live load state is read with the exact comparison');
        t.ok(/return parsed \? \{ known: true, ids: parsed \} : \{ known: false, ids: \[\] \}/.test(core), 'silent',
            'and an unparsable answer is reported as unknown rather than as "nothing loaded"');
        t.ok(/The status check failed/.test(dePanel), 'silent', 'and a failing status check still produces text');

        const panel = read('src/aiPanel.ts');
        t.ok(/export async function loadChoice[\s\S]*?try \{[\s\S]*?return await startLoad/.test(panel), 'silent',
            'loadChoice delegates and catches, so no step can escape as a throw');
        t.ok(/aiLog\(context, `Load FAILED/.test(panel), 'silent', 'a failure is written to the AI log file');
        t.ok(/progressTimer = setInterval/.test(panel) && /progressStarted/.test(panel)
            && /\(\$\{seconds\} s\)/.test(panel), 'silent',
            'and progress repeats with the seconds spent, so a slow step is not mistaken for a dead one');
        t.ok(/is already on disk — starting the built-in runtime/.test(panel), 'silent',
            'the extension says which of the two things is happening: the panel used to claim a download was '
            + 'starting even when the weights were already there, which is what the user went looking for');
        t.ok(/function aiLog\(/.test(panel) && /ai\.log/.test(panel), 'silent',
            'field failures are written to globalStorage/logs/ai.log, because the Output channel cannot be sent');

        const js = read('media/designer.js');
        t.ok(/clearTimeout\(aiWatchdog\)/.test(js) && /the extension has not reported back yet/.test(js), 'silent',
            'the webview says so when the extension has reported nothing at all after 10 s');
        t.ok(/setAiProgress\(msg\.ok \? '' : \(text \? '✗ ' \+ text/.test(js), 'silent',
            'and a failure lands in the progress line instead of only the status bar');
    }

    // ---------- 7b) a model must not outlive the session, and the panel must not go stale ----------
    // Asked for 2026-09-15: "when closing the IDE after a coding session, the model in use must be unloaded to
    // free memory, and the model selection state must be updated to show that no models are loaded when the
    // IDE is restarted". The second half is a *staleness* problem: an LM Studio model enters memory
    // just-in-time when a request arrives, which nothing in the panel can see on its own.
    {
        const ext = read('src/extension.ts');
        const deactivate = /export async function deactivate[\s\S]*?\n\}/.exec(ext)[0];
        t.ok(/unloadOnExit/.test(deactivate), 'lifecycle',
            'shutting down unloads the model instead of leaving several GB resident');
        t.ok(/stopModelServer/.test(deactivate), 'lifecycle',
            'and stops the extension\'s own runtime too (a reload can skip the disposables)');
        t.ok(/^export async function deactivate/m.test(ext), 'lifecycle',
            'deactivate is async, so the unload is not cut short by the host being killed');

        const core = read('src/localModelCore.ts');
        t.ok(/export async function unloadOnExit[\s\S]*?detached: true/.test(core), 'lifecycle',
            'the unload is spawned detached: freeing GBs outlives the short deactivate budget');
        t.ok(/live\.ids\.length === 0\) return 'nothing was loaded\.'/.test(core), 'lifecycle',
            'nothing is spawned when nothing was loaded');
        t.ok(/if \(!live\.known\) return 'could not tell what was in memory\.'/.test(core), 'lifecycle',
            'and an unknown state is not silently treated as "nothing to do"');

        // The panel's own view can be overtaken by the server loading a model on demand.
        const js7b = read('media/designer.js');
        t.ok(/export async function refreshAiState/.test(read('src/aiPanel.ts')), 'lifecycle',
            'the panel can be re-sent its state');
        t.ok(/\} finally \{[\s\S]{0,400}?refreshAiState\(\)/.test(read('src/assistantUi.ts')), 'lifecycle',
            'a request refreshes it — the request is itself what loads the model just-in-time');
        // Every AI-settings read and write goes through the scope-aware view: writing Global while the project
        // pins the same key means the write is invisible, which is what made the built-in models impossible to
        // pin on this machine (found 2026-09-15, after six exchanges).
        for (const file of ['src/aiPanel.ts', 'src/localModelSetup.ts', 'src/modelRuntime.ts']) {
            const src = read(file);
            t.equal(/vscode\.workspace\.getConfiguration\(SETTINGS\)/.test(src), false, 'lifecycle',
                `${file} reads and writes the AI settings through configView()`);
        }
        // assistantUi writes one setting, and it goes through the same helper (the helper takes the raw config
        // on purpose: it is the thing that knows which scope to write to).
        t.ok(/updateSetting\(vscode\.workspace\.getConfiguration\(SETTINGS\), 'model', chosen\)/.test(read('src/assistantUi.ts')),
            'lifecycle', 'the "pin a model" command writes through updateSetting too');
        t.ok(/configView\(SETTINGS\)/.test(read('src/aiPanel.ts')) && /configView\(SETTINGS\)/.test(read('src/modelRuntime.ts')),
            'lifecycle', 'so a project-level pin is updated in place instead of being overridden');
        t.ok(/log\(`Setting "\$\{key\}" written to the \$\{where\} settings/.test(read('src/settingWrite.ts')),
            'lifecycle', 'and a non-global write is logged, because a shadowed write looks like a load that did nothing');
        t.ok(/catch \{\s*\/\* the panel may be mid-dispose/.test(read('src/aiPanel.ts')), 'lifecycle',
            'and a failed refresh can never become a failed action');
        t.ok(/window\.addEventListener\('focus'[\s\S]{0,200}?aiState/.test(js7b), 'lifecycle',
            'an open panel re-asks when the user comes back to it');
        // Every open panel, not just the last one that spoke: a designer tab that is not active hears nothing,
        // so its AI section keeps whatever it was told when it was opened — which is how a picker shows "Let the
        // server decide" while another tab has a model loaded (reported 2026-09-15).
        t.ok(/const openPanels = new Set<vscode\.WebviewPanel>\(\)/.test(read('src/aiPanel.ts')), 'lifecycle',
            'the extension keeps every open panel');
        t.ok(/for \(const panel of openPanels\) void panel\.webview\.postMessage\(\{ type: 'aiState', state \}\)/.test(read('src/aiPanel.ts')),
            'lifecycle', 'and broadcasts the state to all of them');
        t.ok(/webviewPanel\.visible[\s\S]{0,120}?refreshAiState\(\)/.test(read('src/designerPanel.ts')), 'lifecycle',
            'a tab becoming visible re-asks, so switching tabs cannot show a stale panel');
        t.ok(/case 'aiApplied'/.test(read('src/designerPanel.ts')), 'lifecycle',
            'and the webview reports what it applied, so a disagreement is one log line');
    }

    // ---------- 8) "loaded" means loaded, and "never" means no flag ----------
    // Both reported by the user on 2026-09-15, from real clicks:
    //   * every LM Studio model showed "● loaded" while the server had nothing in memory — `/loaded/i`
    //     matches "not-loaded" (`'not-loaded'.indexOf('loaded') === 4`), so the tag meant nothing and
    //     loading a model "without the tag" looked like it had done nothing;
    //   * choosing "never — keep loaded" sent `--ttl 0`, which lms rejects:
    //     "argument '0' is invalid. Number out of range, must be at least 1".
    {
        t.equal(isModelLoaded('loaded'), true, 'state', 'the API saying "loaded" means loaded');
        t.equal(isModelLoaded('not-loaded'), false, 'state',
            'and "not-loaded" does NOT — the substring bug that tagged every model');
        t.equal(isModelLoaded('Not-Loaded'), false, 'state', 'in any capitalisation');
        t.equal(isModelLoaded('unloaded'), false, 'state', 'as does "unloaded"');
        t.equal(isModelLoaded('loading'), false, 'state', 'a model still coming up is not loaded yet');
        t.equal(isModelLoaded(''), false, 'state', 'an empty state is not loaded');
        t.equal(isModelLoaded(undefined), false, 'state', 'nor a missing one');
        // The marker itself has to follow: with nothing in memory, no entry may claim to be loaded.
        const idle = discovery();
        idle.loaded = [];
        t.equal(buildChoices(idle, [], 'http://127.0.0.1:1234/v1').filter((c) => /●/.test(c.label)).length, 0,
            'state', 'and a dropdown built from an idle server shows no loaded tag at all');
        t.ok(buildChoices(discovery(), [], 'http://127.0.0.1:1234/v1')
            .some((c) => c.kind === 'lmstudio' && c.live === true && /● loaded/.test(c.label)), 'state',
            'while the model that *is* in memory is marked, so the tag still means something');

        const model = { provider: 'lmstudio', key: 'google/gemma-4-e4b', label: 'gemma', params: '7.5B', arch: 'gemma4', sizeGb: 6.33, kind: 'chat' };
        const options = (ttl) => ({ contextLength: 8192, gpu: 'off', ttlSeconds: ttl, identifier: 'google/gemma-4-e4b', reasons: [] });
        t.ok(buildLoadArgs(model, options(900)).includes('--ttl'), 'ttl', 'a timer is passed when there is one');
        const never = buildLoadArgs(model, options(0));
        t.equal(never.includes('--ttl'), false, 'ttl',
            '"never unload" omits the flag — `--ttl 0` is rejected by lms ("must be at least 1")');
        t.equal(never.join(' '), 'load google/gemma-4-e4b --gpu off --context-length 8192 --yes --identifier google/gemma-4-e4b',
            'ttl', 'and the rest of the command line is untouched');

        const facts = { totalRamGb: 28, freeRamGb: 18, cpuCount: 12, lockLimitGb: 3.78 };
        const resolved = (ttl) => resolveLoadOptions(model, { contextLength: 0, gpu: 'auto', ttlSeconds: ttl }, facts);
        t.equal(resolved(0).ttlSeconds, 0, 'ttl',
            'the resolver keeps 0 as the user\'s choice ("no timer") rather than treating it as missing');
        t.equal(resolved(-1).ttlSeconds, 900, 'ttl', 'while -1 ("recommended") becomes a real timer');
        t.equal(resolved(NaN).ttlSeconds, 900, 'ttl', 'and junk falls back to the recommendation');
        for (const ttl of [0, -1, NaN, 3600, 1]) {
            const args = buildLoadArgs(model, resolved(ttl));
            const at = args.indexOf('--ttl');
            t.ok(at < 0 || Number(args[at + 1]) >= 1, 'ttl',
                `a request built from the panel can never send an out-of-range --ttl (ttl=${String(ttl)} → `
                + `${at < 0 ? 'omitted' : args[at + 1]})`);
        }
    }
};
