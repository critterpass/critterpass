import { useEffect } from 'react';
import { scheduleOnRN } from 'react-native-worklets';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '../easing';
import { impact } from '../feedback';
import { useReducedImpactMotion } from './shared';

const turnEasing = bezierEasing(tokens.motion.easing.standard);
// docs/design-system.md §3.4 `pageTurn`: "3D rotateY with shading, 650".
const TURN_MS = 650;

export interface UsePageTurnOptions {
  readonly active: boolean;
  readonly onSettled?: () => void;
}

/** A page flipping via 3D rotateY, darkening (shading) as its underside comes into view, then settling flat. */
export function usePageTurn({ active, onSettled }: UsePageTurnOptions) {
  const rotateY = useSharedValue(0);
  const reduced = useReducedImpactMotion();

  useEffect(() => {
    if (!active) return;
    if (reduced) {
      rotateY.value = 180;
      onSettled?.();
      return;
    }
    rotateY.value = 0;
    rotateY.value = withTiming(180, { duration: TURN_MS, easing: turnEasing }, (finished) => {
      'worklet';
      if (finished) {
        scheduleOnRN(() => {
          impact('page');
          onSettled?.();
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rotateY is a stable shared value ref; onSettled is read fresh via closure at completion time.
  }, [active, reduced]);

  const style = useAnimatedStyle(() => {
    // The page is edge-on (fully shaded) at the midpoint of the turn.
    const progress = rotateY.value / 180;
    const shade = 1 - Math.abs(progress - 0.5) * 2;
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rotateY.value}deg` }],
      opacity: 1,
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a computed shading overlay colour, never rendered copy.
      backgroundColor: `rgba(0,0,0,${shade * 0.35})`,
    };
  });

  return style;
}
