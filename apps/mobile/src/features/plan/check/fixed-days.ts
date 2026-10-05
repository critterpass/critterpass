/**
 * Days whose findings a fix just changed, so their cards leave the check at once: a fixer screen
 * (a new order, the day's swaps) notes the day it changed, and the check hides that day's issues
 * until its next run replaces them. Day ids belong to one plan version, so a note never outlives
 * the plan it was made on.
 */
import { useSyncExternalStore } from 'react';

let fixed: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

export function noteDayFixed(dayId: string): void {
  if (fixed.has(dayId)) return;
  fixed = new Set([...fixed, dayId]);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFixedDays(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribe,
    () => fixed,
    () => fixed,
  );
}
