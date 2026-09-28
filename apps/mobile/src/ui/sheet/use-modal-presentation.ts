import { useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, Platform } from 'react-native';
import type { KeyboardEvent } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '@/motion/easing';
import { dragDismiss } from '@/motion/gestures/drag-dismiss';
import { useReducedImpactMotion } from '@/motion/patterns/shared';

import { presenterClosed, presenterFollow, presenterOpened } from './presenter';

export type ModalVariant = 'sheet' | 'rise';

/** docs/design-system.md §5: reduced motion swaps every spatial transition for this fade. */
export const REDUCED_FADE_MS = 200;
// §3.3 `rise`: "ty 100% -> 0, delay 120"; the token carries duration and easing, not the delay.
export const RISE_DELAY_MS = 120;

const standard = bezierEasing(tokens.motion.easing.standard);
const { transition } = tokens.motion;

export const ENTER_MS: Readonly<Record<ModalVariant, number>> = {
  sheet: transition.sheet.enter?.durationMs ?? 540,
  rise: transition.rise.enter?.durationMs ?? 620,
};
export const DISMISS_MS: Readonly<Record<ModalVariant, number>> = {
  sheet: transition.sheet.back?.durationMs ?? 420,
  rise: transition.rise.back?.durationMs ?? 420,
};

export type Release =
  { readonly kind: 'dismiss' } | { readonly kind: 'snap'; readonly index: number };

/**
 * Where a released drag settles. `heights` ascend (lowest detent first); `dy`/`velocity` are
 * positive downwards (pt, pt/ms). Down past the drag-dismiss commit drops one detent, or dismisses
 * from the lowest; the same commit upwards raises one detent; anything less springs back.
 */
export function resolveRelease(
  detentCount: number,
  index: number,
  dy: number,
  velocity: number,
): Release {
  if (dragDismiss.commits(dy, velocity)) {
    return index <= 0 ? { kind: 'dismiss' } : { kind: 'snap', index: index - 1 };
  }
  if (dragDismiss.commits(-dy, -velocity) && index < detentCount - 1) {
    return { kind: 'snap', index: index + 1 };
  }
  return { kind: 'snap', index };
}

export interface ModalPresentationOptions {
  readonly variant: ModalVariant;
  /** Visible panel heights per detent, ascending; a rise has one (the full screen). */
  readonly heights: readonly number[];
  readonly initialIndex: number;
  readonly onDismissed: () => void;
  /** Prefix for the drag gesture's test id (`<testID>-drag`). */
  readonly testID: string;
}

/**
 * Shared engine of `Sheet` and `RiseModal`: entrance, detent snapping, drag-dismiss within the
 * grab zone (with nested-scroll hand-off), presenter scale, scrim, keyboard inset, Android back.
 */
export function useModalPresentation({
  variant,
  heights,
  initialIndex,
  onDismissed,
  testID,
}: ModalPresentationOptions) {
  const reduced = useReducedImpactMotion();
  const maxHeight = heights[heights.length - 1] ?? 0;
  const restFor = (index: number) => maxHeight - (heights[index] ?? maxHeight);
  const [index, setIndex] = useState(initialIndex);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const dismissing = useRef(false);

  const ty = useSharedValue(reduced ? restFor(initialIndex) : maxHeight);
  const presence = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const startTy = useSharedValue(0);
  const dragging = useSharedValue(false);
  const inGrabZone = useSharedValue(false);

  useEffect(() => {
    const enterMs = reduced ? REDUCED_FADE_MS : ENTER_MS[variant];
    const delay = reduced || variant === 'sheet' ? 0 : RISE_DELAY_MS;
    presenterOpened(enterMs, reduced);
    presence.value = withDelay(delay, withTiming(1, { duration: enterMs, easing: standard }));
    if (!reduced) {
      ty.value = withDelay(
        delay,
        withTiming(restFor(initialIndex), { duration: enterMs, easing: standard }),
      );
    }
    // A modal unmounted without being dismissed (its screen left the stack, or a route stopped
    // rendering it) releases the presenter, or every screen root would stay scaled behind nothing.
    return () => {
      if (!dismissing.current) presenterClosed(reduced ? REDUCED_FADE_MS : DISMISS_MS[variant]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the entrance runs once per presentation
  }, []);

  const finish = () => onDismissed();

  /* eslint-disable react-hooks/immutability, react-hooks/refs -- Reanimated shared values' `.value`
     setters (not React state) and the dismiss guard ref are only touched from effects, gesture
     callbacks and press handlers, never during render; the compiler can't see through the gesture
     builder and flags them (same false positive the motion patterns document). */
  const dismiss = () => {
    if (dismissing.current) return;
    dismissing.current = true;
    const outMs = reduced ? REDUCED_FADE_MS : DISMISS_MS[variant];
    presenterClosed(outMs);
    const onDone = (finished?: boolean) => {
      'worklet';
      if (finished) scheduleOnRN(finish);
    };
    if (reduced) {
      presence.value = withTiming(0, { duration: outMs }, onDone);
      return;
    }
    presence.value = withTiming(0, { duration: outMs, easing: standard });
    ty.value = withTiming(maxHeight, { duration: outMs, easing: standard }, onDone);
  };

  const snapTo = (next: number) => {
    setIndex(next);
    presence.value = withTiming(1, { duration: DISMISS_MS[variant], easing: standard });
    presenterFollow(1);
    ty.value = withTiming(restFor(next), { duration: DISMISS_MS[variant], easing: standard });
  };

  const settle = (dy: number, velocity: number) => {
    const release = resolveRelease(heights.length, index, dy, velocity);
    if (release.kind === 'dismiss') dismiss();
    else snapTo(release.index);
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      dismiss();
      return true;
    });
    return () => subscription.remove();
  });

  useEffect(() => {
    const onShow = (event: KeyboardEvent) => setKeyboardInset(event.endCoordinates.height);
    const onHide = () => setKeyboardInset(0);
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      onShow,
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      onHide,
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const grabZone = dragDismiss.grabZonePt[variant];
  const lowestRest = restFor(0);
  const lowestHeight = heights[0] ?? maxHeight;
  const currentRest = restFor(index);
  const topRest = restFor(heights.length - 1);
  const scroll = Gesture.Native();
  const pan = Gesture.Pan()
    // eslint-disable-next-line lingui/no-unlocalized-strings -- gesture test id, never rendered
    .withTestId(`${testID}-drag`)
    .activeOffsetY([-8, 8])
    .failOffsetX([-20, 20])
    .simultaneousWithExternalGesture(scroll)
    .onBegin((event) => {
      'worklet';
      inGrabZone.value = event.y <= grabZone;
      dragging.value = false;
      startTy.value = ty.value;
    })
    .onUpdate((event) => {
      'worklet';
      const handOff = scrollY.value <= 0 && event.translationY > 0;
      if (!inGrabZone.value && !handOff) return;
      if (!dragging.value) {
        dragging.value = true;
        // Content hand-off starts mid-gesture: measure from where the scroll reached the top.
        if (!inGrabZone.value) startTy.value = ty.value - event.translationY;
      }
      ty.value = Math.max(topRest, startTy.value + event.translationY);
      const below = Math.max(0, ty.value - lowestRest);
      const progress = 1 - Math.min(1, below / lowestHeight);
      presence.value = progress;
      presenterFollow(progress);
    })
    .onEnd((event) => {
      'worklet';
      if (!dragging.value) return;
      dragging.value = false;
      scheduleOnRN(settle, ty.value - currentRest, event.velocityY / 1000);
    });

  /* eslint-enable react-hooks/immutability, react-hooks/refs */

  const panelStyle = useAnimatedStyle(() =>
    reduced
      ? { opacity: presence.value, transform: [{ translateY: ty.value }] }
      : { transform: [{ translateY: ty.value }] },
  );
  const scrimOpacity = tokens.color.scrim.alphaMin;
  const scrimStyle = useAnimatedStyle(() => ({ opacity: presence.value * scrimOpacity }));

  return { index, maxHeight, keyboardInset, pan, scroll, scrollY, panelStyle, scrimStyle, dismiss };
}
