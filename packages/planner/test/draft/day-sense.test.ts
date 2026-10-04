/**
 * What makes a drafted day read like a day: rides that stay in one part of the map and under a
 * road budget, meals inside meal times and none missing, a place once per trip, places at the
 * time of day they are for (the morning only as a preference), and a day window that follows what
 * is known about the crew's arrival, departure and wish for a later start.
 */
import type { Itinerary } from '@cp/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  bestOrder,
  dayWindow,
  dinnerIsRideHome,
  hopCapMin,
  longHops,
  longRideMin,
  placeTime,
  placeWindow,
  roadBudgetMin,
  scheduleDay,
  validateItinerary,
  withinReach,
  type DayChoice,
  type DraftPoi,
  type DraftViolationCode,
  type TravelMatrix,
  type TripFrame,
} from '../../src/draft/index';

const TZ = 'Asia/Ho_Chi_Minh';
const id = (n: number) => `0199d000-0000-7000-8000-${String(n).padStart(12, '0')}`;

function place(n: number, name: string, category: string, extra: Partial<DraftPoi> = {}): DraftPoi {
  return {
    id: id(n),
    name,
    category,
    lat: 16,
    lng: 108,
    tz: TZ,
    hours: null,
    priceLevel: null,
    tags: [],
    durationMin: category === 'food' ? 60 : 90,
    editorial: true,
    mustSee: false,
    ...extra,
  };
}

/** Places on a line: the ride between two is the gap between their positions, in minutes. */
function line(positions: Readonly<Record<string, number>>): TravelMatrix {
  return (from, to) => {
    const a = positions[from];
    const b = positions[to];
    return a === undefined || b === undefined ? null : Math.abs(a - b);
  };
}

const FRAME: TripFrame = {
  tz: TZ,
  currency: 'VND',
  dates: ['2026-10-19', '2026-10-20', '2026-10-21'],
  members: [id(900)],
  chronotypes: {},
  diets: [],
  arrivalMin: null,
  departureMin: null,
  budgetPpMinor: null,
  mustDos: [],
  closures: [],
};

const EVENINGS = {
  weekly: Object.fromEntries(
    ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((day) => [
      day,
      [{ start: '17:00', end: '22:00' }],
    ]),
  ),
} as DraftPoi['hours'];

const MIDDAYS = {
  weekly: Object.fromEntries(
    ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((day) => [
      day,
      [{ start: '10:30', end: '15:00' }],
    ]),
  ),
} as DraftPoi['hours'];

const P = {
  museum: place(1, 'City Museum', 'museum'),
  pagoda: place(2, 'Old Pagoda', 'temple_shrine'),
  park: place(3, 'River Park', 'nature'),
  falls: place(4, 'Far Falls', 'nature'),
  lunch: place(5, 'Cơm Gà Bà Buội', 'food'),
  dinner: place(6, 'Bánh Xèo Bà Dưỡng', 'food', { hours: EVENINGS }),
  farLunch: place(7, 'Quán Bên Kia Đảo', 'food', { hours: MIDDAYS }),
  bar: place(8, 'Sky Bar', 'nightlife'),
  terraces: place(9, 'Rice Terraces', 'nature', { bestTime: 'Early morning to beat the heat' }),
  beach: place(10, 'West Beach', 'beach', { bestTime: 'At sunset' }),
};
const POIS = new Map(Object.values(P).map((poi) => [poi.id, poi]));
const NEAR = line({
  [P.museum.id]: 0,
  [P.pagoda.id]: 10,
  [P.park.id]: 20,
  [P.lunch.id]: 5,
  [P.dinner.id]: 15,
  [P.bar.id]: 12,
  [P.terraces.id]: 18,
  [P.beach.id]: 25,
  [P.falls.id]: 95,
  [P.farLunch.id]: 60,
});

const MEAL_PLACES = [P.lunch, P.dinner, P.farLunch];

const stop = (poi: DraftPoi, kind: DayChoice['kind'] = 'activity'): DayChoice => ({
  poiId: poi.id,
  kind,
  mustDoId: null,
  note: null,
});

/** The day as the planner times it: in its best order, or (`asGiven`) in the order given. */
function drafted(
  dayIndex: number,
  choices: readonly DayChoice[],
  frame = FRAME,
  asGiven = false,
): Itinerary {
  const window = dayWindow(frame, dayIndex);
  const input = {
    date: frame.dates[dayIndex] as string,
    choices,
    pois: POIS,
    window,
    travel: NEAR,
  };
  const order = asGiven
    ? choices.map((_, index) => index)
    : bestOrder({ ...input, hopCapMin: 40, mealPlaces: MEAL_PLACES }).order;
  let next = 0;
  const day = scheduleDay({
    ...input,
    dayNo: dayIndex + 1,
    theme: 'A day',
    choices: order.map((index) => choices[index] as DayChoice),
    bands: null,
    currency: frame.currency,
    tz: frame.tz,
    idFor: () => id(1000 + (next += 1)),
  });
  return { currency: frame.currency, days: [day] };
}

function codes(plan: Itinerary, frame = FRAME): DraftViolationCode[] {
  return validateItinerary({
    itinerary: plan,
    pois: POIS,
    frame,
    travel: NEAR,
    requiredMustDoIds: [],
    mealPlaces: MEAL_PLACES,
    hopCapMin: 40,
  }).violations.map((v) => v.code);
}

const names = (plan: Itinerary) =>
  (plan.days[0]?.items ?? []).map((item) => POIS.get(item.poi_id ?? '')?.name);

describe('the hop cap', { timeout: 60_000 }, () => {
  it('comes from how far apart the places are, never under forty minutes', () => {
    const tight = Array.from({ length: 12 }, (_, n) => place(100 + n, `Stop ${n}`, 'museum'));
    const spaced = (gap: number) =>
      line(Object.fromEntries(tight.map((poi, n) => [poi.id, n * gap])));
    expect(hopCapMin(tight, spaced(4))).toBe(40);
    // Third-nearest neighbour is two places away for most: 2 × 25 × 3.
    expect(hopCapMin(tight, spaced(25))).toBe(120);
    expect(hopCapMin(tight, spaced(8))).toBe(48);
  });

  it('flags a ride too long for the day, but not the ride to the first stop of the day', () => {
    const travel = line({ a: 0, b: 10, far: 90 });
    expect(longHops(['far', 'a', 'b'], travel, 40).map((hop) => hop.index)).toEqual([1]);
    expect(longHops(['a', 'b'], travel, 40)).toEqual([]);
    expect(longHops(['a', 'b', 'far'], travel, 40)).toEqual([{ index: 2, over: 40 }]);
  });

  it('lets a day change its part of the map once, and only once', () => {
    expect(longRideMin(40)).toBe(60);
    // A morning out, one 55-minute ride back to town, then stops in town.
    const once = line({ peninsula: 0, lookout: 8, lunch: 63, museum: 70, dinner: 75 });
    expect(longHops(['peninsula', 'lookout', 'lunch', 'museum', 'dinner'], once, 40)).toEqual([]);
    // Out again after lunch: the second long ride is the hop too far.
    const twice = line({ peninsula: 0, lunch: 50, lookout: 100, dinner: 108 });
    expect(
      longHops(['peninsula', 'lunch', 'lookout', 'dinner'], twice, 40).map((hop) => hop.index),
    ).toEqual([2]);
  });

  it('takes the ride to dinner as the ride home, whatever the day was', () => {
    // A day out at the falls, then ninety minutes back to town for dinner and a bar beside it.
    const travel = line({ falls: 0, lookout: 12, dinner: 102, bar: 108, moon: 240 });
    const day = ['falls', 'lookout', 'dinner', 'bar'];
    expect(longHops(day, travel, 40).map((hop) => hop.index)).toEqual([2]);
    expect(longHops(day, travel, 40, 2)).toEqual([]);
    // Home is not the other end of the country.
    expect(longHops(['falls', 'moon'], travel, 40, 1).map((hop) => hop.index)).toEqual([1]);
    // And the ride home does not use up the day's road budget.
    const busy = line({ a: 0, b: 35, c: 70, d: 105, dinner: 195 });
    expect(longHops(['a', 'b', 'c', 'd', 'dinner'], busy, 40, 4)).toEqual([]);
  });

  it('flags the stop that sends the crew out and back between two stops that sit together', () => {
    const travel = line({ a: 0, b: 6, lunch: 30 });
    // 30 out and 24 back for stops six minutes apart: a 48-minute detour.
    expect(longHops(['a', 'lunch', 'b'], travel, 40)).toEqual([{ index: 1, over: 8 }]);
  });

  it('holds a day of rides that each pass to the road budget, costliest stop first', () => {
    expect(roadBudgetMin(40)).toBe(120);
    expect(roadBudgetMin(90)).toBe(180);
    const travel = line({ a: 0, b: 35, c: 70, d: 105, e: 140 });
    // Four rides of 35 minutes down one road, none a detour: 140 on the road. The last stop is
    // the one whose leaving saves a ride.
    const found = longHops(['a', 'b', 'c', 'd', 'e'], travel, 40);
    expect(found).toEqual([{ index: 4, over: 20 }]);
  });

  it('never asks for more stops to leave than the day has', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 300 }), { minLength: 0, maxLength: 8 }),
        fc.integer({ min: 40, max: 120 }),
        (positions, cap) => {
          const ids = positions.map((_, n) => `p${n}`);
          const travel = line(Object.fromEntries(ids.map((key, n) => [key, positions[n] ?? 0])));
          const found = longHops(ids, travel, cap).map((hop) => hop.index);
          expect(new Set(found).size).toBe(found.length);
          expect(found.every((index) => index >= 1 && index < ids.length)).toBe(true);
          // What is left fits both rules.
          const kept = ids.filter((_, index) => !found.includes(index));
          const rides = kept.slice(1).map((key, n) => travel(kept[n] as string, key) ?? 0);
          const total = rides.reduce((sum, ride) => sum + ride, 0);
          expect(total <= roadBudgetMin(cap) || kept.length < 3).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('counts a place as within reach when one of the day’s stops is a cap away or less', () => {
    expect(withinReach(P.falls.id, [P.museum.id, P.farLunch.id], NEAR, 40)).toBe(true);
    expect(withinReach(P.falls.id, [P.museum.id, P.park.id], NEAR, 40)).toBe(false);
    expect(withinReach(P.falls.id, [], NEAR, 40)).toBe(true);
  });
});

describe('a drafted day', () => {
  it('passes with lunch and dinner beside its stops', () => {
    const plan = drafted(1, [
      stop(P.museum),
      stop(P.lunch, 'meal'),
      stop(P.pagoda),
      stop(P.park),
      stop(P.dinner, 'meal'),
    ]);
    expect(codes(plan)).toEqual([]);
  });

  it('is told when it runs through lunch and dinner without either', () => {
    const plan = drafted(1, [stop(P.museum), stop(P.pagoda), stop(P.park)]);
    expect(codes(plan).sort()).toEqual(['MEAL_MISSING', 'MEAL_MISSING']);
  });

  it('is told when a lunch across the map sits between two stops in town', () => {
    const stops = [
      stop(P.museum),
      stop(P.farLunch, 'meal'),
      stop(P.pagoda),
      stop(P.dinner, 'meal'),
    ];
    expect(codes(drafted(1, stops, FRAME, true))).toContain('LONG_HOP');
    // Left to order the day, the planner has that lunch open the day instead: no ride out and back.
    const reordered = drafted(1, stops);
    expect(names(reordered)[0]).toBe(P.farLunch.name);
    expect(codes(reordered)).toEqual([]);
  });

  it('eats dinner back in town after a day out, and is told when it has none', () => {
    const out = [stop(P.falls), stop(P.dinner, 'meal')];
    const plan = drafted(1, out);
    expect(names(plan)).toEqual([P.falls.name, P.dinner.name]);
    expect(codes(plan)).not.toContain('LONG_HOP');
    // With a dinner place beside the falls, the ride to town would be a hop like any other.
    const beside = place(11, 'Quán Bên Thác', 'food', { hours: EVENINGS });
    expect(dinnerIsRideHome([P.falls.id], [P.dinner], NEAR, 40)).toBe(true);
    expect(
      dinnerIsRideHome(
        [P.falls.id],
        [P.dinner, beside],
        (from, to) => ([from, to].includes(beside.id) ? 6 : NEAR(from, to)),
        40,
      ),
    ).toBe(false);
    // Dinner is a ride home away, so a day out without one is still missing it.
    expect(codes(drafted(1, [stop(P.falls)]))).toContain('MEAL_MISSING');
  });

  it('is told when a place comes twice', () => {
    const plan = drafted(1, [
      stop(P.museum),
      stop(P.lunch, 'meal'),
      stop(P.pagoda),
      stop(P.dinner, 'meal'),
    ]);
    const twice: Itinerary = {
      ...plan,
      days: [
        ...plan.days,
        { ...drafted(2, [stop(P.museum)]).days[0], day_no: 3 } as Itinerary['days'][number],
      ],
    };
    expect(codes(twice)).toContain('DUPLICATE_PLACE');
  });
});

describe('the time of day a place is for', () => {
  const date = FRAME.dates[1] as string;

  it('holds a bar to after dark and a sunset beach to the sunset', () => {
    expect(placeTime(P.bar)).toBe('after_dark');
    expect(placeWindow(P.bar, date)?.fromMin).toBeGreaterThanOrEqual(17 * 60 + 30);
    expect(placeTime(P.beach)).toBe('sunset');
    const sunset = placeWindow(P.beach, date);
    expect(sunset?.fromMin).toBeGreaterThanOrEqual(15 * 60);
    expect(sunset?.toMin).toBeLessThanOrEqual(19 * 60);
  });

  it('keeps daylight places out of the night, and leaves a museum or a square alone', () => {
    const sunset = placeWindow(P.pagoda, date);
    expect(sunset?.fromMin).toBe(0);
    expect(sunset?.toMin).toBeGreaterThanOrEqual(16 * 60);
    expect(sunset?.toMin).toBeLessThanOrEqual(19 * 60);
    expect(placeWindow(P.museum, date)).toBeNull();
    // The guide put the pagoda after dinner; the planner brings it back into the day.
    const plan = drafted(1, [
      stop(P.museum),
      stop(P.lunch, 'meal'),
      stop(P.dinner, 'meal'),
      stop(P.pagoda),
    ]);
    expect(names(plan)).toEqual([P.museum.name, P.lunch.name, P.pagoda.name, P.dinner.name]);
    // Left after dinner, it is a place at the wrong time of day.
    const asGiven = drafted(
      1,
      [stop(P.museum), stop(P.lunch, 'meal'), stop(P.dinner, 'meal'), stop(P.pagoda)],
      FRAME,
      true,
    );
    expect(codes(asGiven)).toContain('WRONG_TIME_OF_DAY');
  });

  it('keeps the morning a preference: no morning window, but first in the order of the day', () => {
    expect(placeTime(P.terraces)).toBe('morning');
    expect(placeWindow(P.terraces, date)?.fromMin).toBe(0);
    // Better in the morning is at least by daylight, whatever the place is filed as.
    expect(placeWindow({ ...P.terraces, category: 'museum' }, date)?.toMin).toBeLessThan(19 * 60);
    // The guide put the terraces after lunch; the planner moves them into the morning.
    const plan = drafted(1, [
      stop(P.museum),
      stop(P.pagoda),
      stop(P.lunch, 'meal'),
      stop(P.terraces),
      stop(P.dinner, 'meal'),
    ]);
    const terraces = plan.days[0]?.items.find((item) => item.poi_id === P.terraces.id);
    const lunch = plan.days[0]?.items.find((item) => item.poi_id === P.lunch.id);
    expect(Date.parse(terraces?.starts_at ?? '')).toBeLessThanOrEqual(
      Date.parse('2026-10-20T04:00:00Z'),
    );
    expect(Date.parse(terraces?.starts_at ?? '')).toBeLessThan(Date.parse(lunch?.starts_at ?? ''));
    expect(codes(plan)).toEqual([]);
  });

  it('lets a morning place fill an afternoon when the morning is taken', () => {
    const late = drafted(0, [stop(P.terraces), stop(P.dinner, 'meal')]);
    // The first day starts at two: the terraces are planned then, and nothing is broken.
    expect(names(late)).toEqual([P.terraces.name, P.dinner.name]);
    expect(codes(late)).toEqual([]);
  });

  it('sends nobody to a bar in the morning', () => {
    const plan = drafted(1, [
      stop(P.bar),
      stop(P.museum),
      stop(P.lunch, 'meal'),
      stop(P.dinner, 'meal'),
    ]);
    expect(names(plan)).toEqual([P.museum.name, P.lunch.name, P.dinner.name, P.bar.name]);
  });
});

describe('the day window', () => {
  it('assumes a midday landing and an early-evening departure when no booking says', () => {
    expect(dayWindow(FRAME, 0)).toMatchObject({ startMin: 14 * 60, endMin: 22 * 60 });
    expect(dayWindow(FRAME, 2)).toMatchObject({ startMin: 9 * 60, endMin: 15 * 60 });
  });

  it('follows the flight or train the crew shared', () => {
    const known = { ...FRAME, arrivalMin: 8 * 60, departureMin: 21 * 60 };
    expect(dayWindow(known, 0).startMin).toBeLessThan(14 * 60);
    expect(dayWindow(known, 2).endMin).toBe(18 * 60);
  });

  it('opens a day later when the crew asked for a later start, and only that day', () => {
    const later = { ...FRAME, laterStartDays: [2] };
    expect(dayWindow(later, 1).startMin).toBe(10 * 60 + 30);
    expect(dayWindow(later, 0)).toEqual(dayWindow(FRAME, 0));
    const owls = { ...later, chronotypes: { [id(900)]: 'night_owl' as const } };
    expect(dayWindow(owls, 1).startMin).toBe(11 * 60 + 30);
    // A short last day keeps a stretch to plan in.
    const last = dayWindow({ ...FRAME, departureMin: 14 * 60, laterStartDays: [3] }, 2);
    expect(last.endMin - last.startMin).toBeGreaterThanOrEqual(90);
  });

  it('times a later-start day from the later opening', () => {
    const later = { ...FRAME, laterStartDays: [2] };
    const plan = drafted(1, [stop(P.museum), stop(P.lunch, 'meal'), stop(P.pagoda)], later);
    const first = plan.days[0]?.items[0];
    expect(new Date(first?.starts_at ?? 0).toISOString()).toBe('2026-10-20T03:30:00.000Z');
  });
});
