/**
 * `startAppSession` dependencies for tests: a real encrypted database per start, the App Group
 * outbox on a real directory, persisted realtime positions, and an in-memory api session (the
 * network boundary). Realtime dials a port nothing listens on. The api's flags are its recorded
 * `GET /v1/config/bootstrap` answer online, and no response offline.
 */
/* eslint-disable lingui/no-unlocalized-strings -- test support; literals are wire values. */
import type { LocalFirstAuth } from '../../powersync/db';
import {
  openTestLocalFirst,
  TEST_DEVICE,
  type TestLocalFirst,
} from '../../powersync/test-support/local-first-fixture';
import { removeDir, tempDatabaseDir } from '../../powersync/test-support/open-node-database';
import { fileOutbox, type FileOutbox } from '../../commands/test-support/file-outbox';
import bootstrap from '../../../lib/analytics/test-support/config-bootstrap.json';
import { fakeLinksHttp, standardRoutes } from '../../../lib/links/test-support/fake-links-http';
import { createDeviceRecoveryStore } from '../../realtime/device-recovery-store';
import { lifecycle, type Lifecycle } from '../../realtime/test-support/lifecycle';
import { startAppSession, type AppSession, type AppSessionDeps } from '../start-app-session';

export const UNREACHABLE_WS = 'ws://127.0.0.1:49/connection/websocket';

export interface MemoryLastUid {
  read(): string | null;
  write(uid: string): void;
  clear(): void;
  readonly current: string | null;
}

export function memoryLastUid(initial: string | null = null): MemoryLastUid {
  let value = initial;
  return {
    read: () => value,
    write: (uid) => {
      value = uid;
    },
    clear: () => {
      value = null;
    },
    get current() {
      return value;
    },
  };
}

export interface SessionHarness {
  readonly value: AppSessionDeps;
  readonly opened: { uid: string; auth: LocalFirstAuth }[];
  readonly appState: Lifecycle;
  readonly lastUid: MemoryLastUid;
  readonly outbox: FileOutbox;
  readonly endpointWrites: string[];
  readonly errors: unknown[];
  /** Every request to the link endpoints, answered from recorded fixtures. */
  readonly linkRequests: { method: string; path: string; body?: unknown }[];
  /** One entry per `GET /v1/config/bootstrap` the session made. */
  readonly flagRequests: string[];
  readonly start: () => Promise<AppSession>;
  readonly close: () => Promise<void>;
}

export function sessionHarness(options: {
  online: boolean;
  lastUid?: MemoryLastUid;
}): SessionHarness {
  const opened: { uid: string; auth: LocalFirstAuth }[] = [];
  const stacks: TestLocalFirst[] = [];
  const sessions: AppSession[] = [];
  const outboxDir = tempDatabaseDir();
  const outbox = fileOutbox(outboxDir);
  const endpointWrites: string[] = [];
  const errors: unknown[] = [];
  const appState = lifecycle();
  const lastUid = options.lastUid ?? memoryLastUid();
  const links = fakeLinksHttp(standardRoutes);
  const flagRequests: string[] = [];
  const value: AppSessionDeps = {
    writeEndpoints: () => endpointWrites.push('config/endpoints.json'),
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
    outbox,
    device: () => Promise.resolve(TEST_DEVICE),
    appState,
    linksHttp: links.http,
    fetchServerFlags: () => {
      flagRequests.push('/v1/config/bootstrap');
      return options.online
        ? Promise.resolve({ status: 200, body: bootstrap })
        : Promise.reject(new Error('Network request failed'));
    },
    realtime: { url: UNREACHABLE_WS, positions: createDeviceRecoveryStore() },
    onError: (error) => errors.push(error),
  };
  return {
    value,
    opened,
    appState,
    lastUid,
    outbox,
    endpointWrites,
    errors,
    linkRequests: links.requests,
    flagRequests,
    start: async () => {
      const session = await startAppSession(value);
      sessions.push(session);
      return session;
    },
    close: async () => {
      for (const session of sessions) session.stop();
      for (const stack of stacks) {
        await stack.close();
        removeDir(stack.dir);
      }
      removeDir(outboxDir);
    },
  };
}
