/**
 * Pins and bunch pills spring in when they appear (a merge draws the pill, a split draws the
 * pins), on the `bouncy` spring for pins. Reduced motion shows them at rest.
 */
import { tokens } from '@cp/design-tokens';
import { useEffect } from 'react';
import { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { isPhysicalSpring, springConfig } from '@/motion';
import { useMotionMode } from '@/motion/motion-mode';

const FROM_SCALE = 0.6;
const BOUNCY = isPhysicalSpring(tokens.motion.spring.bouncy)
  ? springConfig(tokens.motion.spring.bouncy)
  : undefined;

export function usePopIn() {
  const [motionMode] = useMotionMode();
  const animate = motionMode === 'full';
  const scale = useSharedValue(animate ? FROM_SCALE : 1);
  useEffect(() => {
    scale.value = animate ? withSpring(1, BOUNCY) : 1;
  }, [animate, scale]);
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
}
