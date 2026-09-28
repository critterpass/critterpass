/**
 * Per-device location prefs (MMKV): the explicit, foreground-only "explore at home" opt-in
 * (collecting at home needs it, and it never runs a background session).
 */
import { useSyncExternalStore } from 'react';
import { createMMKV } from 'react-native-mmkv';

const KEY = 'explore-at-home';
let storage: {
  getBoolean(key: string): boolean | undefined;
  set(key: string, value: boolean): void;
} | null = null;
const listeners = new Set<() => void>();

function prefsStorage() {
  storage ??= createMMKV({ id: 'cp-location-prefs' });
  return storage;
}

export function getExploreAtHome(): boolean {
  return prefsStorage().getBoolean(KEY) ?? false;
}

export function setExploreAtHome(on: boolean): void {
  prefsStorage().set(KEY, on);
  for (const listener of listeners) listener();
}

export function useExploreAtHome(): boolean {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, getExploreAtHome);
}
