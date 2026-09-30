/**
 * Adds one live destination to an existing database without the demo fixtures:
 *
 *   pnpm --filter @cp/db seed:destination da-nang
 *
 * Writes its `destinations` row (seed/destinations.ts), then its editorial season and cost-index
 * drafts. Every insert is guarded and nothing is overwritten; the drafts stay unserved until a
 * content reviewer approves them in the ops console. Reads DATABASE_URL (or DATABASE_DIRECT_URL).
 */
import type pg from 'pg';

import { createPool } from '../src/client';
import { withSystem } from '../src/tx';
import { seedCostIndices } from './cost-indices/load';
import { DESTINATIONS, seedDestinations } from './destinations';
import { seedSeason } from './season/load';

export async function seedOneDestination(pool: pg.Pool, slug: string): Promise<boolean> {
  if (!DESTINATIONS.some((destination) => destination.slug === slug)) {
    throw new Error(`${slug} is not in seed/destinations.ts`);
  }
  const inserted = await withSystem(pool, (tx) => seedDestinations(tx, [slug]));
  await seedSeason(pool, [slug]);
  await seedCostIndices(pool, [slug]);
  return inserted.length > 0;
}

async function main(): Promise<void> {
  const slug = process.argv.slice(2).find((arg) => arg !== '--');
  if (slug === undefined) throw new Error('usage: seed:destination <slug>');
  const connectionString = process.env['DATABASE_URL'] ?? process.env['DATABASE_DIRECT_URL'];
  if (!connectionString) throw new Error('DATABASE_URL or DATABASE_DIRECT_URL is required');
  const pool = createPool(connectionString);
  try {
    const created = await seedOneDestination(pool, slug);
    console.log(`seed:destination ${slug}: ${created ? 'created' : 'already there'}`);
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
