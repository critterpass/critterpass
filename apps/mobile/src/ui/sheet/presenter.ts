import { createContext, useContext } from 'react';
import { makeMutable, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '@/motion/easing';

/** docs/design-system.md §3.3: the screen under a sheet or rise scales to .93. */
export const PRESENTER_SCALE = 0.93;

/** 0 = nothing presented over the app, 1 = a sheet or rise fully up. Drives every presenter. */
export const presenterProgress = makeMutable(0);

let presentedCount = 0;
const standard = bezierEasing(tokens.motion.easing.standard);

/** A sheet or rise started presenting (reduced motion keeps the presenter still). */
export function presenterOpened(durationMs: number, reduced: boolean): void {
  presentedCount += 1;
  if (!reduced) presenterProgress.value = withTiming(1, { duration: durationMs, easing: standard });
}

/** A sheet or rise started dismissing; the presenter only settles once the last one goes. */
export function presenterClosed(durationMs: number): void {
  presentedCount = Math.max(0, presentedCount - 1);
  if (presentedCount === 0) {
    presenterProgress.value = withTiming(0, { duration: durationMs, easing: standard });
  }
}

/** While a single modal is dragged, the presenter follows the finger. */
export function presenterFollow(progress: number): void {
  'worklet';
  presenterProgress.value = progress;
}

/** True inside a sheet or rise: their own content must not scale as a presenter. */
export const PresentedSurfaceContext = createContext(false);

/** Scale for a screen root (`Scaffold`) while something is presented over it. */
export function usePresenterStyle() {
  const presented = useContext(PresentedSurfaceContext);
  return useAnimatedStyle(() => {
    if (presented) return {};
    const scale = 1 - (1 - PRESENTER_SCALE) * presenterProgress.value;
    return { transform: [{ scale }] };
  });
}

export function resetPresenterForTests(): void {
  presentedCount = 0;
  presenterProgress.value = 0;
}
