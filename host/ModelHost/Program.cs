/* ModelHost — a tiny local model server for the Grumpy's WYSIWYG Designer AI assist.
 *
 * WHY THIS EXISTS (NOTES.md §92)
 * The feature has to work for a developer who has no AI at all: no Copilot, no LM Studio, no Ollama.
 * Bundling a native inference runtime in the extension would mean one VSIX per platform *and* a
 * per-ABI rebuild every time VS Code's Node moves, and shipping the model weights is impossible — the
 * download is measured in gigabytes. So the extension ships *this source file and a csproj*, builds
 * them with the .NET SDK the designer already requires (exactly what it does for PreviewerHost), and
 * NuGet resolves the correct llama.cpp binaries for the current runtime identifier in the process.
 * One VSIX, every platform. The weights are fetched once into the extension's global storage.
 *
 * WHAT IT IS
 * A deliberately small HTTP server on 127.0.0.1 that speaks the subset of the OpenAI API the
 * extension's client uses, so `src/assistant.ts` needs no knowledge of it at all:
 *
 *   GET  /health                 -> { ok, loaded, loading, model, error }
 *   GET  /v1/models              -> { data: [ { id, object: "model" } ] }
 *   POST /v1/chat/completions    -> SSE `data: {...}` deltas (+ `data: [DONE]`), or one JSON body
 *
 * Streaming is the point: on a CPU-only machine a 3B model needs 5-15 s for a short method, and the
 * developer should watch tokens arrive instead of a frozen progress bar. The server is single-flight
 * (one generation at a time) because there is exactly one model and one user.
 */

using System.Net;
using System.Text;
using System.Text.Json;
using LLama;
using LLama.Common;
using LLama.Native;
using LLama.Sampling;
using LLama.Transformers;

namespace ModelHost;

/// <summary>Which llama.cpp build to run. The CPU one is the default and needs nothing from the GPU.</summary>
internal static class NativeBackend
{
    public const string Cpu = "cpu";
    public const string Vulkan = "vulkan";

    /// <summary>`backend vulkan` (or `Vulkan`) → the Vulkan build; anything else, including nothing,
    /// is the CPU build. Unknown values are not silently accepted as a GPU request.</summary>
    public static string Normalise(string? value) =>
        string.Equals(value?.Trim(), Vulkan, StringComparison.OrdinalIgnoreCase) ? Vulkan : Cpu;
}

internal sealed record Options(string ModelPath, int Port, int Threads, int ContextSize, int GpuLayers, string Backend)
{
    public string Name => Path.GetFileNameWithoutExtension(ModelPath);

    /// <summary>Parses argv; null when the call is unusable (the caller prints usage).</summary>
    public static Options? Parse(string[] args)
    {
        string model = "", backend = NativeBackend.Cpu;
        int port = 0, threads = Math.Max(1, Math.Min(8, Environment.ProcessorCount - 1)), context = 4096, gpu = 0;
        for (var i = 0; i < args.Length; i++)
        {
            var next = i + 1 < args.Length ? args[i + 1] : null;
            switch (args[i])
            {
                case "--model" when next is not null: model = next; i++; break;
                case "--port" when next is not null: int.TryParse(next, out port); i++; break;
                case "--threads" when next is not null && int.TryParse(next, out var t): threads = Math.Max(1, t); i++; break;
                case "--ctx" when next is not null && int.TryParse(next, out var c): context = Math.Max(512, c); i++; break;
                case "--gpu-layers" when next is not null && int.TryParse(next, out var g): gpu = Math.Max(0, g); i++; break;
                case "--backend" when next is not null: backend = NativeBackend.Normalise(next); i++; break;
            }
        }
        if (model.Length == 0 || port <= 0 || !File.Exists(model)) return null;
        return new Options(model, port, threads, context, gpu, backend);
    }

    public static void Usage() => Console.Error.WriteLine(
        "usage: ModelHost --port <n> --model <path.gguf> [--threads n] [--ctx n] [--gpu-layers n] [--backend cpu|vulkan]");
}

/// <summary>
/// What llama.cpp itself said while it was loading — the only honest source for "which build did we end up
/// running, and did it find a GPU?". LLamaSharp chooses the native library by directory
/// (`runtimes/&lt;rid&gt;/native/vulkan/` for the Vulkan build, `…/native/&lt;avx&gt;/` for the CPU one), so the
/// path it reports loading *is* the answer; and when the Vulkan build cannot be used it falls back to the CPU
/// library without failing, which is exactly the case that must not be reported as "Vulkan".
///
/// The two facts are recorded **as the lines arrive**, not read back from a buffer: the library is chosen at
/// startup and the load then emits hundreds of lines, so a trailing window would have dropped the one line
/// that matters (measured 2026-09-16: with a 200-line buffer the Vulkan run reported "CPU" while llama.cpp
/// had offloaded 37/37 layers to `Vulkan0`).
///
/// Installing the callback also takes llama.cpp's log away from its own stderr default: the useful lines
/// (Info and above — "using device Vulkan0", "offloaded 37/37 layers") are forwarded to stderr where they
/// were, and the Debug flood is dropped.
/// </summary>
internal sealed class NativeLog
{
    private string? _library;
    private string? _device;

    public void Install()
    {
        NativeLibraryConfig.All
            .WithLogCallback((level, message) =>
            {
                var text = message.TrimEnd();
                if (text.Length == 0) return;
                Observe(text);
                if (level >= LLamaLogLevel.Info) Console.Error.WriteLine(text);
            })
            // CUDA is deliberately off: this project ships a CPU and a Vulkan build, and a machine with an
            // NVIDIA GPU must not silently take a third path nobody tested. Fallback stays on, which is what
            // makes Vulkan safe to ask for: with no Vulkan device (or no loader) LLamaSharp loads the CPU
            // libraries instead of failing.
            .WithCuda(false)
            .WithVulkan(false)
            .WithAutoFallback(true);
    }

    /// <summary>Asks for the Vulkan build. Must be called before any other llama.cpp call.</summary>
    public void PreferVulkan()
    {
        NativeLibraryConfig.All.WithVulkan(true);
    }

    /// <summary>Reads the two facts out of one llama.cpp log line.</summary>
    private void Observe(string line)
    {
        // "Successfully loaded '/…/runtimes/linux-x64/native/vulkan/libllama.so'" — the dependencies and the
        // Mtmd library are loaded through the same message, so the name has to be the discriminator.
        if (line.Contains("Successfully loaded")
            && (line.Contains("libllama") || line.Contains("llama.dll")))
        {
            var quote = line.IndexOf('\'');
            var end = quote < 0 ? -1 : line.IndexOf('\'', quote + 1);
            _library = end > quote ? line[(quote + 1)..end] : line;
        }
        // "ggml_vulkan: 0 = AMD Radeon 760M Graphics (RADV PHOENIX) (radv) | uma: 1 | …" — the announcement
        // line ("Found 1 Vulkan devices:") has no '=' and is skipped.
        if (_device is null)
        {
            var at = line.IndexOf("ggml_vulkan:", StringComparison.Ordinal);
            if (at >= 0)
            {
                var eq = line.IndexOf('=', at);
                var name = eq < 0 ? "" : line[(eq + 1)..].Split('|')[0].Trim();
                if (name.Length > 0) _device = Tidy(name);
            }
        }
    }

    /// <summary>
    /// "AMD Radeon 760M Graphics (RADV PHOENIX) (radv)" → "AMD Radeon 760M Graphics (RADV PHOENIX)": the
    /// driver suffix is repeated in the device name, and this string is shown to a developer.
    /// </summary>
    private static string Tidy(string name)
    {
        var at = name.LastIndexOf(" (", StringComparison.Ordinal);
        if (at <= 0 || !name.EndsWith(')')) return name;
        var inner = name[(at + 2)..^1];
        return inner.Length > 0 && name[..at].Contains(inner, StringComparison.OrdinalIgnoreCase)
            ? name[..at]
            : name;
    }

    /// <summary>The build llama.cpp actually loaded, from the path it reported.</summary>
    public string LoadedBackend() =>
        _library is not null && _library.Replace('\\', '/').Contains("/native/vulkan/")
            ? NativeBackend.Vulkan
            : NativeBackend.Cpu;

    /// <summary>The Vulkan device llama.cpp picked up, e.g. `AMD Radeon 760M Graphics (RADV PHOENIX)`.</summary>
    public string? Device() => _device;

    /// <summary>One line for the log: what was asked for, what actually loaded, and on which device.</summary>
    public string Summary(string requested)
    {
        if (LoadedBackend() == NativeBackend.Vulkan)
            return $"backend: vulkan{(_device is null ? " (no Vulkan device was reported)" : $" on {_device}")}";
        return requested == NativeBackend.Vulkan
            ? "backend: CPU — Vulkan was requested but llama.cpp fell back to the CPU build (no usable Vulkan device here)"
            : "backend: CPU";
    }
}

/// <summary>
/// The loaded model, shared by every request. Loading happens on a background task so `/health` can
/// answer (and explain a failure) while the weights are still coming in — the extension polls it.
/// </summary>
internal sealed class ModelState(Options options, NativeLog nativeLog)
{
    private LLamaWeights? _weights;
    private ModelParams? _parameters;

    public bool Loading { get; private set; }
    public bool Loaded => _weights is not null;
    public string? Error { get; private set; }
    public string Name => options.Name;

    /// <summary>The build llama.cpp actually loaded, and the Vulkan device it used (null on the CPU).</summary>
    public string LoadedBackend => nativeLog.LoadedBackend();
    public string? Device => nativeLog.Device();

    /// <summary>The loaded weights, needed to read the model's own chat template.</summary>
    public LLamaWeights? Weights => _weights;

    /// <summary>The context has to hold the prompt *and* the answer. The extension caps its request at
    /// 900 tokens, but a hand-edited setting could ask for more than the window holds, so clamp.</summary>
    public int MaxAnswerTokens => Math.Max(64, options.ContextSize - 512);

    public async Task LoadAsync()
    {
        Loading = true;
        var started = DateTime.UtcNow;
        try
        {
            var parameters = new ModelParams(options.ModelPath)
            {
                ContextSize = (uint)options.ContextSize,
                GpuLayerCount = options.GpuLayers,
                Threads = options.Threads,
                BatchSize = 512
            };
            // LoadFromFile is synchronous CPU work — keep the listener's thread free.
            _weights = await Task.Run(() => LLamaWeights.LoadFromFile(parameters));
            _parameters = parameters;
            var backend = nativeLog.Summary(options.Backend);
            Console.WriteLine($"model loaded: {Name} in {(int)(DateTime.UtcNow - started).TotalMilliseconds} ms " +
                              $"(threads={options.Threads}, ctx={options.ContextSize}, gpu_layers={options.GpuLayers}, {backend})");
            if (options.Backend == NativeBackend.Vulkan && nativeLog.LoadedBackend() != NativeBackend.Vulkan)
                Console.Error.WriteLine("note: " + backend);
            Console.Out.Flush();
        }
        catch (Exception ex)
        {
            Error = ex.Message;
            Console.Error.WriteLine("model load failed: " + ex);
            Console.Error.Flush();
        }
        finally
        {
            Loading = false;
        }
    }

    /// <summary>A fresh context per request: the feature is one-shot (system + user -> one method), so
    /// there is no history worth keeping, and a discarded context cannot leak state into the next job.</summary>
    public LLamaContext CreateContext() => _weights!.CreateContext(_parameters!);
}

internal static class Program
{
    private static readonly JsonSerializerOptions Json = new() { WriteIndented = false };

    /// <summary>
    /// End-of-turn markers, tried in the order the common families use them. A chat template in the GGUF
    /// ends the assistant turn with one of these; llama.cpp stops generating when it sees the text.
    /// </summary>
    private static readonly string[] StopMarkers =
    {
        "<|im_end|>",       // Qwen / ChatML
        "<|eot_id|>",       // Llama 3
        "<|end_of_text|>",  // Llama 3
        "<end_of_turn>",    // Gemma
        "<|eom_id|>",       // Llama 3.1 tool turns
        "<|end|>",          // misc
        "</s>"              // the classic
    };

    private static async Task<int> Main(string[] args)
    {
        var options = Options.Parse(args);
        if (options is null)
        {
            Options.Usage();
            return 2;
        }

        // BEFORE anything else touches llama.cpp: the native library is chosen on first use and the choice
        // cannot be changed afterwards. The CPU build is the default; `--backend vulkan` asks for the Vulkan
        // one and still falls back to the CPU when this machine has no Vulkan device (2026-09-16).
        var nativeLog = new NativeLog();
        nativeLog.Install();
        if (options.Backend == NativeBackend.Vulkan) nativeLog.PreferVulkan();
        Console.WriteLine($"MODEL_HOST_BACKEND requested={options.Backend} gpu_layers={options.GpuLayers}");

        using var listener = new HttpListener();
        // 127.0.0.1 only: nothing about this feature is meant to be reachable from another machine.
        listener.Prefixes.Add($"http://127.0.0.1:{options.Port}/");
        try
        {
            listener.Start();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"cannot listen on 127.0.0.1:{options.Port}: {ex.Message}");
            return 3;
        }

        var state = new ModelState(options, nativeLog);
        _ = Task.Run(state.LoadAsync);

        // The extension waits for this line (mirrors PreviewerHost's PREVIEWER_HOST_READY handshake).
        Console.WriteLine($"MODEL_HOST_READY port={options.Port} model={state.Name}");
        Console.Out.Flush();

        // One generation at a time: a second concurrent request would fight for the same CPU cores and
        // make both slower. The extension only ever asks for one method at a time.
        using var gate = new SemaphoreSlim(1, 1);

        while (listener.IsListening)
        {
            HttpListenerContext context;
            try
            {
                context = await listener.GetContextAsync();
            }
            catch (Exception)
            {
                break; // listener disposed (Ctrl+C / process exit)
            }
            _ = Task.Run(() => HandleAsync(context, state, gate));
        }
        return 0;
    }

    private static async Task HandleAsync(HttpListenerContext context, ModelState state, SemaphoreSlim gate)
    {
        try
        {
            var path = context.Request.Url?.AbsolutePath ?? "/";
            switch (path)
            {
                case "/health":
                    WriteJson(context, 200, new
                    {
                        ok = state.Loaded,
                        loaded = state.Loaded,
                        loading = state.Loading,
                        model = state.Name,
                        // What actually happened, not what was asked for: the extension shows this line, and
                        // "Vulkan" for a runtime that fell back to the CPU would be a lie (2026-09-16).
                        backend = state.LoadedBackend,
                        device = state.Device,
                        error = state.Error
                    });
                    return;

                case "/v1/models":
                case "/models":
                    var ids = state.Loaded ? new[] { state.Name } : Array.Empty<string>();
                    WriteJson(context, 200, new { @object = "list", data = ids.Select(id => new { id, @object = "model" }) });
                    return;

                case "/v1/chat/completions":
                case "/chat/completions":
                    await ChatAsync(context, state, gate);
                    return;

                default:
                    WriteJson(context, 404, new { error = $"no such endpoint: {path}" });
                    return;
            }
        }
        catch (Exception ex)
        {
            try
            {
                if (!context.Response.OutputStream.CanWrite) throw;
                WriteJson(context, 500, new { error = ex.Message });
            }
            catch
            {
                // The client went away mid-stream (the developer cancelled): nothing to report.
            }
        }
        finally
        {
            try { context.Response.Close(); } catch { /* already closed */ }
        }
    }

    /// <summary>The one endpoint that matters: an OpenAI-compatible chat completion, streamed.</summary>
    private static async Task ChatAsync(HttpListenerContext context, ModelState state, SemaphoreSlim gate)
    {
        JsonElement body;
        using (var reader = new StreamReader(context.Request.InputStream, Encoding.UTF8))
        {
            var raw = await reader.ReadToEndAsync();
            body = JsonDocument.Parse(raw.Length == 0 ? "{}" : raw).RootElement.Clone();
        }

        if (!state.Loaded)
        {
            // 503 rather than a hang: the extension turns this body into the message the developer sees.
            var why = state.Error ?? (state.Loading ? "the model is still loading" : "the model is not loaded");
            WriteJson(context, 503, new { error = $"the local model is not ready: {why}" });
            return;
        }

        var (system, user) = ReadMessages(body);
        if (user.Length == 0)
        {
            WriteJson(context, 400, new { error = "no user message" });
            return;
        }

        var maxTokens = body.TryGetProperty("max_tokens", out var mt) && mt.TryGetInt32(out var m) ? Math.Max(1, m) : 900;
        maxTokens = Math.Min(maxTokens, state.MaxAnswerTokens);
        var temperature = body.TryGetProperty("temperature", out var tp) && tp.TryGetDouble(out var t) ? (float)t : 0.2f;
        var streaming = body.TryGetProperty("stream", out var st) && st.ValueKind == JsonValueKind.True;

        await gate.WaitAsync();
        try
        {
            var response = context.Response;
            if (streaming)
            {
                response.StatusCode = 200;
                response.ContentType = "text/event-stream; charset=utf-8";
                response.Headers["Cache-Control"] = "no-cache";
                response.SendChunked = true;
            }

            // A fresh context and session per request: this feature is one-shot, so there is no history
            // to keep, and the KV cache of a finished job dies with the context instead of lingering.
            using var llama = state.CreateContext();
            var session = new ChatSession(new InteractiveExecutor(llama));

            // USE THE MODEL'S OWN CHAT TEMPLATE. This is not a nicety — without it LLamaSharp frames the
            // conversation the Llama-2 way (`[INST] … [/INST]`), a Qwen/coder model never sees where the
            // assistant turn begins, and it answers by repeating its first block until the token budget
            // is gone: measured on this machine 2026-09-14, the same prompt that LM Studio (which passes
            // `--jinja`) answered with one clean block came back from this sidecar as **30 copies of that
            // block**, 4049 characters in 40 s, cut off mid-fence — which is what "the model returned
            // nothing usable" was made of. The template is in the GGUF as `tokenizer.chat_template`.
            if (state.Weights is not null)
            {
                try
                {
                    session.WithHistoryTransform(new PromptTemplateTransformer(state.Weights));
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine("chat template not usable, falling back to the default: " + ex.Message);
                }
            }

            if (system.Length > 0) session.AddSystemMessage(system);
            var inference = new InferenceParams
            {
                MaxTokens = maxTokens,
                SamplingPipeline = new DefaultSamplingPipeline { Temperature = temperature },
                // A template-driven prompt does not tell llama.cpp where the turn ends, so the markers
                // are listed explicitly — all the common ones, because being wrong is what causes the
                // rambling above. Harmless for a model that never emits them.
                AntiPrompts = StopMarkers.ToList(),
                // The markers have to survive decoding for the anti-prompts to match them at all.
                DecodeSpecialTokens = true
            };

            var text = new StringBuilder();
            await foreach (var token in session.ChatAsync(new ChatHistory.Message(AuthorRole.User, user), inference))
            {
                text.Append(token);
                if (streaming) await WriteDelta(response, token);
                else await Task.Yield();
            }

            if (streaming) await WriteRaw(response, "data: [DONE]\n\n");
            else WriteJson(context, 200, new { choices = new[] { new { message = new { role = "assistant", content = text.ToString() } } } });
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>Reads `messages` into a system prompt and a single user turn (what this client sends).</summary>
    private static (string System, string User) ReadMessages(JsonElement body)
    {
        var system = new StringBuilder();
        var user = new StringBuilder();
        if (body.TryGetProperty("messages", out var messages) && messages.ValueKind == JsonValueKind.Array)
        {
            foreach (var message in messages.EnumerateArray())
            {
                var role = message.TryGetProperty("role", out var r) ? r.GetString() : "user";
                var content = message.TryGetProperty("content", out var c) ? c.GetString() ?? "" : "";
                if (string.Equals(role, "system", StringComparison.OrdinalIgnoreCase)) system.AppendLine(content);
                else if (string.Equals(role, "assistant", StringComparison.OrdinalIgnoreCase)) { /* no history is sent */ }
                else user.AppendLine(content);
            }
        }
        return (system.ToString().Trim(), user.ToString().Trim());
    }

    private static string DeltaJson(string text) =>
        JsonSerializer.Serialize(new { choices = new[] { new { delta = new { content = text } } } }, Json);

    private static async Task WriteDelta(HttpListenerResponse response, string token)
    {
        await WriteRaw(response, $"data: {DeltaJson(token)}\n\n");
    }

    private static async Task WriteRaw(HttpListenerResponse response, string text)
    {
        var bytes = Encoding.UTF8.GetBytes(text);
        await response.OutputStream.WriteAsync(bytes);
        await response.OutputStream.FlushAsync();
    }

    private static void WriteJson(HttpListenerContext context, int status, object payload)
    {
        var response = context.Response;
        var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload, Json));
        response.StatusCode = status;
        response.ContentType = "application/json; charset=utf-8";
        response.ContentLength64 = bytes.Length;
        response.OutputStream.Write(bytes, 0, bytes.Length);
        response.OutputStream.Flush();
    }
}
