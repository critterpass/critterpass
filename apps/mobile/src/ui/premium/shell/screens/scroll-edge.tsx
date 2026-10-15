/**
 * Scroll edges: content that scrolls under something floating (a drawn header, the status bar, a
 * pinned chip row, a sticky footer or add bar) fades into the page's ground at that edge instead
 * of being cut hard or showing through gaps. The shell's screen types draw these themselves;
 * screens that float their own bars over their own list use the same pieces:
 *
 * ```tsx
 * const edges = useScrollEdges();
 * <ScrollView {...edges.scrollProps}>…</ScrollView>
 * <ScrollEdgeFade edge="top" height={insets.top + barHeight + SCROLL_EDGE_FADE} solid={insets.top + barHeight} visible={edges.top} />
 * <ScrollEdgeFade edge="bottom" height={dockHeight + insets.bottom + SCROLL_EDGE_FADE} solid={dockHeight + insets.bottom} visible={edges.bottom} />
 * ```
 *
 * Over a photo hero, `PhotoHeaderScrim` is the darker fade the design puts under the header so
 * the clear-glass buttons read on a light sky.
 */
/* eslint-disable lingui/no-unlocalized-strings -- colour and gradient syntax, never copy */
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { scheduleLayoutScan } from '@/lib/qa/layout-scan';

import { REDUCED_FADE_MS, usePremiumTheme } from '../..';

/** How far content takes to fade out past the floating thing's edge. */
export const SCROLL_EDGE_FADE = 24;

/** Content this close to an end counts as at it (sub-pixel rounding, a bounce settling). */
const SLACK = 1;

/** The same colour at no opacity, so the fade never passes through grey. */
export function transparentOf(color: string): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)?.[1];
  if (hex !== undefined) {
    const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
    const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(full.slice(at, at + 2), 16));
    return `rgba(${r},${g},${b},0)`;
  }
  const channels = /^rgba?\(([^,]+),([^,]+),([^,)]+)/i.exec(color.replace(/\s/g, ''));
  if (channels !== null) return `rgba(${channels[1]},${channels[2]},${channels[3]},0)`;
  return 'transparent';
}

/** The gradient for a band: opaque for `solid` at the edge, then fading over the rest. */
export function edgeGradient(
  edge: 'top' | 'bottom',
  height: number,
  solid: number,
  color: string,
): string {
  const clear = transparentOf(color);
  const opaqueTo = height <= 0 ? 0 : Math.min(100, Math.max(0, (solid / height) * 100));
  const towards = edge === 'top' ? '180deg' : '0deg';
  return `linear-gradient(${towards}, ${color} 0%, ${color} ${opaqueTo}%, ${clear} 100%)`;
}

export interface ScrollEdgeFadeProps {
  readonly edge: 'top' | 'bottom';
  /** The band's height from the edge: what floats there plus `SCROLL_EDGE_FADE`. */
  readonly height: number;
  /** The fully opaque part at the edge (under the status bar, under a bar with gaps). @default 0 */
  readonly solid?: number;
  /** How far from the edge the band starts (below a header that draws its own ground). */
  readonly offset?: number;
  /** The ground the content fades into. @default the theme's ground */
  readonly color?: string;
  /** Shown while content sits under that edge (`useScrollEdges`). @default true */
  readonly visible?: boolean;
  readonly testID?: string;
}

/** A band at a scroll edge that fades the content into the ground; never takes touches. */
export function ScrollEdgeFade({
  edge,
  height,
  solid = 0,
  offset = 0,
  color,
  visible = true,
  testID,
}: ScrollEdgeFadeProps) {
  const t = usePremiumTheme();
  const shown = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    shown.value = withTiming(visible ? 1 : 0, { duration: REDUCED_FADE_MS });
  }, [shown, visible]);
  const fade = useAnimatedStyle(() => ({ opacity: shown.value }));
  const ground = color ?? t.color.ground;
  return (
    <Animated.View
      pointerEvents="none"
      testID={testID}
      style={[
        styles.band,
        edge === 'top' ? { top: offset } : { bottom: offset },
        { height, experimental_backgroundImage: edgeGradient(edge, height, solid, ground) },
        fade,
      ]}
    />
  );
}

export interface PhotoHeaderScrimProps {
  /** From the top of the screen to where the fade ends (the header controls plus a fade). */
  readonly height: number;
}

/** The darker fade under the header over a photo: the clear glass's tint fading to nothing. */
export function PhotoHeaderScrim({ height }: PhotoHeaderScrimProps) {
  const t = usePremiumTheme();
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.band,
        {
          top: 0,
          height,
          experimental_backgroundImage: edgeGradient('top', height, 0, t.material.clear.tint),
        },
      ]}
    />
  );
}

export interface ScrollEdges {
  /** Content has scrolled under the top edge (past `topAfter`). */
  readonly top: boolean;
  /** Content continues under the bottom edge. */
  readonly bottom: boolean;
  /** Spread on the scroll view or list (compose with its own handlers if it has them). */
  readonly scrollProps: {
    readonly onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    readonly onLayout: (event: LayoutChangeEvent) => void;
    readonly onContentSizeChange: (width: number, height: number) => void;
    /** Where a drag or a fling comes to rest, the layout checks look at the content again. */
    readonly onScrollEndDrag: () => void;
    readonly onMomentumScrollEnd: () => void;
    readonly scrollEventThrottle: number;
  };
}

/** Where content sits against a scroll view's edges, to show its fades only when they cover something. */
export function edgesOf(
  offset: number,
  viewport: number,
  content: number,
  topAfter: number,
  bottomBefore = 0,
): { readonly top: boolean; readonly bottom: boolean } {
  return {
    top: offset > topAfter + SLACK,
    bottom: viewport > 0 && offset + viewport - bottomBefore < content - SLACK,
  };
}

/**
 * Tracks a scroll view's edges. `topAfter` is the offset after which the top counts as covered (a
 * hero's height, so a photo under the header never gets the ground's fade). `bottomBefore` is how
 * far above the bottom edge something floats over the page (a glass bar the content runs under),
 * so content that fits the viewport but ends under it still counts as covered.
 */
export function useScrollEdges({
  topAfter = 0,
  bottomBefore = 0,
}: { readonly topAfter?: number; readonly bottomBefore?: number } = {}): ScrollEdges {
  const metrics = useRef({ offset: 0, viewport: 0, content: 0 });
  const [state, setState] = useState({ top: false, bottom: false });
  const update = useCallback(() => {
    const { offset, viewport, content } = metrics.current;
    const next = edgesOf(offset, viewport, content, topAfter, bottomBefore);
    setState((current) =>
      current.top === next.top && current.bottom === next.bottom ? current : next,
    );
  }, [topAfter, bottomBefore]);
  const scrollProps = useMemo(
    () => ({
      onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
        metrics.current = {
          offset: contentOffset.y,
          viewport: layoutMeasurement.height,
          content: contentSize.height,
        };
        update();
      },
      onLayout: (event: LayoutChangeEvent) => {
        metrics.current = { ...metrics.current, viewport: event.nativeEvent.layout.height };
        update();
      },
      onContentSizeChange: (_width: number, height: number) => {
        metrics.current = { ...metrics.current, content: height };
        update();
      },
      // A no-op outside development and e2e builds.
      onScrollEndDrag: scheduleLayoutScan,
      onMomentumScrollEnd: scheduleLayoutScan,
      scrollEventThrottle: 16,
    }),
    [update],
  );
  return { top: state.top, bottom: state.bottom, scrollProps };
}

/**
 * A page that draws its own scroll view inside a shell screen (`PushScreen scroll={false}` with a
 * `KeyboardAwareScroll`) reports its edges here, so the screen still grounds its bar when the
 * content scrolls under it (a focused field scrolled up by the keyboard).
 */
export const PageScrollEdgesContext = createContext<ScrollEdges['scrollProps'] | null>(null);

const styles = StyleSheet.create({
  band: { position: 'absolute', left: 0, right: 0, zIndex: 1 },
});
