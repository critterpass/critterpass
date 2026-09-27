/**
 * Device connectivity for the sync status and the upload queue. `createNetworkState` is the plain
 * observable the Expo source feeds; `retryWhenOnline` skips a pending upload backoff the moment
 * the device comes back online instead of waiting out the delay.
 */
import { addNetworkStateListener, getNetworkStateAsync, type NetworkState } from 'expo-network';

export interface NetworkSource {
  isOnline(): boolean;
  subscribe(listener: (online: boolean) => void): () => void;
}

export function createNetworkState(initial: boolean): NetworkSource & {
  set(online: boolean): void;
} {
  let online = initial;
  const listeners = new Set<(online: boolean) => void>();
  return {
    isOnline: () => online,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      if (next === online) return;
      online = next;
      for (const listener of listeners) listener(online);
    },
  };
}

/** Reachable unless the OS says otherwise; `isInternetReachable` is null while still unknown. */
export function isOnline(state: NetworkState): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

/** Live connectivity from expo-network; assumes online until the first reading arrives. */
export function createExpoNetworkSource(): NetworkSource {
  const state = createNetworkState(true);
  void getNetworkStateAsync().then((reading) => state.set(isOnline(reading)));
  addNetworkStateListener((reading) => state.set(isOnline(reading)));
  return state;
}

export function retryWhenOnline(
  network: NetworkSource,
  queue: { retryNow(): Promise<void> },
): () => void {
  return network.subscribe((online) => {
    if (online) void queue.retryNow();
  });
}
