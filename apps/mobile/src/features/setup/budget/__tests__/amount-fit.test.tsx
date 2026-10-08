/**
 * The sweet-spot amount's face is chosen from measured glyph widths against the card's width: a
 * dollar amount keeps the hero face, đồng and rupiah step down only until every digit is inside
 * a 375 pt phone's card, and moving the knob never changes the size. The device's text measuring
 * is the boundary here: glyph widths are fed in as a fraction of each glyph's own font size.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { amountWidth, glyphsOf, nextLevel, AMOUNT_FACES } from '../amount-fit';
import { SweetSpotCard } from '../sweet-spot-card';

// A 375 pt phone: 20 pt screen margins and the card's 16 pt padding each side.
const CARD_ROOM = 375 - 40 - 32;
/** A rendered host element, as far as these checks read it. */
interface Rendered {
  readonly props: { readonly style?: unknown; readonly testID?: unknown };
}

const WAITING = { kind: 'waiting', set: 0, of: 2 } as const;

/** A glyph's advance as a fraction of its font size: a narrow "1", narrower separators. */
function em(glyph: string): number {
  if (glyph === '1') return 0.34;
  if (/[0-9]/u.test(glyph)) return 0.5;
  if (glyph === ',' || glyph === '.') return 0.24;
  return 0.52 * [...glyph].length;
}

function fontSizeOf(node: Rendered): number {
  return (StyleSheet.flatten(node.props.style as object) as { fontSize: number }).fontSize;
}

const layout = (width: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height: 40 } } });

/** Answers every measuring pass the way a device would, until the face has settled. */
async function settle(room: number): Promise<number> {
  await fireEvent(screen.getByTestId('budget-amount-box'), 'layout', layout(room));
  let hero = 0;
  for (let pass = 0; pass < AMOUNT_FACES.length + 1; pass += 1) {
    const glyphs = screen.queryAllByTestId(/^budget-amount-glyph-/u, {
      includeHiddenElements: true,
    });
    if (glyphs.length === 0) break;
    if (pass === 0) hero = fontSizeOf(glyphs[0] as Rendered);
    for (const glyph of glyphs) {
      const char = String(glyph.props.testID).replace('budget-amount-glyph-', '');
      await fireEvent(glyph, 'layout', layout(em(char) * fontSizeOf(glyph)));
    }
  }
  return hero;
}

/** The size the amount is set at, and how wide the widest amount on the track is at that size. */
function shown(prefix: string, grouped: string) {
  const target = screen.getByTestId('budget-target', { includeHiddenElements: true });
  const size = fontSizeOf(
    within(target).getAllByText(/\d/u, { includeHiddenElements: true })[0] as Rendered,
  );
  const widest =
    (em(prefix) + [...grouped].reduce((sum, c) => sum + em(/\d/u.test(c) ? '0' : c), 0)) * size;
  return { size, widest };
}

function card(currency: string, maxMinor: number, target: number, stepMinor: number) {
  return (
    <I18nProvider i18n={i18n}>
      <GestureHandlerRootView>
        <SweetSpotCard
          band={WAITING}
          track={{ minMinor: 0, maxMinor, stepMinor }}
          currency={currency}
          target={target}
          onTarget={jest.fn()}
        />
      </GestureHandlerRootView>
    </I18nProvider>
  );
}

describe('the measured width of an amount', () => {
  it('gives every digit the widest numeral’s width, as the rolling columns do', () => {
    const amount = { prefix: '$', grouped: '1,111' };
    const widths = Object.fromEntries(glyphsOf(amount).map((glyph) => [glyph, em(glyph) * 100]));
    expect(amountWidth(amount, widths)).toBeCloseTo(52 + 4 * 50 + 24);
    expect(amountWidth(amount, { ...widths, '7': undefined as unknown as number })).toBeNull();
  });

  it('steps down only while the amount is wider than the card, and stops at the floor', () => {
    expect(nextLevel(0, 300, 303)).toBe(0);
    expect(nextLevel(0, 304, 303)).toBe(1);
    expect(nextLevel(AMOUNT_FACES.length - 1, 900, 303)).toBe(AMOUNT_FACES.length - 1);
  });
});

describe('the sweet-spot amount on a 375 pt phone', () => {
  it('keeps the hero face for $12,350', async () => {
    i18n.loadAndActivate({ locale: 'en', messages: {} });
    await render(card('USD', 1_235_000, 600_000, 5_000));
    const hero = await settle(CARD_ROOM);
    expect(shown('$', '12,350').size).toBe(hero);
    expect(shown('$', '12,350').widest).toBeLessThanOrEqual(CARD_ROOM);
  });

  it('still shows the amount when the track’s far end changes under it', async () => {
    i18n.loadAndActivate({ locale: 'en', messages: {} });
    const view = await render(card('USD', 1_235_000, 600_000, 5_000));
    await settle(CARD_ROOM);
    // Prices arrive and the track ends elsewhere: the glyphs on screen are not laid out again,
    // and the amount must not wait for them.
    await view.rerender(card('USD', 1_135_000, 600_000, 5_000));
    expect(screen.getByTestId('budget-amount-box').props.style).toMatchObject({ opacity: 1 });
  });

  it.each<[string, string, string, number, string, number]>([
    ['en', 'VND', '₫', 90_000_000, '90,000,000', 1_300_000],
    ['id', 'IDR', 'Rp', 1_500_000_000, '15.000.000', 79_000_000],
  ])(
    'sets %s %s down just far enough that every digit is inside the card',
    async (locale, currency, prefix, maxMinor, grouped, stepMinor) => {
      i18n.loadAndActivate({ locale, messages: {} });
      const view = await render(card(currency, maxMinor, stepMinor * 4, stepMinor));
      const hero = await settle(CARD_ROOM);
      const { size, widest } = shown(prefix, grouped);
      expect(size).toBeLessThan(hero);
      expect(widest).toBeLessThanOrEqual(CARD_ROOM);
      // The hero face would not have held it: the step down was needed.
      expect((widest / size) * hero).toBeGreaterThan(CARD_ROOM);
      expect(screen.getByTestId('budget-amount-box').props.style).toMatchObject({ opacity: 1 });

      // The knob moves across the track: same size, and nothing is measured again.
      for (const target of [stepMinor, maxMinor]) {
        await view.rerender(card(currency, maxMinor, target, stepMinor));
        expect(shown(prefix, grouped).size).toBe(size);
        expect(
          screen.queryAllByTestId(/^budget-amount-glyph-/u, { includeHiddenElements: true }),
        ).toHaveLength(0);
      }
    },
  );
});
