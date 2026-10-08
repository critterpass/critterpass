/**
 * Short money amounts ("Rp 450K" on the add button): the runtime's compact form where it has one,
 * and the same shape where it does not (Hermes on iOS writes a compact number out in full).
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { compactNumber } from '@cp/cost-engine';

import { formatShort, formatWhole, heroParts, heroVariant, symbolTrails } from '../format';

afterEach(() => {
  jest.restoreAllMocks();
});

/** Makes `Intl.NumberFormat` ignore `notation`, as Hermes on iOS does. */
function withoutCompactNotation(): void {
  const Real = Intl.NumberFormat;
  jest.spyOn(Intl, 'NumberFormat').mockImplementation(((
    locale?: string | string[],
    options?: Intl.NumberFormatOptions,
  ) => {
    const { notation: _ignored, ...rest } = options ?? {};
    return new Real(locale, rest);
  }) as unknown as typeof Intl.NumberFormat);
}

describe('short money amounts', () => {
  it('uses the runtime compact form', () => {
    expect(formatShort(45_000_000n, 'IDR', 'en')).toBe('Rp 450K');
    expect(formatShort(108_000_000n, 'IDR', 'en')).toBe('Rp 1.08M');
  });

  it('scales the amount itself where the runtime writes compact numbers out in full', () => {
    withoutCompactNotation();
    expect(compactNumber('en', 450_000)).toBe('450K');
    expect(compactNumber('en', 1_080_000)).toBe('1.08M');
    expect(compactNumber('en', 2_500_000_000)).toBe('2.5B');
    expect(formatShort(45_000_000n, 'IDR', 'en')).toBe('Rp 450K');
  });

  it('puts the symbol where the locale does: after the number in Vietnamese', () => {
    expect(formatShort(1_250_000n, 'VND', 'en')).toBe('₫1.25M');
    expect(formatShort(1_250_000n, 'VND', 'vi').replace(/\u00a0/gu, ' ')).toMatch(/^1,25 \S+ ₫$/u);
    expect(symbolTrails('VND', 'vi')).toBe(true);
    expect(symbolTrails('VND', 'en')).toBe(false);
    expect(symbolTrails('IDR', 'en')).toBe(false);
  });

  it('leaves whole amounts whole and keeps every cent of the rest', () => {
    expect(formatShort(6_800n, 'USD', 'en')).toBe('US$68');
    expect(formatShort(640n, 'USD', 'en')).toBe('US$6.40');
    expect(formatShort(18_640n, 'USD', 'en')).toBe('US$186.40');
    expect(formatShort(-18_640n, 'USD', 'en')).toBe('−US$186.40');
    expect(formatShort(333n, 'USD', 'en')).toBe('US$3.33');
    // Three decimals show all three; a currency with none never grows any.
    expect(formatShort(5_250n, 'KWD', 'en').replace(/\s/gu, ' ')).toBe('KWD 5.250');
    expect(formatShort(9_500n, 'VND', 'en')).toBe('₫9,500');
  });
});

describe('the hero amount', () => {
  it('steps its size down as the amount grows, so a total in đồng stays on the screen', () => {
    expect(heroVariant({ whole: 4812, prefix: '$', suffix: '' })).toBe('displayHero');
    expect(heroVariant(heroParts(350_000n, 'VND', 'en'))).toBe('displayHero');
    expect(heroVariant(heroParts(1_600_000n, 'VND', 'en'))).toBe('displayXl');
    expect(heroVariant(heroParts(10_600_000n, 'VND', 'en'))).toBe('displayXl');
    expect(heroVariant(heroParts(126_000_000n, 'VND', 'en'))).toBe('h1');
  });
});

describe('headline totals', () => {
  it("print the symbol from the app's own table, never the code run into the digits", () => {
    withoutCompactNotation();
    expect(formatWhole(10_600_000n, 'VND', 'en')).toBe('₫10,600,000');
    expect(formatWhole(10_600_000n, 'VND', 'vi')).toBe('10.600.000\u00a0₫');
    expect(formatWhole(481_200n, 'USD', 'en')).toBe('US$4,812');
    expect(formatWhole(-9_210n, 'USD', 'en')).toBe('−US$92');
  });
});
