/**
 * Home and lock-screen widgets (docs/data-model.md §3.11). Typed mirror of
 * packages/db/migrations/*_widget_tokens_and_installs.sql, not run through `drizzle-kit generate`.
 * All C2 and never replicated: the phone reports its widget token and the widgets it shows, the
 * worker reads both to send widget refresh pushes and books each one in the per-device ledger.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { registerMergeRule } from '../merge-rules';
import { users } from './identity';
import { devices } from './notifications';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const deviceId = () =>
  uuid('device_id')
    .notNull()
    .references(() => devices.id, { onDelete: 'cascade' });
const userId = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

/** The widget extension's push token per install (`all`: one token for every widget). */
export const widgetPushTokens = pgTable('widget_push_tokens', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  deviceId: deviceId(),
  userId: userId(),
  widgetKind: text('widget_kind').notNull().default('all'),
  token: text('token').notNull(),
  env: text('env').notNull(),
  invalidAt: at('invalid_at'),
  invalidReason: text('invalid_reason'),
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

/** One widget a phone shows: kind, size family and the trip or crew it is set to. */
export const installedWidgets = pgTable('installed_widgets', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  deviceId: deviceId(),
  userId: userId(),
  kind: text('kind').notNull(),
  family: text('family').notNull(),
  config: jsonb('config').notNull().default({}),
  lastSeenAt: at('last_seen_at').notNull().defaultNow(),
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

/** Widget refresh pushes sent to one install per UTC day (the daily cap). */
export const widgetPushLedger = pgTable(
  'widget_push_ledger',
  {
    deviceId: deviceId(),
    utcDate: date('utc_date', { mode: 'string' }).notNull(),
    sent: integer('sent').notNull().default(0),
    lastRoutineAt: at('last_routine_at'),
  },
  (table) => [primaryKey({ columns: [table.deviceId, table.utcDate] })],
);

registerTablePrivacy('widget_push_tokens', { class: 'C2' });
registerTablePrivacy('installed_widgets', { class: 'C2' });
registerTablePrivacy('widget_push_ledger', { class: 'C2' });

// The anonymous uid's phone is the one the user holds: its widget rows follow the merged user.
registerMergeRule({
  table: 'widget_push_tokens',
  userColumn: 'user_id',
  strategy: 'reassign',
  personal: true,
});
registerMergeRule({
  table: 'installed_widgets',
  userColumn: 'user_id',
  strategy: 'reassign',
  personal: true,
});
