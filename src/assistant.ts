/* Local AI assist — the model-agnostic core.
 *
 * The feature has to work for a developer who has **no** AI at all: no Copilot, no cloud key, no local
 * server. That means the model runtime eventually ships with the extension (see NOTES.md §90), so this
 * module deliberately knows nothing about *who* serves the endpoint — only the OpenAI-compatible chat
 * shape every local runtime speaks (LM Studio, Ollama, llama.cpp's `llama-server`, and later our own
 * bundled runtime). Tier 1 talks to a server the developer already runs; the same code then talks to
 * the bundled one.
 *
 * Three rules shaped the design:
 *
 *  1. **The model edits exactly one method.** Every prompt asks for the *complete replacement of the
 *     method the caret is in*, and nothing else. A small model that is asked to "fix my file" will
 *     rewrite half of it; a model asked to return one method is graded by `dotnet build` in seconds.
 *  2. **Output is parsed defensively.** Small models wrap answers in prose, fence them twice, or echo
 *     the input first, so `extractCode` takes the LAST fenced block (the answer, not the echo) and
 *     falls back to a JSON `{"code": …}` shape.
 *  3. **Nothing is applied without a diff.** This module returns text; `assistantUi.ts` shows the diff
 *     and the developer decides. The deterministic checker keeps owning the structural fixes — the
 *     model is for the semantic ones it cannot express as a rule (fill this handler in, make this
 *     error go away).
 *
 * Everything here is pure or injectable, so the test suite covers it without a model: prompts, the
 * parsers, the span maths and the client (against a throwaway local HTTP server).
 */

import * as fs from 'fs';
import * as os from 'os';

/** How the assistant gets its model. `bundled` = the extension builds and runs its own local server. */
export type AssistantBackend = 'off' | 'external' | 'bundled';

/** The settings shape after normalisation (see `normalizeAssistantConfig`). */
export interface AssistantConfig {
    backend: AssistantBackend;
    /** Base URL of an OpenAI-compatible API, e.g. `http://127.0.0.1:1234/v1`. For `bundled` the
     *  runtime fills this in at request time — the request shape is identical either way. */
    endpoint: string;
    /** Model id to request. Empty = let the server pick (`/models` order). */
    model: string;
    /** `.gguf` file for the bundled runtime (set by "AI: Set Up Local Model…"). */
    modelPath: string;
    /** Threads for the bundled runtime; 0 = choose automatically. */
    threads: number;
    timeoutSeconds: number;
    maxTokens: number;
    temperature: number;
}

/** Raw settings as they come out of the manifest (every field possibly undefined/wrong-typed). */
export interface RawAssistantSettings {
    backend?: unknown;
    endpoint?: unknown;
    model?: unknown;
    modelPath?: unknown;
    threads?: unknown;
    timeoutSeconds?: unknown;
    maxTokens?: unknown;
    temperature?: unknown;
}

/** LM Studio's default port — the most likely local server, and what the docs point at. */
export const DEFAULT_ENDPOINT = 'http://127.0.0.1:1234/v1';

/** A method longer than this is refused: it will not fit the budget of a small local model. */
export const MAX_METHOD_LINES = 120;

/** Total RAM the bundled runtime needs to be worth offering at all (Tier 2 gate). */
export const MIN_RAM_GB = 8;
/** Where a 3B-class model at Q4 has room to breathe. */
export const GOOD_RAM_GB = 16;

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Clamp a number setting, tolerating strings (settings UI, JSON round-trips) and junk. */
function num(v: unknown, fallback: number, min: number, max: number): number {
    const n = typeof v === 'string' ? Number(v) : v;
    if (!isFiniteNumber(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

/** `http://host:port` → `http://host:port/v1`; keeps anything already ending in `/v1`. */
export function normalizeEndpoint(endpoint: string): string {
    const trimmed = String(endpoint || '').trim().replace(/\/+$/, '');
    if (!trimmed) return DEFAULT_ENDPOINT;
    return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

/**
 * Turns whatever the settings hold into a usable configuration. Pure on purpose: the manifest, the
 * UI and the tests all funnel through here, so "what does backend X mean" has one answer.
 */
export function normalizeAssistantConfig(raw: RawAssistantSettings): AssistantConfig {
    const backend: AssistantBackend =
        raw.backend === 'external' ? 'external' : raw.backend === 'bundled' ? 'bundled' : 'off';
    return {
        backend,
        endpoint: normalizeEndpoint(typeof raw.endpoint === 'string' ? raw.endpoint : DEFAULT_ENDPOINT),
        model: typeof raw.model === 'string' ? raw.model.trim() : '',
        modelPath: typeof raw.modelPath === 'string' ? raw.modelPath.trim() : '',
        threads: num(raw.threads, 0, 0, 32),
        timeoutSeconds: num(raw.timeoutSeconds, 60, 5, 600),
        maxTokens: num(raw.maxTokens, 900, 64, 8192),
        temperature: num(raw.temperature, 0.2, 0, 1)
    };
}

/** True when the user has switched the feature on *and* there is somewhere to send requests: either a
 *  server they pointed at, or the bundled runtime that fills the endpoint in itself. */
export function assistantEnabled(cfg: AssistantConfig): boolean {
    if (cfg.backend === 'off') return false;
    if (cfg.backend === 'bundled') return true;
    return cfg.endpoint.length > 0;
}

// ---------------- hardware ----------------

/** Facts about the machine, read once and passed around (so the verdict is testable). */
export interface HardwareFacts {
    arch: string;
    cpuCount: number;
    totalRamGb: number;
    freeRamGb: number;
    /** AVX2 is the practical floor for llama.cpp on x86-64 — without it a 3B model crawls. */
    hasAvx2: boolean;
    /** `null` when it could not be determined (non-Linux, unreadable /proc). */
    platform: string;
}

export interface HardwareAssessment {
    /** False = do not offer local inference at all (the caller hides/disables the feature). */
    ok: boolean;
    level: 'none' | 'minimal' | 'good';
    /** One line per reason, ready to show in the status message. */
    reasons: string[];
}

/**
 * Decides whether this machine can run a small model *in system RAM* (no VRAM assumption — that is the
 * requirement the feature was specced with). Pure: `readHardwareFacts()` supplies the numbers.
 */
export function assessHardware(f: HardwareFacts): HardwareAssessment {
    const reasons: string[] = [];
    let ok = true;

    if (f.arch !== 'x64' && f.arch !== 'arm64') {
        ok = false;
        reasons.push(`CPU architecture "${f.arch}" is not supported (x64 or arm64 required).`);
    }
    if (f.arch === 'x64' && !f.hasAvx2) {
        ok = false;
        reasons.push('The CPU has no AVX2 instructions — local inference would be too slow to use.');
    }
    if (f.cpuCount < 4) {
        ok = false;
        reasons.push(`Only ${f.cpuCount} CPU threads — a small model needs at least 4.`);
    }
    if (f.totalRamGb < MIN_RAM_GB) {
        ok = false;
        reasons.push(`Only ${f.totalRamGb.toFixed(1)} GB of RAM — ${MIN_RAM_GB} GB is the minimum.`);
    } else if (f.freeRamGb < 3.5) {
        ok = false;
        reasons.push(
            `Only ${f.freeRamGb.toFixed(1)} GB of RAM is free right now — free at least 3.5 GB ` +
            '(close some applications) and try again.'
        );
    }

    if (!ok) {
        if (reasons.length === 0) reasons.push('This machine cannot run a local model.');
        return { ok: false, level: 'none', reasons };
    }

    const good = f.totalRamGb >= GOOD_RAM_GB && f.cpuCount >= 8 && f.freeRamGb >= 6;
    if (!good) {
        reasons.push(
            `Running at the minimum: ${f.totalRamGb.toFixed(0)} GB RAM, ${f.cpuCount} threads — ` +
            'expect slow (10-30 s) answers and use the smallest model.'
        );
    } else {
        reasons.push(`${f.totalRamGb.toFixed(0)} GB RAM, ${f.cpuCount} threads, ${f.arch}: fine for a 3B-class model.`);
    }
    return { ok: true, level: good ? 'good' : 'minimal', reasons };
}

/** Reads the machine facts. Linux-first (the feature ships there first), degrading gracefully. */
export function readHardwareFacts(): HardwareFacts {
    const cpus = os.cpus();
    let hasAvx2 = false;
    try {
        // One read, no shell: /proc/cpuinfo lists the CPU flags the kernel advertised.
        hasAvx2 = /(^|\s)avx2(\s|$)/m.test(fs.readFileSync('/proc/cpuinfo', 'utf8'));
    } catch {
        // Not Linux (or unreadable): fall back to "assume yes" on a 64-bit CPU rather than blocking
        // the feature on a machine that may well be fine.
        hasAvx2 = process.arch === 'x64' || process.arch === 'arm64';
    }
    const totalRamGb = os.totalmem() / 1024 ** 3;
    const freeRamGb = os.freemem() / 1024 ** 3;
    return {
        arch: process.arch,
        cpuCount: cpus.length,
        totalRamGb,
        freeRamGb,
        hasAvx2,
        platform: process.platform
    };
}

// ---------------- the client ----------------

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ServerModelInfo {
    id: string;
}

export interface ProbeResult {
    ok: boolean;
    models: ServerModelInfo[];
    error?: string;
}

/** Minimal shape of `fetch` we depend on — declared locally so the client stays injectable. */
export type FetchLike = (url: string, init?: Record<string, unknown>) => Promise<{
    ok: boolean;
    status: number;
    text(): Promise<string>;
    body?: unknown;
    json(): Promise<unknown>;
}>;

function defaultFetch(): FetchLike {
    const f = (globalThis as { fetch?: unknown }).fetch;
    if (typeof f !== 'function') throw new Error('This VS Code build has no fetch() — update VS Code.');
    return f as FetchLike;
}

function describeError(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ECONNREFUSED|fetch failed/i.test(msg)) {
        return 'No server answered — is the local model server running (and the endpoint correct)?';
    }
    if (/aborted|abort/i.test(msg)) return 'The request was cancelled or timed out.';
    return msg;
}

/** `GET /models` — used to verify an endpoint and to offer the model list. */
export async function probeServer(
    cfg: AssistantConfig,
    opts: { timeoutMs?: number; fetchImpl?: FetchLike } = {}
): Promise<ProbeResult> {
    const timeoutMs = opts.timeoutMs ?? 2500;
    const doFetch = opts.fetchImpl ?? defaultFetch();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await doFetch(`${cfg.endpoint}/models`, { signal: controller.signal });
        if (!res.ok) return { ok: false, models: [], error: `The server answered HTTP ${res.status}.` };
        const body = (await res.json()) as { data?: { id?: unknown }[] };
        const models = (body.data ?? [])
            .map((m) => (typeof m.id === 'string' ? { id: m.id } : undefined))
            .filter((m): m is ServerModelInfo => !!m);
        return { ok: true, models };
    } catch (err) {
        return { ok: false, models: [], error: describeError(err) };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Extracts the answer text out of one SSE line. Streaming matters for the 10 s budget: the developer
 * sees tokens arrive instead of a frozen notification. Pure, so the parser is tested directly.
 */
export function parseSseDelta(line: string): string | undefined {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return undefined;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') return undefined;
    try {
        const obj = JSON.parse(payload) as { choices?: { delta?: { content?: unknown } }[] };
        const text = obj.choices?.[0]?.delta?.content;
        return typeof text === 'string' ? text : undefined;
    } catch {
        return undefined;
    }
}

/** Pulls the full text out of a non-streaming `/chat/completions` body. Pure. */
export function parseChatCompletion(body: unknown): string {
    const obj = body as { choices?: { message?: { content?: unknown }; text?: unknown }[] };
    const first = obj?.choices?.[0];
    if (typeof first?.message?.content === 'string') return first.message.content;
    if (typeof first?.text === 'string') return first.text;
    return '';
}

export interface ChatOptions {
    onToken?: (text: string) => void;
    signal?: AbortSignal;
    fetchImpl?: FetchLike;
}

/**
 * Sends a chat request and returns the answer text. Streams when the server supports it (every local
 * runtime does) and falls back to a single JSON read when it does not.
 *
 * `timeoutSeconds` is an **inactivity** budget, not a total one: the watchdog is re-armed every time
 * data arrives, so a 3B model on a CPU taking two minutes for a long method is fine while a server that
 * has stopped talking is caught in seconds. A total budget would have killed exactly the slow-but-busy
 * case this feature exists for.
 */
export async function chat(
    cfg: AssistantConfig,
    messages: ChatMessage[],
    opts: ChatOptions = {}
): Promise<string> {
    const doFetch = opts.fetchImpl ?? defaultFetch();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const armWatchdog = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => controller.abort(), cfg.timeoutSeconds * 1000);
    };
    armWatchdog();
    const onAbort = () => controller.abort();
    opts.signal?.addEventListener('abort', onAbort);
    try {
        const res = await doFetch(`${cfg.endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
                model: cfg.model || undefined,
                messages,
                temperature: cfg.temperature,
                max_tokens: cfg.maxTokens,
                stream: true
            })
        });
        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new Error(`The server answered HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
        }

        // The response is an SSE stream; read it chunk by chunk and hand every delta to the caller.
        const body = res.body as { getReader?: () => { read(): Promise<{ done: boolean; value?: Uint8Array }> } } | undefined;
        if (typeof body?.getReader !== 'function') return parseChatCompletion(await res.json());

        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let raw = '';
        let text = '';
        for (; ;) {
            const { done, value } = await reader.read();
            if (done) break;
            armWatchdog(); // data arrived: the server is alive, whatever its speed
            const chunk = decoder.decode(value, { stream: true });
            raw += chunk;
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? ''; // the last line may be half-received
            for (const line of lines) {
                const delta = parseSseDelta(line);
                if (delta) {
                    text += delta;
                    opts.onToken?.(delta);
                }
            }
        }
        buffer += decoder.decode();
        const tail = parseSseDelta(buffer);
        if (tail) {
            text += tail;
            opts.onToken?.(tail);
        }
        // A server that ignores `stream: true` sends one plain JSON body: no `data:` lines at all, so
        // the accumulated text is empty and the answer is in the raw body.
        if (!text) {
            try {
                return parseChatCompletion(JSON.parse(raw));
            } catch {
                /* not JSON either — fall through with whatever arrived */
            }
        }
        return text;
    } catch (err) {
        throw new Error(describeError(err));
    } finally {
        if (timer) clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onAbort);
    }
}

// ---------------- prompts and parsing ----------------

/** Everything a prompt needs, already read from the file by the caller. */
export interface FixPromptInput {
    language: 'cs' | 'vb';
    /** The finding, verbatim (the checker's title + detail). */
    finding: string;
    /** The whole method the finding points at. */
    method: string;
    /** `using …`/`Imports …` + namespace/class line, for context the model must not change. */
    header: string;
    /** Optional second method from the same file, as a style reference. */
    sibling?: string;
}

export interface ImplementPromptInput {
    language: 'cs' | 'vb';
    /** What the developer typed into the dialog. */
    description: string;
    method: string;
    header: string;
    sibling?: string;
}

const CODE_FENCE = '```';

function languageLabel(language: 'cs' | 'vb'): string {
    return language === 'vb' ? 'VB.NET (Avalonia)' : 'C# (Avalonia)';
}

function systemMessage(language: 'cs' | 'vb'): ChatMessage {
    return {
        role: 'system',
        content:
            `You are a precise ${languageLabel(language)} coding assistant inside a desktop form designer. ` +
            'You return complete, compilable methods and nothing else. You never invent APIs: only use ' +
            'types and members that already appear in the code you are given. You keep the method\'s ' +
            'signature, name and indentation exactly as they are.'
    };
}

/** Shared tail of both prompts: the hard contract on the answer. */
function answerContract(language: 'cs' | 'vb'): string {
    const fence = language === 'vb' ? 'vb' : 'csharp';
    return (
        `Reply with the COMPLETE replacement for that method — its signature line included, with the same ` +
        `name, parameters, modifiers and indentation — inside one ${CODE_FENCE}${fence} code block, and ` +
        'nothing else outside it. Do not add usings/Imports. Do not add other methods. Do not explain.'
    );
}

function promptBody(language: 'cs' | 'vb', header: string, method: string, sibling: string | undefined, ask: string): string {
    const lines = [
        `Language: ${languageLabel(language)}`,
        '',
        'File header (context only — do not change it, do not repeat it):',
        CODE_FENCE + (language === 'vb' ? 'vb' : 'csharp'),
        header.trimEnd(),
        CODE_FENCE,
        ''
    ];
    if (sibling?.trim()) {
        lines.push(
            'Another method from the same file (style reference only — do not change it):',
            CODE_FENCE + (language === 'vb' ? 'vb' : 'csharp'),
            sibling.trimEnd(),
            CODE_FENCE,
            ''
        );
    }
    lines.push(ask, CODE_FENCE + (language === 'vb' ? 'vb' : 'csharp'), method.trimEnd(), CODE_FENCE, '', answerContract(language));
    return lines.join('\n');
}

/** Prompt for "make this finding go away": the error text does the explaining. */
export function buildFixPrompt(input: FixPromptInput): ChatMessage[] {
    const ask =
        `The designer\'s checker reported this problem in the method below:\n${input.finding.trim()}\n\n` +
        'Fix exactly that problem by rewriting this method:';
    return [
        systemMessage(input.language),
        { role: 'user', content: promptBody(input.language, input.header, input.method, input.sibling, ask) }
    ];
}

/** Prompt for "do this in the function I am standing in": the developer\'s sentence is the spec. */
export function buildImplementPrompt(input: ImplementPromptInput): ChatMessage[] {
    const ask =
        `The developer wants the method below to do this:\n"""${input.description.trim()}"""\n\n` +
        'Implement it inside this method, changing nothing else:';
    return [
        systemMessage(input.language),
        { role: 'user', content: promptBody(input.language, input.header, input.method, input.sibling, ask) }
    ];
}

/**
 * Pulls the code out of a model answer. Takes the **last** fenced block, because a small model often
 * echoes the method it was given first and then answers; falls back to `{"code": …}` and, failing
 * everything, to the raw text with the fences stripped.
 */
export function extractCode(answer: string): { code: string; note: string } {
    const text = String(answer ?? '');

    // Some models answer with JSON when the prompt smells like an API call.
    const jsonMatch = /\{[\s\S]*"code"[\s\S]*\}/.exec(text);
    if (jsonMatch) {
        try {
            const obj = JSON.parse(jsonMatch[0]) as { code?: unknown; explanation?: unknown; note?: unknown };
            if (typeof obj.code === 'string' && obj.code.trim()) {
                const note = [obj.explanation, obj.note].find((v) => typeof v === 'string' && v.trim());
                return { code: tidyCode(obj.code), note: typeof note === 'string' ? note.trim() : '' };
            }
        } catch {
            // not JSON after all — carry on with the fence handling
        }
    }

    const blocks: string[] = [];
    const fenceRe = new RegExp(CODE_FENCE + '[^\\n]*\\n([\\s\\S]*?)' + CODE_FENCE, 'g');
    let m: RegExpExecArray | null;
    while ((m = fenceRe.exec(text))) blocks.push(m[1]);

    if (blocks.length > 0) {
        const code = tidyCode(blocks[blocks.length - 1]);
        const outside = `${text.slice(0, text.indexOf(CODE_FENCE))}`.trim();
        return { code, note: blocks.length > 1 ? `The model repeated the code ${blocks.length} times; the last block was used.` : outside.slice(0, 400) };
    }

    // No fence at all: strip a stray opening fence and take what is left.
    return { code: tidyCode(text.replace(new RegExp('^' + CODE_FENCE + '[^\n]*\n?', 'm'), '')), note: '' };
}

/**
 * Trims the blank lines a model likes to put around its answer, and nothing else. `String.trim()` is
 * wrong here: it would eat the first line's indentation, and since `reindent` re-bases every line on the
 * *smallest* indentation it finds, that would then push the whole body one level deeper.
 */
function tidyCode(code: string): string {
    return String(code ?? '').replace(/^\n+/, '').replace(/\s+$/, '');
}

// ---------------- editing text ----------------

/** A method's span inside the file text (offsets, as `enclosingMethod` reports them). */
export interface MethodSpan {
    name: string;
    params: string;
    start: number;
    end: number;
    line: number;
}

/** The exact EOL the document uses, so a proposal never mixes line endings. */
export function detectEol(text: string): string {
    return text.includes('\r\n') ? '\r\n' : '\n';
}

/** Re-indents a proposal to the method's original indentation, keeping relative nesting. */
export function reindent(code: string, indent: string, eol: string): string {
    const lines = code.replace(/\r\n/g, '\n').split('\n');
    const nonEmpty = lines.filter((l) => l.trim().length > 0);
    const current = Math.min(...nonEmpty.map((l) => /^[ \t]*/.exec(l)![0].replace(/\t/g, '    ').length), 99);
    return lines
        .map((l) => (l.trim() ? indent + l.replace(/\t/g, '    ').slice(current) : ''))
        .join(eol)
        .replace(/\s+$/, '');
}

/**
 * Replaces one method with the model's version. Pure — the caller decides how to write the result — and
 * it restores a stripped BOM, because the checker works on BOM-free text.
 */
export function spliceMethod(text: string, span: MethodSpan, code: string, eol = detectEol(text)): string {
    const body = text.replace(/\uFEFF/g, '');
    // The declaration's own leading whitespace is the target indentation, whether or not the span
    // starts at the beginning of the line.
    const raw = body.slice(span.start, span.end);
    const indent = /^[ \t]*/.exec(raw)?.[0] ?? '';
    // The span carries the line break(s) after the method — often the blank line that separates it from
    // the next one. Reproducing that count is what keeps the file's shape (and its line count) intact.
    const trailing = (/[\r\n]+$/.exec(raw)?.[0] ?? '').replace(/\r\n/g, '\n').length;
    const replacement = reindent(code, indent, eol) + eol.repeat(trailing);
    return (text.charCodeAt(0) === 0xFEFF ? '\uFEFF' : '') + body.slice(0, span.start) + replacement + body.slice(span.end);
}

/** Line count guard: a method too long for a small model is refused before we send anything. */
export function methodTooLong(method: string): boolean {
    return method.split('\n').length > MAX_METHOD_LINES;
}
