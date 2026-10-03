/**
 * Live Activity tables (docs/data-model.md §3.11). Typed mirror of
 * packages/db/migrations/*_live_activities.sql, not run through `drizzle-kit generate`. Every table
 * is C2 and never replicated: tokens and activity rows are read by their owner's own api calls
 * and by the worker, the channel and frame tables by the worker only.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { registerMergeRule } from '../merge-rules';
import { users } from './identity';
import { devices } from './notifications';
import { trips } from './trips';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => at('created_at').notNull().defaultNow();
const updatedAt = () => at('updated_at').notNull().defaultNow();
const generatedId = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const deviceId = () =>
  uuid('device_id')
    .notNull()
    .references(() => devices.id, { onDelete: 'cascade' });
const userId = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id);

/** One push-to-start token per (device, activity type); rotates when iOS issues a new one. */
export const laPushToStartTokens = pgTable('la_push_to_start_tokens', {
  id: generatedId(),
  deviceId: deviceId(),
  userId: userId(),
  activityType: text('activity_type').notNull(),
  token: text('token').notNull(),
  env: text('env').notNull(),
  /** The registering build draws this kind (it listed it in `la_kinds`). */
  drawn: boolean('drawn').notNull().default(false),
  invalidAt: at('invalid_at'),
  invalidReason: text('invalid_reason'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

registerTablePrivacy('la_push_to_start_tokens', { class: 'C2' });

/** The APNs broadcast channel of one shared object (leave-by, meet-up, poll) and build. */
export const broadcastChannels = pgTable('broadcast_channels', {
  id: generatedId(),
  kind: text('kind').notNull(),
  refId: uuid('ref_id').notNull(),
  env: text('env').notNull(),
  bundleId: text('bundle_id').notNull(),
  apnsChannelId: text('apns_channel_id'),
  storagePolicy: text('storage_policy').notNull().default('no_storage'),
  deleteAfter: at('delete_after'),
  deletedAt: at('deleted_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

registerTablePrivacy('broadcast_channels', { class: 'C2' });

/** Every Live Activity the server knows a phone shows; one live row per (device, kind, object). */
export const deviceActivities = pgTable('device_activities', {
  id: generatedId(),
  deviceId: deviceId(),
  userId: userId(),
  tripId: uuid('trip_id').references(() => trips.id),
  kind: text('kind').notNull(),
  refId: uuid('ref_id').notNull(),
  osActivityId: text('os_activity_id'),
  activityPushToken: text('activity_push_token'),
  tokenEnv: text('token_env'),
  broadcastChannelId: uuid('broadcast_channel_id').references(() => broadcastChannels.id),
  startedVia: text('started_via').notNull(),
  state: text('state').notNull().default('pending'),
  startedAt: at('started_at').notNull().defaultNow(),
  staleAt: at('stale_at'),
  endsAt: at('ends_at'),
  endedAt: at('ended_at'),
  endReason: text('end_reason'),
  restartCount: smallint('restart_count').notNull().default(0),
  lastContentVersion: integer('last_content_version').notNull().default(0),
  lastSentAt: at('last_sent_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

registerTablePrivacy('device_activities', { class: 'C2' });

/** The orchestrator's last frame per object: shared content version, phase and state. */
export const laObjectStates = pgTable(
  'la_object_states',
  {
    kind: text('kind').notNull(),
    refId: uuid('ref_id').notNull(),
    tripId: uuid('trip_id').references(() => trips.id),
    seq: integer('seq').notNull().default(0),
    phase: text('phase').notNull().default('live'),
    lastState: jsonb('last_state'),
    endedAt: at('ended_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.kind, table.refId] })],
);

registerTablePrivacy('la_object_states', { class: 'C2' });

// The anonymous uid's phone is the one the user holds: its tokens and activities follow the
// merged user, like the device row itself.
registerMergeRule({
  table: 'la_push_to_start_tokens',
  userColumn: 'user_id',
  strategy: 'reassign',
  personal: true,
});
registerMergeRule({
  table: 'device_activities',
  userColumn: 'user_id',
  strategy: 'reassign',
  personal: true,
});
