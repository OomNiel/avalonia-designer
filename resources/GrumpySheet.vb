' BUNDLED-COPY: 0.12.13
' GrumpySheet.vb — BUNDLED RESOURCE (the C# twin is resources/GrumpySheet.cs). Copied into every
' generated project, next to ChromeWindow.vb / PathPicker.vb / GrumpyPanel.vb / GrumpyCharts.vb.
'
' A small, dependency-free SPREADSHEET CONTROL that draws itself: no NuGet package, no template and
' no assets. 26 columns (A…Z) and 50 rows (1…50) by default, both settable, with a lettered header
' row and a numbered header column that stay frozen while the cells scroll. It lives in the
' namespace `AvaloniaSpreadsheet`, so a form declares
'
'     xmlns:spread="using:AvaloniaSpreadsheet"
'
'   <spread:GrumpySheet x:Name="Sheet1" Width="620" Height="380">
'     <spread:SheetCell Row="1" Column="1" Text="Item"/>
'     <spread:SheetCell Row="1" Column="2" Text="Qty"/>
'     <spread:SheetCell Row="2" Column="1" Text="Widget"/>
'     <spread:SheetCell Row="2" Column="2" Text="3"/>
'   </spread:GrumpySheet>
'
' CELLS
' -----
'   A cell is a direct child element with Row and Column, BOTH 1-BASED, so Row="1" Column="1" is A1
'   and Row="7" Column="28" is AB7. Only NON-EMPTY cells are worth writing — an empty sheet is an
'   empty element. Row 0, a negative, or anything past Rows/Columns is ignored rather than throwing,
'   so a form cannot be broken by a number typed into it.
'
' WHAT IT DOES
' ------------
'   * Select: click a cell; drag to select a RANGE; click a letter or a number in the header to select
'     that whole column or row (Shift extends); the corner above the row numbers selects everything;
'     Ctrl+A does the same from the keyboard.
'   * Enter data: just type (the cell opens and replaces its contents), or double-click / F2 to edit
'     what is already there. Enter or Tab commits and moves on, Esc abandons the edit.
'   * Keyboard: arrows move, Shift+arrows extend the selection, PageUp/PageDown jump ten rows, Home
'     goes to column A, Ctrl+Home to A1, Enter moves down, Tab moves right, Delete clears the
'     selected cells.
'   * AUTOFILL: the small square at the bottom-right of the selection is the fill handle. Drag it down
'     or right and the pattern is PREDICTED — 1, 2 becomes 3, 4, 5 …; 2, 4 becomes 6, 8 …; a single
'     number counts up by one; "Item1, Item2" becomes "Item3"; anything else repeats the pattern it
'     was given, which is how a repeating list is copied.
'   * The formula bar shows the active cell's address (A1) and its contents, and edits them too: press
'     Ctrl+U or click the address box to move the caret there.
'   * The wheel scrolls; Shift+wheel scrolls sideways. The headers never leave the top and the left.
'
' FOR YOUR OWN CODE
' -----------------
'   SetCell(row, column, text) and GetCell(row, column) work in ROW and COLUMN, both 1-based.
'   ClearRange(firstRow, firstColumn, lastRow, lastColumn) and ClearSelection() empty a block, and
'   ActiveCellName is "B7". CellChanged fires for every committed change — typed, filled or set from
'   code — so a form can react to what the user did:
'
'     Private Sub OnSheetChanged(sender As Object, e As SheetCellChangedEventArgs)
'         TotalText.Text = "B2 is now " & e.Text
'     End Sub
'
'   AllowEditing = False makes the sheet read-only while keeping the headers and the selection, which
'   is what a results-only form wants.
'
' NOTES
' -----
'   * It draws itself in Render() and hosts NO child controls at all — not even the editor, which is
'     drawn in the cell — so a 50 x 26 sheet is one control to the layout engine, not 1 300, and it
'     renders identically in a headless preview where nothing can be focused.
'   * Everything is proportional to ColumnWidth / RowHeight / FontSize, so the sheet survives any
'     resize, and the grid is clipped to its own rectangle while the headers stay put.
'   * FORMULAS ARE NOT EVALUATED YET. A cell holding "=SUM(B2:B6)" keeps and shows that text, and the
'     fx bar is the place to edit it; evaluation is the next phase and does not change this format.
Imports System
Imports System.Collections.Generic
Imports System.Collections.Specialized
Imports System.Globalization
Imports Avalonia
Imports Avalonia.Collections
Imports Avalonia.Controls
Imports Avalonia.Input
Imports Avalonia.Media
Imports Avalonia.Metadata

' Global. IS NOT DECORATION. VB prepends the project's RootNamespace to every namespace a
' source file declares, so `Namespace AvaloniaSpreadsheet` inside a project whose RootNamespace
' is `MyApp` really declares `MyApp.AvaloniaSpreadsheet` — and the form's
' xmlns:spread="using:AvaloniaSpreadsheet" then fails to build with
' "AVLN2000: Unable to resolve type GrumpySheet from namespace using:AvaloniaSpreadsheet",
' because a XAML `using:` is an ABSOLUTE CLR namespace. `Global.` opts out of the prefix,
' which is why every bundled VB file except the older ChromeWindow.vb writes it.
Namespace Global.AvaloniaSpreadsheet

    ''' <summary>How a cell's text is lined up in its column. Auto follows the content: numbers to
    ''' the right, everything else to the left, which is what a spreadsheet does. (Called Auto rather
    ''' than Default because `Default` is a VB keyword — the C# twin could have used it, and a twin whose
    ''' members have different names is not a twin.)</summary>
    Public Enum SheetAlign
        Auto
        Left
        Center
        Right
    End Enum

    ''' <summary>
    ''' One cell of a <see cref="GrumpySheet"/>: where it is, what it holds, and how it is FORMATTED.
    ''' Cells are written as direct children of the sheet, in the order they should be read — order does
    ''' not matter for cells that do not overlap, because a later cell with the same address replaces an
    ''' earlier one. Every formatting property has an "unset" value (false, 0, null, Default) that means
    ''' "whatever the sheet is set to", so a cell that was never styled stays a short element.
    ''' </summary>
    Public NotInheritable Class SheetCell

        ''' <summary>The row, 1-based: Row = 1 is the first row. 0 or less is read as 1.</summary>
        Public Property Row As Integer = 1

        ''' <summary>The column, 1-based: Column = 1 is column A. 0 or less is read as 1.</summary>
        Public Property Column As Integer = 1

        ''' <summary>The cell's contents. Null or empty means the cell is blank, so it need not be
        ''' written at all — unless it carries formatting, which a blank cell may (a highlighted box
        ''' with nothing in it is a real thing to want).</summary>
        Public Property Text As String

        ''' <summary>Draw this cell's text in bold.</summary>
        Public Property Bold As Boolean

        ''' <summary>Draw this cell's text in italics.</summary>
        Public Property Italic As Boolean

        ''' <summary>The cell's font size. 0 (the default) means the sheet's own FontSize.</summary>
        Public Property FontSize As Double

        ''' <summary>The cell's font family name. Empty means the sheet's own FontFamilyName.</summary>
        Public Property FontFamily As String

        ''' <summary>The cell's text colour. Null means the sheet's own TextColor.</summary>
        Public Property TextColor As Nullable(Of Color)

        ''' <summary>The cell's own backcolour — its highlight. Null means the sheet's CellBackColor
        ''' (the paper). It is drawn under the grid lines and under the selection wash, so a highlighted
        ''' cell still reads as selected when it is.</summary>
        Public Property Fill As Nullable(Of Color)

        ''' <summary>How the text is lined up. Auto = by content (numbers right, text left).</summary>
        Public Property TextAlign As SheetAlign = SheetAlign.Auto

    End Class

    ''' <summary>What changed, and what it is now — raised once per committed cell change.</summary>
    Public NotInheritable Class SheetCellChangedEventArgs
        Inherits EventArgs

        ''' <summary>Creates the event data for one changed cell.</summary>
        Public Sub New(row As Integer, column As Integer, text As String)
            Me.Row = row
            Me.Column = column
            Me.Text = If(text, String.Empty)
        End Sub

        ''' <summary>The row that changed, 1-based.</summary>
        Public ReadOnly Property Row As Integer

        ''' <summary>The column that changed, 1-based.</summary>
        Public ReadOnly Property Column As Integer

        ''' <summary>The cell's contents after the change (empty for a cleared cell).</summary>
        Public ReadOnly Property Text As String

        ''' <summary>The cell's address, e.g. "B7".</summary>
        Public ReadOnly Property Name As String
            Get
                Return GrumpySheet.CellName(Row, Column)
            End Get
        End Property

    End Class

    ''' <summary>A column or a row that was given its own size (a dragged border, or the API).</summary>
    Public NotInheritable Class SheetSizeChangedEventArgs
        Inherits EventArgs

        ''' <summary>Creates the event data for one resized column or row.</summary>
        Public Sub New(column As Integer, row As Integer, size As Double)
            Me.Column = column
            Me.Row = row
            Me.Size = size
        End Sub

        ''' <summary>The column that was resized, 1-based — 0 when a ROW was resized instead.</summary>
        Public ReadOnly Property Column As Integer

        ''' <summary>The row that was resized, 1-based — 0 when a COLUMN was resized instead.</summary>
        Public ReadOnly Property Row As Integer

        ''' <summary>The track's new size in pixels.</summary>
        Public ReadOnly Property Size As Double

        ''' <summary>True when this was a column.</summary>
        Public ReadOnly Property IsColumn As Boolean
            Get
                Return Column > 0
            End Get
        End Property

    End Class

    ''' <summary>
    ''' A spreadsheet grid: selectable cells, in-place editing, autofill and a formula bar, drawn by
    ''' the control itself. See the file header for the XAML and the whole feature list.
    ''' </summary>
    Public Class GrumpySheet
        Inherits Control

        ''' <summary>How many rows the sheet has (1…50 by default).</summary>
        Public Shared ReadOnly RowsProperty As StyledProperty(Of Integer) =
            AvaloniaProperty.Register(Of GrumpySheet, Integer)(NameOf(Rows), 50)

        ''' <summary>How many columns the sheet has (1…26 → A…Z by default).</summary>
        Public Shared ReadOnly ColumnsProperty As StyledProperty(Of Integer) =
            AvaloniaProperty.Register(Of GrumpySheet, Integer)(NameOf(Columns), 26)

        ''' <summary>The width of one column, in pixels.</summary>
        Public Shared ReadOnly ColumnWidthProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpySheet, Double)(NameOf(ColumnWidth), 72.0)

        ''' <summary>The height of one row, in pixels.</summary>
        Public Shared ReadOnly RowHeightProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpySheet, Double)(NameOf(RowHeight), 22.0)

        ''' <summary>The width of the column of row numbers, in pixels.</summary>
        Public Shared ReadOnly HeaderWidthProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpySheet, Double)(NameOf(HeaderWidth), 44.0)

        ''' <summary>The height of the row of column letters, in pixels.</summary>
        Public Shared ReadOnly HeaderHeightProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpySheet, Double)(NameOf(HeaderHeight), 24.0)

        ''' <summary>Draw the lettered header row and the numbered header column.</summary>
        Public Shared ReadOnly ShowHeadersProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of GrumpySheet, Boolean)(NameOf(ShowHeaders), True)

        ''' <summary>Draw the formula bar (the cell address and the fx box) above the grid.</summary>
        Public Shared ReadOnly ShowFormulaBarProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of GrumpySheet, Boolean)(NameOf(ShowFormulaBar), True)

        ''' <summary>Draw slim scrollbars when the sheet is bigger than the space it has. They appear by
        ''' themselves when there is something to scroll to, which is the only cue that the columns off to
        ''' the right are reachable at all.</summary>
        Public Shared ReadOnly ShowScrollBarsProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of GrumpySheet, Boolean)(NameOf(ShowScrollBars), True)

        ''' <summary>False makes the sheet read-only: selection still works, editing does not.</summary>
        Public Shared ReadOnly AllowEditingProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of GrumpySheet, Boolean)(NameOf(AllowEditing), True)

        ''' <summary>The font family name for the cells. Empty = the platform's default.</summary>
        Public Shared ReadOnly FontFamilyNameProperty As StyledProperty(Of String) =
            AvaloniaProperty.Register(Of GrumpySheet, String)(NameOf(FontFamilyName), String.Empty)

        ''' <summary>The font size of the cells and the headers, in points.</summary>
        Public Shared ReadOnly FontSizeProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpySheet, Double)(NameOf(FontSize), 12.0)

        ''' <summary>The colour of the cell grid lines.</summary>
        Public Shared ReadOnly GridColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of GrumpySheet, Color)(NameOf(GridColor), Color.Parse("#C9CED6"))

        ''' <summary>The backcolour of the header row and column, and of the corner.</summary>
        Public Shared ReadOnly HeaderBackColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of GrumpySheet, Color)(NameOf(HeaderBackColor), Color.Parse("#EFF1F4"))

        ''' <summary>The colour of the letters and numbers in the headers.</summary>
        Public Shared ReadOnly HeaderTextColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of GrumpySheet, Color)(NameOf(HeaderTextColor), Color.Parse("#39404A"))

        ''' <summary>The backcolour of the cells (the paper the grid is drawn on).</summary>
        Public Shared ReadOnly CellBackColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of GrumpySheet, Color)(NameOf(CellBackColor), Color.Parse("#FFFFFF"))

        ''' <summary>The colour of the cell text.</summary>
        Public Shared ReadOnly TextColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of GrumpySheet, Color)(NameOf(TextColor), Color.Parse("#1E2228"))

        ''' <summary>The colour of the selection outline, the active cell and the fill handle.</summary>
        Public Shared ReadOnly SelectionColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of GrumpySheet, Color)(NameOf(SelectionColor), Color.Parse("#2D7DD2"))

        ''' <summary>The colour the selected cells are washed with (drawn UNDER the grid lines, so the
        ''' lines stay visible through it).</summary>
        Public Shared ReadOnly SelectionFillColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of GrumpySheet, Color)(NameOf(SelectionFillColor), Color.Parse("#DCE9FA"))

        ''' <summary>The height of the formula bar strip, in pixels (fixed).</summary>
        Private Const BarHeight As Double = 24.0

        ''' <summary>The size of the autofill square, in pixels.</summary>
        Private Const HandleSize As Double = 7.0

        ''' <summary>The narrowest a column or a row can be dragged to. Any less and its border cannot be
        ''' grabbed again — a mis-drag there would be one you cannot drag back.</summary>
        Private Const MinTrackSize As Double = 16.0

        ''' <summary>How near a header border the pointer has to be to resize it. Three pixels is what a
        ''' desktop toolkit uses; below two, hitting a border becomes a precision exercise.</summary>
        Private Const ResizeGrip As Double = 3.0

        ''' <summary>The thickness of a scrollbar, in pixels. Slim, and drawn OVER the grid rather than
        ''' taking room from it: a sheet whose grid shifted every time the bars appeared would be worse
        ''' than one whose last column is partly covered by a bar.</summary>
        Private Const ScrollBarSize As Double = 12.0

        ''' <summary>The shortest a scrollbar's thumb may get, so a very long sheet still leaves something
        ''' to grab.</summary>
        Private Const MinThumbSize As Double = 24.0

        Private ReadOnly _lookup As New List(Of SheetCell)()

        ' What is selected. The ANCHOR is where the selection started (the cell Shift extends from) and
        ' the ACTIVE cell is the one that scrolls into view and takes the typing.
        Private _anchorRow As Integer = 1
        Private _anchorColumn As Integer = 1
        Private _activeRow As Integer = 1
        Private _activeColumn As Integer = 1

        ' Whole columns / whole rows / everything: the three selections that are not a plain block.
        Private _wholeColumns As Boolean
        Private _wholeRows As Boolean
        Private _selectAll As Boolean

        Private _draggingSelection As Boolean
        Private _draggingFill As Boolean
        Private _fillRow As Integer
        Private _fillColumn As Integer
        Private _fillSourceFirstRow As Integer = 1
        Private _fillSourceFirstColumn As Integer = 1
        Private _fillSourceLastRow As Integer = 1
        Private _fillSourceLastColumn As Integer = 1

        ' The editor: no TextBox is involved, so this is the whole of its state.
        Private _editing As Boolean
        Private _barFocused As Boolean
        Private _editText As String = String.Empty
        Private _caret As Integer
        Private _editIsNew As Boolean

        Private _scrollX As Double
        Private _scrollY As Double

        ' ---- per-column widths and per-row heights -----------------------------------------------
        ' Sparse on purpose: the sheet's ColumnWidth/RowHeight answer for every column and row, and these
        ' dictionaries answer only for the ones a border was dragged on. The offset tables are their
        ' prefix sums, rebuilt on demand — without them every part of the geometry would have to assume
        ' all the columns are the same width, which is what it did until 2026-09-26.
        Private ReadOnly _columnWidths As New Dictionary(Of Integer, Double)()
        Private ReadOnly _rowHeights As New Dictionary(Of Integer, Double)()
        Private _columnOffsets As Double()
        Private _rowOffsets As Double()

        ' Dragging a border. Only one track is ever being resized, so a pair of fields per axis is enough
        ' and 0 means "not resizing".
        Private _resizeColumn As Integer
        Private _resizeRow As Integer
        Private _resizeStartSize As Double
        Private _resizeStartX As Double
        Private _resizeStartY As Double

        ' Whether the pointer is being shown the resize cursor, so it is only set when it changes.
        Private _cursor As StandardCursorType = StandardCursorType.Arrow

        ' Dragging a scrollbar's thumb, and where inside it the drag started (so the thumb does not jump
        ' under the pointer on the first move).
        Private _scrollDragging As Boolean
        Private _scrollDragVertical As Boolean
        Private _scrollDragStart As Double
        Private _scrollDragStartOffset As Double

        ' The right-click menu. It is DRAWN by the control itself — see the menu section far below for why it
        ' is not an Avalonia ContextMenu.
        Private _menuItems As New List(Of SheetMenuItem)()
        Private _menuOpen As Boolean
        Private _menuX As Double
        Private _menuY As Double
        Private _menuHot As Integer = -1

        Shared Sub New()
            AffectsRender(Of GrumpySheet)(RowsProperty, ColumnsProperty, ColumnWidthProperty, RowHeightProperty,
                HeaderWidthProperty, HeaderHeightProperty, ShowHeadersProperty, ShowFormulaBarProperty,
                ShowScrollBarsProperty,
                FontFamilyNameProperty, FontSizeProperty, GridColorProperty, HeaderBackColorProperty,
                HeaderTextColorProperty, CellBackColorProperty, TextColorProperty, SelectionColorProperty,
                SelectionFillColorProperty)
            AffectsMeasure(Of GrumpySheet)(RowsProperty, ColumnsProperty, ColumnWidthProperty, RowHeightProperty,
                HeaderWidthProperty, HeaderHeightProperty, ShowHeadersProperty, ShowFormulaBarProperty)
        End Sub

        ''' <summary>Creates an empty sheet. Fill <see cref="Cells"/> in XAML, or call SetCell.</summary>
        Public Sub New()
            Focusable = True
            ClipToBounds = True
            AddHandler Cells.CollectionChanged, AddressOf OnCellsChanged
            AddHandler LostFocus, AddressOf OnSheetLostFocus
        End Sub

        ''' <summary>
        ''' Takes the keyboard when the form appears, so the arrow keys work without a click first.
        '''
        ''' The work happens on LOADED, not on attach: while the tree is being attached there is no TopLevel
        ''' yet, so GetTopLevel returns Nothing and asking the FocusManager anything silently does nothing.
        ''' Deliberately conditional: a form that puts the caret in a TextBox on startup keeps it.
        ''' </summary>
        Protected Overrides Sub OnAttachedToVisualTree(e As VisualTreeAttachmentEventArgs)
            MyBase.OnAttachedToVisualTree(e)
            AddHandler Loaded, AddressOf OnSheetLoaded
        End Sub

        Private Sub OnSheetLoaded(sender As Object, e As Avalonia.Interactivity.RoutedEventArgs)
            RemoveHandler Loaded, AddressOf OnSheetLoaded
            ' The focus request has to wait for the load to FINISH: asking inside the Loaded handler itself
            ' is too early and is simply refused (the window is active, the FocusManager is empty, and
            ' IsFocused stays False). One step through the dispatcher is what makes the arrows work the
            ' moment the form appears instead of only after the first click.
            Avalonia.Threading.Dispatcher.UIThread.Post(AddressOf TryTakeFocus,
                Avalonia.Threading.DispatcherPriority.Background)
        End Sub

        Private Sub TryTakeFocus()
            Dim top As TopLevel = TopLevel.GetTopLevel(Me)
            If top Is Nothing Then
                Return
            End If

            Dim manager As IFocusManager = top.FocusManager
            If manager Is Nothing OrElse manager.GetFocusedElement() IsNot Nothing OrElse Not IsVisible Then
                Return
            End If

            Focus()
        End Sub

        ''' <summary>
        ''' The offset tables are prefix sums of the sizes, so anything that changes a size invalidates
        ''' them — and the scroll limits change with them, or a sheet that just got narrower stays
        ''' scrolled past its own right edge.
        ''' </summary>
        Protected Overrides Sub OnPropertyChanged(change As AvaloniaPropertyChangedEventArgs)
            MyBase.OnPropertyChanged(change)
            If change.Property Is RowsProperty OrElse change.Property Is ColumnsProperty OrElse
                change.Property Is ColumnWidthProperty OrElse change.Property Is RowHeightProperty Then
                InvalidateTrackOffsets()
                ClampScroll(Bounds.Size)
            End If
        End Sub

        Private ReadOnly _cells As New AvaloniaList(Of SheetCell)()

        ''' <summary>The cells with something in them. This is the CONTENT property, so a cell is
        ''' written as a direct child element — see the file header.</summary>
        <Content>
        Public ReadOnly Property Cells As AvaloniaList(Of SheetCell)
            Get
                Return _cells
            End Get
        End Property

        ''' <summary>How many rows the sheet has. 1…50 by default.</summary>
        Public Property Rows As Integer
            Get
                Return GetValue(RowsProperty)
            End Get
            Set(value As Integer)
                SetValue(RowsProperty, value)
            End Set
        End Property

        ''' <summary>How many columns the sheet has. 1…26 (A…Z) by default.</summary>
        Public Property Columns As Integer
            Get
                Return GetValue(ColumnsProperty)
            End Get
            Set(value As Integer)
                SetValue(ColumnsProperty, value)
            End Set
        End Property

        ''' <summary>The width of one column, in pixels.</summary>
        Public Property ColumnWidth As Double
            Get
                Return GetValue(ColumnWidthProperty)
            End Get
            Set(value As Double)
                SetValue(ColumnWidthProperty, value)
            End Set
        End Property

        ''' <summary>The height of one row, in pixels.</summary>
        Public Property RowHeight As Double
            Get
                Return GetValue(RowHeightProperty)
            End Get
            Set(value As Double)
                SetValue(RowHeightProperty, value)
            End Set
        End Property

        ''' <summary>The width of the row-number column, in pixels.</summary>
        Public Property HeaderWidth As Double
            Get
                Return GetValue(HeaderWidthProperty)
            End Get
            Set(value As Double)
                SetValue(HeaderWidthProperty, value)
            End Set
        End Property

        ''' <summary>The height of the column-letter row, in pixels.</summary>
        Public Property HeaderHeight As Double
            Get
                Return GetValue(HeaderHeightProperty)
            End Get
            Set(value As Double)
                SetValue(HeaderHeightProperty, value)
            End Set
        End Property

        ''' <summary>Draw the headers at all.</summary>
        Public Property ShowHeaders As Boolean
            Get
                Return GetValue(ShowHeadersProperty)
            End Get
            Set(value As Boolean)
                SetValue(ShowHeadersProperty, value)
            End Set
        End Property

        ''' <summary>Draw the formula bar at all.</summary>
        Public Property ShowFormulaBar As Boolean
            Get
                Return GetValue(ShowFormulaBarProperty)
            End Get
            Set(value As Boolean)
                SetValue(ShowFormulaBarProperty, value)
            End Set
        End Property

        ''' <summary>Draw scrollbars when the sheet is bigger than its space.</summary>
        Public Property ShowScrollBars As Boolean
            Get
                Return GetValue(ShowScrollBarsProperty)
            End Get
            Set(value As Boolean)
                SetValue(ShowScrollBarsProperty, value)
            End Set
        End Property

        ''' <summary>False makes the sheet read-only.</summary>
        Public Property AllowEditing As Boolean
            Get
                Return GetValue(AllowEditingProperty)
            End Get
            Set(value As Boolean)
                SetValue(AllowEditingProperty, value)
            End Set
        End Property

        ''' <summary>The font family name, or empty for the platform default.</summary>
        Public Property FontFamilyName As String
            Get
                Return GetValue(FontFamilyNameProperty)
            End Get
            Set(value As String)
                SetValue(FontFamilyNameProperty, value)
            End Set
        End Property

        ''' <summary>The font size of the sheet, in points.</summary>
        Public Property FontSize As Double
            Get
                Return GetValue(FontSizeProperty)
            End Get
            Set(value As Double)
                SetValue(FontSizeProperty, value)
            End Set
        End Property

        ''' <summary>The colour of the grid lines.</summary>
        Public Property GridColor As Color
            Get
                Return GetValue(GridColorProperty)
            End Get
            Set(value As Color)
                SetValue(GridColorProperty, value)
            End Set
        End Property

        ''' <summary>The backcolour of the headers.</summary>
        Public Property HeaderBackColor As Color
            Get
                Return GetValue(HeaderBackColorProperty)
            End Get
            Set(value As Color)
                SetValue(HeaderBackColorProperty, value)
            End Set
        End Property

        ''' <summary>The colour of the header text.</summary>
        Public Property HeaderTextColor As Color
            Get
                Return GetValue(HeaderTextColorProperty)
            End Get
            Set(value As Color)
                SetValue(HeaderTextColorProperty, value)
            End Set
        End Property

        ''' <summary>The backcolour of the cells.</summary>
        Public Property CellBackColor As Color
            Get
                Return GetValue(CellBackColorProperty)
            End Get
            Set(value As Color)
                SetValue(CellBackColorProperty, value)
            End Set
        End Property

        ''' <summary>The colour of the cell text.</summary>
        Public Property TextColor As Color
            Get
                Return GetValue(TextColorProperty)
            End Get
            Set(value As Color)
                SetValue(TextColorProperty, value)
            End Set
        End Property

        ''' <summary>The selection colour: the outline, the active cell and the fill handle.</summary>
        Public Property SelectionColor As Color
            Get
                Return GetValue(SelectionColorProperty)
            End Get
            Set(value As Color)
                SetValue(SelectionColorProperty, value)
            End Set
        End Property

        ''' <summary>The wash drawn over the selected cells.</summary>
        Public Property SelectionFillColor As Color
            Get
                Return GetValue(SelectionFillColorProperty)
            End Get
            Set(value As Color)
                SetValue(SelectionFillColorProperty, value)
            End Set
        End Property

        ''' <summary>Raised for every committed cell change: typed, autofilled, or set from code.</summary>
        Public Event CellChanged As EventHandler(Of SheetCellChangedEventArgs)

        ''' <summary>Raised when the selection moves, so a form can show where the user is.</summary>
        Public Event SelectionChanged As EventHandler

        ''' <summary>Raised when a column or a row is given its own size by a drag, or from code — so a
        ''' form can save ColumnWidths/RowHeights and get it back next run.
        '''
        ''' Named SheetSizeChanged and not SizeChanged because Control.SizeChanged already exists on every
        ''' control, and hiding it would make sheet.SizeChanged mean two different things depending on the
        ''' static type of the variable in hand.</summary>
        Public Event SheetSizeChanged As EventHandler(Of SheetSizeChangedEventArgs)

        ''' <summary>The active cell's address, e.g. "B7".</summary>
        Public ReadOnly Property ActiveCellName As String
            Get
                Return CellName(_activeRow, _activeColumn)
            End Get
        End Property

        ''' <summary>
        ''' The four corners of what is selected, 1-based — what a form needs to know what its user has
        ''' picked. A whole-COLUMN selection spans every row, and a whole-ROW one every column; only the
        ''' axis that was actually clicked narrows.
        ''' </summary>
        Public ReadOnly Property SelectedFirstRow As Integer
            Get
                Return SelectionFirstRow()
            End Get
        End Property

        ''' <summary>The last row of the selection — see SelectedFirstRow.</summary>
        Public ReadOnly Property SelectedLastRow As Integer
            Get
                Return SelectionLastRow()
            End Get
        End Property

        ''' <summary>The first column of the selection — see SelectedFirstRow.</summary>
        Public ReadOnly Property SelectedFirstColumn As Integer
            Get
                Return SelectionFirstColumn()
            End Get
        End Property

        ''' <summary>The last column of the selection — see SelectedFirstRow.</summary>
        Public ReadOnly Property SelectedLastColumn As Integer
            Get
                Return SelectionLastColumn()
            End Get
        End Property

        ''' <summary>True when every cell in the selection is bold, false when none is, Nothing when they
        ''' disagree or there is nothing in it — what the right-click menu ticks.</summary>
        Public ReadOnly Property SelectionAllBold As Nullable(Of Boolean)
            Get
                Return SelectionFlag(True)
            End Get
        End Property

        ''' <summary>The same for italics — see SelectionAllBold.</summary>
        Public ReadOnly Property SelectionAllItalic As Nullable(Of Boolean)
            Get
                Return SelectionFlag(False)
            End Get
        End Property

        ''' <summary>The active cell's row, 1-based.</summary>
        Public ReadOnly Property ActiveRow As Integer
            Get
                Return _activeRow
            End Get
        End Property

        ''' <summary>The active cell's column, 1-based.</summary>
        Public ReadOnly Property ActiveColumn As Integer
            Get
                Return _activeColumn
            End Get
        End Property

        ''' <summary>How many rows the sheet really has, whatever was asked for.</summary>
        Private ReadOnly Property RowCount As Integer
            Get
                Dim rows As Integer = Me.Rows
                Return If(rows < 1, 1, rows)
            End Get
        End Property

        ''' <summary>How many columns the sheet really has, whatever was asked for.</summary>
        Private ReadOnly Property ColumnCount As Integer
            Get
                Dim columns As Integer = Me.Columns
                Return If(columns < 1, 1, columns)
            End Get
        End Property

        ''' <summary>"A" for column 1, "Z" for 26, "AA" for 27.</summary>
        Public Shared Function ColumnName(column As Integer) As String
            Dim letters As String = String.Empty
            Dim value As Integer = If(column < 1, 1, column)
            While value > 0
                Dim remainder As Integer = (value - 1) Mod 26
                letters = ChrW(AscW("A"c) + remainder) & letters
                value = (value - 1) \ 26
            End While

            Return letters
        End Function

        ''' <summary>"A1" for row 1, column 1; "AB7" for row 7, column 28.</summary>
        Public Shared Function CellName(row As Integer, column As Integer) As String
            Return ColumnName(column) & If(row < 1, 1, row).ToString(CultureInfo.InvariantCulture)
        End Function

        ''' <summary>
        ''' Reads an address like "A1" or "b7" back into row and column, both 1-based. False when the
        ''' text is not an address at all, in which case row and column come back as 1.
        ''' </summary>
        Public Shared Function ParseCellName(name As String, ByRef row As Integer, ByRef column As Integer) As Boolean
            row = 1
            column = 1
            If String.IsNullOrEmpty(name) Then
                Return False
            End If

            Dim text As String = name.Trim().ToUpperInvariant()
            Dim index As Integer = 0
            Dim letters As Integer = 0
            Dim letterCount As Integer = 0
            While index < text.Length AndAlso text(index) >= "A"c AndAlso text(index) <= "Z"c
                ' Bounded on purpose. VB checks integer overflow and would THROW here, while C# wraps
                ' silently — so an 8-letter "address" used to be a crash in one twin and a wrong answer
                ' in the other. Three letters is column 18 278, which is past any sheet this draws.
                letterCount += 1
                If letterCount > 3 Then
                    Return False
                End If

                letters = letters * 26 + (AscW(text(index)) - AscW("A"c) + 1)
                index += 1
            End While

            If letters = 0 OrElse index >= text.Length Then
                Return False
            End If

            Dim digits As Integer = 0
            Dim start As Integer = index
            Dim digitCount As Integer = 0
            While index < text.Length AndAlso text(index) >= "0"c AndAlso text(index) <= "9"c
                digitCount += 1
                If digitCount > 7 Then
                    Return False                    ' and a seven-digit row is past the end of one
                End If

                digits = digits * 10 + (AscW(text(index)) - AscW("0"c))
                index += 1
            End While

            If index = start OrElse index <> text.Length OrElse digits < 1 Then
                Return False
            End If

            row = digits
            column = letters
            Return True
        End Function

        ''' <summary>The contents of a cell — empty for a blank one, and for an address off the sheet.</summary>
        Public Function GetCell(row As Integer, column As Integer) As String
            Dim cell As SheetCell = FindCell(row, column)
            Return If(cell Is Nothing OrElse cell.Text Is Nothing, String.Empty, cell.Text)
        End Function

        ''' <summary>
        ''' Puts text in a cell, adding it if it is new. An address off the sheet is ignored, an empty
        ''' string blanks the cell, and setting the value it already has does nothing at all — so a
        ''' fill over an already-correct block raises no events.
        ''' </summary>
        Public Sub SetCell(row As Integer, column As Integer, text As String)
            If row < 1 OrElse column < 1 OrElse row > RowCount OrElse column > ColumnCount Then
                Return
            End If

            Dim value As String = If(text, String.Empty)
            Dim cell As SheetCell = FindCell(row, column)
            Dim previous As String = If(cell Is Nothing OrElse cell.Text Is Nothing, String.Empty, cell.Text)
            If previous = value Then
                Return
            End If

            If cell Is Nothing Then
                cell = New SheetCell()
                cell.Row = row
                cell.Column = column
                cell.Text = value
                Cells.Add(cell)
                _lookup.Add(cell)
            Else
                cell.Text = value
            End If

            OnCellChanged(row, column, value)
            InvalidateVisual()
        End Sub

        ''' <summary>Blanks every cell in a block. The corners may be given in any order.</summary>
        Public Sub ClearRange(firstRow As Integer, firstColumn As Integer, lastRow As Integer, lastColumn As Integer)
            Dim row1 As Integer = Math.Min(firstRow, lastRow)
            Dim row2 As Integer = Math.Max(firstRow, lastRow)
            Dim column1 As Integer = Math.Min(firstColumn, lastColumn)
            Dim column2 As Integer = Math.Max(firstColumn, lastColumn)
            For row As Integer = row1 To row2
                For column As Integer = column1 To column2
                    SetCell(row, column, String.Empty)
                Next
            Next
        End Sub

        ''' <summary>Blanks whatever is selected (which may be whole columns, whole rows, or all of it).</summary>
        Public Sub ClearSelection()
            Dim first As Integer = SelectionFirstRow()
            Dim last As Integer = SelectionLastRow()
            Dim left As Integer = SelectionFirstColumn()
            Dim right As Integer = SelectionLastColumn()
            ClearRange(first, left, last, right)
        End Sub

        ''' <summary>Selects one cell and moves the active cell there.</summary>
        Public Sub SelectCell(row As Integer, column As Integer)
            _wholeColumns = False
            _wholeRows = False
            _selectAll = False
            _anchorRow = ClampRow(row)
            _anchorColumn = ClampColumn(column)
            _activeRow = _anchorRow
            _activeColumn = _anchorColumn
            CommitEdit(False)
            ScrollToActive()
            RaiseSelectionChanged()
            InvalidateVisual()
        End Sub

        ''' <summary>Selects a block, leaving the active cell at its top-left corner.</summary>
        Public Sub SelectRange(firstRow As Integer, firstColumn As Integer, lastRow As Integer, lastColumn As Integer)
            _wholeColumns = False
            _wholeRows = False
            _selectAll = False
            _anchorRow = ClampRow(firstRow)
            _anchorColumn = ClampColumn(firstColumn)
            _activeRow = ClampRow(lastRow)
            _activeColumn = ClampColumn(lastColumn)
            CommitEdit(False)
            ScrollToActive()
            RaiseSelectionChanged()
            InvalidateVisual()
        End Sub

        ''' <summary>Selects every cell on the sheet.</summary>
        Public Sub SelectAll()
            _selectAll = True
            _wholeColumns = False
            _wholeRows = False
            _anchorRow = 1
            _anchorColumn = 1
            _activeRow = 1
            _activeColumn = 1
            CommitEdit(False)
            RaiseSelectionChanged()
            InvalidateVisual()
        End Sub

        ''' <summary>Selects one whole column, exactly as clicking its letter in the header does — every
        ''' row of it, and only that column.</summary>
        Public Sub SelectColumn(column As Integer)
            SelectColumns(column, False)
        End Sub

        ''' <summary>Selects one whole row, as clicking its number in the header does.</summary>
        Public Sub SelectRow(row As Integer)
            SelectRows(row, False)
        End Sub

        ''' <summary>True when a cell is being edited right now (in the cell, or in the fx box).</summary>
        Public ReadOnly Property IsEditing As Boolean
            Get
                Return _editing
            End Get
        End Property

        ''' <summary>Opens the active cell for editing, keeping what is in it.</summary>
        Public Sub BeginEdit()
            BeginEdit(GetCell(_activeRow, _activeColumn), False, False)
        End Sub

        ''' <summary>Opens the active cell for editing in the formula bar instead of in the cell.</summary>
        Public Sub BeginEditInBar()
            Dim selected As String = SelectedText()
            BeginEdit(selected, False, True)
        End Sub

        ''' <summary>Commits an edit in progress (what Enter does). Nothing happens if none is open.</summary>
        Public Sub CommitEditNow()
            CommitEdit(True)
        End Sub

        ''' <summary>Abandons an edit in progress (what Esc does).</summary>
        Public Sub CancelEditNow()
            CommitEdit(False)
        End Sub

        ''' <summary>Replaces the contents of every selected cell, all of them getting the same text.</summary>
        Public Sub FillSelection(text As String)
            Dim first As Integer = SelectionFirstRow()
            Dim last As Integer = SelectionLastRow()
            Dim left As Integer = SelectionFirstColumn()
            Dim right As Integer = SelectionLastColumn()
            For row As Integer = first To last
                For column As Integer = left To right
                    SetCell(row, column, text)
                Next
            Next
        End Sub

        ''' <summary>The cell holding an address, or null. For reading or changing its FORMATTING — a
        ''' blank cell may carry formatting, and <see cref="EnsureCell"/> creates it if it is missing.</summary>
        Public Function CellAt(row As Integer, column As Integer) As SheetCell
            Return FindCell(row, column)
        End Function

        ''' <summary>
        ''' The cell at an address, added if it was not there — how an EMPTY cell is given a highlight
        ''' or an alignment. Null when the address is off the sheet (the same rule as SetCell).
        ''' </summary>
        Public Function EnsureCell(row As Integer, column As Integer) As SheetCell
            If row < 1 OrElse column < 1 OrElse row > RowCount OrElse column > ColumnCount Then
                Return Nothing
            End If

            Dim cell As SheetCell = FindCell(row, column)
            If cell IsNot Nothing Then
                Return cell
            End If

            cell = New SheetCell()
            cell.Row = row
            cell.Column = column
            cell.Text = String.Empty
            Cells.Add(cell)
            _lookup.Add(cell)
            Return cell
        End Function

        ''' <summary>
        ''' Repaints after the cell OBJECTS were changed in code. They are plain objects, so nothing
        ''' tells the sheet that one moved — touch a cell with CellAt/EnsureCell, set what you want,
        ''' then call this (the Set* methods below do it for you).
        ''' </summary>
        Public Sub Refresh()
            InvalidateVisual()
        End Sub

        ''' <summary>Turns bold on or off for one cell.</summary>
        Public Sub SetBold(row As Integer, column As Integer, bold As Boolean)
            Dim cell As SheetCell = EnsureCell(row, column)
            If cell Is Nothing OrElse cell.Bold = bold Then
                Return
            End If

            cell.Bold = bold
            InvalidateVisual()
        End Sub

        ''' <summary>Turns italics on or off for one cell.</summary>
        Public Sub SetItalic(row As Integer, column As Integer, italic As Boolean)
            Dim cell As SheetCell = EnsureCell(row, column)
            If cell Is Nothing OrElse cell.Italic = italic Then
                Return
            End If

            cell.Italic = italic
            InvalidateVisual()
        End Sub

        ''' <summary>Sets one cell's font size. 0 puts it back on the sheet's own.</summary>
        Public Sub SetFontSize(row As Integer, column As Integer, size As Double)
            Dim cell As SheetCell = EnsureCell(row, column)
            If cell Is Nothing OrElse Math.Abs(cell.FontSize - size) < 0.001 Then
                Return
            End If

            cell.FontSize = size
            InvalidateVisual()
        End Sub

        ''' <summary>Sets one cell's font family. Empty puts it back on the sheet's own.</summary>
        Public Sub SetFontFamily(row As Integer, column As Integer, family As String)
            Dim cell As SheetCell = EnsureCell(row, column)
            Dim value As String = If(family, String.Empty)
            If cell Is Nothing OrElse If(cell.FontFamily, String.Empty) = value Then
                Return
            End If

            cell.FontFamily = value
            InvalidateVisual()
        End Sub

        ''' <summary>Sets one cell's text colour. Null puts it back on the sheet's own.</summary>
        Public Sub SetTextColor(row As Integer, column As Integer, color As Nullable(Of Color))
            Dim cell As SheetCell = EnsureCell(row, column)
            If cell Is Nothing OrElse cell.TextColor = color Then
                Return
            End If

            cell.TextColor = color
            InvalidateVisual()
        End Sub

        ''' <summary>Sets one cell's highlight. Null puts it back on the sheet's paper colour.</summary>
        Public Sub SetFill(row As Integer, column As Integer, color As Nullable(Of Color))
            Dim cell As SheetCell = EnsureCell(row, column)
            If cell Is Nothing OrElse cell.Fill = color Then
                Return
            End If

            cell.Fill = color
            InvalidateVisual()
        End Sub

        ''' <summary>Sets one cell's text alignment.</summary>
        Public Sub SetTextAlign(row As Integer, column As Integer, align As SheetAlign)
            Dim cell As SheetCell = EnsureCell(row, column)
            If cell Is Nothing OrElse cell.TextAlign = align Then
                Return
            End If

            cell.TextAlign = align
            InvalidateVisual()
        End Sub

        ''' <summary>Drops every formatting decision from one cell, leaving what it holds.</summary>
        Public Sub ClearFormatting(row As Integer, column As Integer)
            Dim cell As SheetCell = FindCell(row, column)
            If cell Is Nothing Then
                Return
            End If

            cell.Bold = False
            cell.Italic = False
            cell.FontSize = 0
            cell.FontFamily = Nothing
            cell.TextColor = Nothing
            cell.Fill = Nothing
            cell.TextAlign = SheetAlign.Auto
            InvalidateVisual()
        End Sub

        ''' <summary>Drops every formatting decision from the selected cells.</summary>
        Public Sub ClearSelectionFormatting()
            Dim first As Integer = SelectionFirstRow()
            Dim last As Integer = SelectionLastRow()
            Dim left As Integer = SelectionFirstColumn()
            Dim right As Integer = SelectionLastColumn()
            For row As Integer = first To last
                For column As Integer = left To right
                    ClearFormatting(row, column)
                Next
            Next
        End Sub

        ''' <summary>
        ''' Lines the whole selection up. What the right-click menu's alignment items call.
        '''
        ''' A bounded selection — a block of cells — has each cell CREATED if it was blank, which is what
        ''' makes "select A1, right-click, centre, then type" do the obvious thing. A whole column or row
        ''' is not bounded (all fifty of its rows), so only the cells that already exist are touched:
        ''' creating them would write an empty element per row into the form for a line-up with no text in
        ''' it, and nothing to see.
        ''' </summary>
        Public Sub AlignSelection(align As SheetAlign)
            Dim bounded As Boolean = Not _wholeColumns AndAlso Not _wholeRows AndAlso Not _selectAll
            Dim first As Integer = SelectionFirstRow()
            Dim last As Integer = SelectionLastRow()
            Dim left As Integer = SelectionFirstColumn()
            Dim right As Integer = SelectionLastColumn()
            For row As Integer = first To last
                For column As Integer = left To right
                    Dim cell As SheetCell = If(bounded, EnsureCell(row, column), FindCell(row, column))
                    If cell Is Nothing OrElse cell.TextAlign = align Then
                        Continue For
                    End If

                    cell.TextAlign = align
                Next
            Next

            InvalidateVisual()
        End Sub

        ''' <summary>
        ''' The alignment the whole selection already agrees on, or Nothing when it does not — what the
        ''' menu ticks. Cells that do not exist are IGNORED rather than counted as Auto: right-clicking a
        ''' whole column and centring it lines up the cells that are in it, and the tick has to say so —
        ''' with the empty rows counted as Auto, nothing could ever be ticked on a column that is mostly
        ''' empty. Nothing also means "no cells in the selection yet".
        ''' </summary>
        Public Function SelectionTextAlign() As Nullable(Of SheetAlign)
            Dim first As Integer = SelectionFirstRow()
            Dim last As Integer = SelectionLastRow()
            Dim left As Integer = SelectionFirstColumn()
            Dim right As Integer = SelectionLastColumn()
            Dim agreed As Nullable(Of SheetAlign) = Nothing
            For row As Integer = first To last
                For column As Integer = left To right
                    Dim cell As SheetCell = FindCell(row, column)
                    If cell Is Nothing Then
                        Continue For
                    End If

                    If Not agreed.HasValue Then
                        agreed = cell.TextAlign
                    ElseIf agreed.Value <> cell.TextAlign Then
                        Return Nothing
                    End If
                Next
            Next

            Return agreed
        End Function

        ''' <summary>True when every cell in the selection is bold (or italic), false when none is, Nothing
        ''' when they disagree or the selection holds no cells at all. Cells that do not exist are ignored,
        ''' for the reason in SelectionTextAlign.</summary>
        Private Function SelectionFlag(bold As Boolean) As Nullable(Of Boolean)
            Dim first As Integer = SelectionFirstRow()
            Dim last As Integer = SelectionLastRow()
            Dim left As Integer = SelectionFirstColumn()
            Dim right As Integer = SelectionLastColumn()
            Dim all As Nullable(Of Boolean) = Nothing
            For row As Integer = first To last
                For column As Integer = left To right
                    Dim cell As SheetCell = FindCell(row, column)
                    If cell Is Nothing Then
                        Continue For
                    End If

                    Dim isOn As Boolean = If(bold, cell.Bold, cell.Italic)
                    If Not all.HasValue Then
                        all = isOn
                    ElseIf all.Value <> isOn Then
                        Return Nothing
                    End If
                Next
            Next

            Return all
        End Function

        ''' <summary>Bold for the whole selection — bold when any selected cell is not, plain when they
        ''' all already are, which is what Ctrl+B does in every spreadsheet.</summary>
        Public Sub ToggleBoldSelection()
            ToggleSelectionFlag(True)
        End Sub

        ''' <summary>Italics for the whole selection, by the same rule as <see cref="ToggleBoldSelection"/>.</summary>
        Public Sub ToggleItalicSelection()
            ToggleSelectionFlag(False)
        End Sub

        ''' <summary>
        ''' Turns bold (or italics) on for the whole selection, or off when every cell in it already has
        ''' it — Ctrl+B's rule.
        '''
        ''' Which cells it touches depends on the shape of the selection, exactly as AlignSelection
        ''' does: a bounded block gets cells CREATED where it has none, so Ctrl+B before typing does
        ''' something; a whole column or row only gets the cells that already exist, or a whole column
        ''' would put fifty empty elements into the form. A selected cell that is blank counts as "not
        ''' bold", which is what makes a second Ctrl+B turn the first one back off.
        ''' </summary>
        Private Sub ToggleSelectionFlag(bold As Boolean)
            Dim bounded As Boolean = Not _wholeColumns AndAlso Not _wholeRows AndAlso Not _selectAll
            Dim first As Integer = SelectionFirstRow()
            Dim last As Integer = SelectionLastRow()
            Dim left As Integer = SelectionFirstColumn()
            Dim right As Integer = SelectionLastColumn()
            Dim turnOn As Boolean = False
            For row As Integer = first To last
                If turnOn Then
                    Exit For
                End If

                For column As Integer = left To right
                    Dim cell As SheetCell = FindCell(row, column)
                    If cell Is Nothing Then
                        ' A cell that is not there is not bold — but only a bounded selection may create
                        ' one, so an unbounded one ignores the gap and looks at the cells it has.
                        turnOn = bounded
                        If turnOn Then
                            Exit For
                        End If

                        Continue For
                    End If

                    If Not If(bold, cell.Bold, cell.Italic) Then
                        turnOn = True
                        Exit For
                    End If
                Next
            Next

            For row As Integer = first To last
                For column As Integer = left To right
                    Dim cell As SheetCell = If(bounded, EnsureCell(row, column), FindCell(row, column))
                    If cell Is Nothing Then
                        Continue For
                    End If

                    If bold Then
                        cell.Bold = turnOn
                    Else
                        cell.Italic = turnOn
                    End If
                Next
            Next

            InvalidateVisual()
        End Sub

        ''' <summary>Finds the cell holding an address, or null. Uses the index, so it is not a scan.</summary>
        Private Function FindCell(row As Integer, column As Integer) As SheetCell
            If _lookup.Count <> Cells.Count Then
                RebuildLookup()
            End If

            For i As Integer = 0 To _lookup.Count - 1
                If _lookup(i).Row = row AndAlso _lookup(i).Column = column Then
                    Return _lookup(i)
                End If
            Next

            Return Nothing
        End Function

        ''' <summary>Re-indexes the cells after the list itself changed (XAML load, or a form's own edit).</summary>
        Private Sub RebuildLookup()
            _lookup.Clear()
            For i As Integer = 0 To Cells.Count - 1
                _lookup.Add(Cells(i))
            Next
        End Sub

        Private Sub OnCellsChanged(sender As Object, e As NotifyCollectionChangedEventArgs)
            RebuildLookup()
            InvalidateVisual()
        End Sub

        Private Sub OnCellChanged(row As Integer, column As Integer, text As String)
            RaiseEvent CellChanged(Me, New SheetCellChangedEventArgs(row, column, text))
        End Sub

        Private Sub RaiseSelectionChanged()
            RaiseEvent SelectionChanged(Me, EventArgs.Empty)
        End Sub

        Private Function ClampRow(row As Integer) As Integer
            If row < 1 Then
                Return 1
            End If

            Return If(row > RowCount, RowCount, row)
        End Function

        Private Function ClampColumn(column As Integer) As Integer
            If column < 1 Then
                Return 1
            End If

            Return If(column > ColumnCount, ColumnCount, column)
        End Function

        ' ---- what is selected -------------------------------------------------------------------

        Private Function SelectionFirstRow() As Integer
            ' A whole-COLUMN selection spans every row, so its first row is always 1; it is a whole-ROW
            ' selection whose rows come from the anchor. The two flags were SWAPPED here until
            ' 2026-09-26, so clicking column C selected A:C and clicking row 5 selected rows 1:5 — and
            ' every caller of these corners inherited it (Clear, align, fill, the header highlights).
            If _wholeColumns OrElse _selectAll Then
                Return 1
            End If

            Return Math.Min(_anchorRow, _activeRow)
        End Function

        Private Function SelectionLastRow() As Integer
            Return If(_wholeColumns OrElse _selectAll, RowCount, Math.Max(_anchorRow, _activeRow))
        End Function

        Private Function SelectionFirstColumn() As Integer
            If _wholeRows OrElse _selectAll Then
                Return 1
            End If

            Return Math.Min(_anchorColumn, _activeColumn)
        End Function

        Private Function SelectionLastColumn() As Integer
            Return If(_wholeRows OrElse _selectAll, ColumnCount, Math.Max(_anchorColumn, _activeColumn))
        End Function

        ''' <summary>The active cell's contents when the whole selection holds one value, else empty —
        ''' what the fx box shows for a block ("Multiple" would be Excel's word, but empty is calmer).</summary>
        Private Function SelectedText() As String
            Dim text As String = GetCell(_activeRow, _activeColumn)
            If SelectionFirstRow() = SelectionLastRow() AndAlso SelectionFirstColumn() = SelectionLastColumn() Then
                Return text
            End If

            Dim first As String = GetCell(SelectionFirstRow(), SelectionFirstColumn())
            Return If(first = text, text, String.Empty)
        End Function

        ' ---- geometry ---------------------------------------------------------------------------

        ''' <summary>Where the grid's cells start, allowing for the bar and the headers.</summary>
        Private ReadOnly Property GridOrigin As Point
            Get
                Dim x As Double = If(ShowHeaders, HeaderWidth, 0.0)
                Dim y As Double = If(ShowFormulaBar, BarHeight, 0.0) + If(ShowHeaders, HeaderHeight, 0.0)
                Return New Point(x, y)
            End Get
        End Property

        Private Function CellRect(row As Integer, column As Integer) As Rect
            Dim origin As Point = GridOrigin
            Return New Rect(origin.X + ColumnOffset(column) - _scrollX,
                            origin.Y + RowOffset(row) - _scrollY,
                            ColumnWidthOf(column), RowHeightOf(row))
        End Function

        ''' <summary>Column's width: its own after a border was dragged, else the sheet's own ColumnWidth.</summary>
        Public Function ColumnWidthOf(column As Integer) As Double
            Dim width As Double = 0.0
            If _columnWidths.TryGetValue(column, width) AndAlso width > 0 Then
                Return width
            End If

            Return ColumnWidth
        End Function

        ''' <summary>Row's height: its own after a border was dragged, else the sheet's own RowHeight.</summary>
        Public Function RowHeightOf(row As Integer) As Double
            Dim height As Double = 0.0
            If _rowHeights.TryGetValue(row, height) AndAlso height > 0 Then
                Return height
            End If

            Return RowHeight
        End Function

        ''' <summary>The whole grid's width, and its height — what scrolling and measuring need.</summary>
        Private Function ContentWidth() As Double
            Return ColumnOffsets()(ColumnCount)
        End Function

        Private Function ContentHeight() As Double
            Return RowOffsets()(RowCount)
        End Function

        ''' <summary>
        ''' The left edge of every column measured from the left edge of column 1: entry
        ''' Column - 1 holds where that column starts, and the last entry holds the total width. This is
        ''' what makes a sheet with two resized columns work at all — drawing, hit testing, the scroll
        ''' limits and the visible range all read these tables instead of multiplying by a width.
        ''' </summary>
        Private Function ColumnOffsets() As Double()
            If _columnOffsets Is Nothing OrElse _columnOffsets.Length <> ColumnCount + 1 Then
                Dim offsets(ColumnCount) As Double
                Dim at As Double = 0.0
                For i As Integer = 0 To ColumnCount - 1
                    offsets(i) = at
                    at += ColumnWidthOf(i + 1)
                Next

                offsets(ColumnCount) = at
                _columnOffsets = offsets
            End If

            Return _columnOffsets
        End Function

        Private Function RowOffsets() As Double()
            If _rowOffsets Is Nothing OrElse _rowOffsets.Length <> RowCount + 1 Then
                Dim offsets(RowCount) As Double
                Dim at As Double = 0.0
                For i As Integer = 0 To RowCount - 1
                    offsets(i) = at
                    at += RowHeightOf(i + 1)
                Next

                offsets(RowCount) = at
                _rowOffsets = offsets
            End If

            Return _rowOffsets
        End Function

        ''' <summary>How far a column's left edge is from column 1's left edge. One past the last column
        ''' is allowed — that is the sheet's right edge, which the grid lines need.</summary>
        Private Function ColumnOffset(column As Integer) As Double
            Dim offsets As Double() = ColumnOffsets()
            If column < 1 Then
                column = 1
            ElseIf column > ColumnCount + 1 Then
                column = ColumnCount + 1
            End If

            Return offsets(column - 1)
        End Function

        Private Function RowOffset(row As Integer) As Double
            Dim offsets As Double() = RowOffsets()
            If row < 1 Then
                row = 1
            ElseIf row > RowCount + 1 Then
                row = RowCount + 1
            End If

            Return offsets(row - 1)
        End Function

        ''' <summary>Which column a distance from the grid's left edge falls in, and which row a distance
        ''' from its top falls in. A walk rather than a division, because the columns are not all the same
        ''' width once one has been dragged — and the tables are at most a few hundred entries.</summary>
        Private Function ColumnAtOffset(x As Double) As Integer
            Dim offsets As Double() = ColumnOffsets()
            Dim column As Integer = 1
            For i As Integer = 0 To ColumnCount - 1
                If x < offsets(i) Then
                    Exit For
                End If

                column = i + 1
            Next

            Return ClampColumn(column)
        End Function

        Private Function RowAtOffset(y As Double) As Integer
            Dim offsets As Double() = RowOffsets()
            Dim row As Integer = 1
            For i As Integer = 0 To RowCount - 1
                If y < offsets(i) Then
                    Exit For
                End If

                row = i + 1
            Next

            Return ClampRow(row)
        End Function

        ''' <summary>Drops the offset tables. Anything that changes a size, or how many there are, has to
        ''' do this — otherwise the sheet keeps drawing and hit testing at the OLD widths, which looks
        ''' like a resize that quietly did nothing.</summary>
        Private Sub InvalidateTrackOffsets()
            _columnOffsets = Nothing
            _rowOffsets = Nothing
        End Sub

        ''' <summary>Rebuilds everything that depended on the sizes: the offset tables, the scroll limits,
        ''' the picture. Called after any size change, by a drag or from code.</summary>
        Private Sub RefreshGeometry()
            InvalidateTrackOffsets()
            ClampScroll(Bounds.Size)
            InvalidateVisual()
        End Sub

        Private Sub RaiseSizeChanged(column As Integer, row As Integer, size As Double)
            RaiseEvent SheetSizeChanged(Me, New SheetSizeChangedEventArgs(column, row, size))
        End Sub

        ' ---- the scrollbars -----------------------------------------------------------------------
        ' Drawn OVER the grid, slim, and only when there is something to scroll to. Without them a sheet
        ' wider than its space gave no sign at all that the columns on the right existed (the wheel
        ' scrolls rows, and Shift+wheel scrolls columns — nobody guesses that).

        ''' <summary>The vertical scrollbar's track, along the right edge of the grid — or an empty rect
        ''' when the rows all fit.</summary>
        Private Function VScrollRect(size As Size) As Rect
            Dim grid As Rect = GridRect(size)
            If Not ShowScrollBars OrElse grid.Width <= 0 OrElse grid.Height <= 0 OrElse
                ContentHeight() <= grid.Height + 0.5 Then
                Return New Rect(0, 0, 0, 0)
            End If

            Return New Rect(grid.Right - ScrollBarSize, grid.Y, ScrollBarSize, grid.Height)
        End Function

        ''' <summary>The horizontal scrollbar's track, along the bottom edge of the grid.</summary>
        Private Function HScrollRect(size As Size) As Rect
            Dim grid As Rect = GridRect(size)
            If Not ShowScrollBars OrElse grid.Width <= 0 OrElse grid.Height <= 0 OrElse
                ContentWidth() <= grid.Width + 0.5 Then
                Return New Rect(0, 0, 0, 0)
            End If

            Return New Rect(grid.X, grid.Bottom - ScrollBarSize, grid.Width, ScrollBarSize)
        End Function

        ''' <summary>The grabbable thumb inside a track: its length is the visible fraction of the
        ''' content, and where it sits is where the sheet is scrolled to. The geometry here is exact — the
        ''' thumb a drag computes from is the thumb that is drawn, or it would creep away from the
        ''' pointer.</summary>
        Private Shared Function ThumbIn(track As Rect, content As Double, viewport As Double,
            offset As Double, vertical As Boolean) As Rect
            If track.Width <= 0 OrElse track.Height <= 0 Then
                Return New Rect(0, 0, 0, 0)
            End If

            Dim span As Double = If(vertical, track.Height, track.Width)
            Dim thumb As Double = ThumbSpan(span, content, viewport)
            Dim travel As Double = span - thumb
            Dim maxOffset As Double = Math.Max(0.0001, content - viewport)
            Dim at As Double = travel * Math.Min(1.0, Math.Max(0.0, offset / maxOffset))
            Return If(vertical,
                New Rect(track.X, track.Y + at, track.Width, thumb),
                New Rect(track.X + at, track.Y, thumb, track.Height))
        End Function

        ''' <summary>How long a thumb is: the visible fraction of the content, never shorter than
        ''' MinThumbSize so a very long sheet still leaves something to grab.</summary>
        Private Shared Function ThumbSpan(span As Double, content As Double, viewport As Double) As Double
            Return Math.Max(MinThumbSize, span * Math.Min(1.0, viewport / content))
        End Function

        Private Function VScrollThumb(size As Size) As Rect
            Dim grid As Rect = GridRect(size)
            Return ThumbIn(VScrollRect(size), ContentHeight(), grid.Height, _scrollY, True)
        End Function

        Private Function HScrollThumb(size As Size) As Rect
            Dim grid As Rect = GridRect(size)
            Return ThumbIn(HScrollRect(size), ContentWidth(), grid.Width, _scrollX, False)
        End Function

        ''' <summary>The travel a thumb has, in pixels — and the offset range it stands for.</summary>
        Private Sub TrackSpan(size As Size, vertical As Boolean, ByRef travel As Double, ByRef maxOffset As Double)
            Dim grid As Rect = GridRect(size)
            Dim track As Rect = If(vertical, VScrollRect(size), HScrollRect(size))
            Dim span As Double = If(vertical, track.Height, track.Width)
            Dim content As Double = If(vertical, ContentHeight(), ContentWidth())
            Dim viewport As Double = If(vertical, grid.Height, grid.Width)
            travel = Math.Max(0.0001, span - ThumbSpan(span, content, viewport))
            maxOffset = Math.Max(0.0, content - viewport)
        End Sub

        ''' <summary>Puts the sheet where a drag of a thumb has taken it: the distance the pointer moved,
        ''' scaled from thumb travel to scroll range.</summary>
        Private Sub ScrollThumbTo(size As Size, vertical As Boolean, offset As Double)
            If vertical Then
                _scrollY = offset
            Else
                _scrollX = offset
            End If

            ClampScroll(size)
            InvalidateVisual()
        End Sub

        ''' <summary>Scrolls so a point in the track becomes the MIDDLE of the view — what clicking the
        ''' track itself does, the way every scrollbar in every toolkit behaves.</summary>
        Private Sub ScrollTrackTo(size As Size, vertical As Boolean, position As Double)
            Dim grid As Rect = GridRect(size)
            Dim track As Rect = If(vertical, VScrollRect(size), HScrollRect(size))
            Dim span As Double = If(vertical, track.Height, track.Width)
            Dim content As Double = If(vertical, ContentHeight(), ContentWidth())
            Dim viewport As Double = If(vertical, grid.Height, grid.Width)
            Dim travel As Double = 0.0
            Dim maxOffset As Double = 0.0
            TrackSpan(size, vertical, travel, maxOffset)
            Dim thumb As Double = ThumbSpan(span, content, viewport)
            Dim at As Double = (If(vertical, position - track.Y, position - track.X)) - thumb / 2
            ScrollThumbTo(size, vertical, at / travel * maxOffset)
        End Sub

        ''' <summary>Paints both scrollbars, when they apply.</summary>
        Private Sub DrawScrollBars(context As DrawingContext, size As Size)
            Dim grid As Rect = GridRect(size)
            Using context.PushClip(grid)
                Dim back As New SolidColorBrush(Color.Parse("#EFF1F4"))
                Dim edge As New SolidColorBrush(GridColor)
                Dim thumb As New SolidColorBrush(Color.Parse("#B7BEC8"))
                Dim vTrack As Rect = VScrollRect(size)
                If vTrack.Width > 0 Then
                    context.FillRectangle(back, vTrack)
                    context.DrawLine(New Pen(edge, 1.0), New Point(vTrack.X + 0.5, vTrack.Y),
                        New Point(vTrack.X + 0.5, vTrack.Bottom))
                    context.FillRectangle(thumb, VScrollThumb(size))
                End If

                Dim hTrack As Rect = HScrollRect(size)
                If hTrack.Height > 0 Then
                    context.FillRectangle(back, hTrack)
                    context.DrawLine(New Pen(edge, 1.0), New Point(hTrack.X, hTrack.Y + 0.5),
                        New Point(hTrack.Right, hTrack.Y + 0.5))
                    context.FillRectangle(thumb, HScrollThumb(size))
                End If
            End Using
        End Sub

        ' ---- the right-click menu ------------------------------------------------------------------
        '
        ' An Avalonia ContextMenu was tried first and it never opened for a real right-click (reported
        ' 2026-09-26): that needs the platform's popup plumbing and a control theme, and neither is
        ' something this control otherwise depends on — and it meant the menu could not be seen working in
        ' a headless render either, which is how it got shipped unverified. Drawing it costs the control
        ' nothing it does not already do, and it takes the sheet's own colours, so it fits whatever theme
        ' the form uses.

        ''' <summary>One line of the menu: a command, or a gap between groups of them.</summary>
        Private NotInheritable Class SheetMenuItem
            ''' <summary>The text shown, empty for a separator.</summary>
            Public Label As String = String.Empty

            ''' <summary>A gap rather than a command.</summary>
            Public IsSeparator As Boolean

            ''' <summary>Show a tick beside it (what the selection already is).</summary>
            Public Ticked As Boolean

            ''' <summary>What choosing it does.</summary>
            Public Run As Action
        End Class

        ''' <summary>How wide the menu is, and how tall one of its lines is.</summary>
        Private Const MenuWidth As Double = 200.0
        Private Const MenuItemHeight As Double = 24.0
        Private Const MenuSeparatorHeight As Double = 9.0
        Private Const MenuPad As Double = 5.0

        ''' <summary>What the menu offers, built on each open so the ticks are current. The commands act on
        ''' the SELECTION — a whole column lines up in one gesture, which is the point of having it.</summary>
        Private Function BuildMenuItems() As List(Of SheetMenuItem)
            Dim align As Nullable(Of SheetAlign) = SelectionTextAlign()
            Dim items As New List(Of SheetMenuItem)()
            items.Add(AlignItem("Align left", SheetAlign.Left, align))
            items.Add(AlignItem("Align centre", SheetAlign.Center, align))
            items.Add(AlignItem("Align right", SheetAlign.Right, align))
            items.Add(AlignItem("Align automatically", SheetAlign.Auto, align))
            items.Add(New SheetMenuItem With {.IsSeparator = True})
            items.Add(New SheetMenuItem With {
                .Label = "Bold",
                .Ticked = SelectionFlag(True) = True,
                .Run = AddressOf ToggleBoldSelection})
            items.Add(New SheetMenuItem With {
                .Label = "Italics",
                .Ticked = SelectionFlag(False) = True,
                .Run = AddressOf ToggleItalicSelection})
            items.Add(New SheetMenuItem With {.IsSeparator = True})
            items.Add(New SheetMenuItem With {.Label = "Clear formatting", .Run = AddressOf ClearSelectionFormatting})
            items.Add(New SheetMenuItem With {.Label = "Clear cells", .Run = AddressOf ClearSelection})
            Return items
        End Function

        Private Function AlignItem(label As String, align As SheetAlign, current As Nullable(Of SheetAlign)) As SheetMenuItem
            Dim item As New SheetMenuItem()
            item.Label = label
            item.Ticked = current.HasValue AndAlso current.Value = align
            item.Run = Sub() AlignSelection(align)
            Return item
        End Function

        ''' <summary>The menu's rectangle on the canvas, which is only meaningful while it is open.</summary>
        Private Function MenuRect() As Rect
            Dim height As Double = 2 * MenuPad
            For i As Integer = 0 To _menuItems.Count - 1
                height += If(_menuItems(i).IsSeparator, MenuSeparatorHeight, MenuItemHeight)
            Next

            Return New Rect(_menuX, _menuY, MenuWidth, height)
        End Function

        ''' <summary>Which line of the menu a point is on, or -1. Separators are not selectable.</summary>
        Private Function MenuItemAt(point As Point) As Integer
            If Not _menuOpen OrElse Not MenuRect().Contains(point) Then
                Return -1
            End If

            Dim y As Double = _menuY + MenuPad
            For i As Integer = 0 To _menuItems.Count - 1
                Dim item As SheetMenuItem = _menuItems(i)
                Dim height As Double = If(item.IsSeparator, MenuSeparatorHeight, MenuItemHeight)
                If Not item.IsSeparator AndAlso point.Y >= y AndAlso point.Y < y + height Then
                    Return i
                End If

                y += height
            Next

            Return -1
        End Function

        ''' <summary>
        ''' Opens the menu under the pointer, on the selection the user just pointed at.
        '''
        ''' The right button is handled HERE rather than left to the framework's context-request: that never
        ''' reached this control, so right-clicking did nothing at all. It also lets the menu move the
        ''' selection onto whatever was right-clicked, which is what every spreadsheet does — and keeps the
        ''' whole menu inside the control, flipping it up or left near an edge.
        ''' </summary>
        Private Sub ShowContextMenu(point As Point)
            If Not AllowEditing Then
                Return
            End If

            SetContextSelection(point)
            _menuItems = BuildMenuItems()
            _menuOpen = True
            _menuHot = -1
            Dim size As Size = Bounds.Size
            Dim height As Double = MenuRect().Height
            _menuX = Math.Max(0, Math.Min(point.X, size.Width - MenuWidth))
            _menuY = Math.Max(0, Math.Min(point.Y, size.Height - height))
            InvalidateVisual()
        End Sub

        Private Sub CloseContextMenu()
            If Not _menuOpen Then
                Return
            End If

            _menuOpen = False
            _menuHot = -1
            InvalidateVisual()
        End Sub

        ''' <summary>Runs the line a point is on, if any, and closes. Always True: the press was the menu's.</summary>
        Private Function ChooseMenuItem(point As Point) As Boolean
            Dim index As Integer = MenuItemAt(point)
            Dim run As Action = If(index >= 0, _menuItems(index).Run, Nothing)
            CloseContextMenu()
            If run IsNot Nothing Then
                run()
            End If

            Return True
        End Function

        ''' <summary>Paints the menu over everything else.</summary>
        Private Sub DrawContextMenu(context As DrawingContext)
            If Not _menuOpen Then
                Return
            End If

            Dim rect As Rect = MenuRect()
            Dim edge As New SolidColorBrush(GridColor)
            context.FillRectangle(New SolidColorBrush(CellBackColor), rect)
            context.DrawRectangle(Nothing, New Pen(edge, 1.0), rect)
            Dim text As New SolidColorBrush(TextColor)
            Dim hot As New SolidColorBrush(SelectionFillColor)
            Dim y As Double = _menuY + MenuPad
            For i As Integer = 0 To _menuItems.Count - 1
                Dim item As SheetMenuItem = _menuItems(i)
                If item.IsSeparator Then
                    context.DrawLine(New Pen(edge, 1.0), New Point(_menuX + 6, y + MenuSeparatorHeight / 2),
                        New Point(rect.Right - 6, y + MenuSeparatorHeight / 2))
                    y += MenuSeparatorHeight
                    Continue For
                End If

                If i = _menuHot Then
                    context.FillRectangle(hot, New Rect(_menuX + 1, y, MenuWidth - 2, MenuItemHeight))
                End If

                If item.Ticked Then
                    DrawCellText(context, ChrW(&H2713), New Rect(_menuX + 1, y, 15, MenuItemHeight), text, False,
                        TextAlignment.Center)
                End If

                DrawCellText(context, item.Label, New Rect(_menuX + 17, y, MenuWidth - 22, MenuItemHeight),
                    text, False, TextAlignment.Left)
                y += MenuItemHeight
            Next
        End Sub

        ''' <summary>
        ''' Moves the selection onto what was right-clicked — unless the cell is already inside the
        ''' selection, in which case the menu is about the whole block, which is what the user aimed at.
        ''' </summary>
        Private Sub SetContextSelection(point As Point)
            Dim row As Integer = 0
            Dim column As Integer = 0
            Dim hit As Integer = HitTest(point, row, column)
            If hit = HitColumnHeader Then
                SelectColumns(column, False)
                Return
            End If

            If hit = HitRowHeader Then
                SelectRows(row, False)
                Return
            End If

            If hit <> HitCell Then
                Return
            End If

            If row >= SelectionFirstRow() AndAlso row <= SelectionLastRow() AndAlso
                column >= SelectionFirstColumn() AndAlso column <= SelectionLastColumn() Then
                Return
            End If

            SelectCell(row, column)
        End Sub

        ''' <summary>The menu's own keys: Escape closes, Up/Down move the highlight, Enter chooses.</summary>
        Private Function HandleMenuKey(e As KeyEventArgs) As Boolean
            If Not _menuOpen Then
                Return False
            End If

            If e.Key = Key.Escape Then
                CloseContextMenu()
                Return True
            End If

            If e.Key = Key.Up OrElse e.Key = Key.Down Then
                ' NOT "step": that is a VB keyword (For … Step) and cannot name a local.
                Dim direction As Integer = If(e.Key = Key.Down, 1, -1)
                Dim at As Integer = _menuHot
                For i As Integer = 0 To _menuItems.Count - 1
                    at += direction
                    If at < 0 Then
                        at = _menuItems.Count - 1
                    ElseIf at >= _menuItems.Count Then
                        at = 0
                    End If

                    If Not _menuItems(at).IsSeparator Then
                        Exit For
                    End If
                Next

                _menuHot = at
                InvalidateVisual()
                Return True
            End If

            If e.Key = Key.Enter AndAlso _menuHot >= 0 AndAlso _menuHot < _menuItems.Count Then
                Dim run As Action = _menuItems(_menuHot).Run
                CloseContextMenu()
                If run IsNot Nothing Then
                    run()
                End If

                Return True
            End If

            Return True                 ' the menu owns the keyboard while it is open
        End Function

        ' ---- sizing a column or a row ------------------------------------------------------------
        ' What dragging a header border calls. The sizes are per track and SPARSE: every column and row
        ' without an entry is still the sheet's own ColumnWidth/RowHeight, so the common case stays a
        ' single number and the form stays short.

        ''' <summary>Gives one column its own width. Clamped to MinTrackSize so its border stays grabbable,
        ''' and rounded to whole pixels — a fractional width is impossible to drag back. A width that comes
        ''' out exactly the sheet's own ColumnWidth CLEARS the override, so the column goes back to
        ''' following the sheet.</summary>
        Public Sub SetColumnWidth(column As Integer, width As Double)
            If ApplyColumnWidth(column, width) Then
                RaiseSizeChanged(column, 0, ColumnWidthOf(column))
            End If
        End Sub

        ''' <summary>Gives one row its own height, by the same rules as SetColumnWidth.</summary>
        Public Sub SetRowHeight(row As Integer, height As Double)
            If ApplyRowHeight(row, height) Then
                RaiseSizeChanged(0, row, RowHeightOf(row))
            End If
        End Sub

        ''' <summary>
        ''' Sets one column's width without announcing it: the drag applies a new width per pixel of
        ''' movement, and an app that saves the form on SheetSizeChanged should not be asked to write the
        ''' file sixty times a second. The drag announces once, on release.
        ''' </summary>
        Private Function ApplyColumnWidth(column As Integer, width As Double) As Boolean
            If column < 1 OrElse column > ColumnCount Then
                Return False
            End If

            Dim size As Double = Math.Max(MinTrackSize, Math.Round(width))
            If Math.Abs(ColumnWidthOf(column) - size) < 0.01 Then
                Return False
            End If

            If Math.Abs(ColumnWidth - size) < 0.01 Then
                _columnWidths.Remove(column)
            Else
                _columnWidths(column) = size
            End If

            RefreshGeometry()
            Return True
        End Function

        Private Function ApplyRowHeight(row As Integer, height As Double) As Boolean
            If row < 1 OrElse row > RowCount Then
                Return False
            End If

            Dim size As Double = Math.Max(MinTrackSize, Math.Round(height))
            If Math.Abs(RowHeightOf(row) - size) < 0.01 Then
                Return False
            End If

            If Math.Abs(RowHeight - size) < 0.01 Then
                _rowHeights.Remove(row)
            Else
                _rowHeights(row) = size
            End If

            RefreshGeometry()
            Return True
        End Function

        ''' <summary>Puts one column back on the sheet's own ColumnWidth.</summary>
        Public Sub ClearColumnWidth(column As Integer)
            If _columnWidths.Remove(column) Then
                RefreshGeometry()
                RaiseSizeChanged(column, 0, ColumnWidth)
            End If
        End Sub

        ''' <summary>Puts one row back on the sheet's own RowHeight.</summary>
        Public Sub ClearRowHeight(row As Integer)
            If _rowHeights.Remove(row) Then
                RefreshGeometry()
                RaiseSizeChanged(0, row, RowHeight)
            End If
        End Sub

        ''' <summary>Puts every column and row back on the sheet's own sizes.</summary>
        Public Sub ClearSizes()
            If _columnWidths.Count = 0 AndAlso _rowHeights.Count = 0 Then
                Return
            End If

            _columnWidths.Clear()
            _rowHeights.Clear()
            RefreshGeometry()
        End Sub

        ''' <summary>
        ''' The columns that have a width of their own, as "3:120,7:60" — sparse, so a sheet whose
        ''' columns are all the same writes nothing at all. Also the XAML form: ColumnWidths="3:120".
        ''' </summary>
        Public Property ColumnWidths As String
            Get
                Return TrackText(_columnWidths)
            End Get
            Set(value As String)
                ReadTrackText(value, _columnWidths, True)
            End Set
        End Property

        ''' <summary>The rows that have a height of their own — see ColumnWidths.</summary>
        Public Property RowHeights As String
            Get
                Return TrackText(_rowHeights)
            End Get
            Set(value As String)
                ReadTrackText(value, _rowHeights, False)
            End Set
        End Property

        Private Shared Function TrackText(sizes As Dictionary(Of Integer, Double)) As String
            If sizes.Count = 0 Then
                Return String.Empty
            End If

            Dim keys As New List(Of Integer)(sizes.Keys)
            keys.Sort()
            Dim parts As New List(Of String)(keys.Count)
            For i As Integer = 0 To keys.Count - 1
                parts.Add(keys(i).ToString(CultureInfo.InvariantCulture) & ":" &
                    sizes(keys(i)).ToString(CultureInfo.InvariantCulture))
            Next

            Return String.Join(",", parts)
        End Function

        ''' <summary>
        ''' Reads "3:120,7:60". Junk is SKIPPED rather than thrown on: this comes from an attribute in a
        ''' form, and one bad pair there must not take the window down. Off-the-sheet indexes are ignored
        ''' and tiny sizes are clamped exactly as a drag would clamp them.
        ''' </summary>
        Private Sub ReadTrackText(text As String, sizes As Dictionary(Of Integer, Double), columns As Boolean)
            sizes.Clear()
            If Not String.IsNullOrEmpty(text) Then
                Dim parts As String() = text.Split(","c)
                Dim limit As Integer = If(columns, ColumnCount, RowCount)
                For i As Integer = 0 To parts.Length - 1
                    Dim pair As String() = parts(i).Split(":"c)
                    If pair.Length <> 2 Then
                        Continue For
                    End If

                    Dim index As Integer = 0
                    Dim size As Double = 0.0
                    If Not Integer.TryParse(pair(0).Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, index) Then
                        Continue For
                    End If

                    If Not Double.TryParse(pair(1).Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, size) Then
                        Continue For
                    End If

                    If index < 1 OrElse index > limit Then
                        Continue For
                    End If

                    sizes(index) = Math.Max(MinTrackSize, Math.Round(size))
                Next
            End If

            RefreshGeometry()
        End Sub

        Private Function SelectionRect() As Rect
            Dim first As Rect = CellRect(SelectionFirstRow(), SelectionFirstColumn())
            Dim last As Rect = CellRect(SelectionLastRow(), SelectionLastColumn())
            Return New Rect(first.X, first.Y, last.Right - first.X, last.Bottom - first.Y)
        End Function

        Private Function GridRect(size As Size) As Rect
            Dim origin As Point = GridOrigin
            Dim width As Double = size.Width - origin.X
            Dim height As Double = size.Height - origin.Y
            Return New Rect(origin.X, origin.Y, If(width < 0, 0.0, width), If(height < 0, 0.0, height))
        End Function

        Private Function BarRect(size As Size) As Rect
            Return New Rect(0, 0, size.Width, BarHeight)
        End Function

        Private Function BarNameRect(size As Size) As Rect
            Dim width As Double = If(ShowHeaders, HeaderWidth, 0.0)
            Return New Rect(0, 0, width, BarHeight)
        End Function

        Private Function BarInputRect(size As Size) As Rect
            Dim name As Rect = BarNameRect(size)
            Dim x As Double = name.Right
            Return New Rect(x, 0, size.Width - x, BarHeight)
        End Function

        ''' <summary>The autofill square, at the bottom-right of the selection.</summary>
        Private Function HandleRect() As Rect
            Dim selection As Rect = SelectionRect()
            Return New Rect(selection.Right - HandleSize / 2, selection.Bottom - HandleSize / 2,
                HandleSize, HandleSize)
        End Function

        Private Sub ClampScroll(size As Size)
            Dim grid As Rect = GridRect(size)
            If grid.Width <= 0 OrElse grid.Height <= 0 Then
                ' Not laid out yet (a XAML load, or a control in a collapsed parent). Nothing can be
                ' scrolled into view, and the arithmetic below would be nonsense — grid.Right is
                ' NEGATIVE here, which used to scroll the sheet sideways permanently.
                _scrollX = 0
                _scrollY = 0
                Return
            End If

            ' VB is case-INsensitive, so a local called contentWidth would shadow the ContentWidth()
            ' function and this would read as indexing a Double. The C# twin can afford that name; this
            ' one cannot.
            Dim fullWidth As Double = ContentWidth()
            Dim fullHeight As Double = ContentHeight()
            Dim maxX As Double = fullWidth - grid.Width
            Dim maxY As Double = fullHeight - grid.Height
            _scrollX = If(maxX <= 0, 0.0, Math.Min(_scrollX, maxX))
            _scrollY = If(maxY <= 0, 0.0, Math.Min(_scrollY, maxY))
            If _scrollX < 0 Then
                _scrollX = 0
            End If

            If _scrollY < 0 Then
                _scrollY = 0
            End If
        End Sub

        ''' <summary>Brings the active cell into view after a move, a jump or a selection from code.</summary>
        Private Sub ScrollToActive()
            Dim size As Size = Bounds.Size
            Dim grid As Rect = GridRect(size)
            If grid.Width <= 0 OrElse grid.Height <= 0 Then
                Return                      ' nothing to scroll into view before the first layout
            End If

            Dim cell As Rect = CellRect(_activeRow, _activeColumn)
            If cell.X < grid.X Then
                _scrollX -= grid.X - cell.X
            ElseIf cell.Right > grid.Right Then
                _scrollX += cell.Right - grid.Right
            End If

            If cell.Y < grid.Y Then
                _scrollY -= grid.Y - cell.Y
            ElseIf cell.Bottom > grid.Bottom Then
                _scrollY += cell.Bottom - grid.Bottom
            End If

            ClampScroll(size)
        End Sub

        ' ---- layout -----------------------------------------------------------------------------

        ''' <summary>The sheet's natural size: the headers plus the whole grid.</summary>
        Protected Overrides Function MeasureOverride(availableSize As Size) As Size
            Dim origin As Point = GridOrigin
            ' ContentWidth/ContentHeight, not Columns * ColumnWidth: a widened column makes the sheet wider,
            ' and measuring it as though it were not would leave the last columns clipped for good.
            Dim width As Double = origin.X + ContentWidth()
            Dim height As Double = origin.Y + ContentHeight()
            If Not Double.IsInfinity(availableSize.Width) AndAlso width > availableSize.Width Then
                width = availableSize.Width
            End If

            If Not Double.IsInfinity(availableSize.Height) AndAlso height > availableSize.Height Then
                height = availableSize.Height
            End If

            Return New Size(width, height)
        End Function

        ''' <summary>Nothing to arrange: the control draws everything and owns no children.</summary>
        Protected Overrides Function ArrangeOverride(finalSize As Size) As Size
            ClampScroll(finalSize)
            Return finalSize
        End Function

        ' ---- drawing ----------------------------------------------------------------------------

        ''' <summary>Paints the bar, the headers, the cells, the selection and the fill handle.</summary>
        Public Overrides Sub Render(context As DrawingContext)
            Dim size As Size = Bounds.Size
            If size.Width <= 1 OrElse size.Height <= 1 Then
                Return
            End If

            Dim gridBrush As New SolidColorBrush(GridColor)
            Dim headerBrush As New SolidColorBrush(HeaderBackColor)
            Dim headerTextBrush As New SolidColorBrush(HeaderTextColor)
            Dim cellBrush As New SolidColorBrush(CellBackColor)
            Dim textBrush As New SolidColorBrush(TextColor)
            Dim selectionBrush As New SolidColorBrush(SelectionColor)
            Dim selectionFill As New SolidColorBrush(SelectionFillColor)
            Dim grid As Rect = GridRect(size)

            context.FillRectangle(cellBrush, New Rect(size))

            Dim firstRow As Integer = VisibleFirstRow(grid)
            Dim lastRow As Integer = VisibleLastRow(grid)
            Dim firstColumn As Integer = VisibleFirstColumn(grid)
            Dim lastColumn As Integer = VisibleLastColumn(grid)

            ' CELL FILLS go down first — under the wash and under the grid lines, so a highlighted cell
            ' keeps its lines and still reads as selected when the selection is over it.
            Using context.PushClip(grid)
                For row As Integer = firstRow To lastRow
                    For column As Integer = firstColumn To lastColumn
                        Dim fill As Nullable(Of Color) = FillOf(row, column)
                        If Not fill.HasValue Then
                            Continue For
                        End If

                        context.FillRectangle(New SolidColorBrush(fill.Value), CellRect(row, column))
                    Next
                Next
            End Using

            ' The wash goes down before the grid lines, so the lines still read through a selection.
            Dim selection As Rect = SelectionRect()
            Dim visibleSelection As Rect = selection.Intersect(grid)
            If visibleSelection.Width > 0 AndAlso visibleSelection.Height > 0 Then
                context.FillRectangle(selectionFill, visibleSelection)
            End If

            ' Cells: the grid lines, then the text.
            Using context.PushClip(grid)
                Dim gridPen As New Pen(gridBrush, 1.0)
                For row As Integer = firstRow To lastRow + 1
                    Dim y As Double = CellRect(row, 1).Y
                    If y >= grid.Y - 0.5 AndAlso y <= grid.Bottom + 0.5 Then
                        context.DrawLine(gridPen, New Point(grid.X, y), New Point(grid.Right, y))
                    End If
                Next

                For column As Integer = firstColumn To lastColumn + 1
                    Dim x As Double = CellRect(1, column).X
                    If x >= grid.X - 0.5 AndAlso x <= grid.Right + 0.5 Then
                        context.DrawLine(gridPen, New Point(x, grid.Y), New Point(x, grid.Bottom))
                    End If
                Next

                For row As Integer = firstRow To lastRow
                    For column As Integer = firstColumn To lastColumn
                        ' The cell being edited IN PLACE, if this is it. Its text lives in _editText until
                        ' the edit is committed, so drawing GetCell() here would show the old value — and
                        ' SKIPPING it (which is what this did until 2026-09-26) drew nothing at all, so
                        ' typing looked invisible until the cell lost focus.
                        Dim inPlaceEdit As Boolean = _editing AndAlso Not _barFocused AndAlso
                            row = _activeRow AndAlso column = _activeColumn
                        Dim text As String = If(inPlaceEdit, _editText, GetCell(row, column))
                        If text.Length = 0 AndAlso Not inPlaceEdit Then
                            Continue For
                        End If

                        ' This cell's own formatting, all of it "unset means the sheet's own".
                        Dim cell As SheetCell = FindCell(row, column)
                        Dim align As SheetAlign = AlignOf(cell)
                        If inPlaceEdit Then
                            ' Left while typing, the way every spreadsheet does it — a number should not
                            ' jump about as it becomes numeric — but a column the user aligned by hand
                            ' stays where they put it.
                            Dim editingAlign As TextAlignment = If(align = SheetAlign.Auto,
                                TextAlignment.Left, ToTextAlignment(align))
                            DrawCellText(context, text, CellRect(row, column), TextBrushOf(cell, textBrush),
                                False, editingAlign, _caret, TypefaceFor(cell), SizeOf(cell))
                            Continue For
                        End If

                        Dim numeric As Boolean = LooksNumeric(text) AndAlso align = SheetAlign.Auto
                        DrawCellText(context, text, CellRect(row, column), TextBrushOf(cell, textBrush),
                            numeric, ToTextAlignment(align), -1, TypefaceFor(cell), SizeOf(cell))
                    Next
                Next
            End Using

            DrawHeaders(context, size, headerBrush, headerTextBrush, grid, selection)
            DrawSelectionOutline(context, selectionBrush, grid)
            DrawFormulaBar(context, size, headerBrush, headerTextBrush, textBrush, selectionBrush)
            If Not AllowEditing Then
                DrawScrollBars(context, size)
                Return
            End If

            ' The fill handle, unless the selection is the whole sheet (nothing to fill into).
            If Not _selectAll AndAlso Not _draggingFill Then
                Dim handle As Rect = HandleRect()
                If grid.Contains(handle.Center) Then
                    context.FillRectangle(selectionBrush, handle)
                End If
            End If

            ' Last of all, over everything including the scrollbars: the right-click menu, if it is open.
            DrawScrollBars(context, size)
            DrawContextMenu(context)
        End Sub

        ''' <summary>Draws the frozen headers, with the selected rows/columns lit up.</summary>
        Private Sub DrawHeaders(context As DrawingContext, size As Size, back As IBrush, text As IBrush,
            grid As Rect, selection As Rect)
            If Not ShowHeaders Then
                Return
            End If

            Dim columnHeader As New Rect(GridOrigin.X, GridOrigin.Y - HeaderHeight, size.Width, HeaderHeight)
            Dim rowHeader As New Rect(0, GridOrigin.Y, HeaderWidth, size.Height)
            Dim corner As New Rect(0, GridOrigin.Y - HeaderHeight, HeaderWidth, HeaderHeight)

            Using context.PushClip(columnHeader)
                context.FillRectangle(back, columnHeader)
                Dim highlighted As Rect = ColumnHighlight(selection)
                context.FillRectangle(New SolidColorBrush(SelectionFillColor), highlighted)
                For column As Integer = VisibleFirstColumn(grid) To VisibleLastColumn(grid)
                    ' Each letter is centred in ITS OWN column, which is not the sheet's ColumnWidth once
                    ' one has been dragged.
                    Dim rect As New Rect(CellRect(1, column).X, columnHeader.Y, ColumnWidthOf(column), HeaderHeight)
                    DrawCellText(context, ColumnName(column), rect, text, False, TextAlignment.Center)
                Next
            End Using

            context.DrawLine(New Pen(New SolidColorBrush(GridColor), 1.0),
                New Point(0, corner.Bottom), New Point(size.Width, corner.Bottom))

            Using context.PushClip(rowHeader)
                context.FillRectangle(back, rowHeader)
                Dim highlighted As Rect = RowHighlight(selection)
                context.FillRectangle(New SolidColorBrush(SelectionFillColor), highlighted)
                For row As Integer = VisibleFirstRow(grid) To VisibleLastRow(grid)
                    Dim rect As New Rect(0, CellRect(row, 1).Y, HeaderWidth, RowHeightOf(row))
                    DrawCellText(context, row.ToString(CultureInfo.InvariantCulture), rect, text, False,
                        TextAlignment.Center)
                Next
            End Using

            context.FillRectangle(back, corner)
            context.DrawLine(New Pen(New SolidColorBrush(GridColor), 1.0),
                New Point(HeaderWidth, corner.Y), New Point(HeaderWidth, corner.Bottom))
            context.DrawLine(New Pen(New SolidColorBrush(GridColor), 1.0),
                New Point(corner.X, corner.Bottom), New Point(corner.Right, corner.Bottom))
        End Sub

        ''' <summary>The bit of the column header that belongs to the selected columns.</summary>
        Private Function ColumnHighlight(selection As Rect) As Rect
            If Not _wholeColumns AndAlso Not _selectAll Then
                Return New Rect(0, 0, 0, 0)
            End If

            Dim first As Rect = CellRect(1, SelectionFirstColumn())
            Dim last As Rect = CellRect(1, SelectionLastColumn())
            Return New Rect(first.X, GridOrigin.Y - HeaderHeight, last.Right - first.X, HeaderHeight)
        End Function

        ''' <summary>The bit of the row header that belongs to the selected rows.</summary>
        Private Function RowHighlight(selection As Rect) As Rect
            If Not _wholeRows AndAlso Not _selectAll Then
                Return New Rect(0, 0, 0, 0)
            End If

            Dim first As Rect = CellRect(SelectionFirstRow(), 1)
            Dim last As Rect = CellRect(SelectionLastRow(), 1)
            Return New Rect(0, first.Y, HeaderWidth, last.Bottom - first.Y)
        End Function

        ''' <summary>Draws the selection box, the active cell and the fill preview.</summary>
        Private Sub DrawSelectionOutline(context As DrawingContext, brush As IBrush, grid As Rect)
            Dim pen As New Pen(brush, 2.0)
            Dim selection As Rect = SelectionRect()
            Using context.PushClip(grid)
                Dim top As Double = Math.Max(selection.Y, grid.Y)
                Dim bottom As Double = Math.Min(selection.Bottom, grid.Bottom)
                Dim left As Double = Math.Max(selection.X, grid.X)
                Dim right As Double = Math.Min(selection.Right, grid.Right)
                If _wholeColumns OrElse _selectAll Then
                    top = grid.Y
                End If

                If _wholeRows OrElse _selectAll Then
                    left = grid.X
                End If

                context.DrawRectangle(Nothing, pen, New Rect(left, top, right - left, bottom - top))
                If _draggingFill AndAlso HasFillTarget() Then
                    Dim preview As Rect = PreviewRect()
                    context.DrawRectangle(Nothing, New Pen(brush, 1.0, New DashStyle(New Double() {4, 3}, 0)), preview)
                End If
            End Using
        End Sub

        ''' <summary>Draws the formula bar: the address box and the fx input.</summary>
        Private Sub DrawFormulaBar(context As DrawingContext, size As Size, back As IBrush, headerText As IBrush,
            text As IBrush, accent As IBrush)
            If Not ShowFormulaBar Then
                Return
            End If

            Dim bar As Rect = BarRect(size)
            context.FillRectangle(back, bar)
            context.DrawLine(New Pen(New SolidColorBrush(GridColor), 1.0),
                New Point(0, bar.Bottom - 0.5), New Point(size.Width, bar.Bottom - 0.5))

            Dim name As Rect = BarNameRect(size)
            DrawCellText(context, ActiveCellName, name, headerText, False, TextAlignment.Center)

            Dim input As Rect = BarInputRect(size)
            context.DrawLine(New Pen(New SolidColorBrush(GridColor), 1.0),
                New Point(input.X, bar.Y + 2), New Point(input.X, bar.Bottom - 2))
            DrawCellText(context, "fx", New Rect(input.X, bar.Y, 22, bar.Height), headerText, False,
                TextAlignment.Center)

            Dim box As New Rect(input.X + 22, bar.Y, Math.Max(0, input.Width - 22), bar.Height)
            Dim shown As String = If(_editing AndAlso _barFocused, _editText, SelectedText())
            If _editing AndAlso _barFocused Then
                DrawCellText(context, shown, box, text, False, TextAlignment.Left, _caret)
            Else
                DrawCellText(context, shown, box, text, False, TextAlignment.Left)

                ' A light border on the address box is the cue that it can be clicked to type there.
                context.DrawRectangle(Nothing, New Pen(accent, 1.0), New Rect(0.5, 0.5, name.Width, name.Height - 1))
            End If
        End Sub

        ''' <summary>
        ''' Draws one line of text, vertically centred, clipped to its rectangle. <paramref name="caret"/>
        ''' is the index to draw the edit caret at, or -1 for no caret. Centred text is used by the
        ''' headers, left by the cells and numbers, and numbers are right-aligned like every other
        ''' spreadsheet.
        ''' </summary>
        Private Sub DrawCellText(context As DrawingContext, text As String, rect As Rect, brush As IBrush,
            rightAligned As Boolean, align As Nullable(Of TextAlignment), Optional caret As Integer = -1,
            Optional typeface As Nullable(Of Typeface) = Nothing, Optional size As Double = 0)
            If text.Length = 0 AndAlso caret < 0 Then
                Return
            End If

            ' Typeface is a STRUCT in Avalonia 12, so VB cannot null-coalesce it the way the C# twin does —
            ' the two-argument If wants a reference or a nullable on the left, which is why this asks
            ' HasValue instead.
            Dim font As Typeface = If(typeface.HasValue, typeface.Value, TypefaceFor())
            Dim emSize As Double = If(size > 0, size, FontSize)
            Dim formatted As New FormattedText(text, CultureInfo.CurrentCulture, FlowDirection.LeftToRight,
                font, emSize, brush)
            Dim inner As New Rect(rect.X + 3, rect.Y, rect.Width - 6, rect.Height)
            If inner.Width <= 0 Then
                Return
            End If

            Using context.PushClip(inner)
                Dim y As Double = rect.Y + (rect.Height - formatted.Height) / 2
                Dim x As Double = inner.X
                If align = TextAlignment.Center Then
                    x = inner.X + (inner.Width - formatted.Width) / 2
                ElseIf rightAligned AndAlso (Not align.HasValue OrElse align = TextAlignment.Right) Then
                    x = inner.Right - formatted.Width
                End If

                ' Keep the caret in view while the text is longer than the box it is edited in.
                If caret >= 0 Then
                    Dim upToCaret As New FormattedText(text.Substring(0, caret), CultureInfo.CurrentCulture,
                        FlowDirection.LeftToRight, font, emSize, brush)
                    If x + upToCaret.Width > inner.Right Then
                        x -= x + upToCaret.Width - inner.Right
                    End If

                    context.DrawText(formatted, New Point(x, y))
                    Dim caretX As Double = x + upToCaret.Width
                    context.DrawLine(New Pen(brush, 1.0), New Point(caretX, rect.Y + 2),
                        New Point(caretX, rect.Bottom - 2))
                    Return
                End If

                context.DrawText(formatted, New Point(x, y))
            End Using
        End Sub

        Private Function TypefaceFor(Optional cell As SheetCell = Nothing) As Typeface
            Dim name As String = If(cell IsNot Nothing AndAlso Not String.IsNullOrEmpty(cell.FontFamily),
                cell.FontFamily, FontFamilyName)
            Dim family As FontFamily = If(String.IsNullOrEmpty(name), FontFamily.Default, New FontFamily(name))
            Dim weight As FontWeight = If(cell IsNot Nothing AndAlso cell.Bold, FontWeight.Bold, FontWeight.Normal)
            Dim style As FontStyle = If(cell IsNot Nothing AndAlso cell.Italic, FontStyle.Italic, FontStyle.Normal)
            Return New Typeface(family, style, weight)
        End Function

        ''' <summary>The font size a cell is drawn at: its own, else the sheet's.</summary>
        Private Function SizeOf(cell As SheetCell) As Double
            Return If(cell IsNot Nothing AndAlso cell.FontSize > 0, cell.FontSize, FontSize)
        End Function

        ''' <summary>The brush a cell's text is drawn in: its own colour, else the sheet's.</summary>
        Private Shared Function TextBrushOf(cell As SheetCell, fallback As IBrush) As IBrush
            If cell Is Nothing OrElse Not cell.TextColor.HasValue Then
                Return fallback
            End If

            Return New SolidColorBrush(cell.TextColor.Value)
        End Function

        ''' <summary>A cell's highlight, or null when it has none.</summary>
        Private Function FillOf(row As Integer, column As Integer) As Nullable(Of Color)
            Dim cell As SheetCell = FindCell(row, column)
            If cell Is Nothing Then
                Return Nothing
            End If

            Return cell.Fill
        End Function

        Private Shared Function AlignOf(cell As SheetCell) As SheetAlign
            Return If(cell Is Nothing, SheetAlign.Auto, cell.TextAlign)
        End Function

        ''' <summary>The sheet's alignment for a cell, or null to leave it to the caller's rule
        ''' (numbers right, everything else left).</summary>
        Private Shared Function ToTextAlignment(align As SheetAlign) As Nullable(Of TextAlignment)
            If align = SheetAlign.Left Then
                Return TextAlignment.Left
            End If

            If align = SheetAlign.Center Then
                Return TextAlignment.Center
            End If

            If align = SheetAlign.Right Then
                Return TextAlignment.Right
            End If

            Return Nothing
        End Function

        ''' <summary>True when the text reads as a number, so it is right-aligned.</summary>
        Private Shared Function LooksNumeric(text As String) As Boolean
            Dim value As Double
            Return TryNumber(text, value)
        End Function

        Private Shared Function TryNumber(text As String, ByRef value As Double) As Boolean
            value = 0.0
            If String.IsNullOrEmpty(text) Then
                Return False
            End If

            Return Double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, value)
        End Function

        ' ---- which rows and columns are on screen ----------------------------------------------

        Private Function VisibleFirstRow(grid As Rect) As Integer
            Return RowAt(grid.Y)
        End Function

        Private Function VisibleLastRow(grid As Rect) As Integer
            Return RowAt(grid.Bottom)
        End Function

        Private Function VisibleFirstColumn(grid As Rect) As Integer
            Return ColumnAt(grid.X)
        End Function

        Private Function VisibleLastColumn(grid As Rect) As Integer
            Return ColumnAt(grid.Right)
        End Function

        ' ---- the mouse --------------------------------------------------------------------------

        Private Const HitNothing As Integer = 0
        Private Const HitCell As Integer = 1
        Private Const HitColumnHeader As Integer = 2
        Private Const HitRowHeader As Integer = 3
        Private Const HitCorner As Integer = 4
        Private Const HitHandle As Integer = 5
        Private Const HitBar As Integer = 6
        Private Const HitColumnResize As Integer = 7
        Private Const HitRowResize As Integer = 8
        Private Const HitVScrollThumb As Integer = 9
        Private Const HitVScrollTrack As Integer = 10
        Private Const HitHScrollThumb As Integer = 11
        Private Const HitHScrollTrack As Integer = 12

        ''' <summary>What is under a point, and which cell it belongs to.</summary>
        Private Function HitTest(point As Point, ByRef row As Integer, ByRef column As Integer) As Integer
            row = 1
            column = 1
            Dim size As Size = Bounds.Size
            Dim grid As Rect = GridRect(size)
            Dim bar As Double = If(ShowFormulaBar, BarHeight, 0.0)
            If ShowFormulaBar AndAlso point.Y < bar Then
                ' The fx box is a real input — clicking it edits the active cell up there. The address
                ' box is not (it only shows where you are), so a click on it does nothing.
                Return If(point.X >= BarNameRect(size).Right, HitBar, HitNothing)
            End If

            If ShowHeaders Then
                Dim headerTop As Double = bar
                Dim headerBottom As Double = bar + HeaderHeight
                If point.Y >= headerTop AndAlso point.Y < headerBottom Then
                    If point.X < HeaderWidth Then
                        Return HitCorner
                    End If

                    ' A border between two columns — checked BEFORE the header itself, so a press on the
                    ' edge resizes instead of selecting the column the edge belongs to.
                    Dim resizing As Integer = ColumnBorderAt(point.X)
                    If resizing > 0 Then
                        column = resizing
                        Return HitColumnResize
                    End If

                    column = ColumnAt(point.X)
                    Return HitColumnHeader
                End If

                If point.X < HeaderWidth Then
                    Dim resizingRow As Integer = RowBorderAt(point.Y)
                    If resizingRow > 0 Then
                        row = resizingRow
                        Return HitRowResize
                    End If

                    row = RowAt(point.Y)
                    Return HitRowHeader
                End If
            End If

            If Not grid.Contains(point) Then
                Return HitNothing
            End If

            ' The scrollbars are drawn over the grid, so they are hit first — otherwise the last column's
            ' cells would be under an unreachable bar.
            Dim vTrack As Rect = VScrollRect(size)
            If vTrack.Contains(point) Then
                Return If(VScrollThumb(size).Contains(point), HitVScrollThumb, HitVScrollTrack)
            End If

            Dim hTrack As Rect = HScrollRect(size)
            If hTrack.Contains(point) Then
                Return If(HScrollThumb(size).Contains(point), HitHScrollThumb, HitHScrollTrack)
            End If

            row = RowAt(point.Y)
            column = ColumnAt(point.X)
            If Not _selectAll AndAlso Math.Abs(point.X - HandleRect().Center.X) <= HandleSize AndAlso
                Math.Abs(point.Y - HandleRect().Center.Y) <= HandleSize Then
                Return HitHandle
            End If

            Return HitCell
        End Function

        Private Function RowAt(y As Double) As Integer
            Return RowAtOffset(y - GridOrigin.Y + _scrollY)
        End Function

        Private Function ColumnAt(x As Double) As Integer
            Return ColumnAtOffset(x - GridOrigin.X + _scrollX)
        End Function

        ''' <summary>
        ''' The column whose RIGHT border the pointer is within ResizeGrip of, or 0. The border belongs to
        ''' the column on its left, which is the one a drag resizes — and the last column's right edge
        ''' counts too, that being how you widen the last one.
        ''' </summary>
        Private Function ColumnBorderAt(x As Double) As Integer
            Dim origin As Double = GridOrigin.X - _scrollX
            For column As Integer = 1 To ColumnCount
                If Math.Abs(x - (origin + ColumnOffset(column + 1))) <= ResizeGrip Then
                    Return column
                End If
            Next

            Return 0
        End Function

        ''' <summary>The row whose BOTTOM border the pointer is on, or 0 — see ColumnBorderAt.</summary>
        Private Function RowBorderAt(y As Double) As Integer
            Dim origin As Double = GridOrigin.Y - _scrollY
            For row As Integer = 1 To RowCount
                If Math.Abs(y - (origin + RowOffset(row + 1))) <= ResizeGrip Then
                    Return row
                End If
            Next

            Return 0
        End Function

        ''' <summary>The cursor a hit calls for: the only sign that a header edge can be dragged at all.</summary>
        Private Shared Function CursorFor(hit As Integer) As StandardCursorType
            If hit = HitColumnResize Then
                Return StandardCursorType.SizeWestEast
            End If

            Return If(hit = HitRowResize, StandardCursorType.SizeNorthSouth, StandardCursorType.Arrow)
        End Function

        Private Sub SetCursor(wanted As StandardCursorType)
            If _cursor = wanted Then
                Return
            End If

            _cursor = wanted
            Cursor = New Cursor(wanted)
        End Sub

        ''' <summary>Back to the arrow when the pointer leaves, whatever it was showing.</summary>
        Protected Overrides Sub OnPointerExited(e As PointerEventArgs)
            SetCursor(StandardCursorType.Arrow)
            MyBase.OnPointerExited(e)
        End Sub

        ''' <summary>Starts a selection, a fill, or an edit.</summary>
        Protected Overrides Sub OnPointerPressed(e As PointerPressedEventArgs)
            Dim point As PointerPoint = e.GetCurrentPoint(Me)

            ' A press while the menu is open belongs to the menu: inside it chooses a line, outside it just
            ' closes. Either way the press does not also start a selection or a drag.
            If _menuOpen AndAlso Not point.Properties.IsRightButtonPressed Then
                ChooseMenuItem(point.Position)
                e.Handled = True
                Return
            End If

            ' The right button opens the menu HERE rather than being left to ContextRequested, which never
            ' reached this control (reported 2026-09-26: the menu existed, its items worked when invoked,
            ' and right-clicking opened nothing at all). Doing it here also lets the menu move the selection
            ' onto whatever was right-clicked first, which is what every spreadsheet does.
            If point.Properties.IsRightButtonPressed Then
                CloseContextMenu()
                ShowContextMenu(point.Position)
                e.Handled = True
                Return
            End If

            If Not point.Properties.IsLeftButtonPressed Then
                Return
            End If

            Focus()
            Dim row As Integer
            Dim column As Integer
            Dim hit As Integer = HitTest(point.Position, row, column)
            If hit = HitNothing Then
                Return
            End If

            If hit = HitBar Then
                BeginEdit(SelectedText(), False, True)
                e.Handled = True
                Return
            End If

            If _editing AndAlso (row <> _activeRow OrElse column <> _activeColumn) Then
                CommitEdit(True)
            End If

            e.Pointer.Capture(Me)
            Dim extend As Boolean = e.KeyModifiers.HasFlag(KeyModifiers.Shift)

            ' Dragging a scrollbar's thumb, or jumping when its track is clicked.
            If hit = HitVScrollThumb OrElse hit = HitHScrollThumb Then
                _scrollDragging = True
                _scrollDragVertical = hit = HitVScrollThumb
                _scrollDragStart = If(_scrollDragVertical, point.Position.Y, point.Position.X)
                _scrollDragStartOffset = If(_scrollDragVertical, _scrollY, _scrollX)
                e.Handled = True
                Return
            End If

            If hit = HitVScrollTrack Then
                ScrollTrackTo(Bounds.Size, True, point.Position.Y)
                _scrollDragging = True
                _scrollDragVertical = True
                _scrollDragStart = point.Position.Y
                _scrollDragStartOffset = _scrollY
                e.Handled = True
                Return
            End If

            If hit = HitHScrollTrack Then
                ScrollTrackTo(Bounds.Size, False, point.Position.X)
                _scrollDragging = True
                _scrollDragVertical = False
                _scrollDragStart = point.Position.X
                _scrollDragStartOffset = _scrollX
                e.Handled = True
                Return
            End If

            ' Dragging a header border to size a column or a row. This comes before everything the headers
            ' normally do, because the press is ON the header strip.
            If hit = HitColumnResize Then
                _resizeColumn = column
                _resizeStartSize = ColumnWidthOf(column)
                _resizeStartX = point.Position.X
                e.Handled = True
                Return
            End If

            If hit = HitRowResize Then
                _resizeRow = row
                _resizeStartSize = RowHeightOf(row)
                _resizeStartY = point.Position.Y
                e.Handled = True
                Return
            End If

            If hit = HitCorner Then
                SelectAll()
                e.Handled = True
                Return
            End If

            If hit = HitColumnHeader Then
                SelectColumns(column, extend)
                _draggingSelection = True
                e.Handled = True
                Return
            End If

            If hit = HitRowHeader Then
                SelectRows(row, extend)
                _draggingSelection = True
                e.Handled = True
                Return
            End If

            If hit = HitHandle Then
                BeginFillDrag(row, column)
                e.Handled = True
                Return
            End If

            If e.ClickCount = 2 AndAlso AllowEditing Then
                _activeRow = row
                _activeColumn = column
                BeginEdit(GetCell(row, column), False, False)
                e.Handled = True
                Return
            End If

            If extend Then
                _wholeColumns = False
                _wholeRows = False
                _selectAll = False
                _activeRow = row
                _activeColumn = column
            Else
                SelectCell(row, column)
            End If

            _draggingSelection = True
            RaiseSelectionChanged()
            InvalidateVisual()
            e.Handled = True
        End Sub

        ''' <summary>Extends the selection, moves a border, drags a scrollbar, or moves the fill preview.</summary>
        Protected Overrides Sub OnPointerMoved(e As PointerEventArgs)
            Dim point As Point = e.GetCurrentPoint(Me).Position
            Dim row As Integer
            Dim column As Integer
            Dim hit As Integer = HitTest(point, row, column)

            ' While the menu is open a move only highlights the line under the pointer.
            If _menuOpen Then
                Dim hot As Integer = MenuItemAt(point)
                If hot <> _menuHot Then
                    _menuHot = hot
                    InvalidateVisual()
                End If

                Return
            End If

            ' Dragging a scrollbar: the pointer's travel along the track, scaled to the scroll range.
            If _scrollDragging Then
                Dim size As Size = Bounds.Size
                Dim travel As Double = 0.0
                Dim maxOffset As Double = 0.0
                TrackSpan(size, _scrollDragVertical, travel, maxOffset)
                Dim moved As Double = If(_scrollDragVertical, point.Y, point.X) - _scrollDragStart
                ScrollThumbTo(size, _scrollDragVertical, _scrollDragStartOffset + moved / travel * maxOffset)
                e.Handled = True
                Return
            End If

            ' Resizing: the pointer's distance from where the drag started is the whole calculation, and
            ' Apply* clamps and rounds it. Nothing is announced until the mouse comes up (see release).
            If _resizeColumn > 0 Then
                ApplyColumnWidth(_resizeColumn, _resizeStartSize + (point.X - _resizeStartX))
                e.Handled = True
                Return
            End If

            If _resizeRow > 0 Then
                ApplyRowHeight(_resizeRow, _resizeStartSize + (point.Y - _resizeStartY))
                e.Handled = True
                Return
            End If

            If Not _draggingSelection AndAlso Not _draggingFill Then
                ' Nothing is being dragged, so the only thing a move does is show whether the edge under
                ' the pointer can be dragged.
                SetCursor(CursorFor(hit))
                Return
            End If

            If hit = HitNothing Then
                Return
            End If

            If _draggingFill Then
                _fillRow = row
                _fillColumn = column
                InvalidateVisual()
                e.Handled = True
                Return
            End If

            If _wholeColumns Then
                _activeColumn = ClampColumn(column)
            ElseIf _wholeRows Then
                _activeRow = ClampRow(row)
            Else
                _activeRow = ClampRow(row)
                _activeColumn = ClampColumn(column)
            End If

            ScrollToActive()
            RaiseSelectionChanged()
            InvalidateVisual()
            e.Handled = True
        End Sub

        ''' <summary>Ends the drag: applies a fill, or leaves the selection where it is.</summary>
        Protected Overrides Sub OnPointerReleased(e As PointerReleasedEventArgs)
            Dim wasFill As Boolean = _draggingFill
            Dim resizedColumn As Integer = _resizeColumn
            Dim resizedRow As Integer = _resizeRow
            Dim resizeStartSize As Double = _resizeStartSize
            _draggingSelection = False
            _draggingFill = False
            _resizeColumn = 0
            _resizeRow = 0
            _scrollDragging = False
            e.Pointer.Capture(Nothing)
            If wasFill Then
                ApplyFill()
            End If

            ' Now that the mouse is up, say so — once, with the size it ended on. A form can save the widths
            ' here and get them back from ColumnWidths/RowHeights next run.
            If resizedColumn > 0 AndAlso Math.Abs(ColumnWidthOf(resizedColumn) - resizeStartSize) > 0.01 Then
                RaiseSizeChanged(resizedColumn, 0, ColumnWidthOf(resizedColumn))
            End If

            If resizedRow > 0 AndAlso Math.Abs(RowHeightOf(resizedRow) - resizeStartSize) > 0.01 Then
                RaiseSizeChanged(0, resizedRow, RowHeightOf(resizedRow))
            End If

            SetCursor(StandardCursorType.Arrow)
            InvalidateVisual()
        End Sub

        ''' <summary>Scrolling: the wheel moves three rows or three columns, Shift makes it sideways, and
        ''' when there is nothing to scroll VERTICALLY the wheel goes sideways instead — otherwise the
        ''' columns off to the right are unreachable with an ordinary mouse.</summary>
        Protected Overrides Sub OnPointerWheelChanged(e As PointerWheelEventArgs)
            ' A menu that stayed put while the sheet scrolled under it would be pointing at nothing.
            CloseContextMenu()
            Dim size As Size = Bounds.Size
            Dim grid As Rect = GridRect(size)
            Dim vertical As Double = e.Delta.Y
            If vertical <> 0 AndAlso ContentHeight() <= grid.Height + 0.5 Then
                ' A sheet that is wide but not tall: a plain wheel has no rows to move, so it moves the
                ' columns. This is what every browser does with a wheel over a horizontally scrolling box.
                _scrollX -= vertical * ColumnWidth * 3
            ElseIf e.KeyModifiers.HasFlag(KeyModifiers.Shift) Then
                _scrollX -= vertical * ColumnWidth
            Else
                _scrollY -= vertical * RowHeight * 3
                _scrollX -= e.Delta.X * ColumnWidth * 3
            End If

            ClampScroll(size)
            InvalidateVisual()
            e.Handled = True
        End Sub

        Private Sub SelectColumns(column As Integer, extend As Boolean)
            _selectAll = False
            _wholeRows = False
            _wholeColumns = True
            If Not extend Then
                _anchorColumn = ClampColumn(column)
            End If

            _activeColumn = ClampColumn(column)
            _activeRow = 1
            CommitEdit(False)
            RaiseSelectionChanged()
            InvalidateVisual()
        End Sub

        Private Sub SelectRows(row As Integer, extend As Boolean)
            _selectAll = False
            _wholeColumns = False
            _wholeRows = True
            If Not extend Then
                _anchorRow = ClampRow(row)
            End If

            _activeRow = ClampRow(row)
            _activeColumn = 1
            CommitEdit(False)
            RaiseSelectionChanged()
            InvalidateVisual()
        End Sub

        ' ---- the keyboard -----------------------------------------------------------------------

        ''' <summary>Grid navigation, and the editor's own keys when one is open.</summary>
        Protected Overrides Sub OnKeyDown(e As KeyEventArgs)
            Dim shift As Boolean = e.KeyModifiers.HasFlag(KeyModifiers.Shift)
            Dim control As Boolean = e.KeyModifiers.HasFlag(KeyModifiers.Control)

            ' The menu owns the keyboard while it is open (Escape, the arrows, Enter).
            If HandleMenuKey(e) Then
                e.Handled = True
                Return
            End If

            If _editing Then
                If HandleEditKey(e, shift) Then
                    e.Handled = True
                End If

                Return
            End If

            If control AndAlso e.Key = Key.A Then
                SelectAll()
                e.Handled = True
                Return
            End If

            ' Ctrl+B / Ctrl+I style the selection, the way every spreadsheet does.
            If control AndAlso e.Key = Key.B Then
                ToggleBoldSelection()
                e.Handled = True
                Return
            End If

            If control AndAlso e.Key = Key.I Then
                ToggleItalicSelection()
                e.Handled = True
                Return
            End If

            If control AndAlso e.Key = Key.U AndAlso AllowEditing Then
                BeginEditInBar()
                e.Handled = True
                Return
            End If

            If e.Key = Key.F2 AndAlso AllowEditing Then
                BeginEdit()
                e.Handled = True
                Return
            End If

            If e.Key = Key.Delete OrElse e.Key = Key.Back Then
                ClearSelection()
                e.Handled = True
                Return
            End If

            If e.Key = Key.Escape Then
                _draggingFill = False
                InvalidateVisual()
                e.Handled = True
                Return
            End If

            If e.Key = Key.Left Then
                MoveWithControl(0, -1, shift, control)
                e.Handled = True
                Return
            End If

            If e.Key = Key.Right Then
                MoveWithControl(0, 1, shift, control)
                e.Handled = True
                Return
            End If

            If e.Key = Key.Up Then
                MoveWithControl(-1, 0, shift, control)
                e.Handled = True
                Return
            End If

            If e.Key = Key.Down Then
                MoveWithControl(1, 0, shift, control)
                e.Handled = True
                Return
            End If

            If e.Key = Key.PageUp Then
                MoveActive(-10, 0, shift)
                e.Handled = True
                Return
            End If

            If e.Key = Key.PageDown Then
                MoveActive(10, 0, shift)
                e.Handled = True
                Return
            End If

            If e.Key = Key.Home Then
                If control Then
                    MoveActive(1 - _activeRow, 1 - _activeColumn, shift)
                Else
                    MoveActive(0, 1 - _activeColumn, shift)
                End If

                e.Handled = True
                Return
            End If

            ' Ctrl+End: the bottom-right corner of what is IN the sheet, the way every spreadsheet does it.
            If e.Key = Key.End AndAlso control Then
                Dim last As CellAddress = LastUsedCell()
                MoveActive(last.Row - _activeRow, last.Column - _activeColumn, shift)
                e.Handled = True
                Return
            End If

            If e.Key = Key.Enter Then
                MoveActive(If(shift, -1, 1), 0, False)
                e.Handled = True
                Return
            End If

            If e.Key = Key.Tab Then
                MoveActive(0, If(shift, -1, 1), False)
                e.Handled = True
            End If
        End Sub

        ''' <summary>Typing replaces the active cell — the fastest way into a sheet.</summary>
        Protected Overrides Sub OnTextInput(e As TextInputEventArgs)
            If Not AllowEditing OrElse String.IsNullOrEmpty(e.Text) Then
                Return
            End If

            Dim text As String = e.Text
            Dim usable As Boolean = True
            For i As Integer = 0 To text.Length - 1
                If Char.IsControl(text(i)) Then
                    usable = False
                    Exit For
                End If
            Next

            If Not usable Then
                Return
            End If

            ' The editor is already open — clicked into the cell, F2, or by the first character of this very
            ' word — so this character goes IN at the caret. It used to be dropped on the floor:
            ' InsertIntoEdit was written for exactly this and never called, so typing a word into a cell
            ' kept only its first letter (found 2026-09-26, with the missing in-cell editor drawing).
            If _editing Then
                InsertIntoEdit(text)
                e.Handled = True
                Return
            End If

            BeginEdit(text, True, False)
            e.Handled = True
        End Sub

        ''' <summary>Commits what is being edited if the sheet loses the keyboard. Subscribed in the
        ''' constructor rather than overridden: Avalonia 12 does not expose an overridable
        ''' OnLostFocus with this signature.</summary>
        Private Sub OnSheetLostFocus(sender As Object, e As Avalonia.Interactivity.RoutedEventArgs)
            CommitEdit(True)
            CloseContextMenu()
        End Sub

        ''' <summary>A cell's address, for the couple of places that return one.</summary>
        Private Structure CellAddress
            ''' <summary>The one-based row.</summary>
            Public Row As Integer

            ''' <summary>The one-based column.</summary>
            Public Column As Integer

            Public Sub New(row As Integer, column As Integer)
                Me.Row = row
                Me.Column = column
            End Sub
        End Structure

        ''' <summary>
        ''' An arrow key: one cell on its own, or — with Ctrl — the far end of the block of filled cells in
        ''' that direction, which is how a spreadsheet is actually driven around a large sheet (Ctrl+Down
        ''' from the top of a column lands on the last value in it).
        ''' </summary>
        Private Sub MoveWithControl(rowDelta As Integer, columnDelta As Integer, extend As Boolean, control As Boolean)
            If Not control Then
                MoveActive(rowDelta, columnDelta, extend)
                Return
            End If

            ' Whether the cell NEXT to us is filled decides which rule applies: run to the end of a block
            ' of values, or skip a gap and land on the next value. The sheet edge is where either walk
            ' stops, so there is always somewhere to land.
            Dim filled As Boolean = GetCell(ClampRow(_activeRow + rowDelta),
                ClampColumn(_activeColumn + columnDelta)).Length > 0
            Dim atRow As Integer = _activeRow
            Dim atColumn As Integer = _activeColumn
            Do
                Dim nextRow As Integer = ClampRow(atRow + rowDelta)
                Dim nextColumn As Integer = ClampColumn(atColumn + columnDelta)
                If nextRow = atRow AndAlso nextColumn = atColumn Then
                    Exit Do                     ' the edge: nowhere further to go
                End If

                Dim nextFilled As Boolean = GetCell(nextRow, nextColumn).Length > 0
                If nextFilled <> filled Then
                    If Not filled Then
                        ' The gap ended: land ON the value that ended it.
                        atRow = nextRow
                        atColumn = nextColumn
                    End If

                    ' A block of values ends on its LAST cell, which is the one we are standing on.
                    Exit Do
                End If

                atRow = nextRow
                atColumn = nextColumn
            Loop

            MoveActive(atRow - _activeRow, atColumn - _activeColumn, extend)
        End Sub

        ''' <summary>The bottom-right corner of the cells that hold something, or A1 on an empty sheet.</summary>
        Private Function LastUsedCell() As CellAddress
            Dim row As Integer = 1
            Dim column As Integer = 1
            For i As Integer = 0 To _lookup.Count - 1
                Dim cell As SheetCell = _lookup(i)
                If GetCell(cell.Row, cell.Column).Length = 0 Then
                    Continue For
                End If

                If cell.Row > row Then
                    row = cell.Row
                End If

                If cell.Column > column Then
                    column = cell.Column
                End If
            Next

            Return New CellAddress(row, column)
        End Function

        ''' <summary>Moves the active cell by a delta, extending the selection when Shift is held.</summary>
        Private Sub MoveActive(rowDelta As Integer, columnDelta As Integer, extend As Boolean)
            Dim row As Integer = ClampRow(_activeRow + rowDelta)
            Dim column As Integer = ClampColumn(_activeColumn + columnDelta)
            If extend Then
                _wholeColumns = False
                _wholeRows = False
                _selectAll = False
            ElseIf _wholeColumns OrElse _wholeRows OrElse _selectAll Then
                _wholeColumns = False
                _wholeRows = False
                _selectAll = False
                _anchorRow = row
                _anchorColumn = column
            Else
                _anchorRow = row
                _anchorColumn = column
            End If

            _activeRow = row
            _activeColumn = column
            ScrollToActive()
            RaiseSelectionChanged()
            InvalidateVisual()
        End Sub

        ' ---- the editor -------------------------------------------------------------------------

        ''' <summary>Opens the editor on the active cell. <paramref name="replace"/> starts from scratch.</summary>
        Private Sub BeginEdit(text As String, replace As Boolean, inBar As Boolean)
            If Not AllowEditing Then
                Return
            End If

            _editing = True
            _barFocused = inBar
            _editIsNew = replace
            _editText = If(text, String.Empty)
            _caret = _editText.Length
            InvalidateVisual()
        End Sub

        ''' <summary>True when the fill drag is aiming somewhere it could actually fill.</summary>
        Private Function HasFillTarget() As Boolean
            Return _draggingFill AndAlso (_fillRow > SelectionLastRow() OrElse _fillColumn > SelectionLastColumn())
        End Function

        ''' <summary>The block the fill would write, for the dashed preview.</summary>
        Private Function PreviewRect() As Rect
            Dim first As Rect = CellRect(SelectionFirstRow(), SelectionFirstColumn())
            Dim lastRow As Integer = Math.Max(_fillRow, SelectionLastRow())
            Dim lastColumn As Integer = Math.Max(_fillColumn, SelectionLastColumn())
            Dim last As Rect = CellRect(lastRow, lastColumn)
            Return New Rect(first.X, first.Y, last.Right - first.X, last.Bottom - first.Y)
        End Function

        ''' <summary>Handles a key while an edit is open. True when it was one of ours.</summary>
        Private Function HandleEditKey(e As KeyEventArgs, shift As Boolean) As Boolean
            If e.Key = Key.Escape Then
                CommitEdit(False)
                Return True
            End If

            Dim control As Boolean = e.KeyModifiers.HasFlag(KeyModifiers.Control)
            If e.Key = Key.Enter Then
                CommitEdit(True)
                MoveActive(If(shift, -1, 1), 0, False)
                Return True
            End If

            If e.Key = Key.Tab Then
                CommitEdit(True)
                MoveActive(0, If(shift, -1, 1), False)
                Return True
            End If

            If e.Key = Key.Left Then
                If _caret > 0 Then
                    _caret -= 1
                End If

                InvalidateVisual()
                Return True
            End If

            If e.Key = Key.Right Then
                If _caret < _editText.Length Then
                    _caret += 1
                End If

                InvalidateVisual()
                Return True
            End If

            If e.Key = Key.Home Then
                _caret = 0
                InvalidateVisual()
                Return True
            End If

            If e.Key = Key.End Then
                _caret = _editText.Length
                InvalidateVisual()
                Return True
            End If

            If e.Key = Key.Back Then
                If _caret > 0 Then
                    _editText = _editText.Substring(0, _caret - 1) & _editText.Substring(_caret)
                    _caret -= 1
                End If

                InvalidateVisual()
                Return True
            End If

            If e.Key = Key.Delete Then
                If _caret < _editText.Length Then
                    _editText = _editText.Substring(0, _caret) & _editText.Substring(_caret + 1)
                End If

                InvalidateVisual()
                Return True
            End If

            If control AndAlso e.Key = Key.A Then
                _editText = String.Empty
                _caret = 0
                InvalidateVisual()
                Return True
            End If

            Return False
        End Function

        ''' <summary>Typing inside the editor inserts at the caret.</summary>
        Private Sub InsertIntoEdit(text As String)
            _editText = _editText.Substring(0, _caret) & text & _editText.Substring(_caret)
            _caret += text.Length
            InvalidateVisual()
        End Sub

        ''' <summary>
        ''' Ends the edit: writes the text into the active cell when <paramref name="keep"/> is true,
        ''' and simply drops it when it is false. Clearing the whole selection first is what makes a
        ''' new value replace every selected cell, as it does in a spreadsheet.
        ''' </summary>
        Private Sub CommitEdit(keep As Boolean)
            If Not _editing Then
                Return
            End If

            Dim text As String = _editText
            Dim replace As Boolean = _editIsNew
            _editing = False
            _barFocused = False
            _editText = String.Empty
            _caret = 0
            _editIsNew = False

            If keep Then
                If replace AndAlso (SelectionFirstRow() <> SelectionLastRow() OrElse
                                    SelectionFirstColumn() <> SelectionLastColumn()) Then
                    ClearSelection()
                End If

                SetCell(_activeRow, _activeColumn, text)
            End If

            InvalidateVisual()
        End Sub

        ' ---- autofill ---------------------------------------------------------------------------

        ''' <summary>Remembers the block the fill is copying from, and arms the drag.</summary>
        Private Sub BeginFillDrag(row As Integer, column As Integer)
            _draggingFill = True
            _fillSourceFirstRow = SelectionFirstRow()
            _fillSourceLastRow = SelectionLastRow()
            _fillSourceFirstColumn = SelectionFirstColumn()
            _fillSourceLastColumn = SelectionLastColumn()
            _fillRow = row
            _fillColumn = column
            InvalidateVisual()
        End Sub

        ''' <summary>Writes the predicted series into the area the handle was dragged over.</summary>
        Private Sub ApplyFill()
            Dim lastRow As Integer = SelectionLastRow()
            Dim lastColumn As Integer = SelectionLastColumn()
            If _fillRow > lastRow Then
                For column As Integer = _fillSourceFirstColumn To _fillSourceLastColumn
                    Dim source As String() = ReadColumn(column, _fillSourceFirstRow, _fillSourceLastRow)
                    Dim written As String() = PredictSeries(source, _fillRow - lastRow)
                    For i As Integer = 0 To written.Length - 1
                        SetCell(lastRow + 1 + i, column, written(i))
                    Next
                Next

                SelectRange(_fillSourceFirstRow, _fillSourceFirstColumn, _fillRow, lastColumn)
                Return
            End If

            If _fillColumn > lastColumn Then
                For row As Integer = _fillSourceFirstRow To _fillSourceLastRow
                    Dim source As String() = ReadRow(row, _fillSourceFirstColumn, _fillSourceLastColumn)
                    Dim written As String() = PredictSeries(source, _fillColumn - lastColumn)
                    For i As Integer = 0 To written.Length - 1
                        SetCell(row, lastColumn + 1 + i, written(i))
                    Next
                Next

                SelectRange(_fillSourceFirstRow, _fillSourceFirstColumn, lastRow, _fillColumn)
            End If
        End Sub

        Private Function ReadColumn(column As Integer, firstRow As Integer, lastRow As Integer) As String()
            Dim values As New List(Of String)()
            For row As Integer = firstRow To lastRow
                values.Add(GetCell(row, column))
            Next

            Return values.ToArray()
        End Function

        Private Function ReadRow(row As Integer, firstColumn As Integer, lastColumn As Integer) As String()
            Dim values As New List(Of String)()
            For column As Integer = firstColumn To lastColumn
                values.Add(GetCell(row, column))
            Next

            Return values.ToArray()
        End Function

        ''' <summary>
        ''' Works out what the next values should be, from the ones it was given: a run of numbers
        ''' continues by its step (1, 2 becomes 3, 4 …; 2, 4 becomes 6, 8 …), a single number counts
        ''' up by one, "Item1, Item2" becomes "Item3", and anything else repeats the pattern cyclically.
        ''' </summary>
        Private Shared Function PredictSeries(source As IReadOnlyList(Of String), count As Integer) As String()
            If count < 0 Then
                count = 0
            End If

            If count = 0 Then
                Return New String() {}
            End If

            Dim written As String() = New String(count - 1) {}

            If source.Count = 0 Then
                For i As Integer = 0 To written.Length - 1
                    written(i) = String.Empty
                Next

                Return written
            End If

            Dim decimals As Integer = DecimalsOf(source)
            Dim numbers As List(Of Double) = NumbersOf(source)
            If numbers IsNot Nothing AndAlso numbers.Count >= 2 Then
                Dim stepValue As Double = numbers(1) - numbers(0)
                Dim steady As Boolean = True
                For i As Integer = 2 To numbers.Count - 1
                    If Math.Abs(numbers(i) - numbers(i - 1) - stepValue) > 0.000000001 Then
                        steady = False
                        Exit For
                    End If
                Next

                If steady Then
                    Dim last As Double = numbers(numbers.Count - 1)
                    For i As Integer = 0 To written.Length - 1
                        written(i) = FormatNumber(last + stepValue * (i + 1), decimals)
                    Next

                    Return written
                End If
            End If

            If numbers IsNot Nothing AndAlso numbers.Count = 1 Then
                For i As Integer = 0 To written.Length - 1
                    written(i) = FormatNumber(numbers(0) + i + 1, decimals)
                Next

                Return written
            End If

            Dim prefix As String = Nothing
            Dim suffix As String = Nothing
            Dim first As Integer = 0
            Dim numberStep As Integer = 0
            If SplitTrailingNumber(source, prefix, suffix, first, numberStep) Then
                For i As Integer = 0 To written.Length - 1
                    written(i) = prefix & (first + numberStep * (i + 1)).ToString(CultureInfo.InvariantCulture) & suffix
                Next

                Return written
            End If

            For i As Integer = 0 To written.Length - 1
                written(i) = source(i Mod source.Count)
            Next

            Return written
        End Function

        ''' <summary>The numbers in the list, or null when any of them is not one.</summary>
        Private Shared Function NumbersOf(values As IReadOnlyList(Of String)) As List(Of Double)
            Dim numbers As New List(Of Double)()
            For i As Integer = 0 To values.Count - 1
                Dim value As Double
                If Not TryNumber(values(i), value) Then
                    Return Nothing
                End If

                numbers.Add(value)
            Next

            Return If(numbers.Count = 0, Nothing, numbers)
        End Function

        ''' <summary>How many decimal places the values were written with, so the fill keeps them.</summary>
        Private Shared Function DecimalsOf(values As IReadOnlyList(Of String)) As Integer
            Dim decimals As Integer = 0
            For i As Integer = 0 To values.Count - 1
                Dim text As String = values(i)
                If text Is Nothing Then
                    Continue For
                End If

                Dim dot As Integer = text.IndexOf("."c)
                If dot >= 0 AndAlso text.Length - dot - 1 > decimals Then
                    decimals = text.Length - dot - 1
                End If
            Next

            Return decimals
        End Function

        Private Shared Function FormatNumber(value As Double, decimals As Integer) As String
            If decimals <= 0 Then
                Return Math.Round(value).ToString(CultureInfo.InvariantCulture)
            End If

            Return value.ToString("F" & decimals.ToString(CultureInfo.InvariantCulture),
                CultureInfo.InvariantCulture)
        End Function

        ''' <summary>
        ''' "Item1", "Item2" → prefix "Item", suffix "", first 1, step 1 — but only when every value has
        ''' the same prefix and the same suffix, so a column that is not really a series is left alone.
        ''' </summary>
        Private Shared Function SplitTrailingNumber(values As IReadOnlyList(Of String), ByRef prefix As String,
            ByRef suffix As String, ByRef first As Integer, ByRef numberStep As Integer) As Boolean
            prefix = Nothing
            suffix = Nothing
            first = 0
            numberStep = 1
            Dim numbers As New List(Of Integer)()
            For i As Integer = 0 To values.Count - 1
                Dim text As String = values(i)
                If text Is Nothing OrElse text.Length = 0 Then
                    Return False
                End If

                Dim lastDigit As Integer = text.Length
                While lastDigit > 0 AndAlso text(lastDigit - 1) >= "0"c AndAlso text(lastDigit - 1) <= "9"c
                    lastDigit -= 1
                End While

                If lastDigit = text.Length Then
                    Return False                    ' no number at the end
                End If

                Dim head As String = text.Substring(0, lastDigit)
                Dim tail As String = text.Substring(lastDigit)
                If i = 0 Then
                    prefix = head
                    suffix = String.Empty
                ElseIf head <> prefix Then
                    Return False                    ' the letters changed, so it is not a series
                End If

                numbers.Add(Integer.Parse(tail, CultureInfo.InvariantCulture))
            Next

            If numbers.Count = 0 Then
                Return False
            End If

            first = numbers(numbers.Count - 1)
            If numbers.Count >= 2 Then
                numberStep = numbers(numbers.Count - 1) - numbers(numbers.Count - 2)
                If numberStep = 0 Then
                    numberStep = 1
                End If
            End If

            Return True
        End Function

    End Class

End Namespace
