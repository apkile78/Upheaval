/**
 * Minimal PNG I/O for the Earth DEM converter (no dependencies).
 * Encoder: 8-bit RGB, per-row Paeth filtering, zlib deflate.
 * Reader: decodes the same subset back (all 5 filter types) for verification.
 */

import { deflateSync, inflateSync } from 'node:zlib';
import { writeFileSync, readFileSync } from 'node:fs';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Paeth predictor (PNG spec). */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Write a 24-bit RGB PNG. rgb: width*height*3 bytes, row-major. */
export function writePngRgb(path, width, height, rgb) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 4; // Paeth filter
    const cur = y * stride;
    const up = cur - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 3 ? rgb[cur + x - 3] : 0;
      const b = y > 0 ? rgb[up + x] : 0;
      const c = x >= 3 && y > 0 ? rgb[up + x - 3] : 0;
      raw[rowStart + 1 + x] = (rgb[cur + x] - paeth(a, b, c)) & 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
  return png.length;
}

/** Decode a 24-bit non-interlaced RGB PNG back to raw bytes (verification). */
export function readPngRgb(path) {
  const buf = readFileSync(path);
  let p = 8; // skip signature
  let width = 0;
  let height = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 2) throw new Error('Unsupported PNG: expect 8-bit RGB');
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    }
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 3;
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const cur = y * stride;
    const up = cur - stride;
    for (let x = 0; x < stride; x++) {
      const rawVal = raw[y * (stride + 1) + 1 + x];
      const a = x >= 3 ? rgb[cur + x - 3] : 0;
      const b = y > 0 ? rgb[up + x] : 0;
      const c = x >= 3 && y > 0 ? rgb[up + x - 3] : 0;
      let val = rawVal;
      if (filter === 1) val = rawVal + a;
      else if (filter === 2) val = rawVal + b;
      else if (filter === 3) val = rawVal + ((a + b) >> 1);
      else if (filter === 4) val = rawVal + paeth(a, b, c);
      rgb[cur + x] = val & 0xff;
    }
  }
  return { width, height, rgb };
}
