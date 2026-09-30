/**
 * Day reorder on the overview: the new order after a drag, the booked day that refuses to move,
 * and the write it becomes. Organisers commit one `reorder_days` plan op; a member's reorder is
 * proposed as a change set of the item moves the reorder implies (the same replay the server runs,
 * `applyPlanEdits`), which the crew then approves on the review screen.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, never copy. */
import {
  applyPlanEdits,
  planOpsToEdits,
  type ChangeSetOp,
  type PlanOp,
  type PlanState,
} from '@cp/domain';

/** `order` with the entry at `from` moved to `to` (indexes into `order`). */
export function moveInOrder(order: readonly number[], from: number, to: number): number[] {
  const next = [...order];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return next;
  next.splice(to, 0, moved);
  return next;
}

/**
 * The first booked day a new order would move off its date, or null when the order is allowed.
 * `order[k]` is the day whose plan lands on position k's date (`reorder_days` semantics).
 */
export function movedFixedDay(
  current: readonly number[],
  next: readonly number[],
  fixed: ReadonlySet<number>,
): number | null {
  for (const [index, dayNo] of next.entries()) {
    if (fixed.has(dayNo) && current[index] !== dayNo) return dayNo;
  }
  return null;
}

/**
 * The plan as it reads after `order` (`reorder_days`: position k keeps its date and takes the
 * theme and items of day `order[k]`), for showing a reorder before its version syncs.
 */
export function reorderedPlan<
  D extends { dayNo: number; theme: string | null },
  I extends { dayNo: number },
>(days: readonly D[], items: readonly I[], order: readonly number[]): { days: D[]; items: I[] } {
  const byNo = new Map(days.map((day) => [day.dayNo, day]));
  const target = new Map<number, number>();
  order.forEach((from, index) => {
    const slot = days[index];
    if (slot !== undefined) target.set(from, slot.dayNo);
  });
  return {
    days: days.map((slot, index) => ({
      ...slot,
      theme: (byNo.get(order[index] ?? slot.dayNo) ?? slot).theme,
    })),
    items: items.map((item) => ({ ...item, dayNo: target.get(item.dayNo) ?? item.dayNo })),
  };
}

/** The organiser's direct write: every current day number in its new order. */
export function reorderPlanOp(order: readonly number[]): PlanOp {
  return { op: 'reorder_days', new: { order: [...order] } };
}

/**
 * A member's reorder as change set ops: one `move` per item whose day or times the reorder
 * changes, affecting the item's attendees.
 */
export function reorderChangeSetOps(
  state: PlanState,
  order: readonly number[],
  reason: string,
): ChangeSetOp[] {
  const next = applyPlanEdits(state, planOpsToEdits([reorderPlanOp(order)]));
  const before = new Map(state.items.map((item) => [item.stable_id, item]));
  return next.items.flatMap((item): ChangeSetOp[] => {
    const was = before.get(item.stable_id);
    if (was === undefined || was.day_no === item.day_no) return [];
    const snapshot = (source: typeof item) => ({
      day_no: source.day_no,
      ...(source.starts_at === undefined ? {} : { starts_at: source.starts_at }),
      ...(source.ends_at === undefined ? {} : { ends_at: source.ends_at }),
    });
    return [
      {
        op: 'move',
        target: item.stable_id,
        before: snapshot(was),
        after: snapshot(item),
        reason,
        affected_user_ids: [...(item.attendee_ids ?? [])],
        booking_impact: false,
      },
    ];
  });
}
