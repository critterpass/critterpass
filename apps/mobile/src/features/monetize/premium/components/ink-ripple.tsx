/**
 * The ink ring that spreads from a stamp at impact (1.07): grows .6 → 1.8 and fades. Nothing under
 * Reduce Motion.
 */
import { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { usePremiumReducedMotion } from '@/ui/premium';
import { MONETIZE_TIMING } from '../monetize-palette';

export function InkRipple({
  fire,
  color,
  width,
  height,
  radius,
}: {
  readonly fire: boolean;
  readonly color: string;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
}) {
  const reduced = usePremiumReducedMotion();
  const k = useSharedValue(0);
  useEffect(() => {
    if (!fire || reduced) return;
    k.set(withTiming(1, { duration: MONETIZE_TIMING.inkRing }));
  }, [fire, reduced, k]);
  const style = useAnimatedStyle(() => ({
    opacity: k.value === 0 ? 0 : 0.7 * (1 - k.value),
    transform: [{ scale: 0.6 + 1.2 * k.value }],
  }));
  if (reduced) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width,
          height,
          borderRadius: radius,
          borderWidth: 3,
          borderColor: color,
        },
        style,
      ]}
    />
  );
}
