/**
 * `resolve_overlay_clash` (doc delta): the member keeps or drops personal changes the crew's plan
 * moved under. Keep re-bases them on the current version (a change to an item the crew removed
 * becomes the member's own item); drop retires them, and the crew's plan shows through again.
 */
import { changeSetOpsSchema, DomainError, resolveOverlayClashPayloadSchema } from '@cp/domain';

import { refreshBefore } from '../../plan/personal-apply';
import { loadPlanState } from '../../plan/versioning';
import { defineCommand } from '../_framework/define-command';

export const resolveOverlayClashCommand = defineCommand({
  name: 'resolve_overlay_clash',
  v: 1,
  schema: resolveOverlayClashPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    // As the member: only the owner's own rows exist for them.
    const { rowCount } = await tx.query('SELECT 1 FROM personal_plan_ops WHERE id = $1', [
      payload.personal_ops_id,
    ]);
    if (rowCount === 0) throw new DomainError('NOT_FOUND', { reason: 'personal_ops' });
  },
  handle: async (tx, payload): Promise<{ personal_ops_id: string; status: string }> => {
    const { rows } = await tx.query<{ trip_id: string; ops: unknown }>(
      'SELECT trip_id, ops FROM personal_plan_ops WHERE id = $1 FOR UPDATE',
      [payload.personal_ops_id],
    );
    const row = rows[0];
    if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'personal_ops' });
    if (!payload.keep) {
      await tx.query("UPDATE personal_plan_ops SET status = 'dropped' WHERE id = $1", [
        payload.personal_ops_id,
      ]);
      return { personal_ops_id: payload.personal_ops_id, status: 'dropped' };
    }
    const trip = await tx.query<{ current: string | null }>(
      'SELECT current_version_id AS current FROM trips WHERE id = $1',
      [row.trip_id],
    );
    const current = trip.rows[0]?.current ?? null;
    if (current === null) throw new DomainError('STATE_INVALID', { reason: 'no_plan' });
    const state = await loadPlanState(tx, current);
    const present = new Set(state.items.map((item) => item.stable_id));
    const ops = changeSetOpsSchema
      .parse(row.ops)
      .map((op) =>
        op.op === 'add' || op.op === 'remove' || present.has(op.target)
          ? op
          : { ...op, op: 'add' as const, after: { ...(op.before ?? {}), ...(op.after ?? {}) } },
      );
    await tx.query(
      "UPDATE personal_plan_ops SET ops = $2, base_version_id = $3, status = 'active' WHERE id = $1",
      [payload.personal_ops_id, JSON.stringify(refreshBefore(state, ops)), current],
    );
    return { personal_ops_id: payload.personal_ops_id, status: 'active' };
  },
});
