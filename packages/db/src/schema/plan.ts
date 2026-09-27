/**
 * Plan version, day, item, ChangeSet and GuideAction tables (docs/data-model.md §3.3). Typed
 * mirror of packages/db/migrations/*_plan_versions_and_changesets.sql, which is the applied source
 * of truth for columns, constraints, RLS and grants — this file is not run through
 * `drizzle-kit generate`.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { trips } from './trips';

export const itineraryVersions = pgTable('itinerary_versions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  parentId: uuid('parent_id'),
  visibility: text('visibility').notNull().default('organiser'),
  status: text('status').notNull().default('drafting'),
  costPpMinor: bigint('cost_pp_minor', { mode: 'number' }),
  currency: text('currency'),
  /** No FK yet: agent_jobs is created by a later phase. */
  createdByJobId: uuid('created_by_job_id'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const planDays = pgTable('plan_days', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  versionId: uuid('version_id')
    .notNull()
    .references(() => itineraryVersions.id),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  dayNo: integer('day_no').notNull(),
  date: date('date', { mode: 'string' }),
  theme: text('theme'),
  weatherRef: text('weather_ref'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const planItems = pgTable('plan_items', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  versionId: uuid('version_id')
    .notNull()
    .references(() => itineraryVersions.id),
  dayId: uuid('day_id')
    .notNull()
    .references(() => planDays.id),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  /** Survives across versions; ChangeSet ops and diffs key on this, not `id`. */
  stableId: uuid('stable_id')
    .notNull()
    .default(sql`uuidv7()`),
  startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }),
  endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }),
  tz: text('tz'),
  lane: text('lane'),
  attendeeIds: uuid('attendee_ids').array(),
  /** No FK yet: pois is created by a later phase. */
  poiId: uuid('poi_id'),
  /** No FK yet: providers is created by a later phase. */
  providerId: uuid('provider_id'),
  /** No FK yet: bookings is created by a later phase. */
  bookingId: uuid('booking_id'),
  /** No FK yet: must_dos is created by a later phase. */
  mustDoId: uuid('must_do_id'),
  category: text('category'),
  costModel: text('cost_model'),
  amountMinor: bigint('amount_minor', { mode: 'number' }),
  currency: text('currency'),
  status: text('status').notNull().default('proposed'),
  flexibility: text('flexibility'),
  isOutdoor: boolean('is_outdoor').notNull().default(false),
  createdByKind: text('created_by_kind').notNull().default('user'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const changeSets = pgTable('change_sets', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  baseVersionId: uuid('base_version_id')
    .notNull()
    .references(() => itineraryVersions.id),
  trigger: text('trigger').notNull(),
  scope: text('scope').notNull().default('group'),
  authorKind: text('author_kind').notNull(),
  authorId: uuid('author_id').notNull(),
  status: text('status').notNull().default('draft'),
  /** No FK yet: polls is created by a later phase. */
  pollId: uuid('poll_id'),
  costDeltaMinor: bigint('cost_delta_minor', { mode: 'number' }),
  ops: jsonb('ops').notNull(),
  approvedByKind: text('approved_by_kind'),
  approvedBy: uuid('approved_by'),
  resultVersionId: uuid('result_version_id').references(() => itineraryVersions.id),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const guideActions = pgTable('guide_actions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  changeSetId: uuid('change_set_id').references(() => changeSets.id),
  kind: text('kind').notNull(),
  /** No FK yet: providers is created by a later phase. */
  targetProviderId: uuid('target_provider_id'),
  channel: text('channel'),
  status: text('status').notNull().default('planned'),
  reversible: boolean('reversible').notNull().default(false),
  compensatesId: uuid('compensates_id'),
  costDeltaMinor: bigint('cost_delta_minor', { mode: 'number' }),
  audit: jsonb('audit').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

registerTablePrivacy('itinerary_versions', { class: 'C1' });
registerTablePrivacy('plan_days', { class: 'C1' });
registerTablePrivacy('plan_items', { class: 'C1' });
registerTablePrivacy('change_sets', { class: 'C1' });
registerTablePrivacy('guide_actions', { class: 'C1' });
