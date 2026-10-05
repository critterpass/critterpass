/**
 * Meal times. A day has a lunch and a dinner (and a breakfast only when a must-do asks for one),
 * each inside its own stretch of the local day; a meal between them is no meal at all (a "lunch"
 * at a quarter to five). The planner aims a meal at the start of its stretch and lets the place's
 * own opening hours move it later, so a city that dines late is not fed early. Which meals a place
 * serves comes from its hours and from what our editors wrote about when to go.
 */
import { ceilGrid, spansOn } from './day-minutes';
import { nameTokens } from './place-names';
import type { DayWindow, DraftPoi } from './types';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

/** The stretches the planner aims meals at (`startMin`) and the validator's meal windows. */
export const BREAKFAST = { startMin: 6 * 60 + 30, endMin: 10 * 60 + 30 } as const;
export const LUNCH = { startMin: 11 * 60 + 30, endMin: 14 * 60 + 30 } as const;
export const DINNER = { startMin: 18 * 60, endMin: 21 * 60 + 30 } as const;

/** A lunch starts by half past one; a dinner by half past eight. */
export const LUNCH_LAST_START_MIN = 13 * 60 + 30;
export const DINNER_LAST_START_MIN = 20 * 60 + 30;

/** The meal a stop starting at local minute `startMin` is; null between meals. */
export function mealAt(startMin: number): MealSlot | null {
  if (startMin < BREAKFAST.endMin) return 'breakfast';
  if (startMin >= LUNCH.startMin - 30 && startMin <= LUNCH_LAST_START_MIN + 30) return 'lunch';
  if (startMin >= DINNER.startMin - 30 && startMin <= DINNER_LAST_START_MIN + 30) return 'dinner';
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
  afterDayOut = false,
): typeof LUNCH | typeof DINNER {
  const last = LUNCH_LAST_START_MIN + (afterDayOut ? LUNCH_AFTER_DAY_OUT_MIN : 0);
  return startMin <= last && !lunched ? LUNCH : DINNER;
}

const LUNCH_WORDS = ['lunch', 'lunchtime', 'midday', 'noon', 'morning', 'breakfast'];
const DINNER_WORDS = ['dinner', 'evening', 'night', 'sunset'];

/** The meals a place can serve on a date: open for a whole meal inside the lunch or dinner stretch. */
export function mealSlots(poi: DraftPoi, date: string): ('lunch' | 'dinner')[] {
  const spans = spansOn(poi.hours, date);
  const serves = (window: { startMin: number; endMin: number }) =>
    spans.some(
      (span) =>
        Math.max(span.start, window.startMin) + poi.durationMin <=
        Math.min(span.end, window.endMin + 60),
    );
  const open = [
    ...(serves(LUNCH) ? (['lunch'] as const) : []),
    ...(serves(DINNER) ? (['dinner'] as const) : []),
  ];
  // Our editors' word on when to go narrows it ("Lunch, as it often sells out"), never widens it.
  const words = nameTokens(poi.bestTime ?? '');
  const lunch = LUNCH_WORDS.some((word) => words.includes(word));
  const dinner = DINNER_WORDS.some((word) => words.includes(word));
  if (lunch === dinner) return open;
  const told = open.filter((slot) => slot === (lunch ? 'lunch' : 'dinner'));
  return told.length > 0 ? told : open;
}

/**
 * The meals a day window runs through: lunch when the day starts by one and runs past half past
 * twelve, dinner when it starts by seven and runs to eight.
 */
export function mealsInWindow(window: DayWindow): ('lunch' | 'dinner')[] {
  return [
    ...(window.startMin <= 13 * 60 && window.endMin >= 12 * 60 + 30 ? (['lunch'] as const) : []),
    ...(window.startMin <= 19 * 60 && window.endMin >= 20 * 60 ? (['dinner'] as const) : []),
  ];
}

/** The share of a day's food money a meal takes. */
export function mealShare(startMin: number): number {
  const slot = mealAt(ceilGrid(startMin));
  return slot === 'breakfast' ? 0.2 : slot === 'dinner' ? 0.45 : 0.35;
}

const SIT_DOWN: ReadonlySet<string> = new Set(['sit_down_dining', 'sit_down']);
/** A sit-down dinner is not eaten in half an hour, whatever the row says of a visit. */
const SIT_DOWN_DINNER_MIN = 60;
/** Nor any dinner, nor a lunch at a table, in less than three quarters. */
const MEAL_MIN = 45;

/** How long a meal at `poi` lasts when it starts at `startMin`, given its usual `duration`. */
export function mealDuration(poi: DraftPoi, startMin: number, duration: number): number {
  const table = poi.tags.some((tag) => SIT_DOWN.has(tag));
  const slot = mealAt(startMin);
  if (slot === 'dinner') return Math.max(duration, table ? SIT_DOWN_DINNER_MIN : MEAL_MIN);
  return slot === 'lunch' && table ? Math.max(duration, MEAL_MIN) : duration;
}

const SERVING = new WeakMap<readonly DraftPoi[], Map<string, readonly DraftPoi[]>>();

/** Of `places`, those that serve `slot` on `date` (kept per list: orders are tried by the thousand). */
export function servingOn(
  places: readonly DraftPoi[],
  date: string,
  slot: 'lunch' | 'dinner',
): readonly DraftPoi[] {
  const byKey = SERVING.get(places) ?? new Map<string, readonly DraftPoi[]>();
  SERVING.set(places, byKey);
  const key = `${date}:${slot}`;
  const known = byKey.get(key);
  if (known !== undefined) return known;
  const serving = places.filter((place) => mealSlots(place, date).includes(slot));
  byKey.set(key, serving);
  return serving;
}
