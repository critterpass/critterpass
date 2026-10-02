/** The forecast screen's words (3k-7), read in the active language at render. */
/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */
import { format, upper } from '@cp/i18n';
import type { WatchStatus } from '@cp/domain';
import { t } from '@lingui/core/macro';

export function titleLines(locale: string): readonly [string, string] {
  return [
    upper(t({ id: 'trip.disruptions.forecast.titleTop', message: 'The rest' }), locale),
    upper(t({ id: 'trip.disruptions.forecast.titleBottom', message: 'of the trip' }), locale),
  ];
}

export const guideLine = () =>
  t({
    id: 'trip.disruptions.forecast.guideLine',
    message:
      'Weather, the sea, crowds and the volcano. I check every three hours and only ping you when it changes the plan.',
  });

export function checkedLabel(at: Date | null, tz: string, stale: boolean, locale: string): string {
  if (at === null)
    return upper(t({ id: 'trip.disruptions.forecast.checking', message: 'Checking' }), locale);
  const time = format.date(locale, at, {
    timeZone: tz,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  });
  return upper(
    stale
      ? t({ id: 'trip.disruptions.forecast.lastChecked', message: `Last checked ${time}` })
      : t({ id: 'trip.disruptions.forecast.checked', message: `Checked ${time}` }),
    locale,
  );
}

export function weekday(date: string, locale: string): string {
  return upper(
    format.date(locale, new Date(`${date}T12:00:00Z`), { timeZone: 'UTC', weekday: 'short' }),
    locale,
  );
}

export function dayLabel(date: string, locale: string): string {
  return format.date(locale, new Date(`${date}T12:00:00Z`), {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

export function hourLabel(at: string, tz: string, locale: string): string {
  return format.date(locale, new Date(at), {
    timeZone: tz,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const degrees = (tempC: number, locale: string) =>
  `${format.number(locale, Math.round(tempC))}°`;
export const percent = (value: number, locale: string) => `${format.number(locale, value)}%`;

export function statusLabel(status: WatchStatus, locale: string): string {
  switch (status) {
    case 'plan_b':
      return upper(t({ id: 'trip.disruptions.forecast.status.planB', message: 'Plan B' }), locale);
    case 'watching':
      return upper(
        t({ id: 'trip.disruptions.forecast.status.watching', message: 'Watching' }),
        locale,
      );
    case 'go':
      return upper(t({ id: 'trip.disruptions.forecast.status.go', message: 'Go' }), locale);
    case 'set':
      return upper(t({ id: 'trip.disruptions.forecast.status.set', message: 'Set' }), locale);
  }
}

export const forecastLines = () => ({
  section: t({ id: 'trip.disruptions.forecast.section', message: 'What could change the plan' }),
  allClear: t({
    id: 'trip.disruptions.forecast.allClear',
    message: 'All clear. Nothing on the plan is at risk.',
  }),
  stale: t({
    id: 'trip.disruptions.forecast.stale',
    message: "I couldn't check in the last three hours. This is the last I saw.",
  }),
  offline: t({
    id: 'trip.disruptions.forecast.offline',
    message: "You're offline. This is the last forecast on your phone.",
  }),
  noForecast: t({
    id: 'trip.disruptions.forecast.noForecast',
    message: 'No forecast yet. It shows up about two weeks before each day.',
  }),
  noHours: t({
    id: 'trip.disruptions.forecast.noHours',
    message: 'No hour-by-hour forecast for this day yet.',
  }),
  rain: t({ id: 'trip.disruptions.forecast.rain', message: 'Rain' }),
});
