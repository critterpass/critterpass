/**
 * POI, catalogue and map-region tables (docs/data-model.md §3.13). Typed mirror of
 * packages/db/migrations/*_pois_and_map_regions.sql, *_cities_index.sql and *_places_postgis.sql,
 * which are the applied source of truth for columns, constraints, RLS and grants — this file is not
 * run through `drizzle-kit generate`.
 *
 * `lat`/`lng` stay as plain columns (synced clients read plain numbers); `location` is a
 * PostGIS `geography(Point,4326)` generated from them (docs/data-model.md §3.13's `geo
 * geography(Point)`), used by near-me ranking, reverse geocoding and KNN queries via its GiST
 * index. `pois.geofence`/`destinations.geofence` are `geography(Polygon)`/`geography(MultiPolygon)`.
 * `packages/domain/src/places/poi.ts` has the wire/domain shapes these columns carry.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  customType,
  doublePrecision,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

import { destinations } from './trips';

/**
 * PostGIS geography columns: Drizzle has no core-API geography type, so these are typed as their
 * WKB-hex text wire representation (matching how `pg` returns them), same convention as `tsvector`
 * below. `destinations.geofence` uses `geographyMultiPolygon` but that column's Drizzle mirror lives
 * in `./trips.ts`, outside this file's ownership (`packages/db/src/schema/places.ts` only) — the
 * migration adds the real column either way.
 */
const geographyPoint = customType<{ data: string }>({ dataType: () => 'geography(Point,4326)' });
const geographyPolygon = customType<{ data: string }>({
  dataType: () => 'geography(Polygon,4326)',
});
const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

const llm = pgSchema('llm');

export const pois = pgTable('pois', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id),
  name: text('name').notNull(),
  nameLocal: text('name_local'),
  category: text('category').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  /** Generated column (`ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography`); never written directly. */
  location: geographyPoint('location'),
  address: text('address'),
  hours: jsonb('hours').notNull().default({}),
  hoursVerifiedAt: timestamp('hours_verified_at', { withTimezone: true, mode: 'date' }),
  priceLevel: integer('price_level'),
  sourceIds: jsonb('source_ids').notNull().default({}),
  editorial: jsonb('editorial').notNull().default({}),
  tags: text('tags').array().notNull().default([]),
  /** Generated column (`app.unaccent_immutable(name/name_local/address/tags)`); never written directly. */
  fts: tsvector('fts'),
  status: text('status').notNull().default('active'),
  curation: text('curation').notNull().default('auto'),
  mergedIntoId: uuid('merged_into_id'),
  geofence: geographyPolygon('geofence'),
  visitRadiusM: integer('visit_radius_m'),
  timezone: text('timezone'),
  lastLiveCheckAt: timestamp('last_live_check_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const poiEmbeddings = pgTable('poi_embeddings', {
  poiId: uuid('poi_id')
    .primaryKey()
    .references(() => pois.id),
  model: text('model').notNull(),
  embedding: vector('embedding', { dimensions: 1024 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const poiLiveChecks = pgTable('poi_live_checks', {
  poiId: uuid('poi_id')
    .primaryKey()
    .references(() => pois.id),
  isOpenNow: boolean('is_open_now'),
  closedPermanently: boolean('closed_permanently').notNull().default(false),
  checkedAt: timestamp('checked_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const mapRegions = pgTable('map_regions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id),
  pmtilesKey: text('pmtiles_key').notNull(),
  bytes: bigint('bytes', { mode: 'number' }).notNull(),
  version: text('version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

/**
 * Overture divisions/localities index (docs/data-model.md §3.13, doc delta): not synced
 * (`packages/db/src/publication.ts#PUBLISHABLE_CLASS_EXCEPTIONS`), served over HTTP only.
 */
export const cities = pgTable('cities', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  name: text('name').notNull(),
  country: text('country').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  /** Generated column (`ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography`); never written directly. */
  location: geographyPoint('location'),
  population: integer('population'),
  iataNearby: text('iata_nearby').array().notNull().default([]),
  sourceId: text('source_id'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

/**
 * `llm.pois` (docs/data-model-sync-and-privacy.md §2): curated POI + live-check flags only, for
 * `guide_reader`. Defined here (rather than a raw migration-only object) purely for typed reference;
 * the view itself is created by `packages/db/migrations/*_llm_pois_view.sql`.
 */
export const llmPois = llm.table('pois', {
  id: uuid('id').notNull(),
  destinationId: uuid('destination_id').notNull(),
  name: text('name').notNull(),
  nameLocal: text('name_local'),
  category: text('category').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  address: text('address'),
  hours: jsonb('hours').notNull(),
  hoursVerifiedAt: timestamp('hours_verified_at', { withTimezone: true, mode: 'date' }),
  priceLevel: integer('price_level'),
  tags: text('tags').array().notNull(),
  status: text('status').notNull(),
  timezone: text('timezone'),
  isOpenNow: boolean('is_open_now'),
  closedPermanently: boolean('closed_permanently'),
  liveCheckedAt: timestamp('live_checked_at', { withTimezone: true, mode: 'date' }),
  /** The content factory's signals, the only quality the guide may cite (there are no ratings). */
  curation: text('curation').notNull(),
  mustSee: boolean('must_see').notNull(),
  whyGo: text('why_go'),
});

registerTablePrivacy('pois', { class: 'C0' });
registerTablePrivacy('poi_embeddings', { class: 'C0' });
registerTablePrivacy('poi_live_checks', { class: 'C0' });
registerTablePrivacy('map_regions', { class: 'C0' });
registerTablePrivacy('cities', { class: 'C0' });
