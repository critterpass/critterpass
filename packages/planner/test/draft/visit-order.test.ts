import { describe, expect, it } from 'vitest';

import { dayWindow, visitOrder, type DayChoice } from '../../src/draft/index';
import { FRAME, P, POIS, TRAVEL } from './kyoto-fixture';

const pick = (id: string, kind: 'activity' | 'meal' = 'activity'): DayChoice => ({
  poiId: id,
  kind,
  mustDoId: null,
  note: null,
});

const order = (
  choices: DayChoice[],
  dayIndex = 1,
  areaOf?: (poiId: string) => string | undefined,
) =>
  visitOrder({
    date: FRAME.dates[dayIndex] as string,
    choices,
    pois: POIS,
    window: dayWindow(FRAME, dayIndex),
    travel: TRAVEL,
    ...(areaOf === undefined ? {} : { areaOf }),
  });

describe('visitOrder', () => {
  it("keeps the guide's order when it works", () => {
    expect(order([pick(P.kinkakuji.id), pick(P.ramen.id, 'meal'), pick(P.gion.id)])).toEqual([
      0, 1, 2,
    ]);
  });

  it('moves a place that would close before its visit ends, changing as little as it can', () => {
    // Pontocho opens at 17:00 and Kinkaku-ji shuts then: the temple goes first, and the alley
    // last, so nobody waits for it to open with the walk still to do.
    const choices = [pick(P.pontocho.id), pick(P.kinkakuji.id), pick(P.gion.id)];
    expect(order(choices)).toEqual([1, 2, 0]);
  });

  it('puts a lunch-only meal at lunch and the dinner place in the evening', () => {
    const choices = [
      pick(P.kichi.id, 'meal'),
      pick(P.fushimi.id),
      pick(P.ramen.id, 'meal'),
      pick(P.nijo.id),
    ];
    const visit = order(choices).map((i) => choices[i]?.poiId);
    expect(visit.indexOf(P.ramen.id)).toBeLessThan(visit.indexOf(P.kichi.id));
  });

  it('sees one area at a time: a day that would go back to an area it left is reordered', () => {
    const areas = new Map([
      [P.gion.id, 'Higashiyama'],
      [P.philosopher.id, 'Sakyo'],
      [P.museum.id, 'Higashiyama'],
    ]);
    const choices = [pick(P.gion.id), pick(P.philosopher.id), pick(P.museum.id)];
    // Without areas the guide's order works and stands; with them, Gion and the museum are
    // seen together, before or after the walk in Sakyo.
    expect(order(choices)).toEqual([0, 1, 2]);
    const visit = order(choices, 1, (id) => areas.get(id)).map((i) => choices[i]?.poiId ?? '');
    expect(Math.abs(visit.indexOf(P.gion.id) - visit.indexOf(P.museum.id))).toBe(1);
  });
});
