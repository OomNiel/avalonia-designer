// BUNDLED-COPY: 0.12.12
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

    /// <summary>A column or a row that was given its own size (a dragged border, or the API).</summary>
    public sealed class SheetSizeChangedEventArgs : EventArgs
    {
        /// <summary>Creates the event data for one resized column or row.</summary>
        public SheetSizeChangedEventArgs(int column, int row, double size)
        {
            Column = column;
            Row = row;
            Size = size;
        }

        /// <summary>The column that was resized, 1-based — 0 when a ROW was resized instead.</summary>
        public int Column { get; }

        /// <summary>The row that was resized, 1-based — 0 when a COLUMN was resized instead.</summary>
        public int Row { get; }

        /// <summary>The track's new size in pixels.</summary>
        public double Size { get; }

        /// <summary>True when this was a column.</summary>
        public bool IsColumn => Column > 0;
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

        /// <summary>Draw slim scrollbars when the sheet is bigger than the space it has. They appear by
        /// themselves when there is something to scroll to, which is the only cue that the columns off to
        /// the right are reachable at all.</summary>
        public static readonly StyledProperty<bool> ShowScrollBarsProperty =
            AvaloniaProperty.Register<GrumpySheet, bool>(nameof(ShowScrollBars), true);

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

        /// <summary>The narrowest a column or a row can be dragged to. Any less and its border cannot be
        /// grabbed again — a mis-drag there would be one you cannot drag back.</summary>
        private const double MinTrackSize = 16d;

        /// <summary>How near a header border the pointer has to be to resize it. Three pixels is what a
        /// desktop toolkit uses; below two, hitting a border becomes a precision exercise.</summary>
        private const double ResizeGrip = 3d;

        /// <summary>The thickness of a scrollbar, in pixels. Slim, and drawn OVER the grid rather than
        /// taking room from it: a sheet whose grid shifted every time the bars appeared would be worse
        /// than one whose last column is partly covered by a bar.</summary>
        private const double ScrollBarSize = 12d;

        /// <summary>The shortest a scrollbar's thumb may get, so a very long sheet still leaves something
        /// to grab.</summary>
        private const double MinThumbSize = 24d;

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

        // ---- per-column widths and per-row heights ----------------------------------------------
        // Sparse on purpose: the sheet's ColumnWidth/RowHeight answer for every column and row, and these
        // dictionaries answer only for the ones a border was dragged on. The offset tables are their
        // prefix sums, rebuilt on demand — without them every part of the geometry would have to assume
        // all the columns are the same width, which is what it did until 2026-09-26.
        private readonly Dictionary<int, double> _columnWidths = new Dictionary<int, double>();
        private readonly Dictionary<int, double> _rowHeights = new Dictionary<int, double>();
        private double[]? _columnOffsets;
        private double[]? _rowOffsets;

        // Dragging a border. Only one track is ever being resized, so a pair of fields per axis is enough
        // and 0 means "not resizing".
        private int _resizeColumn;
        private int _resizeRow;
        private double _resizeStartSize;
        private double _resizeStartX;
        private double _resizeStartY;

        // Whether the pointer is being shown the resize cursor, so it is only set when it changes.
        private StandardCursorType _cursor = StandardCursorType.Arrow;

        // Dragging a scrollbar's thumb, and where inside it the drag started (so the thumb does not jump
        // under the pointer on the first move).
        private bool _scrollDragging;
        private bool _scrollDragVertical;
        private double _scrollDragStart;
        private double _scrollDragStartOffset;

        static GrumpySheet()
        {
            AffectsRender<GrumpySheet>(RowsProperty, ColumnsProperty, ColumnWidthProperty, RowHeightProperty,
                HeaderWidthProperty, HeaderHeightProperty, ShowHeadersProperty, ShowFormulaBarProperty,
                ShowScrollBarsProperty,
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

        /// <summary>
        /// Takes the keyboard when the sheet appears and NOTHING else in the window has it. The arrow keys
        /// need focus, and until this existed they did nothing at all until the user clicked a cell — which
        /// reads as "the sheet ignores the keyboard" (reported 2026-09-26).
        ///
        /// The work happens on LOADED, not on attach: while the tree is being attached there is no TopLevel
        /// yet, so GetTopLevel returns null and asking the FocusManager anything silently does nothing.
        /// Deliberately conditional: a form that puts the caret in a TextBox on startup keeps it.
        /// </summary>
        protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
        {
            base.OnAttachedToVisualTree(e);
            Loaded += OnSheetLoaded;
        }

        private void OnSheetLoaded(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            Loaded -= OnSheetLoaded;
            // The focus request has to wait for the load to FINISH: asking inside the Loaded handler itself
            // is too early and is simply refused (the window is active, the FocusManager is empty, and
            // IsFocused stays false). One step through the dispatcher is what makes the arrows work the
            // moment the form appears instead of only after the first click.
            Avalonia.Threading.Dispatcher.UIThread.Post(TryTakeFocus, Avalonia.Threading.DispatcherPriority.Background);
        }

        private void TryTakeFocus()
        {
            var manager = TopLevel.GetTopLevel(this)?.FocusManager;
            if (manager == null || manager.GetFocusedElement() != null || !IsVisible)
            {
                return;
            }

            Focus();
        }

        /// <summary>
        /// The offset tables are prefix sums of the sizes, so anything that changes a size invalidates
        /// them — and the scroll limits change with them, or a sheet that just got narrower stays
        /// scrolled past its own right edge.
        /// </summary>
        protected override void OnPropertyChanged(AvaloniaPropertyChangedEventArgs change)
        {
            base.OnPropertyChanged(change);
            if (change.Property == RowsProperty || change.Property == ColumnsProperty ||
                change.Property == ColumnWidthProperty || change.Property == RowHeightProperty)
            {
                InvalidateTrackOffsets();
                ClampScroll(Bounds.Size);
            }
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

        /// <summary>Draw scrollbars when the sheet is bigger than its space.</summary>
        public bool ShowScrollBars
        {
            get { return GetValue(ShowScrollBarsProperty); }
            set { SetValue(ShowScrollBarsProperty, value); }
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

        /// <summary>Raised when a column or a row is given its own size by a drag, or from code — so a
        /// form can save <see cref="ColumnWidths"/>/<see cref="RowHeights"/> and get it back next run.
        ///
        /// Named SheetSizeChanged and not SizeChanged because <c>Control.SizeChanged</c> already exists on
        /// every control, and hiding it would make <c>sheet.SizeChanged</c> mean two different things
        /// depending on the static type of the variable in hand.</summary>
        public event EventHandler<SheetSizeChangedEventArgs>? SheetSizeChanged;

        /// <summary>The active cell's address, e.g. "B7".</summary>
        public string ActiveCellName
        {
            get { return CellName(_activeRow, _activeColumn); }
        }

        /// <summary>
        /// The four corners of what is selected, 1-based — what a form needs to know what its user has
        /// picked. A whole-COLUMN selection spans every row, and a whole-ROW one every column; only the
        /// axis that was actually clicked narrows.
        /// </summary>
        public int SelectedFirstRow
        {
            get { return SelectionFirstRow(); }
        }

        /// <summary>The last row of the selection — see <see cref="SelectedFirstRow"/>.</summary>
        public int SelectedLastRow
        {
            get { return SelectionLastRow(); }
        }

        /// <summary>The first column of the selection — see <see cref="SelectedFirstRow"/>.</summary>
        public int SelectedFirstColumn
        {
            get { return SelectionFirstColumn(); }
        }

        /// <summary>The last column of the selection — see <see cref="SelectedFirstRow"/>.</summary>
        public int SelectedLastColumn
        {
            get { return SelectionLastColumn(); }
        }

        /// <summary>True when every cell in the selection is bold, false when none is, null when they
        /// disagree or there is nothing in it — what the right-click menu ticks.</summary>
        public bool? SelectionAllBold
        {
            get { return SelectionFlag(true); }
        }

        /// <summary>The same for italics — see <see cref="SelectionAllBold"/>.</summary>
        public bool? SelectionAllItalic
        {
            get { return SelectionFlag(false); }
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

        /// <summary>Selects one whole column, exactly as clicking its letter in the header does — every
        /// row of it, and only that column.</summary>
        public void SelectColumn(int column)
        {
            SelectColumns(column, false);
        }

        /// <summary>Selects one whole row, as clicking its number in the header does.</summary>
        public void SelectRow(int row)
        {
            SelectRows(row, false);
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

        /// <summary>
        /// Lines the whole selection up. What the right-click menu's alignment items call.
        ///
        /// A bounded selection — a block of cells — has each cell CREATED if it was blank, which is what
        /// makes "select A1, right-click, centre, then type" do the obvious thing. A whole column or row
        /// is not bounded (all fifty of its rows), so only the cells that already exist are touched:
        /// creating them would write an empty element per row into the form for a line-up with no text in
        /// it, and nothing to see.
        /// </summary>
        public void AlignSelection(SheetAlign align)
        {
            var bounded = !_wholeColumns && !_wholeRows && !_selectAll;
            var first = SelectionFirstRow();
            var last = SelectionLastRow();
            var left = SelectionFirstColumn();
            var right = SelectionLastColumn();
            for (var row = first; row <= last; row++)
            {
                for (var column = left; column <= right; column++)
                {
                    var cell = bounded ? EnsureCell(row, column) : FindCell(row, column);
                    if (cell == null || cell.TextAlign == align)
                    {
                        continue;
                    }

                    cell.TextAlign = align;
                }
            }

            InvalidateVisual();
        }

        /// <summary>
        /// The alignment the whole selection already agrees on, or null when it does not — what the menu
        /// ticks. Cells that do not exist are IGNORED rather than counted as Auto: right-clicking a whole
        /// column and centring it lines up the cells that are in it, and the tick has to say so — with the
        /// empty rows counted as Auto, nothing could ever be ticked on a column that is mostly empty.
        /// Null also means "nothing in the selection yet".
        /// </summary>
        public SheetAlign? SelectionTextAlign()
        {
            var first = SelectionFirstRow();
            var last = SelectionLastRow();
            var left = SelectionFirstColumn();
            var right = SelectionLastColumn();
            SheetAlign? agreed = null;
            for (var row = first; row <= last; row++)
            {
                for (var column = left; column <= right; column++)
                {
                    var cell = FindCell(row, column);
                    if (cell == null)
                    {
                        continue;
                    }

                    if (agreed == null)
                    {
                        agreed = cell.TextAlign;
                    }
                    else if (agreed != cell.TextAlign)
                    {
                        return null;
                    }
                }
            }

            return agreed;
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
            ToggleSelectionFlag(true);
        }

        /// <summary>Italics for the whole selection, by the same rule as <see cref="ToggleBoldSelection"/>.</summary>
        public void ToggleItalicSelection()
        {
            ToggleSelectionFlag(false);
        }

        /// <summary>
        /// Turns bold (or italics) on for the whole selection, or off when every cell in it already has
        /// it — Ctrl+B's rule.
        ///
        /// Which cells it touches depends on the shape of the selection, exactly as
        /// <see cref="AlignSelection"/> does: a bounded block gets cells CREATED where it has none, so
        /// Ctrl+B before typing does something; a whole column or row only gets the cells that already
        /// exist, or a whole column would put fifty empty elements into the form. A selected cell that is
        /// blank counts as "not bold", which is what makes a second Ctrl+B turn the first one back off.
        /// </summary>
        private void ToggleSelectionFlag(bool bold)
        {
            var bounded = !_wholeColumns && !_wholeRows && !_selectAll;
            var first = SelectionFirstRow();
            var last = SelectionLastRow();
            var left = SelectionFirstColumn();
            var right = SelectionLastColumn();
            var turnOn = false;
            for (var row = first; row <= last && !turnOn; row++)
            {
                for (var column = left; column <= right; column++)
                {
                    var cell = FindCell(row, column);
                    if (cell == null)
                    {
                        // A cell that is not there is not bold — but only a bounded selection may create
                        // one, so an unbounded one ignores the gap and looks at the cells it has.
                        turnOn = bounded;
                        if (turnOn)
                        {
                            break;
                        }

                        continue;
                    }

                    if (!(bold ? cell.Bold : cell.Italic))
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
                    var cell = bounded ? EnsureCell(row, column) : FindCell(row, column);
                    if (cell == null)
                    {
                        continue;
                    }

                    if (bold)
                    {
                        cell.Bold = turnOn;
                    }
                    else
                    {
                        cell.Italic = turnOn;
                    }
                }
            }

            InvalidateVisual();
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
            // A whole-COLUMN selection spans every row, so its first row is always 1; it is a whole-ROW
            // selection whose rows come from the anchor. The two flags were SWAPPED here until
            // 2026-09-26, so clicking column C selected A:C and clicking row 5 selected rows 1:5 — and
            // every caller of these corners inherited it (Clear, align, fill, the header highlights).
            if (_wholeColumns || _selectAll)
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
            if (_wholeRows || _selectAll)
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
            return new Rect(origin.X + ColumnOffset(column) - _scrollX,
                            origin.Y + RowOffset(row) - _scrollY,
                            ColumnWidthOf(column), RowHeightOf(row));
        }

        /// <summary>Column <paramref name="column"/>'s width: its own after a border was dragged, else the
        /// sheet's own <see cref="ColumnWidth"/>.</summary>
        public double ColumnWidthOf(int column)
        {
            double width;
            return _columnWidths.TryGetValue(column, out width) && width > 0 ? width : ColumnWidth;
        }

        /// <summary>Row <paramref name="row"/>'s height: its own after a border was dragged, else the
        /// sheet's own <see cref="RowHeight"/>.</summary>
        public double RowHeightOf(int row)
        {
            double height;
            return _rowHeights.TryGetValue(row, out height) && height > 0 ? height : RowHeight;
        }

        /// <summary>The whole grid's width, and its height — what scrolling and measuring need.</summary>
        private double ContentWidth()
        {
            return ColumnOffsets()[ColumnCount];
        }

        private double ContentHeight()
        {
            return RowOffsets()[RowCount];
        }

        /// <summary>
        /// The left edge of every column measured from the left edge of column 1: entry
        /// <c>column - 1</c> holds where that column starts, and the last entry holds the total width.
        /// This is what makes a sheet with two resized columns work at all — drawing, hit testing, the
        /// scroll limits and the visible range all read these tables instead of multiplying by a width.
        /// </summary>
        private double[] ColumnOffsets()
        {
            if (_columnOffsets == null || _columnOffsets.Length != ColumnCount + 1)
            {
                var offsets = new double[ColumnCount + 1];
                var at = 0d;
                for (var i = 0; i < ColumnCount; i++)
                {
                    offsets[i] = at;
                    at += ColumnWidthOf(i + 1);
                }

                offsets[ColumnCount] = at;
                _columnOffsets = offsets;
            }

            return _columnOffsets;
        }

        private double[] RowOffsets()
        {
            if (_rowOffsets == null || _rowOffsets.Length != RowCount + 1)
            {
                var offsets = new double[RowCount + 1];
                var at = 0d;
                for (var i = 0; i < RowCount; i++)
                {
                    offsets[i] = at;
                    at += RowHeightOf(i + 1);
                }

                offsets[RowCount] = at;
                _rowOffsets = offsets;
            }

            return _rowOffsets;
        }

        /// <summary>How far a column's left edge is from column 1's left edge. One past the last column is
        /// allowed — that is the sheet's right edge, which the grid lines need.</summary>
        private double ColumnOffset(int column)
        {
            var offsets = ColumnOffsets();
            if (column < 1)
            {
                column = 1;
            }
            else if (column > ColumnCount + 1)
            {
                column = ColumnCount + 1;
            }

            return offsets[column - 1];
        }

        private double RowOffset(int row)
        {
            var offsets = RowOffsets();
            if (row < 1)
            {
                row = 1;
            }
            else if (row > RowCount + 1)
            {
                row = RowCount + 1;
            }

            return offsets[row - 1];
        }

        /// <summary>Which column a distance from the grid's left edge falls in, and which row a distance
        /// from its top falls in. A walk rather than a division, because the columns are not all the same
        /// width once one has been dragged — and the tables are at most a few hundred entries.</summary>
        private int ColumnAtOffset(double x)
        {
            var offsets = ColumnOffsets();
            var column = 1;
            for (var i = 0; i < ColumnCount; i++)
            {
                if (x < offsets[i])
                {
                    break;
                }

                column = i + 1;
            }

            return ClampColumn(column);
        }

        private int RowAtOffset(double y)
        {
            var offsets = RowOffsets();
            var row = 1;
            for (var i = 0; i < RowCount; i++)
            {
                if (y < offsets[i])
                {
                    break;
                }

                row = i + 1;
            }

            return ClampRow(row);
        }

        /// <summary>Drops the offset tables. Anything that changes a size, or how many there are, has to
        /// do this — otherwise the sheet keeps drawing and hit testing at the OLD widths, which looks
        /// like a resize that quietly did nothing.</summary>
        private void InvalidateTrackOffsets()
        {
            _columnOffsets = null;
            _rowOffsets = null;
        }

        // ---- sizing a column or a row ------------------------------------------------------------
        // What dragging a header border calls. The sizes are per track and SPARSE: every column and row
        // without an entry is still the sheet's own ColumnWidth/RowHeight, so the common case stays a
        // single number and the form stays short.

        /// <summary>Gives one column its own width. Clamped to <see cref="MinTrackSize"/> so its border
        /// stays grabbable, and rounded to whole pixels — a fractional width is impossible to drag back.
        /// A width that comes out exactly the sheet's own <see cref="ColumnWidth"/> CLEARS the override,
        /// so the column goes back to following the sheet.</summary>
        public void SetColumnWidth(int column, double width)
        {
            if (ApplyColumnWidth(column, width))
            {
                RaiseSizeChanged(column, 0, ColumnWidthOf(column));
            }
        }

        /// <summary>Gives one row its own height, by the same rules as <see cref="SetColumnWidth"/>.</summary>
        public void SetRowHeight(int row, double height)
        {
            if (ApplyRowHeight(row, height))
            {
                RaiseSizeChanged(0, row, RowHeightOf(row));
            }
        }

        /// <summary>Sets one column's width without announcing it: the drag applies a new width per pixel of
        /// movement, and an app that saves the form on <see cref="SheetSizeChanged"/> should not be asked to
        /// write the file sixty times a second. The drag announces once, on release.</summary>
        private bool ApplyColumnWidth(int column, double width)
        {
            if (column < 1 || column > ColumnCount)
            {
                return false;
            }

            var size = Math.Max(MinTrackSize, Math.Round(width));
            if (Math.Abs(ColumnWidthOf(column) - size) < 0.01)
            {
                return false;
            }

            if (Math.Abs(ColumnWidth - size) < 0.01)
            {
                _columnWidths.Remove(column);
            }
            else
            {
                _columnWidths[column] = size;
            }

            RefreshGeometry();
            return true;
        }

        private bool ApplyRowHeight(int row, double height)
        {
            if (row < 1 || row > RowCount)
            {
                return false;
            }

            var size = Math.Max(MinTrackSize, Math.Round(height));
            if (Math.Abs(RowHeightOf(row) - size) < 0.01)
            {
                return false;
            }

            if (Math.Abs(RowHeight - size) < 0.01)
            {
                _rowHeights.Remove(row);
            }
            else
            {
                _rowHeights[row] = size;
            }

            RefreshGeometry();
            return true;
        }

        /// <summary>Puts one column back on the sheet's own <see cref="ColumnWidth"/>.</summary>
        public void ClearColumnWidth(int column)
        {
            if (_columnWidths.Remove(column))
            {
                RefreshGeometry();
                RaiseSizeChanged(column, 0, ColumnWidth);
            }
        }

        /// <summary>Puts one row back on the sheet's own <see cref="RowHeight"/>.</summary>
        public void ClearRowHeight(int row)
        {
            if (_rowHeights.Remove(row))
            {
                RefreshGeometry();
                RaiseSizeChanged(0, row, RowHeight);
            }
        }

        /// <summary>Puts every column and row back on the sheet's own sizes.</summary>
        public void ClearSizes()
        {
            if (_columnWidths.Count == 0 && _rowHeights.Count == 0)
            {
                return;
            }

            _columnWidths.Clear();
            _rowHeights.Clear();
            RefreshGeometry();
        }

        /// <summary>
        /// The columns that have a width of their own, as <c>"3:120,7:60"</c> — sparse, so a sheet whose
        /// columns are all the same writes nothing at all. Also the XAML form: <c>ColumnWidths="3:120"</c>.
        /// </summary>
        public string ColumnWidths
        {
            get { return TrackText(_columnWidths); }
            set { ReadTrackText(value, _columnWidths, true); }
        }

        /// <summary>The rows that have a height of their own — see <see cref="ColumnWidths"/>.</summary>
        public string RowHeights
        {
            get { return TrackText(_rowHeights); }
            set { ReadTrackText(value, _rowHeights, false); }
        }

        /// <summary>Rebuilds everything that depended on the sizes: the offset tables, the scroll limits,
        /// the picture. Called after any size change, by a drag or from code.</summary>
        private void RefreshGeometry()
        {
            InvalidateTrackOffsets();
            ClampScroll(Bounds.Size);
            InvalidateVisual();
        }

        private void RaiseSizeChanged(int column, int row, double size)
        {
            var handler = SheetSizeChanged;
            if (handler != null)
            {
                handler(this, new SheetSizeChangedEventArgs(column, row, size));
            }
        }

        private static string TrackText(Dictionary<int, double> sizes)
        {
            if (sizes.Count == 0)
            {
                return string.Empty;
            }

            var keys = new List<int>(sizes.Keys);
            keys.Sort();
            var parts = new List<string>(keys.Count);
            for (var i = 0; i < keys.Count; i++)
            {
                parts.Add(keys[i].ToString(CultureInfo.InvariantCulture) + ":" +
                    sizes[keys[i]].ToString(CultureInfo.InvariantCulture));
            }

            return string.Join(",", parts);
        }

        /// <summary>
        /// Reads <c>"3:120,7:60"</c>. Junk is SKIPPED rather than thrown on: this comes from an attribute
        /// in a form, and one bad pair there must not take the window down. Off-the-sheet indexes are
        /// ignored and tiny sizes are clamped exactly as a drag would clamp them.
        /// </summary>
        private void ReadTrackText(string? text, Dictionary<int, double> sizes, bool columns)
        {
            sizes.Clear();
            if (!string.IsNullOrEmpty(text))
            {
                var parts = text!.Split(',');
                var limit = columns ? ColumnCount : RowCount;
                for (var i = 0; i < parts.Length; i++)
                {
                    var pair = parts[i].Split(':');
                    if (pair.Length != 2)
                    {
                        continue;
                    }

                    int index;
                    double size;
                    if (!int.TryParse(pair[0].Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out index) ||
                        !double.TryParse(pair[1].Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out size) ||
                        index < 1 || index > limit)
                    {
                        continue;
                    }

                    sizes[index] = Math.Max(MinTrackSize, Math.Round(size));
                }
            }

            RefreshGeometry();
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

        // ---- the scrollbars -----------------------------------------------------------------------
        // Drawn OVER the grid, slim, and only when there is something to scroll to. Without them a sheet
        // wider than its space gave no sign at all that the columns on the right existed (the wheel
        // scrolls rows, and Shift+wheel scrolls columns — nobody guesses that).

        /// <summary>The vertical scrollbar's track, along the right edge of the grid — or an empty rect
        /// when the rows all fit.</summary>
        private Rect VScrollRect(Size size)
        {
            var grid = GridRect(size);
            if (!ShowScrollBars || grid.Width <= 0 || grid.Height <= 0 ||
                ContentHeight() <= grid.Height + 0.5)
            {
                return new Rect(0, 0, 0, 0);
            }

            return new Rect(grid.Right - ScrollBarSize, grid.Y, ScrollBarSize, grid.Height);
        }

        /// <summary>The horizontal scrollbar's track, along the bottom edge of the grid.</summary>
        private Rect HScrollRect(Size size)
        {
            var grid = GridRect(size);
            if (!ShowScrollBars || grid.Width <= 0 || grid.Height <= 0 ||
                ContentWidth() <= grid.Width + 0.5)
            {
                return new Rect(0, 0, 0, 0);
            }

            return new Rect(grid.X, grid.Bottom - ScrollBarSize, grid.Width, ScrollBarSize);
        }

        /// <summary>The grabbable thumb inside a track: its length is the visible fraction of the content,
        /// and where it sits is where the sheet is scrolled to. The geometry here is exact — the thumb a
        /// drag computes from is the thumb that is drawn, or it would creep away from the pointer.</summary>
        private static Rect ThumbIn(Rect track, double content, double viewport, double offset, bool vertical)
        {
            if (track.Width <= 0 || track.Height <= 0)
            {
                return new Rect(0, 0, 0, 0);
            }

            var span = vertical ? track.Height : track.Width;
            var thumb = ThumbSpan(span, content, viewport);
            var travel = span - thumb;
            var maxOffset = Math.Max(0.0001, content - viewport);
            var at = travel * Math.Min(1d, Math.Max(0d, offset / maxOffset));
            return vertical
                ? new Rect(track.X, track.Y + at, track.Width, thumb)
                : new Rect(track.X + at, track.Y, thumb, track.Height);
        }

        /// <summary>How long a thumb is: the visible fraction of the content, never shorter than
        /// <see cref="MinThumbSize"/> so a very long sheet still leaves something to grab.</summary>
        private static double ThumbSpan(double span, double content, double viewport)
        {
            return Math.Max(MinThumbSize, span * Math.Min(1d, viewport / content));
        }

        private Rect VScrollThumb(Size size)
        {
            var grid = GridRect(size);
            return ThumbIn(VScrollRect(size), ContentHeight(), grid.Height, _scrollY, true);
        }

        private Rect HScrollThumb(Size size)
        {
            var grid = GridRect(size);
            return ThumbIn(HScrollRect(size), ContentWidth(), grid.Width, _scrollX, false);
        }

        /// <summary>The travel a thumb has, in pixels — and the offset range it stands for.</summary>
        private void TrackSpan(Size size, bool vertical, out double travel, out double maxOffset)
        {
            var grid = GridRect(size);
            var track = vertical ? VScrollRect(size) : HScrollRect(size);
            var span = vertical ? track.Height : track.Width;
            var content = vertical ? ContentHeight() : ContentWidth();
            var viewport = vertical ? grid.Height : grid.Width;
            travel = Math.Max(0.0001, span - ThumbSpan(span, content, viewport));
            maxOffset = Math.Max(0d, content - viewport);
        }

        /// <summary>Puts the sheet where a drag of a thumb has taken it: the distance the pointer moved,
        /// scaled from thumb travel to scroll range.</summary>
        private void ScrollThumbTo(Size size, bool vertical, double offset)
        {
            if (vertical)
            {
                _scrollY = offset;
            }
            else
            {
                _scrollX = offset;
            }

            ClampScroll(size);
            InvalidateVisual();
        }

        /// <summary>Scrolls so a point in the track becomes the MIDDLE of the view — what clicking the
        /// track itself does, the way every scrollbar in every toolkit behaves.</summary>
        private void ScrollTrackTo(Size size, bool vertical, double position)
        {
            var grid = GridRect(size);
            var track = vertical ? VScrollRect(size) : HScrollRect(size);
            var span = vertical ? track.Height : track.Width;
            var content = vertical ? ContentHeight() : ContentWidth();
            var viewport = vertical ? grid.Height : grid.Width;
            double travel;
            double maxOffset;
            TrackSpan(size, vertical, out travel, out maxOffset);
            var thumb = ThumbSpan(span, content, viewport);
            var at = (vertical ? position - track.Y : position - track.X) - thumb / 2;
            ScrollThumbTo(size, vertical, at / travel * maxOffset);
        }

        /// <summary>Paints both scrollbars, when they apply.</summary>
        private void DrawScrollBars(DrawingContext context, Size size)
        {
            var grid = GridRect(size);
            using (context.PushClip(grid))
            {
                var back = new SolidColorBrush(Color.Parse("#EFF1F4"));
                var edge = new SolidColorBrush(GridColor);
                var thumb = new SolidColorBrush(Color.Parse("#B7BEC8"));
                var vTrack = VScrollRect(size);
                if (vTrack.Width > 0)
                {
                    context.FillRectangle(back, vTrack);
                    context.DrawLine(new Pen(edge, 1d), new Point(vTrack.X + 0.5, vTrack.Y),
                        new Point(vTrack.X + 0.5, vTrack.Bottom));
                    context.FillRectangle(thumb, VScrollThumb(size));
                }

                var hTrack = HScrollRect(size);
                if (hTrack.Height > 0)
                {
                    context.FillRectangle(back, hTrack);
                    context.DrawLine(new Pen(edge, 1d), new Point(hTrack.X, hTrack.Y + 0.5),
                        new Point(hTrack.Right, hTrack.Y + 0.5));
                    context.FillRectangle(thumb, HScrollThumb(size));
                }
            }
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

            var contentWidth = ContentWidth();
            var contentHeight = ContentHeight();
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
            // ContentWidth/Height, not Columns * ColumnWidth: a widened column makes the sheet wider, and
            // measuring it as though it were not would leave the last columns clipped for good.
            var width = origin.X + ContentWidth();
            var height = origin.Y + ContentHeight();
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
                        // The cell being edited IN PLACE, if this is it. Its text lives in _editText until
                        // the edit is committed, so drawing GetCell() here would show the old value — and
                        // SKIPPING it (which is what this did until 2026-09-26) drew nothing at all, so
                        // typing looked invisible until the cell lost focus.
                        var inPlaceEdit = _editing && !_barFocused
                            && row == _activeRow && column == _activeColumn;
                        var text = inPlaceEdit ? _editText : GetCell(row, column);
                        if (text.Length == 0 && !inPlaceEdit)
                        {
                            continue;
                        }

                        // This cell's own formatting, all of it "unset means the sheet's own".
                        var cell = FindCell(row, column);
                        var align = AlignOf(cell);
                        if (inPlaceEdit)
                        {
                            // Left while typing, the way every spreadsheet does it — a number should not
                            // jump about as it becomes numeric — but a column the user aligned by hand
                            // stays where they put it.
                            var editingAlign = align == SheetAlign.Auto
                                ? TextAlignment.Left
                                : ToTextAlignment(align);
                            DrawCellText(context, text, CellRect(row, column), TextBrushOf(cell, textBrush),
                                false, editingAlign, _caret, TypefaceFor(cell), SizeOf(cell));
                            continue;
                        }

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
                DrawScrollBars(context, size);
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

            // Last of all, over everything including the scrollbars: the right-click menu, if it is open.
            DrawScrollBars(context, size);
            DrawContextMenu(context);
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
                    // Each letter is centred in ITS OWN column, which is not the sheet's ColumnWidth once
                    // one has been dragged.
                    var rect = new Rect(CellRect(1, column).X, columnHeader.Y, ColumnWidthOf(column), HeaderHeight);
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
                    var rect = new Rect(0, CellRect(row, 1).Y, HeaderWidth, RowHeightOf(row));
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
            return RowAt(grid.Y);
        }

        private int VisibleLastRow(Rect grid)
        {
            return RowAt(grid.Bottom);
        }

        private int VisibleFirstColumn(Rect grid)
        {
            return ColumnAt(grid.X);
        }

        private int VisibleLastColumn(Rect grid)
        {
            return ColumnAt(grid.Right);
        }

        // ---- the mouse --------------------------------------------------------------------------

        private const int HitNothing = 0;
        private const int HitCell = 1;
        private const int HitColumnHeader = 2;
        private const int HitRowHeader = 3;
        private const int HitCorner = 4;
        private const int HitHandle = 5;
        private const int HitBar = 6;
        private const int HitColumnResize = 7;
        private const int HitRowResize = 8;
        private const int HitVScrollThumb = 9;
        private const int HitVScrollTrack = 10;
        private const int HitHScrollThumb = 11;
        private const int HitHScrollTrack = 12;

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

                    // A border between two columns — checked BEFORE the header itself, so a press on the
                    // edge resizes instead of selecting the column the edge belongs to.
                    var resizing = ColumnBorderAt(point.X);
                    if (resizing > 0)
                    {
                        column = resizing;
                        return HitColumnResize;
                    }

                    column = ColumnAt(point.X);
                    return HitColumnHeader;
                }

                if (point.X < HeaderWidth)
                {
                    var resizing = RowBorderAt(point.Y);
                    if (resizing > 0)
                    {
                        row = resizing;
                        return HitRowResize;
                    }

                    row = RowAt(point.Y);
                    return HitRowHeader;
                }
            }

            if (!grid.Contains(point))
            {
                return HitNothing;
            }

            // The scrollbars are drawn over the grid, so they are hit first — otherwise the last column's
            // cells would be under an unreachable bar.
            var vTrack = VScrollRect(size);
            if (vTrack.Contains(point))
            {
                return VScrollThumb(size).Contains(point) ? HitVScrollThumb : HitVScrollTrack;
            }

            var hTrack = HScrollRect(size);
            if (hTrack.Contains(point))
            {
                return HScrollThumb(size).Contains(point) ? HitHScrollThumb : HitHScrollTrack;
            }

            row = RowAt(point.Y);
            column = ColumnAt(point.X);
            if (!_selectAll && Math.Abs(point.X - HandleRect().Center.X) <= HandleSize &&
                Math.Abs(point.Y - HandleRect().Center.Y) <= HandleSize)
            {
                return HitHandle;
            }

            return HitCell;
        }

        private int RowAt(double y)
        {
            return RowAtOffset(y - GridOrigin.Y + _scrollY);
        }

        private int ColumnAt(double x)
        {
            return ColumnAtOffset(x - GridOrigin.X + _scrollX);
        }

        /// <summary>
        /// The column whose RIGHT border the pointer is within <see cref="ResizeGrip"/> of, or 0. The
        /// border belongs to the column on its left, which is the one a drag resizes — and the last
        /// column's right edge counts too, that being how you widen the last one.
        /// </summary>
        private int ColumnBorderAt(double x)
        {
            var origin = GridOrigin.X - _scrollX;
            for (var column = 1; column <= ColumnCount; column++)
            {
                if (Math.Abs(x - (origin + ColumnOffset(column + 1))) <= ResizeGrip)
                {
                    return column;
                }
            }

            return 0;
        }

        /// <summary>The row whose BOTTOM border the pointer is on, or 0 — see <see cref="ColumnBorderAt"/>.</summary>
        private int RowBorderAt(double y)
        {
            var origin = GridOrigin.Y - _scrollY;
            for (var row = 1; row <= RowCount; row++)
            {
                if (Math.Abs(y - (origin + RowOffset(row + 1))) <= ResizeGrip)
                {
                    return row;
                }
            }

            return 0;
        }

        /// <summary>The cursor a hit calls for: the only sign that a header edge can be dragged at all.</summary>
        private static StandardCursorType CursorFor(int hit)
        {
            if (hit == HitColumnResize)
            {
                return StandardCursorType.SizeWestEast;
            }

            return hit == HitRowResize ? StandardCursorType.SizeNorthSouth : StandardCursorType.Arrow;
        }

        private void SetCursor(StandardCursorType wanted)
        {
            if (_cursor == wanted)
            {
                return;
            }

            _cursor = wanted;
            Cursor = new Cursor(wanted);
        }

        /// <summary>Back to the arrow when the pointer leaves, whatever it was showing.</summary>
        protected override void OnPointerExited(PointerEventArgs e)
        {
            SetCursor(StandardCursorType.Arrow);
            base.OnPointerExited(e);
        }

        // ---- the right-click menu ------------------------------------------------------------------
        // Drawn by the control ITSELF, like the grid, the headers, the formula bar and the scrollbars.
        //
        // An Avalonia ContextMenu was tried first and it never opened for a real right-click (reported
        // 2026-09-26): that needs the platform's popup plumbing and a control theme, and neither is
        // something this control otherwise depends on — and it meant the menu could not be seen working in
        // a headless render either, which is how it got shipped unverified. Drawing it costs the control
        // nothing it does not already do, and it takes the sheet's own colours, so it fits whatever theme
        // the form uses.

        /// <summary>One line of the menu: a command, or a gap between groups of them.</summary>
        private sealed class SheetMenuItem
        {
            /// <summary>The text shown, empty for a separator.</summary>
            public string Label = string.Empty;

            /// <summary>A gap rather than a command.</summary>
            public bool IsSeparator;

            /// <summary>Show a tick beside it (what the selection already is).</summary>
            public bool Ticked;

            /// <summary>What choosing it does.</summary>
            public Action? Run;
        }

        /// <summary>How wide the menu is, and how tall one of its lines is.</summary>
        private const double MenuWidth = 200d;
        private const double MenuItemHeight = 24d;
        private const double MenuSeparatorHeight = 9d;
        private const double MenuPad = 5d;

        private List<SheetMenuItem> _menuItems = new List<SheetMenuItem>();
        private bool _menuOpen;
        private double _menuX;
        private double _menuY;
        private int _menuHot = -1;

        /// <summary>What the menu offers, built on each open so the ticks are current. The commands act on
        /// the SELECTION — a whole column lines up in one gesture, which is the point of having it.</summary>
        private List<SheetMenuItem> BuildMenuItems()
        {
            var align = SelectionTextAlign();
            var items = new List<SheetMenuItem>();
            items.Add(AlignItem("Align left", SheetAlign.Left, align));
            items.Add(AlignItem("Align centre", SheetAlign.Center, align));
            items.Add(AlignItem("Align right", SheetAlign.Right, align));
            items.Add(AlignItem("Align automatically", SheetAlign.Auto, align));
            items.Add(new SheetMenuItem { IsSeparator = true });
            items.Add(new SheetMenuItem
            {
                Label = "Bold",
                Ticked = SelectionFlag(true) == true,
                Run = ToggleBoldSelection
            });
            items.Add(new SheetMenuItem
            {
                Label = "Italics",
                Ticked = SelectionFlag(false) == true,
                Run = ToggleItalicSelection
            });
            items.Add(new SheetMenuItem { IsSeparator = true });
            items.Add(new SheetMenuItem { Label = "Clear formatting", Run = ClearSelectionFormatting });
            items.Add(new SheetMenuItem { Label = "Clear cells", Run = ClearSelection });
            return items;
        }

        private SheetMenuItem AlignItem(string label, SheetAlign align, SheetAlign? current)
        {
            return new SheetMenuItem
            {
                Label = label,
                Ticked = current == align,
                Run = () => AlignSelection(align)
            };
        }

        /// <summary>The menu's rectangle on the canvas, which is only meaningful while it is open.</summary>
        private Rect MenuRect()
        {
            var height = 2 * MenuPad;
            for (var i = 0; i < _menuItems.Count; i++)
            {
                height += _menuItems[i].IsSeparator ? MenuSeparatorHeight : MenuItemHeight;
            }

            return new Rect(_menuX, _menuY, MenuWidth, height);
        }

        /// <summary>Which line of the menu a point is on, or -1. Separators are not selectable.</summary>
        private int MenuItemAt(Point point)
        {
            if (!_menuOpen || !MenuRect().Contains(point))
            {
                return -1;
            }

            var y = _menuY + MenuPad;
            for (var i = 0; i < _menuItems.Count; i++)
            {
                var item = _menuItems[i];
                var height = item.IsSeparator ? MenuSeparatorHeight : MenuItemHeight;
                if (!item.IsSeparator && point.Y >= y && point.Y < y + height)
                {
                    return i;
                }

                y += height;
            }

            return -1;
        }

        /// <summary>
        /// Opens the menu under the pointer, on the selection the user just pointed at.
        ///
        /// The right button is handled HERE rather than left to the framework's context-request: that never
        /// reached this control, so right-clicking did nothing at all. It also lets the menu move the
        /// selection onto whatever was right-clicked, which is what every spreadsheet does — and keeps the
        /// whole menu inside the control, flipping it up or left near an edge.
        /// </summary>
        private void ShowContextMenu(Point point)
        {
            if (!AllowEditing)
            {
                return;
            }

            SetContextSelection(point);
            _menuItems = BuildMenuItems();
            _menuOpen = true;
            _menuHot = -1;
            var size = Bounds.Size;
            var height = MenuRect().Height;
            _menuX = Math.Max(0, Math.Min(point.X, size.Width - MenuWidth));
            _menuY = Math.Max(0, Math.Min(point.Y, size.Height - height));
            InvalidateVisual();
        }

        private void CloseContextMenu()
        {
            if (!_menuOpen)
            {
                return;
            }

            _menuOpen = false;
            _menuHot = -1;
            InvalidateVisual();
        }

        /// <summary>Runs the line a point is on, if any, and closes. True when the click was the menu's.</summary>
        private bool ChooseMenuItem(Point point)
        {
            var index = MenuItemAt(point);
            var run = index >= 0 ? _menuItems[index].Run : null;
            CloseContextMenu();
            if (run != null)
            {
                run();
            }

            return true;
        }

        /// <summary>Paints the menu over everything else.</summary>
        private void DrawContextMenu(DrawingContext context)
        {
            if (!_menuOpen)
            {
                return;
            }

            var rect = MenuRect();
            var edge = new SolidColorBrush(GridColor);
            context.FillRectangle(new SolidColorBrush(CellBackColor), rect);
            context.DrawRectangle(null, new Pen(edge, 1d), rect);
            var text = new SolidColorBrush(TextColor);
            var hot = new SolidColorBrush(SelectionFillColor);
            var y = _menuY + MenuPad;
            for (var i = 0; i < _menuItems.Count; i++)
            {
                var item = _menuItems[i];
                if (item.IsSeparator)
                {
                    context.DrawLine(new Pen(edge, 1d), new Point(_menuX + 6, y + MenuSeparatorHeight / 2),
                        new Point(rect.Right - 6, y + MenuSeparatorHeight / 2));
                    y += MenuSeparatorHeight;
                    continue;
                }

                if (i == _menuHot)
                {
                    context.FillRectangle(hot, new Rect(_menuX + 1, y, MenuWidth - 2, MenuItemHeight));
                }

                if (item.Ticked)
                {
                    DrawCellText(context, "\u2713", new Rect(_menuX + 1, y, 15, MenuItemHeight), text, false,
                        TextAlignment.Center);
                }

                DrawCellText(context, item.Label, new Rect(_menuX + 17, y, MenuWidth - 22, MenuItemHeight),
                    text, false, TextAlignment.Left);
                y += MenuItemHeight;
            }
        }

        /// <summary>
        /// Moves the selection onto what was right-clicked — unless the cell is already inside the
        /// selection, in which case the menu is about the whole block, which is what the user aimed at.
        /// </summary>
        private void SetContextSelection(Point point)
        {
            var hit = HitTest(point, out var row, out var column);
            if (hit == HitColumnHeader)
            {
                SelectColumns(column, false);
                return;
            }

            if (hit == HitRowHeader)
            {
                SelectRows(row, false);
                return;
            }

            if (hit != HitCell)
            {
                return;
            }

            if (row >= SelectionFirstRow() && row <= SelectionLastRow() &&
                column >= SelectionFirstColumn() && column <= SelectionLastColumn())
            {
                return;
            }

            SelectCell(row, column);
        }

        /// <summary>The menu's own keys: Escape closes, Up/Down move the highlight, Enter chooses.</summary>
        private bool HandleMenuKey(KeyEventArgs e)
        {
            if (!_menuOpen)
            {
                return false;
            }

            if (e.Key == Key.Escape)
            {
                CloseContextMenu();
                return true;
            }

            if (e.Key == Key.Up || e.Key == Key.Down)
            {
                var step = e.Key == Key.Down ? 1 : -1;
                var at = _menuHot;
                for (var i = 0; i < _menuItems.Count; i++)
                {
                    at += step;
                    if (at < 0)
                    {
                        at = _menuItems.Count - 1;
                    }
                    else if (at >= _menuItems.Count)
                    {
                        at = 0;
                    }

                    if (!_menuItems[at].IsSeparator)
                    {
                        break;
                    }
                }

                _menuHot = at;
                InvalidateVisual();
                return true;
            }

            if (e.Key == Key.Enter && _menuHot >= 0 && _menuHot < _menuItems.Count)
            {
                var run = _menuItems[_menuHot].Run;
                CloseContextMenu();
                if (run != null)
                {
                    run();
                }

                return true;
            }

            return true;                    // the menu owns the keyboard while it is open
        }

        /// <summary>True when every cell in the selection is bold (or italic), false when none is, null
        /// when they disagree or the selection holds no cells at all. Cells that do not exist are ignored,
        /// for the reason in <see cref="SelectionTextAlign"/>.</summary>
        private bool? SelectionFlag(bool bold)
        {
            var first = SelectionFirstRow();
            var last = SelectionLastRow();
            var left = SelectionFirstColumn();
            var right = SelectionLastColumn();
            bool? all = null;
            for (var row = first; row <= last; row++)
            {
                for (var column = left; column <= right; column++)
                {
                    var cell = FindCell(row, column);
                    if (cell == null)
                    {
                        continue;
                    }

                    var on = bold ? cell.Bold : cell.Italic;
                    if (all == null)
                    {
                        all = on;
                    }
                    else if (all != on)
                    {
                        return null;
                    }
                }
            }

            return all;
        }

        /// <summary>Starts a selection, a fill, or an edit.</summary>
        protected override void OnPointerPressed(PointerPressedEventArgs e)
        {
            var point = e.GetCurrentPoint(this);

            // A press while the menu is open belongs to the menu: inside it chooses a line, outside it just
            // closes. Either way the press does not also start a selection or a drag.
            if (_menuOpen && !point.Properties.IsRightButtonPressed)
            {
                ChooseMenuItem(point.Position);
                e.Handled = true;
                return;
            }

            // The right button opens the menu HERE rather than being left to ContextRequested, which never
            // reached this control (reported 2026-09-26: the menu existed, its items worked when invoked,
            // and right-clicking opened nothing at all). Doing it here also lets the menu move the selection
            // onto whatever was right-clicked first, which is what every spreadsheet does.
            if (point.Properties.IsRightButtonPressed)
            {
                CloseContextMenu();
                ShowContextMenu(point.Position);
                e.Handled = true;
                return;
            }

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

            // Dragging a scrollbar's thumb, or jumping when its track is clicked.
            if (hit == HitVScrollThumb || hit == HitHScrollThumb)
            {
                _scrollDragging = true;
                _scrollDragVertical = hit == HitVScrollThumb;
                _scrollDragStart = _scrollDragVertical ? point.Position.Y : point.Position.X;
                _scrollDragStartOffset = _scrollDragVertical ? _scrollY : _scrollX;
                e.Pointer.Capture(this);
                e.Handled = true;
                return;
            }

            if (hit == HitVScrollTrack)
            {
                ScrollTrackTo(Bounds.Size, true, point.Position.Y);
                _scrollDragging = true;
                _scrollDragVertical = true;
                _scrollDragStart = point.Position.Y;
                _scrollDragStartOffset = _scrollY;
                e.Pointer.Capture(this);
                e.Handled = true;
                return;
            }

            if (hit == HitHScrollTrack)
            {
                ScrollTrackTo(Bounds.Size, false, point.Position.X);
                _scrollDragging = true;
                _scrollDragVertical = false;
                _scrollDragStart = point.Position.X;
                _scrollDragStartOffset = _scrollX;
                e.Pointer.Capture(this);
                e.Handled = true;
                return;
            }

            // Dragging a header border to size a column or a row. This comes before everything the headers
            // normally do, because the press is ON the header strip.
            if (hit == HitColumnResize)
            {
                _resizeColumn = column;
                _resizeStartSize = ColumnWidthOf(column);
                _resizeStartX = point.Position.X;
                e.Pointer.Capture(this);
                e.Handled = true;
                return;
            }

            if (hit == HitRowResize)
            {
                _resizeRow = row;
                _resizeStartSize = RowHeightOf(row);
                _resizeStartY = point.Position.Y;
                e.Pointer.Capture(this);
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

        /// <summary>Extends the selection, moves a border, or moves the fill preview.</summary>
        protected override void OnPointerMoved(PointerEventArgs e)
        {
            var point = e.GetCurrentPoint(this).Position;
            var hit = HitTest(point, out var row, out var column);

            // While the menu is open a move only highlights the line under the pointer.
            if (_menuOpen)
            {
                var hot = MenuItemAt(point);
                if (hot != _menuHot)
                {
                    _menuHot = hot;
                    InvalidateVisual();
                }

                return;
            }

            // Dragging a scrollbar: the pointer's travel along the track, scaled to the scroll range.
            if (_scrollDragging)
            {
                var size = Bounds.Size;
                double travel;
                double maxOffset;
                TrackSpan(size, _scrollDragVertical, out travel, out maxOffset);
                var moved = (_scrollDragVertical ? point.Y : point.X) - _scrollDragStart;
                ScrollThumbTo(size, _scrollDragVertical, _scrollDragStartOffset + moved / travel * maxOffset);
                e.Handled = true;
                return;
            }

            // Resizing: the pointer's distance from where the drag started is the whole calculation, and
            // Apply* clamps and rounds it. Nothing is announced until the mouse comes up (see release).
            if (_resizeColumn > 0)
            {
                ApplyColumnWidth(_resizeColumn, _resizeStartSize + (point.X - _resizeStartX));
                e.Handled = true;
                return;
            }

            if (_resizeRow > 0)
            {
                ApplyRowHeight(_resizeRow, _resizeStartSize + (point.Y - _resizeStartY));
                e.Handled = true;
                return;
            }

            if (!_draggingSelection && !_draggingFill)
            {
                // Nothing is being dragged, so the only thing a move does is show whether the edge under
                // the pointer can be dragged.
                SetCursor(CursorFor(hit));
                return;
            }

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
            var resizedColumn = _resizeColumn;
            var resizedRow = _resizeRow;
            var resizeStartSize = _resizeStartSize;
            _draggingSelection = false;
            _draggingFill = false;
            _resizeColumn = 0;
            _resizeRow = 0;
            _scrollDragging = false;
            e.Pointer.Capture(null);
            if (wasFill)
            {
                ApplyFill();
            }

            // Now that the mouse is up, say so — once, with the size it ended on. A form can save the
            // widths here and get them back from ColumnWidths/RowHeights next run.
            if (resizedColumn > 0 && Math.Abs(ColumnWidthOf(resizedColumn) - resizeStartSize) > 0.01)
            {
                RaiseSizeChanged(resizedColumn, 0, ColumnWidthOf(resizedColumn));
            }

            if (resizedRow > 0 && Math.Abs(RowHeightOf(resizedRow) - resizeStartSize) > 0.01)
            {
                RaiseSizeChanged(0, resizedRow, RowHeightOf(resizedRow));
            }

            SetCursor(StandardCursorType.Arrow);
            InvalidateVisual();
        }

        /// <summary>Scrolling: the wheel moves three rows or three columns, Shift makes it sideways, and
        /// when there is nothing to scroll VERTICALLY the wheel goes sideways instead — otherwise the
        /// columns off to the right are unreachable with an ordinary mouse.</summary>
        protected override void OnPointerWheelChanged(PointerWheelEventArgs e)
        {
            // A menu that stayed put while the sheet scrolled under it would be pointing at nothing.
            CloseContextMenu();
            var size = Bounds.Size;
            var grid = GridRect(size);
            var vertical = e.Delta.Y;
            if (vertical != 0 && ContentHeight() <= grid.Height + 0.5)
            {
                // A sheet that is wide but not tall: a plain wheel has no rows to move, so it moves the
                // columns. This is what every browser does with a wheel over a horizontally scrolling box.
                _scrollX -= vertical * ColumnWidth * 3;
            }
            else if (e.KeyModifiers.HasFlag(KeyModifiers.Shift))
            {
                _scrollX -= vertical * ColumnWidth;
            }
            else
            {
                _scrollY -= vertical * RowHeight * 3;
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

            // The menu owns the keyboard while it is open (Escape, the arrows, Enter).
            if (HandleMenuKey(e))
            {
                e.Handled = true;
                return;
            }

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
                MoveWithControl(0, -1, shift, control);
                e.Handled = true;
                return;
            }

            if (e.Key == Key.Right)
            {
                MoveWithControl(0, 1, shift, control);
                e.Handled = true;
                return;
            }

            if (e.Key == Key.Up)
            {
                MoveWithControl(-1, 0, shift, control);
                e.Handled = true;
                return;
            }

            if (e.Key == Key.Down)
            {
                MoveWithControl(1, 0, shift, control);
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

            // Ctrl+End: the bottom-right corner of what is IN the sheet, the way every spreadsheet does it.
            if (e.Key == Key.End && control)
            {
                var last = LastUsedCell();
                MoveActive(last.Row - _activeRow, last.Column - _activeColumn, shift);
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

        /// <summary>
        /// An arrow key: one cell on its own, or — with Ctrl — the far end of the block of filled cells in
        /// that direction, which is how a spreadsheet is actually driven around a large sheet (Ctrl+Down
        /// from the top of a column lands on the last value in it).
        /// </summary>
        private void MoveWithControl(int rowDelta, int columnDelta, bool extend, bool control)
        {
            if (!control)
            {
                MoveActive(rowDelta, columnDelta, extend);
                return;
            }

            // Whether the cell NEXT to us is filled decides which rule applies: run to the end of a block
            // of values, or skip a gap and land on the next value. The sheet edge is where either walk
            // stops, so there is always somewhere to land.
            var filled = GetCell(ClampRow(_activeRow + rowDelta),
                ClampColumn(_activeColumn + columnDelta)).Length > 0;
            var atRow = _activeRow;
            var atColumn = _activeColumn;
            while (true)
            {
                var nextRow = ClampRow(atRow + rowDelta);
                var nextColumn = ClampColumn(atColumn + columnDelta);
                if (nextRow == atRow && nextColumn == atColumn)
                {
                    break;                          // the edge: nowhere further to go
                }

                var nextFilled = GetCell(nextRow, nextColumn).Length > 0;
                if (nextFilled != filled)
                {
                    if (!filled)
                    {
                        // The gap ended: land ON the value that ended it.
                        atRow = nextRow;
                        atColumn = nextColumn;
                    }

                    // A block of values ends on its LAST cell, which is the one we are standing on.
                    break;
                }

                atRow = nextRow;
                atColumn = nextColumn;
            }

            MoveActive(atRow - _activeRow, atColumn - _activeColumn, extend);
        }

        /// <summary>The bottom-right corner of the cells that hold something, or A1 on an empty sheet.</summary>
        private (int Row, int Column) LastUsedCell()
        {
            var row = 1;
            var column = 1;
            for (var i = 0; i < _lookup.Count; i++)
            {
                var cell = _lookup[i];
                if (GetCell(cell.Row, cell.Column).Length == 0)
                {
                    continue;
                }

                if (cell.Row > row)
                {
                    row = cell.Row;
                }

                if (cell.Column > column)
                {
                    column = cell.Column;
                }
            }

            return (row, column);
        }

        /// <summary>Typing replaces the active cell — the fastest way into a sheet.</summary>
        protected override void OnTextInput(TextInputEventArgs e)
        {
            if (!AllowEditing || string.IsNullOrEmpty(e.Text))
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

            // The editor is already open — clicked into the cell, F2, or by the first character of this very
            // word — so this character goes IN at the caret. It used to be dropped on the floor:
            // InsertIntoEdit was written for exactly this and never called, so typing a word into a cell
            // kept only its first letter (found 2026-09-26, with the missing in-cell editor drawing).
            if (_editing)
            {
                InsertIntoEdit(text);
                e.Handled = true;
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
            CloseContextMenu();
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
