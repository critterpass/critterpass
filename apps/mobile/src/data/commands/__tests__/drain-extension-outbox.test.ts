/**
 * Draining the App Group outbox into the upload queue on a real encrypted database, with the
 * outbox on a real directory in the native store's file format (the Swift store's own tests write
 * the same fixture this suite reads).
 */
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { generateUuidV7, setReadinessPayloadSchema } from '@cp/domain';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { resetOnSignOutHooksForTests, runOnSignOutHooks } from '../../auth/sign-out-hooks';
import {
  openTestLocalFirst,
  TEST_DEVICE,
  type TestLocalFirst,
} from '../../powersync/test-support/local-first-fixture';
import { removeDir, tempDatabaseDir } from '../../powersync/test-support/open-node-database';
import {
  drainExtensionOutbox,
  registerExtensionOutboxReset,
  startExtensionOutboxDrain,
  type ExtensionOutbox,
} from '../drain-extension-outbox';
import {
  fileOutbox,
  IM_UP_INTENT_FIXTURE,
  SWIFT_STORE_FIXTURE,
  type FileOutbox,
} from '../test-support/file-outbox';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('../../powersync/test-support/node-realm')
      .powersyncCommon,
);

interface FixtureAction {
  op_id: string;
  cmd: string;
  via: string;
  client_ts: string;
  payload: Record<string, unknown>;
}
const fixture = JSON.parse(readFileSync(SWIFT_STORE_FIXTURE, 'utf8')) as {
  actions: FixtureAction[];
};
const [fixtureAction] = fixture.actions as [FixtureAction];

function action(overrides: Record<string, unknown> = {}) {
  return {
    op_id: generateUuidV7(),
    cmd: 'cast_ballot',
    v: 1,
    via: 'la_intent',
    scope: 'ballot',
    client_ts: new Date().toISOString(),
    payload: { poll_id: 'p1', option_id: 'o2' },
    ...overrides,
  };
}

let stack: TestLocalFirst;
let outboxDir: string;
let outbox: FileOutbox;
let schedules: number;

beforeEach(async () => {
  stack = await openTestLocalFirst({ holdUploads: true });
  outboxDir = tempDatabaseDir();
  outbox = fileOutbox(outboxDir);
  schedules = 0;
});

afterEach(async () => {
  await stack.close();
  removeDir(stack.dir);
  removeDir(outboxDir);
  resetOnSignOutHooksForTests();
});

function drain(source: ExtensionOutbox = outbox) {
  return drainExtensionOutbox({
    db: stack.db,
    outbox: source,
    uid: () => stack.uid,
    device: () => Promise.resolve(TEST_DEVICE),
    queue: { schedule: () => (schedules += 1) },
  });
}

async function queuedEnvelopes() {
  const rows = await stack.db.getAll<{ id: string; envelope: string }>(
    'SELECT id, envelope FROM commands ORDER BY seq',
  );
  return rows.map((row) => ({
    id: row.id,
    envelope: JSON.parse(row.envelope) as Record<string, unknown>,
  }));
}

describe('drainExtensionOutbox', () => {
  it('queues what the Swift store wrote with its op_id and via, then empties the file', async () => {
    for (const entry of fixture.actions) outbox.append(entry);

    await expect(drain()).resolves.toEqual({ queued: 1, dropped: 0 });

    expect(await queuedEnvelopes()).toEqual([
      {
        id: fixtureAction.op_id,
        envelope: {
          op_id: fixtureAction.op_id,
          cmd: fixtureAction.cmd,
          v: 1,
          actor: { uid: stack.uid, via: 'widget' },
          device: TEST_DEVICE,
          client_ts: fixtureAction.client_ts,
          payload: fixtureAction.payload,
        },
      },
    ]);
    expect(outbox.entries()).toEqual([]);
    expect(schedules).toBe(1);
  });

  it("queues the lock-screen I'M UP as set_readiness from the Live Activity", async () => {
    mkdirSync(path.dirname(outbox.file), { recursive: true });
    copyFileSync(IM_UP_INTENT_FIXTURE, outbox.file);
    const [imUp] = (
      JSON.parse(readFileSync(IM_UP_INTENT_FIXTURE, 'utf8')) as {
        actions: [FixtureAction];
      }
    ).actions;

    await expect(drain()).resolves.toEqual({ queued: 1, dropped: 0 });

    const [queued] = await queuedEnvelopes();
    expect(queued).toEqual({
      id: imUp.op_id,
      envelope: {
        op_id: imUp.op_id,
        cmd: 'set_readiness',
        v: 1,
        actor: { uid: stack.uid, via: 'la_intent' },
        device: TEST_DEVICE,
        client_ts: imUp.client_ts,
        payload: imUp.payload,
      },
    });
    expect(setReadinessPayloadSchema.parse(queued?.envelope.payload)).toEqual({
      leave_by_id: imUp.payload.leave_by_id,
      state: 'up',
      source: 'la',
    });
    expect(outbox.entries()).toEqual([]);
  });

  it('never queues an entry twice when the file still holds it after a crash', async () => {
    const entry = action();
    outbox.append(entry);
    const failingRemove: ExtensionOutbox = {
      ...outbox,
      remove: () => {
        throw new Error('app killed before the file was updated');
      },
    };
    await expect(drain(failingRemove)).rejects.toThrow('app killed');
    expect(outbox.entries()).toHaveLength(1);

    await expect(drain()).resolves.toEqual({ queued: 0, dropped: 0 });
    expect((await queuedEnvelopes()).map((row) => row.id)).toEqual([entry.op_id]);
    expect(outbox.entries()).toEqual([]);
  });

  it('keeps an entry an extension appends while the drain runs, for the next drain', async () => {
    const first = action();
    const concurrent = action({ cmd: 'set_readiness', scope: 'readiness', payload: { up: true } });
    outbox.append(first);
    const racing: ExtensionOutbox = {
      ...outbox,
      read: () => {
        const text = outbox.read();
        outbox.append(concurrent);
        return text;
      },
    };

    await expect(drain(racing)).resolves.toEqual({ queued: 1, dropped: 0 });
    expect(outbox.entries()).toEqual([concurrent]);

    await expect(drain()).resolves.toEqual({ queued: 1, dropped: 0 });
    expect((await queuedEnvelopes()).map((row) => row.id)).toEqual([first.op_id, concurrent.op_id]);
    expect(outbox.entries()).toEqual([]);
  });

  it('drops malformed entries from the file and still queues the valid ones', async () => {
    const valid = action();
    outbox.append(action({ via: 'app' }));
    outbox.append(valid);
    outbox.append({ cmd: 'cast_ballot' });

    await expect(drain()).resolves.toEqual({ queued: 1, dropped: 1 });
    expect((await queuedEnvelopes()).map((row) => row.id)).toEqual([valid.op_id]);
    expect(outbox.entries()).toEqual([]);
  });

  it('leaves a file written by a newer schema untouched', async () => {
    const newer = JSON.stringify({ schema: 2, generated_at: 'x', actions: [action()] });
    const source: ExtensionOutbox = {
      read: () => newer,
      remove: () => {
        throw new Error('must not rewrite a newer file');
      },
      clear: () => undefined,
    };

    await expect(drain(source)).resolves.toEqual({ queued: 0, dropped: 0 });
    expect(await queuedEnvelopes()).toEqual([]);
    expect(schedules).toBe(0);
  });

  it('drains on start and on every return to the foreground', async () => {
    const listeners: ((state: string) => void)[] = [];
    const appState = {
      addEventListener: (_type: 'change', listener: (state: string) => void) => {
        listeners.push(listener);
        return { remove: () => listeners.splice(listeners.indexOf(listener), 1) };
      },
    };
    outbox.append(action());
    const stop = startExtensionOutboxDrain({
      db: stack.db,
      outbox,
      uid: () => stack.uid,
      device: () => Promise.resolve(TEST_DEVICE),
      queue: { schedule: () => (schedules += 1) },
      appState,
    });
    await waitForEmpty(outbox);

    outbox.append(action());
    for (const listener of listeners) listener('background');
    expect(outbox.entries()).toHaveLength(1);
    for (const listener of listeners) listener('active');
    await waitForEmpty(outbox);
    expect(await queuedEnvelopes()).toHaveLength(2);

    stop();
    expect(listeners).toHaveLength(0);
  });

  it('clears the outbox when the user signs out', async () => {
    outbox.append(action());
    registerExtensionOutboxReset(outbox);

    await runOnSignOutHooks();

    expect(outbox.entries()).toEqual([]);
  });
});

async function waitForEmpty(target: FileOutbox): Promise<void> {
  const deadline = Date.now() + 5000;
  while (target.entries().length > 0) {
    if (Date.now() > deadline) throw new Error('outbox was not drained');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
