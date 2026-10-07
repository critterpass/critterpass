import { describe, expect, it } from '@jest/globals';

import { tokens } from '@cp/design-tokens';

import { DISPLAY_INK } from '@/ui/text/line-box';

import {
  POST_TRIP_TITLE_LEADING,
  POST_TRIP_TITLE_MIN_SIZE,
  postTripTitle,
} from '../post-trip-title';

/** The title's width on a phone: the screen inside the gutters and the card's padding. */
const inside = (screen: number) => screen - 2 * tokens.size.gutter - 2 * tokens.size.cardInner.max;
const IPHONE = inside(393);
const MAX = tokens.type.display.xl.fontSizeMax ?? 64;

const title = (sentence: string, name: string, width = IPHONE, locale = 'vi') =>
  postTripTitle({ sentence, name, width, locale });

describe("the post-trip card's title", () => {
  it('breaks before the place name, not inside it', () => {
    expect(title('NHÌN LẠI ĐÀ NẴNG', 'ĐÀ NẴNG').text).toBe('NHÌN LẠI ĐÀ NẴNG');
    expect(title('ĐÀ NẴNG RECAP', 'ĐÀ NẴNG', IPHONE, 'en').text).toBe('ĐÀ NẴNG RECAP');
    expect(title('LOOK BACK AT ĐÀ NẴNG', 'ĐÀ NẴNG', IPHONE, 'en').text).toBe(
      'LOOK BACK AT ĐÀ NẴNG',
    );
  });

  it('keeps a short name at the full display size', () => {
    expect(title('NHÌN LẠI ĐÀ NẴNG', 'ĐÀ NẴNG').fontSize).toBe(MAX);
    expect(title('BALI RECAP', 'BALI', IPHONE, 'en')).toMatchObject({
      text: 'BALI RECAP',
      fontSize: MAX,
    });
  });

  it('shrinks a little to keep a middling name whole', () => {
    const loose = title('NHÌN LẠI HỒ CHÍ MINH', 'NO SUCH NAME').fontSize;
    const whole = title('NHÌN LẠI HỒ CHÍ MINH', 'HỒ CHÍ MINH');
    expect(whole.text).toBe('NHÌN LẠI HỒ CHÍ MINH');
    expect(whole.fontSize).toBeLessThanOrEqual(loose);
    expect(whole.fontSize).toBeGreaterThanOrEqual(loose * 0.85);
  });

  it('lets a name too long for one line wrap at a word', () => {
    for (const [sentence, locale] of [
      ['NHÌN LẠI THÀNH PHỐ HỒ CHÍ MINH', 'vi'],
      ['THÀNH PHỐ HỒ CHÍ MINH RECAP', 'en'],
    ] as const) {
      const long = title(sentence, 'THÀNH PHỐ HỒ CHÍ MINH', IPHONE, locale);
      expect(long.text).toBe(sentence);
      expect(long.fontSize).toBeGreaterThan(POST_TRIP_TITLE_MIN_SIZE);
    }
  });

  it.each([320, 360, 393, 430])('stays above its floor on a %i pt screen', (screen) => {
    for (const [sentence, name] of [
      ['NHÌN LẠI ĐÀ NẴNG', 'ĐÀ NẴNG'],
      ['NHÌN LẠI THÀNH PHỐ HỒ CHÍ MINH', 'THÀNH PHỐ HỒ CHÍ MINH'],
      ['NHÌN LẠI BUÔN MA THUỘT', 'BUÔN MA THUỘT'],
      ['HO CHI MINH CITY RECAP', 'HO CHI MINH CITY'],
    ] as const) {
      const fitted = title(sentence, name, inside(screen));
      expect({ sentence, above: fitted.fontSize > POST_TRIP_TITLE_MIN_SIZE }).toEqual({
        sentence,
        above: true,
      });
    }
  });

  it('gives every title the same line height, clear of stacked marks', () => {
    const short = title('NHÌN LẠI ĐÀ NẴNG', 'ĐÀ NẴNG');
    const plain = title('BALI RECAP', 'BALI', IPHONE, 'en');
    expect(short.lineHeight).toBe(plain.lineHeight);
    expect(short.lineHeight / short.fontSize).toBeCloseTo(POST_TRIP_TITLE_LEADING, 1);
    expect(POST_TRIP_TITLE_LEADING).toBeGreaterThan(DISPLAY_INK.capStacked + DISPLAY_INK.dotBelow);
  });
});
