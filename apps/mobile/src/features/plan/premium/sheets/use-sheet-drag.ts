/**
 * The motion of a sheet a page draws over itself: the scrim fades in while the panel rises on the
 * Smooth spring, a drag down on the grabber band follows the finger and puts the sheet away past
 * the line (carrying the flick's speed), and every way out (the drag, the scrim, the system back)
 * plays the same exit before the page unmounts it. A sheet holding edits asks first: the drag
 * springs back and the discard question decides. Reduce Motion: a 150 ms cross-fade.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { REDUCED_FADE, SPRINGS, usePremiumReducedMotion } from '@/ui/premium';
import { askToDiscard, type DiscardPrompt } from '@/ui/premium/shell';

/** How far (pt) or how fast (pt/s) a drag down goes before the sheet is put away. */
const DISMISS_PT = 110;
const DISMISS_SPEED = 900;

export interface SheetDragOptions {
  /** Runs once the exit has played: the page unmounts the sheet. */
  readonly onDismiss: () => void;
  /** Edits not yet kept: leaving asks `discard` first. */
  readonly dirty?: boolean | undefined;
  readonly discard?: DiscardPrompt | undefined;
}

/** Whether a drag that ended here puts the sheet away. */
export function dragPutsAway(translationY: number, velocityY: number): boolean {
  'worklet';
  return translationY > DISMISS_PT || velocityY > DISMISS_SPEED;
}

export function useSheetDrag({ onDismiss, dirty = false, discard }: SheetDragOptions) {
  const reduced = usePremiumReducedMotion();
  const away = useWindowDimensions().height;
  const y = useSharedValue(reduced ? 0 : away);
  const shown = useSharedValue(0);
  const guarded = useSharedValue(dirty && discard !== undefined);
  const leaving = useSharedValue(false);
  useEffect(() => {
    guarded.set(dirty && discard !== undefined);
  }, [dirty, discard, guarded]);

  useEffect(() => {
    shown.set(withTiming(1, REDUCED_FADE));
    if (!reduced) y.set(withSpring(0, SPRINGS.smooth));
    // Entrance once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exit = useCallback(
    (velocity = 0) => {
      if (leaving.get()) return;
      leaving.set(true);
      const done = (finished?: boolean) => {
        'worklet';
        if (finished === true) scheduleOnRN(onDismiss);
      };
      if (reduced) {
        shown.set(withTiming(0, REDUCED_FADE, done));
        return;
      }
      shown.set(withTiming(0, REDUCED_FADE));
      y.set(withSpring(away, { ...SPRINGS.smooth, velocity, overshootClamping: true }, done));
    },
    [y, shown, leaving, away, reduced, onDismiss],
  );

  /** Every way out goes through here: a dirty sheet asks first. */
  const requestClose = useCallback(() => {
    if (!(dirty && discard !== undefined)) {
      exit();
      return;
    }
    void askToDiscard(discard).then((drop) => {
      if (drop) exit();
    });
  }, [dirty, discard, exit]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(8)
        .failOffsetY(-8)
        .onUpdate((event) => {
          'worklet';
          y.set(Math.max(0, event.translationY));
        })
        .onEnd((event) => {
          'worklet';
          const putAway = dragPutsAway(event.translationY, event.velocityY);
          if (putAway && !guarded.get()) {
            scheduleOnRN(exit, event.velocityY);
            return;
          }
          y.set(reduced ? withTiming(0, REDUCED_FADE) : withSpring(0, SPRINGS.smooth));
          if (putAway) scheduleOnRN(requestClose);
        }),
    [y, guarded, reduced, exit, requestClose],
  );
  const panelStyle = useAnimatedStyle(() => ({
    opacity: reduced ? shown.get() : 1,
    transform: [{ translateY: y.get() }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: shown.get() }));
  return { pan, panelStyle, scrimStyle, requestClose };
}
