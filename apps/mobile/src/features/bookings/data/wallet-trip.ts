/**
 * The trip the wallet was opened for (a trip hub's Bookings tile names it), shared by every
 * bookings screen for the session so a booking opened from that stack is looked up in the same
 * trip. Unset, the wallet picks a trip of its own.
 */
import { useSyncExternalStore } from 'react';

let opened: string | null = null;
const listeners = new Set<() => void>();

export function openWalletTrip(tripId: string | null): void {
  if (tripId === opened) return;
  opened = tripId;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWalletTripId(): string | null {
  return useSyncExternalStore(subscribe, () => opened);
}
