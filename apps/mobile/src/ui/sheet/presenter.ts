import { createContext, useContext, useEffect, useState } from 'react';
import { makeMutable, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { provideSheetsOpen } from '@/lib/interaction/busy';
import { bezierEasing } from '@/motion/easing';

/** docs/design-system.md §3.3: the screen under a sheet or rise scales to .93. */
export const PRESENTER_SCALE = 0.93;

/** 0 = nothing presented over the app, 1 = a sheet or rise fully up. Drives every presenter. */
export const presenterProgress = makeMutable(0);

let presentedCount = 0;
/** How many sheets and rises are up right now; a screen mounted over them is not their presenter. */
export const presentedDepth = makeMutable(0);
provideSheetsOpen(() => presentedCount > 0);
const standard = bezierEasing(tokens.motion.easing.standard);

/** A sheet or rise started presenting (reduced motion keeps the presenter still). */
export function presenterOpened(durationMs: number, reduced: boolean): void {
  presentedCount += 1;
  presentedDepth.value = presentedCount;
  if (!reduced) presenterProgress.value = withTiming(1, { duration: durationMs, easing: standard });
}

/** A sheet or rise started dismissing; the presenter only settles once the last one goes. */
export function presenterClosed(durationMs: number): void {
  presentedCount = Math.max(0, presentedCount - 1);
  presentedDepth.value = presentedCount;
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

/**
 * A screen root that renders a sheet or rise inside itself (not as a `(modal)` route) hosts it: it
 * holds still, since scaling it would shrink the sheet with it into an inset card.
 */
export interface PresenterHost {
  readonly hosting: SharedValue<number>;
}

export const PresenterHostContext = createContext<PresenterHost | null>(null);

/** A sheet or rise registers with the screen root it is rendered inside, if any, while it is up. */
export function useHostedPresentation(): void {
  const host = useContext(PresenterHostContext);
  const presented = useContext(PresentedSurfaceContext);
  useEffect(() => {
    if (host === null || presented) return;
    const { hosting } = host;
    /* eslint-disable react-hooks/immutability -- a Reanimated shared value's `.value` setter, not React state */
    hosting.value += 1;
    return () => {
      hosting.value = Math.max(0, hosting.value - 1);
    };
    /* eslint-enable react-hooks/immutability */
  }, [host, presented]);
}

/**
 * Scale for a screen root (`Scaffold`) while something is presented over it. Only screens that were
 * already up when the sheet or rise opened are its presenter: a screen pushed on top of an open
 * sheet (a page opened from the crews sheet), a surface inside a sheet, and a screen hosting its
 * own inline sheet stay full size, edge to edge.
 */
export function usePresenterStyle(hosting: SharedValue<number>) {
  const presented = useContext(PresentedSurfaceContext);
  const [baseDepth] = useState(() => presentedDepth.value);
  return useAnimatedStyle(() => {
    if (presented || baseDepth > 0 || hosting.value > 0) return {};
    const scale = 1 - (1 - PRESENTER_SCALE) * presenterProgress.value;
    return { transform: [{ scale }] };
  });
}

export function resetPresenterForTests(): void {
  presentedCount = 0;
  presentedDepth.value = 0;
  presenterProgress.value = 0;
}
