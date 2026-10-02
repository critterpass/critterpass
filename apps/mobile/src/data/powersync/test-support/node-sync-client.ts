/**
 * The app's local-first stack on Node, for the end-to-end sync harness
 * (tools/scripts/sync-e2e): the encrypted database from ./open-node-database, the same upload
 * queue, command client, reconcile and connect as ./db.ts (via ../local-first), the app's token
 * cache, and the realtime client with its channel registry. Only the platform seams differ: a
 * Better Auth session cookie instead of the Expo auth client, an in-memory store for realtime
 * positions instead of MMKV, and Node's own fetch and WebSocket.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL, a route path, a wire code or a developer-facing error, never copy. */
import type { CommandDevice } from '@cp/domain';
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { createTokenCache, type TokenAudience } from '../../auth/tokens';
import { createRealtimeClient, type RealtimeClient } from '../../realtime/client';
import { createRecoveryStore, type KeyValueStorage } from '../../realtime/recovery-store';
import { assembleLocalFirstCore, connectLocalFirst, type LocalFirstCore } from '../local-first';
import { resetLocalData } from '../reset';
import { createFetchTransport } from '../transport';
import type { BackoffPolicy } from '../upload-queue';
import { nodeFetch } from './node-realm';
import { openNodeDatabase } from './open-node-database';

export interface NodeSession {
  /** `better-auth.session_token=…`, as the Expo auth client would attach it. */
  readonly cookie: string;
  readonly uid: string;
}

export interface NodeSyncClientOptions {
  /** Directory holding the encrypted database; reopening the same dir and key is an app restart. */
  readonly dir: string;
  readonly key: string;
  /**
   * Database file name. The SDK keys its connection locks by file name, so several devices open in
   * one process each need their own.
   */
  readonly filename: string;
  readonly session: NodeSession;
  readonly apiBaseUrl: string;
  readonly powersyncUrl: string;
  /** `ws://…/connection/websocket`. */
  readonly realtimeUrl: string;
  readonly device: CommandDevice;
  readonly backoff?: BackoffPolicy;
}

export interface NodeSyncClient {
  readonly db: AbstractPowerSyncDatabase;
  readonly core: LocalFirstCore;
  readonly realtime: RealtimeClient;
  readonly uid: string;
  /** Binds the database to the session's uid and starts syncing, as `startLocalFirst` does. */
  connect(): Promise<void>;
  /** Kills the process's view of the database (queue, reconcile, sync, realtime) and closes it. */
  close(): Promise<void>;
}

function memoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getString: (key) => values.get(key),
    set: (key, value) => void values.set(key, value),
    remove: (key) => values.delete(key),
    getAllKeys: () => [...values.keys()],
  };
}

function jwtExpiryMs(token: string): number {
  const [, payload = ''] = token.split('.');
  const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    exp?: number;
  };
  if (typeof exp !== 'number') throw new Error('token has no exp claim');
  return exp * 1000;
}

function tokenCache(apiBaseUrl: string, session: NodeSession) {
  return createTokenCache({
    async getToken(aud: TokenAudience) {
      const response = await nodeFetch(`${apiBaseUrl}/api/auth/token?aud=${aud}`, {
        headers: { cookie: session.cookie },
      });
      if (!response.ok) throw new Error(`token ${aud}: HTTP ${response.status}`);
      const { token } = (await response.json()) as { token: string };
      return { token, expiresAtMs: jwtExpiryMs(token) };
    },
  });
}

export async function openNodeSyncClient(options: NodeSyncClientOptions): Promise<NodeSyncClient> {
  const { session } = options;
  const tokens = tokenCache(options.apiBaseUrl, session);
  const db = await openNodeDatabase({
    dir: options.dir,
    key: options.key,
    filename: options.filename,
  });
  const transport = createFetchTransport({
    baseUrl: options.apiBaseUrl,
    sessionHeaders: () => Promise.resolve({ cookie: session.cookie }),
    fetch: nodeFetch,
  });
  const core = assembleLocalFirstCore({
    db,
    transport,
    uid: () => session.uid,
    device: () => Promise.resolve(options.device),
    onSessionRevoked: () => resetLocalData(db, core.queue),
    ...(options.backoff !== undefined ? { backoff: options.backoff } : {}),
  });
  const realtime = createRealtimeClient({
    uid: session.uid,
    url: options.realtimeUrl,
    getToken: () => tokens.getToken('rt'),
    positions: createRecoveryStore(memoryStorage()),
  });

  return {
    db,
    core,
    realtime,
    uid: session.uid,
    // The sync tests read synced rows next: they wait for the first connection attempt.
    connect: async () => {
      const { connected } = await connectLocalFirst(core, {
        uid: session.uid,
        endpoint: options.powersyncUrl,
        getSyncToken: () => tokens.getToken('sync'),
      });
      await connected;
    },
    async close() {
      realtime.disconnect();
      core.stopReconcile();
      await core.queue.stop();
      await db.close();
    },
  };
}
