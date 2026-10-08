/**
 * Whether the screen a component sits on is a tab's root: a screen directly in the tab navigator,
 * or the first screen of the stack a tab holds. A tab root draws no back control (the tab bar is its
 * way around); every other screen does, even one opened cold with nothing under it.
 */
import { NavigationContext } from 'expo-router/build/react-navigation/core/NavigationContext';
import { NavigationRouteContext } from 'expo-router/build/react-navigation/core/NavigationProvider';
import { useContext } from 'react';

/** The part of a screen's place in the navigation tree the tab-root decision reads. */
export interface ScreenPlace {
  /** The type of the navigator the screen sits in (`tab`, `stack`). */
  readonly navigatorType: string | undefined;
  /** The type of the navigator that one sits in, when there is one. */
  readonly parentType: string | undefined;
  /** The key of the first screen of the screen's own navigator. */
  readonly firstKey: string | undefined;
  readonly routeKey: string;
}

export function isTabRootScreen(place: ScreenPlace): boolean {
  if (place.navigatorType === 'tab') return true;
  return place.parentType === 'tab' && place.firstKey === place.routeKey;
}

/** True on a tab root, false on any other screen, undefined outside a navigator (the gallery). */
export function useIsTabRoot(): boolean | undefined {
  const navigation = useContext(NavigationContext);
  const route = useContext(NavigationRouteContext);
  if (navigation === undefined || route === undefined) return undefined;
  const own = navigation.getState();
  return isTabRootScreen({
    navigatorType: own.type,
    parentType: navigation.getParent()?.getState().type,
    firstKey: own.routes[0]?.key,
    routeKey: route.key,
  });
}
