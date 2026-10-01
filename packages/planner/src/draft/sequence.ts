/**
 * Visiting order: the guide's order is kept whenever it works. When it does not (a place would
 * close before the visit ends, the day would run past its window, or two meals would land in the
 * same stretch), the planner tries the other orders of the same stops and takes the workable one
 * closest to the guide's (fewest swapped pairs, then the earliest finish). The stops themselves
 * never change here: dropping or swapping a place is the guide's call, in the repair pass.
 */
import { WEEKDAYS, type Hours } from '@cp/domain';

import { ceilGrid, defaultDurationMin, DINNER, LUNCH, mealSlotAt } from './schedule-day';
import { timedDuration, timeWindow } from './wish-time';
import type { DayChoice, DayWindow, DraftPoi, TravelMatrix } from './types';

/** Orders are searched exhaustively up to this many stops (7! = 5040 timelines). */
export const MAX_SEARCHED_STOPS = 7;

interface Span {
  readonly start: number;
  readonly end: number;
}

const toMin = (time: string) => {
  if (time === '24:00') return 1440;
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
};

/** Opening spans of `hours` on `date` in local minutes; null hours = open all day. */
export function spansOn(hours: Hours | null, date: string): readonly Span[] {
  if (hours === null) return [{ start: 0, end: 2880 }];
  const exception = hours.exceptions?.find((entry) => entry.date === date);
  const isoDow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const spans = exception?.spans ?? hours.weekly[WEEKDAYS[isoDow] ?? 'mo'] ?? [];
  return spans.map((s) => {
    const start = toMin(s.start);
    const end = toMin(s.end);
    return { start, end: end <= start ? end + 1440 : end };
  });
}

export interface SequenceInput {
  readonly date: string;
  readonly choices: readonly DayChoice[];
  readonly pois: ReadonlyMap<string, DraftPoi>;
  readonly window: DayWindow;
  readonly travel: TravelMatrix;
}

/** How many stops of `order` break hours, the window or the meal rule, and when the day ends. */
function timeline(
  input: SequenceInput,
  order: readonly DayChoice[],
): { readonly broken: number; readonly end: number } {
  let at = input.window.startMin;
  let previous: string | null = null;
  let broken = 0;
  const meals = new Set<string>();
  for (const choice of order) {
    const poi = input.pois.get(choice.poiId);
    if (poi === undefined) {
      broken += 1;
      continue;
    }
    let start = ceilGrid(at + (previous === null ? 0 : (input.travel(previous, poi.id) ?? 0)));
    if (choice.kind === 'meal') {
      const meal = mealSlotAt(start, meals.has('lunch'));
      start = Math.max(start, meal.startMin);
      const slot = meal === LUNCH ? 'lunch' : 'dinner';
      if (meals.has(slot)) broken += 1;
      meals.add(slot);
    }
    const timed = timeWindow(choice.when);
    if (timed !== null && (previous === null || start < timed.fromMin)) {
      start = Math.max(timed.fromMin, input.window.earliestMin ?? input.window.startMin);
    }
    const duration = ceilGrid(timedDuration(poi, choice.when) || defaultDurationMin(poi.category));
    const span = spansOn(poi.hours, input.date).find(
      (s) => Math.max(start, ceilGrid(s.start)) + duration <= s.end,
    );
    if (span === undefined) broken += 1;
    else start = Math.max(start, ceilGrid(span.start));
    // Held to its time of day: too late for it is broken; running past the usual end is not.
    if (timed !== null && start > timed.toMin) broken += 1;
    at = start + duration;
    if (
      at > (timed === null ? input.window.endMin : (input.window.latestMin ?? input.window.endMin))
    )
      broken += 1;
    previous = poi.id;
  }
  return { broken, end: at };
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

/** The meals a place can serve on a date: open for a whole meal inside the lunch or dinner stretch. */
export function mealSlots(poi: DraftPoi, date: string): ('lunch' | 'dinner')[] {
  const spans = spansOn(poi.hours, date);
  const serves = (window: { startMin: number; endMin: number }) =>
    spans.some(
      (span) =>
        Math.max(span.start, window.startMin) + poi.durationMin <=
        Math.min(span.end, window.endMin + 60),
    );
  return [
    ...(serves(LUNCH) ? (['lunch'] as const) : []),
    ...(serves(DINNER) ? (['dinner'] as const) : []),
  ];
}

/** The meals a day window runs through: lunch when it starts by the end of lunchtime and runs past
 * half past twelve, dinner when it starts by seven and runs to eight. */
export function mealsInWindow(window: DayWindow): ('lunch' | 'dinner')[] {
  return [
    ...(window.startMin <= LUNCH.endMin && window.endMin >= 12 * 60 + 30
      ? (['lunch'] as const)
      : []),
    ...(window.startMin <= 19 * 60 && window.endMin >= 20 * 60 ? (['dinner'] as const) : []),
  ];
}

export interface PlannedOrder {
  /** Indexes of the choices in visiting order. */
  readonly order: number[];
  /** Stops that still break hours, the window or the meal rule in that order. */
  readonly broken: number;
}

/**
 * The order to visit `choices` in: the guide's own order when it works, else the order with the
 * fewest broken stops, then the fewest swapped pairs, then the earliest finish.
 */
export function bestOrder(input: SequenceInput): PlannedOrder {
  const identity = input.choices.map((_, index) => index);
  const own = timeline(input, input.choices);
  if (own.broken === 0 || input.choices.length > MAX_SEARCHED_STOPS) {
    return { order: identity, broken: own.broken };
  }
  let best: { order: number[]; broken: number; swaps: number; end: number } | null = null;
  for (const order of permutations([...identity])) {
    const { broken, end } = timeline(
      input,
      order.map((index) => input.choices[index] as DayChoice),
    );
    const swaps = inversions(order);
    if (
      best === null ||
      broken < best.broken ||
      (broken === best.broken && (swaps < best.swaps || (swaps === best.swaps && end < best.end)))
    ) {
      best = { order, broken, swaps, end };
    }
  }
  return best === null ? { order: identity, broken: own.broken } : best;
}

export function visitOrder(input: SequenceInput): number[] {
  return bestOrder(input).order;
}
