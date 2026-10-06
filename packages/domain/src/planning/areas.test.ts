import { describe, expect, it } from 'vitest';

import {
  dayCarriedAcrossStops,
  refitStops,
  seatDayArea,
  stopDayRanges,
  stopIndexOfDay,
} from './areas';

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

describe('seating days in stops', () => {
  const stops = [
    { destinationId: 'danang', nights: 2 },
    { destinationId: 'hue', nights: 2 },
  ];
  const dayTrips = new Set(['danang>hoian', 'hue>bachma']);
  const isDayTrip = (from: string, to: string) => dayTrips.has(`${from}>${to}`);

  it.each([
    { day: 1, area: null, seated: null, why: 'a first-stop day stays unset' },
    { day: 2, area: 'hoian', seated: 'hoian', why: 'a day trip from its own stop stays' },
    { day: 2, area: 'hue', seated: null, why: "another stop's city leaves a first-stop day" },
    { day: 3, area: null, seated: 'hue', why: "a later stop's day takes its city" },
    { day: 3, area: 'hoian', seated: 'hue', why: 'a day trip from another stop is dropped' },
    { day: 4, area: 'bachma', seated: 'bachma', why: 'a day trip from the later stop stays' },
    { day: 5, area: 'danang', seated: 'hue', why: 'the last day belongs to the last stop' },
  ])('day $day with $area: $why', ({ day, area, seated }) => {
    expect(seatDayArea(stops, day, area, isDayTrip)).toBe(seated);
  });

  it('seats every day of a one-stop trip at its city', () => {
    const one = [{ destinationId: 'danang', nights: 4 }];
    expect(seatDayArea(one, 3, 'hue', isDayTrip)).toBeNull();
    expect(seatDayArea(one, 3, 'hoian', isDayTrip)).toBe('hoian');
  });
});

describe('refitting stops to new dates', () => {
  const nights = (stops: readonly { nights: number }[]) => stops.map((stop) => stop.nights);

  it.each([
    { from: [2, 2], to: 4, fitted: [2, 2] },
    { from: [2, 2], to: 6, fitted: [2, 4] },
    { from: [2, 2], to: 3, fitted: [2, 1] },
    { from: [2, 2], to: 1, fitted: [] },
    { from: [2, 2], to: 2, fitted: [] },
    { from: [2, 1, 2], to: 3, fitted: [2, 1] },
    { from: [2, 1, 2], to: 2, fitted: [] },
    { from: [1, 1, 1], to: 2, fitted: [1, 1] },
    { from: [], to: 5, fitted: [] },
  ])('$from over $to nights is $fitted', ({ from, to, fitted }) => {
    expect(
      nights(
        refitStops(
          from.map((n) => ({ nights: n })),
          to,
        ),
      ),
    ).toEqual(fitted);
  });
});

describe('a reorder across stops', () => {
  const stops = [{ nights: 2 }, { nights: 2 }];

  it.each([
    {
      moves: [
        { from: 1, to: 2 },
        { from: 2, to: 1 },
      ],
      carried: null,
    },
    {
      moves: [
        { from: 3, to: 5 },
        { from: 5, to: 3 },
      ],
      carried: null,
    },
    {
      moves: [
        { from: 2, to: 3 },
        { from: 3, to: 2 },
      ],
      carried: 2,
    },
  ])('$moves carries $carried', ({ moves, carried }) => {
    expect(dayCarriedAcrossStops(stops, moves)).toBe(carried);
  });

  it('is free on a one-stop trip', () => {
    expect(dayCarriedAcrossStops([], [{ from: 1, to: 4 }])).toBeNull();
  });
});
