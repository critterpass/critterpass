/**
 * Disruption tables (docs/data-model.md §3.12): one row per thing threatening a trip's plan, the
 * forecast watch list, and the latest running-late check per member and item (no coordinates).
 * Typed mirror of packages/db/migrations/*_disruptions_watch_items.sql, the applied source of truth
 * for constraints, RLS and grants.
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
import { users } from './identity';
import { changeSets, planItems } from './plan';
import { polls } from './polls';
import { trips } from './trips';

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const stamps = () => ({
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

export const disruptions = pgTable('disruptions', {
  id: id(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  /** `flight_delay`, `storm`, `weather`, `running_late` or `closure`. */
  kind: text('kind').notNull(),
  /** What set it off: `delay`, `cancelled`, `diverted`, `missed_connection`, `rough_seas`, … */
  cause: text('cause').notNull(),
  /** `open`, `resolved`, `withdrawn` or `undone`. */
  status: text('status').notNull().default('open'),
  version: integer('version').notNull().default(1),
  dedupeKey: text('dedupe_key').notNull(),
  /** `flight_segment`, `watch_item` or `plan_item`. */
  refKind: text('ref_kind'),
  refId: uuid('ref_id'),
  title: text('title').notNull().default(''),
  summary: text('summary').notNull().default(''),
  affected: jsonb('affected').notNull().default({}),
  facts: jsonb('facts').notNull().default({}),
  options: jsonb('options').notNull().default([]),
  sourceSnapshot: jsonb('source_snapshot').notNull().default({}),
  changeSetId: uuid('change_set_id').references(() => changeSets.id),
  decisionPollId: uuid('decision_poll_id').references(() => polls.id),
  chosenOptionId: text('chosen_option_id'),
  chosenBy: uuid('chosen_by').references(() => users.id),
  detectedAt: instant('detected_at').notNull().defaultNow(),
  resolvedAt: instant('resolved_at'),
  ...stamps(),
});

export const watchItems = pgTable('watch_items', {
  id: id(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  /** `weather`, `marine`, `volcano`, `crowds`, `traffic` or `closure`. */
  kind: text('kind').notNull(),
  /** A plan item's stable id, or `day:<date>` / `airport:<date>`. */
  targetRef: text('target_ref').notNull(),
  planItemStableId: uuid('plan_item_stable_id'),
  day: date('day', { mode: 'string' }).notNull(),
  /** `go`, `watching`, `plan_b` or `set`. */
  status: text('status').notNull().default('go'),
  score: smallint('score').notNull().default(0),
  impact: jsonb('impact').notNull().default({}),
  title: text('title').notNull().default(''),
  detail: text('detail').notNull().default(''),
  sources: jsonb('sources').notNull().default([]),
  disruptionId: uuid('disruption_id').references(() => disruptions.id),
  escalatedAt: instant('escalated_at'),
  checkedAt: instant('checked_at').notNull().defaultNow(),
  resolvedAt: instant('resolved_at'),
  ...stamps(),
});

export const journeyChecks = pgTable('journey_checks', {
  id: id(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  itemId: uuid('item_id')
    .notNull()
    .references(() => planItems.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  /** `drive`, `walk`, `scooter` or `transfer`. */
  mode: text('mode').notNull(),
  etaAt: instant('eta_at').notNull(),
  lateMin: integer('late_min').notNull(),
  lateStreak: smallint('late_streak').notNull().default(0),
  onTimeStreak: smallint('on_time_streak').notNull().default(0),
  traffic: boolean('traffic').notNull().default(false),
  disruptionId: uuid('disruption_id').references(() => disruptions.id),
  checkedAt: instant('checked_at').notNull().defaultNow(),
  ...stamps(),
});

registerTablePrivacy('disruptions', { class: 'C1' });
registerTablePrivacy('watch_items', { class: 'C1' });
registerTablePrivacy('journey_checks', { class: 'C2' });

// A merged user's check on an item the account already checks keeps the account's row.
registerMergeRule({
  table: 'journey_checks',
  userColumn: 'user_id',
  strategy: 'reassign',
  conflictColumns: ['trip_id', 'item_id'],
});
