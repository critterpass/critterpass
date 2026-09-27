import { Gesture } from 'react-native-gesture-handler';
import { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { impact } from '../feedback';
import type { GestureHookResult } from './shared';

/** docs/design-system.md §3.4 `snap` cue: "15-min snaps". */
export const SNAP_MINUTES = 15;

export function snapMinutes(minutes: number, snapToMinutes: number = SNAP_MINUTES): number {
  return Math.round(minutes / snapToMinutes) * snapToMinutes;
}

export interface UseDragSnapOptions {
  readonly initialMinutes: number;
  /** The timeline's vertical scale: points of drag per minute of schedule time. */
  readonly pointsPerMinute: number;
  readonly minMinutes?: number;
  readonly maxMinutes?: number;
  readonly onChange?: (minutes: number) => void;
  readonly disabled?: boolean;
  readonly accessibilityLabel: string;
}

export interface DragSnapAnimatedStyle {
  readonly transform: { translateY: number }[];
}

/** A drag handle that snaps to 15-minute increments (docs/design-system.md §3.4), e.g. a trip-day block. */
export function useDragSnap({
  initialMinutes,
  pointsPerMinute,
  minMinutes = 0,
  maxMinutes = 24 * 60,
  onChange,
  disabled = false,
  accessibilityLabel,
}: UseDragSnapOptions): GestureHookResult {
  const minutes = useSharedValue(snapMinutes(initialMinutes));
  const dragStartMinutes = useSharedValue(minutes.value);

  const fireSnapCue = () => impact('snap');
  const fireOnChange = (next: number) => onChange?.(next);

  const gesture = Gesture.Pan()
    .enabled(!disabled)
    .onBegin(() => {
      'worklet';
      dragStartMinutes.value = minutes.value;
    })
    .onUpdate((event) => {
      'worklet';
      const raw = dragStartMinutes.value + event.translationY / pointsPerMinute;
      const clamped = Math.min(maxMinutes, Math.max(minMinutes, raw));
      const snapped = snapMinutes(clamped);
      if (snapped !== minutes.value) {
        minutes.value = snapped;
        scheduleOnRN(fireSnapCue);
        scheduleOnRN(fireOnChange, snapped);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (minutes.value - initialMinutes) * pointsPerMinute }],
  }));

  function step(direction: 1 | -1) {
    const next = Math.min(
      maxMinutes,
      Math.max(minMinutes, minutes.value + direction * SNAP_MINUTES),
    );
    minutes.value = next;
    onChange?.(next);
  }

  return {
    gesture,
    animatedStyle,
    // design-system.md §5 "timeline → time stepper": the non-gesture alternative moves by one snap increment.
    accessibilityActions: [
      { name: 'increment', label: accessibilityLabel },
      { name: 'decrement', label: accessibilityLabel },
    ],
    onAccessibilityAction: (event) => {
      if (event.nativeEvent.actionName === 'increment') step(1);
      if (event.nativeEvent.actionName === 'decrement') step(-1);
    },
  };
}
