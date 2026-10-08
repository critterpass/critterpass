/** Formatting the driver screens share: day labels and money in the driver's own currency. */
/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */
import { formatMoney, isKnownCurrency } from '@cp/cost-engine';
import { format } from '@cp/i18n';

/** "Wed 14" in the reader's language. */
export function dayLabel(date: string, locale: string): string {
  const at = new Date(`${date}T12:00:00Z`);
  const weekday = format.date(locale, at, { weekday: 'short', timeZone: 'UTC' });
  return `${weekday} ${String(at.getUTCDate())}`;
}

/** "Wed 14 Oct" for the post. */
export function dayMonthLabel(date: string, locale: string): string {
  return format.date(locale, new Date(`${date}T12:00:00Z`), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function money(
  minor: number | null,
  currency: string | null,
  locale: string,
): string | null {
  if (minor === null || currency === null) return null;
  const code: string = currency;
  if (!isKnownCurrency(code)) return `${currency} ${String(minor)}`;
  return formatMoney(
    { amountMinor: BigInt(Math.round(minor)), currency: code },
    { locale, mode: 'local' },
  );
}

/** "11½ hours" style figures stay numeric, with the reader's own decimal mark: "11.5", "11,5". */
export const hoursFigure = (hours: number, locale: string): string =>
  format.number(locale, hours, { maximumFractionDigits: 1 });
