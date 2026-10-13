/**
 * The frame of the save sheet a page lays over itself: the dim page, the glass sheet and its
 * grabber. It rises on the Smooth spring once mounted (driven from an effect, so it plays even
 * while the page itself is still arriving), follows a drag down and leaves on the same spring
 * before the page moves on; Reduce Motion fades it both ways. A drag past a third of the sheet, or
 * a flick, dismisses it; a short one springs back.
 */
import { useCallback, useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import {
  GlassSurface,
  REDUCED_FADE_MS,
  SPRINGS,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import { SHEET_SCRIM } from '../components/onboarding-colours';

/** A drag this far down (in points), or a flick this fast, dismisses the sheet. */
const DISMISS_DRAG = 120;
const DISMISS_VELOCITY = 800;

export interface DrawnSheetProps {
  /** The dim page, a drag down and Android back; none while the sheet is busy. */
  readonly onDismiss?: (() => void) | undefined;
  /** The dismiss takes the sheet away (the page moves on), so it slides out first. */
  readonly dismissLeaves: boolean;
  readonly scrimLabel: string;
  readonly testID: string;
  /** `leave` slides the sheet out, then runs the action (Not now). */
  readonly children: (leave: (then: () => void) => void) => ReactNode;
}

export function DrawnSheet({
  onDismiss,
  dismissLeaves,
  scrimLabel,
  testID,
  children,
}: DrawnSheetProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const reduced = usePremiumReducedMotion();
  const shown = useSharedValue(0);
  const drag = useSharedValue(0);
  const height = useSharedValue(640);
  const leaving = useSharedValue(false);

  useEffect(() => {
    shown.set(
      reduced ? withTiming(1, { duration: REDUCED_FADE_MS }) : withSpring(1, SPRINGS.smooth),
    );
    // The sheet rises once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leave = useCallback(
    (then: () => void) => {
      if (leaving.get()) return;
      leaving.set(true);
      const done = (finished?: boolean) => {
        'worklet';
        if (finished === true) scheduleOnRN(then);
      };
      shown.set(
        reduced
          ? withTiming(0, { duration: REDUCED_FADE_MS }, done)
          : withSpring(0, SPRINGS.smooth, done),
      );
    },
    [leaving, reduced, shown],
  );

  const dismiss = useCallback(() => {
    if (onDismiss === undefined) return;
    if (dismissLeaves) leave(onDismiss);
    else {
      drag.set(withSpring(0, SPRINGS.smooth));
      onDismiss();
    }
  }, [dismissLeaves, drag, leave, onDismiss]);

  const pan = Gesture.Pan()
    .enabled(onDismiss !== undefined)
    .activeOffsetY(8)
    .onUpdate((e) => {
      drag.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (
        e.translationY > Math.min(DISMISS_DRAG, height.get() / 3) ||
        e.velocityY > DISMISS_VELOCITY
      )
        scheduleOnRN(dismiss);
      else drag.set(withSpring(0, SPRINGS.smooth));
    });

  const scrimStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, shown.get()) }));
  const sheetStyle = useAnimatedStyle(() =>
    reduced
      ? { opacity: shown.get(), transform: [{ translateY: drag.get() }] }
      : { transform: [{ translateY: (1 - shown.get()) * (height.get() + 24) + drag.get() }] },
  );
  const onLayout = (e: LayoutChangeEvent) => height.set(e.nativeEvent.layout.height);

  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: SHEET_SCRIM }]}
          onPress={onDismiss === undefined ? undefined : dismiss}
          accessibilityRole="button"
          accessibilityLabel={scrimLabel}
          testID="save-sheet-scrim"
        />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.sheet, sheetStyle]} onLayout={onLayout}>
          <GlassSurface
            kind="sheet"
            style={{
              borderRadius: theme.radius.sheet,
              paddingHorizontal: 18,
              paddingTop: 12,
              paddingBottom: Math.max(insets.bottom, 22),
            }}
            testID={testID}
          >
            <View
              style={[styles.grabber, { backgroundColor: theme.color.outlineEmpty }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
            {children(leave)}
          </GlassSurface>
        </Animated.View>
      </GestureDetector>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 8, right: 8, bottom: 8 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginBottom: 14 },
});
