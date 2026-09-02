// ============================================================================
//  ChromeWindow.cs — Reusable frameless Avalonia window with a built-in
//  "LinuxHelper-style" custom titlebar (dark bar, icon, centred title,
//  min/max/close buttons) plus edge resize grips and rounded corners.
//
//  Version-agnostic: works on both Avalonia 11.x and 12.x. The frameless
//  property was renamed (SystemDecorations -> WindowDecorations); this file
//  picks whichever exists at runtime, so no #if / DefineConstants are needed.
//
//  DROP-IN USAGE
//  -------------
//  1. Copy this file into your project (or link it from a shared folder).
//  2. Change your window XAML root from  <Window ...>  to  <chrome:ChromeWindow ...>
//     and add  xmlns:chrome="using:AvaloniaChrome"  to the root element.
//  3. Optional attributes:
//       TitleBarTitle="My App"                 // centred text in the title bar
//       TitleBarIcon="/Assets/my-icon.png"     // small icon on the left (optional)
//     (The icon file must be an embedded Avalonia resource — see your .csproj.)
//  4. Done. Dragging, double-click-to-maximise, the three caption buttons and
//     edge resizing all work automatically. No App.axaml changes required.
//
//  LINKING THE SHARED MASTER COPY (as used by LinuxHelper / DataSafe)
//  -----------------------------------------------------------------
//     <Compile Include="..\..\ChromeWindow\ChromeWindow.cs" Link="ChromeWindow.cs" />
// ============================================================================

using System;
using System.Collections.Generic;
using System.Reflection;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Presenters;
using Avalonia.Data;
using Avalonia.Data.Converters;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Styling;

namespace AvaloniaChrome;

/// <summary>
/// A frameless <see cref="Window"/> with a built-in custom titlebar and
/// edge resize grips, matching the style used by the LinuxHelper/DataSafe apps.
/// </summary>
public class ChromeWindow : Window
{
    public static readonly StyledProperty<string> TitleBarTitleProperty =
        AvaloniaProperty.Register<ChromeWindow, string>(nameof(TitleBarTitle), string.Empty);

    public static readonly StyledProperty<IImage?> TitleBarIconProperty =
        AvaloniaProperty.Register<ChromeWindow, IImage?>(nameof(TitleBarIcon));

    public string TitleBarTitle
    {
        get => GetValue(TitleBarTitleProperty);
        set => SetValue(TitleBarTitleProperty, value);
    }

    public IImage? TitleBarIcon
    {
        get => GetValue(TitleBarIconProperty);
        set => SetValue(TitleBarIconProperty, value);
    }

    private const double TitleBarHeight = 44;
    private const double CornerRadiusValue = 12;
    private static readonly Color TitleBarColor = Color.Parse("#0E2138");
    private static readonly Color TitleBarBorderColor = Color.Parse("#081527");

    // Converts a null icon into "hidden", so the icon Image collapses when no icon is set.
    private static readonly FuncValueConverter<IImage?, bool> IconVisibleConverter =
        new(icon => icon is not null);

    private bool _composing;
    private Control? _bodyControl;

    public ChromeWindow()
    {
        SetFrameless();
        SetTransparentWindow();
        // Keep the frame background in sync with the current theme (dark/light).
        Loaded += (_, _) => UpdateFrameBackground();
        // A fixed-height body (e.g. the blank template's Canvas) is only known to be
        // taller than the body area once XAML has finished loading, so fix its
        // alignment at Loaded time: top-align it so any overflow goes to the bottom
        // and it never creeps up over the title bar.
        Loaded += (_, _) => FixBodyAlignment();
        ActualThemeVariantChanged += (_, _) => UpdateFrameBackground();
    }

    /// <summary>Avalonia 12 renamed SystemDecorations -> WindowDecorations; set whichever exists.</summary>
    private void SetFrameless()
    {
        var prop = typeof(Window).GetProperty("WindowDecorations")
                   ?? typeof(Window).GetProperty("SystemDecorations");
        prop?.SetValue(this, Enum.Parse(prop.PropertyType, "None"));
    }

    /// <summary>Make the window background transparent so the rounded frame can show through.</summary>
    private void SetTransparentWindow()
    {
        Background = Brushes.Transparent;
        // Avalonia 11/12 type TransparencyLevelHint as an IReadOnlyList; guard against any
        // future single-value change so this stays version-agnostic.
        var hintProp = typeof(Window).GetProperty("TransparencyLevelHint");
        if (hintProp is null) return;
        if (typeof(IReadOnlyList<WindowTransparencyLevel>).IsAssignableFrom(hintProp.PropertyType))
            hintProp.SetValue(this, new[] { WindowTransparencyLevel.Transparent });
        else
            hintProp.SetValue(this, WindowTransparencyLevel.Transparent);
    }

    private void ToggleMaximize() =>
        WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;

    // The chrome is composed as the window's Content, wrapping whatever the XAML placed
    // as the window content: title bar on top, content below, resize grips on the edges,
    // all inside a rounded frame. This uses only the default window rendering, so it works
    // identically on every Avalonia version (no Window template/theme involved).
    protected override void OnPropertyChanged(AvaloniaPropertyChangedEventArgs change)
    {
        base.OnPropertyChanged(change);

        // Intercept Content changes and wrap the user's content in the chrome.
        if (change.Property == ContentProperty && !_composing)
        {
            _composing = true;
            try
            {
                Content = BuildChrome(change.NewValue);
            }
            finally
            {
                _composing = false;
            }
        }
    }

    private Border BuildChrome(object? userContent)
    {
        var frame = new Border
        {
            CornerRadius = new CornerRadius(CornerRadiusValue),
            ClipToBounds = true,
            Background = FrameBrush(ActualThemeVariant),
        };

        // --- Title bar (dark bar with bottom border) ---
        var title = new TextBlock
        {
            Foreground = Brushes.White,
            FontSize = 15,
            FontWeight = FontWeight.SemiBold,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
        };
        title[!TextBlock.TextProperty] = this[!TitleBarTitleProperty];

        var icon = new Image
        {
            Width = 26,
            Height = 26,
            Margin = new Thickness(12, 0, 10, 0),
            HorizontalAlignment = HorizontalAlignment.Left,
            VerticalAlignment = VerticalAlignment.Center,
        };
        icon[!Image.SourceProperty] = this[!TitleBarIconProperty];
        icon[!Image.IsVisibleProperty] = new Binding
        {
            Source = this,
            Path = nameof(TitleBarIcon),
            Converter = IconVisibleConverter,
        };

        var minimize = CaptionButton("\u2013");
        var maximize = CaptionButton("\u25A1");
        var close = CaptionButton("\u2715");
        minimize.Click += (_, _) => WindowState = WindowState.Minimized;
        maximize.Click += (_, _) => ToggleMaximize();
        close.Click += (_, _) => Close();
        WireCaptionHover(minimize, isClose: false);
        WireCaptionHover(maximize, isClose: false);
        WireCaptionHover(close, isClose: true);

        var buttons = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Top,
            Children = { minimize, maximize, close },
        };

        var titleBar = new Border
        {
            Height = TitleBarHeight,
            VerticalAlignment = VerticalAlignment.Top,
            Background = new SolidColorBrush(TitleBarColor),
            BorderBrush = new SolidColorBrush(TitleBarBorderColor),
            BorderThickness = new Thickness(0, 0, 0, 1),
            Child = new Grid { Children = { title, icon, buttons } },
        };
        titleBar.PointerPressed += OnTitleBarPointerPressed;
        titleBar.DoubleTapped += (_, _) => ToggleMaximize();

        // --- Content area sits below the title bar (its own grid row) ---
        _bodyControl = userContent as Control;
        var content = new ContentPresenter
        {
            Content = userContent,
        };

        // --- Resize grips (kept on top so they receive the pointer for resizing;
        //     they span both rows so the full edges stay draggable) ---
        var grips = new Border[]
        {
            ResizeGrip(StandardCursorType.SizeNorthSouth, HorizontalAlignment.Stretch, VerticalAlignment.Top, WindowEdge.North, height: 4),
            ResizeGrip(StandardCursorType.SizeNorthSouth, HorizontalAlignment.Stretch, VerticalAlignment.Bottom, WindowEdge.South, height: 4),
            ResizeGrip(StandardCursorType.SizeWestEast, HorizontalAlignment.Left, VerticalAlignment.Stretch, WindowEdge.West, width: 4),
            ResizeGrip(StandardCursorType.SizeWestEast, HorizontalAlignment.Right, VerticalAlignment.Stretch, WindowEdge.East, width: 4),
            ResizeGrip(StandardCursorType.TopLeftCorner, HorizontalAlignment.Left, VerticalAlignment.Top, WindowEdge.NorthWest, 8, 8),
            ResizeGrip(StandardCursorType.TopRightCorner, HorizontalAlignment.Right, VerticalAlignment.Top, WindowEdge.NorthEast, 8, 8),
            ResizeGrip(StandardCursorType.BottomLeftCorner, HorizontalAlignment.Left, VerticalAlignment.Bottom, WindowEdge.SouthWest, 8, 8),
            ResizeGrip(StandardCursorType.BottomRightCorner, HorizontalAlignment.Right, VerticalAlignment.Bottom, WindowEdge.SouthEast, 8, 8),
        };
        foreach (var grip in grips) Grid.SetRowSpan(grip, 2);

        var root = new Grid
        {
            RowDefinitions =
            {
                new RowDefinition(GridLength.Auto), // title bar
                new RowDefinition(GridLength.Star), // content
            },
            Children = { titleBar, content },
        };
        Grid.SetRow(titleBar, 0);
        Grid.SetRow(content, 1);
        foreach (var grip in grips) root.Children.Add(grip);

        frame.Child = root;
        return frame;
    }

    /// <summary>
    /// Once the body's real size is known (Loaded), top-align a fixed-height body so it
    /// is cut at the bottom instead of being centred up over the title bar. Content that
    /// has no explicit height keeps its own alignment (centred forms stay centred).
    /// </summary>
    private void FixBodyAlignment()
    {
        if (_bodyControl is null) return;
        if (!double.IsNaN(_bodyControl.Height) && _bodyControl.VerticalAlignment == VerticalAlignment.Stretch)
            _bodyControl.VerticalAlignment = VerticalAlignment.Top;
    }

    private void OnTitleBarPointerPressed(object? sender, PointerPressedEventArgs e)
    {
        // Don't start a window drag when pressing the caption buttons.
        if (e.Source is Button || e.Handled)
            return;
        if (e.GetCurrentPoint(this).Properties.IsLeftButtonPressed)
            BeginMoveDrag(e);
    }

    private void UpdateFrameBackground()
    {
        if (Content is Border frame)
            frame.Background = FrameBrush(ActualThemeVariant);
    }

    // Fluent's region colours for each variant. Driven directly from the resolved theme
    // variant (not a theme-resource lookup, which is unreliable for dark mode).
    private static IBrush FrameBrush(ThemeVariant variant) =>
        new SolidColorBrush(variant == ThemeVariant.Dark ? Color.Parse("#202020") : Color.Parse("#F3F3F3"));

    private static Button CaptionButton(string content)
    {
        return new Button
        {
            Content = content,
            Background = Brushes.Transparent,
            Foreground = Brushes.White,
            BorderThickness = new Thickness(0),
            CornerRadius = new CornerRadius(0),
            Width = 42,
            Height = 44,
            VerticalAlignment = VerticalAlignment.Center,
            FontSize = 13,
        };
    }

    private static void WireCaptionHover(Button button, bool isClose)
    {
        var hoverColor = isClose ? Color.Parse("#E81123") : Color.Parse("#33FFFFFF");
        button.PointerEntered += (_, _) => button.Background = new SolidColorBrush(hoverColor);
        button.PointerExited += (_, _) => button.Background = Brushes.Transparent;
    }

    private Border ResizeGrip(StandardCursorType cursor,
        HorizontalAlignment horizontal, VerticalAlignment vertical, WindowEdge edge,
        double width = 0, double height = 0)
    {
        var grip = new Border
        {
            Background = Brushes.Transparent,
            HorizontalAlignment = horizontal,
            VerticalAlignment = vertical,
            Cursor = new Cursor(cursor),
        };
        if (width > 0) grip.Width = width;
        if (height > 0) grip.Height = height;
        grip.PointerPressed += (_, ev) => BeginResizeDrag(edge, ev);
        return grip;
    }
}
