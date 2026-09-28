/**
 * Fades its content in when it mounts (300 ms, after an optional delay); keyed by what it shows, a
 * change cross-fades. Instant under reduced motion.
 */
import { useEffect, type ReactNode } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useReducedImpactMotion } from '@/motion/patterns/shared';

export const CROSS_FADE_MS = 300;

export function FadeInView({
  children,
  delayMs = 0,
}: {
  readonly children: ReactNode;
  readonly delayMs?: number;
}) {
  const reduced = useReducedImpactMotion();
  const opacity = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    opacity.value = reduced ? 1 : withDelay(delayMs, withTiming(1, { duration: CROSS_FADE_MS }));
  }, [opacity, reduced, delayMs]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
