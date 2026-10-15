/**
 * The add-by-hand form's helpers (7.04): the trip's days for the day chips, and what the docked
 * Save says while something stops it.
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import type { DraftProblem } from '../../detail/form-model';

/** The trip's days, first to last, as `YYYY-MM-DD`. */
export function tripDays(trip: { readonly start: string; readonly end: string } | null): string[] {
  if (trip === null) return [];
  const out: string[] = [];
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a date at noon UTC, not copy
  const first = Date.parse(`${trip.start}T12:00:00Z`);
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a date at noon UTC, not copy
  const last = Date.parse(`${trip.end}T12:00:00Z`);
  for (let at = first; at <= last && out.length < 31; at += 86_400_000) {
    out.push(new Date(at).toISOString().slice(0, 10));
  }
  return out;
}

export function useMissingLabel() {
  const { t } = useLingui();
  return (problem: DraftProblem | undefined): string | null => {
    switch (problem) {
      case 'title':
        return t({ id: 'bookings.premium.missingTitleSave', message: 'Give it a name to save' });
      case 'date':
        return t({ id: 'bookings.premium.missingDate', message: 'Pick the day to save' });
      case 'time':
      case 'arrive':
        return t({ id: 'bookings.premium.missingTime', message: 'Fix the time to save' });
      case 'flight':
        return t({
          id: 'bookings.premium.missingFlight',
          message: 'Add the flight number to save',
        });
      case 'airports':
        return t({ id: 'bookings.premium.missingAirport', message: 'Fix the airport to save' });
      case undefined:
        return null;
    }
  };
}

/** A trip day (`YYYY-MM-DD`) as its chip and row say it: "Mon 12 Oct". */
export function tripDayLabel(locale: string, date: string): string {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a date at noon UTC, not copy
  return format.date(locale, new Date(`${date}T12:00:00Z`), {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}
