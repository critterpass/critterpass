/**
 * `location.fixes_ttl` (every minute): live fixes are for the moment, not a trail. A fix older than
 * 15 minutes is deleted, except for an SOS share: while it is open, and for 24 hours after it
 * resolves, its fixes stay for the responders' follow-up. Deletes in batches, one short
 * transaction each.
 */
import { withSystem } from '@cp/db';
import { LOCATION_FIX_TTL_MS, SOS_FIX_RETENTION_MS } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

export const FIXES_TTL_BATCH = 5000;

function deleteBatch(pool: pg.Pool, now: Date, limit: number): Promise<number> {
  return withSystem(pool, async (tx) => {
    const result = await tx.query(
      `DELETE FROM location_fixes WHERE id = ANY (ARRAY(
         SELECT f.id FROM location_fixes f JOIN location_shares s ON s.id = f.share_id
         WHERE f.at < $1::timestamptz - make_interval(secs => $2 / 1000.0)
           AND NOT (s.reason = 'sos'
             AND (s.ends_at IS NULL OR s.ends_at > $1::timestamptz - make_interval(secs => $3 / 1000.0)))
         LIMIT $4))`,
      [now.toISOString(), LOCATION_FIX_TTL_MS, SOS_FIX_RETENTION_MS, limit],
    );
    return result.rowCount ?? 0;
  });
}

/** Deletes every expired fix as of `now`; returns how many went. */
export async function purgeExpiredFixes(
  pool: pg.Pool,
  options: { readonly now?: Date; readonly batchSize?: number; readonly signal?: AbortSignal } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? FIXES_TTL_BATCH;
  let total = 0;
  for (;;) {
    const deleted = await deleteBatch(pool, now, batchSize);
    total += deleted;
    if (deleted < batchSize || options.signal?.aborted === true) return total;
  }
}

export function fixesTtlJob(): AnyJobDefinition {
  return defineJob({
    queue: 'location.fixes_ttl',
    schema: z.object({}).nullish(),
    async handler(_data, { pool, job }) {
      const deleted = await purgeExpiredFixes(pool, { signal: job.signal });
      return { deleted };
    },
  });
}
