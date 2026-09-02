/* Minimal PNG decoder (RGBA/RGB, 8-bit, non-interlaced) — decodes the PreviewerHost frames so
 * tests can assert pixels (colours, icons, layout). */
const zlib = require('zlib');

function decodePng(buf) {
    let off = 8, width = 0, height = 0, colorType = 0, bitDepth = 0, interlace = 0;
    const idat = [];
    while (off < buf.length) {
        const len = buf.readUInt32BE(off);
        const type = buf.toString('ascii', off + 4, off + 8);
        const data = buf.slice(off + 8, off + 8 + len);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data.readUInt8(8);
            colorType = data.readUInt8(9);
            interlace = data.readUInt8(12);
        } else if (type === 'IDAT') idat.push(data);
        else if (type === 'IEND') break;
        off += 12 + len;
    }
    if (bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported png depth=${bitDepth} interlace=${interlace}`);
    const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
    if (!bpp) throw new Error(`unsupported colorType=${colorType}`);
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * bpp;
    const out = Buffer.alloc(height * stride);
    let p = 0;
    for (let y = 0; y < height; y++) {
        const filter = raw[p++];
        const line = raw.slice(p, p + stride);
        p += stride;
        const prev = y > 0 ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
        for (let x = 0; x < stride; x++) {
            // 'a' (left) must be the RECONSTRUCTED value from the output buffer, not the raw byte.
            const a = x >= bpp ? out[y * stride + x - bpp] : 0;
            const b = prev[x];
            const c = x >= bpp ? prev[x - bpp] : 0;
            let v = line[x];
            switch (filter) {
                case 0: break;
                case 1: v = (v + a) & 0xff; break;
                case 2: v = (v + b) & 0xff; break;
                case 3: v = (v + ((a + b) >> 1)) & 0xff; break;
                case 4: {
                    const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
                    v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
                    break;
                }
            }
            out[y * stride + x] = v;
        }
    }
    return {
        width, height, bpp, data: out,
        px: (x, y) => { const i = y * stride + x * bpp; return [out[i], out[i + 1], out[i + 2]]; }
    };
}

/** Count pixels matching a predicate in a region. */
function countIn(img, x0, x1, y0, y1, pred) {
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const [r, g, b] = img.px(x, y);
        if (pred(r, g, b)) n++;
    }
    return n;
}

/* ---- minimal PNG encoder (solid colour) — used to create test assets for avares rendering ---- */
function crc32(buf) {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
        c ^= buf[i];
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
    return ~c >>> 0;
}
function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
}
function solidPng(width, height, r, g, b) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; ihdr[9] = 2; // bit depth 8, color type RGB
    const stride = width * 3;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0; // filter None
        for (let x = 0; x < width; x++) {
            const o = y * (stride + 1) + 1 + x * 3;
            raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
        }
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

module.exports = { decodePng, countIn, solidPng };
