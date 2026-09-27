import { useEffect } from 'react';
import { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '../easing';
import { REDUCED_IMPACT_FADE_MS, triggerImpact, useReducedImpactMotion } from './shared';

const backEasing = bezierEasing(tokens.motion.easing.back);
const standardEasing = bezierEasing(tokens.motion.easing.standard);

// docs/design-system.md §3.4 `slap`: "s0 r ±24 -> 1 r ±8, 540 back; stagger 300".
const SLAP_MS = 540;
export const SLAP_STAGGER_MS = 300;

export interface UseSlapOptions {
  readonly active: boolean;
  /** Sign of the entry/settle rotation ("r ±24 -> r ±8"); a list alternates this per item. */
  readonly direction?: 1 | -1;
  /** Stagger delay for this instance, e.g. `staggerDelayMs(index, SLAP_STAGGER_MS)`. */
  readonly delayMs?: number;
}

/**
 * A sticker slapping in: scale 0->1 with rotation ±24deg settling to ±8deg over 540ms (back easing).
 * Reduced motion: a 150ms opacity fade; the `slap` haptic/SFX cue still fires either way.
 */
export function useSlap({ active, direction = 1, delayMs = 0 }: UseSlapOptions) {
  const scale = useSharedValue(0);
  const rotate = useSharedValue(direction * 24);
  const opacity = useSharedValue(0);
  const reduced = useReducedImpactMotion();

  useEffect(() => {
    if (!active) return;
    if (reduced) {
      opacity.value = withDelay(
        delayMs,
        withTiming(1, { duration: REDUCED_IMPACT_FADE_MS, easing: standardEasing }, (finished) => {
          'worklet';
          if (finished) triggerImpact('slap');
        }),
      );
      return;
    }
    opacity.value = 1;
    scale.value = 0;
    rotate.value = direction * 24;
    scale.value = withDelay(
      delayMs,
      withTiming(1, { duration: SLAP_MS, easing: backEasing }, (finished) => {
        'worklet';
        if (finished) triggerImpact('slap');
      }),
    );
    rotate.value = withDelay(
      delayMs,
      withTiming(direction * 8, { duration: SLAP_MS, easing: backEasing }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, [active, reduced, direction, delayMs]);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));
}
