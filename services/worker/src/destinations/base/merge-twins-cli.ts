/**
 * Folds base rows that duplicate a critter destination into the critter row, once:
 *
 *   railway run --service worker --environment staging -- \
 *     pnpm --filter @cp/worker exec tsx src/destinations/base/merge-twins-cli.ts [--dry-run]
 *
 * `--dry-run` performs every merge inside a transaction and rolls it back, printing the pairs and
 * the references each would move.
 */
import { createPool } from '@cp/db';

import { mergeBaseTwins } from './merge-twins';

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_DIRECT_URL'] ?? process.env['DATABASE_URL'];
  if (connectionString === undefined) throw new Error('DATABASE_DIRECT_URL is required');
  const pool = createPool({ connectionString, max: 2 });
  try {
    const result = await mergeBaseTwins(pool, { dryRun: process.argv.includes('--dry-run') });
    for (const pair of result.pairs) {
      console.log(
        `${pair.critter.slug} <- ${pair.base.slug} (${pair.base.name})`,
        JSON.stringify(pair.moved),
      );
    }
    console.log(`${result.dryRun ? 'would merge' : 'merged'} ${result.pairs.length} pairs`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('/base/merge-twins-cli.ts') === true) await main();
