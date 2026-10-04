/**
 * `places.ingest_tile`: one destination's place ingest, a tile at a time (`src/places/ingest-tile-run.ts`).
 *
 * A destination job on `places.ingest` plans the run's tiles and queues one `sources` job per tile
 * in a single insert (`queueTileRun`); the run's id is that destination job's id, so a retried
 * destination job finds its tiles already queued instead of queueing them twice. Each tile job
 * ingests Overture and FSQ OS inside its tile. The pg-boss jobs are the run's durable record: when
 * a tile ends with no other `sources` job of its run still queued, retrying or active, it queues
 * the run's `finish` job, which applies OpenStreetMap to the whole box, releases the stored FSQ
 * rows and reports the destination's totals and active count. A worker restart costs the tile it
 * stopped. The queue is `singleton`, like `places.ingest`, so one tile runs at a time with DuckDB's
 * memory capped; a run's `finish` job goes ahead of the next destination's tiles.
 */
import { DEFAULT_QUEUE_SPEC, type QueueSpec } from '@cp/domain';
import type { JobWithMetadata, PgBoss } from 'pg-boss';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss';
import { ingestTargets } from '../../places/ingest-all';
import {
  finishDestinationRun,
  ingestTile,
  type TileProgress,
  type TileRunSources,
} from '../../places/ingest-tile-run';
import type { IngestTile } from '../../places/ingest-tiles';
import { queuePlacePick } from './pick';

export const PLACES_INGEST_TILE_QUEUE = 'places.ingest_tile';

const MINUTE = 60;

/**
 * A `finish` job's expiry: London's OSM read and apply took 9 minutes; the extract download and
 * scan each stop at their own limits well before this.
 */
export const FINISH_EXPIRE_SECONDS = 40 * MINUTE;

export const PLACES_INGEST_TILE_SPEC: QueueSpec = {
  ...DEFAULT_QUEUE_SPEC,
  policy: 'singleton',
  // A deploy that stops the worker mid-tile costs that tile; it runs again.
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: false,
  // London's tiles took 74 s on average and 162 s at most; a slow step fails at its own limit
  // (`src/places/step-timeout.ts`) before this. `finish` jobs carry `FINISH_EXPIRE_SECONDS`.
  expireInSeconds: 15 * MINUTE,
};

const tileSchema = z.object({
  minLat: z.number(),
  maxLat: z.number(),
  minLng: z.number(),
  maxLng: z.number(),
  closedMaxLat: z.boolean(),
  closedMaxLng: z.boolean(),
});

const payloadSchema = z.object({
  runId: z.string().min(1),
  slug: z.string().min(1),
  stage: z.enum(['sources', 'finish']),
  /** The run's tile count, and this tile's place in it (`sources` only). */
  tiles: z.number().int().min(1),
  index: z.number().int().min(0).optional(),
  tile: tileSchema.optional(),
  fsqRunId: z.uuid().optional(),
  /** The destination job's priority, kept by its tiles; `finish` goes one above. */
  priority: z.number().int(),
  /** When the destination job started, for the run's duration. */
  startedAt: z.iso.datetime(),
});

export type PlacesIngestTilePayload = z.output<typeof payloadSchema>;

const OPEN_STATES: ReadonlySet<string> = new Set(['created', 'retry', 'active']);

async function runJobs(boss: PgBoss, runId: string): Promise<JobWithMetadata<unknown>[]> {
  return boss.findJobs(PLACES_INGEST_TILE_QUEUE, { data: { runId } });
}

function stageOf(job: JobWithMetadata<unknown>): unknown {
  return (job.data as { stage?: unknown } | null)?.stage;
}

export interface TileRunStart {
  readonly runId: string;
  readonly slug: string;
  readonly tiles: readonly IngestTile[];
  readonly fsqRunId: string | undefined;
  readonly priority: number;
  readonly startedAt: Date;
}

/** Queues a run's tile jobs unless its tiles are already queued; returns the run's tile job count. */
export async function queueTileRun(boss: PgBoss, run: TileRunStart): Promise<number> {
  const queued = await runJobs(boss, run.runId);
  if (queued.length > 0) return queued.filter((job) => stageOf(job) === 'sources').length;
  await boss.insert(
    PLACES_INGEST_TILE_QUEUE,
    run.tiles.map((tile, index) => ({
      priority: run.priority,
      data: {
        runId: run.runId,
        slug: run.slug,
        stage: 'sources',
        tiles: run.tiles.length,
        index,
        tile,
        ...(run.fsqRunId !== undefined ? { fsqRunId: run.fsqRunId } : {}),
        priority: run.priority,
        startedAt: run.startedAt.toISOString(),
      } satisfies PlacesIngestTilePayload,
    })),
  );
  return run.tiles.length;
}

/** Queues the run's `finish` job when no other tile of the run is still to run (see file header). */
async function finishWhenLast(
  boss: PgBoss,
  data: PlacesIngestTilePayload,
  selfId: string,
): Promise<boolean> {
  const jobs = await runJobs(boss, data.runId);
  const open = (job: JobWithMetadata<unknown>) => OPEN_STATES.has(job.state);
  if (jobs.some((job) => job.id !== selfId && stageOf(job) === 'sources' && open(job))) {
    return false;
  }
  if (jobs.some((job) => stageOf(job) === 'finish' && open(job))) return false;
  const finish: PlacesIngestTilePayload = {
    runId: data.runId,
    slug: data.slug,
    stage: 'finish',
    tiles: data.tiles,
    ...(data.fsqRunId !== undefined ? { fsqRunId: data.fsqRunId } : {}),
    priority: data.priority,
    startedAt: data.startedAt,
  };
  await boss.send(PLACES_INGEST_TILE_QUEUE, finish, {
    priority: data.priority + 1,
    expireInSeconds: FINISH_EXPIRE_SECONDS,
  });
  return true;
}

const COUNT_KEYS = [
  'overtureRows',
  'fsqOsRows',
  'inserted',
  'updated',
  'skipped',
  'ownedElsewhere',
];

/** Sums the run's finished tiles' counts, and counts the tiles that failed for good. */
function tileTotals(jobs: readonly JobWithMetadata<unknown>[]): {
  readonly counts: Record<string, number>;
  readonly failedTiles: number;
} {
  const counts: Record<string, number> = Object.fromEntries(COUNT_KEYS.map((key) => [key, 0]));
  let failedTiles = 0;
  for (const job of jobs) {
    if (stageOf(job) !== 'sources') continue;
    if (job.state === 'failed') failedTiles += 1;
    if (job.state !== 'completed') continue;
    const output = job.output as Record<string, unknown>;
    for (const key of COUNT_KEYS) {
      const value = output[key];
      if (typeof value === 'number') counts[key] = (counts[key] ?? 0) + value;
    }
  }
  return { counts, failedTiles };
}

/** The tile queue; `sources` overrides the readers (tests). */
export function placesIngestTileJob(sources: TileRunSources = {}): AnyJobDefinition {
  return defineJob({
    queue: PLACES_INGEST_TILE_QUEUE,
    spec: PLACES_INGEST_TILE_SPEC,
    schema: payloadSchema,
    async handler(data, { pool, boss, logger, job }) {
      const { runId, slug } = data;
      const [target] = await ingestTargets(pool, { slugs: [slug] });
      if (target === undefined) {
        logger.warn({ slug, runId }, 'places ingest tile skipped: destination has no place bounds');
        return { slug, runId, skipped: 'no_place_bounds' };
      }
      const progress: TileProgress = (step, details) =>
        logger.info(
          { slug, runId, stage: data.stage, tile: data.index, step, ...details },
          'places ingest tile step',
        );

      if (data.stage === 'sources') {
        if (data.tile === undefined) throw new Error('a sources tile job needs its tile');
        try {
          const result = await ingestTile(
            pool,
            target,
            data.tile,
            data.fsqRunId,
            sources,
            progress,
          );
          const finishQueued = await finishWhenLast(boss, data, job.id);
          return { slug, runId, tile: data.index, of: data.tiles, ...result, finishQueued };
        } catch (error) {
          // A tile that fails for good must not leave its run without a finish.
          if (job.isFinalAttempt) await finishWhenLast(boss, data, job.id).catch(() => false);
          throw error;
        }
      }

      const jobs = await runJobs(boss, runId);
      const waiting = jobs.filter(
        (other) => stageOf(other) === 'sources' && OPEN_STATES.has(other.state),
      ).length;
      // Only a tile stuck active after a crash gets here early; it queues a new finish when done.
      if (waiting > 0) return { slug, runId, waiting };
      const { counts, failedTiles } = tileTotals(jobs);
      const result = await finishDestinationRun(
        pool,
        target,
        { fsqRunId: data.fsqRunId, releaseFsqRows: failedTiles === 0 },
        sources,
        progress,
      );
      const minutes = Math.round((Date.now() - Date.parse(data.startedAt)) / 60_000);
      const summary = {
        slug,
        runId,
        tiles: data.tiles,
        failedTiles,
        minutes,
        ...counts,
        upserted: (counts['inserted'] ?? 0) + (counts['updated'] ?? 0),
        ...result,
      };
      logger.info(summary, 'places ingest finished');
      // The catalogue just changed: a destination without a curated set has its picks made again
      // from the full set, also when a draft made them inline from the rows that had landed by
      // then (a re-run replaces ranks without rewriting unchanged rows; the job skips a curated
      // destination). The ingest is done either way.
      await queuePlacePick(boss, slug, true).catch((error: unknown) =>
        logger.warn({ err: error, slug }, 'places pick not queued after the ingest'),
      );
      return summary;
    },
  });
}
