' BUNDLED-COPY: 0.14.0
' ============================================================================
'  Timer.vb — a NON-VISUAL Timer component for a form (the WinForms Timer idea).
'  (The C# twin is resources/Timer.cs — keep the two in step.)
'
'  Avalonia ships no Timer control: what it has is Avalonia.Threading.DispatcherTimer, a
'  non-visual class that raises Tick ON THE UI THREAD. This component is what the designer's
'  Toolbox offers, and it deliberately ticks on a WORKER THREAD instead (System.Timers.Timer),
'  so a Tick handler may do slow work - poll a port, read a file, talk to a device - without
'  freezing the window while it does. It is the same relationship WinForms' System.Timers.Timer
'  has to System.Windows.Forms.Timer.
'
'  WinForms Timer  ->  this
'    Interval (ms)      Interval     (same unit and same default: 100 ms)
'    Enabled            Enabled      (True = running; the XAML attribute starts it)
'    Tick event         Tick         (raised on a WORKER THREAD - see below)
'    Timer1 (tray)      <chrome:Timer x:Name="Timer1"/>   (listed in the designer's tray)
'    Timer1.Start/Stop  Start() / Stop()
'
'  THREADING - READ THIS
'  ---------------------
'  Tick is raised on a thread-pool thread, NOT the UI thread. That is the point (a slow handler
'  must not freeze the window), but it also means a control may NOT be touched from the handler:
'  marshal the UI work with Dispatcher.UIThread.Post(...) (fire and forget) or InvokeAsync(...):
'
'      Private Sub Timer1_Tick(sender As Object, e As System.EventArgs)
'          Dim reading = ReadThePort()                                  ' worker thread: fine
'          Avalonia.Threading.Dispatcher.UIThread.Post(                 ' UI thread
'              Sub() ReadingLabel.Text = reading)
'      End Sub
'
'  A Tick handler that throws would otherwise take the whole app down (an unhandled exception on a
'  pool thread), so a throwing handler is traced instead of rethrown - see OnTick.
'
'  DROP-IN USAGE
'  -------------
'  1. Copy this file into your project (or link it from a shared folder).
'  2. Use it in XAML with  xmlns:chrome="using:AvaloniaChrome":
'       <chrome:Timer x:Name="Timer1" Interval="1000" Enabled="True" Tick="Timer1_Tick"/>
'     (the element is invisible and takes no space in any panel - put it anywhere in the form)
'  3. Done - no App.axaml changes required.
'
'  Version-agnostic across Avalonia 11.x/12.x (uses only the stable Control API and the BCL).
' ============================================================================

' Global. is REQUIRED (fixed 2026-09-29). A VB project sets RootNamespace to the project's own name, so a
' plain `Namespace AvaloniaChrome` declares `<Project>.AvaloniaChrome`; VB then resolves the
' UNQUALIFIED name `AvaloniaChrome.ChromeWindow` to that root-relative namespace, which SHADOWS the real
' one — and every chrome type that IS declared globally (this Timer, PathPicker, GrumpyPanel, the
' generated GrumpyCommandBar) disappears with it. Measured in a generated VB project: one twin written
' without Global. fails the whole build with "BC30002: Type 'AvaloniaChrome.ChromeWindow' is not
' defined", pointing at the code-behind rather than at the file that caused it. With Global. the CLR
' namespace is exactly AvaloniaChrome (identical when RootNamespace is empty, so nothing else changes).
' ChromeWindow.vb was the other twin missing it. NEVER write a bundled VB namespace without Global.
Namespace Global.AvaloniaChrome

    ''' <summary>
    ''' A form component that calls <see cref="Tick"/> every <see cref="Interval"/> milliseconds on a
    ''' WORKER thread (see the file header). It is invisible and takes no space, so it can be placed
    ''' anywhere in a form; it stops itself when the form that owns it is closed.
    ''' </summary>
    Public Class Timer
        Inherits Avalonia.Controls.Control

        ''' <summary>Marker the designer's bundled-component refresh looks for (keeps old copies current).</summary>
        Public Const BundledMarker As String = "Timer"

        ''' <summary>
        ''' Set by the designer's PREVIEW HOST: a form being previewed must not start timers - the host
        ''' renders a frame per keystroke, and every one of them would otherwise leave a worker timer
        ''' running inside the previewer process. Real apps never set this.
        ''' </summary>
        Public Shared Property StartSuppressed As Boolean = False

        Private _timer As System.Timers.Timer
        Private _interval As Double = 100
        Private _enabled As Boolean

        Public Sub New()
            ' A component, not a visual: nothing to draw, nothing to hit, never focused. (It stays in
            ' the visual tree, which is how it knows when the form goes away.)
            IsVisible = False
            IsHitTestVisible = False
            Focusable = False
        End Sub

        ''' <summary>Milliseconds between ticks - the same unit and default as the WinForms Timer (100).
        ''' Changing it while the timer runs restarts the interval with the new value.</summary>
        Public Property Interval As Double
            Get
                Return _interval
            End Get
            Set(value As Double)
                Dim ms As Double = If(Double.IsNaN(value), 100, Math.Max(1, value))
                If Math.Abs(_interval - ms) < 0.001 Then Return
                _interval = ms
                If _timer IsNot Nothing Then _timer.Interval = ms   ' takes effect on the next tick
                If _enabled Then Restart()
            End Set
        End Property

        ''' <summary>True while the timer is running. Setting it True starts the timer (even before the
        ''' form is shown); setting it False stops it. The XAML attribute Enabled="True" is therefore
        ''' all a form needs for a timer that runs.</summary>
        Public Property Enabled As Boolean
            Get
                Return _enabled
            End Get
            Set(value As Boolean)
                If _enabled = value Then Return
                If value Then Start() Else [Stop]()
            End Set
        End Property

        ''' <summary>Raised on a WORKER thread every Interval milliseconds while enabled.
        ''' Marshal control updates with Avalonia.Threading.Dispatcher.UIThread.Post(...).</summary>
        Public Event Tick As EventHandler

        ''' <summary>Starts the timer (equivalent to Enabled = True). Safe to call repeatedly.</summary>
        Public Sub Start()
            _enabled = True
            If StartSuppressed Then Return                       ' the preview host never runs timers
            If _timer Is Nothing Then
                _timer = New System.Timers.Timer With {.AutoReset = True, .Interval = _interval}
                AddHandler _timer.Elapsed, AddressOf OnTick
            End If
            _timer.Interval = _interval
            _timer.Enabled = True
        End Sub

        ''' <summary>Stops the timer (equivalent to Enabled = False). The component can be started
        ''' again; the form's own close stops it for you.</summary>
        Public Sub [Stop]()
            _enabled = False
            If _timer IsNot Nothing Then _timer.Enabled = False
        End Sub

        Private Sub Restart()
            Dim wasEnabled As Boolean = _enabled
            _enabled = False
            If _timer IsNot Nothing Then _timer.Enabled = False
            If wasEnabled Then Start()
        End Sub

        ''' <summary>Runs on the pool thread that System.Timers.Timer uses. Nothing here touches the UI,
        ''' and a throwing handler is traced rather than allowed to kill the app.</summary>
        Private Sub OnTick(sender As Object, e As System.Timers.ElapsedEventArgs)
            Try
                RaiseEvent Tick(Me, EventArgs.Empty)
            Catch ex As Exception
                ' An unhandled exception on a pool thread terminates the process, so a mistake in a
                ' Tick handler must not escape. The trace names it; nothing else can be done here.
                System.Diagnostics.Debug.WriteLine("[AvaloniaChrome.Timer] a Tick handler threw: " & ex.ToString())
            End Try
        End Sub

        ''' <summary>The form is going away: stop the worker timer, so nothing keeps ticking (or throws)
        ''' after the window is closed.</summary>
        Protected Overrides Sub OnDetachedFromVisualTree(e As Avalonia.VisualTreeAttachmentEventArgs)
            MyBase.OnDetachedFromVisualTree(e)
            If _timer IsNot Nothing Then
                _timer.Enabled = False
                RemoveHandler _timer.Elapsed, AddressOf OnTick
                _timer.Dispose()
                _timer = Nothing
            End If
            _enabled = False
        End Sub
    End Class

End Namespace
