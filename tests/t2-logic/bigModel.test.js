/* T2 — the 30 B step-up: when the small model gives up, what is offered, and what is refused.
 *
 * WHY THIS FILE EXISTS (asked 2026-09-17). *"We know we may need something better if the Qwen cant fix the
 * current issues. When it fails the system must ask the user if it should re-try a fix with the 30B model. If
 * the user agree the system should unload the Qwen and then automatically start the llama server and load the
 * 30B weigths, and attempt the fix. The user must stay informed all the time."*
 *
 * Nothing here starts a server or writes a weight: the *decision* is pure (`parseExecStartModel`,
 * `bigModelOffer`) and is proved against a real unit's text and real file sizes, and the *sequence* — unload
 * first, then start, announcing each step — is asserted against the source, because the order is the part that
 * would wedge a 28 GB machine if it were wrong.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseExecStartModel, bigModelOffer } = require('../../out/bigModel.js');
const { MODEL_SPECS } = require('../../out/modelSpecs.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** This machine's own unit, verbatim — including the nine-line `ExecStart` that a naive parser misses. */
const UNIT = `[Unit]
Description=llama.cpp Qwen3-Coder Local Server
After=default.target

[Service]
Type=simple

ExecStart=/home/niel/llama.cpp/build/bin/llama-server \\
    -m /home/niel/.cache/huggingface/hub/models--n00b001--Qwen3-Coder-30B-A3B-Instruct-Q4_K_S-GGUF/snapshots/2d796cff/qwen3-coder-30b-a3b-instruct-q4_k_s.gguf \\
    --device none \\
    -c 16384 \\
    -np 1 \\
    -ngl 0 \\
    -nr \\
    --host 127.0.0.1 \\
    --port 8080 \\
    --alias qwen3-coder-local

Restart=on-failure

[Install]
WantedBy=default.target
`;

module.exports = async (t) => {
    t.section('T2: the 30B step-up');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'big-model-'));
    const GB = 1024 ** 3;
    /** A file of a given size without writing the bytes: sparse, so the test costs no disk. */
    const sized = (name, gb) => {
        const p = path.join(dir, name);
        fs.writeFileSync(p, '');
        fs.truncateSync(p, Math.round(gb * GB));
        return p;
    };
    try {
        // ---------- which model a unit serves ----------
        {
            const model = parseExecStartModel(UNIT);
            t.ok(!!model && /qwen3-coder-30b-a3b-instruct-q4_k_s\.gguf$/.test(model), 'unit',
                'the .gguf a unit serves is read from its ExecStart — over nine continuation lines');
            t.ok(model.startsWith('/home/niel/.cache'), 'unit', 'and the path is the one the unit names, not a guess');
            t.equal(parseExecStartModel('[Service]\nExecStart=/usr/bin/true\n'), undefined, 'unit',
                'a unit that starts something else names no model');
            t.equal(parseExecStartModel('[Service]\nExecStartPre=/usr/bin/llama-server --version\nExecStart=/usr/bin/true\n'),
                undefined, 'unit', 'and ExecStartPre is not ExecStart');
            t.equal(parseExecStartModel(''), undefined, 'unit', 'no text is no answer');
        }

        // ---------- is it worth offering? ----------
        {
            const local = sized('local.gguf', 4.4);
            const big = sized('big.gguf', 19);
            const text = `[Service]\nExecStart=/usr/bin/llama-server -m ${big}\n`;
            const localBytes = fs.statSync(local).size;

            const yes = bigModelOffer({ unit: 'llama-server.service', unitText: text, localBytes, freeGb: 24 });
            t.equal(yes.ok, true, 'offer', 'a 19 GB model behind the unit is a step up from the local 4.4 GB one');
            t.equal(yes.sizeGb, 19, 'offer', 'and its size is reported, so the question can state the cost');
            t.equal(yes.modelPath, big, 'offer', 'with the file the escalation will serve');

            // Same weights, or only slightly bigger: not worth a minute of loading.
            const sameText = `[Service]\nExecStart=/usr/bin/llama-server -m ${sized('same.gguf', 4.4)}\n`;
            const same = bigModelOffer({ unit: 'llama-server.service', unitText: sameText, localBytes, freeGb: 24 });
            t.equal(same.ok, false, 'offer', 'a unit serving the same size is not a step up');
            t.ok(/not a step up/.test(same.why), 'offer', 'and the reason says so, rather than pretending');

            // The trap of the day: 19 GB that does not fit, on a machine that had just wedged for exactly this.
            const tight = bigModelOffer({ unit: 'llama-server.service', unitText: text, localBytes, freeGb: 10 });
            t.equal(tight.ok, false, 'offer', 'a model that would not fit in the memory it needs is not offered');
            t.ok(/would not fit/.test(tight.why), 'offer', 'the reason names the memory, which is what the user must free');
            const running = bigModelOffer({ unit: 'llama-server.service', unitText: text, localBytes, freeGb: 1, running: true });
            t.equal(running.ok, true, 'offer', 'a unit that is already answering needs no memory, so it is offered');

            // Nothing to offer, each for its own reason.
            t.equal(bigModelOffer({ unitText: text, localBytes, freeGb: 24 }).ok, false, 'offer',
                'no unit is no offer');
            t.equal(bigModelOffer({ unit: 'u.service', localBytes, freeGb: 24 }).ok, false, 'offer',
                'no unit text is no offer');
            t.equal(bigModelOffer({ unit: 'u.service', unitText: '[Service]\nExecStart=/usr/bin/true\n', localBytes, freeGb: 24 }).ok,
                false, 'offer', 'a unit with no .gguf is no offer');
            const gone = bigModelOffer({
                unit: 'u.service',
                unitText: `[Service]\nExecStart=/usr/bin/llama-server -m ${path.join(dir, 'nope.gguf')}\n`,
                localBytes,
                freeGb: 24
            });
            t.equal(gone.ok, false, 'offer', 'a model file that is not on disk is no offer');
            t.ok(/not on disk/.test(gone.why), 'offer', 'and says which file it looked for');
        }

        // ---------- what the local model is, and how the offer is made ----------
        {
            t.equal(MODEL_SPECS.length, 2, 'local', 'the local models are the two 7B entries');
            const panel = read('src/designerPanel.ts');
            t.ok(/first\.stoppedBecause === 'clean' \|\| !panel\.visible\) return;/.test(panel), 'wiring',
                'the 30B is only offered when a repair run ended WITHOUT a clean build');
            t.ok(/offerBigModelRetry\(panel, first, once\)/.test(panel), 'wiring',
                'and once, with the same loop as the retry — never a loop of offers');
            t.ok(/cfg\.get<string>\('assistant\.backend', 'off'\) !== 'bundled'\) return undefined;/.test(panel), 'wiring',
                'only when the small local model is what failed — an external or big model is already in use');
            t.ok(/const resolved = await resolveLlamaUnit\(\);[\s\S]{0,700}unitIsActive\(resolved\.unit\)[\s\S]{0,300}unitText: resolved\.unit \? llamaUnitText\(resolved\.unit\)/.test(panel), 'wiring',
                'the unit is the setting first and discovery second — never this machine\'s name hardcoded in code');
            t.ok(/freeGb,\s*\n\s*running\s*\n\s*\}\)/.test(panel), 'wiring',
                'a unit that is already up is passed as running, so the offer does not ask for memory it has spent');
            t.ok(/\(running[\s\S]{0,500}which is already running/.test(panel), 'wiring',
                'and the question then says it is already running instead of promising a minute of loading ' +
                "(measured 2026-09-17: the offer refused itself twice, with the 30 B up and resident in swap)");
            const llama = read('src/llamaService.ts');
            t.ok(/export async function unitIsActive\(unit: string\)[\s\S]{0,180}systemctl', \['--user', 'is-active'/.test(llama), 'wiring',
                'and is-active is asked in one place, so "already up" means the same thing to the start path and ' +
                'to the offer');
            t.ok(/const active = await unitIsActive\(unit\);/.test(llama), 'wiring',
                'the start path uses it too — a unit that is active but silent is the case that needed restarting');
            t.ok(/showWarningMessage\([\s\S]{0,1200}'Use the 30B', 'No'/.test(panel), 'wiring',
                'the user is asked, with the cost in the question, before anything is started');
            t.ok(/\/proc\/meminfo[\s\S]{0,200}MemAvailable/.test(panel), 'wiring',
                'free memory is read as MemAvailable — MemFree would refuse an offer that fits, because a machine '
                + 'that has just unloaded a model holds its memory as cache');
            t.ok(/30B step-up declined by the user/.test(panel), 'wiring', 'a declined offer is logged and nothing else happens');

            const big = read('src/bigModel.ts');
            t.ok(/if \(bundledRuntimeRunning\(\)\.running\) \{[\s\S]{0,400}stopModelServer\(\);/.test(big), 'wiring',
                'the local model is unloaded FIRST — the order is what makes room for 19 GB');
            t.ok(/startLlamaServerByChoice\('unit', \{ onProgress: opts\.onStep \}\)/.test(big), 'wiring',
                'then the unit is started through the same path the panel\'s Start server button uses');
            t.ok(/onStep\('unloading the 7B to make room for the big model…'\)/.test(big), 'wiring',
                'and every step is announced, starting with the unload');
            t.ok(/Code Fix · 30B: \$\{message\}/.test(panel) && /type: 'aiProgress', message/.test(panel), 'wiring',
                'the steps reach the status bar *and* the panel\'s own progress line, so the user is never '
                + 'watching a frozen dialog');
            t.ok(/asking it to fix the rest…/.test(panel), 'wiring', 'and the retry says what it is doing');
        }
    } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
};
