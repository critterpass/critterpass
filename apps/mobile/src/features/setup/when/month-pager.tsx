/**
 * Turning months on a day grid without arrows: the grid is swiped sideways, the month name is an
 * adjustable control for screen readers (swipe up / down for the next or previous month), and a
 * small "Today" link brings back the month holding today when another month is showing.
 */
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { View, type AccessibilityActionEvent } from 'react-native';

import { TextLink } from '@/ui/buttons/TextLink';
import { Row } from '@/ui/layout/Row';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  row: { gap: th.space['8'] },
  title: { flexShrink: 1 },
}));

/** The page showing, reset to `start` whenever `start` changes (the suggestion moved months). */
export function useMonthPage(count: number, start: number) {
  const [paged, setPaged] = useState({ from: start, index: start });
  const index = Math.max(0, Math.min(count - 1, paged.from === start ? paged.index : start));
  const go = (next: number) =>
    setPaged({ from: start, index: Math.max(0, Math.min(count - 1, next)) });
  return { index, go, step: (by: 1 | -1) => go(index + by) };
}

export interface MonthTitleProps {
  readonly title: string;
  readonly index: number;
  readonly count: number;
  readonly onStep: (by: 1 | -1) => void;
  /** The page holding today, or -1 when today isn't shown. */
  readonly todayIndex: number;
  readonly onToday: () => void;
  readonly variant?: 'h3' | 'title';
  readonly testID: string;
}

export function MonthTitle({
  title,
  index,
  count,
  onStep,
  todayIndex,
  onToday,
  variant = 'h3',
  testID,
}: MonthTitleProps) {
  const styles = useStyles();
  const paged = count > 1;
  const onAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment' && index < count - 1) onStep(1);
    if (event.nativeEvent.actionName === 'decrement' && index > 0) onStep(-1);
  };
  return (
    <Row align="center" style={styles.row}>
      <View
        style={styles.title}
        accessible
        accessibilityRole={paged ? 'adjustable' : 'header'}
        accessibilityLabel={title}
        accessibilityHint={
          paged
            ? t({
                id: 'setup.when.monthHint',
                message: 'Swipe up or down for another month.',
              })
            : undefined
        }
        accessibilityActions={paged ? [{ name: 'increment' }, { name: 'decrement' }] : []}
        onAccessibilityAction={onAction}
        testID={`${testID}-month`}
      >
        <Text variant={variant}>{title}</Text>
      </View>
      {todayIndex >= 0 && todayIndex !== index ? (
        <TextLink
          label={t({ id: 'setup.when.today', message: 'Today' })}
          onPress={onToday}
          testID={`${testID}-today`}
        />
      ) : null}
    </Row>
  );
}
