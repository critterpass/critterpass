import { describe, expect, it } from '@jest/globals';

import type { Forecast } from '@cp/cost-engine';

import { estimateMinor, finishDeltaShown, otherSpentMinor } from '../estimates';

function forecast(extra: Partial<Forecast>): Forecast {
  return {
    spentMinor: 10_600_000n,
    plannedMinor: 26_000_000n,
    categories: [
      { category: 'stays', spentMinor: 0n, plannedMinor: 6_223_968n },
      { category: 'food', spentMinor: 0n, plannedMinor: 1_555_992n },
      { category: 'transit', spentMinor: 0n, plannedMinor: 0n },
      { category: 'fun', spentMinor: 0n, plannedMinor: 18_220_040n },
    ],
    days: [],
    finishDeltaMinor: 13_921_808n,
    biggest: null,
    ...extra,
  } as Forecast;
}

describe('the budget page figures', () => {
  it('prints planned figures as estimates, never to the single đồng', () => {
    expect(estimateMinor(6_223_968n, 'VND')).toBe(6_220_000n);
    expect(estimateMinor(1_555_992n, 'VND')).toBe(1_560_000n);
    expect(estimateMinor(26_000_000n, 'VND')).toBe(26_000_000n);
  });

  it('says how far under as the difference of the figures shown', () => {
    // Plan ₫26,000,000, forecast ₫12,078,192 → shown ₫12,100,000: ₫13,900,000 under.
    expect(finishDeltaShown(forecast({}), 'VND')).toBe(13_900_000n);
    expect(
      finishDeltaShown(forecast({ plannedMinor: null, finishDeltaMinor: null }), 'VND'),
    ).toBeNull();
  });

  it('counts what was spent outside the planned categories as OTHER', () => {
    expect(otherSpentMinor(forecast({}))).toBe(10_600_000n);
    const food = forecast({
      spentMinor: 1_600_000n,
      categories: [{ category: 'food', spentMinor: 1_600_000n, plannedMinor: 0n }],
    });
    expect(otherSpentMinor(food)).toBe(0n);
  });
});
