/**
 * The motion of the chat's drawn sheets: the scrim fades in while the panel rises on the Smooth
 * spring, a drag down on the grabber band follows the finger and puts the sheet away past the line
 * (carrying the flick's speed), and every way out (the drag, the scrim, the system back) plays the
 * same exit before the chat unmounts it. Reduce Motion: a 150 ms cross-fade. The plan's overlay
 * sheet has the same motion plus the discard question; chat sheets hold no edits.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { REDUCED_FADE, SPRINGS, usePremiumReducedMotion } from '@/ui/premium';

/** How far (pt) or how fast (pt/s) a drag down goes before the sheet is put away. */
const DISMISS_PT = 110;
const DISMISS_SPEED = 900;

function dragPutsAway(translationY: number, velocityY: number): boolean {
  'worklet';
  return translationY > DISMISS_PT || velocityY > DISMISS_SPEED;
}

export function useChatSheetDrag(onDismiss: () => void) {
  const reduced = usePremiumReducedMotion();
  const away = useWindowDimensions().height;
  const y = useSharedValue(reduced ? 0 : away);
  const shown = useSharedValue(0);
  const leaving = useSharedValue(false);

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
          if (dragPutsAway(event.translationY, event.velocityY)) {
            scheduleOnRN(exit, event.velocityY);
            return;
          }
          y.set(reduced ? withTiming(0, REDUCED_FADE) : withSpring(0, SPRINGS.smooth));
        }),
    [y, reduced, exit],
  );
  const panelStyle = useAnimatedStyle(() => ({
    opacity: reduced ? shown.get() : 1,
    transform: [{ translateY: y.get() }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const close = useCallback(() => exit(), [exit]);
  return { pan, panelStyle, scrimStyle, close };
}
