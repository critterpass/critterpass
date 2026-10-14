/**
 * What taking a stop off its day also moves: the stops it pushed when it came in go back exactly
 * where they were; otherwise later stops that now sit later than they belong move back earlier.
 * Shared by the stop's sheet and the stop's menu, so a removal from either moves the same stops.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { PlanOp } from '@cp/domain';

import { useLiveRows } from '@/data/plan/live-rows';
import { dayItems, type DayItem } from '@/data/plan/plan-model';
import type { DaySlot } from '@/data/plan/plan-ops';
import { useVersionPushes } from '@/data/plan/plan-pushes';
import type { TripPlan } from '@/data/plan/use-trip-plan';

import type { Travel } from '../day-plan/reschedule';
import { closeGap, outOfPlaceOn } from './close-gap';
import { travelMinutes } from './fit-check';
import { pushedBack } from './pushed-back';
import { gapLine } from './retime-copy';

export interface TakeOff {
  /** The ops that go with the stop's removal (or its move to another day). */
  readonly ops: readonly PlanOp[];
  /** One line on what else moves, said on `day` when it is named; null when nothing does. */
  readonly line: (day?: string) => string | null;
}

export function useTakeOff(
  plan: TripPlan,
  item: DayItem,
  slot: DaySlot,
  travel: Travel | undefined,
): TakeOff {
  const tz = plan.trip?.tz ?? item.tz;
  const here = dayItems(plan.state, item.dayNo, plan.display, tz);
  const straight = travelMinutes(here);
  const gap = closeGap(
    here,
    item.stableId,
    slot,
    travel ?? ((from, next) => straight(from.stableId, next.stableId) ?? 0),
    outOfPlaceOn(slot.date, tz),
  );
  const kept = useVersionPushes(plan.versionId);
  const back = plan.mode === 'draft' ? null : pushedBack(kept, item.stableId, plan.state);
  return {
    ops: back?.ops ?? gap.ops,
    line: (day) => back?.line ?? gapLine(gap, day),
  };
}

/** Whether the must-do behind this stop is one I asked for (the removal says so). */
export function useMustDoMine(plan: TripPlan, item: DayItem): boolean {
  const mustDoId = plan.itemRows.find((row) => row.stable_id === item.stableId)?.must_do_id ?? null;
  const owner = useLiveRows<{ owner_id: string | null }>(
    'SELECT owner_id FROM must_dos WHERE id = ?',
    mustDoId === null ? null : [mustDoId],
    ['must_dos'],
  );
  const id = owner.rows[0]?.owner_id ?? null;
  return id !== null && id === plan.uid;
}
