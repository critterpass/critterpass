/**
 * Keeps this install's `devices`/`push_tokens` rows fresh (docs/api-contracts.md §4.1): registers on
 * launch, whenever the OS rotates the push token, when the app returns to the foreground (throttled
 * to one heartbeat per 10 min by ./register.ts) and once when it leaves the foreground. Calls are
 * serialised so a burst of app-state changes never races two registrations. Failures are reported
 * and retried by the next trigger; nothing here blocks the UI.
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
import { readPushToken, type PushNative, type PushPlatform } from './tokens';

export type AppStateStatus = 'active' | 'background' | 'inactive' | (string & {});

export interface PushLifecycleDeps {
  readonly native: PushNative;
  readonly transport: CommandTransport;
  readonly storage: InstallIdStorage;
  /** The signed-in uid (anonymous included); `undefined` before a session exists. */
  readonly currentUid: () => Promise<string | undefined>;
  readonly platform: PushPlatform;
  readonly appVersion: string;
  readonly osVersion?: string;
  readonly locale: () => string;
  readonly timeZone: () => string;
  readonly capabilities?: DeviceCapabilities;
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
  let queue: Promise<void> = Promise.resolve();
  const unsubscribers: (() => void)[] = [];

  async function run(reason: RegisterReason, rotatedToken: string | undefined): Promise<void> {
    const uid = await deps.currentUid();
    if (uid === undefined) return;
    const snapshot = await readPushToken(deps.native);
    const token = rotatedToken ?? snapshot?.token;
    const at = now();
    if (!shouldRegister(reason, last, at, token)) return;
    const foreground = reason !== 'background';
    await sendRegisterDevice(
      deps.transport,
      {
        uid,
        installId: await getOrCreateInstallId(deps.storage),
        platform: deps.platform,
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
  }

  function trigger(reason: RegisterReason, token?: string): Promise<void> {
    queue = queue.then(() => run(reason, token)).catch((error: unknown) => deps.onError?.(error));
    return queue;
  }

  return {
    async start() {
      unsubscribers.push(
        deps.native.onTokenChange((next) => void trigger('token_change', next.data.trim())),
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
