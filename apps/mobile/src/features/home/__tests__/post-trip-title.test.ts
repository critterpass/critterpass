import { describe, expect, it } from '@jest/globals';

import { resolveTypeVariant, tokens } from '@cp/design-tokens';

import { fontFor } from '@/lib/fonts';
import { ADVANCE_RATIO, estimateLineCount, fitFontSize, wholeWordSize } from '@/ui/text/auto-fit';
import { displayAdvance } from '@/ui/text/display-advance';

import { POST_TRIP_TITLE_LINES, POST_TRIP_TITLE_MIN_SIZE } from '../post-trip-title';

const token = tokens.type.display.xl;
const size = resolveTypeVariant(token, { fontScale: 1 });
const font = fontFor(
  {
    fontFamily: token.fontFamily,
    fontWeight: token.fontWeight,
    ...(token.widthStep === undefined ? {} : { widthStep: token.widthStep }),
    lineHeightMultiplier: size.lineHeightMultiplier,
    condensed: token.condensed,
  },
  'vi',
);
const measure = {
  advanceRatio: token.condensed ? ADVANCE_RATIO.condensed : ADVANCE_RATIO.regular,
  advanceOf: displayAdvance(font.fontFamily),
  letterSpacingEm: token.letterSpacing ?? 0,
};
const maxSize = size.fontSize * font.sizeMultiplier;

/** The title's width on a phone: the screen inside the gutters and the card's padding. */
const inside = (screen: number) => screen - 2 * tokens.size.gutter - 2 * tokens.size.cardInner.max;

const TITLES = [
  'BALI RECAP',
  'NHÌN LẠI ĐÀ NẴNG',
  'NHÌN LẠI THÀNH PHỐ HỒ CHÍ MINH',
  'HO CHI MINH CITY RECAP',
  'NHÌN LẠI BUÔN MA THUỘT',
];

describe("the post-trip card's title", () => {
  it.each([320, 360, 393, 430])('fits whole on its lines on a %i pt screen', (screen) => {
    const width = inside(screen);
    for (const text of TITLES) {
      const fontSize = fitFontSize({
        ...measure,
        text,
        width,
        maxSize,
        minSize: POST_TRIP_TITLE_MIN_SIZE,
        maxLines: POST_TRIP_TITLE_LINES,
      });
      const lines = estimateLineCount({ ...measure, text, width, fontSize });
      const wholeWords = wholeWordSize({ ...measure, text, width }) >= fontSize;
      expect({ text, fits: lines <= POST_TRIP_TITLE_LINES, wholeWords }).toEqual({
        text,
        fits: true,
        wholeWords: true,
      });
    }
  });

  it('sets a short name at the full display size', () => {
    expect(
      fitFontSize({
        ...measure,
        text: 'NHÌN LẠI ĐÀ NẴNG',
        width: inside(393),
        maxSize,
        minSize: POST_TRIP_TITLE_MIN_SIZE,
        maxLines: POST_TRIP_TITLE_LINES,
      }),
    ).toBe(maxSize);
  });
});
