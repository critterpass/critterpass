/**
 * Destination base-set queues: `destinations.base_build` (monthly, or an operator's run, with
 * `dry_run` to report without writing), `destinations.critter_match` (the critters of one build's
 * new or changed rows) and `destinations.describe` (one row's facts-only lines, under a daily cap).
 */
import { z } from 'zod';

import type { QueueSpec } from '../jobs/catalogue';

export const DESTINATIONS_QUEUES = {
  baseBuild: 'destinations.base_build',
  critterMatch: 'destinations.critter_match',
  describe: 'destinations.describe',
} as const;

export const DESTINATIONS_QUEUE_SPECS = {
  'destinations.base_build': {
    policy: 'singleton',
    retryLimit: 1,
    retryDelay: 600,
    expireInSeconds: 3 * 60 * 60,
    cron: { expr: '0 5 3 * *', tz: 'UTC' },
  },
  'destinations.critter_match': {
    policy: 'singleton',
    retryLimit: 2,
    retryDelay: 60,
    expireInSeconds: 60 * 60,
  },
  // Keyed by destination: one run at a time per row.
  'destinations.describe': {
    policy: 'stately',
    retryLimit: 2,
    retryDelay: 60,
    expireInSeconds: 5 * 60,
  },
} as const satisfies Record<string, Partial<QueueSpec>>;

export function destinationsQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof DESTINATIONS_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(DESTINATIONS_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof DESTINATIONS_QUEUE_SPECS, QueueSpec>;
}

export const DESTINATIONS_QUEUE_DESCRIPTIONS: Readonly<
  Record<keyof typeof DESTINATIONS_QUEUE_SPECS, string>
> = {
  'destinations.base_build':
    'Rebuilds the destination base set from Wikidata and GeoNames and queues photos, critters and lines',
  'destinations.critter_match': 'Gives every base destination without one its neighbour critter',
  'destinations.describe':
    'Writes one base destination’s facts-only line and about text in en and vi',
};

export const destinationsBaseBuildJobSchema = z.object({
  /** Report what a build would write without writing. */
  dry_run: z.boolean().optional(),
});
export const destinationsCritterMatchJobSchema = z.object({
  /** Match rows that already have a critter again (never seed or critter rows). */
  rematch: z.boolean().optional(),
});
export const destinationsDescribeJobSchema = z.object({ destination_id: z.uuid() });

export const destinationsDescribeKey = (destinationId: string) => `describe:${destinationId}`;
