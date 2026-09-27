import { useEffect } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '../easing';
import { REDUCED_IMPACT_FADE_MS, useReducedImpactMotion } from './shared';

const standardEasing = bezierEasing(tokens.motion.easing.standard);

// docs/design-system.md §3.4 `squash`: "sx1.14 sy.86 -> .94/1.06 -> 1, 250-400". No sound cue: purely
// visual. `base` (340ms) sits in the documented range; split evenly across the two segments.
const SEGMENT_MS = tokens.motion.duration.base / 2;

export interface UseSquashOptions {
  readonly active: boolean;
}

/** Squash-and-stretch (egg, icon swap, vote half): sx1.14/sy.86 -> sx.94/sy1.06 -> 1/1. */
export function useSquash({ active }: UseSquashOptions) {
  const scaleX = useSharedValue(1);
  const scaleY = useSharedValue(1);
  const opacity = useSharedValue(0);
  const reduced = useReducedImpactMotion();

  useEffect(() => {
    if (!active) return;
    if (reduced) {
      opacity.value = withTiming(1, { duration: REDUCED_IMPACT_FADE_MS, easing: standardEasing });
      scaleX.value = 1;
      scaleY.value = 1;
      return;
    }
    opacity.value = 1;
    scaleX.value = 1.14;
    scaleY.value = 0.86;
    scaleX.value = withSequence(
      withTiming(0.94, { duration: SEGMENT_MS, easing: standardEasing }),
      withTiming(1, { duration: SEGMENT_MS, easing: standardEasing }),
    );
    scaleY.value = withSequence(
      withTiming(1.06, { duration: SEGMENT_MS, easing: standardEasing }),
      withTiming(1, { duration: SEGMENT_MS, easing: standardEasing }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scaleX/scaleY/opacity are stable shared value refs.
  }, [active, reduced]);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scaleX: scaleX.value }, { scaleY: scaleY.value }],
  }));
}
