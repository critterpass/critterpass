/**
 * Entrances on the three premium springs, never the library's defaults: a pop from 0.9 while it
 * fades in (Snappy for menus, Lively for stamps and rewards), a short rise for rows and cards, and
 * the 150 ms fade under Reduce Motion.
 */
import { premium, type PremiumSpringName } from '@cp/design-tokens';
import {
  FadeInDown,
  ReduceMotion,
  withSpring,
  withTiming,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';

import { REDUCED_FADE, reducedFadeIn, SPRINGS } from './springs';

/** Pops in from 0.9 on `spring` while it fades in; fades under Reduce Motion. */
export function popIn(reduced: boolean, spring: PremiumSpringName = 'snappy') {
  if (reduced) return reducedFadeIn();
  const pop: EntryExitAnimationFunction = () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ scale: 0.9 }] },
      animations: {
        opacity: withTiming(1, REDUCED_FADE),
        transform: [{ scale: withSpring(1, SPRINGS[spring]) }],
      },
    };
  };
  return pop;
}

/** Rises into place on `spring` (after `delay` ms); fades under Reduce Motion. */
export function riseIn(reduced: boolean, spring: PremiumSpringName = 'smooth', delay = 0) {
  if (reduced) return reducedFadeIn();
  const { stiffness, damping, mass } = premium.spring[spring];
  return FadeInDown.springify()
    .stiffness(stiffness)
    .damping(damping)
    .mass(mass)
    .delay(delay)
    .reduceMotion(ReduceMotion.Never);
}
