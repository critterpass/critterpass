/**
 * A day's stops in a new order, timed again (7b-1 reorder, 7b-3 a stop moved onto another day):
 * the day keeps its rhythm (the n-th stop starts at the day's n-th start time, so lunch stays at
 * lunch) unless the stop before it and the leg between push it later, each stop keeps its length,
 * and a pinned stop (booked, or pinned by hand) keeps its time. An order that would run into a
 * pinned stop, or past midnight, is refused with the stop that blocks it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- refusal kinds, never copy. */
import type { PlanOp } from '@cp/domain';

import type { DayItem } from '@/data/plan/plan-model';
import { moveOp, type DaySlot } from '@/data/plan/plan-ops';

const GRID = 5;
const DAY_END = 24 * 60;

export type Refusal =
  /** A booked or pinned stop can't be picked up. */
  | { readonly kind: 'pinned'; readonly stop: DayItem }
  /** The order would make a stop run into a pinned one. */
  | { readonly kind: 'runs_into'; readonly stop: DayItem }
  /** The day would end after midnight. */
  | { readonly kind: 'too_late' }
  /** The plan reads only (a past trip, an organiser's draft, a member who left). */
  | { readonly kind: 'read_only' }
  /** A stop has no time yet, so it has no place in the order. */
  | { readonly kind: 'untimed'; readonly stop: DayItem };

export type Reschedule =
  | {
      readonly ok: true;
      readonly ops: readonly PlanOp[];
      readonly starts: ReadonlyMap<string, number>;
    }
  | { readonly ok: false; readonly refusal: Refusal };

/** Minutes from one stop to the next (0 when unknown). */
export type Travel = (from: DayItem, to: DayItem) => number;

export function isPinned(stop: DayItem): boolean {
  return stop.lock === 'booking' || stop.lock === 'user';
}

const ceilGrid = (minutes: number) => Math.ceil(minutes / GRID) * GRID;

/** `ids` with the entry at `from` moved to `to`. */
export function moveInOrder<T>(ids: readonly T[], from: number, to: number): T[] {
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return next;
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

/**
 * Times for `stops` in `order` (stable ids), against the day in `slot`; the ops move every stop
 * whose start changed.
 */
export function reschedule(
  stops: readonly DayItem[],
  order: readonly string[],
  slot: DaySlot,
  travel: Travel,
): Reschedule {
  const byId = new Map(stops.map((stop) => [stop.stableId, stop]));
  const ordered = order.flatMap((id) => {
    const stop = byId.get(id);
    return stop === undefined ? [] : [stop];
  });
  const untimed = ordered.find((stop) => stop.start === null || stop.end === null);
  if (untimed !== undefined) return { ok: false, refusal: { kind: 'untimed', stop: untimed } };
  const slots = ordered.map((stop) => stop.start ?? 0).sort((a, b) => a - b);
  const starts = new Map<string, number>();
  let cursor = slots[0] ?? 0;
  let previous: DayItem | null = null;
  for (const [index, stop] of ordered.entries()) {
    const start0 = stop.start ?? 0;
    const length = (stop.end ?? start0) - start0;
    const arrive = previous === null ? cursor : cursor + travel(previous, stop);
    const slotStart = slots[index] ?? arrive;
    if (isPinned(stop)) {
      if (arrive > start0) return { ok: false, refusal: { kind: 'runs_into', stop } };
      starts.set(stop.stableId, start0);
      cursor = start0 + length;
    } else {
      const start = Math.max(slotStart, previous === null ? slotStart : ceilGrid(arrive));
      if (start + length > DAY_END) return { ok: false, refusal: { kind: 'too_late' } };
      starts.set(stop.stableId, start);
      cursor = start + length;
    }
    previous = stop;
  }
  const ops = ordered.flatMap((stop) => {
    const start = starts.get(stop.stableId);
    if (start === undefined || start === stop.start || isPinned(stop)) return [];
    const op = moveOp(stop, slot, start);
    return op === null ? [] : [op];
  });
  return { ok: true, ops, starts };
}
