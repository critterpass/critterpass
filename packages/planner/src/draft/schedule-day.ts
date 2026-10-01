/**
 * Turns the guide's ordered picks for one day into timed, priced items: each stop starts after the
 * travel from the one before (the injected matrix), waits for its place to open and for a meal
 * window, lasts the place's visit time, and sits on the 15-minute grid in the destination's local
 * time. Prices come from the destination's cost bands scaled by the place's price level. The
 * scheduler never rejects anything: whatever still does not fit is the validator's to report.
 */
import { localSchedule, nextOpen, openAt, type DraftDay, type DraftItem } from '@cp/domain';

import { localMinute } from '../feasibility/grid';
import { timedDuration, timeWindow, type WishTime } from './wish-time';
import type {
  Chronotype,
  CostBands,
  DayChoice,
  DayWindow,
  DraftPoi,
  TravelMatrix,
  TripFrame,
} from './types';

export const GRID_MIN = 15;
export const LUNCH = { startMin: 11 * 60 + 30, endMin: 14 * 60 + 30 } as const;
export const DINNER = { startMin: 18 * 60, endMin: 21 * 60 + 30 } as const;
/** First-day plans start this long after landing; last-day plans end this long before take-off. */
export const ARRIVAL_BUFFER_MIN = 90;
export const DEPARTURE_BUFFER_MIN = 180;
/** Assumed when no flight is known (the same fixed skeleton as the pre-draft must-do fit). */
export const DEFAULT_ARRIVAL_MIN = 12 * 60 + 30;
export const DEFAULT_DEPARTURE_MIN = 15 * 60;

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

/** A meal starting before this local minute is the day's lunch (a late one after 14:30). */
export const LUNCH_BEFORE_MIN = 17 * 60;

/** Lunch when the day has had none and it is not yet evening, else dinner (waiting for it). */
export function mealSlotAt(startMin: number, lunched: boolean): typeof LUNCH | typeof DINNER {
  return startMin < LUNCH_BEFORE_MIN && !lunched ? LUNCH : DINNER;
}

export function defaultDurationMin(category: string): number {
  return DEFAULT_DURATION[category] ?? 90;
}

export const ceilGrid = (minute: number): number => Math.ceil(minute / GRID_MIN) * GRID_MIN;

function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** The instant of local minute `minute` (may pass midnight) on `date` in `tz`. */
export function instantAt(date: string, minute: number, tz: string): Date {
  const day = Math.floor(minute / 1440);
  const rest = minute - day * 1440;
  const time = `${String(Math.floor(rest / 60)).padStart(2, '0')}:${String(rest % 60).padStart(2, '0')}`;
  return localSchedule({ date: addDays(date, day), time, tz });
}

/** Local minute of `at` counted from the start of `date` (so 00:30 the next day is 1470). */
export function minuteOfDate(at: Date, date: string, tz: string): number {
  const midnight = instantAt(date, 0, tz).getTime();
  const days = Math.floor((at.getTime() - midnight) / 86_400_000);
  return days * 1440 + localMinute(at, tz);
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

/** The usable part of day `dayIndex` (0-based): the base day, cut by arrival and departure. */
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
  return { startMin, endMin: Math.max(startMin, endMin), earliestMin, latestMin };
}

/**
 * Whether a stop held to `when` can happen on day `dayIndex` at all: a sunrise needs the crew
 * landed by then, a night show needs them not yet at the airport, a full day needs the morning.
 */
export function timeFitsDay(
  frame: TripFrame,
  dayIndex: number,
  when: WishTime | null | undefined,
  poi: DraftPoi,
): boolean {
  const timed = timeWindow(when);
  if (timed === null) return true;
  const window = dayWindow(frame, dayIndex);
  const start = Math.max(timed.fromMin, window.earliestMin ?? window.startMin);
  return (
    start <= timed.toMin && start + timedDuration(poi, when) <= (window.latestMin ?? window.endMin)
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
  if (kind === 'activity') return Math.round((bands.funPpDayMinor / 2) * factor);
  const share = startMin < LUNCH_BEFORE_MIN ? 0.35 : 0.45;
  return Math.round(bands.foodPpDayMinor * share * factor);
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
    if (choice.kind === 'meal') {
      const meal = mealSlotAt(start, lunched);
      if (meal === LUNCH) lunched = true;
      start = Math.max(start, meal.startMin);
    }
    // A stop held to its time of day waits for it, and may open the day earlier than usual.
    const timed = timeWindow(choice.when);
    if (timed !== null && (previous === null || start < timed.fromMin)) {
      start = Math.max(timed.fromMin, input.window.earliestMin ?? input.window.startMin);
    }
    if (poi !== undefined) start = openFrom(poi, input.date, start);
    const duration = ceilGrid(
      poi === undefined
        ? defaultDurationMin(choice.kind === 'meal' ? 'food' : 'other')
        : timedDuration(poi, choice.when),
    );
    const end = start + duration;
    const tz = poi?.tz ?? input.tz;
    items.push({
      stable_id: input.idFor(choice, index),
      kind: choice.kind,
      poi_id: choice.poiId,
      starts_at: instantAt(input.date, start, tz).toISOString(),
      ends_at: instantAt(input.date, end, tz).toISOString(),
      tz,
      must_do_id: choice.mustDoId,
      booking_id: null,
      locked_reason: choice.mustDoId === null ? null : 'must_do',
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
