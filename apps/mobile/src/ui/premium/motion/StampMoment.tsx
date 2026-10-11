import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { premium } from '@cp/design-tokens';

import type { StampInk } from '../stickers/Stamp';
import { Confetti } from './Confetti';
import { usePremiumReducedMotion } from './reduced-motion';
import { REDUCED_FADE, SPRINGS } from './springs';

const S = premium.motion.stamp;
const JOLT_UP = -S.joltUp / S.joltDown;

export interface StampMomentProps {
  /** The page under the stamp; it jolts when the stamp hits. */
  readonly children: ReactNode;
  /** The stamp itself, drawn unrotated: the moment gives it the −12° rest. */
  readonly stamp: ReactNode;
  /** The card that rises from the bottom once the stamp has landed. */
  readonly result?: ReactNode;
  /** Flip to `true` to drop the stamp; `true` from the start shows it already landed. */
  readonly landed: boolean;
  /** The ripple ring's ink. @default 'pink' */
  readonly ink?: StampInk;
  /** Fired at impact (the screen plays the stamp haptic and sound through the feedback bus). */
  readonly onImpact?: () => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/**
 * The stamp moment (Foundations 1.07): the stamp falls from above, large and turned, hits with a
 * squash and settles on Lively; at impact the page jolts, an ink ripple grows and fades, confetti
 * bursts and the result card rises. Under Reduce Motion the stamp still lands, without falling: it
 * and the result fade in, and the impact callback still fires.
 */
export function StampMoment({
  children,
  stamp,
  result,
  landed,
  ink = 'pink',
  onImpact,
  style,
  testID,
}: StampMomentProps) {
  const reduced = usePremiumReducedMotion();
  const fall = useSharedValue(landed ? 1 : 0);
  const shown = useSharedValue(landed ? 1 : 0);
  const squash = useSharedValue(0);
  const jolt = useSharedValue(0);
  const ripple = useSharedValue(0);
  const rise = useSharedValue(landed ? 1 : 0);
  const armed = useSharedValue(false);
  const [burst, setBurst] = useState(0);
  const wasLanded = useRef(landed);
  const impact = () => {
    setBurst((n) => n + 1);
    onImpact?.();
  };

  useEffect(() => {
    const was = wasLanded.current;
    wasLanded.current = landed;
    if (!landed) {
      armed.set(false);
      fall.set(0);
      shown.set(0);
      rise.set(0);
      ripple.set(0);
      return;
    }
    if (was) return;
    if (reduced) {
      fall.set(1);
      shown.set(withTiming(1, REDUCED_FADE));
      rise.set(withTiming(1, REDUCED_FADE));
      onImpact?.();
      return;
    }
    armed.set(true);
    shown.set(1);
    fall.set(withSpring(1, SPRINGS.lively));
  }, [landed, reduced, onImpact, armed, fall, shown, rise, ripple]);

  useAnimatedReaction(
    () => armed.get() && fall.get() >= 1,
    (hit) => {
      if (!hit) return;
      armed.set(false);
      // Each hit starts from its impact pose: set it, then spring back from there.
      squash.set(1);
      squash.set(withSpring(0, SPRINGS.lively));
      jolt.set(1);
      jolt.set(withSequence(withSpring(JOLT_UP, SPRINGS.snappy), withSpring(0, SPRINGS.lively)));
      ripple.set(0);
      ripple.set(withSpring(1, SPRINGS.smooth));
      rise.set(withSpring(1, SPRINGS.lively));
      scheduleOnRN(impact);
    },
  );

  const pageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: jolt.value * S.joltDown },
      {
        rotate: `${String(interpolate(jolt.value, [JOLT_UP, 0, 1], [-S.joltRotate, 0, S.joltRotate]))}deg`,
      },
    ],
  }));

  const stampStyle = useAnimatedStyle(() => {
    const base = interpolate(fall.value, [0, 1], [S.fromScale, 1], 'clamp');
    return {
      opacity: shown.value,
      transform: [
        { translateY: interpolate(fall.value, [0, 1], [S.fromY, 0], 'clamp') },
        {
          rotate: `${String(interpolate(fall.value, [0, 1], [S.fromRotate, S.restRotate], 'clamp'))}deg`,
        },
        { scaleX: base * interpolate(squash.value, [0, 1], [1, S.impactScaleX]) },
        { scaleY: base * interpolate(squash.value, [0, 1], [1, S.impactScaleY]) },
      ],
    };
  });

  const rippleStyle = useAnimatedStyle(() => ({
    opacity: ripple.value <= 0 ? 0 : interpolate(ripple.value, [0, 1], [S.rippleOpacity, 0]),
    transform: [{ scale: interpolate(ripple.value, [0, 1], [S.rippleFrom, S.rippleTo]) }],
  }));

  const resultStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, rise.value),
    transform: [{ translateY: interpolate(rise.value, [0, 1], [S.resultRise, 0]) }],
  }));

  return (
    <View style={[styles.root, style]} testID={testID}>
      <Animated.View style={[styles.page, pageStyle]}>{children}</Animated.View>
      <View style={styles.centre} pointerEvents="none">
        <Animated.View
          style={[styles.ripple, { borderColor: premium.stamp[ink].ring }, rippleStyle]}
        />
        <Animated.View style={stampStyle} testID={testID ? `${testID}-stamp` : undefined}>
          {stamp}
        </Animated.View>
        {burst > 0 ? <Confetti fire={burst} /> : null}
      </View>
      {result ? (
        <Animated.View
          style={[styles.result, resultStyle]}
          pointerEvents={landed ? 'box-none' : 'none'}
        >
          {result}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: { flex: 1 },
  centre: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  ripple: {
    position: 'absolute',
    width: S.rippleSize,
    height: S.rippleSize,
    borderRadius: S.rippleSize / 2,
    borderWidth: S.rippleStroke,
  },
  result: {
    position: 'absolute',
    left: premium.space.gap10,
    right: premium.space.gap10,
    bottom: premium.space.gap10,
  },
});
