import { t } from '@lingui/core/macro';
import type { AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { format } from '@cp/i18n';

import { useDragSnap } from '@/motion/gestures/drag-snap';
import { usePress } from '@/motion/gestures/press';
import { useLocale } from '@/lib/i18n/use-locale';

import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

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
    padding: th.space['10'],
    overflow: 'hidden',
  },
}));

export function laneStyle(lane: TimelineBlock['lane']) {
  if (lane === 'start') return { start: GUTTER + 8, width: '45%' as const };
  if (lane === 'end') return { end: 0, width: '45%' as const };
  return { start: GUTTER + 8, end: 0 };
}

export const clockOf = (locale: string, minutes: number) =>
  format.time(locale, new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60));

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
  return (
    <GestureDetector gesture={Gesture.Race(drag.gesture, press.gesture)}>
      <Animated.View
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
          { top, height: duration * pointsPerMinute, backgroundColor: block.color },
          selected
            ? { borderWidth: theme.ring.focus.widthPt, borderColor: theme.ring.focus.color }
            : null,
          drag.animatedStyle,
          press.animatedStyle,
        ]}
      >
        <Text variant="title" color={theme.semantic.text.onAccent} numberOfLines={1}>
          {block.title}
        </Text>
        {block.detail ? (
          <Text variant="bodySm" color={theme.semantic.text.onAccent} numberOfLines={1}>
            {block.detail}
          </Text>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}
