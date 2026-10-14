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

interface ScreenLayoutArgs {
  readonly route: { readonly key: string };
  readonly navigation: {
    readonly getState: () => { readonly routes: readonly { readonly key: string }[] } | undefined;
  };
  readonly options: NativeStackNavigationOptions;
  readonly children: ReactElement;
}

/**
 * A premium navigator's `screenLayout`: a screen it presents as a sheet gets the sheet's insets.
 * A stack never presents its first screen, whatever its options say: that one is the group's,
 * and the navigator above that presented the group (or pushed it, or rose it as a page) decides.
 */
export function presentedScreenLayout({
  route,
  navigation,
  options,
  children,
}: ScreenLayoutArgs): ReactElement {
  const first = navigation.getState()?.routes[0]?.key === route.key;
  const top = first ? undefined : presentedTopInset(options);
  return top === undefined ? children : <SheetInsets top={top}>{children}</SheetInsets>;
}
