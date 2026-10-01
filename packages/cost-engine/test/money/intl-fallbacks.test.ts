/**
 * Money text on a runtime without `NumberFormat#formatToParts`, compact notation or narrow
 * currency symbols (Hermes on iPhone). Node has all three, so each is taken away here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  compactNumber,
  formatCompactMoney,
  formatMoney,
  formatNarrowCurrency,
  money,
  withCurrencySymbol,
} from '../../src/index';

const RealNumberFormat = Intl.NumberFormat;

/** Makes `Intl.NumberFormat` behave as Hermes on iPhone does. */
function hermesOnIphone(): void {
  // A plain function, so it can be called with `new` like the constructor it stands in for.
  function HermesNumberFormat(locale?: string | string[], options: Intl.NumberFormatOptions = {}) {
    const { notation: _notation, compactDisplay: _compact, ...rest } = options;
    const formatter = new RealNumberFormat(locale, {
      ...rest,
      ...(rest.currencyDisplay === 'narrowSymbol' ? { currencyDisplay: 'code' } : {}),
    });
    return {
      format: (value: number | bigint | Intl.StringNumericLiteral) => formatter.format(value),
      resolvedOptions: () => formatter.resolvedOptions(),
    };
  }
  vi.spyOn(Intl, 'NumberFormat').mockImplementation(
    HermesNumberFormat as unknown as typeof Intl.NumberFormat,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

const local = (amountMinor: bigint, currency: string, locale: string) =>
  formatMoney(money(amountMinor, currency), { locale, mode: 'local' });

/** Spaces as the runtime writes them (no-break and narrow no-break) read as plain spaces. */
const plain = (text: string) => text.replace(/[\u00a0\u202f]/gu, ' ');

describe('money text without formatToParts', () => {
  it('reads the same as with it, for rupiah, dong and dollars, positive and negative', () => {
    const samples: readonly (readonly [bigint, string, string])[] = [
      [15_000_000n, 'IDR', 'en'],
      [-15_000_000n, 'IDR', 'en'],
      [15_000_000n, 'IDR', 'id-ID'],
      [1_250_000n, 'VND', 'en'],
      [-1_250_000n, 'VND', 'en'],
      [1_250_000n, 'VND', 'vi'],
      [-1_250_000n, 'VND', 'vi'],
      [135_000n, 'USD', 'en'],
      [-135_000n, 'USD', 'en'],
      [135_000n, 'USD', 'vi'],
    ];
    const withParts = samples.map(([minor, currency, locale]) => local(minor, currency, locale));
    hermesOnIphone();
    const without = samples.map(([minor, currency, locale]) => local(minor, currency, locale));
    expect(without.map(plain)).toEqual(withParts.map(plain));
  });

  it('groups thousands and places the symbol as the locale does', () => {
    hermesOnIphone();
    expect(plain(local(1_250_000n, 'VND', 'en'))).toBe('₫1,250,000');
    expect(plain(local(1_250_000n, 'VND', 'vi'))).toBe('1.250.000 ₫');
    expect(plain(local(15_000_000n, 'IDR', 'en'))).toBe('Rp 150,000');
    expect(plain(local(135_000n, 'USD', 'en'))).toBe('US$1,350.00');
    expect(plain(local(-135_000n, 'USD', 'en'))).toBe('-US$1,350.00');
  });
});

describe('narrow currency symbols the runtime writes as codes', () => {
  it('swaps the code for the symbol, keeping the locale placement', () => {
    hermesOnIphone();
    expect(plain(formatNarrowCurrency('en', 1350, 'USD', { maximumFractionDigits: 0 }))).toBe(
      '$1,350',
    );
    expect(plain(formatNarrowCurrency('vi', 1_250_000, 'VND', { maximumFractionDigits: 0 }))).toBe(
      '1.250.000 ₫',
    );
    expect(plain(formatNarrowCurrency('en', 150_000, 'IDR', { maximumFractionDigits: 0 }))).toBe(
      'Rp 150,000',
    );
  });

  it('leaves a symbol the runtime already wrote', () => {
    expect(plain(formatNarrowCurrency('en', 1350, 'USD', { maximumFractionDigits: 0 }))).toBe(
      '$1,350',
    );
    expect(withCurrencySymbol('$1,350', '$')).toBe('$1,350');
    expect(plain(withCurrencySymbol('IDR150,000', 'Rp'))).toBe('Rp 150,000');
    expect(withCurrencySymbol('USD 1,350', '$')).toBe('$1,350');
  });
});

describe('compact numbers without compact notation', () => {
  it('scales the number itself', () => {
    hermesOnIphone();
    expect(compactNumber('en', 450_000)).toBe('450K');
    expect(compactNumber('en', 1_080_000)).toBe('1.08M');
    expect(compactNumber('en', 2_500_000_000)).toBe('2.5B');
    expect(compactNumber('en', 950)).toBe('950');
    expect(plain(formatCompactMoney(money(7_500_000_000n, 'IDR'), { locale: 'en' }))).toBe(
      '~Rp 75M',
    );
    expect(formatCompactMoney(money(120_000n, 'USD'), { locale: 'en' })).toBe('~US$1.2K');
  });
});
