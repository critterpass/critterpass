/**
 * `places.curated_osm_lookup` (operator only, queued by the curated places loader with `--osm`):
 * one curated place no row carries, looked up in OpenStreetMap and added with its curated note
 * (`src/places/curated-load/osm-place.ts`). One job at a time through one search client per
 * process, which keeps Nominatim's one request a second and pauses every lookup while Nominatim
 * refuses. The outcome is the job's output and a log line.
 */
import { curatedOsmLookupKey, PLACES_QUEUES } from '@cp/domain';
import { createNominatimSearch, type NominatimClient } from '@cp/suppliers';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss';
import { lookUpCuratedPlace } from '../../places/curated-load/osm-place';
import { curatedPlaceRowSchema } from '../../places/curated-load/rows';

export const CURATED_OSM_LOOKUP_QUEUE = PLACES_QUEUES.curatedOsmLookup;

export const curatedOsmLookupJobSchema = z.object({
  /** The place's line in its destination's file (its curated rank). */
  rank: z.number().int().min(1),
  place: curatedPlaceRowSchema,
  /** Ask OSM and report without writing. */
  dry_run: z.boolean().optional(),
});
export type CuratedOsmLookupJob = z.input<typeof curatedOsmLookupJobSchema>;

export function curatedOsmLookupJob(
  search: NominatimClient = createNominatimSearch(),
): AnyJobDefinition {
  return defineJob({
    queue: CURATED_OSM_LOOKUP_QUEUE,
    schema: curatedOsmLookupJobSchema,
    singletonKey: (data) => curatedOsmLookupKey(data.place.destination, data.place.name_en),
    concurrency: 1,
    async handler(data, { pool, logger }) {
      const result = await lookUpCuratedPlace(
        pool,
        { rank: data.rank, place: data.place, dryRun: data.dry_run === true },
        search,
      );
      logger.info(
        { destination: data.place.destination, place: data.place.name_en, ...result },
        'curated place looked up in OpenStreetMap',
      );
      return { destination: data.place.destination, place: data.place.name_en, ...result };
    },
  });
}
