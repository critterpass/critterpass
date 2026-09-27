/**
 * App start wires the extensions' side of the App Group: `config/endpoints.json` is written first
 * (even when the session can't start), commands an extension queued are drained into the upload
 * queue on launch and on every return to the foreground, and sign-out drops what was queued for
 * the previous uid.
 */
import { generateUuidV7 } from '@cp/domain';
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { resetOnSignOutHooksForTests, runOnSignOutHooks } from '../../auth/sign-out-hooks';
import { waitUntil } from '../../realtime/test-support/lifecycle';
import type { AppSession } from '../start-app-session';
import { memoryLastUid, sessionHarness, type SessionHarness } from '../test-support/session-deps';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('../../powersync/test-support/node-realm')
      .powersyncCommon,
);

let harness: SessionHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
  resetOnSignOutHooksForTests();
});

function action() {
  return {
    op_id: generateUuidV7(),
    cmd: 'cast_ballot',
    v: 1,
    via: 'widget',
    scope: 'ballot',
    client_ts: new Date().toISOString(),
    payload: { poll_id: 'p1', option_id: 'o2' },
  };
}

async function queuedIds(session: AppSession): Promise<string[]> {
  const rows = await session.localFirst.db.getAll<{ id: string }>(
    'SELECT id FROM commands ORDER BY seq',
  );
  return rows.map((row) => row.id);
}

async function waitForQueued(session: AppSession, count: number): Promise<string[]> {
  let ids: string[] = [];
  const deadline = Date.now() + 5000;
  while (ids.length < count && Date.now() < deadline) {
    ids = await queuedIds(session);
    if (ids.length < count) await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return ids;
}

describe('extension outbox on app start', () => {
  it('writes the endpoints config before the session, even when it cannot start', async () => {
    harness = sessionHarness({ online: false });

    await expect(harness.start()).rejects.toThrow('Network request failed');

    expect(harness.endpointWrites).toEqual(['config/endpoints.json']);
  });

  it('drains what extensions queued at launch and again on return to the foreground', async () => {
    harness = sessionHarness({ online: true });
    const atLaunch = action();
    harness.outbox.append(atLaunch);

    const session = await harness.start();

    expect(await waitForQueued(session, 1)).toEqual([atLaunch.op_id]);
    await waitUntil(() => harness?.outbox.entries().length === 0, 5000, 'outbox emptied');

    const whileAway = action();
    harness.outbox.append(whileAway);
    harness.appState.emit('background');
    harness.appState.emit('active');

    expect(await waitForQueued(session, 2)).toEqual([atLaunch.op_id, whileAway.op_id]);
    expect(harness.errors).toEqual([]);
  });

  it('drops the outbox and the remembered uid on sign-out', async () => {
    harness = sessionHarness({ online: true, lastUid: memoryLastUid() });
    await harness.start();
    harness.outbox.append(action());
    expect(harness.lastUid.current).toBe('uid-online');

    await runOnSignOutHooks();

    expect(harness.outbox.entries()).toEqual([]);
    expect(harness.lastUid.current).toBeNull();
  });
});
