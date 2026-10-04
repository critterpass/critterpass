/**
 * `keep_check_issue {issue_id, base_version}` (docs/api-contracts-planning.md, commands): an
 * organiser turns a plan check fix down ("Keep it as it is"). The issue leaves the list and the
 * counts at once and a quiet mark is kept on the trip's check, so the job leaves that issue on
 * those stops out until the stops around them change. A member's "keep" is theirs alone and never
 * reaches here; an issue from an older plan is stale.
 */
import { outbox } from '@cp/db';
import {
  channelName,
  DomainError,
  keepCheckIssuePayloadSchema,
  PLAN_CHECK_QUIET_MAX,
  PLANNING_RT,
  type KeepCheckIssueResult,
  type PlanCheckQuiet,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { tripAccess } from '../../plan/access';
import { lockTripPlan } from '../../plan/versioning';
import { readIssue } from '../../planning/fixers/fix-ops';
import { defineCommand } from '../_framework/define-command';

interface IssueSubject {
  readonly kind: PlanCheckQuiet['kind'];
  readonly severity: 'fix' | 'know';
  readonly stable_ids: string[];
  readonly day_no: number | null;
  readonly booking_id: string | null;
}

export const keepCheckIssueCommand = defineCommand({
  name: 'keep_check_issue',
  v: 1,
  schema: keepCheckIssuePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const issue = await readIssue(tx, payload.issue_id);
    const access = await tripAccess(tx, issue.trip_id);
    if (!access.member) throw new DomainError('NOT_FOUND', { reason: 'issue' });
    if (!access.organiser) throw new DomainError('FORBIDDEN', { reason: 'organiser_only' });
  },
  handle: async (tx, payload, ctx): Promise<KeepCheckIssueResult> => {
    const issue = await readIssue(tx, payload.issue_id);
    const head = await lockTripPlan(tx, issue.trip_id);
    if (head.currentVersionId !== issue.version_id || payload.base_version !== issue.version_id) {
      throw new DomainError('STATE_INVALID', { reason: 'stale_issue' });
    }
    return asSystemRole(tx, async () => {
      const { rows: gone } = await tx.query<IssueSubject>(
        `DELETE FROM plan_check_issues c WHERE c.id = $1
         RETURNING c.kind, c.severity, c.stable_ids,
                   (SELECT d.day_no FROM plan_days d WHERE d.id = c.day_id) AS day_no,
                   CASE WHEN c.kind = 'booking_note' THEN c.params->>'booking_id' END AS booking_id`,
        [issue.id],
      );
      const subject = gone[0];
      if (subject === undefined) throw new DomainError('NOT_FOUND', { reason: 'issue' });
      const mark: PlanCheckQuiet = {
        kind: subject.kind,
        stable_ids: subject.stable_ids,
        day_no: subject.stable_ids.length > 0 ? null : subject.day_no,
        booking_id: subject.booking_id,
        around: null,
        by: ctx.uid,
        at: ctx.clock.serverNow.toISOString(),
      };
      const fix = subject.severity === 'fix' ? 1 : 0;
      const { rows } = await tx.query<{ fix_count: number; know_count: number }>(
        `INSERT INTO plan_checks AS c (trip_id, version_id, quiet) VALUES ($1, $2, jsonb_build_array($3::jsonb))
         ON CONFLICT (trip_id) DO UPDATE
           SET quiet = (SELECT coalesce(jsonb_agg(kept.mark ORDER BY kept.n), '[]'::jsonb)
                          FROM (SELECT mark, n FROM jsonb_array_elements(c.quiet || $3::jsonb)
                                         WITH ORDINALITY AS marks (mark, n)
                                 ORDER BY n DESC LIMIT $6) kept),
               fix_count = greatest(c.fix_count - $4, 0),
               know_count = greatest(c.know_count - $5, 0)
         RETURNING fix_count, know_count`,
        [issue.trip_id, issue.version_id, JSON.stringify(mark), fix, 1 - fix, PLAN_CHECK_QUIET_MAX],
      );
      const counts = rows[0] ?? { fix_count: 0, know_count: 0 };
      await outbox(tx, channelName('trip_plan', issue.trip_id), PLANNING_RT.checkUpdated, {
        version: issue.version_id,
        fix_count: counts.fix_count,
        know_count: counts.know_count,
      });
      return { issue_id: issue.id, ...counts };
    });
  },
});
