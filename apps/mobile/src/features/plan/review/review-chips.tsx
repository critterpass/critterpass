/**
 * The review's summary chips (3e-3): "+$22 EACH", "1 BOOKING MOVED", "0 MUST-DOS TOUCHED", each
 * number rolling as changes are kept or dropped. A touched must-do turns its chip pink.
 */
import { plural, t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { Odometer } from '@/ui/data/Odometer';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { ReviewNumbers } from './model/review-numbers';

const useStyles = makeStyles((th) => ({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space['8'] },
  chip: {
    borderRadius: th.radius.pill,
    paddingHorizontal: th.space['10'],
    paddingVertical: th.space['4'],
    backgroundColor: th.semantic.bg.control,
  },
}));

/** The currency's symbol and minor-unit digits in the reader's locale ("$", 2). */
export function currencyParts(
  currency: string,
  locale: string,
): { symbol: string; digits: number } {
  const format = new Intl.NumberFormat(locale, { style: 'currency', currency });
  const symbol =
    format.formatToParts(0).find((part) => part.type === 'currency')?.value ?? currency;
  return { symbol, digits: format.resolvedOptions().maximumFractionDigits ?? 2 };
}

function Chip({
  tone,
  children,
  testID,
}: {
  readonly tone: 'plain' | 'good' | 'alert';
  readonly children: ReactNode;
  readonly testID: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const background =
    tone === 'good'
      ? theme.semantic.state.success
      : tone === 'alert'
        ? theme.semantic.state.urgent
        : theme.semantic.bg.control;
  return (
    <View style={[styles.chip, { backgroundColor: background }]} testID={testID}>
      {children}
    </View>
  );
}

export function ReviewChips({ numbers }: { readonly numbers: ReviewNumbers }) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const onAccent = theme.semantic.text.onAccent;
  const { bookingsMoved, mustDosTouched } = numbers;
  const money =
    numbers.eachMinor === null || numbers.currency === null
      ? null
      : { minor: numbers.eachMinor, ...currencyParts(numbers.currency, locale) };
  const each = upper(t({ id: 'plan.review.each', message: 'each' }), locale);
  const moved = upper(
    t({
      id: 'plan.review.bookingsMoved',
      message: plural(bookingsMoved, { one: 'booking moved', other: 'bookings moved' }),
    }),
    locale,
  );
  const touched = upper(
    t({
      id: 'plan.review.mustDosTouched',
      message: plural(mustDosTouched, { one: 'must-do touched', other: 'must-dos touched' }),
    }),
    locale,
  );
  return (
    <View style={styles.row} testID="plan-review-chips">
      {money === null ? null : money.minor === 0 ? (
        <Chip tone="plain" testID="plan-review-cost">
          <Text variant="label">
            {upper(t({ id: 'plan.review.noCost', message: 'No cost change' }), locale)}
          </Text>
        </Chip>
      ) : (
        <Chip tone="plain" testID="plan-review-cost">
          <Odometer
            value={Math.round(Math.abs(money.minor) / 10 ** money.digits)}
            prefix={`${money.minor > 0 ? '+' : '−'}${money.symbol}`}
            suffix={` ${each}`}
            variant="label"
          />
        </Chip>
      )}
      <Chip tone="plain" testID="plan-review-bookings">
        <Odometer value={bookingsMoved} suffix={` ${moved}`} variant="label" />
      </Chip>
      <Chip tone={mustDosTouched === 0 ? 'good' : 'alert'} testID="plan-review-must-dos">
        <Odometer value={mustDosTouched} suffix={` ${touched}`} variant="label" color={onAccent} />
      </Chip>
    </View>
  );
}
