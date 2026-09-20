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
//   * LiveUpdate = True re-reads the workbook when it changes on disk. ShowBrowse draws a "…" button
//     (also shown automatically while the chart has no data) and BrowseForFile() does the same from
//     your own button; both are no-ops without a TopLevel, so the control is safe to place in a preview.
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
using Avalonia.Collections;
using Avalonia.Controls;
using Avalonia.Input;
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

/// <summary>Where an axis is drawn: Left/Right for a Y axis, Top/Bottom for an X axis.</summary>
public enum AxisPosition
{
    /// <summary>The left edge (a Y axis).</summary>
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

    /// <summary>Colour of the axis line, its ticks, its labels and its name.</summary>
    public Color AxisColor { get; set; } = Color.Parse("#666666");

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

/// <summary>One series of points, plus the axis names and any reason there is no data.</summary>
public sealed class ChartData
{
    /// <summary>The X values (for a line series these are the sample indices 0,1,2…).</summary>
    public double[] Xs { get; set; } = Array.Empty<double>();

    /// <summary>The Y values.</summary>
    public double[] Ys { get; set; } = Array.Empty<double>();

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
                                   int headerRow, int firstDataRow, bool xFromIndex)
    {
        var data = new ChartData();
        try
        {
            using var zip = ZipFile.OpenRead(path);
            var shared = ReadSharedStrings(zip);
            var sheet = FindSheet(zip);
            if (sheet is null)
            {
                data.Error = $"\"{Path.GetFileName(path)}\" has no worksheet.";
                return data;
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

            data.Xs = xs.ToArray();
            data.Ys = ys.ToArray();
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
            data.Error = $"Cannot read \"{Path.GetFileName(path)}\": {ex.Message}";
        }
        return data;
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
    // ---- frame ------------------------------------------------------------------------------
    public static readonly StyledProperty<bool> ShowBorderProperty =
        AvaloniaProperty.Register<ChartBase, bool>(nameof(ShowBorder), true);

    public static readonly StyledProperty<Color> BorderBrushProperty =
        AvaloniaProperty.Register<ChartBase, Color>(nameof(BorderBrush), Color.Parse("#C8C8C8"));

    public static readonly StyledProperty<double> BorderThicknessProperty =
        AvaloniaProperty.Register<ChartBase, double>(nameof(BorderThickness), 1d);

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

    /// <summary>Draw the "…" file picker (also drawn automatically while the chart has no data).</summary>
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
            ShowBorderProperty, BorderBrushProperty, BorderThicknessProperty, CornerRadiusProperty,
            PlotBackColorProperty, PlotBackOpacityProperty,
            ShowGridProperty, GridColorProperty, GridThicknessProperty, GridStyleProperty,
            ShowAxesProperty, AxisColorProperty,
            ShowMajorTicksProperty, MajorTickLengthProperty,
            ShowMinorTicksProperty, MinorTickLengthProperty,
            ShowTickLabelsProperty, TickLabelFontSizeProperty,
            ShowAxisTitlesProperty, XAxisTitleProperty, YAxisTitleProperty,
            ShowTitleProperty, TitleProperty, TitleColorProperty, TitlePositionProperty, TitleFontSizeProperty,
            SourceFileProperty, XColumnProperty, YColumnProperty, HeaderRowProperty, FirstDataRowProperty,
            ShowBrowseProperty, ShowLegendProperty, LegendFontSizeProperty,
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

    /// <summary>Corner rounding of the frame.</summary>
    public CornerRadius CornerRadius { get => GetValue(CornerRadiusProperty); set => SetValue(CornerRadiusProperty, value); }

    /// <summary>The chart's backcolour (fills the whole chart).</summary>
    public Color PlotBackColor { get => GetValue(PlotBackColorProperty); set => SetValue(PlotBackColorProperty, value); }

    /// <summary>How solid the chart's backcolour is, in percent (0-100).</summary>
    public double PlotBackOpacity { get => GetValue(PlotBackOpacityProperty); set => SetValue(PlotBackOpacityProperty, value); }

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
    private Axis CommonYAxis() => YAxis ?? new Axis
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

    /// <summary>The common X axis to draw: see <see cref="CommonYAxis"/>.</summary>
    private Axis CommonXAxis() => XAxis ?? new Axis
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

    /// <summary>The X column of the nth series in the editor's default pairing (B, D, F, …).</summary>
    internal static string DefaultXColumn(int index) => SpreadsheetReader.ColumnAfter("B", index * 2);

    /// <summary>The Y column of the nth series in the editor's default pairing (C, E, G, …).</summary>
    internal static string DefaultYColumn(int index) => SpreadsheetReader.ColumnAfter("C", index * 2);

    private readonly Dictionary<string, ChartData> _cache = new();
    private string? _cacheFile;

    /// <summary>The data for one series (cached per column pair and workbook).</summary>
    private ChartData DataFor(ChartSeries? series, string xColumn, string yColumn, bool xFromIndex)
    {
        var file = SourceFile;
        if (string.IsNullOrWhiteSpace(file)) return InlineData();

        var key = $"{xColumn}|{yColumn}|{xFromIndex}";
        if (_cacheFile != file) { _cache.Clear(); _cacheFile = file; }
        if (_cache.TryGetValue(key, out var cached)) return cached;

        var data = SpreadsheetReader.Read(file!, xColumn, yColumn, HeaderRow, FirstDataRow, xFromIndex);
        _cache[key] = data;
        return data;
    }

    /// <summary>Every series to draw, with its data, styling, scale and axes resolved.</summary>
    private List<Plot> BuildPlots()
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
            plot.YRange = AxisRange.Over(data.Ys, MinY, MaxY, 5, 5);
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
        var ys = commonPlots.SelectMany(p => p.Data.Ys).ToArray();
        var subdivisions = Series.Any(s => s.XFromIndex) ? 1 : 5;
        var xr = AxisRange.Over(xs, MinX, MaxX, 6, subdivisions);
        var yr = AxisRange.Over(ys, MinY, MaxY, 5, 5);
        foreach (var plot in commonPlots)
        {
            plot.XRange = xr;
            plot.YRange = yr;
        }
        return plots;
    }

    private bool XFromIndex => Series.Count > 0 ? Series[0].XFromIndex : ImplicitXFromIndex;

    /// <summary>True when the implicit (no-series) chart plots Y against the sample index.</summary>
    protected abstract bool ImplicitXFromIndex { get; }

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

    /// <summary>
    /// True when the "…" file picker should be drawn: when <see cref="ShowBrowse"/> asks for it, or
    /// when the chart has no data — an empty chart is exactly where you want to pick the workbook.
    /// </summary>
    private bool BrowseVisible => ShowBrowse || !HasAnyData();

    /// <summary>True when at least one series has points to draw.</summary>
    private bool HasAnyData() => _lastPlotCount > 0;

    private int _lastPlotCount;

    /// <summary>Clicking the drawn "…" button loads a file.</summary>
    protected override void OnPointerPressed(PointerPressedEventArgs e)
    {
        base.OnPointerPressed(e);
        var position = e.GetPosition(this);
        // The legend is interactive: clicking an entry (its tick box OR its name) switches that trace
        // on and off. The rects are the ones the last Render laid out.
        foreach (var entry in _legend)
        {
            if (!entry.Item.Contains(position)) continue;
            entry.Series.Visible = !entry.Series.Visible;
            InvalidateVisual();
            e.Handled = true;
            return;
        }
        if (BrowseVisible && _browseRect.Contains(position))
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

        var frameWidth = ShowBorder ? Math.Max(0, BorderThickness) : 0;
        var frame = new Rect(size).Deflate(frameWidth / 2);
        var radius = CornerRadius;

        // The chart's OWN plate comes first, filling the whole interior - not just the plot area.
        // Everything drawn outside the plot (the title, the axis labels, the ticks) then sits on the
        // chart's colour instead of on whatever is behind the control.
        var opacity = Math.Clamp(PlotBackOpacity, 0, 100) / 100d;
        var plate = new SolidColorBrush(PlotBackColor, opacity);
        context.DrawRectangle(plate, null, new RoundedRect(frame, radius));

        var plots = BuildPlots();
        _lastPlotCount = plots.Count(p => p.Data.HasData);
        var outer = plots.FirstOrDefault(p => p.Data.Error is not null) ?? plots.FirstOrDefault();
        var seriesError = outer?.Data.Error;

        var wantTitle = ShowTitle && !string.IsNullOrWhiteSpace(Title);
        var titleText = wantTitle ? MakeText(Title!, TitleFontSize, TitleColor) : null;

        // Work out the plot rectangle: the frame, minus the breathing room, minus the title and the
        // axis furniture around it.
        var plot = frame.Deflate(8);
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

        // The legend bar runs along the bottom of the chart and takes its height off the plot: entries
        // flow left to right and WRAP, so the bar grows vertically to fit whatever it must show.
        var legendHeight = MeasureLegend(frame.Width, plots);
        _legendRect = legendHeight > 0
            ? new Rect(frame.X, frame.Bottom - legendHeight, frame.Width, legendHeight)
            : default;
        if (legendHeight > 0) plot = Chop(plot, 0, 0, 0, legendHeight + 4);

        var common = plots.FirstOrDefault(p => !p.PerSeries) ?? plots.FirstOrDefault();
        if (common is null)
        {
            DrawFrame(context, frame, radius, frameWidth);
            DrawTitle(context, titleText, plot, frame);
            DrawLegend(context);
            DrawMessage(context, plot, null);
            DrawBrowseButton(context, frame);
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

        // Plot-area fill (same colour as the plate, drawn explicitly so the plot can later carry its
        // own tint without touching the rest of the chart).
        context.DrawRectangle(plate, null, plot);

        if (_lastPlotCount == 0)
        {
            DrawFrame(context, frame, radius, frameWidth);
            DrawTitle(context, titleText, plot, frame);
            DrawLegend(context);
            DrawMessage(context, plot, seriesError);
            DrawBrowseButton(context, frame);
            return;
        }

        // Gridlines, then the common axis with its ticks and labels.
        if (ShowGrid)
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
            TickLabels(commonX, common.XRange), AxisName(commonX, XAxisTitle, common.Data.XTitle));

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
                TickLabels(p.XAxis!, p.XRange), AxisName(p.XAxis!, null, p.Data.XTitle));
            topUsed += XBlockHeight(p.XAxis!, p.XRange, null, p.Data.XTitle);
        }
        foreach (var p in bottomBlocks)
        {
            DrawXAxis(context, plot, p.XRange, p.XAxis!, false, bottomUsed,
                TickLabels(p.XAxis!, p.XRange), AxisName(p.XAxis!, null, p.Data.XTitle));
            bottomUsed += XBlockHeight(p.XAxis!, p.XRange, null, p.Data.XTitle);
        }

        // The data itself, in order, clipped to the plot area. A series whose trace is switched off
        // keeps its place in the scale but is not drawn.
        using (context.PushClip(plot))
        {
            foreach (var p in plots)
            {
                if (!p.Data.HasData || !p.Visible) continue;
                var points = p.Data.Xs.Select((_, i) => new Point(
                    p.XRange.ToPixel(p.Data.Xs[i], plot.X, plot.Width),
                    p.YRange.ToPixel(p.Data.Ys[i], plot.Bottom, -plot.Height))).ToArray();

                if (p.Connected && points.Length > 1)
                {
                    var pen = MakePen(p.LineColor, p.LineThickness, p.LineStyle);
                    for (var i = 1; i < points.Length; i++) context.DrawLine(pen, points[i - 1], points[i]);
                }
                DrawMarkers(context, points, p);
            }
        }

        // Frame + title last, so nothing can overdraw them.
        DrawFrame(context, frame, radius, frameWidth);
        DrawTitle(context, titleText, plot, frame);
        DrawLegend(context);
        DrawBrowseButton(context, frame);
    }

    /// <summary>The tick label texts of an axis (empty when it draws no labels).</summary>
    private static List<string> TickLabels(Axis axis, AxisRange range)
        => axis.ShowTickLabels
            ? range.Ticks().Select(v => FormatNumber(v, range.TickStep)).ToList()
            : new List<string>();

    /// <summary>An axis' name text: its own <see cref="Axis.Name"/>, else the chart-level title, else
    /// the spreadsheet's column header. Null when this axis draws no name.</summary>
    private FormattedText? AxisName(Axis axis, string? chartTitle, string fromSheet)
    {
        if (!axis.ShowAxisName) return null;
        var text = !string.IsNullOrWhiteSpace(axis.Name) ? axis.Name
            : !string.IsNullOrWhiteSpace(chartTitle) ? chartTitle : fromSheet;
        return string.IsNullOrWhiteSpace(text)
            ? null
            : MakeText(text!, axis.TickLabelFontSize, axis.AxisColor);
    }

    /// <summary>The gutter width one Y axis occupies: its tick overhang, its labels and its name.</summary>
    private double YBlockWidth(Axis axis, AxisRange range, string? chartTitle, string fromSheet)
    {
        var tickOut = axis.ShowAxis && axis.ShowMajorTicks ? Math.Max(0, axis.MajorTickLength) : 0;
        var labels = TickLabels(axis, range);
        var widest = labels.Count > 0
            ? labels.Max(t => MakeText(t, axis.TickLabelFontSize, axis.AxisColor).Width)
            : 0;
        var name = AxisName(axis, chartTitle, fromSheet);
        return 4 + tickOut + widest + (name is null ? 0 : name.Height + 6);
    }

    /// <summary>The gutter height one X axis occupies: its tick overhang, its labels and its name.</summary>
    private double XBlockHeight(Axis axis, AxisRange range, string? chartTitle, string fromSheet)
    {
        var tickOut = axis.ShowAxis && axis.ShowMajorTicks ? Math.Max(0, axis.MajorTickLength) : 0;
        var labels = TickLabels(axis, range);
        var labelHeight = labels.Count > 0 ? MakeText("0", axis.TickLabelFontSize, axis.AxisColor).Height : 0;
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
        internal Rect Item;
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
    /// Lays the legend out across <paramref name="width"/> and returns the height it needs, so the
    /// plot can give up that much room. Entries run left to right and wrap onto further rows, and the
    /// bar is as wide as the chart, so a long list grows DOWNWARD instead of being cut off. Returns 0
    /// when there is nothing to list: a chart without series elements draws one unnamed line, and
    /// there is nothing to name or switch off.
    /// </summary>
    private double MeasureLegend(double width, List<Plot> plots)
    {
        _legend.Clear();
        if (!ShowLegend || Series.Count == 0) return 0;

        const double pad = 2, boxSize = 13, boxGap = 6, itemGap = 16, rowGap = 4;
        var font = Math.Max(6, LegendFontSize);
        var rows = new List<List<(Plot Plot, FormattedText Text)>>();
        var row = new List<(Plot, FormattedText)>();
        var rowWidth = 0d;
        var rowHeight = 0d;
        var inner = Math.Max(24, width - pad * 2);

        for (var i = 0; i < plots.Count; i++)
        {
            var plot = plots[i];
            if (plot.Definition is null) continue;
            var text = MakeText(LegendName(plot, i), font, plot.LineColor);
            var itemWidth = boxSize + boxGap + text.Width;
            // Wrap: an item that does not fit goes on the next row (a single over-long name still
            // gets its own row and is clipped by the chart, like any other text).
            if (row.Count > 0 && rowWidth + itemGap + itemWidth > inner)
            {
                rows.Add(row);
                row = new List<(Plot, FormattedText)>();
                rowWidth = 0;
                rowHeight = 0;
            }
            if (row.Count > 0) rowWidth += itemGap;
            row.Add((plot, text));
            rowWidth += itemWidth;
            rowHeight = Math.Max(rowHeight, Math.Max(boxSize, text.Height));
        }
        if (row.Count > 0) rows.Add(row);
        if (rows.Count == 0) return 0;

        var height = pad * 2 + rows.Sum(r => r.Max(e => Math.Max(boxSize, e.Text.Height))) + rowGap * (rows.Count - 1);
        // Keep the layout in LOCAL coordinates; Render translates it into _legendRect once it knows
        // where the bar lands (it is bottom-anchored in the frame).
        var y = pad;
        foreach (var entries in rows)
        {
            var rowH = entries.Max(e => Math.Max(boxSize, e.Text.Height));
            var x = pad;
            foreach (var (plot, text) in entries)
            {
                var itemWidth = boxSize + boxGap + text.Width;
                _legend.Add(new LegendEntry
                {
                    Series = plot.Definition!,
                    Text = text,
                    Color = plot.LineColor,
                    Item = new Rect(x, y, itemWidth, rowH),
                    Box = new Rect(x, y + (rowH - boxSize) / 2, boxSize, boxSize)
                });
                x += itemWidth + itemGap;
            }
            y += rowH + rowGap;
        }
        return height;
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
            entry.Item = new Rect(entry.Item.X + _legendRect.X, entry.Item.Y + _legendRect.Y,
                                  entry.Item.Width, entry.Item.Height);
            entry.Box = new Rect(entry.Box.X + _legendRect.X, entry.Box.Y + _legendRect.Y,
                                 entry.Box.Width, entry.Box.Height);
        }

        using (context.PushClip(_legendRect))
        {
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
                context.DrawText(entry.Text, new Point(entry.Box.Right + 6, entry.Item.Y + (entry.Item.Height - entry.Text.Height) / 2));
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
            var t = MakeText(text, axis.TickLabelFontSize, axis.AxisColor);
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
            var t = MakeText(text, axis.TickLabelFontSize, axis.AxisColor);
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

    private void DrawMarkers(DrawingContext context, Point[] points, Plot plot)
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
                // Rotate then translate (see the Y axis name): the rotated text starts at the anchor
                // and reads upward, so the anchor sits half a text-width below centre.
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
            ? "No data — set SourceFile, or add a series"
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

    private void DrawBrowseButton(DrawingContext context, Rect frame)
    {
        _browseRect = default;
        if (!BrowseVisible) return;
        const double boxSize = 18d;
        var rect = new Rect(frame.Right - boxSize - 4, frame.Y + 4, boxSize, boxSize);
        _browseRect = rect;
        context.DrawRectangle(new SolidColorBrush(Color.Parse("#F0F0F0")),
            new Pen(new SolidColorBrush(Color.Parse("#C0C0C0")), 1), new RoundedRect(rect, new CornerRadius(3)));
        var dots = MakeText("…", 12, Color.Parse("#505050"));
        context.DrawText(dots, new Point(rect.X + (boxSize - dots.Width) / 2, rect.Y + (boxSize - dots.Height) / 2));
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
