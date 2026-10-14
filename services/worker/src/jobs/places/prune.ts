/**
 * `places.prune` (operator only, never scheduled): prunes the open-data place index to the lean
 * rule and the kept set (`src/places/prune.ts`). `{dry_run: true}`, the default, reports the counts;
 * `{dry_run: false}` dumps `pois` to the backup bucket first, then deletes in batches.
 */
import { PLACES_QUEUES, placesPruneJobSchema } from '@cp/domain';

import { defineJob, type AnyJobDefinition } from '../../boss';
import { prunePlaces, type PruneDump } from '../../places/prune';

export const PLACES_PRUNE_QUEUE = PLACES_QUEUES.prune;

export interface PlacesPruneJobConfig {
  /** The backup bucket and dump role; without them only a dry run can run. */
  readonly dump: PruneDump | undefined;
  readonly batchSize?: number;
  readonly pauseMs?: number;
}

export function placesPruneJob(config: PlacesPruneJobConfig): AnyJobDefinition {
  return defineJob({
    queue: PLACES_PRUNE_QUEUE,
    schema: placesPruneJobSchema,
    async handler(data, { pool, logger, job }) {
      const result = await prunePlaces(pool, {
        dryRun: data?.dry_run ?? true,
        logger,
        dump: config.dump,
        signal: job.signal,
        ...(config.batchSize === undefined ? {} : { batchSize: config.batchSize }),
        ...(config.pauseMs === undefined ? {} : { pauseMs: config.pauseMs }),
      });
      return { ...result };
    },
  });
}
