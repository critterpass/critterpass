import { Gesture } from 'react-native-gesture-handler';
import {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '../easing';
import { REDUCED_IMPACT_FADE_MS, useReducedImpactMotion } from '../patterns/shared';
import type { GestureHookResult } from './shared';

/** docs/design-system.md §3.4 `slideToConfirm`: "282 pt track, commit > 70%, else spring back 280". */
export const SLIDE_TO_CONFIRM_TRACK_PT = 282;
export const SLIDE_TO_CONFIRM_COMMIT_FRACTION = 0.7;
export const SLIDE_TO_CONFIRM_SPRING_BACK_MS = 280;
const SLIDE_TO_CONFIRM_COMMIT_SETTLE_MS = 150;
const springBackEasing = bezierEasing(tokens.motion.easing.back);

export function commitsSlideToConfirm(
  progress: number,
  commitFraction: number = SLIDE_TO_CONFIRM_COMMIT_FRACTION,
): boolean {
  return progress >= commitFraction;
}

export interface UseSlideToConfirmOptions {
  /** @default SLIDE_TO_CONFIRM_TRACK_PT */
  readonly trackWidthPt?: number;
  readonly onConfirm: () => void;
  readonly disabled?: boolean;
  readonly accessibilityLabel: string;
}

export interface SlideToConfirmAnimatedStyle {
  readonly transform: { translateX: number }[];
}

export interface UseSlideToConfirmResult extends GestureHookResult {
  /** 0–1 track position, for a screen's own scripted choreography hook (e.g. 3f-5's 6 s sequence) to key off. */
  readonly progress: SharedValue<number>;
}

/** A slide-to-confirm track (docs/design-system.md §3.4), e.g. slide-to-board. */
export function useSlideToConfirm({
  trackWidthPt = SLIDE_TO_CONFIRM_TRACK_PT,
  onConfirm,
  disabled = false,
  accessibilityLabel,
}: UseSlideToConfirmOptions): UseSlideToConfirmResult {
  const reduced = useReducedImpactMotion();
  const tx = useSharedValue(0);
  const progress = useDerivedValue(() => tx.value / trackWidthPt);
  const fireConfirm = () => onConfirm();

  const gesture = Gesture.Pan()
    .enabled(!disabled)
    .onUpdate((event) => {
      'worklet';
      tx.value = Math.max(0, Math.min(trackWidthPt, event.translationX));
    })
    .onEnd(() => {
      'worklet';
      if (commitsSlideToConfirm(tx.value / trackWidthPt)) {
        tx.value = withTiming(
          trackWidthPt,
          { duration: SLIDE_TO_CONFIRM_COMMIT_SETTLE_MS },
          (finished) => {
            if (finished) scheduleOnRN(fireConfirm);
          },
        );
      } else if (reduced) {
        // docs/design-system.md §5: no overshoot easing under reduced motion.
        tx.value = withTiming(0, { duration: REDUCED_IMPACT_FADE_MS });
      } else {
        tx.value = withTiming(0, {
          duration: SLIDE_TO_CONFIRM_SPRING_BACK_MS,
          easing: springBackEasing,
        });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  return {
    gesture,
    animatedStyle,
    progress,
    // design-system.md §5 "slide-to-board → 'Board' action".
    accessibilityActions: [{ name: 'activate', label: accessibilityLabel }],
    onAccessibilityAction: (event) => {
      if (event.nativeEvent.actionName === 'activate') onConfirm();
    },
  };
}
