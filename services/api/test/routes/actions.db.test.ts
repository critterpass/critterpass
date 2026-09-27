/**
 * Device action keys end to end: issue/rotate/revoke through `/v1/devices/{id}/action-keys`, the
 * `/v1/actions` door (valid, clock skew, replay → duplicate, scope miss, revoked key, non-action
 * command, device mismatch) and the extension's `GET /v1/notifications/{id}` read. The signing
 * vector at the bottom is the same one the Swift signer is checked against.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { Validator } from '@seriousme/openapi-schema-validator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  signedHeaders,
  signRequest,
  startActionDoors,
  type ActionDoorsHarness,
  type SignedIn,
} from './action-doors-harness';
import { envelope } from './command-doors-harness';

let harness: ActionDoorsHarness;

beforeAll(async () => {
  harness = await startActionDoors();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

interface IssuedKey {
  key_id: string;
  secret: string;
  scopes: string[];
  expires_at: string;
}

async function registerInstall(session: SignedIn): Promise<string> {
  const deviceId = randomUUID();
  const response = await harness.request('/v1/cmd/register_device', {
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
  expect(response.status).toBe(200);
  return deviceId;
}

function issue(session: SignedIn, deviceId: string, body: object = {}): Promise<Response> {
  return harness.request(`/v1/devices/${deviceId}/action-keys`, {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify(body),
  });
}

async function setup(scopes?: string[]) {
  const session = await harness.signInAnonymously();
  const deviceId = await registerInstall(session);
  const response = await issue(session, deviceId, scopes ? { scopes } : {});
  expect(response.status).toBe(201);
  return { session, deviceId, key: (await response.json()) as IssuedKey };
}

function actionBody(deviceId: string, optionId = 'opt-1', opId?: string): string {
  return JSON.stringify(
    envelope(
      'cast_test_ballot',
      { option_id: optionId },
      {
        actor: { uid: randomUUID(), via: 'notif_action' },
        device: { id: deviceId, platform: 'ios', app_version: '1.0.0', tz: 'UTC' },
        ...(opId ? { op_id: opId } : {}),
      },
    ),
  );
}

function act(key: IssuedKey, body: string, ts?: number): Promise<Response> {
  return harness.request('/v1/actions', {
    method: 'POST',
    headers: signedHeaders(key, 'POST', '/v1/actions', body, ts),
    body,
  });
}

async function errorCode(response: Response): Promise<{ code: string; detail?: unknown }> {
  return ((await response.json()) as { error: { code: string; detail?: unknown } }).error;
}

describe('POST /v1/devices/{id}/action-keys', () => {
  it('issues every scope by default and never for an install the caller does not own', async () => {
    const { key } = await setup();
    expect(key.scopes).toContain('read_notification');
    expect(Buffer.from(key.secret, 'base64url')).toHaveLength(32);

    const stranger = await harness.signInAnonymously();
    const { deviceId } = await setup();
    expect((await issue(stranger, deviceId)).status).toBe(404);
    expect(
      (await harness.request(`/v1/devices/${deviceId}/action-keys`, { method: 'POST', body: '{}' }))
        .status,
    ).toBe(401);
  });

  it('rotates only when fewer than 7 days remain, revoking the old key', async () => {
    const { session, deviceId, key } = await setup(['ballot']);
    const early = await issue(session, deviceId, { rotate_key_id: key.key_id });
    expect(early.status).toBe(409);

    await withSystem(harness.pool, (tx) =>
      tx.query(
        "UPDATE device_action_keys SET expires_at = now() + interval '2 days' WHERE key_id = $1",
        [key.key_id],
      ),
    );
    const rotated = await issue(session, deviceId, { rotate_key_id: key.key_id });
    expect(rotated.status).toBe(201);
    const fresh = (await rotated.json()) as IssuedKey;
    expect(fresh.key_id).not.toBe(key.key_id);
    expect(fresh.scopes).toEqual(['ballot']);
    expect((await act(key, actionBody(deviceId))).status).toBe(403);
    expect((await act(fresh, actionBody(deviceId))).status).toBe(200);
  });
});

describe('POST /v1/actions', () => {
  it('runs a scoped command for the key’s user and replays the same op_id as duplicate', async () => {
    const { deviceId, key } = await setup(['ballot']);
    const body = actionBody(deviceId);
    const first = await act(key, body);
    expect(first.status).toBe(200);
    const applied = (await first.json()) as { op_id: string; status: string; result: unknown };
    expect(applied).toMatchObject({
      status: 'applied',
      result: { option_id: 'opt-1', via: 'notif_action' },
    });

    const replay = await act(key, body);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ status: 'duplicate', op_id: applied.op_id });
    expect(harness.runs.get(applied.op_id)).toBe(1);
  });

  it('refuses a request signed outside the ±300 s window', async () => {
    const { deviceId, key } = await setup(['ballot']);
    const stale = await act(key, actionBody(deviceId), Math.floor(Date.now() / 1000) - 301);
    expect(stale.status).toBe(403);
    expect(await errorCode(stale)).toMatchObject({
      code: 'ACTION_KEY_SCOPE',
      detail: { reason: 'stale_timestamp' },
    });
  });

  it('refuses a key without the command’s scope', async () => {
    const { deviceId, key } = await setup(['readiness']);
    const response = await act(key, actionBody(deviceId));
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toMatchObject({ detail: { reason: 'missing_scope' } });
  });

  it('refuses every key of an install once it is revoked', async () => {
    const { session, deviceId, key } = await setup(['ballot']);
    const revoke = await harness.request(`/v1/devices/${deviceId}/action-keys`, {
      method: 'DELETE',
      headers: { cookie: session.cookie },
    });
    expect(revoke.status).toBe(204);
    const response = await act(key, actionBody(deviceId));
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toMatchObject({ detail: { reason: 'revoked_or_expired' } });
  });

  it('refuses a tampered body, a command that is not an action and another install’s envelope', async () => {
    const { deviceId, key } = await setup();
    const body = actionBody(deviceId);
    const tampered = await harness.request('/v1/actions', {
      method: 'POST',
      headers: signedHeaders(key, 'POST', '/v1/actions', body),
      body: body.replace('opt-1', 'opt-2'),
    });
    expect(await errorCode(tampered)).toMatchObject({ detail: { reason: 'bad_signature' } });

    const notAction = JSON.stringify(
      envelope('register_device', {}, { actor: { uid: randomUUID(), via: 'widget' } }),
    );
    expect(await errorCode(await act(key, notAction))).toMatchObject({
      code: 'ACTION_KEY_SCOPE',
      detail: { reason: 'not_an_action' },
    });

    const otherInstall = await act(key, actionBody(randomUUID()));
    expect(await errorCode(otherInstall)).toMatchObject({ detail: { reason: 'device_mismatch' } });
  });

  it('returns a command reject with its own status', async () => {
    const { deviceId, key } = await setup(['ballot']);
    const response = await act(key, actionBody(deviceId, 'closed'));
    expect(response.status).toBe(409);
    expect(await errorCode(response)).toMatchObject({ code: 'STATE_INVALID' });
  });
});

describe('GET /v1/notifications/{id}', () => {
  async function insertNotification(uid: string): Promise<string> {
    const { rows } = await withSystem(harness.pool, (tx) =>
      tx.query<{ id: string }>(
        `INSERT INTO notifications (user_id, key, category, class, sender, template_id, title, body,
           dedupe_key, local_date, is_private)
         VALUES ($1, 'crew_chat', 'cp.chat', 'budgeted', '{"kind":"member","id":"x","name":"Mai"}',
           'crew_chat', 'Mai', 'See you at 7', $2, CURRENT_DATE, true)
         RETURNING id`,
        [uid, randomUUID()],
      ),
    );
    return rows[0]!.id;
  }

  function read(key: IssuedKey, id: string): Promise<Response> {
    const path = `/v1/notifications/${id}`;
    return harness.request(path, { headers: signedHeaders(key, 'GET', path, '') });
  }

  it('returns the owner’s notification and hides everyone else’s', async () => {
    const { session, key } = await setup(['read_notification']);
    const own = await insertNotification(session.uid);
    const response = await read(key, own);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: own, title: 'Mai', body: 'See you at 7' });

    const stranger = await harness.signInAnonymously();
    expect((await read(key, await insertNotification(stranger.uid))).status).toBe(404);
  });

  it('needs the read_notification scope', async () => {
    const { session, key } = await setup(['ballot']);
    const response = await read(key, await insertNotification(session.uid));
    expect(response.status).toBe(403);
  });
});

describe('GET /openapi.json', () => {
  it('documents the action key routes in a valid OpenAPI 3.1 document', async () => {
    const document = (await (await harness.request('/openapi.json')).json()) as {
      paths: Record<string, unknown>;
    };
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/v1/devices/{id}/action-keys',
        '/v1/actions',
        '/v1/notifications/{id}',
      ]),
    );
    const validation = await new Validator().validate(document);
    expect(validation.errors ?? []).toEqual([]);
  });
});

describe('signing vector shared with the Swift signer', () => {
  it('matches the pinned signatures', () => {
    // A fixed test vector, not a credential: the Swift signer pins the same one.
    const secret = 'q7Hx0vV2m3Yb8n9Kc4ZpL1tRfWsDgJe5AuIoPyTrE6w'; // gitleaks:allow
    const body = '{"cmd":"cast_ballot","payload":{"option_id":"opt-1"}}';
    expect(signRequest(secret, 'POST', '/v1/actions', '1790000000', body)).toBe(
      '4g_Uul1Jv12sqYKgSzP_DXZX4KaxEEM-pHehtnLjN-I',
    );
    expect(
      signRequest(
        secret,
        'GET',
        '/v1/notifications/0192f0c1-7a2b-7c3d-8e4f-a1b2c3d4e5f6',
        '1790000000',
        '',
      ),
    ).toBe('n-XkxVQaZ1atbCwduEhK-VLxFP1CMpCNPZdBWi5XNk4');
  });
});
