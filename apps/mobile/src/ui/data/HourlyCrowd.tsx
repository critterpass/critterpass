import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { format } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';

import { Row } from '../layout/Row';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import { Columns } from './MonthBars';

export interface CrowdHour {
  /** Hour of day, 0 to 23. */
  readonly hour: number;
  /** Relative crowd level, 0 to 1. */
  readonly level: number;
}

export interface HourlyCrowdProps {
  readonly hours: readonly CrowdHour[];
  /** Card heading ("Crowds on Apr 3"). */
  readonly title: string;
  /** Hour the now-marker rings (today only). */
  readonly nowHour?: number;
  /** Advice pill at the end of the heading ("Go before 7:30"). */
  readonly badge?: ReactNode;
  /** Plain-text twin of `badge` for the summary. */
  readonly badgeLabel?: string;
  /** Show an axis caption every n hours. @default 4 */
  readonly captionEvery?: number;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['16'],
  },
  now: {
    width: '100%',
    height: th.space['14'],
    borderRadius: th.radius.xs,
    borderWidth: th.space['2'],
    borderColor: th.semantic.action.primary,
  },
}));

const hourLabel = (locale: string, hour: number) =>
  format.date(locale, new Date(2000, 0, 1, hour), { hour: 'numeric' });

/** Busy-by-hour columns (place detail) with the now-marker; summary names quietest and busiest hours. */
export function HourlyCrowd({
  hours,
  title,
  nowHour,
  badge,
  badgeLabel,
  captionEvery = 4,
  testID,
}: HourlyCrowdProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const quietest = hours.reduce<CrowdHour | undefined>(
    (min, hour) => (min === undefined || hour.level < min.level ? hour : min),
    undefined,
  );
  const busiest = hours.reduce<CrowdHour | undefined>(
    (max, hour) => (max === undefined || hour.level > max.level ? hour : max),
    undefined,
  );
  const quiet = quietest ? hourLabel(locale, quietest.hour) : '';
  const busy = busiest ? hourLabel(locale, busiest.hour) : '';
  const summary = [
    title,
    quietest && busiest
      ? t({ id: 'common.data.crowdSummary', message: `quietest at ${quiet}, busiest at ${busy}` })
      : undefined,
    badgeLabel,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={summary}
      style={styles.card}
    >
      <Row justify="space-between" align="center" style={{ marginBottom: theme.space['12'] }}>
        <Text variant="eyebrow">{title}</Text>
        {badge}
      </Row>
      <Columns
        columns={hours.map((hour, index) => {
          const isNow = hour.hour === nowHour;
          return {
            key: String(hour.hour),
            fraction: Math.max(hour.level, 0.08),
            color: isNow ? theme.semantic.state.success : theme.semantic.bg.control,
            caption: index % captionEvery === 0 ? hourLabel(locale, hour.hour) : '',
            ...(isNow ? { overlay: <View style={styles.now} /> } : {}),
          };
        })}
      />
    </View>
  );
}
