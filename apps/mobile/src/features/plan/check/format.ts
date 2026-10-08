/**
 * Small words and numbers the check screens share: a day's tag ("TUE 13", vi "T3 13") from the
 * app's own weekday names, drive time ("2H10", "1h05", "45 MIN"), compact money ("RP 60K"), the
 * local time of an instant, and how long ago the check ran.
 */
import { i18n } from '@lingui/core';
import { upper } from '@cp/i18n';
import { plural, t } from '@lingui/core/macro';

import { minutesOnDay } from '@/data/plan/plan-model';

/** Short weekday names from the app's own catalogue ("Wed", vi "T4"), Sunday first. */
export function shortWeekday(day: number): string {
  switch (day) {
    case 0:
      return t({ id: 'plan.check.weekday.sun', message: 'Sun' });
    case 1:
      return t({ id: 'plan.check.weekday.mon', message: 'Mon' });
    case 2:
      return t({ id: 'plan.check.weekday.tue', message: 'Tue' });
    case 3:
      return t({ id: 'plan.check.weekday.wed', message: 'Wed' });
    case 4:
      return t({ id: 'plan.check.weekday.thu', message: 'Thu' });
    case 5:
      return t({ id: 'plan.check.weekday.fri', message: 'Fri' });
    default:
      return t({ id: 'plan.check.weekday.sat', message: 'Sat' });
  }
}

/** `HH:MM` of an instant on a day in the trip's zone. */
export function clockAt(instant: string, tz: string, date: string): string {
  const minute = minutesOnDay(instant, tz, date);
  const wrapped = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/** "TUE 13" for a `YYYY-MM-DD` date; empty while the date is open. */
export function dayTag(date: string | null): string {
  if (date === null) return '';
  // eslint-disable-next-line lingui/no-unlocalized-strings -- an ISO time suffix, never copy.
  const at = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) return '';
  const weekday = upper(shortWeekday(at.getUTCDay()), i18n.locale || 'en');
  const day = String(at.getUTCDate());
  return t({ id: 'plan.check.dayTag', message: `${weekday} ${day}` });
}

/** The weekday of a date, in the app's own words ("Tuesday" reads as "Tue"). */
export function weekdayName(date: string | null): string {
  if (date === null) return '';
  // eslint-disable-next-line lingui/no-unlocalized-strings -- an ISO time suffix, never copy.
  const at = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(at.getTime()) ? '' : shortWeekday(at.getUTCDay());
}

/** Drive time in a title: "2H10", "45 MIN". */
export function driveTitle(minutes: number): string {
  const abs = Math.max(0, Math.round(minutes));
  const hours = String(Math.floor(abs / 60));
  const rest = String(abs % 60).padStart(2, '0');
  const mins = String(abs);
  if (abs < 60) return t({ id: 'plan.check.drive.titleMinutes', message: `${mins} MIN` });
  if (abs % 60 === 0) return t({ id: 'plan.check.drive.titleWhole', message: `${hours}H` });
  return t({ id: 'plan.check.drive.titleHours', message: `${hours}H${rest}` });
}

/** Drive time in a line: "1h05", "2h", "45 min". */
export function driveLine(minutes: number): string {
  const abs = Math.max(0, Math.round(minutes));
  const hours = String(Math.floor(abs / 60));
  const rest = String(abs % 60).padStart(2, '0');
  const mins = String(abs);
  if (abs < 60) return t({ id: 'plan.check.drive.lineMinutes', message: `${mins} min` });
  if (abs % 60 === 0) return t({ id: 'plan.check.drive.lineHours', message: `${hours}h` });
  return t({ id: 'plan.check.drive.lineHoursMinutes', message: `${hours}h${rest}` });
}

/** "RP 60K", "RP 1.2M", "€12": a price in the compact form the review's totals use. */
export function currencyDigits(currency: string, locale: string): number {
  return (
    new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

export function compactMoney(minor: number, currency: string, locale: string): string {
  const digits = currencyDigits(currency, locale);
  const major = Math.abs(minor) / 10 ** digits;
  const symbol = currency === 'IDR' ? 'RP' : currency === 'VND' ? '₫' : currency;
  const number = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: value >= 10 ? 0 : 1 }).format(value);
  if (major >= 1e6) {
    const value = number(major / 1e6);
    return t({ id: 'plan.check.money.million', message: `${symbol} ${value}M` });
  }
  if (major >= 1e3) {
    const value = number(major / 1e3);
    return t({ id: 'plan.check.money.thousand', message: `${symbol} ${value}K` });
  }
  const value = number(major);
  return t({ id: 'plan.check.money.plain', message: `${symbol} ${value}` });
}

/** "CHECKED JUST NOW", "CHECKED 5 MIN AGO", "CHECKED 2H AGO", "CHECKED 3 DAYS AGO". */
export function checkedAgo(checkedAt: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(checkedAt)) / 60_000));
  if (minutes < 1) return t({ id: 'plan.check.checkedNow', message: 'CHECKED JUST NOW' });
  if (minutes < 60) {
    return t({
      id: 'plan.check.checkedMinutes',
      message: plural(minutes, { one: 'CHECKED # MIN AGO', other: 'CHECKED # MIN AGO' }),
    });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return t({
      id: 'plan.check.checkedHours',
      message: plural(hours, { one: 'CHECKED #H AGO', other: 'CHECKED #H AGO' }),
    });
  }
  const days = Math.floor(hours / 24);
  return t({
    id: 'plan.check.checkedDays',
    message: plural(days, { one: 'CHECKED # DAY AGO', other: 'CHECKED # DAYS AGO' }),
  });
}
