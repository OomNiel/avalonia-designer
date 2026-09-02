Imports System
Imports System.Runtime.CompilerServices
Imports Avalonia
Imports Avalonia.Controls
Imports Avalonia.Interactivity
Imports Avalonia.VisualTree

' NOTE: `Global.` is required — VB prepends RootNamespace to a plain
' `Namespace AvaloniaChrome`, so the compiled type would be
' <RootNamespace>.AvaloniaChrome.AnchorHelper and the XAML compiler could not
' resolve it as an attached-property owner from "using:AvaloniaChrome".
' (ChromeWindow.vb works as a plain namespace because element types are resolved
' with a root-namespace-aware lookup, but attached-property owners are not.)
Namespace Global.AvaloniaChrome

    ''' <summary>
    ''' WinForms-style anchoring for controls placed on a free-placement Canvas.
    ''' Usage (via the Avalonia Designer's Anchor property, or by hand):
    '''   &lt;Button Canvas.Left="40" Canvas.Top="20" chrome:AnchorHelper.Anchor="Left,Bottom"/&gt;
    ''' The control keeps a fixed distance from the anchored edges of its container as the
    ''' container resizes: one edge = the control moves with that edge; two OPPOSITE edges
    ''' (Left+Right or Top+Bottom) = the control stretches between them.
    ''' "None" (or an empty value) disables anchoring. Only direct children of a Panel (a
    ''' Canvas) are tracked; inside flow panels (StackPanel/Grid/DockPanel) it is inert.
    ''' </summary>
    Public NotInheritable Class AnchorHelper

        ''' <summary>Attached property value: comma-separated edges, e.g. "Left,Bottom".</summary>
        Public Shared ReadOnly AnchorProperty As AttachedProperty(Of String) =
            AvaloniaProperty.RegisterAttached(Of AnchorHelper, Control, String)("Anchor", "None")

        Shared Sub New()
            AnchorProperty.Changed.AddClassHandler(Of Control)(AddressOf OnAnchorChanged)
        End Sub

        Private Sub New()
        End Sub

        Public Shared Function GetAnchor(c As Control) As String
            Return c.GetValue(AnchorProperty)
        End Function

        Public Shared Sub SetAnchor(c As Control, value As String)
            c.SetValue(AnchorProperty, value)
        End Sub

        Private Shared Sub OnAnchorChanged(c As Control, e As AvaloniaPropertyChangedEventArgs)
            Dim anchor = GetAnchor(c)
            If anchor IsNot Nothing AndAlso anchor.Length > 0 AndAlso Not String.Equals(anchor, "None", StringComparison.OrdinalIgnoreCase) Then
                AnchorTracker.GetTracker(c).Attach(c)
            Else
                AnchorTracker.GetTracker(c).Detach()
            End If
        End Sub

    End Class

    Friend NotInheritable Class AnchorTracker

        Private Shared ReadOnly Trackers As New ConditionalWeakTable(Of Control, AnchorTracker)()

        Private _c As Control
        Private _parent As Panel
        Private _left As Boolean
        Private _right As Boolean
        Private _top As Boolean
        Private _bottom As Boolean
        Private _mL As Double
        Private _mT As Double
        Private _mR As Double
        Private _mB As Double

        Public Shared Function GetTracker(c As Control) As AnchorTracker
            Return Trackers.GetValue(c, Function(k) New AnchorTracker())
        End Function

        Public Sub Attach(c As Control)
            Detach()
            _c = c
            If c.IsLoaded Then
                OnLoaded(c, New RoutedEventArgs())
            Else
                AddHandler c.Loaded, AddressOf OnLoaded
            End If
        End Sub

        Public Sub Detach()
            If _c IsNot Nothing Then
                RemoveHandler _c.Loaded, AddressOf OnLoaded
                _c = Nothing
            End If
            If _parent IsNot Nothing Then
                RemoveHandler _parent.SizeChanged, AddressOf OnParentSizeChanged
                _parent = Nothing
            End If
        End Sub

        Private Sub OnLoaded(sender As Object, e As RoutedEventArgs)
            If _c Is Nothing Then Return
            RemoveHandler _c.Loaded, AddressOf OnLoaded
            Dim parent = TryCast(_c.GetVisualParent(), Panel)
            If parent Is Nothing Then Return
            _parent = parent
            Parse(AnchorHelper.GetAnchor(_c))
            Capture(_c, parent.Bounds.Width, parent.Bounds.Height)
            Apply(_c, parent.Bounds.Width, parent.Bounds.Height)
            AddHandler parent.SizeChanged, AddressOf OnParentSizeChanged
        End Sub

        Private Sub Parse(anchor As String)
            _left = anchor.IndexOf("Left", StringComparison.OrdinalIgnoreCase) >= 0
            _right = anchor.IndexOf("Right", StringComparison.OrdinalIgnoreCase) >= 0
            _top = anchor.IndexOf("Top", StringComparison.OrdinalIgnoreCase) >= 0
            _bottom = anchor.IndexOf("Bottom", StringComparison.OrdinalIgnoreCase) >= 0
        End Sub

        Private Sub Capture(c As Control, w As Double, h As Double)
            _mL = Canvas.GetLeft(c)
            _mT = Canvas.GetTop(c)
            _mR = w - (Canvas.GetLeft(c) + c.Bounds.Width)
            _mB = h - (Canvas.GetTop(c) + c.Bounds.Height)
        End Sub

        Private Sub OnParentSizeChanged(sender As Object, e As SizeChangedEventArgs)
            If _c IsNot Nothing Then Apply(_c, e.NewSize.Width, e.NewSize.Height)
        End Sub

        Private Sub Apply(c As Control, w As Double, h As Double)
            Dim x = Canvas.GetLeft(c)
            Dim y = Canvas.GetTop(c)
            Dim cw = c.Bounds.Width
            Dim ch = c.Bounds.Height
            If _left Then x = _mL
            If _right Then
                Dim right = w - _mR
                If _left Then
                    x = _mL
                    cw = Math.Max(0, right - _mL)
                Else
                    x = right - cw
                End If
            End If
            If _top Then y = _mT
            If _bottom Then
                Dim bottom = h - _mB
                If _top Then
                    y = _mT
                    ch = Math.Max(0, bottom - _mT)
                Else
                    y = bottom - ch
                End If
            End If
            Canvas.SetLeft(c, x)
            Canvas.SetTop(c, y)
            If _left AndAlso _right Then c.Width = cw
            If _top AndAlso _bottom Then c.Height = ch
        End Sub

    End Class

End Namespace
