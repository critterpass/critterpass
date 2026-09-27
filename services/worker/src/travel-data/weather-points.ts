/**
 * Which forecast points `weather.refresh` keeps warm: every destination with a confirmed, upcoming
 * (within 16 days) or running trip, the 0.1° cells of its outdoor plan-item places away from the
 * centroid, and whether its plans need sea conditions (boat items), now or while under way.
 */
import {
  gridPointKey,
  isMarineCategory,
  TRAVEL_DESTINATIONS,
  WEATHER_NEAR_ITEM_HOURS,
  type TravelDestination,
} from '@cp/domain';
import type pg from 'pg';

export interface WeatherPoint {
  readonly key: string;
  readonly lat: number;
  readonly lng: number;
}

export interface DestinationWeatherPlan {
  readonly destinationId: string;
  readonly travel: TravelDestination;
  readonly gridPoints: readonly WeatherPoint[];
  readonly outdoorSoon: boolean;
  readonly marineNeeded: boolean;
  readonly marineLive: boolean;
}

interface ActiveItemRow {
  readonly destination_id: string;
  readonly slug: string;
  readonly trip_status: string;
  readonly is_outdoor: boolean | null;
  readonly category: string | null;
  readonly starts_at: Date | null;
  readonly lat: number | null;
  readonly lng: number | null;
}

/** Destinations with a confirmed, upcoming (≤ 16 days) or running trip, and what their plans need. */
export async function selectWeatherPlans(
  tx: pg.PoolClient,
  now: Date,
): Promise<DestinationWeatherPlan[]> {
  const { rows } = await tx.query<ActiveItemRow>(
    `SELECT d.id AS destination_id, d.slug, t.status AS trip_status, pi.is_outdoor, pi.category,
            pi.starts_at, p.lat, p.lng
       FROM trips t
       JOIN destinations d ON d.id = t.destination_id
       LEFT JOIN plan_items pi ON pi.trip_id = t.id AND pi.version_id = t.current_version_id
       LEFT JOIN pois p ON p.id = pi.poi_id
      WHERE t.status IN ('confirmed', 'pre_trip', 'in_trip')
        AND d.slug = ANY ($2)
        AND (t.end_date IS NULL OR t.end_date >= ($1::timestamptz AT TIME ZONE 'UTC')::date - 1)
        AND (t.start_date IS NULL OR t.start_date <= ($1::timestamptz AT TIME ZONE 'UTC')::date + 16)`,
    [now, Object.keys(TRAVEL_DESTINATIONS)],
  );
  const plans = new Map<string, DestinationWeatherPlan & { grid: Map<string, WeatherPoint> }>();
  const soon = now.getTime() + WEATHER_NEAR_ITEM_HOURS * 3_600_000;
  for (const row of rows) {
    const travel = TRAVEL_DESTINATIONS[row.slug];
    if (travel === undefined) continue;
    const plan = plans.get(row.destination_id) ?? {
      destinationId: row.destination_id,
      travel,
      grid: new Map<string, WeatherPoint>(),
      gridPoints: [],
      outdoorSoon: false,
      marineNeeded: false,
      marineLive: false,
    };
    const startsSoon =
      row.starts_at !== null &&
      row.starts_at.getTime() >= now.getTime() - 3_600_000 &&
      row.starts_at.getTime() <= soon;
    const marine = isMarineCategory(row.category);
    const centroidKey = gridPointKey(travel.centroid.lat, travel.centroid.lng);
    if (row.is_outdoor === true && row.lat !== null && row.lng !== null) {
      const key = gridPointKey(row.lat, row.lng);
      if (key !== centroidKey && !plan.grid.has(key)) {
        plan.grid.set(key, {
          key,
          lat: Number(row.lat.toFixed(1)),
          lng: Number(row.lng.toFixed(1)),
        });
      }
    }
    plans.set(row.destination_id, {
      ...plan,
      outdoorSoon: plan.outdoorSoon || (row.is_outdoor === true && startsSoon),
      marineNeeded: plan.marineNeeded || marine,
      marineLive: plan.marineLive || (marine && row.trip_status === 'in_trip'),
    });
  }
  return [...plans.values()].map(({ grid, ...plan }) => ({
    ...plan,
    gridPoints: [...grid.values()],
  }));
}
