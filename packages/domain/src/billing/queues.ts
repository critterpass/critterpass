/**
 * Billing job queues (docs/api-contracts-async.md §2.2, §2.3) and the internal door the worker's
 * billing jobs call. The billing engine lives in the api (it owns the entitlement materialiser and
 * the RevenueCat client); a worker job only carries the durable retry, and asks the api to do one
 * idempotent step over the private network (`POST /internal/billing/{op}`).
 */
import { z } from 'zod';

import type { QueueSpec } from '../jobs/catalogue';

export const BILLING_QUEUES = {
  apply: 'billing.apply',
  reconcile: 'billing.reconcile',
  boostExpire: 'boost.expire',
  intentExpiry: 'billing.intent_expiry',
  ftfGrant: 'ftf.grant',
  tripChanged: 'boost.trip_changed',
  pauseRemind: 'pause.remind',
} as const;

export const BILLING_QUEUE_SPECS = {
  // One apply per stored event (singleton on the event id); RevenueCat retries too.
  'billing.apply': {
    policy: 'exclusive',
    retryLimit: 5,
    retryDelay: 30,
    deadLetter: true,
    notify: true,
    expireInSeconds: 2 * 60,
  },
  'billing.reconcile': {
    policy: 'stately',
    retryLimit: 2,
    expireInSeconds: 30 * 60,
    cron: { expr: '0 5 * * *', tz: 'Asia/Singapore' },
  },
  'boost.expire': { policy: 'exclusive', deadLetter: true },
  'billing.intent_expiry': { policy: 'exclusive' },
  'ftf.grant': { policy: 'exclusive', deadLetter: true, notify: true },
  'boost.trip_changed': { policy: 'stately', deadLetter: true, notify: true },
  'pause.remind': { policy: 'exclusive' },
} as const satisfies Record<string, Partial<QueueSpec>>;

export function billingQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof BILLING_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(BILLING_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof BILLING_QUEUE_SPECS, QueueSpec>;
}

export const BILLING_QUEUE_DESCRIPTIONS: Readonly<
  Record<keyof typeof BILLING_QUEUE_SPECS, string>
> = {
  'billing.apply': 'Verifies a RevenueCat event against RevenueCat and applies the purchase state',
  'billing.reconcile':
    'Re-checks every live store subscription against RevenueCat and repairs drift',
  'boost.expire': "Ends a trip boost when its window closes and pauses the trip's boost perks",
  'billing.intent_expiry': "Releases a boost intent's trip lock once it lapses",
  'ftf.grant': "Grants a crew's first trip free when that trip enters setup",
  'boost.trip_changed': "Moves or credits a cancelled trip's boost",
  'pause.remind': 'Reminds a member a week before their planned Pass+ pause ends',
};

/** The api's internal billing door: one idempotent step per call. */
export const BILLING_INTERNAL_OPS = [
  'apply_event',
  'reconcile',
  'expire_boost',
  'expire_intent',
  'grant_ftf',
  'trip_changed',
] as const;
export type BillingInternalOp = (typeof BILLING_INTERNAL_OPS)[number];

/** Header carrying the shared secret between the worker and the api's internal billing door. */
export const BILLING_INTERNAL_SECRET_HEADER = 'x-cp-billing-secret';

export const billingInternalBodySchemas = {
  apply_event: z.strictObject({ billing_event_id: z.uuid() }),
  reconcile: z.strictObject({
    after_user_id: z.uuid().nullable(),
    limit: z.int().min(1).max(200),
  }),
  expire_boost: z.strictObject({ boost_id: z.uuid() }),
  expire_intent: z.strictObject({ intent_id: z.uuid() }),
  grant_ftf: z.strictObject({ trip_id: z.uuid() }),
  trip_changed: z.strictObject({ trip_id: z.uuid() }),
} as const satisfies Record<BillingInternalOp, z.ZodType>;

export type BillingInternalBody<Op extends BillingInternalOp> = z.infer<
  (typeof billingInternalBodySchemas)[Op]
>;

export const reconcileResultSchema = z.object({
  checked: z.int().nonnegative(),
  drifted: z.int().nonnegative(),
  failed: z.int().nonnegative(),
  next_after_user_id: z.uuid().nullable(),
});
export type ReconcileResult = z.infer<typeof reconcileResultSchema>;

/** Where the reconcile cron keeps its last run (`ops.ops_config`), for the console's drift tile. */
export const RECONCILE_STATE_KEY = 'billing.reconcile_last_run';
