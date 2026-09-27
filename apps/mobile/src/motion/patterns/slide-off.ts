import { useEffect } from 'react';
import { scheduleOnRN } from 'react-native-worklets';
import {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '../easing';
import { REDUCED_IMPACT_FADE_MS, useReducedImpactMotion } from './shared';

const exitEasing = bezierEasing(tokens.motion.easing.exit);
const standardEasing = bezierEasing(tokens.motion.easing.standard);

// docs/design-system.md §3.4 `slideOff`: "tx 110% r4deg fade 360 exit, then collapse 320 standard".
const EXIT_MS = 360;
const COLLAPSE_MS = 320;

export interface UseSlideOffOptions {
  readonly active: boolean;
  /** Called once the row has fully collapsed, so the caller can remove it from the list. */
  readonly onDismissed?: () => void;
}

/**
 * A handled inbox/card row sliding off (translateX 110% of its own width, a slight rotation, fade,
 * 360ms exit easing), then its now-empty row height collapsing to 0 over 320ms (standard easing).
 * `translateX` is a fraction of the row's own width; the caller multiplies by its measured layout.
 * Returns `{ style }` (apply to the row's inner content) and `heightFactor` (1 to 0; feed to
 * `useSlideOffHeightStyle` on the row's outer wrapper to actually collapse its layout height).
 */
export function useSlideOff({ active, onDismissed }: UseSlideOffOptions) {
  const translateX = useSharedValue(0);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);
  const heightFactor = useSharedValue(1);
  const reduced = useReducedImpactMotion();

  useEffect(() => {
    if (!active) return;
    if (reduced) {
      opacity.value = withTiming(
        0,
        { duration: REDUCED_IMPACT_FADE_MS, easing: standardEasing },
        (finished) => {
          'worklet';
          if (finished) {
            heightFactor.value = 0;
            if (onDismissed) scheduleOnRN(onDismissed);
          }
        },
      );
      return;
    }
    translateX.value = withTiming(1.1, { duration: EXIT_MS, easing: exitEasing });
    rotate.value = withTiming(4, { duration: EXIT_MS, easing: exitEasing });
    opacity.value = withTiming(0, { duration: EXIT_MS, easing: exitEasing });
    heightFactor.value = withDelay(
      EXIT_MS,
      withTiming(0, { duration: COLLAPSE_MS, easing: standardEasing }, (finished) => {
        'worklet';
        if (finished && onDismissed) scheduleOnRN(onDismissed);
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs; onDismissed is read fresh via closure at completion time.
  }, [active, reduced]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }, { rotate: `${rotate.value}deg` }],
  }));

  return { style, heightFactor };
}

/** Applied to the row's outer wrapper to collapse its layout height alongside `useSlideOff`'s `heightFactor`. */
export function useSlideOffHeightStyle(heightFactor: SharedValue<number>, naturalHeight: number) {
  return useAnimatedStyle(() => ({ height: heightFactor.value * naturalHeight }));
}
