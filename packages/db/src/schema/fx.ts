/**
 * FX rate snapshot table (docs/data-model.md §3.8). Typed mirror of
 * packages/db/migrations/*_fx_snapshots.sql, which is the applied source of truth for columns,
 * constraints, RLS and grants — this file is not run through `drizzle-kit generate`.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import { date, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const fxSnapshots = pgTable('fx_snapshots', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  base: text('base').notNull(),
  quote: text('quote').notNull(),
  /** `numeric(20,10)`, kept as a string end-to-end so no rate ever passes through a JS `number`. */
  rate: numeric('rate', { precision: 20, scale: 10, mode: 'string' }).notNull(),
  asOf: date('as_of', { mode: 'string' }).notNull(),
  source: text('source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

registerTablePrivacy('fx_snapshots', { class: 'C0' });
