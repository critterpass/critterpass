/**
 * Runs `watchForecast` after a forecast point is refreshed: for every active trip at the
 * destination, the plan items that point describes (items whose place lies in the point's 0.1°
 * cell, everything else on the centroid) are compared between the forecast before and after the
 * write, and material changes become one `forecast.changed` event per trip, in the same
 * transaction as the write. The same forecast twice changes nothing and emits nothing.
 */
import { appendDomainEvent } from '@cp/db';
import {
  CENTROID_POINT_KEY,
  gridPointKey,
  isMarineCategory,
  marineSnapshotBodySchema,
  toLocalWallTime,
  watchForecast,
  weatherSnapshotBodySchema,
  type MarineHour,
  type TravelDestination,
  type WatchedItem,
  type WeatherHour,
} from '@cp/domain';
import type pg from 'pg';

export interface PointForecast {
  readonly weather: readonly WeatherHour[];
  readonly marine: readonly MarineHour[];
}

/** Every stored hour for a point (all dates), as the watcher compares them. */
export async function readPointForecast(
  tx: pg.PoolClient,
  destinationId: string,
  pointKey: string,
): Promise<PointForecast> {
  const { rows } = await tx.query<{ hourly: unknown; marine: unknown }>(
    `SELECT hourly, marine FROM weather_snapshots
      WHERE destination_id = $1 AND point_key = $2 ORDER BY date`,
    [destinationId, pointKey],
  );
  return {
    weather: rows.flatMap((row) => weatherSnapshotBodySchema.parse(row.hourly).hours),
    marine: rows.flatMap((row) =>
      row.marine === null ? [] : marineSnapshotBodySchema.parse(row.marine).hours,
    ),
  };
}

interface ItemRow {
  readonly trip_id: string;
  readonly crew_id: string;
  readonly stable_id: string;
  readonly starts_at: Date;
  readonly ends_at: Date | null;
  readonly tz: string | null;
  readonly is_outdoor: boolean;
  readonly category: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
}

export async function emitForecastChanges(
  tx: pg.PoolClient,
  input: {
    readonly destinationId: string;
    readonly travel: TravelDestination;
    readonly pointKey: string;
    readonly before: PointForecast;
    readonly after: PointForecast;
  },
): Promise<number> {
  const { rows } = await tx.query<ItemRow>(
    `SELECT t.id AS trip_id, t.crew_id, pi.stable_id, pi.starts_at, pi.ends_at,
            coalesce(pi.tz, t.tz) AS tz, pi.is_outdoor, pi.category, p.lat, p.lng
       FROM trips t
       JOIN plan_items pi ON pi.trip_id = t.id AND pi.version_id = t.current_version_id
       LEFT JOIN pois p ON p.id = pi.poi_id
      WHERE t.destination_id = $1 AND t.status IN ('confirmed', 'pre_trip', 'in_trip')
        AND pi.starts_at IS NOT NULL
      ORDER BY t.id, pi.starts_at`,
    [input.destinationId],
  );
  const centroidCell = gridPointKey(input.travel.centroid.lat, input.travel.centroid.lng);
  const pointOf = (row: ItemRow) => {
    if (row.lat === null || row.lng === null) return CENTROID_POINT_KEY;
    const cell = gridPointKey(row.lat, row.lng);
    return cell === centroidCell ? CENTROID_POINT_KEY : cell;
  };

  const byTrip = new Map<string, { crewId: string; items: WatchedItem[] }>();
  for (const row of rows) {
    const marine = isMarineCategory(row.category);
    // Sea conditions live on the centroid rows, so boat items are watched there.
    if (pointOf(row) !== input.pointKey && !(marine && input.pointKey === CENTROID_POINT_KEY)) {
      continue;
    }
    const trip = byTrip.get(row.trip_id) ?? { crewId: row.crew_id, items: [] };
    trip.items.push({
      stable_id: row.stable_id,
      starts_at: row.starts_at.toISOString(),
      ends_at: row.ends_at?.toISOString() ?? null,
      local_date: toLocalWallTime(row.starts_at, row.tz ?? 'UTC').date,
      is_outdoor: row.is_outdoor && pointOf(row) === input.pointKey,
      is_marine: marine,
    });
    byTrip.set(row.trip_id, trip);
  }

  let events = 0;
  for (const [tripId, trip] of byTrip) {
    const result = watchForecast(
      {
        previousWeather: input.before.weather,
        nextWeather: input.after.weather,
        previousMarine: input.before.marine,
        nextMarine: input.after.marine,
      },
      trip.items,
    );
    if (result.changes.length === 0) continue;
    await appendDomainEvent(tx, {
      type: 'forecast.changed',
      aggregateKind: 'trip',
      aggregateId: tripId,
      actorKind: 'system',
      actorId: null,
      crewId: trip.crewId,
      tripId,
      payload: {
        trip_id: tripId,
        destination_id: input.destinationId,
        changes: [...result.changes],
        impact: result.impact,
      },
    });
    events += 1;
  }
  return events;
}
