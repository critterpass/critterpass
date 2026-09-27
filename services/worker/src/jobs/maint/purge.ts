/**
 * `maint.purge` (docs/api-contracts-async.md §2.3, daily 03:30 SGT): applies every retention rule
 * (./retention-rules.ts) in batches of at most 5000 rows, each batch its own short transaction, so
 * the purge never holds long locks or bloats one transaction. A rule whose table does not exist yet
 * is skipped.
 */
import { withSystem } from '@cp/db';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';
import { listRetentionRules, type RetentionRule } from './retention-rules';

export const PURGE_BATCH_SIZE = 5000;

export interface PurgeTableReport {
  readonly table: string;
  readonly deleted: number;
  /** Rows deleted by each batch, in order. */
  readonly batches: readonly number[];
  readonly skipped?: 'missing_table';
}

async function tableExists(pool: pg.Pool, table: string): Promise<boolean> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ found: boolean }>(
      "SELECT to_regclass(format('public.%I', $1::text)) IS NOT NULL AS found",
      [table],
    );
    return rows[0]?.found === true;
  });
}

function deleteBatch(pool: pg.Pool, rule: RetentionRule, limit: number): Promise<number> {
  return withSystem(pool, async (tx) => {
    if (rule.kind === 'function') {
      const { rows } = await tx.query<{ deleted: number }>(
        'SELECT app.purge_expired($1, make_interval(days => $2), $3) AS deleted',
        [rule.table, rule.ttlDays, limit],
      );
      return rows[0]?.deleted ?? 0;
    }
    // Table, column and predicate are static registry values checked at registration.
    const where = rule.where === undefined ? '' : ` AND (${rule.where})`;
    const result = await tx.query(
      `DELETE FROM public."${rule.table}" WHERE ctid = ANY (ARRAY(
         SELECT ctid FROM public."${rule.table}"
         WHERE "${rule.column}" < now() - make_interval(days => $1)${where}
         LIMIT $2))`,
      [rule.ttlDays, limit],
    );
    return result.rowCount ?? 0;
  });
}

/** Purges every rule's expired rows; stops early (between batches) when `signal` aborts. */
export async function purgeExpired(
  pool: pg.Pool,
  options: {
    readonly rules?: readonly RetentionRule[];
    readonly batchSize?: number;
    readonly signal?: AbortSignal;
  } = {},
): Promise<PurgeTableReport[]> {
  const batchSize = Math.min(options.batchSize ?? PURGE_BATCH_SIZE, PURGE_BATCH_SIZE);
  const reports: PurgeTableReport[] = [];
  for (const rule of options.rules ?? listRetentionRules()) {
    if (options.signal?.aborted) break;
    if (!(await tableExists(pool, rule.table))) {
      reports.push({ table: rule.table, deleted: 0, batches: [], skipped: 'missing_table' });
      continue;
    }
    const batches: number[] = [];
    for (;;) {
      const deleted = await deleteBatch(pool, rule, batchSize);
      if (deleted > 0) batches.push(deleted);
      if (deleted < batchSize || options.signal?.aborted) break;
    }
    reports.push({ table: rule.table, deleted: batches.reduce((a, b) => a + b, 0), batches });
  }
  return reports;
}

export function purgeJob(): AnyJobDefinition {
  return defineJob({
    queue: 'maint.purge',
    schema: z.object({}).nullish(),
    async handler(_data, { pool, logger, job }) {
      const reports = await purgeExpired(pool, { signal: job.signal });
      const deleted = Object.fromEntries(reports.map((report) => [report.table, report.deleted]));
      logger.info({ deleted }, 'retention purge finished');
      return { deleted };
    },
  });
}
