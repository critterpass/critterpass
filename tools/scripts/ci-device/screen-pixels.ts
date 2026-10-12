/**
 * Pixel reading and tuning shared by the screen checks (./screen-checks and its premium-ground and
 * inset-sheet rules, ./screen-checks-premium). Pure functions over decoded pixels.
 */
import type { RgbaImage } from './png';

export type Rgb = readonly [number, number, number];

/** Tuning, as fractions of the screen unless named otherwise. */
export const LIMITS = {
  /** Status bar and home indicator: never judged. */
  top: 0.07,
  bottom: 0.95,
  /** Two colours this close (largest channel difference) count as the same. */
  sameColour: 10,
  /** A screen's middle this close to a premium ground is drawn on it (capture noise only). */
  exactGround: 3,
  /** A frame is at least this thick, and at most this. */
  frameMin: 0.008,
  frameMax: 0.12,
  /** Share of the sampled rows that must show the frame. */
  frameRows: 0.6,
  /** The screen behind an open sheet scales to this, leaving (1 − .93) / 2 of the width per side. */
  presenterScale: 0.93,
  /** A sheet under a presenter-scale frame spans at least this much of the judged rows. */
  sheetRows: 0.08,
  /** The keyboard covers this much of the screen (a taller grey panel is a system sheet). */
  keyboardMin: 0.2,
  keyboardMax: 0.45,
  /** A band above the keyboard this tall or taller is reported. */
  bandMin: 0.02,
  /** Share of rows (in the content area) with anything on them, below which a screen is empty. */
  emptyRows: 0.24,
} as const;

export function pixel(image: RgbaImage, x: number, y: number): Rgb {
  const o = (Math.round(y) * image.width + Math.round(x)) * 4;
  return [image.data[o] ?? 0, image.data[o + 1] ?? 0, image.data[o + 2] ?? 0];
}

export function colourDistance(a: Rgb, b: Rgb): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

export function hex(colour: Rgb): string {
  return `#${colour.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export function parseHex(value: string): Rgb {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(value);
  if (!match) throw new Error(`Not a hex colour: ${value}`);
  return [
    parseInt(match[1] ?? '0', 16),
    parseInt(match[2] ?? '0', 16),
    parseInt(match[3] ?? '0', 16),
  ];
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** The most common colour among the samples (quantised, so noise and anti-aliasing merge). */
export function dominant(samples: readonly Rgb[]): Rgb {
  const counts = new Map<number, { count: number; colour: Rgb }>();
  for (const colour of samples) {
    const key = ((colour[0] >> 3) << 10) | ((colour[1] >> 3) << 5) | (colour[2] >> 3);
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { count: 1, colour });
  }
  let best: { count: number; colour: Rgb } = { count: 0, colour: [0, 0, 0] };
  for (const entry of counts.values()) if (entry.count > best.count) best = entry;
  return best.colour;
}

export function rowsBetween(image: RgbaImage, from: number, to: number, count: number): number[] {
  const start = Math.floor(image.height * from);
  const end = Math.floor(image.height * to);
  const step = Math.max(1, Math.floor((end - start) / count));
  const rows: number[] = [];
  for (let y = start; y < end; y += step) rows.push(y);
  return rows;
}

/** Pixels from `x` stepping by `dx` that stay the colour of the first, up to `limit`. */
export function run(image: RgbaImage, y: number, x: number, dx: 1 | -1, limit: number): number {
  const edge = pixel(image, x, y);
  let length = 0;
  while (length < limit && colourDistance(pixel(image, x + dx * length, y), edge) <= 6) length += 1;
  return length;
}

/** The exact colour seen most often (no quantising: flat token colours are what it looks for). */
export function commonest(samples: readonly Rgb[]): Rgb {
  const counts = new Map<number, { count: number; colour: Rgb }>();
  for (const colour of samples) {
    const key = (colour[0] << 16) | (colour[1] << 8) | colour[2];
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { count: 1, colour });
  }
  let best: { count: number; colour: Rgb } = { count: 0, colour: [0, 0, 0] };
  for (const entry of counts.values()) if (entry.count > best.count) best = entry;
  return best.colour;
}

export function rowSamples(
  image: RgbaImage,
  y: number,
  from = 0.02,
  to = 0.98,
  count = 100,
): Rgb[] {
  const samples: Rgb[] = [];
  for (let i = 0; i < count; i += 1) {
    samples.push(pixel(image, image.width * (from + ((to - from) * i) / (count - 1)), y));
  }
  return samples;
}
