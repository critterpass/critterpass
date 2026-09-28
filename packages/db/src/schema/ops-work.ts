/**
 * Console work claims (docs/data-model.md §3.16): who is working an item of a console queue. Typed
 * mirror of packages/db/migrations/*_ops_console_capture.sql, which is the applied source of truth
 * for columns, constraints, RLS and grants — this file is not run through `drizzle-kit generate`.
 */
import { pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const ops = pgSchema('ops');

export const opsWorkClaims = ops.table(
  'work_claims',
  {
    queue: text('queue').notNull(),
    itemId: uuid('item_id').notNull(),
    adminId: uuid('admin_id').notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.queue, table.itemId] })],
);

// ops.* tables follow ops-core.ts's convention: RLS class S, never publishable, no class of their own.
