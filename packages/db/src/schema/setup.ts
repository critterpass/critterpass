/**
 * Trip setup tables (docs/data-model.md §3.3, §3.4): calendars and date-level availability, the
 * private ask, per-date counts and window options, write-only budget maxes, the crew-level budget
 * aggregate and plan, rooms, must-dos and dietary data. Typed mirror of
 * packages/db/migrations/*_setup_availability_and_budgets.sql and *_setup_rooms_must_dos_dietary.sql,
 * which are the applied source of truth for columns, constraints, RLS and grants; this file is not
 * run through `drizzle-kit generate`.
 *
 * Privacy is by table: the C3 tables are owner-only, unpublished and never granted to
 * guide_reader. Their generically named columns (`date`, `state`, `kind`, `status`, `currency`, …)
 * are classed C2 so the log and prompt redaction list, which matches keys by name, does not blank
 * the same keys on every other table; the value columns only these tables hold stay C3.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  date,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  integer,
} from 'drizzle-orm/pg-core';

import { fxSnapshots } from './fx';
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
const userId = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id);
const minor = (name: string) => bigint(name, { mode: 'bigint' });
const uuids = (name: string) =>
  uuid(name)
    .array()
    .notNull()
    .default(sql`'{}'`);

/** A member's calendar connection; OAuth tokens are an AES-256-GCM envelope. */
export const calendarSources = pgTable('calendar_sources', {
  id: id(),
  userId: userId(),
  kind: text('kind').notNull(),
  oauthTokensEnc: text('oauth_tokens_enc'),
  tokenExpiresAt: at('token_expires_at'),
  consentTentative: boolean('consent_tentative').notNull().default(false),
  lastSyncAt: at('last_sync_at'),
  status: text('status').notNull().default('active'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** One date-level state per member and date: free, maybe, busy or unknown. */
export const calendarDays = pgTable('calendar_days', {
  id: id(),
  userId: userId(),
  tripId: uuid('trip_id').references(() => trips.id),
  date: date('date', { mode: 'string' }).notNull(),
  state: text('state').notNull(),
  source: text('source').notNull(),
  guideMayAsk: boolean('guide_may_ask').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** How many setup members are free / maybe / busy / unknown on each date. */
export const availabilitySummaries = pgTable('availability_summaries', {
  id: id(),
  tripId: tripId(),
  date: date('date', { mode: 'string' }).notNull(),
  freeCount: smallint('free_count').notNull(),
  maybeCount: smallint('maybe_count').notNull().default(0),
  busyCount: smallint('busy_count').notNull(),
  unknownCount: smallint('unknown_count').notNull(),
  memberCount: smallint('member_count').notNull(),
  computedAt: at('computed_at').notNull().defaultNow(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** The trip's date window options (best, partial, full-crew alternative, ask-first). */
export const dateWindowOptions = pgTable('date_window_options', {
  id: id(),
  tripId: tripId(),
  position: smallint('position').notNull(),
  kind: text('kind').notNull(),
  startDate: date('start_date', { mode: 'string' }).notNull(),
  endDate: date('end_date', { mode: 'string' }).notNull(),
  freeCount: smallint('free_count').notNull(),
  memberCount: smallint('member_count').notNull(),
  missingMemberIds: uuids('missing_member_ids'),
  missedMustDoIds: uuids('missed_must_do_ids'),
  askUserId: uuid('ask_user_id').references(() => users.id),
  askStatus: text('ask_status'),
  priceDeltaMinor: minor('price_delta_minor'),
  currency: char('currency', { length: 3 }),
  seasonScore: smallint('season_score').notNull().default(0),
  reason: text('reason').notNull(),
  isPick: boolean('is_pick').notNull().default(false),
  computedAt: at('computed_at').notNull().defaultNow(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** The guide's private ask to one member about their own `maybe` days. */
export const availabilityAsks = pgTable('availability_asks', {
  id: id(),
  tripId: tripId(),
  targetUserId: uuid('target_user_id')
    .notNull()
    .references(() => users.id),
  askedByKind: text('asked_by_kind').notNull().default('guide'),
  requestedBy: uuid('requested_by').references(() => users.id),
  optionId: uuid('option_id').references(() => dateWindowOptions.id),
  blockStart: date('block_start', { mode: 'string' }).notNull(),
  blockEnd: date('block_end', { mode: 'string' }).notNull(),
  status: text('status').notNull().default('asked'),
  intent: text('intent'),
  expiresAt: at('expires_at').notNull(),
  repliedAt: at('replied_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A member's write-only budget max for one trip (also in the trip currency). */
export const budgetMaxPrivate = pgTable('budget_max_private', {
  id: id(),
  tripId: tripId(),
  userId: userId(),
  amountMinor: minor('amount_minor').notNull(),
  currency: char('currency', { length: 3 }).notNull(),
  amountTripMinor: minor('amount_trip_minor').notNull(),
  tripCurrency: char('trip_currency', { length: 3 }).notNull(),
  fxSnapshotId: uuid('fx_snapshot_id').references(() => fxSnapshots.id),
  source: text('source').notNull().default('entered'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A member's own default max, prefilled into each trip's entry. */
export const budgetDefaultsPrivate = pgTable('budget_defaults_private', {
  id: id(),
  userId: userId().unique(),
  amountMinor: minor('amount_minor').notNull(),
  currency: char('currency', { length: 3 }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** The crew-level budget output: a count always, a band and dots only from four maxes. */
export const tripBudgetAggregates = pgTable('trip_budget_aggregates', {
  id: id(),
  tripId: tripId().unique(),
  currency: char('currency', { length: 3 }).notNull(),
  maxesCount: smallint('maxes_count').notNull().default(0),
  memberCount: smallint('member_count').notNull().default(0),
  bandLowMinor: minor('band_low_minor'),
  bandHighMinor: minor('band_high_minor'),
  stepMinor: minor('step_minor'),
  bucketedDots: jsonb('bucketed_dots'),
  underAllOk: boolean('under_all_ok'),
  infeasible: boolean('infeasible'),
  computedAt: at('computed_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** The organiser's locked budget target, breakdown and stay mix. */
export const budgetPlans = pgTable('budget_plans', {
  id: id(),
  tripId: tripId().unique(),
  targetMinor: minor('target_minor').notNull(),
  currency: char('currency', { length: 3 }).notNull(),
  bandLowMinor: minor('band_low_minor'),
  bandHighMinor: minor('band_high_minor'),
  breakdown: jsonb('breakdown').notNull().default({}),
  stayMix: jsonb('stay_mix'),
  plannedByDay: jsonb('planned_by_day'),
  quoteVersion: text('quote_version'),
  isStale: boolean('is_stale').notNull().default(false),
  lockedAt: at('locked_at'),
  lockedBy: uuid('locked_by').references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

registerTablePrivacy('calendar_sources', {
  class: 'C3',
  columns: { kind: 'C2', status: 'C2', consent_tentative: 'C2' },
});
registerTablePrivacy('calendar_days', {
  class: 'C3',
  columns: { date: 'C2', state: 'C2', source: 'C2' },
});
registerTablePrivacy('availability_asks', {
  class: 'C3',
  columns: { status: 'C2', asked_by_kind: 'C2' },
});
registerTablePrivacy('budget_max_private', {
  class: 'C3',
  columns: { currency: 'C2', trip_currency: 'C2', source: 'C2' },
});
registerTablePrivacy('budget_defaults_private', { class: 'C3', columns: { currency: 'C2' } });
registerTablePrivacy('availability_summaries', { class: 'C1' });
registerTablePrivacy('date_window_options', { class: 'C1' });
registerTablePrivacy('trip_budget_aggregates', { class: 'C1' });
registerTablePrivacy('budget_plans', { class: 'C1' });
