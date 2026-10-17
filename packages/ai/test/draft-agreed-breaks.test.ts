/**
 * A coffee or snack stop itinerary pages agree on that the draft left out gets a day in its own
 * area, the day keeps one break, and a break pages agree on more takes the seat of a lesser one.
 */
import type { Itinerary } from '@cp/domain';
import { foodRole, straightLineMatrix, type DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { baselineItinerary } from '../evals/draft/baseline';
import { CREWS, planInput } from '../evals/draft/cases';
import { placeAgreedBreaks } from '../src/prompts/draft/agreed-breaks';
import { areaStep } from '../src/prompts/draft/areas';
import type { DraftPlanInput } from '../src/prompts/draft/context';
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

/** A café `metres` north of `poi`, open every day; `pages` itinerary pages hold it. */
function cafeBy(poi: DraftPoi, metres: number, id: string, pages: number): DraftPoi {
  return {
    ...poi,
    id,
    name: `Coffee house ${id}`,
    category: 'food',
    tags: ['coffee'],
    lat: poi.lat + metres / 111_000,
    hours: null,
    hoursGuessed: false,
    durationMin: 30,
    visitMin: 30,
    mealRole: 'light',
    bestTimes: ['morning', 'afternoon'],
    mustSee: false,
    prominence: null,
    blogCount: pages,
    essential: false,
    essentialRank: null,
    pairsWith: [],
  };
}

function withCafes(input: DraftPlanInput, cafes: readonly DraftPoi[]): DraftPlanInput {
  const pois = new Map([...input.pois, ...cafes.map((cafe) => [cafe.id, cafe] as const)]);
  const days = input.frame.dates.map((_, index) => index + 1);
  return {
    ...input,
    pois,
    travel: straightLineMatrix(pois),
    pools: {
      ...input.pools,
      breaks: [...input.pools.breaks, ...cafes],
      openDays: new Map([...input.pools.openDays, ...cafes.map((c) => [c.id, days] as const)]),
    },
  };
}

const placesOf = (day: Day) => day.items.flatMap((item) => item.poi_id ?? []);
const holding = (plan: Itinerary, id: string) =>
  plan.days.find((d) => d.items.some((item) => item.poi_id === id));
const breaksOn = (input: DraftPlanInput, day: Day) =>
  day.items.filter((item) => {
    const poi = input.pois.get(item.poi_id ?? '');
    return poi !== undefined && foodRole(poi) === 'light';
  }).length;

describe('agreed coffee and snack stops', { timeout: 60_000 }, () => {
  it('seats a left-out agreed café on a day in its own area, one break a day', () => {
    let placed = 0;
    for (const crew of CREWS) {
      const plain = planInput(crew);
      const base = baselineItinerary(plain);
      for (const day of base.days) {
        const first = plain.pois.get(day.items.find((item) => item.kind !== 'meal')?.poi_id ?? '');
        if (first === undefined) continue;
        const input = withCafes(plain, [cafeBy(first, 120, 'agreed-cafe', 5)]);
        const after = placeAgreedBreaks(input, base.days.map(outlineOf), base).itinerary;
        const made = holding(after, 'agreed-cafe');
        if (made === undefined) continue;
        placed += 1;
        const others = placesOf(made).filter((id) => id !== 'agreed-cafe');
        expect(areaStep(input, 'agreed-cafe', others)).toBe(0);
        expect(breaksOn(input, made)).toBe(1);
      }
    }
    expect(placed).toBeGreaterThan(0);
  });

  it('gives a lesser break’s seat to one pages agree on more, never one pages agree on less', () => {
    let swapped = 0;
    for (const crew of CREWS) {
      const plain = planInput(crew);
      const base = baselineItinerary(plain);
      const first = plain.pois.get(
        base.days[0]?.items.find((item) => item.kind !== 'meal')?.poi_id ?? '',
      );
      if (first === undefined) continue;
      const lesser = cafeBy(first, 100, 'three-pages', 3);
      const input = withCafes(plain, [lesser]);
      const once = placeAgreedBreaks(input, base.days.map(outlineOf), base).itinerary;
      const day = holding(once, lesser.id);
      if (day === undefined) continue;
      // The essential café beside it takes its seat; a café one page holds never would.
      const better = { ...cafeBy(first, 140, 'essential-cafe', 9), essentialRank: 4 };
      const both = withCafes(input, [better]);
      const twice = placeAgreedBreaks(both, base.days.map(outlineOf), once).itinerary;
      const now = twice.days.find((d) => d.day_no === day.day_no);
      if (now === undefined || holding(twice, better.id) !== now) continue;
      swapped += 1;
      expect(holding(twice, lesser.id)).toBeUndefined();
      expect(breaksOn(both, now)).toBe(1);
      const weaker = withCafes(input, [cafeBy(first, 140, 'one-page', 1)]);
      const kept = placeAgreedBreaks(weaker, base.days.map(outlineOf), once).itinerary;
      expect(holding(kept, 'one-page')).toBeUndefined();
      expect(holding(kept, lesser.id)?.day_no).toBe(day.day_no);
    }
    expect(swapped).toBeGreaterThan(0);
  });
});
