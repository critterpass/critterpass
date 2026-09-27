import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { format } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';

import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import { GrowBar } from './LinearBar';

export interface Column {
  readonly key: string;
  /** Column height as a fraction of the chart height, 0 to 1. */
  readonly fraction: number;
  readonly color: string;
  /** Axis caption under the column; empty string keeps the slot blank. */
  readonly caption?: string;
  /** Planned value as a fraction of the chart height, drawn as a dashed line. */
  readonly plan?: number;
  /** Rendered over the column (a ring on the "now" hour, a TODAY tag). */
  readonly overlay?: ReactNode;
}

export interface ColumnsProps {
  readonly columns: readonly Column[];
  /** Chart height in points. @default 72 */
  readonly height?: number;
}

const useStyles = makeStyles((th) => ({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: th.space['6'] },
  cell: { flex: 1, alignItems: 'center', gap: th.space['6'] },
  well: { width: '100%', justifyContent: 'flex-end' },
  bar: {
    borderRadius: th.radius.xs,
    overflow: 'hidden',
    width: '100%',
    justifyContent: 'flex-end',
  },
  plan: {
    position: 'absolute',
    start: 0,
    end: 0,
    borderTopWidth: th.space['2'],
    borderStyle: 'dashed',
    borderColor: th.semantic.text.secondary,
  },
  overlay: { position: 'absolute', start: 0, end: 0, bottom: 0, alignItems: 'center' },
}));

/** Decorative column row shared by the vertical charts; the chart owns the text summary. */
export function Columns({ columns, height = 72 }: ColumnsProps) {
  const styles = useStyles();
  return (
    <View style={styles.row} importantForAccessibility="no-hide-descendants">
      {columns.map((column, index) => (
        <View key={column.key} style={styles.cell}>
          <View style={[styles.well, { height }]}>
            <View style={[styles.bar, { height }]}>
              <GrowBar axis="y" fraction={column.fraction} color={column.color} index={index} />
            </View>
            {column.plan === undefined ? null : (
              <View
                testID="columns-plan"
                style={[styles.plan, { bottom: Math.min(1, Math.max(0, column.plan)) * height }]}
              />
            )}
            {column.overlay ? <View style={styles.overlay}>{column.overlay}</View> : null}
          </View>
          {column.caption === undefined ? null : (
            <Text variant="label" numberOfLines={1}>
              {column.caption}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

export interface MonthBar {
  /** Short month label ("Apr"), uppercased at render. */
  readonly label: string;
  /** Relative value, 0 to 1 (visitors, rain, how good a month is). */
  readonly value: number;
  /** Best months (or the trip month) glint in the highlight colour. */
  readonly highlight?: boolean;
}

export interface MonthBarsProps {
  readonly months: readonly MonthBar[];
  /** What the bars measure ("Best time to go"); leads the summary. */
  readonly title: string;
  /** @default bg.control */
  readonly color?: string;
  /** @default action.primary */
  readonly highlightColor?: string;
  readonly height?: number;
  readonly testID?: string;
}

/** Twelve month columns with highlighted months; summary names the highlighted ones. */
export function MonthBars({
  months,
  title,
  color,
  highlightColor,
  height,
  testID,
}: MonthBarsProps) {
  const theme = useTheme();
  const locale = useLocale();
  const highlighted = months.filter((month) => month.highlight).map((month) => month.label);
  const best = format.list(locale, highlighted);
  const summary =
    highlighted.length > 0
      ? t({ id: 'common.data.monthBarsSummary', message: `${title}: best in ${best}` })
      : title;
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={summary}>
      <Columns
        {...(height === undefined ? {} : { height })}
        columns={months.map((month, index) => ({
          key: String(index),
          fraction: month.value,
          caption: month.label,
          color: month.highlight
            ? (highlightColor ?? theme.semantic.action.primary)
            : (color ?? theme.semantic.bg.control),
        }))}
      />
    </View>
  );
}
