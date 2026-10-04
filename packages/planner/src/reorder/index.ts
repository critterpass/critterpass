/**
 * Less driving (7h-3): the same day's stops in the order that spends the fewest minutes in the car.
 * Booked and locked stops keep their exact times, and so does a stop only part of the crew goes to
 * (the others are elsewhere then); every other stop with the whole crew may take any place in the
 * order. Each order is laid out on the 15-minute grid from the day's first start, travel between
 * stops included, inside its place's opening spans and the meal window it was planned in, and never
 * across a fixed stop. Exact search (branch and bound) for up to eight stops that move; more, and
 * the current order stands. Ties go to the order that moves fewer stops. Only a strictly shorter
 * drive is offered, so a reorder never adds driving.
 */
import type { ChangeSetOp } from '@cp/domain';

import { retimeOp } from '../check/retime';
import { checkDays, spansOf, travelFor, type CheckDay } from '../check/rules/shared';
import type { CheckInput } from '../check/types';
import type { FitStop, FitTravel } from '../fit/context';
import type { ModelItem } from '../fit/day-model';
import { driveLeg, routeDrive, stayStop } from './route';
import { firstSlot, mealWindowOf, type SlotRules } from './slots';

export const MAX_MOVABLE_STOPS = 8;

export interface ReorderSlot {
  readonly stableId: string;
  readonly start: number;
  readonly end: number;
}

export interface DayReorder {
  readonly dayId: string;
  readonly dayNo: number;
  readonly before: { readonly order: readonly string[]; readonly driveMin: number };
  readonly after: {
    readonly order: readonly string[];
    readonly driveMin: number;
    readonly schedule: readonly ReorderSlot[];
  };
  /** Booked or locked stops: shown with a lock, never moved. */
  readonly locked: readonly string[];
  /** Where each stop that moved used to be: its 1-based place in the old order and its old start. */
  readonly was: readonly {
    readonly stableId: string;
    readonly position: number;
    readonly start: number;
  }[];
  /** The retimes that make the new order. */
  readonly ops: readonly ChangeSetOp[];
}

interface Layout {
  readonly fixed: readonly ModelItem[];
  readonly movable: readonly ModelItem[];
  readonly rules: ReadonlyMap<string, SlotRules>;
  readonly dayStart: number;
  readonly dayEnd: number;
  readonly travel: FitTravel;
  readonly home: FitStop | null;
}

interface State {
  readonly cursor: number;
  /** The last stop with a place, where the next leg starts; null before the first. */
  readonly at: FitStop | null;
  readonly fixedIndex: number;
  readonly drive: number;
  readonly moves: number;
  readonly slots: readonly ReorderSlot[];
}

const stopAt = (item: ModelItem): FitStop | null =>
  item.point === null ? null : { key: item.stableId, ...item.point };

function minutesBetween(travel: FitTravel, from: FitStop | null, to: FitStop | null): number {
  if (from === null || to === null) return 0;
  return travel(from, to)?.minutes ?? 0;
}

function enter(
  layout: Layout,
  state: State,
  item: ModelItem,
  start: number,
  moved: boolean,
): State {
  const here = stopAt(item);
  const leg = here === null ? 0 : driveLeg(layout.travel, state.at ?? layout.home, here);
  return {
    cursor: Math.max(state.cursor, start + (item.end - item.start)),
    at: here ?? state.at,
    fixedIndex: state.fixedIndex,
    drive: state.drive + leg,
    moves: state.moves + (moved ? 1 : 0),
    slots: [...state.slots, { stableId: item.stableId, start, end: start + item.end - item.start }],
  };
}

function passFixed(layout: Layout, state: State): State {
  const fixed = layout.fixed[state.fixedIndex];
  if (fixed === undefined) return state;
  return { ...enter(layout, state, fixed, fixed.start, false), fixedIndex: state.fixedIndex + 1 };
}

/**
 * The state after placing `item` next: at its own start when that is still ahead and fits, else
 * the first start that does, passing fixed stops it cannot fit before; null = no room left.
 */
function place(layout: Layout, from: State, item: ModelItem): State | null {
  const rules = layout.rules.get(item.stableId);
  if (rules === undefined) return null;
  const here = stopAt(item);
  let state = from;
  for (;;) {
    const travel = state.at === null ? 0 : minutesBetween(layout.travel, state.at, here);
    const earliest = state.cursor + travel;
    const next = layout.fixed[state.fixedIndex];
    const clear = (start: number) =>
      next === undefined ||
      start + rules.duration + minutesBetween(layout.travel, here, stopAt(next)) <= next.start;
    const own = firstSlot(rules, Math.max(earliest, item.start), layout.dayEnd);
    const soonest = firstSlot(rules, earliest, layout.dayEnd);
    const start = [own, soonest].find((slot) => slot !== null && clear(slot));
    if (start !== undefined && start !== null) {
      return enter(layout, state, item, start, start !== item.start);
    }
    if (next === undefined || soonest === null) return null;
    state = passFixed(layout, state);
  }
}

function finish(layout: Layout, from: State): State {
  let state = from;
  while (state.fixedIndex < layout.fixed.length) state = passFixed(layout, state);
  return { ...state, drive: state.drive + driveLeg(layout.travel, state.at, layout.home) };
}

function layoutOf(check: CheckDay): Layout | null {
  const { model, day, context } = check;
  const meals = context.meals;
  const everyone = model.everyone.length;
  const movable = model.items.filter(
    (item) =>
      !item.locked && item.point !== null && item.people.size >= everyone && item.end > item.start,
  );
  if (movable.length === 0 || movable.length > MAX_MOVABLE_STOPS) return null;
  const moving = new Set(movable.map((item) => item.stableId));
  const rules = new Map<string, SlotRules>();
  for (const item of movable) {
    const category = day.items.find((entry) => entry.stableId === item.stableId)?.category ?? null;
    rules.set(item.stableId, {
      spans: spansOf(check, item),
      meal: mealWindowOf(category, item.start, meals),
      duration: item.end - item.start,
    });
  }
  return {
    fixed: model.items.filter((item) => !moving.has(item.stableId)),
    movable,
    rules,
    dayStart: Math.min(...model.items.map((item) => item.start)),
    dayEnd: Math.min(24 * 60, Math.max(day.toMin, ...model.items.map((item) => item.end))),
    travel: travelFor(check),
    home: stayStop(day.stay),
  };
}

/** The best order found, or null when none is strictly shorter. */
function search(layout: Layout, beforeDrive: number): State | null {
  let best: State | null = null;
  const bound = (drive: number, moves: number) =>
    best === null
      ? drive >= beforeDrive
      : drive > best.drive || (drive === best.drive && moves >= best.moves);
  const walk = (state: State, left: readonly ModelItem[]) => {
    if (bound(state.drive, state.moves)) return;
    if (left.length === 0) {
      const done = finish(layout, state);
      if (!bound(done.drive, done.moves)) best = done;
      return;
    }
    left.forEach((item, index) => {
      const next = place(layout, state, item);
      if (next !== null) walk(next, [...left.slice(0, index), ...left.slice(index + 1)]);
    });
  };
  walk(
    { cursor: layout.dayStart, at: null, fixedIndex: 0, drive: 0, moves: 0, slots: [] },
    layout.movable,
  );
  return best;
}

export function reorderCheckDay(check: CheckDay): DayReorder | null {
  const { model, day, context } = check;
  const layout = layoutOf(check);
  if (layout === null) return null;
  const beforeDrive = routeDrive(model.items, day.stay, layout.travel);
  const best = search(layout, beforeDrive);
  if (best === null) return null;
  const schedule = [...best.slots].sort(
    (a, b) => a.start - b.start || (a.stableId < b.stableId ? -1 : 1),
  );
  const beforeOrder = model.items.map((item) => item.stableId);
  const byId = new Map(model.items.map((item) => [item.stableId, item]));
  const afterDrive = routeDrive(
    schedule.map((slot) => ({ ...slot, point: byId.get(slot.stableId)?.point ?? null })),
    day.stay,
    layout.travel,
  );
  if (afterDrive >= beforeDrive) return null;
  const was = schedule.flatMap((slot, index) => {
    const item = byId.get(slot.stableId);
    const position = beforeOrder.indexOf(slot.stableId);
    if (item === undefined || (item.start === slot.start && position === index)) return [];
    return [{ stableId: slot.stableId, position: position + 1, start: item.start }];
  });
  const ops = schedule.flatMap((slot) => {
    const item = byId.get(slot.stableId);
    return item === undefined || item.start === slot.start
      ? []
      : [retimeOp(model, item, slot.start, context.tz, 'check_fix_reorder')];
  });
  return {
    dayId: day.dayId,
    dayNo: day.dayNo,
    before: { order: beforeOrder, driveMin: beforeDrive },
    after: { order: schedule.map((slot) => slot.stableId), driveMin: afterDrive, schedule },
    locked: model.items.filter((item) => item.locked).map((item) => item.stableId),
    was,
    ops,
  };
}

/** The reorder of one day of the plan, or null (no such day, too many stops, nothing shorter). */
export function reorderDay(input: CheckInput, dayId: string): DayReorder | null {
  const check = checkDays(input).find((entry) => entry.day.dayId === dayId);
  return check === undefined ? null : reorderCheckDay(check);
}
