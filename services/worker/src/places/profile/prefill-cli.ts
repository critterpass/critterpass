/**
 * Pre-fills the profiles of Vietnam's destinations: the top places of each (100 by default), queued
 * at the lowest priority and spread over hours, one destination after another, so the searches
 * trickle and every reader's own request still goes first. Other destinations fill on demand.
 *
 *   railway run --service worker --environment staging -- \
 *     pnpm --filter @cp/worker exec tsx src/places/profile/prefill-cli.ts [--limit 100] [--spacing 12]
 *
 * Each destination gets one `places.profile_warm` job; a place that already has a profile, a
 * reviewed note, or a kind that gets none is passed over when that job runs.
 */
import { PLACES_QUEUES, placesProfileWarmKey, queueSpec } from '@cp/domain';
import { PgBoss } from 'pg-boss';

import { BOSS_SCHEMA } from '../../boss/boss';

function flag(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : Number(process.argv[index + 1]);
  return value === undefined || !Number.isFinite(value) ? fallback : value;
}

async function main(): Promise<void> {
  const limit = flag('--limit', 100);
  const spacing = flag('--spacing', 12);
  const connectionString = process.env['DATABASE_DIRECT_URL'] ?? process.env['DATABASE_URL'];
  if (connectionString === undefined) throw new Error('DATABASE_URL is required');
  const boss = new PgBoss({
    connectionString,
    schema: BOSS_SCHEMA,
    createSchema: false,
    options: '-c role=app_system',
    application_name: 'cp-places-profile-prefill',
    max: 1,
    supervise: false,
    schedule: false,
  });
  try {
    await boss.start();
    const result: { rows: { id: string; slug: string }[] } = await boss.getDb().executeSql(
      `SELECT id, slug FROM destinations
          WHERE lower(trim(country)) IN ('vn', 'vietnam', 'viet nam') ORDER BY slug`,
      [],
    );
    const rows = result.rows;
    const queue = PLACES_QUEUES.profileWarm;
    if ((await boss.getQueue(queue)) === null) {
      await boss.createQueue(queue, { policy: queueSpec(queue).policy });
    }
    for (const [i, row] of rows.entries()) {
      const offset = i * limit * spacing;
      const id = await boss.send(
        queue,
        { destination_id: row.id, limit, prefill: true, spacing_s: spacing, offset_s: offset },
        { singletonKey: placesProfileWarmKey(row.id) },
      );
      console.log(
        `${row.slug}: ${id === null ? 'already waiting' : `queued, starts in ${Math.round(offset / 60)} min`}`,
      );
    }
    console.log(
      `${rows.length} destinations, about ${Math.round((rows.length * limit * spacing) / 3600)} h`,
    );
  } finally {
    await boss.stop({ graceful: false }).catch(() => undefined);
  }
}

await main();
