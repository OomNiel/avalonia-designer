' BUNDLED-COPY: 0.13.1
' GrumpyPrint.vb — BUNDLED RESOURCE (the C# twin is resources/GrumpyPrint.cs). Copied into a project
' next to GrumpyCharts.vb / ChromeWindow.vb / PathPicker.vb / … and linked into the PreviewerHost.
'
' WHY THIS FILE EXISTS
' The chart's Print… entry asks Avae.Printables for a printing service (Printable.Default). That
' package is a community library and ships a real implementation only for the platforms it targets —
' Windows (WinRT), macOS, GTK-Linux, the browser, Android, iOS — plus an API-only fallback that every
' other target gets. On a plain Linux desktop build that fallback is what is restored: UsePrintables()
' compiles, runs, and registers nothing, so Printable.Default stays null and the chart used to disable
' its Print… entry (honest, but useless on the very machine the chart was drawn on).
'
' This helper fills exactly that gap, and only that gap:
'   • Windows and macOS never reach it: there Avae.Printables registered the native service, so the
'     chart hands the page to the platform's own print dialog instead (see ChartBase.PrintAsync);
'   • on Linux with a CUPS client (lp) on the PATH it renders the page to a temporary PDF — the vector
'     export the chart already needs — and hands that file to CUPS.
'
' The page GUTTER — its size, margin and white background — still comes from whoever composed the page
' (a chart's Print Paper / Print Margin / Print on White rows, or the sheet's own A4) and is handed over as
' a visual. What this file does know about pages, since 2026-09-27, is the ONE thing a PDF cannot carry on
' every queue: which way round it is. A caller that composed a landscape page passes PrintPageSettings and
' the CUPS job says so — see that type for the measurement that made it necessary. A caller that passes
' nothing gets exactly the argument list this file has always sent.
'
' The chart asks GrumpyPrint.Available before it offers its Print… entry, so that property is the whole
' integration surface: no service to register, no interface to implement, nothing to add to Program —
' and it is only ever consulted with PRINT_SUPPORT on.
'
' No new dependency: System.Diagnostics for the process, and AvaloniaUI.PrintToPDF for the render —
' both already in the project that prints.

#If PRINT_SUPPORT Then

Imports System
Imports System.Collections.Generic
Imports System.Diagnostics
Imports System.Globalization
Imports System.IO
Imports System.Threading.Tasks
Imports Avalonia
Imports AvaloniaUI.PrintToPDF

Namespace Global.AvaloniaCharts

    ''' <summary>
    ''' What the PAGE is, for the printer's own options — the part of a print job a PDF cannot carry on
    ''' every queue.
    ''' <para>
    ''' A Linux desktop prints through CUPS, and CUPS's PDF filter (pdftopdf) transforms the page according
    ''' to the JOB'S options rather than the file's page box. A queue whose saved defaults say portrait —
    ''' which ~/.cups/lpoptions can pin for a user — therefore rotates or re-scales a landscape page.
    ''' Measured here on 2026-09-27 (Canon MF230 + CUPS, one and the same PDF): no options came out wrong,
    ''' and -o orientation-requested=4 came out right.
    ''' </para>
    ''' <para>
    ''' Nothing means "no options at all": the argument list this helper has always sent, just the title
    ''' and the file. A chart whose page is its own size must not claim to be A4 — only a caller that really
    ''' composed paper of its own says so here.
    ''' </para>
    ''' </summary>
    Public NotInheritable Class PrintPageSettings

        ''' <summary>True for a page wider than tall: CUPS is asked for orientation-requested=4 (landscape)
        ''' instead of 3 (portrait).</summary>
        Public Property Landscape As Boolean

        ''' <summary>The paper the page was composed for, e.g. "A4". Empty sends no paper option at all,
        ''' which leaves the queue's own default alone.</summary>
        Public Property PaperSize As String = String.Empty

        ''' <summary>The orientation said the way the printer understands it: 4 is landscape, 3 portrait.</summary>
        Public ReadOnly Property OrientationRequested As Integer
            Get
                Return If(Landscape, 4, 3)
            End Get
        End Property
    End Class

    ''' <summary>
    ''' Printing for the platforms Avae.Printables does not cover: the page is rendered to a temporary
    ''' PDF and handed to CUPS. The chart asks Available first, so on Windows and macOS — where the
    ''' library's own service exists — nothing in here is ever used.
    ''' </summary>
    Public NotInheritable Class GrumpyPrint

        Private Shared ReadOnly Gate As New Object()
        Private Shared _checked As Boolean
        Private Shared _available As Boolean

        Private Sub New()
        End Sub

        ''' <summary>
        ''' True when this machine can put a page on paper through CUPS: a Linux desktop with lp on the
        ''' PATH. False everywhere else, and cached after the first look (a check per menu would
        ''' otherwise walk the PATH every time the menu opens).
        ''' </summary>
        Public Shared ReadOnly Property Available As Boolean
            Get
                If _checked Then Return _available
                SyncLock Gate
                    If _checked Then Return _available
                    _checked = True
                    Try
                        _available = OperatingSystem.IsLinux() AndAlso OnPath("lp")
                        If _available Then Trace.WriteLine("GrumpyPrint: printing through CUPS (lp).")
                    Catch ex As Exception
                        ' Never take the app down for this: the chart simply keeps Print… disabled.
                        Trace.WriteLine("GrumpyPrint: cannot tell whether CUPS is available — " & ex.Message)
                    End Try
                    Return _available
                End SyncLock
            End Get
        End Property

        ''' <summary>
        ''' Print one visual — the page the caller composed — on real paper: render it to a temporary PDF,
        ''' then lp [-d printer] [-o …] -t title file. Throws when CUPS refuses, which the caller reports
        ''' through its PrintFailed event (it never throws into the caller).
        ''' <para>
        ''' settings says which way round the page is, when the caller knows; leaving it Nothing sends no
        ''' options at all, exactly as this overload always did.
        ''' </para>
        ''' </summary>
        Public Shared Async Function PrintAsync(visual As Visual, title As String, Optional printer As String = Nothing,
            Optional settings As PrintPageSettings = Nothing) As Task
            If visual Is Nothing Then Throw New ArgumentNullException(NameOf(visual))
            Dim file As String = IO.Path.Combine(IO.Path.GetTempPath(), "grumpyprint-" & Guid.NewGuid().ToString("N") & ".pdf")
            Try
                Await Print.ToFileAsync(file, New Visual() {visual})
                If Not Await SendFileAsync(file, title, printer, settings) Then
                    Throw New InvalidOperationException("CUPS refused the print job (see the trace for the job's output).")
                End If
            Finally
                ' lp has handed the job to the scheduler by the time it returns, so the temporary file is
                ' ours to remove. (If the deletion fails, the OS clears the temp folder.)
                Try
                    If IO.File.Exists(file) Then IO.File.Delete(file)
                Catch
                    ' Best effort only.
                End Try
            End Try
        End Function

        ''' <summary>
        ''' Print a file that is already on disk. The chart's legend-override path needs this: the page it
        ''' wants the printer to have cannot be the LIVE chart the other overload takes, so the chart renders
        ''' the PDF itself and hands the file over. Same settings rule.
        ''' </summary>
        Public Shared Async Function PrintFileAsync(file As String, title As String, Optional printer As String = Nothing,
            Optional settings As PrintPageSettings = Nothing) As Task
            If Not Await SendFileAsync(file, title, printer, settings) Then
                Throw New InvalidOperationException("CUPS refused the print job (see the trace for the job's output).")
            End If
        End Function

        ''' <summary>Is this executable somewhere on the PATH? (No shell involved.)</summary>
        Friend Shared Function OnPath(name As String) As Boolean
            Dim path As String = Environment.GetEnvironmentVariable("PATH")
            If String.IsNullOrEmpty(path) Then Return False
            For Each folder In path.Split(IO.Path.PathSeparator)
                If String.IsNullOrWhiteSpace(folder) Then Continue For
                Try
                    If IO.File.Exists(IO.Path.Combine(folder.Trim(), name)) Then Return True
                Catch
                    ' A malformed PATH entry must not stop the search.
                End Try
            Next
            Return False
        End Function

        ''' <summary>Runs a process and waits for it, capturing both streams. Never throws.</summary>
        Friend Shared Async Function RunAsync(program As String, arguments As IEnumerable(Of String)) As Task(Of Boolean)
            Try
                Dim info As New ProcessStartInfo(program) With {
                    .RedirectStandardOutput = True,
                    .RedirectStandardError = True,
                    .UseShellExecute = False,
                    .CreateNoWindow = True
                }
                ' Arguments as a LIST: no quoting bugs, and a test can assert them one by one.
                For Each argument In arguments
                    info.ArgumentList.Add(argument)
                Next
                ' NB: named `proc`, not `process` — `Using process = Process.Start(...)` cannot infer the
                ' type when the variable name repeats the type name (BC30980).
                Using proc As Process = Process.Start(info)
                    If proc Is Nothing Then Return False
                    Dim output = Await proc.StandardOutput.ReadToEndAsync()
                    Dim errors = Await proc.StandardError.ReadToEndAsync()
                    Await proc.WaitForExitAsync()
                    If proc.ExitCode <> 0 Then
                        Trace.WriteLine(program & " exited " & proc.ExitCode & ": " & (errors & output).Trim())
                        Return False
                    End If
                    Return True
                End Using
            Catch ex As Exception
                Trace.WriteLine(program & " could not be run — " & ex.Message)
                Return False
            End Try
        End Function

        ''' <summary>
        ''' The whole CUPS interaction as an argument list: lp [-d printer] [-o …] -t title file. Built as a
        ''' LIST for ProcessStartInfo.ArgumentList — no shell, no quoting — and so that a test can assert the
        ''' command line one argument at a time.
        ''' <para>
        ''' The -o rows appear only when settings asks for them: the orientation (because pdftopdf follows
        ''' the JOB, not the PDF's page box) and the paper, plus number-up=1 so a queue left on "2-up" cannot
        ''' quietly halve the app's own page layout.
        ''' </para>
        ''' </summary>
        Friend Shared Function CupsArguments(file As String, title As String, printer As String,
            settings As PrintPageSettings) As List(Of String)
            Dim arguments As New List(Of String)()
            If Not String.IsNullOrWhiteSpace(printer) Then
                arguments.Add("-d")
                arguments.Add(printer)
            End If
            If settings IsNot Nothing Then
                arguments.Add("-o")
                arguments.Add("orientation-requested=" &
                              settings.OrientationRequested.ToString(CultureInfo.InvariantCulture))
                If Not String.IsNullOrWhiteSpace(settings.PaperSize) Then
                    arguments.Add("-o")
                    arguments.Add("PageSize=" & settings.PaperSize)
                End If

                arguments.Add("-o")
                arguments.Add("number-up=1")
            End If

            ' -t is the job title: what the user sees in the print queue while the page comes out.
            If Not String.IsNullOrWhiteSpace(title) Then
                arguments.Add("-t")
                arguments.Add(title)
            End If
            arguments.Add(file)
            Return arguments
        End Function

        ''' <summary>lp with the arguments above — the whole CUPS interaction.</summary>
        Private Shared Async Function SendFileAsync(file As String, title As String, printer As String,
            settings As PrintPageSettings) As Task(Of Boolean)
            If String.IsNullOrWhiteSpace(file) Then Return False
            Return Await RunAsync("lp", CupsArguments(file, title, printer, settings))
        End Function
    End Class

End Namespace

#Else

Namespace Global.AvaloniaCharts

    ''' <summary>
    ''' The helper as it exists in a build WITHOUT PRINT_SUPPORT — the headless previewer, for instance.
    ''' There is no printing there at all, and the chart's print entries are compiled out with the same
    ''' symbol, so this is deliberately empty.
    ''' </summary>
    Public NotInheritable Class GrumpyPrint

        Private Sub New()
        End Sub

        ''' <summary>Always false here — the CUPS path only exists with PRINT_SUPPORT.</summary>
        Public Shared ReadOnly Property Available As Boolean
            Get
                Return False
            End Get
        End Property
    End Class

End Namespace

#End If
