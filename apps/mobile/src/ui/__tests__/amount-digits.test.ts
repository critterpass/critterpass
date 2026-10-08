/**
 * The digits behind a typed amount: read in the currency's own units for a currency with no
 * decimals, two and three, shown as money while typed, and turned into exact minor units.
 */
import { describe, expect, it } from '@jest/globals';

import {
  amountText,
  digitsAfterEdit,
  digitsToMinor,
  minorToDigits,
  type AmountUnit,
} from '../inputs/amount-digits';

/** Types `keys` one at a time at the end of the field, as the number pad does. */
function type(keys: string, currency: string, locale: string, unit: AmountUnit = 'display') {
  return [...keys].reduce((digits, key) => {
    const shown = amountText(digits, currency, locale, unit);
    return digitsAfterEdit(digits, shown, `${shown}${key}`);
  }, '');
}

/** One press of delete at the end of the field. */
function erase(digits: string, currency: string, locale: string): string {
  const shown = amountText(digits, currency, locale);
  return digitsAfterEdit(digits, shown, shown.slice(0, -1));
}

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

  it('reads each digit typed at the right of the amount, cents and fils included', () => {
    expect(amountText(type('100', 'USD', 'en'), 'USD', 'en')).toBe('US$1.00');
    expect(digitsToMinor(type('10000', 'USD', 'en'), 'USD')).toBe(10_000n);
    expect(digitsToMinor(type('500000', 'VND', 'vi'), 'VND')).toBe(500_000n);
    expect(plain(amountText(type('5250', 'KWD', 'en'), 'KWD', 'en'))).toBe('KWD 5.250');
    expect(digitsToMinor(type('5250', 'KWD', 'en'), 'KWD')).toBe(5_250n);
    expect(digitsToMinor(type('200000', 'IDR', 'id'), 'IDR')).toBe(20_000_000n);
  });

  it('types whole units for a figure that never needs cents', () => {
    expect(type('7440', 'USD', 'en', 'whole')).toBe('7440');
    expect(amountText('7440', 'USD', 'en', 'whole')).toBe('US$7,440');
    expect(plain(amountText('7440', 'USD', 'vi', 'whole'))).toBe('7.440 US$');
    expect(digitsToMinor('7440', 'USD', 'whole')).toBe(744_000n);
    expect(plain(amountText('25000000', 'VND', 'vi', 'whole'))).toBe('25.000.000 ₫');
    expect(digitsToMinor('25000000', 'VND', 'whole')).toBe(25_000_000n);
    expect(plain(amountText('300', 'KWD', 'en', 'whole'))).toBe('KWD 300');
    expect(digitsToMinor('300', 'KWD', 'whole')).toBe(300_000n);
    expect(minorToDigits(744_050n, 'USD', 'whole')).toBe('7440');
  });

  it('deletes a digit even when the symbol or a group mark is the last character', () => {
    expect(erase('1250000', 'VND', 'vi')).toBe('125000');
    expect(erase('18640', 'USD', 'de')).toBe('1864');
    expect(erase('18640', 'USD', 'en')).toBe('1864');
    expect(erase('5', 'USD', 'en')).toBe('');
    expect(erase('', 'USD', 'en')).toBe('');
  });

  it('takes a pasted amount, drops leading zeros and stops at the longest amount it holds', () => {
    expect(digitsAfterEdit('18640', 'US$186.40', '50.00')).toBe('5000');
    expect(digitsAfterEdit('', '', '007')).toBe('7');
    expect(digitsAfterEdit('1234567890', 'US$12,345,678.90', 'US$12,345,678.901')).toBe(
      '1234567890',
    );
  });
});
