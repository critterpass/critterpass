/**
 * Redraft reservations (docs/data-model.md §3.14): one row per `ai.redraft` job, holding the
 * trip's redraft quota from submit until the result is kept or reverted (committed) or the job
 * fails or finds nothing better (released). Typed mirror of
 * packages/db/migrations/*_draft_metrics_and_redraft_reservations.sql, the applied source of truth.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { agentJobs } from './ai';
import { trips } from './trips';

export const redraftReservations = pgTable('redraft_reservations', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  agentJobId: uuid('agent_job_id')
    .notNull()
    .unique()
    .references(() => agentJobs.id),
  status: text('status').notNull().default('reserved'),
  /** `late_must_do`: a free redraft fitting in a must-do added after the draft. */
  freeReason: text('free_reason'),
  /** The `usage_counters` period the quota unit sits in; null when nothing was metered. */
  quotaPeriodKey: text('quota_period_key'),
  settledAt: timestamp('settled_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

registerTablePrivacy('redraft_reservations', { class: 'C1' });
