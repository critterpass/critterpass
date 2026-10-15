/**
 * A sticker's idle float (the splash collage): a slow bob and sway on a loop, offset so neighbours
 * never move together. Parked at rest under Reduce Motion, and whenever the idle-loop switch says
 * so: under the pages pushed over the splash it kept moving out of sight, and on Android every
 * frame of it told the accessibility layer the window changed, so a test typing on the pass page
 * waited out its full idle timeout after each letter.
 */
import { useEffect, type ReactNode } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useIdleLoopRunning } from '@/motion/idle-pause';
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
  const looping = useIdleLoopRunning(!reduced);
  const phase = useSharedValue(0);
  useEffect(() => {
    if (!looping) {
      cancelAnimation(phase);
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
  }, [looping, periodMs, delayMs, phase]);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -lift * phase.value },
      { rotate: `${String(-sway + 2 * sway * phase.value)}deg` },
    ],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
