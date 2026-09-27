import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { usePress } from '@/motion/gestures/press';
import { useReorder } from '@/motion/gestures/reorder';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { SecondaryText } from '../cards/SecondaryText';
import { Text } from '../text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '../theme';

export interface DayRowProps {
  readonly dayNumber: number;
  /** Short weekday ("Mon"). */
  readonly weekday: string;
  readonly title: string;
  readonly summary?: string;
  /** Number tile colour (the day's type or destination colour). @default action.primary */
  readonly color?: string;
  /** Trailing status chip or weather icon. */
  readonly status?: ReactNode;
  /** Plain text of `status` for screen readers ("Booked"). */
  readonly statusLabel?: string;
  readonly onPress?: () => void;
  /** Enables drag-reorder plus "Move up" / "Move down" actions. */
  readonly reorder?: {
    readonly index: number;
    readonly count: number;
    /** Row pitch (height + gap) used to turn drag distance into positions. */
    readonly rowHeight: number;
    readonly onReorder: (from: number, to: number) => void;
  };
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  row: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['12'],
    minHeight: MIN_TOUCH_TARGET,
  },
  tile: {
    width: th.space['32'] + th.space['12'],
    paddingVertical: th.space['6'],
    borderRadius: th.radius.md,
    alignItems: 'center',
  },
}));

/** One day of a trip plan: number tile, title, summary, status; drag or move actions to reorder. */
export function DayRow({
  dayNumber,
  weekday,
  title,
  summary,
  color,
  status,
  statusLabel,
  onPress,
  reorder,
  testID,
}: DayRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const dayWord = t({ id: 'common.plan.dayN', message: `Day ${dayNumber}` });
  const label = [dayWord, weekday, title, summary, statusLabel].filter(Boolean).join(', ');
  const press = usePress({
    disabled: !onPress,
    accessibilityLabel: label,
    ...(onPress ? { onPress } : {}),
  });
  const drag = useReorder({
    index: reorder?.index ?? 0,
    itemCount: reorder?.count ?? 1,
    itemHeightPt: reorder?.rowHeight ?? 1,
    onReorder: (from, to) => reorder?.onReorder(from, to),
    disabled: !reorder,
    accessibilityLabel: label,
  });
  const actions = [
    ...(onPress ? press.accessibilityActions : []),
    ...(reorder
      ? [
          { name: 'moveUp', label: t({ id: 'common.plan.moveUp', message: 'Move up' }) },
          { name: 'moveDown', label: t({ id: 'common.plan.moveDown', message: 'Move down' }) },
        ]
      : []),
  ];
  const onAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'activate') press.onAccessibilityAction(event);
    else drag.onAccessibilityAction(event);
  };
  return (
    <GestureDetector gesture={Gesture.Race(drag.gesture, press.gesture)}>
      <Animated.View
        testID={testID}
        accessible
        accessibilityRole={onPress ? 'button' : 'summary'}
        accessibilityLabel={label}
        accessibilityActions={actions}
        onAccessibilityAction={onAction}
        style={[styles.row, press.animatedStyle, drag.animatedStyle]}
      >
        <Row gap="12" align="center">
          <View style={[styles.tile, { backgroundColor: color ?? theme.semantic.action.primary }]}>
            <Text variant="h3" color={theme.semantic.text.onAccent}>
              {String(dayNumber)}
            </Text>
            <Text variant="label" color={theme.semantic.text.onAccent}>
              {weekday}
            </Text>
          </View>
          <Stack gap="2" flex={1}>
            <Text variant="title" numberOfLines={2}>
              {title}
            </Text>
            {summary ? <SecondaryText numberOfLines={2}>{summary}</SecondaryText> : null}
          </Stack>
          {status}
        </Row>
      </Animated.View>
    </GestureDetector>
  );
}
