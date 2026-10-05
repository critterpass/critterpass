/**
 * Running late as the traveller says it herself (15, 30 or 45 minutes for a stop of today), before
 * anything is changed: what pushing the stop does to the rest of the day (worked out by the same
 * retiming the stop's sheet uses, so the stops after it move only as far as they must), or why it
 * can't be pushed. The running-late screen (3k-9) shows it. Pure.
 */
/* eslint-disable lingui/no-unlocalized-strings -- option ids, states and route params, never copy. */
import type { PlanOp } from '@cp/domain';
import type { Href } from 'expo-router';

import type { DayItem } from '@/data/plan/plan-model';
import { resizeOp, type DaySlot } from '@/data/plan/plan-ops';
import { retime, type Retime, type Travel } from '../day-plan/reschedule';

/** The minutes "Running late" offers. */
export const LATE_STEPS = [15, 30, 45] as const;

/** The running-late screen for a stop the traveller says she is late for. */
export function saidLateRoute(tripId: string, stableId: string, minutes: number): Href {
  return {
    pathname: '/(trip)/late/[id]',
    params: { id: 'stop', tripId, stop: stableId, minutes: String(minutes) },
  };
}

/** The minutes a route carries, held to what the app offers (15 when it names none of them). */
export function lateStep(raw: string | undefined): number {
  const minutes = Number(raw);
  return LATE_STEPS.find((step) => step === minutes) ?? LATE_STEPS[0];
}

export interface SaidLate {
  /** The stop at its pushed time. */
  readonly start: number;
  readonly end: number;
  /** What pushing does to the rest of the day; refused when it runs into a stop that can't move. */
  readonly effect: Retime;
  /** The stop's own move and every move after it; empty when the push is refused. */
  readonly ops: readonly PlanOp[];
}

/**
 * The stop pushed by `minutes` against its day. Null when the push is not hers alone to make: the
 * stop has no time, is booked (its time follows the booking), someone else goes to it too (they
 * start on time: the crew's own running-late options cover that), or she can't change the plan.
 */
export function saidLate(input: {
  readonly stops: readonly DayItem[];
  readonly stop: DayItem;
  readonly minutes: number;
  readonly slot: DaySlot;
  readonly travel: Travel;
  readonly canApply: boolean;
  readonly alone: boolean;
}): SaidLate | null {
  const { stop } = input;
  if (stop.start === null || stop.end === null) return null;
  if (!input.canApply || !input.alone || stop.lock === 'booking') return null;
  const start = stop.start + input.minutes;
  const end = stop.end + input.minutes;
  const effect = retime(
    input.stops,
    { stableId: stop.stableId, start, end },
    input.slot,
    input.travel,
  );
  return {
    start,
    end,
    effect,
    ops: effect.ok ? [resizeOp(stop, input.slot, start, end), ...effect.ops] : [],
  };
}
