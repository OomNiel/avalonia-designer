/* T2 — the bundled runtime (tier 2): the model registry, the sidecar's arguments and handshake, the
 * manifest wiring, and the two packaging traps that only show up when a SECOND project lives inside
 * host/ (the previewer host would otherwise compile the sidecar, and the sidecar's build output would
 * otherwise travel in the VSIX).
 *
 * Nothing here starts a server or downloads a gigabyte: the arithmetic is pure, and what cannot be
 * checked without a model (does the 3B answer well?) is deliberately not pretended at.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {
    DEFAULT_CONTEXT_SIZE,
    MODEL_FOLDER,
    MODEL_SPECS,
    READY_PREFIX,
    canRunSpec,
    defaultThreads,
    formatBytes,
    isGgufPath,
    parseHealth,
    shortHash,
    sidecarArgs,
    sidecarBaseUrl,
    sidecarHealthUrl,
    specByFileName,
    specById
} = require('../../out/modelSpecs.js');
const { parseSseDelta } = require('../../out/assistant.js');
const { normalizeAssistantConfig, assistantEnabled } = require('../../out/assistant.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

module.exports = async (t) => {
    t.section('assistant (bundled runtime, tier 2)');

    // ---------- 1) the model registry ----------
    {
        t.equal(MODEL_SPECS.length, 2, 'models',
            'two entries — the 7B on the GPU build and the 7B on the CPU build (asked 2026-09-17)');
        t.equal(MODEL_SPECS[0].id, 'qwen2.5-coder-7b-gpu', 'models',
            'the first is the GPU build: the 7B is the only model of the five measured whose C# compiled');
        t.equal(MODEL_SPECS[1].id, 'qwen2.5-coder-7b-cpu', 'models', 'and the second is the CPU-only fallback');
        const ids = MODEL_SPECS.map((s) => s.id);
        const names = MODEL_SPECS.map((s) => s.fileName);
        t.equal(new Set(ids).size, ids.length, 'models', 'model ids are unique');
        t.equal(new Set(names).size, 1, 'models',
            'both entries name the SAME file: the choice is how it runs, not which weights — one download, verified once');
        t.equal(MODEL_SPECS[0].backend, 'vulkan', 'models', 'the first entry is the GPU build');
        t.equal(MODEL_SPECS[1].backend, 'cpu', 'models', 'and the second is the CPU-only build');
        for (const spec of MODEL_SPECS) {
            t.ok(/\.gguf$/.test(spec.fileName), 'models', `${spec.id}: ${spec.fileName} is a .gguf`);
            t.ok(spec.url.startsWith('https://'), 'models', `${spec.id}: fetched over https`);
            t.ok(spec.url.endsWith(spec.fileName), 'models', `${spec.id}: the URL really points at that file`);
            t.ok(spec.bytes > 1e9, 'models', `${spec.id}: the byte count is a real download size`);
            t.ok(/^[0-9a-f]{64}$/.test(spec.sha256), 'models', `${spec.id}: a full SHA-256 is pinned`);
            t.ok(spec.minRamGb >= 8, 'models', `${spec.id}: needs a sane amount of RAM`);
            t.ok(spec.label.includes('Coder') || /code/i.test(spec.label), 'models',
                `${spec.id}: a code-specialised model (Phi-3-mini's card warns about non-Python code, NOTES §91)`);
        }
        t.equal(specById('qwen2.5-coder-7b-gpu').minRamGb, 16, 'models',
            'the shipped model states the memory it actually wants');
        t.equal(specById('qwen2.5-coder-3b-q4'), undefined, 'models',
            'and a model removed from the table is gone from the registry, not half-there');
        t.equal(specById('nope'), undefined, 'models', 'an unknown id yields nothing');
        t.equal(specByFileName('qwen2.5-coder-3b-instruct-q4_k_m.gguf'), undefined, 'models',
            'the 3B is no longer recognised by file name either — it is not offered any more');
        t.equal(specByFileName('/home/x/models/qwen2.5-coder-7b-instruct-q4_k_m.gguf').id, 'qwen2.5-coder-7b-gpu', 'models',
            'paths and separators do not matter (the GPU entry owns the shared file)');
        t.equal(specByFileName('QWEN2.5-CODER-7B-INSTRUCT-Q4_K_M.GGUF').id, 'qwen2.5-coder-7b-gpu', 'models',
            'recognition is case-insensitive');
        t.equal(specByFileName('something-else.gguf'), undefined, 'models', 'and foreign files are left alone');
    }

    // ---------- 2) sizes, hashes, threads ----------
    {
        t.equal(formatBytes(0), '0 B', 'format', 'bytes stay bytes');
        t.equal(formatBytes(999), '999 B', 'format', 'right below the first unit');
        t.equal(formatBytes(1000), '1.0 kB', 'format', 'decimal units, like a download page');
        t.equal(formatBytes(1500000), '1.5 MB', 'format', 'megabytes');
        t.equal(formatBytes(2104932800), '2.1 GB', 'format', 'the 3B is shown as 2.1 GB');
        t.equal(formatBytes(4683073536), '4.7 GB', 'format', 'and the 7B as 4.7 GB');
        t.equal(formatBytes(NaN), '?', 'format', 'junk does not produce "NaN GB"');

        t.equal(shortHash(MODEL_SPECS[0].sha256), '509287f7…', 'format', 'a hash is shortened for the UI');
        t.equal(shortHash('abc'), 'abc', 'format', 'but a short string is left as it is');

        t.equal(defaultThreads(12), 8, 'threads', 'generation is capped at 8 threads');
        t.equal(defaultThreads(4), 3, 'threads', 'one core is left for the editor');
        t.equal(defaultThreads(2), 1, 'threads', 'and never zero');
        t.equal(defaultThreads(1), 1, 'threads', 'a single-core machine still gets one');
        t.equal(defaultThreads(NaN), 1, 'threads', 'junk falls back to one');
    }

    // ---------- 3) the sidecar contract ----------
    {
        const args = sidecarArgs({ modelPath: '/m/x.gguf', port: 4321 });
        t.ok(args.includes('--model') && args[args.indexOf('--model') + 1] === '/m/x.gguf', 'sidecar',
            'the model path is passed as its own argument');
        t.ok(args.includes('--port') && args[args.indexOf('--port') + 1] === '4321', 'sidecar', 'and the port');
        t.ok(args.includes('--ctx') && args[args.indexOf('--ctx') + 1] === String(DEFAULT_CONTEXT_SIZE), 'sidecar',
            'the context window is set (llama.cpp would otherwise default to far too little)');
        t.ok(args.includes('--gpu-layers') && args[args.indexOf('--gpu-layers') + 1] === '0', 'sidecar',
            'CPU-only by default: the target machine has no GPU to count on');
        t.ok(!args.includes('--threads'), 'sidecar', 'threads are left to the runtime when not set');
        const withThreads = sidecarArgs({ modelPath: '/m/x.gguf', port: 1, threads: 6, contextSize: 2048, gpuLayers: 4 });
        t.ok(withThreads[withThreads.indexOf('--threads') + 1] === '6', 'sidecar', 'an explicit thread count is honoured');
        t.ok(withThreads[withThreads.indexOf('--ctx') + 1] === '2048', 'sidecar', 'and an explicit context size');

        t.equal(sidecarBaseUrl(4321), 'http://127.0.0.1:4321/v1', 'sidecar',
            'the client is pointed at the sidecar exactly like at any other local server');
        t.equal(sidecarHealthUrl(4321), 'http://127.0.0.1:4321/health', 'sidecar', 'and /health is on the same port');
        t.ok(sidecarBaseUrl(1).startsWith('http://127.0.0.1'), 'sidecar', 'loopback only — never a real address');

        const good = parseHealth({ ok: true, loaded: true, model: 'm' });
        t.equal(good.ok, true, 'health', 'loaded weights mean ready');
        t.equal(good.model, 'm', 'health', 'the model name is reported');
        const loading = parseHealth({ ok: false, loaded: false, loading: true });
        t.equal(loading.ok, false, 'health', 'still loading is not ready');
        t.equal(loading.loading, true, 'health', 'and says so');
        const failed = parseHealth({ loaded: false, error: 'bad gguf' });
        t.equal(failed.ok, false, 'health', 'a load failure is not ready');
        t.equal(failed.error, 'bad gguf', 'health', 'and carries the reason');
        t.equal(parseHealth(null).ok, false, 'health', 'a null body does not throw');
        t.equal(parseHealth('nonsense').ok, false, 'health', 'nor does junk');
        t.equal(parseHealth({}).ok, false, 'health', 'an empty object is simply not ready');
        t.equal(parseHealth({ ok: 'yes' }).ok, false, 'health', 'and a truthy string is not a boolean');
    }

    // ---------- 4) what may be offered on this machine ----------
    {
        // Two shapes rather than two table entries: the shipped table offers one model (trimmed 2026-09-17),
        // and what is under test here is the *gate*, not which models happen to be pinned to it.
        const small = { ...MODEL_SPECS[0], id: 'a-small-one', minRamGb: 8 };
        const bigSpec = { ...MODEL_SPECS[0], id: 'a-big-one', minRamGb: 16 };
        t.equal(canRunSpec(small, { level: 'good', totalRamGb: 16 }).ok, true, 'hardware',
            'a small model fits a comfortable machine');
        t.equal(canRunSpec(small, { level: 'minimal', totalRamGb: 8 }).ok, true, 'hardware',
            'and a minimal one (8 GB is the gate)');
        const big = canRunSpec(bigSpec, { level: 'minimal', totalRamGb: 8 });
        t.equal(big.ok, false, 'hardware', 'a 16 GB model is not offered on 8 GB');
        t.ok(/16 GB/.test(big.reason), 'hardware', 'and the reason names the requirement');
        t.equal(canRunSpec(bigSpec, { level: 'good', totalRamGb: 16 }).ok, true, 'hardware',
            'but is offered on 16 GB');
        t.equal(canRunSpec(bigSpec, { level: 'none', totalRamGb: 64 }).ok, false, 'hardware',
            'no AVX2 or too few cores disqualifies even a big machine');

        t.equal(isGgufPath('/m/x.gguf'), true, 'files', 'a .gguf path is accepted');
        t.equal(isGgufPath('/m/X.GGUF'), true, 'files', 'case does not matter');
        t.equal(isGgufPath('/m/x.bin'), false, 'files', 'a .bin is not a gguf');
        t.equal(MODEL_FOLDER, 'models', 'files', 'weights live in one folder inside global storage');
    }

    // ---------- 5) the configuration knows about the bundled backend ----------
    {
        const bundled = normalizeAssistantConfig({ backend: 'bundled', modelPath: ' /m/x.gguf ' });
        t.equal(bundled.backend, 'bundled', 'config', '"bundled" is a real backend');
        t.equal(bundled.modelPath, '/m/x.gguf', 'config', 'the model path is trimmed');
        t.equal(assistantEnabled(bundled), true, 'config',
            'bundled counts as enabled without an endpoint — the runtime supplies one at request time');
        t.equal(normalizeAssistantConfig({ backend: 'nonsense' }).backend, 'off', 'config',
            'anything unrecognised still fails safe to off');
        t.equal(normalizeAssistantConfig({}).modelPath, '', 'config', 'no model path by default');
        t.equal(normalizeAssistantConfig({ threads: '4' }).threads, 4, 'config', 'a thread count from the UI is a number');
        t.equal(normalizeAssistantConfig({ threads: 99 }).threads, 32, 'config', 'and is clamped');
        t.equal(normalizeAssistantConfig({ threads: -3 }).threads, 0, 'config', '0 means "choose automatically"');
    }

    // ---------- 6) the sidecar's framing matches the client's parser ----------
    {
        // The C# writes `data: {...}\n\n` per token and ends with `data: [DONE]`. Both shapes are fed
        // through the tier-1 parser here, so a change on one side of the wire fails on this side.
        const delta = JSON.stringify({ choices: [{ delta: { content: '    private void A()' } }] });
        t.equal(parseSseDelta(`data: ${delta}`), '    private void A()', 'wire',
            'a token frame the sidecar writes is parsed by the client (indentation kept)');
        t.equal(parseSseDelta('data: [DONE]'), undefined, 'wire', 'and the terminator means "no more text"');
    }

    // ---------- 7) the manifest ----------
    {
        const pkg = JSON.parse(read('package.json'));
        const props = pkg.contributes.configuration.properties;
        t.ok(props['avaloniaDesigner.assistant.backend'].enum.includes('bundled'), 'manifest',
            '"bundled" is offered in the settings UI');
        t.equal(props['avaloniaDesigner.assistant.backend'].default, 'off', 'manifest',
            'the bundled runtime does not switch itself on');
        t.ok(!!props['avaloniaDesigner.assistant.modelPath'], 'manifest', 'the model path is a setting');
        t.ok(!!props['avaloniaDesigner.assistant.threads'], 'manifest', 'so is the thread count');
        t.equal(props['avaloniaDesigner.assistant.threads'].default, 0, 'manifest', 'which defaults to automatic');

        const commands = (pkg.contributes.commands || []).map((c) => c.command);
        t.ok(commands.includes('avaloniaDesigner.assistant.setupModel'), 'manifest', 'the setup command is contributed');
        t.ok(commands.includes('avaloniaDesigner.assistant.stopModel'), 'manifest', 'and the stop command');
        const palette = (pkg.contributes.menus.commandPalette || []).map((m) => m.command);
        t.ok(palette.includes('avaloniaDesigner.assistant.setupModel'), 'manifest',
            'setup is in the palette (it is how the feature is turned on)');
        t.ok(palette.includes('avaloniaDesigner.assistant.stopModel'), 'manifest', 'so is stop');

        const ext = read('src/extension.ts');
        t.ok(/initModelRuntime\(context\)/.test(ext), 'wiring', 'the runtime is initialised once per window');
        t.ok(/registerCommand\('avaloniaDesigner\.assistant\.setupModel'/.test(ext), 'wiring', 'setup is registered');
        t.ok(/registerCommand\('avaloniaDesigner\.assistant\.stopModel'/.test(ext), 'wiring', 'stop is registered');
        const ui = read('src/assistantUi.ts');
        t.ok(/ensureBundledEndpoint\(cfg\)/.test(ui), 'wiring', 'the UI asks the runtime for the endpoint');
        t.ok(/backend === 'bundled'/.test(ui), 'wiring', 'and only does so for the bundled backend');
    }

    // ---------- 8) the runtime module ----------
    {
        t.ok(exists('src/modelRuntime.ts'), 'runtime', 'the runtime module exists');
        const rt = read('src/modelRuntime.ts');
        t.ok(/from '\.\/modelSpecs'/.test(rt), 'runtime', 'it reads the registry rather than its own table');
        t.ok(!/huggingface\.co/.test(rt), 'runtime',
            'no model URL is hardcoded outside the registry (one source of truth)');
        t.ok(/cp\.spawn\(/.test(rt) && /sidecarArgs\(/.test(rt), 'runtime', 'the sidecar is spawned with those arguments');
        t.ok(/READY_PREFIX/.test(rt), 'runtime', 'and its readiness line is awaited');
        t.ok(/https\.get/.test(rt), 'runtime', 'the weights are fetched with https');
        t.ok(/spec\.sha256/.test(rt) && /fileSha256/.test(rt), 'runtime',
            'every download is verified against the pinned checksum');
        t.ok(/\.part/.test(rt), 'runtime', 'a download lands in a .part file first, so an interrupt cannot leave a broken model');
        t.ok(/withProgress/.test(rt), 'runtime', 'the download reports progress');
        t.ok(/CancellationToken|onCancellationRequested/.test(rt), 'runtime', 'and can be cancelled');
        t.ok(/proc\.kill\(\)/.test(rt), 'runtime', 'the server process is killed on dispose (no orphaned model)');
        t.ok(/globalStorageUri/.test(rt), 'runtime', 'weights live in the extension\'s global storage, not the VSIX');
    }

    // ---------- 9) the two packaging traps ----------
    {
        // (a) PreviewerHost globs host/**/*.cs; the sidecar is a second project inside that folder.
        //     Without the exclusion the previewer host fails to build with two entry points — which is
        //     exactly what happened when the sidecar was added.
        const previewer = read('host/PreviewerHost.csproj');
        t.ok(/<Compile Remove="ModelHost\/\*\*" \/>/.test(previewer), 'packaging',
            'the previewer host excludes the sidecar from its compile items');
        t.ok(/<None Remove="ModelHost\/\*\*" \/>/.test(previewer), 'packaging',
            'and from its None items (the generated obj/ files would clash too)');

        // (b) The sidecar's own build output holds llama.cpp for every platform (~99 MB here); shipping
        //     it would bloat the VSIX for no reason, because it is rebuilt on the user's machine.
        const ignore = read('.vscodeignore');
        t.ok(/^host\/\*\*\/bin\/\*\*$/m.test(ignore), 'packaging', 'nested host build output is excluded from the VSIX');
        t.ok(/^host\/\*\*\/obj\/\*\*$/m.test(ignore), 'packaging', 'and its obj/ (generated sources)');
        t.ok(!/^[^#\n]*\.csproj$/m.test(ignore), 'packaging',
            'no .csproj is ignored — the runtime is built from source ON the user\'s machine');
        t.ok(!/^host\/ModelHost/m.test(ignore), 'packaging', 'and the sidecar sources do ship');

        t.ok(exists('host/ModelHost/ModelHost.csproj'), 'packaging', 'the sidecar project ships with the extension');

        // (c) The same one-level-deep trap in .gitignore: the sidecar's build output (99 MB of natives)
        //     was committed by `git add -A` before the nested patterns existed.
        const gitignore = read('.gitignore');
        t.ok(/^host\/\*\*\/bin\/$/m.test(gitignore), 'packaging', 'git ignores nested host build output');
        t.ok(/^host\/\*\*\/obj\/$/m.test(gitignore), 'packaging', 'and its obj/');
        const csproj = read('host/ModelHost/ModelHost.csproj');
        t.ok(/LLamaSharp\.Backend\.Cpu/.test(csproj), 'packaging',
            'it uses the CPU backend: NuGet resolves the right native library per platform');
        t.ok(/<TargetFramework>net8\.0<\/TargetFramework>/.test(csproj), 'packaging',
            'same target framework as the previewer host');
        t.ok(!/RuntimeIdentifier/.test(csproj), 'packaging',
            'no RuntimeIdentifier is pinned — one project, every platform');
    }

    // ---------- 10) the C# and the TypeScript agree on the handshake ----------
    {
        const program = read('host/ModelHost/Program.cs');
        t.ok(program.includes(READY_PREFIX), 'handshake', 'the sidecar prints the readiness line the runtime waits for');
        t.ok(/\/v1\/chat\/completions/.test(program), 'handshake',
            'it serves the endpoint the client posts to');
        t.ok(/\/v1\/models/.test(program), 'handshake', 'and /models, which the status command probes');
        t.ok(/"\/health"/.test(program), 'handshake', 'plus /health, which reports the load state');
        t.ok(/text\/event-stream/.test(program), 'handshake', 'it streams as SSE');
        t.ok(/data: \[DONE\]/.test(program), 'handshake', 'and closes the stream the way the parser expects');
        t.ok(/delta = new \{ content/.test(program), 'handshake', 'emitting OpenAI-shaped deltas');
        t.ok(/127\.0\.0\.1/.test(program), 'handshake', 'bound to loopback only');

        // The sidecar must speak the MODEL's chat template. Without it LLamaSharp frames the chat the
        // Llama-2 way, a Qwen/coder model never sees where the assistant turn starts, and it answers by
        // repeating its first block until the token budget is gone — measured 2026-09-14: the same prompt
        // that LM Studio answered with one clean block in 17 s came back as 30 copies, 4049 characters,
        // 40 s, cut off mid-fence. With the template and the stop markers it is one block in ~3 s.
        t.ok(/PromptTemplateTransformer/.test(program), 'handshake',
            "the sidecar uses the model's own chat template (tokenizer.chat_template in the GGUF)");
        t.ok(/AntiPrompts = StopMarkers/.test(program), 'handshake',
            'and stops at the end-of-turn markers the families actually use');
        t.ok(/DecodeSpecialTokens = true/.test(program), 'handshake',
            'with special tokens decoded, or the anti-prompt could never match its own marker');
        t.ok(/<\|im_end\|>/.test(program) && /<\|eot_id\|>/.test(program), 'handshake',
            'covering ChatML (Qwen) and Llama 3 by name');
    }
};
