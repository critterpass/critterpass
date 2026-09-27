/**
 * Join codes (docs/data-model.md §3.2). Typed mirror of
 * packages/db/migrations/*_join_codes_and_install_claims.sql, which is the applied source of truth
 * for columns, constraints, RLS and grants; this file is not run through `drizzle-kit generate`.
 * The claim fields that migration adds to `install_attributions` are mirrored on that table's own
 * definition (./user-private.ts).
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { crews } from './crews';
import { users } from './identity';

export const JOIN_CODE_TARGET_KINDS = ['crew', 'trip', 'referral'] as const;
export const JOIN_CODE_STATUSES = ['active', 'revoked', 'expired', 'exhausted'] as const;
export const INSTALL_ATTRIBUTION_VIAS = [
  'referrer',
  'paste',
  'code',
  'phone',
  'clip',
  'link',
] as const;

export const joinCodes = pgTable('join_codes', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  code: text('code').notNull(),
  targetKind: text('target_kind', { enum: JOIN_CODE_TARGET_KINDS }).notNull(),
  targetId: uuid('target_id').notNull(),
  crewId: uuid('crew_id').references(() => crews.id),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
  maxUses: integer('max_uses'),
  uses: integer('uses').notNull().default(0),
  status: text('status', { enum: JOIN_CODE_STATUSES }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

registerTablePrivacy('join_codes', { class: 'C1' });
