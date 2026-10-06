/** Formatting the driver screens share: day labels and money in the driver's own currency. */
import { formatAmount } from '@/features/money/format';

/** "Wed 14" in the reader's language. */
export function dayLabel(date: string, locale: string): string {
  const at = new Date(`${date}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(at);
  return `${weekday} ${String(at.getUTCDate())}`;
}

/** "Wed 14 Oct" for the post. */
export function dayMonthLabel(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

export function money(minor: number | null, currency: string | null, locale: string): string | null {
  if (minor === null || currency === null) return null;
  return formatAmount(BigInt(Math.round(minor)), currency, locale);
}

/** "11½ hours" style figures stay numeric: "11.5". */
export const hoursFigure = (hours: number): string =>
  Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
