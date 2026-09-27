/**
 * An envelope the Swift store wrote (the shared fixture) goes through the drain and the upload
 * queue to the real api harness (`/sync/upload`) and is applied exactly once, however many times
 * it reaches the queue.
 */
import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';

import { openTestLocalFirst, TEST_DEVICE } from '../../powersync/test-support/local-first-fixture';
import { nodeFetch } from '../../powersync/test-support/node-realm';
import { removeDir, tempDatabaseDir } from '../../powersync/test-support/open-node-database';
import { eventually } from '../../powersync/test-support/queue-fixtures';
import { startApiHarness, type ApiHarness } from '../../powersync/test-support/start-api-harness';
import { createFetchTransport } from '../../powersync/transport';
import { drainExtensionOutbox } from '../drain-extension-outbox';
import { fileOutbox, SWIFT_STORE_FIXTURE } from '../test-support/file-outbox';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('../../powersync/test-support/node-realm')
      .powersyncCommon,
);

const fixture = JSON.parse(readFileSync(SWIFT_STORE_FIXTURE, 'utf8')) as {
  actions: [{ op_id: string; payload: { crew_id: string } }];
};
const [entry] = fixture.actions;

let api: ApiHarness;

beforeAll(async () => {
  api = await startApiHarness();
}, 240_000);

afterAll(async () => {
  await api.stop();
});

describe('extension outbox against the api', () => {
  it('uploads an envelope from the Swift store once and empties the file', async () => {
    const session = await api.signInAnonymously();
    const stack = await openTestLocalFirst({
      uid: session.uid,
      transport: createFetchTransport({
        baseUrl: api.baseUrl,
        sessionHeaders: () => Promise.resolve({ cookie: session.cookie }),
        fetch: nodeFetch,
      }),
    });
    const outboxDir = tempDatabaseDir();
    const outbox = fileOutbox(outboxDir);
    const options = {
      db: stack.db,
      outbox,
      uid: () => session.uid,
      device: () => Promise.resolve(TEST_DEVICE),
      queue: stack.value.queue,
    };
    const statusOf = async () =>
      (
        await stack.db.getOptional<{ status: string }>('SELECT status FROM commands WHERE id = ?', [
          entry.op_id,
        ])
      )?.status;
    try {
      outbox.append(entry);
      await expect(drainExtensionOutbox(options)).resolves.toEqual({ queued: 1, dropped: 0 });
      expect(outbox.entries()).toEqual([]);
      await eventually(async () => (await statusOf()) === 'done');
      expect(await api.crewCount(entry.payload.crew_id)).toBe(1);

      // The file still held the entry after a crash, and reconcile has since dropped the local row:
      // it is queued and sent again, and the server answers from its log instead of re-running it.
      await stack.db.execute('DELETE FROM commands WHERE id = ?', [entry.op_id]);
      outbox.append(entry);
      await expect(drainExtensionOutbox(options)).resolves.toEqual({ queued: 1, dropped: 0 });
      await eventually(async () => (await statusOf()) === 'done');
      expect(await api.crewCount(entry.payload.crew_id)).toBe(1);
      expect(await stack.db.getAll('SELECT id FROM rejected_commands')).toEqual([]);
    } finally {
      await stack.close();
      removeDir(stack.dir);
      removeDir(outboxDir);
    }
  }, 60_000);
});
