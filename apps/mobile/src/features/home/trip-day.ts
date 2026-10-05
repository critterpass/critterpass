/**
 * Whether Home's trip is under way today, by the calendar and not by a status switch: from the
 * first day's midnight on the trip's own clock to the end of its last day, a locked-in trip is
 * "today · day n of N". A trip the server already marked in-trip counts too, with its day kept
 * inside the trip's length.
 */
/* eslint-disable lingui/no-unlocalized-strings -- statuses and date literals, never copy. */
import { toLocalWallTime, type HomeTripInput } from '@cp/domain';

import { tripIsLockedIn } from './slots';

export interface TripDay {
  /** 1 on the first day. */
  readonly day: number;
  readonly days: number;
  /** Today on the trip's clock, `YYYY-MM-DD`. */
  readonly today: string;
}

const dayIndex = (date: string): number => Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

export function tripDayOf(
  trip: Pick<HomeTripInput, 'status' | 'startDate' | 'endDate' | 'tz'>,
  now: Date,
): TripDay | null {
  if (trip.startDate === null || !tripIsLockedIn(trip.status)) return null;
  if (trip.status === 'post_trip' || trip.status === 'archived') return null;
  const tz = trip.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = toLocalWallTime(now, tz).date;
  const days = dayIndex(trip.endDate ?? trip.startDate) - dayIndex(trip.startDate) + 1;
  const day = dayIndex(today) - dayIndex(trip.startDate) + 1;
  if (trip.status === 'in_trip') return { day: Math.min(Math.max(day, 1), days), days, today };
  return day >= 1 && day <= days ? { day, days, today } : null;
}
