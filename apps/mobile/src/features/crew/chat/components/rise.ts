/**
 * New messages rise into place on the design system's soft spring; with reduced motion they only
 * fade. Messages already on screen when the chat opens do not animate.
 */
import { tokens } from '@cp/design-tokens';
import { useEffect } from 'react';
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const soft = tokens.motion.spring.soft;
const SOFT_SPRING =
  soft.kind === 'physical'
    ? { stiffness: soft.stiffness, damping: soft.damping, mass: soft.mass }
    : { stiffness: 195, damping: 20, mass: 1 };
const RISE_PX = 18;

export function useRise(animate: boolean) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) return;
    progress.value = reduceMotion
      ? withTiming(1, { duration: tokens.motion.duration.fast })
      : withSpring(1, SOFT_SPRING);
    // Runs once per mounted message; `progress` is a stable shared value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return useAnimatedStyle(() =>
    reduceMotion
      ? { opacity: progress.value }
      : { opacity: progress.value, transform: [{ translateY: (1 - progress.value) * RISE_PX }] },
  );
}
