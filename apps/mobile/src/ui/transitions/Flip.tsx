import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '@/motion/easing';
import { useReducedImpactMotion } from '@/motion/patterns/shared';

import { REDUCED_FADE_MS } from '../sheet/use-modal-presentation';
import { degrees } from '../theme';

// docs/design-system.md §3.3 `flip`: "rotateY -90 -> 0 at perspective 1600; 680 total".
export const FLIP_MS = tokens.motion.transition.flip.enter?.durationMs ?? 680;
export const FLIP_PERSPECTIVE = 1600;
const standard = bezierEasing(tokens.motion.easing.standard);

export interface FlipProps {
  readonly front: ReactNode;
  readonly back: ReactNode;
  /** Which face shows; changing it flips (and flips back) the card. */
  readonly flipped: boolean;
  readonly testID?: string | undefined;
}

/**
 * Card flip: the showing face turns to edge (0 → 90°) for the first half, the other turns in from
 * −90° for the second. Only the showing face is in the accessibility tree. Reduced: a cross-fade.
 */
export function Flip({ front, back, flipped, testID = 'flip' }: FlipProps) {
  const reduced = useReducedImpactMotion();
  // 0 = front showing, 1 = back showing.
  const progress = useSharedValue(flipped ? 1 : 0);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    progress.value = withTiming(flipped ? 1 : 0, {
      duration: reduced ? REDUCED_FADE_MS : FLIP_MS,
      easing: standard,
    });
  }, [flipped, reduced, progress]);

  const frontStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduced) return { opacity: 1 - p };
    return {
      opacity: p < 0.5 ? 1 : 0,
      transform: [{ perspective: FLIP_PERSPECTIVE }, { rotateY: degrees(Math.min(90, p * 180)) }],
    };
  });
  const backStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reduced) return { opacity: p };
    return {
      opacity: p >= 0.5 ? 1 : 0,
      transform: [
        { perspective: FLIP_PERSPECTIVE },
        { rotateY: degrees(Math.min(0, p * 180 - 180)) },
      ],
    };
  });

  return (
    <View testID={testID}>
      <Animated.View
        style={frontStyle}
        accessibilityElementsHidden={flipped}
        importantForAccessibility={flipped ? 'no-hide-descendants' : 'auto'}
      >
        {front}
      </Animated.View>
      <Animated.View
        style={[StyleSheet.absoluteFill, backStyle]}
        accessibilityElementsHidden={!flipped}
        importantForAccessibility={flipped ? 'auto' : 'no-hide-descendants'}
      >
        {back}
      </Animated.View>
    </View>
  );
}
