import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '@/motion/easing';
import { useReducedImpactMotion } from '@/motion/patterns/shared';

import { REDUCED_FADE_MS } from '../sheet/use-modal-presentation';

// docs/design-system.md §3.3 `fold`: "ty 70 -> 0 + fade, delay 160; out scale .9 380; 560".
export const FOLD_MS = tokens.motion.transition.fold.enter?.durationMs ?? 560;
export const FOLD_OUT_MS = tokens.motion.transition.fold.exit?.durationMs ?? 380;
export const FOLD_DELAY_MS = 160;
const FOLD_RISE_PT = 70;
const FOLD_OUT_SCALE = 0.9;
const standard = bezierEasing(tokens.motion.easing.standard);

export interface FoldProps {
  readonly children: ReactNode;
  /** Set when the content hands off (AI job done): it shrinks to .9 and fades, then `onLeft`. */
  readonly leaving?: boolean | undefined;
  readonly onLeft?: (() => void) | undefined;
  readonly testID?: string | undefined;
}

/** AI-job hand-off: content rises 70 pt and fades in after a 160 ms beat; leaves at .9 scale. */
export function Fold({ children, leaving = false, onLeft, testID = 'fold' }: FoldProps) {
  const reduced = useReducedImpactMotion();
  const ty = useSharedValue(reduced ? 0 : FOLD_RISE_PT);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reduced) {
      opacity.value = withTiming(1, { duration: REDUCED_FADE_MS });
      return;
    }
    const enter = { duration: FOLD_MS, easing: standard };
    ty.value = withDelay(FOLD_DELAY_MS, withTiming(0, enter));
    opacity.value = withDelay(FOLD_DELAY_MS, withTiming(1, enter));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entrance runs once per mount
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const done = (finished?: boolean) => {
      'worklet';
      if (finished && onLeft) scheduleOnRN(onLeft);
    };
    const duration = reduced ? REDUCED_FADE_MS : FOLD_OUT_MS;
    /* eslint-disable react-hooks/immutability -- Reanimated shared values' `.value` setters, not React state. */
    if (!reduced) scale.value = withTiming(FOLD_OUT_SCALE, { duration, easing: standard });
    opacity.value = withTiming(0, { duration }, done);
    /* eslint-enable react-hooks/immutability */
  }, [leaving, reduced, onLeft, opacity, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View testID={testID} style={[styles.root, style]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
