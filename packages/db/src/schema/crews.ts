/**
 * Crew and membership tables (docs/data-model.md §3.2). Typed mirror of
 * packages/db/migrations/*_identity_and_crews.sql, which is the applied source of truth for
 * columns, constraints, RLS and grants — this file is not run through `drizzle-kit generate`.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import { boolean, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { users } from './identity';

export const crews = pgTable('crews', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  name: text('name').notNull(),
  art: text('art'),
  settlementCurrency: text('settlement_currency'),
  memberCeiling: integer('member_ceiling').notNull().default(16),
  membershipEpoch: integer('membership_epoch').notNull().default(0),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const crewMembers = pgTable(
  'crew_members',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    crewId: uuid('crew_id')
      .notNull()
      .references(() => crews.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role').notNull().default('member'),
    colour: text('colour'),
    status: text('status').notNull().default('active'),
    keepInChat: boolean('keep_in_chat').notNull().default(false),
    /** Stamped by the app.crew_members_epoch trigger; never set directly by app_user. */
    joinedEpoch: integer('joined_epoch'),
    leftAt: timestamp('left_at', { withTimezone: true, mode: 'date' }),
    /** No FK yet: messages is created by a later phase. */
    lastReadMessageId: uuid('last_read_message_id'),
    notifyLevel: text('notify_level'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.crewId, table.userId)],
);

registerTablePrivacy('crews', { class: 'C1' });
registerTablePrivacy('crew_members', { class: 'C1' });
