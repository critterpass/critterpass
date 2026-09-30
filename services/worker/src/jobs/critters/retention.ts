/**
 * `critter.retention` (hourly): encounter samples live 7 days, encounter evidence 30 days
 * (its `expires_at`). Deleted in batches; the encounter rows and their outcomes stay.
 */
import { withSystem } from '@cp/db';
import { CRITTER_QUEUES } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

export const SAMPLE_RETENTION_DAYS = 7;
const BATCH = 5000;

async function drain(pool: pg.Pool, sql: string, params: unknown[]): Promise<number> {
  let total = 0;
  for (;;) {
    const deleted = await withSystem(
      pool,
      async (tx) => (await tx.query(sql, params)).rowCount ?? 0,
    );
    total += deleted;
    if (deleted < BATCH) return total;
  }
}

export async function purgeEncounterData(
  pool: pg.Pool,
  now: Date = new Date(),
): Promise<{ readonly samples: number; readonly evidence: number }> {
  const samples = await drain(
    pool,
    `DELETE FROM encounter_samples WHERE id = ANY (ARRAY(
       SELECT id FROM encounter_samples
        WHERE created_at < $1::timestamptz - make_interval(days => $2) LIMIT $3))`,
    [now, SAMPLE_RETENTION_DAYS, BATCH],
  );
  const evidence = await drain(
    pool,
    `DELETE FROM encounter_evidence WHERE encounter_id = ANY (ARRAY(
       SELECT encounter_id FROM encounter_evidence WHERE expires_at <= $1 LIMIT $2))`,
    [now, BATCH],
  );
  return { samples, evidence };
}

export function retentionJob(): AnyJobDefinition {
  return defineJob({
    queue: CRITTER_QUEUES.retention,
    schema: z.object({}).nullish(),
    async handler(_data, { pool }) {
      return { ...(await purgeEncounterData(pool)) };
    },
  });
}
