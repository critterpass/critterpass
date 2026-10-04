/**
 * A fixer's change set ops as plan edits, so a fixer screen applies them the way every plan screen
 * does (an organiser's `apply_plan_ops`, a member's change set to the crew): a retime moves the
 * stop to its new times, an add places the new stop on its day. Anything else is left to a review.
 */
import type { ChangeSetOp, PlanOp } from '@cp/domain';

export function planOpsOf(ops: readonly ChangeSetOp[]): PlanOp[] {
  return ops.flatMap((op): PlanOp[] => {
    const after = op.after ?? null;
    if (after === null) return [];
    if (op.op === 'retime' || op.op === 'move') {
      return [
        {
          op: 'move',
          item: op.target,
          new: {
            ...(after.day_no === undefined ? {} : { day_no: after.day_no }),
            ...(after.starts_at === undefined ? {} : { starts_at: after.starts_at }),
            ...(after.ends_at === undefined ? {} : { ends_at: after.ends_at }),
          },
        },
      ];
    }
    if (op.op === 'add' && after.day_no !== undefined) {
      return [{ op: 'add', item: op.target, new: { ...after, day_no: after.day_no } }];
    }
    return [];
  });
}
