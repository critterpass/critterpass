/**
 * The checks that make a drafted day read like a day a person would have, run by the draft
 * validator on top of hours, travel and capacity: meals sit in meal stretches and every day that
 * runs through lunch or dinner has one (when a place could serve it), no place is visited twice
 * and no dish is eaten two days running, a place that is for the evening is not visited at noon,
 * and no stop is a hop too far from the ones around it. A must-do is never the stop at fault where
 * another stop can be: the crew asked for it.
 */
import type { DraftItem } from '@cp/domain';

import { foodRole, sameDish, sharesDish } from './food-role';
import { dinnerIsRideHome, longHops, longRideMin, RIDE_HOME_MAX_MIN, withinReach } from './hops';
import {
  DINNER,
  DINNER_LAST_START_MIN,
  LUNCH,
  LUNCH_LAST_START_MIN,
  mealAt,
  mealSlots,
  servingOn,
  mealsInWindow,
  type MealSlot,
} from './meal-slots';
import { placeWindow } from './place-time';
import { isKept, isTheirs, type DayWindow, type DraftPoi, type TravelMatrix } from './types';

export type DaySenseCode =
  | 'DUPLICATE_PLACE'
  | 'EXTRA_MEAL'
  | 'MEAL_OFF_HOURS'
  | 'MEAL_MISSING'
  | 'REPEAT_DISH'
  | 'LONG_HOP'
  | 'WRONG_TIME_OF_DAY';

export interface DaySenseViolation {
  readonly code: DaySenseCode;
  readonly dayNo: number;
  readonly stableId: string | null;
  readonly poiId?: string;
  readonly amount?: number;
  /** The meal a day is missing. */
  readonly slot?: 'lunch' | 'dinner';
}

/** One timed stop of a day, as the validator read it. */
export interface TimedStop {
  readonly item: DraftItem;
  readonly poi: DraftPoi;
  readonly startMin: number;
  readonly endMin: number;
  /** A must-do held to its own time of day (it follows that, not the place's or a meal's). */
  readonly held: boolean;
}

export interface TimedDay {
  readonly dayNo: number;
  readonly date: string;
  readonly window: DayWindow;
  readonly stops: readonly TimedStop[];
}

export interface DaySenseInput {
  readonly days: readonly TimedDay[];
  readonly travel: TravelMatrix;
  /** Meal places the crew can eat at; without them a missing meal is not reported. */
  readonly mealPlaces?: readonly DraftPoi[] | undefined;
  readonly hopCapMin?: number | undefined;
  /** The place the crew sleeps near (./home); with it the ride out to a day's first stop counts. */
  readonly homeId?: string | null | undefined;
}

const at = (
  code: DaySenseCode,
  day: TimedDay,
  stop: TimedStop,
  extra: Partial<DaySenseViolation> = {},
): DaySenseViolation => ({
  code,
  dayNo: day.dayNo,
  stableId: stop.item.stable_id,
  poiId: stop.poi.id,
  ...extra,
});

/** A must-do, a booking or a stop placed by hand: never the stop out of place (see `isKept`). */
const isMustDo = (stop: TimedStop) => isKept(stop.item);

function mealChecks(day: TimedDay): { out: DaySenseViolation[]; had: Set<MealSlot> } {
  const out: DaySenseViolation[] = [];
  const had = new Set<MealSlot>();
  // The crew's own meals count first: beside one, the guide's meal in the same stretch is the extra.
  const meals = day.stops.filter((stop) => stop.item.kind === 'meal');
  for (const stop of [...meals.filter(isMustDo), ...meals.filter((s) => !isMustDo(s))]) {
    const slot = mealAt(stop.startMin);
    if (slot === null) {
      if (!stop.held && !isTheirs(stop.item)) out.push(at('MEAL_OFF_HOURS', day, stop));
      continue;
    }
    // A second meal in a stretch is one too many, but never the crew's own.
    if (had.has(slot) && !isMustDo(stop)) out.push(at('EXTRA_MEAL', day, stop));
    had.add(slot);
  }
  return { out, had };
}

/** A stop that runs through the whole stretch a meal could start in (a full-day place, a show). */
function covered(day: TimedDay, slot: 'lunch' | 'dinner'): boolean {
  const from = slot === 'lunch' ? LUNCH.startMin : DINNER.startMin;
  const to = slot === 'lunch' ? LUNCH_LAST_START_MIN : DINNER_LAST_START_MIN;
  return day.stops.some((stop) => stop.startMin <= from && stop.endMin >= to + 30);
}

function missingMeals(
  input: DaySenseInput,
  day: TimedDay,
  had: ReadonlySet<MealSlot>,
  used: ReadonlySet<string>,
): DaySenseViolation[] {
  if (input.mealPlaces === undefined || day.stops.length === 0) return [];
  const all = day.stops.map((stop) => stop.poi.id);
  // A lunch is near where the day is spent, not near the dinner the crew rides home to.
  const daytime = day.stops.filter((stop) => stop.startMin < DINNER.startMin - 30);
  return mealsInWindow(day.window).flatMap((slot): DaySenseViolation[] => {
    if (had.has(slot) || covered(day, slot)) return [];
    const here = slot === 'lunch' ? daytime.map((stop) => stop.poi.id) : all;
    if (here.length === 0) return [];
    const possible = (input.mealPlaces ?? []).some(
      (place) =>
        !used.has(place.id) &&
        mealSlots(place, day.date).includes(slot) &&
        (input.hopCapMin === undefined ||
          withinReach(
            place.id,
            here,
            input.travel,
            slot === 'dinner' ? RIDE_HOME_MAX_MIN : longRideMin(input.hopCapMin),
          )),
    );
    return possible ? [{ code: 'MEAL_MISSING', dayNo: day.dayNo, stableId: null, slot }] : [];
  });
}

function placeTimeChecks(day: TimedDay): DaySenseViolation[] {
  return day.stops.flatMap((stop) => {
    if (stop.held || isMustDo(stop) || stop.item.kind === 'meal') return [];
    const own = placeWindow(stop.poi, day.date);
    return own !== null && (stop.startMin < own.fromMin || stop.startMin > own.toMin)
      ? [at('WRONG_TIME_OF_DAY', day, stop)]
      : [];
  });
}

function hopChecks(input: DaySenseInput, day: TimedDay): DaySenseViolation[] {
  if (input.hopCapMin === undefined) return [];
  const ids = day.stops.map((stop) => stop.poi.id);
  const dinnerAt = day.stops.findIndex(
    (stop) => stop.item.kind === 'meal' && mealAt(stop.startMin) === 'dinner',
  );
  // A dinner far from the day is the ride home only when no dinner place was near the day.
  const rideHome =
    dinnerAt > 0 &&
    input.mealPlaces !== undefined &&
    dinnerIsRideHome(
      ids.slice(0, dinnerAt),
      servingOn(input.mealPlaces, day.date, 'dinner'),
      input.travel,
      input.hopCapMin,
    );
  const hops = longHops(
    ids,
    input.travel,
    input.hopCapMin,
    rideHome ? dinnerAt : undefined,
    input.homeId,
    (index) => day.stops[index]?.item.kind !== 'meal',
  );
  return hops.flatMap((hop) => {
    const far = day.stops[hop.index];
    const before = day.stops[hop.index - 1];
    // The crew asked for a must-do: the stop beside it is the one out of place.
    const blamed = far !== undefined && !isMustDo(far) ? far : before;
    return blamed === undefined || isMustDo(blamed)
      ? []
      : [at('LONG_HOP', day, blamed, { amount: hop.over })];
  });
}

/** One visit per place across the trip, unless two must-dos ask for it. */
function duplicateChecks(days: readonly TimedDay[]): DaySenseViolation[] {
  const visits = new Map<string, { day: TimedDay; stop: TimedStop }[]>();
  for (const day of days) {
    for (const stop of day.stops) {
      visits.set(stop.poi.id, [...(visits.get(stop.poi.id) ?? []), { day, stop }]);
    }
  }
  const out: DaySenseViolation[] = [];
  for (const all of visits.values()) {
    if (all.length < 2) continue;
    // The visit a must-do asked for stays; without one, the first.
    const asked = new Set<string>();
    const kept = all.find(({ stop }) => isMustDo(stop)) ?? all[0];
    for (const visit of all) {
      const mustDoId = visit.stop.item.must_do_id;
      const again = mustDoId !== null && !asked.has(mustDoId);
      if (mustDoId !== null) asked.add(mustDoId);
      if (visit !== kept && !again) out.push(at('DUPLICATE_PLACE', visit.day, visit.stop));
    }
  }
  return out;
}

const eats = (stop: TimedStop) => stop.item.kind === 'meal' || foodRole(stop.poi) === 'meal';
/** Any food stop, a snack included. */
const fed = (stop: TimedStop) => eats(stop) || foodRole(stop.poi) === 'light';

/**
 * No dish on the same day twice or two days running; and the dish of a must-do is that one visit,
 * not a theme: no other stop of the trip serves it again.
 */
function dishChecks(days: readonly TimedDay[]): DaySenseViolation[] {
  const out = new Map<string, DaySenseViolation>();
  const ordered = [...days].sort((a, b) => a.dayNo - b.dayNo);
  const asked = ordered.flatMap((day) => day.stops.filter((stop) => isMustDo(stop) && fed(stop)));
  for (const day of ordered) {
    for (const stop of day.stops) {
      if (isMustDo(stop) || !fed(stop)) continue;
      const again = asked.some(
        (wish) => wish.poi.id !== stop.poi.id && sharesDish(wish.poi, stop.poi),
      );
      if (again) out.set(stop.item.stable_id, at('REPEAT_DISH', day, stop));
    }
  }
  ordered.forEach((day, index) => {
    const earlier = [
      ...(ordered[index - 1]?.dayNo === day.dayNo - 1 ? (ordered[index - 1]?.stops ?? []) : []),
    ].filter(eats);
    const today = day.stops.filter(eats);
    today.forEach((stop, position) => {
      const clash = [...earlier, ...today.slice(0, position)].find(
        (other) => other.poi.id !== stop.poi.id && sameDish(other.poi, stop.poi),
      );
      if (clash === undefined) return;
      if (!isMustDo(stop)) out.set(stop.item.stable_id, at('REPEAT_DISH', day, stop));
      else if (!isMustDo(clash)) {
        const clashDay = today.includes(clash) ? day : (ordered[index - 1] as TimedDay);
        out.set(clash.item.stable_id, at('REPEAT_DISH', clashDay, clash));
      }
    });
  });
  return [...out.values()];
}

export function daySenseViolations(input: DaySenseInput): DaySenseViolation[] {
  const used = new Set(input.days.flatMap((day) => day.stops.map((stop) => stop.poi.id)));
  const perDay = input.days.flatMap((day) => {
    const meals = mealChecks(day);
    return [
      ...meals.out,
      ...missingMeals(input, day, meals.had, used),
      ...placeTimeChecks(day),
      ...hopChecks(input, day),
    ];
  });
  return [...perDay, ...duplicateChecks(input.days), ...dishChecks(input.days)];
}
