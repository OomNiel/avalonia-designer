' BUNDLED-COPY: 0.12.9
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

    ''' <summary>One cell of a <see cref="GrumpySheet"/>: where it is and what it holds. Cells are written
    ''' as direct children of the sheet, in the order they should be read — order does not matter for
    ''' cells that do not overlap, because a later cell with the same address replaces an earlier one.</summary>
    Public NotInheritable Class SheetCell

        ''' <summary>The row, 1-based: Row = 1 is the first row. 0 or less is read as 1.</summary>
        Public Property Row As Integer = 1

        ''' <summary>The column, 1-based: Column = 1 is column A. 0 or less is read as 1.</summary>
        Public Property Column As Integer = 1

        ''' <summary>The cell's contents. Null or empty means the cell is blank, so it need not be
        ''' written at all.</summary>
        Public Property Text As String

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

        Shared Sub New()
            AffectsRender(Of GrumpySheet)(RowsProperty, ColumnsProperty, ColumnWidthProperty, RowHeightProperty,
                HeaderWidthProperty, HeaderHeightProperty, ShowHeadersProperty, ShowFormulaBarProperty,
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

        ''' <summary>The active cell's address, e.g. "B7".</summary>
        Public ReadOnly Property ActiveCellName As String
            Get
                Return CellName(_activeRow, _activeColumn)
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
            If _wholeRows OrElse _selectAll Then
                Return 1
            End If

            Return Math.Min(_anchorRow, _activeRow)
        End Function

        Private Function SelectionLastRow() As Integer
            Return If(_wholeColumns OrElse _selectAll, RowCount, Math.Max(_anchorRow, _activeRow))
        End Function

        Private Function SelectionFirstColumn() As Integer
            If _wholeColumns OrElse _selectAll Then
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
            Return New Rect(origin.X + (column - 1) * ColumnWidth - _scrollX,
                            origin.Y + (row - 1) * RowHeight - _scrollY,
                            ColumnWidth, RowHeight)
        End Function

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

            Dim contentWidth As Double = ColumnCount * ColumnWidth
            Dim contentHeight As Double = RowCount * RowHeight
            Dim maxX As Double = contentWidth - grid.Width
            Dim maxY As Double = contentHeight - grid.Height
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
            Dim width As Double = origin.X + ColumnCount * ColumnWidth
            Dim height As Double = origin.Y + RowCount * RowHeight
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
                        Dim text As String = GetCell(row, column)
                        If text.Length = 0 Then
                            Continue For
                        End If

                        Dim isEditingThis As Boolean = _editing AndAlso Not _barFocused AndAlso
                            row = _activeRow AndAlso column = _activeColumn
                        If isEditingThis Then
                            Continue For                 ' the editor draws it, with its caret
                        End If

                        DrawCellText(context, text, CellRect(row, column), textBrush, LooksNumeric(text), Nothing)
                    Next
                Next
            End Using

            DrawHeaders(context, size, headerBrush, headerTextBrush, grid, selection)
            DrawSelectionOutline(context, selectionBrush, grid)
            DrawFormulaBar(context, size, headerBrush, headerTextBrush, textBrush, selectionBrush)
            If Not AllowEditing Then
                Return
            End If

            ' The fill handle, unless the selection is the whole sheet (nothing to fill into).
            If Not _selectAll AndAlso Not _draggingFill Then
                Dim handle As Rect = HandleRect()
                If grid.Contains(handle.Center) Then
                    context.FillRectangle(selectionBrush, handle)
                End If
            End If
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
                    Dim rect As New Rect(CellRect(1, column).X, columnHeader.Y, ColumnWidth, HeaderHeight)
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
                    Dim rect As New Rect(0, CellRect(row, 1).Y, HeaderWidth, RowHeight)
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
            rightAligned As Boolean, align As Nullable(Of TextAlignment), Optional caret As Integer = -1)
            If text.Length = 0 AndAlso caret < 0 Then
                Return
            End If

            Dim typeface As Typeface = TypefaceFor()
            Dim formatted As New FormattedText(text, CultureInfo.CurrentCulture, FlowDirection.LeftToRight,
                typeface, FontSize, brush)
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
                        FlowDirection.LeftToRight, typeface, FontSize, brush)
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

        Private Function TypefaceFor() As Typeface
            Dim name As String = FontFamilyName
            If String.IsNullOrEmpty(name) Then
                Return Typeface.Default
            End If

            Return New Typeface(New FontFamily(name))
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
            Dim row As Integer = CInt(Math.Floor((grid.Y - GridOrigin.Y + _scrollY) / RowHeight)) + 1
            Return If(row < 1, 1, row)
        End Function

        Private Function VisibleLastRow(grid As Rect) As Integer
            Dim row As Integer = CInt(Math.Ceiling((grid.Bottom - GridOrigin.Y + _scrollY) / RowHeight))
            Return If(row > RowCount, RowCount, row)
        End Function

        Private Function VisibleFirstColumn(grid As Rect) As Integer
            Dim column As Integer = CInt(Math.Floor((grid.X - GridOrigin.X + _scrollX) / ColumnWidth)) + 1
            Return If(column < 1, 1, column)
        End Function

        Private Function VisibleLastColumn(grid As Rect) As Integer
            Dim column As Integer = CInt(Math.Ceiling((grid.Right - GridOrigin.X + _scrollX) / ColumnWidth))
            Return If(column > ColumnCount, ColumnCount, column)
        End Function

        ' ---- the mouse --------------------------------------------------------------------------

        Private Const HitNothing As Integer = 0
        Private Const HitCell As Integer = 1
        Private Const HitColumnHeader As Integer = 2
        Private Const HitRowHeader As Integer = 3
        Private Const HitCorner As Integer = 4
        Private Const HitHandle As Integer = 5
        Private Const HitBar As Integer = 6

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

                    column = ColumnAt(point.X, grid)
                    Return HitColumnHeader
                End If

                If point.X < HeaderWidth Then
                    row = RowAt(point.Y, grid)
                    Return HitRowHeader
                End If
            End If

            If Not grid.Contains(point) Then
                Return HitNothing
            End If

            row = RowAt(point.Y, grid)
            column = ColumnAt(point.X, grid)
            If Not _selectAll AndAlso Math.Abs(point.X - HandleRect().Center.X) <= HandleSize AndAlso
                Math.Abs(point.Y - HandleRect().Center.Y) <= HandleSize Then
                Return HitHandle
            End If

            Return HitCell
        End Function

        Private Function RowAt(y As Double, grid As Rect) As Integer
            Return ClampRow(CInt(Math.Floor((y - GridOrigin.Y + _scrollY) / RowHeight)) + 1)
        End Function

        Private Function ColumnAt(x As Double, grid As Rect) As Integer
            Return ClampColumn(CInt(Math.Floor((x - GridOrigin.X + _scrollX) / ColumnWidth)) + 1)
        End Function

        ''' <summary>Starts a selection, a fill, or an edit.</summary>
        Protected Overrides Sub OnPointerPressed(e As PointerPressedEventArgs)
            Dim point As PointerPoint = e.GetCurrentPoint(Me)
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

        ''' <summary>Extends the selection, or moves the fill preview.</summary>
        Protected Overrides Sub OnPointerMoved(e As PointerEventArgs)
            Dim point As Point = e.GetCurrentPoint(Me).Position
            If Not _draggingSelection AndAlso Not _draggingFill Then
                Return
            End If

            Dim row As Integer
            Dim column As Integer
            Dim hit As Integer = HitTest(point, row, column)
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
            _draggingSelection = False
            _draggingFill = False
            e.Pointer.Capture(Nothing)
            If wasFill Then
                ApplyFill()
            End If

            InvalidateVisual()
        End Sub

        ''' <summary>Scrolling: the wheel moves three rows, Shift+wheel moves sideways.</summary>
        Protected Overrides Sub OnPointerWheelChanged(e As PointerWheelEventArgs)
            Dim size As Size = Bounds.Size
            If e.KeyModifiers.HasFlag(KeyModifiers.Shift) Then
                _scrollX -= e.Delta.Y * ColumnWidth
            Else
                _scrollY -= e.Delta.Y * RowHeight * 3
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
                MoveActive(0, -1, shift)
                e.Handled = True
                Return
            End If

            If e.Key = Key.Right Then
                MoveActive(0, 1, shift)
                e.Handled = True
                Return
            End If

            If e.Key = Key.Up Then
                MoveActive(-1, 0, shift)
                e.Handled = True
                Return
            End If

            If e.Key = Key.Down Then
                MoveActive(1, 0, shift)
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
            If Not AllowEditing OrElse _editing OrElse String.IsNullOrEmpty(e.Text) Then
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

            BeginEdit(text, True, False)
            e.Handled = True
        End Sub

        ''' <summary>Commits what is being edited if the sheet loses the keyboard. Subscribed in the
        ''' constructor rather than overridden: Avalonia 12 does not expose an overridable
        ''' OnLostFocus with this signature.</summary>
        Private Sub OnSheetLostFocus(sender As Object, e As Avalonia.Interactivity.RoutedEventArgs)
            CommitEdit(True)
        End Sub

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
