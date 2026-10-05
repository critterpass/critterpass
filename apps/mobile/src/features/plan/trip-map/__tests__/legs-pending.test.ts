/**
 * A new plan version's missing legs read as "working out the rides" only for a moment, and the
 * moment ends by itself whatever the phone's clock says: a clock behind the server's is stopped
 * by the phone's own count from when it first saw the version, and a clock ahead never waits.
 * While it lasts no estimate is printed as a figure; a stored leg is shown as it is; and after it
 * the estimate comes back marked "about".
 */
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';

import { routeOf } from '../day-route';
import { legLabel, stopsLine } from '../format';
import type { TripDay } from '../trip-days';

import { HARD_STOP_MS, pendingUntil, YOUNG_MS } from '@/data/legs/use-legs-pending';

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

const SERVER_MADE = Date.parse('2026-10-05T04:40:05.000Z');
const made = new Date(SERVER_MADE).toISOString();

describe('how long a version waits for its legs', () => {
  it('waits while the version is new, on a phone that agrees with the server', () => {
    const seen = SERVER_MADE + 2000;
    const until = pendingUntil(made, seen);
    expect(until).toBe(seen + HARD_STOP_MS);
    expect(seen + 5000 < until).toBe(true);
    expect(SERVER_MADE + YOUNG_MS + 1 < until).toBe(false);
  });

  it('stops by its own count on a phone whose clock runs ten minutes behind', () => {
    const seen = SERVER_MADE - 10 * 60_000;
    const until = pendingUntil(made, seen);
    // By the server's time alone it would wait eleven and a half minutes.
    expect(until).toBe(seen + HARD_STOP_MS);
    expect(seen + HARD_STOP_MS + 1 < until).toBe(false);
  });

  it('never waits on a phone whose clock runs ahead, or for a version it does not hold', () => {
    const seen = SERVER_MADE + 10 * 60_000;
    expect(seen < pendingUntil(made, seen)).toBe(false);
    expect(pendingUntil(null, seen)).toBe(0);
    expect(pendingUntil('not a time', seen)).toBe(0);
  });
});

const place = (id: string, lat: number, lng: number) => ({ stableId: id, place: { lat, lng } });
const day = {
  dayNo: 1,
  dayId: 'day-one',
  stay: null,
  stops: [
    place('lake', 11.9416, 108.4383),
    place('square', 11.9367, 108.4375),
    place('market', 11.9427, 108.4366),
  ],
} as unknown as TripDay;
const stored = [
  {
    from_key: 'lake',
    to_key: 'square',
    mode: 'walk',
    minutes: 7,
    meters: 600,
    source: 'valhalla',
    approx: 0,
  },
];

describe('a day whose new legs are on their way', () => {
  it('shows the stored leg, and says it is working out the one that is not there', () => {
    const route = routeOf(day, stored, undefined, undefined, true);
    expect(route.legs.map((leg) => leg.pending === true)).toEqual([false, true]);
    expect(legLabel(route.legs[0]!)).toBe('Walk · 7 min');
    expect(legLabel(route.legs[1]!)).toBe('Working out the ride…');
    expect(stopsLine(3, route.legs)).toBe('3 stops · working out the rides');
  });

  it('goes back to an estimate marked about once the wait is over', () => {
    const route = routeOf(day, stored, undefined, undefined, false);
    expect(route.legs[1]?.pending).toBeUndefined();
    expect(legLabel(route.legs[1]!)).toMatch(/about \d+ min$/u);
  });
});
