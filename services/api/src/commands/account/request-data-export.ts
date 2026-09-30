/**
 * `request_data_export` (3n-6 "Download my data", docs/api-contracts.md §4.1): queues one export
 * of the caller's own data. One in flight at a time (`STATE_INVALID {reason: export_in_progress,
 * export_id}`) and one a day (`STATE_INVALID {reason: export_cooldown, next_at}`); a failed build
 * does not count toward the day.
 */
import { appendDomainEvent, sendInTx } from '@cp/db';
import {
  ACCOUNT_QUEUES,
  DomainError,
  EXPORT_COOLDOWN_HOURS,
  generateUuidV7,
  requestDataExportPayloadSchema,
  type DataExportResult,
  type ExportBuildJob,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

export const requestDataExportCommand = defineCommand({
  name: 'request_data_export',
  v: 1,
  schema: requestDataExportPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx): Promise<DataExportResult> =>
    asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ id: string; status: string; requested_at: Date }>(
        `SELECT id, status, requested_at FROM data_exports
          WHERE user_id = $1 AND status <> 'failed' ORDER BY requested_at DESC LIMIT 1 FOR UPDATE`,
        [ctx.uid],
      );
      const last = rows[0];
      if (last?.status === 'queued' || last?.status === 'building') {
        throw new DomainError('STATE_INVALID', {
          reason: 'export_in_progress',
          export_id: last.id,
        });
      }
      if (last !== undefined) {
        const nextAt = new Date(last.requested_at.getTime() + EXPORT_COOLDOWN_HOURS * 3_600_000);
        if (nextAt.getTime() > ctx.clock.serverNow.getTime()) {
          throw new DomainError('STATE_INVALID', {
            reason: 'export_cooldown',
            next_at: nextAt.toISOString(),
          });
        }
      }
      const exportId = payload.export_id ?? generateUuidV7();
      await tx.query('INSERT INTO data_exports (id, user_id) VALUES ($1, $2)', [exportId, ctx.uid]);
      const job: ExportBuildJob = { export_id: exportId };
      await sendInTx(tx, ACCOUNT_QUEUES.exportBuild, job, { singletonKey: exportId });
      await appendDomainEvent(tx, {
        type: 'account.export_requested',
        aggregateKind: 'user',
        aggregateId: ctx.uid,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { user_id: ctx.uid, export_id: exportId },
      });
      return { export_id: exportId, status: 'queued' };
    }),
});
