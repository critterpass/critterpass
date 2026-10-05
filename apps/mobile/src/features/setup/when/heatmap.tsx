/**
 * The dates heatmap (3c-3): one Monday-first month of heat cells (how many are free each day),
 * the chosen days as one continuous yellow band with its pill in the header, and, while picking,
 * the first day tapped and a ghost outline of the suggested range. Months turn by swiping the
 * grid; the month name and a "Today" link sit in the header instead of arrows.
 */
import { View } from 'react-native';

import { format } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { Row } from '@/ui/layout/Row';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { monthLabel, weekdayLetters } from './copy';
import { DayGrid, edgesIn, weeksOfDates, type DragHandlers } from './day-grid';
import { HeatCell, heatCellLabel } from './heat-cell';
import { dateValue, type HeatDay, type HeatMonth } from './model';
import { MonthTitle, useMonthPage } from './month-pager';
import type { DayRange } from './range';

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['14'],
    gap: th.space['10'],
  },
  header: { flexWrap: 'wrap', gap: th.space['8'] },
  pill: {
    backgroundColor: th.semantic.action.primary,
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['10'],
    paddingVertical: th.space['4'],
  },
}));

export interface HeatmapProps {
  readonly months: readonly HeatMonth[];
  readonly startIndex: number;
  readonly total: number;
  /** The chosen days, drawn as the yellow band. */
  readonly window: DayRange | null;
  /** The first day tapped, before the last one is. */
  readonly anchor?: string | null | undefined;
  /** The suggested range after a first tap, outlined. */
  readonly ghost?: DayRange | null | undefined;
  /** The header pill ("Apr 2 – 9 · all 6 free"). */
  readonly windowLabel?: string | undefined;
  /** Today (`YYYY-MM-DD`): the "Today" link's month; days before it can't be picked. */
  readonly today?: string | undefined;
  /** Makes each day a button (the picker). */
  readonly onSelectDay?: ((date: string) => void) | undefined;
  readonly onDrag?: DragHandlers | undefined;
  /** Prefix of the grid's own ids (`{id}-grid`, `{id}-month`, `{id}-today`). */
  readonly testID?: string | undefined;
}

export function Heatmap({
  months,
  startIndex,
  total,
  window,
  anchor = null,
  ghost = null,
  windowLabel,
  today,
  onSelectDay,
  onDrag,
  testID = 'heatmap',
}: HeatmapProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const page = useMonthPage(months.length, startIndex);
  const month = months[page.index];
  if (month === undefined) return null;
  const todayIndex =
    today === undefined ? -1 : months.findIndex((m) => m.key === today.slice(0, 7));
  const filled = window ?? (anchor === null ? null : { start: anchor, end: anchor });
  const byDate = new Map(month.days.map((day) => [day.date, day]));
  const label = (day: HeatDay) => {
    const when = format.date(locale, dateValue(day.date), {
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
    const past = today !== undefined && day.date < today;
    return heatCellLabel(when, day.free, total, edgesIn(filled, day.date), total > 1 && !past);
  };
  return (
    <View style={styles.card} testID="setup-heatmap">
      <Row justify="space-between" align="center" style={styles.header}>
        <MonthTitle
          title={monthLabel(locale, month.year, month.month)}
          index={page.index}
          count={months.length}
          onStep={page.step}
          todayIndex={todayIndex}
          onToday={() => page.go(todayIndex)}
          testID={testID}
        />
        {windowLabel === undefined ? null : (
          <View style={styles.pill} testID="heatmap-window">
            <Text variant="label" color={theme.semantic.text.onAccent}>
              {windowLabel}
            </Text>
          </View>
        )}
      </Row>
      <DayGrid
        weekdays={weekdayLetters(locale)}
        weeks={weeksOfDates(
          month.leadingBlanks,
          month.days.map((day) => day.date),
        )}
        bands={(date) => ({ fill: edgesIn(filled, date), ghost: edgesIn(ghost, date) })}
        renderDay={(date) => {
          const day = byDate.get(date);
          if (day === undefined) return null;
          const closed = today !== undefined && date < today;
          return (
            <HeatCell
              day={day}
              total={total}
              band={edgesIn(filled, date)}
              label={label(day)}
              closed={closed}
              onPress={onSelectDay === undefined ? undefined : () => onSelectDay(date)}
            />
          );
        }}
        onDrag={onDrag}
        onSwipe={months.length > 1 ? page.step : undefined}
        testID={`${testID}-grid`}
      />
    </View>
  );
}
