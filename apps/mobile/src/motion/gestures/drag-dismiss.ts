import { Gesture } from 'react-native-gesture-handler';
import { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tokens } from '@cp/design-tokens';

import { isPhysicalSpring, springConfig } from '../easing';
import { REDUCED_IMPACT_FADE_MS, useReducedImpactMotion } from '../patterns/shared';
import type { GestureHookResult } from './shared';

/**
 * docs/design-system.md §3.3: "drag-dismiss grab zone top 110 (sheet) / 160 (rise), commit dy > 150
 * or v > .55" — exported as plain constants (plan's Architecture table) for the shell phase's own
 * sheet/rise presenters; `useDragDismiss` is a ready-made gesture for a screen that owns its own
 * dismiss handle.
 */
export type DragDismissVariant = 'sheet' | 'rise';
export const DRAG_DISMISS_GRAB_ZONE_PT: Readonly<Record<DragDismissVariant, number>> = {
  sheet: 110,
  rise: 160,
};
export const DRAG_DISMISS_COMMIT_DISTANCE_PT = 150;
/** Points per millisecond. */
export const DRAG_DISMISS_COMMIT_VELOCITY_PT_PER_MS = 0.55;
const DISMISS_OUT_DISTANCE_PT = 900;
const DISMISS_OUT_DURATION_MS = 280;

export function commitsDragDismiss(
  dy: number,
  velocityPtPerMs: number,
  commitDistancePt: number = DRAG_DISMISS_COMMIT_DISTANCE_PT,
  commitVelocity: number = DRAG_DISMISS_COMMIT_VELOCITY_PT_PER_MS,
): boolean {
  return dy > commitDistancePt || velocityPtPerMs > commitVelocity;
}

export const dragDismiss = {
  grabZonePt: DRAG_DISMISS_GRAB_ZONE_PT,
  commitDistancePt: DRAG_DISMISS_COMMIT_DISTANCE_PT,
  commitVelocityPtPerMs: DRAG_DISMISS_COMMIT_VELOCITY_PT_PER_MS,
  commits: commitsDragDismiss,
} as const;

const snappySpring = isPhysicalSpring(tokens.motion.spring.snappy)
  ? springConfig(tokens.motion.spring.snappy)
  : undefined;

export interface UseDragDismissOptions {
  readonly variant: DragDismissVariant;
  readonly onDismiss: () => void;
  readonly disabled?: boolean;
  readonly accessibilityLabel: string;
}

export interface DragDismissAnimatedStyle {
  readonly transform: { translateY: number }[];
}

export function useDragDismiss({
  onDismiss,
  disabled = false,
  accessibilityLabel,
}: UseDragDismissOptions): GestureHookResult {
  const reduced = useReducedImpactMotion();
  const ty = useSharedValue(0);
  const fireDismiss = () => onDismiss();

  const gesture = Gesture.Pan()
    .enabled(!disabled)
    .onUpdate((event) => {
      'worklet';
      ty.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      'worklet';
      const velocityPtPerMs = event.velocityY / 1000;
      if (commitsDragDismiss(ty.value, velocityPtPerMs)) {
        const outDuration = reduced ? REDUCED_IMPACT_FADE_MS : DISMISS_OUT_DURATION_MS;
        ty.value = withTiming(DISMISS_OUT_DISTANCE_PT, { duration: outDuration }, (finished) => {
          if (finished) scheduleOnRN(fireDismiss);
        });
      } else if (reduced) {
        ty.value = withTiming(0, { duration: REDUCED_IMPACT_FADE_MS });
      } else {
        ty.value = withSpring(0, snappySpring);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));

  return {
    gesture,
    animatedStyle,
    // design-system.md §5: "every sheet has ✕".
    accessibilityActions: [{ name: 'dismiss', label: accessibilityLabel }],
    onAccessibilityAction: (event) => {
      if (event.nativeEvent.actionName === 'dismiss') onDismiss();
    },
  };
}
