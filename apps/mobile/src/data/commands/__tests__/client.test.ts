/**
 * The command client's offline path on a real encrypted database: one local transaction queues the
 * envelope, its summary and its optimistic overlay rows; nothing is half-written on failure.
 */
import { describe, expect, it, afterEach } from '@jest/globals';

import { listQueuedCommands } from '../../status/use-queued-commands';
import { removeDir } from '../../powersync/test-support/open-node-database';
import {
  OVERLAY_CREWS,
  openTestLocalFirst,
  TEST_DEVICE,
  type TestLocalFirst,
} from '../../powersync/test-support/local-first-fixture';
import { getOrCreateInstallId } from '../../push/register';
import { loadOrCreateDeviceId } from '../device';
import { summaryOrName } from '../summaries';
import { defineTestCommand } from '../test-support/test-command';

const createCrew = defineTestCommand({
  name: 'create_test_crew',
  offline: true,
  summarize: (payload: { crew_id: string; name: string }) => ({
    id: 'crews.queued.create',
    message: 'New crew: {name}',
    values: { name: payload.name },
  }),
});
const registeredOnly = defineTestCommand<{ crew_id: string; name: string }>({
  name: 'create_registered_crew',
  offline: false,
});

let stack: TestLocalFirst;

afterEach(async () => {
  await stack.close();
  removeDir(stack.dir);
});

describe('command client (offline-capable)', () => {
  it('queues the envelope, its summary and its overlay rows together', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    const crewId = '0190f5a4-0000-7000-8000-0000000000c1';

    const result = await stack.value.commands.send(
      createCrew,
      { crew_id: crewId, name: 'Bali' },
      { optimistic: [{ table: OVERLAY_CREWS, row: { id: crewId, name: 'Bali' } }] },
    );

    expect(result.kind).toBe('queued');
    const [row] = await stack.db.getAll<{ id: string; envelope: string }>(
      'SELECT id, envelope FROM commands',
    );
    expect(row!.id).toBe(result.opId);
    expect(JSON.parse(row!.envelope)).toMatchObject({
      op_id: result.opId,
      cmd: 'create_test_crew',
      v: 1,
      actor: { uid: stack.uid, via: 'offline' },
      device: TEST_DEVICE,
      payload: { crew_id: crewId, name: 'Bali' },
    });
    expect(result.opId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    expect(await stack.db.getAll(`SELECT id, name, op_id FROM ${OVERLAY_CREWS}`)).toEqual([
      { id: crewId, name: 'Bali', op_id: result.opId },
    ]);
    expect(await listQueuedCommands(stack.db)).toMatchObject([
      {
        opId: result.opId,
        status: 'queued',
        summary: { id: 'crews.queued.create', values: { name: 'Bali' } },
      },
    ]);
  });

  it('writes nothing when an optimistic row is invalid', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await expect(
      stack.value.commands.send(
        createCrew,
        { crew_id: 'x', name: 'Bali' },
        { optimistic: [{ table: 'crews', row: { id: 'x', name: 'Bali' } }] },
      ),
    ).rejects.toThrow('overlay table');
    await expect(
      stack.value.commands.send(
        createCrew,
        { crew_id: 'x', name: 'Bali' },
        { optimistic: [{ table: OVERLAY_CREWS, row: { id: 'x', missing_column: 1 } }] },
      ),
    ).rejects.toThrow();
    expect(await stack.db.getAll('SELECT * FROM commands')).toEqual([]);
    expect(await stack.db.getAll(`SELECT * FROM ${OVERLAY_CREWS}`)).toEqual([]);
  });

  it('refuses optimistic rows for an online-only command', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await expect(
      stack.value.commands.send(
        registeredOnly,
        { crew_id: 'x', name: 'Bali' },
        { optimistic: [{ table: OVERLAY_CREWS, row: { id: 'x', name: 'Bali' } }] },
      ),
    ).rejects.toThrow('online-only');
  });
});

describe('command client (online-only) with no signal', () => {
  it('answers unavailable and leaves nothing queued, so the screen offers a retry', async () => {
    // The default transport points at a port nothing listens on: every request is refused.
    stack = await openTestLocalFirst({ holdUploads: true });
    const crewId = '0190f5a4-0000-7000-8000-0000000000c2';

    const result = await stack.value.commands.send(registeredOnly, {
      crew_id: crewId,
      name: 'Bali',
    });

    expect(result).toEqual({ kind: 'unavailable', opId: expect.any(String), code: 'NETWORK' });
    expect(await listQueuedCommands(stack.db)).toEqual([]);
    expect(await stack.db.getAll('SELECT * FROM commands')).toEqual([]);
  });
});

describe('summaries', () => {
  it('fall back to the command name when absent or unreadable', () => {
    expect(summaryOrName('cast_ballot', null)).toEqual({
      id: 'cast_ballot',
      message: 'cast_ballot',
    });
    expect(summaryOrName('cast_ballot', '{oops')).toEqual({
      id: 'cast_ballot',
      message: 'cast_ballot',
    });
  });
});

describe('device id', () => {
  it('is created once per install and reused', async () => {
    const items = new Map<string, string>();
    const store = {
      getItemAsync: (key: string) => Promise.resolve(items.get(key) ?? null),
      setItemAsync: (key: string, value: string) => {
        items.set(key, value);
        return Promise.resolve();
      },
    };
    let minted = 0;
    const newId = () => `device-${++minted}`;
    expect(await loadOrCreateDeviceId(store, newId)).toBe('device-1');
    expect(await loadOrCreateDeviceId(store, newId)).toBe('device-1');
    // The envelope and `register_device` name the install by the same id.
    expect(await getOrCreateInstallId(store, newId)).toBe('device-1');
  });
});
