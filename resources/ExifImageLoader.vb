' BUNDLED-COPY: 0.12.7
Imports System
Imports System.IO
Imports Avalonia
Imports Avalonia.Media
Imports Avalonia.Media.Imaging

''' <summary>
''' Loads images applying their EXIF orientation so that JPEGs which carry a
''' camera orientation tag (very common for photos taken on phones) are rendered
''' upright, exactly like PNGs — which are normally already stored upright and
''' therefore need no correction.
''' </summary>
''' <remarks>
''' Avalonia's <see cref="Bitmap"/> decodes the JPEG pixels in their stored
''' (native) order and does <em>not</em> honour the EXIF <c>Orientation</c> tag,
''' which is why such JPEGs appear rotated while PNGs (which carry no
''' orientation tag) render correctly. This module reads the tag and bakes the
''' required rotation/flip into a new <see cref="RenderTargetBitmap"/>.
'''
''' BUNDLED RESOURCE — this file is copied into every generated VB project. The
''' C# twin lives in resources/ExifImageLoader.cs (also linked into the
''' PreviewerHost so the design preview shares one implementation) — keep the
''' two in sync.
''' </remarks>
Friend Module ExifImageLoader

    ''' <summary>
    ''' Loads the image at <paramref name="path"/> and applies its EXIF orientation
    ''' (if any) so that JPEGs render upright like PNGs.
    ''' </summary>
    Public Function LoadImageOriented(path As String) As IImage
        Dim bmp As New Bitmap(path)
        Dim orientation As Integer = ReadExifOrientation(path)
        If orientation <= 1 OrElse orientation > 8 Then Return bmp

        Dim ps As PixelSize = bmp.PixelSize
        Dim w As Integer = ps.Width
        Dim h As Integer = ps.Height
        Dim dpi As Vector = bmp.Dpi

        Dim transform As Matrix
        Dim outSize As PixelSize
        Select Case orientation
            Case 2 ' Mirror horizontal
                transform = New Matrix(-1, 0, 0, 1, w, 0) : outSize = New PixelSize(w, h)
            Case 3 ' Rotate 180°
                transform = New Matrix(-1, 0, 0, -1, w, h) : outSize = New PixelSize(w, h)
            Case 4 ' Mirror vertical
                transform = New Matrix(1, 0, 0, -1, 0, h) : outSize = New PixelSize(w, h)
            Case 5 ' Transpose (mirror across the top-left↔bottom-right diagonal)
                transform = New Matrix(0, 1, 1, 0, 0, 0) : outSize = New PixelSize(h, w)
            Case 6 ' Rotate 90° clockwise  (e.g. mamma.jpg)
                transform = New Matrix(0, 1, -1, 0, h, 0) : outSize = New PixelSize(h, w)
            Case 7 ' Transverse (mirror across the anti-diagonal)
                transform = New Matrix(0, -1, -1, 0, h, w) : outSize = New PixelSize(h, w)
            Case 8 ' Rotate 270° clockwise / 90° counter-clockwise (e.g. pappa.jpg)
                transform = New Matrix(0, -1, 1, 0, 0, w) : outSize = New PixelSize(h, w)
            Case Else
                Return bmp
        End Select

        ' Bake the orientation into a fresh, already-correctly-oriented bitmap.
        ' The source is rasterised synchronously into the render target's own buffer
        ' (the same pattern Avalonia uses internally in Bitmap.CopyPixels), so the
        ' source bitmap can be released as soon as drawing is finished.
        Dim rtb As New RenderTargetBitmap(outSize, dpi)
        Using dc As DrawingContext = rtb.CreateDrawingContext()
            Using dc.PushTransform(transform)
                dc.DrawImage(bmp, New Rect(0, 0, w, h))
            End Using
        End Using
        bmp.Dispose()
        Return rtb
    End Function

    ''' <summary>
    ''' Reads the EXIF Orientation tag (0x0112) from the image at <paramref name="path"/>.
    ''' Returns <c>1</c> (no correction) for files that are not JPEGs, JPEGs without the
    ''' tag, or any file that cannot be read.
    ''' </summary>
    Public Function ReadExifOrientation(path As String) As Integer
        Try
            Return ReadExifOrientation(File.ReadAllBytes(path))
        Catch
            Return 1
        End Try
    End Function

    ''' <summary>
    ''' Reads the EXIF Orientation tag (0x0112) from a JPEG byte array.
    ''' Returns <c>1</c> when the data is not a JPEG or the tag is absent.
    ''' </summary>
    Friend Function ReadExifOrientation(data() As Byte) As Integer
        ' JPEG files start with the SOI marker 0xFF 0xD8.
        If data Is Nothing OrElse data.Length < 4 OrElse data(0) <> &HFF OrElse data(1) <> &HD8 Then Return 1

        Dim i As Integer = 2
        Dim n As Integer = data.Length
        While i < n
            If data(i) <> &HFF Then
                i += 1
                Continue While
            End If
            ' Skip any fill bytes (0xFF 0xFF...).
            Do While i < n AndAlso data(i) = &HFF : i += 1 : Loop
            If i >= n Then Exit While
            Dim code As Integer = data(i) : i += 1
            ' Standalone markers have no payload segment.
            If code = &H01 OrElse (code >= &HD0 AndAlso code <= &HD9) Then Continue While
            ' Start Of Scan (0xDA) begins entropy-coded image data; stop scanning.
            If code = &HDA Then Exit While
            If i + 1 >= n Then Exit While
            Dim segLen As Integer = (data(i) * 256) Or data(i + 1) : i += 2
            If segLen < 2 Then Exit While
            ' APP1 may carry an Exif TIFF header.
            If code = &HE1 AndAlso i + 6 <= n AndAlso IsExifHeader(data, i) Then
                Dim val As Integer = ParseTiffOrientation(data, i + 6)
                If val >= 1 AndAlso val <= 8 Then Return val
            End If
            i += segLen - 2
        End While
        Return 1
    End Function

    Private Function IsExifHeader(data() As Byte, offset As Integer) As Boolean
        Return data(offset) = &H45 AndAlso data(offset + 1) = &H78 AndAlso data(offset + 2) = &H69 AndAlso
               data(offset + 3) = &H66 AndAlso data(offset + 4) = &H0 AndAlso data(offset + 5) = &H0
    End Function

    ''' <summary>
    ''' Parses the TIFF header (starting at <paramref name="start"/>, i.e. right after the
    ''' "Exif\0\0" signature) and returns the Orientation tag value from IFD0.
    ''' </summary>
    Private Function ParseTiffOrientation(data() As Byte, start As Integer) As Integer
        If start + 8 > data.Length Then Return 1

        Dim b0 As Byte = data(start)
        Dim b1 As Byte = data(start + 1)
        Dim le As Boolean
        If b0 = &H49 AndAlso b1 = &H49 Then
            le = True            ' "II" (little-endian)
        ElseIf b0 = &H4D AndAlso b1 = &H4D Then
            le = False           ' "MM" (big-endian)
        Else
            Return 1
        End If

        If ReadUShort(data, start + 2, le) <> 42 Then Return 1          ' TIFF magic
        Dim ifd0 As Integer = CInt(ReadUInt(data, start + 4, le))
        If ifd0 < 8 OrElse start + ifd0 > data.Length - 2 Then Return 1
        Return FindOrientationTag(data, start + ifd0, le)
    End Function

    ''' <summary>
    ''' Walks the IFD at <paramref name="ifd"/> (an offset within <paramref name="data"/>)
    ''' looking for the Orientation tag (0x0112).
    ''' </summary>
    Private Function FindOrientationTag(data() As Byte, ifd As Integer, le As Boolean) As Integer
        If ifd + 2 > data.Length Then Return 1
        Dim count As Integer = ReadUShort(data, ifd, le)
        Dim off As Integer = ifd + 2
        For k As Integer = 0 To count - 1
            If off + 12 > data.Length Then Return 1
            Dim tag As Integer = ReadUShort(data, off, le)
            If tag = &H112 Then
                Dim typ As Integer = ReadUShort(data, off + 2, le)
                Return OrientationValue(data, off + 8, typ, le)
            End If
            off += 12
        Next
        Return 1
    End Function

    ''' <summary>
    ''' Returns the value stored in a TIFF IFD entry's value/offset field.
    ''' </summary>
    Private Function OrientationValue(data() As Byte, offset As Integer, typ As Integer, le As Boolean) As Integer
        Select Case typ
            Case 3  ' SHORT (2 bytes)
                Return ReadUShort(data, offset, le)
            Case 4  ' LONG (4 bytes)
                Return CInt(ReadUInt(data, offset, le))
            Case 1  ' BYTE (1 byte, inlined)
                If offset < data.Length Then Return data(offset)
            Case Else
                Return 0
        End Select
        Return 0
    End Function

    ''' <summary>
    ''' Reads a 16-bit unsigned integer. The components are widened to Integer first;
    ''' shifting a Byte directly by 8 bits in VB.NET would truncate it back to a
    ''' Byte and silently corrupt endian-aware values whose high byte is non-zero.
    ''' </summary>
    Private Function ReadUShort(data() As Byte, offset As Integer, le As Boolean) As Integer
        Dim b0 As Integer = data(offset)
        Dim b1 As Integer = data(offset + 1)
        If le Then Return b0 Or (b1 << 8)
        Return (b0 << 8) Or b1
    End Function

    ''' <summary>
    ''' Reads a 32-bit unsigned integer (same widening rationale as <see cref="ReadUShort"/>).
    ''' </summary>
    Private Function ReadUInt(data() As Byte, offset As Integer, le As Boolean) As UInteger
        Dim b0 As Integer = data(offset)
        Dim b1 As Integer = data(offset + 1)
        Dim b2 As Integer = data(offset + 2)
        Dim b3 As Integer = data(offset + 3)
        If le Then Return CUInt(b0 Or (b1 << 8) Or (b2 << 16) Or (b3 << 24))
        Return CUInt((b0 << 24) Or (b1 << 16) Or (b2 << 8) Or b3)
    End Function

End Module
