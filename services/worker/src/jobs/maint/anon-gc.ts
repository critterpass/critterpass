/**
 * `maint.anon_gc` (docs/api-contracts-async.md §2.3, daily 04:00 UTC): deletes anonymous accounts
 * that have been inactive 90 days, belong to no crew and never purchased anything (the rule
 * services/api/src/auth/guards.ts#isAnonGcCandidate states; `app.anon_gc_is_candidate` evaluates it
 * in SQL because activity lives in the auth schema).
 *
 * Each account goes in its own transaction: every per-user row is removed through the merge-rule
 * registry (packages/db/src/merge-rules.ts, the same list an account merge walks), then
 * `app.anon_gc_finish` re-checks the rule under a row lock and deletes the account itself. An
 * account that still owns shared data (a crew it created, a trip seat, media) is left alone.
 */
import { listMergeRules, withSystem, type MergeRule } from '@cp/db';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition, type JobLogger } from '../../boss/define-job';

export const ANON_GC_INACTIVE_DAYS = 90;
export const ANON_GC_BATCH_SIZE = 200;

export type AnonGcOutcome = 'deleted' | 'kept_shared_data' | 'no_longer_candidate' | 'failed';

class NoLongerCandidate extends Error {}

/** Rules whose rows would be carried to another account on merge: data this purge must not drop. */
function holdsSharedData(rule: MergeRule): boolean {
  return rule.strategy === 'union' || rule.strategy === 'reassign';
}

async function purgeAccount(
  tx: pg.PoolClient,
  uid: string,
  inactiveDays: number,
): Promise<Exclude<AnonGcOutcome, 'failed' | 'no_longer_candidate'>> {
  // Names come only from the compiled-in merge registry, never from input.
  for (const rule of listMergeRules()) {
    if (!holdsSharedData(rule)) continue;
    const { rows } = await tx.query<{ found: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM public."${rule.table}" WHERE "${rule.userColumn}" = $1) AS found`,
      [uid],
    );
    if (rows[0]?.found === true) return 'kept_shared_data';
  }
  for (const rule of listMergeRules()) {
    if (holdsSharedData(rule)) continue;
    if (rule.viaFunction !== undefined) {
      await tx.query(`SELECT app.${rule.viaFunction}($1)`, [uid]);
    } else {
      await tx.query(`DELETE FROM public."${rule.table}" WHERE "${rule.userColumn}" = $1`, [uid]);
    }
  }
  const { rows } = await tx.query<{ finished: boolean }>(
    'SELECT app.anon_gc_finish($1, make_interval(days => $2)) AS finished',
    [uid, inactiveDays],
  );
  if (rows[0]?.finished !== true) throw new NoLongerCandidate(uid);
  return 'deleted';
}

export interface AnonGcReport {
  readonly deleted: number;
  readonly kept: number;
  readonly failed: number;
}

/** Deletes every current candidate (up to `limit` per run); never throws for one bad account. */
export async function collectAnonymousAccounts(
  pool: pg.Pool,
  logger: JobLogger,
  options: { readonly inactiveDays?: number; readonly limit?: number } = {},
): Promise<AnonGcReport> {
  const inactiveDays = options.inactiveDays ?? ANON_GC_INACTIVE_DAYS;
  const candidates = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      'SELECT id::text AS id FROM app.anon_gc_candidates(make_interval(days => $1), $2) AS id',
      [inactiveDays, options.limit ?? ANON_GC_BATCH_SIZE],
    );
    return rows.map((row) => row.id);
  });

  const counts = { deleted: 0, kept: 0, failed: 0 };
  for (const uid of candidates) {
    let outcome: AnonGcOutcome;
    try {
      outcome = await withSystem(pool, (tx) => purgeAccount(tx, uid, inactiveDays));
    } catch (error) {
      outcome = error instanceof NoLongerCandidate ? 'no_longer_candidate' : 'failed';
      if (outcome === 'failed') logger.error({ user_id: uid, err: error }, 'anonymous gc failed');
    }
    if (outcome === 'deleted') counts.deleted += 1;
    else if (outcome === 'failed') counts.failed += 1;
    else counts.kept += 1;
  }
  return counts;
}

export function anonGcJob(): AnyJobDefinition {
  return defineJob({
    queue: 'maint.anon_gc',
    schema: z.object({}).nullish(),
    async handler(_data, { pool, logger }) {
      const report = await collectAnonymousAccounts(pool, logger);
      logger.info({ ...report }, 'anonymous account gc finished');
      return { ...report };
    },
  });
}
