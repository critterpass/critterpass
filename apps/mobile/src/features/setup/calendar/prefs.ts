/**
 * This device's calendar settings for setup: whether tentative events are shared as "maybe
 * busy" (off until the member turns it on) and when the device calendar last synced. Neither is
 * calendar content, so plain device storage is enough.
 */
/* eslint-disable lingui/no-unlocalized-strings -- storage keys, never copy. */
import { useCallback, useSyncExternalStore } from 'react';
import { createMMKV } from 'react-native-mmkv';

// createMMKV() returns its own in-memory store under Jest, so tests use the real module.
const storage = createMMKV({ id: 'cp-setup-calendar' });
const TENTATIVE = 'tentative';
const LAST_SYNC = 'last_sync_at';
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readTentative(): boolean {
  return storage.getBoolean(TENTATIVE) ?? false;
}

export function readLastSync(): Date | null {
  const at = storage.getNumber(LAST_SYNC);
  return at === undefined ? null : new Date(at);
}

export function writeLastSync(at: number): void {
  storage.set(LAST_SYNC, at);
  notify();
}

/** Test-only: every test starts from a fresh device. */
export function resetCalendarPrefs(): void {
  storage.remove(TENTATIVE);
  storage.remove(LAST_SYNC);
  notify();
}

export function useCalendarPrefs() {
  const tentative = useSyncExternalStore(subscribe, readTentative);
  const lastSyncMs = useSyncExternalStore(subscribe, () => readLastSync()?.getTime() ?? null);
  const setTentative = useCallback((next: boolean) => {
    storage.set(TENTATIVE, next);
    notify();
  }, []);
  return {
    tentative,
    setTentative,
    lastSyncedAt: lastSyncMs === null ? null : new Date(lastSyncMs),
  };
}
