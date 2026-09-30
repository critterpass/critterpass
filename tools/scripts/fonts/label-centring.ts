/**
 * Measures how far each label's cap box sits from its component's vertical centre in a type lab
 * capture (apps/mobile/src/ui/text/dev/TypeLabScene.tsx, a page without guides).
 *
 * The page draws key colours this reads back: a 200 pt calibration bar (pixels per point), and per
 * row a bar spanning the component's height on its left and a bar the height of the ideal cap box
 * on its right. The label's baseline is where most of its ink columns end (marks below the line,
 * Thai tails and descenders sit out of the vote), and its cap box is the right bar's height above
 * that baseline. The offset is the cap box's centre minus the component's centre, in points:
 * positive sits low, negative high.
 *
 * Usage: pnpm tsx tools/scripts/fonts/label-centring.ts <capture.png>...
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { decodePng, type RgbaImage } from '../ci-device/png';

type Rgb = readonly [number, number, number];

const CALIBRATION: Rgb = [0, 255, 0];
const COMPONENT: Rgb = [255, 0, 255];
const CAP_BOX: Rgb = [0, 255, 255];
const CALIBRATION_PT = 200;
const GAP_PT = 6;
/** A key colour survives screenshot colour conversion within this per-channel distance. */
const KEY_TOLERANCE = 40;
/** A pixel this far (largest channel difference) from the component's fill is ink. */
const INK_THRESHOLD = 48;

export interface RowOffset {
  /** Row position on the page, from the top. */
  readonly index: number;
  /** Component top and bottom edges, in pixels. */
  readonly top: number;
  readonly bottom: number;
  /** The label's baseline edge, in pixels. */
  readonly baseline: number;
  /** Ideal cap box height, in pixels. */
  readonly capPx: number;
  /** Cap box centre minus component centre, in points (positive: below the centre). */
  readonly offsetPt: number;
}

export interface PageOffsets {
  /** Pixels per point. */
  readonly scale: number;
  readonly rows: readonly RowOffset[];
}

function pixel(image: RgbaImage, x: number, y: number): Rgb {
  const at = (y * image.width + x) * 4;
  return [image.data[at] ?? 0, image.data[at + 1] ?? 0, image.data[at + 2] ?? 0];
}

function distance(a: Rgb, b: Rgb): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

function isKey(image: RgbaImage, x: number, y: number, key: Rgb): boolean {
  return distance(pixel(image, x, y), key) <= KEY_TOLERANCE;
}

function calibrationScale(image: RgbaImage): number {
  let left = Infinity;
  let right = -Infinity;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (!isKey(image, x, y, CALIBRATION)) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  if (right < left) throw new Error('no calibration bar on this capture');
  return (right - left + 1) / CALIBRATION_PT;
}

/** Vertical runs of `key` in column `x`, as [first, last] rows, at least `minLength` tall. */
function runs(image: RgbaImage, x: number, key: Rgb, from: number, to: number, minLength: number) {
  const found: [number, number][] = [];
  let start = -1;
  for (let y = from; y <= to; y += 1) {
    const hit = y < to && isKey(image, x, y, key);
    if (hit && start < 0) start = y;
    if (!hit && start >= 0) {
      if (y - start >= minLength) found.push([start, y - 1]);
      start = -1;
    }
  }
  return found;
}

function mostCommon(values: readonly number[]): number | undefined {
  const counts = new Map<number, number>();
  let best: number | undefined;
  let bestCount = 0;
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function fillColour(image: RgbaImage, x0: number, x1: number, y0: number, y1: number): Rgb {
  const counts = new Map<number, number>();
  let best = 0;
  let bestCount = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const [r, g, b] = pixel(image, x, y);
      const packed = (r << 16) | (g << 8) | b;
      const count = (counts.get(packed) ?? 0) + 1;
      counts.set(packed, count);
      if (count > bestCount) {
        best = packed;
        bestCount = count;
      }
    }
  }
  return [(best >> 16) & 255, (best >> 8) & 255, best & 255];
}

function measureRow(
  image: RgbaImage,
  scale: number,
  barX: number,
  [top, bottom]: [number, number],
  index: number,
): RowOffset | null {
  const middle = Math.round((top + bottom) / 2);
  let barRight = barX;
  while (barRight < image.width && isKey(image, barRight, middle, COMPONENT)) barRight += 1;

  // The cap box bar: the first cyan column right of the component.
  let capX = -1;
  for (let x = barRight; x < image.width && capX < 0; x += 1) {
    for (let y = top; y <= bottom; y += 1) {
      if (isKey(image, x, y, CAP_BOX)) {
        capX = x;
        break;
      }
    }
  }
  if (capX < 0) return null;
  const capRun = runs(image, capX, CAP_BOX, top, bottom + 1, 1)[0];
  if (!capRun) return null;

  const gap = Math.round(GAP_PT * scale);
  const left = barRight + gap;
  const right = capX - gap - 1;
  const width = right - left + 1;
  const height = bottom - top + 1;
  // The label sits mid-component: skip rounded ends, borders and selection rings.
  const x0 = left + Math.floor(width / 4);
  const x1 = right - Math.floor(width / 4);
  const inset = Math.max(Math.round(3 * scale), Math.round(height * 0.15));
  const y0 = top + inset;
  const y1 = bottom - inset;
  if (x1 <= x0 || y1 <= y0) return null;

  const fill = fillColour(image, x0, x1, y0, y1);
  const bottoms: number[] = [];
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y1; y >= y0; y -= 1) {
      if (distance(pixel(image, x, y), fill) > INK_THRESHOLD) {
        bottoms.push(y);
        break;
      }
    }
  }
  const lowest = mostCommon(bottoms);
  if (lowest === undefined || bottoms.length < 3) return null;

  const baseline = lowest + 1;
  const capPx = capRun[1] - capRun[0] + 1;
  const capCentre = baseline - capPx / 2;
  const componentCentre = (top + bottom + 1) / 2;
  return {
    index,
    top,
    bottom: bottom + 1,
    baseline,
    capPx,
    offsetPt: Math.round(((capCentre - componentCentre) / scale) * 100) / 100,
  };
}

/** Every measurable row of one capture, top to bottom. */
export function measureLabelOffsets(image: RgbaImage): PageOffsets {
  const scale = calibrationScale(image);
  // The component bars share one column: the one with the most component-key pixels.
  let barX = -1;
  let most = 0;
  for (let x = 0; x < image.width / 3; x += 1) {
    let count = 0;
    for (let y = 0; y < image.height; y += 1) if (isKey(image, x, y, COMPONENT)) count += 1;
    if (count > most) {
      most = count;
      barX = x;
    }
  }
  if (barX < 0) return { scale, rows: [] };
  const rows = runs(image, barX, COMPONENT, 0, image.height, Math.round(8 * scale))
    .map((run, index) => measureRow(image, scale, barX, run, index))
    .filter((row): row is RowOffset => row !== null);
  return { scale, rows };
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  for (const file of process.argv.slice(2)) {
    const { scale, rows } = measureLabelOffsets(decodePng(readFileSync(file)));
    for (const row of rows) {
      console.log(
        [path.basename(file), row.index, row.offsetPt.toFixed(2), scale.toFixed(3)].join('\t'),
      );
    }
  }
}
