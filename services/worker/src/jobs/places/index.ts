/**
 * `places.ingest` (monthly, 1st at 02:00 UTC): refreshes every destination's open-data places.
 *
 * The cron's run (no `slug`) is the fan-out: it fills missing `place_bounds`, exports FSQ OS once
 * for every destination (`src/places/fsq-export.ts`), then enqueues one job per destination with
 * the export directory. The queue's `singleton` policy keeps one job active at a time, so the
 * destinations run one after another, each with DuckDB's memory capped. A destination job ingests
 * its bounds (`src/places/ingest-all.ts#ingestPlaceDestination`). An operator can enqueue the
 * fan-out with `except` to hold destinations back, or one destination by `slug`.
 */
import { DEFAULT_QUEUE_SPEC, type QueueSpec } from '@cp/domain';
import { z } from 'zod';

import { defineJob, enqueue, type AnyJobDefinition, type JobDefinition } from '../../boss';
import { ingestPlaceDestination, ingestTargets, prepareFsqExport } from '../../places/ingest-all';
import { backfillPlaceBounds } from '../../places/place-bounds';

export const PLACES_INGEST_QUEUE = 'places.ingest';

const HOUR = 3_600;

export const PLACES_INGEST_SPEC: QueueSpec = {
  ...DEFAULT_QUEUE_SPEC,
  policy: 'singleton',
  retryLimit: 1,
  retryDelay: 600,
  // A metro of half a million places takes tens of minutes; the fan-out holds the FSQ OS scan.
  expireInSeconds: 3 * HOUR,
  cron: { expr: '0 2 1 * *', tz: 'UTC' },
};

const payloadSchema = z
  .object({
    slug: z.string().min(1).optional(),
    except: z.array(z.string().min(1)).optional(),
    fsqExportDir: z.string().min(1).optional(),
  })
  .nullish();

export type PlacesIngestPayload = z.output<typeof payloadSchema>;

export function placesIngestJob(): AnyJobDefinition {
  const job: JobDefinition<PlacesIngestPayload> = defineJob({
    queue: PLACES_INGEST_QUEUE,
    spec: PLACES_INGEST_SPEC,
    schema: payloadSchema,
    async handler(data, { pool, boss, logger }) {
      const slug = data?.slug;
      if (slug !== undefined) {
        const [target] = await ingestTargets(pool, { slugs: [slug] });
        if (target === undefined) {
          logger.warn({ slug }, 'places ingest skipped: destination has no place bounds');
          return { slug, skipped: 'no_place_bounds' };
        }
        const result = await ingestPlaceDestination(pool, target, data?.fsqExportDir);
        logger.info({ slug, ...result }, 'places ingest finished');
        return { slug, ...result };
      }

      const bounds = await backfillPlaceBounds(pool);
      if (bounds.unresolved.length > 0) {
        logger.warn({ unresolved: bounds.unresolved }, 'destinations without place bounds');
      }
      const targets = await ingestTargets(pool, { except: data?.except ?? [] });
      const fsqExportDir = await prepareFsqExport(targets);
      for (const target of targets) {
        await enqueue(boss, job, {
          slug: target.slug,
          ...(fsqExportDir !== undefined ? { fsqExportDir } : {}),
        });
      }
      logger.info(
        { destinations: targets.length, filledBounds: bounds.filled.length },
        'places ingest fanned out',
      );
      return {
        destinations: targets.length,
        filledBounds: bounds.filled.length,
        unresolved: bounds.unresolved,
      };
    },
  });
  return job;
}
