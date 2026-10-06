/**
 * The plan's days as the driver screens read them: each day's stops with their times, where it
 * starts (the stay), whether it needs a driver (`@cp/domain` pickup gaps, read from the day
 * itself), and the trip's area, party size and ride apps.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and table names. */
import { pickupGapFor, rideAppsFor, type GapStop, type PickupGap } from '@cp/domain';
import { useMemo } from 'react';

import { useLiveRows } from '@/features/bookings/data/live-rows';
import { useTripMapData } from '@/features/plan/trip-map/use-trip-map-data';

export interface DriverDay {
  readonly dayNo: number;
  readonly date: string;
  readonly theme: string | null;
  readonly stops: readonly GapStop[];
  readonly gap: PickupGap | null;
  /** First start to last end, `HH:MM`; null without times. */
  readonly window: { readonly start: string; readonly end: string } | null;
}

const hhmm = (minutes: number | null): string | null => {
  if (minutes === null) return null;
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

const TRIP_SQL = `SELECT d.country, d.name AS area, t.local_currency,
    (SELECT count(*) FROM trip_participants p WHERE p.trip_id = t.id AND p.holds_seat = 1) AS people
  FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id WHERE t.id = ?`;

interface TripRow {
  readonly country: string | null;
  readonly area: string | null;
  readonly local_currency: string | null;
  readonly people: number | null;
}

export function useDriverDays(tripId: string) {
  const data = useTripMapData(tripId);
  const { rows } = useLiveRows<TripRow>(TRIP_SQL, [tripId], [
    'trips',
    'destinations',
    'trip_participants',
  ]);
  const trip = rows[0] ?? null;
  const hasRideApp = rideAppsFor(trip?.country ?? null).length > 0;
  const days = useMemo<DriverDay[]>(
    () =>
      data.days
        .filter((day) => day.date !== null)
        .map((day) => {
          const stops: GapStop[] = day.stops
            .filter((stop) => stop.place !== null)
            .map((stop) => ({
              name: stop.title,
              lat: stop.place?.lat ?? 0,
              lng: stop.place?.lng ?? 0,
              starts: hhmm(stop.start),
              ends: hhmm(stop.end),
            }));
          const gap = pickupGapFor({ date: day.date ?? '', stops }, day.stay, hasRideApp);
          const starts = stops.map((s) => s.starts).filter((t): t is string => t !== null);
          const ends = stops.map((s) => s.ends ?? s.starts).filter((t): t is string => t !== null);
          return {
            dayNo: day.dayNo,
            date: day.date ?? '',
            theme: day.theme,
            stops,
            gap,
            window:
              starts.length > 0 && ends.length > 0
                ? { start: [...starts].sort()[0] ?? '', end: [...ends].sort().at(-1) ?? '' }
                : null,
          };
        }),
    [data.days, hasRideApp],
  );
  return {
    loaded: data.loaded,
    days,
    guide: data.guide,
    uid: data.plan.uid,
    area: trip?.area ?? '',
    people: Math.max(1, Number(trip?.people ?? 1)),
    currency: trip?.local_currency ?? null,
  };
}
