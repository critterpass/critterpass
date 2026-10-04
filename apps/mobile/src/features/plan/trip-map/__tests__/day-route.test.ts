/**
 * A day's legs as the plan screens read them: the stored leg wherever the plan has one, even into
 * a stop whose place the phone doesn't hold; an "about" estimate between two placed stops; and no
 * leg rather than a wrong one when neither is known.
 */
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { describe, expect, it, jest } from '@jest/globals';

import type { DayItem } from '@/data/plan/plan-model';

import { routeOf } from '../day-route';
import type { TripDay } from '../trip-days';

function stop(id: string, place: { lat: number; lng: number } | null): DayItem {
  return {
    stableId: id,
    dayNo: 1,
    title: id,
    category: null,
    start: 600,
    end: 660,
    tz: 'Asia/Ho_Chi_Minh',
    lane: null,
    attendeeIds: [],
    lock: null,
    status: 'confirmed',
    byGuide: false,
    notes: null,
    poiId: null,
    place,
    amountMinor: null,
    currency: null,
    costModel: null,
    bookingId: null,
  };
}

function day(stops: readonly DayItem[], stay: TripDay['stay'] = null): TripDay {
  return {
    dayNo: 1,
    dayId: 'day-one',
    date: '2026-10-04',
    theme: null,
    color: 'yellow',
    items: stops,
    stops,
    stay,
    pace: 1,
    vote: null,
    booked: false,
    issues: [],
    tag: null,
  };
}

const MARKET = stop('market', { lat: 16.0682, lng: 108.2241 });
const NOODLES = stop('noodles', null);
const BRIDGE = stop('bridge', { lat: 16.0612, lng: 108.2272 });
const leg = (from: string, to: string, minutes: number) => ({
  from_key: from,
  to_key: to,
  mode: 'drive',
  minutes,
  meters: minutes * 500,
  source: 'valhalla',
  approx: 0,
});

describe('day route', () => {
  it('uses the stored legs, into a stop the phone has no place for too', () => {
    const route = routeOf(day([MARKET, NOODLES, BRIDGE]), [
      leg('market', 'noodles', 6),
      leg('noodles', 'bridge', 9),
    ]);
    expect(route.after.map((one) => one?.minutes ?? null)).toEqual([6, 9, null]);
    expect(route.after[0]).toMatchObject({ mode: 'drive', approx: false });
  });

  it('estimates between placed stops and leaves an unknown leg out', () => {
    const route = routeOf(day([MARKET, NOODLES, BRIDGE]), []);
    expect(route.after).toEqual([null, null, null]);
    const placed = routeOf(day([MARKET, BRIDGE]), []);
    expect(placed.after[0]).toMatchObject({ source: 'straight_line', approx: true });
    expect(placed.after[1]).toBeNull();
  });

  it('starts and ends at the stay, keeping the legs after each stop in step', () => {
    const route = routeOf(day([MARKET, BRIDGE], { lat: 16.05, lng: 108.24 }), [
      leg('stay', 'market', 12),
      leg('market', 'bridge', 4),
      leg('bridge', 'stay', 11),
    ]);
    expect(route.after.map((one) => one?.minutes ?? null)).toEqual([4, null]);
    expect(route.legs.map((one) => one.minutes)).toEqual([12, 4, 11]);
  });
});
