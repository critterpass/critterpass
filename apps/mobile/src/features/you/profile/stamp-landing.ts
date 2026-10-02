/**
 * The profile's stamps landing one after another when it opens (3n-1): each drops from a slightly
 * larger size onto the page with a soft thud and haptic (the feedback bus applies the Sound
 * settings), 100 ms apart. Reduce Motion shows them in place, without the thuds.
 */
import { tokens } from '@cp/design-tokens';
import { useEffect } from 'react';
import { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { bezierEasing } from '@/motion/easing';
import { triggerImpact, useReducedImpactMotion } from '@/motion/patterns/shared';

/** Between one stamp landing and the next (the design's 80–120 ms). */
export const STAMP_STAGGER_MS = 100;
const DROP_MS = 260;
const DROP_FROM = 1.3;
const slam = bezierEasing(tokens.motion.easing.slam);
const THUD = 'thud.soft' as const;

export function useStampLanding(index: number) {
  const reduced = useReducedImpactMotion();
  const scale = useSharedValue(reduced ? 1 : DROP_FROM);
  const opacity = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    const delay = index * STAMP_STAGGER_MS;
    opacity.value = withDelay(delay, withTiming(1, { duration: DROP_MS / 2 }));
    scale.value = withDelay(
      delay,
      withTiming(1, { duration: DROP_MS, easing: slam }, (finished) => {
        'worklet';
        if (finished) triggerImpact(THUD);
      }),
    );
    // Runs once per mount: the stamps land when the profile opens, not on every sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
}
