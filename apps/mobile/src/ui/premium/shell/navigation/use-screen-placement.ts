/**
 * Where the current screen sits in the navigation tree (`screenPlacement`), read from the
 * navigator it renders in and the navigators above it. The screen scaffolds read it to pick their
 * leading control: a pushed screen shows the glass back `<`, the first screen of a sheet or modal
 * shows ✕ (or Cancel), a tab's first screen shows neither.
 */
import { useContext, useEffect, useReducer, type ContextType } from 'react';
import { NavigationContext, NavigationRouteContext } from 'expo-router/react-navigation';
import { ScreenPresentationContext } from '@/lib/navigation/router-internals';

import {
  screenPlacement,
  type NavigatorLevel,
  type ScreenPlacement,
  type ScreenPresentation,
} from '@/lib/navigation/presentation';

type NativePresentation = NonNullable<ContextType<typeof ScreenPresentationContext>>;

/** The screen's own presentation in its stack, as the native stack set it. */
export function fromNative(
  presentation: NativePresentation | undefined,
): ScreenPresentation | undefined {
  switch (presentation) {
    case undefined:
    case 'card':
      return undefined;
    case 'formSheet':
      return { kind: 'sheet', detents: [1] };
    case 'fullScreenModal':
      return { kind: 'cover' };
    case 'transparentModal':
    case 'containedTransparentModal':
      return { kind: 'drawn' };
    case 'modal':
    case 'containedModal':
    case 'pageSheet':
      return { kind: 'modal' };
  }
}

interface StateRoute {
  readonly key: string;
  readonly name: string;
  readonly state?: { readonly key?: string } | undefined;
}

interface LevelState {
  readonly key: string;
  readonly type: string;
  readonly index: number;
  readonly routes: readonly StateRoute[];
}

interface LevelNavigation {
  getState(): LevelState | undefined;
  getParent(): LevelNavigation | undefined;
}

interface ListeningNavigation extends LevelNavigation {
  getParent(): ListeningNavigation | undefined;
  addListener(event: 'state', listener: () => void): () => void;
}

/** Expo Router's own navigator above the root layout: its one route is no folder under `app/`. */
// eslint-disable-next-line lingui/no-unlocalized-strings -- a route name, never copy.
const ROUTER_ROOT = '__root';

/** The levels from the screen up to the root, and the screen's path under `app/`. */
export function readLevels(
  navigation: LevelNavigation,
  routeKey: string,
): { readonly levels: readonly NavigatorLevel[]; readonly path: string } {
  const levels: NavigatorLevel[] = [];
  const names: string[] = [];
  let current: LevelNavigation | undefined = navigation;
  let key = routeKey;
  while (current !== undefined) {
    const state = current.getState();
    if (state === undefined) break;
    const index = state.routes.findIndex((route) => route.key === key);
    levels.push({ type: state.type, index: Math.max(index, 0) });
    const name = state.routes[index]?.name ?? '';
    if (name !== ROUTER_ROOT) names.unshift(name);
    const parent = current.getParent();
    const parentState = parent?.getState();
    if (parent === undefined || parentState === undefined) break;
    const holder =
      parentState.routes.find((route) => route.state?.key === state.key) ??
      parentState.routes[parentState.index];
    if (holder === undefined) break;
    key = holder.key;
    current = parent;
  }
  return { levels, path: names.join('/') };
}

/**
 * The current screen's placement; undefined outside a navigator (a test, a gallery sample), where
 * the scaffolds keep their own default.
 */
export function useScreenPlacement(): ScreenPlacement | undefined {
  const navigation = useContext(NavigationContext) as ListeningNavigation | undefined;
  const route = useContext(NavigationRouteContext);
  const own = useContext(ScreenPresentationContext);
  const placement =
    navigation === undefined || route === undefined
      ? undefined
      : screenPlacement(...placementArgs(navigation, route.key), fromNative(own));
  // The render that opens a group reads the navigators above from before the group was there
  // (the root's state still ends at the page underneath), so the first screen of a sheet read as
  // a root page. The navigators above take the new state in their own effects, which run after
  // the screen's: read again once they have, and render again if it moved.
  const [, refresh] = useReducer((count: number) => count + 1, 0);
  const seen = JSON.stringify(placement);
  useEffect(() => {
    if (navigation === undefined || route === undefined) return undefined;
    const reread = () => {
      const now = screenPlacement(...placementArgs(navigation, route.key), fromNative(own));
      if (JSON.stringify(now) !== seen) refresh();
    };
    const stops: (() => void)[] = [];
    for (let level = navigation.getParent(); level !== undefined; level = level.getParent()) {
      stops.push(level.addListener('state', reread));
    }
    return () => stops.forEach((stop) => stop());
  }, [navigation, route, own, seen]);
  return placement;
}

function placementArgs(navigation: LevelNavigation, routeKey: string) {
  const { levels, path } = readLevels(navigation, routeKey);
  return [levels, path] as const;
}

/**
 * The leading control a screen shows by where it sits. `home` is the back for a page a cold link
 * opened with nothing under it: it goes to Home instead of nowhere.
 */
export type LeadingControl = 'back' | 'close' | 'home' | 'none';

export function leadingControlFor(placement: ScreenPlacement | undefined): LeadingControl {
  if (placement === undefined) return 'back';
  if (placement.kind === 'root') return placement.tab ? 'none' : 'home';
  return placement.kind === 'presented' ? 'close' : 'back';
}
