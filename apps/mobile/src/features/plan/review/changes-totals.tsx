/**
 * The review's totals in the section 7 layout (7h-7): "+RP 210K EACH", "+1H20 DRIVING" and "0
 * BOOKINGS MOVED" (green while nothing booked moves), each number rolling as rows are ticked or
 * unticked.
 */
import { plural, t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { narrowCurrencySymbol } from '@cp/cost-engine';
import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { Odometer } from '@/ui/data/Odometer';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { drivingChip } from './changes-copy';
import type { ReviewNumbers } from './model/review-numbers';

/** The currency's symbol and minor-unit digits in the reader's locale ("$", 2). */
function currencyParts(currency: string, locale: string): { symbol: string; digits: number } {
  const format = new Intl.NumberFormat(locale, { style: 'currency', currency });
  return {
    symbol: narrowCurrencySymbol(currency),
    digits: format.resolvedOptions().maximumFractionDigits ?? 2,
  };
}

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

/** The compact steps the money chip uses: thousands, millions, billions. */
function compactStep(major: number): { readonly scaled: number; readonly unit: string } {
  if (major >= 1e9)
    return { scaled: major / 1e9, unit: t({ id: 'plan.review.money.billion', message: 'B' }) };
  if (major >= 1e6)
    return { scaled: major / 1e6, unit: t({ id: 'plan.review.money.million', message: 'M' }) };
  if (major >= 1e3)
    return { scaled: major / 1e3, unit: t({ id: 'plan.review.money.thousand', message: 'K' }) };
  return { scaled: major, unit: '' };
}

/**
 * "+RP 210K EACH": the share change in a compact form (vi "+RP 210 N MỖI NGƯỜI"); a whole number of
 * the step rolls on the odometer, a small one shows one decimal.
 */
function CompactMoney({
  minor,
  digits,
  symbol,
  each,
}: {
  readonly minor: number;
  readonly digits: number;
  readonly symbol: string;
  readonly each: string;
}) {
  const locale = useLocale();
  const { scaled, unit } = compactStep(Math.abs(minor) / 10 ** digits);
  const prefix = upper(`${minor > 0 ? '+' : '−'}${symbol} `, locale);
  const suffix = `${unit} ${each}`;
  if (scaled >= 10 || unit === '') {
    return <Odometer value={Math.round(scaled)} prefix={prefix} suffix={suffix} variant="label" />;
  }
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(scaled);
  return <Text variant="label">{`${prefix}${number}${suffix}`}</Text>;
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
          <CompactMoney
            minor={money.minor}
            digits={money.digits}
            symbol={money.symbol}
            each={each}
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
