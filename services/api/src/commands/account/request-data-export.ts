/**
 * `request_data_export` (3n-6 "Download my data", docs/api-contracts.md §4.1): queues the build of
 * a zip of the caller's own data. One export may be in flight at a time and one may be asked for a
 * day (a failed one does not count); a replay of the same export id is a no-op. The worker's
 * `export.build` writes the zip and tells the owner when it is ready.
 */
import { appendDomainEvent, sendInTx } from '@cp/db';
import {
  ACCOUNT_QUEUES,
  DomainError,
  exportCooldownUntil,
  requestDataExportPayloadSchema,
  type ExportBuildJob,
  type RequestDataExportResult,
} from '@cp/domain';

import { defineCommand } from '../_framework/define-command';

export const requestDataExportCommand = defineCommand({
  name: 'request_data_export',
  v: 1,
  schema: requestDataExportPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx): Promise<RequestDataExportResult> => {
    const mine = await tx.query<{ user_id: string }>(
      'SELECT user_id FROM data_exports WHERE id = $1',
      [payload.export_id],
    );
    const replay = mine.rows[0];
    if (replay !== undefined) {
      if (replay.user_id !== ctx.uid) throw new DomainError('FORBIDDEN', { reason: 'foreign_id' });
      return { export_id: payload.export_id };
    }
    const recent = await tx.query<{ status: string; requested_at: Date }>(
      `SELECT status, requested_at FROM data_exports
        WHERE user_id = $1 AND status <> 'failed'
        ORDER BY requested_at DESC LIMIT 1`,
      [ctx.uid],
    );
    const last = recent.rows[0];
    if (last !== undefined && (last.status === 'queued' || last.status === 'building')) {
      throw new DomainError('STATE_INVALID', { reason: 'export_in_progress' });
    }
    if (last !== undefined) {
      const until = exportCooldownUntil(last.requested_at);
      if (until.getTime() > ctx.clock.serverNow.getTime()) {
        throw new DomainError('STATE_INVALID', {
          reason: 'export_cooldown',
          until: until.toISOString(),
        });
      }
    }
    await tx.query(
      `INSERT INTO data_exports (id, user_id, status, requested_at) VALUES ($1, $2, 'queued', $3)`,
      [payload.export_id, ctx.uid, ctx.clock.serverNow],
    );
    const job: ExportBuildJob = { export_id: payload.export_id };
    await sendInTx(tx, ACCOUNT_QUEUES.exportBuild, job, { singletonKey: payload.export_id });
    await appendDomainEvent(tx, {
      type: 'data_export.requested',
      aggregateKind: 'user',
      aggregateId: ctx.uid,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: { user_id: ctx.uid, export_id: payload.export_id },
    });
    return { export_id: payload.export_id };
  },
});
