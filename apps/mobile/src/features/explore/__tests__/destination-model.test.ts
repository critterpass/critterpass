import { describe, expect, it } from '@jest/globals';

import {
  flightFact,
  legendChips,
  monthBars,
  monthKeyFor,
  parseBestMonths,
  priceRows,
  type FareWire,
} from '../destination-model';

const fare = (over: Partial<FareWire>): FareWire => ({
  origin: 'SIN',
  state: 'ok',
  source: 'travelpayouts',
  price_minor: 42_000,
  currency: 'USD',
  depart_on: '2027-04-03',
  return_on: '2027-04-10',
  transfers: 0,
  duration_min: 430,
  fastest_duration_min: 415,
  days: [],
  seen_at: '2026-10-01T02:00:00Z',
  fetched_at: '2026-10-01T02:00:00Z',
  checked_at: '2026-10-01T02:00:00Z',
  via_hub: null,
  ...over,
});

const curve = Array.from({ length: 12 }, (_, index) => ({
  month: index + 1,
  crowd_index: index === 3 ? 90 : index === 0 ? 20 : 45,
  highlight_tag: index === 3 ? 'blossoms' : null,
  colour_role: index === 3 ? 'peak' : index === 0 ? 'cheapest' : 'normal',
}));

describe('month bars', () => {
  it('scales to the busiest month and keeps the quietest bar visible', () => {
    const bars = monthBars(curve);
    expect(bars).toHaveLength(12);
    expect(bars[3]).toMatchObject({ month: 4, fraction: 1, role: 'peak', highlight: 'blossoms' });
    expect(bars[0]?.fraction).toBeCloseTo(20 / 90);
    expect(monthBars([{ ...curve[0]!, crowd_index: 0 }, ...curve.slice(1)])[0]?.fraction).toBe(
      0.12,
    );
  });

  it('draws nothing for a curve that does not cover the year', () => {
    expect(monthBars(null)).toEqual([]);
    expect(monthBars(curve.slice(0, 7))).toEqual([]);
  });

  it('lists highlighted months, then the first cheapest month', () => {
    expect(legendChips(monthBars(curve))).toEqual([
      { kind: 'highlight', month: 4, tag: 'blossoms' },
      { kind: 'cheapest', month: 1 },
    ]);
  });
});

describe('the month a tapped bar prices', () => {
  const today = new Date('2026-10-01T10:00:00Z');
  it('is this year from the current month on, next year for a month already past', () => {
    expect(monthKeyFor(10, today)).toBe('2026-10');
    expect(monthKeyFor(12, today)).toBe('2026-12');
    expect(monthKeyFor(4, today)).toBe('2027-04');
  });
});

describe('price rows', () => {
  const names = new Map([['u-jordan', 'Jordan']]);
  it("puts the viewer's airport first and names the crewmates the device knows", () => {
    const rows = priceRows(
      {
        fares: [fare({ origin: 'KUL', price_minor: 31_000 }), fare({ origin: 'SIN' })],
        origins: [
          { origin: 'KUL', user_ids: ['u-jordan', 'u-unknown'] },
          { origin: 'SIN', user_ids: ['u-me'] },
        ],
      },
      'u-me',
      names,
    );
    expect(rows.map((row) => row.origin)).toEqual(['SIN', 'KUL']);
    expect(rows[0]).toMatchObject({ mine: true, names: [], others: 0 });
    expect(rows[1]).toMatchObject({
      mine: false,
      names: ['Jordan'],
      others: 1,
      price: { minor: 31_000, currency: 'USD' },
    });
  });

  it('shows no price for an airport with no fare seen', () => {
    const rows = priceRows(
      {
        fares: [fare({ origin: 'SGN', state: 'missing', price_minor: null, seen_at: null })],
        origins: [
          { origin: 'SGN', user_ids: ['u-me'] },
          { origin: 'HAN', user_ids: ['u-jordan'] },
        ],
      },
      'u-me',
      names,
    );
    expect(rows.map((row) => row.price)).toEqual([null, null]);
  });

  it('falls back to the priced airports when the answer names no one', () => {
    const rows = priceRows({ fares: [fare({})], origins: [] }, null, names);
    expect(rows).toEqual([
      expect.objectContaining({
        origin: 'SIN',
        mine: false,
        price: { minor: 42_000, currency: 'USD' },
      }),
    ]);
  });
});

describe('the flight fact', () => {
  it("prefers the viewer's home airport and rounds the fastest itinerary to hours", () => {
    const fares = [fare({ origin: 'KUL', fastest_duration_min: 500 }), fare({ origin: 'SIN' })];
    expect(flightFact(fares, 'SIN')).toEqual({ origin: 'SIN', hours: 7, transfers: 0 });
    expect(flightFact(fares, 'HAN')).toMatchObject({ origin: 'KUL', hours: 8 });
  });

  it('is absent when no fare was seen', () => {
    expect(flightFact([fare({ state: 'missing' })], 'SIN')).toBeNull();
    expect(flightFact([], null)).toBeNull();
  });
});

describe('best months from the synced catalogue', () => {
  it('reads a JSON list and drops anything that is not a month', () => {
    expect(parseBestMonths('[4,11]')).toEqual([4, 11]);
    expect(parseBestMonths('[0,13,"x",3]')).toEqual([3]);
    expect(parseBestMonths('{4,11}')).toEqual([]);
    expect(parseBestMonths(null)).toEqual([]);
  });
});
