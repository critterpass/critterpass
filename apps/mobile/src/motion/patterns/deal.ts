import { useEffect } from 'react';
import { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '../easing';
import { REDUCED_IMPACT_FADE_MS, staggerDelayMs, useReducedImpactMotion } from './shared';

const standardEasing = bezierEasing(tokens.motion.easing.standard);

// docs/design-system.md §3.4 `deal`: "rows ty -12->0 + fade, 400 standard, stagger 80". No sound cue.
const DEAL_MS = 400;

export interface UseDealOptions {
  readonly active: boolean;
  /** 0-based row index; delay is `index * motion.duration.stagger.rows` (80ms). */
  readonly index?: number;
}

/** A row dealing into a list: translateY -12 -> 0 with a fade, 400ms standard easing, staggered per row. */
export function useDeal({ active, index = 0 }: UseDealOptions) {
  const translateY = useSharedValue(-12);
  const opacity = useSharedValue(0);
  const reduced = useReducedImpactMotion();
  const delayMs = staggerDelayMs(index, tokens.motion.duration.stagger.rows);

  useEffect(() => {
    if (!active) return;
    if (reduced) {
      opacity.value = withDelay(
        delayMs,
        withTiming(1, { duration: REDUCED_IMPACT_FADE_MS, easing: standardEasing }),
      );
      translateY.value = 0;
      return;
    }
    translateY.value = -12;
    opacity.value = 0;
    translateY.value = withDelay(
      delayMs,
      withTiming(0, { duration: DEAL_MS, easing: standardEasing }),
    );
    opacity.value = withDelay(
      delayMs,
      withTiming(1, { duration: DEAL_MS, easing: standardEasing }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- translateY/opacity are stable shared value refs.
  }, [active, reduced, delayMs]);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
}
