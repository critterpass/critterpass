/**
 * App start on a real encrypted database: the session resolves the uid, opens local-first for it
 * and connects realtime; the root provides both and retries a start that failed offline. The only
 * stand-ins are the api (an in-memory session) and the OS lifecycle; realtime dials a port nothing
 * listens on.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useLocalFirst } from '../../powersync/local-first-context';
import type { LocalFirstAuth } from '../../powersync/db';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '../../powersync/test-support/local-first-fixture';
import { removeDir } from '../../powersync/test-support/open-node-database';
import { createDeviceRecoveryStore } from '../../realtime/device-recovery-store';
import { lifecycle } from '../../realtime/test-support/lifecycle';
import { useRealtimeClient } from '../../realtime/use-channel';
import { AppSessionRoot } from '../AppSessionRoot';
import { startAppSession, type AppSession, type AppSessionDeps } from '../start-app-session';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('../../powersync/test-support/node-realm')
      .powersyncCommon,
);

const UNREACHABLE_WS = 'ws://127.0.0.1:49/connection/websocket';

let stacks: TestLocalFirst[] = [];
let sessions: AppSession[] = [];

afterEach(async () => {
  for (const session of sessions) session.stop();
  for (const stack of stacks) {
    await stack.close();
    removeDir(stack.dir);
  }
  stacks = [];
  sessions = [];
});

function memoryLastUid(initial: string | null = null) {
  let value = initial;
  return {
    read: () => value,
    write: (uid: string) => {
      value = uid;
    },
    get current() {
      return value;
    },
  };
}

function deps(options: { online: boolean; lastUid?: ReturnType<typeof memoryLastUid> }) {
  const opened: { uid: string; auth: LocalFirstAuth }[] = [];
  const appState = lifecycle();
  const lastUid = options.lastUid ?? memoryLastUid();
  const value: AppSessionDeps = {
    auth: {
      ensureAnonymous: () =>
        options.online
          ? Promise.resolve({ userId: 'uid-online' })
          : Promise.reject(new Error('Network request failed')),
      getSyncToken: () => Promise.resolve('sync-token'),
      getRealtimeToken: () => Promise.resolve('rt-token'),
      sessionHeaders: () => Promise.resolve({ cookie: 'session=1' }),
    },
    lastUid,
    startLocalFirst: async (auth, uid) => {
      opened.push({ uid, auth });
      const stack = await openTestLocalFirst({ uid, holdUploads: true });
      stacks.push(stack);
      return stack.value;
    },
    appState,
    realtime: { url: UNREACHABLE_WS, positions: createDeviceRecoveryStore() },
  };
  return { value, opened, appState, lastUid };
}

async function started(value: AppSessionDeps): Promise<AppSession> {
  const session = await startAppSession(value);
  sessions.push(session);
  return session;
}

describe('startAppSession', () => {
  it('opens local-first and realtime for the anonymous session uid', async () => {
    const { value, opened, lastUid } = deps({ online: true });

    const session = await started(value);

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
    const returning = deps({ online: false, lastUid: memoryLastUid('uid-before') });
    await expect(started(returning.value)).resolves.toMatchObject({ uid: 'uid-before' });

    const first = deps({ online: false });
    await expect(startAppSession(first.value)).rejects.toThrow('Network request failed');
    expect(first.opened).toEqual([]);
  });

  it('disconnects realtime when the session stops', async () => {
    const { value } = deps({ online: true });
    const session = await started(value);

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
    const { value, appState } = deps({ online: true });
    const start = () => started(value);

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
    const { value, appState } = deps({ online: true });
    const start = () =>
      online ? started(value) : Promise.reject(new Error('Network request failed'));

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
