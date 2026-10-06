/**
 * Community tables (docs/data-model.md §3.15): published crew plans, each participant's consent,
 * copies, place ratings with tips, nightly place rating counts and read-only plan links. Typed
 * mirror of packages/db/migrations/*_shared_plans_ratings.sql, the applied source of truth for
 * constraints, RLS and grants. Shared content is read over the api, never synced.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { registerMergeRule } from '../merge-rules';
import { placeTips } from './explore';
import { users } from './identity';
import { pois } from './places';
import { destinations, trips } from './trips';

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => at('created_at').notNull().defaultNow();
const updatedAt = () => at('updated_at').notNull().defaultNow();

export const sharedPlans = pgTable('shared_plans', {
  id: id(),
  /** Never granted to app_user: a published plan is read through its projection only. */
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id),
  requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('pending_consent'),
  toggles: jsonb('toggles').notNull(),
  consentRequiredUids: uuid('consent_required_uids')
    .array()
    .notNull()
    .default(sql`'{}'`),
  daysCount: smallint('days_count').notNull().default(0),
  travelMonth: smallint('travel_month'),
  travelYear: smallint('travel_year'),
  crewSize: smallint('crew_size').notNull().default(1),
  costPpRoundedMinor: bigint('cost_pp_rounded_minor', { mode: 'number' }),
  currency: text('currency'),
  title: text('title'),
  tags: text('tags')
    .array()
    .notNull()
    .default(sql`'{}'`),
  taste: jsonb('taste').notNull().default({}),
  projection: jsonb('projection').notNull().default({}),
  travelled: boolean('travelled').notNull().default(false),
  ratingAvg: numeric('rating_avg', { precision: 3, scale: 2 }),
  ratingCount: integer('rating_count').notNull().default(0),
  copiesCount: integer('copies_count').notNull().default(0),
  savesCount: integer('saves_count').notNull().default(0),
  unpublishReason: text('unpublish_reason'),
  publishedAt: at('published_at'),
  unpublishedAt: at('unpublished_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sharedPlanConsents = pgTable(
  'shared_plan_consents',
  {
    id: id(),
    sharedPlanId: uuid('shared_plan_id')
      .notNull()
      .references(() => sharedPlans.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    decision: text('decision').notNull().default('pending'),
    decidedAt: at('decided_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique('shared_plan_consents_plan_user_key').on(table.sharedPlanId, table.userId)],
);

export const sharedPlanCopies = pgTable('shared_plan_copies', {
  id: id(),
  sharedPlanId: uuid('shared_plan_id')
    .notNull()
    .references(() => sharedPlans.id),
  copiedBy: uuid('copied_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  days: smallint('days')
    .array()
    .notNull()
    .default(sql`'{}'`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const ratings = pgTable(
  'ratings',
  {
    id: id(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id),
    poiId: uuid('poi_id')
      .notNull()
      .references(() => pois.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    verdict: text('verdict').notNull(),
    tip: text('tip'),
    tipStatus: text('tip_status').notNull().default('none'),
    placeTipId: uuid('place_tip_id').references(() => placeTips.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique('ratings_trip_poi_user_key').on(table.tripId, table.poiId, table.userId)],
);

export const placeRatingStats = pgTable('place_rating_stats', {
  poiId: uuid('poi_id')
    .primaryKey()
    .references(() => pois.id, { onDelete: 'cascade' }),
  loved: integer('loved').notNull().default(0),
  fine: integer('fine').notNull().default(0),
  skip: integer('skip').notNull().default(0),
  updatedAt: updatedAt(),
});

export const planLinks = pgTable('plan_links', {
  id: id(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  sharedPlanId: uuid('shared_plan_id').references(() => sharedPlans.id),
  /** sha256 of the link token; the token itself is never stored. */
  tokenHash: text('token_hash').notNull().unique(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  revokedAt: at('revoked_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

registerTablePrivacy('shared_plans', {
  class: 'C0',
  columns: { trip_id: 'C2', requested_by: 'C2', consent_required_uids: 'C2' },
});
registerTablePrivacy('shared_plan_consents', { class: 'C2' });
registerTablePrivacy('shared_plan_copies', { class: 'C2' });
registerTablePrivacy('ratings', { class: 'C2' });
registerTablePrivacy('place_rating_stats', { class: 'C0' });
registerTablePrivacy('plan_links', { class: 'C2', columns: { token_hash: 'C3' } });

// A merged account keeps its consents, ratings and copies; an existing row for the same plan or
// place wins.
registerMergeRule({
  table: 'shared_plan_consents',
  userColumn: 'user_id',
  strategy: 'reassign',
  conflictColumns: ['shared_plan_id'],
  personal: true,
});
registerMergeRule({
  table: 'ratings',
  userColumn: 'user_id',
  strategy: 'reassign',
  conflictColumns: ['trip_id', 'poi_id'],
  personal: true,
});
registerMergeRule({
  table: 'shared_plan_copies',
  userColumn: 'copied_by',
  strategy: 'reassign',
  personal: true,
});
