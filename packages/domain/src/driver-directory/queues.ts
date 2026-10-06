/**
 * Driver directory jobs: hourly invite expiry; the nightly stats refresh with the rating-ring
 * check; and the purge of listings ops took down, after the review window.
 */
import type { QueueSpec } from '../jobs/catalogue';

export const DRIVER_DIRECTORY_QUEUES = {
  inviteExpire: 'driver_invite.expire',
  listingStats: 'driver_listing.stats',
  purgeRemoved: 'driver_listing.purge_removed',
} as const;

/** A listing ops took down stays this long (so the same number cannot re-list at once). */
export const TAKEN_DOWN_LISTING_RETENTION_DAYS = 180;

export const DRIVER_DIRECTORY_QUEUE_SPECS = {
  'driver_invite.expire': {
    policy: 'singleton',
    retryLimit: 2,
    cron: { expr: '15 * * * *', tz: 'UTC' },
  },
  'driver_listing.stats': {
    policy: 'singleton',
    retryLimit: 2,
    expireInSeconds: 15 * 60,
    cron: { expr: '20 2 * * *', tz: 'UTC' },
  },
  'driver_listing.purge_removed': {
    policy: 'singleton',
    retryLimit: 2,
    cron: { expr: '50 3 * * *', tz: 'UTC' },
  },
  // The shared text check a crew's tip is sent to. The api creates the queue it sends to, so it
  // needs the spec here; the values are the worker's own for this queue.
  'compliance.check': { policy: 'exclusive', deadLetter: true, notify: true },
} as const satisfies Record<string, Partial<QueueSpec>>;

export const DRIVER_DIRECTORY_QUEUE_DESCRIPTIONS = {
  'driver_invite.expire': 'Switches off driver invites past their 30 days',
  'driver_listing.stats': 'Refreshes driver listing stats and checks for rating rings',
  'driver_listing.purge_removed': 'Deletes driver listings ops took down, after the review window',
  'compliance.check': 'Screens text created offline',
} as const satisfies Record<keyof typeof DRIVER_DIRECTORY_QUEUE_SPECS, string>;

export function driverDirectoryQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof DRIVER_DIRECTORY_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(DRIVER_DIRECTORY_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof DRIVER_DIRECTORY_QUEUE_SPECS, QueueSpec>;
}
