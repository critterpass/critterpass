/**
 * Loads curated places files into our place rows and prints, per destination, the places matched,
 * those no row carries (skipped) and the popular set after the load:
 *
 *   railway run --service worker --environment staging -- \
 *     pnpm --filter @cp/worker exec tsx src/places/curated-load/cli.ts \
 *       <places/<slug>.jsonl | folder>… [--destination <slug>] [--dry-run]
 *
 * A folder loads every `.jsonl` file in it. `--dry-run` matches and reports without writing (and
 * queues no ingest). A destination with too few places gets its open-data ingest queued; run the
 * file again once the worker has finished it.
 */
import { readFileSync } from 'node:fs';

import { createPool, registerJobProducer } from '@cp/db';
import { PgBoss } from 'pg-boss';

import { BOSS_SCHEMA } from '../../boss/boss';
import { jsonlFiles, parseJsonLines } from './files';
import { loadCuratedPlaces } from './load';
import { curatedPlaceRowSchema, type CuratedPlaceRow } from './rows';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};

async function main(): Promise<void> {
  const only = option('destination');
  const paths = args.filter((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--destination');
  if (paths.length === 0) throw new Error('name at least one curated places file or folder');
  const bySlug = new Map<string, CuratedPlaceRow[]>();
  for (const file of jsonlFiles(paths)) {
    const parsed = parseJsonLines(readFileSync(file, 'utf8'), curatedPlaceRowSchema);
    for (const bad of parsed.rejected) console.log(`${file}:${bad.line} skipped: ${bad.reason}`);
    for (const row of parsed.rows) {
      if (only !== undefined && row.destination !== only) continue;
      bySlug.set(row.destination, [...(bySlug.get(row.destination) ?? []), row]);
    }
  }
  const connectionString = process.env['DATABASE_DIRECT_URL'] ?? process.env['DATABASE_URL'];
  if (connectionString === undefined) throw new Error('DATABASE_URL is required');
  const pool = createPool({ connectionString, max: 2 });
  const boss = new PgBoss({
    connectionString,
    schema: BOSS_SCHEMA,
    createSchema: false,
    options: '-c role=app_system',
    application_name: 'cp-curated-places',
    max: 1,
    supervise: false,
    schedule: false,
  });
  try {
    await boss.start();
    registerJobProducer(boss);
    for (const [slug, rows] of bySlug) {
      const report = await loadCuratedPlaces(pool, slug, rows, { dryRun: flag('dry-run') });
      console.log(
        JSON.stringify({
          destination: report.destination,
          status: report.status,
          rows: report.rows,
          matched: report.matched.length,
          unmatched: report.unmatched,
          dropped: report.dropped,
          popular: report.popular,
        }),
      );
      if (flag('verbose')) console.log(JSON.stringify(report.matched, null, 1));
    }
  } finally {
    await boss.stop({ graceful: false }).catch(() => undefined);
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('/curated-load/cli.ts') === true) await main();
