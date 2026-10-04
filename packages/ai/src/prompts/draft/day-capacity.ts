/**
 * How many stops a day's reply may keep (see `withinCapacity`).
 */
import { foodRole, type DayChoice, type DayWindow, type DraftPoi } from '@cp/planner';

import { mealsIn, type SkeletonDay } from './skeleton';

/**
 * The day's capacity, as the reply was told it: no more activities than the outline planned
 * (spares only stand in for planned ones), no more meals than the day runs through, and one
 * coffee or snack break. Extras are cut, spares first, before the planner times the day.
 */
export function withinCapacity(
  day: SkeletonDay,
  window: DayWindow,
  choices: readonly DayChoice[],
  pois: ReadonlyMap<string, DraftPoi> = new Map(),
): DayChoice[] {
  const planned = new Set(day.poiIds);
  let activities = choices.filter((c) => c.kind === 'activity' && c.mustDoId === null).length;
  let meals = choices.filter((c) => c.kind === 'meal' && c.mustDoId === null).length;
  const mealRoom = mealsIn(window);
  const cut = new Set<number>();
  const isBreak = (choice: DayChoice) => {
    const poi = pois.get(choice.poiId);
    return poi !== undefined && foodRole(poi) === 'light';
  };
  let breaks = choices.filter(isBreak).length;
  const order = choices
    .map((choice, index) => ({ choice, index }))
    // A must-do, a booking and a stop placed by hand are never cut for room.
    .filter(({ choice }) => choice.mustDoId === null && (choice.lockedReason ?? null) === null)
    .sort(
      (a, b) =>
        Number(planned.has(a.choice.poiId)) - Number(planned.has(b.choice.poiId)) ||
        b.index - a.index,
    );
  for (const { choice, index } of order) {
    if (
      choice.kind === 'activity' &&
      (activities > day.poiIds.length || (isBreak(choice) && breaks > 1))
    ) {
      cut.add(index);
      activities -= 1;
      if (isBreak(choice)) breaks -= 1;
    } else if (choice.kind === 'meal' && meals > mealRoom) {
      cut.add(index);
      meals -= 1;
    }
  }
  return choices.filter((_, index) => !cut.has(index));
}
