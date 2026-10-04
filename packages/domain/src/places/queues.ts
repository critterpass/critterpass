/**
 * Place job queues (docs/api-contracts-async.md §2.3): the Foursquare id match for curated POIs that
 * open data did not link to Foursquare. Monthly for every destination (new curated POIs, and misses
 * older than the retry window), or on demand for one destination from the console.
 */
import { z } from 'zod';

import type { QueueSpec } from '../jobs/catalogue';

/** The weekly opening-hours research queue lives beside its payload and skip list. */
export * from './hours-research';

export const PLACES_QUEUES = {
  foursquareMatch: 'places.fsq_match',
  ingest: 'places.ingest',
} as const;

export const PLACES_QUEUE_SPECS = {
  'places.fsq_match': {
    policy: 'stately',
    retryLimit: 2,
    retryDelay: 600,
    expireInSeconds: 2 * 60 * 60,
    cron: { expr: '0 4 2 * *', tz: 'UTC' },
  },
  // Monthly for every destination, or on demand for one: one run at a time per key, the rest wait.
  // A destination job only plans its tiles; the fan-out also fills missing place boxes.
  'places.ingest': {
    policy: 'singleton',
    retryLimit: 3,
    retryDelay: 60,
    expireInSeconds: 60 * 60,
    cron: { expr: '0 2 1 * *', tz: 'UTC' },
  },
} as const satisfies Record<string, Partial<QueueSpec>>;

export function placesQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof PLACES_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(PLACES_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof PLACES_QUEUE_SPECS, QueueSpec>;
}

export const PLACES_QUEUE_DESCRIPTIONS: Readonly<Record<keyof typeof PLACES_QUEUE_SPECS, string>> =
  {
    'places.fsq_match': 'Links curated places to their Foursquare ids for live place details',
    'places.ingest': "Plans a destination's open-data place tiles, or every destination's monthly",
  };

export const foursquareMatchJobSchema = z.object({
  /** One destination slug; unset = every destination with curated places. */
  destination: z.string().min(1).optional(),
});
export type FoursquareMatchJob = z.infer<typeof foursquareMatchJobSchema>;
