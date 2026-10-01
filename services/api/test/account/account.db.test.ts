/**
 * Closing, restoring and erasing an account through the real doors against a migrated Postgres
 * and a real Better Auth instance: a close ends every session and answers `ACCOUNT_CLOSED` to
 * everything but a restore; a restore brings the account back as it was; the purge route erases
 * the account at once, frees its phone number for a brand-new account, leaves the crew whole for
 * the people still in it, and is refused in production.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startAccountHarness, type AccountHarness, type Session } from './account-harness';

let h: AccountHarness;

beforeAll(async () => {
  h = await startAccountHarness();
}, 240_000);

afterAll(async () => {
  await h.stop();
});

let phoneSeq = 0;
let codeSeq = 0;
/** A fresh number per test, so one test's account never meets another's. */
function phone(): string {
  phoneSeq += 1;
  return `+6591${String(100000 + phoneSeq)}`;
}

async function status(uid: string): Promise<string | undefined> {
  const rows = await h.rows<{ status: string }>('SELECT status FROM users WHERE id = $1', [uid]);
  return rows[0]?.status;
}

/** A crew the two share, a join code and an invite `owner` handed out, and a past trip of theirs. */
async function shareCrew(owner: Session, friend: Session): Promise<string> {
  const crews = await h.rows<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('The Bali Six', $1) RETURNING id",
    [owner.uid],
  );
  const crewId = crews[0]?.id ?? '';
  await h.rows(
    "INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'organiser'), ($1, $3, 'member')",
    [crewId, owner.uid, friend.uid],
  );
  codeSeq += 1;
  await h.rows(
    `INSERT INTO join_codes (code, target_kind, target_id, crew_id, created_by)
     VALUES ($3, 'crew', $1, $1, $2)`,
    [crewId, owner.uid, `ZZZZ${String(22 + codeSeq)}`],
  );
  await h.rows(
    `INSERT INTO invites (crew_id, inviter_id, kind, expires_at)
     VALUES ($1, $2, 'generic', now() + interval '7 days')`,
    [crewId, owner.uid],
  );
  return crewId;
}

describe('request_account_deletion and restore_account', () => {
  it('closes at once, signs every session out, and lets only a restore through', async () => {
    const number = phone();
    const me = await h.registered(number);
    await h.cmd(me, 'update_profile', { name: 'Winston' });
    const before = await status(me.uid);

    const [closeStatus, closed] = await h.cmd(me, 'request_account_deletion', {
      reason: 'privacy',
    });
    expect([closeStatus, closed.error]).toEqual([200, undefined]);
    expect(closed.result).toMatchObject({ instant: false, contact: { kind: 'phone' } });
    expect(await status(me.uid)).toBe('closed');
    const deletions = await h.rows<{ reason: string; days: number }>(
      `SELECT reason, round(extract(epoch FROM purge_at - requested_at) / 86400)::int AS days
         FROM account_deletions WHERE user_id = $1`,
      [me.uid],
    );
    expect(deletions).toEqual([{ reason: 'privacy', days: 30 }]);
    expect(await h.events('account.closed')).toContainEqual(
      expect.objectContaining({ user_id: me.uid, instant: false, source: 'app' }),
    );

    // Realtime is told to drop the account's connections.
    const disconnects = await h.pool.query(
      "SELECT 1 FROM rt_outbox WHERE kind = 'disconnect' AND channel LIKE '%' || $1",
      [me.uid],
    );
    expect(disconnects.rowCount).toBeGreaterThan(0);

    // The session that asked is gone with every other one.
    const [oldSession] = await h.cmd(me, 'update_profile', { name: 'Still here' });
    expect(oldSession).toBe(401);

    // Signing in again reaches the same, closed account: nothing works but looking and restoring.
    const back = await h.signInAgain(number);
    expect(back.uid).toBe(me.uid);
    const [refused, refusal] = await h.cmd(back, 'update_profile', { name: 'Nope' });
    expect(refused).toBe(403);
    expect(refusal.error?.code).toBe('ACCOUNT_CLOSED');
    const [, account] = await h.get(back, '/v1/me/account');
    expect(account.status).toBe('closed');
    expect(account.deletion).toHaveProperty('purge_at');

    const [restoreStatus, restored] = await h.cmd(back, 'restore_account', {});
    expect(restoreStatus).toBe(200);
    expect(restored.result).toMatchObject({ status: before });
    expect(await status(me.uid)).toBe(before);
    const [worksAgain] = await h.cmd(back, 'update_profile', { name: 'Winston again' });
    expect(worksAgain).toBe(200);
    const names = await h.rows<{ display_name: string }>(
      'SELECT display_name FROM users WHERE id = $1',
      [me.uid],
    );
    expect(names[0]?.display_name).toBe('Winston again');
    const [, open] = await h.get(back, '/v1/me/account');
    expect(open).toMatchObject({ status: before, deletion: null });
  });

  it('hands a trip-less crew to the next member and parks the push tokens until a restore', async () => {
    const number = phone();
    const me = await h.registered(number);
    const friend = await h.anonymous();
    const crewId = await shareCrew(me, friend);
    await h.rows(
      `WITH d AS (INSERT INTO devices (id, user_id, platform, app_version, locale, tz)
                  VALUES (uuidv7(), $1, 'ios', '1.0.0', 'en', 'Asia/Singapore') RETURNING id)
       INSERT INTO push_tokens (device_id, kind, token, env)
       SELECT id, 'apns_alert', 'token-' || id, 'sandbox' FROM d`,
      [me.uid],
    );

    await h.cmd(me, 'request_account_deletion', {});
    const roles = await h.rows<{ user_id: string; role: string }>(
      'SELECT user_id, role FROM crew_members WHERE crew_id = $1',
      [crewId],
    );
    expect(roles.find((row) => row.user_id === friend.uid)?.role).toBe('organiser');
    const parked = await h.rows<{ invalid_reason: string | null }>(
      `SELECT t.invalid_reason FROM push_tokens t JOIN devices d ON d.id = t.device_id
        WHERE d.user_id = $1`,
      [me.uid],
    );
    expect(parked).toEqual([{ invalid_reason: 'account_closed' }]);

    const back = await h.signInAgain(number);
    await h.cmd(back, 'restore_account', {});
    const live = await h.rows<{ invalid_at: Date | null }>(
      `SELECT t.invalid_at FROM push_tokens t JOIN devices d ON d.id = t.device_id
        WHERE d.user_id = $1`,
      [me.uid],
    );
    expect(live).toEqual([{ invalid_at: null }]);
    // Still a member of the crew, as before the close.
    const membership = await h.rows<{ status: string }>(
      'SELECT status FROM crew_members WHERE crew_id = $1 AND user_id = $2',
      [crewId, me.uid],
    );
    expect(membership).toEqual([{ status: 'active' }]);
  });

  it('gives an account nobody can sign back into no grace: its purge is queued at once', async () => {
    const me = await h.anonymous();
    const [code, closed] = await h.cmd(me, 'request_account_deletion', {});
    expect([code, closed.error]).toEqual([200, undefined]);
    expect(closed.result).toMatchObject({ instant: true, contact: { kind: 'none' } });
    const queued = await h.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pgboss.job
        WHERE name = 'account.purge' AND data->>'user_id' = $1`,
      [me.uid],
    );
    expect(queued.rows[0]?.n).toBe(1);
  });

  it('refuses a restore when nothing is closed', async () => {
    const me = await h.registered(phone());
    const [code, body] = await h.cmd(me, 'restore_account', {});
    expect(code).toBe(409);
    expect(body.error).toMatchObject({ code: 'STATE_INVALID', detail: { reason: 'not_closed' } });
  });
});

describe('POST /v1/me/deletion/purge-now', () => {
  it('erases the account, frees the phone number, and leaves the crew to the others', async () => {
    const number = phone();
    const me = await h.registered(number);
    const friend = await h.anonymous();
    await h.cmd(me, 'update_profile', { name: 'Winston', username: 'winston.t' });
    await h.cmd(me, 'add_past_trip', {
      past_trip_id: '0192f000-0000-7000-8000-00000000a001',
      country: 'JP',
      month: '2024-04',
    });
    const crewId = await shareCrew(me, friend);

    const [code, body] = await h.post(me, '/v1/me/deletion/purge-now');
    expect([code, body.error]).toEqual([200, undefined]);
    expect(body).toMatchObject({ purged: true, user_id: me.uid });
    expect(typeof body.deletion_id).toBe('string');
    expect(Number.isNaN(Date.parse(String(body.purged_at)))).toBe(false);

    // The old session is gone, and the old account is a nameless former member.
    const [oldSession] = await h.get(me, '/v1/me/account');
    expect(oldSession).toBe(401);
    const old = await h.rows(
      'SELECT status, display_name, username::text AS username FROM users WHERE id = $1',
      [me.uid],
    );
    expect(old).toEqual([{ status: 'purged', display_name: null, username: null }]);
    expect(await h.rows('SELECT 1 FROM past_trips WHERE user_id = $1', [me.uid])).toEqual([]);
    const authUser = await h.pool.query('SELECT 1 FROM auth."user" WHERE id = $1', [me.uid]);
    expect(authUser.rows).toEqual([]);
    const sessions = await h.pool.query('SELECT 1 FROM auth.session WHERE user_id = $1', [me.uid]);
    expect(sessions.rows).toEqual([]);

    // The crew is still the friend's; the leaver's code and invite no longer open it.
    const members = await h.rows<{ user_id: string; status: string }>(
      'SELECT user_id, status FROM crew_members WHERE crew_id = $1',
      [crewId],
    );
    expect(members.find((row) => row.user_id === me.uid)?.status).toBe('former');
    expect(members.find((row) => row.user_id === friend.uid)?.status).toBe('active');
    const codes = await h.rows<{ status: string }>(
      'SELECT status FROM join_codes WHERE created_by = $1',
      [me.uid],
    );
    expect(codes).toEqual([{ status: 'revoked' }]);
    const invites = await h.rows<{ status: string }>(
      'SELECT status FROM invites WHERE inviter_id = $1',
      [me.uid],
    );
    expect(invites).toEqual([{ status: 'revoked' }]);

    // The same phone number now makes a brand-new account that inherits nothing.
    const fresh = await h.registered(number);
    expect(fresh.uid).not.toBe(me.uid);
    const again = await h.signInAgain(number);
    expect(again.uid).toBe(fresh.uid);
    const [, account] = await h.get(fresh, '/v1/me/account');
    expect(account).toMatchObject({ deletion: null });
    expect(account.status).not.toBe('purged');
    for (const [table, column] of [
      ['crew_members', 'user_id'],
      ['past_trips', 'user_id'],
      ['stamps', 'user_id'],
      ['passes', 'user_id'],
      ['collection_entries', 'user_id'],
      ['notifications', 'user_id'],
      ['inbox_items', 'user_id'],
      ['account_deletions', 'user_id'],
    ] as const) {
      const rows = await h.rows(`SELECT 1 FROM ${table} WHERE ${column} = $1`, [fresh.uid]);
      expect(rows, `${table} for the new account`).toEqual([]);
    }
    const [takeName] = await h.cmd(fresh, 'update_profile', { username: 'winston.t' });
    expect(takeName).toBe(200);
  });

  it('erases an anonymous account too, and one already closed', async () => {
    const anon = await h.anonymous();
    const [anonCode, anonBody] = await h.post(anon, '/v1/me/deletion/purge-now');
    expect([anonCode, anonBody.error]).toEqual([200, undefined]);
    expect(await status(anon.uid)).toBe('purged');

    const number = phone();
    const me = await h.registered(number);
    await h.cmd(me, 'request_account_deletion', {});
    const back = await h.signInAgain(number);
    const [code] = await h.post(back, '/v1/me/deletion/purge-now');
    expect(code).toBe(200);
    expect(await status(me.uid)).toBe('purged');
    expect(await h.events('account.purged')).toContainEqual(
      expect.objectContaining({ forced: true }),
    );
  });

  it('needs a session', async () => {
    const [code, body] = await h.post({ cookie: '', uid: '' }, '/v1/me/deletion/purge-now');
    expect(code).toBe(401);
    expect(body.error?.code).toBe('AUTH_REQUIRED');
  });
});

describe('POST /v1/me/deletion/purge-now in production', () => {
  let production: AccountHarness;

  beforeAll(async () => {
    production = await startAccountHarness({ appEnv: 'production' });
  }, 240_000);

  afterAll(async () => {
    await production.stop();
  });

  it('is refused, and the account is untouched', async () => {
    const me = await production.anonymous();
    const [code, body] = await production.post(me, '/v1/me/deletion/purge-now');
    expect(code).toBe(403);
    expect(body.error).toMatchObject({ code: 'FORBIDDEN', detail: { reason: 'production' } });
    const rows = await production.rows<{ status: string }>(
      'SELECT status FROM users WHERE id = $1',
      [me.uid],
    );
    expect(rows[0]?.status).toBe('anonymous');
    const [stillIn] = await production.get(me, '/v1/me/account');
    expect(stillIn).toBe(200);
    expect(
      await production.rows('SELECT 1 FROM account_deletions WHERE user_id = $1', [me.uid]),
    ).toEqual([]);
  });
});
