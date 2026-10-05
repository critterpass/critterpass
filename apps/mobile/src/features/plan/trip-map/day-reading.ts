/**
 * One day as the plan's own screens read it, for a screen outside the plan (day-of): each stop's
 * note in the reader's language, how long it takes, the travel to the next one, whether it is
 * over, on now or next, and what is this person's alone ("just me"). Day-of lays this over its own
 * timeline, so both screens say the same thing about the same day.
 */
import { useMemo } from 'react';

import { instantOnDay } from '@/data/plan/plan-model';
import { useTripPlan } from '@/data/plan/use-trip-plan';

import { clock } from '../day/format';
import { useSaidStops } from '../day/stop-check-in';
import { useDayRoute } from './day-route';
import { dayProgress, type StopMoment } from './next-stop';
import { buildStopRows, onlyYouDetail, personalDetail } from './stop-rows';
import { useTripDays } from './use-trip-map-data';

export interface DayStopReading {
  /** "1h30". */
  readonly length: string | null;
  /** "Car · 20 min", to the next stop. */
  readonly legAfter: string | null;
  /** Today only. */
  readonly moment: StopMoment | null;
  /** I skip this stop for myself. */
  readonly skipping: boolean;
  /** "You're skipping this" / "Only you", when the stop is mine alone in some way. */
  readonly personal: string | null;
}

export interface DayReading {
  /** The plan's day number for the date; null when the plan has no such day. */
  readonly dayNo: number | null;
  /** The day's stops as the day plan lists them, by stable id. */
  readonly stops: ReadonlyMap<string, DayStopReading>;
  /** A stop's note as this person reads it. */
  readonly notesOf: (stableId: string) => string | null | undefined;
  /** A stop's name as every plan screen shows it (`stopName`). */
  readonly titleOf: (stableId: string) => string | null | undefined;
  /** The stops only I have that day. */
  readonly mine: readonly {
    readonly id: string;
    readonly time: string;
    readonly title: string;
    readonly detail: string;
    readonly startsAt: Date;
    readonly poiId: string | null;
  }[];
}

export function useDayReading(
  tripId: string,
  localDate: string,
  now: Date,
  locale: string,
): DayReading {
  const plan = useTripPlan(tripId);
  const { days } = useTripDays(plan);
  const day = days.find((entry) => entry.date === localDate) ?? null;
  const route = useDayRoute(plan.versionId, day);
  const tz = plan.trip?.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  // The clock moves the marks once a minute, not once a second.
  const minute = Math.floor(now.getTime() / 60_000);
  const said = useSaidStops(tripId);
  return useMemo(() => {
    const rows =
      day === null
        ? []
        : buildStopRows({
            locale,
            day,
            after: route.after,
            gaps: [],
            members: plan.members,
            me: plan.uid,
            progress: dayProgress(day, new Date(minute * 60_000), tz, said),
          });
    const date = day?.date ?? null;
    return {
      dayNo: day?.dayNo ?? null,
      stops: new Map(
        rows.map((row) => [
          row.stop.stableId,
          {
            length: row.length ?? null,
            legAfter: row.legAfter,
            moment: row.moment,
            skipping: row.personal === 'skipping',
            personal: row.personal === null ? null : personalDetail(row.personal),
          },
        ]),
      ),
      notesOf: (stableId: string) => plan.display.get(stableId)?.notes,
      titleOf: (stableId: string) => plan.display.get(stableId)?.title,
      mine:
        day === null || date === null
          ? []
          : (day.mine ?? []).flatMap((stop) =>
              stop.start === null
                ? []
                : [
                    {
                      id: stop.stableId,
                      time: clock(locale, stop.start),
                      title: stop.title,
                      detail: onlyYouDetail(),
                      startsAt: new Date(instantOnDay(date, stop.start, stop.tz)),
                      poiId: stop.poiId,
                    },
                  ],
            ),
    };
  }, [day, route, locale, plan.members, plan.uid, plan.display, minute, tz, said]);
}
