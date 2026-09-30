import { useEffect } from 'react';
import {
  cancelAnimation,
  Easing,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useIdleLoopRunning } from '@/motion/idle-pause';
import { useReducedImpactMotion } from '@/motion/patterns/shared';

/**
 * A 0→1 progress that loops every `periodMs` while mounted. Reduced motion (and a spent idle-loop
 * budget) holds the final frame (1), so every demo still shows what the permission does, just
 * without movement.
 */
export function useDemoLoop(periodMs: number): SharedValue<number> {
  const reduced = useReducedImpactMotion();
  const progress = useSharedValue(reduced ? 1 : 0);
  const running = useIdleLoopRunning(!reduced);
  useEffect(() => {
    if (!running) {
      progress.value = 1;
      return undefined;
    }
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: periodMs, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, [periodMs, running]);
  return progress;
}

/** The size every demo tile draws into (the 3a-9 card's left square). */
export const DEMO_SIZE = 88;
