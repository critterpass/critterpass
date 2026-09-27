/**
 * The app's one Centrifugo connection (docs/system-architecture.md §5 realtime): centrifuge-js with
 * a short-lived `aud=rt` token from `/api/auth/token` (data/auth/tokens.ts caches it and refreshes
 * 60 s before `exp`; centrifuge-js asks again whenever the server says the token expired), the
 * ref-counted channel registry, and the background policy: 30 s after the app leaves the
 * foreground the socket closes, and it reopens (recovering every channel) on return.
 */
import { Centrifuge } from 'centrifuge';

import type { RecoveryStore } from './recovery-store';
import { createChannelRegistry, type ChannelRegistry } from './subscriptions';

export const BACKGROUND_DISCONNECT_MS = 30_000;

export interface CreateRealtimeClientOptions {
  /** The signed-in uid (the token's `sub`); an account switch builds a new client. */
  readonly uid: string;
  /** `wss://…/connection/websocket`. */
  readonly url: string;
  /** Resolves a fresh `aud=rt` connection token, e.g. `() => tokens.getToken('rt')`. */
  readonly getToken: () => Promise<string>;
  /** Persisted stream positions: `createDeviceRecoveryStore()` in the app. */
  readonly positions: RecoveryStore;
  /** WebSocket implementation; React Native's global one when omitted. */
  readonly websocket?: unknown;
}

export interface RealtimeClient {
  readonly centrifuge: Centrifuge;
  readonly channels: ChannelRegistry;
  readonly positions: RecoveryStore;
  /** The signed-in user this connection belongs to. */
  readonly uid: string;
  connect(): void;
  disconnect(): void;
}

export function createRealtimeClient(options: CreateRealtimeClientOptions): RealtimeClient {
  const { positions } = options;
  const centrifuge = new Centrifuge(options.url, {
    getToken: () => options.getToken(),
    ...(options.websocket !== undefined ? { websocket: options.websocket } : {}),
  });
  // Transport and token errors surface as reconnect attempts; unhandled, the emitter would throw.
  centrifuge.on('error', () => undefined);
  const channels = createChannelRegistry(centrifuge, positions);
  return {
    centrifuge,
    channels,
    positions,
    uid: options.uid,
    connect: () => centrifuge.connect(),
    disconnect: () => centrifuge.disconnect(),
  };
}

/** The slice of React Native's `AppState` the policy needs. */
export interface AppStateSource {
  readonly currentState: string;
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void };
}

export interface Connectable {
  connect(): void;
  disconnect(): void;
}

export interface AppStatePolicyOptions {
  readonly graceMs?: number;
  readonly setTimer?: (callback: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

/**
 * Closes the connection once the app has been in the background for `graceMs` and reopens it on
 * return to the foreground. `inactive` (control centre, app switcher) counts as foreground so a
 * glance away never drops presence. Returns a function that detaches the policy.
 */
export function attachAppStatePolicy(
  client: Connectable,
  appState: AppStateSource,
  options: AppStatePolicyOptions = {},
): () => void {
  const graceMs = options.graceMs ?? BACKGROUND_DISCONNECT_MS;
  const setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer =
    options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let timer: unknown;
  let disconnected = false;

  function cancel(): void {
    if (timer === undefined) return;
    clearTimer(timer);
    timer = undefined;
  }

  function onChange(state: string): void {
    if (state === 'background') {
      if (timer !== undefined || disconnected) return;
      timer = setTimer(() => {
        timer = undefined;
        disconnected = true;
        client.disconnect();
      }, graceMs);
      return;
    }
    cancel();
    if (disconnected) {
      disconnected = false;
      client.connect();
    }
  }

  const subscription = appState.addEventListener('change', onChange);
  if (appState.currentState === 'background') onChange('background');
  return () => {
    cancel();
    subscription.remove();
  };
}
