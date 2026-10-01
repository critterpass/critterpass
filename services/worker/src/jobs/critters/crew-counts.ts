/**
 * `critter.crew_counts`: rewrites one member's `crew_collection_counts` rows ("Maya has 14") from
 * their verified finds, or deletes them all while they hide their collection. Triggers keep the
 * rows current on every find, revoke, `hide_collection` change and membership change; this job is
 * the repair path (and what ops runs after a backfill).
 */
import { withSystem } from '@cp/db';
import { CRITTER_QUEUES, crewCountsJobSchema } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

export async function refreshCrewCounts(pool: pg.Pool, userId: string): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query('SELECT app.refresh_crew_collection_counts($1)', [userId]),
  );
}

export function crewCountsJob(): AnyJobDefinition {
  return defineJob({
    queue: CRITTER_QUEUES.crewCounts,
    schema: crewCountsJobSchema,
    singletonKey: (data) => data.user_id,
    async handler(data, { pool }) {
      await refreshCrewCounts(pool, data.user_id);
    },
  });
}
