import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '@/motion/easing';
import { useReducedImpactMotion } from '@/motion/patterns/shared';

import { REDUCED_FADE_MS } from '../sheet/use-modal-presentation';

// docs/design-system.md §3.3 `burst`: "s 1.2 -> 1 + flash #fffbe8 .55 over 460; 640 burst easing".
export const BURST_MS = tokens.motion.transition.burst.enter?.durationMs ?? 640;
export const BURST_FLASH_MS = 460;
const BURST_FROM_SCALE = 1.2;
const FLASH_OPACITY = 0.55;
const burstEasing = bezierEasing(tokens.motion.easing.burst);

export interface BurstProps {
  readonly children: ReactNode;
  readonly testID?: string | undefined;
}

/**
 * Celebration entrance: content settles from 1.2× while a cream flash fades out. Reduced motion:
 * a 200 ms fade and no flash.
 */
export function Burst({ children, testID = 'burst' }: BurstProps) {
  const reduced = useReducedImpactMotion();
  const scale = useSharedValue(reduced ? 1 : BURST_FROM_SCALE);
  const opacity = useSharedValue(reduced ? 0 : 1);
  const flash = useSharedValue(reduced ? 0 : FLASH_OPACITY);

  useEffect(() => {
    if (reduced) {
      opacity.value = withTiming(1, { duration: REDUCED_FADE_MS });
      return;
    }
    scale.value = withTiming(1, { duration: BURST_MS, easing: burstEasing });
    flash.value = withSequence(withTiming(0, { duration: BURST_FLASH_MS }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entrance runs once per mount
  }, []);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  return (
    <View style={styles.root} testID={testID}>
      <Animated.View style={[styles.root, contentStyle]}>{children}</Animated.View>
      {reduced ? null : (
        <Animated.View
          testID={`${testID}-flash`}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.flash, flashStyle]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flash: { backgroundColor: tokens.color.flash },
});
