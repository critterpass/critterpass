/**
 * Console incidents and third-party service monitoring. Typed mirror of
 * packages/db/migrations/*_ops_incidents_services.sql, which is the applied source of truth for
 * columns, constraints, RLS and grants — this file is not run through `drizzle-kit generate`.
 */
import {
  bigint,
  boolean,
  date,
  integer,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const ops = pgSchema('ops');
const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const opsIncidents = ops.table('incidents', {
  id: uuid('id').primaryKey(),
  kind: text('kind').notNull(),
  text: text('text').notNull(),
  runbookUrl: text('runbook_url'),
  startsAt: at('starts_at').notNull().defaultNow(),
  endsAt: at('ends_at'),
  readOnly: boolean('read_only').notNull().default(false),
  postedBy: uuid('posted_by').notNull(),
  postedAt: at('posted_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
  resolvedBy: uuid('resolved_by'),
  resolvedAt: at('resolved_at'),
});

export const opsServiceHealth = ops.table(
  'service_health',
  {
    service: text('service').notNull(),
    at: at('at').notNull().defaultNow(),
    state: text('state').notNull(),
    p95Ms: integer('p95_ms'),
    errorRate: numeric('error_rate', { precision: 6, scale: 5 }),
    quotaUsedPct: numeric('quota_used_pct', { precision: 5, scale: 2 }),
    calls: integer('calls'),
  },
  (table) => [primaryKey({ columns: [table.service, table.at] })],
);

export const opsVendorSpendDaily = ops.table(
  'vendor_spend_daily',
  {
    service: text('service').notNull(),
    day: date('day').notNull(),
    amountMicros: bigint('amount_micros', { mode: 'number' }).notNull(),
    currency: text('currency').notNull(),
    source: text('source').notNull(),
    note: text('note'),
    updatedAt: at('updated_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.service, table.day, table.source] })],
);

// ops.* tables follow ops-core.ts's convention: RLS class S, never publishable, no class of their own.
