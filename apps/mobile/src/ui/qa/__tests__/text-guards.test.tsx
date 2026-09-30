import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import type { TextStyle } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { renderWithI18n } from '../../../lib/i18n/testing';
import { PillButton } from '../../buttons/PillButton';
import { renderUi } from '../../test-support/render';
import { ThemeProvider } from '../../../lib/theme';
import { AUTO_FIT_WRAP_LINES } from '../../text/auto-fit';
import { Text } from '../../text/Text';
import { hasWordBreak, isTruncated, textLayoutProblems } from '../text-layout-check';
import { setUiQaSink, UI_QA_ENABLED } from '../ui-qa';

const CONTENT_WIDTH = 390 - 2 * tokens.size.gutter;

let reports: string[] = [];
beforeEach(() => {
  reports = [];
  setUiQaSink((line) => reports.push(line));
});
afterEach(() => setUiQaSink(null));

async function renderText(ui: ReactElement, locale = 'en', fontScale = 1) {
  return renderWithI18n(<ThemeProvider fontScale={fontScale}>{ui}</ThemeProvider>, { locale });
}

function flat(element: { props: { style?: unknown } }): TextStyle {
  return StyleSheet.flatten(element.props.style as TextStyle) ?? {};
}

function lines(...texts: string[]) {
  return { nativeEvent: { lines: texts.map((text) => ({ text })) } };
}

type Screen = Awaited<ReturnType<typeof renderText>>;

/**
 * Lays the text out, then answers each render with `layout` as the platform would, until the fit
 * stops changing it or `until` holds.
 */
async function fit(
  screen: Screen,
  layout: ReturnType<typeof lines>,
  until: (numberOfLines: number | undefined) => boolean = () => false,
) {
  await fireEvent(screen.getByTestId('t'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: CONTENT_WIDTH, height: 0 } },
  });
  for (let i = 0; i < 20; i += 1) {
    if (until(screen.getByTestId('t').props.numberOfLines as number | undefined)) return;
    await fireEvent(screen.getByTestId('t'), 'textLayout', layout);
  }
}

describe('layout checks', () => {
  it('finds a word split across lines, but not a word-wrapped line or a script without spaces', () => {
    expect(hasWordBreak([{ text: 'SG' }, { text: 'N' }])).toBe(true);
    expect(hasWordBreak([{ text: 'CRITTERPA' }, { text: 'SS' }])).toBe(true);
    expect(hasWordBreak([{ text: 'WHAT SHOULD THE ' }, { text: 'GUIDES CALL YOU?' }])).toBe(false);
    expect(hasWordBreak([{ text: 'BẠN LÀ ' }, { text: 'GÌ?' }])).toBe(false);
    expect(hasWordBreak([{ text: '京都の' }, { text: '旅' }])).toBe(false);
  });

  it('finds lost characters and a trailing ellipsis', () => {
    expect(isTruncated([{ text: 'WHAT SHOUL…' }], 'WHAT SHOULD THE GUIDES CALL YOU?')).toBe(true);
    expect(
      isTruncated([{ text: 'PICK YOUR ' }, { text: 'PASSPORT PHOTO' }], 'PICK YOUR PASSPORT PHOTO'),
    ).toBe(false);
  });

  it('reads a shorter layout of text with no line limit as stale, not cut', () => {
    // A streaming answer grows between the layout and the event: the lines hold the earlier text.
    const stale = {
      lines: [{ text: "Let me check what the weather's actually " }],
      text: "Let me check what the weather's actually doing in Ubud",
      truncationIsBug: true,
    };
    expect(textLayoutProblems({ ...stale, lineLimited: false })).toEqual([]);
    expect(textLayoutProblems({ ...stale, lineLimited: true })).toEqual(['TEXT_TRUNCATED']);
  });

  it('treats a caller-chosen ellipsis as intended', () => {
    const cut = { lines: [{ text: 'HO CHI MINH…' }], text: 'HO CHI MINH CITY' };
    expect(textLayoutProblems({ ...cut, truncationIsBug: false })).toEqual([]);
    expect(textLayoutProblems({ ...cut, truncationIsBug: true })).toEqual(['TEXT_TRUNCATED']);
  });

  it('finds a one-line label laid out on two lines', () => {
    const wrapped = { lines: [{ text: 'PING ' }, { text: 'ALL' }], text: 'PING ALL' };
    expect(textLayoutProblems({ ...wrapped, truncationIsBug: false, singleLine: true })).toEqual([
      'TEXT_WRAPPED',
    ]);
    expect(textLayoutProblems({ ...wrapped, truncationIsBug: false })).toEqual([]);
    expect(
      textLayoutProblems({
        lines: [{ text: 'PING ALL' }],
        text: 'PING ALL',
        truncationIsBug: false,
        singleLine: true,
      }),
    ).toEqual([]);
  });
});

describe('Text fit rules', () => {
  it('is on under Jest (a dev build)', () => {
    expect(UI_QA_ENABLED).toBe(true);
  });

  it('wraps a single-line display headline at its floor instead of cutting it', async () => {
    const screen = await renderText(
      <Text variant="displayHero" testID="t">
        What should the guides call you?
      </Text>,
    );
    // No line limit while fitting: iOS reports a truncated line with its full text.
    expect(screen.getByTestId('t').props.numberOfLines).toBeUndefined();
    const start = flat(screen.getByTestId('t')).fontSize ?? 0;
    await fit(screen, lines('WHAT SHOULD THE ', 'GUIDES CALL YOU?'));
    expect(flat(screen.getByTestId('t')).fontSize).toBeCloseTo(start * 0.7, 5);
    expect(screen.getByTestId('t').props.numberOfLines).toBeUndefined();
    expect(reports).toEqual([]);
  });

  it('keeps a screen title on h1: 44 pt, up to three lines', async () => {
    const screen = await renderText(
      <Text variant="h1" testID="t">
        Pick your passport photo
      </Text>,
    );
    expect(flat(screen.getByTestId('t')).fontSize).toBe(44);
    await fit(screen, lines('PICK YOUR ', 'PASSPORT PHOTO'));
    expect(flat(screen.getByTestId('t')).fontSize).toBe(44);
    expect(screen.getByTestId('t').props.numberOfLines).toBeUndefined();
  });

  it('cuts at the line count the caller chose, and says nothing about it', async () => {
    const screen = await renderText(
      <Text variant="displayXl" numberOfLines={1} testID="t">
        Delayed 2h 10m
      </Text>,
    );
    await fit(screen, lines('DELAYED ', '2H 10M'));
    expect(screen.getByTestId('t').props.numberOfLines).toBe(1);
    await fireEvent(screen.getByTestId('t'), 'textLayout', lines('DELAYED 2H 10M'));
    expect(reports).toEqual([]);
  });
});

describe('Text guards', () => {
  it('does not report a growing voice line laid out before its latest text', async () => {
    const screen = await renderText(
      <Text variant="voice" testID="t">
        Let me check what the weather&apos;s actually doing in Ubud for your dates.
      </Text>,
    );
    await fireEvent(
      screen.getByTestId('t'),
      'textLayout',
      lines("Let me check what the weather's "),
    );
    expect(reports).toEqual([]);
  });

  it('reports a headline still cut after wrapping, as iOS lays it out', async () => {
    const screen = await renderText(
      <Text variant="displayHero" testID="t">
        What should the guides call you?
      </Text>,
    );
    await fit(screen, lines('WHAT ', 'SHOULD ', 'THE ', 'GUIDES CALL YOU?'), (n) => n === 3);
    expect(screen.getByTestId('t').props.numberOfLines).toBe(AUTO_FIT_WRAP_LINES);
    expect(reports).toEqual([]);
    // The cut layout: iOS still reports the last line with all of its text.
    await fireEvent(
      screen.getByTestId('t'),
      'textLayout',
      lines('WHAT ', 'SHOULD ', 'THE GUIDES CALL YOU?'),
    );
    expect(reports).toEqual(['[ui-qa] TEXT_TRUNCATED "t" displayHero']);
  });

  it('shrinks a split word to its floor, then reports it once, naming the text without a test id', async () => {
    const screen = await renderText(<Text variant="h3">SGN</Text>);
    const start = flat(screen.getByText('SGN')).fontSize ?? 0;
    for (let i = 0; i < 12; i += 1) {
      await fireEvent(screen.getByText('SGN'), 'textLayout', lines('SG', 'N'));
    }
    expect(flat(screen.getByText('SGN')).fontSize).toBeCloseTo(start * 0.7, 5);
    expect(reports).toEqual(['[ui-qa] TEXT_WORD_BROKEN "SGN" h3']);
  });

  it('keeps an uppercase word whole by shrinking it, and says nothing once it fits', async () => {
    const screen = await renderText(<Text variant="title">Kilometres</Text>);
    const start = flat(screen.getByText('KILOMETRES')).fontSize ?? 0;
    await fireEvent(screen.getByText('KILOMETRES'), 'textLayout', lines('KILOMET', 'RES'));
    const shrunk = flat(screen.getByText('KILOMETRES')).fontSize ?? 0;
    expect(shrunk).toBeLessThan(start);
    await fireEvent(screen.getByText('KILOMETRES'), 'textLayout', lines('KILOMETRES'));
    expect(flat(screen.getByText('KILOMETRES')).fontSize).toBe(shrunk);
    expect(reports).toEqual([]);
  });

  it('leaves body copy at its size when a long word breaks', async () => {
    const screen = await renderText(<Text variant="body">Supercalifragilistic</Text>);
    const start = flat(screen.getByText('Supercalifragilistic')).fontSize;
    await fireEvent(
      screen.getByText('Supercalifragilistic'),
      'textLayout',
      lines('Supercalifrag', 'ilistic'),
    );
    expect(flat(screen.getByText('Supercalifragilistic')).fontSize).toBe(start);
  });

  it('wraps a single-line variant with fitting off instead of cutting it', async () => {
    const screen = await renderText(
      <Text variant="displayMega" autoFit={false} testID="t">
        Việt Nam · đặt chỗ · chuyến đi
      </Text>,
      'vi',
    );
    expect(screen.getByTestId('t').props.numberOfLines).toBeUndefined();
  });

  it('stays quiet for text that fits and while the fit is still settling', async () => {
    const screen = await renderText(
      <Text variant="h1" testID="t">
        Where’s home?
      </Text>,
    );
    // Before its width is known the fit hasn't started: an overflowing first pass is expected.
    await fireEvent(screen.getByTestId('t'), 'textLayout', lines('WHERE’S HO…'));
    expect(reports).toEqual([]);
    await fireEvent(screen.getByTestId('t'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: CONTENT_WIDTH, height: 0 } },
    });
    await fireEvent(screen.getByTestId('t'), 'textLayout', lines('WHERE’S HOME?'));
    expect(reports).toEqual([]);
  });
});

describe('one-line label guard', () => {
  it('reports a label variant that wrapped at the default text size', async () => {
    const screen = await renderText(<Text variant="label">Ping all</Text>);
    await fireEvent(screen.getByText('PING ALL'), 'textLayout', lines('PING ', 'ALL'));
    expect(reports).toEqual(['[ui-qa] TEXT_WRAPPED "PING ALL" label']);
  });

  it('reports a pill button label still wrapped at its smallest size, not while it shrinks', async () => {
    const screen = await renderUi(
      <ThemeProvider fontScale={1}>
        <PillButton label="Ping all" size="sm" onPress={() => {}} />
      </ThemeProvider>,
    );
    await fireEvent(screen.getByText('PING ALL'), 'textLayout', lines('PING ', 'ALL'));
    expect(reports).toEqual([]);
    // Each wrap shrinks the label a step; at its floor the wrap is real.
    for (let step = 0; step < 8; step += 1) {
      await fireEvent(screen.getByText('PING ALL'), 'textLayout', lines('PING ', 'ALL'));
    }
    expect(new Set(reports)).toEqual(new Set(['[ui-qa] TEXT_WRAPPED "PING ALL" buttonSm']));
  });

  it('stays quiet for wrapping body copy, an opted-out label and larger text sizes', async () => {
    const body = await renderText(<Text variant="body">Ping everyone on the trip</Text>);
    await fireEvent(
      body.getByText('Ping everyone on the trip'),
      'textLayout',
      lines('Ping everyone ', 'on the trip'),
    );
    const optedOut = await renderText(
      <Text variant="label" singleLine={false}>
        Ping all
      </Text>,
    );
    await fireEvent(optedOut.getByText('PING ALL'), 'textLayout', lines('PING ', 'ALL'));
    const large = await renderText(<Text variant="label">Ping crew</Text>, 'en', 2);
    await fireEvent(large.getByText('PING CREW'), 'textLayout', lines('PING ', 'CREW'));
    expect(reports).toEqual([]);
  });
});
