/**
 * Feedback tickets, the idea board, idea votes and the rating-prompt log (docs/data-model.md §3.14,
 * §3.15). Typed mirror of packages/db/migrations/*_feedback_ideas_rating_prompts.sql, which is the
 * applied source of truth for columns, constraints, RLS and grants.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
  vector,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { registerMergeRule } from '../merge-rules';
import { users } from './identity';
import { trips } from './trips';

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => at('created_at').notNull().defaultNow();
const updatedAt = () => at('updated_at').notNull().defaultNow();

export const ideas = pgTable('ideas', {
  id: id(),
  authorId: uuid('author_id').references(() => users.id),
  title: text('title').notNull(),
  description: text('description'),
  locale: text('locale').notNull(),
  status: text('status').notNull().default('pending_review'),
  teamNote: text('team_note'),
  fixedInVersion: text('fixed_in_version'),
  mergedIntoId: uuid('merged_into_id').references((): AnyPgColumn => ideas.id),
  votesCount: integer('votes_count').notNull().default(0),
  embedding: vector('embedding', { dimensions: 1024 }),
  statusChangedAt: at('status_changed_at').notNull().defaultNow(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const feedbackTickets = pgTable('feedback_tickets', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  ticketNo: bigint('ticket_no', { mode: 'number' }).notNull().unique(),
  mood: text('mood'),
  category: text('category'),
  body: text('body').notNull().default(''),
  includeDeviceInfo: boolean('include_device_info').notNull(),
  deviceInfo: jsonb('device_info'),
  context: jsonb('context').notNull().default({}),
  tripId: uuid('trip_id').references(() => trips.id),
  mediaIds: uuid('media_ids')
    .array()
    .notNull()
    .default(sql`'{}'`),
  source: text('source').notNull().default('settings'),
  status: text('status').notNull().default('new'),
  replyChannel: text('reply_channel').notNull(),
  replyDueAt: at('reply_due_at').notNull(),
  triageKind: text('triage_kind'),
  triageArea: text('triage_area'),
  triagedAt: at('triaged_at'),
  severity: text('severity'),
  triageSummary: text('triage_summary'),
  duplicateOf: uuid('duplicate_of').references((): AnyPgColumn => feedbackTickets.id, {
    onDelete: 'set null',
  }),
  duplicateScore: real('duplicate_score'),
  trackerIssueId: text('tracker_issue_id'),
  fixedInVersion: text('fixed_in_version'),
  fixNotifiedAt: at('fix_notified_at'),
  ideaId: uuid('idea_id').references(() => ideas.id),
  appVersion: text('app_version').notNull(),
  sentAt: at('sent_at').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const ideaVotes = pgTable('idea_votes', {
  id: id(),
  ideaId: uuid('idea_id')
    .notNull()
    .references(() => ideas.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  monthKey: text('month_key').notNull(),
  createdAt: createdAt(),
});

export const ratingPrompts = pgTable('rating_prompts', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  tripId: uuid('trip_id').references(() => trips.id),
  shown: boolean('shown').notNull(),
  shownAt: at('shown_at').notNull(),
  createdAt: createdAt(),
});

// The console reads tickets to triage them; what the device said about itself and the attachments
// stay out of its reach.
registerTablePrivacy('feedback_tickets', {
  class: 'C2',
  columns: { device_info: 'C3', media_ids: 'C3' },
});
registerTablePrivacy('ideas', { class: 'C0' });
registerTablePrivacy('idea_votes', { class: 'C2' });
registerTablePrivacy('rating_prompts', { class: 'C2' });

// A guest's tickets, ideas, votes and prompt log follow them when they sign up; a vote both
// accounts cast on the same idea keeps the existing one.
registerMergeRule({ table: 'feedback_tickets', userColumn: 'user_id', strategy: 'reassign' });
registerMergeRule({ table: 'ideas', userColumn: 'author_id', strategy: 'reassign' });
registerMergeRule({
  table: 'idea_votes',
  userColumn: 'user_id',
  strategy: 'reassign',
  conflictColumns: ['idea_id'],
});
registerMergeRule({ table: 'rating_prompts', userColumn: 'user_id', strategy: 'reassign' });
