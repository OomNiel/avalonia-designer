// GrumpyCharts.cs — BUNDLED RESOURCE (the VB twin is resources/GrumpyCharts.vb). Copied into every
// generated project, next to ChromeWindow.cs / PathPicker.cs / GrumpyPanel.cs.
//
// A small, dependency-free CHART CONTROL SET: two controls that draw themselves, with no NuGet
// package, no template and no assets. Every chart type supports MULTIPLE SERIES, each with its own
// line/marker styling and its own axis mode.
//
//   <charts:GrumpyLinePlot x:Name="LinePlot1" Width="320" Height="180" SourceFile="/home/me/data.xlsx">
//     <charts:LineSeries Title="Inside"  YColumn="C" LineColor="#4ea6a1" MarkerStyle="Dot"/>
//     <charts:LineSeries Title="Outside" YColumn="E" LineColor="#e08a3c" MarkerStyle="Cross"/>
//   </charts:GrumpyLinePlot>
//
//   <charts:GrumpyXYPlot x:Name="XYPlot1" SourceFile="/home/me/data.xlsx">
//     <charts:XYSeries Title="Sensor A" XColumn="B" YColumn="C" AxisMode="Common"/>
//     <charts:XYSeries Title="Sensor B" XColumn="D" YColumn="E" AxisMode="PerSeries">
//       <charts:XYSeries.YAxis>
//         <charts:Axis Position="Right" AxisColor="#e08a3c"/>
//       </charts:XYSeries.YAxis>
//     </charts:XYSeries>
//   </charts:GrumpyXYPlot>
//
// SERIES
// ------
//   LineSeries  Y values in sample order; X counts 0..N-1 (the sample index).
//   XYSeries    (x,y) pairs.
//   Both carry: Title, XColumn, YColumn, AxisMode, LineColor, LineThickness, LineStyle,
//   MarkerStyle, MarkerSize, Connected — and optional XAxis / YAxis children (see AXES).
//   Series are drawn IN ORDER, so the list order is the z-order.
//
// DATA (an .xlsx, read with plain System.IO.Compression + XML — no dependency)
// ---------------------------------------------------------------------------
//   The spreadsheet layout is the SAME for both chart types: a series' Y data comes from a Y column,
//   and the columns pair up B/C, D/E, F/G … So series 1 reads Y from column C, series 2 from E,
//   series 3 from G, and each series' X defaults to the partner column (B, D, F) when it needs one.
//   Row 1 names the axes, data starts at row 2 (XColumn / YColumn / HeaderRow / FirstDataRow change
//   that; a series' own XColumn / YColumn override the chart's for that series).
//
//     AxisMode = Common     every series is plotted against the SHARED X column (the chart's
//                           XColumn, default B) and shares one scale, so the series are comparable.
//                           A line series always uses the sample index for X.
//     AxisMode = PerSeries  the series uses its OWN XColumn/YColumn pair and its own scale.
//
//   A chart with NO series elements still works as a single implicit series, styled from the
//   chart-level LineColor / MarkerStyle / … (kept for older forms), or from Values / Points:
//     <charts:GrumpyLinePlot Values="4,9,6,12" .../>          (Y samples, X = index)
//     <charts:GrumpyXYPlot Points="0,0 1,4 2,9" .../>         (x,y pairs)
//   Code can push data at any time: SetValues(...) / AddPoint(x, y).
//
// AXES
// ----
//   The chart-level rows (ShowAxes, AxisColor, ticks, tick labels, XAxisTitle / YAxisTitle, Min/Max,
//   gridlines) describe the COMMON axis — the one every series uses by default. A series that opts
//   into PerSeries can carry its own <charts:Axis> for X and/or Y, each with:
//     Position (Left | Right for a Y axis, Top | Bottom for an X axis), ShowAxis, AxisColor,
//     ShowMajorTicks, ShowMinorTicks, ShowTickLabels, ShowAxisName, Name
//   Deleting the axis element puts that series back on the common axis.
//
// STYLE (chart-level; all optional — the defaults are presentation-ready)
// ---------------------------------------------------------------------
//   Frame        ShowBorder, BorderBrush, BorderThickness, CornerRadius
//   Plot area    PlotBackColor (fills the whole chart), PlotBackOpacity (0-100 %)
//   Gridlines    ShowGrid, GridColor, GridThickness, GridStyle (Solid | Dash | Dot | DashDot)
//   Common axis  ShowAxes, AxisColor, ShowMajorTicks, MajorTickLength, ShowMinorTicks,
//                MinorTickLength, ShowTickLabels, TickLabelFontSize, ShowAxisTitles,
//                XAxisTitle, YAxisTitle
//   Title        ShowTitle, Title, TitleColor, TitlePosition (Top | Bottom | Left | Right),
//                TitleFontSize
//   Scaling      Auto-fit; MinX / MaxX / MinY / MaxY override it (empty = auto-fit)
//
// NOTES
// -----
//   * Everything is proportional, so the chart survives any resize.
//   * Ranges auto-fit and then SNAP outward to "nice" tick values (1/2/5 x 10^n), which is what makes
//     the labels read as 0, 5, 10, 15 rather than 0.37, 3.7, 7.03.
//   * A missing or unreadable file draws a short explanation inside the plot area instead of throwing.
//   * LiveUpdate = True re-reads the workbook when it changes on disk, and the chart's right-click menu
//     carries "Choose spreadsheet…" (BrowseForFile()). It needs a TopLevel, so it is a no-op in the
//     preview and safe to leave in place.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using Avalonia;
using Avalonia.Collections;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Input.Platform;
using Avalonia.Media;
using Avalonia.Metadata;
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

/// <summary>The point symbol used by a series.</summary>
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

/// <summary>Where the legend bar sits: across the bottom (the default), across the top, or down a
/// side. A Top/Bottom legend spans the chart's width and wraps onto further rows; a Left/Right one
/// fills the side and wraps onto further columns.</summary>
public enum LegendPosition
{
    /// <summary>Across the bottom of the drawing area.</summary>
    Bottom,
    /// <summary>Across the top of the drawing area.</summary>
    Top,
    /// <summary>Down the left-hand side, one entry per row.</summary>
    Left,
    /// <summary>Down the right-hand side.</summary>
    Right
}

/// <summary>Where an axis is drawn: Left/Right for a Y axis, Top/Bottom for an X axis.</summary>
public enum AxisPosition
{    /// <summary>The left edge (a Y axis).</summary>
    Left,
    /// <summary>The right edge (a Y axis).</summary>
    Right,
    /// <summary>The top edge (an X axis).</summary>
    Top,
    /// <summary>The bottom edge (an X axis — the default).</summary>
    Bottom
}

/// <summary>Whether a series is plotted against the shared axis or its own.</summary>
public enum AxisMode
{
    /// <summary>Use the chart's common axis (the default): one shared X and one shared scale.</summary>
    Common,
    /// <summary>Use this series' own X/Y columns and its own axis (see <see cref="ChartSeries.XAxis"/>).</summary>
    PerSeries
}

/// <summary>
/// Which parts of a cursor are DRAWN. A cursor always carries both an X and a Y position (the mouse
/// moves it in both directions); this only decides which lines are visible: <c>Vertical</c> is the
/// crosshair minus its horizontal line, <c>Horizontal</c> is the crosshair minus its vertical line.
/// </summary>
public enum CursorOrientation
{
    /// <summary>Draw the crosshair: the vertical line and the horizontal line.</summary>
    Both,
    /// <summary>Draw the vertical line only.</summary>
    Vertical,
    /// <summary>Draw the horizontal line only.</summary>
    Horizontal
}

/// <summary>The dash pattern of a cursor's lines.</summary>
public enum CursorStyle
{
    /// <summary>An unbroken line.</summary>
    Solid,
    /// <summary>Dashes (the default).</summary>
    Dash,
    /// <summary>Dots.</summary>
    Dot,
    /// <summary>Long dashes.</summary>
    Long,
    /// <summary>Short dashes.</summary>
    Short
}

/// <summary>Where the cursor readout — the selected trace and its values — is drawn.</summary>
public enum CursorReadout
{
    /// <summary>In a small panel that follows the mouse pointer (the default).</summary>
    FollowMouse,
    /// <summary>In the top right corner of the drawing area, out of the way.</summary>
    TopRight
}

/// <summary>How the bars of a <see cref="GrumpyBarPlot"/> stand in their category.</summary>
public enum BarMode
{
    /// <summary>Side by side, one bar per series per category (the default) — the easiest to compare.</summary>
    Grouped,
    /// <summary>Each series starts where the previous one ended, so a category reads as its total.</summary>
    Stacked,
    /// <summary>Stacked and filled to 100%, which turns the same data into a share-of-total chart.</summary>
    Stacked100
}

/// <summary>How the series of a <see cref="GrumpyAreaPlot"/> are filled.</summary>
public enum AreaMode
{
    /// <summary>Every series is its own filled shape, drawn over the ones before it (the default).</summary>
    Plain,
    /// <summary>Every series is filled from the top of the previous one (a stacked area).</summary>
    Stacked,
    /// <summary>Stacked and filled to 100% — a share-of-total picture over the categories.</summary>
    Stacked100
}

/// <summary>Where a chart's data comes from (the Data Selector editor's first choice).</summary>
public enum DataSourceKind
{
    /// <summary>A page of an .xlsx workbook (the default): see SourceFile and SourceSheet.</summary>
    Spreadsheet,
    /// <summary>A data file such as a CSV — named by DataFile, not read yet.</summary>
    DataFiles
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

/// <summary>The series styling shared by <see cref="LineSeries"/> and <see cref="XYSeries"/>.</summary>
public abstract class ChartSeries
{
    /// <summary>The name shown for this series (in the editor; charts do not draw a legend yet).</summary>
    public string? Title { get; set; }

    /// <summary>The spreadsheet column holding this series' X values. Empty = the chart's XColumn,
    /// and a line series always uses the sample index instead.</summary>
    public string? XColumn { get; set; }

    /// <summary>The spreadsheet column holding this series' Y values. Empty = the chart's YColumn.</summary>
    public string? YColumn { get; set; }

    /// <summary>Common (the chart's shared axis) or PerSeries (this series' own X/Y columns and scale).</summary>
    public AxisMode AxisMode { get; set; } = AxisMode.Common;

    /// <summary>Colour of this series' line and markers.</summary>
    public Color LineColor { get; set; } = Color.Parse("#2D7DD2");

    /// <summary>Thickness of this series' line.</summary>
    public double LineThickness { get; set; } = 2d;

    /// <summary>Solid, dashed, dotted or dash-dot.</summary>
    public ChartLineStyle LineStyle { get; set; } = ChartLineStyle.Solid;

    /// <summary>The symbol drawn at each point: None, Dot, Cross, Square or Diamond.</summary>
    public ChartMarkerStyle MarkerStyle { get; set; } = ChartMarkerStyle.Dot;

    /// <summary>Marker diameter in pixels.</summary>
    public double MarkerSize { get; set; } = 8d;

    /// <summary>Join the points with a line (False = markers only).</summary>
    public bool Connected { get; set; } = true;

    /// <summary>Draw this series at all. Off = its trace is switched off (the legend's tick box).
    /// The series keeps its place in the chart's scale, so toggling a trace does not move the axes.</summary>
    public bool Visible { get; set; } = true;

    /// <summary>This series' own X axis (only used with AxisMode = PerSeries).</summary>
    public Axis? XAxis { get; set; }

    /// <summary>This series' own Y axis (only used with AxisMode = PerSeries).</summary>
    public Axis? YAxis { get; set; }

    /// <summary>True for a line series: X is the sample index, so only the Y column is read.</summary>
    internal abstract bool XFromIndex { get; }

    /// <summary>True when this series is plotted against its own scale.</summary>
    internal bool PerSeries => AxisMode == AxisMode.PerSeries;
}

/// <summary>A LINE SERIES: Y values in sample order, with X running 0…N-1.</summary>
public class LineSeries : ChartSeries
{
    internal override bool XFromIndex => true;
}

/// <summary>An X,Y SERIES: (x,y) pairs, drawn as a line, as markers, or both.</summary>
public class XYSeries : ChartSeries
{
    internal override bool XFromIndex => false;
}

/// <summary>
/// One axis of a series: where it sits, whether it is drawn, its colour, which of its parts are
/// shown, and its name. A Y axis uses <see cref="AxisPosition.Left"/>/<see cref="AxisPosition.Right"/>;
/// an X axis uses <see cref="AxisPosition.Top"/>/<see cref="AxisPosition.Bottom"/>.
/// </summary>
public sealed class Axis
{
    /// <summary>Left/Right for a Y axis, Top/Bottom for an X axis.</summary>
    public AxisPosition Position { get; set; } = AxisPosition.Left;

    /// <summary>Draw this axis at all.</summary>
    public bool ShowAxis { get; set; } = true;

    /// <summary>Colour of the axis line and its ticks. The tick labels and the name follow it unless
    /// their own colours are set.</summary>
    public Color AxisColor { get; set; } = Color.Parse("#666666");

    /// <summary>Colour of this axis' tick labels. Null = follow <see cref="AxisColor"/>, which is what
    /// every form written before this existed means.</summary>
    public Color? TickLabelColor { get; set; }

    /// <summary>Colour of this axis' name. Null = follow <see cref="AxisColor"/>.</summary>
    public Color? NameColor { get; set; }

    /// <summary>The colour the tick labels are drawn in: their own, else the axis colour.</summary>
    public Color LabelColor => TickLabelColor ?? AxisColor;

    /// <summary>The colour the axis name is drawn in: its own, else the axis colour.</summary>
    public Color AxisNameColor => NameColor ?? AxisColor;

    /// <summary>Draw the ticks at the labelled values.</summary>
    public bool ShowMajorTicks { get; set; } = true;

    /// <summary>Draw the short ticks between the labelled values.</summary>
    public bool ShowMinorTicks { get; set; } = true;

    /// <summary>Length of the ticks at the labelled values, in pixels.</summary>
    public double MajorTickLength { get; set; } = 6d;

    /// <summary>Length of the short ticks between them, in pixels.</summary>
    public double MinorTickLength { get; set; } = 3d;

    /// <summary>Draw the numbers along this axis.</summary>
    public bool ShowTickLabels { get; set; } = true;

    /// <summary>Font size of this axis' tick labels and its name.</summary>
    public double TickLabelFontSize { get; set; } = 11d;

    /// <summary>Draw this axis' name (from <see cref="Name"/>, or the spreadsheet's column header).</summary>
    public bool ShowAxisName { get; set; } = true;

    /// <summary>The axis name. Empty = use the spreadsheet's column header.</summary>
    public string? Name { get; set; }

    /// <summary>A copy of this axis, for the renderer's per-series use.</summary>
    internal Axis Clone() => new()
    {
        Position = Position,
        ShowAxis = ShowAxis,
        AxisColor = AxisColor,
        TickLabelColor = TickLabelColor,
        NameColor = NameColor,
        ShowMajorTicks = ShowMajorTicks,
        MajorTickLength = MajorTickLength,
        ShowMinorTicks = ShowMinorTicks,
        MinorTickLength = MinorTickLength,
        ShowTickLabels = ShowTickLabels,
        TickLabelFontSize = TickLabelFontSize,
        ShowAxisName = ShowAxisName,
        Name = Name
    };
}

/// <summary>
/// One cursor of a chart: a crosshair the user can drag, with a readout of the selected trace's
/// values where it crosses. Up to two cursors are drawn (see <see cref="ChartBase.Cursors"/>); the
/// Cursor Editor adds and removes them and sets these properties.
/// <para>
/// A cursor carries BOTH an X and a Y position even when only one line is drawn, so a
/// <see cref="CursorOrientation.Horizontal"/> cursor still reports a meaningful X. Both are in DATA
/// units (not pixels), so a cursor stays on the same value when the chart is resized or the data
/// changes. <see cref="double.NaN"/> means "not placed yet" — the renderer puts it in the middle of
/// the axis.
/// </para>
/// </summary>
public sealed class ChartCursor
{
    /// <summary>Which lines are drawn: Both (the crosshair), Vertical or Horizontal.</summary>
    public CursorOrientation Orientation { get; set; } = CursorOrientation.Both;

    /// <summary>The dash pattern of this cursor's lines.</summary>
    public CursorStyle Style { get; set; } = CursorStyle.Dash;

    /// <summary>Colour of this cursor's lines, its handle and the heading of its readout.</summary>
    public Color Color { get; set; } = Colors.DarkOrange;

    /// <summary>Show the cursor's X value in the readout.</summary>
    public bool XValues { get; set; } = true;

    /// <summary>Show the selected trace's Y value (interpolated at the cursor) in the readout.</summary>
    public bool YValues { get; set; } = true;

    /// <summary>The cursor's X position in data units. NaN = the middle of the X range.</summary>
    public double X { get; set; } = double.NaN;

    /// <summary>The cursor's Y position in data units. NaN = the middle of the Y range. Ignored while
    /// <see cref="FollowTrace"/> is on, because the crossing's Y then comes from the trace.</summary>
    public double Y { get; set; } = double.NaN;

    /// <summary>
    /// Follow the selected trace (on by default): the crossing point — the handle, the horizontal line
    /// and the value in the readout — sits ON that series at the cursor's X, interpolated between
    /// samples, instead of at the cursor's own <see cref="Y"/>. Dragging the horizontal line then slides
    /// the point along the trace. Switch it off for a free crosshair whose Y is yours to place, which is
    /// what a threshold line wants to be.
    /// </summary>
    public bool FollowTrace { get; set; } = true;

    /// <summary>
    /// Whether the cursor is switched on. The right-click menu switches cursors on and off while the
    /// app runs: that is a RUNTIME state, so it is not written back to the form (a fresh start shows
    /// every cursor in the XAML as on).
    /// </summary>
    public bool Enabled { get; set; } = true;
}

/// <summary>One series of points, plus the axis names and any reason there is no data.</summary>
public sealed class ChartData
{
    /// <summary>The X values (for a line series these are the sample indices 0,1,2…).</summary>
    public double[] Xs { get; set; } = Array.Empty<double>();

    /// <summary>The Y values.</summary>
    public double[] Ys { get; set; } = Array.Empty<double>();

    /// <summary>
    /// A NAME for each point, when the point has one: the category text of a bar or area chart (the
    /// label column of the workbook) or the slice name of a pie. Empty, or shorter than the values,
    /// when the data has no names — every reader of it falls back to the number or to the index.
    /// </summary>
    public string[] Labels { get; set; } = Array.Empty<string>();

    /// <summary>The X axis name (the spreadsheet's X-column header).</summary>
    public string XTitle { get; set; } = string.Empty;

    /// <summary>The Y axis name (the spreadsheet's Y-column header).</summary>
    public string YTitle { get; set; } = string.Empty;

    /// <summary>Why this series has nothing to draw, or <c>null</c> when it is fine.</summary>
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

    /// <summary>The column letter(s) one step after <paramref name="column"/> ("A"+"2" → "C", "Z"+2 → "AB").</summary>
    internal static string ColumnAfter(string column, int step)
    {
        var index = ColumnIndex(column) + step;
        if (index < 0) index = 0;
        var text = string.Empty;
        for (var n = index + 1; n > 0; n = (n - 1) / 26) text = (char)('A' + (n - 1) % 26) + text;
        return text;
    }

    /// <summary>The column letters in a cell reference such as "BC12" (trailing digits dropped).</summary>
    private static string ColumnOf(string cellRef)
    {
        var end = 0;
        while (end < cellRef.Length && char.IsLetter(cellRef[end])) end++;
        return cellRef.Substring(0, end);
    }

    /// <summary>
    /// Reads one series. <paramref name="xFromIndex"/> makes a line series: the X values are the
    /// sample indices and only the Y column is read (falling back to the X column when the Y column
    /// turns out to be empty, so a one-column sheet still draws).
    /// </summary>
    internal static ChartData Read(string path, string xColumn, string yColumn,
                                   int headerRow, int firstDataRow, bool xFromIndex, string? sheet = null)
    {
        var data = new ChartData();
        try
        {
            using var zip = OpenWorkbook(path);
            var shared = ReadSharedStrings(zip);
            var sheetPart = FindSheet(zip, sheet);
            if (sheetPart is null)
            {
                data.Error = string.IsNullOrWhiteSpace(sheet)
                    ? $"\"{Path.GetFileName(path)}\" has no worksheet."
                    : $"\"{Path.GetFileName(path)}\" has no page called \"{sheet!.Trim()}\".";
                return data;
            }

            var xi = ColumnIndex(xColumn);
            var yi = ColumnIndex(yColumn);
            var xs = new List<double>();
            var ys = new List<double>();
            var labels = new List<string>();
            var xsFallback = new List<double>();
            var ysFallback = new List<double>();
            var xTitle = string.Empty;
            var yTitle = string.Empty;

            using var stream = sheetPart.Open();
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

                if (rowNumber == headerRow)
                {
                    if (cells.TryGetValue(xi, out var xh)) xTitle = xh;
                    if (cells.TryGetValue(yi, out var yh)) yTitle = yh;
                    continue;
                }
                if (firstDataRow > 0 && rowNumber > 0 && rowNumber < firstDataRow) continue;

                cells.TryGetValue(xi, out var xText);
                cells.TryGetValue(yi, out var yText);
                var hasX = TryNumber(xText, out var xVal);
                var hasY = TryNumber(yText, out var yVal);

                if (xFromIndex)
                {
                    // A line series only needs one column. Prefer the Y column; if the sheet has the
                    // values in the X column instead, take those rather than drawing nothing.
                    // The X cell is read either way: when it holds TEXT it is this point's NAME (a bar
                    // chart's category, an area chart's tick label), and when it holds a number the
                    // index is still the X — which is what lets a categorical sheet drive a bar chart.
                    if (hasY) { xs.Add(ys.Count); ys.Add(yVal); labels.Add(xText ?? string.Empty); }
                    else if (hasX) { xsFallback.Add(ysFallback.Count); ysFallback.Add(xVal); }
                }
                else if (hasX && hasY)
                {
                    xs.Add(xVal);
                    ys.Add(yVal);
                    labels.Add(xText ?? string.Empty);
                }
            }

            if (xFromIndex && ys.Count == 0 && ysFallback.Count > 0)
            {
                xs = xsFallback;
                ys = ysFallback;
            }

            data.Xs = xs.ToArray();
            data.Ys = ys.ToArray();
            data.Labels = labels.ToArray();
            data.XTitle = xTitle;
            data.YTitle = yTitle;
            if (data.Ys.Length == 0)
            {
                data.Error = $"No numbers found in column {(xFromIndex ? yColumn : $"{xColumn}/{yColumn}")} " +
                             $"of \"{Path.GetFileName(path)}\" from row {firstDataRow}.";
            }
        }
        catch (Exception ex)
        {
            data.Error = ReadFailure(path, ex);
        }
        return data;
    }

    /// <summary>
    /// Reads a workbook as LABEL + VALUE pairs, which is what a pie needs: the value column must hold
    /// numbers, the label column may hold anything, and a row whose label cell is empty falls back to
    /// the cell's own address. Unlike <see cref="Read"/> this KEEPS a row whose label is text — that is
    /// the whole point of reading a pie's categories — and X is the row's position, not a number.
    /// </summary>
    internal static ChartData ReadLabels(string path, string labelColumn, string valueColumn,
                                        int headerRow, int firstDataRow, string? sheet = null)
    {
        var data = new ChartData();
        try
        {
            using var zip = OpenWorkbook(path);
            var shared = ReadSharedStrings(zip);
            var sheetPart = FindSheet(zip, sheet);
            if (sheetPart is null)
            {
                data.Error = string.IsNullOrWhiteSpace(sheet)
                    ? $"\"{Path.GetFileName(path)}\" has no worksheet."
                    : $"\"{Path.GetFileName(path)}\" has no page called \"{sheet!.Trim()}\".";
                return data;
            }

            var li = ColumnIndex(labelColumn);
            var vi = ColumnIndex(valueColumn);
            var xs = new List<double>();
            var ys = new List<double>();
            var labels = new List<string>();
            var labelTitle = string.Empty;
            var valueTitle = string.Empty;

            using var stream = sheetPart.Open();
            foreach (var row in XDocument.Load(stream).Descendants()
                         .Where(e => e.Name.LocalName == "row"))
            {
                var rowNumber = int.TryParse(row.Attribute("r")?.Value, NumberStyles.Integer,
                    CultureInfo.InvariantCulture, out var rn) ? rn : -1;
                var cells = new Dictionary<int, string>();
                foreach (var cell in row.Elements().Where(e => e.Name.LocalName == "c"))
                {
                    var index = ColumnIndex(ColumnOf(cell.Attribute("r")?.Value ?? string.Empty));
                    var text = CellText(cell, shared);
                    if (index >= 0 && text is not null) cells[index] = text;
                }

                if (rowNumber == headerRow)
                {
                    if (cells.TryGetValue(li, out var lh)) labelTitle = lh;
                    if (cells.TryGetValue(vi, out var vh)) valueTitle = vh;
                    continue;
                }
                if (firstDataRow > 0 && rowNumber > 0 && rowNumber < firstDataRow) continue;

                cells.TryGetValue(vi, out var valueText);
                if (!TryNumber(valueText, out var value)) continue;   // a slice needs a number
                cells.TryGetValue(li, out var labelText);
                labels.Add(string.IsNullOrWhiteSpace(labelText) ? $"{labelColumn}{rowNumber}" : labelText!.Trim());
                xs.Add(ys.Count);
                ys.Add(value);
            }

            data.Xs = xs.ToArray();
            data.Ys = ys.ToArray();
            data.Labels = labels.ToArray();
            data.XTitle = labelTitle;
            data.YTitle = valueTitle;
            if (data.Ys.Length == 0)
            {
                data.Error = $"No numbers found in column {valueColumn} " +
                             $"of \"{Path.GetFileName(path)}\" from row {firstDataRow}.";
            }
        }
        catch (Exception ex)
        {
            data.Error = ReadFailure(path, ex);
        }
        return data;
    }

    /// <summary>
    /// Opens a workbook so that a chart can read a sheet that is OPEN IN ANOTHER PROGRAM. On Windows
    /// (tested on 11) Excel holds its workbook with a share mode that refuses <c>FileShare.Read</c> —
    /// which is exactly what <c>ZipFile.OpenRead</c> asks for — so a chart bound to a sheet being
    /// edited showed "Cannot read …: the process cannot access the file" and drew nothing. Asking for
    /// <c>FileShare.ReadWrite</c> is the permission Excel's own handle needs, and allowing
    /// <c>Delete</c> covers the moment Excel saves by writing a temporary file and renaming it over
    /// the original (which briefly locks the path). Linux does not behave this way, so neither of
    /// those ever showed up in testing on that platform.
    /// <para>
    /// The short retry is for that same save moment: the file is replaced within milliseconds, and a
    /// chart that re-reads on every save (Live Update) should not flash an error for it.
    /// </para>
    /// </summary>
    internal static ZipArchive OpenWorkbook(string path)
    {
        const int attempts = 4;
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                var stream = new FileStream(path, FileMode.Open, FileAccess.Read,
                    FileShare.ReadWrite | FileShare.Delete);
                return new ZipArchive(stream, ZipArchiveMode.Read);
            }
            catch (IOException) when (attempt < attempts)
            {
                // Usually "being used by another process": wait a moment and try again.
                Thread.Sleep(120);
            }
        }
    }

    /// <summary>True when the failure means "another program has the file open", which is worth a
    /// different sentence from "the file is missing" or "the file is corrupt".</summary>
    internal static bool IsFileInUse(Exception ex)
        => ex is IOException && (ex.HResult & 0xFFFF) is 32 or 33;   // ERROR_SHARING_VIOLATION / _LOCK_VIOLATION

    /// <summary>The chart's own words for a workbook it could not read.</summary>
    private static string ReadFailure(string path, Exception ex)
    {
        var name = Path.GetFileName(path);
        if (IsFileInUse(ex))
        {
            return $"\"{name}\" is open in another program — close the workbook in Excel (or save it "
                + "again) and this chart reloads by itself.";
        }
        if (ex is FileNotFoundException or DirectoryNotFoundException)
        {
            return $"\"{name}\" was not found — check the Spreadsheet path.";
        }
        return $"Cannot read \"{name}\": {ex.Message}";
    }

    /// <summary>
    /// The worksheet to read: <paramref name="sheet"/> names one (matched case-insensitively against
    /// the workbook's own sheet names, whatever order Excel keeps its parts in), and an empty name
    /// gives the first worksheet part — the behaviour every form written before SourceSheet had.
    /// </summary>
    private static ZipArchiveEntry? FindSheet(ZipArchive zip, string? sheet = null)
    {
        if (!string.IsNullOrWhiteSpace(sheet))
        {
            var wanted = sheet!.Trim();
            var target = SheetTarget(zip, wanted);
            if (target is not null)
            {
                var entry = zip.Entries.FirstOrDefault(e =>
                    e.FullName.Equals(target, StringComparison.OrdinalIgnoreCase));
                if (entry is not null) return entry;
            }
            return null;   // a named page that is not there is an error, not "read page one instead"
        }
        return zip.Entries
            .Where(e => e.FullName.StartsWith("xl/worksheets/sheet", StringComparison.OrdinalIgnoreCase)
                        && e.FullName.EndsWith(".xml", StringComparison.OrdinalIgnoreCase))
            .OrderBy(e => e.FullName, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault();
    }

    /// <summary>
    /// The zip path of the worksheet called <paramref name="sheet"/>, resolved the way Excel means it:
    /// xl/workbook.xml lists the sheets in the order the tabs show, each pointing at a relationship
    /// (xl/_rels/workbook.xml.rels) that names the part. Part NAMES carry no meaning — Excel may keep
    /// sheet1.xml for any tab — which is why a named page is looked up through the rels rather than by
    /// guessing from the file name. Returns null when there is no such sheet.
    /// </summary>
    private static string? SheetTarget(ZipArchive zip, string sheet)
    {
        var workbook = zip.Entries.FirstOrDefault(e =>
            e.FullName.Equals("xl/workbook.xml", StringComparison.OrdinalIgnoreCase));
        var rels = zip.Entries.FirstOrDefault(e =>
            e.FullName.Equals("xl/_rels/workbook.xml.rels", StringComparison.OrdinalIgnoreCase));
        if (workbook is null || rels is null) return null;
        var id = string.Empty;
        using (var stream = workbook.Open())
        {
            foreach (var element in XDocument.Load(stream).Descendants()
                         .Where(e => e.Name.LocalName == "sheet"))
            {
                var name = element.Attribute("name")?.Value;
                if (!string.Equals(name?.Trim(), sheet, StringComparison.OrdinalIgnoreCase)) continue;
                id = element.Attributes()
                    .FirstOrDefault(a => a.Name.LocalName == "id")?.Value ?? string.Empty;
                break;
            }
        }
        if (id.Length == 0) return null;
        string? relTarget = null;
        using (var stream = rels.Open())
        {
            foreach (var element in XDocument.Load(stream).Descendants()
                         .Where(e => e.Name.LocalName == "Relationship"))
            {
                if (!string.Equals(element.Attribute("Id")?.Value, id, StringComparison.Ordinal)) continue;
                relTarget = element.Attribute("Target")?.Value;
                break;
            }
        }
        if (string.IsNullOrWhiteSpace(relTarget)) return null;
        // Targets are relative to xl/ ("worksheets/sheet2.xml", sometimes with a leading "/" or a
        // "../"): normalize both spellings into a zip path.
        var target = relTarget!.Replace('\\', '/').Trim();
        if (target.StartsWith("/", StringComparison.Ordinal)) target = target.TrimStart('/');
        else target = "xl/" + target;
        while (target.Contains("../", StringComparison.Ordinal))
        {
            var at = target.IndexOf("../", StringComparison.Ordinal);
            var cut = target.LastIndexOf('/', Math.Max(0, at - 1));
            target = cut <= 0 ? target[(at + 3)..] : target[..(cut + 1)] + target[(at + 3)..];
        }
        return target;
    }

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
                list.Add(string.Concat(si.Descendants().Where(e => e.Name.LocalName == "t").Select(e => e.Value)));
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

/// <summary>One series ready to draw: its data, its styling, its scale and (for PerSeries) its axes.</summary>
internal sealed class Plot
{
    internal ChartData Data = new();
    internal ChartSeries? Definition;
    internal Color LineColor = Color.Parse("#2D7DD2");
    internal double LineThickness = 2d;
    internal ChartLineStyle LineStyle = ChartLineStyle.Solid;
    internal ChartMarkerStyle MarkerStyle = ChartMarkerStyle.Dot;
    internal double MarkerSize = 8d;
    internal bool Connected = true;
    internal bool Visible = true;
    internal bool PerSeries;
    internal Axis? XAxis;
    internal Axis? YAxis;
    internal AxisRange XRange = new();
    internal AxisRange YRange = new();
}

/// <summary>
/// The shared base for <see cref="GrumpyLinePlot"/> and <see cref="GrumpyXYPlot"/>: the frame, plot
/// background, gridlines, the common axis with its ticks and labels, the chart title, the series
/// collection, the spreadsheet reader and the live-update watcher.
/// </summary>
public abstract class ChartBase : Control
{
    /// <summary>
    /// The chart takes the keyboard so its cursors can be driven without a mouse: ←/→ move the
    /// selected cursor by one sample, ↑/↓ pick the trace the readout reports. Those keys are only
    /// swallowed while at least one cursor is switched on, so a chart without cursors stays out of
    /// the way of the window around it.
    /// </summary>
    protected ChartBase()
    {
        Focusable = true;
        Cursors.CollectionChanged += (_, _) => InvalidateVisual();
    }

    // ---- frame ------------------------------------------------------------------------------
    public static readonly StyledProperty<bool> ShowBorderProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(ShowBorder), true);

    public static readonly StyledProperty<Color> BorderBrushProperty =
        AvaloniaProperty.Register<ChartBase, Color>(nameof(BorderBrush), Color.Parse("#C8C8C8"));

    public static readonly StyledProperty<double> BorderThicknessProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(BorderThickness), 1d);

    /// <summary>Space between the border and everything the chart draws inside it — the title, the
    /// legend bar and the plot area with the axis furniture around it — in pixels, on all four sides
    /// (one, two or four values, like every other Padding). Default 0 keeps the 8 px gap the chart has
    /// always had between its border and the plot.</summary>
    public static readonly StyledProperty<Thickness> PaddingProperty =
        AvaloniaProperty.Register<ChartBase, Thickness>(nameof(Padding), default);

    public static readonly StyledProperty<CornerRadius> CornerRadiusProperty =
        AvaloniaProperty.Register<ChartBase, CornerRadius>(nameof(CornerRadius), new CornerRadius(4));

    // ---- plot area --------------------------------------------------------------------------
    /// <summary>The chart's backcolour: fills the whole chart, behind the plot area, the title and
    /// the axis labels, so the chart reads the same on any form.</summary>
    public static readonly StyledProperty<Color> PlotBackColorProperty =
        AvaloniaProperty.Register<ChartBase, Color>(nameof(PlotBackColor), Colors.White);

    /// <summary>How solid the chart's backcolour is, in percent.</summary>
    public static readonly StyledProperty<double> PlotBackOpacityProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(PlotBackOpacity), 100d);

    /// <summary>An optional background BRUSH for the whole chart — a real Avalonia gradient
    /// (<c>LinearGradientBrush</c>, <c>RadialGradientBrush</c> or <c>ConicGradientBrush</c>), written in
    /// XAML as a property element: <c>&lt;charts:GrumpyXYPlot.PlotBackBrush&gt;…</c>. When it is set it is
    /// painted over the same area (the whole control) and REPLACES <see cref="PlotBackColor"/> and its
    /// opacity, which stay the fallback for a chart without a brush.</summary>
    public static readonly StyledProperty<Brush?> PlotBackBrushProperty =
        AvaloniaProperty.Register<ChartBase, Brush?>(nameof(PlotBackBrush));

    // ---- gridlines --------------------------------------------------------------------------
    public static readonly StyledProperty<bool> ShowGridProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(ShowGrid), true);

    public static readonly StyledProperty<Color> GridColorProperty =
        AvaloniaProperty.Register<ChartBase, Color>(nameof(GridColor), Color.Parse("#E8E8E8"));

    public static readonly StyledProperty<double> GridThicknessProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(GridThickness), 1d);

    public static readonly StyledProperty<ChartLineStyle> GridStyleProperty =
        AvaloniaProperty.Register<ChartBase, ChartLineStyle>(nameof(GridStyle), ChartLineStyle.Solid);

    // ---- the common axis --------------------------------------------------------------------
    public static readonly StyledProperty<bool> ShowAxesProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(ShowAxes), true);

    public static readonly StyledProperty<Color> AxisColorProperty =
        AvaloniaProperty.Register<ChartBase, Color>(nameof(AxisColor), Color.Parse("#666666"));

    public static readonly StyledProperty<bool> ShowMajorTicksProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(ShowMajorTicks), true);

    public static readonly StyledProperty<double> MajorTickLengthProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(MajorTickLength), 6d);

    public static readonly StyledProperty<bool> ShowMinorTicksProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(ShowMinorTicks), true);

    public static readonly StyledProperty<double> MinorTickLengthProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(MinorTickLength), 3d);

    public static readonly StyledProperty<bool> ShowTickLabelsProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(ShowTickLabels), true);

    public static readonly StyledProperty<double> TickLabelFontSizeProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(TickLabelFontSize), 11d);

    public static readonly StyledProperty<bool> ShowAxisTitlesProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(ShowAxisTitles), true);

    public static readonly StyledProperty<string?> XAxisTitleProperty =
        AvaloniaProperty.Register<ChartBase, string?>(nameof(XAxisTitle), string.Empty);

    public static readonly StyledProperty<string?> YAxisTitleProperty =
        AvaloniaProperty.Register<ChartBase, string?>(nameof(YAxisTitle), string.Empty);

    // ---- title ------------------------------------------------------------------------------
    public static readonly StyledProperty<bool> ShowTitleProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(ShowTitle), false);

    public static readonly StyledProperty<string?> TitleProperty =
        AvaloniaProperty.Register<ChartBase, string?>(nameof(Title), string.Empty);

    public static readonly StyledProperty<Color> TitleColorProperty =
        AvaloniaProperty.Register<ChartBase, Color>(nameof(TitleColor), Color.Parse("#303030"));

    public static readonly StyledProperty<ChartTitlePosition> TitlePositionProperty =
        AvaloniaProperty.Register<ChartBase, ChartTitlePosition>(nameof(TitlePosition), ChartTitlePosition.Top);

    public static readonly StyledProperty<double> TitleFontSizeProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(TitleFontSize), 14d);

    // ---- data source ------------------------------------------------------------------------
    /// <summary>The .xlsx workbook every series reads from. Empty = the inline Values/Points.</summary>
    public static readonly StyledProperty<string?> SourceFileProperty =
        AvaloniaProperty.Register<ChartBase, string?>(nameof(SourceFile), string.Empty);

    /// <summary>Where the data comes from: <see cref="DataSourceKind.Spreadsheet"/> (the default, the
    /// workbook in <see cref="SourceFile"/>) or <see cref="DataSourceKind.DataFiles"/> — a data file
    /// such as a CSV, which the Data Selector editor can already name in <see cref="DataFile"/> and
    /// which the charts will start reading when that reader lands. Choosing DataFiles today simply
    /// means the chart keeps drawing whatever SourceFile gives it.</summary>
    public static readonly StyledProperty<DataSourceKind> SourceKindProperty =
        AvaloniaProperty.Register<ChartBase, DataSourceKind>(nameof(SourceKind), DataSourceKind.Spreadsheet);

    /// <summary>Which PAGE of the workbook to read, by its sheet name (e.g. "Bar Chart"). Empty —
    /// the default — reads the first worksheet, which is what every form written before this
    /// property existed does.</summary>
    public static readonly StyledProperty<string?> SourceSheetProperty =
        AvaloniaProperty.Register<ChartBase, string?>(nameof(SourceSheet), string.Empty);

    /// <summary>The data FILE for <see cref="DataSourceKind.DataFiles"/> (a CSV today, other formats
    /// as they are added). Declared so a form can carry the Data Selector's choice and still compile;
    /// nothing reads it yet.</summary>
    public static readonly StyledProperty<string?> DataFileProperty =
        AvaloniaProperty.Register<ChartBase, string?>(nameof(DataFile), string.Empty);

    /// <summary>Re-read the workbook whenever it changes on disk.</summary>
    public static readonly StyledProperty<bool> LiveUpdateProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(LiveUpdate), true);

    /// <summary>The column holding the SHARED X values (AxisMode = Common). Default "B".</summary>
    public static readonly StyledProperty<string?> XColumnProperty =
        AvaloniaProperty.Register<ChartBase, string?>(nameof(XColumn), "B");

    /// <summary>The Y column used when the chart has no series elements. Default "C".</summary>
    public static readonly StyledProperty<string?> YColumnProperty =
        AvaloniaProperty.Register<ChartBase, string?>(nameof(YColumn), "C");

    /// <summary>The row holding the axis names (default 1).</summary>
    public static readonly StyledProperty<int> HeaderRowProperty =
        AvaloniaProperty.Register<ChartBase, int>(nameof(HeaderRow), 1);

    /// <summary>The first row of values (default 2; row 1 is the header).</summary>
    public static readonly StyledProperty<int> FirstDataRowProperty =
        AvaloniaProperty.Register<ChartBase, int>(nameof(FirstDataRow), 2);

    /// <summary>Kept so forms written when the chart drew its own "…" button still compile — the button
    /// is gone (it sits in the right-click menu now: "Choose spreadsheet…"), so this value changes
    /// nothing at all.</summary>
    public static readonly StyledProperty<bool> ShowBrowseProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(ShowBrowse), false);

    // ---- legend ------------------------------------------------------------------------------
    /// <summary>Draw the legend bar along the bottom of the chart: one entry per series, its name in
    /// the series' own colour and a tick box that switches that trace on and off. A chart with no
    /// series elements draws one unnamed line, so it has nothing to list and shows no legend.</summary>
    public static readonly StyledProperty<bool> ShowLegendProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(ShowLegend), true);

    /// <summary>Font size of the legend's series names.</summary>
    public static readonly StyledProperty<double> LegendFontSizeProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(LegendFontSize), 12d);

    /// <summary>Where the legend bar sits. Top/Bottom span the chart's width; Left/Right fill a side.</summary>
    public static readonly StyledProperty<LegendPosition> LegendPositionProperty =
        AvaloniaProperty.Register<ChartBase, LegendPosition>(nameof(LegendPosition), LegendPosition.Bottom);

    /// <summary>The legend frame's backcolour (Transparent = whatever is behind it shows through).</summary>
    public static readonly StyledProperty<Color> LegendBackColorProperty =
        AvaloniaProperty.Register<ChartBase, Color>(nameof(LegendBackColor), Colors.Transparent);

    /// <summary>Draw a frame around the legend bar.</summary>
    public static readonly StyledProperty<bool> LegendShowFrameProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(LegendShowFrame), true);

    /// <summary>Colour of the legend frame's outline.</summary>
    public static readonly StyledProperty<Color> LegendBorderBrushProperty =
        AvaloniaProperty.Register<ChartBase, Color>(nameof(LegendBorderBrush), Color.Parse("#C8C8C8"));

    /// <summary>Thickness of the legend frame's outline (0 = none).</summary>
    public static readonly StyledProperty<double> LegendBorderThicknessProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(LegendBorderThickness), 1d);

    /// <summary>Corner rounding of the legend frame.</summary>
    public static readonly StyledProperty<CornerRadius> LegendCornerRadiusProperty =
        AvaloniaProperty.Register<ChartBase, CornerRadius>(nameof(LegendCornerRadius), new CornerRadius(4));

    /// <summary>Breathing room between the legend frame and the entries inside it, in pixels, added to
    /// the small built-in padding on all four sides (0 = the padding the bar has always had).</summary>
    public static readonly StyledProperty<double> LegendMarginProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(LegendMargin), 0d);

    // ---- cursors -----------------------------------------------------------------------------
    /// <summary>Where the cursor readout is drawn: following the mouse pointer (the default) or in the
    /// top right corner of the drawing area. Also switchable at runtime from the chart's right-click
    /// menu. In the designer there is no mouse, so a following readout is drawn in that corner.</summary>
    public static readonly StyledProperty<CursorReadout> ReadoutPositionProperty =
        AvaloniaProperty.Register<ChartBase, CursorReadout>(nameof(ReadoutPosition), CursorReadout.FollowMouse);

    /// <summary>Decimals in the cursor readout: −1 (the default) fits the numbers, 0…6 fixes them.</summary>
    public static readonly StyledProperty<int> CursorDecimalsProperty =
        AvaloniaProperty.Register<ChartBase, int>(nameof(CursorDecimals), -1);

    /// <summary>Where the cursor readout is drawn.</summary>
    public CursorReadout ReadoutPosition
    {
        get => GetValue(ReadoutPositionProperty);
        set => SetValue(ReadoutPositionProperty, value);
    }

    /// <summary>Decimals in the readout (0…6), or −1 to let it choose.</summary>
    public int CursorDecimals
    {
        get => GetValue(CursorDecimalsProperty);
        set => SetValue(CursorDecimalsProperty, value);
    }

    /// <summary>
    /// The chart's cursors — the crosshairs the user drags. Written as a property element, up to two
    /// are drawn: <c>&lt;charts:GrumpyLinePlot.Cursors&gt;&lt;charts:ChartCursor …/&gt;&lt;/charts:GrumpyLinePlot.Cursors&gt;</c>.
    /// The Cursor Editor adds and removes them; the right-click menu switches them on and off while
    /// the app runs.
    /// </summary>
    public AvaloniaList<ChartCursor> Cursors { get; } = new();

    /// <summary>Adds a cursor in the middle of the plot (false when there are already two).</summary>
    public bool AddCursor()
    {
        if (Cursors.Count >= MaxCursors) return false;
        Cursors.Add(new ChartCursor());
        _selectedCursor = Cursors.Count - 1;
        InvalidateVisual();
        return true;
    }

    /// <summary>Removes the selected cursor (false when there is none).</summary>
    public bool RemoveCursor()
    {
        if (Cursors.Count == 0) return false;
        Cursors.RemoveAt(Math.Clamp(_selectedCursor, 0, Cursors.Count - 1));
        _selectedCursor = Math.Clamp(_selectedCursor, 0, Math.Max(0, Cursors.Count - 1));
        InvalidateVisual();
        return true;
    }

    /// <summary>Puts every cursor back in the middle of the axis.</summary>
    public void ResetCursors()
    {
        foreach (var cursor in Cursors)
        {
            cursor.X = double.NaN;
            cursor.Y = double.NaN;
        }
        InvalidateVisual();
    }

    /// <summary>Moves one cursor to a data position (the values the readout reports).</summary>
    public void MoveCursor(int index, double x, double y)
    {
        if (index < 0 || index >= Cursors.Count) return;
        Cursors[index].X = x;
        Cursors[index].Y = y;
        _selectedCursor = index;
        InvalidateVisual();
    }

    // ---- cursor runtime state ----------------------------------------------------------------
    /// <summary>How many cursors a chart draws: two, so they can be compared.</summary>
    internal const int MaxCursors = 2;

    /// <summary>Where each enabled cursor ended up in the last Render, for hit-testing. Rebuilt on
    /// every render, so a click always tests against what is actually on screen.</summary>
    private readonly List<CursorHit> _cursorHits = new();

    /// <summary>The cursor the mouse and the arrow keys act on (the last one clicked).</summary>
    private int _selectedCursor;

    /// <summary>Which visible trace the readout reports; Up/Down walk the list.</summary>
    private int _selectedTrace;

    /// <summary>The last pointer position in control coordinates, and whether there has been one.</summary>
    private Point _pointer;
    private bool _hasPointer;

    /// <summary>What a drag is moving: 1 = X only (the vertical line), 2 = Y only (the horizontal
    /// line), 3 = both (the crosshair's middle).</summary>
    private int _dragMode;

    /// <summary>The text of the readout as last drawn, for "Copy readout".</summary>
    private string _readoutText = string.Empty;

    /// <summary>The rectangle the readout was drawn in (kept for tests and future hit-testing).</summary>
    private Rect _readoutRect;

    /// <summary>The cursor a drag is moving, and which of its lines the drag grabbed.</summary>
    private ChartCursor? _dragCursor;

    /// <summary>One cursor's clickable parts, in control coordinates, plus the values its readout
    /// reports — kept so the panel can compare TWO cursors without recomputing anything.</summary>
    private sealed class CursorHit
    {
        internal ChartCursor Cursor = null!;
        internal int Index;
        /// <summary>The colour it was drawn in — the followed series' own colour when it follows
        /// one, else its own (see <see cref="CursorColor"/>). Kept so the readout and the delta
        /// row are drawn in exactly the colour that is on screen.</summary>
        internal Color DrawnColor = Colors.Transparent;
        /// <summary>The cursor's X, in data units (the value its readout shows).</summary>
        internal double X;
        /// <summary>The Y its readout reports: the selected trace's value at that X, else the
        /// cursor's own Y. NOT the height the horizontal line is drawn at — for a cursor that does
        /// not follow its trace, the line is a threshold and the readout a reading.</summary>
        internal double Y;
        /// <summary>A band around the vertical line (empty when it is not drawn).</summary>
        internal Rect Vertical;
        /// <summary>A band around the horizontal line (empty when it is not drawn).</summary>
        internal Rect Horizontal;
        /// <summary>The square at the crossing point where both lines meet.</summary>
        internal Rect Handle;
    }

    /// <summary>How close to a cursor line a click counts (each side, in pixels).</summary>
    private const double CursorGrab = 5d;

    // ---- scaling overrides (the common axis) -------------------------------------------------
    public static readonly StyledProperty<double> MinXProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(MinX), double.NaN);

    public static readonly StyledProperty<double> MaxXProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(MaxX), double.NaN);

    public static readonly StyledProperty<double> MinYProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(MinY), double.NaN);

    public static readonly StyledProperty<double> MaxYProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(MaxY), double.NaN);

    // ---- LEGACY single-series styling -------------------------------------------------------
    // Kept so older forms still compile AND still look right: these style the implicit series a
    // chart uses when it has NO <charts:…Series> elements. The Series Editor seeds the first series
    // from them, and they are no longer offered in the Properties panel (the series own them now).
    public static readonly StyledProperty<Color> LineColorProperty =
        AvaloniaProperty.Register<ChartBase, Color>(nameof(LineColor), Color.Parse("#2D7DD2"));

    public static readonly StyledProperty<double> LineThicknessProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(LineThickness), 2d);

    public static readonly StyledProperty<ChartLineStyle> LineStyleProperty =
        AvaloniaProperty.Register<ChartBase, ChartLineStyle>(nameof(LineStyle), ChartLineStyle.Solid);

    public static readonly StyledProperty<ChartMarkerStyle> MarkerStyleProperty =
        AvaloniaProperty.Register<ChartBase, ChartMarkerStyle>(nameof(MarkerStyle), ChartMarkerStyle.Dot);

    public static readonly StyledProperty<double> MarkerSizeProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(MarkerSize), 8d);

    public static readonly StyledProperty<bool> ConnectedProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(Connected), true);

    static ChartBase()
    {
        // Any style or data change is a change to the picture.
        AffectsRender<ChartBase>(
            ShowBorderProperty, BorderBrushProperty, BorderThicknessProperty,
            PaddingProperty, CornerRadiusProperty,
            PlotBackColorProperty, PlotBackOpacityProperty, PlotBackBrushProperty,
            ShowGridProperty, GridColorProperty, GridThicknessProperty, GridStyleProperty,
            ShowAxesProperty, AxisColorProperty,
            ShowMajorTicksProperty, MajorTickLengthProperty,
            ShowMinorTicksProperty, MinorTickLengthProperty,
            ShowTickLabelsProperty, TickLabelFontSizeProperty,
            ShowAxisTitlesProperty, XAxisTitleProperty, YAxisTitleProperty,
            ShowTitleProperty, TitleProperty, TitleColorProperty, TitlePositionProperty, TitleFontSizeProperty,
            SourceFileProperty, XColumnProperty, YColumnProperty, HeaderRowProperty, FirstDataRowProperty,
            ShowLegendProperty, LegendFontSizeProperty,
            LegendPositionProperty, LegendBackColorProperty, LegendShowFrameProperty,
            LegendBorderBrushProperty, LegendBorderThicknessProperty, LegendCornerRadiusProperty,
            LegendMarginProperty,
            ReadoutPositionProperty, CursorDecimalsProperty,
            MinXProperty, MaxXProperty, MinYProperty, MaxYProperty,
            LineColorProperty, LineThicknessProperty, LineStyleProperty,
            MarkerStyleProperty, MarkerSizeProperty, ConnectedProperty);
        SourceFileProperty.Changed.AddClassHandler<ChartBase>((chart, _) => chart.InvalidateCache());
        LiveUpdateProperty.Changed.AddClassHandler<ChartBase>((chart, _) => chart.RestartWatcher());
    }

    /// <summary>Draw the border around the whole control (True by default).</summary>
    public bool ShowBorder { get => GetValue(ShowBorderProperty); set => SetValue(ShowBorderProperty, value); }

    /// <summary>Border colour.</summary>
    public Color BorderBrush { get => GetValue(BorderBrushProperty); set => SetValue(BorderBrushProperty, value); }

    /// <summary>Border line thickness.</summary>
    public double BorderThickness { get => GetValue(BorderThicknessProperty); set => SetValue(BorderThicknessProperty, value); }

    /// <summary>Space between the border and the chart frame — the title, the legend bar and the plot
    /// area — on all four sides.</summary>
    public Thickness Padding { get => GetValue(PaddingProperty); set => SetValue(PaddingProperty, value); }

    /// <summary>Corner rounding of the frame.</summary>
    public CornerRadius CornerRadius { get => GetValue(CornerRadiusProperty); set => SetValue(CornerRadiusProperty, value); }

    /// <summary>The chart's backcolour (fills the whole chart).</summary>
    public Color PlotBackColor { get => GetValue(PlotBackColorProperty); set => SetValue(PlotBackColorProperty, value); }

    /// <summary>How solid the chart's backcolour is, in percent (0-100).</summary>
    public double PlotBackOpacity { get => GetValue(PlotBackOpacityProperty); set => SetValue(PlotBackOpacityProperty, value); }

    /// <summary>An optional background brush (e.g. a gradient) for the whole chart; wins over
    /// <see cref="PlotBackColor"/> when set.</summary>
    public Brush? PlotBackBrush { get => GetValue(PlotBackBrushProperty); set => SetValue(PlotBackBrushProperty, value); }

    /// <summary>Draw gridlines at the common axis' major ticks.</summary>
    public bool ShowGrid { get => GetValue(ShowGridProperty); set => SetValue(ShowGridProperty, value); }

    /// <summary>Gridline colour.</summary>
    public Color GridColor { get => GetValue(GridColorProperty); set => SetValue(GridColorProperty, value); }

    /// <summary>Gridline thickness.</summary>
    public double GridThickness { get => GetValue(GridThicknessProperty); set => SetValue(GridThicknessProperty, value); }

    /// <summary>Gridline style.</summary>
    public ChartLineStyle GridStyle { get => GetValue(GridStyleProperty); set => SetValue(GridStyleProperty, value); }

    /// <summary>Draw the common axis' two axis lines.</summary>
    public bool ShowAxes { get => GetValue(ShowAxesProperty); set => SetValue(ShowAxesProperty, value); }

    /// <summary>Colour of the common axes, ticks and tick labels.</summary>
    public Color AxisColor { get => GetValue(AxisColorProperty); set => SetValue(AxisColorProperty, value); }

    /// <summary>Draw the common axis' major ticks.</summary>
    public bool ShowMajorTicks { get => GetValue(ShowMajorTicksProperty); set => SetValue(ShowMajorTicksProperty, value); }

    /// <summary>Major tick length in pixels.</summary>
    public double MajorTickLength { get => GetValue(MajorTickLengthProperty); set => SetValue(MajorTickLengthProperty, value); }

    /// <summary>Draw the common axis' minor ticks.</summary>
    public bool ShowMinorTicks { get => GetValue(ShowMinorTicksProperty); set => SetValue(ShowMinorTicksProperty, value); }

    /// <summary>Minor tick length in pixels.</summary>
    public double MinorTickLength { get => GetValue(MinorTickLengthProperty); set => SetValue(MinorTickLengthProperty, value); }

    /// <summary>Draw the tick numbers.</summary>
    public bool ShowTickLabels { get => GetValue(ShowTickLabelsProperty); set => SetValue(ShowTickLabelsProperty, value); }

    /// <summary>Font size of the tick labels and the axis names.</summary>
    public double TickLabelFontSize { get => GetValue(TickLabelFontSizeProperty); set => SetValue(TickLabelFontSizeProperty, value); }

    /// <summary>Draw the common axis' names.</summary>
    public bool ShowAxisTitles { get => GetValue(ShowAxisTitlesProperty); set => SetValue(ShowAxisTitlesProperty, value); }

    /// <summary>The X axis name (empty = the spreadsheet's column header).</summary>
    public string? XAxisTitle { get => GetValue(XAxisTitleProperty); set => SetValue(XAxisTitleProperty, value); }

    /// <summary>The Y axis name (empty = the spreadsheet's column header).</summary>
    public string? YAxisTitle { get => GetValue(YAxisTitleProperty); set => SetValue(YAxisTitleProperty, value); }

    /// <summary>
    /// The chart's COMMON X axis — the one every series uses unless it is set to PerSeries. An Axis
    /// object written as a property element:
    /// <c>&lt;charts:GrumpyXYPlot.XAxis&gt;&lt;charts:Axis Position="Top"/&gt;&lt;/charts:GrumpyXYPlot.XAxis&gt;</c>.
    /// Left null, the chart-level axis properties below describe it instead, so a form written before
    /// the Axis Editor looks exactly as it did.
    /// </summary>
    public Axis? XAxis { get; set; }

    /// <summary>The chart's COMMON Y axis. See <see cref="XAxis"/>.</summary>
    public Axis? YAxis { get; set; }

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

    /// <summary>The .xlsx workbook every series reads from (empty = the inline Values/Points).</summary>
    public string? SourceFile { get => GetValue(SourceFileProperty); set => SetValue(SourceFileProperty, value); }

    /// <summary>Where the data comes from (see <see cref="DataSourceKind"/>).</summary>
    public DataSourceKind SourceKind { get => GetValue(SourceKindProperty); set => SetValue(SourceKindProperty, value); }

    /// <summary>Which PAGE of the workbook to read, by sheet name (empty = the first worksheet).</summary>
    public string? SourceSheet { get => GetValue(SourceSheetProperty); set => SetValue(SourceSheetProperty, value); }

    /// <summary>The data file for the DataFiles source — carried in the form, not read yet.</summary>
    public string? DataFile { get => GetValue(DataFileProperty); set => SetValue(DataFileProperty, value); }

    /// <summary>Re-read the workbook when it changes on disk.</summary>
    public bool LiveUpdate { get => GetValue(LiveUpdateProperty); set => SetValue(LiveUpdateProperty, value); }

    /// <summary>The column holding the shared X values (AxisMode = Common).</summary>
    public string? XColumn { get => GetValue(XColumnProperty); set => SetValue(XColumnProperty, value); }

    /// <summary>The Y column used when the chart has no series elements.</summary>
    public string? YColumn { get => GetValue(YColumnProperty); set => SetValue(YColumnProperty, value); }

    /// <summary>The row holding the axis names.</summary>
    public int HeaderRow { get => GetValue(HeaderRowProperty); set => SetValue(HeaderRowProperty, value); }

    /// <summary>The first row of values.</summary>
    public int FirstDataRow { get => GetValue(FirstDataRowProperty); set => SetValue(FirstDataRowProperty, value); }

    /// <summary>Draw the "…" file picker button.</summary>
    public bool ShowBrowse { get => GetValue(ShowBrowseProperty); set => SetValue(ShowBrowseProperty, value); }

    /// <summary>Draw the legend bar along the bottom of the chart.</summary>
    public bool ShowLegend { get => GetValue(ShowLegendProperty); set => SetValue(ShowLegendProperty, value); }

    /// <summary>Font size of the legend's series names.</summary>
    public double LegendFontSize { get => GetValue(LegendFontSizeProperty); set => SetValue(LegendFontSizeProperty, value); }

    /// <summary>Where the legend bar sits.</summary>
    public LegendPosition LegendPosition { get => GetValue(LegendPositionProperty); set => SetValue(LegendPositionProperty, value); }

    /// <summary>The legend frame's backcolour.</summary>
    public Color LegendBackColor { get => GetValue(LegendBackColorProperty); set => SetValue(LegendBackColorProperty, value); }

    /// <summary>Draw a frame around the legend bar.</summary>
    public bool LegendShowFrame { get => GetValue(LegendShowFrameProperty); set => SetValue(LegendShowFrameProperty, value); }

    /// <summary>Colour of the legend frame's outline.</summary>
    public Color LegendBorderBrush { get => GetValue(LegendBorderBrushProperty); set => SetValue(LegendBorderBrushProperty, value); }

    /// <summary>Thickness of the legend frame's outline.</summary>
    public double LegendBorderThickness { get => GetValue(LegendBorderThicknessProperty); set => SetValue(LegendBorderThicknessProperty, value); }

    /// <summary>Corner rounding of the legend frame.</summary>
    public CornerRadius LegendCornerRadius { get => GetValue(LegendCornerRadiusProperty); set => SetValue(LegendCornerRadiusProperty, value); }

    /// <summary>Breathing room between the legend frame and the entries inside it, in pixels, added on
    /// all four sides (0 = the padding the bar has always had).</summary>
    public double LegendMargin { get => GetValue(LegendMarginProperty); set => SetValue(LegendMarginProperty, value); }

    /// <summary>Fixed X minimum for the common axis (NaN = auto-fit).</summary>
    public double MinX { get => GetValue(MinXProperty); set => SetValue(MinXProperty, value); }

    /// <summary>Fixed X maximum for the common axis (NaN = auto-fit).</summary>
    public double MaxX { get => GetValue(MaxXProperty); set => SetValue(MaxXProperty, value); }

    /// <summary>Fixed Y minimum for the common axis (NaN = auto-fit).</summary>
    public double MinY { get => GetValue(MinYProperty); set => SetValue(MinYProperty, value); }

    /// <summary>Fixed Y maximum for the common axis (NaN = auto-fit).</summary>
    public double MaxY { get => GetValue(MaxYProperty); set => SetValue(MaxYProperty, value); }

    /// <summary>LEGACY: the implicit series' line colour (used only when there are no series elements).</summary>
    public Color LineColor { get => GetValue(LineColorProperty); set => SetValue(LineColorProperty, value); }

    /// <summary>LEGACY: the implicit series' line thickness.</summary>
    public double LineThickness { get => GetValue(LineThicknessProperty); set => SetValue(LineThicknessProperty, value); }

    /// <summary>LEGACY: the implicit series' line style.</summary>
    public ChartLineStyle LineStyle { get => GetValue(LineStyleProperty); set => SetValue(LineStyleProperty, value); }

    /// <summary>LEGACY: the implicit series' marker style.</summary>
    public ChartMarkerStyle MarkerStyle { get => GetValue(MarkerStyleProperty); set => SetValue(MarkerStyleProperty, value); }

    /// <summary>LEGACY: the implicit series' marker size.</summary>
    public double MarkerSize { get => GetValue(MarkerSizeProperty); set => SetValue(MarkerSizeProperty, value); }

    /// <summary>LEGACY: whether the implicit series joins its points with a line.</summary>
    public bool Connected { get => GetValue(ConnectedProperty); set => SetValue(ConnectedProperty, value); }

    /// <summary>
    /// The chart's series, drawn in this order. This is the content property, so a series is written
    /// as a child element: <c>&lt;charts:GrumpyXYPlot&gt;&lt;charts:XYSeries …/&gt;&lt;/charts:GrumpyXYPlot&gt;</c>.
    /// Empty = one implicit series styled from the chart-level values.
    /// </summary>
    [Content]
    public AvaloniaList<ChartSeries> Series { get; } = new();

    // ---- data -------------------------------------------------------------------------------

    /// <summary>The data to draw when the chart has no series and no SourceFile.</summary>
    protected abstract ChartData InlineData();

    /// <summary>How a subclass stores inline data pushed from code (Values or Points).</summary>
    protected abstract void SetInlineData(double[] xs, double[] ys);

    /// <summary>The X column a PER-SERIES series reads: its own, else its place in the B/C, D/E, F/G
    /// pairing. A common-axis series shares the chart's <see cref="XColumn"/> instead.</summary>
    private string SeriesXColumn(ChartSeries series, int index)
        => !string.IsNullOrWhiteSpace(series.XColumn) ? series.XColumn! : DefaultXColumn(index);

    /// <summary>The Y column a series reads: its own, else the chart's, else the next of B/C, D/E…</summary>
    private string SeriesYColumn(ChartSeries series, int index)
    {
        if (!string.IsNullOrWhiteSpace(series.YColumn)) return series.YColumn!;
        if (Series.Count == 1 && !string.IsNullOrWhiteSpace(YColumn)) return YColumn!;
        // The pairing rule: series 1 → C, series 2 → E, series 3 → G …
        return SpreadsheetReader.ColumnAfter("C", index * 2);
    }

    /// <summary>The common Y axis to draw: the Axis object when the XAML has one, else one built from
    /// the chart-level (legacy) axis properties.</summary>
    private Axis CommonYAxis()
    {
        var axis = YAxis ?? new Axis
        {
            Position = AxisPosition.Left,
            ShowAxis = ShowAxes,
            AxisColor = AxisColor,
            ShowMajorTicks = ShowMajorTicks,
            MajorTickLength = MajorTickLength,
            ShowMinorTicks = ShowMinorTicks,
            MinorTickLength = MinorTickLength,
            ShowTickLabels = ShowTickLabels,
            TickLabelFontSize = TickLabelFontSize,
            ShowAxisName = ShowAxisTitles,
            Name = YAxisTitle
        };
        if (!HasCartesianAxes) Hide(axis);
        return axis;
    }

    /// <summary>
    /// A chart with no cartesian frame (the pie) wants the axis furniture out of the way but still wants
    /// the room its OWN axis objects would take — the pie gives its drawing a centred square of the
    /// frame, and an explicit <c>&lt;charts:Axis&gt;</c> in the form must not shrink it either.
    /// </summary>
    private static void Hide(Axis axis)
    {
        axis.ShowAxis = false;
        axis.ShowMajorTicks = false;
        axis.ShowMinorTicks = false;
        axis.ShowTickLabels = false;
        axis.ShowAxisName = false;
    }

    /// <summary>The common X axis to draw: see <see cref="CommonYAxis"/>.</summary>
    private Axis CommonXAxis()
    {
        var axis = XAxis ?? new Axis
        {
            Position = AxisPosition.Bottom,
            ShowAxis = ShowAxes,
            AxisColor = AxisColor,
            ShowMajorTicks = ShowMajorTicks,
            MajorTickLength = MajorTickLength,
            ShowMinorTicks = ShowMinorTicks,
            MinorTickLength = MinorTickLength,
            ShowTickLabels = ShowTickLabels,
            TickLabelFontSize = TickLabelFontSize,
            ShowAxisName = ShowAxisTitles,
            Name = XAxisTitle
        };
        if (!HasCartesianAxes) Hide(axis);
        return axis;
    }

    /// <summary>The X column of the nth series in the editor's default pairing (B, D, F, …).</summary>
    internal static string DefaultXColumn(int index) => SpreadsheetReader.ColumnAfter("B", index * 2);

    /// <summary>The Y column of the nth series in the editor's default pairing (C, E, G, …).</summary>
    internal static string DefaultYColumn(int index) => SpreadsheetReader.ColumnAfter("C", index * 2);

    private readonly Dictionary<string, ChartData> _cache = new();
    private string? _cacheFile;

    /// <summary>
    /// The data for one series (cached per column pair and workbook). <paramref name="labelPairs"/> reads
    /// label + value pairs instead of two numeric columns, which is what a pie's slices are — and it is
    /// only that chart that asks for it.
    /// </summary>
    private protected ChartData DataFor(ChartSeries? series, string xColumn, string yColumn, bool xFromIndex,
                                        bool labelPairs = false)
    {
        var file = SourceFile;
        if (string.IsNullOrWhiteSpace(file)) return InlineData();

        var key = $"{xColumn}|{yColumn}|{xFromIndex}|{labelPairs}|{SourceSheet}";
        if (_cacheFile != file) { _cache.Clear(); _cacheFile = file; }
        if (_cache.TryGetValue(key, out var cached)) return cached;

        // The PAGE the form asks for, by name; empty means the workbook's first worksheet.
        var page = SourceSheet;
        var data = labelPairs
            ? SpreadsheetReader.ReadLabels(file!, xColumn, yColumn, HeaderRow, FirstDataRow, page)
            : SpreadsheetReader.Read(file!, xColumn, yColumn, HeaderRow, FirstDataRow, xFromIndex, page);
        _cache[key] = data;
        return data;
    }

    /// <summary>Every series to draw, with its data, styling, scale and axes resolved. A chart type with a
    /// different notion of "series" — the pie, whose slices each become one plot so the legend, its tick
    /// boxes and the colours work unchanged — overrides this.</summary>
    private protected virtual List<Plot> BuildPlots()
    {
        var plots = new List<Plot>();
        if (Series.Count == 0)
        {
            // The implicit single series: chart-level columns and (legacy) chart-level styling.
            var data = DataFor(null, XColumn ?? "B", YColumn ?? "C", XFromIndex);
            var plot = new Plot
            {
                Data = data,
                LineColor = LineColor,
                LineThickness = LineThickness,
                LineStyle = LineStyle,
                MarkerStyle = MarkerStyle,
                MarkerSize = MarkerSize,
                Connected = Connected
            };
            plot.XRange = AxisRange.Over(data.Xs, MinX, MaxX, 6, 1);
            plot.YRange = WithBaseline(data.Ys, MinY, MaxY);
            plots.Add(plot);
            return plots;
        }

        for (var i = 0; i < Series.Count; i++)
        {
            var series = Series[i];
            // Common mode shares one X (the chart's XColumn); PerSeries walks the B/C, D/E, F/G pairs.
            var common = !series.PerSeries || series.XFromIndex;
            var xColumn = common ? (XColumn ?? "B") : SeriesXColumn(series, i);
            var yColumn = SeriesYColumn(series, i);
            var data = DataFor(series, xColumn, yColumn, series.XFromIndex);
            var plot = new Plot
            {
                Data = data,
                Definition = series,
                LineColor = series.LineColor,
                LineThickness = series.LineThickness,
                LineStyle = series.LineStyle,
                MarkerStyle = series.MarkerStyle,
                MarkerSize = series.MarkerSize,
                Connected = series.Connected,
                Visible = series.Visible,
                PerSeries = series.PerSeries,
                XAxis = series.XAxis,
                YAxis = series.YAxis
            };
            if (series.PerSeries)
            {
                plot.XRange = AxisRange.Over(data.Xs, double.NaN, double.NaN, 6, 5);
                plot.YRange = AxisRange.Over(data.Ys, double.NaN, double.NaN, 5, 5);
            }
            plots.Add(plot);
        }

        // The common axis covers the series that use it (or all of them when every series is its own).
        var commonPlots = plots.Where(p => !p.PerSeries).ToList();
        if (commonPlots.Count == 0) commonPlots = plots;
        var xs = commonPlots.SelectMany(p => p.Data.Xs).ToArray();
        var ys = commonPlots.SelectMany(p => p.Data.Ys).ToList();
        // A stacked chart's scale has to fit the TOTALS (the tallest bar is the sum of its category's
        // segments); fitting each series on its own would push the stack out of the plot.
        if (StackSeries) ys.AddRange(StackTotals(commonPlots));
        var subdivisions = Series.Any(s => s.XFromIndex) ? 1 : 5;
        var xr = AxisRange.Over(PaddedX(xs), MinX, MaxX, 6, subdivisions);
        var yr = WithBaseline(ys, MinY, MaxY);
        foreach (var plot in commonPlots)
        {
            plot.XRange = xr;
            plot.YRange = yr;
        }
        return plots;
    }

    private bool XFromIndex => Series.Count > 0 ? Series[0].XFromIndex : ImplicitXFromIndex;

    /// <summary>
    /// The Y scale for a set of values, with 0 included when this chart type needs a baseline (see
    /// <see cref="ZeroBaseline"/>). Forced limits still win: a hand-set MinY/MaxY is drawn as asked.
    /// </summary>
    private AxisRange WithBaseline(IEnumerable<double> values, double forcedMin, double forcedMax)
    {
        // A share-of-whole chart always spans the whole 0-100 band: the drawing turns the values into
        // percentages, so fitting the raw totals would push every shape out of the plot.
        if (ZeroToHundred) return AxisRange.Over(new double[] { 0d, 100d }, forcedMin, forcedMax, 5, 5);
        var list = values.ToList();
        if (ZeroBaseline) list.Add(0);
        return AxisRange.Over(list, forcedMin, forcedMax, 5, 5);
    }

    /// <summary>The X values with this chart type's end margin added (see <see cref="XPadUnits"/>): the
    /// scale then reaches past the outer bars, so they are drawn whole.</summary>
    private double[] PaddedX(double[] xs)
    {
        if (XPadUnits <= 0 || xs.Length == 0) return xs;
        return new[] { xs.Min() - XPadUnits, xs.Max() + XPadUnits };
    }

    /// <summary>The per-point TOTALS of a stack, used to fit a stacked chart's scale.</summary>
    private static IEnumerable<double> StackTotals(List<Plot> plots)
    {
        var length = plots.Count == 0 ? 0 : plots.Max(p => p.Data.Ys.Length);
        for (var i = 0; i < length; i++)
        {
            var sum = 0d;
            foreach (var p in plots) if (i < p.Data.Ys.Length) sum += p.Data.Ys[i];
            yield return sum;
        }
    }

    /// <summary>True when the implicit (no-series) chart plots Y against the sample index.</summary>
    protected abstract bool ImplicitXFromIndex { get; }

    /// <summary>
    /// True when this chart type STACKS its series: each one starts where the previous ended, so the
    /// scale has to fit the totals rather than the individual series (the bar and area charts).
    /// </summary>
    protected virtual bool StackSeries => false;

    /// <summary>
    /// True when 0 has to be on the Y scale whether the data asks for it or not. A bar is read as a
    /// length from its baseline and an area as a filled space above it, so a chart whose values all sit
    /// far from zero (say 40…50) would otherwise draw meaningless shapes and a misleading picture.
    /// </summary>
    protected virtual bool ZeroBaseline => false;

    /// <summary>
    /// True for a chart without a cartesian frame (the pie): there is no grid to draw and the axis
    /// furniture is hidden, so the drawing gets the whole frame instead of a plottable rectangle.
    /// </summary>
    protected virtual bool HasCartesianAxes => true;

    /// <summary>False when a draggable crosshair makes no sense on this chart type (the pie).</summary>
    protected virtual bool SupportsCursors => true;

    /// <summary>
    /// True when the X axis is a list of CATEGORIES and should be labelled with each point's own name
    /// (the bar and area charts). Every other chart type keeps its numbers, so an existing form's axis
    /// cannot change under it just because its X column happens to hold text.
    /// </summary>
    protected virtual bool NamedXAxis => false;

    /// <summary>The names to label the X axis with, or null when this chart type labels numbers.</summary>
    private string[]? XNames(ChartData data) => NamedXAxis ? data.Labels : null;

    /// <summary>
    /// How much empty room the X scale keeps at each end, in X units. A bar chart asks for HALF A SLOT,
    /// so the first and last bar stand clear of the plot's edge instead of being cut in half by it.
    /// </summary>
    protected virtual double XPadUnits => 0d;

    /// <summary>
    /// True when the series are SHARES OF A WHOLE (a 100% stacked bar or area), so the Y scale is fixed
    /// at 0 to 100 and the drawing works in percentages rather than the workbook's raw numbers.
    /// </summary>
    protected virtual bool ZeroToHundred => false;

    /// <summary>
    /// Where each series sits when they are stacked: the level every shape of that series starts at and
    /// the level it reaches, per point. <paramref name="hundred"/> first scales each category to 100, so
    /// the same data turns into a share-of-total chart. Without stacking the base is 0 and the top is
    /// the value, which is why the bar and area drawing can use one code path for both.
    /// </summary>
    private protected static (double[] Base, double[] Top)[] StackBands(List<Plot> plots, bool hundred)
    {
        var bands = new (double[] Base, double[] Top)[plots.Count];
        var running = new double[plots.Count == 0 ? 0 : plots.Max(p => p.Data.Ys.Length)];
        for (var s = 0; s < plots.Count; s++)
        {
            var ys = plots[s].Data.Ys;
            var bases = new double[ys.Length];
            var tops = new double[ys.Length];
            for (var i = 0; i < ys.Length; i++)
            {
                var value = ys[i];
                if (hundred)
                {
                    var total = 0d;
                    foreach (var p in plots) if (i < p.Data.Ys.Length) total += p.Data.Ys[i];
                    value = total > 0 ? ys[i] / total * 100d : 0d;
                }
                bases[i] = running[i];
                tops[i] = running[i] + value;
                running[i] = tops[i];
            }
            bands[s] = (bases, tops);
        }
        return bands;
    }

    /// <summary>A series' points in control coordinates.</summary>
    private protected static Point[] SeriesPoints(Plot plot, Rect area)
        => plot.Data.Xs.Select((_, i) => new Point(
            plot.XRange.ToPixel(plot.Data.Xs[i], area.X, area.Width),
            plot.YRange.ToPixel(plot.Data.Ys[i], area.Bottom, -area.Height))).ToArray();

    /// <summary>Where a data value sits vertically in the plot (bars, areas and their baselines).</summary>
    private protected static double YAt(Plot plot, Rect area, double value)
        => plot.YRange.ToPixel(value, area.Bottom, -area.Height);

    /// <summary>Drop the cached data so the next redraw re-reads the workbook.</summary>
    public void Reload()
    {
        InvalidateCache();
    }

    private void InvalidateCache()
    {
        _cache.Clear();
        _cacheFile = null;
        InvalidateVisual();
    }

    /// <summary>Replace the implicit series' data (a line chart can also just append with AddPoint).</summary>
    public void SetValues(IEnumerable<double> values)
    {
        var data = values?.ToArray() ?? Array.Empty<double>();
        SetInlineData(Enumerable.Range(0, data.Length).Select(i => (double)i).ToArray(), data);
        InvalidateCache();
    }

    /// <summary>Append one point to the implicit series and redraw.</summary>
    public void AddPoint(double x, double y)
    {
        var data = InlineData();
        var xs = data.Xs.ToList();
        var ys = data.Ys.ToList();
        xs.Add(x);
        ys.Add(y);
        SetInlineData(xs.ToArray(), ys.ToArray());
        InvalidateCache();
    }

    /// <inheritdoc/>
    protected override void OnPropertyChanged(AvaloniaPropertyChangedEventArgs change)
    {
        base.OnPropertyChanged(change);
        if (change.Property == SourceFileProperty) InvalidateCache();
        else if (change.Property == SourceSheetProperty) InvalidateCache();
        else if (change.Property == LiveUpdateProperty) RestartWatcher();
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
            var options = new FilePickerOpenOptions
            {
                Title = "Select a spreadsheet",
                AllowMultiple = false,
                FileTypeFilter = new[]
                {
                    new FilePickerFileType("Excel workbook") { Patterns = new[] { "*.xlsx" } },
                    new FilePickerFileType("All files") { Patterns = new[] { "*" } }
                }
            };
            // Open where the last pick left off — see ChartPickerMemory — when there is somewhere to open.
            var last = ChartPickerMemory.LastFolder;
            if (last is not null)
            {
                try { options.SuggestedStartLocation = await storage.TryGetFolderFromPathAsync(new Uri(last)); }
                catch { /* the remembered folder is gone — let the platform choose */ }
            }
            var files = await storage.OpenFilePickerAsync(options);
            var picked = files?.Count > 0 ? files[0].TryGetLocalPath() : null;
            if (!string.IsNullOrWhiteSpace(picked))
            {
                SourceFile = picked;
                InvalidateCache();
                try { ChartPickerMemory.LastFolder = Path.GetDirectoryName(picked); }
                catch { /* best effort */ }
            }
        }
        catch
        {
            // No picker available (headless preview, no portal, …): leave the path untouched.
        }
    }

    /// <summary>True when at least one series has points to draw.</summary>
    private bool HasAnyData() => _lastPlotCount > 0;

    private int _lastPlotCount;

    /// <summary>Clicking a cursor line grabs and drags it; a click on the legend switches a trace; a
    /// right-click opens the chart menu (the spreadsheet picker, and the cursors).</summary>
    protected override void OnPointerPressed(PointerPressedEventArgs e)
    {
        base.OnPointerPressed(e);
        var position = e.GetPosition(this);

        if (e.GetCurrentPoint(this).Properties.IsRightButtonPressed)
        {
            ShowChartMenu();
            e.Handled = true;
            return;
        }

        // The cursors are on top, so they get the click first: the vertical line moves X, the
        // horizontal line moves Y, the handle at the crossing point moves both.
        for (var i = _cursorHits.Count - 1; i >= 0; i--)
        {
            var hit = _cursorHits[i];
            var mode = hit.Handle.Width > 0 && hit.Handle.Contains(position) ? 3
                : hit.Vertical.Width > 0 && hit.Vertical.Contains(position) ? 1
                : hit.Horizontal.Height > 0 && hit.Horizontal.Contains(position) ? 2 : 0;
            if (mode == 0) continue;
            _selectedCursor = hit.Index;
            _dragCursor = hit.Cursor;
            _dragMode = mode;
            _pointer = position;
            _hasPointer = true;
            Focus();
            e.Pointer.Capture(this);
            InvalidateVisual();
            e.Handled = true;
            return;
        }

        // The legend is interactive: clicking an entry (its tick box OR its name) switches that trace
        // on and off. The rects are the ones the last Render laid out.
        foreach (var entry in _legend)
        {
            if (!entry.Hit.Contains(position)) continue;
            entry.Series.Visible = !entry.Series.Visible;
            InvalidateVisual();
            e.Handled = true;
            return;
        }
    }

    /// <summary>Drags the grabbed cursor, and keeps a mouse-following readout with the pointer.</summary>
    protected override void OnPointerMoved(PointerEventArgs e)
    {
        base.OnPointerMoved(e);
        var position = e.GetPosition(this);
        var moved = !_hasPointer || position != _pointer;
        _pointer = position;
        _hasPointer = true;
        if (_dragMode != 0)
        {
            DragCursorTo(position);
            return;
        }
        // Only a chart that is reporting at the pointer needs redrawing while the mouse moves.
        if (moved && ReadoutPosition is CursorReadout.FollowMouse && LiveCursorIndexes().Count > 0) InvalidateVisual();
    }

    /// <inheritdoc/>
    protected override void OnPointerReleased(PointerReleasedEventArgs e)
    {
        base.OnPointerReleased(e);
        if (_dragMode == 0) return;
        _dragMode = 0;
        _dragCursor = null;
        e.Pointer.Capture(null);
        InvalidateVisual();
        e.Handled = true;
    }

    /// <summary>
    /// The cursor keys. With a cursor switched on, ←/→ move the selected cursor one sample along X
    /// and ↑/↓ choose which trace the readout reports. Without a cursor the keys are left alone, so
    /// the chart does not swallow the arrow keys of the window around it.
    /// </summary>
    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        var live = LiveCursorIndexes();
        if (live.Count == 0) return;
        if (e.Key is not (Key.Left or Key.Right or Key.Up or Key.Down)) return;

        var traces = VisiblePlots(_plots);
        if (traces.Count == 0) return;
        _selectedTrace = Math.Clamp(_selectedTrace, 0, traces.Count - 1);

        if (e.Key is Key.Up or Key.Down)
        {
            _selectedTrace = e.Key == Key.Up
                ? (_selectedTrace - 1 + traces.Count) % traces.Count
                : (_selectedTrace + 1) % traces.Count;
            InvalidateVisual();
            e.Handled = true;
            return;
        }

        var index = live.Contains(_selectedCursor) ? _selectedCursor : live[0];
        var cursor = Cursors[index];
        var common = _plots.FirstOrDefault(p => !p.PerSeries) ?? _plots.FirstOrDefault();
        if (common is null) return;
        var x = double.IsNaN(cursor.X) ? common.XRange.Mid : cursor.X;
        var step = SampleStep(traces[_selectedTrace].Data, x, common.XRange);
        cursor.X = x + (e.Key is Key.Right ? step : -step);
        // The first keyboard move also places the line that the mouse has not touched yet — but a
        // FOLLOWING cursor has no Y of its own, so nothing is written for it.
        if (!cursor.FollowTrace && double.IsNaN(cursor.Y)) cursor.Y = common.YRange.Mid;
        _selectedCursor = index;
        Focus();
        InvalidateVisual();
        e.Handled = true;
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

    /// <summary>The plot rectangle of the last render, so a dragged cursor can be converted back
    /// into data units with the same mapping the renderer used.</summary>
    private Rect _plotRect;
    /// <summary>The series of the last render (the input handlers read the same data the picture
    /// shows, without re-reading the workbook).</summary>
    private List<Plot> _plots = new();

    /// <inheritdoc/>
    public override void Render(DrawingContext context)
    {
        var size = Bounds.Size;
        if (size.Width < 8 || size.Height < 8) return;

        var frameWidth = ShowBorder ? Math.Max(0, BorderThickness) : 0;
        var frame = new Rect(size).Deflate(frameWidth / 2);
        var radius = CornerRadius;

        // Padding: the breathing room the user asked for between the border and everything the chart
        // draws inside it. Clamped at 0 so a negative value cannot push the content over the border;
        // 0 (the default) leaves the legend and the plot exactly where they have always been. The
        // plate and the border itself stay on the frame — only what is drawn ON the plate moves in.
        var pad = new Thickness(
            Math.Max(0, Padding.Left), Math.Max(0, Padding.Top),
            Math.Max(0, Padding.Right), Math.Max(0, Padding.Bottom));
        var content = frame.Deflate(pad);

        // The chart's OWN plate comes first, filling the whole interior - not just the plot area.
        // Everything drawn outside the plot (the title, the axis labels, the ticks) then sits on the
        // chart's colour instead of on whatever is behind the control. A gradient brush, when one is
        // set, takes the plate's place and covers exactly the same area.
        var opacity = Math.Clamp(PlotBackOpacity, 0, 100) / 100d;
        var plate = PlotBackBrush ?? new SolidColorBrush(PlotBackColor, opacity);
        context.DrawRectangle(plate, null, new RoundedRect(frame, radius));

        var plots = BuildPlots();
        _plots = plots;
        _lastPlotCount = plots.Count(p => p.Data.HasData);
        var outer = plots.FirstOrDefault(p => p.Data.Error is not null) ?? plots.FirstOrDefault();
        var seriesError = outer?.Data.Error;

        var wantTitle = ShowTitle && !string.IsNullOrWhiteSpace(Title);
        var titleText = wantTitle ? MakeText(Title!, TitleFontSize, TitleColor) : null;

        // Work out the plot rectangle: the content, minus the breathing room, minus the title and the
        // axis furniture around it.
        var plot = content.Deflate(8);
        if (titleText is not null)
        {
            var strip = titleText.Height + 6;
            plot = TitlePosition switch
            {
                ChartTitlePosition.Top => Chop(plot, 0, strip, 0, 0),
                ChartTitlePosition.Bottom => Chop(plot, 0, 0, 0, strip),
                ChartTitlePosition.Left => Chop(plot, strip, 0, 0, 0),
                _ => Chop(plot, 0, 0, strip, 0)
            };
        }

        // The legend bar runs along the side it is set to and takes its size off the plot: entries
        // flow across (Top/Bottom) or down (Left/Right) and WRAP, so the bar grows to fit its list.
        var legendSize = MeasureLegend(content.Size, plots);
        if (legendSize.Width > 0 && legendSize.Height > 0)
        {
            _legendRect = LegendPosition switch
            {
                LegendPosition.Top => new Rect(content.X, content.Y, content.Width, legendSize.Height),
                LegendPosition.Left => new Rect(content.X, content.Y, legendSize.Width, content.Height),
                LegendPosition.Right => new Rect(content.Right - legendSize.Width, content.Y, legendSize.Width, content.Height),
                _ => new Rect(content.X, content.Bottom - legendSize.Height, content.Width, legendSize.Height)
            };
            plot = LegendPosition switch
            {
                LegendPosition.Top => Chop(plot, 0, legendSize.Height + 4, 0, 0),
                LegendPosition.Left => Chop(plot, legendSize.Width + 4, 0, 0, 0),
                LegendPosition.Right => Chop(plot, 0, 0, legendSize.Width + 4, 0),
                _ => Chop(plot, 0, 0, 0, legendSize.Height + 4)
            };
        }
        else _legendRect = default;

        var common = plots.FirstOrDefault(p => !p.PerSeries) ?? plots.FirstOrDefault();
        if (common is null)
        {
            DrawFrame(context, frame, radius, frameWidth);
            DrawTitle(context, titleText, plot, content);
            DrawLegend(context);
            DrawMessage(context, plot, null);
            return;
        }

        // The common axis: an Axis object from the XAML, or one built from the chart-level (legacy)
        // axis properties. An axis carries its own side, ticks, label size and name, so the gutters
        // follow the axes instead of one fixed layout.
        var commonY = CommonYAxis();
        var commonX = CommonXAxis();
        var yOnRight = commonY.Position is AxisPosition.Right;
        var xOnTop = commonX.Position is AxisPosition.Top;

        // Per-series axes need their own gutters, so several scales can live side by side: every axis
        // on a side takes one strip, and they stack outward from the plot edge.
        var perSeries = plots.Where(p => p.PerSeries).ToList();
        var leftBlocks = perSeries.Where(p => p.YAxis is not null && p.YAxis.Position is not AxisPosition.Right).ToList();
        var rightBlocks = perSeries.Where(p => p.YAxis is not null && p.YAxis.Position is AxisPosition.Right).ToList();
        var topBlocks = perSeries.Where(p => p.XAxis is not null && p.XAxis.Position is AxisPosition.Top).ToList();
        var bottomBlocks = perSeries.Where(p => p.XAxis is not null && p.XAxis.Position is not AxisPosition.Top).ToList();

        var commonYWidth = YBlockWidth(commonY, common.YRange, YAxisTitle, common.Data.YTitle);
        var commonXHeight = XBlockHeight(commonX, common.XRange, XAxisTitle, common.Data.XTitle);

        plot = Chop(plot,
            (yOnRight ? 0 : commonYWidth) + leftBlocks.Sum(p => YBlockWidth(p.YAxis!, p.YRange, null, p.Data.YTitle)),
            (xOnTop ? commonXHeight : 0) + topBlocks.Sum(p => XBlockHeight(p.XAxis!, p.XRange, null, p.Data.XTitle)),
            (yOnRight ? commonYWidth : 0) + rightBlocks.Sum(p => YBlockWidth(p.YAxis!, p.YRange, null, p.Data.YTitle)),
            (xOnTop ? 0 : commonXHeight) + bottomBlocks.Sum(p => XBlockHeight(p.XAxis!, p.XRange, null, p.Data.XTitle)));
        if (plot.Width <= 4 || plot.Height <= 4) return;
        _plotRect = plot;

        // Plot-area fill (same colour as the plate, drawn explicitly so the plot can later carry its
        // own tint without touching the rest of the chart). With a brush the plate has already painted
        // this area: re-painting the smaller rect would re-map a gradient onto it.
        if (PlotBackBrush is null) context.DrawRectangle(plate, null, plot);

        if (_lastPlotCount == 0)
        {
            DrawFrame(context, frame, radius, frameWidth);
            DrawTitle(context, titleText, plot, content);
            DrawLegend(context);
            DrawMessage(context, plot, seriesError);
            return;
        }

        // Gridlines, then the common axis with its ticks and labels.
        if (ShowGrid && HasCartesianAxes)
        {
            var gridPen = MakePen(GridColor, GridThickness, GridStyle);
            foreach (var tick in common.XRange.Ticks())
            {
                var x = common.XRange.ToPixel(tick, plot.X, plot.Width);
                context.DrawLine(gridPen, new Point(x, plot.Y), new Point(x, plot.Bottom));
            }
            foreach (var tick in common.YRange.Ticks())
            {
                var y = common.YRange.ToPixel(tick, plot.Bottom, -plot.Height);
                context.DrawLine(gridPen, new Point(plot.X, y), new Point(plot.Right, y));
            }
        }

        // The common axis hugs the plot edge; each per-series axis takes the next strip outward on
        // its own side, so two scales on the same side never draw over each other.
        DrawYAxis(context, plot, common.YRange, commonY, yOnRight, 0,
            TickLabels(commonY, common.YRange), AxisName(commonY, YAxisTitle, common.Data.YTitle));
        DrawXAxis(context, plot, common.XRange, commonX, xOnTop, 0,
            TickLabels(commonX, common.XRange, XNames(common.Data)), AxisName(commonX, XAxisTitle, common.Data.XTitle));

        var leftUsed = yOnRight ? 0 : commonYWidth;
        var rightUsed = yOnRight ? commonYWidth : 0;
        var topUsed = xOnTop ? commonXHeight : 0;
        var bottomUsed = xOnTop ? 0 : commonXHeight;

        foreach (var p in leftBlocks)
        {
            DrawYAxis(context, plot, p.YRange, p.YAxis!, false, leftUsed,
                TickLabels(p.YAxis!, p.YRange), AxisName(p.YAxis!, null, p.Data.YTitle));
            leftUsed += YBlockWidth(p.YAxis!, p.YRange, null, p.Data.YTitle);
        }
        foreach (var p in rightBlocks)
        {
            DrawYAxis(context, plot, p.YRange, p.YAxis!, true, rightUsed,
                TickLabels(p.YAxis!, p.YRange), AxisName(p.YAxis!, null, p.Data.YTitle));
            rightUsed += YBlockWidth(p.YAxis!, p.YRange, null, p.Data.YTitle);
        }
        foreach (var p in topBlocks)
        {
            DrawXAxis(context, plot, p.XRange, p.XAxis!, true, topUsed,
                TickLabels(p.XAxis!, p.XRange, XNames(p.Data)), AxisName(p.XAxis!, null, p.Data.XTitle));
            topUsed += XBlockHeight(p.XAxis!, p.XRange, null, p.Data.XTitle);
        }
        foreach (var p in bottomBlocks)
        {
            DrawXAxis(context, plot, p.XRange, p.XAxis!, false, bottomUsed,
                TickLabels(p.XAxis!, p.XRange), AxisName(p.XAxis!, null, p.Data.XTitle));
            bottomUsed += XBlockHeight(p.XAxis!, p.XRange, null, p.Data.XTitle);
        }

        // The data itself is the chart type's own business (lines and markers, bars, filled areas, pie
        // wedges) — see DrawSeriesLayer — but it is always clipped to the plot area.
        using (context.PushClip(plot)) DrawSeriesLayer(context, plots, plot);

        // The cursors sit on top of the data, and their readout on top of that, so a cursor is never
        // buried by a line that happens to cross it.
        if (SupportsCursors) DrawCursors(context, plot, plots);

        // Frame + title last, so nothing can overdraw them.
        DrawFrame(context, frame, radius, frameWidth);
        DrawTitle(context, titleText, plot, content);
        DrawLegend(context);
    }

    /// <summary>
    /// Draws the data itself: one line per series with a marker at each point. The chart types that draw
    /// something else override this — bars <see cref="GrumpyBarPlot"/>, filled areas
    /// <see cref="GrumpyAreaPlot"/>, wedges <see cref="GrumpyPiePlot"/> — while everything around it
    /// (the plate, the frame, the gridlines, the axes, the title, the legend and the cursors) is shared.
    /// A series whose trace is switched off keeps its place in the scale but is not drawn.
    /// </summary>
    private protected virtual void DrawSeriesLayer(DrawingContext context, List<Plot> plots, Rect plot)
    {
        foreach (var p in plots)
        {
            if (!p.Data.HasData || !p.Visible) continue;
            var points = SeriesPoints(p, plot);
            if (p.Connected && points.Length > 1)
            {
                var pen = MakePen(p.LineColor, p.LineThickness, p.LineStyle);
                for (var i = 1; i < points.Length; i++) context.DrawLine(pen, points[i - 1], points[i]);
            }
            DrawMarkers(context, points, p);
        }
    }

    /// <summary>
    /// The tick label texts of an axis (empty when it draws no labels). When <paramref name="names"/> is
    /// given — a bar or area chart passes its points' own names — a tick that lands on a named point
    /// shows that name instead of its number, which is how a categorical axis is labelled: the ticks
    /// themselves still come from the range, so a long category list is thinned out automatically instead
    /// of overprinting itself.
    /// </summary>
    private static List<string> TickLabels(Axis axis, AxisRange range, string[]? names = null)
    {
        if (!axis.ShowTickLabels) return new List<string>();
        if (names is null || names.Length == 0)
            return range.Ticks().Select(v => FormatNumber(v, range.TickStep)).ToList();
        return range.Ticks().Select(v =>
        {
            var index = (int)Math.Round(v);
            return index >= 0 && index < names.Length && !string.IsNullOrWhiteSpace(names[index])
                ? names[index]
                : FormatNumber(v, range.TickStep);
        }).ToList();
    }

    /// <summary>An axis' name text: its own <see cref="Axis.Name"/>, else the chart-level title, else
    /// the spreadsheet's column header. Null when this axis draws no name.</summary>
    private FormattedText? AxisName(Axis axis, string? chartTitle, string fromSheet)
    {
        if (!axis.ShowAxisName) return null;
        var text = !string.IsNullOrWhiteSpace(axis.Name) ? axis.Name
            : !string.IsNullOrWhiteSpace(chartTitle) ? chartTitle : fromSheet;
        return string.IsNullOrWhiteSpace(text)
            ? null
            : MakeText(text!, axis.TickLabelFontSize, axis.AxisNameColor);
    }

    /// <summary>The gutter width one Y axis occupies: its tick overhang, its labels and its name.</summary>
    private double YBlockWidth(Axis axis, AxisRange range, string? chartTitle, string fromSheet)
    {
        var tickOut = axis.ShowAxis && axis.ShowMajorTicks ? Math.Max(0, axis.MajorTickLength) : 0;
        var labels = TickLabels(axis, range);
        var widest = labels.Count > 0
            ? labels.Max(t => MakeText(t, axis.TickLabelFontSize, axis.LabelColor).Width)
            : 0;
        var name = AxisName(axis, chartTitle, fromSheet);
        return 4 + tickOut + widest + (name is null ? 0 : name.Height + 6);
    }

    /// <summary>The gutter height one X axis occupies: its tick overhang, its labels and its name.</summary>
    private double XBlockHeight(Axis axis, AxisRange range, string? chartTitle, string fromSheet)
    {
        var tickOut = axis.ShowAxis && axis.ShowMajorTicks ? Math.Max(0, axis.MajorTickLength) : 0;
        var labels = TickLabels(axis, range);
        var labelHeight = labels.Count > 0 ? MakeText("0", axis.TickLabelFontSize, axis.LabelColor).Height : 0;
        var name = AxisName(axis, chartTitle, fromSheet);
        return 4 + tickOut + labelHeight + (name is null ? 0 : name.Height + 6);
    }

    // ---- legend ----------------------------------------------------------------------------

    /// <summary>One entry of the legend bar: the series it switches, and where it sits.</summary>
    private sealed class LegendEntry
    {
        internal ChartSeries Series = null!;
        internal FormattedText Text = null!;
        internal Color Color;
        /// <summary>The whole clickable item (tick box + name), in control coordinates.</summary>
        internal Rect Hit;
        /// <summary>The tick box on its own.</summary>
        internal Rect Box;
    }

    private readonly List<LegendEntry> _legend = new();
    private Rect _legendRect;

    /// <summary>The name a series shows in the legend: its own Title, else the spreadsheet's Y-column
    /// header, else "Series n".</summary>
    private string LegendName(Plot plot, int index)
    {
        if (plot.Definition is { Title: { } title } && !string.IsNullOrWhiteSpace(title)) return title;
        if (!string.IsNullOrWhiteSpace(plot.Data.YTitle)) return plot.Data.YTitle;
        return $"Series {index + 1}";
    }

    /// <summary>
    /// Lays the legend out and returns the size it needs, so the plot can give up that much room. A
    /// Top/Bottom bar spans the chart's width and wraps onto further ROWS; a Left/Right bar fills the
    /// chart's height and wraps onto further COLUMNS. Either way the bar grows to fit its list instead
    /// of running off the chart, and it keeps the plot at least 40% of the frame. Returns an empty size
    /// when there is nothing to list: a chart without series elements draws one unnamed line, and there
    /// is nothing to name or switch off.
    /// </summary>
    private Size MeasureLegend(Size frameSize, List<Plot> plots)
    {
        _legend.Clear();
        if (!ShowLegend || plots.Count == 0) return default;

        const double boxSize = 13, boxGap = 6, itemGap = 16, lineGap = 4;
        // The bar's own padding, plus whatever the user asked for: LegendMargin is the space between
        // the frame and the entries (top, bottom and both sides), so 0 reproduces the old look exactly.
        var pad = 4 + Math.Max(0, LegendMargin);
        var font = Math.Max(6, LegendFontSize);
        var vertical = LegendPosition is LegendPosition.Left or LegendPosition.Right;
        var available = vertical ? frameSize.Height : frameSize.Width;
        // Wrap once the entries fill 60% of the frame's own axis; whatever does not fit is clipped by
        // the bar (the plot is never squeezed out of existence).
        var limit = Math.Max(24, available * 0.6 - pad * 2);

        var items = new List<(ChartSeries Series, FormattedText Text, Color Color, double W, double H)>();
        for (var i = 0; i < plots.Count; i++)
        {
            var plot = plots[i];
            if (plot.Definition is null) continue;
            var text = MakeText(LegendName(plot, i), font, plot.LineColor);
            items.Add((plot.Definition, text, plot.LineColor,
                boxSize + boxGap + text.Width, Math.Max(boxSize, text.Height)));
        }
        if (items.Count == 0) return default;

        // Flow the entries, keeping the layout in LOCAL coordinates: Render translates it into
        // _legendRect once it knows which side the bar lands on.
        double x = pad, y = pad, lineExtent = 0;
        foreach (var item in items)
        {
            if (vertical)
            {
                if (y > pad && y + item.H > limit)
                {
                    x += lineExtent + itemGap;
                    y = pad;
                    lineExtent = 0;
                }
                _legend.Add(new LegendEntry
                {
                    Series = item.Series,
                    Text = item.Text,
                    Color = item.Color,
                    Hit = new Rect(x, y, item.W, item.H),
                    Box = new Rect(x, y + (item.H - boxSize) / 2, boxSize, boxSize)
                });
                y += item.H + lineGap;
                lineExtent = Math.Max(lineExtent, item.W);
            }
            else
            {
                if (x > pad && x + item.W > limit)
                {
                    y += lineExtent + lineGap;
                    x = pad;
                    lineExtent = 0;
                }
                _legend.Add(new LegendEntry
                {
                    Series = item.Series,
                    Text = item.Text,
                    Color = item.Color,
                    Hit = new Rect(x, y, item.W, item.H),
                    Box = new Rect(x, y + (item.H - boxSize) / 2, boxSize, boxSize)
                });
                x += item.W + itemGap;
                lineExtent = Math.Max(lineExtent, item.H);
            }
        }

        // The size the bar asks for: the wrap direction needs it, the other direction spans the frame.
        var contentW = pad * 2 + (vertical ? x + lineExtent - pad : Math.Min(x - itemGap, limit));
        var contentH = pad * 2 + (vertical ? Math.Min(y - lineGap, limit) : y + lineExtent - pad);
        return vertical
            ? new Size(Math.Min(contentW, available * 0.6), contentH)
            : new Size(contentW, Math.Min(contentH, available * 0.6));
    }

    /// <summary>Draws the legend bar: the tick box for each series (ticked when its trace is on) and
    /// its name, in the series' own colour.</summary>
    private void DrawLegend(DrawingContext context)
    {
        if (_legend.Count == 0) return;
        // The entries were measured in local coordinates; the bar is anchored to the frame's bottom.
        for (var i = 0; i < _legend.Count; i++)
        {
            var entry = _legend[i];
            entry.Hit = new Rect(entry.Hit.X + _legendRect.X, entry.Hit.Y + _legendRect.Y,
                                  entry.Hit.Width, entry.Hit.Height);
            entry.Box = new Rect(entry.Box.X + _legendRect.X, entry.Box.Y + _legendRect.Y,
                                 entry.Box.Width, entry.Box.Height);
        }

        using (context.PushClip(_legendRect))
        {
            if (LegendShowFrame)
            {
                // The frame: the bar's backcolour (Transparent leaves the plate showing) plus the
                // rounded outline.
                var fill = new SolidColorBrush(LegendBackColor);
                var outline = LegendBorderThickness > 0
                    ? MakePen(LegendBorderBrush, LegendBorderThickness, ChartLineStyle.Solid)
                    : null;
                context.DrawRectangle(fill, outline, new RoundedRect(_legendRect, LegendCornerRadius));
            }
            var framePen = MakePen(Color.Parse("#9AA0A6"), 1, ChartLineStyle.Solid);
            foreach (var entry in _legend)
            {
                context.DrawRectangle(null, framePen, new RoundedRect(entry.Box, new CornerRadius(2)));
                if (entry.Series.Visible)
                {
                    // A tick in the series' own colour, so a ticked box matches its line exactly.
                    var tick = MakePen(entry.Color, 2, ChartLineStyle.Solid);
                    var b = entry.Box;
                    context.DrawLine(tick,
                        new Point(b.X + b.Width * 0.20, b.Y + b.Height * 0.55),
                        new Point(b.X + b.Width * 0.42, b.Y + b.Height * 0.78));
                    context.DrawLine(tick,
                        new Point(b.X + b.Width * 0.42, b.Y + b.Height * 0.78),
                        new Point(b.X + b.Width * 0.80, b.Y + b.Height * 0.22));
                }
                context.DrawText(entry.Text, new Point(entry.Box.Right + 6, entry.Hit.Y + (entry.Hit.Height - entry.Text.Height) / 2));
            }
        }
    }

    /// <summary>Draws a Y axis: its line, ticks, labels and name, on the left or the right edge.
    /// <paramref name="offset"/> moves it one strip further out, so axes on the same side stack.</summary>
    private void DrawYAxis(DrawingContext context, Rect plot, AxisRange range, Axis axis, bool right,
                           double offset, List<string> labels, FormattedText? name)
    {
        var pen = MakePen(axis.AxisColor, 1, ChartLineStyle.Solid);
        var x = right ? plot.Right + offset : plot.X - offset;
        var tickOut = axis.ShowMajorTicks ? Math.Max(0, axis.MajorTickLength) : 0;
        var dir = right ? 1 : -1;

        if (axis.ShowAxis) context.DrawLine(pen, new Point(x, plot.Y), new Point(x, plot.Bottom));
        if (axis.ShowAxis && axis.ShowMinorTicks && axis.MinorTickLength > 0)
        {
            foreach (var tick in range.MinorTicks())
            {
                var y = range.ToPixel(tick, plot.Bottom, -plot.Height);
                context.DrawLine(pen, new Point(x, y), new Point(x + dir * axis.MinorTickLength, y));
            }
        }
        if (axis.ShowAxis && axis.ShowMajorTicks && axis.MajorTickLength > 0)
        {
            foreach (var tick in range.Ticks())
            {
                var y = range.ToPixel(tick, plot.Bottom, -plot.Height);
                context.DrawLine(pen, new Point(x, y), new Point(x + dir * axis.MajorTickLength, y));
            }
        }

        var widest = 0d;
        var ticks = range.Ticks().ToList();
        var drawn = 0;
        foreach (var tick in ticks)
        {
            var text = drawn < labels.Count ? labels[drawn] : FormatNumber(tick, range.TickStep);
            drawn++;
            var t = MakeText(text, axis.TickLabelFontSize, axis.LabelColor);
            var y = range.ToPixel(tick, plot.Bottom, -plot.Height) - t.Height / 2;
            var tx = right ? x + tickOut + 2 : x - tickOut - 2 - t.Width;
            if (axis.ShowTickLabels) context.DrawText(t, new Point(tx, y));
            widest = Math.Max(widest, t.Width);
        }

        if (name is not null)
        {
            var nameY = plot.Y + plot.Height / 2 + name.Width / 2;
            var nameX = right ? x + tickOut + 4 + widest + 2 : x - tickOut - 4 - widest - 2 - name.Height;
            // Rotate FIRST, then translate: Avalonia's matrices are row-vector, so they compose
            // left-to-right. Getting this backwards draws the name above the control's own bounds.
            using (context.PushTransform(Matrix.CreateRotation(-Math.PI / 2) * Matrix.CreateTranslation(nameX, nameY)))
            {
                context.DrawText(name, new Point(0, 0));
            }
        }
    }

    /// <summary>Draws an X axis: its line, ticks, labels and name, at the top or the bottom edge.
    /// <paramref name="offset"/> moves it one strip further out, so axes on the same side stack.</summary>
    private void DrawXAxis(DrawingContext context, Rect plot, AxisRange range, Axis axis, bool top,
                           double offset, List<string> labels, FormattedText? name)
    {
        var pen = MakePen(axis.AxisColor, 1, ChartLineStyle.Solid);
        var y = top ? plot.Y - offset : plot.Bottom + offset;
        var tickOut = axis.ShowMajorTicks ? Math.Max(0, axis.MajorTickLength) : 0;
        var dir = top ? -1 : 1;

        if (axis.ShowAxis) context.DrawLine(pen, new Point(plot.X, y), new Point(plot.Right, y));
        if (axis.ShowAxis && axis.ShowMinorTicks && axis.MinorTickLength > 0)
        {
            foreach (var tick in range.MinorTicks())
            {
                var x = range.ToPixel(tick, plot.X, plot.Width);
                context.DrawLine(pen, new Point(x, y), new Point(x, y + dir * axis.MinorTickLength));
            }
        }
        if (axis.ShowAxis && axis.ShowMajorTicks && axis.MajorTickLength > 0)
        {
            foreach (var tick in range.Ticks())
            {
                var x = range.ToPixel(tick, plot.X, plot.Width);
                context.DrawLine(pen, new Point(x, y), new Point(x, y + dir * axis.MajorTickLength));
            }
        }

        var labelHeight = MakeText("0", axis.TickLabelFontSize, axis.AxisColor).Height;
        var drawn = 0;
        foreach (var tick in range.Ticks())
        {
            var text = drawn < labels.Count ? labels[drawn] : FormatNumber(tick, range.TickStep);
            drawn++;
            var t = MakeText(text, axis.TickLabelFontSize, axis.LabelColor);
            var x = range.ToPixel(tick, plot.X, plot.Width) - t.Width / 2;
            var ty = top ? y - tickOut - 2 - t.Height : y + tickOut + 2;
            if (axis.ShowTickLabels) context.DrawText(t, new Point(x, ty));
        }

        if (name is not null)
        {
            var nameX = plot.X + (plot.Width - name.Width) / 2;
            var nameY = top ? y - tickOut - 2 - labelHeight - 2 - name.Height
                            : y + tickOut + 2 + labelHeight + 2;
            context.DrawText(name, new Point(nameX, nameY));
        }
    }

    private protected void DrawMarkers(DrawingContext context, Point[] points, Plot plot)
    {
        if (plot.MarkerStyle == ChartMarkerStyle.None) return;
        var size = Math.Max(2, plot.MarkerSize);
        var brush = new SolidColorBrush(plot.LineColor);
        var pen = new Pen(brush, 1);
        var half = size / 2;
        foreach (var p in points)
        {
            switch (plot.MarkerStyle)
            {
                case ChartMarkerStyle.Dot:
                    context.DrawEllipse(brush, null, p, half, half);
                    break;
                case ChartMarkerStyle.Cross:
                    context.DrawLine(pen, new Point(p.X - half, p.Y - half), new Point(p.X + half, p.Y + half));
                    context.DrawLine(pen, new Point(p.X - half, p.Y + half), new Point(p.X + half, p.Y - half));
                    break;
                case ChartMarkerStyle.Square:
                    context.DrawRectangle(brush, null, new Rect(p.X - half, p.Y - half, size, size));
                    break;
                case ChartMarkerStyle.Diamond:
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

    private void DrawFrame(DrawingContext context, Rect frame, CornerRadius radius, double thickness)
    {
        if (thickness <= 0) return;
        context.DrawRectangle(null, new Pen(new SolidColorBrush(BorderBrush), thickness),
            new RoundedRect(frame, radius));
    }

    /// <summary>Draws the title in its strip: centred over the plot for Top/Bottom, rotated along the
    /// inner edge of <paramref name="outer"/> for Left/Right. That rect is the chart's content — the
    /// frame minus the Padding — so the padding pushes the title inwards along with the plot.</summary>
    private void DrawTitle(DrawingContext context, FormattedText? title, Rect plot, Rect outer)
    {
        if (title is null) return;
        switch (TitlePosition)
        {
            case ChartTitlePosition.Top:
                context.DrawText(title, new Point(plot.X + (plot.Width - title.Width) / 2, outer.Y + 4));
                break;
            case ChartTitlePosition.Bottom:
                context.DrawText(title, new Point(plot.X + (plot.Width - title.Width) / 2, plot.Bottom + 4));
                break;
            case ChartTitlePosition.Left:
                // Rotate then translate (see the Y axis name): the rotated text starts at the anchor
                // and reads upward, so the anchor sits half a text-width below centre.
                var leftY = plot.Y + plot.Height / 2 + title.Width / 2;
                using (context.PushTransform(Matrix.CreateRotation(-Math.PI / 2)
                                             * Matrix.CreateTranslation(outer.X + 4, leftY)))
                {
                    context.DrawText(title, new Point(0, 0));
                }
                break;
            case ChartTitlePosition.Right:
                var rightY = plot.Y + plot.Height / 2 + title.Width / 2;
                using (context.PushTransform(Matrix.CreateRotation(-Math.PI / 2)
                                             * Matrix.CreateTranslation(outer.Right - 4 - title.Height, rightY)))
                {
                    context.DrawText(title, new Point(0, 0));
                }
                break;
        }
    }

    private void DrawMessage(DrawingContext context, Rect plot, string? message)
    {
        var text = string.IsNullOrWhiteSpace(message)
            ? "No data — right-click to choose a spreadsheet, or add a series"
            : message!;
        var brush = Color.Parse("#909090");
        var formatted = MakeText(text, 12, brush);
        if (formatted.Width > plot.Width)
        {
            // A long explanation (a full path, a reader exception) would otherwise be dropped whole
            // and leave the chart looking broken — trim it to fit instead.
            var perChar = formatted.Width / Math.Max(1, text.Length);
            var maxChars = Math.Max(0, (int)Math.Floor(plot.Width / perChar) - 1);
            if (maxChars < 8) return;   // no room for anything readable
            var cut = text.Substring(0, Math.Min(text.Length, maxChars)).TrimEnd() + "…";
            formatted = MakeText(cut, 12, brush);
            while (formatted.Width > plot.Width && cut.Length > 9)
            {
                cut = cut.Substring(0, cut.Length - 2).TrimEnd() + "…";
                formatted = MakeText(cut, 12, brush);
            }
            if (formatted.Width > plot.Width) return;
        }
        context.DrawText(formatted, new Point(
            plot.X + (plot.Width - formatted.Width) / 2,
            plot.Y + (plot.Height - formatted.Height) / 2));
    }

    // ---- cursors ---------------------------------------------------------------------------

    /// <summary>The indexes of the cursors that are drawn: the first two of the chart, switched on.</summary>
    private List<int> LiveCursorIndexes()
    {
        var live = new List<int>();
        for (var i = 0; i < Math.Min(Cursors.Count, MaxCursors); i++)
        {
            if (Cursors[i].Enabled) live.Add(i);
        }
        return live;
    }

    /// <summary>The series the cursor can read: the ones that are actually drawn.</summary>
    private static List<Plot> VisiblePlots(List<Plot> plots)
        => plots.Where(p => p.Data.HasData && p.Visible).ToList();

    /// <summary>The trace the readout reports and a following cursor rides. Clamped, so the index
    /// survives traces being switched off, and null when the chart has nothing to show.</summary>
    private Plot? SelectedTrace(List<Plot> traces)
    {
        if (traces.Count == 0) return null;
        _selectedTrace = Math.Clamp(_selectedTrace, 0, traces.Count - 1);
        return traces[_selectedTrace];
    }

    /// <summary>The colour a cursor draws in: the colour of the series it follows, when it follows
    /// one — the line, the crossing and the readout are then unmistakably the trace they read — and
    /// otherwise the cursor's own colour, which is what a free crosshair or a threshold wants.
    /// A cursor only follows a trace while its <see cref="ChartCursor.FollowTrace"/> is on, the same
    /// switch that decides whether its horizontal line rides the trace.</summary>
    private static Color CursorColor(ChartCursor cursor, Plot? trace)
        => cursor.FollowTrace && trace is not null ? trace.LineColor : cursor.Color;

    /// <summary>Draws the cursors and their readout. A cursor is a crosshair the user drags: its
    /// lines sit at its X and Y, the readout reports the selected trace where the cursor's X cuts
    /// it, and the whole cursor is drawn in the colour of the series it follows. The clickable parts
    /// are remembered while drawing, so a click always tests the picture that is on screen.</summary>
    private void DrawCursors(DrawingContext context, Rect plot, List<Plot> plots)
    {
        _cursorHits.Clear();
        var common = plots.FirstOrDefault(p => !p.PerSeries) ?? plots.FirstOrDefault();
        if (common is null) return;

        var live = LiveCursorIndexes();
        // The trace the readout reports — and the one a FOLLOWING cursor rides — is decided once, so
        // the crossing point and the numbers can never disagree.
        var traces = VisiblePlots(plots);
        var trace = SelectedTrace(traces);
        foreach (var index in live)
        {
            var cursor = Cursors[index];
            var x = double.IsNaN(cursor.X) ? common.XRange.Mid : cursor.X;
            // Two values per cursor, and they are not the same thing:
            //   readoutY — what the readout shows (and what the two-cursor delta subtracts): the
            //              trace's value at the cursor's X, or the cursor's own Y with no trace.
            //   drawnY   — how high the horizontal line is drawn: the same value while the cursor
            //              follows its trace, but the cursor's own Y when it does not (a threshold).
            var readoutValue = trace is null ? null : ValueAt(trace.Data, x);
            var ownY = double.IsNaN(cursor.Y) ? common.YRange.Mid : cursor.Y;
            var readoutY = readoutValue ?? ownY;
            var drawnY = cursor.FollowTrace && readoutValue.HasValue ? readoutValue.Value : ownY;
            var y = drawnY;
            var px = common.XRange.ToPixel(x, plot.X, plot.Width);
            var py = common.YRange.ToPixel(y, plot.Bottom, -plot.Height);
            var selected = index == _selectedCursor && live.Count > 1;
            // A cursor that follows a trace wears that trace's colour, so "which line is this?" is
            // answered by looking at it; a free one keeps the colour it was given.
            var color = CursorColor(cursor, trace);
            var pen = MakeCursorPen(color, selected ? 2d : 1d, cursor.Style);

            var hit = new CursorHit { Cursor = cursor, Index = index, X = x, Y = readoutY, DrawnColor = color };
            // The crossing point is clamped into the plot, so a cursor parked outside the axis shows as
            // a line along the edge instead of vanishing — and the lines are then inside the plot by
            // construction, which is why they need no clip.
            var cx = Math.Clamp(px, plot.X, plot.Right);
            var cy = Math.Clamp(py, plot.Y, plot.Bottom);
            if (cursor.Orientation is not CursorOrientation.Horizontal)
            {
                context.DrawLine(pen, new Point(cx, plot.Y), new Point(cx, plot.Bottom));
                hit.Vertical = new Rect(cx - CursorGrab, plot.Y, CursorGrab * 2, plot.Height);
            }
            if (cursor.Orientation is not CursorOrientation.Vertical)
            {
                context.DrawLine(pen, new Point(plot.X, cy), new Point(plot.Right, cy));
                hit.Horizontal = new Rect(plot.X, cy - CursorGrab, plot.Width, CursorGrab * 2);
            }
            // The crossing point carries a handle: it shows where the two lines meet (that is what
            // the readout refers to) and it is the grip that moves both lines at once.
            if (cursor.Orientation is CursorOrientation.Both)
            {
                context.DrawRectangle(new SolidColorBrush(color), null, new Rect(cx - 3, cy - 3, 6, 6));
                hit.Handle = new Rect(cx - CursorGrab, cy - CursorGrab, CursorGrab * 2, CursorGrab * 2);
            }
            _cursorHits.Add(hit);
        }

        DrawCursorReadout(context, plot, plots, common);
    }

    /// <summary>Draws the readout of the selected cursor: the tag (C1/C2), the name of the trace it
    /// reports — in that trace's colour — and the values, in the cursor's own drawn colour (the
    /// followed series' colour for a following cursor). The columns follow the cursor's own X/Y
    /// Values switches. It follows the mouse or sits in the top right corner; with no mouse (in the
    /// designer) it is drawn in that corner too, so it can always be seen.</summary>
    private void DrawCursorReadout(DrawingContext context, Rect plot, List<Plot> plots, Plot common)
    {
        _readoutText = string.Empty;
        var live = LiveCursorIndexes();
        if (live.Count == 0) return;
        var index = live.Contains(_selectedCursor) ? _selectedCursor : live[0];
        var cursor = Cursors[index];

        var traces = VisiblePlots(plots);
        if (traces.Count == 0) return;
        var trace = SelectedTrace(traces);
        if (trace is null) return;
        var x = double.IsNaN(cursor.X) ? common.XRange.Mid : cursor.X;
        // The SAME values the crossing was drawn from (see DrawCursors), so the numbers and the
        // handle always agree.
        var value = ValueAt(trace.Data, x);

        // The marker on the trace itself ties the numbers to the line they came from.
        if (value is not null)
        {
            var tx = common.XRange.ToPixel(x, plot.X, plot.Width);
            var ty = trace.YRange.ToPixel(value.Value, plot.Bottom, -plot.Height);
            using (context.PushClip(plot))
            {
                context.DrawEllipse(new SolidColorBrush(trace.LineColor), null, new Point(tx, ty), 3.5, 3.5);
            }
        }

        var parts = new List<string>();
        if (cursor.XValues) parts.Add("X " + FormatCursor(x));
        if (cursor.YValues) parts.Add("Y " + (value is null ? "–" : FormatCursor(value.Value)));
        var name = LegendName(trace, plots.IndexOf(trace));
        var tag = "C" + (index + 1);

        // With TWO cursors on the chart the panel also reports the distance between them, as plain
        // absolute differences (the user's rule): |X1 − X2| and |Y1 − Y2|, from the values each
        // cursor's own readout line shows. Drawn in the OTHER cursor's colour, because it is the pair
        // that it describes, and only while both are switched on.
        string? delta = null;
        // The panel belongs to the cursor beside it, so it is drawn in the colour that cursor was
        // drawn in — inherited from the series it follows, or its own when it does not.
        var color = _cursorHits.FirstOrDefault(h => h.Index == index)?.DrawnColor ?? CursorColor(cursor, trace);
        var deltaColor = color;
        if (_cursorHits.Count >= 2)
        {
            var first = _cursorHits[0];
            var second = _cursorHits[1];
            delta = "ΔX " + FormatCursor(Math.Abs(first.X - second.X))
                  + "   ΔY " + FormatCursor(Math.Abs(first.Y - second.Y));
            deltaColor = (first.Index == index ? second : first).DrawnColor;
        }

        // The panel's TEXT is a fixed palette now: the series line keeps that trace's colour, and the
        // numbers are always white on the always-black panel below. A reading therefore looks the same
        // on every chart, whatever the series colour or the chart's own background is.
        var head = MakeText(tag + "  " + name, 11, trace.LineColor);
        var body = parts.Count > 0 ? MakeText(string.Join("   ", parts), 11, Colors.White) : null;
        var deltaText = delta is null ? null : MakeText(delta, 11, Colors.White);
        var width = Math.Min(Math.Max(Math.Max(head.Width, body?.Width ?? 0), deltaText?.Width ?? 0) + 12,
                             Math.Max(20, plot.Width - 8));
        var height = head.Height + (body is null ? 0 : body.Height + 2)
                   + (deltaText is null ? 0 : deltaText.Height + 7) + 10;

        // Where it goes: beside the pointer, or in the corner. Either way it is kept inside the plot.
        var follow = ReadoutPosition is CursorReadout.FollowMouse && _hasPointer;
        var rx = follow ? _pointer.X + 14 : plot.Right - 6 - width;
        var ry = follow ? _pointer.Y + 14 : plot.Y + 6;
        rx = Math.Clamp(rx, plot.X + 4, Math.Max(plot.X + 4, plot.Right - 4 - width));
        ry = Math.Clamp(ry, plot.Y + 4, Math.Max(plot.Y + 4, plot.Bottom - 4 - height));
        var rect = new Rect(rx, ry, width, height);
        _readoutRect = rect;

        context.DrawRectangle(new SolidColorBrush(Colors.Black),
            new Pen(new SolidColorBrush(color), 1), new RoundedRect(rect, new CornerRadius(3)));
        context.DrawText(head, new Point(rect.X + 6, rect.Y + 5));
        if (body is not null) context.DrawText(body, new Point(rect.X + 6, rect.Y + 5 + head.Height + 2));
        if (deltaText is not null)
        {
            // A hairline over the pair's row, so "this line is about both cursors" is visible at a
            // glance rather than only in its colour.
            var lineY = rect.Y + 5 + head.Height + (body is null ? 0 : body.Height + 2) + 3;
            context.DrawLine(new Pen(new SolidColorBrush(deltaColor, 0.5), 1),
                new Point(rect.X + 6, lineY), new Point(rect.Right - 6, lineY));
            context.DrawText(deltaText, new Point(rect.X + 6, lineY + 3));
        }

        _readoutText = tag + " " + name + (parts.Count > 0 ? ": " + string.Join(", ", parts) : string.Empty)
                     + (delta is null ? string.Empty : " | " + delta);
    }

    /// <summary>The trace's Y at <paramref name="x"/>: linearly interpolated between the two samples
    /// around it (the cursors move freely, so the value in between is a real reading). Outside the
    /// trace's own X range the nearest end value is reported; null when the trace has no data.</summary>
    private static double? ValueAt(ChartData data, double x)
    {
        if (!data.HasData) return null;
        var xs = data.Xs;
        var ys = data.Ys;
        if (xs.Length == 1) return ys[0];
        for (var i = 1; i < xs.Length; i++)
        {
            var lo = Math.Min(xs[i - 1], xs[i]);
            var hi = Math.Max(xs[i - 1], xs[i]);
            if (x < lo || x > hi) continue;
            if (hi == lo) return ys[i];
            var f = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
            return ys[i - 1] + f * (ys[i] - ys[i - 1]);
        }
        var ascending = xs[0] < xs[xs.Length - 1];
        return x < xs[0] ? (ascending ? ys[0] : ys[ys.Length - 1])
                         : (ascending ? ys[ys.Length - 1] : ys[0]);
    }

    /// <summary>How far one sample is at <paramref name="x"/> — the distance between the two samples
    /// around it, which is what the ←/→ keys step by. Falls back to an axis tick when there is only
    /// one sample.
    /// </summary>
    private static double SampleStep(ChartData data, double x, AxisRange range)
    {
        var xs = data.Xs;
        if (xs.Length < 2) return range.TickStep;
        for (var i = 1; i < xs.Length; i++)
        {
            if (x <= Math.Max(xs[i - 1], xs[i])) return Math.Abs(xs[i] - xs[i - 1]);
        }
        return Math.Abs(xs[xs.Length - 1] - xs[xs.Length - 2]);
    }

    /// <summary>A readout number: trimmed of trailing zeros, or exactly
    /// <see cref="CursorDecimals"/> decimals when that is set to 0…6.</summary>
    private string FormatCursor(double value)
    {
        var decimals = Math.Clamp(CursorDecimals, -1, 6);
        var text = decimals < 0
            ? value.ToString("0.####", CultureInfo.CurrentCulture)
            : value.ToString("0." + new string('0', decimals), CultureInfo.CurrentCulture);
        return text == "-0" ? "0" : text;
    }

    private static IPen MakeCursorPen(Color color, double thickness, CursorStyle style)
        => new Pen(new SolidColorBrush(color), Math.Max(0.5, thickness), DashForCursor(style))
        {
            LineCap = style == CursorStyle.Dot ? PenLineCap.Round : PenLineCap.Flat
        };

    private static IDashStyle? DashForCursor(CursorStyle style) => style switch
    {
        CursorStyle.Dash => new DashStyle(new double[] { 4, 3 }, 0),
        CursorStyle.Dot => new DashStyle(new double[] { 0.01, 3 }, 0),
        CursorStyle.Long => new DashStyle(new double[] { 10, 5 }, 0),
        CursorStyle.Short => new DashStyle(new double[] { 2, 2 }, 0),
        _ => null
    };

    // ---- cursor input ----------------------------------------------------------------------

    /// <summary>Moves the cursor being dragged. The vertical line changes X, the horizontal line Y,
    /// and the handle at the crossing point both at once — the same lines the user sees. A cursor that
    /// FOLLOWS its trace has no Y of its own, so every grip moves it along the series instead: X comes
    /// from the pointer and the crossing's height comes from the trace.</summary>
    private void DragCursorTo(Point point)
    {
        var cursor = _dragCursor;
        var common = _plots.FirstOrDefault(p => !p.PerSeries) ?? _plots.FirstOrDefault();
        if (cursor is null || common is null) return;
        if (cursor.FollowTrace)
        {
            cursor.X = common.XRange.FromPixel(point.X, _plotRect.X, _plotRect.Width);
            InvalidateVisual();
            return;
        }
        if (_dragMode is 1 or 3) cursor.X = common.XRange.FromPixel(point.X, _plotRect.X, _plotRect.Width);
        if (_dragMode is 2 or 3) cursor.Y = common.YRange.FromPixel(point.Y, _plotRect.Bottom, -_plotRect.Height);
        InvalidateVisual();
    }

    /// <summary>Copies the readout to the clipboard, so a reading can be pasted elsewhere.</summary>
    private void CopyReadout()
    {
        var clipboard = TopLevel.GetTopLevel(this)?.Clipboard;
        if (clipboard is null || _readoutText.Length == 0) return;
        _ = clipboard.SetTextAsync(_readoutText);
    }

    /// <summary>The chart's right-click menu: choosing the spreadsheet, which cursors are switched on,
    /// where the readout sits, and add / remove / reset / copy. Nothing here is written back to the
    /// form — the saved defaults are the ones the Cursor Editor sets, and a restart starts from those
    /// again.
    /// <para>
    /// The state is carried in the item's TEXT (a leading tick) rather than in a check box: menu item
    /// ticks arrived in Avalonia 11.1, and the bundled control still has to build on 11.0.
    /// </para></summary>
    private void ShowChartMenu()
    {
        var items = new List<object>();

        // The spreadsheet picker lives here now, at the top: it is the one action on the chart that is
        // not about cursors. (It used to be a "…" button drawn on the chart's surface.)
        var browseItem = new MenuItem { Header = "Choose spreadsheet…" };
        browseItem.Click += (_, _) => _ = BrowseForFile();
        items.Add(browseItem);
        items.Add(new Separator());

        for (var i = 0; i < Math.Min(Cursors.Count, MaxCursors); i++)
        {
            var index = i;
            var toggle = new MenuItem
            {
                Header = (Cursors[i].Enabled ? "✓ " : "    ") + "Cursor " + (i + 1)
            };
            toggle.Click += (_, _) =>
            {
                Cursors[index].Enabled = !Cursors[index].Enabled;
                _selectedCursor = index;
                InvalidateVisual();
            };
            items.Add(toggle);
        }
        if (items.Count > 0) items.Add(new Separator());

        var followItem = new MenuItem
        {
            Header = (ReadoutPosition is CursorReadout.FollowMouse ? "✓ " : "    ") + "Readout: follow the mouse"
        };
        followItem.Click += (_, _) =>
        {
            ReadoutPosition = CursorReadout.FollowMouse;
            InvalidateVisual();
        };
        var cornerItem = new MenuItem
        {
            Header = (ReadoutPosition is CursorReadout.TopRight ? "✓ " : "    ") + "Readout: top right corner"
        };
        cornerItem.Click += (_, _) =>
        {
            ReadoutPosition = CursorReadout.TopRight;
            InvalidateVisual();
        };
        items.Add(followItem);
        items.Add(cornerItem);
        items.Add(new Separator());

        var addItem = new MenuItem { Header = "Add cursor", IsEnabled = Cursors.Count < MaxCursors };
        addItem.Click += (_, _) => AddCursor();
        var removeItem = new MenuItem { Header = "Remove cursor", IsEnabled = Cursors.Count > 0 };
        removeItem.Click += (_, _) => RemoveCursor();
        var resetItem = new MenuItem { Header = "Reset cursors to the middle", IsEnabled = Cursors.Count > 0 };
        resetItem.Click += (_, _) => ResetCursors();
        var copyItem = new MenuItem { Header = "Copy readout", IsEnabled = _readoutText.Length > 0 };
        copyItem.Click += (_, _) => CopyReadout();
        items.Add(addItem);
        items.Add(removeItem);
        items.Add(resetItem);
        items.Add(new Separator());
        items.Add(copyItem);

        var menu = new ContextMenu { ItemsSource = items, PlacementTarget = this };
        menu.Open(this);
    }

    private static FormattedText MakeText(string text, double size, Color color)
        => new(text, CultureInfo.CurrentCulture, FlowDirection.LeftToRight,
            new Typeface(FontFamily.Default), Math.Max(6, size), new SolidColorBrush(color));

    /// <summary>Trims the given amounts off a rectangle's edges (never past zero size).</summary>
    private static Rect Chop(Rect rect, double left, double top, double right, double bottom)
        => new(rect.X + left, rect.Y + top,
               Math.Max(0, rect.Width - left - right), Math.Max(0, rect.Height - top - bottom));

    private protected static IPen MakePen(Color color, double thickness, ChartLineStyle style)
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
/// A fitted axis: the range actually drawn, the tick step, and the data-to-pixel mapping. Built from
/// the data (auto-fit) or from explicit Min/Max, then snapped outward to "nice" 1/2/5 x 10^n steps so
/// the labels are round numbers.
/// </summary>
internal sealed class AxisRange
{
    private double _min;
    private double _max;

    /// <summary>The tick step (also the basis for the label precision).</summary>
    internal double TickStep { get; private set; } = 1;

    /// <summary>The subdivisions of a major step (minor ticks).</summary>
    private int Subdivisions { get; set; } = 5;

    /// <summary>Builds the range for one axis of data.</summary>
    internal static AxisRange Over(IReadOnlyList<double> values, double forcedMin, double forcedMax,
                                   int targetTicks, int subdivisions)
    {
        var range = new AxisRange { Subdivisions = Math.Max(1, subdivisions) };
        var min = double.IsNaN(forcedMin) || values.Count == 0 ? (values.Count == 0 ? 0 : values.Min()) : forcedMin;
        var max = double.IsNaN(forcedMax) || values.Count == 0 ? (values.Count == 0 ? 1 : values.Max()) : forcedMax;
        if (max <= min) max = min + (Math.Abs(min) > 1 ? Math.Abs(min) * 0.1 : 1);

        range.TickStep = NiceStep(max - min, Math.Max(2, targetTicks));
        if (double.IsNaN(forcedMin)) min = Math.Floor(min / range.TickStep) * range.TickStep;
        if (double.IsNaN(forcedMax)) max = Math.Ceiling(max / range.TickStep) * range.TickStep;
        // Always include the span, even when a forced bound falls inside it.
        range._min = Math.Min(min, max);
        range._max = Math.Max(min, max);
        if (range._max <= range._min) range._max = range._min + range.TickStep;
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
        var count = (int)Math.Round((_max - _min) / TickStep);
        count = Math.Clamp(count, 0, 1000);
        for (var i = 0; i <= count; i++) yield return _min + i * TickStep;
    }

    /// <summary>The minor tick values (the major step split into <see cref="Subdivisions"/>).</summary>
    internal IEnumerable<double> MinorTicks()
    {
        if (Subdivisions < 2) yield break;
        var subStep = TickStep / Subdivisions;
        var count = (int)Math.Round((_max - _min) / subStep);
        count = Math.Clamp(count, 0, 5000);
        for (var i = 0; i <= count; i++)
        {
            if (i % Subdivisions != 0) yield return _min + i * subStep;
        }
    }

    /// <summary>One value's pixel position along an axis drawn from <paramref name="origin"/> by <paramref name="length"/>.</summary>
    internal double ToPixel(double value, double origin, double length)
        => origin + (value - _min) / (_max - _min) * length;

    /// <summary>The pixel position back in data units (what a cursor drag needs).</summary>
    internal double FromPixel(double pixel, double origin, double length)
        => length == 0 ? _min : _min + (pixel - origin) / length * (_max - _min);

    /// <summary>The middle of the range: where a cursor that has never been placed sits.</summary>
    internal double Mid => (_min + _max) / 2;
}

/// <summary>
/// A LINE PLOT: one line per series, Y values in sample order with X running 0…N-1. Series read their
/// Y from the spreadsheet's Y columns (C, E, G …) and may set AxisMode="PerSeries" for their own scale.
/// </summary>
public class GrumpyLinePlot : ChartBase
{
    /// <summary>The implicit series' Y samples (used only when the chart has no series elements).</summary>
    public static readonly StyledProperty<double[]?> ValuesProperty =
        AvaloniaProperty.Register<GrumpyLinePlot, double[]?>(nameof(Values));

    static GrumpyLinePlot()
    {
        AffectsRender<GrumpyLinePlot>(ValuesProperty);
        ValuesProperty.Changed.AddClassHandler<GrumpyLinePlot>((plot, _) => plot.Reload());
    }

    /// <summary>The Y samples of the implicit series (X is the sample index).</summary>
    [TypeConverter(typeof(DoubleArrayConverter))]
    public double[]? Values { get => GetValue(ValuesProperty); set => SetValue(ValuesProperty, value); }

    /// <inheritdoc/>
    protected override bool ImplicitXFromIndex => true;

    /// <inheritdoc/>
    protected override ChartData InlineData()
    {
        var values = Values ?? Array.Empty<double>();
        return new ChartData
        {
            Xs = Enumerable.Range(0, values.Length).Select(i => (double)i).ToArray(),
            Ys = values
        };
    }

    /// <inheritdoc/>
    protected override void SetInlineData(double[] xs, double[] ys) => Values = ys;
}

/// <summary>
/// An X,Y PLOT: one point-set per series, drawn as a line, as markers, or both. A series reads its X
/// and Y from the spreadsheet's column pairs (B/C, D/E, F/G …) unless AxisMode="Common" is used, in
/// which case every series shares the chart's X column.
/// </summary>
public class GrumpyXYPlot : ChartBase
{
    /// <summary>The implicit series' (x,y) pairs (used only when the chart has no series elements).</summary>
    public static readonly StyledProperty<double[,]?> PointsProperty =
        AvaloniaProperty.Register<GrumpyXYPlot, double[,]?>(nameof(Points));

    static GrumpyXYPlot()
    {
        AffectsRender<GrumpyXYPlot>(PointsProperty);
        PointsProperty.Changed.AddClassHandler<GrumpyXYPlot>((plot, _) => plot.Reload());
    }

    /// <summary>The (x,y) pairs of the implicit series — an n-by-2 array.</summary>
    [TypeConverter(typeof(DoubleMatrixConverter))]
    public double[,]? Points { get => GetValue(PointsProperty); set => SetValue(PointsProperty, value); }

    /// <inheritdoc/>
    protected override bool ImplicitXFromIndex => false;

    /// <inheritdoc/>
    protected override ChartData InlineData()
    {
        var points = Points;
        if (points is null) return new ChartData();
        var count = points.GetLength(0);
        var data = new ChartData { Xs = new double[count], Ys = new double[count] };
        for (var i = 0; i < count; i++)
        {
            data.Xs[i] = points[i, 0];
            data.Ys[i] = points[i, 1];
        }
        return data;
    }

    /// <inheritdoc/>
    protected override void SetInlineData(double[] xs, double[] ys)
    {
        var count = Math.Min(xs.Length, ys.Length);
        var points = new double[count, 2];
        for (var i = 0; i < count; i++)
        {
            points[i, 0] = xs[i];
            points[i, 1] = ys[i];
        }
        Points = points;
    }
}

/// <summary>Reads <c>Labels="Jan,Feb,Mar"</c> from XAML into a <see cref="string"/> array.</summary>
public sealed class StringArrayConverter : TypeConverter
{
    /// <inheritdoc/>
    public override bool CanConvertFrom(ITypeDescriptorContext? context, Type sourceType)
        => sourceType == typeof(string) || base.CanConvertFrom(context, sourceType);

    /// <inheritdoc/>
    public override object? ConvertFrom(ITypeDescriptorContext? context, CultureInfo? culture, object value)
        => value is string text
            ? text.Split(',').Select(part => part.Trim()).ToArray()
            : base.ConvertFrom(context, culture, value);
}

/// <summary>
/// One slice of a <see cref="GrumpyPiePlot"/>: its NAME (<see cref="ChartSeries.Title"/>, which is what
/// the legend shows), its COLOUR (<see cref="ChartSeries.LineColor"/> — the same property a series uses,
/// so the Slices editor's rows mean what the Series editor's rows mean), how far it is pushed out of the
/// pie, and whether it is drawn at all.
/// <para>
/// A slice listed here is an OVERRIDE: the pie's slices come from the data, and this names the ones that
/// should look different. A slice the form does not mention gets a colour from the chart's palette.
/// Slices are matched to the data by their name.
/// </para>
/// </summary>
public class PieSlice : ChartSeries
{
    /// <summary>How far this slice is pushed out of the pie, in pixels (0 = in place).</summary>
    public double Explode { get; set; }

    /// <summary>A slice's position is its row, so it is never read from a workbook column.</summary>
    internal override bool XFromIndex => true;
}

/// <summary>
/// A BAR / COLUMN chart: one bar per category, drawn from its baseline — side by side, stacked, or
/// stacked and filled to 100% (see <see cref="BarMode"/>). A point's NAME comes from the spreadsheet's X
/// column (a label column of text, dates or numbers), and when it has none the axis falls back to
/// numbers. 0 is always on the Y scale, because a bar is read as a length from its baseline.
/// <para>
/// Everything shared with the other charts works exactly as it does on a line chart: series (one bar
/// colour each, from the Series editor), the common and per-series axes, the legend, the two cursors, the
/// background gradient, the border and the padding.
/// </para>
/// </summary>
public class GrumpyBarPlot : ChartBase
{
    /// <summary>The implicit series' values, used only when the chart has no series elements. One bar
    /// per value; the category names still come from the spreadsheet's X column.</summary>
    public static readonly StyledProperty<double[]?> ValuesProperty =
        AvaloniaProperty.Register<GrumpyBarPlot, double[]?>(nameof(Values));

    /// <summary>Grouped, Stacked or Stacked100.</summary>
    public static readonly StyledProperty<BarMode> BarModeProperty =
        AvaloniaProperty.Register<GrumpyBarPlot, BarMode>(nameof(BarMode));

    /// <summary>How much of its slot one bar fills: 0.1 … 1 (default 0.8, the rest is the gap).</summary>
    public static readonly StyledProperty<double> BarWidthProperty =
        AvaloniaProperty.Register<GrumpyBarPlot, double>(nameof(BarWidth), 0.8d);

    /// <summary>How round a bar's corners are, in pixels (0 = square corners, the default).</summary>
    public static readonly StyledProperty<double> BarCornerRadiusProperty =
        AvaloniaProperty.Register<GrumpyBarPlot, double>(nameof(BarCornerRadius));

    static GrumpyBarPlot()
    {
        AffectsRender<GrumpyBarPlot>(ValuesProperty, BarModeProperty, BarWidthProperty, BarCornerRadiusProperty);
        ValuesProperty.Changed.AddClassHandler<GrumpyBarPlot>((plot, _) => plot.Reload());
    }

    /// <summary>The values of the implicit series (used only when the chart has no series elements).</summary>
    [TypeConverter(typeof(DoubleArrayConverter))]
    public double[]? Values { get => GetValue(ValuesProperty); set => SetValue(ValuesProperty, value); }

    /// <summary>How the bars stand in their category (see <see cref="BarMode"/>).</summary>
    public BarMode BarMode { get => GetValue(BarModeProperty); set => SetValue(BarModeProperty, value); }

    /// <summary>How much of its slot one bar fills.</summary>
    public double BarWidth { get => GetValue(BarWidthProperty); set => SetValue(BarWidthProperty, value); }

    /// <summary>How round a bar's corners are, in pixels.</summary>
    public double BarCornerRadius { get => GetValue(BarCornerRadiusProperty); set => SetValue(BarCornerRadiusProperty, value); }

    /// <inheritdoc/>
    protected override bool ImplicitXFromIndex => true;

    /// <inheritdoc/>
    protected override bool ZeroBaseline => true;

    /// <inheritdoc/>
    protected override bool StackSeries => BarMode is not BarMode.Grouped;

    /// <inheritdoc/>
    protected override bool NamedXAxis => true;

    /// <summary>Half a slot of room at each end, so the first and last bar are drawn whole.</summary>
    protected override double XPadUnits => 0.5d;

    /// <inheritdoc/>
    protected override bool ZeroToHundred => BarMode is BarMode.Stacked100;

    /// <inheritdoc/>
    protected override ChartData InlineData()
    {
        var values = Values ?? Array.Empty<double>();
        return new ChartData
        {
            Xs = Enumerable.Range(0, values.Length).Select(i => (double)i).ToArray(),
            Ys = values
        };
    }

    /// <inheritdoc/>
    protected override void SetInlineData(double[] xs, double[] ys) => Values = ys;

    /// <summary>
    /// Draws one bar per point, per series. Grouped bars split the category's slot between the series
    /// (a switched-off series keeps its place, so the others do not jump sideways when it is toggled);
    /// stacked bars share the whole slot and start where the previous series ended, which is why the
    /// scale is fitted to the stack's totals (see <see cref="ChartBase.StackSeries"/>).
    /// </summary>
    private protected override void DrawSeriesLayer(DrawingContext context, List<Plot> plots, Rect plot)
    {
        if (plots.Count == 0) return;
        var stacked = BarMode is not BarMode.Grouped;
        var bands = stacked ? StackBands(plots, BarMode is BarMode.Stacked100) : null;
        var radius = Math.Max(0, BarCornerRadius);

        for (var s = 0; s < plots.Count; s++)
        {
            var p = plots[s];
            var count = p.Data.Ys.Length;
            if (count == 0 || !p.Visible) continue;

            // The slot a category owns is one X unit, measured THROUGH the axis' own mapping (its origin
            // and its length), so the bars keep their width whatever the scale is.
            var slot = Math.Abs(p.XRange.ToPixel(1, plot.X, plot.Width) - p.XRange.ToPixel(0, plot.X, plot.Width));
            if (!(slot > 0)) slot = plot.Width / Math.Max(1, p.Data.Xs.Length);
            var group = Math.Clamp(BarWidth, 0.05, 1) * slot;
            var width = stacked ? group : group / Math.Max(1, plots.Count);
            var offset = stacked ? 0 : (s - (plots.Count - 1) / 2d) * width;

            double[] bases;
            double[] tops;
            if (bands is not null) { bases = bands[s].Base; tops = bands[s].Top; }
            else { bases = new double[count]; tops = p.Data.Ys; }

            var fill = new SolidColorBrush(p.LineColor);
            for (var i = 0; i < count; i++)
            {
                var x = p.XRange.ToPixel(p.Data.Xs[i], plot.X, plot.Width) + offset;
                var top = YAt(p, plot, tops[i]);
                var bottom = YAt(p, plot, bases[i]);
                var rect = new Rect(x - width / 2, Math.Min(top, bottom), width, Math.Abs(bottom - top));
                context.DrawRectangle(fill, null, new RoundedRect(rect, radius));
            }
        }
    }
}

/// <summary>
/// An AREA chart: each series is a filled shape under its line. A plain area chart fills every series
/// down to zero (so the series drawn last covers the ones before it — that is what a plain area chart
/// does), while <see cref="AreaMode.Stacked"/> fills each series from the top of the previous one, which
/// is the shape monitoring dashboards use, and <see cref="AreaMode.Stacked100"/> makes every category
/// total 100%.
/// <para>
/// The data, the series, the axes (with the points' names along the bottom), the legend, the cursors,
/// the background gradient, the border and the padding all work as they do on the line chart.
/// </para>
/// </summary>
public class GrumpyAreaPlot : ChartBase
{
    /// <summary>The implicit series' values, used only when the chart has no series elements.</summary>
    public static readonly StyledProperty<double[]?> ValuesProperty =
        AvaloniaProperty.Register<GrumpyAreaPlot, double[]?>(nameof(Values));

    /// <summary>Plain, Stacked or Stacked100.</summary>
    public static readonly StyledProperty<AreaMode> AreaModeProperty =
        AvaloniaProperty.Register<GrumpyAreaPlot, AreaMode>(nameof(AreaMode));

    /// <summary>How solid the fill is, 0 … 100 (default 60): the line on top stays fully opaque, so a
    /// lighter fill lets the gridlines and the series behind it show through.</summary>
    public static readonly StyledProperty<double> AreaOpacityProperty =
        AvaloniaProperty.Register<GrumpyAreaPlot, double>(nameof(AreaOpacity), 60d);

    static GrumpyAreaPlot()
    {
        AffectsRender<GrumpyAreaPlot>(ValuesProperty, AreaModeProperty, AreaOpacityProperty);
        ValuesProperty.Changed.AddClassHandler<GrumpyAreaPlot>((plot, _) => plot.Reload());
    }

    /// <summary>The values of the implicit series (used only when the chart has no series elements).</summary>
    [TypeConverter(typeof(DoubleArrayConverter))]
    public double[]? Values { get => GetValue(ValuesProperty); set => SetValue(ValuesProperty, value); }

    /// <summary>How the series are filled (see <see cref="AreaMode"/>).</summary>
    public AreaMode AreaMode { get => GetValue(AreaModeProperty); set => SetValue(AreaModeProperty, value); }

    /// <summary>How solid the fill is, as a percentage.</summary>
    public double AreaOpacity { get => GetValue(AreaOpacityProperty); set => SetValue(AreaOpacityProperty, value); }

    /// <inheritdoc/>
    protected override bool ImplicitXFromIndex => true;

    /// <inheritdoc/>
    protected override bool ZeroBaseline => true;

    /// <inheritdoc/>
    protected override bool StackSeries => AreaMode is not AreaMode.Plain;

    /// <inheritdoc/>
    protected override bool NamedXAxis => true;

    /// <inheritdoc/>
    protected override bool ZeroToHundred => AreaMode is AreaMode.Stacked100;

    /// <inheritdoc/>
    protected override ChartData InlineData()
    {
        var values = Values ?? Array.Empty<double>();
        return new ChartData
        {
            Xs = Enumerable.Range(0, values.Length).Select(i => (double)i).ToArray(),
            Ys = values
        };
    }

    /// <inheritdoc/>
    protected override void SetInlineData(double[] xs, double[] ys) => Values = ys;

    /// <summary>
    /// Fills each series down to its baseline and then strokes the line along its top, so the shape has a
    /// crisp edge and the same colour as its fill. Stacked modes fill from the previous series' top; the
    /// plain mode fills to zero, which is the classic overlap (and why the series order matters).
    /// </summary>
    private protected override void DrawSeriesLayer(DrawingContext context, List<Plot> plots, Rect plot)
    {
        if (plots.Count == 0) return;
        var stacked = AreaMode is not AreaMode.Plain;
        var bands = stacked ? StackBands(plots, AreaMode is AreaMode.Stacked100) : null;
        var fillOpacity = Math.Clamp(AreaOpacity, 0, 100) / 100d;

        for (var s = 0; s < plots.Count; s++)
        {
            var p = plots[s];
            var count = p.Data.Ys.Length;
            if (count == 0 || !p.Visible) continue;

            double[] bases;
            double[] tops;
            if (bands is not null) { bases = bands[s].Base; tops = bands[s].Top; }
            else { bases = new double[count]; tops = p.Data.Ys; }

            var xs = p.Data.Xs;
            var geometry = new StreamGeometry();
            using (var g = geometry.Open())
            {
                g.BeginFigure(new Point(p.XRange.ToPixel(xs[0], plot.X, plot.Width), YAt(p, plot, tops[0])), true);
                for (var i = 1; i < count; i++)
                    g.LineTo(new Point(p.XRange.ToPixel(xs[i], plot.X, plot.Width), YAt(p, plot, tops[i])));
                // back along the baseline, right to left, so the shape is closed
                for (var i = count - 1; i >= 0; i--)
                    g.LineTo(new Point(p.XRange.ToPixel(xs[i], plot.X, plot.Width), YAt(p, plot, bases[i])));
                g.EndFigure(true);
            }
            context.DrawGeometry(new SolidColorBrush(p.LineColor, fillOpacity), null, geometry);

            if (p.Connected && count > 1)
            {
                var pen = MakePen(p.LineColor, p.LineThickness, p.LineStyle);
                for (var i = 1; i < count; i++)
                {
                    context.DrawLine(pen,
                        new Point(p.XRange.ToPixel(xs[i - 1], plot.X, plot.Width), YAt(p, plot, tops[i - 1])),
                        new Point(p.XRange.ToPixel(xs[i], plot.X, plot.Width), YAt(p, plot, tops[i])));
                }
            }
            if (p.MarkerStyle is not ChartMarkerStyle.None)
            {
                DrawMarkers(context, xs.Select((x, i) =>
                    new Point(p.XRange.ToPixel(x, plot.X, plot.Width), YAt(p, plot, tops[i]))).ToArray(), p);
            }
        }
    }
}

/// <summary>
/// A PIE / DOUGHNUT chart: one wedge per labelled value. The slices come from the workbook's label and
/// value columns (the label column may hold text, dates or numbers — a pie is the one chart whose
/// categories are almost always words), or from the typed <see cref="Labels"/> and <see cref="Values"/>.
/// A doughnut is the same chart with <see cref="DoughnutPercent"/> above zero.
/// <para>
/// There is no cartesian frame here — no gridlines, no axes and no cursors — and the legend lists the
/// SLICES, so clicking an entry switches that slice off exactly as it switches a trace off on the other
/// charts. The colour of a slice is its own; the ones the form does not mention take a colour from the
/// chart's palette, and the Slices editor writes the overrides.
/// </para>
/// </summary>
public class GrumpyPiePlot : ChartBase
{
    /// <summary>The implicit series' values (one wedge each), used when the chart has no workbook.</summary>
    public static readonly StyledProperty<double[]?> ValuesProperty =
        AvaloniaProperty.Register<GrumpyPiePlot, double[]?>(nameof(Values));

    /// <summary>The wedge names, one per value ("Jan,Feb,Mar"), used with <see cref="Values"/>.</summary>
    public static readonly StyledProperty<string[]?> LabelsProperty =
        AvaloniaProperty.Register<GrumpyPiePlot, string[]?>(nameof(Labels));

    /// <summary>How thick the ring is, as a percentage of the radius: 0 is a solid pie (the default),
    /// 50 makes a doughnut whose hole is half the pie.</summary>
    public static readonly StyledProperty<double> DoughnutPercentProperty =
        AvaloniaProperty.Register<GrumpyPiePlot, double>(nameof(DoughnutPercent));

    /// <summary>Where the first slice starts: 0 is 12 o'clock, and the slices run clockwise from there.</summary>
    public static readonly StyledProperty<double> StartAngleProperty =
        AvaloniaProperty.Register<GrumpyPiePlot, double>(nameof(StartAngle));

    /// <summary>The gap between two neighbouring slices, in degrees (0 = they touch).</summary>
    public static readonly StyledProperty<double> SliceGapProperty =
        AvaloniaProperty.Register<GrumpyPiePlot, double>(nameof(SliceGap));

    /// <summary>The line drawn between two slices.</summary>
    public static readonly StyledProperty<Color> SliceBorderColorProperty =
        AvaloniaProperty.Register<GrumpyPiePlot, Color>(nameof(SliceBorderColor), Colors.White);

    /// <summary>How thick that line is (0 = no line, so the colours touch).</summary>
    public static readonly StyledProperty<double> SliceBorderThicknessProperty =
        AvaloniaProperty.Register<GrumpyPiePlot, double>(nameof(SliceBorderThickness), 1d);

    static GrumpyPiePlot()
    {
        AffectsRender<GrumpyPiePlot>(ValuesProperty, LabelsProperty, DoughnutPercentProperty, StartAngleProperty,
            SliceGapProperty, SliceBorderColorProperty, SliceBorderThicknessProperty);
        ValuesProperty.Changed.AddClassHandler<GrumpyPiePlot>((plot, _) => plot.Reload());
        LabelsProperty.Changed.AddClassHandler<GrumpyPiePlot>((plot, _) => plot.Reload());
    }

    /// <summary>The wedge values (used when the chart has no workbook).</summary>
    [TypeConverter(typeof(DoubleArrayConverter))]
    public double[]? Values { get => GetValue(ValuesProperty); set => SetValue(ValuesProperty, value); }

    /// <summary>The wedge names, one per value (used with <see cref="Values"/>).</summary>
    [TypeConverter(typeof(StringArrayConverter))]
    public string[]? Labels { get => GetValue(LabelsProperty); set => SetValue(LabelsProperty, value); }

    /// <summary>How thick the ring is, as a percentage of the radius (0 = a solid pie).</summary>
    public double DoughnutPercent { get => GetValue(DoughnutPercentProperty); set => SetValue(DoughnutPercentProperty, value); }

    /// <summary>Where the first slice starts, in degrees clockwise from 12 o'clock.</summary>
    public double StartAngle { get => GetValue(StartAngleProperty); set => SetValue(StartAngleProperty, value); }

    /// <summary>The gap between two neighbouring slices, in degrees.</summary>
    public double SliceGap { get => GetValue(SliceGapProperty); set => SetValue(SliceGapProperty, value); }

    /// <summary>Colour of the line between two slices.</summary>
    public Color SliceBorderColor { get => GetValue(SliceBorderColorProperty); set => SetValue(SliceBorderColorProperty, value); }

    /// <summary>Thickness of that line.</summary>
    public double SliceBorderThickness { get => GetValue(SliceBorderThicknessProperty); set => SetValue(SliceBorderThicknessProperty, value); }

    /// <summary>
    /// The slices the form names: one element per slice that should differ from the palette —
    /// <c>&lt;charts:PieSlice Title="North" LineColor="#E4572E" Explode="8"/&gt;</c>. A slice the form
    /// does not mention is drawn from the palette, and switching one off in the legend switches it off
    /// for the session (which slices are switched on is runtime state, as it is for a series).
    /// </summary>
    public AvaloniaList<PieSlice> Slices { get; } = new();

    /// <inheritdoc/>
    protected override bool ImplicitXFromIndex => true;

    /// <inheritdoc/>
    protected override bool HasCartesianAxes => false;

    /// <inheritdoc/>
    protected override bool SupportsCursors => false;

    /// <inheritdoc/>
    protected override ChartData InlineData()
    {
        var values = Values ?? Array.Empty<double>();
        var names = Labels ?? Array.Empty<string>();
        return new ChartData
        {
            Xs = Enumerable.Range(0, values.Length).Select(i => (double)i).ToArray(),
            Ys = values,
            Labels = Enumerable.Range(0, values.Length)
                .Select(i => i < names.Length && !string.IsNullOrWhiteSpace(names[i]) ? names[i]! : $"Slice {i + 1}")
                .ToArray()
        };
    }

    /// <inheritdoc/>
    protected override void SetInlineData(double[] xs, double[] ys) => Values = ys;

    /// <summary>The colours a slice takes when the form does not name one.</summary>
    private static readonly Color[] SlicePalette =
    {
        Color.Parse("#2D7DD2"), Color.Parse("#E4572E"), Color.Parse("#3FA34D"), Color.Parse("#F2A541"),
        Color.Parse("#8367C7"), Color.Parse("#00A6A6"), Color.Parse("#C05780"), Color.Parse("#6B7A8F"),
        Color.Parse("#8CB369"), Color.Parse("#B5651D")
    };

    /// <summary>Stand-ins for the slices the form does not name, kept so the legend's tick boxes stick.</summary>
    private readonly Dictionary<string, PieSlice> _sliceStubs = new();

    /// <summary>
    /// One plot per SLICE, which is what makes the shared machinery work: the legend lists the slices
    /// with their colours, clicking an entry switches that wedge off, and the drawing below reads the
    /// same list back. <see cref="PieSlice"/> is a <see cref="ChartSeries"/>, so a slice and a series
    /// are described by the same properties.
    /// </summary>
    private protected override List<Plot> BuildPlots()
    {
        var data = DataFor(null, XColumn ?? "B", YColumn ?? "C", true, labelPairs: true);
        var plots = new List<Plot>();
        for (var i = 0; i < data.Ys.Length; i++)
        {
            var name = i < data.Labels.Length && !string.IsNullOrWhiteSpace(data.Labels[i])
                ? data.Labels[i]
                : $"Slice {i + 1}";
            var slice = SliceFor(name, i);
            plots.Add(new Plot
            {
                Data = new ChartData
                {
                    Xs = new[] { 0d },
                    Ys = new[] { data.Ys[i] },
                    Labels = new[] { name },
                    XTitle = data.XTitle,
                    YTitle = name
                },
                Definition = slice,
                LineColor = slice.LineColor,
                Visible = slice.Visible
            });
        }
        // A workbook that could not be read has nothing to draw, and its message has to survive: the
        // empty plot carries it into the chart's "no data" line.
        if (plots.Count == 0 && data.Error is not null)
            plots.Add(new Plot { Data = new ChartData { Error = data.Error } });
        return plots;
    }

    /// <summary>The named slice for this wedge, or a remembered stand-in with its palette colour.</summary>
    private PieSlice SliceFor(string name, int index)
    {
        foreach (var slice in Slices)
            if (string.Equals(slice.Title, name, StringComparison.OrdinalIgnoreCase)) return slice;
        if (_sliceStubs.TryGetValue(name, out var stub)) return stub;
        var made = new PieSlice { Title = name, LineColor = SlicePalette[index % SlicePalette.Length] };
        _sliceStubs[name] = made;
        return made;
    }

    /// <summary>
    /// Draws the wedges. Each one is an arc out at the radius and back in at the ring's inner radius (or
    /// back to the centre for a solid pie), which is one closed path either way — so a doughnut is the
    /// same drawing with a hole in it. A slice may explode outwards along its own middle, and the gap is
    /// taken off both of its edges so the gaps stay even.
    /// </summary>
    private protected override void DrawSeriesLayer(DrawingContext context, List<Plot> plots, Rect plot)
    {
        var total = 0d;
        foreach (var p in plots) if (p.Visible && p.Data.HasData) total += Math.Max(0, p.Data.Ys[0]);
        if (total <= 0) return;

        var side = Math.Min(plot.Width, plot.Height);
        if (side <= 4) return;
        var centre = new Point(plot.X + plot.Width / 2, plot.Y + plot.Height / 2);
        var radius = side / 2;
        var inner = radius * Math.Clamp(DoughnutPercent, 0, 95) / 100d;
        var gap = Math.Max(0, SliceGap);
        var border = SliceBorderThickness > 0
            ? MakePen(SliceBorderColor, SliceBorderThickness, ChartLineStyle.Solid)
            : null;
        var angle = StartAngle - 90d;   // 0° is 12 o'clock; -90° is where a circle's 0 radian sits

        foreach (var p in plots)
        {
            if (!p.Visible || !p.Data.HasData) continue;
            var value = Math.Max(0, p.Data.Ys[0]);
            if (value <= 0) continue;

            var sweep = value / total * 360d;
            var from = angle + gap / 2;
            var to = angle + sweep - gap / 2;
            angle += sweep;
            if (to - from <= 0.01) continue;

            var origin = centre;
            var explode = (p.Definition as PieSlice)?.Explode ?? 0d;
            if (explode > 0)
            {
                var middle = (from + to) / 2 * Math.PI / 180d;
                origin = new Point(centre.X + Math.Cos(middle) * explode, centre.Y + Math.Sin(middle) * explode);
            }

            var large = to - from > 180d;
            var geometry = new StreamGeometry();
            using (var g = geometry.Open())
            {
                g.BeginFigure(OnCircle(origin, radius, from), true);
                g.ArcTo(OnCircle(origin, radius, to), new Size(radius, radius), 0, large, SweepDirection.Clockwise);
                if (inner > 0)
                {
                    g.LineTo(OnCircle(origin, inner, to));
                    g.ArcTo(OnCircle(origin, inner, from), new Size(inner, inner), 0, large, SweepDirection.CounterClockwise);
                }
                else
                {
                    g.LineTo(origin);
                }
                g.EndFigure(true);
            }
            context.DrawGeometry(new SolidColorBrush(p.LineColor), border, geometry);
        }
    }

    /// <summary>The point <paramref name="degrees"/> around a circle (0° = 12 o'clock, clockwise).</summary>
    private static Point OnCircle(Point centre, double radius, double degrees)
    {
        var radians = degrees * Math.PI / 180d;
        return new Point(centre.X + Math.Cos(radians) * radius, centre.Y + Math.Sin(radians) * radius);
    }
}

/// <summary>
/// Remembers the folder the chart's own file picker used last, so the next one opens there instead of
/// wherever the platform happens to start. It lives in the per-user app-data folder
/// (~/.local/share/&lt;App&gt; on Linux, %LOCALAPPDATA%\&lt;App&gt; on Windows) — the same place the
/// generated DataSet helpers keep their data — which is what makes it survive a restart. Every step is
/// best-effort: an unwritable location simply means the dialog starts at the platform's default again.
/// </summary>
internal static class ChartPickerMemory
{
    private static string? _folder;
    private static bool _loaded;

    private static string StorePath
    {
        get
        {
            var name = System.Reflection.Assembly.GetEntryAssembly()?.GetName().Name
                       ?? System.Reflection.Assembly.GetExecutingAssembly().GetName().Name
                       ?? "app";
            var root = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            if (string.IsNullOrEmpty(root)) root = Path.GetTempPath();
            var dir = Path.Combine(root, name);
            try { Directory.CreateDirectory(dir); } catch { /* the failing write is what reports it */ }
            return Path.Combine(dir, "GrumpyCharts.lastfolder");
        }
    }

    /// <summary>The folder the last pick used (null = let the platform choose), or null once it is gone.</summary>
    internal static string? LastFolder
    {
        get
        {
            if (!_loaded)
            {
                _loaded = true;
                try { if (File.Exists(StorePath)) _folder = File.ReadAllText(StorePath).Trim(); }
                catch { _folder = null; }
            }
            // A folder on a drive that is no longer mounted is worse than no answer: the platform would
            // open the dialog inside a path that does not exist.
            if (string.IsNullOrEmpty(_folder) || !Directory.Exists(_folder)) return null;
            return _folder;
        }
        set
        {
            _loaded = true;
            _folder = value;
            try
            {
                if (string.IsNullOrEmpty(value))
                {
                    if (File.Exists(StorePath)) File.Delete(StorePath);
                }
                else
                {
                    File.WriteAllText(StorePath, value!);
                }
            }
            catch { /* best effort */ }
        }
    }
}
