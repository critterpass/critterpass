/**
 * Starting local-first for a uid on a real encrypted database: the owner is bound (another uid's
 * data wiped) before anything else, and the phone's own data is readable without the sync
 * connection having settled, whether it hangs or fails. The only stand-in is the sync connection
 * itself (the network).
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { connectLocalFirst } from '../local-first';
import { OWNER_UID_KEY } from '../local-tables';
import { bindLocalOwner } from '../reset';
import { buildAppSchema } from '../schema';
import {
  installKey,
  MemoryKeyStore,
  openNodeDatabase,
  removeDir,
  tempDatabaseDir,
} from '../test-support/open-node-database';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('../test-support/node-realm').powersyncCommon,
);

const OLD_UID = '0190f5a4-0000-7000-8000-00000000000a';
const UID = '0190f5a4-0000-7000-8000-00000000000b';
const OPTIONS = {
  uid: UID,
  endpoint: 'https://sync.invalid',
  getSyncToken: () => Promise.resolve('sync-token'),
};

let db: AbstractPowerSyncDatabase;
let dir: string;

beforeEach(async () => {
  dir = tempDatabaseDir();
  db = await openNodeDatabase({
    dir,
    key: await installKey(new MemoryKeyStore()),
    schema: buildAppSchema(),
  });
});

afterEach(async () => {
  jest.restoreAllMocks();
  await db.close();
  removeDir(dir);
});

async function owner(): Promise<string | null> {
  const row = await db.getOptional<{ value: string }>(
    'SELECT value FROM local_state WHERE id = ?',
    [OWNER_UID_KEY],
  );
  return row?.value ?? null;
}

/**
 * The sync connection as the test controls it. `ownerBoundFirst` is whether the write that binds
 * the database's owner had finished at the moment the connection was started.
 */
function syncConnection(outcome: 'hangs' | 'fails') {
  const seen = { started: false, ownerBoundFirst: false };
  let ownerBound = false;
  const execute = db.execute.bind(db);
  jest.spyOn(db, 'execute').mockImplementation(async (sql, parameters) => {
    const result = await execute(sql, parameters);
    if (sql.includes('INTO local_state')) ownerBound = true;
    return result;
  });
  jest.spyOn(db, 'connect').mockImplementation(() => {
    seen.started = true;
    seen.ownerBoundFirst = ownerBound;
    return outcome === 'fails'
      ? Promise.reject(new Error('sync could not start'))
      : new Promise<void>(() => undefined);
  });
  return seen;
}

function queue() {
  return {
    schedule: jest.fn<() => void>(),
    flush: jest.fn<() => Promise<void>>(),
    reset: jest.fn(),
  };
}

describe('starting local-first for a uid', () => {
  it('returns with the phone’s data readable while the sync connection is still pending', async () => {
    syncConnection('hangs');
    const uploads = queue();
    let settled = false;

    const { connected } = await connectLocalFirst({ db, queue: uploads as never }, OPTIONS);
    void connected.then(() => {
      settled = true;
    });

    await expect(owner()).resolves.toBe(UID);
    await expect(db.getAll('SELECT id FROM commands')).resolves.toEqual([]);
    expect(uploads.schedule).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
  });

  it('binds the owner, wiping another uid’s data, before the connection is started', async () => {
    await bindLocalOwner(db, null, OLD_UID);
    await db.execute('INSERT INTO local_private (id, kind, data) VALUES (?, ?, ?)', [
      'passport',
      'passport',
      'old',
    ]);
    const seen = syncConnection('hangs');

    await connectLocalFirst({ db, queue: queue() as never }, OPTIONS);

    expect(seen).toEqual({ started: true, ownerBoundFirst: true });
    await expect(owner()).resolves.toBe(UID);
    await expect(db.getAll('SELECT id FROM local_private')).resolves.toEqual([]);
  });

  it('does not fail the start when the sync connection cannot be started', async () => {
    syncConnection('fails');
    const warned = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const uploads = queue();

    const { connected } = await connectLocalFirst({ db, queue: uploads as never }, OPTIONS);

    await expect(connected).resolves.toBeUndefined();
    expect(warned).toHaveBeenCalledTimes(1);
    await expect(owner()).resolves.toBe(UID);
    expect(uploads.schedule).toHaveBeenCalledTimes(1);
  });
});
