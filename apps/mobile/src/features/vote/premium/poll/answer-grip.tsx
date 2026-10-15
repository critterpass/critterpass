/**
 * The drag handle on a new poll's answer (4.01): three short lines at the row's end. Dragging it
 * carries the row up or down and drops it where the finger lets go, one row height per place;
 * screen readers get "Move up" and "Move down" instead.
 */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tokens } from '@cp/design-tokens';

import { usePremiumTheme } from '@/ui/premium';

/** Where a row dragged `dy` points from `index` lands, among `count` rows `rowHeight` tall. */
export function droppedIndex(index: number, dy: number, rowHeight: number, count: number): number {
  'worklet';
  const moved = Math.round(dy / rowHeight);
  return Math.max(0, Math.min(count - 1, index + moved));
}

/** Moves the item at `from` to `to`, keeping the others in order. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item === undefined) return [...items];
  next.splice(to, 0, item);
  return next;
}

export interface DraggableAnswerProps {
  readonly index: number;
  readonly count: number;
  readonly rowHeight: number;
  readonly onMove: (from: number, to: number) => void;
  readonly testID: string;
  readonly children: (grip: ReactNode) => ReactNode;
}

/** An answer row that follows its grip while dragged. */
export function DraggableAnswer(props: DraggableAnswerProps) {
  const theme = usePremiumTheme();
  const { index, count, rowHeight, onMove } = props;
  const dy = useSharedValue(0);
  const active = useSharedValue(false);
  const pan = Gesture.Pan()
    .onStart(() => {
      active.set(true);
    })
    .onUpdate((event) => {
      dy.set(event.translationY);
    })
    .onEnd((event) => {
      const to = droppedIndex(index, event.translationY, rowHeight, count);
      // The row re-renders in its new place; a row left where it was eases back.
      dy.set(to === index ? withTiming(0, { duration: tokens.motion.duration.fast }) : 0);
      active.set(false);
      if (to !== index) scheduleOnRN(onMove, index, to);
    });
  const lifted = useAnimatedStyle(() => ({
    transform: [{ translateY: dy.get() }],
    zIndex: active.get() ? 2 : 0,
    backgroundColor: active.get() ? theme.color.card : 'transparent',
  }));
  const line = { width: 16, height: 2, borderRadius: 1, backgroundColor: theme.color.placeholder };
  const grip = (
    <GestureDetector gesture={pan}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t({ id: 'vote.newPoll.reorder', message: 'Reorder answer' })}
        accessibilityActions={[
          { name: 'increment', label: t({ id: 'vote.newPoll.moveDown', message: 'Move down' }) },
          { name: 'decrement', label: t({ id: 'vote.newPoll.moveUp', message: 'Move up' }) },
        ]}
        onAccessibilityAction={(event) => {
          const to = event.nativeEvent.actionName === 'increment' ? index + 1 : index - 1;
          if (to >= 0 && to < count) onMove(index, to);
        }}
        hitSlop={12}
        testID={props.testID}
        style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center', gap: 3 }}
      >
        <View style={line} />
        <View style={line} />
        <View style={line} />
      </View>
    </GestureDetector>
  );
  return <Animated.View style={lifted}>{props.children(grip)}</Animated.View>;
}
