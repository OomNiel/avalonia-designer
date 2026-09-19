// GrumpyCharts.cs — BUNDLED RESOURCE (the VB twin is resources/GrumpyCharts.vb). Copied into every
// generated project, next to ChromeWindow.cs / PathPicker.cs / GrumpyPanel.cs.
//
// A small, dependency-free CHART CONTROL SET: two controls that draw themselves, with no NuGet
// package, no template and no assets. It is the Avalonia equivalent of the old WinForms charting
// you would drop on a form, size with the mouse and feed from a spreadsheet.
//
//   <charts:GrumpyLinePlot x:Name="LinePlot1" Width="320" Height="180"
//                          Values="4,9,6,12,8,15"
//                          Title="Temperature" ShowTitle="True"/>
//
//   <charts:GrumpyXYPlot x:Name="XYPlot1" Width="320" Height="180"
//                        SourceFile="/home/me/measurements.xlsx"
//                        LineStyle="Dotted" MarkerStyle="Cross"/>
//
// DATA
// ----
//   * Inline arrays   — Values="4,9,6,12,8" (line plot, X is the sample index) or
//                       Points="0,0 1,4 2,9" (X,Y plot, x,y pairs), or from code:
//                       plot.Values = new double[] { 4, 9, 6 };  xy.Points = new double[,] { {0,0}, {1,4} };
//   * An .xlsx file   — SourceFile points at a spreadsheet: the header row names the axes and the
//                       rows below it are the values. Defaults follow the convention
//                       COLUMN B = X, COLUMN C = Y, ROW 1 = axis names, data from ROW 2
//                       (XColumn / YColumn / HeaderRow / FirstDataRow change that).
//                       The reader is plain System.IO.Compression + XML — no dependency.
//                       For a LINE plot the Y values come from YColumn; if that column is empty it
//                       falls back to XColumn, so a single-column sheet still plots.
//   * LiveUpdate = True re-reads the file when it changes on disk (edit the sheet, save, the chart
//     redraws). Code can also push data at any time: AddPoint(x, y) / SetValues(...).
//
// STYLE (all of it optional — the defaults are already presentation-ready)
// -----------------------------------------------------------------------
//   Frame        ShowBorder, BorderBrush, BorderThickness, CornerRadius
//   Plot area    PlotBackColor, PlotBackOpacity (0-100 %)
//   Plot line    LineColor, LineThickness, LineStyle (Solid | Dash | Dot | DashDot)
//   Markers      MarkerStyle (None | Dot | Cross | Square | Diamond), MarkerSize, Connected
//   Gridlines    ShowGrid, GridColor, GridThickness, GridStyle (Solid | Dash | Dot | DashDot)
//   Axes         ShowAxes, AxisColor (axes + ticks + labels), ShowMajorTicks, MajorTickLength,
//                ShowMinorTicks, MinorTickLength, ShowTickLabels, TickLabelFontSize,
//                ShowAxisTitles, XAxisTitle, YAxisTitle
//   Title        ShowTitle, Title, TitleColor, TitlePosition (Top | Bottom | Left | Right),
//                TitleFontSize
//   Scaling      Auto-fit; MinX / MaxX / MinY / MaxY override it (leave them empty to auto-fit)
//
// NOTES
// -----
//   * Everything is proportional, so the chart survives any resize (in the designer and at runtime).
//   * The axis range auto-fits the data and then SNAPS outward to "nice" tick values (1/2/5 x 10^n),
//     which is what makes the labels read as 0, 5, 10, 15 rather than 0.37, 3.7, 7.03.
//   * A missing or unreadable file draws a short explanation inside the plot area instead of
//     throwing — the form still loads.
//   * ShowBrowse = True draws a small "…" button in the top-right of the plot that opens the
//     platform file dialog and loads the chosen sheet. BrowseForFile() does the same from your own
//     button. Both do nothing when there is no TopLevel yet (e.g. a designer preview), so the
//     control is always safe to place and render before the window is shown.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Threading.Tasks;
using System.Xml.Linq;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Media;
using Avalonia.Platform.Storage;
using Avalonia.Threading;

namespace AvaloniaCharts;

/// <summary>How a plot line or the gridlines are drawn.</summary>
public enum ChartLineStyle
{
    /// <summary>An unbroken line.</summary>
    Solid,
    /// <summary>Dashes.</summary>
    Dash,
    /// <summary>Round dots.</summary>
    Dot,
    /// <summary>Alternating dash and dot.</summary>
    DashDot
}

/// <summary>The point symbol used by the X,Y plot.</summary>
public enum ChartMarkerStyle
{
    /// <summary>No symbol — a bare line (when Connected) or nothing at all.</summary>
    None,
    /// <summary>A filled circle.</summary>
    Dot,
    /// <summary>A diagonal cross.</summary>
    Cross,
    /// <summary>A filled square.</summary>
    Square,
    /// <summary>A filled diamond.</summary>
    Diamond
}

/// <summary>Where the chart title sits around the plot area.</summary>
public enum ChartTitlePosition
{
    /// <summary>Above the plot area (the default).</summary>
    Top,
    /// <summary>Below the plot area.</summary>
    Bottom,
    /// <summary>Down the left edge, rotated.</summary>
    Left,
    /// <summary>Down the right edge, rotated.</summary>
    Right
}

/// <summary>Reads <c>Values="4,9,6,12"</c> from XAML into a <see cref="double"/> array.</summary>
public sealed class DoubleArrayConverter : TypeConverter
{
    /// <inheritdoc/>
    public override bool CanConvertFrom(ITypeDescriptorContext? context, Type sourceType)
        => sourceType == typeof(string) || base.CanConvertFrom(context, sourceType);

    /// <inheritdoc/>
    public override object? ConvertFrom(ITypeDescriptorContext? context, CultureInfo? culture, object value)
    {
        if (value is not string s) return base.ConvertFrom(context, culture, value);
        var list = new List<double>();
        foreach (var token in s.Split(new[] { ',', ';', ' ', '\t', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries))
        {
            if (double.TryParse(token.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var d))
                list.Add(d);
        }
        return list.ToArray();
    }
}

/// <summary>Reads <c>Points="0,0 1,4 2,9"</c> (x,y pairs) from XAML into a 2-D <c>[n,2]</c> array.</summary>
public sealed class DoubleMatrixConverter : TypeConverter
{
    /// <inheritdoc/>
    public override bool CanConvertFrom(ITypeDescriptorContext? context, Type sourceType)
        => sourceType == typeof(string) || base.CanConvertFrom(context, sourceType);

    /// <inheritdoc/>
    public override object? ConvertFrom(ITypeDescriptorContext? context, CultureInfo? culture, object value)
    {
        if (value is not string s) return base.ConvertFrom(context, culture, value);
        // Each whitespace-separated group is one "x,y" pair; a semicolon also separates pairs, so
        // both "0,0 1,4" and "0,0; 1,4" read the same way.
        var groups = s.Split(new[] { ';', ' ', '\t', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
        var pairs = new List<double[]>();
        foreach (var group in groups)
        {
            var xy = group.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
            if (xy.Length != 2) continue;
            if (double.TryParse(xy[0].Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var x) &&
                double.TryParse(xy[1].Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var y))
            {
                pairs.Add(new[] { x, y });
            }
        }
        var result = new double[pairs.Count, 2];
        for (var i = 0; i < pairs.Count; i++)
        {
            result[i, 0] = pairs[i][0];
            result[i, 1] = pairs[i][1];
        }
        return result;
    }
}

/// <summary>One series of points, plus the axis names and any reason there is no data.</summary>
public sealed class ChartSeries
{
    /// <summary>The X values (for a line plot these are the sample indices 0,1,2…).</summary>
    public double[] Xs { get; set; } = Array.Empty<double>();

    /// <summary>The Y values.</summary>
    public double[] Ys { get; set; } = Array.Empty<double>();

    /// <summary>The X axis name (the spreadsheet's column-B header).</summary>
    public string XTitle { get; set; } = string.Empty;

    /// <summary>The Y axis name (the spreadsheet's column-C header).</summary>
    public string YTitle { get; set; } = string.Empty;

    /// <summary>Why the chart has nothing to draw, or <c>null</c> when it is fine.</summary>
    public string? Error { get; set; }

    /// <summary>True when the series carries at least one point.</summary>
    public bool HasData => Xs.Length > 0 && Xs.Length == Ys.Length;
}

/// <summary>
/// Reads a two-column series out of an .xlsx workbook. Plain ZIP + XML: an .xlsx is a zip of XML
/// parts, so this needs no package and no interop. It understands shared, inline and plain string
/// cells as well as numbers, and it skips rows that are missing either coordinate.
/// </summary>
internal static class SpreadsheetReader
{
    /// <summary>Column letter(s) to a zero-based index ("A" = 0, "B" = 1, "AA" = 26).</summary>
    internal static int ColumnIndex(string column)
    {
        var index = 0;
        foreach (var ch in column.Trim().ToUpperInvariant())
        {
            if (ch < 'A' || ch > 'Z') continue;
            index = index * 26 + (ch - 'A' + 1);
        }
        return index - 1;
    }

    /// <summary>The column letters in a cell reference such as "BC12" (trailing digits dropped).</summary>
    private static string ColumnOf(string cellRef)
    {
        var end = 0;
        while (end < cellRef.Length && char.IsLetter(cellRef[end])) end++;
        return cellRef.Substring(0, end);
    }

    /// <summary>The row number in a cell reference ("BC12" → 12), or 0 when there is none.</summary>
    private static int RowOf(string cellRef)
    {
        var start = 0;
        while (start < cellRef.Length && char.IsLetter(cellRef[start])) start++;
        var digits = cellRef.Substring(start);
        return int.TryParse(digits, NumberStyles.Integer, CultureInfo.InvariantCulture, out var row) ? row : 0;
    }

    /// <summary>
    /// Reads the series. <paramref name="xFromIndex"/> makes a line plot: the X values are the
    /// sample indices and only the Y column is read (falling back to the X column when the Y column
    /// turns out to be empty, so a one-column sheet still draws).
    /// </summary>
    internal static ChartSeries Read(string path, string xColumn, string yColumn,
                                    int headerRow, int firstDataRow, bool xFromIndex)
    {
        var series = new ChartSeries();
        try
        {
            using var zip = ZipFile.OpenRead(path);
            var shared = ReadSharedStrings(zip);
            var sheet = FindSheet(zip);
            if (sheet is null)
            {
                series.Error = $"\"{Path.GetFileName(path)}\" has no worksheet.";
                return series;
            }

            var xi = ColumnIndex(xColumn);
            var yi = ColumnIndex(yColumn);
            var xs = new List<double>();
            var ys = new List<double>();
            var xsFallback = new List<double>();
            var ysFallback = new List<double>();
            var xTitle = string.Empty;
            var yTitle = string.Empty;

            using var stream = sheet.Open();
            foreach (var row in XDocument.Load(stream).Descendants()
                         .Where(e => e.Name.LocalName == "row"))
            {
                var rowNumber = int.TryParse(row.Attribute("r")?.Value, NumberStyles.Integer,
                    CultureInfo.InvariantCulture, out var rn) ? rn : -1;
                var cells = new Dictionary<int, string>();
                foreach (var cell in row.Elements().Where(e => e.Name.LocalName == "c"))
                {
                    var cellRef = cell.Attribute("r")?.Value ?? string.Empty;
                    var index = ColumnIndex(ColumnOf(cellRef));
                    var text = CellText(cell, shared);
                    if (index >= 0 && text is not null) cells[index] = text;
                }
                cells.TryGetValue(xi, out var xText);
                cells.TryGetValue(yi, out var yText);

                if (rowNumber == headerRow)
                {
                    if (cells.TryGetValue(xi, out var xh)) xTitle = xh;
                    if (cells.TryGetValue(yi, out var yh)) yTitle = yh;
                    continue;
                }
                if (firstDataRow > 0 && rowNumber > 0 && rowNumber < firstDataRow) continue;

                var hasX = TryNumber(xText, out var xVal);
                var hasY = TryNumber(yText, out var yVal);

                if (xFromIndex)
                {
                    // A line plot only needs one column. Prefer the Y column; if the sheet has the
                    // values in the X column instead, take those rather than drawing nothing.
                    if (hasY) { xs.Add(ys.Count); ys.Add(yVal); }
                    else if (hasX) { xsFallback.Add(ysFallback.Count); ysFallback.Add(xVal); }
                }
                else if (hasX && hasY)
                {
                    xs.Add(xVal);
                    ys.Add(yVal);
                }
            }

            if (xFromIndex && ys.Count == 0 && ysFallback.Count > 0)
            {
                xs = xsFallback;
                ys = ysFallback;
            }

            series.Xs = xs.ToArray();
            series.Ys = ys.ToArray();
            series.XTitle = xTitle;
            series.YTitle = yTitle;
            if (series.Ys.Length == 0)
            {
                series.Error = $"No numbers found in column {(xFromIndex ? yColumn : $"{xColumn}/{yColumn}")} " +
                               $"of \"{Path.GetFileName(path)}\" from row {firstDataRow}.";
            }
        }
        catch (Exception ex)
        {
            series.Error = $"Cannot read \"{Path.GetFileName(path)}\": {ex.Message}";
        }
        return series;
    }

    /// <summary>The workbook's first worksheet part, or null when the zip has none.</summary>
    private static ZipArchiveEntry? FindSheet(ZipArchive zip)
        => zip.Entries
            .Where(e => e.FullName.StartsWith("xl/worksheets/sheet", StringComparison.OrdinalIgnoreCase)
                        && e.FullName.EndsWith(".xml", StringComparison.OrdinalIgnoreCase))
            .OrderBy(e => e.FullName, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault();

    /// <summary>The workbook's shared string table (xl/sharedStrings.xml), if it has one.</summary>
    private static List<string> ReadSharedStrings(ZipArchive zip)
    {
        var list = new List<string>();
        var entry = zip.Entries.FirstOrDefault(e =>
            e.FullName.Equals("xl/sharedStrings.xml", StringComparison.OrdinalIgnoreCase));
        if (entry is null) return list;
        try
        {
            using var stream = entry.Open();
            foreach (var si in XDocument.Load(stream).Descendants().Where(e => e.Name.LocalName == "si"))
            {
                // A shared string is either one <t> or a run list <r><t>…</t></r>.
                var text = string.Concat(si.Descendants()
                    .Where(e => e.Name.LocalName == "t")
                    .Select(e => e.Value));
                list.Add(text);
            }
        }
        catch
        {
            // A broken string table just means cells read as their raw values.
        }
        return list;
    }

    /// <summary>One cell's text: a shared string, an inline string, or the raw value.</summary>
    private static string? CellText(XElement cell, List<string> shared)
    {
        var type = cell.Attribute("t")?.Value ?? string.Empty;
        if (type == "inlineStr")
        {
            return string.Concat(cell.Descendants().Where(e => e.Name.LocalName == "t").Select(e => e.Value));
        }
        var value = cell.Elements().FirstOrDefault(e => e.Name.LocalName == "v")?.Value;
        if (value is null) return null;
        if (type == "s" && int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var si)
            && si >= 0 && si < shared.Count)
        {
            return shared[si];
        }
        return value;
    }

    /// <summary>A cell as a number: invariant first, then the current culture (a comma decimal).</summary>
    private static bool TryNumber(string? text, out double value)
    {
        if (string.IsNullOrWhiteSpace(text)) { value = 0; return false; }
        return double.TryParse(text.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out value)
               || double.TryParse(text.Trim(), NumberStyles.Float, CultureInfo.CurrentCulture, out value);
    }
}

/// <summary>
/// The shared base for <see cref="GrumpyLinePlot"/> and <see cref="GrumpyXYPlot"/>: everything from
/// the frame and plot background to the gridlines, ticks, tick labels, axis titles and chart title,
/// plus the spreadsheet reader and the live-update watcher. Subclasses only supply the data.
/// </summary>
public abstract class ChartBase : Control
{
    private const string DefaultFont = "Default";

    // ---- frame ------------------------------------------------------------------------------
    /// <summary>Draw the border around the whole control.</summary>
    public static readonly StyledProperty<bool> ShowBorderProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(ShowBorder), true);

    /// <summary>Border colour (see <see cref="ShowBorder"/>).</summary>
    public static readonly StyledProperty<Color> BorderBrushProperty =
        AvaloniaProperty.Register<ChartBase, Color>(nameof(BorderBrush), Color.Parse("#C8C8C8"));

    /// <summary>Border line thickness.</summary>
    public static readonly StyledProperty<double> BorderThicknessProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(BorderThickness), 1d);

    /// <summary>Corner rounding of the frame.</summary>
    public static readonly StyledProperty<CornerRadius> CornerRadiusProperty =
        AvaloniaProperty.Register<ChartBase, CornerRadius>(nameof(CornerRadius), new CornerRadius(4));

    // ---- plot area --------------------------------------------------------------------------
    /// <summary>Fill colour of the plot area (the region inside the axes).</summary>
    public static readonly StyledProperty<Color> PlotBackColorProperty =
        AvaloniaProperty.Register<ChartBase, Color>(nameof(PlotBackColor), Colors.White);

    /// <summary>Plot-area opacity in percent (0 = invisible, 100 = solid).</summary>
    public static readonly StyledProperty<double> PlotBackOpacityProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(PlotBackOpacity), 100d);

    // ---- plot line --------------------------------------------------------------------------
    /// <summary>Colour of the plotted line.</summary>
    public static readonly StyledProperty<Color> LineColorProperty =
        AvaloniaProperty.Register<ChartBase, Color>(nameof(LineColor), Color.Parse("#2D7DD2"));

    /// <summary>Thickness of the plotted line.</summary>
    public static readonly StyledProperty<double> LineThicknessProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(LineThickness), 2d);

    /// <summary>Solid, dashed, dotted or dash-dot.</summary>
    public static readonly StyledProperty<ChartLineStyle> LineStyleProperty =
        AvaloniaProperty.Register<ChartBase, ChartLineStyle>(nameof(LineStyle), ChartLineStyle.Solid);

    // ---- markers (the X,Y plot) -------------------------------------------------------------
    /// <summary>The point symbol: None, Dot, Cross, Square or Diamond.</summary>
    public static readonly StyledProperty<ChartMarkerStyle> MarkerStyleProperty =
        AvaloniaProperty.Register<ChartBase, ChartMarkerStyle>(nameof(MarkerStyle), ChartMarkerStyle.Dot);

    /// <summary>Marker diameter in pixels.</summary>
    public static readonly StyledProperty<double> MarkerSizeProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(MarkerSize), 8d);

    /// <summary>Join the points with a line (False = markers only).</summary>
    public static readonly StyledProperty<bool> ConnectedProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(Connected), true);

    // ---- gridlines --------------------------------------------------------------------------
    /// <summary>Draw gridlines at the major ticks.</summary>
    public static readonly StyledProperty<bool> ShowGridProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(ShowGrid), true);

    /// <summary>Gridline colour.</summary>
    public static readonly StyledProperty<Color> GridColorProperty =
        AvaloniaProperty.Register<ChartBase, Color>(nameof(GridColor), Color.Parse("#E8E8E8"));

    /// <summary>Gridline thickness.</summary>
    public static readonly StyledProperty<double> GridThicknessProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(GridThickness), 1d);

    /// <summary>Solid, dashed, dotted or dash-dot gridlines.</summary>
    public static readonly StyledProperty<ChartLineStyle> GridStyleProperty =
        AvaloniaProperty.Register<ChartBase, ChartLineStyle>(nameof(GridStyle), ChartLineStyle.Solid);

    // ---- axes, ticks and labels -------------------------------------------------------------
    /// <summary>Draw the two axis lines.</summary>
    public static readonly StyledProperty<bool> ShowAxesProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(ShowAxes), true);

    /// <summary>Colour of the axes, the ticks and the tick labels.</summary>
    public static readonly StyledProperty<Color> AxisColorProperty =
        AvaloniaProperty.Register<ChartBase, Color>(nameof(AxisColor), Color.Parse("#666666"));

    /// <summary>Draw the major ticks.</summary>
    public static readonly StyledProperty<bool> ShowMajorTicksProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(ShowMajorTicks), true);

    /// <summary>Length of the major ticks, in pixels.</summary>
    public static readonly StyledProperty<double> MajorTickLengthProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(MajorTickLength), 6d);

    /// <summary>Draw the minor ticks (four between each pair of major ticks).</summary>
    public static readonly StyledProperty<bool> ShowMinorTicksProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(ShowMinorTicks), true);

    /// <summary>Length of the minor ticks, in pixels.</summary>
    public static readonly StyledProperty<double> MinorTickLengthProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(MinorTickLength), 3d);

    /// <summary>Draw the numbers under the ticks.</summary>
    public static readonly StyledProperty<bool> ShowTickLabelsProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(ShowTickLabels), true);

    /// <summary>Font size of the tick labels.</summary>
    public static readonly StyledProperty<double> TickLabelFontSizeProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(TickLabelFontSize), 11d);

    /// <summary>Draw the axis names (from the spreadsheet's header row, or XAxisTitle/YAxisTitle).</summary>
    public static readonly StyledProperty<bool> ShowAxisTitlesProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(ShowAxisTitles), true);

    /// <summary>The X axis name. Empty = use the spreadsheet's column header.</summary>
    public static readonly StyledProperty<string?> XAxisTitleProperty =
        AvaloniaProperty.Register<ChartBase, string?>(nameof(XAxisTitle), string.Empty);

    /// <summary>The Y axis name. Empty = use the spreadsheet's column header.</summary>
    public static readonly StyledProperty<string?> YAxisTitleProperty =
        AvaloniaProperty.Register<ChartBase, string?>(nameof(YAxisTitle), string.Empty);

    // ---- title ------------------------------------------------------------------------------
    /// <summary>Draw the chart title.</summary>
    public static readonly StyledProperty<bool> ShowTitleProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(ShowTitle), false);

    /// <summary>The chart title text.</summary>
    public static readonly StyledProperty<string?> TitleProperty =
        AvaloniaProperty.Register<ChartBase, string?>(nameof(Title), string.Empty);

    /// <summary>Title colour.</summary>
    public static readonly StyledProperty<Color> TitleColorProperty =
        AvaloniaProperty.Register<ChartBase, Color>(nameof(TitleColor), Color.Parse("#303030"));

    /// <summary>Top (default), Bottom, Left or Right of the plot area.</summary>
    public static readonly StyledProperty<ChartTitlePosition> TitlePositionProperty =
        AvaloniaProperty.Register<ChartBase, ChartTitlePosition>(nameof(TitlePosition), ChartTitlePosition.Top);

    /// <summary>Title font size.</summary>
    public static readonly StyledProperty<double> TitleFontSizeProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(TitleFontSize), 14d);

    // ---- data source ------------------------------------------------------------------------
    /// <summary>The .xlsx file to read. Empty = use the inline Values/Points.</summary>
    public static readonly StyledProperty<string?> SourceFileProperty =
        AvaloniaProperty.Register<ChartBase, string?>(nameof(SourceFile), string.Empty);

    /// <summary>Re-read the file whenever it changes on disk.</summary>
    public static readonly StyledProperty<bool> LiveUpdateProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(LiveUpdate), true);

    /// <summary>The X column letter in the sheet (default "B").</summary>
    public static readonly StyledProperty<string?> XColumnProperty =
        AvaloniaProperty.Register<ChartBase, string?>(nameof(XColumn), "B");

    /// <summary>The Y column letter in the sheet (default "C").</summary>
    public static readonly StyledProperty<string?> YColumnProperty =
        AvaloniaProperty.Register<ChartBase, string?>(nameof(YColumn), "C");

    /// <summary>The row holding the axis names (default 1).</summary>
    public static readonly StyledProperty<int> HeaderRowProperty =
        AvaloniaProperty.Register<ChartBase, int>(nameof(HeaderRow), 1);

    /// <summary>The first row of values (default 2; row 1 is the header).</summary>
    public static readonly StyledProperty<int> FirstDataRowProperty =
        AvaloniaProperty.Register<ChartBase, int>(nameof(FirstDataRow), 2);

    /// <summary>Draw the "…" file picker in the top-right of the plot.</summary>
    public static readonly StyledProperty<bool> ShowBrowseProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(ShowBrowse), false);

    // ---- scaling overrides ------------------------------------------------------------------
    /// <summary>Fixed X minimum. Empty (NaN) = auto-fit.</summary>
    public static readonly StyledProperty<double> MinXProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(MinX), double.NaN);

    /// <summary>Fixed X maximum. Empty (NaN) = auto-fit.</summary>
    public static readonly StyledProperty<double> MaxXProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(MaxX), double.NaN);

    /// <summary>Fixed Y minimum. Empty (NaN) = auto-fit.</summary>
    public static readonly StyledProperty<double> MinYProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(MinY), double.NaN);

    /// <summary>Fixed Y maximum. Empty (NaN) = auto-fit.</summary>
    public static readonly StyledProperty<double> MaxYProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(MaxY), double.NaN);

    static ChartBase()
    {
        // Any style or data change is a change to the picture.
        AffectsRender<ChartBase>(
            ShowBorderProperty, BorderBrushProperty, BorderThicknessProperty, CornerRadiusProperty,
            PlotBackColorProperty, PlotBackOpacityProperty,
            LineColorProperty, LineThicknessProperty, LineStyleProperty,
            MarkerStyleProperty, MarkerSizeProperty, ConnectedProperty,
            ShowGridProperty, GridColorProperty, GridThicknessProperty, GridStyleProperty,
            ShowAxesProperty, AxisColorProperty,
            ShowMajorTicksProperty, MajorTickLengthProperty,
            ShowMinorTicksProperty, MinorTickLengthProperty,
            ShowTickLabelsProperty, TickLabelFontSizeProperty,
            ShowAxisTitlesProperty, XAxisTitleProperty, YAxisTitleProperty,
            ShowTitleProperty, TitleProperty, TitleColorProperty, TitlePositionProperty, TitleFontSizeProperty,
            SourceFileProperty, XColumnProperty, YColumnProperty, HeaderRowProperty, FirstDataRowProperty,
            ShowBrowseProperty,
            MinXProperty, MaxXProperty, MinYProperty, MaxYProperty);
        SourceFileProperty.Changed.AddClassHandler<ChartBase>((chart, _) => chart.InvalidateCache());
        LiveUpdateProperty.Changed.AddClassHandler<ChartBase>((chart, _) => chart.RestartWatcher());
    }

    /// <summary>Draw the border around the whole control (True by default).</summary>
    public bool ShowBorder { get => GetValue(ShowBorderProperty); set => SetValue(ShowBorderProperty, value); }

    /// <summary>Border colour.</summary>
    public Color BorderBrush { get => GetValue(BorderBrushProperty); set => SetValue(BorderBrushProperty, value); }

    /// <summary>Border line thickness.</summary>
    public double BorderThickness { get => GetValue(BorderThicknessProperty); set => SetValue(BorderThicknessProperty, value); }

    /// <summary>Corner rounding of the frame.</summary>
    public CornerRadius CornerRadius { get => GetValue(CornerRadiusProperty); set => SetValue(CornerRadiusProperty, value); }

    /// <summary>Fill colour of the plot area.</summary>
    public Color PlotBackColor { get => GetValue(PlotBackColorProperty); set => SetValue(PlotBackColorProperty, value); }

    /// <summary>Plot-area opacity in percent (0-100).</summary>
    public double PlotBackOpacity { get => GetValue(PlotBackOpacityProperty); set => SetValue(PlotBackOpacityProperty, value); }

    /// <summary>Colour of the plotted line.</summary>
    public Color LineColor { get => GetValue(LineColorProperty); set => SetValue(LineColorProperty, value); }

    /// <summary>Thickness of the plotted line.</summary>
    public double LineThickness { get => GetValue(LineThicknessProperty); set => SetValue(LineThicknessProperty, value); }

    /// <summary>Line style of the plotted line.</summary>
    public ChartLineStyle LineStyle { get => GetValue(LineStyleProperty); set => SetValue(LineStyleProperty, value); }

    /// <summary>Marker style (the X,Y plot).</summary>
    public ChartMarkerStyle MarkerStyle { get => GetValue(MarkerStyleProperty); set => SetValue(MarkerStyleProperty, value); }

    /// <summary>Marker diameter in pixels.</summary>
    public double MarkerSize { get => GetValue(MarkerSizeProperty); set => SetValue(MarkerSizeProperty, value); }

    /// <summary>Join the points with a line.</summary>
    public bool Connected { get => GetValue(ConnectedProperty); set => SetValue(ConnectedProperty, value); }

    /// <summary>Draw gridlines at the major ticks.</summary>
    public bool ShowGrid { get => GetValue(ShowGridProperty); set => SetValue(ShowGridProperty, value); }

    /// <summary>Gridline colour.</summary>
    public Color GridColor { get => GetValue(GridColorProperty); set => SetValue(GridColorProperty, value); }

    /// <summary>Gridline thickness.</summary>
    public double GridThickness { get => GetValue(GridThicknessProperty); set => SetValue(GridThicknessProperty, value); }

    /// <summary>Gridline style.</summary>
    public ChartLineStyle GridStyle { get => GetValue(GridStyleProperty); set => SetValue(GridStyleProperty, value); }

    /// <summary>Draw the two axis lines.</summary>
    public bool ShowAxes { get => GetValue(ShowAxesProperty); set => SetValue(ShowAxesProperty, value); }

    /// <summary>Colour of the axes, ticks and tick labels.</summary>
    public Color AxisColor { get => GetValue(AxisColorProperty); set => SetValue(AxisColorProperty, value); }

    /// <summary>Draw the major ticks.</summary>
    public bool ShowMajorTicks { get => GetValue(ShowMajorTicksProperty); set => SetValue(ShowMajorTicksProperty, value); }

    /// <summary>Major tick length in pixels.</summary>
    public double MajorTickLength { get => GetValue(MajorTickLengthProperty); set => SetValue(MajorTickLengthProperty, value); }

    /// <summary>Draw the minor ticks.</summary>
    public bool ShowMinorTicks { get => GetValue(ShowMinorTicksProperty); set => SetValue(ShowMinorTicksProperty, value); }

    /// <summary>Minor tick length in pixels.</summary>
    public double MinorTickLength { get => GetValue(MinorTickLengthProperty); set => SetValue(MinorTickLengthProperty, value); }

    /// <summary>Draw the tick numbers.</summary>
    public bool ShowTickLabels { get => GetValue(ShowTickLabelsProperty); set => SetValue(ShowTickLabelsProperty, value); }

    /// <summary>Font size of the tick labels.</summary>
    public double TickLabelFontSize { get => GetValue(TickLabelFontSizeProperty); set => SetValue(TickLabelFontSizeProperty, value); }

    /// <summary>Draw the axis names.</summary>
    public bool ShowAxisTitles { get => GetValue(ShowAxisTitlesProperty); set => SetValue(ShowAxisTitlesProperty, value); }

    /// <summary>The X axis name (empty = the spreadsheet's column header).</summary>
    public string? XAxisTitle { get => GetValue(XAxisTitleProperty); set => SetValue(XAxisTitleProperty, value); }

    /// <summary>The Y axis name (empty = the spreadsheet's column header).</summary>
    public string? YAxisTitle { get => GetValue(YAxisTitleProperty); set => SetValue(YAxisTitleProperty, value); }

    /// <summary>Draw the chart title.</summary>
    public bool ShowTitle { get => GetValue(ShowTitleProperty); set => SetValue(ShowTitleProperty, value); }

    /// <summary>The chart title text.</summary>
    public string? Title { get => GetValue(TitleProperty); set => SetValue(TitleProperty, value); }

    /// <summary>Title colour.</summary>
    public Color TitleColor { get => GetValue(TitleColorProperty); set => SetValue(TitleColorProperty, value); }

    /// <summary>Where the title sits.</summary>
    public ChartTitlePosition TitlePosition { get => GetValue(TitlePositionProperty); set => SetValue(TitlePositionProperty, value); }

    /// <summary>Title font size.</summary>
    public double TitleFontSize { get => GetValue(TitleFontSizeProperty); set => SetValue(TitleFontSizeProperty, value); }

    /// <summary>The .xlsx file to read (empty = the inline Values/Points).</summary>
    public string? SourceFile { get => GetValue(SourceFileProperty); set => SetValue(SourceFileProperty, value); }

    /// <summary>Re-read the file when it changes on disk.</summary>
    public bool LiveUpdate { get => GetValue(LiveUpdateProperty); set => SetValue(LiveUpdateProperty, value); }

    /// <summary>The X column letter in the sheet.</summary>
    public string? XColumn { get => GetValue(XColumnProperty); set => SetValue(XColumnProperty, value); }

    /// <summary>The Y column letter in the sheet.</summary>
    public string? YColumn { get => GetValue(YColumnProperty); set => SetValue(YColumnProperty, value); }

    /// <summary>The row holding the axis names.</summary>
    public int HeaderRow { get => GetValue(HeaderRowProperty); set => SetValue(HeaderRowProperty, value); }

    /// <summary>The first row of values.</summary>
    public int FirstDataRow { get => GetValue(FirstDataRowProperty); set => SetValue(FirstDataRowProperty, value); }

    /// <summary>Draw the "…" file picker button in the top-right of the plot.</summary>
    public bool ShowBrowse { get => GetValue(ShowBrowseProperty); set => SetValue(ShowBrowseProperty, value); }

    /// <summary>Fixed X minimum (NaN = auto-fit).</summary>
    public double MinX { get => GetValue(MinXProperty); set => SetValue(MinXProperty, value); }

    /// <summary>Fixed X maximum (NaN = auto-fit).</summary>
    public double MaxX { get => GetValue(MaxXProperty); set => SetValue(MaxXProperty, value); }

    /// <summary>Fixed Y minimum (NaN = auto-fit).</summary>
    public double MinY { get => GetValue(MinYProperty); set => SetValue(MinYProperty, value); }

    /// <summary>Fixed Y maximum (NaN = auto-fit).</summary>
    public double MaxY { get => GetValue(MaxYProperty); set => SetValue(MaxYProperty, value); }

    // ---- data -------------------------------------------------------------------------------

    /// <summary>True for a line plot: X is the sample index and only the Y column is read.</summary>
    protected abstract bool XFromIndex { get; }

    /// <summary>The data to draw when no <see cref="SourceFile"/> is set.</summary>
    protected abstract ChartSeries InlineSeries();

    private ChartSeries? _cached;
    private string? _cacheKey;

    /// <summary>The series for the current settings, cached until something changes.</summary>
    protected ChartSeries Series()
    {
        var file = SourceFile;
        var key = $"{file}|{XColumn}|{YColumn}|{HeaderRow}|{FirstDataRow}|{XFromIndex}";
        if (_cached is not null && _cacheKey == key) return _cached;

        var series = string.IsNullOrWhiteSpace(file)
            ? InlineSeries()
            : SpreadsheetReader.Read(file!, XColumn ?? "B", YColumn ?? "C", HeaderRow, FirstDataRow, XFromIndex);

        _cached = series;
        _cacheKey = key;
        return series;
    }

    /// <summary>Drop the cached data so the next redraw re-reads the file.</summary>
    public void Reload()
    {
        InvalidateCache();
    }

    private void InvalidateCache()
    {
        _cached = null;
        _cacheKey = null;
        InvalidateVisual();
    }

    /// <summary>Replace the plotted data (a line plot can also just append with AddPoint).</summary>
    public void SetValues(IEnumerable<double> values)
    {
        var array = values?.ToArray() ?? Array.Empty<double>();
        SetInlineData(array.Select((_, i) => (double)i).ToArray(), array);
        SetInlineTitles();
        InvalidateCache();
    }

    /// <summary>Append one point and redraw — for a chart fed live from your own code.</summary>
    public void AddPoint(double x, double y)
    {
        var series = InlineSeries();
        var xs = series.Xs.ToList();
        var ys = series.Ys.ToList();
        xs.Add(x);
        ys.Add(y);
        SetInlineData(xs.ToArray(), ys.ToArray());
        InvalidateCache();
    }

    /// <summary>How a subclass stores its inline data (Values or Points).</summary>
    protected abstract void SetInlineData(double[] xs, double[] ys);

    /// <summary>How a subclass names its inline data (usually nothing to do).</summary>
    protected virtual void SetInlineTitles()
    {
    }

    // ---- file picker ------------------------------------------------------------------------

    /// <summary>
    /// Opens the platform's file dialog and, when a workbook is picked, loads it. Does nothing when
    /// the control has no TopLevel yet (a designer preview), so it is always safe to call.
    /// </summary>
    public async Task BrowseForFile()
    {
        try
        {
            var top = TopLevel.GetTopLevel(this);
            if (top?.StorageProvider is not { } storage) return;
            var files = await storage.OpenFilePickerAsync(new FilePickerOpenOptions
            {
                Title = "Select a spreadsheet",
                AllowMultiple = false,
                FileTypeFilter = new[]
                {
                    new FilePickerFileType("Excel workbook") { Patterns = new[] { "*.xlsx" } },
                    new FilePickerFileType("All files") { Patterns = new[] { "*" } }
                }
            });
            var picked = files?.Count > 0 ? files[0].TryGetLocalPath() : null;
            if (!string.IsNullOrWhiteSpace(picked))
            {
                SourceFile = picked;
                InvalidateCache();
            }
        }
        catch
        {
            // No picker available (headless preview, no portal, …): leave the path untouched.
        }
    }

    /// <summary>Clicking the drawn "…" button loads a file.</summary>
    protected override void OnPointerPressed(PointerPressedEventArgs e)
    {
        base.OnPointerPressed(e);
        if (ShowBrowse && _browseRect.Contains(e.GetPosition(this)))
        {
            _ = BrowseForFile();
            e.Handled = true;
        }
    }

    // ---- live update ------------------------------------------------------------------------

    private FileSystemWatcher? _watcher;
    private DispatcherTimer? _debounce;

    /// <inheritdoc/>
    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        RestartWatcher();
    }

    /// <inheritdoc/>
    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        StopWatcher();
        base.OnDetachedFromVisualTree(e);
    }

    private void RestartWatcher()
    {
        StopWatcher();
        var file = SourceFile;
        if (!LiveUpdate || string.IsNullOrWhiteSpace(file)) return;

        try
        {
            var full = Path.GetFullPath(file!);
            var directory = Path.GetDirectoryName(full);
            if (string.IsNullOrEmpty(directory) || !Directory.Exists(directory)) return;

            // Editors save by writing a temp file and renaming it over the original, so watch the
            // FOLDER for the file name rather than the file handle itself (which gets replaced).
            _watcher = new FileSystemWatcher(directory, Path.GetFileName(full))
            {
                NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.Size | NotifyFilters.FileName | NotifyFilters.CreationTime,
                EnableRaisingEvents = true
            };
            _watcher.Changed += OnFileChanged;
            _watcher.Created += OnFileChanged;
            _watcher.Renamed += OnFileChanged;
        }
        catch
        {
            _watcher = null;
        }
    }

    private void OnFileChanged(object sender, FileSystemEventArgs e)
    {
        // A save is not one event — debounce so the file is fully written before re-reading it.
        Dispatcher.UIThread.Post(() =>
        {
            _debounce ??= new DispatcherTimer(TimeSpan.FromMilliseconds(400), DispatcherPriority.Background,
                (_, _) => { _debounce?.Stop(); InvalidateCache(); });
            _debounce.Stop();
            _debounce.Start();
        });
    }

    private void StopWatcher()
    {
        if (_watcher is not null)
        {
            try
            {
                _watcher.EnableRaisingEvents = false;
                _watcher.Changed -= OnFileChanged;
                _watcher.Created -= OnFileChanged;
                _watcher.Renamed -= OnFileChanged;
                _watcher.Dispose();
            }
            catch
            {
                // A watcher that fails to dispose must never take the form down with it.
            }
            _watcher = null;
        }
        _debounce?.Stop();
    }

    // ---- drawing ----------------------------------------------------------------------------

    private Rect _browseRect;

    /// <inheritdoc/>
    public override void Render(DrawingContext context)
    {
        var size = Bounds.Size;
        if (size.Width < 8 || size.Height < 8) return;

        var borderThickness = ShowBorder ? Math.Max(0, BorderThickness) : 0;
        var frame = new Rect(size).Deflate(borderThickness / 2);

        // 1. Frame background + plot-area fill come first, so everything else lands on top.
        var radius = CornerRadius;
        context.DrawRectangle(null, null, new RoundedRect(frame, radius));

        var series = Series();
        var showTitle = ShowTitle && !string.IsNullOrWhiteSpace(Title);
        var titleText = showTitle ? MakeText(Title!, TitleFontSize, TitleColor) : null;

        // 2. Work out the plot rectangle: the frame, minus the breathing room, minus the title and
        //    the axis furniture around it.
        var plot = frame.Deflate(8);
        if (titleText is not null)
        {
            // The title takes a measured strip off one edge, so it can never overlap the plot.
            var strip = titleText.Height + 6;
            plot = TitlePosition switch
            {
                ChartTitlePosition.Top => Chop(plot, 0, strip, 0, 0),
                ChartTitlePosition.Bottom => Chop(plot, 0, 0, 0, strip),
                ChartTitlePosition.Left => Chop(plot, strip, 0, 0, 0),
                _ => Chop(plot, 0, 0, strip, 0)
            };
        }

        var axisTitleText = ShowAxisTitles ? AxisTitles(series) : (X: (FormattedText?)null, Y: (FormattedText?)null);
        var leftLabels = new List<(double Value, string Text)>();
        var bottomLabels = new List<(double Value, string Text)>();
        var leftLabelWidth = 0d;
        var xRange = new AxisRange();
        var yRange = new AxisRange();

        if (series.HasData)
        {
            xRange = AxisRange.For(series.Xs, MinX, MaxX, 6, this is GrumpyLinePlot ? 1 : 5);
            yRange = AxisRange.For(series.Ys, MinY, MaxY, 5, 5);
            if (ShowTickLabels)
            {
                foreach (var v in yRange.Ticks()) leftLabels.Add((v, FormatNumber(v, yRange.Step)));
                foreach (var v in xRange.Ticks()) bottomLabels.Add((v, FormatNumber(v, xRange.Step)));
                foreach (var label in leftLabels)
                {
                    leftLabelWidth = Math.Max(leftLabelWidth, MakeText(label.Text, TickLabelFontSize, AxisColor).Width);
                }
            }
        }

        var labelHeight = ShowTickLabels ? MakeText("0", TickLabelFontSize, AxisColor).Height : 0;
        var tickOut = ShowAxes && ShowMajorTicks ? Math.Max(0, MajorTickLength) : 0;
        var leftGutter = 4 + tickOut + leftLabelWidth
                         + (axisTitleText.Y is null ? 0 : axisTitleText.Y.Height + 6);
        var bottomGutter = 4 + tickOut + labelHeight
                           + (axisTitleText.X is null ? 0 : axisTitleText.X.Height + 6);
        plot = Chop(plot, leftGutter, 0, 0, bottomGutter);
        if (plot.Width <= 4 || plot.Height <= 4) return;

        // 3. Plot-area fill (with its own opacity).
        var opacity = Math.Clamp(PlotBackOpacity, 0, 100) / 100d;
        context.DrawRectangle(new SolidColorBrush(PlotBackColor, opacity), null, plot);

        if (!series.HasData)
        {
            DrawFrame(context, frame, radius, borderThickness);
            DrawTitle(context, titleText, plot, frame);
            DrawMessage(context, plot, series.Error);
            return;
        }

        // 4. Gridlines, then the axes with their ticks and labels.
        if (ShowGrid)
        {
            var gridPen = MakePen(GridColor, GridThickness, GridStyle);
            foreach (var tick in xRange.Ticks())
            {
                var x = xRange.ToPixel(tick, plot.X, plot.Width);
                context.DrawLine(gridPen, new Point(x, plot.Y), new Point(x, plot.Bottom));
            }
            foreach (var tick in yRange.Ticks())
            {
                var y = yRange.ToPixel(tick, plot.Bottom, -plot.Height);
                context.DrawLine(gridPen, new Point(plot.X, y), new Point(plot.Right, y));
            }
        }

        var axisPen = MakePen(AxisColor, 1, ChartLineStyle.Solid);
        if (ShowAxes)
        {
            context.DrawLine(axisPen, new Point(plot.X, plot.Y), new Point(plot.X, plot.Bottom));
            context.DrawLine(axisPen, new Point(plot.X, plot.Bottom), new Point(plot.Right, plot.Bottom));
        }
        MinorAndMajorTicks(context, plot, xRange, yRange);

        if (ShowTickLabels)
        {
            foreach (var (value, text) in bottomLabels)
            {
                var t = MakeText(text, TickLabelFontSize, AxisColor);
                var x = xRange.ToPixel(value, plot.X, plot.Width) - t.Width / 2;
                context.DrawText(t, new Point(x, plot.Bottom + tickOut + 2));
            }
            foreach (var (value, text) in leftLabels)
            {
                var t = MakeText(text, TickLabelFontSize, AxisColor);
                var y = yRange.ToPixel(value, plot.Bottom, -plot.Height) - t.Height / 2;
                context.DrawText(t, new Point(plot.X - tickOut - 2 - t.Width, y));
            }
        }

        if (axisTitleText.Y is not null)
        {
            // Rotate FIRST, then translate: Avalonia's matrices are row-vector, so they compose
            // left-to-right. Getting this backwards draws the title above the control's own bounds
            // (which is how it ends up inside the chart sitting above it on the form).
            var axisTitleY = plot.Y + plot.Height / 2 + axisTitleText.Y.Width / 2;
            using (context.PushTransform(Matrix.CreateRotation(-Math.PI / 2)
                                         * Matrix.CreateTranslation(frame.X + 3, axisTitleY)))
            {
                context.DrawText(axisTitleText.Y, new Point(0, 0));
            }
        }
        if (axisTitleText.X is not null)
        {
            var x = plot.X + (plot.Width - axisTitleText.X.Width) / 2;
            context.DrawText(axisTitleText.X, new Point(x, plot.Bottom + tickOut + 2 + labelHeight + 2));
        }

        // 5. The data itself, clipped to the plot area.
        using (context.PushClip(plot))
        {
            var points = series.Xs.Select((_, i) => new Point(
                xRange.ToPixel(series.Xs[i], plot.X, plot.Width),
                yRange.ToPixel(series.Ys[i], plot.Bottom, -plot.Height))).ToArray();

            if (Connected && points.Length > 1)
            {
                var pen = MakePen(LineColor, LineThickness, LineStyle);
                for (var i = 1; i < points.Length; i++) context.DrawLine(pen, points[i - 1], points[i]);
            }
            DrawMarkers(context, points);
        }

        // 6. Frame + title last, so nothing can overdraw them.
        DrawFrame(context, frame, radius, borderThickness);
        DrawTitle(context, titleText, plot, frame);
        DrawBrowseButton(context, frame);
    }

    private void DrawMarkers(DrawingContext context, Point[] points)
    {
        if (MarkerStyle == ChartMarkerStyle.None) return;
        var size = Math.Max(2, MarkerSize);
        var brush = new SolidColorBrush(LineColor);
        var pen = new Pen(brush, 1);
        foreach (var p in points)
        {
            switch (MarkerStyle)
            {
                case ChartMarkerStyle.Dot:
                    context.DrawEllipse(brush, null, p, size / 2, size / 2);
                    break;
                case ChartMarkerStyle.Cross:
                    context.DrawLine(pen, new Point(p.X - size / 2, p.Y - size / 2), new Point(p.X + size / 2, p.Y + size / 2));
                    context.DrawLine(pen, new Point(p.X - size / 2, p.Y + size / 2), new Point(p.X + size / 2, p.Y - size / 2));
                    break;
                case ChartMarkerStyle.Square:
                    context.DrawRectangle(brush, null, new Rect(p.X - size / 2, p.Y - size / 2, size, size));
                    break;
                case ChartMarkerStyle.Diamond:
                    var half = size / 2;
                    var geometry = new StreamGeometry();
                    using (var g = geometry.Open())
                    {
                        g.BeginFigure(new Point(p.X, p.Y - half), true);
                        g.LineTo(new Point(p.X + half, p.Y));
                        g.LineTo(new Point(p.X, p.Y + half));
                        g.LineTo(new Point(p.X - half, p.Y));
                        g.EndFigure(true);
                    }
                    context.DrawGeometry(brush, null, geometry);
                    break;
            }
        }
    }

    private void MinorAndMajorTicks(DrawingContext context, Rect plot, AxisRange xRange, AxisRange yRange)
    {
        var axisPen = MakePen(AxisColor, 1, ChartLineStyle.Solid);
        if (ShowAxes && ShowMinorTicks && MinorTickLength > 0)
        {
            foreach (var tick in xRange.MinorTicks())
            {
                var x = xRange.ToPixel(tick, plot.X, plot.Width);
                context.DrawLine(axisPen, new Point(x, plot.Bottom), new Point(x, plot.Bottom + MinorTickLength));
            }
            foreach (var tick in yRange.MinorTicks())
            {
                var y = yRange.ToPixel(tick, plot.Bottom, -plot.Height);
                context.DrawLine(axisPen, new Point(plot.X - MinorTickLength, y), new Point(plot.X, y));
            }
        }
        if (ShowAxes && ShowMajorTicks && MajorTickLength > 0)
        {
            foreach (var tick in xRange.Ticks())
            {
                var x = xRange.ToPixel(tick, plot.X, plot.Width);
                context.DrawLine(axisPen, new Point(x, plot.Bottom), new Point(x, plot.Bottom + MajorTickLength));
            }
            foreach (var tick in yRange.Ticks())
            {
                var y = yRange.ToPixel(tick, plot.Bottom, -plot.Height);
                context.DrawLine(axisPen, new Point(plot.X - MajorTickLength, y), new Point(plot.X, y));
            }
        }
    }

    private void DrawFrame(DrawingContext context, Rect frame, CornerRadius radius, double thickness)
    {
        if (thickness <= 0) return;
        context.DrawRectangle(null, new Pen(new SolidColorBrush(BorderBrush), thickness),
            new RoundedRect(frame, radius));
    }

    private void DrawTitle(DrawingContext context, FormattedText? title, Rect plot, Rect frame)
    {
        if (title is null) return;
        switch (TitlePosition)
        {
            case ChartTitlePosition.Top:
                context.DrawText(title, new Point(plot.X + (plot.Width - title.Width) / 2, frame.Y + 4));
                break;
            case ChartTitlePosition.Bottom:
                context.DrawText(title, new Point(plot.X + (plot.Width - title.Width) / 2, plot.Bottom + 4));
                break;
            case ChartTitlePosition.Left:
                // Rotate then translate (see the Y axis title in Render): the rotated text starts at
                // the anchor and reads upward, so the anchor sits half a text-width below centre.
                var leftY = plot.Y + plot.Height / 2 + title.Width / 2;
                using (context.PushTransform(Matrix.CreateRotation(-Math.PI / 2)
                                             * Matrix.CreateTranslation(frame.X + 4, leftY)))
                {
                    context.DrawText(title, new Point(0, 0));
                }
                break;
            case ChartTitlePosition.Right:
                var rightY = plot.Y + plot.Height / 2 + title.Width / 2;
                using (context.PushTransform(Matrix.CreateRotation(-Math.PI / 2)
                                             * Matrix.CreateTranslation(frame.Right - 4 - title.Height, rightY)))
                {
                    context.DrawText(title, new Point(0, 0));
                }
                break;
        }
    }

    private void DrawMessage(DrawingContext context, Rect plot, string? message)
    {
        var text = string.IsNullOrWhiteSpace(message)
            ? "No data — set Values, or point SourceFile at an .xlsx"
            : message!;
        var formatted = MakeText(text, 12, Color.Parse("#909090"));
        if (formatted.Width > plot.Width) return;   // too small to say anything readable
        context.DrawText(formatted, new Point(
            plot.X + (plot.Width - formatted.Width) / 2,
            plot.Y + (plot.Height - formatted.Height) / 2));
    }

    private void DrawBrowseButton(DrawingContext context, Rect frame)
    {
        _browseRect = default;
        if (!ShowBrowse) return;
        var size = 18d;
        var rect = new Rect(frame.Right - size - 4, frame.Y + 4, size, size);
        _browseRect = rect;
        context.DrawRectangle(new SolidColorBrush(Color.Parse("#F0F0F0")),
            new Pen(new SolidColorBrush(Color.Parse("#C0C0C0")), 1), new RoundedRect(rect, new CornerRadius(3)));
        var dots = MakeText("…", 12, Color.Parse("#505050"));
        context.DrawText(dots, new Point(rect.X + (size - dots.Width) / 2, rect.Y + (size - dots.Height) / 2));
    }

    /// <summary>Resolves the two axis names: the explicit properties win, then the sheet's headers.</summary>
    private (FormattedText? X, FormattedText? Y) AxisTitles(ChartSeries series)
    {
        var x = !string.IsNullOrWhiteSpace(XAxisTitle) ? XAxisTitle! : series.XTitle;
        var y = !string.IsNullOrWhiteSpace(YAxisTitle) ? YAxisTitle! : series.YTitle;
        return (
            string.IsNullOrWhiteSpace(x) ? null : MakeText(x, TickLabelFontSize, AxisColor),
            string.IsNullOrWhiteSpace(y) ? null : MakeText(y, TickLabelFontSize, AxisColor));
    }

    private static FormattedText MakeText(string text, double size, Color color)
        => new(text, CultureInfo.CurrentCulture, FlowDirection.LeftToRight,
            new Typeface(FontFamily.Default), Math.Max(6, size), new SolidColorBrush(color));

    /// <summary>Trims the given amounts off a rectangle's edges (never past zero size).</summary>
    private static Rect Chop(Rect rect, double left, double top, double right, double bottom)
        => new(rect.X + left, rect.Y + top,
               Math.Max(0, rect.Width - left - right), Math.Max(0, rect.Height - top - bottom));

    private static IPen MakePen(Color color, double thickness, ChartLineStyle style)
        => new Pen(new SolidColorBrush(color), Math.Max(0.5, thickness), DashFor(style))
        {
            // Round caps make the Dot style read as dots rather than as nothing at all.
            LineCap = style == ChartLineStyle.Dot ? PenLineCap.Round : PenLineCap.Flat
        };

    private static IDashStyle? DashFor(ChartLineStyle style) => style switch
    {
        ChartLineStyle.Dash => new DashStyle(new double[] { 4, 3 }, 0),
        // A dash of ~0 with round caps is a dot; a true 0-length dash can vanish on some renderers.
        ChartLineStyle.Dot => new DashStyle(new double[] { 0.01, 3 }, 0),
        ChartLineStyle.DashDot => new DashStyle(new double[] { 4, 3, 0.01, 3 }, 0),
        _ => null
    };

    private static string FormatNumber(double value, double step)
    {
        var decimals = step >= 1 ? 0 : Math.Min(6, (int)Math.Ceiling(-Math.Log10(step)) + 1);
        var text = value.ToString("0." + new string('#', Math.Max(0, decimals)), CultureInfo.CurrentCulture);
        return text == "-0" ? "0" : text;
    }
}

/// <summary>
/// A fitted axis: the range actually drawn, the tick step, and the data→pixel mapping. Built from
/// the data (auto-fit) or from explicit Min/Max, and snapped outward to "nice" 1/2/5 x 10^n steps so
/// the labels are round numbers.
/// </summary>
internal sealed class AxisRange
{
    private double _min;
    private double _max;

    /// <summary>The tick step (also the basis for the label precision).</summary>
    internal double Step { get; private set; } = 1;

    /// <summary>The subdivisions of a major step (minor ticks).</summary>
    private int Subdivisions { get; set; } = 5;

    /// <summary>Builds the range for one axis of data.</summary>
    internal static AxisRange For(IReadOnlyList<double> values, double forcedMin, double forcedMax,
                                 int targetTicks, int subdivisions)
    {
        var range = new AxisRange { Subdivisions = Math.Max(1, subdivisions) };
        var min = double.IsNaN(forcedMin) ? values.Min() : forcedMin;
        var max = double.IsNaN(forcedMax) ? values.Max() : forcedMax;
        if (max <= min) max = min + (Math.Abs(min) > 1 ? Math.Abs(min) * 0.1 : 1);

        range.Step = NiceStep(max - min, Math.Max(2, targetTicks));
        if (double.IsNaN(forcedMin)) min = Math.Floor(min / range.Step) * range.Step;
        if (double.IsNaN(forcedMax)) max = Math.Ceiling(max / range.Step) * range.Step;
        // Always include the span, even when a forced bound falls inside it.
        range._min = Math.Min(min, max);
        range._max = Math.Max(min, max);
        if (range._max <= range._min) range._max = range._min + range.Step;
        return range;
    }

    /// <summary>A 1, 2 or 5 (times a power of ten) step that gives roughly <paramref name="target"/> ticks.</summary>
    private static double NiceStep(double span, int target)
    {
        if (span <= 0 || double.IsNaN(span) || double.IsInfinity(span)) return 1;
        var rough = span / target;
        var magnitude = Math.Pow(10, Math.Floor(Math.Log10(rough)));
        var normalised = rough / magnitude;
        var nice = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
        return nice * magnitude;
    }

    /// <summary>The major tick values across the range.</summary>
    internal IEnumerable<double> Ticks()
    {
        var count = (int)Math.Round((_max - _min) / Step);
        count = Math.Clamp(count, 0, 1000);
        for (var i = 0; i <= count; i++) yield return _min + i * Step;
    }

    /// <summary>The minor tick values (the major step split into <see cref="Subdivisions"/>).</summary>
    internal IEnumerable<double> MinorTicks()
    {
        if (Subdivisions < 2) yield break;
        var sub = Step / Subdivisions;
        var count = (int)Math.Round((_max - _min) / sub);
        count = Math.Clamp(count, 0, 5000);
        for (var i = 0; i <= count; i++)
        {
            var value = _min + i * sub;
            if (i % Subdivisions != 0) yield return value;
        }
    }

    /// <summary>One value's pixel position along an axis drawn from <paramref name="origin"/> by <paramref name="length"/>.</summary>
    internal double ToPixel(double value, double origin, double length)
        => origin + (value - _min) / (_max - _min) * length;
}

/// <summary>
/// A LINE PLOT: Y values in sample order, with the X axis running 0…N-1. Feed it from an array
/// (<see cref="Values"/>) or from an .xlsx file (column C by default).
/// </summary>
public class GrumpyLinePlot : ChartBase
{
    /// <summary>The Y samples to draw. X is the sample index (0,1,2…).</summary>
    public static readonly StyledProperty<double[]?> ValuesProperty =
        AvaloniaProperty.Register<GrumpyLinePlot, double[]?>(nameof(Values));

    static GrumpyLinePlot()
    {
        AffectsRender<GrumpyLinePlot>(ValuesProperty);
        ValuesProperty.Changed.AddClassHandler<GrumpyLinePlot>((plot, _) => plot.Reload());
    }

    /// <summary>The Y samples (X is the sample index).</summary>
    [TypeConverter(typeof(DoubleArrayConverter))]
    public double[]? Values { get => GetValue(ValuesProperty); set => SetValue(ValuesProperty, value); }

    /// <inheritdoc/>
    protected override bool XFromIndex => true;

    /// <inheritdoc/>
    protected override ChartSeries InlineSeries()
    {
        var values = Values ?? Array.Empty<double>();
        var series = new ChartSeries
        {
            Xs = Enumerable.Range(0, values.Length).Select(i => (double)i).ToArray(),
            Ys = values
        };
        if (values.Length == 0) series.Error = null;   // an empty plot is fine, not an error
        return series;
    }

    /// <inheritdoc/>
    protected override void SetInlineData(double[] xs, double[] ys) => Values = ys;
}

/// <summary>
/// An X,Y PLOT: (x,y) pairs, drawn as a line, as markers, or both. Feed it from a 2-D array
/// (<see cref="Points"/>) or from an .xlsx file (column B = X, column C = Y by default).
/// </summary>
public class GrumpyXYPlot : ChartBase
{
    /// <summary>The (x,y) pairs to draw — an n×2 array.</summary>
    public static readonly StyledProperty<double[,]?> PointsProperty =
        AvaloniaProperty.Register<GrumpyXYPlot, double[,]?>(nameof(Points));

    static GrumpyXYPlot()
    {
        AffectsRender<GrumpyXYPlot>(PointsProperty);
        PointsProperty.Changed.AddClassHandler<GrumpyXYPlot>((plot, _) => plot.Reload());
    }

    /// <summary>The (x,y) pairs — an n×2 array.</summary>
    [TypeConverter(typeof(DoubleMatrixConverter))]
    public double[,]? Points { get => GetValue(PointsProperty); set => SetValue(PointsProperty, value); }

    /// <inheritdoc/>
    protected override bool XFromIndex => false;

    /// <inheritdoc/>
    protected override ChartSeries InlineSeries()
    {
        var points = Points;
        if (points is null) return new ChartSeries();
        var count = points.GetLength(0);
        var series = new ChartSeries { Xs = new double[count], Ys = new double[count] };
        for (var i = 0; i < count; i++)
        {
            series.Xs[i] = points[i, 0];
            series.Ys[i] = points[i, 1];
        }
        return series;
    }

    /// <inheritdoc/>
    protected override void SetInlineData(double[] xs, double[] ys)
    {
        var points = new double[Math.Min(xs.Length, ys.Length), 2];
        for (var i = 0; i < points.GetLength(0); i++)
        {
            points[i, 0] = xs[i];
            points[i, 1] = ys[i];
        }
        Points = points;
    }
}
