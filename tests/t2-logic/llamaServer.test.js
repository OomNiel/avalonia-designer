/* T2 — the user's own `llama-server`: found, started, stopped, and reported honestly.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE. There is no llama.cpp build on this machine (checked 2026-09-16:
 * `which llama-server` finds nothing), so a test cannot start one and must not pretend to. What it proves is
 * where the decisions are, because those are the parts that fail quietly in front of a user:
 *
 *   - the **lookup** (a path the user set, PATH, the usual build folders) is a function of a filesystem the
 *     test describes, so "it silently started a different binary" cannot happen;
 *   - the **argv** is llama.cpp's own spelling, and the one thing that must never appear on it is the
 *     extension's sidecar flags (`--ctx`, `--gpu-layers`) — those are OUR wrapper's names and would make the
 *     user's server refuse to start;
 *   - the **health verdicts** are the four different things the caller has to do (go, wait, fall back, keep
 *     waiting), and reading `/v1/models` as readiness would report a server that cannot answer yet;
 *   - the **wiring** (commands, settings, both front doors, the shutdown) is asserted against the source,
 *     because a stub cannot start a process.
 *
 * Flag names come from llama.cpp's server reference (`tools/server/README.md`, read 2026-09-16):
 * `-m/--model`, `--host`, `--port`, `-t/--threads`, `-c/--ctx-size`, `-ngl/--n-gpu-layers`, `-a/--alias`.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {
    classifyHealth,
    endpointPort,
    findLlamaServer,
    findOnPath,
    isLlamaServerModels,
    isLocalEndpoint,
    isUnknownArgumentFailure,
    llamaServerAlias,
    llamaServerArgs,
    llamaServerCandidates,
    llamaServerPortCandidates,
    parseLlamaProps,
    parseLlamaVersion,
    parseServedModels,
    recommendedLlamaOptions,
    splitArgs
} = require('../../out/localModels.js');
// The status lines are pure text built from the settings + the running process, so the module can be loaded
// with the `vscode` stub in place (tests/stubs) and asked what it would print.
const { llamaServerMissingMessage, llamaServerStatusLines, ownLlamaServerStatus } = require('../../out/llamaServer.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/**
 * REAL output, captured from this machine on 2026-09-16. The developer's own `llama-server` runs as a
 * systemd user service on port 8080 (`--alias qwen3-coder-local`, a 30 B Qwen3-Coder), so the identity
 * check that decides "is one already running?" can be pinned against what it really answers rather than
 * against a shape invented here. LM Studio's answers were captured the same way, and they are the reason
 * the check does not simply ask "does something answer on port 8080?":
 *   - `/v1/models` differ (llama.cpp says `owned_by: "llamacpp"`, LM Studio says `"organization_owner"`);
 *   - `/props` answers **200** on LM Studio too, with `{"error":"Unexpected endpoint or method…"}` — so a
 *     200 alone means nothing and `model_path` is what identifies llama.cpp.
 */
const LLAMA_VERSION = 'version: 10365 (9afff1b74)\nbuilt with GNU 13.3.0 for Linux x86_64\n';
const LLAMA_MODELS = {
    models: [{ name: 'qwen3-coder-local', model: 'qwen3-coder-local', type: 'model', capabilities: ['completion'] }],
    object: 'list',
    data: [{
        id: 'qwen3-coder-local', aliases: ['qwen3-coder-local'], object: 'model', created: 1789569219,
        owned_by: 'llamacpp',
        meta: { vocab_type: 2, n_vocab: 151936, n_ctx: 16384, n_ctx_train: 262144, n_params: 30532122624, ftype: 'Q4_K - Small' }
    }]
};
const LLAMA_PROPS = {
    total_slots: 1,
    model_path: '/home/niel/.cache/huggingface/hub/models--n00b001--Qwen3-Coder-30B-A3B-Instruct-Q4_K_S-GGUF/'
        + 'snapshots/2d796cffeb2089cde2faa1a1c3cb919bb25f56ad/qwen3-coder-30b-a3b-instruct-q4_k_s.gguf',
    build_info: 'b10365-9afff1b74',
    is_sleeping: false
};
const LMSTUDIO_MODELS = {
    data: [
        { id: 'qwen2.5-coder-3b-instruct', object: 'model', owned_by: 'organization_owner' },
        { id: 'qwen/qwen3.5-9b', object: 'model', owned_by: 'organization_owner' }
    ]
};
const LMSTUDIO_PROPS = { error: 'Unexpected endpoint or method. (GET /props)' };

/** A filesystem the test describes: only these paths exist. */
const withPaths = (...paths) => (p) => paths.includes(p);

const ROOMY = { totalRamGb: 28, freeRamGb: 18, cpuCount: 12, lockLimitGb: 3.78 };
const TIGHT = { totalRamGb: 8, freeRamGb: 3, cpuCount: 4, lockLimitGb: 3.78 };

module.exports = async (t) => {
    t.section("the user's own llama-server");

    // ---------- 1) where the binary is ----------
    {
        const lin = llamaServerCandidates('/home/niel', 'linux');
        t.equal(lin[lin.length - 1], 'llama-server', 'lookup',
            'the last candidate is the bare name, which means "look on PATH"');
        t.ok(lin.some((c) => c === '/home/niel/llama.cpp/build/bin/llama-server'), 'lookup',
            'the folder a hand-built llama.cpp lands in is looked in');
        t.ok(lin.some((c) => c === '/usr/local/bin/llama-server'), 'lookup', 'and the two system prefixes');
        const win = llamaServerCandidates('C:\\Users\\niel', 'win32');
        t.ok(win.every((c) => c.endsWith('.exe')), 'lookup', 'on Windows every candidate is the .exe');
        t.ok(win.some((c) => /Release/.test(c)), 'lookup', 'and the Visual Studio output folder is included');

        const onPath = findOnPath('llama-server', '/usr/bin:/home/niel/.local/bin', withPaths('/home/niel/.local/bin/llama-server'));
        t.equal(onPath, '/home/niel/.local/bin/llama-server', 'lookup', 'PATH is searched left to right');
        t.equal(findOnPath('llama-server', '/usr/bin:/opt/bin', withPaths()), undefined, 'lookup',
            'and nothing found is undefined rather than a guess');
        t.equal(findOnPath('llama-server', 'C:\\tools;C:\\bin', withPaths('C:\\tools\\llama-server.exe'), 'win32'),
            'C:\\tools\\llama-server.exe', 'lookup', 'on Windows a bare name is also tried as .exe');
        t.equal(findOnPath('llama-server', '/usr/bin::/sbin', () => true), '/usr/bin/llama-server', 'lookup',
            'an empty PATH entry (which means "the current directory") is skipped rather than producing "/llama-server"');

        const found = { homeDir: '/home/niel', pathValue: '/usr/local/bin', exists: withPaths('/usr/local/bin/llama-server') };
        t.equal(findLlamaServer(found), '/usr/local/bin/llama-server', 'lookup', 'with no setting, PATH answers');
        t.equal(findLlamaServer({ ...found, preferred: '/opt/llama/llama-server', exists: withPaths('/opt/llama/llama-server', '/usr/local/bin/llama-server') }),
            '/opt/llama/llama-server', 'lookup', 'a path the user set wins over everything else');
        // The reason this returns undefined instead of falling back: a *stale* setting is the user's own line
        // to fix, and starting a different binary than the one they named would hide that from them.
        t.equal(findLlamaServer({ ...found, preferred: '/opt/gone/llama-server' }), undefined, 'lookup',
            'a path they set that does not exist is reported as missing, never quietly replaced');
        t.equal(findLlamaServer({ homeDir: '/home/niel', pathValue: '/usr/bin', exists: withPaths() }), undefined, 'lookup',
            'and a machine with none of them yields nothing at all');

        const v = parseLlamaVersion(LLAMA_VERSION);
        t.equal(v, '10365 (9afff1b74)', 'lookup',
            'the build and commit are read out of --version for the log — this is the real line from build 10365');
        t.equal(parseLlamaVersion('version: 4567'), '4567', 'lookup', 'a build without a commit is fine too');
        t.equal(parseLlamaVersion('Usage: llama-server [options]'), undefined, 'lookup',
            'output that is not a version yields nothing — the log must not claim a version it did not see');
    }

    // ---------- 1b) a server that is already running ----------
    {
        t.equal(endpointPort('http://127.0.0.1:1234/v1'), 1234, 'running', 'the port is read out of an endpoint');
        t.equal(endpointPort('http://127.0.0.1/v1'), undefined, 'running', 'and an endpoint without one yields nothing');
        t.equal(isLocalEndpoint('http://127.0.0.1:1234/v1'), true, 'running', 'loopback is this machine');
        t.equal(isLocalEndpoint('http://localhost:8080/v1'), true, 'running', 'as is localhost');
        t.equal(isLocalEndpoint('https://build-box:8080/v1'), false, 'running',
            'a remote endpoint is not probed locally — its port on this machine is a different server');
        t.equal(llamaServerPortCandidates('http://127.0.0.1:1234/v1'), [1234, 8080, 9931], 'running',
            "the settings' port comes first, then llama.cpp's default pair (8080 today, 9931 as its own notice "
            + 'says the default is moving to)');
        t.equal(llamaServerPortCandidates('https://build-box:1234/v1'), [8080, 9931], 'running',
            'and a remote endpoint contributes no port at all');
        t.equal(llamaServerPortCandidates('http://127.0.0.1:8080/v1'), [8080, 9931], 'running',
            'a port that is also a default is only asked about once');

        const served = parseServedModels(LLAMA_MODELS);
        t.equal(served.length, 1, 'running', 'the real /v1/models answer is read');
        t.equal(served[0].id, 'qwen3-coder-local', 'running', 'with the alias the service was started with');
        t.equal(served[0].contextSize, 16384, 'running', 'and the context it was started with, from its meta block');
        t.equal(isLlamaServerModels(LLAMA_MODELS), true, 'running',
            '`owned_by: "llamacpp"` is what identifies llama.cpp beyond argument');
        t.equal(isLlamaServerModels(LMSTUDIO_MODELS), false, 'running',
            'LM Studio answers with `organization_owner`, so it is never mistaken for one');
        t.equal(isLlamaServerModels({}), false, 'running', 'and an answer with no models identifies nothing');

        const props = parseLlamaProps(LLAMA_PROPS);
        t.ok(/qwen3-coder-30b-a3b-instruct-q4_k_s\.gguf$/.test(props.modelPath), 'running',
            'the model file the running server is serving comes out of /props');
        t.equal(props.buildInfo, 'b10365-9afff1b74', 'running', 'and so does its build');
        t.equal(props.totalSlots, 1, 'running', 'with the slot count, which is what its -np was set to');
        t.equal(parseLlamaProps(LMSTUDIO_PROPS).modelPath, undefined, 'running',
            'LM Studio answers /props with a 200 and an error body — no model_path, so it is not one');
        t.equal(parseLlamaProps(undefined).modelPath, undefined, 'running', 'and junk yields nothing at all');
    }

    // ---------- 2) the command line ----------
    {
        t.equal(llamaServerAlias('/home/niel/models/deepseek-coder-6.7b-instruct.Q4_K_M.gguf'),
            'deepseek-coder-6.7b-instruct.Q4_K_M', 'argv',
            'the alias is the file name without the extension — what the user calls the model');
        t.equal(llamaServerAlias('C:\\models\\a model (1).gguf'), 'a-model-1', 'argv',
            'spaces and brackets become dashes, because this is a model id');
        t.equal(llamaServerAlias(''), 'local-model', 'argv', 'and something usable comes out of nothing');

        const argv = llamaServerArgs({
            modelPath: '/m/x.gguf', port: 8123, threads: 7, contextSize: 8192, gpuLayers: 0, alias: 'x'
        });
        t.equal(argv, ['--model', '/m/x.gguf', '--host', '127.0.0.1', '--port', '8123',
            '--ctx-size', '8192', '--threads', '7', '--n-gpu-layers', '0', '--alias', 'x'], 'argv',
            "the user's binary gets llama.cpp's flag names, not the sidecar's");
        // The sidecar's own wrapper takes `--ctx`/`--gpu-layers`; sending those to a real llama-server is an
        // immediate "invalid argument" exit, so the spellings must not be able to appear here.
        t.ok(!argv.some((a) => a === '--ctx' || a === '--gpu-layers'), 'argv',
            'never the extension\'s own flag spellings');
        // 0 is a *decision* on llama.cpp ("do not offload"), while omitting it leaves `auto` in charge — the
        // difference matters on a shared-memory iGPU, which is the machine this feature was asked for.
        t.ok(argv.includes('--n-gpu-layers'), 'argv', 'GPU layers is always stated, because 0 means "CPU only"');
        t.ok(!llamaServerArgs({ modelPath: '/m/x.gguf', port: 1, contextSize: 0 }).includes('--ctx-size'), 'argv',
            'a context of 0 is left off, so llama.cpp takes the model\'s own size');
        t.ok(!llamaServerArgs({ modelPath: '/m/x.gguf', port: 1 }).some((a) => a === '--alias'), 'argv',
            'and no alias is passed when none was asked for');

        const extra = llamaServerArgs({
            modelPath: '/m/x.gguf', port: 1, gpuLayers: 0, extraArgs: '--flash-attn on  --no-warmup --lora "my adapter.gguf"'
        });
        t.equal(extra.slice(-5), ['--flash-attn', 'on', '--no-warmup', '--lora', 'my adapter.gguf'], 'argv',
            'the user\'s own flags come last, so they win, and a quoted argument stays one argument');
        t.equal(splitArgs('  '), [], 'argv', 'blank extra flags split into nothing rather than an empty argument');
        t.equal(splitArgs("-t 4 -c 'x y'"), ['-t', '4', '-c', 'x y'], 'argv', 'single quotes work as well as double');

        t.ok(isUnknownArgumentFailure('error: invalid argument: --alias'), 'argv',
            'a refused flag is recognised, because that failure is the one worth retrying');
        t.ok(isUnknownArgumentFailure('unrecognized option --n-gpu-layers'), 'argv', 'including the other wording a build may use');
        t.ok(!isUnknownArgumentFailure('error: failed to load model from /m/x.gguf'), 'argv',
            'a missing model file is NOT, because retrying without a flag would fail the same way twice');
    }

    // ---------- 3) is it ready, or still loading? ----------
    {
        t.equal(classifyHealth(200), 'ok', 'health', '200 means the weights are in RAM');
        t.equal(classifyHealth(503), 'loading', 'health',
            '503 is llama.cpp\'s "Loading model" — the reason this is not read from /v1/models, which answers '
            + 'immediately with a null meta block and would report a server that cannot answer yet');
        t.equal(classifyHealth(404), 'absent', 'health',
            '404 is a build with no /health endpoint: the caller falls back to the model list');
        t.equal(classifyHealth(401), 'absent', 'health', 'and a server started with an API key answers the same way');
        t.equal(classifyHealth(0), 'unreachable', 'health', 'no answer at all is its own verdict — keep waiting');
    }

    // ---------- 4) what the numbers should be ----------
    {
        const roomy = recommendedLlamaOptions(6.9, ROOMY);
        t.equal(roomy.contextSize, 8192, 'recommend', 'a machine with 18 GB free gets 8 K of context');
        t.equal(roomy.threads, 8, 'recommend', 'and threads are "one less than the cores", capped at 8 (12 cores here)');
        t.equal(roomy.gpuLayers, 999, 'recommend',
            'offload is chosen from the model\'s size, not from the GPU\'s name: 6.9 GB is under the 8 GB line');
        t.equal(recommendedLlamaOptions(17.7, ROOMY).gpuLayers, 0, 'recommend',
            'a model above that line is CPU-only on principle — this machine\'s GPU shares its memory with the CPU, '
            + 'and the 17.7 GB model is what crashed Vulkan at 0% offload (2026-09-15)');
        t.equal(recommendedLlamaOptions(2.1, ROOMY).gpuLayers, 999, 'recommend',
            'a small one is offloaded, where the GPU genuinely helps');
        t.equal(recommendedLlamaOptions(2.1, TIGHT).contextSize, 4096, 'recommend',
            'a machine with 3 GB free gets 4 K instead, because context is where the memory goes');
        t.equal(recommendedLlamaOptions(2.1, TIGHT).threads, 3, 'recommend', 'and two cores are not asked for eight threads');
        t.equal(recommendedLlamaOptions(2.1, ROOMY).reasons.length, 3, 'recommend',
            'every number is explained, so the dialog is not a black box');
    }

    // ---------- 5) the panel and the runtime are told about each other ----------
    {
        const runtime = read('src/llamaServer.ts');
        t.ok(/llamaServerArgs\(/.test(runtime), 'wiring',
            'the module builds its command line through the pure function, never by hand');
        t.ok(!/'--ctx'|'--gpu-layers'/.test(runtime), 'wiring',
            'and never writes the sidecar\'s flag spellings itself');
        t.ok(/isUnknownArgumentFailure\(started\.output\)/.test(runtime), 'wiring',
            'the retry is driven by the pure predicate, so only an argv refusal can trigger it');
        t.ok(/EARLY_EXIT_MS/.test(runtime), 'wiring',
            'a start is watched for an early exit, because that is what a refused flag looks like');
        t.ok(/loadedModelId\(port\)/.test(runtime), 'wiring',
            'on a build with no /health the fallback asks for the meta block llama.cpp only fills in once the '
            + 'weights are loaded — otherwise it would call a loading server ready');
        t.ok(/ensureStarted/.test(runtime) && /modelPath === launch\.modelPath/.test(runtime), 'wiring',
            'a second Load of the same file reuses the running process instead of starting a twin');
        t.ok(/sameSettings\(running\.settings, launch\)/.test(runtime), 'wiring',
            'but only when the flags match as well — a context length the user just changed has to mean a restart, '
            + 'not a shrug');
        // The rule the developer's own machine makes necessary: a llama-server is ALREADY running there as a
        // systemd service. Starting a second copy of the same file would double the memory for one answer.
        t.ok(/findRunningLlamaServer\(/.test(runtime), 'wiring',
            'before starting anything, the module asks whether one is already answering');
        t.ok(/request\.reuseRunning \?\? true/.test(runtime), 'wiring',
            'and reuses it by default — the caller has to opt *out* of that');
        t.ok(/sameFile\(runningElsewhere\.modelPath, modelPath\)/.test(runtime), 'wiring',
            'only when it is serving the same file (a different one is a different model, not a duplicate)');
        t.ok(/Start another one with a different model/.test(runtime), 'wiring',
            'the palette asks before it makes a second copy of anything');
        t.ok(/reuseRunning: !startAnother/.test(runtime), 'wiring',
            'and an explicit "start another" is carried through, so the choice cannot be overwritten by the default');
        t.ok(/both are in memory now/.test(runtime), 'wiring',
            'when it does become two, the message says so — that is the user\'s memory');
        t.ok(/dispose\(\): void \{\s*\n\s*this\.stop\(\);/.test(runtime), 'wiring',
            'the child is killed with the window, like the sidecar');
        // It must NOT try to stop a process it did not start: this machine's llama-server is a user service.
        t.ok(/This window did not start it, so "Stop" leaves it alone/.test(runtime), 'wiring',
            'and a server it did not start is left alone, said out loud rather than silently ignored');

        const panel = read('src/aiPanel.ts');
        t.ok(/kind === 'llama'/.test(panel), 'wiring', 'the panel has a load path for the user\'s own server');
        t.ok(/stopOwnLlamaServer\(\)/.test(panel), 'wiring',
            '"Unload" frees all three runtimes — the bug that a built-in model survived Unload (2026-09-15)');
        t.ok(/your own llama-server, running on/.test(panel), 'wiring',
            'and the pinned line names the process that is actually serving');
        t.ok(/kind === 'llama'\) \{\s*\n\s*\/\/ The address \*and\* the model id belong/.test(panel), 'wiring',
            'Save with this entry selected must not blank the model id a previous Load pinned');

        const setup = read('src/localModelSetup.ts');
        t.ok(/My own llama-server/.test(setup) && /action: 'llama'/.test(setup), 'wiring',
            'the palette\'s model picker offers it too — that is the picker a developer opens for "a local model"');
        t.ok(!/from '\.\/llamaServer'/.test(setup), 'wiring',
            'and reaches it through the command, so the two modules keep one dependency direction');

        const status = read('src/assistantUi.ts');
        t.ok(/llamaServerStatusLines\(llamaServerBinary\(\), await findRunningLlamaServer/.test(status), 'wiring',
            'the status dialog reports it — the third runtime would otherwise be invisible there, including '
            + 'whether the answer came from a server this window did not start');

        const ext = read('src/extension.ts');
        t.ok(/initLlamaServer\(context\)/.test(ext), 'wiring', 'the manager is created once per window');
        t.ok(/startLlamaServer/.test(ext) && /stopLlamaServer/.test(ext), 'wiring', 'both commands are registered');
        t.ok(/stopOwnLlamaServer\(\)/.test(ext.slice(ext.indexOf('export async function deactivate'))), 'wiring',
            'and closing the window stops the process, because nothing else would');

        const manifest = JSON.parse(read('package.json'));
        const commands = manifest.contributes.commands.map((c) => c.command);
        t.ok(commands.includes('avaloniaDesigner.assistant.startLlamaServer'), 'wiring', 'the start command is declared');
        t.ok(commands.includes('avaloniaDesigner.assistant.stopLlamaServer'), 'wiring', 'so is the stop command');
        const conf = manifest.contributes.configuration;
        const props = (Array.isArray(conf) ? conf[0] : conf).properties;
        t.equal(props['avaloniaDesigner.assistant.llamaServerPath'].type, 'string', 'wiring',
            'the binary path is a setting, so a machine with llama.cpp outside PATH is not a dead end');
        t.equal(props['avaloniaDesigner.assistant.llamaServerArgs'].type, 'string', 'wiring',
            'and extra flags are a setting, so a build with different spellings can still be used');
        t.ok(/after\*\* the flags the extension computes, so yours win/.test(props['avaloniaDesigner.assistant.llamaServerArgs'].markdownDescription),
            'wiring', 'the description states the precedence, which is the whole reason extras exist');
    }

    // ---------- 6) what the dialogs say ----------
    {
        t.ok(/Install/.test(llamaServerMissingMessage({})) && /llamaServerPath/.test(llamaServerMissingMessage({})),
            'message', 'no binary found names both ways out: install it, or point the setting at it');
        const stale = llamaServerMissingMessage({ configured: '/opt/gone/llama-server', configuredMissing: true });
        t.ok(/\/opt\/gone\/llama-server/.test(stale) && !/Install/.test(stale), 'message',
            'a stale path is reported as *their* setting to fix, not as "llama.cpp is not installed"');

        // Nothing running and nothing configured: silence, because a "not installed" line for a feature the
        // user never asked about is noise.
        t.equal(llamaServerStatusLines({}), [], 'message',
            'a machine with no llama-server says nothing in the status dialog by default');
        const found = llamaServerStatusLines({ path: '/usr/local/bin/llama-server' });
        t.equal(found.length, 1, 'message', 'a found binary gets one line');
        t.ok(/not running/.test(found[0]), 'message', 'which says whether it is up — the question the dialog answers');
        t.equal(ownLlamaServerStatus().running, false, 'message', 'nothing of ours is running in this process');
        // A server the developer started themselves is reported — with the one fact that decides what the
        // user should do next: it is not ours, so no button in this extension will free its memory.
        const foreign = llamaServerStatusLines({}, {
            endpoint: 'http://127.0.0.1:8080/v1', port: 8080, modelId: 'qwen3-coder-local',
            modelPath: '/home/niel/.cache/huggingface/hub/models--n00b001--Qwen3-Coder-30B-A3B-Instruct-Q4_K_S-GGUF/snapshots/2d796cff/qwen3-coder-30b-a3b-instruct-q4_k_s.gguf',
            buildInfo: 'b10365-9afff1b74'
        });
        t.equal(foreign.length, 2, 'message', 'a running server gets two lines');
        t.ok(/already running on port 8080/.test(foreign[0]) && /qwen3-coder-30b-a3b-instruct-q4_k_s\.gguf/.test(foreign[0]),
            'message', 'naming the port and the model file it was started with');
        t.ok(/Started outside this window/.test(foreign[1]) && /leave it alone/.test(foreign[1]), 'message',
            'and saying plainly that this extension will not stop it');
        t.ok(llamaServerStatusLines({ path: '/usr/local/bin/llama-server' }).length === 1, 'message',
            'a foreign server does not also print the not-running line');
    }
};
