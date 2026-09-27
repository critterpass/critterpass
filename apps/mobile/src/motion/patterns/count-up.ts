import { useEffect } from 'react';
import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '../easing';
import { useReducedImpactMotion } from './shared';

const countEasing = bezierEasing(tokens.motion.easing.standard);

// Not individually specced in docs/design-system.md §3.4; `medium` sits with the general one-shot
// pace and keeps a stat counter readable rather than a blur.
const COUNT_MS = tokens.motion.duration.medium;

/**
 * Animates a displayed number from its previous value to `target` so it never jumps
 * (docs/design-system.md §3.4 choreography rule 6). Reduced motion: jumps straight to `target`.
 */
export function useCountUp(target: number): { readonly value: SharedValue<number> } {
  const value = useSharedValue(target);
  const reduced = useReducedImpactMotion();

  useEffect(() => {
    value.value = reduced
      ? target
      : withTiming(target, { duration: COUNT_MS, easing: countEasing });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value is a stable shared value ref.
  }, [target, reduced]);

  return { value };
}
