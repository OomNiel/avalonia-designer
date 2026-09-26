// BUNDLED-COPY: 0.12.10
// GrumpySheet.cs — BUNDLED RESOURCE (the VB twin is resources/GrumpySheet.vb). Copied into every
// generated project, next to ChromeWindow.cs / PathPicker.cs / GrumpyPanel.cs / GrumpyCharts.cs.
//
// A small, dependency-free SPREADSHEET CONTROL that draws itself: no NuGet package, no template and
// no assets. 26 columns (A…Z) and 50 rows (1…50) by default, both settable, with a lettered header
// row and a numbered header column that stay frozen while the cells scroll. It lives in the
// namespace `AvaloniaSpreadsheet`, so a form declares
//
//     xmlns:spread="using:AvaloniaSpreadsheet"
//
//   <spread:GrumpySheet x:Name="Sheet1" Width="620" Height="380">
//     <spread:SheetCell Row="1" Column="1" Text="Item"/>
//     <spread:SheetCell Row="1" Column="2" Text="Qty"/>
//     <spread:SheetCell Row="2" Column="1" Text="Widget"/>
//     <spread:SheetCell Row="2" Column="2" Text="3"/>
//   </spread:GrumpySheet>
//
// CELLS
// -----
//   A cell is a direct child element with Row and Column, BOTH 1-BASED, so Row="1" Column="1" is A1
//   and Row="7" Column="28" is AB7. Only NON-EMPTY cells are worth writing — an empty sheet is an
//   empty element. Row 0, a negative, or anything past Rows/Columns is ignored rather than throwing,
//   so a form cannot be broken by a number typed into it.
//
// WHAT IT DOES
// ------------
//   * Select: click a cell; drag to select a RANGE; click a letter or a number in the header to select
//     that whole column or row (Shift extends); the corner above the row numbers selects everything;
//     Ctrl+A does the same from the keyboard.
//   * Enter data: just type (the cell opens and replaces its contents), or double-click / F2 to edit
//     what is already there. Enter or Tab commits and moves on, Esc abandons the edit.
//   * Keyboard: arrows move, Shift+arrows extend the selection, PageUp/PageDown jump ten rows, Home
//     goes to column A, Ctrl+Home to A1, Enter moves down, Tab moves right, Delete clears the
//     selected cells.
//   * AUTOFILL: the small square at the bottom-right of the selection is the fill handle. Drag it down
//     or right and the pattern is PREDICTED — 1, 2 becomes 3, 4, 5 …; 2, 4 becomes 6, 8 …; a single
//     number counts up by one; "Item1, Item2" becomes "Item3"; anything else repeats the pattern it
//     was given, which is how a repeating list is copied.
//   * The formula bar shows the active cell's address (A1) and its contents, and edits them too: press
//     Ctrl+U or click the address box to move the caret there.
//   * The wheel scrolls; Shift+wheel scrolls sideways. The headers never leave the top and the left.
//
// FOR YOUR OWN CODE
// -----------------
//   SetCell(row, column, text) and GetCell(row, column) work in ROW and COLUMN, both 1-based.
//   ClearRange(firstRow, firstColumn, lastRow, lastColumn) and ClearSelection() empty a block, and
//   ActiveCellName is "B7". CellChanged fires for every committed change — typed, filled or set from
//   code — so a form can react to what the user did:
//
//     private void OnSheetChanged(object? sender, SheetCellChangedEventArgs e)
//     {
//         TotalText.Text = "B2 is now " + e.Text;
//     }
//
//   AllowEditing = False makes the sheet read-only while keeping the headers and the selection, which
//   is what a results-only form wants.
//
// NOTES
// -----
//   * It draws itself in Render() and hosts NO child controls at all — not even the editor, which is
//     drawn in the cell — so a 50 x 26 sheet is one control to the layout engine, not 1 300, and it
//     renders identically in a headless preview where nothing can be focused.
//   * Everything is proportional to ColumnWidth / RowHeight / FontSize, so the sheet survives any
//     resize, and the grid is clipped to its own rectangle while the headers stay put.
//   * FORMULAS ARE NOT EVALUATED YET. A cell holding "=SUM(B2:B6)" keeps and shows that text, and the
//     fx bar is the place to edit it; evaluation is the next phase and does not change this format.
using System;
using System.Collections.Generic;
using System.Globalization;
using Avalonia;
using Avalonia.Collections;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Media;
using Avalonia.Metadata;

namespace AvaloniaSpreadsheet
{
    /// <summary>How a cell's text is lined up in its column. Auto follows the content: numbers to the
    /// right, everything else to the left, which is what a spreadsheet does. (Called Auto rather than
    /// Default because `Default` is a VB keyword — an enum member by that name will not compile there.)</summary>
    public enum SheetAlign
    {
        Auto,
        Left,
        Center,
        Right
    }

    /// <summary>
    /// One cell of a <see cref="GrumpySheet"/>: where it is, what it holds, and how it is FORMATTED.
    /// Cells are written as direct children of the sheet, in the order they should be read — order does
    /// not matter for cells that do not overlap, because a later cell with the same address replaces an
    /// earlier one. Every formatting property has an "unset" value (false, 0, null, Default) that means
    /// "whatever the sheet is set to", so a cell that was never styled stays a short element.
    /// </summary>
    public sealed class SheetCell
    {
        /// <summary>The row, 1-based: Row = 1 is the first row. 0 or less is read as 1.</summary>
        public int Row { get; set; } = 1;

        /// <summary>The column, 1-based: Column = 1 is column A. 0 or less is read as 1.</summary>
        public int Column { get; set; } = 1;

        /// <summary>The cell's contents. Null or empty means the cell is blank, so it need not be
        /// written at all — unless it carries formatting, which a blank cell may (a highlighted box
        /// with nothing in it is a real thing to want).</summary>
        public string? Text { get; set; }

        /// <summary>Draw this cell's text in bold.</summary>
        public bool Bold { get; set; }

        /// <summary>Draw this cell's text in italics.</summary>
        public bool Italic { get; set; }

        /// <summary>The cell's font size. 0 (the default) means the sheet's own FontSize.</summary>
        public double FontSize { get; set; }

        /// <summary>The cell's font family name. Empty means the sheet's own FontFamilyName.</summary>
        public string? FontFamily { get; set; }

        /// <summary>The cell's text colour. Null means the sheet's own TextColor.</summary>
        public Color? TextColor { get; set; }

        /// <summary>The cell's own backcolour — its highlight. Null means the sheet's CellBackColor
        /// (the paper). It is drawn under the grid lines and under the selection wash, so a highlighted
        /// cell still reads as selected when it is.</summary>
        public Color? Fill { get; set; }

        /// <summary>How the text is lined up. Auto = by content (numbers right, text left).</summary>
        public SheetAlign TextAlign { get; set; } = SheetAlign.Auto;
    }

    /// <summary>What changed, and what it is now — raised once per committed cell change.</summary>
    public sealed class SheetCellChangedEventArgs : EventArgs
    {
        /// <summary>Creates the event data for one changed cell.</summary>
        public SheetCellChangedEventArgs(int row, int column, string? text)
        {
            Row = row;
            Column = column;
            Text = text ?? string.Empty;
        }

        /// <summary>The row that changed, 1-based.</summary>
        public int Row { get; }

        /// <summary>The column that changed, 1-based.</summary>
        public int Column { get; }

        /// <summary>The cell's contents after the change (empty for a cleared cell).</summary>
        public string Text { get; }

        /// <summary>The cell's address, e.g. "B7".</summary>
        public string Name => GrumpySheet.CellName(Row, Column);
    }

    /// <summary>
    /// A spreadsheet grid: selectable cells, in-place editing, autofill and a formula bar, drawn by
    /// the control itself. See the file header for the XAML and the whole feature list.
    /// </summary>
    public class GrumpySheet : Control
    {
        /// <summary>How many rows the sheet has (1…50 by default).</summary>
        public static readonly StyledProperty<int> RowsProperty =
            AvaloniaProperty.Register<GrumpySheet, int>(nameof(Rows), 50);

        /// <summary>How many columns the sheet has (1…26 → A…Z by default).</summary>
        public static readonly StyledProperty<int> ColumnsProperty =
            AvaloniaProperty.Register<GrumpySheet, int>(nameof(Columns), 26);

        /// <summary>The width of one column, in pixels.</summary>
        public static readonly StyledProperty<double> ColumnWidthProperty =
            AvaloniaProperty.Register<GrumpySheet, double>(nameof(ColumnWidth), 72d);

        /// <summary>The height of one row, in pixels.</summary>
        public static readonly StyledProperty<double> RowHeightProperty =
            AvaloniaProperty.Register<GrumpySheet, double>(nameof(RowHeight), 22d);

        /// <summary>The width of the column of row numbers, in pixels.</summary>
        public static readonly StyledProperty<double> HeaderWidthProperty =
            AvaloniaProperty.Register<GrumpySheet, double>(nameof(HeaderWidth), 44d);

        /// <summary>The height of the row of column letters, in pixels.</summary>
        public static readonly StyledProperty<double> HeaderHeightProperty =
            AvaloniaProperty.Register<GrumpySheet, double>(nameof(HeaderHeight), 24d);

        /// <summary>Draw the lettered header row and the numbered header column.</summary>
        public static readonly StyledProperty<bool> ShowHeadersProperty =
            AvaloniaProperty.Register<GrumpySheet, bool>(nameof(ShowHeaders), true);

        /// <summary>Draw the formula bar (the cell address and the fx box) above the grid.</summary>
        public static readonly StyledProperty<bool> ShowFormulaBarProperty =
            AvaloniaProperty.Register<GrumpySheet, bool>(nameof(ShowFormulaBar), true);

        /// <summary>False makes the sheet read-only: selection still works, editing does not.</summary>
        public static readonly StyledProperty<bool> AllowEditingProperty =
            AvaloniaProperty.Register<GrumpySheet, bool>(nameof(AllowEditing), true);

        /// <summary>The font family name for the cells. Empty = the platform's default.</summary>
        public static readonly StyledProperty<string?> FontFamilyNameProperty =
            AvaloniaProperty.Register<GrumpySheet, string?>(nameof(FontFamilyName), string.Empty);

        /// <summary>The font size of the cells and the headers, in points.</summary>
        public static readonly StyledProperty<double> FontSizeProperty =
            AvaloniaProperty.Register<GrumpySheet, double>(nameof(FontSize), 12d);

        /// <summary>The colour of the cell grid lines.</summary>
        public static readonly StyledProperty<Color> GridColorProperty =
            AvaloniaProperty.Register<GrumpySheet, Color>(nameof(GridColor), Color.Parse("#C9CED6"));

        /// <summary>The backcolour of the header row and column, and of the corner.</summary>
        public static readonly StyledProperty<Color> HeaderBackColorProperty =
            AvaloniaProperty.Register<GrumpySheet, Color>(nameof(HeaderBackColor), Color.Parse("#EFF1F4"));

        /// <summary>The colour of the letters and numbers in the headers.</summary>
        public static readonly StyledProperty<Color> HeaderTextColorProperty =
            AvaloniaProperty.Register<GrumpySheet, Color>(nameof(HeaderTextColor), Color.Parse("#39404A"));

        /// <summary>The backcolour of the cells (the paper the grid is drawn on).</summary>
        public static readonly StyledProperty<Color> CellBackColorProperty =
            AvaloniaProperty.Register<GrumpySheet, Color>(nameof(CellBackColor), Color.Parse("#FFFFFF"));

        /// <summary>The colour of the cell text.</summary>
        public static readonly StyledProperty<Color> TextColorProperty =
            AvaloniaProperty.Register<GrumpySheet, Color>(nameof(TextColor), Color.Parse("#1E2228"));

        /// <summary>The colour of the selection outline, the active cell and the fill handle.</summary>
        public static readonly StyledProperty<Color> SelectionColorProperty =
            AvaloniaProperty.Register<GrumpySheet, Color>(nameof(SelectionColor), Color.Parse("#2D7DD2"));

        /// <summary>The colour the selected cells are washed with (drawn UNDER the grid lines, so the
        /// lines stay visible through it).</summary>
        public static readonly StyledProperty<Color> SelectionFillColorProperty =
            AvaloniaProperty.Register<GrumpySheet, Color>(nameof(SelectionFillColor), Color.Parse("#DCE9FA"));

        /// <summary>The height of the formula bar strip, in pixels (fixed).</summary>
        private const double BarHeight = 24d;

        /// <summary>The size of the autofill square, in pixels.</summary>
        private const double HandleSize = 7d;

        private readonly List<SheetCell> _lookup = new List<SheetCell>();

        // What is selected. The ANCHOR is where the selection started (the cell Shift extends from) and
        // the ACTIVE cell is the one that scrolls into view and takes the typing.
        private int _anchorRow = 1;
        private int _anchorColumn = 1;
        private int _activeRow = 1;
        private int _activeColumn = 1;

        // Whole columns / whole rows / everything: the three selections that are not a plain block.
        private bool _wholeColumns;
        private bool _wholeRows;
        private bool _selectAll;

        private bool _draggingSelection;
        private bool _draggingFill;
        private int _fillRow;
        private int _fillColumn;
        private int _fillSourceFirstRow = 1;
        private int _fillSourceFirstColumn = 1;
        private int _fillSourceLastRow = 1;
        private int _fillSourceLastColumn = 1;

        // The editor: no TextBox is involved, so this is the whole of its state.
        private bool _editing;
        private bool _barFocused;
        private string _editText = string.Empty;
        private int _caret;
        private bool _editIsNew;

        private double _scrollX;
        private double _scrollY;

        static GrumpySheet()
        {
            AffectsRender<GrumpySheet>(RowsProperty, ColumnsProperty, ColumnWidthProperty, RowHeightProperty,
                HeaderWidthProperty, HeaderHeightProperty, ShowHeadersProperty, ShowFormulaBarProperty,
                FontFamilyNameProperty, FontSizeProperty, GridColorProperty, HeaderBackColorProperty,
                HeaderTextColorProperty, CellBackColorProperty, TextColorProperty, SelectionColorProperty,
                SelectionFillColorProperty);
            AffectsMeasure<GrumpySheet>(RowsProperty, ColumnsProperty, ColumnWidthProperty, RowHeightProperty,
                HeaderWidthProperty, HeaderHeightProperty, ShowHeadersProperty, ShowFormulaBarProperty);
        }

        /// <summary>Creates an empty sheet. Fill <see cref="Cells"/> in XAML, or call SetCell.</summary>
        public GrumpySheet()
        {
            Focusable = true;
            ClipToBounds = true;
            Cells.CollectionChanged += OnCellsChanged;
            LostFocus += OnSheetLostFocus;
        }

        /// <summary>The cells with something in them. This is the CONTENT property, so a cell is
        /// written as a direct child element — see the file header.</summary>
        [Content]
        public AvaloniaList<SheetCell> Cells { get; } = new AvaloniaList<SheetCell>();

        /// <summary>How many rows the sheet has. 1…50 by default.</summary>
        public int Rows
        {
            get { return GetValue(RowsProperty); }
            set { SetValue(RowsProperty, value); }
        }

        /// <summary>How many columns the sheet has. 1…26 (A…Z) by default.</summary>
        public int Columns
        {
            get { return GetValue(ColumnsProperty); }
            set { SetValue(ColumnsProperty, value); }
        }

        /// <summary>The width of one column, in pixels.</summary>
        public double ColumnWidth
        {
            get { return GetValue(ColumnWidthProperty); }
            set { SetValue(ColumnWidthProperty, value); }
        }

        /// <summary>The height of one row, in pixels.</summary>
        public double RowHeight
        {
            get { return GetValue(RowHeightProperty); }
            set { SetValue(RowHeightProperty, value); }
        }

        /// <summary>The width of the row-number column, in pixels.</summary>
        public double HeaderWidth
        {
            get { return GetValue(HeaderWidthProperty); }
            set { SetValue(HeaderWidthProperty, value); }
        }

        /// <summary>The height of the column-letter row, in pixels.</summary>
        public double HeaderHeight
        {
            get { return GetValue(HeaderHeightProperty); }
            set { SetValue(HeaderHeightProperty, value); }
        }

        /// <summary>Draw the headers at all.</summary>
        public bool ShowHeaders
        {
            get { return GetValue(ShowHeadersProperty); }
            set { SetValue(ShowHeadersProperty, value); }
        }

        /// <summary>Draw the formula bar at all.</summary>
        public bool ShowFormulaBar
        {
            get { return GetValue(ShowFormulaBarProperty); }
            set { SetValue(ShowFormulaBarProperty, value); }
        }

        /// <summary>False makes the sheet read-only.</summary>
        public bool AllowEditing
        {
            get { return GetValue(AllowEditingProperty); }
            set { SetValue(AllowEditingProperty, value); }
        }

        /// <summary>The font family name, or empty for the platform default.</summary>
        public string? FontFamilyName
        {
            get { return GetValue(FontFamilyNameProperty); }
            set { SetValue(FontFamilyNameProperty, value); }
        }

        /// <summary>The font size of the sheet, in points.</summary>
        public double FontSize
        {
            get { return GetValue(FontSizeProperty); }
            set { SetValue(FontSizeProperty, value); }
        }

        /// <summary>The colour of the grid lines.</summary>
        public Color GridColor
        {
            get { return GetValue(GridColorProperty); }
            set { SetValue(GridColorProperty, value); }
        }

        /// <summary>The backcolour of the headers.</summary>
        public Color HeaderBackColor
        {
            get { return GetValue(HeaderBackColorProperty); }
            set { SetValue(HeaderBackColorProperty, value); }
        }

        /// <summary>The colour of the header text.</summary>
        public Color HeaderTextColor
        {
            get { return GetValue(HeaderTextColorProperty); }
            set { SetValue(HeaderTextColorProperty, value); }
        }

        /// <summary>The backcolour of the cells.</summary>
        public Color CellBackColor
        {
            get { return GetValue(CellBackColorProperty); }
            set { SetValue(CellBackColorProperty, value); }
        }

        /// <summary>The colour of the cell text.</summary>
        public Color TextColor
        {
            get { return GetValue(TextColorProperty); }
            set { SetValue(TextColorProperty, value); }
        }

        /// <summary>The selection colour: the outline, the active cell and the fill handle.</summary>
        public Color SelectionColor
        {
            get { return GetValue(SelectionColorProperty); }
            set { SetValue(SelectionColorProperty, value); }
        }

        /// <summary>The wash drawn over the selected cells.</summary>
        public Color SelectionFillColor
        {
            get { return GetValue(SelectionFillColorProperty); }
            set { SetValue(SelectionFillColorProperty, value); }
        }

        /// <summary>Raised for every committed cell change: typed, autofilled, or set from code.</summary>
        public event EventHandler<SheetCellChangedEventArgs>? CellChanged;

        /// <summary>Raised when the selection moves, so a form can show where the user is.</summary>
        public event EventHandler? SelectionChanged;

        /// <summary>The active cell's address, e.g. "B7".</summary>
        public string ActiveCellName
        {
            get { return CellName(_activeRow, _activeColumn); }
        }

        /// <summary>The active cell's row, 1-based.</summary>
        public int ActiveRow
        {
            get { return _activeRow; }
        }

        /// <summary>The active cell's column, 1-based.</summary>
        public int ActiveColumn
        {
            get { return _activeColumn; }
        }

        /// <summary>How many rows the sheet really has, whatever was asked for.</summary>
        private int RowCount
        {
            get
            {
                var rows = Rows;
                return rows < 1 ? 1 : rows;
            }
        }

        /// <summary>How many columns the sheet really has, whatever was asked for.</summary>
        private int ColumnCount
        {
            get
            {
                var columns = Columns;
                return columns < 1 ? 1 : columns;
            }
        }

        /// <summary>"A" for column 1, "Z" for 26, "AA" for 27.</summary>
        public static string ColumnName(int column)
        {
            var letters = string.Empty;
            var value = column < 1 ? 1 : column;
            while (value > 0)
            {
                var remainder = (value - 1) % 26;
                letters = (char)('A' + remainder) + letters;
                value = (value - 1) / 26;
            }

            return letters;
        }

        /// <summary>"A1" for row 1, column 1; "AB7" for row 7, column 28.</summary>
        public static string CellName(int row, int column)
        {
            return ColumnName(column) + (row < 1 ? 1 : row).ToString(CultureInfo.InvariantCulture);
        }

        /// <summary>
        /// Reads an address like "A1" or "b7" back into row and column, both 1-based. False when the
        /// text is not an address at all, in which case row and column come back as 1.
        /// </summary>
        public static bool ParseCellName(string? name, out int row, out int column)
        {
            row = 1;
            column = 1;
            if (string.IsNullOrEmpty(name))
            {
                return false;
            }

            var text = name!.Trim().ToUpperInvariant();
            var index = 0;
            var letters = 0;
            var letterCount = 0;
            while (index < text.Length && text[index] >= 'A' && text[index] <= 'Z')
            {
                // Bounded on purpose. VB checks integer overflow and would THROW here, while C# wraps
                // silently — so an 8-letter "address" used to be a crash in one twin and a wrong answer
                // in the other. Three letters is column 18 278, which is past any sheet this draws.
                letterCount++;
                if (letterCount > 3)
                {
                    return false;
                }

                letters = letters * 26 + (text[index] - 'A' + 1);
                index++;
            }

            if (letters == 0 || index >= text.Length)
            {
                return false;
            }

            var digits = 0;
            var start = index;
            var digitCount = 0;
            while (index < text.Length && text[index] >= '0' && text[index] <= '9')
            {
                digitCount++;
                if (digitCount > 7)
                {
                    return false;                   // and a seven-digit row is past the end of one
                }

                digits = digits * 10 + (text[index] - '0');
                index++;
            }

            if (index == start || index != text.Length || digits < 1)
            {
                return false;
            }

            row = digits;
            column = letters;
            return true;
        }

        /// <summary>The contents of a cell — empty for a blank one, and for an address off the sheet.</summary>
        public string GetCell(int row, int column)
        {
            var cell = FindCell(row, column);
            return cell == null || cell.Text == null ? string.Empty : cell.Text!;
        }

        /// <summary>
        /// Puts text in a cell, adding it if it is new. An address off the sheet is ignored, an empty
        /// string blanks the cell, and setting the value it already has does nothing at all — so a
        /// fill over an already-correct block raises no events.
        /// </summary>
        public void SetCell(int row, int column, string? text)
        {
            if (row < 1 || column < 1 || row > RowCount || column > ColumnCount)
            {
                return;
            }

            var value = text == null ? string.Empty : text!;
            var cell = FindCell(row, column);
            var previous = cell == null || cell.Text == null ? string.Empty : cell.Text!;
            if (previous == value)
            {
                return;
            }

            if (cell == null)
            {
                cell = new SheetCell();
                cell.Row = row;
                cell.Column = column;
                cell.Text = value;
                Cells.Add(cell);
                _lookup.Add(cell);
            }
            else
            {
                cell.Text = value;
            }

            OnCellChanged(row, column, value);
            InvalidateVisual();
        }

        /// <summary>Blanks every cell in a block. The corners may be given in any order.</summary>
        public void ClearRange(int firstRow, int firstColumn, int lastRow, int lastColumn)
        {
            var row1 = Math.Min(firstRow, lastRow);
            var row2 = Math.Max(firstRow, lastRow);
            var column1 = Math.Min(firstColumn, lastColumn);
            var column2 = Math.Max(firstColumn, lastColumn);
            for (var row = row1; row <= row2; row++)
            {
                for (var column = column1; column <= column2; column++)
                {
                    SetCell(row, column, string.Empty);
                }
            }
        }

        /// <summary>Blanks whatever is selected (which may be whole columns, whole rows, or all of it).</summary>
        public void ClearSelection()
        {
            var first = SelectionFirstRow();
            var last = SelectionLastRow();
            var left = SelectionFirstColumn();
            var right = SelectionLastColumn();
            ClearRange(first, left, last, right);
        }

        /// <summary>Selects one cell and moves the active cell there.</summary>
        public void SelectCell(int row, int column)
        {
            _wholeColumns = false;
            _wholeRows = false;
            _selectAll = false;
            _anchorRow = ClampRow(row);
            _anchorColumn = ClampColumn(column);
            _activeRow = _anchorRow;
            _activeColumn = _anchorColumn;
            CommitEdit(false);
            ScrollToActive();
            RaiseSelectionChanged();
            InvalidateVisual();
        }

        /// <summary>Selects a block, leaving the active cell at its top-left corner.</summary>
        public void SelectRange(int firstRow, int firstColumn, int lastRow, int lastColumn)
        {
            _wholeColumns = false;
            _wholeRows = false;
            _selectAll = false;
            _anchorRow = ClampRow(firstRow);
            _anchorColumn = ClampColumn(firstColumn);
            _activeRow = ClampRow(lastRow);
            _activeColumn = ClampColumn(lastColumn);
            CommitEdit(false);
            ScrollToActive();
            RaiseSelectionChanged();
            InvalidateVisual();
        }

        /// <summary>Selects every cell on the sheet.</summary>
        public void SelectAll()
        {
            _selectAll = true;
            _wholeColumns = false;
            _wholeRows = false;
            _anchorRow = 1;
            _anchorColumn = 1;
            _activeRow = 1;
            _activeColumn = 1;
            CommitEdit(false);
            RaiseSelectionChanged();
            InvalidateVisual();
        }

        /// <summary>True when a cell is being edited right now (in the cell, or in the fx box).</summary>
        public bool IsEditing
        {
            get { return _editing; }
        }

        /// <summary>Opens the active cell for editing, keeping what is in it.</summary>
        public void BeginEdit()
        {
            BeginEdit(GetCell(_activeRow, _activeColumn), false, false);
        }

        /// <summary>Opens the active cell for editing in the formula bar instead of in the cell.</summary>
        public void BeginEditInBar()
        {
            var selected = SelectedText();
            BeginEdit(selected, false, true);
        }

        /// <summary>Commits an edit in progress (what Enter does). Nothing happens if none is open.</summary>
        public void CommitEditNow()
        {
            CommitEdit(true);
        }

        /// <summary>Abandons an edit in progress (what Esc does).</summary>
        public void CancelEditNow()
        {
            CommitEdit(false);
        }

        /// <summary>Replaces the contents of every selected cell, all of them getting the same text.</summary>
        public void FillSelection(string? text)
        {
            var first = SelectionFirstRow();
            var last = SelectionLastRow();
            var left = SelectionFirstColumn();
            var right = SelectionLastColumn();
            for (var row = first; row <= last; row++)
            {
                for (var column = left; column <= right; column++)
                {
                    SetCell(row, column, text);
                }
            }
        }

        /// <summary>The cell holding an address, or null. For reading or changing its FORMATTING — a
        /// blank cell may carry formatting, and <see cref="EnsureCell"/> creates it if it is missing.</summary>
        public SheetCell? CellAt(int row, int column)
        {
            return FindCell(row, column);
        }

        /// <summary>
        /// The cell at an address, added if it was not there — how an EMPTY cell is given a highlight
        /// or an alignment. Null when the address is off the sheet (the same rule as SetCell).
        /// </summary>
        public SheetCell? EnsureCell(int row, int column)
        {
            if (row < 1 || column < 1 || row > RowCount || column > ColumnCount)
            {
                return null;
            }

            var cell = FindCell(row, column);
            if (cell != null)
            {
                return cell;
            }

            cell = new SheetCell();
            cell.Row = row;
            cell.Column = column;
            cell.Text = string.Empty;
            Cells.Add(cell);
            _lookup.Add(cell);
            return cell;
        }

        /// <summary>
        /// Repaints after the cell OBJECTS were changed in code. They are plain objects, so nothing
        /// tells the sheet that one moved — touch a cell with CellAt/EnsureCell, set what you want,
        /// then call this (the Set* methods below do it for you).
        /// </summary>
        public void Refresh()
        {
            InvalidateVisual();
        }

        /// <summary>Turns bold on or off for one cell.</summary>
        public void SetBold(int row, int column, bool bold)
        {
            var cell = EnsureCell(row, column);
            if (cell == null || cell.Bold == bold)
            {
                return;
            }

            cell.Bold = bold;
            InvalidateVisual();
        }

        /// <summary>Turns italics on or off for one cell.</summary>
        public void SetItalic(int row, int column, bool italic)
        {
            var cell = EnsureCell(row, column);
            if (cell == null || cell.Italic == italic)
            {
                return;
            }

            cell.Italic = italic;
            InvalidateVisual();
        }

        /// <summary>Sets one cell's font size. 0 puts it back on the sheet's own.</summary>
        public void SetFontSize(int row, int column, double size)
        {
            var cell = EnsureCell(row, column);
            if (cell == null || Math.Abs(cell.FontSize - size) < 0.001)
            {
                return;
            }

            cell.FontSize = size;
            InvalidateVisual();
        }

        /// <summary>Sets one cell's font family. Empty puts it back on the sheet's own.</summary>
        public void SetFontFamily(int row, int column, string? family)
        {
            var cell = EnsureCell(row, column);
            var value = family == null ? string.Empty : family!;
            if (cell == null || (cell.FontFamily ?? string.Empty) == value)
            {
                return;
            }

            cell.FontFamily = value;
            InvalidateVisual();
        }

        /// <summary>Sets one cell's text colour. Null puts it back on the sheet's own.</summary>
        public void SetTextColor(int row, int column, Color? color)
        {
            var cell = EnsureCell(row, column);
            if (cell == null || cell.TextColor == color)
            {
                return;
            }

            cell.TextColor = color;
            InvalidateVisual();
        }

        /// <summary>Sets one cell's highlight. Null puts it back on the sheet's paper colour.</summary>
        public void SetFill(int row, int column, Color? color)
        {
            var cell = EnsureCell(row, column);
            if (cell == null || cell.Fill == color)
            {
                return;
            }

            cell.Fill = color;
            InvalidateVisual();
        }

        /// <summary>Sets one cell's text alignment.</summary>
        public void SetTextAlign(int row, int column, SheetAlign align)
        {
            var cell = EnsureCell(row, column);
            if (cell == null || cell.TextAlign == align)
            {
                return;
            }

            cell.TextAlign = align;
            InvalidateVisual();
        }

        /// <summary>Drops every formatting decision from one cell, leaving what it holds.</summary>
        public void ClearFormatting(int row, int column)
        {
            var cell = FindCell(row, column);
            if (cell == null)
            {
                return;
            }

            cell.Bold = false;
            cell.Italic = false;
            cell.FontSize = 0;
            cell.FontFamily = null;
            cell.TextColor = null;
            cell.Fill = null;
            cell.TextAlign = SheetAlign.Auto;
            InvalidateVisual();
        }

        /// <summary>Drops every formatting decision from the selected cells.</summary>
        public void ClearSelectionFormatting()
        {
            var first = SelectionFirstRow();
            var last = SelectionLastRow();
            var left = SelectionFirstColumn();
            var right = SelectionLastColumn();
            for (var row = first; row <= last; row++)
            {
                for (var column = left; column <= right; column++)
                {
                    ClearFormatting(row, column);
                }
            }
        }

        /// <summary>Bold for the whole selection — bold when any selected cell is not, plain when they
        /// all already are, which is what Ctrl+B does in every spreadsheet.</summary>
        public void ToggleBoldSelection()
        {
            var turnOn = false;
            var first = SelectionFirstRow();
            var last = SelectionLastRow();
            var left = SelectionFirstColumn();
            var right = SelectionLastColumn();
            for (var row = first; row <= last && !turnOn; row++)
            {
                for (var column = left; column <= right; column++)
                {
                    var cell = FindCell(row, column);
                    if (cell == null || !cell.Bold)
                    {
                        turnOn = true;
                        break;
                    }
                }
            }

            for (var row = first; row <= last; row++)
            {
                for (var column = left; column <= right; column++)
                {
                    SetBold(row, column, turnOn);
                }
            }
        }

        /// <summary>Italics for the whole selection, by the same rule as <see cref="ToggleBoldSelection"/>.</summary>
        public void ToggleItalicSelection()
        {
            var turnOn = false;
            var first = SelectionFirstRow();
            var last = SelectionLastRow();
            var left = SelectionFirstColumn();
            var right = SelectionLastColumn();
            for (var row = first; row <= last && !turnOn; row++)
            {
                for (var column = left; column <= right; column++)
                {
                    var cell = FindCell(row, column);
                    if (cell == null || !cell.Italic)
                    {
                        turnOn = true;
                        break;
                    }
                }
            }

            for (var row = first; row <= last; row++)
            {
                for (var column = left; column <= right; column++)
                {
                    SetItalic(row, column, turnOn);
                }
            }
        }

        /// <summary>Finds the cell holding an address, or null. Uses the index, so it is not a scan.</summary>
        private SheetCell? FindCell(int row, int column)
        {
            if (_lookup.Count != Cells.Count)
            {
                RebuildLookup();
            }

            for (var i = 0; i < _lookup.Count; i++)
            {
                if (_lookup[i].Row == row && _lookup[i].Column == column)
                {
                    return _lookup[i];
                }
            }

            return null;
        }

        /// <summary>Re-indexes the cells after the list itself changed (XAML load, or a form's own edit).</summary>
        private void RebuildLookup()
        {
            _lookup.Clear();
            for (var i = 0; i < Cells.Count; i++)
            {
                _lookup.Add(Cells[i]);
            }
        }

        private void OnCellsChanged(object? sender, System.Collections.Specialized.NotifyCollectionChangedEventArgs e)
        {
            RebuildLookup();
            InvalidateVisual();
        }

        private void OnCellChanged(int row, int column, string text)
        {
            var handler = CellChanged;
            if (handler != null)
            {
                handler(this, new SheetCellChangedEventArgs(row, column, text));
            }
        }

        private void RaiseSelectionChanged()
        {
            var handler = SelectionChanged;
            if (handler != null)
            {
                handler(this, EventArgs.Empty);
            }
        }

        private int ClampRow(int row)
        {
            if (row < 1)
            {
                return 1;
            }

            return row > RowCount ? RowCount : row;
        }

        private int ClampColumn(int column)
        {
            if (column < 1)
            {
                return 1;
            }

            return column > ColumnCount ? ColumnCount : column;
        }

        // ---- what is selected -------------------------------------------------------------------

        private int SelectionFirstRow()
        {
            if (_wholeRows || _selectAll)
            {
                return 1;
            }

            return Math.Min(_anchorRow, _activeRow);
        }

        private int SelectionLastRow()
        {
            return _wholeColumns || _selectAll ? RowCount : Math.Max(_anchorRow, _activeRow);
        }

        private int SelectionFirstColumn()
        {
            if (_wholeColumns || _selectAll)
            {
                return 1;
            }

            return Math.Min(_anchorColumn, _activeColumn);
        }

        private int SelectionLastColumn()
        {
            return _wholeRows || _selectAll ? ColumnCount : Math.Max(_anchorColumn, _activeColumn);
        }

        /// <summary>The active cell's contents when the whole selection holds one value, else empty —
        /// what the fx box shows for a block ("Multiple" would be Excel's word, but empty is calmer).</summary>
        private string SelectedText()
        {
            var text = GetCell(_activeRow, _activeColumn);
            if (SelectionFirstRow() == SelectionLastRow() && SelectionFirstColumn() == SelectionLastColumn())
            {
                return text;
            }

            var first = GetCell(SelectionFirstRow(), SelectionFirstColumn());
            return first == text ? text : string.Empty;
        }

        // ---- geometry ---------------------------------------------------------------------------

        /// <summary>Where the grid's cells start, allowing for the bar and the headers.</summary>
        private Point GridOrigin
        {
            get
            {
                var x = ShowHeaders ? HeaderWidth : 0d;
                var y = (ShowFormulaBar ? BarHeight : 0d) + (ShowHeaders ? HeaderHeight : 0d);
                return new Point(x, y);
            }
        }

        private Rect CellRect(int row, int column)
        {
            var origin = GridOrigin;
            return new Rect(origin.X + (column - 1) * ColumnWidth - _scrollX,
                            origin.Y + (row - 1) * RowHeight - _scrollY,
                            ColumnWidth, RowHeight);
        }

        private Rect SelectionRect()
        {
            var first = CellRect(SelectionFirstRow(), SelectionFirstColumn());
            var last = CellRect(SelectionLastRow(), SelectionLastColumn());
            return new Rect(first.X, first.Y, last.Right - first.X, last.Bottom - first.Y);
        }

        private Rect GridRect(Size size)
        {
            var origin = GridOrigin;
            var width = size.Width - origin.X;
            var height = size.Height - origin.Y;
            return new Rect(origin.X, origin.Y, width < 0 ? 0 : width, height < 0 ? 0 : height);
        }

        private Rect BarRect(Size size)
        {
            return new Rect(0, 0, size.Width, BarHeight);
        }

        private Rect BarNameRect(Size size)
        {
            var width = ShowHeaders ? HeaderWidth : 0d;
            return new Rect(0, 0, width, BarHeight);
        }

        private Rect BarInputRect(Size size)
        {
            var name = BarNameRect(size);
            var x = name.Right;
            return new Rect(x, 0, size.Width - x, BarHeight);
        }

        /// <summary>The autofill square, at the bottom-right of the selection.</summary>
        private Rect HandleRect()
        {
            var selection = SelectionRect();
            return new Rect(selection.Right - HandleSize / 2, selection.Bottom - HandleSize / 2,
                HandleSize, HandleSize);
        }

        private void ClampScroll(Size size)
        {
            var grid = GridRect(size);
            if (grid.Width <= 0 || grid.Height <= 0)
            {
                // Not laid out yet (a XAML load, or a control in a collapsed parent). Nothing can be
                // scrolled into view, and the arithmetic below would be nonsense — grid.Right is
                // NEGATIVE here, which used to scroll the sheet sideways permanently.
                _scrollX = 0;
                _scrollY = 0;
                return;
            }

            var contentWidth = ColumnCount * ColumnWidth;
            var contentHeight = RowCount * RowHeight;
            var maxX = contentWidth - grid.Width;
            var maxY = contentHeight - grid.Height;
            _scrollX = maxX <= 0 ? 0 : Math.Min(_scrollX, maxX);
            _scrollY = maxY <= 0 ? 0 : Math.Min(_scrollY, maxY);
            if (_scrollX < 0)
            {
                _scrollX = 0;
            }

            if (_scrollY < 0)
            {
                _scrollY = 0;
            }
        }

        /// <summary>Brings the active cell into view after a move, a jump or a selection from code.</summary>
        private void ScrollToActive()
        {
            var size = Bounds.Size;
            var grid = GridRect(size);
            if (grid.Width <= 0 || grid.Height <= 0)
            {
                return;                     // nothing to scroll into view before the first layout
            }

            var cell = CellRect(_activeRow, _activeColumn);
            if (cell.X < grid.X)
            {
                _scrollX -= grid.X - cell.X;
            }
            else if (cell.Right > grid.Right)
            {
                _scrollX += cell.Right - grid.Right;
            }

            if (cell.Y < grid.Y)
            {
                _scrollY -= grid.Y - cell.Y;
            }
            else if (cell.Bottom > grid.Bottom)
            {
                _scrollY += cell.Bottom - grid.Bottom;
            }

            ClampScroll(size);
        }

        // ---- layout -----------------------------------------------------------------------------

        /// <summary>The sheet's natural size: the headers plus the whole grid.</summary>
        protected override Size MeasureOverride(Size availableSize)
        {
            var origin = GridOrigin;
            var width = origin.X + ColumnCount * ColumnWidth;
            var height = origin.Y + RowCount * RowHeight;
            if (!double.IsInfinity(availableSize.Width) && width > availableSize.Width)
            {
                width = availableSize.Width;
            }

            if (!double.IsInfinity(availableSize.Height) && height > availableSize.Height)
            {
                height = availableSize.Height;
            }

            return new Size(width, height);
        }

        /// <summary>Nothing to arrange: the control draws everything and owns no children.</summary>
        protected override Size ArrangeOverride(Size finalSize)
        {
            ClampScroll(finalSize);
            return finalSize;
        }

        // ---- drawing ----------------------------------------------------------------------------

        /// <summary>Paints the bar, the headers, the cells, the selection and the fill handle.</summary>
        public override void Render(DrawingContext context)
        {
            var size = Bounds.Size;
            if (size.Width <= 1 || size.Height <= 1)
            {
                return;
            }

            var gridBrush = new SolidColorBrush(GridColor);
            var headerBrush = new SolidColorBrush(HeaderBackColor);
            var headerTextBrush = new SolidColorBrush(HeaderTextColor);
            var cellBrush = new SolidColorBrush(CellBackColor);
            var textBrush = new SolidColorBrush(TextColor);
            var selectionBrush = new SolidColorBrush(SelectionColor);
            var selectionFill = new SolidColorBrush(SelectionFillColor);
            var grid = GridRect(size);

            context.FillRectangle(cellBrush, new Rect(size));

            var firstRow = VisibleFirstRow(grid);
            var lastRow = VisibleLastRow(grid);
            var firstColumn = VisibleFirstColumn(grid);
            var lastColumn = VisibleLastColumn(grid);

            // CELL FILLS go down first — under the wash and under the grid lines, so a highlighted cell
            // keeps its lines and still reads as selected when the selection is over it.
            using (context.PushClip(grid))
            {
                for (var row = firstRow; row <= lastRow; row++)
                {
                    for (var column = firstColumn; column <= lastColumn; column++)
                    {
                        var fill = FillOf(row, column);
                        if (!fill.HasValue)
                        {
                            continue;
                        }

                        context.FillRectangle(new SolidColorBrush(fill.Value), CellRect(row, column));
                    }
                }
            }

            // The wash goes down before the grid lines, so the lines still read through a selection.
            var selection = SelectionRect();
            var visibleSelection = selection.Intersect(grid);
            if (visibleSelection.Width > 0 && visibleSelection.Height > 0)
            {
                context.FillRectangle(selectionFill, visibleSelection);
            }

            // Cells: the grid lines, then the text.
            using (context.PushClip(grid))
            {
                var gridPen = new Pen(gridBrush, 1d);
                for (var row = firstRow; row <= lastRow + 1; row++)
                {
                    var y = CellRect(row, 1).Y;
                    if (y >= grid.Y - 0.5 && y <= grid.Bottom + 0.5)
                    {
                        context.DrawLine(gridPen, new Point(grid.X, y), new Point(grid.Right, y));
                    }
                }

                for (var column = firstColumn; column <= lastColumn + 1; column++)
                {
                    var x = CellRect(1, column).X;
                    if (x >= grid.X - 0.5 && x <= grid.Right + 0.5)
                    {
                        context.DrawLine(gridPen, new Point(x, grid.Y), new Point(x, grid.Bottom));
                    }
                }

                for (var row = firstRow; row <= lastRow; row++)
                {
                    for (var column = firstColumn; column <= lastColumn; column++)
                    {
                        var text = GetCell(row, column);
                        if (text.Length == 0)
                        {
                            continue;
                        }

                        var isEditingThis = _editing && !_barFocused && row == _activeRow && column == _activeColumn;
                        if (isEditingThis)
                        {
                            continue;                       // the editor draws it, with its caret
                        }

                        // This cell's own formatting, all of it "unset means the sheet's own".
                        var cell = FindCell(row, column);
                        var align = AlignOf(cell);
                        var numeric = LooksNumeric(text) && align == SheetAlign.Auto;
                        DrawCellText(context, text, CellRect(row, column), TextBrushOf(cell, textBrush),
                            numeric, ToTextAlignment(align), -1, TypefaceFor(cell), SizeOf(cell));
                    }
                }
            }

            DrawHeaders(context, size, headerBrush, headerTextBrush, grid, selection);
            DrawSelectionOutline(context, selectionBrush, grid);
            DrawFormulaBar(context, size, headerBrush, headerTextBrush, textBrush, selectionBrush);
            if (!AllowEditing)
            {
                return;
            }

            // The fill handle, unless the selection is the whole sheet (nothing to fill into).
            if (!_selectAll && !_draggingFill)
            {
                var handle = HandleRect();
                if (grid.Contains(handle.Center))
                {
                    context.FillRectangle(selectionBrush, handle);
                }
            }
        }

        /// <summary>Draws the frozen headers, with the selected rows/columns lit up.</summary>
        private void DrawHeaders(DrawingContext context, Size size, IBrush back, IBrush text,
            Rect grid, Rect selection)
        {
            if (!ShowHeaders)
            {
                return;
            }

            var columnHeader = new Rect(GridOrigin.X, GridOrigin.Y - HeaderHeight, size.Width, HeaderHeight);
            var rowHeader = new Rect(0, GridOrigin.Y, HeaderWidth, size.Height);
            var corner = new Rect(0, GridOrigin.Y - HeaderHeight, HeaderWidth, HeaderHeight);

            using (context.PushClip(columnHeader))
            {
                context.FillRectangle(back, columnHeader);
                var highlighted = ColumnHighlight(selection);
                context.FillRectangle(new SolidColorBrush(SelectionFillColor), highlighted);
                for (var column = VisibleFirstColumn(grid); column <= VisibleLastColumn(grid); column++)
                {
                    var rect = new Rect(CellRect(1, column).X, columnHeader.Y, ColumnWidth, HeaderHeight);
                    DrawCellText(context, ColumnName(column), rect, text, false, TextAlignment.Center);
                }
            }

            context.DrawLine(new Pen(new SolidColorBrush(GridColor), 1d),
                new Point(0, corner.Bottom), new Point(size.Width, corner.Bottom));

            using (context.PushClip(rowHeader))
            {
                context.FillRectangle(back, rowHeader);
                var highlighted = RowHighlight(selection);
                context.FillRectangle(new SolidColorBrush(SelectionFillColor), highlighted);
                for (var row = VisibleFirstRow(grid); row <= VisibleLastRow(grid); row++)
                {
                    var rect = new Rect(0, CellRect(row, 1).Y, HeaderWidth, RowHeight);
                    DrawCellText(context, row.ToString(CultureInfo.InvariantCulture), rect, text, false,
                        TextAlignment.Center);
                }
            }

            context.FillRectangle(back, corner);
            context.DrawLine(new Pen(new SolidColorBrush(GridColor), 1d),
                new Point(HeaderWidth, corner.Y), new Point(HeaderWidth, corner.Bottom));
            context.DrawLine(new Pen(new SolidColorBrush(GridColor), 1d),
                new Point(corner.X, corner.Bottom), new Point(corner.Right, corner.Bottom));
        }

        /// <summary>The bit of the column header that belongs to the selected columns.</summary>
        private Rect ColumnHighlight(Rect selection)
        {
            if (!_wholeColumns && !_selectAll)
            {
                return new Rect(0, 0, 0, 0);
            }

            var first = CellRect(1, SelectionFirstColumn());
            var last = CellRect(1, SelectionLastColumn());
            return new Rect(first.X, GridOrigin.Y - HeaderHeight, last.Right - first.X, HeaderHeight);
        }

        /// <summary>The bit of the row header that belongs to the selected rows.</summary>
        private Rect RowHighlight(Rect selection)
        {
            if (!_wholeRows && !_selectAll)
            {
                return new Rect(0, 0, 0, 0);
            }

            var first = CellRect(SelectionFirstRow(), 1);
            var last = CellRect(SelectionLastRow(), 1);
            return new Rect(0, first.Y, HeaderWidth, last.Bottom - first.Y);
        }

        /// <summary>Draws the selection box, the active cell and the fill preview.</summary>
        private void DrawSelectionOutline(DrawingContext context, IBrush brush, Rect grid)
        {
            var pen = new Pen(brush, 2d);
            var selection = SelectionRect();
            using (context.PushClip(grid))
            {
                var top = Math.Max(selection.Y, grid.Y);
                var bottom = Math.Min(selection.Bottom, grid.Bottom);
                var left = Math.Max(selection.X, grid.X);
                var right = Math.Min(selection.Right, grid.Right);
                if (_wholeColumns || _selectAll)
                {
                    top = grid.Y;
                }

                if (_wholeRows || _selectAll)
                {
                    left = grid.X;
                }

                context.DrawRectangle(null, pen, new Rect(left, top, right - left, bottom - top));
                if (_draggingFill && HasFillTarget())
                {
                    var preview = PreviewRect();
                    context.DrawRectangle(null, new Pen(brush, 1d, new DashStyle(new double[] { 4, 3 }, 0)), preview);
                }
            }
        }

        /// <summary>Draws the formula bar: the address box and the fx input.</summary>
        private void DrawFormulaBar(DrawingContext context, Size size, IBrush back, IBrush headerText,
            IBrush text, IBrush accent)
        {
            if (!ShowFormulaBar)
            {
                return;
            }

            var bar = BarRect(size);
            context.FillRectangle(back, bar);
            context.DrawLine(new Pen(new SolidColorBrush(GridColor), 1d),
                new Point(0, bar.Bottom - 0.5), new Point(size.Width, bar.Bottom - 0.5));

            var name = BarNameRect(size);
            DrawCellText(context, ActiveCellName, name, headerText, false, TextAlignment.Center);

            var input = BarInputRect(size);
            context.DrawLine(new Pen(new SolidColorBrush(GridColor), 1d),
                new Point(input.X, bar.Y + 2), new Point(input.X, bar.Bottom - 2));
            DrawCellText(context, "fx", new Rect(input.X, bar.Y, 22, bar.Height), headerText, false,
                TextAlignment.Center);

            var box = new Rect(input.X + 22, bar.Y, Math.Max(0, input.Width - 22), bar.Height);
            var shown = _editing && _barFocused ? _editText : SelectedText();
            if (_editing && _barFocused)
            {
                DrawCellText(context, shown, box, text, false, TextAlignment.Left, _caret);
            }
            else
            {
                DrawCellText(context, shown, box, text, false, TextAlignment.Left);

                // A light border on the address box is the cue that it can be clicked to type there.
                context.DrawRectangle(null, new Pen(accent, 1d), new Rect(0.5, 0.5, name.Width, name.Height - 1));
            }
        }

        /// <summary>
        /// Draws one line of text, vertically centred, clipped to its rectangle. <paramref name="caret"/>
        /// is the index to draw the edit caret at, or -1 for no caret. Centred text is used by the
        /// headers, left by the cells and numbers, and numbers are right-aligned like every other
        /// spreadsheet.
        /// </summary>
        private void DrawCellText(DrawingContext context, string text, Rect rect, IBrush brush,
            bool rightAligned, TextAlignment? align, int caret = -1, Typeface? typeface = null, double size = 0)
        {
            if (text.Length == 0 && caret < 0)
            {
                return;
            }

            var font = typeface ?? TypefaceFor();
            var emSize = size > 0 ? size : FontSize;
            var formatted = new FormattedText(text, CultureInfo.CurrentCulture, FlowDirection.LeftToRight,
                font, emSize, brush);
            var inner = new Rect(rect.X + 3, rect.Y, rect.Width - 6, rect.Height);
            if (inner.Width <= 0)
            {
                return;
            }

            using (context.PushClip(inner))
            {
                var y = rect.Y + (rect.Height - formatted.Height) / 2;
                var x = inner.X;
                if (align == TextAlignment.Center)
                {
                    x = inner.X + (inner.Width - formatted.Width) / 2;
                }
                else if (rightAligned && (align == null || align == TextAlignment.Right))
                {
                    x = inner.Right - formatted.Width;
                }

                // Keep the caret in view while the text is longer than the box it is edited in.
                if (caret >= 0)
                {
                    var upToCaret = new FormattedText(text.Substring(0, caret), CultureInfo.CurrentCulture,
                        FlowDirection.LeftToRight, font, emSize, brush);
                    if (x + upToCaret.Width > inner.Right)
                    {
                        x -= x + upToCaret.Width - inner.Right;
                    }

                    context.DrawText(formatted, new Point(x, y));
                    var caretX = x + upToCaret.Width;
                    context.DrawLine(new Pen(brush, 1d), new Point(caretX, rect.Y + 2),
                        new Point(caretX, rect.Bottom - 2));
                    return;
                }

                context.DrawText(formatted, new Point(x, y));
            }
        }

        private Typeface TypefaceFor(SheetCell? cell = null)
        {
            var name = cell != null && !string.IsNullOrEmpty(cell.FontFamily) ? cell.FontFamily : FontFamilyName;
            var family = string.IsNullOrEmpty(name) ? FontFamily.Default : new FontFamily(name!);
            var weight = cell != null && cell.Bold ? FontWeight.Bold : FontWeight.Normal;
            var style = cell != null && cell.Italic ? FontStyle.Italic : FontStyle.Normal;
            return new Typeface(family, style, weight);
        }

        /// <summary>The font size a cell is drawn at: its own, else the sheet's.</summary>
        private double SizeOf(SheetCell? cell)
        {
            return cell != null && cell.FontSize > 0 ? cell.FontSize : FontSize;
        }

        /// <summary>The brush a cell's text is drawn in: its own colour, else the sheet's.</summary>
        private static IBrush TextBrushOf(SheetCell? cell, IBrush fallback)
        {
            if (cell == null || !cell.TextColor.HasValue)
            {
                return fallback;
            }

            return new SolidColorBrush(cell.TextColor.Value);
        }

        /// <summary>A cell's highlight, or null when it has none.</summary>
        private Color? FillOf(int row, int column)
        {
            var cell = FindCell(row, column);
            return cell == null ? null : cell.Fill;
        }

        private static SheetAlign AlignOf(SheetCell? cell)
        {
            return cell == null ? SheetAlign.Auto : cell.TextAlign;
        }

        /// <summary>The sheet's alignment for a cell, or null to leave it to the caller's rule
        /// (numbers right, everything else left).</summary>
        private static TextAlignment? ToTextAlignment(SheetAlign align)
        {
            if (align == SheetAlign.Left)
            {
                return TextAlignment.Left;
            }

            if (align == SheetAlign.Center)
            {
                return TextAlignment.Center;
            }

            if (align == SheetAlign.Right)
            {
                return TextAlignment.Right;
            }

            return null;
        }

        /// <summary>True when the text reads as a number, so it is right-aligned.</summary>
        private static bool LooksNumeric(string text)
        {
            double value;
            return TryNumber(text, out value);
        }

        private static bool TryNumber(string? text, out double value)
        {
            value = 0d;
            if (string.IsNullOrEmpty(text))
            {
                return false;
            }

            return double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out value);
        }

        // ---- which rows and columns are on screen ----------------------------------------------

        private int VisibleFirstRow(Rect grid)
        {
            var row = (int)Math.Floor((grid.Y - GridOrigin.Y + _scrollY) / RowHeight) + 1;
            return row < 1 ? 1 : row;
        }

        private int VisibleLastRow(Rect grid)
        {
            var row = (int)Math.Ceiling((grid.Bottom - GridOrigin.Y + _scrollY) / RowHeight);
            return row > RowCount ? RowCount : row;
        }

        private int VisibleFirstColumn(Rect grid)
        {
            var column = (int)Math.Floor((grid.X - GridOrigin.X + _scrollX) / ColumnWidth) + 1;
            return column < 1 ? 1 : column;
        }

        private int VisibleLastColumn(Rect grid)
        {
            var column = (int)Math.Ceiling((grid.Right - GridOrigin.X + _scrollX) / ColumnWidth);
            return column > ColumnCount ? ColumnCount : column;
        }

        // ---- the mouse --------------------------------------------------------------------------

        private const int HitNothing = 0;
        private const int HitCell = 1;
        private const int HitColumnHeader = 2;
        private const int HitRowHeader = 3;
        private const int HitCorner = 4;
        private const int HitHandle = 5;
        private const int HitBar = 6;

        /// <summary>What is under a point, and which cell it belongs to.</summary>
        private int HitTest(Point point, out int row, out int column)
        {
            row = 1;
            column = 1;
            var size = Bounds.Size;
            var grid = GridRect(size);
            var bar = ShowFormulaBar ? BarHeight : 0d;
            if (ShowFormulaBar && point.Y < bar)
            {
                // The fx box is a real input — clicking it edits the active cell up there. The address
                // box is not (it only shows where you are), so a click on it does nothing.
                return point.X >= BarNameRect(size).Right ? HitBar : HitNothing;
            }

            if (ShowHeaders)
            {
                var headerTop = bar;
                var headerBottom = bar + HeaderHeight;
                if (point.Y >= headerTop && point.Y < headerBottom)
                {
                    if (point.X < HeaderWidth)
                    {
                        return HitCorner;
                    }

                    column = ColumnAt(point.X, grid);
                    return HitColumnHeader;
                }

                if (point.X < HeaderWidth)
                {
                    row = RowAt(point.Y, grid);
                    return HitRowHeader;
                }
            }

            if (!grid.Contains(point))
            {
                return HitNothing;
            }

            row = RowAt(point.Y, grid);
            column = ColumnAt(point.X, grid);
            if (!_selectAll && Math.Abs(point.X - HandleRect().Center.X) <= HandleSize &&
                Math.Abs(point.Y - HandleRect().Center.Y) <= HandleSize)
            {
                return HitHandle;
            }

            return HitCell;
        }

        private int RowAt(double y, Rect grid)
        {
            return ClampRow((int)Math.Floor((y - GridOrigin.Y + _scrollY) / RowHeight) + 1);
        }

        private int ColumnAt(double x, Rect grid)
        {
            return ClampColumn((int)Math.Floor((x - GridOrigin.X + _scrollX) / ColumnWidth) + 1);
        }

        /// <summary>Starts a selection, a fill, or an edit.</summary>
        protected override void OnPointerPressed(PointerPressedEventArgs e)
        {
            var point = e.GetCurrentPoint(this);
            if (!point.Properties.IsLeftButtonPressed)
            {
                return;
            }

            Focus();
            var hit = HitTest(point.Position, out var row, out var column);
            if (hit == HitNothing)
            {
                return;
            }

            if (hit == HitBar)
            {
                BeginEdit(SelectedText(), false, true);
                e.Handled = true;
                return;
            }

            if (_editing && (row != _activeRow || column != _activeColumn))
            {
                CommitEdit(true);
            }

            e.Pointer.Capture(this);
            var extend = e.KeyModifiers.HasFlag(KeyModifiers.Shift);

            if (hit == HitCorner)
            {
                SelectAll();
                e.Handled = true;
                return;
            }

            if (hit == HitColumnHeader)
            {
                SelectColumns(column, extend);
                _draggingSelection = true;
                e.Handled = true;
                return;
            }

            if (hit == HitRowHeader)
            {
                SelectRows(row, extend);
                _draggingSelection = true;
                e.Handled = true;
                return;
            }

            if (hit == HitHandle)
            {
                BeginFillDrag(row, column);
                e.Handled = true;
                return;
            }

            if (e.ClickCount == 2 && AllowEditing)
            {
                _activeRow = row;
                _activeColumn = column;
                BeginEdit(GetCell(row, column), false, false);
                e.Handled = true;
                return;
            }

            if (extend)
            {
                _wholeColumns = false;
                _wholeRows = false;
                _selectAll = false;
                _activeRow = row;
                _activeColumn = column;
            }
            else
            {
                SelectCell(row, column);
            }

            _draggingSelection = true;
            RaiseSelectionChanged();
            InvalidateVisual();
            e.Handled = true;
        }

        /// <summary>Extends the selection, or moves the fill preview.</summary>
        protected override void OnPointerMoved(PointerEventArgs e)
        {
            var point = e.GetCurrentPoint(this).Position;
            if (!_draggingSelection && !_draggingFill)
            {
                return;
            }

            var hit = HitTest(point, out var row, out var column);
            if (hit == HitNothing)
            {
                return;
            }

            if (_draggingFill)
            {
                _fillRow = row;
                _fillColumn = column;
                InvalidateVisual();
                e.Handled = true;
                return;
            }

            if (_wholeColumns)
            {
                _activeColumn = ClampColumn(column);
            }
            else if (_wholeRows)
            {
                _activeRow = ClampRow(row);
            }
            else
            {
                _activeRow = ClampRow(row);
                _activeColumn = ClampColumn(column);
            }

            ScrollToActive();
            RaiseSelectionChanged();
            InvalidateVisual();
            e.Handled = true;
        }

        /// <summary>Ends the drag: applies a fill, or leaves the selection where it is.</summary>
        protected override void OnPointerReleased(PointerReleasedEventArgs e)
        {
            var wasFill = _draggingFill;
            _draggingSelection = false;
            _draggingFill = false;
            e.Pointer.Capture(null);
            if (wasFill)
            {
                ApplyFill();
            }

            InvalidateVisual();
        }

        /// <summary>Scrolling: the wheel moves three rows, Shift+wheel moves sideways.</summary>
        protected override void OnPointerWheelChanged(PointerWheelEventArgs e)
        {
            var size = Bounds.Size;
            if (e.KeyModifiers.HasFlag(KeyModifiers.Shift))
            {
                _scrollX -= e.Delta.Y * ColumnWidth;
            }
            else
            {
                _scrollY -= e.Delta.Y * RowHeight * 3;
                _scrollX -= e.Delta.X * ColumnWidth * 3;
            }

            ClampScroll(size);
            InvalidateVisual();
            e.Handled = true;
        }

        private void SelectColumns(int column, bool extend)
        {
            _selectAll = false;
            _wholeRows = false;
            _wholeColumns = true;
            if (!extend)
            {
                _anchorColumn = ClampColumn(column);
            }

            _activeColumn = ClampColumn(column);
            _activeRow = 1;
            CommitEdit(false);
            RaiseSelectionChanged();
            InvalidateVisual();
        }

        private void SelectRows(int row, bool extend)
        {
            _selectAll = false;
            _wholeColumns = false;
            _wholeRows = true;
            if (!extend)
            {
                _anchorRow = ClampRow(row);
            }

            _activeRow = ClampRow(row);
            _activeColumn = 1;
            CommitEdit(false);
            RaiseSelectionChanged();
            InvalidateVisual();
        }

        // ---- the keyboard -----------------------------------------------------------------------

        /// <summary>Grid navigation, and the editor's own keys when one is open.</summary>
        protected override void OnKeyDown(KeyEventArgs e)
        {
            var shift = e.KeyModifiers.HasFlag(KeyModifiers.Shift);
            var control = e.KeyModifiers.HasFlag(KeyModifiers.Control);

            if (_editing)
            {
                if (HandleEditKey(e, shift))
                {
                    e.Handled = true;
                }

                return;
            }

            if (control && e.Key == Key.A)
            {
                SelectAll();
                e.Handled = true;
                return;
            }

            // Ctrl+B / Ctrl+I style the selection, the way every spreadsheet does.
            if (control && e.Key == Key.B)
            {
                ToggleBoldSelection();
                e.Handled = true;
                return;
            }

            if (control && e.Key == Key.I)
            {
                ToggleItalicSelection();
                e.Handled = true;
                return;
            }

            if (control && e.Key == Key.U && AllowEditing)
            {
                BeginEditInBar();
                e.Handled = true;
                return;
            }

            if (e.Key == Key.F2 && AllowEditing)
            {
                BeginEdit();
                e.Handled = true;
                return;
            }

            if (e.Key == Key.Delete || e.Key == Key.Back)
            {
                ClearSelection();
                e.Handled = true;
                return;
            }

            if (e.Key == Key.Escape)
            {
                _draggingFill = false;
                InvalidateVisual();
                e.Handled = true;
                return;
            }

            if (e.Key == Key.Left)
            {
                MoveActive(0, -1, shift);
                e.Handled = true;
                return;
            }

            if (e.Key == Key.Right)
            {
                MoveActive(0, 1, shift);
                e.Handled = true;
                return;
            }

            if (e.Key == Key.Up)
            {
                MoveActive(-1, 0, shift);
                e.Handled = true;
                return;
            }

            if (e.Key == Key.Down)
            {
                MoveActive(1, 0, shift);
                e.Handled = true;
                return;
            }

            if (e.Key == Key.PageUp)
            {
                MoveActive(-10, 0, shift);
                e.Handled = true;
                return;
            }

            if (e.Key == Key.PageDown)
            {
                MoveActive(10, 0, shift);
                e.Handled = true;
                return;
            }

            if (e.Key == Key.Home)
            {
                if (control)
                {
                    MoveActive(1 - _activeRow, 1 - _activeColumn, shift);
                }
                else
                {
                    MoveActive(0, 1 - _activeColumn, shift);
                }

                e.Handled = true;
                return;
            }

            if (e.Key == Key.Enter)
            {
                MoveActive(shift ? -1 : 1, 0, false);
                e.Handled = true;
                return;
            }

            if (e.Key == Key.Tab)
            {
                MoveActive(0, shift ? -1 : 1, false);
                e.Handled = true;
            }
        }

        /// <summary>Typing replaces the active cell — the fastest way into a sheet.</summary>
        protected override void OnTextInput(TextInputEventArgs e)
        {
            if (!AllowEditing || _editing || string.IsNullOrEmpty(e.Text))
            {
                return;
            }

            var text = e.Text!;
            var usable = true;
            for (var i = 0; i < text.Length; i++)
            {
                if (char.IsControl(text[i]))
                {
                    usable = false;
                    break;
                }
            }

            if (!usable)
            {
                return;
            }

            BeginEdit(text, true, false);
            e.Handled = true;
        }

        /// <summary>Commits what is being edited if the sheet loses the keyboard. Subscribed in the
        /// constructor rather than overridden: Avalonia 12 does not expose an overridable
        /// OnLostFocus with this signature.</summary>
        private void OnSheetLostFocus(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            CommitEdit(true);
        }

        /// <summary>Moves the active cell by a delta, extending the selection when Shift is held.</summary>
        private void MoveActive(int rowDelta, int columnDelta, bool extend)
        {
            var row = ClampRow(_activeRow + rowDelta);
            var column = ClampColumn(_activeColumn + columnDelta);
            if (extend)
            {
                _wholeColumns = false;
                _wholeRows = false;
                _selectAll = false;
            }
            else if (_wholeColumns || _wholeRows || _selectAll)
            {
                _wholeColumns = false;
                _wholeRows = false;
                _selectAll = false;
                _anchorRow = row;
                _anchorColumn = column;
            }
            else
            {
                _anchorRow = row;
                _anchorColumn = column;
            }

            _activeRow = row;
            _activeColumn = column;
            ScrollToActive();
            RaiseSelectionChanged();
            InvalidateVisual();
        }

        // ---- the editor -------------------------------------------------------------------------

        /// <summary>Opens the editor on the active cell. <paramref name="replace"/> starts from scratch.</summary>
        private void BeginEdit(string? text, bool replace, bool inBar)
        {
            if (!AllowEditing)
            {
                return;
            }

            _editing = true;
            _barFocused = inBar;
            _editIsNew = replace;
            _editText = text == null ? string.Empty : text!;
            _caret = _editText.Length;
            InvalidateVisual();
        }

        /// <summary>True when the fill drag is aiming somewhere it could actually fill.</summary>
        private bool HasFillTarget()
        {
            return _draggingFill && (_fillRow > SelectionLastRow() || _fillColumn > SelectionLastColumn());
        }

        /// <summary>The block the fill would write, for the dashed preview.</summary>
        private Rect PreviewRect()
        {
            var first = CellRect(SelectionFirstRow(), SelectionFirstColumn());
            var lastRow = Math.Max(_fillRow, SelectionLastRow());
            var lastColumn = Math.Max(_fillColumn, SelectionLastColumn());
            var last = CellRect(lastRow, lastColumn);
            return new Rect(first.X, first.Y, last.Right - first.X, last.Bottom - first.Y);
        }

        /// <summary>Handles a key while an edit is open. True when it was one of ours.</summary>
        private bool HandleEditKey(KeyEventArgs e, bool shift)
        {
            if (e.Key == Key.Escape)
            {
                CommitEdit(false);
                return true;
            }

            var control = e.KeyModifiers.HasFlag(KeyModifiers.Control);
            if (e.Key == Key.Enter)
            {
                CommitEdit(true);
                MoveActive(shift ? -1 : 1, 0, false);
                return true;
            }

            if (e.Key == Key.Tab)
            {
                CommitEdit(true);
                MoveActive(0, shift ? -1 : 1, false);
                return true;
            }

            if (e.Key == Key.Left)
            {
                if (_caret > 0)
                {
                    _caret--;
                }

                InvalidateVisual();
                return true;
            }

            if (e.Key == Key.Right)
            {
                if (_caret < _editText.Length)
                {
                    _caret++;
                }

                InvalidateVisual();
                return true;
            }

            if (e.Key == Key.Home)
            {
                _caret = 0;
                InvalidateVisual();
                return true;
            }

            if (e.Key == Key.End)
            {
                _caret = _editText.Length;
                InvalidateVisual();
                return true;
            }

            if (e.Key == Key.Back)
            {
                if (_caret > 0)
                {
                    _editText = _editText.Substring(0, _caret - 1) + _editText.Substring(_caret);
                    _caret--;
                }

                InvalidateVisual();
                return true;
            }

            if (e.Key == Key.Delete)
            {
                if (_caret < _editText.Length)
                {
                    _editText = _editText.Substring(0, _caret) + _editText.Substring(_caret + 1);
                }

                InvalidateVisual();
                return true;
            }

            if (control && e.Key == Key.A)
            {
                _editText = string.Empty;
                _caret = 0;
                InvalidateVisual();
                return true;
            }

            return false;
        }

        /// <summary>Typing inside the editor inserts at the caret.</summary>
        private void InsertIntoEdit(string text)
        {
            _editText = _editText.Substring(0, _caret) + text + _editText.Substring(_caret);
            _caret += text.Length;
            InvalidateVisual();
        }

        /// <summary>
        /// Ends the edit: writes the text into the active cell when <paramref name="keep"/> is true,
        /// and simply drops it when it is false. Clearing the whole selection first is what makes a
        /// new value replace every selected cell, as it does in a spreadsheet.
        /// </summary>
        private void CommitEdit(bool keep)
        {
            if (!_editing)
            {
                return;
            }

            var text = _editText;
            var replace = _editIsNew;
            _editing = false;
            _barFocused = false;
            _editText = string.Empty;
            _caret = 0;
            _editIsNew = false;

            if (keep)
            {
                if (replace && (SelectionFirstRow() != SelectionLastRow() ||
                                SelectionFirstColumn() != SelectionLastColumn()))
                {
                    ClearSelection();
                }

                SetCell(_activeRow, _activeColumn, text);
            }

            InvalidateVisual();
        }

        // ---- autofill ---------------------------------------------------------------------------

        /// <summary>Remembers the block the fill is copying from, and arms the drag.</summary>
        private void BeginFillDrag(int row, int column)
        {
            _draggingFill = true;
            _fillSourceFirstRow = SelectionFirstRow();
            _fillSourceLastRow = SelectionLastRow();
            _fillSourceFirstColumn = SelectionFirstColumn();
            _fillSourceLastColumn = SelectionLastColumn();
            _fillRow = row;
            _fillColumn = column;
            InvalidateVisual();
        }

        /// <summary>Writes the predicted series into the area the handle was dragged over.</summary>
        private void ApplyFill()
        {
            var lastRow = SelectionLastRow();
            var lastColumn = SelectionLastColumn();
            if (_fillRow > lastRow)
            {
                for (var column = _fillSourceFirstColumn; column <= _fillSourceLastColumn; column++)
                {
                    var source = ReadColumn(column, _fillSourceFirstRow, _fillSourceLastRow);
                    var written = PredictSeries(source, _fillRow - lastRow);
                    for (var i = 0; i < written.Length; i++)
                    {
                        SetCell(lastRow + 1 + i, column, written[i]);
                    }
                }

                SelectRange(_fillSourceFirstRow, _fillSourceFirstColumn, _fillRow, lastColumn);
                return;
            }

            if (_fillColumn > lastColumn)
            {
                for (var row = _fillSourceFirstRow; row <= _fillSourceLastRow; row++)
                {
                    var source = ReadRow(row, _fillSourceFirstColumn, _fillSourceLastColumn);
                    var written = PredictSeries(source, _fillColumn - lastColumn);
                    for (var i = 0; i < written.Length; i++)
                    {
                        SetCell(row, lastColumn + 1 + i, written[i]);
                    }
                }

                SelectRange(_fillSourceFirstRow, _fillSourceFirstColumn, lastRow, _fillColumn);
            }
        }

        private string[] ReadColumn(int column, int firstRow, int lastRow)
        {
            var values = new List<string>();
            for (var row = firstRow; row <= lastRow; row++)
            {
                values.Add(GetCell(row, column));
            }

            return values.ToArray();
        }

        private string[] ReadRow(int row, int firstColumn, int lastColumn)
        {
            var values = new List<string>();
            for (var column = firstColumn; column <= lastColumn; column++)
            {
                values.Add(GetCell(row, column));
            }

            return values.ToArray();
        }

        /// <summary>
        /// Works out what the next values should be, from the ones it was given: a run of numbers
        /// continues by its step (1, 2 becomes 3, 4 …; 2, 4 becomes 6, 8 …), a single number counts
        /// up by one, "Item1, Item2" becomes "Item3", and anything else repeats the pattern cyclically.
        /// </summary>
        private static string[] PredictSeries(IReadOnlyList<string> source, int count)
        {
            var written = new string[count < 0 ? 0 : count];
            if (written.Length == 0)
            {
                return written;
            }

            if (source.Count == 0)
            {
                for (var i = 0; i < written.Length; i++)
                {
                    written[i] = string.Empty;
                }

                return written;
            }

            var decimals = DecimalsOf(source);
            var numbers = NumbersOf(source);
            if (numbers != null && numbers.Count >= 2)
            {
                var step = numbers[1] - numbers[0];
                var steady = true;
                for (var i = 2; i < numbers.Count; i++)
                {
                    if (Math.Abs(numbers[i] - numbers[i - 1] - step) > 1e-9)
                    {
                        steady = false;
                        break;
                    }
                }

                if (steady)
                {
                    var last = numbers[numbers.Count - 1];
                    for (var i = 0; i < written.Length; i++)
                    {
                        written[i] = FormatNumber(last + step * (i + 1), decimals);
                    }

                    return written;
                }
            }

            if (numbers != null && numbers.Count == 1)
            {
                for (var i = 0; i < written.Length; i++)
                {
                    written[i] = FormatNumber(numbers[0] + i + 1, decimals);
                }

                return written;
            }

            string? prefix;
            string? suffix;
            int first;
            int numberStep;
            if (SplitTrailingNumber(source, out prefix, out suffix, out first, out numberStep))
            {
                for (var i = 0; i < written.Length; i++)
                {
                    written[i] = prefix + (first + numberStep * (i + 1)).ToString(CultureInfo.InvariantCulture) + suffix;
                }

                return written;
            }

            for (var i = 0; i < written.Length; i++)
            {
                written[i] = source[i % source.Count];
            }

            return written;
        }

        /// <summary>The numbers in the list, or null when any of them is not one.</summary>
        private static List<double>? NumbersOf(IReadOnlyList<string> values)
        {
            var numbers = new List<double>();
            for (var i = 0; i < values.Count; i++)
            {
                double value;
                if (!TryNumber(values[i], out value))
                {
                    return null;
                }

                numbers.Add(value);
            }

            return numbers.Count == 0 ? null : numbers;
        }

        /// <summary>How many decimal places the values were written with, so the fill keeps them.</summary>
        private static int DecimalsOf(IReadOnlyList<string> values)
        {
            var decimals = 0;
            for (var i = 0; i < values.Count; i++)
            {
                var text = values[i];
                if (text == null)
                {
                    continue;
                }

                var dot = text.IndexOf('.');
                if (dot >= 0 && text.Length - dot - 1 > decimals)
                {
                    decimals = text.Length - dot - 1;
                }
            }

            return decimals;
        }

        private static string FormatNumber(double value, int decimals)
        {
            if (decimals <= 0)
            {
                return Math.Round(value).ToString(CultureInfo.InvariantCulture);
            }

            return value.ToString("F" + decimals.ToString(CultureInfo.InvariantCulture),
                CultureInfo.InvariantCulture);
        }

        /// <summary>
        /// "Item1", "Item2" → prefix "Item", suffix "", first 1, step 1 — but only when every value has
        /// the same prefix and the same suffix, so a column that is not really a series is left alone.
        /// </summary>
        private static bool SplitTrailingNumber(IReadOnlyList<string> values, out string? prefix,
            out string? suffix, out int first, out int numberStep)
        {
            prefix = null;
            suffix = null;
            first = 0;
            numberStep = 1;
            var numbers = new List<int>();
            for (var i = 0; i < values.Count; i++)
            {
                var text = values[i];
                if (text == null || text.Length == 0)
                {
                    return false;
                }

                var lastDigit = text.Length;
                while (lastDigit > 0 && text[lastDigit - 1] >= '0' && text[lastDigit - 1] <= '9')
                {
                    lastDigit--;
                }

                if (lastDigit == text.Length)
                {
                    return false;                       // no number at the end
                }

                var head = text.Substring(0, lastDigit);
                var tail = text.Substring(lastDigit);
                if (i == 0)
                {
                    prefix = head;
                    suffix = string.Empty;
                }
                else if (head != prefix)
                {
                    return false;                       // the letters changed, so it is not a series
                }

                numbers.Add(int.Parse(tail, CultureInfo.InvariantCulture));
            }

            if (numbers.Count == 0)
            {
                return false;
            }

            first = numbers[numbers.Count - 1];
            if (numbers.Count >= 2)
            {
                numberStep = numbers[numbers.Count - 1] - numbers[numbers.Count - 2];
                if (numberStep == 0)
                {
                    numberStep = 1;
                }
            }

            return true;
        }
    }
}
