/** GO in the plan: only on today's stops still to go; a day planned ahead offers none. */
import { describe, expect, it } from '@jest/globals';

import type { DayItem } from '@/data/plan/plan-model';

import { dayProgress, goStopsToday, nextGoStop } from '../next-stop';
import type { TripDay } from '../trip-days';

const TZ = 'Asia/Ho_Chi_Minh';

function stop(stableId: string, start: number | null, place = true): DayItem {
  return {
    stableId,
    dayNo: 1,
    title: stableId,
    category: null,
    start,
    end: null,
    tz: TZ,
    lane: null,
    attendeeIds: [],
    lock: null,
    status: 'planned',
    byGuide: false,
    notes: null,
    poiId: place ? `poi-${stableId}` : null,
    place: place ? { lat: 16, lng: 108 } : null,
    amountMinor: null,
    currency: null,
    costModel: null,
    bookingId: null,
  };
}

const day = (date: string, stops: DayItem[]) => ({ date, stops }) as unknown as TripDay;
const STOPS = [stop('market', 9 * 60), stop('lunch', 12 * 60, false), stop('bridge', 18 * 60)];
// 13:00 on 4 October in Đà Nẵng.
const NOW = new Date('2026-10-04T06:00:00Z');

describe('the stops GO is offered on in the plan', () => {
  it("offers today's stops with a place that haven't ended, the first of them on the trip map", () => {
    const today = day('2026-10-04', [
      { ...stop('market', 9 * 60), end: 10 * 60 },
      { ...stop('museum', 12 * 60), end: 14 * 60 },
      stop('lunch', 15 * 60, false),
      stop('bridge', 18 * 60),
    ]);
    // 13:00: the market has ended, the museum is being visited, lunch has no place.
    expect(goStopsToday(today, NOW, TZ)).toEqual(['museum', 'bridge']);
    expect(nextGoStop(today, NOW, TZ)).toBe('museum');
  });

  it('offers nothing on a day planned ahead or a day gone by', () => {
    expect(goStopsToday(day('2026-10-05', STOPS), NOW, TZ)).toEqual([]);
    expect(nextGoStop(day('2026-10-05', STOPS), NOW, TZ)).toBeNull();
    expect(goStopsToday(day('2026-10-03', STOPS), NOW, TZ)).toEqual([]);
  });

  it('offers nothing once every stop of today has ended', () => {
    expect(nextGoStop(day('2026-10-04', STOPS.slice(0, 2)), NOW, TZ)).toBeNull();
  });
});

describe('what she said herself goes before the clock', () => {
  // 08:00 on 4 October in Đà Nẵng: nothing has started.
  const EARLY = new Date('2026-10-04T01:00:00Z');
  const today = day('2026-10-04', [
    { ...stop('market', 9 * 60), end: 10 * 60 },
    { ...stop('museum', 12 * 60), end: 14 * 60 },
    stop('bridge', 18 * 60),
  ]);

  it('reads a stop she marked done as over: no GO, and the one after it is next', () => {
    const said = new Map([['market', 'done' as const]]);
    expect(nextGoStop(today, EARLY, TZ)).toBe('market');
    expect(nextGoStop(today, EARLY, TZ, said)).toBe('museum');
    const moments = dayProgress(today, EARLY, TZ, said)?.moments;
    expect(moments?.get('market')).toBe('done');
    expect(moments?.get('museum')).toBe('next');
    expect(moments?.has('bridge')).toBe(false);
  });

  it('reads a stop she said she is at as on now, before its hour', () => {
    const said = new Map([['market', 'here' as const]]);
    const moments = dayProgress(today, EARLY, TZ, said)?.moments;
    expect(moments?.get('market')).toBe('now');
    expect(moments?.get('museum')).toBe('next');
    expect(nextGoStop(today, EARLY, TZ, said)).toBe('market');
  });
});
