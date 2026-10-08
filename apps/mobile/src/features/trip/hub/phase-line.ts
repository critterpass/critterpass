/**
 * The hub header's phase line: the countdown before the trip or on a travel day (the one part of
 * the hub that reads the clock every second, and only while there is something to count to),
 * "Day 4 of 8" during it, "Home since Oct 19" after. Planning and a called-off trip have none.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';
import { useNow } from '@/lib/time/use-now';

import { countdownClock, type HubHeader } from './hub-model';

function day(locale: string, date: string, options: Intl.DateTimeFormatOptions): string {
  return format.date(locale, new Date(`${date}T12:00:00Z`), { timeZone: 'UTC', ...options });
}

/** The phase's label and value: the countdown, the day of the trip, or home since. */
export function usePhaseLine(
  header: HubHeader,
  fixedNow: Date | undefined,
): { label: string; value: string } | null {
  const locale = useLocale();
  const { t } = useLingui();
  // The one part of the hub that needs seconds, and only while there is something to count to.
  const counting = header.phase === 'pre' || header.phase === 'travel';
  const ticking = useNow(1000, { enabled: counting && fixedNow === undefined });
  const now = fixedNow ?? ticking;
  const dayUnit = t({ id: 'trip.hub.dayUnit', message: 'D' });
  if (header.phase === 'pre' || header.phase === 'travel') {
    const label =
      header.phase === 'pre'
        ? header.byAir
          ? t({ id: 'trip.hub.wheelsUp', message: 'Wheels up in' })
          : t({ id: 'trip.hub.leavingIn', message: 'Leaving in' })
        : header.target.getTime() === header.flight.departsAt.getTime()
          ? t({ id: 'trip.hub.takeOff', message: 'Take off in' })
          : t({ id: 'trip.hub.landIn', message: 'Land in' });
    return { label, value: countdownClock(header.target.getTime() - now.getTime(), dayUnit) };
  }
  if (header.phase === 'in') {
    const { day: dayNo, days } = header;
    return {
      label: t({ id: 'trip.hub.today', message: 'Today' }),
      value: t({ id: 'trip.hub.dayOf', message: `Day ${dayNo} of ${days}` }),
    };
  }
  if (header.phase === 'post') {
    return {
      label: t({ id: 'trip.hub.homeSince', message: 'Home since' }),
      value: day(locale, header.homeSince, { month: 'short', day: 'numeric' }),
    };
  }
  return null;
}
