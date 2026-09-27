/**
 * The "you are here" dot: a solid centre dot with a 2000 ms expanding ping ring (F-031 "Pins":
 * "you-dot with 2000 ms ping"). Colour is never the only signal — design-system.md §7
 * ("map 'you' dot has label") — so this always carries an accessibility label, and Reduce Motion
 * (`useReducedMotion`) drops the looping ping in favour of a static ring (fade only, no repeating
 * animation — design-system.md §4's "reduce-motion = fade only" plus §4's Live Activity/widget
 * rule against continuous loops applies here too).
 */
import { tokens } from '@cp/design-tokens';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const PING_DURATION_MS = 2000;

export function YouDot() {
  const { t } = useLingui();
  const reduceMotion = useReducedMotion();
  const ping = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      ping.value = 0;
      return;
    }
    ping.value = withRepeat(
      withTiming(1, { duration: PING_DURATION_MS, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    return () => cancelAnimation(ping);
  }, [reduceMotion, ping]);

  const ringStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 0.35, transform: [{ scale: 1.2 }] };
    return {
      opacity: 0.8 * (1 - ping.value),
      transform: [{ scale: 0.6 + ping.value * 0.9 }],
    };
  });

  const label = t({ id: 'map.youDot.accessibilityLabel', message: 'Your location' });

  return (
    <View accessibilityRole="image" accessibilityLabel={label} testID="you-dot">
      <Animated.View style={[styles.ring, ringStyle]} />
      <View style={styles.dot} />
    </View>
  );
}

const SIZE = 16;

const styles = StyleSheet.create({
  dot: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: tokens.color.blue,
    borderWidth: 2,
    borderColor: tokens.color.paper.bright,
  },
  ring: {
    position: 'absolute',
    top: -SIZE / 2,
    left: -SIZE / 2,
    width: SIZE * 2,
    height: SIZE * 2,
    borderRadius: SIZE,
    backgroundColor: tokens.color.blue,
  },
});
