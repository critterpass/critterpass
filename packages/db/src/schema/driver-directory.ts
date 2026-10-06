/**
 * Drivers our crews used (docs/data-model.md §3.7): the driver's own listing, created only when he
 * confirms it with a WhatsApp code; the crews' invites, answers and tips; per-crew stats behind the
 * directory order; and the ops anomaly flags. Migration `*_driver_directory.sql`.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { registerMergeRule } from '../merge-rules';
import { crews } from './crews';
import { users } from './identity';
import { providers } from './suppliers';
import { trips } from './trips';

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => at('created_at').notNull().defaultNow();
const updatedAt = () => at('updated_at').notNull().defaultNow();

export const driverListings = pgTable('driver_listings', {
  id: id(),
  displayName: text('display_name').notNull(),
  areas: text('areas')
    .array()
    .notNull()
    .default(sql`'{}'`),
  languages: text('languages')
    .array()
    .notNull()
    .default(sql`'{}'`),
  vehicle: jsonb('vehicle'),
  seats: smallint('seats'),
  dayTrips: boolean('day_trips').notNull().default(true),
  priceText: text('price_text'),
  photoKey: text('photo_key'),
  phoneE164Enc: text('phone_e164_enc').notNull(),
  phoneHash: text('phone_hash').notNull().unique(),
  status: text('status').notNull().default('listed'),
  showRatings: boolean('show_ratings').notNull().default(true),
  consentVersion: text('consent_version').notNull(),
  consentAt: at('consent_at').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  prevKeyHash: text('prev_key_hash'),
  keyRotatedAt: at('key_rotated_at').notNull().defaultNow(),
  listedAt: at('listed_at').notNull().defaultNow(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const driverListingStats = pgTable('driver_listing_stats', {
  listingId: uuid('listing_id')
    .primaryKey()
    .references(() => driverListings.id, { onDelete: 'cascade' }),
  crewsRated: integer('crews_rated').notNull().default(0),
  crewsLoved: integer('crews_loved').notNull().default(0),
  crewsFine: integer('crews_fine').notNull().default(0),
  crewsNotAgain: integer('crews_not_again').notNull().default(0),
  trips: integer('trips').notNull().default(0),
  topTags: text('top_tags')
    .array()
    .notNull()
    .default(sql`'{}'`),
  updatedAt: updatedAt(),
});

export const driverInvites = pgTable('driver_invites', {
  id: id(),
  listingId: uuid('listing_id').references(() => driverListings.id, { onDelete: 'set null' }),
  providerId: uuid('provider_id')
    .notNull()
    .references(() => providers.id),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  crewId: uuid('crew_id')
    .notNull()
    .references(() => crews.id),
  inviterId: uuid('inviter_id').references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(),
  phoneHash: text('phone_hash').notNull(),
  status: text('status').notNull().default('sent'),
  openedAt: at('opened_at'),
  claimedAt: at('claimed_at'),
  nudgedAt: at('nudged_at'),
  expiresAt: at('expires_at').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const driverRatings = pgTable('driver_ratings', {
  id: id(),
  listingId: uuid('listing_id').references(() => driverListings.id, { onDelete: 'set null' }),
  providerId: uuid('provider_id')
    .notNull()
    .references(() => providers.id),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  crewId: uuid('crew_id')
    .notNull()
    .references(() => crews.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  verdict: text('verdict').notNull(),
  tags: text('tags')
    .array()
    .notNull()
    .default(sql`'{}'`),
  status: text('status').notNull().default('visible'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const driverTips = pgTable('driver_tips', {
  id: id(),
  listingId: uuid('listing_id').references(() => driverListings.id, { onDelete: 'cascade' }),
  providerId: uuid('provider_id')
    .notNull()
    .references(() => providers.id),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  crewId: uuid('crew_id')
    .notNull()
    .references(() => crews.id),
  authorId: uuid('author_id').references(() => users.id),
  text: text('text').notNull(),
  crewSize: smallint('crew_size').notNull(),
  month: date('month', { mode: 'string' }).notNull(),
  status: text('status').notNull().default('pending'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const driverListingFlags = pgTable('driver_listing_flags', {
  id: id(),
  listingId: uuid('listing_id')
    .notNull()
    .references(() => driverListings.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  evidence: jsonb('evidence').notNull(),
  status: text('status').notNull().default('open'),
  clearedReason: text('cleared_reason'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// The listing is the driver's own public card; his phone and the key hashes never leave the api.
registerTablePrivacy('driver_listings', {
  class: 'C2',
  columns: { phone_e164_enc: 'C3', phone_hash: 'C3', key_hash: 'C3', prev_key_hash: 'C3' },
});
registerTablePrivacy('driver_listing_stats', { class: 'C2' });
registerTablePrivacy('driver_invites', {
  class: 'C1',
  columns: { token_hash: 'C3', phone_hash: 'C3' },
});
registerTablePrivacy('driver_ratings', { class: 'C1' });
registerTablePrivacy('driver_tips', { class: 'C1' });
registerTablePrivacy('driver_listing_flags', { class: 'C2' });

// A merged anonymous account's answers, tips and invites follow it; a duplicate answer on the same
// card keeps the existing account's.
registerMergeRule({
  table: 'driver_ratings',
  userColumn: 'user_id',
  strategy: 'union',
  conflictColumns: ['provider_id', 'trip_id'],
});
registerMergeRule({ table: 'driver_tips', userColumn: 'author_id', strategy: 'reassign' });
registerMergeRule({ table: 'driver_invites', userColumn: 'inviter_id', strategy: 'reassign' });
