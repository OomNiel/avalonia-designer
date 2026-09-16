/* Local AI assist — which models the bundled runtime offers, and the pure maths around it.
 *
 * Kept away from both `assistant.ts` (prompts, parsers, client) and `modelRuntime.ts` (VS Code,
 * processes, downloads) because everything here is a plain function of its arguments: the picker, the
 * status command, the download and the tests all read the same table. A wrong byte count or hash here
 * would mean a corrupt download for every user, so the numbers are the ones Hugging Face reports for
 * these exact files (checked 2026-09-14), and the sidecar refuses a file that does not match.
 *
 * Why a code-specialised model and not Phi-3-mini (the original guess, see NOTES.md §91): Microsoft's
 * own model card warns that Phi-3 is trained predominantly on Python and that scripts in other
 * languages must be verified by hand — exactly the wrong risk for generated C# and VB.NET.
 */

export interface ModelSpec {
    id: string;
    label: string;
    /** One line for the picker: size and what the choice buys. */
    detail: string;
    fileName: string;
    url: string;
    bytes: number;
    sha256: string;
    /** Total RAM this model wants before it is worth offering. */
    minRamGb: number;
}

/** Folder inside the extension's global storage that holds the downloaded weights. */
export const MODEL_FOLDER = 'models';

/** Context window handed to the sidecar. Big enough for header + method + a 900-token answer. */
export const DEFAULT_CONTEXT_SIZE = 4096;

/** The sidecar prints this on stdout once it is listening (mirrors `PREVIEWER_HOST_READY`). */
export const READY_PREFIX = 'MODEL_HOST_READY';

const HF = 'https://huggingface.co/Qwen';

export const MODEL_SPECS: ModelSpec[] = [
    {
        id: 'qwen2.5-coder-3b-q4',
        label: 'Qwen2.5-Coder 3B Instruct (Q4_K_M)',
        detail: '2.0 GB — the latency choice: a short method in roughly 5–15 s with no GPU',
        fileName: 'qwen2.5-coder-3b-instruct-q4_k_m.gguf',
        url: `${HF}/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf`,
        bytes: 2104932800,
        sha256: '724fb256bec1ff062b2f65e4569e871ad2e95ab2a3989723d1769c54294730b7',
        minRamGb: 8
    },
    {
        id: 'qwen2.5-coder-7b-q4',
        label: 'Qwen2.5-Coder 7B Instruct (Q4_K_M)',
        detail: '4.4 GB — the quality choice: noticeably better C#, two to three times slower',
        fileName: 'qwen2.5-coder-7b-instruct-q4_k_m.gguf',
        url: `${HF}/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf`,
        bytes: 4683073536,
        sha256: '509287f78cb4d4cf6b3843734733b914b2c158e43e22a7f4bf5e963800894d3c',
        minRamGb: 16
    },
    {
        // DeepSeek-Coder-V2-Lite: a 16.8 B MoE (only 2.9 B params are active) at 4-bit. The file is large
        // because all 16 experts are stored, but live RAM tracks the active expert — it runs on 16 GB. The
        // IQ4_XS quant from bartowski's mirror keeps the download under 9 GB and is the one pinned here.
        id: 'deepseek-coder-v2-lite-iq4xs',
        label: 'DeepSeek-Coder-V2-Lite 16.8B MoE (IQ4_XS)',
        detail: '8.0 GB — DeepSeek 16.8 B MoE (2.9 B active) at 4-bit; strong on C#, fits 16 GB RAM',
        fileName: 'DeepSeek-Coder-V2-Lite-Instruct-IQ4_XS.gguf',
        url: 'https://huggingface.co/bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF/resolve/main/DeepSeek-Coder-V2-Lite-Instruct-IQ4_XS.gguf',
        bytes: 8571593472,
        sha256: 'ac0a996714d4e8ed06b4398096bae88a32c349ceab42ffe629c2ddf4c4e0706c',
        minRamGb: 16
    },
    {
        // Same 16.8 B MoE, the largest quant that still fits under 8 GB — a faster, smaller-footprint choice.
        id: 'deepseek-coder-v2-lite-iq3m',
        label: 'DeepSeek-Coder-V2-Lite 16.8B MoE (IQ3_M)',
        detail: '7.0 GB — DeepSeek 16.8 B MoE (2.9 B active) at 4-bit; the smaller/faster quant of the pair',
        fileName: 'DeepSeek-Coder-V2-Lite-Instruct-IQ3_M.gguf',
        url: 'https://huggingface.co/bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF/resolve/main/DeepSeek-Coder-V2-Lite-Instruct-IQ3_M.gguf',
        bytes: 7553175296,
        sha256: '08db93121a9e6fa3cb4978c4b4e9c37e9407160ceec77f0894c45f43bf2d91d1',
        minRamGb: 16
    },
    {
        // Gemma-4, code-tuned, at 12 B — from the community GGUF repo `yuxinlu1/gemma-4-12B-coder-…`
        // (its card declares `base_model: google/gemma-4-12B-it`), so the label names the size and the
        // quant and the detail says where it comes from: it is a code-tuned Gemma, not a first-party
        // Google release. Q4_K_M is the best quant that still lands under 8 GB; 16 GB RAM is the gate
        // for a 12 B dense model. Size and SHA-256 re-checked against the Hub on 2026-09-15.
        id: 'gemma-4-coder-12b-q4',
        label: 'Gemma-4-Coder 12B (Q4_K_M)',
        detail: '6.9 GB — community GGUF of Google\'s Gemma-4 12B, code-tuned; good C# at a 12 B size',
        fileName: 'gemma4-coding-Q4_K_M.gguf',
        url: 'https://huggingface.co/yuxinlu1/gemma-4-12B-coder-fable5-composer2.5-v1-GGUF/resolve/main/gemma4-coding-Q4_K_M.gguf',
        bytes: 7381381664,
        sha256: '1fe90b72e105d7bc71650aa59883edece3e84751af489075217a7ae717b1fe8d',
        minRamGb: 16
    }
];

export function specById(id: string): ModelSpec | undefined {
    return MODEL_SPECS.find((s) => s.id === id);
}

/** Recognises one of our files by name, so a file already in storage needs no re-download. */
export function specByFileName(file: string, specs: ModelSpec[] = MODEL_SPECS): ModelSpec | undefined {
    const name = String(file).replace(/\\/g, '/').split('/').pop() ?? '';
    const lower = name.toLowerCase();
    return specs.find((s) => s.fileName.toLowerCase() === lower);
}

/** `2104932800` → `2.0 GB`. Decimal units: the number the download page shows. */
export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return '?';
    if (bytes < 1000) return `${Math.round(bytes)} B`;
    const units = ['kB', 'MB', 'GB', 'TB'];
    let value = bytes / 1000;
    let unit = 0;
    while (value >= 1000 && unit < units.length - 1) {
        value /= 1000;
        unit += 1;
    }
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** `724fb256…30b7` → `724fb256…` so a hash can be shown without wrecking the layout. */
export function shortHash(sha256: string): string {
    return /^[0-9a-f]{16,}$/i.test(sha256) ? `${sha256.slice(0, 8)}…` : sha256;
}

/**
 * Threads for llama.cpp. Physical cores would be ideal but Node only reports logical ones, and
 * oversubscribing them makes generation *slower*, so leave one for the editor and cap at 8.
 */
export function defaultThreads(cpuCount: number): number {
    const n = Number.isFinite(cpuCount) ? Math.floor(cpuCount) : 1;
    return Math.max(1, Math.min(8, n - 1));
}

export interface SidecarOptions {
    modelPath: string;
    port: number;
    threads?: number;
    contextSize?: number;
    gpuLayers?: number;
}

/** Exact argv for the sidecar. Pure so the process it starts is testable without starting one. */
export function sidecarArgs(options: SidecarOptions): string[] {
    const args = ['--model', options.modelPath, '--port', String(options.port)];
    if (options.threads) args.push('--threads', String(options.threads));
    args.push('--ctx', String(options.contextSize ?? DEFAULT_CONTEXT_SIZE));
    args.push('--gpu-layers', String(options.gpuLayers ?? 0));
    return args;
}

/** The base URL the extension's existing client is pointed at — `/chat/completions` hangs off it. */
export function sidecarBaseUrl(port: number): string {
    return `http://127.0.0.1:${port}/v1`;
}

export function sidecarHealthUrl(port: number): string {
    return `http://127.0.0.1:${port}/health`;
}

export interface SidecarHealth {
    /** True when the weights are in and the server can answer a chat request. */
    ok: boolean;
    loading: boolean;
    model?: string;
    error?: string;
}

/** Reads the sidecar's `/health`. Pure: every branch is covered by the tests, not by a live server. */
export function parseHealth(body: unknown): SidecarHealth {
    const obj = (body ?? {}) as { ok?: unknown; loaded?: unknown; loading?: unknown; model?: unknown; error?: unknown };
    const loaded = obj.loaded === true || obj.ok === true;
    return {
        ok: loaded,
        loading: obj.loading === true,
        model: typeof obj.model === 'string' ? obj.model : undefined,
        error: typeof obj.error === 'string' && obj.error ? obj.error : undefined
    };
}

/**
 * Whether this machine should be offered `spec` at all. A 7B model on an 8 GB laptop would swap for
 * minutes, so it is not offered there — better an honest "too big" than a feature that feels broken.
 */
export function canRunSpec(
    spec: ModelSpec,
    hardware: { level: 'good' | 'minimal' | 'none'; totalRamGb: number }
): { ok: boolean; reason?: string } {
    if (hardware.level === 'none') return { ok: false, reason: 'this machine cannot run a local model' };
    if (hardware.totalRamGb < spec.minRamGb) {
        return { ok: false, reason: `needs ${spec.minRamGb} GB RAM (this machine has ${hardware.totalRamGb.toFixed(0)} GB)` };
    }
    return { ok: true };
}

/** A `.gguf` file the user pointed at themselves. */
export function isGgufPath(file: string): boolean {
    return /\.gguf$/i.test(String(file).trim());
}
