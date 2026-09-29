// BUNDLED-COPY: 0.13.3
// ============================================================================
//  Timer.cs — a NON-VISUAL Timer component for a form (the WinForms Timer idea).
//
//  Avalonia ships no Timer control: what it has is Avalonia.Threading.DispatcherTimer, a
//  non-visual class that raises Tick ON THE UI THREAD. This component is what the designer's
//  Toolbox offers, and it deliberately ticks on a WORKER THREAD instead (System.Timers.Timer),
//  so a Tick handler may do slow work — poll a port, read a file, talk to a device — without
//  freezing the window while it does. It is the same relationship WinForms' System.Timers.Timer
//  has to System.Windows.Forms.Timer.
//
//  WinForms Timer  →  this
//    Interval (ms)      Interval     (same unit and same default: 100 ms)
//    Enabled            Enabled      (true = running; the XAML attribute starts it)
//    Tick event         Tick         (raised on a WORKER THREAD — see below)
//    timer1 (tray)      <chrome:Timer x:Name="Timer1"/>   (listed in the designer's tray)
//    timer1.Start/Stop  Start() / Stop()
//
//  THREADING — READ THIS
//  ---------------------
//  Tick is raised on a thread-pool thread, NOT the UI thread. That is the point (a slow handler
//  must not freeze the window), but it also means a control may NOT be touched from the handler:
//  marshal the UI work with Dispatcher.UIThread.Post(…) (fire and forget) or InvokeAsync(…):
//
//      private void Timer1_Tick(object? sender, System.EventArgs e)
//      {
//          var reading = ReadThePort();                                  // worker thread: fine
//          Avalonia.Threading.Dispatcher.UIThread.Post(() =>            // UI thread
//              ReadingLabel.Text = reading);
//      }
//
//  A Tick handler that throws would otherwise take the whole app down (an unhandled exception on a
//  pool thread), so a throwing handler is traced instead of rethrown — see OnTick.
//
//  DROP-IN USAGE
//  -------------
//  1. Copy this file into your project (or link it from a shared folder).
//  2. Use it in XAML with  xmlns:chrome="using:AvaloniaChrome":
//       <chrome:Timer x:Name="Timer1" Interval="1000" Enabled="True" Tick="Timer1_Tick"/>
//     (the element is invisible and takes no space in any panel — put it anywhere in the form)
//  3. Done — no App.axaml changes required.
//
//  Version-agnostic across Avalonia 11.x/12.x (uses only the stable Control API and the BCL).
// ============================================================================

using System;
using System.Diagnostics;
using Avalonia.Controls;

namespace AvaloniaChrome;

/// <summary>
/// A form component that calls <see cref="Tick"/> every <see cref="Interval"/> milliseconds on a
/// WORKER thread (see the file header). It is invisible and takes no space, so it can be placed
/// anywhere in a form; it stops itself when the form that owns it is closed.
/// </summary>
public class Timer : Control
{
    /// <summary>Marker the designer's bundled-component refresh looks for (keeps old copies current).</summary>
    public const string BundledMarker = "Timer";

    /// <summary>
    /// Set by the designer's PREVIEW HOST: a form being previewed must not start timers — the host
    /// renders a frame per keystroke, and every one of them would otherwise leave a worker timer
    /// running inside the previewer process. Real apps never set this.
    /// </summary>
    public static bool StartSuppressed { get; set; }

    private System.Timers.Timer? _timer;
    private double _interval = 100;
    private bool _enabled;

    public Timer()
    {
        // A component, not a visual: nothing to draw, nothing to hit, never focused. (It stays in
        // the visual tree, which is how it knows when the form goes away.)
        IsVisible = false;
        IsHitTestVisible = false;
        Focusable = false;
    }

    /// <summary>Milliseconds between ticks — the same unit and default as the WinForms Timer (100).
    /// Changing it while the timer runs restarts the interval with the new value.</summary>
    public double Interval
    {
        get => _interval;
        set
        {
            var ms = double.IsNaN(value) ? 100 : Math.Max(1, value);
            if (Math.Abs(_interval - ms) < 0.001) return;
            _interval = ms;
            if (_timer is not null) _timer.Interval = ms;   // takes effect on the next tick
            if (_enabled) Restart();
        }
    }

    /// <summary>True while the timer is running. Setting it true starts the timer (even before the
    /// form is shown); setting it false stops it. The XAML attribute <c>Enabled="True"</c> is
    /// therefore all a form needs for a timer that runs.</summary>
    public bool Enabled
    {
        get => _enabled;
        set
        {
            if (_enabled == value) return;
            if (value) Start(); else Stop();
        }
    }

    /// <summary>Raised on a WORKER thread every <see cref="Interval"/> milliseconds while enabled.
    /// Marshal control updates with <c>Avalonia.Threading.Dispatcher.UIThread.Post(…)</c>.</summary>
    public event EventHandler? Tick;

    /// <summary>Starts the timer (equivalent to <c>Enabled = true</c>). Safe to call repeatedly.</summary>
    public void Start()
    {
        _enabled = true;
        if (StartSuppressed) return;                       // the preview host never runs timers
        if (_timer is null)
        {
            _timer = new System.Timers.Timer { AutoReset = true, Interval = _interval };
            _timer.Elapsed += OnTick;
        }
        _timer.Interval = _interval;
        _timer.Enabled = true;
    }

    /// <summary>Stops the timer (equivalent to <c>Enabled = false</c>). The component can be started
    /// again; the form's own close stops it for you.</summary>
    public void Stop()
    {
        _enabled = false;
        if (_timer is not null) _timer.Enabled = false;
    }

    private void Restart()
    {
        var wasEnabled = _enabled;
        _enabled = false;
        if (_timer is not null) _timer.Enabled = false;
        if (wasEnabled) Start();
    }

    /// <summary>Runs on the pool thread that <see cref="System.Timers.Timer"/> uses. Nothing here
    /// touches the UI, and a throwing handler is traced rather than allowed to kill the app.</summary>
    private void OnTick(object? sender, System.Timers.ElapsedEventArgs e)
    {
        try
        {
            Tick?.Invoke(this, EventArgs.Empty);
        }
        catch (Exception ex)
        {
            // An unhandled exception on a pool thread terminates the process, so a mistake in a Tick
            // handler must not escape. The trace names it; nothing else can be done from here.
            Debug.WriteLine($"[AvaloniaChrome.Timer] a Tick handler threw: {ex}");
        }
    }

    /// <summary>The form is going away: stop the worker timer, so nothing keeps ticking (or throws)
    /// after the window is closed.</summary>
    protected override void OnDetachedFromVisualTree(Avalonia.VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        if (_timer is not null)
        {
            _timer.Enabled = false;
            _timer.Elapsed -= OnTick;
            _timer.Dispose();
            _timer = null;
        }
        _enabled = false;
    }
}
