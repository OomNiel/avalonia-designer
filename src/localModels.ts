/* Choosing a local model without knowing anything about ports, ids or flags.
 *
 * THE POINT (2026-09-15): setting the AI assist up by hand means knowing an endpoint, a port, an exact
 * model id, and enough about llama.cpp to pick a context length and an offload ratio — the user called that
 * "way too complicated for a novice", and they are right. So the picker does it: it asks LM Studio what is
 * on disk, offers the models by name, and derives every value from the machine.
 *
 * WHY THIS FILE IS PURE. Everything here is a function of text: the CLI's output comes in as a string and
 * the decisions come out as data. That is what lets the suite pin the parsing of real `lms ls`, `lms ps`
 * and `lms load --estimate-only` output (captured from a real machine, see the fixtures in the tests and
 * NOTES.md §100) without LM Studio installed, and it keeps the VS Code half thin.
 *
 * The CLI is LM Studio's own `lms` binary (`~/.lmstudio/bin/lms`): `ls` lists what is on disk, `ps` what is
 * loaded, `server status` the port, and `load` takes exactly the knobs a novice should not have to know —
 * `--gpu`, `-c/--context-length`, `--ttl`, `--identifier`.
 */

/** Which local runtime a model comes from. */
export type ModelProvider = 'lmstudio' | 'bundled' | 'custom';

export interface LocalModel {
    provider: ModelProvider;
    /** What to pass back to the runtime — for LM Studio this is the `lms` model key and the API id. */
    key: string;
    /** Human label, e.g. `qwen3.8-27b`. */
    label: string;
    /** Parameters as printed (`27B`, `7.5B`, empty when unknown). */
    params: string;
    /** Architecture (`qwen35`, `gemma4`, `Nomic BERT`, …). */
    arch: string;
    sizeGb: number;
    /** LM Studio's own classification, when the REST API answered (`llm`/`vlm`/`embeddings`). */
    kind?: 'chat' | 'embeddings' | 'unknown';
}

export interface LocalModelList {
    chat: LocalModel[];
    embeddings: LocalModel[];
    /** Everything on disk, as the CLI reported it ("taking up 30.70 GB"). */
    diskGb: number;
}

export interface LoadOptions {
    contextLength: number;
    /** `lms load --gpu` value: 'off' | 'max' | a ratio as a string. */
    gpu: string;
    /** Seconds of idleness before LM Studio frees the memory; 0 = keep loaded. */
    ttlSeconds: number;
    /** The name the model answers to on the API — this is what the extension pins. */
    identifier: string;
    /** One line per decision, shown in the confirmation so the choice is not a black box. */
    reasons: string[];
}

const SIZE_UNITS: Record<string, number> = { KB: 1e-6, MB: 1e-3, GB: 1, TB: 1000 };

/** `84.11 MB` → 0.08411 (GB). */
export function parseSizeGb(text: string): number | undefined {
    const m = /([\d.]+)\s*(KB|MB|GB|TB)/i.exec(String(text ?? ''));
    if (!m) return undefined;
    const value = Number(m[1]);
    const factor = SIZE_UNITS[m[2].toUpperCase()];
    return Number.isFinite(value) && factor ? value * factor : undefined;
}

/** The CLI pads its columns, so two-or-more spaces is the separator (model keys never contain them). */
function columns(line: string): string[] {
    return line.trim().split(/\s{2,}/).filter((c) => c.length > 0);
}

/**
 * Parses `lms ls`. Real output (captured 2026-09-15):
 *
 *   You have 4 models, taking up 30.70 GB of disk space.
 *   LLM                               PARAMS    ARCH      SIZE        DEVICE
 *   google/gemma-4-e4b (1 variant)    7.5B      gemma4    6.33 GB     Local
 *   EMBEDDING                               PARAMS    ARCH          SIZE        DEVICE
 *   text-embedding-nomic-embed-text-v1.5              Nomic BERT    84.11 MB    Local
 *
 * Note the embedding row has an EMPTY params column and a two-word arch, which is why the columns are
 * matched positionally against the header rather than counted; and note "(1 variant)", which is not part
 * of the model key.
 */
export function parseLmsList(stdout: string): LocalModelList {
    const result: LocalModelList = { chat: [], embeddings: [], diskGb: 0 };
    let section: 'chat' | 'embeddings' | undefined;

    for (const raw of String(stdout ?? '').split(/\r?\n/)) {
        const line = raw.replace(/\s+$/, '');
        if (!line.trim()) continue;

        const disk = /taking up\s+([\d.]+\s*[KMG]?B)/i.exec(line);
        if (disk) {
            result.diskGb = parseSizeGb(disk[1]) ?? 0;
            continue;
        }
        if (/^\s*EMBEDDING\b/i.test(line)) {
            section = 'embeddings';
            continue;
        }
        if (/^\s*LLM\b/i.test(line)) {
            section = 'chat';
            continue;
        }

        const cells = columns(line);
        // A data row needs at least a key and one more column; the header/summary lines do not match.
        if (!section || cells.length < 2) continue;
        const key = cells[0].replace(/\s*\(\d+\s+variants?\)$/i, '').trim();
        if (!key || /\s/.test(key)) continue;
        // The last two columns are SIZE and DEVICE; what sits between the key and SIZE is PARAMS then
        // ARCH — but PARAMS is EMPTY for embedding models, so it is found by shape and the rest is arch.
        const sizeGb = parseSizeGb(cells[cells.length - 2] ?? '') ?? parseSizeGb(line);
        if (sizeGb === undefined) continue;
        const middle = cells.slice(1, Math.max(1, cells.length - 2));
        const params = middle.find((c) => /^[\d.]+[KMB]$/i.test(c)) ?? '';
        const arch = middle.filter((c) => c !== params).join(' ');

        const model: LocalModel = {
            provider: 'lmstudio',
            key,
            label: key,
            params,
            arch,
            sizeGb,
            kind: section === 'chat' ? 'chat' : 'embeddings'
        };
        (section === 'chat' ? result.chat : result.embeddings).push(model);
    }
    return result;
}

/**
 * Parses `lms ps`. Only the *empty* answer is unambiguous ("No models are currently loaded."); the loaded
 * table format has not been observed, so anything else returns `undefined` and the caller falls back to the
 * REST API's `state` field, which is verified. Guessing here would be worse than deferring.
 */
export function parseLmsPs(stdout: string): string[] | undefined {
    const text = String(stdout ?? '');
    if (/no models are currently loaded/i.test(text)) return [];
    return undefined;
}

/** `The server is running on port 1234.` */
export function parseLmsServerStatus(stdout: string): { running: boolean; port?: number } {
    const text = String(stdout ?? '');
    const running = /running on port\s+(\d+)/i.exec(text);
    if (running) return { running: true, port: Number(running[1]) };
    if (/not running|stopped|no server/i.test(text)) return { running: false };
    return { running: false };
}

export interface LoadEstimate {
    model: string;
    contextLength: number;
    gpuOffloadPercent: number;
    totalGiB: number;
    confidence: string;
    /** The CLI's own closing verdict line, shown verbatim in the confirmation. */
    verdict: string;
}

/**
 * Parses `lms load … --estimate-only`, which answers "what would this cost?" without loading anything —
 * the reason a 17 GB model can be refused *before* a three-minute wait. Real output:
 *
 *   Model: qwen3.8-27b
 *   Context Length: 8,192
 *   GPU Offload: 0%
 *   Estimated GPU Memory:   16.52 GiB
 *   Estimated Total Memory: 16.52 GiB
 *   Confidence: LOW
 *   Estimate: This model may be loaded based on your resource guardrails settings.
 */
export function parseLoadEstimate(stdout: string): LoadEstimate | undefined {
    const text = String(stdout ?? '');
    const num = (re: RegExp) => {
        const m = re.exec(text);
        return m ? Number(m[1].replace(/[,_]/g, '')) : undefined;
    };
    const total = num(/Estimated Total Memory:\s*([\d.,]+)\s*GiB/i);
    if (total === undefined) return undefined;
    return {
        model: (/Model:\s*(.+)/i.exec(text)?.[1] ?? '').trim(),
        contextLength: num(/Context Length:\s*([\d.,]+)/i) ?? 0,
        gpuOffloadPercent: num(/GPU Offload:\s*(\d+)\s*%/i) ?? 0,
        totalGiB: total,
        confidence: (/Confidence:\s*(\S+)/i.exec(text)?.[1] ?? '').trim(),
        verdict: (/Estimate:\s*(.+)/i.exec(text)?.[1] ?? '').trim()
    };
}

/** Machine facts the recommendation depends on (passed in, so it is testable). */
export interface SetupFacts {
    totalRamGb: number;
    freeRamGb: number;
    cpuCount: number;
    /** The kernel's `ulimit -l`, in GB — the reason `mlock` fails on big models. */
    lockLimitGb: number;
}

/**
 * The values a novice should not have to choose, derived from the machine instead:
 *
 *  - **context**: as much as fits comfortably. 16 K on a roomy machine, 8 K normally, 4 K when RAM is tight.
 *  - **GPU offload**: OFF for anything large. On a shared-memory iGPU (the common laptop case) offloading a
 *    17 GB model is slower than the CPU and risks OOM; it only pays off when the model fits in dedicated
 *    VRAM. Small models are offloaded, where the GPU genuinely helps.
 *  - **ttl**: 15 minutes, so the memory comes back on its own instead of being held for the rest of the day.
 *  - **identifier**: the model key, which is what the extension pins as `assistant.model`.
 */
export function recommendedLoadOptions(model: LocalModel, facts: SetupFacts): LoadOptions {
    const reasons: string[] = [];
    const contextLength = facts.freeRamGb >= 20 ? 16384 : facts.freeRamGb >= 12 ? 8192 : 4096;
    reasons.push(
        `Context ${contextLength.toLocaleString('en-US')} tokens — sized to the ${Math.max(0, Math.round(facts.freeRamGb))} GB you have free`
    );

    const large = model.sizeGb > 8;
    const gpu = large ? 'off' : 'max';
    if (large) {
        reasons.push(
            `GPU offload off — ${model.sizeGb.toFixed(1)} GB is larger than dedicated VRAM on most machines, and on a shared-memory GPU that is slower, not faster`
        );
    } else {
        reasons.push(`GPU offload max — ${model.sizeGb.toFixed(1)} GB fits in GPU memory, where it is faster`);
    }

    reasons.push('Unloads itself after 15 idle minutes, so the RAM comes back on its own');
    if (model.kind !== 'embeddings' && model.sizeGb > facts.lockLimitGb) {
        reasons.push(
            `Keep-model-in-memory is NOT usable for this one: it needs ${model.sizeGb.toFixed(1)} GB locked and this machine allows ${facts.lockLimitGb.toFixed(1)} GB`
        );
    }

    return { contextLength, gpu, ttlSeconds: 900, identifier: model.key, reasons };
}

/** The exact `lms` argv for those options. Pure, so the command line is asserted rather than assumed. */
export function buildLoadArgs(model: LocalModel, options: LoadOptions): string[] {
    return [
        'load',
        model.key,
        '--gpu',
        options.gpu,
        '--context-length',
        String(options.contextLength),
        '--ttl',
        String(options.ttlSeconds),
        '--identifier',
        options.identifier
    ];
}

/** Where `lms` may live, most likely first. Pure (the caller checks existence). */
export function lmsCandidates(homeDir: string, platform: NodeJS.Platform = process.platform): string[] {
    const exe = platform === 'win32' ? 'lms.exe' : 'lms';
    return [homeDir ? `${homeDir}/.lmstudio/bin/${exe}` : exe, exe];
}

/**
 * The kernel's locked-memory limit, in GB, from `/proc/self/limits` (Linux):
 *
 *   Max locked memory         3694476               3694476               bytes
 *
 * Worth parsing because it silently decides whether a model can be memory-locked: on this machine it is
 * 3.5 GB, which is why a 5.34 GB model aborted llama.cpp inside `llama_mlock::grow_to` (2026-09-14) and a
 * 16.8 GB one certainly would. Returns undefined when the file says `unlimited` or cannot be read.
 */
export function parseLockLimitGb(limitsText: string, unlimitedGb = 1024): number | undefined {
    const line = /Max locked memory\s+(\S+)\s+(\S+)/i.exec(String(limitsText ?? ''));
    if (!line) return undefined;
    const [, soft] = line;
    if (/unlimited/i.test(soft)) return unlimitedGb;
    const bytes = Number(soft);
    return Number.isFinite(bytes) ? bytes / 1e9 : undefined;
}

/** How the picker labels a model, and what it says underneath. */
export function modelLabel(model: LocalModel): string {
    const size = `${model.sizeGb.toFixed(1)} GB`;
    const kind = model.kind === 'embeddings' ? 'embeddings — cannot answer chat' : model.params || model.arch;
    return `${model.label}  ·  ${kind}  ·  ${size}`;
}

/**
 * A load failure is explained from LM Studio's own log, because the two failures that actually happen are
 * both invisible in the UI: llama.cpp aborting on `mlock` (`GGML_ASSERT(addr) failed` in `llama_mlock::grow_to`
 * — the lock limit is smaller than the model; observed here on 2026-09-14 with a 5.34 GB model and a 3.5 GB
 * limit) and running out of memory. Pure: takes the log text and the facts, returns the sentence to show.
 */
export function explainLoadFailure(logTail: string, facts: SetupFacts, modelSizeGb?: number): string | undefined {
    const log = String(logTail ?? '');
    if (/GGML_ASSERT\(addr\)|llama_mlock|mlock/i.test(log)) {
        return (
            'LM Studio tried to lock the model in RAM ("Keep Model in Memory") and the kernel refused: this '
            + `machine allows ${facts.lockLimitGb.toFixed(1)} GB locked${modelSizeGb ? ` and the model needs about ${modelSizeGb.toFixed(1)} GB` : ''}. `
            + 'Turn "Keep Model in Memory" OFF in the model\'s load settings (Advanced), then load it again.'
        );
    }
    if (/failed to allocate|out of memory|std::bad_alloc|CUDA error|out of host memory/i.test(log)) {
        return (
            `Not enough free memory to load it${modelSizeGb ? ` (about ${modelSizeGb.toFixed(1)} GB)` : ''} — `
            + `${facts.freeRamGb.toFixed(1)} GB is free. Close other models, try a smaller quantization, or pick a smaller model.`
        );
    }
    return undefined;
}

// ---------------- files on this machine ----------------

/**
 * Where a `.gguf` a developer actually wants might live, most likely first.
 *
 * LM Studio's own folder is first because it is the common case, but note what the scan does with those
 * files: they are already in the `lms ls` list, so they are counted and then left out of the results
 * rather than offered twice under two different names (LM Studio's model *key* and its file path have no
 * reliable mapping — the folder says `lmstudio-community` where the key says `google`).
 */
export function scanRoots(homeDir: string): string[] {
    const home = homeDir || '';
    // `/media` and `/mnt` are listed as roots on purpose: an external drive appears one directory deep
    // inside them, and the walker descends by itself — so nothing here needs to look at the filesystem.
    return [
        `${home}/.lmstudio/models`,
        `${home}/Downloads`,
        `${home}/models`,
        `${home}/llama.cpp`,
        `${home}/.cache/huggingface/hub`,
        `${home}/.cache/lm-studio/models`,
        '/media',
        '/mnt'
    ];
}

/**
 * Is this file name a model a chat request could be sent to?
 *
 * The `mmproj-*.gguf` files are the reason this is not just an extension check: they sit in the same
 * folders as the weights (all six `.gguf` files found on this machine on 2026-09-15 included two of them)
 * and are *vision projectors* — loading one produces a failure that says nothing about the real problem.
 */
export function canImportFile(fileName: string): boolean {
    const name = String(fileName ?? '');
    if (!/\.gguf$/i.test(name)) return false;
    if (/^mmproj[-_.]/i.test(name)) return false;
    return true;
}
