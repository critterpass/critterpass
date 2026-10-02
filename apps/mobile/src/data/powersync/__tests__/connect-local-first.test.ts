/**
 * Starting local-first for a uid on a real encrypted database: the owner is bound (another uid's
 * data wiped) before anything else, and the phone's own data is readable without the sync
 * connection having settled, whether it hangs or fails. The only stand-in is the sync connection
 * itself (the network).
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { connectLocalFirst } from '../local-first';
import { OWNER_UID_KEY } from '../local-tables';
import { createNetworkState } from '../../status/network';
import { bindLocalOwner, resetLocalData } from '../reset';
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

/**
 * A stand-in for the PowerSync service on loopback: `/sync/stream` answers with an empty, complete
 * checkpoint and stays open. `holdFirstStream` leaves the first request without any answer, as a
 * request made while the network comes back can be left on a phone.
 */
async function syncService(options: { holdFirstStream: boolean }) {
  const streams: http.ServerResponse[] = [];
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || !req.url?.startsWith('/sync/stream')) {
      res.writeHead(404).end();
      return;
    }
    req.resume();
    streams.push(res);
    if (options.holdFirstStream && streams.length === 1) return;
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    res.write(`${JSON.stringify({ checkpoint: { last_op_id: '0', buckets: [] } })}\n`);
    res.write(`${JSON.stringify({ checkpoint_complete: { last_op_id: '0' } })}\n`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests: () => streams.length,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** Sync token requests: the first `hung` of them never answer; later ones answer at once. */
function syncTokens(hung: number) {
  let calls = 0;
  const release: (() => void)[] = [];
  return {
    calls: () => calls,
    getSyncToken: () => {
      calls += 1;
      if (calls > hung) return Promise.resolve('sync-token');
      return new Promise<string>((_resolve, reject) => {
        release.push(() => reject(new Error('released by the test')));
      });
    },
    /** Lets the test close the database: a request left hanging would hold its disconnect. */
    releaseAll: () => release.splice(0).forEach((fail) => fail()),
  };
}

async function eventually(check: () => boolean, timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return true;
}

describe('syncing again when the network comes back', () => {
  let close: (() => Promise<void>)[] = [];

  afterEach(async () => {
    for (const step of close.reverse()) await step();
    close = [];
  });

  it.each([
    ['the sync token request', { hungTokens: 1, holdFirstStream: false }],
    ['the sync stream request', { hungTokens: 0, holdFirstStream: true }],
  ])(
    'connects once back online even when %s made as it came back never answers',
    async (_request, setup) => {
      const service = await syncService({ holdFirstStream: setup.holdFirstStream });
      const tokens = syncTokens(setup.hungTokens);
      close.push(service.close, async () => {
        tokens.releaseAll();
        await db.disconnect();
      });
      const network = createNetworkState(false);

      await connectLocalFirst(
        { db, queue: queue() as never, network },
        { uid: UID, endpoint: service.url, getSyncToken: tokens.getSyncToken },
      );
      // The attempt made as the link came up is stuck before the phone reports being online.
      const stuck =
        setup.hungTokens > 0 ? () => tokens.calls() === 1 : () => service.requests() === 1;
      await expect(eventually(stuck)).resolves.toBe(true);
      network.set(true);

      await expect(eventually(() => db.currentStatus.connected)).resolves.toBe(true);
    },
  );

  it('leaves a working connection alone when the network flaps', async () => {
    const service = await syncService({ holdFirstStream: false });
    close.push(service.close, () => db.disconnect());
    const network = createNetworkState(true);
    await connectLocalFirst(
      { db, queue: queue() as never, network },
      { uid: UID, endpoint: service.url, getSyncToken: () => Promise.resolve('sync-token') },
    );
    await expect(eventually(() => db.currentStatus.connected)).resolves.toBe(true);

    network.set(false);
    network.set(true);

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(service.requests()).toBe(1);
    expect(db.currentStatus.connected).toBe(true);
  });

  it('does not connect again for a uid the phone has stopped being', async () => {
    const service = await syncService({ holdFirstStream: true });
    close.push(service.close, () => db.disconnect());
    const network = createNetworkState(false);
    await connectLocalFirst(
      { db, queue: queue() as never, network },
      { uid: UID, endpoint: service.url, getSyncToken: () => Promise.resolve('sync-token') },
    );
    await expect(eventually(() => service.requests() === 1)).resolves.toBe(true);

    // Signed out (or revoked): the hooks wipe the database, its owner included.
    await resetLocalData(db, null);
    network.set(true);

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(service.requests()).toBe(1);
    expect(db.currentStatus.connected).toBe(false);
  });
});
