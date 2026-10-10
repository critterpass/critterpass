/**
 * `apply_check_fix {issue_id, base_version}` (docs/api-contracts-planning.md, commands): one FIX
 * from the plan check. The fix's ops are worked out on the current plan (a one-tap fix carries
 * them; Too far swaps a stop for a nearer place of its kind). An organiser's fix (or anyone's, on a
 * trip whose rule lets members edit) applies at once with an undo from the trip feed; a member's
 * goes to the crew as a change set, trigger `check`.
 * An issue checked on an older plan than the one now (or than the caller saw) is stale. The fix is
 * timed on real travel before it is applied: one that would leave the stop it moves in a clash is
 * refused (`fix_would_clash`), so a fix never ships a new clash.
 */
import { applyCheckFixPayloadSchema, DomainError, type ApplyCheckFixResult } from '@cp/domain';

import { planRightsOf, tripAccess } from '../../plan/access';
import { lockTripPlan } from '../../plan/versioning';
import { loadCheckInput, type FixerDeps } from '../../planning/fixers/check-input';
import { fixForIssue, readIssue } from '../../planning/fixers/fix-ops';
import { roadsOf } from '../../planning/fixers/road-timed';
import { defineCommand } from '../_framework/define-command';
import { createChangesetCommand } from '../changesets/create';
import { sendChangesetCommand } from '../changesets/send';
import { applyWithUndo } from './apply-with-undo';

export function applyCheckFixCommand(deps: FixerDeps) {
  return defineCommand({
    name: 'apply_check_fix',
    v: 1,
    schema: applyCheckFixPayloadSchema,
    offline: true,
    allowAnonymous: true,
    authorize: async (tx, payload) => {
      const issue = await readIssue(tx, payload.issue_id);
      if (!(await tripAccess(tx, issue.trip_id)).member) {
        throw new DomainError('NOT_FOUND', { reason: 'issue' });
      }
    },
    handle: async (tx, payload, ctx): Promise<ApplyCheckFixResult> => {
      const issue = await readIssue(tx, payload.issue_id);
      const head = await lockTripPlan(tx, issue.trip_id);
      if (head.currentVersionId !== issue.version_id || payload.base_version !== issue.version_id) {
        throw new DomainError('STATE_INVALID', { reason: 'stale_issue' });
      }
      const check = await loadCheckInput(tx, issue.trip_id, undefined, deps);
      if (issue.fix === null || issue.fix.kind === 'none') {
        throw new DomainError('STATE_INVALID', { reason: 'no_fix' });
      }
      // Timed on real travel first: a fix that would leave the stop it moves in a clash is refused.
      const fix = await fixForIssue(tx, issue, check, roadsOf(check, deps), { screens: false });
      if (fix === null) {
        const reason = issue.fix.kind === 'apply' ? 'fix_would_clash' : 'no_fix';
        throw new DomainError('STATE_INVALID', { reason });
      }
      const { ops } = fix;
      const created = await createChangesetCommand.handle(
        tx,
        {
          trip_id: issue.trip_id,
          base_version: issue.version_id,
          ops: [...ops],
          source: 'user',
          trigger: 'check',
        },
        ctx,
      );
      if ((await planRightsOf(tx, issue.trip_id)).direct) {
        const actionId = await applyWithUndo(tx, {
          changeSetId: created.change_set_id,
          uid: ctx.uid,
          now: ctx.clock.serverNow,
        });
        return { applied: true, guide_action_id: actionId };
      }
      await sendChangesetCommand.handle(tx, { changeset_id: created.change_set_id }, ctx);
      return { applied: false, change_set_id: created.change_set_id };
    },
  });
}
