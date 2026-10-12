/**
 * Pixel checks on every screenshot a device shard captures, for layout faults a reviewer spots at a
 * glance but no runtime guard sees:
 *
 * - SCREEN_FRAME: the screen sits in a frame (an inset card, a dark border): both side edges are
 *   one colour that isn't the screen's ground, and it gives way to the screen at the same inset on
 *   both sides, down most of the screen. The ground is the current UI's background, or the premium
 *   UI's grounds (page and card, light or dark) on a screen drawn on them, judged by the colour that
 *   fills the screen's middle. The designed presenter scale under an open sheet (.93,
 *   docs/design-system.md) is allowed: an inset of that size that stops where a full-width sheet
 *   starts, rather than running on down the sheet's sides. So is an iOS 26 inset sheet over the
 *   dimmed page: the dimmed page runs on above the sheet's top, where no screen sits inside it.
 * - KEYBOARD_BAND: with the keyboard up, a full-width band of one colour that isn't the screen's
 *   background sits right above it (the keyboard pushed a footer up and left a black gap).
 * - EMPTY_SCREEN: almost every row of the screen is bare background (content that never drew).
 *
 * Pure functions over decoded pixels, so they run on the shards without the workspace installed.
 */
import type { RgbaImage } from './png';
import { isInsetSheetOverDimmedPage, screenGrounds } from './screen-checks-premium';
import {
  colourDistance,
  dominant,
  hex,
  LIMITS,
  median,
  pixel,
  rowSamples,
  rowsBetween,
  run,
  type Rgb,
} from './screen-pixels';

export { colourDistance, hex, LIMITS, parseHex, type Rgb } from './screen-pixels';
export { screenGrounds } from './screen-checks-premium';

export type ScreenCheckCode = 'SCREEN_FRAME' | 'KEYBOARD_BAND' | 'EMPTY_SCREEN';

export interface ScreenFinding {
  readonly code: ScreenCheckCode;
  readonly detail: string;
}

/** The colours a UI's screen can show to the screen's edges: its page ground and its card. */
export type Grounds = readonly Rgb[];

export interface ScreenCheckOptions {
  /** The app's screen background (`semantic.bg.base`). */
  readonly background: Rgb;
  /** The premium UI's grounds per scheme: a screen drawn on one is judged by it. */
  readonly premiumGrounds?: readonly Grounds[];
  /** The screen is sparse on purpose (./sparse-by-design): no EMPTY_SCREEN check. */
  readonly sparseByDesign?: boolean;
}

/**
 * The designed look of a screen under an open sheet: the frame is the presenter-scale inset, and
 * below the last row whose edges show the frame's colour the sheet runs edge to edge for the rest
 * of the judged rows (its own inset content, such as row separators, may look like a frame). A
 * frame that carries on down the sheet's sides is still a frame.
 */
function isPresenterUnderSheet(
  image: RgbaImage,
  rows: readonly number[],
  inset: number,
  frameColour: Rgb,
): boolean {
  const presenterInset = (image.width * (1 - LIMITS.presenterScale)) / 2;
  if (Math.abs(inset - presenterInset) > Math.max(2, image.width * 0.01)) return false;
  const framed = (y: number) =>
    colourDistance(pixel(image, 0, y), frameColour) <= LIMITS.sameColour ||
    colourDistance(pixel(image, image.width - 1, y), frameColour) <= LIMITS.sameColour;
  let last = -1;
  for (const [index, y] of rows.entries()) if (framed(y)) last = index;
  const below = rows.slice(last + 1);
  if (below.length === 0) return false;
  const span = ((below.at(-1) ?? 0) - (below[0] ?? 0)) / image.height;
  if (span < LIMITS.sheetRows) return false;
  return true;
}

/**
 * A sheet's own surface around a content card set in by the gutter (the pitch sheet): the "frame"
 * starts partway down, under a band where both edges show the dimmed screen behind the sheet, and
 * then runs to the bottom. A frame drawn around the whole screen starts at the top instead.
 */
function isSheetAroundInsetCard(
  image: RgbaImage,
  rows: readonly number[],
  frameColour: Rgb,
): boolean {
  const onFrame = (y: number) =>
    colourDistance(pixel(image, 0, y), frameColour) <= LIMITS.sameColour &&
    colourDistance(pixel(image, image.width - 1, y), frameColour) <= LIMITS.sameColour;
  const first = rows.findIndex(onFrame);
  if (first < 0) return false;
  const topRows = rowsBetween(image, LIMITS.top, (rows[first] ?? 0) / image.height, 40);
  const behind = topRows.filter((y) => {
    const left = pixel(image, 0, y);
    return (
      colourDistance(left, frameColour) > LIMITS.sameColour &&
      colourDistance(left, pixel(image, image.width - 1, y)) <= LIMITS.sameColour
    );
  });
  if (behind.length < 3 || behind.length < topRows.length * 0.8) return false;
  const below = rows.slice(first);
  return below.filter(onFrame).length >= below.length * 0.9;
}

export function findFrame(image: RgbaImage, options: ScreenCheckOptions): ScreenFinding | null {
  const { width } = image;
  const min = Math.max(2, width * LIMITS.frameMin);
  const max = width * LIMITS.frameMax;
  // Above the keyboard, when one is up: its tray runs to both edges.
  const keyboard = keyboardTop(image);
  const rows = rowsBetween(image, 0.12, keyboard === null ? 0.88 : keyboard / image.height, 200);
  const grounds = screenGrounds(image, rows, options);
  const isGround = (colour: Rgb) =>
    grounds.some((ground) => colourDistance(colour, ground) <= LIMITS.sameColour);
  const insets: number[] = [];
  const edges: Rgb[] = [];
  for (const y of rows) {
    const left = pixel(image, 0, y);
    const right = pixel(image, width - 1, y);
    if (isGround(left)) continue;
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
  const frameColour = dominant(edges);
  if (isPresenterUnderSheet(image, rows, inset, frameColour)) return null;
  if (isSheetAroundInsetCard(image, rows, frameColour)) return null;
  if (isInsetSheetOverDimmedPage(image, rows, inset, frameColour)) return null;
  return {
    code: 'SCREEN_FRAME',
    detail: `a ${hex(dominant(edges))} frame ${String(Math.round(inset))}px wide runs down both sides (${String(Math.round((insets.length / rows.length) * 100))}% of the screen); the screen background is ${hex(grounds[0] ?? options.background)}`,
  };
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

/** The left margin (2% in) of the `span` rows above `bandTop` is `colour` almost all the way. */
function isMarginAbove(image: RgbaImage, bandTop: number, span: number, colour: Rgb): boolean {
  const from = Math.max(Math.floor(image.height * LIMITS.top), bandTop - span);
  if (from >= bandTop) return false;
  let same = 0;
  for (let y = from; y < bandTop; y += 1) {
    if (colourDistance(pixel(image, image.width * 0.02, y), colour) <= LIMITS.sameColour) same += 1;
  }
  return same >= (bandTop - from) * 0.9;
}

/** The keyboard's own tray, at its left edge just under its first row (below the rounded corner). */
function keyboardSurface(image: RgbaImage, top: number): Rgb {
  return pixel(image, image.width * 0.005, Math.min(image.height - 1, top + image.height * 0.01));
}

export function findKeyboardBand(image: RgbaImage): ScreenFinding | null {
  const top = keyboardTop(image);
  if (top === null) return null;
  // The keyboard's rounded top corners show what is behind them: start just above them.
  let y = top - 1;
  while (y > top - image.height * 0.02 && uniformColour(image, y) === null) y -= 1;
  const bandColour = uniformColour(image, y);
  if (bandColour === null) return null;
  // iOS 26 draws the empty suggestion strip above the keys in the tray's own tint, which reads as
  // not quite neutral: that strip is the keyboard, not a gap above it.
  if (colourDistance(bandColour, keyboardSurface(image, top)) <= LIMITS.sameColour) return null;
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
  // A sheet's own surface reaching the keyboard is no gap, even when a card above it covers more
  // of the screen than the surface does: the band's colour is then the left margin of the rows
  // just above it, the surface the content sits on. A gap under a lifted footer differs from that
  // margin (the footer stands on the screen's background).
  if (isMarginAbove(image, y, height, bandColour)) return null;
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
