/**
 * An expense's words both detail pages share: what a change touched ("the split") and the rate
 * line ("Rate 1 IDR = 0.000063 USD on Oct 14").
 */
import { format } from '@cp/i18n';
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';

import { clockText } from '@/lib/i18n/formats';

import { calendarDate } from '../format';
import type { EditField, FxLine } from './model';

export function useFieldLabel() {
  const { t } = useLingui();
  return (field: EditField) => {
    switch (field) {
      case 'amount':
        return t({ id: 'money.detail.field.amount', message: 'the amount' });
      case 'payer':
        return t({ id: 'money.detail.field.payer', message: 'who paid' });
      case 'split':
        return t({ id: 'money.detail.field.split', message: 'the split' });
      case 'what':
        return t({ id: 'money.detail.field.what', message: 'the name' });
      case 'category':
        return t({ id: 'money.detail.field.category', message: 'the category' });
      case 'when':
        return t({ id: 'money.detail.field.when', message: 'the date' });
    }
  };
}

export function rateText(locale: string, fx: FxLine | null): string | null {
  if (fx === null) return null;
  const rate = format.number(locale, fx.rate, { maximumSignificantDigits: 6 });
  const from = fx.from;
  const to = fx.to;
  const on =
    fx.asOf === null
      ? ''
      : format.date(locale, calendarDate(fx.asOf), {
          day: 'numeric',
          month: 'short',
          timeZone: 'UTC',
        });
  return on === ''
    ? t({ id: 'money.detail.rateNoDate', message: `Rate 1 ${from} = ${rate} ${to}` })
    : t({ id: 'money.detail.rate', message: `Rate 1 ${from} = ${rate} ${to} on ${on}` });
}

/**
 * An expense's day ("Thu, 15 Oct"): its trip-local date, the one Every expense files it under,
 * whatever zone the phone is in.
 */
export function expenseDayText(locale: string, localDate: string): string {
  const date = calendarDate(localDate);
  if (Number.isNaN(date.getTime())) return localDate;
  return format.date(locale, date, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** When a change was made ("15 Oct, 09:12"), on the trip's clock when it has a zone. */
export function changeStampText(locale: string, at: string, tz: string | null): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  const zone = tz ?? undefined;
  const day = format.date(locale, date, {
    day: 'numeric',
    month: 'short',
    ...(zone === undefined ? {} : { timeZone: zone }),
  });
  return `${day}, ${clockText(locale, date, zone)}`;
}
