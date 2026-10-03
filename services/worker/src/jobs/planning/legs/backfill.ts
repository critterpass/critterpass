/**
 * Backfills stored legs: queues one `plan.legs` run per trip in planning, pre or in with a live
 * plan, spread over time, for the deployed worker to route inside the private network. Run it
 * from anywhere that reaches the database (it never calls Valhalla itself):
 *
 *   railway run --service worker --environment staging -- \
 *     pnpm --filter @cp/worker exec tsx src/jobs/planning/legs/backfill.ts [--dry-run] [--per-minute 60]
 *
 * `--dry-run` counts the trips and writes nothing.
 */
import { createPool, registerJobProducer } from '@cp/db';
import { PgBoss } from 'pg-boss';

import { BOSS_SCHEMA } from '../../../boss/boss';
import { queueLegsBackfill } from './backfill-queue';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  // pg-boss takes advisory locks while it starts: a direct connection when one is configured.
  const connectionString = process.env['DATABASE_DIRECT_URL'] ?? process.env['DATABASE_URL'];
  if (connectionString === undefined) throw new Error('DATABASE_URL is required');
  const dryRun = process.argv.includes('--dry-run');
  const perMinute = Number(flag('per-minute') ?? 60);
  const pool = createPool({ connectionString, max: 2 });
  const boss = new PgBoss({
    connectionString,
    schema: BOSS_SCHEMA,
    createSchema: false,
    options: '-c role=app_system',
    application_name: 'cp-legs-backfill',
    max: 1,
    supervise: false,
    schedule: false,
  });
  try {
    if (!dryRun) {
      await boss.start();
      registerJobProducer(boss);
    }
    const result = await queueLegsBackfill(pool, { dryRun, perMinute });
    console.log(
      `trips with a live plan: ${result.trips}; queued ${result.queued}, already queued ${result.alreadyQueued}` +
        (dryRun ? ' (dry run, nothing written)' : '') +
        `; last run starts in ${Math.ceil(result.lastStartsIn / 60)} min`,
    );
  } finally {
    if (!dryRun) await boss.stop({ graceful: false }).catch(() => undefined);
    await pool.end();
  }
}

await main();
