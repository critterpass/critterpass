/**
 * A sight across town from the rest of a day is seen before dinner, never after it: neither the
 * essentials' pass nor the evenings take a day across town once it has dined.
 */
import type { Itinerary } from '@cp/domain';
import { straightLineMatrix, type DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { baselineItinerary } from '../evals/draft/baseline';
import { CREWS, planInput } from '../evals/draft/cases';
import { acrossTownAfterDinner, isAcrossTown } from '../src/prompts/draft/across-town';
import { areaStep, hopCap } from '../src/prompts/draft/areas';
import type { DraftPlanInput } from '../src/prompts/draft/context';
import { fillEvenings } from '../src/prompts/draft/evenings';
import { placeOne } from '../src/prompts/draft/place-essential';
import type { SkeletonDay } from '../src/prompts/draft/skeleton';

type Day = Itinerary['days'][number];

const outlineOf = (day: Day): SkeletonDay => ({
  dayNo: day.day_no,
  date: day.date,
  theme: day.theme,
  area: 'the centre',
  mustDoIds: [],
  poiIds: day.items.flatMap((item) =>
    item.kind === 'activity' && item.poi_id !== null ? [item.poi_id] : [],
  ),
  mealIds: [],
  spareIds: [],
});

/** A museum pages agree on, best in the evening, `metres` north of `poi`, open every day. */
function museumAt(poi: DraftPoi, metres: number): DraftPoi {
  return {
    ...poi,
    id: 'far-museum',
    name: 'Museum across the river',
    category: 'museum',
    tags: ['museums'],
    lat: poi.lat + metres / 111_000,
    area: 'Across the river',
    hours: null,
    hoursGuessed: false,
    durationMin: 90,
    bestTimes: ['afternoon', 'evening'],
    mustSee: true,
    blogCount: 6,
    essential: true,
    essentialRank: 1,
    pairsWith: [],
  };
}

/** `input` with `museum` on its lists and open every day. */
function withMuseum(input: DraftPlanInput, museum: DraftPoi): DraftPlanInput {
  const pois = new Map([...input.pois, [museum.id, museum] as const]);
  const days = input.frame.dates.map((_, index) => index + 1);
  return {
    ...input,
    pois,
    travel: straightLineMatrix(pois),
    pools: {
      ...input.pools,
      activities: [...input.pools.activities, museum],
      openDays: new Map([...input.pools.openDays, [museum.id, days] as const]),
    },
  };
}

/** The museum across town from `day`: two areas away, yet within a ride of its last stop. */
function museumAcrossTown(input: DraftPlanInput, day: Day): DraftPlanInput | undefined {
  const last = input.pois.get(day.items.at(-1)?.poi_id ?? '');
  if (last === undefined) return undefined;
  const here = day.items.flatMap((item) => (item.poi_id === null ? [] : [item.poi_id]));
  const cap = hopCap(input);
  for (let metres = 500; metres <= 30_000; metres += 250) {
    const made = withMuseum(input, museumAt(last, metres));
    const ride = made.travel(last.id, 'far-museum');
    if (ride == null || ride > cap) break;
    if (areaStep(made, 'far-museum', here) === 2) return made;
  }
  return undefined;
}

/** Days between the first and the last that end with their dinner. */
const middleDays = (plan: Itinerary) =>
  plan.days.filter(
    (d, index) => index > 0 && index < plan.days.length - 1 && d.items.at(-1)?.kind === 'meal',
  );

describe('across town before dinner', { timeout: 60_000 }, () => {
  it('never gives the evening to a sight across town', () => {
    let checked = 0;
    for (const crew of CREWS) {
      const plain = { ...planInput(crew), tastes: {} };
      const base = baselineItinerary(plain);
      for (const day of middleDays(base)) {
        const input = museumAcrossTown(plain, day);
        if (input === undefined) continue;
        checked += 1;
        const after = fillEvenings(input, base.days.map(outlineOf), base).itinerary;
        const made = after.days.find((d) => d.day_no === day.day_no);
        expect(made?.items.some((item) => item.poi_id === 'far-museum')).toBe(false);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('places an essential across town only before the day’s dinner', () => {
    let placed = 0;
    for (const crew of CREWS) {
      const plain = planInput(crew);
      const base = baselineItinerary(plain);
      for (const day of middleDays(base)) {
        const input = museumAcrossTown(plain, day);
        const museum = input?.pois.get('far-museum');
        if (input === undefined || museum === undefined) continue;
        const outlines = base.days.map(outlineOf);
        const after = placeOne(input, outlines, base, museum, 0, true);
        const made = after?.days.find((d) => d.items.some((i) => i.poi_id === 'far-museum'));
        if (made === undefined || !isAcrossTown(input, made, 'far-museum')) continue;
        placed += 1;
        expect(acrossTownAfterDinner(input, made, 'far-museum')).toBe(false);
      }
    }
    expect(placed).toBeGreaterThan(0);
  });
});
