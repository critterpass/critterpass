/**
 * The safe-area insets inside a native sheet. React Native's safe-area context reports the
 * window's insets everywhere, so a sheet's own layout read the status bar's 59 pt at its top and
 * opened with a band of empty space under the grabber. A navigator wraps every screen it presents
 * as a sheet in these insets: the top becomes the grabber's band, and everything inside (a group's
 * whole stack, a screen's own `useSafeAreaInsets`) lays out from the sheet's top edge.
 */
import type { NativeStackNavigationOptions } from 'expo-router/native-stack';
import { useMemo, type ReactElement, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardFooterScope } from '../keyboard/keyboard';

/** The band at the top of a sheet that the grabber sits in (the system's on iOS). */
export const SHEET_TOP_CLEARANCE = 12;

/**
 * The top inset a screen presented with these options lays out from: the grabber's band for a
 * native sheet (a form sheet on both platforms, the page sheet on iOS), undefined where it keeps
 * the window's (a push, a cover, a see-through card, Android's rising page).
 */
export function presentedTopInset(
  options: Pick<NativeStackNavigationOptions, 'presentation'>,
  os: typeof Platform.OS = Platform.OS,
): number | undefined {
  const { presentation } = options;
  if (presentation === 'formSheet') return SHEET_TOP_CLEARANCE;
  const pageSheet = presentation === 'modal' || presentation === 'pageSheet';
  return pageSheet && os === 'ios' ? SHEET_TOP_CLEARANCE : undefined;
}

function SheetInsets({ top, children }: { readonly top: number; readonly children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const value = useMemo(() => ({ ...insets, top }), [insets, top]);
  return <SafeAreaInsetsContext.Provider value={value}>{children}</SafeAreaInsetsContext.Provider>;
}

/** A route as a stack's layout reads it. */
export interface LayoutRoute {
  readonly key: string;
  readonly name?: string;
  readonly params?: object | undefined;
}

interface ScreenLayoutArgs {
  readonly route: LayoutRoute;
  readonly navigation: {
    readonly getState: () => { readonly routes: readonly LayoutRoute[] } | undefined;
  };
  readonly options: NativeStackNavigationOptions;
  readonly children: ReactElement;
}

/** How a stack presents one of its routes, as its own options say. */
export type PresentationOfRoute = (
  route: LayoutRoute,
) => NativeStackNavigationOptions['presentation'];

/**
 * The top inset a page pushed after a card in the same stack lays out from. iOS shows such a push
 * inside the card (the native stack hands the push to the sheet's own controller), so its top is
 * the card's top edge, not the window's: the window's 59 pt opened the page with an empty band
 * under the grabber.
 */
export function insideCardTopInset(
  routes: readonly LayoutRoute[],
  key: string,
  presentationOf: PresentationOfRoute,
  os: typeof Platform.OS = Platform.OS,
): number | undefined {
  const index = routes.findIndex((route) => route.key === key);
  // The first route is the stack's own page, never presented.
  for (let under = index - 1; under > 0; under -= 1) {
    const below = routes[under];
    if (below === undefined) continue;
    const top = presentedTopInset({ presentation: presentationOf(below) }, os);
    if (top !== undefined) return top;
  }
  return undefined;
}

/**
 * A premium navigator's `screenLayout`: every screen gets its own keyboard footer scope (a sticky
 * footer tells the screen's form how much room it takes), and a screen it presents as a sheet, or
 * pushes inside one, gets the sheet's insets.
 * A stack never presents its first screen, whatever its options say: that one is the group's,
 * and the navigator above that presented the group (or pushed it, or rose it as a page) decides.
 */
export function presentedLayoutFor(presentationOf?: PresentationOfRoute) {
  return function presentedScreenLayout({
    route,
    navigation,
    options,
    children,
  }: ScreenLayoutArgs): ReactElement {
    const routes = navigation.getState()?.routes ?? [];
    const first = routes[0]?.key === route.key;
    const own = first ? undefined : presentedTopInset(options);
    const top =
      own ??
      (first || presentationOf === undefined || options.presentation !== undefined
        ? undefined
        : insideCardTopInset(routes, route.key, presentationOf));
    const scoped = <KeyboardFooterScope>{children}</KeyboardFooterScope>;
    return top === undefined ? scoped : <SheetInsets top={top}>{scoped}</SheetInsets>;
  };
}

/** The layout for a stack whose routes' presentations aren't known here. */
export const presentedScreenLayout = presentedLayoutFor();
