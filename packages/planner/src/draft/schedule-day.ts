/**
 * Turns the guide's ordered picks for one day into timed, priced items: each stop starts after the
 * travel from the one before (the injected matrix), waits for its place to open, for its meal
 * stretch (./meal-slots) and for the time of day the place is for (./place-time), lasts the
 * place's visit time, and sits on the 15-minute grid in the destination's local time. Prices come
 * from the destination's cost bands scaled by the place's price level. The scheduler never rejects
 * anything: whatever still does not fit is the validator's to report.
 *
 * With no flight known the first day starts in the early afternoon and the last day ends in the
 * mid-afternoon (a morning's stops and lunch); a known arrival or departure replaces either.
 */
import { localSchedule, nextOpen, openAt, type DraftDay, type DraftItem } from '@cp/domain';

import { localMinute } from '../feasibility/grid';
import { ceilGrid } from './day-minutes';
import { foodRole } from './food-role';
import { DINNER, mealAt, mealShare, mealSlotAt } from './meal-slots';
import { placeWindow } from './place-time';
import { heldWindow, timedDuration, timeWindow, type WishTime } from './wish-time';
import type {
  Chronotype,
  CostBands,
  DayChoice,
  DayWindow,
  DraftPoi,
  TravelMatrix,
  TripFrame,
} from './types';

export { ceilGrid, GRID_MIN } from './day-minutes';
/** First-day plans start this long after landing; last-day plans end this long before take-off. */
export const ARRIVAL_BUFFER_MIN = 90;
export const DEPARTURE_BUFFER_MIN = 180;
/**
 * Assumed when no flight is known (the same fixed skeleton as the pre-draft must-do fit): the crew
 * lands at half past twelve and leaves in the early evening, so the first day starts at two and
 * the last one ends at three.
 */
export const DEFAULT_ARRIVAL_MIN = 12 * 60 + 30;
export const DEFAULT_DEPARTURE_MIN = 18 * 60;

const DEFAULT_DURATION: Readonly<Record<string, number>> = {
  food: 75,
  temple_shrine: 90,
  museum: 120,
  market: 90,
  nature: 150,
  beach: 180,
  nightlife: 120,
  shopping: 90,
};

export function defaultDurationMin(category: string): number {
  return DEFAULT_DURATION[category] ?? 90;
}

function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/**
 * Zone arithmetic is the slow part of timing a day, and a draft is timed and checked thousands of
 * times over the same few dates and quarter hours: both conversions keep what they worked out.
 */
const INSTANTS = new Map<string, number>();
const MINUTES = new Map<string, number>();
const KEPT_MAX = 50_000;

function kept(cache: Map<string, number>, key: string, work: () => number): number {
  const known = cache.get(key);
  if (known !== undefined) return known;
  if (cache.size >= KEPT_MAX) cache.clear();
  const value = work();
  cache.set(key, value);
  return value;
}

/** The instant of local minute `minute` (may pass midnight) on `date` in `tz`. */
export function instantAt(date: string, minute: number, tz: string): Date {
  return new Date(
    kept(INSTANTS, `${date}|${minute}|${tz}`, () => {
      const day = Math.floor(minute / 1440);
      const rest = minute - day * 1440;
      const time = `${String(Math.floor(rest / 60)).padStart(2, '0')}:${String(rest % 60).padStart(2, '0')}`;
      return localSchedule({ date: addDays(date, day), time, tz }).getTime();
    }),
  );
}

/** Local minute of `at` counted from the start of `date` (so 00:30 the next day is 1470). */
export function minuteOfDate(at: Date, date: string, tz: string): number {
  return kept(MINUTES, `${at.getTime()}|${date}|${tz}`, () => {
    const midnight = instantAt(date, 0, tz).getTime();
    const days = Math.floor((at.getTime() - midnight) / 86_400_000);
    return days * 1440 + localMinute(at, tz);
  });
}

function majority(frame: TripFrame, kind: Chronotype): boolean {
  const count = frame.members.filter((uid) => frame.chronotypes[uid] === kind).length;
  return frame.members.length > 0 && count * 2 > frame.members.length;
}

/** The chronotype-shaped day, before any flight. */
export function baseWindow(frame: TripFrame): DayWindow {
  const startMin = majority(frame, 'early_bird')
    ? 8 * 60
    : majority(frame, 'night_owl')
      ? 10 * 60
      : 9 * 60;
  return { startMin, endMin: 22 * 60 };
}

/** A timed stop may start this early (a sunrise) and end this late (a night show). */
const EARLIEST_TIMED_MIN = 4 * 60 + 30;
const LATEST_TIMED_MIN = 24 * 60;

/** A day the crew asked to start later opens this much later, and never before half past ten. */
const LATER_START_BY_MIN = 90;
const LATER_START_FLOOR_MIN = 10 * 60 + 30;

/**
 * The usable part of day `dayIndex` (0-based): the base day, cut by arrival and departure, and
 * opened later when the crew asked for a later start (a stop held to its own time keeps it).
 */
export function dayWindow(frame: TripFrame, dayIndex: number): DayWindow {
  const base = baseWindow(frame);
  let { startMin, endMin } = base;
  let earliestMin = EARLIEST_TIMED_MIN;
  let latestMin = LATEST_TIMED_MIN;
  if (dayIndex === 0) {
    const landed = frame.arrivalMin ?? DEFAULT_ARRIVAL_MIN;
    startMin = Math.max(startMin, ceilGrid(landed + ARRIVAL_BUFFER_MIN));
    earliestMin = Math.max(earliestMin, ceilGrid(landed + ARRIVAL_BUFFER_MIN));
  }
  if (dayIndex === frame.dates.length - 1) {
    const leaves = frame.departureMin ?? DEFAULT_DEPARTURE_MIN;
    endMin = Math.min(endMin, leaves - DEPARTURE_BUFFER_MIN);
    latestMin = Math.min(latestMin, leaves - DEPARTURE_BUFFER_MIN);
  }
  if (frame.laterStartDays?.includes(dayIndex + 1) === true) {
    const later = Math.max(startMin + LATER_START_BY_MIN, LATER_START_FLOOR_MIN);
    // A short last day keeps at least a lunch-length stretch.
    startMin = Math.max(startMin, Math.min(later, endMin - LATER_START_BY_MIN));
  }
  return { startMin, endMin: Math.max(startMin, endMin), earliestMin, latestMin };
}

/**
 * Whether a stop held to `when` can happen on day `dayIndex` at all: a sunrise needs the crew
 * landed by then, a night show needs them not yet at the airport, a full day needs the morning,
 * and the place's own hours must leave a start for it that day (see `heldWindow`).
 */
export function timeFitsDay(
  frame: TripFrame,
  dayIndex: number,
  when: WishTime | null | undefined,
  poi: DraftPoi,
): boolean {
  if (timeWindow(when) === null) return true;
  // A day trip is never planned on the strength of a guessed departure.
  const last = dayIndex === frame.dates.length - 1 && frame.dates.length > 1;
  if (when === 'full_day' && last && frame.departureMin === null) return false;
  const held = heldWindow(poi, frame.dates[dayIndex] ?? '', when);
  if (held === null) return false;
  const window = dayWindow(frame, dayIndex);
  const start = Math.max(held.fromMin, window.earliestMin ?? window.startMin);
  return (
    start <= held.toMin &&
    start + ceilGrid(timedDuration(poi, when)) <= (window.latestMin ?? window.endMin)
  );
}

const LEVEL_FACTOR = [0, 0.6, 1, 1.6, 2.4] as const;

/** A stop's per-person price from the cost bands: activities share the daily fun, meals the food. */
export function stopPriceMinor(
  poi: DraftPoi,
  kind: 'activity' | 'meal',
  startMin: number,
  bands: CostBands | null,
): number {
  if (bands === null) return 0;
  const factor = poi.priceLevel === null ? 1 : (LEVEL_FACTOR[poi.priceLevel] ?? 1);
  // A coffee or a snack comes out of the food money, a small part of it.
  if (foodRole(poi) === 'light') return Math.round(bands.foodPpDayMinor * 0.15 * factor);
  if (kind === 'activity') return Math.round((bands.funPpDayMinor / 2) * factor);
  return Math.round(bands.foodPpDayMinor * mealShare(startMin) * factor);
}

function openFrom(poi: DraftPoi, date: string, minute: number): number {
  if (poi.hours === null) return minute;
  const at = instantAt(date, minute, poi.tz);
  if (openAt(poi.hours, poi.tz, at)) return minute;
  const next = nextOpen(poi.hours, poi.tz, at);
  if (next === null) return minute;
  const opens = minuteOfDate(next, date, poi.tz);
  return opens < 1440 ? ceilGrid(opens) : minute;
}

/** The local minutes a stop with its own times runs between on `date`; null for any other stop. */
export function fixedMinutes(
  choice: Pick<DayChoice, 'fixed'>,
  date: string,
  tz: string,
): { readonly startMin: number; readonly endMin: number } | null {
  if (choice.fixed === undefined || choice.fixed === null) return null;
  const startMin = minuteOfDate(new Date(choice.fixed.startsAt), date, tz);
  const endMin = minuteOfDate(new Date(choice.fixed.endsAt), date, tz);
  return { startMin, endMin: Math.max(startMin, endMin) };
}

export interface ScheduleDayInput {
  readonly dayNo: number;
  readonly date: string;
  readonly theme: string;
  readonly choices: readonly DayChoice[];
  readonly pois: ReadonlyMap<string, DraftPoi>;
  readonly window: DayWindow;
  readonly travel: TravelMatrix;
  readonly bands: CostBands | null;
  readonly currency: string;
  readonly tz: string;
  /** The stable id for the `index`th pick (derived by the caller so a rerun gives the same ids). */
  readonly idFor: (choice: DayChoice, index: number) => string;
}

export function scheduleDay(input: ScheduleDayInput): DraftDay {
  const items: DraftItem[] = [];
  let at = input.window.startMin;
  let previous: string | null = null;
  let lunched = false;
  input.choices.forEach((choice, index) => {
    const poi = input.pois.get(choice.poiId);
    const travelMin = previous === null ? 0 : (input.travel(previous, choice.poiId) ?? 0);
    let start = ceilGrid(at + travelMin);
    // A stop held to its time of day waits for it, and may open the day earlier than usual.
    // Nothing else starts before the usual day, even after an early held stop.
    const held = poi === undefined ? null : heldWindow(poi, input.date, choice.when);
    // An untimed meal waits for its stretch: lunch while there is time for one, else dinner.
    if (choice.kind === 'meal' && held === null) {
      start = Math.max(start, mealSlotAt(start, lunched).startMin);
    }
    if (held === null) start = Math.max(start, input.window.startMin);
    else if (previous === null || start < held.fromMin) {
      start = Math.max(held.fromMin, input.window.earliestMin ?? input.window.startMin);
    }
    // A place that is for the evening (or the sunset, or after dark) waits for it.
    const own = held !== null || poi === undefined ? null : placeWindow(poi, input.date);
    if (own !== null && choice.kind !== 'meal') start = Math.max(start, own.fromMin);
    // Hours that are only a guess never move a held stop.
    if (poi !== undefined && !(held !== null && poi.hoursGuessed === true)) {
      start = openFrom(poi, input.date, start);
    }
    // A meal its place's opening pushed past lunch waits for dinner: nobody eats at four.
    if (choice.kind === 'meal' && held === null && mealAt(start) === null) {
      if (start < DINNER.startMin) {
        start = poi === undefined ? DINNER.startMin : openFrom(poi, input.date, DINNER.startMin);
      }
    }
    if (choice.kind === 'meal' && mealAt(start) === 'lunch') lunched = true;
    const duration = ceilGrid(
      poi === undefined
        ? defaultDurationMin(choice.kind === 'meal' ? 'food' : 'other')
        : timedDuration(poi, choice.when),
    );
    // A booking or a stop placed by hand keeps its own times, whatever comes before it.
    const fixed = fixedMinutes(choice, input.date, poi?.tz ?? input.tz);
    if (fixed !== null) start = fixed.startMin;
    const end = fixed === null ? start + duration : fixed.endMin;
    const tz = poi?.tz ?? input.tz;
    items.push({
      stable_id: choice.stableId ?? input.idFor(choice, index),
      kind: choice.kind,
      poi_id: choice.poiId,
      starts_at: instantAt(input.date, start, tz).toISOString(),
      ends_at: instantAt(input.date, end, tz).toISOString(),
      tz,
      must_do_id: choice.mustDoId,
      booking_id: null,
      locked_reason: choice.mustDoId === null ? (choice.lockedReason ?? null) : 'must_do',
      cost_model: 'per_person',
      amount_minor: poi === undefined ? 0 : stopPriceMinor(poi, choice.kind, start, input.bands),
      currency: input.currency,
      travel_min: Math.max(0, Math.round(travelMin)),
      note: choice.note,
    });
    at = end;
    previous = choice.poiId;
  });
  return { day_no: input.dayNo, date: input.date, theme: input.theme, items };
}
