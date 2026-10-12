/**
 * The `+` → sheet morph (foundations-spec §7, 1.06) for the ink `+` in a native iOS toolbar. The
 * `+` is a system bar button (VoiceOver and UI tests reach it by its label), and UIKit has no morph
 * from a bar button into a form sheet, so the shell draws it: a sheet-glass shape grows from the
 * button's slot (the bar's trailing item) to the half sheet's frame while the page dims, then the
 * sheet route opens under it and the shape gives way to the real sheet. When the sheet goes
 * (Cancel, a swipe down, its verb) and the screen is back in focus, the shape folds back into the
 * `+`. All on Smooth; Reduce Motion cross-fades the shape in place instead.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import {
  GlassSurface,
  Icon,
  REDUCED_FADE_MS,
  SPRINGS,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '../..';
import { useShellExtras } from '../shell-theme';
import type { MorphRect } from './plus-sheet-morph';

/** iOS 26 bar metrics: a 44 pt item, its trailing edge 16 pt in, its top at the safe area. */
const BAR_ITEM = 44;
const BAR_TRAILING = 16;
/** The half sheet the `+` opens: its top at half the window, 8 pt in from the sides and bottom. */
const SHEET_INSET = 8;
const PLUS_TURN = 45;
const PLUS_GROW = 1.2;
/** How long the shape stays over the opening sheet before it fades (the sheet's own rise). */
const HANDOVER_MS = 380;
const FADE_MS = 150;

type MorphDirection = 'open' | 'close';

/** The trailing toolbar slot in the window: where the ink `+` sits on a native root screen. */
export function useTrailingBarSlot(): MorphRect {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return { x: width - BAR_TRAILING - BAR_ITEM, y: insets.top, width: BAR_ITEM, height: BAR_ITEM };
}

/**
 * Runs the morph, then `open` (the action that presents the sheet route), and folds the shape back
 * into the `+` when the screen regains focus after that sheet. Returns the trigger for the toolbar
 * button and the overlay to render over the screen.
 */
export function useToolbarPlusMorph(open: () => void): {
  readonly start: () => void;
  readonly overlay: ReactNode;
} {
  const [direction, setDirection] = useState<MorphDirection | null>(null);
  // The sheet this screen opened is up: its return plays the fold back.
  const sheetUp = useRef(false);
  const start = useCallback(() => setDirection('open'), []);
  const landed = useCallback(() => {
    sheetUp.current = true;
    open();
  }, [open]);
  const done = useCallback(() => setDirection(null), []);
  useFocusEffect(
    useCallback(() => {
      if (!sheetUp.current) return;
      sheetUp.current = false;
      setDirection('close');
    }, []),
  );
  return {
    start,
    overlay:
      direction === null ? null : (
        <ToolbarPlusMorph key={direction} direction={direction} onLanded={landed} onDone={done} />
      ),
  };
}

function ToolbarPlusMorph({
  direction,
  onLanded,
  onDone,
}: {
  readonly direction: MorphDirection;
  readonly onLanded: () => void;
  readonly onDone: () => void;
}) {
  const t = usePremiumTheme();
  const extras = useShellExtras();
  const reduced = usePremiumReducedMotion();
  const { width, height } = useWindowDimensions();
  const from = useTrailingBarSlot();
  const to = {
    x: SHEET_INSET,
    y: height / 2,
    width: width - SHEET_INSET * 2,
    height: height / 2 - SHEET_INSET,
  };
  const opening = direction === 'open';
  // Reduce Motion keeps the shape on the sheet's frame and only fades it.
  const progress = useSharedValue(opening && !reduced ? 0 : 1);
  const shown = useSharedValue(opening && reduced ? 0 : 1);

  useEffect(() => {
    const handOver = () => {
      'worklet';
      scheduleOnRN(onLanded);
      shown.set(
        withDelay(
          HANDOVER_MS,
          withTiming(0, { duration: FADE_MS }, (faded) => {
            'worklet';
            if (faded) scheduleOnRN(onDone);
          }),
        ),
      );
    };
    const finish = (finished?: boolean) => {
      'worklet';
      if (finished) scheduleOnRN(onDone);
    };
    if (opening && reduced) {
      shown.set(
        withTiming(1, { duration: REDUCED_FADE_MS }, (finished) => {
          'worklet';
          if (finished) handOver();
        }),
      );
    } else if (opening) {
      progress.set(
        withSpring(1, SPRINGS.smooth, (finished) => {
          'worklet';
          if (finished) handOver();
        }),
      );
    } else if (reduced) {
      shown.set(withTiming(0, { duration: REDUCED_FADE_MS }, finish));
    } else {
      progress.set(withSpring(0, SPRINGS.smooth, finish));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one run per mount
  }, []);

  const dimStyle = useAnimatedStyle(() => ({
    opacity: progress.value * shown.value,
  }));
  const shapeStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      left: interpolate(p, [0, 1], [from.x, to.x]),
      top: interpolate(p, [0, 1], [from.y, to.y]),
      width: interpolate(p, [0, 1], [from.width, to.width]),
      height: interpolate(p, [0, 1], [from.height, to.height]),
      borderRadius: interpolate(p, [0, 1], [from.height / 2, t.radius.sheet]),
      opacity: shown.value * interpolate(p, [0, 0.15], [0, 1], Extrapolation.CLAMP),
    };
  });
  const plusStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: reduced ? 0 : interpolate(p, [0, 0.3], [1, 0], Extrapolation.CLAMP),
      transform: [
        { rotate: `${interpolate(p, [0, 0.3], [0, PLUS_TURN], Extrapolation.CLAMP)}deg` },
        { scale: interpolate(p, [0, 0.3], [1, PLUS_GROW], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="toolbar-plus-morph">
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: extras.scrim }, dimStyle]}
      />
      <Animated.View style={[styles.shape, shapeStyle]}>
        <GlassSurface kind="sheet" style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View
        style={[
          styles.plus,
          {
            left: from.x,
            top: from.y,
            width: from.width,
            height: from.height,
            borderRadius: from.height / 2,
            backgroundColor: t.color.inkFillBottom,
          },
          plusStyle,
        ]}
      >
        <Icon name="plus" color={t.color.onInk} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  shape: { position: 'absolute', overflow: 'hidden' },
  plus: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
