/**
 * AI gateway tables (docs/data-model.md §3.3, §3.13, §3.18). Typed mirror of the applied SQL
 * migrations (packages/db/migrations/*_ai_usage.sql and the AI tables that follow), which are the
 * source of truth for constraints, RLS and grants — not run through `drizzle-kit generate`.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './identity';
import { itineraryVersions } from './plan';
import { guides, trips } from './trips';

export const aiUsage = pgTable('ai_usage', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  userId: uuid('user_id').references(() => users.id),
  tripId: uuid('trip_id').references(() => trips.id),
  jobId: uuid('job_id').references(() => agentJobs.id, { onDelete: 'set null' }),
  model: text('model').notNull(),
  tier: text('tier').notNull(),
  tokensIn: integer('tokens_in').notNull(),
  tokensOut: integer('tokens_out').notNull(),
  cacheRead: integer('cache_read').notNull().default(0),
  costMicros: bigint('cost_micros', { mode: 'number' }).notNull(),
  langfuseTraceId: text('langfuse_trace_id'),
  at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

export const agentJobs = pgTable('agent_jobs', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  tripId: uuid('trip_id').references(() => trips.id),
  userId: uuid('user_id').references(() => users.id),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('queued'),
  steps: jsonb('steps').notNull().default([]),
  partial: jsonb('partial'),
  inputHash: text('input_hash'),
  baseVersionId: uuid('base_version_id').references(() => itineraryVersions.id),
  resultRef: jsonb('result_ref'),
  model: text('model'),
  tokensIn: bigint('tokens_in', { mode: 'number' }).notNull().default(0),
  tokensOut: bigint('tokens_out', { mode: 'number' }).notNull().default(0),
  costMicros: bigint('cost_micros', { mode: 'number' }).notNull().default(0),
  pgbossJobId: text('pgboss_job_id'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const personaPacks = pgTable(
  'persona_packs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    guideId: uuid('guide_id')
      .notNull()
      .references(() => guides.id),
    version: text('version').notNull(),
    status: text('status').notNull().default('draft'),
    systemPromptRef: text('system_prompt_ref'),
    style: jsonb('style').notNull().default({}),
    lexicon: jsonb('lexicon').notNull().default({}),
    voiceSettings: jsonb('voice_settings').notNull().default({}),
    approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique('persona_packs_guide_version_key').on(t.guideId, t.version)],
);

export const guideOffers = pgTable('guide_offers', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  /** No FK yet: messages is created by a later phase. */
  messageId: uuid('message_id'),
  kind: text('kind').notNull(),
  slotsTotal: integer('slots_total').notNull(),
  slotsTaken: integer('slots_taken').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
  targetRef: jsonb('target_ref').notNull().default({}),
  status: text('status').notNull().default('open'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const guideOfferClaims = pgTable(
  'guide_offer_claims',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => guideOffers.id),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [unique('guide_offer_claims_offer_user_key').on(t.offerId, t.userId)],
);

registerTablePrivacy('agent_jobs', { class: 'C2' });
registerTablePrivacy('persona_packs', { class: 'C0' });
registerTablePrivacy('guide_offers', { class: 'C1' });
registerTablePrivacy('guide_offer_claims', { class: 'C1' });
// A cost record (C5): never published, never in an llm view, user link anonymised on purge.
registerTablePrivacy('ai_usage', { class: 'C5' });
