/* ModelHost — a tiny local model server for the Avalonia Designer AI assist.
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
using LLama.Sampling;

namespace ModelHost;

internal sealed record Options(string ModelPath, int Port, int Threads, int ContextSize, int GpuLayers)
{
    public string Name => Path.GetFileNameWithoutExtension(ModelPath);

    /// <summary>Parses argv; null when the call is unusable (the caller prints usage).</summary>
    public static Options? Parse(string[] args)
    {
        string model = "";
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
            }
        }
        if (model.Length == 0 || port <= 0 || !File.Exists(model)) return null;
        return new Options(model, port, threads, context, gpu);
    }

    public static void Usage() => Console.Error.WriteLine(
        "usage: ModelHost --port <n> --model <path.gguf> [--threads n] [--ctx n] [--gpu-layers n]");
}

/// <summary>
/// The loaded model, shared by every request. Loading happens on a background task so `/health` can
/// answer (and explain a failure) while the weights are still coming in — the extension polls it.
/// </summary>
internal sealed class ModelState(Options options)
{
    private LLamaWeights? _weights;
    private ModelParams? _parameters;

    public bool Loading { get; private set; }
    public bool Loaded => _weights is not null;
    public string? Error { get; private set; }
    public string Name => options.Name;

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
            Console.WriteLine($"model loaded: {Name} in {(int)(DateTime.UtcNow - started).TotalMilliseconds} ms " +
                              $"(threads={options.Threads}, ctx={options.ContextSize})");
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

    private static async Task<int> Main(string[] args)
    {
        var options = Options.Parse(args);
        if (options is null)
        {
            Options.Usage();
            return 2;
        }

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

        var state = new ModelState(options);
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
            if (system.Length > 0) session.AddSystemMessage(system);
            var inference = new InferenceParams
            {
                MaxTokens = maxTokens,
                SamplingPipeline = new DefaultSamplingPipeline { Temperature = temperature }
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
