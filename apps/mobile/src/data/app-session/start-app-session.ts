/**
 * What the app starts on launch, in order (docs/system-architecture.md §4–5):
 *
 * 1. the anonymous-first session (an existing one is reused; offline, the last started uid);
 * 2. the local-first database, uploads and sync for that uid;
 * 3. the realtime connection with its background policy.
 *
 * Every native and network dependency is passed in (./device-session.ts wires the real ones), so
 * the whole sequence runs under Jest on a real database.
 */
import type { LocalFirstAuth } from '../powersync/db';
import type { LocalFirstContextValue } from '../powersync/local-first-context';
import {
  attachAppStatePolicy,
  createRealtimeClient,
  type AppStateSource,
  type RealtimeClient,
} from '../realtime/client';
import type { RecoveryStore } from '../realtime/recovery-store';

export interface AppSessionAuth extends LocalFirstAuth {
  /** Idempotent: reuses the stored session, else creates the anonymous one. */
  ensureAnonymous(): Promise<{ readonly userId: string }>;
  /** `aud=rt` token for Centrifugo. */
  getRealtimeToken(): Promise<string>;
}

/** The uid the app last started for, so an offline launch still opens its local data. */
export interface LastUidStore {
  read(): string | null;
  write(uid: string): void;
}

export interface AppSessionDeps {
  readonly auth: AppSessionAuth;
  readonly lastUid: LastUidStore;
  readonly startLocalFirst: (auth: LocalFirstAuth, uid: string) => Promise<LocalFirstContextValue>;
  readonly appState: AppStateSource;
  readonly realtime: {
    readonly url: string;
    readonly positions: RecoveryStore;
    readonly websocket?: unknown;
  };
}

export interface AppSession {
  readonly uid: string;
  readonly localFirst: LocalFirstContextValue;
  readonly realtime: RealtimeClient;
  /** Stops the realtime connection. */
  stop(): void;
}

async function resolveUid(auth: AppSessionAuth, lastUid: LastUidStore): Promise<string> {
  try {
    const { userId } = await auth.ensureAnonymous();
    lastUid.write(userId);
    return userId;
  } catch (error) {
    // No network (or the api is down): a returning install keeps working on its local data and
    // syncs once the connector reaches the service; a first launch has nothing to open yet.
    const previous = lastUid.read();
    if (previous === null) throw error;
    return previous;
  }
}

export async function startAppSession(deps: AppSessionDeps): Promise<AppSession> {
  const { auth } = deps;
  const uid = await resolveUid(auth, deps.lastUid);
  const localFirst = await deps.startLocalFirst(
    { getSyncToken: () => auth.getSyncToken(), sessionHeaders: () => auth.sessionHeaders() },
    uid,
  );

  const realtime = createRealtimeClient({
    uid,
    url: deps.realtime.url,
    getToken: () => auth.getRealtimeToken(),
    positions: deps.realtime.positions,
    ...(deps.realtime.websocket !== undefined ? { websocket: deps.realtime.websocket } : {}),
  });
  realtime.connect();
  const detachPolicy = attachAppStatePolicy(realtime, deps.appState);

  return {
    uid,
    localFirst,
    realtime,
    stop() {
      detachPolicy();
      realtime.disconnect();
    },
  };
}
