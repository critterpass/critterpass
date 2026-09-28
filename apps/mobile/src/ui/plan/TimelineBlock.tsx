import { t } from '@lingui/core/macro';
import type { AccessibilityActionEvent } from 'react-native';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import type { GestureType } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { format } from '@cp/i18n';

import { useDragSnap } from '@/motion/gestures/drag-snap';
import { usePress } from '@/motion/gestures/press';
import { useLocale } from '@/lib/i18n/use-locale';

import { Text } from '../text/Text';
import { makeStyles, touchSlop, useTheme } from '../theme';

export interface TimelineBlock {
  readonly id: string;
  readonly title: string;
  readonly detail?: string;
  /** Minutes after midnight. */
  readonly start: number;
  readonly end: number;
  readonly color: string;
  /** Can be dragged (15-minute snap) or stepped. @default true */
  readonly movable?: boolean;
  /** Where the block used to be: dashed, struck through, not movable. */
  readonly struck?: boolean;
  /** Half-width lane for overlapping blocks. @default 'full' */
  readonly lane?: 'full' | 'start' | 'end';
}

/** Width of the hour-label column. */
export const GUTTER = 32;

const useStyles = makeStyles((th) => ({
  block: {
    position: 'absolute',
    borderRadius: th.radius.md,
    overflow: 'hidden',
  },
  pressArea: { flex: 1, padding: th.space['10'] },
}));

export function laneStyle(lane: TimelineBlock['lane']) {
  if (lane === 'start') return { start: GUTTER + 8, width: '45%' as const };
  if (lane === 'end') return { end: 0, width: '45%' as const };
  return { start: GUTTER + 8, end: 0 };
}

export const clockOf = (locale: string, minutes: number) =>
  format.time(locale, new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60));

/**
 * One gesture per native view: on iOS every handler on one view spends a shared attach-retry
 * budget, so a block mounted during a screen push could lose the second gesture of a composed
 * pair. The block carries the drag and the full-size press area inside it carries the tap. Neither
 * waits for the other, so whichever activates first cancels the other, as `Gesture.Race` does on a
 * single view.
 */
export function movableBlockGestures(
  drag: GestureType,
  press: GestureType,
): { readonly block: GestureType; readonly pressArea: GestureType } {
  return {
    block: drag.withTestId('timeline-block-drag'),
    pressArea: press.withTestId('timeline-block-press'),
  };
}

/** A draggable, steppable block (15-minute snaps); tap selects it for the visible stepper. */
export function MovableBlock({
  block,
  selected,
  onSelect,
  onMove,
  bounds,
  pointsPerMinute,
  top,
}: {
  readonly block: TimelineBlock;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onMove: (start: number) => void;
  readonly bounds: { readonly min: number; readonly max: number };
  readonly pointsPerMinute: number;
  readonly top: number;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const range = `${clockOf(locale, block.start)}–${clockOf(locale, block.end)}`;
  const label = [block.title, range, block.detail].filter(Boolean).join(', ');
  const duration = block.end - block.start;
  const height = duration * pointsPerMinute;
  // A short slot keeps its time-true height; slop brings its touch target to the minimum.
  const slop = touchSlop(height);
  const drag = useDragSnap({
    initialMinutes: block.start,
    pointsPerMinute,
    minMinutes: bounds.min,
    maxMinutes: bounds.max - duration,
    onChange: onMove,
    accessibilityLabel: label,
  });
  const press = usePress({ onPress: onSelect, accessibilityLabel: label });
  const actions = [
    ...press.accessibilityActions,
    { name: 'increment', label: t({ id: 'common.plan.later', message: 'Later by 15 minutes' }) },
    {
      name: 'decrement',
      label: t({ id: 'common.plan.earlier', message: 'Earlier by 15 minutes' }),
    },
  ];
  const onAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'activate') press.onAccessibilityAction(event);
    else drag.onAccessibilityAction(event);
  };
  const gestures = slop
    ? movableBlockGestures(drag.gesture.hitSlop(slop), press.gesture.hitSlop(slop))
    : movableBlockGestures(drag.gesture, press.gesture);
  return (
    <GestureDetector gesture={gestures.block}>
      <Animated.View
        hitSlop={slop}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={block.title}
        accessibilityValue={{ text: range }}
        accessibilityState={{ selected }}
        accessibilityActions={actions}
        onAccessibilityAction={onAction}
        style={[
          styles.block,
          laneStyle(block.lane),
          { top, height, backgroundColor: block.color },
          selected
            ? { borderWidth: theme.ring.focus.widthPt, borderColor: theme.ring.focus.color }
            : null,
          drag.animatedStyle,
          press.animatedStyle,
        ]}
      >
        <GestureDetector gesture={gestures.pressArea}>
          <View hitSlop={slop} style={styles.pressArea}>
            <Text variant="title" color={theme.semantic.text.onAccent} numberOfLines={1}>
              {block.title}
            </Text>
            {block.detail ? (
              <Text variant="bodySm" color={theme.semantic.text.onAccent} numberOfLines={1}>
                {block.detail}
              </Text>
            ) : null}
          </View>
        </GestureDetector>
      </Animated.View>
    </GestureDetector>
  );
}
