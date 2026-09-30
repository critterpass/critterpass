/**
 * Guide chat tables (docs/data-model.md §3.6): the guide sheet's threads and messages, the question
 * queued for the meter reset, phrase practice, custom phrase cards and the guide's turns in crew
 * chat. Typed mirror of packages/db/migrations/*_guide_threads_and_queued_questions.sql, the applied
 * source of truth for constraints, RLS and grants.
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
import { guides, trips } from './trips';

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);

export const guideThreads = pgTable('guide_threads', {
  id: id(),
  /** Owner of a private thread; whoever opened a group thread. */
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  tripId: uuid('trip_id').references(() => trips.id),
  crewId: uuid('crew_id').references(() => crews.id),
  guideId: uuid('guide_id').references(() => guides.id),
  /** `private` (owner only) or `group` (the trip's crew). */
  mode: text('mode').notNull().default('private'),
  lastMessageAt: instant('last_message_at'),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

export const guideMessages = pgTable('guide_messages', {
  id: id(),
  threadId: uuid('thread_id')
    .notNull()
    .references(() => guideThreads.id),
  tripId: uuid('trip_id').references(() => trips.id),
  /** `user`, `guide` or `tool`. */
  role: text('role').notNull(),
  authorId: uuid('author_id').references(() => users.id),
  content: text('content').notNull().default(''),
  attachments: jsonb('attachments').notNull().default([]),
  /** Tool cards and proposals the answer carried (`{kind, ...}`). */
  cards: jsonb('cards').notNull().default([]),
  /** Web pages the answer cites (`{url, title, domain}`). */
  sources: jsonb('sources').notNull().default([]),
  voice: boolean('voice').notNull().default(false),
  meterCounted: boolean('meter_counted').notNull().default(false),
  /** `complete`, `failed` or `refused`. */
  status: text('status').notNull().default('complete'),
  /** `up` or `down` from `rate_guide_answer`. */
  rating: text('rating'),
  traceId: text('trace_id'),
  createdAt: instant('created_at').notNull().defaultNow(),
});

export const queuedGuideQuestions = pgTable('queued_guide_questions', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  threadId: uuid('thread_id')
    .notNull()
    .references(() => guideThreads.id),
  tripId: uuid('trip_id').references(() => trips.id),
  text: text('text').notNull(),
  /** Device zone the question was queued in; the answer counts toward that zone's new day. */
  tz: text('tz').notNull(),
  /** Period key of the spent day: one live question per user per day. */
  queuedFor: text('queued_for').notNull(),
  queuedAt: instant('queued_at').notNull().defaultNow(),
  answerAfter: instant('answer_after').notNull(),
  /** `queued`, `answered`, `cancelled` or `failed`. */
  status: text('status').notNull().default('queued'),
  answerMessageId: uuid('answer_message_id').references(() => guideMessages.id),
  answeredAt: instant('answered_at'),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

export const phraseProgress = pgTable('phrase_progress', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  /** A curated `phrase_cards` id or a `custom_phrase_cards` id. */
  phraseId: uuid('phrase_id').notNull(),
  attempts: integer('attempts').notNull().default(0),
  score: smallint('score'),
  practisedAt: instant('practised_at'),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

export const customPhraseCards = pgTable('custom_phrase_cards', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  guideId: uuid('guide_id').references(() => guides.id),
  purpose: text('purpose').notNull(),
  language: text('language').notNull(),
  register: text('register').notNull(),
  address: text('address'),
  text: text('text'),
  romanisation: text('romanisation'),
  gloss: text('gloss'),
  audioKey: text('audio_key'),
  /** `pending`, `ready`, `device` (play with on-device TTS) or `failed`. */
  audioStatus: text('audio_status').notNull().default('pending'),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

export const guideCrewTurns = pgTable('guide_crew_turns', {
  id: id(),
  crewId: uuid('crew_id')
    .notNull()
    .references(() => crews.id),
  tripId: uuid('trip_id').references(() => trips.id),
  /** `mention` or `proactive`. */
  kind: text('kind').notNull(),
  /** The mention being answered (unique: one answer per mention). */
  messageId: uuid('message_id').unique(),
  /** A proactive offer's trigger, unique per crew. */
  triggerKey: text('trigger_key'),
  askerId: uuid('asker_id').references(() => users.id),
  /** `running`, `answered`, `failed` or `skipped`. */
  status: text('status').notNull().default('running'),
  metered: boolean('metered').notNull().default(false),
  quotaPeriodKey: text('quota_period_key'),
  replyMessageId: uuid('reply_message_id'),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

registerTablePrivacy('guide_threads', { class: 'C2' });
registerTablePrivacy('guide_messages', { class: 'C2' });
registerTablePrivacy('queued_guide_questions', { class: 'C2' });
registerTablePrivacy('phrase_progress', { class: 'C2' });
registerTablePrivacy('custom_phrase_cards', { class: 'C2' });
registerTablePrivacy('guide_crew_turns', { class: 'C4' });
