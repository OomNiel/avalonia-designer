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

        ''' <summary>Colour of the axis line, its ticks, its labels and its name.</summary>
        Public Property AxisColor As Color = Color.Parse("#666666")

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
                                    xFromIndex As Boolean) As ChartData
            Dim data As New ChartData()
            Try
                Using zip = OpenWorkbook(path)
                    ' 'shared' is a VB keyword, hence sharedStrings.
                    Dim sharedStrings = ReadSharedStrings(zip)
                    Dim sheet = FindSheet(zip)
                    If sheet Is Nothing Then
                        data.Error = """" & System.IO.Path.GetFileName(path) & """ has no worksheet."
                        Return data
                    End If

                    Dim xi = ColumnIndex(xColumn)
                    Dim yi = ColumnIndex(yColumn)
                    Dim xs As New List(Of Double)()
                    Dim ys As New List(Of Double)()
                    Dim xsFallback As New List(Of Double)()
                    Dim ysFallback As New List(Of Double)()
                    Dim xTitle = String.Empty
                    Dim yTitle = String.Empty

                    Using stream = sheet.Open()
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
                                If hasY Then
                                    xs.Add(ys.Count)
                                    ys.Add(yVal)
                                ElseIf hasX Then
                                    xsFallback.Add(ysFallback.Count)
                                    ysFallback.Add(xVal)
                                End If
                            ElseIf hasX AndAlso hasY Then
                                xs.Add(xVal)
                                ys.Add(yVal)
                            End If
                        Next
                    End Using

                    If xFromIndex AndAlso ys.Count = 0 AndAlso ysFallback.Count > 0 Then
                        xs = xsFallback
                        ys = ysFallback
                    End If

                    data.Xs = xs.ToArray()
                    data.Ys = ys.ToArray()
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

        ''' <summary>The workbook's first worksheet part, or Nothing when the zip has none.</summary>
        Private Shared Function FindSheet(zip As ZipArchive) As ZipArchiveEntry
            Return zip.Entries _
                .Where(Function(e) e.FullName.StartsWith("xl/worksheets/sheet", StringComparison.OrdinalIgnoreCase) _
                                 AndAlso e.FullName.EndsWith(".xml", StringComparison.OrdinalIgnoreCase)) _
                .OrderBy(Function(e) e.FullName, StringComparer.OrdinalIgnoreCase) _
                .FirstOrDefault()
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

        ' Fully qualified: the type is named exactly like the property.
        Public Shared ReadOnly CornerRadiusProperty As StyledProperty(Of Avalonia.CornerRadius) =
            AvaloniaProperty.Register(Of ChartBase, Avalonia.CornerRadius)(NameOf(CornerRadius), New Avalonia.CornerRadius(4))

        ' ---- plot area ------------------------------------------------------------------------
        Public Shared ReadOnly PlotBackColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of ChartBase, Color)(NameOf(PlotBackColor), Colors.White)

        Public Shared ReadOnly PlotBackOpacityProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(PlotBackOpacity), 100.0)

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
                LegendPositionProperty, LegendBackColorProperty, LegendShowFrameProperty,
                LegendBorderBrushProperty, LegendBorderThicknessProperty, LegendCornerRadiusProperty,
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
            If YAxis IsNot Nothing Then Return YAxis
            Return New Axis With {
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
            }
        End Function

        ''' <summary>The common X axis to draw: see CommonYAxis.</summary>
        Private Function CommonXAxis() As Axis
            If XAxis IsNot Nothing Then Return XAxis
            Return New Axis With {
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
            }
        End Function

        Private ReadOnly _cache As New Dictionary(Of String, ChartData)()
        Private _cacheFile As String = Nothing
        Private _lastPlotCount As Integer = 0

        ''' <summary>The data for one series (cached per column pair and workbook).</summary>
        Private Function DataFor(xColumn As String, yColumn As String, xFromIndex As Boolean) As ChartData
            Dim file = SourceFile
            If String.IsNullOrWhiteSpace(file) Then Return InlineData()

            Dim key = xColumn & "|" & yColumn & "|" & xFromIndex.ToString()
            If _cacheFile <> file Then
                _cache.Clear()
                _cacheFile = file
            End If
            Dim cached As ChartData = Nothing
            If _cache.TryGetValue(key, cached) Then Return cached

            Dim loaded = SpreadsheetReader.Read(file, xColumn, yColumn, HeaderRow, FirstDataRow, xFromIndex)
            _cache(key) = loaded
            Return loaded
        End Function

        ''' <summary>Every series to draw, with its data, styling, scale and axes resolved.</summary>
        Private Function BuildPlots() As List(Of Plot)
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
                onePlot.YRange = AxisRange.Over(only.Ys, MinY, MaxY, 5, 5)
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
            Dim allYs = commonPlots.SelectMany(Function(p) p.Data.Ys).ToArray()
            Dim subdivisions = If(Series.Any(Function(s) s.XFromIndex), 1, 5)
            Dim sharedX = AxisRange.Over(allXs, MinX, MaxX, 6, subdivisions)
            Dim sharedY = AxisRange.Over(allYs, MinY, MaxY, 5, 5)
            For Each one In commonPlots
                one.XRange = sharedX
                one.YRange = sharedY
            Next
            Return plots
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
                Dim files = Await storage.OpenFilePickerAsync(options)
                Dim picked As String = Nothing
                If files IsNot Nothing AndAlso files.Count > 0 Then picked = files(0).TryGetLocalPath()
                If Not String.IsNullOrWhiteSpace(picked) Then
                    SourceFile = picked
                    InvalidateCache()
                End If
            Catch
                ' No picker available (headless preview, no portal, …): leave the path untouched.
            End Try
        End Function

        ''' <summary>True when the "…" file picker is drawn: asked for, or the chart has no data.</summary>
        Private ReadOnly Property BrowseVisible As Boolean
            Get
                Return ShowBrowse OrElse _lastPlotCount = 0
            End Get
        End Property

        ''' <summary>Clicking the drawn "…" button loads a file.</summary>
        ''' <summary>Clicking the drawn "…" button loads a file; a cursor line is grabbed and dragged; a
        ''' click on the legend switches a trace; a right-click opens the cursor menu.</summary>
        Protected Overrides Sub OnPointerPressed(e As PointerPressedEventArgs)
            MyBase.OnPointerPressed(e)
            Dim position = e.GetPosition(Me)

            If e.GetCurrentPoint(Me).Properties.IsRightButtonPressed Then
                ShowCursorMenu()
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
                If Not entry.Hit.Contains(position) Then Continue For
                entry.Series.Visible = Not entry.Series.Visible
                InvalidateVisual()
                e.Handled = True
                Return
            Next
            If BrowseVisible AndAlso _browseRect.Contains(position) Then
#Disable Warning BC42358 ' deliberately fire-and-forget: a pointer event cannot await the dialog
                BrowseForFile()
#Enable Warning BC42358
                e.Handled = True
            End If
        End Sub

        ''' <summary>Drags the grabbed cursor, and keeps a mouse-following readout with the pointer.</summary>
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
            ' Only a chart that is reporting at the pointer needs redrawing while the mouse moves.
            If moved AndAlso ReadoutPosition = CursorReadout.FollowMouse AndAlso LiveCursorIndexes().Count > 0 Then
                InvalidateVisual()
            End If
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
        ''' The cursor keys. With a cursor switched on, the left/right arrows move the selected cursor
        ''' one sample along X and up/down choose which trace the readout reports. Without a cursor the
        ''' keys are left alone, so the chart does not swallow the arrow keys of the window around it.
        ''' </summary>
        Protected Overrides Sub OnKeyDown(e As KeyEventArgs)
            MyBase.OnKeyDown(e)
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

        Private _browseRect As Rect
        ''' <summary>The plot rectangle of the last render, so a dragged cursor can be converted back
        ''' into data units with the same mapping the renderer used.</summary>
        Private _plotRect As Rect
        ''' <summary>The series of the last render (the input handlers read the same data the picture
        ''' shows, without re-reading the workbook).</summary>
        Private _plots As New List(Of Plot)()
        Private ReadOnly _legend As New List(Of LegendEntry)()
        Private _legendRect As Rect

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

        ''' <summary>The name a series shows in the legend: its own Title, else the spreadsheet's
        ''' Y-column header, else "Series n".</summary>
        Private Function LegendName(one As Plot, index As Integer) As String
            If one.Definition IsNot Nothing AndAlso Not String.IsNullOrWhiteSpace(one.Definition.Title) Then
                Return one.Definition.Title
            End If
            If Not String.IsNullOrWhiteSpace(one.Data.YTitle) Then Return one.Data.YTitle
            Return $"Series {index + 1}"
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
            If Not ShowLegend OrElse _series.Count = 0 Then Return New Size(0, 0)

            Const pad As Double = 4, boxSize As Double = 13, boxGap As Double = 6, itemGap As Double = 16, lineGap As Double = 4
            Dim font = Math.Max(6, LegendFontSize)
            Dim vertical = LegendPosition = LegendPosition.Left OrElse LegendPosition = LegendPosition.Right
            Dim available = If(vertical, frameSize.Height, frameSize.Width)
            ' Wrap once the entries fill 60% of the frame's own axis; whatever does not fit is clipped
            ' by the bar (the plot is never squeezed out of existence).
            Dim limit = Math.Max(24, available * 0.6 - pad * 2)

            Dim items As New List(Of LegendCell)()
            For i = 0 To plots.Count - 1
                Dim one = plots(i)
                If one.Definition Is Nothing Then Continue For
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
            If _legend.Count = 0 Then Return
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
                Dim framePen = MakePen(Color.Parse("#9AA0A6"), 1, ChartLineStyle.Solid)
                For Each entry In _legend
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

            ' The chart's OWN plate comes first, filling the whole interior - not just the plot area,
            ' so the title and the axis labels sit on the chart's colour, not on the form's.
            Dim opacity = Math.Clamp(PlotBackOpacity, 0, 100) / 100.0
            Dim plate As New SolidColorBrush(PlotBackColor, opacity)
            context.DrawRectangle(plate, Nothing, New RoundedRect(frame, radius))

            Dim plots = BuildPlots()
            _plots = plots
            _lastPlotCount = plots.Where(Function(p) p.Data.HasData).Count()
            Dim withError = plots.FirstOrDefault(Function(p) p.Data.Error IsNot Nothing)
            Dim seriesError = If(withError IsNot Nothing, withError.Data.Error, Nothing)

            Dim wantTitle = ShowTitle AndAlso Not String.IsNullOrWhiteSpace(Title)
            Dim titleText As FormattedText = Nothing
            If wantTitle Then titleText = MakeText(Title, TitleFontSize, TitleColor)

            ' Work out the plot rectangle: the frame, minus the breathing room, minus the title and
            ' the axis furniture around it.
            Dim plotRect = frame.Deflate(8)
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
            Dim legendSize = MeasureLegend(frame.Size, plots)
            If legendSize.Width > 0 AndAlso legendSize.Height > 0 Then
                Select Case LegendPosition
                    Case LegendPosition.Top
                        _legendRect = New Rect(frame.X, frame.Y, frame.Width, legendSize.Height)
                        plotRect = Chop(plotRect, 0, legendSize.Height + 4, 0, 0)
                    Case LegendPosition.Left
                        _legendRect = New Rect(frame.X, frame.Y, legendSize.Width, frame.Height)
                        plotRect = Chop(plotRect, legendSize.Width + 4, 0, 0, 0)
                    Case LegendPosition.Right
                        _legendRect = New Rect(frame.Right - legendSize.Width, frame.Y, legendSize.Width, frame.Height)
                        plotRect = Chop(plotRect, 0, 0, legendSize.Width + 4, 0)
                    Case Else
                        _legendRect = New Rect(frame.X, frame.Bottom - legendSize.Height, frame.Width, legendSize.Height)
                        plotRect = Chop(plotRect, 0, 0, 0, legendSize.Height + 4)
                End Select
            End If

            Dim commonPlot = plots.FirstOrDefault(Function(p) Not p.PerSeries)
            If commonPlot Is Nothing Then commonPlot = plots.FirstOrDefault()
            If commonPlot Is Nothing Then
                DrawFrame(context, frame, radius, frameWidth)
                DrawTitle(context, titleText, plotRect, frame)
                DrawLegend(context)
                DrawMessage(context, plotRect, Nothing)
                DrawBrowseButton(context, frame)
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
            context.DrawRectangle(plate, Nothing, plotRect)

            If _lastPlotCount = 0 Then
                DrawFrame(context, frame, radius, frameWidth)
                DrawTitle(context, titleText, plotRect, frame)
                DrawLegend(context)
                DrawMessage(context, plotRect, seriesError)
                DrawBrowseButton(context, frame)
                Return
            End If

            ' Gridlines, then the common axis with its ticks and labels.
            If ShowGrid Then
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
                      TickLabels(commonX, commonPlot.XRange), AxisName(commonX, XAxisTitle, commonPlot.Data.XTitle))

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
                          TickLabels(one.XAxis, one.XRange), AxisName(one.XAxis, Nothing, one.Data.XTitle))
                topUsed += XBlockHeight(one.XAxis, one.XRange, Nothing, one.Data.XTitle)
            Next
            For Each one In bottomBlocks
                DrawXAxis(context, plotRect, one.XRange, one.XAxis, False, bottomUsed,
                          TickLabels(one.XAxis, one.XRange), AxisName(one.XAxis, Nothing, one.Data.XTitle))
                bottomUsed += XBlockHeight(one.XAxis, one.XRange, Nothing, one.Data.XTitle)
            Next

            ' The data itself, in order, clipped to the plot area.
            Using context.PushClip(plotRect)
                For Each one In plots
                    If Not one.Data.HasData OrElse Not one.Visible Then Continue For
                    Dim dataPoints = one.Data.Xs.Select(
                        Function(v, i)
                            Return New Point(one.XRange.ToPixel(v, plotRect.X, plotRect.Width),
                                             one.YRange.ToPixel(one.Data.Ys(i), plotRect.Bottom, -plotRect.Height))
                        End Function).ToArray()

                    If one.Connected AndAlso dataPoints.Length > 1 Then
                        Dim pen = MakePen(one.LineColor, one.LineThickness, one.LineStyle)
                        For i = 1 To dataPoints.Length - 1
                            context.DrawLine(pen, dataPoints(i - 1), dataPoints(i))
                        Next
                    End If
                    DrawMarkers(context, dataPoints, one)
                Next
            End Using

            ' The cursors sit on top of the data, and their readout on top of that, so a cursor is never
            ' buried by a line that happens to cross it.
            DrawCursors(context, plotRect, plots)

            ' Frame + title last, so nothing can overdraw them.
            DrawFrame(context, frame, radius, frameWidth)
            DrawTitle(context, titleText, plotRect, frame)
            DrawLegend(context)
            DrawBrowseButton(context, frame)
        End Sub

        ''' <summary>The tick label texts of an axis (empty when it draws no labels).</summary>
        Private Shared Function TickLabels(axis As Axis, range As AxisRange) As List(Of String)
            Dim labels As New List(Of String)()
            If Not axis.ShowTickLabels Then Return labels
            For Each tick In range.Ticks()
                labels.Add(FormatNumber(tick, range.TickStep))
            Next
            Return labels
        End Function

        ''' <summary>An axis' name text: its own Name, else the chart-level title, else the spreadsheet's
        ''' column header. Nothing when this axis draws no name.</summary>
        Private Function AxisName(axis As Axis, chartTitle As String, fromSheet As String) As FormattedText
            If Not axis.ShowAxisName Then Return Nothing
            Dim text = If(Not String.IsNullOrWhiteSpace(axis.Name), axis.Name,
                          If(Not String.IsNullOrWhiteSpace(chartTitle), chartTitle, fromSheet))
            If String.IsNullOrWhiteSpace(text) Then Return Nothing
            Return MakeText(text, axis.TickLabelFontSize, axis.AxisColor)
        End Function

        ''' <summary>The gutter width one Y axis occupies: its tick overhang, its labels and its name.</summary>
        Private Function YBlockWidth(axis As Axis, range As AxisRange, chartTitle As String, fromSheet As String) As Double
            If axis Is Nothing Then Return 0
            Dim tickOut As Double = 0
            If axis.ShowAxis AndAlso axis.ShowMajorTicks Then tickOut = Math.Max(0, axis.MajorTickLength)
            Dim widest As Double = 0
            For Each label In TickLabels(axis, range)
                widest = Math.Max(widest, MakeText(label, axis.TickLabelFontSize, axis.AxisColor).Width)
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
            If TickLabels(axis, range).Count > 0 Then labelHeight = MakeText("0", axis.TickLabelFontSize, axis.AxisColor).Height
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
                Dim label = MakeText(text, axis.TickLabelFontSize, axis.AxisColor)
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

            Dim labelHeight = MakeText("0", axis.TickLabelFontSize, axis.AxisColor).Height
            Dim index As Integer = 0
            For Each tick In range.Ticks()
                Dim text = If(index < labels.Count, labels(index), FormatNumber(tick, range.TickStep))
                index += 1
                Dim label = MakeText(text, axis.TickLabelFontSize, axis.AxisColor)
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

        Private Sub DrawMarkers(context As DrawingContext, dataPoints As Point(), one As Plot)
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

        Private Sub DrawTitle(context As DrawingContext, title As FormattedText, plotRect As Rect, frame As Rect)
            If title Is Nothing Then Return
            Select Case TitlePosition
                Case ChartTitlePosition.Top
                    context.DrawText(title, New Point(plotRect.X + (plotRect.Width - title.Width) / 2, frame.Y + 4))
                Case ChartTitlePosition.Bottom
                    context.DrawText(title, New Point(plotRect.X + (plotRect.Width - title.Width) / 2, plotRect.Bottom + 4))
                Case ChartTitlePosition.Left
                    Dim leftY = plotRect.Y + plotRect.Height / 2 + title.Width / 2
                    Using context.PushTransform(Matrix.CreateRotation(-Math.PI / 2) * Matrix.CreateTranslation(frame.X + 4, leftY))
                        context.DrawText(title, New Point(0, 0))
                    End Using
                Case ChartTitlePosition.Right
                    Dim rightY = plotRect.Y + plotRect.Height / 2 + title.Width / 2
                    Using context.PushTransform(Matrix.CreateRotation(-Math.PI / 2) * Matrix.CreateTranslation(frame.Right - 4 - title.Height, rightY))
                        context.DrawText(title, New Point(0, 0))
                    End Using
            End Select
        End Sub

        Private Sub DrawMessage(context As DrawingContext, plotRect As Rect, message As String)
            Dim text = If(String.IsNullOrWhiteSpace(message), "No data — set SourceFile, or add a series", message)
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

        Private Sub DrawBrowseButton(context As DrawingContext, frame As Rect)
            _browseRect = Nothing
            If Not BrowseVisible Then Return
            Dim boxSize As Double = 18
            Dim rect As New Rect(frame.Right - boxSize - 4, frame.Y + 4, boxSize, boxSize)
            _browseRect = rect
            context.DrawRectangle(New SolidColorBrush(Color.Parse("#F0F0F0")),
                                  New Pen(New SolidColorBrush(Color.Parse("#C0C0C0")), 1),
                                  New RoundedRect(rect, New Avalonia.CornerRadius(3)))
            Dim dots = MakeText("…", 12, Color.Parse("#505050"))
            context.DrawText(dots, New Point(rect.X + (boxSize - dots.Width) / 2, rect.Y + (boxSize - dots.Height) / 2))
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

        ''' <summary>Draws the cursors and their readout. A cursor is a crosshair the user drags: its
        ''' lines sit at its X and Y, and the readout reports the selected trace where the cursor's X
        ''' cuts it. The clickable parts are remembered while drawing, so a click always tests the
        ''' picture that is on screen.</summary>
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
                Dim pen = MakeCursorPen(cursor.Color, If(selected, 2.0, 1.0), cursor.Style)

                Dim hit As New CursorHit With {.Cursor = cursor, .Index = index, .X = x, .Y = readoutY}
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
                    context.DrawRectangle(New SolidColorBrush(cursor.Color), Nothing, New Rect(cx - 3, cy - 3, 6, 6))
                    hit.Handle = New Rect(cx - CursorGrab, cy - CursorGrab, CursorGrab * 2, CursorGrab * 2)
                End If
                _cursorHits.Add(hit)
            Next

            DrawCursorReadout(context, plot, plots, common)
        End Sub

        ''' <summary>Draws the readout of the selected cursor: the tag (C1/C2), the name of the trace it
        ''' reports — in that trace's colour — and the values, in the cursor's colour. The columns follow
        ''' the cursor's own X/Y Values switches. It follows the mouse or sits in the top right corner;
        ''' with no mouse (in the designer) it is drawn in that corner too, so it can always be seen.</summary>
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
            Dim deltaColor = cursor.Color
            If _cursorHits.Count >= 2 Then
                Dim first = _cursorHits(0)
                Dim second = _cursorHits(1)
                delta = "ΔX " & FormatCursor(Math.Abs(first.X - second.X)) &
                        "   ΔY " & FormatCursor(Math.Abs(first.Y - second.Y))
                deltaColor = If(first.Index = index, second.Cursor.Color, first.Cursor.Color)
            End If

            Dim parts As New List(Of String)()
            If cursor.XValues Then parts.Add("X " & FormatCursor(x))
            If cursor.YValues Then parts.Add("Y " & If(value.HasValue, FormatCursor(value.Value), "–"))
            Dim name = LegendName(trace, plots.IndexOf(trace))
            Dim tag = "C" & (index + 1)

            Dim head = MakeText(tag & "  " & name, 11, trace.LineColor)
            Dim body = If(parts.Count > 0, MakeText(String.Join("   ", parts), 11, cursor.Color), Nothing)
            Dim deltaText = If(delta Is Nothing, Nothing, MakeText(delta, 11, deltaColor))
            Dim width = Math.Min(Math.Max(Math.Max(head.Width, If(body Is Nothing, 0.0, body.Width)),
                                          If(deltaText Is Nothing, 0.0, deltaText.Width)) + 12,
                                 Math.Max(20, plot.Width - 8))
            Dim height = head.Height + If(body Is Nothing, 0.0, body.Height + 2) +
                         If(deltaText Is Nothing, 0.0, deltaText.Height + 7) + 10

            ' Where it goes: beside the pointer, or in the corner. Either way it is kept inside the plot
            ' and clear of the "…" file picker in the top right corner.
            Dim follow = ReadoutPosition = CursorReadout.FollowMouse AndAlso _hasPointer
            Dim rx = If(follow, _pointer.X + 14, plot.Right - 6 - width)
            Dim ry = If(follow, _pointer.Y + 14, plot.Y + 6)
            rx = Math.Clamp(rx, plot.X + 4, Math.Max(plot.X + 4, plot.Right - 4 - width))
            ry = Math.Clamp(ry, plot.Y + 4, Math.Max(plot.Y + 4, plot.Bottom - 4 - height))
            Dim rect As New Rect(rx, ry, width, height)
            If _browseRect.Width > 0 AndAlso rect.Intersects(_browseRect) Then
                rect = New Rect(rect.X, Math.Min(_browseRect.Bottom + 6, Math.Max(plot.Y + 4, plot.Bottom - 4 - height)),
                                rect.Width, rect.Height)
            End If
            _readoutRect = rect

            context.DrawRectangle(New SolidColorBrush(PlotBackColor, 0.92),
                                  New Pen(New SolidColorBrush(cursor.Color), 1),
                                  New RoundedRect(rect, New Avalonia.CornerRadius(3)))
            context.DrawText(head, New Point(rect.X + 6, rect.Y + 5))
            If body IsNot Nothing Then context.DrawText(body, New Point(rect.X + 6, rect.Y + 5 + head.Height + 2))
            If deltaText IsNot Nothing Then
                ' A hairline over the pair's row, so "this line is about both cursors" is visible at a
                ' glance rather than only in its colour.
                Dim lineY = rect.Y + 5 + head.Height + If(body Is Nothing, 0.0, body.Height + 2) + 3
                context.DrawLine(New Pen(New SolidColorBrush(deltaColor, 0.5), 1),
                    New Point(rect.X + 6, lineY), New Point(rect.Right - 6, lineY))
                context.DrawText(deltaText, New Point(rect.X + 6, lineY + 3))
            End If

            _readoutText = tag & " " & name & If(parts.Count > 0, ": " & String.Join(", ", parts), String.Empty) &
                           If(delta Is Nothing, String.Empty, " | " & delta)
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

        ' ---- cursor input ---------------------------------------------------------------------

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

        ''' <summary>The chart's right-click menu: which cursors are switched on, where the readout sits,
        ''' and add / remove / reset / copy. Nothing here is written back to the form — the saved defaults
        ''' are the ones the Cursor Editor sets, and a restart starts from those again.
        ''' The state is carried in the item's TEXT (a leading tick) rather than in a check box: menu item
        ''' ticks arrived in Avalonia 11.1, and the bundled control still has to build on 11.0.</summary>
        Private Sub ShowCursorMenu()
            Dim items As New List(Of Object)()
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

            Dim menu As New ContextMenu With {.ItemsSource = items, .PlacementTarget = Me}
            menu.Open(Me)
        End Sub

        ''' <summary>Resolves the common axis' names: the explicit properties win, then the sheet's headers.</summary>
        Private Shared Function MakeText(text As String, size As Double, color As Color) As FormattedText
            Return New FormattedText(text, CultureInfo.CurrentCulture, FlowDirection.LeftToRight,
                                     New Typeface(FontFamily.Default), Math.Max(6, size), New SolidColorBrush(color))
        End Function

        ''' <summary>Trims the given amounts off a rectangle's edges (never past zero size).</summary>
        Private Shared Function Chop(rect As Rect, left As Double, top As Double, right As Double, bottom As Double) As Rect
            Return New Rect(rect.X + left, rect.Y + top,
                            Math.Max(0, rect.Width - left - right), Math.Max(0, rect.Height - top - bottom))
        End Function

        Private Shared Function MakePen(color As Color, thickness As Double, style As ChartLineStyle) As IPen
            Dim pen As New Pen(New SolidColorBrush(color), Math.Max(0.5, thickness), DashFor(style))
            ' Round caps make the Dot style read as dots rather than as nothing at all.
            pen.LineCap = If(style = ChartLineStyle.Dot, PenLineCap.Round, PenLineCap.Flat)
            Return pen
        End Function

        Private Shared Function DashFor(style As ChartLineStyle) As IDashStyle
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

        Private Shared Function FormatNumber(value As Double, tickStep As Double) As String
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

End Namespace
