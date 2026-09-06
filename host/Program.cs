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
using Microsoft.Data.Sqlite;
using SQLitePCL;

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

        // SQLite (design-time preview / schema inspection of the user's .db files).
        Batteries_V2.Init();

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

                    // Optional design-time data: DB rows for named DataGrids (bound DataSet tables),
                    // so the designer canvas can show the grid's rows even though code-behind never runs.
                    var grids = new List<XamlRenderer.GridPreviewData>();
                    if (root.TryGetProperty("grids", out var ge) && ge.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var g in ge.EnumerateArray())
                        {
                            var gd = new XamlRenderer.GridPreviewData();
                            if (g.TryGetProperty("control", out var ce)) gd.Control = ce.GetString() ?? "";
                            if (g.TryGetProperty("columns", out var cole) && cole.ValueKind == JsonValueKind.Array)
                            {
                                var cols = new List<string>();
                                foreach (var c in cole.EnumerateArray()) cols.Add(c.GetString() ?? "");
                                gd.Columns = cols.ToArray();
                            }
                            if (g.TryGetProperty("rows", out var rowe) && rowe.ValueKind == JsonValueKind.Array)
                            {
                                var rows = new List<object?[]>();
                                foreach (var r in rowe.EnumerateArray())
                                {
                                    var cells = new List<object?>();
                                    if (r.ValueKind == JsonValueKind.Array)
                                    {
                                        foreach (var cell in r.EnumerateArray()) cells.Add(JsonCell(cell));
                                    }
                                    rows.Add(cells.ToArray());
                                }
                                gd.Rows = rows.ToArray();
                            }
                            grids.Add(gd);
                        }
                    }

                    var frame = Renderer.Render(xaml, w, h,
                        string.IsNullOrEmpty(projectPath) ? null : projectPath,
                        string.IsNullOrEmpty(theme) ? null : theme,
                        grids);
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
                case "fonts":
                {
                    // Enumerate the system font families Avalonia can actually see (same engine the
                    // generated projects resolve fonts with) for the designer's font pickers.
                    var names = new List<string>();
                    try
                    {
                        foreach (var family in FontManager.Current.SystemFonts)
                            if (!string.IsNullOrWhiteSpace(family.Name))
                                names.Add(family.Name);
                    }
                    catch
                    {
                        // Keep whatever was collected (best effort).
                    }
                    var fonts = names
                        .Distinct(StringComparer.CurrentCultureIgnoreCase)
                        .OrderBy(n => n, StringComparer.CurrentCultureIgnoreCase)
                        .ToList();
                    return Json(id, new { type = "fontsResult", fonts });
                }
                case "sqlite":
                {
                    // Design-time access to the user's SQLite database file. Read-only.
                    //   op "tables" -> { type:"sqliteTables", tables:[{name, columns:[{name,type,notNull,isPk}]}] }
                    //   op "query"  -> { type:"sqliteResult", columns:[..], rows:[[..]] }  (json-safe values)
                    var file = root.TryGetProperty("file", out var fe) ? fe.GetString() ?? "" : "";
                    var op = root.TryGetProperty("op", out var oe) ? oe.GetString() ?? "query" : "query";
                    if (op == "tables")
                        return Json(id, new { type = "sqliteTables", tables = SqliteTables(file) });
                    var sql = root.TryGetProperty("sql", out var se) ? se.GetString() ?? "" : "";
                    int limit = 200;
                    if (root.TryGetProperty("limit", out var le) && le.TryGetInt32(out var lv)) limit = lv;
                    var q = SqliteQuery(file, sql, limit);
                    return Json(id, new { type = "sqliteResult", columns = q.Columns, rows = q.Rows });
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

    // ---------------- SQLite (design-time data preview / schema inspection) ----------------

    /// <summary>Lists the user tables in a SQLite file with their columns (name/type/notNull/isPk).</summary>
    private static object[] SqliteTables(string file)
    {
        var list = new List<object>();
        if (!File.Exists(file)) return list.ToArray();
        using var con = new SqliteConnection($"Data Source={file};Mode=ReadOnly");
        con.Open();
        using (var names = new SqliteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name", con))
        using (var rd = names.ExecuteReader())
        {
            var tableNames = new List<string>();
            while (rd.Read()) tableNames.Add(rd.GetString(0));
            foreach (var n in tableNames)
            {
                var cols = new List<object>();
                using var pragma = new SqliteCommand($"PRAGMA table_info(\"{n.Replace("\"", "\"\"")}\")", con);
                using var rd2 = pragma.ExecuteReader();
                while (rd2.Read())
                {
                    cols.Add(new
                    {
                        name = rd2.GetString(1),
                        type = rd2.IsDBNull(2) ? "" : rd2.GetString(2),
                        notNull = rd2.GetInt64(3) != 0,
                        isPk = rd2.GetInt64(5) != 0
                    });
                }
                list.Add(new { name = n, columns = cols });
            }
        }
        return list.ToArray();
    }

    /// <summary>Converts a JSON cell to a CLR value for the design-time grid preview.</summary>
    private static object? JsonCell(JsonElement cell)
    {
        switch (cell.ValueKind)
        {
            case JsonValueKind.Null: return null;
            case JsonValueKind.String: return cell.GetString();
            case JsonValueKind.Number: return cell.GetRawText();
            case JsonValueKind.True: return true;
            case JsonValueKind.False: return false;
            default: return cell.GetRawText();
        }
    }

    /// <summary>Runs a read-only SELECT on a SQLite file and returns json-safe columns/rows (capped).</summary>
    private static (string[] Columns, object?[][] Rows) SqliteQuery(string file, string sql, int limit)
    {
        if (string.IsNullOrWhiteSpace(sql)) throw new InvalidOperationException("No SQL given.");
        if (!File.Exists(file)) throw new InvalidOperationException($"SQLite file not found: {file}");
        using var con = new SqliteConnection($"Data Source={file};Mode=ReadOnly");
        con.Open();
        using var cmd = con.CreateCommand();
        cmd.CommandText = sql;
        using var rd = cmd.ExecuteReader();
        var cols = new List<string>(rd.FieldCount);
        for (int i = 0; i < rd.FieldCount; i++) cols.Add(rd.GetName(i));
        var rows = new List<object?[]>();
        int read = 0;
        while (rd.Read() && (limit <= 0 || read < limit))
        {
            var row = new object?[rd.FieldCount];
            for (int i = 0; i < rd.FieldCount; i++)
                row[i] = SqliteJsonSafe(rd.IsDBNull(i) ? null : rd.GetValue(i));
            rows.Add(row);
            read++;
        }
        return (cols.ToArray(), rows.ToArray());
    }

    private static object? SqliteJsonSafe(object? v)
    {
        if (v is null) return null;
        if (v is byte[] b) return Convert.ToBase64String(b);
        if (v is DateTime dt) return dt.ToString("O");
        if (v is DateTimeOffset dto) return dto.ToString("O");
        return v;
    }
}
