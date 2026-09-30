/**
 * `create_changeset` (docs/api-contracts.md §4.6): any member drafts a change set against the
 * trip's current plan (a member's own edit, or a guide suggestion they adopted). The ops must replay
 * on that version; the server fills each op's `before` from it, so the review screen, the stale
 * check and a personal overlay all know what the change started from.
 */
import { appendDomainEvent } from '@cp/db';
import {
  changeSetOpsToEdits,
  createChangesetPayloadSchema,
  DomainError,
  generateUuidV7,
  PLAN_RT,
  type ChangeSetOp,
  type PlanState,
} from '@cp/domain';

import { requireTripMember } from '../../plan/access';
import { publishPlan } from '../../plan/changeset-store';
import { assertCurrentBase, loadPlanState, lockTripPlan, replay } from '../../plan/versioning';
import { defineCommand } from '../_framework/define-command';

function withBefore(state: PlanState, ops: readonly ChangeSetOp[]): ChangeSetOp[] {
  const byId = new Map(state.items.map((item) => [item.stable_id, item]));
  return ops.map((op) => {
    if (op.op === 'add' || op.before !== undefined) return op;
    const item = byId.get(op.target);
    if (item === undefined) return op;
    const { stable_id: _id, locked_reason: _lock, created_by_kind: _by, lane, ...snapshot } = item;
    return {
      ...op,
      before: { ...snapshot, ...(lane === null || lane === undefined ? {} : { lane }) },
    };
  });
}

export const createChangesetCommand = defineCommand({
  name: 'create_changeset',
  v: 1,
  schema: createChangesetPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireTripMember(tx, payload.trip_id);
  },
  handle: async (tx, payload, ctx): Promise<{ change_set_id: string; status: string }> => {
    const id = payload.changeset_id ?? generateUuidV7();
    const existing = await tx.query<{ status: string }>(
      'SELECT status FROM change_sets WHERE id = $1',
      [id],
    );
    if (existing.rows[0] !== undefined)
      return { change_set_id: id, status: existing.rows[0].status };
    const head = await lockTripPlan(tx, payload.trip_id);
    const base = assertCurrentBase(head, payload.base_version);
    const state = await loadPlanState(tx, base);
    const ops = withBefore(state, payload.ops);
    replay(state, changeSetOpsToEdits(ops));
    if (ops.some((op) => op.op !== 'add' && !state.items.some((i) => i.stable_id === op.target))) {
      throw new DomainError('VALIDATION', { reason: 'unknown_item' });
    }
    // As the member: RLS lets any member of the trip's crew propose, in their own name.
    await tx.query(
      `INSERT INTO change_sets (id, trip_id, base_version_id, trigger, author_kind, author_id, ops)
       VALUES ($1, $2, $3, $4, 'user', $5, $6)`,
      [id, payload.trip_id, base, payload.trigger, ctx.uid, JSON.stringify(ops)],
    );
    await appendDomainEvent(tx, {
      type: 'change_set.created',
      aggregateKind: 'change_set',
      aggregateId: id,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: { trip_id: payload.trip_id, change_set_id: id, source: payload.source },
      crewId: head.crewId,
      tripId: payload.trip_id,
    });
    await publishPlan(tx, payload.trip_id, PLAN_RT.changesetCreated, {
      change_set_id: id,
      author_id: ctx.uid,
      trigger: payload.trigger,
    });
    return { change_set_id: id, status: 'draft' };
  },
});
