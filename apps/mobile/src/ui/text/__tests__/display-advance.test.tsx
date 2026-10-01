import { describe, expect, it } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { TextStyle } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { renderWithI18n } from '../../../lib/i18n/testing';
import { ThemeProvider } from '../../../lib/theme';
import { ADVANCE_RATIO, estimateLineCount, fitFontSize, textEm, wholeWordSize } from '../auto-fit';
import { DISPLAY_ADVANCES, displayAdvance, MEASURED } from '../display-advance';
import { Text } from '../Text';
import { readFontFile, VIETNAMESE_LETTERS } from '../test-support/font-file';

const MEGA = 'Archivo-W62-900';
const MEGA_TRACKING = tokens.type.display.mega.letterSpacing ?? 0;
const mega = {
  advanceRatio: ADVANCE_RATIO.condensed,
  advanceOf: displayAdvance(MEGA),
  letterSpacingEm: MEGA_TRACKING,
};

/** Home's next-up title box on a 412 pt phone: the card's content width less the guide sticker. */
const HERO_BOX = 216;
const MEGA_MAX = tokens.type.display.mega.fontSizeMax ?? 0;
const MEGA_FLOOR = MEGA_MAX * 0.7;

describe('display advances', () => {
  it.each(Object.keys(DISPLAY_ADVANCES))('match the hmtx table of %s', (family) => {
    const face = readFontFile(`${family}.ttf`);
    const advance = displayAdvance(family);
    expect(advance).toBeDefined();
    for (const char of MEASURED) {
      expect(advance?.(char)).toBeCloseTo(face.advance(char), 3);
    }
    // Marks add no width: every Vietnamese letter advances as the entry it reads.
    for (const char of VIETNAMESE_LETTERS) {
      expect(advance?.(char)).toBeCloseTo(face.advance(char), 3);
    }
  });

  it('has no table for a face that is not measured', () => {
    expect(displayAdvance('Geist-400')).toBeUndefined();
    expect(displayAdvance('system')).toBeUndefined();
  });

  it('measures titles narrower than the flat estimate did', () => {
    const flat = { advanceRatio: ADVANCE_RATIO.condensed, letterSpacingEm: MEGA_TRACKING };
    // Narrow letters and the word space count for what they are.
    expect(textEm('BALI', mega)).toBeCloseTo(1.643, 3);
    expect(textEm('ĐÀ NẴNG', mega)).toBeCloseTo(3.118, 3);
    expect(textEm('ĐÀ NẴNG', mega)).toBe(textEm('DA NANG', mega));
    for (const title of ['ĐÀ NẴNG', 'HỒ CHÍ MINH', 'NHIỆM VỤ NHÓM', 'MEXICO CITY', 'BALI']) {
      expect(textEm(title, mega)).toBeLessThan(textEm(title, flat));
    }
    // Wide capitals are not all narrower: the estimate is a measure, not a discount.
    expect(textEm('WWW', mega)).toBeGreaterThan(textEm('WWW', flat));
  });
});

describe('display title fit', () => {
  const hero = { ...mega, width: HERO_BOX, maxSize: MEGA_MAX, minSize: MEGA_FLOOR, maxLines: 1 };

  it('sets a short name on one line as large as the box allows', () => {
    const size = fitFontSize({ ...hero, text: 'BALI' });
    expect(size).toBeGreaterThanOrEqual(MEGA_FLOOR);
    expect(size * textEm('BALI', mega)).toBeLessThanOrEqual(HERO_BOX);
    expect((size + 0.5) * textEm('BALI', mega)).toBeGreaterThan(HERO_BOX);
    // The flat estimate asked for four 0.54 em glyphs: 100 pt, under the design floor.
    expect(size).toBeGreaterThan(HERO_BOX / (4 * (ADVANCE_RATIO.condensed + MEGA_TRACKING)));
  });

  it.each([
    ['ĐÀ NẴNG', 2],
    ['HỒ CHÍ MINH', 3],
    ['MEXICO CITY', 2],
    ['NHIỆM VỤ NHÓM', 3],
  ])('keeps the words of %s whole at the size its longest word fits', (title, lines) => {
    const size = Math.min(MEGA_FLOOR, wholeWordSize({ ...mega, text: title, width: HERO_BOX }));
    expect(size).toBeGreaterThanOrEqual(MEGA_MAX * 0.3);
    for (const word of title.split(' ')) {
      expect(size * textEm(word, mega)).toBeLessThanOrEqual(HERO_BOX + 1e-6);
    }
    expect(estimateLineCount({ ...mega, text: title, width: HERO_BOX, fontSize: size })).toBe(
      lines,
    );
  });

  it('never goes under the whole-word floor for a long one-word name', () => {
    const title = 'LLANFAIRPWLLGWYNGYLL';
    const size = wholeWordSize({ ...mega, text: title, width: HERO_BOX });
    expect(size).toBeLessThan(MEGA_MAX * 0.3);
    // At the floor the word is longer than a line and breaks; the platform's lines decide the rest.
    expect(
      estimateLineCount({ ...mega, text: title, width: HERO_BOX, fontSize: MEGA_MAX * 0.3 }),
    ).toBeGreaterThan(1);
  });

  it('sets the Đà Nẵng hero at the size NẴNG fits beside the sticker', async () => {
    await renderWithI18n(
      <ThemeProvider fontScale={1}>
        <Text variant="displayMega" testID="title" style={{ paddingEnd: 124 }}>
          Đà Nẵng
        </Text>
      </ThemeProvider>,
    );
    await fireEvent(screen.getByTestId('title'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: HERO_BOX + 124, height: 0 } },
    });
    const style = StyleSheet.flatten(screen.getByTestId('title').props.style as TextStyle);
    expect(style?.fontSize).toBeCloseTo(HERO_BOX / textEm('NẴNG', mega), 3);
    // 106 pt, where the flat estimate gave 100.
    expect(Math.round(style?.fontSize ?? 0)).toBe(106);
  });
});
