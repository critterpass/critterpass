/**
 * BlurHash (https://blurha.sh): a few dozen characters that decode to a soft colour placeholder
 * of a photo. The ingest job encodes each still once; the app decodes it into a tiny bitmap shown
 * while the photo loads. Pure arithmetic, so the worker and the app share this one copy.
 */
const DIGITS =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

function encode83(value: number, length: number): string {
  let out = '';
  for (let i = 1; i <= length; i += 1) {
    out += DIGITS[Math.floor(value / 83 ** (length - i)) % 83];
  }
  return out;
}

function decode83(text: string): number {
  let value = 0;
  for (const char of text) {
    const digit = DIGITS.indexOf(char);
    if (digit < 0) throw new Error('not a blurhash');
    value = value * 83 + digit;
  }
  return value;
}

function toLinear(value: number): number {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function toSrgb(value: number): number {
  const v = Math.max(0, Math.min(1, value));
  return v <= 0.0031308
    ? Math.trunc(v * 12.92 * 255 + 0.5)
    : Math.trunc((1.055 * v ** (1 / 2.4) - 0.055) * 255 + 0.5);
}

const signPow = (value: number, exp: number) => Math.sign(value) * Math.abs(value) ** exp;

/** Encodes RGBA pixels (row-major, 4 bytes each) with `x` × `y` components (1–9 each). */
export function encodeBlurhash(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  x = 4,
  y = 3,
): string {
  if (x < 1 || x > 9 || y < 1 || y > 9) throw new Error('blurhash components must be 1-9');
  if (pixels.length !== width * height * 4) throw new Error('pixels must be RGBA width × height');
  const factors: [number, number, number][] = [];
  for (let j = 0; j < y; j += 1) {
    for (let i = 0; i < x; i += 1) {
      const norm = i === 0 && j === 0 ? 1 : 2;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let py = 0; py < height; py += 1) {
        const cy = Math.cos((Math.PI * j * py) / height);
        for (let px = 0; px < width; px += 1) {
          const basis = norm * Math.cos((Math.PI * i * px) / width) * cy;
          const at = 4 * (px + py * width);
          r += basis * toLinear(pixels[at] ?? 0);
          g += basis * toLinear(pixels[at + 1] ?? 0);
          b += basis * toLinear(pixels[at + 2] ?? 0);
        }
      }
      const scale = 1 / (width * height);
      factors.push([r * scale, g * scale, b * scale]);
    }
  }
  const [dc, ...ac] = factors as [[number, number, number], ...[number, number, number][]];
  let hash = encode83(x - 1 + (y - 1) * 9, 1);
  let max = 1;
  if (ac.length > 0) {
    const actual = Math.max(...ac.flatMap((f) => f.map(Math.abs)));
    const quantised = Math.floor(Math.max(0, Math.min(82, Math.floor(actual * 166 - 0.5))));
    max = (quantised + 1) / 166;
    hash += encode83(quantised, 1);
  } else {
    hash += encode83(0, 1);
  }
  hash += encode83((toSrgb(dc[0]) << 16) + (toSrgb(dc[1]) << 8) + toSrgb(dc[2]), 4);
  for (const [r, g, b] of ac) {
    const q = (v: number) =>
      Math.floor(Math.max(0, Math.min(18, Math.floor(signPow(v / max, 0.5) * 9 + 9.5))));
    hash += encode83(q(r) * 19 * 19 + q(g) * 19 + q(b), 2);
  }
  return hash;
}

export function isBlurhash(hash: string): boolean {
  if (hash.length < 6) return false;
  try {
    const size = decode83(hash[0] ?? '');
    return hash.length === 4 + 2 * ((size % 9) + 1) * (Math.floor(size / 9) + 1);
  } catch {
    return false;
  }
}

/** Decodes to RGBA pixels of `width` × `height` (keep it small: 32 × 32 is plenty). */
export function decodeBlurhash(hash: string, width: number, height: number): Uint8ClampedArray {
  if (!isBlurhash(hash)) throw new Error('not a blurhash');
  const size = decode83(hash[0] ?? '');
  const ny = Math.floor(size / 9) + 1;
  const nx = (size % 9) + 1;
  const max = (decode83(hash[1] ?? '') + 1) / 166;
  const colours: [number, number, number][] = [];
  const dc = decode83(hash.slice(2, 6));
  colours.push([toLinear(dc >> 16), toLinear((dc >> 8) & 255), toLinear(dc & 255)]);
  for (let i = 1; i < nx * ny; i += 1) {
    const v = decode83(hash.slice(4 + i * 2, 6 + i * 2));
    colours.push([
      signPow((Math.floor(v / 361) - 9) / 9, 2) * max,
      signPow(((Math.floor(v / 19) % 19) - 9) / 9, 2) * max,
      signPow(((v % 19) - 9) / 9, 2) * max,
    ]);
  }
  const out = new Uint8ClampedArray(width * height * 4);
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < ny; j += 1) {
        const cy = Math.cos((Math.PI * py * j) / height);
        for (let i = 0; i < nx; i += 1) {
          const basis = Math.cos((Math.PI * px * i) / width) * cy;
          const c = colours[i + j * nx] ?? [0, 0, 0];
          r += c[0] * basis;
          g += c[1] * basis;
          b += c[2] * basis;
        }
      }
      const at = 4 * (px + py * width);
      out[at] = toSrgb(r);
      out[at + 1] = toSrgb(g);
      out[at + 2] = toSrgb(b);
      out[at + 3] = 255;
    }
  }
  return out;
}
