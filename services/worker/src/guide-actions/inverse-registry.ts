/**
 * The inverse of every plan action kind (the UNDO of docs/product-decisions.md): what
 * `app.undo_guide_action` applies to put the plan back. A move, retime or swap is undone by the
 * same op with `before` and `after` exchanged (the executor fills `before` from the plan as it was,
 * so the inverse restores the item's exact prior values); an added item is undone by removing it.
 * A removal has no inverse: `app.apply_change_set` cannot re-create every column of a removed
 * item, so removals are irreversible and never auto-run. Forbidden kinds have no entry at all.
 */
import {
  changeSetOpsSchema,
  isPlanActionKind,
  type ChangeSetOp,
  type ChangeSetOps,
  type PlanActionKind,
} from '@cp/domain';

export interface GuideActionInverse {
  readonly type: 'change_set_ops';
  readonly ops: ChangeSetOps;
}

export type InverseBuilder = (ops: ChangeSetOps) => GuideActionInverse | null;

function invertOp(op: ChangeSetOp): ChangeSetOp | null {
  const shared = {
    target: op.target,
    reason: `undo: ${op.reason}`,
    affected_user_ids: op.affected_user_ids,
    booking_impact: op.booking_impact,
    ...(op.source_ids === undefined ? {} : { source_ids: op.source_ids }),
  };
  switch (op.op) {
    case 'move':
    case 'retime':
    case 'swap':
      if (op.before == null || op.after == null) return null;
      return { ...shared, op: op.op, before: op.after, after: op.before };
    case 'add':
      return { ...shared, op: 'remove', before: op.after ?? null, after: null };
    case 'remove':
      return null;
  }
}

/** Inverts every op, last op first; null when any op cannot be inverted or the result is invalid. */
export const invertChangeSet: InverseBuilder = (ops) => {
  const inverted: ChangeSetOp[] = [];
  for (const op of [...ops].reverse()) {
    const inverse = invertOp(op);
    if (inverse === null) return null;
    inverted.push(inverse);
  }
  const parsed = changeSetOpsSchema.safeParse(inverted);
  return parsed.success ? { type: 'change_set_ops', ops: parsed.data } : null;
};

const irreversible: InverseBuilder = () => null;

export const INVERSE_REGISTRY: Readonly<Record<PlanActionKind, InverseBuilder>> = {
  move_item: invertChangeSet,
  retime_item: invertChangeSet,
  swap_item: invertChangeSet,
  add_item: invertChangeSet,
  remove_item: irreversible,
  reschedule_pickup: invertChangeSet,
  check_fix: invertChangeSet,
};

/** The registered inverse of `kind` applied to `ops`; null = the action is irreversible. */
export function inverseFor(kind: string, ops: ChangeSetOps): GuideActionInverse | null {
  return isPlanActionKind(kind) ? INVERSE_REGISTRY[kind](ops) : null;
}
