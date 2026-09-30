/**
 * Store billing, boosts, grants, codes and paywall impressions (docs/data-model.md §3.14). Typed
 * mirror of packages/db/migrations/*_billing_subscriptions_transactions.sql,
 * *_boosts_grants_codes.sql and *_paywall_impressions.sql, which are the applied source of truth
 * for columns, constraints, RLS and grants.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  date,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { crews } from './crews';
import { expenses } from './money';
import { users } from './identity';
import { trips } from './trips';

const ops = pgSchema('ops');
const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => at('created_at').notNull().defaultNow();
const updatedAt = () => at('updated_at').notNull().defaultNow();

export const subscriptions = pgTable('subscriptions', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  platform: text('platform').notNull(),
  rcCustomerId: text('rc_customer_id'),
  originalTransactionId: text('original_transaction_id'),
  productKey: text('product_key').notNull(),
  status: text('status').notNull(),
  autoRenew: boolean('auto_renew').notNull().default(true),
  periodStart: at('period_start'),
  periodEnd: at('period_end'),
  graceEndsAt: at('grace_ends_at'),
  pausedFrom: at('paused_from'),
  resumeAt: at('resume_at'),
  storefront: text('storefront'),
  environment: text('environment').notNull().default('production'),
  lastEventAt: at('last_event_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const storeTransactions = pgTable('store_transactions', {
  id: id(),
  userId: uuid('user_id').references(() => users.id),
  platform: text('platform').notNull(),
  transactionId: text('transaction_id').notNull(),
  originalTransactionId: text('original_transaction_id'),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id),
  productKey: text('product_key').notNull(),
  storeProductId: text('store_product_id').notNull(),
  purchasedAt: at('purchased_at').notNull(),
  priceMinor: bigint('price_minor', { mode: 'bigint' }),
  currency: char('currency', { length: 3 }),
  storefront: text('storefront'),
  quantity: integer('quantity').notNull().default(1),
  environment: text('environment').notNull().default('production'),
  signedPayload: text('signed_payload'),
  offerCode: text('offer_code'),
  revokedAt: at('revoked_at'),
  revocationReason: text('revocation_reason'),
  refundedAt: at('refunded_at'),
  boostIntentId: uuid('boost_intent_id'),
  codeId: uuid('code_id'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const billingEvents = pgTable('billing_events', {
  id: id(),
  source: text('source').notNull(),
  eventId: text('event_id').notNull(),
  type: text('type').notNull(),
  appUserId: text('app_user_id'),
  environment: text('environment'),
  payload: jsonb('payload').notNull(),
  eventAt: at('event_at'),
  receivedAt: at('received_at').notNull().defaultNow(),
  processedAt: at('processed_at'),
  attempts: integer('attempts').notNull().default(0),
  error: text('error'),
});

export const boostIntents = pgTable('boost_intents', {
  id: id(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  crewId: uuid('crew_id')
    .notNull()
    .references(() => crews.id),
  buyerId: uuid('buyer_id')
    .notNull()
    .references(() => users.id),
  productKey: text('product_key').notNull(),
  splitMode: text('split_mode').notNull(),
  splitMemberIds: uuid('split_member_ids').array().notNull().default([]),
  status: text('status').notNull().default('open'),
  expiresAt: at('expires_at').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const crewYearGrants = pgTable('crew_year_grants', {
  id: id(),
  crewId: uuid('crew_id')
    .notNull()
    .references(() => crews.id),
  buyerId: uuid('buyer_id')
    .notNull()
    .references(() => users.id),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id),
  originalTransactionId: text('original_transaction_id'),
  intentId: uuid('intent_id').references(() => boostIntents.id),
  splitExpenseId: uuid('split_expense_id').references(() => expenses.id),
  validFrom: at('valid_from').notNull(),
  validTo: at('valid_to').notNull(),
  reboundForPeriodEnd: at('rebound_for_period_end'),
  revokedAt: at('revoked_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const tripBoosts = pgTable('trip_boosts', {
  id: id(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  crewId: uuid('crew_id')
    .notNull()
    .references(() => crews.id),
  buyerId: uuid('buyer_id').references(() => users.id),
  source: text('source').notNull(),
  storeTransactionId: uuid('store_transaction_id').references(() => storeTransactions.id),
  intentId: uuid('intent_id').references(() => boostIntents.id),
  crewYearGrantId: uuid('crew_year_grant_id').references(() => crewYearGrants.id),
  splitMode: text('split_mode').notNull().default('cover'),
  splitMemberIds: uuid('split_member_ids').array().notNull().default([]),
  startsAt: at('starts_at').notNull(),
  endsAt: at('ends_at').notNull(),
  status: text('status').notNull().default('active'),
  movedFromTripId: uuid('moved_from_trip_id').references(() => trips.id),
  movedFromBoostId: uuid('moved_from_boost_id'),
  expenseId: uuid('expense_id').references(() => expenses.id),
  thankedBy: uuid('thanked_by').array().notNull().default([]),
  revokedAt: at('revoked_at'),
  revokeReason: text('revoke_reason'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const boostCredits = pgTable('boost_credits', {
  id: id(),
  crewId: uuid('crew_id').references(() => crews.id),
  userId: uuid('user_id').references(() => users.id),
  reason: text('reason').notNull(),
  fromBoostId: uuid('from_boost_id').references(() => tripBoosts.id),
  storeTransactionId: uuid('store_transaction_id').references(() => storeTransactions.id),
  expiresAt: at('expires_at'),
  consumedByBoostId: uuid('consumed_by_boost_id').references(() => tripBoosts.id),
  consumedAt: at('consumed_at'),
  revokedAt: at('revoked_at'),
  createdAt: createdAt(),
});

export const ftfGrants = pgTable('ftf_grants', {
  id: id(),
  crewId: uuid('crew_id')
    .notNull()
    .references(() => crews.id),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  organiserId: uuid('organiser_id')
    .notNull()
    .references(() => users.id),
  startsAt: at('starts_at').notNull(),
  endsAt: at('ends_at').notNull(),
  memberOverlapHash: text('member_overlap_hash').notNull(),
  abuseDecision: text('abuse_decision').notNull().default('allowed'),
  reviewedAt: at('reviewed_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const opsFtfAbuseKeys = ops.table('ftf_abuse_keys', {
  id: id(),
  grantId: uuid('grant_id')
    .notNull()
    .references(() => ftfGrants.id),
  kind: text('kind').notNull(),
  keyHash: text('key_hash').notNull(),
  createdAt: createdAt(),
});

export const codes = pgTable('codes', {
  id: id(),
  codeHash: text('code_hash').notNull(),
  codePrefix: text('code_prefix').notNull(),
  kind: text('kind').notNull(),
  grantSpec: jsonb('grant_spec').notNull(),
  senderId: uuid('sender_id').references(() => users.id),
  message: text('message'),
  fundedByTxnId: uuid('funded_by_txn_id').references(() => storeTransactions.id),
  partnerId: text('partner_id'),
  platformRestriction: text('platform_restriction').notNull().default('any'),
  maxRedemptions: integer('max_redemptions').notNull().default(1),
  redeemedCount: integer('redeemed_count').notNull().default(0),
  expiresAt: at('expires_at'),
  status: text('status').notNull().default('active'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const codeRedemptions = pgTable('code_redemptions', {
  id: id(),
  codeId: uuid('code_id')
    .notNull()
    .references(() => codes.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  redeemedAt: at('redeemed_at').notNull().defaultNow(),
  appliedAs: text('applied_as').notNull(),
  startsAt: at('starts_at').notNull(),
  newPeriodEnd: at('new_period_end').notNull(),
  createdAt: createdAt(),
});

export const opsOfferCodeBatches = ops.table('offer_code_batches', {
  id: id(),
  name: text('name').notNull(),
  platform: text('platform').notNull(),
  offerRef: text('offer_ref').notNull(),
  size: integer('size').notNull(),
  notes: text('notes'),
  recordedBy: uuid('recorded_by').notNull(),
  createdAt: createdAt(),
});

export const paywallImpressions = pgTable('paywall_impressions', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  tripId: uuid('trip_id').references(() => trips.id),
  entryPoint: text('entry_point').notNull(),
  outcome: text('outcome').notNull(),
  channel: text('channel').notNull().default('app'),
  governed: boolean('governed').notNull(),
  shownAt: at('shown_at').notNull(),
  localDate: date('local_date', { mode: 'string' }).notNull(),
  suppressedUntil: at('suppressed_until'),
  createdAt: createdAt(),
});

registerTablePrivacy('subscriptions', { class: 'C2' });
registerTablePrivacy('store_transactions', { class: 'C5' });
registerTablePrivacy('billing_events', { class: 'C5' });
registerTablePrivacy('boost_intents', { class: 'C1' });
registerTablePrivacy('trip_boosts', { class: 'C1' });
registerTablePrivacy('boost_credits', { class: 'C2' });
registerTablePrivacy('crew_year_grants', { class: 'C2' });
registerTablePrivacy('ftf_grants', { class: 'C2' });
registerTablePrivacy('codes', { class: 'C2' });
registerTablePrivacy('code_redemptions', { class: 'C2' });
registerTablePrivacy('paywall_impressions', { class: 'C2' });
