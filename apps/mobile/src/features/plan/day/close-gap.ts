/**
 * Taking a stop off a day (removed, or moved to another day) when the stops after it sit later
 * than the time of day they are for: a lunch at five, a temple after dark, as a day reads after an
 * earlier add pushed it. Those stops move back earlier by what the stop freed, each only as far as
 * the stop before it and the way between allow, and never to a worse time of day for its kind. A
 * stop that is where it belongs stays (a dinner is not pulled into the afternoon), so a day that
 * was never pushed is left exactly as it is; booked, must-do and pinned stops never move.
 */
import type { PlanOp } from '@cp/domain';
import { kindWindows, minutesOutside, type FitPlace } from '@cp/planner';

import type { DayItem } from '@/data/plan/plan-model';
import { moveOp, type DaySlot } from '@/data/plan/plan-ops';

import { isPinned, type Travel } from '../day-plan/reschedule';

const GRID = 5;
const ceilGrid = (minutes: number) => Math.ceil(minutes / GRID) * GRID;

/** Minutes a stop starting at `start` is outside the time of day it is for; 0 when it belongs. */
export type OutOfPlace = (stop: DayItem, start: number) => number;

/** How far out of place a stop is, by the rule places are suggested with. */
export function outOfPlaceOn(date: string, tz: string): OutOfPlace {
  return (stop, start) => {
    if (stop.place === null) return 0;
    const place: FitPlace = {
      poiId: stop.poiId,
      point: stop.place,
      category: stop.category ?? 'other',
      hours: null,
      outdoor: false,
      name: stop.title,
    };
    const length = (stop.end ?? start) - (stop.start ?? start);
    const windows = kindWindows(place, date, tz, Math.max(15, length));
    return minutesOutside(windows.own.length > 0 ? windows.own : [windows.usual], start);
  };
}

export interface GapClose {
  /** The moves of the stops that go back earlier. */
  readonly ops: readonly PlanOp[];
  readonly moved: number;
  /** Minutes every moved stop goes back by, when they all move by the same. */
  readonly movedBy: number | null;
}

const NOTHING: GapClose = { ops: [], moved: 0, movedBy: null };

export function closeGap(
  stops: readonly DayItem[],
  goneId: string,
  slot: DaySlot,
  travel: Travel,
  outOfPlace: OutOfPlace,
): GapClose {
  const timed = stops
    .filter((stop) => stop.start !== null && stop.end !== null)
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  const gone = timed.find((stop) => stop.stableId === goneId);
  if (gone === undefined) return NOTHING;
  const freed = ceilGrid((gone.end ?? 0) - (gone.start ?? 0));
  const before = timed.filter((stop) => (stop.start ?? 0) < (gone.start ?? 0));
  const after = timed.filter(
    (stop) => stop.stableId !== goneId && (stop.start ?? 0) >= (gone.start ?? 0),
  );
  /** The earliest start from `from` on that is no worse for the stop than where it is. */
  const settle = (stop: DayItem, from: number): number => {
    const start = stop.start ?? 0;
    const now = outOfPlace(stop, start);
    // A stop that is where it belongs stays there.
    if (now === 0) return start;
    for (let at = from; at < start; at += GRID) if (outOfPlace(stop, at) <= now) return at;
    return start;
  };
  const starts = new Map<string, number>();
  let better = false;
  let previous: DayItem | null = before.at(-1) ?? null;
  let previousEnd = previous?.end ?? 0;
  for (const stop of after) {
    const start = stop.start ?? 0;
    let next = start;
    if (!isPinned(stop)) {
      const earliest = previous === null ? 0 : ceilGrid(previousEnd + travel(previous, stop));
      next = Math.min(start, settle(stop, Math.max(earliest, start - freed)));
      if (outOfPlace(stop, next) < outOfPlace(stop, start)) better = true;
      if (next < start) starts.set(stop.stableId, next);
    }
    previous = stop;
    previousEnd = next + ((stop.end ?? start) - start);
  }
  // Nobody ends up at a better time of day: the day was not shifted, so it stays as it is.
  if (!better) return NOTHING;
  const ops: PlanOp[] = [];
  const shifts: number[] = [];
  for (const stop of after) {
    const start = starts.get(stop.stableId);
    if (start === undefined) continue;
    const op = moveOp(stop, slot, start);
    if (op === null) continue;
    ops.push(op);
    shifts.push((stop.start ?? 0) - start);
  }
  const same = shifts.every((shift) => shift === shifts[0]);
  return { ops, moved: ops.length, movedBy: same ? (shifts[0] ?? null) : null };
}
