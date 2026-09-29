/**
 * Billing state machines and closed value sets (docs/data-model.md §3.14,
 * docs/data-model-sync-and-privacy.md §3.3 Boost and §3.6 Subscription). The SQL `CHECK`s and the
 * `trip_boosts` transition trigger mirror these lists; handlers call `canMoveBoost` before writing.
 */
import { z } from 'zod';

/** Where a subscription row came from: a store (through RevenueCat) or our own grant. */
export const BILLING_PLATFORMS = ['app_store', 'play', 'promo', 'gift'] as const;
export const billingPlatformSchema = z.enum(BILLING_PLATFORMS);
export type BillingPlatform = z.infer<typeof billingPlatformSchema>;

/** The two stores a purchase can come from. */
export const STORE_PLATFORMS = ['app_store', 'play'] as const;
export const storePlatformSchema = z.enum(STORE_PLATFORMS);
export type StorePlatform = z.infer<typeof storePlatformSchema>;

export const STORE_ENVIRONMENTS = ['production', 'sandbox'] as const;
export type StoreEnvironment = (typeof STORE_ENVIRONMENTS)[number];

/**
 * Subscription machine: active → grace | billing_retry → on_hold → expired; paused;
 * cancelled_active → expired; revoked.
 */
export const SUBSCRIPTION_STATES = [
  'active',
  'grace',
  'billing_retry',
  'on_hold',
  'paused',
  'cancelled_active',
  'expired',
  'revoked',
] as const;
export const subscriptionStateSchema = z.enum(SUBSCRIPTION_STATES);
export type SubscriptionState = z.infer<typeof subscriptionStateSchema>;

/** `boost_intents`: open → purchasing → fulfilled | expired | cancelled (one open per trip). */
export const BOOST_INTENT_STATUSES = [
  'open',
  'purchasing',
  'fulfilled',
  'expired',
  'cancelled',
] as const;
export const boostIntentStatusSchema = z.enum(BOOST_INTENT_STATUSES);
export type BoostIntentStatus = z.infer<typeof boostIntentStatusSchema>;

/** The intent statuses that hold a trip's lock. */
export const LOCKING_INTENT_STATUSES = ['open', 'purchasing'] as const;

/** How long a boost intent holds its trip before it lapses. */
export const BOOST_INTENT_LOCK_MINUTES = 15;

/** Who pays: the buyer covers it, or it splits across the members they chose (IOUs). */
export const BOOST_SPLIT_MODES = ['cover', 'split'] as const;
export const boostSplitModeSchema = z.enum(BOOST_SPLIT_MODES);
export type BoostSplitMode = z.infer<typeof boostSplitModeSchema>;

export const TRIP_BOOST_SOURCES = [
  'purchase',
  'first_trip_free',
  'crew_year',
  'moved',
  'promo',
] as const;
export const tripBoostSourceSchema = z.enum(TRIP_BOOST_SOURCES);
export type TripBoostSource = z.infer<typeof tripBoostSourceSchema>;

export const TRIP_BOOST_STATES = [
  'scheduled',
  'active',
  'ended',
  'moved',
  'revoked',
  'credit',
] as const;
export const tripBoostStateSchema = z.enum(TRIP_BOOST_STATES);
export type TripBoostState = z.infer<typeof tripBoostStateSchema>;

/**
 * Allowed `trip_boosts.status` moves. An ended boost comes back when the trip's dates move out
 * again, and a refund after the window still revokes it (its unsettled IOUs are reversed).
 * `moved`, `credit` and `revoked` are final.
 */
export const TRIP_BOOST_TRANSITIONS: Readonly<Record<TripBoostState, readonly TripBoostState[]>> = {
  scheduled: ['active', 'moved', 'credit', 'revoked'],
  active: ['ended', 'moved', 'credit', 'revoked'],
  ended: ['active', 'revoked'],
  moved: [],
  credit: [],
  revoked: [],
};

export function canMoveBoost(from: TripBoostState, to: TripBoostState): boolean {
  return TRIP_BOOST_TRANSITIONS[from].includes(to);
}

/** A boost window stays open this long after the trip's last day. */
export const BOOST_WINDOW_DAYS_AFTER_TRIP = 7;

export const BOOST_CREDIT_REASONS = ['trip_cancelled', 'duplicate_purchase'] as const;
export const boostCreditReasonSchema = z.enum(BOOST_CREDIT_REASONS);
export type BoostCreditReason = z.infer<typeof boostCreditReasonSchema>;

export const FTF_ABUSE_DECISIONS = ['allowed', 'review', 'revoked'] as const;
export const ftfAbuseDecisionSchema = z.enum(FTF_ABUSE_DECISIONS);
export type FtfAbuseDecision = z.infer<typeof ftfAbuseDecisionSchema>;

/** First trip free needs at least this many seated participants. */
export const FTF_MIN_SEATED = 2;

export const CODE_KINDS = ['gift', 'promo', 'partner'] as const;
export const CODE_STATUSES = ['active', 'redeemed', 'expired', 'revoked'] as const;
export const CODE_PLATFORM_RESTRICTIONS = ['any', 'app_store', 'play'] as const;
export const CODE_APPLIED_AS = ['server_grant', 'store_extension', 'offer_code'] as const;

/** Where a stored billing event came from. */
export const BILLING_EVENT_SOURCES = ['revenuecat', 'app_store', 'play'] as const;
export type BillingEventSource = (typeof BILLING_EVENT_SOURCES)[number];

export const REVOCATION_REASONS = ['refund', 'revoke'] as const;
export const revocationReasonSchema = z.enum(REVOCATION_REASONS);
export type RevocationReason = z.infer<typeof revocationReasonSchema>;
