/**
 * An organiser's one-tap fix: the change set is approved by them and applied at once, with a
 * `check_fix` guide action carrying its inverse, so the trip feed offers UNDO until the first
 * touched item starts or a day has passed (the guide-action undo rule). The inverse swaps each
 * op's `before` and `after`; an added item is undone by removing it. A fix that removes anything
 * has no clean inverse and is applied without an undo.
 */
import { scheduleEvent } from '@cp/db';
import {
  changeSetOpsSchema,
  DEFAULT_UNDO_WINDOW_MS,
  DomainError,
  undoWindowEnd,
  type ChangeSetOp,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { advance, applyToGroup, lockChangeSet } from '../../plan/changeset-store';

export const UNDO_EXPIRE_QUEUE = 'guide_action.undo_expire';

export function inverseOps(ops: readonly ChangeSetOp[]): ChangeSetOp[] | null {
  const inverted: ChangeSetOp[] = [];
  for (const op of [...ops].reverse()) {
    const shared = {
      target: op.target,
      reason: `undo: ${op.reason}`,
      affected_user_ids: op.affected_user_ids,
      booking_impact: op.booking_impact,
    };
    if (op.op === 'remove') return null;
    if (op.op === 'add') {
      inverted.push({ ...shared, op: 'remove', before: op.after ?? null, after: null });
      continue;
    }
    if (op.before == null || op.after == null) return null;
    inverted.push({ ...shared, op: op.op, before: op.after, after: op.before });
  }
  const parsed = changeSetOpsSchema.safeParse(inverted);
  return parsed.success ? parsed.data : null;
}

function itemStarts(ops: readonly ChangeSetOp[]): Date[] {
  return ops
    .flatMap((op) => [op.before?.starts_at, op.after?.starts_at])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => new Date(value));
}

/** Applies the drafted fix as its organiser and records the undo; returns the guide action id. */
export async function applyWithUndo(
  tx: pg.PoolClient,
  input: { readonly changeSetId: string; readonly uid: string; readonly now: Date },
): Promise<string> {
  let row = await lockChangeSet(tx, input.changeSetId);
  row = await advance(tx, row, ['proposed', 'approved'], { kind: 'organiser', uid: input.uid });
  const result = await applyToGroup(tx, row, { kind: 'user', id: input.uid });
  if (result.status === 'stale') throw new DomainError('STATE_INVALID', { reason: 'stale_issue' });
  const inverse = inverseOps(row.ops);
  const undoUntil =
    inverse === null ? null : undoWindowEnd(input.now, itemStarts(row.ops), DEFAULT_UNDO_WINDOW_MS);
  const audit = {
    inputs: { requester_id: input.uid, trigger: 'check', scope: 'group' },
    affected_user_ids: [...new Set(row.ops.flatMap((op) => op.affected_user_ids))],
    requested_by: input.uid,
  };
  return asSystemRole(tx, async () => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO guide_actions (trip_id, change_set_id, kind, status, reversible, inverse, audit)
       VALUES ($1, $2, 'check_fix', 'planned', $3, $4, $5) RETURNING id`,
      [
        row.trip_id,
        row.id,
        inverse !== null,
        inverse === null ? null : JSON.stringify({ type: 'change_set_ops', ops: inverse }),
        JSON.stringify(audit),
      ],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new Error('guide_actions insert returned no id');
    await tx.query("UPDATE guide_actions SET status = 'running' WHERE id = $1", [id]);
    await tx.query("UPDATE guide_actions SET status = 'done', undo_until = $2 WHERE id = $1", [
      id,
      undoUntil,
    ]);
    if (undoUntil !== null && undoUntil > input.now) {
      await scheduleEvent(tx, { kind: UNDO_EXPIRE_QUEUE, refId: id, tz: 'UTC', at: undoUntil });
    }
    return id;
  });
}
