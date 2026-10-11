/**
 * The plan map's sheet (4.25–4.27): edge to edge with a 34 pt top corner on the sheet material,
 * three heights (peek, half, full) and a grabber. The head (grabber and day chips) drags it and
 * flings it to the next height; the body scrolls once the sheet is up. It moves on the Smooth
 * spring (a 150 ms fade with Reduce Motion) and tells the screen where it settled, so the camera
 * and the top chrome follow.
 */
import { useEffect, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  GlassSurface,
  REDUCED_FADE,
  SPRINGS,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import { settleDetent, sheetHeight, type MapDetent } from '../map';

export interface PlanMapSheetProps {
  readonly detent: MapDetent;
  readonly onDetent: (detent: MapDetent) => void;
  /** The screen's height (the detents are distances from its foot). */
  readonly height: number;
  /** Drags the sheet: the grabber and what sits under it (day chips). */
  readonly head: ReactNode;
  readonly children: ReactNode;
  /** Room kept under the body (the add bar floats over the half sheet's foot). */
  readonly bodyBottom?: number;
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

const GRABBER_W = 36;
const GRABBER_H = 5;

export function PlanMapSheet({
  detent,
  onDetent,
  height,
  head,
  children,
  bodyBottom = 0,
  accessibilityLabel,
  testID = 'plan-map-sheet',
}: PlanMapSheetProps) {
  const t = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const full = sheetHeight('full', height);
  const visible = useSharedValue(sheetHeight(detent, height));
  const start = useSharedValue(0);

  useEffect(() => {
    const target = sheetHeight(detent, height);
    visible.set(reduced ? withTiming(target, REDUCED_FADE) : withSpring(target, SPRINGS.smooth));
  }, [detent, height, reduced, visible]);

  const settle = (at: number, velocity: number) => {
    const next = settleDetent(at, velocity, height);
    // Settling where it already is still springs back into place.
    visible.set(
      reduced
        ? withTiming(sheetHeight(next, height), REDUCED_FADE)
        : withSpring(sheetHeight(next, height), SPRINGS.smooth),
    );
    if (next !== detent) onDetent(next);
  };

  const pan = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .onBegin(() => {
      'worklet';
      start.set(visible.value);
    })
    .onUpdate((event) => {
      'worklet';
      const next = start.value - event.translationY;
      visible.set(Math.max(sheetHeight('peek', height) * 0.8, Math.min(full, next)));
    })
    .onEnd((event) => {
      'worklet';
      scheduleOnRN(settle, visible.value, -event.velocityY);
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: full - visible.value }],
  }));

  return (
    <Animated.View
      style={[styles.sheet, { height: full }, sheetStyle]}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <GlassSurface
        kind="sheet"
        style={[
          styles.fill,
          { borderTopLeftRadius: t.radius.hero, borderTopRightRadius: t.radius.hero },
        ]}
      >
        <GestureDetector gesture={pan}>
          <View style={{ paddingHorizontal: t.space.gap16, paddingTop: t.space.gap8 }}>
            <View
              style={[
                styles.grabber,
                { backgroundColor: t.color.outlineEmpty, borderRadius: t.radius.progressStep },
              ]}
            />
            {head}
          </View>
        </GestureDetector>
        <ScrollView
          scrollEnabled={detent !== 'peek'}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: t.space.gap16,
            paddingBottom: bodyBottom + t.space.gap16 + (full - sheetHeight(detent, height)),
          }}
        >
          {children}
        </ScrollView>
      </GlassSurface>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  fill: { flex: 1, overflow: 'hidden' },
  grabber: { alignSelf: 'center', width: GRABBER_W, height: GRABBER_H, marginBottom: 10 },
});
