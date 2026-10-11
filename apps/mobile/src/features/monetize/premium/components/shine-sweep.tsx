/**
 * A white band that sweeps across a card or button every few seconds (9.10, 9.15, 9.17): ambient,
 * so it stops under Reduce Motion. The parent clips it (`overflow: hidden`).
 */
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { usePremiumReducedMotion } from '@/ui/premium';
import { MONETIZE_TIMING } from '../monetize-palette';

export interface ShineSweepProps {
  /** One sweep and its rest, in ms. */
  readonly every: number;
  /** Band width. */
  readonly width: number;
  /** How far it travels (the host's width plus the band). */
  readonly distance: number;
  readonly opacity?: number;
}

export function ShineSweep({ every, width, distance, opacity = 0.7 }: ShineSweepProps) {
  const reduced = usePremiumReducedMotion();
  const x = useSharedValue(-width);
  useEffect(() => {
    if (reduced) return;
    const sweep = Math.round(every * 0.25);
    x.set(
      withRepeat(
        withSequence(
          withTiming(-width, { duration: MONETIZE_TIMING.instant }),
          withDelay(
            every - sweep,
            withTiming(distance, { duration: sweep, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
          ),
        ),
        -1,
      ),
    );
  }, [reduced, every, width, distance, x]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { skewX: '-20deg' }],
  }));
  if (reduced) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.band,
        { width, backgroundColor: `rgba(255,255,255,${String(opacity)})` },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', top: -20, bottom: -20, left: 0 },
});
