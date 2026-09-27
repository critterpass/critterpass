import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { motionFreeze, slowmoMultiplier } from './slowmo';

/**
 * One frame clock shared by every loop preset (docs/design-system.md §3.1: "Idle loops run on one
 * shared clock ... so stickers breathe in phase"). The value is elapsed animation time in
 * milliseconds, scaled by the debug slowmo multiplier. It stops advancing while the app is
 * backgrounded (code-standards.md §7: "loops pause ... when app backgrounds") and while
 * motion-freeze is on; it otherwise never resets, so every `useLoop` instance reading it stays in
 * phase with every other one no matter when it mounted.
 */
export function useSharedClock(): SharedValue<number> {
  const clock = useSharedValue(0);
  // A component only mounts while something is rendering on screen, so the app is already active at
  // that point in every real case that matters; only react to subsequent background/foreground
  // transitions rather than trusting the platform's synchronously-read initial value.
  const isAppActive = useSharedValue(true);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      isAppActive.value = state === 'active';
    });
    return () => subscription?.remove();
  }, [isAppActive]);

  useFrameCallback((frameInfo) => {
    'worklet';
    if (!isAppActive.value || motionFreeze.value) return;
    clock.value += (frameInfo.timeSincePreviousFrame ?? 0) * slowmoMultiplier.value;
  });

  return clock;
}
