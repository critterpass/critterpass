/**
 * Anti-abuse / extension-auth / account-state device and identity tables (docs/data-model.md §3.1,
 * §3.17). Typed mirror of the applied migrations (packages/db/migrations/*_device_attestations.sql,
 * *_device_action_keys.sql, *_user_private_and_account_state.sql), not run through
 * `drizzle-kit generate` (same convention as ./identity.ts).
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core';

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

/**
 * The encrypted split half of a user's identity (docs/data-model.md §3.1). RLS class X: owner-only
 * (same policy shape as O) and, unlike an ordinary O table, explicitly never granted to
 * `guide_reader` or entered into the powersync publication — enforced here structurally (C3 is never
 * publishable, `packages/domain/src/privacy.ts#isPublishableClass`) as well as by the migration's own
 * grants.
 */
export const userPrivate = pgTable('user_private', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  phoneE164Enc: text('phone_e164_enc'),
  phoneHash: text('phone_hash'),
  emailEnc: text('email_enc'),
  passportNoEnc: text('passport_no_enc'),
  signInCountry: text('sign_in_country'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

registerTablePrivacy('user_private', { class: 'C3' });

/** Account deletion/restore workflow state (docs/data-model.md §3.17); the restore/purge job itself is a later phase's, this phase owns only the table and `rejectClosedAccount`'s read of it. */
export const accountDeletions = pgTable('account_deletions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  reason: text('reason'),
  balancesSnapshot: jsonb('balances_snapshot'),
  requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  purgeAt: timestamp('purge_at', { withTimezone: true, mode: 'date' }).notNull(),
  restoredAt: timestamp('restored_at', { withTimezone: true, mode: 'date' }),
  purgedAt: timestamp('purged_at', { withTimezone: true, mode: 'date' }),
  source: text('source').notNull(),
});

registerTablePrivacy('account_deletions', { class: 'C2' });

/** Install attribution skeleton (docs/data-model.md §3.1); the attribution pipeline itself is a later phase's job. */
export const installAttributions = pgTable('install_attributions', {
  deviceId: uuid('device_id').primaryKey(),
  channel: text('channel'),
  source: text('source'),
  inviteId: uuid('invite_id'),
  joinCode: text('join_code'),
  /** How the install was attributed (packages/db/src/schema/links.ts `INSTALL_ATTRIBUTION_VIAS`). */
  via: text('via'),
  claimedUrl: text('claimed_url'),
  linkKind: text('link_kind'),
  claimedAt: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

registerTablePrivacy('install_attributions', { class: 'C2' });
