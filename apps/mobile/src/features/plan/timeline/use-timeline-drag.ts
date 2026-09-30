/**
 * A timeline block's gestures (3e-2): long-press lifts it (320 ms), vertical drag snaps to
 * 15-minute rows and sideways drag steps across lanes, and letting go drops it; the handles at its
 * top and bottom edges resize it in the same steps. The worklets only do the snapping maths and
 * report a new slot when it changes (not every frame); the timeline keeps the preview and the
 * reflow of the others, and commits once on drop.
 */
import { Gesture } from 'react-native-gesture-handler';
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tokens } from '@cp/design-tokens';

import { isPhysicalSpring, springConfig } from '@/motion';
import { LONG_PRESS_DURATION_MS } from '@/motion/gestures';
import { degrees } from '@/ui/theme';

import { PT_PER_MINUTE, SLOT_MINUTES } from './geometry';

const SNAPPY = isPhysicalSpring(tokens.motion.spring.snappy)
  ? springConfig(tokens.motion.spring.snappy)
  : undefined;
const LIFT_SCALE = 1.04;
const LIFT_TILT = -1.5;
const SHAKE_PT = 5;
const SHAKE_STEP_MS = tokens.motion.duration.instant / 2;

export interface TimelineDragOptions {
  readonly start: number;
  readonly end: number;
  /** Earliest start and latest end on the grid. */
  readonly min: number;
  readonly max: number;
  /** Lane index now and how many lanes the day has. */
  readonly lane: number;
  readonly lanes: number;
  /** Sideways distance that steps one lane. */
  readonly laneStep: number;
  readonly movable: boolean;
  readonly resizable: boolean;
  readonly reduced: boolean;
  readonly onLift: () => void;
  readonly onSlot: (start: number, lane: number) => void;
  readonly onDrop: (start: number, lane: number) => void;
  readonly onResize: (start: number, end: number) => void;
  readonly onResizeEnd: (start: number, end: number) => void;
  readonly onOpen: () => void;
  /** Starts lifted (the lab's still of a block mid-drag). */
  readonly lifted?: boolean;
}

export function useTimelineDrag(options: TimelineDragOptions) {
  const { start, end, min, max, lane, lanes, laneStep, reduced } = options;
  const length = end - start;
  const lifted = useSharedValue(options.lifted === true ? 1 : 0);
  const dx = useSharedValue(0);
  const shake = useSharedValue(0);
  const slot = useSharedValue(start);
  const slotLane = useSharedValue(lane);
  const edge = useSharedValue(0);
  // Captured when a gesture starts: the timeline re-renders this block at its preview slot while
  // the finger moves, and the drag must keep measuring from where it began.
  const origin = useSharedValue(start);
  const originEnd = useSharedValue(end);
  const originLane = useSharedValue(lane);

  const lift = () => options.onLift();
  const moveTo = (next: number, nextLane: number) => options.onSlot(next, nextLane);
  const drop = (next: number, nextLane: number) => options.onDrop(next, nextLane);
  const resize = (s: number, e: number) => options.onResize(s, e);
  const resizeEnd = (s: number, e: number) => options.onResizeEnd(s, e);
  const open = () => options.onOpen();

  const drag = Gesture.Pan()
    .enabled(options.movable)
    .activateAfterLongPress(LONG_PRESS_DURATION_MS)
    .onStart(() => {
      'worklet';
      origin.value = start;
      originLane.value = lane;
      slot.value = start;
      slotLane.value = lane;
      lifted.value = reduced || SNAPPY === undefined ? 1 : withSpring(1, SNAPPY);
      scheduleOnRN(lift);
    })
    .onUpdate((event) => {
      'worklet';
      const raw = origin.value + event.translationY / PT_PER_MINUTE;
      const snapped = Math.min(max - length, Math.max(min, Math.round(raw / 15) * 15));
      const shift = laneStep > 0 ? Math.round(event.translationX / laneStep) : 0;
      const nextLane = Math.min(lanes - 1, Math.max(0, originLane.value + shift));
      dx.value = event.translationX - (nextLane - originLane.value) * laneStep;
      if (snapped !== slot.value || nextLane !== slotLane.value) {
        slot.value = snapped;
        slotLane.value = nextLane;
        scheduleOnRN(moveTo, snapped, nextLane);
      }
    })
    .onEnd(() => {
      'worklet';
      scheduleOnRN(drop, slot.value, slotLane.value);
    })
    .onFinalize(() => {
      'worklet';
      lifted.value = reduced || SNAPPY === undefined ? 0 : withSpring(0, SNAPPY);
      dx.value = reduced || SNAPPY === undefined ? 0 : withSpring(0, SNAPPY);
    });

  const tap = Gesture.Tap().onEnd(() => {
    'worklet';
    scheduleOnRN(open);
  });

  const handle = (which: 'top' | 'bottom') =>
    Gesture.Pan()
      .enabled(options.resizable)
      .onStart(() => {
        'worklet';
        origin.value = start;
        originEnd.value = end;
        edge.value = which === 'top' ? start : end;
      })
      .onUpdate((event) => {
        'worklet';
        const from = which === 'top' ? origin.value : originEnd.value;
        const snapped = Math.round((from + event.translationY / PT_PER_MINUTE) / 15) * 15;
        const next =
          which === 'top'
            ? Math.min(originEnd.value - SLOT_MINUTES, Math.max(min, snapped))
            : Math.max(origin.value + SLOT_MINUTES, Math.min(max, snapped));
        if (next !== edge.value) {
          edge.value = next;
          if (which === 'top') scheduleOnRN(resize, next, originEnd.value);
          else scheduleOnRN(resize, origin.value, next);
        }
      })
      .onEnd(() => {
        'worklet';
        if (which === 'top') scheduleOnRN(resizeEnd, edge.value, originEnd.value);
        else scheduleOnRN(resizeEnd, origin.value, edge.value);
      });

  const liftStyle = useAnimatedStyle(() => ({
    zIndex: lifted.value > 0 ? 10 : 1,
    shadowOpacity: lifted.value * 0.4,
    transform: [
      { translateX: dx.value + shake.value },
      { scale: 1 + (LIFT_SCALE - 1) * lifted.value },
      { rotate: degrees(LIFT_TILT * lifted.value) },
    ],
  }));

  /** A refused drop: one shake (skipped under reduced motion; the haptic still plays). */
  function rejectShake(): void {
    if (reduced) return;
    shake.value = withSequence(
      withTiming(SHAKE_PT, { duration: SHAKE_STEP_MS }),
      withTiming(-SHAKE_PT, { duration: SHAKE_STEP_MS }),
      withTiming(SHAKE_PT / 2, { duration: SHAKE_STEP_MS }),
      withTiming(0, { duration: SHAKE_STEP_MS }),
    );
  }

  return {
    drag,
    tap,
    topHandle: handle('top'),
    bottomHandle: handle('bottom'),
    liftStyle,
    rejectShake,
  };
}
