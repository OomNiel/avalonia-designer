using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.WebSockets;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Threading;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Markup.Xaml.Styling;
using Avalonia.Media;
using Avalonia.Styling;
using Avalonia.Themes.Fluent;

namespace PreviewerHost;

/// <summary>Headless Avalonia application used by the designer to render XAML.</summary>
public class App : Application
{
    public override void Initialize()
    {
        Styles.Add(new FluentTheme());
        // DataGrid ships in its own assembly; FluentTheme does NOT include its control
        // theme, so without this a DataGrid has no template and renders blank (no
        // background/border/columns/rows) in the preview. Mirrors the generated App.axaml.
        Styles.Add(new StyleInclude(new Uri("avares://Avalonia.Controls.DataGrid/Themes/Fluent.xaml"))
        {
            Source = new Uri("avares://Avalonia.Controls.DataGrid/Themes/Fluent.xaml")
        });
    }
}

internal static class Program
{
    private static readonly XamlRenderer Renderer = new();
    private static readonly ControlFactory Factory = new();

    private static int Main(string[] args)
    {
        int port = 63241;
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--port" && i + 1 < args.Length && int.TryParse(args[i + 1], out var p))
                port = p;
        }

        // Initialize the headless Avalonia platform on this (main) thread.
        AppBuilder.Configure<App>()
            .UseHeadless(new AvaloniaHeadlessPlatformOptions())
            .UseSkia()
            .SetupWithoutStarting();

        var listener = new HttpListener();
        listener.Prefixes.Add($"http://127.0.0.1:{port}/");
        listener.Start();
        Console.WriteLine($"PREVIEWER_HOST_READY port={port}");

        try
        {
            while (true)
            {
                HttpListenerContext ctx;
                try { ctx = listener.GetContext(); }
                catch { break; }

                if (ctx.Request.IsWebSocketRequest)
                {
                    using var ws = ctx.AcceptWebSocketAsync(null).GetAwaiter().GetResult().WebSocket;
                    Serve(ws);
                }
                else
                {
                    try { ctx.Response.StatusCode = 400; ctx.Response.Close(); }
                    catch { /* ignore */ }
                }
            }
        }
        catch { /* ignore */ }

        try { listener.Stop(); } catch { /* ignore */ }
        return 0;
    }

    /// <summary>Serves a single WebSocket client synchronously on the main (UI) thread.</summary>
    private static void Serve(WebSocket ws)
    {
        var buffer = new byte[8 * 1024 * 1024];
        while (ws.State == WebSocketState.Open)
        {
            try
            {
                using var ms = new MemoryStream();
                WebSocketReceiveResult result;
                do
                {
                    result = ws.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None).GetAwaiter().GetResult();
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None).GetAwaiter().GetResult();
                        return;
                    }
                    ms.Write(buffer, 0, result.Count);
                } while (!result.EndOfMessage);

                var json = Encoding.UTF8.GetString(ms.ToArray());
                var resp = ProcessRequest(json);
                var bytes = Encoding.UTF8.GetBytes(resp);
                ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None).GetAwaiter().GetResult();
            }
            catch (WebSocketException)
            {
                break;
            }
            catch (Exception ex)
            {
                try
                {
                    var b = Encoding.UTF8.GetBytes(Json(0, new { type = "error", error = ex.Message }));
                    ws.SendAsync(new ArraySegment<byte>(b), WebSocketMessageType.Text, true, CancellationToken.None).GetAwaiter().GetResult();
                }
                catch { break; }
            }
        }
    }

    private static string ProcessRequest(string json)
    {
        long id = 0;
        string type = "";
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.TryGetProperty("id", out var idEl) && idEl.TryGetInt64(out var i)) id = i;
            if (root.TryGetProperty("type", out var t)) type = t.GetString() ?? "";

            switch (type)
            {
                case "hello":
                    return Json(id, new { type = "helloAck" });
                case "ping":
                    return Json(id, new { type = "pong" });
                case "snippet":
                {
                    var tag = root.TryGetProperty("tag", out var tagEl) ? tagEl.GetString() ?? "Button" : "Button";
                    var snip = Factory.Create(tag);
                    return Json(id, new { type = "snippetResult", tag, name = snip.Name, xaml = snip.Xaml });
                }
                case "render":
                {
                    var xaml = root.TryGetProperty("xaml", out var xel) ? xel.GetString() ?? "" : "";
                    double w = 800, h = 450;
                    if (root.TryGetProperty("width", out var wel) && wel.TryGetDouble(out var wv)) w = wv;
                    if (root.TryGetProperty("height", out var hel) && hel.TryGetDouble(out var hv)) h = hv;
                    var projectPath = root.TryGetProperty("projectPath", out var pp) ? pp.GetString() ?? "" : "";
                    var theme = root.TryGetProperty("theme", out var th) ? th.GetString() ?? "" : "";

                    var frame = Renderer.Render(xaml, w, h,
                        string.IsNullOrEmpty(projectPath) ? null : projectPath,
                        string.IsNullOrEmpty(theme) ? null : theme);
                    return Json(id, new
                    {
                        type = "frame",
                        png = frame.PngBase64,
                        width = frame.Width,
                        height = frame.Height,
                        controls = frame.Controls,
                        gridCells = frame.GridCells,
                        error = frame.Error
                    });
                }
                case "audit":
                {
                    var typeName = root.TryGetProperty("typeName", out var te) ? te.GetString() ?? "" : "";
                    var keys = new List<string>();
                    if (root.TryGetProperty("keys", out var ke) && ke.ValueKind == JsonValueKind.Array)
                        foreach (var k in ke.EnumerateArray())
                            if (k.GetString() is { } ks) keys.Add(ks);
                    return Json(id, new { type = "auditResult", typeName, valid = AuditKeys(typeName, keys) });
                }
                default:
                    return Json(id, new { type = "error", error = $"Unknown message type '{type}'" });
            }
        }
        catch (Exception ex)
        {
            return Json(id, new { type = "error", error = ex.ToString() });
        }
    }

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    /// <summary>Reflection audit: returns the subset of the given property keys that actually
    /// exist as public instance properties on the named Avalonia control type. Attached
    /// properties (containing a '.') are assumed valid. Used by the extension to keep only
    /// valid properties in the panel.</summary>
    private static List<string> AuditKeys(string typeName, List<string> keys)
    {
        var type = AppDomain.CurrentDomain.GetAssemblies()
            .SelectMany(a =>
            {
                try { return a.GetTypes(); }
                catch (ReflectionTypeLoadException e) { return e.Types.Where(t => t is not null).Cast<Type>(); }
                catch { return Type.EmptyTypes; }
            })
            .FirstOrDefault(t => t.Name == typeName && !t.IsAbstract && typeof(Control).IsAssignableFrom(t));

        if (type is null) return new List<string>();
        var valid = new List<string>();
        foreach (var key in keys)
        {
            if (key.Contains('.')) { valid.Add(key); continue; }
            if (type.GetProperty(key, BindingFlags.Public | BindingFlags.Instance) is not null)
                valid.Add(key);
        }
        return valid;
    }

    private static string Json(long id, object body)
    {
        var dict = new Dictionary<string, object?> { ["id"] = id };
        foreach (var p in body.GetType().GetProperties())
            dict[p.Name] = p.GetValue(body);
        return JsonSerializer.Serialize(dict, JsonOpts);
    }
}
