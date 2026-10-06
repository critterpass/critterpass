/**
 * The usable part of each day of a frame. One rule says which day the crew lands on and which day
 * it leaves on: by default the first and the last, but a frame for part of a trip may have no
 * landing day (the crew is already there) or no leaving day (it stays on, a city before the next
 * one). A day may also be reached late and left early (a day trip, the day the crew arrives at a
 * later stop): its window opens no earlier than the crew is there and closes when it must start
 * back. Everything that asks "is this the landing or the leaving day" asks it here.
 *
 * With no flight known the first day starts in the early afternoon and the last day ends in the
 * mid-afternoon (a morning's stops and lunch); a known arrival or departure replaces either.
 */
import { ceilGrid } from './day-minutes';
import { heldWindow, timedDuration, timeWindow, type WishTime } from './wish-time';
import type { Chronotype, DayWindow, DraftPoi, TripFrame } from './types';

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
/** A day trip leaves where the crew sleeps at seven and is back by nine at night. */
export const DAY_TRIP_LEAVES_MIN = 7 * 60;
export const DAY_TRIP_BACK_MIN = 21 * 60;

/** Whether day `dayIndex` (0-based) of the frame is the day the crew lands on. */
export function landsOn(frame: Pick<TripFrame, 'arrivalDay'>, dayIndex: number): boolean {
  const day = frame.arrivalDay === undefined ? 1 : frame.arrivalDay;
  return day !== null && dayIndex === day - 1;
}

/** Whether day `dayIndex` (0-based) of the frame is the day the crew leaves on. */
export function leavesOn(
  frame: Pick<TripFrame, 'dates' | 'leavingDay'>,
  dayIndex: number,
): boolean {
  const day = frame.leavingDay === undefined ? frame.dates.length : frame.leavingDay;
  return day !== null && dayIndex === day - 1;
}

/** The days (1-based) the crew lands or leaves on: they stay near where it sleeps. */
export function edgeDays(frame: Pick<TripFrame, 'dates' | 'arrivalDay' | 'leavingDay'>): number[] {
  return frame.dates.flatMap((_, index) =>
    landsOn(frame, index) || leavesOn(frame, index) ? [index + 1] : [],
  );
}

/** When a day trip of `minutes` each way reaches its area and must start back. */
export function dayTripReach(minutes: number): { fromMin: number; untilMin: number } {
  return { fromMin: DAY_TRIP_LEAVES_MIN + minutes, untilMin: DAY_TRIP_BACK_MIN - minutes };
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
 * The usable part of day `dayIndex` (0-based): the base day, cut by arrival and departure and by
 * when the crew reaches the place and must leave it, and opened later when the crew asked for a
 * later start (a stop held to its own time keeps it).
 */
export function dayWindow(frame: TripFrame, dayIndex: number): DayWindow {
  const base = baseWindow(frame);
  let { startMin, endMin } = base;
  let earliestMin = EARLIEST_TIMED_MIN;
  let latestMin = LATEST_TIMED_MIN;
  if (landsOn(frame, dayIndex)) {
    const landed = frame.arrivalMin ?? DEFAULT_ARRIVAL_MIN;
    startMin = Math.max(startMin, ceilGrid(landed + ARRIVAL_BUFFER_MIN));
    earliestMin = Math.max(earliestMin, ceilGrid(landed + ARRIVAL_BUFFER_MIN));
  }
  if (leavesOn(frame, dayIndex)) {
    const leaves = frame.departureMin ?? DEFAULT_DEPARTURE_MIN;
    endMin = Math.min(endMin, leaves - DEPARTURE_BUFFER_MIN);
    latestMin = Math.min(latestMin, leaves - DEPARTURE_BUFFER_MIN);
  }
  const reach = frame.reach?.[dayIndex + 1];
  if (reach?.fromMin !== undefined) {
    startMin = Math.max(startMin, ceilGrid(reach.fromMin));
    earliestMin = Math.max(earliestMin, ceilGrid(reach.fromMin));
  }
  if (reach?.untilMin !== undefined) {
    endMin = Math.min(endMin, reach.untilMin);
    latestMin = Math.min(latestMin, reach.untilMin);
  }
  const laterStart = frame.laterStartDays?.includes(dayIndex + 1) === true;
  if (laterStart) {
    const later = Math.max(startMin + LATER_START_BY_MIN, LATER_START_FLOOR_MIN);
    // A short last day keeps at least a lunch-length stretch.
    startMin = Math.max(startMin, Math.min(later, endMin - LATER_START_BY_MIN));
  }
  return {
    startMin,
    endMin: Math.max(startMin, endMin),
    earliestMin,
    latestMin,
    ...(laterStart ? { laterStart } : {}),
  };
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
  const last = leavesOn(frame, dayIndex) && frame.dates.length > 1;
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
