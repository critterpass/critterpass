/**
 * Per-object timer table (docs/data-model.md §3.11). Typed mirror of
 * packages/db/migrations/*_jobs_scheduling.sql, which is the applied source of truth for columns,
 * constraints, RLS and grants; this file is not run through `drizzle-kit generate`.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const scheduledEvents = pgTable('scheduled_events', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  kind: text('kind').notNull(),
  refId: uuid('ref_id').notNull(),
  slot: text('slot').notNull().default(''),
  localAt: timestamp('local_at', { withTimezone: false, mode: 'string' }).notNull(),
  tz: text('tz').notNull(),
  dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }).notNull(),
  data: jsonb('data').notNull().default({}),
  status: text('status').notNull().default('pending'),
  pgbossJobId: uuid('pgboss_job_id'),
  firedAt: timestamp('fired_at', { withTimezone: true, mode: 'date' }),
  error: text('error'),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

registerTablePrivacy('scheduled_events', { class: 'C2' });
