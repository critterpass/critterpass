/**
 * `undo_plan_edit` (doc delta, docs/api-contracts.md §4.6): an organiser takes back a plan edit of
 * their own, named by the `op_id` of the command that made it (`apply_plan_ops`, or
 * `apply_changeset` to the group). The plan as it was before that edit is written as a new current
 * version, so the history only ever grows and the crew hears about it like any other edit. It goes
 * through only while the edit's version is still the trip's current one: once anyone has changed
 * the plan since, there is nothing safe to put back (`STATE_INVALID{reason: plan_moved_on}`).
 *
 * The edit is looked up in the caller's own command outcomes (read as the caller, so nobody undoes
 * somebody else's edit), and an edit that moved a booking is never undone here.
 */
import { DomainError, undoPlanEditPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { requirePlanEditor } from '../../plan/access';
import { commitPlanVersion, loadPlanState, lockTripPlan } from '../../plan/versioning';
import { defineCommand } from '../_framework/define-command';

const UNDOABLE = ['apply_plan_ops', 'apply_changeset'];

export const undoPlanEditCommand = defineCommand({
  name: 'undo_plan_edit',
  v: 1,
  schema: undoPlanEditPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: (tx, payload) => requirePlanEditor(tx, payload.trip_id),
  handle: async (tx, payload, ctx): Promise<{ version_id: string }> => {
    const head = await lockTripPlan(tx, payload.trip_id);
    const made = await tx.query<{ version_id: string | null }>(
      `SELECT coalesce(result_ref->>'version_id', result_ref->>'result_version_id') AS version_id
         FROM cmd_results
        WHERE op_id = $1 AND uid = $2 AND status = 'applied' AND cmd = ANY($3::text[])`,
      [payload.op_id, ctx.uid, UNDOABLE],
    );
    const editVersion = made.rows[0]?.version_id ?? null;
    if (editVersion === null) throw new DomainError('NOT_FOUND', { reason: 'edit' });
    if (head.currentVersionId !== editVersion) {
      throw new DomainError('STATE_INVALID', { reason: 'plan_moved_on' });
    }
    const before = await asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ parent_id: string | null; booked: boolean }>(
        `SELECT v.parent_id,
                EXISTS (SELECT 1 FROM change_sets c, jsonb_array_elements(c.ops) AS op
                         WHERE c.result_version_id = v.id
                           AND coalesce((op->>'booking_impact')::boolean, false)
                           AND coalesce((op->>'accepted')::boolean, true)) AS booked
           FROM itinerary_versions v
          WHERE v.id = $1 AND v.trip_id = $2`,
        [editVersion, payload.trip_id],
      );
      return rows[0] ?? null;
    });
    if (before === null || before.parent_id === null) {
      throw new DomainError('NOT_FOUND', { reason: 'edit' });
    }
    if (before.booked) throw new DomainError('STATE_INVALID', { reason: 'booking_moved' });
    const versionId = await commitPlanVersion(tx, {
      head,
      baseVersionId: editVersion,
      next: await loadPlanState(tx, before.parent_id),
      actor: { kind: 'user', id: ctx.uid },
      source: 'ops',
      opCount: 1,
      ops: null,
    });
    // A stop the edit removed comes back with the translations it had.
    await asSystemRole(tx, () =>
      tx.query(
        `UPDATE plan_items n SET i18n = old.i18n
           FROM plan_items old
          WHERE n.version_id = $1 AND n.i18n IS NULL
            AND old.version_id = $2 AND old.stable_id = n.stable_id AND old.i18n IS NOT NULL`,
        [versionId, before.parent_id],
      ),
    );
    return { version_id: versionId };
  },
});
