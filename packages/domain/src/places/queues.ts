/**
 * Place job queues (docs/api-contracts-async.md §2.3): the Foursquare id match for curated POIs that
 * open data did not link to Foursquare. Monthly for every destination (new curated POIs, and misses
 * older than the retry window), or on demand for one destination from the console. Beside it, the
 * open-data ingest, the registration of region map packs found on the tiles bucket, and the
 * machine picks for a destination without a curated set (`places.pick`).
 */
import { z } from 'zod';

import type { QueueSpec } from '../jobs/catalogue';

/** The weekly opening-hours research queue lives beside its payload and skip list. */
export * from './hours-research';

export const PLACES_QUEUES = {
  foursquareMatch: 'places.fsq_match',
  ingest: 'places.ingest',
  mapRegionRegister: 'places.map_region_register',
  pick: 'places.pick',
  tripRefresh: 'places.trip_refresh',
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
  // Three times an hour, so a pack put on the tiles bucket reaches the app well inside an hour.
  // Nothing is retried: the next run asks the bucket again.
  'places.map_region_register': {
    policy: 'stately',
    retryLimit: 0,
    expireInSeconds: 10 * 60,
    cron: { expr: '7,27,47 * * * *', tz: 'UTC' },
  },
  // Keyed by destination slug: one run at a time per destination, and one more waiting behind it.
  'places.pick': {
    policy: 'stately',
    retryLimit: 2,
    retryDelay: 60,
    expireInSeconds: 10 * 60,
  },
  // Keyed by trip: one refresh of its places at a time, and one more waiting behind it.
  'places.trip_refresh': {
    policy: 'stately',
    retryLimit: 3,
    retryDelay: 10,
    expireInSeconds: 5 * 60,
    keepCompletedSeconds: 24 * 60 * 60,
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
    'places.map_region_register': 'Registers region map packs that appeared on the tiles bucket',
    'places.pick': 'Picks the places to suggest in a destination without a curated set',
    'places.trip_refresh': "Brings a trip's synced place cards in line with the places it uses",
  };

export const foursquareMatchJobSchema = z.object({
  /** One destination slug; unset = every destination with curated places. */
  destination: z.string().min(1).optional(),
});
export type FoursquareMatchJob = z.infer<typeof foursquareMatchJobSchema>;

export const placesPickJobSchema = z.object({
  /** The destination's slug. */
  destination: z.string().min(1),
  /** Pick again even when the destination already has picks (an operator's re-run). */
  force: z.boolean().optional(),
});
export type PlacesPickJob = z.infer<typeof placesPickJobSchema>;

/** The `places.pick` singleton key: one run per destination at a time. */
export function placesPickKey(slug: string): string {
  return `pick:${slug}`;
}
