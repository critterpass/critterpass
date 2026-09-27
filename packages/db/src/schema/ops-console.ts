/**
 * Ops-console tables (docs/data-model.md §3.15, §3.16): concierge tasks, user approvals, partner
 * adapter switches and moderation reports. Typed mirror of
 * packages/db/migrations/*_ops_console.sql, which is the applied source of truth for columns,
 * constraints, RLS and grants — this file is not run through `drizzle-kit generate`.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './identity';
import { trips } from './trips';

const ops = pgSchema('ops');

/** A user's approval of an exact piece of text before ops acts on it (vendor messages, bookings). */
export const opsApprovals = ops.table('approvals', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  subjectKind: text('subject_kind').notNull(),
  subjectId: uuid('subject_id').notNull(),
  textShown: text('text_shown').notNull(),
  approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  opId: uuid('op_id').unique(),
});

export const opsConciergeTasks = ops.table('concierge_tasks', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  tripId: uuid('trip_id').references(() => trips.id),
  requestedBy: uuid('requested_by').references(() => users.id),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('new'),
  assigneeAdminId: uuid('assignee_admin_id'),
  approvalId: uuid('approval_id').references(() => opsApprovals.id),
  dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }),
  /** `[{at, admin_id, text}]`, append-only through `update_concierge_task`. */
  notes: jsonb('notes').notNull().default([]),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const opsPartnerAdapters = ops.table('partner_adapters', {
  partner: text('partner').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  copyMode: text('copy_mode').notNull().default('link'),
  approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
  notes: text('notes'),
  version: integer('version').notNull().default(1),
  updatedBy: uuid('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

/**
 * One row per reported subject: a repeat report within 24 h raises `report_count` on the open row
 * instead of adding another (the `report_content` command collapses them as `app_system`). A
 * `compliance` row is filed by the input compliance check's review band and has no reporter.
 */
export const moderationReports = pgTable('moderation_reports', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  reporterId: uuid('reporter_id').references(() => users.id),
  source: text('source').notNull().default('user'),
  targetKind: text('target_kind').notNull(),
  targetId: uuid('target_id').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('open'),
  reportCount: integer('report_count').notNull().default(1),
  lastReportedAt: timestamp('last_reported_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  verdict: text('verdict'),
  decidedBy: uuid('decided_by'),
  decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

/**
 * Every individual filing behind a report: one per (report, reporter), so a reporter repeating
 * themselves never inflates `report_count`, and the per-user daily report limit counts real filings.
 */
export const opsModerationFilings = ops.table('moderation_filings', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  reportId: uuid('report_id')
    .notNull()
    .references(() => moderationReports.id),
  reporterId: uuid('reporter_id')
    .notNull()
    .references(() => users.id),
  reason: text('reason').notNull(),
  filedAt: timestamp('filed_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

// ops.* tables follow ops-core.ts's convention (RLS class S, never publishable, no class of their
// own); moderation_reports lives in `public` and so carries one.
registerTablePrivacy('moderation_reports', { class: 'C2' });
