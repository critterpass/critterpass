/**
 * Trip setup tables (docs/data-model.md §3.1, §3.3, §3.4), a typed mirror of the setup migrations.
 * Privacy is by table; generic column names of C3 tables (`date`, `state`, `kind`, …) are classed
 * C2 only so the key-name redaction list does not blank the same keys on other tables.
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
import { pois } from './places';
import { trips } from './trips';

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const stamps = () => ({
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
});
const tripId = () =>
  uuid('trip_id')
    .notNull()
    .references(() => trips.id);
const userId = () => userRef('user_id').notNull();
const minor = (name: string) => bigint(name, { mode: 'bigint' });
const uuids = (name: string) =>
  uuid(name)
    .array()
    .notNull()
    .default(sql`'{}'`);
const texts = (name: string) =>
  text(name)
    .array()
    .notNull()
    .default(sql`'{}'`);
const userRef = (name: string) => uuid(name).references(() => users.id);
const day = (name: string) => date(name, { mode: 'string' });
const flag = (name: string, value: boolean) => boolean(name).notNull().default(value);

export const calendarSources = pgTable('calendar_sources', {
  id: id(),
  userId: userId(),
  kind: text('kind').notNull(),
  oauthTokensEnc: text('oauth_tokens_enc'),
  tokenExpiresAt: at('token_expires_at'),
  consentTentative: flag('consent_tentative', false),
  lastSyncAt: at('last_sync_at'),
  status: text('status').notNull().default('active'),
  ...stamps(),
});

export const calendarDays = pgTable('calendar_days', {
  id: id(),
  userId: userId(),
  tripId: uuid('trip_id').references(() => trips.id),
  date: day('date').notNull(),
  state: text('state').notNull(),
  source: text('source').notNull(),
  guideMayAsk: flag('guide_may_ask', false),
  ...stamps(),
});

export const availabilitySummaries = pgTable('availability_summaries', {
  id: id(),
  tripId: tripId(),
  date: day('date').notNull(),
  freeCount: smallint('free_count').notNull(),
  maybeCount: smallint('maybe_count').notNull().default(0),
  busyCount: smallint('busy_count').notNull(),
  unknownCount: smallint('unknown_count').notNull(),
  memberCount: smallint('member_count').notNull(),
  computedAt: at('computed_at').notNull().defaultNow(),
  ...stamps(),
});

export const dateWindowOptions = pgTable('date_window_options', {
  id: id(),
  tripId: tripId(),
  position: smallint('position').notNull(),
  kind: text('kind').notNull(),
  startDate: day('start_date').notNull(),
  endDate: day('end_date').notNull(),
  freeCount: smallint('free_count').notNull(),
  memberCount: smallint('member_count').notNull(),
  missingMemberIds: uuids('missing_member_ids'),
  missedMustDoIds: uuids('missed_must_do_ids'),
  askUserId: userRef('ask_user_id'),
  askStatus: text('ask_status'),
  priceDeltaMinor: minor('price_delta_minor'),
  currency: char('currency', { length: 3 }),
  seasonScore: smallint('season_score').notNull().default(0),
  reason: text('reason').notNull(),
  isPick: flag('is_pick', false),
  computedAt: at('computed_at').notNull().defaultNow(),
  ...stamps(),
});

export const availabilityAsks = pgTable('availability_asks', {
  id: id(),
  tripId: tripId(),
  targetUserId: userRef('target_user_id').notNull(),
  askedByKind: text('asked_by_kind').notNull().default('guide'),
  requestedBy: userRef('requested_by'),
  optionId: uuid('option_id').references(() => dateWindowOptions.id),
  blockStart: day('block_start').notNull(),
  blockEnd: day('block_end').notNull(),
  status: text('status').notNull().default('asked'),
  intent: text('intent'),
  askLine: text('ask_line'),
  replyText: text('reply_text'),
  expiresAt: at('expires_at').notNull(),
  repliedAt: at('replied_at'),
  ...stamps(),
});

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
  ...stamps(),
});

export const budgetDefaultsPrivate = pgTable('budget_defaults_private', {
  id: id(),
  userId: userId().unique(),
  amountMinor: minor('amount_minor').notNull(),
  currency: char('currency', { length: 3 }).notNull(),
  ...stamps(),
});

export const tripBudgetAggregates = pgTable('trip_budget_aggregates', {
  id: id(),
  tripId: tripId().unique(),
  currency: char('currency', { length: 3 }).notNull(),
  maxesCount: smallint('maxes_count').notNull().default(0),
  memberCount: smallint('member_count').notNull().default(0),
  bandLowMinor: minor('band_low_minor'),
  bandHighMinor: minor('band_high_minor'),
  stepMinor: minor('step_minor'),
  trackHighMinor: minor('track_high_minor'),
  bucketedDots: jsonb('bucketed_dots'),
  underAllOk: boolean('under_all_ok'),
  infeasible: boolean('infeasible'),
  computedAt: at('computed_at'),
  ...stamps(),
});

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
  isStale: flag('is_stale', false),
  lockedAt: at('locked_at'),
  lockedBy: userRef('locked_by'),
  version: integer('version').notNull().default(1),
  ...stamps(),
});

export const roomPlans = pgTable('room_plans', {
  id: id(),
  tripId: tripId().unique(),
  stayOptionId: text('stay_option_id'),
  rooms: jsonb('rooms').notNull().default([]),
  currency: char('currency', { length: 3 }),
  nights: smallint('nights'),
  stayBookingId: uuid('stay_booking_id'),
  freeCancelUntil: at('free_cancel_until'),
  samePairsAllStays: flag('same_pairs_all_stays', true),
  isStale: flag('is_stale', false),
  lockedAt: at('locked_at'),
  lockedBy: userRef('locked_by'),
  version: integer('version').notNull().default(1),
  ...stamps(),
});

export const roomAssignments = pgTable('room_assignments', {
  id: id(),
  tripId: tripId(),
  stayKey: text('stay_key').notNull().default('main'),
  roomKey: text('room_key').notNull(),
  userId: userId(),
  traitLabel: text('trait_label'),
  ...stamps(),
});

export const roomPrefs = pgTable('room_prefs', {
  id: id(),
  tripId: tripId(),
  userId: userId(),
  chips: texts('chips'),
  partnerId: userRef('partner_id'),
  ...stamps(),
});

export const mustDos = pgTable('must_dos', {
  id: id(),
  tripId: tripId(),
  ownerId: userRef('owner_id').notNull(),
  title: text('title').notNull(),
  poiId: uuid('poi_id').references(() => pois.id),
  freeform: flag('freeform', false),
  priority: smallint('priority').notNull().default(0),
  coOwnerIds: uuids('co_owner_ids'),
  fitStatus: text('fit_status').notNull().default('unknown'),
  fitNote: text('fit_note'),
  targetDay: smallint('target_day'),
  externalAction: text('external_action').notNull().default('none'),
  externalDeadline: day('external_deadline'),
  externalUrl: text('external_url'),
  fitCheckedAt: at('fit_checked_at'),
  /** One of `PLACE_BEST_TIMES`, read once from a typed title by `ai.fit_check`; null when none. */
  timeOfDay: text('time_of_day'),
  deletedAt: at('deleted_at'),
  version: integer('version').notNull().default(1),
  ...stamps(),
});

export const dietaryProfiles = pgTable('dietary_profiles', {
  id: id(),
  userId: userId().unique(),
  diet: text('diet'),
  allergies: texts('allergies'),
  avoid: texts('avoid'),
  spice: text('spice'),
  accessibilityNotesEnc: text('accessibility_notes_enc'),
  consentAt: at('consent_at'),
  visibility: text('visibility').notNull().default('self'),
  ...stamps(),
});

export const participantDietaryFlags = pgTable('participant_dietary_flags', {
  id: id(),
  tripId: tripId(),
  userId: userId(),
  flags: texts('flags'),
  ...stamps(),
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
registerTablePrivacy('room_prefs', { class: 'C2' });
registerTablePrivacy('dietary_profiles', {
  class: 'C3',
  columns: { visibility: 'C2', consent_at: 'C2' },
});
for (const table of [
  'availability_summaries',
  'date_window_options',
  'trip_budget_aggregates',
  'budget_plans',
  'room_plans',
  'room_assignments',
  'must_dos',
  'participant_dietary_flags',
]) {
  registerTablePrivacy(table, { class: 'C1' });
}
