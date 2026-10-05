/**
 * Stops that are the crew's own (a must-do, a booking, a stop the organiser placed by hand) are
 * planned around, never dropped or blamed; rows that look like one place are planned once; and
 * the day the crew leaves stays near where it sleeps.
 */
import type { Itinerary } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import {
  bestOrder,
  candidatePools,
  choicesOfDay,
  collapseSamePlaces,
  dayWindow,
  dropViolations,
  foodRole,
  homeBase,
  instantAt,
  isKept,
  isPinId,
  nearHome,
  pinIdOf,
  placeIdOf,
  scheduleDay,
  straightLineMatrix,
  validateItinerary,
  type DayChoice,
  type DraftPoi,
} from '../../src/draft/index';
import { FRAME, NEAR, P, POIS, TZ, id, place, stop } from './day-sense-fixture';

function day(dayIndex: number, choices: readonly DayChoice[]): Itinerary['days'][number] {
  let next = 0;
  return scheduleDay({
    dayNo: dayIndex + 1,
    date: FRAME.dates[dayIndex] as string,
    theme: 'A day',
    choices,
    pois: POIS,
    window: dayWindow(FRAME, dayIndex),
    travel: NEAR,
    bands: null,
    currency: 'VND',
    tz: TZ,
    idFor: () => id(3000 + dayIndex * 10 + (next += 1)),
  });
}

describe('a stop the organiser placed by hand', () => {
  const byHand: DayChoice = { ...stop(P.farLunch, 'meal'), lockedReason: 'user' };
  const plan: Itinerary = {
    currency: 'VND',
    days: [day(1, [stop(P.museum), byHand, stop(P.pagoda), stop(P.dinner, 'meal')])],
  };
  const check = () =>
    validateItinerary({
      itinerary: plan,
      pois: POIS,
      frame: FRAME,
      travel: NEAR,
      requiredMustDoIds: [],
      hopCapMin: 40,
    });

  it('keeps its lock through scheduling and back into choices', () => {
    const item = plan.days[0]?.items.find((i) => i.poi_id === P.farLunch.id);
    expect(item?.locked_reason).toBe('user');
    expect(item === undefined ? false : isKept(item)).toBe(true);
    const again = choicesOfDay(plan.days[0] as Itinerary['days'][number]);
    expect(again.find((choice) => choice.poiId === P.farLunch.id)?.lockedReason).toBe('user');
    expect(again.find((choice) => choice.poiId === P.museum.id)?.lockedReason).toBeNull();
  });

  it('is never the stop out of place: the one beside it is', () => {
    const hops = check().violations.filter((v) => v.code === 'LONG_HOP');
    expect(hops.length).toBeGreaterThan(0);
    expect(hops.map((v) => v.poiId)).not.toContain(P.farLunch.id);
  });

  it('is not dropped for a rule it breaks, where a stop the guide chose would be', () => {
    const item = plan.days[0]?.items.find((i) => i.poi_id === P.farLunch.id);
    const blamed = [
      { code: 'LONG_HOP' as const, dayNo: 2, stableId: item?.stable_id ?? null },
      { code: 'WRONG_TIME_OF_DAY' as const, dayNo: 2, stableId: item?.stable_id ?? null },
    ];
    expect(dropViolations(plan, blamed).dropped).toEqual([]);
    const loose: Itinerary = {
      ...plan,
      days: plan.days.map((d) => ({
        ...d,
        items: d.items.map((i) => ({ ...i, locked_reason: null })),
      })),
    };
    expect(dropViolations(loose, blamed).dropped.map((d) => d.stableId)).toEqual([item?.stable_id]);
  });
});

describe('rows of one place', () => {
  const at = (n: number, name: string, lat: number, category = 'temple_shrine') =>
    place(n, name, category, { lat });

  it('plans "Gn Kawi Temple" and "Pura Gunung Kawi" once, a few kilometres apart', () => {
    const rows = [at(60, 'Gn Kawi Temple', -8.42), at(61, 'Pura Gunung Kawi', -8.45)];
    expect(collapseSamePlaces(rows).kept).toHaveLength(1);
  });

  it('keeps apart a namesake across the island and a temple with one more word', () => {
    const far = [at(62, 'Gn Kawi Temple', -8.42), at(63, 'Pura Gunung Kawi', -8.9)];
    expect(collapseSamePlaces(far).kept).toHaveLength(2);
    const other = [at(64, 'Pura Gunung Kawi', -8.42), at(65, 'Pura Gunung Kawi Sebatu', -8.4)];
    expect(collapseSamePlaces(other).kept).toHaveLength(2);
  });

  it('reads a street snack as a snack with or without its accents', () => {
    expect(foodRole(place(66, 'Banh Trang Nuong', 'food', { durationMin: 75 }))).toBe('light');
    expect(foodRole(place(67, 'Bánh tráng nướng Dì Đinh', 'food', { durationMin: 75 }))).toBe(
      'light',
    );
    expect(foodRole(place(68, 'Bánh Xèo Bà Dưỡng', 'food', { durationMin: 75 }))).toBe('meal');
  });
});

describe('the day the crew leaves', () => {
  // A town of eateries and sights, and a lake thirty kilometres out.
  const town = (n: number, name: string, category: string, east: number): DraftPoi =>
    place(n, name, category, { lat: 11.94, lng: 108.44 + east / 100 });
  const places = [
    ...Array.from({ length: 6 }, (_, n) => town(70 + n, `Quán Ngon ${n}`, 'food', n / 10)),
    town(80, 'Old Station', 'other', 0.1),
    town(81, 'City Church', 'temple_shrine', 0.2),
    town(82, 'Town Museum', 'museum', 0.3),
    town(83, 'Far Lake', 'nature', 30),
  ];
  const travel = straightLineMatrix(new Map(places.map((poi) => [poi.id, poi])));

  it('takes home to be where the places to eat are', () => {
    expect(homeBase(places, travel)?.category).toBe('food');
    const near = nearHome(places, travel, 40);
    expect(near?.has(id(80))).toBe(true);
    expect(near?.has(id(83))).toBe(false);
    // Too few sights by the door: the last day is planned like any other.
    expect(nearHome(places.slice(0, 7), travel, 40)).toBeNull();
  });

  it('opens a place far from home on neither the day the crew lands nor the day it leaves', () => {
    const pools = candidatePools({ pois: places, frame: FRAME, tastes: {} });
    expect(pools.openDays.get(id(83))).toEqual([2]);
    expect(pools.openDays.get(id(80))).toEqual([1, 2, 3]);
    // A must-do there is the crew's call, whatever the day.
    const asked = candidatePools({
      pois: places,
      frame: {
        ...FRAME,
        mustDos: [{ id: id(900), ownerId: id(900), poiId: id(83), title: 'Far Lake' }],
      },
      tastes: {},
    });
    expect(asked.mustDos).toEqual([{ mustDoId: id(900), poiId: id(83), openDays: [1, 2, 3] }]);
  });
});

describe('a stop with its own times', () => {
  const at = (minute: number) => instantAt(FRAME.dates[1] as string, minute, TZ).toISOString();
  const lunch: DayChoice = {
    ...stop(P.lunch, 'meal'),
    lockedReason: 'user',
    fixed: { startsAt: at(12 * 60 + 30), endsAt: at(13 * 60 + 30) },
    stableId: id(4001),
  };
  const choices = [stop(P.museum), stop(P.pagoda), stop(P.park), lunch, stop(P.dinner, 'meal')];
  const order = bestOrder({
    date: FRAME.dates[1] as string,
    choices,
    pois: POIS,
    window: dayWindow(FRAME, 1),
    travel: NEAR,
    hopCapMin: 40,
    tz: TZ,
  });
  const planned = day(
    1,
    order.order.map((index) => choices[index] as DayChoice),
  );
  const mine = planned.items.find((item) => item.poi_id === P.lunch.id);

  it('stands where it was put, with its id and its lock, and the day is timed around it', () => {
    expect(order.broken).toBe(0);
    expect(mine).toMatchObject({
      stable_id: id(4001),
      starts_at: at(12 * 60 + 30),
      ends_at: at(13 * 60 + 30),
      locked_reason: 'user',
    });
    // Two of the guide's stops fit before it, the third after: none runs into it.
    const before = planned.items.filter((item) => item.ends_at <= at(12 * 60 + 30));
    expect(before.map((item) => item.kind)).toEqual(['activity', 'activity']);
    const clash = planned.items.filter(
      (item) =>
        item !== mine && item.starts_at < at(13 * 60 + 30) && item.ends_at > at(12 * 60 + 30),
    );
    expect(clash).toEqual([]);
    // Timed again from its own rows, it has not moved.
    const again = day(1, choicesOfDay(planned));
    expect(again.items.find((item) => item.poi_id === P.lunch.id)?.starts_at).toBe(mine?.starts_at);
  });

  it('is the day’s lunch: a second one from the guide is the extra', () => {
    const check = (itinerary: Itinerary) =>
      validateItinerary({
        itinerary,
        pois: POIS,
        frame: FRAME,
        travel: NEAR,
        requiredMustDoIds: [],
        mealPlaces: [P.lunch, P.dinner, P.farLunch],
        hopCapMin: 40,
      }).violations;
    expect(check({ currency: 'VND', days: [planned] }).map((v) => v.code)).toEqual([]);
    const early: DayChoice = stop(P.farLunch, 'meal');
    const doubled = day(1, [stop(P.museum), early, lunch, stop(P.dinner, 'meal')]);
    const extra = check({ currency: 'VND', days: [doubled] }).filter(
      (v) => v.code === 'EXTRA_MEAL',
    );
    expect(extra.map((v) => v.poiId)).toEqual([P.farLunch.id]);
  });

  it('breaks an order that cannot reach it in time', () => {
    const late = bestOrder({
      date: FRAME.dates[1] as string,
      choices: [stop(P.falls), lunch],
      pois: POIS,
      window: { startMin: 11 * 60, endMin: 22 * 60 },
      travel: NEAR,
      tz: TZ,
    });
    // The falls take until half past twelve and are ninety minutes away: only after lunch.
    expect(late.order).toEqual([1, 0]);
  });
});

describe('a stop of hers on a dropped pin', () => {
  const at = (minute: number) => instantAt(FRAME.dates[1] as string, minute, TZ).toISOString();
  // No place of ours: the row has no `poi_id`, only its times and its lock.
  const picnic: Itinerary['days'][number]['items'][number] = {
    ...(day(1, [stop(P.lunch, 'meal')]).items[0] as Itinerary['days'][number]['items'][number]),
    stable_id: id(5001),
    poi_id: null,
    starts_at: at(12 * 60),
    ends_at: at(13 * 60),
    locked_reason: 'user',
  };
  const pin = place(90, 'Nhà bà ngoại', 'food');
  const pinned = new Map([
    ...POIS,
    [pinIdOf(picnic.stable_id), { ...pin, id: pinIdOf(picnic.stable_id) }],
  ]);
  const check = (items: Itinerary['days'][number]['items'], pois: typeof POIS) =>
    validateItinerary({
      itinerary: { currency: 'VND', days: [{ ...day(1, []), items }] },
      pois,
      frame: FRAME,
      travel: NEAR,
      requiredMustDoIds: [],
      mealPlaces: [P.lunch, P.dinner],
      hopCapMin: 40,
    }).violations.map((v) => `${v.code}:${v.slot ?? ''}`);

  it('is planned under a pin id and never written as a place', () => {
    expect(placeIdOf(picnic)).toBe(pinIdOf(id(5001)));
    expect(isPinId(pinIdOf(id(5001)))).toBe(true);
    expect(placeIdOf({ ...picnic, locked_reason: null })).toBeNull();
    const choices = choicesOfDay({ items: [picnic] });
    expect(choices[0]).toMatchObject({ poiId: pinIdOf(id(5001)), stableId: id(5001) });
    const again = scheduleDay({
      dayNo: 2,
      date: FRAME.dates[1] as string,
      theme: 'A day',
      choices: [stop(P.museum), ...choices],
      pois: pinned,
      window: dayWindow(FRAME, 1),
      travel: NEAR,
      bands: null,
      currency: 'VND',
      tz: TZ,
      idFor: () => id(5002),
    });
    expect(again.items.find((item) => item.stable_id === id(5001))).toMatchObject({
      poi_id: null,
      starts_at: picnic.starts_at,
      ends_at: picnic.ends_at,
      locked_reason: 'user',
    });
  });

  it('is no unknown place, with or without a place for its pin, and is the day’s lunch', () => {
    // Without her picnic the day lacks lunch and dinner; with it, only dinner.
    const museum = day(1, [stop(P.museum)]).items;
    expect(check(museum, POIS).sort()).toEqual(['MEAL_MISSING:dinner', 'MEAL_MISSING:lunch']);
    for (const pois of [POIS, pinned]) {
      expect(check([...museum, picnic], pois)).toEqual(['MEAL_MISSING:dinner']);
    }
    // A stop of the guide's with no place is still an unknown place.
    expect(check([{ ...picnic, locked_reason: null }], POIS)).toContain('UNKNOWN_POI:');
  });
});
