/**
 * Explore tables (docs/data-model.md §3.1, §3.3, §3.13): group swiping, guide tips on places, the
 * crew's Q&A line per place, saved lists and sponsored placements. Typed mirror of
 * packages/db/migrations/*_swipe_sessions_and_place_tips.sql and *_sponsored_placements.sql, the
 * applied source of truth for columns, constraints, RLS and grants.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { registerMergeRule } from '../merge-rules';
import { users } from './identity';
import { pois } from './places';
import { changeSets } from './plan';
import { destinations, trips } from './trips';

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => at('created_at').notNull().defaultNow();
const updatedAt = () => at('updated_at').notNull().defaultNow();

export const swipeSessions = pgTable('swipe_sessions', {
  id: id(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id),
  startedBy: uuid('started_by')
    .notNull()
    .references(() => users.id),
  /** building → live → ended. */
  status: text('status').notNull().default('building'),
  /** `swipeDeckSchema`: ranked cards (poi ids, signals, the guide's note). */
  deck: jsonb('deck').notNull().default([]),
  matchRule: smallint('match_rule').notNull(),
  endedAt: at('ended_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Owner-read only: the one place a "no" lives. Never published. */
export const swipeVotes = pgTable(
  'swipe_votes',
  {
    id: id(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => swipeSessions.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    poiId: uuid('poi_id')
      .notNull()
      .references(() => pois.id),
    verdict: text('verdict').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('swipe_votes_session_user_poi_key').on(table.sessionId, table.userId, table.poiId),
  ],
);

/** The crew-visible yes votes, kept by trigger from `swipe_votes`. */
export const swipeYesVotes = pgTable(
  'swipe_yes_votes',
  {
    id: id(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => swipeSessions.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    poiId: uuid('poi_id')
      .notNull()
      .references(() => pois.id),
    super: boolean('super').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('swipe_yes_votes_session_user_poi_key').on(table.sessionId, table.userId, table.poiId),
  ],
);

export const swipeMatches = pgTable(
  'swipe_matches',
  {
    id: id(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => swipeSessions.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id),
    poiId: uuid('poi_id')
      .notNull()
      .references(() => pois.id),
    userIds: uuid('user_ids').array().notNull(),
    changeSetId: uuid('change_set_id').references(() => changeSets.id),
    dayNo: smallint('day_no'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique('swipe_matches_session_poi_key').on(table.sessionId, table.poiId)],
);

export const placeTips = pgTable('place_tips', {
  id: id(),
  poiId: uuid('poi_id')
    .notNull()
    .references(() => pois.id),
  /** Copied from the place by trigger. */
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id),
  /** Moderation only: no app_user grant, never synced. */
  authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
  text: text('text').notNull(),
  lang: text('lang').notNull().default('en'),
  moderationStatus: text('moderation_status').notNull().default('pending'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const placeQnaSummaries = pgTable(
  'place_qna_summaries',
  {
    id: id(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id),
    poiId: uuid('poi_id')
      .notNull()
      .references(() => pois.id),
    text: text('text').notNull(),
    sourceMessageId: uuid('source_message_id').notNull(),
    sourceAt: at('source_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique('place_qna_summaries_trip_poi_key').on(table.tripId, table.poiId)],
);

export const savedLists = pgTable(
  'saved_lists',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique('saved_lists_user_name_key').on(table.userId, table.name)],
);

export const sponsoredPlacements = pgTable('sponsored_placements', {
  id: id(),
  partner: text('partner').notNull(),
  poiId: uuid('poi_id')
    .notNull()
    .references(() => pois.id),
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id),
  offerRef: text('offer_ref'),
  listKinds: text('list_kinds').array().notNull(),
  categories: text('categories')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  startsAt: at('starts_at').notNull(),
  endsAt: at('ends_at').notNull(),
  impressionCap: integer('impression_cap'),
  status: text('status').notNull().default('active'),
  createdBy: uuid('created_by').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sponsoredEventCounts = pgTable(
  'sponsored_event_counts',
  {
    id: id(),
    placementId: uuid('placement_id')
      .notNull()
      .references(() => sponsoredPlacements.id),
    day: date('day').notNull(),
    listKind: text('list_kind').notNull(),
    kind: text('kind').notNull(),
    count: bigint('count', { mode: 'number' }).notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('sponsored_event_counts_key').on(
      table.placementId,
      table.day,
      table.listKind,
      table.kind,
    ),
  ],
);

registerTablePrivacy('swipe_sessions', { class: 'C1' });
registerTablePrivacy('swipe_votes', { class: 'C2' });
registerTablePrivacy('swipe_yes_votes', { class: 'C1' });
registerTablePrivacy('swipe_matches', { class: 'C1' });
registerTablePrivacy('place_tips', { class: 'C0', columns: { author_id: 'C2' } });
registerTablePrivacy('place_qna_summaries', { class: 'C1' });
registerTablePrivacy('saved_lists', { class: 'C2' });
registerTablePrivacy('sponsored_placements', { class: 'C0' });
registerTablePrivacy('sponsored_event_counts', { class: 'C0' });

// Swipe votes (and their trigger-kept yes mirror) and saved lists follow a merged user; an
// existing vote on the same card, or a list of the same name, wins.
for (const [table, conflictColumns] of [
  ['swipe_votes', ['session_id', 'poi_id']],
  ['swipe_yes_votes', ['session_id', 'poi_id']],
  ['saved_lists', ['name']],
] as const) {
  registerMergeRule({
    table,
    userColumn: 'user_id',
    strategy: 'reassign',
    conflictColumns,
    personal: true,
  });
}
