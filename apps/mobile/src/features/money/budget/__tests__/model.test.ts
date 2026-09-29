import { describe, expect, it } from '@jest/globals';

import { budgetInput, plannedByCategory, tripDayOf } from '../model';

describe('budget inputs', () => {
  it('numbers trip days from the start date, 0 before it', () => {
    expect(tripDayOf('2026-10-10', '2026-10-10')).toBe(1);
    expect(tripDayOf('2026-10-14', '2026-10-10')).toBe(5);
    expect(tripDayOf('2026-10-01', '2026-10-10')).toBe(0);
    expect(tripDayOf('2026-10-14', null)).toBe(0);
  });

  it('reads the plan breakdown with flights counted as transit', () => {
    const row = {
      target_minor: 744000,
      currency: 'USD',
      breakdown: JSON.stringify({ flights: 110000, stays: 270000, food: 150000, fun: 214000 }),
      planned_by_day: null,
      version: 1,
    };
    expect(plannedByCategory(row)).toEqual({
      stays: 270000n,
      food: 150000n,
      transit: 110000n,
      fun: 214000n,
    });
  });

  it('counts only plan items still ahead, converted to the crew currency', () => {
    const item = (id: string, startsAt: string, amount: number, currency: string) => ({
      id,
      starts_at: startsAt,
      tz: 'Asia/Makassar',
      category: 'boat tour',
      amount_minor: amount,
      currency,
      status: 'planned',
      poi_id: null,
      attendee_ids: null,
      poi_name: 'The boat day',
    });
    const input = budgetInput({
      now: new Date('2026-10-14T04:00:00Z'),
      tz: 'Asia/Makassar',
      startDate: '2026-10-10',
      days: 8,
      crewCurrency: 'USD',
      budget: null,
      expenses: [],
      planItems: [
        item('past', '2026-10-13T02:00:00Z', 1000, 'USD'),
        item('boat', '2026-10-15T01:00:00Z', 1_425_150_00, 'IDR'),
      ],
      fx: {
        snapshotId: 'fx',
        snapshots: [
          { base: 'USD', quote: 'IDR', rate: '15835', asOf: '2026-10-14', source: 'ecb' },
        ],
      },
    });
    expect(input.today).toBe(5);
    expect(input.remaining).toEqual([
      { id: 'boat', day: 6, category: 'transit', amountMinor: 9000n, label: 'The boat day' },
    ]);
    expect(input.targetMinor).toBeNull();
  });
});
