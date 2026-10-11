/**
 * An expense's words both detail pages share: what a change touched ("the split") and the rate
 * line ("Rate 1 IDR = 0.000063 USD on Oct 14").
 */
import { format } from '@cp/i18n';
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';

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
