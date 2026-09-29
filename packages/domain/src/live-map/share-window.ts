/**
 * The crew map sharing window (docs/product-decisions.md §4 "Crew live map"): only on trip days,
 * closing at midnight after the last day in the destination zone. The database gate
 * (`app.crew_map_open`) is the authority; this is the same rule for the device and the api so the
 * footer date, the timers and the "starts on" card agree with it.
 */
import { localSchedule } from '../time/local-schedule';

export interface ShareWindowTrip {
  readonly status: string;
  /** `YYYY-MM-DD`, first trip day, destination-local. */
  readonly startDate: string | null;
  /** `YYYY-MM-DD`, last trip day, destination-local. */
  readonly endDate: string | null;
  readonly tz: string | null;
}

export type ShareWindowState = 'open' | 'not_started' | 'ended' | 'unscheduled';

export interface ShareWindow {
  readonly state: ShareWindowState;
  /** Local midnight at the start of the first trip day. */
  readonly startsAt: Date | null;
  /** Local midnight after the last trip day: the share ends by itself here. */
  readonly endsAt: Date | null;
}

function nextDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

/** Local midnight after `endDate` in `tz`. */
export function shareWindowEnd(endDate: string, tz: string): Date {
  return localSchedule({ date: nextDay(endDate), time: '00:00', tz });
}

export function shareWindow(trip: ShareWindowTrip, now: Date): ShareWindow {
  if (trip.startDate === null || trip.endDate === null || trip.tz === null) {
    return { state: 'unscheduled', startsAt: null, endsAt: null };
  }
  const startsAt = localSchedule({ date: trip.startDate, time: '00:00', tz: trip.tz });
  const endsAt = shareWindowEnd(trip.endDate, trip.tz);
  if (
    now.getTime() >= endsAt.getTime() ||
    trip.status === 'post_trip' ||
    trip.status === 'archived'
  )
    return { state: 'ended', startsAt, endsAt };
  if (trip.status !== 'in_trip') return { state: 'not_started', startsAt, endsAt };
  return { state: 'open', startsAt, endsAt };
}
