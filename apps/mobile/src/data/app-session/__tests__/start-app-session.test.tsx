/**
 * App start on a real encrypted database: the session resolves the uid, opens local-first for it
 * and connects realtime; the root provides both and retries a start that failed offline. The only
 * stand-ins are the api (an in-memory session) and the OS lifecycle; realtime dials a port nothing
 * listens on.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { resetOnSignOutHooksForTests } from '../../auth/sign-out-hooks';
import { useLocalFirst } from '../../powersync/local-first-context';
import { useRealtimeClient } from '../../realtime/use-channel';
import { AppSessionRoot } from '../AppSessionRoot';
import { startAppSession } from '../start-app-session';
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

describe('AppSessionRoot', () => {
  it('provides the started database and realtime client to the screens', async () => {
    const { start, appState } = harness({ online: true });

    await render(
      <AppSessionRoot start={start} appState={appState} onError={() => undefined}>
        <Probe />
      </AppSessionRoot>,
    );
    expect(screen.getByText('starting')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('ready:uid-online')).toBeTruthy(), {
      timeout: 10_000,
    });

    await screen.rerender(
      <AppSessionRoot start={start} appState={appState} onError={() => undefined}>
        <LocalFirstProbe />
      </AppSessionRoot>,
    );
    expect(screen.getByText('db-open')).toBeTruthy();
  });

  it('retries a failed start when the app returns to the foreground', async () => {
    let online = false;
    const errors: unknown[] = [];
    const session = harness({ online: true });
    const { appState } = session;
    const start = () =>
      online ? session.start() : Promise.reject(new Error('Network request failed'));

    await render(
      <AppSessionRoot start={start} appState={appState} onError={(error) => errors.push(error)}>
        <Probe />
      </AppSessionRoot>,
    );
    await waitFor(() => expect(errors).toHaveLength(1));

    online = true;
    await act(() => appState.emit('active'));

    await waitFor(() => expect(screen.getByText('ready:uid-online')).toBeTruthy(), {
      timeout: 10_000,
    });
  });
});
