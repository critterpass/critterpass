/**
 * Travel-data tables: frozen price quotes, nightly fare cells, weather/marine snapshots, crowd
 * forecasts, editorial season curves and events, and hazard alerts. Typed mirror of
 * packages/db/migrations/*_fares_weather_crowds.sql and *_season_and_hazards.sql, which are the
 * applied source of truth for columns, constraints, RLS and grants — this file is not run through
 * `drizzle-kit generate`. `jsonb` columns carry the shapes in `@cp/domain`'s travel-data types.
 */
import {
  registerTablePrivacy,
  type FareDay,
  type FarePriceObservation,
  type MarineSnapshotBody,
  type WeatherSnapshotBody,
} from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  customType,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { pois } from './places';
import { destinations, trips } from './trips';

/** Postgres `daterange`, carried as its text form (`[2026-11-11,2026-11-19)`). */
const daterange = customType<{ data: string }>({ dataType: () => 'daterange' });

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

export const priceQuotes = pgTable('price_quotes', {
  id: id(),
  tripId: uuid('trip_id').references(() => trips.id),
  kind: text('kind').notNull(),
  origin: text('origin'),
  destinationId: uuid('destination_id').references(() => destinations.id),
  dates: daterange('dates'),
  amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
  currency: text('currency').notNull(),
  source: text('source').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true, mode: 'date' }).notNull(),
  frozenAt: timestamp('frozen_at', { withTimezone: true, mode: 'date' }),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const fareCells = pgTable(
  'fare_cells',
  {
    id: id(),
    originIata: text('origin_iata').notNull(),
    destIata: text('dest_iata').notNull(),
    destinationId: uuid('destination_id')
      .notNull()
      .references(() => destinations.id),
    month: date('month', { mode: 'string' }).notNull(),
    departOn: date('depart_on', { mode: 'string' }),
    returnOn: date('return_on', { mode: 'string' }),
    priceMinor: bigint('price_minor', { mode: 'number' }),
    currency: text('currency').notNull(),
    transfers: smallint('transfers'),
    durationMin: integer('duration_min'),
    fastestDurationMin: integer('fastest_duration_min'),
    days: jsonb('days').$type<FareDay[]>().notNull().default([]),
    priceHistory: jsonb('price_history').$type<FarePriceObservation[]>().notNull().default([]),
    foundAt: timestamp('found_at', { withTimezone: true, mode: 'date' }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true, mode: 'date' }),
    checkedAt: timestamp('checked_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique().on(table.originIata, table.destIata, table.month)],
);

export const weatherSnapshots = pgTable(
  'weather_snapshots',
  {
    id: id(),
    destinationId: uuid('destination_id')
      .notNull()
      .references(() => destinations.id),
    pointKey: text('point_key').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    elevationM: integer('elevation_m'),
    date: date('date', { mode: 'string' }).notNull(),
    hourly: jsonb('hourly').$type<WeatherSnapshotBody>().notNull(),
    marine: jsonb('marine').$type<MarineSnapshotBody>(),
    marineFetchedAt: timestamp('marine_fetched_at', { withTimezone: true, mode: 'date' }),
    source: text('source').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true, mode: 'date' }).notNull(),
    checkedAt: timestamp('checked_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique().on(table.destinationId, table.pointKey, table.date, table.source)],
);

export const crowdForecasts = pgTable(
  'crowd_forecasts',
  {
    id: id(),
    poiId: uuid('poi_id')
      .notNull()
      .references(() => pois.id),
    dow: smallint('dow').notNull(),
    hourly: smallint('hourly').array().notNull(),
    source: text('source').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique().on(table.poiId, table.dow)],
);

export const seasonMonths = pgTable(
  'season_months',
  {
    id: id(),
    destinationId: uuid('destination_id')
      .notNull()
      .references(() => destinations.id),
    month: smallint('month').notNull(),
    crowdIndex: smallint('crowd_index').notNull(),
    priceIndex: smallint('price_index'),
    priceIndexSource: text('price_index_source').notNull().default('editorial'),
    highlightTag: text('highlight_tag'),
    colourRole: text('colour_role').notNull().default('normal'),
    source: text('source').notNull(),
    sourceUrl: text('source_url'),
    sourcedOn: date('sourced_on', { mode: 'string' }).notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique().on(table.destinationId, table.month)],
);

export const seasonEvents = pgTable(
  'season_events',
  {
    id: id(),
    destinationId: uuid('destination_id')
      .notNull()
      .references(() => destinations.id),
    key: text('key').notNull(),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    endsOn: date('ends_on', { mode: 'string' }).notNull(),
    confidence: text('confidence').notNull().default('typical'),
    source: text('source').notNull(),
    sourceUrl: text('source_url'),
    sourcedOn: date('sourced_on', { mode: 'string' }).notNull(),
    forecastUpdatedAt: timestamp('forecast_updated_at', { withTimezone: true, mode: 'date' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique().on(table.destinationId, table.key)],
);

export const hazardAlerts = pgTable(
  'hazard_alerts',
  {
    id: id(),
    destinationId: uuid('destination_id')
      .notNull()
      .references(() => destinations.id),
    kind: text('kind').notNull(),
    subject: text('subject').notNull(),
    level: smallint('level').notNull(),
    levelLabel: text('level_label').notNull(),
    headline: text('headline').notNull(),
    source: text('source').notNull(),
    sourceUrl: text('source_url').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'date' }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique().on(table.destinationId, table.source, table.subject)],
);

registerTablePrivacy('price_quotes', { class: 'C1' });
registerTablePrivacy('fare_cells', { class: 'C0' });
registerTablePrivacy('weather_snapshots', { class: 'C0' });
registerTablePrivacy('crowd_forecasts', { class: 'C0' });
registerTablePrivacy('season_months', { class: 'C0' });
registerTablePrivacy('season_events', { class: 'C0' });
registerTablePrivacy('hazard_alerts', { class: 'C0' });
