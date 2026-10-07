/**
 * Recap, passport signatures and anniversary memories (docs/data-model.md §3.10). Typed mirror of
 * packages/db/migrations/*_recap_stamps_memories.sql, the applied source of truth for constraints,
 * RLS and grants. The jsonb columns hold the `@cp/domain` recap schemas (`recapStatsSchema`,
 * `recapRouteSchema`, `recapReceiptSchema`, `recapGotAwaySchema`, `recapAwardEvidenceSchema`).
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import { boolean, date, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { registerMergeRule } from '../merge-rules';
import { agentJobs } from './ai';
import { crews } from './crews';
import { users } from './identity';
import { stamps as passportStamps } from './onboarding';
import { trips } from './trips';

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const tripRef = () =>
  uuid('trip_id')
    .notNull()
    .references(() => trips.id);
const stamps = () => ({
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

export const recaps = pgTable('recaps', {
  id: id(),
  tripId: tripRef().unique(),
  crewId: uuid('crew_id')
    .notNull()
    .references(() => crews.id),
  /** `queued`, `building`, `ready` or `failed`; a re-run keeps `ready`. */
  status: text('status').notNull().default('queued'),
  /** Bumped in place each time the aggregates change; 0 until the first build. */
  version: integer('version').notNull().default(0),
  /** The last day the trip covered (its end date, or the day it was cut short). */
  endedOn: date('ended_on', { mode: 'string' }),
  stats: jsonb('stats').notNull().default({}),
  route: jsonb('route').notNull().default({}),
  receipt: jsonb('receipt').notNull().default({}),
  gotAway: jsonb('got_away'),
  /** The guide's copy per card, keyed by card. */
  cards: jsonb('cards').notNull().default({}),
  contentHash: text('content_hash'),
  /** The version the card copy and award words were written for. */
  copyVersion: integer('copy_version').notNull().default(0),
  /** The template wrote the copy (the model failed or answered out of bounds). */
  copyFallback: boolean('copy_fallback').notNull().default(false),
  /** Recorded narration per locale and card: media key and the hash of the words it reads. */
  narration: jsonb('narration').notNull().default({}),
  /** Translations of the card copy, per language (`@cp/domain` guide-text kind `recap`). */
  i18n: jsonb('i18n'),
  /** Sections the last version bump changed: `stats`, `route`, `receipt`, `got_away`, `awards`. */
  changedSections: text('changed_sections')
    .array()
    .notNull()
    .default(sql`'{}'`),
  agentJobId: uuid('agent_job_id').references(() => agentJobs.id),
  failureReason: text('failure_reason'),
  builtAt: instant('built_at'),
  readyAt: instant('ready_at'),
  mvpClosesAt: instant('mvp_closes_at'),
  mvpClosedAt: instant('mvp_closed_at'),
  ...stamps(),
});

/** One row per viewer, written by the builder; also the recap's viewer list. */
export const recapViews = pgTable('recap_views', {
  id: id(),
  recapId: uuid('recap_id')
    .notNull()
    .references(() => recaps.id, { onDelete: 'cascade' }),
  tripId: tripRef(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  openedAt: instant('opened_at'),
  completedAt: instant('completed_at'),
  seenAt: instant('seen_at'),
  ...stamps(),
});

export const recapAwards = pgTable('recap_awards', {
  id: id(),
  recapId: uuid('recap_id')
    .notNull()
    .references(() => recaps.id, { onDelete: 'cascade' }),
  tripId: tripRef(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  kind: text('kind').notNull(),
  metric: text('metric').notNull(),
  value: integer('value').notNull().default(0),
  evidence: jsonb('evidence').notNull().default({}),
  title: text('title'),
  line: text('line'),
  optedOut: boolean('opted_out').notNull().default(false),
  mvpVotes: integer('mvp_votes').notNull().default(0),
  isMvp: boolean('is_mvp').notNull().default(false),
  /** Translations of the title and line, per language (`@cp/domain` guide-text kind `recap_award`). */
  i18n: jsonb('i18n'),
  ...stamps(),
});

export const recapMvpVotes = pgTable('recap_mvp_votes', {
  id: id(),
  recapId: uuid('recap_id')
    .notNull()
    .references(() => recaps.id, { onDelete: 'cascade' }),
  tripId: tripRef(),
  voterId: uuid('voter_id')
    .notNull()
    .references(() => users.id),
  awardId: uuid('award_id')
    .notNull()
    .references(() => recapAwards.id, { onDelete: 'cascade' }),
  ...stamps(),
});

export const stampSignatures = pgTable('stamp_signatures', {
  id: id(),
  stampId: uuid('stamp_id')
    .notNull()
    .references(() => passportStamps.id, { onDelete: 'cascade' }),
  tripId: tripRef(),
  recapId: uuid('recap_id')
    .notNull()
    .references(() => recaps.id, { onDelete: 'cascade' }),
  signerId: uuid('signer_id')
    .notNull()
    .references(() => users.id),
  strokeMediaKey: text('stroke_media_key'),
  signedAt: instant('signed_at').notNull().defaultNow(),
  ...stamps(),
});

export const memories = pgTable('memories', {
  id: id(),
  tripId: tripRef(),
  /** `anniversary`. */
  anchorKind: text('anchor_kind').notNull(),
  anchorId: uuid('anchor_id').notNull(),
  /** Null: the guide wrote it. */
  authorId: uuid('author_id').references(() => users.id),
  text: text('text').notNull(),
  localDate: date('local_date', { mode: 'string' }),
  photoMediaKey: text('photo_media_key'),
  ...stamps(),
});

export const memoryReactions = pgTable('memory_reactions', {
  id: id(),
  memoryId: uuid('memory_id')
    .notNull()
    .references(() => memories.id, { onDelete: 'cascade' }),
  tripId: tripRef(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  emoji: text('emoji'),
  text: text('text'),
  ...stamps(),
});

export const anniversaries = pgTable('anniversaries', {
  id: id(),
  tripId: tripRef(),
  recapId: uuid('recap_id')
    .notNull()
    .references(() => recaps.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  fireOn: date('fire_on', { mode: 'string' }).notNull(),
  tz: text('tz').notNull(),
  fireAt: instant('fire_at').notNull(),
  /** `scheduled`, `fired` or `cancelled`. */
  status: text('status').notNull().default('scheduled'),
  memoryId: uuid('memory_id').references(() => memories.id),
  firedAt: instant('fired_at'),
  ...stamps(),
});

/**
 * A recap's public links (`/rc/{token}`): read over HTTP by the recap's travellers, written by the
 * link commands only, never synced.
 */
export const recapLinks = pgTable('recap_links', {
  id: id(),
  recapId: uuid('recap_id')
    .notNull()
    .references(() => recaps.id, { onDelete: 'cascade' }),
  tripId: tripRef(),
  /** sha256 of the link token; the token itself is never stored. */
  tokenHash: text('token_hash').notNull().unique(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  revokedAt: instant('revoked_at'),
  revokedBy: uuid('revoked_by').references(() => users.id, { onDelete: 'set null' }),
  ...stamps(),
});

registerTablePrivacy('recaps', { class: 'C1' });
registerTablePrivacy('recap_links', { class: 'C2', columns: { token_hash: 'C3' } });
registerTablePrivacy('recap_views', { class: 'C2' });
registerTablePrivacy('recap_awards', { class: 'C1' });
registerTablePrivacy('recap_mvp_votes', { class: 'C2' });
registerTablePrivacy('stamp_signatures', { class: 'C1' });
registerTablePrivacy('memories', { class: 'C1' });
registerTablePrivacy('memory_reactions', { class: 'C1' });
registerTablePrivacy('anniversaries', { class: 'C2' });

// A merged user keeps the account's own row where both have one (one per recap, memory or trip).
registerMergeRule({
  table: 'recap_views',
  userColumn: 'user_id',
  strategy: 'reassign',
  conflictColumns: ['recap_id'],
});
registerMergeRule({
  table: 'recap_awards',
  userColumn: 'user_id',
  strategy: 'reassign',
  conflictColumns: ['recap_id'],
});
registerMergeRule({
  table: 'recap_mvp_votes',
  userColumn: 'voter_id',
  strategy: 'reassign',
  conflictColumns: ['recap_id'],
});
registerMergeRule({
  table: 'stamp_signatures',
  userColumn: 'signer_id',
  strategy: 'reassign',
  conflictColumns: ['stamp_id'],
});
registerMergeRule({
  table: 'memory_reactions',
  userColumn: 'user_id',
  strategy: 'reassign',
  conflictColumns: ['memory_id'],
});
registerMergeRule({ table: 'recap_links', userColumn: 'created_by', strategy: 'reassign' });
registerMergeRule({
  table: 'anniversaries',
  userColumn: 'user_id',
  strategy: 'reassign',
  conflictColumns: ['trip_id'],
});
