/**
 * Meal times. A day has a lunch and a dinner (and a breakfast only when a must-do asks for one),
 * each inside its own stretch of the local day; a meal between them is no meal at all (a "lunch"
 * at a quarter to five). The stretches are the destination's own (./meal-hours: Madrid dines at
 * nine, Hà Nội at six). The planner aims a meal at the start of its stretch and lets the place's
 * own opening hours move it later. Which meals a place serves comes from its hours and from what
 * our editors wrote about when to go.
 */
import { ceilGrid, spansOn } from './day-minutes';
import {
  DINNER_ROOM_MIN,
  mealHoursIn,
  mealsOf,
  type MealHours,
  type MealStretch,
} from './meal-hours';
import { nameTokens } from './place-names';
import { isTyped, typedMealTime } from './typed-facts';
import type { DayWindow, DraftPoi } from './types';

export {
  beforeLeaving,
  mealHoursIn,
  mealsOf,
  USUAL_MEALS,
  type MealHours,
  type MealStretch,
} from './meal-hours';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

/** The stretch a breakfast a must-do asks for is eaten in, the same everywhere. */
export const BREAKFAST = { startMin: 6 * 60 + 30, endMin: 10 * 60 + 30 } as const;

/** The meal a stop starting at local minute `startMin` is, given the local `hours`; null between meals. */
export function mealAt(startMin: number, hours: MealHours): MealSlot | null {
  const { lunch, dinner } = hours;
  if (startMin < BREAKFAST.endMin) return 'breakfast';
  if (startMin >= lunch.startMin - 30 && startMin <= lunch.lastStartMin + 30) return 'lunch';
  if (startMin >= dinner.startMin - 30 && startMin <= dinner.lastStartMin + 30) return 'dinner';
  return null;
}

/** Back from a day out (a mountain an hour from town), lunch may start this much later. */
export const LUNCH_AFTER_DAY_OUT_MIN = 30;

/**
 * The stretch an untimed meal reached at `startMin` waits for: lunch while there is still time
 * for one (a little longer straight `afterDayOut`) and the day has had none, else dinner.
 */
export function mealSlotAt(
  startMin: number,
  lunched: boolean,
  hours: MealHours,
  afterDayOut = false,
): MealStretch {
  const last = hours.lunch.lastStartMin + (afterDayOut ? LUNCH_AFTER_DAY_OUT_MIN : 0);
  return startMin <= last && !lunched ? hours.lunch : hours.dinner;
}

const LUNCH_WORDS = ['lunch', 'lunchtime', 'midday', 'noon', 'morning', 'breakfast'];
const DINNER_WORDS = ['dinner', 'evening', 'night', 'sunset'];

/** The meal a line names (lunch or dinner); null when it names both or neither. */
function mealWords(text: string): 'lunch' | 'dinner' | null {
  const words = nameTokens(text);
  const lunch = LUNCH_WORDS.some((word) => words.includes(word));
  const dinner = DINNER_WORDS.some((word) => words.includes(word));
  return lunch === dinner ? null : lunch ? 'lunch' : 'dinner';
}

/**
 * The meals a place can serve on a date: open for a whole meal inside the lunch or dinner stretch
 * of `hours` (the place's own local hours unless a day's are given).
 */
export function mealSlots(
  poi: DraftPoi,
  date: string,
  hours: MealHours = mealHoursIn(poi.tz),
): ('lunch' | 'dinner')[] {
  const spans = spansOn(poi.hours, date);
  const serves = (window: { startMin: number; endMin: number }) =>
    spans.some(
      (span) =>
        Math.max(span.start, window.startMin) + poi.durationMin <=
        Math.min(span.end, window.endMin + 60),
    );
  const open = [
    ...(serves(hours.lunch) ? (['lunch'] as const) : []),
    ...(serves(hours.dinner) ? (['dinner'] as const) : []),
  ];
  // When to go narrows it ("Lunch, as it often sells out"), never widens it: the place's typed
  // times of day, else our editors' words.
  const said = isTyped(poi) ? typedMealTime(poi) : mealWords(poi.bestTime ?? '');
  if (said === null) return open;
  const told = open.filter((slot) => slot === said);
  return told.length > 0 ? told : open;
}

/**
 * The meals a day window runs through: lunch when the day starts half an hour before lunch's last
 * start and runs an hour into lunch (by one and past half past twelve where lunch is at noon),
 * dinner when it starts within an hour of dinner and runs long enough to sit down to it.
 */
export function mealsInWindow(window: DayWindow): ('lunch' | 'dinner')[] {
  const { lunch, dinner } = mealsOf(window);
  return [
    ...(window.startMin <= lunch.lastStartMin - 30 && window.endMin >= lunch.startMin + 60
      ? (['lunch'] as const)
      : []),
    ...(window.startMin <= dinner.startMin + 60 &&
    window.endMin >= dinner.startMin + DINNER_ROOM_MIN
      ? (['dinner'] as const)
      : []),
  ];
}

/** The share of a day's food money a meal takes. */
export function mealShare(startMin: number, hours: MealHours): number {
  const slot = mealAt(ceilGrid(startMin), hours);
  return slot === 'breakfast' ? 0.2 : slot === 'dinner' ? 0.45 : 0.35;
}

const SIT_DOWN: ReadonlySet<string> = new Set(['sit_down_dining', 'sit_down']);
/** A sit-down dinner is not eaten in half an hour, whatever the row says of a visit. */
const SIT_DOWN_DINNER_MIN = 60;
/** Nor any dinner, nor a lunch at a table, in less than three quarters. */
const MEAL_MIN = 45;

/** How long a meal at `poi` lasts when it starts at `startMin`, given its usual `duration`. */
export function mealDuration(
  poi: DraftPoi,
  startMin: number,
  duration: number,
  hours: MealHours = mealHoursIn(poi.tz),
): number {
  const table = poi.tags.some((tag) => SIT_DOWN.has(tag));
  const slot = mealAt(startMin, hours);
  if (slot === 'dinner') return Math.max(duration, table ? SIT_DOWN_DINNER_MIN : MEAL_MIN);
  return slot === 'lunch' && table ? Math.max(duration, MEAL_MIN) : duration;
}

const SERVING = new WeakMap<readonly DraftPoi[], Map<string, readonly DraftPoi[]>>();

/**
 * Of `places`, those that serve `slot` on `date` in `hours` (a day's, else each place's own); kept
 * per list, as orders are tried by the thousand.
 */
export function servingOn(
  places: readonly DraftPoi[],
  date: string,
  slot: 'lunch' | 'dinner',
  hours?: MealHours,
): readonly DraftPoi[] {
  const byKey = SERVING.get(places) ?? new Map<string, readonly DraftPoi[]>();
  SERVING.set(places, byKey);
  const stretch = hours?.[slot];
  const key = `${date}:${slot}:${stretch?.startMin ?? ''}:${stretch?.endMin ?? ''}`;
  const known = byKey.get(key);
  if (known !== undefined) return known;
  const serving = places.filter((place) => mealSlots(place, date, hours).includes(slot));
  byKey.set(key, serving);
  return serving;
}
