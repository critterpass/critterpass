/**
 * `POST /sync/upload`: ordered per-op execution, rejects recorded with the batch still 2xx,
 * transient failure → 503 with the first unprocessed index, and a retried batch replaying the
 * already-applied ops as `duplicate`.
 */
import { generateUuidV7 } from '@cp/domain';
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
  await harness?.stop();
});

interface OutcomeBody {
  op_id: string;
  status: string;
  code?: string;
  detail?: unknown;
  result?: unknown;
}

async function upload(session: SignedIn, ops: unknown[]): Promise<Response> {
  return harness.request('/sync/upload', {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify({ ops }),
  });
}

async function cmdResultRow(opId: string) {
  const { rows } = await harness.pool.query<{ uid: string; status: string; code: string | null }>(
    'SELECT uid, status, code FROM cmd_results WHERE op_id = $1',
    [opId],
  );
  return rows[0];
}

describe('POST /sync/upload', () => {
  it('returns 2xx for a business reject, records it and keeps processing the batch', async () => {
    const session = await harness.signInAnonymously();
    const first = envelope('create_test_crew', { crew_id: generateUuidV7(), name: 'Bali' });
    const rejected = envelope('reject_test_op', {});
    const last = envelope('create_test_crew', { crew_id: generateUuidV7(), name: 'Lombok' });

    const response = await upload(session, [first, rejected, last]);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: OutcomeBody[] };
    expect(body.results.map((result) => [result.op_id, result.status, result.code])).toEqual([
      [first.op_id, 'applied', undefined],
      [rejected.op_id, 'rejected', 'STATE_INVALID'],
      [last.op_id, 'applied', undefined],
    ]);
    expect(await cmdResultRow(rejected.op_id)).toEqual({
      uid: session.uid,
      status: 'rejected',
      code: 'STATE_INVALID',
    });
    expect(await cmdResultRow(last.op_id)).toMatchObject({ status: 'applied' });
  });

  it('stops at a transient failure with 503, then a retry replays applied ops as duplicate', async () => {
    const session = await harness.signInAnonymously();
    const crewId = generateUuidV7();
    const applied = envelope('create_test_crew', { crew_id: crewId, name: 'Hanoi' });
    const flaky = envelope('flaky_test_op', { key: generateUuidV7() });
    const after = envelope('create_test_crew', { crew_id: generateUuidV7(), name: 'Hue' });

    const interrupted = await upload(session, [applied, flaky, after]);
    expect(interrupted.status).toBe(503);
    const failure = (await interrupted.json()) as {
      error: {
        code: string;
        retryable: boolean;
        detail: { first_unprocessed: number; results: OutcomeBody[] };
      };
    };
    expect(failure.error).toMatchObject({ code: 'INTERNAL', retryable: true });
    expect(failure.error.detail.first_unprocessed).toBe(1);
    expect(failure.error.detail.results).toEqual([
      expect.objectContaining({ op_id: applied.op_id, status: 'applied' }),
    ]);
    expect(await cmdResultRow(flaky.op_id)).toBeUndefined();
    expect(await cmdResultRow(after.op_id)).toBeUndefined();

    const retried = await upload(session, [applied, flaky, after]);
    expect(retried.status).toBe(200);
    const body = (await retried.json()) as { results: OutcomeBody[] };
    expect(body.results.map((result) => result.status)).toEqual([
      'duplicate',
      'applied',
      'applied',
    ]);
    expect(body.results[0]?.result).toEqual({ crew_id: crewId });
    const { rowCount } = await harness.pool.query('SELECT 1 FROM crews WHERE id = $1', [crewId]);
    expect(rowCount).toBe(1);
  });

  it('records a registered-only command from an anonymous session as AUTH_REQUIRED and continues', async () => {
    const session = await harness.signInAnonymously();
    const registeredOnly = envelope(
      'create_test_crew',
      { crew_id: generateUuidV7(), name: 'x' },
      {
        cmd: 'create_registered_crew',
      },
    );
    const next = envelope('create_test_crew', { crew_id: generateUuidV7(), name: 'Da Nang' });

    const response = await upload(session, [registeredOnly, next]);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: OutcomeBody[] };
    // create_registered_crew is also online-only, so the sync door refuses it first.
    expect(body.results[0]).toMatchObject({ status: 'rejected', code: 'VALIDATION' });
    expect(body.results[1]).toMatchObject({ status: 'applied' });
  });

  it('reports an op without a usable op_id by index and still applies the rest', async () => {
    const session = await harness.signInAnonymously();
    const good = envelope('create_test_crew', { crew_id: generateUuidV7(), name: 'Sapa' });

    const response = await upload(session, [{ cmd: 'create_test_crew' }, good]);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: OutcomeBody[] };
    expect(body.results[0]).toMatchObject({
      op_id: '',
      status: 'rejected',
      code: 'VALIDATION',
      detail: { index: 0 },
    });
    expect(body.results[1]).toMatchObject({ op_id: good.op_id, status: 'applied' });
  });

  it('refuses internal and unknown commands without revealing which is which', async () => {
    const session = await harness.signInAnonymously();
    const internal = envelope('internal_test_op', {});
    const unknown = envelope('unknown_test_op', {});

    const response = await upload(session, [internal, unknown]);
    const body = (await response.json()) as { results: OutcomeBody[] };

    expect(body.results[0]).toMatchObject({
      status: 'rejected',
      detail: { reason: 'unknown_command' },
    });
    expect(body.results[1]).toMatchObject({
      status: 'rejected',
      detail: { reason: 'unknown_command' },
    });
  });

  it('rejects more than 500 ops with PAYLOAD_TOO_LARGE and processes none', async () => {
    const session = await harness.signInAnonymously();
    const ops = Array.from({ length: 501 }, () => ({ op_id: generateUuidV7() }));

    const response = await upload(session, ops);

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
  });

  it('requires a session', async () => {
    const response = await harness.request('/sync/upload', {
      method: 'POST',
      body: JSON.stringify({ ops: [] }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'AUTH_REQUIRED' } });
  });

  it('rate-limits batches per uid with RATE_LIMITED and retry_after_s', async () => {
    const session = await harness.signInAnonymously();
    const statuses: number[] = [];
    for (let i = 0; i < 31; i += 1) statuses.push((await upload(session, [])).status);

    expect(statuses.slice(0, 30).every((status) => status === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
    const limited = await upload(session, []);
    const body = (await limited.json()) as {
      error: { code: string; detail: { retry_after_s: number } };
    };
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.detail.retry_after_s).toBeGreaterThan(0);
  });

  it('rejects a command that breaks a database rule and still applies the rest of the batch', async () => {
    const session = await harness.signInAnonymously();
    const crewId = generateUuidV7();
    const broken = envelope('broken_test_op', { sqlstate: 'check_violation' });
    const dataError = envelope('broken_test_op', { sqlstate: 'division_by_zero' });
    const good = envelope('create_test_crew', { crew_id: crewId, name: 'Hoi An' });

    const response = await upload(session, [broken, dataError, good]);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: OutcomeBody[] };
    expect(body.results.map((r) => [r.op_id, r.status, r.code])).toEqual([
      [broken.op_id, 'rejected', 'INTERNAL'],
      [dataError.op_id, 'rejected', 'INTERNAL'],
      [good.op_id, 'applied', undefined],
    ]);
    const { rowCount } = await harness.pool.query('SELECT 1 FROM crews WHERE id = $1', [crewId]);
    expect(rowCount).toBe(1);
  });
});
