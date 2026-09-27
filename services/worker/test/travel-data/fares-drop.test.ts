import { describe, expect, it } from 'vitest';

import { detectFareDrop, recordObservation } from '../../src/travel-data/fare-drop';

const TODAY = '2026-09-28';

describe('detectFareDrop', () => {
  it('flags a price at least 10 % under the previous 7-day minimum', () => {
    const history = [
      { on: '2026-09-25', price_minor: 17_000 },
      { on: '2026-09-27', price_minor: 16_000 },
    ];
    expect(detectFareDrop(history, 13_900, TODAY)).toEqual({
      priceMinor: 13_900,
      previousMinMinor: 16_000,
      deltaPct: 13,
    });
  });

  it('ignores a drop under the threshold', () => {
    expect(detectFareDrop([{ on: '2026-09-27', price_minor: 15_000 }], 13_600, TODAY)).toBeNull();
  });

  it('ignores observations older than 7 days and today itself', () => {
    const history = [
      { on: '2026-09-20', price_minor: 30_000 },
      { on: TODAY, price_minor: 30_000 },
    ];
    expect(detectFareDrop(history, 13_900, TODAY)).toBeNull();
  });

  it('needs a previous price to compare with', () => {
    expect(detectFareDrop([], 1, TODAY)).toBeNull();
  });
});

describe('recordObservation', () => {
  it("replaces today's observation and drops days outside the window", () => {
    const history = [
      { on: '2026-09-19', price_minor: 1 },
      { on: '2026-09-21', price_minor: 2 },
      { on: TODAY, price_minor: 3 },
    ];
    expect(recordObservation(history, 4, TODAY)).toEqual([
      { on: '2026-09-21', price_minor: 2 },
      { on: TODAY, price_minor: 4 },
    ]);
  });
});
