/**
 * `places.map_region_register` (docs/api-contracts-async.md §2.3, every 20 minutes): makes a
 * region pack that was put on the tiles bucket visible to the app, with no manual step
 * (`../../places/map-region-register.ts`). It logs counts only.
 */
import { PLACES_QUEUES } from '@cp/domain';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss';
import { registerMapRegions } from '../../places/map-region-register';

export function mapRegionRegisterJob(options: { readonly tilesBaseUrl: string }): AnyJobDefinition {
  return defineJob({
    queue: PLACES_QUEUES.mapRegionRegister,
    schema: z.object({}).nullish(),
    async handler(_data, { pool, logger, job }) {
      const report = await registerMapRegions(pool, {
        tilesBaseUrl: options.tilesBaseUrl,
        signal: job.signal,
      });
      logger.info({ ...report }, 'map region registration finished');
      return { ...report };
    },
  });
}
