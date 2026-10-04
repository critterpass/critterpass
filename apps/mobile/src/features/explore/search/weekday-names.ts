/**
 * Short weekday names in the app's own language ("Wed", "T4"), for the chips, the plan's note and
 * the fit lines: the phone's date formatting can fall back to English where the engine lacks the
 * locale's data, so the names come from the catalogue.
 */
import { t } from '@lingui/core/macro';

/** Sunday first, as `Date.getUTCDay()` counts. */
export function shortWeekday(day: number): string {
  switch (day) {
    case 0:
      return t({ id: 'search.weekday.sun', message: 'Sun' });
    case 1:
      return t({ id: 'search.weekday.mon', message: 'Mon' });
    case 2:
      return t({ id: 'search.weekday.tue', message: 'Tue' });
    case 3:
      return t({ id: 'search.weekday.wed', message: 'Wed' });
    case 4:
      return t({ id: 'search.weekday.thu', message: 'Thu' });
    case 5:
      return t({ id: 'search.weekday.fri', message: 'Fri' });
    default:
      return t({ id: 'search.weekday.sat', message: 'Sat' });
  }
}

/** The weekday of a `YYYY-MM-DD` date, or null. */
export function weekdayOfDate(date: string | null): string | null {
  if (date === null) return null;
  // eslint-disable-next-line lingui/no-unlocalized-strings -- an ISO time suffix, never copy.
  const at = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(at.getTime()) ? null : shortWeekday(at.getUTCDay());
}
