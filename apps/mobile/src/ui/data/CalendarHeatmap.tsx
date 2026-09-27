import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { PressScale } from '../press/PressScale';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface HeatmapDay {
  /** Day of month, 1-based. */
  readonly day: number;
  /** People free that day. */
  readonly free: number;
}

export interface CalendarHeatmapProps {
  /** Month heading ("April 2027"). */
  readonly title: string;
  /** Seven narrow weekday labels in the locale's week order. */
  readonly weekdays: readonly string[];
  /** Empty cells before day 1 (0 to 6) in the locale's week order. */
  readonly leadingBlanks: number;
  readonly days: readonly HeatmapDay[];
  /** Crew size; "6/6" means everyone is free. */
  readonly total: number;
  /** Highlighted best window, inclusive day numbers. */
  readonly range?: { readonly from: number; readonly to: number };
  /** Caption for the window ("Apr 2–9 · all 6 free"). */
  readonly rangeLabel?: string;
  /** Makes each day a button (pick a start day). */
  readonly onSelectDay?: (day: number) => void;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, padding: th.space['2'] },
  box: {
    borderRadius: th.radius.xs,
    paddingVertical: th.space['4'],
    alignItems: 'center',
    minHeight: th.space['32'],
  },
  inRange: { borderWidth: th.space['2'], borderColor: th.semantic.action.primary },
}));

/** Month grid tinted by how many of the crew are free each day, with the best window outlined. */
export function CalendarHeatmap({
  title,
  weekdays,
  leadingBlanks,
  days,
  total,
  range,
  rangeLabel,
  onSelectDay,
  testID,
}: CalendarHeatmapProps) {
  const styles = useStyles();
  const theme = useTheme();
  const summary = [title, rangeLabel].filter(Boolean).join(', ');
  const cellLabel = (day: HeatmapDay) => {
    const { free } = day;
    const n = day.day;
    return t({ id: 'common.data.heatmapDay', message: `${n}: ${free} of ${total} free` });
  };
  const interactive = onSelectDay !== undefined;
  const cells = [
    ...Array.from({ length: leadingBlanks }, (_, index) => (
      <View key={`b${index}`} style={styles.cell} />
    )),
    ...days.map((day) => {
      const share = total > 0 ? day.free / total : 0;
      const inRange = range !== undefined && day.day >= range.from && day.day <= range.to;
      const everyone = day.free >= total;
      const box = (
        <View
          style={[
            styles.box,
            {
              backgroundColor: everyone ? theme.semantic.state.success : theme.semantic.bg.control,
              opacity: everyone ? 1 : 0.45 + share * 0.55,
            },
            inRange ? styles.inRange : null,
          ]}
        >
          <Text variant="label" color={everyone ? theme.semantic.text.onAccent : undefined}>
            {String(day.day)}
          </Text>
          <Text
            variant="caption"
            color={everyone ? theme.semantic.text.onAccent : theme.semantic.text.secondary}
          >
            {`${day.free}/${total}`}
          </Text>
        </View>
      );
      return (
        <View key={day.day} style={styles.cell}>
          {interactive ? (
            <PressScale
              accessibilityLabel={cellLabel(day)}
              accessibilityState={{ selected: inRange }}
              onPress={() => onSelectDay(day.day)}
            >
              {box}
            </PressScale>
          ) : (
            box
          )}
        </View>
      );
    }),
  ];
  return (
    <Stack gap="8" testID={testID}>
      <Row
        justify="space-between"
        accessible
        accessibilityRole="header"
        accessibilityLabel={summary}
      >
        <Text variant="eyebrow">{title}</Text>
        {rangeLabel ? <Text variant="label">{rangeLabel}</Text> : null}
      </Row>
      <View style={styles.grid} importantForAccessibility="no-hide-descendants">
        {weekdays.map((weekday, index) => (
          <View key={`w${index}`} style={styles.cell}>
            <Text
              variant="label"
              color={theme.semantic.text.secondary}
              style={{ textAlign: 'center' }}
            >
              {weekday}
            </Text>
          </View>
        ))}
      </View>
      <View
        style={styles.grid}
        {...(interactive
          ? {}
          : {
              accessible: true,
              accessibilityRole: 'image' as const,
              accessibilityLabel: days.map(cellLabel).join('; '),
            })}
      >
        {cells}
      </View>
    </Stack>
  );
}
