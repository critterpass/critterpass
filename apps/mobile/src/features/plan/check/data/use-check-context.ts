/**
 * How the check screens name things: a stop by its place, a stop's times on its day, a day's date
 * by its id, a booking by its title, and dates and months in the reader's language. Synced rows
 * only.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { t } from '@lingui/core/macro';
import { useCallback, useMemo } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';
import type { TripPlan } from '@/data/plan/use-trip-plan';
import { useLocale } from '@/lib/i18n/use-locale';

import { clockAt, weekdayName } from '../format';
import type { IssueContext } from '../issue-copy';

const BOOKINGS_SQL = `SELECT id, title FROM bookings WHERE trip_id = ? AND deleted_at IS NULL`;
const BOOKINGS_TABLES = ['bookings'];

export function useCheckContext(plan: TripPlan): IssueContext {
  const locale = useLocale();
  const tripId = plan.trip?.id ?? null;
  const tz = plan.trip?.tz ?? 'UTC';
  const bookings = useLiveRows<{ id: string; title: string | null }>(
    BOOKINGS_SQL,
    tripId === null ? null : [tripId],
    BOOKINGS_TABLES,
  );
  const dayDate = useCallback(
    (dayId: string | null) => plan.dayRows.find((row) => row.id === dayId)?.date ?? null,
    [plan.dayRows],
  );
  const itemDate = useCallback(
    (stableId: string) => {
      const row = plan.itemRows.find((item) => item.stable_id === stableId);
      const date = plan.dayRows.find((day) => day.day_no === row?.day_no)?.date ?? null;
      return { row, date };
    },
    [plan.dayRows, plan.itemRows],
  );
  return useMemo<IssueContext>(
    () => ({
      name: (stableId) =>
        plan.display.get(stableId)?.title ?? t({ id: 'plan.check.aStop', message: 'a stop' }),
      startOf: (stableId) => {
        const { row, date } = itemDate(stableId);
        return row?.starts_at == null || date === null ? null : clockAt(row.starts_at, tz, date);
      },
      endOf: (stableId) => {
        const { row, date } = itemDate(stableId);
        return row?.ends_at == null || date === null ? null : clockAt(row.ends_at, tz, date);
      },
      dayDate,
      bookingTitle: (bookingId) => bookings.rows.find((row) => row.id === bookingId)?.title ?? null,
      month: (date) =>
        new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
          new Date(`${date}T12:00:00Z`),
        ),
      shortDate: (instant) =>
        new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: tz }).format(
          new Date(instant),
        ),
      weekday: weekdayName,
      clock: (instant, dayId) => {
        const date = dayDate(dayId);
        return date === null ? '' : clockAt(instant, tz, date);
      },
    }),
    [bookings.rows, dayDate, itemDate, locale, plan.display, tz],
  );
}
