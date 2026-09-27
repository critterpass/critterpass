/**
 * Anti-abuse device tables owned solely by app_system (docs/data-model.md §3.1: "all RLS X/S, not
 * published"). Typed mirror of the applied migrations (packages/db/migrations/*_device_attestations
 * .sql and the ones a later task adds to this same file), not run through `drizzle-kit generate`
 * (same convention as ./identity.ts). `user_private`/`account_deletions`/`install_attributions`
 * (docs/data-model.md §3.1, §3.17) land here in a later task; this file starts with
 * `device_attestations` alone.
 */
import { sql } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * One row per attested app install (docs/data-model.md §3.1, phase-9 F-029). `installId` has no FK
 * to `users`: App Attest/Play Integrity attestation happens before an anonymous user necessarily
 * exists yet (it gates the very call that creates one), so this table's lifetime is the install's
 * keychain/keystore key, not an account's. RLS class S (system-only, no app_user policy at all —
 * deliberately not passed to registerTablePrivacy, same convention as
 * packages/db/src/schema/platform.ts's cmd_log/domain_events/rt_outbox): unreadable by app_user,
 * excluded from the powersync publication simply by never entering its allow-list.
 */
export const deviceAttestations = pgTable('device_attestations', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  installId: uuid('install_id').notNull().unique(),
  platform: text('platform').notNull(),
  keyId: text('key_id').notNull().unique(),
  publicKey: text('public_key').notNull(),
  counter: integer('counter').notNull().default(0),
  attestedAt: timestamp('attested_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  lastAssertionAt: timestamp('last_assertion_at', { withTimezone: true, mode: 'date' }),
  verdict: text('verdict').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});
