/**
 * Trip day tables (docs/data-model.md §3.11, §3.12): morning briefings and their items, packing
 * rows, leave-bys with the crew's readiness, the device alarm mirror and the per-day offline bundle
 * manifest. Typed mirror of packages/db/migrations/*_trip_day_leave_by_alarms.sql, the applied
 * source of truth for constraints, RLS and grants.
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
import { agentJobs } from './ai';
import { users } from './identity';
import { planItems } from './plan';
import { devices } from './notifications';
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

export const briefings = pgTable('briefings', {
  id: id(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  localDate: date('local_date', { mode: 'string' }).notNull(),
  tz: text('tz').notNull(),
  agentJobId: uuid('agent_job_id').references(() => agentJobs.id),
  /** `ready`, `empty` (nothing worth saying) or `failed`. */
  status: text('status').notNull().default('ready'),
  fallbackUsed: boolean('fallback_used').notNull().default(false),
  builtAt: instant('built_at'),
  ...stamps(),
});

export const briefingItems = pgTable('briefing_items', {
  id: id(),
  briefingId: uuid('briefing_id')
    .notNull()
    .references(() => briefings.id, { onDelete: 'cascade' }),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  position: smallint('position').notNull().default(0),
  icon: text('icon').notNull(),
  text: text('text').notNull(),
  /** `done`, `nudge`, `set` or `open`. */
  action: text('action').notNull(),
  targetUserIds: uuid('target_user_ids')
    .array()
    .notNull()
    .default(sql`'{}'`),
  deepLink: text('deep_link'),
  facts: jsonb('facts').notNull().default({}),
  /** `open`, `done`, `nudged`, `set` or `opened`. */
  status: text('status').notNull().default('open'),
  /** `daily_job` or `event`. */
  source: text('source').notNull().default('daily_job'),
  sourceEventId: uuid('source_event_id'),
  dedupeKey: text('dedupe_key').notNull(),
  actedAt: instant('acted_at'),
  ...stamps(),
  /** Translations of the guide-written text, per language (`@cp/domain` guide-text). */
  i18n: jsonb('i18n'),
});

export const packingItems = pgTable('packing_items', {
  id: id(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  day: date('day', { mode: 'string' }),
  /** Null = a shared row the whole crew sees. */
  ownerId: uuid('owner_id').references(() => users.id),
  label: text('label').notNull(),
  checked: boolean('checked').notNull().default(false),
  checkedBy: uuid('checked_by').references(() => users.id),
  checkedAt: instant('checked_at'),
  /** `user` or `guide`. */
  suggestedBy: text('suggested_by').notNull().default('user'),
  createdBy: uuid('created_by').references(() => users.id),
  version: integer('version').notNull().default(1),
  deletedAt: instant('deleted_at'),
  ...stamps(),
});

export const leaveBys = pgTable('leave_bys', {
  id: id(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  planItemId: uuid('plan_item_id')
    .notNull()
    .references(() => planItems.id),
  planItemStableId: uuid('plan_item_stable_id').notNull(),
  title: text('title').notNull().default(''),
  placeName: text('place_name'),
  localDate: date('local_date', { mode: 'string' }).notNull(),
  startsAt: instant('starts_at').notNull(),
  leaveAt: instant('leave_at').notNull(),
  pickupAt: instant('pickup_at'),
  tz: text('tz').notNull(),
  legs: jsonb('legs').notNull().default([]),
  /** `time` or `location`. */
  progressMode: text('progress_mode').notNull().default('time'),
  alarmPolicy: jsonb('alarm_policy').notNull(),
  pickup: jsonb('pickup'),
  bufferMin: smallint('buffer_min').notNull().default(10),
  guideNote: text('guide_note'),
  participantIds: uuid('participant_ids')
    .array()
    .notNull()
    .default(sql`'{}'`),
  /** `scheduled`, `window`, `alerting`, `departed` or `cancelled`. */
  state: text('state').notNull().default('scheduled'),
  version: integer('version').notNull().default(1),
  computedAt: instant('computed_at').notNull().defaultNow(),
  ...stamps(),
});

export const readiness = pgTable('readiness', {
  id: id(),
  leaveById: uuid('leave_by_id')
    .notNull()
    .references(() => leaveBys.id, { onDelete: 'cascade' }),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  /** `not_up`, `up`, `ready` or `left`. */
  state: text('state').notNull().default('not_up'),
  /** `la`, `alarm`, `app`, `widget` or `notification`. */
  source: text('source'),
  snoozeCount: smallint('snooze_count').notNull().default(0),
  knockSentAt: instant('knock_sent_at'),
  changedAt: instant('changed_at'),
  ...stamps(),
});

export const alarms = pgTable('alarms', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  deviceId: uuid('device_id')
    .notNull()
    .references(() => devices.id),
  leaveById: uuid('leave_by_id')
    .notNull()
    .references(() => leaveBys.id, { onDelete: 'cascade' }),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  fireAt: instant('fire_at').notNull(),
  osAlarmId: text('os_alarm_id'),
  /** `scheduled`, `alerting`, `snoozed`, `stopped` or `cancelled`. */
  state: text('state').notNull(),
  syncVersion: integer('sync_version').notNull().default(1),
  ...stamps(),
});

export const offlineBundles = pgTable('offline_bundles', {
  id: id(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  localDate: date('local_date', { mode: 'string' }).notNull(),
  version: integer('version').notNull().default(1),
  contentHash: text('content_hash').notNull(),
  manifest: jsonb('manifest').notNull(),
  builtAt: instant('built_at').notNull().defaultNow(),
  ...stamps(),
});

registerTablePrivacy('briefings', { class: 'C2' });
registerTablePrivacy('briefing_items', { class: 'C2' });
registerTablePrivacy('packing_items', { class: 'C1' });
registerTablePrivacy('leave_bys', { class: 'C1' });
registerTablePrivacy('readiness', { class: 'C1' });
registerTablePrivacy('alarms', { class: 'C2' });
registerTablePrivacy('offline_bundles', { class: 'C1' });

// A merged user's briefing for a day the account already has is dropped (the account's stands);
// readiness on a leave-by the account is already on keeps the account's row.
registerMergeRule({
  table: 'briefings',
  userColumn: 'user_id',
  strategy: 'reassign',
  conflictColumns: ['trip_id', 'local_date'],
});
registerMergeRule({ table: 'briefing_items', userColumn: 'user_id', strategy: 'reassign' });
registerMergeRule({
  table: 'readiness',
  userColumn: 'user_id',
  strategy: 'reassign',
  conflictColumns: ['leave_by_id'],
});
registerMergeRule({ table: 'alarms', userColumn: 'user_id', strategy: 'reassign' });
registerMergeRule({ table: 'packing_items', userColumn: 'owner_id', strategy: 'reassign' });
