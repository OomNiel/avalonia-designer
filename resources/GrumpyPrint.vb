' BUNDLED-COPY: 0.12.4
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
' The page size, margin and white background come from the CHART (its Print Paper / Print Margin /
' Print on White rows), which hands us the visual it composed — so nothing here knows about pages, and
' the same options steer the printer and the PDF export alike.
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
Imports System.IO
Imports System.Threading.Tasks
Imports Avalonia
Imports AvaloniaUI.PrintToPDF

Namespace Global.AvaloniaCharts

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
        ''' Print one visual — the page the chart composed — on real paper: render it to a temporary
        ''' PDF, then lp [-d printer] -t title file. Throws when CUPS refuses, which the chart reports
        ''' through its PrintFailed event (it never throws into the caller).
        ''' </summary>
        Public Shared Async Function PrintAsync(visual As Visual, title As String, Optional printer As String = Nothing) As Task
            If visual Is Nothing Then Throw New ArgumentNullException(NameOf(visual))
            Dim file As String = IO.Path.Combine(IO.Path.GetTempPath(), "grumpyprint-" & Guid.NewGuid().ToString("N") & ".pdf")
            Try
                Await Print.ToFileAsync(file, New Visual() {visual})
                If Not Await SendFileAsync(file, title, printer) Then
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
        ''' the PDF itself and hands the file over.
        ''' </summary>
        Public Shared Async Function PrintFileAsync(file As String, title As String, Optional printer As String = Nothing) As Task
            If Not Await SendFileAsync(file, title, printer) Then
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

        ''' <summary>lp [-d printer] -t title file — the whole CUPS interaction.</summary>
        Private Shared Async Function SendFileAsync(file As String, title As String, printer As String) As Task(Of Boolean)
            If String.IsNullOrWhiteSpace(file) Then Return False
            Dim arguments As New List(Of String)()
            If Not String.IsNullOrWhiteSpace(printer) Then
                arguments.Add("-d")
                arguments.Add(printer)
            End If
            ' -t is the job title: what the user sees in the print queue while the page comes out.
            If Not String.IsNullOrWhiteSpace(title) Then
                arguments.Add("-t")
                arguments.Add(title)
            End If
            arguments.Add(file)
            Return Await RunAsync("lp", arguments)
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
