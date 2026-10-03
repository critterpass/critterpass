/**
 * A route a sheet asks the map behind it to draw while it is open (7h-2 "Fill a gap" draws the gap
 * idea's detour; 7h-3 draws the shorter order): one preview at a time, held in memory, cleared by
 * whoever set it. The map screen reads it with `usePlanningMapPreview`.
 */
import { useSyncExternalStore } from 'react';

export interface MapPreview {
  /** Who set it, so only they clear it. */
  readonly owner: string;
  /** `[lng, lat]` in order. */
  readonly route: ReadonlyArray<readonly [number, number]>;
  readonly color: string;
  /** Stops to number along it, by key. */
  readonly stops?: ReadonlyArray<{
    readonly key: string;
    readonly lat: number;
    readonly lng: number;
  }>;
}

let current: MapPreview | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function showMapPreview(preview: MapPreview): void {
  current = preview;
  emit();
}

/** Clears the preview if `owner` set it (a later sheet's preview stays). */
export function clearMapPreview(owner: string): void {
  if (current?.owner !== owner) return;
  current = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePlanningMapPreview(): MapPreview | null {
  return useSyncExternalStore(subscribe, () => current);
}
