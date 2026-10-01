/**
 * `set_notification_prefs` against a migrated Postgres, through `/v1/cmd`: a saved budget lands in
 * the row the notification router reads, a patch changes only what it names, what always gets
 * through cannot be muted, and the spoken read-out needs Pass+ to turn on.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerNotificationPrefsCommands } from '../../src/commands/notification-prefs';
import {
  startActionDoors,
  type ActionDoorsHarness,
  type SignedIn,
} from '../routes/action-doors-harness';
import { envelope } from '../routes/command-doors-harness';

let harness: ActionDoorsHarness;
let maya: SignedIn;
let rin: SignedIn;
const phone = randomUUID();

async function set(who: SignedIn, payload: unknown) {
  const response = await harness.request('/v1/cmd/set_notification_prefs', {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify(
      envelope('set_notification_prefs', payload, {
        op_id: generateUuidV7(),
        actor: { uid: who.uid, via: 'app' },
        device: { id: phone, platform: 'ios', app_version: '1.0.0', tz: 'Asia/Ho_Chi_Minh' },
      }),
    ),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function prefs(uid: string) {
  const rows = await withSystem(harness.pool, async (tx) => {
    const result = await tx.query<Record<string, unknown>>(
      `SELECT budget_per_day, roundup_time::text, roundup_tz, quiet_from::text, quiet_to::text,
              guide_tips, money, critters_nearby, crew_chat_mode, per_category, voice_readout
         FROM notification_prefs WHERE user_id = $1`,
      [uid],
    );
    return result.rows;
  });
  return rows[0];
}

beforeAll(async () => {
  harness = await startActionDoors();
  registerNotificationPrefsCommands(harness.registry);
  [maya, rin] = await Promise.all([harness.signInAnonymously(), harness.signInAnonymously()]);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('set_notification_prefs', () => {
  it('saves a budget of 3 where the router reads it, leaving the defaults alone', async () => {
    const saved = await set(maya, { budget: 3 });
    expect(saved.status).toBe(200);
    expect(saved.body['result']).toMatchObject({ budget: 3, roundup_time: '20:00' });
    expect(await prefs(maya.uid)).toMatchObject({
      budget_per_day: 3,
      roundup_time: '20:00:00',
      guide_tips: true,
      crew_chat_mode: 'all',
      voice_readout: false,
    });
    expect(await prefs(rin.uid)).toBeUndefined();
  });

  it('changes only what a patch names and merges category mutes', async () => {
    await set(maya, {
      roundup_time: '19:30',
      quiet: { from: '23:00', to: '06:30' },
      crew_chat: 'mentions',
      money: false,
      per_category: { 'cp.memory': false },
    });
    await set(maya, { per_category: { 'cp.invite': false, 'cp.memory': true } });
    expect(await prefs(maya.uid)).toMatchObject({
      budget_per_day: 3,
      roundup_time: '19:30:00',
      quiet_from: '23:00:00',
      quiet_to: '06:30:00',
      crew_chat_mode: 'mentions',
      money: false,
      critters_nearby: true,
      per_category: { 'cp.memory': true, 'cp.invite': false },
    });
  });

  it.each([
    ['a budget above 10', { budget: 11 }],
    ['a budget of 0', { budget: 0 }],
    ['a time that is not a clock', { roundup_time: '25:00' }],
    ['muting what always gets through', { per_category: { 'cp.sos': false } }],
    ['an unknown field', { loud: true }],
    ['an empty patch', {}],
  ])('refuses %s', async (_name, payload) => {
    const response = await set(maya, payload);
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION' } });
    expect(await prefs(maya.uid)).toMatchObject({ budget_per_day: 3 });
  });

  it('turns the spoken read-out on only with Pass+, and off for anyone', async () => {
    const refused = await set(rin, { voice_readout: true });
    expect(refused.body).toMatchObject({ error: { code: 'ENTITLEMENT_REQUIRED' } });
    expect((await set(rin, { voice_readout: false })).status).toBe(200);

    await withSystem(harness.pool, (tx) =>
      tx.query(
        `INSERT INTO user_entitlements (user_id, pass_plus) VALUES ($1, true)
         ON CONFLICT (user_id) DO UPDATE SET pass_plus = true`,
        [rin.uid],
      ),
    );
    expect((await set(rin, { voice_readout: true })).status).toBe(200);
    expect(await prefs(rin.uid)).toMatchObject({ voice_readout: true, budget_per_day: 10 });
  });
});
