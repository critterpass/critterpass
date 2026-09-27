/**
 * `sched.enqueue_due` (docs/api-contracts-async.md §2.3), every minute: turns due `scheduled_events`
 * rows into jobs on their `kind` queue. Rows are claimed with `FOR UPDATE SKIP LOCKED`, and each
 * job is inserted by the same transaction that marks its row `enqueued`, so a timer fires exactly
 * once however many workers race. A row whose queue does not exist (or whose send fails) is marked
 * `failed` with the reason instead of blocking every timer behind it.
 */
import { jobTxDatabase, withSystem, type ScheduledJobData } from '@cp/db';
import type pg from 'pg';
import type { PgBoss } from 'pg-boss';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition, type JobLogger } from '../../boss/define-job';

export const ENQUEUE_DUE_BATCH_SIZE = 500;

interface DueRow {
  readonly id: string;
  readonly kind: string;
  readonly ref_id: string;
  readonly slot: string;
  readonly due_at: Date;
  readonly data: Record<string, unknown>;
}

const CLAIM_SQL = `
  SELECT id::text AS id, kind, ref_id::text AS ref_id, slot, due_at, data
  FROM scheduled_events
  WHERE status = 'pending' AND due_at <= now()
  ORDER BY due_at, id
  LIMIT $1
  FOR UPDATE SKIP LOCKED`;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fireOne(
  tx: pg.PoolClient,
  boss: Pick<PgBoss, 'send'>,
  row: DueRow,
  logger: JobLogger,
): Promise<boolean> {
  const data: ScheduledJobData = {
    scheduled_event_id: row.id,
    ref_id: row.ref_id,
    slot: row.slot,
    due_at: row.due_at.toISOString(),
    data: row.data,
  };
  await tx.query('SAVEPOINT fire_timer');
  try {
    const jobId = await boss.send(row.kind, data, {
      db: jobTxDatabase(tx),
      singletonKey: `timer:${row.id}`,
    });
    await tx.query(
      `UPDATE scheduled_events SET status = 'enqueued', pgboss_job_id = $2, fired_at = now()
       WHERE id = $1`,
      [row.id, jobId],
    );
    await tx.query('RELEASE SAVEPOINT fire_timer');
    return true;
  } catch (error) {
    await tx.query('ROLLBACK TO SAVEPOINT fire_timer');
    await tx.query(`UPDATE scheduled_events SET status = 'failed', error = $2 WHERE id = $1`, [
      row.id,
      messageOf(error).slice(0, 500),
    ]);
    logger.error({ scheduled_event_id: row.id, kind: row.kind, err: error }, 'timer not fired');
    return false;
  }
}

export interface EnqueueDueResult {
  readonly fired: number;
  readonly failed: number;
}

/** Fires every due timer, batch by batch, until none is left unclaimed. */
export async function enqueueDue(
  pool: pg.Pool,
  boss: Pick<PgBoss, 'send'>,
  logger: JobLogger,
  batchSize: number = ENQUEUE_DUE_BATCH_SIZE,
): Promise<EnqueueDueResult> {
  let fired = 0;
  let failed = 0;
  for (;;) {
    const claimed = await withSystem(pool, async (tx) => {
      const { rows } = await tx.query<DueRow>(CLAIM_SQL, [batchSize]);
      for (const row of rows) {
        if (await fireOne(tx, boss, row, logger)) fired += 1;
        else failed += 1;
      }
      return rows.length;
    });
    if (claimed < batchSize) return { fired, failed };
  }
}

export function enqueueDueJob(): AnyJobDefinition {
  return defineJob({
    queue: 'sched.enqueue_due',
    schema: z.object({}).nullish(),
    handler: async (_data, { pool, boss, logger }) => ({
      ...(await enqueueDue(pool, boss, logger)),
    }),
  });
}
