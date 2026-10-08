/**
 * Rain and crowds' words (7h-4): the headline ("RAIN AT 1, CROWDS AT 10"), the line that says where
 * each number comes from (the forecast or the month's usual rain; an editorial crowd curve is how
 * busy it usually gets, only visit counts are what crews saw), the recheck chip, and each swap's
 * reason.
 */
/* eslint-disable lingui/no-unlocalized-strings -- reason codes, never copy. */
import { upper } from '@cp/i18n';
import { plural, t } from '@lingui/core/macro';

/** An hour as people say it: "1" for 13:00 in English, "13" elsewhere. */
export function spokenHour(clock: string, locale: string): string {
  const hour = Number(clock.slice(0, 2));
  if (!locale.startsWith('en')) return String(hour);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return String(twelve);
}

export function rainTitle(rainAt: string | null, busyAt: string | null): string {
  if (rainAt !== null && busyAt !== null) {
    return t({
      id: 'plan.check.rain.titleBoth',
      message: `RAIN AT ${rainAt},\nCROWDS AT ${busyAt}`,
    });
  }
  if (rainAt !== null) return t({ id: 'plan.check.rain.titleRain', message: `RAIN AT ${rainAt}` });
  if (busyAt !== null)
    return t({ id: 'plan.check.rain.titleCrowds', message: `CROWDS AT ${busyAt}` });
  return t({ id: 'plan.check.rain.titleNone', message: 'DRY AND QUIET' });
}

export function sourceLine(input: {
  readonly month: string;
  readonly rain: 'forecast' | 'normals' | null;
  readonly crowds: 'visits' | 'editorial' | null;
  readonly guideName: string;
}): string {
  const { month, guideName } = input;
  const crowds =
    input.crowds === 'visits'
      ? t({
          id: 'plan.check.rain.sourceVisits',
          message: `Crowds are what crews saw here in ${month}.`,
        })
      : input.crowds === 'editorial'
        ? t({
            id: 'plan.check.rain.sourceEditorial',
            message: `Crowds are how busy it usually gets in ${month}.`,
          })
        : '';
  const rain =
    input.rain === 'forecast'
      ? t({ id: 'plan.check.rain.sourceForecast', message: 'Rain is from the forecast.' })
      : input.rain === 'normals'
        ? t({
            id: 'plan.check.rain.sourceNormals',
            message: `Rain is ${month}’s usual shower; ${guideName} checks the real forecast three days out.`,
          })
        : '';
  return [crowds, rain].filter((part) => part !== '').join(' ');
}

export function recheckChip(date: string, locale: string): string {
  const label = upper(
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
      new Date(`${date}T12:00:00Z`),
    ),
    locale,
  );
  return t({ id: 'plan.check.rain.recheck', message: `RECHECKS ${label}` });
}

export function forecastChip(): string {
  return t({ id: 'plan.check.rain.forecastChip', message: 'FROM THE FORECAST' });
}

export function reasonLine(
  reason: string,
  input: {
    readonly busyFrom: string | null;
    readonly rainFrom: string | null;
    readonly rainTo: string | null;
  },
): string {
  const busy = input.busyFrom ?? '';
  const from = input.rainFrom ?? '';
  const to = input.rainTo ?? '';
  switch (reason) {
    case 'quiet_before':
      return t({
        id: 'plan.check.rain.why.quietBefore',
        message: `Busy from ${busy}. You get there first.`,
      });
    case 'quiet_after':
      return t({ id: 'plan.check.rain.why.quietAfter', message: 'Quieter once the rush is over.' });
    case 'dry_after':
      return t({ id: 'plan.check.rain.why.dryAfter', message: `Dry by ${to}.` });
    case 'dry_before':
      return t({
        id: 'plan.check.rain.why.dryBefore',
        message: `Done before the rain at ${from}.`,
      });
    case 'indoors_in_rain':
      return t({
        id: 'plan.check.rain.why.indoors',
        message: 'Indoors while it rains. Free to move.',
      });
    default:
      return t({ id: 'plan.check.rain.why.trade', message: 'Trades places to make room.' });
  }
}

export function allSwapsLabel(count: number, organiser: boolean): string {
  // Every swap unticked: the button keeps the day, it does not "use all 0".
  if (count === 0) return t({ id: 'plan.check.rain.keepDay', message: 'KEEP THE DAY AS IT IS' });
  return organiser
    ? t({
        id: 'plan.check.rain.useAll',
        message: plural(count, { one: 'USE IT', other: 'USE ALL #' }),
      })
    : t({
        id: 'plan.check.rain.suggestAll',
        message: plural(count, { one: 'SUGGEST IT', other: 'SUGGEST ALL #' }),
      });
}
