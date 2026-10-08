/**
 * The digits behind a typed amount: read in the currency's own units for a currency with no
 * decimals, two and three, written as money, and turned into exact minor units.
 */
import { describe, expect, it } from '@jest/globals';

import { amountText, digitsToMinor, minorToDigits } from '../amount-digits';

const plain = (text: string) => text.replace(/\s/gu, ' ');

describe('amount digits', () => {
  it('turns digits into exact minor units for currencies with no decimals, two and three', () => {
    // No decimals: the digits are the amount.
    expect(digitsToMinor('1250000', 'VND')).toBe(1_250_000n);
    expect(minorToDigits(1_250_000n, 'VND')).toBe('1250000');
    // Two decimals: the last two digits are cents.
    expect(digitsToMinor('18640', 'USD')).toBe(18_640n);
    expect(minorToDigits(18_640n, 'USD')).toBe('18640');
    // Three decimals: the last three digits are fils.
    expect(digitsToMinor('12500', 'KWD')).toBe(12_500n);
    expect(minorToDigits(12_500n, 'KWD')).toBe('12500');
    // Rupiah are typed whole and stored with the sen they never show.
    expect(digitsToMinor('450000', 'IDR')).toBe(45_000_000n);
    expect(minorToDigits(45_000_050n, 'IDR')).toBe('450000');
    // Nothing typed is nothing, and nothing is typed for zero.
    expect(digitsToMinor('', 'USD')).toBe(0n);
    expect(minorToDigits(0n, 'USD')).toBe('');
  });

  it('stays exact past the range a float holds', () => {
    expect(digitsToMinor('9007199254740993', 'USD')).toBe(9_007_199_254_740_993n);
    expect(minorToDigits(9_007_199_254_740_993n, 'USD')).toBe('9007199254740993');
  });

  it('shows the digits as money in the currency, symbol where the locale puts it', () => {
    for (const [digits, currency, locale, text] of [
      ['18640', 'USD', 'en', 'US$186.40'],
      ['18640', 'USD', 'de', '186,40 US$'],
      ['1250000', 'VND', 'en', '₫1,250,000'],
      ['1250000', 'VND', 'vi', '1.250.000 ₫'],
      ['12500', 'KWD', 'en', 'KWD 12.500'],
      ['450000', 'IDR', 'id', 'Rp 450.000'],
    ] as const) {
      expect(plain(amountText(digits, currency, locale))).toBe(text);
    }
    expect(amountText('', 'USD', 'en')).toBe('');
  });

  it('reads whole units for a figure that never needs cents', () => {
    expect(amountText('7440', 'USD', 'en', 'whole')).toBe('US$7,440');
    expect(plain(amountText('7440', 'USD', 'vi', 'whole'))).toBe('7.440 US$');
    expect(digitsToMinor('7440', 'USD', 'whole')).toBe(744_000n);
    expect(plain(amountText('25000000', 'VND', 'vi', 'whole'))).toBe('25.000.000 ₫');
    expect(digitsToMinor('25000000', 'VND', 'whole')).toBe(25_000_000n);
    expect(plain(amountText('300', 'KWD', 'en', 'whole'))).toBe('KWD 300');
    expect(digitsToMinor('300', 'KWD', 'whole')).toBe(300_000n);
    expect(minorToDigits(744_050n, 'USD', 'whole')).toBe('7440');
  });
});
