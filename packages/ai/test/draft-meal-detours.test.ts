/**
 * Meals on the way: a meal far off the line between the stops around it gives way to a place
 * nearer that line, the day walks less and breaks nothing more, and a meal itinerary pages agree on
 * gives way only to another they agree on.
 */
import type { Itinerary } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { baselineItinerary } from '../evals/draft/baseline';
import { CREWS, planInput } from '../evals/draft/cases';
import { isAgreed } from '../src/prompts/draft/agreement';
import type { DraftPlanInput } from '../src/prompts/draft/context';
import { dayShape } from '../src/prompts/draft/meal-areas';
import { dayMetres, withMealsOnTheWay } from '../src/prompts/draft/meal-detours';
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
        // A meal pages agree on is replaced only by one they agree on too.
        was.forEach((id, at) => {
          const before = input.pois.get(id);
          const instead = input.pois.get(now[at] ?? '');
          if (before !== undefined && instead !== undefined && isAgreed(input, before)) {
            expect(isAgreed(input, instead)).toBe(true);
          }
        });
      }
    }
    expect(moved).toBeGreaterThan(0);
  });
});
