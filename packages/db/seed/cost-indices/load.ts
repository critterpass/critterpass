/**
 * Loads the editorial destination cost indices beside this module as drafts: `reviewed_at` stays
 * null, so nothing is served or synced until a content reviewer approves a row. Existing rows are
 * never overwritten, so re-seeding cannot undo a reviewer's edits.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type pg from 'pg';
import { z } from 'zod';

import { createPool } from '../../src/client';
import { withSystem } from '../../src/tx';

const minor = z.number().int().nonnegative();

const costIndexRowSchema = z
  .object({
    destination: z.string().min(1),
    stay_type: z.string().regex(/^[a-z][a-z_]*$/),
    nightly_minor_low: minor,
    nightly_minor_high: minor,
    food_pp_day_minor: minor,
    fun_pp_day_minor: minor,
    currency: z.string().regex(/^[A-Z]{3}$/),
    source: z.string().min(1),
    source_url: z.url().nullable(),
    sourced_on: z.iso.date(),
  })
  .strict()
  .refine((row) => row.nightly_minor_high >= row.nightly_minor_low, 'inverted nightly range');

export type CostIndexSeedRow = z.infer<typeof costIndexRowSchema>;

export function readCostIndexSeed(dir: string = import.meta.dirname): CostIndexSeedRow[] {
  const raw: unknown = JSON.parse(readFileSync(path.join(dir, 'indices.json'), 'utf8'));
  return z.array(costIndexRowSchema).parse(raw);
}

/** Seeds every cost index row, or only those of `slugs`. */
export async function seedCostIndices(pool: pg.Pool, slugs?: readonly string[]): Promise<void> {
  const rows = readCostIndexSeed().filter(
    (row) => slugs === undefined || slugs.includes(row.destination),
  );
  await withSystem(pool, async (tx) => {
    for (const row of rows) {
      await tx.query(
        `INSERT INTO destination_cost_indices (destination_id, stay_type, nightly_minor_low,
           nightly_minor_high, food_pp_day_minor, fun_pp_day_minor, currency, source, source_url,
           sourced_on)
         SELECT id, $2, $3, $4, $5, $6, $7, $8, $9, $10 FROM destinations WHERE slug = $1
         ON CONFLICT (destination_id, stay_type) DO NOTHING`,
        [
          row.destination,
          row.stay_type,
          row.nightly_minor_low,
          row.nightly_minor_high,
          row.food_pp_day_minor,
          row.fun_pp_day_minor,
          row.currency,
          row.source,
          row.source_url,
          row.sourced_on,
        ],
      );
    }
  });
}

/**
 * `pnpm --filter @cp/db seed:cost-indices <slug> [<slug>…]`: writes the drafts of places that are
 * live without a guide-destination seed entry (Đà Lạt). Nothing existing is overwritten.
 */
async function main(): Promise<void> {
  const slugs = process.argv.slice(2).filter((arg) => arg !== '--');
  if (slugs.length === 0) throw new Error('usage: seed:cost-indices <slug> [<slug>…]');
  const connectionString = process.env['DATABASE_URL'] ?? process.env['DATABASE_DIRECT_URL'];
  if (!connectionString) throw new Error('DATABASE_URL or DATABASE_DIRECT_URL is required');
  const pool = createPool(connectionString);
  try {
    await seedCostIndices(pool, slugs);
    const { rows } = await withSystem(pool, (tx) =>
      tx.query<{ id: string; slug: string; stay_type: string; reviewed: boolean }>(
        `SELECT i.id, d.slug, i.stay_type, i.reviewed_at IS NOT NULL AS reviewed
           FROM destination_cost_indices i JOIN destinations d ON d.id = i.destination_id
          WHERE d.slug = ANY($1::text[]) ORDER BY d.slug, i.stay_type`,
        [slugs],
      ),
    );
    for (const row of rows) console.log(JSON.stringify(row));
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
