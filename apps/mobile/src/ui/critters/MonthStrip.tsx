import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { format } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';

import { Row } from '../layout/Row';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface StripMonth {
  /** Narrow month label ("A"). */
  readonly label: string;
  /** Full month name for screen readers ("April"). */
  readonly name: string;
  /** A legendary appears this month. */
  readonly legendary?: boolean;
  /** The current month (outlined). */
  readonly current?: boolean;
  /** Your next trip falls in this month (filled). */
  readonly inTrip?: boolean;
}

export interface MonthStripProps {
  readonly months: readonly StripMonth[];
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  pill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: th.space['6'],
    borderRadius: th.radius.sm,
    gap: th.space['2'],
    borderWidth: th.space['2'],
  },
  dot: { width: th.space['4'], height: th.space['4'], borderRadius: th.space['2'] },
}));

/** Twelve month pills: legendary months glint gold, the trip window fills, this month is outlined. */
export function MonthStrip({ months, testID }: MonthStripProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const legendary = format.list(
    locale,
    months.filter((m) => m.legendary).map((m) => m.name),
  );
  const trip = format.list(
    locale,
    months.filter((m) => m.inTrip).map((m) => m.name),
  );
  const summary = [
    legendary
      ? t({ id: 'common.critter.legendaryMonths', message: `Legendaries in ${legendary}` })
      : undefined,
    trip ? t({ id: 'common.critter.tripMonths', message: `your trip: ${trip}` }) : undefined,
  ]
    .filter(Boolean)
    .join('; ');
  return (
    <Row gap="4" testID={testID} accessible accessibilityRole="image" accessibilityLabel={summary}>
      {months.map((month, index) => (
        <View
          key={index}
          style={[
            styles.pill,
            {
              backgroundColor: month.inTrip ? theme.tier.legendary.color : theme.semantic.bg.raised,
              borderColor: month.current ? theme.semantic.text.primary : 'transparent',
            },
          ]}
        >
          <Text variant="label" color={month.inTrip ? theme.semantic.text.onAccent : undefined}>
            {month.label}
          </Text>
          <View
            style={[
              styles.dot,
              { backgroundColor: month.legendary ? theme.color.gold.base : 'transparent' },
            ]}
          />
        </View>
      ))}
    </Row>
  );
}
