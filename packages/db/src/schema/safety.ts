/**
 * Help hub and crew SOS: sessions (a Help opening or an SOS incident), the sender's sealed health
 * notes and the SOS thread. Typed mirror of packages/db/migrations/*_help_sessions_sos.sql, which
 * is the applied source of truth for columns, constraints, RLS and grants — this file is not run
 * through `drizzle-kit generate`. Health notes are C3: never published, readable only by the sender
 * and the crewmates coming to help.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './identity';
import { locationShares } from './location';
import { trips } from './trips';

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const helpSessions = pgTable('help_sessions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  /** `help` | `sos`. */
  kind: text('kind').notNull(),
  /** `open` | `responding` | `resolved` | `stale` (a late queued SOS, seen by its sender only). */
  status: text('status').notNull().default('open'),
  /** Quick-text chip: `fell` | `lost` | `need_ride`. */
  preset: text('preset'),
  body: text('body'),
  placeLabel: text('place_label'),
  summary: text('summary'),
  /** `model` | `raw` (the sender's own words when the model did not answer in time). */
  summarySource: text('summary_source'),
  responderIds: uuid('responder_ids')
    .array()
    .notNull()
    .default(sql`'{}'`),
  /** uid → `{state, at, eta_min?, distance_m?, arrived_at?}`. */
  responses: jsonb('responses').notNull().default({}),
  /** Step key → `{state: pending | done, at?, n?}`. */
  steps: jsonb('steps').notNull().default({}),
  shareId: uuid('share_id').references(() => locationShares.id),
  alertedCount: integer('alerted_count').notNull().default(0),
  escalatedAt: instant('escalated_at'),
  falseAlarm: boolean('false_alarm').notNull().default(false),
  clinicRequestedAt: instant('clinic_requested_at'),
  openedAt: instant('opened_at').notNull().defaultNow(),
  resolvedAt: instant('resolved_at'),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

export const helpSessionPrivate = pgTable('help_session_private', {
  helpSessionId: uuid('help_session_id')
    .primaryKey()
    .references(() => helpSessions.id, { onDelete: 'cascade' }),
  /** AES-256-GCM envelope (packages/db/src/crypto). */
  healthNotesEnc: text('health_notes_enc').notNull(),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

export const helpSessionMessages = pgTable('help_session_messages', {
  /** The client's UUIDv7, so a replayed send lands on one row. */
  id: uuid('id').primaryKey(),
  helpSessionId: uuid('help_session_id')
    .notNull()
    .references(() => helpSessions.id, { onDelete: 'cascade' }),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  senderId: uuid('sender_id')
    .notNull()
    .references(() => users.id),
  body: text('body').notNull(),
  at: instant('at').notNull().defaultNow(),
  createdAt: instant('created_at').notNull().defaultNow(),
});

registerTablePrivacy('help_sessions', { class: 'C1' });
registerTablePrivacy('help_session_private', { class: 'C3' });
registerTablePrivacy('help_session_messages', { class: 'C1' });
