/**
 * Pages the user can't see stop re-rendering. The native stack keeps every page it holds live, so
 * a page two or more under the top (the tabs under a pushed detail and its own push) re-renders on
 * every shared store change, a query echo or the keyboard, while nothing of it shows. Those pages
 * are frozen: React skips them until they are near the top again. The page right under the top
 * stays live (it shows during the edge swipe and behind a sheet), and so does every page under a
 * see-through presentation (a sheet over a sheet, a drawn sheet), since it shows through.
 */
import type { NativeStackNavigationOptions } from 'expo-router/native-stack';

/** Presentations a page shows through: anything but an opaque push or a full-screen cover. */
function seeThrough(presentation: NativeStackNavigationOptions['presentation']): boolean {
  return (
    presentation !== undefined && presentation !== 'card' && presentation !== 'fullScreenModal'
  );
}

/**
 * True when the page at `index` is hidden under opaque pages: at least two above it, none of them
 * see-through. `presentationAt` reads how the page at a given index is presented.
 */
export function hiddenBehind(
  index: number,
  topIndex: number,
  presentationAt: (index: number) => NativeStackNavigationOptions['presentation'],
): boolean {
  if (index < 0 || index >= topIndex - 1) return false;
  for (let above = index + 1; above <= topIndex; above += 1) {
    if (seeThrough(presentationAt(above))) return false;
  }
  return true;
}

/** A navigation state's routes, as a screen options function reads them. */
export interface StackState<Route> {
  readonly index: number;
  readonly routes: readonly Route[];
}

/** The native props that freeze a hidden page (react-native-screens' own freeze). */
export function freezeOptions<Route extends { readonly key?: string | undefined }>(
  route: Route,
  state: StackState<Route> | undefined,
  presentationOf: (route: Route) => NativeStackNavigationOptions['presentation'],
): NativeStackNavigationOptions {
  if (state === undefined || route.key === undefined) return {};
  const index = state.routes.findIndex((candidate) => candidate.key === route.key);
  const hidden = hiddenBehind(index, state.index, (at) => {
    const above = state.routes[at];
    return above === undefined ? undefined : presentationOf(above);
  });
  return hidden ? { unstable_nativeProps: { freezeOnBlur: true, shouldFreeze: true } } : {};
}
