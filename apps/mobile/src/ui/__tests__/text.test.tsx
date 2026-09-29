import { act, fireEvent } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import type { TextStyle } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { renderWithI18n } from '../../lib/i18n/testing';
import { PillButton } from '../buttons/PillButton';
import { setUiQaSink } from '../qa/ui-qa';
import { renderUi } from '../test-support/render';
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
    // Unlimited while fitting, so the platform reports the real line count (iOS reports a
    // truncated line with its full text); the fit keeps it within the 3 lines below.
    expect(screen.getByTestId('title').props.numberOfLines).toBeUndefined();
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

  it('sets a headline at the size its render uses, inside the variant range', async () => {
    const sized = (designSize?: number) =>
      renderText(
        <Text variant="h1" testID="h" autoFit={false} designSize={designSize}>
          Your pass
        </Text>,
      );
    expect(flat((await sized()).getByTestId('h')).fontSize).toBe(44);
    expect(flat((await sized(48)).getByTestId('h')).fontSize).toBe(48);
    expect(flat((await sized(80)).getByTestId('h')).fontSize).toBe(52);
    expect(flat((await sized(20)).getByTestId('h')).fontSize).toBe(40);
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

  it('resolves the face per script: Archivo width steps, system CJK, Mynerve voice', async () => {
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
    expect(flat(voice.getByTestId('v')).fontFamily).toBe('Mynerve-400');
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

describe('text fit on larger screens and larger text', () => {
  const lines = (...texts: string[]) => ({
    nativeEvent: { lines: texts.map((text) => ({ text })) },
  });
  const sizeOf = (element: { props: { style?: unknown } }) =>
    (StyleSheet.flatten(element.props.style as TextStyle) ?? {}).fontSize ?? 0;
  const at = (scale: number, ui: ReactElement) =>
    renderWithI18n(<ThemeProvider fontScale={scale}>{ui}</ThemeProvider>);

  it('keeps a code on one piece: an MRZ line split mid-word shrinks instead', async () => {
    const screen = await at(
      2,
      <Text variant="monoData" testID="mrz">
        P&lt;IDNWINSTON&lt;&lt;CRITTER&lt;&lt;&lt;&lt;&lt;&lt;
      </Text>,
    );
    const start = sizeOf(screen.getByTestId('mrz'));
    // Split between two filler marks, as Android laid it out at 2×: still a split code.
    await fireEvent(
      screen.getByTestId('mrz'),
      'textLayout',
      lines('P<IDNWINSTON<<CRITTER<', '<<<<<'),
    );
    expect(sizeOf(screen.getByTestId('mrz'))).toBeLessThan(start);
  });

  it('never cuts an enlarged heading: past three lines at its floor it keeps wrapping', async () => {
    const screen = await at(
      2,
      <Text variant="h1" testID="t">
        Your whole crew is going to Kyoto in cherry blossom season
      </Text>,
    );
    await fireEvent(screen.getByTestId('t'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 350, height: 0 } },
    });
    const tooMany = lines(
      'YOUR WHOLE ',
      'CREW IS ',
      'GOING TO ',
      'KYOTO IN ',
      'CHERRY ',
      'BLOSSOM SEASON',
    );
    for (let i = 0; i < 20; i += 1) {
      await fireEvent(screen.getByTestId('t'), 'textLayout', tooMany);
    }
    expect(screen.getByTestId('t').props.numberOfLines).toBeUndefined();
  });

  it('still cuts at three lines at the default text size, as the design sets h1', async () => {
    const screen = await at(
      1,
      <Text variant="h1" testID="t">
        Your whole crew is going to Kyoto in cherry blossom season
      </Text>,
    );
    await fireEvent(screen.getByTestId('t'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 350, height: 0 } },
    });
    const tooMany = lines(
      'YOUR WHOLE ',
      'CREW IS ',
      'GOING TO ',
      'KYOTO IN ',
      'CHERRY ',
      'BLOSSOM SEASON',
    );
    for (let i = 0; i < 20; i += 1) {
      await fireEvent(screen.getByTestId('t'), 'textLayout', tooMany);
    }
    expect(screen.getByTestId('t').props.numberOfLines).toBe(3);
  });
});

describe('pill labels', () => {
  it('lets a large CTA wrap to its second line, and reports a small pill that wraps', async () => {
    const reports: string[] = [];
    setUiQaSink((line) => reports.push(line));
    try {
      const wrap = {
        nativeEvent: { lines: [{ text: 'BOOK THE RYOKAN ' }, { text: 'FOR ALL SIX' }] },
      };
      const large = await renderUi(
        <ThemeProvider fontScale={1}>
          <PillButton label="Book the ryokan for all six" onPress={() => {}} />
        </ThemeProvider>,
      );
      await fireEvent(large.getByText('BOOK THE RYOKAN FOR ALL SIX'), 'textLayout', wrap);
      expect(reports).toEqual([]);
      await act(() => large.unmount());

      const small = await renderUi(
        <ThemeProvider fontScale={1}>
          <PillButton size="sm" label="Book the ryokan for all six" onPress={() => {}} />
        </ThemeProvider>,
      );
      await fireEvent(small.getByText('BOOK THE RYOKAN FOR ALL SIX'), 'textLayout', wrap);
      expect(reports).toEqual(['[ui-qa] TEXT_WRAPPED "BOOK THE RYOKAN FOR ALL SIX" buttonSm']);
    } finally {
      setUiQaSink(null);
    }
  });
});

describe('two-line CTA', () => {
  it('opens the leading and pads the pill once its label wraps', async () => {
    const screen = await renderUi(
      <ThemeProvider fontScale={1}>
        <PillButton label="Book the ryokan for all six" onPress={() => {}} testID="cta" />
      </ThemeProvider>,
    );
    const label = () => screen.getByText('BOOK THE RYOKAN FOR ALL SIX');
    const flatOf = (node: { props: { style?: unknown } }) =>
      StyleSheet.flatten(node.props.style as TextStyle) ?? {};
    const single = flatOf(label()).lineHeight ?? 0;
    await fireEvent(label(), 'textLayout', {
      nativeEvent: { lines: [{ text: 'BOOK THE RYOKAN ' }, { text: 'FOR ALL SIX' }] },
    });
    expect(flatOf(label()).lineHeight).toBeGreaterThan(single);
    expect(flatOf(label()).lineHeight).toBeCloseTo((flatOf(label()).fontSize ?? 0) * 1.2, 5);
    expect(flatOf(screen.getByTestId('cta')).paddingVertical).toBeGreaterThan(0);
  });
});
