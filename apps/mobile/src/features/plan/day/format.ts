/** Wall-clock, day and cost labels for the plan screens, in the reader's locale. */
import { format } from '@cp/i18n';
import { clockOption } from '@/lib/i18n/formats';

import { dateLine } from '../trip-map/format';

const MINUTES_PER_DAY = 24 * 60;

/** "07:00" for minutes after local midnight (an overnight minute wraps to the next morning). */
export function clock(locale: string, minutes: number): string {
  const inDay = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return format.time(
    locale,
    new Date(2000, 0, 1, Math.floor(inDay / 60), inDay % 60),
    clockOption(),
  );
}

export function clockRange(locale: string, start: number, end: number): string {
  return `${clock(locale, start)}–${clock(locale, end)}`;
}

/** "Wed Oct 14" for a local calendar date. */
export function dayDate(locale: string, date: string): string {
  const [year = 2000, month = 1, day = 1] = date.split('-').map(Number);
  return format.date(locale, new Date(year, month - 1, day), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * A day named by its date, the one way every plan screen, sheet and toast says it: "Tue 20 Oct",
 * and in Vietnamese (where the weekday is itself a number) "Th 3, 20/10".
 */
export function dayName(locale: string, date: string): string {
  return dateLine(locale, date);
}

/** "$38" for an amount in minor units. */
export function money(locale: string, amountMinor: number, currency: string): string {
  const digits =
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  return format.number(locale, amountMinor / 10 ** digits, {
    style: 'currency',
    currency,
    maximumFractionDigits: amountMinor % 10 ** digits === 0 ? 0 : digits,
  });
}
