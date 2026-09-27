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
const CANCEL_DISTANCE_PT = 8;

export interface UsePressOptions {
  /** @default 'medium' */
  readonly widthClass?: PressWidthClass;
  readonly disabled?: boolean;
  readonly onPress?: () => void;
  readonly accessibilityLabel?: string;
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
}: UsePressOptions = {}): GestureHookResult {
  const scale = useSharedValue(1);
  const pressEasing = bezierEasing(tokens.motion.easing.press);
  const targetScale = PRESS_SCALE_BY_WIDTH[widthClass];

  const fireOnPress = () => onPress?.();

  const gesture = Gesture.Tap()
    .enabled(!disabled)
    .maxDistance(CANCEL_DISTANCE_PT)
    .onBegin(() => {
      'worklet';
      scale.value = withTiming(targetScale, { duration: PRESS_DOWN_MS, easing: pressEasing });
    })
    .onEnd(() => {
      'worklet';
      scale.value = withSequence(
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

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return {
    gesture,
    animatedStyle,
    accessibilityActions: [{ name: 'activate', label: accessibilityLabel }],
    onAccessibilityAction: (event) => {
      if (event.nativeEvent.actionName === 'activate') onPress?.();
    },
  };
}
