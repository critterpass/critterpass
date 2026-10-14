/**
 * Light status bar content over a dark surface under the status bar (a hub photo, the paywall's
 * night hero), only while the page is the one on screen: a page pushed over it, or the page
 * scrolled past its photo, goes back to the theme's own status bar.
 *
 * The page keeps saying which style it wants rather than dropping its say when it leaves the
 * screen: a light page pushed over the night paywall kept its white clock and battery, since the
 * hidden page's light entry was still the newest one.
 */
import { useIsFocused } from 'expo-router';
import { StatusBar, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SCROLL_EDGE_FADE, ScrollEdgeFade } from './scroll-edge';

export function StatusBarOver({ dark }: { readonly dark: boolean }) {
  const focused = useIsFocused();
  // The app's own appearance (the root theme sets it on the OS), not a pinned dark surface's.
  const scheme = useColorScheme();
  const light = (focused && dark) || scheme === 'dark';
  return <StatusBar barStyle={light ? 'light-content' : 'dark-content'} animated />;
}

/**
 * The ground under the status bar on a full-bleed map or photo page with no header, so the clock
 * and battery never sit straight on map labels: the page's ground, fading out below the bar.
 */
export function StatusBarGround({ color }: { readonly color?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollEdgeFade
      edge="top"
      height={insets.top + SCROLL_EDGE_FADE}
      solid={insets.top * 0.6}
      {...(color === undefined ? {} : { color })}
      testID="status-bar-ground"
    />
  );
}
