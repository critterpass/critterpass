/**
 * Home, inbox, nudge and tip tables (docs/data-model.md §3.9, §3.11): saved places and plans,
 * conditional reminders, the crew's proactive tip strip, nudges between crewmates and the
 * per-hour app-open counts the nudge send time is chosen from. Typed mirror of
 * packages/db/migrations/*_home_inbox_nudges_tips.sql, which is the applied source of truth for
 * columns, constraints, RLS and grants; this file is not run through `drizzle-kit generate`.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { crews } from './crews';
import { users } from './identity';
import { scheduledDeliveries } from './notifications';
import { destinations, guides, trips } from './trips';

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
const userId = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id);

/** A place, plan or day the user saved, optionally into a named list. */
export const savedItems = pgTable('saved_items', {
  id: id(),
  userId: userId(),
  kind: text('kind').notNull(),
  refId: uuid('ref_id').notNull(),
  listName: text('list_name'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A reminder that fires only while its condition still holds (critter windows, quiet windows). */
export const reminders = pgTable('reminders', {
  id: id(),
  userId: userId(),
  targetKind: text('target_kind').notNull(),
  targetId: uuid('target_id').notNull(),
  fireAt: timestamp('fire_at', { withTimezone: true, mode: 'date' }).notNull(),
  condition: jsonb('condition').notNull().default({}),
  status: text('status').notNull().default('pending'),
  firedAt: timestamp('fired_at', { withTimezone: true, mode: 'date' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** One guide-voiced tip for a crew's Home strip, phrased only from the stored facts. */
export const homeTips = pgTable('home_tips', {
  id: id(),
  crewId: uuid('crew_id')
    .notNull()
    .references(() => crews.id),
  guideId: uuid('guide_id').references(() => guides.id),
  kind: text('kind').notNull(),
  text: text('text').notNull(),
  facts: jsonb('facts').notNull(),
  placeId: uuid('place_id').references(() => destinations.id),
  dedupeKey: text('dedupe_key').notNull(),
  validUntil: timestamp('valid_until', { withTimezone: true, mode: 'date' }).notNull(),
  status: text('status').notNull().default('active'),
  dismissedBy: uuid('dismissed_by').references(() => users.id),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true, mode: 'date' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A crewmate's nudge to another, sent by the guide at the target's engagement hour. */
export const nudges = pgTable('nudges', {
  id: id(),
  senderId: uuid('sender_id')
    .notNull()
    .references(() => users.id),
  targetId: uuid('target_id')
    .notNull()
    .references(() => users.id),
  crewId: uuid('crew_id')
    .notNull()
    .references(() => crews.id),
  tripId: uuid('trip_id').references(() => trips.id),
  reason: text('reason').notNull(),
  context: jsonb('context').notNull().default({}),
  channel: text('channel').notNull(),
  scheduledDeliveryId: uuid('scheduled_delivery_id').references(() => scheduledDeliveries.id),
  sendAt: timestamp('send_at', { withTimezone: true, mode: 'date' }),
  sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** How often the user opened the app in each local hour; never synced, never read by the guide. */
export const appOpenHours = pgTable(
  'app_open_hours',
  {
    userId: userId(),
    hourLocal: smallint('hour_local').notNull(),
    opens: integer('opens').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.hourLocal] })],
);

registerTablePrivacy('saved_items', { class: 'C2' });
registerTablePrivacy('reminders', { class: 'C2' });
registerTablePrivacy('home_tips', { class: 'C1' });
registerTablePrivacy('nudges', { class: 'C2' });
registerTablePrivacy('app_open_hours', { class: 'C2' });
