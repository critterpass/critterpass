/**
 * The 1.07 stamp landing for any stamp it wraps (ISSUED, HOME, ADMITTED, EXPIRED): after `delayMs`
 * the stamp falls from 2.2× and −30°, squashes on impact (the thud and its haptic play there),
 * then settles on the Lively spring with one wobble. Reduce Motion lands it with a 150 ms fade;
 * `play={false}` shows it settled (a page seen again).
 */
import { useEffect, type ReactNode } from 'react';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { REDUCED_FADE_MS, SPRINGS, usePremiumReducedMotion } from '@/ui/premium';

import { onboardingCues } from '../../cues';
import { STAMP_APPEAR_MS, STAMP_SQUASH_MS } from './onboarding-colours';

export interface StampLandingProps {
  readonly children: ReactNode;
  readonly delayMs?: number;
  readonly play?: boolean;
  /** Called at impact (after the fall), e.g. to start confetti or the next stamp. */
  readonly onImpact?: () => void;
}

/** The fall before impact: an ease-in drop. */
const FALL_MS = 560;

export function StampLanding({ children, delayMs = 0, play = true, onImpact }: StampLandingProps) {
  const reduced = usePremiumReducedMotion();
  const fall = useSharedValue(play ? 0 : 1);
  const settle = useSharedValue(play ? 0 : 1);
  const opacity = useSharedValue(play ? 0 : 1);

  useEffect(() => {
    if (!play) return;
    const impact = () => {
      onboardingCues.thud();
      onImpact?.();
    };
    if (reduced) {
      opacity.value = withDelay(delayMs, withTiming(1, { duration: REDUCED_FADE_MS }));
      fall.value = 1;
      settle.value = 1;
      const timer = setTimeout(impact, delayMs);
      return () => clearTimeout(timer);
    }
    opacity.value = withDelay(delayMs, withTiming(1, { duration: STAMP_APPEAR_MS }));
    fall.value = withDelay(
      delayMs,
      withTiming(1, { duration: FALL_MS, easing: Easing.in(Easing.cubic) }, (done) => {
        if (done === true) {
          runOnJS(impact)();
          settle.value = withSequence(
            withTiming(0.4, { duration: STAMP_SQUASH_MS }),
            withSpring(1, SPRINGS.lively),
          );
        }
      }),
    );
    return undefined;
    // The landing plays once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => {
    const f = fall.value;
    // Squash on impact (settle 0 → .9 × .84), back to 1 as the spring settles.
    const squash = f < 1 ? 1 : settle.value;
    return {
      opacity: opacity.value,
      transform: [
        { translateY: (1 - f) * -120 },
        { rotate: `${String((1 - f) * -30)}deg` },
        { scaleX: (2.2 - 1.2 * f) * (0.9 + 0.1 * squash) },
        { scaleY: (2.2 - 1.2 * f) * (0.84 + 0.16 * squash) },
      ],
    };
  });

  return <Animated.View style={style}>{children}</Animated.View>;
}
