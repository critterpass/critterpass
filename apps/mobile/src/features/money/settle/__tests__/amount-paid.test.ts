import { describe, expect, it } from '@jest/globals';

import {
  amountPaidAfterEdit,
  amountPaidDigits,
  amountPaidMinor,
  amountPaidText,
  isAmountPaidValid,
} from '../amount-paid';

/** Types `keys` one at a time at the end of the field, as the number pad does. */
function type(keys: string, currency: string, locale: string, from = ''): string {
  return [...keys].reduce((digits, key) => {
    const shown = amountPaidText(digits, currency, locale);
    return amountPaidAfterEdit(digits, shown, `${shown}${key}`);
  }, from);
}

/** One press of delete at the end of the field. */
function erase(digits: string, currency: string, locale: string): string {
  const shown = amountPaidText(digits, currency, locale);
  return amountPaidAfterEdit(digits, shown, shown.slice(0, -1));
}

describe('amount paid', () => {
  it('shows what is owed as money in the currency, not as minor units', () => {
    for (const [amount, currency, locale, text] of [
      [18_640n, 'USD', 'en', 'US$186.40'],
      [18_640n, 'USD', 'de', '186,40 US$'],
      [1_250_000n, 'VND', 'en', '₫1,250,000'],
      [1_250_000n, 'VND', 'vi', '1.250.000 ₫'],
      [12_500n, 'KWD', 'en', 'KWD 12.500'],
      [45_000_000n, 'IDR', 'id', 'Rp 450.000'],
    ] as const) {
      const shown = amountPaidText(amountPaidDigits(amount, currency), currency, locale);
      expect(shown.replace(/\s/gu, ' ')).toBe(text);
    }
    expect(amountPaidText('', 'USD', 'en')).toBe('');
  });

  it('reads typed digits in the currency own units, cents and all', () => {
    // Two decimals: the last two digits are cents, as on the expense keypad.
    expect(amountPaidText(type('100', 'USD', 'en'), 'USD', 'en')).toBe('US$1.00');
    expect(amountPaidMinor(type('100', 'USD', 'en'), 18_640n, 'USD')).toBe(100n);
    expect(amountPaidMinor(type('10000', 'USD', 'en'), 18_640n, 'USD')).toBe(10_000n);
    // No decimals: the digits are the amount.
    expect(amountPaidMinor(type('500000', 'VND', 'vi'), 1_250_000n, 'VND')).toBe(500_000n);
    // Three decimals: the last three digits are fils.
    expect(amountPaidText(type('5250', 'KWD', 'en'), 'KWD', 'en')).toMatch(/^KWD\s5\.250$/u);
    expect(amountPaidMinor(type('5250', 'KWD', 'en'), 12_500n, 'KWD')).toBe(5_250n);
    // Rupiah are typed whole and stored with their sen.
    expect(amountPaidMinor(type('200000', 'IDR', 'id'), 45_000_000n, 'IDR')).toBe(20_000_000n);
  });

  it('deletes a digit even when the symbol or a group mark is the last character', () => {
    expect(erase('1250000', 'VND', 'vi')).toBe('125000');
    expect(erase('18640', 'USD', 'de')).toBe('1864');
    expect(erase('18640', 'USD', 'en')).toBe('1864');
    expect(erase('5', 'USD', 'en')).toBe('');
    expect(erase('', 'USD', 'en')).toBe('');
  });

  it('takes a pasted amount, drops leading zeros and stops at the longest amount it holds', () => {
    expect(amountPaidAfterEdit('18640', 'US$186.40', '50.00')).toBe('5000');
    expect(amountPaidAfterEdit('', '', '007')).toBe('7');
    expect(amountPaidAfterEdit('1234567890', 'US$12,345,678.90', 'US$12,345,678.901')).toBe(
      '1234567890',
    );
  });

  it('keeps the full amount exact, and a part valid only up to what is owed', () => {
    // 450,000.50 rupiah reads "Rp 450.000": left as it is, the whole amount is paid.
    const digits = amountPaidDigits(45_000_050n, 'IDR');
    expect(digits).toBe('450000');
    expect(amountPaidMinor(digits, 45_000_050n, 'IDR')).toBe(45_000_050n);
    expect(isAmountPaidValid(18_640n, 18_640n)).toBe(true);
    expect(isAmountPaidValid(1n, 18_640n)).toBe(true);
    expect(isAmountPaidValid(0n, 18_640n)).toBe(false);
    expect(isAmountPaidValid(18_641n, 18_640n)).toBe(false);
    expect(isAmountPaidValid(amountPaidMinor('', 18_640n, 'USD'), 18_640n)).toBe(false);
  });
});
