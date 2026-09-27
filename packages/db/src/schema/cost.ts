/**
 * Cost tables: the trip's current cost components, each member's share calc and the crew-visible
 * totals, and the editorial destination cost indices. Typed mirror of
 * packages/db/migrations/*_cost_components_and_share_calcs.sql and *_destination_cost_indices.sql,
 * which are the applied source of truth for columns, constraints, RLS and grants — this file is not
 * run through `drizzle-kit generate`. Every number in them comes from `@cp/cost-engine`.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { fxSnapshots } from './fx';
import { users } from './identity';
import { priceQuotes } from './travel-data';
import { destinations, trips } from './trips';

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

export const costComponents = pgTable(
  'cost_components',
  {
    id: id(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id),
    calcVersion: text('calc_version').notNull(),
    /** The engine component id, stable across recomputes of the same input. */
    componentKey: text('component_key').notNull(),
    kind: text('kind').notNull(),
    unit: text('unit').notNull(),
    isShared: boolean('is_shared').notNull(),
    origin: text('origin'),
    memberIds: uuid('member_ids').array(),
    /** `null` = no price known yet. */
    amountMinor: bigint('amount_minor', { mode: 'bigint' }),
    currency: text('currency').notNull(),
    source: text('source').notNull(),
    quoteId: uuid('quote_id').references(() => priceQuotes.id),
    label: text('label'),
    seenAt: timestamp('seen_at', { withTimezone: true, mode: 'date' }).notNull(),
    frozenAt: timestamp('frozen_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique().on(table.tripId, table.componentKey)],
);

export const shareCalcs = pgTable(
  'share_calcs',
  {
    id: id(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    version: text('version').notNull(),
    /** The member's lines: `[{component_key, kind, amount_minor}]`. */
    components: jsonb('components').notNull(),
    personalOptionDeltas: jsonb('personal_option_deltas').notNull().default([]),
    totalMinor: bigint('total_minor', { mode: 'bigint' }).notNull(),
    currency: text('currency').notNull(),
    fxSnapshotId: uuid('fx_snapshot_id').references(() => fxSnapshots.id),
    isMissing: boolean('is_missing').notNull().default(false),
    isEstimatedOrigin: boolean('is_estimated_origin').notNull().default(false),
    isStale: boolean('is_stale').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique().on(table.tripId, table.userId, table.version)],
);

export const tripShareTotals = pgTable(
  'trip_share_totals',
  {
    id: id(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    totalMinor: bigint('total_minor', { mode: 'bigint' }).notNull(),
    currency: text('currency').notNull(),
    calcVersion: text('calc_version').notNull(),
    isMissing: boolean('is_missing').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique().on(table.tripId, table.userId)],
);

export const destinationCostIndices = pgTable(
  'destination_cost_indices',
  {
    id: id(),
    destinationId: uuid('destination_id')
      .notNull()
      .references(() => destinations.id),
    stayType: text('stay_type').notNull(),
    /** Per person per night. */
    nightlyMinorLow: bigint('nightly_minor_low', { mode: 'bigint' }).notNull(),
    nightlyMinorHigh: bigint('nightly_minor_high', { mode: 'bigint' }).notNull(),
    /** Per person per day. */
    foodPpDayMinor: bigint('food_pp_day_minor', { mode: 'bigint' }).notNull(),
    funPpDayMinor: bigint('fun_pp_day_minor', { mode: 'bigint' }).notNull(),
    currency: text('currency').notNull(),
    source: text('source').notNull(),
    sourceUrl: text('source_url'),
    sourcedOn: date('sourced_on', { mode: 'string' }).notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique().on(table.destinationId, table.stayType)],
);

registerTablePrivacy('cost_components', { class: 'C1' });
registerTablePrivacy('share_calcs', { class: 'C2' });
registerTablePrivacy('trip_share_totals', { class: 'C1' });
registerTablePrivacy('destination_cost_indices', { class: 'C0' });
