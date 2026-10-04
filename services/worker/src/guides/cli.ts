/**
 * Moves trips that have not started to the guide of their city. Run it once after the
 * `guides.per_city` switch is turned on, from anywhere that reaches the database:
 *
 *   railway run --service worker --environment staging -- \
 *     pnpm --filter @cp/worker exec tsx src/guides/cli.ts [--dry-run]
 *
 * `--dry-run` counts the trips and writes nothing. With the switch off it does nothing. Trips
 * that are under way, over or cancelled keep their guide.
 */
import { createPool } from '@cp/db';

import { repointGuides } from './repoint';

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (connectionString === undefined) throw new Error('DATABASE_URL is required');
  const pool = createPool({ connectionString, max: 1 });
  try {
    await repointGuides(pool, { dryRun: process.argv.includes('--dry-run') });
  } finally {
    await pool.end();
  }
}

await main();
