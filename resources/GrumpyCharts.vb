' GrumpyCharts.vb — BUNDLED RESOURCE (the C# twin is resources/GrumpyCharts.cs). Copied into every
' generated project, next to ChromeWindow.vb / PathPicker.vb / GrumpyPanel.vb.
'
' A small, dependency-free CHART CONTROL SET: two controls that draw themselves, with no NuGet
' package, no template and no assets.
'
'   <charts:GrumpyLinePlot x:Name="LinePlot1" Width="320" Height="180"
'                          Values="4,9,6,12,8,15"
'                          Title="Temperature" ShowTitle="True"/>
'
'   <charts:GrumpyXYPlot x:Name="XYPlot1" Width="320" Height="180"
'                        SourceFile="/home/me/measurements.xlsx"
'                        LineStyle="Dotted" MarkerStyle="Cross"/>
'
' DATA
' ----
'   * Inline arrays   — Values="4,9,6,12,8" (line plot, X is the sample index) or
'                       Points="0,0 1,4 2,9" (X,Y plot, x,y pairs), or from code:
'                       plot.Values = New Double() {4, 9, 6} : xy.Points = New Double(,) {{0,0}, {1,4}}
'   * An .xlsx file   — SourceFile points at a spreadsheet: the header row names the axes and the
'                       rows below it are the values. Defaults follow the convention
'                       COLUMN B = X, COLUMN C = Y, ROW 1 = axis names, data from ROW 2
'                       (XColumn / YColumn / HeaderRow / FirstDataRow change that).
'                       The reader is plain System.IO.Compression + XML — no dependency.
'                       For a LINE plot the Y values come from YColumn; if that column is empty it
'                       falls back to XColumn, so a single-column sheet still plots.
'   * LiveUpdate = True re-reads the file when it changes on disk. Code can also push data at any
'     time: AddPoint(x, y) / SetValues(...).
'
' STYLE (all of it optional — the defaults are already presentation-ready)
' -----------------------------------------------------------------------
'   Frame        ShowBorder, BorderBrush, BorderThickness, CornerRadius
'   Plot area    PlotBackColor, PlotBackOpacity (0-100 %)
'   Plot line    LineColor, LineThickness, LineStyle (Solid | Dash | Dot | DashDot)
'   Markers      MarkerStyle (None | Dot | Cross | Square | Diamond), MarkerSize, Connected
'   Gridlines    ShowGrid, GridColor, GridThickness, GridStyle (Solid | Dash | Dot | DashDot)
'   Axes         ShowAxes, AxisColor, ShowMajorTicks, MajorTickLength, ShowMinorTicks,
'                MinorTickLength, ShowTickLabels, TickLabelFontSize, ShowAxisTitles,
'                XAxisTitle, YAxisTitle
'   Title        ShowTitle, Title, TitleColor, TitlePosition (Top | Bottom | Left | Right),
'                TitleFontSize
'   Scaling      Auto-fit; MinX / MaxX / MinY / MaxY override it (leave them empty to auto-fit)
'
' NOTES
' -----
'   * Everything is proportional, so the chart survives any resize.
'   * The axis range auto-fits the data and then SNAPS outward to "nice" tick values (1/2/5 x 10^n),
'     which is what makes the labels read as 0, 5, 10, 15 rather than 0.37, 3.7, 7.03.
'   * A missing or unreadable file draws a short explanation inside the plot area instead of
'     throwing — the form still loads.
'   * ShowBrowse = True draws a small "…" button in the top-right of the plot that opens the
'     platform file dialog. BrowseForFile() does the same from your own button. Both do nothing when
'     there is no TopLevel yet (e.g. a designer preview), so the control is safe to place and render.
Imports System
Imports System.Collections.Generic
Imports System.ComponentModel
Imports System.Globalization
Imports System.IO
Imports System.IO.Compression
Imports System.Linq
Imports System.Threading.Tasks
Imports System.Xml.Linq
Imports Avalonia
Imports Avalonia.Controls
Imports Avalonia.Input
Imports Avalonia.Media
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

    ''' <summary>The point symbol used by the X,Y plot.</summary>
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

    ''' <summary>Reads <c>Values="4,9,6,12"</c> from XAML into a <see cref="Double"/> array.</summary>
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

    ''' <summary>Reads <c>Points="0,0 1,4 2,9"</c> (x,y pairs) from XAML into a 2-D <c>(n,2)</c> array.</summary>
    Public Class DoubleMatrixConverter
        Inherits TypeConverter

        Public Overrides Function CanConvertFrom(context As ITypeDescriptorContext, sourceType As Type) As Boolean
            Return sourceType Is GetType(String) OrElse MyBase.CanConvertFrom(context, sourceType)
        End Function

        Public Overrides Function ConvertFrom(context As ITypeDescriptorContext, culture As CultureInfo, value As Object) As Object
            Dim text = TryCast(value, String)
            If text Is Nothing Then Return MyBase.ConvertFrom(context, culture, value)
            ' Each whitespace-separated group is one "x,y" pair; a semicolon also separates pairs, so
            ' both "0,0 1,4" and "0,0; 1,4" read the same way.
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

    ''' <summary>One series of points, plus the axis names and any reason there is no data.</summary>
    Public Class ChartSeries
        ''' <summary>The X values (for a line plot these are the sample indices 0,1,2…).</summary>
        Public Property Xs As Double() = Array.Empty(Of Double)()
        ''' <summary>The Y values.</summary>
        Public Property Ys As Double() = Array.Empty(Of Double)()
        ''' <summary>The X axis name (the spreadsheet's column-B header).</summary>
        Public Property XTitle As String = String.Empty
        ''' <summary>The Y axis name (the spreadsheet's column-C header).</summary>
        Public Property YTitle As String = String.Empty
        ''' <summary>Why the chart has nothing to draw, or Nothing when it is fine.</summary>
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

        ''' <summary>The column letters in a cell reference such as "BC12" (trailing digits dropped).</summary>
        Private Shared Function ColumnOf(cellRef As String) As String
            Dim [end] As Integer = 0
            While [end] < cellRef.Length AndAlso Char.IsLetter(cellRef([end]))
                [end] += 1
            End While
            Return cellRef.Substring(0, [end])
        End Function

        ''' <summary>The row number in a cell reference ("BC12" gives 12), or 0 when there is none.</summary>
        Private Shared Function RowOf(cellRef As String) As Integer
            Dim start As Integer = 0
            While start < cellRef.Length AndAlso Char.IsLetter(cellRef(start))
                start += 1
            End While
            Dim row As Integer = 0
            If Integer.TryParse(cellRef.Substring(start), NumberStyles.Integer, CultureInfo.InvariantCulture, row) Then
                Return row
            End If
            Return 0
        End Function

        ''' <summary>
        ''' Reads the series. xFromIndex makes a line plot: the X values are the sample indices and
        ''' only the Y column is read (falling back to the X column when the Y column is empty, so a
        ''' one-column sheet still draws).
        ''' </summary>
        Friend Shared Function Read(path As String, xColumn As String, yColumn As String,
                                    headerRow As Integer, firstDataRow As Integer,
                                    xFromIndex As Boolean) As ChartSeries
            Dim series As New ChartSeries()
            Try
                Using zip = ZipFile.OpenRead(path)
                    ' 'shared' is a VB keyword, hence sharedStrings.
                    Dim sharedStrings = ReadSharedStrings(zip)
                    Dim sheet = FindSheet(zip)
                    If sheet Is Nothing Then
                        series.Error = """" & System.IO.Path.GetFileName(path) & """ has no worksheet."
                        Return series
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
                                ' A line plot only needs one column. Prefer the Y column; if the sheet
                                ' has the values in the X column instead, take those rather than
                                ' drawing nothing.
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

                    series.Xs = xs.ToArray()
                    series.Ys = ys.ToArray()
                    series.XTitle = xTitle
                    series.YTitle = yTitle
                    If series.Ys.Length = 0 Then
                        Dim columns = If(xFromIndex, yColumn, xColumn & "/" & yColumn)
                        series.Error = "No numbers found in column " & columns & " of """ & System.IO.Path.GetFileName(path) &
                                       """ from row " & firstDataRow.ToString(CultureInfo.InvariantCulture) & "."
                    End If
                End Using
            Catch ex As Exception
                series.Error = "Cannot read """ & System.IO.Path.GetFileName(path) & """: " & ex.Message
            End Try
            Return series
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
                        ' A shared string is either one <t> or a run list <r><t>…</t></r>.
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

    ''' <summary>
    ''' The shared base for GrumpyLinePlot and GrumpyXYPlot: the frame, plot area, plot line,
    ''' markers, gridlines, axes with ticks and labels, the chart title, the spreadsheet reader and
    ''' the live-update watcher. Subclasses only supply the data.
    ''' </summary>
    Public MustInherit Class ChartBase
        Inherits Control

        ' ---- frame ----------------------------------------------------------------------------
        Public Shared ReadOnly ShowBorderProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of ChartBase, Boolean)(NameOf(ShowBorder), True)

        Public Shared ReadOnly BorderBrushProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of ChartBase, Color)(NameOf(BorderBrush), Color.Parse("#C8C8C8"))

        Public Shared ReadOnly BorderThicknessProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(BorderThickness), 1.0)

        ' Fully qualified: the type is named exactly like the property, and VB would otherwise
        ' resolve 'CornerRadius' to the member rather than the type.
        Public Shared ReadOnly CornerRadiusProperty As StyledProperty(Of Avalonia.CornerRadius) =
            AvaloniaProperty.Register(Of ChartBase, Avalonia.CornerRadius)(NameOf(CornerRadius), New Avalonia.CornerRadius(4))

        ' ---- plot area ------------------------------------------------------------------------
        Public Shared ReadOnly PlotBackColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of ChartBase, Color)(NameOf(PlotBackColor), Colors.White)

        Public Shared ReadOnly PlotBackOpacityProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(PlotBackOpacity), 100.0)

        ' ---- plot line ------------------------------------------------------------------------
        Public Shared ReadOnly LineColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of ChartBase, Color)(NameOf(LineColor), Color.Parse("#2D7DD2"))

        Public Shared ReadOnly LineThicknessProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(LineThickness), 2.0)

        Public Shared ReadOnly LineStyleProperty As StyledProperty(Of ChartLineStyle) =
            AvaloniaProperty.Register(Of ChartBase, ChartLineStyle)(NameOf(LineStyle), ChartLineStyle.Solid)

        ' ---- markers (the X,Y plot) -----------------------------------------------------------
        Public Shared ReadOnly MarkerStyleProperty As StyledProperty(Of ChartMarkerStyle) =
            AvaloniaProperty.Register(Of ChartBase, ChartMarkerStyle)(NameOf(MarkerStyle), ChartMarkerStyle.Dot)

        Public Shared ReadOnly MarkerSizeProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(MarkerSize), 8.0)

        Public Shared ReadOnly ConnectedProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of ChartBase, Boolean)(NameOf(Connected), True)

        ' ---- gridlines ------------------------------------------------------------------------
        Public Shared ReadOnly ShowGridProperty As StyledProperty(Of Boolean) =
            AvaloniaProperty.Register(Of ChartBase, Boolean)(NameOf(ShowGrid), True)

        Public Shared ReadOnly GridColorProperty As StyledProperty(Of Color) =
            AvaloniaProperty.Register(Of ChartBase, Color)(NameOf(GridColor), Color.Parse("#E8E8E8"))

        Public Shared ReadOnly GridThicknessProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(GridThickness), 1.0)

        Public Shared ReadOnly GridStyleProperty As StyledProperty(Of ChartLineStyle) =
            AvaloniaProperty.Register(Of ChartBase, ChartLineStyle)(NameOf(GridStyle), ChartLineStyle.Solid)

        ' ---- axes, ticks and labels -----------------------------------------------------------
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

        Public Shared ReadOnly TitlePositionProperty As StyledProperty(Of ChartTitlePosition) =
            AvaloniaProperty.Register(Of ChartBase, ChartTitlePosition)(NameOf(TitlePosition), ChartTitlePosition.Top)

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

        ' ---- scaling overrides ----------------------------------------------------------------
        Public Shared ReadOnly MinXProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(MinX), Double.NaN)

        Public Shared ReadOnly MaxXProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(MaxX), Double.NaN)

        Public Shared ReadOnly MinYProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(MinY), Double.NaN)

        Public Shared ReadOnly MaxYProperty As StyledProperty(Of Double) =
            AvaloniaProperty.Register(Of ChartBase, Double)(NameOf(MaxY), Double.NaN)

        Shared Sub New()
            ' Any style or data change is a change to the picture.
            AffectsRender(Of ChartBase)(
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
                MinXProperty, MaxXProperty, MinYProperty, MaxYProperty)
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

        Public Property LineStyle As ChartLineStyle
            Get
                Return GetValue(LineStyleProperty)
            End Get
            Set(value As ChartLineStyle)
                SetValue(LineStyleProperty, value)
            End Set
        End Property

        Public Property MarkerStyle As ChartMarkerStyle
            Get
                Return GetValue(MarkerStyleProperty)
            End Get
            Set(value As ChartMarkerStyle)
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

        Public Property GridStyle As ChartLineStyle
            Get
                Return GetValue(GridStyleProperty)
            End Get
            Set(value As ChartLineStyle)
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

        Public Property TitlePosition As ChartTitlePosition
            Get
                Return GetValue(TitlePositionProperty)
            End Get
            Set(value As ChartTitlePosition)
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

        ' ---- data -----------------------------------------------------------------------------

        ''' <summary>True for a line plot: X is the sample index and only the Y column is read.</summary>
        Protected MustOverride ReadOnly Property XFromIndex As Boolean

        ''' <summary>The data to draw when no SourceFile is set.</summary>
        Protected MustOverride Function InlineSeries() As ChartSeries

        ''' <summary>How a subclass stores its inline data (Values or Points).</summary>
        Protected MustOverride Sub SetInlineData(xs As Double(), ys As Double())

        ''' <summary>How a subclass names its inline data (usually nothing to do).</summary>
        Protected Overridable Sub SetInlineTitles()
        End Sub

        Private _cached As ChartSeries
        Private _cacheKey As String

        ''' <summary>The series for the current settings, cached until something changes.</summary>
        ''' <remarks>Not named Series(): VB is case-insensitive and would clash with locals.
        ''' </remarks>
        Protected Function GetSeries() As ChartSeries
            Dim file = SourceFile
            Dim key = file & "|" & XColumn & "|" & YColumn & "|" & HeaderRow.ToString(CultureInfo.InvariantCulture) & "|" &
                      FirstDataRow.ToString(CultureInfo.InvariantCulture) & "|" & XFromIndex.ToString()
            If _cached IsNot Nothing AndAlso _cacheKey = key Then Return _cached

            Dim loaded As ChartSeries
            If String.IsNullOrWhiteSpace(file) Then
                loaded = InlineSeries()
            Else
                loaded = SpreadsheetReader.Read(file, If(XColumn, "B"), If(YColumn, "C"), HeaderRow, FirstDataRow, XFromIndex)
            End If

            _cached = loaded
            _cacheKey = key
            Return loaded
        End Function

        ''' <summary>Drop the cached data so the next redraw re-reads the file.</summary>
        Public Sub Reload()
            InvalidateCache()
        End Sub

        Private Sub InvalidateCache()
            _cached = Nothing
            _cacheKey = Nothing
            InvalidateVisual()
        End Sub

        ''' <summary>Replace the plotted data (a line plot can also just append with AddPoint).</summary>
        Public Sub SetValues(values As IEnumerable(Of Double))
            ' Not 'array': that would shadow the System.Array type used just below.
            Dim data = If(values?.ToArray(), Array.Empty(Of Double)())
            SetInlineData(Enumerable.Range(0, data.Length).Select(Function(i) CDbl(i)).ToArray(), data)
            SetInlineTitles()
            InvalidateCache()
        End Sub

        ''' <summary>Append one point and redraw — for a chart fed live from your own code.</summary>
        Public Sub AddPoint(x As Double, y As Double)
            Dim current = InlineSeries()
            Dim xs = current.Xs.ToList()
            Dim ys = current.Ys.ToList()
            xs.Add(x)
            ys.Add(y)
            SetInlineData(xs.ToArray(), ys.ToArray())
            InvalidateCache()
        End Sub

        ''' <inheritdoc/>
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
        ''' when the control has no TopLevel yet (a designer preview), so it is safe to call.
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

        ''' <summary>
        ''' True when the "…" file picker should be drawn: when ShowBrowse asks for it, or when the
        ''' chart has no data — an empty chart is exactly where you want to pick the workbook.
        ''' </summary>
        Private ReadOnly Property BrowseVisible As Boolean
            Get
                Return ShowBrowse OrElse Not GetSeries().HasData
            End Get
        End Property

        ''' <summary>Clicking the drawn "…" button loads a file.</summary>
        Protected Overrides Sub OnPointerPressed(e As PointerPressedEventArgs)
            MyBase.OnPointerPressed(e)
            If BrowseVisible AndAlso _browseRect.Contains(e.GetPosition(Me)) Then
#Disable Warning BC42358 ' deliberately fire-and-forget: a pointer event cannot await the dialog
                BrowseForFile()
#Enable Warning BC42358
                e.Handled = True
            End If
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
                ' FOLDER for the file name rather than the file handle itself (which gets replaced).
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

        Public Overrides Sub Render(context As DrawingContext)
            Dim size = Bounds.Size
            If size.Width < 8 OrElse size.Height < 8 Then Return

            ' Local names deliberately differ from the members they read: VB is case-INSENSITIVE, so a
            ' local called borderThickness (vs the BorderThickness property) or series (vs the
            ' GetSeries method) makes the compiler infer the local instead of the member.
            Dim frameWidth = If(ShowBorder, Math.Max(0, BorderThickness), 0)
            Dim frame = New Rect(size).Deflate(frameWidth / 2)
            ' The chart's OWN plate comes first, filling the whole interior - not just the plot area.
            ' Everything drawn outside the plot (the title, the axis labels, the ticks) then sits on the
            ' chart's colour instead of on whatever is behind the control: a chart tuned for a dark form
            ' (white TitleColor, dark PlotBackColor) used to be invisible in the Designer, whose preview
            ' is always the light theme, while looking right at runtime.
            Dim radius = CornerRadius
            Dim opacity = Math.Clamp(PlotBackOpacity, 0, 100) / 100.0
            Dim plate As New SolidColorBrush(PlotBackColor, opacity)
            context.DrawRectangle(plate, Nothing, New RoundedRect(frame, radius))

            Dim chartData = GetSeries()
            Dim wantTitle = ShowTitle AndAlso Not String.IsNullOrWhiteSpace(Title)
            Dim titleText As FormattedText = Nothing
            If wantTitle Then titleText = MakeText(Title, TitleFontSize, TitleColor)

            ' Work out the plot rectangle: the frame, minus the breathing room, minus the title and
            ' the axis furniture around it.
            Dim plot = frame.Deflate(8)
            If titleText IsNot Nothing Then
                ' The title takes a measured strip off one edge, so it can never overlap the plot.
                Dim strip = titleText.Height + 6
                Select Case TitlePosition
                    Case ChartTitlePosition.Top
                        plot = Chop(plot, 0, strip, 0, 0)
                    Case ChartTitlePosition.Bottom
                        plot = Chop(plot, 0, 0, 0, strip)
                    Case ChartTitlePosition.Left
                        plot = Chop(plot, strip, 0, 0, 0)
                    Case Else
                        plot = Chop(plot, 0, 0, strip, 0)
                End Select
            End If

            Dim titles = If(ShowAxisTitles, AxisTitles(chartData), New ValueTuple(Of FormattedText, FormattedText)(Nothing, Nothing))
            Dim leftLabels As New List(Of KeyValuePair(Of Double, String))()
            Dim bottomLabels As New List(Of KeyValuePair(Of Double, String))()
            Dim leftLabelWidth As Double = 0
            Dim xRange As AxisRange = Nothing
            Dim yRange As AxisRange = Nothing

            If chartData.HasData Then
                xRange = AxisRange.Build(chartData.Xs, MinX, MaxX, 6, If(TypeOf Me Is GrumpyLinePlot, 1, 5))
                yRange = AxisRange.Build(chartData.Ys, MinY, MaxY, 5, 5)
                If ShowTickLabels Then
                    For Each v In yRange.Ticks()
                        leftLabels.Add(New KeyValuePair(Of Double, String)(v, FormatNumber(v, yRange.TickStep)))
                    Next
                    For Each v In xRange.Ticks()
                        bottomLabels.Add(New KeyValuePair(Of Double, String)(v, FormatNumber(v, xRange.TickStep)))
                    Next
                    For Each label In leftLabels
                        leftLabelWidth = Math.Max(leftLabelWidth, MakeText(label.Value, TickLabelFontSize, AxisColor).Width)
                    Next
                End If
            End If

            Dim labelHeight As Double = 0
            If ShowTickLabels Then labelHeight = MakeText("0", TickLabelFontSize, AxisColor).Height
            Dim tickOut As Double = 0
            If ShowAxes AndAlso ShowMajorTicks Then tickOut = Math.Max(0, MajorTickLength)
            Dim leftGutter = 4 + tickOut + leftLabelWidth
            If titles.Item2 IsNot Nothing Then leftGutter += titles.Item2.Height + 6
            Dim bottomGutter = 4 + tickOut + labelHeight
            If titles.Item1 IsNot Nothing Then bottomGutter += titles.Item1.Height + 6
            plot = Chop(plot, leftGutter, 0, 0, bottomGutter)
            If plot.Width <= 4 OrElse plot.Height <= 4 Then Return

            ' Plot-area fill (same colour as the plate, drawn explicitly so the plot can later carry its
            ' own tint without touching the rest of the chart).
            context.DrawRectangle(plate, Nothing, plot)

            If Not chartData.HasData Then
                DrawFrame(context, frame, radius, frameWidth)
                DrawTitle(context, titleText, plot, frame)
                DrawMessage(context, plot, chartData.Error)
                ' An empty chart is exactly when you want the file picker, so the "…" button is
                ' drawn here even when ShowBrowse is off (see BrowseVisible).
                DrawBrowseButton(context, frame)
                Return
            End If

            ' Gridlines, then the axes with their ticks and labels.
            If ShowGrid Then
                Dim gridPen = MakePen(GridColor, GridThickness, GridStyle)
                For Each tick In xRange.Ticks()
                    Dim x = xRange.ToPixel(tick, plot.X, plot.Width)
                    context.DrawLine(gridPen, New Point(x, plot.Y), New Point(x, plot.Bottom))
                Next
                For Each tick In yRange.Ticks()
                    Dim y = yRange.ToPixel(tick, plot.Bottom, -plot.Height)
                    context.DrawLine(gridPen, New Point(plot.X, y), New Point(plot.Right, y))
                Next
            End If

            Dim axisPen = MakePen(AxisColor, 1, ChartLineStyle.Solid)
            If ShowAxes Then
                context.DrawLine(axisPen, New Point(plot.X, plot.Y), New Point(plot.X, plot.Bottom))
                context.DrawLine(axisPen, New Point(plot.X, plot.Bottom), New Point(plot.Right, plot.Bottom))
            End If
            MinorAndMajorTicks(context, plot, xRange, yRange)

            If ShowTickLabels Then
                For Each label In bottomLabels
                    Dim t = MakeText(label.Value, TickLabelFontSize, AxisColor)
                    Dim x = xRange.ToPixel(label.Key, plot.X, plot.Width) - t.Width / 2
                    context.DrawText(t, New Point(x, plot.Bottom + tickOut + 2))
                Next
                For Each label In leftLabels
                    Dim t = MakeText(label.Value, TickLabelFontSize, AxisColor)
                    Dim y = yRange.ToPixel(label.Key, plot.Bottom, -plot.Height) - t.Height / 2
                    context.DrawText(t, New Point(plot.X - tickOut - 2 - t.Width, y))
                Next
            End If

            If titles.Item2 IsNot Nothing Then
                ' Rotate FIRST, then translate: Avalonia's matrices are row-vector, so they compose
                ' left-to-right. Getting this backwards draws the title above the control's own
                ' bounds (inside the chart sitting above it on the form).
                Dim axisTitleY = plot.Y + plot.Height / 2 + titles.Item2.Width / 2
                Using context.PushTransform(Matrix.CreateRotation(-Math.PI / 2) *
                                            Matrix.CreateTranslation(frame.X + 3, axisTitleY))
                    context.DrawText(titles.Item2, New Point(0, 0))
                End Using
            End If
            If titles.Item1 IsNot Nothing Then
                Dim axisX = plot.X + (plot.Width - titles.Item1.Width) / 2
                context.DrawText(titles.Item1, New Point(axisX, plot.Bottom + tickOut + 2 + labelHeight + 2))
            End If

            ' The data itself, clipped to the plot area.
            Using context.PushClip(plot)
                Dim dataPoints = chartData.Xs.Select(
                    Function(v, i)
                        Return New Point(xRange.ToPixel(v, plot.X, plot.Width),
                                         yRange.ToPixel(chartData.Ys(i), plot.Bottom, -plot.Height))
                    End Function).ToArray()

                If Connected AndAlso dataPoints.Length > 1 Then
                    Dim pen = MakePen(LineColor, LineThickness, LineStyle)
                    For i = 1 To dataPoints.Length - 1
                        context.DrawLine(pen, dataPoints(i - 1), dataPoints(i))
                    Next
                End If
                DrawMarkers(context, dataPoints)
            End Using

            ' Frame + title last, so nothing can overdraw them.
            DrawFrame(context, frame, radius, frameWidth)
            DrawTitle(context, titleText, plot, frame)
            DrawBrowseButton(context, frame)
        End Sub

        Private Sub DrawMarkers(context As DrawingContext, points As Point())
            If MarkerStyle = ChartMarkerStyle.None Then Return
            Dim size = Math.Max(2, MarkerSize)
            Dim brush As New SolidColorBrush(LineColor)
            Dim pen As New Pen(brush, 1)
            Dim half = size / 2
            For Each p In points
                Select Case MarkerStyle
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

        Private Sub MinorAndMajorTicks(context As DrawingContext, plot As Rect, xRange As AxisRange, yRange As AxisRange)
            Dim axisPen = MakePen(AxisColor, 1, ChartLineStyle.Solid)
            If ShowAxes AndAlso ShowMinorTicks AndAlso MinorTickLength > 0 Then
                For Each tick In xRange.MinorTicks()
                    Dim x = xRange.ToPixel(tick, plot.X, plot.Width)
                    context.DrawLine(axisPen, New Point(x, plot.Bottom), New Point(x, plot.Bottom + MinorTickLength))
                Next
                For Each tick In yRange.MinorTicks()
                    Dim y = yRange.ToPixel(tick, plot.Bottom, -plot.Height)
                    context.DrawLine(axisPen, New Point(plot.X - MinorTickLength, y), New Point(plot.X, y))
                Next
            End If
            If ShowAxes AndAlso ShowMajorTicks AndAlso MajorTickLength > 0 Then
                For Each tick In xRange.Ticks()
                    Dim x = xRange.ToPixel(tick, plot.X, plot.Width)
                    context.DrawLine(axisPen, New Point(x, plot.Bottom), New Point(x, plot.Bottom + MajorTickLength))
                Next
                For Each tick In yRange.Ticks()
                    Dim y = yRange.ToPixel(tick, plot.Bottom, -plot.Height)
                    context.DrawLine(axisPen, New Point(plot.X - MajorTickLength, y), New Point(plot.X, y))
                Next
            End If
        End Sub

        Private Sub DrawFrame(context As DrawingContext, frame As Rect, radius As Avalonia.CornerRadius, thickness As Double)
            If thickness <= 0 Then Return
            context.DrawRectangle(Nothing, New Pen(New SolidColorBrush(BorderBrush), thickness), New RoundedRect(frame, radius))
        End Sub

        Private Sub DrawTitle(context As DrawingContext, title As FormattedText, plot As Rect, frame As Rect)
            If title Is Nothing Then Return
            Select Case TitlePosition
                Case ChartTitlePosition.Top
                    context.DrawText(title, New Point(plot.X + (plot.Width - title.Width) / 2, frame.Y + 4))
                Case ChartTitlePosition.Bottom
                    context.DrawText(title, New Point(plot.X + (plot.Width - title.Width) / 2, plot.Bottom + 4))
                Case ChartTitlePosition.Left
                    ' Rotate then translate (see the Y axis title in Render): the rotated text starts
                    ' at the anchor and reads upward, so the anchor sits half a text-width below centre.
                    Dim leftY = plot.Y + plot.Height / 2 + title.Width / 2
                    Using context.PushTransform(Matrix.CreateRotation(-Math.PI / 2) *
                                                Matrix.CreateTranslation(frame.X + 4, leftY))
                        context.DrawText(title, New Point(0, 0))
                    End Using
                Case ChartTitlePosition.Right
                    Dim rightY = plot.Y + plot.Height / 2 + title.Width / 2
                    Using context.PushTransform(Matrix.CreateRotation(-Math.PI / 2) *
                                                Matrix.CreateTranslation(frame.Right - 4 - title.Height, rightY))
                        context.DrawText(title, New Point(0, 0))
                    End Using
            End Select
        End Sub

        Private Sub DrawMessage(context As DrawingContext, plot As Rect, message As String)
            Dim text = If(String.IsNullOrWhiteSpace(message), "No data — set Values, or point SourceFile at an .xlsx", message)
            Dim brush = Color.Parse("#909090")
            Dim formatted = MakeText(text, 12, brush)
            If formatted.Width > plot.Width Then
                ' A long explanation (a full path, a reader exception) would otherwise be dropped
                ' whole and leave the chart looking broken — trim it to fit instead.
                Dim perChar = formatted.Width / Math.Max(1, text.Length)
                Dim maxChars = Math.Max(0, CInt(Math.Floor(plot.Width / perChar)) - 1)
                If maxChars < 8 Then Return   ' no room for anything readable
                Dim cut = text.Substring(0, Math.Min(text.Length, maxChars)).TrimEnd() & "…"
                formatted = MakeText(cut, 12, brush)
                While formatted.Width > plot.Width AndAlso cut.Length > 9
                    cut = cut.Substring(0, cut.Length - 2).TrimEnd() & "…"
                    formatted = MakeText(cut, 12, brush)
                End While
                If formatted.Width > plot.Width Then Return
            End If
            context.DrawText(formatted, New Point(plot.X + (plot.Width - formatted.Width) / 2,
                                                  plot.Y + (plot.Height - formatted.Height) / 2))
        End Sub

        Private Sub DrawBrowseButton(context As DrawingContext, frame As Rect)
            _browseRect = Nothing
            If Not BrowseVisible Then Return
            Dim size As Double = 18
            Dim rect As New Rect(frame.Right - size - 4, frame.Y + 4, size, size)
            _browseRect = rect
            context.DrawRectangle(New SolidColorBrush(Color.Parse("#F0F0F0")),
                                  New Pen(New SolidColorBrush(Color.Parse("#C0C0C0")), 1),
                                  New RoundedRect(rect, New Avalonia.CornerRadius(3)))
            Dim dots = MakeText("…", 12, Color.Parse("#505050"))
            context.DrawText(dots, New Point(rect.X + (size - dots.Width) / 2, rect.Y + (size - dots.Height) / 2))
        End Sub

        ''' <summary>Resolves the two axis names: the explicit properties win, then the sheet's headers.</summary>
        Private Function AxisTitles(series As ChartSeries) As (X As FormattedText, Y As FormattedText)
            Dim x = If(Not String.IsNullOrWhiteSpace(XAxisTitle), XAxisTitle, series.XTitle)
            Dim y = If(Not String.IsNullOrWhiteSpace(YAxisTitle), YAxisTitle, series.YTitle)
            Return (If(String.IsNullOrWhiteSpace(x), Nothing, MakeText(x, TickLabelFontSize, AxisColor)),
                    If(String.IsNullOrWhiteSpace(y), Nothing, MakeText(y, TickLabelFontSize, AxisColor)))
        End Function
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
                    ' A dash of ~0 with round caps is a dot; a true 0-length dash can vanish.
                    Return New DashStyle(New Double() {0.01, 3}, 0)
                Case ChartLineStyle.DashDot
                    Return New DashStyle(New Double() {4, 3, 0.01, 3}, 0)
                Case Else
                    Return Nothing
            End Select
        End Function

        ' 'step'/'Step' is a VB keyword, hence tickStep/TickStep below.
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
        Friend Shared Function Build(values As IReadOnlyList(Of Double), forcedMin As Double, forcedMax As Double,
                                     targetTicks As Integer, subdivisions As Integer) As AxisRange
            Dim range As New AxisRange With {.Subdivisions = Math.Max(1, subdivisions)}
            Dim min = If(Double.IsNaN(forcedMin), values.Min(), forcedMin)
            Dim max = If(Double.IsNaN(forcedMax), values.Max(), forcedMax)
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
    End Class

    ''' <summary>
    ''' A LINE PLOT: Y values in sample order, with the X axis running 0 to N-1. Feed it from an
    ''' array (Values) or from an .xlsx file (column C by default).
    ''' </summary>
    Public Class GrumpyLinePlot
        Inherits ChartBase

        ''' <summary>The Y samples to draw. X is the sample index (0,1,2…).</summary>
        Public Shared ReadOnly ValuesProperty As StyledProperty(Of Double()) =
            AvaloniaProperty.Register(Of GrumpyLinePlot, Double())(NameOf(Values))

        ''' <summary>The Y samples (X is the sample index).</summary>
        <TypeConverter(GetType(DoubleArrayConverter))>
        Public Property Values As Double()
            Get
                Return GetValue(ValuesProperty)
            End Get
            Set(value As Double())
                SetValue(ValuesProperty, value)
            End Set
        End Property

        Protected Overrides ReadOnly Property XFromIndex As Boolean
            Get
                Return True
            End Get
        End Property

        Protected Overrides Function InlineSeries() As ChartSeries
            ' Not 'values': that would collide with the Values property (VB is case-insensitive).
            Dim samples = If(Values, Array.Empty(Of Double)())
            Return New ChartSeries With {
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
    ''' An X,Y PLOT: (x,y) pairs, drawn as a line, as markers, or both. Feed it from a 2-D array
    ''' (Points) or from an .xlsx file (column B = X, column C = Y by default).
    ''' </summary>
    Public Class GrumpyXYPlot
        Inherits ChartBase

        ''' <summary>The (x,y) pairs to draw — an n-by-2 array.</summary>
        Public Shared ReadOnly PointsProperty As StyledProperty(Of Double(,)) =
            AvaloniaProperty.Register(Of GrumpyXYPlot, Double(,))(NameOf(Points))

        ''' <summary>The (x,y) pairs — an n-by-2 array.</summary>
        <TypeConverter(GetType(DoubleMatrixConverter))>
        Public Property Points As Double(,)
            Get
                Return GetValue(PointsProperty)
            End Get
            Set(value As Double(,))
                SetValue(PointsProperty, value)
            End Set
        End Property

        Protected Overrides ReadOnly Property XFromIndex As Boolean
            Get
                Return False
            End Get
        End Property

        Protected Overrides Function InlineSeries() As ChartSeries
            ' Not 'points': that would collide with the Points property (VB is case-insensitive).
            Dim pairs = Points
            If pairs Is Nothing Then Return New ChartSeries()
            Dim count = pairs.GetLength(0)
            Dim series As New ChartSeries With {.Xs = New Double(count - 1) {}, .Ys = New Double(count - 1) {}}
            For i = 0 To count - 1
                series.Xs(i) = pairs(i, 0)
                series.Ys(i) = pairs(i, 1)
            Next
            Return series
        End Function

        Protected Overrides Sub SetInlineData(xs As Double(), ys As Double())
            Dim count = Math.Min(xs.Length, ys.Length)
            ' Not 'points': see InlineSeries above.
            Dim newPairs(count - 1, 1) As Double
            For i = 0 To count - 1
                newPairs(i, 0) = xs(i)
                newPairs(i, 1) = ys(i)
            Next
            Points = newPairs
        End Sub

        Protected Overrides Sub OnPropertyChanged(change As AvaloniaPropertyChangedEventArgs)
            MyBase.OnPropertyChanged(change)
            If change.Property Is PointsProperty Then Reload()
        End Sub
    End Class

End Namespace
