/**
 * Queues `ai.fit_check` for every trip that has not ended and still has a typed must-do without a
 * time of day: the must-dos set before their place and time were decided when set
 * (./must-do-place.ts). The check decides them and stores the answers on their rows. Run it from
 * anywhere that reaches the database:
 *
 *   railway run --service worker --environment staging -- \
 *     pnpm --filter @cp/worker exec tsx src/jobs/ai/must-do-time-backfill-cli.ts [--dry-run]
 *
 * Re-runnable: one check is queued per trip (singleton per trip), and a must-do whose words name no
 * time stays without one and is simply asked again.
 */
import { createPool, withSystem } from '@cp/db';
import { SETUP_QUEUES } from '@cp/domain';
import type pg from 'pg';
import { PgBoss } from 'pg-boss';

import { BOSS_SCHEMA } from '../../boss/boss';

export async function tripsToBackfill(pool: pg.Pool): Promise<string[]> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ trip_id: string }>(
      `SELECT DISTINCT m.trip_id
         FROM must_dos m JOIN trips t ON t.id = m.trip_id
        WHERE m.deleted_at IS NULL AND m.freeform AND m.time_of_day IS NULL
          AND (t.end_date IS NULL OR t.end_date >= current_date)
        ORDER BY m.trip_id`,
    ),
  );
  return rows.map((row) => row.trip_id);
}

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_DIRECT_URL'] ?? process.env['DATABASE_URL'];
  if (connectionString === undefined) throw new Error('DATABASE_DIRECT_URL is required');
  const pool = createPool({ connectionString, max: 1 });
  const boss = new PgBoss({
    connectionString,
    schema: BOSS_SCHEMA,
    createSchema: false,
    options: '-c role=app_system',
    application_name: 'cp-must-do-time-backfill',
    max: 1,
    supervise: false,
    schedule: false,
  });
  try {
    const trips = await tripsToBackfill(pool);
    console.log(`must_do.time: ${trips.length} trips with a typed must-do and no time`);
    if (process.argv.includes('--dry-run')) return;
    await boss.start();
    for (const tripId of trips) {
      await boss.send(SETUP_QUEUES.fitCheck, { trip_id: tripId }, { singletonKey: tripId });
    }
    console.log(`must_do.time: queued ${trips.length} fit checks`);
  } finally {
    await boss.stop({ graceful: false }).catch(() => undefined);
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('must-do-time-backfill-cli.ts') === true) await main();
