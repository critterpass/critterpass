/**
 * The POI the user is at right now (from the visit detector), for the feedback bus's quiet rules
 * — sounds mute inside a temple — and for check-in surfaces. Never more than a POI id and a
 * category; nothing is stored.
 */
import type { PoiCategory } from '@cp/domain';
import { useSyncExternalStore } from 'react';

export interface CurrentVisit {
  readonly poiId: string;
  readonly category: PoiCategory;
}

let current: CurrentVisit | null = null;
const listeners = new Set<() => void>();

export function setCurrentVisit(next: CurrentVisit | null): void {
  if (next?.poiId === current?.poiId && next?.category === current?.category) return;
  current = next;
  for (const listener of listeners) listener();
}

export function getCurrentVisit(): CurrentVisit | null {
  return current;
}

export function subscribeCurrentVisit(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCurrentVisit(): CurrentVisit | null {
  return useSyncExternalStore(subscribeCurrentVisit, getCurrentVisit);
}
