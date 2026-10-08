import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '../easing';
import { useReducedImpactMotion } from '../patterns/shared';
import type { GestureHookResult } from './shared';

/** docs/design-system.md §3.3: "press scale .92 (< 120 pt wide) / .96 / .975 over 130 ms press". */
export type PressWidthClass = 'narrow' | 'medium' | 'wide';
const PRESS_SCALE_BY_WIDTH: Record<PressWidthClass, number> = {
  narrow: 0.92,
  medium: 0.96,
  wide: 0.975,
};
const PRESS_DOWN_MS = 130;
/** "release overshoot 1.035 over 420". */
const RELEASE_MS = 420;
const OVERSHOOT_SCALE = 1.035;
/** "tap cancels past 8 pt". */
export const PRESS_CANCEL_DISTANCE_PT = 8;
/**
 * A press fires on release however long the finger rested, as a native button's touch-up-inside
 * does: the tap handler's own default gives up after 500 ms, which drops a deliberate, slow press
 * (and any press on a device too busy to deliver the release in time). Only movement cancels it;
 * a long-press or a drag on the same control still wins by activating first. An hour stands in
 * for "no limit": the native handlers take a whole number of milliseconds.
 */
export const PRESS_MAX_DURATION_MS = 60 * 60 * 1000;

const pressEasing = bezierEasing(tokens.motion.easing.press);

/** Invisible touch padding around a control drawn under the minimum target. */
export interface PressHitSlop {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

export interface UsePressOptions {
  /** @default 'medium' */
  readonly widthClass?: PressWidthClass;
  readonly disabled?: boolean;
  readonly onPress?: () => void;
  readonly accessibilityLabel?: string;
  readonly hitSlop?: PressHitSlop | undefined;
}

export interface PressAnimatedStyle {
  readonly transform: { scale: number }[];
}

/** A pressable's scale-down-then-overshoot feedback (docs/design-system.md §3.3), gesture-driven. */
export function usePress({
  widthClass = 'medium',
  disabled = false,
  onPress,
  accessibilityLabel,
  hitSlop,
}: UsePressOptions = {}): GestureHookResult {
  const reduced = useReducedImpactMotion();
  const scale = useSharedValue(1);
  const targetScale = PRESS_SCALE_BY_WIDTH[widthClass];

  // The handler is read when the press lands, so a new function on every render of the host (an
  // inline arrow) never rebuilds the gesture.
  const latestOnPress = useRef(onPress);
  useEffect(() => {
    latestOnPress.current = onPress;
  });
  const fireOnPress = useCallback(() => latestOnPress.current?.(), []);
  const slopTop = hitSlop?.top;
  const slopBottom = hitSlop?.bottom;
  const slopLeft = hitSlop?.left;
  const slopRight = hitSlop?.right;

  // One gesture for as long as what it depends on stays the same: a list row that re-renders keeps
  // the gesture its detector already holds.
  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .enabled(!disabled)
      .maxDistance(PRESS_CANCEL_DISTANCE_PT)
      .maxDuration(PRESS_MAX_DURATION_MS);
    if (
      slopTop !== undefined &&
      slopBottom !== undefined &&
      slopLeft !== undefined &&
      slopRight !== undefined
    ) {
      tap.hitSlop({ top: slopTop, bottom: slopBottom, left: slopLeft, right: slopRight });
    }
    return tap
      .onBegin(() => {
        'worklet';
        scale.value = withTiming(targetScale, { duration: PRESS_DOWN_MS, easing: pressEasing });
      })
      .onEnd(() => {
        'worklet';
        // docs/design-system.md §5 Reduce Motion: "impacts fade 150 ms, no jolt/shake" — the release
        // overshoot bounce is exactly that kind of jolt, so reduced motion settles straight to 1.
        scale.value = reduced
          ? withTiming(1, { duration: PRESS_DOWN_MS })
          : withSequence(
              withTiming(OVERSHOOT_SCALE, { duration: RELEASE_MS * 0.45 }),
              withTiming(1, { duration: RELEASE_MS * 0.55 }),
            );
        scheduleOnRN(fireOnPress);
      })
      .onFinalize((_event, success) => {
        'worklet';
        // A cancelled press (moved past 8 pt, or disabled) settles back with no overshoot — `onEnd`
        // above already handles the successful case's release animation.
        if (!success) scale.value = withTiming(1, { duration: PRESS_DOWN_MS });
      });
  }, [
    disabled,
    targetScale,
    reduced,
    scale,
    fireOnPress,
    slopTop,
    slopBottom,
    slopLeft,
    slopRight,
  ]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return {
    gesture,
    animatedStyle,
    accessibilityActions: [{ name: 'activate', label: accessibilityLabel }],
    onAccessibilityAction: (event) => {
      if (event.nativeEvent.actionName === 'activate') fireOnPress();
    },
  };
}
