/**
 * Proposal, personal version, RSVP engagement and private objection tables (docs/data-model.md
 * §3.5, §3.6). Typed mirror of packages/db/migrations/*_proposals_rsvp_engagement.sql, which is the
 * applied source of truth for columns, constraints, RLS and grants — this file is not run through
 * `drizzle-kit generate`.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
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
const tripId = () =>
  uuid('trip_id')
    .notNull()
    .references(() => trips.id);
const userRef = (name: string) =>
  uuid(name)
    .notNull()
    .references(() => users.id);

export const proposals = pgTable('proposals', {
  id: id(),
  tripId: tripId(),
  versionId: uuid('version_id'),
  createdBy: userRef('created_by'),
  format: text('format').notNull().default('trailer'),
  showCost: boolean('show_cost').notNull().default(true),
  personal: boolean('personal').notNull().default(true),
  options: jsonb('options').notNull().default([]),
  replyBy: at('reply_by').notNull(),
  /** Earliest free cancellation of a booked stay; no stay is ever held. */
  stayFreeCancelUntil: at('stay_free_cancel_until'),
  status: text('status').notNull().default('building'),
  sentAt: at('sent_at'),
  remindedAt: at('reminded_at'),
  lockedAt: at('locked_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const proposalVersions = pgTable('proposal_versions', {
  id: id(),
  proposalId: uuid('proposal_id')
    .notNull()
    .references(() => proposals.id),
  tripId: tripId(),
  recipientId: userRef('recipient_id'),
  status: text('status').notNull().default('pending'),
  shared: boolean('shared').notNull().default(false),
  slides: jsonb('slides').notNull().default([]),
  poster: jsonb('poster'),
  postcard: jsonb('postcard'),
  posterKey: text('poster_key'),
  postcardKey: text('postcard_key'),
  highlights: jsonb('highlights').notNull().default([]),
  savings: jsonb('savings').notNull().default([]),
  savingsMinor: bigint('savings_minor', { mode: 'bigint' }),
  shareMinor: bigint('share_minor', { mode: 'bigint' }),
  currency: char('currency', { length: 3 }),
  leadItemId: uuid('lead_item_id'),
  fallbackNote: text('fallback_note'),
  agentJobId: uuid('agent_job_id'),
  attempts: smallint('attempts').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const proposalReactions = pgTable('proposal_reactions', {
  id: id(),
  proposalId: uuid('proposal_id')
    .notNull()
    .references(() => proposals.id),
  tripId: tripId(),
  userId: userRef('user_id'),
  kind: text('kind').notNull(),
  createdAt: createdAt(),
});

export const hypeAggregates = pgTable('hype_aggregates', {
  id: id(),
  proposalId: uuid('proposal_id')
    .notNull()
    .unique()
    .references(() => proposals.id),
  tripId: tripId(),
  hypePct: smallint('hype_pct').notNull().default(0),
  reactedCount: integer('reacted_count').notNull().default(0),
  boardedCount: integer('boarded_count').notNull().default(0),
  recipients: integer('recipients').notNull().default(0),
  updatedAt: updatedAt(),
});

/** Passive signals: no app_user grant; written through `app.record_engagement` only. */
export const engagementEvents = pgTable('engagement_events', {
  id: id(),
  proposalId: uuid('proposal_id')
    .notNull()
    .references(() => proposals.id),
  tripId: tripId(),
  userId: userRef('user_id'),
  kind: text('kind').notNull(),
  localHour: smallint('local_hour'),
  at: at('at').notNull().defaultNow(),
});

/** C3, owner-only, never replicated: the organiser only ever sees "maybe". */
export const privateGuideThreads = pgTable('private_guide_threads', {
  id: id(),
  tripId: tripId(),
  proposalId: uuid('proposal_id')
    .notNull()
    .references(() => proposals.id),
  ownerId: userRef('owner_id'),
  reason: text('reason').notNull(),
  bodyEnc: text('body_enc'),
  offeredOptions: jsonb('offered_options').notNull().default([]),
  chosenOption: text('chosen_option'),
  followUpAt: at('follow_up_at'),
  anonymousSuggestionId: uuid('anonymous_suggestion_id'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const anonymousSuggestions = pgTable('anonymous_suggestions', {
  id: id(),
  tripId: tripId(),
  proposalId: uuid('proposal_id')
    .notNull()
    .references(() => proposals.id),
  topic: text('topic').notNull(),
  text: text('text').notNull(),
  createdAt: createdAt(),
});

export const rsvpSuggestions = pgTable('rsvp_suggestions', {
  id: id(),
  proposalId: uuid('proposal_id')
    .notNull()
    .references(() => proposals.id),
  tripId: tripId(),
  kind: text('kind').notNull(),
  targetUid: uuid('target_uid').references(() => users.id),
  payload: jsonb('payload').notNull().default({}),
  copy: text('copy').notNull(),
  status: text('status').notNull().default('open'),
  dedupeKey: text('dedupe_key').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const proposalFollowups = pgTable('proposal_followups', {
  id: id(),
  proposalId: uuid('proposal_id')
    .notNull()
    .references(() => proposals.id),
  tripId: tripId(),
  userId: userRef('user_id'),
  kind: text('kind').notNull(),
  dueAt: at('due_at').notNull(),
  leadItemId: uuid('lead_item_id'),
  status: text('status').notNull().default('scheduled'),
  deliveredAt: at('delivered_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const tripDropouts = pgTable('trip_dropouts', {
  id: id(),
  tripId: tripId(),
  userId: userRef('user_id'),
  ops: jsonb('ops').notNull().default([]),
  members: jsonb('members').notNull().default([]),
  costDeltaMinor: bigint('cost_delta_minor', { mode: 'bigint' }),
  resolvedAt: at('resolved_at'),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  createdAt: createdAt(),
});

registerTablePrivacy('proposals', { class: 'C1' });
registerTablePrivacy('proposal_versions', { class: 'C1' });
registerTablePrivacy('proposal_reactions', { class: 'C1' });
registerTablePrivacy('hype_aggregates', { class: 'C1' });
registerTablePrivacy('engagement_events', { class: 'C2' });
registerTablePrivacy('private_guide_threads', { class: 'C3' });
registerTablePrivacy('anonymous_suggestions', { class: 'C1' });
registerTablePrivacy('rsvp_suggestions', { class: 'C1' });
registerTablePrivacy('proposal_followups', { class: 'C2' });
registerTablePrivacy('trip_dropouts', { class: 'C1' });

// A merged account keeps its own version, reactions and signals; the anonymous uid's follow the
// person, except where the account already has one for the same proposal.
registerMergeRule({ table: 'proposal_reactions', userColumn: 'user_id', strategy: 'reassign' });
registerMergeRule({ table: 'engagement_events', userColumn: 'user_id', strategy: 'reassign' });
registerMergeRule({
  table: 'proposal_versions',
  userColumn: 'recipient_id',
  strategy: 'reassign',
  conflictColumns: ['proposal_id'],
});
registerMergeRule({ table: 'private_guide_threads', userColumn: 'owner_id', strategy: 'reassign' });
registerMergeRule({ table: 'proposal_followups', userColumn: 'user_id', strategy: 'drop' });
registerMergeRule({
  table: 'trip_dropouts',
  userColumn: 'user_id',
  strategy: 'reassign',
  conflictColumns: ['trip_id'],
});
