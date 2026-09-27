// BUNDLED-COPY: 0.13.0
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
//   * AUTOFILL: the small square at the bottom-right of the selection and the one at its top-left are
//     the fill handles. Drag either one — down, right, up or left — and the pattern is PREDICTED:
//     1, 2 becomes 3, 4, 5 …; 2, 4 becomes 6, 8 …; a single number counts up by one; "Item1, Item2"
//     becomes "Item3"; anything else repeats the pattern it was given, which is how a repeating list
//     is copied. A cell holding a FORMULA is not predicted but COPIED, with every relative address
//     moved by the distance it travelled (=B2+1 one row down is =B3+1, exactly as a $ anchors a part
//     of the address in place) and #REF! written where a reference would land off the sheet.
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
//   * FORMULAS ARE EVALUATED. A cell holding "=Sum(B2..B6)" keeps and shows that text (the fx box is where
//     it is read and edited) and the GRID draws what it works out to. Ranges are WRITTEN A1:B3 (Excel's
//     spelling, and what the macro list writes), the older A1..B3 still reads, and the function list is
//     offered by a popup the moment "=" is typed.
//   * PRINTING AND THE PAGE. The toolbar's Print entries produce the PRINT AREA — the selected cells — and
//     nothing else, and asking for one with a single cell selected warns first, with Abort on Enter. Every
//     job is composed on an A4 PAGE, portrait or landscape: the page question is asked before each one and
//     remembered in PrintOrientation, and the area is scaled to fit inside the margin. Load…/Save… read and
//     write .xlsx, one page at a time.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Threading.Tasks;
using System.Xml.Linq;
using Avalonia;
using Avalonia.Collections;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Metadata;
using Avalonia.Platform.Storage;

#if PRINT_SUPPORT
// Printing and the PDF export are provided by two OPTIONAL, third-party libraries a generated project opts
// into (both packages referenced, the symbol defined — see projectScaffold.ts / printSupport.ts). Undefined,
// the whole feature is compiled out and costs nothing, which is how the headless PreviewerHost builds this
// same file with no printer package in reach.
using AvaloniaUI.PrintToPDF;
using Avae.Printables;
#endif

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

    /// <summary>Which way round the PAGE is when the sheet is printed or exported: A4 either way — the page
    /// has no other setup yet — with the print area scaled to fit inside the margin. Portrait is the
    /// default, and the sheet asks again before every job, because there is no page-setup dialog to set it
    /// in. (Not called Orientation: Avalonia.Layout owns that name, and a sheet that shadows it would make
    /// `Orientation` ambiguous in a form that uses both.)</summary>
    public enum SheetOrientation
    {
        Portrait,
        Landscape
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

        /// <summary>Draw the toolbar strip — the File and Print entries — above the formula bar. On by
        /// default: dropping a sheet into a form should hand the user Load…, Save… and Print… without a
        /// line of code.</summary>
        public static readonly StyledProperty<bool> ShowToolbarProperty =
            AvaloniaProperty.Register<GrumpySheet, bool>(nameof(ShowToolbar), true);

        /// <summary>The backcolour of the fx box — the cell edit box at the top of the sheet, where a
        /// formula is typed and read. White by default, so the box stands apart from the strip it sits
        /// in; the whole point of the row is that a form can make it obvious.</summary>
        public static readonly StyledProperty<Color> EditBackColorProperty =
            AvaloniaProperty.Register<GrumpySheet, Color>(nameof(EditBackColor), Color.Parse("#FFFFFF"));

        /// <summary>The colour of the text in the fx box (and of its caret).</summary>
        public static readonly StyledProperty<Color> EditTextColorProperty =
            AvaloniaProperty.Register<GrumpySheet, Color>(nameof(EditTextColor), Color.Parse("#1E2228"));

        /// <summary>Which way round the page is: portrait (taller than wide, the default) or landscape.
        /// Set from XAML, from the designer's properties, or by the page question the Print entries ask —
        /// which remembers the answer here, so the next job starts on the choice the user last made.</summary>
        public static readonly StyledProperty<SheetOrientation> PrintOrientationProperty =
            AvaloniaProperty.Register<GrumpySheet, SheetOrientation>(nameof(PrintOrientation),
                SheetOrientation.Portrait);

        /// <summary>The height of the formula bar strip, in pixels (fixed).</summary>
        private const double BarHeight = 24d;

        /// <summary>The height of the toolbar strip, in pixels (fixed).</summary>
        private const double ToolbarHeight = 26d;

        /// <summary>The width of one toolbar button's icon, in pixels. The label is drawn after it, so a
        /// button is as wide as its own word.</summary>
        private const double ToolbarIconWidth = 26d;

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

        // The PRINT AREA, while a page is being drawn: the sheet shows only these cells and the real
        // headers next to them, which is a different picture from the one on screen. Set and cleared by
        // the page scope the three print/export entries use (PageForPrinting), never left set.
        private bool _printRange;
        private int _printFirstRow = 1;
        private int _printFirstColumn = 1;
        private int _printLastRow = 1;
        private int _printLastColumn = 1;

        // The editor: no TextBox is involved, so this is the whole of its state.
        private bool _editing;
        private bool _barFocused;
        private string _editText = string.Empty;
        private int _caret;
        private bool _editIsNew;

        private double _scrollX;
        private double _scrollY;

        // ---- .xlsx: the workbook on disk ------------------------------------------------------------
        //
        // Both halves are written against System.IO.Compression and System.Xml, so the sheet keeps its one
        // promise — no NuGet package, no assets. A workbook is a zip of small XML parts, and these are the
        // smallest parts Excel and LibreOffice BOTH accept:
        //
        //   [Content_Types].xml   _rels/.rels   xl/workbook.xml   xl/_rels/workbook.xml.rels
        //   xl/worksheets/sheet1.xml            xl/styles.xml
        //
        // WHAT TRAVELS: the cells (numbers as numbers, everything else as text), a formula as its own text
        // plus the value it worked out — so another program shows the answer without calculating anything —
        // each cell's own formatting, and the column widths and row heights a border was dragged on.
        // WHAT DOES NOT: merged cells, pictures, comments, multiple pages. A file holding those still
        // LOADS, and simply loses them on the way back, which is the honest behaviour for a control this
        // size. Loading is ONE PAGE at a time, and Load… asks which when a workbook has several.

        /// <summary>The worksheet name a saved file carries: the control's Name when a form gave it one,
        /// so "Sheet1" in the designer reads "Sheet1" in Excel. Excel's own limits are applied — 31
        /// characters, and none of : \ / ? * [ ] — because a name it refuses is a file it will not open.</summary>
        private string PageName()
        {
            var name = string.IsNullOrWhiteSpace(Name) ? "Sheet1" : Name!.Trim();
            var builder = new System.Text.StringBuilder(name.Length);
            for (var i = 0; i < name.Length && builder.Length < 31; i++)
            {
                var c = name[i];
                builder.Append(c == ':' || c == '\\' || c == '/' || c == '?' || c == '*' || c == '[' || c == ']'
                    ? '_' : c);
            }

            return builder.Length == 0 ? "Sheet1" : builder.ToString();
        }

        /// <summary>A column's width in Excel's own unit (characters, its default font) as pixels, and
        /// back. Excel's rule for 11-point Calibri is pixels = width * 7 + 5, which is what the round trip
        /// here uses, so a column that was 120 px wide is 16.4 characters wide and comes back as 120.</summary>
        private static double WidthToPixels(double width)
        {
            return width * 7d + 5d;
        }

        private static double PixelsToWidth(double pixels)
        {
            return (pixels - 5d) / 7d;
        }

        /// <summary>Row heights are points (1/72 inch) in a file and pixels on screen.</summary>
        private static double PixelsToPoints(double pixels)
        {
            return pixels * 72d / 96d;
        }

        private static double PointsToPixels(double points)
        {
            return points * 96d / 72d;
        }

        /// <summary>
        /// Writes the sheet as a one-page workbook. Returns false — with the reason in the toolbar's
        /// status line — rather than throwing, so a form can call it from a Save button without a try.
        /// </summary>
        public bool SaveWorkbook(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                return false;
            }

            try
            {
                Xlsx.Write(this, path);
                SetStatus("Saved " + System.IO.Path.GetFileName(path));
                return true;
            }
            catch (Exception error)
            {
                SetStatus("Could not save: " + error.Message);
                return false;
            }
        }

        /// <summary>The page names of a workbook, in the workbook's own order. Empty when the file is not a
        /// workbook this control can read — which is also how Load… tells one from something else.</summary>
        public static List<string> WorkbookPages(string path)
        {
            return Xlsx.Pages(path);
        }

        /// <summary>
        /// Reads ONE page of a workbook into the sheet: null (or a name that is not there) takes the first.
        /// The sheet is cleared first, so what was on it is gone; <see cref="Rows"/>/<see cref="Columns"/>
        /// GROW when the page is bigger than the sheet, and are left alone when it is smaller — a form that
        /// made a 30 x 12 sheet keeps its shape after loading a 5 x 3 one.
        /// </summary>
        public bool LoadWorkbook(string path, string? page = null)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                return false;
            }

            try
            {
                var loaded = Xlsx.Read(this, path, page);
                if (loaded < 0)
                {
                    SetStatus("Nothing to load from " + System.IO.Path.GetFileName(path));
                    return false;
                }

                SetStatus("Loaded " + loaded + " cells from " + System.IO.Path.GetFileName(path));
                Refresh();
                return true;
            }
            catch (Exception error)
            {
                SetStatus("Could not load: " + error.Message);
                return false;
            }
        }

        // ---- the file dialogs and hardcopy ------------------------------------------------------------
        //
        // Every one of these starts with TopLevel.GetTopLevel(this): without a window there is no file
        // dialog and no printer, so each is a quiet no-op in the designer's headless preview — which is
        // what makes the toolbar safe to press anywhere, and why SaveWorkbook/LoadWorkbook (plain paths)
        // exist beside them for a form that wants to choose the file itself.

        /// <summary>
        /// Load…: the platform's file dialog, then — when the workbook holds more than one page — the page
        /// list, because the sheet holds ONE page at a time.
        /// </summary>
        public async Task<bool> BrowseForWorkbookAsync()
        {
            var top = TopLevel.GetTopLevel(this);
            if (top?.StorageProvider is not { } storage || _fileBusy)
            {
                return false;
            }

            _fileBusy = true;
            try
            {
                var options = new FilePickerOpenOptions
                {
                    Title = "Load a workbook",
                    AllowMultiple = false,
                    FileTypeFilter = new[]
                    {
                        new FilePickerFileType("Excel workbook") { Patterns = new[] { "*.xlsx", "*.xlsm" } },
                        new FilePickerFileType("All files") { Patterns = new[] { "*" } }
                    }
                };
                var last = SheetPickerMemory.LastFolder;
                if (last != null)
                {
                    try { options.SuggestedStartLocation = await storage.TryGetFolderFromPathAsync(new Uri(last)); }
                    catch { }                       // the remembered folder is gone: let the platform choose
                }

                var files = await storage.OpenFilePickerAsync(options);
                var path = files != null && files.Count > 0 ? files[0].TryGetLocalPath() : null;
                if (string.IsNullOrWhiteSpace(path))
                {
                    return false;                   // cancelled
                }

                SheetPickerMemory.LastFolder = FolderOf(path);
                var pages = WorkbookPages(path!);
                if (pages.Count == 0)
                {
                    SetStatus(System.IO.Path.GetFileName(path!) +
                              " is not a workbook this sheet can read");
                    return false;
                }

                if (pages.Count == 1)
                {
                    return LoadWorkbook(path!, pages[0]);
                }

                // More than one page: ask which, and say on the heading that only one comes across.
                SetStatus(System.IO.Path.GetFileName(path!) + " holds " + pages.Count + " pages");
                OpenMenu(MenuKind.Toolbar, BuildPageItems(path!, pages), new Point(0, ToolbarHeight + 1d),
                    MenuWidth);
                return true;
            }
            catch (Exception error)
            {
                SetStatus("Could not open the picker: " + error.Message);
                return false;
            }
            finally
            {
                _fileBusy = false;
            }
        }

        /// <summary>Save…: the platform's file dialog, then the .xlsx writer.</summary>
        public async Task<bool> SaveAsWorkbookAsync()
        {
            var top = TopLevel.GetTopLevel(this);
            if (top?.StorageProvider is not { } storage || _fileBusy)
            {
                return false;
            }

            _fileBusy = true;
            try
            {
                var picker = new FilePickerSaveOptions
                {
                    Title = "Save the sheet",
                    SuggestedFileName = PageName() + ".xlsx",
                    DefaultExtension = "xlsx",
                    FileTypeChoices = new[]
                    {
                        new FilePickerFileType("Excel workbook") { Patterns = new[] { "*.xlsx" } },
                        new FilePickerFileType("All files") { Patterns = new[] { "*" } }
                    },
                    ShowOverwritePrompt = true
                };
                await SuggestFolder(storage, picker);
                var file = await storage.SaveFilePickerAsync(picker);
                var path = file?.TryGetLocalPath();
                if (string.IsNullOrWhiteSpace(path))
                {
                    return false;
                }

                var ok = SaveWorkbook(path!);
                if (ok)
                {
                    SheetPickerMemory.LastExportFolder = FolderOf(path);
                }

                return ok;
            }
            catch (Exception error)
            {
                SetStatus("Could not save: " + error.Message);
                return false;
            }
            finally
            {
                _fileBusy = false;
            }
        }

        /// <summary>Save as PNG…: the platform's file dialog, then the render.</summary>
        public async Task<bool> SaveAsPngAsync(bool wholeSheet = false)
        {
            var top = TopLevel.GetTopLevel(this);
            if (top?.StorageProvider is not { } storage || _fileBusy)
            {
                return false;
            }

            _fileBusy = true;
            try
            {
                var picker = new FilePickerSaveOptions
                {
                    Title = "Save the sheet as a picture",
                    SuggestedFileName = PageName() + ".png",
                    DefaultExtension = "png",
                    FileTypeChoices = new[]
                    {
                        new FilePickerFileType("PNG image") { Patterns = new[] { "*.png" } },
                        new FilePickerFileType("All files") { Patterns = new[] { "*" } }
                    },
                    ShowOverwritePrompt = true
                };
                await SuggestFolder(storage, picker);
                var file = await storage.SaveFilePickerAsync(picker);
                var path = file?.TryGetLocalPath();
                if (string.IsNullOrWhiteSpace(path))
                {
                    return false;
                }

                var ok = ExportPng(path!, 2, wholeSheet);
                if (ok)
                {
                    SheetPickerMemory.LastExportFolder = FolderOf(path);
                    SetStatus("Saved " + System.IO.Path.GetFileName(path!) + " \u2014 " +
                              PrintAreaText(wholeSheet) + ", " + PageText());
                }

                return ok;
            }
            catch (Exception error)
            {
                SetStatus("Could not save the picture: " + error.Message);
                return false;
            }
            finally
            {
                _fileBusy = false;
            }
        }

        /// <summary>
        /// Renders the PAGE to a PNG file — A4, portrait or landscape, with the print area scaled to fit
        /// inside the margin — at <paramref name="scale"/> times its size, so the text is legible once the
        /// picture is in a document. No package is involved, so this works on every platform and in the
        /// headless previewer: the one export with no prerequisites at all. What it pictures is the PRINT
        /// AREA — the selected cells — and the column letters and row numbers beside it are the real ones.
        /// </summary>
        public bool ExportPng(string path, double scale = 2, bool wholeSheet = false)
        {
            if (string.IsNullOrWhiteSpace(path) || Bounds.Width <= 0 || Bounds.Height <= 0)
            {
                return false;
            }

            try
            {
                if (scale <= 0)
                {
                    scale = 1;
                }

                int firstRow;
                int firstColumn;
                int lastRow;
                int lastColumn;
                if (!PrintArea(wholeSheet, out firstRow, out firstColumn, out lastRow, out lastColumn))
                {
                    return false;
                }

                using (var page = PageForPrinting(firstRow, firstColumn, lastRow, lastColumn))
                {
                    var pageSize = PageSize();
                    var sheetPage = PageForOrientation();
                    var pixels = new PixelSize(
                        Math.Max(1, (int)Math.Round(pageSize.Width * scale)),
                        Math.Max(1, (int)Math.Round(pageSize.Height * scale)));
                    using (var bitmap = new RenderTargetBitmap(pixels, new Vector(96 * scale, 96 * scale)))
                    {
                        bitmap.Render(sheetPage);
                        bitmap.Save(path, new PngBitmapEncoderOptions());
                    }
                }

                SetStatus("Saved " + System.IO.Path.GetFileName(path) + " \u2014 " +
                          PrintAreaText(wholeSheet) + ", " + PageText());
                return true;
            }
            catch (Exception error)
            {
                SetStatus("Could not save the picture: " + error.Message);
                return false;
            }
        }

        /// <summary>Opens a save dialog where the last one left off, when that folder is still there.</summary>
        private static async Task SuggestFolder(IStorageProvider storage, FilePickerSaveOptions picker)
        {
            var last = SheetPickerMemory.LastExportFolder;
            if (last == null)
            {
                return;
            }

            try
            {
                picker.SuggestedStartLocation = await storage.TryGetFolderFromPathAsync(new Uri(last));
            }
            catch
            {
                // The remembered folder has gone: let the platform choose.
            }
        }

        /// <summary>The folder a path is in, for the picker's memory. Never throws.</summary>
        private static string? FolderOf(string? path)
        {
            try
            {
                return string.IsNullOrWhiteSpace(path) ? null : System.IO.Path.GetDirectoryName(path);
            }
            catch
            {
                return null;
            }
        }

        // ---- the print area ---------------------------------------------------------------------
        // PRINTING is the one action here that costs paper, ink and time, and the sheet's resting state is a
        // SINGLE cell selected — which used to mean that choosing Print… quietly printed all 26 columns and
        // 50 rows. So the three entries under Print work on the SELECTION, and when nothing but a single
        // cell is selected the sheet asks first, with an Abort line the keyboard reaches by default.

        /// <summary>The width the warning is drawn at — wide enough for its longest line.</summary>
        private const double PrintWarningWidth = 300d;

        /// <summary>A4 in PDF points (1/72 inch) — the page every job and export is composed on. Landscape
        /// swaps the two, which is the whole of the page setup there is: paper size and margin are the next
        /// step, and belong to a printer setup of their own.</summary>
        private const double PrintPageWidth = 595d;
        private const double PrintPageHeight = 842d;

        /// <summary>The white space kept inside the page, in points — the same 18 the bundled charts use,
        /// so a sheet and a chart printed from the same form look like they came from the same printer.</summary>
        private const double PrintPageMargin = 18d;

        /// <summary>The paper the page is composed for. It is what the sheet SAYS in its status line and what
        /// the printer is asked for, so the page and the job cannot disagree about it.</summary>
        private const string PrintPaperName = "A4";

        /// <summary>The page, the way round the sheet asks for: portrait is taller than wide.</summary>
        private Size PageSize()
        {
            return PrintOrientation == SheetOrientation.Landscape
                ? new Size(PrintPageHeight, PrintPageWidth)
                : new Size(PrintPageWidth, PrintPageHeight);
        }

        /// <summary>The page as "A4 portrait", for the status line and the page question's heading.</summary>
        private string PageText()
        {
            return PrintPaperName + (PrintOrientation == SheetOrientation.Landscape ? " landscape" : " portrait");
        }

        /// <summary>Which of the three entries the warning is about.</summary>
        private enum SheetPrintKind
        {
            None,
            Picture,
            Pdf,
            Printer
        }

        private SheetPrintKind _printKind;

        /// <summary>
        /// The cells a page will hold: the SELECTION — the print area the user chose — or, when the warning
        /// was answered with "print the whole sheet", every row and column. False only when there is nothing
        /// to print at all.
        /// </summary>
        private bool PrintArea(bool wholeSheet, out int firstRow, out int firstColumn, out int lastRow,
            out int lastColumn)
        {
            if (wholeSheet)
            {
                firstRow = 1;
                firstColumn = 1;
                lastRow = RowCount;
                lastColumn = ColumnCount;
                return true;
            }

            firstRow = SelectionFirstRow();
            firstColumn = SelectionFirstColumn();
            lastRow = SelectionLastRow();
            lastColumn = SelectionLastColumn();
            return lastRow >= firstRow && lastColumn >= firstColumn;
        }

        /// <summary>True when the user has actually CHOSEN something to print: a block, a whole column or a
        /// whole row — anything but the single cell that is selected by default. Clicking the corner above
        /// the row numbers (or Ctrl+A) counts as chosen: that is a deliberate "all of it".</summary>
        private bool HasPrintArea()
        {
            return SelectionFirstRow() != SelectionLastRow() ||
                   SelectionFirstColumn() != SelectionLastColumn();
        }

        /// <summary>The area as "B4:D9", for the status line and the warning.</summary>
        private string PrintAreaText(bool wholeSheet)
        {
            int firstRow;
            int firstColumn;
            int lastRow;
            int lastColumn;
            if (!PrintArea(wholeSheet, out firstRow, out firstColumn, out lastRow, out lastColumn))
            {
                return "nothing";
            }

            return CellName(firstRow, firstColumn) + ":" + CellName(lastRow, lastColumn);
        }

        /// <summary>A print or export entry was chosen: with an area selected it goes straight to the page
        /// question, and with a bare single cell it warns first.</summary>
        private void RequestPrint(SheetPrintKind kind)
        {
            if (HasPrintArea())
            {
                ShowOrientationChooser(kind, false);
                return;
            }

            _printKind = kind;
            ShowPrintWarning();
        }

        /// <summary>
        /// The page question, asked before every job — there is no page-setup dialog yet, so this is where
        /// the sheet learns which way round the paper is. The current choice is ticked and the highlight
        /// STARTS on it, so Enter accepts the page as it already is; choosing one REMEMBERS it on the sheet
        /// (<see cref="PrintOrientation"/>, which the designer's properties and a form's own XAML can set
        /// too) and then runs the job; Cancel is a line of its own, so a job is never produced by accident.
        /// </summary>
        private void ShowOrientationChooser(SheetPrintKind kind, bool wholeSheet)
        {
            _printKind = kind;
            var items = new List<SheetMenuItem>();
            items.Add(new SheetMenuItem
            {
                Label = "Page orientation (A4)",
                Hint = "the area is fitted to it",
                Enabled = false
            });
            var current = -1;
            items.Add(new SheetMenuItem
            {
                Label = "Portrait",
                Hint = "taller than wide",
                Ticked = PrintOrientation == SheetOrientation.Portrait,
                Run = () => ChooseOrientation(SheetOrientation.Portrait, wholeSheet)
            });
            if (PrintOrientation == SheetOrientation.Portrait)
            {
                current = items.Count - 1;
            }

            items.Add(new SheetMenuItem
            {
                Label = "Landscape",
                Hint = "wider than tall",
                Ticked = PrintOrientation == SheetOrientation.Landscape,
                Run = () => ChooseOrientation(SheetOrientation.Landscape, wholeSheet)
            });
            if (PrintOrientation == SheetOrientation.Landscape)
            {
                current = items.Count - 1;
            }

            items.Add(new SheetMenuItem { IsSeparator = true });
            items.Add(new SheetMenuItem
            {
                Label = "Cancel",
                Hint = "print nothing",
                Run = CancelPrint
            });

            // Just under the toolbar, where the eye already is. ToolbarStrip is where the strip ENDS (it is
            // the formula bar's top edge, and 0 when the strip is switched off).
            var button = ToolbarButtonRect(ToolbarPrint);
            OpenMenu(MenuKind.Setup, items, new Point(button.X, ToolbarStrip), PrintWarningWidth);
            if (current >= 0)
            {
                _menuHot = current;
            }
        }

        /// <summary>The orientation the user picked: remembered on the sheet, and then the job runs.</summary>
        private void ChooseOrientation(SheetOrientation orientation, bool wholeSheet)
        {
            PrintOrientation = orientation;
            RunPrint(_printKind, wholeSheet);
        }

        /// <summary>The answer that produces nothing, from the page question: the sheet is left exactly as
        /// it was, and the status line says why nothing happened.</summary>
        private void CancelPrint()
        {
            _printKind = SheetPrintKind.None;
            SetStatus("Nothing was printed \u2014 the page orientation was not chosen");
        }

        /// <summary>Runs the entry the warning was about — with the whole sheet, now that the user said so.</summary>
        private void RunPrint(SheetPrintKind kind, bool wholeSheet)
        {
            if (kind == SheetPrintKind.Picture)
            {
                _ = SaveAsPngAsync(wholeSheet);
                return;
            }

#if PRINT_SUPPORT
            if (kind == SheetPrintKind.Pdf)
            {
                _ = SaveAsPdfAsync(wholeSheet);
                return;
            }

            if (kind == SheetPrintKind.Printer)
            {
                _ = PrintAsync(wholeSheet);
            }
#endif
        }

        /// <summary>
        /// The warning, drawn with the same machinery as the right-click menu — a Control has no dialog of
        /// its own, and the one time this file reached for platform popup plumbing (an Avalonia
        /// `ContextMenu` for the right-click menu) it never appeared at all. <b>Abort</b> is the FIRST line,
        /// so Enter and Escape both mean "no": printing the whole sheet has to be asked for twice.
        /// </summary>
        private void ShowPrintWarning()
        {
            var items = new List<SheetMenuItem>();
            // Enabled = false, so the warning lines are not choosable — Enter and Escape then both land on
            // Abort, which is the first ENABLED line.
            items.Add(new SheetMenuItem { Label = "Nothing is selected to print.", Warning = true, Enabled = false });
            items.Add(new SheetMenuItem
            {
                Label = "Select the cells that make the page,",
                Warning = true,
                Enabled = false
            });
            items.Add(new SheetMenuItem { Label = "or print the whole sheet.", Warning = true, Enabled = false });
            items.Add(new SheetMenuItem { IsSeparator = true });
            var pending = _printKind;
            items.Add(new SheetMenuItem
            {
                Label = "Abort",
                Hint = "print nothing",
                Ticked = true,
                Run = () => AbortPrint()
            });
            items.Add(new SheetMenuItem
            {
                Label = "Print the whole sheet",
                Hint = "every row and column",
                Run = () => ShowOrientationChooser(pending, true)
            });

            // Just under the toolbar, so the warning is where the eye already is. ToolbarStrip is where the
            // strip ENDS (it is the formula bar's top edge, and 0 when the strip is switched off).
            var button = ToolbarButtonRect(ToolbarPrint);
            var at = new Point(button.X, ToolbarStrip);
            OpenMenu(MenuKind.Warning, items, at, PrintWarningWidth);
        }

        /// <summary>The answer that prints nothing: the sheet is left exactly as it was.</summary>
        private void AbortPrint()
        {
            _printKind = SheetPrintKind.None;
            SetStatus("Nothing was printed \u2014 select the cells for the page, then try again");
        }

        /// <summary>
        /// The page the three entries work on: the print area, with the driving chrome off, at the area's own
        /// size — and put back exactly as it was when the using block ends.
        ///
        /// The AREA is the selection (the cells the user chose), unless the warning was answered with "print
        /// the whole sheet". Either way the page carries the REAL column letters and row numbers, because the
        /// sheet is SCROLLED to the area's first cell rather than redrawn somewhere else — which is also why
        /// a scrolled sheet no longer prints its scrollbar position, and why "the whole sheet" finally means
        /// the whole sheet on paper rather than the window that happened to be on screen.
        /// </summary>
        private PrintPage PageForPrinting(int firstRow, int firstColumn, int lastRow, int lastColumn)
        {
            return new PrintPage(this, firstRow, firstColumn, lastRow, lastColumn);
        }

        /// <summary>Off for the page, back on for the screen: chrome, scroll, size and the area itself.</summary>
        private struct PrintPage : IDisposable
        {
            private GrumpySheet _sheet;
            private bool _toolbar;
            private bool _bar;
            private bool _scrollBars;
            private bool _range;
            private double _scrollX;
            private double _scrollY;
            private double _width;
            private double _height;
            private int _firstRow;
            private int _firstColumn;
            private int _lastRow;
            private int _lastColumn;

            internal PrintPage(GrumpySheet sheet, int firstRow, int firstColumn, int lastRow, int lastColumn)
            {
                _sheet = sheet;
                _toolbar = sheet.ShowToolbar;
                _bar = sheet.ShowFormulaBar;
                _scrollBars = sheet.ShowScrollBars;
                _range = sheet._printRange;
                _scrollX = sheet._scrollX;
                _scrollY = sheet._scrollY;
                _width = sheet.Width;
                _height = sheet.Height;
                _firstRow = sheet._printFirstRow;
                _firstColumn = sheet._printFirstColumn;
                _lastRow = sheet._printLastRow;
                _lastColumn = sheet._printLastColumn;

                sheet.ShowToolbar = false;
                sheet.ShowFormulaBar = false;
                sheet.ShowScrollBars = false;
                sheet._printRange = true;
                sheet._printFirstRow = firstRow;
                sheet._printFirstColumn = firstColumn;
                sheet._printLastRow = lastRow;
                sheet._printLastColumn = lastColumn;
                sheet._scrollX = sheet.ColumnOffset(firstColumn);
                sheet._scrollY = sheet.RowOffset(firstRow);
                var origin = sheet.GridOrigin;
                sheet.Width = origin.X + sheet.ColumnOffset(lastColumn + 1) - sheet.ColumnOffset(firstColumn);
                sheet.Height = origin.Y + sheet.RowOffset(lastRow + 1) - sheet.RowOffset(firstRow);
                sheet.Measure(new Size(sheet.Width, sheet.Height));
                sheet.Arrange(new Rect(0, 0, sheet.Width, sheet.Height));
            }

            /// <summary>Puts the sheet back exactly as it was, and lets the layout run again so the screen
            /// gets its own size back.</summary>
            public void Dispose()
            {
                if (_sheet == null)
                {
                    return;
                }

                _sheet._printRange = _range;
                _sheet._printFirstRow = _firstRow;
                _sheet._printFirstColumn = _firstColumn;
                _sheet._printLastRow = _lastRow;
                _sheet._printLastColumn = _lastColumn;
                _sheet._scrollX = _scrollX;
                _sheet._scrollY = _scrollY;
                _sheet._printKind = SheetPrintKind.None;
                _sheet.ShowToolbar = _toolbar;
                _sheet.ShowFormulaBar = _bar;
                _sheet.ShowScrollBars = _scrollBars;
                _sheet.Width = _width;
                _sheet.Height = _height;
                _sheet.InvalidateMeasure();
                _sheet.InvalidateVisual();
            }
        }

        /// <summary>
        /// The page the job is drawn on: A4, white, with the sheet — arranged at the print area's own size
        /// by <see cref="PageForPrinting"/> — scaled to FIT inside the margin. Never stretched, so a wide
        /// area and a tall one keep their proportions.
        ///
        /// A separate visual is needed because a page has a size of its own, and the whole point of the page
        /// question is that this size CHANGES with the answer. The sheet is painted through a
        /// <see cref="VisualBrush"/>, which keeps it VECTOR in the PDF, and the page is measured and arranged
        /// before it is handed over: a backend draws what it is given and runs no layout pass for us, so an
        /// un-laid-out page renders empty — a PDF whose size is right and whose paint is nothing. (The
        /// bundled charts compose their page exactly this way.)
        /// </summary>
        private SheetPrintPage PageForOrientation()
        {
            var size = PageSize();
            var page = new SheetPrintPage(this, size, PrintPageMargin);
            page.Measure(size);
            page.Arrange(new Rect(0, 0, size.Width, size.Height));
            return page;
        }

        /// <summary>
        /// The sheet AS A PAGE: white paper with the print area fitted inside the margin. Drawn by this one
        /// small control rather than assembled out of panels and transforms, so the file keeps its promise
        /// — no assets, no dependencies — and the same visual can be handed to a PDF, to the printer, or to
        /// the PNG export without any of the three knowing about the others.
        /// </summary>
        private sealed class SheetPrintPage : Control
        {
            private readonly Control _sheet;
            private readonly Size _page;
            private readonly double _margin;

            internal SheetPrintPage(Control sheet, Size page, double margin)
            {
                _sheet = sheet;
                _page = page;
                _margin = margin;
                Width = page.Width;
                Height = page.Height;
            }

            public override void Render(DrawingContext context)
            {
                var width = double.IsNaN(Width) || Width <= 0 ? _page.Width : Width;
                var height = double.IsNaN(Height) || Height <= 0 ? _page.Height : Height;
                context.FillRectangle(Brushes.White, new Rect(0, 0, width, height));
                var margin = Math.Max(0, _margin);
                var inner = new Rect(margin, margin, Math.Max(1, width - 2 * margin),
                    Math.Max(1, height - 2 * margin));
                context.DrawRectangle(new VisualBrush { Visual = _sheet, Stretch = Stretch.Uniform }, null,
                    inner);
            }
        }

#if PRINT_SUPPORT
        /// <summary>
        /// True when this machine can really put a page on paper: the platform's own printing service, or on
        /// a Linux desktop the CUPS client the bundled GrumpyPrint drives. The same test the charts make,
        /// and the reason the Print… row is greyed out rather than offering a click that does nothing.
        /// </summary>
        public static bool CanPrint
        {
            get
            {
                try { if (Printable.Default is not null) return true; } catch { }
                // Fully qualified: GrumpyPrint is the SHARED bundled helper and lives in the charts' own
                // namespace, which a sheet in AvaloniaSpreadsheet cannot see unqualified.
                return AvaloniaCharts.GrumpyPrint.Available;
            }
        }

        /// <summary>Save as PDF…: the platform's file dialog, then the PDF itself.</summary>
        public async Task<bool> SaveAsPdfAsync(bool wholeSheet = false)
        {
            var top = TopLevel.GetTopLevel(this);
            if (top?.StorageProvider is not { } storage || _fileBusy)
            {
                return false;
            }

            _fileBusy = true;
            try
            {
                var picker = new FilePickerSaveOptions
                {
                    Title = "Save the sheet as a PDF",
                    SuggestedFileName = PageName() + ".pdf",
                    DefaultExtension = "pdf",
                    FileTypeChoices = new[]
                    {
                        new FilePickerFileType("PDF document") { Patterns = new[] { "*.pdf" } },
                        new FilePickerFileType("All files") { Patterns = new[] { "*" } }
                    },
                    ShowOverwritePrompt = true
                };
                await SuggestFolder(storage, picker);
                var file = await storage.SaveFilePickerAsync(picker);
                var path = file?.TryGetLocalPath();
                if (string.IsNullOrWhiteSpace(path))
                {
                    return false;
                }

                var ok = await WritePdf(path!, wholeSheet);
                if (ok)
                {
                    SheetPickerMemory.LastExportFolder = FolderOf(path);
                }

                return ok;
            }
            catch (Exception error)
            {
                SetStatus("Could not write the PDF: " + error.Message);
                return false;
            }
            finally
            {
                _fileBusy = false;
            }
        }

        /// <summary>Writes the sheet to a PDF file (Skia vector output — no printer is involved).</summary>
        public async Task<bool> WritePdf(string path, bool wholeSheet = false)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                return false;
            }

            try
            {
                int firstRow;
                int firstColumn;
                int lastRow;
                int lastColumn;
                if (!PrintArea(wholeSheet, out firstRow, out firstColumn, out lastRow, out lastColumn))
                {
                    return false;
                }

                using (var page = PageForPrinting(firstRow, firstColumn, lastRow, lastColumn))
                {
                    await Print.ToFileAsync(path, new Visual[] { PageForOrientation() });
                }

                SetStatus("Saved " + System.IO.Path.GetFileName(path) + " \u2014 " +
                          PrintAreaText(wholeSheet) + ", " + PageText());
                return true;
            }
            catch (Exception error)
            {
                SetStatus("Could not write the PDF: " + error.Message);
                return false;
            }
        }

        /// <summary>Print…: hands the page to the printer, through the platform's service or CUPS.</summary>
        public async Task<bool> PrintAsync(bool wholeSheet = false)
        {
            if (!CanPrint)
            {
                SetStatus("Nothing here can print \u2014 Save as PDF\u2026 needs no printer");
                return false;
            }

            try
            {
                int firstRow;
                int firstColumn;
                int lastRow;
                int lastColumn;
                if (!PrintArea(wholeSheet, out firstRow, out firstColumn, out lastRow, out lastColumn))
                {
                    return false;
                }

                using (var page = PageForPrinting(firstRow, firstColumn, lastRow, lastColumn))
                {
                    var visuals = new Visual[] { PageForOrientation() };
                    if (Printable.Default is not null)
                    {
                        await Printable.PrintVisualsAsync(visuals, PageName());
                    }
                    else
                    {
                        // CUPS again, and this time it is TOLD what the page is. The PDF's own page box is
                        // not enough: pdftopdf transforms the page according to the JOB's options, so a
                        // queue whose saved defaults say portrait (a user's ~/.cups/lpoptions can pin it)
                        // prints a landscape page the wrong way round. Measured 2026-09-27: one and the same
                        // PDF came out wrong with no options and right with orientation-requested=4.
                        await AvaloniaCharts.GrumpyPrint.PrintAsync(visuals[0], PageName(), null,
                            new AvaloniaCharts.PrintPageSettings
                            {
                                Landscape = PrintOrientation == SheetOrientation.Landscape,
                                PaperSize = PrintPaperName
                            });
                    }
                }

                SetStatus("Sent " + PageName() + " (" + PrintAreaText(wholeSheet) + ", " + PageText() +
                          ") to the printer");
                return true;
            }
            catch (Exception error)
            {
                SetStatus("Could not print: " + error.Message);
                return false;
            }
        }

        /// <summary>
        /// The driving chrome off for a page, and back on when the using block ends — the whole page scope,
        /// including the print area, lives in <see cref="PageForPrinting"/> now, outside this guard, because
        /// the PNG export needs it too.
        /// </summary>
#endif

        /// <summary>
        /// The workbook half of Load…/Save…: the zip, the parts, and the two directions of translation.
        /// Nested rather than spread through the control because none of it needs the sheet's state — the
        /// control's own Save/Load methods above are the door into it.
        /// </summary>
        private static class Xlsx
        {
            private const string Main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

            // ---- writing --------------------------------------------------------------------------

            /// <summary>Writes one page: the cells, the formats they use, and the part that names them.</summary>
            internal static void Write(GrumpySheet sheet, string path)
            {
                var styles = new StyleTable(sheet);
                var body = new System.Text.StringBuilder();
                var cells = Body(sheet, styles, body);

                using (var stream = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None))
                {
                    using (var zip = new ZipArchive(stream, ZipArchiveMode.Create))
                    {
                        Entry(zip, "[Content_Types].xml",
                            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                            "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
                            "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\" />" +
                            "<Default Extension=\"xml\" ContentType=\"application/xml\" />" +
                            "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\" />" +
                            "<Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\" />" +
                            "<Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\" />" +
                            "</Types>");
                        Entry(zip, "_rels/.rels",
                            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                            "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
                            "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\" />" +
                            "</Relationships>");
                        Entry(zip, "xl/workbook.xml",
                            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                            "<workbook xmlns=\"" + Main + "\" " +
                            "xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">" +
                            "<sheets><sheet name=\"" + Text(sheet.PageName()) + "\" sheetId=\"1\" r:id=\"rId1\" /></sheets>" +
                            "</workbook>");
                        Entry(zip, "xl/_rels/workbook.xml.rels",
                            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                            "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
                            "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\" />" +
                            "<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\" />" +
                            "</Relationships>");
                        Entry(zip, "xl/styles.xml", styles.Document());
                        Entry(zip, "xl/worksheets/sheet1.xml",
                            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                            "<worksheet xmlns=\"" + Main + "\">" +
                            "<sheetViews><sheetView workbookViewId=\"0\" /></sheetViews>" +
                            "<sheetFormatPr defaultRowHeight=\"" + Number(PixelsToPoints(sheet.RowHeight)) + "\" />" +
                            sheet.ColumnsElement() +
                            "<sheetData>" + body + "</sheetData></worksheet>");
                    }
                }

                Trace.WriteLine("GrumpySheet: saved " + cells + " cells to " + path);
            }

            /// <summary>The rows of the sheet, as XML: only the cells that exist, so an empty sheet writes
            /// an empty sheetData. A formula goes in twice — its text, and what it worked out to.</summary>
            private static int Body(GrumpySheet sheet, StyleTable styles, System.Text.StringBuilder body)
            {
                var written = 0;
                for (var row = 1; row <= sheet.RowCount; row++)
                {
                    var rowXml = new System.Text.StringBuilder();
                    for (var column = 1; column <= sheet.ColumnCount; column++)
                    {
                        var cell = sheet.FindCell(row, column);
                        if (cell == null)
                        {
                            continue;
                        }

                        var text = cell.Text ?? string.Empty;
                        if (text.Length == 0 && !cell.Fill.HasValue)
                        {
                            continue;               // nothing to say and nothing to show
                        }

                        written++;
                        rowXml.Append(OneCell(sheet, styles, cell, row, column, text));
                    }

                    if (rowXml.Length == 0)
                    {
                        continue;
                    }

                    var height = sheet.RowHeightOf(row);
                    var own = Math.Abs(height - sheet.RowHeight) > 0.01;
                    body.Append("<row r=\"").Append(row).Append('"');
                    if (own)
                    {
                        body.Append(" ht=\"").Append(Number(PixelsToPoints(height)))
                            .Append("\" customHeight=\"1\"");
                    }

                    body.Append('>').Append(rowXml).Append("</row>");
                }

                return written;
            }

            /// <summary>One cell: a number, a formula with its result, or text — plus its own format when it
            /// has one (no `s` at all means "the plain format", which is index 0).</summary>
            private static string OneCell(GrumpySheet sheet, StyleTable styles, SheetCell cell, int row,
                int column, string text)
            {
                var address = GrumpySheet.CellName(row, column);
                var style = styles.Format(cell);
                var s = style > 0 ? " s=\"" + style + "\"" : string.Empty;
                if (text.Length > 0 && text[0] == '=')
                {
                    // A formula keeps its text AND the value it worked out, so a reader that does not
                    // calculate (or a print preview) still shows the answer.
                    var value = sheet.ValueOf(row, column);
                    var cache = LooksNumeric(value) ? "<v>" + Number(ValueNumber(value)) + "</v>" : string.Empty;
                    return "<c r=\"" + address + "\"" + s + "><f>" + Text(text.Substring(1)) + "</f>" + cache + "</c>";
                }

                if (text.Length > 0 && LooksNumeric(text))
                {
                    return "<c r=\"" + address + "\"" + s + "><v>" + Number(ValueNumber(text)) + "</v></c>";
                }

                if (text.Length == 0)
                {
                    return "<c r=\"" + address + "\"" + s + " />";      // a highlight with nothing in it
                }

                // Inline strings, not a shared table: the type attribute is what tells every reader these
                // characters are a STRING, and it is the one thing a hand-written cell part gets wrong.
                return "<c r=\"" + address + "\"" + s + " t=\"inlineStr\"><is><t>" + Text(text) +
                       "</t></is></c>";
            }

            /// <summary>The value text a cell draws as a number, as a double. Only ever called for text
            /// that already looks numeric.</summary>
            private static double ValueNumber(string text)
            {
                double value;
                return double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out value)
                    ? value : 0d;
            }

            /// <summary>A number as XML: invariant, and never in exponent form for ordinary sizes —
            /// "1E-05" is legal but unreadable in a cell someone opens in Excel.</summary>
            private static string Number(double value)
            {
                var text = value.ToString("0.######", CultureInfo.InvariantCulture);
                return text.Length == 0 ? "0" : text;
            }

            /// <summary>Text as XML: the five characters that would break the part are escaped, and the
            /// control characters XML cannot carry at all are dropped.</summary>
            internal static string Text(string text)
            {
                var builder = new System.Text.StringBuilder(text.Length + 8);
                for (var i = 0; i < text.Length; i++)
                {
                    var c = text[i];
                    if (c == '&') builder.Append("&amp;");
                    else if (c == '<') builder.Append("&lt;");
                    else if (c == '>') builder.Append("&gt;");
                    else if (c == '"') builder.Append("&quot;");
                    else if (c < ' ' && c != '\t' && c != '\n' && c != '\r') continue;
                    else builder.Append(c);
                }

                return builder.ToString();
            }

            private static void Entry(ZipArchive zip, string name, string xml)
            {
                var entry = zip.CreateEntry(name, CompressionLevel.Optimal);
                using (var stream = entry.Open())
                {
                    var bytes = new System.Text.UTF8Encoding(false).GetBytes(xml);
                    stream.Write(bytes, 0, bytes.Length);
                }
            }

            // ---- the format tables ------------------------------------------------------------------

            /// <summary>
            /// Excel names every look twice over: a font table, a fill table, and a table of CELL FORMATS
            /// that points into both, which is what a cell's `s` index selects. Two cells that look the same
            /// share one entry — a 10 000-cell sheet of plain numbers still writes three entries.
            /// </summary>
            private sealed class StyleTable
            {
                private readonly GrumpySheet _sheet;
                private readonly List<string> _fonts = new List<string>();
                private readonly List<string> _fills = new List<string>();
                private readonly List<string> _formats = new List<string>();
                private readonly Dictionary<string, int> _fontAt = new Dictionary<string, int>(StringComparer.Ordinal);
                private readonly Dictionary<string, int> _fillAt = new Dictionary<string, int>(StringComparer.Ordinal);
                private readonly Dictionary<string, int> _formatAt = new Dictionary<string, int>(StringComparer.Ordinal);

                internal StyleTable(GrumpySheet sheet)
                {
                    _sheet = sheet;
                    _fills.Add("<fill><patternFill /></fill>");                          // 0: no fill
                    _fills.Add("<fill><patternFill patternType=\"gray125\" /></fill>");  // 1: Excel's own
                    _fonts.Add(FontXml(false, false, sheet.FontSize, sheet.FontFamilyName ?? string.Empty, null));
                    _formats.Add("<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\" />");
                }

                /// <summary>This cell's format index, or 0 for "nothing of its own" — which is what makes a
                /// plain cell a short element with no `s` at all.</summary>
                internal int Format(SheetCell cell)
                {
                    var bold = cell.Bold;
                    var italic = cell.Italic;
                    var size = cell.FontSize > 0 ? cell.FontSize : _sheet.FontSize;
                    var family = string.IsNullOrWhiteSpace(cell.FontFamily)
                        ? _sheet.FontFamilyName ?? string.Empty : cell.FontFamily!;
                    var text = cell.TextColor;
                    var fill = cell.Fill;

                    var fontKey = Flag(bold) + Flag(italic) + Number(size) + "|" + family + "|" +
                                  (text.HasValue ? Rgb(text.Value) : "-");
                    var font = Intern(_fonts, _fontAt, fontKey,
                        FontXml(bold, italic, size, family, text));
                    var fillId = fill.HasValue
                        ? Intern(_fills, _fillAt, Rgb(fill.Value),
                            "<fill><patternFill patternType=\"solid\"><fgColor rgb=\"" + Rgb(fill.Value) +
                            "\" /><bgColor indexed=\"64\" /></patternFill></fill>")
                        : 0;
                    var align = cell.TextAlign == SheetAlign.Left ? "left"
                        : cell.TextAlign == SheetAlign.Center ? "center"
                        : cell.TextAlign == SheetAlign.Right ? "right" : string.Empty;
                    if (font == 0 && fillId == 0 && align.Length == 0)
                    {
                        return 0;
                    }

                    var format = Intern(_formats, _formatAt, font + "|" + fillId + "|" + align,
                        "<xf numFmtId=\"0\" fontId=\"" + font + "\" fillId=\"" + fillId +
                        "\" borderId=\"0\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\"" +
                        (align.Length == 0 ? " />"
                            : " applyAlignment=\"1\"><alignment horizontal=\"" + align + "\" /></xf>"));
                    return format;
                }

                /// <summary>The whole styles part, with each table's count beside it (Excel ignores the
                /// counts and reads the tables, but LibreOffice is happier when they agree).</summary>
                internal string Document()
                {
                    return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                           "<styleSheet xmlns=\"" + Main + "\">" +
                           "<fonts count=\"" + _fonts.Count + "\">" + string.Concat(_fonts) + "</fonts>" +
                           "<fills count=\"" + _fills.Count + "\">" + string.Concat(_fills) + "</fills>" +
                           "<borders count=\"1\"><border><left /><right /><top /><bottom /><diagonal /></border></borders>" +
                           "<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" /></cellStyleXfs>" +
                           "<cellXfs count=\"" + _formats.Count + "\">" + string.Concat(_formats) + "</cellXfs>" +
                           "<cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\" /></cellStyles>" +
                           "</styleSheet>";
                }

                private static string FontXml(bool bold, bool italic, double size, string family,
                    Color? text)
                {
                    return "<font><name val=\"" + Text(family.Length == 0 ? "Calibri" : family) + "\" />" +
                           (bold ? "<b />" : string.Empty) + (italic ? "<i />" : string.Empty) +
                           (text.HasValue ? "<color rgb=\"" + Rgb(text.Value) + "\" />" : string.Empty) +
                           "<sz val=\"" + Number(size) + "\" /></font>";
                }

                private static int Intern(List<string> table, Dictionary<string, int> at, string key,
                    string xml)
                {
                    int found;
                    if (at.TryGetValue(key, out found))
                    {
                        return found;
                    }

                    table.Add(xml);
                    at[key] = table.Count - 1;
                    return table.Count - 1;
                }

                private static string Flag(bool on)
                {
                    return on ? "1" : "0";
                }
            }

            /// <summary>A colour as the eight hexadecimal digits a workbook uses — ARGB, opaque.</summary>
            internal static string Rgb(Color color)
            {
                return "FF" + color.R.ToString("X2", CultureInfo.InvariantCulture)
                    + color.G.ToString("X2", CultureInfo.InvariantCulture)
                    + color.B.ToString("X2", CultureInfo.InvariantCulture);
            }

            // ---- reading --------------------------------------------------------------------------

            /// <summary>The workbook's page names in order. An unreadable file simply has none.</summary>
            internal static List<string> Pages(string path)
            {
                var pages = new List<string>();
                try
                {
                    using (var zip = Open(path))
                    {
                        var book = Part(zip, "xl/workbook.xml");
                        if (book == null)
                        {
                            return pages;
                        }

                        foreach (var element in book.Descendants())
                        {
                            if (element.Name.LocalName == "sheet")
                            {
                                var name = element.Attribute("name");
                                pages.Add(name == null ? string.Empty : name.Value);
                            }
                        }
                    }
                }
                catch (Exception)
                {
                    // Not a workbook, or not readable: the caller treats "no pages" as "no file to load".
                }

                return pages;
            }

            /// <summary>
            /// Reads one page into the sheet and answers how many cells it put there. Everything the sheet
            /// already held is cleared first; the sheet grows to fit the page, never shrinks to it.
            /// </summary>
            internal static int Read(GrumpySheet sheet, string path, string? page)
            {
                using (var zip = Open(path))
                {
                    var book = Part(zip, "xl/workbook.xml");
                    var part = SheetPart(zip, book, page);
                    if (part == null)
                    {
                        return -1;                      // no such page: the caller says so rather than
                    }                                   // reporting an empty load as a success

                    var shared = Shared(zip);
                    var formats = Formats(zip);
                    var cells = Part(zip, part);
                    if (cells == null)
                    {
                        return -1;
                    }
                    var built = new List<SheetCell>();
                    var widths = new Dictionary<int, double>();
                    var heights = new Dictionary<int, double>();
                    var lastRow = 0;
                    var lastColumn = 0;
                    var kept = 0;
                    foreach (var row in cells.Descendants())
                    {
                        if (row.Name.LocalName == "col")
                        {
                            ReadColumn(row, widths);        // <cols> sits beside the rows, not inside them
                            continue;
                        }

                        if (row.Name.LocalName != "row")
                        {
                            continue;
                        }

                        var number = Attribute(row, "r");
                        var at = 0;
                        if (number != null)
                        {
                            int.TryParse(number, NumberStyles.Integer, CultureInfo.InvariantCulture, out at);
                        }

                        if (at <= 0)
                        {
                            continue;                       // a row with no number cannot be placed
                        }

                        var height = Attribute(row, "ht");
                        double points;
                        if (height != null && double.TryParse(height, NumberStyles.Float,
                                CultureInfo.InvariantCulture, out points) && points > 0)
                        {
                            heights[at] = PointsToPixels(points);
                        }

                        foreach (var cell in row.Elements())
                        {
                            if (cell.Name.LocalName != "c")
                            {
                                continue;
                            }

                            var built2 = Cell(cell, shared, formats);
                            if (built2 == null)
                            {
                                continue;
                            }

                            lastRow = Math.Max(lastRow, built2.Row);
                            lastColumn = Math.Max(lastColumn, built2.Column);
                            kept++;
                            built.Add(built2);
                        }
                    }

                    // Grow — never shrink — and only then fill: a page smaller than the sheet leaves the
                    // sheet's own shape alone, which is what a form that sized its grid wants.
                    sheet.Cells.Clear();
                    sheet.ClearSizes();
                    sheet.Rows = Math.Max(sheet.Rows, Math.Max(1, lastRow));
                    sheet.Columns = Math.Max(sheet.Columns, Math.Max(1, lastColumn));
                    sheet.Cells.AddRange(built);
                    foreach (var pair in widths)
                    {
                        sheet.SetColumnWidth(pair.Key, pair.Value);
                    }

                    foreach (var pair in heights)
                    {
                        sheet.SetRowHeight(pair.Key, pair.Value);
                    }

                    sheet.InvalidateValues();
                    return kept;
                }
            }

            /// <summary>A workbook part by name, or null. The lookup is case-insensitive because a file
            /// written on Windows may spell its own parts either way.</summary>
            private static XDocument? Part(ZipArchive zip, string name)
            {
                foreach (var entry in zip.Entries)
                {
                    if (string.Equals(entry.FullName, name, StringComparison.OrdinalIgnoreCase))
                    {
                        using (var stream = entry.Open())
                        {
                            return XDocument.Load(stream);
                        }
                    }
                }

                return null;
            }

            private static XDocument? Element(ZipArchive zip, string name)
            {
                return Part(zip, name);
            }

            /// <summary>A pixel width as the character width a workbook stores, as text.</summary>
            internal static string WidthNumber(double pixels)
            {
                return Number(PixelsToWidth(pixels));
            }

            private static ZipArchive Open(string path)
            {
                // ReadWrite sharing: a workbook the user still has open in Excel is exactly the one they
                // are most likely to load from.
                return new ZipArchive(new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite),
                    ZipArchiveMode.Read);
            }

            private static string? Attribute(XElement element, string name)
            {
                var attribute = element.Attribute(name);
                return attribute == null ? null : attribute.Value;
            }

            /// <summary>The sheet part to read: the page asked for by name, else the first one. The r:id on
            /// each sheet is resolved through the workbook's relationships, so the order of the PARTS in the
            /// zip does not matter — only the order of the pages in the workbook does.</summary>
            private static string? SheetPart(ZipArchive zip, XDocument? book, string? page)
            {
                if (book == null)
                {
                    return null;
                }

                string? wanted = null;
                string? first = null;
                foreach (var element in book.Descendants())
                {
                    if (element.Name.LocalName != "sheet")
                    {
                        continue;
                    }

                    var id = RelationshipOf(element);
                    if (first == null)
                    {
                        first = id;
                    }

                    var name = Attribute(element, "name") ?? string.Empty;
                    if (page != null && string.Equals(name, page, StringComparison.OrdinalIgnoreCase))
                    {
                        wanted = id;
                        break;
                    }
                }

                var wantedId = wanted ?? first;         // a page that is not there falls back to the first
                if (wantedId == null)
                {
                    return null;
                }

                var rels = Part(zip, "xl/_rels/workbook.xml.rels");
                if (rels == null)
                {
                    return null;
                }

                foreach (var element in rels.Descendants())
                {
                    // "Relationship", capitalised — the one name in these parts that is, so it is compared
                    // without regard to case rather than trusting to a spelling nobody can remember.
                    if (!string.Equals(element.Name.LocalName, "relationship", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    if (!string.Equals(Attribute(element, "Id"), wantedId, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    var target = Attribute(element, "Target") ?? string.Empty;
                    var trimmed = target.Replace('\\', '/').Trim();
                    if (trimmed.StartsWith("/", StringComparison.Ordinal))
                    {
                        trimmed = trimmed.TrimStart('/');
                    }
                    else
                    {
                        trimmed = "xl/" + trimmed;
                    }

                    while (trimmed.Contains("../", StringComparison.Ordinal))
                    {
                        var at = trimmed.IndexOf("../", StringComparison.Ordinal);
                        var cut = trimmed.LastIndexOf('/', Math.Max(0, at - 1));
                        trimmed = cut <= 0 ? trimmed.Substring(at + 3)
                            : trimmed.Substring(0, cut + 1) + trimmed.Substring(at + 3);
                    }

                    return trimmed;
                }

                return null;
            }

            /// <summary>A sheet element's relationship id. It is written namespaced — <c>r:id</c> — so it
            /// is found by its LOCAL name, the way every other part of this reader is read.</summary>
            private static string? RelationshipOf(XElement sheet)
            {
                foreach (var attribute in sheet.Attributes())
                {
                    if (attribute.Name.LocalName == "id")
                    {
                        return attribute.Value;
                    }
                }

                return null;
            }

            /// <summary>The workbook's shared strings, in order. A file with none (this control writes
            /// inline strings) simply gets an empty table.</summary>
            private static List<string> Shared(ZipArchive zip)
            {
                var strings = new List<string>();
                var part = Part(zip, "xl/sharedStrings.xml");
                if (part == null)
                {
                    return strings;
                }

                foreach (var element in part.Descendants())
                {
                    if (element.Name.LocalName == "si")
                    {
                        var builder = new System.Text.StringBuilder();
                        foreach (var text in element.Descendants())
                        {
                            if (text.Name.LocalName == "t")
                            {
                                builder.Append(text.Value);
                            }
                        }

                        strings.Add(builder.ToString());
                    }
                }

                return strings;
            }

            /// <summary>One cell, translated: its text (a formula keeps its '='), and whatever formatting
            /// the file gives it. Null for a cell with nothing to say and nothing to show.</summary>
            private static SheetCell? Cell(XElement cell, List<string> shared, List<CellFormat> formats)
            {
                var reference = Attribute(cell, "r");
                var row = 0;
                var column = 0;
                if (reference == null || !GrumpySheet.ParseCellName(reference, out row, out column))
                {
                    return null;
                }

                var text = string.Empty;
                var formula = string.Empty;
                foreach (var child in cell.Elements())
                {
                    if (child.Name.LocalName == "f")
                    {
                        formula = "=" + child.Value;
                        continue;
                    }

                    if (child.Name.LocalName != "v")
                    {
                        continue;
                    }

                    var type = Attribute(cell, "t");
                    if (type == "s")
                    {
                        var at = 0;
                        if (int.TryParse(child.Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out at) &&
                            at >= 0 && at < shared.Count)
                        {
                            text = shared[at];
                        }
                    }
                    else if (type == "b")
                    {
                        text = child.Value == "1" ? "TRUE" : "FALSE";
                    }
                    else
                    {
                        text = child.Value;
                    }
                }

                if (formula.Length > 0)
                {
                    text = formula;                     // the sheet works its own answers out again
                }
                else if (text.Length == 0)
                {
                    var inline = InlineText(cell);
                    if (inline != null)
                    {
                        text = inline;
                    }
                }

                var style = Attribute(cell, "s");
                var styleAt = 0;
                if (style != null)
                {
                    int.TryParse(style, NumberStyles.Integer, CultureInfo.InvariantCulture, out styleAt);
                }

                var format = styleAt >= 0 && styleAt < formats.Count ? formats[styleAt] : null;
                if (text.Length == 0 && (format == null || !format.Fill.HasValue))
                {
                    return null;                        // neither a value nor a highlight: nothing to carry
                }

                var built = new SheetCell { Row = row, Column = column, Text = text };
                if (format != null)
                {
                    built.Bold = format.Bold;
                    built.Italic = format.Italic;
                    built.FontSize = format.Size;
                    built.FontFamily = format.Family;
                    built.TextColor = format.Text;
                    built.Fill = format.Fill;
                    built.TextAlign = format.Align;
                }

                return built;
            }

            /// <summary>An inline string's text (this control's own spelling), or null when the cell has
            /// no inline string at all.</summary>
            private static string? InlineText(XElement cell)
            {
                if (Attribute(cell, "t") != "inlineStr")
                {
                    return null;
                }

                var builder = new System.Text.StringBuilder();
                foreach (var text in cell.Descendants())
                {
                    if (text.Name.LocalName == "t")
                    {
                        builder.Append(text.Value);
                    }
                }

                return builder.ToString();
            }

            /// <summary>One `<col>`: its width and the columns it covers. Excel stores a width in
            /// characters, and only the columns that differ from the sheet's default carry one.</summary>
            private static void ReadColumn(XElement col, Dictionary<int, double> widths)
            {
                var width = Attribute(col, "width");
                double characters;
                if (width == null ||
                    !double.TryParse(width, NumberStyles.Float, CultureInfo.InvariantCulture, out characters))
                {
                    return;
                }

                var first = 0;
                var last = 0;
                int.TryParse(Attribute(col, "min") ?? string.Empty, NumberStyles.Integer,
                    CultureInfo.InvariantCulture, out first);
                int.TryParse(Attribute(col, "max") ?? string.Empty, NumberStyles.Integer,
                    CultureInfo.InvariantCulture, out last);
                if (first <= 0)
                {
                    return;
                }

                if (last < first)
                {
                    last = first;
                }

                for (var column = first; column <= last; column++)
                {
                    widths[column] = WidthToPixels(characters);
                }
            }

            /// <summary>One look, read out of the styles part: everything a cell of that format carries.</summary>
            private sealed class CellFormat
            {
                internal bool Bold;
                internal bool Italic;
                internal double Size;
                internal string? Family;
                internal Color? Text;
                internal Color? Fill;
                internal SheetAlign Align = SheetAlign.Auto;
            }

            /// <summary>The styles part, as a lookup from a cell's `s` index to what it means.</summary>
            private static List<CellFormat> Formats(ZipArchive zip)
            {
                var list = new List<CellFormat>();
                var styles = Part(zip, "xl/styles.xml");
                if (styles == null)
                {
                    return list;
                }

                var fonts = new List<XElement>();
                var fills = new List<XElement>();
                var xfs = new List<XElement>();
                foreach (var element in styles.Descendants())
                {
                    if (element.Name.LocalName == "font" && element.Parent != null &&
                        element.Parent.Name.LocalName == "fonts")
                    {
                        fonts.Add(element);
                    }
                    else if (element.Name.LocalName == "fill" && element.Parent != null &&
                             element.Parent.Name.LocalName == "fills")
                    {
                        fills.Add(element);
                    }
                    else if (element.Name.LocalName == "xf" && element.Parent != null &&
                             element.Parent.Name.LocalName == "cellXfs")
                    {
                        xfs.Add(element);
                    }
                }

                foreach (var xf in xfs)
                {
                    var format = new CellFormat();
                    var font = At(fonts, Attribute(xf, "fontId"));
                    if (font != null)
                    {
                        format.Bold = Has(font, "b");
                        format.Italic = Has(font, "i");
                        foreach (var child in font.Elements())
                        {
                            if (child.Name.LocalName == "sz")
                            {
                                double size;
                                if (double.TryParse(Attribute(child, "val") ?? string.Empty, NumberStyles.Float,
                                        CultureInfo.InvariantCulture, out size) && size > 0)
                                {
                                    format.Size = size;
                                }
                            }
                            else if (child.Name.LocalName == "name")
                            {
                                format.Family = Attribute(child, "val");
                            }
                            else if (child.Name.LocalName == "color")
                            {
                                format.Text = Colour(child);
                            }
                        }
                    }

                    var fill = At(fills, Attribute(xf, "fillId"));
                    if (fill != null)
                    {
                        foreach (var child in fill.Descendants())
                        {
                            if (child.Name.LocalName == "fgColor")
                            {
                                format.Fill = Colour(child);        // a solid pattern's colour is here
                            }
                        }
                    }

                    foreach (var child in xf.Descendants())
                    {
                        if (child.Name.LocalName != "alignment")
                        {
                            continue;
                        }

                        var horizontal = Attribute(child, "horizontal");
                        format.Align = horizontal == "center" ? SheetAlign.Center
                            : horizontal == "right" ? SheetAlign.Right
                            : horizontal == "left" ? SheetAlign.Left
                            : SheetAlign.Auto;
                    }

                    list.Add(format);
                }

                return list;
            }

            private static XElement? At(List<XElement> list, string? index)
            {
                var at = 0;
                if (index != null)
                {
                    int.TryParse(index, NumberStyles.Integer, CultureInfo.InvariantCulture, out at);
                }

                return at >= 0 && at < list.Count ? list[at] : null;
            }

            /// <summary>Does this element have a child of that name? (A loop, not LINQ: a bundled file
            /// must compile in a host project that imports nothing it does not import itself.)</summary>
            private static bool Has(XElement element, string name)
            {
                foreach (var child in element.Elements())
                {
                    if (child.Name.LocalName == name)
                    {
                        return true;
                    }
                }

                return false;
            }

            /// <summary>A colour element as a colour: the six RGB digits of an eight-digit value. A
            /// THEME colour (what Excel writes for the default text) answers null, so the cell keeps the
            /// sheet's own colour instead of guessing at a theme it cannot see.</summary>
            private static Color? Colour(XElement element)
            {
                var rgb = Attribute(element, "rgb");
                if (string.IsNullOrWhiteSpace(rgb))
                {
                    return null;
                }

                var digits = rgb!.Trim();
                if (digits.Length == 8)
                {
                    digits = digits.Substring(2);           // drop the alpha: the sheet's colours are opaque
                }

                byte r = 0;
                byte g = 0;
                byte b = 0;
                if (digits.Length != 6 ||
                    !byte.TryParse(digits.Substring(0, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out r) ||
                    !byte.TryParse(digits.Substring(2, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out g) ||
                    !byte.TryParse(digits.Substring(4, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out b))
                {
                    return null;
                }

                return Color.FromArgb(255, r, g, b);
            }
        }

        /// <summary>The `<cols>` element for the columns a border was dragged on, or nothing when they are
        /// all the sheet's own width.</summary>
        private string ColumnsElement()
        {
            var element = string.Empty;
            for (var column = 1; column <= ColumnCount; column++)
            {
                var width = ColumnWidthOf(column);
                if (Math.Abs(width - ColumnWidth) <= 0.01)
                {
                    continue;
                }

                element += "<col min=\"" + column + "\" max=\"" + column + "\" width=\"" +
                           Xlsx.WidthNumber(width) + "\" customWidth=\"1\" />";
            }

            return element.Length == 0 ? string.Empty : "<cols>" + element + "</cols>";
        }

        // ---- formulas ---------------------------------------------------------------------------
        // What each formula cell works out to, kept until any cell's text changes (see InvalidateValues).
        // Working it out on demand costs one pass per EDIT rather than one per repaint, and a chain of
        // formulas — B1=A1*2, C1=B1+1 — is walked once instead of once per cell drawn.
        private readonly Dictionary<long, string> _values = new Dictionary<long, string>();
        // The cells currently being worked out, so a formula that reaches itself is named (#CYCLE!) rather
        // than recursing until the stack runs out.
        private readonly HashSet<long> _evaluating = new HashSet<long>();

        // ---- per-column widths and per-row heights ----------------------------------------------
        // Sparse on purpose: the sheet's ColumnWidth/RowHeight answer for every column and row, and these
        // dictionaries answer only for the ones a border was dragged on. The offset tables are their
        // prefix sums, rebuilt on demand — without them every part of the geometry would have to assume
        // all the columns are the same width, which is what it did until 2026-09-26.
        private readonly Dictionary<int, double> _columnWidths = new Dictionary<int, double>();
        private readonly Dictionary<int, double> _rowHeights = new Dictionary<int, double>();
        private double[]? _columnOffsets;

        /// <summary>What the last file or print action did, shown at the right of the toolbar. Empty until
        /// something happens, so an untouched sheet has a clean strip.</summary>
        private string _status = string.Empty;

        /// <summary>True while a file dialog, a load, a save or a print job is in flight: one at a time, so
        /// a double click cannot start two pickers.</summary>
        private bool _fileBusy;

        /// <summary>Puts a line in the toolbar's status area — how Load…, Save… and Print… report back
        /// without a message box, which a control this size has no business opening.</summary>
        private void SetStatus(string text)
        {
            _status = text ?? string.Empty;
            InvalidateVisual();
        }

        /// <summary>What the last Load…, Save… or Print… did: the same line the toolbar shows. Empty until
        /// one of them has run, and readable from a form that wants to log it.</summary>
        public string StatusText
        {
            get { return _status; }
        }
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
                ShowScrollBarsProperty, ShowToolbarProperty, EditBackColorProperty, EditTextColorProperty,
                FontFamilyNameProperty, FontSizeProperty, GridColorProperty, HeaderBackColorProperty,
                HeaderTextColorProperty, CellBackColorProperty, TextColorProperty, SelectionColorProperty,
                SelectionFillColorProperty);
            AffectsMeasure<GrumpySheet>(RowsProperty, ColumnsProperty, ColumnWidthProperty, RowHeightProperty,
                HeaderWidthProperty, HeaderHeightProperty, ShowHeadersProperty, ShowFormulaBarProperty,
                ShowToolbarProperty);
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

        /// <summary>Draw the toolbar (File and Print) at all.</summary>
        public bool ShowToolbar
        {
            get { return GetValue(ShowToolbarProperty); }
            set { SetValue(ShowToolbarProperty, value); }
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

        /// <summary>The backcolour of the fx box — the cell edit box at the top of the sheet.</summary>
        public Color EditBackColor
        {
            get { return GetValue(EditBackColorProperty); }
            set { SetValue(EditBackColorProperty, value); }
        }

        /// <summary>The colour of the text in the fx box.</summary>
        public Color EditTextColor
        {
            get { return GetValue(EditTextColorProperty); }
            set { SetValue(EditTextColorProperty, value); }
        }

        /// <summary>Which way round the page is when the sheet is printed or exported.</summary>
        public SheetOrientation PrintOrientation
        {
            get { return GetValue(PrintOrientationProperty); }
            set { SetValue(PrintOrientationProperty, value); }
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
            InvalidateValues();                 // every formula that reads this cell has to be worked out again
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
            InvalidateValues();
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
            // Remember a block while it IS the selection: it is what the macro list offers as a range after
            // the pointer has moved on to the cell the formula is going into (see SelectedRangeText).
            if (SelectionFirstRow() != SelectionLastRow() || SelectionFirstColumn() != SelectionLastColumn())
            {
                _rangeFirstRow = SelectionFirstRow();
                _rangeFirstColumn = SelectionFirstColumn();
                _rangeLastRow = SelectionLastRow();
                _rangeLastColumn = SelectionLastColumn();
            }

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

        /// <summary>Where the grid's cells start, allowing for the toolbar, the bar and the headers.</summary>
        private Point GridOrigin
        {
            get
            {
                var x = ShowHeaders ? HeaderWidth : 0d;
                var y = ToolbarStrip + (ShowFormulaBar ? BarHeight : 0d) + (ShowHeaders ? HeaderHeight : 0d);
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
            if (_printRange)
            {
                // A page holds the print area and NOTHING else, whatever size the layout hands the control:
                // the visible-range walks below all read this rectangle, so this is the one place that has
                // to know. Without it a page would grow to whatever the parent measured and print the rest
                // of the sheet under the area.
                width = ColumnOffset(_printLastColumn + 1) - ColumnOffset(_printFirstColumn);
                height = RowOffset(_printLastRow + 1) - RowOffset(_printFirstRow);
            }

            return new Rect(origin.X, origin.Y, width < 0 ? 0 : width, height < 0 ? 0 : height);
        }

        private Rect BarRect(Size size)
        {
            return new Rect(0, ToolbarStrip, size.Width, BarHeight);
        }

        private Rect BarNameRect(Size size)
        {
            var width = ShowHeaders ? HeaderWidth : 0d;
            return new Rect(0, ToolbarStrip, width, BarHeight);
        }

        private Rect BarInputRect(Size size)
        {
            var name = BarNameRect(size);
            var x = name.Right;
            return new Rect(x, ToolbarStrip, size.Width - x, BarHeight);
        }

        /// <summary>How tall the toolbar strip is: zero when it is switched off, so every rectangle below
        /// it can be worked out without asking whether there is one.</summary>
        private double ToolbarStrip
        {
            get { return ShowToolbar ? ToolbarHeight : 0d; }
        }

        /// <summary>One toolbar button's rectangle, at the left of the strip: File is 0, Print is 1.</summary>
        private Rect ToolbarButtonRect(int index)
        {
            return new Rect(index * ToolbarButtonWidth, 0, ToolbarButtonWidth, ToolbarHeight);
        }

        /// <summary>Which toolbar button a point is on, or -1 — the point has to be inside the strip as
        /// well as inside the button, so a sheet with the toolbar off answers -1 everywhere.</summary>
        private int ToolbarButtonAt(Point point)
        {
            if (!ShowToolbar || point.Y < 0 || point.Y >= ToolbarHeight)
            {
                return -1;
            }

            for (var i = 0; i < ToolbarButtonCount; i++)
            {
                if (ToolbarButtonRect(i).Contains(point))
                {
                    return i;
                }
            }

            return -1;
        }

        /// <summary>A button's word, shown beside it while the pointer is over it — the strip draws its own
        /// tooltip rather than asking the framework for one, like everything else here.</summary>
        private static string ToolbarLabel(int button)
        {
            return button == ToolbarFile ? "File" : "Print";
        }

        /// <summary>The autofill square, at the bottom-right of the selection.</summary>
        private Rect HandleRect()
        {
            var selection = SelectionRect();
            return new Rect(selection.Right - HandleSize / 2, selection.Bottom - HandleSize / 2,
                HandleSize, HandleSize);
        }

        /// <summary>The second autofill square, at the top-left — the one that makes filling UP or LEFT
        /// something you can see rather than something you have to know.</summary>
        private Rect TopHandleRect()
        {
            var selection = SelectionRect();
            return new Rect(selection.X - HandleSize / 2, selection.Y - HandleSize / 2,
                HandleSize, HandleSize);
        }

        /// <summary>True when the pointer is on either autofill square.</summary>
        private bool OnHandle(Point point)
        {
            if (_selectAll)
            {
                return false;
            }

            var bottom = HandleRect();
            if (Math.Abs(point.X - bottom.Center.X) <= HandleSize && Math.Abs(point.Y - bottom.Center.Y) <= HandleSize)
            {
                return true;
            }

            var top = TopHandleRect();
            return Math.Abs(point.X - top.Center.X) <= HandleSize && Math.Abs(point.Y - top.Center.Y) <= HandleSize;
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

            // The wash goes down before the grid lines, so the lines still read through a selection — but
            // NOT on a page: a page carries no selection at all, and a tint over the print area would come
            // out of the printer as a pale block, in a colour the sheet itself never uses.
            var selection = SelectionRect();
            var visibleSelection = selection.Intersect(grid);
            if (!_printRange && visibleSelection.Width > 0 && visibleSelection.Height > 0)
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
                        // A formula cell draws what it WORKED OUT TO; its own text (the formula) is what the fx
                        // box and the editor show, which is where it is read and written.
                        var text = inPlaceEdit ? _editText : ValueOf(row, column);
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
            if (!_printRange)
            {
                // A PAGE carries no selection: the outline, the active-cell box and the fill handles are
                // how the sheet is used, not what is in it.
                DrawSelectionOutline(context, selectionBrush, grid);
            }

            DrawToolbar(context, size, headerBrush, headerTextBrush, selectionFill);
            DrawFormulaBar(context, size, headerBrush, headerTextBrush, textBrush, selectionBrush);
            if (!AllowEditing)
            {
                DrawScrollBars(context, size);
                return;
            }

            // The fill handles, unless the selection is the whole sheet (nothing to fill into) or the
            // picture is a page on its way to paper.
            if (!_selectAll && !_draggingFill && !_printRange)
            {
                var handles = new[] { TopHandleRect(), HandleRect() };
                for (var i = 0; i < handles.Length; i++)
                {
                    if (grid.Contains(handles[i].Center))
                    {
                        context.FillRectangle(selectionBrush, handles[i]);
                    }
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
            if ((!_wholeColumns && !_selectAll) || _printRange)
            {
                // Nothing to light up — and on a page there is no selection anywhere: only the cells.
                return new Rect(0, 0, 0, 0);
            }

            var first = CellRect(1, SelectionFirstColumn());
            var last = CellRect(1, SelectionLastColumn());
            return new Rect(first.X, GridOrigin.Y - HeaderHeight, last.Right - first.X, HeaderHeight);
        }

        /// <summary>The bit of the row header that belongs to the selected rows.</summary>
        private Rect RowHighlight(Rect selection)
        {
            if ((!_wholeRows && !_selectAll) || _printRange)
            {
                // Nothing to light up — and on a page there is no selection anywhere: only the cells.
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

            var box = new Rect(input.X + 22, bar.Y + 1, Math.Max(0, input.Width - 23), bar.Height - 2);
            // The fx box has a backcolour of its OWN (EditBackColor) and its own text colour: it is the one
            // part of the strip a form most often wants to make obvious, which is why those rows exist.
            context.FillRectangle(new SolidColorBrush(EditBackColor), box);
            context.DrawRectangle(null, new Pen(new SolidColorBrush(GridColor), 1d), box);
            var editText = new SolidColorBrush(EditTextColor);
            var shown = _editing && _barFocused ? _editText : SelectedText();
            if (_editing && _barFocused)
            {
                DrawCellText(context, shown, box, editText, false, TextAlignment.Left, _caret);
            }
            else
            {
                DrawCellText(context, shown, box, editText, false, TextAlignment.Left);
            }

            // A light border on the address box is the cue that it can be clicked to type there.
            context.DrawRectangle(null, new Pen(accent, 1d), new Rect(0.5, bar.Y + 0.5, name.Width, name.Height - 1));
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
        private const int HitToolbar = 13;

        /// <summary>What is under a point, and which cell it belongs to.</summary>
        private int HitTest(Point point, out int row, out int column)
        {
            row = 1;
            column = 1;
            var size = Bounds.Size;
            var grid = GridRect(size);

            // The toolbar is ABOVE the formula bar, so it is hit FIRST: a press up there must not fall
            // through to the bar or to the header underneath it.
            if (ShowToolbar && point.Y < ToolbarHeight)
            {
                return ToolbarButtonAt(point) >= 0 ? HitToolbar : HitNothing;
            }

            var bar = ToolbarStrip + (ShowFormulaBar ? BarHeight : 0d);
            if (ShowFormulaBar && point.Y >= ToolbarStrip && point.Y < bar)
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
            if (OnHandle(point))
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
            if (_toolbarHot != -1)
            {
                _toolbarHot = -1;
                InvalidateVisual();
            }

            base.OnPointerExited(e);
        }

        // ---- the toolbar ----------------------------------------------------------------------------
        // Drawn by the control itself, like the grid, the bar, the menu and the scrollbars: two icon
        // buttons and a line of status text. It is the reason a dropped sheet is USABLE with no code at
        // all — Load…, Save… and Print… are already there — and ShowToolbar = False puts the sheet back
        // exactly as it was before the strip existed.
        //
        // File ▸ Load… / Save… are the .xlsx reader and writer below. Print ▸ Save as PNG… / Save as PDF… /
        // Print…. The dialogs come from the platform, so they need a real window: in the designer's
        // headless preview the buttons are drawn and the strip says why a menu leads nowhere.

        /// <summary>How many buttons the toolbar has, and which is which.</summary>
        private const int ToolbarButtonCount = 2;
        private const int ToolbarFile = 0;
        private const int ToolbarPrint = 1;

        /// <summary>The width of one toolbar button, in pixels.</summary>
        private const double ToolbarButtonWidth = 28d;

        /// <summary>Which button the pointer is over, or -1. Only the highlight and the label use it.</summary>
        private int _toolbarHot = -1;

        /// <summary>Paints the strip: its two buttons, the hovering one's word, and the status line.</summary>
        private void DrawToolbar(DrawingContext context, Size size, IBrush back, IBrush text, IBrush accent)
        {
            if (!ShowToolbar || size.Width <= 0)
            {
                return;
            }

            context.FillRectangle(back, new Rect(0, 0, size.Width, ToolbarHeight));
            for (var i = 0; i < ToolbarButtonCount; i++)
            {
                var button = ToolbarButtonRect(i);
                if (i == _toolbarHot)
                {
                    context.FillRectangle(accent, button);
                }

                if (i == ToolbarFile)
                {
                    DrawFileIcon(context, button, text);
                }
                else
                {
                    DrawPrintIcon(context, button, text);
                }
            }

            // The word of the button under the pointer, beside the pair: the strip's own tooltip, drawn
            // rather than asked of the framework, like everything else here.
            var afterButtons = ToolbarButtonRect(ToolbarButtonCount - 1).Right + 4;
            if (_toolbarHot >= 0)
            {
                DrawCellText(context, ToolbarLabel(_toolbarHot), new Rect(afterButtons, 0, 60, ToolbarHeight),
                    text, false, TextAlignment.Left);
            }

            if (_status.Length > 0)
            {
                var statusLeft = afterButtons + 66;
                DrawCellText(context, _status,
                    new Rect(statusLeft, 0, Math.Max(0, size.Width - statusLeft - 6), ToolbarHeight),
                    text, false, TextAlignment.Right, -1, null, Math.Max(9d, FontSize - 1d));
            }

            context.DrawLine(new Pen(new SolidColorBrush(GridColor), 1d), new Point(0, ToolbarHeight - 0.5),
                new Point(size.Width, ToolbarHeight - 0.5));
        }

        /// <summary>The File button's icon: a page with a folded corner and a few lines on it. Drawn from
        /// rectangles and lines — the control ships no image files at all.</summary>
        private static void DrawFileIcon(DrawingContext context, Rect button, IBrush ink)
        {
            var pen = new Pen(ink, 1.2d);
            var x = button.Center.X - 5.5d;
            var y = button.Center.Y - 7.5d;
            context.DrawRectangle(null, pen, new Rect(x, y, 11d, 15d));
            context.DrawLine(pen, new Point(x + 7d, y), new Point(x + 7d, y + 4d));
            context.DrawLine(pen, new Point(x + 7d, y + 4d), new Point(x + 11d, y + 4d));
            for (var i = 0; i < 3; i++)
            {
                var line = y + 8d + i * 3d;
                context.DrawLine(pen, new Point(x + 2.5d, line),
                    new Point(x + (i == 2 ? 6d : 8.5d), line));
            }
        }

        /// <summary>The Print button's icon: the sheet going in at the top, the body of the printer, and the
        /// page coming out below — plus its little lamp.</summary>
        private static void DrawPrintIcon(DrawingContext context, Rect button, IBrush ink)
        {
            var pen = new Pen(ink, 1.2d);
            var x = button.Center.X - 7d;
            var y = button.Center.Y - 7d;
            context.DrawRectangle(null, pen, new Rect(x + 2.5d, y, 9d, 5d));
            context.DrawRectangle(null, pen, new Rect(x, y + 4.5d, 14d, 6d));
            context.DrawRectangle(null, pen, new Rect(x + 3d, y + 10d, 8d, 4.5d));
            context.FillRectangle(ink, new Rect(x + 10.5d, y + 6d, 2d, 2d));
        }

        // ---- the macro list a '=' opens ---------------------------------------------------------------
        //
        // "=" is the one moment the sheet knows a FORMULA is wanted rather than a value, which makes it the
        // right moment to offer the names. The list filters as more letters arrive; the pick lands in the fx
        // box, with the cells that were selected already written in as the range. So the common case —
        // select B2:B9, type "=su", press Enter — arrives complete, and the caret waits between the brackets
        // when there was nothing to fill in.

        /// <summary>One macro the list offers.</summary>
        private sealed class SheetMacro
        {
            /// <summary>The name typed after '=', exactly as the parser dispatches it.</summary>
            public string Name = string.Empty;

            /// <summary>What it does, in a few words — drawn beside the name.</summary>
            public string Hint = string.Empty;

            /// <summary>Whether the selected cells are offered to it as a range: true for the readings
            /// (Sum, Avg, StdDev …), false for the ones that take a plain value or a text.</summary>
            public bool TakesRange;
        }

        /// <summary>
        /// Every macro the parser knows, in the order the list shows them: the readings a sheet is usually
        /// asked for first, then the rest. EVERY name here is one <c>Apply</c> dispatches, which a test
        /// compares — so the list can never offer something the engine cannot do.
        /// </summary>
        private static readonly SheetMacro[] Macros = new[]
        {
            new SheetMacro { Name = "Sum", Hint = "the total of a range", TakesRange = true },
            new SheetMacro { Name = "Avg", Hint = "the average (Average works too)", TakesRange = true },
            new SheetMacro { Name = "StdDev", Hint = "sample standard deviation (n-1)", TakesRange = true },
            new SheetMacro { Name = "StdDevP", Hint = "population standard deviation (n)", TakesRange = true },
            new SheetMacro { Name = "Max", Hint = "the largest number", TakesRange = true },
            new SheetMacro { Name = "Min", Hint = "the smallest number", TakesRange = true },
            new SheetMacro { Name = "Count", Hint = "how many cells hold a number", TakesRange = true },
            new SheetMacro { Name = "CountA", Hint = "how many cells are not empty", TakesRange = true },
            new SheetMacro { Name = "Abs", Hint = "a number without its sign" },
            new SheetMacro { Name = "Round", Hint = "Round(number, places)" },
            new SheetMacro { Name = "Int", Hint = "rounds down to a whole number" },
            new SheetMacro { Name = "Sqrt", Hint = "the square root" },
            new SheetMacro { Name = "Mod", Hint = "the remainder: Mod(number, divisor)" },
            new SheetMacro { Name = "If", Hint = "If(condition, then, else)" },
            new SheetMacro { Name = "And", Hint = "true when every condition is" },
            new SheetMacro { Name = "Or", Hint = "true when any condition is" },
            new SheetMacro { Name = "Not", Hint = "the opposite of a condition" },
            new SheetMacro { Name = "Len", Hint = "how many characters" },
            new SheetMacro { Name = "Upper", Hint = "the text in capitals" },
            new SheetMacro { Name = "Lower", Hint = "the text in small letters" },
            new SheetMacro { Name = "Trim", Hint = "the text without spaces at the ends" }
        };

        /// <summary>
        /// Shows, hides or refilters the macro list for what is being typed. Called after EVERY change to
        /// the editor's text — and after a caret move, because where the '=' is depends on where the caret
        /// is.
        /// </summary>
        private void UpdateMacroPopup()
        {
            if (!_editing || !AllowEditing)
            {
                CloseMacroPopup();
                return;
            }

            // The '=' nearest the caret, at or before it: everything after it is the macro being typed.
            var caret = Math.Min(_caret, _editText.Length);
            var start = -1;
            for (var i = caret - 1; i >= 0; i--)
            {
                if (_editText[i] == '=')
                {
                    start = i;
                    break;
                }
            }

            if (start < 0)
            {
                CloseMacroPopup();
                return;
            }

            var typed = _editText.Substring(start + 1, caret - start - 1).Trim();
            if (typed.IndexOf('(') >= 0 || typed.IndexOf(')') >= 0)
            {
                CloseMacroPopup();              // a finished call: there is nothing left to offer
                return;
            }

            var items = BuildMacroItems(typed);
            if (items.Count == 0)
            {
                CloseMacroPopup();
                return;
            }

            _macroStart = start;
            var anchor = MacroAnchor();
            OpenMenu(MenuKind.Macro, FitMacroItems(items, anchor), anchor, MacroMenuWidth);
        }

        /// <summary>Where the list hangs: under the fx box when the edit is up there, else under the cell
        /// being edited — the two places a formula can be typed.</summary>
        private Point MacroAnchor()
        {
            var size = Bounds.Size;
            if (_barFocused)
            {
                var input = BarInputRect(size);
                return new Point(input.X + 22, input.Bottom + 2);
            }

            var cell = CellRect(_activeRow, _activeColumn);
            return new Point(cell.X, cell.Bottom + 2);
        }

        /// <summary>Hides the macro list without touching the edit — and only a list that is actually
        /// showing is closed, so this is safe to call from anywhere.</summary>
        private void CloseMacroPopup()
        {
            if (_menuOpen && _menuKind == MenuKind.Macro)
            {
                CloseContextMenu();             // which clears _macroStart with it
                return;
            }

            _macroStart = -1;
        }

        /// <summary>
        /// Puts the chosen macro into the fx box, ready to edit — a formula of any length belongs up there,
        /// where it can be read and corrected. The cells selected when it was chosen become the range, so
        /// the caret waits after the closing bracket; with a single cell selected it waits BETWEEN the
        /// brackets, which is the case the list exists for.
        /// </summary>
        private void AcceptMacro(SheetMacro macro)
        {
            var start = _macroStart >= 0 && _macroStart <= _editText.Length ? _macroStart : 0;
            var caret = Math.Min(_caret, _editText.Length);
            var head = _editText.Substring(0, start);
            var tail = _editText.Substring(caret);
            var range = macro.TakesRange ? SelectedRangeText() : string.Empty;
            var call = "=" + macro.Name + "(" + range + ")";
            _editText = head + call + tail;
            _caret = head.Length + call.Length - (range.Length > 0 ? 1 : 0);
            _macroStart = -1;
            _menuOpen = false;                  // the list closes; the EDIT carries on
            _menuHot = -1;
            _editing = true;
            _barFocused = true;                 // and the formula is edited in the box from here on
            _editIsNew = false;
            InvalidateVisual();
        }

        /// <summary>The selection as a range ("B2:B9"), or empty when there is nothing to offer. A whole
        /// column or row becomes the range it covers, so clicking a column and typing "=sum" fills the whole
        /// column in. When the selection is a single cell the LAST BLOCK that was selected is used instead,
        /// because that is the order a total is written in — select the figures, click where the total goes,
        /// type the formula — and a formula committed into the block it reads could only be #CYCLE!. The
        /// colon is what a range is WRITTEN with (Excel's spelling, and what this list writes); the older
        /// two-dot form still READS, so a formula typed before this stays exactly as it was.</summary>
        private string SelectedRangeText()
        {
            var firstRow = SelectionFirstRow();
            var lastRow = SelectionLastRow();
            var firstColumn = SelectionFirstColumn();
            var lastColumn = SelectionLastColumn();
            if (firstRow == lastRow && firstColumn == lastColumn)
            {
                firstRow = _rangeFirstRow;
                firstColumn = _rangeFirstColumn;
                lastRow = _rangeLastRow;
                lastColumn = _rangeLastColumn;
            }

            if (lastRow < firstRow || lastColumn < firstColumn)
            {
                return string.Empty;
            }

            if (firstRow == lastRow && firstColumn == lastColumn)
            {
                return string.Empty;                    // one cell: leave the brackets for the user
            }

            return CellName(firstRow, firstColumn) + ":" + CellName(lastRow, lastColumn);
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

            /// <summary>A few words about it, drawn dimmed at the right of the line — what the macro list
            /// uses to say what each function is for.</summary>
            public string Hint = string.Empty;

            /// <summary>False greys the line out and makes it unchoosable: a heading, or a command this
            /// machine cannot do (Print… with nothing to print through).</summary>
            public bool Enabled = true;

            /// <summary>A WARNING rather than a command — the lines the print-area warning is made of. Drawn
            /// in the warning colour and never choosable, whatever <see cref="Enabled"/> happens to be.</summary>
            public bool Warning;

            /// <summary>What choosing it does.</summary>
            public Action? Run;
        }

        /// <summary>The ink a warning line is drawn in — the one colour in this file that is deliberately NOT
        /// part of the sheet's palette, because a warning has to read as one whatever theme the form uses.</summary>
        private static readonly Color WarningColor = Color.Parse("#B3261E");

        /// <summary>Which of the things a menu can be: the right-click menu, a toolbar button's menu, the
        /// macro list a '=' opens, the print-area warning, or the page question. They share the drawing, the
        /// hover and the keys; the kind is what tells Tab (and the painters) which one is showing.</summary>
        private enum MenuKind { Context, Toolbar, Macro, Warning, Setup }

        /// <summary>How wide the menu is, and how tall one of its lines is.</summary>
        private const double MenuWidth = 200d;
        private const double MenuItemHeight = 24d;
        private const double MenuSeparatorHeight = 9d;
        private const double MenuPad = 5d;

        /// <summary>The macro list is wider than a command menu: it draws each function's syntax as well
        /// as its name, and a name with no room for its hint is just a name.</summary>
        private const double MacroMenuWidth = 300d;

        private List<SheetMenuItem> _menuItems = new List<SheetMenuItem>();
        private MenuKind _menuKind = MenuKind.Context;
        private double _menuWidth = MenuWidth;
        private bool _menuOpen;
        private double _menuX;
        private double _menuY;
        private int _menuHot = -1;

        /// <summary>Where in the editor text the '=' that opened the macro list sits, or -1.</summary>
        private int _macroStart = -1;

        // The last BLOCK that was selected, kept because of the order a total is usually written in: pick
        // the column of figures, then click the cell the total goes in, then type "=sum". By then the block
        // is no longer selected, so without this the formula would arrive empty — and a formula committed
        // INTO the block it reads can only ever be #CYCLE!.
        private int _rangeFirstRow;
        private int _rangeFirstColumn;
        private int _rangeLastRow;
        private int _rangeLastColumn;

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

        /// <summary>The File menu: Load… and Save…, both .xlsx — the format the charts read and every
        /// spreadsheet writes. Both are disabled while a dialog is already open.</summary>
        private List<SheetMenuItem> BuildFileItems()
        {
            var busy = _fileBusy;
            var items = new List<SheetMenuItem>();
            items.Add(new SheetMenuItem
            {
                Label = "Load…",
                Hint = "a workbook, one page at a time",
                Enabled = !busy,
                Run = () => _ = BrowseForWorkbookAsync()
            });
            items.Add(new SheetMenuItem { IsSeparator = true });
            items.Add(new SheetMenuItem
            {
                Label = "Save…",
                Hint = "this sheet as .xlsx",
                Enabled = !busy,
                Run = () => _ = SaveAsWorkbookAsync()
            });
            return items;
        }

        /// <summary>
        /// The Print menu: what can be produced from here. Saving the sheet as a PICTURE needs nothing but
        /// Avalonia, so that entry is always there; the PDF and the printer live behind PRINT_SUPPORT, the
        /// symbol a project gets when the print packages are wired into it (see GrumpyPrint).
        ///
        /// All three produce a PAGE, and a page is the PRINT AREA — the selected cells — so none of them
        /// goes through the methods directly: they ask <see cref="RequestPrint"/>, which is what warns when
        /// nothing but a single cell is selected.
        /// </summary>
        private List<SheetMenuItem> BuildPrintItems()
        {
            var items = new List<SheetMenuItem>();
            items.Add(new SheetMenuItem
            {
                Label = "Save as PNG…",
                Hint = "the print area as a picture",
                Enabled = !_fileBusy,
                Run = () => RequestPrint(SheetPrintKind.Picture)
            });
#if PRINT_SUPPORT
            items.Add(new SheetMenuItem
            {
                Label = "Save as PDF…",
                Hint = "the print area as a page",
                Enabled = !_fileBusy,
                Run = () => RequestPrint(SheetPrintKind.Pdf)
            });
            items.Add(new SheetMenuItem { IsSeparator = true });
            items.Add(new SheetMenuItem
            {
                Label = "Print…",
                Hint = CanPrint ? "the print area, on paper" : "nothing here can print",
                Enabled = CanPrint && !_fileBusy,
                Run = () => RequestPrint(SheetPrintKind.Printer)
            });
#else
            items.Add(new SheetMenuItem { IsSeparator = true });
            // Disabled rather than LEFT OUT, with the reason on the row: a missing entry reads as a broken
            // menu — the complaint the charts' Print… row answered when they grew one.
            items.Add(new SheetMenuItem { Label = "Print… (needs print support)", Enabled = false });
#endif
            return items;
        }

        /// <summary>The page list Load… shows when a workbook holds more than one page: a heading that says
        /// only one page at a time is loaded, then every page by name.</summary>
        private List<SheetMenuItem> BuildPageItems(string path, List<string> pages)
        {
            var items = new List<SheetMenuItem>();
            items.Add(new SheetMenuItem { Label = "One page is loaded at a time:", Enabled = false });
            for (var i = 0; i < pages.Count; i++)
            {
                var chosen = pages[i];
                items.Add(new SheetMenuItem
                {
                    Label = chosen.Length == 0 ? "(unnamed page)" : chosen,
                    Hint = i == 0 ? "the first page" : string.Empty,
                    Run = () => LoadPage(path, chosen)
                });
            }

            return items;
        }

        /// <summary>The macro list: every function the parser knows whose name starts with what has been
        /// typed — or, when none does, the ones that merely contain it, so "dev" still finds StdDev.</summary>
        private List<SheetMenuItem> BuildMacroItems(string typed)
        {
            var wanted = new List<SheetMacro>();
            for (var i = 0; i < Macros.Length; i++)
            {
                if (typed.Length == 0 || Macros[i].Name.StartsWith(typed, StringComparison.OrdinalIgnoreCase))
                {
                    wanted.Add(Macros[i]);
                }
            }

            if (wanted.Count == 0 && typed.Length > 0)
            {
                for (var i = 0; i < Macros.Length; i++)
                {
                    if (Macros[i].Name.IndexOf(typed, StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        wanted.Add(Macros[i]);
                    }
                }
            }

            var items = new List<SheetMenuItem>();
            for (var i = 0; i < wanted.Count; i++)
            {
                var macro = wanted[i];
                items.Add(new SheetMenuItem
                {
                    Label = macro.Name,
                    Hint = macro.Hint,
                    Run = () => AcceptMacro(macro)
                });
            }

            return items;
        }

        /// <summary>Opens a menu of items at a point, kept inside the control. The context menu has its own
        /// opener — it moves the selection onto what was right-clicked first — and everything else comes
        /// through here.</summary>
        private void OpenMenu(MenuKind kind, List<SheetMenuItem> items, Point point, double width)
        {
            _menuItems = items;
            _menuKind = kind;
            _menuWidth = width;
            _menuOpen = true;
            _menuHot = FirstEnabled(items);
            var size = Bounds.Size;
            var height = MenuRect().Height;
            _menuX = Math.Max(0, Math.Min(point.X, size.Width - width));
            _menuY = Math.Max(0, point.Y);
            if (_menuY + height > size.Height && height <= size.Height)
            {
                // Flip up rather than run off the bottom — but only when it FITS somewhere. A list taller
                // than the whole control stays where it is and is clipped instead: jumping to the top would
                // take it away from the cell being typed in, which is where the eye is.
                _menuY = Math.Max(0, size.Height - height);
            }

            InvalidateVisual();
        }

        /// <summary>
        /// The macro list trimmed to the rows that actually fit under the anchor, so it hangs where the user
        /// is typing. When something was left out the last line says so — a list that silently ends before
        /// Sqrt reads as a list without a Sqrt in it.
        /// </summary>
        private List<SheetMenuItem> FitMacroItems(List<SheetMenuItem> items, Point anchor)
        {
            var room = Bounds.Height - anchor.Y - 6d;
            var rows = (int)Math.Floor(room / MenuItemHeight);
            if (rows < 5)
            {
                rows = 5;
            }

            if (items.Count <= rows)
            {
                return items;
            }

            var fitted = new List<SheetMenuItem>();
            for (var i = 0; i < rows - 1 && i < items.Count; i++)
            {
                fitted.Add(items[i]);
            }

            fitted.Add(new SheetMenuItem
            {
                Label = "\u2026 type more letters to narrow the list",
                Enabled = false
            });
            return fitted;
        }

        /// <summary>The first line that can actually be chosen, or -1 — the page list opens with a heading
        /// that cannot be, so the highlight starts on the page below it.</summary>
        private static int FirstEnabled(List<SheetMenuItem> items)
        {
            for (var i = 0; i < items.Count; i++)
            {
                if (!items[i].IsSeparator && items[i].Enabled)
                {
                    return i;
                }
            }

            return -1;
        }

        /// <summary>Opens a toolbar button's menu just under it.</summary>
        private void OpenToolbarMenu(int button)
        {
            if (button < 0 || button >= ToolbarButtonCount)
            {
                return;
            }

            var items = button == ToolbarFile ? BuildFileItems() : BuildPrintItems();
            OpenMenu(MenuKind.Toolbar, items, new Point(ToolbarButtonRect(button).X, ToolbarHeight + 1d), MenuWidth);
        }

        /// <summary>Loads one page of a workbook that has already been picked.</summary>
        private void LoadPage(string path, string page)
        {
            LoadWorkbook(path, page);
            Refresh();
        }

        /// <summary>The menu's rectangle on the canvas, which is only meaningful while it is open.</summary>
        private Rect MenuRect()
        {
            var height = 2 * MenuPad;
            for (var i = 0; i < _menuItems.Count; i++)
            {
                height += _menuItems[i].IsSeparator ? MenuSeparatorHeight : MenuItemHeight;
            }

            return new Rect(_menuX, _menuY, _menuWidth, height);
        }

        /// <summary>Which line of the menu a point is on, or -1. Separators and greyed-out lines are not
        /// selectable, so they answer -1 and a click on one does nothing.</summary>
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
                if (!item.IsSeparator && !item.Warning && item.Enabled && point.Y >= y && point.Y < y + height)
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
            _menuKind = MenuKind.Context;
            _menuWidth = MenuWidth;
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
            _macroStart = -1;               // any menu closing ends the macro list's claim on the text
            InvalidateVisual();
        }

        /// <summary>Runs the line a point is on, if any, and closes. True when the click was the menu's.</summary>
        private bool ChooseMenuItem(Point point)
        {
            var index = MenuItemAt(point);
            if (index < 0 && OnWarningLine(point))
            {
                // A click on the WARNING text itself. It is not a command, and closing on it would read as a
                // silent abort for a click that never meant one.
                return true;
            }

            var run = index >= 0 ? _menuItems[index].Run : null;
            CloseContextMenu();
            if (run != null)
            {
                run();
            }

            return true;
        }

        /// <summary>True when a point is on one of the menu's WARNING lines — the text above the choices, which
        /// says what is about to happen and is not itself clickable.</summary>
        private bool OnWarningLine(Point point)
        {
            if (!_menuOpen || point.X < _menuX || point.X > _menuX + _menuWidth)
            {
                return false;
            }

            var y = _menuY + MenuPad;
            for (var i = 0; i < _menuItems.Count; i++)
            {
                var item = _menuItems[i];
                var height = item.IsSeparator ? MenuSeparatorHeight : MenuItemHeight;
                if (item.Warning && point.Y >= y && point.Y < y + height)
                {
                    return true;
                }

                y += height;
            }

            return false;
        }

        /// <summary>Paints the menu over everything else — whichever kind it is: the right-click menu, a
        /// toolbar button's menu, or the macro list. A greyed-out line is drawn dimmed and cannot be
        /// chosen; a line with a hint draws it at the right.</summary>
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
            var dim = new SolidColorBrush(Color.FromArgb(140, TextColor.R, TextColor.G, TextColor.B));
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

                var ink = item.Warning ? new SolidColorBrush(WarningColor) : (item.Enabled ? text : dim);
                if (i == _menuHot && item.Enabled)
                {
                    context.FillRectangle(hot, new Rect(_menuX + 1, y, _menuWidth - 2, MenuItemHeight));
                }

                if (item.Ticked)
                {
                    DrawCellText(context, "\u2713", new Rect(_menuX + 1, y, 15, MenuItemHeight), ink, false,
                        TextAlignment.Center);
                }

                var labelWidth = _menuWidth - 22;
                if (item.Hint.Length > 0)
                {
                    var hintWidth = _menuWidth * 0.5;
                    DrawCellText(context, item.Hint,
                        new Rect(_menuX + _menuWidth - hintWidth - 8, y, hintWidth, MenuItemHeight), dim,
                        false, TextAlignment.Right, -1, null, Math.Max(9d, FontSize - 1d));
                    labelWidth = _menuWidth - hintWidth - 26;
                }

                DrawCellText(context, item.Label, new Rect(_menuX + 17, y, labelWidth, MenuItemHeight),
                    ink, false, TextAlignment.Left);
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

        /// <summary>The menu's own keys: Escape closes, Up/Down move the highlight, Enter chooses, and Tab
        /// chooses too in the macro list (where Tab would otherwise commit the cell and lose the list).</summary>
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

                    if (!_menuItems[at].IsSeparator && _menuItems[at].Enabled)
                    {
                        break;
                    }
                }

                _menuHot = at;
                InvalidateVisual();
                return true;
            }

            var choose = e.Key == Key.Enter || (e.Key == Key.Tab && _menuKind == MenuKind.Macro);
            if (choose && _menuHot >= 0 && _menuHot < _menuItems.Count && _menuItems[_menuHot].Enabled)
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

            // A toolbar button first: it sits above everything else, and a press on one opens its menu
            // rather than starting a selection in the cell that happens to be underneath.
            var button = ToolbarButtonAt(point.Position);
            if (button >= 0)
            {
                Focus();
                OpenToolbarMenu(button);
                e.Handled = true;
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

            // The toolbar's own hover: which button is lit, and its word beside it. When the pointer is up
            // in the strip the rest of this method has nothing to say, so it stops here.
            if (ShowToolbar)
            {
                var over = ToolbarButtonAt(point);
                if (over != _toolbarHot)
                {
                    _toolbarHot = over;
                    InvalidateVisual();
                }

                if (over >= 0)
                {
                    return;
                }
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
            // Editing a cell that already holds a formula shows the list for what is there, so "=Su" can be
            // finished from the keyboard without remembering the rest of the name.
            UpdateMacroPopup();
            InvalidateVisual();
        }

        /// <summary>True when the fill drag is aiming somewhere it could actually fill — down, right, up or
        /// left, since the same maths runs either way.</summary>
        private bool HasFillTarget()
        {
            return _draggingFill &&
                   (_fillRow > SelectionLastRow() || _fillColumn > SelectionLastColumn() ||
                    _fillRow < SelectionFirstRow() || _fillColumn < SelectionFirstColumn());
        }

        /// <summary>The block the fill would write, for the dashed preview — in whichever direction it is
        /// being dragged, so the box drawn is the box filled.</summary>
        private Rect PreviewRect()
        {
            var firstRow = Math.Min(_fillRow, SelectionFirstRow());
            var firstColumn = Math.Min(_fillColumn, SelectionFirstColumn());
            var lastRow = Math.Max(_fillRow, SelectionLastRow());
            var lastColumn = Math.Max(_fillColumn, SelectionLastColumn());
            var first = CellRect(firstRow, firstColumn);
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

                UpdateMacroPopup();             // where the caret is decides which '=' is being typed after
                InvalidateVisual();
                return true;
            }

            if (e.Key == Key.Right)
            {
                if (_caret < _editText.Length)
                {
                    _caret++;
                }

                UpdateMacroPopup();
                InvalidateVisual();
                return true;
            }

            if (e.Key == Key.Home)
            {
                _caret = 0;
                UpdateMacroPopup();
                InvalidateVisual();
                return true;
            }

            if (e.Key == Key.End)
            {
                _caret = _editText.Length;
                UpdateMacroPopup();
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

                UpdateMacroPopup();
                InvalidateVisual();
                return true;
            }

            if (e.Key == Key.Delete)
            {
                if (_caret < _editText.Length)
                {
                    _editText = _editText.Substring(0, _caret) + _editText.Substring(_caret + 1);
                }

                UpdateMacroPopup();
                InvalidateVisual();
                return true;
            }

            if (control && e.Key == Key.A)
            {
                _editText = string.Empty;
                _caret = 0;
                UpdateMacroPopup();
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
            // A '=' typed anywhere opens the macro list; any other letter refilters it.
            UpdateMacroPopup();
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
            CloseMacroPopup();

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

        /// <summary>
        /// Writes the fill into the area the handle was dragged over — in any of the four directions.
        ///
        /// PER CELL, from the cell that destination copies: a FORMULA is the source's formula with every
        /// relative address moved by the distance between the two cells (so =Sum(B2..B9) dragged one row
        /// down reads =Sum(B3..B10), and a $ holds a part still), while anything else keeps the series
        /// prediction it has always had — 1, 2 becomes 3, 4 …, Item1, Item2 becomes Item3, and a pattern
        /// repeats. That split is what makes a column of totals beside a column of figures fill sensibly in
        /// one gesture.
        /// </summary>
        private void ApplyFill()
        {
            var firstRow = SelectionFirstRow();
            var firstColumn = SelectionFirstColumn();
            var lastRow = SelectionLastRow();
            var lastColumn = SelectionLastColumn();

            // DOWN or UP: one pass per column of the source block.
            if (_fillRow > lastRow || _fillRow < firstRow)
            {
                var down = _fillRow > lastRow;
                var count = down ? _fillRow - lastRow : firstRow - _fillRow;
                var firstTarget = down ? lastRow + 1 : _fillRow;
                var height = _fillSourceLastRow - _fillSourceFirstRow + 1;
                for (var column = _fillSourceFirstColumn; column <= _fillSourceLastColumn; column++)
                {
                    var source = ReadColumn(column, _fillSourceFirstRow, _fillSourceLastRow);
                    var written = PredictSeries(source, count, down ? 1 : -1);
                    for (var i = 0; i < written.Length; i++)
                    {
                        var row = firstTarget + i;
                        var baseRow = _fillSourceFirstRow + i % height;
                        var baseText = GetCell(baseRow, column);
                        var value = baseText.Length > 0 && baseText[0] == '='
                            ? "=" + ShiftFormula(baseText.Substring(1), row - baseRow, 0)
                            : written[i];
                        SetCell(row, column, value);
                    }
                }

                SelectRange(Math.Min(firstRow, _fillRow), firstColumn, Math.Max(lastRow, _fillRow), lastColumn);
                return;
            }

            // RIGHT or LEFT: the same, one pass per row.
            if (_fillColumn > lastColumn || _fillColumn < firstColumn)
            {
                var right = _fillColumn > lastColumn;
                var count = right ? _fillColumn - lastColumn : firstColumn - _fillColumn;
                var firstTarget = right ? lastColumn + 1 : _fillColumn;
                var width = _fillSourceLastColumn - _fillSourceFirstColumn + 1;
                for (var row = _fillSourceFirstRow; row <= _fillSourceLastRow; row++)
                {
                    var source = ReadRow(row, _fillSourceFirstColumn, _fillSourceLastColumn);
                    var written = PredictSeries(source, count, right ? 1 : -1);
                    for (var i = 0; i < written.Length; i++)
                    {
                        var column = firstTarget + i;
                        var baseColumn = _fillSourceFirstColumn + i % width;
                        var baseText = GetCell(row, baseColumn);
                        var value = baseText.Length > 0 && baseText[0] == '='
                            ? "=" + ShiftFormula(baseText.Substring(1), 0, column - baseColumn)
                            : written[i];
                        SetCell(row, column, value);
                    }
                }

                SelectRange(firstRow, Math.Min(firstColumn, _fillColumn), lastRow, Math.Max(lastColumn, _fillColumn));
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
        /// Works out what the next values should be, from the ones it was given: a run of numbers continues
        /// by its step (1, 2 becomes 3, 4 …; 2, 4 becomes 6, 8 …), a single number counts up by one,
        /// "Item1, Item2" becomes "Item3", and anything else repeats the pattern cyclically.
        ///
        /// <paramref name="direction"/> is 1 when the fill was dragged forwards (down or right) and -1 when
        /// it was dragged backwards (up or left): the same step, extended the other way — 3, 4 filled
        /// upwards becomes 1, 2 — which is what "continue this series" means in both directions.
        /// </summary>
        private static string[] PredictSeries(IReadOnlyList<string> source, int count)
        {
            return PredictSeries(source, count, 1);
        }

        private static string[] PredictSeries(IReadOnlyList<string> source, int count, int direction)
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

            // How far the destination sits from the block's FIRST value: +1 is the value after a one-cell
            // block, -1 the value before it, and so on for the whole run.
            var distance = new int[written.Length];
            for (var i = 0; i < written.Length; i++)
            {
                distance[i] = direction > 0 ? source.Count + i : i - count;
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
                    var first = numbers[0];
                    for (var i = 0; i < written.Length; i++)
                    {
                        written[i] = FormatNumber(first + step * distance[i], decimals);
                    }

                    return written;
                }
            }

            if (numbers != null && numbers.Count == 1)
            {
                for (var i = 0; i < written.Length; i++)
                {
                    written[i] = FormatNumber(numbers[0] + distance[i], decimals);
                }

                return written;
            }

            string? prefix;
            string? suffix;
            int first1;
            int numberStep;
            if (SplitTrailingNumber(source, out prefix, out suffix, out first1, out numberStep))
            {
                for (var i = 0; i < written.Length; i++)
                {
                    written[i] = prefix + (first1 + numberStep * distance[i]).ToString(CultureInfo.InvariantCulture) + suffix;
                }

                return written;
            }

            for (var i = 0; i < written.Length; i++)
            {
                var index = distance[i] % source.Count;
                if (index < 0)
                {
                    index += source.Count;
                }

                written[i] = source[index];
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

        // ---- formulas -----------------------------------------------------------------------------
        //
        // A cell whose text starts with '=' is a FORMULA. The text is what the user typed and what the fx box
        // and the editor show; the GRID draws what it works out to (ValueOf), so a sheet reads as its results
        // while its formulas stay visible where they are edited — the way every spreadsheet behaves.
        //
        // The dialect is the small, honest subset a result grid needs: the four operators, ^ and &,
        // comparisons, parentheses, A1 references, A1:B3 ranges, and the functions below. What cannot be
        // worked out has a NAME — #VALUE!, #NAME?, #REF!, #DIV/0!, #CYCLE! — rather than drawing blank or
        // throwing, because a form is not a place to crash.

        private const string DivisionByZero = "#DIV/0!";
        private const string ValueError = "#VALUE!";
        private const string NameError = "#NAME?";
        private const string RefError = "#REF!";
        private const string CycleError = "#CYCLE!";

        /// <summary>How deep a formula may nest before it is refused. A hand-typed monster
        /// (=((((… would otherwise recurse until the stack ran out, which takes the whole app down.</summary>
        private const int FormulaMaxDepth = 64;

        /// <summary>A cell's identity as one number, for the two dictionaries above.</summary>
        private static long CellKey(int row, int column)
        {
            return ((long)row << 20) | (uint)column;
        }

        /// <summary>Forgets what every formula worked out. Called whenever any cell's text changes, which
        /// is the only thing a formula result depends on.</summary>
        private void InvalidateValues()
        {
            _values.Clear();
        }

        /// <summary>
        /// What a cell SHOWS: its text, or — for a formula — what it works out to. <see cref="GetCell"/>
        /// still returns the formula itself, which is what the fx box reads and edits.
        /// </summary>
        public string ValueOf(int row, int column)
        {
            var text = GetCell(row, column);
            if (text.Length < 2 || text[0] != '=')
            {
                return text;
            }

            var key = CellKey(row, column);
            if (_values.TryGetValue(key, out var cached))
            {
                return cached;
            }

            var result = EvaluateFormula(row, column, text.Substring(1));
            _values[key] = result;
            return result;
        }

        private string EvaluateFormula(int row, int column, string body)
        {
            var key = CellKey(row, column);
            if (!_evaluating.Add(key))
            {
                return CycleError;              // already being worked out further up: this cell reaches itself
            }

            try
            {
                return FormulaFormat(new FormulaParser(this, row, column, body).Work());
            }
            catch (FormulaError error)
            {
                return error.Code;
            }
            catch (Exception)
            {
                return ValueError;              // a formula must never be able to take the app down
            }
            finally
            {
                _evaluating.Remove(key);
            }
        }

        /// <summary>What a formula is working with: a number, TRUE/FALSE, text, blank, or an error name.</summary>
        private enum FormulaKind { Blank, Number, Bool, Text, Error }

        private readonly struct FormulaValue
        {
            public readonly FormulaKind Kind;
            public readonly double Number;
            public readonly string Text;

            private FormulaValue(FormulaKind kind, double number, string text)
            {
                Kind = kind;
                Number = number;
                Text = text;
            }

            public static FormulaValue Blank
            {
                get { return new FormulaValue(FormulaKind.Blank, 0d, string.Empty); }
            }

            public static FormulaValue Of(double number)
            {
                return new FormulaValue(FormulaKind.Number, number, string.Empty);
            }

            public static FormulaValue Of(bool flag)
            {
                return new FormulaValue(FormulaKind.Bool, flag ? 1d : 0d, string.Empty);
            }

            public static FormulaValue Of(string? text)
            {
                return new FormulaValue(FormulaKind.Text, 0d, text == null ? string.Empty : text!);
            }

            public static FormulaValue Err(string code)
            {
                return new FormulaValue(FormulaKind.Error, 0d, code);
            }
        }

        /// <summary>A formula that cannot be worked out. The code is one of the #… names above.</summary>
        private sealed class FormulaError : Exception
        {
            public FormulaError(string code)
                : base(code)
            {
                Code = code;
            }

            public string Code { get; private set; }
        }

        /// <summary>The text a result is drawn as: a whole number without a decimal point, a fraction with up
        /// to six places, TRUE/FALSE for a comparison, and an error as its own name.</summary>
        private static string FormulaFormat(FormulaValue value)
        {
            switch (value.Kind)
            {
                case FormulaKind.Number:
                    if (double.IsNaN(value.Number) || double.IsInfinity(value.Number))
                    {
                        return ValueError;
                    }

                    var rounded = Math.Round(value.Number, 6);
                    if (Math.Abs(rounded) < 1e-9)
                    {
                        return "0";
                    }

                    if (Math.Abs(rounded - Math.Round(rounded)) < 1e-9)
                    {
                        return Math.Round(rounded).ToString(CultureInfo.InvariantCulture);
                    }

                    return rounded.ToString("0.######", CultureInfo.InvariantCulture);
                case FormulaKind.Bool:
                    return value.Number != 0d ? "TRUE" : "FALSE";
                case FormulaKind.Error:
                    return value.Text;
                case FormulaKind.Text:
                    return value.Text;
                default:
                    return string.Empty;
            }
        }

        /// <summary>True when a formatted result is one of the error names, so a formula that reads it
        /// hands the error on instead of treating "#DIV/0!" as a word.</summary>
        private static bool IsErrorName(string text)
        {
            return text == DivisionByZero || text == ValueError || text == NameError
                || text == RefError || text == CycleError;
        }

        /// <summary>True when a value takes part in arithmetic on its own (a number, TRUE/FALSE, a blank,
        /// or text that reads as a number). ("IsNumericValue", not "IsNumeric": VB has a built-in of the
        /// latter name, and the twins keep the same member names wherever the language allows it.)</summary>
        private static bool IsNumericValue(FormulaValue value)
        {
            if (value.Kind == FormulaKind.Number || value.Kind == FormulaKind.Bool
                || value.Kind == FormulaKind.Blank)
            {
                return true;
            }

            if (value.Kind == FormulaKind.Error)
            {
                throw new FormulaError(value.Text);
            }

            return double.TryParse(value.Text, NumberStyles.Float, CultureInfo.InvariantCulture, out _);
        }

        /// <summary>A value as a number for arithmetic: blank counts as zero, text that reads as a number
        /// counts as one, and anything else is #VALUE!.</summary>
        private static double Numeric(FormulaValue value)
        {
            if (value.Kind == FormulaKind.Number || value.Kind == FormulaKind.Bool)
            {
                return value.Number;
            }

            if (value.Kind == FormulaKind.Blank)
            {
                return 0d;
            }

            if (value.Kind == FormulaKind.Error)
            {
                throw new FormulaError(value.Text);
            }

            if (double.TryParse(value.Text, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed))
            {
                return parsed;
            }

            throw new FormulaError(ValueError);
        }

        /// <summary>True when a value is a number that is not zero, TRUE/FALSE as themselves, and the words
        /// TRUE/FALSE; anything else is #VALUE! — how IF, AND and OR read their condition.</summary>
        private static bool Truthy(FormulaValue value)
        {
            if (value.Kind == FormulaKind.Number || value.Kind == FormulaKind.Bool)
            {
                return value.Number != 0d;
            }

            if (value.Kind == FormulaKind.Blank)
            {
                return false;
            }

            if (value.Kind == FormulaKind.Error)
            {
                throw new FormulaError(value.Text);
            }

            var text = value.Text.Trim();
            if (string.Equals(text, "TRUE", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            if (string.Equals(text, "FALSE", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            throw new FormulaError(ValueError);
        }

        /// <summary>A referenced cell's value: blank for an empty cell, its TEXT for a literal one, and for a
        /// formula cell what it worked out to (handing on its error if it has one).</summary>
        private FormulaValue Reference(int row, int column)
        {
            if (row < 1 || column < 1 || row > RowCount || column > ColumnCount)
            {
                throw new FormulaError(RefError);
            }

            var text = GetCell(row, column);
            if (text.Length == 0)
            {
                return FormulaValue.Blank;
            }

            if (text[0] == '=')
            {
                var shown = ValueOf(row, column);
                return IsErrorName(shown) ? FormulaValue.Err(shown) : FormulaValue.Of(shown);
            }

            return FormulaValue.Of(text);
        }

        /// <summary>Reads "A1" / "$A$1" at an offset in a formula. Bounds are NOT checked here — the caller
        /// decides (a reference off the sheet is #REF!, a range is clipped to the sheet).</summary>
        internal static bool TryReadAddress(string text, int at, out int row, out int column, out int used)
        {
            bool ignored1;
            bool ignored2;
            return TryReadAnchoredAddress(text, at, out row, out column, out used, out ignored1, out ignored2);
        }

        /// <summary>
        /// An address, with which parts of it were ANCHORED with a $ — what a copied formula needs to know
        /// and what the evaluator can ignore. $B$2 is fixed in both directions, B$2 keeps its row and $B2
        /// its column; a bare B2 moves with the copy, which is the whole point of a dollar sign.
        /// </summary>
        internal static bool TryReadAnchoredAddress(string text, int at, out int row, out int column,
            out int used, out bool rowFixed, out bool columnFixed)
        {
            row = 0;
            column = 0;
            used = 0;
            rowFixed = false;
            columnFixed = false;
            var index = at;
            while (index < text.Length && text[index] == '$')
            {
                index++;
            }

            var letters = 0;
            var column1 = 0;
            while (index < text.Length)
            {
                var c = text[index];
                var upper = c >= 'a' && c <= 'z' ? (char)(c - 32) : c;
                if (upper < 'A' || upper > 'Z')
                {
                    break;
                }

                column1 = column1 * 26 + (upper - 'A' + 1);
                letters++;
                index++;
            }

            var dollars = 0;
            while (index < text.Length && text[index] == '$')
            {
                dollars++;
                index++;
            }

            var digits = 0;
            var row1 = 0;
            while (index < text.Length && text[index] >= '0' && text[index] <= '9')
            {
                var digit = text[index] - '0';
                if (row1 > 10000000)
                {
                    return false;
                }

                row1 = row1 * 10 + digit;
                digits++;
                index++;
            }

            if (letters < 1 || letters > 3 || digits < 1 || digits > 7)
            {
                return false;
            }

            used = index - at;
            row = row1;
            column = column1;
            // A $ before the letters anchors the COLUMN, one before the digits anchors the ROW.
            columnFixed = text[at] == '$';
            rowFixed = dollars > 0;
            return row > 0 && column > 0;
        }

        /// <summary>
        /// A formula body with every RELATIVE reference moved by a fill's offset — what a formula MEANS in
        /// its new home. Anchors do not move ($B$2 never does, B$2 keeps its row, $B2 its column), and a
        /// reference that would land off the sheet becomes #REF! in the text: the one answer that tells the
        /// truth about a cell that now points at nothing (what every other spreadsheet writes).
        ///
        /// Only whole addresses move. Text is never touched — a formula holding "A1" is QUOTING it — and
        /// neither is a function name, because TryReadAnchoredAddress needs a letter run AND a digit run, and
        /// a name that is followed by an opening bracket is not an address either.
        /// </summary>
        internal static string ShiftFormula(string body, int rowDelta, int columnDelta)
        {
            if (rowDelta == 0 && columnDelta == 0)
            {
                return body;
            }

            var builder = new System.Text.StringBuilder(body.Length + 8);
            var i = 0;
            while (i < body.Length)
            {
                var c = body[i];
                if (c == '"')
                {
                    // A string literal, copied exactly — doubled quotes and all, the way the parser reads it.
                    var start = i;
                    i++;
                    while (i < body.Length)
                    {
                        if (body[i] == '"')
                        {
                            if (i + 1 < body.Length && body[i + 1] == '"')
                            {
                                i += 2;
                                continue;
                            }

                            i++;
                            break;
                        }

                        i++;
                    }

                    builder.Append(body.Substring(start, i - start));
                    continue;
                }

                int row;
                int column;
                int used;
                bool rowFixed;
                bool columnFixed;
                if (TryReadAnchoredAddress(body, i, out row, out column, out used, out rowFixed, out columnFixed)
                    && WholeToken(body, i, used))
                {
                    var movedRow = rowFixed ? row : row + rowDelta;
                    var movedColumn = columnFixed ? column : column + columnDelta;
                    if (movedRow < 1 || movedColumn < 1)
                    {
                        builder.Append(RefError);
                    }
                    else
                    {
                        builder.Append(columnFixed ? "$" : string.Empty).Append(ColumnName(movedColumn))
                            .Append(rowFixed ? "$" : string.Empty)
                            .Append(movedRow.ToString(CultureInfo.InvariantCulture));
                    }

                    i += used;
                    continue;
                }

                builder.Append(c);
                i++;
            }

            return builder.ToString();
        }

        /// <summary>True when the address at <paramref name="at"/> stands alone: nothing that could make it
        /// part of a longer name touches it, so a name like A1B is left as the name it is. A DOT is a
        /// boundary when it is one of the two that spell a range (A1..B2) and not when it continues a name.</summary>
        private static bool WholeToken(string text, int at, int used)
        {
            if (at > 0 && IsNameChar(text[at - 1]))
            {
                return false;
            }

            if (at + used >= text.Length)
            {
                return true;
            }

            var next = text[at + used];
            if (IsNameChar(next))
            {
                return false;
            }

            return next != '.' || (at + used + 1 < text.Length && text[at + used + 1] == '.');
        }

        private static bool IsNameChar(char c)
        {
            return char.IsLetterOrDigit(c) || c == '_';
        }

        /// <summary>
        /// Reads a formula: the four operators, ^ and &amp;, comparisons, parentheses, "text", A1 references,
        /// A1:B3 ranges and the function set. Left to right, one pass, throwing <see cref="FormulaError"/>
        /// with the name the cell should show.
        /// </summary>
        private sealed class FormulaParser
        {
            private readonly GrumpySheet _sheet;
            private readonly int _row;
            private readonly int _column;
            private readonly string _text;
            private int _at;
            private int _depth;

            public FormulaParser(GrumpySheet sheet, int row, int column, string text)
            {
                _sheet = sheet;
                _row = row;
                _column = column;
                _text = text;
            }

            /// <summary>Works the whole formula out. Anything left over at the end is a typo, not a value.</summary>
            public FormulaValue Work()
            {
                var value = Comparison();
                SkipSpaces();
                if (_at != _text.Length)
                {
                    throw new FormulaError(ValueError);
                }

                return value;
            }

            // ---- the expression ladder -------------------------------------------------------------

            private FormulaValue Comparison()
            {
                var left = Concat();
                var op = ComparisonOperator();
                if (op.Length == 0)
                {
                    return left;
                }

                return FormulaValue.Of(Compare(left, Concat(), op));
            }

            private string ComparisonOperator()
            {
                SkipSpaces();
                var c = Peek();
                if (c == '=')
                {
                    _at++;
                    return "=";
                }

                if (c != '<' && c != '>')
                {
                    return string.Empty;
                }

                _at++;
                var next = Peek();
                if (next == '=')
                {
                    _at++;
                    return c == '<' ? "<=" : ">=";
                }

                if (c == '<' && next == '>')
                {
                    _at++;
                    return "<>";
                }

                return c == '<' ? "<" : ">";
            }

            private static bool Compare(FormulaValue left, FormulaValue right, string op)
            {
                int sign;
                if (IsNumericValue(left) && IsNumericValue(right))
                {
                    sign = Numeric(left).CompareTo(Numeric(right));
                }
                else
                {
                    var l = left.Kind == FormulaKind.Error ? left.Text : AsText(left);
                    var r = right.Kind == FormulaKind.Error ? right.Text : AsText(right);
                    sign = string.Compare(l, r, StringComparison.OrdinalIgnoreCase);
                }

                switch (op)
                {
                    case "=":
                        return sign == 0;
                    case "<>":
                        return sign != 0;
                    case "<":
                        return sign < 0;
                    case ">":
                        return sign > 0;
                    case "<=":
                        return sign <= 0;
                    default:
                        return sign >= 0;
                }
            }

            /// <summary>A value as the text a comparison and &amp; see.</summary>
            private static string AsText(FormulaValue value)
            {
                return value.Kind == FormulaKind.Text ? value.Text : FormulaFormat(value);
            }

            private FormulaValue Concat()
            {
                var value = Additive();
                while (true)
                {
                    SkipSpaces();
                    if (Peek() != '&')
                    {
                        return value;
                    }

                    _at++;
                    value = FormulaValue.Of(AsText(value) + AsText(Additive()));
                }
            }

            private FormulaValue Additive()
            {
                var value = Multiplicative();
                while (true)
                {
                    SkipSpaces();
                    var c = Peek();
                    if (c != '+' && c != '-')
                    {
                        return value;
                    }

                    _at++;
                    var right = Multiplicative();
                    value = FormulaValue.Of(c == '+' ? Numeric(value) + Numeric(right)
                        : Numeric(value) - Numeric(right));
                }
            }

            private FormulaValue Multiplicative()
            {
                var value = Power();
                while (true)
                {
                    SkipSpaces();
                    var c = Peek();
                    if (c != '*' && c != '/')
                    {
                        return value;
                    }

                    _at++;
                    var right = Power();
                    var left = Numeric(value);
                    var divisor = Numeric(right);
                    if (c == '/' && Math.Abs(divisor) < double.Epsilon)
                    {
                        throw new FormulaError(DivisionByZero);
                    }

                    value = FormulaValue.Of(c == '*' ? left * divisor : left / divisor);
                }
            }

            private FormulaValue Power()
            {
                var value = Unary();
                SkipSpaces();
                if (Peek() != '^')
                {
                    return value;
                }

                _at++;
                var exponent = Numeric(Power());        // right-associative, as every spreadsheet has it
                var baseValue = Numeric(value);
                if (Math.Abs(baseValue) < double.Epsilon && exponent < 0d)
                {
                    throw new FormulaError(DivisionByZero);     // 0^-1 is a division by zero, not infinity
                }

                return FormulaValue.Of(Math.Pow(baseValue, exponent));
            }

            private FormulaValue Unary()
            {
                var negative = false;
                while (true)
                {
                    SkipSpaces();
                    var c = Peek();
                    if (c == '-')
                    {
                        negative = !negative;
                        _at++;
                        continue;
                    }

                    if (c == '+')
                    {
                        _at++;
                        continue;
                    }

                    break;
                }

                var value = Primary();
                return negative ? FormulaValue.Of(-Numeric(value)) : value;
            }

            private FormulaValue Primary()
            {
                SkipSpaces();
                var c = Peek();
                if (c == '(')
                {
                    _at++;
                    Enter();
                    var inner = Comparison();
                    Leave();
                    SkipSpaces();
                    if (Peek() != ')')
                    {
                        throw new FormulaError(ValueError);
                    }

                    _at++;
                    return inner;
                }

                if (c == '"')
                {
                    return FormulaValue.Of(ReadText());
                }

                if ((c >= '0' && c <= '9') || c == '.')
                {
                    return FormulaValue.Of(ReadNumber());
                }

                if (char.IsLetter(c) || c == '$' || c == '_')
                {
                    return ReadName();
                }

                throw new FormulaError(ValueError);
            }

            /// <summary>A name is either a cell reference (A1) or a function call (SUM(…)), and nothing else
            /// has a value here — an unknown word is #NAME?, which is what a typo deserves.
            /// (Called "ReadName", not "Name": a control already HAS a Name property.)</summary>
            private FormulaValue ReadName()
            {
                var start = _at;
                while (_at < _text.Length)
                {
                    var c = _text[_at];
                    if (char.IsLetterOrDigit(c) || c == '$' || c == '_' || c == '.')
                    {
                        _at++;
                        continue;
                    }

                    break;
                }

                var name = _text.Substring(start, _at - start);
                SkipSpaces();
                if (Peek() == '(')
                {
                    return CallFunction(name.ToUpperInvariant());
                }

                if (TryReadAddress(_text, start, out var row1, out var column1, out var used) && used == name.Length)
                {
                    // A reference is measured from THIS cell unless it is written with $ on it: the sheet has no
                    // copy/paste yet, so $ is accepted and ignored rather than rejected.
                    return _sheet.Reference(row1, column1);
                }

                throw new FormulaError(NameError);
            }
            // ---- the pieces ------------------------------------------------------------------------

            private void Enter()
            {
                _depth++;
                if (_depth > FormulaMaxDepth)
                {
                    throw new FormulaError(ValueError);
                }
            }

            private void Leave()
            {
                _depth--;
            }

            private string ReadText()
            {
                _at++;                                  // the opening quote
                var builder = new System.Text.StringBuilder();
                while (true)
                {
                    if (_at >= _text.Length)
                    {
                        throw new FormulaError(ValueError);     // unterminated
                    }

                    var c = _text[_at];
                    _at++;
                    if (c == '"')
                    {
                        if (_at < _text.Length && _text[_at] == '"')
                        {
                            _at++;                      // "" is one quote, as in every dialect
                            builder.Append('"');
                            continue;
                        }

                        return builder.ToString();
                    }

                    builder.Append(c);
                }
            }

            private double ReadNumber()
            {
                var start = _at;
                while (_at < _text.Length)
                {
                    var c = _text[_at];
                    if ((c >= '0' && c <= '9') || c == '.')
                    {
                        _at++;
                        continue;
                    }

                    break;
                }

                var body = _text.Substring(start, _at - start);
                if (!double.TryParse(body, NumberStyles.Float, CultureInfo.InvariantCulture, out var value))
                {
                    throw new FormulaError(ValueError);
                }

                return value;
            }

            private char Peek()
            {
                return _at < _text.Length ? _text[_at] : '\0';
            }

            private void SkipSpaces()
            {
                while (_at < _text.Length && (_text[_at] == ' ' || _text[_at] == '\t'))
                {
                    _at++;
                }
            }

            private void Expect(char c)
            {
                SkipSpaces();
                if (Peek() != c)
                {
                    throw new FormulaError(ValueError);
                }

                _at++;
            }

            /// <summary>Walks over one argument without working it out — how IF finds both of its branches
            /// before deciding which one to evaluate.</summary>
            private void SkipArgument()
            {
                var depth = 0;
                while (_at < _text.Length)
                {
                    var c = _text[_at];
                    if (c == '"')
                    {
                        ReadText();
                        continue;
                    }

                    if (c == '(')
                    {
                        depth++;
                    }
                    else if (c == ')')
                    {
                        if (depth == 0)
                        {
                            return;                 // the call's own closing paren: the argument ended here
                        }

                        depth--;
                    }
                    else if (c == ',' && depth == 0)
                    {
                        return;
                    }

                    _at++;
                }
            }

            // ---- functions -------------------------------------------------------------------------

            /// <summary>"CallFunction", not "Call": Call is a VB keyword and neither twin may use it.</summary>
            private FormulaValue CallFunction(string name)
            {
                if (name == "IF")
                {
                    return CallIf();
                }

                Expect('(');
                var args = new List<FormulaArg>();
                SkipSpaces();
                if (Peek() != ')')
                {
                    while (true)
                    {
                        args.Add(Argument());
                        SkipSpaces();
                        if (Peek() != ',')
                        {
                            break;
                        }

                        _at++;
                    }
                }

                Expect(')');
                return Apply(name, args);
            }

            /// <summary>
            /// IF is the one function that does not work out all of its arguments: =IF(A1=0,0,1/A1) is the
            /// usual way to guard a division, and that only works when the branch NOT taken is never
            /// evaluated. So its branches are skipped over and the one that is taken is parsed on its own.
            /// </summary>
            private FormulaValue CallIf()
            {
                Expect('(');
                var condition = Truthy(Comparison());
                Expect(',');
                var thenStart = _at;
                SkipArgument();
                var thenEnd = _at;
                var elseStart = thenEnd;
                var elseEnd = thenEnd;
                SkipSpaces();
                if (Peek() == ',')
                {
                    _at++;
                    elseStart = _at;
                    SkipArgument();
                    elseEnd = _at;
                    SkipSpaces();
                }

                if (Peek() == ',')
                {
                    _at++;
                    SkipArgument();                 // IF takes three arguments; anything beyond is ignored
                }

                Expect(')');
                var start = condition ? thenStart : elseStart;
                var end = condition ? thenEnd : elseEnd;
                if (end <= start)
                {
                    return FormulaValue.Blank;      // a branch that was left out is blank
                }

                return new FormulaParser(_sheet, _row, _column, _text.Substring(start, end - start)).Work();
            }

            /// <summary>One argument: a range (A1:B3, or the older A1..B3 — only meaningful as an
            /// argument) or an expression.</summary>
            private FormulaArg Argument()
            {
                SkipSpaces();
                var save = _at;
                if (TryReadAddress(_text, _at, out var row1, out var column1, out var used))
                {
                    var afterFirst = _at + used;
                    var probe = afterFirst;
                    while (probe < _text.Length && (_text[probe] == ' ' || _text[probe] == '\t'))
                    {
                        probe++;
                    }

                    // A range reads A1:B3 or A1..B3. The COLON is what this sheet writes (the macro list
                    // and the shift-on-fill both keep to it) and what every spreadsheet taught; the older
                    // two-dot form is still read, so a formula typed before this change is left alone.
                    var separator = 0;
                    if (probe < _text.Length && _text[probe] == ':')
                    {
                        separator = 1;
                    }
                    else if (probe + 1 < _text.Length && _text[probe] == '.' && _text[probe + 1] == '.')
                    {
                        separator = 2;
                    }

                    if (separator > 0)
                    {
                        probe += separator;
                        if (TryReadAddress(_text, probe, out var row2, out var column2, out var used2))
                        {
                            _at = probe + used2;
                            // A range is CLIPPED to the sheet: SUM(B2:B999) on a 50-row sheet is the whole
                            // column, which is what the author meant. A single reference off the sheet is
                            // still #REF!, because there is nothing there to read.
                            var firstRow = Math.Max(1, Math.Min(row1, row2));
                            var lastRow = Math.Min(_sheet.RowCount, Math.Max(row1, row2));
                            var firstColumn = Math.Max(1, Math.Min(column1, column2));
                            var lastColumn = Math.Min(_sheet.ColumnCount, Math.Max(column1, column2));
                            return FormulaArg.Range(firstRow, firstColumn, lastRow, lastColumn);
                        }

                        throw new FormulaError(RefError);
                    }
                }

                _at = save;
                return FormulaArg.Single(Comparison());
            }

            private FormulaValue Apply(string name, List<FormulaArg> args)
            {
                switch (name)
                {
                    case "SUM":
                    case "AVERAGE":
                    case "AVG":
                    case "MIN":
                    case "MAX":
                    case "COUNT":
                    case "COUNTA":
                    case "STDEV":
                    case "STDDEV":
                    case "STDEVP":
                    case "STDDEVP":
                        return Aggregate(name, args);
                    case "ABS":
                        return One(name, args, Math.Abs);
                    case "SQRT":
                        return One(name, args, Math.Sqrt);
                    case "INT":
                        return One(name, args, Math.Floor);
                    case "ROUND":
                        return Round(args);
                    case "MOD":
                        return Modulo(args);
                    case "AND":
                        return Logic(args, true);
                    case "OR":
                        return Logic(args, false);
                    case "NOT":
                        return LogicalNot(args);
                    case "LEN":
                        return Text1(name, args, (s) => (double)s.Length);
                    case "UPPER":
                        return Text1(name, args, (s) => double.NaN, (s) => s.ToUpperInvariant());
                    case "LOWER":
                        return Text1(name, args, (s) => double.NaN, (s) => s.ToLowerInvariant());
                    case "TRIM":
                        return Text1(name, args, (s) => double.NaN, (s) => s.Trim());
                    default:
                        throw new FormulaError(NameError);
                }
            }

            /// <summary>The values an argument list contributes, in order: a range gives every cell in it,
            /// a plain argument gives itself.</summary>
            private IEnumerable<FormulaValue> Values(List<FormulaArg> args)
            {
                for (var i = 0; i < args.Count; i++)
                {
                    var arg = args[i];
                    if (arg.IsRange)
                    {
                        for (var row = arg.FirstRow; row <= arg.LastRow; row++)
                        {
                            for (var column = arg.FirstColumn; column <= arg.LastColumn; column++)
                            {
                                yield return _sheet.Reference(row, column);
                            }
                        }
                    }
                    else
                    {
                        yield return arg.Value;
                    }
                }
            }

            private FormulaValue Aggregate(string name, List<FormulaArg> args)
            {
                var numbers = new List<double>();
                var nonBlank = 0;
                foreach (var value in Values(args))
                {
                    if (value.Kind == FormulaKind.Error)
                    {
                        throw new FormulaError(value.Text);
                    }

                    if (value.Kind == FormulaKind.Blank)
                    {
                        continue;                   // a blank cell is not a zero for a sum, and not filled
                    }

                    nonBlank++;                     // COUNTA counts it — text and all
                    if (value.Kind == FormulaKind.Text && !IsNumericValue(value))
                    {
                        continue;                   // text is ignored by SUM/MIN/MAX, the way a label should be
                    }

                    numbers.Add(Numeric(value));
                }

                switch (name)
                {
                    case "COUNTA":
                        return FormulaValue.Of((double)nonBlank);
                    case "COUNT":
                        return FormulaValue.Of((double)numbers.Count);
                    case "SUM":
                        return FormulaValue.Of(Sum(numbers));
                    case "MIN":
                        return FormulaValue.Of(numbers.Count == 0 ? 0d : Min(numbers));
                    case "MAX":
                        return FormulaValue.Of(numbers.Count == 0 ? 0d : Max(numbers));
                    case "STDEV":
                    case "STDDEV":
                        return FormulaValue.Of(StdDev(numbers, true));
                    case "STDEVP":
                    case "STDDEVP":
                        return FormulaValue.Of(StdDev(numbers, false));
                    default:
                        if (numbers.Count == 0)
                        {
                            throw new FormulaError(DivisionByZero);     // an average of nothing
                        }

                        return FormulaValue.Of(Sum(numbers) / numbers.Count);
                }
            }

            private static double Sum(List<double> numbers)
            {
                var total = 0d;
                for (var i = 0; i < numbers.Count; i++)
                {
                    total += numbers[i];
                }

                return total;
            }

            private static double Min(List<double> numbers)
            {
                var value = numbers[0];
                for (var i = 1; i < numbers.Count; i++)
                {
                    if (numbers[i] < value)
                    {
                        value = numbers[i];
                    }
                }

                return value;
            }

            private static double Max(List<double> numbers)
            {
                var value = numbers[0];
                for (var i = 1; i < numbers.Count; i++)
                {
                    if (numbers[i] > value)
                    {
                        value = numbers[i];
                    }
                }

                return value;
            }

            /// <summary>
            /// STDEV / STDDEV is the SAMPLE standard deviation (divide by n−1) and STDEVP / STDDEVP the
            /// population one (divide by n) — the difference matters for the handful of readings a sheet
            /// this size usually holds. One number has no sample spread at all, which is named rather
            /// than answered as a confident zero.
            /// </summary>
            private static double StdDev(List<double> numbers, bool sample)
            {
                if (numbers.Count == 0 || (sample && numbers.Count < 2))
                {
                    throw new FormulaError(DivisionByZero);
                }

                var mean = Sum(numbers) / numbers.Count;
                var total = 0d;
                for (var i = 0; i < numbers.Count; i++)
                {
                    var delta = numbers[i] - mean;
                    total += delta * delta;
                }

                return Math.Sqrt(total / (sample ? numbers.Count - 1 : numbers.Count));
            }

            private FormulaValue One(string name, List<FormulaArg> args, Func<double, double> work)
            {
                if (args.Count != 1)
                {
                    throw new FormulaError(ValueError);
                }

                return FormulaValue.Of(work(Numeric(args[0].Value)));
            }

            private FormulaValue Round(List<FormulaArg> args)
            {
                if (args.Count != 2)
                {
                    throw new FormulaError(ValueError);
                }

                var digits = (int)Math.Round(Numeric(args[1].Value));
                if (digits < 0)
                {
                    digits = 0;
                }

                if (digits > 15)
                {
                    digits = 15;
                }

                return FormulaValue.Of(Math.Round(Numeric(args[0].Value), digits));
            }

            /// <summary>MOD — named "Modulo", because "Mod" is a VB operator and neither twin may use it.</summary>
            private FormulaValue Modulo(List<FormulaArg> args)
            {
                if (args.Count != 2)
                {
                    throw new FormulaError(ValueError);
                }

                var divisor = Numeric(args[1].Value);
                if (Math.Abs(divisor) < double.Epsilon)
                {
                    throw new FormulaError(DivisionByZero);
                }

                return FormulaValue.Of(Numeric(args[0].Value) % divisor);
            }

            private FormulaValue Logic(List<FormulaArg> args, bool all)
            {
                if (args.Count == 0)
                {
                    throw new FormulaError(ValueError);
                }

                for (var i = 0; i < args.Count; i++)
                {
                    var truth = Truthy(args[i].Value);
                    if (all && !truth)
                    {
                        return FormulaValue.Of(false);
                    }

                    if (!all && truth)
                    {
                        return FormulaValue.Of(true);
                    }
                }

                return FormulaValue.Of(all);
            }

            /// <summary>NOT — named "LogicalNot", because "Not" is a VB operator.</summary>
            private FormulaValue LogicalNot(List<FormulaArg> args)
            {
                if (args.Count != 1)
                {
                    throw new FormulaError(ValueError);
                }

                return FormulaValue.Of(!Truthy(args[0].Value));
            }

            /// <summary>LEN / UPPER / LOWER / TRIM: one argument, read as text (a blank is empty text).</summary>
            private FormulaValue Text1(string name, List<FormulaArg> args,
                Func<string, double> number, Func<string, string>? text = null)
            {
                if (args.Count != 1)
                {
                    throw new FormulaError(ValueError);
                }

                var value = args[0].Value;
                if (value.Kind == FormulaKind.Error)
                {
                    throw new FormulaError(value.Text);
                }

                var body = AsText(value);
                if (text == null)
                {
                    return FormulaValue.Of(number(body));
                }

                return FormulaValue.Of(text(body));
            }
        }

        /// <summary>One argument of a function call: a range, or a single value.</summary>
        private struct FormulaArg
        {
            public bool IsRange;
            public FormulaValue Value;
            public int FirstRow;
            public int FirstColumn;
            public int LastRow;
            public int LastColumn;

            public static FormulaArg Single(FormulaValue value)
            {
                return new FormulaArg { IsRange = false, Value = value };
            }

            public static FormulaArg Range(int firstRow, int firstColumn, int lastRow, int lastColumn)
            {
                return new FormulaArg
                {
                    IsRange = true,
                    Value = FormulaValue.Blank,
                    FirstRow = firstRow,
                    FirstColumn = firstColumn,
                    LastRow = lastRow,
                    LastColumn = lastColumn
                };
            }
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

    /// <summary>
    /// Where the sheet's file dialogs left off, for this session. Static, so the NEXT dialog opens where the
    /// last one was — which is what every desktop app does — and scoped to the process, which is the right
    /// lifetime for a hint nobody asked to keep. (The charts' own ChartPickerMemory writes a file so that it
    /// survives a restart; a sheet that has only just grown a File menu does not need that yet.)
    /// </summary>
    internal static class SheetPickerMemory
    {
        /// <summary>The folder Load… last read a workbook from.</summary>
        internal static string? LastFolder;

        /// <summary>The folder Save…, the PNG or the PDF last wrote to.</summary>
        internal static string? LastExportFolder;
    }
}
