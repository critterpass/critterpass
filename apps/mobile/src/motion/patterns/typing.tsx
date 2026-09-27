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
import { staggerDelayMs } from './shared';

const bounceEasing = bezierEasing(tokens.motion.easing.standard);

// docs/design-system.md §3.4 `typing`: "dots 1200 stagger 160".
const CYCLE_MS = 1200;
export const TYPING_DOT_STAGGER_MS = 160;

/**
 * One "guide is typing" dot's bounce, staggered by `dotIndex` (docs/design-system.md §3.4
 * choreography rule 7: "in chat only the guide's typing dots bounce" — exempt from the motion
 * budget). A caller renders three dots, each calling this with its own index.
 */
export function useTypingDot(active: boolean, dotIndex: number) {
  const translateY = useSharedValue(0);
  const delayMs = staggerDelayMs(dotIndex, TYPING_DOT_STAGGER_MS);

  useEffect(() => {
    if (!active) {
      translateY.value = 0;
      return;
    }
    translateY.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(-6, { duration: CYCLE_MS / 2, easing: bounceEasing }),
          withTiming(0, { duration: CYCLE_MS / 2, easing: bounceEasing }),
        ),
        -1,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- translateY is a stable shared value ref.
  }, [active, delayMs]);

  return useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
}
