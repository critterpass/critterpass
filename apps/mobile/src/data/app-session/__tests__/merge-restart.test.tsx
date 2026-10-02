/**
 * "Use my old pass" on a real encrypted database, through the real session start: the merge runs
 * the sign-out hooks (the anonymous pass's data leaves the phone) and the app starts again. The
 * new start finds the existing account's session, binds the same database to it and opens for it;
 * nothing of the anonymous pass is left, and the stored uid is the existing account's. The only
 * stand-ins are the api session and the process restart (a second start on the same files).
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { resetOnSignOutHooksForTests, runOnSignOutHooks } from '../../auth/sign-out-hooks';
import { OWNER_UID_KEY } from '../../powersync/local-tables';
import { bindLocalOwner, registerLocalDataReset } from '../../powersync/reset';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '../../powersync/test-support/local-first-fixture';
import {
  installKey,
  MemoryKeyStore,
  removeDir,
  tempDatabaseDir,
} from '../../powersync/test-support/open-node-database';
import { startAppSession, type AppSession } from '../start-app-session';
import { memoryLastUid, sessionHarness, type SessionHarness } from '../test-support/session-deps';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('../../powersync/test-support/node-realm')
      .powersyncCommon,
);

const ANON = '0190f5a4-0000-7000-8000-0000000000a1';
const EXISTING = '0190f5a4-0000-7000-8000-0000000000e1';

let harness: SessionHarness | null = null;
const opened: TestLocalFirst[] = [];
const sessions: AppSession[] = [];
let dir: string | null = null;

afterEach(async () => {
  for (const session of sessions.splice(0)) session.stop();
  for (const stack of opened.splice(0)) await stack.close();
  await harness?.close();
  harness = null;
  if (dir !== null) removeDir(dir);
  dir = null;
  resetOnSignOutHooksForTests();
});

describe('switching to an existing pass', () => {
  it('starts again on the existing account, on the same phone database, with nothing of the new pass left', async () => {
    dir = tempDatabaseDir();
    const key = await installKey(new MemoryKeyStore());
    const lastUid = memoryLastUid();
    harness = sessionHarness({ online: true, lastUid });
    let serverSession = ANON;
    let current: TestLocalFirst | null = null;
    registerLocalDataReset(() => current?.value ?? null);
    const deps = {
      ...harness.value,
      auth: {
        ...harness.value.auth,
        ensureAnonymous: () => Promise.resolve({ userId: serverSession }),
      },
      // One process's database: the same encrypted files on every start, bound to the uid it opens for.
      startLocalFirst: async (_auth: unknown, uid: string) => {
        current = await openTestLocalFirst({ dir: dir!, key, uid, holdUploads: true });
        opened.push(current);
        await bindLocalOwner(current.db, current.value.queue, uid);
        return current.value;
      },
    };

    const first = await startAppSession(deps);
    sessions.push(first);
    expect(first.uid).toBe(ANON);
    await first.localFirst.db.execute(
      'INSERT INTO local_private (id, kind, data) VALUES (?, ?, ?)',
      ['passport', 'passport', 'the new pass'],
    );

    // The merge: the server moves the phone's session to the existing account and the app runs
    // the sign-out hooks, as confirmMerge does. Then the app restarts.
    serverSession = EXISTING;
    await runOnSignOutHooks();
    first.stop();
    const second = await startAppSession(deps);
    sessions.push(second);

    expect(second.uid).toBe(EXISTING);
    expect(second.realtime.uid).toBe(EXISTING);
    expect(lastUid.current).toBe(EXISTING);
    const owner = await second.localFirst.db.getOptional<{ value: string }>(
      'SELECT value FROM local_state WHERE id = ?',
      [OWNER_UID_KEY],
    );
    expect(owner?.value).toBe(EXISTING);
    await expect(second.localFirst.db.getAll('SELECT id FROM local_private')).resolves.toEqual([]);
  });
});
