/**
 * The fade under the glass tab bar on a tab's root page. The bar floats as glass over the page (the
 * system bar on iOS, the drawn one on Android), so a card scrolled under it showed its words and
 * buttons through the bar; the page fades into its ground there instead, while content continues
 * below the bar. On Android every tab root gets it from `RootScreen` (`TabBarFade`): solid up to
 * the bar's top, so nothing shows in the gap between the bar and Tokek's circle, and there at rest
 * too (a last row that ends under the bar). On iOS the page's `TabPageScroll` draws it while
 * content runs on under the system bar.
 */
import { useMemo } from 'react';
import {
  Platform,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePremiumTheme } from '../..';
import { drawnBarTop } from '../navigation/drawn-tab-bar';
import { SCROLL_EDGE_FADE, ScrollEdgeFade, useScrollEdges } from './scroll-edge';

/** Android's drawn bar: the page under it fades into the ground, solid up to the bar's top. */
export function TabBarFade() {
  const insets = useSafeAreaInsets();
  const solid = drawnBarTop(insets.bottom);
  // A short fade above the bar: a page's last row, padded clear of the bar, stays whole.
  return (
    <ScrollEdgeFade
      edge="bottom"
      height={solid + SCROLL_EDGE_FADE / 2}
      solid={solid}
      testID="tab-bar-fade"
    />
  );
}

/** A tab root page's scroll view with the fade under the tab bar drawn after it (iOS). */
export function TabPageScroll({ onScroll, ...props }: ScrollViewProps) {
  const t = usePremiumTheme();
  const edges = useScrollEdges();
  const track = edges.scrollProps.onScroll;
  const handlers = useMemo(
    () => ({
      ...edges.scrollProps,
      onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        onScroll?.(event);
        track(event);
      },
    }),
    [edges.scrollProps, onScroll, track],
  );
  const height = t.space.tabBarClearance;
  return (
    <>
      <ScrollView {...props} {...handlers} />
      {Platform.OS === 'android' ? null : (
        <ScrollEdgeFade
          edge="bottom"
          height={height}
          solid={height - SCROLL_EDGE_FADE * 2}
          visible={edges.bottom}
          testID="tab-bar-fade"
        />
      )}
    </>
  );
}
