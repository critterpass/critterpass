/**
 * Short money amounts ("Rp 450K" on the add button): the runtime's compact form where it has one,
 * and the same shape where it does not (Hermes on iOS writes a compact number out in full).
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { compactNumber, formatShort } from '../format';

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

  it('leaves small amounts whole', () => {
    expect(formatShort(6_800n, 'USD', 'en')).toBe('US$68');
  });
});
