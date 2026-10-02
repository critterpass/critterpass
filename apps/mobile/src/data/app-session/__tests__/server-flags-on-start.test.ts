/**
 * App start asks the api for the account's flags (`GET /v1/config/bootstrap`) and asks again on
 * every return to the foreground; an offline launch keeps the last answer, and sign-out forgets it.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import {
  applyServerFlags,
  clearServerFlags,
  serverFlag,
} from '../../../lib/analytics/server-flags';
import bootstrap from '../../../lib/analytics/test-support/config-bootstrap.json';
import { resetOnSignOutHooksForTests, runOnSignOutHooks } from '../../auth/sign-out-hooks';
import { waitUntil } from '../../realtime/test-support/lifecycle';
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
  clearServerFlags();
});

describe('server flags on app start', () => {
  it('asks on start and on each return to the foreground', async () => {
    harness = sessionHarness({ online: true });
    const { flagRequests, appState } = harness;
    expect(serverFlag('money.receipts')).toBeUndefined();

    await harness.start();
    await waitUntil(() => serverFlag('money.receipts') === true);
    expect(flagRequests).toHaveLength(1);

    appState.emit('background');
    expect(flagRequests).toHaveLength(1);
    appState.emit('active');
    await waitUntil(() => flagRequests.length === 2);
  });

  it('stops asking once the session is stopped', async () => {
    harness = sessionHarness({ online: true });
    const session = await harness.start();
    await waitUntil(() => serverFlag('money.receipts') === true);

    session.stop();
    harness.appState.emit('background');
    harness.appState.emit('active');

    expect(harness.flagRequests).toHaveLength(1);
  });

  it('keeps the last answer on an offline launch and reports the failed refresh', async () => {
    applyServerFlags(bootstrap);
    harness = sessionHarness({ online: false, lastUid: memoryLastUid('uid-before') });
    const { errors, flagRequests } = harness;

    await harness.start();
    await waitUntil(() =>
      errors.some((error) => error instanceof Error && error.message === 'Network request failed'),
    );

    expect(flagRequests).toHaveLength(1);
    expect(serverFlag('money.receipts')).toBe(true);
  });

  it('forgets the answer on sign-out and asks again, which a signed-out phone gets no answer to', async () => {
    let signedIn = true;
    harness = sessionHarness({
      online: true,
      serverFlags: () =>
        Promise.resolve(
          signedIn
            ? { status: 200, body: bootstrap }
            : { status: 401, body: { error: { code: 'AUTH_REQUIRED' } } },
        ),
    });
    const { flagRequests } = harness;
    await harness.start();
    await waitUntil(() => serverFlag('money.receipts') === true);

    signedIn = false;
    await runOnSignOutHooks();
    await waitUntil(() => flagRequests.length === 2);

    expect(serverFlag('money.receipts')).toBeUndefined();
  });

  it("gives the account a switch lands on its own values, not the previous account's", async () => {
    let answer = bootstrap;
    harness = sessionHarness({
      online: true,
      serverFlags: () => Promise.resolve({ status: 200, body: answer }),
    });
    await harness.start();
    await waitUntil(() => serverFlag('money.receipts') === true);

    answer = { flags: { ...bootstrap.flags, 'money.receipts': false, 'setup.budget_dots': true } };
    await runOnSignOutHooks();

    await waitUntil(() => serverFlag('setup.budget_dots') === true);
    expect(serverFlag('money.receipts')).toBe(false);
  });
});
