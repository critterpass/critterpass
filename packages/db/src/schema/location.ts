/**
 * Location sharing and POI visits: share windows, the minutes-lived fixes behind them, member
 * ETAs, and opt-in POI visits. Typed mirror of
 * packages/db/migrations/*_location_shares_fixes_visits.sql, which is the applied source of truth
 * for columns, constraints, RLS and grants — this file is not run through `drizzle-kit generate`.
 * Fixes and visits are C3: never published, never readable by anyone but their owner (fixes only
 * through `app.shared_location_fixes`).
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './identity';
import { pois } from './places';
import { trips } from './trips';

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => instant('created_at').notNull().defaultNow();
const updatedAt = () => instant('updated_at').notNull().defaultNow();
const tripId = () =>
  uuid('trip_id')
    .notNull()
    .references(() => trips.id);
const userId = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id);

export const locationShares = pgTable('location_shares', {
  id: id(),
  tripId: tripId(),
  userId: userId(),
  /** `crew_map` | `help` | `sos`. */
  reason: text('reason').notNull(),
  startsAt: instant('starts_at').notNull().defaultNow(),
  /** Null = until resolved (an open SOS). */
  endsAt: instant('ends_at'),
  paused: boolean('paused').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const locationFixes = pgTable('location_fixes', {
  id: id(),
  userId: userId(),
  tripId: tripId(),
  shareId: uuid('share_id')
    .notNull()
    .references(() => locationShares.id, { onDelete: 'cascade' }),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  accuracyM: real('accuracy_m').notNull(),
  activity: text('activity').notNull().default('unknown'),
  /** `MOCK_FLAG_*` bits from `@cp/domain`: simulated, accessory, implausible. */
  mockFlags: smallint('mock_flags').notNull().default(0),
  at: instant('at').notNull(),
  createdAt: createdAt(),
});

export const memberEtas = pgTable(
  'member_etas',
  {
    id: id(),
    tripId: tripId(),
    meetupId: uuid('meetup_id'),
    userId: userId(),
    distanceM: integer('distance_m'),
    etaMin: integer('eta_min'),
    mode: text('mode'),
    statusText: text('status_text'),
    /** True when `eta_min` is a straight-line estimate, not a routed path. */
    estimate: boolean('estimate').notNull().default(false),
    progress: real('progress'),
    sharing: text('sharing').notNull().default('off'),
    computedAt: instant('computed_at').notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique().on(table.tripId, table.userId)],
);

export const visits = pgTable('visits', {
  /** The client's UUIDv7, so a replayed `record_visit` lands on the same row. */
  id: uuid('id').primaryKey(),
  userId: userId(),
  tripId: tripId(),
  poiId: uuid('poi_id')
    .notNull()
    .references(() => pois.id),
  source: text('source').notNull(),
  arrivedAt: instant('arrived_at').notNull(),
  leftAt: instant('left_at'),
  detectionVersion: smallint('detection_version').notNull().default(1),
  /** Trip archived + 30 d, set by `visits.ttl`; null while the trip is live. */
  expiresAt: instant('expires_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

registerTablePrivacy('location_shares', { class: 'C1' });
registerTablePrivacy('location_fixes', { class: 'C3' });
registerTablePrivacy('member_etas', { class: 'C1' });
registerTablePrivacy('visits', { class: 'C3' });
