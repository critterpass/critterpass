/**
 * WHEN TO GO: twelve month bars whose height is how crowded the month is. The cheapest months are
 * green, the highlighted peaks orange and the rest plain; the bars grow once, staggered. Tapping a
 * month outlines it and prices it for the crew. A legend names the highlights and the cheapest
 * month, so no month is told apart by colour alone.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Pressable, ScrollView, View } from 'react-native';

import { impact } from '@/motion';
import { GrowBar } from '@/ui/data/LinearBar';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme, type Theme } from '@/ui/theme';

import { guideWritten } from '../data/guide-text';
import type { LegendChip, MonthBarModel, MonthRole } from '../destination-model';
import { monthName } from '../format';

const CHART_HEIGHT = 64;

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: t.space['4'] },
  cell: { flex: 1, alignItems: 'center', gap: t.space['6'] },
  well: {
    width: '100%',
    height: CHART_HEIGHT,
    justifyContent: 'flex-end',
    borderRadius: t.radius.xs,
  },
  bar: { borderRadius: t.radius.xs, overflow: 'hidden' },
  ring: {
    position: 'absolute',
    start: -t.space['2'],
    end: -t.space['2'],
    bottom: -t.space['2'],
    borderWidth: t.space['2'],
    borderRadius: t.radius.xs + t.space['2'],
    borderColor: t.semantic.text.primary,
  },
  legend: { flexDirection: 'row', gap: t.space['8'], paddingEnd: t.space['16'] },
  chip: {
    borderRadius: t.radius.sm,
    paddingHorizontal: t.space['10'],
    paddingVertical: t.space['4'],
  },
}));

function roleColour(theme: Theme, role: MonthRole): string {
  if (role === 'cheapest') return theme.semantic.state.success;
  if (role === 'peak') return theme.color.orange;
  return theme.semantic.bg.control;
}

export interface MonthBarsProps {
  readonly bars: readonly MonthBarModel[];
  readonly legend: readonly LegendChip[];
  /** 1–12, or null with no month chosen. */
  readonly selected: number | null;
  readonly onSelect: (month: number) => void;
}

export function MonthBars({ bars, legend, selected, onSelect }: MonthBarsProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const locale = i18n.locale;
  return (
    <View style={{ gap: theme.space['12'] }} testID="explore-months">
      <View style={styles.row}>
        {bars.map((bar, index) => {
          const month = monthName(locale, bar.month, 'long');
          const height = Math.round(bar.fraction * CHART_HEIGHT);
          return (
            <Pressable
              key={bar.month}
              style={styles.cell}
              hitSlop={{ top: theme.space['8'], bottom: theme.space['8'] }}
              accessibilityRole="button"
              accessibilityState={{ selected: selected === bar.month }}
              accessibilityLabel={
                bar.role === 'cheapest'
                  ? t({ id: 'explore.months.barCheapest', message: `${month}, cheapest` })
                  : bar.highlight === null
                    ? month
                    : `${month}, ${guideWritten(bar.highlight, locale)}`
              }
              onPress={() => {
                impact('tick');
                onSelect(bar.month);
              }}
              testID={`explore-month-${String(bar.month)}`}
            >
              <View style={styles.well}>
                <View style={[styles.bar, { height }]}>
                  <GrowBar
                    axis="y"
                    fraction={1}
                    color={roleColour(theme, bar.role)}
                    index={index}
                  />
                </View>
                {selected === bar.month ? (
                  <View style={[styles.ring, { height: height + theme.space['4'] }]} />
                ) : null}
              </View>
              <Text
                variant="label"
                numberOfLines={1}
                color={
                  selected === bar.month
                    ? theme.semantic.text.primary
                    : theme.semantic.text.secondary
                }
              >
                {upper(monthName(locale, bar.month, 'narrow'), locale)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {legend.length === 0 ? null : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.legend}>
            {legend.map((chip) => {
              const month = monthName(locale, chip.month, 'short');
              const label =
                chip.kind === 'cheapest'
                  ? t({ id: 'explore.months.cheapest', message: `${month} cheapest` })
                  : `${month} ${guideWritten(chip.tag, locale)}`;
              return (
                <View
                  key={`${chip.kind}-${String(chip.month)}`}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: roleColour(
                        theme,
                        chip.kind === 'cheapest' ? 'cheapest' : 'peak',
                      ),
                    },
                  ]}
                >
                  <Text variant="label" color={theme.semantic.text.onAccent} numberOfLines={1}>
                    {upper(label, locale)}
                  </Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
