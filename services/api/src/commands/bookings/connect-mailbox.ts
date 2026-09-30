/**
 * `connect_mailbox` / `disconnect_mailbox` (docs/api-contracts.md §4.10). Connecting needs Pass+
 * (`mailbox_import`) and the provider switched on; it completes the OAuth flow the start route began
 * (same user, same device), keeps only the refresh token, sealed, records the owner's choice about
 * surfacing finds to the crew (`mailbox_surfacing` consent) and queues the first scan.
 * Disconnecting revokes the grant at the provider where it can and deletes the connection; the
 * candidates already found stay the owner's.
 */
import { crypto as dbCrypto, emitEvent, sendInTx } from '@cp/db';
import {
  BOOKINGS_QUEUES,
  connectMailboxPayloadSchema,
  disconnectMailboxPayloadSchema,
  DomainError,
  type MailboxProvider,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import {
  consumeMailboxState,
  exchangeMailboxCode,
  revokeMailbox,
} from '../../bookings/mailbox-client';
import type { OAuthStateStore } from '../../calendar-oauth/state';
import { entitle } from '../../entitlements/entitle';
import { assertMailboxOn, type MailboxRouteDeps } from '../../routes/mailbox-oauth';
import { defineCommand } from '../_framework/define-command';

export type MailboxCommandDeps = Pick<MailboxRouteDeps, 'config' | 'gate'> & {
  readonly store: OAuthStateStore;
};

async function recordSurfacing(tx: pg.PoolClient, uid: string, granted: boolean): Promise<void> {
  await asSystemRole(tx, () =>
    tx.query(
      `INSERT INTO consents (user_id, purpose, granted_at, revoked_at)
       VALUES ($1, 'mailbox_surfacing', CASE WHEN $2 THEN now() END, CASE WHEN $2 THEN NULL ELSE now() END)
       ON CONFLICT (user_id, purpose) DO UPDATE
         SET granted_at = CASE WHEN $2 THEN now() ELSE consents.granted_at END,
             revoked_at = CASE WHEN $2 THEN NULL ELSE now() END`,
      [uid, granted],
    ),
  );
}

export function createConnectMailboxCommand(deps: MailboxCommandDeps) {
  return defineCommand({
    name: 'connect_mailbox',
    v: 1,
    schema: connectMailboxPayloadSchema,
    offline: false,
    authorize: async (_tx, payload, ctx) => {
      await assertMailboxOn(deps, payload.provider, ctx.uid);
    },
    entitle: async (tx, _payload, ctx) => {
      await entitle(
        tx,
        { uid: ctx.uid, deviceTz: ctx.device.tz },
        { kind: 'capability', key: 'mailbox_import' },
      );
    },
    handle: async (tx, payload, ctx) => {
      const config = await assertMailboxOn(deps, payload.provider, ctx.uid);
      const state = await consumeMailboxState(deps.store, payload.state, {
        uid: ctx.uid,
        deviceId: ctx.device.id,
        provider: payload.provider,
      });
      const grant = await exchangeMailboxCode(
        config,
        payload.provider,
        payload.auth_code,
        state.verifier,
      );
      const connectionId = await asSystemRole(tx, async () => {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO mailbox_connections (user_id, provider, scopes, refresh_token_enc, status)
           VALUES ($1, $2, $3, $4, 'active')
           ON CONFLICT (user_id, provider) DO UPDATE
             SET scopes = EXCLUDED.scopes, refresh_token_enc = EXCLUDED.refresh_token_enc,
                 status = 'active', last_error = NULL
           RETURNING id`,
          [
            ctx.uid,
            payload.provider,
            grant.scope,
            dbCrypto.encryptField(grant.refreshToken, config.keyring),
          ],
        );
        return rows[0]?.id as string;
      });
      if (payload.surface_to_crew !== undefined)
        await recordSurfacing(tx, ctx.uid, payload.surface_to_crew);
      await sendInTx(
        tx,
        BOOKINGS_QUEUES.mailboxScan,
        { connection_id: connectionId },
        { singletonKey: connectionId },
      );
      await emitEvent(tx, {
        type: 'mailbox.connected',
        aggregateKind: 'mailbox_connection',
        aggregateId: connectionId,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { user_id: ctx.uid, connection_id: connectionId, provider: payload.provider },
      });
      return { connection_id: connectionId, provider: payload.provider };
    },
  });
}

export function createDisconnectMailboxCommand(deps: Pick<MailboxCommandDeps, 'config'>) {
  return defineCommand({
    name: 'disconnect_mailbox',
    v: 1,
    schema: disconnectMailboxPayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: async (tx, payload) => {
      const { rowCount } = await tx.query('SELECT 1 FROM mailbox_connections WHERE id = $1', [
        payload.connection_id,
      ]);
      if (rowCount === 0) throw new DomainError('NOT_FOUND', { reason: 'mailbox_connection' });
    },
    handle: async (tx, payload, ctx) => {
      const row = await asSystemRole(tx, async () => {
        const { rows } = await tx.query<{
          provider: MailboxProvider;
          refresh_token_enc: string | null;
        }>(
          `DELETE FROM mailbox_connections WHERE id = $1 AND user_id = $2
           RETURNING provider, refresh_token_enc`,
          [payload.connection_id, ctx.uid],
        );
        return rows[0];
      });
      if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'mailbox_connection' });
      const revoked =
        row.refresh_token_enc !== null && deps.config !== undefined
          ? await revokeMailbox(
              deps.config,
              row.provider,
              dbCrypto.decryptField(row.refresh_token_enc, deps.config.keyring),
            )
          : false;
      await emitEvent(tx, {
        type: 'mailbox.disconnected',
        aggregateKind: 'mailbox_connection',
        aggregateId: payload.connection_id,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: {
          user_id: ctx.uid,
          connection_id: payload.connection_id,
          provider: row.provider,
          revoked,
        },
      });
      return { connection_id: payload.connection_id, revoked };
    },
  });
}
