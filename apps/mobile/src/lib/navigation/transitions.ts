import { Easing } from 'react-native';
import type { BottomTabNavigationOptions } from 'expo-router/js-tabs';

/**
 * Screen transitions from the motion tokens (docs/design-system.md §3.3). `lib` may not import
 * `@cp/design-tokens`, so layouts pass `useTheme().motion` in; this module only needs this shape.
 */
type Bezier = readonly [number, number, number, number];

interface TransitionLeg {
  readonly durationMs?: number | undefined;
  readonly easing?: Bezier | undefined;
}

interface TransitionToken {
  readonly enter?: TransitionLeg | undefined;
  readonly exit?: TransitionLeg | undefined;
  readonly back?: TransitionLeg | undefined;
}

export type TransitionName =
  'push' | 'sheet' | 'rise' | 'zoom' | 'burst' | 'fold' | 'flip' | 'tab' | 'fade';

export interface ShellMotion {
  readonly easing: { readonly standard: Bezier; readonly gesture: Bezier };
  readonly transition: { readonly [K in TransitionName]: TransitionToken };
}

/** docs/design-system.md §5: under reduced (or off) motion every spatial transition is this fade. */
export const REDUCED_CROSS_FADE_MS = 200;

// §3.3 `tab`: "fade 240 + children ty 12 -> 0 420" — the rise is longer than the fade, so the
// scene runs the full 420 and the opacity completes at 240/420 of it.
const TAB_CHILDREN_MS = 420;
const TAB_CHILDREN_RISE_PT = 12;

export function bezier([x1, y1, x2, y2]: Bezier): (value: number) => number {
  return Easing.bezier(x1, y1, x2, y2);
}

export function legMs(
  token: TransitionToken,
  leg: keyof TransitionToken,
  fallbackMs: number,
): number {
  return token[leg]?.durationMs ?? fallbackMs;
}

/** Tab switch: fade in over the enter duration while children rise 12 pt over 420 ms. */
export function tabTransition(motion: ShellMotion, reduced: boolean): BottomTabNavigationOptions {
  if (reduced) {
    return {
      animation: 'fade',
      transitionSpec: {
        animation: 'timing',
        config: { duration: REDUCED_CROSS_FADE_MS, easing: (value: number) => value },
      },
      sceneStyleInterpolator: ({ current }) => ({
        sceneStyle: {
          opacity: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
        },
      }),
    };
  }
  const fadeMs = legMs(motion.transition.tab, 'enter', TAB_CHILDREN_MS);
  const fadeShare = 1 - Math.min(1, fadeMs / TAB_CHILDREN_MS);
  return {
    animation: 'fade',
    transitionSpec: {
      animation: 'timing',
      config: { duration: TAB_CHILDREN_MS, easing: bezier(motion.easing.standard) },
    },
    sceneStyleInterpolator: ({ current }) => ({
      sceneStyle: {
        opacity: current.progress.interpolate({
          inputRange: [-1, -fadeShare, 0, fadeShare, 1],
          outputRange: [0, 1, 1, 1, 0],
        }),
        transform: [
          {
            translateY: current.progress.interpolate({
              inputRange: [-1, 0, 1],
              outputRange: [TAB_CHILDREN_RISE_PT, 0, TAB_CHILDREN_RISE_PT],
            }),
          },
        ],
      },
    }),
  };
}
