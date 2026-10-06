import { describe, expect, it } from 'vitest';

import { detectRatingRings } from './anomaly';
import { phoneFromContact } from './contracts';
import { rankDirectory, wilsonLowerBound } from './ordering';
import { combineCrewAnswer } from './rating';
import { computeListingStats } from './stats';

describe('combineCrewAnswer', () => {
  it('takes the plurality verdict and, on a tie, the more cautious one', () => {
    expect(
      combineCrewAnswer([
        { verdict: 'loved', tags: [] },
        { verdict: 'loved', tags: [] },
        { verdict: 'fine', tags: [] },
      ])?.verdict,
    ).toBe('loved');
    expect(
      combineCrewAnswer([
        { verdict: 'loved', tags: [] },
        { verdict: 'not_again', tags: [] },
      ])?.verdict,
    ).toBe('not_again');
  });

  it('keeps tags two members agree on, or every tag of a lone voter', () => {
    expect(
      combineCrewAnswer([
        { verdict: 'loved', tags: ['on_time', 'fair_price'] },
        { verdict: 'loved', tags: ['on_time', 'safe_driver'] },
      ])?.tags,
    ).toEqual(['on_time']);
    expect(combineCrewAnswer([{ verdict: 'fine', tags: ['patient', 'on_time'] }])?.tags).toEqual([
      'on_time',
      'patient',
    ]);
    expect(combineCrewAnswer([])).toBeNull();
  });
});

describe('directory order', () => {
  const base = { trips: 5, listed_at: '2026-01-01T00:00:00Z' };

  it('ranks by the Wilson lower bound, so 6 of 7 beats 1 of 1', () => {
    expect(wilsonLowerBound(6, 7)).toBeGreaterThan(wilsonLowerBound(1, 1));
    const ranked = rankDirectory([
      { id: 'a', crews_loved: 1, crews_rated: 1, ...base },
      { id: 'b', crews_loved: 6, crews_rated: 7, ...base },
    ]);
    expect(ranked.map((row) => row.id)).toEqual(['b', 'a']);
  });

  it('breaks ties by trips, then the longest listed', () => {
    const ranked = rankDirectory([
      { id: 'new', crews_loved: 2, crews_rated: 2, trips: 3, listed_at: '2026-06-01T00:00:00Z' },
      { id: 'old', crews_loved: 2, crews_rated: 2, trips: 3, listed_at: '2026-01-01T00:00:00Z' },
      { id: 'busy', crews_loved: 2, crews_rated: 2, trips: 9, listed_at: '2026-09-01T00:00:00Z' },
    ]);
    expect(ranked.map((row) => row.id)).toEqual(['busy', 'old', 'new']);
  });

  it('ignores any paid, sponsored or commission field a row carries', () => {
    const rows = [
      { id: 'a', crews_loved: 3, crews_rated: 4, ...base, sponsored: false, commission_bps: 0 },
      { id: 'b', crews_loved: 2, crews_rated: 4, ...base, sponsored: true, commission_bps: 2500 },
      { id: 'c', crews_loved: 4, crews_rated: 4, ...base, paid_placement: 99, commission_bps: 900 },
    ];
    const order = rankDirectory(rows).map((row) => row.id);
    const flipped = rankDirectory(
      rows.map((row, index) => ({
        ...row,
        commission_bps: 10_000 - index,
        sponsored: index === 0,
      })),
    ).map((row) => row.id);
    expect(order).toEqual(['c', 'a', 'b']);
    expect(flipped).toEqual(order);
  });
});

describe('computeListingStats', () => {
  it('counts one combined answer per crew per trip', () => {
    const stats = computeListingStats([
      { crew_id: 'c1', trip_id: 't1', verdict: 'loved', tags: ['on_time'] },
      { crew_id: 'c1', trip_id: 't1', verdict: 'loved', tags: ['on_time'] },
      { crew_id: 'c2', trip_id: 't2', verdict: 'not_again', tags: [] },
    ]);
    expect(stats).toMatchObject({ crews_rated: 2, crews_loved: 1, crews_not_again: 1, trips: 2 });
    expect(stats.top_tags).toEqual(['on_time']);
  });
});

describe('detectRatingRings', () => {
  it('flags one account rating the same driver on several trips from new crews', () => {
    const rings = detectRatingRings([
      { user_id: 'u1', trip_id: 't1', crew_id: 'c1', crew_age_days: 3 },
      { user_id: 'u1', trip_id: 't2', crew_id: 'c2', crew_age_days: 5 },
      { user_id: 'u2', trip_id: 't3', crew_id: 'c3', crew_age_days: 2 },
      { user_id: 'u3', trip_id: 't4', crew_id: 'c4', crew_age_days: 400 },
      { user_id: 'u3', trip_id: 't5', crew_id: 'c4', crew_age_days: 500 },
    ]);
    expect(rings).toEqual([{ user_id: 'u1', trips: ['t1', 't2'], crews: ['c1', 'c2'] }]);
  });
});

describe('phoneFromContact', () => {
  it('reads an E.164 number from a bare number or a contact record', () => {
    expect(phoneFromContact('+62 812-3456-7890')).toBe('+6281234567890');
    expect(phoneFromContact('{"whatsapp":"+6281234567890"}')).toBe('+6281234567890');
    expect(phoneFromContact('no number here')).toBeNull();
  });
});
