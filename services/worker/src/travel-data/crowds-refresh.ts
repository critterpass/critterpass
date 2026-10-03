/**
 * `crowds.refresh` (docs/api-contracts-async.md §2.3, 03:00 SGT nightly). No hourly venue crowd
 * source is contracted, so the job fetches nothing; what it does every night is keep
 * `crowd_forecasts` honest: a bought or visit-derived weekly pattern older than 90 days is removed,
 * so the app falls back to the month curve rather than showing an old pattern as current. An
 * editorial typical week is not a forecast and does not age: the content factory replaces it and
 * ops approve it, so the purge leaves it alone. A future hourly source adds its fetch step here.
 */
import { withSystem } from '@cp/db';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../boss/define-job';

export const CROWD_PATTERN_MAX_AGE_DAYS = 90;

export async function expireCrowdPatterns(tx: pg.PoolClient, now: Date): Promise<number> {
  const result = await tx.query(
    `DELETE FROM crowd_forecasts
      WHERE source <> 'editorial'
        AND fetched_at < $1::timestamptz - make_interval(days => $2)`,
    [now, CROWD_PATTERN_MAX_AGE_DAYS],
  );
  return result.rowCount ?? 0;
}

export function crowdsRefreshJob(): AnyJobDefinition {
  return defineJob({
    queue: 'crowds.refresh',
    schema: z.object({}).nullish(),
    async handler(_data, { pool, logger }) {
      const expired = await withSystem(pool, (tx) => expireCrowdPatterns(tx, new Date()));
      logger.info({ expired }, 'crowd patterns refreshed');
      return { expired };
    },
  });
}
