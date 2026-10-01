/**
 * Earned app icons, self-reported travel history and data exports (docs/data-model.md §3.1,
 * §3.17). Typed mirror of the applied migrations (packages/db/migrations/*_profile_settings_icons_history.sql,
 * *_data_exports.sql), not run through `drizzle-kit generate` (same convention as ./identity.ts).
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import { bigint, date, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { registerMergeRule } from '../merge-rules';
import { users } from './identity';

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** RLS class O read / S write: the unlock job writes, the owner reads (stream `me`). */
export const appIconUnlocks = pgTable('app_icon_unlocks', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  iconKey: text('icon_key').notNull(),
  source: text('source').notNull(),
  unlockedAt: instant('unlocked_at').notNull().defaultNow(),
  /** Set once the NEW badge has been seen. */
  seenAt: instant('seen_at'),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

/** RLS class O: self-reported trips; removal is a soft delete. */
export const pastTrips = pgTable('past_trips', {
  /** Client UUIDv7 from `add_past_trip`. */
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  placeId: uuid('place_id'),
  country: text('country').notNull(),
  /** First of the month. */
  month: date('month', { mode: 'string' }).notNull(),
  source: text('source').notNull().default('manual'),
  deletedAt: instant('deleted_at'),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

/** RLS class O read / S write: one row per export request; the zip lives in R2. */
export const dataExports = pgTable('data_exports', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  status: text('status').notNull().default('queued'),
  r2Key: text('r2_key'),
  bytes: bigint('bytes', { mode: 'number' }),
  progress: smallint('progress').notNull().default(0),
  errorCode: text('error_code'),
  requestedAt: instant('requested_at').notNull().defaultNow(),
  readyAt: instant('ready_at'),
  expiresAt: instant('expires_at'),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

registerTablePrivacy('app_icon_unlocks', { class: 'C2' });
registerTablePrivacy('past_trips', { class: 'C2' });
registerTablePrivacy('data_exports', { class: 'C2' });

// Merge (an anonymous uid folding into an existing one): an earned icon unlock follows the user
// (the existing unlock of the same icon wins), past trips follow the user, and a data export was
// built for the anonymous uid alone and goes with it. All three cascade with their user.
registerMergeRule({
  table: 'app_icon_unlocks',
  userColumn: 'user_id',
  strategy: 'union',
  conflictColumns: ['icon_key'],
  personal: true,
});
registerMergeRule({
  table: 'past_trips',
  userColumn: 'user_id',
  strategy: 'reassign',
  personal: true,
});
registerMergeRule({
  table: 'data_exports',
  userColumn: 'user_id',
  strategy: 'drop',
  personal: true,
});
