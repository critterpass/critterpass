/**
 * The `cp.chat` notification actions through `/v1/actions` with a device action key: REPLY runs
 * `send_message` and a repeated REPLY (same op id) creates exactly one message; READ runs
 * `mark_read`. A key without the `chat_reply` scope is refused.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerChatCommands } from '../../src/commands/chat';
import { registerCrewCommands } from '../../src/commands/crews';
import {
  signedHeaders,
  startActionDoors,
  type ActionDoorsHarness,
  type SignedIn,
} from '../routes/action-doors-harness';
import { envelope } from '../routes/command-doors-harness';

let harness: ActionDoorsHarness;

beforeAll(async () => {
  harness = await startActionDoors();
  registerCrewCommands(harness.registry);
  registerChatCommands(harness.registry);
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

interface IssuedKey {
  key_id: string;
  secret: string;
}

async function install(
  session: SignedIn,
  scopes: string[],
): Promise<{ deviceId: string; key: IssuedKey }> {
  const deviceId = randomUUID();
  const registered = await harness.request('/v1/cmd/register_device', {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify(
      envelope(
        'register_device',
        { platform: 'ios', tz: 'UTC', locale: 'en', app_version: '1.0.0' },
        { device: { id: deviceId, platform: 'ios', app_version: '1.0.0', tz: 'UTC' } },
      ),
    ),
  });
  expect(registered.status).toBe(200);
  const issued = await harness.request(`/v1/devices/${deviceId}/action-keys`, {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify({ scopes }),
  });
  expect(issued.status).toBe(201);
  return { deviceId, key: (await issued.json()) as IssuedKey };
}

function act(key: IssuedKey, deviceId: string, cmd: string, payload: unknown, opId: string) {
  const body = JSON.stringify(
    envelope(cmd, payload, {
      op_id: opId,
      actor: { uid: randomUUID(), via: 'notif_action' },
      device: { id: deviceId, platform: 'ios', app_version: '1.0.0', tz: 'UTC' },
    }),
  );
  return harness.request('/v1/actions', {
    method: 'POST',
    headers: signedHeaders(key, 'POST', '/v1/actions', body),
    body,
  });
}

async function crewWith(member: SignedIn): Promise<string> {
  const crewId = generateUuidV7();
  await withSystem(harness.pool, async (tx) => {
    await tx.query("INSERT INTO crews (id, name, created_by) VALUES ($1, 'Bali', $2)", [
      crewId,
      member.uid,
    ]);
    await tx.query(
      "INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'organiser')",
      [crewId, member.uid],
    );
  });
  return crewId;
}

describe('cp.chat actions', () => {
  it('REPLY sends once however often the action is retried, READ marks read', async () => {
    const session = await harness.signInAnonymously();
    const crewId = await crewWith(session);
    const { deviceId, key } = await install(session, ['chat_reply']);
    const opId = generateUuidV7();
    const reply = { crew_id: crewId, body: 'On my way' };

    const first = await act(key, deviceId, 'send_message', reply, opId);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ status: 'applied', result: { message_id: opId } });
    const again = await act(key, deviceId, 'send_message', reply, opId);
    expect(await again.json()).toMatchObject({ status: 'duplicate' });
    const { rows } = await harness.pool.query<{ seq: string }>(
      "SELECT seq FROM messages WHERE crew_id = $1 AND sender_kind = 'user'",
      [crewId],
    );
    expect(rows).toHaveLength(1);

    const read = await act(
      key,
      deviceId,
      'mark_read',
      { crew_id: crewId, seq: Number(rows[0]!.seq) },
      generateUuidV7(),
    );
    expect(await read.json()).toMatchObject({
      status: 'applied',
      result: { last_read_seq: Number(rows[0]!.seq) },
    });
  });

  it('refuses a key without the chat_reply scope', async () => {
    const session = await harness.signInAnonymously();
    const crewId = await crewWith(session);
    const { deviceId, key } = await install(session, ['ballot']);
    const response = await act(
      key,
      deviceId,
      'send_message',
      { crew_id: crewId, body: 'hi' },
      generateUuidV7(),
    );
    expect(response.status).toBe(403);
  });
});
