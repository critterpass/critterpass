/**
 * Billing domain events (docs/api-contracts.md §4.15) and the realtime hints on `trip:`, `crew:`
 * and `user:#` (docs/api-contracts-async.md §1.2). Payloads carry ids and enums only; amounts and
 * store identifiers stay in the rows.
 */
import { z } from 'zod';

import { PRODUCT_KEYS } from '../entitlements/product-keys';
import { PAYWALL_ENTRY_POINTS, PAYWALL_OUTCOMES } from '../paywall/entries';
import {
  FTF_ABUSE_DECISIONS,
  REVOCATION_REASONS,
  SUBSCRIPTION_STATES,
  TRIP_BOOST_SOURCES,
} from './states';

export const BILLING_EVENT_TYPES = [
  'boost.intent_locked',
  'boost.intent_released',
  'boost.activated',
  'boost.split_added',
  'boost.ended',
  'boost.moved',
  'boost.revoked',
  'boost.thanked',
  'subscription.changed',
  'subscription.pause_intended',
  'subscription.resume_due',
  'purchase.fulfilled',
  'purchase.revoked',
  'ftf.granted',
  'ftf.reviewed',
  'ftf.ending_soon',
  'crew_year.granted',
  'crew_year.rebound',
  'paywall.event',
] as const;
export type BillingEventType = (typeof BILLING_EVENT_TYPES)[number];

const tripBoost = z.object({ trip_id: z.uuid(), crew_id: z.uuid(), boost_id: z.uuid() });
const intent = z.object({ trip_id: z.uuid(), crew_id: z.uuid(), intent_id: z.uuid() });
const productKey = z.enum(PRODUCT_KEYS);

export const BILLING_EVENT_PAYLOADS = {
  'boost.intent_locked': intent.extend({ buyer_id: z.uuid() }),
  'boost.intent_released': intent.extend({ reason: z.enum(['released', 'expired', 'fulfilled']) }),
  'boost.activated': tripBoost.extend({
    buyer_id: z.uuid().nullable(),
    source: z.enum(TRIP_BOOST_SOURCES),
    split: z.boolean(),
  }),
  'boost.split_added': tripBoost.extend({ expense_id: z.uuid() }),
  'boost.ended': tripBoost,
  'boost.moved': z.object({
    crew_id: z.uuid(),
    boost_id: z.uuid(),
    from_trip_id: z.uuid(),
    to_trip_id: z.uuid().nullable(),
    credit_id: z.uuid().nullable(),
  }),
  'boost.revoked': tripBoost.extend({ reason: z.enum(REVOCATION_REASONS) }),
  'boost.thanked': tripBoost.extend({ buyer_id: z.uuid(), by_uid: z.uuid() }),
  'subscription.changed': z.object({
    user_id: z.uuid(),
    subscription_id: z.uuid(),
    product_key: productKey,
    status: z.enum(SUBSCRIPTION_STATES),
    previous_status: z.enum(SUBSCRIPTION_STATES).nullable(),
  }),
  /** The person plans to come back on `resume_at` (the App Store's stand-in for a pause). */
  'subscription.pause_intended': z.object({
    user_id: z.uuid(),
    subscription_id: z.uuid(),
    resume_at: z.iso.datetime({ offset: true }),
  }),
  /** A planned pause ends in a week and renewal is still off: time to remind them. */
  'subscription.resume_due': z.object({
    user_id: z.uuid(),
    subscription_id: z.uuid(),
    resume_at: z.iso.datetime({ offset: true }),
  }),
  'purchase.fulfilled': z.object({
    user_id: z.uuid(),
    store_transaction_id: z.uuid(),
    product_key: productKey,
  }),
  'purchase.revoked': z.object({
    user_id: z.uuid().nullable(),
    store_transaction_id: z.uuid(),
    product_key: productKey,
    reason: z.enum(REVOCATION_REASONS),
  }),
  'ftf.granted': z.object({ crew_id: z.uuid(), trip_id: z.uuid(), grant_id: z.uuid() }),
  // The window closes in three days; the push goes to those who would lose its perks.
  'ftf.ending_soon': z.object({
    crew_id: z.uuid(),
    trip_id: z.uuid(),
    grant_id: z.uuid(),
    ends_at: z.iso.datetime({ offset: true }),
  }),
  'ftf.reviewed': z.object({
    crew_id: z.uuid(),
    grant_id: z.uuid(),
    decision: z.enum(FTF_ABUSE_DECISIONS),
  }),
  'crew_year.granted': z.object({ crew_id: z.uuid(), grant_id: z.uuid(), buyer_id: z.uuid() }),
  'crew_year.rebound': z.object({
    grant_id: z.uuid(),
    buyer_id: z.uuid(),
    from_crew_id: z.uuid(),
    to_crew_id: z.uuid(),
  }),
  'paywall.event': z.object({
    user_id: z.uuid(),
    trip_id: z.uuid().nullable(),
    entry_point: z.enum(PAYWALL_ENTRY_POINTS),
    outcome: z.enum(PAYWALL_OUTCOMES),
  }),
} as const satisfies Record<BillingEventType, z.ZodType>;

/** Realtime hint types (ids only; rows arrive through sync). */
export const BILLING_RT = {
  /** `trip:` and `crew:`: a boost started, ended, moved or was revoked. */
  boostState: 'boost.state',
  /** `trip:`: someone is buying a boost for the trip until `until` (null when released). */
  intentLock: 'boost.intent_lock',
  /** `crew_chat:`: a boost card to show. */
  boostCard: 'boost_card',
} as const;
