/**
 * Supplier job queues (docs/api-contracts-async.md §2.2, §2.3): the daily import of partner
 * booking statistics into affiliate conversions.
 */
import type { QueueSpec } from '../jobs/catalogue';

export const SUPPLIER_QUEUES = {
  affiliateConversions: 'supplier.affiliate_conversions',
} as const;

export const SUPPLIER_QUEUE_SPECS = {
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
  'supplier.affiliate_conversions': 'Imports partner booking statistics into affiliate conversions',
};
