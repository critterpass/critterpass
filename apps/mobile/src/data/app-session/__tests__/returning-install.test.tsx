/**
 * A returning install opens what is on the phone at once and asks the server whose session this
 * is alongside: every answer the check can get (same uid, another uid, no session, a failure, no
 * answer at all), on a real encrypted database. A first launch keeps the session-first order. The
 * only stand-ins are the api (the session check) and the app restart.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act } from '@testing-library/react-native';

import { registerOnSignOut, resetOnSignOutHooksForTests } from '../../auth/sign-out-hooks';
import { memoryLastUid, sessionHarness, type SessionHarness } from '../test-support/session-deps';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('../../powersync/test-support/node-realm')
      .powersyncCommon,
);

let harnesses: SessionHarness[] = [];

function harness(options: Parameters<typeof sessionHarness>[0]): SessionHarness {
  const created = sessionHarness(options);
  harnesses.push(created);
  return created;
}

afterEach(async () => {
  for (const created of harnesses) await created.close();
  harnesses = [];
  resetOnSignOutHooksForTests();
});

type Holder = { readonly userId: string } | null;

/** A session check the test answers when it chooses to. */
function pendingCheck() {
  let answer: (holder: Holder) => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  let asked = 0;
  const check = () => {
    asked += 1;
    return new Promise<Holder>((resolve, reject) => {
      answer = resolve;
      fail = reject;
    });
  };
  return {
    check,
    answer: (holder: Holder) => answer(holder),
    fail: (error: Error) => fail(error),
    get asked() {
      return asked;
    },
  };
}

/** Lets the check's continuation (hooks, restart) run to its end. */
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));

describe('a returning install (a stored last uid)', () => {
  it('opens its local data before the server has answered whose session this is', async () => {
    const server = pendingCheck();
    const h = harness({
      online: true,
      lastUid: memoryLastUid('uid-before'),
      currentSession: server.check,
    });

    const session = await h.start();

    expect(server.asked).toBe(1);
    expect(session.uid).toBe('uid-before');
    expect(h.opened.map((entry) => entry.uid)).toEqual(['uid-before']);
    expect(session.realtime.uid).toBe('uid-before');
  });

  it('changes nothing when the server names the same uid', async () => {
    const server = pendingCheck();
    const wiped = jest.fn();
    const h = harness({
      online: true,
      lastUid: memoryLastUid('uid-before'),
      currentSession: server.check,
    });
    await h.start();
    registerOnSignOut(wiped);

    server.answer({ userId: 'uid-before' });
    await settle();

    expect(wiped).not.toHaveBeenCalled();
    expect(h.restarts).toEqual([]);
    expect(h.lastUid.current).toBe('uid-before');
    expect(h.opened.map((entry) => entry.uid)).toEqual(['uid-before']);
  });

  it('wipes the old uid and restarts on the new one when the session is someone else’s', async () => {
    const server = pendingCheck();
    const wiped = jest.fn();
    const h = harness({
      online: true,
      lastUid: memoryLastUid('uid-before'),
      currentSession: server.check,
    });
    await h.start();
    registerOnSignOut(wiped);

    server.answer({ userId: 'uid-existing' });
    await settle();

    expect(wiped).toHaveBeenCalledTimes(1);
    // The restart finds the new uid in storage and opens for it.
    expect(h.restarts).toEqual(['uid-existing']);
    // Nothing was opened for the new uid in the old uid's process.
    expect(h.opened.map((entry) => entry.uid)).toEqual(['uid-before']);
  });

  it('wipes the old uid and restarts as a first launch when no session is left', async () => {
    const server = pendingCheck();
    const wiped = jest.fn();
    const h = harness({
      online: true,
      lastUid: memoryLastUid('uid-before'),
      currentSession: server.check,
    });
    await h.start();
    registerOnSignOut(wiped);

    server.answer(null);
    await settle();

    expect(wiped).toHaveBeenCalledTimes(1);
    // No uid in storage: the restart takes the first-launch order and creates the session there.
    expect(h.restarts).toEqual([null]);
    expect(h.opened.map((entry) => entry.uid)).toEqual(['uid-before']);
  });

  it('keeps working on local data when the check fails', async () => {
    const server = pendingCheck();
    const wiped = jest.fn();
    const h = harness({
      online: true,
      lastUid: memoryLastUid('uid-before'),
      currentSession: server.check,
    });
    const session = await h.start();
    registerOnSignOut(wiped);

    server.fail(new Error('Network request failed'));
    await settle();

    expect(wiped).not.toHaveBeenCalled();
    expect(h.restarts).toEqual([]);
    expect(h.lastUid.current).toBe('uid-before');
    expect(h.errors).toEqual([]);
    await expect(session.localFirst.db.getAll('SELECT id FROM commands')).resolves.toEqual([]);
  });

  it('keeps working on local data when the check never answers', async () => {
    const server = pendingCheck();
    const wiped = jest.fn();
    const h = harness({
      online: true,
      lastUid: memoryLastUid('uid-before'),
      currentSession: server.check,
    });
    const session = await h.start();
    registerOnSignOut(wiped);

    await settle();

    expect(session.uid).toBe('uid-before');
    expect(wiped).not.toHaveBeenCalled();
    expect(h.restarts).toEqual([]);
    await expect(session.localFirst.db.getAll('SELECT id FROM commands')).resolves.toEqual([]);
  });

  it('ignores an answer that arrives after the session stopped', async () => {
    const server = pendingCheck();
    const wiped = jest.fn();
    const h = harness({
      online: true,
      lastUid: memoryLastUid('uid-before'),
      currentSession: server.check,
    });
    const session = await h.start();
    registerOnSignOut(wiped);

    session.stop();
    server.answer(null);
    await settle();

    expect(wiped).not.toHaveBeenCalled();
    expect(h.restarts).toEqual([]);
  });
});

describe('a first launch (no stored uid)', () => {
  it('waits for the session before opening anything, and never runs the alongside check', async () => {
    const server = pendingCheck();
    const h = harness({ online: true, currentSession: server.check });

    const session = await h.start();

    expect(session.uid).toBe('uid-online');
    expect(h.opened.map((entry) => entry.uid)).toEqual(['uid-online']);
    expect(h.lastUid.current).toBe('uid-online');
    expect(server.asked).toBe(0);
    expect(h.restarts).toEqual([]);
  });
});
