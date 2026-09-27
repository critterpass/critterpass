import { useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';
import type { ComponentRef, ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '@/motion/easing';

import type { ActiveZoom, Rect } from './use-shared-source';
import {
  HOP_PRE_BEAT_MS,
  measureSharedRect,
  planZoom,
  sharedGrowStore,
  unzoom,
  UNZOOM_MS,
  useActiveZooms,
  ZOOM_FADE_SHARE,
  ZOOM_RADIUS_FROM,
  ZOOM_RADIUS_TO,
} from './use-shared-source';

const standard = bezierEasing(tokens.motion.easing.standard);
const back = bezierEasing(tokens.motion.easing.back);
const HOP_PT = tokens.space['12'];
/** A destination that never measures itself still gets a grow: to the full window. */
const TARGET_TIMEOUT_MS = tokens.motion.duration.base;

const completeZoom = (key: number) => sharedGrowStore.complete(key);

function lerp(from: number, to: number, progress: number): number {
  'worklet';
  return from + (to - from) * progress;
}

function ZoomClone({ zoom, fallback }: { readonly zoom: ActiveZoom; readonly fallback: Rect }) {
  const progress = useSharedValue(0);
  const hop = useSharedValue(0);
  const to = zoom.to ?? fallback;
  const inward = zoom.direction === 'in';
  const { key } = zoom;

  useEffect(() => {
    const plan = planZoom(zoom.hop && inward);
    const done = (finished?: boolean) => {
      'worklet';
      if (finished) scheduleOnRN(completeZoom, key);
    };
    if (plan.delayMs > 0) {
      hop.value = withSequence(
        withTiming(-HOP_PT, { duration: HOP_PRE_BEAT_MS / 2, easing: back }),
        withTiming(0, { duration: HOP_PRE_BEAT_MS / 2, easing: standard }),
      );
    }
    progress.value = withDelay(
      plan.delayMs,
      withTiming(1, { duration: inward ? plan.durationMs : UNZOOM_MS, easing: standard }, done),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one animation per zoom (keyed by `key`)
  }, []);

  const { from } = zoom;
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      left: lerp(from.x, to.x, p),
      top: lerp(from.y, to.y, p) + hop.value,
      width: lerp(from.width, to.width, p),
      height: lerp(from.height, to.height, p),
      borderRadius: inward
        ? lerp(ZOOM_RADIUS_FROM, ZOOM_RADIUS_TO, p)
        : lerp(ZOOM_RADIUS_TO, ZOOM_RADIUS_FROM, p),
    };
  });
  const contentStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const faded = inward
      ? 1 - Math.min(1, p / ZOOM_FADE_SHARE)
      : Math.max(0, (p - 1 + ZOOM_FADE_SHARE) / ZOOM_FADE_SHARE);
    return { opacity: faded };
  });

  return (
    <Animated.View testID={`zoom-clone-${zoom.id}`} style={[styles.clone, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, contentStyle]}>{zoom.render()}</Animated.View>
    </Animated.View>
  );
}

function PendingClone({ zoom, fallback }: { readonly zoom: ActiveZoom; readonly fallback: Rect }) {
  useEffect(() => {
    const timer = setTimeout(
      () => sharedGrowStore.reportTarget(zoom.id, fallback),
      TARGET_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [zoom.id, fallback]);
  const { from } = zoom;
  return (
    <View
      testID={`zoom-clone-${zoom.id}`}
      style={[
        styles.clone,
        {
          left: from.x,
          top: from.y,
          width: from.width,
          height: from.height,
          borderRadius: ZOOM_RADIUS_FROM,
        },
      ]}
    >
      {zoom.render()}
    </View>
  );
}

/**
 * Mounted once above the navigator: renders each zoom's clone, holding it over the card until the
 * destination measures itself, then growing it into place (card → detail) or back (detail → card).
 */
export function SharedGrowHost() {
  const zooms = useActiveZooms();
  const { width, height } = useWindowDimensions();
  const fallback = { x: 0, y: 0, width, height };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {zooms.map((zoom) =>
        zoom.to ? (
          <ZoomClone key={zoom.key} zoom={zoom} fallback={fallback} />
        ) : (
          <PendingClone key={zoom.key} zoom={zoom} fallback={fallback} />
        ),
      )}
    </View>
  );
}

type ViewInstance = ComponentRef<typeof View>;

export interface SharedTargetProps {
  readonly id: string;
  readonly children: ReactNode;
}

/**
 * Destination of a zoom: reports its frame so the clone knows where to grow, stays hidden until
 * the clone lands (hand-off), and on leaving grows the clone back into the card.
 */
export function SharedTarget({ id, children }: SharedTargetProps) {
  const ref = useRef<ViewInstance | null>(null);
  const lastRect = useRef<Rect | null>(null);
  const zooms = useActiveZooms();
  const navigation = useNavigation();
  const arriving = zooms.some((zoom) => zoom.id === id && zoom.direction === 'in');

  // Leaving (popped, not merely covered): the route is gone from the navigator's state at blur.
  useEffect(() => {
    const initial = navigation.getState();
    const ownKey = initial?.routes[initial.index]?.key;
    return navigation.addListener('blur', () => {
      const routes = navigation.getState()?.routes ?? [];
      if (routes.some((route) => route.key === ownKey)) return;
      const rect = lastRect.current;
      if (rect) void unzoom(id, rect);
    });
  }, [navigation, id]);

  return (
    <View
      ref={ref}
      testID={`shared-target-${id}`}
      collapsable={false}
      style={{ opacity: arriving ? 0 : 1 }}
      onLayout={() => {
        void measureSharedRect(ref).then((rect) => {
          if (!rect) return;
          lastRect.current = rect;
          sharedGrowStore.reportTarget(id, rect);
        });
      }}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clone: { position: 'absolute', overflow: 'hidden', backgroundColor: tokens.semantic.bg.raised },
});
