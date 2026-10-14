/**
 * The fade under the glass tab bar on a tab's root page. The bar floats as glass over the page (the
 * system bar on iOS, the drawn one on Android), so a card scrolled under it showed its words and
 * buttons through the bar; the page fades into its ground there instead, while content continues
 * below the bar.
 */
import { useMemo } from 'react';
import {
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';

import { usePremiumTheme } from '@/ui/premium';
import { SCROLL_EDGE_FADE, ScrollEdgeFade, useScrollEdges } from '@/ui/premium/shell';

/** A tab root page's scroll view with the fade under the tab bar drawn after it. */
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
      <ScrollEdgeFade
        edge="bottom"
        height={height}
        solid={height - SCROLL_EDGE_FADE * 2}
        visible={edges.bottom}
        testID="tab-bar-fade"
      />
    </>
  );
}
