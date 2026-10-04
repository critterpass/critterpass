/**
 * The finishing touches every stage shares, once the stops are settled. Notes that name a time
 * their stop is not at come off; the first and last stop say what was assumed about arriving and
 * leaving; the stop at the end of the day's one long ride says so; a day that runs through lunch
 * or dinner with no place we know to serve it says that too, instead of skipping the meal
 * silently; a long stretch nothing nearby could fill is said to be free; and a day title that no longer matches the day is written again from its stops.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import {
  DINNER,
  DINNER_LAST_START_MIN,
  LUNCH,
  LUNCH_LAST_START_MIN,
  dayWindow,
  mealAt,
  mealsInWindow,
  minuteOfDate,
  withAssumedTravelNotes,
  withHonestNotes,
  withNoteLine,
} from '@cp/planner';

import { hopCap } from './areas';
import type { DraftPlanInput } from './context';
import { withFittingTitles } from './day-titles';

export const LONG_RIDE_NOTE = "Getting here is the day's long ride.";
export const FREE_TIME_NOTE = 'Nothing we know nearby fits the hours after this: they are yours.';
/** A stretch this long with nothing planned is said to be free. */
const FREE_HOURS_MIN = 180;
export const NO_MEAL_NOTE = {
  lunch: 'No place we know nearby for lunch: eat where you like.',
  dinner: 'No place we know nearby for dinner: eat where you like.',
} as const;

function withRideAndMealNotes(input: DraftPlanInput, day: DraftDay, dayIndex: number): DraftDay {
  if (day.items.length === 0) return day;
  const { tz } = input.frame;
  const cap = hopCap(input);
  const at = (iso: string) => minuteOfDate(new Date(iso), day.date, tz);
  const lines = new Map<number, string[]>();
  const say = (index: number, line: string) =>
    lines.set(index, [...(lines.get(index) ?? []), line]);
  day.items.forEach((item, index) => {
    if (index > 0 && item.travel_min > cap) say(index, LONG_RIDE_NOTE);
  });
  const had = new Set(
    day.items.flatMap((item) => (item.kind === 'meal' ? [mealAt(at(item.starts_at))] : [])),
  );
  const spans = {
    lunch: [LUNCH.startMin, LUNCH_LAST_START_MIN],
    dinner: [DINNER.startMin, DINNER_LAST_START_MIN],
  } as const;
  for (const slot of mealsInWindow(dayWindow(input.frame, dayIndex))) {
    const [from, to] = spans[slot];
    const through = day.items.some(
      (item) => at(item.starts_at) <= from && at(item.ends_at) >= to + 30,
    );
    if (had.has(slot) || through) continue;
    // On the last stop before the meal would have been.
    const before = day.items.map((item) => at(item.starts_at)).filter((start) => start <= to);
    say(Math.max(0, before.length - 1), NO_MEAL_NOTE[slot]);
  }
  // Hours before dinner that nothing we know nearby could fill are said to be free.
  const full = dayIndex > 0 && dayIndex < input.frame.dates.length - 1;
  day.items.forEach((item, index) => {
    const next = day.items[index + 1];
    if (!full || next === undefined || at(next.starts_at) > DINNER_LAST_START_MIN) return;
    const free = at(next.starts_at) - at(item.ends_at) - next.travel_min;
    if (free >= FREE_HOURS_MIN) say(index, FREE_TIME_NOTE);
  });
  if (lines.size === 0) return day;
  return {
    ...day,
    items: day.items.map((item, index) =>
      (lines.get(index) ?? []).reduce(
        (kept, line) => ({ ...kept, note: withNoteLine(kept.note, line) }),
        item,
      ),
    ),
  };
}

export function withFinalNotes(
  input: DraftPlanInput,
  itinerary: Itinerary,
): { readonly itinerary: Itinerary; readonly removed: number; readonly retitled: number } {
  const honest = withHonestNotes(itinerary, input.pois, input.frame.tz);
  const dateIndex = new Map(input.frame.dates.map((date, index) => [date, index]));
  const noted = {
    ...honest.itinerary,
    days: honest.itinerary.days.map((day) =>
      withRideAndMealNotes(input, day, dateIndex.get(day.date) ?? day.day_no - 1),
    ),
  };
  const titled = withFittingTitles(input, withAssumedTravelNotes(noted, input.frame));
  return { itinerary: titled.itinerary, removed: honest.removed, retitled: titled.retitled };
}
