/**
 * A returning install opens what is on the phone at once and asks the server whose session this
 * is alongside, on a real encrypted database. Only the server's own answer (same uid, another
 * uid, no session) changes anything; a check that gets no answer (offline, a timeout, a 5xx, a
 * captive portal's page) keeps the phone's data and asks again, as does a start whose sync token
 * never arrives. A first launch keeps the session-first order. The only stand-ins are the api
 * (the session check, as the auth client decodes its answer) and the app restart.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act } from '@testing-library/react-native';

import { registerOnSignOut, resetOnSignOutHooksForTests } from '../../auth/sign-out-hooks';
import { defineClientCommand } from '../../commands/summaries';
import type { AppSession, SessionAnswer } from '../start-app-session';
import {
  memoryLastUid,
  NO_SESSION,
  sessionHarness,
  sessionOf,
  type SessionHarness,
} from '../test-support/session-deps';

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

/** A session check the test answers when it chooses to; every ask after the first is pending too. */
function pendingCheck() {
  let answer: (result: SessionAnswer) => void = () => undefined;
  let asked = 0;
  const check = () => {
    asked += 1;
    return new Promise<SessionAnswer>((resolve) => {
      answer = resolve;
    });
  };
  return {
    check,
    answer: (result: SessionAnswer) => answer(result),
    get asked() {
      return asked;
    },
  };
}

/** Lets the check's continuation (hooks, restart) run to its end. */
const settle = (ms = 50) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

/** Something only this phone holds: it must survive anything but the server's own answer. */
async function keepPassport(session: AppSession): Promise<void> {
  await session.localFirst.db.execute(
    'INSERT INTO local_private (id, kind, data) VALUES (?, ?, ?)',
    ['passport', 'passport', 'mine'],
  );
}

describe('a returning install (a stored last uid)', () => {
  it('opens its local data before the server has answered whose session this is', async () => {
    const server = pendingCheck();
    const h = harness({
      online: true,
      lastUid: memoryLastUid('uid-before'),
      getSession: server.check,
    });

    const session = await h.start();

    expect(server.asked).toBe(1);
    expect(session.uid).toBe('uid-before');
    expect(h.opened.map((entry) => entry.uid)).toEqual(['uid-before']);
    expect(session.realtime.uid).toBe('uid-before');
  });

  it('changes nothing when the server names the same uid', async () => {
    const server = pendingCheck();
    const wiped = jest.fn<() => void>();
    const h = harness({
      online: true,
      lastUid: memoryLastUid('uid-before'),
      getSession: server.check,
    });
    await h.start();
    registerOnSignOut(wiped);

    server.answer(sessionOf('uid-before'));
    await settle(200);

    expect(wiped).not.toHaveBeenCalled();
    expect(h.restarts).toEqual([]);
    expect(h.lastUid.current).toBe('uid-before');
    expect(server.asked).toBe(1);
  });

  it('wipes the old uid and restarts on the new one when the session is someone else’s', async () => {
    const server = pendingCheck();
    const wiped = jest.fn<() => void>();
    const h = harness({
      online: true,
      lastUid: memoryLastUid('uid-before'),
      getSession: server.check,
    });
    await h.start();
    registerOnSignOut(wiped);

    server.answer(sessionOf('uid-existing'));
    await settle();

    expect(wiped).toHaveBeenCalledTimes(1);
    // The restart finds the new uid in storage and opens for it.
    expect(h.restarts).toEqual(['uid-existing']);
    // Nothing was opened for the new uid in the old uid's process.
    expect(h.opened.map((entry) => entry.uid)).toEqual(['uid-before']);
  });

  it('wipes the old uid and restarts as a first launch when no session is left', async () => {
    const server = pendingCheck();
    const wiped = jest.fn<() => void>();
    const h = harness({
      online: true,
      lastUid: memoryLastUid('uid-before'),
      getSession: server.check,
    });
    await h.start();
    registerOnSignOut(wiped);

    server.answer(NO_SESSION);
    await settle();

    expect(wiped).toHaveBeenCalledTimes(1);
    // No uid in storage: the restart takes the first-launch order and creates the session there.
    expect(h.restarts).toEqual([null]);
    expect(h.opened.map((entry) => entry.uid)).toEqual(['uid-before']);
  });

  it('ignores an answer that arrives after the session stopped', async () => {
    const server = pendingCheck();
    const wiped = jest.fn<() => void>();
    const h = harness({
      online: true,
      lastUid: memoryLastUid('uid-before'),
      getSession: server.check,
    });
    const session = await h.start();
    registerOnSignOut(wiped);

    session.stop();
    server.answer(NO_SESSION);
    await settle();

    expect(wiped).not.toHaveBeenCalled();
    expect(h.restarts).toEqual([]);
  });
});

const addExpense = defineClientCommand<{ amount: number }>({ name: 'add_expense', offline: true });

describe('a returning install the server says has no session', () => {
  it('keeps everything while changes made here are unsent, stops syncing, and asks again next start', async () => {
    const wiped = jest.fn<() => void>();
    let tokens = 0;
    const server = pendingCheck();
    const lastUid = memoryLastUid('uid-before');
    const h = harness({
      online: true,
      lastUid,
      getSession: server.check,
      syncToken: () => {
        tokens += 1;
        return Promise.reject(new Error('sync token refused'));
      },
    });
    const session = await h.start();
    const { opId } = await session.localFirst.commands.send(addExpense, { amount: 120_000 });
    await keepPassport(session);
    registerOnSignOut(wiped);

    server.answer(NO_SESSION);
    await settle(200);

    expect(wiped).not.toHaveBeenCalled();
    expect(h.restarts).toEqual([]);
    expect(lastUid.current).toBe('uid-before');
    // The app offers the sign-in that gets this account back.
    expect(h.sessionLost()).toBe(1);
    await expect(session.localFirst.db.getAll('SELECT id, status FROM commands')).resolves.toEqual([
      { id: opId, status: 'queued' },
    ]);
    await expect(
      session.localFirst.db.getAll('SELECT data FROM local_private WHERE id = ?', ['passport']),
    ).resolves.toEqual([{ data: 'mine' }]);
    // Sync is stopped, and stays stopped when the network comes back.
    const tokensWhenStopped = tokens;
    h.stacks[0]?.network.set(false);
    h.stacks[0]?.network.set(true);
    await settle(200);
    expect(tokens).toBe(tokensWhenStopped);
    expect(session.localFirst.db.currentStatus.connected).toBe(false);
    expect(session.localFirst.queue.getState().sending).toBe(false);

    // The next start asks the server again.
    await h.start();
    expect(server.asked).toBe(2);
  });

  it('wipes as before when nothing made here is unsent', async () => {
    const server = pendingCheck();
    const wiped = jest.fn<() => void>();
    const h = harness({
      online: true,
      lastUid: memoryLastUid('uid-before'),
      getSession: server.check,
    });
    const session = await h.start();
    const { opId } = await session.localFirst.commands.send(addExpense, { amount: 120_000 });
    // The server has the expense: its result synced down.
    await session.localFirst.db.execute("UPDATE commands SET status = 'done' WHERE id = ?", [opId]);
    registerOnSignOut(wiped);

    server.answer(NO_SESSION);
    await settle();

    expect(wiped).toHaveBeenCalledTimes(1);
    expect(h.restarts).toEqual([null]);
    expect(h.sessionLost()).toBe(0);
  });
});

describe('a returning install whose session check gets no answer', () => {
  const noAnswers: [string, () => Promise<SessionAnswer>][] = [
    ['offline', () => Promise.reject(new TypeError('Network request failed'))],
    ['a request that never answers', () => new Promise<SessionAnswer>(() => undefined)],
    ['a 5xx', () => Promise.resolve({ data: null, error: { status: 503 } })],
    ['a 401', () => Promise.resolve({ data: null, error: { status: 401 } })],
    [
      'a captive portal’s page',
      () => Promise.resolve({ data: '<html>Log in</html>', error: null }),
    ],
    ['a body without a user', () => Promise.resolve({ data: { session: null }, error: null })],
  ];

  it.each(noAnswers)(
    'keeps the phone’s data and asks again after %s, until the server answers',
    async (_failure, fails) => {
      let asked = 0;
      let answer: SessionAnswer | null = null;
      const wiped = jest.fn<() => void>();
      const h = harness({
        online: true,
        lastUid: memoryLastUid('uid-before'),
        getSession: () => {
          asked += 1;
          return answer === null ? fails() : Promise.resolve(answer);
        },
      });
      const session = await h.start();
      await keepPassport(session);
      registerOnSignOut(wiped);

      await settle(500);

      expect(asked).toBeGreaterThanOrEqual(3);
      expect(wiped).not.toHaveBeenCalled();
      expect(h.restarts).toEqual([]);
      expect(h.lastUid.current).toBe('uid-before');
      await expect(
        session.localFirst.db.getAll('SELECT data FROM local_private WHERE id = ?', ['passport']),
      ).resolves.toEqual([{ data: 'mine' }]);

      // The server answers at last: only now does the phone act on it.
      answer = NO_SESSION;
      await settle(300);
      expect(wiped).toHaveBeenCalledTimes(1);
      expect(h.restarts).toEqual([null]);
    },
  );

  it('keeps the phone’s data while its sync token never arrives and the check fails', async () => {
    const wiped = jest.fn<() => void>();
    let tokens = 0;
    const h = harness({
      online: false,
      lastUid: memoryLastUid('uid-before'),
      syncToken: () => {
        tokens += 1;
        return new Promise<string>(() => undefined);
      },
    });
    const session = await h.start();
    await keepPassport(session);
    registerOnSignOut(wiped);

    await settle(500);

    expect(tokens).toBeGreaterThanOrEqual(1);
    expect(session.localFirst.db.currentStatus.connected).toBe(false);
    expect(wiped).not.toHaveBeenCalled();
    expect(h.restarts).toEqual([]);
    await expect(
      session.localFirst.db.getAll('SELECT data FROM local_private WHERE id = ?', ['passport']),
    ).resolves.toEqual([{ data: 'mine' }]);
  });

  it('stops asking once the session stops', async () => {
    let asked = 0;
    const h = harness({
      online: false,
      lastUid: memoryLastUid('uid-before'),
      getSession: () => {
        asked += 1;
        return Promise.reject(new TypeError('Network request failed'));
      },
    });
    const session = await h.start();
    await settle(100);
    session.stop();
    const before = asked;

    await settle(300);

    expect(asked).toBe(before);
  });
});

describe('a first launch (no stored uid)', () => {
  it('waits for the session before opening anything, and never runs the alongside check', async () => {
    const server = pendingCheck();
    const h = harness({ online: true, getSession: server.check });

    const session = await h.start();

    expect(session.uid).toBe('uid-online');
    expect(h.opened.map((entry) => entry.uid)).toEqual(['uid-online']);
    expect(h.lastUid.current).toBe('uid-online');
    expect(server.asked).toBe(0);
    expect(h.restarts).toEqual([]);
  });
});
