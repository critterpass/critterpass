/**
 * `referral.evaluate` against a real migrated Postgres, as app_system: a verified, attested referee
 * who organises a trip qualifies and both people get one referral stamp, once; an unverified one
 * only reaches `joined`; a second account on an install the referrer used is void; the referrer's
 * 30-day velocity voids the 21st; paused rewards and a missing pass hold the stamps back.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { evaluateReferrals } from '../../../src/jobs/referrals/evaluate';
import { startJobsHarness, type JobsHarness } from '../../helpers/jobs-harness';

let harness: JobsHarness;
let crewId: string;
let passNumber = 1000;

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await harness.pool.query(sql, params)).rows as T[];
}

async function person(options: { verified?: boolean; pass?: boolean } = {}): Promise<string> {
  const id = randomUUID();
  await q('INSERT INTO users (id, status) VALUES ($1, $2)', [
    id,
    options.verified === false ? 'anonymous' : 'registered',
  ]);
  if (options.pass !== false) {
    passNumber += 1;
    await q(`INSERT INTO passes (user_id, number) VALUES ($1, $2)`, [id, `CP-${passNumber}`]);
  }
  return id;
}

async function attestedDevice(uid: string): Promise<string> {
  const device = randomUUID();
  await q(
    `INSERT INTO devices (id, user_id, platform, app_version, locale, tz)
     VALUES ($1, $2, 'ios', '1.0.0', 'en', 'Asia/Singapore')`,
    [device, uid],
  );
  await q(
    `INSERT INTO device_attestations (install_id, platform, key_id, public_key, verdict)
     VALUES ($1, 'ios', $2, 'pk', 'production')`,
    [device, `key-${device}`],
  );
  return device;
}

/** A referee who joined the crew and organises a trip, on an attested install. */
async function activeReferee(options: { verified?: boolean; pass?: boolean } = {}) {
  const uid = await person(options);
  const device = await attestedDevice(uid);
  await q('INSERT INTO crew_members (crew_id, user_id) VALUES ($1, $2)', [crewId, uid]);
  const [trip] = await q<{ id: string }>(
    "INSERT INTO trips (crew_id, status) VALUES ($1, 'setup') RETURNING id",
    [crewId],
  );
  await q(
    "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'organiser', 'in')",
    [trip!.id, uid],
  );
  return { uid, device };
}

async function refer(referrer: string, referee: string, device: string | null): Promise<string> {
  const [row] = await q<{ id: string }>(
    `INSERT INTO referrals (referrer_id, referee_id, via, status, referee_device_id)
     VALUES ($1, $2, 'invite', 'joined', $3) RETURNING id`,
    [referrer, referee, device],
  );
  return row!.id;
}

const referral = (id: string) =>
  q<{ status: string; void_reason: string | null; reward_kind: string | null }>(
    'SELECT status, void_reason, reward_kind FROM referrals WHERE id = $1',
    [id],
  );
const referralStamps = (uid: string) =>
  q<{ n: number }>(
    "SELECT count(*)::int AS n FROM stamps WHERE user_id = $1 AND kind = 'referral'",
    [uid],
  );

beforeAll(async () => {
  harness = await startJobsHarness();
  const owner = await person();
  const [crew] = await q<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Refs', $1) RETURNING id",
    [owner],
  );
  crewId = crew!.id;
  await q('UPDATE crews SET member_ceiling = 100 WHERE id = $1', [crewId]);
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

describe('referral.evaluate', () => {
  it('qualifies an active, verified referee and stamps both people exactly once', async () => {
    const referrer = await person();
    const referee = await activeReferee();
    const id = await refer(referrer, referee.uid, referee.device);
    await evaluateReferrals(harness.pool);
    expect(await referral(id)).toEqual([
      { status: 'qualified', void_reason: null, reward_kind: 'stamp' },
    ]);
    await evaluateReferrals(harness.pool);
    expect(await referralStamps(referrer)).toEqual([{ n: 1 }]);
    expect(await referralStamps(referee.uid)).toEqual([{ n: 1 }]);
  });

  it('keeps an unverified referee at joined', async () => {
    const referrer = await person();
    const referee = await activeReferee({ verified: false });
    const id = await refer(referrer, referee.uid, referee.device);
    await evaluateReferrals(harness.pool);
    expect(await referral(id)).toEqual([
      { status: 'joined', void_reason: null, reward_kind: null },
    ]);
  });

  it('voids a second account on an install the referrer used, and stamps nobody', async () => {
    const referrer = await person();
    const referee = await activeReferee();
    // The install moved to the new account; the referrer's revoked action key still names it.
    await q(
      `INSERT INTO device_action_keys (key_id, device_id, user_id, secret_enc, scopes, expires_at, revoked_at)
       VALUES ($1, $2, $3, 'x', ARRAY['ballot'], now() + interval '1 day', now())`,
      [randomUUID(), referee.device, referrer],
    );
    const id = await refer(referrer, referee.uid, referee.device);
    await evaluateReferrals(harness.pool);
    expect(await referral(id)).toEqual([
      { status: 'void', void_reason: 'self_referral', reward_kind: null },
    ]);
    expect(await referralStamps(referrer)).toEqual([{ n: 0 }]);
  });

  it('voids a referral past the referrer’s 20 qualified in 30 days', async () => {
    const referrer = await person();
    for (let i = 0; i < 20; i += 1) {
      const other = await person();
      await q(
        `INSERT INTO referrals (referrer_id, referee_id, via, status, qualified_at, reward_kind)
         VALUES ($1, $2, 'code', 'qualified', now() - interval '1 day', 'stamp')`,
        [referrer, other],
      );
    }
    const referee = await activeReferee();
    const id = await refer(referrer, referee.uid, referee.device);
    await evaluateReferrals(harness.pool);
    expect(await referral(id)).toEqual([
      { status: 'void', void_reason: 'velocity', reward_kind: null },
    ]);
  });

  it('holds stamps while rewards are paused or a pass is missing, then pays once', async () => {
    const referrer = await person();
    const referee = await activeReferee({ pass: false });
    const id = await refer(referrer, referee.uid, referee.device);
    await q(
      `INSERT INTO ops.ops_config (key, value) VALUES ('referrals.rewards_paused', 'true'::jsonb)`,
    );
    await evaluateReferrals(harness.pool);
    expect(await referral(id)).toEqual([
      { status: 'qualified', void_reason: null, reward_kind: null },
    ]);
    await q("DELETE FROM ops.ops_config WHERE key = 'referrals.rewards_paused'");
    await evaluateReferrals(harness.pool);
    expect(await referralStamps(referrer)).toEqual([{ n: 0 }]);
    await q(`INSERT INTO passes (user_id, number) VALUES ($1, 'CP-9999')`, [referee.uid]);
    await evaluateReferrals(harness.pool);
    expect(await referral(id)).toEqual([
      { status: 'qualified', void_reason: null, reward_kind: 'stamp' },
    ]);
    expect(await referralStamps(referee.uid)).toEqual([{ n: 1 }]);
  });
});
