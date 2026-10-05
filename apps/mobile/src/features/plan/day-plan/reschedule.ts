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
  /** A booked, must-do or pinned stop can't be picked up. */
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

/** Booked, somebody's must-do, or pinned by hand: it keeps its time until its own sheet moves it. */
export function isPinned(stop: DayItem): boolean {
  return stop.lock !== null;
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

export type RetimeRefusal =
  | Extract<Refusal, { kind: 'runs_into' | 'too_late' }>
  /** The new start is before the stop ahead of it is done; `earliest` is the first start that works. */
  | { readonly kind: 'starts_too_early'; readonly stop: DayItem; readonly earliest: number };

export type Retime =
  | {
      readonly ok: true;
      /** The moves of the stops pushed later (the edited stop's own op is the caller's). */
      readonly ops: readonly PlanOp[];
      readonly pushed: number;
      /** Minutes every pushed stop moves by, when they all move by the same. */
      readonly pushedBy: number | null;
    }
  | { readonly ok: false; readonly refusal: RetimeRefusal };

/**
 * One stop of the day at a new time (`edited`; a stop arriving from another day is in `stops`
 * too): stops before it keep their times, stops after it are pushed later only as far as the stop
 * before and the way between need. Two neighbours never need more room than they already had.
 */
export function retime(
  stops: readonly DayItem[],
  edited: { readonly stableId: string; readonly start: number; readonly end: number },
  slot: DaySlot,
  travel: Travel,
): Retime {
  const isEdited = (stop: DayItem) => stop.stableId === edited.stableId;
  const had = stops.filter((stop) => stop.start !== null && stop.end !== null);
  // A stop arriving from another day has no time here yet, so no neighbours to keep room with.
  const timed = stops.filter((stop) => isEdited(stop) || had.includes(stop));
  const before = [...had].sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  const wasNext = new Map(before.map((stop, index) => [stop.stableId, before[index + 1]]));
  const spanOf = (stop: DayItem) =>
    stop.stableId === edited.stableId
      ? { start: edited.start, end: edited.end }
      : { start: stop.start ?? 0, end: stop.end ?? 0 };
  const order = [...timed].sort(
    (a, b) => spanOf(a).start - spanOf(b).start || Number(isEdited(b)) - Number(isEdited(a)),
  );
  /** The room `next` needs after `prev`: the way between, never more than they already had. */
  const room = (prev: DayItem, next: DayItem) => {
    const way = travel(prev, next);
    if (wasNext.get(prev.stableId)?.stableId !== next.stableId) return way;
    return Math.min(way, Math.max(0, (next.start ?? 0) - (prev.end ?? 0)));
  };
  const ops: PlanOp[] = [];
  const shifts: number[] = [];
  let previous: DayItem | null = null;
  let previousEnd = 0;
  let reached = false;
  for (const stop of order) {
    const span = spanOf(stop);
    const length = span.end - span.start;
    const earliest = previous === null ? 0 : ceilGrid(previousEnd + room(previous, stop));
    let start = span.start;
    if (isEdited(stop)) {
      reached = true;
      if (previous !== null && earliest > start) {
        return { ok: false, refusal: { kind: 'starts_too_early', stop: previous, earliest } };
      }
    } else if (reached && earliest > start) {
      if (isPinned(stop)) return { ok: false, refusal: { kind: 'runs_into', stop } };
      start = earliest;
      const op = moveOp(stop, slot, start);
      if (op !== null) ops.push(op);
      shifts.push(start - span.start);
    }
    if (start + length > DAY_END) return { ok: false, refusal: { kind: 'too_late' } };
    previous = stop;
    previousEnd = start + length;
  }
  const same = shifts.every((shift) => shift === shifts[0]);
  return { ok: true, ops, pushed: shifts.length, pushedBy: same ? (shifts[0] ?? null) : null };
}
