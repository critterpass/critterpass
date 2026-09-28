/**
 * Crew chat tables (docs/data-model.md §3.6): messages, their reactions and the per-crew sequence
 * counter. Typed mirror of packages/db/migrations/*_crew_chat_messages.sql, which is the applied
 * source of truth for columns, constraints, RLS, grants and the `seq` trigger; this file is not run
 * through `drizzle-kit generate`.
 *
 * Order is `seq`: assigned per crew by the insert trigger under a row lock on the crew's counter,
 * so it is gap-free and follows server commit order, never a client clock or the UUIDv7 id.
 */
import { MESSAGE_SENDER_KINDS, MESSAGE_TYPES, registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { crews } from './crews';
import { users } from './identity';
import { guides, trips } from './trips';

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const messages = pgTable(
  'messages',
  {
    /** The sender's client id: the `op_id` of the `send_message` that created it. */
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    crewId: uuid('crew_id')
      .notNull()
      .references(() => crews.id),
    tripId: uuid('trip_id').references(() => trips.id),
    seq: bigint('seq', { mode: 'number' }).notNull(),
    senderKind: text('sender_kind', { enum: MESSAGE_SENDER_KINDS }).notNull(),
    senderId: uuid('sender_id').references(() => users.id),
    guideId: uuid('guide_id').references(() => guides.id),
    type: text('type', { enum: MESSAGE_TYPES }).notNull(),
    body: text('body').notNull().default(''),
    refKind: text('ref_kind'),
    refId: uuid('ref_id'),
    replyToId: uuid('reply_to_id').references((): AnyPgColumn => messages.id),
    mentions: uuid('mentions')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    mentionsGuide: boolean('mentions_guide').notNull().default(false),
    /** `StoredAttachment[]` (@cp/domain). */
    attachments: jsonb('attachments').notNull().default([]),
    editedAt: instant('edited_at'),
    /** Tombstone: body and attachments are cleared, the row stays in order. */
    deletedAt: instant('deleted_at'),
    /** Hidden by moderation for everyone; filtered out of RLS and the stream. */
    hiddenAt: instant('hidden_at'),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('messages_crew_seq_key').on(table.crewId, table.seq),
    index('messages_crew_seq_desc_idx').on(table.crewId, table.seq.desc()),
  ],
);

export const messageReactions = pgTable(
  'message_reactions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    /** Copied from the message by trigger so the stream and RLS filter without a join. */
    crewId: uuid('crew_id')
      .notNull()
      .references(() => crews.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    emoji: text('emoji').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('message_reactions_one_per_emoji_key').on(table.messageId, table.userId, table.emoji),
    index('message_reactions_message_id_idx').on(table.messageId),
  ],
);

export const crewChatCounters = pgTable('crew_chat_counters', {
  crewId: uuid('crew_id')
    .primaryKey()
    .references(() => crews.id),
  lastSeq: bigint('last_seq', { mode: 'number' }).notNull().default(0),
});

registerTablePrivacy('messages', { class: 'C1' });
registerTablePrivacy('message_reactions', { class: 'C1' });
registerTablePrivacy('crew_chat_counters', { class: 'C4' });
