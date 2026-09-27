import { Gesture } from 'react-native-gesture-handler';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '../easing';
import { REDUCED_IMPACT_FADE_MS, useReducedImpactMotion } from '../patterns/shared';
import type { GestureHookResult } from './shared';

/**
 * docs/design-system.md §3.3: "edge-swipe back from x < 28, commit dx > 110 or v > .55 pt/ms, settle
 * 300 gesture easing (Android: system predictive back)". Exported as plain constants (plan's
 * Architecture table: "edge-swipe ... thresholds exported for the shell") since the shell phase owns
 * the actual screen-to-screen transition this drives; `useEdgeSwipeBack` below is a ready-made
 * gesture for any screen that wants the iOS behaviour without re-deriving the thresholds.
 */
export const EDGE_SWIPE_START_X_PT = 28;
export const EDGE_SWIPE_COMMIT_DISTANCE_PT = 110;
/** Points per millisecond. */
export const EDGE_SWIPE_COMMIT_VELOCITY_PT_PER_MS = 0.55;
export const EDGE_SWIPE_SETTLE_MS = 300;

export function commitsEdgeSwipe(
  dx: number,
  velocityPtPerMs: number,
  commitDistancePt?: number,
  commitVelocity?: number,
): boolean {
  'worklet';
  // Defaults resolve in the body: a worklet's captured constants only exist once its body runs on
  // the UI runtime, so a default parameter naming one throws there.
  const commitDistancePtResolved = commitDistancePt ?? EDGE_SWIPE_COMMIT_DISTANCE_PT;
  const commitVelocityResolved = commitVelocity ?? EDGE_SWIPE_COMMIT_VELOCITY_PT_PER_MS;
  return dx > commitDistancePtResolved || velocityPtPerMs > commitVelocityResolved;
}

export const edgeSwipe = {
  startXPt: EDGE_SWIPE_START_X_PT,
  commitDistancePt: EDGE_SWIPE_COMMIT_DISTANCE_PT,
  commitVelocityPtPerMs: EDGE_SWIPE_COMMIT_VELOCITY_PT_PER_MS,
  settleMs: EDGE_SWIPE_SETTLE_MS,
  commits: commitsEdgeSwipe,
} as const;

const gestureEasing = bezierEasing(tokens.motion.easing.gesture);

export interface UseEdgeSwipeBackOptions {
  readonly onBack: () => void;
  readonly disabled?: boolean;
  readonly accessibilityLabel: string;
}

export interface EdgeSwipeAnimatedStyle {
  readonly transform: { translateX: number }[];
}

/** iOS-style edge-swipe-back (Android uses the system predictive-back gesture instead). */
export function useEdgeSwipeBack({
  onBack,
  disabled = false,
  accessibilityLabel,
}: UseEdgeSwipeBackOptions): GestureHookResult {
  const reduced = useReducedImpactMotion();
  const tx = useSharedValue(0);
  const startedAtEdge = useSharedValue(false);
  const fireBack = () => onBack();

  const gesture = Gesture.Pan()
    .enabled(!disabled)
    .onBegin((event) => {
      'worklet';
      startedAtEdge.value = event.x < EDGE_SWIPE_START_X_PT;
    })
    .onUpdate((event) => {
      'worklet';
      if (startedAtEdge.value) tx.value = Math.max(0, event.translationX);
    })
    .onEnd((event) => {
      'worklet';
      if (!startedAtEdge.value) return;
      const velocityPtPerMs = event.velocityX / 1000;
      if (commitsEdgeSwipe(tx.value, velocityPtPerMs)) {
        scheduleOnRN(fireBack);
      } else if (reduced) {
        tx.value = withTiming(0, { duration: REDUCED_IMPACT_FADE_MS });
      } else {
        tx.value = withTiming(0, { duration: EDGE_SWIPE_SETTLE_MS, easing: gestureEasing });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  return {
    gesture,
    animatedStyle,
    accessibilityActions: [{ name: 'escape', label: accessibilityLabel }],
    onAccessibilityAction: (event) => {
      if (event.nativeEvent.actionName === 'escape') onBack();
    },
  };
}
