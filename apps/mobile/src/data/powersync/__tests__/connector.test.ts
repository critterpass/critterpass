/**
 * The PowerSync connector's credentials and upload hooks, the backoff curve, and the queue's
 * response handling that the api harness cannot produce on demand (`SESSION_REVOKED`, rate limits).
 * Server responses are built with the domain's own wire serializer (`DomainError#toResponseBody`,
 * what services/api returns), at the transport boundary.
 */
import { DomainError, type ErrorCode } from '@cp/domain';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { createSyncConnector, resolvePowerSyncUrl } from '../connector';
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
import { backoffDelayMs } from '../upload-queue';

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

  it('defaults to the production sync service only in production', () => {
    expect(resolvePowerSyncUrl('production')).toBe('https://sync.critterpass.app');
    expect(resolvePowerSyncUrl('development')).toBe('https://powersync-api-staging.up.railway.app');
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
