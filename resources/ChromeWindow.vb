' ============================================================================
'  ChromeWindow.vb — Reusable frameless Avalonia window with a built-in
'  "LinuxHelper-style" custom titlebar (dark bar, icon, centred title,
'  min/max/close buttons) plus edge resize grips and rounded corners.
'
'  VB.NET port of ChromeWindow.cs (same behaviour, same look).
'  Version-agnostic: works on Avalonia 11.x and 12.x (picks the frameless
'  property / TransparencyLevelHint type via reflection).
'
'  DROP-IN USAGE
'  -------------
'  1. Copy this file into your VB.NET Avalonia project — the .vbproj picks it
'     up automatically, no project edit needed.
'  2. Change your window XAML root from  <Window ...>  to  <chrome:ChromeWindow ...>
'     and add  xmlns:chrome="using:AvaloniaChrome"  to the root element.
'  3. Optional attributes:
'       TitleBarTitle="My App"                 ' centred text in the title bar
'       TitleBarIcon="/Assets/my-icon.png"     ' small icon on the left (optional)
'  4. Code-behind:  Inherits ChromeWindow  (namespace AvaloniaChrome).
'     No App.axaml changes required.
' ============================================================================

Imports System
Imports System.Collections.Generic
Imports System.Reflection
Imports Avalonia
Imports Avalonia.Controls
Imports Avalonia.Controls.Presenters
Imports Avalonia.Data
Imports Avalonia.Data.Converters
Imports Avalonia.Input
Imports Avalonia.Layout
Imports Avalonia.Media
Imports Avalonia.Styling

Namespace AvaloniaChrome

    ''' <summary>
    ''' A frameless <see cref="Window"/> with a built-in custom titlebar and
    ''' edge resize grips, matching the LinuxHelper/DataSafe style.
    ''' </summary>
    Public Class ChromeWindow
        Inherits Window

        Public Shared ReadOnly TitleBarTitleProperty As StyledProperty(Of String) =
            AvaloniaProperty.Register(Of ChromeWindow, String)(NameOf(TitleBarTitle), String.Empty)

        Public Shared ReadOnly TitleBarIconProperty As StyledProperty(Of IImage) =
            AvaloniaProperty.Register(Of ChromeWindow, IImage)(NameOf(TitleBarIcon))

        Public Property TitleBarTitle As String
            Get
                Return DirectCast(GetValue(TitleBarTitleProperty), String)
            End Get
            Set(value As String)
                SetValue(TitleBarTitleProperty, value)
            End Set
        End Property

        Public Property TitleBarIcon As IImage
            Get
                Return DirectCast(GetValue(TitleBarIconProperty), IImage)
            End Get
            Set(value As IImage)
                SetValue(TitleBarIconProperty, value)
            End Set
        End Property

        Private Const TitleBarHeight As Double = 44
        Private Const CornerRadiusValue As Double = 12
        Private Shared ReadOnly TitleBarColor As Color = Color.Parse("#0E2138")
        Private Shared ReadOnly TitleBarBorderColor As Color = Color.Parse("#081527")

        ' Converts a null icon into "hidden", so the icon Image collapses when no icon is set.
        Private Shared ReadOnly IconVisibleConverter As New FuncValueConverter(Of IImage, Boolean)(
            Function(icon) icon IsNot Nothing)

        Private _composing As Boolean
        Private _bodyControl As Control

        Public Sub New()
            SetFrameless()
            SetTransparentWindow()
            ' Keep the frame background in sync with the current theme (dark/light).
            AddHandler Loaded, Sub(s, e) UpdateFrameBackground()
            ' A fixed-height body (e.g. the blank template's Canvas) is only known to be
            ' taller than the body area once XAML has finished loading, so fix its
            ' alignment at Loaded time: top-align it so any overflow goes to the bottom
            ' and it never creeps up over the title bar.
            AddHandler Loaded, AddressOf FixBodyAlignment
            AddHandler ActualThemeVariantChanged, Sub(s, e) UpdateFrameBackground()
        End Sub

        ''' <summary>Avalonia 12 renamed SystemDecorations -> WindowDecorations; set whichever exists.</summary>
        Private Sub SetFrameless()
            Dim prop = If(GetType(Window).GetProperty("WindowDecorations"),
                          GetType(Window).GetProperty("SystemDecorations"))
            If prop IsNot Nothing Then
                prop.SetValue(Me, [Enum].Parse(prop.PropertyType, "None"))
            End If
        End Sub

        ''' <summary>Make the window background transparent so the rounded frame can show through.</summary>
        Private Sub SetTransparentWindow()
            Background = Brushes.Transparent
            ' Avalonia 11/12 type TransparencyLevelHint as an IReadOnlyList; guard against
            ' any future single-value change so this stays version-agnostic.
            Dim hintProp = GetType(Window).GetProperty("TransparencyLevelHint")
            If hintProp Is Nothing Then Return
            If GetType(IReadOnlyList(Of WindowTransparencyLevel)).IsAssignableFrom(hintProp.PropertyType) Then
                hintProp.SetValue(Me, {WindowTransparencyLevel.Transparent})
            Else
                hintProp.SetValue(Me, WindowTransparencyLevel.Transparent)
            End If
        End Sub

        Private Sub ToggleMaximize()
            WindowState = If(WindowState = WindowState.Maximized, WindowState.Normal, WindowState.Maximized)
        End Sub

        ' The chrome is composed as the window's Content, wrapping whatever the XAML placed
        ' as the window content. Uses only the default window rendering (works on every version).
        Protected Overrides Sub OnPropertyChanged(change As AvaloniaPropertyChangedEventArgs)
            MyBase.OnPropertyChanged(change)

            If change.Property Is ContentProperty AndAlso Not _composing Then
                _composing = True
                Try
                    Content = BuildChrome(change.NewValue)
                Finally
                    _composing = False
                End Try
            End If
        End Sub

        Private Function BuildChrome(userContent As Object) As Border
            Dim frame As New Border With {
                .CornerRadius = New CornerRadius(CornerRadiusValue),
                .ClipToBounds = True,
                .Background = FrameBrush(ActualThemeVariant)
            }

            ' --- Title bar (dark bar with bottom border) ---
            Dim title As New TextBlock With {
                .Foreground = Brushes.White,
                .FontSize = 15,
                .FontWeight = FontWeight.SemiBold,
                .HorizontalAlignment = HorizontalAlignment.Center,
                .VerticalAlignment = VerticalAlignment.Center
            }
            title.Bind(TextBlock.TextProperty, New Binding With {
                .Source = Me,
                .Path = NameOf(TitleBarTitle)
            })

            Dim icon As New Image With {
                .Width = 26,
                .Height = 26,
                .Margin = New Thickness(12, 0, 10, 0),
                .HorizontalAlignment = HorizontalAlignment.Left,
                .VerticalAlignment = VerticalAlignment.Center
            }
            icon.Bind(Image.SourceProperty, New Binding With {
                .Source = Me,
                .Path = NameOf(TitleBarIcon)
            })
            icon.Bind(Image.IsVisibleProperty, New Binding With {
                .Source = Me,
                .Path = NameOf(TitleBarIcon),
                .Converter = IconVisibleConverter
            })

            Dim minimize = CaptionButton("–") ' –
            Dim maximize = CaptionButton("□") ' □
            Dim close = CaptionButton("✕")    ' ✕
            AddHandler minimize.Click, Sub(s, e) WindowState = WindowState.Minimized
            AddHandler maximize.Click, Sub(s, e) ToggleMaximize()
            AddHandler close.Click, Sub(s, e) Me.Close()
            WireCaptionHover(minimize, False)
            WireCaptionHover(maximize, False)
            WireCaptionHover(close, True)

            Dim buttons As New StackPanel With {
                .Orientation = Orientation.Horizontal,
                .HorizontalAlignment = HorizontalAlignment.Right,
                .VerticalAlignment = VerticalAlignment.Top
            }
            buttons.Children.Add(minimize)
            buttons.Children.Add(maximize)
            buttons.Children.Add(close)

            Dim titleBar As New Border With {
                .Height = TitleBarHeight,
                .VerticalAlignment = VerticalAlignment.Top,
                .Background = New SolidColorBrush(TitleBarColor),
                .BorderBrush = New SolidColorBrush(TitleBarBorderColor),
                .BorderThickness = New Thickness(0, 0, 0, 1)
            }
            Dim titleGrid As New Grid()
            titleGrid.Children.Add(title)
            titleGrid.Children.Add(icon)
            titleGrid.Children.Add(buttons)
            titleBar.Child = titleGrid

            AddHandler titleBar.PointerPressed, AddressOf OnTitleBarPointerPressed
            AddHandler titleBar.DoubleTapped, Sub(s, e) ToggleMaximize()

            ' --- Content area sits below the title bar (its own grid row) ---
            _bodyControl = TryCast(userContent, Control)
            Dim content As New ContentPresenter With {
                .Content = userContent
            }

            ' --- Resize grips (kept on top so they receive the pointer for resizing;
            '     they span both rows so the full edges stay draggable) ---
            Dim grips() As Border = {
                ResizeGrip(StandardCursorType.SizeNorthSouth, HorizontalAlignment.Stretch, VerticalAlignment.Top, WindowEdge.North, height:=4),
                ResizeGrip(StandardCursorType.SizeNorthSouth, HorizontalAlignment.Stretch, VerticalAlignment.Bottom, WindowEdge.South, height:=4),
                ResizeGrip(StandardCursorType.SizeWestEast, HorizontalAlignment.Left, VerticalAlignment.Stretch, WindowEdge.West, width:=4),
                ResizeGrip(StandardCursorType.SizeWestEast, HorizontalAlignment.Right, VerticalAlignment.Stretch, WindowEdge.East, width:=4),
                ResizeGrip(StandardCursorType.TopLeftCorner, HorizontalAlignment.Left, VerticalAlignment.Top, WindowEdge.NorthWest, 8, 8),
                ResizeGrip(StandardCursorType.TopRightCorner, HorizontalAlignment.Right, VerticalAlignment.Top, WindowEdge.NorthEast, 8, 8),
                ResizeGrip(StandardCursorType.BottomLeftCorner, HorizontalAlignment.Left, VerticalAlignment.Bottom, WindowEdge.SouthWest, 8, 8),
                ResizeGrip(StandardCursorType.BottomRightCorner, HorizontalAlignment.Right, VerticalAlignment.Bottom, WindowEdge.SouthEast, 8, 8)
            }
            For Each grip As Border In grips
                Grid.SetRowSpan(grip, 2)
            Next

            Dim root As New Grid()
            root.RowDefinitions.Add(New RowDefinition(GridLength.Auto)) ' title bar
            root.RowDefinitions.Add(New RowDefinition(GridLength.Star)) ' content
            Grid.SetRow(titleBar, 0)
            Grid.SetRow(content, 1)
            root.Children.Add(titleBar)
            root.Children.Add(content)
            For Each grip As Border In grips
                root.Children.Add(grip)
            Next

            frame.Child = root
            Return frame
        End Function

        ''' <summary>
        ''' Once the body's real size is known (Loaded), top-align a fixed-height body so it
        ''' is cut at the bottom instead of being centred up over the title bar. Content that
        ''' has no explicit height keeps its own alignment (centred forms stay centred).
        ''' </summary>
        Private Sub FixBodyAlignment()
            If _bodyControl Is Nothing Then Return
            If Double.IsNaN(_bodyControl.Height) = False AndAlso _bodyControl.VerticalAlignment = VerticalAlignment.Stretch Then
                _bodyControl.VerticalAlignment = VerticalAlignment.Top
            End If
        End Sub

        Private Sub OnTitleBarPointerPressed(sender As Object, e As PointerPressedEventArgs)
            ' Don't start a window drag when pressing the caption buttons.
            If (TypeOf e.Source Is Button) OrElse e.Handled Then Return
            If e.GetCurrentPoint(Me).Properties.IsLeftButtonPressed Then
                BeginMoveDrag(e)
            End If
        End Sub

        Private Shared Function CaptionButton(content As String) As Button
            Return New Button With {
                .Content = content,
                .Background = Brushes.Transparent,
                .Foreground = Brushes.White,
                .BorderThickness = New Thickness(0),
                .CornerRadius = New CornerRadius(0),
                .Width = 42,
                .Height = 44,
                .VerticalAlignment = VerticalAlignment.Center,
                .FontSize = 13
            }
        End Function

        Private Shared Sub WireCaptionHover(button As Button, isClose As Boolean)
            Dim hoverColor = If(isClose, Color.Parse("#E81123"), Color.Parse("#33FFFFFF"))
            AddHandler button.PointerEntered, Sub(s, e) button.Background = New SolidColorBrush(hoverColor)
            AddHandler button.PointerExited, Sub(s, e) button.Background = Brushes.Transparent
        End Sub

        Private Function ResizeGrip(cursor As StandardCursorType,
                                    horizontal As HorizontalAlignment,
                                    vertical As VerticalAlignment,
                                    edge As WindowEdge,
                                    Optional width As Double = 0,
                                    Optional height As Double = 0) As Border
            Dim grip As New Border With {
                .Background = Brushes.Transparent,
                .HorizontalAlignment = horizontal,
                .VerticalAlignment = vertical,
                .Cursor = New Cursor(cursor)
            }
            If width > 0 Then grip.Width = width
            If height > 0 Then grip.Height = height
            AddHandler grip.PointerPressed, Sub(s, e) BeginResizeDrag(edge, e)
            Return grip
        End Function

        Private Sub UpdateFrameBackground()
            If TypeOf Content Is Border Then
                DirectCast(Content, Border).Background = FrameBrush(ActualThemeVariant)
            End If
        End Sub

        ' Fluent's region colours for each variant (no theme-resource lookup needed).
        Private Shared Function FrameBrush(themeVariant As ThemeVariant) As IBrush
            If themeVariant Is ThemeVariant.Dark Then
                Return New SolidColorBrush(Color.Parse("#202020"))
            Else
                Return New SolidColorBrush(Color.Parse("#F3F3F3"))
            End If
        End Function

    End Class
End Namespace
