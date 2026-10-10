/**
 * Trip, participant and catalogue tables (docs/data-model.md §3.3). Typed mirror of
 * packages/db/migrations/*_trips_and_participants.sql, which is the applied source of truth for
 * columns, constraints, RLS and grants — this file is not run through `drizzle-kit generate`.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  customType,
  date,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { crews } from './crews';
import { users } from './identity';

/**
 * PostGIS `geography(MultiPolygon,4326)`, seeded from Overture locality/division polygons at ingest
 * (packages/db/migrations/*_places_postgis.sql; column added by *_pois_and_map_regions.sql). Drizzle
 * has no core-API geography type, so this is typed as its WKB-hex text wire representation, same
 * convention `packages/db/src/schema/places.ts` uses for `pois.geofence`.
 */
const geographyMultiPolygon = customType<{ data: string }>({
  dataType: () => 'geography(MultiPolygon,4326)',
});

export const destinations = pgTable('destinations', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  country: text('country'),
  coverage: text('coverage').notNull().default('guest'),
  colour: text('colour'),
  currency: text('currency'),
  bestMonths: integer('best_months').array(),
  tz: text('tz'),
  /** Place-level geofence for all 61 places, reviewed in the content factory. No consumer yet. */
  geofence: geographyMultiPolygon('geofence'),
  /** The place (critter set) this destination belongs to; no FK here to keep the modules acyclic. */
  critterSetId: uuid('critter_set_id'),
  /** The critter whose city this is (`critters.key`); kept by `app.sync_place_destinations()`. */
  critterKey: text('critter_key'),
  /** Calibrates free-flow drive minutes to local traffic (editorial; 1.0 = none). */
  driveFactor: real('drive_factor').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const guides = pgTable('guides', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  colour: text('colour').notNull(),
  personaPackVersion: text('persona_pack_version'),
  voiceId: text('voice_id'),
  localWords: jsonb('local_words').notNull().default({}),
  /** The critter this guide is (`critters.key`); null for a guide whose critter is not released. */
  critterKey: text('critter_key').unique(),
  /** `#rrggbb`; null until the catalogue sync has seen the guide's critter. */
  accent: text('accent'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const trips = pgTable('trips', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  crewId: uuid('crew_id')
    .notNull()
    .references(() => crews.id),
  status: text('status').notNull(),
  /** Generated column; never written directly (docs/data-model-sync-and-privacy.md §3.1). */
  phase: text('phase'),
  setupStep: text('setup_step').notNull().default('when'),
  destinationId: uuid('destination_id').references(() => destinations.id),
  guideId: uuid('guide_id').references(() => guides.id),
  isGuestGuide: boolean('is_guest_guide').notNull().default(false),
  isSolo: boolean('is_solo').notNull().default(false),
  startDate: date('start_date', { mode: 'string' }),
  endDate: date('end_date', { mode: 'string' }),
  tz: text('tz'),
  localCurrency: text('local_currency'),
  seatCap: integer('seat_cap').notNull().default(6),
  /** The length the setup date windows slide over (the vote's, until dates lock). */
  tripLengthDays: integer('trip_length_days'),
  planProgress: integer('plan_progress').notNull().default(0),
  redraftsUsed: integer('redrafts_used').notNull().default(0),
  redraftLimit: integer('redraft_limit').notNull().default(3),
  /**
   * The `plan_versions_and_changesets` migration adds the real FK once `itinerary_versions`
   * exists; left un-referenced here (rather than importing `./plan`) to avoid a circular import
   * between the two schema mirrors — the SQL migrations are the enforced source of truth either way.
   */
  currentVersionId: uuid('current_version_id'),
  draftVersionId: uuid('draft_version_id'),
  replyBy: timestamp('reply_by', { withTimezone: true, mode: 'date' }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
  /** Who may change the crew's plan: `organiser_approves` (default), `anyone`, `organiser_only`. */
  planChangeRule: text('plan_change_rule').notNull().default('organiser_approves'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const tripParticipants = pgTable('trip_participants', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  role: text('role').notNull().default('member'),
  rsvp: text('rsvp').notNull().default('unopened'),
  /** Generated column: `rsvp NOT IN ('out', 'waitlisted')`; waitlisted members hold no seat either. */
  holdsSeat: boolean('holds_seat'),
  waitlistPosition: integer('waitlist_position'),
  chosenOptions: jsonb('chosen_options').notNull().default({}),
  landedAt: timestamp('landed_at', { withTimezone: true, mode: 'date' }),
  countdownTargetAt: timestamp('countdown_target_at', { withTimezone: true, mode: 'date' }),
  /** No FK yet: eggs is created by a later phase. */
  eggId: uuid('egg_id'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

/**
 * How to get from one destination to another, one direction per row: a `day_trip` to an area the
 * crew comes back from the same day, or an `onward` leg to a trip's next city. Written by the
 * destination brief as a cited estimate (`sources`), or by an editor. Read through the api.
 */
export const destinationLinks = pgTable('destination_links', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  /** `<from slug>><to slug>:<kind>`. */
  key: text('key').notNull().unique(),
  fromDestinationId: uuid('from_destination_id')
    .notNull()
    .references(() => destinations.id),
  toDestinationId: uuid('to_destination_id')
    .notNull()
    .references(() => destinations.id),
  kind: text('kind').notNull(),
  /** Door to door, one way. */
  minutes: integer('minutes').notNull(),
  mode: text('mode').notNull(),
  /** `half` or `full`; set exactly for day trips. */
  dayLength: text('day_length'),
  /** A first visit includes this day trip; day trips only. */
  essential: boolean('essential'),
  costPpMinor: bigint('cost_pp_minor', { mode: 'number' }),
  costCurrency: text('cost_currency'),
  note: text('note'),
  i18n: jsonb('i18n'),
  position: integer('position').notNull().default(0),
  origin: text('origin').notNull().default('ai'),
  sources: jsonb('sources').notNull().default([]),
  /** The content release of an editorial row; empty for a written one. */
  releaseId: uuid('release_id'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

/**
 * The cities of a trip in order with their nights. Row 1 is the trip's own destination; a trip
 * with no rows has one stop. `crew_id` is the trip's, so the crew stream needs no lookup.
 */
export const tripStops = pgTable('trip_stops', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  crewId: uuid('crew_id')
    .notNull()
    .references(() => crews.id),
  position: integer('position').notNull(),
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id),
  nights: integer('nights').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

registerTablePrivacy('destinations', { class: 'C0' });
registerTablePrivacy('destination_links', { class: 'C0' });
registerTablePrivacy('trip_stops', { class: 'C1' });
registerTablePrivacy('guides', { class: 'C0' });
registerTablePrivacy('trips', { class: 'C1' });
registerTablePrivacy('trip_participants', { class: 'C1', columns: { chosen_options: 'C2' } });
