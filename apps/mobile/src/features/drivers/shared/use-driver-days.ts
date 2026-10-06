/**
 * The plan's days as the driver screens read them: each day's placed stops with their times,
 * whether it needs a driver (`@cp/domain` pickup gaps, read from the day itself), and the trip's
 * area, party size, currency and guide.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and table names. */
import { pickupGapFor, rideAppsFor, type GapStop, type PickupGap } from '@cp/domain';
import { useMemo } from 'react';

import { dayItems } from '@/data/plan/plan-model';
import { useTripPlan } from '@/data/plan/use-trip-plan';
import { isGuideStickerId } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';

import { gapStopsOf } from './gap-stops';
import { useLiveRows } from './use-live-rows';

export interface DriverDay {
  readonly dayNo: number;
  readonly date: string;
  readonly theme: string | null;
  readonly stops: readonly GapStop[];
  readonly gap: PickupGap | null;
  /** First start to last end, `HH:MM`; null without times. */
  readonly window: { readonly start: string; readonly end: string } | null;
}

const TRIP_SQL = `SELECT d.country, d.name AS area, t.local_currency,
    (SELECT count(*) FROM trip_participants p WHERE p.trip_id = t.id AND p.holds_seat = 1) AS people
  FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id WHERE t.id = ?`;
const TRIP_TABLES = ['trips', 'destinations', 'trip_participants'];

interface TripRow {
  readonly country: string | null;
  readonly area: string | null;
  readonly local_currency: string | null;
  readonly people: number | null;
}

function windowOf(stops: readonly GapStop[]): DriverDay['window'] {
  const starts = stops.map((s) => s.starts).filter((t): t is string => t !== null);
  const ends = stops.map((s) => s.ends ?? s.starts).filter((t): t is string => t !== null);
  const start = [...starts].sort()[0];
  const end = [...ends].sort().at(-1);
  return start === undefined || end === undefined ? null : { start, end };
}

export function useDriverDays(tripId: string) {
  const plan = useTripPlan(tripId);
  const { rows } = useLiveRows<TripRow>(TRIP_SQL, [tripId], TRIP_TABLES);
  const trip = rows[0] ?? null;
  const hasRideApp = rideAppsFor(trip?.country ?? null).length > 0;
  const tz = plan.trip?.tz ?? 'UTC';
  const days = useMemo<DriverDay[]>(
    () =>
      plan.dayRows.flatMap((row) => {
        if (row.date === null) return [];
        const stops = gapStopsOf(dayItems(plan.state, row.day_no, plan.display, tz));
        return [
          {
            dayNo: row.day_no,
            date: row.date,
            theme: row.theme,
            stops,
            gap: pickupGapFor({ date: row.date, stops }, null, hasRideApp),
            window: windowOf(stops),
          },
        ];
      }),
    [plan.dayRows, plan.state, plan.display, tz, hasRideApp],
  );
  const slug = plan.trip?.guide_slug ?? null;
  const guide: { readonly id: GuideId; readonly name: string } =
    slug !== null && isGuideStickerId(slug)
      ? { id: slug, name: plan.trip?.guide_name ?? 'Tokek' }
      : { id: 'tokek', name: 'Tokek' };
  return {
    loaded: plan.loaded,
    days,
    guide,
    uid: plan.uid,
    /** The crew's current plan version, which a change to it is drafted on; null before one. */
    baseVersion: plan.trip?.current_version_id ?? null,
    area: trip?.area ?? '',
    people: Math.max(1, Number(trip?.people ?? 1)),
    currency: trip?.local_currency ?? null,
  };
}
