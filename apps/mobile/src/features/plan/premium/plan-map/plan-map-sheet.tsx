/**
 * The plan map's sheet (4.25–4.27): edge to edge with a 34 pt top corner on the sheet material,
 * three heights (peek, half, full) and a grabber. The head (grabber and day chips) drags it and
 * flings it to the next height; the body scrolls once the sheet is up. It moves on the Smooth
 * spring (a 150 ms fade with Reduce Motion) and tells the screen where it settled, so the camera
 * and the top chrome follow. With `fitFull` (a trip of a day or two) the full sheet stops at what
 * it holds instead of rising to the top.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { SCROLL_EDGE_FADE, ScrollEdgeFade, useScrollEdges } from '@/ui/premium/shell';
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
  /** The full sheet fits its content (a short trip) rather than rising to the top. */
  readonly fitFull?: boolean;
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

/** Air left under the full sheet's last row when it fits its content. */
const FIT_AIR = 24;

const GRABBER_W = 36;
const GRABBER_H = 5;

export function PlanMapSheet({
  detent,
  onDetent,
  height,
  head,
  children,
  bodyBottom = 0,
  fitFull = false,
  accessibilityLabel,
  testID = 'plan-map-sheet',
}: PlanMapSheetProps) {
  const t = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const edges = useScrollEdges();
  // What the full sheet holds (head + body), measured while it is full.
  const [headH, setHeadH] = useState(0);
  const [bodyH, setBodyH] = useState<number | null>(null);
  const fit = fitFull && bodyH !== null ? headH + bodyH + FIT_AIR : null;
  const at = (to: MapDetent) => sheetHeight(to, height, fit);
  const full = at('full');
  // Plain numbers for the drag worklet: it runs on the UI thread, where JS helpers can't be called.
  const lowest = sheetHeight('peek', height) * 0.8;
  const visible = useSharedValue(at(detent));
  const start = useSharedValue(0);

  useEffect(() => {
    const target = sheetHeight(detent, height, fit);
    visible.set(reduced ? withTiming(target, REDUCED_FADE) : withSpring(target, SPRINGS.smooth));
  }, [detent, height, fit, reduced, visible]);

  const settle = (released: number, velocity: number) => {
    const next = settleDetent(released, velocity, height, fit);
    // Settling where it already is still springs back into place.
    visible.set(
      reduced ? withTiming(at(next), REDUCED_FADE) : withSpring(at(next), SPRINGS.smooth),
    );
    if (next !== detent) onDetent(next);
  };

  // The head always drags; at peek the body does not scroll, so it drags the sheet up too.
  const drag = () =>
    Gesture.Pan()
      .activeOffsetY([-6, 6])
      .onBegin(() => {
        'worklet';
        start.set(visible.value);
      })
      .onUpdate((event) => {
        'worklet';
        const next = start.value - event.translationY;
        visible.set(Math.max(lowest, Math.min(full, next)));
      })
      .onEnd((event) => {
        'worklet';
        scheduleOnRN(settle, visible.value, -event.velocityY);
      });
  const pan = drag();
  const bodyPan = drag().enabled(detent === 'peek');

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
          <View
            style={{ paddingHorizontal: t.space.gap16, paddingTop: t.space.gap8 }}
            onLayout={(event) => setHeadH(event.nativeEvent.layout.height)}
          >
            <View
              style={[
                styles.grabber,
                { backgroundColor: t.color.outlineEmpty, borderRadius: t.radius.progressStep },
              ]}
            />
            {head}
          </View>
        </GestureDetector>
        <View style={styles.body}>
          <GestureDetector gesture={bodyPan}>
            <ScrollView
              scrollEnabled={detent !== 'peek'}
              {...edges.scrollProps}
              onContentSizeChange={(w: number, h: number) => {
                edges.scrollProps.onContentSizeChange(w, h);
                // Only the full sheet's own content counts (padding for lower detents aside).
                if (fitFull && detent === 'full') setBodyH(h);
              }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: t.space.gap16,
                paddingBottom: bodyBottom + t.space.gap16 + (full - at(detent)),
              }}
            >
              {children}
            </ScrollView>
          </GestureDetector>
          {/* The body scrolls up under the head: it fades out there instead of being cut. */}
          <ScrollEdgeFade
            edge="top"
            height={SCROLL_EDGE_FADE}
            color={t.material.sheet.fill}
            visible={detent !== 'peek' && edges.top}
          />
        </View>
      </GlassSurface>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  fill: { flex: 1, overflow: 'hidden' },
  body: { flex: 1 },
  grabber: { alignSelf: 'center', width: GRABBER_W, height: GRABBER_H, marginBottom: 10 },
});
