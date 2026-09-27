/**
 * Devices, push tokens and the notification router's tables (docs/data-model.md §3.11). Typed
 * mirror of packages/db/migrations/*_devices_notifications.sql, not run through
 * `drizzle-kit generate` (same convention as ./identity.ts). Every table is RLS class O and C2.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { crews } from './crews';
import { users } from './identity';
import { guides, trips } from './trips';

const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
const userId = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id);
const generatedId = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);

/** One row per app install; `id` is the install id the app keeps in its keychain/keystore. */
export const devices = pgTable('devices', {
  id: uuid('id').primaryKey(),
  userId: userId(),
  platform: text('platform').notNull(),
  bundleId: text('bundle_id'),
  osVersion: text('os_version'),
  appVersion: text('app_version').notNull(),
  locale: text('locale').notNull(),
  tz: text('tz').notNull(),
  permissionState: jsonb('permission_state').notNull().default({}),
  attribution: jsonb('attribution'),
  capabilities: jsonb('capabilities').notNull().default({}),
  laEnabled: boolean('la_enabled').notNull().default(false),
  laFrequent: boolean('la_frequent').notNull().default(false),
  foreground: boolean('foreground').notNull().default(false),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

registerTablePrivacy('devices', { class: 'C2' });

/** Provider tokens of one device, unique per (kind, token); API-only, never synced. */
export const pushTokens = pgTable('push_tokens', {
  id: generatedId(),
  deviceId: uuid('device_id')
    .notNull()
    .references(() => devices.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  token: text('token').notNull(),
  env: text('env').notNull(),
  invalidAt: timestamp('invalid_at', { withTimezone: true, mode: 'date' }),
  invalidReason: text('invalid_reason'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

registerTablePrivacy('push_tokens', { class: 'C2' });

export const notifications = pgTable('notifications', {
  id: generatedId(),
  userId: userId(),
  crewId: uuid('crew_id').references(() => crews.id),
  tripId: uuid('trip_id').references(() => trips.id),
  eventId: uuid('event_id'),
  key: text('key').notNull(),
  category: text('category').notNull(),
  class: text('class').notNull(),
  sender: jsonb('sender').notNull(),
  templateId: text('template_id').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  items: jsonb('items'),
  ctx: jsonb('ctx'),
  deepLink: text('deep_link'),
  collapseKey: text('collapse_key'),
  threadId: text('thread_id'),
  dedupeKey: text('dedupe_key').notNull(),
  isPrivate: boolean('is_private').notNull().default(false),
  needsYou: boolean('needs_you').notNull().default(false),
  llmGenerated: boolean('llm_generated').notNull().default(false),
  localDate: date('local_date').notNull(),
  notBefore: timestamp('not_before', { withTimezone: true, mode: 'date' }),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
  state: text('state').notNull().default('queued'),
  dropReason: text('drop_reason'),
  sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

registerTablePrivacy('notifications', { class: 'C2' });

export const notificationPrefs = pgTable('notification_prefs', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  budgetPerDay: integer('budget_per_day').notNull().default(5),
  roundupTime: time('roundup_time').notNull().default('20:00'),
  roundupTz: text('roundup_tz').notNull().default('trip'),
  quietFrom: time('quiet_from').notNull().default('22:00'),
  quietTo: time('quiet_to').notNull().default('07:00'),
  guideTips: boolean('guide_tips').notNull().default(true),
  money: boolean('money').notNull().default(true),
  crittersNearby: boolean('critters_nearby').notNull().default(true),
  crewChatMode: text('crew_chat_mode').notNull().default('all'),
  leaveByDnd: boolean('leave_by_dnd').notNull().default(true),
  perCategory: jsonb('per_category').notNull().default({}),
  voiceReadout: boolean('voice_readout').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

registerTablePrivacy('notification_prefs', { class: 'C2' });

export const pingLedger = pgTable('ping_ledger', {
  id: generatedId(),
  userId: userId(),
  localDate: date('local_date').notNull(),
  sentBudgeted: integer('sent_budgeted').notNull().default(0),
  sentAlways: integer('sent_always').notNull().default(0),
  sentLocal: integer('sent_local').notNull().default(0),
  paywallSent: integer('paywall_sent').notNull().default(0),
  queued: integer('queued').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

registerTablePrivacy('ping_ledger', { class: 'C2' });

export const roundups = pgTable('roundups', {
  id: generatedId(),
  userId: userId(),
  localDate: date('local_date').notNull(),
  tz: text('tz').notNull(),
  guideId: uuid('guide_id').references(() => guides.id),
  notificationIds: uuid('notification_ids')
    .array()
    .notNull()
    .default(sql`'{}'`),
  lines: jsonb('lines').notNull().default([]),
  sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
  fallbackUsed: boolean('fallback_used').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

registerTablePrivacy('roundups', { class: 'C2' });

export const inboxItems = pgTable('inbox_items', {
  id: generatedId(),
  userId: userId(),
  crewId: uuid('crew_id').references(() => crews.id),
  tripId: uuid('trip_id').references(() => trips.id),
  notificationId: uuid('notification_id').references(() => notifications.id),
  kind: text('kind').notNull(),
  needsYou: boolean('needs_you').notNull().default(false),
  actions: jsonb('actions').notNull().default([]),
  deepLink: text('deep_link'),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
  undoUntil: timestamp('undo_until', { withTimezone: true, mode: 'date' }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

registerTablePrivacy('inbox_items', { class: 'C2' });

export const scheduledDeliveries = pgTable('scheduled_deliveries', {
  id: generatedId(),
  userId: userId(),
  kind: text('kind').notNull(),
  targetRef: text('target_ref').notNull(),
  sendAtLocal: text('send_at_local').notNull(),
  tz: text('tz').notNull(),
  dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }).notNull(),
  payload: jsonb('payload').notNull().default({}),
  status: text('status').notNull().default('pending'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

registerTablePrivacy('scheduled_deliveries', { class: 'C2' });
