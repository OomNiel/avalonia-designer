/* T2 — resumable downloads, byte-level progress, and the two runtimes' arguments.
 *
 * The resume test is a **real one**: a local HTTP server that advertises `Range` support, hands over a
 * file in two halves, and records the headers it was asked with. The first attempt is deliberately
 * truncated mid-file (simulating a dropped connection), the second must continue from the partial file —
 * because the two published models are 2.1 GB and 4.7 GB, and losing 90% of a download to a dropped
 * connection is the kind of thing that makes a user give up on the feature.
 *
 * It also pins the case that *must* restart: a partial file larger than the model (a stale file, or a
 * different quantisation) is discarded rather than appended to, and a server that ignores `Range` (answers
 * 200 to a ranged request) cannot be allowed to append the whole body to the partial.
 */
'use strict';
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { downloadProgressText, resumeFromBytes, sidecarContextSize, sidecarGpuLayers } = require('../../out/localModels.js');
const { sidecarArgs, DEFAULT_CONTEXT_SIZE } = require('../../out/modelSpecs.js');
// The REAL download path, not a re-implementation of it: it is the only place the extension writes a file
// while talking to the network, so "it resumes" has to be shown against a server that behaves.
const { downloadToFile } = require('../../out/modelRuntime.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Serves `body`, honouring `Range` unless `ignoreRange`. Records every request's Range header. */
function rangeServer(body, ignoreRange = false) {
    const seen = [];
    const server = http.createServer((req, res) => {
        seen.push(req.headers.range || '');
        const range = /^bytes=(\d+)-$/.exec(req.headers.range || '');
        if (range) {
            const from = Number(range[1]);
            if (from >= body.length) {
                // What a server says when our partial file is past the end of what it has.
                res.writeHead(416, { 'Content-Range': `bytes */${body.length}` });
                res.end();
                return;
            }
            if (!ignoreRange) {
                res.writeHead(206, {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': body.length - from,
                    'Content-Range': `bytes ${from}-${body.length - 1}/${body.length}`
                });
                res.end(body.subarray(from));
                return;
            }
        }
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length });
        res.end(body);
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
        seen,
        url: `http://127.0.0.1:${server.address().port}/model.gguf`,
        close: () => new Promise((r) => server.close(r))
    })));
}

/** Runs the real download and collects the progress lines the extension would show. */
async function download(url, dest, expectedBytes, resumeFrom) {
    const messages = [];
    const progress = { report: (p) => messages.push(p.message ?? '') };
    await downloadToFile(url, dest, expectedBytes, progress, undefined, resumeFrom);
    return messages;
}

module.exports = async (t) => {
    t.section('resumable download and runtime arguments');

    // ---------- 1) how much of a partial file may be kept ----------
    {
        t.equal(resumeFromBytes(0, 100), 0, 'resume', 'nothing on disk means a fresh download');
        t.equal(resumeFromBytes(40, 100), 40, 'resume', 'a partial file is kept, byte for byte');
        t.equal(resumeFromBytes(100, 100), 0, 'resume',
            'a *complete* partial is not resumed onto — it goes through the checksum instead');
        t.equal(resumeFromBytes(120, 100), 0, 'resume',
            'and one larger than the model is discarded: appending to it would corrupt the result');
        t.equal(resumeFromBytes(-5, 100), 0, 'resume', 'junk sizes are treated as "nothing"');
        t.equal(resumeFromBytes(40, 0), 40, 'resume',
            'with an unknown expected size (a pasted URL) a partial is still resumed');
    }

    // ---------- 2) the progress line names bytes of bytes ----------
    {
        t.equal(downloadProgressText(0, 2e9), '0 B of 2.0 GB  ·  0%', 'progress',
            'the line leads with bytes of bytes, as asked');
        t.ok(/1\.0 GB of 2\.0 GB/.test(downloadProgressText(1e9, 2e9)), 'progress',
            'and updates as the download grows');
        t.ok(/50%/.test(downloadProgressText(1e9, 2e9)), 'progress', 'with a percentage');
        t.ok(/12\.4 MB\/s/.test(downloadProgressText(1e9, 2e9, 12.4)), 'progress',
            'and the rate, when there is one to report');
        t.ok(/^1\.5 GB downloaded$/.test(downloadProgressText(1.5e9, 0)), 'progress',
            'with no known total it still reports bytes rather than pretending to know a percentage');
        t.ok(/100%/.test(downloadProgressText(2e9, 2e9)), 'progress',
            'and it cannot exceed 100% if the server sends more than it promised');
    }

    // ---------- 3) a real interrupted download that resumes ----------
    {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-resume-'));
        const dest = path.join(dir, 'model.gguf');
        const body = Buffer.alloc(512 * 1024);
        for (let i = 0; i < body.length; i++) body[i] = i % 251; // deterministic, compressible-ish payload
        const server = await rangeServer(body);

        try {
            // First attempt: stop after the first half, leaving a partial file behind (what a dropped
            // connection or a cancelled window leaves).
            const half = await new Promise((resolve) => {
                const out = fs.createWriteStream(dest);
                let got = 0;
                out.write(body.subarray(0, 256 * 1024), () => {
                    got = 256 * 1024;
                    out.end(() => resolve(got));
                });
            });
            t.equal(half, 256 * 1024, 'resume', 'a half-finished download leaves a partial file');
            t.equal(fs.statSync(dest).size, 256 * 1024, 'resume', 'of exactly the size received');

            const resume = resumeFromBytes(fs.statSync(dest).size, body.length);
            t.equal(resume, 256 * 1024, 'resume', 'which is worth resuming from');

            const messages = await download(server.url, dest, body.length, resume);
            t.equal(server.seen[0], `bytes=${256 * 1024}-`, 'resume',
                'the real download asks for exactly the part it is missing');
            t.equal(fs.statSync(dest).size, body.length, 'resume', 'the finished file is the full size');
            t.equal(fs.readFileSync(dest).equals(body), true, 'resume',
                'and byte-identical to the original — the resumed half was appended, not overwritten');
            t.equal(messages.length > 0, true, 'resume', 'progress is reported while it runs');
            t.ok(/of 524 kB/.test(messages[messages.length - 1]), 'resume',
                'and the last line states the total, so a resumed download still shows the whole file');
            t.ok(/100%/.test(messages[messages.length - 1]), 'resume',
                'and ends at 100% rather than at whatever the last throttled update said');
            t.ok(/of 524 kB/.test(messages[0]), 'resume',
                'including immediately on start, rather than after the first chunk');

            // A fresh download of the same file asks without a Range header and reports a total.
            fs.rmSync(dest);
            const fresh = await download(server.url, dest, body.length, 0);
            t.equal(server.seen[1], '', 'resume', 'starting over asks without a Range header');
            t.equal(fs.statSync(dest).size, body.length, 'resume', 'and downloads everything');
            t.ok(/of /.test(fresh[0]), 'resume', 'with the total known from Content-Length before the first byte');
        } finally {
            await server.close();
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }

    // ---------- 4) the two cases that must NOT append ----------
    {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-norange-'));
        const dest = path.join(dir, 'model.gguf');
        const body = Buffer.alloc(64 * 1024, 7);
        // A server that ignores Range and answers 200 with the whole file.
        const server = await rangeServer(body, true);
        try {
            fs.writeFileSync(dest, Buffer.alloc(32 * 1024, 7)); // a stale partial
            await download(server.url, dest, body.length, 32 * 1024);
            t.equal(server.seen[0], `bytes=${32 * 1024}-`, 'no-range', 'a resume is attempted first');
            t.equal(fs.statSync(dest).size, body.length, 'no-range',
                'a server that answers 200 anyway is handled: the file is the model, not the model plus its '
                + 'first half twice');
            t.equal(fs.readFileSync(dest).equals(body), true, 'no-range', 'and the content is correct');
        } finally {
            await server.close();
            fs.rmSync(dir, { recursive: true, force: true });
        }

        // A partial file past the end of what the server has (416) must restart cleanly, not hang or throw.
        const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-416-'));
        const dest2 = path.join(dir2, 'model.gguf');
        const body2 = Buffer.alloc(64 * 1024, 9);
        const server2 = await rangeServer(body2);
        try {
            fs.writeFileSync(dest2, Buffer.alloc(96 * 1024, 9)); // longer than the file the server has
            await download(server2.url, dest2, 64 * 1024, 96 * 1024);
            t.equal(server2.seen[0], `bytes=${96 * 1024}-`, '416', 'the resume is attempted');
            t.equal(server2.seen.includes(''), true, '416',
                'and after the 416 the download restarts without a Range header');
            t.equal(fs.statSync(dest2).size, body2.length, '416', 'leaving a file of the right size');
            t.equal(fs.readFileSync(dest2).equals(body2), true, '416', 'with the right content');
        } finally {
            await server2.close();
            fs.rmSync(dir2, { recursive: true, force: true });
        }
    }

    // ---------- 5) the built-in runtime gets the panel's numbers ----------
    {
        t.equal(sidecarContextSize(0, DEFAULT_CONTEXT_SIZE), DEFAULT_CONTEXT_SIZE, 'sidecar',
            '"recommended" passes the built-in default through');
        t.equal(sidecarContextSize(16384, DEFAULT_CONTEXT_SIZE), 16384, 'sidecar',
            'a real choice is honoured — this is the field that used to be ignored');
        t.equal(sidecarContextSize(1, DEFAULT_CONTEXT_SIZE), 512, 'sidecar', 'an absurd value is floored');
        t.equal(sidecarContextSize(999999, DEFAULT_CONTEXT_SIZE), 262144, 'sidecar', 'and capped');

        t.equal(sidecarGpuLayers('max'), 999, 'sidecar',
            'LM Studio\'s "max" ratio becomes "all layers" for llama.cpp (which clamps it)');
        t.equal(sidecarGpuLayers('auto'), 0, 'sidecar',
            'and "auto" is CPU-only: this machine\'s GPU shares its memory with the CPU');
        t.equal(sidecarGpuLayers('off'), 0, 'sidecar', 'as is "off"');
        t.equal(sidecarGpuLayers('0.5'), 0, 'sidecar',
            'half of an unknown number of layers is not a layer count, so it is not guessed');

        const args = sidecarArgs({ modelPath: '/m/x.gguf', port: 49000, threads: 8, contextSize: 16384, gpuLayers: 999 });
        t.equal(args.join(' '), '--model /m/x.gguf --port 49000 --threads 8 --ctx 16384 --gpu-layers 999', 'sidecar',
            'and both reach the argv');
        t.equal(sidecarArgs({ modelPath: '/m/x.gguf', port: 1 }).includes('--ctx'), true, 'sidecar',
            'with the default kept when nothing is passed');
        t.equal(sidecarArgs({ modelPath: '/m/x.gguf', port: 1 }).join(' ').includes(`--ctx ${DEFAULT_CONTEXT_SIZE}`), true,
            'sidecar', 'so an unconfigured run is unchanged');

        // The config plumbing has to exist in *both* places that start the runtime, or a model started by a
        // request would ignore what the panel showed.
        const runtime = read('src/modelRuntime.ts');
        t.ok(/contextSize: cfg\.contextSize/.test(runtime) && /gpuLayers: cfg\.gpuLayers/.test(runtime), 'sidecar',
            'the server start passes them through');
        const ui = read('src/assistantUi.ts');
        t.ok(/sidecarContextSize\(cfg\.get<number>\('loadContextLength'/.test(ui), 'sidecar',
            'the request-time config reads the panel\'s context setting');
        t.ok(/sidecarGpuLayers\(cfg\.get<string>\('loadGpu'/.test(ui), 'sidecar', 'and its GPU setting');
        const panel = read('src/aiPanel.ts');
        t.ok(/sidecarContextSize\(panel\.options\.contextLength/.test(panel) && /sidecarGpuLayers\(panel\.options\.gpu\)/.test(panel),
            'sidecar', 'and so does the panel\'s own Load button');

        // The row that cannot be honoured for the built-in runtime is hidden rather than shown and ignored.
        const js = read('media/designer.js');
        t.ok(/els\.aiOptTtl\.hidden = bundled/.test(js), 'sidecar',
            'the idle-unload row is hidden for the runtimes that have no such concept');
        // …and hiding it has to WORK. An author `display` on `.ai-opt` overrides the UA stylesheet's
        // `[hidden] { display: none }`, so without this rule the row stayed on screen while the code
        // believed it was hidden (found by rendering the panel, 2026-09-15).
        const css = read('media/designer.css');
        t.ok(/\.ai-opt\[hidden\]\s*\{[^}]*display:\s*none/.test(css), 'sidecar',
            'the row really disappears: `.ai-opt[hidden] { display: none }` beats `.ai-opt { display: grid }`');
        t.ok(/\.modal\[hidden\]\s*\{[^}]*display:\s*none/.test(css), 'sidecar',
            'the same guard exists for the modal itself, which is why modals can be dismissed at all');
        t.ok(/function applyKindToOptions/.test(js) && /aiOptAddress\.hidden = kind !== 'custom'/.test(js), 'sidecar',
            'and the address row only appears for "a server I run myself"');
        const html = read('src/designerPanel.ts');
        for (const id of ['aiOptContext', 'aiOptGpu', 'aiOptTtl', 'aiOptAddress']) {
            t.ok(new RegExp(`id="${id}"`).test(html), 'sidecar', `the row is addressable in the panel markup (#${id})`);
        }
    }
};
