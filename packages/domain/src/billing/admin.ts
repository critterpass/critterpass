/**
 * The billing console (docs/api-contracts.md §4.17, §5.9): what support reads about a customer's
 * billing and the actions it can take, each with a reason that lands in the audit log.
 */
import { z } from 'zod';

const iso = z.string();
const reason = z.string().trim().min(3).max(500);

export const billingTimelineSchema = z.object({
  user_id: z.uuid(),
  entitlements: z
    .object({ pass_plus: z.boolean(), expires_at: iso.nullable(), computed_at: iso })
    .nullable(),
  subscriptions: z.array(
    z.object({
      id: z.uuid(),
      platform: z.string(),
      product_key: z.string(),
      status: z.string(),
      auto_renew: z.boolean(),
      period_end: iso.nullable(),
      grace_ends_at: iso.nullable(),
      environment: z.string(),
    }),
  ),
  transactions: z.array(
    z.object({
      id: z.uuid(),
      platform: z.string(),
      transaction_id: z.string(),
      product_key: z.string(),
      purchased_at: iso,
      price_minor: z.number().nullable(),
      currency: z.string().nullable(),
      revoked_at: iso.nullable(),
      revocation_reason: z.string().nullable(),
    }),
  ),
  events: z.array(
    z.object({
      id: z.uuid(),
      event_id: z.string(),
      type: z.string(),
      received_at: iso,
      processed_at: iso.nullable(),
      error: z.string().nullable(),
    }),
  ),
  boosts: z.array(
    z.object({
      id: z.uuid(),
      trip_id: z.uuid(),
      source: z.string(),
      status: z.string(),
      ends_at: iso,
    }),
  ),
  extensions_used_365d: z.int().nonnegative(),
});
export type BillingTimeline = z.infer<typeof billingTimelineSchema>;

export const billingHealthSchema = z.object({
  webhook_lag_p95_ms: z.number().nullable(),
  failed_24h: z.int().nonnegative(),
  unprocessed: z.int().nonnegative(),
  reconcile: z
    .object({
      run_date: z.string(),
      checked: z.int(),
      drifted: z.int(),
      failed: z.int(),
      finished_at: z.string().nullable(),
    })
    .nullable(),
  ftf_to_review: z.int().nonnegative(),
});
export type BillingHealth = z.infer<typeof billingHealthSchema>;

export const offerCodeBatchesSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      platform: z.string(),
      offer_ref: z.string(),
      size: z.int(),
      redeemed: z.int(),
      notes: z.string().nullable(),
      recorded_by: z.string(),
      created_at: iso,
    }),
  ),
});

export const ftfReviewSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      crew_id: z.uuid(),
      trip_id: z.uuid(),
      organiser_id: z.uuid(),
      abuse_decision: z.string(),
      overlapping_grants: z.int().nonnegative(),
      created_at: iso,
    }),
  ),
});

export const recordOfferCodeBatchPayloadSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  platform: z.enum(['app_store', 'play']),
  offer_ref: z.string().trim().min(1).max(200),
  size: z.int().min(1).max(1_000_000),
  notes: z.string().max(1000).optional(),
});

export const reviewFtfGrantPayloadSchema = z.strictObject({
  grant_id: z.uuid(),
  decision: z.enum(['allow', 'revoke']),
  reason,
});

export const grantTripBoostPayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  days: z.int().min(1).max(60),
  reason,
});

/** App Store Extend Renewal Date: customer-service compensation only, never a sold gift. */
export const EXTEND_RENEWAL_MAX_DAYS = 90;
export const EXTEND_RENEWAL_MAX_PER_YEAR = 2;

export const extendStoreRenewalPayloadSchema = z.strictObject({
  uid: z.uuid(),
  days: z.int().min(1).max(EXTEND_RENEWAL_MAX_DAYS),
  reason,
});
