/**
 * `POST /v1/cmd/{cmd}` and `GET /v1/cmd-results`: synchronous outcomes with the code's own HTTP
 * status, anonymous sessions limited to commands that allow them, replay as `duplicate`, the
 * caller-only results feed with keyset pagination, and the routes' presence in `/openapi.json`.
 */
import { generateUuidV7 } from '@cp/domain';
import { Validator } from '@seriousme/openapi-schema-validator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from './command-doors-harness';
import { registerTestCommands } from './test-commands';

let harness: CommandDoorsHarness;

beforeAll(async () => {
  harness = await startCommandDoors(registerTestCommands);
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

function send(session: SignedIn | undefined, cmd: string, body: unknown): Promise<Response> {
  return harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: session !== undefined ? { cookie: session.cookie } : {},
    body: JSON.stringify(body),
  });
}

describe('POST /v1/cmd/{cmd}', () => {
  it('applies a command with 200 and replays the same op_id as duplicate', async () => {
    const session = await harness.signInAnonymously();
    const crewId = generateUuidV7();
    const op = envelope('create_test_crew', { crew_id: crewId, name: 'Bali' });

    const first = await send(session, 'create_test_crew', op);
    const replay = await send(session, 'create_test_crew', op);

    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      op_id: op.op_id,
      status: 'applied',
      result: { crew_id: crewId },
    });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({
      op_id: op.op_id,
      status: 'duplicate',
      result: { crew_id: crewId },
    });
  });

  it('returns a reject as the error envelope with its HTTP status and records it', async () => {
    const session = await harness.signInAnonymously();
    const op = envelope('reject_test_op', {});

    const response = await send(session, 'reject_test_op', op);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: 'STATE_INVALID',
        message: 'STATE_INVALID',
        retryable: false,
        detail: { state: 'closed' },
      },
    });
    const { rows } = await harness.pool.query(
      'SELECT status, code FROM cmd_results WHERE op_id = $1',
      [op.op_id],
    );
    expect(rows).toEqual([{ status: 'rejected', code: 'STATE_INVALID' }]);

    const replay = await send(session, 'reject_test_op', op);
    expect(replay.status).toBe(409);
  });

  it('returns IDEMPOTENCY_MISMATCH (409) for a reused op_id with another payload', async () => {
    const session = await harness.signInAnonymously();
    const op = envelope('create_test_crew', { crew_id: generateUuidV7(), name: 'Hue' });
    await send(session, 'create_test_crew', op);

    const response = await send(session, 'create_test_crew', {
      ...op,
      payload: { crew_id: generateUuidV7(), name: 'Hue' },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'IDEMPOTENCY_MISMATCH' } });
  });

  it('allows an anonymous session only where the command allows it', async () => {
    const session = await harness.signInAnonymously();
    const refused = await send(
      session,
      'create_registered_crew',
      envelope('create_registered_crew', { crew_id: generateUuidV7(), name: 'x' }),
    );
    expect(refused.status).toBe(401);
    expect(await refused.json()).toMatchObject({
      error: { code: 'AUTH_REQUIRED', detail: { reason: 'registered_only' } },
    });

    await harness.promoteToRegistered(session.uid);
    const allowed = await send(
      session,
      'create_registered_crew',
      envelope('create_registered_crew', { crew_id: generateUuidV7(), name: 'x' }),
    );
    expect(allowed.status).toBe(200);
  });

  it('acts as the session uid whatever actor.uid the envelope claims', async () => {
    const session = await harness.signInAnonymously();
    const crewId = generateUuidV7();
    const op = envelope(
      'create_test_crew',
      { crew_id: crewId, name: 'x' },
      {
        actor: { uid: generateUuidV7(), via: 'app' },
      },
    );

    expect((await send(session, 'create_test_crew', op)).status).toBe(200);
    const { rows } = await harness.pool.query<{ created_by: string }>(
      'SELECT created_by FROM crews WHERE id = $1',
      [crewId],
    );
    expect(rows[0]?.created_by).toBe(session.uid);
  });

  it('rejects a body whose cmd differs from the path, a malformed envelope, and internal commands', async () => {
    const session = await harness.signInAnonymously();
    const mismatch = await send(
      session,
      'reject_test_op',
      envelope('create_test_crew', { crew_id: generateUuidV7(), name: 'x' }),
    );
    const malformed = await send(session, 'create_test_crew', { cmd: 'create_test_crew' });
    const internal = await send(session, 'internal_test_op', envelope('internal_test_op', {}));

    expect(mismatch.status).toBe(422);
    expect(await mismatch.json()).toMatchObject({
      error: { code: 'VALIDATION', detail: { reason: 'cmd_path_mismatch' } },
    });
    expect(malformed.status).toBe(422);
    expect(internal.status).toBe(422);
    expect(await internal.json()).toMatchObject({
      error: { detail: { reason: 'unknown_command' } },
    });
  });

  it('requires a session', async () => {
    const response = await send(
      undefined,
      'create_test_crew',
      envelope('create_test_crew', { crew_id: generateUuidV7(), name: 'x' }),
    );
    expect(response.status).toBe(401);
  });
});

describe('GET /v1/cmd-results', () => {
  interface Page {
    items: Array<{ op_id: string; status: string; code: string | null; server_ts: string }>;
    next_cursor: string | null;
  }

  async function page(session: SignedIn, query: string): Promise<Page> {
    const response = await harness.request(`/v1/cmd-results${query}`, {
      headers: { cookie: session.cookie },
    });
    expect(response.status).toBe(200);
    return (await response.json()) as Page;
  }

  it("pages through only the caller's own outcomes, oldest first", async () => {
    const session = await harness.signInAnonymously();
    const other = await harness.signInAnonymously();
    const opIds: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const op = envelope('create_test_crew', { crew_id: generateUuidV7(), name: `c${i}` });
      await send(session, 'create_test_crew', op);
      opIds.push(op.op_id);
    }
    const rejected = envelope('reject_test_op', {});
    await send(session, 'reject_test_op', rejected);
    opIds.push(rejected.op_id);
    await send(other, 'reject_test_op', envelope('reject_test_op', {}));

    const first = await page(session, '?limit=3');
    expect(first.items.map((item) => item.op_id)).toEqual(opIds.slice(0, 3));
    expect(first.next_cursor).not.toBeNull();

    const second = await page(session, `?limit=3&cursor=${first.next_cursor ?? ''}`);
    expect(second.items).toEqual([
      expect.objectContaining({ op_id: rejected.op_id, status: 'rejected', code: 'STATE_INVALID' }),
    ]);
    expect(second.next_cursor).toBeNull();

    const sinceThird = await page(
      session,
      `?since=${encodeURIComponent(first.items[2]?.server_ts ?? '')}`,
    );
    expect(sinceThird.items.map((item) => item.op_id)).toEqual([rejected.op_id]);
  });

  it('rejects a tampered cursor with VALIDATION', async () => {
    const session = await harness.signInAnonymously();
    const response = await harness.request('/v1/cmd-results?cursor=bm90LWpzb24', {
      headers: { cookie: session.cookie },
    });
    expect(response.status).toBe(422);
  });
});

describe('GET /openapi.json', () => {
  it('lists the three command routes in a valid OpenAPI 3.1 document', async () => {
    const response = await harness.request('/openapi.json');
    const document = (await response.json()) as { paths: Record<string, unknown> };
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining(['/v1/cmd/{cmd}', '/sync/upload', '/v1/cmd-results']),
    );
    const validation = await new Validator().validate(document);
    expect(validation.errors ?? []).toEqual([]);
  });
});
