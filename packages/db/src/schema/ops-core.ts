/**
 * Ops-schema tables plus the client-safe config projection (docs/data-model.md §3.14, §3.16).
 * Typed mirror of packages/db/migrations/*_ops_core_and_publication.sql, which is the applied
 * source of truth for columns, constraints, RLS and grants — this file is not run through
 * `drizzle-kit generate`.
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

const ops = pgSchema('ops');

export const opsAdminAudit = ops.table('admin_audit', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  adminId: uuid('admin_id'),
  action: text('action').notNull(),
  targetKind: text('target_kind').notNull(),
  targetId: uuid('target_id'),
  reason: text('reason'),
  at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  ipHash: text('ip_hash'),
  /** The admin command's op_id and a redacted summary (added by *_ops_console.sql). */
  opId: uuid('op_id'),
  detail: jsonb('detail'),
});

export const opsConfig = ops.table('ops_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  isPublic: boolean('is_public').notNull().default(false),
  /** Optimistic-concurrency token for the ops console's flag editor (added by *_ops_console.sql). */
  version: integer('version').notNull().default(1),
  /** Who a flag applies to (`@cp/domain` `flagAudienceSchema`); only `all` projects to client_config. */
  audience: jsonb('audience').notNull().default({ kind: 'all' }),
  updatedBy: uuid('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

/**
 * The public projection of `ops.ops_config`'s `is_public` rows (docs/data-model.md §3.14: "public
 * subset `client_config` view"). A real table, not a SQL view: only base tables can enter a
 * logical-replication publication (docs/code-standards.md §13), and this table is what PowerSync's
 * `catalog` stream and the `powersync` publication actually carry. `app.sync_client_config` (the
 * migration) keeps it mirrored from `ops.ops_config` so a non-public config key can never leak
 * through it even if a future change to `ops_config` itself is written carelessly.
 */
export const clientConfig = pgTable('client_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

// ops.admin_audit / ops.ops_config are never passed to registerTablePrivacy, matching the
// convention packages/db/src/schema/platform.ts uses for cmd_log/rt_outbox/domain_events: RLS
// class S (no app_user grant, never publishable), so they carry no privacy class of their own.
registerTablePrivacy('client_config', { class: 'C0' });
