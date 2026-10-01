/**
 * Install-keyed commands through the real `/v1/cmd` door when the envelope's device id is not the
 * id the install registered under (shipped builds keep two): the command acts on the caller's own
 * registered device on that platform, the newest when there are several, and says so in the log.
 * An envelope id that belongs to someone else, or a caller with no device on the platform, is
 * still refused.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerDeviceCommands } from '../../../src/commands/device';
import { registerLiveActivityCommands } from '../../../src/commands/live-activities';
import { registerLocationCommands } from '../../../src/commands/visits';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../../routes/command-doors-harness';

let harness: CommandDoorsHarness;

beforeAll(async () => {
  harness = await startCommandDoors((registry) => {
    registerDeviceCommands(registry);
    registerLocationCommands(registry);
    registerLiveActivityCommands(registry, { assertOn: () => Promise.resolve() });
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

async function run(
  who: SignedIn,
  cmd: string,
  payload: unknown,
  deviceId: string,
  platform: 'ios' | 'android' = 'ios',
) {
  const response = await harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify(
      envelope(cmd, payload, {
        actor: { uid: who.uid, via: 'app' },
        device: { id: deviceId, platform, app_version: '1.0.0', tz: 'Asia/Ho_Chi_Minh' },
      }),
    ),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function registerPhone(who: SignedIn, platform: 'ios' | 'android' = 'ios'): Promise<string> {
  const installId = randomUUID();
  const registered = await run(
    who,
    'register_device',
    { platform, tz: 'Asia/Ho_Chi_Minh', locale: 'en', app_version: '1.0.0' },
    installId,
    platform,
  );
  expect(registered.status).toBe(200);
  return installId;
}

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

const permissions = (deviceId: string) =>
  q<{ permission_state: unknown; la_enabled: boolean }>(
    'SELECT permission_state, la_enabled FROM devices WHERE id = $1',
    [deviceId],
  );

const PERMS = { notifications: 'granted', la_enabled: true };
const START_TOKEN = { kind: 'push_to_start', activity_type: 'flight', token: 'c'.repeat(64) };

describe('install-keyed commands under an envelope id the install never registered', () => {
  it('mirrors permissions onto the caller’s registered device and logs the stand-in', async () => {
    const maya = await harness.signInAnonymously();
    const installId = await registerPhone(maya);
    const result = await run(maya, 'update_device_permissions', { perms: PERMS }, randomUUID());
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ result: { device_id: installId, changed: true } });
    expect(await permissions(installId)).toEqual([{ permission_state: PERMS, la_enabled: true }]);
    expect(harness.logs).toContainEqual(
      expect.objectContaining({ cmd: 'update_device_permissions', platform: 'ios' }),
    );
  });

  it('stores a Live Activity push-to-start token on the registered device', async () => {
    const maya = await harness.signInAnonymously();
    const installId = await registerPhone(maya);
    const result = await run(maya, 'register_la_token', START_TOKEN, randomUUID());
    expect(result.status).toBe(200);
    expect(
      await q('SELECT activity_type, env FROM la_push_to_start_tokens WHERE device_id = $1', [
        installId,
      ]),
    ).toEqual([{ activity_type: 'flight', env: 'prod' }]);
  });

  it('picks the phone that checked in last when the caller has two', async () => {
    const maya = await harness.signInAnonymously();
    const older = await registerPhone(maya);
    const newer = await registerPhone(maya);
    await q("UPDATE devices SET last_seen_at = now() - interval '2 days' WHERE id = $1", [older]);
    const result = await run(maya, 'update_device_permissions', { perms: PERMS }, randomUUID());
    expect(result.body).toMatchObject({ result: { device_id: newer } });
    expect(await permissions(older)).toEqual([{ permission_state: {}, la_enabled: false }]);
  });

  it('leaves an envelope id that matches a registered device alone', async () => {
    const maya = await harness.signInAnonymously();
    const first = await registerPhone(maya);
    const second = await registerPhone(maya);
    await run(maya, 'update_device_permissions', { perms: PERMS }, first);
    expect(await permissions(first)).toEqual([{ permission_state: PERMS, la_enabled: true }]);
    expect(await permissions(second)).toEqual([{ permission_state: {}, la_enabled: false }]);
  });

  it('still refuses someone else’s install instead of standing in the caller’s own', async () => {
    const [maya, rin] = await Promise.all([
      harness.signInAnonymously(),
      harness.signInAnonymously(),
    ]);
    const mayaPhone = await registerPhone(maya);
    const rinPhone = await registerPhone(rin);
    const token = await run(rin, 'register_la_token', START_TOKEN, mayaPhone);
    expect(token.status).toBe(403);
    const perms = await run(rin, 'update_device_permissions', { perms: PERMS }, mayaPhone);
    expect(perms.status).toBe(404);
    expect(await permissions(rinPhone)).toEqual([{ permission_state: {}, la_enabled: false }]);
    expect(
      await q('SELECT 1 FROM la_push_to_start_tokens WHERE device_id = $1', [rinPhone]),
    ).toEqual([]);
  });

  it('refuses a caller with no registered device on the envelope’s platform', async () => {
    const maya = await harness.signInAnonymously();
    const android = await registerPhone(maya, 'android');
    const result = await run(maya, 'update_device_permissions', { perms: PERMS }, randomUUID());
    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ error: { detail: { reason: 'device_not_registered' } } });
    expect(await permissions(android)).toEqual([{ permission_state: {}, la_enabled: false }]);
  });
});
