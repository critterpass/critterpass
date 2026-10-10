/** Colour helpers for derived premium values (glass fills on platforms without a blur). */

interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const HEX = /^#([0-9a-f]{6})$/i;
const RGBA = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/;

function parse(value: string): Rgba {
  const hex = HEX.exec(value)?.[1];
  if (hex !== undefined) {
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff, a: 1 };
  }
  const fn = RGBA.exec(value);
  if (fn) {
    return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]), a: Number(fn[4] ?? 1) };
  }
  throw new Error(`design-tokens: cannot parse premium colour "${value}"`);
}

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');

/** `top` (any alpha) painted over the opaque `base`, as an opaque `#rrggbb`. */
export function compositeOver(top: string, base: string): string {
  const t = parse(top);
  const b = parse(base);
  if (b.a !== 1) throw new Error(`design-tokens: composite base "${base}" must be opaque`);
  const mix = (front: number, back: number) => front * t.a + back * (1 - t.a);
  return `#${hex2(mix(t.r, b.r))}${hex2(mix(t.g, b.g))}${hex2(mix(t.b, b.b))}`;
}
