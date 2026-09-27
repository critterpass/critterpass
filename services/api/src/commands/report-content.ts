/**
 * `report_content {kind, id, reason}` (docs/api-contracts.md §4.17): any user, anonymous included,
 * reports a subject of a registered moderation kind. Up to 20 reports per user per rolling 24 h; a
 * subject that already has an open report from the last 24 h collapses into it. The report itself is
 * filed as app_system (collapsing updates a row the reporter can never read back).
 */
import {
  DomainError,
  REPORT_DAILY_LIMIT,
  reportContentPayloadSchema,
  type ReportContentResult,
} from '@cp/domain';

import { asSystemRole } from '../admin/command';
import { moderationKind, recordModerationReport } from '../admin/moderation-intake';
import { defineCommand } from './_framework/define-command';

export const reportContentCommand = defineCommand({
  name: 'report_content',
  v: 1,
  schema: reportContentPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: (_tx, payload, ctx) => {
    if (moderationKind(payload.kind) === undefined) {
      throw new DomainError('VALIDATION', { reason: 'unknown_kind', kind: payload.kind });
    }
    if (payload.kind === 'user' && payload.id === ctx.uid) {
      throw new DomainError('VALIDATION', { reason: 'self_report' });
    }
    return Promise.resolve();
  },
  handle: (tx, payload, ctx): Promise<ReportContentResult> =>
    asSystemRole(tx, async () => {
      const handler = moderationKind(payload.kind);
      if (handler === undefined || !(await handler.exists(tx, payload.id))) {
        throw new DomainError('NOT_FOUND');
      }
      const { rows } = await tx.query<{ filed: number; oldest: Date | null }>(
        `SELECT count(*)::int AS filed, min(filed_at) AS oldest FROM ops.moderation_filings
         WHERE reporter_id = $1 AND filed_at > now() - interval '24 hours'`,
        [ctx.uid],
      );
      const recent = rows[0];
      if (recent !== undefined && recent.filed >= REPORT_DAILY_LIMIT) {
        const freesAt = (recent.oldest?.getTime() ?? Date.now()) + 24 * 60 * 60 * 1000;
        throw new DomainError('RATE_LIMITED', {
          retry_after_s: Math.max(1, Math.ceil((freesAt - Date.now()) / 1000)),
        });
      }
      return recordModerationReport(tx, {
        kind: payload.kind,
        id: payload.id,
        reason: payload.reason,
        source: 'user',
        reporterId: ctx.uid,
      });
    }),
});
