/**
 * What the stores check on an uploaded image, and an encoder for the one form both accept
 * everywhere: an 8-bit RGB PNG with no alpha channel.
 */
import { deflateSync } from 'node:zlib';

import { decodePng } from '../ci-device/png';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface PngInfo {
  readonly width: number;
  readonly height: number;
  /** The file can carry transparency: an alpha colour type, or a palette with a `tRNS` chunk. */
  readonly alpha: boolean;
}

/** Reads a PNG's size and whether it can carry transparency, from its chunks alone. */
export function pngInfo(file: Uint8Array): PngInfo {
  const bytes = Buffer.from(file.buffer, file.byteOffset, file.byteLength);
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  const colourType = bytes[25] ?? 0;
  let alpha = colourType === 4 || colourType === 6;
  for (let at = 8; at + 8 <= bytes.length && !alpha;) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);
    if (type === 'tRNS') alpha = true;
    if (type === 'IDAT') break;
    at += 12 + length;
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), alpha };
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/** Encodes RGBA pixels as an RGB PNG; the pixels must already be opaque. */
export function encodeRgbPng(width: number, height: number, rgba: Uint8Array): Buffer {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = (y * width + x) * 4;
      if (rgba[from + 3] !== 255) {
        throw new Error(`pixel ${String(x)},${String(y)} is not opaque: the stores take no alpha`);
      }
      const to = y * stride + 1 + x * 3;
      raw[to] = rgba[from] ?? 0;
      raw[to + 1] = rgba[from + 1] ?? 0;
      raw[to + 2] = rgba[from + 2] ?? 0;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array()),
  ]);
}

/** Re-encodes any PNG without its alpha channel; throws when a pixel is not opaque. */
export function withoutAlpha(file: Uint8Array): Buffer {
  const image = decodePng(Buffer.from(file.buffer, file.byteOffset, file.byteLength));
  return encodeRgbPng(image.width, image.height, image.data);
}
