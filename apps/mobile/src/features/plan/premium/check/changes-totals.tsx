/**
 * Review changes' totals (4.48): "+Rp 210K each", "+1h 20 driving" and "0 bookings moved" (mint
 * while nothing booked moves), each number rolling as rows are ticked or unticked.
 */
import { plural, t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { narrowCurrencySymbol } from '@cp/cost-engine';

import { useLocale } from '@/lib/i18n/use-locale';
import { NumberRoll, usePremiumTheme } from '@/ui/premium';

import { drivingChip } from '../../review/changes-copy';
import type { ReviewNumbers } from '../../review/model/review-numbers';

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

/** "+Rp 210K each": the share change, compact; one decimal under ten of a step. */
export function compactMoney(minor: number, currency: string, locale: string): string {
  const digits =
    new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  const { scaled, unit } = compactStep(Math.abs(minor) / 10 ** digits);
  const number =
    scaled >= 10 || unit === ''
      ? String(Math.round(scaled))
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(scaled);
  const sign = minor > 0 ? '+' : '−';
  const each = t({ id: 'plan.review.each', message: 'each' });
  return `${sign}${narrowCurrencySymbol(currency)} ${number}${unit} ${each}`;
}

function Chip(props: {
  readonly good?: boolean;
  readonly children: ReactNode;
  readonly testID: string;
}) {
  const theme = usePremiumTheme();
  return (
    <View
      testID={props.testID}
      style={{
        borderRadius: theme.radius.dayBadge,
        paddingHorizontal: theme.space.gap10,
        paddingVertical: theme.space.gap4,
        backgroundColor: props.good === true ? theme.accent.mint : theme.color.control,
      }}
    >
      {props.children}
    </View>
  );
}

export function PremiumChangesTotals({
  numbers,
  drivingMin,
}: {
  readonly numbers: ReviewNumbers | null;
  readonly drivingMin: number;
}) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const bookingsMoved = numbers?.bookingsMoved ?? 0;
  const driving = drivingChip(drivingMin);
  const money =
    numbers?.eachMinor == null || numbers.currency === null || numbers.eachMinor === 0
      ? null
      : compactMoney(numbers.eachMinor, numbers.currency, locale);
  const moved = t({
    id: 'plan.review.bookingsMovedCount',
    message: plural(bookingsMoved, { one: '# booking moved', other: '# bookings moved' }),
  });
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap8 }}
      testID="plan-review-totals"
    >
      {money === null ? null : (
        <Chip testID="plan-review-cost">
          <NumberRoll text={money} variant="badge" />
        </Chip>
      )}
      {driving === null ? null : (
        <Chip testID="plan-review-driving">
          <NumberRoll text={driving} variant="badge" />
        </Chip>
      )}
      <Chip good={bookingsMoved === 0} testID="plan-review-bookings">
        <NumberRoll
          text={moved}
          variant="badge"
          {...(bookingsMoved === 0 ? { color: theme.color.onAccent } : {})}
        />
      </Chip>
    </View>
  );
}
