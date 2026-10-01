' BUNDLED-COPY: 0.14.0
' ============================================================================
'  GrumpyCommandBar.vb — Reusable Avalonia command bar ("GrumpyCommandBar").
'
'  The VB twin of GrumpyCommandBar.cs (line for line, deliberately — a project
'  gets whichever one matches its language).
'
'  WHY IT EXISTS (2026-09-29). Avalonia's own CommandBar is unusable as a design
'  surface: its ControlTheme carries MinHeight="48", and in Avalonia a MINIMUM
'  outranks an explicit Height - so `Height="30"` really renders 48 px and the
'  property reads as broken. It is also a shaped control whose commands must be
'  listed under CommandBar.PrimaryCommands, which no designer can edit sensibly.
'  This bar replaces it:
'
'    - NO CONTROLTHEME ANYWHERE, so nothing floors it: the Height and Width you set
'      are the Height and Width you get.
'    - THE CHROME IS A REAL BORDER (this class inherits Border), so the usual
'      properties are the usual properties and are drawn by Avalonia itself:
'      Background, BorderBrush, BorderThickness, CornerRadius, Padding - plus
'      Foreground, the bar's TEXT colour, which child text INHERITS exactly like a
'      Window's Foreground (one value colours every item that sets none of its own).
'    - IT HOLDS REAL AVALONIA CHILDREN. A Label is a TextBlock, a Text Box is a
'      TextBox, a Button is a Button - they focus, type, check and radio natively at
'      runtime and take ordinary event handlers. There is no command list to learn.
'    - ITEMS LAY OUT IN ONE ROW, left to right: the bar's single Child is a
'      horizontal StackPanel (named "{bar}Items" by the designer) whose Spacing sets
'      the gap, and each item stretches or centres by its own VerticalAlignment - so
'      a Button fills the bar's height by default.
'
'  WHY THE EXPLICIT INNER ROW. The obvious alternative - making the bar's children
'  BE the items, via a [Content] collection property - compiles in C# but makes the
'  Vespa XAML compiler CRASH on the VB side ("Internal compiler error ... Index was
'  out of range", ResolveContentPropertyTransformer), because Border already marks
'  its single Child as content. Measured 2026-09-29 in generated projects of both
'  languages. The named inner row is the same idiom GrumpyPanel and GrumpyStatus
'  use (frame outside, named row/body inside), and it compiles everywhere.
'
'  DROP-IN USAGE
'  -------------
'  1. Copy this file into your project (or link it from a shared folder).
'  2. Use it in XAML with  xmlns:chrome="using:AvaloniaChrome":
'       <chrome:GrumpyCommandBar x:Name="GrumpyCommandBar1" DockPanel.Dock="Top"
'                                Height="36" Padding="8,0" Foreground="#E6E6E6"
'                                Background="#0E2138" BorderBrush="#3F5C82"
'                                BorderThickness="0,0,0,1" CornerRadius="0">
'         <StackPanel x:Name="GrumpyCommandBar1Items" Orientation="Horizontal" Spacing="6">
'           <TextBlock x:Name="lbl1" Text="Name:" VerticalAlignment="Center"/>
'           <TextBox x:Name="txt1" Width="140" VerticalAlignment="Center"/>
'           <Button x:Name="btn1" Content="Save" VerticalAlignment="Center"/>
'         </StackPanel>
'       </chrome:GrumpyCommandBar>
'  3. Done - no App.axaml changes required. (The designer's own Commands editor
'     writes exactly this markup; you can also type it by hand.)
'
'  Version-agnostic across Avalonia 11.x/12.x (Border + StackPanel only).
' ============================================================================

Imports System
Imports Avalonia
Imports Avalonia.Controls
Imports Avalonia.Media

' NOTE the "Global." (2026-09-29). A VB project sets RootNamespace to the project's own name, so a plain
' `Namespace AvaloniaChrome` declares `<Project>.AvaloniaChrome`, which then SHADOWS the real namespace for
' VB's unqualified lookups — one twin written without Global. fails the WHOLE project with
' "BC30002: Type 'AvaloniaChrome.ChromeWindow' is not defined", blaming the code-behind rather than the
' file that caused it (measured; Timer.vb and ChromeWindow.vb had the same defect and were fixed with this
' one). Every bundled VB twin must declare its namespace with Global. — AnchorHelper, GrumpyPanel,
' PathPicker, GrumpyCharts and GrumpySheet always have.
Namespace Global.AvaloniaChrome

    ''' <summary>
    ''' A command bar: a Border frame that holds a horizontal row of ordinary Avalonia controls
    ''' (a StackPanel named "{bar}Items" as its Child, written by the designer or by hand). It carries
    ''' no ControlTheme, so a Height or Width set on it is honoured exactly - the reason it replaces
    ''' Avalonia.Controls.CommandBar in the toolbox.
    ''' </summary>
    Public Class GrumpyCommandBar
        Inherits Border

        ''' <summary>Marker used by the designer's bundled-component refresh (keeps old copies current).</summary>
        Public Const BundledMarker As String = "GrumpyCommandBar"

        ''' <summary>
        ''' The bar's text colour. This is the INHERITING text Foreground property itself (added as an
        ''' owner), so one value here colours every child TextBlock, Button caption and TextBox that does
        ''' not set its own Foreground - which is what "the bar's text colour" means to the person setting
        ''' it. AddOwner on TextBlock's property keeps this identical on Avalonia 11 and 12.
        ''' </summary>
        Public Shared ReadOnly ForegroundProperty As StyledProperty(Of IBrush) =
            TextBlock.ForegroundProperty.AddOwner(Of GrumpyCommandBar)()

        Shared Sub New()
            ' The colour is inherited by the items, so a change has to be pushed down the tree.
            AffectsRender(Of GrumpyCommandBar)(ForegroundProperty)
        End Sub

        ''' <summary>Creates an empty bar: no chrome, no items yet.</summary>
        Public Sub New()
        End Sub

        ''' <summary>The bar's text colour; child text inherits it (see ForegroundProperty).</summary>
        Public Property Foreground As IBrush
            Get
                Return GetValue(ForegroundProperty)
            End Get
            Set(value As IBrush)
                SetValue(ForegroundProperty, value)
            End Set
        End Property
    End Class

End Namespace
