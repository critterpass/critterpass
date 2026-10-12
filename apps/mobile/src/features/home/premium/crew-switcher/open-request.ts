/**
 * A request to open Home's crew switcher from elsewhere: the crews link (`/crew`, Siri's "Your
 * crews", an old notification) lands on Home with the switcher open instead of a sheet of its own.
 * Home answers it once it can draw the switcher's anchor; a request made before Home mounts waits.
 */
import { useEffect } from 'react';

let pending = false;
const listeners = new Set<() => void>();

export function requestCrewSwitcher(): void {
  pending = true;
  for (const listener of listeners) listener();
}

/** Calls `open` for each request, as soon as `ready` (the switcher's anchor is on screen). */
export function useCrewSwitcherRequest(ready: boolean, open: () => void): void {
  useEffect(() => {
    if (!ready) return undefined;
    const answer = () => {
      if (!pending) return;
      pending = false;
      // After this frame's layout, so the anchor measures where it is drawn.
      requestAnimationFrame(open);
    };
    answer();
    listeners.add(answer);
    return () => {
      listeners.delete(answer);
    };
  }, [ready, open]);
}
