/**
 * What the app starts on launch, in order (docs/system-architecture.md §4–5):
 *
 * 1. `config/endpoints.json` for the extensions (needs no session, so it never waits on one);
 * 2. the anonymous-first session (an existing one is reused; offline, the last started uid);
 * 3. the local-first database, uploads and sync for that uid;
 * 4. the App Group outbox drain, now and on every return to the foreground;
 * 5. the realtime connection with its background policy;
 * 6. the link router's state checks (the resolver) and local membership lookups.
 *
 * A returning install (a stored last uid) does 3–6 for that uid at once and asks the server whose
 * session this is alongside, so what is on the phone shows without waiting on the network. When
 * the answer names someone else, or no one (revoked, signed out elsewhere, merged), the phone
 * stops being that uid the way a sign-out does (the hooks wipe its local data) and the app
 * restarts. A failed or unanswered check changes nothing: the server still refuses a revoked
 * session at the upload door and the sync token. A first launch keeps the order above.
 *
 * Every native and network dependency is passed in (./device-session.ts wires the real ones), so
 * the whole sequence runs under Jest on a real database.
 */
import type { CommandDevice } from '@cp/domain';

import { registerOnSignOut, runOnSignOutHooks } from '../auth/sign-out-hooks';
import {
  registerExtensionOutboxReset,
  startExtensionOutboxDrain,
  type ExtensionOutbox,
} from '../commands/drain-extension-outbox';
import { createLinkResolverClient, type LinksHttp } from '../../lib/links/resolver-client';
import { configureLinkRouter } from '../../lib/links/router';
import type { LocalFirstAuth } from '../powersync/db';
import type { LocalFirstContextValue } from '../powersync/local-first-context';
import {
  attachAppStatePolicy,
  createRealtimeClient,
  type AppStateSource,
  type RealtimeClient,
} from '../realtime/client';
import type { RecoveryStore } from '../realtime/recovery-store';
import { watchLinkMembership } from './link-membership';

export interface AppSessionAuth extends LocalFirstAuth {
  /** Idempotent: reuses the stored session, else creates the anonymous one. */
  ensureAnonymous(): Promise<{ readonly userId: string }>;
  /** `aud=rt` token for Centrifugo. */
  getRealtimeToken(): Promise<string>;
  /**
   * Whose session the server says this phone holds, or `null` when it holds none any more. Never
   * creates one. Rejects when the server could not be asked or did not answer properly.
   */
  currentSession(): Promise<{ readonly userId: string } | null>;
}

/** The uid the app last started for, so an offline launch still opens its local data. */
export interface LastUidStore {
  read(): string | null;
  write(uid: string): void;
  clear(): void;
}

export interface AppSessionDeps {
  /** Writes `config/endpoints.json` into the App Group. */
  readonly writeEndpoints: () => void;
  readonly auth: AppSessionAuth;
  readonly lastUid: LastUidStore;
  readonly startLocalFirst: (auth: LocalFirstAuth, uid: string) => Promise<LocalFirstContextValue>;
  /** The App Group outbox extensions queue commands in. */
  readonly outbox: ExtensionOutbox;
  readonly device: () => Promise<CommandDevice>;
  readonly appState: AppStateSource;
  /** Signed-in HTTP for the link endpoints (previews for the router's state check). */
  readonly linksHttp: LinksHttp;
  readonly realtime: {
    readonly url: string;
    readonly positions: RecoveryStore;
    readonly websocket?: unknown;
  };
  /** Background failures (a drain, a write) are reported, never thrown into the UI. */
  readonly onError: (error: unknown) => void;
  /** Restarts the app's JavaScript, so it starts again on the session now in storage. */
  readonly restart: () => void;
}

export interface AppSession {
  readonly uid: string;
  readonly localFirst: LocalFirstContextValue;
  readonly realtime: RealtimeClient;
  /** Stops the outbox drain, the realtime connection and the link router's lookups. */
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

/**
 * Asks the server whose session a returning install holds. Still `uid`: nothing changes. Someone
 * else, or no one: this phone stops being `uid` (the sign-out hooks wipe its data, queue and
 * outbox, as for `SESSION_REVOKED`) and the app restarts on the session in storage; with no
 * session left, the restart is a first launch and creates the anonymous one. The check itself
 * never creates a session, so nothing is ever sent for a new uid from the old uid's database.
 */
async function confirmStillUid(
  deps: AppSessionDeps,
  uid: string,
  stopped: () => boolean,
): Promise<void> {
  let holder: { readonly userId: string } | null;
  try {
    holder = await deps.auth.currentSession();
  } catch {
    // Offline or the api is down: the phone keeps working on its local data, as before.
    return;
  }
  if (stopped() || holder?.userId === uid) return;
  try {
    await runOnSignOutHooks();
    if (holder !== null) deps.lastUid.write(holder.userId);
  } catch (error) {
    deps.onError(error);
  }
  deps.restart();
}

export async function startAppSession(deps: AppSessionDeps): Promise<AppSession> {
  try {
    deps.writeEndpoints();
  } catch (error) {
    deps.onError(error);
  }

  const { auth } = deps;
  const returning = deps.lastUid.read();
  const uid = returning ?? (await resolveUid(auth, deps.lastUid));
  const localFirst = await deps.startLocalFirst(
    { getSyncToken: () => auth.getSyncToken(), sessionHeaders: () => auth.sessionHeaders() },
    uid,
  );

  // Signed out, merged or revoked: nothing of this uid is reopened offline or sent as the next one.
  registerOnSignOut(() => deps.lastUid.clear());
  registerExtensionOutboxReset(deps.outbox);
  const stopDrain = startExtensionOutboxDrain({
    db: localFirst.db,
    outbox: deps.outbox,
    uid: () => uid,
    device: deps.device,
    queue: localFirst.queue,
    appState: deps.appState,
    onError: deps.onError,
  });

  const realtime = createRealtimeClient({
    uid,
    url: deps.realtime.url,
    getToken: () => auth.getRealtimeToken(),
    positions: deps.realtime.positions,
    ...(deps.realtime.websocket !== undefined ? { websocket: deps.realtime.websocket } : {}),
  });
  realtime.connect();
  const detachPolicy = attachAppStatePolicy(realtime, deps.appState);

  configureLinkRouter({ resolver: createLinkResolverClient(deps.linksHttp) });
  const stopMembership = watchLinkMembership(localFirst.db, uid, deps.onError);

  let stopped = false;
  if (returning !== null) {
    void confirmStillUid(deps, returning, () => stopped);
  }

  return {
    uid,
    localFirst,
    realtime,
    stop() {
      stopped = true;
      stopDrain();
      detachPolicy();
      realtime.disconnect();
      stopMembership();
      configureLinkRouter({ resolver: null });
    },
  };
}
