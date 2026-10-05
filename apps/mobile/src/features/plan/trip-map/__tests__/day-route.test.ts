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

import { routeOf, type KnownLegs } from '../day-route';
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

  it('keeps a routed time for a pair until the new version is routed, never a longer guess', () => {
    const known: KnownLegs = new Map();
    const before = routeOf(day([MARKET, BRIDGE]), [leg('market', 'bridge', 4)], undefined, known);
    expect(before.after[0]).toMatchObject({ minutes: 4, source: 'valhalla' });
    // An edit elsewhere made a new version: its legs are not stored yet.
    const during = routeOf(day([MARKET, BRIDGE]), [], undefined, known);
    expect(during.after[0]).toMatchObject({ minutes: 4, source: 'valhalla', approx: false });
    // A stored straight-line leg does not replace the routed time either.
    const guessed = routeOf(
      day([MARKET, BRIDGE]),
      [{ ...leg('market', 'bridge', 9), source: 'straight_line', approx: 1 }],
      undefined,
      known,
    );
    expect(guessed.after[0]).toMatchObject({ minutes: 4, source: 'valhalla' });
    // The new routed leg, once it lands, is the one shown and remembered.
    const after = routeOf(day([MARKET, BRIDGE]), [leg('market', 'bridge', 6)], undefined, known);
    expect(after.after[0]).toMatchObject({ minutes: 6 });
    expect(routeOf(day([MARKET, BRIDGE]), [], undefined, known).after[0]).toMatchObject({
      minutes: 6,
    });
  });

  it('estimates a pair the router never timed, and a stop moved to another place', () => {
    const known: KnownLegs = new Map();
    routeOf(day([MARKET, BRIDGE]), [leg('market', 'bridge', 4)], undefined, known);
    const moved = stop('bridge', { lat: 16.2, lng: 108.4 });
    expect(routeOf(day([MARKET, moved]), [], undefined, known).after[0]).toMatchObject({
      source: 'straight_line',
      approx: true,
    });
  });

  it('gives the legs out of and back to the stay', () => {
    const route = routeOf(day([MARKET, BRIDGE], { lat: 16.05, lng: 108.24 }), [
      leg('stay', 'market', 12),
      leg('market', 'bridge', 4),
      leg('bridge', 'stay', 11),
    ]);
    expect(route.fromStay).toMatchObject({ minutes: 12 });
    expect(route.toStay).toMatchObject({ minutes: 11 });
    expect(routeOf(day([MARKET, BRIDGE]), []).fromStay).toBeNull();
  });
});
