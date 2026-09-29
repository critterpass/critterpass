/**
 * Poll engine and destination vote tables (docs/data-model.md §3.3): guide pitches, polls, their
 * options and ballots, and the once-per-person winner reveal. Typed mirror of
 * packages/db/migrations/*_polls_ballots_pitches.sql, which is the applied source of truth for
 * columns, constraints, RLS and grants; this file is not run through `drizzle-kit generate`.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { crews } from './crews';
import { users } from './identity';
import { priceQuotes } from './travel-data';
import { destinations, trips } from './trips';

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => at('created_at').notNull().defaultNow();
const updatedAt = () => at('updated_at').notNull().defaultNow();
const crewId = () =>
  uuid('crew_id')
    .notNull()
    .references(() => crews.id);
const tripId = () => uuid('trip_id').references(() => trips.id);

/** A guide pitch of one place for one crew; the same row is the place's candidate on the board. */
export const pitches = pgTable('pitches', {
  id: id(),
  crewId: crewId(),
  tripId: tripId(),
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id),
  pitchedBy: uuid('pitched_by').references(() => users.id),
  month: smallint('month'),
  sections: jsonb('sections').notNull().default({}),
  quoteIds: uuid('quote_ids')
    .array()
    .notNull()
    .default(sql`'{}'`),
  model: text('model'),
  promptVersion: text('prompt_version'),
  cacheKey: text('cache_key').notNull(),
  fareSnapshotId: text('fare_snapshot_id'),
  status: text('status').notNull().default('pitched'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** One vote: destination (board → final), chat poll, day option, approval, decision or MVP. */
export const polls = pgTable('polls', {
  id: id(),
  crewId: crewId(),
  tripId: tripId(),
  kind: text('kind').notNull(),
  stage: text('stage'),
  status: text('status').notNull().default('open'),
  question: text('question'),
  createdBy: uuid('created_by').references(() => users.id),
  eligibleVoterIds: uuid('eligible_voter_ids')
    .array()
    .notNull()
    .default(sql`'{}'`),
  deciderPolicy: text('decider_policy'),
  threshold: integer('threshold'),
  closesAt: at('closes_at'),
  allowChange: boolean('allow_change').notNull().default(true),
  tieRule: text('tie_rule').notNull().default('earliest_to_count'),
  winnerOptionId: uuid('winner_option_id'),
  result: jsonb('result'),
  closeReason: text('close_reason'),
  closedAt: at('closed_at'),
  stageChangedAt: at('stage_changed_at'),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const pollOptions = pgTable('poll_options', {
  id: id(),
  pollId: uuid('poll_id')
    .notNull()
    .references(() => polls.id),
  crewId: crewId(),
  tripId: tripId(),
  kind: text('kind').notNull(),
  refId: uuid('ref_id'),
  label: text('label').notNull(),
  frozenQuoteId: uuid('frozen_quote_id').references(() => priceQuotes.id),
  pitchId: uuid('pitch_id').references(() => pitches.id),
  proposedBy: uuid('proposed_by').references(() => users.id),
  position: smallint('position').notNull(),
  eliminatedAt: at('eliminated_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** One voter's single choice on a poll; changed in place until the poll closes. */
export const ballots = pgTable('ballots', {
  id: id(),
  pollId: uuid('poll_id')
    .notNull()
    .references(() => polls.id),
  optionId: uuid('option_id').notNull(),
  crewId: crewId(),
  tripId: tripId(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  source: text('source').notNull().default('app'),
  opId: uuid('op_id').notNull(),
  castAt: at('cast_at').notNull().defaultNow(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Whether a voter has seen a closed poll's winner reveal (on any of their devices). */
export const pollReveals = pgTable('poll_reveals', {
  id: id(),
  pollId: uuid('poll_id')
    .notNull()
    .references(() => polls.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  seenAt: at('seen_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

registerTablePrivacy('pitches', { class: 'C1' });
registerTablePrivacy('polls', { class: 'C1' });
registerTablePrivacy('poll_options', { class: 'C1' });
registerTablePrivacy('ballots', { class: 'C1' });
registerTablePrivacy('poll_reveals', { class: 'C2' });
