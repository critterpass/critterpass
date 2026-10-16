/**
 * A day sees one area at a time, also when it is too long to try every order of its stops: the
 * planner then moves one stop at a time until the day stops zigzagging.
 */
import { describe, expect, it } from 'vitest';

import { bestOrder, dayWindow, MAX_SEARCHED_STOPS, type DayChoice } from '../../src/draft/index';
import { areaReturns } from '../../src/draft/area-returns';
import { FRAME, POIS, P, TRAVEL } from './kyoto-fixture';

const sights = [
  P.fushimi,
  P.gion,
  P.philosopher,
  P.kiyomizu,
  P.museum,
  P.nijo,
  P.kinkakuji,
  P.nishiki,
];
const pois = new Map(POIS);
// Short visits, so the eight fit one day in any order.
for (const poi of sights) pois.set(poi.id, { ...poi, durationMin: 30, hours: null });
const areaOf = (id: string) => {
  const index = sights.findIndex((poi) => poi.id === id);
  return index === -1 ? undefined : index % 2 === 0 ? 'East' : 'West';
};
const choices: DayChoice[] = sights.map((poi) => ({
  poiId: poi.id,
  kind: 'activity',
  mustDoId: null,
  note: null,
}));

describe('a long day', () => {
  it('that crosses between two areas at every stop is laid out one area at a time', () => {
    expect(choices.length).toBeGreaterThan(MAX_SEARCHED_STOPS);
    const identity = choices.map((_, index) => index);
    expect(areaReturns(identity, choices, areaOf)).toBe(6);
    const { order, broken } = bestOrder({
      date: FRAME.dates[1] as string,
      choices,
      pois,
      window: dayWindow(FRAME, 1),
      travel: TRAVEL,
      areaOf,
    });
    expect(broken).toBe(0);
    expect([...order].sort()).toEqual(identity);
    expect(areaReturns(order, choices, areaOf)).toBe(0);
  });
});
