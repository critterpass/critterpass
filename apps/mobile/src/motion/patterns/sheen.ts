import { useEffect } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '../easing';
import { useReducedImpactMotion } from './shared';

const sweepEasing = bezierEasing(tokens.motion.easing.standard);

// docs/design-system.md §3.4 `sheen`: "1080 sweep every 3600 on primary CTAs".
const SWEEP_MS = 1080;
const CYCLE_MS = 3600;
// The band jumps back to the start in one frame once the hold ends; it is never seen travelling back.
const RESET_MS = 0;

/**
 * One endless sweep loop: 0 to 1 over the sweep, then a hold until the cycle ends and an instant
 * jump back to 0. Every step must be an animation object: Reanimated's `withDelay` and
 * `withSequence` call `onStart` on their children on the UI thread, so a plain number there throws
 * once the delay elapses and takes the app down.
 */
export function sheenCycle() {
  return withRepeat(
    withSequence(
      withTiming(1, { duration: SWEEP_MS, easing: sweepEasing }),
      withDelay(CYCLE_MS - SWEEP_MS, withTiming(0, { duration: RESET_MS })),
    ),
    -1,
  );
}

/**
 * A light sweep across primary CTAs, repeating every 3600ms. Like the idle loop presets
 * (docs/design-system.md §5: "idle loops static"), it parks hidden and does not loop under reduced
 * motion rather than fading like an impact — it is decorative chrome, not feedback.
 */
export function useSheen() {
  // 0 at rest (parked before the sweep starts); -1 while reduced/off (hidden, no loop runs).
  const progress = useSharedValue(0);
  const reduced = useReducedImpactMotion();

  useEffect(() => {
    if (reduced) {
      progress.value = -1;
      return;
    }
    progress.value = 0;
    progress.value = sheenCycle();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- progress is a stable shared value ref.
  }, [reduced]);

  return useAnimatedStyle(() => ({
    opacity: progress.value < 0 ? 0 : 1,
    // Fraction 0 to 1 across the sweep; the caller multiplies by the CTA's measured width.
    transform: [{ translateX: progress.value }],
  }));
}
