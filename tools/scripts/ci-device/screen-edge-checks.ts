/**
 * Edge checks of the screen checks (./screen-checks), for two faults the founder found on device
 * that no runtime guard sees:
 *
 * - SHADOW_CUT: a soft shadow that stops in a straight line, the clip of the scroll row or box it
 *   sits in (a chip row's shadow cut flat under the chips, a pill's shadow cut by its row). Above
 *   the line the shadow is darker than the ground and fades softly left and right; below it the
 *   ground starts at once, flat. A shadow fades out on every side, so a hard horizontal edge across
 *   a soft, uneven darkening is a clip.
 * - CARD_AT_EDGE: a card set against the screen's edge: its rounded corners sit at (or within a
 *   couple of points of) the screen's side, where every card keeps the page gutter. A full-width
 *   band has square corners there, a sheet runs to the bottom, and a carousel's card that runs off
 *   the screen shows no corner at the edge: none of them is a card at the edge.
 *
 * Pure functions over decoded pixels; distances scale with the screen's width (393 pt wide).
 */
import type { RgbaImage } from './png';
import type { ScreenFinding } from './screen-checks';
import { colourDistance, hex, pixel, type Rgb } from './screen-pixels';

/** Tuning; distances in points (scaled by the screen's width), shares of the screen otherwise. */
const EDGE = {
  /** Rows judged: below the status bar, above the home indicator. */
  top: 0.08,
  bottom: 0.93,
  /** A shadow is this much darker than the ground just under its cut (luminance), at most. */
  shadowMin: 2,
  shadowMean: 3,
  shadowPeak: 4,
  shadowMax: 25,
  /** Rows of soft shadow above the cut, in points: they change by less than the cut itself. */
  softAbove: 2,
  /** Points of shadow above the cut that stay darker than the ground under it. */
  shadowRows: 3,
  /** A shadow thins out into the ground within this many points past either end of its cut. */
  fadeOut: 12,
  /** Rows of flat ground under the cut, in points. */
  flatBelow: 2,
  /** Stretches of a cut this close (points) are one line: noise, or a mark drawn over it. */
  gap: 40,
  /** A shadow takes at least this many points to reach its darkest from either thin end. */
  feather: 4,
  /** Past its end a shadow's step under the line is below this. */
  fadeStep: 3,
  /** Share of a cut's span that is on the line. */
  solid: 0.7,
  /** A cut runs across at least this share of the screen. */
  cutMin: 0.05,
  /** Grey: the largest channel spread of a shadow pixel. */
  neutral: 10,
  /** A card is read this far in from the side, and must still be the card this far in. */
  inner: 0.028,
  deep: 0.15,
  /** A card whose side comes within this share of the screen's edge sits at the edge. */
  gutterMin: 0.025,
  /** A card is at least this tall; its corner is at least this round, in points. */
  cardMin: 0.06,
  cardMax: 0.4,
  corner: 1.5,
  /** Two colours this close (largest channel difference) are the same paint. */
  same: 6,
  /** How far a card's gradient may drift from its paint at the middle. */
  gradient: 60,
  /** A card's paint differs from the ground around it by more than this. */
  cardContrast: 6,
} as const;

function luminance(colour: Rgb): number {
  return (colour[0] + colour[1] + colour[2]) / 3;
}

function spread(colour: Rgb): number {
  return Math.max(...colour) - Math.min(...colour);
}

/** Points to pixels on this screen. */
function pt(image: RgbaImage, points: number): number {
  return Math.max(1, Math.round((points * image.width) / 393));
}

interface CutRun {
  readonly xs: number[];
  readonly darkness: number[];
}

const first = (run: CutRun) => run.xs[0] ?? 0;
const last = (run: CutRun) => run.xs.at(-1) ?? 0;

/**
 * The stretches of row `y` where a soft shadow stops at a hard line under it: sampled columns
 * darker than the row under them by a shadow's step, with soft shadow above and flat ground below.
 * Stretches a little apart (noise, something drawn over the line) are one line.
 */
function cutRuns(image: RgbaImage, y: number, step: number): CutRun[] {
  const above = pt(image, EDGE.softAbove);
  const below = pt(image, EDGE.flatBelow);
  const join = pt(image, EDGE.gap);
  const runs: { xs: number[]; darkness: number[] }[] = [];
  for (let x = 0; x < image.width; x += step) {
    const at = pixel(image, x, y);
    const under = pixel(image, x, y + 1);
    const a = luminance(at);
    const b = luminance(under);
    const dark = b - a;
    const soft = Math.abs(a - luminance(pixel(image, x, y - above)));
    const flat = Math.abs(b - luminance(pixel(image, x, y + below)));
    const cut =
      dark >= EDGE.shadowMin &&
      dark <= EDGE.shadowMax &&
      soft + 1.5 <= dark &&
      flat <= 1.5 &&
      spread(at) <= EDGE.neutral &&
      spread(under) <= EDGE.neutral &&
      b >= 170;
    if (!cut) continue;
    const current = runs.at(-1);
    if (current !== undefined && x - (current.xs.at(-1) ?? 0) <= join) {
      current.xs.push(x);
      current.darkness.push(dark);
    } else {
      runs.push({ xs: [x], darkness: [dark] });
    }
  }
  return runs;
}

/** A cut line is a shadow's when it fades, along the row, into the very ground under the line. */
function isShadowCut(image: RgbaImage, y: number, run: CutRun): boolean {
  const peak = Math.max(...run.darkness);
  const mean = run.darkness.reduce((sum, value) => sum + value, 0) / run.darkness.length;
  if (peak < EDGE.shadowPeak || mean < EDGE.shadowMean) return false;
  const lum = (x: number, row: number) => luminance(pixel(image, x, row));
  const under = run.xs.map((x) => lum(x, y + 1)).sort((a, b) => a - b);
  const ground = under[Math.floor(under.length / 2)] ?? 0;
  // The shadow is a band, not a line: the rows above the cut, at its darkest, stay darker.
  const darkest = run.xs[run.darkness.indexOf(peak)] ?? first(run);
  for (let k = 1; k <= pt(image, EDGE.shadowRows); k += 1)
    if (ground - lum(darkest, y - k) < 2) return false;
  // Past an end that is on the screen the shadow thins out into that ground, with no step under
  // it, within a few points; and it is thinner toward that end than at its darkest.
  const reach = pt(image, EDGE.fadeOut);
  const fadesOut = (end: number, toward: 1 | -1) => {
    for (let x = end + toward; Math.abs(x - end) <= reach; x += toward) {
      if (x < 0 || x >= image.width) return false;
      const here = lum(x, y);
      if (Math.abs(here - ground) <= 3 && lum(x, y + 1) - here < EDGE.fadeStep) return true;
    }
    return false;
  };
  // A shadow feathers: from its thin end it takes a few points to reach its darkest, where a
  // filled shape's edge (a pill's bottom) is at full strength a point in from its corner.
  const feathers = (index: (k: number) => number) => {
    const at = (k: number) => run.darkness[index(k)] ?? 0;
    if (at(0) > peak * 0.6) return false;
    for (let k = 0; k < run.darkness.length; k += 1)
      if (at(k) >= peak * 0.8)
        return (
          Math.abs((run.xs[index(k)] ?? 0) - (run.xs[index(0)] ?? 0)) >= pt(image, EDGE.feather)
        );
    return false;
  };
  const n = run.darkness.length;
  const ends = [
    { at: first(run), toward: -1 as const, index: (k: number) => k },
    { at: last(run), toward: 1 as const, index: (k: number) => n - 1 - k },
  ].filter((end) => end.at + end.toward * reach >= 0 && end.at + end.toward * reach < image.width);
  if (ends.length === 0) return false;
  return ends.every((end) => fadesOut(end.at, end.toward) && feathers(end.index));
}

export function findShadowCut(image: RgbaImage): ScreenFinding | null {
  const step = Math.max(1, Math.round(image.width / 400));
  const minWidth = image.width * EDGE.cutMin;
  const from = Math.floor(image.height * EDGE.top);
  const to = Math.floor(image.height * EDGE.bottom);
  for (let y = from; y < to; y += 1) {
    for (const run of cutRuns(image, y, step)) {
      const span = last(run) - first(run);
      // A line, not glyph bottoms along a row of text: most of its span is on the cut.
      if (span < minWidth || run.xs.length * step < span * EDGE.solid) continue;
      if (!isShadowCut(image, y, run)) continue;
      const peak = Math.max(...run.darkness);
      return {
        code: 'SHADOW_CUT',
        detail: `a shadow stops in a straight line at y=${String(y + 1)} from x=${String(first(run))} to ${String(last(run))}: up to ${String(Math.round(peak))} darker than the ground right under it`,
      };
    }
  }
  return null;
}

/** The rows `[top, bottom]` around `y` in column `x` that are not `ground` (a card's rows). */
function offGround(image: RgbaImage, x: number, y: number, ground: Rgb): [number, number] {
  const off = (row: number) => colourDistance(pixel(image, x, row), ground) > EDGE.cardContrast;
  let top = y;
  let bottom = y;
  while (top > 0 && off(top - 1)) top -= 1;
  while (bottom < image.height - 1 && off(bottom + 1)) bottom += 1;
  return [top, bottom];
}

/** Row `y` from column `a` to `b` is `ground` almost all the way. */
function isPlainRow(image: RgbaImage, y: number, a: number, b: number, ground: Rgb): boolean {
  const from = Math.min(a, b);
  const to = Math.max(a, b);
  let plain = 0;
  for (let x = from; x <= to; x += 1)
    if (colourDistance(pixel(image, x, y), ground) <= EDGE.same) plain += 1;
  return plain >= (to - from + 1) * 0.9;
}

/** A card with rounded corners whose side sits at the screen's edge, on one side. */
function cardAtSide(image: RgbaImage, side: 'left' | 'right', above: number): ScreenFinding | null {
  const { width, height } = image;
  const toward = side === 'left' ? -1 : 1;
  const column = (share: number) =>
    side === 'left' ? Math.round(width * share) : width - 1 - Math.round(width * share);
  const inner = column(EDGE.inner);
  const deep = column(EDGE.deep);
  const corner = pt(image, EDGE.corner);
  const lead = pt(image, 2);
  const top = Math.floor(height * EDGE.top);
  const last = Math.min(Math.floor(height * EDGE.bottom), above);
  for (let y = top + lead; y < last; y += 1) {
    // A card's top edge: the row turns from the ground above it to something else.
    const ground = pixel(image, inner, y - lead);
    if (colourDistance(pixel(image, inner, y), ground) <= EDGE.cardContrast) continue;
    if (colourDistance(pixel(image, inner, y - 1), ground) > EDGE.same) continue;
    const [start, end] = offGround(image, inner, y, ground);
    y = end;
    // A page's ground, not a map or a photo: one colour across the row above the card (above
    // its corner's curve, which starts higher further in).
    const [deepStart] = offGround(image, deep, Math.round((start + end) / 2), ground);
    const groundRow = Math.min(start, deepStart) - lead;
    if (groundRow < 0 || !isPlainRow(image, groundRow, inner, deep, ground)) continue;
    if (end - start < height * EDGE.cardMin || end - start > height * EDGE.cardMax) continue;
    if (end >= last) continue;
    const middle = Math.round((start + end) / 2);
    // Under it the same ground, or the card's own shadow on it.
    if (colourDistance(pixel(image, inner, end + lead), ground) > EDGE.shadowMax) continue;
    // A card, not a mark at the edge: still card, not ground, well in from the side.
    if (colourDistance(pixel(image, deep, middle), ground) <= EDGE.cardContrast) continue;
    // Its side: the last column off the ground toward the screen's edge, on its middle row.
    let edge = inner;
    while (edge + toward >= 0 && edge + toward < width) {
      if (colourDistance(pixel(image, edge + toward, middle), ground) <= EDGE.cardContrast) break;
      edge += toward;
    }
    const gutter = side === 'left' ? edge : width - 1 - edge;
    if (gutter > width * EDGE.gutterMin) continue;
    // Rounded: at its side the card starts lower and ends higher than further in, and the ground
    // shows in its corners.
    const [outerStart, outerEnd] = offGround(image, edge, middle, ground);
    if (outerStart - start < corner || end - outerEnd < corner) continue;
    return {
      code: 'CARD_AT_EDGE',
      detail: `a ${hex(pixel(image, inner, middle))} card from y=${String(start)} to ${String(end)} has its rounded ${side} side ${String(gutter)}px from the screen's edge, with no gutter (the ground is ${hex(ground)})`,
    };
  }
  return null;
}

/** `above` is the first row not judged: the keyboard's top when one is up (its keys are cards). */
export function findCardAtEdge(image: RgbaImage, above = image.height): ScreenFinding | null {
  return cardAtSide(image, 'left', above) ?? cardAtSide(image, 'right', above);
}
