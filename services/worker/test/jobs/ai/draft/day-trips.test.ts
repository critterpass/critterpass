import { describe, expect, it } from 'vitest';

import {
  chooseDayTrips,
  dayTripsCoverage,
  type DayTripCandidate,
} from '../../../../src/jobs/ai/draft/day-trips';

const trip = (n: number, dayLength: 'half' | 'full', hasPlaces = true): DayTripCandidate => ({
  destinationId: `0199a0f2-0000-7000-8000-${String(n).padStart(12, '0')}`,
  name: `Area ${n}`,
  minutes: 120,
  dayLength,
  hasPlaces,
});

const placedDays = (choice: ReturnType<typeof chooseDayTrips>) =>
  choice.placed.map((placed) => placed.dayNo);
const reasons = (choice: ReturnType<typeof chooseDayTrips>) =>
  choice.leftOut.map((gap) => gap.reason);

describe('which essential day trip a first draft gives a day', () => {
  it.each([
    [3, 'half', [2], []],
    [3, 'full', [], ['trip_too_short']],
    [4, 'full', [3], []],
    [4, 'half', [3], []],
    [5, 'full', [3], []],
    [5, 'half', [3], []],
  ] as const)('a %i-day trip and a %s-day trip', (days, length, onDays, why) => {
    const choice = chooseDayTrips(days, [trip(1, length)], new Set());
    expect(placedDays(choice)).toEqual(onDays);
    expect(reasons(choice)).toEqual(why);
  });

  it('gives a five-day trip one of two essentials and says the other had no room', () => {
    const choice = chooseDayTrips(5, [trip(1, 'full'), trip(2, 'half')], new Set());
    expect(placedDays(choice)).toEqual([3]);
    expect(choice.leftOut).toEqual([
      { destinationId: trip(2, 'half').destinationId, reason: 'no_room' },
    ]);
  });

  it('gives a week two, on the middle days nearest its midpoint', () => {
    const choice = chooseDayTrips(7, [trip(1, 'full'), trip(2, 'full')], new Set());
    expect(placedDays(choice)).toEqual([4, 5]);
  });

  it('moves off a day holding her stops, and says so when every middle day does', () => {
    expect(placedDays(chooseDayTrips(5, [trip(1, 'full')], new Set([3])))).toEqual([4]);
    const full = chooseDayTrips(5, [trip(1, 'full')], new Set([2, 3, 4]));
    expect(placedDays(full)).toEqual([]);
    expect(reasons(full)).toEqual(['no_free_day']);
  });

  it('leaves out an area with nothing to plan from yet', () => {
    const choice = chooseDayTrips(5, [trip(1, 'full', false), trip(2, 'full')], new Set());
    expect(reasons(choice)).toEqual(['no_places']);
    expect(choice.placed.map((p) => p.destinationId)).toEqual([trip(2, 'full').destinationId]);
  });

  it('writes no coverage key when the destination offers no day trip', () => {
    expect(dayTripsCoverage(null)).toEqual({});
    expect(dayTripsCoverage(chooseDayTrips(5, [], new Set()))).toEqual({});
    expect(dayTripsCoverage(chooseDayTrips(5, [trip(1, 'full')], new Set()))).toEqual({
      day_trips: {
        placed: [{ destination_id: trip(1, 'full').destinationId, day_no: 3 }],
        left_out: [],
      },
    });
  });
});
