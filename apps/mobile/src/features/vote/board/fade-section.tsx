/**
 * A streamed section fading in as it arrives (460 ms); instant under reduced motion.
 */
import { tokens } from '@cp/design-tokens';
import { useEffect, type ReactNode } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useReducedImpactMotion } from '@/motion/patterns/shared';

export function FadeSection({ children }: { readonly children: ReactNode }) {
  const reduced = useReducedImpactMotion();
  const opacity = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    opacity.value = reduced ? 1 : withTiming(1, { duration: tokens.motion.duration.medium });
  }, [opacity, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
