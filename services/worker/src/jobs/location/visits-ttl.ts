/**
 * `visits.ttl` (hourly): POI visits live as long as their trip plus 30 days. Once a trip is
 * archived (or cancelled) its visits get `expires_at` = now + 30 days; visits past `expires_at`
 * are deleted in batches. Quest and award outcomes built from them are kept on their own rows.
 */
import { withSystem } from '@cp/db';
import { VISIT_TTL_AFTER_ARCHIVE_DAYS } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

export const VISITS_TTL_BATCH = 5000;

export interface VisitsTtlReport {
  readonly scheduled: number;
  readonly deleted: number;
}

export async function expireVisits(
  pool: pg.Pool,
  options: { readonly now?: Date; readonly batchSize?: number; readonly signal?: AbortSignal } = {},
): Promise<VisitsTtlReport> {
  const now = (options.now ?? new Date()).toISOString();
  const batchSize = options.batchSize ?? VISITS_TTL_BATCH;
  const scheduled = await withSystem(pool, async (tx) => {
    const result = await tx.query(
      `UPDATE visits v SET expires_at = $1::timestamptz + make_interval(days => $2)
       FROM trips t
       WHERE t.id = v.trip_id AND v.expires_at IS NULL AND t.status IN ('archived', 'cancelled')`,
      [now, VISIT_TTL_AFTER_ARCHIVE_DAYS],
    );
    return result.rowCount ?? 0;
  });
  let deleted = 0;
  for (;;) {
    const batch = await withSystem(pool, async (tx) => {
      const result = await tx.query(
        `DELETE FROM visits WHERE id = ANY (ARRAY(
           SELECT id FROM visits WHERE expires_at IS NOT NULL AND expires_at <= $1::timestamptz
           LIMIT $2))`,
        [now, batchSize],
      );
      return result.rowCount ?? 0;
    });
    deleted += batch;
    if (batch < batchSize || options.signal?.aborted === true) break;
  }
  return { scheduled, deleted };
}

export function visitsTtlJob(): AnyJobDefinition {
  return defineJob({
    queue: 'visits.ttl',
    schema: z.object({}).nullish(),
    async handler(_data, { pool, job }) {
      const report = await expireVisits(pool, { signal: job.signal });
      return { ...report };
    },
  });
}
