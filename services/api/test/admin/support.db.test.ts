/**
 * Support tools end to end: lookup by every key, the user detail (never a C3 value), session revoke
 * and bans taking effect on the user's very next api call, device key revoke, and support grants
 * resolving through the entitlement engine — each command with exactly one audit row.
 */
import { randomUUID } from 'node:crypto';

import { withSystem, withUser } from '@cp/db';
import { supportLookupResponseSchema, supportUserSchema } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { recomputeUser } from '../../src/entitlements';
import { startAdminHarness, type AdminHarness, type AppUser, type TestApp } from './harness';

let harness: AdminHarness;
let app: TestApp;
let support: string;
let other: AppUser;

/** C3 values every seeded traveller carries beside their support-visible rows. */
const C3_SECRETS = ['PASSPORT-C3-VALUE', 'ACTION-KEY-C3-SECRET', 'PHONE-ENC-C3', '198.51.100.23'];

interface Traveller extends AppUser {
  readonly deviceId: string;
  readonly username: string;
  readonly email: string;
  readonly phone: string;
}

beforeAll(async () => {
  harness = await startAdminHarness();
  await harness.seedOperator('support@critterpass.test', ['support']);
  await harness.seedOperator('ops@critterpass.test', ['ops']);
  app = harness.app({ areas: harness.areas() });
  support = await app.signIn('support@critterpass.test');
  other = await harness.signInUser();
}, 240_000);

afterAll(async () => {
  await app?.close();
  await harness?.stop();
});

async function get(path: string, cookie = support) {
  const response = await app.request(path, { headers: { cookie } });
  return { status: response.status, body: (await response.json()) as unknown };
}

async function auditCount(uid: string, action: string) {
  const { rows } = await harness.pool.query<{ n: number; hashed: number }>(
    `SELECT count(*)::int AS n, count(ip_hash)::int AS hashed FROM ops.admin_audit
     WHERE target_id = $1 AND action = $2`,
    [uid, action],
  );
  return rows[0];
}

/** An app user with contact details, a device with an action key, and C3 rows beside them. */
async function seededTraveller(): Promise<Traveller> {
  const user = await harness.signInUser();
  const deviceId = randomUUID();
  const suffix = user.uid.replaceAll('-', '').slice(-8);
  const username = `mai_${suffix}`;
  const email = `mai.${suffix}@traveller.test`;
  const phone = `+849${String(parseInt(suffix, 16) % 100_000_000).padStart(8, '0')}`;
  await harness.pool.query('UPDATE auth."user" SET email = $2, phone_number = $3 WHERE id = $1', [
    user.uid,
    email,
    phone,
  ]);
  await harness.pool.query(
    "UPDATE auth.session SET ip_address = '198.51.100.23' WHERE user_id = $1",
    [user.uid],
  );
  await withSystem(harness.pool, async (tx) => {
    await tx.query('UPDATE users SET username = $2, display_name = $3 WHERE id = $1', [
      user.uid,
      username,
      'Mai Tran',
    ]);
    await tx.query(
      `INSERT INTO devices (id, user_id, platform, app_version, locale, tz)
       VALUES ($1, $2, 'ios', '1.4.0', 'en', 'Asia/Ho_Chi_Minh')`,
      [deviceId, user.uid],
    );
    await tx.query(
      `INSERT INTO device_action_keys (key_id, device_id, user_id, secret_enc, scopes, expires_at)
       VALUES ($1, $2, $3, 'ACTION-KEY-C3-SECRET', ARRAY['ballot'], now() + interval '30 days')`,
      [randomUUID(), deviceId, user.uid],
    );
  });
  await harness.pool.query(
    `INSERT INTO user_private (user_id, phone_e164_enc, email_enc, passport_no_enc)
     VALUES ($1, 'PHONE-ENC-C3', 'EMAIL-ENC-C3', 'PASSPORT-C3-VALUE')`,
    [user.uid],
  );
  return { ...user, deviceId, username, email, phone };
}

describe('support lookup and user detail', () => {
  it('finds a user by uid, @username, e-mail, phone and join code', async () => {
    const mai = await seededTraveller();
    await harness.pool.query(
      `INSERT INTO join_codes (code, target_kind, target_id, created_by) VALUES ('K7M2QX', 'referral', $1, $1)`,
      [mai.uid],
    );
    for (const [q, kind] of [
      [mai.uid, 'uid'],
      [`@${mai.username}`, 'username'],
      [mai.email, 'email'],
      [mai.phone, 'phone'],
      ['k7m2qx', 'join_code'],
    ] as const) {
      const { status, body } = await get(`/v1/admin/users?q=${encodeURIComponent(q)}`);
      expect(status, q).toBe(200);
      const found = supportLookupResponseSchema.parse(body);
      expect(found.matched_by, q).toBe(kind);
      expect(
        found.items.map((item) => item.uid),
        q,
      ).toEqual([mai.uid]);
    }
    const none = supportLookupResponseSchema.parse(
      (await get('/v1/admin/users?q=nobody@nowhere.test')).body,
    );
    expect(none).toEqual({ matched_by: null, items: [] });
  });

  it('shows profile, account flags, sessions and devices without any C3 value', async () => {
    const mai = await seededTraveller();
    await app.userCommand(mai, 'report_content', { kind: 'user', id: other.uid, reason: 'spam' });
    const detail = await get(`/v1/admin/users/${mai.uid}`);
    expect(detail.status).toBe(200);
    const user = supportUserSchema.parse(detail.body);
    expect(user.profile).toMatchObject({ uid: mai.uid, display_name: 'Mai Tran' });
    expect(user.account).toMatchObject({ has_email: true, has_phone: true, banned: false });
    expect(user.sessions.length).toBeGreaterThan(0);
    expect(user.devices).toEqual([expect.objectContaining({ id: mai.deviceId, platform: 'ios' })]);

    const lookup = await get(`/v1/admin/users?q=${mai.uid}`);
    const trace = await get(`/v1/admin/commands?uid=${mai.uid}`);
    expect((trace.body as { items: { cmd: string }[] }).items.map((item) => item.cmd)).toEqual([
      'report_content',
    ]);
    const everything = JSON.stringify([detail.body, lookup.body, trace.body]);
    for (const value of [...C3_SECRETS, mai.email, mai.phone, mai.phone.slice(3)]) {
      expect(everything, value).not.toContain(value);
    }
  });
});

describe('account actions', () => {
  it('revoking a session makes its next api call 401', async () => {
    const mai = await seededTraveller();
    const before = await app.userCommand(mai, 'report_content', {
      kind: 'user',
      id: other.uid,
      reason: 'spam',
    });
    expect(before.status).toBe(200);
    const user = supportUserSchema.parse((await get(`/v1/admin/users/${mai.uid}`)).body);
    const response = await app.command(support, 'revoke_session', {
      uid: mai.uid,
      session_id: user.sessions[0]?.id,
      reason: 'Lost phone',
    });
    expect(response.status).toBe(200);
    const after = await app.userCommand(mai, 'report_content', {
      kind: 'user',
      id: other.uid,
      reason: 'spam',
    });
    expect(after.status).toBe(401);
    expect(await auditCount(mai.uid, 'revoke_session')).toEqual({ n: 1, hashed: 1 });
  });

  it('bans until a date, then unbans once', async () => {
    const mai = await seededTraveller();
    const until = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const ban = await app.command(support, 'ban_user', {
      uid: mai.uid,
      reason: 'Scam links',
      until,
    });
    expect(ban.status).toBe(200);
    expect(await harness.accounts.account(mai.uid)).toMatchObject({
      banned: true,
      banReason: 'Scam links',
    });
    expect(
      (
        await app.userCommand(mai, 'report_content', {
          kind: 'user',
          id: other.uid,
          reason: 'spam',
        })
      ).status,
    ).toBe(401);

    expect(
      (await app.command(support, 'unban_user', { uid: mai.uid, reason: 'Appeal upheld' })).status,
    ).toBe(200);
    expect(await harness.accounts.account(mai.uid)).toMatchObject({ banned: false });
    expect(
      (await app.command(support, 'unban_user', { uid: mai.uid, reason: 'Again' })).status,
    ).toBe(409);
    expect(await auditCount(mai.uid, 'ban_user')).toEqual({ n: 1, hashed: 1 });
    expect(await auditCount(mai.uid, 'unban_user')).toEqual({ n: 1, hashed: 1 });
  });

  it("revokes one device's action keys only", async () => {
    const mai = await seededTraveller();
    const response = await app.command(support, 'revoke_device_key', {
      uid: mai.uid,
      device_id: mai.deviceId,
      reason: 'Device stolen',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ result: { revoked: 1 } });
    const { rows } = await harness.pool.query<{ revoked: boolean }>(
      'SELECT revoked_at IS NOT NULL AS revoked FROM device_action_keys WHERE user_id = $1',
      [mai.uid],
    );
    expect(rows).toEqual([{ revoked: true }]);
    const elsewhere = await app.command(support, 'revoke_device_key', {
      uid: other.uid,
      device_id: mai.deviceId,
      reason: 'Wrong user',
    });
    expect(elsewhere.status).toBe(404);
  });
});

describe('support grants', () => {
  it('a grant resolves to Pass+ through the entitlement engine until revoked', async () => {
    const mai = await harness.signInUser();
    const until = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const granted = await app.command(support, 'grant_entitlement', {
      uid: mai.uid,
      perk: 'pass_plus',
      until,
      reason: 'Outage make-good',
    });
    expect(granted.status).toBe(200);
    expect(await granted.json()).toMatchObject({ result: { pass_plus: true } });

    // A later recompute from any context still resolves the grant.
    const system = await withSystem(harness.pool, (tx) => recomputeUser(tx, mai.uid));
    expect(system.passPlus).toBe(true);
    const own = await withUser(harness.pool, mai.uid, 'device-1', (tx) =>
      tx.query('SELECT count(*)::int AS n FROM app.active_entitlement_grants($1)', [mai.uid]),
    );
    expect(own.rows).toEqual([{ n: 1 }]);
    const foreign = await withUser(harness.pool, other.uid, 'device-1', (tx) =>
      tx.query('SELECT count(*)::int AS n FROM app.active_entitlement_grants($1)', [mai.uid]),
    );
    expect(foreign.rows).toEqual([{ n: 0 }]);

    const detail = supportUserSchema.parse((await get(`/v1/admin/users/${mai.uid}`)).body);
    expect(detail.entitlements?.pass_plus).toBe(true);
    expect(detail.grants[0]).toMatchObject({
      perk: 'pass_plus',
      granted_by: 'support@critterpass.test',
    });

    const revoked = await app.command(support, 'revoke_entitlement', {
      uid: mai.uid,
      perk: 'pass_plus',
      reason: 'Granted in error',
    });
    expect(await revoked.json()).toMatchObject({ result: { revoked: 1, pass_plus: false } });
    expect(
      (
        await app.command(support, 'revoke_entitlement', {
          uid: mai.uid,
          perk: 'pass_plus',
          reason: 'Twice',
        })
      ).status,
    ).toBe(409);
    const events = await harness.pool.query<{ type: string }>(
      "SELECT type FROM domain_events WHERE payload->>'user_id' = $1 ORDER BY occurred_at",
      [mai.uid],
    );
    expect(events.rows.map((row) => row.type)).toEqual([
      'entitlement.granted',
      'entitlement.revoked',
    ]);
    expect(await auditCount(mai.uid, 'grant_entitlement')).toEqual({ n: 1, hashed: 1 });
  });

  it('refuses a past or year-plus grant, and an ops operator', async () => {
    const mai = await harness.signInUser();
    const past = await app.command(support, 'grant_entitlement', {
      uid: mai.uid,
      perk: 'pass_plus',
      until: new Date(Date.now() - 1000).toISOString(),
      reason: 'Backdated',
    });
    expect(past.status).toBe(422);
    const far = await app.command(support, 'grant_entitlement', {
      uid: mai.uid,
      perk: 'pass_plus',
      until: new Date(Date.now() + 400 * 86_400_000).toISOString(),
      reason: 'Forever',
    });
    expect(far.status).toBe(422);
    const ops = await app.signIn('ops@critterpass.test');
    const denied = await app.command(ops, 'grant_entitlement', {
      uid: mai.uid,
      perk: 'pass_plus',
      until: new Date(Date.now() + 86_400_000).toISOString(),
      reason: 'Not mine to give',
    });
    expect(denied.status).toBe(403);
    expect(await auditCount(mai.uid, 'grant_entitlement')).toEqual({ n: 0, hashed: 0 });
  });
});
