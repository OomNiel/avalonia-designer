/* T2 — local AI assist (tier 1): settings normalisation, the hardware gate, the prompts, the output
 * parser, the span maths and the HTTP client.
 *
 * No model is involved anywhere: the client is driven against a throwaway `http` server on an ephemeral
 * port, which is enough to cover streaming, a server that ignores `stream: true`, an error status, a
 * dead port and the model list. That keeps the suite deterministic — the model itself is the one thing
 * that cannot be tested, and the design keeps it at the edge for exactly that reason.
 */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const {
    DEFAULT_ENDPOINT,
    MIN_RAM_GB,
    MAX_METHOD_LINES,
    assessHardware,
    assistantEnabled,
    buildFixPrompt,
    buildImplementPrompt,
    chat,
    describeModel,
    detectEol,
    extractCode,
    looksLikeEmbeddingModel,
    methodTooLong,
    normalizeAssistantConfig,
    normalizeEndpoint,
    parseChatCompletion,
    parseSseDelta,
    probeServer,
    reindent,
    spliceMethod
} = require('../../out/assistant.js');
const { enclosingMethod, methodsIn } = require('../../out/codeBehindCheck.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Starts a server for one test and hands back its endpoint plus a closer. */
function serve(handler) {
    const server = http.createServer(handler);
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({
                endpoint: `http://127.0.0.1:${port}/v1`,
                close: () => new Promise((done) => server.close(done))
            });
        });
    });
}

const sse = (chunks) =>
    chunks.map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`).join('') +
    'data: [DONE]\n\n';

module.exports = async (t) => {
    t.section('assistant (local AI, tier 1)');

    // ---------- 1) settings ----------
    {
        const dflt = normalizeAssistantConfig({});
        t.equal(dflt.backend, 'off', 'config', 'the feature is off until it is switched on');
        t.equal(dflt.endpoint, DEFAULT_ENDPOINT, 'config', 'an empty endpoint means the LM Studio default');
        t.equal(assistantEnabled(dflt), false, 'config', 'and "off" means disabled');

        const external = normalizeAssistantConfig({ backend: 'external', endpoint: 'http://127.0.0.1:1234' });
        t.equal(external.endpoint, 'http://127.0.0.1:1234/v1', 'config', '/v1 is appended when missing');
        t.equal(assistantEnabled(external), true, 'config', 'external + endpoint = enabled');
        t.equal(normalizeEndpoint('http://h:1234/v1/'), 'http://h:1234/v1', 'config', 'trailing slashes are dropped');
        t.equal(normalizeEndpoint('http://h:11434/v1'), 'http://h:11434/v1', 'config', 'an existing /v1 is kept');
        t.equal(normalizeEndpoint('   '), DEFAULT_ENDPOINT, 'config', 'blank falls back to the default');

        const clamped = normalizeAssistantConfig({ timeoutSeconds: 9999, maxTokens: 1, temperature: 5 });
        t.equal(clamped.timeoutSeconds, 600, 'config', 'a silly timeout is clamped');
        t.equal(clamped.maxTokens, 64, 'config', 'so is a tiny token budget');
        t.equal(clamped.temperature, 1, 'config', 'and the temperature');
        const junk = normalizeAssistantConfig({ timeoutSeconds: 'abc', maxTokens: null, temperature: '0.7' });
        t.equal(junk.timeoutSeconds, 60, 'config', 'junk keeps the default');
        t.equal(junk.maxTokens, 900, 'config', 'ditto');
        t.equal(junk.temperature, 0.7, 'config', 'but a numeric string is accepted');

        // The pure core must stay free of `vscode`, or the whole test story above collapses.
        const core = read('src/assistant.ts');
        t.ok(!/from 'vscode'|require\('vscode'\)/.test(core), 'config',
            'the assistant core has no VS Code dependency (that is what makes it testable)');
    }

    // ---------- 2) the hardware gate ----------
    {
        const good = { arch: 'x64', cpuCount: 12, totalRamGb: 28, freeRamGb: 17, hasAvx2: true, platform: 'linux' };
        const g = assessHardware(good);
        t.equal(g.ok, true, 'hardware', 'a 28 GB / 12 thread x64 machine is fine');
        t.equal(g.level, 'good', 'hardware', 'and reports "good"');
        t.ok(g.reasons.join(' ').includes('28 GB'), 'hardware', 'the reason names the machine');

        const noAvx2 = assessHardware({ ...good, hasAvx2: false });
        t.equal(noAvx2.ok, false, 'hardware', 'no AVX2 -> the feature is disabled');
        t.equal(noAvx2.level, 'none', 'hardware', 'level none');
        t.ok(/AVX2/.test(noAvx2.reasons[0]), 'hardware', 'and says why');

        const small = assessHardware({ ...good, totalRamGb: MIN_RAM_GB - 1 });
        t.equal(small.ok, false, 'hardware', `under ${MIN_RAM_GB} GB of RAM -> disabled`);
        const busy = assessHardware({ ...good, freeRamGb: 1 });
        t.equal(busy.ok, false, 'hardware', 'nothing free to load a model into -> disabled, not slow');
        t.ok(/free right now/.test(busy.reasons[0]), 'hardware', 'with an actionable reason');
        const fewCores = assessHardware({ ...good, cpuCount: 2 });
        t.equal(fewCores.ok, false, 'hardware', 'two threads is not enough');
        const arm = assessHardware({ ...good, arch: 'arm' });
        t.equal(arm.ok, false, 'hardware', 'a 32-bit CPU is refused');
        const minimal = assessHardware({ ...good, totalRamGb: 9, freeRamGb: 4, cpuCount: 4 });
        t.equal(minimal.level, 'minimal', 'hardware', '9 GB / 4 threads is "minimum only"');
        t.ok(/minimum/.test(minimal.reasons.join(' ')), 'hardware', 'and says what to expect');
    }

    // ---------- 3) prompts ----------
    {
        const header = 'using Avalonia.Controls;\nnamespace Proj;\npublic partial class Form1 : Window\n}';
        const method = '    private void Button1_Click(object? s, RoutedEventArgs e)\n    {\n    }';
        const fix = buildFixPrompt({
            language: 'cs', finding: 'Handler missing\nno such method', method, header, sibling: '    private void Other() { }'
        });
        t.equal(fix.length, 2, 'prompt', 'a system message plus one user message');
        t.equal(fix[0].role, 'system', 'prompt', 'the system message comes first');
        t.ok(/complete, compilable methods/.test(fix[0].content), 'prompt', 'it states the contract');
        t.ok(/C#/.test(fix[1].content), 'prompt', 'the language is named');
        t.ok(fix[1].content.includes('Handler missing'), 'prompt', 'the finding text is included verbatim');
        t.ok(fix[1].content.includes('Button1_Click'), 'prompt', 'and the method to rewrite');
        t.ok(fix[1].content.includes('using Avalonia.Controls;'), 'prompt', 'the header gives context');
        t.ok(fix[1].content.includes('private void Other()'), 'prompt', 'the sibling is offered as a style reference');
        t.ok(/COMPLETE replacement/.test(fix[1].content), 'prompt', 'the answer format is spelled out');
        t.ok(/Do not add usings/.test(fix[1].content), 'prompt', 'and what not to do');

        const impl = buildImplementPrompt({ language: 'vb', description: 'clear the TextBoxes', method: '    Private Sub Btn_Click()\n    End Sub', header: 'Imports Avalonia.Controls' });
        t.ok(/VB.NET/.test(impl[1].content), 'prompt', 'VB is labelled as VB');
        t.ok(impl[1].content.includes('clear the TextBoxes'), 'prompt', 'the developer description is quoted');
        t.ok(!/style reference/.test(impl[1].content), 'prompt', 'no sibling section when there is no sibling');
        t.ok(/```vb/.test(impl[1].content), 'prompt', 'and the fence matches the language');
    }

    // ---------- 4) parsing what a small model actually answers ----------
    {
        const fenced = 'Sure!\n```csharp\n    private void X() { }\n```\nHope that helps.';
        t.equal(extractCode(fenced).code, '    private void X() { }', 'parse', 'the fenced block is the answer');

        // A model that echoes the input and then answers: the LAST block is the answer.
        const twice = '```csharp\n    private void Old() { }\n```\nFixed:\n```csharp\n    private void New() { }\n```';
        const e = extractCode(twice);
        t.equal(e.code, '    private void New() { }', 'parse', 'with two blocks the last one wins (the echo is not the answer)');
        t.ok(/repeated/.test(e.note), 'parse', 'and the note says so');

        const json = '{"code": "    private void Y() { }", "explanation": "added the call"}';
        const j = extractCode(json);
        t.equal(j.code, '    private void Y() { }', 'parse', 'a JSON answer is understood');
        t.equal(j.note, 'added the call', 'parse', 'including its explanation');

        const bare = '    private void Z() { }';
        t.equal(extractCode(bare).code, bare, 'parse', 'no fence at all is passed through');
        t.equal(extractCode('```\n\n```').code, '', 'parse', 'an empty block yields nothing (so the caller can refuse)');
        t.equal(extractCode('').code, '', 'parse', 'and so does an empty answer');
    }

    // ---------- 5) span maths: replacing exactly one method ----------
    {
        const cs = [
            'using System;',
            '',
            'public class Form1',
            '{',
            '    private int _n;',
            '',
            '    private void A()',
            '    {',
            '        _n = 1;',
            '    }',
            '',
            '    private void B()',
            '    {',
            '        _n = 2;',
            '    }',
            '}',
            ''
        ].join('\n');
        const spans = methodsIn('Form1.axaml.cs', cs);
        t.equal(spans.length, 2, 'span', 'two methods found');
        t.equal(spans[0].name, 'A', 'span', 'the first is named');
        t.equal(spans[0].line, 7, 'span', 'and reports its line');
        t.equal(spans[0].endLine, 10, 'span', 'and its closing brace');
        t.ok(enclosingMethod('Form1.axaml.cs', cs, 9).name === 'A', 'span', 'a line inside A resolves to A');
        t.ok(enclosingMethod('Form1.axaml.cs', cs, 13).name === 'B', 'span', 'a line inside B resolves to B');
        t.equal(enclosingMethod('Form1.axaml.cs', cs, 1), undefined, 'span', 'a line outside any method resolves to nothing');

        const vb = ['Public Class Form1', '    Private Sub A()', '        _n = 1', '    End Sub', '', '    Private Sub B()', '    End Sub', 'End Class'].join('\n');
        const vbSpans = methodsIn('Form1.axaml.vb', vb);
        t.equal(vbSpans.length, 2, 'span', 'VB methods are found too');
        t.equal(vbSpans[0].endLine, 4, 'span', 'End Sub is the last line of the first');

        // Replacing A must leave B, the class and the indentation untouched.
        const spliced = spliceMethod(cs, spans[0], '    private void A()\n    {\n        _n = 42;\n    }');
        t.ok(spliced.includes('_n = 42;'), 'splice', 'the new body is in');
        t.ok(!spliced.includes('_n = 1;'), 'splice', 'the old body is gone');
        t.ok(spliced.includes('_n = 2;'), 'splice', 'the other method is untouched');
        t.ok(spliced.includes('using System;'), 'splice', 'and so is the header');
        t.equal(spliced.split('\n').length, cs.split('\n').length, 'splice', 'the line count is unchanged');
        t.ok(/\n {4}private void A\(\)/.test(spliced), 'splice', 'the indentation of the declaration survives');

        // A model that answers with its own indentation (or none) is re-indented to the file's.
        const flat = spliceMethod(cs, spans[0], 'private void A()\n{\n    _n = 7;\n}');
        t.ok(/\n {4}private void A\(\)/.test(flat), 'splice', 'a flat answer is indented to match');
        t.ok(/\n {8}_n = 7;/.test(flat), 'splice', 'and the nesting is kept relative');
        const deep = spliceMethod(cs, spans[0], '        private void A()\n        {\n            _n = 7;\n        }');
        t.ok(/\n {4}private void A\(\)/.test(deep), 'splice', 'an over-indented answer is normalised too');

        // CRLF files stay CRLF, and a BOM that the parser strips comes back.
        const crlf = cs.replace(/\n/g, '\r\n');
        const crlfSpan = methodsIn('Form1.axaml.cs', crlf)[0];
        const out = spliceMethod(crlf, crlfSpan, '    private void A()\r\n    {\r\n        _n = 3;\r\n    }', detectEol(crlf));
        t.ok(!/[^\r]\n/.test(out), 'splice', 'a CRLF file is not left with mixed line endings');
        const bom = `\uFEFF${cs}`;
        const bomOut = spliceMethod(bom, methodsIn('Form1.axaml.cs', bom)[0], '    private void A()\n    {\n    }');
        t.equal(bomOut.charCodeAt(0), 0xFEFF, 'splice', 'the BOM the parser strips is restored');

        t.equal(detectEol('a\r\nb'), '\r\n', 'splice', 'EOL detection: CRLF');
        t.equal(detectEol('a\nb'), '\n', 'splice', 'EOL detection: LF');
        // Re-basing keeps the *relative* nesting: only the smallest indentation found is replaced by the
        // target, so an inner block stays one level deeper than its declaration.
        t.equal(reindent('  x\n    y', '  ', '\n'), '  x\n    y', 'splice', 'reindent re-bases on the smallest indent');
        t.equal(reindent('x\n  y', '\t', '\n'), '\tx\n\t  y', 'splice', 'and honours the target indent');
        t.equal(reindent('\tx', '  ', '\n'), '  x', 'splice', 'tabs are converted before re-basing');

        t.equal(methodTooLong(new Array(MAX_METHOD_LINES).fill('x').join('\n')), false, 'splice', 'a method at the limit is accepted');
        t.equal(methodTooLong(new Array(MAX_METHOD_LINES + 1).fill('x').join('\n')), true, 'splice', 'one longer is refused');
    }

    // ---------- 6) the client, against a real server ----------
    {
        const cfg = normalizeAssistantConfig({ backend: 'external', endpoint: 'http://127.0.0.1:1/v1', timeoutSeconds: 5 });

        // 6a) streaming
        {
            const srv = await serve((req, res) => {
                if (req.url.endsWith('/models')) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ data: [{ id: 'qwen2.5-coder-3b' }, { id: 'phi-3-mini' }] }));
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'text/event-stream' });
                res.write(sse(['    private void A()', '\n    {\n    }']));
                res.end();
            });
            const probe = await probeServer({ ...cfg, endpoint: srv.endpoint });
            t.equal(probe.ok, true, 'client', 'the server is reachable');
            t.equal(probe.models.length, 2, 'client', 'and its model list is read');
            t.equal(probe.models[0].id, 'qwen2.5-coder-3b', 'client', 'with the ids');

            let streamed = '';
            const answer = await chat({ ...cfg, endpoint: srv.endpoint }, [{ role: 'user', content: 'hi' }], {
                onToken: (x) => (streamed += x)
            });
            t.ok(/private void A\(\)/.test(answer), 'client', 'a streamed answer is reassembled');
            t.equal(answer, streamed, 'client', 'and every delta was reported to the caller');
            await srv.close();
        }

        // 6a2) the timeout is an INACTIVITY budget, which is what makes CPU inference usable
        {
            // Slow but alive: a token every 300 ms, well past a 1 s budget in total. This is the shape
            // of a 3B model on a CPU writing a long method — a total timeout would have killed it.
            const slow = await serve((req, res) => {
                res.writeHead(200, { 'Content-Type': 'text/event-stream' });
                let n = 0;
                const tick = setInterval(() => {
                    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `t${n}` } }] })}\n\n`);
                    if (++n === 5) {
                        clearInterval(tick);
                        res.write('data: [DONE]\n\n');
                        res.end();
                    }
                }, 300);
            });
            const slowCfg = { ...cfg, endpoint: slow.endpoint, timeoutSeconds: 1 };
            const slowAnswer = await chat(slowCfg, [{ role: 'user', content: 'hi' }]);
            t.equal(slowAnswer, 't0t1t2t3t4', 'client', 'a slow but steadily streaming server is not cut off');
            await slow.close();

            // Silent: headers, then nothing. That is a stalled server and must fail with the timeout.
            const quiet = await serve((req, res) => {
                res.writeHead(200, { 'Content-Type': 'text/event-stream' });
                res.write(': waiting\n\n');
            });
            let timedOut = '';
            try {
                await chat({ ...cfg, endpoint: quiet.endpoint, timeoutSeconds: 1 }, [{ role: 'user', content: 'hi' }]);
            } catch (e) {
                timedOut = e.message;
            }
            t.ok(/cancelled or timed out/i.test(timedOut), 'client', 'a server that stops talking fails the watchdog');
            await quiet.close();
        }

        // 6b) a server that ignores `stream: true`
        {
            const srv = await serve((req, res) => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ choices: [{ message: { content: 'plain json answer' } }] }));
            });
            const answer = await chat({ ...cfg, endpoint: srv.endpoint }, [{ role: 'user', content: 'hi' }]);
            t.equal(answer, 'plain json answer', 'client', 'a non-streaming server still works');
            await srv.close();
        }

        // 6c) an error status is reported with the body, and it is not a crash
        {
            const srv = await serve((req, res) => {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('model not loaded');
            });
            let message = '';
            try {
                await chat({ ...cfg, endpoint: srv.endpoint }, [{ role: 'user', content: 'hi' }]);
            } catch (err) {
                message = err.message;
            }
            t.ok(/HTTP 500/.test(message) && /model not loaded/.test(message), 'client', 'an HTTP error is surfaced with its body');
            await srv.close();
        }

        // 6d) nothing listening: the message names the likely cause instead of "fetch failed"
        {
            let message = '';
            const probe = await probeServer(cfg, { timeoutMs: 800 });
            t.equal(probe.ok, false, 'client', 'a dead endpoint is not ok');
            message = probe.error || '';
            t.ok(/No server answered/.test(message), 'client', 'and the error explains what to check');
        }

        // 6e) the pure parsers
        t.equal(parseSseDelta('data: {"choices":[{"delta":{"content":"x"}}]}'), 'x', 'client', 'SSE delta parsing');
        t.equal(parseSseDelta('data: [DONE]'), undefined, 'client', 'the done marker yields nothing');
        t.equal(parseSseDelta(': keep-alive'), undefined, 'client', 'and other SSE lines are ignored');
        t.equal(parseSseDelta('data: not json'), undefined, 'client', 'broken JSON is ignored rather than thrown');
        t.equal(parseChatCompletion({ choices: [{ message: { content: 'a' } }] }), 'a', 'client', 'chat completion parsing');
        t.equal(parseChatCompletion({ choices: [{ text: 'b' }] }), 'b', 'client', 'and the legacy text shape');
        t.equal(parseChatCompletion({}), '', 'client', 'an empty body yields nothing');
    }

    // ---------- 6b) the status line says which model will really answer ----------
    {
        const base = { backend: 'external', model: '', modelPath: '' };
        t.ok(/only chat model the server offers/.test(describeModel(base, { ok: true, models: [{ id: 'qwen3-coder-local' }] })),
            'status', 'a server with one model is reported by name, not as "the server decides"');
        t.ok(/qwen3-coder-local/.test(describeModel(base, { ok: true, models: [{ id: 'qwen3-coder-local' }] })),
            'status', 'and the name is the server\'s own id');
        const many = describeModel(base, { ok: true, models: [{ id: 'a' }, { id: 'b' }] });
        t.ok(/picks one of 2 chat models/.test(many) && /set "model"/.test(many), 'status',
            'several models say so, and point at the setting that pins one down (Ollama refuses an unnamed request)');
        t.ok(/not known yet/.test(describeModel(base, { ok: false, models: [] })), 'status',
            'an unreachable server is not silently reported as "decides"');
        t.equal(describeModel(base, undefined), 'Model: (the server decides)', 'status',
            'without a probe the wording stays honest');
        t.equal(describeModel({ ...base, model: 'qwen2.5-coder:7b' }, { ok: true, models: [{ id: 'x' }] }),
            'Model: qwen2.5-coder:7b (asked for by name)', 'status',
            'a named model wins over the list');
        t.equal(describeModel({ backend: 'bundled', model: '', modelPath: '/m/x/qwen2.5-coder-3b-q4.gguf' }),
            'Model: qwen2.5-coder-3b-q4.gguf (bundled runtime)', 'status',
            'bundled names the file it loads (no probe needed)');
        t.ok(/none yet/.test(describeModel({ backend: 'bundled', model: '', modelPath: '' })), 'status',
            'and says what to do when no file is set yet');
        t.ok(describeModel({ backend: 'bundled', model: '', modelPath: 'C:\\models\\x.gguf' })
            .includes('x.gguf'), 'status', 'Windows paths are reduced to the file name too');

        // LM Studio lists its embedding model next to the chat ones (seen in a real status dialog:
        // qwen/qwen3.5-9b, google/gemma-4-e4b, text-embedding-nomic-embed-text-v1.5). An embedding model
        // cannot answer a chat request, so it must not be offered as a candidate.
        t.equal(looksLikeEmbeddingModel('text-embedding-nomic-embed-text-v1.5'), true, 'status',
            'an embedding model is recognised by name');
        t.equal(looksLikeEmbeddingModel('nomic-embed-text'), true, 'status', 'in its short form too');
        t.equal(looksLikeEmbeddingModel('bge-large-en-v1.5'), true, 'status', 'and by family name');
        t.equal(looksLikeEmbeddingModel('qwen/qwen3.5-9b'), false, 'status', 'a chat model is not');
        t.equal(looksLikeEmbeddingModel('google/gemma-4-e4b'), false, 'status', 'nor is this one');
        t.equal(looksLikeEmbeddingModel('qwen2.5-coder-7b-instruct'), false, 'status',
            'and a coder model with no embed in its name certainly is not');

        // The counts in the dialog are the *chat* models only, because that is what can answer.
        const chat = [{ id: 'qwen/qwen3.5-9b' }, { id: 'google/gemma-4-e4b' }];
        t.ok(/picks one of 2 chat models/.test(describeModel(base, { ok: true, models: chat })), 'status',
            'the count is the chat models the server offers');
        t.ok(/no chat model offered/.test(describeModel(base, { ok: true, models: [] })), 'status',
            'a server offering only embeddings says so instead of inviting a bad choice');
    }

    // ---------- 7) the manifest and the wiring ----------
    {
        const pkg = JSON.parse(read('package.json'));
        for (const key of [
            'assistant.backend',
            'assistant.endpoint',
            'assistant.model',
            'assistant.timeoutSeconds',
            'assistant.maxTokens',
            'assistant.temperature'
        ]) {
            t.ok(!!pkg.contributes.configuration.properties[`avaloniaDesigner.${key}`], 'manifest',
                `the "${key}" setting is declared`);
        }
        t.equal(pkg.contributes.configuration.properties['avaloniaDesigner.assistant.backend'].default, 'off', 'manifest',
            'and the feature ships switched off');
        // The default endpoint exists in TWO places — the manifest and DEFAULT_ENDPOINT in assistant.ts —
        // and the settings UI shows only the first one. A blank field whose real value is a URL is what
        // confused a user during testing (2026-09-14), so the two are pinned to each other here.
        const epDefault = pkg.contributes.configuration.properties['avaloniaDesigner.assistant.endpoint'].default;
        t.equal(epDefault, DEFAULT_ENDPOINT, 'manifest',
            'the endpoint default shown in the settings UI is the one the code falls back to');
        t.ok(/LM Studio/.test(pkg.contributes.configuration.properties['avaloniaDesigner.assistant.endpoint'].markdownDescription),
            'manifest', 'and its description names the server it points at');
        const commands = (pkg.contributes.commands || []).map((c) => c.command);
        t.ok(commands.includes('avaloniaDesigner.assistant.implement'), 'manifest', 'the implement command is contributed');
        t.ok(commands.includes('avaloniaDesigner.assistant.status'), 'manifest', 'and the status command');
        t.ok(!commands.includes('avaloniaDesigner.assistant.fixFinding'), 'manifest',
            'the internal command is not in the palette (it is reached from a Code Action)');
        const palette = pkg.contributes.menus.commandPalette;
        t.ok(palette.some((m) => m.command === 'avaloniaDesigner.assistant.implement' && /editorLangId/.test(m.when || '')), 'manifest',
            'the palette entry only shows for C#/VB files');

        const ext = read('src/extension.ts');
        t.ok(/registerCommand\('avaloniaDesigner\.assistant\.implement'/.test(ext), 'wiring', 'the command is registered');
        t.ok(/AssistantCodeActionProvider/.test(ext) && /registerCodeActionsProvider/.test(ext), 'wiring',
            'the code action provider is registered');
        const ui = read('src/assistantUi.ts');
        t.ok(/d\.source !== 'Avalonia Designer'/.test(ui), 'wiring',
            'the AI action only offers itself on our own findings');
        t.ok(/m\.line <= line && line <= m\.endLine/.test(ui), 'wiring',
            'and only for a line inside a method (outside one the rule-based fix wins)');
        t.ok(/methodAt\(editor\.document/.test(ui), 'wiring', 'the implement command finds the caret\'s method');
        t.ok(/vscode\.diff/.test(ui), 'wiring', 'the proposal is always shown as a diff');
        t.ok(/WorkspaceEdit/.test(ui) && /applyEdit/.test(ui), 'wiring', 'and applied as a normal edit (so Ctrl+Z works)');

        // The review flow, as reported by the user's first successful run (2026-09-14): the toast with
        // Apply/Discard expired while they read the diff, and closing the right pane asked to save it.
        for (const short of ['applyProposal', 'discardProposal']) {
            const cmd = `avaloniaDesigner.assistant.${short}`;
            t.ok(commands.includes(cmd), 'manifest', `${short} is contributed as a command`);
            t.ok(palette.some((m) => m.command === cmd), 'manifest', `${short} is reachable from the palette`);
            t.ok((pkg.contributes.menus['editor/title'] || []).some(
                (m) => m.command === cmd && /avaloniaDesigner\.proposalPending/.test(m.when || '')
            ), 'manifest', `${short} is a button on the diff editor's title bar, only while a proposal waits`);
            t.ok((pkg.contributes.menus['editor/title'] || []).some(
                (m) => m.command === cmd && /isInDiffEditor/.test(m.when || '')
            ), 'manifest', `and only inside a diff editor — not on ordinary files`);
        }
        t.ok(/createStatusBarItem/.test(ui), 'wiring',
            'the decision is also published in the status bar, where it cannot expire');
        t.ok(/setContext', 'avaloniaDesigner\.proposalPending'/.test(ui), 'wiring',
            'gated by a context key, which is what the title-bar buttons match on');
        t.ok(/registerTextDocumentContentProvider\(PROPOSAL_SCHEME/.test(ext), 'wiring',
            'the right pane of the diff is a read-only content provider');
        t.ok(/proposalContent,/.test(ext), 'wiring', 'registered for disposal with the window');
        t.ok(/openTextDocument\(\{ content/.test(ui) === false, 'wiring',
            'and never an untitled document — that is exactly what asked "do you want to save?"');
        t.ok(/saveAll\(false\)/.test(ui), 'wiring', 'Build to verify saves unsaved files first (that is what it compiles)');
        t.ok(/tabGroups\.close/.test(ui), 'wiring',
            'the diff tab is closed by reference, never "whatever is active"');
        t.ok(commands.includes('avaloniaDesigner.assistant.fixFinding') === false, 'manifest',
            'the internal Code Action command stays out of the palette');
    }
};
