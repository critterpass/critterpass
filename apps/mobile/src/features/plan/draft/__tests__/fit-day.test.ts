import { describe, expect, it } from '@jest/globals';

import { roomiestDay } from '../data/fit-day';
import type { ReviewDay } from '../data/version';

function day(dayNo: number, stops: number): ReviewDay {
  return {
    dayNo,
    date: `2026-10-${18 + dayNo}`,
    title: '',
    stops: Array.from({ length: stops }, (_, i) => ({
      name: `Stop ${i}`,
      startsAt: '2026-10-19T03:00:00Z',
      tz: 'Asia/Ho_Chi_Minh',
      locked: false,
    })),
    owners: [],
    optional: false,
    closed: false,
    booked: false,
    lottery: null,
  };
}

describe('the day to fit something into', () => {
  it('is the middle day with the fewest stops, the earliest on a tie', () => {
    expect(roomiestDay([day(1, 1), day(2, 5), day(3, 3), day(4, 1)])).toBe(3);
    expect(roomiestDay([day(1, 3), day(2, 2), day(3, 2), day(4, 3)])).toBe(2);
  });

  it('falls back to the arrival and departure days when there is nothing between them', () => {
    expect(roomiestDay([day(1, 3), day(2, 1)])).toBe(2);
    expect(roomiestDay([])).toBeUndefined();
  });
});
