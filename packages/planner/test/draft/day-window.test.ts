import { describe, expect, it } from 'vitest';

import {
  candidatePools,
  dayTripReach,
  dayWindow,
  edgeDays,
  landsOn,
  leavesOn,
  timeFitsDay,
  type DraftPoi,
  type TripFrame,
} from '../../src/draft/index';

const DATES = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
const TZ = 'Asia/Ho_Chi_Minh';

const frame = (days: number, extra: Partial<TripFrame> = {}): TripFrame => ({
  tz: TZ,
  currency: 'VND',
  dates: DATES.slice(0, days),
  members: [],
  chronotypes: {},
  diets: [],
  arrivalMin: null,
  departureMin: null,
  budgetPpMinor: null,
  mustDos: [],
  closures: [],
  ...extra,
});

const FLIGHTS = { arrivalMin: 8 * 60, departureMin: 20 * 60 };
const w = (startMin: number, endMin: number, earliestMin: number, latestMin: number) => ({
  startMin,
  endMin,
  earliestMin,
  latestMin,
});
const LANDS = w(840, 1320, 840, 1440);
const FULL = w(540, 1320, 270, 1440);
const LEAVES = w(540, 900, 270, 900);
const LANDS_FLOWN = w(570, 1320, 570, 1440);
const LEAVES_FLOWN = w(540, 1020, 270, 1020);

describe('the usable part of each day, with no stops or day trips in the frame', () => {
  it.each([
    ['one day, no flights', frame(1), [w(840, 900, 840, 900)]],
    ['one day, flights', frame(1, FLIGHTS), [w(570, 1020, 570, 1020)]],
    ['two days, no flights', frame(2), [LANDS, LEAVES]],
    ['two days, flights', frame(2, FLIGHTS), [LANDS_FLOWN, LEAVES_FLOWN]],
    ['five days, no flights', frame(5), [LANDS, FULL, FULL, FULL, LEAVES]],
    ['five days, flights', frame(5, FLIGHTS), [LANDS_FLOWN, FULL, FULL, FULL, LEAVES_FLOWN]],
  ])('%s: lands on the first day and leaves on the last', (_name, trip, windows) => {
    expect(trip.dates.map((_, index) => dayWindow(trip, index))).toEqual(windows);
    expect(edgeDays(trip)).toEqual(trip.dates.length === 1 ? [1] : [1, trip.dates.length]);
  });
});

describe('a frame for part of a trip', () => {
  it('gives a city the crew stays on after a full last day', () => {
    const first = frame(2, { leavingDay: null });
    expect(leavesOn(first, 1)).toBe(false);
    expect(dayWindow(first, 1)).toEqual(FULL);
    expect(edgeDays(first)).toEqual([1]);
  });

  it('gives a city the crew is already in a full first day', () => {
    const later = frame(3, { arrivalDay: null });
    expect(landsOn(later, 0)).toBe(false);
    expect(dayWindow(later, 0)).toEqual(FULL);
    expect(dayWindow(later, 2)).toEqual(LEAVES);
  });

  it('opens a day trip when the area is reached and closes it when the crew starts back', () => {
    const trip = frame(1, {
      arrivalDay: null,
      leavingDay: null,
      reach: { 1: dayTripReach(4 * 60) },
    });
    expect(dayWindow(trip, 0)).toEqual(w(660, 1020, 660, 1020));
  });
});

const hours = (start: string, end: string) => ({
  weekly: Object.fromEntries(
    ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((d) => [d, [{ start, end }]]),
  ),
});

const place = (n: number, extra: Partial<DraftPoi>): DraftPoi => ({
  id: `0199a0f2-0000-7000-8000-${String(n).padStart(12, '0')}`,
  name: `Place ${n}`,
  category: 'other',
  lat: 13.16,
  lng: -72.54,
  tz: TZ,
  hours: null,
  priceLevel: 1,
  tags: [],
  durationMin: 90,
  editorial: true,
  mustSee: false,
  ...extra,
});

describe('what a day reached late and left early is offered', () => {
  const reachedAtEleven = frame(1, {
    arrivalDay: null,
    leavingDay: null,
    reach: { 1: { fromMin: 11 * 60, untilMin: 17 * 60 } },
  });
  const reachedAtNoon = frame(1, {
    arrivalDay: null,
    leavingDay: null,
    reach: { 1: { fromMin: 12 * 60 } },
  });

  it('offers no place whose visit cannot fit between', () => {
    const short = place(1, { durationMin: 120 });
    const long = place(2, { durationMin: 7 * 60 });
    const pools = candidatePools({ pois: [short, long], frame: reachedAtEleven, tastes: {} });
    expect(pools.openDays.get(short.id)).toEqual([1]);
    expect(pools.openDays.has(long.id)).toBe(false);
  });

  it('offers no morning-only place to a day reached at noon', () => {
    const morning = place(3, { hours: hours('06:00', '11:30') });
    const afternoon = place(4, { hours: hours('06:00', '17:00') });
    const pools = candidatePools({
      pois: [morning, afternoon],
      frame: reachedAtNoon,
      tastes: {},
    });
    expect(pools.openDays.has(morning.id)).toBe(false);
    expect(pools.openDays.get(afternoon.id)).toEqual([1]);
    expect(timeFitsDay(reachedAtNoon, 0, 'morning', morning)).toBe(false);
  });
});
