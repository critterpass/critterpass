/**
 * FIX ALL's draft: one change set of every chosen fix's ops against the current plan, the caller's
 * alone until they send it from the review (7h-7), trigger `check`. Each op's `before` is filled
 * from the plan it starts from, as a member's own draft is.
 */
import { appendDomainEvent } from '@cp/db';
import {
  changeSetOpsToEdits,
  DomainError,
  generateUuidV7,
  PLAN_RT,
  type ChangeSetOp,
  type PlanState,
} from '@cp/domain';
import type pg from 'pg';

import { publishPlan } from '../../plan/changeset-store';
import { loadPlanState, lockTripPlan, replay } from '../../plan/versioning';

export function withPlanBefore(state: PlanState, ops: readonly ChangeSetOp[]): ChangeSetOp[] {
  const byId = new Map(state.items.map((item) => [item.stable_id, item]));
  return ops.map((op) => {
    if (op.op === 'add') return { ...op, before: null };
    const item = byId.get(op.target);
    if (item === undefined) throw new DomainError('VALIDATION', { reason: 'unknown_item' });
    if (op.before !== undefined && op.before !== null) return op;
    const { stable_id: _id, locked_reason: _lock, created_by_kind: _by, lane, ...snapshot } = item;
    return {
      ...op,
      before: { ...snapshot, ...(lane === null || lane === undefined ? {} : { lane }) },
    };
  });
}

export async function draftCheckChangeSet(
  tx: pg.PoolClient,
  input: { readonly tripId: string; readonly uid: string; readonly ops: readonly ChangeSetOp[] },
): Promise<string> {
  const head = await lockTripPlan(tx, input.tripId);
  const base = head.currentVersionId;
  if (base === null) throw new DomainError('STATE_INVALID', { reason: 'no_current_plan' });
  const state = await loadPlanState(tx, base);
  const ops = withPlanBefore(state, input.ops);
  replay(state, changeSetOpsToEdits(ops));
  const id = generateUuidV7();
  // As the caller: RLS lets any member of the trip's crew draft a change set in their own name.
  await tx.query(
    `INSERT INTO change_sets (id, trip_id, base_version_id, trigger, author_kind, author_id, ops)
     VALUES ($1, $2, $3, 'check', 'user', $4, $5)`,
    [id, input.tripId, base, input.uid, JSON.stringify(ops)],
  );
  await appendDomainEvent(tx, {
    type: 'change_set.created',
    aggregateKind: 'change_set',
    aggregateId: id,
    actorKind: 'user',
    actorId: input.uid,
    payload: { trip_id: input.tripId, change_set_id: id, source: 'user' },
    crewId: head.crewId,
    tripId: input.tripId,
  });
  await publishPlan(tx, input.tripId, PLAN_RT.changesetCreated, {
    change_set_id: id,
    author_id: input.uid,
    trigger: 'check',
  });
  return id;
}
