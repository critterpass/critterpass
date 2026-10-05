/**
 * `apply_draft_check_fix {issue_id, base_version}`: one FIX from the plan check on the organiser's
 * private draft, before the crew has a plan. The fix is the same one the crew's plan would get
 * (a one-tap move, or the too-far swap worked out now), timed on real travel first, and it lands
 * through the draft's own edit path: one new organiser-only draft with origin `hand` and a
 * `draft.ops_applied` event, so the history row, the way back to the draft before it, the legs and
 * the check behave exactly as after an edit she made by hand. Organisers only. Refused while the
 * guide is drafting or redrafting and once the crew has a plan (`apply_check_fix` fixes that one).
 */
import { applyCheckFixPayloadSchema, changeSetOpsToEdits, DomainError } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { draftChanged, lockTripDraft, writeDraftVersion } from '../../plan/draft-versioning';
import { loadPlanState, replay } from '../../plan/versioning';
import { loadCheckInput, type FixerDeps } from '../../planning/fixers/check-input';
import { fixForIssue, readIssue } from '../../planning/fixers/fix-ops';
import { roadsOf } from '../../planning/fixers/road-timed';
import { defineCommand } from '../_framework/define-command';
import { requireOrganiser } from '../draft/shared';
import { refreshNumbers } from '../draft/versions';

const EDITABLE = new Set(['setup', 'draft_review']);
const GUIDE_WORKING = new Set(['drafting', 'redrafting']);

export interface ApplyDraftCheckFixResult {
  readonly applied: true;
  /** The new draft the fix made. */
  readonly version_id: string;
}

export function applyDraftCheckFixCommand(deps: FixerDeps) {
  return defineCommand({
    name: 'apply_draft_check_fix',
    v: 1,
    schema: applyCheckFixPayloadSchema,
    offline: true,
    allowAnonymous: true,
    authorize: async (tx, payload) => {
      const issue = await readIssue(tx, payload.issue_id);
      await requireOrganiser(tx, issue.trip_id);
    },
    handle: async (tx, payload, ctx): Promise<ApplyDraftCheckFixResult> => {
      const issue = await readIssue(tx, payload.issue_id);
      const head = await asSystemRole(tx, () => lockTripDraft(tx, issue.trip_id));
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
      if (base === null || base !== issue.version_id || payload.base_version !== base) {
        throw new DomainError('STATE_INVALID', { reason: 'stale_issue' });
      }
      if (issue.fix === null || issue.fix.kind === 'none') {
        throw new DomainError('STATE_INVALID', { reason: 'no_fix' });
      }
      // As the organiser: the check input is the plan she sees, which is this draft.
      const check = await loadCheckInput(tx, issue.trip_id, undefined, deps);
      const fix = await fixForIssue(tx, issue, check, roadsOf(check, deps), { screens: false });
      if (fix === null) {
        const reason = issue.fix.kind === 'apply' ? 'fix_would_clash' : 'no_fix';
        throw new DomainError('STATE_INVALID', { reason });
      }
      return asSystemRole(tx, async () => {
        const state = await loadPlanState(tx, base);
        const next = replay(state, changeSetOpsToEdits(fix.ops));
        const versionId = await writeDraftVersion(tx, {
          head,
          baseVersionId: base,
          next,
          origin: 'hand',
        });
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
          opCount: fix.ops.length,
          actorId: ctx.uid,
        });
        return { applied: true as const, version_id: versionId };
      });
    },
  });
}
