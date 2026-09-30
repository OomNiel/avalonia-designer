// BUNDLED-COPY: 0.13.19
// GrumpyPrint.cs — BUNDLED RESOURCE (the VB twin is resources/GrumpyPrint.vb). Copied into a project
// next to GrumpyCharts.cs / ChromeWindow.cs / PathPicker.cs / … and linked into the PreviewerHost.
//
// WHY THIS FILE EXISTS
// The chart's Print… entry asks Avae.Printables for a printing service (`Printable.Default`). That
// package is a community library and ships a real implementation only for the platforms it targets —
// Windows (WinRT), macOS, GTK-Linux, the browser, Android, iOS — plus an API-only fallback that every
// other target gets. On a plain Linux desktop build that fallback is what is restored: `UsePrintables()`
// compiles, runs, and registers nothing, so `Printable.Default` stays null and the chart used to
// disable its Print… entry (honest, but useless on the very machine the chart was drawn on).
//
// This helper fills exactly that gap, and only that gap:
//   • Windows and macOS never reach it: there Avae.Printables registered the native service, so the
//     chart hands the page to the platform's own print dialog instead (see ChartBase.PrintAsync);
//   • on Linux with a CUPS client (`lp`) on the PATH it renders the page to a temporary PDF — the
//     vector export the chart already needs — and hands that file to CUPS.
//
// The page GUTTER — its size, margin and white background — still comes from whoever composed the page
// (a chart's Print Paper / Print Margin / Print on White rows, or the sheet's own A4) and is handed over as
// a visual. What this file does know about pages, since 2026-09-27, is the ONE thing a PDF cannot carry on
// every queue: which way round it is. A caller that composed a landscape page passes PrintPageSettings and
// the CUPS job says so — see that type for the measurement that made it necessary. A caller that passes
// nothing gets exactly the argument list this file has always sent.
//
// The chart asks GrumpyPrint.Available before it offers its Print… entry, so that property is the
// whole integration surface: no service to register, no interface to implement, nothing to add to
// Program — and it is only ever consulted with PRINT_SUPPORT on.
//
// No new dependency: `System.Diagnostics` for the process, and AvaloniaUI.PrintToPDF for the render —
// both already in the project that prints.

#if PRINT_SUPPORT

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Threading.Tasks;
using Avalonia;
using AvaloniaUI.PrintToPDF;

namespace AvaloniaCharts
{
    /// <summary>
    /// What the PAGE is, for the printer's own options — the part of a print job a PDF cannot carry on
    /// every queue.
    /// <para>
    /// A Linux desktop prints through CUPS, and CUPS's PDF filter (<c>pdftopdf</c>) transforms the page
    /// according to the JOB'S options rather than the file's page box. A queue whose saved defaults say
    /// portrait — which <c>~/.cups/lpoptions</c> can pin for a user — therefore rotates or re-scales a
    /// landscape page. Measured here on 2026-09-27 (Canon MF230 + CUPS, one and the same PDF): no options
    /// came out wrong, and <c>-o orientation-requested=4</c> came out right.
    /// </para>
    /// <para>
    /// <b>Null means "no options at all"</b>: the argument list this helper has always sent, just the title
    /// and the file. A chart whose page is its own size must not claim to be A4 — only a caller that really
    /// composed paper of its own says so here.
    /// </para>
    /// </summary>
    public sealed class PrintPageSettings
    {
        /// <summary>True for a page wider than tall: CUPS is asked for orientation-requested=4 (landscape)
        /// instead of 3 (portrait).</summary>
        public bool Landscape { get; set; }

        /// <summary>The paper the page was composed for, e.g. "A4". Empty sends no paper option at all,
        /// which leaves the queue's own default alone.</summary>
        public string PaperSize { get; set; } = string.Empty;

        /// <summary>The orientation said the way the printer understands it: 4 is landscape, 3 portrait.</summary>
        public int OrientationRequested => Landscape ? 4 : 3;
    }

    /// <summary>
    /// Printing for the platforms Avae.Printables does not cover: the page is rendered to a temporary
    /// PDF and handed to CUPS. The chart asks <see cref="Available"/> first, so on Windows and macOS —
    /// where the library's own service exists — nothing in here is ever used.
    /// </summary>
    public static class GrumpyPrint
    {
        private static readonly object Gate = new();
        private static bool _checked;
        private static bool _available;

        /// <summary>
        /// True when this machine can put a page on paper through CUPS: a Linux desktop with `lp` on
        /// the PATH. False everywhere else, and cached after the first look (a check per menu would
        /// otherwise walk the PATH every time the menu opens).
        /// </summary>
        public static bool Available
        {
            get
            {
                if (_checked) return _available;
                lock (Gate)
                {
                    if (_checked) return _available;
                    _checked = true;
                    try
                    {
                        _available = OperatingSystem.IsLinux() && OnPath("lp");
                        if (_available) Trace.WriteLine("GrumpyPrint: printing through CUPS (`lp`).");
                    }
                    catch (Exception error)
                    {
                        // Never take the app down for this: the chart simply keeps Print… disabled.
                        Trace.WriteLine("GrumpyPrint: cannot tell whether CUPS is available — " + error.Message);
                    }
                    return _available;
                }
            }
        }

        /// <summary>
        /// Print one visual — the page the caller composed — on real paper: render it to a temporary PDF,
        /// then <c>lp [-d printer] [-o …] -t title file</c>. Throws when CUPS refuses, which the caller
        /// reports through its PrintFailed event (it never throws into the caller).
        /// <para>
        /// <paramref name="settings"/> says which way round the page is, when the caller knows; leaving it
        /// null sends no options at all, exactly as this overload always did.
        /// </para>
        /// </summary>
        public static async Task PrintAsync(Visual visual, string title, string? printer = null,
            PrintPageSettings? settings = null)
        {
            if (visual is null) throw new ArgumentNullException(nameof(visual));
            var file = Path.Combine(Path.GetTempPath(),
                "grumpyprint-" + Guid.NewGuid().ToString("N") + ".pdf");
            try
            {
                await Print.ToFileAsync(file, new[] { visual });
                if (!await SendFileAsync(file, title, printer, settings))
                    throw new InvalidOperationException(
                        "CUPS refused the print job (see the trace for the job's output).");
            }
            finally
            {
                // lp has handed the job to the scheduler by the time it returns, so the temporary file
                // is ours to remove. (If the deletion fails, the OS clears the temp folder.)
                try { if (File.Exists(file)) File.Delete(file); } catch { }
            }
        }

        /// <summary>
        /// Print a file that is already on disk. The chart's legend-override path needs this: the page it
        /// wants the printer to have cannot be the LIVE chart the other overload takes, so the chart renders
        /// the PDF itself and hands the file over. Same <paramref name="settings"/> rule.
        /// </summary>
        public static async Task PrintFileAsync(string file, string title, string? printer = null,
            PrintPageSettings? settings = null)
        {
            if (!await SendFileAsync(file, title, printer, settings))
                throw new InvalidOperationException("CUPS refused the print job (see the trace for the job's output).");
        }

        /// <summary>Is this executable somewhere on the PATH? (No shell involved.)</summary>
        internal static bool OnPath(string name)
        {
            var path = Environment.GetEnvironmentVariable("PATH");
            if (string.IsNullOrEmpty(path)) return false;
            foreach (var folder in path.Split(Path.PathSeparator))
            {
                if (string.IsNullOrWhiteSpace(folder)) continue;
                try
                {
                    if (File.Exists(Path.Combine(folder.Trim(), name))) return true;
                }
                catch
                {
                    // A malformed PATH entry must not stop the search.
                }
            }
            return false;
        }

        /// <summary>Runs a process and waits for it, capturing both streams. Never throws.</summary>
        internal static async Task<bool> RunAsync(string program, IEnumerable<string> arguments)
        {
            try
            {
                var info = new ProcessStartInfo(program)
                {
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                // Arguments as a LIST: no quoting bugs, and a test can assert them one by one.
                foreach (var argument in arguments) info.ArgumentList.Add(argument);
                using var process = Process.Start(info);
                if (process is null) return false;
                var output = await process.StandardOutput.ReadToEndAsync();
                var errors = await process.StandardError.ReadToEndAsync();
                await process.WaitForExitAsync();
                if (process.ExitCode != 0)
                {
                    Trace.WriteLine($"{program} exited {process.ExitCode}: {(errors + output).Trim()}");
                    return false;
                }
                return true;
            }
            catch (Exception error)
            {
                Trace.WriteLine($"{program} could not be run — {error.Message}");
                return false;
            }
        }

        /// <summary>
        /// The whole CUPS interaction as an argument list: <c>lp [-d printer] [-o …] -t title file</c>. Built
        /// as a LIST for <see cref="ProcessStartInfo.ArgumentList"/> — no shell, no quoting — and so that a
        /// test can assert the command line one argument at a time.
        /// <para>
        /// The <c>-o</c> rows appear only when <paramref name="settings"/> asks for them: the orientation
        /// (because <c>pdftopdf</c> follows the JOB, not the PDF's page box) and the paper, plus
        /// <c>number-up=1</c> so a queue left on "2-up" cannot quietly halve the app's own page layout.
        /// </para>
        /// </summary>
        internal static List<string> CupsArguments(string file, string title, string? printer,
            PrintPageSettings? settings)
        {
            var arguments = new List<string>();
            if (!string.IsNullOrWhiteSpace(printer)) { arguments.Add("-d"); arguments.Add(printer!); }
            if (settings is not null)
            {
                arguments.Add("-o");
                arguments.Add("orientation-requested=" +
                              settings.OrientationRequested.ToString(CultureInfo.InvariantCulture));
                if (!string.IsNullOrWhiteSpace(settings.PaperSize))
                {
                    arguments.Add("-o");
                    arguments.Add("PageSize=" + settings.PaperSize);
                }

                arguments.Add("-o");
                arguments.Add("number-up=1");
            }

            // -t is the job title: what the user sees in the print queue while the page comes out.
            if (!string.IsNullOrWhiteSpace(title)) { arguments.Add("-t"); arguments.Add(title); }
            arguments.Add(file);
            return arguments;
        }

        /// <summary><c>lp</c> with the arguments above — the whole CUPS interaction.</summary>
        private static async Task<bool> SendFileAsync(string file, string title, string? printer,
            PrintPageSettings? settings)
        {
            if (string.IsNullOrWhiteSpace(file)) return false;
            return await RunAsync("lp", CupsArguments(file, title, printer, settings));
        }
    }
}

#else

namespace AvaloniaCharts
{
    /// <summary>
    /// The helper as it exists in a build WITHOUT <c>PRINT_SUPPORT</c> — the headless previewer, for
    /// instance. There is no printing there at all, and the chart's print entries are compiled out
    /// with the same symbol, so this is deliberately empty.
    /// </summary>
    public static class GrumpyPrint
    {
        /// <summary>Always false here — the CUPS path only exists with PRINT_SUPPORT.</summary>
        public static bool Available => false;
    }
}

#endif
