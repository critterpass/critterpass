/**
 * The app-wide permission orchestrator and the hooks screens use. The route layer wires the
 * native port and the mirror's command sender (`configurePermissions`); the primer sheet host
 * registers itself as the presenter. Features only ever call `usePermission(kind).request(trigger)`
 * or `requestWithPrimer`.
 */
import type { DevicePermissionState, PermissionKind, PermissionTrigger } from '@cp/domain';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { createMMKV } from 'react-native-mmkv';

import { createMirror, type PermissionMirror } from './mirror';
import {
  createOrchestrator,
  type PermissionAnalyticsEvent,
  type PermissionOrchestrator,
  type PermissionsPort,
  type PrimerPresenter,
  type RequestLevel,
  type RequestOutcome,
} from './orchestrator';
import {
  getPermissionStore,
  type KeyValueStorage,
  type PermissionReport,
  type PermissionsSnapshot,
  type PermissionStore,
} from './store';

export interface PermissionsWiring {
  readonly port: PermissionsPort;
  readonly sendMirror: (
    perms: Parameters<Parameters<typeof createMirror>[0]['send']>[0],
  ) => Promise<unknown>;
  readonly storage?: KeyValueStorage;
  readonly store?: PermissionStore;
  readonly reaskWindowMs?: () => number | undefined;
  readonly track?: (event: PermissionAnalyticsEvent) => void;
  readonly now?: () => number;
}

interface Wired {
  readonly orchestrator: PermissionOrchestrator;
  readonly mirror: PermissionMirror;
  readonly store: PermissionStore;
  readonly port: PermissionsPort;
}

let wired: Wired | null = null;
let presenter: PrimerPresenter | null = null;

export function configurePermissions(wiring: PermissionsWiring): Wired {
  const store = wiring.store ?? getPermissionStore();
  const storage = wiring.storage ?? createMMKV({ id: 'cp-permissions-mirror' });
  wired = {
    store,
    port: wiring.port,
    orchestrator: createOrchestrator({
      port: wiring.port,
      store,
      presenter: () => presenter,
      ...(wiring.now ? { now: wiring.now } : {}),
      ...(wiring.reaskWindowMs ? { reaskWindowMs: wiring.reaskWindowMs } : {}),
      ...(wiring.track ? { track: wiring.track } : {}),
    }),
    mirror: createMirror({ send: wiring.sendMirror, storage }),
  };
  return wired;
}

/** The primer sheet host registers here; returns the unregister function. */
export function registerPrimerPresenter(next: PrimerPresenter): () => void {
  presenter = next;
  return () => {
    if (presenter === next) presenter = null;
  };
}

function requireWired(): Wired {
  if (wired === null) {
    throw new Error('configurePermissions has not run');
  }
  return wired;
}

/** Folds a fresh cp-permissions snapshot into the store and mirrors it to the server. */
export function applyPermissionsSnapshot(snapshot: PermissionsSnapshot): Promise<boolean> {
  const { store, mirror } = requireWired();
  store.setSnapshot(snapshot);
  return mirror.update(store.getState());
}

export function requestWithPrimer(
  kind: PermissionKind,
  trigger: PermissionTrigger,
  opts?: { readonly level?: RequestLevel; readonly primed?: boolean },
): Promise<RequestOutcome> {
  const { orchestrator, store, mirror } = requireWired();
  return orchestrator.requestWithPrimer(kind, trigger, opts).then(async (outcome) => {
    await mirror.update(store.getState()).catch(() => false);
    return outcome;
  });
}

export function openPermissionSettings(kind: PermissionKind): Promise<boolean> {
  return requireWired().orchestrator.openSettingsFor(kind);
}

const noStore = {
  subscribe: () => () => undefined,
  getState: () => undefined,
};

/** One kind's latest report (undefined until first read) and its request/Settings actions. */
export function usePermission(kind: PermissionKind): {
  readonly report: PermissionReport | undefined;
  readonly request: (trigger: PermissionTrigger, level?: RequestLevel) => Promise<RequestOutcome>;
  readonly openSettings: () => Promise<boolean>;
} {
  const store = wired?.store;
  const subscribe = useCallback(
    (listener: () => void) => (store ? store.subscribe(listener) : noStore.subscribe()),
    [store],
  );
  const report = useSyncExternalStore(
    subscribe,
    () => store?.getState().reports[kind] ?? noStore.getState(),
  );
  const request = useCallback(
    (trigger: PermissionTrigger, level?: RequestLevel) =>
      requestWithPrimer(kind, trigger, level !== undefined ? { level } : {}),
    [kind],
  );
  const openSettings = useCallback(() => openPermissionSettings(kind), [kind]);
  return { report, request, openSettings };
}

/** The `update_device_permissions` command as the app's command client sends it. */
export const UPDATE_DEVICE_PERMISSIONS = {
  name: 'update_device_permissions',
  offline: true,
} as const;

export interface PermissionsWatcher {
  watch(listener: (snapshot: PermissionsSnapshot) => void): () => void;
}

/**
 * Keeps the store and the server mirror current while the session runs: re-reads on every
 * foreground (cp-permissions `watch`) and sends one mirror per change through `send`.
 */
export function usePermissionsBridge(
  source: PermissionsWatcher,
  send: (perms: DevicePermissionState) => Promise<unknown>,
): void {
  useEffect(() => {
    senders.add(send);
    const stop = source.watch((snapshot) => {
      void applyPermissionsSnapshot(snapshot).catch(() => false);
    });
    return () => {
      senders.delete(send);
      stop();
    };
  }, [source, send]);
}

const senders = new Set<(perms: DevicePermissionState) => Promise<unknown>>();

/** The mirror sender `configurePermissions` gets from the route layer: the live session's client. */
export function sendMirrorThroughSession(perms: DevicePermissionState): Promise<unknown> {
  const [send] = senders;
  if (send === undefined) return Promise.reject(new Error('no session to send the mirror'));
  return send(perms);
}
