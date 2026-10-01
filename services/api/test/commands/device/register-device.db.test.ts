/**
 * `register_device` through the real `/v1/cmd` door: upserts the caller's install and its provider
 * token, heartbeats `last_seen_at`, moves an install (and revokes the previous owner's action keys
 * for it) when another uid signs in on it, and moves a token between installs so the previous
 * owner can no longer be reached through it.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerDeviceCommands } from '../../../src/commands/device';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../../routes/command-doors-harness';

let harness: CommandDoorsHarness;

beforeAll(async () => {
  harness = await startCommandDoors(registerDeviceCommands);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

function register(
  session: SignedIn,
  deviceId: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const op = envelope(
    'register_device',
    { platform: 'ios', tz: 'Asia/Ho_Chi_Minh', locale: 'en', app_version: '1.0.0', ...payload },
    {
      device: { id: deviceId, platform: 'ios', app_version: '1.0.0', tz: 'Asia/Ho_Chi_Minh' },
    },
  );
  return harness.request('/v1/cmd/register_device', {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify(op),
  });
}

async function deviceRow(id: string) {
  const { rows } = await withSystem(harness.pool, (tx) =>
    tx.query<{ user_id: string; tz: string; foreground: boolean; last_seen_at: Date }>(
      'SELECT user_id, tz, foreground, last_seen_at FROM devices WHERE id = $1',
      [id],
    ),
  );
  return rows[0];
}

async function tokenRows(token: string) {
  const { rows } = await withSystem(harness.pool, (tx) =>
    tx.query<{ device_id: string; kind: string; env: string; invalid_at: Date | null }>(
      'SELECT device_id, kind, env, invalid_at FROM push_tokens WHERE token = $1',
      [token],
    ),
  );
  return rows;
}

describe('register_device', () => {
  it('upserts the install and its APNs token, then heartbeats on the next call', async () => {
    const session = await harness.signInAnonymously();
    const deviceId = randomUUID();
    const token = `apns-${randomUUID()}`;

    const first = await register(session, deviceId, { push_token: token, apns_env: 'sandbox' });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      status: 'applied',
      result: { device_id: deviceId, device_moved: false },
    });
    const before = await deviceRow(deviceId);
    expect(before).toMatchObject({ user_id: session.uid, tz: 'Asia/Ho_Chi_Minh' });
    expect(await tokenRows(token)).toEqual([
      { device_id: deviceId, kind: 'apns_alert', env: 'sandbox', invalid_at: null },
    ]);

    const second = await register(session, deviceId, { foreground: true, tz: 'Europe/Berlin' });
    expect(second.status).toBe(200);
    const after = await deviceRow(deviceId);
    expect(after).toMatchObject({ tz: 'Europe/Berlin', foreground: true });
    expect(after!.last_seen_at.getTime()).toBeGreaterThanOrEqual(before!.last_seen_at.getTime());
  });

  it('accepts a renamed zone and stores the name Postgres knows', async () => {
    const session = await harness.signInAnonymously();
    const deviceId = randomUUID();
    const response = await register(session, deviceId, { tz: 'Asia/Saigon' });
    expect(response.status).toBe(200);
    expect((await deviceRow(deviceId))?.tz).toBe('Asia/Ho_Chi_Minh');
  });

  it('rejects an envelope whose device id is not an install uuid', async () => {
    const session = await harness.signInAnonymously();
    const response = await register(session, 'device-1', {});
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION' } });
  });

  it('invalidates the previous token when the device registers a rotated one', async () => {
    const session = await harness.signInAnonymously();
    const deviceId = randomUUID();
    const oldToken = `fcm-${randomUUID()}`;
    const newToken = `fcm-${randomUUID()}`;
    await register(session, deviceId, { platform: 'android', push_token: oldToken });
    await register(session, deviceId, { platform: 'android', push_token: newToken });

    const [old] = await tokenRows(oldToken);
    expect(old?.invalid_at).toBeInstanceOf(Date);
    expect(await tokenRows(newToken)).toEqual([
      { device_id: deviceId, kind: 'fcm', env: 'prod', invalid_at: null },
    ]);
  });

  it('moves a token registered by another uid to the caller, detaching it from the old uid', async () => {
    const alice = await harness.signInAnonymously();
    const bob = await harness.signInAnonymously();
    const aliceDevice = randomUUID();
    const bobDevice = randomUUID();
    const token = `apns-${randomUUID()}`;

    await register(alice, aliceDevice, { push_token: token });
    const moved = await register(bob, bobDevice, { push_token: token });
    expect(moved.status).toBe(200);

    expect(await tokenRows(token)).toEqual([
      { device_id: bobDevice, kind: 'apns_alert', env: 'prod', invalid_at: null },
    ]);
    const { rows } = await withSystem(harness.pool, (tx) =>
      tx.query(
        `SELECT 1 FROM push_tokens t JOIN devices d ON d.id = t.device_id
         WHERE d.user_id = $1 AND t.invalid_at IS NULL`,
        [alice.uid],
      ),
    );
    expect(rows).toEqual([]);
  });

  it('moves an install to a new uid and revokes the old uid’s action keys for it', async () => {
    const alice = await harness.signInAnonymously();
    const bob = await harness.signInAnonymously();
    const deviceId = randomUUID();
    await register(alice, deviceId, {});
    const keyId = randomUUID();
    await withSystem(harness.pool, (tx) =>
      tx.query(
        `INSERT INTO device_action_keys (key_id, device_id, user_id, secret_enc, scopes, expires_at)
         VALUES ($1, $2, $3, 'enc', ARRAY['ballot'], now() + interval '30 days')`,
        [keyId, deviceId, alice.uid],
      ),
    );

    const response = await register(bob, deviceId, {});
    expect(await response.json()).toMatchObject({
      status: 'applied',
      result: { device_id: deviceId, device_moved: true },
    });
    expect((await deviceRow(deviceId))?.user_id).toBe(bob.uid);
    const { rows } = await withSystem(harness.pool, (tx) =>
      tx.query<{ revoked_at: Date | null }>(
        'SELECT revoked_at FROM device_action_keys WHERE key_id = $1',
        [keyId],
      ),
    );
    expect(rows[0]?.revoked_at).toBeInstanceOf(Date);
  });

  it('mirrors device-scheduled notifications into the ledger once each', async () => {
    const session = await harness.signInAnonymously();
    const deviceId = randomUUID();
    const alarm = { id: randomUUID(), key: 'leave_by_alarm', fire_at: '2026-09-27T23:50:00Z' };
    const reminder = {
      id: randomUUID(),
      key: 'critter_window_reminder',
      fire_at: '2026-09-28T01:00:00Z',
    };
    // 23:50 UTC is 06:50 on the 28th in Ho Chi Minh City: both land on the same local date.
    await register(session, deviceId, { local_scheduled: [alarm, reminder] });
    await register(session, deviceId, { local_scheduled: [alarm] });

    const { rows } = await withSystem(harness.pool, (tx) =>
      tx.query<{ local_date: string; sent_local: number }>(
        'SELECT local_date::text, sent_local FROM ping_ledger WHERE user_id = $1',
        [session.uid],
      ),
    );
    expect(rows).toEqual([{ local_date: '2026-09-28', sent_local: 2 }]);
    const unknown = await register(session, deviceId, {
      local_scheduled: [{ ...alarm, id: randomUUID(), key: 'not_a_key' }],
    });
    expect(unknown.status).toBe(422);
  });
});
