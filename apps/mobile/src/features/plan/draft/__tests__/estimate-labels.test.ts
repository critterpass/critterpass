/**
 * The draft's estimates as labels: rounded the way every estimate is shown, in dong and in
 * dollars, with the over-budget gap taken from the rounded cost against the exact target.
 */
import { describe, expect, it } from '@jest/globals';

import { estimateMoney, overBudgetMinor, wholeMoney } from '../data/format';

describe('a draft estimate', () => {
  it('reads to three significant digits in dong, never to the single dong', () => {
    expect(estimateMoney('en', 3_343_912, 'VND')).toBe('₫3,340,000');
    expect(estimateMoney('en', 466_592, 'VND')).toBe('₫467,000');
    expect(estimateMoney('en', 45_678, 'VND')).toBe('₫46,000');
  });

  it('leaves a small dollar estimate at whole dollars and rounds a large one', () => {
    expect(estimateMoney('en', 20_249, 'USD')).toBe('$202');
    expect(estimateMoney('en', 131_049, 'USD')).toBe('$1,310');
    expect(estimateMoney('en', 123_456, 'USD')).toBe('$1,230');
  });

  it('leaves an exact amount exact', () => {
    expect(wholeMoney('en', 3_343_912, 'VND')).toBe('₫3,343,912');
  });
});

describe('over the budget', () => {
  it('is the rounded cost less the exact target, so the two labels agree', () => {
    // ₫3,343,912 each against a ₫2,600,000 target: shown as ₫3,340,000, so ₫740,000 over.
    expect(overBudgetMinor(3_343_912, 743_912, 'VND')).toBe(740_000);
  });

  it('is nothing when the rounded cost no longer reads as over', () => {
    // ₫2,600,400 against ₫2,600,000: the cost reads ₫2,600,000.
    expect(overBudgetMinor(2_600_400, 400, 'VND')).toBe(0);
    expect(overBudgetMinor(2_500_000, 0, 'VND')).toBe(0);
  });
});
