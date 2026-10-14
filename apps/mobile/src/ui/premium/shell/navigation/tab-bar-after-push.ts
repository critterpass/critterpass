/**
 * The iPhone's tab bar on a page pushed inside a tab (a booking, adding one). iOS 26's navigation
 * controller shows the system tab bar again as a push or a pop inside the tab lands, so a bar
 * hidden as the push started was back over the page (with the page's footer sitting on it). The
 * bar is therefore hidden again once each move inside the tab has landed: it is let go as the move
 * starts (the system is showing it then anyway) and hidden after it.
 */
import { useEffect, useState } from 'react';

/** A push or pop inside a tab's stack has landed by then. */
export const PUSH_LANDS_MS = 450;

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
  useEffect(() => {
    if (!pushed) return undefined;
    const timer = setTimeout(() => setLanded(path), PUSH_LANDS_MS);
    return () => clearTimeout(timer);
  }, [pushed, path]);
  return pushed && landed === path;
}
