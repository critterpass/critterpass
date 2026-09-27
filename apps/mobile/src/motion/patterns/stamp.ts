import { useEffect } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '../easing';
import { REDUCED_IMPACT_FADE_MS, triggerImpact, useReducedImpactMotion } from './shared';
import { useScreenJolt } from './thud';

const THUD_HEAVY_CUE = 'thud.heavy' as const;

const slamEasing = bezierEasing(tokens.motion.easing.slam);
const backEasing = bezierEasing(tokens.motion.easing.back);
const standardEasing = bezierEasing(tokens.motion.easing.standard);

// docs/design-system.md §3.4 `stamp`: "fall s 2.2->.94 450 slam, overshoot 1.04, settle ~540".
const FALL_MS = 450;
const OVERSHOOT_MS = 55;
const SETTLE_MS = 35;

export interface UseStampOptions {
  /** Plays the fall-and-impact sequence whenever this is (or becomes) `true`. */
  readonly active: boolean;
}

/**
 * A stamp falling from an oversized 2.2x scale down to a .94x undershoot, then overshooting to
 * 1.04x and settling to 1x. At the moment it lands (the fall's end), fires the screen jolt and the
 * `thud.heavy` haptic together, in the same frame. Reduced motion: a 150ms opacity fade, no jolt,
 * haptic kept (docs/design-system.md §5).
 */
export function useStamp({ active }: UseStampOptions) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);
  const reduced = useReducedImpactMotion();
  const { triggerScreenJolt } = useScreenJolt();

  useEffect(() => {
    if (!active) return;
    if (reduced) {
      opacity.value = withTiming(
        1,
        { duration: REDUCED_IMPACT_FADE_MS, easing: standardEasing },
        (finished) => {
          'worklet';
          if (finished) triggerImpact(THUD_HEAVY_CUE);
        },
      );
      return;
    }
    opacity.value = 1;
    scale.value = 2.2;
    scale.value = withSequence(
      withTiming(0.94, { duration: FALL_MS, easing: slamEasing }, (finished) => {
        'worklet';
        if (finished) triggerImpact(THUD_HEAVY_CUE, triggerScreenJolt);
      }),
      withTiming(1.04, { duration: OVERSHOOT_MS, easing: backEasing }),
      withTiming(1, { duration: SETTLE_MS, easing: standardEasing }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs; only `active`/`reduced` should retrigger the sequence.
  }, [active, reduced]);

  return useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
}
