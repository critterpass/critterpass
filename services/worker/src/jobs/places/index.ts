/**
 * `places.ingest` (monthly, 1st at 02:00 UTC): refreshes every destination's open-data places, or
 * only those of the countries in `PLACES_REFRESH_COUNTRIES` (ISO codes, comma-separated) when set.
 *
 * The cron's run (no `slug`) is the fan-out: it fills missing `place_bounds`, then, when the FSQ OS
 * Places catalog is configured, starts an export run (`src/places/fsq-export-runs.ts`) and queues
 * one `places.fsq_export_chunk` job per group of the catalog's data files. Each chunk lands its rows
 * durably, so a worker restart costs one chunk; the chunk that completes the run queues one
 * `places.ingest` job per destination with the run id. Without the catalog it queues the
 * destinations at once. A destination job (`slug`) plans its ingest as tiles and queues them on
 * `places.ingest_tile` (`./ingest-tile.ts`), which does the reading and writing one tile at a time.
 * Every queue here keeps one job active at a time (`singleton`), so DuckDB's memory stays capped.
 * An operator can enqueue the fan-out with `except` to hold destinations back, or one destination
 * by `slug`; a pitch or a trip in a sparse destination queues its `slug` on demand
 * (services/api/src/places/on-demand-ingest.ts), and a destination without a place box gets one
 * before it is planned.
 */
import { withSystem } from '@cp/db';
import { DEFAULT_QUEUE_SPEC, PLACES_QUEUES, queueSpec, type QueueSpec } from '@cp/domain';
import type pg from 'pg';
import type { PgBoss } from 'pg-boss';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition, type JobDefinition } from '../../boss';
import {
  claimFanOut,
  exportFsqChunk,
  listFsqDataFiles,
  runSlugs,
  startFsqExportRun,
} from '../../places/fsq-export-runs';
import { ingestTargets } from '../../places/ingest-all';
import { planDestinationTiles, type TileRunSources } from '../../places/ingest-tile-run';
import { backfillPlaceBounds, type DestinationPlaceBounds } from '../../places/place-bounds';
import { fsqOsSource } from '../../places/source-readers';
import { placesIngestTileJob, queueTileRun } from './ingest-tile';

export { mapRegionRegisterJob } from './map-region-register';

export const PLACES_INGEST_QUEUE = PLACES_QUEUES.ingest;
export const PLACES_FSQ_EXPORT_CHUNK_QUEUE = 'places.fsq_export_chunk';

const HOUR = 3_600;

/** From the shared catalogue, so the api creates the queue with the same policy. */
export const PLACES_INGEST_SPEC: QueueSpec = queueSpec(PLACES_INGEST_QUEUE);

export const PLACES_FSQ_EXPORT_CHUNK_SPEC: QueueSpec = {
  ...DEFAULT_QUEUE_SPEC,
  policy: 'singleton',
  // A deploy that stops the worker mid-chunk costs that chunk; it runs again.
  retryLimit: 3,
  retryDelay: 60,
  expireInSeconds: HOUR,
};

const payloadSchema = z
  .object({
    slug: z.string().min(1).optional(),
    except: z.array(z.string().min(1)).optional(),
    fsqRunId: z.uuid().optional(),
  })
  .nullish();

export type PlacesIngestPayload = z.output<typeof payloadSchema>;

const chunkSchema = z.object({
  runId: z.uuid(),
  chunk: z.number().int().min(0),
  /** The destination jobs' priority once the export lands (a one-destination run keeps its own). */
  priority: z.number().int().optional(),
});

/**
 * The countries the monthly refresh covers (`PLACES_REFRESH_COUNTRIES`, e.g. `VN` or `VN,TH`), as
 * upper-case ISO codes; null for every destination.
 */
export function refreshCountries(env: NodeJS.ProcessEnv = process.env): readonly string[] | null {
  const codes = (env['PLACES_REFRESH_COUNTRIES'] ?? '')
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter((code) => /^[A-Z]{2}$/.test(code));
  return codes.length === 0 ? null : [...new Set(codes)];
}

/** The slugs of the destinations whose critter set is in one of `countries`. */
async function slugsInCountries(pool: pg.Pool, countries: readonly string[]): Promise<string[]> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ slug: string }>(
      `SELECT d.slug FROM destinations d JOIN critter_sets s ON s.id = d.critter_set_id
        WHERE s.country = ANY($1::text[]) ORDER BY d.slug`,
      [countries],
    ),
  );
  return rows.map((row) => row.slug);
}

/** Queues one destination ingest per slug, reading FSQ OS from `fsqRunId` when given. */
async function queueDestinations(
  boss: PgBoss,
  slugs: readonly string[],
  fsqRunId?: string,
  priority = 0,
): Promise<void> {
  for (const slug of slugs) {
    await boss.send(
      PLACES_INGEST_QUEUE,
      { slug, ...(fsqRunId !== undefined ? { fsqRunId } : {}) },
      { priority },
    );
  }
}

/**
 * Starts an FSQ OS export run for `targets` and queues its chunks. The monthly fan-out replaces
 * older runs; a one-destination run keeps them, since other destinations may still be reading theirs.
 */
async function startExport(
  pool: pg.Pool,
  boss: PgBoss,
  targets: readonly DestinationPlaceBounds[],
  options: { readonly replaceOlder: boolean; readonly priority: number },
): Promise<{ readonly runId: string; readonly chunks: number; readonly files: number }> {
  const files = await listFsqDataFiles();
  const run = await startFsqExportRun(
    pool,
    targets.map((target) => ({ slug: target.slug, ...target.bbox })),
    files,
    { replaceOlder: options.replaceOlder },
  );
  for (let index = 0; index < run.chunks; index += 1) {
    await boss.send(
      PLACES_FSQ_EXPORT_CHUNK_QUEUE,
      { runId: run.runId, chunk: index, priority: options.priority },
      { priority: options.priority },
    );
  }
  return { ...run, files: files.length };
}

/** Test overrides: the tile readers and the FSQ rows a tile may hold. */
export interface PlacesJobsOptions {
  readonly sources?: TileRunSources;
  readonly maxTileFsqRows?: number;
}

export function placesIngestJob(options: PlacesJobsOptions = {}): AnyJobDefinition {
  const job: JobDefinition<PlacesIngestPayload> = defineJob({
    queue: PLACES_INGEST_QUEUE,
    spec: PLACES_INGEST_SPEC,
    schema: payloadSchema,
    async handler(data, { pool, boss, logger, job }) {
      const slug = data?.slug;
      if (slug !== undefined) {
        let [target] = await ingestTargets(pool, { slugs: [slug] });
        // Queued on demand for a destination nobody ingested yet: find its box first.
        if (target === undefined) {
          await backfillPlaceBounds(pool);
          [target] = await ingestTargets(pool, { slugs: [slug] });
        }
        if (target === undefined) {
          logger.warn({ slug }, 'places ingest skipped: destination has no place bounds');
          return { slug, skipped: 'no_place_bounds' };
        }
        const [self] = await boss.findJobs(PLACES_INGEST_QUEUE, { id: job.id });
        const priority = self?.priority ?? 0;
        // Without a stored run, every tile would scan the whole FSQ OS catalog: export this
        // destination's rows in restartable chunks first; the last chunk queues it again with the run.
        if (data?.fsqRunId === undefined && fsqOsSource() === 'iceberg') {
          const run = await startExport(pool, boss, [target], { replaceOlder: false, priority });
          logger.info({ slug, ...run }, 'places fsq export started');
          return { slug, fsqExport: run };
        }
        const tiles = await planDestinationTiles(
          pool,
          target,
          data?.fsqRunId,
          options.maxTileFsqRows,
        );
        const queued = await queueTileRun(boss, {
          runId: job.id,
          slug,
          tiles,
          fsqRunId: data?.fsqRunId,
          priority,
          startedAt: self?.startedOn ?? new Date(),
        });
        logger.info({ slug, runId: job.id, tiles: queued }, 'places ingest tiles queued');
        return { slug, runId: job.id, tiles: queued };
      }

      const bounds = await backfillPlaceBounds(pool);
      if (bounds.unresolved.length > 0) {
        logger.warn({ unresolved: bounds.unresolved }, 'destinations without place bounds');
      }
      const countries = refreshCountries();
      const targets = await ingestTargets(pool, {
        except: data?.except ?? [],
        ...(countries === null ? {} : { slugs: await slugsInCountries(pool, countries) }),
      });
      if (fsqOsSource() !== 'iceberg' || targets.length === 0) {
        await queueDestinations(
          boss,
          targets.map((target) => target.slug),
        );
        logger.info({ destinations: targets.length, countries }, 'places ingest fanned out');
        return { destinations: targets.length, filledBounds: bounds.filled.length };
      }
      const run = await startExport(pool, boss, targets, { replaceOlder: true, priority: 0 });
      logger.info({ destinations: targets.length, ...run }, 'places fsq export started');
      return { destinations: targets.length, filledBounds: bounds.filled.length, ...run };
    },
  });
  return job;
}

export function placesFsqExportChunkJob(): AnyJobDefinition {
  return defineJob({
    queue: PLACES_FSQ_EXPORT_CHUNK_QUEUE,
    spec: PLACES_FSQ_EXPORT_CHUNK_SPEC,
    schema: chunkSchema,
    async handler({ runId, chunk, priority }, { pool, boss, logger }) {
      const rows = await exportFsqChunk(pool, runId, chunk);
      if (await claimFanOut(pool, runId)) {
        const slugs = await runSlugs(pool, runId);
        await queueDestinations(boss, slugs, runId, priority);
        logger.info({ runId, destinations: slugs.length }, 'places fsq export finished');
      }
      return { runId, chunk, rows };
    },
  });
}

/** The places queues, for the job registry. */
export function placesJobs(options: PlacesJobsOptions = {}): AnyJobDefinition[] {
  return [
    placesIngestJob(options),
    placesIngestTileJob(options.sources),
    placesFsqExportChunkJob(),
  ];
}
