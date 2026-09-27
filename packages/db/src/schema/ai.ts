/**
 * AI gateway tables (docs/data-model.md §3.3, §3.13, §3.18). Typed mirror of the applied SQL
 * migrations (packages/db/migrations/*_ai_usage.sql and the AI tables that follow), which are the
 * source of truth for constraints, RLS and grants — not run through `drizzle-kit generate`.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import { bigint, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './identity';
import { trips } from './trips';

export const aiUsage = pgTable('ai_usage', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  userId: uuid('user_id').references(() => users.id),
  tripId: uuid('trip_id').references(() => trips.id),
  jobId: uuid('job_id'),
  model: text('model').notNull(),
  tier: text('tier').notNull(),
  tokensIn: integer('tokens_in').notNull(),
  tokensOut: integer('tokens_out').notNull(),
  cacheRead: integer('cache_read').notNull().default(0),
  costMicros: bigint('cost_micros', { mode: 'number' }).notNull(),
  langfuseTraceId: text('langfuse_trace_id'),
  at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

// A cost record (C5): never published, never in an llm view, user link anonymised on purge.
registerTablePrivacy('ai_usage', { class: 'C5' });
