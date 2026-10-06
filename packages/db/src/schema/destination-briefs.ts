/**
 * Destination briefs (migration 20261006073500_destination_briefs.sql, the applied source of truth
 * for constraints, RLS and grants). RLS "R": any signed-in reader may read a destination's brief
 * through the api; only the worker writes it. Not synced.
 */
import { registerTablePrivacy } from '@cp/domain';
import { bigint, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { destinations } from './trips';

export const destinationBriefs = pgTable('destination_briefs', {
  destinationId: uuid('destination_id')
    .primaryKey()
    .references(() => destinations.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'),
  origin: text('origin').notNull().default('ai'),
  essentials: jsonb('essentials').notNull().default([]),
  eateries: jsonb('eateries').notNull().default([]),
  stays: jsonb('stays').notNull().default([]),
  dropped: jsonb('dropped').notNull().default([]),
  model: text('model'),
  costMicros: bigint('cost_micros', { mode: 'number' }).notNull().default(0),
  timings: jsonb('timings').notNull().default({}),
  error: text('error'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
  requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  generatedAt: timestamp('generated_at', { withTimezone: true, mode: 'date' }),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

registerTablePrivacy('destination_briefs', { class: 'C0' });
