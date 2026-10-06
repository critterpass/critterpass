import { describe, expect, it } from 'vitest';

import { stopDayRanges, stopIndexOfDay } from './areas';

describe('the stop a day belongs to', () => {
  it('puts every day of a one-stop trip at its destination', () => {
    for (const day of [1, 2, 5, 30]) expect(stopIndexOfDay([], day)).toBe(0);
    expect(stopDayRanges([], 5)).toEqual([{ first: 1, last: 5 }]);
  });

  it('gives two nights then two nights days 1-2 and 3-5', () => {
    const stops = [{ nights: 2 }, { nights: 2 }];
    expect([1, 2, 3, 4, 5].map((day) => stopIndexOfDay(stops, day))).toEqual([0, 0, 1, 1, 1]);
    expect(stopDayRanges(stops, 5)).toEqual([
      { first: 1, last: 2 },
      { first: 3, last: 5 },
    ]);
  });

  it('puts the travel day at the stop it arrives at and the last day at the last stop', () => {
    const stops = [{ nights: 1 }, { nights: 3 }, { nights: 2 }];
    expect([1, 2, 3, 4, 5, 6, 7].map((day) => stopIndexOfDay(stops, day))).toEqual([
      0, 1, 1, 1, 2, 2, 2,
    ]);
    expect(stopDayRanges(stops, 7)).toEqual([
      { first: 1, last: 1 },
      { first: 2, last: 4 },
      { first: 5, last: 7 },
    ]);
    // A day past the nights stays at the last stop.
    expect(stopIndexOfDay(stops, 12)).toBe(2);
  });
});
