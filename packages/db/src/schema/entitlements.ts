/**
 * Entitlement, meter and catalogue tables (docs/data-model.md §3.14). Typed mirror of
 * packages/db/migrations/*_entitlements_and_meters.sql, which is the applied source of truth for
 * columns, constraints, RLS and grants — this file is not run through `drizzle-kit generate`.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './identity';
import { trips } from './trips';

export const products = pgTable('products', {
  key: text('key').primaryKey(),
  storeIds: jsonb('store_ids').notNull().default({}),
  type: text('type').notNull(),
  /** Capability keys (`@cp/domain` `CapabilityKey`) this product's copy should list as unlocked —
   * catalogue metadata for paywall offers (`ENTITLEMENT_REQUIRED.offers`), never read by the
   * resolution engine itself (that always resolves from real `EntitlementSource` rows). */
  grants: jsonb('grants').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const perks = pgTable('perks', {
  key: text('key').primaryKey(),
  tier: text('tier').notNull(),
  copyKey: text('copy_key').notNull(),
  /** The wire/pure-package field is named `enabled` (packages/entitlements/src/perks.ts); the
   * column is `is_shipped` per docs/data-model.md — every perk ships at launch, so the two names
   * describe the same switch from two angles (shipped vs. currently advertised). */
  isShipped: boolean('is_shipped').notNull().default(true),
  sort: integer('sort').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const userEntitlements = pgTable('user_entitlements', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  passPlus: boolean('pass_plus').notNull().default(false),
  /** The raw `EntitlementSource[]` the materialiser resolved from (audit trail; never read back by
   * the pure engine, which always re-resolves from the loaders themselves). */
  sources: jsonb('sources').notNull().default([]),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
  guideUnlimitedGlobal: boolean('guide_unlimited_global').notNull().default(false),
  /** `[]` = only the always-free default + free alternates; `['all']` = every style unlocked
   * (docs/product-decisions.md §3 "App icon styles"). The named-style catalogue itself is a later
   * (content) phase's concern — this column only needs to answer "is the gate open". */
  iconStyles: text('icon_styles').array().notNull().default([]),
  computedAt: timestamp('computed_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const tripEntitlements = pgTable('trip_entitlements', {
  tripId: uuid('trip_id')
    .primaryKey()
    .references(() => trips.id),
  boostActive: boolean('boost_active').notNull().default(false),
  seatCap: integer('seat_cap').notNull().default(6),
  /** Integer column: `redraftLimit()` (packages/entitlements) returns `Infinity` for an unlimited
   * trip; `REDRAFT_LIMIT_SENTINEL` (services/api/src/entitlements/materialise.ts) is the stored
   * stand-in, converted back to `Infinity` wherever it is read for a decision. */
  redraftLimit: integer('redraft_limit').notNull().default(3),
  liveMap: boolean('live_map').notNull().default(false),
  sponsored: boolean('sponsored').notNull().default(true),
  computedAt: timestamp('computed_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const usageCounters = pgTable('usage_counters', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  subjectKind: text('subject_kind').notNull(),
  /** No FK: polymorphic, points at either `users.id` or `trips.id` depending on `subject_kind`. */
  subjectId: uuid('subject_id').notNull(),
  metric: text('metric').notNull(),
  periodKey: text('period_key').notNull(),
  count: integer('count').notNull().default(0),
  limitAtTime: integer('limit_at_time').notNull(),
  resetAt: timestamp('reset_at', { withTimezone: true, mode: 'date' }).notNull(),
  /** When this (subject, metric, period_key) row was first created — the tz-abuse guard's anchor:
   * `app.consume_quota` allows at most one new period per subject/metric per 20h, so repeatedly
   * moving a device's clock/tz forward cannot manufacture extra free windows inside one real day. */
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const fairUseCounters = pgTable('fair_use_counters', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  metric: text('metric').notNull(),
  windowStart: timestamp('window_start', { withTimezone: true, mode: 'date' }).notNull(),
  count: integer('count').notNull().default(0),
  cap: integer('cap').notNull(),
});

registerTablePrivacy('products', { class: 'C0' });
registerTablePrivacy('perks', { class: 'C0' });
registerTablePrivacy('user_entitlements', { class: 'C2' });
registerTablePrivacy('trip_entitlements', { class: 'C1' });
registerTablePrivacy('usage_counters', { class: 'C2' });
registerTablePrivacy('fair_use_counters', { class: 'C2' });
