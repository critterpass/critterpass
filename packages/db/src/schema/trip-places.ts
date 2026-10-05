/**
 * Drizzle mirror of `trip_places` (packages/db/migrations/*_trip_places.sql, the applied source of
 * truth): one card per place a trip uses (its stops, ideas, must-dos and swipe deck), copied from
 * `pois` by `app.refresh_trip_places` so the trip stream syncs a trip's places with one bucket and
 * no lookup per place. C1: the places a trip uses reveal its plan, so crew rows reach active members
 * and an organiser draft's rows reach organisers only. Only the system writes it.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { pois } from './places';
import { destinations, trips } from './trips';

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const tripPlaces = pgTable(
  'trip_places',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id),
    poiId: uuid('poi_id')
      .notNull()
      .references(() => pois.id),
    /** `crew` (every active member) or `organiser` (an organiser-only draft's places). */
    visibility: text('visibility').notNull(),
    /** Why the trip holds the place: `stop`, `idea`, `must_do`, `deck`. */
    roles: text('roles').array().notNull(),
    // The card, copied from the place's `pois` row (same names, so the stream sends it as `pois`).
    destinationId: uuid('destination_id')
      .notNull()
      .references(() => destinations.id),
    name: text('name').notNull(),
    nameLocal: text('name_local'),
    category: text('category').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    address: text('address'),
    hours: jsonb('hours').notNull(),
    hoursVerifiedAt: instant('hours_verified_at'),
    priceLevel: integer('price_level'),
    editorial: jsonb('editorial').notNull(),
    tags: text('tags').array().notNull(),
    status: text('status').notNull(),
    curation: text('curation').notNull(),
    pickRank: integer('pick_rank'),
    visitRadiusM: integer('visit_radius_m'),
    timezone: text('timezone'),
    lastLiveCheckAt: instant('last_live_check_at'),
    poiCreatedAt: instant('poi_created_at').notNull(),
    poiUpdatedAt: instant('poi_updated_at').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('trip_places_trip_poi_visibility_key').on(t.tripId, t.poiId, t.visibility)],
);

registerTablePrivacy('trip_places', { class: 'C1' });
