/**
 * The dates heatmap (3c-3): one Monday-first month of 40 pt cells, each tinted orange by how many
 * of the crew are free (.10 → 1.0 in six steps scaled to the crew), "n/N" under the day, the best
 * window inset in yellow and its pill in the header. Cells fade to their new step as each calendar
 * lands; the window's outline draws on cell by cell. Pages month by month across the horizon.
 * Screen readers hear "{date}, {n} of {N} free" per day.
 */
import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';
import { format } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { deviceTier, isLowTier, patterns } from '@/motion';
import { IconButton } from '@/ui/buttons/IconButton';
import { Row } from '@/ui/layout/Row';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { monthLabel, weekdayLetters } from './copy';
import { dateValue, heatStep, inWindow, type HeatDay, type HeatMonth } from './model';

const COLUMNS = 7;

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['14'],
    gap: th.space['10'],
  },
  header: { flexWrap: 'wrap', gap: th.space['8'] },
  title: { flexShrink: 1 },
  pill: {
    backgroundColor: th.semantic.action.primary,
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['10'],
    paddingVertical: th.space['4'],
  },
  paging: { gap: th.space['4'] },
  // Whole rows of seven flexible cells: percentage widths round past 100% on iOS and wrap.
  week: { flexDirection: 'row' },
  slot: { flex: 1, padding: th.space['2'] },
  weekday: { alignItems: 'center', paddingBottom: th.space['2'] },
  cell: {
    height: th.space['32'] + th.space['8'],
    borderRadius: th.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: { ...fillAbsolute() },
  outline: { ...fillAbsolute(), borderRadius: th.radius.sm, borderWidth: th.space['2'] },
}));

function fillAbsolute() {
  return { position: 'absolute' as const, top: 0, bottom: 0, start: 0, end: 0 };
}

interface CellProps {
  readonly day: HeatDay;
  readonly total: number;
  readonly highlighted: boolean;
  /** This cell's place in the window (0-based), or -1: the outline draws on in that order. */
  readonly order: number;
  readonly count: number;
  readonly progress: SharedValue<number>;
  readonly label: string;
  readonly onPress?: (() => void) | undefined;
}

function Cell({ day, total, highlighted, order, count, progress, label, onPress }: CellProps) {
  const styles = useStyles();
  const theme = useTheme();
  const everyone = total > 0 && day.free >= total;
  const opacity = useSharedValue(heatStep(day.free, total));
  useEffect(() => {
    const step = heatStep(day.free, total);
    // Low-tier phones keep the screen under its animated-view budget: the step just changes.
    opacity.value = isLowTier(deviceTier)
      ? step
      : withTiming(step, { duration: tokens.motion.duration.base });
  }, [day.free, total, opacity]);
  const fillStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const ink = everyone ? theme.semantic.text.onAccent : theme.semantic.text.primary;
  const outlineStyle = useAnimatedStyle(() => ({
    opacity: progress.value * count > order ? 1 : 0,
  }));
  const face = (
    <View
      style={styles.cell}
      accessible={onPress === undefined}
      accessibilityLabel={label}
      testID={`heat-${day.date}`}
    >
      <Animated.View style={[styles.fill, { backgroundColor: theme.color.orange }, fillStyle]} />
      {highlighted ? (
        <Animated.View
          style={[styles.outline, { borderColor: theme.semantic.action.primary }, outlineStyle]}
        />
      ) : null}
      <Text variant="title" color={ink}>
        {String(day.day)}
      </Text>
      <Text variant="caption" color={ink}>
        {`${day.free}/${total}`}
      </Text>
    </View>
  );
  if (onPress === undefined) return face;
  return (
    <PressScale
      onPress={onPress}
      widthClass="narrow"
      accessibilityLabel={label}
      accessibilityState={{ selected: highlighted }}
    >
      {face}
    </PressScale>
  );
}

/** The month as Monday-first weeks of seven, blanks as null. */
export function weeksOf(month: HeatMonth): (HeatDay | null)[][] {
  const cells: (HeatDay | null)[] = [
    ...Array.from({ length: month.leadingBlanks }, () => null),
    ...month.days,
  ];
  while (cells.length % COLUMNS !== 0) cells.push(null);
  return Array.from({ length: cells.length / COLUMNS }, (_, row) =>
    cells.slice(row * COLUMNS, row * COLUMNS + COLUMNS),
  );
}

export interface HeatmapProps {
  readonly months: readonly HeatMonth[];
  readonly startIndex: number;
  readonly total: number;
  readonly window: { readonly start: string; readonly end: string } | null;
  /** The header pill ("Apr 2 – 9 · all 6 free"). */
  readonly windowLabel?: string | undefined;
  /** Makes each day a button (the week picker picks a first day). */
  readonly onSelectDay?: ((date: string) => void) | undefined;
}

export function Heatmap({
  months,
  startIndex,
  total,
  window,
  windowLabel,
  onSelectDay,
}: HeatmapProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  // Paging resets to `startIndex` whenever it changes (the best window moved to another month).
  const [paged, setPaged] = useState({ from: startIndex, index: startIndex });
  const index = paged.from === startIndex ? paged.index : startIndex;
  const setIndex = (next: (current: number) => number) =>
    setPaged({ from: startIndex, index: next(index) });
  const month = months[Math.min(index, months.length - 1)];
  const windowDays = month?.days.filter((day) => inWindow(day.date, window)) ?? [];
  const drawing = patterns.useDraw({ active: windowDays.length > 0, kind: 'icon' });
  if (month === undefined) return null;
  const letters = weekdayLetters(locale);
  const cellLabel = (day: HeatDay) => {
    const when = format.date(locale, dateValue(day.date), {
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
    const free = day.free;
    return t({ id: 'setup.when.cellA11y', message: `${when}, ${free} of ${total} free` });
  };
  return (
    <View style={styles.card} testID="setup-heatmap">
      <Row justify="space-between" align="center" style={styles.header}>
        <Row align="center" style={styles.paging}>
          {months.length > 1 ? (
            <IconButton
              label={t({ id: 'setup.when.prevMonth', message: 'Previous month' })}
              glyph={<Text variant="title">‹</Text>}
              size={40}
              disabled={index === 0}
              onPress={() => setIndex((i) => Math.max(0, i - 1))}
              testID="heatmap-prev"
            />
          ) : null}
          <Text variant="h3" style={styles.title} accessibilityRole="header">
            {monthLabel(locale, month.year, month.month)}
          </Text>
          {months.length > 1 ? (
            <IconButton
              label={t({ id: 'setup.when.nextMonth', message: 'Next month' })}
              glyph={<Text variant="title">›</Text>}
              size={40}
              disabled={index >= months.length - 1}
              onPress={() => setIndex((i) => Math.min(months.length - 1, i + 1))}
              testID="heatmap-next"
            />
          ) : null}
        </Row>
        {windowLabel === undefined ? null : (
          <View style={styles.pill} testID="heatmap-window">
            <Text variant="label" color={theme.semantic.text.onAccent}>
              {windowLabel}
            </Text>
          </View>
        )}
      </Row>
      <View style={styles.week} importantForAccessibility="no-hide-descendants">
        {letters.map((letter, column) => (
          <View key={`w${column}`} style={[styles.slot, styles.weekday]}>
            <Text variant="label" color={theme.semantic.text.secondary}>
              {letter}
            </Text>
          </View>
        ))}
      </View>
      {weeksOf(month).map((week, row) => (
        <View key={`r${row}`} style={styles.week}>
          {week.map((day, column) => {
            if (day === null) return <View key={column} style={styles.slot} />;
            const order = windowDays.findIndex((candidate) => candidate.date === day.date);
            return (
              <View key={day.date} style={styles.slot}>
                <Cell
                  day={day}
                  total={total}
                  highlighted={order >= 0}
                  order={order}
                  count={windowDays.length}
                  progress={drawing.progress}
                  label={cellLabel(day)}
                  onPress={onSelectDay === undefined ? undefined : () => onSelectDay(day.date)}
                />
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}
