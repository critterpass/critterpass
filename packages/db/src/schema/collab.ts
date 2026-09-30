/**
 * Plan collaboration tables (docs/data-model.md §3.3): anchored comments and their +1s, a member's
 * personal "just me" plan ops and the per-user calendar feed tokens. Typed mirror of
 * packages/db/migrations/*_plan_comments_and_personal_overlay.sql, the applied source of truth for
 * columns, constraints, RLS and grants.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import { customType, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { users } from './identity';
import { changeSets, itineraryVersions } from './plan';
import { trips } from './trips';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

export const comments = pgTable('comments', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  /** item (stable_id) / option (poll option id) / day (day number) / poi_in_option (option:poi). */
  anchorKind: text('anchor_kind').notNull(),
  anchorId: text('anchor_id').notNull(),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id),
  /** Empty once deleted (a tombstone keeps the thread's shape). */
  body: text('body').notNull().default(''),
  editedAt: timestamp('edited_at', { withTimezone: true, mode: 'date' }),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const commentPlusOnes = pgTable(
  'comment_plus_ones',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    commentId: uuid('comment_id')
      .notNull()
      .references(() => comments.id, { onDelete: 'cascade' }),
    /** Copied from the comment by trigger. */
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [unique('comment_plus_ones_comment_user_key').on(table.commentId, table.userId)],
);

export const personalPlanOps = pgTable('personal_plan_ops', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  changeSetId: uuid('change_set_id').references(() => changeSets.id),
  baseVersionId: uuid('base_version_id')
    .notNull()
    .references(() => itineraryVersions.id),
  /** `changeSetOpsSchema` shape: the accepted ops, with their `before` snapshots. */
  ops: jsonb('ops').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const calendarFeedTokens = pgTable('calendar_feed_tokens', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** SHA-256 of the feed secret; the secret itself is shown once and never stored. */
  tokenHash: bytea('token_hash').notNull().unique(),
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

registerTablePrivacy('comments', { class: 'C1' });
registerTablePrivacy('comment_plus_ones', { class: 'C1' });
registerTablePrivacy('personal_plan_ops', { class: 'C2' });
registerTablePrivacy('calendar_feed_tokens', { class: 'C3' });
