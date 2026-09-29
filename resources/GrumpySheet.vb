' BUNDLED-COPY: 0.13.3
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
'   * AUTOFILL: the small square at the bottom-right of the selection and the one at its top-left are
'     the fill handles. Drag either one — down, right, up or left — and the pattern is PREDICTED:
'     1, 2 becomes 3, 4, 5 …; 2, 4 becomes 6, 8 …; a single number counts up by one; "Item1, Item2"
'     becomes "Item3"; anything else repeats the pattern it was given, which is how a repeating list
'     is copied. A cell holding a FORMULA is not predicted but COPIED, with every relative address
'     moved by the distance it travelled (=B2+1 one row down is =B3+1, exactly as a $ anchors a part
'     of the address in place) and #REF! written where a reference would land off the sheet.
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
'   * FORMULAS ARE EVALUATED. A cell holding "=Sum(B2..B6)" keeps and shows that text (the fx box is where
'     it is read and edited) and the GRID draws what it works out to. Ranges are WRITTEN A1:B3 (Excel's
'     spelling, and what the macro list writes), the older A1..B3 still reads, and the function list is
'     offered by a popup the moment "=" is typed.
'   * PRINTING AND THE PAGE. The toolbar's Print entries produce the PRINT AREA — the selected cells — and
'     nothing else, and asking for one with a single cell selected warns first, with Abort on Enter. Every
'     job is composed on an A4 PAGE, portrait or landscape: the page question is asked before each one and
'     remembered in PrintOrientation, and the area is scaled to fit inside the margin. Load…/Save… read and
'     write .xlsx, one page at a time.
Imports System
Imports System.Collections.Generic
Imports System.Collections.Specialized
Imports System.Diagnostics
Imports System.Globalization
Imports System.IO
Imports System.IO.Compression
Imports System.Threading.Tasks
Imports System.Xml.Linq
Imports Avalonia
Imports Avalonia.Collections
Imports Avalonia.Controls
Imports Avalonia.Input
Imports Avalonia.Media
Imports Avalonia.Media.Imaging
Imports Avalonia.Metadata
Imports Avalonia.Platform.Storage

#If PRINT_SUPPORT Then
' Printing and the PDF export are provided by two OPTIONAL, third-party libraries a generated project opts
' into (both packages referenced, the symbol defined — see projectScaffold.ts / printSupport.ts). Undefined,
' the whole feature is compiled out and costs nothing, which is how the headless PreviewerHost builds this
' same file with no printer package in reach.
Imports AvaloniaUI.PrintToPDF
Imports Avae.Printables
#End If

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

    ''' <summary>Which way round the PAGE is when the sheet is printed or exported: A4 either way — the page
    ''' has no other setup yet — with the print area scaled to fit inside the margin. Portrait is the
    ''' default, and the sheet asks again before every job, because there is no page-setup dialog to set it
    ''' in. (Not called Orientation: Avalonia.Layout owns that name, and a sheet that shadows it would make
    ''' `Orientation` ambiguous in a form that uses both.)</summary>
    Public Enum SheetOrientation
        Portrait
        Landscape
    End Enum

    ''' <summary>
    ''' Which of a cell's four edges carry a border line. <Flags>, because a corner cell can want Top
    ''' and Left at once, and a boxed one wants all four.
    '''
    ''' A cell keeps only this, ONE thickness and ONE colour (see SheetCell.BorderEdges): four different
    ''' line weights round one cell is not what this control is for, and a per-edge weight would
    ''' quadruple the attributes a cell can carry for no picture anyone asked for.
    '''
    ''' The right-click menu also offers the whole-set spellings a spreadsheet user expects — All,
    ''' Outside and Inside — but those are about a SELECTION, not a cell: Outside is the rim of the
    ''' block and Inside is the lines between the cells in it, so the menu works out what that means for
    ''' each cell and stores the answer here. On a single cell All and Outside are the same four edges,
    ''' and Inside is None — a single cell has no inside.
    ''' </summary>
    <Flags>
    Public Enum SheetBorderEdges

        ''' <summary>No border on any edge — what a cell starts with.</summary>
        None = 0

        ''' <summary>A line along the cell's top edge.</summary>
        Top = 1

        ''' <summary>A line down the cell's right edge.</summary>
        Right = 2

        ''' <summary>A line along the cell's bottom edge.</summary>
        Bottom = 4

        ''' <summary>A line down the cell's left edge.</summary>
        Left = 8

        ''' <summary>All four edges: a box round the cell.</summary>
        All = Top Or Right Or Bottom Or Left

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

        ''' <summary>Which of the cell's edges are drawn with a border line. None (the default) means no
        ''' border at all, which is what keeps a cell that was never boxed a short element.</summary>
        Public Property BorderEdges As SheetBorderEdges = SheetBorderEdges.None

        ''' <summary>How thick the cell's border lines are, in pixels — the same on every edge the cell
        ''' has. 0 (the default) means the SHEET'S OWN line: one pixel, the width of the grid line itself,
        ''' so a cell that says where its border goes but not how thick gets a line like every other line on
        ''' the sheet rather than nothing at all. BorderEdges is what decides whether there is a border; the
        ''' width only decides how heavy it is.</summary>
        Public Property BorderThickness As Double

        ''' <summary>The border's colour. Null means the sheet's own GridColor, so a border that was asked
        ''' for but not coloured reads as the grid it sits on rather than vanishing.</summary>
        Public Property BorderColor As Nullable(Of Color)

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

        ''' <summary>Draw the toolbar strip — the File and Print entries — above the formula bar. On by
        ''' default: dropping a sheet into a form should hand the user Load…, Save… and Print… without a
        ''' line of code.</summary>
        Public Shared ReadOnly ShowToolbarProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of GrumpySheet, Boolean)(NameOf(ShowToolbar), True)

        ''' <summary>The backcolour of the fx box — the cell edit box at the top of the sheet, where a
        ''' formula is typed and read. White by default, so the box stands apart from the strip it sits
        ''' in; the whole point of the row is that a form can make it obvious.</summary>
        Public Shared ReadOnly EditBackColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of GrumpySheet, Color)(NameOf(EditBackColor), Color.Parse("#FFFFFF"))

        ''' <summary>The colour of the text in the fx box (and of its caret).</summary>
        Public Shared ReadOnly EditTextColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of GrumpySheet, Color)(NameOf(EditTextColor), Color.Parse("#1E2228"))

        ''' <summary>Which way round the page is: portrait (taller than wide, the default) or landscape.
        ''' Set from XAML, from the designer's properties, or by the page question the Print entries ask —
        ''' which remembers the answer here, so the next job starts on the choice the user last made.</summary>
        Public Shared ReadOnly PrintOrientationProperty As StyledProperty(Of SheetOrientation) =
            AvaloniaProperty.Register(Of GrumpySheet, SheetOrientation)(NameOf(PrintOrientation),
                SheetOrientation.Portrait)

        ''' <summary>The height of the formula bar strip, in pixels (fixed).</summary>
        Private Const BarHeight As Double = 24.0

        ''' <summary>The height of the toolbar strip, in pixels (fixed).</summary>
        Private Const ToolbarHeight As Double = 26.0

        ''' <summary>The width of one toolbar button's icon, in pixels. The label is drawn after it, so a
        ''' button is as wide as its own word.</summary>
        Private Const ToolbarIconWidth As Double = 26.0

        ''' <summary>How many buttons the toolbar has, and which is which.</summary>
        Private Const ToolbarButtonCount As Integer = 2
        Private Const ToolbarFile As Integer = 0
        Private Const ToolbarPrint As Integer = 1

        ''' <summary>The width of one toolbar button, in pixels.</summary>
        Private Const ToolbarButtonWidth As Double = 28.0

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

        ' The PRINT AREA, while a page is being drawn: the sheet shows only these cells and the real headers
        ' next to them, which is a different picture from the one on screen. Set and cleared by the page
        ' scope the three print/export entries use (PageForPrinting), never left set.
        Private _printRange As Boolean
        Private _printFirstRow As Integer = 1
        Private _printFirstColumn As Integer = 1
        Private _printLastRow As Integer = 1
        Private _printLastColumn As Integer = 1

        ' The editor: no TextBox is involved, so this is the whole of its state.
        Private _editing As Boolean
        Private _barFocused As Boolean
        Private _editText As String = String.Empty
        Private _caret As Integer
        Private _editIsNew As Boolean

        ''' <summary>What the last file or print action did, shown at the right of the toolbar. Empty until
        ''' something happens, so an untouched sheet has a clean strip.</summary>
        Private _status As String = String.Empty

        ''' <summary>True while a file dialog, a load, a save or a print job is in flight: one at a time, so
        ''' a double click cannot start two pickers.</summary>
        Private _fileBusy As Boolean

        ''' <summary>Which toolbar button the pointer is over, or -1. Only the highlight and the label use
        ''' it.</summary>
        Private _toolbarHot As Integer = -1

        ''' <summary>Puts a line in the toolbar's status area — how Load…, Save… and Print… report back
        ''' without a message box, which a control this size has no business opening.</summary>
        Private Sub SetStatus(text As String)
            _status = If(text, String.Empty)
            InvalidateVisual()
        End Sub

        ''' <summary>What the last Load…, Save… or Print… did: the same line the toolbar shows. Empty until
        ''' one of them has run, and readable from a form that wants to log it.</summary>
        Public ReadOnly Property StatusText As String
            Get
                Return _status
            End Get
        End Property

        Private _scrollX As Double
        Private _scrollY As Double

        ' ---- .xlsx: the workbook on disk ------------------------------------------------------------
        '
        ' Both halves are written against System.IO.Compression and System.Xml, so the sheet keeps its one
        ' promise — no NuGet package, no assets. A workbook is a zip of small XML parts, and these are the
        ' smallest parts Excel and LibreOffice BOTH accept:
        '
        '   [Content_Types].xml   _rels/.rels   xl/workbook.xml   xl/_rels/workbook.xml.rels
        '   xl/worksheets/sheet1.xml            xl/styles.xml
        '
        ' WHAT TRAVELS: the cells (numbers as numbers, everything else as text), a formula as its own text
        ' plus the value it worked out — so another program shows the answer without calculating anything —
        ' each cell's own formatting, and the column widths and row heights a border was dragged on.
        ' WHAT DOES NOT: merged cells, pictures, comments, multiple pages. A file holding those still LOADS,
        ' and simply loses them on the way back, which is the honest behaviour for a control this size.
        ' Loading is ONE PAGE at a time, and Load… asks which when a workbook has several.

        ''' <summary>The worksheet name a saved file carries: the control's Name when a form gave it one, so
        ''' "Sheet1" in the designer reads "Sheet1" in Excel. Excel's own limits are applied — 31 characters,
        ''' and none of : \ / ? * [ ] — because a name it refuses is a file it will not open.</summary>
        Private Function PageName() As String
            Dim page As String = Name
            If String.IsNullOrWhiteSpace(page) Then
                page = "Sheet1"
            Else
                page = page.Trim()
            End If

            Dim builder As New System.Text.StringBuilder(page.Length)
            For i As Integer = 0 To page.Length - 1
                If builder.Length >= 31 Then
                    Exit For
                End If

                Dim c As Char = page(i)
                builder.Append(If(c = ":"c OrElse c = "\"c OrElse c = "/"c OrElse c = "?"c OrElse c = "*"c OrElse
                                  c = "["c OrElse c = "]"c, "_"c, c))
            Next

            Return If(builder.Length = 0, "Sheet1", builder.ToString())
        End Function

        ''' <summary>A column's width in Excel's own unit (characters, its default font) as pixels, and back.
        ''' Excel's rule for 11-point Calibri is pixels = width * 7 + 5, which is what the round trip here
        ''' uses, so a column that was 120 px wide is 16.4 characters wide and comes back as 120.</summary>
        Private Shared Function WidthToPixels(width As Double) As Double
            Return width * 7.0 + 5.0
        End Function

        Private Shared Function PixelsToWidth(pixels As Double) As Double
            Return (pixels - 5.0) / 7.0
        End Function

        ''' <summary>Row heights are points (1/72 inch) in a file and pixels on screen.</summary>
        Private Shared Function PixelsToPoints(pixels As Double) As Double
            Return pixels * 72.0 / 96.0
        End Function

        Private Shared Function PointsToPixels(points As Double) As Double
            Return points * 96.0 / 72.0
        End Function

        ''' <summary>
        ''' Writes the sheet as a one-page workbook. Returns false — with the reason in the toolbar's status
        ''' line — rather than throwing, so a form can call it from a Save button without a try.
        ''' </summary>
        Public Function SaveWorkbook(path As String) As Boolean
            If String.IsNullOrWhiteSpace(path) Then
                Return False
            End If

            Try
                Xlsx.Write(Me, path)
                SetStatus("Saved " & System.IO.Path.GetFileName(path))
                Return True
            Catch failure As Exception
                SetStatus("Could not save: " & failure.Message)
                Return False
            End Try
        End Function

        ''' <summary>The page names of a workbook, in the workbook's own order. Empty when the file is not a
        ''' workbook this control can read — which is also how Load… tells one from something else.</summary>
        Public Shared Function WorkbookPages(path As String) As List(Of String)
            Return Xlsx.Pages(path)
        End Function

        ''' <summary>
        ''' Reads ONE page of a workbook into the sheet: null (or a name that is not there) takes the first.
        ''' The sheet is cleared first, so what was on it is gone; Rows/Columns GROW when the page is bigger
        ''' than the sheet, and are left alone when it is smaller — a form that made a 30 x 12 sheet keeps its
        ''' shape after loading a 5 x 3 one.
        ''' </summary>
        Public Function LoadWorkbook(path As String, Optional page As String = Nothing) As Boolean
            If String.IsNullOrWhiteSpace(path) Then
                Return False
            End If

            Try
                Dim loaded As Integer = Xlsx.Read(Me, path, page)
                If loaded < 0 Then
                    SetStatus("Nothing to load from " & System.IO.Path.GetFileName(path))
                    Return False
                End If

                SetStatus("Loaded " & loaded & " cells from " & System.IO.Path.GetFileName(path))
                Refresh()
                Return True
            Catch failure As Exception
                SetStatus("Could not load: " & failure.Message)
                Return False
            End Try
        End Function

        ' ---- the file dialogs and hardcopy ------------------------------------------------------------
        '
        ' Every one of these starts with TopLevel.GetTopLevel(Me): without a window there is no file dialog
        ' and no printer, so each is a quiet no-op in the designer's headless preview — which is what makes
        ' the toolbar safe to press anywhere, and why SaveWorkbook/LoadWorkbook (plain paths) exist beside
        ' them for a form that wants to choose the file itself.

        ''' <summary>
        ''' Load…: the platform's file dialog, then — when the workbook holds more than one page — the page
        ''' list, because the sheet holds ONE page at a time.
        ''' </summary>
        Public Async Function BrowseForWorkbookAsync() As Task(Of Boolean)
            Dim top As TopLevel = TopLevel.GetTopLevel(Me)
            Dim storage As IStorageProvider = If(top Is Nothing, Nothing, top.StorageProvider)
            If storage Is Nothing OrElse _fileBusy Then
                Return False
            End If

            _fileBusy = True
            Try
                Dim options As New FilePickerOpenOptions()
                options.Title = "Load a workbook"
                options.AllowMultiple = False
                options.FileTypeFilter = {
                    New FilePickerFileType("Excel workbook") With {.Patterns = {"*.xlsx", "*.xlsm"}},
                    New FilePickerFileType("All files") With {.Patterns = {"*"}}}
                Dim last As String = SheetPickerMemory.LastFolder
                If last IsNot Nothing Then
                    Try
                        options.SuggestedStartLocation = Await storage.TryGetFolderFromPathAsync(New Uri(last))
                    Catch
                        ' The remembered folder is gone: let the platform choose.
                    End Try
                End If

                Dim files As IReadOnlyList(Of IStorageFile) = Await storage.OpenFilePickerAsync(options)
                Dim path As String = If(files IsNot Nothing AndAlso files.Count > 0, files(0).TryGetLocalPath(), Nothing)
                If String.IsNullOrWhiteSpace(path) Then
                    Return False                   ' cancelled
                End If

                SheetPickerMemory.LastFolder = FolderOf(path)
                Dim pages As List(Of String) = WorkbookPages(path)
                If pages.Count = 0 Then
                    SetStatus(System.IO.Path.GetFileName(path) & " is not a workbook this sheet can read")
                    Return False
                End If

                If pages.Count = 1 Then
                    Return LoadWorkbook(path, pages(0))
                End If

                ' More than one page: ask which, and say on the heading that only one comes across.
                SetStatus(System.IO.Path.GetFileName(path) & " holds " & pages.Count & " pages")
                OpenMenu(MenuKind.Toolbar, BuildPageItems(path, pages), New Point(0, ToolbarHeight + 1.0), MenuWidth)
                Return True
            Catch failure As Exception
                SetStatus("Could not open the picker: " & failure.Message)
                Return False
            Finally
                _fileBusy = False
            End Try
        End Function

        ''' <summary>Save…: the platform's file dialog, then the .xlsx writer.</summary>
        Public Async Function SaveAsWorkbookAsync() As Task(Of Boolean)
            Dim top As TopLevel = TopLevel.GetTopLevel(Me)
            Dim storage As IStorageProvider = If(top Is Nothing, Nothing, top.StorageProvider)
            If storage Is Nothing OrElse _fileBusy Then
                Return False
            End If

            _fileBusy = True
            Try
                Dim picker As New FilePickerSaveOptions()
                picker.Title = "Save the sheet"
                picker.SuggestedFileName = PageName() & ".xlsx"
                picker.DefaultExtension = "xlsx"
                picker.FileTypeChoices = {
                    New FilePickerFileType("Excel workbook") With {.Patterns = {"*.xlsx"}},
                    New FilePickerFileType("All files") With {.Patterns = {"*"}}}
                picker.ShowOverwritePrompt = True
                Await SuggestFolder(storage, picker)
                Dim file As IStorageFile = Await storage.SaveFilePickerAsync(picker)
                Dim path As String = If(file Is Nothing, Nothing, file.TryGetLocalPath())
                If String.IsNullOrWhiteSpace(path) Then
                    Return False
                End If

                Dim saved As Boolean = SaveWorkbook(path)
                If saved Then
                    SheetPickerMemory.LastExportFolder = FolderOf(path)
                End If

                Return saved
            Catch failure As Exception
                SetStatus("Could not save: " & failure.Message)
                Return False
            Finally
                _fileBusy = False
            End Try
        End Function

        ''' <summary>Save as PNG…: the platform's file dialog, then the render.</summary>
        Public Async Function SaveAsPngAsync(Optional wholeSheet As Boolean = False) As Task(Of Boolean)
            Dim top As TopLevel = TopLevel.GetTopLevel(Me)
            Dim storage As IStorageProvider = If(top Is Nothing, Nothing, top.StorageProvider)
            If storage Is Nothing OrElse _fileBusy Then
                Return False
            End If

            _fileBusy = True
            Try
                Dim picker As New FilePickerSaveOptions()
                picker.Title = "Save the sheet as a picture"
                picker.SuggestedFileName = PageName() & ".png"
                picker.DefaultExtension = "png"
                picker.FileTypeChoices = {
                    New FilePickerFileType("PNG image") With {.Patterns = {"*.png"}},
                    New FilePickerFileType("All files") With {.Patterns = {"*"}}}
                picker.ShowOverwritePrompt = True
                Await SuggestFolder(storage, picker)
                Dim file As IStorageFile = Await storage.SaveFilePickerAsync(picker)
                Dim path As String = If(file Is Nothing, Nothing, file.TryGetLocalPath())
                If String.IsNullOrWhiteSpace(path) Then
                    Return False
                End If

                Dim saved As Boolean = ExportPng(path, 2.0, wholeSheet)
                If saved Then
                    SheetPickerMemory.LastExportFolder = FolderOf(path)
                    SetStatus("Saved " & System.IO.Path.GetFileName(path) & " — " &
                              PrintAreaText(wholeSheet) & ", " & PageText())
                End If

                Return saved
            Catch failure As Exception
                SetStatus("Could not save the picture: " & failure.Message)
                Return False
            Finally
                _fileBusy = False
            End Try
        End Function

        ''' <summary>
        ''' Renders the PAGE to a PNG file — A4, portrait or landscape, with the print area scaled to fit
        ''' inside the margin — at scale times its size, so the text is legible once the picture is in a
        ''' document. No package is involved, so this works on every platform and in the headless previewer:
        ''' the one export with no prerequisites at all. What it pictures is the PRINT AREA — the selected
        ''' cells — and the column letters and row numbers beside it are the real ones.
        ''' </summary>
        Public Function ExportPng(path As String, Optional scale As Double = 2.0,
            Optional wholeSheet As Boolean = False) As Boolean
            If String.IsNullOrWhiteSpace(path) OrElse Bounds.Width <= 0 OrElse Bounds.Height <= 0 Then
                Return False
            End If

            Try
                If scale <= 0 Then
                    scale = 1.0
                End If

                Dim firstRow As Integer = 0
                Dim firstColumn As Integer = 0
                Dim lastRow As Integer = 0
                Dim lastColumn As Integer = 0
                If Not PrintArea(wholeSheet, firstRow, firstColumn, lastRow, lastColumn) Then
                    Return False
                End If

                Dim page As PrintPage = PageForPrinting(firstRow, firstColumn, lastRow, lastColumn)
                Try
                    Dim paper As Size = PageSize()
                    Dim sheetPage As SheetPrintPage = PageForOrientation()
                    Dim pixels As New PixelSize(Math.Max(1, CInt(Math.Round(paper.Width * scale))),
                                                Math.Max(1, CInt(Math.Round(paper.Height * scale))))
                    Using bitmap As New RenderTargetBitmap(pixels, New Vector(96 * scale, 96 * scale))
                        bitmap.Render(sheetPage)
                        bitmap.Save(path, New PngBitmapEncoderOptions())
                    End Using
                Finally
                    page.Dispose()
                End Try

                SetStatus("Saved " & System.IO.Path.GetFileName(path) & " — " &
                          PrintAreaText(wholeSheet) & ", " & PageText())
                Return True
            Catch failure As Exception
                SetStatus("Could not save the picture: " & failure.Message)
                Return False
            End Try
        End Function

        ''' <summary>Opens a save dialog where the last one left off, when that folder is still there.</summary>
        Private Shared Async Function SuggestFolder(storage As IStorageProvider, picker As FilePickerSaveOptions) As Task
            Dim last As String = SheetPickerMemory.LastExportFolder
            If last Is Nothing Then
                Return
            End If

            Try
                picker.SuggestedStartLocation = Await storage.TryGetFolderFromPathAsync(New Uri(last))
            Catch
                ' The remembered folder has gone: let the platform choose.
            End Try
        End Function

        ''' <summary>The folder a path is in, for the picker's memory. Never throws.</summary>
        Private Shared Function FolderOf(path As String) As String
            Try
                Return If(String.IsNullOrWhiteSpace(path), Nothing, System.IO.Path.GetDirectoryName(path))
            Catch
                Return Nothing
            End Try
        End Function

        ' ---- the print area ---------------------------------------------------------------------
        ' PRINTING is the one action here that costs paper, ink and time, and the sheet's resting state is a
        ' SINGLE cell selected — which used to mean that choosing Print… quietly printed all 26 columns and
        ' 50 rows. So the three entries under Print work on the SELECTION, and when nothing but a single cell
        ' is selected the sheet asks first, with an Abort line the keyboard reaches by default.

        ''' <summary>The width the warning is drawn at — wide enough for its longest line.</summary>
        Private Const PrintWarningWidth As Double = 300.0

        ''' <summary>A4 in PDF points (1/72 inch) — the page every job and export is composed on. Landscape
        ''' swaps the two, which is the whole of the page setup there is: paper size and margin are the next
        ''' step, and belong to a printer setup of their own.</summary>
        Private Const PrintPageWidth As Double = 595.0
        Private Const PrintPageHeight As Double = 842.0

        ''' <summary>The white space kept inside the page, in points — the same 18 the bundled charts use,
        ''' so a sheet and a chart printed from the same form look like they came from the same printer.</summary>
        Private Const PrintPageMargin As Double = 18.0

        ''' <summary>The paper the page is composed for. It is what the sheet SAYS in its status line and what
        ''' the printer is asked for, so the page and the job cannot disagree about it.</summary>
        Private Const PrintPaperName As String = "A4"

        ''' <summary>The page, the way round the sheet asks for: portrait is taller than wide.</summary>
        Private Function PageSize() As Size
            If PrintOrientation = SheetOrientation.Landscape Then
                Return New Size(PrintPageHeight, PrintPageWidth)
            End If

            Return New Size(PrintPageWidth, PrintPageHeight)
        End Function

        ''' <summary>The page as "A4 portrait", for the status line and the page question's heading.</summary>
        Private Function PageText() As String
            Return PrintPaperName & If(PrintOrientation = SheetOrientation.Landscape, " landscape", " portrait")
        End Function

        ''' <summary>Which of the three entries the warning is about.</summary>
        Private Enum SheetPrintKind
            None
            Picture
            Pdf
            Printer
        End Enum

        Private _printKind As SheetPrintKind

        ''' <summary>
        ''' The cells a page will hold: the SELECTION — the print area the user chose — or, when the warning
        ''' was answered with "print the whole sheet", every row and column. False only when there is nothing
        ''' to print at all.
        ''' </summary>
        Private Function PrintArea(wholeSheet As Boolean, ByRef firstRow As Integer, ByRef firstColumn As Integer,
            ByRef lastRow As Integer, ByRef lastColumn As Integer) As Boolean
            If wholeSheet Then
                firstRow = 1
                firstColumn = 1
                lastRow = RowCount
                lastColumn = ColumnCount
                Return True
            End If

            firstRow = SelectionFirstRow()
            firstColumn = SelectionFirstColumn()
            lastRow = SelectionLastRow()
            lastColumn = SelectionLastColumn()
            Return lastRow >= firstRow AndAlso lastColumn >= firstColumn
        End Function

        ''' <summary>True when the user has actually CHOSEN something to print: a block, a whole column or a
        ''' whole row — anything but the single cell that is selected by default. Clicking the corner above the
        ''' row numbers (or Ctrl+A) counts as chosen: that is a deliberate "all of it".</summary>
        Private Function HasPrintArea() As Boolean
            Return SelectionFirstRow() <> SelectionLastRow() OrElse
                SelectionFirstColumn() <> SelectionLastColumn()
        End Function

        ''' <summary>The area as "B4:D9", for the status line and the warning.</summary>
        Private Function PrintAreaText(wholeSheet As Boolean) As String
            Dim firstRow As Integer = 0
            Dim firstColumn As Integer = 0
            Dim lastRow As Integer = 0
            Dim lastColumn As Integer = 0
            If Not PrintArea(wholeSheet, firstRow, firstColumn, lastRow, lastColumn) Then
                Return "nothing"
            End If

            Return CellName(firstRow, firstColumn) & ":" & CellName(lastRow, lastColumn)
        End Function

        ''' <summary>A print or export entry was chosen: with an area selected it goes straight to the page
        ''' question, and with a bare single cell it warns first.</summary>
        Private Sub RequestPrint(kind As SheetPrintKind)
            If HasPrintArea() Then
                ShowOrientationChooser(kind, False)
                Return
            End If

            _printKind = kind
            ShowPrintWarning()
        End Sub

        ''' <summary>
        ''' The page question, asked before every job — there is no page-setup dialog yet, so this is where
        ''' the sheet learns which way round the paper is. The current choice is ticked and the highlight
        ''' STARTS on it, so Enter accepts the page as it already is; choosing one REMEMBERS it on the sheet
        ''' (PrintOrientation, which the designer's properties and a form's own XAML can set too) and then
        ''' runs the job; Cancel is a line of its own, so a job is never produced by accident.
        ''' </summary>
        Private Sub ShowOrientationChooser(kind As SheetPrintKind, wholeSheet As Boolean)
            _printKind = kind
            Dim items As New List(Of SheetMenuItem)()
            items.Add(New SheetMenuItem With {
                .Label = "Page orientation (A4)", .Hint = "the area is fitted to it", .Enabled = False})
            Dim current As Integer = -1
            items.Add(New SheetMenuItem With {
                .Label = "Portrait", .Hint = "taller than wide",
                .Ticked = PrintOrientation = SheetOrientation.Portrait,
                .Run = Sub() ChooseOrientation(SheetOrientation.Portrait, wholeSheet)})
            If PrintOrientation = SheetOrientation.Portrait Then
                current = items.Count - 1
            End If

            items.Add(New SheetMenuItem With {
                .Label = "Landscape", .Hint = "wider than tall",
                .Ticked = PrintOrientation = SheetOrientation.Landscape,
                .Run = Sub() ChooseOrientation(SheetOrientation.Landscape, wholeSheet)})
            If PrintOrientation = SheetOrientation.Landscape Then
                current = items.Count - 1
            End If

            items.Add(New SheetMenuItem With {.IsSeparator = True})
            items.Add(New SheetMenuItem With {
                .Label = "Cancel", .Hint = "print nothing", .Run = AddressOf CancelPrint})

            ' Just under the toolbar, where the eye already is. ToolbarStrip is where the strip ENDS (it is
            ' the formula bar's top edge, and 0 when the strip is switched off).
            Dim button As Rect = ToolbarButtonRect(ToolbarPrint)
            OpenMenu(MenuKind.Setup, items, New Point(button.X, ToolbarStrip), PrintWarningWidth)
            If current >= 0 Then
                _menuHot = current
            End If
        End Sub

        ''' <summary>The orientation the user picked: remembered on the sheet, and then the job runs.</summary>
        Private Sub ChooseOrientation(orientation As SheetOrientation, wholeSheet As Boolean)
            PrintOrientation = orientation
            RunPrint(_printKind, wholeSheet)
        End Sub

        ''' <summary>The answer that produces nothing, from the page question: the sheet is left exactly as
        ''' it was, and the status line says why nothing happened.</summary>
        Private Sub CancelPrint()
            _printKind = SheetPrintKind.None
            SetStatus("Nothing was printed — the page orientation was not chosen")
        End Sub

        ''' <summary>Runs the entry the warning was about — with the whole sheet, now that the user said so.</summary>
        Private Sub RunPrint(kind As SheetPrintKind, wholeSheet As Boolean)
            If kind = SheetPrintKind.Picture Then
                RunPicture(wholeSheet)
                Return
            End If

#If PRINT_SUPPORT Then
            If kind = SheetPrintKind.Pdf Then
                RunPdf(wholeSheet)
                Return
            End If

            If kind = SheetPrintKind.Printer Then
                RunPrinter(wholeSheet)
            End If
#End If
        End Sub

        ' Fire and forget, the file's own idiom: an Async Sub that awaits the entry. A bare Sub() calling one
        ' is BC42358 — a warning, and this project keeps a 0-warning bar.
        Private Async Sub RunPicture(wholeSheet As Boolean)
            Await SaveAsPngAsync(wholeSheet)
        End Sub

#If PRINT_SUPPORT Then
        Private Async Sub RunPdf(wholeSheet As Boolean)
            Await SaveAsPdfAsync(wholeSheet)
        End Sub

        Private Async Sub RunPrinter(wholeSheet As Boolean)
            Await PrintAsync(wholeSheet)
        End Sub
#End If

        ''' <summary>
        ''' The warning, drawn with the same machinery as the right-click menu — a Control has no dialog of its
        ''' own, and the one time this file reached for platform popup plumbing (an Avalonia ContextMenu for the
        ''' right-click menu) it never appeared at all. Abort is the FIRST line, so Enter and Escape both mean
        ''' "no": printing the whole sheet has to be asked for twice.
        ''' </summary>
        Private Sub ShowPrintWarning()
            Dim items As New List(Of SheetMenuItem)()
            ' Enabled = false, so the warning lines are not choosable — Enter and Escape then both land on
            ' Abort, which is the first ENABLED line.
            items.Add(New SheetMenuItem With {
                .Label = "Nothing is selected to print.", .Warning = True, .Enabled = False})
            items.Add(New SheetMenuItem With {
                .Label = "Select the cells that make the page,", .Warning = True, .Enabled = False})
            items.Add(New SheetMenuItem With {
                .Label = "or print the whole sheet.", .Warning = True, .Enabled = False})
            items.Add(New SheetMenuItem With {.IsSeparator = True})
            Dim pending As SheetPrintKind = _printKind
            items.Add(New SheetMenuItem With {
                .Label = "Abort", .Hint = "print nothing", .Ticked = True,
                .Run = Sub() AbortPrint()})
            items.Add(New SheetMenuItem With {
                .Label = "Print the whole sheet", .Hint = "every row and column",
                .Run = Sub() ShowOrientationChooser(pending, True)})

            ' Just under the toolbar, so the warning is where the eye already is. ToolbarStrip is where the
            ' strip ENDS (it is the formula bar's top edge, and 0 when the strip is switched off).
            Dim button As Rect = ToolbarButtonRect(ToolbarPrint)
            OpenMenu(MenuKind.Warning, items, New Point(button.X, ToolbarStrip), PrintWarningWidth)
        End Sub

        ''' <summary>The answer that prints nothing: the sheet is left exactly as it was.</summary>
        Private Sub AbortPrint()
            _printKind = SheetPrintKind.None
            SetStatus("Nothing was printed — select the cells for the page, then try again")
        End Sub

        ''' <summary>
        ''' The page the three entries work on: the print area, with the driving chrome off, at the area's own
        ''' size — and put back exactly as it was when the using block ends.
        '''
        ''' The AREA is the selection (the cells the user chose), unless the warning was answered with "print
        ''' the whole sheet". Either way the page carries the REAL column letters and row numbers, because the
        ''' sheet is SCROLLED to the area's first cell rather than redrawn somewhere else — which is also why a
        ''' scrolled sheet no longer prints its scrollbar position, and why "the whole sheet" finally means the
        ''' whole sheet on paper rather than the window that happened to be on screen.
        ''' </summary>
        Private Function PageForPrinting(firstRow As Integer, firstColumn As Integer, lastRow As Integer,
            lastColumn As Integer) As PrintPage
            Return New PrintPage(Me, firstRow, firstColumn, lastRow, lastColumn)
        End Function

        ''' <summary>Off for the page, back on for the screen: chrome, scroll, size and the area itself.</summary>
        Private Structure PrintPage
            Implements IDisposable

            Private _sheet As GrumpySheet
            Private _toolbar As Boolean
            Private _bar As Boolean
            Private _scrollBars As Boolean
            Private _range As Boolean
            Private _scrollX As Double
            Private _scrollY As Double
            Private _width As Double
            Private _height As Double
            Private _firstRow As Integer
            Private _firstColumn As Integer
            Private _lastRow As Integer
            Private _lastColumn As Integer

            Friend Sub New(sheet As GrumpySheet, firstRow As Integer, firstColumn As Integer, lastRow As Integer,
                lastColumn As Integer)
                _sheet = sheet
                _toolbar = sheet.ShowToolbar
                _bar = sheet.ShowFormulaBar
                _scrollBars = sheet.ShowScrollBars
                _range = sheet._printRange
                _scrollX = sheet._scrollX
                _scrollY = sheet._scrollY
                _width = sheet.Width
                _height = sheet.Height
                _firstRow = sheet._printFirstRow
                _firstColumn = sheet._printFirstColumn
                _lastRow = sheet._printLastRow
                _lastColumn = sheet._printLastColumn

                sheet.ShowToolbar = False
                sheet.ShowFormulaBar = False
                sheet.ShowScrollBars = False
                sheet._printRange = True
                sheet._printFirstRow = firstRow
                sheet._printFirstColumn = firstColumn
                sheet._printLastRow = lastRow
                sheet._printLastColumn = lastColumn
                sheet._scrollX = sheet.ColumnOffset(firstColumn)
                sheet._scrollY = sheet.RowOffset(firstRow)
                Dim origin As Point = sheet.GridOrigin
                sheet.Width = origin.X + sheet.ColumnOffset(lastColumn + 1) - sheet.ColumnOffset(firstColumn)
                sheet.Height = origin.Y + sheet.RowOffset(lastRow + 1) - sheet.RowOffset(firstRow)
                sheet.Measure(New Size(sheet.Width, sheet.Height))
                sheet.Arrange(New Rect(0, 0, sheet.Width, sheet.Height))
            End Sub

            ''' <summary>Puts the sheet back exactly as it was, and lets the layout run again so the screen gets
            ''' its own size back.</summary>
            Public Sub Dispose() Implements IDisposable.Dispose
                If _sheet Is Nothing Then
                    Return
                End If

                _sheet._printRange = _range
                _sheet._printFirstRow = _firstRow
                _sheet._printFirstColumn = _firstColumn
                _sheet._printLastRow = _lastRow
                _sheet._printLastColumn = _lastColumn
                _sheet._scrollX = _scrollX
                _sheet._scrollY = _scrollY
                _sheet._printKind = SheetPrintKind.None
                _sheet.ShowToolbar = _toolbar
                _sheet.ShowFormulaBar = _bar
                _sheet.ShowScrollBars = _scrollBars
                _sheet.Width = _width
                _sheet.Height = _height
                _sheet.InvalidateMeasure()
                _sheet.InvalidateVisual()
            End Sub
        End Structure

        ''' <summary>
        ''' The page the job is drawn on: A4, white, with the sheet — arranged at the print area's own size
        ''' by PageForPrinting — scaled to FIT inside the margin. Never stretched, so a wide area and a tall
        ''' one keep their proportions.
        '''
        ''' A separate visual is needed because a page has a size of its own, and the whole point of the page
        ''' question is that this size CHANGES with the answer. The sheet is painted through a VisualBrush,
        ''' which keeps it VECTOR in the PDF, and the page is measured and arranged before it is handed over:
        ''' a backend draws what it is given and runs no layout pass for us, so an un-laid-out page renders
        ''' empty — a PDF whose size is right and whose paint is nothing. (The bundled charts compose their
        ''' page exactly this way.)
        ''' </summary>
        Private Function PageForOrientation() As SheetPrintPage
            Dim paper As Size = PageSize()
            Dim sheetPage As New SheetPrintPage(Me, paper, PrintPageMargin)
            sheetPage.Measure(paper)
            sheetPage.Arrange(New Rect(0, 0, paper.Width, paper.Height))
            Return sheetPage
        End Function

        ''' <summary>
        ''' The sheet AS A PAGE: white paper with the print area fitted inside the margin. Drawn by this one
        ''' small control rather than assembled out of panels and transforms, so the file keeps its promise
        ''' — no assets, no dependencies — and the same visual can be handed to a PDF, to the printer, or to
        ''' the PNG export without any of the three knowing about the others.
        ''' </summary>
        Private NotInheritable Class SheetPrintPage
            Inherits Control

            Private ReadOnly _sheet As Control
            Private ReadOnly _page As Size
            Private ReadOnly _margin As Double

            Friend Sub New(sheet As Control, page As Size, margin As Double)
                _sheet = sheet
                _page = page
                _margin = margin
                Width = page.Width
                Height = page.Height
            End Sub

            Public Overrides Sub Render(context As DrawingContext)
                ' paperWidth, not width: VB is case-INSENSITIVE, so a local named `width` would hide the
                ' control's own Width property for the whole method — including inside this initialiser.
                Dim paperWidth As Double = If(Double.IsNaN(Width) OrElse Width <= 0, _page.Width, Width)
                Dim paperHeight As Double = If(Double.IsNaN(Height) OrElse Height <= 0, _page.Height, Height)
                context.FillRectangle(Brushes.White, New Rect(0, 0, paperWidth, paperHeight))
                Dim gap As Double = Math.Max(0, _margin)
                Dim inner As New Rect(gap, gap, Math.Max(1, paperWidth - 2 * gap),
                    Math.Max(1, paperHeight - 2 * gap))
                context.DrawRectangle(New VisualBrush With {.Visual = _sheet, .Stretch = Stretch.Uniform},
                    Nothing, inner)
            End Sub
        End Class

#If PRINT_SUPPORT Then
        ''' <summary>
        ''' True when this machine can really put a page on paper: the platform's own printing service, or on
        ''' a Linux desktop the CUPS client the bundled GrumpyPrint drives. The same test the charts make, and
        ''' the reason the Print… row is greyed out rather than offering a click that does nothing.
        ''' </summary>
        Public Shared ReadOnly Property CanPrint As Boolean
            Get
                Try
                    If Printable.Default IsNot Nothing Then
                        Return True
                    End If
                Catch
                    ' No service registered: try CUPS below.
                End Try

                ' Fully qualified: GrumpyPrint is the SHARED bundled helper and lives in the charts' own
                ' namespace, which a sheet in AvaloniaSpreadsheet cannot see unqualified.
                Return Global.AvaloniaCharts.GrumpyPrint.Available
            End Get
        End Property

        ''' <summary>Save as PDF…: the platform's file dialog, then the PDF itself.</summary>
        Public Async Function SaveAsPdfAsync(Optional wholeSheet As Boolean = False) As Task(Of Boolean)
            Dim top As TopLevel = TopLevel.GetTopLevel(Me)
            Dim storage As IStorageProvider = If(top Is Nothing, Nothing, top.StorageProvider)
            If storage Is Nothing OrElse _fileBusy Then
                Return False
            End If

            _fileBusy = True
            Try
                Dim picker As New FilePickerSaveOptions()
                picker.Title = "Save the sheet as a PDF"
                picker.SuggestedFileName = PageName() & ".pdf"
                picker.DefaultExtension = "pdf"
                picker.FileTypeChoices = {
                    New FilePickerFileType("PDF document") With {.Patterns = {"*.pdf"}},
                    New FilePickerFileType("All files") With {.Patterns = {"*"}}}
                picker.ShowOverwritePrompt = True
                Await SuggestFolder(storage, picker)
                Dim file As IStorageFile = Await storage.SaveFilePickerAsync(picker)
                Dim path As String = If(file Is Nothing, Nothing, file.TryGetLocalPath())
                If String.IsNullOrWhiteSpace(path) Then
                    Return False
                End If

                Dim written As Boolean = Await WritePdf(path, wholeSheet)
                If written Then
                    SheetPickerMemory.LastExportFolder = FolderOf(path)
                End If

                Return written
            Catch failure As Exception
                SetStatus("Could not write the PDF: " & failure.Message)
                Return False
            Finally
                _fileBusy = False
            End Try
        End Function

        ''' <summary>Writes the sheet to a PDF file (Skia vector output — no printer is involved).</summary>
        Public Async Function WritePdf(path As String, Optional wholeSheet As Boolean = False) As Task(Of Boolean)
            If String.IsNullOrWhiteSpace(path) Then
                Return False
            End If

            Try
                Dim firstRow As Integer = 0
                Dim firstColumn As Integer = 0
                Dim lastRow As Integer = 0
                Dim lastColumn As Integer = 0
                If Not PrintArea(wholeSheet, firstRow, firstColumn, lastRow, lastColumn) Then
                    Return False
                End If

                Dim page As PrintPage = PageForPrinting(firstRow, firstColumn, lastRow, lastColumn)
                Try
                    Dim visuals As Visual() = {PageForOrientation()}
                    Await Print.ToFileAsync(path, visuals)
                Finally
                    page.Dispose()
                End Try

                SetStatus("Saved " & System.IO.Path.GetFileName(path) & " — " &
                          PrintAreaText(wholeSheet) & ", " & PageText())
                Return True
            Catch failure As Exception
                SetStatus("Could not write the PDF: " & failure.Message)
                Return False
            End Try
        End Function

        ''' <summary>Print…: hands the page to the printer, through the platform's service or CUPS.</summary>
        Public Async Function PrintAsync(Optional wholeSheet As Boolean = False) As Task(Of Boolean)
            If Not CanPrint Then
                SetStatus("Nothing here can print — Save as PDF… needs no printer")
                Return False
            End If

            Try
                Dim firstRow As Integer = 0
                Dim firstColumn As Integer = 0
                Dim lastRow As Integer = 0
                Dim lastColumn As Integer = 0
                If Not PrintArea(wholeSheet, firstRow, firstColumn, lastRow, lastColumn) Then
                    Return False
                End If

                Dim page As PrintPage = PageForPrinting(firstRow, firstColumn, lastRow, lastColumn)
                Try
                    ' Two ways onto paper, and only one of them is present on any one machine: the
                    ' platform's own printing service (Windows, macOS, GTK), or — on a plain Linux desktop,
                    ' where that library registers no service at all — the CUPS client the bundled helper
                    ' drives. CUPS is TOLD what the page is: the PDF's own page box is not enough, because
                    ' pdftopdf transforms the page according to the JOB's options, so a queue whose saved
                    ' defaults say portrait (a user's ~/.cups/lpoptions can pin it) prints a landscape page
                    ' the wrong way round. Measured 2026-09-27: one and the same PDF came out wrong with no
                    ' options and right with orientation-requested=4.
                    Dim visuals As Visual() = {PageForOrientation()}
                    If Printable.Default IsNot Nothing Then
                        Await Printable.PrintVisualsAsync(visuals, PageName())
                    Else
                        Await Global.AvaloniaCharts.GrumpyPrint.PrintAsync(visuals(0), PageName(), Nothing,
                            New Global.AvaloniaCharts.PrintPageSettings With {
                                .Landscape = PrintOrientation = SheetOrientation.Landscape,
                                .PaperSize = PrintPaperName})
                    End If
                Finally
                    page.Dispose()
                End Try

                SetStatus("Sent " & PageName() & " (" & PrintAreaText(wholeSheet) & ", " & PageText() &
                          ") to the printer")
                Return True
            Catch failure As Exception
                SetStatus("Could not print: " & failure.Message)
                Return False
            End Try
        End Function

        ''' <summary>
        ''' The driving chrome off for a page, and back on when the using block ends — the whole page scope,
        ''' including the print area, lives in PageForPrinting now, outside this guard, because the PNG export
        ''' needs it too.
        ''' </summary>
#End If

        ''' <summary>
        ''' The workbook half of Load…/Save…: the zip, the parts, and the two directions of translation.
        ''' Nested rather than spread through the control because none of it needs the sheet's state — the
        ''' control's own Save/Load methods above are the door into it.
        ''' </summary>
        Private NotInheritable Class Xlsx
            Private Const Main As String = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"

            ' ---- writing --------------------------------------------------------------------------

            ''' <summary>Writes one page: the cells, the formats they use, and the part that names them.</summary>
            Friend Shared Sub Write(sheet As GrumpySheet, path As String)
                Dim styles As New StyleTable(sheet)
                Dim rows As New System.Text.StringBuilder()
                Dim count As Integer = Body(sheet, styles, rows)

                Using stream As New FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None)
                    Using zip As New ZipArchive(stream, ZipArchiveMode.Create)
                        WritePart(zip, "[Content_Types].xml",
                            "<?xml version=""1.0"" encoding=""UTF-8"" standalone=""yes""?>" &
                            "<Types xmlns=""http://schemas.openxmlformats.org/package/2006/content-types"">" &
                            "<Default Extension=""rels"" ContentType=""application/vnd.openxmlformats-package.relationships+xml"" />" &
                            "<Default Extension=""xml"" ContentType=""application/xml"" />" &
                            "<Override PartName=""/xl/workbook.xml"" ContentType=""application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"" />" &
                            "<Override PartName=""/xl/worksheets/sheet1.xml"" ContentType=""application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"" />" &
                            "<Override PartName=""/xl/styles.xml"" ContentType=""application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"" />" &
                            "</Types>")
                        WritePart(zip, "_rels/.rels",
                            "<?xml version=""1.0"" encoding=""UTF-8"" standalone=""yes""?>" &
                            "<Relationships xmlns=""http://schemas.openxmlformats.org/package/2006/relationships"">" &
                            "<Relationship Id=""rId1"" Type=""http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"" Target=""xl/workbook.xml"" />" &
                            "</Relationships>")
                        WritePart(zip, "xl/workbook.xml",
                            "<?xml version=""1.0"" encoding=""UTF-8"" standalone=""yes""?>" &
                            "<workbook xmlns=""" & Main & """ " &
                            "xmlns:r=""http://schemas.openxmlformats.org/officeDocument/2006/relationships"">" &
                            "<sheets><sheet name=""" & XmlText(sheet.PageName()) & """ sheetId=""1"" r:id=""rId1"" /></sheets>" &
                            "</workbook>")
                        WritePart(zip, "xl/_rels/workbook.xml.rels",
                            "<?xml version=""1.0"" encoding=""UTF-8"" standalone=""yes""?>" &
                            "<Relationships xmlns=""http://schemas.openxmlformats.org/package/2006/relationships"">" &
                            "<Relationship Id=""rId1"" Type=""http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"" Target=""worksheets/sheet1.xml"" />" &
                            "<Relationship Id=""rId2"" Type=""http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"" Target=""styles.xml"" />" &
                            "</Relationships>")
                        WritePart(zip, "xl/styles.xml", styles.Document())
                        WritePart(zip, "xl/worksheets/sheet1.xml",
                            "<?xml version=""1.0"" encoding=""UTF-8"" standalone=""yes""?>" &
                            "<worksheet xmlns=""" & Main & """>" &
                            "<sheetViews><sheetView workbookViewId=""0"" /></sheetViews>" &
                            "<sheetFormatPr defaultRowHeight=""" & Number(PixelsToPoints(sheet.RowHeight)) & """ />" &
                            sheet.ColumnsElement() &
                            "<sheetData>" & rows.ToString() & "</sheetData></worksheet>")
                    End Using
                End Using

                Trace.WriteLine("GrumpySheet: saved " & count & " cells to " & path)
            End Sub

            ''' <summary>The rows of the sheet, as XML: only the cells that exist, so an empty sheet writes an
            ''' empty sheetData. A formula goes in twice — its text, and what it worked out to.</summary>
            Private Shared Function Body(sheet As GrumpySheet, styles As StyleTable,
                rows As System.Text.StringBuilder) As Integer
                Dim written As Integer = 0
                For row As Integer = 1 To sheet.RowCount
                    Dim rowXml As New System.Text.StringBuilder()
                    For column As Integer = 1 To sheet.ColumnCount
                        Dim cell As SheetCell = sheet.FindCell(row, column)
                        If cell Is Nothing Then
                            Continue For
                        End If

                        Dim text As String = If(cell.Text, String.Empty)
                        If text.Length = 0 AndAlso Not cell.Fill.HasValue AndAlso
                           cell.BorderEdges = SheetBorderEdges.None Then
                            ' Nothing to say and nothing to show: no text, no highlight and no border. A
                            ' BORDERED blank cell is the one that must not be dropped here — an empty box is
                            ' exactly what someone draws a border FOR.
                            Continue For
                        End If

                        written += 1
                        rowXml.Append(OneCell(sheet, styles, cell, row, column, text))
                    Next

                    If rowXml.Length = 0 Then
                        Continue For
                    End If

                    Dim height As Double = sheet.RowHeightOf(row)
                    Dim own As Boolean = Math.Abs(height - sheet.RowHeight) > 0.01
                    rows.Append("<row r=""").Append(row).Append(""""c)
                    If own Then
                        rows.Append(" ht=""").Append(Number(PixelsToPoints(height))).Append(""" customHeight=""1""")
                    End If

                    rows.Append(">"c).Append(rowXml).Append("</row>")
                Next

                Return written
            End Function

            ''' <summary>One cell: a number, a formula with its result, or text — plus its own format when it has
            ''' one (no `s` at all means "the plain format", which is index 0).</summary>
            Private Shared Function OneCell(sheet As GrumpySheet, styles As StyleTable, cell As SheetCell,
                row As Integer, column As Integer, text As String) As String
                Dim address As String = GrumpySheet.CellName(row, column)
                Dim style As Integer = styles.Format(cell)
                Dim s As String = If(style > 0, " s=""" & style & """", String.Empty)
                If text.Length > 0 AndAlso text(0) = "="c Then
                    ' A formula keeps its text AND the value it worked out, so a reader that does not
                    ' calculate (or a print preview) still shows the answer.
                    Dim value As String = sheet.ValueOf(row, column)
                    Dim cache As String = If(LooksNumeric(value), "<v>" & Number(ValueNumber(value)) & "</v>", String.Empty)
                    Return "<c r=""" & address & """" & s & "><f>" & XmlText(text.Substring(1)) & "</f>" & cache & "</c>"
                End If

                If text.Length > 0 AndAlso LooksNumeric(text) Then
                    Return "<c r=""" & address & """" & s & "><v>" & Number(ValueNumber(text)) & "</v></c>"
                End If

                If text.Length = 0 Then
                    Return "<c r=""" & address & """" & s & " />"     ' a highlight with nothing in it
                End If

                ' Inline strings, not a shared table: the type attribute is what tells every reader these
                ' characters are a STRING, and it is the one thing a hand-written cell part gets wrong.
                ' XmlText, not Text: VB is case-INSENSITIVE, so a call to `Text(text)` binds to the String
                ' PARAMETER `text` and indexes it (compiles clean, throws at run time) — the escaper has a
                ' different name here for exactly that reason.
                Return "<c r=""" & address & """" & s & " t=""inlineStr""><is><t>" & XmlText(text) & "</t></is></c>"
            End Function

            ''' <summary>The value text a cell draws as a number, as a double. Only ever called for text that
            ''' already looks numeric.</summary>
            Private Shared Function ValueNumber(text As String) As Double
                Dim value As Double = 0.0
                Return If(Double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, value), value, 0.0)
            End Function

            ''' <summary>A number as XML: invariant, and never in exponent form for ordinary sizes — "1E-05" is
            ''' legal but unreadable in a cell someone opens in Excel.</summary>
            Private Shared Function Number(value As Double) As String
                Dim text As String = value.ToString("0.######", CultureInfo.InvariantCulture)
                Return If(text.Length = 0, "0", text)
            End Function

            ''' <summary>Text as XML: the five characters that would break the part are escaped, and the
            ''' control characters XML cannot carry at all are dropped.</summary>
            Friend Shared Function XmlText(value As String) As String
                Dim builder As New System.Text.StringBuilder(value.Length + 8)
                For i As Integer = 0 To value.Length - 1
                    Dim c As Char = value(i)
                    If c = "&"c Then
                        builder.Append("&amp;")
                    ElseIf c = "<"c Then
                        builder.Append("&lt;")
                    ElseIf c = ">"c Then
                        builder.Append("&gt;")
                    ElseIf c = """"c Then
                        builder.Append("&quot;")
                    ElseIf c < " "c AndAlso c <> ChrW(9) AndAlso c <> ChrW(10) AndAlso c <> ChrW(13) Then
                        Continue For
                    Else
                        builder.Append(c)
                    End If
                Next

                Return builder.ToString()
            End Function

            Private Shared Sub WritePart(zip As ZipArchive, name As String, xml As String)
                Dim entry As ZipArchiveEntry = zip.CreateEntry(name, CompressionLevel.Optimal)
                Using stream As Stream = entry.Open()
                    Dim bytes As Byte() = New System.Text.UTF8Encoding(False).GetBytes(xml)
                    stream.Write(bytes, 0, bytes.Length)
                End Using
            End Sub

            ' ---- the format tables ------------------------------------------------------------------

            ''' <summary>
            ''' Excel names every look twice over: a font table, a fill table, and a table of CELL FORMATS
            ''' that points into both, which is what a cell's `s` index selects. Two cells that look the same
            ''' share one entry — a 10 000-cell sheet of plain numbers still writes three entries.
            ''' </summary>
            Private NotInheritable Class StyleTable
                Private Const EmptyBorder As String =
                    "<border><left /><right /><top /><bottom /><diagonal /></border>"

                Private ReadOnly _sheet As GrumpySheet
                Private ReadOnly _fonts As New List(Of String)()
                Private ReadOnly _fills As New List(Of String)()
                Private ReadOnly _borders As New List(Of String)()
                Private ReadOnly _formats As New List(Of String)()
                Private ReadOnly _fontAt As New Dictionary(Of String, Integer)(StringComparer.Ordinal)
                Private ReadOnly _fillAt As New Dictionary(Of String, Integer)(StringComparer.Ordinal)
                Private ReadOnly _borderAt As New Dictionary(Of String, Integer)(StringComparer.Ordinal)
                Private ReadOnly _formatAt As New Dictionary(Of String, Integer)(StringComparer.Ordinal)

                Friend Sub New(sheet As GrumpySheet)
                    _sheet = sheet
                    _fills.Add("<fill><patternFill /></fill>")                          ' 0: no fill
                    _fills.Add("<fill><patternFill patternType=""gray125"" /></fill>")  ' 1: Excel's own
                    _borders.Add(EmptyBorder)                                           ' 0: no border
                    _fonts.Add(FontXml(False, False, sheet.FontSize, If(sheet.FontFamilyName, String.Empty), Nothing))
                    _formats.Add("<xf numFmtId=""0"" fontId=""0"" fillId=""0"" borderId=""0"" xfId=""0"" />")
                End Sub

                ''' <summary>This cell's format index, or 0 for "nothing of its own" — which is what makes a
                ''' plain cell a short element with no `s` at all.</summary>
                Friend Function Format(cell As SheetCell) As Integer
                    Dim bold As Boolean = cell.Bold
                    Dim italic As Boolean = cell.Italic
                    Dim size As Double = If(cell.FontSize > 0, cell.FontSize, _sheet.FontSize)
                    Dim family As String = If(String.IsNullOrWhiteSpace(cell.FontFamily),
                        If(_sheet.FontFamilyName, String.Empty), cell.FontFamily)
                    Dim text As Nullable(Of Color) = cell.TextColor
                    Dim fill As Nullable(Of Color) = cell.Fill

                    Dim fontKey As String = Flag(bold) & Flag(italic) & Number(size) & "|" & family & "|" &
                                            If(text.HasValue, Rgb(text.Value), "-")
                    Dim font As Integer = Intern(_fonts, _fontAt, fontKey, FontXml(bold, italic, size, family, text))
                    Dim fillId As Integer = 0
                    If fill.HasValue Then
                        fillId = Intern(_fills, _fillAt, Rgb(fill.Value),
                            "<fill><patternFill patternType=""solid""><fgColor rgb=""" & Rgb(fill.Value) &
                            """ /><bgColor indexed=""64"" /></patternFill></fill>")
                    End If

                    Dim borderLook As String = BorderKey(cell)
                    Dim borderId As Integer = 0
                    If borderLook.Length > 0 Then
                        borderId = Intern(_borders, _borderAt, borderLook, BorderXml(cell))
                    End If

                    Dim align As String = If(cell.TextAlign = SheetAlign.Left, "left",
                        If(cell.TextAlign = SheetAlign.Center, "center",
                        If(cell.TextAlign = SheetAlign.Right, "right", String.Empty)))
                    If font = 0 AndAlso fillId = 0 AndAlso borderId = 0 AndAlso align.Length = 0 Then
                        Return 0
                    End If

                    Return Intern(_formats, _formatAt, font & "|" & fillId & "|" & borderId & "|" & align,
                        "<xf numFmtId=""0"" fontId=""" & font & """ fillId=""" & fillId &
                        """ borderId=""" & borderId & """ xfId=""0"" applyFont=""1"" applyFill=""1""" &
                        If(borderId > 0, " applyBorder=""1""", String.Empty) &
                        If(align.Length = 0, " />",
                            " applyAlignment=""1""><alignment horizontal=""" & align & """ /></xf>"))
                End Function

                ''' <summary>The OOXML line style that stands for a width in pixels. Excel has three that mean
                ''' anything at 100 % zoom — thin, medium, thick — and they are what anyone drawing these
                ''' lines by hand picks. Everything below medium is thin, which is also what a cell's width
                ''' of 0 means (the sheet's own one-pixel line).</summary>
                Private Shared Function EdgeStyle(thickness As Double) As String
                    If thickness >= 3 Then
                        Return "thick"
                    End If

                    Return If(thickness >= 2, "medium", "thin")
                End Function

                ''' <summary>The borders table's key for this cell, or empty when it asked for none — which
                ''' is what keeps a plain cell out of the table AND off the xf's borderId.</summary>
                Private Function BorderKey(cell As SheetCell) As String
                    If cell.BorderEdges = SheetBorderEdges.None Then
                        Return String.Empty
                    End If

                    Dim ink As Color = If(cell.BorderColor.HasValue, cell.BorderColor.Value, _sheet.GridColor)
                    Return EdgeStyle(cell.BorderThickness) & "|" & Rgb(ink) & "|" & CInt(cell.BorderEdges)
                End Function

                ''' <summary>One cell's border, in OOXML's own order (left, right, top, bottom, diagonal) —
                ''' an edge the cell did not ask for is written as an empty element, which is how a border
                ''' says which of its sides are bare.</summary>
                Private Function BorderXml(cell As SheetCell) As String
                    Dim weight As String = EdgeStyle(cell.BorderThickness)
                    Dim ink As String = Rgb(If(cell.BorderColor.HasValue, cell.BorderColor.Value, _sheet.GridColor))
                    Dim edges As SheetBorderEdges = cell.BorderEdges
                    Return "<border>" &
                           EdgeXml("left", (edges And SheetBorderEdges.Left) <> 0, weight, ink) &
                           EdgeXml("right", (edges And SheetBorderEdges.Right) <> 0, weight, ink) &
                           EdgeXml("top", (edges And SheetBorderEdges.Top) <> 0, weight, ink) &
                           EdgeXml("bottom", (edges And SheetBorderEdges.Bottom) <> 0, weight, ink) &
                           "<diagonal /></border>"
                End Function

                Private Shared Function EdgeXml(side As String, wanted As Boolean, weight As String,
                    ink As String) As String
                    If Not wanted Then
                        Return "<" & side & " />"
                    End If

                    Return "<" & side & " style=""" & weight & """><color rgb=""" & ink & """ /></" & side & ">"
                End Function

                ''' <summary>The whole styles part, with each table's count beside it (Excel ignores the counts
                ''' and reads the tables, but LibreOffice is happier when they agree).</summary>
                Friend Function Document() As String
                    Return "<?xml version=""1.0"" encoding=""UTF-8"" standalone=""yes""?>" &
                           "<styleSheet xmlns=""" & Main & """>" &
                           "<fonts count=""" & _fonts.Count & """>" & String.Concat(_fonts) & "</fonts>" &
                           "<fills count=""" & _fills.Count & """>" & String.Concat(_fills) & "</fills>" &
                           "<borders count=""" & _borders.Count & """>" & String.Concat(_borders) & "</borders>" &
                           "<cellStyleXfs count=""1""><xf numFmtId=""0"" fontId=""0"" fillId=""0"" borderId=""0"" /></cellStyleXfs>" &
                           "<cellXfs count=""" & _formats.Count & """>" & String.Concat(_formats) & "</cellXfs>" &
                           "<cellStyles count=""1""><cellStyle name=""Normal"" xfId=""0"" builtinId=""0"" /></cellStyles>" &
                           "</styleSheet>"
                End Function

                Private Shared Function FontXml(bold As Boolean, italic As Boolean, size As Double, family As String,
                    text As Nullable(Of Color)) As String
                    Return "<font><name val=""" & XmlText(If(family.Length = 0, "Calibri", family)) & """ />" &
                           If(bold, "<b />", String.Empty) & If(italic, "<i />", String.Empty) &
                           If(text.HasValue, "<color rgb=""" & Rgb(text.Value) & """ />", String.Empty) &
                           "<sz val=""" & Number(size) & """ /></font>"
                End Function

                Private Shared Function Intern(table As List(Of String), at As Dictionary(Of String, Integer),
                    key As String, xml As String) As Integer
                    Dim found As Integer
                    If at.TryGetValue(key, found) Then
                        Return found
                    End If

                    table.Add(xml)
                    at(key) = table.Count - 1
                    Return table.Count - 1
                End Function

                Private Shared Function Flag(isOn As Boolean) As String
                    Return If(isOn, "1", "0")
                End Function
            End Class

            ''' <summary>A colour as the eight hexadecimal digits a workbook uses — ARGB, opaque.</summary>
            Friend Shared Function Rgb(color As Color) As String
                Return "FF" & color.R.ToString("X2", CultureInfo.InvariantCulture) &
                       color.G.ToString("X2", CultureInfo.InvariantCulture) &
                       color.B.ToString("X2", CultureInfo.InvariantCulture)
            End Function

            ' ---- reading --------------------------------------------------------------------------

            ''' <summary>The workbook's page names in order. An unreadable file simply has none.</summary>
            Friend Shared Function Pages(path As String) As List(Of String)
                Dim names As New List(Of String)()
                Try
                    Using zip As ZipArchive = OpenBook(path)
                        Dim book As XDocument = XlsxPart(zip, "xl/workbook.xml")
                        If book Is Nothing Then
                            Return names
                        End If

                        For Each element As XElement In book.Descendants()
                            If element.Name.LocalName = "sheet" Then
                                Dim name As XAttribute = element.Attribute("name")
                                names.Add(If(name Is Nothing, String.Empty, name.Value))
                            End If
                        Next
                    End Using
                Catch
                    ' Not a workbook, or not readable: the caller treats "no pages" as "no file to load".
                End Try

                Return names
            End Function

            ''' <summary>
            ''' Reads one page into the sheet and answers how many cells it put there. Everything the sheet
            ''' already held is cleared first; the sheet grows to fit the page, never shrinks to it. Answers -1
            ''' when there is no such page, so the caller can say so rather than report an empty load as a
            ''' success.
            ''' </summary>
            Friend Shared Function Read(sheet As GrumpySheet, path As String, page As String) As Integer
                Using zip As ZipArchive = OpenBook(path)
                    Dim book As XDocument = XlsxPart(zip, "xl/workbook.xml")
                    Dim part As String = SheetPart(zip, book, page)
                    If part Is Nothing Then
                        Return -1
                    End If

                    Dim pool As List(Of String) = SharedStrings(zip)
                    Dim formatTable As List(Of CellFormat) = Formats(zip)
                    Dim cells As XDocument = XlsxPart(zip, part)
                    If cells Is Nothing Then
                        Return -1
                    End If

                    Dim built As New List(Of SheetCell)()
                    Dim widths As New Dictionary(Of Integer, Double)()
                    Dim heights As New Dictionary(Of Integer, Double)()
                    Dim lastRow As Integer = 0
                    Dim lastColumn As Integer = 0
                    Dim kept As Integer = 0
                    For Each row As XElement In cells.Descendants()
                        If row.Name.LocalName = "col" Then
                            ReadColumn(row, widths)     ' <cols> sits beside the rows, not inside them
                            Continue For
                        End If

                        If row.Name.LocalName <> "row" Then
                            Continue For
                        End If

                        Dim number As String = Attr(row, "r")
                        Dim at As Integer = 0
                        If number IsNot Nothing Then
                            Integer.TryParse(number, NumberStyles.Integer, CultureInfo.InvariantCulture, at)
                        End If

                        If at <= 0 Then
                            Continue For                  ' a row with no number cannot be placed
                        End If

                        Dim height As String = Attr(row, "ht")
                        Dim points As Double = 0.0
                        If height IsNot Nothing AndAlso Double.TryParse(height, NumberStyles.Float,
                                CultureInfo.InvariantCulture, points) AndAlso points > 0 Then
                            heights(at) = PointsToPixels(points)
                        End If

                        For Each cell As XElement In row.Elements()
                            If cell.Name.LocalName <> "c" Then
                                Continue For
                            End If

                            Dim built2 As SheetCell = CellFrom(cell, pool, formatTable)
                            If built2 Is Nothing Then
                                Continue For
                            End If

                            ' A border colour that IS the sheet's own grid colour comes back as no colour at
                            ' all: a workbook cannot tell "the grid colour" from "no colour chosen", and a
                            ' form that grew an attribute per reloaded cell would be longer every time.
                            If built2.BorderColor.HasValue AndAlso built2.BorderColor.Value = sheet.GridColor Then
                                built2.BorderColor = Nothing
                            End If

                            lastRow = Math.Max(lastRow, built2.Row)
                            lastColumn = Math.Max(lastColumn, built2.Column)
                            kept += 1
                            built.Add(built2)
                        Next
                    Next

                    ' Grow — never shrink — and only then fill: a page smaller than the sheet leaves the
                    ' sheet's own shape alone, which is what a form that sized its grid wants.
                    sheet.Cells.Clear()
                    sheet.ClearSizes()
                    sheet.Rows = Math.Max(sheet.Rows, Math.Max(1, lastRow))
                    sheet.Columns = Math.Max(sheet.Columns, Math.Max(1, lastColumn))
                    sheet.Cells.AddRange(built)
                    For Each pair As KeyValuePair(Of Integer, Double) In widths
                        sheet.SetColumnWidth(pair.Key, pair.Value)
                    Next

                    For Each pair As KeyValuePair(Of Integer, Double) In heights
                        sheet.SetRowHeight(pair.Key, pair.Value)
                    Next

                    sheet.InvalidateValues()
                    Return kept
                End Using
            End Function

            ''' <summary>A workbook part by name, or Nothing. The lookup is case-insensitive because a file
            ''' written on Windows may spell its own parts either way.</summary>
            Private Shared Function XlsxPart(zip As ZipArchive, name As String) As XDocument
                For Each entry As ZipArchiveEntry In zip.Entries
                    If String.Equals(entry.FullName, name, StringComparison.OrdinalIgnoreCase) Then
                        Using stream As Stream = entry.Open()
                            Return XDocument.Load(stream)
                        End Using
                    End If
                Next

                Return Nothing
            End Function

            ''' <summary>A pixel width as the character width a workbook stores, as text.</summary>
            Friend Shared Function WidthNumber(pixels As Double) As String
                Return Number(PixelsToWidth(pixels))
            End Function

            Private Shared Function OpenBook(path As String) As ZipArchive
                ' ReadWrite sharing: a workbook the user still has open in Excel is exactly the one they are
                ' most likely to load from.
                Return New ZipArchive(New FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite),
                    ZipArchiveMode.Read)
            End Function

            ''' <summary>An attribute's value, or Nothing. (Named "Attr": "Attribute" would read as VB's own
            ''' attribute syntax at every call site.)</summary>
            Private Shared Function Attr(element As XElement, name As String) As String
                Dim found As XAttribute = element.Attribute(name)
                Return If(found Is Nothing, Nothing, found.Value)
            End Function

            ''' <summary>The sheet part to read: the page asked for by name, else the first one. The r:id on
            ''' each sheet is resolved through the workbook's relationships, so the order of the PARTS in the
            ''' zip does not matter — only the order of the pages in the workbook does.</summary>
            Private Shared Function SheetPart(zip As ZipArchive, book As XDocument, page As String) As String
                If book Is Nothing Then
                    Return Nothing
                End If

                Dim wanted As String = Nothing
                Dim first As String = Nothing
                For Each element As XElement In book.Descendants()
                    If element.Name.LocalName <> "sheet" Then
                        Continue For
                    End If

                    Dim id As String = RelationshipOf(element)
                    If first Is Nothing Then
                        first = id
                    End If

                    Dim name As String = If(Attr(element, "name"), String.Empty)
                    If page IsNot Nothing AndAlso String.Equals(name, page, StringComparison.OrdinalIgnoreCase) Then
                        wanted = id
                        Exit For
                    End If
                Next

                Dim wantedId As String = If(wanted, first)   ' a page that is not there falls back to the first
                If wantedId Is Nothing Then
                    Return Nothing
                End If

                Dim rels As XDocument = XlsxPart(zip, "xl/_rels/workbook.xml.rels")
                If rels Is Nothing Then
                    Return Nothing
                End If

                For Each element As XElement In rels.Descendants()
                    ' "Relationship", capitalised — the one name in these parts that is, so it is compared
                    ' without regard to case rather than trusting to a spelling nobody can remember.
                    If Not String.Equals(element.Name.LocalName, "relationship", StringComparison.OrdinalIgnoreCase) Then
                        Continue For
                    End If

                    If Not String.Equals(Attr(element, "Id"), wantedId, StringComparison.OrdinalIgnoreCase) Then
                        Continue For
                    End If

                    Dim target As String = If(Attr(element, "Target"), String.Empty)
                    Dim trimmed As String = target.Replace("\"c, "/"c).Trim()
                    If trimmed.StartsWith("/", StringComparison.Ordinal) Then
                        trimmed = trimmed.TrimStart("/"c)
                    Else
                        trimmed = "xl/" & trimmed
                    End If

                    While trimmed.Contains("../", StringComparison.Ordinal)
                        Dim at As Integer = trimmed.IndexOf("../", StringComparison.Ordinal)
                        Dim cut As Integer = trimmed.LastIndexOf("/"c, Math.Max(0, at - 1))
                        trimmed = If(cut <= 0, trimmed.Substring(at + 3),
                            trimmed.Substring(0, cut + 1) & trimmed.Substring(at + 3))
                    End While

                    Return trimmed
                Next

                Return Nothing
            End Function

            ''' <summary>A sheet element's relationship id. It is written namespaced — r:id — so it is found by
            ''' its LOCAL name, the way every other part of this reader is read.</summary>
            Private Shared Function RelationshipOf(sheetElement As XElement) As String
                For Each attribute As XAttribute In sheetElement.Attributes()
                    If attribute.Name.LocalName = "id" Then
                        Return attribute.Value
                    End If
                Next

                Return Nothing
            End Function

            ''' <summary>The workbook's shared strings, in order. A file with none (this control writes inline
            ''' strings) simply gets an empty table.</summary>
            Private Shared Function SharedStrings(zip As ZipArchive) As List(Of String)
                Dim strings As New List(Of String)()
                Dim part As XDocument = XlsxPart(zip, "xl/sharedStrings.xml")
                If part Is Nothing Then
                    Return strings
                End If

                For Each element As XElement In part.Descendants()
                    If element.Name.LocalName = "si" Then
                        Dim builder As New System.Text.StringBuilder()
                        For Each text As XElement In element.Descendants()
                            If text.Name.LocalName = "t" Then
                                builder.Append(text.Value)
                            End If
                        Next

                        strings.Add(builder.ToString())
                    End If
                Next

                Return strings
            End Function

            ''' <summary>One cell, translated: its text (a formula keeps its '='), and whatever formatting the
            ''' file gives it. Nothing for a cell with nothing to say and nothing to show.</summary>
            Private Shared Function CellFrom(cell As XElement, pool As List(Of String),
                formatTable As List(Of CellFormat)) As SheetCell
                Dim reference As String = Attr(cell, "r")
                Dim row As Integer = 0
                Dim column As Integer = 0
                If reference Is Nothing OrElse Not GrumpySheet.ParseCellName(reference, row, column) Then
                    Return Nothing
                End If

                Dim text As String = String.Empty
                Dim formula As String = String.Empty
                For Each child As XElement In cell.Elements()
                    If child.Name.LocalName = "f" Then
                        formula = "=" & child.Value
                        Continue For
                    End If

                    If child.Name.LocalName <> "v" Then
                        Continue For
                    End If

                    Dim type As String = Attr(cell, "t")
                    If type = "s" Then
                        Dim at As Integer = 0
                        If Integer.TryParse(child.Value, NumberStyles.Integer, CultureInfo.InvariantCulture, at) AndAlso
                           at >= 0 AndAlso at < pool.Count Then
                            text = pool(at)
                        End If
                    ElseIf type = "b" Then
                        text = If(child.Value = "1", "TRUE", "FALSE")
                    Else
                        text = child.Value
                    End If
                Next

                If formula.Length > 0 Then
                    text = formula                       ' the sheet works its own answers out again
                ElseIf text.Length = 0 Then
                    Dim inline As String = InlineText(cell)
                    If inline IsNot Nothing Then
                        text = inline
                    End If
                End If

                Dim style As String = Attr(cell, "s")
                Dim styleAt As Integer = 0
                If style IsNot Nothing Then
                    Integer.TryParse(style, NumberStyles.Integer, CultureInfo.InvariantCulture, styleAt)
                End If

                Dim format As CellFormat = If(styleAt >= 0 AndAlso styleAt < formatTable.Count, formatTable(styleAt), Nothing)
                If text.Length = 0 AndAlso (format Is Nothing OrElse
                    (Not format.Fill.HasValue AndAlso format.Edges = SheetBorderEdges.None)) Then
                    Return Nothing                       ' neither a value, a highlight nor a border: nothing
                End If

                Dim built As New SheetCell()
                built.Row = row
                built.Column = column
                built.Text = text
                If format IsNot Nothing Then
                    built.Bold = format.Bold
                    built.Italic = format.Italic
                    built.FontSize = format.Size
                    built.FontFamily = format.Family
                    built.TextColor = format.Text
                    built.Fill = format.Fill
                    built.TextAlign = format.Align
                    built.BorderEdges = format.Edges
                    built.BorderThickness = format.EdgeThickness
                    built.BorderColor = format.EdgeColour
                End If

                Return built
            End Function

            ''' <summary>An inline string's text (this control's own spelling), or Nothing when the cell has no
            ''' inline string at all.</summary>
            Private Shared Function InlineText(cell As XElement) As String
                If Attr(cell, "t") <> "inlineStr" Then
                    Return Nothing
                End If

                Dim builder As New System.Text.StringBuilder()
                For Each text As XElement In cell.Descendants()
                    If text.Name.LocalName = "t" Then
                        builder.Append(text.Value)
                    End If
                Next

                Return builder.ToString()
            End Function

            ''' <summary>One col element: its width and the columns it covers. Excel stores a width in
            ''' characters, and only the columns that differ from the sheet's default carry one.</summary>
            Private Shared Sub ReadColumn(col As XElement, widths As Dictionary(Of Integer, Double))
                Dim width As String = Attr(col, "width")
                Dim characters As Double = 0.0
                If width Is Nothing OrElse
                   Not Double.TryParse(width, NumberStyles.Float, CultureInfo.InvariantCulture, characters) Then
                    Return
                End If

                Dim first As Integer = 0
                Dim last As Integer = 0
                Integer.TryParse(If(Attr(col, "min"), String.Empty), NumberStyles.Integer,
                    CultureInfo.InvariantCulture, first)
                Integer.TryParse(If(Attr(col, "max"), String.Empty), NumberStyles.Integer,
                    CultureInfo.InvariantCulture, last)
                If first <= 0 Then
                    Return
                End If

                If last < first Then
                    last = first
                End If

                For column As Integer = first To last
                    widths(column) = WidthToPixels(characters)
                Next
            End Sub

            ''' <summary>One look, read out of the styles part: everything a cell of that format carries.</summary>
            Private NotInheritable Class CellFormat
                Friend Bold As Boolean
                Friend Italic As Boolean
                Friend Size As Double
                Friend Family As String
                Friend Text As Nullable(Of Color)
                Friend Fill As Nullable(Of Color)
                Friend Align As SheetAlign = SheetAlign.Auto
                Friend Edges As SheetBorderEdges = SheetBorderEdges.None
                Friend EdgeThickness As Double
                Friend EdgeColour As Nullable(Of Color)
            End Class

            ''' <summary>The styles part, as a lookup from a cell's `s` index to what it means.</summary>
            Private Shared Function Formats(zip As ZipArchive) As List(Of CellFormat)
                Dim list As New List(Of CellFormat)()
                Dim styles As XDocument = XlsxPart(zip, "xl/styles.xml")
                If styles Is Nothing Then
                    Return list
                End If

                Dim fonts As New List(Of XElement)()
                Dim fills As New List(Of XElement)()
                Dim borders As New List(Of XElement)()
                Dim xfs As New List(Of XElement)()
                For Each element As XElement In styles.Descendants()
                    If element.Name.LocalName = "font" AndAlso element.Parent IsNot Nothing AndAlso
                       element.Parent.Name.LocalName = "fonts" Then
                        fonts.Add(element)
                    ElseIf element.Name.LocalName = "fill" AndAlso element.Parent IsNot Nothing AndAlso
                           element.Parent.Name.LocalName = "fills" Then
                        fills.Add(element)
                    ElseIf element.Name.LocalName = "border" AndAlso element.Parent IsNot Nothing AndAlso
                           element.Parent.Name.LocalName = "borders" Then
                        borders.Add(element)
                    ElseIf element.Name.LocalName = "xf" AndAlso element.Parent IsNot Nothing AndAlso
                           element.Parent.Name.LocalName = "cellXfs" Then
                        xfs.Add(element)
                    End If
                Next

                For Each xf As XElement In xfs
                    Dim format As New CellFormat()
                    Dim font As XElement = Nth(fonts, Attr(xf, "fontId"))
                    If font IsNot Nothing Then
                        format.Bold = Has(font, "b")
                        format.Italic = Has(font, "i")
                        For Each child As XElement In font.Elements()
                            If child.Name.LocalName = "sz" Then
                                Dim size As Double = 0.0
                                If Double.TryParse(If(Attr(child, "val"), String.Empty), NumberStyles.Float,
                                        CultureInfo.InvariantCulture, size) AndAlso size > 0 Then
                                    format.Size = size
                                End If
                            ElseIf child.Name.LocalName = "name" Then
                                format.Family = Attr(child, "val")
                            ElseIf child.Name.LocalName = "color" Then
                                format.Text = Colour(child)
                            End If
                        Next
                    End If

                    Dim fill As XElement = Nth(fills, Attr(xf, "fillId"))
                    If fill IsNot Nothing Then
                        For Each child As XElement In fill.Descendants()
                            If child.Name.LocalName = "fgColor" Then
                                format.Fill = Colour(child)      ' a solid pattern's colour is here
                            End If
                        Next
                    End If

                    ' The border: which sides this format lines, how heavy, and in what colour. A side is
                    ' bordered when its element names a style (an empty element, or style="none", is a bare
                    ' side) — that is the whole of OOXML's answer to the same question this control asks.
                    Dim border As XElement = Nth(borders, Attr(xf, "borderId"))
                    If border IsNot Nothing Then
                        For Each child As XElement In border.Elements()
                            Dim side As String = child.Name.LocalName
                            Dim picked As SheetBorderEdges = If(side = "left", SheetBorderEdges.Left,
                                If(side = "right", SheetBorderEdges.Right,
                                If(side = "top", SheetBorderEdges.Top,
                                If(side = "bottom", SheetBorderEdges.Bottom, SheetBorderEdges.None))))
                            Dim weight As String = Attr(child, "style")
                            If picked = SheetBorderEdges.None OrElse weight Is Nothing OrElse weight = "none" Then
                                Continue For
                            End If

                            format.Edges = format.Edges Or picked
                            Dim edges As Double = StyleThickness(weight)
                            If edges > format.EdgeThickness Then
                                format.EdgeThickness = edges
                            End If

                            For Each ink As XElement In child.Elements()
                                If ink.Name.LocalName = "color" AndAlso Not format.EdgeColour.HasValue Then
                                    format.EdgeColour = Colour(ink)
                                End If
                            Next
                        Next
                    End If

                    For Each child As XElement In xf.Descendants()
                        If child.Name.LocalName <> "alignment" Then
                            Continue For
                        End If

                        Dim horizontal As String = Attr(child, "horizontal")
                        format.Align = If(horizontal = "center", SheetAlign.Center,
                            If(horizontal = "right", SheetAlign.Right,
                            If(horizontal = "left", SheetAlign.Left, SheetAlign.Auto)))
                    Next

                    list.Add(format)
                Next

                Return list
            End Function

            Private Shared Function Nth(list As List(Of XElement), index As String) As XElement
                Dim slot As Integer = 0
                If index IsNot Nothing Then
                    Integer.TryParse(index, NumberStyles.Integer, CultureInfo.InvariantCulture, slot)
                End If

                Return If(slot >= 0 AndAlso slot < list.Count, list(slot), Nothing)
            End Function

            ''' <summary>An OOXML line style as a width in pixels — the inverse of what the writer chooses.
            ''' Everything Excel can draw that this control cannot is read as a one-pixel line, which keeps
            ''' the borrowed border visible rather than dropping it.</summary>
            Private Shared Function StyleThickness(weight As String) As Double
                Dim name As String = weight.Trim().ToLowerInvariant()
                If name = "thick" OrElse name = "double" Then
                    Return 3
                End If

                Return If(name = "medium" OrElse name = "mediumdashed", 2, 1)
            End Function

            ''' <summary>Does this element have a child of that name? (A loop, not LINQ: a bundled file must
            ''' compile in a host project that imports nothing it does not import itself.)</summary>
            Private Shared Function Has(element As XElement, name As String) As Boolean
                For Each child As XElement In element.Elements()
                    If child.Name.LocalName = name Then
                        Return True
                    End If
                Next

                Return False
            End Function

            ''' <summary>A colour element as a colour: the six RGB digits of an eight-digit value. A THEME
            ''' colour (what Excel writes for the default text) answers Nothing, so the cell keeps the sheet's
            ''' own colour instead of guessing at a theme it cannot see.</summary>
            Private Shared Function Colour(element As XElement) As Nullable(Of Color)
                Dim rgb As String = Attr(element, "rgb")
                If String.IsNullOrWhiteSpace(rgb) Then
                    Return Nothing
                End If

                Dim digits As String = rgb.Trim()
                If digits.Length = 8 Then
                    digits = digits.Substring(2)             ' drop the alpha: the sheet's colours are opaque
                End If

                Dim r As Byte = 0
                Dim g As Byte = 0
                Dim b As Byte = 0
                If digits.Length <> 6 OrElse
                   Not Byte.TryParse(digits.Substring(0, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, r) OrElse
                   Not Byte.TryParse(digits.Substring(2, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, g) OrElse
                   Not Byte.TryParse(digits.Substring(4, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, b) Then
                    Return Nothing
                End If

                Return Color.FromArgb(255, r, g, b)
            End Function
        End Class

        ''' <summary>The cols element for the columns a border was dragged on, or nothing when they are all
        ''' the sheet's own width.</summary>
        Private Function ColumnsElement() As String
            Dim element As String = String.Empty
            For column As Integer = 1 To ColumnCount
                Dim width As Double = ColumnWidthOf(column)
                If Math.Abs(width - ColumnWidth) <= 0.01 Then
                    Continue For
                End If

                element &= "<col min=""" & column & """ max=""" & column & """ width=""" &
                           Xlsx.WidthNumber(width) & """ customWidth=""1"" />"
            Next

            Return If(element.Length = 0, String.Empty, "<cols>" & element & "</cols>")
        End Function

        ' ---- formulas ---------------------------------------------------------------------------
        ' What each formula cell works out to, kept until any cell's text changes (see InvalidateValues).
        ' Working it out on demand costs one pass per EDIT rather than one per repaint, and a chain of
        ' formulas — B1=A1*2, C1=B1+1 — is walked once instead of once per cell drawn.
        Private ReadOnly _values As New Dictionary(Of Long, String)()
        ' The cells currently being worked out, so a formula that reaches itself is named (#CYCLE!) rather
        ' than recursing until the stack runs out.
        Private ReadOnly _evaluating As New HashSet(Of Long)()

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
        Private _menuKind As MenuKind = MenuKind.Context
        Private _menuWidth As Double = MenuWidth
        Private _menuOpen As Boolean
        Private _menuX As Double
        Private _menuY As Double
        Private _menuHot As Integer = -1

        ' Where the panel CHAIN opened — the right-click point. A line of the menu can open another panel (the
        ' palette is not the picker, and Borders is three choices), and every panel updates this, so a chain
        ' stacks in one place the user is already looking at instead of walking across the sheet.
        Private _chainX As Double
        Private _chainY As Double

        ' What the colour and border panels are working with. The border choices are REMEMBERED on the sheet
        ' because each line applies on its own — choosing a thickness after choosing the edges has to know
        ' which thickness the edges were drawn with, and the next edge choice uses the last colour.
        Private _borderChoice As BorderChoice = BorderChoice.None
        Private _borderThickness As Double = BorderThin
        Private _borderColour As Nullable(Of Color)

        ''' <summary>The colour the picker is mixing, and the two lines that have to follow it.</summary>
        Private _pick As Color = Colors.Black
        Private _pickPreview As SheetMenuItem
        Private _pickUse As SheetMenuItem

        ''' <summary>The slider being dragged, or -1. The pointer is captured for it, so the knob follows
        ''' past the edge of the panel.</summary>
        Private _slider As Integer = -1

        ''' <summary>Where in the editor text the '=' that opened the macro list sits, or -1.</summary>
        Private _macroStart As Integer = -1

        ' The last BLOCK that was selected, kept because of the order a total is usually written in: pick
        ' the column of figures, then click the cell the total goes in, then type "=sum". By then the block is
        ' no longer selected, so without this the formula would arrive empty — and a formula committed INTO
        ' the block it reads can only ever be #CYCLE!.
        Private _rangeFirstRow As Integer
        Private _rangeFirstColumn As Integer
        Private _rangeLastRow As Integer
        Private _rangeLastColumn As Integer

        Shared Sub New()
            AffectsRender(Of GrumpySheet)(RowsProperty, ColumnsProperty, ColumnWidthProperty, RowHeightProperty,
                HeaderWidthProperty, HeaderHeightProperty, ShowHeadersProperty, ShowFormulaBarProperty,
                ShowScrollBarsProperty, ShowToolbarProperty, EditBackColorProperty, EditTextColorProperty,
                FontFamilyNameProperty, FontSizeProperty, GridColorProperty, HeaderBackColorProperty,
                HeaderTextColorProperty, CellBackColorProperty, TextColorProperty, SelectionColorProperty,
                SelectionFillColorProperty)
            AffectsMeasure(Of GrumpySheet)(RowsProperty, ColumnsProperty, ColumnWidthProperty, RowHeightProperty,
                HeaderWidthProperty, HeaderHeightProperty, ShowHeadersProperty, ShowFormulaBarProperty,
                ShowToolbarProperty)
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

        ''' <summary>Draw the toolbar (File and Print) at all.</summary>
        Public Property ShowToolbar As Boolean
            Get
                Return GetValue(ShowToolbarProperty)
            End Get
            Set(value As Boolean)
                SetValue(ShowToolbarProperty, value)
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

        ''' <summary>The backcolour of the fx box — the cell edit box at the top of the sheet.</summary>
        Public Property EditBackColor As Color
            Get
                Return GetValue(EditBackColorProperty)
            End Get
            Set(value As Color)
                SetValue(EditBackColorProperty, value)
            End Set
        End Property

        ''' <summary>The colour of the text in the fx box.</summary>
        Public Property EditTextColor As Color
            Get
                Return GetValue(EditTextColorProperty)
            End Get
            Set(value As Color)
                SetValue(EditTextColorProperty, value)
            End Set
        End Property

        ''' <summary>Which way round the page is when the sheet is printed or exported.</summary>
        Public Property PrintOrientation As SheetOrientation
            Get
                Return GetValue(PrintOrientationProperty)
            End Get
            Set(value As SheetOrientation)
                SetValue(PrintOrientationProperty, value)
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
            InvalidateValues()                 ' every formula that reads this cell has to be worked out again
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

        ''' <summary>
        ''' Sets one cell's border: which of its edges are lined, how thick, and in what colour. The whole
        ''' border goes in one call because a cell keeps one thickness and one colour for every edge it has
        ''' (SheetCell.BorderEdges).
        '''
        ''' edges = None is what TURNS THE BORDER OFF, colour and width included: leaving either behind would
        ''' mean a cell that looks plain remembering a border the moment edges came back, which is not what
        ''' "no border" means to anyone. A thickness of 0 or less is NOT "no border" — it is the sheet's own
        ''' one-pixel line, so the edges alone are enough to ask for one.
        '''
        ''' A thickness of 1 px drawn exactly on the cell's edge covers the 1 px grid line under it, so a
        ''' default-coloured thin border looks like the grid — that is the point of BorderColor's null.
        ''' </summary>
        Public Sub SetBorder(row As Integer, column As Integer, edges As SheetBorderEdges,
                             thickness As Double, color As Nullable(Of Color))
            Dim cell As SheetCell = EnsureCell(row, column)
            If cell Is Nothing Then
                Return
            End If

            If edges = SheetBorderEdges.None Then
                thickness = 0
                color = Nothing
            End If

            If cell.BorderEdges = edges AndAlso Math.Abs(cell.BorderThickness - thickness) < 0.001 AndAlso
                cell.BorderColor = color Then
                Return
            End If

            cell.BorderEdges = edges
            cell.BorderThickness = thickness
            cell.BorderColor = color
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
            cell.BorderEdges = SheetBorderEdges.None
            cell.BorderThickness = 0
            cell.BorderColor = Nothing
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
            InvalidateValues()
            InvalidateVisual()
        End Sub

        Private Sub OnCellChanged(row As Integer, column As Integer, text As String)
            RaiseEvent CellChanged(Me, New SheetCellChangedEventArgs(row, column, text))
        End Sub

        Private Sub RaiseSelectionChanged()
            ' Remember a block while it IS the selection: it is what the macro list offers as a range after
            ' the pointer has moved on to the cell the formula is going into (see SelectedRangeText).
            If SelectionFirstRow() <> SelectionLastRow() OrElse SelectionFirstColumn() <> SelectionLastColumn() Then
                _rangeFirstRow = SelectionFirstRow()
                _rangeFirstColumn = SelectionFirstColumn()
                _rangeLastRow = SelectionLastRow()
                _rangeLastColumn = SelectionLastColumn()
            End If

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

        ''' <summary>Where the grid's cells start, allowing for the toolbar, the bar and the headers.</summary>
        Private ReadOnly Property GridOrigin As Point
            Get
                Dim x As Double = If(ShowHeaders, HeaderWidth, 0.0)
                Dim y As Double = ToolbarStrip + If(ShowFormulaBar, BarHeight, 0.0) + If(ShowHeaders, HeaderHeight, 0.0)
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

        ' ---- the toolbar ----------------------------------------------------------------------------
        ' Drawn by the control itself, like the grid, the bar, the menu and the scrollbars: two icon
        ' buttons and a line of status text. It is the reason a dropped sheet is USABLE with no code at
        ' all — Load…, Save… and Print… are already there — and ShowToolbar = False puts the sheet back
        ' exactly as it was before the strip existed.
        '
        ' File > Load… / Save… are the .xlsx reader and writer below. Print > Save as PNG… / Save as PDF… /
        ' Print…. The dialogs come from the platform, so they need a real window: in the designer's
        ' headless preview the buttons are drawn and the strip says why a menu leads nowhere.

        ''' <summary>Paints the strip: its two buttons, the hovering one's word, and the status line.</summary>
        Private Sub DrawToolbar(context As DrawingContext, size As Size, back As IBrush, text As IBrush,
            accent As IBrush)
            If Not ShowToolbar OrElse size.Width <= 0 Then
                Return
            End If

            context.FillRectangle(back, New Rect(0, 0, size.Width, ToolbarHeight))
            For i As Integer = 0 To ToolbarButtonCount - 1
                Dim button As Rect = ToolbarButtonRect(i)
                If i = _toolbarHot Then
                    context.FillRectangle(accent, button)
                End If

                If i = ToolbarFile Then
                    DrawFileIcon(context, button, text)
                Else
                    DrawPrintIcon(context, button, text)
                End If
            Next

            ' The word of the button under the pointer, beside the pair: the strip's own tooltip, drawn
            ' rather than asked of the framework, like everything else here.
            Dim afterButtons As Double = ToolbarButtonRect(ToolbarButtonCount - 1).Right + 4
            If _toolbarHot >= 0 Then
                DrawCellText(context, ToolbarLabel(_toolbarHot), New Rect(afterButtons, 0, 60, ToolbarHeight),
                    text, False, TextAlignment.Left)
            End If

            If _status.Length > 0 Then
                Dim statusLeft As Double = afterButtons + 66
                DrawCellText(context, _status,
                    New Rect(statusLeft, 0, Math.Max(0, size.Width - statusLeft - 6), ToolbarHeight),
                    text, False, TextAlignment.Right, -1, Nothing, Math.Max(9.0, FontSize - 1.0))
            End If

            context.DrawLine(New Pen(New SolidColorBrush(GridColor), 1.0), New Point(0, ToolbarHeight - 0.5),
                New Point(size.Width, ToolbarHeight - 0.5))
        End Sub

        ''' <summary>The File button's icon: a page with a folded corner and a few lines on it. Drawn from
        ''' rectangles and lines — the control ships no image files at all.</summary>
        Private Shared Sub DrawFileIcon(context As DrawingContext, button As Rect, ink As IBrush)
            Dim pen As New Pen(ink, 1.2)
            Dim x As Double = button.Center.X - 5.5
            Dim y As Double = button.Center.Y - 7.5
            context.DrawRectangle(Nothing, pen, New Rect(x, y, 11.0, 15.0))
            context.DrawLine(pen, New Point(x + 7.0, y), New Point(x + 7.0, y + 4.0))
            context.DrawLine(pen, New Point(x + 7.0, y + 4.0), New Point(x + 11.0, y + 4.0))
            For i As Integer = 0 To 2
                Dim line As Double = y + 8.0 + i * 3.0
                context.DrawLine(pen, New Point(x + 2.5, line),
                    New Point(x + If(i = 2, 6.0, 8.5), line))
            Next
        End Sub

        ''' <summary>The Print button's icon: the sheet going in at the top, the body of the printer, and the
        ''' page coming out below — plus its little lamp.</summary>
        Private Shared Sub DrawPrintIcon(context As DrawingContext, button As Rect, ink As IBrush)
            Dim pen As New Pen(ink, 1.2)
            Dim x As Double = button.Center.X - 7.0
            Dim y As Double = button.Center.Y - 7.0
            context.DrawRectangle(Nothing, pen, New Rect(x + 2.5, y, 9.0, 5.0))
            context.DrawRectangle(Nothing, pen, New Rect(x, y + 4.5, 14.0, 6.0))
            context.DrawRectangle(Nothing, pen, New Rect(x + 3.0, y + 10.0, 8.0, 4.5))
            context.FillRectangle(ink, New Rect(x + 10.5, y + 6.0, 2.0, 2.0))
        End Sub

        ' ---- the macro list a '=' opens ---------------------------------------------------------------
        '
        ' "=" is the one moment the sheet knows a FORMULA is wanted rather than a value, which makes it the
        ' right moment to offer the names. The list filters as more letters arrive; the pick lands in the fx
        ' box, with the cells that were selected already written in as the range. So the common case —
        ' select B2:B9, type "=su", press Enter — arrives complete, and the caret waits between the brackets
        ' when there was nothing to fill in.

        ''' <summary>One macro the list offers.</summary>
        Private NotInheritable Class SheetMacro
            ''' <summary>The name typed after '=', exactly as the parser dispatches it.</summary>
            Public Name As String = String.Empty

            ''' <summary>What it does, in a few words — drawn beside the name.</summary>
            Public Hint As String = String.Empty

            ''' <summary>Whether the selected cells are offered to it as a range: true for the readings
            ''' (Sum, Avg, StdDev …), false for the ones that take a plain value or a text.</summary>
            Public TakesRange As Boolean
        End Class

        ''' <summary>
        ''' Every macro the parser knows, in the order the list shows them: the readings a sheet is usually
        ''' asked for first, then the rest. EVERY name here is one Apply dispatches, which a test compares —
        ''' so the list can never offer something the engine cannot do.
        ''' </summary>
        Private Shared ReadOnly Macros As SheetMacro() = {
            New SheetMacro With {.Name = "Sum", .Hint = "the total of a range", .TakesRange = True},
            New SheetMacro With {.Name = "Avg", .Hint = "the average (Average works too)", .TakesRange = True},
            New SheetMacro With {.Name = "StdDev", .Hint = "sample standard deviation (n-1)", .TakesRange = True},
            New SheetMacro With {.Name = "StdDevP", .Hint = "population standard deviation (n)", .TakesRange = True},
            New SheetMacro With {.Name = "Max", .Hint = "the largest number", .TakesRange = True},
            New SheetMacro With {.Name = "Min", .Hint = "the smallest number", .TakesRange = True},
            New SheetMacro With {.Name = "Count", .Hint = "how many cells hold a number", .TakesRange = True},
            New SheetMacro With {.Name = "CountA", .Hint = "how many cells are not empty", .TakesRange = True},
            New SheetMacro With {.Name = "Abs", .Hint = "a number without its sign"},
            New SheetMacro With {.Name = "Round", .Hint = "Round(number, places)"},
            New SheetMacro With {.Name = "Int", .Hint = "rounds down to a whole number"},
            New SheetMacro With {.Name = "Sqrt", .Hint = "the square root"},
            New SheetMacro With {.Name = "Mod", .Hint = "the remainder: Mod(number, divisor)"},
            New SheetMacro With {.Name = "If", .Hint = "If(condition, then, else)"},
            New SheetMacro With {.Name = "And", .Hint = "true when every condition is"},
            New SheetMacro With {.Name = "Or", .Hint = "true when any condition is"},
            New SheetMacro With {.Name = "Not", .Hint = "the opposite of a condition"},
            New SheetMacro With {.Name = "Len", .Hint = "how many characters"},
            New SheetMacro With {.Name = "Upper", .Hint = "the text in capitals"},
            New SheetMacro With {.Name = "Lower", .Hint = "the text in small letters"},
            New SheetMacro With {.Name = "Trim", .Hint = "the text without spaces at the ends"}}

        ''' <summary>
        ''' Shows, hides or refilters the macro list for what is being typed. Called after EVERY change to
        ''' the editor's text — and after a caret move, because where the '=' is depends on where the caret
        ''' is.
        ''' </summary>
        Private Sub UpdateMacroPopup()
            If Not _editing OrElse Not AllowEditing Then
                CloseMacroPopup()
                Return
            End If

            ' The '=' nearest the caret, at or before it: everything after it is the macro being typed.
            Dim caret As Integer = Math.Min(_caret, _editText.Length)
            Dim start As Integer = -1
            For i As Integer = caret - 1 To 0 Step -1
                If _editText(i) = "="c Then
                    start = i
                    Exit For
                End If
            Next

            If start < 0 Then
                CloseMacroPopup()
                Return
            End If

            Dim typed As String = _editText.Substring(start + 1, caret - start - 1).Trim()
            If typed.IndexOf("("c) >= 0 OrElse typed.IndexOf(")"c) >= 0 Then
                CloseMacroPopup()              ' a finished call: there is nothing left to offer
                Return
            End If

            Dim items As List(Of SheetMenuItem) = BuildMacroItems(typed)
            If items.Count = 0 Then
                CloseMacroPopup()
                Return
            End If

            _macroStart = start
            Dim anchor As Point = MacroAnchor()
            OpenMenu(MenuKind.Macro, FitMacroItems(items, anchor), anchor, MacroMenuWidth)
        End Sub

        ''' <summary>Where the list hangs: under the fx box when the edit is up there, else under the cell
        ''' being edited — the two places a formula can be typed.</summary>
        Private Function MacroAnchor() As Point
            Dim size As Size = Bounds.Size
            If _barFocused Then
                Dim input As Rect = BarInputRect(size)
                Return New Point(input.X + 22, input.Bottom + 2)
            End If

            Dim cell As Rect = CellRect(_activeRow, _activeColumn)
            Return New Point(cell.X, cell.Bottom + 2)
        End Function

        ''' <summary>Hides the macro list without touching the edit — and only a list that is actually
        ''' showing is closed, so this is safe to call from anywhere.</summary>
        Private Sub CloseMacroPopup()
            If _menuOpen AndAlso _menuKind = MenuKind.Macro Then
                CloseContextMenu()             ' which clears _macroStart with it
                Return
            End If

            _macroStart = -1
        End Sub

        ''' <summary>
        ''' Puts the chosen macro into the fx box, ready to edit — a formula of any length belongs up there,
        ''' where it can be read and corrected. The cells selected when it was chosen become the range, so the
        ''' caret waits after the closing bracket; with a single cell selected it waits BETWEEN the brackets,
        ''' which is the case the list exists for.
        ''' </summary>
        Private Sub AcceptMacro(macro As SheetMacro)
            Dim start As Integer = If(_macroStart >= 0 AndAlso _macroStart <= _editText.Length, _macroStart, 0)
            Dim caret As Integer = Math.Min(_caret, _editText.Length)
            Dim head As String = _editText.Substring(0, start)
            Dim tail As String = _editText.Substring(caret)
            Dim rangeText As String = If(macro.TakesRange, SelectedRangeText(), String.Empty)
            Dim invocation As String = "=" & macro.Name & "(" & rangeText & ")"
            _editText = head & invocation & tail
            _caret = head.Length + invocation.Length - If(rangeText.Length > 0, 1, 0)
            _macroStart = -1
            _menuOpen = False                  ' the list closes; the EDIT carries on
            _menuHot = -1
            _editing = True
            _barFocused = True                 ' and the formula is edited in the box from here on
            _editIsNew = False
            InvalidateVisual()
        End Sub

        ''' <summary>The selection as a range ("B2:B9"), or empty when there is nothing to offer. A whole
        ''' column or row becomes the range it covers, so clicking a column and typing "=sum" fills the whole
        ''' column in. When the selection is a single cell the LAST BLOCK that was selected is used instead,
        ''' because that is the order a total is written in — select the figures, click where the total goes,
        ''' type the formula — and a formula committed into the block it reads could only be #CYCLE!. The
        ''' colon is what a range is WRITTEN with (Excel's spelling, and what this list writes); the older
        ''' two-dot form still READS, so a formula typed before this stays exactly as it was.</summary>
        Private Function SelectedRangeText() As String
            Dim firstRow As Integer = SelectionFirstRow()
            Dim lastRow As Integer = SelectionLastRow()
            Dim firstColumn As Integer = SelectionFirstColumn()
            Dim lastColumn As Integer = SelectionLastColumn()
            If firstRow = lastRow AndAlso firstColumn = lastColumn Then
                firstRow = _rangeFirstRow
                firstColumn = _rangeFirstColumn
                lastRow = _rangeLastRow
                lastColumn = _rangeLastColumn
            End If

            If lastRow < firstRow OrElse lastColumn < firstColumn Then
                Return String.Empty
            End If

            If firstRow = lastRow AndAlso firstColumn = lastColumn Then
                Return String.Empty              ' one cell: leave the brackets for the user
            End If

            Return CellName(firstRow, firstColumn) & ":" & CellName(lastRow, lastColumn)
        End Function

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

            ''' <summary>A few words about it, drawn dimmed at the right of the line — what the macro list
            ''' uses to say what each function is for.</summary>
            Public Hint As String = String.Empty

            ''' <summary>False greys the line out and makes it unchoosable: a heading, or a command this
            ''' machine cannot do (Print… with nothing to print through).</summary>
            Public Enabled As Boolean = True

            ''' <summary>A WARNING rather than a command — the lines the print-area warning is made of. Drawn in
            ''' the warning colour and never choosable, whatever Enabled happens to be.</summary>
            Public Warning As Boolean

            ''' <summary>What choosing it does.</summary>
            Public Run As Action

            ''' <summary>The colours on this line, drawn as a row of squares — empty for an ordinary line,
            ''' whose label is its text. A swatch row has no label: the squares ARE the line.</summary>
            Public Swatches As New List(Of Color)()

            ''' <summary>Which swatch of the row is the current one (-1 for none), drawn with a ring round it
            ''' so a panel says what the selection already is.</summary>
            Public TickedSwatch As Integer = -1

            ''' <summary>What picking a swatch of this row does — it is handed the colour.</summary>
            Public SwatchRun As Action(Of Color)

            ''' <summary>Draw this line as a SOLID BAR of the colour instead of a label — the colour picker's
            ''' preview, which has to be big enough to judge.</summary>
            Public Preview As Nullable(Of Color)

            ''' <summary>This line is a SLIDER for one channel of the colour being mixed (0 = red, 1 = green,
            ''' 2 = blue), or -1 for a line that is not a slider at all. A slider is dragged like a
            ''' scrollbar's thumb — the pattern this control already has — and Enter must not throw the panel
            ''' away, so it is not a command.</summary>
            Public Channel As Integer = -1
        End Class

        ''' <summary>The ink a warning line is drawn in — the one colour in this file that is deliberately NOT
        ''' part of the sheet's palette, because a warning has to read as one whatever theme the form uses.</summary>
        Private Shared ReadOnly WarningColor As Color = Color.Parse("#B3261E")

        ''' <summary>Which of the things a menu can be: the right-click menu, a toolbar button's menu, the
        ''' macro list a '=' opens, the print-area warning, the page question, or one of the colour and
        ''' border PANELS a right-click line leads to. They share the drawing, the hover and the keys; the
        ''' kind is what tells Tab (and the painters) which one is showing.</summary>
        Private Enum MenuKind
            Context
            Toolbar
            Macro
            Warning
            Setup
            Panel
        End Enum

        ''' <summary>How wide the menu is, and how tall one of its lines is.</summary>
        Private Const MenuWidth As Double = 200.0
        Private Const MenuItemHeight As Double = 24.0
        Private Const MenuSeparatorHeight As Double = 9.0
        Private Const MenuPad As Double = 5.0

        ''' <summary>A swatch: a 16 px square with 4 px between them, eight to a line — 156 px of a 200 px
        ''' panel, so the grid is the same whatever the panel is over.</summary>
        Private Const MenuSwatchSize As Double = 16.0
        Private Const MenuSwatchGap As Double = 4.0
        Private Const MenuSwatchLeft As Double = 9.0
        Private Const MenuSwatchPerRow As Integer = 8

        ''' <summary>The three line weights the borders panel offers, in pixels. 1 px lands exactly on the grid
        ''' line and covers it; 2 and 3 read as a line someone chose.</summary>
        Private Const BorderThin As Double = 1.0
        Private Const BorderMedium As Double = 2.0
        Private Const BorderThick As Double = 3.0

        ''' <summary>The width of the sheet's OWN line, which is what a cell's 0 means: one pixel, the same
        ''' width the grid itself is drawn at.</summary>
        Private Const BorderOwnThickness As Double = 1.0

        ''' <summary>The macro list is wider than a command menu: it draws each function's syntax as well as
        ''' its name, and a name with no room for its hint is just a name.</summary>
        Private Const MacroMenuWidth As Double = 300.0

        ''' <summary>What the menu offers, built on each open so the ticks are current. The commands act on
        ''' the SELECTION — a whole column lines up in one gesture, which is the point of having it.</summary>
        Private Function BuildMenuItems() As List(Of SheetMenuItem)
            Dim align As Nullable(Of SheetAlign) = SelectionTextAlign()
            ' SelectionFlag answers Nothing when the selection holds no CELL ELEMENT at all — a blank cell, or
            ' a whole block of them. In VB `Nothing = True` is Nothing, and assigning THAT to a plain Boolean
            ' is not a conversion but a THROW (InvalidOperationException: "Nullable object must have a value"),
            ' so right-clicking a blank cell crashed the menu outright. The C# twin's `== true` is false
            ' there, which is why only this twin ever had it: read them once, and keep the Nothing out.
            Dim allBold As Boolean = SelectionFlag(True).GetValueOrDefault()
            Dim allItalics As Boolean = SelectionFlag(False).GetValueOrDefault()
            Dim items As New List(Of SheetMenuItem)()
            items.Add(AlignItem("Align left", SheetAlign.Left, align))
            items.Add(AlignItem("Align centre", SheetAlign.Center, align))
            items.Add(AlignItem("Align right", SheetAlign.Right, align))
            items.Add(AlignItem("Align automatically", SheetAlign.Auto, align))
            items.Add(New SheetMenuItem With {.IsSeparator = True})
            items.Add(New SheetMenuItem With {
                .Label = "Bold",
                .Ticked = allBold,
                .Run = AddressOf ToggleBoldSelection})
            items.Add(New SheetMenuItem With {
                .Label = "Italics",
                .Ticked = allItalics,
                .Run = AddressOf ToggleItalicSelection})
            items.Add(New SheetMenuItem With {.IsSeparator = True})
            items.Add(New SheetMenuItem With {
                .Label = "Fill colour…",
                .Hint = "the cell's highlight",
                .Run = Sub() OpenColourPanel("Fill colour", "No fill", "the sheet's own paper",
                    SelectionColour(Function(c As SheetCell) c.Fill), CellBackColor, AddressOf ChooseFillColour)})
            items.Add(New SheetMenuItem With {
                .Label = "Text colour…",
                .Hint = "the ink the text is drawn in",
                .Run = Sub() OpenColourPanel("Text colour", "Automatic", "the sheet's own text colour",
                    SelectionColour(Function(c As SheetCell) c.TextColor), TextColor, AddressOf ChooseTextColour)})
            items.Add(New SheetMenuItem With {
                .Label = "Borders…",
                .Hint = "lines round the cells",
                .Run = AddressOf OpenBordersPanel})
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

        ''' <summary>The File menu: Load… and Save…, both .xlsx — the format the charts read and every
        ''' spreadsheet writes. Both are disabled while a dialog is already open.</summary>
        Private Function BuildFileItems() As List(Of SheetMenuItem)
            Dim busy As Boolean = _fileBusy
            Dim items As New List(Of SheetMenuItem)()
            Dim load As New SheetMenuItem()
            load.Label = "Load…"
            load.Hint = "a workbook, one page at a time"
            load.Enabled = Not busy
            load.Run = Async Sub()
                Await BrowseForWorkbookAsync()
            End Sub
            items.Add(load)
            items.Add(New SheetMenuItem With {.IsSeparator = True})
            Dim save As New SheetMenuItem()
            save.Label = "Save…"
            save.Hint = "this sheet as .xlsx"
            save.Enabled = Not busy
            save.Run = Async Sub()
                Await SaveAsWorkbookAsync()
            End Sub
            items.Add(save)
            Return items
        End Function

        ''' <summary>
        ''' The Print menu: what can be produced from here. Saving the sheet as a PICTURE needs nothing but
        ''' Avalonia, so that entry is always there; the PDF and the printer live behind PRINT_SUPPORT, the
        ''' symbol a project gets when the print packages are wired into it (see GrumpyPrint).
        '''
        ''' All three produce a PAGE, and a page is the PRINT AREA — the selected cells — so none of them goes
        ''' through the methods directly: they ask RequestPrint, which is what warns when nothing but a single
        ''' cell is selected.
        ''' </summary>
        Private Function BuildPrintItems() As List(Of SheetMenuItem)
            Dim items As New List(Of SheetMenuItem)()
            Dim png As New SheetMenuItem()
            png.Label = "Save as PNG…"
            png.Hint = "the print area as a picture"
            png.Enabled = Not _fileBusy
            png.Run = Sub() RequestPrint(SheetPrintKind.Picture)
            items.Add(png)
#If PRINT_SUPPORT Then
            Dim pdf As New SheetMenuItem()
            pdf.Label = "Save as PDF…"
            pdf.Hint = "the print area as a page"
            pdf.Enabled = Not _fileBusy
            pdf.Run = Sub() RequestPrint(SheetPrintKind.Pdf)
            items.Add(pdf)
            items.Add(New SheetMenuItem With {.IsSeparator = True})
            Dim print As New SheetMenuItem()
            print.Label = "Print…"
            print.Hint = If(CanPrint, "the print area, on paper", "nothing here can print")
            print.Enabled = CanPrint AndAlso Not _fileBusy
            print.Run = Sub() RequestPrint(SheetPrintKind.Printer)
            items.Add(print)
#Else
            items.Add(New SheetMenuItem With {.IsSeparator = True})
            ' Disabled rather than LEFT OUT, with the reason on the row: a missing entry reads as a broken
            ' menu — the complaint the charts' Print… row answered when they grew one.
            Dim missing As New SheetMenuItem()
            missing.Label = "Print… (needs print support)"
            missing.Enabled = False
            items.Add(missing)
#End If
            Return items
        End Function

        ''' <summary>The page list Load… shows when a workbook holds more than one page: a heading that says
        ''' only one page at a time is loaded, then every page by name.</summary>
        Private Function BuildPageItems(path As String, pages As List(Of String)) As List(Of SheetMenuItem)
            Dim items As New List(Of SheetMenuItem)()
            Dim heading As New SheetMenuItem()
            heading.Label = "One page is loaded at a time:"
            heading.Enabled = False
            items.Add(heading)
            For i As Integer = 0 To pages.Count - 1
                Dim chosen As String = pages(i)
                Dim page As New SheetMenuItem()
                page.Label = If(chosen.Length = 0, "(unnamed page)", chosen)
                page.Hint = If(i = 0, "the first page", String.Empty)
                page.Run = Sub() LoadPage(path, chosen)
                items.Add(page)
            Next

            Return items
        End Function

        ''' <summary>The macro list: every function the parser knows whose name starts with what has been
        ''' typed — or, when none does, the ones that merely contain it, so "dev" still finds StdDev.</summary>
        Private Function BuildMacroItems(typed As String) As List(Of SheetMenuItem)
            Dim wanted As New List(Of SheetMacro)()
            For i As Integer = 0 To Macros.Length - 1
                If typed.Length = 0 OrElse Macros(i).Name.StartsWith(typed, StringComparison.OrdinalIgnoreCase) Then
                    wanted.Add(Macros(i))
                End If
            Next

            If wanted.Count = 0 AndAlso typed.Length > 0 Then
                For i As Integer = 0 To Macros.Length - 1
                    If Macros(i).Name.IndexOf(typed, StringComparison.OrdinalIgnoreCase) >= 0 Then
                        wanted.Add(Macros(i))
                    End If
                Next
            End If

            Dim items As New List(Of SheetMenuItem)()
            For i As Integer = 0 To wanted.Count - 1
                Dim macro As SheetMacro = wanted(i)
                Dim item As New SheetMenuItem()
                item.Label = macro.Name
                item.Hint = macro.Hint
                item.Run = Sub() AcceptMacro(macro)
                items.Add(item)
            Next

            Return items
        End Function

        ' ---------------------------------------------------------------------------------------------
        ' THE COLOUR AND BORDER PANELS.
        '
        ' A cell's look is chosen in STEPS, because a menu here is a flat list of lines and a Control has no
        ' dialog to put OK and Cancel in. The precedent is the print-area warning that leads to the page
        ' question: one panel opens the next. So Fill colour… offers the palette, one of its lines opens the
        ' picker for a colour the palette does not hold, and Borders… is a hub whose lines open the edges,
        ' the single edges and the thickness.
        '
        ' Every pick APPLIES at once, exactly like Bold and the alignment lines — there is no OK to press,
        ' which is why the picker has a Use line of its own. And every panel acts on the SELECTION.
        ' ---------------------------------------------------------------------------------------------

        ''' <summary>The whole-set border spellings the hub offers, in the order a user thinks of them. NOT the
        ''' same thing as SheetBorderEdges, which is what ONE CELL stores: Outside and Inside are about the
        ''' BLOCK, so what they mean is worked out per cell as the choice is applied — Outside is the rim of the
        ''' block and Inside is the lines between the cells in it. On a single cell All and Outside are the same
        ''' four edges, and Inside is None: one cell has no inside.</summary>
        Private Enum BorderChoice
            All
            Outside
            Inside
            Top
            Bottom
            Left
            Right
            None
        End Enum

        ''' <summary>
        ''' The palette the colour panels offer: five lines of eight — greys, the hues at full strength, the
        ''' same hues deep, then two lines of tints for a highlight that has to stay readable. Forty is enough
        ''' to work in and few enough to read as squares with no hover preview, and anything it does not hold is
        ''' what the picker is for.
        ''' </summary>
        Private Shared ReadOnly MenuPaletteText As String() = {
            "#FFFFFF", "#F2F2F2", "#D9D9D9", "#BFBFBF", "#808080", "#404040", "#262626", "#000000",
            "#FF0000", "#FF8000", "#FFC000", "#FFFF00", "#92D050", "#00B050", "#00B0F0", "#0070C0",
            "#C00000", "#C55A11", "#BF8F00", "#548235", "#2E75B6", "#1F4E79", "#7030A0", "#5B2C6F",
            "#FFCCCC", "#FFE5CC", "#FFF2CC", "#FFFFCC", "#E2EFDA", "#DDEBF7", "#E4DFEC", "#EDEDED",
            "#FF9999", "#FFCC99", "#FFE699", "#FFFF99", "#C6E0B4", "#BDD7EE", "#D9C2E9", "#E7E6E6"
        }

        Private Shared ReadOnly MenuPalette As Color() = BuildMenuPalette()

        Private Shared Function BuildMenuPalette() As Color()
            Dim colours As Color() = New Color(MenuPaletteText.Length - 1) {}
            For i As Integer = 0 To colours.Length - 1
                colours(i) = Color.Parse(MenuPaletteText(i))
            Next

            Return colours
        End Function

        ''' <summary>The hex a colour is written as in the menu — the picker's preview and its Use line, so the
        ''' number the user reads is the number they are about to accept.</summary>
        Private Shared Function HexOf(colour As Color) As String
            Return "#" & colour.R.ToString("X2", CultureInfo.InvariantCulture) &
                colour.G.ToString("X2", CultureInfo.InvariantCulture) &
                colour.B.ToString("X2", CultureInfo.InvariantCulture)
        End Function

        ''' <summary>Ink that stays readable ON a colour: black on a light one, white on a dark one.</summary>
        Private Shared Function ContrastInk(colour As Color) As IBrush
            Dim luminance As Double = (0.299 * colour.R + 0.587 * colour.G + 0.114 * colour.B) / 255.0
            Return New SolidColorBrush(If(luminance > 0.6, Colors.Black, Colors.White))
        End Function

        ''' <summary>
        ''' Walks the selected cells and hands each one over. A BOUNDED selection — a block of cells — has
        ''' cells CREATED where it has none, exactly as AlignSelection does, so "select a block, right-click,
        ''' pick a highlight, then type" does the obvious thing. A whole column, a whole row, or the whole
        ''' sheet only gets the cells that ALREADY exist: creating them would write an empty element per row
        ''' into the form for a highlight with nothing in it.
        ''' </summary>
        Private Sub ForEachSelectedCell(apply As Action(Of Integer, Integer, SheetCell))
            Dim bounded As Boolean = Not _wholeColumns AndAlso Not _wholeRows AndAlso Not _selectAll
            Dim first As Integer = SelectionFirstRow()
            Dim last As Integer = SelectionLastRow()
            Dim left As Integer = SelectionFirstColumn()
            Dim right As Integer = SelectionLastColumn()
            For row As Integer = first To last
                For column As Integer = left To right
                    Dim cell As SheetCell = If(bounded, EnsureCell(row, column), FindCell(row, column))
                    If cell Is Nothing Then
                        Continue For
                    End If

                    apply(row, column, cell)
                Next
            Next
        End Sub

        ''' <summary>
        ''' The colour every selected cell already has, or null when they disagree or none has one — what a
        ''' panel ticks and what the picker starts from. Cells that do not exist are ignored, for the reason in
        ''' SelectionTextAlign.
        ''' </summary>
        Private Function SelectionColour(colourOf As Func(Of SheetCell, Nullable(Of Color))) As Nullable(Of Color)
            Dim first As Integer = SelectionFirstRow()
            Dim last As Integer = SelectionLastRow()
            Dim left As Integer = SelectionFirstColumn()
            Dim right As Integer = SelectionLastColumn()
            Dim agreed As Nullable(Of Color) = Nothing
            Dim seen As Boolean = False
            For row As Integer = first To last
                For column As Integer = left To right
                    Dim cell As SheetCell = FindCell(row, column)
                    If cell Is Nothing Then
                        Continue For
                    End If

                    Dim colour As Nullable(Of Color) = colourOf(cell)
                    If Not seen Then
                        agreed = colour
                        seen = True
                    ElseIf agreed <> colour Then
                        Return Nothing
                    End If
                Next
            Next

            Return agreed
        End Function

        ''' <summary>Which of ONE cell's edges a whole-set choice means. See BorderChoice.</summary>
        Private Shared Function EdgesFor(choice As BorderChoice, row As Integer, column As Integer,
                                         firstRow As Integer, lastRow As Integer,
                                         firstColumn As Integer, lastColumn As Integer) As SheetBorderEdges
            Select Case choice
                Case BorderChoice.All
                    Return SheetBorderEdges.All
                Case BorderChoice.None
                    Return SheetBorderEdges.None
                Case BorderChoice.Top
                    Return SheetBorderEdges.Top
                Case BorderChoice.Bottom
                    Return SheetBorderEdges.Bottom
                Case BorderChoice.Left
                    Return SheetBorderEdges.Left
                Case BorderChoice.Right
                    Return SheetBorderEdges.Right
            End Select

            Dim edges As SheetBorderEdges = SheetBorderEdges.None
            If choice = BorderChoice.Outside Then
                If row = firstRow Then
                    edges = edges Or SheetBorderEdges.Top
                End If

                If row = lastRow Then
                    edges = edges Or SheetBorderEdges.Bottom
                End If

                If column = firstColumn Then
                    edges = edges Or SheetBorderEdges.Left
                End If

                If column = lastColumn Then
                    edges = edges Or SheetBorderEdges.Right
                End If

                Return edges
            End If

            ' Inside: only the edges SHARED with another selected cell, so each line between two cells is drawn
            ' once from each side of it and the rim is left alone.
            If row > firstRow Then
                edges = edges Or SheetBorderEdges.Top
            End If

            If row < lastRow Then
                edges = edges Or SheetBorderEdges.Bottom
            End If

            If column > firstColumn Then
                edges = edges Or SheetBorderEdges.Left
            End If

            If column < lastColumn Then
                edges = edges Or SheetBorderEdges.Right
            End If

            Return edges
        End Function

        ''' <summary>The right-click menu's answer to "fill colour": the whole selection takes the colour, or the
        ''' sheet's own paper again when it is null.</summary>
        Private Sub ChooseFillColour(colour As Nullable(Of Color))
            ForEachSelectedCell(Sub(row As Integer, column As Integer, cell As SheetCell)
                                    SetFill(row, column, colour)
                                End Sub)
        End Sub

        ''' <summary>The same for the text's ink.</summary>
        Private Sub ChooseTextColour(colour As Nullable(Of Color))
            ForEachSelectedCell(Sub(row As Integer, column As Integer, cell As SheetCell)
                                    SetTextColor(row, column, colour)
                                End Sub)
        End Sub

        ''' <summary>Applies a whole-set border choice to every selected cell, with the thickness and colour the
        ''' borders panels are holding. This is the step that turns Outside and Inside into the four edges a
        ''' cell can actually store.</summary>
        Private Sub ApplyBorderChoice(choice As BorderChoice)
            _borderChoice = choice
            Dim first As Integer = SelectionFirstRow()
            Dim last As Integer = SelectionLastRow()
            Dim left As Integer = SelectionFirstColumn()
            Dim right As Integer = SelectionLastColumn()
            ForEachSelectedCell(Sub(row As Integer, column As Integer, cell As SheetCell)
                                    SetBorder(row, column, EdgesFor(choice, row, column, first, last, left, right),
                                        _borderThickness, _borderColour)
                                End Sub)
        End Sub

        ''' <summary>
        ''' Remembers a line thickness and puts it on the selection. Only the cells that ALREADY have a border
        ''' are touched: a thickness on its own cannot invent one — there would be no edges to draw — so on a
        ''' borderless selection this only remembers the choice for the next edge.
        ''' </summary>
        Private Sub ApplyBorderThickness(thickness As Double)
            _borderThickness = thickness
            ForEachSelectedCell(Sub(row As Integer, column As Integer, cell As SheetCell)
                                    If cell.BorderEdges <> SheetBorderEdges.None Then
                                        SetBorder(row, column, cell.BorderEdges, thickness, cell.BorderColor)
                                    End If
                                End Sub)
        End Sub

        ''' <summary>The line colour, by the same rule as the thickness: it goes on the cells that already have
        ''' a border, and is remembered for the next one.</summary>
        Private Sub ChooseBorderColour(colour As Nullable(Of Color))
            _borderColour = colour
            ForEachSelectedCell(Sub(row As Integer, column As Integer, cell As SheetCell)
                                    If cell.BorderEdges <> SheetBorderEdges.None Then
                                        SetBorder(row, column, cell.BorderEdges, cell.BorderThickness, colour)
                                    End If
                                End Sub)
        End Sub

        ''' <summary>The hub's own hint for the line colour: the colour it would use, or the grid's.</summary>
        Private Function BorderColourHint() As String
            If _borderColour.HasValue Then
                Return HexOf(_borderColour.Value)
            End If

            Return "the grid colour"
        End Function

        ''' <summary>The hub's own hint for the thickness: which of the three it is holding.</summary>
        Private Function ThicknessHint() As String
            If Math.Abs(_borderThickness - BorderThin) < 0.01 Then
                Return "thin"
            End If

            If Math.Abs(_borderThickness - BorderMedium) < 0.01 Then
                Return "medium"
            End If

            Return "thick"
        End Function

        ''' <summary>One line of the borders hub or the single-edge panel: a whole-set choice, ticked when it is
        ''' the one the sheet last applied.</summary>
        Private Function BorderChoiceItem(label As String, choice As BorderChoice, hint As String) As SheetMenuItem
            Dim item As New SheetMenuItem()
            item.Label = label
            item.Hint = hint
            item.Ticked = _borderChoice = choice
            item.Run = Sub() ApplyBorderChoice(choice)
            Return item
        End Function

        ''' <summary>
        ''' The borders hub: the whole-set spellings first, then the three lines that lead to the single edges,
        ''' the thickness and the colour, then the line that takes a border away again. Thirteen lines in one
        ''' flat panel would be taller than a small sheet, so the four single edges are the one thing that gets
        ''' its own panel.
        ''' </summary>
        Private Sub OpenBordersPanel()
            Dim items As New List(Of SheetMenuItem)()
            Dim heading As New SheetMenuItem()
            heading.Label = "Borders"
            heading.Hint = "round the selected cells"
            heading.Enabled = False
            items.Add(heading)
            items.Add(BorderChoiceItem("All edges", BorderChoice.All, "a box round every cell"))
            items.Add(BorderChoiceItem("Outside edges only", BorderChoice.Outside, "the rim of the block"))
            items.Add(BorderChoiceItem("Inside lines only", BorderChoice.Inside, "between the cells"))
            items.Add(New SheetMenuItem With {.IsSeparator = True})
            Dim oneEdge As New SheetMenuItem()
            oneEdge.Label = "Single edges…"
            oneEdge.Hint = "one side at a time"
            oneEdge.Run = AddressOf OpenBorderEdgesPanel
            items.Add(oneEdge)
            Dim weights As New SheetMenuItem()
            weights.Label = "Line thickness…"
            weights.Hint = ThicknessHint()
            weights.Run = AddressOf OpenBorderThicknessPanel
            items.Add(weights)
            Dim ink As New SheetMenuItem()
            ink.Label = "Line colour…"
            ink.Hint = BorderColourHint()
            ink.Run = Sub() OpenColourPanel("Line colour", "Grid colour", "the sheet's own line colour",
                _borderColour, GridColor, AddressOf ChooseBorderColour)
            items.Add(ink)
            items.Add(New SheetMenuItem With {.IsSeparator = True})
            items.Add(BorderChoiceItem("No border", BorderChoice.None, "take the lines away"))
            OpenPanel(items)
        End Sub

        ''' <summary>One side at a time — the four lines the hub keeps out of the way.</summary>
        Private Sub OpenBorderEdgesPanel()
            Dim items As New List(Of SheetMenuItem)()
            Dim heading As New SheetMenuItem()
            heading.Label = "Single edges"
            heading.Hint = "one side at a time"
            heading.Enabled = False
            items.Add(heading)
            items.Add(New SheetMenuItem With {.IsSeparator = True})
            items.Add(BorderChoiceItem("Top edge", BorderChoice.Top, "along the top"))
            items.Add(BorderChoiceItem("Bottom edge", BorderChoice.Bottom, "under the cells"))
            items.Add(BorderChoiceItem("Left edge", BorderChoice.Left, "down the left"))
            items.Add(BorderChoiceItem("Right edge", BorderChoice.Right, "down the right"))
            OpenPanel(items)
        End Sub

        ''' <summary>The three line weights. Each is applied to the cells that already have a border, and
        ''' remembered for the ones that do not, yet — the panel has a line saying so, because a thickness that
        ''' appears to do nothing on an unbordered selection needs explaining.</summary>
        Private Sub OpenBorderThicknessPanel()
            Dim items As New List(Of SheetMenuItem)()
            Dim heading As New SheetMenuItem()
            heading.Label = "Line thickness"
            heading.Hint = "in pixels"
            heading.Enabled = False
            items.Add(heading)
            items.Add(New SheetMenuItem With {.IsSeparator = True})
            items.Add(ThicknessItem("Thin", BorderThin, "one pixel"))
            items.Add(ThicknessItem("Medium", BorderMedium, "two pixels"))
            items.Add(ThicknessItem("Thick", BorderThick, "three pixels"))
            items.Add(New SheetMenuItem With {.IsSeparator = True})
            Dim note As New SheetMenuItem()
            note.Label = "Applies to cells that already"
            note.Hint = "have a border"
            note.Enabled = False
            items.Add(note)
            OpenPanel(items)
        End Sub

        Private Function ThicknessItem(label As String, thickness As Double, hint As String) As SheetMenuItem
            Dim item As New SheetMenuItem()
            item.Label = label
            item.Hint = hint
            item.Ticked = Math.Abs(_borderThickness - thickness) < 0.01
            item.Run = Sub() ApplyBorderThickness(thickness)
            Return item
        End Function

        ''' <summary>
        ''' A colour panel: the "no colour" line first (named for what it means in the panel it was opened
        ''' from), then the palette as rows of squares, then the line that opens the picker for anything the
        ''' palette does not hold. current is what the selection already is, so the swatch it came from wears a
        ''' ring and the picker starts from it.
        ''' </summary>
        Private Sub OpenColourPanel(heading As String, noneLabel As String, noneHint As String,
                                    current As Nullable(Of Color), seed As Color,
                                    choose As Action(Of Nullable(Of Color)))
            Dim items As New List(Of SheetMenuItem)()
            Dim title As New SheetMenuItem()
            title.Label = heading
            title.Hint = "the whole selection"
            title.Enabled = False
            items.Add(title)
            Dim none As New SheetMenuItem()
            none.Label = noneLabel
            none.Hint = noneHint
            none.Ticked = Not current.HasValue
            none.Run = Sub() choose(Nothing)
            items.Add(none)
            items.Add(New SheetMenuItem With {.IsSeparator = True})

            For at As Integer = 0 To MenuPalette.Length - 1 Step MenuSwatchPerRow
                Dim line As New SheetMenuItem()
                Dim picked As Nullable(Of Color) = current
                line.SwatchRun = Sub(colour As Color) choose(colour)
                For i As Integer = at To Math.Min(at + MenuSwatchPerRow, MenuPalette.Length) - 1
                    line.Swatches.Add(MenuPalette(i))
                    If picked.HasValue AndAlso MenuPalette(i) = picked.Value Then
                        line.TickedSwatch = line.Swatches.Count - 1
                    End If
                Next

                items.Add(line)
            Next

            items.Add(New SheetMenuItem With {.IsSeparator = True})
            Dim more As New SheetMenuItem()
            more.Label = "More colours…"
            more.Hint = "mix one"
            more.Run = Sub() OpenColourPickerPanel(heading, current, seed, choose)
            items.Add(more)
            OpenPanel(items)
        End Sub

        ''' <summary>
        ''' The picker: three sliders over a preview — for a colour the palette does not hold. A slider is a
        ''' line of the panel, dragged like a scrollbar's thumb (a pattern this control already has), and the
        ''' preview line shows the mix and its hex. Nothing reaches the cells until Use this colour, so a
        ''' half-mixed colour never lands on a block of them by accident.
        ''' </summary>
        Private Sub OpenColourPickerPanel(heading As String, current As Nullable(Of Color), seed As Color,
                                          choose As Action(Of Nullable(Of Color)))
            _pick = If(current.HasValue, current.Value, seed)
            ' The preview is a LINE THAT CAN BE CHOSEN, not just a picture: clicking the bar of colour you have
            ' just mixed is the obvious way to accept it, and it gives the keyboard a second way in.
            _pickPreview = New SheetMenuItem()
            _pickPreview.Preview = _pick
            _pickPreview.Run = Sub() choose(_pick)
            _pickUse = New SheetMenuItem()
            _pickUse.Label = "Use this colour"
            _pickUse.Hint = HexOf(_pick)
            _pickUse.Run = Sub() choose(_pick)

            Dim items As New List(Of SheetMenuItem)()
            Dim title As New SheetMenuItem()
            title.Label = heading & " — mix one"
            title.Enabled = False
            items.Add(title)
            items.Add(New SheetMenuItem With {.IsSeparator = True})
            items.Add(SliderItem("Red", 0))
            items.Add(SliderItem("Green", 1))
            items.Add(SliderItem("Blue", 2))
            items.Add(New SheetMenuItem With {.IsSeparator = True})
            items.Add(_pickPreview)
            items.Add(New SheetMenuItem With {.IsSeparator = True})
            items.Add(_pickUse)
            OpenPanel(items)

            ' Enter takes the colour the mix ended on, so the highlight starts on the line that applies it.
            _menuHot = items.Count - 1
        End Sub

        Private Function SliderItem(label As String, channel As Integer) As SheetMenuItem
            Dim item As New SheetMenuItem()
            item.Label = label
            item.Channel = channel
            Return item
        End Function

        ''' <summary>Opens one of the panels a context-menu line leads to, at the point the chain opened.</summary>
        Private Sub OpenPanel(items As List(Of SheetMenuItem))
            OpenMenu(MenuKind.Panel, items, New Point(_chainX, _chainY), MenuWidth)
        End Sub

        ''' <summary>How tall a panel line is — a separator is shorter than everything else. (Not RowHeight:
        ''' that is the sheet's own row size, and a menu line has nothing to do with it.)</summary>
        Private Shared Function MenuRowHeight(item As SheetMenuItem) As Double
            Return If(item.IsSeparator, MenuSeparatorHeight, MenuItemHeight)
        End Function

        ''' <summary>The top of a line, in the control's coordinates. Every panel's geometry comes from this one
        ''' walk, so the drawing and the hit tests cannot disagree about where a line is.</summary>
        Private Function RowTop(index As Integer) As Double
            Dim y As Double = _menuY + MenuPad
            For i As Integer = 0 To Math.Min(index, _menuItems.Count) - 1
                y += MenuRowHeight(_menuItems(i))
            Next

            Return y
        End Function

        ''' <summary>The square of one swatch of one line.</summary>
        Private Function SwatchRect(index As Integer, swatch As Integer) As Rect
            Return New Rect(_menuX + MenuSwatchLeft + swatch * (MenuSwatchSize + MenuSwatchGap),
                            RowTop(index) + (MenuItemHeight - MenuSwatchSize) / 2,
                            MenuSwatchSize, MenuSwatchSize)
        End Function

        ''' <summary>The track a slider's knob travels along, and the span a click on the line maps to. It starts
        ''' past the channel's name and stops short of the value printed at the right.</summary>
        Private Function SliderTrackRect(index As Integer) As Rect
            Return New Rect(_menuX + 66, RowTop(index) + 4, _menuWidth - 112, MenuItemHeight - 8)
        End Function

        ''' <summary>One channel of the colour being mixed, 0–255.</summary>
        Private Function ChannelValue(channel As Integer) As Integer
            If channel = 0 Then
                Return CInt(_pick.R)
            End If

            If channel = 1 Then
                Return CInt(_pick.G)
            End If

            Return CInt(_pick.B)
        End Function

        ''' <summary>Sets one channel, and lets the two lines that show the mix catch up.</summary>
        Private Sub SetChannel(channel As Integer, value As Integer)
            value = Math.Max(0, Math.Min(255, value))
            _pick = Color.FromRgb(CByte(If(channel = 0, value, CInt(_pick.R))),
                                  CByte(If(channel = 1, value, CInt(_pick.G))),
                                  CByte(If(channel = 2, value, CInt(_pick.B))))
            If _pickPreview IsNot Nothing Then
                _pickPreview.Preview = _pick
            End If

            If _pickUse IsNot Nothing Then
                _pickUse.Hint = HexOf(_pick)
            End If

            InvalidateVisual()
        End Sub

        ''' <summary>Moves a channel to where the pointer is on its track. The whole line counts, so a drag that
        ''' wanders off the track sideways keeps working — it clamps at the ends.</summary>
        Private Sub SetChannelFromPoint(index As Integer, point As Point)
            Dim track As Rect = SliderTrackRect(index)
            SetChannel(_menuItems(index).Channel,
                CInt(Math.Round((point.X - track.X) / track.Width * 255.0)))
        End Sub

        ''' <summary>Which slider line a point is on, or -1.</summary>
        Private Function SliderAt(point As Point) As Integer
            If Not _menuOpen OrElse Not MenuRect().Contains(point) Then
                Return -1
            End If

            For i As Integer = 0 To _menuItems.Count - 1
                If _menuItems(i).Channel >= 0 AndAlso point.Y >= RowTop(i) AndAlso
                    point.Y < RowTop(i) + MenuItemHeight Then
                    Return i
                End If
            Next

            Return -1
        End Function

        ''' <summary>Which swatch of which line a point is on, or Nothing when it is not on a swatch at all —
        ''' the squares are the only part of a swatch row that can be picked.</summary>
        Private Function SwatchAt(point As Point, ByRef swatch As Integer) As SheetMenuItem
            swatch = -1
            If Not _menuOpen OrElse Not MenuRect().Contains(point) Then
                Return Nothing
            End If

            For i As Integer = 0 To _menuItems.Count - 1
                Dim item As SheetMenuItem = _menuItems(i)
                For s As Integer = 0 To item.Swatches.Count - 1
                    If SwatchRect(i, s).Contains(point) Then
                        swatch = s
                        Return item
                    End If
                Next
            Next

            Return Nothing
        End Function

        ''' <summary>True when a point is on a line that holds swatches — whether or not it landed on one of the
        ''' squares. See ChooseMenuItem: a near miss must not close the panel.</summary>
        Private Function OnSwatchRow(point As Point) As Boolean
            If Not _menuOpen OrElse Not MenuRect().Contains(point) Then
                Return False
            End If

            For i As Integer = 0 To _menuItems.Count - 1
                If _menuItems(i).Swatches.Count > 0 AndAlso point.Y >= RowTop(i) AndAlso
                    point.Y < RowTop(i) + MenuItemHeight Then
                    Return True
                End If
            Next

            Return False
        End Function

        ''' <summary>Opens a menu of items at a point, kept inside the control. The context menu has its own
        ''' opener — it moves the selection onto what was right-clicked first — and everything else comes
        ''' through here.</summary>
        Private Sub OpenMenu(kind As MenuKind, items As List(Of SheetMenuItem), point As Point, width As Double)
            _menuItems = items
            _menuKind = kind
            _menuWidth = width
            _menuOpen = True
            _menuHot = FirstEnabled(items)
            Dim size As Size = Bounds.Size
            Dim height As Double = MenuRect().Height
            _menuX = Math.Max(0, Math.Min(point.X, size.Width - width))
            _menuY = Math.Max(0, point.Y)
            If _menuY + height > size.Height AndAlso height <= size.Height Then
                ' Flip up rather than run off the bottom — but only when it FITS somewhere. A list taller
                ' than the whole control stays where it is and is clipped instead: jumping to the top would
                ' take it away from the cell being typed in, which is where the eye is.
                _menuY = Math.Max(0, size.Height - height)
            End If

            ' Where a panel opened from one of these lines will open: the same place, so a chain of panels
            ' stacks in one spot rather than walking across the sheet.
            _chainX = _menuX
            _chainY = _menuY
            InvalidateVisual()
        End Sub

        ''' <summary>
        ''' The macro list trimmed to the rows that actually fit under the anchor, so it hangs where the user
        ''' is typing. When something was left out the last line says so — a list that silently ends before
        ''' Sqrt reads as a list without a Sqrt in it.
        ''' </summary>
        Private Function FitMacroItems(items As List(Of SheetMenuItem), anchor As Point) As List(Of SheetMenuItem)
            Dim room As Double = Bounds.Height - anchor.Y - 6.0
            Dim rows As Integer = CInt(Math.Floor(room / MenuItemHeight))
            If rows < 5 Then
                rows = 5
            End If

            If items.Count <= rows Then
                Return items
            End If

            Dim fitted As New List(Of SheetMenuItem)()
            For i As Integer = 0 To rows - 2
                If i >= items.Count Then
                    Exit For
                End If

                fitted.Add(items(i))
            Next

            Dim more As New SheetMenuItem()
            more.Label = "… type more letters to narrow the list"
            more.Enabled = False
            fitted.Add(more)
            Return fitted
        End Function

        ''' <summary>The first line that can actually be chosen, or -1 — the page list opens with a heading
        ''' that cannot be, so the highlight starts on the page below it.</summary>
        Private Shared Function FirstEnabled(items As List(Of SheetMenuItem)) As Integer
            For i As Integer = 0 To items.Count - 1
                If Not items(i).IsSeparator AndAlso items(i).Enabled Then
                    Return i
                End If
            Next

            Return -1
        End Function

        ''' <summary>Opens a toolbar button's menu just under it.</summary>
        Private Sub OpenToolbarMenu(button As Integer)
            If button < 0 OrElse button >= ToolbarButtonCount Then
                Return
            End If

            Dim items As List(Of SheetMenuItem) = If(button = ToolbarFile, BuildFileItems(), BuildPrintItems())
            OpenMenu(MenuKind.Toolbar, items, New Point(ToolbarButtonRect(button).X, ToolbarHeight + 1.0), MenuWidth)
        End Sub

        ''' <summary>Loads one page of a workbook that has already been picked.</summary>
        Private Sub LoadPage(path As String, page As String)
            LoadWorkbook(path, page)
            Refresh()
        End Sub

        ''' <summary>The menu's rectangle on the canvas, which is only meaningful while it is open.</summary>
        Private Function MenuRect() As Rect
            Dim height As Double = 2 * MenuPad
            For i As Integer = 0 To _menuItems.Count - 1
                height += If(_menuItems(i).IsSeparator, MenuSeparatorHeight, MenuItemHeight)
            Next

            Return New Rect(_menuX, _menuY, _menuWidth, height)
        End Function

        ''' <summary>Which line of the menu a point is on, or -1. Separators and greyed-out lines are not
        ''' selectable, so they answer -1 and a click on one does nothing.</summary>
        Private Function MenuItemAt(point As Point) As Integer
            If Not _menuOpen OrElse Not MenuRect().Contains(point) Then
                Return -1
            End If

            Dim y As Double = _menuY + MenuPad
            For i As Integer = 0 To _menuItems.Count - 1
                Dim item As SheetMenuItem = _menuItems(i)
                Dim height As Double = If(item.IsSeparator, MenuSeparatorHeight, MenuItemHeight)
                If Not item.IsSeparator AndAlso Not item.Warning AndAlso item.Enabled AndAlso point.Y >= y AndAlso point.Y < y + height Then
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
            _menuKind = MenuKind.Context
            _menuWidth = MenuWidth
            _menuOpen = True
            _menuHot = -1
            Dim size As Size = Bounds.Size
            Dim height As Double = MenuRect().Height
            _menuX = Math.Max(0, Math.Min(point.X, size.Width - MenuWidth))
            _menuY = Math.Max(0, Math.Min(point.Y, size.Height - height))
            _chainX = _menuX
            _chainY = _menuY
            InvalidateVisual()
        End Sub

        Private Sub CloseContextMenu()
            If Not _menuOpen Then
                Return
            End If

            _menuOpen = False
            _menuHot = -1
            _slider = -1                    ' a panel closing lets go of the knob it was dragging
            _pickPreview = Nothing
            _pickUse = Nothing
            _macroStart = -1               ' any menu closing ends the macro list's claim on the text
            InvalidateVisual()
        End Sub

        ''' <summary>Runs the line a point is on, if any, and closes. Always True: the press was the menu's.</summary>
        Private Function ChooseMenuItem(point As Point) As Boolean
            ' A swatch row is picked by its SQUARES: a press between two of them is a press on the panel's own
            ' furniture, so the panel stays up rather than closing as if a line had been chosen.
            Dim swatch As Integer = -1
            Dim swatchRow As SheetMenuItem = SwatchAt(point, swatch)
            If swatchRow IsNot Nothing Then
                Dim pick As Color = swatchRow.Swatches(swatch)
                Dim pickRun As Action(Of Color) = swatchRow.SwatchRun
                CloseContextMenu()
                If pickRun IsNot Nothing Then
                    pickRun(pick)
                End If

                Return True
            End If

            ' A slider line starts a DRAG and keeps the panel open — it is not a command, and closing here
            ' would throw away the colour being mixed.
            Dim slider As Integer = SliderAt(point)
            If slider >= 0 Then
                _slider = slider
                SetChannelFromPoint(slider, point)
                Return True
            End If

            ' A press on a swatch ROW that missed the squares — the 4 px between two of them — is a press on the
            ' panel's own furniture, exactly like a click on the warning text. Closing on it would throw the
            ' whole palette away for a near miss.
            If OnSwatchRow(point) Then
                Return True
            End If

            Dim index As Integer = MenuItemAt(point)
            If index < 0 AndAlso OnWarningLine(point) Then
                ' A click on the WARNING text itself. It is not a command, and closing on it would read as a
                ' silent abort for a click that never meant one.
                Return True
            End If

            Dim rowRun As Action = If(index >= 0, _menuItems(index).Run, Nothing)
            CloseContextMenu()
            If rowRun IsNot Nothing Then
                rowRun()
            End If

            Return True
        End Function

        ''' <summary>True when a point is on one of the menu's WARNING lines — the text above the choices, which
        ''' says what is about to happen and is not itself clickable.</summary>
        Private Function OnWarningLine(point As Point) As Boolean
            If Not _menuOpen OrElse point.X < _menuX OrElse point.X > _menuX + _menuWidth Then
                Return False
            End If

            Dim y As Double = _menuY + MenuPad
            For i As Integer = 0 To _menuItems.Count - 1
                Dim item As SheetMenuItem = _menuItems(i)
                Dim height As Double = If(item.IsSeparator, MenuSeparatorHeight, MenuItemHeight)
                If item.Warning AndAlso point.Y >= y AndAlso point.Y < y + height Then
                    Return True
                End If

                y += height
            Next

            Return False
        End Function

        ''' <summary>Paints the menu over everything else — whichever kind it is: the right-click menu, a
        ''' toolbar button's menu, or the macro list. A greyed-out line is drawn dimmed and cannot be chosen;
        ''' a line with a hint draws it at the right.</summary>
        Private Sub DrawContextMenu(context As DrawingContext)
            If Not _menuOpen Then
                Return
            End If

            Dim rect As Rect = MenuRect()
            Dim edge As New SolidColorBrush(GridColor)
            context.FillRectangle(New SolidColorBrush(CellBackColor), rect)
            context.DrawRectangle(Nothing, New Pen(edge, 1.0), rect)
            Dim text As New SolidColorBrush(TextColor)
            Dim faded As New SolidColorBrush(Color.FromArgb(140, TextColor.R, TextColor.G, TextColor.B))
            Dim hot As New SolidColorBrush(SelectionFillColor)
            Dim warn As New SolidColorBrush(WarningColor)
            Dim y As Double = _menuY + MenuPad
            For i As Integer = 0 To _menuItems.Count - 1
                Dim item As SheetMenuItem = _menuItems(i)
                If item.IsSeparator Then
                    context.DrawLine(New Pen(edge, 1.0), New Point(_menuX + 6, y + MenuSeparatorHeight / 2),
                        New Point(rect.Right - 6, y + MenuSeparatorHeight / 2))
                    y += MenuSeparatorHeight
                    Continue For
                End If

                Dim ink As IBrush = If(item.Warning, warn, If(item.Enabled, text, faded))
                If i = _menuHot AndAlso item.Enabled Then
                    context.FillRectangle(hot, New Rect(_menuX + 1, y, _menuWidth - 2, MenuItemHeight))
                End If

                ' A row of swatches: the squares ARE the line, and the one the selection already is wears a
                ' ring round it — which is the only way a panel of colours can say what is set.
                If item.Swatches.Count > 0 Then
                    For s As Integer = 0 To item.Swatches.Count - 1
                        Dim square As Rect = SwatchRect(i, s)
                        context.FillRectangle(New SolidColorBrush(item.Swatches(s)), square)
                        context.DrawRectangle(Nothing, New Pen(edge, 1.0), square)
                        If s = item.TickedSwatch Then
                            context.DrawRectangle(Nothing, New Pen(text, 1.5), square.Inflate(1.5))
                        End If
                    Next

                    y += MenuItemHeight
                    Continue For
                End If

                ' A slider: a track with a knob, the channel's name at the left and its value at the right —
                ' the value is the number being mixed, so it is drawn rather than saved for a tooltip.
                If item.Channel >= 0 Then
                    Dim track As Rect = SliderTrackRect(i)
                    context.FillRectangle(edge, New Rect(track.X, track.Center.Y - 1.0, track.Width, 2.0))
                    Dim at As Double = track.X + track.Width * ChannelValue(item.Channel) / 255.0
                    context.FillRectangle(text, New Rect(at - 3.0, track.Y, 6.0, track.Height))
                    DrawCellText(context, item.Label, New Rect(_menuX + 17, y, 46, MenuItemHeight), ink,
                        False, TextAlignment.Left)
                    DrawCellText(context, ChannelValue(item.Channel).ToString(CultureInfo.InvariantCulture),
                        New Rect(_menuX + _menuWidth - 40, y, 32, MenuItemHeight), ink, False,
                        TextAlignment.Right)
                    y += MenuItemHeight
                    Continue For
                End If

                ' The picker's preview: a bar of the colour being mixed, wide enough to judge, with its hex
                ' written on it in whichever of black or white can be read there.
                If item.Preview.HasValue Then
                    Dim bar As New Rect(_menuX + 9, y + 3, _menuWidth - 18, MenuItemHeight - 6)
                    context.FillRectangle(New SolidColorBrush(item.Preview.Value), bar)
                    context.DrawRectangle(Nothing, New Pen(edge, 1.0), bar)
                    DrawCellText(context, HexOf(item.Preview.Value), bar, ContrastInk(item.Preview.Value),
                        False, TextAlignment.Center)
                    y += MenuItemHeight
                    Continue For
                End If

                If item.Ticked Then
                    DrawCellText(context, ChrW(&H2713), New Rect(_menuX + 1, y, 15, MenuItemHeight), ink, False,
                        TextAlignment.Center)
                End If

                Dim labelWidth As Double = _menuWidth - 22
                If item.Hint.Length > 0 Then
                    Dim hintWidth As Double = _menuWidth * 0.5
                    DrawCellText(context, item.Hint,
                        New Rect(_menuX + _menuWidth - hintWidth - 8, y, hintWidth, MenuItemHeight), faded,
                        False, TextAlignment.Right, -1, Nothing, Math.Max(9.0, FontSize - 1.0))
                    labelWidth = _menuWidth - hintWidth - 26
                End If

                DrawCellText(context, item.Label, New Rect(_menuX + 17, y, labelWidth, MenuItemHeight),
                    ink, False, TextAlignment.Left)
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
        ''' <summary>The menu's own keys: Escape closes, Up/Down move the highlight, Enter chooses, and Tab
        ''' chooses too in the macro list (where Tab would otherwise commit the cell and lose the list).</summary>
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

                    If Not _menuItems(at).IsSeparator AndAlso _menuItems(at).Enabled Then
                        Exit For
                    End If
                Next

                _menuHot = at
                InvalidateVisual()
                Return True
            End If

            ' Left and Right nudge the channel the highlight is on — a slider that could only be dragged would
            ' leave the keyboard with no way to mix a colour at all. Shift moves it by ten.
            If (e.Key = Key.Left OrElse e.Key = Key.Right) AndAlso _menuHot >= 0 AndAlso
                _menuHot < _menuItems.Count AndAlso _menuItems(_menuHot).Channel >= 0 Then
                Dim channel As Integer = _menuItems(_menuHot).Channel
                Dim nudge As Integer = If(e.Key = Key.Right, 1, -1)
                If e.KeyModifiers.HasFlag(KeyModifiers.Shift) Then
                    nudge *= 10
                End If

                SetChannel(channel, ChannelValue(channel) + nudge)
                Return True
            End If

            ' A slider is not a command: Enter must not throw the panel away, or the colour being mixed would
            ' go with it.
            If (e.Key = Key.Enter OrElse e.Key = Key.Tab) AndAlso _menuHot >= 0 AndAlso
                _menuHot < _menuItems.Count AndAlso _menuItems(_menuHot).Channel >= 0 Then
                Return True
            End If

            Dim choose As Boolean = e.Key = Key.Enter OrElse (e.Key = Key.Tab AndAlso _menuKind = MenuKind.Macro)
            If choose AndAlso _menuHot >= 0 AndAlso _menuHot < _menuItems.Count AndAlso _menuItems(_menuHot).Enabled Then
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
            If _printRange Then
                ' A page holds the print area and NOTHING else, whatever size the layout hands the control:
                ' the visible-range walks below all read this rectangle, so this is the one place that has to
                ' know. Without it a page would grow to whatever the parent measured and print the rest of
                ' the sheet under the area.
                width = ColumnOffset(_printLastColumn + 1) - ColumnOffset(_printFirstColumn)
                height = RowOffset(_printLastRow + 1) - RowOffset(_printFirstRow)
            End If

            Return New Rect(origin.X, origin.Y, If(width < 0, 0.0, width), If(height < 0, 0.0, height))
        End Function

        Private Function BarRect(size As Size) As Rect
            Return New Rect(0, ToolbarStrip, size.Width, BarHeight)
        End Function

        Private Function BarNameRect(size As Size) As Rect
            Dim width As Double = If(ShowHeaders, HeaderWidth, 0.0)
            Return New Rect(0, ToolbarStrip, width, BarHeight)
        End Function

        Private Function BarInputRect(size As Size) As Rect
            Dim name As Rect = BarNameRect(size)
            Dim x As Double = name.Right
            Return New Rect(x, ToolbarStrip, size.Width - x, BarHeight)
        End Function

        ''' <summary>How tall the toolbar strip is: zero when it is switched off, so every rectangle below
        ''' it can be worked out without asking whether there is one.</summary>
        Private ReadOnly Property ToolbarStrip As Double
            Get
                Return If(ShowToolbar, ToolbarHeight, 0.0)
            End Get
        End Property

        ''' <summary>One toolbar button's rectangle, at the left of the strip: File is 0, Print is 1.</summary>
        Private Function ToolbarButtonRect(index As Integer) As Rect
            Return New Rect(index * ToolbarButtonWidth, 0, ToolbarButtonWidth, ToolbarHeight)
        End Function

        ''' <summary>Which toolbar button a point is on, or -1 — the point has to be inside the strip as well
        ''' as inside the button, so a sheet with the toolbar off answers -1 everywhere.</summary>
        Private Function ToolbarButtonAt(point As Point) As Integer
            If Not ShowToolbar OrElse point.Y < 0 OrElse point.Y >= ToolbarHeight Then
                Return -1
            End If

            For i As Integer = 0 To ToolbarButtonCount - 1
                If ToolbarButtonRect(i).Contains(point) Then
                    Return i
                End If
            Next

            Return -1
        End Function

        ''' <summary>A button's word, shown beside it while the pointer is over it — the strip draws its own
        ''' tooltip rather than asking the framework for one, like everything else here.</summary>
        Private Shared Function ToolbarLabel(button As Integer) As String
            Return If(button = ToolbarFile, "File", "Print")
        End Function

        ''' <summary>The autofill square, at the bottom-right of the selection.</summary>
        Private Function HandleRect() As Rect
            Dim selection As Rect = SelectionRect()
            Return New Rect(selection.Right - HandleSize / 2, selection.Bottom - HandleSize / 2,
                HandleSize, HandleSize)
        End Function

        ''' <summary>The second autofill square, at the top-left — the one that makes filling UP or LEFT
        ''' something you can see rather than something you have to know.</summary>
        Private Function TopHandleRect() As Rect
            Dim selection As Rect = SelectionRect()
            Return New Rect(selection.X - HandleSize / 2, selection.Y - HandleSize / 2,
                HandleSize, HandleSize)
        End Function

        ''' <summary>True when the pointer is on either autofill square.</summary>
        Private Function OnHandle(point As Point) As Boolean
            If _selectAll Then
                Return False
            End If

            Dim bottom As Rect = HandleRect()
            If Math.Abs(point.X - bottom.Center.X) <= HandleSize AndAlso
                Math.Abs(point.Y - bottom.Center.Y) <= HandleSize Then
                Return True
            End If

            Dim top As Rect = TopHandleRect()
            Return Math.Abs(point.X - top.Center.X) <= HandleSize AndAlso
                Math.Abs(point.Y - top.Center.Y) <= HandleSize
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

            ' The wash goes down before the grid lines, so the lines still read through a selection — but
            ' NOT on a page: a page carries no selection at all, and a tint over the print area would come
            ' out of the printer as a pale block, in a colour the sheet itself never uses.
            Dim selection As Rect = SelectionRect()
            Dim visibleSelection As Rect = selection.Intersect(grid)
            If Not _printRange AndAlso visibleSelection.Width > 0 AndAlso visibleSelection.Height > 0 Then
                context.FillRectangle(selectionFill, visibleSelection)
            End If

            ' Cells: the grid lines, the borders, then the text.
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

                ' A cell that was given a border draws it OVER the grid line it sits on, and this pass runs
                ' before the text so the text keeps its own colour on top. It is deliberately NOT skipped on
                ' a page: a border is something the cell was told to be, so it prints (unlike the wash and
                ' the outline, which are about SELECTING).
                For row As Integer = firstRow To lastRow
                    For column As Integer = firstColumn To lastColumn
                        DrawCellBorder(context, CellRect(row, column), FindCell(row, column))
                    Next
                Next

                For row As Integer = firstRow To lastRow
                    For column As Integer = firstColumn To lastColumn
                        ' The cell being edited IN PLACE, if this is it. Its text lives in _editText until
                        ' the edit is committed, so drawing GetCell() here would show the old value — and
                        ' SKIPPING it (which is what this did until 2026-09-26) drew nothing at all, so
                        ' typing looked invisible until the cell lost focus.
                        Dim inPlaceEdit As Boolean = _editing AndAlso Not _barFocused AndAlso
                            row = _activeRow AndAlso column = _activeColumn
                        ' A formula cell draws what it WORKED OUT TO; its own text (the formula) is what the fx
                        ' box and the editor show, which is where it is read and written.
                        Dim text As String = If(inPlaceEdit, _editText, ValueOf(row, column))
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
            If Not _printRange Then
                ' A PAGE carries no selection: the outline, the active-cell box and the fill handles are how
                ' the sheet is used, not what is in it.
                DrawSelectionOutline(context, selectionBrush, grid)
            End If

            DrawToolbar(context, size, headerBrush, headerTextBrush, selectionFill)
            DrawFormulaBar(context, size, headerBrush, headerTextBrush, textBrush, selectionBrush)
            If Not AllowEditing Then
                DrawScrollBars(context, size)
                Return
            End If

            ' The fill handles, unless the selection is the whole sheet (nothing to fill into) or the picture
            ' is a page on its way to paper.
            If Not _selectAll AndAlso Not _draggingFill AndAlso Not _printRange Then
                Dim squares As Rect() = {TopHandleRect(), HandleRect()}
                For i As Integer = 0 To squares.Length - 1
                    If grid.Contains(squares(i).Center) Then
                        context.FillRectangle(selectionBrush, squares(i))
                    End If
                Next
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
            If (Not _wholeColumns AndAlso Not _selectAll) OrElse _printRange Then
                ' Nothing to light up — and on a page there is no selection anywhere: only the cells.
                Return New Rect(0, 0, 0, 0)
            End If

            Dim first As Rect = CellRect(1, SelectionFirstColumn())
            Dim last As Rect = CellRect(1, SelectionLastColumn())
            Return New Rect(first.X, GridOrigin.Y - HeaderHeight, last.Right - first.X, HeaderHeight)
        End Function

        ''' <summary>The bit of the row header that belongs to the selected rows.</summary>
        Private Function RowHighlight(selection As Rect) As Rect
            If (Not _wholeRows AndAlso Not _selectAll) OrElse _printRange Then
                ' Nothing to light up — and on a page there is no selection anywhere: only the cells.
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

            Dim box As New Rect(input.X + 22, bar.Y + 1, Math.Max(0, input.Width - 23), bar.Height - 2)
            ' The fx box has a backcolour of its OWN (EditBackColor) and its own text colour: it is the one
            ' part of the strip a form most often wants to make obvious, which is why those rows exist.
            context.FillRectangle(New SolidColorBrush(EditBackColor), box)
            context.DrawRectangle(Nothing, New Pen(New SolidColorBrush(GridColor), 1.0), box)
            Dim editText As New SolidColorBrush(EditTextColor)
            Dim shown As String = If(_editing AndAlso _barFocused, _editText, SelectedText())
            If _editing AndAlso _barFocused Then
                DrawCellText(context, shown, box, editText, False, TextAlignment.Left, _caret)
            Else
                DrawCellText(context, shown, box, editText, False, TextAlignment.Left)
            End If

            ' A light border on the address box is the cue that it can be clicked to type there.
            context.DrawRectangle(Nothing, New Pen(accent, 1.0), New Rect(0.5, bar.Y + 0.5, name.Width, name.Height - 1))
        End Sub

        ''' <summary>
        ''' Draws one cell's border — which of its edges were asked for, at the cell's own thickness and
        ''' colour, or a null BorderColor for the sheet's GridColor (so a border that was asked for but not
        ''' coloured reads as the grid line it covers, rather than vanishing).
        '''
        ''' A cell with no border, a thickness of 0, or no cell element at all draws nothing. The lines are
        ''' CENTRED on the cell's edges, which is what lets a 1 px border sit exactly on the grid line and
        ''' cover it.
        '''
        ''' Each end is LENGTHENED by half the thickness wherever the edge it meets at that corner is drawn
        ''' too: stroking two single lines that stop at the corner leaves a small square notch on the OUTSIDE
        ''' of it (half the thickness each way) — invisible at 1 px, an obvious chip out of a 3 px box.
        ''' </summary>
        Private Sub DrawCellBorder(context As DrawingContext, rect As Rect, cell As SheetCell)
            If cell Is Nothing OrElse cell.BorderEdges = SheetBorderEdges.None Then
                Return
            End If

            Dim edges As SheetBorderEdges = cell.BorderEdges
            Dim hasTop As Boolean = (edges And SheetBorderEdges.Top) <> 0
            Dim hasRight As Boolean = (edges And SheetBorderEdges.Right) <> 0
            Dim hasBottom As Boolean = (edges And SheetBorderEdges.Bottom) <> 0
            Dim hasLeft As Boolean = (edges And SheetBorderEdges.Left) <> 0
            ' 0 = the sheet's own line, which is one pixel — the width the grid is drawn at. The EDGES are what
            ' asked for the border, so a cell that named them gets a line like every other line on the sheet
            ' rather than nothing.
            Dim weight As Double = If(cell.BorderThickness > 0, cell.BorderThickness, BorderOwnThickness)
            Dim half As Double = weight / 2
            Dim ink As Color = GridColor
            If cell.BorderColor.HasValue Then
                ink = cell.BorderColor.Value
            End If

            Dim pen As New Pen(New SolidColorBrush(ink), weight)
            If hasTop Then
                context.DrawLine(pen, New Point(rect.X - If(hasLeft, half, 0.0), rect.Y),
                    New Point(rect.Right + If(hasRight, half, 0.0), rect.Y))
            End If

            If hasBottom Then
                context.DrawLine(pen, New Point(rect.X - If(hasLeft, half, 0.0), rect.Bottom),
                    New Point(rect.Right + If(hasRight, half, 0.0), rect.Bottom))
            End If

            If hasLeft Then
                context.DrawLine(pen, New Point(rect.X, rect.Y - If(hasTop, half, 0.0)),
                    New Point(rect.X, rect.Bottom + If(hasBottom, half, 0.0)))
            End If

            If hasRight Then
                context.DrawLine(pen, New Point(rect.Right, rect.Y - If(hasTop, half, 0.0)),
                    New Point(rect.Right, rect.Bottom + If(hasBottom, half, 0.0)))
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
        Private Const HitToolbar As Integer = 13

        ''' <summary>What is under a point, and which cell it belongs to.</summary>
        Private Function HitTest(point As Point, ByRef row As Integer, ByRef column As Integer) As Integer
            row = 1
            column = 1
            Dim size As Size = Bounds.Size
            Dim grid As Rect = GridRect(size)

            ' The toolbar is ABOVE the formula bar, so it is hit FIRST: a press up there must not fall
            ' through to the bar or to the header underneath it.
            If ShowToolbar AndAlso point.Y < ToolbarHeight Then
                Return If(ToolbarButtonAt(point) >= 0, HitToolbar, HitNothing)
            End If

            Dim bar As Double = ToolbarStrip + If(ShowFormulaBar, BarHeight, 0.0)
            If ShowFormulaBar AndAlso point.Y >= ToolbarStrip AndAlso point.Y < bar Then
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
            If OnHandle(point) Then
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
            If _toolbarHot <> -1 Then
                _toolbarHot = -1
                InvalidateVisual()
            End If

            MyBase.OnPointerExited(e)
        End Sub

        ''' <summary>Starts a selection, a fill, or an edit.</summary>
        Protected Overrides Sub OnPointerPressed(e As PointerPressedEventArgs)
            Dim point As PointerPoint = e.GetCurrentPoint(Me)

            ' A press while the menu is open belongs to the menu: inside it chooses a line, outside it just
            ' closes. Either way the press does not also start a selection or a drag.
            If _menuOpen AndAlso Not point.Properties.IsRightButtonPressed Then
                ChooseMenuItem(point.Position)
                If _menuOpen AndAlso _slider >= 0 Then
                    ' A slider is being dragged: keep the pointer, so the knob follows it out of the panel the
                    ' way a scrollbar's thumb does.
                    e.Pointer.Capture(Me)
                End If

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

            ' A toolbar button first: it sits above everything else, and a press on one opens its menu rather
            ' than starting a selection in the cell that happens to be underneath.
            Dim button As Integer = ToolbarButtonAt(point.Position)
            If button >= 0 Then
                Focus()
                OpenToolbarMenu(button)
                e.Handled = True
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

            ' While the menu is open a move only highlights the line under the pointer — unless a slider is
            ' being dragged, when it moves that channel instead and the panel stays exactly as it is.
            If _menuOpen Then
                If _slider >= 0 Then
                    SetChannelFromPoint(_slider, point)
                    e.Handled = True
                    Return
                End If

                Dim hot As Integer = MenuItemAt(point)
                If hot <> _menuHot Then
                    _menuHot = hot
                    InvalidateVisual()
                End If

                Return
            End If

            ' The toolbar's own hover: which button is lit, and its word beside it. When the pointer is up in
            ' the strip the rest of this method has nothing to say, so it stops here.
            If ShowToolbar Then
                Dim over As Integer = ToolbarButtonAt(point)
                If over <> _toolbarHot Then
                    _toolbarHot = over
                    InvalidateVisual()
                End If

                If over >= 0 Then
                    Return
                End If
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
            _slider = -1
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
            ' Editing a cell that already holds a formula shows the list for what is there, so "=Su" can be
            ' finished from the keyboard without remembering the rest of the name.
            UpdateMacroPopup()
            InvalidateVisual()
        End Sub

        ''' <summary>True when the fill drag is aiming somewhere it could actually fill — down, right, up or
        ''' left, since the same maths runs either way.</summary>
        Private Function HasFillTarget() As Boolean
            Return _draggingFill AndAlso
                (_fillRow > SelectionLastRow() OrElse _fillColumn > SelectionLastColumn() OrElse
                 _fillRow < SelectionFirstRow() OrElse _fillColumn < SelectionFirstColumn())
        End Function

        ''' <summary>The block the fill would write, for the dashed preview — in whichever direction it is
        ''' being dragged, so the box drawn is the box filled.</summary>
        Private Function PreviewRect() As Rect
            Dim firstRow As Integer = Math.Min(_fillRow, SelectionFirstRow())
            Dim firstColumn As Integer = Math.Min(_fillColumn, SelectionFirstColumn())
            Dim lastRow As Integer = Math.Max(_fillRow, SelectionLastRow())
            Dim lastColumn As Integer = Math.Max(_fillColumn, SelectionLastColumn())
            Dim first As Rect = CellRect(firstRow, firstColumn)
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

                UpdateMacroPopup()             ' where the caret is decides which '=' is being typed after
                InvalidateVisual()
                Return True
            End If

            If e.Key = Key.Right Then
                If _caret < _editText.Length Then
                    _caret += 1
                End If

                UpdateMacroPopup()
                InvalidateVisual()
                Return True
            End If

            If e.Key = Key.Home Then
                _caret = 0
                UpdateMacroPopup()
                InvalidateVisual()
                Return True
            End If

            If e.Key = Key.End Then
                _caret = _editText.Length
                UpdateMacroPopup()
                InvalidateVisual()
                Return True
            End If

            If e.Key = Key.Back Then
                If _caret > 0 Then
                    _editText = _editText.Substring(0, _caret - 1) & _editText.Substring(_caret)
                    _caret -= 1
                End If

                UpdateMacroPopup()
                InvalidateVisual()
                Return True
            End If

            If e.Key = Key.Delete Then
                If _caret < _editText.Length Then
                    _editText = _editText.Substring(0, _caret) & _editText.Substring(_caret + 1)
                End If

                UpdateMacroPopup()
                InvalidateVisual()
                Return True
            End If

            If control AndAlso e.Key = Key.A Then
                _editText = String.Empty
                _caret = 0
                UpdateMacroPopup()
                InvalidateVisual()
                Return True
            End If

            Return False
        End Function

        ''' <summary>Typing inside the editor inserts at the caret.</summary>
        Private Sub InsertIntoEdit(text As String)
            _editText = _editText.Substring(0, _caret) & text & _editText.Substring(_caret)
            _caret += text.Length
            ' A '=' typed anywhere opens the macro list; any other letter refilters it.
            UpdateMacroPopup()
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
            CloseMacroPopup()

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

        ''' <summary>
        ''' Writes the fill into the area the handle was dragged over — in any of the four directions.
        '''
        ''' PER CELL, from the cell that destination copies: a FORMULA is the source's formula with every
        ''' relative address moved by the distance between the two cells (so =Sum(B2:B9) dragged one row
        ''' down reads =Sum(B3:B10), and a $ holds a part still), while anything else keeps the series
        ''' prediction it has always had — 1, 2 becomes 3, 4 …, Item1, Item2 becomes Item3, and a pattern
        ''' repeats. That split is what makes a column of totals beside a column of figures fill sensibly in
        ''' one gesture.
        ''' </summary>
        Private Sub ApplyFill()
            Dim firstRow As Integer = SelectionFirstRow()
            Dim firstColumn As Integer = SelectionFirstColumn()
            Dim lastRow As Integer = SelectionLastRow()
            Dim lastColumn As Integer = SelectionLastColumn()

            ' DOWN or UP: one pass per column of the source block.
            If _fillRow > lastRow OrElse _fillRow < firstRow Then
                Dim down As Boolean = _fillRow > lastRow
                Dim count As Integer = If(down, _fillRow - lastRow, firstRow - _fillRow)
                Dim firstTarget As Integer = If(down, lastRow + 1, _fillRow)
                Dim height As Integer = _fillSourceLastRow - _fillSourceFirstRow + 1
                For column As Integer = _fillSourceFirstColumn To _fillSourceLastColumn
                    Dim source As String() = ReadColumn(column, _fillSourceFirstRow, _fillSourceLastRow)
                    Dim written As String() = PredictSeries(source, count, If(down, 1, -1))
                    For i As Integer = 0 To written.Length - 1
                        Dim row As Integer = firstTarget + i
                        Dim baseRow As Integer = _fillSourceFirstRow + i Mod height
                        Dim baseText As String = GetCell(baseRow, column)
                        Dim filled As String = If(baseText.Length > 0 AndAlso baseText(0) = "="c,
                            "=" & ShiftFormula(baseText.Substring(1), row - baseRow, 0), written(i))
                        SetCell(row, column, filled)
                    Next
                Next

                SelectRange(Math.Min(firstRow, _fillRow), firstColumn, Math.Max(lastRow, _fillRow), lastColumn)
                Return
            End If

            ' RIGHT or LEFT: the same, one pass per row.
            If _fillColumn > lastColumn OrElse _fillColumn < firstColumn Then
                Dim right As Boolean = _fillColumn > lastColumn
                Dim count As Integer = If(right, _fillColumn - lastColumn, firstColumn - _fillColumn)
                Dim firstTarget As Integer = If(right, lastColumn + 1, _fillColumn)
                Dim width As Integer = _fillSourceLastColumn - _fillSourceFirstColumn + 1
                For row As Integer = _fillSourceFirstRow To _fillSourceLastRow
                    Dim source As String() = ReadRow(row, _fillSourceFirstColumn, _fillSourceLastColumn)
                    Dim written As String() = PredictSeries(source, count, If(right, 1, -1))
                    For i As Integer = 0 To written.Length - 1
                        Dim column As Integer = firstTarget + i
                        Dim baseColumn As Integer = _fillSourceFirstColumn + i Mod width
                        Dim baseText As String = GetCell(row, baseColumn)
                        Dim filled As String = If(baseText.Length > 0 AndAlso baseText(0) = "="c,
                            "=" & ShiftFormula(baseText.Substring(1), 0, column - baseColumn), written(i))
                        SetCell(row, column, filled)
                    Next
                Next

                SelectRange(firstRow, Math.Min(firstColumn, _fillColumn), lastRow, Math.Max(lastColumn, _fillColumn))
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
        '''
        ''' direction is 1 when the fill was dragged forwards (down or right) and -1 when it was dragged
        ''' backwards (up or left): the same step, extended the other way — 3, 4 filled upwards becomes
        ''' 1, 2 — which is what "continue this series" means in both directions.
        ''' </summary>
        Private Shared Function PredictSeries(source As IReadOnlyList(Of String), count As Integer) As String()
            Return PredictSeries(source, count, 1)
        End Function

        Private Shared Function PredictSeries(source As IReadOnlyList(Of String), count As Integer,
            direction As Integer) As String()
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

            ' How far the destination sits from the block's FIRST value: +1 is the value after a one-cell
            ' block, -1 the value before it, and so on for the whole run.
            Dim distance As Integer() = New Integer(written.Length - 1) {}
            For i As Integer = 0 To written.Length - 1
                distance(i) = If(direction > 0, source.Count + i, i - count)
            Next

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
                    Dim firstValue As Double = numbers(0)
                    For i As Integer = 0 To written.Length - 1
                        written(i) = FormatNumber(firstValue + stepValue * distance(i), decimals)
                    Next

                    Return written
                End If
            End If

            If numbers IsNot Nothing AndAlso numbers.Count = 1 Then
                For i As Integer = 0 To written.Length - 1
                    written(i) = FormatNumber(numbers(0) + distance(i), decimals)
                Next

                Return written
            End If

            Dim prefix As String = Nothing
            Dim suffix As String = Nothing
            Dim first As Integer = 0
            Dim numberStep As Integer = 0
            If SplitTrailingNumber(source, prefix, suffix, first, numberStep) Then
                For i As Integer = 0 To written.Length - 1
                    written(i) = prefix & (first + numberStep * distance(i)).ToString(CultureInfo.InvariantCulture) & suffix
                Next

                Return written
            End If

            For i As Integer = 0 To written.Length - 1
                Dim at As Integer = distance(i) Mod source.Count
                If at < 0 Then
                    at += source.Count
                End If

                written(i) = source(at)
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

        ' ---- formulas -----------------------------------------------------------------------------
        '
        ' A cell whose text starts with '=' is a FORMULA. The text is what the user typed and what the fx box
        ' and the editor show; the GRID draws what it works out to (ValueOf), so a sheet reads as its results
        ' while its formulas stay visible where they are edited — the way every spreadsheet behaves.
        '
        ' The dialect is the small, honest subset a result grid needs: the four operators, ^ and &,
        ' comparisons, parentheses, A1 references, A1:B3 ranges, and the functions below. What cannot be
        ' worked out has a NAME — #VALUE!, #NAME?, #REF!, #DIV/0!, #CYCLE! — rather than drawing blank or
        ' throwing, because a form is not a place to crash.
        '
        ' VB traps this port had to respect: "Mod", "Not" and "Name" are all taken (an operator, an operator,
        ' and a control's own property), IsNumeric is a built-in function, and a Structure cannot have a
        ' member called Single — so the members are Modulo / LogicalNot / ReadName / IsNumericValue, and the
        ' FormulaArg factories are OfSingle / OfRange.

        Private Const DivisionByZero As String = "#DIV/0!"
        Private Const ValueError As String = "#VALUE!"
        Private Const NameError As String = "#NAME?"
        Private Const RefError As String = "#REF!"
        Private Const CycleError As String = "#CYCLE!"

        ''' <summary>How deep a formula may nest before it is refused. A hand-typed monster
        ''' (=((((… would otherwise recurse until the stack ran out, which takes the whole app down.</summary>
        Private Const FormulaMaxDepth As Integer = 64

        ''' <summary>A cell's identity as one number, for the two collections above.</summary>
        Private Shared Function CellKey(row As Integer, column As Integer) As Long
            Return (CLng(row) << 20) Or CUInt(column)
        End Function

        ''' <summary>Forgets what every formula worked out. Called whenever any cell's text changes, which
        ''' is the only thing a formula result depends on.</summary>
        Private Sub InvalidateValues()
            _values.Clear()
        End Sub

        ''' <summary>
        ''' What a cell SHOWS: its text, or — for a formula — what it works out to. <see cref="GetCell"/>
        ''' still returns the formula itself, which is what the fx box reads and edits.
        ''' </summary>
        Public Function ValueOf(row As Integer, column As Integer) As String
            Dim text As String = GetCell(row, column)
            If text.Length < 2 OrElse text(0) <> "="c Then
                Return text
            End If

            Dim key As Long = CellKey(row, column)
            Dim cached As String = Nothing
            If _values.TryGetValue(key, cached) Then
                Return cached
            End If

            Dim result As String = EvaluateFormula(row, column, text.Substring(1))
            _values(key) = result
            Return result
        End Function

        Private Function EvaluateFormula(row As Integer, column As Integer, body As String) As String
            Dim key As Long = CellKey(row, column)
            If Not _evaluating.Add(key) Then
                Return CycleError             ' already being worked out further up: this cell reaches itself
            End If

            Try
                Return FormulaFormat(New FormulaParser(Me, row, column, body).Work())
            Catch failure As FormulaError
                Return failure.Code
            Catch ex As Exception
                Return ValueError            ' a formula must never be able to take the app down
            Finally
                _evaluating.Remove(key)
            End Try
        End Function

        ''' <summary>What a formula is working with: a number, TRUE/FALSE, text, blank, or an error name.</summary>
        Private Enum FormulaKind
            Blank
            Number
            Bool
            Text
            [Error]
        End Enum

        Private Structure FormulaValue
            Public Kind As FormulaKind
            Public Number As Double
            Public Text As String

            Public Shared Function BlankValue() As FormulaValue
                Dim value As FormulaValue
                value.Kind = FormulaKind.Blank
                value.Number = 0.0
                value.Text = String.Empty
                Return value
            End Function

            Public Shared Function OfNumber(number As Double) As FormulaValue
                Dim value As FormulaValue
                value.Kind = FormulaKind.Number
                value.Number = number
                value.Text = String.Empty
                Return value
            End Function

            Public Shared Function OfBool(flag As Boolean) As FormulaValue
                Dim value As FormulaValue
                value.Kind = FormulaKind.Bool
                value.Number = If(flag, 1.0, 0.0)
                value.Text = String.Empty
                Return value
            End Function

            Public Shared Function OfText(text As String) As FormulaValue
                Dim value As FormulaValue
                value.Kind = FormulaKind.Text
                value.Number = 0.0
                value.Text = If(text Is Nothing, String.Empty, text)
                Return value
            End Function

            Public Shared Function Err(code As String) As FormulaValue
                Dim value As FormulaValue
                value.Kind = FormulaKind.Error
                value.Number = 0.0
                value.Text = code
                Return value
            End Function
        End Structure

        ''' <summary>A formula that cannot be worked out. The code is one of the #… names above.</summary>
        Private NotInheritable Class FormulaError
            Inherits Exception

            Public Sub New(code As String)
                MyBase.New(code)
                Me.Code = code
            End Sub

            Public ReadOnly Property Code As String
        End Class

        ''' <summary>The text a result is drawn as: a whole number without a decimal point, a fraction with up
        ''' to six places, TRUE/FALSE for a comparison, and an error as its own name.</summary>
        Private Shared Function FormulaFormat(value As FormulaValue) As String
            Select Case value.Kind
                Case FormulaKind.Number
                    If Double.IsNaN(value.Number) OrElse Double.IsInfinity(value.Number) Then
                        Return ValueError
                    End If

                    Dim rounded As Double = Math.Round(value.Number, 6)
                    If Math.Abs(rounded) < 0.000000001 Then
                        Return "0"
                    End If

                    If Math.Abs(rounded - Math.Round(rounded)) < 0.000000001 Then
                        Return Math.Round(rounded).ToString(CultureInfo.InvariantCulture)
                    End If

                    Return rounded.ToString("0.######", CultureInfo.InvariantCulture)
                Case FormulaKind.Bool
                    Return If(value.Number <> 0.0, "TRUE", "FALSE")
                Case FormulaKind.Error
                    Return value.Text
                Case FormulaKind.Text
                    Return value.Text
                Case Else
                    Return String.Empty
            End Select
        End Function

        ''' <summary>True when a formatted result is one of the error names, so a formula that reads it
        ''' hands the error on instead of treating "#DIV/0!" as a word.</summary>
        Private Shared Function IsErrorName(text As String) As Boolean
            Return text = DivisionByZero OrElse text = ValueError OrElse text = NameError OrElse
                text = RefError OrElse text = CycleError
        End Function

        ''' <summary>True when a value takes part in arithmetic on its own (a number, TRUE/FALSE, a blank,
        ''' or text that reads as a number).</summary>
        Private Shared Function IsNumericValue(value As FormulaValue) As Boolean
            If value.Kind = FormulaKind.Number OrElse value.Kind = FormulaKind.Bool OrElse
                value.Kind = FormulaKind.Blank Then
                Return True
            End If

            If value.Kind = FormulaKind.Error Then
                Throw New FormulaError(value.Text)
            End If

            Dim parsed As Double = 0.0
            Return Double.TryParse(value.Text, NumberStyles.Float, CultureInfo.InvariantCulture, parsed)
        End Function

        ''' <summary>A value as a number for arithmetic: blank counts as zero, text that reads as a number
        ''' counts as one, and anything else is #VALUE!.</summary>
        Private Shared Function Numeric(value As FormulaValue) As Double
            If value.Kind = FormulaKind.Number OrElse value.Kind = FormulaKind.Bool Then
                Return value.Number
            End If

            If value.Kind = FormulaKind.Blank Then
                Return 0.0
            End If

            If value.Kind = FormulaKind.Error Then
                Throw New FormulaError(value.Text)
            End If

            Dim parsed As Double = 0.0
            If Double.TryParse(value.Text, NumberStyles.Float, CultureInfo.InvariantCulture, parsed) Then
                Return parsed
            End If

            Throw New FormulaError(ValueError)
        End Function

        ''' <summary>True when a value is a number that is not zero, TRUE/FALSE as themselves, and the words
        ''' TRUE/FALSE; anything else is #VALUE! — how IF, AND and OR read their condition.</summary>
        Private Shared Function Truthy(value As FormulaValue) As Boolean
            If value.Kind = FormulaKind.Number OrElse value.Kind = FormulaKind.Bool Then
                Return value.Number <> 0.0
            End If

            If value.Kind = FormulaKind.Blank Then
                Return False
            End If

            If value.Kind = FormulaKind.Error Then
                Throw New FormulaError(value.Text)
            End If

            Dim text As String = value.Text.Trim()
            If String.Equals(text, "TRUE", StringComparison.OrdinalIgnoreCase) Then
                Return True
            End If

            If String.Equals(text, "FALSE", StringComparison.OrdinalIgnoreCase) Then
                Return False
            End If

            Throw New FormulaError(ValueError)
        End Function

        ''' <summary>A referenced cell's value: blank for an empty cell, its TEXT for a literal one, and for a
        ''' formula cell what it worked out to (handing on its error if it has one).</summary>
        Private Function Reference(row As Integer, column As Integer) As FormulaValue
            If row < 1 OrElse column < 1 OrElse row > RowCount OrElse column > ColumnCount Then
                Throw New FormulaError(RefError)
            End If

            Dim text As String = GetCell(row, column)
            If text.Length = 0 Then
                Return FormulaValue.BlankValue()
            End If

            If text(0) = "="c Then
                Dim shown As String = ValueOf(row, column)
                Return If(IsErrorName(shown), FormulaValue.Err(shown), FormulaValue.OfText(shown))
            End If

            Return FormulaValue.OfText(text)
        End Function

        ''' <summary>
        ''' Reads "A1" / "$A$1" AT AN OFFSET in a formula, reporting how many characters it used. This is not
        ''' <see cref="ParseCellName"/>, which reads a whole string and knows nothing of "$": a formula is
        ''' read left to right, so the address has to be found where it starts and the reader has to be told
        ''' where it ended. Bounds are NOT checked here — the caller decides (a reference off the sheet is
        ''' #REF!, a range is clipped to the sheet).
        ''' </summary>
        Private Shared Function TryReadAddress(text As String, at As Integer, ByRef row As Integer,
            ByRef column As Integer, ByRef used As Integer) As Boolean
            Dim ignored1 As Boolean = False
            Dim ignored2 As Boolean = False
            Return TryReadAnchoredAddress(text, at, row, column, used, ignored1, ignored2)
        End Function

        ''' <summary>
        ''' An address, with which parts of it were ANCHORED with a $ — what a copied formula has to know and
        ''' what the evaluator can ignore. $B$2 is fixed in both directions, B$2 keeps its row and $B2 its
        ''' column; a bare B2 moves with the copy, which is the whole point of a dollar sign.
        ''' </summary>
        Private Shared Function TryReadAnchoredAddress(text As String, at As Integer, ByRef row As Integer,
            ByRef column As Integer, ByRef used As Integer, ByRef rowFixed As Boolean,
            ByRef columnFixed As Boolean) As Boolean
            row = 0
            column = 0
            used = 0
            Dim index As Integer = at
            While index < text.Length AndAlso text(index) = "$"c
                index += 1
            End While

            Dim letters As Integer = 0
            Dim column1 As Integer = 0
            While index < text.Length
                Dim c As Char = text(index)
                Dim upper As Char = If(c >= "a"c AndAlso c <= "z"c, ChrW(AscW(c) - 32), c)
                If upper < "A"c OrElse upper > "Z"c Then
                    Exit While
                End If

                column1 = column1 * 26 + (AscW(upper) - AscW("A"c) + 1)
                letters += 1
                index += 1
            End While

            Dim dollars As Integer = 0
            While index < text.Length AndAlso text(index) = "$"c
                dollars += 1
                index += 1
            End While

            Dim digits As Integer = 0
            Dim row1 As Integer = 0
            While index < text.Length AndAlso text(index) >= "0"c AndAlso text(index) <= "9"c
                Dim digit As Integer = AscW(text(index)) - AscW("0"c)
                If row1 > 10000000 Then
                    Return False
                End If

                row1 = row1 * 10 + digit
                digits += 1
                index += 1
            End While

            If letters < 1 OrElse letters > 3 OrElse digits < 1 OrElse digits > 7 Then
                Return False
            End If

            row = row1
            column = column1
            used = index - at
            ' A $ before the letters anchors the COLUMN, one before the digits anchors the ROW.
            columnFixed = text(at) = "$"c
            rowFixed = dollars > 0
            Return row > 0 AndAlso column > 0
        End Function

        ''' <summary>
        ''' A formula body with every RELATIVE reference moved by a fill's offset — what a formula MEANS in
        ''' its new home. Anchors do not move ($B$2 never does, B$2 keeps its row, $B2 its column), and a
        ''' reference that would land off the sheet becomes #REF! in the text: the one answer that tells the
        ''' truth about a cell that now points at nothing (what every other spreadsheet writes).
        '''
        ''' Only whole addresses move. Text is never touched — a formula holding "A1" is QUOTING it — and
        ''' neither is a function name, because TryReadAnchoredAddress needs a letter run AND a digit run, and
        ''' a name that is followed by an opening bracket is not an address either.
        ''' </summary>
        Private Shared Function ShiftFormula(body As String, rowDelta As Integer, columnDelta As Integer) As String
            If rowDelta = 0 AndAlso columnDelta = 0 Then
                Return body
            End If

            Dim builder As New System.Text.StringBuilder(body.Length + 8)
            Dim i As Integer = 0
            While i < body.Length
                Dim c As Char = body(i)
                If c = """"c Then
                    ' A string literal, copied exactly — doubled quotes and all, the way the parser reads it.
                    Dim start As Integer = i
                    i += 1
                    While i < body.Length
                        If body(i) = """"c Then
                            If i + 1 < body.Length AndAlso body(i + 1) = """"c Then
                                i += 2
                                Continue While
                            End If

                            i += 1
                            Exit While
                        End If

                        i += 1
                    End While

                    builder.Append(body.Substring(start, i - start))
                    Continue While
                End If

                Dim row1 As Integer = 0
                Dim column1 As Integer = 0
                Dim used As Integer = 0
                Dim rowFixed As Boolean = False
                Dim columnFixed As Boolean = False
                If TryReadAnchoredAddress(body, i, row1, column1, used, rowFixed, columnFixed) AndAlso
                    WholeToken(body, i, used) Then
                    Dim movedRow As Integer = If(rowFixed, row1, row1 + rowDelta)
                    Dim movedColumn As Integer = If(columnFixed, column1, column1 + columnDelta)
                    If movedRow < 1 OrElse movedColumn < 1 Then
                        builder.Append(RefError)
                    Else
                        Dim address As New System.Text.StringBuilder()
                        If columnFixed Then
                            address.Append("$")
                        End If

                        address.Append(ColumnName(movedColumn))
                        If rowFixed Then
                            address.Append("$")
                        End If

                        address.Append(movedRow.ToString(CultureInfo.InvariantCulture))
                        builder.Append(address.ToString())
                    End If

                    i += used
                    Continue While
                End If

                builder.Append(c)
                i += 1
            End While

            Return builder.ToString()
        End Function

        ''' <summary>True when the address at "at" stands alone: nothing that could make it part of a longer
        ''' name touches it, so a name like A1B is left as the name it is. A DOT is a boundary when it is one
        ''' of the two that spell a range (A1..B2) and not when it continues a name.</summary>
        Private Shared Function WholeToken(text As String, at As Integer, used As Integer) As Boolean
            If at > 0 AndAlso IsNameChar(text(at - 1)) Then
                Return False
            End If

            If at + used >= text.Length Then
                Return True
            End If

            Dim next1 As Char = text(at + used)
            If IsNameChar(next1) Then
                Return False
            End If

            Return next1 <> "."c OrElse (at + used + 1 < text.Length AndAlso text(at + used + 1) = "."c)
        End Function

        Private Shared Function IsNameChar(c As Char) As Boolean
            Return Char.IsLetterOrDigit(c) OrElse c = "_"c
        End Function

        ''' <summary>
        ''' Reads a formula: the four operators, ^ and &amp;, comparisons, parentheses, "text", A1 references,
        ''' A1:B3 ranges and the function set. Left to right, one pass, throwing <see cref="FormulaError"/>
        ''' with the name the cell should show.
        ''' </summary>
        Private NotInheritable Class FormulaParser
            Private ReadOnly _sheet As GrumpySheet
            Private ReadOnly _row As Integer
            Private ReadOnly _column As Integer
            Private ReadOnly _text As String
            Private _at As Integer
            Private _depth As Integer

            Public Sub New(sheet As GrumpySheet, row As Integer, column As Integer, text As String)
                _sheet = sheet
                _row = row
                _column = column
                _text = text
            End Sub

            ''' <summary>Works the whole formula out. Anything left over at the end is a typo, not a value.</summary>
            Public Function Work() As FormulaValue
                Dim value As FormulaValue = Comparison()
                SkipSpaces()
                If _at <> _text.Length Then
                    Throw New FormulaError(ValueError)
                End If

                Return value
            End Function

            ' ---- the expression ladder -------------------------------------------------------------

            Private Function Comparison() As FormulaValue
                Dim left As FormulaValue = Concat()
                Dim op As String = ComparisonOperator()
                If op.Length = 0 Then
                    Return left
                End If

                Return FormulaValue.OfBool(Compare(left, Concat(), op))
            End Function

            Private Function ComparisonOperator() As String
                SkipSpaces()
                Dim c As Char = Peek()
                If c = "="c Then
                    _at += 1
                    Return "="
                End If

                If c <> "<"c AndAlso c <> ">"c Then
                    Return String.Empty
                End If

                _at += 1
                Dim nextChar As Char = Peek()
                If nextChar = "="c Then
                    _at += 1
                    Return If(c = "<"c, "<=", ">=")
                End If

                If c = "<"c AndAlso nextChar = ">"c Then
                    _at += 1
                    Return "<>"
                End If

                Return If(c = "<"c, "<", ">")
            End Function

            Private Shared Function Compare(left As FormulaValue, right As FormulaValue, op As String) As Boolean
                Dim sign As Integer
                If IsNumericValue(left) AndAlso IsNumericValue(right) Then
                    sign = Numeric(left).CompareTo(Numeric(right))
                Else
                    Dim l As String = If(left.Kind = FormulaKind.Error, left.Text, AsText(left))
                    Dim r As String = If(right.Kind = FormulaKind.Error, right.Text, AsText(right))
                    sign = String.Compare(l, r, StringComparison.OrdinalIgnoreCase)
                End If

                Select Case op
                    Case "="
                        Return sign = 0
                    Case "<>"
                        Return sign <> 0
                    Case "<"
                        Return sign < 0
                    Case ">"
                        Return sign > 0
                    Case "<="
                        Return sign <= 0
                    Case Else
                        Return sign >= 0
                End Select
            End Function

            ''' <summary>A value as the text a comparison and &amp; see.</summary>
            Private Shared Function AsText(value As FormulaValue) As String
                Return If(value.Kind = FormulaKind.Text, value.Text, FormulaFormat(value))
            End Function

            Private Function Concat() As FormulaValue
                Dim value As FormulaValue = Additive()
                Do
                    SkipSpaces()
                    If Peek() <> "&"c Then
                        Return value
                    End If

                    _at += 1
                    value = FormulaValue.OfText(AsText(value) & AsText(Additive()))
                Loop
            End Function

            Private Function Additive() As FormulaValue
                Dim value As FormulaValue = Multiplicative()
                Do
                    SkipSpaces()
                    Dim c As Char = Peek()
                    If c <> "+"c AndAlso c <> "-"c Then
                        Return value
                    End If

                    _at += 1
                    Dim right As FormulaValue = Multiplicative()
                    value = FormulaValue.OfNumber(If(c = "+"c, Numeric(value) + Numeric(right),
                        Numeric(value) - Numeric(right)))
                Loop
            End Function

            Private Function Multiplicative() As FormulaValue
                Dim value As FormulaValue = Power()
                Do
                    SkipSpaces()
                    Dim c As Char = Peek()
                    If c <> "*"c AndAlso c <> "/"c Then
                        Return value
                    End If

                    _at += 1
                    Dim right As FormulaValue = Power()
                    Dim left As Double = Numeric(value)
                    Dim divisor As Double = Numeric(right)
                    If c = "/"c AndAlso Math.Abs(divisor) < Double.Epsilon Then
                        Throw New FormulaError(DivisionByZero)
                    End If

                    value = FormulaValue.OfNumber(If(c = "*"c, left * divisor, left / divisor))
                Loop
            End Function

            Private Function Power() As FormulaValue
                Dim value As FormulaValue = Unary()
                SkipSpaces()
                If Peek() <> "^"c Then
                    Return value
                End If

                _at += 1
                Dim exponent As Double = Numeric(Power())     ' right-associative, as every spreadsheet has it
                Dim baseValue As Double = Numeric(value)
                If Math.Abs(baseValue) < Double.Epsilon AndAlso exponent < 0.0 Then
                    Throw New FormulaError(DivisionByZero)    ' 0^-1 is a division by zero, not infinity
                End If

                Return FormulaValue.OfNumber(Math.Pow(baseValue, exponent))
            End Function

            Private Function Unary() As FormulaValue
                Dim negative As Boolean = False
                Do
                    SkipSpaces()
                    Dim c As Char = Peek()
                    If c = "-"c Then
                        negative = Not negative
                        _at += 1
                        Continue Do
                    End If

                    If c = "+"c Then
                        _at += 1
                        Continue Do
                    End If

                    Exit Do
                Loop

                Dim value As FormulaValue = Primary()
                Return If(negative, FormulaValue.OfNumber(-Numeric(value)), value)
            End Function

            Private Function Primary() As FormulaValue
                SkipSpaces()
                Dim c As Char = Peek()
                If c = "("c Then
                    _at += 1
                    Enter()
                    Dim inner As FormulaValue = Comparison()
                    Leave()
                    SkipSpaces()
                    If Peek() <> ")"c Then
                        Throw New FormulaError(ValueError)
                    End If

                    _at += 1
                    Return inner
                End If

                If c = """"c Then
                    Return FormulaValue.OfText(ReadText())
                End If

                If (c >= "0"c AndAlso c <= "9"c) OrElse c = "."c Then
                    Return FormulaValue.OfNumber(ReadNumber())
                End If

                If Char.IsLetter(c) OrElse c = "$"c OrElse c = "_"c Then
                    Return ReadName()
                End If

                Throw New FormulaError(ValueError)
            End Function

            ''' <summary>A name is either a cell reference (A1) or a function call (SUM(…)), and nothing else
            ''' has a value here — an unknown word is #NAME?, which is what a typo deserves.
            ''' (Called "ReadName", not "Name": a control already HAS a Name property.)</summary>
            Private Function ReadName() As FormulaValue
                Dim start As Integer = _at
                While _at < _text.Length
                    Dim c As Char = _text(_at)
                    If Char.IsLetterOrDigit(c) OrElse c = "$"c OrElse c = "_"c OrElse c = "."c Then
                        _at += 1
                        Continue While
                    End If

                    Exit While
                End While

                Dim name As String = _text.Substring(start, _at - start)
                SkipSpaces()
                If Peek() = "("c Then
                    Return CallFunction(name.ToUpperInvariant())
                End If

                Dim row1 As Integer = 0
                Dim column1 As Integer = 0
                Dim used As Integer = 0
                If TryReadAddress(_text, start, row1, column1, used) AndAlso used = name.Length Then
                    ' $ on an address is accepted and ignored: the sheet has no copy/paste yet, so there is no
                    ' relative/absolute distinction for it to carry.
                    Return _sheet.Reference(row1, column1)
                End If

                Throw New FormulaError(NameError)
            End Function

            ' ---- the pieces ------------------------------------------------------------------------

            Private Sub Enter()
                _depth += 1
                If _depth > FormulaMaxDepth Then
                    Throw New FormulaError(ValueError)
                End If
            End Sub

            Private Sub Leave()
                _depth -= 1
            End Sub

            Private Function ReadText() As String
                _at += 1                                ' the opening quote
                Dim builder As New System.Text.StringBuilder()
                Do
                    If _at >= _text.Length Then
                        Throw New FormulaError(ValueError)     ' unterminated
                    End If

                    Dim c As Char = _text(_at)
                    _at += 1
                    If c = """"c Then
                        If _at < _text.Length AndAlso _text(_at) = """"c Then
                            _at += 1                    ' "" is one quote, as in every dialect
                            builder.Append(""""c)
                            Continue Do
                        End If

                        Return builder.ToString()
                    End If

                    builder.Append(c)
                Loop
            End Function

            Private Function ReadNumber() As Double
                Dim start As Integer = _at
                While _at < _text.Length
                    Dim c As Char = _text(_at)
                    If (c >= "0"c AndAlso c <= "9"c) OrElse c = "."c Then
                        _at += 1
                        Continue While
                    End If

                    Exit While
                End While

                Dim body As String = _text.Substring(start, _at - start)
                Dim value As Double = 0.0
                If Not Double.TryParse(body, NumberStyles.Float, CultureInfo.InvariantCulture, value) Then
                    Throw New FormulaError(ValueError)
                End If

                Return value
            End Function

            Private Function Peek() As Char
                Return If(_at < _text.Length, _text(_at), ChrW(0))
            End Function

            Private Sub SkipSpaces()
                While _at < _text.Length AndAlso (_text(_at) = " "c OrElse _text(_at) = ChrW(9))
                    _at += 1
                End While
            End Sub

            Private Sub Expect(c As Char)
                SkipSpaces()
                If Peek() <> c Then
                    Throw New FormulaError(ValueError)
                End If

                _at += 1
            End Sub

            ''' <summary>Walks over one argument without working it out — how IF finds both of its branches
            ''' before deciding which one to evaluate.</summary>
            Private Sub SkipArgument()
                Dim depth As Integer = 0
                While _at < _text.Length
                    Dim c As Char = _text(_at)
                    If c = """"c Then
                        ReadText()
                        Continue While
                    End If

                    If c = "("c Then
                        depth += 1
                    ElseIf c = ")"c Then
                        If depth = 0 Then
                            Return                      ' the call's own closing paren: the argument ended here
                        End If

                        depth -= 1
                    ElseIf c = ","c AndAlso depth = 0 Then
                        Return
                    End If

                    _at += 1
                End While
            End Sub

            ' ---- functions -------------------------------------------------------------------------

            ''' <summary>"CallFunction", not "Call": Call is a VB keyword and neither twin may use it.</summary>
            Private Function CallFunction(name As String) As FormulaValue
                If name = "IF" Then
                    Return CallIf()
                End If

                Expect("("c)
                Dim args As New List(Of FormulaArg)()
                SkipSpaces()
                If Peek() <> ")"c Then
                    Do
                        args.Add(Argument())
                        SkipSpaces()
                        If Peek() <> ","c Then
                            Exit Do
                        End If

                        _at += 1
                    Loop
                End If

                Expect(")"c)
                Return Apply(name, args)
            End Function

            ''' <summary>
            ''' IF is the one function that does not work out all of its arguments: =IF(A1=0,0,1/A1) is the
            ''' usual way to guard a division, and that only works when the branch NOT taken is never
            ''' evaluated. So its branches are skipped over and the one that is taken is parsed on its own.
            ''' </summary>
            Private Function CallIf() As FormulaValue
                Expect("("c)
                Dim condition As Boolean = Truthy(Comparison())
                Expect(","c)
                Dim thenStart As Integer = _at
                SkipArgument()
                Dim thenEnd As Integer = _at
                Dim elseStart As Integer = thenEnd
                Dim elseEnd As Integer = thenEnd
                SkipSpaces()
                If Peek() = ","c Then
                    _at += 1
                    elseStart = _at
                    SkipArgument()
                    elseEnd = _at
                    SkipSpaces()
                End If

                If Peek() = ","c Then
                    _at += 1
                    SkipArgument()                  ' IF takes three arguments; anything beyond is ignored
                End If

                Expect(")"c)
                Dim start As Integer = If(condition, thenStart, elseStart)
                Dim [end] As Integer = If(condition, thenEnd, elseEnd)
                If [end] <= start Then
                    Return FormulaValue.BlankValue()     ' a branch that was left out is blank
                End If

                Return New FormulaParser(_sheet, _row, _column, _text.Substring(start, [end] - start)).Work()
            End Function

            ''' <summary>One argument: a range (A1:B3 or A1..B3 — only meaningful as an argument) or an
            ''' expression.</summary>
            Private Function Argument() As FormulaArg
                SkipSpaces()
                Dim save As Integer = _at
                Dim row1 As Integer = 0
                Dim column1 As Integer = 0
                Dim used As Integer = 0
                If TryReadAddress(_text, _at, row1, column1, used) Then
                    Dim probe As Integer = _at + used
                    While probe < _text.Length AndAlso (_text(probe) = " "c OrElse _text(probe) = ChrW(9))
                        probe += 1
                    End While

                    ' A range reads A1:B3 or A1..B3. The COLON is what this sheet writes (the macro list
                    ' and the shift-on-fill both keep to it) and what every spreadsheet taught; the older
                    ' two-dot form is still read, so a formula typed before this change is left alone.
                    Dim separator As Integer = 0
                    If probe < _text.Length AndAlso _text(probe) = ":"c Then
                        separator = 1
                    ElseIf probe + 1 < _text.Length AndAlso _text(probe) = "."c AndAlso _text(probe + 1) = "."c Then
                        separator = 2
                    End If

                    If separator > 0 Then
                        probe += separator
                        Dim row2 As Integer = 0
                        Dim column2 As Integer = 0
                        Dim used2 As Integer = 0
                        If TryReadAddress(_text, probe, row2, column2, used2) Then
                            _at = probe + used2
                            ' A range is CLIPPED to the sheet: SUM(B2:B999) on a 50-row sheet is the whole
                            ' column, which is what the author meant. A single reference off the sheet is
                            ' still #REF!, because there is nothing there to read.
                            Dim firstRow As Integer = Math.Max(1, Math.Min(row1, row2))
                            Dim lastRow As Integer = Math.Min(_sheet.RowCount, Math.Max(row1, row2))
                            Dim firstColumn As Integer = Math.Max(1, Math.Min(column1, column2))
                            Dim lastColumn As Integer = Math.Min(_sheet.ColumnCount, Math.Max(column1, column2))
                            Return FormulaArg.OfRange(firstRow, firstColumn, lastRow, lastColumn)
                        End If

                        Throw New FormulaError(RefError)
                    End If
                End If

                _at = save
                Return FormulaArg.OfSingle(Comparison())
            End Function

            Private Function Apply(name As String, args As List(Of FormulaArg)) As FormulaValue
                Select Case name
                    Case "SUM", "AVERAGE", "AVG", "MIN", "MAX", "COUNT", "COUNTA", "STDEV", "STDDEV", "STDEVP", "STDDEVP"
                        Return Aggregate(name, args)
                    Case "ABS"
                        Return One(args, AddressOf Math.Abs)
                    Case "SQRT"
                        Return One(args, AddressOf Math.Sqrt)
                    Case "INT"
                        Return One(args, AddressOf Math.Floor)
                    Case "ROUND"
                        Return RoundArgs(args)
                    Case "MOD"
                        Return Modulo(args)
                    Case "AND"
                        Return Logic(args, True)
                    Case "OR"
                        Return Logic(args, False)
                    Case "NOT"
                        Return LogicalNot(args)
                    Case "LEN"
                        Return Text1(args, Function(s As String) CDbl(s.Length), Nothing)
                    Case "UPPER"
                        Return Text1(args, Nothing, Function(s As String) s.ToUpperInvariant())
                    Case "LOWER"
                        Return Text1(args, Nothing, Function(s As String) s.ToLowerInvariant())
                    Case "TRIM"
                        Return Text1(args, Nothing, Function(s As String) s.Trim())
                    Case Else
                        Throw New FormulaError(NameError)
                End Select
            End Function

            ''' <summary>The values an argument list contributes, in order: a range gives every cell in it,
            ''' a plain argument gives itself.</summary>
            Private Iterator Function Values(args As List(Of FormulaArg)) As IEnumerable(Of FormulaValue)
                For i As Integer = 0 To args.Count - 1
                    Dim arg As FormulaArg = args(i)
                    If arg.IsRange Then
                        For row As Integer = arg.FirstRow To arg.LastRow
                            For column As Integer = arg.FirstColumn To arg.LastColumn
                                Yield _sheet.Reference(row, column)
                            Next
                        Next
                    Else
                        Yield arg.Value
                    End If
                Next
            End Function

            Private Function Aggregate(name As String, args As List(Of FormulaArg)) As FormulaValue
                Dim numbers As New List(Of Double)()
                Dim filled As Integer = 0
                For Each value As FormulaValue In Values(args)
                    If value.Kind = FormulaKind.Error Then
                        Throw New FormulaError(value.Text)
                    End If

                    If value.Kind = FormulaKind.Blank Then
                        Continue For                  ' a blank cell is not a zero for a sum, and not filled
                    End If

                    filled += 1                       ' COUNTA counts it — text and all
                    If value.Kind = FormulaKind.Text AndAlso Not IsNumericValue(value) Then
                        Continue For                  ' text is ignored by SUM/MIN/MAX, the way a label should be
                    End If

                    numbers.Add(Numeric(value))
                Next

                Select Case name
                    Case "COUNTA"
                        Return FormulaValue.OfNumber(CDbl(filled))
                    Case "COUNT"
                        Return FormulaValue.OfNumber(CDbl(numbers.Count))
                    Case "SUM"
                        Return FormulaValue.OfNumber(SumOf(numbers))
                    Case "MIN"
                        Return FormulaValue.OfNumber(If(numbers.Count = 0, 0.0, MinOf(numbers)))
                    Case "MAX"
                        Return FormulaValue.OfNumber(If(numbers.Count = 0, 0.0, MaxOf(numbers)))
                    Case "STDEV", "STDDEV"
                        Return FormulaValue.OfNumber(StdDevOf(numbers, True))
                    Case "STDEVP", "STDDEVP"
                        Return FormulaValue.OfNumber(StdDevOf(numbers, False))
                    Case Else
                        If numbers.Count = 0 Then
                            Throw New FormulaError(DivisionByZero)     ' an average of nothing
                        End If

                        Return FormulaValue.OfNumber(SumOf(numbers) / numbers.Count)
                End Select
            End Function

            Private Shared Function SumOf(numbers As List(Of Double)) As Double
                Dim total As Double = 0.0
                For i As Integer = 0 To numbers.Count - 1
                    total += numbers(i)
                Next

                Return total
            End Function

            Private Shared Function MinOf(numbers As List(Of Double)) As Double
                Dim value As Double = numbers(0)
                For i As Integer = 1 To numbers.Count - 1
                    If numbers(i) < value Then
                        value = numbers(i)
                    End If
                Next

                Return value
            End Function

            Private Shared Function MaxOf(numbers As List(Of Double)) As Double
                Dim value As Double = numbers(0)
                For i As Integer = 1 To numbers.Count - 1
                    If numbers(i) > value Then
                        value = numbers(i)
                    End If
                Next

                Return value
            End Function

            ''' <summary>
            ''' STDEV / STDDEV is the SAMPLE standard deviation (divide by n−1) and STDEVP / STDDEVP the
            ''' population one (divide by n) — the difference matters for the handful of readings a sheet
            ''' this size usually holds. One number has no sample spread at all, which is named rather
            ''' than answered as a confident zero.
            ''' (Named "StdDevOf": a bare StdDev would read as a property beside the sheet's own rows.)
            ''' </summary>
            Private Shared Function StdDevOf(numbers As List(Of Double), sample As Boolean) As Double
                If numbers.Count = 0 OrElse (sample AndAlso numbers.Count < 2) Then
                    Throw New FormulaError(DivisionByZero)
                End If

                Dim mean As Double = SumOf(numbers) / numbers.Count
                Dim total As Double = 0.0
                For i As Integer = 0 To numbers.Count - 1
                    Dim delta As Double = numbers(i) - mean
                    total += delta * delta
                Next

                Return Math.Sqrt(total / If(sample, numbers.Count - 1, numbers.Count))
            End Function

            Private Shared Function One(args As List(Of FormulaArg), work As Func(Of Double, Double)) As FormulaValue
                If args.Count <> 1 Then
                    Throw New FormulaError(ValueError)
                End If

                Return FormulaValue.OfNumber(work(Numeric(args(0).Value)))
            End Function

            Private Shared Function RoundArgs(args As List(Of FormulaArg)) As FormulaValue
                If args.Count <> 2 Then
                    Throw New FormulaError(ValueError)
                End If

                Dim digits As Integer = CInt(Math.Round(Numeric(args(1).Value)))
                If digits < 0 Then
                    digits = 0
                End If

                If digits > 15 Then
                    digits = 15
                End If

                Return FormulaValue.OfNumber(Math.Round(Numeric(args(0).Value), digits))
            End Function

            ''' <summary>MOD — named "Modulo", because "Mod" is a VB operator and neither twin may use it.</summary>
            Private Shared Function Modulo(args As List(Of FormulaArg)) As FormulaValue
                If args.Count <> 2 Then
                    Throw New FormulaError(ValueError)
                End If

                Dim divisor As Double = Numeric(args(1).Value)
                If Math.Abs(divisor) < Double.Epsilon Then
                    Throw New FormulaError(DivisionByZero)
                End If

                Return FormulaValue.OfNumber(Numeric(args(0).Value) Mod divisor)
            End Function

            Private Shared Function Logic(args As List(Of FormulaArg), all As Boolean) As FormulaValue
                If args.Count = 0 Then
                    Throw New FormulaError(ValueError)
                End If

                For i As Integer = 0 To args.Count - 1
                    Dim truth As Boolean = Truthy(args(i).Value)
                    If all AndAlso Not truth Then
                        Return FormulaValue.OfBool(False)
                    End If

                    If Not all AndAlso truth Then
                        Return FormulaValue.OfBool(True)
                    End If
                Next

                Return FormulaValue.OfBool(all)
            End Function

            ''' <summary>NOT — named "LogicalNot", because "Not" is a VB operator.</summary>
            Private Shared Function LogicalNot(args As List(Of FormulaArg)) As FormulaValue
                If args.Count <> 1 Then
                    Throw New FormulaError(ValueError)
                End If

                Return FormulaValue.OfBool(Not Truthy(args(0).Value))
            End Function

            ''' <summary>LEN / UPPER / LOWER / TRIM: one argument, read as text (a blank is empty text).
            ''' One of the two callbacks is Nothing, which is what says whether this is a number or a string.</summary>
            Private Shared Function Text1(args As List(Of FormulaArg), number As Func(Of String, Double),
                text As Func(Of String, String)) As FormulaValue
                If args.Count <> 1 Then
                    Throw New FormulaError(ValueError)
                End If

                Dim value As FormulaValue = args(0).Value
                If value.Kind = FormulaKind.Error Then
                    Throw New FormulaError(value.Text)
                End If

                Dim body As String = AsText(value)
                If text Is Nothing Then
                    Return FormulaValue.OfNumber(number(body))
                End If

                Return FormulaValue.OfText(text(body))
            End Function
        End Class

        ''' <summary>One argument of a function call: a range, or a single value. (The factories carry the
        ''' Of- prefix because a Structure member cannot be named Single.)</summary>
        Private Structure FormulaArg
            Public IsRange As Boolean
            Public Value As FormulaValue
            Public FirstRow As Integer
            Public FirstColumn As Integer
            Public LastRow As Integer
            Public LastColumn As Integer

            Public Shared Function OfSingle(value As FormulaValue) As FormulaArg
                Dim arg As FormulaArg
                arg.IsRange = False
                arg.Value = value
                Return arg
            End Function

            Public Shared Function OfRange(firstRow As Integer, firstColumn As Integer, lastRow As Integer,
                lastColumn As Integer) As FormulaArg
                Dim arg As FormulaArg
                arg.IsRange = True
                arg.Value = FormulaValue.BlankValue()
                arg.FirstRow = firstRow
                arg.FirstColumn = firstColumn
                arg.LastRow = lastRow
                arg.LastColumn = lastColumn
                Return arg
            End Function
        End Structure

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

    ''' <summary>
    ''' Where the sheet's file dialogs left off, for this session. Static, so the NEXT dialog opens where the
    ''' last one was — which is what every desktop app does — and scoped to the process, which is the right
    ''' lifetime for a hint nobody asked to keep. (The charts' own ChartPickerMemory writes a file so that it
    ''' survives a restart; a sheet that has only just grown a File menu does not need that yet.)
    ''' </summary>
    Friend NotInheritable Class SheetPickerMemory
        Private Sub New()
        End Sub

        ''' <summary>The folder Load… last read a workbook from.</summary>
        Friend Shared LastFolder As String

        ''' <summary>The folder Save…, the PNG or the PDF last wrote to.</summary>
        Friend Shared LastExportFolder As String
    End Class

End Namespace
