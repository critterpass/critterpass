import type { StackCardStyleInterpolator, StackNavigationOptions } from 'expo-router/js-stack';
import type { BottomTabNavigationOptions } from 'expo-router/js-tabs';
import { Easing, Platform } from 'react-native';

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

const linear = (value: number) => value;

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
        config: { duration: REDUCED_CROSS_FADE_MS, easing: linear },
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

// §3.3 `push`: "in tx 100% -> 0; out tx 0 -> -30% + scrim .5".
const PUSH_PARALLAX = 0.3;
const PUSH_SCRIM_OPACITY = 0.5;
// §3.3 gestures: "edge-swipe back from x < 28" (the motion gesture kit's own threshold).
export const EDGE_SWIPE_START_PT = 28;
// The stack commits a swipe when `dx + v × impact > width / 2`; this impact makes a release at the
// designed .55 pt/ms commit on a 390 pt screen with no travel, matching the design's velocity rule.
const EDGE_SWIPE_VELOCITY_IMPACT = 390 / 2 / 550;

const forPush: StackCardStyleInterpolator = ({ current, next, layouts }) => {
  const width = layouts.screen.width;
  const enterX = current.progress.interpolate({ inputRange: [0, 1], outputRange: [width, 0] });
  const coveredX = next
    ? next.progress.interpolate({ inputRange: [0, 1], outputRange: [0, -width * PUSH_PARALLAX] })
    : 0;
  return {
    cardStyle: { transform: [{ translateX: enterX }, { translateX: coveredX }] },
    overlayStyle: {
      opacity: current.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, PUSH_SCRIM_OPACITY],
      }),
    },
  };
};

const forCrossFade: StackCardStyleInterpolator = ({ current }) => ({
  cardStyle: { opacity: current.progress },
});

/** Present instantly: sheets and rises run their own entrance over a transparent card. */
const forSelfAnimated: StackCardStyleInterpolator = () => ({});

function timing(durationMs: number, easing: (value: number) => number) {
  return { animation: 'timing' as const, config: { duration: durationMs, easing } };
}

/** Drill-down push (480 standard; pop 420) with iOS edge-swipe back; reduced → 200 ms fade. */
export function pushTransition(motion: ShellMotion, reduced: boolean): StackNavigationOptions {
  if (reduced) {
    return {
      headerShown: false,
      cardStyleInterpolator: forCrossFade,
      transitionSpec: {
        open: timing(REDUCED_CROSS_FADE_MS, linear),
        close: timing(REDUCED_CROSS_FADE_MS, linear),
      },
      gestureEnabled: false,
    };
  }
  const standard = bezier(motion.easing.standard);
  const push = motion.transition.push;
  return {
    headerShown: false,
    cardStyleInterpolator: forPush,
    cardOverlayEnabled: true,
    transitionSpec: {
      open: timing(legMs(push, 'enter', 480), standard),
      close: timing(legMs(push, 'back', 420), bezier(motion.easing.gesture)),
    },
    // Android uses the system (predictive) back gesture instead of an in-app edge swipe.
    gestureEnabled: Platform.OS === 'ios',
    gestureDirection: 'horizontal',
    gestureResponseDistance: EDGE_SWIPE_START_PT,
    gestureVelocityImpact: EDGE_SWIPE_VELOCITY_IMPACT,
  };
}

/**
 * The `(modal)` group's presentation: a transparent card over a still-rendered presenter, shown
 * instantly because `Sheet` and `RiseModal` animate themselves (detents, drag, presenter scale).
 */
export function modalGroupOptions(): StackNavigationOptions {
  return {
    headerShown: false,
    presentation: 'transparentModal',
    cardStyle: { backgroundColor: 'transparent' },
    cardOverlayEnabled: false,
    detachPreviousScreen: false,
    gestureEnabled: false,
    cardStyleInterpolator: forSelfAnimated,
    transitionSpec: { open: timing(0, linear), close: timing(0, linear) },
  };
}

/** Same-slot state swap: fade in 300, unfade 260 (reduced: 200 ms both ways). */
export function fadeTransition(motion: ShellMotion, reduced: boolean): StackNavigationOptions {
  const fade = motion.transition.fade;
  const openMs = reduced ? REDUCED_CROSS_FADE_MS : legMs(fade, 'enter', 300);
  const closeMs = reduced ? REDUCED_CROSS_FADE_MS : legMs(fade, 'back', 260);
  const easing = reduced ? linear : bezier(motion.easing.standard);
  return {
    headerShown: false,
    cardStyleInterpolator: forCrossFade,
    transitionSpec: { open: timing(openMs, easing), close: timing(closeMs, easing) },
    gestureEnabled: false,
  };
}
