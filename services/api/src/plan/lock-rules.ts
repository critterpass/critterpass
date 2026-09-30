/**
 * Lock rules for direct plan edits: organisers and
 * co-organisers edit the plan directly, everyone else proposes a change set; a booked or must-do
 * item (or one the organiser pinned) only moves, retimes or goes after the organiser confirmed the
 * warning; a day holding a booking keeps its date whatever anyone confirms.
 */
import { DomainError, type PlanOp, type PlanState, type PlanStateItem } from '@cp/domain';

export type LockViolation =
  | { readonly kind: 'locked_item'; readonly stableId: string; readonly reason: string }
  | { readonly kind: 'booked_day_fixed'; readonly dayNo: number };

function lockOf(item: PlanStateItem): string | null {
  if (item.booking_id !== undefined && item.booking_id !== null) return 'booking';
  return item.locked_reason ?? null;
}

function isBooked(item: PlanStateItem): boolean {
  return lockOf(item) === 'booking';
}

/** Every lock the ops run into, in op order. */
export function lockViolations(state: PlanState, ops: readonly PlanOp[]): LockViolation[] {
  const byId = new Map(state.items.map((item) => [item.stable_id, item]));
  const found: LockViolation[] = [];
  for (const op of ops) {
    if (op.op === 'reorder_days') {
      const days = [...state.days].sort((a, b) => a.day_no - b.day_no);
      op.new.order.forEach((from, index) => {
        const slot = days[index];
        if (slot === undefined || slot.day_no === from) return;
        if (state.items.some((item) => item.day_no === from && isBooked(item))) {
          found.push({ kind: 'booked_day_fixed', dayNo: from });
        }
      });
      continue;
    }
    if (op.op === 'add') continue;
    const item = byId.get(op.item);
    const reason = item === undefined ? null : lockOf(item);
    if (reason !== null) found.push({ kind: 'locked_item', stableId: op.item, reason });
  }
  return found;
}

/**
 * Refuses the ops a lock stops: a booked day never moves (`booked_day_fixed`), a locked item
 * needs `confirm_locked` (`locked_item`, with every such item and why, for the warning sheet).
 */
export function assertLockRules(
  state: PlanState,
  ops: readonly PlanOp[],
  confirmLocked: boolean,
): void {
  const violations = lockViolations(state, ops);
  const fixed = violations.find((v) => v.kind === 'booked_day_fixed');
  if (fixed !== undefined) {
    throw new DomainError('STATE_INVALID', { reason: 'booked_day_fixed', day_no: fixed.dayNo });
  }
  const locked = violations.filter((v) => v.kind === 'locked_item');
  if (locked.length > 0 && !confirmLocked) {
    throw new DomainError('STATE_INVALID', {
      reason: 'locked_item',
      items: locked.map((v) => ({ stable_id: v.stableId, locked_reason: v.reason })),
    });
  }
}
