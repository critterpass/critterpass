/**
 * POI ingest from the command line. Reads `DATABASE_DIRECT_URL` (the variable the worker and the
 * migration runner use). Every mode is idempotent.
 *
 *   pnpm --filter @cp/maps ingest -- --slug kyoto                 # one destination, its place_bounds
 *   pnpm --filter @cp/maps ingest -- --slug kyoto --min-lat 34.90 --max-lat 35.10 \
 *     --min-lng 135.60 --max-lng 135.85 [--tz Asia/Tokyo]       # one destination, an explicit box
 *   pnpm --filter @cp/maps ingest -- --backfill-bounds           # fill missing place_bounds
 *   pnpm --filter @cp/maps ingest -- --set-bounds "slug:minLon,minLat,maxLon,maxLat;…"  # correct
 *   pnpm --filter @cp/maps ingest -- --all [--except da-nang]    # every destination, here, in turn
 *   pnpm --filter @cp/maps ingest -- --enqueue [--except da-nang]
 *     # the worker's `places.ingest` fan-out: one FSQ OS export, then one job per destination
 *   pnpm --filter @cp/maps ingest -- --enqueue --only vn-hoi-an,vn-hue [--fsq-run <run id>]
 *     # those, on the worker; with --fsq-run they read FSQ OS from that stored export run
 *
 * `--backfill-bounds` uses the region-pack bounds in `./destinations.ts` for the guide
 * destinations and the Overture locality point for the rest (services/worker/src/places/
 * place-bounds.ts). Each ingest writes an attribution NOTICE to the git-ignored `./attribution/`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createPool, withSystem } from '@cp/db';
import type pg from 'pg';

import { createBoss } from '../../services/worker/src/boss';
import { PLACES_INGEST_QUEUE } from '../../services/worker/src/jobs/places';
import {
  generateAttributionNotice,
  ingestDestination,
  type BoundingBox,
  type IngestDestinationResult,
} from '../../services/worker/src/places/ingest';
import { ingestAllDestinations } from '../../services/worker/src/places/ingest-all';
import {
  backfillPlaceBounds,
  loadPlaceBounds,
  setPlaceBounds,
} from '../../services/worker/src/places/place-bounds';
import { DEFAULT_OVERTURE_RELEASE } from '../../services/worker/src/places/source-readers';
import { GUIDE_DESTINATION_EXTRACTS } from './destinations';

const FLAGS = new Set(['all', 'backfill-bounds', 'enqueue']);

export interface CliArgs {
  readonly flags: ReadonlySet<string>;
  readonly values: ReadonlyMap<string, string>;
}

export function parseArgs(rawArgv: readonly string[]): CliArgs {
  // pnpm forwards a literal `--` before script args; drop it so it is never read as a flag.
  const argv = rawArgv.filter((token) => token !== '--');
  const flags = new Set<string>();
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined || !token.startsWith('--') || token.length <= 2) continue;
    const name = token.slice(2);
    if (FLAGS.has(name)) {
      flags.add(name);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`missing value for ${token}`);
    values.set(name, value);
    index += 1;
  }
  return { flags, values };
}

/** `--min-lat … --max-lng` as a box, or undefined when none are given. */
export function explicitBox(values: ReadonlyMap<string, string>): BoundingBox | undefined {
  const keys = ['min-lat', 'max-lat', 'min-lng', 'max-lng'] as const;
  const given = keys.map((key) => values.get(key));
  if (given.every((value) => value === undefined)) return undefined;
  const numbers = given.map(Number);
  if (
    given.some((value) => value === undefined) ||
    numbers.some((value) => !Number.isFinite(value))
  )
    throw new Error('give all of --min-lat --max-lat --min-lng --max-lng, as numbers');
  const [minLat, maxLat, minLng, maxLng] = numbers as [number, number, number, number];
  return { minLat, maxLat, minLng, maxLng };
}

function listValue(values: ReadonlyMap<string, string>, name: string): string[] {
  return (values.get(name) ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** `--set-bounds "slug:minLon,minLat,maxLon,maxLat;slug2:…"` as slug → box. */
export function parseSetBounds(value: string | undefined): Map<string, BoundingBox> {
  const boxes = new Map<string, BoundingBox>();
  for (const entry of (value ?? '').split(';').map((part) => part.trim())) {
    if (entry.length === 0) continue;
    const [slug, coords] = entry.split(':');
    const numbers = (coords ?? '').split(',').map(Number);
    if (slug === undefined || numbers.length !== 4 || numbers.some((n) => !Number.isFinite(n)))
      throw new Error(`--set-bounds entry "${entry}" is not slug:minLon,minLat,maxLon,maxLat`);
    const [minLng, minLat, maxLng, maxLat] = numbers as [number, number, number, number];
    if (minLng >= maxLng || minLat >= maxLat) throw new Error(`--set-bounds "${entry}" is empty`);
    boxes.set(slug, { minLat, maxLat, minLng, maxLng });
  }
  return boxes;
}

/** The region-pack bounds (`minLon,minLat,maxLon,maxLat`) for the guide destinations. */
export function guideBounds(): Map<string, BoundingBox> {
  return new Map(
    GUIDE_DESTINATION_EXTRACTS.map((entry) => {
      const [minLng, minLat, maxLng, maxLat] = entry.bounds.split(',').map(Number) as [
        number,
        number,
        number,
        number,
      ];
      return [entry.slug, { minLat, maxLat, minLng, maxLng }];
    }),
  );
}

async function writeNotice(slug: string, result: IngestDestinationResult): Promise<void> {
  const attributionDir = path.resolve(import.meta.dirname, 'attribution');
  await mkdir(attributionDir, { recursive: true });
  const notice = generateAttributionNotice({
    destinationSlug: slug,
    overtureRelease: process.env['OVERTURE_RELEASE'] ?? DEFAULT_OVERTURE_RELEASE,
    fsqOsIncluded: !result.fsqOsGated,
    generatedAt: new Date(),
  });
  await writeFile(path.join(attributionDir, `${slug}.NOTICE.md`), notice, 'utf8');
}

function summary(slug: string, result: IngestDestinationResult): string {
  const { fsqOsGated, sparseCoverage, ...counts } = result;
  return JSON.stringify({ slug, ...counts, sparseCoverage, fsqOsGated });
}

async function ingestOne(pool: pg.Pool, slug: string, box: BoundingBox | undefined, tz?: string) {
  let bbox = box;
  let timezone = tz;
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ id: string; tz: string | null }>('SELECT id, tz FROM destinations WHERE slug = $1', [
      slug,
    ]),
  );
  const row = rows[0];
  if (row === undefined) throw new Error(`no destination with slug "${slug}"`);
  if (bbox === undefined) {
    const [target] = await loadPlaceBounds(pool, [slug]);
    if (target === undefined)
      throw new Error(`"${slug}" has no place_bounds; run --backfill-bounds`);
    bbox = target.bbox;
  }
  timezone ??= row.tz ?? undefined;
  const result = await ingestDestination(pool, {
    destinationId: row.id,
    bbox,
    ...(timezone !== undefined ? { timezone } : {}),
  });
  console.log(summary(slug, result));
  await writeNotice(slug, result);
}

/**
 * Queues the worker's fan-out, or one job per slug in `only`: those read FSQ OS from `fsqRunId`
 * when given (a stored export run), else the catalog itself.
 */
async function enqueueOnWorker(
  connectionString: string,
  except: readonly string[],
  only: readonly string[],
  fsqRunId: string | undefined,
): Promise<void> {
  const logger = { info: console.log, warn: console.warn, error: console.error };
  const boss = createBoss({ connectionString, logger, applicationName: 'cp-ingest-cli' });
  await boss.start();
  try {
    const run = fsqRunId !== undefined ? { fsqRunId } : {};
    const payloads = only.length > 0 ? only.map((slug) => ({ slug, ...run })) : [{ except }];
    for (const payload of payloads) {
      // Named destinations go ahead of a monthly fan-out already queued.
      const jobId = await boss.send(PLACES_INGEST_QUEUE, payload, {
        priority: 'slug' in payload ? 10 : 0,
      });
      console.log(JSON.stringify({ queue: PLACES_INGEST_QUEUE, jobId, ...payload }));
    }
  } finally {
    await boss.stop({ graceful: false });
  }
}

async function main(): Promise<void> {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const connectionString = process.env['DATABASE_DIRECT_URL'];
  if (connectionString === undefined) throw new Error('DATABASE_DIRECT_URL is required');
  const except = listValue(values, 'except');

  if (flags.has('enqueue'))
    return enqueueOnWorker(
      connectionString,
      except,
      listValue(values, 'only'),
      values.get('fsq-run'),
    );

  const pool = createPool({ connectionString, max: 2 });
  try {
    for (const [slug, box] of parseSetBounds(values.get('set-bounds'))) {
      if (!(await setPlaceBounds(pool, slug, box))) throw new Error(`no destination "${slug}"`);
      console.log(JSON.stringify({ slug, placeBounds: box }));
    }
    if (flags.has('backfill-bounds')) {
      console.log(JSON.stringify(await backfillPlaceBounds(pool, guideBounds()), null, 2));
    }
    if (flags.has('all')) {
      await ingestAllDestinations(pool, {
        except,
        onProgress: ({ slug, result, error }) => {
          if (result !== undefined) {
            console.log(summary(slug, result));
            void writeNotice(slug, result);
          } else console.error(JSON.stringify({ slug, error: String(error) }));
        },
      });
    }
    const slug = values.get('slug');
    if (slug !== undefined) await ingestOne(pool, slug, explicitBox(values), values.get('tz'));
    const acted = ['all', 'backfill-bounds'].some((flag) => flags.has(flag));
    if (slug === undefined && !acted && !values.has('set-bounds')) {
      throw new Error('give --slug <slug>, --all, --backfill-bounds, --set-bounds or --enqueue');
    }
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
