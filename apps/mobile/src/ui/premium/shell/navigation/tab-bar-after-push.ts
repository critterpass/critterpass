/**
 * The iPhone's tab bar on a page pushed inside a tab (a booking, adding one). iOS 26 shows the
 * system tab bar again as a page inside the tab appears (a push, a pop, a sheet going down), so a
 * bar hidden as the push started was back over the page, with the page's footer sitting on it. The
 * bar is therefore hidden once each move inside the tab has landed: it is let go as the move starts
 * (the system is showing it then anyway) and hidden when the page has appeared (`noteMoveLanded`,
 * from the premium stacks), or after `PUSH_LANDS_MS` at the latest.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

/** A move inside a tab's stack that never reports its landing has landed by then. */
export const PUSH_LANDS_MS = 900;

let landings = 0;
const listeners = new Set<() => void>();

/** A page in a premium stack has finished appearing (its transition ended). */
export function noteMoveLanded(): void {
  landings += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const landingCount = () => landings;

interface KeyedRoute {
  readonly key?: string | undefined;
  readonly name: string;
  readonly state?: KeyedState | undefined;
}

interface KeyedState {
  readonly index?: number | undefined;
  readonly routes: readonly KeyedRoute[];
}

/** The keys of the focused route at every level: changes with every push and pop in the app. */
export function focusedPath(state: KeyedState | undefined): string {
  const keys: string[] = [];
  let level = state;
  while (level !== undefined) {
    const route = level.routes[level.index ?? level.routes.length - 1];
    if (route === undefined) break;
    keys.push(route.key ?? route.name);
    level = route.state;
  }
  return keys.join('/');
}

/** Whether to ask the system tab bar to hide: on a pushed page, after each move has landed. */
export function useTabBarHiddenAfterMoves(pushed: boolean, path: string): boolean {
  const [landed, setLanded] = useState<string | null>(null);
  const count = useSyncExternalStore(subscribe, landingCount, landingCount);
  const [startedAt, setStartedAt] = useState({ path, count });
  if (startedAt.path !== path) setStartedAt({ path, count });
  useEffect(() => {
    if (!pushed) return undefined;
    const timer = setTimeout(() => setLanded(path), PUSH_LANDS_MS);
    return () => clearTimeout(timer);
  }, [pushed, path]);
  // A page appeared since this move started: the move has landed.
  const appeared = startedAt.path === path && count > startedAt.count;
  return pushed && (landed === path || appeared);
}
