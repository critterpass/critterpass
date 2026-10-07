/**
 * How the post-trip card sets its title, a sentence around a place name ("NHÌN LẠI ĐÀ NẴNG",
 * "ĐÀ NẴNG RECAP"): on at most two lines, at the largest size the whole sentence fits. A place
 * name's words stay together, so the break falls between the phrase and the name ("NHÌN LẠI" /
 * "ĐÀ NẴNG"), unless keeping them together would shrink the title too far: a name too long for a
 * line ("THÀNH PHỐ HỒ CHÍ MINH") wraps at a word like the rest. The line height is the same for
 * every title, so two cards have the same rhythm whatever marks their names carry.
 */
import { resolveTypeVariant, tokens } from '@cp/design-tokens';

import { fontFor } from '@/lib/fonts';
import { ADVANCE_RATIO, estimateLineCount, fitFontSize, wholeWordSize } from '@/ui/text/auto-fit';
import { displayAdvance } from '@/ui/text/display-advance';
import { DISPLAY_INK } from '@/ui/text/line-box';

/** The title is a sentence: it gets two lines. */
export const POST_TRIP_TITLE_LINES = 2;
/** A long place name shrinks the title to this before a word would be cut. */
export const POST_TRIP_TITLE_MIN_SIZE = 28;
/** The name's words stay together while that costs no more than this share of the title's size. */
export const WHOLE_NAME_MIN_SCALE = 0.85;
/**
 * The title's line height in em, whatever its letters: room for the tallest stacked mark (Ẵ, Ồ)
 * under a line with a dot below (Ạ, Ệ), with a hair between them.
 */
export const POST_TRIP_TITLE_LEADING =
  Math.ceil((DISPLAY_INK.capStacked + DISPLAY_INK.dotBelow + 0.04) * 100) / 100;

const NBSP = ' ';
/** Stands for a non-breaking space in the estimate, which breaks at every kind of space. */
const JOINER = '⁠';
const token = tokens.type.display.xl;

export interface PostTripTitle {
  /** The sentence, with non-breaking spaces inside the name when its words stay together. */
  readonly text: string;
  readonly fontSize: number;
  readonly lineHeight: number;
}

export function postTripTitle(input: {
  /** The whole title as shown ("NHÌN LẠI ĐÀ NẴNG"). */
  readonly sentence: string;
  /** The place name as it appears in it ("ĐÀ NẴNG"). */
  readonly name: string;
  /** The title's width in points. */
  readonly width: number;
  readonly locale: string;
}): PostTripTitle {
  const { sentence, name, width } = input;
  const resolved = resolveTypeVariant(token, { fontScale: 1 });
  const font = fontFor(
    {
      fontFamily: token.fontFamily,
      fontWeight: token.fontWeight,
      ...(token.widthStep === undefined ? {} : { widthStep: token.widthStep }),
      lineHeightMultiplier: resolved.lineHeightMultiplier,
      condensed: token.condensed,
    },
    input.locale,
  );
  const measured = displayAdvance(font.fontFamily);
  const measure = {
    width,
    advanceRatio: token.condensed ? ADVANCE_RATIO.condensed : ADVANCE_RATIO.regular,
    advanceOf:
      measured === undefined ? undefined : (char: string) => measured(char === JOINER ? ' ' : char),
    letterSpacingEm: token.letterSpacing ?? 0,
  };
  const fit = (text: string) =>
    fitFontSize({
      ...measure,
      text,
      maxSize: resolved.fontSize * font.sizeMultiplier,
      minSize: POST_TRIP_TITLE_MIN_SIZE,
      maxLines: POST_TRIP_TITLE_LINES,
    });
  const sized = (text: string, fontSize: number): PostTripTitle => ({
    text,
    fontSize,
    lineHeight: Math.round(fontSize * POST_TRIP_TITLE_LEADING),
  });
  const loose = fit(sentence);
  if (!name.includes(' ') || !sentence.includes(name)) return sized(sentence, loose);
  const joined = sentence.replace(name, name.replaceAll(' ', JOINER));
  const whole = fit(joined);
  // The name on one line of its own, and the sentence around it within its lines.
  const fits =
    wholeWordSize({ ...measure, text: joined }) >= whole &&
    estimateLineCount({ ...measure, text: joined, fontSize: whole }) <= POST_TRIP_TITLE_LINES;
  return fits && whole >= loose * WHOLE_NAME_MIN_SCALE
    ? sized(sentence.replace(name, name.replaceAll(' ', NBSP)), whole)
    : sized(sentence, loose);
}
