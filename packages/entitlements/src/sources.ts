/**
 * The entitlement source union (docs/product-decisions.md's final entitlement matrix, "Resolution
 * rules"): the one contract server loaders and `resolve.ts` agree on. With no sources at all,
 * everyone resolves to Free — that is the true state before any purchase exists, not a fallback.
 * Extend only by adding a variant; existing consumers must keep working.
 */

export const SUBSCRIPTION_STATUSES = [
  'active',
  'grace',
  'billing_retry',
  'cancelled_active',
  'paused',
  'expired',
  'revoked',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const TRIP_BOOST_STATUSES = [
  'scheduled',
  'active',
  'ended',
  'moved',
  'revoked',
  'credit',
] as const;
export type TripBoostStatus = (typeof TRIP_BOOST_STATUSES)[number];

/** A store subscription (Pass+). */
export interface StoreSubSource {
  readonly kind: 'store_sub';
  readonly status: SubscriptionStatus;
  /** The period the subscriber has already paid through; used while `status` is 'cancelled_active'. */
  readonly currentPeriodEnd: string;
  /** Present only while `status` is 'grace' or 'billing_retry' (7 d server-side grace window). */
  readonly graceEndsAt?: string;
}

/** A purchased Trip Boost window: trip end + 7 d, scoped to exactly one trip. */
export interface TripBoostSource {
  readonly kind: 'trip_boost';
  readonly tripId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: TripBoostStatus;
}

/** First Trip Free: Boost + Pass+ for every member until trip end + 7 d. */
export interface FtfSource {
  readonly kind: 'ftf';
  readonly crewId: string;
  readonly tripId: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

/** Crew yearly: full Pass+ for the buyer everywhere; Boost-equivalent for the whole crew, but only
 * on that crew's own trips. */
export interface CrewYearSource {
  readonly kind: 'crew_year';
  readonly crewId: string;
  readonly buyerUserId: string;
  readonly validFrom: string;
  readonly validTo: string;
}

/** A redeemed gift/promo code granting Pass+ time (the only code-redeemable product today besides
 * the store subscriptions and Boost/crew-year purchases themselves, e.g. `gift_pass_3m`). */
export interface CodeGrantSource {
  readonly kind: 'code_grant';
  readonly expiresAt: string;
}

export type EntitlementSource =
  StoreSubSource | TripBoostSource | FtfSource | CrewYearSource | CodeGrantSource;

/** Injected time so every resolver here is a pure function of its inputs, never `Date.now()`. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
