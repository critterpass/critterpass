import { Gesture } from 'react-native-gesture-handler';
import {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tokens } from '@cp/design-tokens';

import { bezierEasing, isPhysicalSpring, springConfig } from '../easing';
import { REDUCED_IMPACT_FADE_MS, useReducedImpactMotion } from '../patterns/shared';
import type { GestureHookResult } from './shared';

/** docs/design-system.md §3.4 `fling`: "commit |dx| > 110". */
export const FLING_COMMIT_DISTANCE_PT = 110;
const ROTATION_DIVISOR = 14; // "rotate(dx/14°)"
const VERTICAL_DAMPING = 0.3; // "translate(dx, dy·.3)"
const OUT_DISTANCE_PT = 640; // clears any card width off-screen
const OUT_DURATION_MS = 400; // "out 400 slam"
/** "next card from ty 26 s .93 gentle" — the entry transform the next card in the deck should start from. */
export const NEXT_CARD_ENTRY = { translateY: 26, scale: 0.93 } as const;

export function commitsFling(
  dx: number,
  commitDistance: number = FLING_COMMIT_DISTANCE_PT,
): boolean {
  return Math.abs(dx) >= commitDistance;
}

export type SwipeDirection = 'left' | 'right';

export interface UseSwipeDeckOptions {
  readonly onSwiped: (direction: SwipeDirection) => void;
  readonly disabled?: boolean;
  readonly accessibilityLabel: string;
}

export interface SwipeDeckAnimatedStyle {
  readonly transform: (
    { translateX: number } | { translateY: number } | { rotate: `${number}deg` }
  )[];
}

const gentleSpring = isPhysicalSpring(tokens.motion.spring.gentle)
  ? springConfig(tokens.motion.spring.gentle)
  : undefined;
const slamEasing = bezierEasing(tokens.motion.easing.slam);

/** A swipeable card deck (docs/design-system.md §3.4 `fling`): drag, commit past 110 pt, or spring back. */
export function useSwipeDeck({
  onSwiped,
  disabled = false,
  accessibilityLabel,
}: UseSwipeDeckOptions): GestureHookResult {
  const reduced = useReducedImpactMotion();
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const rotateDeg = useDerivedValue(() => (reduced ? 0 : tx.value / ROTATION_DIVISOR));

  const fireSwiped = (direction: SwipeDirection) => onSwiped(direction);

  const gesture = Gesture.Pan()
    .enabled(!disabled)
    .onUpdate((event) => {
      'worklet';
      tx.value = event.translationX;
      ty.value = event.translationY * VERTICAL_DAMPING;
    })
    .onEnd((event) => {
      'worklet';
      if (commitsFling(event.translationX)) {
        const direction: SwipeDirection = event.translationX > 0 ? 'right' : 'left';
        const outX = direction === 'right' ? OUT_DISTANCE_PT : -OUT_DISTANCE_PT;
        const outConfig = reduced
          ? { duration: REDUCED_IMPACT_FADE_MS }
          : { duration: OUT_DURATION_MS, easing: slamEasing };
        tx.value = withTiming(outX, outConfig, (finished) => {
          if (finished) {
            tx.value = 0;
            ty.value = 0;
            scheduleOnRN(fireSwiped, direction);
          }
        });
      } else if (reduced) {
        tx.value = withTiming(0, { duration: REDUCED_IMPACT_FADE_MS });
        ty.value = withTiming(0, { duration: REDUCED_IMPACT_FADE_MS });
      } else {
        tx.value = withSpring(0, gentleSpring);
        ty.value = withSpring(0, gentleSpring);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${rotateDeg.value}deg` },
    ],
  }));

  return {
    gesture,
    animatedStyle,
    // design-system.md §5 "swipe/rate stacks → buttons".
    accessibilityActions: [
      { name: 'swipeLeft', label: accessibilityLabel },
      { name: 'swipeRight', label: accessibilityLabel },
    ],
    onAccessibilityAction: (event) => {
      if (event.nativeEvent.actionName === 'swipeLeft') onSwiped('left');
      if (event.nativeEvent.actionName === 'swipeRight') onSwiped('right');
    },
  };
}
