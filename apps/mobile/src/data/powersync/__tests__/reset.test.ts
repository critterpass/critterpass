/**
 * Account switch: sign-out, a confirmed merge and a revoked session each wipe every synced row,
 * queued command, overlay, rejected entry and `local_private` value through the auth layer's
 * sign-out hooks, and a database found holding another uid's data is wiped before it is reused.
 */
import { DomainError } from '@cp/domain';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { column, type AbstractPowerSyncDatabase } from '@powersync/common';

import { confirmMerge } from '../../auth/merge';
import { signOut } from '../../auth/sign-out';
import { resetOnSignOutHooksForTests, runOnSignOutHooks } from '../../auth/sign-out-hooks';
import { overlayTable } from '../local-tables';
import { recordRejection } from '../queue-store';
import { bindLocalOwner, registerLocalDataReset } from '../reset';
import { buildAppSchema } from '../schema';
import {
  installKey,
  MemoryKeyStore,
  openNodeDatabase,
  removeDir,
  tempDatabaseDir,
} from '../test-support/open-node-database';
import { enqueue, queueWith, stopQueues } from '../test-support/queue-fixtures';

const OLD_UID = '0190f5a4-0000-7000-8000-00000000000a';
const NEW_UID = '0190f5a4-0000-7000-8000-00000000000b';
const TABLES = [
  'crews',
  'commands',
  'rejected_commands',
  'local_private',
  'overlay_crews',
  'local_state',
];

let db: AbstractPowerSyncDatabase;
let dir: string;

beforeEach(async () => {
  dir = tempDatabaseDir();
  const schema = buildAppSchema(new Map([['overlay_crews', overlayTable({ name: column.text })]]));
  db = await openNodeDatabase({ dir, key: await installKey(new MemoryKeyStore()), schema });
});

afterEach(async () => {
  resetOnSignOutHooksForTests();
  await stopQueues();
  await db.close();
  removeDir(dir);
});

async function fillWithOldUserData(): Promise<void> {
  await bindLocalOwner(db, null, OLD_UID);
  await db.execute(`INSERT INTO crews (id, name) VALUES (uuid(), 'Old crew')`);
  const queued = await enqueue(db, OLD_UID, 'create_test_crew', {});
  await db.execute(`INSERT INTO overlay_crews (id, name, op_id) VALUES (uuid(), 'Pending', ?)`, [
    queued,
  ]);
  const rejected = await enqueue(db, OLD_UID, 'reject_test_op', {});
  await db.writeTransaction((tx) =>
    recordRejection(tx, {
      opId: rejected,
      code: 'STATE_INVALID',
      detail: null,
      rejectedAt: new Date().toISOString(),
    }),
  );
  await db.execute(`INSERT INTO local_private (id, kind, data) VALUES (uuid(), 'insurance', 'X')`);
}

async function rowCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    const row = await db.get<{ n: number }>(`SELECT count(*) AS n FROM ${table}`);
    counts[table] = row.n;
  }
  return counts;
}

const EMPTY = Object.fromEntries(TABLES.map((table) => [table, 0]));

describe('local data reset', () => {
  beforeEach(() => {
    registerLocalDataReset(() => ({ db, queue: null }));
  });

  it('holds data for every table before a switch', async () => {
    await fillWithOldUserData();
    expect(Object.values(await rowCounts()).every((n) => n > 0)).toBe(true);
  });

  it('wipes everything on sign-out', async () => {
    await fillWithOldUserData();
    const result = await signOut({ signOut: () => Promise.resolve({ data: {}, error: null }) });
    expect(result).toEqual({ signedOut: true });
    expect(await rowCounts()).toEqual(EMPTY);
  });

  it('leaves data alone when the server refuses the sign-out', async () => {
    await fillWithOldUserData();
    await signOut({ signOut: () => Promise.resolve({ data: null, error: { code: 'INTERNAL' } }) });
    expect((await rowCounts()).local_private).toBe(1);
  });

  it('wipes everything after a merge into the existing account', async () => {
    await fillWithOldUserData();
    const outcome = await confirmMerge('ticket', {
      post: () => Promise.resolve({ data: { user: { id: NEW_UID } }, error: null }),
    });
    expect(outcome).toEqual({ kind: 'merged', userId: NEW_UID });
    expect(await rowCounts()).toEqual(EMPTY);
  });

  it('wipes everything when an upload learns the session was revoked', async () => {
    await fillWithOldUserData();
    const revoked = new DomainError('SESSION_REVOKED');
    const queue = queueWith(
      db,
      { postJson: () => Promise.resolve({ status: revoked.http, body: revoked.toResponseBody() }) },
      runOnSignOutHooks,
    );
    await queue.flush();
    expect(await rowCounts()).toEqual(EMPTY);
  });
});

describe('local owner binding', () => {
  it('keeps the data of the same uid', async () => {
    await fillWithOldUserData();
    await bindLocalOwner(db, null, OLD_UID);
    expect((await rowCounts()).local_private).toBe(1);
  });

  it('wipes data another uid left behind before recording the new owner', async () => {
    await fillWithOldUserData();
    const queue = queueWith(db, { postJson: () => Promise.reject(new Error('offline')) });
    await queue.flush();
    expect(queue.getState().failures).toBe(1);

    await bindLocalOwner(db, queue, NEW_UID);

    expect(queue.getState().failures).toBe(0);
    expect(await rowCounts()).toEqual({ ...EMPTY, local_state: 1 });
    expect(await db.get('SELECT value FROM local_state')).toEqual({ value: NEW_UID });
  });
});
