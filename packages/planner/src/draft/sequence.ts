/**
 * Visiting order: the guide's order is kept whenever it works. When it does not (a place would
 * close before the visit ends, the day would run past its window, a meal would land outside its
 * stretch or twice in one, a place would miss the time of day it is for, a stop would be a hop too
 * far, or the crew would wait an hour with nothing planned), the planner tries the other orders of
 * the same stops and takes the workable one closest to the guide's (fewest broken stops, then the
 * fewest morning places left for later in the day, then the least waiting, then the fewest swapped
 * pairs, then the earliest finish). The stops themselves
 * never change here: dropping or swapping a place is the guide's call, in the repair pass.
 */
import { ceilGrid, spansOn } from './day-minutes';
import { longHops } from './hops';
import { DINNER, LUNCH, mealAt, mealSlotAt } from './meal-slots';
import { MORNING_ENDS_MIN, placeTime, placeWindow } from './place-time';
import { defaultDurationMin } from './schedule-day';
import { heldWindow, timedDuration } from './wish-time';
import type { DayChoice, DayWindow, DraftPoi, TravelMatrix } from './types';

export { spansOn } from './day-minutes';

/** Orders are searched exhaustively up to this many stops (7! = 5040 timelines). */
export const MAX_SEARCHED_STOPS = 7;

/** Waiting counts in steps of this many minutes: a shorter wait never reorders a day. */
const IDLE_STEP_MIN = 45;
/** A meal this long after its stretch opens is a late one, and counts like waiting. */
const LATE_MEAL_MIN = 60;

export interface SequenceInput {
  readonly date: string;
  readonly choices: readonly DayChoice[];
  readonly pois: ReadonlyMap<string, DraftPoi>;
  readonly window: DayWindow;
  readonly travel: TravelMatrix;
  /** The longest ride between two stops that is still one part of the map (./hops). */
  readonly hopCapMin?: number;
}

interface Timeline {
  /** Stops that break hours, the window, a meal stretch, their time of day or the hop rule. */
  readonly broken: number;
  /** Minutes spent waiting for a place to open, a meal stretch or a time of day. */
  readonly idle: number;
  /** Morning places that start after the morning. */
  readonly late: number;
  readonly end: number;
}

function timeline(input: SequenceInput, order: readonly DayChoice[]): Timeline {
  let at = input.window.startMin;
  let previous: string | null = null;
  let broken = 0;
  let idle = 0;
  let late = 0;
  const meals = new Set<string>();
  for (const choice of order) {
    const poi = input.pois.get(choice.poiId);
    if (poi === undefined) {
      broken += 1;
      continue;
    }
    const reached = ceilGrid(at + (previous === null ? 0 : (input.travel(previous, poi.id) ?? 0)));
    let start = reached;
    // A stop held to its time of day waits for it; nothing else starts before the usual day.
    const held = heldWindow(poi, input.date, choice.when);
    const untimedMeal = choice.kind === 'meal' && held === null;
    if (untimedMeal) start = Math.max(start, mealSlotAt(start, meals.has('lunch')).startMin);
    if (held === null) start = Math.max(start, input.window.startMin);
    else if (previous === null || start < held.fromMin) {
      start = Math.max(held.fromMin, input.window.earliestMin ?? input.window.startMin);
    }
    const own = held !== null || choice.kind === 'meal' ? null : placeWindow(poi, input.date);
    if (own !== null) start = Math.max(start, own.fromMin);
    const duration = ceilGrid(timedDuration(poi, choice.when) || defaultDurationMin(poi.category));
    // Hours that are only a guess never move a held stop or count against it.
    const hours = held !== null && poi.hoursGuessed === true ? null : poi.hours;
    const span = spansOn(hours, input.date).find(
      (s) => Math.max(start, ceilGrid(s.start)) + duration <= s.end,
    );
    if (span === undefined) broken += 1;
    else start = Math.max(start, ceilGrid(span.start));
    // Held to its time of day: too late for it is broken; running past the usual end is not.
    if (held !== null && start > held.toMin) broken += 1;
    if (own !== null && start > own.toMin) broken += 1;
    if (held === null && choice.kind !== 'meal' && start > MORNING_ENDS_MIN) {
      late += placeTime(poi) === 'morning' ? 1 : 0;
    }
    if (choice.kind === 'meal') {
      const slot = mealAt(start);
      // An untimed meal outside every stretch, or a second one in the same stretch.
      if (slot === null ? untimedMeal : meals.has(slot)) broken += 1;
      if (slot !== null) meals.add(slot);
    }
    idle += Math.max(0, start - Math.max(reached, input.window.startMin));
    if (choice.kind === 'meal') idle += mealLateness(start, held?.fromMin ?? null);
    at = start + duration;
    if (
      at > (held === null ? input.window.endMin : (input.window.latestMin ?? input.window.endMin))
    )
      broken += 1;
    previous = poi.id;
  }
  if (input.hopCapMin !== undefined) {
    broken += longHops(
      order.map((choice) => choice.poiId),
      input.travel,
      input.hopCapMin,
    ).length;
  }
  return { broken, idle: Math.floor(idle / IDLE_STEP_MIN), late, end: at };
}

/**
 * How late a meal is: a lunch or dinner more than an hour into its stretch, or a breakfast a
 * must-do asked for that does not open the day.
 */
function mealLateness(start: number, heldFrom: number | null): number {
  const slot = mealAt(start);
  if (heldFrom !== null) return slot === 'breakfast' || slot === null ? start - heldFrom : 0;
  if (slot === 'lunch') return Math.max(0, start - LUNCH.startMin - LATE_MEAL_MIN);
  if (slot === 'dinner') return Math.max(0, start - DINNER.startMin - LATE_MEAL_MIN);
  return 0;
}

function inversions(order: readonly number[]): number {
  let count = 0;
  for (let i = 0; i < order.length; i += 1) {
    for (let j = i + 1; j < order.length; j += 1) {
      if ((order[i] as number) > (order[j] as number)) count += 1;
    }
  }
  return count;
}

function* permutations(items: number[], k = items.length): Generator<number[]> {
  if (k <= 1) {
    yield [...items];
    return;
  }
  for (let i = 0; i < k; i += 1) {
    yield* permutations(items, k - 1);
    const j = k % 2 === 0 ? i : 0;
    [items[j], items[k - 1]] = [items[k - 1] as number, items[j] as number];
  }
}

export interface PlannedOrder {
  /** Indexes of the choices in visiting order. */
  readonly order: number[];
  /** Stops that still break a rule in that order. */
  readonly broken: number;
}

/**
 * The order to visit `choices` in: the guide's own order when it works, else the order with the
 * fewest broken stops, then the fewest late morning places, then the least waiting, then the
 * fewest swapped pairs, then the earliest finish.
 */
export function bestOrder(input: SequenceInput): PlannedOrder {
  const identity = input.choices.map((_, index) => index);
  const own = timeline(input, input.choices);
  const fine = own.broken === 0 && own.idle === 0 && own.late === 0;
  if (fine || input.choices.length > MAX_SEARCHED_STOPS) {
    return { order: identity, broken: own.broken };
  }
  let best: { order: number[]; key: readonly number[] } | null = null;
  for (const order of permutations([...identity])) {
    const { broken, idle, late, end } = timeline(
      input,
      order.map((index) => input.choices[index] as DayChoice),
    );
    const key = [broken, late, idle, inversions(order), end];
    if (best === null || before(key, best.key)) best = { order, key };
  }
  return best === null
    ? { order: identity, broken: own.broken }
    : { order: best.order, broken: best.key[0] ?? 0 };
}

function before(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff < 0;
  }
  return false;
}

export function visitOrder(input: SequenceInput): number[] {
  return bestOrder(input).order;
}
