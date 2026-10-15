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
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePremiumTheme } from '../..';
import { drawnBarTop } from '../navigation/drawn-tab-bar';
import { SCROLL_EDGE_FADE, ScrollEdgeFade, useScrollEdges } from './scroll-edge';

/**
 * How far above the bar a card running on under it fades out: long enough not to read as a cut,
 * short enough that a solid button resting just above the bar keeps its full colour.
 */
const RUN_ON_FADE = 32;

/**
 * Android's drawn bar: the page under it fades into the ground, solid up to the bar's top. While
 * content runs on under the bar the fade reaches well above it, so a card passing under blends
 * out; at the end of the page it shrinks back, and the last row, padded clear of the bar, is whole.
 */
export function TabBarFade({ continues = false }: { readonly continues?: boolean }) {
  const insets = useSafeAreaInsets();
  const solid = drawnBarTop(insets.bottom);
  return (
    <>
      <ScrollEdgeFade
        edge="bottom"
        height={solid + SCROLL_EDGE_FADE / 2}
        solid={solid}
        testID="tab-bar-fade"
      />
      <ScrollEdgeFade
        edge="bottom"
        height={solid + RUN_ON_FADE}
        solid={solid}
        visible={continues}
      />
    </>
  );
}

/** A tab root page's scroll view with the fade under the tab bar drawn after it (iOS). */
export function TabPageScroll({
  onScroll,
  onLayout,
  onContentSizeChange,
  ...props
}: ScrollViewProps) {
  const t = usePremiumTheme();
  const height = t.space.tabBarClearance;
  const solid = height - SCROLL_EDGE_FADE * 2;
  // The system bar floats over the page's foot: a page that fits the screen but whose last card
  // ends under the bar fades there too, at rest.
  const edges = useScrollEdges({ bottomBefore: solid });
  const own = edges.scrollProps;
  // The root screen tracks the same edges (Android's fade under the drawn bar): both hear them.
  const handlers = useMemo(
    () => ({
      ...own,
      onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        onScroll?.(event);
        own.onScroll(event);
      },
      onLayout: (event: LayoutChangeEvent) => {
        onLayout?.(event);
        own.onLayout(event);
      },
      onContentSizeChange: (width: number, height: number) => {
        onContentSizeChange?.(width, height);
        own.onContentSizeChange(width, height);
      },
    }),
    [own, onScroll, onLayout, onContentSizeChange],
  );
  return (
    <>
      <ScrollView {...props} {...handlers} />
      {Platform.OS === 'android' ? null : (
        <ScrollEdgeFade
          edge="bottom"
          height={height}
          solid={solid}
          visible={edges.bottom}
          testID="tab-bar-fade"
        />
      )}
    </>
  );
}
