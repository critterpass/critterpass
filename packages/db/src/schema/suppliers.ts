/**
 * The supplier layer (docs/data-model.md §3.7), a typed mirror of the supplier migrations: orders
 * placed with a supplier that is the merchant of record and their items, affiliate clicks and
 * conversions, the trip's providers, and Grab ride quotes and logged rides. No table holds supplier content: ids, prices at the time
 * of display, status and references only.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  char,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { registerMergeRule } from '../merge-rules';
import { bookings } from './bookings';
import { users } from './identity';
import { trips } from './trips';

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const tripRef = () => uuid('trip_id').references(() => trips.id);
const createdAt = () => at('created_at').notNull().defaultNow();
const updatedAt = () => at('updated_at').notNull().defaultNow();

export const supplierOrders = pgTable('supplier_orders', {
  id: id(),
  tripId: tripRef().notNull(),
  buyerId: uuid('buyer_id')
    .notNull()
    .references(() => users.id),
  supplier: text('supplier').notNull(),
  stableId: uuid('stable_id'),
  partnerCartRef: text('partner_cart_ref').notNull().unique(),
  cartRef: text('cart_ref'),
  status: text('status').notNull().default('cart_draft'),
  pricingStatus: text('pricing_status'),
  availabilityStatus: text('availability_status'),
  holdValidUntil: at('hold_valid_until'),
  totalMinor: bigint('total_minor', { mode: 'bigint' }),
  currency: char('currency', { length: 3 }),
  paymentSessionToken: text('payment_session_token'),
  supplierBookingRef: text('supplier_booking_ref'),
  voucherBookingId: uuid('voucher_booking_id').references(() => bookings.id),
  rejectionCode: text('rejection_code'),
  cancelQuote: jsonb('cancel_quote'),
  lastPolledAt: at('last_polled_at'),
  nextPollAt: at('next_poll_at'),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const supplierOrderItems = pgTable('supplier_order_items', {
  id: id(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => supplierOrders.id, { onDelete: 'cascade' }),
  tripId: tripRef().notNull(),
  itemRef: text('item_ref').notNull().unique(),
  productCode: text('product_code').notNull(),
  productOptionCode: text('product_option_code'),
  travelDate: date('travel_date').notNull(),
  startTime: text('start_time'),
  travellerCount: integer('traveller_count').notNull(),
  priceMinor: bigint('price_minor', { mode: 'bigint' }),
  participantIds: uuid('participant_ids')
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`),
  supplierBookingRef: text('supplier_booking_ref'),
  createdAt: createdAt(),
});

export const affiliateClicks = pgTable('affiliate_clicks', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  tripId: tripRef(),
  partner: text('partner').notNull(),
  subId: text('sub_id').notNull().unique(),
  targetKind: text('target_kind').notNull(),
  targetRef: text('target_ref').notNull(),
  url: text('url').notNull(),
  clickedAt: at('clicked_at').notNull().defaultNow(),
  createdAt: createdAt(),
});

export const affiliateConversions = pgTable('affiliate_conversions', {
  id: id(),
  partner: text('partner').notNull(),
  externalId: text('external_id').notNull(),
  subId: text('sub_id'),
  clickId: uuid('click_id').references(() => affiliateClicks.id, { onDelete: 'set null' }),
  campaignId: integer('campaign_id'),
  status: text('status').notNull(),
  priceMinor: bigint('price_minor', { mode: 'bigint' }),
  commissionMinor: bigint('commission_minor', { mode: 'bigint' }).notNull(),
  currency: char('currency', { length: 3 }).notNull(),
  occurredOn: date('occurred_on').notNull(),
  reportedAt: at('reported_at').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const providers = pgTable('providers', {
  id: id(),
  tripId: tripRef().notNull(),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  contactEnc: text('contact_enc'),
  vehicle: jsonb('vehicle'),
  policies: text('policies'),
  addedBy: uuid('added_by').references(() => users.id),
  deletedAt: at('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const rideQuotes = pgTable('ride_quotes', {
  id: id(),
  tripId: tripRef().notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  provider: text('provider').notNull(),
  fromPoiId: uuid('from_poi_id'),
  toPoiId: uuid('to_poi_id').notNull(),
  serviceName: text('service_name').notNull(),
  fareLowMinor: bigint('fare_low_minor', { mode: 'bigint' }).notNull(),
  fareHighMinor: bigint('fare_high_minor', { mode: 'bigint' }).notNull(),
  currency: char('currency', { length: 3 }).notNull(),
  etaMin: integer('eta_min').notNull(),
  surge: text('surge').notNull().default('none'),
  fetchedAt: at('fetched_at').notNull(),
  createdAt: createdAt(),
});

export const rides = pgTable('rides', {
  id: id(),
  tripId: tripRef().notNull(),
  legRef: text('leg_ref').notNull(),
  provider: text('provider').notNull(),
  mode: text('mode').notNull(),
  providerId: uuid('provider_id').references(() => providers.id),
  bookingId: uuid('booking_id').references(() => bookings.id),
  quoteId: uuid('quote_id').references(() => rideQuotes.id, { onDelete: 'set null' }),
  etaText: text('eta_text'),
  status: text('status').notNull().default('logged'),
  priceMinor: bigint('price_minor', { mode: 'bigint' }),
  currency: char('currency', { length: 3 }),
  expenseId: uuid('expense_id'),
  attendeeIds: uuid('attendee_ids')
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`),
  loggedBy: uuid('logged_by')
    .notNull()
    .references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// An order is the trip's (C1); its supplier references and payment session are the server's.
registerTablePrivacy('supplier_orders', {
  class: 'C1',
  columns: {
    partner_cart_ref: 'C2',
    cart_ref: 'C2',
    payment_session_token: 'C2',
    supplier_booking_ref: 'C2',
    cancel_quote: 'C2',
  },
});
registerTablePrivacy('supplier_order_items', {
  class: 'C1',
  columns: { item_ref: 'C2', supplier_booking_ref: 'C2' },
});
registerTablePrivacy('affiliate_clicks', { class: 'C2' });
registerTablePrivacy('affiliate_conversions', { class: 'C5' });
// A provider's contact is a business number, sealed at rest and read through the api.
registerTablePrivacy('providers', { class: 'C1', columns: { contact_enc: 'C2' } });
// A quote is Grab's estimate between two places; a ride is a logged leg with its amount.
registerTablePrivacy('ride_quotes', { class: 'C1' });
registerTablePrivacy('rides', { class: 'C1' });

// A merged member keeps the orders they placed and the providers they added.
registerMergeRule({ table: 'supplier_orders', userColumn: 'buyer_id', strategy: 'reassign' });
registerMergeRule({ table: 'providers', userColumn: 'added_by', strategy: 'reassign' });
registerMergeRule({ table: 'ride_quotes', userColumn: 'user_id', strategy: 'reassign' });
registerMergeRule({ table: 'rides', userColumn: 'logged_by', strategy: 'reassign' });
