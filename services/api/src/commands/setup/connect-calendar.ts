/**
 * `connect_calendar` / `disconnect_calendar` (docs/api-contracts.md §4.5). Connecting completes the
 * OAuth flow the start route began: the state must belong to this user on this device, the code is
 * exchanged with its PKCE verifier, and the tokens are stored only as an AES-256-GCM envelope
 * (written as the server; app_user cannot read the column). The first free/busy sync is queued.
 * Disconnecting revokes the grant where the provider allows it, drops the tokens and the days
 * that source contributed, and recounts the member's trips.
 */
import { emitEvent, sendInTx } from '@cp/db';
import {
  connectCalendarPayloadSchema,
  disconnectCalendarPayloadSchema,
  DomainError,
  SETUP_QUEUES,
  type CalendarSourceKind,
  type OAuthCalendarProvider,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { exchangeCode, openTokens, revokeTokens, sealTokens } from '../../calendar-oauth/client';
import { assertProviderOn, type CalendarOAuthRouteDeps } from '../../calendar-oauth/routes';
import { consumeOAuthState } from '../../calendar-oauth/state';
import { defineCommand } from '../_framework/define-command';
import { openSetupTripIds, queueWindowRecompute } from './shared';

export type CalendarCommandDeps = Pick<CalendarOAuthRouteDeps, 'config' | 'gate' | 'store'>;

const KIND_OF: Readonly<Record<OAuthCalendarProvider, CalendarSourceKind>> = {
  google: 'oauth_google',
  microsoft: 'oauth_microsoft',
};

export interface ConnectCalendarResult {
  readonly source_id: string;
  readonly provider: OAuthCalendarProvider;
}

export function createConnectCalendarCommand(deps: CalendarCommandDeps) {
  return defineCommand({
    name: 'connect_calendar',
    v: 1,
    schema: connectCalendarPayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: async (_tx, payload, ctx) => {
      await assertProviderOn(deps, payload.provider, ctx.uid);
    },
    handle: async (tx, payload, ctx): Promise<ConnectCalendarResult> => {
      const config = await assertProviderOn(deps, payload.provider, ctx.uid);
      const record = await consumeOAuthState(deps.store, payload.state, {
        uid: ctx.uid,
        deviceId: ctx.device.id,
        provider: payload.provider,
      });
      const tokens = await exchangeCode(
        config,
        payload.provider,
        payload.auth_code,
        record.verifier,
        ctx.clock.serverNow,
      );
      const kind = KIND_OF[payload.provider];
      const sourceId = await asSystemRole(tx, async () => {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO calendar_sources (user_id, kind, oauth_tokens_enc, token_expires_at,
             consent_tentative, status, last_sync_at)
           VALUES ($1, $2, $3, $4, $5, 'active', NULL)
           ON CONFLICT (user_id, kind) DO UPDATE
             SET oauth_tokens_enc = EXCLUDED.oauth_tokens_enc,
                 token_expires_at = EXCLUDED.token_expires_at,
                 consent_tentative = EXCLUDED.consent_tentative, status = 'active'
           RETURNING id`,
          [
            ctx.uid,
            kind,
            sealTokens(tokens, config.keyring),
            tokens.expires_at,
            record.consent_tentative,
          ],
        );
        return rows[0]?.id as string;
      });
      await sendInTx(
        tx,
        SETUP_QUEUES.calendarSync,
        { source_id: sourceId },
        { singletonKey: sourceId },
      );
      await emitEvent(tx, {
        type: 'calendar.connected',
        aggregateKind: 'calendar_source',
        aggregateId: sourceId,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { user_id: ctx.uid, source_id: sourceId, kind },
      });
      return { source_id: sourceId, provider: payload.provider };
    },
  });
}

const DAY_SOURCE_OF: Readonly<Record<CalendarSourceKind, 'oauth' | 'device_cal' | 'manual'>> = {
  oauth_google: 'oauth',
  oauth_microsoft: 'oauth',
  device: 'device_cal',
  manual: 'manual',
};

export function createDisconnectCalendarCommand(deps: CalendarCommandDeps) {
  return defineCommand({
    name: 'disconnect_calendar',
    v: 1,
    schema: disconnectCalendarPayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: async (tx, payload) => {
      const { rowCount } = await tx.query('SELECT 1 FROM calendar_sources WHERE id = $1', [
        payload.source_id,
      ]);
      if (rowCount === 0) throw new DomainError('NOT_FOUND', { reason: 'calendar_source' });
    },
    handle: async (tx, payload, ctx) => {
      const source = await asSystemRole(tx, async () => {
        const { rows } = await tx.query<{
          kind: CalendarSourceKind;
          oauth_tokens_enc: string | null;
          status: string;
        }>(
          `SELECT kind, oauth_tokens_enc, status FROM calendar_sources
            WHERE id = $1 AND user_id = $2 FOR UPDATE`,
          [payload.source_id, ctx.uid],
        );
        return rows[0];
      });
      if (source === undefined) throw new DomainError('NOT_FOUND', { reason: 'calendar_source' });
      if (source.status === 'disconnected') return { source_id: payload.source_id };
      const provider: OAuthCalendarProvider | null =
        source.kind === 'oauth_google'
          ? 'google'
          : source.kind === 'oauth_microsoft'
            ? 'microsoft'
            : null;
      if (provider !== null && source.oauth_tokens_enc !== null && deps.config !== undefined) {
        await revokeTokens(
          deps.config,
          provider,
          openTokens(source.oauth_tokens_enc, deps.config.keyring),
        );
      }
      const daySource = DAY_SOURCE_OF[source.kind];
      await asSystemRole(tx, async () => {
        await tx.query(
          `UPDATE calendar_sources
              SET status = 'disconnected', oauth_tokens_enc = NULL, token_expires_at = NULL
            WHERE id = $1`,
          [payload.source_id],
        );
        // Days from a source kind nobody else of the member's still feeds are forgotten.
        await tx.query(
          `DELETE FROM calendar_days d
            WHERE d.user_id = $1 AND d.source = $2
              AND NOT EXISTS (
                SELECT 1 FROM calendar_sources s
                 WHERE s.user_id = $1 AND s.status = 'active' AND s.id <> $3
                   AND (CASE s.kind WHEN 'device' THEN 'device_cal' WHEN 'manual' THEN 'manual'
                        ELSE 'oauth' END) = $2
              )`,
          [ctx.uid, daySource, payload.source_id],
        );
      });
      for (const tripId of await openSetupTripIds(tx, ctx.uid))
        await queueWindowRecompute(tx, tripId);
      await emitEvent(tx, {
        type: 'calendar.disconnected',
        aggregateKind: 'calendar_source',
        aggregateId: payload.source_id,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { user_id: ctx.uid, source_id: payload.source_id, kind: source.kind },
      });
      return { source_id: payload.source_id };
    },
  });
}
