/**
 * Supplier job queues (docs/api-contracts-async.md §2.2, §2.3): the timer that lets a hold go
 * (and closes the votes on it) just before the supplier's deadline, the status poll for bookings
 * waiting on the operator, and the daily import of partner booking statistics.
 */
import type { QueueSpec } from '../jobs/catalogue';

export const SUPPLIER_QUEUES = {
  holdExpiry: 'supplier.hold_expiry',
  viatorPoll: 'supplier.viator_poll',
  affiliateConversions: 'supplier.affiliate_conversions',
} as const;

export const SUPPLIER_QUEUE_SPECS = {
  // The `scheduled_events` timer armed when a hold is taken, keyed by the order.
  'supplier.hold_expiry': { policy: 'exclusive', retryLimit: 3, deadLetter: true, notify: true },
  // Every 3 minutes: bookings still waiting on the operator whose next poll is due (Viator asks for
  // no more than one status read per booking every 3 minutes).
  'supplier.viator_poll': {
    policy: 'stately',
    retryLimit: 1,
    expireInSeconds: 5 * 60,
    cron: { expr: '*/3 * * * *', tz: 'UTC' },
  },
  // Daily, after the partners' own overnight reconciliation.
  'supplier.affiliate_conversions': {
    policy: 'stately',
    retryLimit: 2,
    expireInSeconds: 30 * 60,
    cron: { expr: '30 3 * * *', tz: 'UTC' },
  },
} as const satisfies Record<string, Partial<QueueSpec>>;

export function supplierQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof SUPPLIER_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(SUPPLIER_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof SUPPLIER_QUEUE_SPECS, QueueSpec>;
}

export const SUPPLIER_QUEUE_DESCRIPTIONS: Readonly<
  Record<keyof typeof SUPPLIER_QUEUE_SPECS, string>
> = {
  'supplier.hold_expiry': 'Lets a supplier hold go before it lapses and closes the votes on it',
  'supplier.viator_poll': 'Reads the status of Viator bookings waiting on the operator',
  'supplier.affiliate_conversions': 'Imports partner booking statistics into affiliate conversions',
};

/** The worker's status poll authenticates to the api's settle door with this header. */
export const SUPPLIER_INTERNAL_SECRET_HEADER = 'x-cp-suppliers-secret';
