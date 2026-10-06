/**
 * Types every curated place from its reviewed note (./curated.ts) and prints the counts. Re-run it
 * after the editors publish: places typed before are passed over unless `--force`.
 *
 *   railway run --service worker --environment staging -- \
 *     pnpm --filter @cp/worker exec tsx src/places/profile/curated-cli.ts \
 *     [--destination vn-da-lat] [--force] [--dry-run]
 *
 * Model calls are system usage on no user's meter. A place whose calls fail is not saved, so the
 * next run picks it up.
 */
import { createDecisionClient, createGateway, recordUsage } from '@cp/ai';
import { createPool, withSystem } from '@cp/db';

import { typeCuratedPlaces } from './curated-run';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_DIRECT_URL'] ?? process.env['DATABASE_URL'];
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (connectionString === undefined) throw new Error('DATABASE_URL is required');
  if (apiKey === undefined || apiKey === '') throw new Error('ANTHROPIC_API_KEY is required');
  const pool = createPool({ connectionString, max: 4 });
  try {
    const onUsage = (record: Parameters<typeof recordUsage>[1]) =>
      recordUsage((fn) => withSystem(pool, fn), record);
    const baseURL = process.env['ANTHROPIC_BASE_URL'];
    const gateway = createGateway({
      apiKey,
      ...(baseURL === undefined ? {} : { baseURL }),
      onUsage,
    });
    const decisions = createDecisionClient({
      apiKey: process.env['TYPESAFE_API_KEY'],
      gateway,
      timeoutMs: 5_000,
      onUsage,
    });
    const report = await typeCuratedPlaces(
      pool,
      { gateway, decisions },
      {
        force: process.argv.includes('--force'),
        dryRun: process.argv.includes('--dry-run'),
        destination: option('--destination'),
        onProgress: (done, total) => {
          if (done % 200 === 0) console.log(`${done}/${total}`);
        },
      },
    );
    console.log(JSON.stringify(report, null, 1));
  } finally {
    await pool.end();
  }
}

await main();
