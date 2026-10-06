/**
 * Finding a driver (docs/data-model.md §3.7): what a crew member shared to the trip to be read into
 * a driver card, the days a driver is set on, and each member's "not now" on a day that needs one.
 * The candidate drivers themselves are `providers` rows (./suppliers.ts) with their quoted terms.
 * A typed mirror of `*_driver_shortlist_intake.sql`.
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
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { registerMergeRule } from '../merge-rules';
import { users } from './identity';
import { changeSets } from './plan';
import { providers } from './suppliers';
import { trips } from './trips';

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** RLS class S, C2: a pasted message or read screenshot, kept until parsed + 30 days. */
export const providerIntake = pgTable('provider_intake', {
  id: id(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  sharedBy: uuid('shared_by')
    .notNull()
    .references(() => users.id),
  kind: text('kind').notNull(),
  rawText: text('raw_text'),
  status: text('status').notNull().default('pending'),
  parsed: jsonb('parsed'),
  providerId: uuid('provider_id').references(() => providers.id),
  parsedAt: at('parsed_at'),
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

/**
 * RLS class T (read), C1: a candidate driver's quoted terms, one row per `providers` row of kind
 * driver; every field the traveller confirmed is listed in `confirmed_fields`. A private tour keeps
 * only its product id and the price shown (`supplier_ref`), never the supplier's words.
 */
export const providerTerms = pgTable('provider_terms', {
  providerId: uuid('provider_id')
    .primaryKey()
    .references(() => providers.id),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  source: text('source').notNull(),
  status: text('status').notNull().default('shortlisted'),
  area: text('area'),
  languages: text('languages')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  car: text('car'),
  seats: integer('seats'),
  priceMinor: bigint('price_minor', { mode: 'bigint' }),
  currency: char('currency', { length: 3 }),
  priceUnit: text('price_unit'),
  includedHours: numeric('included_hours'),
  includes: jsonb('includes').notNull().default({}),
  overtimeMinor: bigint('overtime_minor', { mode: 'bigint' }),
  licenceShown: boolean('licence_shown'),
  confirmedFields: text('confirmed_fields')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  supplierRef: text('supplier_ref'),
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

/** RLS class T (read), C1: one driver per trip day. */
export const providerAssignments = pgTable('provider_assignments', {
  id: id(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  dayDate: date('day_date', { mode: 'string' }).notNull(),
  providerId: uuid('provider_id')
    .notNull()
    .references(() => providers.id),
  windowStart: text('window_start'),
  windowEnd: text('window_end'),
  pickup: text('pickup'),
  agreed: jsonb('agreed'),
  changeSetId: uuid('change_set_id').references(() => changeSets.id),
  assignedBy: uuid('assigned_by')
    .notNull()
    .references(() => users.id),
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

/** RLS class O, C1: a member's "not now" on a day the plan says needs a driver. */
export const pickupGapDismissals = pgTable('pickup_gap_dismissals', {
  id: id(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  dayDate: date('day_date', { mode: 'string' }).notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
});

// Shared driver messages carry a third party's phone number: sealed from sync, read via the api.
registerTablePrivacy('provider_intake', { class: 'C2' });
registerTablePrivacy('provider_terms', { class: 'C1' });
registerTablePrivacy('provider_assignments', { class: 'C1' });
registerTablePrivacy('pickup_gap_dismissals', { class: 'C1' });

registerMergeRule({ table: 'provider_intake', userColumn: 'shared_by', strategy: 'reassign' });
registerMergeRule({
  table: 'provider_assignments',
  userColumn: 'assigned_by',
  strategy: 'reassign',
});
registerMergeRule({
  table: 'pickup_gap_dismissals',
  userColumn: 'user_id',
  strategy: 'union',
  conflictColumns: ['trip_id', 'day_date'],
});
