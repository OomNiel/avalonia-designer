// BUNDLED-COPY: 0.12.6
#nullable disable
using System;
using System.IO;
using Avalonia;
using Avalonia.Media;
using Avalonia.Media.Imaging;

/// <summary>
/// Loads images applying their EXIF orientation so that JPEGs which carry a camera
/// orientation tag (very common for photos taken on phones) are rendered upright,
/// exactly like PNGs — which are normally already stored upright and therefore need
/// no correction.
/// </summary>
/// <remarks>
/// Avalonia's <see cref="Bitmap"/> decodes the JPEG pixels in their stored (native)
/// order and does <em>not</em> honour the EXIF <c>Orientation</c> tag, which is why
/// such JPEGs appear rotated while PNGs (which carry no orientation tag) render
/// correctly. This class reads the tag and bakes the required rotation/flip into a
/// new <see cref="RenderTargetBitmap"/>.
///
/// BUNDLED RESOURCE — this file is copied into every generated C# project (and the
/// PreviewerHost links the SAME file from ../resources so the design preview and the
/// generated runtime code share one implementation). The .vb twin lives in
/// resources/ExifImageLoader.vb — keep the two in sync.
/// </remarks>
public static class ExifImageLoader
{
    /// <summary>
    /// Loads the image at <paramref name="path"/> and applies its EXIF orientation
    /// (if any) so that JPEGs render upright like PNGs.
    /// </summary>
    public static IImage LoadImageOriented(string path)
    {
        var bmp = new Bitmap(path);
        int orientation = ReadExifOrientation(path);
        if (orientation <= 1 || orientation > 8) return bmp;

        var ps = bmp.PixelSize;
        int w = ps.Width;
        int h = ps.Height;
        var dpi = bmp.Dpi;

        Matrix transform;
        PixelSize outSize;
        switch (orientation)
        {
            case 2: transform = new Matrix(-1, 0, 0, 1, w, 0); outSize = new PixelSize(w, h); break;   // mirror horizontal
            case 3: transform = new Matrix(-1, 0, 0, -1, w, h); outSize = new PixelSize(w, h); break; // rotate 180
            case 4: transform = new Matrix(1, 0, 0, -1, 0, h); outSize = new PixelSize(w, h); break;   // mirror vertical
            case 5: transform = new Matrix(0, 1, 1, 0, 0, 0); outSize = new PixelSize(h, w); break;     // transpose
            case 6: transform = new Matrix(0, 1, -1, 0, h, 0); outSize = new PixelSize(h, w); break;    // rotate 90 CW
            case 7: transform = new Matrix(0, -1, -1, 0, h, w); outSize = new PixelSize(h, w); break;   // transverse
            case 8: transform = new Matrix(0, -1, 1, 0, 0, w); outSize = new PixelSize(h, w); break;    // rotate 270 CW
            default: return bmp;
        }

        // Bake the orientation into a fresh, already-correctly-oriented bitmap.
        // The source is rasterised synchronously into the render target's own buffer
        // (the same pattern Avalonia uses internally in Bitmap.CopyPixels), so the
        // source bitmap can be released as soon as drawing is finished.
        var rtb = new RenderTargetBitmap(outSize, dpi);
        using (var dc = rtb.CreateDrawingContext())
        {
            using (dc.PushTransform(transform))
            {
                dc.DrawImage(bmp, new Rect(0, 0, w, h));
            }
        }
        bmp.Dispose();
        return rtb;
    }

    /// <summary>
    /// Reads the EXIF Orientation tag (0x0112) from the image at <paramref name="path"/>.
    /// Returns <c>1</c> (no correction) for files that are not JPEGs, JPEGs without the
    /// tag, or any file that cannot be read.
    /// </summary>
    public static int ReadExifOrientation(string path)
    {
        try { return ReadExifOrientation(File.ReadAllBytes(path)); }
        catch { return 1; }
    }

    /// <summary>
    /// Reads the EXIF Orientation tag (0x0112) from a JPEG byte array.
    /// Returns <c>1</c> when the data is not a JPEG or the tag is absent.
    /// </summary>
    internal static int ReadExifOrientation(byte[] data)
    {
        // JPEG files start with the SOI marker 0xFF 0xD8.
        if (data == null || data.Length < 4 || data[0] != 0xFF || data[1] != 0xD8) return 1;

        int i = 2;
        int n = data.Length;
        while (i < n)
        {
            if (data[i] != 0xFF)
            {
                i++;
                continue;
            }
            // Skip any fill bytes (0xFF 0xFF...).
            while (i < n && data[i] == 0xFF) i++;
            if (i >= n) break;
            int code = data[i]; i++;
            // Standalone markers have no payload segment.
            if (code == 0x01 || (code >= 0xD0 && code <= 0xD9)) continue;
            // Start Of Scan (0xDA) begins entropy-coded image data; stop scanning.
            if (code == 0xDA) break;
            if (i + 1 >= n) break;
            int segLen = (data[i] << 8) | data[i + 1]; i += 2;
            if (segLen < 2) break;
            // APP1 may carry an Exif TIFF header.
            if (code == 0xE1 && i + 6 <= n && IsExifHeader(data, i))
            {
                int val = ParseTiffOrientation(data, i + 6);
                if (val >= 1 && val <= 8) return val;
            }
            i += segLen - 2;
        }
        return 1;
    }

    private static bool IsExifHeader(byte[] data, int offset)
    {
        return data[offset] == 0x45 && data[offset + 1] == 0x78 && data[offset + 2] == 0x69 &&
               data[offset + 3] == 0x66 && data[offset + 4] == 0x00 && data[offset + 5] == 0x00;
    }

    /// <summary>
    /// Parses the TIFF header (starting at <paramref name="start"/>, i.e. right after the
    /// "Exif\0\0" signature) and returns the Orientation tag value from IFD0.
    /// </summary>
    private static int ParseTiffOrientation(byte[] data, int start)
    {
        if (start + 8 > data.Length) return 1;

        byte b0 = data[start];
        byte b1 = data[start + 1];
        bool le;
        if (b0 == 0x49 && b1 == 0x49) le = true;        // "II" (little-endian)
        else if (b0 == 0x4D && b1 == 0x4D) le = false;   // "MM" (big-endian)
        else return 1;

        if (ReadUShort(data, start + 2, le) != 42) return 1; // TIFF magic
        int ifd0 = (int)ReadUInt(data, start + 4, le);
        if (ifd0 < 8 || start + ifd0 > data.Length - 2) return 1;
        return FindOrientationTag(data, start + ifd0, le);
    }

    /// <summary>
    /// Walks the IFD at <paramref name="ifd"/> (an offset within <paramref name="data"/>)
    /// looking for the Orientation tag (0x0112).
    /// </summary>
    private static int FindOrientationTag(byte[] data, int ifd, bool le)
    {
        if (ifd + 2 > data.Length) return 1;
        int count = ReadUShort(data, ifd, le);
        int off = ifd + 2;
        for (int k = 0; k < count; k++)
        {
            if (off + 12 > data.Length) return 1;
            int tag = ReadUShort(data, off, le);
            if (tag == 0x0112)
            {
                int typ = ReadUShort(data, off + 2, le);
                return OrientationValue(data, off + 8, typ, le);
            }
            off += 12;
        }
        return 1;
    }

    /// <summary>
    /// Returns the value stored in a TIFF IFD entry's value/offset field.
    /// </summary>
    private static int OrientationValue(byte[] data, int offset, int typ, bool le)
    {
        switch (typ)
        {
            case 3: // SHORT (2 bytes)
                return ReadUShort(data, offset, le);
            case 4: // LONG (4 bytes)
                return (int)ReadUInt(data, offset, le);
            case 1: // BYTE (1 byte, inlined)
                if (offset < data.Length) return data[offset];
                break;
            default:
                break;
        }
        return 0;
    }

    /// <summary>Reads a 16-bit unsigned integer.</summary>
    private static int ReadUShort(byte[] data, int offset, bool le)
    {
        int b0 = data[offset];
        int b1 = data[offset + 1];
        return le ? b0 | (b1 << 8) : (b0 << 8) | b1;
    }

    /// <summary>Reads a 32-bit unsigned integer.</summary>
    private static uint ReadUInt(byte[] data, int offset, bool le)
    {
        int b0 = data[offset];
        int b1 = data[offset + 1];
        int b2 = data[offset + 2];
        int b3 = data[offset + 3];
        return le ? (uint)(b0 | (b1 << 8) | (b2 << 16) | (b3 << 24))
                  : (uint)((b0 << 24) | (b1 << 16) | (b2 << 8) | b3);
    }
}
