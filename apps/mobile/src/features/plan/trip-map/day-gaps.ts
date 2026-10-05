/**
 * Free time on one day (7a-2 "FOUR OF YOU ARE FREE · till dinner"): the fit engine's gaps, worked
 * out on the phone from the day as synced, so the dashed slot shows offline and moves the moment
 * a stop does. Free time is not a hole to fill: a slot shows only when part of the crew is free
 * while the rest is busy, or when everyone has three hours or more between two stops. The morning
 * before the first stop and the evening after the last are the crew's own.
 */
/* eslint-disable lingui/no-unlocalized-strings -- day kinds, never copy. */
import { dayGaps, type FitContext, type FitDay, type FitItem } from '@cp/planner';

import { instantOnDay } from '@/data/plan/plan-model';

import type { TripDay } from './trip-days';

export interface FreeGap {
  readonly from: number;
  readonly to: number;
  readonly whoFree: readonly string[];
  /** Where the gap sits: after this stop (null before the first). */
  readonly afterStableId: string | null;
}

const DAY_FROM = 7 * 60;
const DAY_TO = 22 * 60;
/** Everyone free for less than this between two stops is breathing room, not a slot. */
const OPEN_WINDOW_MIN = 180;

/** Whether a free window is worth a slot on the day. */
export function showsGap(
  gap: { readonly from: number; readonly to: number; readonly whoFree: readonly string[] },
  crew: number,
  lastStopStart: number,
): boolean {
  if (gap.from >= lastStopStart) return false;
  if (gap.whoFree.length < crew) return true;
  return gap.to - gap.from >= OPEN_WINDOW_MIN;
}

function fitItems(day: TripDay): FitItem[] {
  if (day.date === null) return [];
  const date = day.date;
  return day.stops.flatMap((stop) =>
    stop.start === null || stop.end === null
      ? []
      : [
          {
            stableId: stop.stableId,
            poiId: stop.poiId,
            category: stop.category,
            startsAt: new Date(instantOnDay(date, stop.start, stop.tz)),
            endsAt: new Date(instantOnDay(date, stop.end, stop.tz)),
            attendeeIds: stop.attendeeIds,
            locked: stop.lock !== null,
            outdoor: false,
            point: stop.place,
          },
        ],
  );
}

export function freeGaps(day: TripDay, members: readonly string[], tz: string): FreeGap[] {
  if (day.date === null || members.length < 2 || day.stops.length === 0) return [];
  const fitDay: FitDay = {
    dayId: day.dayId ?? `day-${day.dayNo}`,
    dayNo: day.dayNo,
    date: day.date,
    kind: 'full',
    fromMin: DAY_FROM,
    toMin: DAY_TO,
    items: fitItems(day),
    stay: day.stay,
    rain: null,
    crowdFactor: 1,
  };
  const context: FitContext = { tz, participants: members, days: [fitDay], driveFactor: 1 };
  const first = Math.min(...day.stops.map((stop) => stop.start ?? DAY_TO));
  const last = Math.max(...day.stops.map((stop) => stop.start ?? 0));
  return dayGaps(context, fitDay)
    .filter((gap) => gap.fromMin >= first)
    .map((gap) => ({
      from: gap.fromMin,
      to: gap.toMin,
      whoFree: gap.gap.who_free,
      afterStableId: gap.prev?.stableId ?? null,
    }))
    .filter((gap) => showsGap(gap, members.length, last));
}
