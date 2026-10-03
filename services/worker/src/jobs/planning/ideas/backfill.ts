/**
 * Backfills every active trip's Ideas once (the trips seed themselves after that on destination
 * and join events). Run it from anywhere that reaches the database:
 *
 *   railway run --service worker --environment staging -- \
 *     pnpm --filter @cp/worker exec tsx src/jobs/planning/ideas/backfill.ts
 *
 * Seeding queues each changed trip's plan check, so it starts a job producer.
 */
import { createPool, registerJobProducer } from '@cp/db';
import { PgBoss } from 'pg-boss';

import { BOSS_SCHEMA } from '../../../boss/boss';
import { backfillIdeas } from './backfill-run';

async function main(): Promise<void> {
  // pg-boss takes advisory locks while it starts: a direct connection when one is configured.
  const connectionString = process.env['DATABASE_DIRECT_URL'] ?? process.env['DATABASE_URL'];
  if (connectionString === undefined) throw new Error('DATABASE_URL is required');
  const pool = createPool({ connectionString, max: 2 });
  const boss = new PgBoss({
    connectionString,
    schema: BOSS_SCHEMA,
    createSchema: false,
    options: '-c role=app_system',
    application_name: 'cp-ideas-backfill',
    max: 1,
    supervise: false,
    schedule: false,
  });
  try {
    await boss.start();
    registerJobProducer(boss);
    const result = await backfillIdeas(pool);
    console.log(`trips seeded: ${result.trips}; ideas created or backed: ${result.ideas}`);
  } finally {
    await boss.stop({ graceful: false }).catch(() => undefined);
    await pool.end();
  }
}

await main();
