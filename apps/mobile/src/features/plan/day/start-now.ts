/**
 * Starting a stop early because she is already there: the stop starts now (on the five-minute
 * grid, same length) and the stops after it come forward by as much, up to the first that keeps
 * its time (booked, a must-do, pinned); that one and everything after it stay. Offered only when
 * she arrives well before the start. Pure.
 */
import type { PlanOp } from '@cp/domain';

import type { DayItem } from '@/data/plan/plan-model';
import { moveOp, type DaySlot } from '@/data/plan/plan-ops';

/** Arriving at least this early makes "start from now" worth offering. */
export const START_NOW_MIN_EARLY = 15;
const GRID = 5;

export interface StartNow {
  /** Where the stop would start (minutes after midnight). */
  readonly start: number;
  /** Minutes everything moved forward. */
  readonly by: number;
  /** Later stops that come forward with it. */
  readonly moved: number;
  readonly ops: readonly PlanOp[];
}

export function startFromNow(input: {
  readonly stops: readonly DayItem[];
  readonly stop: DayItem;
  /** Minutes after the day's midnight, now. */
  readonly nowMinutes: number;
  readonly slot: DaySlot;
}): StartNow | null {
  const { stop, slot } = input;
  if (stop.start === null || stop.end === null || stop.lock !== null) return null;
  const start = Math.ceil(input.nowMinutes / GRID) * GRID;
  const by = stop.start - start;
  if (by < START_NOW_MIN_EARLY) return null;
  const later = input.stops
    .filter((other) => other.stableId !== stop.stableId && other.start !== null)
    .filter((other) => (other.start ?? 0) >= (stop.end ?? 0))
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  const pinnedAt = later.findIndex((other) => other.lock !== null);
  const coming = pinnedAt === -1 ? later : later.slice(0, pinnedAt);
  const ops: PlanOp[] = [];
  const own = moveOp(stop, slot, start);
  if (own !== null) ops.push(own);
  for (const other of coming) {
    const op = moveOp(other, slot, (other.start ?? 0) - by);
    if (op !== null) ops.push(op);
  }
  return { start, by, moved: coming.length, ops };
}
