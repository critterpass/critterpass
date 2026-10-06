/**
 * One page of the viewer under the fingers: pinch to zoom (up to four times), double-tap to zoom in
 * and back, and drag a zoomed picture to its edges. An unzoomed page takes no drag: sideways is the
 * pager's and down is the viewer's. The pager stays put while a page is zoomed, so a page that is
 * paged away from is always back at its full view. A page that cannot zoom (a video with its own
 * controls) takes none of these.
 */
import { tokens } from '@cp/design-tokens';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { GestureType } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { panLimit } from './lightbox-model';

export const MAX_ZOOM = 4;
export const DOUBLE_TAP_ZOOM = 2.5;

/**
 * One gesture per native view: on iOS every handler on one view spends a shared attach-retry
 * budget, so a page mounted as the viewer opens could lose a gesture of a composed set. Three nested
 * full-size views carry one each. The pinch and the drag of a zoomed picture run together (two
 * fingers zoom and move at once).
 */
export function zoomPageGestures(
  pinch: GestureType,
  drag: GestureType,
  doubleTap: GestureType,
): {
  readonly pinchArea: GestureType;
  readonly dragArea: GestureType;
  readonly tapArea: GestureType;
} {
  return {
    pinchArea: pinch.simultaneousWithExternalGesture(drag),
    dragArea: drag,
    tapArea: doubleTap,
  };
}

export interface ZoomPageProps {
  readonly width: number;
  readonly height: number;
  /** Off for a page with controls of its own. @default true */
  readonly zoomable?: boolean;
  /** Reduced motion: every settle is immediate. */
  readonly reduced: boolean;
  readonly onZoomChange: (zoomed: boolean) => void;
  readonly zoomed: boolean;
  readonly testID?: string;
  readonly children: ReactNode;
}

export function ZoomPage({
  width,
  height,
  zoomable = true,
  reduced,
  onZoomChange,
  zoomed,
  testID,
  children,
}: ZoomPageProps) {
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const settleMs = reduced ? 0 : tokens.motion.duration.fast;

  const pinch = Gesture.Pinch()
    .enabled(zoomable)
    .onStart(() => {
      'worklet';
      startScale.value = scale.value;
    })
    .onUpdate((event) => {
      'worklet';
      scale.value = Math.min(Math.max(startScale.value * event.scale, 0.8), MAX_ZOOM);
    })
    .onEnd(() => {
      'worklet';
      const rest = Math.min(Math.max(scale.value, 1), MAX_ZOOM);
      scale.value = withTiming(rest, { duration: settleMs });
      x.value = withTiming(
        Math.min(Math.max(x.value, -panLimit(width, rest)), panLimit(width, rest)),
        {
          duration: settleMs,
        },
      );
      y.value = withTiming(
        Math.min(Math.max(y.value, -panLimit(height, rest)), panLimit(height, rest)),
        {
          duration: settleMs,
        },
      );
      scheduleOnRN(onZoomChange, rest > 1);
    });

  const drag = Gesture.Pan()
    .enabled(zoomable && zoomed)
    .onStart(() => {
      'worklet';
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((event) => {
      'worklet';
      const limitX = panLimit(width, scale.value);
      const limitY = panLimit(height, scale.value);
      x.value = Math.min(Math.max(startX.value + event.translationX, -limitX), limitX);
      y.value = Math.min(Math.max(startY.value + event.translationY, -limitY), limitY);
    });

  const doubleTap = Gesture.Tap()
    .enabled(zoomable)
    .numberOfTaps(2)
    .onEnd((event, success) => {
      'worklet';
      if (!success) return;
      const zoomIn = scale.value <= 1;
      const next = zoomIn ? DOUBLE_TAP_ZOOM : 1;
      // Zoom towards the point tapped, as far as the picture's edges allow.
      const towardX = zoomIn ? (width / 2 - event.x) * (next - 1) : 0;
      const towardY = zoomIn ? (height / 2 - event.y) * (next - 1) : 0;
      const limitX = panLimit(width, next);
      const limitY = panLimit(height, next);
      scale.value = withTiming(next, { duration: settleMs });
      x.value = withTiming(Math.min(Math.max(towardX, -limitX), limitX), { duration: settleMs });
      y.value = withTiming(Math.min(Math.max(towardY, -limitY), limitY), { duration: settleMs });
      scheduleOnRN(onZoomChange, zoomIn);
    });

  const moved = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  const gestures = zoomPageGestures(pinch, drag, doubleTap);
  return (
    <GestureDetector gesture={gestures.pinchArea}>
      <View style={{ width, height }} testID={testID}>
        <GestureDetector gesture={gestures.dragArea}>
          <View style={StyleSheet.absoluteFill}>
            <GestureDetector gesture={gestures.tapArea}>
              <Animated.View style={[StyleSheet.absoluteFill, moved]}>{children}</Animated.View>
            </GestureDetector>
          </View>
        </GestureDetector>
      </View>
    </GestureDetector>
  );
}
