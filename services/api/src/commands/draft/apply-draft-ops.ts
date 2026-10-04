/**
 * `apply_draft_ops` (docs/api-contracts.md §4.6): the organiser changes her private draft by hand,
 * with the same edits as the crew's plan takes (add, move, resize, remove, reorder days), before
 * anyone else sees it. Each call lands as one new organiser-only draft. Allowed while the trip is
 * in set-up or draft review; refused while the guide is drafting or redrafting (its result would
 * land over the edit) and once the crew has a plan (`apply_plan_ops` edits that one). A stale base
 * answers `PLAN_VERSION_CONFLICT{latest}`, as a group edit does, so the client rebases the same way.
 */
import { applyDraftOpsPayloadSchema, DomainError, planOpsToEdits } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { draftChanged, lockTripDraft, writeDraftVersion } from '../../plan/draft-versioning';
import { assertLockRules } from '../../plan/lock-rules';
import { loadPlanState, replay } from '../../plan/versioning';
import { defineCommand } from '../_framework/define-command';
import { requireOrganiser } from './shared';
import { refreshNumbers } from './versions';

const EDITABLE = new Set(['setup', 'draft_review']);
const GUIDE_WORKING = new Set(['drafting', 'redrafting']);

export const applyDraftOpsCommand = defineCommand({
  name: 'apply_draft_ops',
  v: 1,
  schema: applyDraftOpsPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireOrganiser(tx, payload.trip_id);
  },
  handle: (tx, payload, ctx): Promise<{ version_id: string }> =>
    asSystemRole(tx, async () => {
      const head = await lockTripDraft(tx, payload.trip_id);
      if (head.currentVersionId !== null) {
        throw new DomainError('STATE_INVALID', { reason: 'plan_shared' });
      }
      if (GUIDE_WORKING.has(head.status)) {
        throw new DomainError('STATE_INVALID', { reason: 'draft_running', state: head.status });
      }
      if (!EDITABLE.has(head.status)) {
        throw new DomainError('STATE_INVALID', { reason: 'trip_status', state: head.status });
      }
      const base = head.draftVersionId;
      if (base === null) throw new DomainError('STATE_INVALID', { reason: 'no_plan' });
      if (base !== payload.base_version) {
        throw new DomainError('PLAN_VERSION_CONFLICT', { latest: base });
      }
      const state = await loadPlanState(tx, base);
      assertLockRules(state, payload.ops, payload.confirm_locked);
      const next = replay(state, planOpsToEdits(payload.ops));
      const versionId = await writeDraftVersion(tx, {
        head,
        baseVersionId: base,
        next,
        origin: 'hand',
      });
      // A draft the guide made carries numbers and must-do coverage: they follow her edit.
      const { rows } = await tx.query<{ members: number }>(
        `SELECT count(*)::int AS members FROM trip_participants
          WHERE trip_id = $1 AND rsvp NOT IN ('out', 'waitlisted')`,
        [head.tripId],
      );
      await refreshNumbers(tx, versionId, Math.max(1, rows[0]?.members ?? 1));
      await draftChanged(tx, {
        head,
        versionId,
        baseVersionId: base,
        opCount: payload.ops.length,
        actorId: ctx.uid,
      });
      return { version_id: versionId };
    }),
});
