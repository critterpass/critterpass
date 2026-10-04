/**
 * What a stop that may move has to respect when it lands somewhere new: its place's opening spans
 * that day (our own hours; unknown hours never block), the meal window it was planned in (a lunch
 * stays a lunch), the 15-minute grid and the end of the day.
 */
import { openThrough, type OpenSpan } from '@cp/domain';

import { ceilGrid, GRID_MIN } from '../draft/day-minutes';
import { DEFAULT_MEAL_WINDOWS, type MealWindow, type MealWindows } from '../fit/context';

export interface SlotRules {
  readonly spans: readonly OpenSpan[] | null;
  /** The meal window the stop was planned in; null = not a meal, or planned outside one. */
  readonly meal: MealWindow | null;
  readonly duration: number;
}

const FOOD = 'food';

/** The meal window a food stop starting at `start` belongs to, if any. */
export function mealWindowOf(
  category: string | null,
  start: number,
  meals: MealWindows = DEFAULT_MEAL_WINDOWS,
): MealWindow | null {
  if (category !== FOOD) return null;
  return (
    [meals.breakfast, meals.lunch, meals.dinner].find(
      (window) => start >= window.fromMin && start < window.toMin,
    ) ?? null
  );
}

/** Whether a stop may start at `start` under its rules (its own grid aside). */
export function slotAllowed(rules: SlotRules, start: number): boolean {
  const end = start + rules.duration;
  if (rules.meal !== null && (start < rules.meal.fromMin || start >= rules.meal.toMin)) {
    return false;
  }
  return rules.spans === null || openThrough(rules.spans, start, end) !== null;
}

/** The first allowed start at or after `earliest` that ends by `dayEnd`; null when none does. */
export function firstSlot(rules: SlotRules, earliest: number, dayEnd: number): number | null {
  let start = ceilGrid(earliest);
  if (rules.meal !== null && start < rules.meal.fromMin) start = ceilGrid(rules.meal.fromMin);
  for (; start + rules.duration <= dayEnd; start += GRID_MIN) {
    if (rules.meal !== null && start >= rules.meal.toMin) return null;
    if (slotAllowed(rules, start)) return start;
  }
  return null;
}
