/**
 * One voter, every surface: a ballot cast in the app (`/v1/cmd`), changed from the vote widget and
 * changed back from a notification action (both `/v1/actions` with a device key scoped to
 * `ballot`), and a retried action, all land on one ballot row that carries the last answer and the
 * surface it came from. A key without the `ballot` scope is refused.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerCrewCommands } from '../../src/commands/crews';
import { registerPollCommands } from '../../src/commands/polls';
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
  registerPollCommands(harness.registry);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

interface IssuedKey {
  key_id: string;
  secret: string;
}

interface Device {
  readonly deviceId: string;
  readonly key: IssuedKey;
}

async function install(session: SignedIn, scopes: string[]): Promise<Device> {
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

function inApp(session: SignedIn, cmd: string, payload: unknown, opId = generateUuidV7()) {
  return harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify(
      envelope(cmd, payload, { op_id: opId, actor: { uid: session.uid, via: 'app' } }),
    ),
  });
}

function fromSurface(
  device: Device,
  via: 'widget' | 'notif_action',
  payload: unknown,
  opId = generateUuidV7(),
) {
  const body = JSON.stringify(
    envelope('cast_ballot', payload, {
      op_id: opId,
      actor: { uid: randomUUID(), via },
      device: { id: device.deviceId, platform: 'ios', app_version: '1.0.0', tz: 'UTC' },
    }),
  );
  return harness.request('/v1/actions', {
    method: 'POST',
    headers: signedHeaders(device.key, 'POST', '/v1/actions', body),
    body,
  });
}

async function crewOf(members: readonly SignedIn[]): Promise<string> {
  const [organiser] = members;
  const crewId = generateUuidV7();
  const created = await inApp(organiser!, 'create_crew', { crew_id: crewId, name: 'Vote crew' });
  expect(created.status).toBe(200);
  await withSystem(harness.pool, async (tx) => {
    for (const member of members.slice(1)) {
      await tx.query(
        "INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'member')",
        [crewId, member.uid],
      );
    }
  });
  return crewId;
}

async function ballotsOf(pollId: string) {
  const { rows } = await harness.pool.query<{
    user_id: string;
    option_id: string;
    source: string;
  }>('SELECT user_id, option_id, source FROM ballots WHERE poll_id = $1', [pollId]);
  return rows;
}

describe('one ballot across surfaces', { timeout: 120_000 }, () => {
  it('keeps one ballot per voter with the last answer and the surface it came from', async () => {
    const members = [
      await harness.signInAnonymously(),
      await harness.signInAnonymously(),
      await harness.signInAnonymously(),
    ];
    const [voter, other] = members as [SignedIn, SignedIn, SignedIn];
    const crewId = await crewOf(members);
    const pollId = generateUuidV7();
    const created = await inApp(voter, 'create_poll', {
      poll_id: pollId,
      crew_id: crewId,
      kind: 'generic',
      question: 'Which beach?',
      options: [{ label: 'North' }, { label: 'South' }],
    });
    expect(created.status).toBe(200);
    const { rows: options } = await harness.pool.query<{ id: string }>(
      'SELECT id FROM poll_options WHERE poll_id = $1 ORDER BY position',
      [pollId],
    );
    const [north, south] = options.map((row) => row.id) as [string, string];
    const widget = await install(voter, ['ballot']);
    const notification = await install(voter, ['ballot']);

    expect((await inApp(voter, 'cast_ballot', { poll_id: pollId, option_id: north })).status).toBe(
      200,
    );
    const changed = await fromSurface(widget, 'widget', { poll_id: pollId, option_id: south });
    expect(await changed.json()).toMatchObject({ status: 'applied' });
    const actionOp = generateUuidV7();
    const back = await fromSurface(
      notification,
      'notif_action',
      { poll_id: pollId, option_id: north },
      actionOp,
    );
    expect(await back.json()).toMatchObject({ status: 'applied' });
    const retried = await fromSurface(
      notification,
      'notif_action',
      { poll_id: pollId, option_id: north },
      actionOp,
    );
    expect(await retried.json()).toMatchObject({ status: 'duplicate' });
    expect((await inApp(other, 'cast_ballot', { poll_id: pollId, option_id: south })).status).toBe(
      200,
    );

    const ballots = await ballotsOf(pollId);
    expect(ballots).toHaveLength(2);
    expect(ballots.find((row) => row.user_id === voter.uid)).toMatchObject({
      option_id: north,
      source: 'notification',
    });
    expect(ballots.find((row) => row.user_id === other.uid)).toMatchObject({ option_id: south });
    const { rows: poll } = await harness.pool.query<{ status: string }>(
      'SELECT status FROM polls WHERE id = $1',
      [pollId],
    );
    expect(poll[0]?.status).toBe('open');
  });

  it('refuses a ballot from a key without the ballot scope', async () => {
    const session = await harness.signInAnonymously();
    const device = await install(session, ['chat_reply']);
    const response = await fromSurface(device, 'widget', {
      poll_id: generateUuidV7(),
      option_id: generateUuidV7(),
    });
    expect(response.status).toBe(403);
  });
});
