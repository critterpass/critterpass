/**
 * Platform/infrastructure tables (docs/data-model.md §3.18). `rtOutbox` is provisioned early: the
 * crew membership epoch trigger (packages/db/sql/helpers-crew.sql) needs it to exist before the
 * command bookkeeping migration adds `cmd_log`, `cmd_results`, `domain_events` and
 * `activity_events` alongside it. Typed mirror of packages/db/migrations/*_identity_and_crews.sql
 * for this table — not run through `drizzle-kit generate`.
 */
import { bigserial, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Infrastructure tables (docs/data-model.md §3.18) sit outside the C0-C5 privacy classification
// used for publication/guide_reader decisions, so this one is deliberately never passed to
// registerTablePrivacy: it has no RLS policy or grant for app_user/app_system either, and is
// excluded from the PowerSync publication simply by never being added to its allow-list.
export const rtOutbox = pgTable('rt_outbox', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  channel: text('channel').notNull(),
  payload: jsonb('payload').notNull(),
  idemKey: uuid('idem_key').notNull(),
  kind: text('kind').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
  attempts: integer('attempts').notNull().default(0),
});
