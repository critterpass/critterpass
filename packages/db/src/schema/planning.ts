/**
 * Planning tables (docs/data-model.md §3.3, §3.13): the crew's Ideas, where people stand on a
 * place, the places a person hid, stored legs per plan version, the plan check and its issues,
 * an organiser's private ask to one member, the server's route cache and climate normals. Typed
 * mirror of packages/db/migrations/*_planning_places_tables.sql, the applied source of truth for
 * columns, constraints, RLS and grants.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
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

import { registerMergeRule } from '../merge-rules';
import { users } from './identity';
import { pois } from './places';
import { itineraryVersions, planDays } from './plan';
import { destinations, trips } from './trips';

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => at('created_at').notNull().defaultNow();
const updatedAt = () => at('updated_at').notNull().defaultNow();
const tripId = () =>
  uuid('trip_id')
    .notNull()
    .references(() => trips.id);

export const tripIdeas = pgTable('trip_ideas', {
  id: id(),
  tripId: tripId(),
  /** Null for a dropped pin. Unique per trip among live ideas (a partial index). */
  poiId: uuid('poi_id').references(() => pois.id),
  /** Display copy, so a phone shows the idea without a `pois` row. */
  name: text('name').notNull(),
  nameLocal: text('name_local'),
  category: text('category').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  /** Who saved it, swiped yes on it or imported it. */
  backerIds: uuid('backer_ids')
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`),
  sources: text('sources').array().notNull(),
  /** The link a member pasted; nothing else from the post is kept. */
  sourceUrl: text('source_url'),
  /** `@cp/domain` `storedFitSchema`, written by the plan check. */
  fit: jsonb('fit'),
  fitVersionId: uuid('fit_version_id').references(() => itineraryVersions.id),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: at('deleted_at'),
});

export const placeHides = pgTable(
  'place_hides',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    poiId: uuid('poi_id')
      .notNull()
      .references(() => pois.id),
    createdAt: createdAt(),
  },
  (table) => [unique('place_hides_user_poi_key').on(table.userId, table.poiId)],
);

export const placeStances = pgTable(
  'place_stances',
  {
    id: id(),
    tripId: tripId(),
    poiId: uuid('poi_id')
      .notNull()
      .references(() => pois.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    stance: text('stance').notNull(),
    /** The person's own words for the crew, at most 140 characters. */
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('place_stances_trip_poi_user_key').on(table.tripId, table.poiId, table.userId),
  ],
);

export const planLegs = pgTable(
  'plan_legs',
  {
    id: id(),
    tripId: tripId(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => itineraryVersions.id),
    dayId: uuid('day_id')
      .notNull()
      .references(() => planDays.id),
    /** `stay` or a plan item's `stable_id`. */
    fromKey: text('from_key').notNull(),
    toKey: text('to_key').notNull(),
    mode: text('mode').notNull(),
    minutes: integer('minutes').notNull(),
    meters: integer('meters').notNull(),
    /** Self-hosted routing or a straight-line estimate; never a Navigation API result. */
    source: text('source').notNull(),
    approx: boolean('approx').notNull().default(false),
    /** Road shape (encoded polyline, precision 5) from self-hosted routing; null draws straight. */
    shape: text('shape'),
    computedAt: at('computed_at').notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique('plan_legs_version_pair_key').on(table.versionId, table.fromKey, table.toKey)],
);

/** One row per trip: the latest plan check run. Synced with `trip_id` as its id. */
export const planChecks = pgTable('plan_checks', {
  tripId: uuid('trip_id')
    .primaryKey()
    .references(() => trips.id),
  versionId: uuid('version_id').references(() => itineraryVersions.id),
  status: text('status').notNull().default('queued'),
  checkedAt: at('checked_at'),
  fixCount: integer('fix_count').notNull().default(0),
  knowCount: integer('know_count').notNull().default(0),
  runsOn: date('runs_on', { mode: 'string' }),
  runsToday: integer('runs_today').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const planCheckIssues = pgTable('plan_check_issues', {
  id: id(),
  tripId: tripId(),
  versionId: uuid('version_id')
    .notNull()
    .references(() => itineraryVersions.id),
  kind: text('kind').notNull(),
  severity: text('severity').notNull(),
  dayId: uuid('day_id').references(() => planDays.id),
  stableIds: uuid('stable_ids')
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`),
  /** Numbers and ids per kind (`@cp/domain` `CHECK_ISSUE_PARAMS`); the app words them. */
  params: jsonb('params').notNull(),
  /** `@cp/domain` `checkFixSchema`. */
  fix: jsonb('fix'),
  rank: integer('rank').notNull(),
  /** Kind + day + stable ids, so an unchanged issue keeps its identity across runs. */
  fingerprint: text('fingerprint').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const memberAsks = pgTable('member_asks', {
  id: id(),
  tripId: tripId(),
  askedBy: uuid('asked_by')
    .notNull()
    .references(() => users.id),
  memberId: uuid('member_id')
    .notNull()
    .references(() => users.id),
  ideaIds: uuid('idea_ids').array().notNull(),
  /** Planner ops validated when the ask was made, applied if the member accepts. */
  ops: jsonb('ops').notNull(),
  status: text('status').notNull().default('open'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  answeredAt: at('answered_at'),
});

/** Server only: drive and walk minutes reused across jobs (no app_user grant at all). */
export const routeCache = pgTable('route_cache', {
  key: text('key').primaryKey(),
  minutes: integer('minutes').notNull(),
  meters: integer('meters').notNull(),
  source: text('source').notNull(),
  computedAt: at('computed_at').notNull().defaultNow(),
});

export const climateNormals = pgTable(
  'climate_normals',
  {
    id: id(),
    destinationId: uuid('destination_id')
      .notNull()
      .references(() => destinations.id),
    /** 0.1° grid cell, `lat,lng` of its south-west corner. */
    cell: text('cell').notNull(),
    month: smallint('month').notNull(),
    /** Usual chance of rain for each hour of the day, 0-100. */
    rainPct: smallint('rain_pct').array().notNull(),
    source: text('source').notNull(),
    years: smallint('years').notNull(),
    computedAt: at('computed_at').notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('climate_normals_cell_month_key').on(table.destinationId, table.cell, table.month),
  ],
);

registerTablePrivacy('trip_ideas', { class: 'C1' });
registerTablePrivacy('place_stances', { class: 'C1' });
registerTablePrivacy('place_hides', { class: 'C2' });
registerTablePrivacy('plan_legs', { class: 'C1' });
registerTablePrivacy('plan_checks', { class: 'C1' });
registerTablePrivacy('plan_check_issues', { class: 'C1' });
registerTablePrivacy('member_asks', { class: 'C2' });
registerTablePrivacy('route_cache', { class: 'C4' });
registerTablePrivacy('climate_normals', { class: 'C0' });

// A hidden place follows a merged user (personal: their own row); a stance follows them too,
// and an existing stance on the same place in the same trip wins.
registerMergeRule({
  table: 'place_hides',
  userColumn: 'user_id',
  strategy: 'reassign',
  conflictColumns: ['poi_id'],
  personal: true,
});
registerMergeRule({
  table: 'place_stances',
  userColumn: 'user_id',
  strategy: 'reassign',
  conflictColumns: ['trip_id', 'poi_id'],
});
