/**
 * A redraft of one day of a trip planned in day groups: the day is redone in its own group (that
 * area's places, that day's hours, its guide), on the group's days of the version it redoes, and
 * the result is put back under the trip's day numbers.
 */
import { tripDayOf, type DayGroup, type RedraftOutcome } from '@cp/ai';
import type { Itinerary } from '@cp/domain';

export interface ScopedRedraft {
  readonly group: DayGroup;
  /** The group's days of the base version, numbered 1…n as the group plans them. */
  readonly base: Itinerary;
  readonly dayNo: number;
  /** The outcome under the trip's day numbers, over the whole base version. */
  readonly back: (outcome: RedraftOutcome) => RedraftOutcome;
}

export function scopeRedraft(
  groups: readonly DayGroup[] | undefined,
  dayNo: number,
  base: Itinerary,
): ScopedRedraft | null {
  const group = groups?.find((g) => g.dayNos.includes(dayNo));
  if (groups === undefined || groups.length < 2 || group === undefined) return null;
  const local = (tripDay: number) => group.dayNos.indexOf(tripDay) + 1;
  const trip = (day: number) => tripDayOf(group, day);
  return {
    group,
    dayNo: local(dayNo),
    base: {
      ...base,
      days: base.days
        .filter((day) => group.dayNos.includes(day.day_no))
        .map((day) => ({ ...day, day_no: local(day.day_no) })),
    },
    back: (outcome) => {
      const redone = new Map(outcome.itinerary.days.map((day) => [trip(day.day_no), day]));
      return {
        ...outcome,
        day: { ...outcome.day, day_no: trip(outcome.day.day_no) },
        itinerary: {
          ...base,
          days: base.days.map((day) => {
            const now = redone.get(day.day_no);
            return now === undefined ? day : { ...now, day_no: day.day_no };
          }),
        },
        final: {
          ...outcome.final,
          violations: outcome.final.violations.map((v) => ({
            ...v,
            dayNo: v.dayNo === null ? null : trip(v.dayNo),
          })),
        },
        moved: outcome.moved.map((m) => ({ ...m, dayNo: trip(m.dayNo) })),
      };
    },
  };
}
