/**
 * The day a person is looking at in a trip's plan, shared by the trip map, the day plan, its open
 * map and all days: picking a day in one view is the day the next view opens on, and the view left
 * underneath shows it when she comes back. Kept per trip for as long as the app runs.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

const chosen = new Map<string, number>();
const listeners = new Set<() => void>();

export function chosenDay(tripId: string): number | null {
  return chosen.get(tripId) ?? null;
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function setChosenDay(tripId: string, dayNo: number): void {
  if (chosen.get(tripId) === dayNo) return;
  chosen.set(tripId, dayNo);
  notify();
}

/** Forgets every trip's day (tests). */
export function resetChosenDays(): void {
  chosen.clear();
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The trip's chosen day and its setter. `opened` is the day the screen was opened on (a link's
 * `day`): it becomes the chosen day once, when the screen mounts, so a link wins over an earlier
 * choice and a later pick in any view wins over the link.
 */
export function useChosenDay(
  tripId: string,
  opened?: number | null,
): readonly [number | null, (dayNo: number) => void] {
  // Seeded before the first read, so the screen never draws the earlier day first; the views
  // underneath hear of it once this one has mounted.
  useState(() => {
    if (opened != null) chosen.set(tripId, opened);
    return null;
  });
  useEffect(() => {
    if (opened != null) notify();
    // Only the day the screen was opened on seeds the choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const read = useCallback(() => chosenDay(tripId), [tripId]);
  const seeded = useSyncExternalStore(subscribe, read, read);
  const set = useCallback((dayNo: number) => setChosenDay(tripId, dayNo), [tripId]);
  return [seeded, set] as const;
}
