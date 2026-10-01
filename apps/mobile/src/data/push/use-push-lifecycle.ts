/**
 * Keeps this install's `devices`/`push_tokens` rows fresh (docs/api-contracts.md §4.1): registers on
 * launch, whenever the OS rotates the push token, when the app returns to the foreground (throttled
 * to one heartbeat per 10 min by ./register.ts) and once when it leaves the foreground. Calls are
 * serialised so a burst of app-state changes never races two registrations. Failures are reported
 * and retried by the next trigger; nothing here blocks the UI.
 *
 * Once the server has this install for the signed-in person, every launch and foreground also
 * makes sure the extensions' action key is in the shared Keychain (./action-key.ts): the key is
 * what the notification service extension fetches a private push's text with. Whether there is a
 * key is read from the Keychain each time, never remembered here, so a refused or failed request
 * is asked again on the next trigger.
 *
 * On iOS every token read (`registerForRemoteNotifications`) also fires the token listener with the
 * same token, so a rotation event only counts when its token differs from the last one seen, and a
 * rotation registers the token it carries without reading it again: otherwise each registration's
 * own read would start the next one.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: trigger reasons are
   internal identifiers, never rendered copy. */
import { useEffect } from 'react';

import {
  getOrCreateInstallId,
  sendRegisterDevice,
  shouldRegister,
  type CommandTransport,
  type DeviceCapabilities,
  type InstallIdStorage,
  type LastRegistration,
  type RegisterReason,
} from './register';
import { readPushToken, toApnsEnv, type PushNative, type PushPlatform } from './tokens';

export type AppStateStatus = 'active' | 'background' | 'inactive' | (string & {});

export interface PushLifecycleDeps {
  readonly native: PushNative;
  readonly transport: CommandTransport;
  readonly storage: InstallIdStorage;
  /** The signed-in uid (anonymous included); `undefined` before a session exists. */
  readonly currentUid: () => Promise<string | undefined>;
  readonly platform: PushPlatform;
  readonly bundleId?: string;
  readonly appVersion: string;
  readonly osVersion?: string;
  readonly locale: () => string;
  readonly timeZone: () => string;
  readonly capabilities?: DeviceCapabilities;
  /**
   * Issues or rotates the extensions' action key for this install when one is needed; absent
   * where nothing reads one. Called only after `register_device` applied for `userId`.
   */
  readonly ensureActionKey?: (owner: {
    readonly deviceId: string;
    readonly userId: string;
  }) => Promise<unknown>;
  readonly subscribeAppState: (listener: (state: AppStateStatus) => void) => () => void;
  readonly now?: () => number;
  readonly onError?: (error: unknown) => void;
}

export interface PushLifecycle {
  start(): Promise<void>;
  /** Runs one trigger now; resolves once it (and any call queued before it) has settled. */
  trigger(reason: RegisterReason, token?: string): Promise<void>;
  stop(): void;
}

export function createPushLifecycle(deps: PushLifecycleDeps): PushLifecycle {
  const now = deps.now ?? Date.now;
  let last: LastRegistration | undefined;
  /** The uid the server last accepted this install's registration for, in this process. */
  let registeredUid: string | undefined;
  /** The newest token this install has read or been handed, registered or not. */
  let seenToken: string | undefined;
  let queue: Promise<void> = Promise.resolve();
  const unsubscribers: (() => void)[] = [];

  async function currentToken(rotatedToken: string | undefined) {
    if (rotatedToken !== undefined) {
      return { token: rotatedToken, apnsEnv: toApnsEnv(await deps.native.getApnsEnvironment()) };
    }
    const snapshot = await readPushToken(deps.native);
    if (snapshot !== undefined) seenToken = snapshot.token;
    return snapshot;
  }

  async function run(reason: RegisterReason, rotatedToken: string | undefined): Promise<void> {
    const uid = await deps.currentUid();
    if (uid === undefined) return;
    const snapshot = await currentToken(rotatedToken);
    const token = snapshot?.token;
    const at = now();
    const installId = await getOrCreateInstallId(deps.storage);
    if (shouldRegister(reason, last, at, token)) {
      await register(reason, uid, installId, snapshot, at);
    }
    if (reason !== 'background' && registeredUid === uid) {
      await deps.ensureActionKey?.({ deviceId: installId, userId: uid });
    }
  }

  async function register(
    reason: RegisterReason,
    uid: string,
    installId: string,
    snapshot: Awaited<ReturnType<typeof currentToken>>,
    at: number,
  ): Promise<void> {
    const token = snapshot?.token;
    const foreground = reason !== 'background';
    await sendRegisterDevice(
      deps.transport,
      {
        uid,
        installId,
        platform: deps.platform,
        ...(deps.bundleId !== undefined ? { bundleId: deps.bundleId } : {}),
        appVersion: deps.appVersion,
        ...(deps.osVersion !== undefined ? { osVersion: deps.osVersion } : {}),
        tz: deps.timeZone(),
        locale: deps.locale(),
        foreground,
        ...(token !== undefined ? { pushToken: token, apnsEnv: snapshot?.apnsEnv ?? 'prod' } : {}),
        ...(deps.capabilities !== undefined ? { capabilities: deps.capabilities } : {}),
      },
      new Date(at),
    );
    last = { at, foreground, token };
    registeredUid = uid;
  }

  function trigger(reason: RegisterReason, token?: string): Promise<void> {
    queue = queue.then(() => run(reason, token)).catch((error: unknown) => deps.onError?.(error));
    return queue;
  }

  return {
    async start() {
      unsubscribers.push(
        deps.native.onTokenChange((next) => {
          const token = next.data.trim();
          if (token.length === 0 || token === seenToken) return;
          seenToken = token;
          void trigger('token_change', token);
        }),
        deps.subscribeAppState((state) => {
          if (state === 'active') void trigger('foreground');
          else if (state === 'background') void trigger('background');
        }),
      );
      await trigger('launch');
    },
    trigger,
    stop() {
      for (const unsubscribe of unsubscribers.splice(0)) unsubscribe();
    },
  };
}

/** Mounts the lifecycle for as long as the calling component (the app root) is mounted. */
export function usePushLifecycle(deps: PushLifecycleDeps | undefined): void {
  useEffect(() => {
    if (deps === undefined) return undefined;
    const lifecycle = createPushLifecycle(deps);
    void lifecycle.start();
    return () => lifecycle.stop();
  }, [deps]);
}
