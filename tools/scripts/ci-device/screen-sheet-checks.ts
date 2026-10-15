/**
 * The sheet check of the screen checks (./screen-checks):
 *
 * - SHEET_TOP_GAP: an open sheet shows a tall empty band under its grabber before its first
 *   content (the screen's top safe-area inset applied again inside the sheet, or a sheet whose
 *   body never drew). A sheet's header row sits right under the grabber by design.
 *
 * The sheet is found by its grabber: a short centred pill near a surface's top edge, on the
 * surface's own colour on both sides, with the page behind showing just above it. A sheet drawn
 * without one is found by its top edge: a premium ground or card running across the screen below
 * a band of something that is not a premium ground (the dimmed page, a photo), where a card on a
 * page has the page's own ground above it.
 */
import type { RgbaImage } from './png';
import type { Grounds } from './screen-checks';
import { colourDistance, hex, LIMITS, pixel, rowSamples, type Rgb } from './screen-pixels';

export interface SheetGrabber {
  /** Its first and last rows. */
  readonly top: number;
  readonly bottom: number;
  readonly surface: Rgb;
}

/** Tuning, as fractions of the screen. */
const SHEET = {
  /** Where a grabber can sit: below the status bar, in the top half (a short detent). */
  from: 0.02,
  to: 0.6,
  /** A grabber is a flat pill, 36 pt wide (wider on iOS 26) and 5 pt tall on a phone. */
  minWidth: 0.06,
  maxWidth: 0.18,
  maxHeight: 0.012,
  minAspect: 5,
  /** The sheet's top edge sits this close above its grabber. */
  edgeAbove: 0.03,
  /** Where the surface is read beside the grabber. */
  beside: 0.12,
  /** A pill is drawn in its own colour, at least this far from the surface. */
  grabberContrast: 12,
  /** Empty sheet under the grabber, more than this, is reported. */
  maxGap: 0.05,
} as const;

function same(a: Rgb, b: Rgb, limit: number = LIMITS.sameColour): boolean {
  return colourDistance(a, b) <= limit;
}

function runFrom(image: RgbaImage, x: number, y: number, dx: 1 | -1, colour: Rgb, max: number) {
  let length = 0;
  while (
    length < max &&
    same(pixel(image, x + dx * (length + 1), y), colour, SHEET.grabberContrast)
  )
    length += 1;
  return length;
}

function grabberAt(image: RgbaImage, y: number): SheetGrabber | null {
  const { width, height } = image;
  const cx = Math.round(width / 2);
  const centre = pixel(image, cx, y);
  const left = pixel(image, cx - width * SHEET.beside, y);
  const right = pixel(image, cx + width * SHEET.beside, y);
  if (!same(left, right) || same(centre, left, SHEET.grabberContrast)) return null;
  const max = Math.ceil(width * SHEET.maxWidth);
  const l = runFrom(image, cx, y, -1, centre, max);
  const r = runFrom(image, cx, y, 1, centre, max);
  const span = l + r + 1;
  if (span < width * SHEET.minWidth || span > width * SHEET.maxWidth) return null;
  if (Math.abs(l - r) > Math.max(2, width * 0.01)) return null;
  // The surface right round the pill: above it, below it and past both ends. A circle's rim seen
  // at its foot (a badge, a send target) has the circle's inside above it instead.
  if (!same(pixel(image, cx, y - 1), left)) return null;
  if (!same(pixel(image, cx - l - 2, y), left) || !same(pixel(image, cx + r + 2, y), left))
    return null;
  let bottom = y;
  while (bottom - y < height * SHEET.maxHeight && !same(pixel(image, cx, bottom + 1), left))
    bottom += 1;
  if (bottom - y >= height * SHEET.maxHeight) return null;
  if (span < (bottom - y + 1) * SHEET.minAspect) return null;
  if (!same(pixel(image, cx, bottom + 2), left)) return null;
  // The sheet's top edge, just above the pill: the page behind the sheet shows there.
  for (let row = y - 2; row >= y - height * SHEET.edgeAbove && row >= 0; row -= 1) {
    if (!same(pixel(image, cx, row), left)) return { top: y, bottom, surface: left };
  }
  return null;
}

/** The open sheet's grabber, or null when no sheet is up. */
export function findGrabber(image: RgbaImage): SheetGrabber | null {
  const { height } = image;
  for (let y = Math.floor(height * SHEET.from); y < height * SHEET.to; y += 1) {
    const grabber = grabberAt(image, y);
    if (grabber) return grabber;
  }
  return null;
}

/** The first row under `from` with anything drawn on the surface (inside the sheet's sides). */
function firstContent(image: RgbaImage, from: number, surface: Rgb): number | null {
  for (let y = from; y < image.height * LIMITS.bottom; y += 1) {
    const samples = rowSamples(image, y, 0.06, 0.94, 160);
    if (samples.filter((c) => !same(c, surface)).length >= 2) return y;
  }
  return null;
}

function isGround(colour: Rgb, grounds: readonly Grounds[]): boolean {
  return grounds.some((family) =>
    family.some((ground) => colourDistance(colour, ground) <= LIMITS.exactGround),
  );
}

/** A row of `colour` from `from` to `to` of the width. */
function spans(image: RgbaImage, y: number, colour: Rgb, from: number, to: number): boolean {
  return rowSamples(image, y, from, to, 60).every((c) => same(c, colour));
}

/** The first row of a grabberless sheet's surface, or null. */
export function findSheetEdge(
  image: RgbaImage,
  grounds: readonly Grounds[],
): { top: number; surface: Rgb } | null {
  const { width, height } = image;
  const cx = Math.round(width / 2);
  const band = Math.ceil(height * 0.02);
  for (let y = Math.max(band, Math.floor(height * SHEET.from)); y < height * SHEET.to; y += 1) {
    const surface = pixel(image, cx, y);
    if (!isGround(surface, grounds) || same(pixel(image, cx, y - 1), surface)) continue;
    // Inside its rounded corners: the middle just under the edge, nearly the width further down.
    if (!spans(image, y + 2, surface, 0.3, 0.7) || !spans(image, y + band, surface, 0.1, 0.9))
      continue;
    // Above the edge, the page behind the sheet to both sides of the screen, never a ground.
    let behind = 0;
    for (let row = y - band; row < y; row += 1) {
      const left = pixel(image, 0, row);
      const right = pixel(image, width - 1, row);
      const middle = pixel(image, cx, row);
      if (!isGround(left, grounds) && !isGround(right, grounds) && !isGround(middle, grounds))
        behind += 1;
    }
    if (behind >= band * 0.9) return { top: y, surface: pixel(image, cx, y + band) };
  }
  return null;
}

export function findSheetTopGap(
  image: RgbaImage,
  grounds: readonly Grounds[] = [],
): { code: 'SHEET_TOP_GAP'; detail: string } | null {
  const grabber = findGrabber(image);
  const edge = grabber === null ? findSheetEdge(image, grounds) : null;
  const start = grabber ? grabber.bottom + 1 : edge?.top;
  const surface = grabber?.surface ?? edge?.surface;
  if (start === undefined || surface === undefined) return null;
  const end = Math.floor(image.height * LIMITS.bottom);
  // A grabberless edge is read from below its rounded corners' first rows.
  const from = grabber ? start : start + Math.ceil(image.height * 0.01);
  const gap = (firstContent(image, from, surface) ?? end) - start;
  if (gap <= image.height * SHEET.maxGap) return null;
  const share = Math.round((gap / image.height) * 1000) / 10;
  return {
    code: 'SHEET_TOP_GAP',
    detail: `the ${hex(surface)} sheet is empty for ${String(gap)}px (${String(share)}% of the screen) under its ${grabber ? 'grabber' : 'top edge'}`,
  };
}
