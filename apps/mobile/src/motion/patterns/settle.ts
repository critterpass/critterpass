import { useEffect } from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '../easing';
import { REDUCED_IMPACT_FADE_MS, useReducedImpactMotion } from './shared';

const backEasing = bezierEasing(tokens.motion.easing.back);
const standardEasing = bezierEasing(tokens.motion.easing.standard);

// docs/design-system.md §3.4 `settle`: "ty -40 r -8 -> 0 r -2, 630 back". No sound cue: purely visual.
const SETTLE_MS = 630;

export interface UseSettleOptions {
  readonly active: boolean;
}

/** A document/card settling into place: translateY -40 -> 0, rotate -8deg -> -2deg over 630ms (back easing). */
export function useSettle({ active }: UseSettleOptions) {
  const translateY = useSharedValue(-40);
  const rotate = useSharedValue(-8);
  const opacity = useSharedValue(0);
  const reduced = useReducedImpactMotion();

  useEffect(() => {
    if (!active) return;
    if (reduced) {
      opacity.value = withTiming(1, { duration: REDUCED_IMPACT_FADE_MS, easing: standardEasing });
      translateY.value = 0;
      rotate.value = -2;
      return;
    }
    opacity.value = 1;
    translateY.value = -40;
    rotate.value = -8;
    translateY.value = withTiming(0, { duration: SETTLE_MS, easing: backEasing });
    rotate.value = withTiming(-2, { duration: SETTLE_MS, easing: backEasing });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- translateY/rotate/opacity are stable shared value refs.
  }, [active, reduced]);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { rotate: `${rotate.value}deg` }],
  }));
}
