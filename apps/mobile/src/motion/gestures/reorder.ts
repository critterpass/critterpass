import { Gesture } from 'react-native-gesture-handler';
import { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tokens } from '@cp/design-tokens';

import { isPhysicalSpring, springConfig } from '../easing';
import { REDUCED_IMPACT_FADE_MS, useReducedImpactMotion } from '../patterns/shared';
import type { GestureHookResult } from './shared';

const snappySpring = isPhysicalSpring(tokens.motion.spring.snappy)
  ? springConfig(tokens.motion.spring.snappy)
  : undefined;

export interface UseReorderOptions {
  readonly index: number;
  readonly itemCount: number;
  readonly itemHeightPt: number;
  readonly onReorder: (fromIndex: number, toIndex: number) => void;
  readonly disabled?: boolean;
  readonly accessibilityLabel: string;
}

export interface ReorderAnimatedStyle {
  readonly transform: { translateY: number }[];
  readonly zIndex: number;
}

function clampIndex(index: number, itemCount: number): number {
  return Math.min(itemCount - 1, Math.max(0, index));
}

/** A drag-reorder handle (docs/design-system.md §5: "drag-reorder → move up/down alternatives"). */
export function useReorder({
  index,
  itemCount,
  itemHeightPt,
  onReorder,
  disabled = false,
  accessibilityLabel,
}: UseReorderOptions): GestureHookResult {
  const reduced = useReducedImpactMotion();
  const ty = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const fireReorder = (fromIndex: number, toIndex: number) => onReorder(fromIndex, toIndex);

  const gesture = Gesture.Pan()
    .enabled(!disabled)
    .onBegin(() => {
      'worklet';
      isDragging.value = true;
    })
    .onUpdate((event) => {
      'worklet';
      ty.value = event.translationY;
    })
    .onEnd((event) => {
      'worklet';
      const targetIndex = clampIndex(
        index + Math.round(event.translationY / itemHeightPt),
        itemCount,
      );
      const settle = (finished: boolean | undefined) => {
        'worklet';
        if (finished) {
          ty.value = 0;
          isDragging.value = false;
          if (targetIndex !== index) scheduleOnRN(fireReorder, index, targetIndex);
        }
      };
      const target = (targetIndex - index) * itemHeightPt;
      ty.value = reduced
        ? withTiming(target, { duration: REDUCED_IMPACT_FADE_MS }, settle)
        : withSpring(target, snappySpring, settle);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
    zIndex: isDragging.value ? 1 : 0,
  }));

  function move(direction: 1 | -1) {
    const targetIndex = clampIndex(index + direction, itemCount);
    if (targetIndex !== index) onReorder(index, targetIndex);
  }

  return {
    gesture,
    animatedStyle,
    accessibilityActions: [
      { name: 'moveUp', label: accessibilityLabel },
      { name: 'moveDown', label: accessibilityLabel },
    ],
    onAccessibilityAction: (event) => {
      if (event.nativeEvent.actionName === 'moveUp') move(-1);
      if (event.nativeEvent.actionName === 'moveDown') move(1);
    },
  };
}
