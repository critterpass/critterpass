/**
 * Meals on the way: a meal far off the line between the stops around it gives way to a place
 * nearer that line, the day walks less and breaks nothing more, and a meal itinerary pages agree on
 * gives way only to another they agree on, unless it is very far out of the way.
 */
import type { Itinerary } from '@cp/domain';
import { straightLineMatrix, type DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { baselineItinerary } from '../evals/draft/baseline';
import { CREWS, planInput } from '../evals/draft/cases';
import { isAgreed } from '../src/prompts/draft/agreement';
import type { DraftPlanInput } from '../src/prompts/draft/context';
import { aroundMeal, dayShape } from '../src/prompts/draft/meal-areas';
import {
  dayMetres,
  detourOf,
  FAR_DETOUR_M,
  withMealsOnTheWay,
} from '../src/prompts/draft/meal-detours';
import type { SkeletonDay } from '../src/prompts/draft/skeleton';
import { validate } from '../src/prompts/draft/validate';

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

const violations = (input: DraftPlanInput, itinerary: Itinerary, dayNo: number) =>
  validate(input, itinerary).violations.filter((v) => v.dayNo === dayNo).length;

const meals = (day: Day) =>
  day.items.flatMap((item) => (item.kind === 'meal' && item.poi_id !== null ? [item.poi_id] : []));

describe('meals on the way', { timeout: 60_000 }, () => {
  it('moves a far meal nearer the day and never makes the day worse', () => {
    let moved = 0;
    for (const crew of CREWS) {
      const input = planInput(crew);
      const base = baselineItinerary(input);
      for (const day of base.days) {
        const after = withMealsOnTheWay(input, outlineOf(day), base);
        const made = after.days.find((d) => d.day_no === day.day_no);
        if (made === undefined) throw new Error(`no day ${day.day_no}`);
        const was = meals(day);
        const now = meals(made);
        if (was.join() === now.join()) continue;
        moved += 1;
        expect(made.items).toHaveLength(day.items.length);
        expect(dayMetres(input, made)).toBeLessThanOrEqual(dayMetres(input, day) - 500);
        expect(violations(input, after, day.day_no)).toBeLessThanOrEqual(
          violations(input, base, day.day_no),
        );
        expect(dayShape(input, made).returns).toBeLessThanOrEqual(dayShape(input, day).returns);
        // A meal pages agree on is replaced only by one they agree on too, unless it was very far.
        was.forEach((id, at) => {
          const before = input.pois.get(id);
          const instead = input.pois.get(now[at] ?? '');
          const seat = day.items.findIndex((item) => item.kind === 'meal' && item.poi_id === id);
          const around = aroundMeal(day, seat).flatMap((p) => input.pois.get(p) ?? []);
          if (before === undefined || instead === undefined || !isAgreed(input, before)) return;
          if (detourOf(before, around) <= FAR_DETOUR_M) expect(isAgreed(input, instead)).toBe(true);
        });
      }
    }
    expect(moved).toBeGreaterThan(0);
  });

  it('lets a very far meal pages agree on give way to a near one they do not', () => {
    let swapped = 0;
    for (const crew of CREWS) {
      const plain = planInput(crew);
      const base = baselineItinerary(plain);
      for (const day of base.days) {
        const at = day.items.findIndex((item) => item.kind === 'meal' && item.poi_id !== null);
        const meal = plain.pois.get(day.items[at]?.poi_id ?? '');
        const around = aroundMeal(day, at).flatMap((id) => plain.pois.get(id) ?? []);
        const [a, b] = around;
        if (meal === undefined || a === undefined || b === undefined) continue;
        const middle = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
        // Pages agree on the far one (six of them hold it), on none of the near one.
        const farMeal: DraftPoi = {
          ...meal,
          id: 'far-meal',
          lat: middle.lat + 3_500 / 111_000,
          lng: middle.lng,
          blogCount: 6,
          mustSee: true,
        };
        const near: DraftPoi = {
          ...meal,
          ...middle,
          id: 'near-meal',
          blogCount: 0,
          mustSee: false,
          essential: false,
          essentialRank: null,
          prominence: null,
        };
        const input = withEateries(plain, [farMeal, near]);
        if (!isAgreed(input, farMeal) || isAgreed(input, near)) continue;
        if (detourOf(farMeal, around) <= FAR_DETOUR_M) continue;
        const start = withMealPlace(base, day.day_no, at, 'far-meal');
        const after = withMealsOnTheWay(input, outlineOf(day), start);
        const made = after.days.find((d) => d.day_no === day.day_no);
        if (made?.items.some((item) => item.poi_id === 'near-meal')) swapped += 1;
      }
    }
    expect(swapped).toBeGreaterThan(0);
  });
});

/** `input` with `eateries` on its lists, open every day. */
function withEateries(input: DraftPlanInput, eateries: readonly DraftPoi[]): DraftPlanInput {
  const pois = new Map([...input.pois, ...eateries.map((poi) => [poi.id, poi] as const)]);
  const days = input.frame.dates.map((_, index) => index + 1);
  return {
    ...input,
    pois,
    travel: straightLineMatrix(pois),
    pools: {
      ...input.pools,
      eateries: [...input.pools.eateries, ...eateries],
      openDays: new Map([...input.pools.openDays, ...eateries.map((p) => [p.id, days] as const)]),
    },
  };
}

/** `plan` with the meal at `at` on day `dayNo` eaten at `poiId`. */
function withMealPlace(plan: Itinerary, dayNo: number, at: number, poiId: string): Itinerary {
  return {
    ...plan,
    days: plan.days.map((d) =>
      d.day_no === dayNo
        ? { ...d, items: d.items.map((item, i) => (i === at ? { ...item, poi_id: poiId } : item)) }
        : d,
    ),
  };
}
