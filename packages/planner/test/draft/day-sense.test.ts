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
  dayWindow,
  dinnerIsRideHome,
  hopCapMin,
  longHops,
  longRideMin,
  roadBudgetMin,
  withinReach,
} from '../../src/draft/index';
import {
  FRAME,
  NEAR,
  P,
  codes,
  drafted,
  id,
  line,
  names,
  place,
  stop,
  EVENINGS,
} from './day-sense-fixture';

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

  it('counts the ride out from where the crew sleeps, and lets it ride back to town once', () => {
    const travel = line({ home: 0, cafe: 5, museum: 10, peak: 55, lookout: 62, farm: 110 });
    // Out to the peak is the day's long ride: no second one to the farm.
    expect(longHops(['peak', 'lookout', 'farm'], travel, 40, undefined, 'home')).toEqual([
      { index: 2, over: 8 },
    ]);
    // Without a home the same day passes: the first stop is where the day starts.
    expect(longHops(['peak', 'lookout', 'farm'], travel, 40)).toEqual([]);
    // Back to town after the peak is the way back, not a second long ride.
    expect(longHops(['peak', 'lookout', 'cafe', 'museum'], travel, 40, undefined, 'home')).toEqual(
      [],
    );
    // But not out again after it.
    expect(
      longHops(['peak', 'cafe', 'lookout'], travel, 40, undefined, 'home').map((hop) => hop.index),
    ).toEqual([2]);
    // Home is not three hours from the first stop of the day.
    const far = line({ home: 0, island: 200 });
    expect(longHops(['island'], far, 40, undefined, 'home')).toEqual([{ index: 0, over: 160 }]);
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
