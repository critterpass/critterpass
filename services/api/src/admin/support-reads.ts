/**
 * The support user detail: every table read runs as admin_reader and names only granted (non-C3)
 * columns; account and session facts come from the app's auth store as presence flags and dates.
 */
import {
  supportUserSchema,
  type SupportUser,
  type SupportUserSummary,
  type GrantablePerk,
} from '@cp/domain';
import type pg from 'pg';

import type { AccountControl } from './accounts';
import { withAdminReader } from './reads';
import type { OperatorDirectory } from './registry';

interface UserRow {
  id: string;
  display_name: string | null;
  username: string | null;
  status: string;
  member_since: Date | null;
  home_country: string | null;
  locale: string | null;
  tz: string | null;
  created_at: Date;
}

const iso = (value: Date | null) => value?.toISOString() ?? null;

function summary(row: UserRow): SupportUserSummary {
  return {
    uid: row.id,
    display_name: row.display_name,
    username: row.username,
    status: row.status,
    member_since: iso(row.member_since),
  };
}

const USER_COLUMNS =
  'id, display_name, username, status, member_since, home_country, locale, tz, created_at';

export async function summariseUsers(
  tx: pg.PoolClient,
  uids: readonly string[],
): Promise<SupportUserSummary[]> {
  if (uids.length === 0) return [];
  const { rows } = await tx.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = ANY($1::uuid[]) ORDER BY created_at DESC LIMIT 20`,
    [uids],
  );
  return rows.map(summary);
}

export async function loadSupportUser(
  pool: pg.Pool,
  accounts: AccountControl,
  operators: OperatorDirectory,
  adminUid: string,
  uid: string,
): Promise<SupportUser | null> {
  const stored = await withAdminReader(pool, adminUid, async (tx) => {
    const user = await tx.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [uid]);
    const row = user.rows[0];
    if (row === undefined) return null;
    const devices = await tx.query<{
      id: string;
      platform: string;
      app_version: string;
      os_version: string | null;
      last_seen_at: Date | null;
    }>(
      `SELECT id, platform, app_version, os_version, last_seen_at FROM devices
       WHERE user_id = $1 ORDER BY last_seen_at DESC NULLS LAST`,
      [uid],
    );
    const entitlements = await tx.query<{
      pass_plus: boolean;
      expires_at: Date | null;
      guide_unlimited_global: boolean;
      computed_at: Date;
    }>(
      `SELECT pass_plus, expires_at, guide_unlimited_global, computed_at FROM user_entitlements
       WHERE user_id = $1`,
      [uid],
    );
    const grants = await tx.query<{
      id: string;
      perk: GrantablePerk;
      until: Date;
      reason: string;
      granted_by: string;
      granted_at: Date;
      revoked_at: Date | null;
    }>(
      `SELECT id, perk, until, reason, granted_by, granted_at, revoked_at
       FROM ops.entitlement_grants WHERE user_id = $1 ORDER BY granted_at DESC LIMIT 20`,
      [uid],
    );
    return {
      row,
      devices: devices.rows,
      entitlements: entitlements.rows[0],
      grants: grants.rows,
    };
  });
  if (stored === null) return null;
  const [account, sessions, granters] = await Promise.all([
    accounts.account(uid),
    accounts.sessions(uid),
    operators.emails(stored.grants.map((grant) => grant.granted_by)),
  ]);
  return supportUserSchema.parse({
    profile: {
      ...summary(stored.row),
      home_country: stored.row.home_country,
      locale: stored.row.locale,
      tz: stored.row.tz,
      created_at: stored.row.created_at.toISOString(),
    },
    account:
      account === null
        ? null
        : {
            is_anonymous: account.isAnonymous,
            has_email: account.hasEmail,
            has_phone: account.hasPhone,
            banned: account.banned,
            ban_reason: account.banReason,
            ban_expires: iso(account.banExpires),
            created_at: account.createdAt.toISOString(),
          },
    sessions: sessions.map((session) => ({
      id: session.id,
      created_at: session.createdAt.toISOString(),
      expires_at: session.expiresAt.toISOString(),
      user_agent: session.userAgent,
    })),
    devices: stored.devices.map((device) => ({
      ...device,
      last_seen_at: iso(device.last_seen_at),
    })),
    entitlements:
      stored.entitlements === undefined
        ? null
        : {
            pass_plus: stored.entitlements.pass_plus,
            expires_at: iso(stored.entitlements.expires_at),
            guide_unlimited_global: stored.entitlements.guide_unlimited_global,
            computed_at: stored.entitlements.computed_at.toISOString(),
          },
    grants: stored.grants.map((grant) => ({
      ...grant,
      until: grant.until.toISOString(),
      granted_at: grant.granted_at.toISOString(),
      revoked_at: iso(grant.revoked_at),
      granted_by: granters.get(grant.granted_by) ?? grant.granted_by,
    })),
  });
}
