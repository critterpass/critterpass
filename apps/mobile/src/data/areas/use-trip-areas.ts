/**
 * A trip's areas for a screen: the switch, the stops and each day's area from synced rows, and the
 * links (how to get to a day trip, and the day trips each stop offers) from the api's kept answer.
 * A screen that draws a version of its own (an optimistic reorder, the organiser's draft) passes
 * that version's days; without them the days of the plan the reader sees are read here.
 */
import { useMemo } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';

import {
  AREA_DAYS_SQL,
  AREA_DAYS_TABLES,
  AREA_TRIP_SQL,
  AREA_TRIP_TABLES,
  AREAS_SWITCH_SQL,
  AREAS_SWITCH_TABLES,
  STOPS_SQL,
  STOPS_TABLES,
  switchOn,
  TRIP_AREAS_KEY,
  type AreaDayRow,
  type AreaTripRow,
  type StopRow,
} from './area-queries';
import { buildTripAreas, type TripAreas } from './trip-areas-model';
import { useAreaLinks } from './use-area-links';

/** Whether day trips and several stops are switched on for this account. */
export function useTripAreasOn(): boolean {
  const rows = useLiveRows<{ value: string | null }>(
    AREAS_SWITCH_SQL,
    [TRIP_AREAS_KEY],
    AREAS_SWITCH_TABLES,
  );
  return switchOn(rows.rows);
}

export function useTripAreas(
  tripId: string | null,
  days?: readonly AreaDayRow[],
): TripAreas & { readonly loaded: boolean } {
  const on = useTripAreasOn();
  const read = on && tripId !== null && tripId !== '';
  const trip = useLiveRows<AreaTripRow>(AREA_TRIP_SQL, read ? [tripId] : null, AREA_TRIP_TABLES);
  const stops = useLiveRows<StopRow>(STOPS_SQL, read ? [tripId] : null, STOPS_TABLES);
  const ownDays = useLiveRows<AreaDayRow>(
    AREA_DAYS_SQL,
    read && days === undefined ? [tripId] : null,
    AREA_DAYS_TABLES,
  );
  const destinationId = trip.rows[0]?.destination_id ?? null;
  const from = useMemo(
    () =>
      !on
        ? []
        : stops.rows.length > 0
          ? stops.rows.map((stop) => stop.destination_id)
          : destinationId === null
            ? []
            : [destinationId],
    [on, stops.rows, destinationId],
  );
  const links = useAreaLinks(from);
  return useMemo(
    () => ({
      ...buildTripAreas({
        on,
        destinationId,
        destinationName: trip.rows[0]?.destination_name ?? null,
        stops: stops.rows,
        days: days ?? ownDays.rows,
        links: links.links,
      }),
      loaded: !read || (trip.loaded && stops.loaded && links.loaded),
    }),
    [
      on,
      read,
      destinationId,
      trip.rows,
      trip.loaded,
      stops.rows,
      stops.loaded,
      days,
      ownDays.rows,
      links,
    ],
  );
}
