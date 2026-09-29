/**
 * The trip the member picked on Balances, shared by every money screen for the session (the
 * default pick is the trip under way, so this is only set when they switch).
 */
import { useSyncExternalStore } from 'react';

let selected: string | null = null;
const listeners = new Set<() => void>();

export function selectTrip(tripId: string | null): void {
  selected = tripId;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSelectedTrip(): string | null {
  return useSyncExternalStore(subscribe, () => selected);
}
