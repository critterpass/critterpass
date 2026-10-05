/**
 * The engine of `MapSheet`: a non-modal sheet over a live map that rests at peek, half or full.
 * Only drags that start on the sheet move it, so the map above stays pannable. Below full the
 * whole sheet drags; at full the content scrolls and a drag hands back to the sheet from the grab
 * zone or once the content is scrolled to its top. Android back collapses one snap before the
 * screen is left; reduced motion swaps the slide for a short fade.
 */
import { NavigationContext } from 'expo-router/react-navigation';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '@/motion/easing';
import { dragDismiss } from '@/motion/gestures/drag-dismiss';
import { useReducedImpactMotion } from '@/motion/patterns/shared';

import { MAP_SHEET_SNAPS, resolveSnap, type MapSheetSnap } from './map-sheet-snap';
import { REDUCED_FADE_MS } from './use-modal-presentation';

const standard = bezierEasing(tokens.motion.easing.standard);
const settleEasing = bezierEasing(tokens.motion.easing.gesture);
/** A snap someone asked for (a chip, a button) moves like a sheet; a release settles faster. */
const ASKED_MS = tokens.motion.transition.sheet.back?.durationMs ?? 420;
const SETTLE_MS = tokens.motion.duration.base;
const FULL = 2;

export interface MapSheetOptions {
  /** Visible heights of peek, half and full, ascending (`mapSheetHeights`). */
  readonly heights: readonly [number, number, number];
  readonly initialSnap?: MapSheetSnap | undefined;
  readonly onSnapChange?: ((snap: MapSheetSnap) => void) | undefined;
  /** Prefix for the drag gesture's test id (`<testID>-drag`). */
  readonly testID: string;
  /** Android back on a raised sheet: one snap down per press (`step`), or straight to peek. */
  readonly backCollapses?: 'step' | 'rest' | undefined;
}

export interface MapSheetController {
  readonly snap: MapSheetSnap;
  readonly snapTo: (snap: MapSheetSnap) => void;
}

function snapAt(index: number): MapSheetSnap {
  return MAP_SHEET_SNAPS[Math.min(Math.max(index, 0), FULL)] ?? 'peek';
}

export function useMapSheet({
  heights,
  initialSnap = 'peek',
  onSnapChange,
  testID,
  backCollapses = 'step',
}: MapSheetOptions) {
  const reduced = useReducedImpactMotion();
  const navigation = useContext(NavigationContext);
  const [index, setIndex] = useState(() => MAP_SHEET_SNAPS.indexOf(initialSnap));
  const [peekHeight, halfHeight, fullHeight] = heights;
  const visible = useSharedValue(heights[index] ?? peekHeight);
  const fade = useSharedValue(1);
  const atIndex = useSharedValue(index);
  const scrollY = useSharedValue(0);
  const startVisible = useSharedValue(0);
  const dragging = useSharedValue(false);
  const inGrabZone = useSharedValue(false);
  const onSnapChangeRef = useRef(onSnapChange);
  const heightsRef = useRef(heights);
  useEffect(() => {
    onSnapChangeRef.current = onSnapChange;
    heightsRef.current = [peekHeight, halfHeight, fullHeight];
  }, [onSnapChange, peekHeight, halfHeight, fullHeight]);

  /* eslint-disable react-hooks/immutability, react-hooks/refs -- Reanimated shared values' `.value`
     setters (not React state) and the refs are only touched from effects, gesture callbacks and
     press handlers, never during render; the compiler can't see through the gesture builder. */
  const animateTo = useCallback(
    (next: number, settling: boolean) => {
      const target = heightsRef.current[next] ?? heightsRef.current[0];
      if (reduced) {
        const half = REDUCED_FADE_MS / 2;
        // Out, move while unseen, back in.
        fade.value = withTiming(0, { duration: half }, () => {
          'worklet';
          visible.value = target;
          fade.value = withTiming(1, { duration: half });
        });
        return;
      }
      visible.value = withTiming(target, {
        duration: settling ? SETTLE_MS : ASKED_MS,
        easing: settling ? settleEasing : standard,
      });
    },
    [fade, reduced, visible],
  );

  const settle = useCallback(
    (next: number, settling: boolean) => {
      const clamped = Math.min(Math.max(next, 0), FULL);
      const changed = atIndex.value !== clamped;
      atIndex.value = clamped;
      animateTo(clamped, settling);
      setIndex(clamped);
      if (changed) onSnapChangeRef.current?.(snapAt(clamped));
    },
    [animateTo, atIndex],
  );

  const snapTo = useCallback(
    (snap: MapSheetSnap) => settle(MAP_SHEET_SNAPS.indexOf(snap), false),
    [settle],
  );

  // New heights (content measured, the screen rotated): rest at the same snap, no animation.
  useEffect(() => {
    if (!dragging.value) visible.value = [peekHeight, halfHeight, fullHeight][atIndex.value] ?? 0;
  }, [atIndex, dragging, peekHeight, halfHeight, fullHeight, visible]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      // A page pushed over this screen owns Android back.
      if (navigation !== undefined && !navigation.isFocused()) return false;
      if (atIndex.value <= 0) return false;
      settle(backCollapses === 'rest' ? 0 : atIndex.value - 1, false);
      return true;
    });
    return () => subscription.remove();
  }, [atIndex, navigation, settle, backCollapses]);

  const grabZone = dragDismiss.grabZonePt.sheet;
  const lowest = peekHeight;
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
      startVisible.value = visible.value;
    })
    .onUpdate((event) => {
      'worklet';
      const contentOwns = atIndex.value === FULL && !inGrabZone.value;
      if (contentOwns && !(scrollY.value <= 0 && event.translationY > 0)) return;
      if (!dragging.value) {
        dragging.value = true;
        // A hand-off from scrolled content starts mid-gesture: measure from where it reached the top.
        if (contentOwns) startVisible.value = visible.value + event.translationY;
      }
      visible.value = Math.min(
        fullHeight,
        Math.max(lowest, startVisible.value - event.translationY),
      );
    })
    .onEnd((event) => {
      'worklet';
      if (!dragging.value) return;
      dragging.value = false;
      const next = resolveSnap(visible.value, event.velocityY / 1000, heights);
      scheduleOnRN(settle, next, true);
    });
  /* eslint-enable react-hooks/immutability, react-hooks/refs */

  const panelStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: fullHeight - visible.value }],
  }));

  return {
    snap: snapAt(index),
    index,
    fullHeight,
    snapTo,
    pan,
    scroll,
    scrollY,
    panelStyle,
  };
}
