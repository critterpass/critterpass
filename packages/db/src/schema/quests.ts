/**
 * Crew quests and XP (docs/data-model.md §3.9): the day's quests, sign-ups, progress, the
 * append-only XP ledger and each crew's running total. Typed mirror of
 * packages/db/migrations/20261001090000_quests_xp.sql, the applied source of truth for constraints,
 * RLS, grants and the `app.grant_xp` / `app.grant_quest_reward` functions.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
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
import { crews } from './crews';
import { users } from './identity';
import { trips } from './trips';

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const tripId = () =>
  uuid('trip_id')
    .notNull()
    .references(() => trips.id);

export const quests = pgTable('quests', {
  id: id(),
  tripId: tripId(),
  localDate: date('local_date').notNull(),
  /** 0–3: the quest's place on its day. */
  slot: smallint('slot').notNull(),
  template: text('template').notNull(),
  params: jsonb('params').notNull().default({}),
  metric: text('metric').notNull(),
  target: integer('target').notNull(),
  /** `{xp, sticker: 'settled' | null, form_id | null}`, set by the validator. */
  reward: jsonb('reward').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  /** crew / optional (sign-up only). */
  scope: text('scope').notNull().default('crew'),
  /** offered / active / completed / failed / expired. */
  status: text('status').notNull().default('active'),
  /** guide / fallback. */
  source: text('source').notNull(),
  startsAt: instant('starts_at').notNull(),
  endsAt: instant('ends_at').notNull(),
  completedAt: instant('completed_at'),
  revealAt: instant('reveal_at'),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  /** Translations of the guide-written text, per language (`@cp/domain` guide-text). */
  i18n: jsonb('i18n'),
});

export const questSignups = pgTable('quest_signups', {
  id: id(),
  questId: uuid('quest_id')
    .notNull()
    .references(() => quests.id, { onDelete: 'cascade' }),
  tripId: tripId(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: instant('created_at').notNull().defaultNow(),
});

export const questProgress = pgTable('quest_progress', {
  id: id(),
  questId: uuid('quest_id')
    .notNull()
    .references(() => quests.id, { onDelete: 'cascade' }),
  tripId: tripId(),
  value: integer('value').notNull().default(0),
  /** The distinct things counted (a place, a traveller, an expense). */
  counted: text('counted')
    .array()
    .notNull()
    .default(sql`'{}'`),
  sourceEventIds: uuid('source_event_ids')
    .array()
    .notNull()
    .default(sql`'{}'`),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

export const xpLedger = pgTable('xp_ledger', {
  id: id(),
  /** Null on the crew row. */
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  crewId: uuid('crew_id').references(() => crews.id, { onDelete: 'cascade' }),
  tripId: uuid('trip_id').references(() => trips.id),
  amount: integer('amount').notNull(),
  /** quest / form / visit / settle. */
  sourceKind: text('source_kind').notNull(),
  sourceId: uuid('source_id').notNull(),
  grantedAt: instant('granted_at').notNull(),
  createdAt: instant('created_at').notNull().defaultNow(),
});

export const crewXp = pgTable('crew_xp', {
  id: id(),
  crewId: uuid('crew_id')
    .notNull()
    .unique()
    .references(() => crews.id, { onDelete: 'cascade' }),
  xp: bigint('xp', { mode: 'number' }).notNull().default(0),
  level: integer('level').notNull().default(1),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

registerTablePrivacy('quests', { class: 'C1' });
registerTablePrivacy('quest_signups', { class: 'C1' });
registerTablePrivacy('quest_progress', { class: 'C1' });
registerTablePrivacy('xp_ledger', { class: 'C1' });
registerTablePrivacy('crew_xp', { class: 'C1' });

// A merged anonymous traveller keeps their sign-ups and XP; a quest or source the account already
// has keeps the account's row.
registerMergeRule({
  table: 'quest_signups',
  userColumn: 'user_id',
  strategy: 'reassign',
  conflictColumns: ['quest_id'],
});
registerMergeRule({
  table: 'xp_ledger',
  userColumn: 'user_id',
  strategy: 'reassign',
  conflictColumns: ['source_kind', 'source_id'],
});
