/**
 * The screen checks' rules for the premium UI: the grounds a premium screen is judged by, and the
 * iOS 26 inset sheet over the dimmed page, which is not a frame.
 */
import type { RgbaImage } from './png';
import type { Grounds, ScreenCheckOptions } from './screen-checks';
import {
  colourDistance,
  commonest,
  LIMITS,
  pixel,
  rowSamples,
  rowsBetween,
  run,
  type Rgb,
} from './screen-pixels';

/**
 * An inset sheet over the dimmed page (iOS 26 sheets float 8 pt in from the edges): the "frame" is
 * the dimmed page showing down both sides of the sheet. Above the sheet's top the same dimmed page
 * runs on from the edge well past the inset (there is no screen inside it there), and the sheet
 * starts partway down, not at the top of the judged rows. A frame around the whole screen shows its
 * inset from the top instead.
 */
/** Where the page above a sheet is read from: under the screen's top edge (its rounded corners). */
const PAGE_ABOVE_FROM = 0.02;

export function isInsetSheetOverDimmedPage(
  image: RgbaImage,
  rows: readonly number[],
  inset: number,
  frameColour: Rgb,
): boolean {
  const onFrame = (y: number) =>
    colourDistance(pixel(image, 0, y), frameColour) <= LIMITS.sameColour &&
    colourDistance(pixel(image, image.width - 1, y), frameColour) <= LIMITS.sameColour;
  const atInset = (y: number) => {
    const l = run(image, y, 0, 1, Math.ceil(inset * 3));
    return Math.abs(l - inset) <= Math.max(2, image.width * 0.01);
  };
  const first = rows.findIndex((y) => onFrame(y) && atInset(y));
  const firstRow = rows[first];
  if (first < 0 || firstRow === undefined) return false;
  // The sheet's top, which may sit above the judged rows: a tall sheet (the calendar sheets)
  // starts right under the status bar. The page behind is read above it, from under the screen's
  // top edge; a frame shows its inset all the way up instead.
  const pageTop = Math.floor(image.height * PAGE_ABOVE_FROM);
  let sheetTop = firstRow;
  while (sheetTop > pageTop && onFrame(sheetTop - 1) && atInset(sheetTop - 1)) sheetTop -= 1;
  if (sheetTop < image.height * (PAGE_ABOVE_FROM + 0.02)) return false;
  const above = rowsBetween(image, PAGE_ABOVE_FROM, sheetTop / image.height, 40);
  const pageBehind = above.filter(
    (y) =>
      colourDistance(pixel(image, 0, y), frameColour) <= LIMITS.sameColour &&
      run(image, y, 0, 1, Math.ceil(inset * 3)) > inset * 1.5,
  );
  if (pageBehind.length < 3 || pageBehind.length < above.length * 0.8) return false;
  // The sheet's sides, from its top down to where they end (the keyboard or the screen's foot).
  let last = first;
  for (const [index, y] of rows.entries()) if (onFrame(y)) last = index;
  const sides = rows.slice(first, last + 1);
  return sides.filter(onFrame).length >= sides.length * 0.9;
}

/** At most this share of a premium page's samples may be the current UI's ground. */
const CURRENT_GROUND_SHARE = 0.05;

/**
 * The grounds a screen is judged by: a premium scheme's grounds when the colour filling the
 * screen's middle is exactly one of them (premium screens draw the token colours; the current UI's
 * dark navy shades come within a few steps of the premium dark ones, so near is not enough). A
 * premium page whose middle is all cards (the quiz's two cards, the issued pass) shows its ground
 * down its sides instead: when the sides are exactly a premium ground and the current UI's ground
 * is nowhere on the screen, it is judged by that scheme. A light band round the current UI's
 * ground still reads as a frame, since that ground shows inside the band. Otherwise the current
 * UI's background alone, as before.
 */
export function screenGrounds(
  image: RgbaImage,
  rows: readonly number[],
  options: ScreenCheckOptions,
): Grounds {
  const families = options.premiumGrounds ?? [];
  if (families.length === 0) return [options.background];
  const exactly = (colour: Rgb) =>
    families.find((grounds) =>
      grounds.some((ground) => colourDistance(colour, ground) <= LIMITS.exactGround),
    );
  const middle = commonest(rows.flatMap((y) => rowSamples(image, y, 0.15, 0.85, 30)));
  const byMiddle = exactly(middle);
  if (byMiddle !== undefined) return byMiddle;
  const across = rows.flatMap((y) => rowSamples(image, y, 0, 1, 60));
  const current = across.filter(
    (colour) => colourDistance(colour, options.background) <= LIMITS.sameColour,
  );
  if (current.length > across.length * CURRENT_GROUND_SHARE) return [options.background];
  const sides = commonest(
    rows.flatMap((y) => [pixel(image, 0, y), pixel(image, image.width - 1, y)]),
  );
  return exactly(sides) ?? [options.background];
}

/**
 * A card of the other scheme on its page: the frame's colour is exactly one scheme's page ground,
 * while the screen's middle reads as the other scheme (the boarding pass, drawn light on the dark
 * page by design). Its page shows at the card's gutter on both sides, which is no frame.
 */
export function isOtherSchemeCardOnPage(
  frameColour: Rgb,
  middleGrounds: Grounds,
  options: ScreenCheckOptions,
): boolean {
  const families = options.premiumGrounds ?? [];
  // The middle must read as a premium scheme itself: a premium ground framing the current UI is
  // a frame.
  if (!families.includes(middleGrounds)) return false;
  return families.some((family) => {
    const page = family[0];
    if (page === undefined || family === middleGrounds) return false;
    const otherScheme = !family.some((ground) =>
      middleGrounds.some((middle) => colourDistance(ground, middle) <= LIMITS.exactGround),
    );
    return otherScheme && colourDistance(frameColour, page) <= LIMITS.exactGround;
  });
}
