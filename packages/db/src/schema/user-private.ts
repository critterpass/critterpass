/**
 * Anti-abuse / extension-auth device tables (docs/data-model.md §3.1). Typed mirror of the applied
 * migrations (packages/db/migrations/*_device_attestations.sql, *_device_action_keys.sql, and the
 * ones a later task adds to this same file), not run through `drizzle-kit generate` (same convention
 * as ./identity.ts). `user_private`/`account_deletions`/`install_attributions` (docs/data-model.md
 * §3.1, §3.17) land here in a later task.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './identity';

/**
 * One row per attested app install (docs/data-model.md §3.1). `installId` has no FK
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

/**
 * Device action keys (docs/data-model.md §3.1; docs/api-contracts-async.md §5): the extension auth
 * primitive — a signed request needs no app session, only this HMAC secret. RLS class O (self
 * create/revoke): the owning user's own rows are readable/writable, unlike `deviceAttestations`'
 * system-only S class above. `secretEnc` is AES-256-GCM encrypted (packages/db/src/crypto); C3
 * (secret hash) — never entered into the powersync publication.
 */
export const deviceActionKeys = pgTable('device_action_keys', {
  keyId: text('key_id').primaryKey(),
  deviceId: uuid('device_id').notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  secretEnc: text('secret_enc').notNull(),
  scopes: text('scopes').array().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
});

registerTablePrivacy('device_action_keys', { class: 'C3' });
