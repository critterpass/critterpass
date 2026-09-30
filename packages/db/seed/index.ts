/**
 * Realistic dev/staging fixtures (docs/code-standards.md §13: "content-factory data, not lorem"):
 * the designed guides and the live destinations (docs/product-decisions.md §6), Winston's crew "The Bali
 * Six" and its confirmed Bali trip, and a standalone solo Kyoto trip. Idempotent: every insert here
 * is guarded so `pnpm --filter @cp/db seed` is safe to run more than once against the same database.
 */
import type pg from 'pg';

import { createPool } from '../src/client';
import { withSystem } from '../src/tx';
import { seedCatalogProductsPerks } from './catalog-products-perks';
import { seedCostIndices } from './cost-indices/load';
import { seedCrewBaliSix } from './crew-bali-six';
import { seedDestinations } from './destinations';
import { seedSeason } from './season/load';
import { seedTripKyotoSolo } from './trip-kyoto-solo';

interface SeedGuide {
  readonly slug: string;
  readonly name: string;
  readonly colour: 'yellow' | 'orange' | 'blue' | 'pink' | 'green' | 'cream';
}

/** The six live guides (docs/product-decisions.md §6); colours per the canonical palette. */
const GUIDES: readonly SeedGuide[] = [
  { slug: 'tokek', name: 'Tokek', colour: 'yellow' },
  { slug: 'pon', name: 'Pon', colour: 'orange' },
  { slug: 'lundi', name: 'Lundi', colour: 'blue' },
  { slug: 'ajo', name: 'Ajo', colour: 'pink' },
  { slug: 'sardi', name: 'Sardi', colour: 'green' },
  { slug: 'paco', name: 'Paco', colour: 'cream' },
];

async function seedCatalogue(tx: pg.PoolClient): Promise<void> {
  for (const guide of GUIDES) {
    await tx.query(
      'INSERT INTO guides (slug, name, colour) VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING',
      [guide.slug, guide.name, guide.colour],
    );
  }
  await seedDestinations(tx);
}

export async function seed(pool: pg.Pool): Promise<void> {
  await withSystem(pool, seedCatalogue);
  await seedSeason(pool);
  await seedCostIndices(pool);
  await seedCatalogProductsPerks(pool);
  await seedCrewBaliSix(pool);
  await seedTripKyotoSolo(pool);
}

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'] ?? process.env['DATABASE_DIRECT_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL or DATABASE_DIRECT_URL is required to seed');
  }
  const pool = createPool(connectionString);
  try {
    await seed(pool);
    console.log('seed: done');
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
