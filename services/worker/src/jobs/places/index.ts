/**
 * `places.ingest` (monthly, 1st at 02:00 UTC): refreshes the open-data places of the destinations
 * in use (`usedSlugs`): a trip in any phase (its destination or one of its stops), or a pitch in
 * the last 180 days. A curated destination counts only through those; there is no
 * country list. A destination's first use queues its ingest on demand
 * (services/api/src/places/on-demand-ingest.ts).
 *
 * The cron's run (no `slug`) is the fan-out: it fills missing `place_bounds`, then queues one
 * `places.ingest` job per destination. Places come from Overture and OpenStreetMap only
 * (docs/product-decisions.md D38): no FSQ OS export is started, whatever the environment. A
 * destination job (`slug`) queues its run on `places.ingest_tile` (`./ingest-tile.ts`), which does
 * the reading and writing. Every queue here keeps one job active at a time (`singleton`), so
 * DuckDB's memory stays capped.
 * An operator can enqueue the fan-out with `except` to hold destinations back, or one destination
 * by `slug`; a pitch or a trip in a sparse destination queues its `slug` on demand
 * (services/api/src/places/on-demand-ingest.ts), and a destination without a place box gets one
 * before it is planned.
 */
import { USED_DESTINATIONS_SQL, USED_WINDOW_DAYS, withSystem } from '@cp/db';
import { PLACES_QUEUES, queueSpec, type QueueSpec } from '@cp/domain';
import type pg from 'pg';
import type { PgBoss } from 'pg-boss';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition, type JobDefinition } from '../../boss';
import { ingestTargets } from '../../places/ingest-all';
import { planDestinationTiles, type TileRunSources } from '../../places/ingest-tile-run';
import { backfillPlaceBounds } from '../../places/place-bounds';
import { placesIngestTileJob, queueTileRun } from './ingest-tile';

export { mapRegionRegisterJob } from './map-region-register';

export const PLACES_INGEST_QUEUE = PLACES_QUEUES.ingest;
/** From the shared catalogue, so the api creates the queue with the same policy. */
export const PLACES_INGEST_SPEC: QueueSpec = queueSpec(PLACES_INGEST_QUEUE);

const payloadSchema = z
  .object({
    slug: z.string().min(1).optional(),
    except: z.array(z.string().min(1)).optional(),
  })
  .nullish();

export type PlacesIngestPayload = z.output<typeof payloadSchema>;

/**
 * The slugs of destinations in use (`USED_DESTINATIONS_SQL` in `@cp/db`, which the prune shares):
 * a trip in any phase, as its destination or a stop, or a pitch in the last `USED_WINDOW_DAYS`.
 */
export async function usedSlugs(pool: pg.Pool): Promise<string[]> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ slug: string }>(
      `SELECT d.slug FROM destinations d WHERE d.id IN (${USED_DESTINATIONS_SQL}) ORDER BY d.slug`,
      [USED_WINDOW_DAYS],
    ),
  );
  return rows.map((row) => row.slug);
}

/** Queues one destination ingest per slug. */
async function queueDestinations(boss: PgBoss, slugs: readonly string[]): Promise<void> {
  for (const slug of slugs) await boss.send(PLACES_INGEST_QUEUE, { slug }, { priority: 0 });
}

/** Test overrides: the tile readers. */
export interface PlacesJobsOptions {
  readonly sources?: TileRunSources;
}

export function placesIngestJob(): AnyJobDefinition {
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
        const queued = await queueTileRun(boss, {
          runId: job.id,
          slug,
          tiles: planDestinationTiles(target),
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
      const targets = await ingestTargets(pool, {
        except: data?.except ?? [],
        slugs: await usedSlugs(pool),
      });
      await queueDestinations(
        boss,
        targets.map((target) => target.slug),
      );
      const slugs = targets.map((target) => target.slug);
      logger.info({ destinations: targets.length, slugs }, 'places ingest fanned out');
      return { destinations: targets.length, slugs, filledBounds: bounds.filled.length };
    },
  });
  return job;
}

/** The places queues, for the job registry. */
export function placesJobs(options: PlacesJobsOptions = {}): AnyJobDefinition[] {
  return [placesIngestJob(), placesIngestTileJob(options.sources)];
}
