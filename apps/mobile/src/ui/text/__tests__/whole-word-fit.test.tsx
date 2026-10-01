import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { TextStyle } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { renderWithI18n } from '../../../lib/i18n/testing';
import { ThemeProvider } from '../../../lib/theme';
import { setUiQaSink } from '../../qa/ui-qa';
import {
  ADVANCE_RATIO,
  AUTO_FIT_MIN_SCALE,
  horizontalInset,
  WHOLE_WORD_MIN_SCALE,
  wholeWordSize,
} from '../auto-fit';
import { displayAdvance } from '../display-advance';
import { Text } from '../Text';

let reports: string[] = [];
beforeEach(() => {
  reports = [];
  setUiQaSink((line) => reports.push(line));
});
afterEach(() => setUiQaSink(null));

function lines(...texts: string[]) {
  return { nativeEvent: { lines: texts.map((text) => ({ text })) } };
}

function sizeOf(element: { props: { style?: unknown } }): number {
  return (StyleSheet.flatten(element.props.style as TextStyle) ?? {}).fontSize ?? 0;
}

// Home's next-up card on a 393 pt phone: the title box, and the sticker padding kept clear of.
const CARD_TITLE_WIDTH = 305;
const STICKER_PADDING = 124;
const MEGA_TRACKING = tokens.type.display.mega.letterSpacing ?? 0;

describe('whole-word fit', () => {
  it('sizes the longest word to the box and reads the padding a style sets', () => {
    const measure = { advanceRatio: 0.5, width: 100 };
    expect(wholeWordSize({ ...measure, text: 'ab abcd' })).toBe(50);
    expect(wholeWordSize({ ...measure, text: 'abcd', letterSpacingEm: 0.5 })).toBe(25);
    expect(horizontalInset(undefined)).toBe(0);
    expect(horizontalInset({ paddingEnd: 124 })).toBe(124);
    expect(horizontalInset({ paddingHorizontal: 8, paddingStart: 4 })).toBe(12);
    expect(horizontalInset({ padding: 6 })).toBe(12);
  });

  it('keeps a mega title whole beside a sticker: shrinks past the scale floor and wraps by words', async () => {
    const screen = await renderWithI18n(
      <ThemeProvider fontScale={1}>
        <Text variant="displayMega" testID="t" style={{ paddingEnd: STICKER_PADDING }}>
          Your next trip
        </Text>
      </ThemeProvider>,
    );
    const title = () => screen.getByTestId('t');
    const nominal = sizeOf(title());
    await fireEvent(title(), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: CARD_TITLE_WIDTH, height: 0 } },
    });
    const box = CARD_TITLE_WIDTH - STICKER_PADDING;
    const fitted = sizeOf(title());
    // "YOUR" has to fit the width left beside the sticker, not the whole title box.
    expect(fitted).toBeLessThan(nominal * AUTO_FIT_MIN_SCALE);
    expect(fitted).toBeGreaterThanOrEqual(nominal * WHOLE_WORD_MIN_SCALE);
    const word = {
      text: 'YOUR',
      width: box,
      advanceRatio: ADVANCE_RATIO.condensed,
      advanceOf: displayAdvance('Archivo-W62-900'),
    };
    expect(fitted).toBeCloseTo(wholeWordSize({ ...word, letterSpacingEm: MEGA_TRACKING }), 5);

    // One word per line: the single-line title wraps at its floor and settles there.
    for (let i = 0; i < 6; i += 1) {
      await fireEvent(title(), 'textLayout', lines('YOUR ', 'NEXT ', 'TRIP'));
    }
    expect(sizeOf(title())).toBe(fitted);
    expect(title().props.numberOfLines).toBeUndefined();
    expect(reports).toEqual([]);
  });

  it('keeps the scale floor for a word that fits the box', async () => {
    const screen = await renderWithI18n(
      <ThemeProvider fontScale={1}>
        <Text variant="displayMega" testID="t">
          Kyoto Osaka Nara
        </Text>
      </ThemeProvider>,
    );
    const title = () => screen.getByTestId('t');
    const nominal = sizeOf(title());
    await fireEvent(title(), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 350, height: 0 } },
    });
    for (let i = 0; i < 20; i += 1) {
      await fireEvent(title(), 'textLayout', lines('KYOTO OSAKA ', 'NARA ', 'X ', 'Y'));
    }
    expect(sizeOf(title())).toBeCloseTo(nominal * AUTO_FIT_MIN_SCALE, 5);
  });

  it('corrects a word split in the layout that came before the width, as Fabric orders them', async () => {
    const screen = await renderWithI18n(
      <ThemeProvider fontScale={1}>
        <Text variant="h3" autoFit testID="t">
          0 saved
        </Text>
      </ThemeProvider>,
    );
    const value = () => screen.getByTestId('t');
    const start = sizeOf(value());
    // The platform reports the split lines first, then the tile's width, at an unchanged size.
    await fireEvent(value(), 'textLayout', lines('0 ', 'SAVE', 'D'));
    await fireEvent(value(), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 0 } },
    });
    expect(sizeOf(value())).toBeLessThan(start);
    await fireEvent(value(), 'textLayout', lines('0 SAVED'));
    expect(reports).toEqual([]);
  });
});
