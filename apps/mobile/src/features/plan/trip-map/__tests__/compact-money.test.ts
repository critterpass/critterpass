/** Prices on a stop read short in the currency's own symbol: "Rp 60k each", "$38". */
import { beforeAll, describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import { compactMoney } from '../format';

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('compact money', () => {
  it('shortens thousands and millions with the local symbol', () => {
    expect(compactMoney('en', 6_000_000, 'IDR')).toBe('Rp 60k');
    expect(compactMoney('en', 250_000_000, 'IDR')).toBe('Rp 2.5M');
    expect(compactMoney('en', 120_000, 'VND')).toBe('₫120k');
  });

  it('keeps small amounts whole, the sign on the number', () => {
    expect(compactMoney('en', 3_800, 'USD')).toBe('$38');
    expect(compactMoney('en', 120_000, 'USD')).toBe('$1.2k');
  });
});
