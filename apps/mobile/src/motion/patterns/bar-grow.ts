import { useEffect } from 'react';
import { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '../easing';
import { staggerDelayMs, useReducedImpactMotion } from './shared';

const growEasing = bezierEasing(tokens.motion.easing.standard);

// docs/design-system.md §3.4 `barGrow`: "600-900, stagger 50". `extra` (780ms) sits inside that range.
const GROW_MS = tokens.motion.duration.extra;
export const BAR_GROW_STAGGER_MS = 50;

export interface UseBarGrowOptions {
  readonly active: boolean;
  /** The bar's filled fraction, 0 to 1. */
  readonly toValue: number;
  /** 0-based bar index; delay is `index * BAR_GROW_STAGGER_MS`. */
  readonly index?: number;
}

/** A bar chart bar growing from 0 to its filled fraction, staggered per bar. */
export function useBarGrow({ active, toValue, index = 0 }: UseBarGrowOptions) {
  const fraction = useSharedValue(0);
  const reduced = useReducedImpactMotion();
  const delayMs = staggerDelayMs(index, BAR_GROW_STAGGER_MS);

  useEffect(() => {
    if (!active) return;
    if (reduced) {
      fraction.value = toValue;
      return;
    }
    fraction.value = 0;
    fraction.value = withDelay(
      delayMs,
      withTiming(toValue, { duration: GROW_MS, easing: growEasing }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fraction is a stable shared value ref.
  }, [active, toValue, reduced, delayMs]);

  return useAnimatedStyle(() => ({ transform: [{ scaleX: fraction.value }] }));
}
