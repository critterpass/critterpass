/**
 * A sticker's idle float (the splash collage): a slow bob and sway on a loop, offset so neighbours
 * never move together. Parked at rest under Reduce Motion.
 */
import { useEffect, type ReactNode } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { usePremiumReducedMotion } from '@/ui/premium';

export function IdleFloat({
  children,
  periodMs = 4600,
  delayMs = 0,
  lift = 9,
  sway = 2,
}: {
  readonly children: ReactNode;
  readonly periodMs?: number;
  readonly delayMs?: number;
  readonly lift?: number;
  readonly sway?: number;
}) {
  const reduced = usePremiumReducedMotion();
  const phase = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      phase.value = 0;
      return;
    }
    phase.value = withDelay(
      delayMs,
      withRepeat(
        withTiming(1, { duration: periodMs / 2, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
  }, [reduced, periodMs, delayMs, phase]);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -lift * phase.value },
      { rotate: `${String(-sway + 2 * sway * phase.value)}deg` },
    ],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
