/**
 * Support area: find a user (uid, e-mail, phone, join code, @username), see their profile, account,
 * sessions, devices and entitlements, trace their commands, and fix the account — revoke a session,
 * ban/unban, revoke a device's action keys, grant or revoke a perk. Profile, device and entitlement
 * reads run as admin_reader (no C3 column is reachable); account and session facts come from the
 * app's Better Auth instance without contact details or IPs.
 */
import {
  DomainError,
  banUserPayloadSchema,
  commandTraceQuerySchema,
  commandTraceResponseSchema,
  grantEntitlementPayloadSchema,
  normalizeJoinCode,
  revokeDeviceKeyPayloadSchema,
  revokeEntitlementPayloadSchema,
  revokeSessionPayloadSchema,
  supportLookupQuerySchema,
  supportLookupResponseSchema,
  supportUserSchema,
  unbanUserPayloadSchema,
  type SupportLookupKind,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import type { AccountControl } from './accounts';
import { grantEntitlement, revokeEntitlement } from './entitlement-grants';
import { withAdminReader } from './reads';
import { defineAdminArea, defineAdminCommand, defineAdminRead } from './registry';
import { loadSupportUser, summariseUsers } from './support-reads';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveLookup(
  pool: pg.Pool,
  accounts: AccountControl,
  adminUid: string,
  q: string,
): Promise<{ kind: SupportLookupKind | null; uids: string[] }> {
  if (UUID.test(q)) return { kind: 'uid', uids: [q.toLowerCase()] };
  if (q.startsWith('+')) {
    const uid = await accounts.findByPhone(q.replaceAll(/[\s-]/g, ''));
    return { kind: 'phone', uids: uid ? [uid] : [] };
  }
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(q)) {
    const uid = await accounts.findByEmail(q);
    return { kind: 'email', uids: uid ? [uid] : [] };
  }
  const code = normalizeJoinCode(q);
  const username = q.replace(/^@/, '').toLowerCase();
  return withAdminReader(pool, adminUid, async (tx) => {
    if (code !== null && !q.startsWith('@')) {
      const { rows } = await tx.query<{ created_by: string }>(
        'SELECT created_by FROM join_codes WHERE code = $1',
        [code],
      );
      if (rows.length > 0) return { kind: 'join_code', uids: rows.map((row) => row.created_by) };
    }
    const { rows } = await tx.query<{ id: string }>(
      'SELECT id FROM users WHERE lower(username) = $1',
      [username],
    );
    return { kind: rows.length > 0 ? 'username' : null, uids: rows.map((row) => row.id) };
  });
}

export interface SupportAreaDeps {
  readonly pool: pg.Pool;
  readonly accounts: AccountControl;
}

const userTarget = (
  payload: { uid: string; reason: string },
  detail?: Record<string, unknown>,
) => ({
  targetKind: 'user',
  targetId: payload.uid,
  reason: payload.reason,
  ...(detail ? { detail } : {}),
});

export function supportArea(deps: SupportAreaDeps) {
  const { pool, accounts } = deps;
  return defineAdminArea({
    id: 'support',
    reads: [
      defineAdminRead({
        path: '/users',
        area: 'support',
        summary: 'Find a user by uid, e-mail, phone (E.164), join code or @username',
        query: supportLookupQuerySchema,
        response: supportLookupResponseSchema,
        run: async ({ admin, query }) => {
          const found = await resolveLookup(pool, accounts, admin.uid, query.q);
          const items = await withAdminReader(pool, admin.uid, (tx) =>
            summariseUsers(tx, found.uids),
          );
          return { matched_by: items.length > 0 ? found.kind : null, items };
        },
      }),
      defineAdminRead({
        path: '/users/{uid}',
        area: 'support',
        summary: 'A user: profile, account, sessions, devices, entitlements and support grants',
        params: z.object({ uid: z.uuid() }),
        response: supportUserSchema,
        run: async ({ admin, operators, params }) => {
          const user = await loadSupportUser(pool, accounts, operators, admin.uid, params.uid);
          if (user === null) throw new DomainError('NOT_FOUND');
          return user;
        },
      }),
      defineAdminRead({
        path: '/commands',
        area: 'support',
        summary: 'Command trace by op_id or uid (latest 50 outcomes)',
        query: commandTraceQuerySchema,
        response: commandTraceResponseSchema,
        run: async ({ admin, query }) => {
          const { rows } = await withAdminReader(pool, admin.uid, (tx) =>
            tx.query<{ server_ts: Date } & Record<string, unknown>>(
              `SELECT op_id, uid, cmd, status, code, detail, result_ref, server_ts FROM cmd_results
               WHERE ($1::uuid IS NULL OR op_id = $1) AND ($2::uuid IS NULL OR uid = $2)
               ORDER BY server_ts DESC LIMIT 50`,
              [query.op_id ?? null, query.uid ?? null],
            ),
          );
          return commandTraceResponseSchema.parse({
            items: rows.map((row) => ({ ...row, server_ts: row.server_ts.toISOString() })),
          });
        },
      }),
    ],
    commands: [
      defineAdminCommand({
        name: 'revoke_session',
        schema: revokeSessionPayloadSchema,
        audit: (payload) => userTarget(payload, { session_id: payload.session_id }),
        handle: async (_tx, payload) => {
          if (!(await accounts.revokeSession(payload.uid, payload.session_id))) {
            throw new DomainError('NOT_FOUND');
          }
          return { revoked: true };
        },
      }),
      defineAdminCommand({
        name: 'ban_user',
        schema: banUserPayloadSchema,
        audit: (payload) => userTarget(payload, { until: payload.until }),
        handle: async (_tx, payload, ctx) => {
          const until = payload.until === null ? null : new Date(payload.until);
          if (until !== null && until.getTime() <= ctx.clock.serverNow.getTime()) {
            throw new DomainError('VALIDATION', { reason: 'until_in_past' });
          }
          if ((await accounts.account(payload.uid)) === null) throw new DomainError('NOT_FOUND');
          await accounts.ban(payload.uid, { reason: payload.reason, until });
          return { banned: true };
        },
      }),
      defineAdminCommand({
        name: 'unban_user',
        schema: unbanUserPayloadSchema,
        audit: (payload) => userTarget(payload),
        handle: async (_tx, payload) => {
          const account = await accounts.account(payload.uid);
          if (account === null) throw new DomainError('NOT_FOUND');
          if (!account.banned) throw new DomainError('STATE_INVALID', { reason: 'not_banned' });
          await accounts.unban(payload.uid);
          return { banned: false };
        },
      }),
      defineAdminCommand({
        name: 'revoke_device_key',
        schema: revokeDeviceKeyPayloadSchema,
        audit: (payload) => userTarget(payload, { device_id: payload.device_id }),
        handle: async (tx, payload) => {
          const device = await tx.query('SELECT 1 FROM devices WHERE id = $1 AND user_id = $2', [
            payload.device_id,
            payload.uid,
          ]);
          if (device.rowCount === 0) throw new DomainError('NOT_FOUND');
          const revoked = await tx.query(
            `UPDATE device_action_keys SET revoked_at = now()
             WHERE device_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
            [payload.device_id, payload.uid],
          );
          return { revoked: revoked.rowCount ?? 0 };
        },
      }),
      defineAdminCommand({
        name: 'grant_entitlement',
        schema: grantEntitlementPayloadSchema,
        audit: (payload) => userTarget(payload, { perk: payload.perk, until: payload.until }),
        handle: (tx, payload, ctx) =>
          grantEntitlement(tx, payload, ctx.admin.uid, ctx.clock.serverNow),
      }),
      defineAdminCommand({
        name: 'revoke_entitlement',
        schema: revokeEntitlementPayloadSchema,
        audit: (payload) => userTarget(payload, { perk: payload.perk }),
        handle: (tx, payload, ctx) => revokeEntitlement(tx, payload, ctx.admin.uid),
      }),
    ],
  });
}
