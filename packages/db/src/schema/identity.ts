/**
 * Identity tables (docs/data-model.md §3.1). Typed mirror of
 * packages/db/migrations/*_identity_and_crews.sql, which is the applied source of truth for
 * columns, constraints, RLS and grants — this file is not run through `drizzle-kit generate`.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  customType,
  date,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** Postgres `citext`: drizzle-orm has no built-in column type for it. */
const citext = customType<{ data: string }>({ dataType: () => 'citext' });

export const users = pgTable('users', {
  /** Equals the matching `auth.user.id` (Better Auth owns that table; arrives in a later migration). */
  id: uuid('id').primaryKey(),
  status: text('status').notNull().default('anonymous'),
  displayName: text('display_name'),
  username: citext('username'),
  homeAirport: text('home_airport'),
  homeCountry: text('home_country'),
  homeCurrency: text('home_currency'),
  locale: text('locale'),
  tz: text('tz'),
  memberSince: date('member_since', { mode: 'string' })
    .notNull()
    .default(sql`CURRENT_DATE`),
  /** The current `avatars` row (FK in the onboarding migration; set null if the row goes). */
  avatarId: uuid('avatar_id'),
  appIcon: text('app_icon'),
  purgeAt: timestamp('purge_at', { withTimezone: true, mode: 'date' }),
  /** Spoken languages (ISO 639), up to 12. */
  languages: text('languages')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  /** Last username change; the next one waits 30 days. */
  usernameChangedAt: timestamp('username_changed_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  chattiness: text('chattiness'),
  talkOutLoud: boolean('talk_out_loud').notNull().default(false),
  leaveByThroughDnd: boolean('leave_by_through_dnd').notNull().default(true),
  crewChatMode: text('crew_chat_mode'),
  locationMode: text('location_mode'),
  emailImport: boolean('email_import').notNull().default(false),
  priceDisplay: text('price_display').notNull().default('home'),
  timeFormat: text('time_format'),
  distanceUnit: text('distance_unit'),
  appLocale: text('app_locale'),
  hideLockscreenDetails: boolean('hide_lockscreen_details').notNull().default(false),
  hideTasteTags: boolean('hide_taste_tags').notNull().default(false),
  hideCollection: boolean('hide_collection').notNull().default(false),
  exploreAtHome: boolean('explore_at_home').notNull().default(false),
  /** The crew Home shows; FK to crews in SQL (not mirrored here to keep the import graph acyclic). */
  activeCrewId: uuid('active_crew_id'),
  /** Crewmates whose chat messages this user hides on their own devices (`mute_member`). */
  mutedUids: uuid('muted_uids')
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`),
  /** Guide sound and music (`packages/domain` `audioSettingsSchema`), merged by `set_settings`. */
  audio: jsonb('audio').notNull().default({}),
  /** ISO 4217; overrides the home airport's currency for prices (3n-8). */
  homeCurrencyOverride: text('home_currency_override'),
  /** The signature stroke (a `media_objects` key, purpose signature) the traveller signs stamps with. */
  signatureMediaKey: text('signature_media_key'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const consents = pgTable('consents', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  purpose: text('purpose').notNull(),
  scope: jsonb('scope').notNull().default({}),
  grantedAt: timestamp('granted_at', { withTimezone: true, mode: 'date' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  copyVersion: text('copy_version'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const mediaObjects = pgTable('media_objects', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  /** Null only for trip media the crew shares (recap narration), never one traveller's. */
  ownerId: uuid('owner_id').references(() => users.id),
  r2Key: text('r2_key').notNull(),
  kind: text('kind').notNull(),
  bytes: bigint('bytes', { mode: 'number' }).notNull(),
  sha256: text('sha256').notNull(),
  /** No FK yet: trips is created by a later migration. */
  tripId: uuid('trip_id'),
  purpose: text('purpose'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

// Crew visibility: users holds C1 (crew-visible) columns plus non-sensitive C2 (home airport/currency).
registerTablePrivacy('users', {
  class: 'C1',
  columns: { home_airport: 'C2', home_currency: 'C2' },
});
registerTablePrivacy('user_settings', { class: 'C2' });
registerTablePrivacy('consents', { class: 'C2' });
registerTablePrivacy('media_objects', { class: 'C2' });
