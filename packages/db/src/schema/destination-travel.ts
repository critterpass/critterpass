/**
 * Travel estimates written from cited web pages (migration
 * 20261006180000_destination_link_runs_and_home_links.sql, the applied source of truth for
 * constraints, RLS and grants). `destination_link_runs` is RLS "S": the worker's record of when it
 * looked for a destination's links. `destination_home_links` is RLS "R": any signed-in reader may
 * read how to reach a destination from a home city through the api; only the worker writes it.
 * Neither is synced, and neither names a person: a home link is keyed by the two places.
 */
import { registerTablePrivacy } from '@cp/domain';
import { bigint, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { destinations } from './trips';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const destinationLinkRuns = pgTable('destination_link_runs', {
  destinationId: uuid('destination_id')
    .primaryKey()
    .references(() => destinations.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'),
  links: integer('links').notNull().default(0),
  dropped: jsonb('dropped').notNull().default([]),
  model: text('model'),
  costMicros: bigint('cost_micros', { mode: 'number' }).notNull().default(0),
  error: text('error'),
  requestedAt: at('requested_at').notNull().defaultNow(),
  checkedAt: at('checked_at'),
  expiresAt: at('expires_at'),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

export const destinationHomeLinks = pgTable('destination_home_links', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id, { onDelete: 'cascade' }),
  originKey: text('origin_key').notNull(),
  originName: text('origin_name').notNull(),
  status: text('status').notNull().default('pending'),
  ways: jsonb('ways').notNull().default([]),
  dropped: jsonb('dropped').notNull().default([]),
  model: text('model'),
  costMicros: bigint('cost_micros', { mode: 'number' }).notNull().default(0),
  error: text('error'),
  requestedAt: at('requested_at').notNull().defaultNow(),
  generatedAt: at('generated_at'),
  expiresAt: at('expires_at'),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

registerTablePrivacy('destination_link_runs', { class: 'C0' });
registerTablePrivacy('destination_home_links', { class: 'C0' });
