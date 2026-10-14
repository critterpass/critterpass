/**
 * Vietnam's one-time top-up, run by hand once (see ./vn-topup.ts):
 *
 *   railway run --service worker --environment staging -- \
 *     pnpm --filter @cp/worker exec tsx src/destinations/base/vn-topup-cli.ts [--dry-run]
 *
 * Prints every pick with its province, population and reason for a person to check; `--dry-run`
 * asks the model and prints without writing.
 */
import { createPool } from '@cp/db';

import { destinationsAi } from '../ai-deps';
import { runVietnamTopUp } from './vn-topup';

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_DIRECT_URL'] ?? process.env['DATABASE_URL'];
  if (connectionString === undefined) throw new Error('DATABASE_DIRECT_URL is required');
  const pool = createPool({ connectionString, max: 2 });
  try {
    const ai = destinationsAi(process.env, { pool });
    if (ai === null) throw new Error('ANTHROPIC_API_KEY is required');
    const result = await runVietnamTopUp(pool, ai.gateway, {
      dryRun: process.argv.includes('--dry-run'),
    });
    for (const pick of result.picks) {
      console.log(
        [pick.province, pick.name, pick.geonamesId, pick.population ?? '', pick.reason].join('\t'),
      );
    }
    console.log(
      JSON.stringify({
        picks: result.picks.length,
        inserted: result.inserted,
        enriched: result.enriched,
        cost_usd: result.costMicros / 1_000_000,
      }),
    );
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('vn-topup-cli.ts') === true) await main();
