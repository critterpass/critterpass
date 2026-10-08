/**
 * The PowerSync connector's credentials and upload hooks, the backoff curve, and the queue's
 * response handling that the api harness cannot produce on demand (`SESSION_REVOKED`, rate limits,
 * batches refused for good).
 * Server responses are built with the domain's own wire serializer (`DomainError#toResponseBody`,
 * what services/api returns), at the transport boundary.
 */
import { DomainError, type ErrorCode } from '@cp/domain';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { createSyncConnector } from '../connector';
import {
  installKey,
  MemoryKeyStore,
  openNodeDatabase,
  removeDir,
  tempDatabaseDir,
} from '../test-support/open-node-database';
import {
  commandRows,
  enqueue,
  eventually,
  queueWith,
  TEST_BACKOFF,
  stopQueues,
} from '../test-support/queue-fixtures';
import type { SyncTransport, TransportResponse } from '../transport';
import { backoffDelayMs, HOLD_AFTER_REFUSED_ALONE } from '../upload-queue';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('../test-support/node-realm').powersyncCommon,
);

const UID = '0190f5a4-0000-7000-8000-00000000aaaa';

function serverError(code: ErrorCode, detail?: unknown): TransportResponse {
  const error = new DomainError(code, detail);
  return { status: error.http, body: error.toResponseBody() };
}

function answering(...responses: TransportResponse[]): SyncTransport & { calls: number } {
  const transport = {
    calls: 0,
    postJson() {
      const response = responses[Math.min(transport.calls, responses.length - 1)];
      transport.calls += 1;
      return Promise.resolve(response!);
    },
  };
  return transport;
}

/**
 * A server that refuses a whole batch with `refuse(ids, call)`'s code and applies every other
 * batch; `sent` holds each request's op ids and `applied` the ids it accepted, in order.
 */
function refusing(refuse: (ids: readonly string[], call: number) => ErrorCode | null) {
  const server = {
    sent: [] as string[][],
    applied: [] as string[],
    postJson(_path: string, body: unknown): Promise<TransportResponse> {
      const ids = (body as { ops: { op_id: string }[] }).ops.map((op) => op.op_id);
      server.sent.push(ids);
      const code = refuse(ids, server.sent.length);
      if (code !== null) return Promise.resolve(serverError(code));
      server.applied.push(...ids);
      return Promise.resolve({
        status: 200,
        body: { results: ids.map((id) => ({ op_id: id, status: 'applied' })) },
      });
    },
  };
  return server;
}

function rejectedCodes(db: AbstractPowerSyncDatabase) {
  return db.getAll<{ id: string; code: string }>(
    'SELECT id, code FROM rejected_commands ORDER BY rejected_at, id',
  );
}

describe('sync connector', () => {
  it('hands PowerSync the service endpoint and a fresh aud=sync token', async () => {
    const connector = createSyncConnector({
      endpoint: 'https://sync.example.test',
      getSyncToken: () => Promise.resolve('jwt-for-sync'),
      flushCommands: () => Promise.resolve(),
    });
    await expect(connector.fetchCredentials()).resolves.toEqual({
      endpoint: 'https://sync.example.test',
      token: 'jwt-for-sync',
    });
  });

  it('flushes the command queue whenever PowerSync asks for an upload', async () => {
    let flushes = 0;
    const connector = createSyncConnector({
      endpoint: 'https://sync.example.test',
      getSyncToken: () => Promise.resolve('t'),
      flushCommands: () => {
        flushes += 1;
        return Promise.resolve();
      },
    });
    await connector.uploadData({} as AbstractPowerSyncDatabase);
    expect(flushes).toBe(1);
  });
});

describe('backoff', () => {
  const policy = { baseMs: 1_000, maxMs: 300_000, random: () => 1 };

  it('doubles per consecutive failure up to the cap', () => {
    expect([1, 2, 3, 4, 5].map((n) => backoffDelayMs(n, policy))).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000,
    ]);
    expect(backoffDelayMs(20, policy)).toBe(300_000);
  });

  it('jitters within the upper half of the delay', () => {
    expect(backoffDelayMs(3, { ...policy, random: () => 0 })).toBe(2_000);
    expect(backoffDelayMs(3, { ...policy, random: () => 0.5 })).toBe(3_000);
  });
});

describe('upload queue responses', () => {
  let db: AbstractPowerSyncDatabase;
  let dir: string;

  beforeEach(async () => {
    dir = tempDatabaseDir();
    db = await openNodeDatabase({ dir, key: await installKey(new MemoryKeyStore()) });
  });

  afterEach(async () => {
    await stopQueues();
    await db.close();
    removeDir(dir);
  });

  it('stops and hands over to the sign-out hooks on SESSION_REVOKED', async () => {
    await enqueue(db, UID, 'create_test_crew', {});
    const transport = answering(serverError('SESSION_REVOKED'));
    let revoked = 0;
    const queue = queueWith(db, transport, () => {
      revoked += 1;
      return Promise.resolve();
    });

    await queue.flush();

    expect(revoked).toBe(1);
    expect(transport.calls).toBe(1);
    expect(queue.getState()).toMatchObject({ failures: 0, nextRetryAt: null });
  });

  it('waits at least as long as a RATE_LIMITED retry_after_s asks', async () => {
    const opId = await enqueue(db, UID, 'create_test_crew', {});
    const queue = queueWith(db, answering(serverError('RATE_LIMITED', { retry_after_s: 7 })));

    await queue.flush();

    expect(queue.getState()).toMatchObject({ failures: 1, retryDelayMs: 7_000 });
    expect(queue.getState().lastError).toBe('RATE_LIMITED');
    expect(await commandRows(db)).toEqual([{ id: opId, status: 'queued', attempts: 1 }]);
  });

  it('keeps an op queued when the session is missing (AUTH_REQUIRED) and backs off', async () => {
    const opId = await enqueue(db, UID, 'create_test_crew', {});
    const queue = queueWith(db, answering(serverError('AUTH_REQUIRED')));

    await queue.flush();

    expect(queue.getState()).toMatchObject({ failures: 1, retryDelayMs: TEST_BACKOFF.baseMs });
    expect(await commandRows(db)).toEqual([{ id: opId, status: 'queued', attempts: 1 }]);
  });

  it('holds on a refusal that is not about the batch: nothing fails, no timer resends it, nothing overtakes it', async () => {
    const first = await enqueue(db, UID, 'create_test_crew', {});
    const server = refusing((_ids, call) => (call === 1 ? 'FORBIDDEN' : null));
    const queue = queueWith(db, server);

    await queue.flush();

    expect(queue.getState()).toMatchObject({
      sending: false,
      refused: 'FORBIDDEN',
      lastError: 'FORBIDDEN',
      nextRetryAt: null,
    });
    expect(await commandRows(db)).toEqual([{ id: first, status: 'queued', attempts: 1 }]);
    expect(await rejectedCodes(db)).toEqual([]);

    // A newer op waits behind the held one, well past the point a backoff would have fired.
    const second = await enqueue(db, UID, 'create_test_crew', {});
    queue.schedule();
    await new Promise((resolve) => setTimeout(resolve, TEST_BACKOFF.baseMs * 8));
    expect(server.sent).toEqual([[first]]);

    await queue.retryNow();

    expect(server.sent).toEqual([[first], [first, second]]);
    expect(queue.getState()).toMatchObject({ refused: null, failures: 0, lastError: null });
    expect((await commandRows(db)).map((row) => row.status)).toEqual(['done', 'done']);
  });

  it.each(['VALIDATION', 'PAYLOAD_TOO_LARGE'] as const)(
    'fails alone the one write that draws %s and sends its neighbours in order',
    async (code) => {
      const ids: string[] = [];
      for (let n = 0; n < 5; n += 1) ids.push(await enqueue(db, UID, 'create_test_crew', {}));
      const poisoned = ids[2]!;
      const server = refusing((batch) => (batch.includes(poisoned) ? code : null));
      const queue = queueWith(db, server);

      await queue.flush();

      // The refusal was pinned on the op by sending it alone, and only then was it failed.
      expect(server.sent).toContainEqual([poisoned]);
      expect(await rejectedCodes(db)).toEqual([{ id: poisoned, code }]);
      expect(server.applied).toEqual(ids.filter((id) => id !== poisoned));
      expect(await commandRows(db)).toEqual(
        server.applied.map((id) => expect.objectContaining({ id, status: 'done' })),
      );
      expect(queue.getState()).toMatchObject({ refused: null, failures: 0, nextRetryAt: null });
    },
  );

  it('stops failing writes and holds when three in a row are refused alone', async () => {
    const ids: string[] = [];
    for (let n = 0; n < 5; n += 1) ids.push(await enqueue(db, UID, 'create_test_crew', {}));
    // A server that turns every batch down, whatever it holds.
    let down = true;
    const server = refusing(() => (down ? 'VALIDATION' : null));
    const queue = queueWith(db, server);

    await queue.flush();

    const failed = ids.slice(0, HOLD_AFTER_REFUSED_ALONE - 1);
    const kept = ids.slice(HOLD_AFTER_REFUSED_ALONE - 1);
    const heldRows = kept.map((id) => expect.objectContaining({ id, status: 'queued' }));
    expect(queue.getState()).toMatchObject({ refused: 'VALIDATION', nextRetryAt: null });
    expect((await rejectedCodes(db)).map((row) => row.id).sort()).toEqual([...failed].sort());
    expect(await commandRows(db)).toEqual(heldRows);

    // No timer asks again; asking again fails nothing more while the server still refuses.
    const asked = server.sent.length;
    await new Promise((resolve) => setTimeout(resolve, TEST_BACKOFF.baseMs * 8));
    expect(server.sent).toHaveLength(asked);
    await queue.retryNow();
    expect(queue.getState().refused).toBe('VALIDATION');
    expect(await rejectedCodes(db)).toHaveLength(failed.length);
    expect(await commandRows(db)).toEqual(heldRows);

    down = false;
    await queue.retryNow();

    expect(server.applied).toEqual(kept);
    expect(queue.getState()).toMatchObject({ refused: null, failures: 0, lastError: null });
    expect((await commandRows(db)).map((row) => row.status)).toEqual(kept.map(() => 'done'));
  });

  it('starts the count again once the server accepts a batch', async () => {
    const ids: string[] = [];
    for (let n = 0; n < 7; n += 1) ids.push(await enqueue(db, UID, 'create_test_crew', {}));
    // Two bad writes, a good one, two more bad ones: four refusals, never three in a row.
    const bad = [ids[0]!, ids[1]!, ids[3]!, ids[4]!];
    const server = refusing((batch) =>
      batch.some((id) => bad.includes(id)) ? 'PAYLOAD_TOO_LARGE' : null,
    );
    const queue = queueWith(db, server);

    await queue.flush();

    expect((await rejectedCodes(db)).map((row) => row.id).sort()).toEqual([...bad].sort());
    expect(server.applied).toEqual(ids.filter((id) => !bad.includes(id)));
    expect(queue.getState().refused).toBeNull();
  });

  it('sends a smaller batch, oldest ops first, when the server says the batch is too large', async () => {
    const ids: string[] = [];
    for (let n = 0; n < 4; n += 1) ids.push(await enqueue(db, UID, 'create_test_crew', {}));
    const server = refusing((batch) => (batch.length > 2 ? 'PAYLOAD_TOO_LARGE' : null));
    const queue = queueWith(db, server);

    await queue.flush();

    expect(server.sent).toEqual([ids, ids.slice(0, 2), ids.slice(2)]);
    expect(queue.getState()).toMatchObject({ refused: null, failures: 0, nextRetryAt: null });
    expect((await commandRows(db)).map((row) => row.status)).toEqual(Array(4).fill('done'));
  });

  it('clears the failure and the pending retry by the time a retried op is seen done', async () => {
    const opId = await enqueue(db, UID, 'create_test_crew', {});
    const transport = answering(serverError('INTERNAL'), {
      status: 200,
      body: { results: [{ op_id: opId, status: 'applied' }] },
    });
    const queue = queueWith(db, transport);
    // What any reader of the database sees, the moment the op's row turns `done`.
    const seenWhenDone: unknown[] = [];
    const stopWatching = db.onChange(
      {
        onChange: async () => {
          const rows = await commandRows(db);
          if (rows.length > 0 && rows.every((row) => row.status === 'done')) {
            const { failures, nextRetryAt, retryDelayMs, lastError } = queue.getState();
            seenWhenDone.push({ failures, nextRetryAt, retryDelayMs, lastError });
          }
        },
      },
      { tables: ['commands'], throttleMs: 0 },
    );

    await queue.flush();
    expect(queue.getState()).toMatchObject({ failures: 1, lastError: 'INTERNAL' });
    await eventually(() => Promise.resolve(seenWhenDone.length > 0));
    stopWatching();

    const clean = { failures: 0, nextRetryAt: null, retryDelayMs: null, lastError: null };
    expect(seenWhenDone[0]).toEqual(clean);
    expect(queue.getState()).toMatchObject(clean);
    expect(transport.calls).toBe(2);
  });

  it('never marks ops done from a 2xx that carries no outcomes', async () => {
    const opId = await enqueue(db, UID, 'create_test_crew', {});
    const queue = queueWith(db, answering({ status: 200, body: { results: [] } }));

    await queue.flush();

    expect(queue.getState().lastError).toBe('MISSING_RESULT');
    expect(await commandRows(db)).toEqual([{ id: opId, status: 'queued', attempts: 1 }]);
  });
});
