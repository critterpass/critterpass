/**
 * Pixel checks on every screenshot a device shard captures, for layout faults a reviewer spots at a
 * glance but no runtime guard sees:
 *
 * - SCREEN_FRAME: the screen sits in a frame (an inset card, a dark border): both side edges are
 *   one colour that isn't the app background, and it gives way to the screen at the same inset on
 *   both sides, down most of the screen.
 * - KEYBOARD_BAND: with the keyboard up, a full-width band of one colour that isn't the screen's
 *   background sits right above it (the keyboard pushed a footer up and left a black gap).
 * - EMPTY_SCREEN: almost every row of the screen is bare background (content that never drew).
 *
 * Pure functions over decoded pixels, so they run on the shards without the workspace installed.
 */
import type { RgbaImage } from './png';

export type ScreenCheckCode = 'SCREEN_FRAME' | 'KEYBOARD_BAND' | 'EMPTY_SCREEN';

export interface ScreenFinding {
  readonly code: ScreenCheckCode;
  readonly detail: string;
}

export type Rgb = readonly [number, number, number];

export interface ScreenCheckOptions {
  /** The app's screen background (`semantic.bg.base`). */
  readonly background: Rgb;
  /** The screen is sparse on purpose (./sparse-by-design): no EMPTY_SCREEN check. */
  readonly sparseByDesign?: boolean;
}

/** Tuning, as fractions of the screen unless named otherwise. */
export const LIMITS = {
  /** Status bar and home indicator: never judged. */
  top: 0.07,
  bottom: 0.95,
  /** Two colours this close (largest channel difference) count as the same. */
  sameColour: 10,
  /** A frame is at least this thick, and at most this. */
  frameMin: 0.008,
  frameMax: 0.12,
  /** Share of the sampled rows that must show the frame. */
  frameRows: 0.6,
  /** The keyboard covers this much of the screen (a taller grey panel is a system sheet). */
  keyboardMin: 0.2,
  keyboardMax: 0.45,
  /** A band above the keyboard this tall or taller is reported. */
  bandMin: 0.02,
  /** Share of rows (in the content area) with anything on them, below which a screen is empty. */
  emptyRows: 0.24,
} as const;

function pixel(image: RgbaImage, x: number, y: number): Rgb {
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

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** The most common colour among the samples (quantised, so noise and anti-aliasing merge). */
function dominant(samples: readonly Rgb[]): Rgb {
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

function rowsBetween(image: RgbaImage, from: number, to: number, count: number): number[] {
  const start = Math.floor(image.height * from);
  const end = Math.floor(image.height * to);
  const step = Math.max(1, Math.floor((end - start) / count));
  const rows: number[] = [];
  for (let y = start; y < end; y += step) rows.push(y);
  return rows;
}

/** Pixels from `x` stepping by `dx` that stay the colour of the first, up to `limit`. */
function run(image: RgbaImage, y: number, x: number, dx: 1 | -1, limit: number): number {
  const edge = pixel(image, x, y);
  let length = 0;
  while (length < limit && colourDistance(pixel(image, x + dx * length, y), edge) <= 6) length += 1;
  return length;
}

export function findFrame(image: RgbaImage, options: ScreenCheckOptions): ScreenFinding | null {
  const { width } = image;
  const min = Math.max(2, width * LIMITS.frameMin);
  const max = width * LIMITS.frameMax;
  // Above the keyboard, when one is up: its tray runs to both edges.
  const keyboard = keyboardTop(image);
  const rows = rowsBetween(image, 0.12, keyboard === null ? 0.88 : keyboard / image.height, 200);
  const insets: number[] = [];
  const edges: Rgb[] = [];
  for (const y of rows) {
    const left = pixel(image, 0, y);
    const right = pixel(image, width - 1, y);
    if (colourDistance(left, options.background) <= LIMITS.sameColour) continue;
    if (colourDistance(left, right) > LIMITS.sameColour) continue;
    const l = run(image, y, 0, 1, Math.ceil(max) + 1);
    const r = run(image, y, width - 1, -1, Math.ceil(max) + 1);
    if (l < min || l > max || r < min || r > max) continue;
    if (Math.abs(l - r) > Math.max(2, width * 0.01)) continue;
    insets.push(l);
    edges.push(left);
  }
  if (insets.length < rows.length * LIMITS.frameRows) return null;
  const inset = median(insets);
  const steady = insets.filter((value) => Math.abs(value - inset) <= Math.max(2, width * 0.005));
  if (steady.length < rows.length * LIMITS.frameRows * 0.8) return null;
  return {
    code: 'SCREEN_FRAME',
    detail: `a ${hex(dominant(edges))} frame ${String(Math.round(inset))}px wide runs down both sides (${String(Math.round((insets.length / rows.length) * 100))}% of the screen); the screen background is ${hex(options.background)}`,
  };
}

function rowSamples(image: RgbaImage, y: number, from = 0.02, to = 0.98, count = 100): Rgb[] {
  const samples: Rgb[] = [];
  for (let i = 0; i < count; i += 1) {
    samples.push(pixel(image, image.width * (from + ((to - from) * i) / (count - 1)), y));
  }
  return samples;
}

/** An on-screen keyboard row: grey through (keys, labels, the tray), never near-black. */
function isKeyboardRow(image: RgbaImage, y: number): boolean {
  const samples = rowSamples(image, y, 0.06, 0.94, 60);
  const neutral = samples.filter(
    (c) => Math.max(...c) - Math.min(...c) <= 16 && Math.max(...c) >= 24,
  );
  return neutral.length >= samples.length * 0.7;
}

/** The first row of the on-screen keyboard, or null when none is up. */
export function keyboardTop(image: RgbaImage): number | null {
  const { height } = image;
  let top: number | null = null;
  let misses = 0;
  const maxMisses = Math.ceil(height * 0.01);
  for (let y = Math.floor(height * 0.93); y > height * 0.3; y -= 1) {
    if (isKeyboardRow(image, y)) {
      top = y;
      misses = 0;
    } else if (top !== null) {
      misses += 1;
      if (misses > maxMisses) break;
    } else if (y < height * 0.85) {
      return null;
    }
  }
  if (top === null) return null;
  const share = (height - top) / height;
  if (share < LIMITS.keyboardMin || share > LIMITS.keyboardMax) return null;
  return top;
}

function uniformColour(image: RgbaImage, y: number): Rgb | null {
  const samples = rowSamples(image, y);
  const colour = dominant(samples);
  const same = samples.filter((c) => colourDistance(c, colour) <= LIMITS.sameColour);
  return same.length >= samples.length * 0.95 ? colour : null;
}

export function findKeyboardBand(image: RgbaImage): ScreenFinding | null {
  const top = keyboardTop(image);
  if (top === null) return null;
  // The keyboard's rounded top corners show what is behind them: start just above them.
  let y = top - 1;
  while (y > top - image.height * 0.02 && uniformColour(image, y) === null) y -= 1;
  const bandColour = uniformColour(image, y);
  if (bandColour === null) return null;
  let bottom = y;
  while (y > 0) {
    const colour = uniformColour(image, y - 1);
    if (colour === null || colourDistance(colour, bandColour) > LIMITS.sameColour) break;
    y -= 1;
  }
  const height = bottom - y + 1;
  if (height < image.height * LIMITS.bandMin) return null;
  // The screen's own background: its most common colour between the status bar and the band.
  const above = rowsBetween(image, 0.1, Math.max(0.11, y / image.height - 0.01), 80);
  const screen = dominant(above.flatMap((row) => rowSamples(image, row, 0.02, 0.98, 40)));
  if (colourDistance(screen, bandColour) <= LIMITS.sameColour) return null;
  bottom = Math.round((height / image.height) * 1000) / 10;
  return {
    code: 'KEYBOARD_BAND',
    detail: `a ${hex(bandColour)} band ${String(height)}px tall (${String(bottom)}% of the screen) sits above the keyboard on a ${hex(screen)} screen`,
  };
}

export function findEmptyScreen(image: RgbaImage): ScreenFinding | null {
  // With the keyboard up a field has focus: the screen is doing its job however bare it looks.
  if (keyboardTop(image) !== null) return null;
  const rows = rowsBetween(image, 0.1, LIMITS.bottom, 300);
  const background = dominant(rows.flatMap((y) => rowSamples(image, y, 0.02, 0.98, 40)));
  let occupied = 0;
  for (const y of rows) {
    const samples = rowSamples(image, y, 0.02, 0.98, 200);
    const ink = samples.filter((c) => colourDistance(c, background) > 10).length;
    if (ink >= 2) occupied += 1;
  }
  const share = occupied / rows.length;
  if (share >= LIMITS.emptyRows) return null;
  return {
    code: 'EMPTY_SCREEN',
    detail: `only ${String(Math.round(share * 100))}% of the screen's rows show anything on ${hex(background)}`,
  };
}

export function checkScreen(image: RgbaImage, options: ScreenCheckOptions): ScreenFinding[] {
  const empty = options.sparseByDesign === true ? null : findEmptyScreen(image);
  return [findFrame(image, options), findKeyboardBand(image), empty].filter(
    (finding): finding is ScreenFinding => finding !== null,
  );
}
