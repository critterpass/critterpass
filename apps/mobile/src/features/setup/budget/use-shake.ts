/** A small side-to-side shake when `key` changes to a new rejection (none with reduced motion). */
import { useEffect } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { useMotionMode } from '@/motion/motion-mode';

const SHAKE_PT = 8;

export function useShake(key: number) {
  const [mode] = useMotionMode();
  const offset = useSharedValue(0);
  useEffect(() => {
    if (key === 0 || mode !== 'full') return;
    const step = { duration: tokens.motion.duration.instant / 3 };
    offset.value = withSequence(
      withTiming(-SHAKE_PT, step),
      withTiming(SHAKE_PT, step),
      withTiming(-SHAKE_PT / 2, step),
      withTiming(0, step),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, [key, mode]);
  return useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
}
