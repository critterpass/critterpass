import { describe, expect, it } from '@jest/globals';

import { amountPaidDigits, amountPaidMinor, isAmountPaidValid } from '../amount-paid';

describe('amount paid', () => {
  it('keeps the full amount exact, and a part valid only up to what is owed', () => {
    // 450,000.50 rupiah reads "Rp 450.000": left as it is, the whole amount is paid.
    const digits = amountPaidDigits(45_000_050n, 'IDR');
    expect(digits).toBe('450000');
    expect(amountPaidMinor(digits, 45_000_050n, 'IDR')).toBe(45_000_050n);
    // A part typed over it is read in the currency's own units.
    expect(amountPaidMinor('200000', 45_000_050n, 'IDR')).toBe(20_000_000n);
    expect(amountPaidMinor('100', 18_640n, 'USD')).toBe(100n);
    expect(isAmountPaidValid(18_640n, 18_640n)).toBe(true);
    expect(isAmountPaidValid(1n, 18_640n)).toBe(true);
    expect(isAmountPaidValid(0n, 18_640n)).toBe(false);
    expect(isAmountPaidValid(18_641n, 18_640n)).toBe(false);
    expect(isAmountPaidValid(amountPaidMinor('', 18_640n, 'USD'), 18_640n)).toBe(false);
  });
});
