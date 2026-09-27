/**
 * The upload queue against the real api: the command-door harness (Testcontainers Postgres +
 * Redis, Better Auth, `/sync/upload`) served over loopback HTTP, and an encrypted local database.
 * Ordered upload, rejects that never block the queue, transient failures retried from the first
 * unprocessed op with exponential backoff, and every op applied exactly once.
 */
import { generateUuidV7 } from '@cp/domain';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { nodeFetch } from '../test-support/node-realm';
import { createFetchTransport, type SyncTransport } from '../transport';
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
} from '../test-support/queue-fixtures';
import { startApiHarness, type ApiHarness } from '../test-support/start-api-harness';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('../test-support/node-realm').powersyncCommon,
);

let api: ApiHarness;
let db: AbstractPowerSyncDatabase;
let dir: string;
let session: { cookie: string; uid: string };

beforeAll(async () => {
  api = await startApiHarness();
}, 240_000);

afterAll(async () => {
  await api.stop();
});

beforeEach(async () => {
  dir = tempDatabaseDir();
  db = await openNodeDatabase({ dir, key: await installKey(new MemoryKeyStore()) });
  session = await api.signInAnonymously();
});

afterEach(async () => {
  await db.close();
  removeDir(dir);
});

function realTransport(): SyncTransport {
  return createFetchTransport({
    baseUrl: api.baseUrl,
    sessionHeaders: () => Promise.resolve({ cookie: session.cookie }),
    fetch: nodeFetch,
  });
}

async function serverOrder(): Promise<string[]> {
  const response = await nodeFetch(`${api.baseUrl}/v1/cmd-results`, {
    headers: { cookie: session.cookie },
  });
  const page = (await response.json()) as { items: { op_id: string }[] };
  return page.items.map((item) => item.op_id);
}

const crew = (name: string) => ({ crew_id: generateUuidV7(), name });

describe('upload queue → POST /sync/upload', () => {
  it('uploads in insertion order and keeps going past a reject', async () => {
    const a = crew('Bali');
    const b = crew('Lombok');
    const first = await enqueue(db, session.uid, 'create_test_crew', a);
    const rejected = await enqueue(db, session.uid, 'reject_test_op', {});
    const last = await enqueue(db, session.uid, 'create_test_crew', b);

    await queueWith(db, realTransport()).flush();

    expect(await commandRows(db)).toEqual([
      { id: first, status: 'done', attempts: 1 },
      { id: last, status: 'done', attempts: 1 },
    ]);
    expect(await db.getAll('SELECT id, cmd, code FROM rejected_commands')).toEqual([
      { id: rejected, cmd: 'reject_test_op', code: 'STATE_INVALID' },
    ]);
    expect(await serverOrder()).toEqual([first, rejected, last]);
    expect(await api.crewCount(a.crew_id)).toBe(1);
    expect(await api.crewCount(b.crew_id)).toBe(1);
  });

  it('retries a transient failure from the first unprocessed op, applying each op once', async () => {
    const a = crew('Hanoi');
    const b = crew('Hue');
    const first = await enqueue(db, session.uid, 'create_test_crew', a);
    const flaky = await enqueue(db, session.uid, 'flaky_test_op', { key: generateUuidV7() });
    const last = await enqueue(db, session.uid, 'create_test_crew', b);
    const queue = queueWith(db, realTransport());

    await queue.flush();

    expect(queue.getState()).toMatchObject({ failures: 1, retryDelayMs: TEST_BACKOFF.baseMs });
    expect(await commandRows(db)).toEqual([
      { id: first, status: 'done', attempts: 1 },
      { id: flaky, status: 'queued', attempts: 1 },
      { id: last, status: 'queued', attempts: 1 },
    ]);

    await eventually(async () => (await commandRows(db)).every((row) => row.status === 'done'));
    expect(await commandRows(db)).toEqual([
      { id: first, status: 'done', attempts: 1 },
      { id: flaky, status: 'done', attempts: 2 },
      { id: last, status: 'done', attempts: 2 },
    ]);
    expect(queue.getState()).toMatchObject({ failures: 0, nextRetryAt: null });
    expect(await serverOrder()).toEqual([first, flaky, last]);
    expect(await api.crewCount(a.crew_id)).toBe(1);
    expect(await api.crewCount(b.crew_id)).toBe(1);
  });

  it('backs off exponentially while offline, then sends everything when the network returns', async () => {
    const a = crew('Da Nang');
    const first = await enqueue(db, session.uid, 'create_test_crew', a);
    let online = false;
    // Nothing listens on port 9 (discard): a real refused connection, not a simulated one.
    const offline = createFetchTransport({
      baseUrl: 'http://127.0.0.1:9',
      sessionHeaders: () => Promise.resolve({}),
      fetch: nodeFetch,
    });
    const real = realTransport();
    const queue = queueWith(db, {
      postJson: (path, body) => (online ? real : offline).postJson(path, body),
    });
    const delays: number[] = [];
    queue.subscribe((state) => {
      if (state.retryDelayMs !== null && delays.at(-1) !== state.retryDelayMs) {
        delays.push(state.retryDelayMs);
      }
    });

    await queue.flush();
    await eventually(() => Promise.resolve(delays.length >= 4));
    expect(delays.slice(0, 4)).toEqual([20, 40, 80, 160]);
    expect(await commandRows(db)).toMatchObject([{ id: first, status: 'queued' }]);

    online = true;
    await queue.retryNow();

    expect(await commandRows(db)).toMatchObject([{ id: first, status: 'done' }]);
    expect(queue.getState()).toMatchObject({ failures: 0, nextRetryAt: null });
    expect(await api.crewCount(a.crew_id)).toBe(1);
  });

  it('replays an op whose response was lost, or which was in flight at a restart, as a duplicate', async () => {
    const a = crew('Sapa');
    const b = crew('Ha Giang');
    const lost = await enqueue(db, session.uid, 'create_test_crew', a);
    const real = realTransport();
    let dropNextResponse = true;
    const queue = queueWith(db, {
      async postJson(path, body) {
        const response = await real.postJson(path, body);
        if (dropNextResponse) {
          dropNextResponse = false;
          throw new Error('connection reset after the server answered');
        }
        return response;
      },
    });

    await queue.flush();
    expect(await commandRows(db)).toMatchObject([{ id: lost, status: 'queued' }]);
    await queue.retryNow();
    expect(await commandRows(db)).toMatchObject([{ id: lost, status: 'done', attempts: 2 }]);

    const inFlight = await enqueue(db, session.uid, 'create_test_crew', b);
    await real.postJson('/sync/upload', {
      ops: [
        JSON.parse(
          (
            await db.get<{ envelope: string }>('SELECT envelope FROM commands WHERE id = ?', [
              inFlight,
            ])
          ).envelope,
        ) as unknown,
      ],
    });
    await db.execute(`UPDATE commands SET status = 'sending' WHERE id = ?`, [inFlight]);
    await queueWith(db, real).flush();

    expect(await commandRows(db)).toMatchObject([
      { id: lost, status: 'done' },
      { id: inFlight, status: 'done' },
    ]);
    expect(await api.crewCount(a.crew_id)).toBe(1);
    expect(await api.crewCount(b.crew_id)).toBe(1);
  });
});
