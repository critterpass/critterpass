/**
 * Loads local guides files and carries out guides' requests, from anywhere that reaches the
 * database:
 *
 *   railway run --service worker --environment staging -- \
 *     pnpm --filter @cp/worker exec tsx src/destinations/local-guides/cli.ts \
 *       <guides/<slug>.jsonl | folder>… [--destination <slug>] [--dry-run]
 *   … cli.ts --hide <profile url> | --remove <profile url> | --merge <profile url> --into <url>
 *
 * A folder loads every `.jsonl` file in it. Each destination prints the guides written, the lines
 * refused and why, the ratings stored as none (self-reported) and the guides left alone because
 * they asked to be hidden or removed.
 */
import { readFileSync } from 'node:fs';

import { createPool } from '@cp/db';

import { jsonlFiles, parseJsonLines } from '../../places/curated-load/files';
import { hideGuide, loadLocalGuides, mergeGuide, removeGuide } from './load';
import { localGuideRowSchema, type LocalGuideRow } from './rows';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const VALUE_OPTIONS = ['--destination', '--hide', '--remove', '--merge', '--into'];
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_DIRECT_URL'] ?? process.env['DATABASE_URL'];
  if (connectionString === undefined) throw new Error('DATABASE_URL is required');
  const pool = createPool({ connectionString, max: 2 });
  try {
    const hide = option('hide');
    const remove = option('remove');
    const merge = option('merge');
    if (hide !== undefined) return console.log('hidden', await hideGuide(pool, hide));
    if (remove !== undefined) return console.log('removed', await removeGuide(pool, remove));
    if (merge !== undefined) {
      const into = option('into');
      if (into === undefined) throw new Error('--merge needs --into <profile url>');
      return console.log('merged', await mergeGuide(pool, merge, into));
    }
    const only = option('destination');
    const paths = args.filter(
      (arg, i) => !arg.startsWith('--') && !VALUE_OPTIONS.includes(args[i - 1] ?? ''),
    );
    if (paths.length === 0) throw new Error('name at least one guides file or folder');
    const bySlug = new Map<string, LocalGuideRow[]>();
    for (const file of jsonlFiles(paths)) {
      const parsed = parseJsonLines(readFileSync(file, 'utf8'), localGuideRowSchema);
      for (const bad of parsed.rejected) console.log(`${file}:${bad.line} refused: ${bad.reason}`);
      for (const row of parsed.rows) {
        if (only !== undefined && row.destination !== only) continue;
        bySlug.set(row.destination, [...(bySlug.get(row.destination) ?? []), row]);
      }
    }
    for (const [slug, rows] of bySlug) {
      const report = await loadLocalGuides(pool, slug, rows, {
        dryRun: args.includes('--dry-run'),
      });
      console.log(JSON.stringify(report));
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('/local-guides/cli.ts') === true) await main();
