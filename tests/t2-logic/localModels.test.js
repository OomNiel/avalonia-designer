/* T2 — choosing a local model: the parsers and the decisions behind the one-command setup.
 *
 * Every fixture here is REAL output, captured from this machine on 2026-09-15 (`lms ls`, `lms ps`,
 * `lms server status`, `lms load --estimate-only`, and `/proc/self/limits`). That is the point of the
 * design: the wizard's decisions are functions of text, so the suite can pin them without LM Studio
 * installed, and a CLI that changes its output format fails here instead of in front of a novice.
 *
 * Kept in its own file — `assistant.test.js` is open in the editor, and `files.autoSave = onFocusChange`
 * would save a stale buffer over anything written into it (NOTES.md §99).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {
    buildLoadArgs,
    explainLoadFailure,
    lmsCandidates,
    modelLabel,
    parseLmsList,
    parseLmsPs,
    parseLmsServerStatus,
    parseLoadEstimate,
    parseLockLimitGb,
    parseSizeGb,
    recommendedLoadOptions
} = require('../../out/localModels.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---------- real fixtures (2026-09-15) ----------
const LMS_LS = `You have 4 models, taking up 30.70 GB of disk space.

LLM                               PARAMS    ARCH      SIZE        DEVICE
google/gemma-4-e4b (1 variant)    7.5B      gemma4    6.33 GB     Local
qwen/qwen3.5-9b (1 variant)       9B        qwen35    6.55 GB     Local
qwen3.8-27b                       27B       qwen35    17.74 GB    Local

EMBEDDING                               PARAMS    ARCH          SIZE        DEVICE
text-embedding-nomic-embed-text-v1.5              Nomic BERT    84.11 MB    Local
`;
const LMS_PS_EMPTY = `No models are currently loaded.

To load a model, run:

    lms load <model path>
`;
const LMS_SERVER_RUNNING = 'The server is running on port 1234.';
const LMS_ESTIMATE = `Model: qwen3.8-27b
Context Length: 8,192
GPU Offload: 0%
Estimated GPU Memory:   16.52 GiB
Estimated Total Memory: 16.52 GiB
Confidence: LOW

Estimate: This model may be loaded based on your resource guardrails settings.
`;
const PROC_LIMITS = `Limit                     Soft Limit           Hard Limit           Units
Max locked memory         3783143424           3783143424           bytes
`;
const MLOCK_ABORT = `llm-engine/llama.cpp/src/llama-mmap.cpp:791: GGML_ASSERT(addr) failed
libllama.so(llama_mlock::grow_to(unsigned long)+0x134)
libllama.so(llama_model_base::load_tensors(...)+0x33b1)`;

const ROOMY = { totalRamGb: 28, freeRamGb: 18, cpuCount: 12, lockLimitGb: 3.78 };

module.exports = async (t) => {
    t.section('local models (one-command setup)');

    // ---------- 1) reading `lms ls` ----------
    {
        const list = parseLmsList(LMS_LS);
        t.equal(list.chat.length, 3, 'lms-ls', 'the three chat models are read');
        t.equal(list.embeddings.length, 1, 'lms-ls', 'and the embedding model is kept apart');
        t.ok(Math.abs(list.diskGb - 30.7) < 0.01, 'lms-ls', 'the reported disk total is parsed');
        t.equal(list.chat[0].key, 'google/gemma-4-e4b', 'lms-ls', '"(1 variant)" is not part of the model key');
        t.equal(list.chat[0].params, '7.5B', 'lms-ls', 'params are read from their own column');
        t.equal(list.chat[0].arch, 'gemma4', 'lms-ls', 'so is the architecture');
        t.ok(Math.abs(list.chat[0].sizeGb - 6.33) < 0.01, 'lms-ls', 'and the size in GB');
        t.equal(list.chat[2].key, 'qwen3.8-27b', 'lms-ls', 'a key without a publisher is fine');
        t.ok(Math.abs(list.chat[2].sizeGb - 17.74) < 0.01, 'lms-ls', 'the 27B reports 17.74 GB');
        // The embedding row has an EMPTY params column and a two-word arch — the reason arch is derived
        // positionally rather than read from a fixed index.
        t.equal(list.embeddings[0].params, '', 'lms-ls', 'an embedding model has no parameter count');
        t.equal(list.embeddings[0].arch, 'Nomic BERT', 'lms-ls', 'and a two-word architecture');
        t.ok(Math.abs(list.embeddings[0].sizeGb - 0.0841) < 0.001, 'lms-ls', 'sizes in MB are converted');

        t.equal(parseLmsList('').chat.length, 0, 'lms-ls', 'empty output yields nothing and does not throw');
        t.equal(parseLmsList('command not found\n').chat.length, 0, 'lms-ls', 'so does an error message');
        t.equal(parseLmsList(LMS_LS).embeddings[0].kind, 'embeddings', 'lms-ls', 'the section marks the kind');
        t.ok(Math.abs(parseSizeGb('2.10 GB') - 2.1) < 1e-9, 'lms-ls', 'parseSizeGb handles GB');
        t.equal(parseSizeGb('nonsense'), undefined, 'lms-ls', 'and refuses nonsense');
    }

    // ---------- 2) `lms ps`, `lms server status`, `--estimate-only` ----------
    {
        t.equal(parseLmsPs(LMS_PS_EMPTY).length, 0, 'lms-ps', 'the empty answer is understood, as an empty list');
        t.equal(parseLmsPs('IDENTIFIER  SIZE\nqwen3.8-27b  17.7 GB'), undefined, 'lms-ps',
            'an unobserved table format is reported as "unknown" rather than guessed (the REST API has the '
            + 'verified `state` field)');

        const running = parseLmsServerStatus(LMS_SERVER_RUNNING);
        t.equal(running.running, true, 'lms-server', 'a running server is recognised');
        t.equal(running.port, 1234, 'lms-server', 'and its port is read from the CLI, never assumed');
        t.equal(parseLmsServerStatus('The server is not running.').running, false, 'lms-server', 'a stopped one too');
        t.equal(parseLmsServerStatus('').running, false, 'lms-server', 'junk is not "running"');

        const estimate = parseLoadEstimate(LMS_ESTIMATE);
        t.equal(estimate.model, 'qwen3.8-27b', 'estimate', 'the estimate names the model');
        t.equal(estimate.contextLength, 8192, 'estimate', 'the context length is read through its comma');
        t.equal(estimate.gpuOffloadPercent, 0, 'estimate', 'the offload percentage is read');
        t.ok(Math.abs(estimate.totalGiB - 16.52) < 0.01, 'estimate', 'and the total memory it would need');
        t.equal(estimate.confidence, 'LOW', 'estimate', 'confidence is carried through');
        t.ok(/resource guardrails/.test(estimate.verdict), 'estimate', 'so is the CLI verdict');
        t.equal(parseLoadEstimate('boom'), undefined, 'estimate', 'unparseable output yields undefined');
    }

    // ---------- 3) the locked-memory limit (the crash this prevents) ----------
    {
        const limit = parseLockLimitGb(PROC_LIMITS);
        t.ok(Math.abs(limit - 3.783) < 0.01, 'lock-limit', 'the kernel limit is read from /proc/self/limits');
        t.equal(parseLockLimitGb('Max locked memory         unlimited            unlimited            bytes') > 100, true,
            'lock-limit', 'an unlimited limit is treated as generous, not as zero');
        t.equal(parseLockLimitGb('nonsense'), undefined, 'lock-limit', 'and junk yields undefined');
    }

    // ---------- 4) the recommended values ----------
    {
        const list = parseLmsList(LMS_LS);
        const big = recommendedLoadOptions(list.chat[2], ROOMY);
        t.equal(big.contextLength, 8192, 'recommend', 'a roomy machine gets 8 K of context');
        t.equal(big.gpu, 'off', 'recommend', 'a 17.7 GB model is NOT offloaded (shared-memory GPU is slower)');
        t.equal(big.ttlSeconds, 900, 'recommend', 'it unloads itself after 15 idle minutes');
        t.equal(big.identifier, 'qwen3.8-27b', 'recommend', 'the identifier is the model key — that is the pin');
        t.ok(big.reasons.some((r) => /Keep-model-in-memory is NOT usable/.test(r) && /3\.8 GB/.test(r)), 'recommend',
            'and it says up front that memory-locking cannot work for a model this size');

        const small = recommendedLoadOptions({ key: 'x', label: 'x', params: '3B', arch: 'qwen2', sizeGb: 2.1, provider: 'lmstudio', kind: 'chat' }, { ...ROOMY, freeRamGb: 24 });
        t.equal(small.contextLength, 16384, 'recommend', 'a small model on a roomy machine gets more context');
        t.equal(small.gpu, 'max', 'recommend', 'and is offloaded — where the GPU genuinely helps');
        t.equal(small.reasons.some((r) => /NOT usable/.test(r)), false, 'recommend',
            'while a 2.1 GB model raises no lock warning');

        const tight = recommendedLoadOptions(list.chat[2], { ...ROOMY, freeRamGb: 6 });
        t.equal(tight.contextLength, 4096, 'recommend', 'little free RAM drops the context to 4 K');

        const args = buildLoadArgs(list.chat[2], big);
        t.equal(args.join(' '),
            'load qwen3.8-27b --gpu off --context-length 8192 --ttl 900 --identifier qwen3.8-27b',
            'recommend', 'and the command line is exactly what gets run');
    }

    // ---------- 5) the picker's labels ----------
    {
        const list = parseLmsList(LMS_LS);
        t.ok(/qwen3.8-27b/.test(modelLabel(list.chat[2])) && /17\.7 GB/.test(modelLabel(list.chat[2])), 'label',
            'a model label shows the size');
        t.ok(/27B/.test(modelLabel(list.chat[2])), 'label', 'and its parameter count');
        t.ok(/cannot answer chat/.test(modelLabel(list.embeddings[0])), 'label',
            'an embedding model says why it is not a candidate');
        t.equal(modelLabel(list.embeddings[0]).includes('Nomic BERT'), false, 'label',
            'and does not advertise its architecture as if it could');
    }

    // ---------- 6) explaining a failed load ----------
    {
        const mlock = explainLoadFailure(MLOCK_ABORT, ROOMY, 5.34);
        t.ok(/Keep Model in Memory/.test(mlock), 'failure', 'an mlock abort names the toggle to turn off');
        t.ok(/3\.8 GB locked/.test(mlock) && /5\.3 GB/.test(mlock), 'failure', 'with both numbers, so it is checkable');
        const oom = explainLoadFailure('ggml_backend_alloc: failed to allocate 1234 bytes', ROOMY, 17.74);
        t.ok(/Not enough free memory/.test(oom) && /18\.0 GB is free/.test(oom), 'failure', 'an OOM abort says how much is free');
        t.equal(explainLoadFailure('all good here', ROOMY), undefined, 'failure',
            'an unrelated log produces no invented explanation');
    }

    // ---------- 7) finding the CLI ----------
    {
        const linux = lmsCandidates('/home/someone', 'linux');
        t.equal(linux[0], '/home/someone/.lmstudio/bin/lms', 'cli', 'the CLI is looked for in LM Studio\'s own bin folder');
        t.equal(linux[1], 'lms', 'cli', 'and then on PATH');
        t.equal(lmsCandidates('C:/Users/x', 'win32')[0], 'C:/Users/x/.lmstudio/bin/lms.exe', 'cli', 'with the right name on Windows');
    }

    // ---------- 8) the wiring: manifest, registration, and the architectural rule ----------
    {
        const pkg = JSON.parse(read('package.json'));
        const commands = pkg.contributes.commands.map((c) => c.command);
        t.ok(commands.includes('avaloniaDesigner.assistant.setupModel'), 'wiring', 'the setup command is contributed');
        t.ok(commands.includes('avaloniaDesigner.assistant.unloadModel'), 'wiring', 'so is unload');
        t.equal(
            pkg.contributes.commands.find((c) => c.command === 'avaloniaDesigner.assistant.setupModel').title,
            'AI: Choose a Local Model…',
            'wiring',
            'and it is named for what it now does — choosing a model, not just downloading one'
        );

        const ext = read('src/extension.ts');
        t.ok(/chooseLocalModel\(context\)/.test(ext), 'wiring', 'the wizard is what the command runs');
        t.ok(/unloadLoadedModel\(\)/.test(ext), 'wiring', 'and unload is registered');
        const ui = read('src/assistantUi.ts');
        t.ok(/setupModel/.test(ui), 'wiring', 'the status dialog and the off-state dialog still point at it');

        // The pure half must stay pure: that is what makes the parsers testable and the VS Code side thin.
        const pure = read('src/localModels.ts');
        t.ok(/vscode'/.test(pure) === false && /from 'vscode'/.test(pure) === false, 'wiring',
            'src/localModels.ts does not import vscode');
        const wizard = read('src/localModelSetup.ts');
        t.ok(/--estimate-only'/.test(wizard), 'wiring',
            'the wizard asks what a load would cost BEFORE loading it');
        t.ok(/'server', 'status'/.test(wizard), 'wiring', 'it asks the CLI for the port instead of assuming 1234');
        t.ok(/newestServerLogTail/.test(wizard) && /explainLoadFailure/.test(wizard), 'wiring',
            'and it translates the server log when a load fails');
        t.ok(/proveItWorks/.test(wizard), 'wiring', 'it proves the model answers before claiming success');
    }
};
