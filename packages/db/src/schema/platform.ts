/**
 * Platform/infrastructure tables (docs/data-model.md §3.18). `rtOutbox` is provisioned early: the
 * crew membership epoch trigger (packages/db/sql/helpers-crew.sql) needs it to exist before the
 * command bookkeeping migration (packages/db/migrations/*_command_and_event_log.sql) adds
 * `cmd_log`, `cmd_results` and `domain_events` alongside it and extends `rt_outbox` with the
 * app_system relay grant + `app.enqueue_rt`. Typed mirrors of the applied migrations — not run
 * through `drizzle-kit generate`.
 */
import { registerTablePrivacy } from '@cp/domain';
import { bigserial, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Infrastructure tables (docs/data-model.md §3.18) sit outside the C0-C5 privacy classification
// used for publication/guide_reader decisions, so these four are deliberately never passed to
// registerTablePrivacy: none has an RLS policy or grant for app_user/app_system, and each is
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

export const cmdLog = pgTable('cmd_log', {
  opId: uuid('op_id').primaryKey(),
  uid: uuid('uid'),
  cmd: text('cmd').notNull(),
  payloadHash: text('payload_hash').notNull(),
  result: jsonb('result'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const cmdResults = pgTable('cmd_results', {
  opId: uuid('op_id')
    .primaryKey()
    .references(() => cmdLog.opId),
  uid: uuid('uid').notNull(),
  cmd: text('cmd').notNull(),
  status: text('status').notNull(),
  code: text('code'),
  detail: jsonb('detail'),
  resultRef: jsonb('result_ref'),
  serverTs: timestamp('server_ts', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const domainEvents = pgTable('domain_events', {
  id: uuid('id').primaryKey(),
  type: text('type').notNull(),
  aggregateKind: text('aggregate_kind').notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  actorKind: text('actor_kind').notNull(),
  actorId: uuid('actor_id'),
  payload: jsonb('payload').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
  crewId: uuid('crew_id'),
  tripId: uuid('trip_id'),
});

export const activityEvents = pgTable('activity_events', {
  id: uuid('id').primaryKey(),
  tripId: uuid('trip_id').notNull(),
  crewId: uuid('crew_id').notNull(),
  actorKind: text('actor_kind').notNull(),
  actorId: uuid('actor_id'),
  verb: text('verb').notNull(),
  objectKind: text('object_kind').notNull(),
  objectId: uuid('object_id'),
  text: text('text'),
  at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

registerTablePrivacy('activity_events', { class: 'C1' });
