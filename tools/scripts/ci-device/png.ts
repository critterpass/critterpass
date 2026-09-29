/**
 * A small PNG decoder on `node:zlib`, for the device shards: they run their scripts through
 * `npx tsx` without installing the workspace, so image checks can't lean on a native canvas.
 * Handles what simulator, emulator and phone screenshots use: 8-bit grey, grey + alpha, RGB, RGBA
 * and palette images, non-interlaced.
 */
import { inflateSync } from 'node:zlib';

/** Decoded pixels, always RGBA, row-major. */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Undoes the per-row filters in place; returns the raw scanlines without their filter bytes. */
function unfilter(raw: Buffer, height: number, stride: number, bpp: number): Uint8Array {
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[src + x] ?? 0;
      const left = x >= bpp ? (out[row + x - bpp] ?? 0) : 0;
      const up = y > 0 ? (out[prev + x] ?? 0) : 0;
      const upLeft = y > 0 && x >= bpp ? (out[prev + x - bpp] ?? 0) : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) predicted = paeth(left, up, upLeft);
      else if (filter !== 0) throw new Error(`PNG: unknown row filter ${String(filter)}`);
      out[row + x] = (value + predicted) & 0xff;
    }
  }
  return out;
}

export function decodePng(file: Buffer): RgbaImage {
  if (!file.subarray(0, 8).equals(SIGNATURE)) throw new Error('Not a PNG file');
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let palette: Buffer | undefined;
  let transparency: Buffer | undefined;
  const idat: Buffer[] = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('latin1', offset + 4, offset + 8);
    const body = file.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      colorType = body[9] ?? 0;
      if (depth !== 8)
        throw new Error(`PNG: only 8-bit images are supported (got ${String(depth)})`);
      if (body[12] !== 0) throw new Error('PNG: interlaced images are not supported');
      if (CHANNELS[colorType] === undefined)
        throw new Error(`PNG: color type ${String(colorType)}`);
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') transparency = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
  }
  const channels = CHANNELS[colorType] ?? 4;
  const raw = unfilter(inflateSync(Buffer.concat(idat)), height, width * channels, channels);
  const data = new Uint8Array(width * height * 4);
  for (let i = 0, p = 0; i < width * height; i += 1, p += channels) {
    const o = i * 4;
    const a = raw[p] ?? 0;
    if (colorType === 3) {
      data[o] = palette?.[a * 3] ?? 0;
      data[o + 1] = palette?.[a * 3 + 1] ?? 0;
      data[o + 2] = palette?.[a * 3 + 2] ?? 0;
      data[o + 3] = transparency?.[a] ?? 255;
    } else if (channels <= 2) {
      data[o] = a;
      data[o + 1] = a;
      data[o + 2] = a;
      data[o + 3] = channels === 2 ? (raw[p + 1] ?? 255) : 255;
    } else {
      data[o] = a;
      data[o + 1] = raw[p + 1] ?? 0;
      data[o + 2] = raw[p + 2] ?? 0;
      data[o + 3] = channels === 4 ? (raw[p + 3] ?? 255) : 255;
    }
  }
  return { width, height, data };
}
