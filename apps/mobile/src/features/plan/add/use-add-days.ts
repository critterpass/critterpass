/**
 * The trip's dated days as Add to plan shows them: each named by its date ("SAT, OCT 17"), the
 * chips with their fit dots, and the month the weather reasons name.
 */
import type { DayFit } from '@cp/domain';
import { useMemo } from 'react';

import type { TripPlan } from '@/data/plan/use-trip-plan';
import { dayName } from '@/features/plan/day/format';
import { dayTileColour, weekdayOf } from '@/features/plan/overview/day-card';
import type { DayChip } from '@/ui/planning';

import type { AddDay } from './add-model';

export function useAddDays(plan: TripPlan, locale: string) {
  const days: AddDay[] = useMemo(
    () =>
      plan.dayRows.flatMap((row) =>
        row.date === null ? [] : [{ dayNo: row.day_no, date: row.date }],
      ),
    [plan.dayRows],
  );
  const labelOf = (dayNo: number): string => {
    const date = days.find((entry) => entry.dayNo === dayNo)?.date;
    return date === undefined ? String(dayNo) : dayName(locale, date).toUpperCase();
  };
  const chips = (grades: ReadonlyMap<number, DayFit['grade']>): DayChip[] =>
    days.map((entry) => ({
      dayNo: entry.dayNo,
      weekday: weekdayOf(entry.date, locale),
      color: dayTileColour(entry.dayNo),
      fit: grades.get(entry.dayNo),
      accessibilityLabel: labelOf(entry.dayNo),
    }));
  const monthOf = (date: string): string =>
    new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(
      // Midday UTC keeps the calendar date in every zone.
      // eslint-disable-next-line lingui/no-unlocalized-strings
      new Date(`${date}T12:00:00Z`),
    );
  return { days, labelOf, chips, monthOf };
}
