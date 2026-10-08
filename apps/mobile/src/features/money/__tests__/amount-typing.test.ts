/**
 * Typing an amount into the amount field, key by key: each digit lands at the right of the amount
 * in the currency's own units, and delete takes a digit whatever character ends the text.
 */
import { describe, expect, it } from '@jest/globals';

import { amountText, digitsToMinor, type AmountUnit } from '@/data/money/amount-digits';
import { digitsAfterEdit } from '@/ui/inputs/amount-edit';

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

describe('typing an amount', () => {
  it('reads each digit at the right of the amount, cents and fils included', () => {
    expect(amountText(type('100', 'USD', 'en'), 'USD', 'en')).toBe('US$1.00');
    expect(digitsToMinor(type('10000', 'USD', 'en'), 'USD')).toBe(10_000n);
    expect(digitsToMinor(type('500000', 'VND', 'vi'), 'VND')).toBe(500_000n);
    expect(plain(amountText(type('5250', 'KWD', 'en'), 'KWD', 'en'))).toBe('KWD 5.250');
    expect(digitsToMinor(type('5250', 'KWD', 'en'), 'KWD')).toBe(5_250n);
    expect(digitsToMinor(type('200000', 'IDR', 'id'), 'IDR')).toBe(20_000_000n);
  });

  it('types a budget in whole units, symbol after the number included', () => {
    expect(type('7440', 'USD', 'en', 'whole')).toBe('7440');
    expect(type('7440', 'USD', 'vi', 'whole')).toBe('7440');
    expect(digitsToMinor(type('25000000', 'VND', 'vi', 'whole'), 'VND', 'whole')).toBe(25_000_000n);
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
