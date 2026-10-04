import { describe, expect, it } from '@jest/globals';

import { planGaps, type GapItemRow } from '../plan-gaps';
import { nextGap, pickState } from '../trip-explore-model';

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
});
