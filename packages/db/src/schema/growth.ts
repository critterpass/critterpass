/**
 * Growth tables: invites and their opens and prefill, referrals, seat waitlist offers and crew
 * contact cards (docs/data-model.md §3.2, §3.5). Typed mirror of
 * packages/db/migrations/*_invites_referrals_waitlist.sql, which is the applied source of truth for
 * columns, constraints, RLS and grants; this file is not run through `drizzle-kit generate`.
 * `invite_prefill` is C3: never published, never readable through app_user.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { crews } from './crews';
import { users } from './identity';
import { joinCodes } from './links';
import { trips } from './trips';

export const INVITE_KINDS = ['personal', 'generic'] as const;
export const INVITE_STATUSES = [
  'pending',
  'later',
  'declined',
  'claimed',
  'waitlisted',
  'expired',
  'revoked',
] as const;
export const REFERRAL_STATUSES = ['pending', 'joined', 'qualified', 'void'] as const;
export const REFERRAL_VIAS = ['invite', 'code', 'referral_link'] as const;
export const SEAT_OFFER_STATUSES = ['offered', 'accepted', 'declined', 'expired'] as const;

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => instant('created_at').notNull().defaultNow();
const updatedAt = () => instant('updated_at').notNull().defaultNow();

export const invites = pgTable('invites', {
  id: id(),
  crewId: uuid('crew_id')
    .notNull()
    .references(() => crews.id),
  tripId: uuid('trip_id').references(() => trips.id),
  inviterId: uuid('inviter_id')
    .notNull()
    .references(() => users.id),
  joinCodeId: uuid('join_code_id').references(() => joinCodes.id),
  kind: text('kind', { enum: INVITE_KINDS }).notNull(),
  /** SHA-256 of the personal seat token; never synced (the stream selects around it). */
  seatTokenHash: text('seat_token_hash'),
  inviteeUserId: uuid('invitee_user_id').references(() => users.id),
  channel: text('channel'),
  status: text('status', { enum: INVITE_STATUSES }).notNull().default('pending'),
  waitlistPosition: integer('waitlist_position'),
  expiresAt: instant('expires_at').notNull(),
  claimedBy: uuid('claimed_by').references(() => users.id),
  claimedAt: instant('claimed_at'),
  nudgedAt: instant('nudged_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const inviteOpens = pgTable('invite_opens', {
  id: uuid('id')
    .primaryKey()
    .references(() => invites.id),
  inviterId: uuid('inviter_id')
    .notNull()
    .references(() => users.id),
  openCount: integer('open_count').notNull().default(0),
  firstOpenedAt: instant('first_opened_at'),
  lastOpenedAt: instant('last_opened_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const invitePrefill = pgTable('invite_prefill', {
  id: id(),
  inviteId: uuid('invite_id')
    .notNull()
    .unique()
    .references(() => invites.id),
  inviterId: uuid('inviter_id')
    .notNull()
    .references(() => users.id),
  nameEnc: text('name_enc'),
  homeHint: text('home_hint'),
  tags: text('tags')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  inviterNoteEnc: text('inviter_note_enc'),
  phoneHash: text('phone_hash'),
  provenance: text('provenance', { enum: ['contacts', 'typed'] })
    .notNull()
    .default('contacts'),
  createdAt: createdAt(),
});

export const referrals = pgTable('referrals', {
  id: id(),
  referrerId: uuid('referrer_id')
    .notNull()
    .references(() => users.id),
  refereeId: uuid('referee_id')
    .notNull()
    .unique()
    .references(() => users.id),
  code: text('code'),
  inviteId: uuid('invite_id').references(() => invites.id),
  via: text('via', { enum: REFERRAL_VIAS }).notNull(),
  status: text('status', { enum: REFERRAL_STATUSES }).notNull().default('pending'),
  voidReason: text('void_reason'),
  qualifiedAt: instant('qualified_at'),
  rewardKind: text('reward_kind'),
  rewardRef: uuid('reward_ref'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const seatWaitlistOffers = pgTable('seat_waitlist_offers', {
  id: id(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  inviteId: uuid('invite_id').references(() => invites.id),
  offeredAt: instant('offered_at').notNull().defaultNow(),
  expiresAt: instant('expires_at').notNull(),
  status: text('status', { enum: SEAT_OFFER_STATUSES }).notNull().default('offered'),
  respondedAt: instant('responded_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const crewContactCards = pgTable(
  'crew_contact_cards',
  {
    id: id(),
    crewId: uuid('crew_id')
      .notNull()
      .references(() => crews.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    phoneDisplay: text('phone_display').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique().on(table.crewId, table.userId)],
);

registerTablePrivacy('invites', { class: 'C1' });
registerTablePrivacy('invite_opens', { class: 'C2' });
registerTablePrivacy('invite_prefill', { class: 'C3' });
registerTablePrivacy('referrals', { class: 'C2' });
registerTablePrivacy('seat_waitlist_offers', { class: 'C1' });
registerTablePrivacy('crew_contact_cards', { class: 'C1' });
