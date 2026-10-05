/**
 * Moves the rows that already name a merged place to the kept one (`follow-merges.ts`): the stops,
 * must-dos, ideas, saves and answers written before a places release merged their record. A
 * places release does this itself when it is published; run this once for the rows it left
 * behind, from anywhere that reaches the database:
 *
 *   railway run --service worker --environment staging -- \
 *     pnpm --filter @cp/worker exec tsx src/content/follow-merges-cli.ts [--dry-run]
 *
 * `--dry-run` does the whole move in a transaction and rolls it back, so its counts (per table,
 * and per trip) are exactly what the real run will do, and a table that cannot be moved is named
 * before anything is written. Running it again moves nothing.
 */
import { createPool, registerJobProducer, withSystem } from '@cp/db';
import type pg from 'pg';
import { PgBoss } from 'pg-boss';

import { BOSS_SCHEMA } from '../boss/boss';

import { followMergedPlaces, type FollowResult } from './follow-merges';

class DryRun extends Error {
  constructor(readonly result: FollowResult) {
    super('dry run');
  }
}

export async function followMerges(
  pool: pg.Pool,
  options: { readonly dryRun?: boolean; readonly log?: (line: string) => void } = {},
): Promise<FollowResult> {
  const dryRun = options.dryRun === true;
  const log = options.log ?? console.log;
  let result: FollowResult;
  try {
    result = await withSystem(pool, async (tx) => {
      const done = await followMergedPlaces(tx);
      if (dryRun) throw new DryRun(done);
      return done;
    });
  } catch (error) {
    if (!(error instanceof DryRun)) throw error;
    result = error.result;
  }
  const verb = dryRun ? 'would move' : 'moved';
  for (const [table, count] of Object.entries(result.tables)) {
    if (count.moved + count.dropped === 0) continue;
    log(
      `places.follow: ${table}: ${count.moved} ${verb}, ${count.dropped} not kept (already there)`,
    );
  }
  const trips = Object.entries(result.trips).sort((a, b) => b[1] - a[1]);
  log(
    `places.follow: ${trips.length} trips, ${result.replanned.length} with a live plan to route and check again`,
  );
  for (const [tripId, rows] of trips) log(`places.follow: trip ${tripId}: ${rows} rows`);
  for (const [table, reason] of Object.entries(result.failed)) {
    log(`places.follow: ${table} could not be moved: ${reason}`);
  }
  return result;
}

async function main(): Promise<void> {
  // The direct connection, as the worker's own job runtime uses: the pooler takes no role option.
  const connectionString = process.env['DATABASE_DIRECT_URL'] ?? process.env['DATABASE_URL'];
  if (connectionString === undefined) throw new Error('DATABASE_DIRECT_URL is required');
  const pool = createPool({ connectionString, max: 1 });
  // The legs and check runs are queued in the same transaction as the move (and rolled back with
  // it on a dry run), so this process sends jobs like the worker does.
  const boss = new PgBoss({
    connectionString,
    schema: BOSS_SCHEMA,
    createSchema: false,
    options: '-c role=app_system',
    application_name: 'cp-places-follow',
    max: 1,
    supervise: false,
    schedule: false,
  });
  try {
    await boss.start();
    registerJobProducer(boss);
    await followMerges(pool, { dryRun: process.argv.includes('--dry-run') });
  } finally {
    await boss.stop({ graceful: false }).catch(() => undefined);
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('follow-merges-cli.ts') === true) await main();
