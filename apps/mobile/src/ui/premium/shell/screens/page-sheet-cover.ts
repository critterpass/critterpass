/**
 * One card at a time for sheets drawn inside a page (not routes): a page's own resting sheet (the
 * plan map's day sheet) steps down while a sheet the page opens over it is up (a stop's details),
 * so the new sheet replaces it instead of stacking a second card on it, and it rises back once
 * that sheet has gone.
 */
import { useEffect, useSyncExternalStore } from 'react';

let covering = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const isCovered = () => covering > 0;

/** Called by a sheet a page opens over itself: the page's resting sheet steps down meanwhile. */
export function useCoverPageSheet(active = true): void {
  useEffect(() => {
    if (!active) return undefined;
    covering += 1;
    emit();
    return () => {
      covering -= 1;
      emit();
    };
  }, [active]);
}

/** True while a sheet the page opened covers the page's resting sheet. */
export function usePageSheetCovered(): boolean {
  return useSyncExternalStore(subscribe, isCovered, isCovered);
}
