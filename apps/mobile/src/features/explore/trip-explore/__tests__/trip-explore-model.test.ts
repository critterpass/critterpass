import { describe, expect, it } from '@jest/globals';

import { planGaps, type GapItemRow } from '../plan-gaps';
import { kindCounts, nextGap, pickState } from '../trip-explore-model';

const uid = (n: number) => `00000000-0000-4000-8000-00000000000${String(n)}`;
const day = (n: number) => `00000000-0000-4000-9000-00000000000${String(n)}`;

describe('where a pick stands for the trip', () => {
  const planned = new Map([['campuhan', { dayNo: 3 }]]);
  const ideas = new Set(['tirta-empul', 'campuhan']);

  it('shows the day for a place in the plan, even when it was saved first', () => {
    expect(pickState('campuhan', planned, ideas)).toEqual({ kind: 'inDay', dayNo: 3 });
  });

  it('shows saved for a place in Ideas, whoever in the crew saved it', () => {
    expect(pickState('tirta-empul', planned, ideas)).toEqual({ kind: 'saved' });
  });

  it('offers the one-tap save for anything else', () => {
    expect(pickState('tegallalang', planned, ideas)).toEqual({ kind: 'add' });
  });
});

describe('the gap the card offers', () => {
  const gap = (date: string, from: string, who = 2) => ({
    date,
    gap: {
      day_id: day(1),
      day_no: 1,
      from,
      to: '23:00',
      minutes: 60,
      who_free: Array.from({ length: who }, (_, i) => uid(i)),
      busy: [],
      after_item: null,
      next_item: null,
    },
  });

  it('skips windows that already started today and takes the next one ahead', () => {
    const gaps = [
      gap('2026-10-14', '09:00'),
      gap('2026-10-14', '16:00'),
      gap('2026-10-15', '08:00'),
    ];
    const now = { date: '2026-10-14', minute: 10 * 60 };
    expect(nextGap(gaps, now)?.gap.from).toBe('16:00');
  });

  it('moves to a later day once today has no window left', () => {
    const gaps = [gap('2026-10-15', '08:00'), gap('2026-10-14', '09:00')];
    expect(nextGap(gaps, { date: '2026-10-14', minute: 12 * 60 })?.date).toBe('2026-10-15');
  });

  it('prefers the window more of the crew are free for when two start together', () => {
    const gaps = [gap('2026-10-14', '16:00', 2), gap('2026-10-14', '16:00', 4)];
    expect(nextGap(gaps, { date: '2026-10-13', minute: 0 })?.gap.who_free).toHaveLength(4);
  });

  it('is empty when every window is behind', () => {
    expect(nextGap([gap('2026-10-14', '09:00')], { date: '2026-10-20', minute: 0 })).toBeNull();
  });
});

describe('free windows from the synced plan', () => {
  const item = (over: Partial<GapItemRow>): GapItemRow => ({
    stable_id: uid(9),
    day_id: day(2),
    poi_id: null,
    category: 'spa',
    starts_at: null,
    ends_at: null,
    attendee_ids: [],
    locked: false,
    is_outdoor: false,
    lat: -8.5,
    lng: 115.26,
    name: null,
    ...over,
  });

  it('finds the window the others spend at the spa, and names it', () => {
    const gaps = planGaps({
      tz: 'UTC',
      driveFactor: 1,
      participants: [uid(1), uid(2), uid(3), uid(4), uid(5)],
      days: [
        { day_id: day(1), day_no: 1, date: '2026-10-13' },
        { day_id: day(2), day_no: 2, date: '2026-10-14' },
        { day_id: day(3), day_no: 3, date: '2026-10-15' },
      ],
      items: [
        // Everyone is out from 08:00 to 16:00; then only one goes to the spa until 19:00.
        item({
          stable_id: uid(7),
          starts_at: '2026-10-14T08:00:00Z',
          ends_at: '2026-10-14T16:00:00Z',
          name: 'Ubud day',
        }),
        item({
          starts_at: '2026-10-14T16:00:00Z',
          ends_at: '2026-10-14T19:00:00Z',
          attendee_ids: [uid(5)],
          name: 'Karsa Spa',
        }),
        item({
          stable_id: uid(8),
          starts_at: '2026-10-14T19:00:00Z',
          ends_at: '2026-10-14T22:00:00Z',
          name: 'Dinner',
        }),
      ],
    });
    const spa = gaps.find((entry) => entry.date === '2026-10-14' && entry.gap.from === '16:00');
    expect(spa).toBeDefined();
    expect(spa?.gap.who_free).toHaveLength(4);
    expect(spa?.busyName).toBe('Karsa Spa');
  });

  describe('for someone travelling alone', () => {
    const solo = (items: GapItemRow[]) =>
      planGaps({
        tz: 'Asia/Makassar',
        driveFactor: 1,
        participants: [uid(1)],
        days: [
          { day_id: day(1), day_no: 1, date: '2026-10-22' },
          { day_id: day(2), day_no: 2, date: '2026-10-23' },
        ],
        items,
      });

    it('leaves a day with one early stop open for the rest of it', () => {
      // 07:00–07:45 local on the second day (UTC+8).
      const gaps = solo([
        item({ starts_at: '2026-10-22T23:00:00Z', ends_at: '2026-10-22T23:45:00Z' }),
      ]);
      const friday = gaps.filter((entry) => entry.date === '2026-10-23');
      expect(friday.map((entry) => [entry.gap.from, entry.gap.to])).toEqual([['07:45', '22:00']]);
      expect(friday[0]?.gap.who_free).toEqual([uid(1)]);
      expect(friday[0]?.gap.after_item).toBe(uid(9));
    });

    it('counts a day with no stop as free all day', () => {
      const first = solo([]).find((entry) => entry.date === '2026-10-22');
      expect([first?.gap.from, first?.gap.to]).toEqual(['07:00', '22:00']);
    });

    it('has no window on a day whose stops leave less than an hour anywhere', () => {
      const gaps = solo([
        item({
          stable_id: uid(7),
          starts_at: '2026-10-22T23:30:00Z',
          ends_at: '2026-10-23T05:00:00Z',
        }),
        item({ starts_at: '2026-10-23T05:30:00Z', ends_at: '2026-10-23T13:30:00Z' }),
      ]);
      expect(gaps.filter((entry) => entry.date === '2026-10-23')).toEqual([]);
    });

    it('offers the stretch between two stops when it is an hour or more', () => {
      const gaps = solo([
        item({
          stable_id: uid(7),
          starts_at: '2026-10-22T23:00:00Z',
          ends_at: '2026-10-23T03:00:00Z',
        }),
        item({ starts_at: '2026-10-23T05:00:00Z', ends_at: '2026-10-23T14:00:00Z' }),
      ]);
      expect(
        gaps
          .filter((entry) => entry.date === '2026-10-23')
          .map((entry) => [entry.gap.from, entry.gap.to]),
      ).toEqual([['11:00', '13:00']]);
    });
  });
});

describe('the kinds of place to browse', () => {
  const groupOf = (category: string) =>
    category === 'food' || category === 'market' ? 'food' : category === 'beach' ? 'beaches' : null;

  it('adds the categories of a kind together, fullest first, and drops what has no kind', () => {
    expect(
      kindCounts(
        [
          { category: 'beach', n: 40 },
          { category: 'food', n: 90 },
          { category: 'market', n: 11 },
          { category: 'transit', n: 30 },
        ],
        groupOf,
      ),
    ).toEqual([
      { group: 'food', count: 101 },
      { group: 'beaches', count: 40 },
    ]);
  });
});
