/* T2 — the built-in runtime's native build: CPU by default, Vulkan when asked for, and never a claim it
 * cannot back.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE. Two of the four pieces live in C# (`host/ModelHost/Program.cs`), and
 * there is no C# harness in this suite, so what is asserted here is:
 *
 *   - the **decisions** the extension makes, as pure functions — which build the setting means, what goes on
 *     the command line, which attempts are made and in what order, what `/health` may say, and the sentence the
 *     status prints. All of it is text in, text out;
 *   - the **wiring** in the manifest, the command table, the config reader, the process code, the panel state
 *     and the panel's hint — asserted against the source, because a stub cannot start a process.
 *
 * The C# side was verified by running it (2026-09-16, and the numbers are quoted here because they are the
 * reason the feature exists):
 *
 *   ModelHost --model qwen2.5-coder-3b-instruct-q4_k_m.gguf --ctx 512 --gpu-layers 999 --backend cpu
 *     → "model loaded … in 1409 ms (… backend: CPU)"
 *     → /health {"backend":"cpu","device":null}
 *   ModelHost … --backend vulkan
 *     → "ggml_vulkan: Found 1 Vulkan devices: AMD Radeon 760M Graphics (RADV PHOENIX)" ·
 *       "load_tensors: offloaded 37/37 layers to GPU" · "model loaded … in 602 ms (… backend: vulkan on …)"
 *     → /health {"backend":"vulkan","device":"AMD Radeon 760M Graphics (RADV PHOENIX)"}
 *
 * The first version of that detection read the answer out of a 200-line log buffer **after** the load and
 * therefore reported "cpu" for a run that had just offloaded every layer — the load emits ~900 lines, and the
 * library is chosen at the very top of them. It now records the two facts as the lines arrive. That is why the
 * `/health` answer is asserted here as a *shape* and the C# is asserted as a source: the shape is what the
 * extension depends on.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHealth, sidecarArgs, sidecarAttempts, sidecarBackend, nativeBackendLine } = require('../../out/modelSpecs.js');
const { normalizeAssistantConfig } = require('../../out/assistant.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** A `--backend` argument as a value, from an argv array. */
const backendOf = (args) => args[args.indexOf('--backend') + 1];

module.exports = async (t) => {
    t.section('the built-in runtime: CPU by default, Vulkan on request');

    // ---------- 1) what the setting means ----------
    {
        t.equal(sidecarBackend('vulkan'), 'vulkan', 'setting', 'the exact word asks for the GPU build');
        t.equal(sidecarBackend(' VULKAN '), 'vulkan', 'setting',
            'a hand-edited setting with stray case/whitespace is still the request it says it is');
        t.equal(sidecarBackend('cpu'), 'cpu', 'setting', 'and the default stays the default');
        t.equal(sidecarBackend(undefined), 'cpu', 'setting', 'nothing at all means the CPU build');
        t.equal(sidecarBackend(''), 'cpu', 'setting', 'and so does an empty string');
        // Junk must never be read as a GPU request: a typo turning a machine onto an untested backend is the
        // one direction that cannot be defended.
        t.equal(sidecarBackend('vulkan '), 'vulkan', 'setting', 'trailing space is not a typo');
        t.equal(sidecarBackend('gpu'), 'cpu', 'setting', 'an unknown word is NOT the GPU');
        t.equal(sidecarBackend('true'), 'cpu', 'setting', 'nor is a boolean-ish value');
        t.equal(sidecarBackend('vulkans'), 'cpu', 'setting', 'nor is a near miss');

        const cfg = normalizeAssistantConfig({ backend: 'bundled', bundledBackend: 'vulkan' });
        t.equal(cfg.bundledBackend, 'vulkan', 'config', 'the config carries the choice to the process');
        t.equal(normalizeAssistantConfig({ backend: 'bundled' }).bundledBackend, 'vulkan', 'config',
            'a configuration that never mentions it runs the GPU build — the picker\'s first entry since 0.10.5 ' +
            '(asked 2026-09-17: Vulkan measured 25% faster and was right on both builds, so it is what people get)');
        t.equal(normalizeAssistantConfig({ bundledBackend: 7 }).bundledBackend, 'cpu', 'config',
            'a wrong type is the CPU build rather than a crash');
    }

    // ---------- 2) the command line ----------
    {
        const base = { modelPath: '/models/x.gguf', port: 49001, threads: 8, contextSize: 16384, gpuLayers: 0 };
        const cpu = sidecarArgs(base);
        t.equal(backendOf(cpu), 'cpu', 'argv', 'the CPU build is stated on the command line, not assumed');
        t.equal(cpu[cpu.length - 1], 'cpu', 'argv', 'and it is the last argument, like every other choice');
        t.ok(cpu.includes('--gpu-layers'), 'argv',
            'the existing flags are untouched — `--gpu-layers` is still always present (0 means CPU only)');

        const vulkan = sidecarArgs({ ...base, backend: 'vulkan', gpuLayers: 999 });
        t.equal(backendOf(vulkan), 'vulkan', 'argv', 'asking for the GPU build is one flag');
        t.equal(vulkan[vulkan.indexOf('--gpu-layers') + 1], '999', 'argv',
            'the layer count and the build are separate decisions: the build says what CAN run on the GPU');
        t.equal(vulkan.length, cpu.length, 'argv', 'the flag is added in both cases, so the two lines differ by one word');

        // The C# side must accept exactly what the extension sends: our own flag, our own spellings.
        const host = read('host/ModelHost/Program.cs');
        t.ok(/case "--backend" when next is not null: backend = NativeBackend\.Normalise\(next\)/.test(host), 'argv',
            'ModelHost parses `--backend` (the one flag on this line that is ours, not llama.cpp\'s)');
        for (const flag of ['--model', '--port', '--threads', '--ctx', '--gpu-layers']) {
            t.ok(host.includes(`case "${flag}"`), 'argv', `and still parses ${flag}`);
        }
        t.ok(/internal static class NativeBackend/.test(host) && /Normalise/.test(host), 'argv',
            'the value is normalised in C# too, so a hand-run `--backend Vulkan` works like the extension\'s');
    }

    // ---------- 3) the two attempts ----------
    {
        t.equal(sidecarAttempts('cpu').length, 1, 'attempts', 'the CPU build is tried once — there is nothing to fall back to');
        t.equal(sidecarAttempts('cpu')[0], 'cpu', 'attempts', 'and it is the CPU');
        t.equal(sidecarAttempts('vulkan'), ['vulkan', 'cpu'], 'attempts',
            'Vulkan is tried first and the CPU second: a driver that dies while loading aborts the process, and no library can catch that');
        t.equal(sidecarAttempts('vulkan').length, 2, 'attempts',
            'and never a third: if the CPU build cannot load the same file, the reason is the model, not the GPU');

        const runtime = read('src/modelRuntime.ts');
        t.ok(/const attempts = sidecarAttempts\(cfg\.bundledBackend\)/.test(runtime), 'attempts',
            'the process code asks the plan rather than deciding for itself');
        t.ok(/for \(const backend of attempts\)/.test(runtime), 'attempts', 'and walks it in order');
        t.ok(/if \(backend !== 'vulkan'\) continue;/.test(runtime), 'attempts',
            'only a failed Vulkan attempt is retried — a missing model file fails identically twice');
        t.ok(/this\.fallback = `the Vulkan build stopped while loading/.test(runtime), 'attempts',
            'the fallback is recorded, so the status can say it happened');
        // The retry must not wait for someone to click a notification: the load is what the user is waiting for.
        t.ok(/void this\.reportVulkanFallback\(why\)/.test(runtime) && !/await this\.reportVulkanFallback/.test(runtime), 'attempts',
            'the message is shown without awaiting it, so the CPU attempt starts immediately');
        t.ok(/showWarningMessage\(message, 'Use the CPU build from now on'/.test(runtime), 'attempts',
            'and the warning offers to make the fallback permanent');
        t.ok(/updateSetting\(configView\(SETTINGS\), 'bundledBackend', 'cpu'\)/.test(runtime), 'attempts',
            'which writes the setting where it already lives (0.9.35\'s rule) rather than to Global');
        t.ok(/this\.stop\(\);\s*\n\s*if \(backend !== 'vulkan'\) continue;/.test(runtime.replace(/\r/g, '')), 'attempts',
            'a failed attempt is stopped before the next one starts, so two runtimes never hold the same weights');
    }

    // ---------- 4) what the runtime is allowed to claim ----------
    {
        // The shape ModelHost answers with, captured from a real run (see the file header).
        const vulkan = parseHealth({ ok: true, loaded: true, loading: false, model: 'qwen2.5-coder-3b', backend: 'vulkan', device: 'AMD Radeon 760M Graphics (RADV PHOENIX)', error: null });
        t.equal(vulkan.ok, true, 'health', 'a loaded runtime is still `ok`');
        t.equal(vulkan.backend, 'vulkan', 'health', 'and it reports which build it actually loaded');
        t.equal(vulkan.device, 'AMD Radeon 760M Graphics (RADV PHOENIX)', 'health', 'with the device it used');
        t.equal(vulkan.error, undefined, 'health', 'a null error is no error, not the string "null"');

        const cpu = parseHealth({ ok: true, loaded: true, backend: 'cpu', device: null });
        t.equal(cpu.backend, 'cpu', 'health', 'the CPU run says CPU');
        t.equal(cpu.device, undefined, 'health', 'and has no device to name');
        // An older build of ModelHost (a user who has not rebuilt) answers without these fields: that must read
        // as "not known", never as "the CPU" and never as a lie about the GPU.
        const silent = parseHealth({ ok: true, loaded: true, model: 'x' });
        t.equal(silent.backend, undefined, 'health', 'a runtime that says nothing about its build reports nothing');
        t.equal(silent.device, undefined, 'health', 'and no device');
        t.equal(parseHealth({ backend: 'GPU' }).backend, 'cpu', 'health',
            'an unknown build name is read as the CPU, so nothing can accidentally claim the GPU');

        t.equal(nativeBackendLine('cpu'), 'Native backend: CPU build', 'line', 'the default needs no qualifier');
        t.equal(nativeBackendLine('vulkan'),
            'Native backend: Vulkan build (chosen — it starts with the next request)', 'line',
            'a chosen but not-running Vulkan build is reported as a choice, not as a fact about the machine');
        t.equal(nativeBackendLine('vulkan', { backend: 'vulkan', device: 'AMD Radeon 760M Graphics (RADV PHOENIX)' }),
            'Native backend: Vulkan build — AMD Radeon 760M Graphics (RADV PHOENIX)', 'line',
            'a running Vulkan build names the device, because "which GPU?" is the next question');
        t.equal(nativeBackendLine('vulkan', { backend: 'vulkan' }),
            'Native backend: Vulkan build', 'line', 'and copes with a runtime that named no device');
        // The sentence that matters most: the user asked for the GPU and did not get it.
        const fellBack = nativeBackendLine('vulkan', { backend: 'cpu' });
        t.ok(/Vulkan was asked for/.test(fellBack) && /CPU build/.test(fellBack), 'line',
            'a Vulkan request that llama.cpp answered with the CPU build says exactly that');
        t.equal(nativeBackendLine('cpu', { backend: 'cpu' }), 'Native backend: CPU build', 'line',
            'while a CPU request served by the CPU build is not dressed up as a fallback');

        const runtime = read('src/modelRuntime.ts');
        t.ok(/this\.native = \{ backend: health\.backend, device: health\.device \}/.test(runtime), 'line',
            'the facts come from the runtime\'s own answer, not from the setting that asked for it');
        t.ok(/lines\.push\(nativeBackendLine\(cfg\.bundledBackend, facts\.native\)\)/.test(runtime), 'line',
            'and the status prints that sentence through the one shared implementation');
        t.ok(/if \(facts\.fallback\) lines\.push\(`Note: \$\{facts\.fallback\}\.`\)/.test(runtime), 'line',
            'a GPU→CPU fallback is named in the status, not only in a notification that was dismissed');
        t.ok(/return this\.current\(\) \? this\.native : undefined/.test(runtime), 'line',
            'a stopped runtime reports nothing, so the status falls back to "chosen"');
    }

    // ---------- 5) the C# side, as source ----------
    {
        const host = read('host/ModelHost/Program.cs');
        t.ok(/\.WithCuda\(false\)/.test(host), 'host',
            'CUDA is explicitly off: two tested builds ship, and an NVIDIA machine must not take a third path');
        t.ok(/\.WithVulkan\(false\)/.test(host), 'host',
            'Vulkan is off by default, which is what keeps the default behaviour identical to before');
        t.ok(/public void PreferVulkan\(\)\s*\{\s*\n\s*NativeLibraryConfig\.All\.WithVulkan\(true\)/.test(host.replace(/\r/g, '')), 'host',
            'and turned on only by the flag');
        t.ok(/if \(options\.Backend == NativeBackend\.Vulkan\) nativeLog\.PreferVulkan\(\)/.test(host), 'host',
            'before any other llama.cpp call — the native library cannot be changed once it is loaded');
        t.ok(/\.WithAutoFallback\(true\)/.test(host), 'host',
            'fallback stays on, which is what makes "vulkan" safe on a machine without a usable device');
        t.ok(/\.WithLogCallback\(/.test(host), 'host',
            'llama.cpp\'s own log is read, because it is the only honest source for which build was loaded');
        t.ok(/private void Observe\(string line\)/.test(host), 'host',
            'the two facts are recorded AS THE LINES ARRIVE, not from a trailing buffer');
        t.ok(/internal sealed class NativeLog/.test(host) && !/_lines/.test(host), 'host',
            'there is no ring buffer left to lose the library-selection line in (it did: the first version reported CPU for a Vulkan run)');
        t.ok(/\.Contains\("\/native\/vulkan\/"\)/.test(host), 'host',
            'the build is read from the directory llama.cpp loaded the library from');
        t.ok(/backend = state\.LoadedBackend/.test(host) && /device = state\.Device/.test(host), 'host',
            '/health answers with the build and the device');
        t.ok(/MODEL_HOST_BACKEND requested=/.test(host), 'host',
            'the very first line names what was asked for, before anything loads');
        t.ok(/if \(options\.Backend == NativeBackend\.Vulkan && nativeLog\.LoadedBackend\(\) != NativeBackend\.Vulkan\)/.test(host), 'host',
            'and a Vulkan request that fell back is said out loud on stderr');

        const csproj = read('host/ModelHost/ModelHost.csproj');
        t.ok(/LLamaSharp\.Backend\.Vulkan/.test(csproj), 'host', 'the Vulkan natives are part of the build');
        t.ok(/LLamaSharp\.Backend\.Cpu/.test(csproj), 'host', 'next to the CPU ones, which stay the default');
        t.ok(/ONE build/.test(csproj), 'host',
            'one build rather than two, so a stale binary cannot lie about how it was built');
        // The package copies ~65 MB per RID into bin/: that must stay out of the VSIX and out of git.
        t.ok(/host\/\*\*\/bin\/\*\*/.test(read('.vscodeignore')), 'host', 'the VSIX ignores ModelHost\'s output');
        t.ok(/host\/\*\*\/bin\//.test(read('.gitignore')), 'host', 'and so does git');
        // An XML comment cannot contain "--": writing the flag's spelling into one broke the build outright
        // (MSB4025), and the flag has two dashes in it, so this is exactly the mistake that will be made again.
        const comments = [...csproj.matchAll(/<!--([\s\S]*?)-->/g)].map((m) => m[1]);
        t.ok(comments.length > 0, 'host', 'the csproj keeps its explanatory comments');
        for (const [i, body] of comments.entries()) {
            t.ok(!body.includes('--'), 'host', `comment #${i + 1} has no double hyphen in it (MSB4025 if it does)`);
        }
    }

    // ---------- 6) the front doors ----------
    {
        const manifest = JSON.parse(read('package.json'));
        const props = manifest.contributes.configuration.properties;
        const setting = props['avaloniaDesigner.assistant.bundledBackend'];
        t.ok(!!setting, 'manifest', 'the setting exists');
        t.equal(setting.enum, ['vulkan', 'cpu'], 'manifest', 'with exactly two values, the GPU one first');
        t.equal(setting.default, 'vulkan', 'manifest',
            'and the GPU build is the default since 0.10.5 (asked 2026-09-17) — the picker\'s first entry and the ' +
            'setting agree, so an unconfigured install and the entry it looks at cannot disagree');
        t.ok(/falls back to the CPU/.test(setting.enumDescriptions[0]), 'manifest',
            'the Vulkan entry says the fallback exists, where the choice is made');
        t.ok(/no usable device|falls back to the CPU/.test(setting.markdownDescription), 'manifest',
            'and the setting itself repeats that asking is a request, not a guarantee — a machine without Vulkan ' +
            'must not be left believing it has been moved onto a backend that cannot run');
        t.ok(/does not affect LM Studio or your own `llama-server`/.test(setting.markdownDescription), 'manifest',
            'and that it is about the built-in runtime only — the other two runtimes are not this extension\'s build');
        t.equal(props['bundledBackend'], undefined, 'manifest',
            'sanity: settings are keyed by their full name, so a rename here cannot pass by accident');

        const commands = manifest.contributes.commands.map((c) => c.command);
        t.ok(commands.includes('avaloniaDesigner.assistant.chooseBackend'), 'manifest', 'the command is declared');
        const declared = manifest.contributes.commands.find((c) => c.command === 'avaloniaDesigner.assistant.chooseBackend');
        t.equal(declared.title, 'AI: Built-in Runtime Backend…', 'manifest',
            'with the title the panel\'s hint sends the user to — the two strings must match');
        const palette = manifest.contributes.menus.commandPalette.map((m) => m.command);
        t.ok(palette.includes('avaloniaDesigner.assistant.chooseBackend'), 'manifest', 'and it is in the palette');

        const ext = read('src/extension.ts');
        t.ok(/registerCommand\('avaloniaDesigner\.assistant\.chooseBackend', \(\) => chooseBundledBackend\(\)\)/.test(ext), 'wiring',
            'the command is registered');

        const ui = read('src/assistantUi.ts');
        t.ok(/export async function chooseBundledBackend\(\)/.test(ui), 'wiring',
            'the flow lives with the other palette flows');
        t.ok(/bundledBackend: sidecarBackend\(cfg\.get<string>\('bundledBackend', 'vulkan'\)\)/.test(ui), 'wiring',
            'the one config reader every AI path shares knows the setting');
        t.ok(/if \(!pick \|\| pick\.value === current\) return/.test(ui), 'wiring', 'choosing what is already set changes nothing');
        t.ok(/const wasRunning = bundledRuntimeRunning\(\)\.running;/.test(ui), 'wiring',
            'and a running runtime is noticed, because it was started with the old flag');
        t.ok(/if \(wasRunning\) stopModelServer\(\)/.test(ui), 'wiring',
            'so it is stopped rather than left answering with the build the user just replaced');
        t.ok(/names the build that is actually running/.test(ui), 'wiring',
            'and the message says where the truth can be read');

        // The answer comes from the runtime, which is the only way the panel can say "max" is or is not a promise.
        const panel = read('src/aiPanel.ts');
        t.ok(/bundledBackend: sidecarBackend\(cfg\.get<string>\('bundledBackend', 'vulkan'\)\)/.test(panel), 'wiring',
            'the ⚙ panel state carries the choice');
        t.ok(/bundledBackend: SidecarBackend;/.test(panel), 'wiring', 'as a typed field of that state');
        const js = read('media/designer.js');
        t.ok(/aiState && aiState\.bundledBackend === 'vulkan'/.test(js), 'wiring',
            'the webview branches on it for the GPU-offload hint only — no new row, so the dialog keeps its height');
        t.ok(/"max" needs the Vulkan build/.test(js) && /AI: Built-in Runtime Backend/.test(js), 'wiring',
            'the CPU build says "max" cannot offload and names the command that changes it');
        t.ok(/a layer count, not a ratio/.test(js), 'wiring',
            'and the Vulkan build keeps the "layer count, not a ratio" explanation, which is only true there');
        // The hint column is ~235px wide (measured in Chromium 2026-09-16), which takes ~100 characters at
        // 11px. The sentence this replaced was 115 characters and therefore wrapped to THREE lines, and a third
        // line is 12px of a dialog whose last row was already behind a scroll. jsdom has no layout engine, so
        // the wording is pinned literally and the length is pinned as the proxy for the measurement.
        const measured = [
            ['"max" needs the Vulkan build — this is the CPU build (AI: Built-in Runtime Backend…).', 'CPU build'],
            ['max = all layers on the GPU (a layer count, not a ratio) — the built-in runtime is the Vulkan build.', 'Vulkan build']
        ];
        for (const [text, which] of measured) {
            t.ok(js.includes(text), 'layout', `the ${which} hint is the exact sentence that was measured to fit two lines`);
            t.ok(text.length <= 100, 'layout',
                `and stays within 100 characters (${which}: ${text.length}) — the 3rd line costs 12px this dialog has not got`);
        }
    }

    // ---------- 7) the panel state, as data ----------
    {
        // Asserted against the COMPILED object literal, not just the interface: the webview reads this field
        // on every state, and "the type has it" is not the same claim as "the object carries it".
        const compiled = read('out/aiPanel.js');
        t.ok(/bundledBackend:[\s\S]{0,90}?sidecarBackend[\s\S]{0,60}?'bundledBackend', 'vulkan'/.test(compiled), 'state',
            'the state the ⚙ panel receives carries the choice');
        // `panelState()` itself is deliberately NOT called here: it runs the LM Studio CLI and probes the local
        // ports, so its output depends on what this machine happens to be running — which is not a test of this
        // code (the same reason 0.9.42 patches that probe instead of depending on it).
        t.ok(/export async function panelState/.test(read('src/aiPanel.ts')), 'state',
            'the function is still the one state builder — the field rides along with everything else');
    }

    // ---------- 8) the entry decides the offload too (asked 2026-09-17) ----------
    {
        const panel = read('src/aiPanel.ts');
        // What this pins, measured on the user's machine the same evening: ModelHost's own command line read
        // `--gpu-layers 0` while the picker said "GPU (Vulkan)" and the status said "Native backend: Vulkan
        // build — AMD Radeon 760M". Both were true and the work was 100% CPU, because `sidecarGpuLayers` turns
        // only `max` into a layer count and everything else — `auto` included — into 0.
        t.ok(/const wantedGpu = spec\.backend \? \(spec\.backend === 'cpu' \? 'off' : 'max'\) : undefined;/.test(panel), 'entry',
            'the shipped GPU entry asks for every layer and the CPU entry for none');
        t.ok(/if \(wantedGpu\) \{[\s\S]{0,400}?cfg\.update\('loadGpu', wantedGpu/.test(panel), 'entry',
            'and that is written to the setting the runtime is started from');
        t.ok(/GPU offload \$\{beforeGpu\} → \$\{wantedGpu\} \(from the entry\)/.test(panel), 'entry',
            'with the change logged, so "why is this running on the CPU?" is answerable afterwards');
        t.ok(/startBundled\(wantedGpu \? \{ \.\.\.request, gpu: wantedGpu \} : request/.test(panel), 'entry',
            'the load in progress uses the entry\'s answer too — the webview sent the old field a moment earlier, '
            + 'so reading it back would have offloaded nothing until the next load');
        t.ok(/guessing `max` for a 16 GB[\s\S]{0,90}?model on a shared-memory GPU/.test(panel), 'entry',
            'while a model the user added keeps their own field: its size is unknown to us, and `max` for a '
            + '16 GB model on a shared-memory GPU is the mistake that setting exists to avoid');
    }
};