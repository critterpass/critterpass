/**
 * How many stops a day's reply may keep (see `withinCapacity`).
 */
import type { DayChoice, DayWindow } from '@cp/planner';

import { mealsIn, type SkeletonDay } from './skeleton';

/**
 * The day's capacity, as the reply was told it: no more activities than the outline planned
 * (spares only stand in for planned ones) and no more meals than the day runs through. Extras are
 * cut, spares first, before the planner times the day.
 */
export function withinCapacity(
  day: SkeletonDay,
  window: DayWindow,
  choices: readonly DayChoice[],
): DayChoice[] {
  const planned = new Set(day.poiIds);
  let activities = choices.filter((c) => c.kind === 'activity' && c.mustDoId === null).length;
  let meals = choices.filter((c) => c.kind === 'meal' && c.mustDoId === null).length;
  const mealRoom = mealsIn(window);
  const cut = new Set<number>();
  const order = choices
    .map((choice, index) => ({ choice, index }))
    .filter(({ choice }) => choice.mustDoId === null)
    .sort(
      (a, b) =>
        Number(planned.has(a.choice.poiId)) - Number(planned.has(b.choice.poiId)) ||
        b.index - a.index,
    );
  for (const { choice, index } of order) {
    if (choice.kind === 'activity' && activities > day.poiIds.length) {
      cut.add(index);
      activities -= 1;
    } else if (choice.kind === 'meal' && meals > mealRoom) {
      cut.add(index);
      meals -= 1;
    }
  }
  return choices.filter((_, index) => !cut.has(index));
}
