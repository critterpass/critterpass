/**
 * Visiting order: the guide's order is kept whenever it works. When it does not (a place would
 * close before the visit ends, the day would run past its window, a meal would land outside its
 * stretch or twice in one, a place would miss the time of day it is for, a stop would be a hop too
 * far, or the crew would wait an hour with nothing planned), the planner tries the other orders of
 * the same stops and takes the workable one closest to the guide's (fewest broken stops, then a
 * long outdoor sight that is best early before the day's other sights, then no meal the day rides
 * out of its way for, then the fewest morning places left for later in the day, then the least waiting, then the fewest swapped
 * pairs, then the earliest finish). The stops themselves
 * never change here: dropping or swapping a place is the guide's call, in the repair pass.
 */
import { ceilGrid, spansOn } from './day-minutes';
import { opensDay, startFloor } from './day-start';
import { dinnerIsRideHome, longHops, mealDetours } from './hops';
import { DINNER, LUNCH, mealAt, mealDuration, mealSlotAt, servingOn } from './meal-slots';
import { MORNING_ENDS_MIN, placeTime, placeWindows, windowFor } from './place-time';
import { defaultDurationMin, fixedMinutes } from './schedule-day';
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
  /** The place the crew sleeps near (./home): the ride out to the first stop then counts. */
  readonly homeId?: string | null;
  /** The destination's zone, for stops that keep their own times (default: the place's own). */
  readonly tz?: string;
  /** Meal places that suit the crew: with none near the day, its dinner is a ride home (./hops). */
  readonly mealPlaces?: readonly DraftPoi[];
  /** The places of the day out this day is planned for (./outings): their rides are its purpose. */
  readonly dayOut?: ReadonlySet<string>;
}

interface Timeline {
  /** Stops that break hours, the window, a meal stretch, their time of day or the hop rule. */
  readonly broken: number;
  /** Minutes spent waiting for a place to open, a meal stretch or a time of day. */
  readonly idle: number;
  /** Morning places that start after the morning. */
  readonly late: number;
  /** Stops that open a day (./day-start) with another sight before them. */
  readonly notFirst: number;
  /** Meals the day rides out of its way for (./hops `mealDetours`). */
  readonly detours: number;
  readonly end: number;
}

function timeline(input: SequenceInput, order: readonly DayChoice[]): Timeline {
  let at = startFloor(input.window, true, null);
  let previous: string | null = null;
  let broken = 0;
  let idle = 0;
  let late = 0;
  let mealsBefore = 0;
  let sights = 0;
  let notFirst = 0;
  const meals = new Set<string>();
  let dinnerAt: number | undefined;
  for (const [index, choice] of order.entries()) {
    const poi = input.pois.get(choice.poiId);
    // A stop with its own times stands where it is: the order must reach it in time.
    const fixed = fixedMinutes(choice, input.date, poi?.tz ?? input.tz ?? 'UTC');
    if (fixed !== null) {
      const ride = previous === null ? 0 : (input.travel(previous, choice.poiId) ?? 0);
      const arrived = ceilGrid(at + ride);
      if (previous !== null && arrived > fixed.startMin) broken += 1;
      idle += Math.max(0, fixed.startMin - Math.max(arrived, input.window.startMin));
      if (choice.kind === 'meal') {
        const slot = mealAt(fixed.startMin);
        if (slot !== null) meals.add(slot);
        if (slot === 'dinner') dinnerAt ??= index;
      }
      at = Math.max(at, fixed.endMin);
      previous = choice.poiId;
      continue;
    }
    if (poi === undefined) {
      broken += 1;
      continue;
    }
    const reached = ceilGrid(at + (previous === null ? 0 : (input.travel(previous, poi.id) ?? 0)));
    let start = reached;
    // A stop held to its time of day waits for it; nothing else starts before the usual day.
    const held = heldWindow(poi, input.date, choice.when);
    const untimedMeal = choice.kind === 'meal' && held === null;
    if (untimedMeal) {
      const from =
        choice.mealSlot === 'dinner'
          ? DINNER.startMin
          : mealSlotAt(start, meals.has('lunch'), input.dayOut?.has(previous ?? '') === true)
              .startMin;
      start = Math.max(start, from);
    }
    const opener = held === null && choice.kind !== 'meal' && opensDay(poi, input);
    if (held === null) {
      start = Math.max(start, startFloor(input.window, opener, previous === null ? null : at));
    } else if (previous === null || start < held.fromMin) {
      start = Math.max(held.fromMin, input.window.earliestMin ?? input.window.startMin);
    }
    // A breakfast the crew asked for opens the day: an order with a stop before it is broken.
    const breakfast =
      choice.kind === 'meal' && (choice.when === 'morning' || choice.when === 'sunrise');
    if (breakfast && previous !== null) broken += 1;
    // A stop that opens the day comes before every other sight of it, and before lunch.
    if (opener && (sights > 0 || mealsBefore > 0)) notFirst += 1;
    if (held === null && choice.kind !== 'meal') sights += 1;
    if (choice.kind === 'meal' && !breakfast) mealsBefore += 1;
    const windows = held !== null || choice.kind === 'meal' ? [] : placeWindows(poi, input.date);
    const own = windows.length === 0 ? null : windowFor(windows, start);
    if (own !== null) start = Math.max(start, own.fromMin);
    const duration = ceilGrid(timedDuration(poi, choice.when) || defaultDurationMin(poi.category));
    // Hours that are only a guess never move a held stop or count against it.
    const hours = held !== null && poi.hoursGuessed === true ? null : poi.hours;
    const span = spansOn(hours, input.date).find(
      (s) => Math.max(start, ceilGrid(s.start)) + duration <= s.end,
    );
    if (span === undefined) broken += 1;
    else start = Math.max(start, ceilGrid(span.start));
    // A meal its place's opening pushed past lunch waits for dinner (as `scheduleDay` times it).
    if (untimedMeal && mealAt(start) === null && start < DINNER.startMin) {
      const evening = spansOn(hours, input.date).find(
        (s) => Math.max(DINNER.startMin, ceilGrid(s.start)) + duration <= s.end,
      );
      if (evening !== undefined) start = Math.max(DINNER.startMin, ceilGrid(evening.start));
    }
    // Held to its time of day: too late for it is broken; running past the usual end is not.
    if (held !== null && start > held.toMin) broken += 1;
    if (windows.length > 0 && (own === null || start > own.toMin)) broken += 1;
    if (held === null && choice.kind !== 'meal' && start > MORNING_ENDS_MIN) {
      late += placeTime(poi) === 'morning' ? 1 : 0;
    }
    if (choice.kind === 'meal') {
      const slot = mealAt(start);
      // An untimed meal outside every stretch, or a second one in the same stretch.
      if (slot === null ? untimedMeal : meals.has(slot)) broken += 1;
      if (slot !== null) meals.add(slot);
      if (slot === 'dinner') dinnerAt ??= index;
    }
    idle += Math.max(0, start - Math.max(reached, input.window.startMin));
    if (choice.kind === 'meal') idle += mealLateness(start, held?.fromMin ?? null);
    at = start + (choice.kind === 'meal' ? mealDuration(poi, start, duration) : duration);
    if (
      at > (held === null ? input.window.endMin : (input.window.latestMin ?? input.window.endMin))
    )
      broken += 1;
    previous = poi.id;
  }
  if (input.hopCapMin !== undefined) {
    const ids = order.map((choice) => choice.poiId);
    const rideHome =
      dinnerAt !== undefined &&
      input.mealPlaces !== undefined &&
      dinnerIsRideHome(
        ids.slice(0, dinnerAt),
        servingOn(input.mealPlaces, input.date, 'dinner'),
        input.travel,
        input.hopCapMin,
      );
    broken += longHops(
      ids,
      input.travel,
      input.hopCapMin,
      rideHome ? dinnerAt : undefined,
      input.homeId,
      (index) => order[index]?.kind !== 'meal',
      (index) => input.dayOut?.has(order[index]?.poiId ?? '') === true,
    ).length;
  }
  const detours = mealDetours(order, input.travel, dinnerAt).length;
  return { broken, idle: Math.floor(idle / IDLE_STEP_MIN), late, notFirst, detours, end: at };
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
  const keyOf = (order: readonly number[]) => {
    const made = timeline(
      input,
      order.map((index) => input.choices[index] as DayChoice),
    );
    return [
      made.broken,
      made.notFirst,
      made.detours,
      made.late,
      made.idle,
      inversions(order),
      made.end,
    ];
  };
  const own = keyOf(identity);
  if (own.slice(0, 5).every((count) => count === 0)) return { order: identity, broken: 0 };
  // Too many stops to try every order: the guide's, or its order with the day's openers first.
  const orders =
    input.choices.length > MAX_SEARCHED_STOPS
      ? [identity, openersFirst(input, identity)]
      : permutations([...identity]);
  let best: { order: number[]; key: readonly number[] } = { order: identity, key: own };
  for (const order of orders) {
    const key = keyOf(order);
    if (before(key, best.key)) best = { order: [...order], key };
  }
  return { order: best.order, broken: best.key[0] ?? 0 };
}

/** `order` with the stops that open the day moved before its other sights, the rest as they were. */
function openersFirst(input: SequenceInput, order: readonly number[]): number[] {
  const opens = (index: number) => {
    const choice = input.choices[index];
    const poi = choice === undefined ? undefined : input.pois.get(choice.poiId);
    const free = choice?.kind !== 'meal' && (choice?.fixed ?? null) === null;
    return poi !== undefined && free && choice?.mustDoId === null && opensDay(poi, input);
  };
  const first = order.findIndex((index) => {
    const choice = input.choices[index];
    return choice?.kind !== 'meal' && (choice?.fixed ?? null) === null && choice?.mustDoId === null;
  });
  if (first === -1) return [...order];
  const openers = order.filter(opens);
  const rest = order.filter((index) => !opens(index));
  const at = rest.indexOf(order[first] as number);
  const head = at === -1 ? first : at;
  return [...rest.slice(0, head), ...openers, ...rest.slice(head)];
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
