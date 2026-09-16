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

// The event catalogue only (a pure table): a new member whose name looks like `<Control>_<Event>` is a
// form handler, and a form handler can never be `static`/`Shared`.
import { isKnownEventName } from './controlEvents';
// The window the bundled runtime is started with by default — the number `contextForBudget` grows when the
// answer budget needs more room (2026-09-16).
import { DEFAULT_CONTEXT_SIZE } from './modelSpecs';

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
    /**
     * Context window handed to the bundled runtime (`--ctx`). LM Studio models get theirs from `lms load`
     * instead — this is the built-in runtime's own copy of the same decision.
     */
    contextSize: number;
    /** Layers offloaded to the GPU by the bundled runtime (`--gpu-layers`). 0 = CPU only. */
    gpuLayers: number;
    timeoutSeconds: number;
    maxTokens: number;
    temperature: number;
    /**
     * Show the model's code as a diff before it is applied.
     *
     * On by default, because a small model's answer is a *proposal* and a diff is how it is reviewed
     * (2026-09-14). Switched off, the same code is written straight into the file: the deterministic
     * rules still run first — a name that already exists is refused, the visibility is corrected — and
     * the write is a normal edit, so Ctrl+Z undoes it (asked 2026-09-16).
     */
    showDiff: boolean;
}

/** Raw settings as they come out of the manifest (every field possibly undefined/wrong-typed). */
export interface RawAssistantSettings {
    backend?: unknown;
    endpoint?: unknown;
    model?: unknown;
    modelPath?: unknown;
    threads?: unknown;
    contextSize?: unknown;
    gpuLayers?: unknown;
    timeoutSeconds?: unknown;
    maxTokens?: unknown;
    temperature?: unknown;
    showDiff?: unknown;
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
        contextSize: num(raw.contextSize, 4096, 512, 262144),
        gpuLayers: num(raw.gpuLayers, 0, 0, 999),
        timeoutSeconds: num(raw.timeoutSeconds, 60, 5, 600),
        maxTokens: num(raw.maxTokens, 4096, 64, 8192),
        temperature: num(raw.temperature, 0.2, 0, 1),
        // Only an explicit `false` turns the diff off: a missing setting, or anything unreadable, keeps
        // the safe default (review before writing).
        showDiff: raw.showDiff !== false
    };
}

/** True when the user has switched the feature on *and* there is somewhere to send requests: either a
 *  server they pointed at, or the bundled runtime that fills the endpoint in itself. */
export function assistantEnabled(cfg: AssistantConfig): boolean {
    if (cfg.backend === 'off') return false;
    if (cfg.backend === 'bundled') return true;
    return cfg.endpoint.length > 0;
}

/**
 * Heuristic: an embedding model cannot answer a chat request, and local servers happily list them next
 * to the chat models (LM Studio ships `text-embedding-nomic-embed-text-v1.5` alongside real ones). Only
 * the obvious names are flagged — this drives a *hint*, never a hard filter, so a false positive costs a
 * word in a dialog and nothing else.
 */
export function looksLikeEmbeddingModel(id: string): boolean {
    return /(^|[^a-z])(embed|bge|gte|e5)([^a-z]|$)/i.test(id);
}

/**
 * The `Model:` line of the status dialog.
 *
 * "(the server decides)" is technically true and practically useless — on a server with exactly one
 * model loaded the answer is known, and on a server with several the developer needs to know that
 * setting `model` is what pins one down (Ollama, in particular, refuses an unnamed request). Pure, so
 * every branch is asserted in the suite rather than being discovered in a dialog. Pass the *chat* models
 * (see `looksLikeEmbeddingModel`) so the counts match what can actually answer.
 */
export function describeModel(
    cfg: Pick<AssistantConfig, 'backend' | 'model' | 'modelPath'>,
    probe?: { ok: boolean; models: { id: string }[] }
): string {
    const fileName = (p: string) => p.replace(/\\/g, '/').split('/').pop() ?? p;
    if (cfg.backend === 'bundled') {
        return cfg.modelPath
            ? `Model: ${fileName(cfg.modelPath)} (bundled runtime)`
            : 'Model: none yet — run "AI: Set Up Local Model…"';
    }
    if (cfg.model) return `Model: ${cfg.model} (asked for by name)`;
    if (probe?.ok && probe.models.length === 1) {
        return `Model: ${probe.models[0].id} (the only chat model the server offers)`;
    }
    if (probe?.ok && probe.models.length > 1) {
        return `Model: (the server picks one of ${probe.models.length} chat models — set "model" to pin it down)`;
    }
    if (probe?.ok) return 'Model: (no chat model offered — only embeddings, which cannot answer)';
    if (probe && !probe.ok) return 'Model: (not known yet — the server is not answering)';
    return 'Model: (the server decides)';
}

/**
 * What is in memory *right now* — the question the settings cannot answer, and the one that made an unloaded
 * model look loaded (reported 2026-09-15: after Unload "the picker is not updated and the status check still
 * shows that model as being loaded").
 *
 * "Asked for by name" describes the *next* request; this describes *this moment*. Both are reported because
 * they disagree exactly when it matters — right after an unload — and one line without the other is
 * ambiguous in a way a developer notices and a log does not.
 *
 * `undefined` for the bundled backend (its runtime reports itself in `bundledStatusLines`) so the caller
 * never has to phrase a sentence it has no facts for.
 */
export function describeLoadedNow(
    cfg: Pick<AssistantConfig, 'backend' | 'model'>,
    loaded: string[]
): string | undefined {
    if (cfg.backend !== 'external') return undefined;
    const short = (id: string) => id.replace(/\\/g, '/').split('/').pop() ?? id;
    if (!loaded.length) {
        return cfg.model
            ? `Loaded now: nothing — the next request loads ${short(cfg.model)} first.`
            : 'Loaded now: nothing — the next request makes the server load one.';
    }
    const names = loaded.map(short).join(', ');
    // A pin may be qualified where the running id is not, or the reverse ("google/gemma-4-e4b" vs
    // "gemma-4-e4b") — same model, and comparing the short forms is what makes that true.
    if (!cfg.model || loaded.some((id) => id === cfg.model || short(id) === short(cfg.model))) {
        return `Loaded now: ${names}`;
    }
    return `Loaded now: ${names} — not ${short(cfg.model)}, which is what the next request asks for.`;
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
 * One streamed chunk, as far as this extension cares about it. Pure.
 *
 * `reasoning` exists because thinking models put their chain of thought in its own field. Measured
 * 2026-09-15 against LM Studio with `qwen/qwen3.5-9b`: a one-method request spent **837 reasoning
 * tokens** (3 186 characters) before writing a 71-character answer, and with a 900-token budget it
 * produced `finish_reason: length` and **nothing else** — which is what "0 characters" was. Reading the
 * field is what makes that explicable instead of silent.
 */
export interface SseChunk {
    /** The answer text. */
    content?: string;
    /** The model's thinking, when it thinks. Never used as code — always kept as evidence. */
    reasoning?: string;
    /** `stop` when it finished on its own, `length` when the token budget ran out. */
    finishReason?: string;
    /** Token counts, when the server reports them. */
    usage?: { completionTokens?: number; reasoningTokens?: number };
}

/**
 * Parses one SSE line into everything it carries. Streaming matters: the developer sees progress
 * instead of a frozen notification, and the inactivity watchdog is re-armed per chunk. Pure, so the
 * parser is tested directly against real captured chunks.
 */
export function parseSseChunk(line: string): SseChunk | undefined {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return undefined;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') return undefined;
    try {
        const obj = JSON.parse(payload) as {
            choices?: { delta?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown }; finish_reason?: unknown }[];
            usage?: { completion_tokens?: unknown; completion_tokens_details?: { reasoning_tokens?: unknown } };
        };
        const choice = obj.choices?.[0];
        const delta = choice?.delta ?? {};
        const chunk: SseChunk = {};
        if (typeof delta.content === 'string' && delta.content) chunk.content = delta.content;
        // LM Studio uses `reasoning_content`, llama.cpp/vLLM also emit `reasoning`; either counts.
        const reasoning = typeof delta.reasoning_content === 'string' ? delta.reasoning_content
            : typeof delta.reasoning === 'string' ? delta.reasoning
                : '';
        if (reasoning) chunk.reasoning = reasoning;
        if (typeof choice?.finish_reason === 'string') chunk.finishReason = choice.finish_reason;
        if (obj.usage) {
            chunk.usage = {
                completionTokens: typeof obj.usage.completion_tokens === 'number' ? obj.usage.completion_tokens : undefined,
                reasoningTokens: typeof obj.usage.completion_tokens_details?.reasoning_tokens === 'number'
                    ? obj.usage.completion_tokens_details.reasoning_tokens
                    : undefined
            };
        }
        return chunk.content || chunk.reasoning || chunk.finishReason || chunk.usage ? chunk : undefined;
    } catch {
        return undefined;
    }
}

/** The answer text of one SSE line — the narrow view of {@link parseSseChunk}. */
export function parseSseDelta(line: string): string | undefined {
    return parseSseChunk(line)?.content;
}

/** The text and the thinking out of a non-streaming `/chat/completions` body. Pure. */
export function parseChatCompletionFull(body: unknown): { text: string; reasoning: string } {
    const obj = body as {
        choices?: { message?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown }; text?: unknown }[];
    };
    const first = obj?.choices?.[0];
    const reasoning = typeof first?.message?.reasoning_content === 'string' ? first.message.reasoning_content
        : typeof first?.message?.reasoning === 'string' ? first.message.reasoning
            : '';
    if (typeof first?.message?.content === 'string') return { text: first.message.content, reasoning };
    if (typeof first?.text === 'string') return { text: first.text, reasoning };
    return { text: '', reasoning };
}

/** Pulls the full text out of a non-streaming `/chat/completions` body. Pure. */
export function parseChatCompletion(body: unknown): string {
    return parseChatCompletionFull(body).text;
}

export interface ChatOptions {
    onToken?: (text: string) => void;
    /** Progress only: the model is still thinking (reasoning models). `chars` is the running total. */
    onReasoning?: (chars: number) => void;
    signal?: AbortSignal;
    fetchImpl?: FetchLike;
}

/** What a request produced — including the evidence needed to explain an empty answer. */
export interface ChatOutcome {
    text: string;
    /** The model's thinking, when it thinks. Never code, but never thrown away either: it is the only
     * explanation for an answer that never came. */
    reasoning: string;
    /** `stop` when it finished on its own, `length` when the token budget ran out. */
    finishReason?: string;
    completionTokens?: number;
    reasoningTokens?: number;
}

/**
 * Sends a chat request and returns the answer **and** the thinking behind it. Streams when the server
 * supports it (every local runtime does) and falls back to a single JSON read when it does not.
 *
 * `timeoutSeconds` is an **inactivity** budget, not a total one: the watchdog is re-armed every time
 * data arrives, so a 3B model on a CPU taking two minutes for a long method is fine while a server that
 * has stopped talking is caught in seconds. A total budget would have killed exactly the slow-but-busy
 * case this feature exists for — and a thinking model is busy while it thinks, so this is also what lets
 * a 27B reason for a minute without being killed.
 */
export async function chatDetailed(
    cfg: AssistantConfig,
    messages: ChatMessage[],
    opts: ChatOptions = {}
): Promise<ChatOutcome> {
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
    const apply = (chunk: SseChunk | undefined, into: ChatOutcome) => {
        if (!chunk) return;
        if (chunk.content) {
            into.text += chunk.content;
            opts.onToken?.(chunk.content);
        }
        if (chunk.reasoning) {
            into.reasoning += chunk.reasoning;
            opts.onReasoning?.(into.reasoning.length);
        }
        if (chunk.finishReason) into.finishReason = chunk.finishReason;
        if (chunk.usage?.completionTokens !== undefined) into.completionTokens = chunk.usage.completionTokens;
        if (chunk.usage?.reasoningTokens !== undefined) into.reasoningTokens = chunk.usage.reasoningTokens;
    };
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
                stream: true,
                // Ask for the token counts in the closing chunk: the reasoning count is what turns "0
                // characters" into "837 of its 900 tokens went on thinking". A server that does not know
                // the field ignores it.
                stream_options: { include_usage: true }
            })
        });
        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new Error(`The server answered HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
        }

        // The response is an SSE stream; read it chunk by chunk and hand every delta to the caller.
        const body = res.body as { getReader?: () => { read(): Promise<{ done: boolean; value?: Uint8Array }> } } | undefined;
        if (typeof body?.getReader !== 'function') {
            const full = parseChatCompletionFull(await res.json());
            if (full.text) opts.onToken?.(full.text);
            return { text: full.text, reasoning: full.reasoning };
        }

        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let raw = '';
        const outcome: ChatOutcome = { text: '', reasoning: '' };
        for (; ;) {
            const { done, value } = await reader.read();
            if (done) break;
            armWatchdog(); // data arrived: the server is alive, whatever its speed
            const chunk = decoder.decode(value, { stream: true });
            raw += chunk;
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? ''; // the last line may be half-received
            for (const line of lines) apply(parseSseChunk(line), outcome);
        }
        buffer += decoder.decode();
        apply(parseSseChunk(buffer), outcome);
        // A server that ignores `stream: true` sends one plain JSON body: no `data:` lines at all, so
        // nothing was accumulated and the answer is in the raw body.
        if (!outcome.text && !outcome.reasoning) {
            try {
                const full = parseChatCompletionFull(JSON.parse(raw));
                if (full.text || full.reasoning) {
                    if (full.text) opts.onToken?.(full.text);
                    return { ...outcome, text: full.text, reasoning: full.reasoning };
                }
            } catch {
                /* not JSON either — fall through with whatever arrived */
            }
        }
        return outcome;
    } catch (err) {
        throw new Error(describeError(err));
    } finally {
        if (timer) clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onAbort);
    }
}

/** The answer text on its own, for callers that do not care how it was reached. */
export async function chat(
    cfg: AssistantConfig,
    messages: ChatMessage[],
    opts: ChatOptions = {}
): Promise<string> {
    return (await chatDetailed(cfg, messages, opts)).text;
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
        const repeated = blocks.length > 1 ? `The model repeated the code ${blocks.length} times; the last block was used.` : '';
        return { code, note: repeated || outside.slice(0, 400) };
    }

    // A fence that was never closed: the answer was cut off, usually by the token budget. What is inside
    // is still the best thing available, so take it and say so — throwing it away is what produced the
    // unactionable "returned nothing usable" on the first bundled run (2026-09-14).
    const openFence = text.lastIndexOf(CODE_FENCE);
    if (openFence >= 0) {
        const after = text.slice(openFence + CODE_FENCE.length).replace(/^[^\n]*\n/, '');
        const salvaged = tidyCode(after);
        if (salvaged) {
            return {
                code: salvaged,
                note: 'The answer was cut off before its code block closed — check the end of the method.'
            };
        }
    }

    // No fence at all. Only take it if it reads like code: an unfenced answer is at least as likely to be
    // a sentence about the change, and substituting a method with prose is worse than changing nothing.
    const bare = tidyCode(text);
    if (looksLikeCode(bare)) {
        return { code: bare, note: 'The model answered without a code fence; the whole answer was used.' };
    }
    return { code: '', note: '' };
}

/**
 * Is this unfenced text source code rather than a sentence about it? Deliberately conservative — the
 * cost of saying no is a clear message, the cost of saying yes is a method replaced by a paragraph.
 */
export function looksLikeCode(text: string): boolean {
    const body = String(text ?? '').trim();
    if (!body) return false;
    if (/[{}]/.test(body)) return true;
    if (/\b(private|public|internal|protected|static|void|async|Sub|End Sub|Function|End Function|Dim|If\b)\b/.test(body)) return true;
    // A body without braces or keywords: accept it when its shape is code — several lines, indented or
    // punctuated like statements — and reject prose, whose lines end in full stops.
    const lines = body.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return false;
    const codeish = lines.filter((l) => /^\s/.test(l) || /[;{,)]\s*$/.test(l.trim())).length;
    return codeish * 2 >= lines.length;
}

/**
 * Why an answer was not usable — the sentence the developer reads instead of a shrug. Pure, so the
 * wording is asserted: the first real "returned nothing usable" arrived with no evidence at all, which
 * is exactly what made it impossible to act on.
 */
/** Why an answer came back empty — the numbers that make it actionable. */
export interface EmptyAnswerDiagnostics {
    /** Characters of thinking the model produced before it stopped. */
    reasoningChars?: number;
    reasoningTokens?: number;
    /** `length` means the budget ran out; that is the difference between "too small" and "rambled". */
    finishReason?: string;
    /** Rough size of the prompt that was sent (~characters/4), when it is known. */
    promptTokens?: number;
    /** The window the request had to fit in, when it is known. */
    contextSize?: number;
}

export function describeEmptyAnswer(answer: string, diag: EmptyAnswerDiagnostics = {}): string {
    const text = String(answer ?? '');
    // The prompt and the window, when they are known: "the budget ran out" is only actionable if it says
    // how much of the window the *prompt* had already taken (added 2026-09-16, after a bundled 12B model
    // answered with nothing at all).
    const squeeze = diag.promptTokens && diag.contextSize
        ? ` The prompt was about ${diag.promptTokens} tokens of a ${diag.contextSize}-token window, so the `
        + 'answer had little room left.'
        : '';
    if (!text.trim()) {
        const thinking = diag.reasoningChars ?? 0;
        if (thinking > 0) {
            const tokens = diag.reasoningTokens ? ` — ${diag.reasoningTokens} tokens` : '';
            const spentAll = diag.finishReason === 'length';
            return `This model thinks before it answers: it wrote ${thinking} characters of reasoning${tokens} `
                + `${spentAll ? 'and then ran out of budget before writing any code' : 'but no code'}. `
                + `Raise "avaloniaDesigner.assistant.maxTokens" (4096 is enough for a thinking model), `
                + `or choose a coder model that answers directly.${spentAll ? squeeze : ''}`;
        }
        if (diag.finishReason === 'length') {
            return 'The answer budget ran out before the model wrote anything — raise '
                + `"avaloniaDesigner.assistant.maxTokens".${squeeze}`;
        }
        return `The model returned an empty answer${diag.finishReason ? ` (finish reason "${diag.finishReason}")` : ''}.`
            + `${squeeze} A model that says nothing at all usually cannot use the prompt it was given — `
            + 'try the same request with another model, and check the window above.';
    }
    if (text.includes(CODE_FENCE)) {
        return 'The code block in the answer was never closed — it was cut off before it was complete.';
    }
    const firstLine = text.trim().split(/\r?\n/)[0].slice(0, 140);
    return `The model answered with prose instead of code: "${firstLine}"`;
}

/**
 * Trims the blank lines a model likes to put around its answer, and nothing else. `String.trim()` is
 * wrong here: it would eat the first line's indentation, and since `reindent` re-bases every line on the
 * *smallest* indentation it finds, that would then push the whole body one level deeper.
 */
function tidyCode(code: string): string {
    return String(code ?? '')
        // The sidecar decodes special tokens on purpose (so it can stop at the model's end-of-turn
        // marker), which means such a marker can land inside the answer. It is never part of the method.
        // Trade-off: a marker inside a string literal would be removed too — vanishingly unlikely in a
        // method body, and the alternative is shipping `<|im_end|>` into the file.
        .replace(/<\|[a-zA-Z_]+\|>|<\|end_of_turn>|<\|start_of_turn>|<\/s>/g, '')
        .replace(/^\n+/, '')
        .replace(/\s+$/, '');
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

/**
 * Rough token count for a prompt or an answer (`characters / 4`).
 *
 * A rule of thumb, deliberately: it is used to keep a request inside the window the model was started
 * with, and for that it only has to be in the right ballpark — being 20% wrong still leaves headroom.
 */
export function estimateTokens(text: string): number {
    return Math.ceil(String(text ?? '').length / 4);
}

/**
 * The answer budget a request may ask for, given the window it has to share with its prompt.
 *
 * Found on 2026-09-16, after a bundled 12B model answered with **0 characters**: the window the sidecar
 * was started with (4096 by default) and the answer budget the extension asked for (4096 by default,
 * raised for thinking models in 0.9.15) were chosen independently, so prompt + answer could not both fit.
 * The sidecar's own clamp reserves a flat 512 tokens for the prompt — a number that was right when the
 * request cap *was* 900 tokens and has been wrong since. A thinking model then spends what is left on
 * thinking and returns `finish_reason: length` with nothing to show for it.
 *
 * The prompt is therefore measured and the answer gets what is actually left. Only meaningful for the
 * bundled runtime: an external server (LM Studio, Ollama) decides its own context, and guessing it would
 * cut requests that are perfectly fine there.
 */
export function answerBudget(
    maxTokens: number,
    contextSize: number,
    promptTokens: number
): { maxTokens: number; reduced: boolean; room: number } {
    // 64 tokens of slack for the template and the stop marker, and a floor so a huge prompt still gets a
    // usable (if short) answer instead of a refusal: the model can always say "that does not fit".
    const room = Math.max(64, Math.floor(contextSize - promptTokens - 64));
    return { maxTokens: Math.max(64, Math.min(maxTokens, room)), reduced: maxTokens > room, room };
}

/**
 * The context the bundled runtime should be started with, given the answer budget the user asked for.
 *
 * The other half of the same bug: a 4096-token window with a 4096-token answer budget leaves nothing for
 * the prompt, so the window grows to hold both — unless the user set an explicit context length, which is
 * honoured as-is (the per-request clamp above keeps that safe).
 */
export function contextForBudget(requestedContext: number, maxTokens: number): number {
    const asked = Math.round(Number(requestedContext) || 0);
    if (asked > 0) return asked;
    return Math.max(DEFAULT_CONTEXT_SIZE, Math.round(maxTokens) + 2048);
}

// ---------------- how big a prompt may be (asked 2026-09-16) ----------------
//
// The user's aim, in their words: *"limit the length of the prompt to ensure the model's response does not take
// too long to process but still replies with a reasonably accurate result."*
//
// Half of that is physics and half is a trade-off, and they are worth keeping apart:
//   - **Physics:** prompt-processing time is linear in prompt tokens, so capping the prompt genuinely bounds
//     how long the model takes to *start* answering. That is real and worth doing.
//   - **Trade-off:** what gets dropped is context the model would have used. This project includes one short
//     sibling method on purpose — it is what lifts a small model from "plausible C#" to "compiles here" — so
//     dropping it makes the answer *cheaper*, not *better*. The parts are therefore dropped in a fixed,
//     explainable order (the optional ones only), the order is reported, and the user's own sentence is
//     capped rather than their code.
//   - What a cap cannot do is make the *answer* shorter: that is `maxTokens`, a separate decision.

/** Tokens reserved for the chat template, the stop marker and rounding. */
const PROMPT_SLACK_TOKENS = 64;

/** How much of the window is left for the prompt once the answer has its share. */
export function promptRoom(contextSize: number, maxTokens: number): number {
    return Math.max(0, Math.floor(contextSize - maxTokens - PROMPT_SLACK_TOKENS));
}

/** One part of a prompt, so it can be left out when the window is full. */
export interface PromptPart {
    /** Named in the log when it is dropped: `style`, `members`, `method`… */
    name: string;
    text: string;
    /** Required parts are never dropped; if they alone do not fit, the request is refused. */
    required: boolean;
}

export interface PromptFit {
    /** The parts to send, in the order they were given. */
    kept: PromptPart[];
    /** Names of the optional parts that had to go, in the order they were dropped. */
    dropped: string[];
    /** Tokens the *required* parts need beyond the room (0 when everything fitted). */
    overflowTokens: number;
    /** The room the fit was computed against. */
    room: number;
    /** Tokens the kept parts need. */
    usedTokens: number;
}

/**
 * Keeps the parts that fit and drops the optional ones that do not — in the order they are given.
 *
 * Callers order the optional parts by value, so the first one is the last to be dropped. For the
 * generate-a-member prompt that order is the member list (cheap, and it is what stops the model inventing
 * calls) before the style sample (expensive, and only about idiom).
 */
export function fitPromptParts(parts: PromptPart[], room: number): PromptFit {
    const tokensOf = (p: PromptPart) => estimateTokens(p.text);
    const required = parts.filter((p) => p.required);
    const optional = parts.filter((p) => !p.required);
    const requiredTokens = required.reduce((n, p) => n + tokensOf(p), 0);
    if (requiredTokens > room) {
        return { kept: required, dropped: [], overflowTokens: requiredTokens - room, room, usedTokens: requiredTokens };
    }
    let left = room - requiredTokens;
    const dropped: string[] = [];
    const keptOptional: PromptPart[] = [];
    for (const part of optional) {
        const cost = tokensOf(part);
        if (cost <= left) {
            left -= cost;
            keptOptional.push(part);
        } else {
            dropped.push(part.name);
        }
    }
    // The original order is restored so the prompt reads the way it always did when nothing was dropped.
    const kept = parts.filter((p) => required.includes(p) || keptOptional.includes(p));
    return {
        kept,
        dropped,
        overflowTokens: 0,
        room,
        usedTokens: kept.reduce((n, p) => n + tokensOf(p), 0)
    };
}

/**
 * The cap on the developer's own sentence.
 *
 * A sentence or two is what the feature asks for, so this is generous rather than strict: it exists to stop a
 * pasted wall of text from dominating the prompt (and the wait), not to make people count words.
 */
export const MAX_DESCRIPTION_TOKENS = 400;

/** Tokens left for the sentence: what the prompt does not need, capped, never negative. */
export function descriptionAllowance(room: number, usedTokens: number): number {
    return Math.max(0, Math.min(MAX_DESCRIPTION_TOKENS, Math.floor(room - usedTokens)));
}

/** `315` → `~315 tokens (~1260 characters)`. One wording for every place that shows the allowance. */
export function allowanceText(tokens: number): string {
    return `~${tokens} tokens (~${tokens * 4} characters)`;
}

// ---------------- a brand-new member (asked 2026-09-16) ----------------
//
// "AI: Implement in Function…" could only *rewrite the method the caret is in*. The user asked for the
// other half: a caret outside every method should mean "write me a new one" — *"Create a function named
// 'SortArray' that sorts the contents of a passed array"* — placed at the caret, `private`, and
// `static`/`Shared` whenever that is possible.
//
// Everything below is pure: the prompt, the answer parser, the visibility rules, the insertion and the
// XAML attribute edit. The command in `assistantUi.ts` only gathers facts and shows the diff. That split
// is what lets the whole feature be tested without VS Code — the same reason `extractCode` and
// `spliceMethod` live here rather than in the UI layer.

/**
 * Separates the `using`/`Imports` lines the new member needs from the member itself.
 *
 * The prompt asks for it, but a small model often just puts the usings at the top of the block and
 * carries on — so the parser accepts both, and only treats *leading* using lines as header additions.
 * Anything else (including a leading comment) belongs to the member.
 */
export const NEW_MEMBER_MARKER = '--- new member ---';

export interface GeneratePromptInput {
    language: 'cs' | 'vb';
    description: string;
    /** `using …`/`Imports …` and the class declaration line — context the model may read. */
    header: string;
    /** The members the class already has, one per line, with their modifiers. */
    members: string;
    /** One short existing member, as a style reference. */
    style?: string;
}

/** The visibility the answer must end up with, spelled out so a small model cannot guess wrong. */
function visibilityContract(language: 'cs' | 'vb'): string {
    return language === 'vb'
        ? 'Always `Private`. Add `Shared` only when the body uses no instance member, no form control and ' +
          'no `Me` — never `Static` (in VB that keyword is for local variables, not members).'
        : 'Always `private`. Add `static` only when the body uses no instance member, no form control and ' +
          'no `this` — the event handler of a form can never be static.';
}

export function buildGeneratePrompt(input: GeneratePromptInput): ChatMessage[] {
    const fence = input.language === 'vb' ? 'vb' : 'csharp';
    const lines = [
        `Language: ${languageLabel(input.language)}`,
        '',
        'The class these members belong to (context only — do not change it, do not repeat it):',
        CODE_FENCE + fence,
        input.header.trimEnd(),
        CODE_FENCE,
        ''
    ];
    if (input.members.trim()) {
        lines.push(
            'Members the class already has (context only — do not change them, do not write them again; ' +
            'you may call them):',
            CODE_FENCE + fence,
            input.members.trimEnd(),
            CODE_FENCE,
            ''
        );
    }
    if (input.style?.trim()) {
        lines.push(
            'One of those members in full, as a style reference (do not change it):',
            CODE_FENCE + fence,
            input.style.trimEnd(),
            CODE_FENCE,
            ''
        );
    }
    lines.push(
        `The developer wants a NEW member, which does not exist yet:\n"""${input.description.trim()}"""`,
        '',
        'Write that member — its declaration and its complete body, nothing else:',
        CODE_FENCE + fence,
        `(${visibilityContract(input.language)})`,
        `(if the body needs a namespace this file does not import yet, put those using/Imports lines ` +
            `FIRST, then a line containing exactly ${NEW_MEMBER_MARKER}, then the member)`,
        CODE_FENCE,
        '',
        `Reply with ONE ${CODE_FENCE}${fence} code block and nothing outside it. The block must contain the ` +
        `complete new member — indented one level inside the class, with a real body rather than a ` +
        `comment like "TODO". Do not write a second member, do not repeat the class or the existing ` +
        `members, and do not explain anything.`
    );
    return [
        {
            role: 'system',
            content:
                `You are a precise ${languageLabel(input.language)} coding assistant inside a desktop form ` +
                'designer. You return complete, compilable members and nothing else. You never invent ' +
                'APIs: types and members must come from the code and the names you are given, or from the ' +
                'base class library.'
        },
        { role: 'user', content: lines.join('\n') }
    ];
}

export interface NewMemberAnswer {
    /** `using`/`Imports` lines the member asked for (may be empty). */
    usings: string[];
    /** The member itself, complete. */
    member: string;
    note: string;
}

/** A `using X;` / `Imports X` line, as either language spells it. */
function isUsingLine(line: string): boolean {
    const t = line.trim();
    return /^using\s+[\w.]+\s*;$/.test(t) || /^using\s+[\w.]+\s*=\s*[\w.]+;$/.test(t) || /^Imports\s+[\w.]+$/i.test(t) || /^Global\s+Imports/i.test(t);
}

export function parseNewMemberAnswer(answer: string): NewMemberAnswer {
    const { code, note } = extractCode(answer);
    const text = String(code ?? '').replace(/\r\n/g, '\n');
    // The marker may arrive commented out (`// --- new member ---`, `' --- new member ---`) — models do
    // that when the ask itself was inside a code block. Accepting it costs nothing.
    const markerRe = new RegExp("^[ \\t]*(?://+|'|#|--)?\\s*" + NEW_MEMBER_MARKER.trim() + "\\s*$", 'mi');
    const at = markerRe.exec(text);
    const head = at ? text.slice(0, at.index) : '';
    const tail = at ? text.slice(at.index + at[0].length) : text;

    const usings: string[] = [];
    const bodyLines = tail.split('\n');
    // Without a marker the usings are whatever leads the block — `using` cannot appear inside a class,
    // so those lines are unambiguously header additions.
    while (bodyLines.length && !bodyLines[0].trim()) bodyLines.shift();
    while (bodyLines.length && isUsingLine(bodyLines[0])) usings.push(bodyLines.shift()!.trim());
    for (const line of head.split('\n')) {
        const t = line.trim();
        if (isUsingLine(t)) usings.push(t);
    }
    return { usings, member: tidyCode(bodyLines.join('\n')), note };
}

/** True for a `using`/`Imports` line the file already has, so a duplicate is never added. */
export function alreadyImported(header: string, line: string): boolean {
    const wanted = line.trim().replace(/;$/, '').replace(/^(using|Imports)\s+/i, '').toLowerCase();
    return header.split(/\r?\n/).some((l) => l.trim().replace(/;$/, '').replace(/^(using|Imports)\s+/i, '').toLowerCase() === wanted);
}

/** One member the class already has, as the prompt and the safety rails need it. */
export interface MemberInfo {
    name: string;
    /** The declaration line, trimmed — what goes into the prompt's member list. */
    declaration: string;
    isStatic: boolean;
    /** 1-based line of the declaration. */
    line: number;
}

const CS_MEMBER_RE = /^[ \t]*((?:(?:public|private|protected|internal|static|async|virtual|override|sealed|partial|new|extern|unsafe|readonly)\s+)*)([\w<>\[\],.?]+)\s+([A-Za-z_]\w*)\s*(<[^>]*>)?\s*\(/;
const VB_MEMBER_RE = /^[ \t]*((?:(?:Public|Private|Protected|Friend|Shared|Overrides|Overridable|NotOverridable|MustOverride|Async|Iterator|Partial|Static)\s+)*)(Sub|Function)\s+([A-Za-z_]\w*)\s*\(/i;
// A property is a member too, and it is the one a new method is most likely to collide with.
const CS_PROP_RE = /^[ \t]*((?:(?:public|private|protected|internal|static|virtual|override|sealed|partial|new|required)\s+)*)([\w<>\[\],.?]+)\s+([A-Za-z_]\w*)\s*\{/;
const VB_PROP_RE = /^[ \t]*((?:(?:Public|Private|Protected|Friend|Shared|Overrides|Overridable|NotOverridable|MustOverride|ReadOnly|WriteOnly|Default)\s+)*)Property\s+([A-Za-z_]\w*)/i;
const VB_TYPE_RE = /^[ \t]*(?:(?:Public|Private|Protected|Friend|Partial|NotInheritable|MustInherit)\s+)*(Class|Module|Structure)\s+([A-Za-z_]\w*)/i;
const CS_TYPE_RE = /^[ \t]*(?:(?:public|private|protected|internal|sealed|abstract|partial|static|unsafe)\s+)*(class|struct|record|interface)\s+([A-Za-z_]\w*)/;

/**
 * Words that can never be a return type, so a statement is never mistaken for a declaration.
 *
 * Without this, `return Foo(1);` reads as a member called `Foo` — and a member list that contains the
 * body's call sites would then make the "is this body safe to make static?" check refuse everything.
 */
const NOT_A_RETURN_TYPE = new Set([
    'return', 'throw', 'yield', 'await', 'var', 'if', 'else', 'foreach', 'while', 'for', 'switch',
    'case', 'using', 'lock', 'do', 'try', 'catch', 'finally', 'new', 'goto', 'break', 'continue',
    'default', 'nameof', 'typeof', 'sizeof', 'checked', 'unchecked', 'get', 'set', 'add', 'remove'
]);

/**
 * The members a file declares, read line by line.
 *
 * A real parser would be better, but this has to agree with `methodsIn()` in `codeBehindCheck.ts` (which
 * is line-based for the same reason) and it only ever *suggests*: every use below is either prompt
 * context, a duplicate check or an insertion point, and the diff is what the developer approves. Nested
 * lambdas and local functions are not members and are not matched — none of them can carry a modifier.
 */
export function memberSignatures(text: string, language: 'cs' | 'vb'): MemberInfo[] {
    const out: MemberInfo[] = [];
    const lines = text.replace(/\uFEFF/g, '').split(/\r?\n/);
    lines.forEach((raw, index) => {
        const m = (language === 'vb' ? VB_MEMBER_RE : CS_MEMBER_RE).exec(raw);
        const p = m ? undefined : (language === 'vb' ? VB_PROP_RE : CS_PROP_RE).exec(raw);
        if (!m && !p) return;
        if (m && language === 'cs' && NOT_A_RETURN_TYPE.has(m[2])) return;
        if (p && language === 'cs' && NOT_A_RETURN_TYPE.has(p[2])) return;
        const modifiers = (m ?? p)![1];
        const name = (m ?? p)![3];
        out.push({
            name,
            declaration: raw.trim(),
            isStatic: language === 'vb' ? /\bShared\b/i.test(modifiers) : /\bstatic\b/.test(modifiers),
            line: index + 1
        });
    });
    return out;
}

/** A type (class/module/struct) in the file, with the span an insertion needs. */
export interface TypeSpan {
    name: string;
    /** 1-based line of the declaration. */
    declLine: number;
    /** 1-based line of the closing brace / `End Class`. */
    endLine: number;
}

/**
 * The innermost type whose body contains `line`, or undefined when the caret is not inside one.
 *
 * C# has no `End Class` to search for, so the closing brace is found by counting from the declaration —
 * ignoring braces in line comments and string literals, which is as much as this needs to be right
 * about: it decides *where to insert*, and a caret outside every type is refused rather than guessed at.
 */
export function enclosingTypeSpan(text: string, line: number, language: 'cs' | 'vb'): TypeSpan | undefined {
    const lines = text.replace(/\uFEFF/g, '').split(/\r?\n/);
    const found: TypeSpan[] = [];
    if (language === 'vb') {
        const stack: { name: string; declLine: number }[] = [];
        lines.forEach((raw, index) => {
            const decl = VB_TYPE_RE.exec(raw);
            if (decl) stack.push({ name: decl[2], declLine: index + 1 });
            else if (/^[ \t]*End\s+(Class|Module|Structure)\b/i.test(raw) && stack.length) {
                const open = stack.pop()!;
                found.push({ name: open.name, declLine: open.declLine, endLine: index + 1 });
            }
        });
    } else {
        lines.forEach((raw, index) => {
            const decl = CS_TYPE_RE.exec(raw);
            if (!decl) return;
            const end = csBlockEnd(lines, index);
            if (end > index) found.push({ name: decl[2], declLine: index + 1, endLine: end + 1 });
        });
    }
    const hits = found.filter((t) => t.declLine <= line && line <= t.endLine);
    if (!hits.length) return undefined;
    // Innermost wins: a nested class is a legal home for a member too.
    return hits.sort((a, b) => b.declLine - a.declLine)[0];
}

/** Index of the line holding the `}` that closes the block starting at `declIndex` (0-based). */
function csBlockEnd(lines: string[], declIndex: number): number {
    let depth = 0;
    let seenOpen = false;
    for (let i = declIndex; i < lines.length; i++) {
        const code = lines[i]
            .replace(/\/\/.*$/, '')
            .replace(/\/\*.*?\*\//g, '')
            .replace(/'(?:\\.|[^'\\])*'/g, "''")
            .replace(/"(?:\\.|[^"\\])*"/g, '""');
        for (const ch of code) {
            if (ch === '{') { depth++; seenOpen = true; }
            else if (ch === '}') {
                depth--;
                if (seenOpen && depth <= 0) return i;
            }
        }
    }
    return -1;
}

/** The indentation a new member should get: the first existing member's, else one level inside the type. */
export function memberIndent(text: string, type: TypeSpan, language: 'cs' | 'vb'): string {
    const lines = text.replace(/\uFEFF/g, '').split(/\r?\n/);
    for (let i = type.declLine; i < type.endLine - 1 && i < lines.length; i++) {
        if ((language === 'vb' ? VB_MEMBER_RE : CS_MEMBER_RE).test(lines[i] ?? '')) {
            return /^[ \t]*/.exec(lines[i] ?? '')?.[0] ?? '    ';
        }
    }
    const declIndent = /^[ \t]*/.exec(lines[type.declLine - 1] ?? '')?.[0] ?? '';
    return declIndent + '    ';
}

export interface InsertMemberInput {
    text: string;
    /** 1-based line the caret is on. The member goes after it, never inside it. */
    caretLine: number;
    member: string;
    type: TypeSpan;
    language: 'cs' | 'vb';
}

/**
 * Inserts a new member just below the caret, on its own lines, with one blank line of separation.
 *
 * "At the caret" is deliberately snapped to a line boundary (asked 2026-09-16): inserting *at* the caret
 * character would split whatever line it is on and produce two half-statements — and a `}` on the far
 * side of the caret is worse. The member therefore starts on the line after the caret's, keeps the
 * neighbouring members' indentation, and is kept apart by a blank line unless the next line already is
 * one or closes the type.
 */
export function insertMember(input: InsertMemberInput): string {
    const eol = detectEol(input.text);
    const hadBom = input.text.charCodeAt(0) === 0xFEFF;
    const body = input.text.replace(/\uFEFF/g, '');
    const lines = body.split(/\r\n|\n/);
    const indent = memberIndent(body, input.type, input.language);
    const memberLines = reindent(input.member, indent, '\n').split('\n');

    // Where the member may go: after the type's first body line (never between `class F` and its `{`),
    // and no further than its closing line — a caret parked on the final `}` still means "inside".
    const bodyStart = input.language === 'vb'
        ? input.type.declLine
        : Math.max(input.type.declLine, lines.findIndex((l, i) => i >= input.type.declLine - 1 && l.includes('{')) + 1);
    const after = Math.min(Math.max(input.caretLine, bodyStart), input.type.endLine - 1);
    // Index of the first line that moves down: the one after whichever line the caret is on.
    const at = Math.min(Math.max(after, bodyStart), lines.length);

    const prev = at > 0 ? (lines[at - 1] ?? '') : '';
    const next = lines[at] ?? '';
    const closesType = input.language === 'vb'
        ? /^[ \t]*End\s+(Class|Module|Structure)\b/i.test(next)
        : /^\s*\}/.test(next);
    // A blank line already next to the caret is used as the separator instead of adding a second one, and
    // no blank is added before a closing brace — that is the shape every file in this project already has.
    const leading = prev.trim() ? [''] : [];
    const trailing = next.trim() && !closesType ? [''] : [];
    const result = [...lines.slice(0, at), ...leading, ...memberLines, ...trailing, ...lines.slice(at)].join(eol);
    return (hadBom ? '\uFEFF' : '') + result;
}

/**
 * The two edits that add a member to a file: the member itself, and the `using`/`Imports` lines it asked
 * for.
 *
 * The member goes in first, so the line numbers it was computed from still mean what they meant; the
 * usings are then inserted above it, where they cannot move it. They go after the last `using` (C#) or
 * the last `Imports` (VB — or the last `Option`, when the file has none), because a using written after
 * a namespace or a class body does not compile. A line the file already has is never added twice, so
 * applying the same member again cannot damage the header.
 */
export function addMemberToFile(input: InsertMemberInput & { usings: string[] }): { text: string; added: string[] } {
    const withMember = insertMember(input);
    const missing = (input.usings ?? [])
        .map((u) => String(u ?? '').trim())
        .filter((u) => u.length > 0 && isUsingLine(u) && !alreadyImported(withMember, u));
    if (!missing.length) return { text: withMember, added: [] };

    const eol = detectEol(input.text);
    const hadBom = input.text.charCodeAt(0) === 0xFEFF;
    const lines = withMember.replace(/\uFEFF/g, '').split(/\r\n|\n/);
    // Only the lines above the class are searched: the member went in *below* the declaration, so this
    // line number still means what it meant when the caret was read.
    const limit = Math.max(0, input.type.declLine - 1);
    let anchor = -1;
    for (let i = 0; i < limit; i++) {
        const t = (lines[i] ?? '').trim();
        if (input.language === 'vb' ? /^Imports\b/i.test(t) : /^using\b/.test(t)) anchor = i;
        else if (input.language === 'vb' && anchor < 0 && /^Option\b/i.test(t)) anchor = i;
    }
    const at = anchor >= 0 ? anchor + 1 : 0;
    const merged = [...lines.slice(0, at), ...missing, ...lines.slice(at)].join(eol);
    return { text: (hadBom ? '\uFEFF' : '') + merged, added: missing };
}

/** A member's declared name, from the answer. Used for the duplicate check, so it must not guess. */export function memberNameOf(member: string, language: 'cs' | 'vb'): string | undefined {
    for (const raw of String(member ?? '').split(/\r?\n/)) {
        if (!raw.trim() || /^[ \t]*(?:\/\/|'|#|\/\*)/.test(raw)) continue;
        const vb = /^[ \t]*(?:(?:Public|Private|Protected|Friend|Shared|Overrides|Overridable|NotOverridable|MustOverride|Async|Iterator|Partial|Static)\s+)*(?:Sub|Function)\s+([A-Za-z_]\w*)/i.exec(raw);
        if (vb) return vb[1];
        const cs = /^[ \t]*(?:(?:public|private|protected|internal|static|async|virtual|override|sealed|partial|new|extern|unsafe|readonly)\s+)*[\w<>\[\],.?]+\s+([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*\(/.exec(raw);
        if (cs) return cs[1];
    }
    return undefined;
}

export interface VisibilityFix {
    member: string;
    /** What was changed, for the log — empty when the answer was already right. */
    changed: string[];
}

/** `private` (C#) / `Private` (VB), whatever the answer said. */
function withVisibility(modifiers: string, language: 'cs' | 'vb'): { modifiers: string; stripped: boolean; already: boolean } {
    const source = language === 'vb'
        ? /\b(Public|Private|Protected|Friend|Protected\s+Friend|Private\s+Protected)\b/gi
        : /\b(public|private|protected|internal)\b(\s+(?:internal|protected))?/g;
    const already = language === 'vb' ? /\bPrivate\b/.test(modifiers) : /\bprivate\b/.test(modifiers);
    const stripped = source.test(modifiers);
    const kept = modifiers.replace(source, ' ').replace(/\s+/g, ' ').trim();
    const word = language === 'vb' ? 'Private' : 'private';
    return { modifiers: `${word} ${kept}`.trim(), stripped, already };
}

/**
 * Forces the visibility the user asked for: always `private`, and `static`/`Shared` **only** where it can
 * do no harm.
 *
 * "Where possible" is decided here rather than trusted to the model, because a wrong `static` is a build
 * error in the one case that matters most: a form's event handler can never be static, and a helper that
 * touches a control or another instance member cannot be either. The body is checked against the names
 * the class already has — a body that mentions only its parameters and framework types is safe.
 */
export function normaliseMemberVisibility(
    member: string,
    language: 'cs' | 'vb',
    controls: readonly string[],
    members: readonly MemberInfo[],
    selfName?: string
): VisibilityFix {
    const changed: string[] = [];
    const lines = String(member ?? '').split(/\r?\n/);
    const declIndex = lines.findIndex((l) => (language === 'vb' ? VB_MEMBER_RE : CS_MEMBER_RE).test(l));
    if (declIndex < 0) return { member, changed };
    const decl = lines[declIndex];
    const re = language === 'vb' ? VB_MEMBER_RE : CS_MEMBER_RE;
    const m = re.exec(decl)!;
    const modifiers = m[1];
    const body = lines.slice(declIndex + 1).join('\n');
    const name = memberNameOf(member, language) ?? '';
    const isHandler = handlerFromMemberName(name, controls) !== undefined;

    const usesInstance = /\bthis\b/.test(body) || (language === 'vb' && /\bMe\b/.test(body))
        || controls.some((c) => c && new RegExp(`\\b${c.replace(/[$]/g, '\\$')}\\b`).test(body))
        || members.some((other) => other.name !== name && other.name !== selfName && !other.isStatic
            && new RegExp(`\\b${other.name}\\b`).test(body));
    const wantsStatic = !usesInstance && !isHandler;

    const vis = withVisibility(modifiers, language);
    if (vis.stripped && !vis.already) changed.push(`visibility → ${language === 'vb' ? 'Private' : 'private'}`);

    let rest = vis.modifiers;
    if (language === 'vb') {
        const had = /\bShared\b/i.test(rest);
        rest = rest.replace(/\bShared\b/gi, ' ').replace(/\bStatic\b/gi, ' ').replace(/\s+/g, ' ').trim();
        if (/\bStatic\b/.test(modifiers)) changed.push('removed `Static` (VB uses `Shared` for members)');
        if (wantsStatic) { rest = `${rest} Shared`; if (!had) changed.push('added `Shared`'); }
        else if (had) changed.push('removed `Shared` (the body uses instance state)');
    } else {
        const had = /\bstatic\b/.test(rest);
        rest = rest.replace(/\bstatic\b/g, ' ').replace(/\s+/g, ' ').trim();
        if (wantsStatic) { rest = `${rest} static`; if (!had) changed.push('added `static`'); }
        else if (had) changed.push('removed `static` (the body uses instance state)');
    }
    lines[declIndex] = decl.replace(m[1], rest ? `${rest} ` : '');
    return { member: lines.join('\n'), changed };
}

/** ``Create a function named 'SortArray' …`` → `SortArray`, so an existing member is caught before a call. */
export function sniffMemberName(description: string): string | undefined {
    const m = /\b(?:named|called)\s+['"`]?([A-Za-z_]\w{2,})['"`]?/i.exec(String(description ?? ''))?.[1];
    return m;
}

/** `<Control>_<Event>` → its two halves, but only when the control exists in the form and the event is real. */
export function handlerFromMemberName(name: string, controls: readonly string[]): { control: string; event: string } | undefined {
    const at = String(name ?? '').lastIndexOf('_');
    if (at <= 0) return undefined;
    const control = name.slice(0, at);
    const event = name.slice(at + 1);
    if (!controls.includes(control)) return undefined;
    if (!isKnownEventName(event)) return undefined;
    return { control, event };
}

/** `x:Name="Save"` / `Name='Save'` in the form, for the handler check and the wiring offer. */
export function knownControlNames(axamlText: string): string[] {
    const out: string[] = [];
    const re = /\b(?:x:Name|Name)\s*=\s*("([^"]+)"|'([^']+)')/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(String(axamlText ?? '')))) {
        const name = (m[2] ?? m[3] ?? '').trim();
        if (name && !out.includes(name)) out.push(name);
    }
    return out;
}

/**
 * Adds `Event="Handler"` to the control's start tag — the wiring half of "create a new function".
 *
 * A text edit rather than a model edit: the designer rewrites the whole file from its own model when it
 * saves, and reaching into that model from the code editor would mean two owners for one document. The
 * attribute goes immediately after the name attribute, which leaves the rest of the tag untouched.
 * Returns undefined when the control is not in the file or the event is already wired — in that case
 * there is nothing to offer and nothing to change.
 */
export function addXamlEventAttribute(axamlText: string, control: string, event: string, handler: string): string | undefined {
    const text = String(axamlText ?? '');
    const nameRe = new RegExp(`\\b(?:x:Name|Name)\\s*=\\s*("${control.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"|'${control.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}')`);
    const hit = nameRe.exec(text);
    if (!hit) return undefined;
    const tagStart = text.lastIndexOf('<', hit.index);
    const tagEnd = text.indexOf('>', hit.index);
    if (tagStart < 0 || tagEnd < 0) return undefined;
    const tag = text.slice(tagStart, tagEnd + 1);
    if (new RegExp(`\\b${event}\\s*=`).test(tag)) return undefined; // already wired to something
    const insertAt = hit.index + hit[0].length;
    return text.slice(0, insertAt) + ` ${event}="${handler}"` + text.slice(insertAt);
}
