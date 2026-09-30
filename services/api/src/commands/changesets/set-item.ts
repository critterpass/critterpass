/**
 * `set_changeset_item` (docs/api-contracts.md §4.6): the author flips one change on the review
 * screen before sending. A rejected change never applies; a set with every change off cannot be
 * sent.
 */
import { appendDomainEvent } from '@cp/db';
import { DomainError, PLAN_RT, setChangesetItemPayloadSchema } from '@cp/domain';

import { lockChangeSet, publishPlan, requireVisibleChangeSet } from '../../plan/changeset-store';
import { defineCommand } from '../_framework/define-command';

export const setChangesetItemCommand = defineCommand({
  name: 'set_changeset_item',
  v: 1,
  schema: setChangesetItemPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireVisibleChangeSet(tx, payload.changeset_id);
    const row = await lockChangeSet(tx, payload.changeset_id);
    if (row.author_id !== ctx.uid) throw new DomainError('FORBIDDEN', { reason: 'author_only' });
  },
  handle: async (tx, payload, ctx): Promise<{ change_set_id: string; accepted: boolean }> => {
    const row = await lockChangeSet(tx, payload.changeset_id);
    if (row.status !== 'draft' && row.status !== 'proposed') {
      throw new DomainError('STATE_INVALID', { state: row.status });
    }
    if (!row.ops.some((op) => op.target === payload.change_id)) {
      throw new DomainError('NOT_FOUND', { reason: 'change' });
    }
    const ops = row.ops.map((op) =>
      op.target === payload.change_id ? { ...op, accepted: payload.accepted } : op,
    );
    // As the author: RLS lets the author update their own change set.
    await tx.query('UPDATE change_sets SET ops = $2 WHERE id = $1', [row.id, JSON.stringify(ops)]);
    await appendDomainEvent(tx, {
      type: 'change_set.item_toggled',
      aggregateKind: 'change_set',
      aggregateId: row.id,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: {
        trip_id: row.trip_id,
        change_set_id: row.id,
        target: payload.change_id,
        accepted: payload.accepted,
      },
      crewId: row.crew_id,
      tripId: row.trip_id,
    });
    await publishPlan(tx, row.trip_id, PLAN_RT.changesetToggled, {
      change_set_id: row.id,
      change_id: payload.change_id,
      accepted: payload.accepted,
    });
    return { change_set_id: row.id, accepted: payload.accepted };
  },
});
