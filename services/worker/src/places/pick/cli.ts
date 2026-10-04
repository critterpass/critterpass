/**
 * Queues the machine picks of one destination for the deployed worker (which holds the model key)
 * to run. Run it from anywhere that reaches the database:
 *
 *   railway run --service worker --environment staging -- \
 *     pnpm --filter @cp/worker exec tsx src/places/pick/cli.ts <destination slug> [--force]
 *
 * Without `--force` a destination that already has picks is left alone; with it the picks are
 * made again and replace the old ranks. A destination with a curated set is always skipped. The
 * job's result (named, matched, filled) is in the worker's log and the console's jobs panel.
 */
import { PLACES_QUEUES, placesPickKey, queueSpec } from '@cp/domain';
import { PgBoss } from 'pg-boss';

import { BOSS_SCHEMA } from '../../boss/boss';

async function main(): Promise<void> {
  const slug = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
  if (slug === undefined) throw new Error('usage: cli.ts <destination slug> [--force]');
  const force = process.argv.includes('--force');
  // pg-boss takes advisory locks while it starts: a direct connection when one is configured.
  const connectionString = process.env['DATABASE_DIRECT_URL'] ?? process.env['DATABASE_URL'];
  if (connectionString === undefined) throw new Error('DATABASE_URL is required');
  const boss = new PgBoss({
    connectionString,
    schema: BOSS_SCHEMA,
    createSchema: false,
    options: '-c role=app_system',
    application_name: 'cp-places-pick',
    max: 1,
    supervise: false,
    schedule: false,
  });
  try {
    await boss.start();
    // A worker that has not booted with this queue yet: create it with the catalogue's policy.
    if ((await boss.getQueue(PLACES_QUEUES.pick)) === null) {
      await boss.createQueue(PLACES_QUEUES.pick, { policy: queueSpec(PLACES_QUEUES.pick).policy });
    }
    const id = await boss.send(
      PLACES_QUEUES.pick,
      { destination: slug, ...(force ? { force: true } : {}) },
      { singletonKey: placesPickKey(slug) },
    );
    console.log(
      id === null
        ? `places.pick for ${slug}: a run is already waiting`
        : `places.pick for ${slug} queued as ${id}${force ? ' (force)' : ''}`,
    );
  } finally {
    await boss.stop({ graceful: false }).catch(() => undefined);
  }
}

await main();
