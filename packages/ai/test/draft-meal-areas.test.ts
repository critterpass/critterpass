/**
 * Meals where the day is: a lunch or dinner away from the areas of the stops around it gives way
 * to a place in one of them, and a crew's tastes choose between the meal places of an area.
 */
import type { Itinerary } from '@cp/domain';
import { mealSlots, sameDish, tasteScore, type DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { baselineItinerary } from '../evals/draft/baseline';
import { CREWS, planInput } from '../evals/draft/cases';
import type { DraftPlanInput } from '../src/prompts/draft/context';
import { ownArea } from '../src/prompts/draft/areas';
import { dayShape, withMealsInDayAreas } from '../src/prompts/draft/meal-areas';
import type { SkeletonDay } from '../src/prompts/draft/skeleton';
import { validate } from '../src/prompts/draft/validate';

type Day = Itinerary['days'][number];

const inputOf = (id: string): DraftPlanInput => {
  const crew = CREWS.find((c) => c.id === id);
  if (crew === undefined) throw new Error(`no crew ${id}`);
  return planInput(crew);
};

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

const dayOf = (itinerary: Itinerary, dayNo: number): Day => {
  const day = itinerary.days.find((d) => d.day_no === dayNo);
  if (day === undefined) throw new Error(`no day ${dayNo}`);
  return day;
};

const violations = (input: DraftPlanInput, itinerary: Itinerary, dayNo: number) =>
  validate(input, itinerary).violations.filter((v) => v.dayNo === dayNo).length;

/** The areas of the stops that are not meals on either side of each meal of the day. */
function mealsBeside(input: DraftPlanInput, day: Day): boolean[] {
  const area = (id: string) => ownArea(input, id);
  return day.items.flatMap((item, at) => {
    if (item.kind !== 'meal' || item.poi_id === null) return [];
    const before = day.items
      .slice(0, at)
      .reverse()
      .find((i) => i.kind !== 'meal');
    const after = day.items.slice(at + 1).find((i) => i.kind !== 'meal');
    const around = [before?.poi_id, after?.poi_id].flatMap((id) => (id == null ? [] : [area(id)]));
    return [around.includes(area(item.poi_id))];
  });
}

describe('meals in the day areas', () => {
  it('moves a lunch that makes the day go back to an area into the area of its stops', () => {
    const input = inputOf('danang-v6-5');
    const base = baselineItinerary(input);
    const day = dayOf(base, 4);
    expect(dayShape(input, day).returns).toBe(1);
    const after = withMealsInDayAreas(input, outlineOf(day), base);
    const moved = dayOf(after, 4);
    expect(dayShape(input, moved).returns).toBe(0);
    expect(moved.items).toHaveLength(day.items.length);
    expect(mealsBeside(input, moved).every(Boolean)).toBe(true);
    expect(violations(input, after, 4)).toBeLessThanOrEqual(violations(input, base, 4));
  });

  it('eats dinner where the afternoon ends, not in the area the morning left', () => {
    const input = inputOf('danang-real-1');
    const base = baselineItinerary(input);
    const day = dayOf(base, 2);
    expect(mealsBeside(input, day)).toEqual([false]);
    const moved = dayOf(withMealsInDayAreas(input, outlineOf(day), base), 2);
    expect(mealsBeside(input, moved)).toEqual([true]);
    expect(dayShape(input, moved).areas).toBeLessThan(dayShape(input, day).areas);
  });

  it("takes the meal place of the area that suits the crew's tastes", () => {
    const plain = inputOf('danang-real-1');
    const base = baselineItinerary(plain);
    const day = dayOf(base, 3);
    const meal = day.items.find((item) => item.kind === 'meal');
    const area = (id: string) => ownArea(plain, id);
    const used = new Set(base.days.flatMap((d) => d.items.map((i) => i.poi_id)));
    const meals = base.days.flatMap((d) =>
      d.items.flatMap((i) => (i.kind === 'meal' ? (plain.pois.get(i.poi_id ?? '') ?? []) : [])),
    );
    const lunch = plain.pools.eateries.find(
      (poi) =>
        !used.has(poi.id) &&
        !meals.some((other) => sameDish(other, poi)) &&
        area(poi.id) === area(meal?.poi_id ?? '') &&
        mealSlots(poi, day.date).includes('lunch') &&
        (plain.pools.openDays.get(poi.id) ?? []).includes(3),
    );
    if (meal?.poi_id == null || lunch === undefined) throw new Error('no lunch to swap in');
    // A crew of market lovers, and one place of the area that is a market stall.
    const tagged: DraftPoi = { ...lunch, tags: [...lunch.tags, 'markets'] };
    const pois = new Map(plain.pois);
    pois.set(tagged.id, tagged);
    const input: DraftPlanInput = {
      ...plain,
      tastes: { markets: 2 },
      pois,
      pools: {
        ...plain.pools,
        eateries: plain.pools.eateries.map((poi) => (poi.id === tagged.id ? tagged : poi)),
      },
    };
    expect(tasteScore(input.pois.get(meal.poi_id) as DraftPoi, input.tastes)).toBe(0);
    const swapped = dayOf(withMealsInDayAreas(input, outlineOf(day), base), 3);
    expect(swapped.items.some((item) => item.poi_id === tagged.id)).toBe(true);
    // The crew with no tastes keeps the meal it had.
    const kept = dayOf(withMealsInDayAreas(plain, outlineOf(day), base), 3);
    expect(kept.items.map((item) => item.poi_id)).toEqual(day.items.map((item) => item.poi_id));
  });
});
