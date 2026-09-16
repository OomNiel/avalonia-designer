/* T2 — thinking models: reading `reasoning_content`, and explaining an answer that never came.
 *
 * Every fixture is REAL, captured from LM Studio on 2026-09-15 with `qwen/qwen3.5-9b` (arch `qwen35`):
 *
 *   - max_tokens 120  → finish_reason "length", reasoning_tokens 120, content "",     reasoning 385 chars
 *   - max_tokens 200  → finish_reason "length", reasoning_tokens 200, content "",     reasoning 811 chars
 *   - max_tokens 1500 → finish_reason "stop",   reasoning_tokens 837, content 71 chars, reasoning 3186
 *
 * That third line is the whole bug: the model *does* answer, but only after ~840 tokens of thinking, and
 * the extension's default budget was 900 and it never read the reasoning field at all — so the developer
 * got a raw-answer tab reading "0 characters".
 *
 * Its own file on purpose: `assistant.test.js` is open in the user's editor, and `files.autoSave =
 * onFocusChange` saves stale buffers over anything written there (NOTES.md §99).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {
    chat,
    chatDetailed,
    describeEmptyAnswer,
    normalizeAssistantConfig,
    parseChatCompletionFull,
    parseSseChunk,
    parseSseDelta
} = require('../../out/assistant.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const cfg = normalizeAssistantConfig({ backend: 'external', endpoint: 'http://127.0.0.1:1234/v1', model: 'qwen/qwen3.5-9b' });

/** A fetch stub that replays a captured SSE body, and records the request that was sent. */
function sseFetch(lines, seen = {}) {
    const body = lines.join('\n') + '\n';
    return {
        seen,
        fetchImpl: async (url, init) => {
            seen.url = url;
            seen.body = JSON.parse(init.body);
            const bytes = new TextEncoder().encode(body);
            let sent = false;
            return {
                ok: true,
                status: 200,
                body: {
                    getReader: () => ({
                        read: async () => {
                            if (sent) return { done: true, value: undefined };
                            sent = true;
                            return { done: false, value: bytes };
                        }
                    })
                },
                text: async () => body,
                json: async () => JSON.parse(body)
            };
        }
    };
}

const data = (o) => `data: ${JSON.stringify(o)}`;
const reasoningChunk = (t) => data({ choices: [{ index: 0, delta: { reasoning_content: t }, finish_reason: null }] });
const contentChunk = (t) => data({ choices: [{ index: 0, delta: { content: t }, finish_reason: null }] });

const ANSWER = '```csharp\npublic static int Add(int a, int b)\n{\n    return a + b;\n}\n```';

module.exports = async (t) => {
    t.section('thinking models (reasoning_content)');

    // ---------- 1) the parser sees the thinking ----------
    {
        const r = parseSseChunk(reasoningChunk('Thinking Process: 1. **Analyze the Request:**'));
        t.equal(r.reasoning, 'Thinking Process: 1. **Analyze the Request:**', 'parser', 'the thinking is read');
        t.equal(r.content, undefined, 'parser', 'and is not mistaken for the answer');

        const c = parseSseChunk(contentChunk('```csharp'));
        t.equal(c.content, '```csharp', 'parser', 'the answer is read as before');
        t.equal(c.reasoning, undefined, 'parser', 'and is not mistaken for thinking');

        // llama.cpp and vLLM also emit `reasoning` — accept either spelling.
        t.equal(parseSseChunk(data({ choices: [{ delta: { reasoning: 'hmm' } }] })).reasoning, 'hmm', 'parser',
            'the `reasoning` spelling is accepted too');

        const last = parseSseChunk(data({
            choices: [{ index: 0, delta: {}, finish_reason: 'length' }],
            usage: { completion_tokens: 837, completion_tokens_details: { reasoning_tokens: 837 } }
        }));
        t.equal(last.finishReason, 'length', 'parser', 'the finish reason is read');
        t.equal(last.usage.reasoningTokens, 837, 'parser', 'and the thinking token count');

        // The narrow view must not change behaviour for existing callers.
        t.equal(parseSseDelta(contentChunk('abc')), 'abc', 'parser', 'parseSseDelta still returns text');
        t.equal(parseSseDelta(reasoningChunk('hmm')), undefined, 'parser', 'and never thinking');
        t.equal(parseSseChunk('data: [DONE]'), undefined, 'parser', '[DONE] carries nothing');
        t.equal(parseSseChunk('data: {broken'), undefined, 'parser', 'broken JSON is ignored, not thrown');
        t.equal(parseSseChunk(': keep-alive'), undefined, 'parser', 'an SSE comment line is ignored');
        t.equal(parseSseChunk(data({ choices: [{ delta: {} }] })), undefined, 'parser',
            'an empty heartbeat chunk is not an event');

        const flat = parseChatCompletionFull({ choices: [{ message: { content: ANSWER, reasoning_content: 'why' } }] });
        t.equal(flat.text, ANSWER, 'parser', 'a non-streaming body still gives its text');
        t.equal(flat.reasoning, 'why', 'parser', 'and its thinking');
    }

    // ---------- 2) the request asks for the numbers, and the budgets are sane ----------
    {
        t.equal(cfg.maxTokens, 4096, 'budget', 'the default budget leaves room for thinking (was 900 — too small)');
        t.equal(normalizeAssistantConfig({}).maxTokens, 4096, 'budget', 'and applies when nothing is set');
        t.equal(normalizeAssistantConfig({ maxTokens: 99999 }).maxTokens, 8192, 'budget', 'while still being clamped');
        t.equal(normalizeAssistantConfig({ maxTokens: 1 }).maxTokens, 64, 'budget', 'and floor-ed');
    }

    // ---------- 3) a real thinking answer, streamed ----------
    {
        const seen = {};
        const stub = sseFetch([
            reasoningChunk('Thinking Process: '),
            reasoningChunk('1. Analyze the Request: C# method Add(int a, int b).'),
            contentChunk('```csharp\n'),
            contentChunk('public static int Add(int a, int b)\n{\n    return a + b;\n}\n'),
            contentChunk('```'),
            data({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { completion_tokens: 867, completion_tokens_details: { reasoning_tokens: 837 } } }),
            'data: [DONE]'
        ], seen);

        const progress = [];
        const tokens = [];
        const outcome = await chatDetailed(cfg, [{ role: 'user', content: 'Write Add' }], {
            fetchImpl: stub.fetchImpl,
            onToken: (x) => tokens.push(x),
            onReasoning: (chars) => progress.push(chars)
        });

        t.equal(outcome.text, ANSWER, 'stream', 'the answer is collected across chunks');
        t.ok(/Thinking Process/.test(outcome.reasoning), 'stream', 'the thinking is collected separately');
        t.equal(outcome.finishReason, 'stop', 'stream', 'the finish reason is reported');
        t.equal(outcome.reasoningTokens, 837, 'stream', 'so is the thinking token count — the number that explains a failure');
        t.equal(outcome.completionTokens, 867, 'stream', 'and the total');
        t.equal(progress.length, 2, 'stream', 'progress is reported while it thinks');
        t.ok(progress[0] < progress[1], 'stream', 'with a running total, so a long think is not silence');
        t.equal(tokens.join(''), ANSWER, 'stream', 'and the answer still arrives chunk by chunk');
        t.ok(seen.body.stream_options?.include_usage === true, 'stream',
            'the request asks for usage — that is what makes "837 thinking tokens" knowable');
        t.equal(seen.body.max_tokens, 4096, 'stream', 'and sends the configured budget');

        // `chat()` keeps its old shape for every other caller.
        const plain = await chat(cfg, [{ role: 'user', content: 'x' }], { fetchImpl: sseFetch([contentChunk('hi')]).fetchImpl });
        t.equal(plain, 'hi', 'stream', 'chat() still returns just the text');
    }

    // ---------- 4) the failure the user actually hit, replayed ----------
    {
        const stub = sseFetch([
            reasoningChunk('Thinking Process: 1. Analyze the Request: Target language: C#.'),
            reasoningChunk('2. Constraints: Reply with *only* a code block.'),
            data({ choices: [{ index: 0, delta: {}, finish_reason: 'length' }], usage: { completion_tokens: 120, completion_tokens_details: { reasoning_tokens: 120 } } }),
            'data: [DONE]'
        ]);
        const outcome = await chatDetailed(cfg, [{ role: 'user', content: 'Write Add' }], { fetchImpl: stub.fetchImpl });
        t.equal(outcome.text, '', 'empty', 'with a 120-token budget the answer really is empty');
        t.ok(outcome.reasoning.length > 0, 'empty', 'and all there is to show is the thinking');
        t.equal(outcome.finishReason, 'length', 'empty', 'the budget ran out');

        const why = describeEmptyAnswer(outcome.text, {
            reasoningChars: outcome.reasoning.length,
            reasoningTokens: outcome.reasoningTokens,
            finishReason: outcome.finishReason
        });
        t.ok(/thinks before it answers/.test(why), 'empty', 'the explanation names the real cause');
        t.ok(/reasoning/.test(why), 'empty', 'and mentions the thinking');
        t.ok(/maxTokens/.test(why), 'empty', 'and gives the setting to change — not just "nothing usable"');
        t.ok(/4096/.test(why), 'empty', 'with a value that works');
        t.ok(/coder model/.test(why), 'empty', 'and the alternative of choosing a model that does not think');

        // The old behaviour, which must not come back: a bare, worthless message.
        t.equal(describeEmptyAnswer(''), 'The model returned an empty answer.', 'empty',
            'with no evidence at all, the message still has to say something');
        t.ok(/budget ran out/.test(describeEmptyAnswer('', { finishReason: 'length' })), 'empty',
            'a bare length stop names the budget');
        t.ok(/prose instead of code/.test(describeEmptyAnswer('Here is the method you wanted:')), 'empty',
            'prose is still rejected as code');
        t.ok(/never closed/.test(describeEmptyAnswer('```csharp\nint x = 1;')), 'empty',
            'and a cut-off block is still explained');
    }

    // ---------- 5) the wiring: the wizard measures instead of guessing ----------
    {
        const wizard = read('src/localModelSetup.ts');
        t.ok(/chatDetailed/.test(wizard), 'wiring', 'the wizard uses the detailed call — it must see the thinking');
        t.ok(/thinkingTokens/.test(wizard), 'wiring', 'and report the token count');
        t.ok(/maxTokens/.test(wizard) && /ConfigurationTarget\.Global/.test(wizard), 'wiring',
            'it raises the answer budget in the user\'s settings when the model thinks');
        t.ok(/describeEmptyAnswer/.test(wizard), 'wiring', 'and explains an empty test request');
        const ui = read('src/assistantUi.ts');
        t.ok(/onReasoning/.test(ui), 'wiring',
            'the progress notification says the model is thinking rather than looking stuck');
        t.ok(/showRawAnswer\(answer, label, cfg, thinking\)/.test(ui), 'wiring',
            'and the raw-answer tab carries the thinking, so it can never be "0 characters" with no evidence');
    }
};
