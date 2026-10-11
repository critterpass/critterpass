/**
 * Pops a sticker or chip in after a delay (Lively: scale .4 → 1 with one wobble); Reduce Motion
 * fades it in.
 */
import { useEffect, type ReactNode } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { REDUCED_FADE, SPRINGS, usePremiumReducedMotion } from '@/ui/premium';

export function PopIn({
  play,
  delay,
  children,
}: {
  readonly play: boolean;
  readonly delay: number;
  readonly children: ReactNode;
}) {
  const reduced = usePremiumReducedMotion();
  const k = useSharedValue(0);
  useEffect(() => {
    if (!play) return;
    k.set(
      withDelay(
        reduced ? 0 : delay,
        reduced ? withTiming(1, REDUCED_FADE) : withSpring(1, SPRINGS.lively),
      ),
    );
  }, [play, reduced, delay, k]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, k.value * 2),
    transform: [{ scale: reduced ? 1 : 0.4 + 0.6 * k.value }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
