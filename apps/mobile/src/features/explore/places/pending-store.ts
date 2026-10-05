/**
 * The saves and hides still on their way, kept per trip outside any one screen: the list and the
 * map lay the same pending actions over the synced places, so a place saved in the list counts on
 * the map's SAVED chip at once. Also remembers that a first save was made (the swipe hint goes).
 */
import { useSyncExternalStore } from 'react';

import type { Pending } from './swipe-actions';

const EMPTY: Pending = new Map();
const byTrip = new Map<string, Pending>();
const listeners = new Set<() => void>();
let savedOnce = false;

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function pendingFor(tripId: string | null): Pending {
  return tripId === null ? EMPTY : (byTrip.get(tripId) ?? EMPTY);
}

export function updatePending(tripId: string, update: (now: Pending) => Pending): void {
  const now = pendingFor(tripId);
  const next = update(now);
  if (next === now) return;
  byTrip.set(tripId, next);
  emit();
}

export function markSavedOnce(): void {
  if (savedOnce) return;
  savedOnce = true;
  emit();
}

export function usePending(tripId: string | null): Pending {
  return useSyncExternalStore(
    subscribe,
    () => pendingFor(tripId),
    () => EMPTY,
  );
}

/** Whether a place was saved by a swipe since the app opened. */
export function useSavedOnce(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => savedOnce,
    () => false,
  );
}

/** Tests start from nothing pending. */
export function resetPendingStore(): void {
  byTrip.clear();
  savedOnce = false;
  emit();
}
