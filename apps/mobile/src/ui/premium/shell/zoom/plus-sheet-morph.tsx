/**
 * The `+` → sheet morph drawn by the app (foundations-spec §7, 1.06), for where the system can't
 * morph a native sheet out of the button (Android, and iOS if the native spike fails): the ink `+`
 * turns 45° and grows as it fades, a sheet-glass shape grows from the button's frame to the sheet
 * (inset 8, radius 46), the page behind steps back (scale .92, down 14, dimmed, rounded 40), and
 * the sheet's content rises 16 → 0 once the shape lands. All on Smooth; Reduce Motion fades.
 * Dismissing (the grabber drag, the sheet's own close) plays it back into the `+`.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { BackHandler, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
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

export interface MorphRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PlusSheetMorphProps {
  /** The sheet is up. */
  readonly open: boolean;
  /** The `+` button's frame in the window, measured when it was pressed. */
  readonly anchor: MorphRect | null;
  /** The person asked to close it (dragged the grabber down, pressed back): set `open` false. */
  readonly onRequestClose: () => void;
  /** The sheet's content (its header row included). */
  readonly sheet: ReactNode;
  /** The page that steps back. */
  readonly children: ReactNode;
}

/** 1.06: the sheet's top on the 844 pt frame, as a share of the window. */
const SHEET_TOP_SHARE = 330 / 844;
const SHEET_INSET = 8;
const PAGE_SCALE = 0.92;
const PAGE_DROP = 14;
const PAGE_RADIUS = 40;
const PAGE_DIM = 0.2;
const CONTENT_RISE = 16;
const PLUS_TURN = 45;
const PLUS_GROW = 1.2;
const DRAG_TO_CLOSE = 80;

export function PlusSheetMorph({
  open,
  anchor,
  onRequestClose,
  sheet,
  children,
}: PlusSheetMorphProps) {
  const t = usePremiumTheme();
  const extras = useShellExtras();
  const reduced = usePremiumReducedMotion();
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  // The overlay stays mounted until the sheet has folded back into the `+`.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  const from = anchor ?? { x: width - 84, y: height - 100, width: 60, height: 60 };
  const to = {
    x: SHEET_INSET,
    y: height * SHEET_TOP_SHARE,
    width: width - SHEET_INSET * 2,
    height: height - height * SHEET_TOP_SHARE - SHEET_INSET,
  };

  useEffect(() => {
    const target = open ? 1 : 0;
    if (open) drag.set(0);
    const unmount = () => setMounted(false);
    const settle = (finished?: boolean) => {
      'worklet';
      if (finished && target === 0) scheduleOnRN(unmount);
    };
    progress.set(
      reduced
        ? withTiming(target, { duration: REDUCED_FADE_MS }, settle)
        : withSpring(target, SPRINGS.smooth, settle),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one animation per open/close
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onRequestClose();
      return true;
    });
    return () => subscription.remove();
  }, [open, onRequestClose]);

  const pageStyle = useAnimatedStyle(() => {
    const p = reduced ? 0 : progress.value;
    return {
      transform: [
        { translateY: interpolate(p, [0, 1], [0, PAGE_DROP]) },
        { scale: interpolate(p, [0, 1], [1, PAGE_SCALE]) },
      ],
      borderRadius: interpolate(p, [0, 1], [0, PAGE_RADIUS]),
    };
  });
  const dimStyle = useAnimatedStyle(() => ({ opacity: progress.value * PAGE_DIM }));
  const shapeStyle = useAnimatedStyle(() => {
    const p = reduced ? 1 : progress.value;
    return {
      left: interpolate(p, [0, 1], [from.x, to.x]),
      top: interpolate(p, [0, 1], [from.y, to.y]) + drag.value,
      width: interpolate(p, [0, 1], [from.width, to.width]),
      height: interpolate(p, [0, 1], [from.height, to.height]),
      borderRadius: interpolate(p, [0, 1], [from.height / 2, t.radius.sheet]),
      opacity: reduced ? progress.value : p > 0.001 ? 1 : 0,
    };
  });
  const plusStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: interpolate(p, [0, 0.3], [1, 0], Extrapolation.CLAMP),
      transform: [
        { rotate: `${interpolate(p, [0, 0.3], [0, PLUS_TURN], Extrapolation.CLAMP)}deg` },
        { scale: interpolate(p, [0, 0.3], [1, PLUS_GROW], Extrapolation.CLAMP) },
      ],
    };
  });
  const contentStyle = useAnimatedStyle(() => {
    const landed = interpolate(progress.value, [0.7, 1], [0, 1], Extrapolation.CLAMP);
    return { opacity: landed, transform: [{ translateY: (1 - landed) * CONTENT_RISE }] };
  });

  const dragDown = Gesture.Pan()
    .onUpdate((event) => {
      drag.set(Math.max(0, event.translationY));
    })
    .onEnd((event) => {
      if (event.translationY > DRAG_TO_CLOSE) scheduleOnRN(onRequestClose);
      else drag.set(withSpring(0, SPRINGS.smooth));
    });

  return (
    <View style={[styles.root, { backgroundColor: t.color.inkFillBottom }]}>
      <Animated.View style={[styles.page, { backgroundColor: t.color.ground }, pageStyle]}>
        {children}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: extras.scrim }, dimStyle]}
        />
      </Animated.View>
      {mounted ? (
        <>
          <Animated.View
            pointerEvents="none"
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
          <Animated.View style={[styles.shape, shapeStyle]}>
            <GlassSurface kind="sheet" style={StyleSheet.absoluteFill} />
            <GestureDetector gesture={dragDown}>
              <View style={styles.grabberArea}>
                <View style={[styles.grabber, { backgroundColor: t.color.placeholder }]} />
              </View>
            </GestureDetector>
            <Animated.View style={[styles.content, contentStyle]}>{sheet}</Animated.View>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: { flex: 1, overflow: 'hidden', transformOrigin: 'top' },
  plus: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  shape: { position: 'absolute', overflow: 'hidden' },
  grabberArea: { height: 26, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 36, height: 5, borderRadius: 3 },
  content: { flex: 1, paddingHorizontal: 20 },
});
