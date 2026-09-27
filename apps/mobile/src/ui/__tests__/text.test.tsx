import { act, fireEvent } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import type { TextStyle } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { renderWithI18n } from '../../lib/i18n/testing';
import { ThemeProvider } from '../../lib/theme';
import { fixturesFor, listComponents } from '../gallery/registry';
import { estimateLineCount, fitFontSize, isOverflowing } from '../text/auto-fit';
import { Text } from '../text/Text';
import { makeStyles } from '../theme';

import '../text/text.fixtures';

/** Lingui's own pseudo-localisation shape: accented look-alikes plus ~40% expansion. */
const PSEUDO_ACCENTS: Record<string, string> = {
  a: 'à',
  c: 'ć',
  e: 'é',
  g: 'ĝ',
  h: 'ĥ',
  i: 'î',
  n: 'ñ',
  o: 'ö',
  r: 'ŕ',
  s: 'ś',
  t: 'ţ',
  u: 'û',
  w: 'ŵ',
  y: 'ŷ',
};
function pseudoLocalize(source: string): string {
  const accented = [...source].map((char) => PSEUDO_ACCENTS[char] ?? char).join('');
  const padding = ' ' + 'ŀ'.repeat(Math.ceil(source.length * 0.4));
  return `[${accented}${padding}]`;
}

// A designed h1 (3i-4) after +40% pseudo expansion.
const LONG_TITLE = pseudoLocalize('Couldn’t read it');
const CONTENT_WIDTH = 390 - 2 * tokens.size.gutter;

function flat(element: { props: { style?: unknown } }): TextStyle {
  return StyleSheet.flatten(element.props.style as TextStyle) ?? {};
}

async function renderText(ui: ReactElement, locale = 'en', fontScale = 1) {
  return renderWithI18n(<ThemeProvider fontScale={fontScale}>{ui}</ThemeProvider>, { locale });
}

async function layout(element: Parameters<typeof fireEvent>[0], width: number) {
  await fireEvent(element, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 0 } } });
}

describe('Text', () => {
  it('auto-fits an h1 in the en-XA pseudo-locale at AX3 within 3 lines', async () => {
    const screen = await renderText(
      <Text variant="h1" testID="title">
        {LONG_TITLE}
      </Text>,
      'en-XA',
      2,
    );
    const title = screen.getByTestId('title');
    await layout(title, CONTENT_WIDTH);

    const style = flat(screen.getByTestId('title'));
    const maxSize = 44 * 1.5; // h1 damps AX3 (2x) to 1.5x
    expect(style.fontSize).toBeLessThanOrEqual(maxSize);
    expect(style.fontSize).toBeGreaterThanOrEqual(maxSize * 0.7);
    expect(screen.getByTestId('title').props.numberOfLines).toBe(3);
    const lines = estimateLineCount({
      text: LONG_TITLE.toUpperCase(),
      fontSize: style.fontSize ?? 0,
      width: CONTENT_WIDTH,
      advanceRatio: 0.56,
      letterSpacingEm: -0.01,
    });
    expect(lines).toBeLessThanOrEqual(3);
  });

  it('shrinks further when the platform still reports overflow, never below the floor', async () => {
    const screen = await renderText(
      <Text variant="h1" testID="title">
        Where next?
      </Text>,
    );
    await layout(screen.getByTestId('title'), CONTENT_WIDTH);
    const first = flat(screen.getByTestId('title')).fontSize ?? 0;
    const fourLines = { nativeEvent: { lines: [1, 2, 3, 4].map(() => ({ text: 'LINE' })) } };

    await fireEvent(screen.getByTestId('title'), 'textLayout', fourLines);
    const second = flat(screen.getByTestId('title')).fontSize ?? 0;
    expect(second).toBeLessThan(first);

    for (let i = 0; i < 20; i += 1) {
      await fireEvent(screen.getByTestId('title'), 'textLayout', fourLines);
    }
    expect(first).toBe(44);
    expect(flat(screen.getByTestId('title')).fontSize).toBeCloseTo(44 * 0.7, 5);
  });

  it('uppercases at render with the locale casing rules', async () => {
    const tr = await renderText(<Text variant="label">istanbul</Text>, 'tr');
    expect(tr.getByText('İSTANBUL')).toBeTruthy();
    const de = await renderText(<Text variant="label">straße</Text>, 'de');
    expect(de.getByText('STRASSE')).toBeTruthy();
    const ja = await renderText(<Text variant="label">京都</Text>, 'ja');
    expect(ja.getByText('京都')).toBeTruthy();
  });

  it('keeps body copy in its authored case', async () => {
    const screen = await renderText(<Text>Blossoms peak in April</Text>);
    expect(screen.getByText('Blossoms peak in April')).toBeTruthy();
  });

  it('uses tabular numerals where the token asks for them', async () => {
    const screen = await renderText(<Text variant="displayHero">17d 05:26</Text>);
    expect(flat(screen.getByText('17D 05:26')).fontVariant).toEqual(['tabular-nums']);
  });

  it('scales body text with the OS up to AX3 and damps display text', async () => {
    const body = await renderText(<Text testID="body">Body</Text>, 'en', 2);
    expect(flat(body.getByTestId('body')).fontSize).toBe(14 * 2);
    expect(body.getByTestId('body').props.allowFontScaling).toBe(false);

    const capped = await renderText(<Text testID="body">Body</Text>, 'en', 3.1);
    expect(flat(capped.getByTestId('body')).fontSize).toBe(14 * 2);

    const title = await renderText(
      <Text variant="title" testID="t">
        Row
      </Text>,
      'en',
      1,
    );
    expect(flat(title.getByTestId('t')).fontSize).toBe(16);
  });

  it('resolves the face per script: Archivo width steps, system CJK, Caveat voice', async () => {
    const latin = await renderText(
      <Text variant="h1" testID="h1">
        Bali
      </Text>,
    );
    expect(flat(latin.getByTestId('h1')).fontFamily).toBe('Archivo-W70-900');

    const cjk = await renderText(
      <Text variant="h1" testID="h1">
        京都
      </Text>,
      'ja',
    );
    const cjkStyle = flat(cjk.getByTestId('h1'));
    expect(cjkStyle.fontFamily).toBeUndefined();
    expect(cjkStyle.fontWeight).toBe('900');

    const voice = await renderText(
      <Text variant="voice" testID="v">
        Hi
      </Text>,
    );
    expect(flat(voice.getByTestId('v')).fontFamily).toBe('Caveat-600');
  });

  it('swaps the guide voice for Geist italic under "plain text for guide"', async () => {
    const screen = await renderWithI18n(
      <ThemeProvider plainGuideText>
        <Text variant="voice" testID="v">
          Hi
        </Text>
      </ThemeProvider>,
    );
    const style = flat(screen.getByTestId('v'));
    expect(style.fontFamily).toBe('Geist-500');
    expect(style.fontStyle).toBe('italic');
  });
});

describe('makeStyles', () => {
  const useStyles = makeStyles((t) => ({ outline: { borderColor: t.semantic.border.control } }));
  function Probe() {
    const styles = useStyles();
    return <Text style={styles.outline}>probe</Text>;
  }

  it('switches to increase-contrast token variants', async () => {
    const standard = await renderWithI18n(
      <ThemeProvider contrast="standard">
        <Probe />
      </ThemeProvider>,
    );
    expect(flat(standard.getByText('probe')).borderColor).toBe(tokens.semantic.border.control);

    const high = await renderWithI18n(
      <ThemeProvider contrast="high">
        <Probe />
      </ThemeProvider>,
    );
    expect(flat(high.getByText('probe')).borderColor).toBe(
      tokens.semantic.increaseContrast.borderControl,
    );
  });
});

describe('auto-fit maths', () => {
  it('wraps greedily by words and breaks words longer than a line', () => {
    const size = 10;
    const measure = { fontSize: size, advanceRatio: 0.5, width: 50 }; // 10 chars per line
    expect(estimateLineCount({ ...measure, text: 'short' })).toBe(1);
    expect(estimateLineCount({ ...measure, text: 'hello you again' })).toBe(2);
    expect(estimateLineCount({ ...measure, text: 'abcdefghijklmnopqrstuvwxy' })).toBe(3);
    expect(estimateLineCount({ ...measure, text: 'a\nb' })).toBe(2);
  });

  it('picks the largest size that fits and falls back to the minimum', () => {
    const base = { advanceRatio: 0.5, width: 100, maxSize: 20, minSize: 10, maxLines: 1 };
    expect(fitFontSize({ ...base, text: 'abcdefghij' })).toBe(20);
    expect(fitFontSize({ ...base, text: 'abcdefghijklmnop' })).toBe(12.5);
    expect(fitFontSize({ ...base, text: 'a'.repeat(80) })).toBe(10);
  });

  it('treats truncated platform lines as overflow', () => {
    expect(isOverflowing([{ text: 'ONE TWO' }], 'ONE TWO', 1)).toBe(false);
    expect(isOverflowing([{ text: 'ONE…' }], 'ONE TWO', 1)).toBe(true);
  });
});

describe('gallery registry', () => {
  it('lists the Text fixtures and renders each one', async () => {
    expect(listComponents()).toContain('Text');
    const states = fixturesFor('Text');
    expect(states.map((fixture) => fixture.state)).toEqual(
      expect.arrayContaining(['all variants', 'h1 auto-fit long title']),
    );
    for (const fixture of states) {
      const screen = await renderWithI18n(<ThemeProvider>{fixture.render()}</ThemeProvider>);
      expect(screen.toJSON()).not.toBeNull();
      await act(() => screen.unmount());
    }
  });
});
