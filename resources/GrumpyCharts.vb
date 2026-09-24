' BUNDLED-COPY: 0.11.18
' GrumpyCharts.vb — BUNDLED RESOURCE (the C# twin is resources/GrumpyCharts.cs). Copied into every
' generated project, next to ChromeWindow.vb / PathPicker.vb / GrumpyPanel.vb.
'
' A small, dependency-free CHART CONTROL SET: two controls that draw themselves, with no NuGet
' package, no template and no assets. Every chart type supports MULTIPLE SERIES, each with its own
' line/marker styling and its own axis mode.
'
'   <charts:GrumpyLinePlot x:Name="LinePlot1" Width="320" Height="180" SourceFile="/home/me/data.xlsx">
'     <charts:LineSeries Title="Inside"  YColumn="C" LineColor="#4ea6a1" MarkerStyle="Dot"/>
'     <charts:LineSeries Title="Outside" YColumn="E" LineColor="#e08a3c" MarkerStyle="Cross"/>
'   </charts:GrumpyLinePlot>
'
'   <charts:GrumpyXYPlot x:Name="XYPlot1" SourceFile="/home/me/data.xlsx">
'     <charts:XYSeries Title="Sensor A" XColumn="B" YColumn="C" AxisMode="Common"/>
'     <charts:XYSeries Title="Sensor B" XColumn="D" YColumn="E" AxisMode="PerSeries">
'       <charts:XYSeries.YAxis>
'         <charts:Axis Position="Right" AxisColor="#e08a3c"/>
'       </charts:XYSeries.YAxis>
'     </charts:XYSeries>
'   </charts:GrumpyXYPlot>
'
' SERIES / DATA / AXES — see the long comment block in resources/GrumpyCharts.cs; the rules are
' identical here: series 1 reads Y from column C, series 2 from E, series 3 from G (the pairs are
' B/C, D/E, F/G), a line series plots against the sample index, AxisMode=Common shares the chart's X
' column and one scale while PerSeries gives the series its own columns, scale and axes, and a chart
' with no series elements still works as one implicit series styled from the chart-level values.
Imports System
Imports System.Collections.Generic
Imports System.ComponentModel
Imports System.Globalization
Imports System.IO
Imports System.IO.Compression
Imports System.Linq
Imports System.Threading
Imports System.Threading.Tasks
Imports System.Xml.Linq
Imports Avalonia
Imports Avalonia.Collections
Imports Avalonia.Controls
Imports Avalonia.Input
Imports Avalonia.Input.Platform
Imports Avalonia.Interactivity
Imports Avalonia.Layout
Imports Avalonia.Media
Imports Avalonia.Metadata
Imports Avalonia.Platform.Storage
Imports Avalonia.Threading

Namespace Global.AvaloniaCharts

    ''' <summary>How a plot line or the gridlines are drawn.</summary>
    Public Enum ChartLineStyle
        ''' <summary>An unbroken line.</summary>
        Solid
        ''' <summary>Dashes.</summary>
        Dash
        ''' <summary>Round dots.</summary>
        Dot
        ''' <summary>Alternating dash and dot.</summary>
        DashDot
    End Enum

    ''' <summary>The point symbol used by a series.</summary>
    Public Enum ChartMarkerStyle
        ''' <summary>No symbol — a bare line (when Connected) or nothing at all.</summary>
        None
        ''' <summary>A filled circle.</summary>
        Dot
        ''' <summary>A diagonal cross.</summary>
        Cross
        ''' <summary>A filled square.</summary>
        Square
        ''' <summary>A filled diamond.</summary>
        Diamond
    End Enum

    ''' <summary>Where the chart title sits around the plot area.</summary>
    Public Enum ChartTitlePosition
        ''' <summary>Above the plot area (the default).</summary>
        Top
        ''' <summary>Below the plot area.</summary>
        Bottom
        ''' <summary>Down the left edge, rotated.</summary>
        Left
        ''' <summary>Down the right edge, rotated.</summary>
        Right
    End Enum

    ''' <summary>Where the legend bar sits: across the bottom (the default), across the top, or down a
    ''' side. A Top/Bottom legend spans the chart's width and wraps onto further rows; a Left/Right one
    ''' fills the side and wraps onto further columns.</summary>
    Public Enum LegendPosition
        ''' <summary>Across the bottom of the drawing area.</summary>
        Bottom
        ''' <summary>Across the top of the drawing area.</summary>
        Top
        ''' <summary>Down the left-hand side, one entry per row.</summary>
        Left
        ''' <summary>Down the right-hand side.</summary>
        Right
    End Enum

    ''' <summary>Where an axis is drawn: Left/Right for a Y axis, Top/Bottom for an X axis.</summary>
    Public Enum AxisPosition        ''' <summary>The left edge (a Y axis).</summary>
        Left
        ''' <summary>The right edge (a Y axis).</summary>
        Right
        ''' <summary>The top edge (an X axis).</summary>
        Top
        ''' <summary>The bottom edge (an X axis — the default).</summary>
        Bottom
    End Enum

    ''' <summary>Whether a series is plotted against the shared axis or its own.</summary>
    Public Enum AxisMode
        ''' <summary>Use the chart's common axis (the default).</summary>
        Common
        ''' <summary>Use this series' own X/Y columns and its own axis.</summary>
        PerSeries
    End Enum

    ''' <summary>
    ''' Which parts of a cursor are DRAWN. A cursor always carries both an X and a Y position (the
    ''' mouse moves it in both directions); this only decides which lines are visible: Vertical is the
    ''' crosshair minus its horizontal line, Horizontal is the crosshair minus its vertical line.
    ''' </summary>
    Public Enum CursorOrientation
        ''' <summary>Draw the crosshair: the vertical line and the horizontal line.</summary>
        Both
        ''' <summary>Draw the vertical line only.</summary>
        Vertical
        ''' <summary>Draw the horizontal line only.</summary>
        Horizontal
    End Enum

    ''' <summary>The dash pattern of a cursor's lines.</summary>
    Public Enum CursorStyle
        ''' <summary>An unbroken line.</summary>
        Solid
        ''' <summary>Dashes (the default).</summary>
        Dash
        ''' <summary>Dots.</summary>
        Dot
        ''' <summary>Long dashes.</summary>
        ' Bracketed: 'Long' and 'Short' are Visual Basic type keywords, and a keyword cannot be an
        ' enum member's name. The METADATA name is still "Long"/"Short", so the XAML written by the
        ' Cursor Editor (Style="Long") loads into both twins unchanged.
        [Long]
        ''' <summary>Short dashes.</summary>
        [Short]
    End Enum

    ''' <summary>Where the cursor readout — the selected trace and its values — is drawn.</summary>
    Public Enum CursorReadout
        ''' <summary>In a small panel that follows the mouse pointer (the default).</summary>
        FollowMouse
        ''' <summary>In the top right corner of the drawing area, out of the way.</summary>
        TopRight
    End Enum

    ''' <summary>How the bars of a GrumpyBarPlot stand in their category.</summary>
    Public Enum BarMode
        ''' <summary>Side by side, one bar per series per category (the default) — the easiest to compare.</summary>
        Grouped
        ''' <summary>Each series starts where the previous one ended, so a category reads as its total.</summary>
        Stacked
        ''' <summary>Stacked and filled to 100%, which turns the same data into a share-of-total chart.</summary>
        Stacked100
    End Enum

    ''' <summary>How the series of a GrumpyAreaPlot are filled.</summary>
    Public Enum AreaMode
        ''' <summary>Every series is its own filled shape, drawn over the ones before it (the default).</summary>
        Plain
        ''' <summary>Every series is filled from the top of the previous one (a stacked area).</summary>
        Stacked
        ''' <summary>Stacked and filled to 100% — a share-of-total picture over the categories.</summary>
        Stacked100
    End Enum

    ''' <summary>Where a chart's data comes from (the Data Selector editor's first choice).</summary>
    Public Enum DataSourceKind
        ''' <summary>A page of an .xlsx workbook (the default): see SourceFile and SourceSheet.</summary>
        Spreadsheet
        ''' <summary>A data file such as a CSV — named by DataFile, not read yet.</summary>
        DataFiles
    End Enum

    ''' <summary>How a GrumpyWaterfallPlot draws each of its samplesets.</summary>
    Public Enum WaterfallStyle
        ''' <summary>A filled ribbon under each trace, drawn solid, so a nearer set hides the ones behind
        ''' it (the default) — the classic waterfall.</summary>
        Ribbon
        ''' <summary>The same ribbon drawn see-through: the depth reads as layers instead of as occlusion.</summary>
        Translucent
        ''' <summary>No fill at all: the traces and their connectors make a wireframe mesh.</summary>
        Lines
    End Enum

    ''' <summary>What decides the colour of a GrumpyWaterfallPlot's traces and mesh.</summary>
    Public Enum WaterfallColorMode
        ''' <summary>One colour per sampleset — the series' own colour, the way the pie colours its slices
        ''' (the default).</summary>
        Sampleset
        ''' <summary>A heat map by amplitude: the value picks the colour between HeatMin and HeatMax, so a
        ''' peak's tip is the map's top colour and its base the bottom one.</summary>
        Value
        ''' <summary>Two colours either side of SplitValue — a limit line rather than a palette.</summary>
        Split
    End Enum

    ''' <summary>How a GrumpySurfacePlot presents its surface.</summary>
    Public Enum SurfaceStyle
        ''' <summary>The grid mesh only: the quads' edges, with nothing filled — you see through the sheet.</summary>
        GridMesh
        ''' <summary>The grid mesh drawn over a filled surface (the default): the classic 3D surface look.</summary>
        GridMeshSolid
        ''' <summary>The filled surface only, no mesh lines.</summary>
        Solid
    End Enum

    ''' <summary>What decides the colour of a GrumpySurfacePlot's surface.</summary>
    Public Enum SurfaceColorMode
        ''' <summary>One colour per series (one per Z slice) — the series' own colour, the way the ribbon of a
        ''' waterfall takes its set's colour.</summary>
        Sampleset
        ''' <summary>A temperature ramp by height: the value picks the colour between LowColor and HighColor,
        ''' so a ridge is the top colour and a valley the bottom one (the default).</summary>
        Temperature
    End Enum


    ''' <summary>Reads SampleSets="1,2,3; 4,5,6" from XAML: one sampleset per semicolon-separated group,
    ''' the sample points comma-separated inside it. This is what a waterfall sketches with when there is no
    ''' workbook at hand — a real capture names one column per sampleset instead.</summary>
    Public Class DoubleSetConverter
        Inherits TypeConverter

        Public Overrides Function CanConvertFrom(context As ITypeDescriptorContext, sourceType As Type) As Boolean
            Return sourceType Is GetType(String) OrElse MyBase.CanConvertFrom(context, sourceType)
        End Function

        Public Overrides Function ConvertFrom(context As ITypeDescriptorContext, culture As CultureInfo, value As Object) As Object
            Dim text = TryCast(value, String)
            If text Is Nothing Then Return MyBase.ConvertFrom(context, culture, value)
            Dim sets As New List(Of Double())()
            For Each group In text.Split(New Char() {";"c, ControlChars.Cr, ControlChars.Lf}, StringSplitOptions.RemoveEmptyEntries)
                Dim points As New List(Of Double)()
                For Each token In group.Split(New Char() {","c, " "c, ControlChars.Tab}, StringSplitOptions.RemoveEmptyEntries)
                    Dim parsed As Double
                    If Double.TryParse(token.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, parsed) Then
                        points.Add(parsed)
                    End If
                Next
                If points.Count > 0 Then sets.Add(points.ToArray())
            Next
            Return sets.ToArray()
        End Function
    End Class

    ''' <summary>Reads Values="4,9,6,12" from XAML into a Double array.</summary>
    Public Class DoubleArrayConverter
        Inherits TypeConverter

        Public Overrides Function CanConvertFrom(context As ITypeDescriptorContext, sourceType As Type) As Boolean
            Return sourceType Is GetType(String) OrElse MyBase.CanConvertFrom(context, sourceType)
        End Function

        Public Overrides Function ConvertFrom(context As ITypeDescriptorContext, culture As CultureInfo, value As Object) As Object
            Dim text = TryCast(value, String)
            If text Is Nothing Then Return MyBase.ConvertFrom(context, culture, value)
            Dim list As New List(Of Double)()
            For Each token In text.Split(New Char() {","c, ";"c, " "c, ControlChars.Tab, ControlChars.Cr, ControlChars.Lf}, StringSplitOptions.RemoveEmptyEntries)
                Dim parsed As Double = 0
                If Double.TryParse(token.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, parsed) Then
                    list.Add(parsed)
                End If
            Next
            Return list.ToArray()
        End Function
    End Class

    ''' <summary>Reads Points="0,0 1,4 2,9" (x,y pairs) from XAML into a 2-D (n,2) array.</summary>
    Public Class DoubleMatrixConverter
        Inherits TypeConverter

        Public Overrides Function CanConvertFrom(context As ITypeDescriptorContext, sourceType As Type) As Boolean
            Return sourceType Is GetType(String) OrElse MyBase.CanConvertFrom(context, sourceType)
        End Function

        Public Overrides Function ConvertFrom(context As ITypeDescriptorContext, culture As CultureInfo, value As Object) As Object
            Dim text = TryCast(value, String)
            If text Is Nothing Then Return MyBase.ConvertFrom(context, culture, value)
            ' Each whitespace-separated group is one "x,y" pair; a semicolon also separates pairs.
            Dim pairs As New List(Of Double())
            For Each group In text.Split(New Char() {";"c, " "c, ControlChars.Tab, ControlChars.Cr, ControlChars.Lf}, StringSplitOptions.RemoveEmptyEntries)
                Dim xy = group.Split(New Char() {","c}, StringSplitOptions.RemoveEmptyEntries)
                If xy.Length <> 2 Then Continue For
                Dim x As Double = 0
                Dim y As Double = 0
                If Double.TryParse(xy(0).Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, x) AndAlso
                   Double.TryParse(xy(1).Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, y) Then
                    pairs.Add(New Double() {x, y})
                End If
            Next
            Dim result(pairs.Count - 1, 1) As Double
            For i = 0 To pairs.Count - 1
                result(i, 0) = pairs(i)(0)
                result(i, 1) = pairs(i)(1)
            Next
            Return result
        End Function
    End Class

    ''' <summary>Reads Labels="Jan,Feb,Mar" from XAML into a String array.</summary>
    Public NotInheritable Class StringArrayConverter
        Inherits TypeConverter

        Public Overrides Function CanConvertFrom(context As ITypeDescriptorContext, sourceType As Type) As Boolean
            Return sourceType Is GetType(String) OrElse MyBase.CanConvertFrom(context, sourceType)
        End Function

        Public Overrides Function ConvertFrom(context As ITypeDescriptorContext, culture As CultureInfo, value As Object) As Object
            Dim text = TryCast(value, String)
            If text Is Nothing Then Return MyBase.ConvertFrom(context, culture, value)
            Return text.Split(","c).Select(Function(part) part.Trim()).ToArray()
        End Function
    End Class

    ''' <summary>The series styling shared by LineSeries and XYSeries.</summary>
    Public MustInherit Class ChartSeries
        ''' <summary>The name shown for this series in the Series Editor (charts draw no legend yet).</summary>
        Public Property Title As String = Nothing

        ''' <summary>The spreadsheet column holding this series' X values (empty = the chart's, and a
        ''' line series always uses the sample index instead).</summary>
        Public Property XColumn As String = Nothing

        ''' <summary>The spreadsheet column holding this series' Y values (empty = the chart's).</summary>
        Public Property YColumn As String = Nothing

        ''' <summary>Common (the chart's shared axis) or PerSeries (own columns and scale).</summary>
        ''' <remarks>Fully qualified: the type is named exactly like the property.</remarks>
        Public Property AxisMode As AvaloniaCharts.AxisMode = AvaloniaCharts.AxisMode.Common

        ''' <summary>Colour of this series' line and markers.</summary>
        Public Property LineColor As Color = Color.Parse("#2D7DD2")

        ''' <summary>Thickness of this series' line.</summary>
        Public Property LineThickness As Double = 2.0

        ''' <summary>Solid, dashed, dotted or dash-dot.</summary>
        Public Property LineStyle As AvaloniaCharts.ChartLineStyle = AvaloniaCharts.ChartLineStyle.Solid

        ''' <summary>The symbol drawn at each point: None, Dot, Cross, Square or Diamond.</summary>
        Public Property MarkerStyle As AvaloniaCharts.ChartMarkerStyle = AvaloniaCharts.ChartMarkerStyle.Dot

        ''' <summary>Marker diameter in pixels.</summary>
        Public Property MarkerSize As Double = 8.0

        ''' <summary>Join the points with a line (False = markers only).</summary>
        Public Property Connected As Boolean = True

        ''' <summary>Draw this series at all. Off = its trace is switched off (the legend's tick box).
        ''' The series keeps its place in the chart's scale, so toggling a trace does not move the axes.</summary>
        Public Property Visible As Boolean = True

        ''' <summary>This series' own X axis (only used with AxisMode = PerSeries).</summary>
        Public Property XAxis As Axis = Nothing

        ''' <summary>This series' own Y axis (only used with AxisMode = PerSeries).</summary>
        Public Property YAxis As Axis = Nothing

        ''' <summary>True for a line series: X is the sample index, so only the Y column is read.</summary>
        Friend MustOverride ReadOnly Property XFromIndex As Boolean

        ''' <summary>True when this series is plotted against its own scale.</summary>
        Friend ReadOnly Property PerSeries As Boolean
            Get
                Return AxisMode = AvaloniaCharts.AxisMode.PerSeries
            End Get
        End Property
    End Class

    ''' <summary>A LINE SERIES: Y values in sample order, with X running 0…N-1.</summary>
    Public Class LineSeries
        Inherits ChartSeries

        Friend Overrides ReadOnly Property XFromIndex As Boolean
            Get
                Return True
            End Get
        End Property
    End Class

    ''' <summary>An X,Y SERIES: (x,y) pairs, drawn as a line, as markers, or both.</summary>
    Public Class XYSeries
        Inherits ChartSeries

        Friend Overrides ReadOnly Property XFromIndex As Boolean
            Get
                Return False
            End Get
        End Property
    End Class

    ''' <summary>
    ''' One axis of a series: where it sits, whether it is drawn, its colour, which of its parts are
    ''' shown, and its name. A Y axis uses Left/Right; an X axis uses Top/Bottom.
    ''' </summary>
    Public NotInheritable Class Axis
        ''' <summary>Left/Right for a Y axis, Top/Bottom for an X axis.</summary>
        Public Property Position As AvaloniaCharts.AxisPosition = AvaloniaCharts.AxisPosition.Left

        ''' <summary>Draw this axis at all.</summary>
        Public Property ShowAxis As Boolean = True

        ''' <summary>Colour of the axis line and its ticks. The tick labels and the name follow it unless
        ''' their own colours are set.</summary>
        Public Property AxisColor As Color = Color.Parse("#666666")

        ''' <summary>Colour of this axis' tick labels. Nothing = follow AxisColor, which is what every
        ''' form written before this existed means.</summary>
        Public Property TickLabelColor As Color?

        ''' <summary>Colour of this axis' name. Nothing = follow AxisColor.</summary>
        Public Property NameColor As Color?

        ''' <summary>The colour the tick labels are drawn in: their own, else the axis colour.</summary>
        Public ReadOnly Property LabelColor As Color
            Get
                Return If(TickLabelColor.HasValue, TickLabelColor.Value, AxisColor)
            End Get
        End Property

        ''' <summary>The colour the axis name is drawn in: its own, else the axis colour.</summary>
        Public ReadOnly Property AxisNameColor As Color
            Get
                Return If(NameColor.HasValue, NameColor.Value, AxisColor)
            End Get
        End Property

        ''' <summary>Draw the ticks at the labelled values.</summary>
        Public Property ShowMajorTicks As Boolean = True

        ''' <summary>Draw the short ticks between the labelled values.</summary>
        Public Property ShowMinorTicks As Boolean = True

        ''' <summary>Length of the ticks at the labelled values, in pixels.</summary>
        Public Property MajorTickLength As Double = 6

        ''' <summary>Length of the short ticks between them, in pixels.</summary>
        Public Property MinorTickLength As Double = 3

        ''' <summary>Draw the numbers along this axis.</summary>
        Public Property ShowTickLabels As Boolean = True

        ''' <summary>Font size of this axis' tick labels and its name.</summary>
        Public Property TickLabelFontSize As Double = 11

        ''' <summary>Draw this axis' name (from Name, or the spreadsheet's column header).</summary>
        Public Property ShowAxisName As Boolean = True

        ''' <summary>The axis name. Empty = use the spreadsheet's column header.</summary>
        Public Property Name As String = Nothing

        ''' <summary>A copy of this axis, for the renderer's per-series use.</summary>
        Friend Function Clone() As Axis
            Return New Axis With {
                .Position = Position,
                .ShowAxis = ShowAxis,
                .AxisColor = AxisColor,
                .TickLabelColor = TickLabelColor,
                .NameColor = NameColor,
                .ShowMajorTicks = ShowMajorTicks,
                .MajorTickLength = MajorTickLength,
                .ShowMinorTicks = ShowMinorTicks,
                .MinorTickLength = MinorTickLength,
                .ShowTickLabels = ShowTickLabels,
                .TickLabelFontSize = TickLabelFontSize,
                .ShowAxisName = ShowAxisName,
                .Name = Name
            }
        End Function
    End Class

    ''' <summary>
    ''' One cursor of a chart: a crosshair the user can drag, with a readout of the selected trace's
    ''' values where it crosses. Up to two cursors are drawn (see Cursors on the chart); the Cursor
    ''' Editor adds and removes them and sets these properties.
    ''' A cursor carries BOTH an X and a Y position even when only one line is drawn, so a Horizontal
    ''' cursor still reports a meaningful X. Both are in DATA units (not pixels), so a cursor stays on
    ''' the same value when the chart is resized or the data changes. Double.NaN means "not placed
    ''' yet" — the renderer puts it in the middle of the axis.
    ''' </summary>
    Public NotInheritable Class ChartCursor
        ''' <summary>Which lines are drawn: Both (the crosshair), Vertical or Horizontal.</summary>
        Public Property Orientation As CursorOrientation = CursorOrientation.Both

        ''' <summary>The dash pattern of this cursor's lines.</summary>
        Public Property Style As CursorStyle = CursorStyle.Dash

        ''' <summary>Colour of this cursor's lines, its handle and the heading of its readout.</summary>
        Public Property Color As Color = Colors.DarkOrange

        ''' <summary>Show the cursor's X value in the readout.</summary>
        Public Property XValues As Boolean = True

        ''' <summary>Show the selected trace's Y value (interpolated at the cursor) in the readout.</summary>
        Public Property YValues As Boolean = True

        ''' <summary>The cursor's X position in data units. NaN = the middle of the X range.</summary>
        Public Property X As Double = Double.NaN

        ''' <summary>The cursor's Y position in data units. NaN = the middle of the Y range. Ignored while
        ''' FollowTrace is on, because the crossing's Y then comes from the trace.</summary>
        Public Property Y As Double = Double.NaN

        ''' <summary>
        ''' Follow the selected trace (on by default): the crossing point — the handle, the horizontal
        ''' line and the value in the readout — sits ON that series at the cursor's X, interpolated
        ''' between samples, instead of at the cursor's own Y. Dragging the horizontal line then slides
        ''' the point along the trace. Switch it off for a free crosshair whose Y is yours to place,
        ''' which is what a threshold line wants to be.
        ''' </summary>
        Public Property FollowTrace As Boolean = True

        ''' <summary>
        ''' Whether the cursor is switched on. The right-click menu switches cursors on and off while
        ''' the app runs: that is a RUNTIME state, so it is not written back to the form (a fresh start
        ''' shows every cursor in the XAML as on).
        ''' </summary>
        Public Property Enabled As Boolean = True
    End Class

    ''' <summary>One series of points, plus the axis names and any reason there is no data.</summary>
    Public NotInheritable Class ChartData
        ''' <summary>The X values (for a line series these are the sample indices 0,1,2…).</summary>
        Public Property Xs As Double() = Array.Empty(Of Double)()

        ''' <summary>The Y values.</summary>
        Public Property Ys As Double() = Array.Empty(Of Double)()

        ''' <summary>The NAME of each point, from the spreadsheet's X column (a bar or area chart labels
        ''' its categories with these; a pie reads its slice names here). Empty when the X cells hold
        ''' numbers, or when there is no workbook.</summary>
        Public Property Labels As String() = Array.Empty(Of String)()

        ''' <summary>The X axis name (the spreadsheet's X-column header).</summary>
        Public Property XTitle As String = String.Empty

        ''' <summary>The Y axis name (the spreadsheet's Y-column header).</summary>
        Public Property YTitle As String = String.Empty

        ''' <summary>Why this series has nothing to draw, or Nothing when it is fine.</summary>
        Public Property [Error] As String = Nothing

        ''' <summary>True when the series carries at least one point.</summary>
        Public ReadOnly Property HasData As Boolean
            Get
                Return Xs.Length > 0 AndAlso Xs.Length = Ys.Length
            End Get
        End Property
    End Class

    ''' <summary>
    ''' Reads a two-column series out of an .xlsx workbook. Plain ZIP + XML: an .xlsx is a zip of XML
    ''' parts, so this needs no package and no interop.
    ''' </summary>
    Friend NotInheritable Class SpreadsheetReader

        ''' <summary>Column letter(s) to a zero-based index ("A" = 0, "B" = 1, "AA" = 26).</summary>
        Friend Shared Function ColumnIndex(column As String) As Integer
            Dim index As Integer = 0
            For Each ch In column.Trim().ToUpperInvariant()
                If ch < "A"c OrElse ch > "Z"c Then Continue For
                index = index * 26 + (AscW(ch) - AscW("A"c) + 1)
            Next
            Return index - 1
        End Function

        ''' <summary>The column letter(s) a few steps along ("A"+2 gives "C", "Z"+2 gives "AB").</summary>
        ''' <remarks>Not named 'step': that is a VB keyword (For … Step).</remarks>
        Friend Shared Function ColumnAfter(column As String, offset As Integer) As String
            Dim index = ColumnIndex(column) + offset
            If index < 0 Then index = 0
            Dim text = String.Empty
            Dim n = index + 1
            While n > 0
                text = ChrW(AscW("A"c) + (n - 1) Mod 26) & text
                n = (n - 1) \ 26
            End While
            Return text
        End Function

        ''' <summary>The column letters in a cell reference such as "BC12" (trailing digits dropped).</summary>
        Private Shared Function ColumnOf(cellRef As String) As String
            Dim [end] As Integer = 0
            While [end] < cellRef.Length AndAlso Char.IsLetter(cellRef([end]))
                [end] += 1
            End While
            Return cellRef.Substring(0, [end])
        End Function

        ''' <summary>
        ''' Reads one series. xFromIndex makes a line series: the X values are the sample indices and
        ''' only the Y column is read (falling back to the X column when the Y column is empty).
        ''' </summary>
        Friend Shared Function Read(path As String, xColumn As String, yColumn As String,
                                    headerRow As Integer, firstDataRow As Integer,
                                    xFromIndex As Boolean, Optional sheet As String = Nothing) As ChartData
            Dim data As New ChartData()
            Try
                Using zip = OpenWorkbook(path)
                    ' 'shared' is a VB keyword, hence sharedStrings.
                    Dim sharedStrings = ReadSharedStrings(zip)
                    Dim sheetPart = FindSheet(zip, sheet)
                    If sheetPart Is Nothing Then
                        data.Error = If(String.IsNullOrWhiteSpace(sheet),
                                        """" & System.IO.Path.GetFileName(path) & """ has no worksheet.",
                                        """" & System.IO.Path.GetFileName(path) & """ has no page called """ & sheet.Trim() & """.")
                        Return data
                    End If

                    Dim xi = ColumnIndex(xColumn)
                    Dim yi = ColumnIndex(yColumn)
                    Dim xs As New List(Of Double)()
                    Dim ys As New List(Of Double)()
                    Dim labels As New List(Of String)()
                    Dim xsFallback As New List(Of Double)()
                    Dim ysFallback As New List(Of Double)()
                    Dim xTitle = String.Empty
                    Dim yTitle = String.Empty

                    Using stream = sheetPart.Open()
                        For Each row In XDocument.Load(stream).Descendants().Where(Function(e) e.Name.LocalName = "row")
                            Dim rowNumber As Integer = -1
                            Dim rawRow = row.Attribute("r")
                            If rawRow IsNot Nothing Then
                                Integer.TryParse(rawRow.Value, NumberStyles.Integer, CultureInfo.InvariantCulture, rowNumber)
                            End If

                            Dim cells As New Dictionary(Of Integer, String)()
                            For Each cell In row.Elements().Where(Function(e) e.Name.LocalName = "c")
                                Dim cellRef = If(cell.Attribute("r")?.Value, String.Empty)
                                Dim index = ColumnIndex(ColumnOf(cellRef))
                                Dim text = CellText(cell, sharedStrings)
                                If index >= 0 AndAlso text IsNot Nothing Then cells(index) = text
                            Next

                            Dim xText As String = Nothing
                            Dim yText As String = Nothing
                            cells.TryGetValue(xi, xText)
                            cells.TryGetValue(yi, yText)

                            If rowNumber = headerRow Then
                                If xText IsNot Nothing Then xTitle = xText
                                If yText IsNot Nothing Then yTitle = yText
                                Continue For
                            End If
                            If firstDataRow > 0 AndAlso rowNumber > 0 AndAlso rowNumber < firstDataRow Then Continue For

                            Dim xVal As Double = 0
                            Dim yVal As Double = 0
                            Dim hasX = TryNumber(xText, xVal)
                            Dim hasY = TryNumber(yText, yVal)

                            If xFromIndex Then
                                ' A line series only needs one column. Prefer the Y column; if the sheet
                                ' has the values in the X column instead, take those rather than drawing
                                ' nothing. The X cell is read either way: when it holds TEXT it is this
                                ' point's NAME (a bar chart's category, an area chart's tick label), and
                                ' when it holds a number the index is still the X — which is what lets a
                                ' categorical sheet drive a bar chart.
                                If hasY Then
                                    xs.Add(ys.Count)
                                    ys.Add(yVal)
                                    labels.Add(If(xText, String.Empty))
                                ElseIf hasX Then
                                    xsFallback.Add(ysFallback.Count)
                                    ysFallback.Add(xVal)
                                End If
                            ElseIf hasX AndAlso hasY Then
                                xs.Add(xVal)
                                ys.Add(yVal)
                                labels.Add(If(xText, String.Empty))
                            End If
                        Next
                    End Using

                    If xFromIndex AndAlso ys.Count = 0 AndAlso ysFallback.Count > 0 Then
                        xs = xsFallback
                        ys = ysFallback
                    End If

                    data.Xs = xs.ToArray()
                    data.Ys = ys.ToArray()
                    data.Labels = labels.ToArray()
                    data.XTitle = xTitle
                    data.YTitle = yTitle
                    If data.Ys.Length = 0 Then
                        Dim columns = If(xFromIndex, yColumn, xColumn & "/" & yColumn)
                        data.Error = "No numbers found in column " & columns & " of """ & System.IO.Path.GetFileName(path) &
                                     """ from row " & firstDataRow.ToString(CultureInfo.InvariantCulture) & "."
                    End If
                End Using
            Catch ex As Exception
                data.Error = ReadFailure(path, ex)
            End Try
            Return data
        End Function

        ''' <summary>
        ''' One row's NUMERIC cells, keyed by column letter ("C" gives 12.5) — how a surface chart reads the Z
        ''' value a spreadsheet gives each of its slices: the series' own column, one row. A cell that is empty
        ''' or holds text is simply absent from the result, so the caller falls back to its own numbering.
        ''' </summary>
        Friend Shared Function RowNumbers(path As String, row As Integer, Optional sheet As String = Nothing) As Dictionary(Of String, Double)
            Dim values As New Dictionary(Of String, Double)(StringComparer.OrdinalIgnoreCase)
            If row <= 0 Then Return values
            Try
                Using zip = OpenWorkbook(path)
                    Dim sharedStrings = ReadSharedStrings(zip)
                    Dim sheetPart = FindSheet(zip, sheet)
                    If sheetPart Is Nothing Then Return values
                    Using stream = sheetPart.Open()
                        For Each rowElement In XDocument.Load(stream).Descendants().Where(Function(e) e.Name.LocalName = "row")
                            Dim number = -1
                            If Integer.TryParse(rowElement.Attribute("r")?.Value, NumberStyles.Integer,
                                                CultureInfo.InvariantCulture, number) Then number = number Else number = -1
                            If number <> row Then Continue For
                            For Each cell In rowElement.Elements().Where(Function(e) e.Name.LocalName = "c")
                                Dim reference = If(cell.Attribute("r")?.Value, String.Empty)
                                Dim value As Double = Nothing
                                If TryNumber(CellText(cell, sharedStrings), value) Then values(ColumnOf(reference)) = value
                            Next
                            Exit For
                        Next
                    End Using
                End Using
            Catch ex As Exception
                ' A Z row that cannot be read is not an error: the chart numbers the slices itself.
            End Try
            Return values
        End Function

        ''' <summary>
        ''' Reads a workbook as LABEL + VALUE pairs, which is what a pie needs: the value column must
        ''' hold numbers, the label column may hold anything, and a row whose label cell is empty falls
        ''' back to the cell's own address. Unlike Read this KEEPS a row whose label is text — that is
        ''' the whole point of reading a pie's categories — and X is the row's position, not a number.
        ''' </summary>
        Friend Shared Function ReadLabels(path As String, labelColumn As String, valueColumn As String,
                                          headerRow As Integer, firstDataRow As Integer,
                                          Optional sheet As String = Nothing) As ChartData
            Dim data As New ChartData()
            Try
                Using zip = OpenWorkbook(path)
                    Dim sharedStrings = ReadSharedStrings(zip)
                    Dim sheetPart = FindSheet(zip, sheet)
                    If sheetPart Is Nothing Then
                        data.Error = If(String.IsNullOrWhiteSpace(sheet),
                                        """" & System.IO.Path.GetFileName(path) & """ has no worksheet.",
                                        """" & System.IO.Path.GetFileName(path) & """ has no page called """ & sheet.Trim() & """.")
                        Return data
                    End If

                    Dim li = ColumnIndex(labelColumn)
                    Dim vi = ColumnIndex(valueColumn)
                    Dim xs As New List(Of Double)()
                    Dim ys As New List(Of Double)()
                    Dim labels As New List(Of String)()
                    Dim labelTitle = String.Empty
                    Dim valueTitle = String.Empty

                    Using stream = sheetPart.Open()
                        For Each row In XDocument.Load(stream).Descendants().Where(Function(e) e.Name.LocalName = "row")
                            Dim rowNumber As Integer = -1
                            Dim rawRow = row.Attribute("r")
                            If rawRow IsNot Nothing Then
                                Integer.TryParse(rawRow.Value, NumberStyles.Integer, CultureInfo.InvariantCulture, rowNumber)
                            End If

                            Dim cells As New Dictionary(Of Integer, String)()
                            For Each cell In row.Elements().Where(Function(e) e.Name.LocalName = "c")
                                Dim cellRef = If(cell.Attribute("r")?.Value, String.Empty)
                                Dim index = ColumnIndex(ColumnOf(cellRef))
                                Dim text = CellText(cell, sharedStrings)
                                If index >= 0 AndAlso text IsNot Nothing Then cells(index) = text
                            Next

                            If rowNumber = headerRow Then
                                Dim labelHeader As String = Nothing
                                Dim valueHeader As String = Nothing
                                If cells.TryGetValue(li, labelHeader) Then labelTitle = labelHeader
                                If cells.TryGetValue(vi, valueHeader) Then valueTitle = valueHeader
                                Continue For
                            End If
                            If firstDataRow > 0 AndAlso rowNumber > 0 AndAlso rowNumber < firstDataRow Then Continue For

                            Dim valueText As String = Nothing
                            Dim value As Double = 0
                            cells.TryGetValue(vi, valueText)
                            If Not TryNumber(valueText, value) Then Continue For   ' a slice needs a number
                            Dim labelText As String = Nothing
                            cells.TryGetValue(li, labelText)
                            labels.Add(If(String.IsNullOrWhiteSpace(labelText), labelColumn & rowNumber.ToString(CultureInfo.InvariantCulture), labelText.Trim()))
                            xs.Add(ys.Count)
                            ys.Add(value)
                        Next
                    End Using

                    data.Xs = xs.ToArray()
                    data.Ys = ys.ToArray()
                    data.Labels = labels.ToArray()
                    data.XTitle = labelTitle
                    data.YTitle = valueTitle
                    If data.Ys.Length = 0 Then
                        data.Error = "No numbers found in column " & valueColumn & " of """ &
                                     System.IO.Path.GetFileName(path) & """ from row " &
                                     firstDataRow.ToString(CultureInfo.InvariantCulture) & "."
                    End If
                End Using
            Catch ex As Exception
                data.Error = ReadFailure(path, ex)
            End Try
            Return data
        End Function

        ''' <summary>
        ''' Opens a workbook so that a chart can read a sheet that is OPEN IN ANOTHER PROGRAM. On Windows
        ''' (tested on 11) Excel holds its workbook with a share mode that refuses FileShare.Read —
        ''' which is exactly what ZipFile.OpenRead asks for — so a chart bound to a sheet being edited
        ''' showed "Cannot read …: the process cannot access the file" and drew nothing. Asking for
        ''' FileShare.ReadWrite is the permission Excel's own handle needs, and allowing Delete covers
        ''' the moment Excel saves by writing a temporary file and renaming it over the original (which
        ''' briefly locks the path). Linux does not behave this way, so neither of those ever showed up
        ''' in testing on that platform.
        ''' The short retry is for that same save moment: the file is replaced within milliseconds, and a
        ''' chart that re-reads on every save (Live Update) should not flash an error for it.
        ''' </summary>
        Friend Shared Function OpenWorkbook(path As String) As ZipArchive
            Const attempts As Integer = 4
            Dim attempt As Integer = 1
            Do
                Try
                    Dim stream As New FileStream(path, FileMode.Open, FileAccess.Read,
                                                 FileShare.ReadWrite Or FileShare.Delete)
                    Return New ZipArchive(stream, ZipArchiveMode.Read)
                Catch ex As IOException When attempt < attempts
                    ' Usually "being used by another process": wait a moment and try again.
                    Threading.Thread.Sleep(120)
                    attempt += 1
                End Try
            Loop
        End Function

        ''' <summary>True when the failure means "another program has the file open", which is worth a
        ''' different sentence from "the file is missing" or "the file is corrupt".</summary>
        Friend Shared Function IsFileInUse(ex As Exception) As Boolean
            If Not TypeOf ex Is IOException Then Return False
            ' ERROR_SHARING_VIOLATION (32) / ERROR_LOCK_VIOLATION (33). Parenthesised: Visual Basic
            ' reads an unparenthesised "Return a = b" as an assignment and loses the rest of the
            ' function — the whole file then fails to parse, with the errors blamed on later lines.
            Dim code = ex.HResult And &HFFFF
            Return (code = 32 OrElse code = 33)
        End Function

        ''' <summary>The chart's own words for a workbook it could not read.</summary>
        Private Shared Function ReadFailure(path As String, ex As Exception) As String
            Dim name = System.IO.Path.GetFileName(path)
            If IsFileInUse(ex) Then
                Return """" & name & """ is open in another program — close the workbook in Excel (or " &
                       "save it again) and this chart reloads by itself."
            End If
            If TypeOf ex Is FileNotFoundException OrElse TypeOf ex Is DirectoryNotFoundException Then
                Return """" & name & """ was not found — check the Spreadsheet path."
            End If
            Return "Cannot read """ & name & """: " & ex.Message
        End Function

        ''' <summary>
        ''' The worksheet to read: 'sheet' names one (matched case-insensitively against the workbook's
        ''' own sheet names, whatever order Excel keeps its parts in), and an empty name gives the first
        ''' worksheet part — the behaviour every form written before SourceSheet had.
        ''' </summary>
        Private Shared Function FindSheet(zip As ZipArchive, Optional sheet As String = Nothing) As ZipArchiveEntry
            If Not String.IsNullOrWhiteSpace(sheet) Then
                Dim target = SheetTarget(zip, sheet.Trim())
                If target IsNot Nothing Then
                    For Each entry In zip.Entries
                        If entry.FullName.Equals(target, StringComparison.OrdinalIgnoreCase) Then Return entry
                    Next
                End If
                ' A named page that is not there is an error, not "read page one instead".
                Return Nothing
            End If
            Return zip.Entries _
                .Where(Function(e) e.FullName.StartsWith("xl/worksheets/sheet", StringComparison.OrdinalIgnoreCase) _
                                 AndAlso e.FullName.EndsWith(".xml", StringComparison.OrdinalIgnoreCase)) _
                .OrderBy(Function(e) e.FullName, StringComparer.OrdinalIgnoreCase) _
                .FirstOrDefault()
        End Function

        ''' <summary>
        ''' The zip path of the worksheet called 'sheet', resolved the way Excel means it: xl/workbook.xml
        ''' lists the sheets in the order the tabs show, each pointing at a relationship
        ''' (xl/_rels/workbook.xml.rels) that names the part. Part NAMES carry no meaning — Excel may keep
        ''' sheet1.xml for any tab — which is why a named page is looked up through the rels rather than
        ''' by guessing from the file name. Nothing when there is no such sheet.
        ''' </summary>
        Private Shared Function SheetTarget(zip As ZipArchive, sheet As String) As String
            Dim workbook As ZipArchiveEntry = Nothing
            Dim rels As ZipArchiveEntry = Nothing
            For Each entry In zip.Entries
                If entry.FullName.Equals("xl/workbook.xml", StringComparison.OrdinalIgnoreCase) Then workbook = entry
                If entry.FullName.Equals("xl/_rels/workbook.xml.rels", StringComparison.OrdinalIgnoreCase) Then rels = entry
            Next
            If workbook Is Nothing OrElse rels Is Nothing Then Return Nothing

            Dim id = String.Empty
            Using stream = workbook.Open()
                For Each element In XDocument.Load(stream).Descendants().Where(Function(e) e.Name.LocalName = "sheet")
                    Dim name = element.Attribute("name")
                    If name Is Nothing OrElse Not String.Equals(name.Value.Trim(), sheet, StringComparison.OrdinalIgnoreCase) Then Continue For
                    Dim idAttr = element.Attributes().FirstOrDefault(Function(a) a.Name.LocalName = "id")
                    If idAttr IsNot Nothing Then id = idAttr.Value
                    Exit For
                Next
            End Using
            If id.Length = 0 Then Return Nothing

            Dim relTarget As String = Nothing
            Using stream = rels.Open()
                For Each element In XDocument.Load(stream).Descendants().Where(Function(e) e.Name.LocalName = "Relationship")
                    Dim idAttr = element.Attribute("Id")
                    If idAttr Is Nothing OrElse Not String.Equals(idAttr.Value, id, StringComparison.Ordinal) Then Continue For
                    Dim targetAttr = element.Attribute("Target")
                    If targetAttr IsNot Nothing Then relTarget = targetAttr.Value
                    Exit For
                Next
            End Using
            If String.IsNullOrWhiteSpace(relTarget) Then Return Nothing

            ' Targets are relative to xl/ ("worksheets/sheet2.xml", sometimes with a leading "/" or a
            ' "../"): normalize both spellings into a zip path.
            Dim target = relTarget.Replace("\"c, "/"c).Trim()
            If target.StartsWith("/", StringComparison.Ordinal) Then
                target = target.TrimStart("/"c)
            Else
                target = "xl/" & target
            End If
            While target.Contains("../", StringComparison.Ordinal)
                Dim at = target.IndexOf("../", StringComparison.Ordinal)
                Dim cut = target.LastIndexOf("/"c, Math.Max(0, at - 1))
                target = If(cut <= 0, target.Substring(at + 3), target.Substring(0, cut + 1) & target.Substring(at + 3))
            End While
            Return target
        End Function

        ''' <summary>The workbook's shared string table (xl/sharedStrings.xml), if it has one.</summary>
        Private Shared Function ReadSharedStrings(zip As ZipArchive) As List(Of String)
            Dim list As New List(Of String)()
            Dim entry = zip.Entries.FirstOrDefault(Function(e) e.FullName.Equals("xl/sharedStrings.xml", StringComparison.OrdinalIgnoreCase))
            If entry Is Nothing Then Return list
            Try
                Using stream = entry.Open()
                    For Each si In XDocument.Load(stream).Descendants().Where(Function(e) e.Name.LocalName = "si")
                        list.Add(String.Concat(si.Descendants().Where(Function(e) e.Name.LocalName = "t").Select(Function(e) e.Value)))
                    Next
                End Using
            Catch
                ' A broken string table just means cells read as their raw values.
            End Try
            Return list
        End Function

        ''' <summary>One cell's text: a shared string, an inline string, or the raw value.</summary>
        Private Shared Function CellText(cell As XElement, sharedStrings As List(Of String)) As String
            Dim kind = If(cell.Attribute("t")?.Value, String.Empty)
            If kind = "inlineStr" Then
                Return String.Concat(cell.Descendants().Where(Function(e) e.Name.LocalName = "t").Select(Function(e) e.Value))
            End If
            Dim valueElement = cell.Elements().FirstOrDefault(Function(e) e.Name.LocalName = "v")
            If valueElement Is Nothing Then Return Nothing
            Dim value = valueElement.Value
            If kind = "s" Then
                Dim si As Integer = -1
                If Integer.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, si) AndAlso
                   si >= 0 AndAlso si < sharedStrings.Count Then
                    Return sharedStrings(si)
                End If
            End If
            Return value
        End Function

        ''' <summary>A cell as a number: invariant first, then the current culture (a comma decimal).</summary>
        Private Shared Function TryNumber(text As String, ByRef value As Double) As Boolean
            If String.IsNullOrWhiteSpace(text) Then
                value = 0
                Return False
            End If
            Return Double.TryParse(text.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, value) OrElse
                   Double.TryParse(text.Trim(), NumberStyles.Float, CultureInfo.CurrentCulture, value)
        End Function
    End Class

    ''' <summary>One series ready to draw: data, styling, scale and (for PerSeries) its own axes.</summary>
    Friend NotInheritable Class Plot
        Friend Data As New ChartData()
        Friend Definition As ChartSeries = Nothing
        Friend LineColor As Color = Color.Parse("#2D7DD2")
        Friend LineThickness As Double = 2.0
        Friend LineStyle As AvaloniaCharts.ChartLineStyle = AvaloniaCharts.ChartLineStyle.Solid
        Friend MarkerStyle As AvaloniaCharts.ChartMarkerStyle = AvaloniaCharts.ChartMarkerStyle.Dot
        Friend MarkerSize As Double = 8.0
        Friend Connected As Boolean = True
        Friend Visible As Boolean = True
        Friend PerSeries As Boolean = False
        Friend XAxis As Axis = Nothing
        Friend YAxis As Axis = Nothing
        Friend XRange As New AxisRange()
        Friend YRange As New AxisRange()
    End Class

    ''' <summary>
    ''' The shared base for GrumpyLinePlot and GrumpyXYPlot: the frame, plot background, gridlines, the
    ''' common axis with its ticks and labels, the chart title, the series collection, the spreadsheet
    ''' reader and the live-update watcher.
    ''' </summary>
    Public MustInherit Class ChartBase
        Inherits Control

        ''' <summary>
        ''' The chart takes the keyboard so its cursors can be driven without a mouse: ←/→ move the
        ''' selected cursor by one sample, ↑/↓ pick the trace the readout reports. Those keys are only
        ''' swallowed while at least one cursor is switched on, so a chart without cursors stays out of
        ''' the way of the window around it.
        ''' </summary>
        Protected Sub New()
            Focusable = True
            AddHandler Cursors.CollectionChanged, Sub(sender As Object, e As Specialized.NotifyCollectionChangedEventArgs) InvalidateVisual()
        End Sub

        ' ---- frame ----------------------------------------------------------------------------
        Public Shared ReadOnly ShowBorderProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of ChartBase, Boolean)(NameOf(ShowBorder), True)

        Public Shared ReadOnly BorderBrushProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of ChartBase, Color)(NameOf(BorderBrush), Color.Parse("#C8C8C8"))

        Public Shared ReadOnly BorderThicknessProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(BorderThickness), 1.0)

        ''' <summary>Space between the border and everything the chart draws inside it — the title, the
        ''' legend bar and the plot area with the axis furniture around it — in pixels, on all four sides
        ''' (one, two or four values, like every other Padding). Default 0 keeps the 8 px gap the chart has
        ''' always had between its border and the plot.</summary>
        Public Shared ReadOnly PaddingProperty As StyledProperty(Of Thickness) =
            AvaloniaProperty.Register(Of ChartBase, Thickness)(NameOf(Padding), New Thickness(0))

        ' Fully qualified: the type is named exactly like the property.
        Public Shared ReadOnly CornerRadiusProperty As StyledProperty(Of Avalonia.CornerRadius) =
            AvaloniaProperty.Register(Of ChartBase, Avalonia.CornerRadius)(NameOf(CornerRadius), New Avalonia.CornerRadius(4))

        ' ---- plot area ------------------------------------------------------------------------
        Public Shared ReadOnly PlotBackColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of ChartBase, Color)(NameOf(PlotBackColor), Colors.White)

        Public Shared ReadOnly PlotBackOpacityProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(PlotBackOpacity), 100.0)

        ''' <summary>An optional background BRUSH for the whole chart - a real Avalonia gradient
        ''' (LinearGradientBrush, RadialGradientBrush or ConicGradientBrush), written in XAML as a property
        ''' element: &lt;charts:GrumpyXYPlot.PlotBackBrush&gt;… . When it is set it is painted over the same
        ''' area (the whole control) and REPLACES PlotBackColor and its opacity, which stay the fallback for
        ''' a chart without a brush.</summary>
        Public Shared ReadOnly PlotBackBrushProperty As StyledProperty(Of Brush) =
            AvaloniaProperty.Register(Of ChartBase, Brush)(NameOf(PlotBackBrush), Nothing)

        ' ---- gridlines ------------------------------------------------------------------------
        Public Shared ReadOnly ShowGridProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of ChartBase, Boolean)(NameOf(ShowGrid), True)

        Public Shared ReadOnly GridColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of ChartBase, Color)(NameOf(GridColor), Color.Parse("#E8E8E8"))

        Public Shared ReadOnly GridThicknessProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(GridThickness), 1.0)

        Public Shared ReadOnly GridStyleProperty As StyledProperty(Of AvaloniaCharts.ChartLineStyle) =
            AvaloniaProperty.Register(Of ChartBase, AvaloniaCharts.ChartLineStyle)(NameOf(GridStyle), AvaloniaCharts.ChartLineStyle.Solid)

        ' ---- the common axis ------------------------------------------------------------------
        Public Shared ReadOnly ShowAxesProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of ChartBase, Boolean)(NameOf(ShowAxes), True)

        Public Shared ReadOnly AxisColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of ChartBase, Color)(NameOf(AxisColor), Color.Parse("#666666"))

        Public Shared ReadOnly ShowMajorTicksProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of ChartBase, Boolean)(NameOf(ShowMajorTicks), True)

        Public Shared ReadOnly MajorTickLengthProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(MajorTickLength), 6.0)

        Public Shared ReadOnly ShowMinorTicksProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of ChartBase, Boolean)(NameOf(ShowMinorTicks), True)

        Public Shared ReadOnly MinorTickLengthProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(MinorTickLength), 3.0)

        Public Shared ReadOnly ShowTickLabelsProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of ChartBase, Boolean)(NameOf(ShowTickLabels), True)

        Public Shared ReadOnly TickLabelFontSizeProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(TickLabelFontSize), 11.0)

        Public Shared ReadOnly ShowAxisTitlesProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of ChartBase, Boolean)(NameOf(ShowAxisTitles), True)

        Public Shared ReadOnly XAxisTitleProperty As StyledProperty(Of String) =
            AvaloniaProperty.Register(Of ChartBase, String)(NameOf(XAxisTitle), String.Empty)

        Public Shared ReadOnly YAxisTitleProperty As StyledProperty(Of String) =
            AvaloniaProperty.Register(Of ChartBase, String)(NameOf(YAxisTitle), String.Empty)

        ' ---- title ----------------------------------------------------------------------------
        Public Shared ReadOnly ShowTitleProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of ChartBase, Boolean)(NameOf(ShowTitle), False)

        Public Shared ReadOnly TitleProperty As StyledProperty(Of String) =
            AvaloniaProperty.Register(Of ChartBase, String)(NameOf(Title), String.Empty)

        Public Shared ReadOnly TitleColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of ChartBase, Color)(NameOf(TitleColor), Color.Parse("#303030"))

        Public Shared ReadOnly TitlePositionProperty As StyledProperty(Of AvaloniaCharts.ChartTitlePosition) =
            AvaloniaProperty.Register(Of ChartBase, AvaloniaCharts.ChartTitlePosition)(NameOf(TitlePosition), AvaloniaCharts.ChartTitlePosition.Top)

        Public Shared ReadOnly TitleFontSizeProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(TitleFontSize), 14.0)

        ' ---- data source ----------------------------------------------------------------------
        Public Shared ReadOnly SourceFileProperty As StyledProperty(Of String) =
            AvaloniaProperty.Register(Of ChartBase, String)(NameOf(SourceFile), String.Empty)

        ''' <summary>Where the data comes from: Spreadsheet (the default, the workbook in SourceFile)
        ''' or DataFiles — a data file such as a CSV, which the Data Selector editor can already name in
        ''' DataFile and which the charts will read when that reader lands. Choosing DataFiles today
        ''' simply means the chart keeps drawing whatever SourceFile gives it.</summary>
        Public Shared ReadOnly SourceKindProperty As StyledProperty(Of DataSourceKind) =
            AvaloniaProperty.Register(Of ChartBase, DataSourceKind)(NameOf(SourceKind), DataSourceKind.Spreadsheet)

        ''' <summary>Which PAGE of the workbook to read, by its sheet name ("Bar Chart"). Empty — the
        ''' default — reads the first worksheet, which is what every form written before this property
        ''' existed does.</summary>
        Public Shared ReadOnly SourceSheetProperty As StyledProperty(Of String) =
            AvaloniaProperty.Register(Of ChartBase, String)(NameOf(SourceSheet), String.Empty)

        ''' <summary>The data FILE for the DataFiles source (a CSV today, other formats as they are
        ''' added). Declared so a form can carry the Data Selector's choice and still compile; nothing
        ''' reads it yet.</summary>
        Public Shared ReadOnly DataFileProperty As StyledProperty(Of String) =
            AvaloniaProperty.Register(Of ChartBase, String)(NameOf(DataFile), String.Empty)

        Public Shared ReadOnly LiveUpdateProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of ChartBase, Boolean)(NameOf(LiveUpdate), True)

        Public Shared ReadOnly XColumnProperty As StyledProperty(Of String) =
            AvaloniaProperty.Register(Of ChartBase, String)(NameOf(XColumn), "B")

        Public Shared ReadOnly YColumnProperty As StyledProperty(Of String) =
            AvaloniaProperty.Register(Of ChartBase, String)(NameOf(YColumn), "C")

        Public Shared ReadOnly HeaderRowProperty As StyledProperty(Of Integer) =
            AvaloniaProperty.Register(Of ChartBase, Integer)(NameOf(HeaderRow), 1)

        Public Shared ReadOnly FirstDataRowProperty As StyledProperty(Of Integer) =
            AvaloniaProperty.Register(Of ChartBase, Integer)(NameOf(FirstDataRow), 2)

        ''' <summary>Kept so forms written when the chart drew its own "…" button still compile - the button
        ''' is gone (it sits in the right-click menu now: "Choose spreadsheet…"), so this value changes
        ''' nothing at all.</summary>
        Public Shared ReadOnly ShowBrowseProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of ChartBase, Boolean)(NameOf(ShowBrowse), False)

        ' ---- legend -----------------------------------------------------------------------------
        ''' <summary>Draw the legend bar along the bottom of the chart: one entry per series, its name in
        ''' the series' own colour and a tick box that switches that trace on and off. A chart with no
        ''' series elements draws one unnamed line, so it has nothing to list and shows no legend.</summary>
        Public Shared ReadOnly ShowLegendProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of ChartBase, Boolean)(NameOf(ShowLegend), True)

        ''' <summary>Font size of the legend's series names.</summary>
        Public Shared ReadOnly LegendFontSizeProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(LegendFontSize), 12.0)

        ''' <summary>Where the legend bar sits. Top/Bottom span the chart's width; Left/Right fill a side.</summary>
        Public Shared ReadOnly LegendPositionProperty As StyledProperty(Of LegendPosition) =
            AvaloniaProperty.Register(Of ChartBase, LegendPosition)(NameOf(LegendPosition), AvaloniaCharts.LegendPosition.Bottom)

        ''' <summary>The legend frame's backcolour (Transparent = whatever is behind it shows through).</summary>
        Public Shared ReadOnly LegendBackColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of ChartBase, Color)(NameOf(LegendBackColor), Colors.Transparent)

        ''' <summary>Draw a frame around the legend bar.</summary>
        Public Shared ReadOnly LegendShowFrameProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of ChartBase, Boolean)(NameOf(LegendShowFrame), True)

        ''' <summary>Colour of the legend frame's outline.</summary>
        Public Shared ReadOnly LegendBorderBrushProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of ChartBase, Color)(NameOf(LegendBorderBrush), Color.Parse("#C8C8C8"))

        ''' <summary>Thickness of the legend frame's outline (0 = none).</summary>
        Public Shared ReadOnly LegendBorderThicknessProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(LegendBorderThickness), 1.0)

        ''' <summary>Corner rounding of the legend frame.</summary>
        Public Shared ReadOnly LegendCornerRadiusProperty As StyledProperty(Of Avalonia.CornerRadius) =
            AvaloniaProperty.Register(Of ChartBase, Avalonia.CornerRadius)(NameOf(LegendCornerRadius), New Avalonia.CornerRadius(4))

        ''' <summary>Breathing room between the legend frame and the entries inside it, in pixels, added on
        ''' all four sides (0 = the padding the bar has always had).</summary>
        Public Shared ReadOnly LegendMarginProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(LegendMargin), 0.0)

        ' ---- cursors --------------------------------------------------------------------------
        ''' <summary>Where the cursor readout is drawn: following the mouse pointer (the default) or in
        ''' the top right corner of the drawing area. Also switchable at runtime from the chart's
        ''' right-click menu. In the designer there is no mouse, so a following readout is drawn in
        ''' that corner.</summary>
        Public Shared ReadOnly ReadoutPositionProperty As StyledProperty(Of CursorReadout) =
            AvaloniaProperty.Register(Of ChartBase, CursorReadout)(NameOf(ReadoutPosition), CursorReadout.FollowMouse)

        ''' <summary>Decimals in the cursor readout: -1 (the default) fits the numbers, 0…6 fixes them.</summary>
        Public Shared ReadOnly CursorDecimalsProperty As StyledProperty(Of Integer) =
            AvaloniaProperty.Register(Of ChartBase, Integer)(NameOf(CursorDecimals), -1)

        ''' <summary>Where the cursor readout is drawn.</summary>
        Public Property ReadoutPosition As CursorReadout
            Get
                Return GetValue(ReadoutPositionProperty)
            End Get
            Set(value As CursorReadout)
                SetValue(ReadoutPositionProperty, value)
            End Set
        End Property

        ''' <summary>Decimals in the readout (0…6), or -1 to let it choose.</summary>
        Public Property CursorDecimals As Integer
            Get
                Return GetValue(CursorDecimalsProperty)
            End Get
            Set(value As Integer)
                SetValue(CursorDecimalsProperty, value)
            End Set
        End Property

        ''' <summary>
        ''' The chart's cursors — the crosshairs the user drags. Written as a property element, up to
        ''' two are drawn:
        ''' &lt;charts:GrumpyLinePlot.Cursors&gt;&lt;charts:ChartCursor …/&gt;&lt;/charts:GrumpyLinePlot.Cursors&gt;.
        ''' The Cursor Editor adds and removes them; the right-click menu switches them on and off while
        ''' the app runs.
        ''' </summary>
        Public ReadOnly Property Cursors As AvaloniaList(Of ChartCursor) = New AvaloniaList(Of ChartCursor)()

        ''' <summary>Adds a cursor in the middle of the plot (False when there are already two).</summary>
        Public Function AddCursor() As Boolean
            If Cursors.Count >= MaxCursors Then Return False
            Cursors.Add(New ChartCursor())
            _selectedCursor = Cursors.Count - 1
            InvalidateVisual()
            Return True
        End Function

        ''' <summary>Removes the selected cursor (False when there is none).</summary>
        Public Function RemoveCursor() As Boolean
            If Cursors.Count = 0 Then Return False
            Cursors.RemoveAt(Math.Clamp(_selectedCursor, 0, Cursors.Count - 1))
            _selectedCursor = Math.Clamp(_selectedCursor, 0, Math.Max(0, Cursors.Count - 1))
            InvalidateVisual()
            Return True
        End Function

        ''' <summary>Puts every cursor back in the middle of the axis.</summary>
        Public Sub ResetCursors()
            For Each one In Cursors
                one.X = Double.NaN
                one.Y = Double.NaN
            Next
            InvalidateVisual()
        End Sub

        ''' <summary>Moves one cursor to a data position (the values the readout reports).</summary>
        Public Sub MoveCursor(index As Integer, x As Double, y As Double)
            If index < 0 OrElse index >= Cursors.Count Then Return
            Cursors(index).X = x
            Cursors(index).Y = y
            _selectedCursor = index
            InvalidateVisual()
        End Sub

        ' ---- cursor runtime state -------------------------------------------------------------
        ''' <summary>How many cursors a chart draws: two, so they can be compared.</summary>
        Friend Const MaxCursors As Integer = 2

        ''' <summary>Where each enabled cursor ended up in the last Render, for hit-testing. Rebuilt on
        ''' every render, so a click always tests against what is actually on screen.</summary>
        Private ReadOnly _cursorHits As New List(Of CursorHit)()

        ''' <summary>The cursor the mouse and the arrow keys act on (the last one clicked).</summary>
        Private _selectedCursor As Integer

        ''' <summary>Which visible trace the readout reports; Up/Down walk the list.</summary>
        Private _selectedTrace As Integer

        ''' <summary>The last pointer position in control coordinates, and whether there has been one.</summary>
        Private _pointer As Point
        Private _hasPointer As Boolean

        ''' <summary>What a drag is moving: 1 = X only (the vertical line), 2 = Y only (the horizontal
        ''' line), 3 = both (the crosshair's middle).</summary>
        Private _dragMode As Integer

        ''' <summary>The cursor a drag is moving.</summary>
        Private _dragCursor As ChartCursor

        ''' <summary>The text of the readout as last drawn, for "Copy readout".</summary>
        Private _readoutText As String = String.Empty

        ''' <summary>The rectangle the readout was drawn in (kept for tests and future hit-testing).</summary>
        Private _readoutRect As Rect

        ''' <summary>
        ''' The text and colours of one readout panel: the black plate a reading appears in. Kept as a
        ''' value so the two paths that show one — a cursor, and whatever the pointer is over on a chart
        ''' that reports it (see <see cref="SupportsHoverReadout"/>) — can build it their own way and still
        ''' share one piece of drawing code, so the two can never drift apart.
        ''' </summary>
        Friend NotInheritable Class ReadoutPanel
            ''' <summary>The first line: what the reading belongs to ("C1  North", "North").</summary>
            Friend Head As String = String.Empty
            ''' <summary>The colour of that line — the cursor's own drawn colour, or the element's.</summary>
            Friend HeadColor As Color = Colors.White
            ''' <summary>The numbers under it, or Nothing when the reading has none.</summary>
            Friend Body As String
            ''' <summary>The cursor pair's |ΔX| / |ΔY| row, or Nothing. Never set for a hovered element.</summary>
            Friend Delta As String
            ''' <summary>The colour the panel is outlined in, and the hairline above the delta row.</summary>
            Friend Accent As Color = Colors.White
            ''' <summary>The colour of that hairline: the OTHER cursor's drawn colour.</summary>
            Friend DeltaColor As Color = Colors.White
            ''' <summary>Draw the panel beside the pointer instead of in the plot's top right corner.</summary>
            Friend FollowPointer As Boolean
        End Class

        ''' <summary>What the pointer is over on a chart that reports it, or Nothing when it is over
        ''' nothing (see <see cref="SupportsHoverReadout"/>). Rebuilt by <see cref="UpdateHover"/> while
        ''' the pointer moves and cleared when it leaves the chart.</summary>
        Friend Hover As ReadoutPanel

        ''' <summary>One cursor's clickable parts, in control coordinates, plus the values its readout
        ''' reports — kept so the panel can compare TWO cursors without recomputing anything.</summary>
        Private NotInheritable Class CursorHit
            Friend Cursor As ChartCursor
            Friend Index As Integer
            ''' <summary>The cursor's X, in data units (the value its readout shows).</summary>
            Friend X As Double
            ''' <summary>The Y its readout reports: the selected trace's value at that X, else the
            ''' cursor's own Y. NOT the height the horizontal line is drawn at — for a cursor that does
            ''' not follow its trace, the line is a threshold and the readout a reading.</summary>
            Friend Y As Double
            ''' <summary>A band around the vertical line (empty when it is not drawn).</summary>
            Friend Vertical As Rect
            ''' <summary>A band around the horizontal line (empty when it is not drawn).</summary>
            Friend Horizontal As Rect
            ''' <summary>The square at the crossing point where both lines meet.</summary>
            Friend Handle As Rect
            ''' <summary>The colour it was drawn in — the followed series' own colour when it follows
            ''' one, else its own (see CursorColor). Kept so the readout and the delta row are drawn
            ''' in exactly the colour that is on screen.</summary>
            Friend DrawnColor As Color = Colors.Transparent
        End Class

        ''' <summary>How close to a cursor line a click counts (each side, in pixels).</summary>
        Private Const CursorGrab As Double = 5.0

        ' ---- scaling overrides (the common axis) ----------------------------------------------
        Public Shared ReadOnly MinXProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(MinX), Double.NaN)

        Public Shared ReadOnly MaxXProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(MaxX), Double.NaN)

        Public Shared ReadOnly MinYProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(MinY), Double.NaN)

        Public Shared ReadOnly MaxYProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(MaxY), Double.NaN)

        ' ---- LEGACY single-series styling -----------------------------------------------------
        ' Kept so older forms still compile AND still look right: these style the implicit series a
        ' chart uses when it has NO series elements. The Series Editor seeds the first series from
        ' them, and they are no longer offered in the Properties panel (the series own them now).
        Public Shared ReadOnly LineColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of ChartBase, Color)(NameOf(LineColor), Color.Parse("#2D7DD2"))

        Public Shared ReadOnly LineThicknessProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(LineThickness), 2.0)

        Public Shared ReadOnly LineStyleProperty As StyledProperty(Of AvaloniaCharts.ChartLineStyle) =
            AvaloniaProperty.Register(Of ChartBase, AvaloniaCharts.ChartLineStyle)(NameOf(LineStyle), AvaloniaCharts.ChartLineStyle.Solid)

        Public Shared ReadOnly MarkerStyleProperty As StyledProperty(Of AvaloniaCharts.ChartMarkerStyle) =
            AvaloniaProperty.Register(Of ChartBase, AvaloniaCharts.ChartMarkerStyle)(NameOf(MarkerStyle), AvaloniaCharts.ChartMarkerStyle.Dot)

        Public Shared ReadOnly MarkerSizeProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(MarkerSize), 8.0)

        Public Shared ReadOnly ConnectedProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of ChartBase, Boolean)(NameOf(Connected), True)

        Shared Sub New()
            AffectsRender(Of ChartBase)(
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
                SourceFileProperty, SourceKindProperty, SourceSheetProperty, DataFileProperty,
                XColumnProperty, YColumnProperty, HeaderRowProperty, FirstDataRowProperty,
                ShowLegendProperty, LegendFontSizeProperty,
                LegendPositionProperty, LegendBackColorProperty, LegendShowFrameProperty,
                LegendBorderBrushProperty, LegendBorderThicknessProperty, LegendCornerRadiusProperty,
                LegendMarginProperty,
                ReadoutPositionProperty, CursorDecimalsProperty,
                MinXProperty, MaxXProperty, MinYProperty, MaxYProperty,
                LineColorProperty, LineThicknessProperty, LineStyleProperty,
                MarkerStyleProperty, MarkerSizeProperty, ConnectedProperty)
        End Sub

        Public Property ShowBorder As Boolean
            Get
                Return GetValue(ShowBorderProperty)
            End Get
            Set(value As Boolean)
                SetValue(ShowBorderProperty, value)
            End Set
        End Property

        Public Property BorderBrush As Color
            Get
                Return GetValue(BorderBrushProperty)
            End Get
            Set(value As Color)
                SetValue(BorderBrushProperty, value)
            End Set
        End Property

        Public Property BorderThickness As Double
            Get
                Return GetValue(BorderThicknessProperty)
            End Get
            Set(value As Double)
                SetValue(BorderThicknessProperty, value)
            End Set
        End Property

        ''' <summary>Space between the border and the chart frame — the title, the legend bar and the plot
        ''' area — on all four sides.</summary>
        Public Property Padding As Thickness
            Get
                Return GetValue(PaddingProperty)
            End Get
            Set(value As Thickness)
                SetValue(PaddingProperty, value)
            End Set
        End Property

        Public Property CornerRadius As Avalonia.CornerRadius
            Get
                Return GetValue(CornerRadiusProperty)
            End Get
            Set(value As Avalonia.CornerRadius)
                SetValue(CornerRadiusProperty, value)
            End Set
        End Property

        Public Property PlotBackColor As Color
            Get
                Return GetValue(PlotBackColorProperty)
            End Get
            Set(value As Color)
                SetValue(PlotBackColorProperty, value)
            End Set
        End Property

        Public Property PlotBackOpacity As Double
            Get
                Return GetValue(PlotBackOpacityProperty)
            End Get
            Set(value As Double)
                SetValue(PlotBackOpacityProperty, value)
            End Set
        End Property

        ''' <summary>An optional background brush (e.g. a gradient) for the whole chart; wins over
        ''' PlotBackColor when set.</summary>
        Public Property PlotBackBrush As Brush
            Get
                Return GetValue(PlotBackBrushProperty)
            End Get
            Set(value As Brush)
                SetValue(PlotBackBrushProperty, value)
            End Set
        End Property

        Public Property ShowGrid As Boolean
            Get
                Return GetValue(ShowGridProperty)
            End Get
            Set(value As Boolean)
                SetValue(ShowGridProperty, value)
            End Set
        End Property

        Public Property GridColor As Color
            Get
                Return GetValue(GridColorProperty)
            End Get
            Set(value As Color)
                SetValue(GridColorProperty, value)
            End Set
        End Property

        Public Property GridThickness As Double
            Get
                Return GetValue(GridThicknessProperty)
            End Get
            Set(value As Double)
                SetValue(GridThicknessProperty, value)
            End Set
        End Property

        Public Property GridStyle As AvaloniaCharts.ChartLineStyle
            Get
                Return GetValue(GridStyleProperty)
            End Get
            Set(value As AvaloniaCharts.ChartLineStyle)
                SetValue(GridStyleProperty, value)
            End Set
        End Property

        Public Property ShowAxes As Boolean
            Get
                Return GetValue(ShowAxesProperty)
            End Get
            Set(value As Boolean)
                SetValue(ShowAxesProperty, value)
            End Set
        End Property

        Public Property AxisColor As Color
            Get
                Return GetValue(AxisColorProperty)
            End Get
            Set(value As Color)
                SetValue(AxisColorProperty, value)
            End Set
        End Property

        Public Property ShowMajorTicks As Boolean
            Get
                Return GetValue(ShowMajorTicksProperty)
            End Get
            Set(value As Boolean)
                SetValue(ShowMajorTicksProperty, value)
            End Set
        End Property

        Public Property MajorTickLength As Double
            Get
                Return GetValue(MajorTickLengthProperty)
            End Get
            Set(value As Double)
                SetValue(MajorTickLengthProperty, value)
            End Set
        End Property

        Public Property ShowMinorTicks As Boolean
            Get
                Return GetValue(ShowMinorTicksProperty)
            End Get
            Set(value As Boolean)
                SetValue(ShowMinorTicksProperty, value)
            End Set
        End Property

        Public Property MinorTickLength As Double
            Get
                Return GetValue(MinorTickLengthProperty)
            End Get
            Set(value As Double)
                SetValue(MinorTickLengthProperty, value)
            End Set
        End Property

        Public Property ShowTickLabels As Boolean
            Get
                Return GetValue(ShowTickLabelsProperty)
            End Get
            Set(value As Boolean)
                SetValue(ShowTickLabelsProperty, value)
            End Set
        End Property

        Public Property TickLabelFontSize As Double
            Get
                Return GetValue(TickLabelFontSizeProperty)
            End Get
            Set(value As Double)
                SetValue(TickLabelFontSizeProperty, value)
            End Set
        End Property

        Public Property ShowAxisTitles As Boolean
            Get
                Return GetValue(ShowAxisTitlesProperty)
            End Get
            Set(value As Boolean)
                SetValue(ShowAxisTitlesProperty, value)
            End Set
        End Property

        Public Property XAxisTitle As String
            Get
                Return GetValue(XAxisTitleProperty)
            End Get
            Set(value As String)
                SetValue(XAxisTitleProperty, value)
            End Set
        End Property

        Public Property YAxisTitle As String
            Get
                Return GetValue(YAxisTitleProperty)
            End Get
            Set(value As String)
                SetValue(YAxisTitleProperty, value)
            End Set
        End Property

        ''' <summary>
        ''' The chart's COMMON X axis - the one every series uses unless it is set to PerSeries. An
        ''' Axis object written as a property element:
        ''' &lt;charts:GrumpyXYPlot.XAxis&gt;&lt;charts:Axis Position="Top"/&gt;&lt;/charts:GrumpyXYPlot.XAxis&gt;.
        ''' Left Nothing, the chart-level axis properties describe it instead, so a form written before
        ''' the Axis Editor looks exactly as it did.
        ''' </summary>
        Public Property XAxis As Axis = Nothing

        ''' <summary>The chart's COMMON Y axis. See XAxis.</summary>
        Public Property YAxis As Axis = Nothing

        Public Property ShowTitle As Boolean
            Get
                Return GetValue(ShowTitleProperty)
            End Get
            Set(value As Boolean)
                SetValue(ShowTitleProperty, value)
            End Set
        End Property

        Public Property Title As String
            Get
                Return GetValue(TitleProperty)
            End Get
            Set(value As String)
                SetValue(TitleProperty, value)
            End Set
        End Property

        Public Property TitleColor As Color
            Get
                Return GetValue(TitleColorProperty)
            End Get
            Set(value As Color)
                SetValue(TitleColorProperty, value)
            End Set
        End Property

        Public Property TitlePosition As AvaloniaCharts.ChartTitlePosition
            Get
                Return GetValue(TitlePositionProperty)
            End Get
            Set(value As AvaloniaCharts.ChartTitlePosition)
                SetValue(TitlePositionProperty, value)
            End Set
        End Property

        Public Property TitleFontSize As Double
            Get
                Return GetValue(TitleFontSizeProperty)
            End Get
            Set(value As Double)
                SetValue(TitleFontSizeProperty, value)
            End Set
        End Property

        Public Property SourceFile As String
            Get
                Return GetValue(SourceFileProperty)
            End Get
            Set(value As String)
                SetValue(SourceFileProperty, value)
            End Set
        End Property

        ''' <summary>Where the data comes from (see DataSourceKind).</summary>
        Public Property SourceKind As DataSourceKind
            Get
                Return GetValue(SourceKindProperty)
            End Get
            Set(value As DataSourceKind)
                SetValue(SourceKindProperty, value)
            End Set
        End Property

        ''' <summary>Which PAGE of the workbook to read, by sheet name (empty = the first worksheet).</summary>
        Public Property SourceSheet As String
            Get
                Return GetValue(SourceSheetProperty)
            End Get
            Set(value As String)
                SetValue(SourceSheetProperty, value)
            End Set
        End Property

        ''' <summary>The data file for the DataFiles source — carried in the form, not read yet.</summary>
        Public Property DataFile As String
            Get
                Return GetValue(DataFileProperty)
            End Get
            Set(value As String)
                SetValue(DataFileProperty, value)
            End Set
        End Property

        Public Property LiveUpdate As Boolean
            Get
                Return GetValue(LiveUpdateProperty)
            End Get
            Set(value As Boolean)
                SetValue(LiveUpdateProperty, value)
            End Set
        End Property

        Public Property XColumn As String
            Get
                Return GetValue(XColumnProperty)
            End Get
            Set(value As String)
                SetValue(XColumnProperty, value)
            End Set
        End Property

        Public Property YColumn As String
            Get
                Return GetValue(YColumnProperty)
            End Get
            Set(value As String)
                SetValue(YColumnProperty, value)
            End Set
        End Property

        Public Property HeaderRow As Integer
            Get
                Return GetValue(HeaderRowProperty)
            End Get
            Set(value As Integer)
                SetValue(HeaderRowProperty, value)
            End Set
        End Property

        Public Property FirstDataRow As Integer
            Get
                Return GetValue(FirstDataRowProperty)
            End Get
            Set(value As Integer)
                SetValue(FirstDataRowProperty, value)
            End Set
        End Property

        Public Property ShowBrowse As Boolean
            Get
                Return GetValue(ShowBrowseProperty)
            End Get
            Set(value As Boolean)
                SetValue(ShowBrowseProperty, value)
            End Set
        End Property

        ''' <summary>Draw the legend bar along the bottom of the chart.</summary>
        Public Property ShowLegend As Boolean
            Get
                Return GetValue(ShowLegendProperty)
            End Get
            Set(value As Boolean)
                SetValue(ShowLegendProperty, value)
            End Set
        End Property

        ''' <summary>Font size of the legend's series names.</summary>
        Public Property LegendFontSize As Double
            Get
                Return GetValue(LegendFontSizeProperty)
            End Get
            Set(value As Double)
                SetValue(LegendFontSizeProperty, value)
            End Set
        End Property

        ''' <summary>Where the legend bar sits.</summary>
        Public Property LegendPosition As LegendPosition
            Get
                Return GetValue(LegendPositionProperty)
            End Get
            Set(value As LegendPosition)
                SetValue(LegendPositionProperty, value)
            End Set
        End Property

        ''' <summary>The legend frame's backcolour.</summary>
        Public Property LegendBackColor As Color
            Get
                Return GetValue(LegendBackColorProperty)
            End Get
            Set(value As Color)
                SetValue(LegendBackColorProperty, value)
            End Set
        End Property

        ''' <summary>Draw a frame around the legend bar.</summary>
        Public Property LegendShowFrame As Boolean
            Get
                Return GetValue(LegendShowFrameProperty)
            End Get
            Set(value As Boolean)
                SetValue(LegendShowFrameProperty, value)
            End Set
        End Property

        ''' <summary>Colour of the legend frame's outline.</summary>
        Public Property LegendBorderBrush As Color
            Get
                Return GetValue(LegendBorderBrushProperty)
            End Get
            Set(value As Color)
                SetValue(LegendBorderBrushProperty, value)
            End Set
        End Property

        ''' <summary>Thickness of the legend frame's outline.</summary>
        Public Property LegendBorderThickness As Double
            Get
                Return GetValue(LegendBorderThicknessProperty)
            End Get
            Set(value As Double)
                SetValue(LegendBorderThicknessProperty, value)
            End Set
        End Property

        ''' <summary>Corner rounding of the legend frame.</summary>
        Public Property LegendCornerRadius As Avalonia.CornerRadius
            Get
                Return GetValue(LegendCornerRadiusProperty)
            End Get
            Set(value As Avalonia.CornerRadius)
                SetValue(LegendCornerRadiusProperty, value)
            End Set
        End Property

        ''' <summary>Breathing room between the legend frame and the entries inside it, in pixels, added
        ''' on all four sides (0 = the padding the bar has always had).</summary>
        Public Property LegendMargin As Double
            Get
                Return GetValue(LegendMarginProperty)
            End Get
            Set(value As Double)
                SetValue(LegendMarginProperty, value)
            End Set
        End Property

        Public Property MinX As Double
            Get
                Return GetValue(MinXProperty)
            End Get
            Set(value As Double)
                SetValue(MinXProperty, value)
            End Set
        End Property

        Public Property MaxX As Double
            Get
                Return GetValue(MaxXProperty)
            End Get
            Set(value As Double)
                SetValue(MaxXProperty, value)
            End Set
        End Property

        Public Property MinY As Double
            Get
                Return GetValue(MinYProperty)
            End Get
            Set(value As Double)
                SetValue(MinYProperty, value)
            End Set
        End Property

        Public Property MaxY As Double
            Get
                Return GetValue(MaxYProperty)
            End Get
            Set(value As Double)
                SetValue(MaxYProperty, value)
            End Set
        End Property

        Public Property LineColor As Color
            Get
                Return GetValue(LineColorProperty)
            End Get
            Set(value As Color)
                SetValue(LineColorProperty, value)
            End Set
        End Property

        Public Property LineThickness As Double
            Get
                Return GetValue(LineThicknessProperty)
            End Get
            Set(value As Double)
                SetValue(LineThicknessProperty, value)
            End Set
        End Property

        Public Property LineStyle As AvaloniaCharts.ChartLineStyle
            Get
                Return GetValue(LineStyleProperty)
            End Get
            Set(value As AvaloniaCharts.ChartLineStyle)
                SetValue(LineStyleProperty, value)
            End Set
        End Property

        Public Property MarkerStyle As AvaloniaCharts.ChartMarkerStyle
            Get
                Return GetValue(MarkerStyleProperty)
            End Get
            Set(value As AvaloniaCharts.ChartMarkerStyle)
                SetValue(MarkerStyleProperty, value)
            End Set
        End Property

        Public Property MarkerSize As Double
            Get
                Return GetValue(MarkerSizeProperty)
            End Get
            Set(value As Double)
                SetValue(MarkerSizeProperty, value)
            End Set
        End Property

        Public Property Connected As Boolean
            Get
                Return GetValue(ConnectedProperty)
            End Get
            Set(value As Boolean)
                SetValue(ConnectedProperty, value)
            End Set
        End Property

        Private ReadOnly _series As New AvaloniaList(Of ChartSeries)()

        ''' <summary>
        ''' The chart's series, drawn in this order. This is the content property, so a series is
        ''' written as a child element:
        ''' <c>&lt;charts:GrumpyXYPlot&gt;&lt;charts:XYSeries …/&gt;&lt;/charts:GrumpyXYPlot&gt;</c>.
        ''' Empty = one implicit series styled from the chart-level values.
        ''' </summary>
        <Content>
        Public ReadOnly Property Series As AvaloniaList(Of ChartSeries)
            Get
                Return _series
            End Get
        End Property

        ' ---- data -----------------------------------------------------------------------------

        ''' <summary>The data to draw when the chart has no series and no SourceFile.</summary>
        Protected MustOverride Function InlineData() As ChartData

        ''' <summary>How a subclass stores inline data pushed from code (Values or Points).</summary>
        Protected MustOverride Sub SetInlineData(xs As Double(), ys As Double())

        ''' <summary>True when the implicit (no-series) chart plots Y against the sample index.</summary>
        Protected MustOverride ReadOnly Property ImplicitXFromIndex As Boolean

        ''' <summary>The Y column of the nth series in the default pairing (C, E, G …).</summary>
        Friend Shared Function DefaultYColumn(index As Integer) As String
            Return SpreadsheetReader.ColumnAfter("C", index * 2)
        End Function

        ''' <summary>The X column of the nth series in the default pairing (B, D, F …).</summary>
        Friend Shared Function DefaultXColumn(index As Integer) As String
            Return SpreadsheetReader.ColumnAfter("B", index * 2)
        End Function

        ''' <summary>The X column a PER-SERIES series reads: its own, else its place in the B/C, D/E,
        ''' F/G pairing. A common-axis series shares the chart's XColumn instead.</summary>
        Private Function SeriesXColumn(oneSeries As ChartSeries, index As Integer) As String
            If Not String.IsNullOrWhiteSpace(oneSeries.XColumn) Then Return oneSeries.XColumn
            Return DefaultXColumn(index)
        End Function

        ''' <summary>The Y column a series reads: its own, else the chart's, else the next of C, E, G…</summary>
        Private Function SeriesYColumn(oneSeries As ChartSeries, index As Integer) As String
            If Not String.IsNullOrWhiteSpace(oneSeries.YColumn) Then Return oneSeries.YColumn
            ' '_series', not 'Series': VB is case-insensitive and would match the parameter above.
            If _series.Count = 1 AndAlso Not String.IsNullOrWhiteSpace(YColumn) Then Return YColumn
            Return SpreadsheetReader.ColumnAfter("C", index * 2)
        End Function

        ''' <summary>The common Y axis to draw: the Axis object when the XAML has one, else one built
        ''' from the chart-level (legacy) axis properties.</summary>
        Private Function CommonYAxis() As Axis
            Dim axis = If(YAxis, New Axis With {
                .Position = AxisPosition.Left,
                .ShowAxis = ShowAxes,
                .AxisColor = AxisColor,
                .ShowMajorTicks = ShowMajorTicks,
                .MajorTickLength = MajorTickLength,
                .ShowMinorTicks = ShowMinorTicks,
                .MinorTickLength = MinorTickLength,
                .ShowTickLabels = ShowTickLabels,
                .TickLabelFontSize = TickLabelFontSize,
                .ShowAxisName = ShowAxisTitles,
                .Name = YAxisTitle
            })
            If Not HasCartesianAxes Then Hide(axis)
            Return axis
        End Function

        ''' <summary>
        ''' A chart with no cartesian frame (the pie) wants the axis furniture out of the way but still
        ''' wants the room its OWN axis objects would take — the pie gives its drawing a centred square
        ''' of the frame, and an explicit &lt;charts:Axis&gt; in the form must not shrink it either.
        ''' </summary>
        Private Shared Sub Hide(axis As Axis)
            axis.ShowAxis = False
            axis.ShowMajorTicks = False
            axis.ShowMinorTicks = False
            axis.ShowTickLabels = False
            axis.ShowAxisName = False
        End Sub

        ''' <summary>The common X axis to draw: see CommonYAxis.</summary>
        Private Function CommonXAxis() As Axis
            Dim axis = If(XAxis, New Axis With {
                .Position = AxisPosition.Bottom,
                .ShowAxis = ShowAxes,
                .AxisColor = AxisColor,
                .ShowMajorTicks = ShowMajorTicks,
                .MajorTickLength = MajorTickLength,
                .ShowMinorTicks = ShowMinorTicks,
                .MinorTickLength = MinorTickLength,
                .ShowTickLabels = ShowTickLabels,
                .TickLabelFontSize = TickLabelFontSize,
                .ShowAxisName = ShowAxisTitles,
                .Name = XAxisTitle
            })
            If Not HasCartesianAxes Then Hide(axis)
            Return axis
        End Function

        Private ReadOnly _cache As New Dictionary(Of String, ChartData)()
        Private _cacheFile As String = Nothing
        Private _lastPlotCount As Integer = 0

        ''' <summary>
        ''' The data for one series (cached per column pair and workbook). labelPairs reads label + value
        ''' pairs instead of two numeric columns, which is what a pie's slices are — and it is only that
        ''' chart that asks for it.
        ''' </summary>
        Private Protected Function DataFor(xColumn As String, yColumn As String, xFromIndex As Boolean,
                                          Optional labelPairs As Boolean = False) As ChartData
            Dim file = SourceFile
            If String.IsNullOrWhiteSpace(file) Then Return InlineData()

            Dim key = xColumn & "|" & yColumn & "|" & xFromIndex.ToString() & "|" & labelPairs.ToString() & "|" & SourceSheet
            If _cacheFile <> file Then
                _cache.Clear()
                _cacheFile = file
            End If
            Dim cached As ChartData = Nothing
            If _cache.TryGetValue(key, cached) Then Return cached

            ' The PAGE the form asks for, by name; empty means the workbook's first worksheet.
            Dim page = SourceSheet
            Dim loaded = If(labelPairs,
                            SpreadsheetReader.ReadLabels(file, xColumn, yColumn, HeaderRow, FirstDataRow, page),
                            SpreadsheetReader.Read(file, xColumn, yColumn, HeaderRow, FirstDataRow, xFromIndex, page))
            _cache(key) = loaded
            Return loaded
        End Function

        ''' <summary>Every series to draw, with its data, styling, scale and axes resolved. A chart type
        ''' with a different notion of "series" — the pie, whose slices each become one plot so the
        ''' legend, its tick boxes and the colours work unchanged — overrides this. Friend (not Protected)
        ''' because Plot is Friend: VB will not let a Protected member expose an assembly-internal type,
        ''' which is exactly what the C# twin's private protected avoids.
        ''' </summary>
        Friend Overridable Function BuildPlots() As List(Of Plot)
            Dim plots As New List(Of Plot)()
            If Series.Count = 0 Then
                ' The implicit single series: chart-level columns and (legacy) chart-level styling.
                Dim only = DataFor(If(XColumn, "B"), If(YColumn, "C"), ImplicitXFromIndex)
                ' Not named 'single': that is a VB type keyword.
                Dim onePlot As New Plot With {
                    .Data = only,
                    .LineColor = LineColor,
                    .LineThickness = LineThickness,
                    .LineStyle = LineStyle,
                    .MarkerStyle = MarkerStyle,
                    .MarkerSize = MarkerSize,
                    .Connected = Connected
                }
                onePlot.XRange = AxisRange.Over(only.Xs, MinX, MaxX, 6, 1)
                onePlot.YRange = WithBaseline(only.Ys, MinY, MaxY)
                plots.Add(onePlot)
                Return plots
            End If

            For i = 0 To Series.Count - 1
                ' 'oneSeries' / 'xCol' / 'yCol' rather than series/xColumn/yColumn: VB would match
                ' those against the Series / XColumn / YColumn members (it is case-insensitive).
                Dim oneSeries = Series(i)
                Dim useCommonX = Not oneSeries.PerSeries OrElse oneSeries.XFromIndex
                Dim xCol = If(useCommonX, If(XColumn, "B"), SeriesXColumn(oneSeries, i))
                Dim yCol = SeriesYColumn(oneSeries, i)
                Dim seriesData = DataFor(xCol, yCol, oneSeries.XFromIndex)
                Dim one As New Plot With {
                    .Data = seriesData,
                    .Definition = oneSeries,
                    .LineColor = oneSeries.LineColor,
                    .LineThickness = oneSeries.LineThickness,
                    .LineStyle = oneSeries.LineStyle,
                    .MarkerStyle = oneSeries.MarkerStyle,
                    .MarkerSize = oneSeries.MarkerSize,
                    .Connected = oneSeries.Connected,
                    .Visible = oneSeries.Visible,
                    .PerSeries = oneSeries.PerSeries,
                    .XAxis = oneSeries.XAxis,
                    .YAxis = oneSeries.YAxis
                }
                If oneSeries.PerSeries Then
                    one.XRange = AxisRange.Over(seriesData.Xs, Double.NaN, Double.NaN, 6, 5)
                    one.YRange = AxisRange.Over(seriesData.Ys, Double.NaN, Double.NaN, 5, 5)
                End If
                plots.Add(one)
            Next

            ' The common axis covers the series that use it (or all of them when every series is its own).
            Dim commonPlots = plots.Where(Function(p) Not p.PerSeries).ToList()
            If commonPlots.Count = 0 Then commonPlots = plots
            Dim allXs = commonPlots.SelectMany(Function(p) p.Data.Xs).ToArray()
            Dim allYs = commonPlots.SelectMany(Function(p) p.Data.Ys).ToList()
            ' A stacked chart's scale has to fit the TOTALS (the tallest bar is the sum of its category's
            ' segments); fitting each series on its own would push the stack out of the plot.
            If StackSeries Then allYs.AddRange(StackTotals(commonPlots))
            Dim subdivisions = If(Series.Any(Function(s) s.XFromIndex), 1, 5)
            Dim sharedX = AxisRange.Over(PaddedX(allXs), MinX, MaxX, 6, subdivisions)
            Dim sharedY = WithBaseline(allYs, MinY, MaxY)
            For Each one In commonPlots
                one.XRange = sharedX
                one.YRange = sharedY
            Next
            Return plots
        End Function

        ''' <summary>The Y scale for a set of values, with 0 included when this chart type needs a
        ''' baseline (see ZeroBaseline). Forced limits still win: a hand-set MinY/MaxY is drawn as
        ''' asked.</summary>
        Private Function WithBaseline(values As IEnumerable(Of Double), forcedMin As Double, forcedMax As Double) As AxisRange
            ' A share-of-whole chart always spans the whole 0-100 band: the drawing turns the values into
            ' percentages, so fitting the raw totals would push every shape out of the plot.
            If ZeroToHundred Then Return AxisRange.Over(New Double() {0.0R, 100.0R}, forcedMin, forcedMax, 5, 5)
            Dim list = values.ToList()
            If ZeroBaseline Then list.Add(0)
            Return AxisRange.Over(list, forcedMin, forcedMax, 5, 5)
        End Function

        ''' <summary>The X values with this chart type's end margin added (see XPadUnits): the scale then
        ''' reaches past the outer bars, so they are drawn whole.</summary>
        Private Function PaddedX(xs As Double()) As Double()
            If XPadUnits <= 0 OrElse xs.Length = 0 Then Return xs
            Return New Double() {xs.Min() - XPadUnits, xs.Max() + XPadUnits}
        End Function

        ''' <summary>The per-point TOTALS of a stack, used to fit a stacked chart's scale.</summary>
        Private Shared Function StackTotals(plots As List(Of Plot)) As IEnumerable(Of Double)
            Dim length = If(plots.Count = 0, 0, plots.Max(Function(p) p.Data.Ys.Length))
            Dim totals As New List(Of Double)()
            For i = 0 To length - 1
                Dim sum As Double = 0
                For Each one In plots
                    If i < one.Data.Ys.Length Then sum += one.Data.Ys(i)
                Next
                totals.Add(sum)
            Next
            Return totals
        End Function

        ''' <summary>
        ''' True when this chart type STACKS its series: each one starts where the previous ended, so the
        ''' scale has to fit the totals rather than the individual series (the bar and area charts).
        ''' </summary>
        Protected Overridable ReadOnly Property StackSeries As Boolean
            Get
                Return False
            End Get
        End Property

        ''' <summary>
        ''' True when 0 has to be on the Y scale whether the data asks for it or not. A bar is read as a
        ''' length from its baseline and an area as a filled space above it, so a chart whose values all
        ''' sit far from zero (say 40…50) would otherwise draw meaningless shapes and a misleading
        ''' picture.
        ''' </summary>
        Protected Overridable ReadOnly Property ZeroBaseline As Boolean
            Get
                Return False
            End Get
        End Property

        ''' <summary>
        ''' True for a chart without a cartesian frame (the pie): there is no grid to draw and the axis
        ''' furniture is hidden, so the drawing gets the whole frame instead of a plottable rectangle.
        ''' </summary>
        Protected Overridable ReadOnly Property HasCartesianAxes As Boolean
            Get
                Return True
            End Get
        End Property

        ''' <summary>False when a draggable crosshair makes no sense on this chart type (the pie and the
        ''' bar): the chart's right-click menu then carries no cursor entries at all.</summary>
        Protected Overridable ReadOnly Property SupportsCursors As Boolean
            Get
                Return True
            End Get
        End Property

        ''' <summary>
        ''' True when the chart reports what is under the pointer in the readout panel — a bar's category
        ''' and value, a pie slice's name, value and share of the total. The chart type decides what that
        ''' is: <see cref="UpdateHover"/> fills <see cref="Hover"/> in as the pointer moves and the shared
        ''' panel draws it exactly as it draws a cursor's readout. On a pie the slice under the pointer
        ''' also pops out of the ring by <see cref="GrumpyPiePlot.HoverExplode"/> pixels.
        ''' </summary>
        Friend Overridable ReadOnly Property SupportsHoverReadout As Boolean
            Get
                Return False
            End Get
        End Property

        ''' <summary>
        ''' True when the X axis is a list of CATEGORIES and should be labelled with each point's own
        ''' name (the bar and area charts). Every other chart type keeps its numbers, so an existing
        ''' form's axis cannot change under it just because its X column happens to hold text.
        ''' </summary>
        Protected Overridable ReadOnly Property NamedXAxis As Boolean
            Get
                Return False
            End Get
        End Property

        ''' <summary>The names to label the X axis with, or Nothing when this chart type labels numbers.</summary>
        Private Function XNames(data As ChartData) As String()
            Return If(NamedXAxis, data.Labels, Nothing)
        End Function

        ''' <summary>
        ''' How much empty room the X scale keeps at each end, in X units. A bar chart asks for HALF A
        ''' SLOT, so the first and last bar stand clear of the plot's edge instead of being cut in half
        ''' by it.
        ''' </summary>
        Protected Overridable ReadOnly Property XPadUnits As Double
            Get
                Return 0.0R
            End Get
        End Property

        ''' <summary>
        ''' True when the series are SHARES OF A WHOLE (a 100% stacked bar or area), so the Y scale is
        ''' fixed at 0 to 100 and the drawing works in percentages rather than the workbook's raw
        ''' numbers.
        ''' </summary>
        Protected Overridable ReadOnly Property ZeroToHundred As Boolean
            Get
                Return False
            End Get
        End Property

        ''' <summary>
        ''' Where each series sits when they are stacked: the level every shape of that series starts at
        ''' and the level it reaches, per point. hundred first scales each category to 100, so the same
        ''' data turns into a share-of-total chart. Without stacking the base is 0 and the top is the
        ''' value, which is why the bar and area drawing can use one code path for both.
        ''' </summary>
        Friend Shared Function StackBands(plots As List(Of Plot), hundred As Boolean) As (Base As Double(), Top As Double())()
            Dim bands(plots.Count - 1) As (Base As Double(), Top As Double())
            Dim length = If(plots.Count = 0, 0, plots.Max(Function(p) p.Data.Ys.Length))
            Dim running(length - 1) As Double
            For s = 0 To plots.Count - 1
                Dim ys = plots(s).Data.Ys
                Dim bases(ys.Length - 1) As Double
                Dim tops(ys.Length - 1) As Double
                For i = 0 To ys.Length - 1
                    Dim value = ys(i)
                    If hundred Then
                        Dim total As Double = 0
                        For Each one In plots
                            If i < one.Data.Ys.Length Then total += one.Data.Ys(i)
                        Next
                        value = If(total > 0, ys(i) / total * 100.0R, 0.0R)
                    End If
                    bases(i) = running(i)
                    tops(i) = running(i) + value
                    running(i) = tops(i)
                Next
                bands(s) = (bases, tops)
            Next
            Return bands
        End Function

        ''' <summary>A series' points in control coordinates.</summary>
        Friend Shared Function SeriesPoints(one As Plot, area As Rect) As Point()
            Return one.Data.Xs.Select(
                Function(v, i)
                    Return New Point(one.XRange.ToPixel(one.Data.Xs(i), area.X, area.Width),
                                     one.YRange.ToPixel(one.Data.Ys(i), area.Bottom, -area.Height))
                End Function).ToArray()
        End Function

        ''' <summary>Where a data value sits vertically in the plot (bars, areas and their baselines).</summary>
        Friend Shared Function YAt(one As Plot, area As Rect, value As Double) As Double
            Return one.YRange.ToPixel(value, area.Bottom, -area.Height)
        End Function

        ''' <summary>Drop the cached data so the next redraw re-reads the workbook.</summary>
        Public Sub Reload()
            InvalidateCache()
        End Sub

        Private Sub InvalidateCache()
            _cache.Clear()
            _cacheFile = Nothing
            InvalidateVisual()
        End Sub

        ''' <summary>Replace the implicit series' data (a line chart can also just append with AddPoint).</summary>
        Public Sub SetValues(values As IEnumerable(Of Double))
            Dim data = If(values?.ToArray(), Array.Empty(Of Double)())
            SetInlineData(Enumerable.Range(0, data.Length).Select(Function(i) CDbl(i)).ToArray(), data)
            InvalidateCache()
        End Sub

        ''' <summary>Append one point to the implicit series and redraw.</summary>
        Public Sub AddPoint(x As Double, y As Double)
            Dim current = InlineData()
            Dim xs = current.Xs.ToList()
            Dim ys = current.Ys.ToList()
            xs.Add(x)
            ys.Add(y)
            SetInlineData(xs.ToArray(), ys.ToArray())
            InvalidateCache()
        End Sub

        Protected Overrides Sub OnPropertyChanged(change As AvaloniaPropertyChangedEventArgs)
            MyBase.OnPropertyChanged(change)
            If change.Property Is SourceFileProperty Then
                InvalidateCache()
            ElseIf change.Property Is SourceSheetProperty Then
                InvalidateCache()
            ElseIf change.Property Is LiveUpdateProperty Then
                RestartWatcher()
            End If
        End Sub

        ' ---- file picker ----------------------------------------------------------------------

        ''' <summary>
        ''' Opens the platform's file dialog and, when a workbook is picked, loads it. Does nothing
        ''' when the control has no TopLevel yet (a designer preview), so it is always safe to call.
        ''' </summary>
        Public Async Function BrowseForFile() As Task
            Try
                Dim top = TopLevel.GetTopLevel(Me)
                If top Is Nothing Then Return
                Dim storage = top.StorageProvider
                If storage Is Nothing Then Return

                Dim filters As FilePickerFileType() = {
                    New FilePickerFileType("Excel workbook") With {.Patterns = New String() {"*.xlsx"}},
                    New FilePickerFileType("All files") With {.Patterns = New String() {"*"}}
                }
                Dim options As New FilePickerOpenOptions With {
                    .Title = "Select a spreadsheet",
                    .AllowMultiple = False,
                    .FileTypeFilter = filters
                }
                ' Open where the last pick left off — see ChartPickerMemory — when there is somewhere to open.
                Dim last = ChartPickerMemory.LastFolder
                If last IsNot Nothing Then
                    Try
                        options.SuggestedStartLocation = Await storage.TryGetFolderFromPathAsync(New Uri(last))
                    Catch
                        ' The remembered folder is gone — let the platform choose.
                    End Try
                End If
                Dim files = Await storage.OpenFilePickerAsync(options)
                Dim picked As String = Nothing
                If files IsNot Nothing AndAlso files.Count > 0 Then picked = files(0).TryGetLocalPath()
                If Not String.IsNullOrWhiteSpace(picked) Then
                    SourceFile = picked
                    InvalidateCache()
                    Try
                        ChartPickerMemory.LastFolder = System.IO.Path.GetDirectoryName(picked)
                    Catch
                        ' Best effort.
                    End Try
                End If
            Catch
                ' No picker available (headless preview, no portal, …): leave the path untouched.
            End Try
        End Function

        ''' <summary>True when at least one series has points to draw.</summary>
        Private Function HasAnyData() As Boolean
            Return _lastPlotCount > 0
        End Function

        ''' <summary>Clicking a cursor line grabs and drags it; a click on the legend switches a trace; a
        ''' right-click opens the chart menu (the spreadsheet picker, and the cursors).</summary>
        Protected Overrides Sub OnPointerPressed(e As PointerPressedEventArgs)
            MyBase.OnPointerPressed(e)
            Dim position = e.GetPosition(Me)

            If e.GetCurrentPoint(Me).Properties.IsRightButtonPressed Then
                ' Focus before the menu opens: the menu itself takes the keyboard, and a filled chart has to
                ' still answer Esc after the menu has closed (see OnKeyDown).
                Focus()
                ShowChartMenu()
                e.Handled = True
                Return
            End If

            ' The cursors are on top, so they get the click first: the vertical line moves X, the
            ' horizontal line moves Y, the handle at the crossing point moves both.
            For i = _cursorHits.Count - 1 To 0 Step -1
                Dim oneHit = _cursorHits(i)
                Dim mode = 0
                If oneHit.Handle.Width > 0 AndAlso oneHit.Handle.Contains(position) Then
                    mode = 3
                ElseIf oneHit.Vertical.Width > 0 AndAlso oneHit.Vertical.Contains(position) Then
                    mode = 1
                ElseIf oneHit.Horizontal.Height > 0 AndAlso oneHit.Horizontal.Contains(position) Then
                    mode = 2
                End If
                If mode = 0 Then Continue For
                _selectedCursor = oneHit.Index
                _dragCursor = oneHit.Cursor
                _dragMode = mode
                _pointer = position
                _hasPointer = True
                Focus()
                e.Pointer.Capture(Me)
                InvalidateVisual()
                e.Handled = True
                Return
            Next

            ' The legend is interactive: clicking an entry (its tick box OR its name) switches that
            ' trace on and off. The rects are the ones the last Render laid out.
            For Each entry In _legend
                ' A slice typed in through SampleSets has no series element, so its entry is a name to read,
                ' not a switch: clicking it does nothing.
                If entry.Series Is Nothing Then Continue For
                If Not entry.Hit.Contains(position) Then Continue For
                entry.Series.Visible = Not entry.Series.Visible
                InvalidateVisual()
                e.Handled = True
                Return
            Next
        End Sub

        ''' <summary>Drags the grabbed cursor, keeps a mouse-following readout with the pointer, and
        ''' re-reads what the pointer is over on a chart that reports it.</summary>
        Protected Overrides Sub OnPointerMoved(e As PointerEventArgs)
            MyBase.OnPointerMoved(e)
            Dim position = e.GetPosition(Me)
            Dim moved = Not _hasPointer OrElse position <> _pointer
            _pointer = position
            _hasPointer = True
            If _dragMode <> 0 Then
                DragCursorTo(position)
                Return
            End If
            ' A chart that reports what is under the pointer redraws as the mouse moves, because its
            ' panel follows the pointer; a cursor's readout only redraws while it follows the mouse and
            ' a cursor is switched on.
            If SupportsHoverReadout Then
                UpdateHover(position, _plotRect)
                If moved Then InvalidateVisual()
                Return
            End If
            ' Only a chart that is reporting at the pointer needs redrawing while the mouse moves.
            If moved AndAlso ReadoutPosition = CursorReadout.FollowMouse AndAlso LiveCursorIndexes().Count > 0 Then
                InvalidateVisual()
            End If
        End Sub

        ''' <summary>Forgets what the pointer was over when it leaves the chart, so the readout goes
        ''' with it instead of staying on screen with nothing under it. (A cursor's readout keeps its own
        ''' behaviour: it is reporting from where the cursor is, not from where the mouse is.)</summary>
        Protected Overrides Sub OnPointerExited(e As PointerEventArgs)
            MyBase.OnPointerExited(e)
            If Not SupportsHoverReadout Then Return
            Hover = Nothing
            ClearHover()
            InvalidateVisual()
        End Sub

        Protected Overrides Sub OnPointerReleased(e As PointerReleasedEventArgs)
            MyBase.OnPointerReleased(e)
            If _dragMode = 0 Then Return
            _dragMode = 0
            _dragCursor = Nothing
            e.Pointer.Capture(Nothing)
            InvalidateVisual()
            e.Handled = True
        End Sub

        ''' <summary>
        ''' The cursor keys, and Esc. Esc puts a FILLED chart back where it came from (see FillContainer),
        ''' whatever else this chart's keys do — and it is only swallowed while the chart really is filled, so
        ''' a dialog around it keeps its own Esc. With a cursor switched on, left/right move the selected
        ''' cursor one sample along X and up/down choose which trace the readout reports; without a cursor the
        ''' arrow keys are left alone, so the chart does not swallow the keys of the window around it.
        ''' </summary>
        Protected Overrides Sub OnKeyDown(e As KeyEventArgs)
            MyBase.OnKeyDown(e)
            If e.Key = Key.Escape AndAlso _filled Then
                RestorePlacement()
                e.Handled = True
                Return
            End If
            Dim live = LiveCursorIndexes()
            If live.Count = 0 Then Return
            If e.Key <> Key.Left AndAlso e.Key <> Key.Right AndAlso e.Key <> Key.Up AndAlso e.Key <> Key.Down Then Return

            Dim traces = VisiblePlots(_plots)
            If traces.Count = 0 Then Return
            _selectedTrace = Math.Clamp(_selectedTrace, 0, traces.Count - 1)

            If e.Key = Key.Up OrElse e.Key = Key.Down Then
                If e.Key = Key.Up Then
                    _selectedTrace = (_selectedTrace - 1 + traces.Count) Mod traces.Count
                Else
                    _selectedTrace = (_selectedTrace + 1) Mod traces.Count
                End If
                InvalidateVisual()
                e.Handled = True
                Return
            End If

            Dim index = If(live.Contains(_selectedCursor), _selectedCursor, live(0))
            Dim cursor = Cursors(index)
            Dim common = _plots.FirstOrDefault(Function(one) Not one.PerSeries)
            If common Is Nothing Then common = _plots.FirstOrDefault()
            If common Is Nothing Then Return
            Dim x = If(Double.IsNaN(cursor.X), common.XRange.Mid, cursor.X)
            Dim amount = SampleStep(traces(_selectedTrace).Data, x, common.XRange)
            If e.Key = Key.Right Then
                cursor.X = x + amount
            Else
                cursor.X = x - amount
            End If
            ' The first keyboard move also places the line that the mouse has not touched yet — but a
            ' FOLLOWING cursor has no Y of its own, so nothing is written for it.
            If Not cursor.FollowTrace AndAlso Double.IsNaN(cursor.Y) Then cursor.Y = common.YRange.Mid
            _selectedCursor = index
            Focus()
            InvalidateVisual()
            e.Handled = True
        End Sub

        ' ---- live update ----------------------------------------------------------------------

        Private _watcher As FileSystemWatcher
        Private _debounce As DispatcherTimer

        Protected Overrides Sub OnAttachedToVisualTree(e As VisualTreeAttachmentEventArgs)
            MyBase.OnAttachedToVisualTree(e)
            RestartWatcher()
        End Sub

        Protected Overrides Sub OnDetachedFromVisualTree(e As VisualTreeAttachmentEventArgs)
            StopWatcher()
            ' A chart that leaves the tree must not keep its container's layout event alive.
            If _fillHost IsNot Nothing Then
                RemoveHandler _fillHost.LayoutUpdated, AddressOf OnFillHostLaidOut
                _fillHost = Nothing
            End If
            MyBase.OnDetachedFromVisualTree(e)
        End Sub

        Private Sub RestartWatcher()
            StopWatcher()
            Dim file = SourceFile
            If Not LiveUpdate OrElse String.IsNullOrWhiteSpace(file) Then Return

            Try
                Dim full = Path.GetFullPath(file)
                Dim folder = Path.GetDirectoryName(full)
                If String.IsNullOrEmpty(folder) OrElse Not Directory.Exists(folder) Then Return

                ' Editors save by writing a temp file and renaming it over the original, so watch the
                ' FOLDER for the file name rather than the file handle itself.
                _watcher = New FileSystemWatcher(folder, Path.GetFileName(full)) With {
                    .NotifyFilter = NotifyFilters.LastWrite Or NotifyFilters.Size Or NotifyFilters.FileName Or NotifyFilters.CreationTime,
                    .EnableRaisingEvents = True
                }
                AddHandler _watcher.Changed, AddressOf OnFileChanged
                AddHandler _watcher.Created, AddressOf OnFileChanged
                AddHandler _watcher.Renamed, AddressOf OnFileChanged
            Catch
                _watcher = Nothing
            End Try
        End Sub

        Private Sub OnFileChanged(sender As Object, e As FileSystemEventArgs)
            ' A save is not one event — debounce so the file is fully written before re-reading it.
            Dispatcher.UIThread.Post(
                Sub()
                    If _debounce Is Nothing Then
                        _debounce = New DispatcherTimer(TimeSpan.FromMilliseconds(400), DispatcherPriority.Background,
                                                        Sub(s, args)
                                                            _debounce.Stop()
                                                            InvalidateCache()
                                                        End Sub)
                    End If
                    _debounce.Stop()
                    _debounce.Start()
                End Sub)
        End Sub

        Private Sub StopWatcher()
            If _watcher IsNot Nothing Then
                Try
                    _watcher.EnableRaisingEvents = False
                    RemoveHandler _watcher.Changed, AddressOf OnFileChanged
                    RemoveHandler _watcher.Created, AddressOf OnFileChanged
                    RemoveHandler _watcher.Renamed, AddressOf OnFileChanged
                    _watcher.Dispose()
                Catch
                    ' A watcher that fails to dispose must never take the form down with it.
                End Try
                _watcher = Nothing
            End If
            If _debounce IsNot Nothing Then _debounce.Stop()
        End Sub

        ' ---- drawing --------------------------------------------------------------------------

        ''' <summary>The plot rectangle of the last render, so a dragged cursor can be converted back
        ''' into data units with the same mapping the renderer used.</summary>
        Private _plotRect As Rect
        ''' <summary>The series of the last render (the input handlers read the same data the picture
        ''' shows, without re-reading the workbook).</summary>
        Private _plots As New List(Of Plot)()
        Private ReadOnly _legend As New List(Of LegendEntry)()
        ''' <summary>The bar's rectangle, in CONTROL coordinates. A range legend (the surface chart's) lays
        ''' its sliders out straight into it; the entry list above is measured in local coordinates instead and
        ''' is translated by it in DrawLegend.</summary>
        Friend _legendRect As Rect

        ''' <summary>One entry of the legend bar: the series it switches, and where it sits.</summary>
        Private NotInheritable Class LegendEntry
            Friend Series As ChartSeries
            Friend Text As FormattedText
            Friend LineColor As Color
            ''' <summary>The whole clickable item (tick box + name), in control coordinates.</summary>
            Friend Hit As Rect
            ''' <summary>The tick box on its own.</summary>
            Friend Box As Rect
        End Class

        ''' <summary>One legend row's items. (The C# twin uses tuples here; Visual Basic has no
        ''' For-Each deconstruction, so the twins carry a tiny class instead.)</summary>
        Private NotInheritable Class LegendCell
            Friend Plot As Plot
            Friend Text As FormattedText
        End Class

        ''' <summary>True when this chart's legend is not a list of series at all but a RANGE SELECTOR: the
        ''' surface chart, whose legend picks the part of the sheet to draw. Such a bar lists no names — it is
        ''' two sliders and nothing else (2026-09-23).</summary>
        Friend Overridable ReadOnly Property IsRangeLegend As Boolean
            Get
                Return False
            End Get
        End Property

        ''' <summary>The size a range legend asks for: a couple of slider rows, not a wrapped list.</summary>
        Friend Overridable Function MeasureRangeLegend(frameSize As Size) As Size
            Return New Size(0, 0)
        End Function

        ''' <summary>Draws the range legend, laid out straight into <see cref="_legendRect"/>.</summary>
        Friend Overridable Sub DrawRangeLegend(context As DrawingContext)
        End Sub

        ''' <summary>
        ''' The positions a range slider may land on when its axis is made of DISCRETE samples rather than a
        ''' continuous span, in order — empty for an axis that is continuous. The surface answers with its
        ''' slice positions, so its own slider walks SLICE BY SLICE and says how many of them are shown,
        ''' instead of leaving a range like "0 … 9" of a 0 … 270 sheet to mean whatever fraction that is.
        ''' </summary>
        Friend Overridable Function RangeSteps(axis As Integer) As IReadOnlyList(Of Double)
            Return Array.Empty(Of Double)()
        End Function

        ''' <summary>The name a series shows in the legend: its own Title, else the spreadsheet's
        ''' Y-column header, else "Series n".</summary>
        Friend Function LegendName(one As Plot, index As Integer) As String
            If one.Definition IsNot Nothing AndAlso Not String.IsNullOrWhiteSpace(one.Definition.Title) Then
                Return one.Definition.Title
            End If
            If Not String.IsNullOrWhiteSpace(one.Data.YTitle) Then Return one.Data.YTitle
            Dim typed = If(one.Definition Is Nothing, InlineLegendName(index), String.Empty)
            Return If(typed.Length > 0, typed, $"Series {index + 1}")
        End Function

        ''' <summary>
        ''' What a slice typed in through SampleSets is called in the legend — an EMPTY string for every
        ''' chart that draws typed-in values as one unnamed line (the line, bar, area and pie family: there
        ''' is nothing to name and nothing to switch off, so they list nothing). A chart whose slices ARE the
        ''' sets names them, so a surface or a waterfall sketched from typed-in numbers still gets its legend.
        ''' </summary>
        Friend Overridable Function InlineLegendName(index As Integer) As String
            Return String.Empty
        End Function

        ''' <summary>
        ''' Lays the legend out and returns the size it needs, so the plot can give up that much room. A
        ''' Top/Bottom bar spans the chart's width and wraps onto further ROWS; a Left/Right bar fills the
        ''' chart's height and wraps onto further COLUMNS. Either way the bar grows to fit its list instead
        ''' of running off the chart, and it keeps the plot at least 40% of the frame. Returns an empty
        ''' size when there is nothing to list: a chart without series elements draws one unnamed line, and
        ''' there is nothing to name or switch off.
        ''' </summary>
        Private Function MeasureLegend(frameSize As Size, plots As List(Of Plot)) As Size
            _legend.Clear()
            ' The plots are what the legend lists, not the form's series elements: a pie has no series
            ' but its slices still need a legend.
            If Not ShowLegend OrElse plots.Count = 0 Then Return New Size(0, 0)
            ' A range legend is a fixed pair of sliders: it has no entries to flow, and its size does not
            ' depend on how many slices there are.
            If IsRangeLegend Then Return MeasureRangeLegend(frameSize)

            Const boxSize As Double = 13, boxGap As Double = 6, itemGap As Double = 16, lineGap As Double = 4
            ' The bar's own padding, plus whatever the user asked for: LegendMargin is the space between
            ' the frame and the entries (top, bottom and both sides), so 0 reproduces the old look exactly.
            Dim pad As Double = 4 + Math.Max(0, LegendMargin)
            Dim font = Math.Max(6, LegendFontSize)
            Dim vertical = LegendPosition = LegendPosition.Left OrElse LegendPosition = LegendPosition.Right
            Dim available = If(vertical, frameSize.Height, frameSize.Width)
            ' Wrap once the entries fill 60% of the frame's own axis; whatever does not fit is clipped
            ' by the bar (the plot is never squeezed out of existence).
            Dim limit = Math.Max(24, available * 0.6 - pad * 2)

            Dim items As New List(Of LegendCell)()
            For i = 0 To plots.Count - 1
                Dim one = plots(i)
                ' A plot with no series element is a slice typed in through SampleSets. It is listed only
                ' when this chart NAMES such slices (InlineLegendName) and there is data to draw — otherwise
                ' the legend would offer entries that name nothing and toggle nothing.
                If one.Definition Is Nothing AndAlso (InlineLegendName(i).Length = 0 OrElse Not one.Data.HasData) Then Continue For
                items.Add(New LegendCell With {
                    .Plot = one,
                    .Text = MakeText(LegendName(one, i), font, one.LineColor)
                })
            Next
            If items.Count = 0 Then Return New Size(0, 0)

            ' Flow the entries, keeping the layout in LOCAL coordinates: Render translates it into
            ' _legendRect once it knows which side the bar lands on.
            Dim x As Double = pad, y As Double = pad, lineExtent As Double = 0
            For Each cell In items
                Dim itemW = boxSize + boxGap + cell.Text.Width
                Dim itemH = Math.Max(boxSize, cell.Text.Height)
                If vertical Then
                    If y > pad AndAlso y + itemH > limit Then
                        x += lineExtent + itemGap
                        y = pad
                        lineExtent = 0
                    End If
                    _legend.Add(New LegendEntry With {
                        .Series = cell.Plot.Definition,
                        .Text = cell.Text,
                        .LineColor = cell.Plot.LineColor,
                        .Hit = New Rect(x, y, itemW, itemH),
                        .Box = New Rect(x, y + (itemH - boxSize) / 2, boxSize, boxSize)
                    })
                    y += itemH + lineGap
                    lineExtent = Math.Max(lineExtent, itemW)
                Else
                    If x > pad AndAlso x + itemW > limit Then
                        y += lineExtent + lineGap
                        x = pad
                        lineExtent = 0
                    End If
                    _legend.Add(New LegendEntry With {
                        .Series = cell.Plot.Definition,
                        .Text = cell.Text,
                        .LineColor = cell.Plot.LineColor,
                        .Hit = New Rect(x, y, itemW, itemH),
                        .Box = New Rect(x, y + (itemH - boxSize) / 2, boxSize, boxSize)
                    })
                    x += itemW + itemGap
                    lineExtent = Math.Max(lineExtent, itemH)
                End If
            Next

            ' The size the bar asks for: the wrap direction needs it, the other direction spans the frame.
            Dim contentW = pad * 2 + If(vertical, x + lineExtent - pad, Math.Min(x - itemGap, limit))
            Dim contentH = pad * 2 + If(vertical, Math.Min(y - lineGap, limit), y + lineExtent - pad)
            If vertical Then
                Return New Size(Math.Min(contentW, available * 0.6), contentH)
            End If
            Return New Size(contentW, Math.Min(contentH, available * 0.6))
        End Function

        ''' <summary>Draws the legend bar: the tick box for each series (ticked when its trace is on)
        ''' and its name, in the series' own colour.</summary>
        Private Sub DrawLegend(context As DrawingContext)
            ' A range legend has no ENTRIES at all — its sliders are the whole bar — so it must not be
            ' skipped by the empty-list guard the entry legend uses.
            If _legend.Count = 0 AndAlso Not IsRangeLegend Then Return
            ' The entries were measured in local coordinates; the bar is anchored to the frame's bottom.
            For i = 0 To _legend.Count - 1
                Dim entry = _legend(i)
                entry.Hit = New Rect(entry.Hit.X + _legendRect.X, entry.Hit.Y + _legendRect.Y,
                                      entry.Hit.Width, entry.Hit.Height)
                entry.Box = New Rect(entry.Box.X + _legendRect.X, entry.Box.Y + _legendRect.Y,
                                     entry.Box.Width, entry.Box.Height)
            Next

            Using context.PushClip(_legendRect)
                If LegendShowFrame Then
                    ' The frame: the bar's backcolour (Transparent leaves the plate showing) plus the
                    ' rounded outline.
                    Dim fill As New SolidColorBrush(LegendBackColor)
                    Dim outline As IPen = Nothing
                    If LegendBorderThickness > 0 Then outline = MakePen(LegendBorderBrush, LegendBorderThickness, ChartLineStyle.Solid)
                    context.DrawRectangle(fill, outline, New RoundedRect(_legendRect, LegendCornerRadius))
                End If
                ' A range legend draws its sliders and stops: the bar it lives in is the whole legend.
                If IsRangeLegend Then
                    DrawRangeLegend(context)
                    Return
                End If
                Dim framePen = MakePen(Color.Parse("#9AA0A6"), 1, ChartLineStyle.Solid)
                For Each entry In _legend
                    If entry.Series IsNot Nothing Then
                        context.DrawRectangle(Nothing, framePen, New RoundedRect(entry.Box, New Avalonia.CornerRadius(2)))
                        If entry.Series.Visible Then
                            ' A tick in the series' own colour, so a ticked box matches its line exactly.
                            Dim tick = MakePen(entry.LineColor, 2, ChartLineStyle.Solid)
                            Dim b = entry.Box
                            context.DrawLine(tick,
                                New Point(b.X + b.Width * 0.2, b.Y + b.Height * 0.55),
                                New Point(b.X + b.Width * 0.42, b.Y + b.Height * 0.78))
                            context.DrawLine(tick,
                                New Point(b.X + b.Width * 0.42, b.Y + b.Height * 0.78),
                                New Point(b.X + b.Width * 0.8, b.Y + b.Height * 0.22))
                        End If
                    End If
                    ' A typed-in slice has no box: the name (in its own colour) is the whole entry.
                    context.DrawText(entry.Text, New Point(entry.Box.Right + 6, entry.Hit.Y + (entry.Hit.Height - entry.Text.Height) / 2))
                Next
            End Using
        End Sub

        Public Overrides Sub Render(context As DrawingContext)
            Dim size = Bounds.Size
            If size.Width < 8 OrElse size.Height < 8 Then Return

            Dim frameWidth = If(ShowBorder, Math.Max(0, BorderThickness), 0)
            Dim frame = New Rect(size).Deflate(frameWidth / 2)
            Dim radius = CornerRadius

            ' Padding: the breathing room the user asked for between the border and everything the chart
            ' draws inside it. Clamped at 0 so a negative value cannot push the content over the border;
            ' 0 (the default) leaves the legend and the plot exactly where they have always been. The
            ' plate and the border itself stay on the frame - only what is drawn ON the plate moves in.
            Dim pad As New Thickness(Math.Max(0, Padding.Left), Math.Max(0, Padding.Top),
                                     Math.Max(0, Padding.Right), Math.Max(0, Padding.Bottom))
            Dim content = frame.Deflate(pad)

            ' The chart's OWN plate comes first, filling the whole interior - not just the plot area,
            ' so the title and the axis labels sit on the chart's colour, not on the form's. A gradient
            ' brush, when one is set, takes the plate's place and covers exactly the same area.
            Dim opacity = Math.Clamp(PlotBackOpacity, 0, 100) / 100.0
            Dim plate As Brush = If(PlotBackBrush, CType(New SolidColorBrush(PlotBackColor, opacity), Brush))
            context.DrawRectangle(plate, Nothing, New RoundedRect(frame, radius))

            Dim plots = BuildPlots()
            _plots = plots
            _lastPlotCount = plots.Where(Function(p) p.Data.HasData).Count()
            Dim withError = plots.FirstOrDefault(Function(p) p.Data.Error IsNot Nothing)
            Dim seriesError = If(withError IsNot Nothing, withError.Data.Error, Nothing)

            Dim wantTitle = ShowTitle AndAlso Not String.IsNullOrWhiteSpace(Title)
            Dim titleText As FormattedText = Nothing
            If wantTitle Then titleText = MakeText(Title, TitleFontSize, TitleColor)

            ' Work out the plot rectangle: the content, minus the breathing room, minus the title and
            ' the axis furniture around it.
            Dim plotRect = content.Deflate(8)
            If titleText IsNot Nothing Then
                Dim strip = titleText.Height + 6
                Select Case TitlePosition
                    Case ChartTitlePosition.Top
                        plotRect = Chop(plotRect, 0, strip, 0, 0)
                    Case ChartTitlePosition.Bottom
                        plotRect = Chop(plotRect, 0, 0, 0, strip)
                    Case ChartTitlePosition.Left
                        plotRect = Chop(plotRect, strip, 0, 0, 0)
                    Case Else
                        plotRect = Chop(plotRect, 0, 0, strip, 0)
                End Select
            End If

            ' The legend bar runs along the side it is set to and takes its size off the plot: entries
            ' flow across (Top/Bottom) or down (Left/Right) and WRAP, so the bar grows to fit its list.
            Dim legendSize = MeasureLegend(content.Size, plots)
            If legendSize.Width > 0 AndAlso legendSize.Height > 0 Then
                Select Case LegendPosition
                    Case LegendPosition.Top
                        _legendRect = New Rect(content.X, content.Y, content.Width, legendSize.Height)
                        plotRect = Chop(plotRect, 0, legendSize.Height + 4, 0, 0)
                    Case LegendPosition.Left
                        _legendRect = New Rect(content.X, content.Y, legendSize.Width, content.Height)
                        plotRect = Chop(plotRect, legendSize.Width + 4, 0, 0, 0)
                    Case LegendPosition.Right
                        _legendRect = New Rect(content.Right - legendSize.Width, content.Y, legendSize.Width, content.Height)
                        plotRect = Chop(plotRect, 0, 0, legendSize.Width + 4, 0)
                    Case Else
                        _legendRect = New Rect(content.X, content.Bottom - legendSize.Height, content.Width, legendSize.Height)
                        plotRect = Chop(plotRect, 0, 0, 0, legendSize.Height + 4)
                End Select
            End If

            Dim commonPlot = plots.FirstOrDefault(Function(p) Not p.PerSeries)
            If commonPlot Is Nothing Then commonPlot = plots.FirstOrDefault()
            If commonPlot Is Nothing Then
                DrawFrame(context, frame, radius, frameWidth)
                DrawTitle(context, titleText, plotRect, content)
                DrawLegend(context)
                DrawMessage(context, plotRect, Nothing)
                Return
            End If

            ' The common axis: an Axis object from the XAML, or one built from the chart-level (legacy)
            ' axis properties. An axis carries its own side, ticks, label size and name, so the
            ' gutters follow the axes instead of one fixed layout.
            Dim commonY = CommonYAxis()
            Dim commonX = CommonXAxis()
            Dim yOnRight = commonY.Position = AxisPosition.Right
            Dim xOnTop = commonX.Position = AxisPosition.Top

            ' Per-series axes need their own gutters, so several scales can live side by side: every
            ' axis on a side takes one strip, and they stack outward from the plot edge.
            Dim perSeries = plots.Where(Function(p) p.PerSeries).ToList()
            Dim leftBlocks = perSeries.Where(Function(p) p.YAxis IsNot Nothing AndAlso p.YAxis.Position <> AxisPosition.Right).ToList()
            Dim rightBlocks = perSeries.Where(Function(p) p.YAxis IsNot Nothing AndAlso p.YAxis.Position = AxisPosition.Right).ToList()
            Dim topBlocks = perSeries.Where(Function(p) p.XAxis IsNot Nothing AndAlso p.XAxis.Position = AxisPosition.Top).ToList()
            Dim bottomBlocks = perSeries.Where(Function(p) p.XAxis IsNot Nothing AndAlso p.XAxis.Position <> AxisPosition.Top).ToList()

            Dim commonYWidth = YBlockWidth(commonY, commonPlot.YRange, YAxisTitle, commonPlot.Data.YTitle)
            Dim commonXHeight = XBlockHeight(commonX, commonPlot.XRange, XAxisTitle, commonPlot.Data.XTitle)
            Dim leftBlocksWidth As Double = 0
            Dim rightBlocksWidth As Double = 0
            Dim topBlocksHeight As Double = 0
            Dim bottomBlocksHeight As Double = 0
            For Each one In leftBlocks
                leftBlocksWidth += YBlockWidth(one.YAxis, one.YRange, Nothing, one.Data.YTitle)
            Next
            For Each one In rightBlocks
                rightBlocksWidth += YBlockWidth(one.YAxis, one.YRange, Nothing, one.Data.YTitle)
            Next
            For Each one In topBlocks
                topBlocksHeight += XBlockHeight(one.XAxis, one.XRange, Nothing, one.Data.XTitle)
            Next
            For Each one In bottomBlocks
                bottomBlocksHeight += XBlockHeight(one.XAxis, one.XRange, Nothing, one.Data.XTitle)
            Next

            Dim leftGutter As Double = If(yOnRight, 0, commonYWidth) + leftBlocksWidth
            Dim rightGutter As Double = If(yOnRight, commonYWidth, 0) + rightBlocksWidth
            Dim topGutter As Double = If(xOnTop, commonXHeight, 0) + topBlocksHeight
            Dim bottomGutter As Double = If(xOnTop, 0, commonXHeight) + bottomBlocksHeight
            plotRect = Chop(plotRect, leftGutter, topGutter, rightGutter, bottomGutter)
            If plotRect.Width <= 4 OrElse plotRect.Height <= 4 Then Return
            _plotRect = plotRect

            ' Plot-area fill (same colour as the plate, drawn explicitly so the plot can later carry
            ' its own tint without touching the rest of the chart).
            ' Plot-area fill (same colour as the plate, drawn explicitly so the plot can later carry
            ' its own tint without touching the rest of the chart). With a brush the plate has already
            ' painted this area: re-painting the smaller rect would re-map a gradient onto it.
            If PlotBackBrush Is Nothing Then context.DrawRectangle(plate, Nothing, plotRect)

            If _lastPlotCount = 0 Then
                ' Nothing is drawn, so nothing can be under the pointer: a readout left over from before
                ' the data went away would otherwise hang on screen over an empty chart.
                ClearHover()
                Hover = Nothing
                DrawFrame(context, frame, radius, frameWidth)
                DrawTitle(context, titleText, plotRect, content)
                DrawLegend(context)
                DrawMessage(context, plotRect, seriesError)
                Return
            End If

            ' Gridlines, then the common axis with its ticks and labels.
            If ShowGrid AndAlso HasCartesianAxes Then
                Dim gridPen = MakePen(GridColor, GridThickness, GridStyle)
                For Each tick In commonPlot.XRange.Ticks()
                    Dim x = commonPlot.XRange.ToPixel(tick, plotRect.X, plotRect.Width)
                    context.DrawLine(gridPen, New Point(x, plotRect.Y), New Point(x, plotRect.Bottom))
                Next
                For Each tick In commonPlot.YRange.Ticks()
                    Dim y = commonPlot.YRange.ToPixel(tick, plotRect.Bottom, -plotRect.Height)
                    context.DrawLine(gridPen, New Point(plotRect.X, y), New Point(plotRect.Right, y))
                Next
            End If

            ' The common axis hugs the plot edge; each per-series axis takes the next strip outward on
            ' its own side, so two scales on the same side never draw over each other.
            DrawYAxis(context, plotRect, commonPlot.YRange, commonY, yOnRight, 0,
                      TickLabels(commonY, commonPlot.YRange), AxisName(commonY, YAxisTitle, commonPlot.Data.YTitle))
            DrawXAxis(context, plotRect, commonPlot.XRange, commonX, xOnTop, 0,
                      TickLabels(commonX, commonPlot.XRange, XNames(commonPlot.Data)), AxisName(commonX, XAxisTitle, commonPlot.Data.XTitle))

            Dim leftUsed As Double = If(yOnRight, 0, commonYWidth)
            Dim rightUsed As Double = If(yOnRight, commonYWidth, 0)
            Dim topUsed As Double = If(xOnTop, commonXHeight, 0)
            Dim bottomUsed As Double = If(xOnTop, 0, commonXHeight)

            For Each one In leftBlocks
                DrawYAxis(context, plotRect, one.YRange, one.YAxis, False, leftUsed,
                          TickLabels(one.YAxis, one.YRange), AxisName(one.YAxis, Nothing, one.Data.YTitle))
                leftUsed += YBlockWidth(one.YAxis, one.YRange, Nothing, one.Data.YTitle)
            Next
            For Each one In rightBlocks
                DrawYAxis(context, plotRect, one.YRange, one.YAxis, True, rightUsed,
                          TickLabels(one.YAxis, one.YRange), AxisName(one.YAxis, Nothing, one.Data.YTitle))
                rightUsed += YBlockWidth(one.YAxis, one.YRange, Nothing, one.Data.YTitle)
            Next
            For Each one In topBlocks
                DrawXAxis(context, plotRect, one.XRange, one.XAxis, True, topUsed,
                          TickLabels(one.XAxis, one.XRange, XNames(one.Data)), AxisName(one.XAxis, Nothing, one.Data.XTitle))
                topUsed += XBlockHeight(one.XAxis, one.XRange, Nothing, one.Data.XTitle)
            Next
            For Each one In bottomBlocks
                DrawXAxis(context, plotRect, one.XRange, one.XAxis, False, bottomUsed,
                          TickLabels(one.XAxis, one.XRange, XNames(one.Data)), AxisName(one.XAxis, Nothing, one.Data.XTitle))
                bottomUsed += XBlockHeight(one.XAxis, one.XRange, Nothing, one.Data.XTitle)
            Next

            ' The data itself, in order, clipped to the plot area. HOW it is drawn is the chart type's
            ' business: a line joins its points, a bar stands a rectangle at each one, an area fills the
            ' space under the line and a pie cuts a wedge for each value.
            Using context.PushClip(plotRect)
                DrawSeriesLayer(context, plots, plotRect)
            End Using

            ' The cursors sit on top of the data, and their readout on top of that, so a cursor is never
            ' buried by a line that happens to cross it.
            If SupportsCursors Then DrawCursors(context, plotRect, plots)

            ' Frame + title last, so nothing can overdraw them.
            DrawFrame(context, frame, radius, frameWidth)
            DrawTitle(context, titleText, plotRect, content)
            DrawLegend(context)

            ' And then the readout of whatever the pointer is over (a bar, a slice), because that is a
            ' tooltip: it belongs on top of everything the chart itself drew.
            If SupportsHoverReadout Then DrawHoverReadout(context, plotRect)
        End Sub

        ''' <summary>
        ''' Draws the data itself: the LINE chart's series, one after another. A chart type with another
        ''' shape overrides this (a bar stands rectangles, an area fills under the line, a pie cuts
        ''' wedges) while everything around it — the plate, the frame, the grid, the axes, the legend, the
        ''' title and the cursors — stays the same.
        ''' </summary>
        Friend Overridable Sub DrawSeriesLayer(context As DrawingContext, plots As List(Of Plot), plot As Rect)
            For Each one In plots
                If Not one.Data.HasData OrElse Not one.Visible Then Continue For
                Dim dataPoints = SeriesPoints(one, plot)

                If one.Connected AndAlso dataPoints.Length > 1 Then
                    Dim pen = MakePen(one.LineColor, one.LineThickness, one.LineStyle)
                    For i = 1 To dataPoints.Length - 1
                        context.DrawLine(pen, dataPoints(i - 1), dataPoints(i))
                    Next
                End If
                DrawMarkers(context, dataPoints, one)
            Next
        End Sub

        ''' <summary>The tick label texts of an axis (empty when it draws no labels). When NAMES are given
        ''' the axis is a list of CATEGORIES, so each tick is labelled with the name of the point it
        ''' sits on instead of the number.</summary>
        Private Shared Function TickLabels(axis As Axis, range As AxisRange, Optional names As String() = Nothing) As List(Of String)
            If Not axis.ShowTickLabels Then Return New List(Of String)()
            If names Is Nothing OrElse names.Length = 0 Then
                Return range.Ticks().Select(Function(v) FormatNumber(v, range.TickStep)).ToList()
            End If
            Return range.Ticks().Select(
                Function(v)
                    ' A named axis keeps its number when the name is missing, so a partially labelled
                    ' sheet still reads.
                    Dim index = CInt(Math.Round(v))
                    Return If(index >= 0 AndAlso index < names.Length AndAlso Not String.IsNullOrWhiteSpace(names(index)),
                              names(index), FormatNumber(v, range.TickStep))
                End Function).ToList()
        End Function

        ''' <summary>An axis' name text: its own Name, else the chart-level title, else the spreadsheet's
        ''' column header. Nothing when this axis draws no name.</summary>
        Private Function AxisName(axis As Axis, chartTitle As String, fromSheet As String) As FormattedText
            If Not axis.ShowAxisName Then Return Nothing
            Dim text = If(Not String.IsNullOrWhiteSpace(axis.Name), axis.Name,
                          If(Not String.IsNullOrWhiteSpace(chartTitle), chartTitle, fromSheet))
            If String.IsNullOrWhiteSpace(text) Then Return Nothing
            Return MakeText(text, axis.TickLabelFontSize, axis.AxisNameColor)
        End Function

        ''' <summary>The gutter width one Y axis occupies: its tick overhang, its labels and its name.</summary>
        Private Function YBlockWidth(axis As Axis, range As AxisRange, chartTitle As String, fromSheet As String) As Double
            If axis Is Nothing Then Return 0
            Dim tickOut As Double = 0
            If axis.ShowAxis AndAlso axis.ShowMajorTicks Then tickOut = Math.Max(0, axis.MajorTickLength)
            Dim widest As Double = 0
            For Each label In TickLabels(axis, range)
                widest = Math.Max(widest, MakeText(label, axis.TickLabelFontSize, axis.LabelColor).Width)
            Next
            Dim name = AxisName(axis, chartTitle, fromSheet)
            Return 4 + tickOut + widest + (If(name Is Nothing, 0, name.Height + 6))
        End Function

        ''' <summary>The gutter height one X axis occupies: its tick overhang, its labels and its name.</summary>
        Private Function XBlockHeight(axis As Axis, range As AxisRange, chartTitle As String, fromSheet As String) As Double
            If axis Is Nothing Then Return 0
            Dim tickOut As Double = 0
            If axis.ShowAxis AndAlso axis.ShowMajorTicks Then tickOut = Math.Max(0, axis.MajorTickLength)
            Dim labelHeight As Double = 0
            If TickLabels(axis, range).Count > 0 Then labelHeight = MakeText("0", axis.TickLabelFontSize, axis.LabelColor).Height
            Dim name = AxisName(axis, chartTitle, fromSheet)
            Return 4 + tickOut + labelHeight + (If(name Is Nothing, 0, name.Height + 6))
        End Function

        ''' <summary>Draws a Y axis: its line, ticks, labels and name, on the left or the right edge.
        ''' The offset moves it one strip further out, so axes on the same side stack.</summary>
        Private Sub DrawYAxis(context As DrawingContext, plotRect As Rect, range As AxisRange, axis As Axis,
                             isRight As Boolean, offset As Double, labels As List(Of String), name As FormattedText)
            Dim pen = MakePen(axis.AxisColor, 1, ChartLineStyle.Solid)
            Dim x = If(isRight, plotRect.Right + offset, plotRect.X - offset)
            Dim tickOut As Double = 0
            If axis.ShowMajorTicks Then tickOut = Math.Max(0, axis.MajorTickLength)
            Dim direction = If(isRight, 1, -1)

            If axis.ShowAxis Then
                context.DrawLine(pen, New Point(x, plotRect.Y), New Point(x, plotRect.Bottom))
            End If
            If axis.ShowAxis AndAlso axis.ShowMinorTicks AndAlso axis.MinorTickLength > 0 Then
                For Each tick In range.MinorTicks()
                    Dim y = range.ToPixel(tick, plotRect.Bottom, -plotRect.Height)
                    context.DrawLine(pen, New Point(x, y), New Point(x + direction * axis.MinorTickLength, y))
                Next
            End If
            If axis.ShowAxis AndAlso axis.ShowMajorTicks AndAlso axis.MajorTickLength > 0 Then
                For Each tick In range.Ticks()
                    Dim y = range.ToPixel(tick, plotRect.Bottom, -plotRect.Height)
                    context.DrawLine(pen, New Point(x, y), New Point(x + direction * axis.MajorTickLength, y))
                Next
            End If

            Dim widest As Double = 0
            Dim index As Integer = 0
            For Each tick In range.Ticks()
                Dim text = If(index < labels.Count, labels(index), FormatNumber(tick, range.TickStep))
                index += 1
                Dim label = MakeText(text, axis.TickLabelFontSize, axis.LabelColor)
                Dim y = range.ToPixel(tick, plotRect.Bottom, -plotRect.Height) - label.Height / 2
                Dim textX = If(isRight, x + tickOut + 2, x - tickOut - 2 - label.Width)
                If axis.ShowTickLabels Then context.DrawText(label, New Point(textX, y))
                widest = Math.Max(widest, label.Width)
            Next

            If name IsNot Nothing Then
                Dim nameY = plotRect.Y + plotRect.Height / 2 + name.Width / 2
                Dim nameX = If(isRight, x + tickOut + 4 + widest + 2, x - tickOut - 4 - widest - 2 - name.Height)
                ' Rotate FIRST, then translate: Avalonia's matrices are row-vector, so they compose
                ' left-to-right. Getting this backwards draws the name above the control's own bounds.
                Using context.PushTransform(Matrix.CreateRotation(-Math.PI / 2) * Matrix.CreateTranslation(nameX, nameY))
                    context.DrawText(name, New Point(0, 0))
                End Using
            End If
        End Sub

        ''' <summary>Draws an X axis: its line, ticks, labels and name, at the top or the bottom edge.
        ''' The offset moves it one strip further out, so axes on the same side stack.</summary>
        Private Sub DrawXAxis(context As DrawingContext, plotRect As Rect, range As AxisRange, axis As Axis,
                             isTop As Boolean, offset As Double, labels As List(Of String), name As FormattedText)
            Dim pen = MakePen(axis.AxisColor, 1, ChartLineStyle.Solid)
            Dim y = If(isTop, plotRect.Y - offset, plotRect.Bottom + offset)
            Dim tickOut As Double = 0
            If axis.ShowMajorTicks Then tickOut = Math.Max(0, axis.MajorTickLength)
            Dim direction = If(isTop, -1, 1)

            If axis.ShowAxis Then
                context.DrawLine(pen, New Point(plotRect.X, y), New Point(plotRect.Right, y))
            End If
            If axis.ShowAxis AndAlso axis.ShowMinorTicks AndAlso axis.MinorTickLength > 0 Then
                For Each tick In range.MinorTicks()
                    Dim x = range.ToPixel(tick, plotRect.X, plotRect.Width)
                    context.DrawLine(pen, New Point(x, y), New Point(x, y + direction * axis.MinorTickLength))
                Next
            End If
            If axis.ShowAxis AndAlso axis.ShowMajorTicks AndAlso axis.MajorTickLength > 0 Then
                For Each tick In range.Ticks()
                    Dim x = range.ToPixel(tick, plotRect.X, plotRect.Width)
                    context.DrawLine(pen, New Point(x, y), New Point(x, y + direction * axis.MajorTickLength))
                Next
            End If

            Dim labelHeight = MakeText("0", axis.TickLabelFontSize, axis.LabelColor).Height
            Dim index As Integer = 0
            For Each tick In range.Ticks()
                Dim text = If(index < labels.Count, labels(index), FormatNumber(tick, range.TickStep))
                index += 1
                Dim label = MakeText(text, axis.TickLabelFontSize, axis.LabelColor)
                Dim x = range.ToPixel(tick, plotRect.X, plotRect.Width) - label.Width / 2
                Dim textY = If(isTop, y - tickOut - 2 - label.Height, y + tickOut + 2)
                If axis.ShowTickLabels Then context.DrawText(label, New Point(x, textY))
            Next

            If name IsNot Nothing Then
                Dim nameX = plotRect.X + (plotRect.Width - name.Width) / 2
                Dim nameY = If(isTop, y - tickOut - 2 - labelHeight - 2 - name.Height,
                                     y + tickOut + 2 + labelHeight + 2)
                context.DrawText(name, New Point(nameX, nameY))
            End If
        End Sub

        Private Protected Sub DrawMarkers(context As DrawingContext, dataPoints As Point(), one As Plot)
            If one.MarkerStyle = ChartMarkerStyle.None Then Return
            Dim size = Math.Max(2, one.MarkerSize)
            Dim brush As New SolidColorBrush(one.LineColor)
            Dim pen As New Pen(brush, 1)
            Dim half = size / 2
            For Each p In dataPoints
                Select Case one.MarkerStyle
                    Case ChartMarkerStyle.Dot
                        context.DrawEllipse(brush, Nothing, p, half, half)
                    Case ChartMarkerStyle.Cross
                        context.DrawLine(pen, New Point(p.X - half, p.Y - half), New Point(p.X + half, p.Y + half))
                        context.DrawLine(pen, New Point(p.X - half, p.Y + half), New Point(p.X + half, p.Y - half))
                    Case ChartMarkerStyle.Square
                        context.DrawRectangle(brush, Nothing, New Rect(p.X - half, p.Y - half, size, size))
                    Case ChartMarkerStyle.Diamond
                        Dim geometry As New StreamGeometry()
                        Using g = geometry.Open()
                            g.BeginFigure(New Point(p.X, p.Y - half), True)
                            g.LineTo(New Point(p.X + half, p.Y))
                            g.LineTo(New Point(p.X, p.Y + half))
                            g.LineTo(New Point(p.X - half, p.Y))
                            g.EndFigure(True)
                        End Using
                        context.DrawGeometry(brush, Nothing, geometry)
                End Select
            Next
        End Sub

        Private Sub DrawFrame(context As DrawingContext, frame As Rect, radius As Avalonia.CornerRadius, thickness As Double)
            If thickness <= 0 Then Return
            context.DrawRectangle(Nothing, New Pen(New SolidColorBrush(BorderBrush), thickness), New RoundedRect(frame, radius))
        End Sub

        ''' <summary>Draws the title in its strip: centred over the plot for Top/Bottom, rotated along the
        ''' inner edge of <paramref name="outer"/> for Left/Right. That rect is the chart's content - the
        ''' frame minus the Padding - so the padding pushes the title inwards along with the plot.</summary>
        Private Sub DrawTitle(context As DrawingContext, title As FormattedText, plotRect As Rect, outer As Rect)
            If title Is Nothing Then Return
            Select Case TitlePosition
                Case ChartTitlePosition.Top
                    context.DrawText(title, New Point(plotRect.X + (plotRect.Width - title.Width) / 2, outer.Y + 4))
                Case ChartTitlePosition.Bottom
                    context.DrawText(title, New Point(plotRect.X + (plotRect.Width - title.Width) / 2, plotRect.Bottom + 4))
                Case ChartTitlePosition.Left
                    Dim leftY = plotRect.Y + plotRect.Height / 2 + title.Width / 2
                    Using context.PushTransform(Matrix.CreateRotation(-Math.PI / 2) * Matrix.CreateTranslation(outer.X + 4, leftY))
                        context.DrawText(title, New Point(0, 0))
                    End Using
                Case ChartTitlePosition.Right
                    Dim rightY = plotRect.Y + plotRect.Height / 2 + title.Width / 2
                    Using context.PushTransform(Matrix.CreateRotation(-Math.PI / 2) * Matrix.CreateTranslation(outer.Right - 4 - title.Height, rightY))
                        context.DrawText(title, New Point(0, 0))
                    End Using
            End Select
        End Sub

        Private Sub DrawMessage(context As DrawingContext, plotRect As Rect, message As String)
            Dim text = If(String.IsNullOrWhiteSpace(message), "No data — right-click to choose a spreadsheet, or add a series", message)
            Dim brush = Color.Parse("#909090")
            Dim formatted = MakeText(text, 12, brush)
            If formatted.Width > plotRect.Width Then
                ' A long explanation (a full path, a reader exception) would otherwise be dropped
                ' whole and leave the chart looking broken — trim it to fit instead.
                Dim perChar = formatted.Width / Math.Max(1, text.Length)
                Dim maxChars = Math.Max(0, CInt(Math.Floor(plotRect.Width / perChar)) - 1)
                If maxChars < 8 Then Return   ' no room for anything readable
                Dim cut = text.Substring(0, Math.Min(text.Length, maxChars)).TrimEnd() & "…"
                formatted = MakeText(cut, 12, brush)
                While formatted.Width > plotRect.Width AndAlso cut.Length > 9
                    cut = cut.Substring(0, cut.Length - 2).TrimEnd() & "…"
                    formatted = MakeText(cut, 12, brush)
                End While
                If formatted.Width > plotRect.Width Then Return
            End If
            context.DrawText(formatted, New Point(plotRect.X + (plotRect.Width - formatted.Width) / 2,
                                                  plotRect.Y + (plotRect.Height - formatted.Height) / 2))
        End Sub

        ' ---- cursors --------------------------------------------------------------------------

        ''' <summary>The indexes of the cursors that are drawn: the first two of the chart, switched on.</summary>
        Private Function LiveCursorIndexes() As List(Of Integer)
            Dim live As New List(Of Integer)()
            For i = 0 To Math.Min(Cursors.Count, MaxCursors) - 1
                If Cursors(i).Enabled Then live.Add(i)
            Next
            Return live
        End Function

        ''' <summary>The series the cursor can read: the ones that are actually drawn.</summary>
        Private Shared Function VisiblePlots(plots As List(Of Plot)) As List(Of Plot)
            Return plots.Where(Function(one) one.Data.HasData AndAlso one.Visible).ToList()
        End Function

        ''' <summary>The trace the readout reports and a following cursor rides. Clamped, so the index
        ''' survives traces being switched off, and Nothing when the chart has nothing to show.</summary>
        Private Function SelectedTrace(traces As List(Of Plot)) As Plot
            If traces.Count = 0 Then Return Nothing
            _selectedTrace = Math.Clamp(_selectedTrace, 0, traces.Count - 1)
            Return traces(_selectedTrace)
        End Function

        ''' <summary>The colour a cursor draws in: the colour of the series it follows, when it follows
        ''' one — the line, the crossing and the readout are then unmistakably the trace they read — and
        ''' otherwise the cursor's own colour, which is what a free crosshair or a threshold wants.
        ''' A cursor only follows a trace while its FollowTrace is on, the same switch that decides
        ''' whether its horizontal line rides the trace.</summary>
        Private Shared Function CursorColor(cursor As ChartCursor, trace As Plot) As Color
            Return If(cursor.FollowTrace AndAlso trace IsNot Nothing, trace.LineColor, cursor.Color)
        End Function

        ''' <summary>Draws the cursors and their readout. A cursor is a crosshair the user drags: its
        ''' lines sit at its X and Y, the readout reports the selected trace where the cursor's X cuts
        ''' it, and the whole cursor is drawn in the colour of the series it follows. The clickable
        ''' parts are remembered while drawing, so a click always tests the picture that is on screen.</summary>
        Private Sub DrawCursors(context As DrawingContext, plot As Rect, plots As List(Of Plot))
            _cursorHits.Clear()
            Dim common = plots.FirstOrDefault(Function(one) Not one.PerSeries)
            If common Is Nothing Then common = plots.FirstOrDefault()
            If common Is Nothing Then Return

            Dim live = LiveCursorIndexes()
            ' The trace the readout reports — and the one a FOLLOWING cursor rides — is decided once, so
            ' the crossing point and the numbers can never disagree.
            Dim traces = VisiblePlots(plots)
            Dim trace = SelectedTrace(traces)
            For Each index In live
                Dim cursor = Cursors(index)
                Dim x = If(Double.IsNaN(cursor.X), common.XRange.Mid, cursor.X)
                ' Two values per cursor, and they are not the same thing:
                '   readoutY — what the readout shows (and what the two-cursor delta subtracts): the
                '              trace's value at the cursor's X, or the cursor's own Y with no trace.
                '   drawnY   — how high the horizontal line is drawn: the same value while the cursor
                '              follows its trace, but the cursor's own Y when it does not (a threshold).
                Dim readoutValue = If(trace Is Nothing, Nothing, ValueAt(trace.Data, x))
                Dim ownY = If(Double.IsNaN(cursor.Y), common.YRange.Mid, cursor.Y)
                Dim readoutY = If(readoutValue.HasValue, readoutValue.Value, ownY)
                Dim drawnY = If(cursor.FollowTrace AndAlso readoutValue.HasValue, readoutValue.Value, ownY)
                Dim y = drawnY
                Dim px = common.XRange.ToPixel(x, plot.X, plot.Width)
                Dim py = common.YRange.ToPixel(y, plot.Bottom, -plot.Height)
                Dim selected = index = _selectedCursor AndAlso live.Count > 1
                ' A cursor that follows a trace wears that trace's colour, so "which line is this?" is
                ' answered by looking at it; a free one keeps the colour it was given.
                Dim color = CursorColor(cursor, trace)
                Dim pen = MakeCursorPen(color, If(selected, 2.0, 1.0), cursor.Style)

                Dim hit As New CursorHit With {.Cursor = cursor, .Index = index, .X = x, .Y = readoutY, .DrawnColor = color}
                ' The crossing point is clamped into the plot, so a cursor parked outside the axis
                ' shows as a line along the edge instead of vanishing — and the lines are then inside
                ' the plot by construction, which is why they need no clip.
                Dim cx = Math.Clamp(px, plot.X, plot.Right)
                Dim cy = Math.Clamp(py, plot.Y, plot.Bottom)
                If cursor.Orientation <> CursorOrientation.Horizontal Then
                    context.DrawLine(pen, New Point(cx, plot.Y), New Point(cx, plot.Bottom))
                    hit.Vertical = New Rect(cx - CursorGrab, plot.Y, CursorGrab * 2, plot.Height)
                End If
                If cursor.Orientation <> CursorOrientation.Vertical Then
                    context.DrawLine(pen, New Point(plot.X, cy), New Point(plot.Right, cy))
                    hit.Horizontal = New Rect(plot.X, cy - CursorGrab, plot.Width, CursorGrab * 2)
                End If
                If cursor.Orientation = CursorOrientation.Both Then
                    context.DrawRectangle(New SolidColorBrush(color), Nothing, New Rect(cx - 3, cy - 3, 6, 6))
                    hit.Handle = New Rect(cx - CursorGrab, cy - CursorGrab, CursorGrab * 2, CursorGrab * 2)
                End If
                _cursorHits.Add(hit)
            Next

            DrawCursorReadout(context, plot, plots, common)
        End Sub

        ''' <summary>Draws the readout of the selected cursor: the tag (C1/C2), the name of the trace it
        ''' reports — in that trace's colour — and the values, in the cursor's own drawn colour (the
        ''' followed series' colour for a following cursor). The columns follow the cursor's own X/Y
        ''' Values switches. It follows the mouse or sits in the top right corner; with no mouse (in the
        ''' designer) it is drawn in that corner too, so it can always be seen.</summary>
        Private Sub DrawCursorReadout(context As DrawingContext, plot As Rect, plots As List(Of Plot), common As Plot)
            _readoutText = String.Empty
            Dim live = LiveCursorIndexes()
            If live.Count = 0 Then Return
            Dim index = If(live.Contains(_selectedCursor), _selectedCursor, live(0))
            Dim cursor = Cursors(index)

            Dim traces = VisiblePlots(plots)
            If traces.Count = 0 Then Return
            Dim trace = SelectedTrace(traces)
            If trace Is Nothing Then Return
            Dim x = If(Double.IsNaN(cursor.X), common.XRange.Mid, cursor.X)
            ' The SAME values the crossing was drawn from (see DrawCursors), so the numbers and the
            ' handle always agree.
            Dim value = ValueAt(trace.Data, x)

            ' The marker on the trace itself ties the numbers to the line they came from.
            If value.HasValue Then
                Dim tx = common.XRange.ToPixel(x, plot.X, plot.Width)
                Dim ty = trace.YRange.ToPixel(value.Value, plot.Bottom, -plot.Height)
                Using context.PushClip(plot)
                    context.DrawEllipse(New SolidColorBrush(trace.LineColor), Nothing, New Point(tx, ty), 3.5, 3.5)
                End Using
            End If

            ' With TWO cursors on the chart the panel also reports the distance between them, as plain
            ' absolute differences: |X1 - X2| and |Y1 - Y2|, from the values each cursor's own readout
            ' line shows. Drawn in the OTHER cursor's colour, because it is the pair that it describes,
            ' and only while both are switched on.
            Dim delta As String = Nothing
            ' The panel belongs to the cursor beside it, so it is drawn in the colour that cursor was
            ' drawn in — inherited from the series it follows, or its own when it does not.
            Dim ownHit = _cursorHits.FirstOrDefault(Function(one) one.Index = index)
            Dim color = If(ownHit Is Nothing, CursorColor(cursor, trace), ownHit.DrawnColor)
            Dim deltaColor = color
            If _cursorHits.Count >= 2 Then
                Dim first = _cursorHits(0)
                Dim second = _cursorHits(1)
                delta = "ΔX " & FormatCursor(Math.Abs(first.X - second.X)) &
                        "   ΔY " & FormatCursor(Math.Abs(first.Y - second.Y))
                deltaColor = If(first.Index = index, second.DrawnColor, first.DrawnColor)
            End If

            Dim parts As New List(Of String)()
            If cursor.XValues Then parts.Add("X " & FormatCursor(x))
            If cursor.YValues Then parts.Add("Y " & If(value.HasValue, FormatCursor(value.Value), "–"))
            Dim name = LegendName(trace, plots.IndexOf(trace))
            Dim tag = "C" & (index + 1)

            ' The panel's TEXT is a fixed palette: the head line keeps its own colour (that trace's, for a
            ' cursor), the numbers are always white and the plate is always black.
            _readoutText = tag & " " & name & If(parts.Count > 0, ": " & String.Join(", ", parts), String.Empty) &
                           If(delta Is Nothing, String.Empty, " | " & delta)
            DrawReadoutPanel(context, plot,
                             New ReadoutPanel With {
                                 .Head = tag & "  " & name,
                                 .HeadColor = trace.LineColor,
                                 .Body = If(parts.Count > 0, String.Join("   ", parts), Nothing),
                                 .Delta = delta,
                                 .Accent = color,
                                 .DeltaColor = deltaColor,
                                 .FollowPointer = ReadoutPosition = CursorReadout.FollowMouse AndAlso _hasPointer})
        End Sub

        ''' <summary>
        ''' Draws the readout of whatever the pointer is over, on a chart that reports it (see
        ''' <see cref="SupportsHoverReadout"/>). It is the SAME panel a cursor uses — one black plate, the
        ''' element's name in the element's own colour, the numbers in white underneath — so a hovered bar
        ''' and a cursor's crossing read alike.
        ''' </summary>
        Private Sub DrawHoverReadout(context As DrawingContext, plot As Rect)
            If Hover Is Nothing Then Return
            DrawReadoutPanel(context, plot, Hover)
        End Sub

        ''' <summary>
        ''' Draws one readout panel: a black plate outlined in the reading's own colour, the head line in
        ''' the element's colour, the numbers in white under it, and — for a pair of cursors — the
        ''' |ΔX| / |ΔY| row under a hairline in the OTHER cursor's colour. It sits beside the pointer or in
        ''' the plot's top right corner, and is kept inside the plot either way.
        ''' </summary>
        Private Sub DrawReadoutPanel(context As DrawingContext, plot As Rect, panel As ReadoutPanel)
            Dim head = MakeText(panel.Head, 11, panel.HeadColor)
            Dim body = If(String.IsNullOrEmpty(panel.Body), Nothing, MakeText(panel.Body, 11, Colors.White))
            Dim delta = If(String.IsNullOrEmpty(panel.Delta), Nothing, MakeText(panel.Delta, 11, Colors.White))
            Dim width = Math.Min(Math.Max(Math.Max(head.Width, If(body Is Nothing, 0.0, body.Width)),
                                          If(delta Is Nothing, 0.0, delta.Width)) + 12,
                                 Math.Max(20, plot.Width - 8))
            Dim height = head.Height + If(body Is Nothing, 0.0, body.Height + 2) +
                         If(delta Is Nothing, 0.0, delta.Height + 7) + 10

            ' Where it goes: beside the pointer, or in the corner. Either way it is kept inside the plot.
            Dim follow = panel.FollowPointer AndAlso _hasPointer
            Dim rx = If(follow, _pointer.X + 14, plot.Right - 6 - width)
            Dim ry = If(follow, _pointer.Y + 14, plot.Y + 6)
            rx = Math.Clamp(rx, plot.X + 4, Math.Max(plot.X + 4, plot.Right - 4 - width))
            ry = Math.Clamp(ry, plot.Y + 4, Math.Max(plot.Y + 4, plot.Bottom - 4 - height))
            Dim rect As New Rect(rx, ry, width, height)
            _readoutRect = rect

            context.DrawRectangle(New SolidColorBrush(Colors.Black),
                                  New Pen(New SolidColorBrush(panel.Accent), 1),
                                  New RoundedRect(rect, New Avalonia.CornerRadius(3)))
            context.DrawText(head, New Point(rect.X + 6, rect.Y + 5))
            If body IsNot Nothing Then context.DrawText(body, New Point(rect.X + 6, rect.Y + 5 + head.Height + 2))
            If delta IsNot Nothing Then
                ' A hairline over the pair's row, so "this line is about both cursors" is visible at a
                ' glance rather than only in its colour.
                Dim lineY = rect.Y + 5 + head.Height + If(body Is Nothing, 0.0, body.Height + 2) + 3
                context.DrawLine(New Pen(New SolidColorBrush(panel.DeltaColor, 0.5), 1),
                    New Point(rect.X + 6, lineY), New Point(rect.Right - 6, lineY))
                context.DrawText(delta, New Point(rect.X + 6, lineY + 3))
            End If
        End Sub

        ''' <summary>The trace's Y at x: linearly interpolated between the two samples around it (the
        ''' cursors move freely, so the value in between is a real reading). Outside the trace's own X
        ''' range the nearest end value is reported; Nothing when the trace has no data.</summary>
        Private Shared Function ValueAt(data As ChartData, x As Double) As Double?
            If Not data.HasData Then Return Nothing
            Dim xs = data.Xs
            Dim ys = data.Ys
            If xs.Length = 1 Then Return ys(0)
            For i = 1 To xs.Length - 1
                Dim lo = Math.Min(xs(i - 1), xs(i))
                Dim hi = Math.Max(xs(i - 1), xs(i))
                If x < lo OrElse x > hi Then Continue For
                If hi = lo Then Return ys(i)
                Dim f = (x - xs(i - 1)) / (xs(i) - xs(i - 1))
                Return ys(i - 1) + f * (ys(i) - ys(i - 1))
            Next
            Dim ascending = xs(0) < xs(xs.Length - 1)
            If x < xs(0) Then Return If(ascending, ys(0), ys(ys.Length - 1))
            Return If(ascending, ys(ys.Length - 1), ys(0))
        End Function

        ''' <summary>How far one sample is at x — the distance between the two samples around it, which
        ''' is what the ←/→ keys step by. Falls back to an axis tick when there is only one sample.</summary>
        Private Shared Function SampleStep(data As ChartData, x As Double, range As AxisRange) As Double
            Dim xs = data.Xs
            If xs.Length < 2 Then Return range.TickStep
            For i = 1 To xs.Length - 1
                If x <= Math.Max(xs(i - 1), xs(i)) Then Return Math.Abs(xs(i) - xs(i - 1))
            Next
            Return Math.Abs(xs(xs.Length - 1) - xs(xs.Length - 2))
        End Function

        ''' <summary>A readout number: trimmed of trailing zeros, or exactly CursorDecimals decimals
        ''' when that is set to 0…6.</summary>
        Private Function FormatCursor(value As Double) As String
            Dim decimals = Math.Clamp(CursorDecimals, -1, 6)
            Dim text = If(decimals < 0,
                          value.ToString("0.####", CultureInfo.CurrentCulture),
                          value.ToString("0." & New String("0"c, decimals), CultureInfo.CurrentCulture))
            Return If(text = "-0", "0", text)
        End Function

        ''' <summary>A readout number for a hovered element (a bar's value, a slice's value): trailing
        ''' zeros trimmed, and independent of CursorDecimals, which is the cursor readout's own setting
        ''' on a chart that has crosshairs.</summary>
        Friend Shared Function FormatReading(value As Double) As String
            Dim text = value.ToString("0.####", CultureInfo.CurrentCulture)
            Return If(text = "-0", "0", text)
        End Function

        ''' <summary>One element's share of the chart's total, as the pie's readout shows it: one decimal,
        ''' trimmed, then the percent sign.</summary>
        Friend Shared Function FormatShare(share As Double) As String
            Return FormatNumber(share, 0.1) & " %"
        End Function

        Private Shared Function MakeCursorPen(color As Color, thickness As Double, style As CursorStyle) As IPen
            Dim pen As New Pen(New SolidColorBrush(color), Math.Max(0.5, thickness), DashForCursor(style))
            pen.LineCap = If(style = CursorStyle.Dot, PenLineCap.Round, PenLineCap.Flat)
            Return pen
        End Function

        Private Shared Function DashForCursor(style As CursorStyle) As IDashStyle
            Select Case style
                Case CursorStyle.Dash
                    Return New DashStyle(New Double() {4, 3}, 0)
                Case CursorStyle.Dot
                    Return New DashStyle(New Double() {0.01, 3}, 0)
                Case CursorStyle.Long
                    Return New DashStyle(New Double() {10, 5}, 0)
                Case CursorStyle.Short
                    Return New DashStyle(New Double() {2, 2}, 0)
                Case Else
                    Return Nothing
            End Select
        End Function

        ' ---- pointer input: the cursor drag, and what the pointer is over ---------------------

        ''' <summary>
        ''' Hit-tests the pointer on a chart that reports what is under it (see
        ''' <see cref="SupportsHoverReadout"/>), setting <see cref="Hover"/> or leaving it Nothing. Called
        ''' on every mouse move with the coordinates of the plot area as the last render laid it out — a
        ''' chart remembers the shapes it drew (the bars, the wedges) and tests those, so the answer always
        ''' matches the picture on screen. The default does nothing: a chart with cursors reports through
        ''' them.
        ''' </summary>
        Friend Overridable Sub UpdateHover(point As Point, plot As Rect)
        End Sub

        ''' <summary>Forgets the element the pointer was over (called when the pointer leaves the chart).</summary>
        Friend Overridable Sub ClearHover()
        End Sub

        ''' <summary>Moves the cursor being dragged. The vertical line changes X, the horizontal line Y,
        ''' and the handle at the crossing point both at once — the same lines the user sees. A cursor that
        ''' FOLLOWS its trace has no Y of its own, so every grip moves it along the series instead: X comes
        ''' from the pointer and the crossing's height comes from the trace.</summary>
        Private Sub DragCursorTo(point As Point)
            Dim cursor = _dragCursor
            Dim common = _plots.FirstOrDefault(Function(one) Not one.PerSeries)
            If common Is Nothing Then common = _plots.FirstOrDefault()
            If cursor Is Nothing OrElse common Is Nothing Then Return
            If cursor.FollowTrace Then
                cursor.X = common.XRange.FromPixel(point.X, _plotRect.X, _plotRect.Width)
                InvalidateVisual()
                Return
            End If
            If _dragMode = 1 OrElse _dragMode = 3 Then
                cursor.X = common.XRange.FromPixel(point.X, _plotRect.X, _plotRect.Width)
            End If
            If _dragMode = 2 OrElse _dragMode = 3 Then
                cursor.Y = common.YRange.FromPixel(point.Y, _plotRect.Bottom, -_plotRect.Height)
            End If
            InvalidateVisual()
        End Sub

        ''' <summary>Copies the readout to the clipboard, so a reading can be pasted elsewhere.</summary>
        Private Async Sub CopyReadout()
            Dim top = TopLevel.GetTopLevel(Me)
            If top Is Nothing OrElse _readoutText.Length = 0 Then Return
            Dim clipboard = top.Clipboard
            If clipboard Is Nothing Then Return
            Await clipboard.SetTextAsync(_readoutText)
        End Sub

        ' ---- filling the container (the menu's Fill / Restore, and the Esc key) ------------------

        ''' <summary>True while the chart fills its container (see FillContainer).</summary>
        Private _filled As Boolean

        ''' <summary>The container whose layout is watched while the chart is filled, so the fill keeps matching
        ''' it when the window is resized.</summary>
        Private _fillHost As Control

        ' Exactly what the fill found, so RestorePlacement puts it back — including the "the form does not name
        ' it" states (Width/Height and Canvas.Left/Top are NaN when they are not set).
        Private _keepWidth As Double
        Private _keepHeight As Double
        Private _keepLeft As Double
        Private _keepTop As Double
        Private _keepHAlign As HorizontalAlignment
        Private _keepVAlign As VerticalAlignment
        Private _keepMargin As Thickness
        Private _keepZ As Integer
        Private _keepRow As Integer
        Private _keepColumn As Integer
        Private _keepRowSpan As Integer
        Private _keepColumnSpan As Integer

        ''' <summary>True while this chart fills its container.</summary>
        Public ReadOnly Property IsFilled As Boolean
            Get
                Return _filled
            End Get
        End Property

        ''' <summary>
        ''' FILLS the chart's container: the chart is stretched, moved to the container's corner, made the size
        ''' of the container and raised above its siblings, so a small form still gets a chart you can read. The
        ''' placement the fill found is remembered, so RestorePlacement — the other entry in the chart's own
        ''' right-click menu, or the Esc key — puts it back exactly.
        ''' <para>
        ''' What "the container" means depends on what the chart sits in: a Canvas child is moved to (0,0) and
        ''' sized to the canvas, a Grid child also spans every row and column (so its rectangle really is the
        ''' container's and not one cell's), and any other parent is filled with that parent's own rectangle. A
        ''' StackPanel or WrapPanel lays its children out in a line, so a filled chart there covers them instead
        ''' of sharing the space — which is what "fill" asks for.
        ''' </para>
        ''' <para>Runtime only: the saved form is not touched, exactly like a cursor drag. False when the chart
        ''' is already filled or has no parent to fill.</para>
        ''' </summary>
        Public Function FillContainer() As Boolean
            Dim host = TryCast(Parent, Visual)
            If _filled OrElse host Is Nothing Then Return False
            _keepWidth = Width
            _keepHeight = Height
            _keepHAlign = HorizontalAlignment
            _keepVAlign = VerticalAlignment
            _keepMargin = Margin
            _keepZ = ZIndex
            _keepLeft = Canvas.GetLeft(Me)
            _keepTop = Canvas.GetTop(Me)
            _keepRow = Grid.GetRow(Me)
            _keepColumn = Grid.GetColumn(Me)
            _keepRowSpan = Grid.GetRowSpan(Me)
            _keepColumnSpan = Grid.GetColumnSpan(Me)
            _filled = True
            ApplyFill(host)
            ' A filled chart has to keep up with its container: without this a window resize would leave it the
            ' size it had when the menu entry was clicked.
            Dim container = TryCast(host, Control)
            If container IsNot Nothing Then
                _fillHost = container
                AddHandler container.LayoutUpdated, AddressOf OnFillHostLaidOut
            End If
            Focus()
            Return True
        End Function

        ''' <summary>Puts the chart back exactly where FillContainer found it: the chart's own menu offers it, the
        ''' Esc key does it, and code may call it. False when the chart was not filled.</summary>
        Public Function RestorePlacement() As Boolean
            If Not _filled Then Return False
            _filled = False
            If _fillHost IsNot Nothing Then
                RemoveHandler _fillHost.LayoutUpdated, AddressOf OnFillHostLaidOut
                _fillHost = Nothing
            End If
            Width = _keepWidth
            Height = _keepHeight
            HorizontalAlignment = _keepHAlign
            VerticalAlignment = _keepVAlign
            Margin = _keepMargin
            ZIndex = _keepZ
            Canvas.SetLeft(Me, _keepLeft)
            Canvas.SetTop(Me, _keepTop)
            Grid.SetRow(Me, _keepRow)
            Grid.SetColumn(Me, _keepColumn)
            Grid.SetRowSpan(Me, _keepRowSpan)
            Grid.SetColumnSpan(Me, _keepColumnSpan)
            Return True
        End Function

        ''' <summary>The fill itself: the chart takes the container's whole rectangle and sits on top of its
        ''' siblings. A Grid child spans the grid first, so the rectangle is the container's own and not one
        ''' cell's.</summary>
        Private Sub ApplyFill(host As Visual)
            HorizontalAlignment = HorizontalAlignment.Stretch
            VerticalAlignment = VerticalAlignment.Stretch
            Margin = New Thickness(0)
            If TypeOf host Is Canvas Then
                Canvas.SetLeft(Me, 0)
                Canvas.SetTop(Me, 0)
            End If
            Dim grid = TryCast(host, Grid)
            If grid IsNot Nothing Then
                Grid.SetRow(Me, 0)
                Grid.SetColumn(Me, 0)
                Grid.SetRowSpan(Me, Math.Max(1, grid.RowDefinitions.Count))
                Grid.SetColumnSpan(Me, Math.Max(1, grid.ColumnDefinitions.Count))
            End If
            ZIndex = Math.Max(1000, _keepZ)
            Width = Math.Max(1, host.Bounds.Width)
            Height = Math.Max(1, host.Bounds.Height)
        End Sub

        ''' <summary>Keeps a filled chart the size of its container when the container changes size.</summary>
        Private Sub OnFillHostLaidOut(sender As Object, e As EventArgs)
            If Not _filled Then Return
            Dim host = TryCast(Parent, Visual)
            If host Is Nothing Then Return
            Dim width = Math.Max(1, host.Bounds.Width)
            Dim height = Math.Max(1, host.Bounds.Height)
            If Math.Abs(Width - width) > 0.5 Then Width = width
            If Math.Abs(Height - height) > 0.5 Then Height = height
        End Sub

        ''' <summary>The chart's right-click menu: choosing the spreadsheet, FILLING THE CONTAINER (and putting
        ''' the chart back), which cursors are switched on,
        ''' where the readout sits, and add / remove / reset / copy. Nothing here is written back to the
        ''' form — the saved defaults are the ones the Cursor Editor sets, and a restart starts from those
        ''' again.
        ''' The state is carried in the item's TEXT (a leading tick) rather than in a check box: menu item
        ''' ticks arrived in Avalonia 11.1, and the bundled control still has to build on 11.0.</summary>
        Private Sub ShowChartMenu()
            Dim items As New List(Of Object)()

            ' The spreadsheet picker lives here now, at the top: it is the one action on the chart that is
            ' not about cursors. (It used to be a "…" button drawn on the chart's surface.)
            Dim browseItem As New MenuItem With {.Header = "Choose spreadsheet…"}
            AddHandler browseItem.Click,
                Sub(sender, args)
#Disable Warning BC42358 ' deliberately fire-and-forget: a menu click cannot await the dialog
                    BrowseForFile()
#Enable Warning BC42358
                End Sub
            items.Add(browseItem)

            ' Filling the container is offered on EVERY chart, cursors or not: it is the one way to read a
            ' chart on a crowded form. The label says what the click will do, so the same entry is both the
            ' dock and the undock, and the restore half carries the Esc hint because Esc does the same thing.
            Dim fillItem As New MenuItem With {
                .Header = If(_filled, "Restore the original position  (Esc)", "Fill the container")}
            AddHandler fillItem.Click, Sub(sender As Object, e As RoutedEventArgs)
                                          If _filled Then
                                              RestorePlacement()
                                          Else
                                              FillContainer()
                                          End If
                                      End Sub
            items.Add(fillItem)

            ' The LEGEND is the other thing on a chart that is not about cursors, and the one a reader
            ' reaches for while looking at a crowded form: with the names gone the picture gets their room
            ' back. Every chart type has a legend, so this goes in BEFORE the no-cursors return below — the
            ' bar and the pie need it as much as the line plot does. Like every other toggle here it changes
            ' only the RUNNING chart: the form has its own ShowLegend, set in the Properties panel, and a
            ' restart goes back to it.
            Dim legendItem As New MenuItem With {.Header = If(ShowLegend, "✓ ", "    ") & "Legend"}
            AddHandler legendItem.Click, Sub(sender As Object, e As RoutedEventArgs)
                                             ShowLegend = Not ShowLegend
                                             InvalidateVisual()
                                         End Sub
            items.Add(legendItem)

            ' A chart that has no cursors (the pie and the bar) gets no cursor entries at all: the toggles,
            ' the readout position, add / remove / reset and "copy readout" are every one of them about
            ' cursors. Those charts report what is under the pointer in the readout panel instead (see
            ' SupportsHoverReadout), and which slice or series is switched on is the legend's business.
            If Not SupportsCursors Then
                OpenChartMenu(items)
                Return
            End If
            items.Add(New Separator())

            For i = 0 To Math.Min(Cursors.Count, MaxCursors) - 1
                Dim index = i
                Dim toggle As New MenuItem With {.Header = If(Cursors(i).Enabled, "✓ ", "    ") & "Cursor " & (i + 1)}
                AddHandler toggle.Click, Sub(sender As Object, e As RoutedEventArgs)
                                             Cursors(index).Enabled = Not Cursors(index).Enabled
                                             _selectedCursor = index
                                             InvalidateVisual()
                                         End Sub
                items.Add(toggle)
            Next
            If items.Count > 0 Then items.Add(New Separator())

            Dim followItem As New MenuItem With {.Header = If(ReadoutPosition = CursorReadout.FollowMouse, "✓ ", "    ") & "Readout: follow the mouse"}
            AddHandler followItem.Click, Sub(sender As Object, e As RoutedEventArgs)
                                             ReadoutPosition = CursorReadout.FollowMouse
                                             InvalidateVisual()
                                         End Sub
            Dim cornerItem As New MenuItem With {.Header = If(ReadoutPosition = CursorReadout.TopRight, "✓ ", "    ") & "Readout: top right corner"}
            AddHandler cornerItem.Click, Sub(sender As Object, e As RoutedEventArgs)
                                             ReadoutPosition = CursorReadout.TopRight
                                             InvalidateVisual()
                                         End Sub
            items.Add(followItem)
            items.Add(cornerItem)
            items.Add(New Separator())

            Dim addItem As New MenuItem With {.Header = "Add cursor", .IsEnabled = Cursors.Count < MaxCursors}
            AddHandler addItem.Click, Sub(sender As Object, e As RoutedEventArgs) AddCursor()
            Dim removeItem As New MenuItem With {.Header = "Remove cursor", .IsEnabled = Cursors.Count > 0}
            AddHandler removeItem.Click, Sub(sender As Object, e As RoutedEventArgs) RemoveCursor()
            Dim resetItem As New MenuItem With {.Header = "Reset cursors to the middle", .IsEnabled = Cursors.Count > 0}
            AddHandler resetItem.Click, Sub(sender As Object, e As RoutedEventArgs) ResetCursors()
            Dim copyItem As New MenuItem With {.Header = "Copy readout", .IsEnabled = _readoutText.Length > 0}
            AddHandler copyItem.Click, Sub(sender As Object, e As RoutedEventArgs) CopyReadout()
            items.Add(addItem)
            items.Add(removeItem)
            items.Add(resetItem)
            items.Add(New Separator())
            items.Add(copyItem)

            OpenChartMenu(items)
        End Sub

        ''' <summary>Opens the chart's own menu at the pointer.</summary>
        Private Sub OpenChartMenu(items As List(Of Object))
            Dim menu As New ContextMenu With {.ItemsSource = items, .PlacementTarget = Me}
            menu.Open(Me)
        End Sub

        ''' <summary>Resolves the common axis' names: the explicit properties win, then the sheet's headers.</summary>
        Friend Shared Function MakeText(text As String, size As Double, color As Color) As FormattedText
            Return New FormattedText(text, CultureInfo.CurrentCulture, FlowDirection.LeftToRight,
                                     New Typeface(FontFamily.Default), Math.Max(6, size), New SolidColorBrush(color))
        End Function

        ''' <summary>Trims the given amounts off a rectangle's edges (never past zero size).</summary>
        Private Shared Function Chop(rect As Rect, left As Double, top As Double, right As Double, bottom As Double) As Rect
            Return New Rect(rect.X + left, rect.Y + top,
                            Math.Max(0, rect.Width - left - right), Math.Max(0, rect.Height - top - bottom))
        End Function

        Private Protected Shared Function MakePen(color As Color, thickness As Double, style As ChartLineStyle) As IPen
            Dim pen As New Pen(New SolidColorBrush(color), Math.Max(0.5, thickness), DashFor(style))
            ' Round caps make the Dot style read as dots rather than as nothing at all.
            pen.LineCap = If(style = ChartLineStyle.Dot, PenLineCap.Round, PenLineCap.Flat)
            Return pen
        End Function

        Friend Shared Function DashFor(style As ChartLineStyle) As IDashStyle
            Select Case style
                Case ChartLineStyle.Dash
                    Return New DashStyle(New Double() {4, 3}, 0)
                Case ChartLineStyle.Dot
                    Return New DashStyle(New Double() {0.01, 3}, 0)
                Case ChartLineStyle.DashDot
                    Return New DashStyle(New Double() {4, 3, 0.01, 3}, 0)
                Case Else
                    Return Nothing
            End Select
        End Function

        Friend Shared Function FormatNumber(value As Double, tickStep As Double) As String
            Dim decimals As Integer = 0
            If tickStep < 1 Then decimals = Math.Min(6, CInt(Math.Ceiling(-Math.Log10(tickStep))) + 1)
            Dim text = value.ToString("0." & New String("#"c, Math.Max(0, decimals)), CultureInfo.CurrentCulture)
            If text = "-0" Then Return "0"
            Return text
        End Function
    End Class

    ''' <summary>
    ''' A fitted axis: the range actually drawn, the tick step, and the data-to-pixel mapping. Built
    ''' from the data (auto-fit) or from explicit Min/Max, then snapped outward to "nice" 1/2/5 x 10^n
    ''' steps so the labels are round numbers.
    ''' </summary>
    Friend NotInheritable Class AxisRange
        Private _min As Double
        Private _max As Double

        ''' <summary>The tick step (also the basis for the label precision).</summary>
        Friend Property TickStep As Double = 1

        ''' <summary>The subdivisions of a major step (minor ticks).</summary>
        Private Property Subdivisions As Integer = 5

        ''' <summary>Builds the range for one axis of data.</summary>
        Friend Shared Function Over(values As IReadOnlyList(Of Double), forcedMin As Double, forcedMax As Double,
                                    targetTicks As Integer, subdivisions As Integer) As AxisRange
            Dim range As New AxisRange With {.Subdivisions = Math.Max(1, subdivisions)}
            Dim min = If(Double.IsNaN(forcedMin) OrElse values.Count = 0, If(values.Count = 0, 0.0, values.Min()), forcedMin)
            Dim max = If(Double.IsNaN(forcedMax) OrElse values.Count = 0, If(values.Count = 0, 1.0, values.Max()), forcedMax)
            If max <= min Then max = min + If(Math.Abs(min) > 1, Math.Abs(min) * 0.1, 1)

            range.TickStep = NiceStep(max - min, Math.Max(2, targetTicks))
            If Double.IsNaN(forcedMin) Then min = Math.Floor(min / range.TickStep) * range.TickStep
            If Double.IsNaN(forcedMax) Then max = Math.Ceiling(max / range.TickStep) * range.TickStep
            ' Always include the span, even when a forced bound falls inside it.
            range._min = Math.Min(min, max)
            range._max = Math.Max(min, max)
            If range._max <= range._min Then range._max = range._min + range.TickStep
            Return range
        End Function

        ''' <summary>The fitted minimum (the scale's own bottom).</summary>
        Friend ReadOnly Property Min As Double
            Get
                Return _min
            End Get
        End Property

        ''' <summary>The fitted maximum (the scale's own top).</summary>
        Friend ReadOnly Property Max As Double
            Get
                Return _max
            End Get
        End Property

        ''' <summary>A 1, 2 or 5 (times a power of ten) step that gives roughly the target tick count.</summary>
        Private Shared Function NiceStep(span As Double, target As Integer) As Double
            If span <= 0 OrElse Double.IsNaN(span) OrElse Double.IsInfinity(span) Then Return 1
            Dim rough = span / target
            Dim magnitude = Math.Pow(10, Math.Floor(Math.Log10(rough)))
            Dim normalised = rough / magnitude
            Dim nice = If(normalised <= 1, 1, If(normalised <= 2, 2, If(normalised <= 5, 5, 10)))
            Return nice * magnitude
        End Function

        ''' <summary>The major tick values across the range.</summary>
        Friend Iterator Function Ticks() As IEnumerable(Of Double)
            Dim count = CInt(Math.Round((_max - _min) / TickStep))
            count = Math.Clamp(count, 0, 1000)
            For i = 0 To count
                Yield _min + i * TickStep
            Next
        End Function

        ''' <summary>The minor tick values (the major step split into Subdivisions).</summary>
        Friend Iterator Function MinorTicks() As IEnumerable(Of Double)
            If Subdivisions < 2 Then Return
            Dim subStep = TickStep / Subdivisions
            Dim count = CInt(Math.Round((_max - _min) / subStep))
            count = Math.Clamp(count, 0, 5000)
            For i = 0 To count
                If i Mod Subdivisions <> 0 Then Yield _min + i * subStep
            Next
        End Function

        ''' <summary>One value's pixel position along an axis drawn from origin by length.</summary>
        Friend Function ToPixel(value As Double, origin As Double, length As Double) As Double
            Return origin + (value - _min) / (_max - _min) * length
        End Function

        ''' <summary>The pixel position back in data units (what a cursor drag needs).</summary>
        Friend Function FromPixel(pixel As Double, origin As Double, length As Double) As Double
            If length = 0 Then Return _min
            Return _min + (pixel - origin) / length * (_max - _min)
        End Function

        ''' <summary>The middle of the range: where a cursor that has never been placed sits.</summary>
        Friend ReadOnly Property Mid As Double
            Get
                Return (_min + _max) / 2
            End Get
        End Property
    End Class

    ''' <summary>
    ''' A LINE PLOT: one line per series, Y values in sample order with X running 0…N-1. Series read
    ''' their Y from the spreadsheet's Y columns (C, E, G …) and may set AxisMode="PerSeries" for their
    ''' own scale.
    ''' </summary>
    Public Class GrumpyLinePlot
        Inherits ChartBase

        ''' <summary>The implicit series' Y samples (used only when the chart has no series elements).</summary>
        Public Shared ReadOnly ValuesProperty As StyledProperty(Of Double()) =
            AvaloniaProperty.Register(Of GrumpyLinePlot, Double())(NameOf(Values))

        ''' <summary>The Y samples of the implicit series (X is the sample index).</summary>
        <TypeConverter(GetType(DoubleArrayConverter))>
        Public Property Values As Double()
            Get
                Return GetValue(ValuesProperty)
            End Get
            Set(value As Double())
                SetValue(ValuesProperty, value)
            End Set
        End Property

        Protected Overrides ReadOnly Property ImplicitXFromIndex As Boolean
            Get
                Return True
            End Get
        End Property

        Protected Overrides Function InlineData() As ChartData
            Dim samples = If(Values, Array.Empty(Of Double)())
            Return New ChartData With {
                .Xs = Enumerable.Range(0, samples.Length).Select(Function(i) CDbl(i)).ToArray(),
                .Ys = samples
            }
        End Function

        Protected Overrides Sub SetInlineData(xs As Double(), ys As Double())
            Values = ys
        End Sub

        Protected Overrides Sub OnPropertyChanged(change As AvaloniaPropertyChangedEventArgs)
            MyBase.OnPropertyChanged(change)
            If change.Property Is ValuesProperty Then Reload()
        End Sub
    End Class

    ''' <summary>
    ''' An X,Y PLOT: one point-set per series, drawn as a line, as markers, or both. A series reads its
    ''' X and Y from the spreadsheet's column pairs (B/C, D/E, F/G …) unless AxisMode="Common" is used,
    ''' in which case every series shares the chart's X column.
    ''' </summary>
    Public Class GrumpyXYPlot
        Inherits ChartBase

        ''' <summary>The implicit series' (x,y) pairs (used only when the chart has no series elements).</summary>
        Public Shared ReadOnly PointsProperty As StyledProperty(Of Double(,)) =
            AvaloniaProperty.Register(Of GrumpyXYPlot, Double(,))(NameOf(Points))

        ''' <summary>The (x,y) pairs of the implicit series — an n-by-2 array.</summary>
        <TypeConverter(GetType(DoubleMatrixConverter))>
        Public Property Points As Double(,)
            Get
                Return GetValue(PointsProperty)
            End Get
            Set(value As Double(,))
                SetValue(PointsProperty, value)
            End Set
        End Property

        Protected Overrides ReadOnly Property ImplicitXFromIndex As Boolean
            Get
                Return False
            End Get
        End Property

        Protected Overrides Function InlineData() As ChartData
            Dim pairs = Points
            If pairs Is Nothing Then Return New ChartData()
            Dim count = pairs.GetLength(0)
            Dim data As New ChartData With {.Xs = New Double(count - 1) {}, .Ys = New Double(count - 1) {}}
            For i = 0 To count - 1
                data.Xs(i) = pairs(i, 0)
                data.Ys(i) = pairs(i, 1)
            Next
            Return data
        End Function

        Protected Overrides Sub SetInlineData(xs As Double(), ys As Double())
            Dim count = Math.Min(xs.Length, ys.Length)
            Dim pairs(count - 1, 1) As Double
            For i = 0 To count - 1
                pairs(i, 0) = xs(i)
                pairs(i, 1) = ys(i)
            Next
            Points = pairs
        End Sub

        Protected Overrides Sub OnPropertyChanged(change As AvaloniaPropertyChangedEventArgs)
            MyBase.OnPropertyChanged(change)
            If change.Property Is PointsProperty Then Reload()
        End Sub
    End Class

    ''' <summary>
    ''' One slice of a GrumpyPiePlot: its NAME (ChartSeries.Title, which is what the legend shows), its
    ''' COLOUR (ChartSeries.LineColor — the same property a series uses, so the Slices editor's rows mean
    ''' what the Series editor's rows mean), how far it is pushed out of the pie, and whether it is drawn
    ''' at all.
    ''' <para>
    ''' A slice listed here is an OVERRIDE: the pie's slices come from the data, and this names the ones
    ''' that should look different. A slice the form does not mention gets a colour from the chart's
    ''' palette. Slices are matched to the data by their name.
    ''' </para>
    ''' </summary>
    Public Class PieSlice
        Inherits ChartSeries

        ''' <summary>How far this slice is pushed out of the pie, in pixels (0 = in place).</summary>
        Public Property Explode As Double = 0

        ''' <summary>A slice's position is its row, so it is never read from a workbook column.</summary>
        Friend Overrides ReadOnly Property XFromIndex As Boolean
            Get
                Return True
            End Get
        End Property
    End Class

    ''' <summary>
    ''' A BAR / COLUMN chart: one bar per category, drawn from its baseline — side by side, stacked, or
    ''' stacked and filled to 100% (see BarMode). A point's NAME comes from the spreadsheet's X column (a
    ''' label column of text, dates or numbers), and when it has none the axis falls back to numbers. 0 is
    ''' always on the Y scale, because a bar is read as a length from its baseline.
    ''' <para>
    ''' Everything shared with the other charts works exactly as it does on a line chart: series (one bar
    ''' colour each, from the Series editor), the common and per-series axes, the legend, the two cursors,
    ''' the background gradient, the border and the padding.
    ''' </para>
    ''' </summary>
    Public Class GrumpyBarPlot
        Inherits ChartBase

        ''' <summary>The implicit series' values, used only when the chart has no series elements. One bar
        ''' per value; the category names still come from the spreadsheet's X column.</summary>
        Public Shared ReadOnly ValuesProperty As StyledProperty(Of Double()) =
            AvaloniaProperty.Register(Of GrumpyBarPlot, Double())(NameOf(Values))

        ''' <summary>Grouped, Stacked or Stacked100.</summary>
        Public Shared ReadOnly BarModeProperty As StyledProperty(Of BarMode) =
            AvaloniaProperty.Register(Of GrumpyBarPlot, BarMode)(NameOf(BarMode))

        ''' <summary>How much of its slot one bar fills: 0.1 … 1 (default 0.8, the rest is the gap).</summary>
        Public Shared ReadOnly BarWidthProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpyBarPlot, Double)(NameOf(BarWidth), 0.8R)

        ''' <summary>How round a bar's corners are, in pixels (0 = square corners, the default).</summary>
        Public Shared ReadOnly BarCornerRadiusProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpyBarPlot, Double)(NameOf(BarCornerRadius))

        ''' <summary>The values of the implicit series (used only when the chart has no series elements).</summary>
        <TypeConverter(GetType(DoubleArrayConverter))>
        Public Property Values As Double()
            Get
                Return GetValue(ValuesProperty)
            End Get
            Set(value As Double())
                SetValue(ValuesProperty, value)
            End Set
        End Property

        ''' <summary>How the bars stand in their category (see BarMode).</summary>
        Public Property BarMode As BarMode
            Get
                Return GetValue(BarModeProperty)
            End Get
            Set(value As BarMode)
                SetValue(BarModeProperty, value)
            End Set
        End Property

        ''' <summary>How much of its slot one bar fills.</summary>
        Public Property BarWidth As Double
            Get
                Return GetValue(BarWidthProperty)
            End Get
            Set(value As Double)
                SetValue(BarWidthProperty, value)
            End Set
        End Property

        ''' <summary>How round a bar's corners are, in pixels.</summary>
        Public Property BarCornerRadius As Double
            Get
                Return GetValue(BarCornerRadiusProperty)
            End Get
            Set(value As Double)
                SetValue(BarCornerRadiusProperty, value)
            End Set
        End Property

        Protected Overrides ReadOnly Property ImplicitXFromIndex As Boolean
            Get
                Return True
            End Get
        End Property

        Protected Overrides ReadOnly Property ZeroBaseline As Boolean
            Get
                Return True
            End Get
        End Property

        Protected Overrides ReadOnly Property StackSeries As Boolean
            Get
                Return BarMode <> BarMode.Grouped
            End Get
        End Property

        Protected Overrides ReadOnly Property NamedXAxis As Boolean
            Get
                Return True
            End Get
        End Property

        ''' <summary>Half a slot of room at each end, so the first and last bar are drawn whole.</summary>
        Protected Overrides ReadOnly Property XPadUnits As Double
            Get
                Return 0.5R
            End Get
        End Property

        Protected Overrides ReadOnly Property ZeroToHundred As Boolean
            Get
                Return BarMode = BarMode.Stacked100
            End Get
        End Property

        ''' <summary>
        ''' A bar chart has no cursors, and its right-click menu therefore carries nothing but the
        ''' spreadsheet picker. A crosshair reads a value BETWEEN two samples, which is what a line chart
        ''' has; a bar is one reading per category, so there is nothing to interpolate — the bar under the
        ''' pointer is reported in the readout panel instead (see SupportsHoverReadout).
        ''' </summary>
        Protected Overrides ReadOnly Property SupportsCursors As Boolean
            Get
                Return False
            End Get
        End Property

        Friend Overrides ReadOnly Property SupportsHoverReadout As Boolean
            Get
                Return True
            End Get
        End Property

        Protected Overrides Function InlineData() As ChartData
            ' Not named 'values': VB is case-insensitive and would match the property above.
            Dim samples = If(Values, Array.Empty(Of Double)())
            Return New ChartData With {
                .Xs = Enumerable.Range(0, samples.Length).Select(Function(i) CDbl(i)).ToArray(),
                .Ys = samples
            }
        End Function

        Protected Overrides Sub SetInlineData(xs As Double(), ys As Double())
            Values = ys
        End Sub

        ''' <summary>One bar as the last render drew it, for hit-testing the pointer. A bar is a rectangle,
        ''' so the test needs no more than that — plus what the readout has to say about it.</summary>
        Private NotInheritable Class BarHit
            Friend Rect As Rect
            ''' <summary>The point's own name (the axis' category), or its X number when it has none.</summary>
            Friend Category As String = String.Empty
            ''' <summary>The series' name, or empty when this chart draws a single series: with one bar per
            ''' category there is nothing to tell apart, so the readout leaves the name out.</summary>
            Friend Series As String = String.Empty
            Friend Value As Double
            Friend Fill As Color = Colors.White
        End Class

        ''' <summary>Every bar the last render drew, in drawing order, for the pointer test.</summary>
        Private ReadOnly _barHits As New List(Of BarHit)()

        ''' <summary>The bar in _barHits the pointer is over, or −1. Nothing moves for a bar, so this only
        ''' saves rebuilding the same readout on every mouse move.</summary>
        Private _hoverBar As Integer = -1

        ''' <summary>
        ''' Finds the bar under the pointer — the rectangles the last render drew, tested back to front so
        ''' the topmost of any that overlap wins — and fills in the readout: the category the pointer is
        ''' over, the series it belongs to when the chart draws more than one, and its value.
        ''' </summary>
        Friend Overrides Sub UpdateHover(point As Point, plot As Rect)
            For i = _barHits.Count - 1 To 0 Step -1
                Dim hit = _barHits(i)
                If Not hit.Rect.Contains(point) Then Continue For
                If _hoverBar = i Then Return   ' still the same bar: the panel just follows the mouse
                _hoverBar = i
                Hover = New ReadoutPanel With {
                    .Head = hit.Category,
                    .HeadColor = hit.Fill,
                    .Body = If(hit.Series.Length > 0,
                               hit.Series & "   " & FormatReading(hit.Value),
                               FormatReading(hit.Value)),
                    .Accent = hit.Fill,
                    .FollowPointer = True}
                Return
            Next
            ClearHover()
        End Sub

        ''' <summary>Forgets the hovered bar, so its readout goes with the pointer.</summary>
        Friend Overrides Sub ClearHover()
            _hoverBar = -1
            Hover = Nothing
        End Sub

        Protected Overrides Sub OnPropertyChanged(change As AvaloniaPropertyChangedEventArgs)
            MyBase.OnPropertyChanged(change)
            If change.Property Is ValuesProperty OrElse change.Property Is BarModeProperty OrElse
               change.Property Is BarWidthProperty OrElse change.Property Is BarCornerRadiusProperty Then
                Reload()
            End If
        End Sub

        ''' <summary>
        ''' Draws one bar per point, per series. Grouped bars split the category's slot between the series
        ''' (a switched-off series keeps its place, so the others do not jump sideways when it is toggled);
        ''' stacked bars share the whole slot and start where the previous series ended, which is why the
        ''' scale is fitted to the stack's totals (see ChartBase.StackSeries).
        ''' </summary>
        Friend Overrides Sub DrawSeriesLayer(context As DrawingContext, plots As List(Of Plot), plot As Rect)
            _barHits.Clear()
            If plots.Count = 0 Then Return
            Dim stacked = BarMode <> BarMode.Grouped
            Dim bands = If(stacked, StackBands(plots, BarMode = BarMode.Stacked100), Nothing)
            Dim radius = Math.Max(0, BarCornerRadius)
            ' Whether the readout has to name the series a bar belongs to: with one series it is obvious.
            Dim seriesDrawn = plots.Where(Function(p) p.Visible AndAlso p.Data.Ys.Length > 0).Count()

            For s = 0 To plots.Count - 1
                Dim p = plots(s)
                Dim count = p.Data.Ys.Length
                If count = 0 OrElse Not p.Visible Then Continue For

                ' The slot a category owns is one X unit, measured THROUGH the axis' own mapping (its
                ' origin and its length), so the bars keep their width whatever the scale is.
                Dim slot = Math.Abs(p.XRange.ToPixel(1, plot.X, plot.Width) - p.XRange.ToPixel(0, plot.X, plot.Width))
                If Not (slot > 0) Then slot = plot.Width / Math.Max(1, p.Data.Xs.Length)
                Dim group = Math.Clamp(BarWidth, 0.05, 1) * slot
                Dim width = If(stacked, group, group / Math.Max(1, plots.Count))
                Dim offset = If(stacked, 0.0, (s - (plots.Count - 1) / 2.0) * width)

                Dim bases As Double()
                Dim tops As Double()
                If bands IsNot Nothing Then
                    bases = bands(s).Base
                    tops = bands(s).Top
                Else
                    bases = New Double(count - 1) {}
                    tops = p.Data.Ys
                End If

                Dim fill As New SolidColorBrush(p.LineColor)
                For i = 0 To count - 1
                    Dim x = p.XRange.ToPixel(p.Data.Xs(i), plot.X, plot.Width) + offset
                    Dim top = YAt(p, plot, tops(i))
                    Dim bottom = YAt(p, plot, bases(i))
                    Dim bar As New Rect(x - width / 2, Math.Min(top, bottom), width, Math.Abs(bottom - top))
                    context.DrawRectangle(fill, Nothing, New RoundedRect(bar, radius))

                    ' Remembered so the pointer can be tested against it (see UpdateHover). The value is the
                    ' series' own, not the height the bar reaches: on a stacked chart the second series' bar
                    ' starts where the first ended, and its reading is what it adds, not the total so far.
                    _barHits.Add(New BarHit With {
                        .Rect = bar,
                        .Category = If(i < p.Data.Labels.Length AndAlso Not String.IsNullOrWhiteSpace(p.Data.Labels(i)),
                                       p.Data.Labels(i),
                                       FormatNumber(p.Data.Xs(i), 1)),
                        .Series = If(seriesDrawn > 1, LegendName(p, s), String.Empty),
                        .Value = p.Data.Ys(i),
                        .Fill = p.LineColor})
                Next
            Next
        End Sub
    End Class

    ''' <summary>
    ''' An AREA chart: each series is a filled shape under its line. A plain area chart fills every series
    ''' down to zero (so the series drawn last covers the ones before it — that is what a plain area chart
    ''' does), while AreaMode.Stacked fills each series from the top of the previous one, which is the shape
    ''' monitoring dashboards use, and AreaMode.Stacked100 makes every category total 100%.
    ''' <para>
    ''' The data, the series, the axes (with the points' names along the bottom), the legend, the cursors,
    ''' the background gradient, the border and the padding all work as they do on the line chart.
    ''' </para>
    ''' </summary>
    Public Class GrumpyAreaPlot
        Inherits ChartBase

        ''' <summary>The implicit series' values, used only when the chart has no series elements.</summary>
        Public Shared ReadOnly ValuesProperty As StyledProperty(Of Double()) =
            AvaloniaProperty.Register(Of GrumpyAreaPlot, Double())(NameOf(Values))

        ''' <summary>Plain, Stacked or Stacked100.</summary>
        Public Shared ReadOnly AreaModeProperty As StyledProperty(Of AreaMode) =
            AvaloniaProperty.Register(Of GrumpyAreaPlot, AreaMode)(NameOf(AreaMode))

        ''' <summary>How solid the fill is, 0 … 100 (default 60): the line on top stays fully opaque, so a
        ''' lighter fill lets the gridlines and the series behind it show through.</summary>
        Public Shared ReadOnly AreaOpacityProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpyAreaPlot, Double)(NameOf(AreaOpacity), 60.0R)

        ''' <summary>The values of the implicit series (used only when the chart has no series elements).</summary>
        <TypeConverter(GetType(DoubleArrayConverter))>
        Public Property Values As Double()
            Get
                Return GetValue(ValuesProperty)
            End Get
            Set(value As Double())
                SetValue(ValuesProperty, value)
            End Set
        End Property

        ''' <summary>How the series are filled (see AreaMode).</summary>
        Public Property AreaMode As AreaMode
            Get
                Return GetValue(AreaModeProperty)
            End Get
            Set(value As AreaMode)
                SetValue(AreaModeProperty, value)
            End Set
        End Property

        ''' <summary>How solid the fill is, as a percentage.</summary>
        Public Property AreaOpacity As Double
            Get
                Return GetValue(AreaOpacityProperty)
            End Get
            Set(value As Double)
                SetValue(AreaOpacityProperty, value)
            End Set
        End Property

        Protected Overrides ReadOnly Property ImplicitXFromIndex As Boolean
            Get
                Return True
            End Get
        End Property

        Protected Overrides ReadOnly Property ZeroBaseline As Boolean
            Get
                Return True
            End Get
        End Property

        Protected Overrides ReadOnly Property StackSeries As Boolean
            Get
                Return AreaMode <> AreaMode.Plain
            End Get
        End Property

        Protected Overrides ReadOnly Property NamedXAxis As Boolean
            Get
                Return True
            End Get
        End Property

        Protected Overrides ReadOnly Property ZeroToHundred As Boolean
            Get
                Return AreaMode = AreaMode.Stacked100
            End Get
        End Property

        Protected Overrides Function InlineData() As ChartData
            ' Not named 'values': VB is case-insensitive and would match the property above.
            Dim samples = If(Values, Array.Empty(Of Double)())
            Return New ChartData With {
                .Xs = Enumerable.Range(0, samples.Length).Select(Function(i) CDbl(i)).ToArray(),
                .Ys = samples
            }
        End Function

        Protected Overrides Sub SetInlineData(xs As Double(), ys As Double())
            Values = ys
        End Sub

        Protected Overrides Sub OnPropertyChanged(change As AvaloniaPropertyChangedEventArgs)
            MyBase.OnPropertyChanged(change)
            If change.Property Is ValuesProperty OrElse change.Property Is AreaModeProperty OrElse
               change.Property Is AreaOpacityProperty Then
                Reload()
            End If
        End Sub

        ''' <summary>
        ''' Fills each series down to its baseline and then strokes the line along its top, so the shape has
        ''' a crisp edge and the same colour as its fill. Stacked modes fill from the previous series' top;
        ''' the plain mode fills to zero, which is the classic overlap (and why the series order matters).
        ''' </summary>
        Friend Overrides Sub DrawSeriesLayer(context As DrawingContext, plots As List(Of Plot), plot As Rect)
            If plots.Count = 0 Then Return
            Dim stacked = AreaMode <> AreaMode.Plain
            Dim bands = If(stacked, StackBands(plots, AreaMode = AreaMode.Stacked100), Nothing)
            Dim fillOpacity = Math.Clamp(AreaOpacity, 0, 100) / 100.0

            For s = 0 To plots.Count - 1
                Dim p = plots(s)
                Dim count = p.Data.Ys.Length
                If count = 0 OrElse Not p.Visible Then Continue For

                Dim bases As Double()
                Dim tops As Double()
                If bands IsNot Nothing Then
                    bases = bands(s).Base
                    tops = bands(s).Top
                Else
                    bases = New Double(count - 1) {}
                    tops = p.Data.Ys
                End If

                Dim xs = p.Data.Xs
                Dim geometry As New StreamGeometry()
                Using g = geometry.Open()
                    g.BeginFigure(New Point(p.XRange.ToPixel(xs(0), plot.X, plot.Width), YAt(p, plot, tops(0))), True)
                    For i = 1 To count - 1
                        g.LineTo(New Point(p.XRange.ToPixel(xs(i), plot.X, plot.Width), YAt(p, plot, tops(i))))
                    Next
                    ' Back along the baseline, right to left, so the shape is closed.
                    For i = count - 1 To 0 Step -1
                        g.LineTo(New Point(p.XRange.ToPixel(xs(i), plot.X, plot.Width), YAt(p, plot, bases(i))))
                    Next
                    g.EndFigure(True)
                End Using
                context.DrawGeometry(New SolidColorBrush(p.LineColor, fillOpacity), Nothing, geometry)

                If p.Connected AndAlso count > 1 Then
                    Dim pen = MakePen(p.LineColor, p.LineThickness, p.LineStyle)
                    For i = 1 To count - 1
                        context.DrawLine(pen,
                            New Point(p.XRange.ToPixel(xs(i - 1), plot.X, plot.Width), YAt(p, plot, tops(i - 1))),
                            New Point(p.XRange.ToPixel(xs(i), plot.X, plot.Width), YAt(p, plot, tops(i))))
                    Next
                End If
                If p.MarkerStyle <> ChartMarkerStyle.None Then
                    DrawMarkers(context, tops.Select(
                        Function(t, i)
                            Return New Point(p.XRange.ToPixel(xs(i), plot.X, plot.Width), YAt(p, plot, t))
                        End Function).ToArray(), p)
                End If
            Next
        End Sub
    End Class

    ''' <summary>
    ''' A PIE / DOUGHNUT chart: one wedge per labelled value. The slices come from the workbook's label and
    ''' value columns (the label column may hold text, dates or numbers — a pie is the one chart whose
    ''' categories are almost always words), or from the typed Labels and Values. A doughnut is the same
    ''' chart with DoughnutPercent above zero.
    ''' <para>
    ''' There is no cartesian frame here — no gridlines, no axes and no cursors — and the legend lists the
    ''' SLICES, so clicking an entry switches that slice off exactly as it switches a trace off on the other
    ''' charts. The colour of a slice is its own; the ones the form does not mention take a colour from the
    ''' chart's palette, and the Slices editor writes the overrides.
    ''' </para>
    ''' </summary>
    Public Class GrumpyPiePlot
        Inherits ChartBase

        ''' <summary>The wedge values (used when the chart has no workbook).</summary>
        Public Shared ReadOnly ValuesProperty As StyledProperty(Of Double()) =
            AvaloniaProperty.Register(Of GrumpyPiePlot, Double())(NameOf(Values))

        ''' <summary>The wedge names, one per value ("Jan,Feb,Mar"), used with Values.</summary>
        Public Shared ReadOnly LabelsProperty As StyledProperty(Of String()) =
            AvaloniaProperty.Register(Of GrumpyPiePlot, String())(NameOf(Labels))

        ''' <summary>How thick the ring is, as a percentage of the radius: 0 is a solid pie (the default),
        ''' 50 makes a doughnut whose hole is half the pie.</summary>
        Public Shared ReadOnly DoughnutPercentProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpyPiePlot, Double)(NameOf(DoughnutPercent))

        ''' <summary>Where the first slice starts: 0 is 12 o'clock, and the slices run clockwise from there.</summary>
        Public Shared ReadOnly StartAngleProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpyPiePlot, Double)(NameOf(StartAngle))

        ''' <summary>The gap between two neighbouring slices, in degrees (0 = they touch).</summary>
        Public Shared ReadOnly SliceGapProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpyPiePlot, Double)(NameOf(SliceGap))

        ''' <summary>The line drawn between two slices.</summary>
        Public Shared ReadOnly SliceBorderColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of GrumpyPiePlot, Color)(NameOf(SliceBorderColor), Colors.White)

        ''' <summary>How thick that line is (0 = no line, so the colours touch).</summary>
        Public Shared ReadOnly SliceBorderThicknessProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpyPiePlot, Double)(NameOf(SliceBorderThickness), 1.0R)

        ''' <summary>How far the slice under the pointer pops out of the ring, in pixels (10 by default,
        ''' 0 = it stays put and only the readout follows the pointer).</summary>
        Public Shared ReadOnly HoverExplodeProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpyPiePlot, Double)(NameOf(HoverExplode), 10.0R)

        ''' <summary>The wedge values (used when the chart has no workbook).</summary>
        <TypeConverter(GetType(DoubleArrayConverter))>
        Public Property Values As Double()
            Get
                Return GetValue(ValuesProperty)
            End Get
            Set(value As Double())
                SetValue(ValuesProperty, value)
            End Set
        End Property

        ''' <summary>The wedge names, one per value (used with Values).</summary>
        <TypeConverter(GetType(StringArrayConverter))>
        Public Property Labels As String()
            Get
                Return GetValue(LabelsProperty)
            End Get
            Set(value As String())
                SetValue(LabelsProperty, value)
            End Set
        End Property

        ''' <summary>How thick the ring is, as a percentage of the radius (0 = a solid pie).</summary>
        Public Property DoughnutPercent As Double
            Get
                Return GetValue(DoughnutPercentProperty)
            End Get
            Set(value As Double)
                SetValue(DoughnutPercentProperty, value)
            End Set
        End Property

        ''' <summary>Where the first slice starts, in degrees clockwise from 12 o'clock.</summary>
        Public Property StartAngle As Double
            Get
                Return GetValue(StartAngleProperty)
            End Get
            Set(value As Double)
                SetValue(StartAngleProperty, value)
            End Set
        End Property

        ''' <summary>The gap between two neighbouring slices, in degrees.</summary>
        Public Property SliceGap As Double
            Get
                Return GetValue(SliceGapProperty)
            End Get
            Set(value As Double)
                SetValue(SliceGapProperty, value)
            End Set
        End Property

        ''' <summary>Colour of the line between two slices.</summary>
        Public Property SliceBorderColor As Color
            Get
                Return GetValue(SliceBorderColorProperty)
            End Get
            Set(value As Color)
                SetValue(SliceBorderColorProperty, value)
            End Set
        End Property

        ''' <summary>Thickness of that line.</summary>
        Public Property SliceBorderThickness As Double
            Get
                Return GetValue(SliceBorderThicknessProperty)
            End Get
            Set(value As Double)
                SetValue(SliceBorderThicknessProperty, value)
            End Set
        End Property

        ''' <summary>How far the slice under the pointer pops out of the ring, in pixels.</summary>
        Public Property HoverExplode As Double
            Get
                Return GetValue(HoverExplodeProperty)
            End Get
            Set(value As Double)
                SetValue(HoverExplodeProperty, value)
            End Set
        End Property

        ''' <summary>
        ''' The slices the form names: one element per slice that should differ from the palette —
        ''' &lt;charts:PieSlice Title="North" LineColor="#E4572E" Explode="8"/&gt;. A slice the form does not
        ''' mention is drawn from the palette, and switching one off in the legend switches it off for the
        ''' session (which slices are switched on is runtime state, as it is for a series).
        ''' </summary>
        Public ReadOnly Property Slices As New AvaloniaList(Of PieSlice)()

        Protected Overrides ReadOnly Property ImplicitXFromIndex As Boolean
            Get
                Return True
            End Get
        End Property

        Protected Overrides ReadOnly Property HasCartesianAxes As Boolean
            Get
                Return False
            End Get
        End Property

        Protected Overrides ReadOnly Property SupportsCursors As Boolean
            Get
                Return False
            End Get
        End Property

        ''' <summary>
        ''' The pie reports the slice under the pointer: it pops out of the ring by HoverExplode pixels and
        ''' its name, its value and its share of the total appear in the readout panel. That is what
        ''' replaces the cursors here — there is no cartesian frame for a crosshair to read.
        ''' </summary>
        Friend Overrides ReadOnly Property SupportsHoverReadout As Boolean
            Get
                Return True
            End Get
        End Property

        Protected Overrides Function InlineData() As ChartData
            ' Not named 'values': VB is case-insensitive and would match the property above.
            Dim samples = If(Values, Array.Empty(Of Double)())
            Dim names = If(Labels, Array.Empty(Of String)())
            Return New ChartData With {
                .Xs = Enumerable.Range(0, samples.Length).Select(Function(i) CDbl(i)).ToArray(),
                .Ys = samples,
                .Labels = Enumerable.Range(0, samples.Length).Select(
                    Function(i)
                        If i < names.Length AndAlso Not String.IsNullOrWhiteSpace(names(i)) Then
                            Return names(i)
                        End If
                        Return "Slice " & (i + 1).ToString(CultureInfo.InvariantCulture)
                    End Function).ToArray()
            }
        End Function

        Protected Overrides Sub SetInlineData(xs As Double(), ys As Double())
            Values = ys
        End Sub

        Protected Overrides Sub OnPropertyChanged(change As AvaloniaPropertyChangedEventArgs)
            MyBase.OnPropertyChanged(change)
            If change.Property Is ValuesProperty OrElse change.Property Is LabelsProperty OrElse
               change.Property Is DoughnutPercentProperty OrElse change.Property Is StartAngleProperty OrElse
               change.Property Is SliceGapProperty OrElse change.Property Is SliceBorderColorProperty OrElse
               change.Property Is SliceBorderThicknessProperty OrElse change.Property Is HoverExplodeProperty Then
                Reload()
            End If
        End Sub

        ''' <summary>The colours a slice takes when the form does not name one.</summary>
        Private Shared ReadOnly SlicePalette As Color() = {
            Color.Parse("#2D7DD2"), Color.Parse("#E4572E"), Color.Parse("#3FA34D"), Color.Parse("#F2A541"),
            Color.Parse("#8367C7"), Color.Parse("#00A6A6"), Color.Parse("#C05780"), Color.Parse("#6B7A8F"),
            Color.Parse("#8CB369"), Color.Parse("#B5651D")
        }

        ''' <summary>Stand-ins for the slices the form does not name, kept so the legend's tick boxes stick.</summary>
        Private ReadOnly _sliceStubs As New Dictionary(Of String, PieSlice)()

        ''' <summary>
        ''' One wedge as the last render drew it, for hit-testing the pointer. The centre kept here is the
        ''' PIE's, not the slice's exploded one, and the angles are its ends before the gap was taken off:
        ''' while a slice is popped out it has to stay "under the pointer", so the test is against the pie as
        ''' it stands rather than against a picture that has just moved out from under the mouse.
        ''' </summary>
        Private NotInheritable Class SliceHit
            ''' <summary>Which plot this wedge was drawn from (its index in the chart's own list).</summary>
            Friend Index As Integer
            ''' <summary>The pie's centre.</summary>
            Friend Centre As Point
            ''' <summary>The outer radius.</summary>
            Friend Radius As Double
            ''' <summary>The hole's radius (0 for a solid pie).</summary>
            Friend Inner As Double
            ''' <summary>The wedge's first edge, in the pie's own degrees (0° = 12 o'clock, clockwise).</summary>
            Friend From As Double
            ''' <summary>Its second edge, in the same degrees.</summary>
            Friend [To] As Double
            Friend Title As String = String.Empty
            Friend Value As Double
            ''' <summary>Its share of the visible total, in percent.</summary>
            Friend Share As Double
            Friend Fill As Color = Colors.White
        End Class

        ''' <summary>Every wedge the last render drew, in drawing order, for the pointer test.</summary>
        Private ReadOnly _sliceHits As New List(Of SliceHit)()

        ''' <summary>The plot index of the wedge the pointer is over, or −1. It only affects the picture:
        ''' that slice pops out by HoverExplode pixels (see DrawSeriesLayer).</summary>
        Private _hoverSlice As Integer = -1

        ''' <summary>
        ''' Finds the wedge under the pointer: inside the ring — a doughnut's hole belongs to no slice — and
        ''' between that wedge's own two edges, so the pointer over a gap clears the readout instead of
        ''' blaming a neighbour. The angles are the very degrees the drawing used, so the two cannot
        ''' disagree.
        ''' </summary>
        Friend Overrides Sub UpdateHover(point As Point, plot As Rect)
            For Each hit In _sliceHits
                Dim dx = point.X - hit.Centre.X
                Dim dy = point.Y - hit.Centre.Y
                Dim distance = Math.Sqrt(dx * dx + dy * dy)
                If distance > hit.Radius OrElse distance < hit.Inner Then Continue For
                If Not InWedge(hit, dx, dy) Then Continue For
                ' Still the same slice: the panel just follows the mouse (nothing to rebuild).
                If _hoverSlice = hit.Index Then Return
                _hoverSlice = hit.Index
                Hover = New ReadoutPanel With {
                    .Head = hit.Title,
                    .HeadColor = hit.Fill,
                    .Body = FormatReading(hit.Value) & "   " & FormatShare(hit.Share),
                    .Accent = hit.Fill,
                    .FollowPointer = True}
                Return
            Next
            ClearHover()
        End Sub

        ''' <summary>Forgets the hovered wedge, so its readout goes with the pointer.</summary>
        Friend Overrides Sub ClearHover()
            _hoverSlice = -1
            Hover = Nothing
        End Sub

        ''' <summary>True when the vector from the pie's centre to the pointer falls inside one wedge's two
        ''' edges. OnCircle takes the same degrees, so the test and the drawing agree.</summary>
        Private Shared Function InWedge(hit As SliceHit, dx As Double, dy As Double) As Boolean
            Dim degrees = Math.Atan2(dy, dx) * 180.0 / Math.PI
            Dim relative = (degrees - hit.From) Mod 360.0
            If relative < 0 Then relative += 360.0
            Return relative <= hit.[To] - hit.From
        End Function

        ''' <summary>
        ''' One plot per SLICE, which is what makes the shared machinery work: the legend lists the slices
        ''' with their colours, clicking an entry switches that wedge off, and the drawing below reads the
        ''' same list back. PieSlice is a ChartSeries, so a slice and a series are described by the same
        ''' properties.
        ''' </summary>
        Friend Overrides Function BuildPlots() As List(Of Plot)
            Dim data = DataFor(If(XColumn, "B"), If(YColumn, "C"), True, labelPairs:=True)
            Dim plots As New List(Of Plot)()
            For i = 0 To data.Ys.Length - 1
                Dim name = If(i < data.Labels.Length AndAlso Not String.IsNullOrWhiteSpace(data.Labels(i)),
                              data.Labels(i), "Slice " & (i + 1).ToString(CultureInfo.InvariantCulture))
                Dim slice = SliceFor(name, i)
                plots.Add(New Plot With {
                    .Data = New ChartData With {
                        .Xs = New Double() {0.0R},
                        .Ys = New Double() {data.Ys(i)},
                        .Labels = New String() {name},
                        .XTitle = data.XTitle,
                        .YTitle = name
                    },
                    .Definition = slice,
                    .LineColor = slice.LineColor,
                    .Visible = slice.Visible
                })
            Next
            ' A workbook that could not be read has nothing to draw, and its message has to survive: the
            ' empty plot carries it into the chart's "no data" line.
            If plots.Count = 0 AndAlso data.Error IsNot Nothing Then
                plots.Add(New Plot With {.Data = New ChartData With {.Error = data.Error}})
            End If
            Return plots
        End Function

        ''' <summary>The named slice for this wedge, or a remembered stand-in with its palette colour.</summary>
        Private Function SliceFor(name As String, index As Integer) As PieSlice
            For Each slice In Slices
                If String.Equals(slice.Title, name, StringComparison.OrdinalIgnoreCase) Then Return slice
            Next
            Dim stub As PieSlice = Nothing
            If _sliceStubs.TryGetValue(name, stub) Then Return stub
            Dim made As New PieSlice With {.Title = name, .LineColor = SlicePalette(index Mod SlicePalette.Length)}
            _sliceStubs(name) = made
            Return made
        End Function

        ''' <summary>
        ''' Draws the wedges. Each one is an arc out at the radius and back in at the ring's inner radius
        ''' (or back to the centre for a solid pie), which is one closed path either way — so a doughnut is
        ''' the same drawing with a hole in it. A slice may explode outwards along its own middle, and the
        ''' slice under the pointer pops out by HoverExplode pixels on top of that; the gap is taken off both
        ''' of a slice's edges so the gaps stay even. Every wedge is remembered as it is drawn, which is what
        ''' the pointer is tested against afterwards (see UpdateHover).
        ''' </summary>
        Friend Overrides Sub DrawSeriesLayer(context As DrawingContext, plots As List(Of Plot), plot As Rect)
            _sliceHits.Clear()
            Dim total As Double = 0
            For Each p In plots
                If p.Visible AndAlso p.Data.HasData Then total += Math.Max(0, p.Data.Ys(0))
            Next
            If total <= 0 Then Return

            Dim side = Math.Min(plot.Width, plot.Height)
            If side <= 4 Then Return
            Dim centre As New Point(plot.X + plot.Width / 2, plot.Y + plot.Height / 2)
            Dim radius = side / 2
            Dim inner = radius * Math.Clamp(DoughnutPercent, 0, 95) / 100.0
            Dim gap = Math.Max(0, SliceGap)
            Dim border As IPen = Nothing
            If SliceBorderThickness > 0 Then border = MakePen(SliceBorderColor, SliceBorderThickness, ChartLineStyle.Solid)
            Dim angle = StartAngle - 90.0    ' 0° is 12 o'clock; -90° is where a circle's 0 radian sits

            For i = 0 To plots.Count - 1
                Dim p = plots(i)
                If Not p.Visible OrElse Not p.Data.HasData Then Continue For
                Dim value = Math.Max(0, p.Data.Ys(0))
                If value <= 0 Then Continue For

                Dim sweep = value / total * 360.0
                Dim from = angle + gap / 2
                Dim [to] = angle + sweep - gap / 2
                angle += sweep
                If [to] - from <= 0.01 Then Continue For

                Dim origin = centre
                Dim exploded = TryCast(p.Definition, PieSlice)
                Dim push As Double = If(exploded Is Nothing, 0.0, exploded.Explode)
                If i = _hoverSlice Then push += Math.Max(0, HoverExplode)
                If push > 0 Then
                    Dim middle = (from + [to]) / 2 * Math.PI / 180.0
                    origin = New Point(centre.X + Math.Cos(middle) * push,
                                       centre.Y + Math.Sin(middle) * push)
                End If

                Dim large = [to] - from > 180.0
                Dim geometry As New StreamGeometry()
                Using g = geometry.Open()
                    g.BeginFigure(OnCircle(origin, radius, from), True)
                    g.ArcTo(OnCircle(origin, radius, [to]), New Size(radius, radius), 0, large, SweepDirection.Clockwise)
                    If inner > 0 Then
                        g.LineTo(OnCircle(origin, inner, [to]))
                        g.ArcTo(OnCircle(origin, inner, from), New Size(inner, inner), 0, large, SweepDirection.CounterClockwise)
                    Else
                        g.LineTo(origin)
                    End If
                    g.EndFigure(True)
                End Using
                context.DrawGeometry(New SolidColorBrush(p.LineColor), border, geometry)

                _sliceHits.Add(New SliceHit With {
                    .Index = i,
                    .Centre = centre,
                    .Radius = radius,
                    .Inner = inner,
                    .From = from,
                    .[To] = [to],
                    .Title = If(p.Data.Labels.Length > 0, p.Data.Labels(0), "Slice " & (i + 1).ToString(CultureInfo.InvariantCulture)),
                    .Value = value,
                    .Share = value / total * 100.0,
                    .Fill = p.LineColor})
            Next
        End Sub

        ''' <summary>The point DEGREES around a circle (0° = 12 o'clock, clockwise).</summary>
        Private Shared Function OnCircle(centre As Point, radius As Double, degrees As Double) As Point
            Dim radians = degrees * Math.PI / 180.0
            Return New Point(centre.X + Math.Cos(radians) * radius, centre.Y + Math.Sin(radians) * radius)
        End Function
    End Class

    ''' <summary>
    ''' A WATERFALL (spectral) chart: successive samplesets drawn one behind the other as 3D traces — the
    ''' sample points run across X, each sample's value stands up the Y axis, and every successive set of
    ''' samples recedes along the depth (Z) axis. This is the picture a spectrum analyser draws while it
    ''' captures: one sweep per trace, and a peak that walks across the samples from set to set is a ridge the
    ''' eye can follow.
    ''' <para>
    ''' Avalonia has no 3D, so the view is an ORTHOGRAPHIC PROJECTION computed here: the data is mapped into a
    ''' unit cube (x = samples, y = value, z = set), the cube is turned to Azimuth and seen from Elevation, and
    ''' every point is projected to a pixel. The traces are then painted from the FARTHEST set to the nearest,
    ''' so a solid ribbon hides the ones behind it — the painter's algorithm, and what makes a flat picture read
    ''' as depth. Zoom scales the fitted picture.
    ''' </para>
    ''' <para>
    ''' ONE SERIES IS ONE SAMPLESET — its own spreadsheet column, so the columns C, D, E … are sets 1, 2, 3 … and
    ''' the row number is the sample point. That is what makes the Series editor, the legend, its tick boxes and
    ''' the per-series colours work here unchanged: a set's name in the legend is its own Title.
    ''' </para>
    ''' <para>
    ''' The picture can be turned while the app runs: dragging the chart changes the angle, and the saved form is
    ''' not touched by that (set Elevation and Azimuth to make an angle permanent). The pointer reports the
    ''' sample it is over in the readout panel; there are no cursors, because a crosshair on a projected cube has
    ''' nothing to read.
    ''' </para>
    ''' </summary>
    Public Class GrumpyWaterfallPlot
        Inherits ChartBase

        ''' <summary>The implicit single sampleset, used only when the chart has no series elements.</summary>
        Public Shared ReadOnly ValuesProperty As StyledProperty(Of Double()) =
            AvaloniaProperty.Register(Of GrumpyWaterfallPlot, Double())(NameOf(Values))

        ''' <summary>Several samplesets written inline, one per semicolon-separated group
        ''' (SampleSets="1,2,3; 4,5,6") — a sketch without a workbook. A real capture names one column per
        ''' sampleset instead (one series each).</summary>
        Public Shared ReadOnly SampleSetsProperty As StyledProperty(Of Double()()) =
            AvaloniaProperty.Register(Of GrumpyWaterfallPlot, Double()())(NameOf(SampleSets))

        ''' <summary>How each sampleset is drawn (see WaterfallStyle).</summary>
        Public Shared ReadOnly RibbonStyleProperty As StyledProperty(Of WaterfallStyle) =
            AvaloniaProperty.Register(Of GrumpyWaterfallPlot, WaterfallStyle)(NameOf(RibbonStyle))

        ''' <summary>How solid a translucent ribbon is, in percent.</summary>
        Public Shared ReadOnly RibbonOpacityProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpyWaterfallPlot, Double)(NameOf(RibbonOpacity), 80.0R)

        ''' <summary>What decides the colour of a trace (see WaterfallColorMode).</summary>
        Public Shared ReadOnly ColorModeProperty As StyledProperty(Of WaterfallColorMode) =
            AvaloniaProperty.Register(Of GrumpyWaterfallPlot, WaterfallColorMode)(NameOf(ColorMode))

        ''' <summary>The value the heat map's low end sits at (NaN = the data's own least value).</summary>
        Public Shared ReadOnly HeatMinProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpyWaterfallPlot, Double)(NameOf(HeatMin), Double.NaN)

        ''' <summary>The value the heat map's top end sits at (NaN = the data's own largest value).</summary>
        Public Shared ReadOnly HeatMaxProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpyWaterfallPlot, Double)(NameOf(HeatMax), Double.NaN)

        ''' <summary>The value the Split colour mode changes colour at (0 puts one colour below zero and
        ''' another above it, which is how a negative excursion is made obvious).</summary>
        Public Shared ReadOnly SplitValueProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpyWaterfallPlot, Double)(NameOf(SplitValue))

        ''' <summary>The colour of everything below SplitValue.</summary>
        Public Shared ReadOnly BelowColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of GrumpyWaterfallPlot, Color)(NameOf(BelowColor), Color.Parse("#2D7DD2"))

        ''' <summary>The colour of everything above SplitValue.</summary>
        Public Shared ReadOnly AboveColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of GrumpyWaterfallPlot, Color)(NameOf(AboveColor), Color.Parse("#E4572E"))

        ''' <summary>Join the samplesets with the connectors that make the mesh (off = bare traces).</summary>
        Public Shared ReadOnly ShowConnectorsProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of GrumpyWaterfallPlot, Boolean)(NameOf(ShowConnectors), True)

        ''' <summary>Colour of those connectors in the Sampleset and Split colour modes (the Value mode draws
        ''' them as part of the heat map instead).</summary>
        Public Shared ReadOnly ConnectorColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of GrumpyWaterfallPlot, Color)(NameOf(ConnectorColor), Color.Parse("#6B7A8F"))

        ''' <summary>How thick the connectors are (0 = invisible).</summary>
        Public Shared ReadOnly ConnectorThicknessProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpyWaterfallPlot, Double)(NameOf(ConnectorThickness), 1.0R)

        ''' <summary>One connector every N drawn samples; 0 puts them where they stay readable (about forty per
        ''' trace), which is what a 2048-point set needs.</summary>
        Public Shared ReadOnly ConnectorStepProperty As StyledProperty(Of Integer) =
            AvaloniaProperty.Register(Of GrumpyWaterfallPlot, Integer)(NameOf(ConnectorStep))

        ''' <summary>How many samples of a trace are DRAWN at most (0 = every one). A 2048-point set thinned to
        ''' 512 still shows every peak that survives at screen resolution, and the picture stays interactive
        ''' while it is being turned. The stride is the SAME for every trace, because the mesh joins sample i of
        ''' one set to sample i of the next — thin them differently and the connectors would lean.</summary>
        Public Shared ReadOnly MaxPointsProperty As StyledProperty(Of Integer) =
            AvaloniaProperty.Register(Of GrumpyWaterfallPlot, Integer)(NameOf(MaxPoints), 512)

        ''' <summary>How far above the floor the chart is seen from, in degrees (0 = edge on, 89 = straight
        ''' down). 30 shows the ribbons and the mesh at once.</summary>
        Public Shared ReadOnly ElevationProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpyWaterfallPlot, Double)(NameOf(Elevation), 30.0R)

        ''' <summary>Where the cube is turned to, in degrees (45 is the usual three-quarter view, with the sets
        ''' receding to the right).</summary>
        Public Shared ReadOnly AzimuthProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpyWaterfallPlot, Double)(NameOf(Azimuth), 45.0R)

        ''' <summary>How deep the samplesets stand apart, as a fraction of the fitted depth: 1 uses all of it,
        ''' 0.5 packs them half as deep.</summary>
        Public Shared ReadOnly ZSpacingProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpyWaterfallPlot, Double)(NameOf(ZSpacing), 1.0R)

        ''' <summary>Scales the fitted picture: 1 fits the cube into the frame, 1.2 makes it larger than the
        ''' frame (the edges then leave it), 0.8 leaves a margin.</summary>
        Public Shared ReadOnly ZoomProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpyWaterfallPlot, Double)(NameOf(Zoom), 1.0R)

        ''' <summary>The name along the depth axis — what one step in it is ("Sweep", "Run"). Each set's own
        ''' name in the legend comes from its series Title.</summary>
        Public Shared ReadOnly ZAxisTitleProperty As StyledProperty(Of String) =
            AvaloniaProperty.Register(Of GrumpyWaterfallPlot, String)(NameOf(ZAxisTitle))

        ''' <summary>The sampleset of a chart that has no series elements.</summary>
        <TypeConverter(GetType(DoubleArrayConverter))>
        Public Property Values As Double()
            Get
                Return GetValue(ValuesProperty)
            End Get
            Set(value As Double())
                SetValue(ValuesProperty, value)
            End Set
        End Property

        ''' <summary>Several samplesets written inline, one per semicolon-separated group.</summary>
        <TypeConverter(GetType(DoubleSetConverter))>
        Public Property SampleSets As Double()()
            Get
                Return GetValue(SampleSetsProperty)
            End Get
            Set(value As Double()())
                SetValue(SampleSetsProperty, value)
            End Set
        End Property

        ''' <summary>Ribbon, translucent ribbon, or lines only.</summary>
        Public Property RibbonStyle As WaterfallStyle
            Get
                Return GetValue(RibbonStyleProperty)
            End Get
            Set(value As WaterfallStyle)
                SetValue(RibbonStyleProperty, value)
            End Set
        End Property

        ''' <summary>How solid a translucent ribbon is, in percent.</summary>
        Public Property RibbonOpacity As Double
            Get
                Return GetValue(RibbonOpacityProperty)
            End Get
            Set(value As Double)
                SetValue(RibbonOpacityProperty, value)
            End Set
        End Property

        ''' <summary>What colours the traces.</summary>
        Public Property ColorMode As WaterfallColorMode
            Get
                Return GetValue(ColorModeProperty)
            End Get
            Set(value As WaterfallColorMode)
                SetValue(ColorModeProperty, value)
            End Set
        End Property

        ''' <summary>Where the heat map's low end sits (NaN = the data's own least value).</summary>
        Public Property HeatMin As Double
            Get
                Return GetValue(HeatMinProperty)
            End Get
            Set(value As Double)
                SetValue(HeatMinProperty, value)
            End Set
        End Property

        ''' <summary>Where the heat map's top end sits (NaN = the data's own largest value).</summary>
        Public Property HeatMax As Double
            Get
                Return GetValue(HeatMaxProperty)
            End Get
            Set(value As Double)
                SetValue(HeatMaxProperty, value)
            End Set
        End Property

        ''' <summary>The value the Split colour mode changes colour at.</summary>
        Public Property SplitValue As Double
            Get
                Return GetValue(SplitValueProperty)
            End Get
            Set(value As Double)
                SetValue(SplitValueProperty, value)
            End Set
        End Property

        ''' <summary>The colour below the split value.</summary>
        Public Property BelowColor As Color
            Get
                Return GetValue(BelowColorProperty)
            End Get
            Set(value As Color)
                SetValue(BelowColorProperty, value)
            End Set
        End Property

        ''' <summary>The colour above the split value.</summary>
        Public Property AboveColor As Color
            Get
                Return GetValue(AboveColorProperty)
            End Get
            Set(value As Color)
                SetValue(AboveColorProperty, value)
            End Set
        End Property

        ''' <summary>Draw the mesh that joins the samplesets.</summary>
        Public Property ShowConnectors As Boolean
            Get
                Return GetValue(ShowConnectorsProperty)
            End Get
            Set(value As Boolean)
                SetValue(ShowConnectorsProperty, value)
            End Set
        End Property

        ''' <summary>The colour of the connectors.</summary>
        Public Property ConnectorColor As Color
            Get
                Return GetValue(ConnectorColorProperty)
            End Get
            Set(value As Color)
                SetValue(ConnectorColorProperty, value)
            End Set
        End Property

        ''' <summary>The thickness of the connectors.</summary>
        Public Property ConnectorThickness As Double
            Get
                Return GetValue(ConnectorThicknessProperty)
            End Get
            Set(value As Double)
                SetValue(ConnectorThicknessProperty, value)
            End Set
        End Property

        ''' <summary>One connector every N drawn samples (0 = automatic).</summary>
        Public Property ConnectorStep As Integer
            Get
                Return GetValue(ConnectorStepProperty)
            End Get
            Set(value As Integer)
                SetValue(ConnectorStepProperty, value)
            End Set
        End Property

        ''' <summary>How many samples of a trace are drawn at most (0 = all of them).</summary>
        Public Property MaxPoints As Integer
            Get
                Return GetValue(MaxPointsProperty)
            End Get
            Set(value As Integer)
                SetValue(MaxPointsProperty, value)
            End Set
        End Property

        ''' <summary>The angle the chart is seen from, in degrees above the floor.</summary>
        Public Property Elevation As Double
            Get
                Return GetValue(ElevationProperty)
            End Get
            Set(value As Double)
                SetValue(ElevationProperty, value)
            End Set
        End Property

        ''' <summary>Where the cube is turned to, in degrees.</summary>
        Public Property Azimuth As Double
            Get
                Return GetValue(AzimuthProperty)
            End Get
            Set(value As Double)
                SetValue(AzimuthProperty, value)
            End Set
        End Property

        ''' <summary>How deep the samplesets stand apart.</summary>
        Public Property ZSpacing As Double
            Get
                Return GetValue(ZSpacingProperty)
            End Get
            Set(value As Double)
                SetValue(ZSpacingProperty, value)
            End Set
        End Property

        ''' <summary>Scales the fitted picture.</summary>
        Public Property Zoom As Double
            Get
                Return GetValue(ZoomProperty)
            End Get
            Set(value As Double)
                SetValue(ZoomProperty, value)
            End Set
        End Property

        ''' <summary>The name along the depth axis.</summary>
        Public Property ZAxisTitle As String
            Get
                Return GetValue(ZAxisTitleProperty)
            End Get
            Set(value As String)
                SetValue(ZAxisTitleProperty, value)
            End Set
        End Property

        Protected Overrides ReadOnly Property ImplicitXFromIndex As Boolean
            Get
                Return True
            End Get
        End Property

        ''' <summary>The ribbons fill down to zero, so zero is always on the amplitude scale.</summary>
        Protected Overrides ReadOnly Property ZeroBaseline As Boolean
            Get
                Return True
            End Get
        End Property

        ''' <summary>No cartesian frame: this chart draws its own three axes in projection, so the base's axis
        ''' furniture steps aside and the drawing gets the whole frame.</summary>
        Protected Overrides ReadOnly Property HasCartesianAxes As Boolean
            Get
                Return False
            End Get
        End Property

        Protected Overrides ReadOnly Property SupportsCursors As Boolean
            Get
                Return False
            End Get
        End Property

        ''' <summary>The pointer reports the sample under it — there is nothing else on this chart to grab, and
        ''' the numbers it reads are the whole point of a waterfall.</summary>
        Friend Overrides ReadOnly Property SupportsHoverReadout As Boolean
            Get
                Return True
            End Get
        End Property

        ''' <summary>A sampleset typed in through SampleSets is still a set of its own, so it is listed in the
        ''' legend as "Set n" — a waterfall sketched without a workbook keeps its legend.</summary>
        Friend Overrides Function InlineLegendName(index As Integer) As String
            Return $"Set {index + 1}"
        End Function

        Protected Overrides Function InlineData() As ChartData
            Dim samples = If(Values, Array.Empty(Of Double)())
            Return New ChartData With {
                .Xs = Enumerable.Range(0, samples.Length).Select(Function(i) CDbl(i)).ToArray(),
                .Ys = samples
            }
        End Function

        Protected Overrides Sub SetInlineData(xs As Double(), ys As Double())
            Values = ys
        End Sub

        Protected Overrides Sub OnPropertyChanged(change As AvaloniaPropertyChangedEventArgs)
            MyBase.OnPropertyChanged(change)
            If change.Property Is ValuesProperty OrElse change.Property Is SampleSetsProperty Then
                ' The data itself changed: the read is cached, so it has to be dropped as well.
                Reload()
            ElseIf change.Property Is RibbonStyleProperty OrElse change.Property Is RibbonOpacityProperty OrElse
                   change.Property Is ColorModeProperty OrElse change.Property Is HeatMinProperty OrElse
                   change.Property Is HeatMaxProperty OrElse change.Property Is SplitValueProperty OrElse
                   change.Property Is BelowColorProperty OrElse change.Property Is AboveColorProperty OrElse
                   change.Property Is ShowConnectorsProperty OrElse change.Property Is ConnectorColorProperty OrElse
                   change.Property Is ConnectorThicknessProperty OrElse change.Property Is ConnectorStepProperty OrElse
                   change.Property Is MaxPointsProperty OrElse change.Property Is ElevationProperty OrElse
                   change.Property Is AzimuthProperty OrElse change.Property Is ZSpacingProperty OrElse
                   change.Property Is ZoomProperty OrElse change.Property Is ZAxisTitleProperty Then
                ' Appearance: the data is fine, only the picture has to be drawn again.
                InvalidateVisual()
            End If
        End Sub

        ''' <summary>The colours of the Value mode's heat map, from the least value to the greatest: a spectrum
        ''' analyser's blue → cyan → green → yellow → red.</summary>
        Private Shared ReadOnly HeatPalette As Color() = {
            Color.Parse("#1B2A6B"), Color.Parse("#1E88E5"), Color.Parse("#43A047"), Color.Parse("#FDD835"),
            Color.Parse("#E53935")
        }

        ''' <summary>The colours the samplesets take when a chart written INLINE has no series to colour them:
        ''' successive sets must be tellable apart, so they walk a palette the way the pie's slices do.</summary>
        Private Shared ReadOnly SetPalette As Color() = {
            Color.Parse("#2D7DD2"), Color.Parse("#E4572E"), Color.Parse("#3FA34D"), Color.Parse("#F2A541"),
            Color.Parse("#8367C7"), Color.Parse("#00A6A6"), Color.Parse("#C05780"), Color.Parse("#6B7A8F"),
            Color.Parse("#8CB369"), Color.Parse("#B5651D")
        }

        ''' <summary>One projected sample, kept so the pointer can be tested against the picture that is on
        ''' screen rather than against the model.</summary>
        Private NotInheritable Class SampleHit
            Friend Screen As Point
            Friend SetIndex As Integer
            Friend Name As String = String.Empty
            Friend Fill As Color = Colors.White
            Friend Sample As Double
            Friend Value As Double
        End Class

        ''' <summary>Every sample the last render drew, for the pointer test.</summary>
        Private ReadOnly _sampleHits As New List(Of SampleHit)()

        ''' <summary>The sample the pointer is over (or Nothing), kept so the panel is only rebuilt when the
        ''' pointer moves from one sample to another.</summary>
        Private _hoverSample As SampleHit

        ''' <summary>Dragging the chart turns the view. Runtime state only: the angles a form opens with are
        ''' its Elevation and Azimuth properties.</summary>
        Private _rotateDrag As Boolean
        Private _rotateFrom As Point
        Private _rotateElevation As Double
        Private _rotateAzimuth As Double

        ''' <summary>
        ''' The ORTHOGRAPHIC VIEW: a point of the unit cube (x = samples 0…1, y = value 0…1, z = sampleset 0…1)
        ''' to a pixel. Built once per render from the two angles, the zoom and the plot area, then asked for
        ''' every point — which is why projecting a whole 2048-point set is nothing more than a multiply and an
        ''' add per coordinate.
        ''' </summary>
        Private NotInheritable Class WaterfallView
            Friend CosAzimuth As Double
            Friend SinAzimuth As Double
            Friend CosElevation As Double
            Friend SinElevation As Double
            Friend Scale As Double
            Friend Origin As Point

            ''' <summary>To the screen: turn the cube by the azimuth, tip it by the elevation, drop the depth.</summary>
            Friend Function Project(x As Double, y As Double, z As Double) As Point
                Dim turned = x * CosAzimuth + z * SinAzimuth
                Dim viewDepth = -x * SinAzimuth + z * CosAzimuth
                Dim up = y * CosElevation + viewDepth * SinElevation
                Return New Point(Origin.X + turned * Scale, Origin.Y - up * Scale)
            End Function

            ''' <summary>How near the eye a point is: the larger, the nearer. This is what puts the traces in
            ''' paint order (farthest first), so a nearer ribbon hides the ones behind it. The sign matters and
            ''' is easy to get backwards — with the screen directions this projection produces, the floor's
            ''' z = 0 edge is the FRONT one, and drawing that first would let the ribbons at the back paint over
            ''' the ones in front (measured: the far set showed 27% more of itself than the near one, which is
            ''' what a backwards painter's order looks like).</summary>
            Friend Function Depth(x As Double, y As Double, z As Double) As Double
                Dim viewDepth = -x * SinAzimuth + z * CosAzimuth
                Return y * SinElevation - viewDepth * CosElevation
            End Function

            ''' <summary>The screen direction of a step along one of the world axes, as a unit vector in pixels.
            ''' The tick marks and the labels of the projected axes are laid out with it.</summary>
            Friend Function Direction(dx As Double, dy As Double, dz As Double) As Point
                Dim turned = dx * CosAzimuth + dz * SinAzimuth
                Dim depth = -dx * SinAzimuth + dz * CosAzimuth
                Dim up = dy * CosElevation + depth * SinElevation
                Dim length = Math.Sqrt(turned * turned + up * up)
                If length <= 0 Then Return New Point(0, -1)
                Return New Point(turned / length, -up / length)
            End Function
        End Class

        ''' <summary>
        ''' The chart's data in the picture's own terms: the two scales (what value is 0 and what is 1 in the
        ''' cube), the depth each sampleset stands at, and the view itself. Every drawing step is handed one of
        ''' these, so no step has to remember how a value becomes a pixel.
        ''' </summary>
        Private NotInheritable Class WaterfallWorld
            Friend View As WaterfallView
            Friend Xs As AxisRange = New AxisRange()
            Friend Ys As AxisRange = New AxisRange()
            Friend Sets As Integer
            Friend Depth As Double = 1.0

            ''' <summary>The samples, across the cube from 0 to 1.</summary>
            Friend Function UnitX(x As Double) As Double
                Return Clamp01((x - Xs.Min) / Math.Max(0.000000001, Xs.Max - Xs.Min))
            End Function

            ''' <summary>The values, up the cube from 0 to 1.</summary>
            Friend Function UnitY(y As Double) As Double
                Return Clamp01((y - Ys.Min) / Math.Max(0.000000001, Ys.Max - Ys.Min))
            End Function

            ''' <summary>How deep one sampleset stands: the first at the front, the last at the back. A chart
            ''' with a single set stands it in the middle of the depth, where the floor is widest.</summary>
            Friend Function UnitZ(setIndex As Integer) As Double
                If Sets <= 1 Then Return Depth / 2
                Return setIndex / CDbl(Sets - 1) * Depth
            End Function

            ''' <summary>A point of the picture.</summary>
            Friend Function At(x As Double, y As Double, setIndex As Integer) As Point
                Return View.Project(UnitX(x), UnitY(y), UnitZ(setIndex))
            End Function

            ''' <summary>A point on the floor, where the ribbons end and the gridlines run.</summary>
            Friend Function Base(x As Double, setIndex As Integer) As Point
                Return View.Project(UnitX(x), UnitY(0), UnitZ(setIndex))
            End Function

            Private Shared Function Clamp01(value As Double) As Double
                If value < 0 Then Return 0
                If value > 1 Then Return 1
                Return value
            End Function
        End Class

        ''' <summary>The view for one render: the angles clamped to what can be drawn, then FITTED — the cube's
        ''' own corners decide the scale, so the picture can never leave the frame by accident, whatever the
        ''' angles are.</summary>
        Private Function MakeView(plot As Rect) As WaterfallView
            Dim elevationAngle = Math.Clamp(Elevation, 0, 89) * Math.PI / 180.0
            Dim azimuthAngle = Azimuth * Math.PI / 180.0
            Dim view As New WaterfallView With {
                .CosElevation = Math.Cos(elevationAngle),
                .SinElevation = Math.Sin(elevationAngle),
                .CosAzimuth = Math.Cos(azimuthAngle),
                .SinAzimuth = Math.Sin(azimuthAngle),
                .Scale = 1,
                .Origin = New Point(0, 0)}
            Dim depth = Math.Clamp(ZSpacing, 0.1, 4)
            Dim minX = Double.MaxValue
            Dim maxX = Double.MinValue
            Dim minY = Double.MaxValue
            Dim maxY = Double.MinValue
            For Each x In New Double() {0, 1}
                For Each y In New Double() {0, 1}
                    For Each z In New Double() {0, depth}
                        Dim corner = view.Project(x, y, z)
                        minX = Math.Min(minX, corner.X)
                        maxX = Math.Max(maxX, corner.X)
                        minY = Math.Min(minY, corner.Y)
                        maxY = Math.Max(maxY, corner.Y)
                    Next
                Next
            Next
            Dim wide = Math.Max(0.000001, maxX - minX)
            Dim tall = Math.Max(0.000001, maxY - minY)
            view.Scale = Math.Min(plot.Width / wide, plot.Height / tall) * Math.Clamp(Zoom, 0.2, 5)
            view.Origin = New Point(
                plot.X + (plot.Width - wide * view.Scale) / 2 - minX * view.Scale,
                plot.Y + (plot.Height - tall * view.Scale) / 2 - minY * view.Scale)
            Return view
        End Function

        ''' <summary>
        ''' One sampleset per series: the series' own Y column, else the chart's YColumn and then the next column
        ''' along (C, D, E …), read with the sample NUMBER along X — a spectrum per column is how a capture is
        ''' laid out.
        ''' </summary>
        Friend Overrides Function BuildPlots() As List(Of Plot)
            Dim plots As New List(Of Plot)()
            If Series.Count = 0 Then
                Dim sets = SampleSets
                If sets IsNot Nothing AndAlso sets.Length > 0 Then
                    ' A chart sketched inline: one sampleset per semicolon-separated group, each in its own
                    ' colour of the palette so successive sets can be told apart.
                    For i = 0 To sets.Length - 1
                        plots.Add(New Plot With {
                            .Data = New ChartData With {
                                .Xs = Enumerable.Range(1, sets(i).Length).Select(Function(n) CDbl(n)).ToArray(),
                                .Ys = sets(i)
                            },
                            .LineColor = SetPalette(i Mod SetPalette.Length),
                            .LineThickness = LineThickness,
                            .LineStyle = LineStyle})
                    Next
                Else
                    plots.Add(New Plot With {
                        .Data = Sampleset(Nothing, If(YColumn, "C")),
                        .LineColor = LineColor,
                        .LineThickness = LineThickness,
                        .LineStyle = LineStyle})
                End If
            Else
                For i = 0 To Series.Count - 1
                    Dim one = Series(i)
                    plots.Add(New Plot With {
                        .Data = Sampleset(one, SamplesetColumn(one, i)),
                        .Definition = one,
                        .LineColor = one.LineColor,
                        .LineThickness = one.LineThickness,
                        .LineStyle = one.LineStyle,
                        .Visible = one.Visible})
                Next
            End If

            ' ONE sample axis and ONE amplitude axis for the whole picture: the sets are stacked along the
            ' depth, so a scale per series would draw two peaks at two heights and claim they are equal.
            Dim xs = plots.SelectMany(Function(p) p.Data.Xs).ToList()
            Dim ys = plots.SelectMany(Function(p) p.Data.Ys).ToList()
            ys.Add(0.0)   ' the ribbons fill down to zero
            If xs.Count = 0 Then
                xs.Add(0.0)
                xs.Add(1.0)
            End If
            If ys.Count = 0 Then
                ys.Add(0.0)
                ys.Add(1.0)
            End If
            Dim xr = AxisRange.Over(xs, MinX, MaxX, 6, 1)
            Dim yr = AxisRange.Over(ys, MinY, MaxY, 5, 5)
            For Each one In plots
                one.XRange = xr
                one.YRange = yr
            Next
            Return plots
        End Function

        ''' <summary>The column one sampleset reads: the series' own, else the chart's YColumn and then the next
        ''' column along (C, D, E …).</summary>
        Private Function SamplesetColumn(one As ChartSeries, index As Integer) As String
            If Not String.IsNullOrWhiteSpace(one.YColumn) Then Return one.YColumn
            Return SpreadsheetReader.ColumnAfter(If(YColumn, "C"), index)
        End Function

        ''' <summary>One sampleset's values, with the samples numbered the way an analyser numbers them: the
        ''' reader counts rows from 0, a waterfall counts sample POINTS from 1. The result is a copy, because
        ''' what was read is cached for every chart that reads those columns.</summary>
        Private Function Sampleset(one As ChartSeries, yColumn As String) As ChartData
            Dim data = DataFor(If(XColumn, "B"), yColumn, True)
            If data.Error IsNot Nothing Then Return data
            Return New ChartData With {
                .Xs = data.Xs.Select(Function(x) x + 1).ToArray(),
                .Ys = data.Ys,
                .Labels = data.Labels,
                .XTitle = data.XTitle,
                .YTitle = data.YTitle}
        End Function

        ''' <summary>
        ''' Draws the picture: the floor and the three axes first, then the samplesets from the faintest
        ''' (farthest) to the nearest, each set's ribbon or trace followed by its own thin trace line and then
        ''' the connectors that join it to the set in front. Drawing the connectors there, and not in a pass of
        ''' their own, is what lets a nearer ribbon cover the mesh behind it — the mesh only shows where it would
        ''' really be seen.
        ''' </summary>
        Friend Overrides Sub DrawSeriesLayer(context As DrawingContext, plots As List(Of Plot), plot As Rect)
            _sampleHits.Clear()
            Dim visible = plots.Where(Function(p) p.Visible AndAlso p.Data.HasData).ToList()
            If visible.Count = 0 Then Return

            Dim world As New WaterfallWorld With {
                .View = MakeView(plot),
                .Sets = visible.Count,
                .Depth = Math.Clamp(ZSpacing, 0.1, 4)}
            world.Xs = visible(0).XRange
            world.Ys = visible(0).YRange
            ' The heat map's ends default to the DATA's own least and greatest value (not the scale's), so the
            ' picture uses the whole map: a peak is the map's top colour, whatever the axis' round numbers are.
            Dim samples = visible.SelectMany(Function(p) p.Data.Ys).ToList()
            Dim low As Double = If(Double.IsNaN(HeatMin), If(samples.Count > 0, samples.Min(), 0.0), HeatMin)
            Dim high As Double = If(Double.IsNaN(HeatMax), If(samples.Count > 0, samples.Max(), 1.0), HeatMax)
            If high <= low Then high = low + 1

            ' ONE stride for every set, and the last sample always kept, so the mesh joins like to like.
            Dim count = visible.Max(Function(p) p.Data.Xs.Length)
            Dim stride As Integer = 1
            If MaxPoints > 0 AndAlso count > MaxPoints Then stride = CInt(Math.Ceiling(count / CDbl(MaxPoints)))
            Dim kept As New List(Of Integer)()
            For i = 0 To count - 1 Step stride
                kept.Add(i)
            Next
            If count > 0 AndAlso kept(kept.Count - 1) <> count - 1 Then kept.Add(count - 1)

            DrawFloor(context, world, visible.Count)

            ' Farthest first, decided by the projection itself (the two angles say which set is the far one).
            Dim order = Enumerable.Range(0, visible.Count).
                OrderBy(Function(i) world.View.Depth(0.5, 0.5, world.UnitZ(i))).ToList()
            Dim everyNth As Integer = If(ConnectorStep > 0, ConnectorStep, Math.Max(1, kept.Count \ 40))

            For rank = 0 To order.Count - 1
                Dim setIndex = order(rank)
                Dim trace = visible(setIndex)
                Dim xs = kept.Where(Function(i) i < trace.Data.Xs.Length).
                    Select(Function(i) trace.Data.Xs(i)).ToArray()
                Dim ys = kept.Where(Function(i) i < trace.Data.Ys.Length).
                    Select(Function(i) trace.Data.Ys(i)).ToArray()
                If xs.Length < 2 Then Continue For

                ' The set in FRONT of this one is the next in the paint order, so its connectors are drawn
                ' here — over this ribbon, and before the ribbon that will cover them.
                Dim front As Plot = Nothing
                Dim frontSet = setIndex
                If rank + 1 < order.Count Then
                    front = visible(order(rank + 1))
                    frontSet = order(rank + 1)
                End If

                DrawRibbon(context, world, setIndex, xs, ys, trace, low, high)
                DrawTrace(context, world, setIndex, xs, ys, trace, low, high)
                If ShowConnectors AndAlso front IsNot Nothing Then
                    DrawConnectors(context, world, setIndex, xs, ys, front, frontSet, low, high, kept, everyNth)
                End If
                RecordSamples(world, setIndex, xs, ys, trace)
            Next
        End Sub

        ''' <summary>The key that decides whether the hover panel has to be rebuilt: the sample the pointer is
        ''' over, which changes as the picture is turned even while the pointer stands still.</summary>
        Private Shared Function HoverKey(hit As SampleHit) As String
            If hit Is Nothing Then Return String.Empty
            Return hit.SetIndex & "|" & hit.Sample & "|" & hit.Value
        End Function

        ''' <summary>Finds the sample nearest the pointer — the projected positions of the last render, so the
        ''' answer matches the picture, and a radius in pixels, so the pointer has to be near something to
        ''' report it.</summary>
        Friend Overrides Sub UpdateHover(point As Point, plot As Rect)
            Dim best As SampleHit = Nothing
            Dim nearest As Double = 16
            For Each hit In _sampleHits
                Dim dx = hit.Screen.X - point.X
                Dim dy = hit.Screen.Y - point.Y
                Dim distance = Math.Sqrt(dx * dx + dy * dy)
                If distance >= nearest Then Continue For
                nearest = distance
                best = hit
            Next
            If HoverKey(best) = HoverKey(_hoverSample) Then Return
            _hoverSample = best
            If best Is Nothing Then
                Hover = Nothing
                Return
            End If
            Hover = New ReadoutPanel With {
                .Head = best.Name,
                .HeadColor = best.Fill,
                .Body = "X " & FormatReading(best.Sample) & "   Y " & FormatReading(best.Value),
                .Accent = best.Fill,
                .FollowPointer = True}
        End Sub

        ''' <summary>Forgets the sample the pointer was over.</summary>
        Friend Overrides Sub ClearHover()
            _hoverSample = Nothing
            Hover = Nothing
        End Sub

        ''' <summary>Dragging turns the picture: sideways turns the azimuth, up and down change the elevation
        ''' it is seen from (drag down to look from higher). The saved form is not touched — the angles a form
        ''' opens with are its Elevation and Azimuth properties.</summary>
        Protected Overrides Sub OnPointerPressed(e As PointerPressedEventArgs)
            MyBase.OnPointerPressed(e)
            If Not e.GetCurrentPoint(Me).Properties.IsLeftButtonPressed Then Return
            _rotateDrag = True
            _rotateFrom = e.GetPosition(Me)
            _rotateElevation = Elevation
            _rotateAzimuth = Azimuth
            Focus()
            e.Pointer.Capture(Me)
            e.Handled = True
        End Sub

        Protected Overrides Sub OnPointerMoved(e As PointerEventArgs)
            MyBase.OnPointerMoved(e)
            If Not _rotateDrag Then Return
            Dim position = e.GetPosition(Me)
            Elevation = Math.Clamp(_rotateElevation + (position.Y - _rotateFrom.Y) * 0.5, 2, 89)
            Azimuth = _rotateAzimuth + (position.X - _rotateFrom.X) * 0.5
            InvalidateVisual()
        End Sub

        Protected Overrides Sub OnPointerReleased(e As PointerReleasedEventArgs)
            MyBase.OnPointerReleased(e)
            If Not _rotateDrag Then Return
            _rotateDrag = False
            e.Pointer.Capture(Nothing)
            e.Handled = True
        End Sub

        ''' <summary>Remembers a trace's projected samples, so the pointer can be tested against them.</summary>
        Private Sub RecordSamples(world As WaterfallWorld, setIndex As Integer, xs As Double(), ys As Double(),
                                  trace As Plot)
            Dim name = LegendName(trace, setIndex)
            For i = 0 To xs.Length - 1
                _sampleHits.Add(New SampleHit With {
                    .Screen = world.At(xs(i), ys(i), setIndex),
                    .SetIndex = setIndex,
                    .Name = name,
                    .Fill = trace.LineColor,
                    .Sample = xs(i),
                    .Value = ys(i)})
            Next
        End Sub

        ''' <summary>
        ''' The floor the traces stand on, with its gridlines and its three axes. Reading a 3D picture needs the
        ''' floor more than anything else: it is what says how deep the sets stand and where the value zero is.
        ''' The axes are drawn where a reader expects them — samples across the front, values up the left, sets
        ''' receding along the depth — and every one of them takes its colour, thickness and font from the
        ''' chart-level axis properties, because a projected axis is not one of the base's two cartesian axes.
        ''' </summary>
        Private Sub DrawFloor(context As DrawingContext, world As WaterfallWorld, sets As Integer)
            Dim xMin = world.Xs.Min
            Dim xMax = world.Xs.Max
            Dim last = sets - 1
            Dim axisPen = MakePen(AxisColor, 1, ChartLineStyle.Solid)

            ' The floor's outline, and the grid on it: the sample lines run back along the depth, the set lines
            ' run across. Both are drawn first, so the traces cover them where they stand in front.
            If ShowGrid Then
                Dim gridPen = MakePen(GridColor, GridThickness, GridStyle)
                For Each tick In world.Xs.Ticks()
                    context.DrawLine(gridPen, world.Base(tick, 0), world.Base(tick, last))
                Next
                Dim setStep = Math.Max(1, sets \ 20)
                For setIndex = 0 To sets - 1 Step setStep
                    context.DrawLine(gridPen, world.Base(xMin, setIndex), world.Base(xMax, setIndex))
                Next
            End If

            context.DrawLine(axisPen, world.Base(xMax, 0), world.Base(xMax, last))
            context.DrawLine(axisPen, world.Base(xMax, last), world.Base(xMin, last))
            If Not ShowAxes Then Return

            ' The three axes themselves: X along the front floor edge, Y up the left, Z back along the depth.
            Dim front = world.Base(xMin, 0)
            Dim xEnd = world.Base(xMax, 0)
            Dim yEnd = world.View.Project(world.UnitX(xMin), 1, world.UnitZ(0))
            Dim zEnd = world.Base(xMin, last)
            context.DrawLine(axisPen, front, xEnd)
            context.DrawLine(axisPen, front, yEnd)
            If sets > 1 Then context.DrawLine(axisPen, front, zEnd)

            Dim down = world.View.Direction(0, -1, 0)
            Dim left = world.View.Direction(-1, 0, 0)
            Dim tickLength = Math.Max(0, MajorTickLength)
            Dim font = TickLabelFontSize

            For Each value In world.Xs.Ticks()
                Dim at = world.Base(value, 0)
                If ShowMajorTicks Then
                    context.DrawLine(axisPen, at, New Point(at.X + down.X * tickLength, at.Y + down.Y * tickLength))
                End If
                If Not ShowTickLabels Then Continue For
                Dim text = MakeText(FormatNumber(value, world.Xs.TickStep), font, AxisColor)
                context.DrawText(text, New Point(at.X - text.Width / 2 + down.X * (tickLength + 2),
                                                 at.Y + down.Y * (tickLength + 2)))
            Next

            For Each value In world.Ys.Ticks()
                Dim at = world.View.Project(world.UnitX(xMin), world.UnitY(value), world.UnitZ(0))
                If ShowMajorTicks Then
                    context.DrawLine(axisPen, at, New Point(at.X + left.X * tickLength, at.Y + left.Y * tickLength))
                End If
                If Not ShowTickLabels Then Continue For
                Dim text = MakeText(FormatNumber(value, world.Ys.TickStep), font, AxisColor)
                context.DrawText(text, New Point(at.X + left.X * (tickLength + 2) - text.Width,
                                                 at.Y - text.Height / 2))
            Next

            ' The depth ticks are the samplesets themselves, numbered the way the legend lists them. With a wall
            ' of sets they would overprint each other, so they are thinned out.
            If sets > 1 Then
                Dim setStep = Math.Max(1, sets \ 12)
                For setIndex = 0 To sets - 1 Step setStep
                    Dim at = world.Base(xMin, setIndex)
                    If ShowMajorTicks Then
                        context.DrawLine(axisPen, at, New Point(at.X + left.X * tickLength, at.Y + left.Y * tickLength))
                    End If
                    If Not ShowTickLabels Then Continue For
                    Dim text = MakeText((setIndex + 1).ToString(CultureInfo.CurrentCulture), font, AxisColor)
                    context.DrawText(text, New Point(at.X + left.X * (tickLength + 2) - text.Width,
                                                     at.Y - text.Height / 2))
                Next
            End If

            If Not ShowAxisTitles Then Return
            DrawAxisTitle(context, XAxisTitle, xEnd, down, tickLength + 4, font)
            DrawAxisTitle(context, YAxisTitle, yEnd, New Point(0, -1), tickLength + 4, font)
            DrawAxisTitle(context, ZAxisTitle, zEnd, left, tickLength + 4, font)
        End Sub

        ''' <summary>One axis name, offset from the end of its axis along SIDE so it reads beside the axis
        ''' rather than on top of it.</summary>
        Private Sub DrawAxisTitle(context As DrawingContext, title As String, at As Point, side As Point,
                                  gap As Double, font As Double)
            If String.IsNullOrWhiteSpace(title) Then Return
            Dim text = MakeText(title, font, AxisColor)
            context.DrawText(text, New Point(at.X + side.X * gap - text.Width / 2, at.Y + side.Y * gap - text.Height))
        End Sub

        ''' <summary>
        ''' One sampleset's fill, by style and colour: a solid ribbon in its own colour, the same see-through, or
        ''' the heat map — and in the Split mode two bands either side of the limit (see DrawSplitRibbon). The
        ''' Lines style fills nothing at all.
        ''' </summary>
        Private Sub DrawRibbon(context As DrawingContext, world As WaterfallWorld, setIndex As Integer,
                               xs As Double(), ys As Double(), trace As Plot, low As Double, high As Double)
            If RibbonStyle = WaterfallStyle.Lines Then Return
            Dim opacity As Double = If(RibbonStyle = WaterfallStyle.Translucent,
                                       Math.Clamp(RibbonOpacity, 0, 100) / 100.0, 1.0)
            If ColorMode = WaterfallColorMode.Split Then
                DrawSplitRibbon(context, world, setIndex, xs, ys, opacity)
                Return
            End If

            Dim fill As IBrush = If(ColorMode = WaterfallColorMode.Value,
                                    HeatBrush(world, setIndex, low, high),
                                    New SolidColorBrush(trace.LineColor, opacity))

            Dim geometry As New StreamGeometry()
            Using g = geometry.Open()
                g.BeginFigure(world.Base(xs(0), setIndex), True)
                For i = 0 To xs.Length - 1
                    g.LineTo(world.At(xs(i), ys(i), setIndex))
                Next
                g.LineTo(world.At(xs(xs.Length - 1), world.Ys.Min, setIndex))
                g.EndFigure(True)
            End Using
            context.DrawGeometry(fill, Nothing, geometry)
        End Sub

        ''' <summary>
        ''' The Split mode's two fills for one sampleset: the part of the ribbon BELOW SplitValue in one colour
        ''' and the part above it in the other, so a limit is visible in the picture instead of in a legend. The
        ''' trace is cut exactly where it crosses the limit — the top edge is a straight line between two samples,
        ''' so the crossing is a linear interpolation — which is what makes the two regions meet on a clean line
        ''' rather than on a stair.
        ''' </summary>
        Private Sub DrawSplitRibbon(context As DrawingContext, world As WaterfallWorld, setIndex As Integer,
                                    xs As Double(), ys As Double(), opacity As Double)
            Dim limit = SplitValue
            Dim below As New SolidColorBrush(BelowColor, opacity)
            Dim above As New SolidColorBrush(AboveColor, opacity)

            ' Everything up to the limit — the whole ribbon where the trace stays under it.
            Dim lowGeometry As New StreamGeometry()
            Using g = lowGeometry.Open()
                g.BeginFigure(world.Base(xs(0), setIndex), True)
                For i = 0 To xs.Length - 1
                    g.LineTo(world.At(xs(i), Math.Min(ys(i), limit), setIndex))
                Next
                g.LineTo(world.Base(xs(xs.Length - 1), setIndex))
                g.EndFigure(True)
            End Using
            context.DrawGeometry(below, Nothing, lowGeometry)

            ' …and the runs that stand above it, each one closed along the limit itself.
            Dim cursor = 0
            While cursor < xs.Length
                If ys(cursor) <= limit Then
                    cursor += 1
                    Continue While
                End If
                Dim start = cursor
                While cursor + 1 < xs.Length AndAlso ys(cursor + 1) > limit
                    cursor += 1
                End While
                Dim finish = cursor
                Dim geometry As New StreamGeometry()
                Using g = geometry.Open()
                    g.BeginFigure(RunEnd(xs, ys, world, setIndex, start, True, limit), True)
                    For k = start To finish
                        g.LineTo(world.At(xs(k), ys(k), setIndex))
                    Next
                    g.LineTo(RunEnd(xs, ys, world, setIndex, finish, False, limit))
                    g.EndFigure(True)
                End Using
                context.DrawGeometry(above, Nothing, geometry)
                cursor += 1
            End While
        End Sub

        ''' <summary>Where a run of over-the-limit samples meets the limit: the crossing on the segment coming
        ''' into it, or the sampleset's own first sample when the run starts there (and the same at the far end).</summary>
        Private Shared Function RunEnd(xs As Double(), ys As Double(), world As WaterfallWorld, setIndex As Integer,
                                       index As Integer, entry As Boolean, limit As Double) As Point
            If entry Then
                If index = 0 Then Return world.At(xs(0), limit, setIndex)
                Return world.At(CrossX(xs(index - 1), ys(index - 1), xs(index), ys(index), limit), limit, setIndex)
            End If
            If index >= xs.Length - 1 Then Return world.At(xs(xs.Length - 1), limit, setIndex)
            Return world.At(CrossX(xs(index), ys(index), xs(index + 1), ys(index + 1), limit), limit, setIndex)
        End Function

        ''' <summary>The X where the top edge between two samples passes the limit (a straight line, so the
        ''' crossing is the linear interpolation between the two values).</summary>
        Private Shared Function CrossX(x0 As Double, v0 As Double, x1 As Double, v1 As Double, limit As Double) As Double
            Dim span = v1 - v0
            If Math.Abs(span) < 0.000000000001 Then Return x1
            Return x0 + (x1 - x0) * ((limit - v0) / span)
        End Function

        ''' <summary>
        ''' One sampleset's own trace line, drawn over its ribbon. In the Split mode the line is cut at the limit
        ''' too, so the outline agrees with the fill; in the Value mode it carries the heat map's gradient, which is
        ''' what makes a peak's own tip the map's top colour.
        ''' </summary>
        Private Sub DrawTrace(context As DrawingContext, world As WaterfallWorld, setIndex As Integer,
                              xs As Double(), ys As Double(), trace As Plot, low As Double, high As Double)
            Dim thickness = If(trace.LineThickness > 0, trace.LineThickness, 1.0)
            If ColorMode = WaterfallColorMode.Split Then
                DrawSplitTrace(context, world, setIndex, xs, ys, thickness)
                Return
            End If
            Dim brush As IBrush = If(ColorMode = WaterfallColorMode.Value,
                                     HeatBrush(world, setIndex, low, high),
                                     New SolidColorBrush(trace.LineColor))
            DrawPolyline(context, world, setIndex, xs, ys, MakeBrushPen(brush, thickness, trace.LineStyle))
        End Sub

        ''' <summary>A pen over an arbitrary brush, so a trace can be drawn with the heat map's gradient. The
        ''' base's own MakePen takes a colour, which a gradient is not.</summary>
        Private Shared Function MakeBrushPen(brush As IBrush, thickness As Double, style As ChartLineStyle) As IPen
            Dim pen As New Pen(brush, Math.Max(0.5, thickness), DashFor(style))
            pen.LineCap = If(style = ChartLineStyle.Dot, PenLineCap.Round, PenLineCap.Flat)
            Return pen
        End Function

        ''' <summary>Draws one sampleset's top edge as a single line.</summary>
        Private Shared Sub DrawPolyline(context As DrawingContext, world As WaterfallWorld, setIndex As Integer,
                                        xs As Double(), ys As Double(), pen As IPen)
            Dim geometry As New StreamGeometry()
            Using g = geometry.Open()
                g.BeginFigure(world.At(xs(0), ys(0), setIndex), False)
                For i = 1 To xs.Length - 1
                    g.LineTo(world.At(xs(i), ys(i), setIndex))
                Next
                g.EndFigure(False)
            End Using
            context.DrawGeometry(Nothing, pen, geometry)
        End Sub

        ''' <summary>The Split mode's trace line, cut at the limit: one geometry for the parts below it and one for
        ''' the parts above, so the outline is drawn in two passes rather than segment by segment.</summary>
        Private Sub DrawSplitTrace(context As DrawingContext, world As WaterfallWorld, setIndex As Integer,
                                   xs As Double(), ys As Double(), thickness As Double)
            Dim limit = SplitValue
            Dim belowPen = MakePen(BelowColor, thickness, ChartLineStyle.Solid)
            Dim abovePen = MakePen(AboveColor, thickness, ChartLineStyle.Solid)
            Dim belowGeometry As New StreamGeometry()
            Dim aboveGeometry As New StreamGeometry()
            Using b = belowGeometry.Open()
                Using a = aboveGeometry.Open()
                    For i = 1 To xs.Length - 1
                        Dim x0 = xs(i - 1)
                        Dim v0 = ys(i - 1)
                        Dim x1 = xs(i)
                        Dim v1 = ys(i)
                        If (v0 <= limit) = (v1 <= limit) Then
                            Dim straight = If(v0 <= limit, b, a)
                            straight.BeginFigure(world.At(x0, v0, setIndex), False)
                            straight.LineTo(world.At(x1, v1, setIndex))
                            straight.EndFigure(False)
                            Continue For
                        End If
                        Dim crossing = CrossX(x0, v0, x1, v1, limit)
                        Dim lower = If(v0 <= limit, b, a)
                        Dim upper = If(v0 <= limit, a, b)
                        lower.BeginFigure(world.At(x0, v0, setIndex), False)
                        lower.LineTo(world.At(crossing, limit, setIndex))
                        lower.EndFigure(False)
                        upper.BeginFigure(world.At(crossing, limit, setIndex), False)
                        upper.LineTo(world.At(x1, v1, setIndex))
                        upper.EndFigure(False)
                    Next
                End Using
            End Using
            context.DrawGeometry(Nothing, belowPen, belowGeometry)
            context.DrawGeometry(Nothing, abovePen, aboveGeometry)
        End Sub

        ''' <summary>
        ''' The connectors: for every kept sample, a line from this set's value to the next nearer set's value at
        ''' the SAME sample — the mesh that turns a row of separate traces into a surface. They are coloured the way
        ''' the traces are: the heat map's gradient in the Value mode (so the mesh reads as the same field as the
        ''' ribbons), the split colours in the Split mode, and the connector colour otherwise.
        ''' </summary>
        Private Sub DrawConnectors(context As DrawingContext, world As WaterfallWorld, setIndex As Integer,
                                   xs As Double(), ys As Double(), front As Plot, frontSet As Integer,
                                   low As Double, high As Double, kept As List(Of Integer), everyNth As Integer)
            If ConnectorThickness <= 0 Then Return
            Dim thickness = ConnectorThickness
            If ColorMode = WaterfallColorMode.Split Then
                DrawSplitConnectors(context, world, setIndex, xs, ys, front, frontSet, thickness, kept, everyNth)
                Return
            End If
            Dim brush As IBrush = If(ColorMode = WaterfallColorMode.Value,
                                     HeatBrush(world, setIndex, low, high),
                                     New SolidColorBrush(ConnectorColor))
            Dim pen = MakeBrushPen(brush, thickness, ChartLineStyle.Solid)

            Dim geometry As New StreamGeometry()
            Using g = geometry.Open()
                Dim i = 0
                While i < xs.Length
                    Dim index = kept(Math.Min(i, kept.Count - 1))
                    If index < front.Data.Xs.Length AndAlso index < front.Data.Ys.Length Then
                        g.BeginFigure(world.At(xs(i), ys(i), setIndex), False)
                        g.LineTo(world.At(front.Data.Xs(index), front.Data.Ys(index), frontSet))
                        g.EndFigure(False)
                    End If
                    i += everyNth
                End While
            End Using
            context.DrawGeometry(Nothing, pen, geometry)
        End Sub

        ''' <summary>The mesh in the Split mode: every connector is cut at the limit, so the part of the surface
        ''' above it is drawn in the "above" colour — which is what shows a peak rising out of the floor.</summary>
        Private Sub DrawSplitConnectors(context As DrawingContext, world As WaterfallWorld, setIndex As Integer,
                                        xs As Double(), ys As Double(), front As Plot, frontSet As Integer,
                                        thickness As Double, kept As List(Of Integer), everyNth As Integer)
            Dim limit = SplitValue
            Dim belowGeometry As New StreamGeometry()
            Dim aboveGeometry As New StreamGeometry()
            Using b = belowGeometry.Open()
                Using a = aboveGeometry.Open()
                    Dim i = 0
                    While i < xs.Length
                        Dim index = Math.Min(kept(Math.Min(i, kept.Count - 1)),
                                             Math.Min(front.Data.Xs.Length, front.Data.Ys.Length) - 1)
                        If index < 0 Then
                            i += everyNth
                            Continue While
                        End If
                        Dim near = front.Data.Ys(index)
                        Dim farValue = ys(i)
                        Dim startPoint = world.At(xs(i), farValue, setIndex)
                        Dim endPoint = world.At(front.Data.Xs(index), near, frontSet)
                        ' The connector is a straight line in space, and the projection is linear, so the limit is
                        ' crossed the same fraction of the way on screen as it is in the values.
                        Dim crossing As Double = 0.5
                        If Math.Abs(near - farValue) >= 0.000000000001 Then
                            crossing = Math.Clamp((limit - farValue) / (near - farValue), 0, 1)
                        End If
                        Dim at As New Point(startPoint.X + (endPoint.X - startPoint.X) * crossing,
                                            startPoint.Y + (endPoint.Y - startPoint.Y) * crossing)
                        Dim lower = If(farValue <= limit, b, a)
                        Dim upper = If(farValue <= limit, a, b)
                        lower.BeginFigure(startPoint, False)
                        lower.LineTo(at)
                        lower.EndFigure(False)
                        upper.BeginFigure(at, False)
                        upper.LineTo(endPoint)
                        upper.EndFigure(False)
                        i += everyNth
                    End While
                End Using
            End Using
            context.DrawGeometry(Nothing, MakePen(BelowColor, thickness, ChartLineStyle.Solid), belowGeometry)
            context.DrawGeometry(Nothing, MakePen(AboveColor, thickness, ChartLineStyle.Solid), aboveGeometry)
        End Sub

        ''' <summary>
        ''' The Value mode's brush for ONE sampleset: a gradient that runs up the amplitude axis, so any point of
        ''' the ribbon — or of a connector drawn with the same brush — is coloured by its own value, a peak's tip in
        ''' the map's top colour and its foot in the bottom one. That is the picture a spectrum waterfall is read
        ''' for. Each set needs its own brush (the sets stand at different depths), and the gradient's axis is laid
        ''' PERPENDICULAR to the sample axis: with a slanted view a simply vertical gradient would tint by screen
        ''' height rather than by value, and the colour bands would not sit level with the data.
        ''' </summary>
        Private Function HeatBrush(world As WaterfallWorld, setIndex As Integer, low As Double, high As Double) As IBrush
            Dim startPoint = world.View.Project(0, world.UnitY(low), world.UnitZ(setIndex))
            Dim endPoint = world.View.Project(0, world.UnitY(high), world.UnitZ(setIndex))
            Dim alongX = world.View.Direction(1, 0, 0)
            Dim up As New Point(alongX.Y, -alongX.X)
            If up.Y > 0 Then up = New Point(-up.X, -up.Y)
            Dim span = (endPoint.X - startPoint.X) * up.X + (endPoint.Y - startPoint.Y) * up.Y
            If span < 1 Then
                ' The value axis has collapsed on screen (edge on), so a gradient would be one flat colour.
                Return New SolidColorBrush(HeatColor((low + high) / 2, low, high))
            End If
            Dim stops As New GradientStops()
            For i = 0 To HeatPalette.Length - 1
                stops.Add(New GradientStop(HeatPalette(i), i / CDbl(HeatPalette.Length - 1)))
            Next
            Return New LinearGradientBrush With {
                .StartPoint = New RelativePoint(startPoint, RelativeUnit.Absolute),
                .EndPoint = New RelativePoint(New Point(startPoint.X + up.X * span, startPoint.Y + up.Y * span),
                                              RelativeUnit.Absolute),
                .GradientStops = stops}
        End Function

        ''' <summary>The heat map's colour for one value (needed when the value axis is edge on): the value's
        ''' place between the two ends picks a stop, blended between the two colours it falls between.</summary>
        Private Shared Function HeatColor(value As Double, low As Double, high As Double) As Color
            Dim place As Double = 0.5
            If high - low > 0 Then place = Math.Clamp((value - low) / (high - low), 0, 1)
            Dim scaled = place * (HeatPalette.Length - 1)
            Dim index = Math.Min(HeatPalette.Length - 2, CInt(Math.Floor(scaled)))
            Dim f = scaled - index
            Dim first = HeatPalette(index)
            Dim second = HeatPalette(index + 1)
            Return Color.FromArgb(255,
                CByte(Math.Round(first.R + (second.R - first.R) * f)),
                CByte(Math.Round(first.G + (second.G - first.G) * f)),
                CByte(Math.Round(first.B + (second.B - first.B) * f)))
        End Function
    End Class

    ''' <summary>
    ''' The 3D SURFACE chart — a sheet of corrugated iron. Every series is one slice across the sheet's LENGTH,
    ''' its values are the HEIGHT of the corrugation at each X position across the sheet's WIDTH, and
    ''' neighbouring slices are joined with quads: the picture is the surface itself, which is what separates it
    ''' from GrumpyWaterfallPlot (a row of separate traces joined by a mesh).
    '''
    ''' Where the pieces come from:
    '''   - X is ONE shared column for the whole chart (the width positions), so the slices line up into a grid
    '''     and the quads are real sheet quads;
    '''   - Y is one column per series (that slice's corrugation profile);
    '''   - Z is where the slice stands along the length. It is read from the SPREADSHEET — the series' own
    '''     column, in ZRow (the header row by default) — because the sample data says where each slice belongs;
    '''     when that cell does not hold a number the chart numbers the slices itself from ZStart in steps of
    '''     ZStep. The depth of a slice follows its Z VALUE, so unevenly spaced slices stand unevenly far apart,
    '''     and the Z axis is labelled with those numbers.
    '''
    ''' The range window (2026-09-23): MinX/MaxX and MinY/MaxY clip the picture to a window of the sheet's width
    ''' (X) and height (Y); the view is ALWAYS re-fitted to that window, so narrowing the range zooms into it
    ''' instead of leaving the surface small inside a large frame, and the drawing is clipped to the plot box so
    ''' a window is a real cut rather than an overflow.
    ''' </summary>
    Public Class GrumpySurfacePlot
        Inherits ChartBase

        ''' <summary>The slice of a chart that has no series elements: one corrugation profile, typed in.</summary>
        Public Shared ReadOnly ValuesProperty As StyledProperty(Of Double()) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, Double())(NameOf(Values))

        ''' <summary>Several slices written inline, one per semicolon-separated group: "1,2,3; 3,2,1" is two
        ''' slices of three samples, with the sample number as X. Handy for sketching a surface without a
        ''' workbook — a real capture names one spreadsheet column per slice (one series each).</summary>
        Public Shared ReadOnly SampleSetsProperty As StyledProperty(Of Double()()) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, Double()())(NameOf(SampleSets))

        ''' <summary>Grid mesh, grid mesh over a solid surface (the default), or the solid alone.</summary>
        Public Shared ReadOnly StyleProperty As StyledProperty(Of SurfaceStyle) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, SurfaceStyle)(NameOf(Style), SurfaceStyle.GridMeshSolid)

        ''' <summary>One colour per slice, or a temperature ramp by height (the default).</summary>
        Public Shared ReadOnly ColorByProperty As StyledProperty(Of SurfaceColorMode) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, SurfaceColorMode)(NameOf(ColorBy), SurfaceColorMode.Temperature)

        ''' <summary>The ramp's colour at the LOWEST value (the valleys).</summary>
        Public Shared ReadOnly LowColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, Color)(NameOf(LowColor), Color.Parse("#1B2A6B"))

        ''' <summary>The ramp's colour at the HIGHEST value (the ridges).</summary>
        Public Shared ReadOnly HighColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, Color)(NameOf(HighColor), Color.Parse("#E53935"))

        ''' <summary>The value the ramp's low end sits at (NaN = the data's own least value).</summary>
        Public Shared ReadOnly HeatMinProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, Double)(NameOf(HeatMin), Double.NaN)

        ''' <summary>The value the ramp's high end sits at (NaN = the data's own greatest value).</summary>
        Public Shared ReadOnly HeatMaxProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, Double)(NameOf(HeatMax), Double.NaN)

        ''' <summary>The colour of the surface's MESH lines. The floor's own gridlines keep the chart-level
        ''' GridColor, as on every other chart.</summary>
        Public Shared ReadOnly MeshColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, Color)(NameOf(MeshColor), Color.Parse("#6B7A8F"))

        ''' <summary>How thick the surface's mesh lines are (0 draws none).</summary>
        Public Shared ReadOnly MeshThicknessProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, Double)(NameOf(MeshThickness), 1.0R)

        ''' <summary>How solid the filled surface is, in percent (100 = opaque metal).</summary>
        Public Shared ReadOnly SolidOpacityProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, Double)(NameOf(SolidOpacity), 100.0R)

        ''' <summary>Fill the space under the sheet, from its own profiles down to the floor, so the sheet draws
        ''' as a solid BLOCK instead of a skin — an area chart lifted into 3D. It is a block, so it HIDES what
        ''' stands behind it: slices behind a nearer face are occluded instead of showing through the empty space
        ''' beneath the sheet, which is what a narrow slice window looked like before. Off by default, because it
        ''' changes the picture rather than decorating it.</summary>
        Public Shared ReadOnly ShowBaseProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, Boolean)(NameOf(ShowBase), False)

        ''' <summary>The colour of the base block's sides and ends. Flat and OPAQUE on purpose: the temperature
        ''' ramp belongs to the sheet, and the block is the solid it stands on.</summary>
        Public Shared ReadOnly BaseColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, Color)(NameOf(BaseColor), Color.Parse("#3C3C3C"))

        ''' <summary>The Z of the FIRST slice when the spreadsheet does not say — 0 by default.</summary>
        Public Shared ReadOnly ZStartProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, Double)(NameOf(ZStart))

        ''' <summary>What one slice adds to the Z of the one behind it when the spreadsheet does not say.</summary>
        Public Shared ReadOnly ZStepProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, Double)(NameOf(ZStep), 1.0R)

        ''' <summary>Which spreadsheet ROW holds each slice's Z value (0 = the header row).</summary>
        Public Shared ReadOnly ZRowProperty As StyledProperty(Of Integer) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, Integer)(NameOf(ZRow))

        ''' <summary>The Z of the FIRST slice that is drawn (NaN = the sheet's own least Z). This is the legend's
        ''' second slider: the slices outside the window are left out of the picture altogether, so a long
        ''' capture can be looked at a few slices at a time.</summary>
        Public Shared ReadOnly MinZProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, Double)(NameOf(MinZ), Double.NaN)

        ''' <summary>The Z of the LAST slice that is drawn (NaN = the sheet's own greatest Z).</summary>
        Public Shared ReadOnly MaxZProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, Double)(NameOf(MaxZ), Double.NaN)

        ''' <summary>How many samples of a slice are drawn at most (512 by default, 0 = every one).</summary>
        Public Shared ReadOnly MaxPointsProperty As StyledProperty(Of Integer) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, Integer)(NameOf(MaxPoints), 512)

        ''' <summary>How far above the floor the sheet is seen from (default 30).</summary>
        Public Shared ReadOnly ElevationProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, Double)(NameOf(Elevation), 30.0R)

        ''' <summary>Where the sheet is turned to (default 45).</summary>
        Public Shared ReadOnly AzimuthProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, Double)(NameOf(Azimuth), 45.0R)

        ''' <summary>How deep the whole sheet stands, as a fraction of the fitted depth.</summary>
        Public Shared ReadOnly ZSpacingProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, Double)(NameOf(ZSpacing), 1.0R)

        ''' <summary>Scales the fitted picture.</summary>
        Public Shared ReadOnly ZoomProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, Double)(NameOf(Zoom), 1.0R)

        ''' <summary>How big the X axis is DRAWN, in percent of the fitted size (100 = as fitted). This is a
        ''' zoom, not a window: Min X / Max X are untouched, so the sheet magnifies about the middle of the
        ''' frame (and the parts that no longer fit are clipped by the plot box) instead of showing a
        ''' different range. The X axis's own direction on screen is what stretches, so the depth the slices
        ''' stand apart keeps its perspective — ZSpacing is the knob for that.</summary>
        Public Shared ReadOnly ZoomXProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, Double)(NameOf(ZoomX), 100.0R)

        ''' <summary>How tall the Y (height) axis is DRAWN, in percent of the fitted size — the vertical
        ''' exaggeration a corrugated sheet is usually read with. Zoom, not range: Min Y / Max Y are
        ''' untouched.</summary>
        Public Shared ReadOnly ZoomYProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, Double)(NameOf(ZoomY), 100.0R)

        ''' <summary>The name along the depth axis.</summary>
        Public Shared ReadOnly ZAxisTitleProperty As StyledProperty(Of String) =
            AvaloniaProperty.Register(Of GrumpySurfacePlot, String)(NameOf(ZAxisTitle))

        ''' <summary>
        ''' This chart's OWN properties repaint it. The base registers its own (ShowBorder, the legend's
        ''' colours…) for ChartBase, but a property declared here needs its own registration — without it a Z
        ''' slider drag, a Style change or a colour change updates the model and the picture stays as it was.
        ''' </summary>
        Shared Sub New()
            AffectsRender(Of GrumpySurfacePlot)(ValuesProperty, SampleSetsProperty, StyleProperty, ColorByProperty,
                LowColorProperty, HighColorProperty, HeatMinProperty, HeatMaxProperty, MeshColorProperty,
                MeshThicknessProperty, SolidOpacityProperty, ZStartProperty, ZStepProperty, ZRowProperty,
                MinZProperty, MaxZProperty, MaxPointsProperty, ElevationProperty, AzimuthProperty,
                ZSpacingProperty, ZoomProperty, ZoomXProperty, ZoomYProperty, ZAxisTitleProperty, ShowBaseProperty, BaseColorProperty)
        End Sub

        ''' <summary>One corrugation profile, typed in: the X is the sample number.</summary>
        <TypeConverter(GetType(DoubleArrayConverter))>
        Public Property Values As Double()
            Get
                Return GetValue(ValuesProperty)
            End Get
            Set(value As Double())
                SetValue(ValuesProperty, value)
            End Set
        End Property

        ''' <summary>Several slices written inline, one per semicolon-separated group.</summary>
        <TypeConverter(GetType(DoubleSetConverter))>
        Public Property SampleSets As Double()()
            Get
                Return GetValue(SampleSetsProperty)
            End Get
            Set(value As Double()())
                SetValue(SampleSetsProperty, value)
            End Set
        End Property

        ''' <summary>Grid mesh, grid mesh over the solid, or the solid alone.</summary>
        Public Property Style As SurfaceStyle
            Get
                Return GetValue(StyleProperty)
            End Get
            Set(value As SurfaceStyle)
                SetValue(StyleProperty, value)
            End Set
        End Property

        ''' <summary>What colours the surface.</summary>
        Public Property ColorBy As SurfaceColorMode
            Get
                Return GetValue(ColorByProperty)
            End Get
            Set(value As SurfaceColorMode)
                SetValue(ColorByProperty, value)
            End Set
        End Property

        ''' <summary>The ramp's colour at the sheet's lowest height.</summary>
        Public Property LowColor As Color
            Get
                Return GetValue(LowColorProperty)
            End Get
            Set(value As Color)
                SetValue(LowColorProperty, value)
            End Set
        End Property

        ''' <summary>The ramp's colour at the sheet's greatest height.</summary>
        Public Property HighColor As Color
            Get
                Return GetValue(HighColorProperty)
            End Get
            Set(value As Color)
                SetValue(HighColorProperty, value)
            End Set
        End Property

        ''' <summary>The value the ramp's low end sits at (NaN = the data's own least).</summary>
        Public Property HeatMin As Double
            Get
                Return GetValue(HeatMinProperty)
            End Get
            Set(value As Double)
                SetValue(HeatMinProperty, value)
            End Set
        End Property

        ''' <summary>The value the ramp's high end sits at (NaN = the data's own greatest).</summary>
        Public Property HeatMax As Double
            Get
                Return GetValue(HeatMaxProperty)
            End Get
            Set(value As Double)
                SetValue(HeatMaxProperty, value)
            End Set
        End Property

        ''' <summary>The colour of the surface's mesh lines.</summary>
        Public Property MeshColor As Color
            Get
                Return GetValue(MeshColorProperty)
            End Get
            Set(value As Color)
                SetValue(MeshColorProperty, value)
            End Set
        End Property

        ''' <summary>How thick the surface's mesh lines are.</summary>
        Public Property MeshThickness As Double
            Get
                Return GetValue(MeshThicknessProperty)
            End Get
            Set(value As Double)
                SetValue(MeshThicknessProperty, value)
            End Set
        End Property

        ''' <summary>How solid the filled surface is, in percent.</summary>
        Public Property SolidOpacity As Double
            Get
                Return GetValue(SolidOpacityProperty)
            End Get
            Set(value As Double)
                SetValue(SolidOpacityProperty, value)
            End Set
        End Property

        ''' <summary>Draw the solid block under the sheet, reaching to the floor.</summary>
        Public Property ShowBase As Boolean
            Get
                Return GetValue(ShowBaseProperty)
            End Get
            Set(value As Boolean)
                SetValue(ShowBaseProperty, value)
            End Set
        End Property

        ''' <summary>The colour of that block.</summary>
        Public Property BaseColor As Color
            Get
                Return GetValue(BaseColorProperty)
            End Get
            Set(value As Color)
                SetValue(BaseColorProperty, value)
            End Set
        End Property

        ''' <summary>The Z of the first slice when the spreadsheet does not say.</summary>
        Public Property ZStart As Double
            Get
                Return GetValue(ZStartProperty)
            End Get
            Set(value As Double)
                SetValue(ZStartProperty, value)
            End Set
        End Property

        ''' <summary>What one slice adds to the previous slice's Z when the spreadsheet does not say.</summary>
        Public Property ZStep As Double
            Get
                Return GetValue(ZStepProperty)
            End Get
            Set(value As Double)
                SetValue(ZStepProperty, value)
            End Set
        End Property

        ''' <summary>Which spreadsheet row holds each slice's Z value (0 = the header row).</summary>
        Public Property ZRow As Integer
            Get
                Return GetValue(ZRowProperty)
            End Get
            Set(value As Integer)
                SetValue(ZRowProperty, value)
            End Set
        End Property

        ''' <summary>The Z of the first slice that is drawn (empty = the sheet's own least Z).</summary>
        Public Property MinZ As Double
            Get
                Return GetValue(MinZProperty)
            End Get
            Set(value As Double)
                SetValue(MinZProperty, value)
            End Set
        End Property

        ''' <summary>The Z of the last slice that is drawn (empty = the sheet's own greatest Z).</summary>
        Public Property MaxZ As Double
            Get
                Return GetValue(MaxZProperty)
            End Get
            Set(value As Double)
                SetValue(MaxZProperty, value)
            End Set
        End Property

        ''' <summary>How many samples of a slice are drawn at most (0 = every one).</summary>
        Public Property MaxPoints As Integer
            Get
                Return GetValue(MaxPointsProperty)
            End Get
            Set(value As Integer)
                SetValue(MaxPointsProperty, value)
            End Set
        End Property

        ''' <summary>How far above the floor the sheet is seen from.</summary>
        Public Property Elevation As Double
            Get
                Return GetValue(ElevationProperty)
            End Get
            Set(value As Double)
                SetValue(ElevationProperty, value)
            End Set
        End Property

        ''' <summary>Where the sheet is turned to.</summary>
        Public Property Azimuth As Double
            Get
                Return GetValue(AzimuthProperty)
            End Get
            Set(value As Double)
                SetValue(AzimuthProperty, value)
            End Set
        End Property

        ''' <summary>How deep the whole sheet stands.</summary>
        Public Property ZSpacing As Double
            Get
                Return GetValue(ZSpacingProperty)
            End Get
            Set(value As Double)
                SetValue(ZSpacingProperty, value)
            End Set
        End Property

        ''' <summary>Scales the fitted picture.</summary>
        Public Property Zoom As Double
            Get
                Return GetValue(ZoomProperty)
            End Get
            Set(value As Double)
                SetValue(ZoomProperty, value)
            End Set
        End Property

        ''' <summary>How big the X axis is drawn, in percent (100 = fitted). A zoom: the range stays.</summary>
        Public Property ZoomX As Double
            Get
                Return GetValue(ZoomXProperty)
            End Get
            Set(value As Double)
                SetValue(ZoomXProperty, value)
            End Set
        End Property

        ''' <summary>How tall the Y axis is drawn, in percent (100 = fitted). A zoom: the range stays.</summary>
        Public Property ZoomY As Double
            Get
                Return GetValue(ZoomYProperty)
            End Get
            Set(value As Double)
                SetValue(ZoomYProperty, value)
            End Set
        End Property

        ''' <summary>The name along the depth axis.</summary>
        Public Property ZAxisTitle As String
            Get
                Return GetValue(ZAxisTitleProperty)
            End Get
            Set(value As String)
                SetValue(ZAxisTitleProperty, value)
            End Set
        End Property

        ''' <summary>A surface has no cartesian frame: its axes are the projected cube's edges.</summary>
        Protected Overrides ReadOnly Property HasCartesianAxes As Boolean
            Get
                Return False
            End Get
        End Property

        ''' <summary>The X values are read from the sheet — a width position is a number, not a sample count.</summary>
        Protected Overrides ReadOnly Property ImplicitXFromIndex As Boolean
            Get
                Return False
            End Get
        End Property

        ''' <summary>The floor sits at zero, so the height scale always includes it.</summary>
        Protected Overrides ReadOnly Property ZeroBaseline As Boolean
            Get
                Return True
            End Get
        End Property

        ''' <summary>There is no flat frame to hang cursors on.</summary>
        Protected Overrides ReadOnly Property SupportsCursors As Boolean
            Get
                Return False
            End Get
        End Property

        ''' <summary>The width range the data covers, ignoring the window. READ-ONLY, and for the designer's
        ''' eyes only: the legend's range sliders span exactly what the sheet has, so a range that would draw
        ''' an empty picture cannot be picked.</summary>
        Public ReadOnly Property DataMinX As Double
            Get
                Return _dataX.Min
            End Get
        End Property

        ''' <inheritdoc cref="DataMinX"/>
        Public ReadOnly Property DataMaxX As Double
            Get
                Return _dataX.Max
            End Get
        End Property

        ''' <summary>The height range the data covers, ignoring the window (zero included, as the scale does).</summary>
        Public ReadOnly Property DataMinY As Double
            Get
                Return _dataY.Min
            End Get
        End Property

        ''' <inheritdoc cref="DataMinY"/>
        Public ReadOnly Property DataMaxY As Double
            Get
                Return _dataY.Max
            End Get
        End Property

        ''' <summary>The Z (length) range the data covers, ignoring the window: the span the legend's slice
        ''' slider runs along.</summary>
        Public ReadOnly Property DataMinZ As Double
            Get
                Return _dataZ.Min
            End Get
        End Property

        ''' <inheritdoc cref="DataMinZ"/>
        Public ReadOnly Property DataMaxZ As Double
            Get
                Return _dataZ.Max
            End Get
        End Property

        ''' <summary>The legend of a surface is a RANGE SELECTOR, not a list of names: two sliders that pick the
        ''' part of the sheet to draw, with the chart re-fitting the picture to whatever they select. That is why
        ''' it has no use for InlineLegendName — it lists nothing but its sliders.</summary>
        Friend Overrides ReadOnly Property IsRangeLegend As Boolean
            Get
                Return True
            End Get
        End Property

        ''' <summary>How tall one slider row is, how big its handles are drawn, and the room a slider's numbers
        ''' take beside its track (they are rotated alongside it when the bar docks at a side).
        '''
        ''' The spacing is deliberately tight — four sliders have to share the bar, and air between them is
        ''' bar that the picture does not get. A row is one text height plus a little, and a docked column is
        ''' the numbers' own room plus the handle it has to clear (a track is a 1px line, so the handle's
        ''' width is what decides how close two of them may stand).</summary>
        Private Const RangeRow As Double = 16
        Private Const RangeHandle As Double = 5
        Private Const RangeLabelWidth As Double = 92
        Private Const RangeLabelRoom As Double = 14

        ''' <summary>The sliders the bar carries, in order: the WIDTH window (X), the SLICE window (Z), and then
        ''' the two axis ZOOM levels — how big the X and Y axes are DRAWN, in percent of the fitted size, which
        ''' is a size and not a window, so each of those two has one handle instead of two.</summary>
        Private Const RangeAxisCount As Integer = 4

        ''' <summary>The first axis that is a ZOOM rather than a window (2 = X zoom, 3 = Y zoom).</summary>
        Private Const ZoomAxisFirst As Integer = 2

        ''' <summary>A zoom slider's two ends, in percent of the fitted size: 100 is exactly as the picture is
        ''' fitted (so it is the default and the top of the scale), 1 draws the axis a hundredth of that size.</summary>
        Private Const MinZoomPercent As Double = 1
        Private Const MaxZoomPercent As Double = 100

        ''' <summary>True when a slider sizes an axis instead of cutting a window out of the data.</summary>
        Private Shared Function IsZoomAxis(axis As Integer) As Boolean
            Return axis >= ZoomAxisFirst
        End Function

        ''' <summary>True when the bar docks at a side, so the sliders run DOWN the frame and their numbers are
        ''' turned on their side — the legend follows the side the form asks for.</summary>
        Private ReadOnly Property RangeVertical As Boolean
            Get
                Return LegendPosition = LegendPosition.Left OrElse LegendPosition = LegendPosition.Right
            End Get
        End Property

        ''' <summary>Which range slider the pointer is dragging (-1 = none) and whether it holds the HIGH end.</summary>
        Private _rangeDragAxis As Integer = -1
        Private _rangeDragHigh As Boolean

        Friend Overrides Function MeasureRangeLegend(frameSize As Size) As Size
            ' FOUR sliders — the WIDTH (X) window, the SLICES (Z) window, then the X and Y zoom levels — each
            ' with its track and the room its numbers need. Across the frame they stack as four rows; down a
            ' side they sit side by side as four columns, so the bar still honours the side the form asked for.
            If RangeVertical Then
                Return New Size(Math.Min(RangeColumn * RangeAxisCount + 8, Math.Max(60, frameSize.Width * 0.5)),
                                frameSize.Height)
            End If
            Return New Size(frameSize.Width,
                            Math.Min(RangeRow * RangeAxisCount + 16, Math.Max(40, frameSize.Height * 0.5)))
        End Function

        Friend Overrides Sub DrawRangeLegend(context As DrawingContext)
            Dim font = Math.Max(6, Math.Min(11, LegendFontSize - 1))
            Dim trackPen = MakePen(MeshColor, 3, ChartLineStyle.Solid)
            For axis = 0 To RangeAxisCount - 1
                Dim colour = RangeColour(axis)
                Dim track = RangeTrack(axis)
                context.DrawLine(trackPen, RangeStart(track), RangeEnd(track))
                Dim handlePen = MakePen(colour, 1, ChartLineStyle.Solid)
                Dim fill As New SolidColorBrush(colour)
                ' A window has TWO ends to drag; a zoom level is a single number, so it carries one handle.
                ' ("handles" would be a VB keyword, hence "ends".)
                Dim ends = If(IsZoomAxis(axis),
                              New Double() {RangeLow(axis)},
                              New Double() {RangeLow(axis), RangeHigh(axis)})
                For Each value In ends
                    Dim point = RangePoint(axis, value)
                    context.DrawRectangle(fill, handlePen, New RoundedRect(
                        New Rect(point.X - RangeHandle, point.Y - RangeHandle, RangeHandle * 2, RangeHandle * 2), 2))
                Next
                ' What is selected, in the slider's own colour: "X 70 … 110", or the same turned on its side
                ' when the bar is docked at a side. The slices' slider counts its slices instead.
                Dim text = MakeText(RangeLabelText(axis), font, colour)
                If RangeVertical Then
                    ' Rotate then translate (the same order the axis names use): the text reads upward, so its
                    ' anchor sits half a text-width below the middle of the column it labels.
                    Dim anchorY = track.Y + track.Height / 2 + text.Width / 2
                    Using context.PushTransform(Matrix.CreateRotation(-Math.PI / 2) *
                                                Matrix.CreateTranslation(_legendRect.X + 4 + Math.Max(0, LegendMargin) + axis * RangeColumn, anchorY))
                        context.DrawText(text, New Point(0, 0))
                    End Using
                Else
                    context.DrawText(text, New Point(_legendRect.X + 4 + Math.Max(0, LegendMargin),
                        track.Y - text.Height / 2))
                End If
            Next
        End Sub

        ''' <summary>What each slider is painted in, so four of them can be told apart at a glance. The two
        ''' zooms are deliberately drawn in colours NO slice of the palette uses, because the legend identifies
        ''' its sliders by colour and a series walking past in the same green would read as a fifth slider.</summary>
        Private Shared Function RangeColour(axis As Integer) As Color
            Select Case axis
                Case 0
                    Return Color.Parse("#4C9FDC")   ' the width window
                Case 1
                    Return Color.Parse("#D9A519")   ' the slice window
                Case 2
                    Return Color.Parse("#00E5FF")   ' how big the X axis is drawn
                Case Else
                    Return Color.Parse("#FF00AA")   ' and the Y (height) axis
            End Select
        End Function

        ''' <summary>The letters the sliders carry: X is the WIDTH of the sheet, Z is how far along it a slice
        ''' stands (the height between them is the data, and is not a choice). The last two SIZE an axis
        ''' rather than pick a part of the data, so they say so.</summary>
        Private Shared Function RangeName(axis As Integer) As String
            Select Case axis
                Case 0
                    Return "X"
                Case 1
                    Return "Z"
                Case 2
                    Return "X zoom"
                Case Else
                    Return "Y zoom"
            End Select
        End Function

        ''' <inheritdoc/>
        Friend Overrides Function RangeSteps(axis As Integer) As IReadOnlyList(Of Double)
            Return If(axis = 1, _sliceSteps, Array.Empty(Of Double)())
        End Function

        ''' <summary>The nearest slice position to a window end, so a window always cuts BETWEEN slices — a
        ''' typed "9" on a sheet sliced every 5 takes the slice at 10 rather than leaving the slice between
        ''' them half shown.</summary>
        Private Function SnapToSlice(value As Double) As Double
            If _sliceSteps.Count = 0 Then Return value
            Return _sliceSteps(NearestStep(value))
        End Function

        ''' <summary>The index of the slice position nearest a Z value (0 when the sheet has no slices yet).</summary>
        Private Function NearestStep(value As Double) As Integer
            Dim best = 0
            For i = 1 To _sliceSteps.Count - 1
                If Math.Abs(_sliceSteps(i) - value) < Math.Abs(_sliceSteps(best) - value) Then best = i
            Next
            Return best
        End Function

        ''' <summary>What one slider says. The continuous one (the width) names the values it cut — "X 70 … 110"
        ''' — and the one that walks slices counts them instead, "Z 3…9 of 55", because the number of series
        ''' on show is the thing being chosen there: on a sheet sliced every 5 the values "0 … 9" would be two
        ''' slices out of fifty-five and read as a mystery. A zoom slider names its percent instead, because
        ''' that is all it is.</summary>
        Private Function RangeLabelText(axis As Integer) As String
            If IsZoomAxis(axis) Then Return $"{RangeName(axis)} {FormatNumber(ZoomPercentOf(axis), 0)} %"
            Dim steps = RangeSteps(axis)
            If steps.Count < 2 Then
                Return $"{RangeName(axis)} {FormatNumber(RangeLow(axis), 1)} … {FormatNumber(RangeHigh(axis), 1)}"
            End If
            Dim low = RangeLow(axis)
            Dim high = RangeHigh(axis)
            Dim from = NearestStep(If(Double.IsNaN(low), steps(0), low)) + 1
            Dim [to] = NearestStep(If(Double.IsNaN(high), steps(steps.Count - 1), high)) + 1
            If [to] < from Then
                Dim swap = from
                from = [to]
                [to] = swap
            End If
            Return $"{RangeName(axis)} {from}…{[to]} of {steps.Count}"
        End Function

        ''' <summary>The range one slider spans: the DATA's own, so a selection can never leave the sheet.</summary>
        Private Function RangeAxis(axis As Integer) As AxisRange
            Return If(axis = 0, _dataX, _dataZ)
        End Function

        ''' <summary>A slider's lowest value: the data's own floor for a window, 1 % for a zoom.</summary>
        Private Function RangeMin(axis As Integer) As Double
            If IsZoomAxis(axis) Then Return MinZoomPercent
            Return RangeAxis(axis).Min
        End Function

        ''' <summary>And its highest: the data's own ceiling, or the fitted size (100 %) for a zoom.</summary>
        Private Function RangeMax(axis As Integer) As Double
            If IsZoomAxis(axis) Then Return MaxZoomPercent
            Return RangeAxis(axis).Max
        End Function

        ''' <summary>How big an axis is DRAWN, in percent — the number its zoom slider sits on.</summary>
        Private Function ZoomPercentOf(axis As Integer) As Double
            Return If(axis = 2, ZoomX, ZoomY)
        End Function

        ''' <summary>The window's low end (unset = the whole data range); a zoom slider's only value is its
        ''' percent.</summary>
        Private Function RangeLow(axis As Integer) As Double
            If IsZoomAxis(axis) Then Return ZoomPercentOf(axis)
            Dim chosen = If(axis = 0, MinX, MinZ)   ' not 'set': that is a VB keyword (BC30183)
            Return If(Double.IsNaN(chosen), RangeAxis(axis).Min, chosen)
        End Function

        ''' <summary>The window's high end (unset = the whole data range).</summary>
        Private Function RangeHigh(axis As Integer) As Double
            If IsZoomAxis(axis) Then Return ZoomPercentOf(axis)
            Dim chosen = If(axis = 0, MaxX, MaxZ)
            Return If(Double.IsNaN(chosen), RangeAxis(axis).Max, chosen)
        End Function

        ''' <summary>How wide one slider's COLUMN is when the bar is docked at a side: its rotated numbers
        ''' take the room at the column's left edge, the track runs down what is left — and only the handle
        ''' has to fit beside it, so the four columns stand as close as their handles allow.</summary>
        Private Const RangeColumn As Double = RangeLabelRoom + RangeHandle * 2 + 2

        ''' <summary>The line a slider sweeps, with the data range mapped onto it.</summary>
        Private Function RangeTrack(axis As Integer) As Rect
            Dim pad = 4 + Math.Max(0, LegendMargin)
            If RangeVertical Then
                Return New Rect(_legendRect.X + pad + axis * RangeColumn + RangeLabelRoom, _legendRect.Y + pad,
                                1, Math.Max(10, _legendRect.Height - pad * 2))
            End If
            Dim left = _legendRect.X + pad + RangeLabelWidth
            Return New Rect(left, _legendRect.Y + pad + 10 + axis * RangeRow,
                            Math.Max(10, _legendRect.Right - pad - left), 1)
        End Function

        Private Function RangeStart(track As Rect) As Point
            If RangeVertical Then Return New Point(track.X + track.Width / 2, track.Y)
            Return New Point(track.X, track.Y + track.Height / 2)
        End Function

        Private Function RangeEnd(track As Rect) As Point
            If RangeVertical Then Return New Point(track.X + track.Width / 2, track.Bottom)
            Return New Point(track.Right, track.Y + track.Height / 2)
        End Function

        ''' <summary>Where a value sits on its slider. A slider whose axis is made of slices puts its handles on
        ''' the SLICES, so a drag steps from one slice to the next; a continuous one maps the value straight
        ''' onto its track.</summary>
        Private Function RangePoint(axis As Integer, value As Double) As Point
            Dim track = RangeTrack(axis)
            Dim steps = RangeSteps(axis)
            Dim f As Double
            If steps.Count > 1 Then
                f = NearestStep(If(Double.IsNaN(value), steps(0), value)) / (steps.Count - 1)
            Else
                Dim span = RangeMax(axis) - RangeMin(axis)
                f = If(span > 0, Math.Clamp((value - RangeMin(axis)) / span, 0, 1), 0)
            End If
            Dim from = RangeStart(track)
            Dim finish = RangeEnd(track)
            Return New Point(from.X + (finish.X - from.X) * f, from.Y + (finish.Y - from.Y) * f)
        End Function

        ''' <summary>The value a point on a slider names, clamped to the data range — and, on a slider made of
        ''' slices, snapped to the nearest of them, so a drag can only ever add or drop whole slices.</summary>
        Private Function RangeValue(axis As Integer, position As Point) As Double
            Dim track = RangeTrack(axis)
            Dim from = RangeStart(track)
            Dim finish = RangeEnd(track)
            Dim span = If(RangeVertical, Math.Max(1e-6, finish.Y - from.Y), Math.Max(1e-6, finish.X - from.X))
            Dim f = Math.Clamp(If(RangeVertical, (position.Y - from.Y) / span, (position.X - from.X) / span), 0, 1)
            Dim steps = RangeSteps(axis)
            If steps.Count > 1 Then Return steps(CInt(Math.Round(f * (steps.Count - 1))))
            Return RangeMin(axis) + f * (RangeMax(axis) - RangeMin(axis))
        End Function

        ''' <summary>The band a pointer grabs to take hold of a slider: its own row across the frame, its own
        ''' COLUMN down a side — so a press picks the slider it landed on instead of always the first one.</summary>
        Private Function RangeBand(axis As Integer) As Rect
            Dim pad = 4 + Math.Max(0, LegendMargin)
            If RangeVertical Then
                Return New Rect(_legendRect.X + pad + axis * RangeColumn, _legendRect.Y + 1,
                                RangeColumn, Math.Max(10, _legendRect.Height - 2))
            End If
            Dim track = RangeTrack(axis)
            Return New Rect(_legendRect.X + 1, track.Y - RangeRow / 2,
                            Math.Max(10, _legendRect.Width - 2), RangeRow)
        End Function

        ''' <summary>-1, or the slider a pointer position falls on.</summary>
        Private Function RangeHitAxis(position As Point) As Integer
            If _legendRect.Width <= 0 OrElse Not _legendRect.Contains(position) Then Return -1
            For axis = 0 To RangeAxisCount - 1
                If RangeBand(axis).Contains(position) Then Return axis
            Next
            Return -1
        End Function

        ''' <summary>Moves the end of a window the pointer is dragging: the end nearer the pointer takes the
        ''' value, the other one stays put (so dragging past it pins them together instead of swapping). On a
        ''' ZOOM slider there is no window to move: the one number it carries is the size the axis is drawn at.</summary>
        Private Sub DragRangeTo(position As Point)
            Dim axis = _rangeDragAxis
            If axis < 0 Then Return
            Dim value = RangeValue(axis, position)
            If IsZoomAxis(axis) Then
                Dim percent = Math.Clamp(value, MinZoomPercent, MaxZoomPercent)
                If axis = 2 Then
                    ZoomX = percent
                Else
                    ZoomY = percent
                End If
            ElseIf axis = 0 Then
                If _rangeDragHigh Then
                    MaxX = Math.Max(value, RangeLow(0))
                Else
                    MinX = Math.Min(value, RangeHigh(0))
                End If
            Else
                If _rangeDragHigh Then
                    MaxZ = Math.Max(value, RangeLow(1))
                Else
                    MinZ = Math.Min(value, RangeHigh(1))
                End If
            End If
            InvalidateVisual()
        End Sub

        ''' <summary>The colours inline slices take, one after the other, so they can be told apart.</summary>
        Private Shared ReadOnly SlicePalette As Color() = {
            Color.Parse("#2D7DD2"), Color.Parse("#E4572E"), Color.Parse("#3FA34D"), Color.Parse("#B07CC6"),
            Color.Parse("#D9A519"), Color.Parse("#4C9FDC"), Color.Parse("#EE6C4D"), Color.Parse("#3D9970")
        }

        ''' <summary>The Z of every slice of the last read, keyed by the plot the series produced.</summary>
        Private ReadOnly _sliceZ As New Dictionary(Of Plot, Double)()

        ''' <summary>Those same Z values, in order and without repeats: the positions the sheet is actually cut
        ''' at, which is what the legend's second slider walks and what a window is snapped to — a window that
        ''' ends between two slices would otherwise show a slice the slider's numbers do not mention.</summary>
        Private ReadOnly _sliceSteps As New List(Of Double)()

        ''' <summary>The width and height ranges the DATA covers, window or not, as of the last read. The
        ''' legend's range sliders span these, so a selection can never name a range the sheet has not got.</summary>
        Private _dataX As AxisRange = AxisRange.Over(New Double() {}, Double.NaN, Double.NaN, 6, 1)
        Private _dataY As AxisRange = AxisRange.Over(New Double() {}, Double.NaN, Double.NaN, 5, 5)
        Private _dataZ As AxisRange = AxisRange.Over(New Double() {}, Double.NaN, Double.NaN, 5, 5)

        Private _rotateDrag As Boolean
        Private _rotateFrom As Point
        Private _rotateElevation As Double
        Private _rotateAzimuth As Double

        Protected Overrides Sub OnPropertyChanged(change As AvaloniaPropertyChangedEventArgs)
            MyBase.OnPropertyChanged(change)
            If change.Property Is ValuesProperty OrElse change.Property Is SampleSetsProperty Then
                ' The data itself changed: the read is cached, so it has to be dropped as well.
                Reload()
            End If
        End Sub

        ''' <summary>One corrugation profile, typed in — the chart's only inline data.</summary>
        Protected Overrides Function InlineData() As ChartData
            Dim samples = If(Values, Array.Empty(Of Double)())
            If samples.Length > 0 Then
                Return New ChartData With {
                    .Xs = Enumerable.Range(1, samples.Length).Select(Function(i) CDbl(i)).ToArray(),
                    .Ys = samples
                }
            End If
            Return If(Series.Count > 0, ReadSlice(Series(0), 0), New ChartData())
        End Function

        Protected Overrides Sub SetInlineData(xs As Double(), ys As Double())
            Values = ys
        End Sub

        ''' <summary>One slice per series — and one shared X column for the whole chart, which is what makes the
        ''' slices line up into a grid.</summary>
        Friend Overrides Function BuildPlots() As List(Of Plot)
            Dim plots As New List(Of Plot)()
            If Series.Count = 0 Then
                Dim sets = SampleSets
                If sets IsNot Nothing AndAlso sets.Length > 0 Then
                    ' A surface sketched inline: one slice per semicolon-separated group, each in its own
                    ' colour of the palette so successive slices can be told apart.
                    For i = 0 To sets.Length - 1
                        plots.Add(New Plot With {
                            .Data = New ChartData With {
                                .Xs = Enumerable.Range(1, sets(i).Length).Select(Function(k) CDbl(k)).ToArray(),
                                .Ys = sets(i)
                            },
                            .LineColor = SlicePalette(i Mod SlicePalette.Length),
                            .LineThickness = LineThickness,
                            .LineStyle = LineStyle
                        })
                    Next
                Else
                    Dim typed = Values
                    Dim data As ChartData
                    If typed IsNot Nothing AndAlso typed.Length > 0 Then
                        data = New ChartData With {
                            .Xs = Enumerable.Range(1, typed.Length).Select(Function(k) CDbl(k)).ToArray(),
                            .Ys = typed
                        }
                    Else
                        data = ReadSlice(Nothing, 0)
                    End If
                    plots.Add(New Plot With {
                        .Data = data,
                        .LineColor = LineColor,
                        .LineThickness = LineThickness,
                        .LineStyle = LineStyle
                    })
                End If
            Else
                For i = 0 To Series.Count - 1
                    Dim trace = Series(i)
                    plots.Add(New Plot With {
                        .Data = ReadSlice(trace, i),
                        .Definition = trace,
                        .LineColor = trace.LineColor,
                        .LineThickness = trace.LineThickness,
                        .LineStyle = trace.LineStyle,
                        .Visible = trace.Visible
                    })
                Next
            End If

            ' ONE width scale for the whole picture (every slice is read against the same X column, so a scale
            ' per slice would draw two ridges at two widths and claim they are equal), and one height scale
            ' that always includes the floor at zero.
            Dim xs = plots.SelectMany(Function(p) p.Data.Xs).ToList()
            Dim ys = plots.SelectMany(Function(p) p.Data.Ys).ToList()
            ys.Add(0.0)
            If xs.Count = 0 Then
                xs.Add(0.0)
                xs.Add(1.0)
            End If
            If ys.Count = 0 Then
                ys.Add(0.0)
                ys.Add(1.0)
            End If
            Dim xr = AxisRange.Over(xs, MinX, MaxX, 6, 1)
            Dim yr = AxisRange.Over(ys, MinY, MaxY, 5, 5)
            ' … and what the DATA alone covers, which is what the legend's range sliders span. Zero is part of
            ' the height range because the floor is (ZeroBaseline), so a slider cannot cut the floor away.
            _dataX = AxisRange.Over(xs, Double.NaN, Double.NaN, 6, 1)
            _dataY = AxisRange.Over(ys, Double.NaN, Double.NaN, 5, 5)
            ReadSlicePositions(plots)
            ' The Z of every slice is known only after ReadSlicePositions, and the legend's slice slider spans
            ' exactly these numbers: the sheet's own length, not whatever window is set.
            _dataZ = AxisRange.Over(_sliceZ.Values.ToList(), Double.NaN, Double.NaN, 5, 5)
            ' The slider walks the slices one at a time, so their positions are kept in order without repeats.
            _sliceSteps.Clear()
            _sliceSteps.AddRange(_sliceZ.Values.Distinct().OrderBy(Function(z) z))
            For Each plot In plots
                plot.XRange = xr
                plot.YRange = yr
            Next

            Return plots
        End Function

        ''' <summary>One slice's profile: the series' own Y column, else the chart's YColumn and then the next
        ''' column along (C, D, E …) — one column per slice is how a capture is laid out.</summary>
        Private Function ReadSlice(slice As ChartSeries, index As Integer) As ChartData
            Dim column As String
            If slice IsNot Nothing AndAlso Not String.IsNullOrWhiteSpace(slice.YColumn) Then
                column = slice.YColumn
            Else
                column = SpreadsheetReader.ColumnAfter(If(YColumn, "C"), index)
            End If
            Return DataFor(If(XColumn, "B"), column, False)
        End Function

        ''' <summary>The Z of every slice: the sheet's OWN numbers when it has them (one row of them, one per
        ''' series column), and a numbered sequence from ZStart when it does not — so a workbook that names its
        ''' columns still draws, and a workbook that positions them draws them where it says.</summary>
        Private Sub ReadSlicePositions(plots As List(Of Plot))
            _sliceZ.Clear()
            Dim fromSheet As New Dictionary(Of String, Double)(StringComparer.OrdinalIgnoreCase)
            Dim file = SourceFile
            If Not String.IsNullOrWhiteSpace(file) AndAlso plots.Count > 0 Then
                fromSheet = SpreadsheetReader.RowNumbers(file, If(ZRow > 0, ZRow, Math.Max(1, HeaderRow)), SourceSheet)
            End If

            For i = 0 To plots.Count - 1
                Dim column As String
                If Series.Count > i AndAlso Not String.IsNullOrWhiteSpace(Series(i).YColumn) Then
                    column = Series(i).YColumn
                Else
                    column = SpreadsheetReader.ColumnAfter(If(YColumn, "C"), i)
                End If
                Dim found As Double = 0
                If fromSheet.TryGetValue(column, found) Then
                    _sliceZ(plots(i)) = found
                Else
                    _sliceZ(plots(i)) = ZStart + i * ZStep
                End If
            Next
        End Sub

        ''' <summary>
        ''' Draws the sheet: the floor and the three projected axes, then the quads — one BAND per pair of
        ''' neighbouring slices, painted from the farthest back to the nearest, because a solid surface hides
        ''' what is behind it. Each band is a single geometry (the solid) and a single geometry (its mesh
        ''' lines), so a 100 x 100 sheet is two hundred shapes rather than ten thousand.
        ''' </summary>
        Friend Overrides Sub DrawSeriesLayer(context As DrawingContext, plots As List(Of Plot), plot As Rect)
            ' The Z window picks which SLICES are drawn at all (the legend's second slider): a long capture can
            ' be looked at a few slices at a time, and the depth scale re-fits to what is left.
            Dim everyZ = _sliceZ.Values.ToList()
            ' The ends are snapped to the slices themselves, so the picture, the depth scale and the slider's
            ' own numbers agree: "Z 1…3 of 55" draws exactly the slices 1, 2 and 3.
            Dim lowZ = SnapToSlice(If(Double.IsNaN(MinZ), If(everyZ.Count > 0, everyZ.Min(), 0.0), MinZ))
            Dim highZ = SnapToSlice(If(Double.IsNaN(MaxZ), If(everyZ.Count > 0, everyZ.Max(), 1.0), MaxZ))
            If highZ < lowZ Then
                Dim swap = lowZ
                lowZ = highZ
                highZ = swap
            End If
            Dim visible = plots.Where(Function(p)
                                          If Not (p.Visible AndAlso p.Data.HasData) Then Return False
                                          Dim z As Double = 0
                                          If Not _sliceZ.TryGetValue(p, z) Then Return False
                                          Return z >= lowZ - 1e-9 AndAlso z <= highZ + 1e-9
                                      End Function).ToList()
            ' The SIZE of the X and Y axes, as a factor: 100 % is the fitted size, and the range a form sets is
            ' not touched by it (see ZoomX/ZoomY) — the sheet just gets smaller or bigger about the middle.
            ' Above 100 % the plot box would clip the picture, so 100 is the top of the scale and the legend's
            ' two zoom sliders run 1…100 % of it. (VB allows no comment lines inside an object initializer:
            ' they end the implicit line continuation.)
            Dim world As New SurfaceWorld With {
                .View = MakeView(plot),
                .Depth = Math.Clamp(ZSpacing, 0.1, 4),
                .ZoomXFactor = Math.Clamp(ZoomX, MinZoomPercent, MaxZoomPercent) / 100.0,
                .ZoomYFactor = Math.Clamp(ZoomY, MinZoomPercent, MaxZoomPercent) / 100.0,
                .Xs = If(visible.Count > 0, visible(0).XRange, AxisRange.Over({0.0, 1.0}, MinX, MaxX, 6, 1)),
                .Ys = If(visible.Count > 0, visible(0).YRange, AxisRange.Over({0.0, 1.0}, MinY, MaxY, 5, 5)),
                .Zs = AxisRange.Over(everyZ, lowZ, highZ, 5, 5)
            }
            DrawFloor(context, world)

            If visible.Count < 2 Then Return   ' one slice is a profile, not a surface

            ' The slices of this render: their own samples CUT to the width window, their colour, and the depth
            ' their Z VALUE puts them at.  The cut is what keeps a window a window — see CutToWindow.
            Dim slices As New List(Of SurfaceSlice)()
            For Each p In visible
                Dim z As Double = 0
                If _sliceZ.TryGetValue(p, z) Then z = z Else z = 0
                Dim cut = CutToWindow(p.Data.Xs, p.Data.Ys, world.Xs.Min, world.Xs.Max)
                Dim item As New SurfaceSlice With {
                    .Xs = cut.Xs,
                    .Ys = cut.Ys,
                    .Color = p.LineColor,
                    .Z = z
                }
                slices.Add(item)
            Next
            For Each slice In slices
                slice.Depth = world.UnitZOf(slice.Z)
            Next

            ' ONE stride for every slice and the last sample always kept, so the quads join like to like.
            Dim count = slices.Max(Function(s) s.Xs.Length)
            Dim jump = If(MaxPoints > 0 AndAlso count > MaxPoints, CInt(Math.Ceiling(count / CDbl(MaxPoints))), 1)
            Dim kept As New List(Of Integer)()
            For i = 0 To count - 1 Step Math.Max(1, jump)
                kept.Add(i)
            Next
            If count > 0 AndAlso kept(kept.Count - 1) <> count - 1 Then kept.Add(count - 1)

            ' The temperature ramp's ends default to the DATA's own least and greatest value, so the sheet uses
            ' the whole ramp; ColorMin/ColorMax pin it when several charts are read against one scale.
            Dim values = slices.SelectMany(Function(s) s.Ys).ToList()
            Dim rampLow = If(Double.IsNaN(HeatMin), If(values.Count > 0, values.Min(), 0.0), HeatMin)
            Dim rampHigh = If(Double.IsNaN(HeatMax), If(values.Count > 0, values.Max(), 1.0), HeatMax)
            If rampHigh <= rampLow Then rampHigh = rampLow + 1
            Dim opacity = Math.Clamp(SolidOpacity, 0, 100) / 100.0
            Dim meshPen = MakePen(MeshColor, MeshThickness, ChartLineStyle.Solid)
            Dim rampLevels = RampSteps(world, slices.Count - 1, rampLow, rampHigh)
            Dim baseBrush As IBrush = New SolidColorBrush(BaseColor)
            Dim basePen = MakePen(BaseColor, 1, ChartLineStyle.Solid)

            ' Farthest band first: the projection itself says which end of the sheet is the far one.
            Dim order = Enumerable.Range(0, slices.Count).
                OrderBy(Function(i) world.View.Depth(0.5, 0.5, slices(i).Depth)).ToList()

            Using clip = context.PushClip(plot)
                For rank = 0 To order.Count - 2
                    Dim far = order(rank)
                    Dim near = order(rank + 1)
                    ' The block the sheet stands on, when it is asked for: the SIDES of every band and the two
                    ' ENDS of the sheet, each dropped from its own profile to the floor. Drawn with the bands
                    ' and in the same back-to-front order, and BEFORE each band's own fill, so a nearer face
                    ' hides the sheet behind it (a block occludes what it stands in front of), and the band's
                    ' opaque fill covers the hairline where the two meet.
                    If ShowBase Then
                        If rank = 0 Then context.DrawGeometry(baseBrush, basePen, BaseEndGeometry(world, slices(far), kept))
                        If rank + 2 = order.Count Then context.DrawGeometry(baseBrush, basePen, BaseEndGeometry(world, slices(near), kept))
                        If kept.Count > 0 Then
                            context.DrawGeometry(baseBrush, basePen, BaseSideGeometry(world, slices(far), slices(near), kept(0)))
                            context.DrawGeometry(baseBrush, basePen, BaseSideGeometry(world, slices(far), slices(near), kept(kept.Count - 1)))
                        End If
                    End If
                    If Style <> SurfaceStyle.GridMesh Then
                        If ColorBy = SurfaceColorMode.Temperature Then
                            DrawTemperatureFill(context, world, slices, far, near, kept, rampLow, rampHigh, rampLevels, opacity)
                        Else
                            Dim brush As IBrush = New SolidColorBrush(slices(far).Color, opacity)
                            ' The band is filled AND outlined in its own brush: neighbouring bands are separate draw
                            ' calls, so their shared edge would otherwise show a hairline of the background through
                            ' the sheet (the same seam the per-quad fill used to leave inside a band).
                            context.DrawGeometry(brush, New Pen(brush, 1), BandGeometry(world, slices, far, near, kept, False))
                        End If
                    End If
                    If Style <> SurfaceStyle.Solid Then
                        context.DrawGeometry(Nothing, meshPen, BandGeometry(world, slices, far, near, kept, True))
                    End If
                Next
            End Using
        End Sub

        ''' <summary>
        ''' How many levels the height ramp is drawn in. About one per two pixels of the sheet's own height, so
        ''' the level lines themselves are never what you see — with a floor of 8 and a ceiling that keeps a
        ''' sheet of many slices to a sane number of fills (one per level per band).
        ''' </summary>
        Private Shared Function RampSteps(world As SurfaceWorld, bands As Integer, low As Double, high As Double) As Integer
            Dim span = world.UnitY(high) - world.UnitY(low)
            Dim pixels = Math.Abs(world.View.CosElevation * world.View.Scale * span)
            Dim levels = CInt(Math.Round(pixels / 2))
            Return Math.Clamp(levels, 8, Math.Max(8, 4000 \ Math.Max(1, bands)))
        End Function

        ''' <summary>
        ''' One band's temperature fill: the sheet coloured BY HEIGHT — every part of it takes the colour of the
        ''' height it stands at, so a ridge is HighColor's end and a valley LowColor's however the cube is turned.
        '''
        ''' A brush can only know where a PIXEL is on the screen, and on a tipped cube the screen position mixes a
        ''' point's height with how far back it stands (moving along the eye ray changes the height without moving
        ''' the pixel at all). One gradient per band — what this used to be, and what the manual promised as
        ''' "level with the data" — therefore coloured one height DIFFERENTLY from slice to slice, by
        ''' tan(Elevation) of the ramp; a narrow Z window made it unmistakable (reported from the running app
        ''' 2026-09-24: three slices, and the plateau one shade at the front and another at the back).
        '''
        ''' So the ramp is not a brush here at all: each drawn triangle is cut on the ramp's own levels and every
        ''' piece is filled with its level's colour (see CutToLevels). A triangle's height is linear across it, so
        ''' the cut is exact — the picture is a true contour map of the height, which is what "colour by height"
        ''' means, and no view can change it.
        ''' </summary>
        Private Sub DrawTemperatureFill(context As DrawingContext, world As SurfaceWorld, slices As List(Of SurfaceSlice),
                                        far As Integer, near As Integer, kept As List(Of Integer),
                                        low As Double, high As Double, levels As Integer, opacity As Double)
            If kept.Count < 2 OrElse levels < 1 Then Return
            Dim span = high - low
            If span <= 0 Then span = 1

            ' One geometry per level, all of them NonZero: a fold makes a band's own pieces overlap, and NonZero
            ' adds those overlaps up (see AddPolygon) instead of cancelling them into a see-through hole.
            Dim geometries(levels - 1) As StreamGeometry
            Dim contexts(levels - 1) As StreamGeometryContext
            Dim winding(levels - 1) As Double
            Dim used(levels - 1) As Boolean
            For level = 0 To levels - 1
                geometries(level) = New StreamGeometry()
                contexts(level) = geometries(level).Open()
                contexts(level).SetFillRule(FillRule.NonZero)
            Next

            Dim points As New List(Of Point)(4)
            Dim field As New List(Of Double)(4)
            Try
                For k = 0 To kept.Count - 2
                    ' A quad needs all four of its corners: a sample either slice is missing ends the fill there
                    ' rather than smearing it across the gap.
                    Dim a As Point
                    Dim b As Point
                    Dim c As Point
                    Dim d As Point
                    If Not TryPoint(world, slices(far), kept(k), a) Then Continue For
                    If Not TryPoint(world, slices(far), kept(k + 1), b) Then Continue For
                    If Not TryPoint(world, slices(near), kept(k + 1), c) Then Continue For
                    If Not TryPoint(world, slices(near), kept(k), d) Then Continue For
                    Dim ay = slices(far).Ys(kept(k))
                    Dim by = slices(far).Ys(kept(k + 1))
                    Dim cy = slices(near).Ys(kept(k + 1))
                    Dim dy = slices(near).Ys(kept(k))

                    ' The quad is split by the b–d diagonal into two triangles. A triangle cannot cross itself,
                    ' which is what keeps a fold's overlapping pieces adding up rather than cancelling.
                    CutToLevels(contexts, used, winding, points, field, a, b, d, ay, by, dy, low, span, levels)
                    CutToLevels(contexts, used, winding, points, field, b, c, d, by, cy, dy, low, span, levels)
                Next
            Finally
                For Each open In contexts
                    open.Dispose()
                Next
            End Try

            For level = 0 To levels - 1
                If Not used(level) Then Continue For
                ' The level's own colour is the ramp's middle there, and the fill is outlined in that same
                ' colour: two neighbouring levels are separate draw calls, so their shared edge would otherwise
                ' show a hairline of the background through the sheet.
                Dim brush As IBrush = New SolidColorBrush(Blend(LowColor, HighColor, (level + 0.5) / levels), opacity)
                context.DrawGeometry(brush, New Pen(brush, 1), geometries(level))
            Next
        End Sub

        ''' <summary>
        ''' Cuts one triangle into the ramp's levels: for every level it spans, the part of the triangle whose
        ''' height sits inside that level is clipped out and added to that level's geometry. The height is
        ''' linear across a triangle, so the cut sits exactly on the level line — which is why the sheet reads
        ''' as a contour map of its own height instead of as a tint that follows the screen.
        ''' </summary>
        Private Shared Sub CutToLevels(contexts As StreamGeometryContext(), used As Boolean(), winding As Double(),
                                       points As List(Of Point), field As List(Of Double),
                                       p0 As Point, p1 As Point, p2 As Point, y0 As Double, y1 As Double, y2 As Double,
                                       low As Double, span As Double, levels As Integer)
            ' A level index is only valid up to the LAST one, and a height at (or above) the ramp's own top is
            ' the top level — not one past it. Without that clamp a triangle sitting exactly at the maximum
            ' produced first = levels against last = levels - 1, so its loop body never ran and the triangle
            ' was never filled at all: a sheet whose crest plateau lies at its own maximum came out with its
            ' TOPS OPEN (reported 2026-09-24, right after the ramp became a function of the height).
            Dim top = levels - 0.000000001
            Dim s0 = Math.Clamp((y0 - low) / span * levels, 0.0, top)
            Dim s1 = Math.Clamp((y1 - low) / span * levels, 0.0, top)
            Dim s2 = Math.Clamp((y2 - low) / span * levels, 0.0, top)
            Dim first = Math.Max(0, CInt(Math.Floor(Math.Min(s0, Math.Min(s1, s2)))))
            Dim last = Math.Min(levels - 1, CInt(Math.Floor(Math.Max(s0, Math.Max(s1, s2)))))
            For level = first To last
                points.Clear()
                points.Add(p0)
                points.Add(p1)
                points.Add(p2)
                field.Clear()
                field.Add(s0)
                field.Add(s1)
                field.Add(s2)
                ClipHalf(points, field, level, True)
                ClipHalf(points, field, level + 1, False)
                If points.Count < 3 Then Continue For
                used(level) = True
                winding(level) = AddPolygon(contexts(level), points, winding(level))
            Next
        End Sub

        ''' <summary>Keeps the part of a polygon where the (linear) height field is at or above
        ''' <paramref name="bound"/> — or at or below it, when <paramref name="above"/> is false — interpolating
        ''' the crossing points, which is what puts the cut exactly on the level line.</summary>
        Private Shared Sub ClipHalf(points As List(Of Point), field As List(Of Double), bound As Double, above As Boolean)
            Dim count = points.Count
            If count = 0 Then Return
            Dim keptPoints As New List(Of Point)(count + 1)
            Dim keptField As New List(Of Double)(count + 1)
            For i = 0 To count - 1
                Dim j = (i + 1) Mod count
                Dim si = field(i)
                Dim sj = field(j)
                Dim insideI = If(above, si >= bound, si <= bound)
                Dim insideJ = If(above, sj >= bound, sj <= bound)
                If insideI Then
                    keptPoints.Add(points(i))
                    keptField.Add(si)
                End If
                If insideI = insideJ Then Continue For
                Dim t = (bound - si) / (sj - si)
                keptPoints.Add(New Point(points(i).X + (points(j).X - points(i).X) * t,
                                         points(i).Y + (points(j).Y - points(i).Y) * t))
                keptField.Add(bound)
            Next
            points.Clear()
            points.AddRange(keptPoints)
            field.Clear()
            field.AddRange(keptField)
        End Sub

        ''' <summary>
        ''' Adds one cut piece to its level's geometry, wound the way that level's first piece was.
        ''' <paramref name="want"/> is that sign and comes back so the whole level keeps it — the same rule as a
        ''' band's triangles, and for the same reason: NON-ZERO only adds a fold's overlapping pieces up when
        ''' they are wound alike, and a level's pieces come from many triangles whose winds differ.
        ''' </summary>
        Private Shared Function AddPolygon(g As StreamGeometryContext, polygon As List(Of Point), want As Double) As Double
            Dim area = 0.0
            For i = 0 To polygon.Count - 1
                Dim j = (i + 1) Mod polygon.Count
                area += polygon(i).X * polygon(j).Y - polygon(j).X * polygon(i).Y
            Next
            If Math.Abs(area) < 0.000000001 Then Return want
            If want = 0 Then want = area
            Dim reverse = area * want < 0
            g.BeginFigure(polygon(If(reverse, polygon.Count - 1, 0)), True)
            For i = 1 To polygon.Count - 1
                g.LineTo(polygon(If(reverse, polygon.Count - 1 - i, i)))
            Next
            g.EndFigure(True)
            Return want
        End Function

        ''' <summary>Halfway between two colours — what an edge-on ramp collapses to.</summary>
        Private Shared Function Blend(a As Color, b As Color, t As Double) As Color
            Return Color.FromArgb(255,
                CByte(Math.Round(a.R + (b.R - a.R) * t)),
                CByte(Math.Round(a.G + (b.G - a.G) * t)),
                CByte(Math.Round(a.B + (b.B - a.B) * t)))
        End Function

        ''' <summary>
        ''' One band's geometry: the triangles between two neighbouring slices (for the solid), or the mesh lines
        ''' of that band (for the grid) — the two profile lines and a rung at every sample, which is exactly the
        ''' mesh a corrugated sheet suggests. A sample either slice is missing ends the band there rather than
        ''' smearing it across the gap.
        ''' </summary>
        Private Shared Function BandGeometry(world As SurfaceWorld, slices As List(Of SurfaceSlice),
                                             far As Integer, near As Integer, kept As List(Of Integer),
                                             wire As Boolean) As StreamGeometry
            Dim geometry As New StreamGeometry()
            Using g = geometry.Open()
                ' NON-ZERO filling is not a detail here: a fold makes a band's own triangles overlap, and the
                ' default even-odd rule would CANCEL every one of those overlaps into a see-through hole.
                ' Non-zero adds them up — which is why every triangle is wound the same way (see BandTriangle).
                g.SetFillRule(FillRule.NonZero)
                If wire Then
                    AddProfile(g, world, slices(far), kept)
                    AddProfile(g, world, slices(near), kept)
                    For i = 0 To kept.Count - 1
                        AddRung(g, world, slices(far), slices(near), kept(i))
                    Next
                    Return geometry
                End If
                ' ONE TRIANGLE PAIR per adjacent sample pair, wound the same way for the whole band.
                ' Neither a quad nor a ribbon is safe here: where the projection folds — and at a low
                ' Elevation a corrugated sheet folds in EVERY band, because each slice's profile collapses
                ' into a single screen column — a figure whose outline crosses itself has two loops wound
                ' OPPOSITE ways, so NonZero SUMS them to zero and the fill is dropped.  That hole is the
                ' chart's own backcolour showing through a surface that should be solid (reported from the
                ' running app on a form whose PlotBackColor is red, 2026-09-24).  A triangle cannot cross
                ' itself, and normalising every triangle to the band's first winding makes the ones a fold
                ' overlaps add up (±2) instead of cancelling.  The 1px pen in the band's own brush covers
                ' the seams between neighbouring triangles; a missing sample ends the run.
                Dim farRun As New List(Of Point)()
                Dim nearRun As New List(Of Point)()
                Dim want As Double = 0              ' the winding sign this band's triangles take (0 = not set yet)
                For Each index In kept
                    Dim a As Point = Nothing
                    Dim b As Point = Nothing
                    If Not TryPoint(world, slices(far), index, a) OrElse Not TryPoint(world, slices(near), index, b) Then
                        FlushRun(g, farRun, nearRun, want)
                        Continue For
                    End If
                    farRun.Add(a)
                    nearRun.Add(b)
                Next
                FlushRun(g, farRun, nearRun, want)
            End Using
            Return geometry
        End Function

        ''' <summary>Emits a band's fill from a run of samples: ONE TRIANGLE PAIR per adjacent sample pair, every
        ''' one of them wound the way the band's first triangle was, so the triangles a fold overlaps accumulate
        ''' winding instead of cancelling it.  See BandTriangle for why a quad or a ribbon is not safe.  A run
        ''' shorter than two samples has nothing to fill.</summary>
        Private Shared Sub FlushRun(g As StreamGeometryContext, farRun As List(Of Point), nearRun As List(Of Point),
                                    ByRef want As Double)
            If farRun.Count >= 2 Then
                For k As Integer = 0 To farRun.Count - 2
                    Dim a = farRun(k) : Dim b = farRun(k + 1)
                    Dim c = nearRun(k + 1) : Dim d = nearRun(k)
                    ' The pair is split by the b–d diagonal into two corners, and a corner cannot cross
                    ' itself — which is the whole reason the quad is not filled as one figure.
                    want = BandTriangle(g, a, b, d, want)
                    want = BandTriangle(g, b, c, d, want)
                Next
            End If
            farRun.Clear()
            nearRun.Clear()
        End Sub

        ''' <summary>One filled triangle of a band, wound the way the band's first one was — want is that sign,
        ''' and it comes back so every triangle of the band keeps it.  This is what stops a fold's overlapping
        ''' triangles from cancelling: a triangle is the only polygon that cannot cross itself, so there is no
        ''' loop whose winding could be subtracted from another's.  The name is also the bundled-file staleness
        ''' marker (src/bundledComponents.ts): a project still holding a copy of this chart from before
        ''' 2026-09-24 has the old one-figure band fill and no such member, and drawing is exactly the kind of
        ''' change such a copy cannot show — which is why such a form kept drawing see-through bands in the app
        ''' while the designer (built from this file) looked right.</summary>
        Private Shared Function BandTriangle(g As StreamGeometryContext, p As Point, q As Point, r As Point,
                                            want As Double) As Double
            Dim area = (q.X - p.X) * (r.Y - p.Y) - (q.Y - p.Y) * (r.X - p.X)
            If Math.Abs(area) < 0.000000001 Then Return want   ' no area: nothing to fill, nothing to set
            If want = 0 Then want = area                       ' the band's first real triangle sets the sign
            If area * want < 0 Then
                Dim keep = q
                q = r
                r = keep                                       ' the other way round, so the windings add up
            End If
            g.BeginFigure(p, True)
            g.LineTo(q)
            g.LineTo(r)
            g.EndFigure(True)
            Return want
        End Function

        ''' <summary>
        ''' One slice's samples CUT to the width window: the samples inside it, plus one point per crossing of
        ''' the window's own edges (interpolated), so the sheet ends exactly ON the edge instead of losing a
        ''' sample step there.
        '''
        ''' This is what stops a width window growing a WALL at each end.  SurfaceWorld.UnitX clamps, so a
        ''' sample outside the window is drawn at x = 0 (or 1): while the samples were passed through
        ''' untouched, every off-window sample of every slice collapsed onto the edge, and the fill between two
        ''' slices became a flat slab perpendicular to the sheet — two false panels, pinned to the window edges
        ''' and therefore "stationary" while the window was dragged (reported from the running app 2026-09-24;
        ''' a SAVED window shows them in the designer too, which is how it was reproduced).  A window is a CUT:
        ''' data outside it must not reach the picture at all, exactly as the Z window drops whole slices.
        ''' </summary>
        Private Shared Function CutToWindow(xs As Double(), ys As Double(), min As Double,
                                            max As Double) As CutSamples
            Dim count = Math.Min(xs.Length, ys.Length)
            If count = 0 OrElse max <= min Then Return New CutSamples With {.Xs = xs, .Ys = ys}
            Dim keptXs As New List(Of Double)(count + 2)
            Dim keptYs As New List(Of Double)(count + 2)
            For i As Integer = 0 To count - 1
                Dim inside = xs(i) >= min AndAlso xs(i) <= max
                If i > 0 Then
                    Dim previousInside = xs(i - 1) >= min AndAlso xs(i - 1) <= max
                    If inside <> previousInside Then
                        Crossing(min, max, xs(i - 1), ys(i - 1), xs(i), ys(i), keptXs, keptYs)
                    ElseIf Not inside AndAlso Math.Min(xs(i - 1), xs(i)) <= min AndAlso Math.Max(xs(i - 1), xs(i)) >= max Then
                        ' A segment that jumps clean over a narrow window crosses BOTH edges.
                        Crossing(min, max, xs(i - 1), ys(i - 1), xs(i), ys(i), keptXs, keptYs)
                    End If
                End If
                If inside Then
                    keptXs.Add(xs(i))
                    keptYs.Add(ys(i))
                End If
            Next
            Return New CutSamples With {.Xs = keptXs.ToArray(), .Ys = keptYs.ToArray()}
        End Function

        ''' <summary>The point (or two, when one segment jumps clean over the window) where the segment
        ''' (x0,y0) -> (x1,y1) meets the window's edges, in the order the segment travels them, so the cut
        ''' keeps the sheet's own edge sitting ON the window edge.  A segment that neither enters nor leaves
        ''' the window adds nothing.</summary>
        Private Shared Sub Crossing(min As Double, max As Double, x0 As Double, y0 As Double, x1 As Double,
                                     y1 As Double, keptXs As List(Of Double), keptYs As List(Of Double))
            If x1 > x0 Then
                AddCrossing(min, x0, y0, x1, y1, keptXs, keptYs)
                AddCrossing(max, x0, y0, x1, y1, keptXs, keptYs)
            ElseIf x1 < x0 Then
                AddCrossing(max, x0, y0, x1, y1, keptXs, keptYs)
                AddCrossing(min, x0, y0, x1, y1, keptXs, keptYs)
            End If
        End Sub

        ''' <summary>One edge of that cut, interpolated — and nothing at all when the edge is not strictly
        ''' between the two samples (which is how a segment that only touches an edge, or stays outside, is
        ''' ignored).</summary>
        Private Shared Sub AddCrossing(edge As Double, x0 As Double, y0 As Double, x1 As Double, y1 As Double,
                                       keptXs As List(Of Double), keptYs As List(Of Double))
            Dim t = (edge - x0) / (x1 - x0)
            If t <= 0 OrElse t >= 1 Then Return
            keptXs.Add(edge)
            keptYs.Add(y0 + (y1 - y0) * t)
        End Sub

        ''' <summary>One slice's own profile line, as one figure (broken where a sample is missing).</summary>
        Private Shared Sub AddProfile(g As StreamGeometryContext, world As SurfaceWorld, slice As SurfaceSlice,
                                      kept As List(Of Integer))
            Dim started = False
            For i = 0 To kept.Count - 1
                Dim point As Point = Nothing
                If Not TryPoint(world, slice, kept(i), point) Then
                    If started Then g.EndFigure(False)
                    started = False
                    Continue For
                End If
                If Not started Then
                    g.BeginFigure(point, False)
                    started = True
                Else
                    g.LineTo(point)
                End If
            Next
            If started Then g.EndFigure(False)
        End Sub

        ''' <summary>One rung: the same sample on two neighbouring slices, joined — the sheet's own rib.</summary>
        Private Shared Sub AddRung(g As StreamGeometryContext, world As SurfaceWorld, a As SurfaceSlice,
                                   b As SurfaceSlice, sample As Integer)
            Dim from As Point = Nothing
            Dim [to] As Point = Nothing
            If Not TryPoint(world, a, sample, from) Then Return
            If Not TryPoint(world, b, sample, [to]) Then Return
            g.BeginFigure(from, False)
            g.LineTo([to])
            g.EndFigure(False)
        End Sub

        ''' <summary>One sample of one slice, in the picture.</summary>
        Private Shared Function TryPoint(world As SurfaceWorld, slice As SurfaceSlice, sample As Integer,
                                         ByRef point As Point) As Boolean
            If sample < 0 OrElse sample >= slice.Xs.Length OrElse sample >= slice.Ys.Length Then
                point = Nothing
                Return False
            End If
            point = world.At(slice.Xs(sample), slice.Ys(sample), slice.Depth)
            Return True
        End Function

        ''' <summary>
        ''' One END of the base block: a slice's profile with the floor directly under it, closed into a face —
        ''' the sheet's cross-section, which is what a block shows at the near or the far end of the sheet.
        ''' </summary>
        Private Shared Function BaseEndGeometry(world As SurfaceWorld, slice As SurfaceSlice,
                                                kept As List(Of Integer)) As StreamGeometry
            Dim geometry As New StreamGeometry()
            Using g = geometry.Open()
                ' One SIMPLE QUAD per pair of samples, not a ribbon: the profile folds in the projection wherever
                ' the sheet drops steeply, and a folded ribbon's own outline crosses itself, which the winding
                ' rules cancel into a hole straight through the block. A four-point quad has no loop to cancel.
                Dim have As Boolean = False
                Dim wasTop As Point = Nothing
                Dim wasBottom As Point = Nothing
                For Each index In kept
                    Dim here As Point = Nothing
                    If Not TryPoint(world, slice, index, here) Then
                        have = False
                        Continue For
                    End If
                    Dim foot = world.Base(slice.Xs(index), slice.Depth)
                    If have Then
                        g.BeginFigure(wasTop, True)
                        g.LineTo(here)
                        g.LineTo(foot)
                        g.LineTo(wasBottom)
                        g.EndFigure(True)
                    End If
                    wasTop = here
                    wasBottom = foot
                    have = True
                Next
            End Using
            Return geometry
        End Function

        ''' <summary>
        ''' One SIDE of the base block for one band: the quad between two neighbouring slices at one sample, from
        ''' their profiles down to their feet. Every band draws its own, so the sides come out in the same
        ''' back-to-front order as the sheet itself.
        ''' </summary>
        Private Shared Function BaseSideGeometry(world As SurfaceWorld, far As SurfaceSlice, near As SurfaceSlice,
                                                 sample As Integer) As StreamGeometry
            Dim geometry As New StreamGeometry()
            Dim farTop As Point = Nothing
            Dim nearTop As Point = Nothing
            If Not TryPoint(world, far, sample, farTop) Then Return geometry
            If Not TryPoint(world, near, sample, nearTop) Then Return geometry
            Using g = geometry.Open()
                g.BeginFigure(farTop, True)
                g.LineTo(nearTop)
                g.LineTo(world.Base(near.Xs(sample), near.Depth))
                g.LineTo(world.Base(far.Xs(sample), far.Depth))
                g.EndFigure(True)
            End Using
            Return geometry
        End Function

        ''' <summary>
        ''' The floor the sheet stands on, with its gridlines and its three axes: the samples across the width,
        ''' the slice positions back along the length, the height up the left.
        ''' </summary>
        Private Sub DrawFloor(context As DrawingContext, world As SurfaceWorld)
            Dim xMin = world.Xs.Min
            Dim xMax = world.Xs.Max
            Dim axisPen = MakePen(AxisColor, 1, ChartLineStyle.Solid)

            If ShowGrid Then
                Dim gridPen = MakePen(GridColor, GridThickness, GridStyle)
                For Each tick In world.Xs.Ticks()
                    context.DrawLine(gridPen, world.Base(tick, 0), world.Base(tick, world.Depth))
                Next
                For Each tick In world.Zs.Ticks()
                    Dim depth = world.UnitZOf(tick)
                    If depth < 0 OrElse depth > world.Depth Then Continue For
                    context.DrawLine(gridPen, world.Base(xMin, depth), world.Base(xMax, depth))
                Next
            End If

            context.DrawLine(axisPen, world.Base(xMax, 0), world.Base(xMax, world.Depth))
            context.DrawLine(axisPen, world.Base(xMax, world.Depth), world.Base(xMin, world.Depth))
            If Not ShowAxes Then Return

            ' The three axes: X along the front floor edge, Y up the left, Z back along the depth.
            Dim front = world.Base(xMin, 0)
            Dim xEnd = world.Base(xMax, 0)
            Dim yEnd = world.View.Project(world.UnitX(xMin), 1, 0)
            Dim zEnd = world.Base(xMin, world.Depth)
            context.DrawLine(axisPen, front, xEnd)
            context.DrawLine(axisPen, front, yEnd)
            context.DrawLine(axisPen, front, zEnd)

            Dim down = world.View.Direction(0, -1, 0)
            Dim left = world.View.Direction(-1, 0, 0)
            Dim tickLength = Math.Max(0, MajorTickLength)
            Dim font = TickLabelFontSize

            For Each value In world.Xs.Ticks()
                Dim at = world.Base(value, 0)
                If ShowMajorTicks Then
                    context.DrawLine(axisPen, at, New Point(at.X + down.X * tickLength, at.Y + down.Y * tickLength))
                End If
                If Not ShowTickLabels Then Continue For
                Dim text = MakeText(FormatNumber(value, world.Xs.TickStep), font, AxisColor)
                context.DrawText(text, New Point(at.X - text.Width / 2 + down.X * (tickLength + 2),
                                                 at.Y + down.Y * (tickLength + 2)))
            Next

            For Each value In world.Ys.Ticks()
                Dim at = world.View.Project(world.UnitX(xMin), world.UnitY(value), 0)
                If ShowMajorTicks Then
                    context.DrawLine(axisPen, at, New Point(at.X + left.X * tickLength, at.Y + left.Y * tickLength))
                End If
                If Not ShowTickLabels Then Continue For
                Dim text = MakeText(FormatNumber(value, world.Ys.TickStep), font, AxisColor)
                context.DrawText(text, New Point(at.X + left.X * (tickLength + 2) - text.Width,
                                                 at.Y - text.Height / 2))
            Next

            ' The depth ticks are the Z VALUES the sheet is drawn at — a length along the sheet, not a slice
            ' count — so they are thinned out the way the other axes are.
            For Each value In world.Zs.Ticks()
                Dim depth = world.UnitZOf(value)
                If depth < 0 OrElse depth > world.Depth Then Continue For
                Dim at = world.Base(xMin, depth)
                If ShowMajorTicks Then
                    context.DrawLine(axisPen, at, New Point(at.X + left.X * tickLength, at.Y + left.Y * tickLength))
                End If
                If Not ShowTickLabels Then Continue For
                Dim text = MakeText(FormatNumber(value, world.Zs.TickStep), font, AxisColor)
                context.DrawText(text, New Point(at.X + left.X * (tickLength + 2) - text.Width,
                                                 at.Y - text.Height / 2))
            Next

            If Not ShowAxisTitles Then Return
            DrawAxisTitle(context, XAxisTitle, xEnd, down, tickLength + 4, font)
            DrawAxisTitle(context, YAxisTitle, yEnd, New Point(0, -1), tickLength + 4, font)
            DrawAxisTitle(context, ZAxisTitle, zEnd, left, tickLength + 4, font)
        End Sub

        ''' <summary>One axis name, offset from the end of its axis along the side vector so it reads beside the
        ''' axis rather than on top of it.</summary>
        Private Sub DrawAxisTitle(context As DrawingContext, title As String, [end] As Point, side As Point,
                                  gap As Double, font As Double)
            If String.IsNullOrWhiteSpace(title) Then Return
            Dim text = MakeText(title, font, AxisColor)
            context.DrawText(text, New Point([end].X + side.X * gap - text.Width / 2,
                                             [end].Y + side.Y * gap - text.Height))
        End Sub

        ''' <summary>
        ''' The view for one render: the angles clamped to what can be drawn, then FITTED — the cube's own
        ''' corners decide the scale, so the picture can never leave the frame by accident, whatever the angles
        ''' are. Because the fit uses the CORNERS of the axis cube and not the data, narrowing the range window
        ''' simply zooms: the window becomes the cube.
        ''' </summary>
        Private Function MakeView(plot As Rect) As SurfaceView
            Dim elevationRad = Math.Clamp(Elevation, 0, 89) * Math.PI / 180.0
            Dim azimuthRad = Azimuth * Math.PI / 180.0
            Dim view As New SurfaceView With {
                .CosElevation = Math.Cos(elevationRad),
                .SinElevation = Math.Sin(elevationRad),
                .CosAzimuth = Math.Cos(azimuthRad),
                .SinAzimuth = Math.Sin(azimuthRad),
                .Scale = 1
            }
            Dim minX = Double.MaxValue
            Dim maxX = Double.MinValue
            Dim minY = Double.MaxValue
            Dim maxY = Double.MinValue
            For Each x In {0.0, 1.0}
                For Each y In {0.0, 1.0}
                    For Each z In {0.0, Math.Clamp(ZSpacing, 0.1, 4)}
                        Dim corner = view.Project(x, y, z)
                        minX = Math.Min(minX, corner.X)
                        maxX = Math.Max(maxX, corner.X)
                        minY = Math.Min(minY, corner.Y)
                        maxY = Math.Max(maxY, corner.Y)
                    Next
                Next
            Next
            Dim wide = Math.Max(0.000001, maxX - minX)
            Dim tall = Math.Max(0.000001, maxY - minY)
            view.Scale = Math.Min(plot.Width / wide, plot.Height / tall) * Math.Clamp(Zoom, 0.2, 5)
            view.Origin = New Point(
                plot.X + (plot.Width - wide * view.Scale) / 2 - minX * view.Scale,
                plot.Y + (plot.Height - tall * view.Scale) / 2 - minY * view.Scale)
            Return view
        End Function

        ''' <summary>
        ''' Dragging turns the sheet: sideways turns the azimuth, up and down change the elevation it is seen
        ''' from. A press inside the LEGEND BAR is different — that bar is the surface's range selector, so the
        ''' press takes hold of a slider and moves the end of the window the pointer is nearest to. Neither drag
        ''' touches the saved form: the angles and the window a form opens with are its own Elevation, Azimuth,
        ''' MinX/MaxX and MinY/MaxY properties.
        ''' </summary>
        Protected Overrides Sub OnPointerPressed(e As PointerPressedEventArgs)
            MyBase.OnPointerPressed(e)
            If Not e.GetCurrentPoint(Me).Properties.IsLeftButtonPressed Then Return
            Dim position = e.GetPosition(Me)
            Dim axis = RangeHitAxis(position)
            If axis >= 0 Then
                _rangeDragAxis = axis
                ' The end nearer the pointer is the one that follows it; a click in the middle takes the
                ' nearer of the two.
                Dim low = RangeLow(axis)
                Dim high = RangeHigh(axis)
                Dim value = RangeValue(axis, position)
                _rangeDragHigh = value >= low + (high - low) / 2
                DragRangeTo(position)
                Focus()
                e.Pointer.Capture(Me)
                e.Handled = True
                Return
            End If
            _rotateDrag = True
            _rotateFrom = position
            _rotateElevation = Elevation
            _rotateAzimuth = Azimuth
            Focus()
            e.Pointer.Capture(Me)
            e.Handled = True
        End Sub

        Protected Overrides Sub OnPointerMoved(e As PointerEventArgs)
            MyBase.OnPointerMoved(e)
            If _rangeDragAxis >= 0 Then
                DragRangeTo(e.GetPosition(Me))
                Return
            End If
            If Not _rotateDrag Then Return
            Dim position = e.GetPosition(Me)
            Elevation = Math.Clamp(_rotateElevation + (position.Y - _rotateFrom.Y) * 0.5, 2, 89)
            Azimuth = _rotateAzimuth + (position.X - _rotateFrom.X) * 0.5
            InvalidateVisual()
        End Sub

        Protected Overrides Sub OnPointerReleased(e As PointerReleasedEventArgs)
            MyBase.OnPointerReleased(e)
            If _rangeDragAxis >= 0 Then
                _rangeDragAxis = -1
                e.Pointer.Capture(Nothing)
                e.Handled = True
                Return
            End If
            If Not _rotateDrag Then Return
            _rotateDrag = False
            e.Pointer.Capture(Nothing)
            e.Handled = True
        End Sub

        ''' <summary>One slice of one render: its samples, its colour, its Z value and the depth that Z puts it
        ''' at.</summary>
        Private NotInheritable Class SurfaceSlice
            Friend Xs As Double() = Array.Empty(Of Double)()
            Friend Ys As Double() = Array.Empty(Of Double)()
            Friend Color As Color
            Friend Z As Double
            Friend Depth As Double
        End Class

        ''' <summary>A slice's two sample arrays after the width window cut them — still index-aligned, and one
        ''' sample longer at most than the data that was inside the window.  (VB will not take an array-typed
        ''' tuple element, which is why this is a class rather than the C# twin's named tuple.)</summary>
        Private NotInheritable Class CutSamples
            Friend Xs As Double() = Array.Empty(Of Double)()
            Friend Ys As Double() = Array.Empty(Of Double)()
        End Class

        ''' <summary>To the screen: turn the cube by the azimuth, tip it by the elevation, drop the depth.</summary>
        Private NotInheritable Class SurfaceView
            Friend CosAzimuth As Double
            Friend SinAzimuth As Double
            Friend CosElevation As Double
            Friend SinElevation As Double
            Friend Scale As Double
            Friend Origin As Point

            Friend Function Project(x As Double, y As Double, z As Double) As Point
                Dim turned = x * CosAzimuth + z * SinAzimuth
                Dim depthTerm = -x * SinAzimuth + z * CosAzimuth
                Dim up = y * CosElevation + depthTerm * SinElevation
                Return New Point(Origin.X + turned * Scale, Origin.Y - up * Scale)
            End Function

            ''' <summary>How near the eye a point is: the larger, the nearer. This is what puts the bands in
            ''' paint order (farthest first), so a nearer fold hides the sheet behind it.</summary>
            Friend Function Depth(x As Double, y As Double, z As Double) As Double
                Dim depthTerm = -x * SinAzimuth + z * CosAzimuth
                Return y * SinElevation - depthTerm * CosElevation
            End Function

            ''' <summary>The screen direction of a step along one of the world axes, as a unit vector.</summary>
            Friend Function Direction(dx As Double, dy As Double, dz As Double) As Point
                Dim turned = dx * CosAzimuth + dz * SinAzimuth
                Dim depth = -dx * SinAzimuth + dz * CosAzimuth
                Dim up = dy * CosElevation + depth * SinElevation
                Dim length = Math.Sqrt(turned * turned + up * up)
                If length <= 0 Then Return New Point(0, -1)
                Return New Point(turned / length, -up / length)
            End Function
        End Class

        ''' <summary>The sheet's own coordinates: the axis scales (which the range window supplies) and the
        ''' projection.</summary>
        Private NotInheritable Class SurfaceWorld
            Friend View As SurfaceView
            Friend Xs As AxisRange = New AxisRange()
            Friend Ys As AxisRange = New AxisRange()
            Friend Zs As AxisRange = New AxisRange()
            Friend Depth As Double = 1.0

            ''' <summary>How much bigger the X axis is drawn than its fitted size (1 = as fitted).</summary>
            Friend ZoomXFactor As Double = 1.0

            ''' <summary>And the Y (height) axis.</summary>
            Friend ZoomYFactor As Double = 1.0

            ''' <summary>The width positions, across the sheet from 0 to 1.  The clamp is only a safety net for the
            ''' boundary sample and for a hand-set axis range: the samples themselves are CUT to the window
            ''' before they get here (CutToWindow), because clamping them is what used to pile every off-window
            ''' sample onto the edge and draw a false panel along it.</summary>
            Friend Function UnitX(x As Double) As Double
                Return About(Clamp01((x - Xs.Min) / Math.Max(0.000000001, Xs.Max - Xs.Min)), ZoomXFactor)
            End Function

            ''' <summary>The heights, up the sheet from 0 to 1, stretched by ZoomYFactor.</summary>
            Friend Function UnitY(y As Double) As Double
                Return About(Clamp01((y - Ys.Min) / Math.Max(0.000000001, Ys.Max - Ys.Min)), ZoomYFactor)
            End Function

            ''' <summary>One axis's unit position, magnified about the MIDDLE of the fitted box — so a zoom
            ''' grows the sheet evenly in every direction and the picture stays centred on what it was
            ''' looking at.</summary>
            Private Shared Function About(unit As Double, factor As Double) As Double
                Return 0.5 + (unit - 0.5) * factor
            End Function

            ''' <summary>How far back a slice stands, from its Z VALUE — so slices the spreadsheet places
            ''' unevenly apart stand unevenly far apart.</summary>
            Friend Function UnitZOf(z As Double) As Double
                Return Depth * Clamp01((z - Zs.Min) / Math.Max(0.000000001, Zs.Max - Zs.Min))
            End Function

            ''' <summary>A point of the picture.</summary>
            Friend Function At(x As Double, y As Double, depth As Double) As Point
                Return View.Project(UnitX(x), UnitY(y), depth)
            End Function

            ''' <summary>A point on the floor, where the profiles end and the gridlines run.</summary>
            Friend Function Base(x As Double, depth As Double) As Point
                Return View.Project(UnitX(x), UnitY(0), depth)
            End Function

            Private Shared Function Clamp01(value As Double) As Double
                If value < 0 Then Return 0
                If value > 1 Then Return 1
                Return value
            End Function
        End Class
    End Class

    ''' <summary>
    ''' Remembers the folder the chart's own file picker used last, so the next one opens there instead of
    ''' wherever the platform happens to start. It lives in the per-user app-data folder
    ''' (~/.local/share/&lt;App&gt; on Linux, %LOCALAPPDATA%\&lt;App&gt; on Windows) — the same place the
    ''' generated DataSet helpers keep their data — which is what makes it survive a restart. Every step is
    ''' best-effort: an unwritable location simply means the dialog starts at the platform's default again.
    ''' </summary>
    Friend NotInheritable Class ChartPickerMemory
        Private Shared _folder As String = Nothing
        Private Shared _loaded As Boolean = False

        Private Sub New()
        End Sub

        Private Shared ReadOnly Property StorePath As String
            Get
                Dim entry = System.Reflection.Assembly.GetEntryAssembly()
                Dim name As String = If(entry Is Nothing, Nothing, entry.GetName().Name)
                If String.IsNullOrEmpty(name) Then name = System.Reflection.Assembly.GetExecutingAssembly().GetName().Name
                If String.IsNullOrEmpty(name) Then name = "app"
                Dim root = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
                If String.IsNullOrEmpty(root) Then root = System.IO.Path.GetTempPath()
                Dim dir = System.IO.Path.Combine(root, name)
                Try
                    System.IO.Directory.CreateDirectory(dir)
                Catch
                    ' The failing write is what reports it.
                End Try
                Return System.IO.Path.Combine(dir, "GrumpyCharts.lastfolder")
            End Get
        End Property

        ''' <summary>The folder the last pick used (Nothing = let the platform choose), or Nothing once it is gone.</summary>
        Friend Shared Property LastFolder As String
            Get
                If Not _loaded Then
                    _loaded = True
                    Try
                        If System.IO.File.Exists(StorePath) Then _folder = System.IO.File.ReadAllText(StorePath).Trim()
                    Catch
                        _folder = Nothing
                    End Try
                End If
                ' A folder on a drive that is no longer mounted is worse than no answer: the platform would
                ' open the dialog inside a path that does not exist.
                If String.IsNullOrEmpty(_folder) OrElse Not System.IO.Directory.Exists(_folder) Then Return Nothing
                Return _folder
            End Get
            Set(value As String)
                _loaded = True
                _folder = value
                Try
                    If String.IsNullOrEmpty(value) Then
                        If System.IO.File.Exists(StorePath) Then System.IO.File.Delete(StorePath)
                    Else
                        System.IO.File.WriteAllText(StorePath, value)
                    End If
                Catch
                    ' Best effort.
                End Try
            End Set
        End Property
    End Class

End Namespace
