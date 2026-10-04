/**
 * The review's totals in the section 7 layout (7h-7): "+RP 210K EACH", "+1H20 DRIVING" and "0
 * BOOKINGS MOVED" (green while nothing booked moves), each number rolling as rows are ticked or
 * unticked.
 */
import { plural, t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { Odometer } from '@/ui/data/Odometer';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { drivingChip } from './changes-copy';
import type { ReviewNumbers } from './model/review-numbers';
import { currencyParts } from './review-chips';

const useStyles = makeStyles((th) => ({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space['8'] },
  chip: {
    borderRadius: th.radius.md,
    paddingHorizontal: th.space['10'],
    paddingVertical: th.space['4'],
  },
}));

function Chip({
  good = false,
  children,
  testID,
}: {
  readonly good?: boolean;
  readonly children: ReactNode;
  readonly testID: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: good ? theme.semantic.state.success : theme.semantic.bg.control },
      ]}
      testID={testID}
    >
      {children}
    </View>
  );
}

export function ChangesTotals({
  numbers,
  drivingMin,
}: {
  readonly numbers: ReviewNumbers | null;
  readonly drivingMin: number;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const money =
    numbers?.eachMinor == null || numbers.currency === null
      ? null
      : { minor: numbers.eachMinor, ...currencyParts(numbers.currency, locale) };
  const bookingsMoved = numbers?.bookingsMoved ?? 0;
  const driving = drivingChip(drivingMin);
  const each = upper(t({ id: 'plan.review.each', message: 'each' }), locale);
  const movedLabel = upper(
    t({
      id: 'plan.review.bookingsMoved',
      message: plural(bookingsMoved, { one: 'booking moved', other: 'bookings moved' }),
    }),
    locale,
  );
  return (
    <View style={styles.row} testID="plan-review-totals">
      {money === null || money.minor === 0 ? null : (
        <Chip testID="plan-review-cost">
          <Odometer
            value={Math.round(Math.abs(money.minor) / 10 ** money.digits)}
            prefix={`${money.minor > 0 ? '+' : '−'}${money.symbol}`}
            suffix={` ${each}`}
            variant="label"
          />
        </Chip>
      )}
      {driving === null ? null : (
        <Chip testID="plan-review-driving">
          <Text variant="label">{driving}</Text>
        </Chip>
      )}
      <Chip good={bookingsMoved === 0} testID="plan-review-bookings">
        <Odometer
          value={bookingsMoved}
          suffix={` ${movedLabel}`}
          variant="label"
          {...(bookingsMoved === 0 ? { color: theme.semantic.text.onAccent } : {})}
        />
      </Chip>
    </View>
  );
}
