/**
 * The 1.07 stamp landing: the stamp falls on the Lively spring from
 * `translateY(-fall) scale(start) rotate(from)`,
 * squashes on impact and settles on the Lively spring; the page's haptic and confetti hang off
 * `onImpact`. Reduce Motion: a 150 ms fade, no fall.
 */
import * as Haptics from 'expo-haptics';
import { useEffect, type ReactNode } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { REDUCED_FADE, SPRINGS, usePremiumReducedMotion } from '@/ui/premium';
import { MONETIZE_TIMING } from '../monetize-palette';

export interface StampSlamProps {
  readonly children: ReactNode;
  /** Lands when true (once). */
  readonly play: boolean;
  /** Wait before the fall, ms. */
  readonly delay?: number;
  /** Scale the stamp starts from (2–2.3). */
  readonly from?: number;
  /** Height it falls from, pt. */
  readonly fall?: number;
  /** Rotation it starts at, degrees. */
  readonly spin?: number;
  /** Where it rests, degrees. */
  readonly rotate: number;
  readonly onImpact?: () => void;
}

/** The fall ends at first contact, at speed: Lively, clamped, so the squash takes the overshoot. */
const FALL = { ...SPRINGS.lively, overshootClamping: true };

function thud(onImpact?: () => void): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  onImpact?.();
}

export function StampSlam({
  children,
  play,
  delay = 0,
  from = 2.2,
  fall = 120,
  spin = -30,
  rotate,
  onImpact,
}: StampSlamProps) {
  const reduced = usePremiumReducedMotion();
  const p = useSharedValue(0);
  const squash = useSharedValue(1);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!play) return;
    if (reduced) {
      opacity.set(withDelay(delay, withTiming(1, REDUCED_FADE)));
      p.set(1);
      return;
    }
    opacity.set(withDelay(delay, withTiming(1, { duration: MONETIZE_TIMING.stampAppear })));
    p.set(
      withDelay(
        delay,
        withSpring(1, FALL, (done) => {
          if (done !== true) return;
          scheduleOnRN(thud, onImpact);
          squash.value = withSequence(
            withTiming(0, { duration: MONETIZE_TIMING.instant }),
            withSpring(1, SPRINGS.lively),
          );
        }),
      ),
    );
    // Lands once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play, reduced]);

  const style = useAnimatedStyle(() => {
    const k = p.value;
    // Squash: 0 at impact (0.92 × 0.84), 1 at rest.
    const sx = 0.92 + 0.08 * squash.value;
    const sy = 0.84 + 0.16 * squash.value;
    const s = from + (1 - from) * k;
    return {
      opacity: opacity.value,
      transform: [
        { translateY: -fall * (1 - k) },
        { rotate: `${String(spin + (rotate - spin) * k)}deg` },
        { scaleX: k < 1 ? s : sx },
        { scaleY: k < 1 ? s : sy },
      ],
    };
  });

  return <Animated.View style={style}>{children}</Animated.View>;
}
