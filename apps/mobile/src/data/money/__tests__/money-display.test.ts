/**
 * The app-wide price display: each of HOME / LOCAL / BOTH in its locale, the home currency from a
 * choice or the home airport's country, conversions through the newest fx run (direct or via a
 * shared base), a missing rate falling back to the price's own currency, the stale-rate label, and
 * Vietnamese đồng grouped correctly on a runtime without `formatToParts` (Hermes on iPhone).
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { FxSnapshot } from '@cp/cost-engine';

import {
  convertMoney,
  fxAsOf,
  moneyDisplayOf,
  priceText,
  type MoneyDisplay,
} from '../money-display';

const FX: readonly FxSnapshot[] = [
  { base: 'USD', quote: 'IDR', rate: '16000', asOf: '2026-10-02', source: 'ecb' },
  { base: 'USD', quote: 'SGD', rate: '1.3653', asOf: '2026-10-02', source: 'ecb' },
  { base: 'USD', quote: 'VND', rate: '25000', asOf: '2026-10-02', source: 'ecb' },
];

const display = (mode: 'home' | 'local' | 'both', home: string | null = 'SGD'): MoneyDisplay =>
  moneyDisplayOf({ priceDisplay: mode, homeCurrencyOverride: home, homeCountry: null, fx: FX });

/** Spaces as the runtime writes them (no-break and narrow no-break) read as plain spaces. */
const plain = (text: string) => text.replace(/[\u00a0\u202f]/gu, ' ');

afterEach(() => {
  jest.restoreAllMocks();
});

describe('moneyDisplayOf', () => {
  it('takes the chosen home currency, else the home airport country’s, and LOCAL by default', () => {
    expect(
      moneyDisplayOf({ priceDisplay: null, homeCurrencyOverride: null, homeCountry: 'SG', fx: [] }),
    ).toMatchObject({ mode: 'local', homeCurrency: 'SGD', homeFromAirport: true });
    expect(
      moneyDisplayOf({
        priceDisplay: 'both',
        homeCurrencyOverride: 'EUR',
        homeCountry: 'SG',
        fx: [],
      }),
    ).toMatchObject({ mode: 'both', homeCurrency: 'EUR', homeFromAirport: false });
    expect(
      moneyDisplayOf({
        priceDisplay: 'weird',
        homeCurrencyOverride: null,
        homeCountry: null,
        fx: [],
      }),
    ).toMatchObject({ mode: 'local', homeCurrency: null });
  });
});

describe('priceText', () => {
  it('shows the 3n-8 sample in each mode', () => {
    expect(plain(priceText(7_500_000n, 'IDR', 'id-ID', display('local')))).toBe('Rp 75.000');
    expect(plain(priceText(7_500_000n, 'IDR', 'id-ID', display('both')))).toBe(
      'Rp 75.000 ≈ S$ 6,40',
    );
    expect(plain(priceText(7_500_000n, 'IDR', 'en-SG', display('home')))).toBe('S$6.40');
  });

  it('shows a price already in the home currency once, whatever the mode', () => {
    expect(priceText(640n, 'SGD', 'en-SG', display('both'))).toBe('S$6.40');
  });

  it('falls back to the price’s own currency with no rate or no home currency', () => {
    expect(plain(priceText(1000n, 'THB', 'en', display('both')))).toBe(
      plain(priceText(1000n, 'THB', 'en', display('local'))),
    );
    expect(plain(priceText(7_500_000n, 'IDR', 'id-ID', display('home', null)))).toBe('Rp 75.000');
  });

  it('groups Vietnamese đồng where Intl has no formatToParts, as on iPhone', () => {
    const Real = Intl.NumberFormat;
    function NoParts(locale?: string | string[], options: Intl.NumberFormatOptions = {}) {
      const formatter = new Real(locale, options);
      return {
        format: (value: number | bigint | Intl.StringNumericLiteral) => formatter.format(value),
        resolvedOptions: () => formatter.resolvedOptions(),
      };
    }
    jest
      .spyOn(Intl, 'NumberFormat')
      .mockImplementation(NoParts as unknown as typeof Intl.NumberFormat);
    expect(plain(priceText(1_250_000n, 'VND', 'vi-VN', display('local')))).toBe('1.250.000 ₫');
    expect(plain(priceText(1_250_000n, 'VND', 'vi-VN', display('both')))).toBe(
      '1.250.000 ₫ ≈ 68,26 S$',
    );
  });
});

describe('convertMoney', () => {
  it('converts through a shared base and directly, and gives up on an unknown pair', () => {
    expect(convertMoney({ amountMinor: 7_500_000n, currency: 'IDR' }, 'SGD', FX)).toEqual({
      amountMinor: 640n,
      currency: 'SGD',
    });
    expect(convertMoney({ amountMinor: 100n, currency: 'USD' }, 'SGD', FX)).toEqual({
      amountMinor: 137n,
      currency: 'SGD',
    });
    expect(convertMoney({ amountMinor: 100n, currency: 'THB' }, 'SGD', FX)).toBeNull();
    // Pairs that meet in a shared quote (each currency priced in euro).
    const euro: FxSnapshot[] = [
      { base: 'IDR', quote: 'EUR', rate: '0.0000575', asOf: '2026-10-02', source: 'x' },
      { base: 'SGD', quote: 'EUR', rate: '0.69', asOf: '2026-10-02', source: 'x' },
    ];
    expect(convertMoney({ amountMinor: 7_500_000n, currency: 'IDR' }, 'SGD', euro)?.currency).toBe(
      'SGD',
    );
  });
});

describe('fxAsOf', () => {
  it('reads the run date and calls it stale after two days', () => {
    expect(fxAsOf(display('both'), new Date('2026-10-03T09:00:00Z'))).toEqual({
      asOf: '2026-10-02',
      stale: false,
    });
    expect(fxAsOf(display('both'), new Date('2026-10-06T09:00:00Z')).stale).toBe(true);
    expect(
      fxAsOf(
        moneyDisplayOf({
          priceDisplay: null,
          homeCurrencyOverride: null,
          homeCountry: null,
          fx: [],
        }),
        new Date(),
      ),
    ).toEqual({ asOf: null, stale: false });
  });
});
