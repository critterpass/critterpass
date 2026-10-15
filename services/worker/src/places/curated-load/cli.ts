/**
 * Loads curated places files into our place rows and prints, per destination, the places matched,
 * those no row carries (skipped) and the popular set after the load:
 *
 *   railway run --service worker --environment staging -- \
 *     pnpm --filter @cp/worker exec tsx src/places/curated-load/cli.ts \
 *       <places/<slug>.jsonl | folder>… [--destination <slug>] [--dry-run] [--osm] \
 *       [--itineraries <folder>]
 *
 * A folder loads every `.jsonl` file in it. `--dry-run` matches and reports without writing (and
 * queues no ingest). A destination with too few places gets its open-data ingest queued; run the
 * file again once the worker has finished it.
 *
 * After a destination's places, its itinerary (`<slug>.json` in `--itineraries <folder>`, by
 * default the `itineraries` folder beside the places folder) is loaded when there is one, each
 * place it names carrying the row this run matched it to (`./itinerary.ts`).
 *
 * `--osm` queues one `places.curated_osm_lookup` job per unmatched place: the worker looks it up in
 * OpenStreetMap and adds it with its note (`./osm-place.ts`; with `--dry-run`, it only reports).
 * Each job's outcome is its output:
 *
 *   SELECT data->'place'->>'destination' AS destination, output->>'outcome' AS outcome,
 *          data->'place'->>'name_en' AS place, output->>'name' AS osm_name,
 *          output->>'address' AS address, output->>'distance_m' AS distance_m
 *     FROM pgboss.job WHERE name = 'places.curated_osm_lookup' AND state = 'completed'
 *    ORDER BY 1, 2, 3;
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { createPool, registerJobProducer, sendInTx, withSystem } from '@cp/db';
import { curatedOsmLookupKey, PLACES_QUEUES } from '@cp/domain';
import { PgBoss } from 'pg-boss';

import { BOSS_SCHEMA } from '../../boss/boss';
import { jsonlFiles, parseJsonLines } from './files';
import type { CuratedOsmLookupJob } from '../../jobs/places/curated-osm-lookup';
import { curatedItinerarySchema, loadCuratedItinerary } from './itinerary';
import { loadCuratedPlaces, type CuratedPlacesReport } from './load';
import { curatedNameKey, curatedPlaceRowSchema, type CuratedPlaceRow } from './rows';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};

async function main(): Promise<void> {
  const only = option('destination');
  const paths = args.filter(
    (arg, i) =>
      !arg.startsWith('--') && args[i - 1] !== '--destination' && args[i - 1] !== '--itineraries',
  );
  if (paths.length === 0) throw new Error('name at least one curated places file or folder');
  const bySlug = new Map<string, CuratedPlaceRow[]>();
  const folderOf = new Map<string, string>();
  for (const file of jsonlFiles(paths)) {
    const parsed = parseJsonLines(readFileSync(file, 'utf8'), curatedPlaceRowSchema);
    for (const bad of parsed.rejected) console.log(`${file}:${bad.line} skipped: ${bad.reason}`);
    for (const row of parsed.rows) {
      if (only !== undefined && row.destination !== only) continue;
      bySlug.set(row.destination, [...(bySlug.get(row.destination) ?? []), row]);
      folderOf.set(
        row.destination,
        option('itineraries') ?? join(dirname(file), '..', 'itineraries'),
      );
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
          osm_queued: flag('osm') ? report.unmatchedLines.length : 0,
          dropped: report.dropped,
          popular: report.popular,
        }),
      );
      if (flag('osm') && report.unmatchedLines.length > 0) {
        await withSystem(pool, async (tx) => {
          for (const { rank, line } of report.unmatchedLines) {
            const job: CuratedOsmLookupJob = { rank, place: line, dry_run: flag('dry-run') };
            await sendInTx(tx, PLACES_QUEUES.curatedOsmLookup, job, {
              singletonKey: curatedOsmLookupKey(line.destination, line.name_en),
            });
          }
        });
      }
      if (flag('verbose')) console.log(JSON.stringify(report.matched, null, 1));
      await loadItineraryOf(pool, report, join(folderOf.get(slug) ?? '.', `${slug}.json`));
    }
  } finally {
    await boss.stop({ graceful: false }).catch(() => undefined);
    await pool.end();
  }
}

/** Loads the destination's itinerary file, if it has one, after its places loaded or checked. */
async function loadItineraryOf(
  pool: ReturnType<typeof createPool>,
  places: CuratedPlacesReport,
  file: string,
): Promise<void> {
  if (!existsSync(file) || (places.status !== 'loaded' && places.status !== 'checked')) return;
  const parsed = curatedItinerarySchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (parsed.success && parsed.data.destination !== places.destination) {
    console.log(`${file} skipped: destination is not ${places.destination}`);
    return;
  }
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    console.log(`${file} skipped: ${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'invalid'}`);
    return;
  }
  const placed = new Map(places.matched.map((m) => [curatedNameKey(m.name), m.poiId]));
  const report = await loadCuratedItinerary(pool, parsed.data, placed, {
    dryRun: places.status === 'checked',
  });
  console.log(JSON.stringify({ itinerary: report }));
}

if (process.argv[1]?.endsWith('/curated-load/cli.ts') === true) await main();
