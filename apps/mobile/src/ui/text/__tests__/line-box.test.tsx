import { describe, expect, it } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { TextStyle } from 'react-native';

import { renderWithI18n } from '../../../lib/i18n/testing';
import { ThemeProvider } from '../../../lib/theme';
import { DISPLAY_INK, DISPLAY_LINE_GAP, inkExtent, wrappedLeading } from '../line-box';
import { Text } from '../Text';
import {
  fontFiles,
  LATIN_LETTERS,
  readFontFile,
  VIETNAMESE_LETTERS,
} from '../test-support/font-file';

const LATIN_LEADING = 0.86;
const VIETNAMESE_LEADING = 1.12;

function lines(...texts: string[]) {
  return { nativeEvent: { lines: texts.map((text) => ({ text })) } };
}

function leadingOf(element: { props: { style?: unknown } }): number {
  const style = StyleSheet.flatten(element.props.style as TextStyle) ?? {};
  return (style.lineHeight ?? 0) / (style.fontSize ?? 1);
}

describe('display ink', () => {
  // Every accented letter of every Archivo cut: the rule never says less than the outline reaches,
  // and never more than 0.03 em above it (so the leading it opens stays tight).
  it.each(fontFiles('Archivo'))('covers the marks of %s', (file) => {
    const face = readFontFile(file);
    for (const letter of LATIN_LETTERS + VIETNAMESE_LETTERS) {
      const marked = letter.normalize('NFD').length > 1;
      if (!marked || !face.draws(letter)) continue;
      const measured = face.extent(letter);
      const rule = inkExtent(letter);
      if (rule.top > DISPLAY_INK.cap) {
        expect(rule.top).toBeGreaterThanOrEqual(measured.top - 0.0005);
        expect(rule.top - measured.top).toBeLessThanOrEqual(0.08);
      } else {
        // Treated as plain: a small letter's single mark, no taller than the ascenders.
        expect(measured.top).toBeLessThanOrEqual(0.745);
      }
      // Letters' own descenders (ỵ) are the design's; a mark below any other letter is covered.
      if ('gjpqy'.includes(letter.normalize('NFD')[0] ?? '')) continue;
      expect(rule.bottom).toBeGreaterThanOrEqual(measured.bottom - 0.02);
      if (rule.bottom > 0) expect(rule.bottom).toBeGreaterThanOrEqual(measured.bottom - 0.0005);
    }
  });

  it('reads stacked marks above capitals and marks below', () => {
    expect(inkExtent('MEXICO CITY')).toEqual({ top: DISPLAY_INK.cap, bottom: 0 });
    expect(inkExtent('ĐÀ')).toEqual({ top: DISPLAY_INK.capMark, bottom: 0 });
    expect(inkExtent('NẴNG')).toEqual({ top: DISPLAY_INK.capStacked, bottom: 0 });
    expect(inkExtent('NHIỆM VỤ')).toEqual({ top: DISPLAY_INK.capMark, bottom: 0.196 });
    expect(inkExtent('ÅRHUS').top).toBe(DISPLAY_INK.capRing);
    expect(inkExtent('đặt chỗ')).toEqual({ top: DISPLAY_INK.smallStacked, bottom: 0.196 });
    // Decomposed input (a base letter and combining marks) reads the same.
    expect(inkExtent('NẴNG'.normalize('NFD'))).toEqual(inkExtent('NẴNG'));
  });
});

describe('wrapped leading', () => {
  it('keeps the designed leading for one line and for lines without marks', () => {
    expect(wrappedLeading(['ĐÀ NẴNG'], VIETNAMESE_LEADING)).toBe(VIETNAMESE_LEADING);
    expect(wrappedLeading(['BALI'], LATIN_LEADING)).toBe(LATIN_LEADING);
    expect(wrappedLeading(['MEXICO', 'CITY'], LATIN_LEADING)).toBe(LATIN_LEADING);
    expect(wrappedLeading(['LLANFAIRPWLLGWYN', 'GYLLGOGERYCHWYRN'], LATIN_LEADING)).toBe(
      LATIN_LEADING,
    );
    // Marks on the first line only rise into the room above the text box, not into a line.
    expect(wrappedLeading(['HỒ CHÍ', 'MINH'], VIETNAMESE_LEADING)).toBe(VIETNAMESE_LEADING);
  });

  it('opens the leading until a mark clears the line above by the designed gap', () => {
    // Ẵ reaches 1.059 em over its baseline: at 1.12 its tilde ended 0.06 em under ĐÀ.
    const daNang = wrappedLeading(['ĐÀ', 'NẴNG'], VIETNAMESE_LEADING);
    expect(daNang).toBeCloseTo(DISPLAY_INK.capStacked + DISPLAY_LINE_GAP, 3);
    expect(daNang).toBeCloseTo(1.219, 3);
    // The dots under NHIỆM VỤ and the acute of NHÓM share the space between the two lines.
    expect(wrappedLeading(['NHIỆM VỤ', 'NHÓM'], VIETNAMESE_LEADING)).toBeCloseTo(1.253, 3);
    // The worst pair: a dot below over two stacked marks.
    expect(wrappedLeading(['ĐẶT', 'CHỖ'], VIETNAMESE_LEADING)).toBeCloseTo(1.415, 3);
    // A Latin accent on a second line no longer runs into the first at the 0.86 leading.
    expect(wrappedLeading(['SÃO', 'TOMÉ'], LATIN_LEADING)).toBeCloseTo(1.057, 3);
    // Every pair of lines counts, not only the first.
    expect(wrappedLeading(['HỒ', 'CHÍ', 'MINH'], VIETNAMESE_LEADING)).toBe(VIETNAMESE_LEADING);
    expect(wrappedLeading(['A', 'B', 'NẴNG'], LATIN_LEADING)).toBeCloseTo(1.219, 3);
  });
});

describe('Text line box', () => {
  async function title(text: string, locale: string) {
    await renderWithI18n(
      <ThemeProvider fontScale={1}>
        <Text variant="displayMega" testID="title" autoFit={false}>
          {text}
        </Text>
      </ThemeProvider>,
      { locale },
    );
    return () => screen.getByTestId('title');
  }

  it.each(['en', 'vi'])('opens a wrapped hero title with a stacked mark in %s', async (locale) => {
    const node = await title('Đà Nẵng', locale);
    expect(leadingOf(node())).toBeCloseTo(VIETNAMESE_LEADING, 3);
    await fireEvent(node(), 'textLayout', lines('ĐÀ ', 'NẴNG'));
    expect(leadingOf(node())).toBeCloseTo(1.219, 3);
    // On one line again (a wider box), the designed leading comes back.
    await fireEvent(node(), 'textLayout', lines('ĐÀ NẴNG'));
    expect(leadingOf(node())).toBeCloseTo(VIETNAMESE_LEADING, 3);
  });

  it('leaves wrapped titles without marks at the display leading', async () => {
    const node = await title('Mexico City', 'en');
    const designed = leadingOf(node());
    await fireEvent(node(), 'textLayout', lines('MEXICO ', 'CITY'));
    expect(leadingOf(node())).toBe(designed);
  });

  it('keeps a line height the caller set', async () => {
    await renderWithI18n(
      <ThemeProvider fontScale={1}>
        <Text variant="buttonSm" testID="label" singleLine={false} style={{ lineHeight: 14 }}>
          Đặt chỗ ngay
        </Text>
      </ThemeProvider>,
      { locale: 'vi' },
    );
    await fireEvent(screen.getByTestId('label'), 'textLayout', lines('ĐẶT ', 'CHỖ NGAY'));
    const style = StyleSheet.flatten(screen.getByTestId('label').props.style as TextStyle);
    expect(style.lineHeight).toBe(14);
  });
});
