import { describe, expect, it } from 'vitest';

import { displayDelta, roundEach, roundEstimate, roundedMean } from '../../src/display/round';
import { money } from '../../src/money/money';

describe('display rounding', () => {
  it('rounds "each" figures to whole major units, half up', () => {
    expect(roundEach(money(130_950n, 'USD'))).toEqual(money(131_000n, 'USD'));
    expect(roundEach(money(130_949n, 'USD'))).toEqual(money(130_900n, 'USD'));
    expect(roundEach(money(-150n, 'USD'))).toEqual(money(-200n, 'USD'));
    expect(roundEach(money(1_234n, 'JPY'))).toEqual(money(1_234n, 'JPY'));
  });

  it('takes a delta between rounded labels so the label matches the odometer', () => {
    expect(displayDelta(money(130_949n, 'USD'), money(133_350n, 'USD'))).toEqual(
      money(2_500n, 'USD'),
    );
  });

  it('rounds a crew mean', () => {
    expect(roundedMean([100n, 250n], 'USD')).toEqual(money(200n, 'USD'));
    expect(roundedMean([], 'USD')).toEqual(money(0n, 'USD'));
  });
});

describe('estimate rounding', () => {
  const of = (amountMinor: bigint, currency: 'VND' | 'USD' | 'IDR') =>
    roundEstimate({ amountMinor, currency }).amountMinor;

  it('keeps three significant digits of a dong estimate', () => {
    expect(of(3_343_912n, 'VND')).toBe(3_340_000n);
    expect(of(466_592n, 'VND')).toBe(467_000n);
    expect(of(933_184n, 'VND')).toBe(933_000n);
    expect(of(-2_345_000n, 'VND')).toBe(-2_350_000n);
  });

  it('is never finer than the cash step', () => {
    expect(of(45_678n, 'VND')).toBe(46_000n);
    expect(of(400n, 'VND')).toBe(0n);
    // Rupiah is stored with two decimals: Rp 45.678,00 reads Rp 46.000.
    expect(of(4_567_800n, 'IDR')).toBe(4_600_000n);
  });

  it('leaves a small dollar estimate at whole dollars and rounds a large one', () => {
    expect(of(20_200n, 'USD')).toBe(20_200n);
    expect(of(20_249n, 'USD')).toBe(20_200n);
    expect(of(123_456n, 'USD')).toBe(123_000n);
    expect(of(0n, 'USD')).toBe(0n);
  });
});
