/** GO on the trip map's sheet: today's next stop with a place, a later day's first, none past. */
import { describe, expect, it } from '@jest/globals';

import type { DayItem } from '@/data/plan/plan-model';

import { nextGoStop } from '../next-stop';
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

describe('the next stop GO is offered on', () => {
  it("takes today's next stop that has a place", () => {
    expect(nextGoStop(day('2026-10-04', STOPS), NOW, TZ)).toBe('bridge');
  });

  it("takes a later day's first stop with a place, and none on a past day", () => {
    expect(nextGoStop(day('2026-10-05', STOPS), NOW, TZ)).toBe('market');
    expect(nextGoStop(day('2026-10-03', STOPS), NOW, TZ)).toBeNull();
  });

  it('offers nothing once today has no stop left', () => {
    expect(nextGoStop(day('2026-10-04', STOPS.slice(0, 2)), NOW, TZ)).toBeNull();
  });
});
