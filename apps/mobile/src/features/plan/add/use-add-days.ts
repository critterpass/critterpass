/**
 * The trip's dated days as Add to plan shows them: each named by its date ("SAT 17 OCT"), the
 * chips (weekday over date) with their fit dots, and the month the weather reasons name.
 */
import type { DayFit } from '@cp/domain';
import { useMemo } from 'react';

import { useEnsurePlanDays } from '@/data/plan/use-plan-days';
import type { TripPlan } from '@/data/plan/use-trip-plan';
import { dayName } from '@/features/plan/day/format';
import { dayTileColour } from '@/features/plan/overview/day-card';
import { chipWeekday, dayOfMonth } from '@/features/plan/trip-map/format';
import type { DayChip } from '@/ui/planning';

import type { AddDay } from './add-model';

export function useAddDays(plan: TripPlan, locale: string) {
  // An organiser adding to a trip that has dates and no plan yet: its days are asked for.
  useEnsurePlanDays(plan);
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
      weekday: chipWeekday(locale, entry.date),
      dateLabel: dayOfMonth(entry.date),
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
