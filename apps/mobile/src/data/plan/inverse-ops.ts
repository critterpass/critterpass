/**
 * The edit that puts a plan back as it was before `ops`: what UNDO sends for an edit of the
 * organiser's own draft. (An edit of the crew's plan is taken back by the server, which keeps
 * every version; her draft keeps only her latest edit, so the way back is worked out here.)
 * A stop that was removed comes back with everything the plan held for it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- plan op names, never copy. */
import {
  applyPlanEdits,
  planOpsToEdits,
  type PlanOp,
  type PlanState,
  type PlanStateItem,
} from '@cp/domain';

type AddOp = Extract<PlanOp, { op: 'add' }>;

function restoring(item: PlanStateItem): AddOp {
  const {
    stable_id: stableId,
    locked_reason: _lock,
    created_by_kind: _by,
    lane,
    ...snapshot
  } = item;
  return {
    op: 'add',
    item: stableId,
    new: { ...snapshot, ...(lane == null ? {} : { lane }) },
  };
}

function inverseOf(op: PlanOp, before: PlanState): PlanOp | null {
  if (op.op === 'add') return { op: 'remove', item: op.item };
  if (op.op === 'reorder_days') {
    const back = op.new.order.map((_, index) => op.new.order.indexOf(index + 1) + 1);
    return back.includes(0) ? null : { op: 'reorder_days', new: { order: back } };
  }
  const item = before.items.find((candidate) => candidate.stable_id === op.item);
  if (item === undefined) return null;
  if (op.op === 'remove') return restoring(item);
  return {
    op: 'move',
    item: op.item,
    new: {
      day_no: item.day_no,
      ...(item.starts_at === undefined ? {} : { starts_at: item.starts_at }),
      ...(item.ends_at === undefined ? {} : { ends_at: item.ends_at }),
      lane: item.lane ?? null,
    },
  };
}

/** The ops that undo `ops` on the plan `before` them, or null when one cannot be put back. */
export function inverseOps(ops: readonly PlanOp[], before: PlanState): PlanOp[] | null {
  const back: PlanOp[] = [];
  let state = before;
  for (const op of ops) {
    const inverse = inverseOf(op, state);
    if (inverse === null) return null;
    back.unshift(inverse);
    try {
      state = applyPlanEdits(state, planOpsToEdits([op]));
    } catch {
      return null;
    }
  }
  return back;
}
