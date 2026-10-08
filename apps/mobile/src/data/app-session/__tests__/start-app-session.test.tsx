/**
 * App start on a real encrypted database: the session resolves the uid, opens local-first for it
 * and connects realtime; the root provides both and retries a start that failed offline. The only
 * stand-ins are the api (an in-memory session) and the OS lifecycle; realtime dials a port nothing
 * listens on.
 */
import { afterEach, describe, expect, it } from '@jest/globals';
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { resetOnSignOutHooksForTests } from '../../auth/sign-out-hooks';
import { useLocalFirst } from '../../powersync/local-first-context';
import { useRealtimeClient } from '../../realtime/use-channel';
import { AppSessionRoot } from '../AppSessionRoot';
import { startAppSession, type AppSession } from '../start-app-session';
import { memoryLastUid, sessionHarness, type SessionHarness } from '../test-support/session-deps';

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

describe('startAppSession', () => {
  it('opens local-first and realtime for the anonymous session uid', async () => {
    const { start, opened, lastUid } = harness({ online: true });

    const session = await start();

    expect(session.uid).toBe('uid-online');
    expect(opened.map((entry) => entry.uid)).toEqual(['uid-online']);
    await expect(opened[0]?.auth.getSyncToken()).resolves.toBe('sync-token');
    await expect(opened[0]?.auth.sessionHeaders()).resolves.toEqual({ cookie: 'session=1' });
    await expect(session.localFirst.db.getAll('SELECT id FROM commands')).resolves.toEqual([]);
    expect(session.realtime.uid).toBe('uid-online');
    expect(session.realtime.centrifuge.state).not.toBe('disconnected');
    expect(lastUid.current).toBe('uid-online');
  });

  it('reopens the last uid offline, and has nothing to open on an offline first launch', async () => {
    const returning = harness({ online: false, lastUid: memoryLastUid('uid-before') });
    await expect(returning.start()).resolves.toMatchObject({ uid: 'uid-before' });

    const first = harness({ online: false });
    await expect(startAppSession(first.value)).rejects.toThrow('Network request failed');
    expect(first.opened).toEqual([]);
  });

  it('disconnects realtime when the session stops', async () => {
    const session = await harness({ online: true }).start();

    session.stop();

    expect(session.realtime.centrifuge.state).toBe('disconnected');
  });
});

function Probe() {
  const realtime = useRealtimeClient();
  return <Text>{realtime === null ? 'starting' : `ready:${realtime.uid}`}</Text>;
}

function LocalFirstProbe() {
  const { db } = useLocalFirst();
  return <Text>{db.closed ? 'closed' : 'db-open'}</Text>;
}

/**
 * Every start the root makes. A start opens a real encrypted database, which takes as long as the
 * runner lets it, so the tests wait for the start itself rather than poll the screen against a
 * clock.
 */
function recordStarts(start: () => Promise<AppSession>) {
  const attempts: Promise<AppSession>[] = [];
  return {
    attempts,
    start: () => {
      const attempt = start();
      attempts.push(attempt);
      return attempt;
    },
  };
}

/** Waits for a start to succeed or fail, and for the root to render what it did with it. */
async function settled(attempt: Promise<unknown> | undefined): Promise<void> {
  expect(attempt).toBeDefined();
  await act(async () => {
    await attempt?.catch(() => undefined);
  });
}

describe('AppSessionRoot', () => {
  it('provides the started database and realtime client to the screens', async () => {
    const { start, appState } = harness({ online: true });
    const root = recordStarts(start);

    await render(
      <AppSessionRoot start={root.start} appState={appState} onError={() => undefined}>
        <Probe />
      </AppSessionRoot>,
    );
    expect(screen.getByText('starting')).toBeTruthy();
    expect(root.attempts).toHaveLength(1);
    await settled(root.attempts[0]);
    expect(screen.getByText('ready:uid-online')).toBeTruthy();

    await screen.rerender(
      <AppSessionRoot start={root.start} appState={appState} onError={() => undefined}>
        <LocalFirstProbe />
      </AppSessionRoot>,
    );
    expect(screen.getByText('db-open')).toBeTruthy();
    expect(root.attempts).toHaveLength(1);
  });

  it('retries a failed start when the app returns to the foreground', async () => {
    let online = false;
    const errors: unknown[] = [];
    const session = harness({ online: true });
    const { appState } = session;
    const root = recordStarts(() =>
      online ? session.start() : Promise.reject(new Error('Network request failed')),
    );

    await render(
      <AppSessionRoot
        start={root.start}
        appState={appState}
        onError={(error) => errors.push(error)}
      >
        <Probe />
      </AppSessionRoot>,
    );
    await settled(root.attempts[0]);
    expect(errors).toHaveLength(1);
    expect(screen.getByText('starting')).toBeTruthy();

    // A slow runner may also reach the first backoff retry while offline; the foreground return
    // is still what starts the session.
    online = true;
    const before = root.attempts.length;
    await act(() => appState.emit('active'));
    expect(root.attempts).toHaveLength(before + 1);
    await settled(root.attempts.at(-1));
    expect(screen.getByText('ready:uid-online')).toBeTruthy();
  });
});
