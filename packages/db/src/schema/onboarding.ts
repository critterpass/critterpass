/**
 * Pass, taste, stamp and avatar tables (docs/data-model.md §3.1, §3.10). Typed mirror of
 * packages/db/migrations/*_passes_taste_stamps_avatars.sql, which is the applied source of truth
 * for columns, constraints, RLS, grants and the pass number sequence.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import { customType, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './identity';
import { destinations, trips } from './trips';

/** Postgres `daterange`, kept as its text form (`[2026-10-01,2026-10-05)`). */
const daterange = customType<{ data: string }>({ dataType: () => 'daterange' });

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
};

export const passes = pgTable('passes', {
  /** The client's id when it issued offline before any reservation; otherwise the server's. */
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id),
  /** `draft` once `start_pass` reserved a number, `issued` after `issue_pass`. */
  status: text('status').notNull().default('draft'),
  /** `CP-0427`, from `pass_number_seq`. */
  number: text('number').notNull().unique(),
  issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'date' }),
  cover: text('cover'),
  ...timestamps,
});

export const stamps = pgTable('stamps', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  passId: uuid('pass_id')
    .notNull()
    .references(() => passes.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  kind: text('kind').notNull(),
  /** No. 1 is the home stamp. */
  seqNo: integer('seq_no').notNull(),
  destinationId: uuid('destination_id').references(() => destinations.id),
  tripId: uuid('trip_id').references(() => trips.id),
  dates: daterange('dates'),
  iata: text('iata'),
  country: text('country'),
  inkColour: text('ink_colour'),
  status: text('status').notNull().default('stamped'),
  stampedAt: timestamp('stamped_at', { withTimezone: true, mode: 'date' }),
  ...timestamps,
});

export const tasteProfiles = pgTable('taste_profiles', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id),
  answers: jsonb('answers').notNull().default([]),
  tags: text('tags')
    .array()
    .notNull()
    .default(sql`'{}'`),
  tagSources: jsonb('tag_sources').notNull().default({}),
  chronotype: text('chronotype'),
  pace: text('pace'),
  roomPref: text('room_pref'),
  /** Derived from `user_settings.hide_taste_tags` by trigger: `crew` or `self`. */
  visibility: text('visibility').notNull().default('crew'),
  ...timestamps,
});

export const avatars = pgTable('avatars', {
  /** The client's id for the choice (`set_avatar.avatar_id`). */
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  formId: text('form_id'),
  ring: text('ring'),
  mediaKey: text('media_key'),
  moderationStatus: text('moderation_status').notNull().default('none'),
  moderationReason: text('moderation_reason'),
  /** Rendered circle PNGs by pixel size: `{"40": "<media key>", …}`. */
  variantKeys: jsonb('variant_keys').notNull().default({}),
  ...timestamps,
});

registerTablePrivacy('passes', { class: 'C1' });
registerTablePrivacy('stamps', { class: 'C1' });
// Crew-visible with the disclosure on the quiz summary; hidden rows never leave their owner.
registerTablePrivacy('taste_profiles', { class: 'C1' });
registerTablePrivacy('avatars', { class: 'C1' });
